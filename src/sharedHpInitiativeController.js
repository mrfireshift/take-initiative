import { ID } from "./constants.js";
import { isSharedHpInitiativeExcluded } from "./sharedHpCore.js";
import { sanitizeState } from "./initiativeOrderCore.js";
import { INITIATIVE_EPIC_ACTION_PREFIX, splitParagonId } from "./initiativeSelectionProjectionCore.js";

export function sharedHpInitiativeState(state, items) {
  const excluded = new Set(items.filter(isSharedHpInitiativeExcluded).map(item => item.id));
  if (!excluded.size) return state;
  const keep = (state.order || []).filter(id => {
    if (excluded.has(id) || excluded.has(splitParagonId(id).baseId)) return false;
    if (String(id).startsWith(`${INITIATIVE_EPIC_ACTION_PREFIX}::`)) {
      const parts = String(id).split("::");
      if (excluded.has(parts[1]) || excluded.has(parts[3])) return false;
    }
    return true;
  });
  if (keep.length === (state.order || []).length) return state;
  const sanitized = sanitizeState(state, new Map(keep.map(id => [id, { id }])));
  const paragonInits = { ...(sanitized.paragonInits || {}) };
  for (const id of excluded) delete paragonInits[id];
  return { ...state, ...sanitized, paragonInits };
}

export function createSharedHpInitiativeController({ readItems, enqueueStateReducer, subscribeItems,
  isCurrent, getSceneEpoch = () => undefined, reconcileFactions = async () => {}, logger = console }) {
  let unsubscribe = null; let active = false; let generation = 0;
  const reconcile = async () => {
    const scope = generation; const epoch = getSceneEpoch();
    if (!active || !isCurrent(epoch)) return;
    const items = await readItems();
    if (!active || scope !== generation || !isCurrent(epoch) || !items.some(isSharedHpInitiativeExcluded)) return;
    await reconcileFactions(items, epoch);
    if (!active || scope !== generation || !isCurrent(epoch)) return;
    return enqueueStateReducer({ kind: "shared-hp-exclusion", ownedFields: ["order", "current", "round", "paragonInits"],
      ...(Number.isInteger(epoch) ? { sceneEpoch: epoch } : {}),
      reducer: async previous => {
        if (!active || scope !== generation || !isCurrent(epoch)) return previous;
        const live = await readItems();
        if (!active || scope !== generation || !isCurrent(epoch)) return previous;
        return sharedHpInitiativeState(previous, live);
      } });
  };
  return {
    async start() {
      if (active) return;
      active = true; generation++;
      unsubscribe = subscribeItems(event => {
        if (!active || (event?.flags?.trackerStructure === false && event?.flags?.attitude !== true)) return;
        return reconcile().catch(error => logger.warn("[shared-hp] initiative:", error));
      });
      await reconcile();
    },
    reconcile,
    stop() { active = false; generation++; unsubscribe?.(); unsubscribe = null; },
  };
}
