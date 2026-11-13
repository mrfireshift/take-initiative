// CAP-CARRIAGE (docs/PIANO_AUTOMAZIONE_INCANTESIMI.md): a zone that holds creatures and carries them, with a capacity.
// Watery Sphere (Xanathar): it holds up to four Medium or smaller creatures, or one Large; a Huge or larger creature
// succeeds on the save on its own. A creature it restrains beyond that makes a random creature already held fall out,
// prone, within 1.5 m of it (decisions C-D3 and C-D4 of 11/11/2026). The size is the token's, on the grid (tokenCells).
// The creature that falls out lands within 1.5 m, one too large to be held leaves the zone (decisions SA-D1 and SA-D2
// of 12/11/2026): carriageEjectionRequests, placed by the coordinator (zoneEjectionCore.js). Pure: the coordinator
// expands the operation with the scene's items (expandStateDependentOperations in effectsMutations.js), so the fall is
// in the same command and the same Undo.
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
          effectDetail: "È caduto dalla sfera, che era piena.",
        },
      }, { type: "condition:automate", subjectIds: fallenIds }] : []),
    ],
  };
}

// The carriage of a zone whose creatures leave it (mechanics.carriage with exitOnSave): one that makes its save, or is
// too large to be held, goes to the nearest free space outside; one that falls out lands within fallWithinSquares.
// null for a carriage without it.
export function carriageExitOf(mechanics) {
  const carriage = mechanics?.carriage;
  if (!carriage || typeof carriage !== "object" || carriage.exitOnSave !== true) return null;
  const within = Number(carriage.fallWithinSquares);
  return { fallWithinSquares: Number.isInteger(within) && within >= 0 ? within : null };
}

// The carriage of a spell's held effect, from its save automation: the failed outcome's rule that carries.
export function spellCarriageExit(automation) {
  const rules = Array.isArray(automation?.rulesByOutcome?.failed) ? automation.rulesByOutcome.failed : [];
  for (const rule of rules) {
    const exit = carriageExitOf(rule?.options?.mechanics);
    if (exit) return exit;
  }
  return null;
}

// CAP-CARRIAGE (decision SA-D5 of 12/11/2026): a zone that carries creatures (Watery Sphere) dragged by hand takes the
// creatures it holds along, by the same offset. control is where the plugin last put the zone (its ⚡ movement, that
// movement's Undo, this follow: the zone's movementControl); a zone elsewhere was moved by the GM. roots: [{ id,
// instanceId, position, control, carriedEffectIds }]; items: the scene's items; movedIds: the tokens that moved by
// themselves since the last look (dragged with the zone, several tokens selected), not moved twice. Each entry:
// { rootId, control, moves: [{ id, position }] }, control the zone's new place; a zone with no place recorded yet (one
// cast before this rule) only gets it.
export const CARRIAGE_FOLLOW_COMMAND_ID = "carriage-follow";

function followPoint(value) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

export function planCarriageFollow({ roots = [], items = [], movedIds = [] } = {}) {
  const moved = new Set((Array.isArray(movedIds) ? movedIds : []).map((id) => String(id || "").trim()));
  const entries = [];
  for (const root of Array.isArray(roots) ? roots : []) {
    const rootId = String(root?.id || "").trim();
    const instanceId = String(root?.instanceId || "").trim();
    const effectIds = new Set((Array.isArray(root?.carriedEffectIds) ? root.carriedEffectIds : [])
      .map((id) => String(id || "").trim()).filter(Boolean));
    const position = followPoint(root?.position);
    if (!rootId || !instanceId || !effectIds.size || !position) continue;
    const control = { commandId: CARRIAGE_FOLLOW_COMMAND_ID, position };
    const recorded = followPoint(root?.control?.position);
    if (!recorded) {
      entries.push({ rootId, control, moves: [] });
      continue;
    }
    const delta = { x: position.x - recorded.x, y: position.y - recorded.y };
    if (Math.abs(delta.x) < 1e-6 && Math.abs(delta.y) < 1e-6) continue;
    const moves = (Array.isArray(items) ? items : [])
      .filter((item) => item?.layer === "CHARACTER" && !item?.attachedTo && !moved.has(String(item?.id || "").trim()))
      .filter((item) => conditionsOf(item).some((instance) => (
        String(instance?.parentEffectId || "").trim() === instanceId
          && effectIds.has(String(instance?.effectId || "").trim())
      )))
      .map((item) => ({ item, from: followPoint(item.position) }))
      .filter(({ from }) => !!from)
      .map(({ item, from }) => ({ id: item.id, position: { x: from.x + delta.x, y: from.y + delta.y } }));
    entries.push({ rootId, control, moves });
  }
  return entries;
}

// Where the creatures an expansion put out go (zoneEjectionCore.js): the fallen within fallWithinSquares of the zone,
// the too large anywhere outside it. instanceId: the zone's spell, whose area the coordinator finds.
export function carriageEjectionRequests(operation, expansion) {
  const exit = carriageExitOf(operation?.options?.mechanics);
  const instanceId = String(operation?.options?.parentEffectId || "").trim();
  if (!exit || !instanceId) return [];
  return [
    ...(Array.isArray(expansion?.fallenIds) ? expansion.fallenIds : []).map((targetId) => ({
      targetId,
      instanceId,
      withinSquares: exit.fallWithinSquares,
      reason: "fall-out",
    })),
    ...(Array.isArray(expansion?.tooLargeIds) ? expansion.tooLargeIds : []).map((targetId) => ({
      targetId,
      instanceId,
      withinSquares: null,
      reason: "too-large",
    })),
  ];
}
