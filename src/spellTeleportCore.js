export const SPELL_TELEPORT_RULES = Object.freeze({
  "misty-step": Object.freeze({
    spellId: "misty-step",
    rangeMeters: 9,
    allowPassenger: false,
  }),
  "dimension-door": Object.freeze({
    spellId: "dimension-door",
    rangeMeters: 150,
    allowPassenger: true,
    passengerMaxDistanceMeters: 1.5,
  }),
});

export function isTeleportSpell(value) {
  const id = typeof value === "object" ? value?.id : value;
  return Object.prototype.hasOwnProperty.call(SPELL_TELEPORT_RULES, String(id || "").trim());
}

export function getSpellTeleportRule(value) {
  const id = typeof value === "object" ? value?.id : value;
  return SPELL_TELEPORT_RULES[String(id || "").trim()] || null;
}

export function spellTeleportDestinationPosition(preview) {
  if (!preview || typeof preview !== "object") return null;
  if (preview.position && Number.isFinite(Number(preview.position.x)) && Number.isFinite(Number(preview.position.y))) {
    return { x: Number(preview.position.x), y: Number(preview.position.y) };
  }
  if (
    preview.start && preview.end
    && Number.isFinite(Number(preview.start.x)) && Number.isFinite(Number(preview.start.y))
    && Number.isFinite(Number(preview.end.x)) && Number.isFinite(Number(preview.end.y))
    && ["square", "rectangle"].includes(preview.type)
  ) {
    return {
      x: (Number(preview.start.x) + Number(preview.end.x)) / 2,
      y: (Number(preview.start.y) + Number(preview.end.y)) / 2,
    };
  }
  const pos = preview.position || preview.destination || preview.start || preview.origin || preview.end;
  const x = Number(pos?.x);
  const y = Number(pos?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

