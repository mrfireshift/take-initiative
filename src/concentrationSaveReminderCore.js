const text = (value, fallback = "") => String(value ?? fallback).trim();

function concentrationDescriptors(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value).map(([key, entry]) => {
    const data = entry && typeof entry === "object" ? entry : {};
    const reference = text(data.instanceId || key);
    if (!reference) return null;
    return {
      reference,
      name: text(data.name || key, "Concentrazione"),
    };
  }).filter(Boolean);
}

export function buildConcentrationSaveWarning({
  casterId = "",
  casterName = "Token",
  concentration = null,
  damage = 0,
  dc = 10,
  portrait = "",
  attitude = "neutral",
  eventId = "",
} = {}) {
  const normalizedCasterId = text(casterId);
  const descriptors = concentrationDescriptors(concentration);
  const normalizedDamage = Math.max(0, Math.floor(Number(damage) || 0));
  if (!normalizedCasterId || !descriptors.length || normalizedDamage <= 0) return null;

  const normalizedName = text(casterName, "Token") || "Token";
  const normalizedDC = Math.max(10, Math.floor(Number(dc) || 10));
  const activationId = [
    "concentration-save",
    text(eventId, Date.now()),
    normalizedCasterId,
  ].join(":");
  const spellName = descriptors.map((entry) => entry.name).join(", ");
  const actions = descriptors.map((entry) => ({
    kind: "concentration",
    action: "break",
    targetId: normalizedCasterId,
    casterId: normalizedCasterId,
    reference: entry.reference,
  }));

  return {
    name: normalizedName,
    damage: normalizedDamage,
    dc: normalizedDC,
    portrait: text(portrait),
    attitude: text(attitude, "neutral").toLowerCase() || "neutral",
    spellName,
    notice: {
      activationId,
      spellName,
      targets: [{ id: normalizedCasterId, name: normalizedName }],
      resolution: {
        version: 1,
        target: { id: normalizedCasterId },
        source: { id: normalizedCasterId },
        save: { ability: "con", dc: normalizedDC },
        outcomes: {
          passed: { actions: [{
            kind: "concentration",
            action: "keep",
            targetId: normalizedCasterId,
          }] },
          failed: { actions },
        },
        activation: {
          kind: "concentration-save",
          activationId,
        },
      },
    },
  };
}
