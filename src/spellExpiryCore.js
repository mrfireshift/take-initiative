function positiveInteger(value, fallback = 1) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const MAX_VISIBLE_SPELL_ROUNDS = 10;

export function isSpellTurnBoundaryExpiry(value) {
  return value?.mode === "turn-start" || value?.mode === "turn-end";
}

// The rounds left as recorded on the spell, or null when it records none (a spell put on by hand, without a
// duration): such a spell shows no counter and no "0 round", while a recorded 0 still reads 0.
export function spellRecordedTurns(spell = {}) {
  const raw = spell?.turns;
  if (raw === undefined || raw === null || raw === "") return null;
  const turns = Math.floor(Number(raw));
  return Number.isFinite(turns) ? Math.max(0, turns) : null;
}

export function spellExpiryCounter(spell = {}) {
  const expiry = spell?.expiry || {};
  if (expiry.mode === "manual") return "M";
  if (!isSpellTurnBoundaryExpiry(expiry)) {
    const turns = spellRecordedTurns(spell);
    if (turns === null) return "";
    return turns > MAX_VISIBLE_SPELL_ROUNDS ? "" : String(turns);
  }
  const phase = expiry.mode === "turn-start" ? "I" : "F";
  const actor = expiry.actor === "target" ? "B" : "C";
  const remaining = positiveInteger(expiry.remaining);
  return `${phase}${remaining > 1 ? `:${remaining}` : ""} ${actor}`;
}

export function spellPillCounter(spell = {}) {
  const uses = spell?.castContext?.uses;
  const remaining = Math.floor(Number(uses?.remaining));
  if (uses?.showInPill === true && Number.isFinite(remaining) && remaining >= 0) {
    return String(remaining);
  }
  return spellExpiryCounter(spell);
}

export function spellExpiryDescription(spell = {}) {
  const expiry = spell?.expiry || {};
  if (expiry.mode === "manual") return "rimozione manuale";
  if (!isSpellTurnBoundaryExpiry(expiry)) {
    const turns = spellRecordedTurns(spell);
    if (turns === null) return "durata non indicata";
    if (turns > MAX_VISIBLE_SPELL_ROUNDS) return "durata estesa";
    return `${turns} round rimanenti`;
  }
  const phase = expiry.mode === "turn-start" ? "all'inizio" : "alla fine";
  const actor = expiry.actor === "target" ? "del turno del bersaglio" : "del turno del caster";
  const remaining = positiveInteger(expiry.remaining);
  if (expiry.anchor === "next-turn" && remaining === 1) {
    const anchoredActor = expiry.actor === "target" ? "del bersaglio" : "del caster";
    return `scade ${phase} del turno successivo ${anchoredActor}`;
  }
  return remaining === 1
    ? `scade ${phase} ${actor}`
    : `scade tra ${remaining} passaggi ${phase} ${actor}`;
}
