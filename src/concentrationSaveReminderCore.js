import { ID } from "./constants.js";

const META_KEY = `${ID}/meta`;
const CONCENTRATION_KEY = `${ID}/concentration`;
const text = (value, fallback = "") => String(value ?? fallback).trim();

function concentrationSaveDC(damage) {
  return Math.max(10, Math.floor(Math.max(0, Number(damage) || 0) / 2));
}

function portraitUrl(item) {
  return text(
    item?.image?.url
    || item?.image?.src
    || item?.asset?.image?.url,
  );
}

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

export function concentrationDamageByItemId(changes = []) {
  const damageById = new Map();
  for (const change of Array.isArray(changes) ? changes : []) {
    const itemId = text(change?.itemId);
    const damage = Math.max(0, Math.floor(Number(change?.damage) || 0));
    if (!itemId || damage <= 0) continue;
    damageById.set(itemId, Math.max(damageById.get(itemId) || 0, damage));
  }
  return damageById;
}

export function concentrationSaveWarningsForItems({
  items = [],
  changes = [],
  eventId = "",
} = {}) {
  const damageById = concentrationDamageByItemId(changes);
  if (!damageById.size) return [];
  const warnings = [];
  for (const item of Array.isArray(items) ? items : []) {
    const damage = damageById.get(text(item?.id)) || 0;
    if (damage <= 0) continue;
    const meta = item?.metadata?.[META_KEY] || {};
    const warning = buildConcentrationSaveWarning({
      casterId: item.id,
      casterName: item.name || "Token",
      concentration: meta[CONCENTRATION_KEY],
      damage,
      dc: concentrationSaveDC(damage),
      portrait: portraitUrl(item),
      attitude: meta.attitude || "neutral",
      eventId,
    });
    if (warning) warnings.push(warning);
  }
  return warnings;
}
