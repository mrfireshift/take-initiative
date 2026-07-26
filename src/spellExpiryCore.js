function positiveInteger(value, fallback = 1) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function isSpellTurnBoundaryExpiry(value) {
  return value?.mode === "turn-start" || value?.mode === "turn-end";
}

export function spellExpiryCounter(spell = {}) {
  const expiry = spell?.expiry || {};
  if (expiry.mode === "manual") return "M";
  if (!isSpellTurnBoundaryExpiry(expiry)) {
    return String(Math.max(0, Math.floor(Number(spell?.turns) || 0)));
  }
  const phase = expiry.mode === "turn-start" ? "I" : "F";
  const actor = expiry.actor === "target" ? "B" : "C";
  const remaining = positiveInteger(expiry.remaining);
  return `${phase}${remaining > 1 ? `:${remaining}` : ""} ${actor}`;
}

export function spellExpiryDescription(spell = {}) {
  const expiry = spell?.expiry || {};
  if (expiry.mode === "manual") return "rimozione manuale";
  if (!isSpellTurnBoundaryExpiry(expiry)) {
    const turns = Math.max(0, Math.floor(Number(spell?.turns) || 0));
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
