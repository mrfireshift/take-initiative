// Shothragoth S3 (profile v19): the Epic Action sequence (first/last of the round), Cucitura del Non-Luogo (a seam kept
// until the end of the round that blocks Il Corpo Non Era Qui) and Strappare la Cucitura (a line along that seam).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { importBossActionHTML, validateBossActionProfile } from "../src/bossActionProfileCore.js";
import { bossActionAreaRuleId, bossEpicSlot, bossGroupRequiresConfirmation, bossSeamRuleId, bossSequenceBlocker, bossSequenceWarning,
  buildBossActionGroupMutation, buildBossActionUse, buildBossResourceReset, buildBossSeamMutation } from "../src/bossActionExecutionCore.js";
import { bossActionExecutionKind, bossActionResultSummary, bossActionRowMeta, bossGroupRestrictions } from "../src/bossActionsViewCore.js";
import { constrainedSpellAreaEnd } from "../src/spellAreaPlacementCore.js";
import { getSpellAreaRuleById } from "../src/spellAreaRules.js";

const META = "com.thebigpicture.initiative/meta";
const html = await readFile(new URL("fixtures/boss-actions/shothragoth.html", import.meta.url), "utf8");
const auril = await importBossActionHTML(await readFile(new URL("fixtures/boss-actions/auril-phase-2.html", import.meta.url), "utf8"));
const profile = await importBossActionHTML(html);
const ability = (name) => profile.abilities.find((entry) => entry.name === name);
const cucitura = ability("Cucitura del Non-Luogo");
const strappare = ability("Strappare la Cucitura");
const corpo = ability("Il Corpo Non Era Qui");
const fauce = ability("Fauce Impossibile");
const creature = (id, hp, extra = {}) => ({ id, name: id, type: "IMAGE", layer: "CHARACTER", metadata: { [META]: { hp, hpMax: hp, inInitiative: true, ...extra } } });
const withState = (state) => creature("shothragoth", 406, { bossActionState: { version: 1, boundTokenId: "shothragoth", bossDefinitionId: "shothragoth",
  bossInstanceId: "boss-instance:shothragoth:shothragoth", ...state } });
const seam = { round: 2, actionId: cucitura.id, actionInstanceId: "boss-action:cucitura", start: { x: 0, y: 0 }, end: { x: 450, y: 0 }, lengthFeet: 45, itemIds: [] };
const state = (round, actionIds, extra = {}) => ({ epicLog: { round, actionIds }, ...extra });

test("Cucitura and Strappare as closed v19 data; the names they refer to are resolved inside the profile", async () => {
  assert.deepEqual([profile.profileVersion, profile.parserVersion], [21, 21]);
  assert.deepEqual(cucitura.sequence, { slot: "first" });
  assert.deepEqual(cucitura.execution, { kind: "seam", seam: { width: 5, maxLength: 60, range: 60, blocks: [corpo.id] } });
  assert.match(cucitura.manualText, /Terreno Difficile/);
  assert.deepEqual(strappare.sequence, { slot: "last", after: cucitura.id });
  assert.deepEqual(strappare.usage, { note: "Special Recharge" });
  assert.deepEqual(strappare.execution, { kind: "save-damage", save: { ability: "int", dc: 18 },
    target: { mode: "multiple", selection: "area", area: { shape: "seam", size: 20, origin: "Cucitura del Non-Luogo" } },
    damage: [{ id: "force", formula: "4d8", type: "force", printedAverage: 18 }, { id: "psychic", formula: "4d8", type: "psychic", printedAverage: 18 }],
    success: "half", onFailed: { conditions: [{ condition: "Prono", expiry: { mode: "manual" } }] } });
  assert.match(strappare.manualText, /spinto fino a 15 ft\. perpendicolarmente alla cucitura/);
  assert.equal(bossActionExecutionKind(cucitura), "seam");
  assert.equal(bossActionExecutionKind(strappare), "group-save");
  // The sequence replaces the manual "recharge and sequence verified" step of a Special Recharge.
  assert.equal(bossGroupRequiresConfirmation(strappare), false);
  assert.equal(bossGroupRequiresConfirmation(auril.abilities.find((entry) => entry.name === "Breath of the Long Night")), false, "v20: Auril's sequence too");
  assert.ok(!bossGroupRestrictions(strappare).some((line) => /Ricarica speciale/.test(line)));
  assert.equal(bossActionRowMeta(cucitura, {}).tag, "Cucitura fino a 60 ft · prima del round");
  assert.equal(bossActionRowMeta(strappare, {}).tag, "TS INT 18 · linea sulla cucitura 20 ft · ultima del round");
  assert.deepEqual(bossActionRowMeta(corpo, { tracked: true, available: false, remaining: 1, limit: 1, period: "round", sequenceBlocked: true }),
    { kind: "save-damage", tag: "TS DES 18", badge: "Bloccata", exhausted: true });
  assert.deepEqual(auril.abilities.filter((entry) => entry.sequence).map((entry) => entry.name),
    ["Breathe Deep", "Breath of the Long Night", "Rock", "Meteor Swarm", "Gather the Winter Sky"], "tranche 12: Auril's sequence");

  for (const [from, to, name] of [
    ["soltanto se è la prima Azione Epica che usa nel round. Sceglie", "soltanto se è l'ultima Azione Epica che usa nel round. Sceglie", "Cucitura del Non-Luogo"],
    ["Shothragoth non può usare Il Corpo Non Era Qui.", "Shothragoth non può usare Il Passo Inesistente.", "Cucitura del Non-Luogo"],
    ["ha usato Cucitura del Non-Luogo.", "ha usato Fauce Impossibile.", "Strappare la Cucitura"],
    ["Tiro Salvezza su Intelligenza: CD 18, ogni creatura nella Linea", "Tiro Salvezza su Carisma: CD 18, ogni creatura nella Linea", "Strappare la Cucitura"],
  ]) {
    assert.equal(html.split(from).length, 2, from);
    const changed = await importBossActionHTML(html.replace(from, to));
    const entry = changed.abilities.find((row) => row.name === name);
    assert.equal(entry.automation, "UNSUPPORTED", to);
    assert.equal(entry.sequence, undefined, to);
  }
  // Strappare refers to a seam: without it, it stays manual too.
  const noSeam = await importBossActionHTML(html.replace("prima Azione Epica che usa nel round. Sceglie", "prima Azione Epica del round. Sceglie"));
  assert.equal(noSeam.abilities.find((row) => row.name === "Strappare la Cucitura").automation, "UNSUPPORTED");
  for (const mutate of [
    (p) => { p.abilities.find((e) => e.name === "Cucitura del Non-Luogo").sequence.slot = "last"; },
    (p) => { p.abilities.find((e) => e.name === "Cucitura del Non-Luogo").execution.seam.blocks = ["cucitura-del-non-luogo"]; },
    (p) => { p.abilities.find((e) => e.name === "Strappare la Cucitura").sequence.slot = "first"; },
    (p) => { p.abilities.find((e) => e.name === "Strappare la Cucitura").sequence.after = "fauce-impossibile"; },
    (p) => { p.abilities.find((e) => e.name === "Strappare la Cucitura").sequence.after = "presenza-incompatibile"; },
    (p) => { p.abilities.find((e) => e.name === "Fauce Impossibile").sequence = { slot: "middle" }; },
    (p) => { p.abilities.find((e) => e.name === "Presenza Incompatibile").sequence = { slot: "first" }; },
    (p) => { Object.assign(p, { profileVersion: 18, parserVersion: 18 }); },
  ]) {
    const invalid = structuredClone(profile);
    mutate(invalid);
    assert.throws(() => validateBossActionProfile(invalid), /invalid|unexpected|unsupported|only an epic action/i);
  }
});

test("the slots of the round: one after each player character's turn; virtual ids and other creatures are not slots", () => {
  const pc = (id) => creature(id, 40, { attitude: "pc" });
  const items = [pc("dars"), pc("mira"), pc("sera"), creature("goblin", 7, { attitude: "enemy" })];
  const order = ["shothragoth", "dars", "__EPIC__:shothragoth:1", "goblin", "mira", "sera"];
  assert.deepEqual(bossEpicSlot({ order, current: 1 }, items), { total: 3, index: 1, last: false, after: "dars", remaining: ["mira", "sera"] });
  assert.deepEqual(bossEpicSlot({ order, current: 3 }, items), { total: 3, index: 1, last: false, after: "dars", remaining: ["mira", "sera"] }, "the goblin's turn follows Dars's slot");
  assert.deepEqual(bossEpicSlot({ order, current: 5 }, items), { total: 3, index: 3, last: true, after: "sera", remaining: [] });
  assert.deepEqual(bossEpicSlot({ order, current: 0 }, items), { total: 3, index: 0, last: false, after: "", remaining: ["dars", "mira", "sera"] });
  assert.equal(bossEpicSlot({ order, current: 1 }, [creature("goblin", 7)]), null, "no characters, no slots");
  assert.equal(bossEpicSlot({}, items), null);
  // Only "last" warns; "first" is a block from the round log.
  assert.match(bossSequenceWarning(strappare, bossEpicSlot({ order, current: 4 }, items)), /deve ancora agire sera/);
  assert.equal(bossSequenceWarning(strappare, bossEpicSlot({ order, current: 5 }, items)), "");
  assert.match(bossSequenceWarning(strappare, null), /Nessun personaggio/);
  assert.equal(bossSequenceWarning(cucitura, bossEpicSlot({ order, current: 1 }, items)), "");
});

test("the round log blocks Cucitura after another Epic Action, Strappare without the seam, Il Corpo while the seam exists", () => {
  const runtime = (value) => withState(value).metadata[META].bossActionState;
  assert.equal(bossSequenceBlocker(profile, cucitura, runtime({}), 2), "");
  assert.match(bossSequenceBlocker(profile, cucitura, runtime(state(2, [fauce.id])), 2), /prima Azione Epica del round: nel round 2 shothragoth|prima Azione Epica del round: nel round 2 Shothragoth/);
  assert.equal(bossSequenceBlocker(profile, cucitura, runtime(state(1, [fauce.id])), 2), "", "last round's log does not count");
  assert.match(bossSequenceBlocker(profile, strappare, runtime(state(2, [fauce.id])), 2), /richiede Cucitura del Non-Luogo nello stesso round/);
  assert.equal(bossSequenceBlocker(profile, strappare, runtime(state(2, [cucitura.id, fauce.id], { seam })), 2), "");
  assert.match(bossSequenceBlocker(profile, strappare, runtime(state(2, [cucitura.id])), 2), /La cucitura di Cucitura del Non-Luogo non c’è più/, "torn or undone");
  assert.match(bossSequenceBlocker(profile, corpo, runtime(state(2, [cucitura.id], { seam })), 2), /Finché la cucitura esiste, .* non può usare Il Corpo Non Era Qui/);
  assert.equal(bossSequenceBlocker(profile, corpo, runtime(state(2, [cucitura.id], { seam })), 3), "", "the seam collapses at the end of its round");
  assert.match(bossSequenceBlocker(profile, cucitura, runtime({}), undefined), /Round canonico non impostato/);
  assert.match(bossSequenceBlocker(auril, auril.abilities.find((entry) => entry.name === "Breath of the Long Night"), {}, 1), /richiede Breathe Deep/);
});

test("every Epic Action is logged in its round; a profile without sequences logs nothing; a reset clears the log and the seam", async () => {
  const use = buildBossActionUse({ profile, action: fauce, sourceItem: withState(state(2, [cucitura.id], { seam })), actionInstanceId: "boss-action:f", round: 2 });
  assert.deepEqual(use.runtimeState.epicLog, { round: 2, actionIds: [cucitura.id, fauce.id] });
  assert.deepEqual(use.sceneMetadataPreconditions, [{ key: "com.thebigpicture.initiative/state", field: "round", value: 2 }]);
  const next = buildBossActionUse({ profile, action: fauce, sourceItem: withState(state(1, [cucitura.id])), actionInstanceId: "boss-action:g", round: 2 });
  assert.deepEqual(next.runtimeState.epicLog, { round: 2, actionIds: [fauce.id] });
  assert.throws(() => buildBossActionUse({ profile, action: corpo, sourceItem: withState(state(2, [cucitura.id], { seam })), actionInstanceId: "boss-action:c", round: 2 }),
    /Finché la cucitura esiste/);
  // A profile without any sequence (Auril's phase 3) keeps no round log.
  const p3 = await importBossActionHTML(await readFile(new URL("fixtures/boss-actions/auril-phase-3.html", import.meta.url), "utf8"));
  const polar = p3.abilities.find((entry) => entry.name === "Polar Ray");
  const aurilUse = buildBossActionUse({ profile: p3, action: polar, sourceItem: creature("auril", 580), actionInstanceId: "boss-action:i", round: 1 });
  assert.equal(aurilUse.runtimeState.epicLog, undefined);
  assert.deepEqual(aurilUse.sceneMetadataPreconditions, []);
  const reset = buildBossResourceReset({ profile, sourceItem: withState(state(2, [cucitura.id], { seam })), actionInstanceId: "boss-action:reset", round: 2 });
  const after = reset.options.metadataPatches[0].fields.bossActionState.value;
  assert.equal(after.epicLog, undefined);
  assert.equal(after.seam, undefined);
});

test("Cucitura: the drawn seam is recorded for the round, up to 60 ft; Strappare follows it end to end and tears it", () => {
  const plan = buildBossSeamMutation({ profile, action: cucitura, sourceItem: withState({}), actionInstanceId: "boss-action:cucitura", round: 2,
    seam: { start: { x: 0, y: 0 }, end: { x: 450, y: 0 }, lengthFeet: 45, itemIds: ["boss-seam-1", "boss-seam-1-geometry"] } });
  assert.deepEqual(plan.operations, []);
  const recorded = plan.options.metadataPatches[0].fields.bossActionState.value;
  assert.deepEqual(recorded.seam, { round: 2, actionId: cucitura.id, actionInstanceId: "boss-action:cucitura", start: { x: 0, y: 0 }, end: { x: 450, y: 0 },
    lengthFeet: 45, itemIds: ["boss-seam-1", "boss-seam-1-geometry"] });
  assert.deepEqual(recorded.epicLog, { round: 2, actionIds: [cucitura.id] });
  assert.match(plan.options.label, /Cucitura del Non-Luogo · 45 ft fino alla fine del round/);
  assert.match(plan.manualText, /non può usare Il Corpo Non Era Qui/);
  assert.equal(bossActionResultSummary({ seam: { lengthFeet: 45 } }), "cucitura di 45 ft fino alla fine del round");
  assert.throws(() => buildBossSeamMutation({ profile, action: cucitura, sourceItem: withState({}), actionInstanceId: "x", round: 2,
    seam: { start: { x: 0, y: 0 }, end: { x: 650, y: 0 }, lengthFeet: 65 } }), /al massimo 60 ft/);
  assert.throws(() => buildBossSeamMutation({ profile, action: cucitura, sourceItem: withState({}), actionInstanceId: "x", round: 2, seam: null }), /Disegna la cucitura/);
  assert.throws(() => buildBossSeamMutation({ profile, action: cucitura, sourceItem: withState(state(2, [fauce.id])), actionInstanceId: "x", round: 2,
    seam: { start: { x: 0, y: 0 }, end: { x: 450, y: 0 }, lengthFeet: 45 } }), /prima Azione Epica/);

  const source = withState(state(2, [cucitura.id], { seam }));
  const tear = (start) => buildBossActionGroupMutation({ profile, action: strappare, sourceItem: source, targetItems: [creature("dars", 60), creature("mira", 45)],
    outcomes: { dars: "failed", mira: "passed" }, componentAmounts: { force: 18, psychic: 18 }, actionInstanceId: "boss-action:tear", round: 2,
    areaPlacement: { ruleId: "boss-action-area:seam:20ft", start, end: { x: 450, y: 0 }, areaTargetIds: ["dars", "mira"] } });
  const torn = tear({ x: 0, y: 0 });
  assert.deepEqual(torn.causality.targets.map((target) => [target.id, target.requestedDamage, target.conditions.map((entry) => entry.condition)]),
    [["dars", 36, ["Prono"]], ["mira", 18, []]]);
  const after = torn.options.metadataPatches[0].fields.bossActionState.value;
  assert.equal(after.seam, undefined, "the seam is torn");
  assert.deepEqual(after.epicLog.actionIds, [cucitura.id, strappare.id]);
  assert.throws(() => tear({ x: 150, y: 0 }), /non segue la cucitura/);
  assert.match(bossActionResultSummary({ groupTargets: [], seamTorn: true }), /Cucitura strappata/);
});

test("the area rules: a seam up to 60 ft, 5 ft wide; the tear line 20 ft wide on the given points", () => {
  assert.equal(bossSeamRuleId(cucitura.execution.seam), "boss-action-area:line:60ft:5ft");
  assert.equal(bossActionAreaRuleId(strappare.execution.target.area), "boss-action-area:seam:20ft");
  const line = getSpellAreaRuleById("boss-action-area:line:60ft:5ft");
  assert.deepEqual([line.geometry.shape, line.geometry.size.value, line.geometry.width.value, line.geometry.lengthUpTo, line.placement.origin],
    ["line", 18, 1.5, true, "point"]);
  assert.deepEqual([getSpellAreaRuleById("boss-action-area:seam:20ft").geometry.width.value], [6]);
  assert.equal(getSpellAreaRuleById("boss-action-area:line:62ft:5ft"), null);
  // "Up to": whole cells, never beyond the printed length; a fixed line keeps its full length.
  const end = (pointer, upTo) => constrainedSpellAreaEnd({ shape: "line", start: { x: 0, y: 0 }, pointer, dpi: 100, sizeCells: 12, upTo });
  assert.deepEqual(end({ x: 940, y: 0 }, true), { x: 900, y: 0 });
  assert.deepEqual(end({ x: 3000, y: 0 }, true), { x: 1200, y: 0 });
  assert.deepEqual(end({ x: 20, y: 0 }, true), { x: 100, y: 0 });
  assert.deepEqual(end({ x: 940, y: 0 }, false), { x: 1200, y: 0 });
});
