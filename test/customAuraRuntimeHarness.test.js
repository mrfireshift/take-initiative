import assert from "node:assert/strict";
import test, { mock } from "node:test";

const clone = (value) => (
  value === undefined ? undefined : structuredClone(value)
);

const scene = {
  ready: true,
  metadata: {},
  items: [],
};

const readyListeners = new Set();
const metadataListeners = new Set();
const broadcastListeners = new Map();

function readItems(idsOrFilter) {
  if (typeof idsOrFilter === "function") {
    return scene.items.filter(idsOrFilter).map(clone);
  }
  if (Array.isArray(idsOrFilter)) {
    const wanted = new Set(idsOrFilter);
    return scene.items.filter((item) => wanted.has(item.id)).map(clone);
  }
  return scene.items.map(clone);
}

const sdk = {
  onReady() {},
  room: {
    id: "custom-aura-runtime-harness-room",
    getMetadata: async () => ({}),
  },
  player: {
    getRole: async () => "GM",
    getSelection: async () => [],
  },
  scene: {
    isReady: async () => scene.ready,
    onReadyChange(listener) {
      readyListeners.add(listener);
      return () => readyListeners.delete(listener);
    },
    onMetadataChange(listener) {
      metadataListeners.add(listener);
      return () => metadataListeners.delete(listener);
    },
    getMetadata: async () => clone(scene.metadata),
    setMetadata: async (next) => {
      scene.metadata = { ...scene.metadata, ...clone(next) };
      for (const listener of metadataListeners) listener(clone(scene.metadata));
    },
    grid: {
      getDpi: async () => 150,
      getScale: async () => ({ parsed: { multiplier: 1.5, unit: "m" } }),
      snapPosition: async (position) => position,
      onChange: () => () => {},
    },
    items: {
      getItems: async (idsOrFilter) => readItems(idsOrFilter),
      updateItems: async (idsOrFilter, updater) => {
        const drafts = readItems(idsOrFilter);
        await updater(drafts);
        const byId = new Map(drafts.map((item) => [item.id, item]));
        scene.items = scene.items.map((item) => byId.get(item.id) || item);
        return drafts;
      },
      addItems: async (items) => {
        scene.items.push(...clone(items || []));
      },
      deleteItems: async (ids) => {
        const wanted = new Set(ids || []);
        scene.items = scene.items.filter((item) => !wanted.has(item.id));
      },
      getItemBounds: async (ids) => (Array.isArray(ids) ? ids : [ids]).map((id) => {
        const item = scene.items.find((entry) => entry.id === id);
        const x = Number(item?.position?.x) || 0;
        const y = Number(item?.position?.y) || 0;
        return {
          min: { x, y },
          max: { x: x + 100, y: y + 100 },
          center: { x: x + 50, y: y + 50 },
          width: 100,
          height: 100,
        };
      }),
      onChange: () => () => {},
    },
  },
  broadcast: {
    onMessage(channel, listener) {
      const listeners = broadcastListeners.get(channel) || new Set();
      listeners.add(listener);
      broadcastListeners.set(channel, listeners);
      return () => listeners.delete(listener);
    },
    async sendMessage(channel, data) {
      for (const listener of broadcastListeners.get(channel) || []) {
        listener({ data: clone(data) });
      }
    },
  },
};

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: sdk,
    buildLabel: () => ({ build() { return { id: "label" }; } }),
    buildImage: () => ({ build() { return { id: "image" }; } }),
    buildText: () => ({ build() { return { id: "text" }; } }),
    buildShape: () => ({ build() { return { id: "shape" }; } }),
    buildPath: () => ({
      commands() { return this; },
      fillRule() { return this; },
      fillColor() { return this; },
      fillOpacity() { return this; },
      strokeColor() { return this; },
      strokeOpacity() { return this; },
      strokeWidth() { return this; },
      position() { return this; },
      attachedTo() { return this; },
      locked() { return this; },
      disableHit() { return this; },
      layer() { return this; },
      disableAttachmentBehavior() { return this; },
      visible() { return this; },
      zIndex() { return this; },
      metadata() { return this; },
      name() { return this; },
      build() { return { id: "path" }; },
    }),
    Command: class Command {},
  },
});

const { ID } = await import("../src/constants.js");
const META_KEY = `${ID}/meta`;
const STATE_KEY = `${ID}/state`;

const {
  CUSTOM_AURA_META_KEY,
  normalizeCustomAura,
  collectActiveCustomAuras,
  customAuraRule,
} = await import("../src/customAuraCore.js");
const {
  mergeCustomAuraReminderMetadata,
  planCustomAuraReminder,
} = await import("../src/customAuraReminderCore.js");
const { zoneTriggerNoticeFromActivation } = await import("../src/zoneTriggerNoticeCore.js");
const {
  buildZoneTriggerReminderResolution,
  buildReminderResolutionPlan,
} = await import("../src/reminderResolutionCore.js");
const {
  mountEffectsMutationCoordinatorService,
  unmountEffectsMutationCoordinatorService,
  runEffectsMutation,
} = await import("../src/effectsMutations.js");
const { currentSceneEpoch } = await import("../src/sceneEpoch.js");

function makeToken({ id, name, x, y, meta = {} }) {
  return {
    id,
    name,
    type: "IMAGE",
    layer: "CHARACTER",
    position: { x, y },
    metadata: {
      [META_KEY]: {
        conditions: [],
        ...meta,
      },
    },
  };
}

function conditionInstances(item) {
  const value = item?.metadata?.[META_KEY]?.conditions;
  return Array.isArray(value) ? value : value?.instances || [];
}

function turnState(current) {
  return {
    [STATE_KEY]: {
      order: ["source", "target"],
      current,
      round: 1,
    },
  };
}

test("Custom Aura runtime harness: turn-start save reaches mutation, condition, HP and consume", async () => {
  globalThis.location = { pathname: "/background.html" };
  scene.metadata = turnState(0);
  const aura = normalizeCustomAura({
    id: "aura-1",
    name: "Aura del gelo",
    radiusMeters: 3,
    targeting: { filter: "all", includeSource: false },
    pills: [{ id: "pill-1", enabled: true, label: "Aura attiva", kind: "buff" }],
    reminders: [{
      id: "save-1",
      enabled: true,
      event: "turn-start",
      resolution: "manual-save",
      ability: "dex",
      dcMode: "fixed",
      dc: 15,
      damage: { dice: "3d6", type: "freddo", onSave: "half" },
      failureCondition: { condition: "Prono" },
    }],
  });
  const source = makeToken({
    id: "source",
    name: "Mago",
    x: 0,
    y: 0,
    meta: {
      customAuras: [aura],
      inInitiative: true,
    },
  });
  const target = makeToken({
    id: "target",
    name: "Goblin",
    x: 20,
    y: 0,
    meta: {
      hp: 20,
      hpMax: 20,
      attitude: "enemy",
      inInitiative: true,
    },
  });
  const visual = {
    id: "aura-visual",
    name: "Aura personalizzata: Aura del gelo",
    layer: "DRAWING",
    metadata: {
      [CUSTOM_AURA_META_KEY]: {
        instanceId: "source:aura-1",
        auraId: "aura-1",
        sourceId: "source",
      },
    },
  };
  scene.items = [source, target, visual];

  const activeAura = collectActiveCustomAuras(scene.items, { metaKey: META_KEY })[0];
  assert.equal(activeAura.instanceId, "source:aura-1");
  assert.equal(customAuraRule(activeAura).triggerPolicy.triggers[0].event, "turn-start");

  const itemsById = new Map(scene.items.map((item) => [item.id, item]));
  const first = planCustomAuraReminder({
    aura: activeAura,
    auraItem: visual,
    desiredTargetIds: ["target"],
    initiativeState: scene.metadata[STATE_KEY],
    itemsById,
    now: 1,
  });
  assert.equal(first.notices.length, 0, "initialization must not fire a turn reminder");
  visual.metadata[CUSTOM_AURA_META_KEY] = mergeCustomAuraReminderMetadata(
    visual.metadata[CUSTOM_AURA_META_KEY],
    first,
  );

  scene.metadata = turnState(1);
  const second = planCustomAuraReminder({
    aura: activeAura,
    auraItem: visual,
    desiredTargetIds: ["target"],
    initiativeState: scene.metadata[STATE_KEY],
    itemsById: new Map(scene.items.map((item) => [item.id, item])),
    now: 2,
  });
  assert.equal(second.notices.length, 1, "target turn must produce one live notice");
  const notice = second.notices[0];
  assert.equal(notice.targets[0].id, "target");
  assert.equal(notice.resolution.save.ability, "dex");
  assert.equal(notice.resolution.save.dc, 15);
  assert.equal(notice.resolution.target.id, "target");
  assert.equal(notice.resolution.source.id, "source");
  assert.equal(notice.resolution.activation.metadataKey, CUSTOM_AURA_META_KEY);

  visual.metadata[CUSTOM_AURA_META_KEY] = mergeCustomAuraReminderMetadata(
    visual.metadata[CUSTOM_AURA_META_KEY],
    second,
  );
  scene.items = [source, target, visual];

  const resolution = buildReminderResolutionPlan({
    notice,
    items: scene.items,
    outcome: "failed",
    damageRoll: 6,
    sceneMetadata: scene.metadata,
    now: 3,
  });
  assert.equal(resolution.status, "ready");
  assert.equal(resolution.hpChange.after, 14);
  assert.ok(resolution.operations.some((operation) => operation.type === "condition:add"));
  assert.equal(resolution.sideEffects[0].type, "reminder:consume-zone-activation");

  await mountEffectsMutationCoordinatorService();
  try {
    const mutation = await runEffectsMutation(resolution.operations, {
      transport: "background",
      sceneEpoch: currentSceneEpoch(),
      history: false,
      kind: "reminder-resolution",
      targetIds: resolution.targetIds,
      metadataPatches: resolution.metadataPatches,
      sideEffects: resolution.sideEffects,
    });
    assert.equal(mutation.status, "applied");
    const updatedTarget = scene.items.find((item) => item.id === "target");
    const updatedVisual = scene.items.find((item) => item.id === "aura-visual");
    assert.equal(updatedTarget.metadata[META_KEY].hp, 14);
    const prone = conditionInstances(updatedTarget).find((entry) => entry.condition === "Prono");
    assert.ok(prone, "failed save must add Prono through Effects Mutation");
    assert.equal(prone.type, "custom-aura");
    assert.equal(prone.sourceId, "source");
    assert.equal(prone.parentEffectId, "source:aura-1");
    assert.equal(updatedVisual.metadata[CUSTOM_AURA_META_KEY].triggerRuntime.pending.length, 0);
  } finally {
    unmountEffectsMutationCoordinatorService();
  }
});

test("failure condition ownership: Custom Aura is not spell, legacy spell keeps fallback", () => {
  const activation = {
    id: "activation-ownership",
    instanceId: "source:aura-1",
    triggerId: "aura-1:save-1",
    resolution: "manual-save",
    ability: "dex",
    dc: 15,
    failureCondition: { condition: "Prono" },
  };
  const custom = buildZoneTriggerReminderResolution({
    activation: { ...activation, effectType: "custom-aura" },
    targetId: "target",
    sourceId: "source",
    sourceName: "Custode",
    dc: 15,
  });
  const legacySpell = buildZoneTriggerReminderResolution({
    activation,
    targetId: "target",
    sourceId: "source",
    sourceName: "Incantatore",
    dc: 15,
  });
  assert.equal(custom.outcomes.failed.actions[0].options.type, "custom-aura");
  assert.equal(legacySpell.outcomes.failed.actions[0].options.type, "spell");
  assert.equal(custom.activation.effectType, "custom-aura");
  assert.equal(legacySpell.activation.effectType, undefined);
});
