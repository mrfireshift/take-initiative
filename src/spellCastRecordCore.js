// The record of a cast the plugin does not automate (spells-srd.js, isSpellCastRecordOnly): its History label, its
// causality and, for a cast that spends nothing, the combat log entry written without History. Pure: the executor is
// spellCastRecord.js.
import { buildSpellCausality } from "./combatLogCausalityCore.js";

// The combat log's recordingSource of a cast written without a History entry.
export const SPELL_CAST_RECORD_SOURCE = "spell-cast-record";

function text(value) {
  return String(value ?? "").trim();
}

function slotLevelValue(value) {
  const level = Math.floor(Number(value));
  return Number.isInteger(level) && level >= 1 && level <= 9 ? level : undefined;
}

export function spellCastRecordLabel(spellName) {
  return `Incantesimo: ${text(spellName) || "incantesimo"}`;
}

/**
 * The causality of a recorded cast: the ordinary spell cast (application/cast), plus two fields the combat log reads
 * as they are (combatLogPresentationCore.js): recorded, the effects are resolved at the table; cost, what the cast
 * spent (spellSlotSpendCore.js planSpellCastCost: "slot di 3° livello", a use of a quick action), absent when nothing.
 * targets: { id, name } of the creatures the GM named, possibly none.
 */
export function buildSpellCastRecordCausality({
  spellId = "",
  spellName = "",
  slotLevel = null,
  casterId = "",
  casterName = "",
  targets = [],
  cost = "",
} = {}) {
  const label = spellCastRecordLabel(spellName);
  const level = slotLevelValue(slotLevel);
  return withSpellCastCost({
    ...buildSpellCausality({
      eventType: "application/cast",
      spellId: text(spellId),
      spellName: text(spellName),
      ...(level !== undefined ? { slotLevel: level } : {}),
      phase: "cast",
      casterId: text(casterId),
      casterName: text(casterName),
      targets: (Array.isArray(targets) ? targets : [])
        .map((target) => ({ id: text(target?.id), name: text(target?.name) }))
        .filter((target) => target.id),
      actionLabel: label,
    }),
    recorded: true,
  }, cost);
}

// What any cast spent, on its causality (the automated casts of spellApplicationExecutor.js and
// spellAreaResolutionExecutor.js too): the combat log shows it as "Speso: …".
export function withSpellCastCost(causality, cost = "") {
  const spent = text(cost);
  if (!spent || !causality || typeof causality !== "object") return causality;
  return { ...causality, cost: { label: spent } };
}

// The entry the combat log receives for a cast that spent nothing: shaped like a History entry, so the log presents it
// as any other cast, but with no id, since no History entry (and so no Undo) exists for it.
export function buildSpellCastRecordLogEntry({ label = "", causality = null, at = Date.now() } = {}) {
  return {
    id: "",
    kind: "spell",
    label: text(label) || spellCastRecordLabel(causality?.cause?.spellName),
    at: Number.isFinite(Number(at)) ? Number(at) : Date.now(),
    changes: [],
    payload: { causality: causality && typeof causality === "object" ? causality : {} },
    provenance: { recordingSource: SPELL_CAST_RECORD_SOURCE },
  };
}
