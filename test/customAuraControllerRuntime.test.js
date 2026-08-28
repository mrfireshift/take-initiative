import assert from "node:assert/strict";
import test, { mock } from "node:test";

const clone = (value) => (
  value === undefined ? undefined : structuredClone(value)
);

const ID = "com.thebigpicture.initiative";
const META_KEY = `${ID}/meta`;
const STATE_KEY = `${ID}/state`;
const CUSTOM_AURA_META_KEY = `${ID}/customAura`;
const REMINDER_HISTORY_REARM_CHANNEL = `${ID}/reminder-history-rearm`;

const scene = {
  ready: true,
  metadata: {
    [STATE_KEY]: { order: ["source"], current: 0, round: 1 },
  },
  items: [],
};
const itemListeners = new Set();
const readyListeners = new Set();
const metadataListeners = new Set();
const broadcastListeners = new Map();
let visualSequence = 0;
const deliveries = [];

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

function emitItems() {
  const snapshot = scene.items.map(clone);
  for (const listener of itemListeners) listener(snapshot);
}

function builder(type) {
  const props = { type };
  const value = {
    build() {
      return {
        id: type === "PATH" ? `aura-visual-${++visualSequence}` : `${type.toLowerCase()}-1`,
        type,
        layer: props.layer || "DRAWING",
        position: props.position || { x: 0, y: 0 },
        attachedTo: props.attachedTo,
        name: props.name || "",
        metadata: props.metadata || {},
        commands: props.commands || [],
      };
    },
  };
  for (const key of [
    "commands",
    "fillRule",
    "fillColor",
    "fillOpacity",
    "strokeColor",
    "strokeOpacity",
    "strokeWidth",
    "position",
    "attachedTo",
    "locked",
    "disableHit",
    "layer",
    "disableAttachmentBehavior",
    "visible",
    "zIndex",
    "metadata",
    "name",
  ]) {
    value[key] = (next) => {
      props[key] = next;
      return value;
    };
  }
  return value;
}

const sdk = {
  onReady(callback) {
    queueMicrotask(() => callback?.());
  },
  room: { id: "custom-aura-controller-runtime-room", getMetadata: async () => ({}) },
  player: { getRole: async () => "GM", getSelection: async () => [] },
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
      onChange(listener) {
        itemListeners.add(listener);
        return () => itemListeners.delete(listener);
      },
      updateItems: async (idsOrFilter, updater) => {
        const drafts = readItems(idsOrFilter);
        await updater(drafts);
        const byId = new Map(drafts.map((item) => [item.id, item]));
        scene.items = scene.items.map((item) => byId.get(item.id) || item);
        emitItems();
        return drafts;
      },
      addItems: async (items) => {
        scene.items.push(...clone(items || []));
        emitItems();
      },
      deleteItems: async (ids) => {
        const wanted = new Set(ids || []);
        scene.items = scene.items.filter((item) => !wanted.has(item.id));
        emitItems();
      },
      getItemBounds: async (ids) => {
        const id = Array.isArray(ids) ? ids[0] : ids;
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
      },
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
    buildLabel: () => builder("LABEL"),
    buildImage: () => builder("IMAGE"),
    buildText: () => builder("TEXT"),
    buildShape: () => builder("SHAPE"),
    buildPath: () => builder("PATH"),
    Command: {
      MOVE: "MOVE",
      CUBIC: "CUBIC",
      CLOSE: "CLOSE",
    },
  },
});

mock.module("../src/options/reminderProjectionBroadcast.js", {
  exports: {
    sendProjectedReminderPayload: async (channel, payload) => {
      deliveries.push({ channel, payload: clone(payload) });
      return { gm: payload?.notices?.length || 0, player: 0 };
    },
  },
});

globalThis.location = { pathname: "/background.html" };
const effects = await import("../src/effectsMutations.js");
const { mountCustomAuraController, unmountCustomAuraController } =
  await import("../src/customAuraController.js");
const { buildArea } = await import("../src/aoeGeometryCore.js");
const { collectActiveCustomAuras, customAuraTargetIds } =
  await import("../src/customAuraCore.js");
const { buildReminderResolutionPlan } =
  await import("../src/reminderResolutionCore.js");
const { currentSceneEpoch } = await import("../src/sceneEpoch.js");

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function aura(enabled = true) {
  return {
    id: "aura-1",
    enabled,
    name: "Aura del Custode",
    radiusMeters: 3,
    targeting: { filter: "all", includeSource: false },
    pills: [
      { id: "pill-1", enabled: true, label: "Protetto", kind: "buff" },
      { id: "pill-2", enabled: true, label: "Vigile", kind: "buff" },
      { id: "pill-3", enabled: true, label: "Saldo", kind: "buff" },
    ],
    reminders: [
      {
        id: "save-1",
        enabled: true,
        event: "turn-start",
        label: "TS Des contro l'aura",
        resolution: "manual-save",
        ability: "dex",
        dcMode: "fixed",
        dc: 15,
        damage: { dice: "1d6", type: "freddo", onSave: "half" },
        failureCondition: { condition: "Prono" },
      },
      {
        id: "enter-1",
        enabled: true,
        event: "enter",
        label: "Ingresso nell'aura",
        resolution: "informational",
      },
      {
        id: "leave-1",
        enabled: true,
        event: "leave",
        label: "Uscita dall'aura",
        resolution: "informational",
      },
      {
        id: "end-1",
        enabled: true,
        event: "turn-end",
        label: "Fine turno nell'aura",
        resolution: "informational",
      },
    ],
  };
}

function token(id, x, meta = {}) {
  return {
    id,
    name: id === "source" ? "Custode" : "Goblin",
    type: "IMAGE",
    layer: "CHARACTER",
    position: { x, y: 0 },
    metadata: {
      [META_KEY]: {
        conditions: [],
        ...meta,
      },
    },
  };
}

function metadataLessToken(id, x) {
  const item = token(id, x);
  delete item.metadata[META_KEY];
  return item;
}

function auraConditions(item) {
  const value = item?.metadata?.[META_KEY]?.conditions;
  return Array.isArray(value) ? value : value?.instances || [];
}

function auraEffectIds(item) {
  return auraConditions(item)
    .filter((entry) => entry.type === "custom-aura" && entry.effectId?.startsWith("aura-1:pill-"))
    .map((entry) => entry.effectId)
    .sort();
}

test("Custom Aura controller runtime: CHARACTER fuori iniziativa senza META entra, resta, esce e pulisce", async () => {
  deliveries.length = 0;
  scene.metadata = {
    [STATE_KEY]: { order: ["source"], current: 0, round: 1 },
  };
  scene.items = [
    token("source", 0, { customAuras: [aura()], inInitiative: true, attitude: "ally" }),
    metadataLessToken("target", 50),
  ];
  assert.equal(scene.items.find((item) => item.id === "target").metadata?.[META_KEY], undefined);
  const [activeAura] = collectActiveCustomAuras(scene.items, { metaKey: META_KEY });
  assert.deepEqual(customAuraTargetIds({
    aura: activeAura,
    area: buildArea("circle", { x: 50, y: 50 }, { x: 350, y: 50 }, 150, { x: 50, y: 50 }),
    candidates: scene.items.map((item) => ({
      item,
      bounds: {
        min: { x: item.position.x, y: item.position.y },
        max: { x: item.position.x + 100, y: item.position.y + 100 },
      },
    })),
    metaKey: META_KEY,
  }), ["target"]);

  await wait(100);
  emitItems();
  await effects.mountEffectsMutationCoordinatorService();
  await wait(100);
  const sceneItemProbe = await import("../src/sceneItemEvents.js");
  const baselineProbe = sceneItemProbe.readSceneItemsSnapshot(0);
  assert.equal(baselineProbe.complete, true, JSON.stringify(baselineProbe));
  assert.equal(await mountCustomAuraController(), true);
  for (const listener of readyListeners) listener(true);
  emitItems();
  await wait(50);
  const readyProbe = sceneItemProbe.readSceneItemsSnapshot(0);
  assert.ok(
    readyProbe.items.some((item) => item.id === "source")
      && readyProbe.items.some((item) => item.id === "target"),
    JSON.stringify(readyProbe),
  );
  try {
    await wait(300);
    let target = scene.items.find((item) => item.id === "target");
    let applied = auraConditions(target).find((entry) => entry.condition === "Protetto");
    assert.ok(
      applied,
      `a CHARACTER outside initiative still receives the pill: ${JSON.stringify({
        items: scene.items.map((item) => ({ id: item.id, metadata: item.metadata })),
        deliveries,
        controller: globalThis.__tbpCustomAuraController?.state?.(),
      })}`,
    );
    assert.equal(applied.type, "custom-aura");
    assert.deepEqual(auraEffectIds(target), [
      "aura-1:pill-1",
      "aura-1:pill-2",
      "aura-1:pill-3",
    ]);
    assert.equal(scene.items.filter((item) => item.metadata?.[CUSTOM_AURA_META_KEY]).length, 1);

    await sdk.scene.items.updateItems(["target"], (drafts) => {
      const meta = { ...(drafts[0].metadata?.[META_KEY] || {}) };
      drafts[0].metadata = {
        ...(drafts[0].metadata || {}),
        [META_KEY]: { ...meta, attitude: "enemy", inInitiative: false, hp: 20, hpMax: 20 },
      };
    });
    await wait(100);

    const noTurnNoticeYet = deliveries.flatMap((entry) => entry.payload?.notices || []);
    assert.equal(noTurnNoticeYet.length, 0, "turn-start stays silent for a target outside initiative");

    scene.metadata = {
      [STATE_KEY]: { order: ["source", "target"], current: 1, round: 1 },
    };
    await sdk.scene.setMetadata(scene.metadata);
    await wait(350);
    const triggerDeliveryIndex = deliveries.findIndex((entry) => (
      (entry.payload?.notices || []).some((notice) => notice.timing === "turn-start")
    ));
    assert.notEqual(triggerDeliveryIndex, -1, "tracker actor turn-start produces a live notice");
    const triggerNotice = deliveries[triggerDeliveryIndex].payload.notices.find(
      (notice) => notice.timing === "turn-start",
    );
    assert.equal(triggerNotice.targets[0].id, "target");
    const consumedActivation = scene.items
      .find((item) => item.metadata?.[CUSTOM_AURA_META_KEY])
      .metadata[CUSTOM_AURA_META_KEY].triggerRuntime.pending
      .find((activation) => activation.id === triggerNotice.activationId);
    assert.ok(consumedActivation);

    const resolution = buildReminderResolutionPlan({
      notice: triggerNotice,
      items: scene.items,
      outcome: "failed",
      damageRoll: 6,
      sceneMetadata: scene.metadata,
      now: 10,
    });
    assert.equal(resolution.status, "ready");
    const appliedResolution = await effects.runEffectsMutation(resolution.operations, {
      transport: "background",
      sceneEpoch: currentSceneEpoch(),
      history: false,
      kind: "reminder-resolution",
      targetIds: resolution.targetIds,
      metadataPatches: resolution.metadataPatches,
      sideEffects: resolution.sideEffects,
    });
    assert.equal(appliedResolution.status, "applied");
    await wait(200);
    let currentVisual = scene.items.find((item) => item.metadata?.[CUSTOM_AURA_META_KEY]);
    assert.equal(currentVisual.metadata[CUSTOM_AURA_META_KEY].triggerRuntime.pending.length, 0);

    await sdk.scene.items.updateItems([currentVisual.id], (drafts) => {
      const metadata = drafts[0].metadata[CUSTOM_AURA_META_KEY];
      metadata.triggerRuntime = {
        ...metadata.triggerRuntime,
        pending: [clone(consumedActivation)],
      };
    });
    await wait(200);

    const rearmStart = deliveries.length;
    await sdk.broadcast.sendMessage(REMINDER_HISTORY_REARM_CHANNEL, {
      type: "restore-reminder-activation",
      owner: "custom-aura",
      activationId: triggerNotice.activationId,
      descriptor: {
        activationId: triggerNotice.activationId,
        targetId: "target",
        notice: triggerNotice,
      },
      sceneEpoch: currentSceneEpoch(),
    });
    await wait(350);
    const rearmDelivery = deliveries.slice(rearmStart).find((entry) => (
      (entry.payload?.rearmActivationIds || []).includes(triggerNotice.activationId)
    ));
    assert.ok(
      rearmDelivery,
      `Undo reannounces the custom-aura reminder once: ${JSON.stringify({
        triggerNotice,
        deliveries: deliveries.slice(rearmStart),
        controller: globalThis.__tbpCustomAuraController?.state?.(),
      })}`,
    );
    currentVisual = scene.items.find((item) => item.metadata?.[CUSTOM_AURA_META_KEY]);
    assert.ok(
      currentVisual.metadata[CUSTOM_AURA_META_KEY].triggerRuntime.pending
        .some((activation) => activation.id === triggerNotice.activationId),
      "rearm restores the pending activation recognized by Custom Aura",
    );

    scene.metadata = {
      [STATE_KEY]: { order: ["source", "target"], current: 0, round: 2 },
    };
    await sdk.scene.setMetadata(scene.metadata);
    await wait(350);
    currentVisual = scene.items.find((item) => item.metadata?.[CUSTOM_AURA_META_KEY]);
    assert.equal(
      currentVisual.metadata[CUSTOM_AURA_META_KEY].triggerRuntime.pending
        .some((activation) => activation.id === triggerNotice.activationId),
      false,
      "a pending reminder from a rewound trigger does not remain a phantom after the turn advances",
    );
    assert.equal(
      deliveries.flatMap((entry) => entry.payload?.notices || [])
        .filter((notice) => notice.timing === "turn-end").length,
      1,
      "turn-end reminder is emitted once",
    );

    await sdk.scene.items.updateItems(["target"], (drafts) => {
      drafts[0].position = { x: 900, y: 0 };
    });
    await wait(300);
    target = scene.items.find((item) => item.id === "target");
    applied = auraConditions(target).find((entry) => entry.condition === "Protetto");
    assert.equal(applied, undefined, "leaving the aura removes only its pill");
    assert.equal(scene.items.filter((item) => item.metadata?.[CUSTOM_AURA_META_KEY]).length, 1);
    assert.equal(
      deliveries.flatMap((entry) => entry.payload?.notices || [])
        .filter((notice) => notice.timing === "leave").length,
      1,
      "leave reminder is emitted once",
    );

    await sdk.scene.items.updateItems(["target"], (drafts) => {
      drafts[0].position = { x: 50, y: 0 };
    });
    await wait(300);
    target = scene.items.find((item) => item.id === "target");
    assert.ok(
      auraConditions(target).some((entry) => entry.condition === "Protetto"),
      "re-entry reapplies the same effect identity",
    );
    assert.ok(
      deliveries.some((entry) => (entry.payload?.notices || [])
        .some((notice) => notice.timing === "enter")),
      "an owned membership mutation does not suppress its newly planned enter notice",
    );

    const disabledPill = aura();
    disabledPill.pills = disabledPill.pills.map((pill) => (
      pill.id === "pill-2" ? { ...pill, enabled: false } : pill
    ));
    await sdk.scene.items.updateItems(["source"], (drafts) => {
      drafts[0].metadata[META_KEY].customAuras = [disabledPill];
    });
    await wait(300);
    target = scene.items.find((item) => item.id === "target");
    assert.deepEqual(auraEffectIds(target), ["aura-1:pill-1", "aura-1:pill-3"]);

    const renamedAndReordered = aura();
    renamedAndReordered.pills = [
      { id: "pill-3", enabled: true, label: "Saldo rinforzato", kind: "buff" },
      { id: "pill-2", enabled: true, label: "Vigile rinominato", kind: "buff" },
      { id: "pill-1", enabled: true, label: "Protetto rinominato", kind: "buff" },
    ];
    await sdk.scene.items.updateItems(["source"], (drafts) => {
      drafts[0].metadata[META_KEY].customAuras = [renamedAndReordered];
    });
    await wait(300);
    target = scene.items.find((item) => item.id === "target");
    assert.deepEqual(auraEffectIds(target), [
      "aura-1:pill-1",
      "aura-1:pill-2",
      "aura-1:pill-3",
    ], "rename/reorder keeps one condition per persistent pill id");

    const deletedPill = aura();
    deletedPill.pills = [
      { id: "pill-1", enabled: true, label: "Protetto rinominato", kind: "buff" },
      { id: "pill-3", enabled: true, label: "Saldo rinforzato", kind: "buff" },
    ];
    await sdk.scene.items.updateItems(["source"], (drafts) => {
      drafts[0].metadata[META_KEY].customAuras = [deletedPill];
    });
    await wait(300);
    target = scene.items.find((item) => item.id === "target");
    assert.deepEqual(auraEffectIds(target), ["aura-1:pill-1", "aura-1:pill-3"]);

    await sdk.scene.items.updateItems(["source"], (drafts) => {
      drafts[0].metadata[META_KEY].customAuras = [aura(false)];
    });
    await wait(300);
    target = scene.items.find((item) => item.id === "target");
    assert.equal(
      auraConditions(target).some((entry) => entry.condition === "Protetto"),
      false,
      "disabling the aura cleans the condition",
    );
    assert.equal(
      scene.items.filter((item) => item.metadata?.[CUSTOM_AURA_META_KEY]).length,
      0,
      "disabling the aura removes its visual",
    );

    await sdk.scene.items.updateItems(["source"], (drafts) => {
      drafts[0].metadata[META_KEY].customAuras = [];
    });
    await wait(300);
    assert.equal(
      scene.items.filter((item) => item.metadata?.[CUSTOM_AURA_META_KEY]).length,
      0,
      "deleting the aura leaves no visual orphan",
    );
  } finally {
    unmountCustomAuraController();
    effects.unmountEffectsMutationCoordinatorService();
  }
});
