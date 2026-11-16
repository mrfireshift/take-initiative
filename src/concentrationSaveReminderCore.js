import { ID } from "./constants.js";
import { readiedHoldName } from "./reactionTrackerCore.js";
import { FEATS_FIELD, getFeat, sanitizeFeats } from "./featCatalog.js";
import { MONSTER_PROFILE_FIELD } from "./monsterProfileCore.js";

const META_KEY = `${ID}/meta`;
export const CONCENTRATION_KEY = `${ID}/concentration`;
const text = (value, fallback = "") => String(value ?? fallback).trim();

// Lot F4 of docs/STUDIO_TALENTI.md: the feats that change a concentration save after damage. War Caster gives the
// concentrating creature advantage; Mage Slayer, on the creature that dealt the damage, disadvantage. Both cancel out.
const WAR_CASTER = "incantatore-da-guerra";
const MAGE_SLAYER = "sterminatore-di-maghi";

function featIdsOf(item) {
  return new Set(sanitizeFeats(item?.metadata?.[META_KEY]?.initiativeCard?.[FEATS_FIELD]).map((entry) => entry.id));
}

// The Constitution save on the sheet (its total, Resilient included), or for a monster of a stat block its modifier;
// null when the sheet has neither (lot F4).
function concentrationSaveBonus(item) {
  const meta = item?.metadata?.[META_KEY] || {};
  const card = meta.initiativeCard || {};
  const known = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
  if (known(card.savingThrows?.con)) return Math.trunc(Number(card.savingThrows.con));
  const monster = text(meta.attitude).toLowerCase() !== "pc" && !!card[MONSTER_PROFILE_FIELD];
  return monster && known(card.abilityModifiers?.con) ? Math.trunc(Number(card.abilityModifiers.con)) : null;
}

// What the warning says about the roll (lot F4): { bonus, roll, reason }, or null with nothing to say. roll is a word the
// popup shows next to the save, reason its tooltip; the attacker is never named (the warning reaches the players).
export function concentrationSaveHint({ bonus = null, advantage = false, disadvantage = false } = {}) {
  const warCaster = getFeat(WAR_CASTER)?.name || "Incantatore da Guerra";
  const mageSlayer = getFeat(MAGE_SLAYER)?.name || "Sterminatore di Maghi";
  const [roll, reason] = advantage && disadvantage
    ? ["vantaggio e svantaggio annullati", `${warCaster} e ${mageSlayer} di chi ha colpito: si annullano`]
    : advantage ? ["vantaggio", `Vantaggio: ${warCaster}`]
      : disadvantage ? ["svantaggio", `Svantaggio: ${mageSlayer} di chi ha colpito`] : ["", ""];
  const known = Number.isInteger(bonus);
  return known || roll ? { bonus: known ? bonus : null, roll, reason } : null;
}

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

// Whether the token holds at least one concentration (the same reading as the save warning).
export function isConcentrating(item) {
  return concentrationDescriptors(item?.metadata?.[META_KEY]?.[CONCENTRATION_KEY]).length > 0;
}

function concentrationDescriptors(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value).map(([key, entry]) => {
    const data = entry && typeof entry === "object" ? entry : {};
    const reference = text(data.instanceId || key);
    if (!reference) return null;
    return {
      reference,
      // A readied spell held by the concentration: «Palla di fuoco (azione preparata)» (lot T6e).
      name: readiedHoldName(text(data.name || key, "Concentrazione"), data),
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
  causeHistoryEntryId = "",
  cause = "",
  saveHint = null,
} = {}) {
  const normalizedCasterId = text(casterId);
  const descriptors = concentrationDescriptors(concentration);
  const normalizedDamage = Math.max(0, Math.floor(Number(damage) || 0));
  // A save without damage needs a named cause (e.g. an aura: "Primal Blizzard").
  const normalizedCause = text(cause).slice(0, 120);
  if (!normalizedCasterId || !descriptors.length || (normalizedDamage <= 0 && !normalizedCause)) return null;

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
    ...(normalizedCause ? { cause: normalizedCause } : {}),
    dc: normalizedDC,
    portrait: text(portrait),
    attitude: text(attitude, "neutral").toLowerCase() || "neutral",
    spellName,
    notice: {
      activationId,
      ...(text(causeHistoryEntryId) ? { causeHistoryEntryId: text(causeHistoryEntryId, "", 300) } : {}),
      spellName,
      // Lot F4: the sheet's Constitution save and the feats' advantage or disadvantage. In the notice, which reaches the
      // popup untouched (the tracker's normalizer keeps only the warning's own fields).
      ...(saveHint ? { saveHint } : {}),
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
  causeHistoryEntryId = "",
} = {}) {
  const damageById = concentrationDamageByItemId(changes);
  if (!damageById.size) return [];
  // Lot F4: the creature that dealt the damage, when the caller knows it (the two consoles), for Mage Slayer; its item
  // among items.
  const sourceById = new Map((Array.isArray(changes) ? changes : []).filter((change) => text(change?.itemId) && text(change?.sourceId))
    .map((change) => [text(change.itemId), text(change.sourceId)]));
  const list = Array.isArray(items) ? items : [];
  const warnings = [];
  for (const item of list) {
    const damage = damageById.get(text(item?.id)) || 0;
    if (damage <= 0) continue;
    const meta = item?.metadata?.[META_KEY] || {};
    // At 0 HP there is no save: the concentration ends with the creature's fall (decision D4 of the bugfix pass).
    if (Number(meta.hpMax) > 0 && Number(meta.hp) <= 0) continue;
    const sourceId = sourceById.get(text(item.id)) || "";
    const source = sourceId && sourceId !== text(item.id) ? list.find((candidate) => text(candidate?.id) === sourceId) : null;
    const saveHint = concentrationSaveHint({ bonus: concentrationSaveBonus(item), advantage: featIdsOf(item).has(WAR_CASTER),
      disadvantage: !!source && featIdsOf(source).has(MAGE_SLAYER) });
    const warning = buildConcentrationSaveWarning({
      casterId: item.id,
      casterName: item.name || "Token",
      concentration: meta[CONCENTRATION_KEY],
      damage,
      dc: concentrationSaveDC(damage),
      portrait: portraitUrl(item),
      attitude: meta.attitude || "neutral",
      eventId,
      causeHistoryEntryId,
      saveHint,
    });
    if (warning) warnings.push(warning);
  }
  return warnings;
}
