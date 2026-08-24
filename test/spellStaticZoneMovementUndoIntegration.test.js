import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { AOE_AREA_META_KEY } from "../src/aoeStyle.js";
import { SPELL_STATIC_ZONE_META_KEY } from "../src/spellStaticZoneCore.js";
import { normalizeSpellZoneTriggerRuntime } from "../src/spellZoneTriggerCore.js";

const ID = "com.thebigpicture.initiative";
const META_KEY = `${ID}/meta`;
const STATE_KEY = `${ID}/state`;
const HISTORY_CONTROL_CHANNEL = `${ID}/history-control`;
const clone = (value) => structuredClone(value);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const sceneState = {
  ready: true,
  metadata: {
    [STATE_KEY]: { order: ["caster", "target"], current: 1, round: 1 },
  },
  items: [],
};
const readyCallbacks = [];
const readyListeners = new Set();
const metadataListeners = new Set();
const itemListeners = new Set();
const broadcastListeners = new Map();
const projectedPayloads = [];

function currentItems(selector) {
  if (typeof selector === "function") return sceneState.items.filter(selector).map(clone);
  const wanted = Array.isArray(selector) ? new Set(selector) : null;
  return sceneState.items
    .filter((item) => !wanted || wanted.has(item.id))
    .map(clone);
}

function itemBounds(item) {
  const x = Number(item?.position?.x) || 0;
  const y = Number(item?.position?.y) || 0;
  return {
    id: item.id,
    min: { x: x - 10, y: y - 10 },
    max: { x: x + 10, y: y + 10 },
    center: { x, y },
  };
}

async function emitItems(source = null) {
  const snapshot = currentItems();
  for (const listener of [...itemListeners]) await listener(snapshot, source);
}

const sdkStub = {
  onReady(callback) {
    readyCallbacks.push(callback);
  },
  player: { getRole: async () => "GM" },
  room: { id: "static-zone-movement-undo-room", getMetadata: async () => ({}) },
  scene: {
    isReady: async () => sceneState.ready,
    onReadyChange(listener) {
      readyListeners.add(listener);
      return () => readyListeners.delete(listener);
    },
    onMetadataChange(listener) {
      metadataListeners.add(listener);
      return () => metadataListeners.delete(listener);
    },
    getMetadata: async () => clone(sceneState.metadata),
    setMetadata: async (update) => {
      sceneState.metadata = { ...sceneState.metadata, ...clone(update) };
      for (const listener of [...metadataListeners]) await listener(clone(sceneState.metadata));
    },
    items: {
      onChange(listener) {
        itemListeners.add(listener);
        return () => itemListeners.delete(listener);
      },
      getItems: async (selector) => currentItems(selector),
      getItemBounds: async (ids) => itemBounds(currentItems(ids)[0]),
      updateItems: async (ids, updater) => {
        const wanted = new Set(ids || []);
        const drafts = currentItems().filter((item) => wanted.has(item.id));
        await updater(drafts);
        const byId = new Map(drafts.map((item) => [item.id, item]));
        sceneState.items = sceneState.items.map((item) => byId.get(item.id) || item);
        await emitItems();
      },
      addItems: async (items) => {
        sceneState.items.push(...clone(items || []));
        await emitItems();
      },
      deleteItems: async (ids) => {
        const wanted = new Set(ids || []);
        sceneState.items = sceneState.items.filter((item) => !wanted.has(item.id));
        await emitItems();
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
      for (const listener of [...(broadcastListeners.get(channel) || [])]) {
        await listener({ data: clone(data) });
      }
    },
  },
};

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: sdkStub,
    buildLabel: () => ({ build: () => ({ id: "mock-label" }) }),
    buildImage: () => ({ build: () => ({ id: "mock-image" }) }),
    buildShape: () => ({ build: () => ({ id: "mock-shape" }) }),
    buildText: () => ({ build: () => ({ id: "mock-text" }) }),
    buildPath: () => {
      const path = {
        commands() { return path; },
        fillRule() { return path; },
        fillColor() { return path; },
        fillOpacity() { return path; },
        strokeColor() { return path; },
        strokeOpacity() { return path; },
        strokeWidth() { return path; },
        position() { return path; },
        locked() { return path; },
        disableHit() { return path; },
        layer() { return path; },
        metadata() { return path; },
        name() { return path; },
        build() { return { id: "mock-zone" }; },
      };
      return path;
    },
    Command: { MOVE: "MOVE", LINE: "LINE", CLOSE: "CLOSE", CUBIC: "CUBIC" },
  },
});

mock.module("../src/spellAreaMutationQueue.js", {
  exports: {
    queueSpellAreaEffectsMutation: async () => ({ status: "applied" }),
  },
});

mock.module("../src/options/reminderProjectionBroadcast.js", {
  exports: {
    sendProjectedReminderPayload: async (channel, payload) => {
      projectedPayloads.push({ channel, payload: clone(payload) });
      return { gm: payload?.notices?.length || 0, player: 0 };
    },
  },
});

const { mountStaticSpellZoneController, unmountStaticSpellZoneController } = await import(
  "../src/spellStaticZone.js?movement-undo-integration"
);
const {
  currentSceneEpoch,
  invalidateSceneEpoch,
  markSceneEpochReady,
} = await import("../src/sceneEpoch.js");

function casterItem() {
  return {
    id: "caster",
    name: "Caster",
    layer: "CHARACTER",
    position: { x: -300, y: 0 },
    metadata: {
      [META_KEY]: {
        hp: 10,
        hpMax: 10,
        [`${ID}/spells`]: [{ instanceId: "grease-instance" }],
      },
    },
  };
}

function targetItem(id = "target", position = { x: 50, y: 0 }) {
  return {
    id,
    name: id,
    layer: "CHARACTER",
    position: clone(position),
    metadata: { [META_KEY]: { hp: 10, hpMax: 10 } },
  };
}

function zoneItem() {
  return {
    id: "grease-zone",
    name: "Zona: Unto",
    layer: "DRAWING",
    position: { x: 0, y: 0 },
    metadata: {
      [SPELL_STATIC_ZONE_META_KEY]: {
        version: 1,
        instanceId: "grease-instance",
        ruleId: "grease:cast",
        spellId: "grease",
        casterId: "caster",
        role: "root",
        targetIds: ["target"],
      },
      [AOE_AREA_META_KEY]: {
        type: "circle",
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 },
        dpi: 50,
        gridOrigin: { x: 0, y: 0 },
        basePosition: { x: 0, y: 0 },
      },
    },
  };
}

function resetScene({ extraTarget = false } = {}) {
  sceneState.ready = true;
  sceneState.metadata = {
    [STATE_KEY]: {
      order: extraTarget ? ["caster", "target", "other"] : ["caster", "target"],
      current: extraTarget ? 1 : 1,
      round: 1,
    },
  };
  sceneState.items = [
    casterItem(),
    targetItem(),
    ...(extraTarget ? [targetItem("other", { x: 50, y: 0 })] : []),
    zoneItem(),
  ];
  projectedPayloads.length = 0;
}

async function moveItem(id, position) {
  await sdkStub.scene.items.updateItems([id], (drafts) => {
    drafts[0].position = clone(position);
  });
  await wait(180);
}

async function moveItemWithoutWaiting(id, position) {
  await sdkStub.scene.items.updateItems([id], (drafts) => {
    drafts[0].position = clone(position);
  });
}

async function sendUndoSuppression(ids, positions, requestId) {
  await sdkStub.broadcast.sendMessage(HISTORY_CONTROL_CHANNEL, {
    type: "suppress-history-undo",
    ids,
    positions,
    requestId,
    sceneEpoch: currentSceneEpoch(),
    sceneIdentity: "test-background-scene",
    until: Date.now() + 5000,
  });
}

function rootRuntime() {
  const root = sceneState.items.find((item) => item.id === "grease-zone");
  return normalizeSpellZoneTriggerRuntime(
    root?.metadata?.[SPELL_STATIC_ZONE_META_KEY]?.triggerRuntime,
  );
}

async function sceneUnloadForTest() {
  sceneState.ready = false;
  invalidateSceneEpoch("test-scene-unload");
  for (const listener of [...readyListeners]) await listener(false);
}

async function sceneReadyForTest() {
  sceneState.ready = true;
  markSceneEpochReady("test-scene-ready");
  for (const listener of [...readyListeners]) await listener(true);
}

async function prepareOutsideScene({ extraTarget = false } = {}) {
  unmountStaticSpellZoneController();
  await wait(300);
  await sceneUnloadForTest();
  resetScene({ extraTarget });
  sceneState.items = sceneState.items.map((item) => (
    item.id === "target" || item.id === "other"
      ? { ...item, position: { x: 200, y: 0 } }
      : item
  ));
  await sceneReadyForTest();
  await mountStaticSpellZoneController();
  await wait(220);
}

test.before(async () => {
  resetScene();
  for (const callback of readyCallbacks) callback();
  await wait(30);
  assert.equal(await mountStaticSpellZoneController(), true);
  await wait(220);
});

test.after(() => {
  unmountStaticSpellZoneController();
});

test("Undo outside→inside aggiorna membership senza falso enter e la suppression è one-shot", async () => {
  assert.deepEqual(rootRuntime().memberIds, ["target"]);
  assert.deepEqual(rootRuntime().pending, []);

  await moveItem("target", { x: 200, y: 0 });
  assert.deepEqual(rootRuntime().memberIds, []);
  projectedPayloads.length = 0;

  await sendUndoSuppression(
    ["target"],
    { target: [{ x: 50, y: 0 }] },
    "undo-movement-1",
  );
  await moveItem("target", { x: 50, y: 0 });

  assert.deepEqual(rootRuntime().memberIds, ["target"]);
  assert.deepEqual(rootRuntime().pending, []);
  assert.equal(
    projectedPayloads.some((entry) => entry.payload?.notices?.length),
    false,
  );

  await moveItem("target", { x: 200, y: 0 });
  await moveItem("target", { x: 50, y: 0 });
  assert.equal(rootRuntime().pending.length, 1);
  assert.match(rootRuntime().pending[0].id, /grease-save-on-entry/);
});

test("una suppression per token non nasconde il trigger geometrico dell'altro token", async () => {
  await prepareOutsideScene({ extraTarget: true });
  sceneState.metadata[STATE_KEY].order = ["caster", "target", "other"];
  projectedPayloads.length = 0;

  await sendUndoSuppression(
    ["target"],
    { target: [{ x: 50, y: 0 }] },
    "undo-movement-target-only",
  );
  await moveItem("target", { x: 50, y: 0 });
  await moveItem("other", { x: 50, y: 0 });

  const targetRuntime = rootRuntime();
  assert.deepEqual(targetRuntime.memberIds, ["target", "other"]);
  assert.ok(
    projectedPayloads.some((entry) => entry.payload?.notices?.some(
      (notice) => notice.targets?.some((target) => target.id === "other"),
    )),
  );
});

test("tre Undo consecutivi consumano soltanto la suppression del proprio restore", async () => {
  await prepareOutsideScene();

  for (let index = 1; index <= 3; index += 1) {
    await sendUndoSuppression(
      ["target"],
      { target: [{ x: 50, y: 0 }] },
      `undo-chain-${index}`,
    );
    await moveItem("target", { x: 50, y: 0 });
    assert.deepEqual(rootRuntime().memberIds, ["target"]);
    assert.deepEqual(rootRuntime().pending, []);

    await moveItem("target", { x: 200, y: 0 });
    assert.deepEqual(rootRuntime().memberIds, []);
    assert.deepEqual(rootRuntime().pending, []);
  }

  await moveItem("target", { x: 50, y: 0 });
  assert.equal(rootRuntime().pending.length, 1);
  assert.match(rootRuntime().pending[0].id, /grease-save-on-entry/);
});

test("scene reset invalida una suppression di Undo rimasta volatile", async () => {
  await prepareOutsideScene();

  await sendUndoSuppression(
    ["target"],
    { target: [{ x: 50, y: 0 }] },
    "undo-before-scene-reset",
  );
  await sceneUnloadForTest();
  await sceneReadyForTest();
  await wait(220);

  await moveItem("target", { x: 50, y: 0 });
  assert.equal(rootRuntime().pending.length, 1);
  assert.match(rootRuntime().pending[0].id, /grease-save-on-entry/);
});

test("un movimento reale immediato dopo il restore non riusa la suppression", async () => {
  await prepareOutsideScene();

  await sendUndoSuppression(
    ["target"],
    { target: [{ x: 50, y: 0 }] },
    "undo-immediate-real-move",
  );
  await moveItemWithoutWaiting("target", { x: 50, y: 0 });
  await moveItemWithoutWaiting("target", { x: 200, y: 0 });
  await wait(220);
  assert.deepEqual(rootRuntime().memberIds, []);

  await moveItem("target", { x: 50, y: 0 });
  assert.equal(rootRuntime().pending.length, 1);
  assert.match(rootRuntime().pending[0].id, /grease-save-on-entry/);
});
