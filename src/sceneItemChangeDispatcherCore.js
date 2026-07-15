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
    if (!previous) flags.added = true;
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
    return { flags, items: [], removedItems: [], allItems, changedIds: [] };
  }

  flags.activeTurnLabelOnly = changedRecords.every(({ before: previous, after: next }) =>
    !!(next?.isActiveTurnLabel || previous?.isActiveTurnLabel)
  );
  if (flags.activeTurnLabelOnly) {
    return { flags, items: changedItems, removedItems, allItems, changedIds };
  }

  for (const { before: previous, after: next } of changedRecords) {
    const lifecycleChange = !previous || !next;
    markPluginTokenChange(flags, previous, next, lifecycleChange);

    const conditionWidgetChanged = !!(previous?.isConditionWidget || next?.isConditionWidget);
    const concentrationWidgetChanged = !!(previous?.isConcentrationWidget || next?.isConcentrationWidget);
    const hpWidgetChanged = !!(previous?.isHPWidget || next?.isHPWidget);
    flags.widgets ||= conditionWidgetChanged || concentrationWidgetChanged || hpWidgetChanged;

    // Le due pile condividono lo spazio: il cambiamento di una riallinea l'altra.
    flags.concentration ||= conditionWidgetChanged;
    flags.conditions ||= concentrationWidgetChanged;
  }

  return { flags, items: changedItems, removedItems, allItems, changedIds };
}

export function classifySceneItemChanges(beforeItems = [], afterItems = []) {
  return classifySceneItemSnapshots(
    createSceneItemsSnapshot(beforeItems),
    createSceneItemsSnapshot(afterItems)
  );
}

export function createSceneItemChangeDispatcher({
  subscribeSource,
  debounceMs = 50,
  initialItems = [],
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  if (typeof subscribeSource !== "function") {
    throw new TypeError("subscribeSource must be a function");
  }

  const subscribers = new Set();
  let currentSnapshot = createSceneItemsSnapshot(initialItems);
  let batchBaseSnapshot = null;
  let timer = null;
  let unsubscribeSource = null;

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

    const event = classifySceneItemSnapshots(batchBaseSnapshot, currentSnapshot);
    batchBaseSnapshot = null;
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
    const nextSnapshot = createSceneItemsSnapshot(items);
    const immediateEvent = classifySceneItemSnapshots(currentSnapshot, nextSnapshot);
    if (!immediateEvent.flags.any) return;
    if (!batchBaseSnapshot) batchBaseSnapshot = currentSnapshot;
    currentSnapshot = nextSnapshot;

    for (const subscriber of subscribers) {
      if (subscriber.immediate) runSubscriber(subscriber, immediateEvent, true);
    }
    if ([...subscribers].some((subscriber) => !subscriber.immediate)) scheduleFlush();
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
      if (timer) clearTimer(timer);
      timer = null;
      batchBaseSnapshot = null;
    };
  }

  return { subscribe, flush };
}