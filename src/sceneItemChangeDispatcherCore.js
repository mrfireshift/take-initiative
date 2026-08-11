import { ACTIVE_TURN_LABEL_META, ID } from "./constants.js";

const META_KEY = ID + "/meta";
const SPELLS_META_KEY = ID + "/spells";
const CONCENTRATION_META_KEY = ID + "/concentration";
const CONDITION_WIDGET_META = ID + "/condWidgetOf";
const CONCENTRATION_WIDGET_META = ID + "/concWidgetOf";
const HP_BAR_META = ID + "/hpbar";
const HP_TEXT_META = ID + "/hptext";
const SPELL_AURA_META = ID + "/spellAura";
const CLASS_FEATURE_AURA_META = ID + "/classFeatureAura";
const CUSTOM_AURA_META = ID + "/customAura";
const STATIC_SPELL_ZONE_META = ID + "/spellStaticZone";
const AOE_AREA_META = ID + "/aoeArea";

export const TRACKER_LOCAL_METADATA_KEYS = new Set([
  "hp",
  "hpMax",
  "conditions",
  SPELLS_META_KEY,
  CONCENTRATION_META_KEY,
  "legendary",
  "legendaryResistances",
  "initTouched",
  "elevation",
  "climbing",
  "customAuras",
]);

const DERIVED_ITEM_METADATA_KEYS = new Set([
  ACTIVE_TURN_LABEL_META,
  CONDITION_WIDGET_META,
  CONCENTRATION_WIDGET_META,
  HP_BAR_META,
  HP_TEXT_META,
  SPELL_AURA_META,
  CLASS_FEATURE_AURA_META,
  CUSTOM_AURA_META,
  STATIC_SPELL_ZONE_META,
  AOE_AREA_META,
]);

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

function metadataObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function derivedItemKind(item) {
  const metadata = metadataObject(item?.metadata);
  for (const key of DERIVED_ITEM_METADATA_KEYS) {
    if (!metadata[key]) continue;
    if (key === ACTIVE_TURN_LABEL_META) return "active-label";
    if (key === CONDITION_WIDGET_META || key === CONCENTRATION_WIDGET_META) {
      return "effects-widget";
    }
    if (key === HP_BAR_META || key === HP_TEXT_META) return "hp-widget";
    if (
      key === SPELL_AURA_META
      || key === CLASS_FEATURE_AURA_META
      || key === CUSTOM_AURA_META
    ) return "aura-visual";
    if (key === STATIC_SPELL_ZONE_META || key === AOE_AREA_META) return "zone-visual";
  }
  return null;
}

function changedMetadataSignatures(pluginMeta) {
  const meta = metadataObject(pluginMeta);
  return Object.fromEntries(
    Object.keys(meta).sort().map((key) => [key, fingerprint(meta[key])]),
  );
}

export function changedSceneItemMetadataKeys(beforeSnapshot, afterSnapshot) {
  const before = metadataObject(beforeSnapshot?.metadataSignatures);
  const after = metadataObject(afterSnapshot?.metadataSignatures);
  return new Set([
    ...Object.keys(before),
    ...Object.keys(after),
  ].filter((key) => before[key] !== after[key]));
}

function canReuseItemSnapshot(previous, item) {
  if (!previous?.item || !item) return false;
  if (previous.item === item) return true;
  const before = previous.item;
  return before.id === item.id
    && before.type === item.type
    && before.layer === item.layer
    && before.name === item.name
    && before.attachedTo === item.attachedTo
    && before.rotation === item.rotation
    && before.width === item.width
    && before.height === item.height
    && before.visible === item.visible
    && before.locked === item.locked
    && before.zIndex === item.zIndex
    && before.position === item.position
    && before.scale === item.scale
    && before.image === item.image
    && before.text === item.text
    && before.metadata === item.metadata;
}

function snapshotItem(item) {
  const metadata = item?.metadata || {};
  const pluginMeta = metadata[META_KEY];
  const metadataSignatures = changedMetadataSignatures(pluginMeta);
  const missingSignature = fingerprint(undefined);
  const metadataSignature = (key) => metadataSignatures[key] ?? missingSignature;
  const speedCheckSignature = metadataSignature("speedCheckMovement");
  const trackerMetaSignature = Object.entries(metadataSignatures)
    .filter(([key]) => key !== "speedCheckMovement")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, signature]) => `${key}:${signature}`)
    .join("\u0000");
  const geometrySignature = fingerprint({
    type: item?.type,
    layer: item?.layer,
    attachedTo: item?.attachedTo,
    position: item?.position,
    rotation: item?.rotation,
    scale: item?.scale,
    width: item?.width,
    height: item?.height,
    visible: item?.visible,
    locked: item?.locked,
    zIndex: item?.zIndex,
  });
  const derivedKind = derivedItemKind(item);
  const externalMetadataSignature = derivedKind
    ? fingerprint(
      Object.fromEntries(
        Object.keys(metadata)
          .filter((key) => key !== META_KEY)
          .sort()
          .map((key) => [key, fingerprint(metadata[key])]),
      ),
    )
    : "none";
  return {
    id: item.id,
    item,
    isPluginToken: !!pluginMeta,
    derivedKind,
    isActiveTurnLabel: !!metadata[ACTIVE_TURN_LABEL_META],
    isConditionWidget: !!metadata[CONDITION_WIDGET_META],
    isConcentrationWidget: !!metadata[CONCENTRATION_WIDGET_META],
    isHPWidget: !!metadata[HP_BAR_META] || !!metadata[HP_TEXT_META],
    nameSignature: fingerprint(item?.name),
    imageSignature: fingerprint(item?.image),
    positionSignature: fingerprint(item?.position),
    geometrySignature,
    pluginMetaSignature: `${trackerMetaSignature}\u0001${speedCheckSignature}`,
    trackerMetaSignature,
    speedCheckSignature,
    metadataSignatures,
    externalMetadataSignature,
    hpSignature: `${metadataSignature("hp")}\u0001${metadataSignature("hpMax")}`,
    attitudeSignature: metadataSignature("attitude"),
    conditionsSignature: metadataSignature("conditions"),
    spellsSignature: metadataSignature(SPELLS_META_KEY),
    concentrationSignature: metadataSignature(CONCENTRATION_META_KEY),
    contentSignature: [
      fingerprint(item?.type),
      fingerprint(item?.name),
      fingerprint(item?.image),
      fingerprint(item?.text),
      geometrySignature,
      trackerMetaSignature,
      speedCheckSignature,
      externalMetadataSignature,
    ].join("\u0001"),
  };
}

export function createSceneItemsSnapshot(items = [], previousSnapshot = null) {
  return new Map((Array.isArray(items) ? items : [])
    .filter((item) => item?.id)
    .map((item) => {
      const previous = previousSnapshot?.get(item.id);
      if (canReuseItemSnapshot(previous, item)) {
        return [item.id, { ...previous, item }];
      }
      return [item.id, snapshotItem(item)];
    }));
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
    trackerStructure: false,
    attitude: false,
    aura: false,
    zone: false,
    preparedSpells: false,
    elevation: false,
    derivedOutput: false,
    derivedEffects: false,
  };
}

function mergeFlags(target, source) {
  for (const key of Object.keys(target)) {
    if (typeof target[key] === "boolean" && source?.[key] === true) {
      target[key] = true;
    }
  }
  return target;
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
  const changedKeys = changedSceneItemMetadataKeys(before, after);
  const trackerStructureChanged = lifecycleChange
    || nameChanged
    || [...changedKeys].some((key) => !TRACKER_LOCAL_METADATA_KEYS.has(key));

  const movementChanged = !lifecycleChange && before?.positionSignature !== after?.positionSignature;
  flags.movement ||= movementChanged;
  flags.speedCheck ||= speedCheckChanged;
  flags.tracker ||= nameChanged || imageChanged || metaChanged;
  flags.trackerStructure ||= trackerStructureChanged;
  flags.hpBars ||= hpChanged || attitudeChanged;
  flags.attitude ||= attitudeChanged;
  flags.hpMemory ||= nameChanged || imageChanged || attitudeChanged;
  flags.hpMemoryAutofill ||= nameChanged || imageChanged || metaChanged;
  flags.conditions ||= conditionsChanged;
  flags.concentration ||= spellsChanged || concentrationChanged;
  flags.aura ||= lifecycleChange
    || movementChanged
    || spellsChanged
    || concentrationChanged
    || attitudeChanged
    || conditionsChanged
    || changedKeys.has("customAuras");
  flags.zone ||= lifecycleChange || movementChanged || spellsChanged || concentrationChanged || attitudeChanged || conditionsChanged;
  flags.preparedSpells ||= lifecycleChange || movementChanged || spellsChanged || concentrationChanged;
  flags.elevation ||= lifecycleChange
    || before?.geometrySignature !== after?.geometrySignature
    || changedKeys.has("elevation");
}

function markNonTokenDomainChanges(flags, before, after, lifecycleChange) {
  const geometryChanged = lifecycleChange
    || before?.geometrySignature !== after?.geometrySignature;
  const derivedKind = after?.derivedKind || before?.derivedKind;
  const metadataChanged = lifecycleChange
    || before?.externalMetadataSignature !== after?.externalMetadataSignature;
  if ((geometryChanged || metadataChanged)
      && (derivedKind === "aura-visual" || derivedKind === "zone-visual")) {
    flags.aura ||= derivedKind === "aura-visual";
    flags.zone ||= derivedKind === "zone-visual";
  }
  if ((geometryChanged || metadataChanged) && derivedKind === "hp-widget") {
    flags.elevation = true;
  }
}

function deriveEventDomains(flags) {
  const domains = new Set();
  if (flags.tracker) domains.add("tracker");
  if (flags.trackerStructure) domains.add("tracker-structure");
  if (flags.hpBars) domains.add("hp");
  if (flags.hpMemory) domains.add("hp-memory");
  if (flags.hpMemoryAutofill) domains.add("hp-memory-autofill");
  if (flags.speedCheck) domains.add("speed-check");
  if (flags.conditions || flags.concentration) domains.add("effects");
  if (flags.widgets) domains.add("effects-widgets");
  if (flags.movement) domains.add("movement");
  if (flags.elevation) domains.add("elevation");
  if (flags.activeTurnLabelOnly) domains.add("active-label");

  if (flags.aura) domains.add("aura");
  if (flags.zone) domains.add("zone");
  if (flags.preparedSpells && !flags.derivedOutput) domains.add("prepared-spells");
  if (flags.derivedOutput) domains.add("derived");
  if (flags.derivedEffects) domains.add("derived-effects");
  return [...domains];
}

function domainItemIds(changedRecords) {
  const output = {};
  for (const record of changedRecords) {
    const id = record?.after?.id || record?.before?.id;
    if (!id) continue;
    for (const domain of record?.domains || []) {
      if (!output[domain]) output[domain] = [];
      if (!output[domain].includes(id)) output[domain].push(id);
    }
  }
  return output;
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
    return {
      flags,
      domains: [],
      invalidations: {},
      derived: { output: false, effects: false },
      items: [],
      removedItems: [],
      allItems,
      changedIds: [],
      changedRecords: [],
    };
  }

  flags.activeTurnLabelOnly = changedRecords.every(({ before: previous, after: next }) =>
    !!(next?.isActiveTurnLabel || previous?.isActiveTurnLabel)
  );
  if (flags.activeTurnLabelOnly) {
    const domains = ["active-label"];
    return {
      flags,
      domains,
      invalidations: { "active-label": [...changedIds] },
      derived: { output: true, effects: false },
      items: changedItems,
      removedItems,
      allItems,
      changedIds,
      changedRecords,
    };
  }

  for (const record of changedRecords) {
    const { before: previous, after: next } = record;
    const lifecycleChange = !previous || !next;
    const recordFlags = createFlags();
    recordFlags.any = true;
    markPluginTokenChange(recordFlags, previous, next, lifecycleChange);
    markNonTokenDomainChanges(recordFlags, previous, next, lifecycleChange);

    const conditionWidgetChanged = !!(previous?.isConditionWidget || next?.isConditionWidget);
    const concentrationWidgetChanged = !!(previous?.isConcentrationWidget || next?.isConcentrationWidget);
    const hpWidgetChanged = !!(previous?.isHPWidget || next?.isHPWidget);
    recordFlags.widgets ||= conditionWidgetChanged || concentrationWidgetChanged || hpWidgetChanged;
    recordFlags.derivedOutput = !!(previous?.derivedKind || next?.derivedKind);
    record.flags = recordFlags;
    record.derived = { output: recordFlags.derivedOutput, effects: false };
    record.domains = deriveEventDomains(recordFlags);
    mergeFlags(flags, recordFlags);

    // I widget sono output derivati. Non devono riattivare i due renderer:
    // il coordinatore li esegue già in ordine (spell, poi condizioni).
  }

  flags.derivedOutput = changedRecords.every(({ before, after }) => {
    const kinds = [before?.derivedKind, after?.derivedKind].filter(Boolean);
    return kinds.length > 0;
  });

  const domains = [...new Set(changedRecords.flatMap((record) => record.domains || []))];
  return {
    flags,
    domains,
    invalidations: domainItemIds(changedRecords),
    derived: {
      output: flags.derivedOutput,
      effects: flags.derivedEffects,
    },
    items: changedItems,
    removedItems,
    allItems,
    changedIds,
    changedRecords,
  };
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
  let sourceRevision = 0;
  let snapshotGeneration = 0;
  let batchSequence = 0;
  let batchCorrelation = null;

  function currentEpoch() {
    return typeof getEpoch === "function" ? getEpoch() : undefined;
  }

  function attachContext(event, {
    epoch,
    revision = sourceRevision,
    batchId = null,
    correlationId = null,
    commandId = null,
  } = {}) {
    if (epoch !== undefined) event.sceneEpoch = epoch;
    event.revision = revision;
    event.batchId = batchId || `scene-items:${revision}`;
    if (correlationId) event.correlationId = correlationId;
    if (commandId) event.commandId = commandId;
    return event;
  }

  function clearPendingBatch() {
    if (timer) {
      clearTimer(timer);
      timer = null;
    }
    batchBaseSnapshot = null;
    batchEpoch = null;
    batchCorrelation = null;
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

    const event = attachContext(
      classifySceneItemSnapshots(batchBaseSnapshot, currentSnapshot),
      {
        epoch: batchEpoch,
        revision: sourceRevision,
        batchId: `scene-items-batch:${++batchSequence}`,
        correlationId: batchCorrelation?.correlationId,
        commandId: batchCorrelation?.commandId,
      },
    );
    batchBaseSnapshot = null;
    batchEpoch = null;
    batchCorrelation = null;
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

  function onSourceChange(items = [], sourceContext = null) {
    if (suspended) {
      suspendedRevision += 1;
      return;
    }
    const nextSnapshot = createSceneItemsSnapshot(items, currentSnapshot);
    const sourceEpoch = currentEpoch();
    const revision = ++sourceRevision;
    const correlationId = String(
      sourceContext?.correlationId
        || sourceContext?.source?.correlationId
        || "",
    ).trim() || null;
    const commandId = String(sourceContext?.commandId || "").trim() || null;
    const immediateEvent = attachContext(
      classifySceneItemSnapshots(currentSnapshot, nextSnapshot),
      { epoch: sourceEpoch, revision, correlationId, commandId },
    );
    if (!immediateEvent.flags.any) return;
    if (!batchBaseSnapshot) {
      batchBaseSnapshot = currentSnapshot;
      batchCorrelation = { correlationId, commandId };
    }
    if (batchEpoch === null) batchEpoch = sourceEpoch;
    currentSnapshot = nextSnapshot;
    snapshotGeneration += 1;

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
    snapshotGeneration += 1;
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
    snapshotGeneration += 1;
    return true;
  }

  function getSuspendedRevision() {
    return suspendedRevision;
  }

  function reset(items = []) {
    clearPendingBatch();
    currentSnapshot = createSceneItemsSnapshot(items);
    sourceRevision = 0;
    snapshotGeneration += 1;
  }

  function subscribe(handler, options = {}) {
    if (typeof handler !== "function") throw new TypeError("handler must be a function");
    const domains = Array.isArray(options.domains)
      ? options.domains.map((domain) => String(domain || "").trim()).filter(Boolean)
      : options.domains
        ? [String(options.domains).trim()].filter(Boolean)
        : [];
    const filter = typeof options.filter === "function" ? options.filter : null;
    const subscriber = {
      handler,
      filter: (event) => (
        (!domains.length || domains.some((domain) => event?.domains?.includes(domain)))
        && (!filter || filter(event))
      ),
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

  return {
    subscribe,
    flush,
    suspend,
    resume,
    reset,
    getSuspendedRevision,
    getSnapshot: () => ({
      complete: !suspended,
      generation: snapshotGeneration,
      revision: sourceRevision,
      items: [...currentSnapshot.values()].map((entry) => entry.item),
    }),
    getState: () => ({
      sourceRevision,
      snapshotGeneration,
      batchSequence,
      suspended,
      subscribers: subscribers.size,
    }),
  };
}
