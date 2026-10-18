// Manual duration override from a pill (GM): one value for the whole effect.
// - a spell pill (or the spell itself) updates the spell on every target and its linked pills;
// - a class-feature or species pill updates the activation in the source's state and all its pills;
// - any other condition or buff updates that instance only.
// Pure planning: the browser module runs the operations as one effects mutation (history, Undo).

import { ID } from "./constants.js";

const META_KEY = `${ID}/meta`;
const SPELLS_META_KEY = `${ID}/spells`;

const text = (value) => String(value || "").trim();

function conditionInstancesOf(item) {
  const value = item?.metadata?.[META_KEY]?.conditions;
  return Array.isArray(value) ? value : Array.isArray(value?.instances) ? value.instances : [];
}

function spellsOf(item) {
  const value = item?.metadata?.[META_KEY]?.[SPELLS_META_KEY];
  return Array.isArray(value) ? value : [];
}

export function normalizeDurationOverride(value) {
  if (value?.mode === "manual") return { mode: "manual" };
  const remaining = Math.floor(Number(value?.remaining));
  return Number.isInteger(remaining) && remaining > 0 && remaining <= 100000 ? { mode: "rounds", remaining } : null;
}

function expiryText(expiry, turns = null) {
  const mode = text(expiry?.mode);
  const remaining = Math.floor(Number(expiry?.remaining ?? turns));
  if (mode === "manual") return "manuale";
  if (mode === "concentration") return "concentrazione";
  if (mode === "turn-start") return `inizio turno${remaining > 1 ? ` (tra ${remaining})` : ""}`;
  if (mode === "turn-end") return `fine turno${remaining > 1 ? ` (tra ${remaining})` : ""}`;
  return Number.isFinite(remaining) && remaining > 0 ? `${remaining} round` : "manuale";
}

function remainingOf(expiry, turns = null) {
  const mode = text(expiry?.mode);
  if (mode === "manual" || mode === "concentration") return null;
  const remaining = Math.floor(Number(mode === "turn-start" || mode === "turn-end" || mode === "rounds" ? expiry?.remaining ?? turns : turns ?? expiry?.remaining));
  return Number.isFinite(remaining) && remaining > 0 ? remaining : null;
}

// Round-based spells count down `turns`; only turn-anchored or manual spells carry their own expiry.
function spellTiming(spell) {
  const mode = text(spell?.expiry?.mode);
  return mode === "turn-start" || mode === "turn-end" || mode === "manual"
    ? spell.expiry
    : { mode: "rounds", remaining: spell?.turns };
}

// Describes what a right-clicked pill controls, so the popup can show it before any change.
export function describeEffectDurationTarget(items = [], { itemId = "", conditionInstanceId = "", spellInstanceId = "" } = {}) {
  const list = Array.isArray(items) ? items : [];
  const item = list.find((entry) => entry?.id === text(itemId));
  if (!item) return null;
  const instance = text(conditionInstanceId)
    ? conditionInstancesOf(item).find((entry) => text(entry?.id) === text(conditionInstanceId))
    : null;
  const spellId = text(spellInstanceId)
    || (text(instance?.type) === "spell" ? text(instance?.parentEffectId) : "");
  const spellCarrier = spellId
    ? list.find((entry) => spellsOf(entry).some((spell) => text(spell?.instanceId) === spellId))
    : null;
  if (spellCarrier) {
    const spell = spellsOf(spellCarrier).find((entry) => text(entry?.instanceId) === spellId);
    const targetIds = list.filter((entry) => (
      spellsOf(entry).some((value) => text(value?.instanceId) === spellId)
      || conditionInstancesOf(entry).some((value) => text(value?.parentEffectId) === spellId)
    )).map((entry) => entry.id);
    return {
      kind: "spell",
      label: text(spell?.name) || "Incantesimo",
      current: expiryText(spellTiming(spell), spell?.turns),
      remaining: remainingOf(spellTiming(spell), spell?.turns),
      concentration: spell?.conc === true,
      spellInstanceId: spellId,
      targetIds,
    };
  }
  if (!instance) return null;
  const parentId = text(instance.parentEffectId);
  if ((instance.type === "class-feature" || instance.type === "class-feature-area") && parentId && text(instance.sourceId)) {
    const targetIds = list.filter((entry) => conditionInstancesOf(entry)
      .some((value) => text(value?.parentEffectId) === parentId)).map((entry) => entry.id);
    return {
      kind: "class-feature",
      label: text(instance.displayLabel || instance.condition) || "Capacità",
      current: expiryText(instance.expiry),
      remaining: remainingOf(instance.expiry),
      sourceId: text(instance.sourceId),
      featureInstanceId: parentId,
      targetIds,
    };
  }
  return {
    kind: "condition",
    label: text(instance.displayLabel || instance.condition) || "Effetto",
    current: expiryText(instance.expiry),
    remaining: remainingOf(instance.expiry),
    conditionInstanceId: text(instance.id),
    targetIds: [item.id],
  };
}

export function planEffectDurationOverride(target, override, { currentRound = 1 } = {}) {
  const value = normalizeDurationOverride(override);
  if (!target || !value) return { ok: false, error: "Indica una durata valida." };
  const operations = [];
  if (target.kind === "class-feature") {
    operations.push({
      type: "class-feature:set-expiry",
      sourceId: target.sourceId,
      instanceId: target.featureInstanceId,
      remaining: value.mode === "manual" ? null : value.remaining,
      currentRound: Math.max(1, Math.floor(Number(currentRound) || 1)),
      ignoreMissing: false,
    });
  }
  operations.push({
    type: "effects:set-duration",
    targetIds: target.targetIds,
    override: value,
    ...(target.kind === "condition" ? { conditionInstanceIds: [target.conditionInstanceId] } : {}),
    ...(target.kind === "spell" ? { parentEffectId: target.spellInstanceId, spellInstanceId: target.spellInstanceId } : {}),
    ...(target.kind === "class-feature" ? { parentEffectId: target.featureInstanceId } : {}),
  });
  const durationLabel = value.mode === "manual" ? "manuale" : `${value.remaining} round`;
  return { ok: true, operations, label: `Durata ${target.label}: ${durationLabel}`, targetIds: target.targetIds };
}
