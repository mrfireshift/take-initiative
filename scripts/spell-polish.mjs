// Il polishing degli incantesimi (docs/PIANO_POLISH_INCANTESIMI.md).
//
//   npm run polish:register
//     Aggiorna data/spell-polish-register.json: per ogni incantesimo che cosa trova oggi la prova sistematica. Conserva
//     ciò che è scritto a mano (reading, bench).
//
//   npm run polish:sheets -- --out <cartella fuori dal progetto> [--ids a,b,c]
//     Scrive le schede da leggere: testo delle regole e interpretazione del motore, fianco a fianco. Contengono i testi
//     privati dei manuali: per questo la cartella deve stare fuori dal repository.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { runSpellSweep, sweepCatalog, sweepFindings, SWEEP_DAMAGE, SWEEP_HEALING } = await import("../test-support/spellSweepHarness.js");
const srd = await import("../src/spells-srd.js");
const { getSpellAreaRules } = await import("../src/spellAreaRules.js");
const { buildArea } = await import("../src/aoeGeometryCore.js");
const { constrainedSpellAreaEnd, spellAreaGridCells } = await import("../src/spellAreaPlacementCore.js");
const { getSpellSaveWorkflowRule } = await import("../src/spellSaveWorkflowRules.js");
const { getSpellCastResolutionRule } = await import("../src/spellCastResolutionRules.js");
const { buildSpellUnifiedPanelContract } = await import("../src/spellUnifiedPanelCore.js");
const { readPrivateSpellTexts } = await import("./privateSources.mjs");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REGISTER = path.join(ROOT, "data", "spell-polish-register.json");
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(ROOT, relative), "utf8"));

function register() {
  const matrix = new Map(readJson("data/spell-implementation-status.json").rows.map((row) => [row.id, row]));
  const previous = fs.existsSync(REGISTER) ? JSON.parse(fs.readFileSync(REGISTER, "utf8")) : { spells: [] };
  const kept = new Map(previous.spells.map((entry) => [entry.id, entry]));
  return runSpellSweep().then((records) => {
    const findings = sweepFindings(records);
    const groupOf = (id) => {
      const row = matrix.get(id);
      if (String(row?.status).startsWith("COMPLETE")) return "automatizzato";
      if (row?.status === "NO AUTOMATION REQUIRED") return srd.isSpellCastRecordOnly(id) ? "registrazione" : "tracciato";
      if (row?.readiness === "RED") return "su-misura";
      if (row?.status === "REQUIRES RULE VERIFICATION") return "da-verificare";
      return "capacita";
    };
    const spells = sweepCatalog().map((spell) => {
      const id = spell.id;
      const definition = srd.getSpellDefinition(id);
      const before = kept.get(id);
      return {
        id,
        name: definition.displayName || definition.name,
        level: definition.level,
        group: groupOf(id),
        reading: before?.reading || { state: "da-leggere", lot: null, date: null, note: "" },
        sweep: {
          runs: records.filter((record) => record.id === id).length,
          findings: findings.filter((finding) => finding.id === id).map((finding) => finding.kind).sort(),
        },
        bench: before?.bench || { date: null, note: "" },
      };
    });
    fs.writeFileSync(REGISTER, `${JSON.stringify({
      schemaVersion: 1,
      plan: "docs/PIANO_POLISH_INCANTESIMI.md",
      legend: {
        reading: "A: il testo 2014 confrontato a mano con il motore. da-leggere, letto (nessun difetto) o corretto.",
        sweep: "B: i riscontri della prova sistematica (test-support/spellSweepHarness.js); le eccezioni note sono in test/spellCatalogSweep.test.js.",
        bench: "B: provato dal pannello vero al banco. La data e che cosa.",
      },
      spells,
    }, null, 2)}\n`, "utf8");
    const count = (pick) => spells.reduce((tally, entry) => { tally[pick(entry)] = (tally[pick(entry)] || 0) + 1; return tally; }, {});
    console.log(JSON.stringify({ spells: spells.length, groups: count((entry) => entry.group), reading: count((entry) => entry.reading.state), withFindings: spells.filter((entry) => entry.sweep.findings.length).length }));
  });
}

function textsById() {
  const withPrivate = (entry) => {
    const text = readPrivateSpellTexts(entry.privateSource || entry.source)?.[entry.privateTextId || entry.id];
    return { ...entry, description: text?.description || entry.description || "", higherLevels: text?.higherLevels || entry.higherLevels || "" };
  };
  return new Map([
    ...Object.values(readJson("src/spell-reference-it.json").spells).map((entry) => [entry.id, entry]),
    ...readJson("src/spells-supplements-runtime.json").spells.map((entry) => [entry.id, withPrivate(entry)]),
    ...readJson("src/spells-phb2014-extra.json").spells.map((entry) => [entry.id, withPrivate(entry)]),
  ]);
}

const expiryText = (expiry) => (expiry ? `${expiry.mode}${expiry.remaining ? `:${expiry.remaining}` : ""}${expiry.actor ? `/${expiry.actor}` : ""}` : "");
const reminderText = (reminder) => (Array.isArray(reminder) ? reminder : [reminder]).filter(Boolean).map((entry) => [
  entry.ability ? `TS ${entry.ability}` : entry.mode || "promemoria",
  entry.timing,
  entry.actor && entry.actor !== "target" ? `di ${entry.actor}` : "",
  entry.success ? `se supera: ${entry.success}` : "",
  entry.damage?.dice ? `${entry.damage.dice} ${entry.damage.type || ""}` : "",
  entry.label ? `«${entry.label}»` : "",
].filter(Boolean).join(" ")).join(" + ");
const ruleText = (rule) => [
  rule.condition,
  expiryText(rule.expiry),
  rule.saveReminder ? `[${reminderText(rule.saveReminder)}]` : "",
  rule.manualRemoval ? "rimovibile" : "",
  rule.parentRemoval ? `togliendola finisce: ${rule.parentRemoval}` : rule.endsParentOnRemoval ? "togliendola finisce l'incantesimo" : "",
  rule.effectDetail ? `«${rule.effectDetail}»` : "",
].filter(Boolean).join(" ");

// The shape the real geometry builds from the rule, on a grid of 1.5 m cells: to compare with the text.
function areaShapeFacts(rule) {
  const geometry = rule.geometry;
  if (!geometry?.shape) return "";
  const dpi = 100;
  const sizeCells = spellAreaGridCells(geometry.size);
  const start = geometry.shape === "cone" && rule.placement?.origin === "caster-adjacent"
    ? { x: 3000, y: 3050 }
    : ["line", "rectangle"].includes(geometry.shape)
      ? { x: 3050, y: 3050 }
      : { x: 3000, y: 3000 };
  const end = constrainedSpellAreaEnd({
    shape: geometry.shape,
    start,
    pointer: { x: start.x + dpi * sizeCells, y: start.y + (geometry.shape === "square" ? dpi * sizeCells : 0) },
    dpi,
    sizeCells,
    upTo: geometry.lengthUpTo === true,
  });
  const area = buildArea(geometry.shape, start, end, dpi, { x: 3000, y: 3000 }, {
    ...(geometry.metric === "grid" ? { metric: "grid", footprint: { widthCells: 1, heightCells: 1 } } : {}),
    widthSquares: geometry.width ? spellAreaGridCells(geometry.width) : undefined,
    widthAnchor: geometry.widthAnchor,
    ...(geometry.ring === true ? { ring: true, ringInnerSquares: Math.max(0, sizeCells - 1) } : {}),
  });
  const cells = area?.cells || [];
  if (!cells.length) return "nessuna casella";
  const meters = (pixels) => Math.round(pixels / dpi * 1.5 * 10) / 10;
  // A loop, not a spread: an area of a mile has too many cells to pass as arguments.
  const span = (pick, size) => {
    let min = Infinity;
    let max = -Infinity;
    for (const cell of cells) {
      min = Math.min(min, pick(cell));
      max = Math.max(max, pick(cell) + size(cell));
    }
    return meters(max - min);
  };
  return `${span((cell) => cell.x, (cell) => cell.width)}×${span((cell) => cell.y, (cell) => cell.height)} m, ${cells.length} rettangoli`;
}

function triggerFacts(trigger) {
  const damage = trigger.damage
    ? ` ${trigger.damage.dice} ${trigger.damage.type || ""} (TS ${trigger.damage.onSave}${trigger.damage.baseSlot ? `, +${trigger.damage.additionalPerSlotAbove || 0} per slot sopra il ${trigger.damage.baseSlot}°` : ""})`
    : "";
  const flags = [
    trigger.frequency,
    trigger.requiresOwnTurn === true ? "solo nel proprio turno" : trigger.requiresOwnTurn === false ? "anche fuori turno" : "",
    trigger.requiresCrossing ? "attraversando" : "",
    trigger.triggerOnAreaMove === true ? "anche se si muove la zona" : trigger.triggerOnAreaMove === false ? "non se si muove la zona" : "",
    trigger.requiresAreaMove ? "solo se si muove la zona" : "",
    trigger.targetArea ? `area ${trigger.targetArea}` : "",
    trigger.targetMode || "",
    trigger.persistsAfterExit ? "resta dopo l'uscita" : "",
    trigger.ruleChoice ? `scelta ${trigger.ruleChoice}` : "",
    trigger.resolutionData?.failureAutomation ? `al fallimento ${trigger.resolutionData.failureAutomation}` : "",
    trigger.resolutionData?.failureCondition?.condition ? `al fallimento ${trigger.resolutionData.failureCondition.condition}` : "",
  ].filter(Boolean).join(", ");
  return `${trigger.event} ${trigger.resolution}${trigger.ability ? ` ${trigger.ability}` : ""}${damage} [${flags}]${trigger.failureEffect ? ` «${trigger.failureEffect}»` : ""}`;
}

function sheetFor(spell, text, runs) {
  const id = spell.id;
  const definition = srd.getSpellDefinition(id);
  const contract = buildSpellUnifiedPanelContract({ spellId: id, castContext: { slotLevel: definition.level || null } });
  const lines = [`### ${definition.displayName || definition.name} (\`${id}\`), ${definition.level}°`];
  lines.push(text?.description
    ? `TESTO [${text.castingTime}; ${text.range}; ${text.duration}]: ${text.description.replace(/\s+/g, " ")}`
    : "TESTO: assente (senza la cartella privata o incantesimo legacy).");
  if (text?.higherLevels) lines.push(`SUPERIORI: ${text.higherLevels.replace(/\s+/g, " ")}`);
  lines.push(`MOTORE: corsia ${contract.execution?.lane}${contract.execution?.recordOnly ? " (solo registrazione)" : ""}; concentrazione ${definition.concentration}; turni ${definition.defaultTurns}; scadenza ${expiryText(definition.expiry) || "-"}; bersagli ${contract.presentation?.targeting?.mode} (massimo ${contract.presentation?.targeting?.limit?.maximum ?? "-"}); piazzamento ${contract.presentation?.placement?.policy}; PF ${contract.execution?.castHasHP}; TS mostrato ${contract.presentation?.outcomes?.save?.ability || "-"}; tipo di danno ${definition.damageType || "-"}`);
  if (definition.effects?.length) lines.push(`EFFETTI: ${definition.effects.map((effect) => `${effect.label}${effect.expiry ? ` [${expiryText(effect.expiry)}]` : ""}${effect.saveReminder ? ` [${reminderText(effect.saveReminder)}]` : ""}`).join(" | ")}`);
  const confirmReminders = Object.entries(definition.automation?.conditionOptions || {}).filter(([, options]) => options?.saveReminder);
  if (confirmReminders.length) lines.push(`PROMEMORIA DI TS: ${confirmReminders.map(([name, options]) => `${name}: ${reminderText(options.saveReminder)}`).join(" | ")}`);
  if (definition.saveAutomation) lines.push(`TS FALLITO: ${(definition.saveAutomation.failed || []).map(ruleText).join(" | ") || "-"}; SUPERATO: ${(definition.saveAutomation.passed || []).map(ruleText).join(" | ") || "-"}`);
  const workflow = getSpellSaveWorkflowRule(id);
  if (workflow) lines.push(`WORKFLOW: TS ${workflow.ability}; ${JSON.stringify(workflow.targeting || {})}`);
  if (definition.effectChoices?.length) lines.push(`VARIANTI EFFETTO: ${definition.effectChoices.map((choice) => `${choice.id}=${(choice.effects || []).map((effect) => effect.label).join("+")}`).join(" | ")}`);
  const areaChoices = srd.getAreaSaveRuleChoices(definition);
  if (areaChoices.length) lines.push(`VARIANTI AREA: ${areaChoices.map((choice) => `${choice.label}: ${(srd.getAreaSaveAutomation(id, choice.value)?.failed || []).map(ruleText).join("+") || "-"}`).join(" | ")}`);
  for (const rule of getSpellAreaRules(id)) {
    const triggers = rule.zonePolicy?.triggers || rule.triggerPolicy?.triggers || [];
    const membership = rule.zonePolicy?.membershipTargeting || rule.targeting || {};
    const membershipEffects = [
      ...(rule.zonePolicy?.membershipEffects || []),
      ...Object.values(rule.zonePolicy?.membershipEffectsByChoice || {}).flat(),
      ...(rule.effectPolicy?.effect ? [rule.effectPolicy.effect] : []),
    ];
    lines.push(`AREA ${rule.id}: ${rule.kind} ${rule.geometry?.shape} ${rule.geometry?.size?.value} ${rule.geometry?.size?.measure || ""}${rule.geometry?.width ? ` x ${rule.geometry.width.value}` : ""}; sagoma ${areaShapeFacts(rule)}; origine ${rule.placement?.origin || "-"}${rule.placement?.anchor ? `/${rule.placement.anchor}` : ""}; gittata ${rule.placement?.range?.value ?? "-"}; finisce con l'incantesimo ${rule.lifecycle?.endsWithSpell ?? "-"}; TS al lancio ${rule.zonePolicy?.initialResolution || "-"}; bersagli al lancio ${rule.targeting?.filter || "-"}, caster ${rule.targeting?.includeCaster ?? "-"}, conferma ${rule.targeting?.confirmTargets ?? "-"}`);
    lines.push(`  DENTRO: ${membership.filter || "all"}, caster ${membership.includeCaster ?? "-"}${membership.containment ? `, ${membership.containment}` : ", basta toccare"}${rule.zonePolicy?.membershipPaddingSquares ? `, +${rule.zonePolicy.membershipPaddingSquares} caselle` : ""}; effetti: ${membershipEffects.map((effect) => `${effect.condition || effect.label}${effect.mechanics ? ` ${JSON.stringify(effect.mechanics)}` : ""}`).join(" | ") || "-"}`);
    if (triggers.length) lines.push(`  PROMEMORIA: ${triggers.map(triggerFacts).join(" ; ")}`);
  }
  if (definition.activeActions?.length) lines.push(`AZIONI: ${definition.activeActions.map((action) => `${action.label} (${action.economy || "?"}, ${action.resolutionKind || "-"}${action.save?.ability ? `, TS ${action.save.ability}` : ""}${action.damage?.formula || action.damage?.dice ? `, ${action.damage.formula || action.damage.dice}${action.damage.baseSlot ? ` +${action.damage.additionalPerSlotAbove || 0} per slot sopra il ${action.damage.baseSlot}°` : ""} ${action.damage.type || ""}` : ""}${action.turnStartPrompt ? ", chiede a inizio turno" : ""}${action.detail ? ` «${action.detail}»` : ""})`).join(" | ")}`);
  if (definition.durationBySlot) lines.push(`DURATA PER SLOT: ${JSON.stringify(definition.durationBySlot.turnsBySlot)}`);
  if (definition.onSpellEnd) lines.push(`ALLA FINE: ${JSON.stringify(definition.onSpellEnd).slice(0, 240)}`);
  const attack = srd.getSpellAttackResolution(definition, "", { slotLevel: definition.level });
  if (attack) lines.push(`ATTACCO: ${JSON.stringify(attack.initialDamage)}; effetti ${(attack.effects || []).map((effect) => effect.label).join(", ") || "-"}`);
  const castRule = getSpellCastResolutionRule(id);
  if (castRule) lines.push(`REGOLA DI LANCIO: ${JSON.stringify(castRule)}`);
  const failed = runs.find((run) => run.outcome === "failed");
  const passed = runs.find((run) => run.outcome === "passed");
  if (failed?.hp) {
    const list = (entries) => JSON.stringify(entries.map((entry) => `${entry.item}: ${entry.name}${entry.expiry ? ` [${entry.expiry}]` : ""}`));
    lines.push(`ESEGUITO (${SWEEP_DAMAGE} danni, ${SWEEP_HEALING} cure, PF 40): fallito PF ${failed.hp.one}, superato PF ${passed?.hp?.one}; pill ${list(failed.pills)}; condizioni ${list(failed.conditions)}; concentrazione ${JSON.stringify(failed.concentrating)}; oggetti sulla scena ${failed.zones}`);
  } else if (failed) {
    lines.push(`ESEGUITO: ${JSON.stringify({ comando: failed.commandInvalid, rifiutato: failed.refused, eccezione: failed.thrown, stato: failed.status })}`);
  }
  return lines.join("\n");
}

async function sheets(args) {
  const outFlag = args.indexOf("--out");
  const idsFlag = args.indexOf("--ids");
  const out = outFlag >= 0 ? path.resolve(args[outFlag + 1] || "") : "";
  if (!out) throw new Error("Serve --out <cartella fuori dal progetto>.");
  if (!path.relative(ROOT, out).startsWith("..")) throw new Error("Le schede contengono testi privati: scegli una cartella fuori dal progetto.");
  const wanted = idsFlag >= 0 ? new Set(String(args[idsFlag + 1] || "").split(",").filter(Boolean)) : null;
  const spells = sweepCatalog().filter((spell) => !wanted || wanted.has(spell.id));
  const records = await runSpellSweep({ spellIds: spells.map((spell) => spell.id) });
  const texts = textsById();
  fs.mkdirSync(out, { recursive: true });
  const file = path.join(out, "schede-incantesimi.md");
  fs.writeFileSync(file, `${spells.map((spell) => sheetFor(spell, texts.get(spell.id), records.filter((record) => record.id === spell.id))).join("\n\n")}\n`, "utf8");
  console.log(`${spells.length} schede in ${file}`);
}

const [command, ...args] = process.argv.slice(2);
if (command === "register") await register();
else if (command === "sheets") await sheets(args);
else throw new Error("Comandi: register, sheets --out <cartella> [--ids a,b]");
process.exit(0);
