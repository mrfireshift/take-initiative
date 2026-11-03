const uniqueIds = (values = []) => Array.from(new Set(
  (Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean)
));

// The spell as this cast has it. Wild Magic Surge (PHB 2014): a spell the surge casts "does not require
// concentration and lasts its full duration": castContext.withoutConcentration names that spell's id, so a
// panel switched to another spell casts it as usual.
export function spellForCastContext(spell, castContext = {}) {
  if (!spell || typeof spell !== "object" || spell.concentration !== true) return spell;
  const exempt = String(castContext?.withoutConcentration || "").trim();
  if (exempt && exempt === String(spell.id || "").trim()) return { ...spell, concentration: false };
  // A slot high enough lifts the concentration (Bestow Curse from the 5th level), and lifts the end too from
  // manualFromSlot ("until dispelled", its 9th level): no expiry, the pill ends by hand or by another spell.
  const rule = spell.durationBySlot;
  const slot = Math.floor(Number(castContext?.slotLevel));
  if (!Number.isFinite(slot) || !(Number(rule?.concentrationBelowSlot) <= slot)) return spell;
  return {
    ...spell,
    concentration: false,
    ...(Number(rule.manualFromSlot) <= slot ? { expiry: { mode: "manual" } } : {}),
  };
}

export function resolveSpellConcentration(spell, requestedConcentration = false) {
  if (spell && typeof spell === "object") return spell.concentration === true;
  return requestedConcentration === true;
}

export function resolveSpellSubjectIds({
  spell = null,
  casterId = "",
  selectedIds = [],
  subjectMode = "",
} = {}) {
  const caster = String(casterId || "").trim();
  const mode = String(subjectMode || spell?.targetMode || "selected")
    .trim()
    .toLocaleLowerCase("it");
  if (mode === "self" || mode === "caster") return caster ? [caster] : [];
  return uniqueIds(selectedIds);
}

export function resolveSpellSlotLevel(spell, requestedLevel = null) {
  const baseLevel = Math.max(0, Math.floor(Number(spell?.level) || 0));
  const parsed = Math.floor(Number(requestedLevel));
  if (!Number.isFinite(parsed)) return baseLevel;
  return Math.max(baseLevel, Math.min(9, parsed));
}
