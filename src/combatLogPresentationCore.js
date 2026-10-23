import {
  aggregateCombatLogEvents,
} from "./combatLogCore.js";
import { normalizeCombatLogCausality } from "./combatLogCausalityCore.js";
import { normalizeCombatLogEventV3 } from "./combatLogV3Core.js";
import { DEATH_SAVE_OUTCOME_LABELS, deathSaveTallyText } from "./deathSaveCore.js";

export const COMBAT_LOG_CATEGORY_ORDER = Object.freeze([
  "hp",
  "attack",
  "spell",
  "save",
  "condition",
  "resource",
  "movement",
  "turn",
  "roster",
  "undo",
  "note",
  "other",
]);

const CATEGORY_META = Object.freeze({
  hp: Object.freeze({ label: "HP", tone: "#ef4444" }),
  attack: Object.freeze({ label: "Attacco", tone: "#f43f5e" }),
  spell: Object.freeze({ label: "Incantesimo", tone: "#a855f7" }),
  save: Object.freeze({ label: "Tiro salvezza", tone: "#f97316" }),
  condition: Object.freeze({ label: "Condizione", tone: "#ec4899" }),
  resource: Object.freeze({ label: "Risorsa", tone: "#14b8a6" }),
  movement: Object.freeze({ label: "Movimento", tone: "#22c55e" }),
  turn: Object.freeze({ label: "Turno", tone: "#3b82f6" }),
  roster: Object.freeze({ label: "Incontro", tone: "#06b6d4" }),
  undo: Object.freeze({ label: "Annullamento", tone: "#f59e0b" }),
  note: Object.freeze({ label: "Nota", tone: "#eab308" }),
  other: Object.freeze({ label: "Altro", tone: "#94a3b8" }),
});

const OUTCOME_LABELS = Object.freeze({
  passed: "Superato",
  pass: "Superato",
  success: "Confermato",
  succeeded: "Confermato",
  confirmed: "Confermato",
  failed: "Fallito",
  failure: "Fallito",
  hit: "Colpito",
  miss: "Mancato",
  critical: "Critico",
  immune: "Immune",
  resisted: "Resistito",
  resisted_successfully: "Resistito",
  ...DEATH_SAVE_OUTCOME_LABELS,
});

const NO_TURN_KEY = "__NO_TURN__";

function clone(value) {
  if (value === undefined) return undefined;
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
  if (value === null || typeof value !== "object") return value;
  return JSON.parse(JSON.stringify(value));
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positiveInteger(value, fallback = 1) {
  const number = finiteNumber(value);
  return number !== null && number > 0 ? Math.max(1, Math.round(number)) : fallback;
}

function numberText(value) {
  const number = finiteNumber(value);
  if (number === null) return "—";
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

function signedNumber(value) {
  const number = finiteNumber(value);
  if (number === null || number === 0) return "0";
  return number > 0 ? `+${numberText(number)}` : numberText(number);
}

function stringValue(value) {
  return String(value ?? "").trim();
}

function safeJson(value) {
  try {
    return JSON.stringify(value) || "";
  } catch {
    return "";
  }
}

export function normalizePresentationSearch(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("it-IT")
    .trim();
}

export function getCombatLogCategoryMeta(category) {
  const key = COMBAT_LOG_CATEGORY_ORDER.includes(String(category)) ? String(category) : "other";
  return CATEGORY_META[key];
}

function targetName(target) {
  if (typeof target === "string" || typeof target === "number") return String(target);
  return stringValue(target?.name || target?.targetName || target?.id || target?.instanceId) || "Bersaglio sconosciuto";
}

function targetId(target, index = 0) {
  return stringValue(target?.id || target?.tokenId || target?.targetId || target?.name) || `target-${index}`;
}

function uniqueByName(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = normalizePresentationSearch(item?.name || item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueTargets(items) {
  const seen = new Set();
  return items.filter((item) => {
    const id = stringValue(item?.id);
    const name = normalizePresentationSearch(item?.name);
    const key = id ? `id:${id}` : `name:${name}`;
    if (!name && !id) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function eventCausality(event) {
  const payload = event?.payload && typeof event.payload === "object" ? event.payload : {};
  const legacy = payload.causality && typeof payload.causality === "object"
    ? normalizeCombatLogCausality(payload.causality)
    : null;
  const provenance = event?.provenance && typeof event.provenance === "object"
    ? event.provenance
    : {};
  const actor = provenance.actor && typeof provenance.actor === "object"
    ? clone(provenance.actor)
    : null;
  const cause = provenance.cause && typeof provenance.cause === "object"
    ? clone(provenance.cause)
    : null;
  if (!legacy && !actor && !cause) return null;
  return {
    ...(legacy || { version: 1, domain: "spell" }),
    ...(actor && !legacy?.actor ? { actor } : {}),
    ...(cause
      ? { cause: { ...(legacy?.cause || {}), ...cause } }
      : {}),
  };
}

function mergePresentationTargets(event, causality) {
  const targets = [];
  const byKey = new Map();
  const add = (target, index) => {
    const normalized = {
      id: targetId(target, index),
      name: targetName(target),
      ...(typeof target === "object" && target !== null ? clone(target) : {}),
    };
    const key = normalized.id
      ? `id:${normalized.id}`
      : `name:${normalizePresentationSearch(normalized.name)}`;
    if (!key || key === "name:") return;
    const previousIndex = byKey.get(key);
    if (previousIndex === undefined) {
      byKey.set(key, targets.length);
      targets.push(normalized);
      return;
    }
    targets[previousIndex] = {
      ...targets[previousIndex],
      ...normalized,
      name: targets[previousIndex].name || normalized.name,
    };
  };
  for (const [index, target] of (Array.isArray(event?.targets) ? event.targets : []).entries()) {
    add(target, index);
  }
  for (const [index, target] of (Array.isArray(causality?.targets) ? causality.targets : []).entries()) {
    add(target, index + targets.length);
  }
  return targets;
}

function turnContext(event) {
  const context = event?.turnContext && typeof event.turnContext === "object"
    ? event.turnContext
    : null;
  if (context) {
    const id = stringValue(context.activeId);
    const name = stringValue(context.activeName);
    const explicitKey = stringValue(context.turnKey);
    if (id || name || explicitKey) {
      const turnName = name || id || "Contesto turno non disponibile";
      return {
        turnKey: explicitKey ? `turn:${explicitKey}` : `turn:${id || name}`,
        turnName,
        turn: event?.turn && typeof event.turn === "object"
          ? clone(event.turn)
          : (id || name ? { id: id || null, name: name || null } : null),
        turnContext: {
          activeId: id || null,
          activeName: name || null,
          turnIndex: finiteNumber(context.turnIndex),
          turnKey: explicitKey || null,
          orderRevision: finiteNumber(context.orderRevision),
        },
      };
    }
  }
  const turn = event?.turn && typeof event.turn === "object" ? event.turn : null;
  const id = stringValue(turn?.id);
  const name = stringValue(turn?.name);
  if (!id && !name) {
    return {
      turnKey: NO_TURN_KEY,
      turnName: "Fuori turno",
      turn: null,
      turnContext: {
        activeId: null,
        activeName: null,
        turnIndex: null,
        turnKey: null,
        orderRevision: null,
      },
    };
  }
  const turnKey = `turn:${id || name}`;
  const turnName = name || id || "Contesto turno non disponibile";
  return {
    turnKey,
    turnName,
    turn: clone(turn),
    turnContext: {
      activeId: id || null,
      activeName: name || null,
      turnIndex: null,
      turnKey: null,
      orderRevision: null,
    },
  };
}

function collectionItemName(item, field) {
  if (typeof item === "string" || typeof item === "number") return String(item);
  return stringValue(
    item?.displayLabel
      || item?.name
      || item?.condition
      || item?.spellName
      || item?.label
      || item?.id
      || item?.instanceId
      || (field === "concentrations" ? item?.key : "")
  ) || (field === "concentrations" ? "Concentrazione senza nome" : "Elemento senza nome");
}

function facetItemText(item, field) {
  return collectionItemName(item, field);
}

function facetChangeLines(facet, field) {
  const lines = [];
  const targets = Array.isArray(facet?.targets) ? facet.targets : [];
  for (const target of targets) {
    const prefix = targetName(target);
    for (const item of Array.isArray(target.added) ? target.added : []) {
      lines.push(`${prefix}: + ${facetItemText(item, field)}`);
    }
    for (const item of Array.isArray(target.removed) ? target.removed : []) {
      lines.push(`${prefix}: − ${facetItemText(item, field)}`);
    }
    for (const item of Array.isArray(target.updated) ? target.updated : []) {
      const before = facetItemText(item.before, field);
      const after = facetItemText(item.after, field);
      lines.push(`${prefix}: ↻ ${before} → ${after}`);
    }
  }
  return lines;
}

function hpTargetLine(target) {
  const before = target?.before || {};
  const after = target?.after || {};
  const beforeHp = finiteNumber(before.hp);
  const afterHp = finiteNumber(after.hp);
  const beforeHpMax = finiteNumber(before.hpMax);
  const afterHpMax = finiteNumber(after.hpMax);
  const delta = finiteNumber(target?.delta)
    ?? (beforeHp !== null && afterHp !== null ? afterHp - beforeHp : null);
  const hpMaxDelta = finiteNumber(target?.hpMaxDelta)
    ?? (beforeHpMax !== null && afterHpMax !== null ? afterHpMax - beforeHpMax : null);
  const name = targetName(target);
  const deltaText = delta === null ? "?" : signedNumber(delta);
  const line = `${name}: ${numberText(before.hp)}/${numberText(before.hpMax)} → ${numberText(after.hp)}/${numberText(after.hpMax)} (${deltaText} HP)`;
  return hpMaxDelta === null || hpMaxDelta === 0
    ? line
    : `${line}; HP max ${signedNumber(hpMaxDelta)}`;
}

function hpTargets(event) {
  const facetTargets = event?.facets?.hp?.targets;
  if (Array.isArray(facetTargets) && facetTargets.length) return facetTargets;
  return Array.isArray(event?.targets) ? event.targets.filter((target) => target?.before || target?.after) : [];
}

// Death saving throws (the deathSaves facet): the tally after the command, by creature.
function deathSaveLines(event, targets = []) {
  const rows = Array.isArray(event?.facets?.deathSaves?.targets) ? event.facets.deathSaves.targets : [];
  if (!rows.length) return [];
  const names = new Map([
    ...targets,
    ...(Array.isArray(event?.targets) ? event.targets : []),
    ...hpTargets(event),
    ...(Array.isArray(event?.facets?.conditions?.targets) ? event.facets.conditions.targets : []),
  ].map((target) => [stringValue(target?.id), stringValue(target?.name)]).filter(([id, name]) => id && name));
  return rows.map((row) => {
    const name = stringValue(row?.targetName) || names.get(stringValue(row?.targetId)) || "Creatura";
    return row?.after ? `${name}: ${deathSaveTallyText(row.after)}` : `${name}: conteggio azzerato`;
  });
}

function positionText(position) {
  if (!position || typeof position !== "object") return "posizione sconosciuta";
  const x = finiteNumber(position.x);
  const y = finiteNumber(position.y);
  return x === null || y === null ? "posizione sconosciuta" : `(${numberText(x)}, ${numberText(y)})`;
}

function movementFacetLines(event) {
  const movement = event?.facets?.movement;
  if (!movement || !Array.isArray(movement.targets)) return [];
  return movement.targets.map((target) => {
    const name = targetName(target);
    const from = positionText(target?.from);
    const to = positionText(target?.to);
    const cells = finiteNumber(target?.cells);
    const distance = cells === null ? "" : ` · ${numberText(cells)} caselle`;
    return `${name}: ${from} → ${to}${distance}`;
  });
}

function initiativeCardDiffLines(event) {
  const facet = event?.facets?.initiativeCard;
  const diffs = Array.isArray(facet?.diffs)
    ? facet.diffs
    : facet?.diff
      ? [facet.diff]
      : [];
  return diffs.flatMap((diff) => (Array.isArray(diff?.changedFields) ? diff.changedFields : [])
    .map((field) => {
      const before = diff?.before && Object.prototype.hasOwnProperty.call(diff.before, field)
        ? safeJson(diff.before[field])
        : "non disponibile";
      const after = diff?.after && Object.prototype.hasOwnProperty.call(diff.after, field)
        ? safeJson(diff.after[field])
        : "non disponibile";
      return `${field}: ${before} → ${after}`;
    }));
}

function outcomeLabel(value) {
  const raw = stringValue(value);
  if (!raw) return "";
  return OUTCOME_LABELS[raw.toLocaleLowerCase("it-IT")] || raw;
}

function reminderResolutionParts(event) {
  const payload = event?.payload && typeof event.payload === "object" ? event.payload : {};
  const replay = payload.replay && typeof payload.replay === "object" ? payload.replay : {};
  const warning = replay.warning && typeof replay.warning === "object" ? replay.warning : {};
  const notice = warning.notice && typeof warning.notice === "object" ? warning.notice : {};
  const resolution = payload.resolution && typeof payload.resolution === "object"
    ? payload.resolution
    : (notice.resolution && typeof notice.resolution === "object" ? notice.resolution : {});
  return { payload, replay, warning, notice, resolution };
}

function meaningfulReminderName(...values) {
  for (const value of values) {
    const name = stringValue(value);
    if (!name) continue;
    const normalized = name.toLocaleLowerCase("it-IT").replace(/\s+/gu, " ");
    if (!["incantesimo", "promemoria", "tiro salvezza"].includes(normalized)) return name;
  }
  return "";
}

function hasConcentrationResolutionAction(resolution) {
  return Object.values(resolution?.outcomes || {}).some((outcome) =>
    Array.isArray(outcome?.actions)
      && outcome.actions.some((action) => String(action?.kind || "").trim().toLowerCase() === "concentration")
  );
}

function reminderResolutionType(event) {
  if (String(event?.kind || "") !== "reminder-resolution") return "";
  const { payload, replay, notice, resolution } = reminderResolutionParts(event);
  const activationKind = String(
    resolution?.activation?.kind
      || notice?.resolution?.activation?.kind
      || payload?.activation?.kind
      || "",
  ).trim().toLowerCase();
  // A death saving throw is no spell: its own type (deathSaveCore.js).
  if (payload.deathSave || resolution?.mode === "death-save" || activationKind === "death-save"
    || /:death-save:/u.test(stringValue(payload.activationId))) return "death-save";
  const causality = payload.causality && typeof payload.causality === "object"
    ? payload.causality
    : {};
  if (
    activationKind === "concentration-save"
    || replay.type === "concentration-warning"
    || causality.concentration
    || hasConcentrationResolutionAction(resolution)
  ) return "concentration";

  const outcome = stringValue(payload.outcome).toLocaleLowerCase("it-IT");
  const hasSaveOutcome = ["passed", "failed", "immune"].includes(outcome);
  const hasAreaMarker = activationKind === "zone" || Boolean(causality.zone);
  if (hasAreaMarker && (hasSaveOutcome || !outcome || notice.kind === "zone")) {
    return "area-save";
  }

  const cause = causality.cause && typeof causality.cause === "object" ? causality.cause : {};
  const hasSpellEvidence = Boolean(
    payload.spellName
    || payload.spellId
    || payload.spell?.name
    || cause.spellId
    || cause.spellName
    || Object.prototype.hasOwnProperty.call(cause, "slotLevel")
    || notice.spellName
    || replay.warning?.spellName
    || ["effect-save", "effect-reminder", "zone", "zone-effect"].includes(String(notice?.kind || ""))
    || activationKind === "zone"
  );
  return hasSpellEvidence ? "spell" : "";
}

function reminderResolutionSpellName(event) {
  const { payload, warning, notice } = reminderResolutionParts(event);
  const causality = payload.causality && typeof payload.causality === "object"
    ? payload.causality
    : {};
  return meaningfulReminderName(
    payload.spellName,
    payload.spell?.name,
    causality.cause?.spellName,
    warning.spellName,
    notice.spellName,
  );
}

function reminderResolutionTitle(event, fallback) {
  const type = reminderResolutionType(event);
  if (!type) return fallback;
  const outcome = outcomeLabel(event?.payload?.outcome);
  if (type === "death-save") {
    const result = {
      stable: "Stabile",
      dead: "Morto",
      revived: "Torna a 1 PF",
    }[stringValue(event?.payload?.deathSave?.result)] || "";
    return ["TS contro la morte", outcome, result].filter(Boolean).join(" · ");
  }
  const spellName = reminderResolutionSpellName(event);
  const prefix = type === "concentration"
    ? "Concentrazione"
    : type === "area-save"
      ? "Permanenza area"
      : "Incantesimo";
  const subject = spellName ? `: ${spellName}` : "";
  const outcomeText = type === "concentration"
    && ["Superato", "Fallito", "Immune"].includes(outcome)
    ? `TS ${outcome.toLocaleLowerCase("it-IT")}`
    : outcome;
  return [`${prefix}${subject}`, outcomeText].filter(Boolean).join(" · ") || fallback;
}

function outcomeValue(item) {
  if (item && typeof item === "object") return item.outcome || item.result || item.attackOutcome;
  return item;
}

function outcomeCollectionValues(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    return Object.keys(value).sort().map((key) => value[key]);
  }
  return [];
}

function collectOutcomes(event) {
  const values = [];
  const add = (value) => {
    if (typeof value !== "string" && typeof value !== "number") return;
    const label = outcomeLabel(value);
    if (label && !values.includes(label)) values.push(label);
  };
  const payload = event?.payload && typeof event.payload === "object" ? event.payload : {};
  add(payload.outcome);
  for (const key of ["outcomes", "results"]) {
    for (const item of outcomeCollectionValues(payload[key])) add(outcomeValue(item));
  }
  for (const target of Array.isArray(payload.targets) ? payload.targets : []) add(target?.outcome);
  for (const attack of Array.isArray(payload.attacks) ? payload.attacks : []) {
    add(attack?.attackOutcome || attack?.outcome);
  }
  const causality = eventCausality(event);
  add(causality?.action?.attackOutcome);
  for (const target of Array.isArray(causality?.targets) ? causality.targets : []) add(target?.outcome);
  return values;
}

function explicitDamageLines(event) {
  const payload = event?.payload && typeof event.payload === "object" ? event.payload : {};
  const causality = eventCausality(event);
  const lines = [];
  const total = finiteNumber(payload.damage);
  if (total !== null && total > 0) lines.push(`${numberText(total)} danni`);
  const legacyRoll = finiteNumber(payload.damageRoll);
  if (legacyRoll !== null && legacyRoll > 0 && total !== 0) {
    lines.push(`Tiro del danno: ${numberText(legacyRoll)}`);
  }
  for (const target of Array.isArray(payload.targets) ? payload.targets : []) {
    const damage = finiteNumber(target?.damage);
    if (damage !== null && damage > 0) lines.push(`${targetName(target)}: ${numberText(damage)} danni`);
  }
  const causalRoll = finiteNumber(causality?.action?.damageRoll);
  if (causalRoll !== null && legacyRoll === null && causalRoll > 0 && total !== 0) {
    lines.push(`Tiro del danno: ${numberText(causalRoll)}`);
  }
  for (const target of Array.isArray(causality?.targets) ? causality.targets : []) {
    const name = targetName(target);
    const requested = finiteNumber(target?.requestedDamage);
    const applied = finiteNumber(target?.appliedHpDelta);
    if (
      requested !== null
      && requested > 0
      && target?.outcome !== "passed"
      && target?.outcome !== "immune"
      && target?.damageFactor !== 0
      && target?.damageFactor !== "zero"
    ) {
      lines.push(`${name}: ${numberText(requested)} danni richiesti`);
    }
    if (applied !== null && applied !== 0) lines.push(`${name}: ${signedNumber(applied)} HP applicati`);
  }
  return [...new Set(lines)];
}

function explicitContextLines(event) {
  const payload = event?.payload && typeof event.payload === "object" ? event.payload : {};
  const causality = eventCausality(event);
  const lines = [];
  const legacySpellName = meaningfulReminderName(payload.spellName, payload.spell?.name);
  const legacyCasterName = stringValue(payload.casterName || payload.caster?.name);
  const spellName = legacySpellName
    || meaningfulReminderName(causality?.cause?.spellName);
  const casterName = legacyCasterName || stringValue(causality?.actor?.name);
  const explicitSource = stringValue(payload.sourceName || payload.causeName);
  if (spellName) lines.push(`Incantesimo: ${spellName}`);
  if (legacyCasterName) lines.push(`Caster: ${casterName}`);
  else if (casterName) lines.push(`Incantatore: ${casterName}`);
  if (explicitSource) lines.push(`Fonte esplicita: ${explicitSource}`);
  // A species trait that changed hit points (Relentless Endurance, Healing Hands, temporary HP, a reduced damage).
  const speciesTrait = payload.speciesTrait && typeof payload.speciesTrait === "object" ? payload.speciesTrait : null;
  if (speciesTrait) {
    const actorName = stringValue(speciesTrait.actor?.name);
    lines.push(`Tratto di specie: ${stringValue(speciesTrait.name)}${actorName ? ` di ${actorName}` : ""}`);
    if (stringValue(speciesTrait.detail)) {
      lines.push(`${stringValue(speciesTrait.detail)}${speciesTrait.damageFrom === "history" ? " (danni dalla cronologia)" : ""}`);
    }
    const spent = (Array.isArray(speciesTrait.spent) ? speciesTrait.spent : []).map((entry) => (
      finiteNumber(entry?.before) !== null && finiteNumber(entry?.after) !== null
        ? `${stringValue(entry.name)} ${numberText(entry.before)} → ${numberText(entry.after)}`
        : `${stringValue(entry?.name)} −${numberText(entry?.amount ?? 1)}`
    )).filter(Boolean);
    if (spent.length) lines.push(`Speso: ${spent.join(", ")}`);
  }
  const causalSourceKnown = !!(
    speciesTrait
    || causality?.cause?.spellId
    || causality?.cause?.spellName
    || causality?.actor?.id
    || causality?.actor?.name
  );
  if ((event?.category === "hp" || hpTargets(event).length)
    && !casterName
    && !explicitSource
    && !causalSourceKnown) {
    lines.push("Fonte: non tracciata");
  }
  return lines;
}

const PC_ATTACK_LOG_SAVE_LABELS = Object.freeze({ str: "Forza", dex: "Destrezza", con: "Costituzione", int: "Intelligenza", wis: "Saggezza", cha: "Carisma" });

function causalityDetailLines(event) {
  const causality = eventCausality(event);
  if (!causality) return [];
  const lines = [];
  if (causality.cause?.slotLevel !== undefined) {
    lines.push(`Livello slot: ${numberText(causality.cause.slotLevel)}`);
  }
  // What the cast spent, and a cast the plugin only records (spellCastRecordCore.js): read from the raw payload.
  const spent = stringValue(event?.payload?.causality?.cost?.label);
  if (spent) lines.push(`Speso: ${spent}`);
  if (event?.payload?.causality?.recorded === true) lines.push("Effetti: risolti al tavolo");
  if (causality.phase) lines.push(`Fase: ${causality.phase}`);
  if (causality.action?.label) lines.push(`Azione: ${causality.action.label}`);
  if (causality.action?.attackOutcome) {
    lines.push(`Esito attacco: ${outcomeLabel(causality.action.attackOutcome)}`);
  }
  // PC attacks: the cantrip, then the extra damage on a hit (class feature riders and components added on
  // the fly). Read from the raw payload: the spell causality model does not carry these fields.
  const rawAttack = event?.payload?.causality;
  const cantripName = stringValue(rawAttack?.cantrip?.name);
  if (cantripName) {
    const cantripDice = stringValue(rawAttack.cantrip.dice);
    const saveLabel = stringValue(rawAttack.cantrip.saveLabel);
    lines.push(`Trucchetto: ${cantripName}${cantripDice ? ` (${cantripDice})` : ""}${saveLabel ? ` · ${saveLabel}` : ""}`);
  }
  // A leveled attack spell (lotto L4): its dice and slot level, the ray or dart, the slot spent, the caster's healing.
  const spellName = stringValue(rawAttack?.spell?.name);
  if (spellName) {
    const spell = rawAttack.spell;
    const dice = stringValue(spell.dice);
    const progress = Number(spell.total) > 1 ? ` · ${spell.leap ? "balzo" : "colpo"} ${spell.index}/${spell.total}` : spell.leap ? " · balzo" : "";
    lines.push(`Incantesimo: ${spellName}${dice ? ` (${dice})` : ""} · ${spell.slotLevel}° livello${progress}`);
    if (stringValue(spell.slotSpent)) lines.push(`Speso: ${spell.slotSpent}`);
    if (spell.casterHeal) lines.push(`Il caster recupera ${spell.casterHeal.amount} PF (${spell.casterHeal.before} → ${spell.casterHeal.after})`);
  }
  // 3C: an arrow that replaces the attack roll (Seeking, Piercing) and an attack on an area (each creature's save
  // follows in its own target line).
  const modeName = stringValue(rawAttack?.mode?.label);
  if (modeName) {
    const ability = PC_ATTACK_LOG_SAVE_LABELS[stringValue(rawAttack.save?.ability)];
    const dc = finiteNumber(rawAttack.save?.dc);
    lines.push(`Tiro: ${modeName}${ability ? ` · TS ${ability}${dc !== null ? ` CD ${numberText(dc)}` : ""}` : ""} al posto del tiro per colpire`);
  }
  // A dragonborn's breath weapon: its dice and type, its save that halves, the use spent.
  const breathName = stringValue(rawAttack?.breath?.name);
  if (breathName) {
    const ability = PC_ATTACK_LOG_SAVE_LABELS[stringValue(rawAttack.save?.ability)];
    const dc = finiteNumber(rawAttack.save?.dc);
    const dice = [stringValue(rawAttack.breath.dice), stringValue(rawAttack.breath.typeLabel)].filter(Boolean).join(" ");
    const spent = (Array.isArray(rawAttack.breath.spent) ? rawAttack.breath.spent : []).map((entry) => (
      finiteNumber(entry?.before) !== null && finiteNumber(entry?.after) !== null
        ? `${stringValue(entry.name)} ${numberText(entry.before)} → ${numberText(entry.after)}`
        : `${stringValue(entry?.name)} −${numberText(entry?.amount ?? 1)}`
    )).filter(Boolean);
    lines.push(`Soffio: ${breathName}${dice ? ` (${dice})` : ""}${ability ? ` · TS ${ability}${dc !== null ? ` CD ${numberText(dc)}` : ""}, metà se superato` : ""}`
      + `${spent.length ? ` · ${spent.join(", ")}` : ""}`);
  }
  if (rawAttack?.area && typeof rawAttack.area === "object") {
    const count = finiteNumber(rawAttack.area.count);
    const creatures = count !== null ? `${numberText(count)} ${count === 1 ? "creatura" : "creature"}` : "creature";
    const radius = finiteNumber(rawAttack.area.radiusFeet);
    lines.push(rawAttack.area.manual ? `Area: ${creatures} ${stringValue(rawAttack.area.shape) === "cone" ? "nel cono" : "sulla linea"}`
      : `Area: ${creatures} entro ${radius !== null ? `${numberText((radius / 10) * 3).replace(".", ",")} m` : "l'area"}${stringValue(rawAttack.actor?.name) ? ` da ${rawAttack.actor.name}` : ""}`);
  }
  // A weapon cantrip woven into the attack (Booming Blade, Green-Flame Blade).
  const wovenName = stringValue(rawAttack?.weaponCantrip?.name);
  if (wovenName) {
    const woven = rawAttack.weaponCantrip;
    const parts = [stringValue(woven.dice), stringValue(woven.triggerDice) ? `movimento ${woven.triggerDice}` : "",
      stringValue(woven.secondaryDice) ? `seconda creatura ${woven.secondaryDice}` : ""].filter(Boolean);
    lines.push(`Trucchetto con l'arma: ${wovenName}${parts.length ? ` (${parts.join(" · ")})` : ""}`);
  }
  for (const extra of [
    ...(Array.isArray(rawAttack?.riders) ? rawAttack.riders : []),
    ...(Array.isArray(rawAttack?.extras) ? rawAttack.extras : []),
  ]) {
    const name = stringValue(extra?.name) || stringValue(extra?.label) || "Componente";
    const dice = stringValue(extra?.dice);
    const amount = finiteNumber(extra?.amount);
    const type = stringValue(extra?.typeLabel);
    const slot = finiteNumber(extra?.slotLevel);
    const notes = [stringValue(extra?.bonus), stringValue(extra?.condition)].filter(Boolean);
    lines.push(`Extra: ${name}${slot !== null ? ` (slot ${numberText(slot)}°)` : ""}${dice ? ` ${dice}` : ""}`
      + `${amount !== null ? ` (${numberText(amount)}${type ? ` ${type}` : ""})` : ""}${notes.length ? ` · ${notes.join(" · ")}` : ""}`);
  }
  // Activations on a hit (maneuvers, Arcane Shot, Stunning Strike…): die and damage, the save and its outcome, the
  // effect (applied or not) and the resource spent.
  for (const activation of Array.isArray(rawAttack?.activations) ? rawAttack.activations : []) {
    // A choice names its effect: "Tecnica della Mano Aperta (Prono)".
    const name = `${stringValue(activation?.name) || "Attivazione"}${stringValue(activation?.choice?.label) ? ` (${activation.choice.label})` : ""}`;
    const dice = stringValue(activation?.dice);
    const amount = finiteNumber(activation?.amount);
    const type = stringValue(activation?.typeLabel);
    const save = activation?.save;
    const saveText = stringValue(save?.label)
      ? `TS ${save.label}${finiteNumber(save.dc) !== null ? ` CD ${numberText(save.dc)}` : ""} ${save.outcome === "failed" ? "fallito" : "superato"}`
      : "";
    const effect = activation?.effect;
    const effectText = stringValue(effect?.label) && effect.kind !== "note" && effect.applied ? `→ ${effect.label}${effect.self ? " (su di sé)" : ""}` : "";
    const spent = (Array.isArray(activation?.spent) ? activation.spent : []).map((entry) => (
      finiteNumber(entry?.before) !== null && finiteNumber(entry?.after) !== null
        ? `${stringValue(entry.name)} ${numberText(entry.before)} → ${numberText(entry.after)}`
        : `${stringValue(entry?.name)} −${numberText(entry?.amount ?? 1)}`
    )).filter(Boolean);
    const rollBonus = stringValue(activation?.rollBonus) ? `${activation.rollBonus} al tiro per colpire` : "";
    const second = stringValue(activation?.secondary?.name) ? `seconda creatura: ${activation.secondary.name}` : "";
    // Bursting Arrow: the creatures around the target hit by the burst.
    const burst = Array.isArray(activation?.burst) && activation.burst.length
      ? `esplosione: ${activation.burst.map((row) => stringValue(row?.name) || "creatura").join(", ")}` : "";
    // Inspiring Smite: the total, then each creature's temporary hit points.
    const tempHp = Array.isArray(activation?.tempHp) && activation.tempHp.length
      ? `PF temporanei${finiteNumber(activation.total) !== null ? ` ${numberText(activation.total)}` : ""}: ${activation.tempHp.map((row) => (
        `${stringValue(row?.name) || "creatura"} +${numberText(row?.amount ?? 0)}${finiteNumber(row?.before) !== null && finiteNumber(row?.after) !== null
          ? ` (${numberText(row.before)} → ${numberText(row.after)})` : ""}`)).join(", ")}` : "";
    const parts = [rollBonus, second, burst, tempHp, saveText && effectText ? `${saveText} ${effectText}` : saveText || effectText, ...spent].filter(Boolean);
    lines.push(`Attivazione: ${name}${dice ? ` ${dice}` : ""}${amount !== null ? ` (${numberText(amount)}${type ? ` ${type}` : ""})` : ""}`
      + `${parts.length ? ` · ${parts.join(" · ")}` : ""}`);
  }
  // Quivering Palm, ended: the save and its result.
  if (rawAttack?.quiveringPalm) {
    const palm = rawAttack.quiveringPalm;
    const dc = finiteNumber(palm.dc) !== null ? ` CD ${numberText(palm.dc)}` : "";
    const damage = (Array.isArray(rawAttack.targets) ? rawAttack.targets : []).flatMap((target) => target?.damageComponents || [])
      .reduce((sum, component) => sum + (finiteNumber(component?.amount) || 0), 0);
    lines.push(palm.outcome === "none" ? "Palmo Tremante: vibrazioni terminate senza effetto"
      : palm.outcome === "failed" ? `Palmo Tremante: TS Costituzione${dc} fallito → 0 PF`
        : `Palmo Tremante: TS Costituzione${dc} superato → ${stringValue(palm.dice) || "10d10"} (${numberText(damage)} necrotici)`);
  }
  for (const note of Array.isArray(rawAttack?.notes) ? rawAttack.notes : []) {
    if (stringValue(note)) lines.push(`Nota: ${note}`);
  }
  if (causality.concentration?.action) {
    const labels = { start: "avviata", continue: "proseguita", end: "terminata", break: "interrotta" };
    lines.push(`Concentrazione: ${labels[causality.concentration.action] || causality.concentration.action}`);
  }
  if (causality.zone?.action) lines.push(`Zona: ${causality.zone.action}`);
  for (const target of Array.isArray(causality.targets) ? causality.targets : []) {
    const targetLines = [];
    if (target.outcome) targetLines.push(outcomeLabel(target.outcome));
    if (
      finiteNumber(target.requestedDamage) !== null
      && target.requestedDamage > 0
      && target.outcome !== "passed"
      && target.outcome !== "immune"
      && target.damageFactor !== 0
      && target.damageFactor !== "zero"
    ) {
      targetLines.push(`${numberText(target.requestedDamage)} richiesti`);
    }
    if (finiteNumber(target.appliedHpDelta) !== null && target.appliedHpDelta !== 0) {
      targetLines.push(`${signedNumber(target.appliedHpDelta)} HP applicati`);
    }
    if (finiteNumber(target.damageFactor) !== null && target.damageFactor > 0) {
      targetLines.push(`fattore ${numberText(target.damageFactor)}`);
    }
    if (targetLines.length) lines.push(`${targetName(target)}: ${targetLines.join(", ")}`);
    else if (target?.name) lines.push(targetName(target));
  }
  return lines;
}

function sharedHpSummaryLines(event) {
  const groups = event?.payload?.sharedHp?.groups;
  if (!Array.isArray(groups)) return [];
  return groups.filter(group => Array.isArray(group.targets) && group.targets.length).map(group => {
    const names = group.targets.map(targetName).join(", ");
    const before = { hp: group.beforeHP, hpMax: group.beforeHPMax };
    const after = { hp: group.afterHP, hpMax: group.hpMax };
    return `${group.targets.length === 1 ? "Bersaglio" : "Bersagli"}: ${names} · Riserva ${hpTargetLine({
      name: group.sourceName || group.sourceId, before, after,
    })}`;
  });
}

function eventSummary(event, targets, outcomes) {
  const category = event.category;
  const hpLines = hpTargets(event).map(hpTargetLine);
  const facetLines = [
    ...["conditions", "spells", "concentrations"].flatMap((field) => facetChangeLines(event?.facets?.[field], field)),
    ...deathSaveLines(event, targets),
  ];
  const sharedHpLines = sharedHpSummaryLines(event);
  if (sharedHpLines.length) {
    const memberIds = new Set(event.payload.sharedHp.groups.flatMap(group => group.memberIds || []));
    const independentLines = hpTargets(event).filter(target => !memberIds.has(target.id)).map(hpTargetLine);
    return [...sharedHpLines, ...independentLines, ...outcomes, ...facetLines].join(" · ");
  }
  if (category === "hp") {
    const lines = [...hpLines, ...facetLines];
    return lines.join(" · ") || "Variazione HP registrata";
  }
  if (category === "movement") {
    const movement = targets.map((target) => `${target.name}: ${numberText(target.cells)} caselle`);
    return movement.join(" · ") || "Movimento registrato";
  }
  // A death saving throw: the tally (and Stabile or Morto) says it all.
  if (category === "save" && reminderResolutionType(event) === "death-save" && facetLines.length) {
    return facetLines.join(" · ");
  }
  if (category === "save") {
    const outcomeText = outcomes.join(", ");
    const targetText = targets.map((target) => target.name).join(", ");
    const damageText = explicitDamageLines(event).join(", ");
    const facetText = facetLines.join(", ");
    return [outcomeText, targetText, facetText, damageText].filter(Boolean).join(" · ") || "Risoluzione tiro salvezza";
  }
  if (category === "note") return stringValue(event?.payload?.text) || "Nota manuale";
  if (category === "undo") return stringValue(event?.payload?.description) || "Azioni annullate";
  if (category === "turn") return targets.map((target) => target.name).join(", ") || stringValue(event?.payload?.actorName) || "Cambio turno";
  if (event?.kind === "combat-snapshot") return stringValue(event?.payload?.summary) || "Snapshot del combattimento";
  if (category === "roster") return targets.map((target) => target.name).join(", ") || "Aggiornamento incontro";
  if (hpLines.length || facetLines.length) return [...hpLines, ...facetLines].join(" · ");
  if (targets.length) return targets.map((target) => target.name).join(", ");
  return stringValue(event?.label) || getCombatLogCategoryMeta(category).label;
}

function detailSections(event, targets, outcomes, turnName) {
  const sections = [];
  const sharedHpLines = sharedHpSummaryLines(event);
  if (sharedHpLines.length) sections.push({ label: "HP condivisi", lines: sharedHpLines });
  const hpLines = hpTargets(event).map(hpTargetLine);
  if (hpLines.length) sections.push({ label: "HP", lines: hpLines });
  for (const [field, label] of [
    ["conditions", "Condizioni"],
    ["spells", "Incantesimi"],
    ["concentrations", "Concentrazione"],
  ]) {
    const lines = facetChangeLines(event?.facets?.[field], field);
    if (lines.length) sections.push({ label, lines });
  }
  const deathLines = deathSaveLines(event, targets);
  if (deathLines.length) sections.push({ label: "TS contro la morte", lines: deathLines });
  if (outcomes.length) sections.push({ label: "Esito", lines: outcomes });
  const causalityLines = causalityDetailLines(event);
  if (causalityLines.length) sections.push({ label: "Causalità", lines: causalityLines });
  const damageLines = explicitDamageLines(event);
  if (damageLines.length) sections.push({ label: "Danno esplicito", lines: damageLines });
  const movementLines = movementFacetLines(event);
  if (movementLines.length && event?.category !== "movement") {
    sections.push({ label: "Movimento", lines: movementLines });
  }
  const initiativeLines = initiativeCardDiffLines(event);
  if (initiativeLines.length) sections.push({ label: "Diff scheda personaggio", lines: initiativeLines });
  const contextLines = explicitContextLines(event);
  if (contextLines.length) sections.push({ label: "Contesto", lines: contextLines });
  if (turnName && turnName !== "Fuori turno") {
    sections.push({ label: "Turno", lines: [`Durante il turno di ${turnName}`] });
  }
  if (event?.category === "movement" && (
    event?.payload?.movementCorrection
    || event?.payload?.nativeUndo
    || targets.some((target) => Number(target?.cells) < 0)
  )) {
    const correctionSource = String(event?.payload?.undoSource || "").trim();
    const correctionLabel = correctionSource === "history"
      ? "Correzione da annullamento della cronologia"
      : correctionSource === "obr-native"
        ? "Correzione da annullamento OBR"
        : "Correzione movimento registrata";
    sections.push({ label: "Annullamento", lines: [correctionLabel] });
  }
  if (event?.source) {
    sections.push({
      label: "Registrazione",
      lines: [event.category === "note" && event.source === "manual" ? "Nota manuale" : event.source === "manual" ? "Manuale" : "Automatica"],
    });
  }
  return sections;
}

function identityFacetItems(facet) {
  const direct = [
    ...(Array.isArray(facet?.added) ? facet.added : []),
    ...(Array.isArray(facet?.removed) ? facet.removed : []),
    ...(Array.isArray(facet?.updated)
      ? facet.updated.flatMap((item) => [item?.before, item?.after])
      : []),
  ];
  const scoped = Array.isArray(facet?.targets)
    ? facet.targets.flatMap((target) => identityFacetItems(target))
    : [];
  return [...direct, ...scoped].filter((item) => item && typeof item === "object");
}

function explicitSourceIdentity(event) {
  const payload = event?.payload && typeof event.payload === "object" ? event.payload : {};
  const causality = eventCausality(event) || {};
  const spellItems = [
    ...identityFacetItems(event?.facets?.spells),
    ...identityFacetItems(event?.facets?.concentrations),
  ];
  const sourceSpellName = meaningfulReminderName(
    causality?.cause?.spellName,
    payload.spellName,
    payload.spell?.name,
    ...spellItems.map((item) => item?.spellName || item?.name || item?.key),
  );
  const sourceSpellId = stringValue(
    causality?.cause?.spellId
    || payload.spellId
    || payload.spell?.id
    || spellItems.find((item) => item?.spellId)?.spellId,
  );
  const instanceIds = [
    causality?.cause?.instanceId,
    causality?.concentration?.instanceId,
    payload.causality?.instanceId,
    payload.causality?.concentrationInstanceId,
    ...spellItems.map((item) => item?.instanceId),
  ].map(stringValue).filter(Boolean);
  const actorId = stringValue(
    causality?.actor?.id
    || payload.casterId
    || payload.caster?.id
    || spellItems.find((item) => item?.casterId)?.casterId,
  );
  const actorName = stringValue(
    causality?.actor?.name
    || payload.casterName
    || payload.caster?.name,
  );
  if (!sourceSpellName && !sourceSpellId) return null;
  return {
    spellId: sourceSpellId,
    spellName: sourceSpellName,
    actorId,
    actorName,
    instanceIds: [...new Set(instanceIds)],
  };
}

function reminderInstanceIds(event) {
  if (String(event?.kind || "") !== "reminder-resolution") return [];
  const payload = event?.payload && typeof event.payload === "object" ? event.payload : {};
  const descriptor = payload.replay?.descriptor && typeof payload.replay.descriptor === "object"
    ? payload.replay.descriptor
    : {};
  const notice = descriptor.notice && typeof descriptor.notice === "object"
    ? descriptor.notice
    : {};
  const resolution = payload.resolution && typeof payload.resolution === "object"
    ? payload.resolution
    : notice.resolution && typeof notice.resolution === "object"
      ? notice.resolution
      : {};
  const activation = resolution.activation && typeof resolution.activation === "object"
    ? resolution.activation
    : {};
  return [...new Set([
    activation.instanceId,
    descriptor.instanceId,
    payload.causality?.concentrationInstanceId,
    payload.causality?.concentration?.instanceId,
  ].map(stringValue).filter(Boolean))];
}

function buildLegacySourceIndex(events) {
  const index = new Map();
  for (const [position, event] of (Array.isArray(events) ? events : []).entries()) {
    const source = explicitSourceIdentity(event);
    if (!source) continue;
    for (const instanceId of source.instanceIds) {
      const entries = index.get(instanceId) || [];
      entries.push({ position, source });
      index.set(instanceId, entries);
    }
  }
  return index;
}

function legacyReminderSource(event, sourceIndex, position) {
  const reminderIds = reminderInstanceIds(event);
  if (!reminderIds.length) return null;
  let latest = null;
  for (const instanceId of reminderIds) {
    const entries = sourceIndex.get(instanceId) || [];
    for (const entry of entries) {
      if (entry.position >= position) continue;
      if (!latest || entry.position > latest.position) latest = entry;
    }
  }
  return latest?.source || null;
}

function applyLegacyReminderSource(event, source) {
  if (!source) return event;
  const payload = event?.payload && typeof event.payload === "object" ? event.payload : {};
  const currentCausality = payload.causality && typeof payload.causality === "object"
    ? payload.causality
    : {};
  const currentCause = currentCausality.cause && typeof currentCausality.cause === "object"
    ? currentCausality.cause
    : {};
  const currentActor = currentCausality.actor && typeof currentCausality.actor === "object"
    ? currentCausality.actor
    : {};
  const spellName = meaningfulReminderName(currentCause.spellName) || source.spellName;
  const cause = {
    ...currentCause,
    ...(source.spellId && !currentCause.spellId ? { spellId: source.spellId } : {}),
    ...(spellName ? { spellName } : {}),
  };
  const actor = {
    ...(source.actorId ? { id: source.actorId } : {}),
    ...(source.actorName ? { name: source.actorName } : {}),
    ...currentActor,
  };
  return {
    ...event,
    payload: {
      ...payload,
      causality: {
        ...currentCausality,
        cause,
        ...(Object.keys(actor).length ? { actor } : {}),
      },
    },
  };
}

function projectedEvent(rawEvent, index) {
  const event = normalizeCombatLogEventV3(rawEvent);
  const category = COMBAT_LOG_CATEGORY_ORDER.includes(String(event.category)) ? String(event.category) : "other";
  const meta = getCombatLogCategoryMeta(category);
  const reminderType = reminderResolutionType(event);
  const categoryLabel = reminderType === "concentration"
    ? "Concentrazione"
    : reminderType === "area-save"
      ? "Permanenza area"
    : reminderType === "spell"
      ? "Incantesimo"
      : meta.label;
  const context = turnContext(event);
  const causality = eventCausality(event);
  const targets = uniqueTargets(mergePresentationTargets(event, causality));
  const outcomes = collectOutcomes(event);
  const title = reminderResolutionTitle(event, stringValue(event.label) || meta.label);
  const summary = eventSummary({ ...event, category }, targets, outcomes);
  const details = detailSections({ ...event, category }, targets, outcomes, context.turnName);
  const sequence = positiveInteger(event.sequence, index + 1);
  const at = finiteNumber(event.at);
  const id = stringValue(event.id) || `event:${sequence}:${at ?? "na"}:${index}`;
  const technical = {
    version: Number(event.version) || 1,
    kind: stringValue(event.kind) || "change",
    source: stringValue(event.source) || "automatic",
    historyEntryId: stringValue(event.historyEntryId) || null,
    commandId: stringValue(event.commandId) || null,
    correlationId: stringValue(event.correlationId) || null,
    causality: {
      instanceId: stringValue(causality?.cause?.instanceId) || null,
      actionId: stringValue(causality?.action?.id) || null,
      reminderActivationId: stringValue(causality?.reminder?.activationId) || null,
    },
  };
  const detailText = details.flatMap((section) => section.lines).join(" ");
  const movementText = movementFacetLines(event).join(" ");
  const movementOriginText = stringValue(event?.facets?.movement?.origin?.kind);
  const initiativeText = initiativeCardDiffLines(event).join(" ");
  const searchableText = [
    title,
    meta.label,
    summary,
    context.turnName,
    targets.map((target) => target.name).join(" "),
    outcomes.join(" "),
    detailText,
    categoryLabel,
    causality?.cause?.spellName || "",
    causality?.actor?.name || "",
    causality?.phase || "",
    causality?.action?.label || "",
    causality?.concentration?.action || "",
    safeJson(event.payload),
    safeJson(event.provenance),
    movementText,
    movementOriginText,
    initiativeText,
  ].join(" ");
  return {
    id,
    sequence,
    at,
    round: positiveInteger(event.round),
    turnKey: context.turnKey,
    turnName: context.turnName,
    turn: context.turn,
    category,
    categoryLabel,
    tone: meta.tone,
    kind: technical.kind,
    title,
    summary,
    details,
    targets,
    outcomes,
    causality,
    provenance: clone(event.provenance),
    turnContext: clone(context.turnContext),
    searchableText,
    technical,
    boundary: category === "turn" || category === "round",
  };
}

function groupEvents(events) {
  const rounds = new Map();
  for (const event of events) {
    let round = rounds.get(event.round);
    if (!round) {
      round = { round: event.round, turns: [] };
      rounds.set(event.round, round);
    }
    let turn = round.turns.find((candidate) => candidate.turnKey === event.turnKey);
    if (!turn) {
      turn = {
        turnKey: event.turnKey,
        turnName: event.turnName,
        events: [],
      };
      round.turns.push(turn);
    }
    turn.events.push(event);
  }
  const groups = [...rounds.values()].sort((a, b) => a.round - b.round);
  for (const round of groups) {
    round.turns.sort((a, b) => (a.events[0]?.sequence || 0) - (b.events[0]?.sequence || 0));
    for (const turn of round.turns) turn.events.sort((a, b) => a.sequence - b.sequence);
  }
  return groups;
}

function buildSummary(session, events, groups) {
  const rounds = [...new Set(events.map((event) => event.round))].sort((a, b) => a - b);
  const turns = [...new Map(events
    .filter((event) => event.turnKey !== NO_TURN_KEY)
    .map((event) => [event.turnKey, { key: event.turnKey, name: event.turnName }])).values()];
  const participants = uniqueByName(events.flatMap((event) => [
    ...event.targets,
    ...(event.causality?.actor?.name ? [{ name: event.causality.actor.name }] : []),
    ...(event.turnName !== "Fuori turno" ? [{ name: event.turnName }] : []),
  ]));
  const categoryCounts = Object.fromEntries(COMBAT_LOG_CATEGORY_ORDER.map((category) => [
    category,
    events.filter((event) => event.category === category).length,
  ]).filter(([, count]) => count > 0));
  const timestamps = events.map((event) => event.at).filter((value) => value !== null).sort((a, b) => a - b);
  return {
    hasSession: Boolean(session?.id),
    sessionId: stringValue(session?.id) || null,
    sessionName: stringValue(session?.name) || "Nessun registro attivo",
    startedAt: finiteNumber(session?.startedAt),
    firstEventAt: timestamps[0] ?? null,
    lastEventAt: timestamps.at(-1) ?? null,
    totalEvents: events.length,
    roundCount: rounds.length,
    rounds,
    turnCount: turns.length,
    turns,
    participantCount: participants.length,
    participants: participants.map((participant) => participant.name),
    categoryCounts,
    outOfTurnEvents: events.filter((event) => event.turnKey === NO_TURN_KEY).length,
    groupCount: groups.length,
    localStorageLabel: "Locale a questo browser GM",
  };
}

export function buildCombatLogPresentation(session, rawEvents = []) {
  const aggregatedEvents = aggregateCombatLogEvents(Array.isArray(rawEvents) ? rawEvents : []);
  const legacySourceIndex = buildLegacySourceIndex(aggregatedEvents);
  const normalizedEvents = aggregatedEvents.map((event, index) => projectedEvent(
    applyLegacyReminderSource(event, legacyReminderSource(event, legacySourceIndex, index)),
    index,
  ));
  const groups = groupEvents(normalizedEvents);
  const sessionSummary = buildSummary(session, normalizedEvents, groups);
  const availableCategories = COMBAT_LOG_CATEGORY_ORDER
    .filter((category) => sessionSummary.categoryCounts[category])
    .map((category) => ({
      value: category,
      label: getCombatLogCategoryMeta(category).label,
      count: sessionSummary.categoryCounts[category],
    }));
  const availableOutcomes = [...new Set(normalizedEvents.flatMap((event) => event.outcomes))]
    .sort((a, b) => a.localeCompare(b, "it"))
    .map((value) => ({ value, label: value }));
  return {
    sessionSummary,
    groups,
    events: normalizedEvents,
    participants: sessionSummary.participants,
    availableCategories,
    availableOutcomes,
  };
}

function matchesParticipant(event, participant) {
  if (!participant) return true;
  const wanted = normalizePresentationSearch(participant);
  return event.targets.some((target) => normalizePresentationSearch(target.name) === wanted)
    || normalizePresentationSearch(event.causality?.actor?.name) === wanted
    || normalizePresentationSearch(event.turnName) === wanted;
}

export function filterCombatLogPresentation(presentation, filters = {}) {
  const normalizedFilters = {
    query: normalizePresentationSearch(filters.query),
    category: stringValue(filters.category),
    participant: stringValue(filters.participant),
    outcome: stringValue(filters.outcome),
  };
  const matches = presentation?.events?.filter((event) => {
    if (normalizedFilters.category && event.category !== normalizedFilters.category) return false;
    if (normalizedFilters.participant && !matchesParticipant(event, normalizedFilters.participant)) return false;
    if (normalizedFilters.outcome && !event.outcomes.includes(normalizedFilters.outcome)) return false;
    if (normalizedFilters.query && !normalizePresentationSearch(event.searchableText).includes(normalizedFilters.query)) return false;
    return true;
  }) || [];
  const groups = groupEvents(matches);
  return {
    ...presentation,
    filters: normalizedFilters,
    groups,
    events: matches,
    sessionSummary: {
      ...presentation.sessionSummary,
      visibleEvents: matches.length,
      totalEvents: presentation?.sessionSummary?.totalEvents || 0,
    },
  };
}

export function formatCombatLogTimestamp(value, { timeOnly = false } = {}) {
  const timestamp = finiteNumber(value);
  if (timestamp === null) return "—";
  return new Date(timestamp).toLocaleString("it-IT", timeOnly
    ? { hour: "2-digit", minute: "2-digit", second: "2-digit" }
    : { dateStyle: "short", timeStyle: "short" });
}

function formatInterval(summary) {
  if (summary?.firstEventAt === null || summary?.lastEventAt === null) return "nessun evento";
  return `${formatCombatLogTimestamp(summary.firstEventAt)} – ${formatCombatLogTimestamp(summary.lastEventAt)}`;
}

export function serializeCombatLogPresentationText(session, presentation) {
  const model = presentation?.groups ? presentation : buildCombatLogPresentation(session, presentation?.events || []);
  const summary = model.sessionSummary;
  const lines = [
    `Registro combattimento: ${summary.sessionName}`,
    `Storage: ${summary.localStorageLabel}`,
    `Inizio: ${formatCombatLogTimestamp(summary.startedAt)}`,
    `Intervallo: ${formatInterval(summary)}`,
    `Eventi: ${summary.totalEvents}`,
    "",
  ];
  for (const round of model.groups) {
    lines.push(`ROUND ${round.round}`);
    for (const turn of round.turns) {
      lines.push(`  TURNO: ${turn.turnName}`);
      for (const event of turn.events) {
        const time = formatCombatLogTimestamp(event.at, { timeOnly: true });
        lines.push(`    [${time}] ${event.title} · ${event.categoryLabel}`);
        if (event.summary) lines.push(`      ${event.summary}`);
        for (const section of event.details) {
          for (const line of section.lines) lines.push(`      ${section.label}: ${line}`);
        }
      }
    }
    lines.push("");
  }
  if (!model.groups.length) lines.push("Nessun evento registrato.");
  return lines.join("\n").trimEnd();
}

export { NO_TURN_KEY };
