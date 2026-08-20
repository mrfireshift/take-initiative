import { ID } from "./constants.js";
import { buildEffectSaveReminderResolution } from "./reminderResolutionCore.js";
import { currentInitiativeTurnKey } from "./turnBoundaryCore.js";

const META_KEY = `${ID}/meta`;
export const COMPULSION_SPELL_ID = "compulsion";
export const COMPULSION_MOVEMENT_EFFECT_ID = "compulsion-forced-movement";

function actorId(value) {
  const id = String(value || "").trim();
  if (!id || id === "__LAIR__" || id.startsWith("__EPIC__")) return "";
  return id.replace(/::p\d+$/, "");
}

function currentActorId(state) {
  const order = Array.isArray(state?.order) ? state.order : [];
  if (!order.length) return "";
  const current = Math.max(
    0,
    Math.min(order.length - 1, Math.floor(Number(state?.current) || 0)),
  );
  return actorId(order[current]);
}

function conditionInstances(item) {
  const conditions = item?.metadata?.[META_KEY]?.conditions;
  if (Array.isArray(conditions)) return conditions;
  return Array.isArray(conditions?.instances) ? conditions.instances : [];
}

function spellSaveDC(item) {
  const value = Number(item?.metadata?.[META_KEY]?.initiativeCard?.spellSaveDC);
  return Number.isFinite(value) ? Math.max(0, Math.min(99, Math.round(value))) : null;
}

function itemPortrait(item) {
  return String(
    item?.image?.url
      || item?.image?.src
      || item?.asset?.image?.url
      || "",
  ).trim().slice(0, 2048);
}

function movedTargetIds(changedRecords = []) {
  return Array.from(new Set(
    (Array.isArray(changedRecords) ? changedRecords : [])
      .filter((record) => (
        record?.flags?.movement === true
        || record?.domains?.includes?.("movement")
      ))
      .map((record) => String(record?.after?.item?.id || record?.after?.id || "").trim())
      .filter(Boolean),
  ));
}

function activeCompulsionInstances(item) {
  return conditionInstances(item).filter((instance) => (
    instance?.active !== false
    && String(instance?.effectId || "").trim() === COMPULSION_MOVEMENT_EFFECT_ID
    && String(instance?.spellId || "").trim() === COMPULSION_SPELL_ID
    && String(instance?.id || "").trim()
  ));
}

export function planCompulsionMovementReminderNotices({
  items = [],
  changedRecords = [],
  initiativeState = null,
} = {}) {
  const turnKey = currentInitiativeTurnKey(initiativeState);
  const activeActorId = currentActorId(initiativeState);
  if (!turnKey || !activeActorId) return [];

  const movedIds = new Set(movedTargetIds(changedRecords));
  if (!movedIds.has(activeActorId)) return [];

  const list = Array.isArray(items) ? items : [];
  const itemsById = new Map(list.map((item) => [String(item?.id || "").trim(), item]));
  const target = itemsById.get(activeActorId);
  if (!target) return [];

  const notices = [];
  for (const instance of activeCompulsionInstances(target)) {
    const sourceId = String(instance?.sourceId || "").trim();
    const source = itemsById.get(sourceId);
    const dc = spellSaveDC(source);
    const activationId = `${instance.id}:movement:${turnKey}`;
    const reminder = {
      ability: "wis",
      dcSource: "source-spell",
      success: "remove-effect",
      label: "Dopo il movimento imposto, effettua il TS Saggezza per terminare Compulsione su questo bersaglio.",
    };
    const resolution = buildEffectSaveReminderResolution({
      item: target,
      instance,
      reminder,
      dc,
      activationId,
      turnKey,
      slotLevel: instance?.slotLevel ?? null,
    });
    if (!resolution) continue;

    notices.push({
      activationId,
      turnKey,
      effectName: "Compulsione",
      spellName: "Compulsione",
      spellId: COMPULSION_SPELL_ID,
      saveLabel: `TS Saggezza${dc === null ? "" : ` CD ${dc}`}`,
      instruction: reminder.label,
      timing: "movement-end",
      ability: "SAG",
      ...(dc !== null ? { dc } : {}),
      ...(source?.name ? { sourceName: String(source.name).trim().slice(0, 100) } : {}),
      kind: "effect-save",
      resolution,
      target: {
        id: target.id,
        name: String(target.name || "Token").trim().slice(0, 100) || "Token",
        portrait: itemPortrait(target),
      },
    });
  }

  return notices;
}
