// CAP-CARRIAGE (docs/PIANO_AUTOMAZIONE_INCANTESIMI.md): a zone that holds creatures and carries them, with a capacity.
// Watery Sphere (Xanathar): it holds up to four Medium or smaller creatures, or one Large; a Huge or larger creature
// succeeds on the save on its own. A creature it restrains beyond that makes a random creature already held fall out,
// prone, within 1.5 m of it (decisions C-D3 and C-D4 of 11/11/2026). The size is the token's, on the grid (tokenCells);
// the creature that falls out the GM puts down. Pure: the coordinator expands the operation with the scene's items
// (expandStateDependentOperations in effectsMutations.js), so the fall is in the same command and the same Undo.
import { ID } from "./constants.js";

const META_KEY = `${ID}/meta`;

// tokenCells of tokenSizeCore.js, the same count: imported from there it would bring the spell catalog into the
// frequent popovers that load effectsMutations.js (test/spellAreaIndex.test.js).
function tokenCells(item) {
  if (!item || item.type !== "IMAGE" || !item.image || !item.grid) return 0;
  const width = Number(item.image.width) / Number(item.grid.dpi);
  const height = Number(item.image.height) / Number(item.grid.dpi);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 0;
  const across = width * (Math.abs(Number(item.scale?.x)) || 1);
  const down = height * (Math.abs(Number(item.scale?.y)) || 1);
  return Math.max(1, Math.round(Math.max(across, down)));
}

// The room a creature takes: 1 up to Medium, the whole capacity for a Large one; null for a Huge or larger, which the
// zone does not hold.
export function carriageUnits(item, carriage = {}) {
  const cells = tokenCells(item);
  if (cells >= 3) return null;
  return cells === 2 ? Math.max(1, Math.floor(Number(carriage.largeUnits) || 1)) : 1;
}

function conditionsOf(item) {
  const value = item?.metadata?.[META_KEY]?.conditions;
  const instances = Array.isArray(value) ? value : Array.isArray(value?.instances) ? value.instances : [];
  return instances.filter((instance) => instance && instance.active !== false);
}

// Its pill of this zone: the effect the zone carries, linked to the zone's spell.
function heldInstance(item, parentEffectId, effectId) {
  return conditionsOf(item).find((instance) => (
    String(instance?.parentEffectId || "").trim() === parentEffectId
      && String(instance?.effectId || "").trim() === effectId
  )) || null;
}

// The operations for a condition:add of a carried effect (options.mechanics.carriage): the creatures it holds, those
// that fall out (their pill gone, Prono), the Huge ones left out. random: a function returning [0, 1).
export function expandCarriageConditionAdd(operation, sceneItems = [], { random = Math.random } = {}) {
  const carriage = operation?.options?.mechanics?.carriage || {};
  const capacity = Math.max(1, Math.floor(Number(carriage.capacity) || 1));
  const parentEffectId = String(operation?.options?.parentEffectId || "").trim();
  const effectId = String(operation?.options?.effectId || "").trim();
  const byId = new Map((Array.isArray(sceneItems) ? sceneItems : []).map((item) => [item?.id, item]));
  const targetIds = [...new Set((Array.isArray(operation?.targetIds) ? operation.targetIds : [])
    .map((id) => String(id || "").trim()).filter(Boolean))];
  if (!parentEffectId || !effectId) return { operations: [operation], keptIds: targetIds, fallenIds: [], tooLargeIds: [] };

  const unitsOf = (item) => carriageUnits(item, carriage);
  const tooLargeIds = targetIds.filter((id) => byId.has(id) && unitsOf(byId.get(id)) === null);
  const incoming = targetIds
    .filter((id) => !tooLargeIds.includes(id))
    .filter((id) => !byId.has(id) || !heldInstance(byId.get(id), parentEffectId, effectId));
  const held = (Array.isArray(sceneItems) ? sceneItems : [])
    .filter((item) => item?.layer === "CHARACTER" && !item?.attachedTo && !!item?.metadata?.[META_KEY])
    .filter((item) => !targetIds.includes(item.id) && heldInstance(item, parentEffectId, effectId));
  const units = (id) => (byId.has(id) ? unitsOf(byId.get(id)) ?? 0 : 1);
  let total = [...held.map((item) => item.id), ...incoming].reduce((sum, id) => sum + units(id), 0);

  // A random creature already held falls out first; with nobody else held (the cast), one of the new ones.
  const fallenHeld = [];
  const fallenIncoming = [];
  const pool = held.map((item) => item.id);
  const fresh = [...incoming];
  while (total > capacity && (pool.length || fresh.length > 1)) {
    const source = pool.length ? pool : fresh;
    const index = Math.min(source.length - 1, Math.floor(Math.max(0, Number(random()) || 0) * source.length));
    const [fallen] = source.splice(index, 1);
    (source === pool ? fallenHeld : fallenIncoming).push(fallen);
    total -= units(fallen);
  }
  const keptIds = fresh;
  const fallenIds = [...fallenHeld, ...fallenIncoming];
  const removals = fallenHeld.map((id) => ({ itemId: id, instanceId: String(heldInstance(byId.get(id), parentEffectId, effectId)?.id || "") }))
    .filter((removal) => removal.instanceId);
  const sourceName = String(operation?.options?.sourceName || "").trim();
  return {
    keptIds,
    fallenIds,
    tooLargeIds,
    operations: [
      ...(keptIds.length ? [{ ...operation, targetIds: keptIds }] : []),
      ...(removals.length ? [{ type: "condition:remove-instances", removals }] : []),
      ...(fallenIds.length ? [{
        type: "condition:add",
        targetIds: fallenIds,
        conditionName: "Prono",
        options: {
          type: "spell",
          ...(operation?.options?.sourceId ? { sourceId: operation.options.sourceId } : {}),
          ...(sourceName ? { sourceName } : {}),
          expiry: { mode: "manual" },
          effectDetail: "È caduto dalla sfera, che era piena: posalo entro 1,5 m da lei.",
        },
      }, { type: "condition:automate", subjectIds: fallenIds }] : []),
    ],
  };
}
