import { ACTIVE_TURN_LABEL_META, ID } from "./constants.js";

const META_KEY = ID + "/meta";
const SPELLS_META_KEY = ID + "/spells";
const CONCENTRATION_META_KEY = ID + "/concentration";
const CONDITION_WIDGET_META = ID + "/condWidgetOf";
const CONCENTRATION_WIDGET_META = ID + "/concWidgetOf";
const HP_BAR_META = ID + "/hpbar";
const HP_TEXT_META = ID + "/hptext";

function fingerprint(value) {
  const seen = new WeakSet();
  const json = JSON.stringify(value, (_key, current) => {
    if (!current || typeof current !== "object") return current;
    if (seen.has(current)) return "[Circular]";
    seen.add(current);
    if (Array.isArray(current)) return current;
    return Object.keys(current).sort().reduce((result, key) => {
      result[key] = current[key];
      return result;
    }, {});
  });
  return json === undefined ? "undefined" : json;
}

function snapshotItem(item) {
  const metadata = item?.metadata || {};
  const pluginMeta = metadata[META_KEY];
  const trackerMeta = pluginMeta && typeof pluginMeta === "object"
    ? Object.fromEntries(Object.entries(pluginMeta).filter(([key]) => key !== "speedCheckMovement"))
    : pluginMeta;
  return {
    id: item.id,
    item,
    isPluginToken: !!pluginMeta,
    isActiveTurnLabel: !!metadata[ACTIVE_TURN_LABEL_META],
    isConditionWidget: !!metadata[CONDITION_WIDGET_META],
    isConcentrationWidget: !!metadata[CONCENTRATION_WIDGET_META],
    isHPWidget: !!metadata[HP_BAR_META] || !!metadata[HP_TEXT_META],
    nameSignature: fingerprint(item?.name),
    imageSignature: fingerprint(item?.image),
    positionSignature: fingerprint(item?.position),
    pluginMetaSignature: fingerprint(pluginMeta),
    trackerMetaSignature: fingerprint(trackerMeta),
    speedCheckSignature: fingerprint(pluginMeta?.speedCheckMovement),
    hpSignature: fingerprint([pluginMeta?.hp, pluginMeta?.hpMax]),
    attitudeSignature: fingerprint(pluginMeta?.attitude),
    conditionsSignature: fingerprint(pluginMeta?.conditions),
    spellsSignature: fingerprint(pluginMeta?.[SPELLS_META_KEY]),
    concentrationSignature: fingerprint(pluginMeta?.[CONCENTRATION_META_KEY]),
    contentSignature: fingerprint({
      type: item?.type,
      name: item?.name,
      image: item?.image,
      text: item?.text,
      position: item?.position,
      rotation: item?.rotation,
      scale: item?.scale,
      width: item?.width,
      height: item?.height,
      visible: item?.visible,
      locked: item?.locked,
      layer: item?.layer,
      zIndex: item?.zIndex,
      attachedTo: item?.attachedTo,
      metadata,
    }),
  };
}

export function createSceneItemsSnapshot(items = []) {
  return new Map((Array.isArray(items) ? items : [])
    .filter((item) => item?.id)
    .map((item) => [item.id, snapshotItem(item)]));
}

function createFlags() {
  return {
    any: false,
    added: false,
    removed: false,
    movement: false,
    speedCheck: false,
    tracker: false,
    hpBars: false,
    hpMemory: false,
    hpMemoryAutofill: false,
    conditions: false,
    concentration: false,
    widgets: false,
    activeTurnLabelOnly: false,
  };
}

function markPluginTokenChange(flags, before, after, lifecycleChange) {
  if (!before?.isPluginToken && !after?.isPluginToken) return;

  const nameChanged = lifecycleChange || before?.nameSignature !== after?.nameSignature;
  const imageChanged = lifecycleChange || before?.imageSignature !== after?.imageSignature;
  const metaChanged = lifecycleChange || before?.trackerMetaSignature !== after?.trackerMetaSignature;
  const speedCheckChanged = lifecycleChange || before?.speedCheckSignature !== after?.speedCheckSignature;
  const hpChanged = lifecycleChange || before?.hpSignature !== after?.hpSignature;
  const attitudeChanged = lifecycleChange || before?.attitudeSignature !== after?.attitudeSignature;
  const conditionsChanged = lifecycleChange || before?.conditionsSignature !== after?.conditionsSignature;
  const spellsChanged = lifecycleChange || before?.spellsSignature !== after?.spellsSignature;
  const concentrationChanged = lifecycleChange || before?.concentrationSignature !== after?.concentrationSignature;

  flags.movement ||= !lifecycleChange && before?.positionSignature !== after?.positionSignature;
  flags.speedCheck ||= speedCheckChanged;
  flags.tracker ||= nameChanged || imageChanged || metaChanged;
  flags.hpBars ||= hpChanged || attitudeChanged;
  flags.hpMemory ||= nameChanged || imageChanged || attitudeChanged;
  flags.hpMemoryAutofill ||= nameChanged || imageChanged || metaChanged;
  flags.conditions ||= conditionsChanged;
  flags.concentration ||= spellsChanged || concentrationChanged;
}

export function classifySceneItemSnapshots(beforeSnapshot, afterSnapshot) {
  const before = beforeSnapshot || new Map();
  const after = afterSnapshot || new Map();
  const changedItems = [];
  const removedItems = [];
  const changedRecords = [];
  const flags = createFlags();

  for (const [id, next] of after) {
    const previous = before.get(id);
    if (previous && previous.contentSignature === next.contentSignature) continue;
    changedItems.push(next.item);
    changedRecords.push({ before: previous || null, after: next });
    if (!previous) {
      flags.added = true;
      flags.hpMemoryAutofill ||= next?.item?.layer === "CHARACTER" && !next?.item?.attachedTo;
    }
  }

  for (const [id, previous] of before) {
    if (after.has(id)) continue;
    removedItems.push(previous.item);
    changedRecords.push({ before: previous, after: null });
    flags.removed = true;
  }

  flags.any = changedRecords.length > 0;
  const allItems = [...after.values()].map((entry) => entry.item);
  const changedIds = changedRecords
    .map(({ before: previous, after: next }) => next?.id || previous?.id)
    .filter(Boolean);

  if (!flags.any) {
    return { flags, items: [], removedItems: [], allItems, changedIds: [], changedRecords: [] };
  }

  flags.activeTurnLabelOnly = changedRecords.every(({ before: previous, after: next }) =>
    !!(next?.isActiveTurnLabel || previous?.isActiveTurnLabel)
  );
  if (flags.activeTurnLabelOnly) {
    return { flags, items: changedItems, removedItems, allItems, changedIds, changedRecords };
  }

  for (const { before: previous, after: next } of changedRecords) {
    const lifecycleChange = !previous || !next;
    markPluginTokenChange(flags, previous, next, lifecycleChange);

    const conditionWidgetChanged = !!(previous?.isConditionWidget || next?.isConditionWidget);
    const concentrationWidgetChanged = !!(previous?.isConcentrationWidget || next?.isConcentrationWidget);
    const hpWidgetChanged = !!(previous?.isHPWidget || next?.isHPWidget);
    flags.widgets ||= conditionWidgetChanged || concentrationWidgetChanged || hpWidgetChanged;

    // I widget sono output derivati. Non devono riattivare i due renderer:
    // il coordinatore li esegue già in ordine (spell, poi condizioni).
  }

  return { flags, items: changedItems, removedItems, allItems, changedIds, changedRecords };
}

export function classifySceneItemChanges(beforeItems = [], afterItems = []) {
  return classifySceneItemSnapshots(
    createSceneItemsSnapshot(beforeItems),
    createSceneItemsSnapshot(afterItems)
  );
}

export async function hydrateSceneItemChangeDispatcher({
  dispatcher,
  readItems,
  isCurrent = null,
} = {}) {
  if (!dispatcher || typeof dispatcher.resume !== "function" ||
      typeof dispatcher.getSuspendedRevision !== "function") {
    throw new TypeError("scene-items-hydration-requires-dispatcher");
  }
  if (typeof readItems !== "function") {
    throw new TypeError("scene-items-hydration-requires-reader");
  }
  const canResume = () => typeof isCurrent !== "function" || isCurrent();

  while (canResume()) {
    const suspendedRevision = dispatcher.getSuspendedRevision();
    const items = await readItems();
    if (!canResume()) return false;
    if (dispatcher.resume(items, { expectedSuspendedRevision: suspendedRevision })) {
      return true;
    }
  }
  return false;
}

export function createSceneItemChangeDispatcher({
  subscribeSource,
  debounceMs = 50,
  initialItems = [],
  getEpoch = null,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  if (typeof subscribeSource !== "function") {
    throw new TypeError("subscribeSource must be a function");
  }

  const subscribers = new Set();
  let currentSnapshot = createSceneItemsSnapshot(initialItems);
  let batchBaseSnapshot = null;
  let batchEpoch = null;
  let timer = null;
  let unsubscribeSource = null;
  let suspended = false;
  let suspendedRevision = 0;

  function currentEpoch() {
    return typeof getEpoch === "function" ? getEpoch() : undefined;
  }

  function attachEpoch(event, epoch) {
    if (epoch !== undefined) event.sceneEpoch = epoch;
    return event;
  }

  function clearPendingBatch() {
    if (timer) {
      clearTimer(timer);
      timer = null;
    }
    batchBaseSnapshot = null;
    batchEpoch = null;
  }

  function runSubscriber(subscriber, event, immediate) {
    if (subscriber.filter && !subscriber.filter(event)) return null;
    if (immediate) {
      try {
        const result = subscriber.handler(event);
        if (result?.catch) {
          result.catch((error) => console.error("[scene-items] immediate subscriber", error));
        }
      } catch (error) {
        console.error("[scene-items] immediate subscriber", error);
      }
      return null;
    }

    const run = () => subscriber.handler(event);
    subscriber.queue = subscriber.queue.then(run, run);
    subscriber.queue.catch((error) => console.error("[scene-items] subscriber", error));
    return subscriber.queue;
  }

  function flush() {
    if (timer) {
      clearTimer(timer);
      timer = null;
    }
    if (!batchBaseSnapshot) return Promise.resolve();

    const event = attachEpoch(
      classifySceneItemSnapshots(batchBaseSnapshot, currentSnapshot),
      batchEpoch,
    );
    batchBaseSnapshot = null;
    batchEpoch = null;
    if (!event.flags.any) return Promise.resolve();

    const pending = [];
    for (const subscriber of subscribers) {
      if (subscriber.immediate) continue;
      const task = runSubscriber(subscriber, event, false);
      if (task) pending.push(task);
    }
    return Promise.allSettled(pending);
  }

  function scheduleFlush() {
    if (timer) clearTimer(timer);
    timer = setTimer(() => { void flush(); }, debounceMs);
  }

  function onSourceChange(items = []) {
    if (suspended) {
      suspendedRevision += 1;
      return;
    }
    const nextSnapshot = createSceneItemsSnapshot(items);
    const sourceEpoch = currentEpoch();
    const immediateEvent = attachEpoch(
      classifySceneItemSnapshots(currentSnapshot, nextSnapshot),
      sourceEpoch,
    );
    if (!immediateEvent.flags.any) return;
    if (!batchBaseSnapshot) batchBaseSnapshot = currentSnapshot;
    if (batchEpoch === null) batchEpoch = sourceEpoch;
    currentSnapshot = nextSnapshot;

    for (const subscriber of subscribers) {
      if (subscriber.immediate) runSubscriber(subscriber, immediateEvent, true);
    }
    if ([...subscribers].some((subscriber) => !subscriber.immediate)) scheduleFlush();
  }

  function suspend() {
    clearPendingBatch();
    currentSnapshot = new Map();
    suspended = true;
    suspendedRevision += 1;
  }

  function resume(items = [], { expectedSuspendedRevision = null } = {}) {
    if (
      expectedSuspendedRevision !== null
      && Number(expectedSuspendedRevision) !== suspendedRevision
    ) {
      return false;
    }
    clearPendingBatch();
    currentSnapshot = createSceneItemsSnapshot(items);
    suspended = false;
    return true;
  }

  function getSuspendedRevision() {
    return suspendedRevision;
  }

  function reset(items = []) {
    clearPendingBatch();
    currentSnapshot = createSceneItemsSnapshot(items);
  }

  function subscribe(handler, options = {}) {
    if (typeof handler !== "function") throw new TypeError("handler must be a function");
    const subscriber = {
      handler,
      filter: typeof options.filter === "function" ? options.filter : null,
      immediate: options.immediate === true,
      queue: Promise.resolve(),
    };
    subscribers.add(subscriber);
    if (!unsubscribeSource) unsubscribeSource = subscribeSource(onSourceChange);

    return () => {
      subscribers.delete(subscriber);
      if (subscribers.size || !unsubscribeSource) return;
      unsubscribeSource();
      unsubscribeSource = null;
      clearPendingBatch();
    };
  }

  return { subscribe, flush, suspend, resume, reset, getSuspendedRevision };
}
