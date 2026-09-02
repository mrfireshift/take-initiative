import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { AOE_AREA_META_KEY } from "../src/aoeStyle.js";
import { elevationInputToCanonical, normalizeElevation } from "../src/distance3dCore.js";
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
const popoverCalls = [];

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
  popover: {
    open: async (options) => { popoverCalls.push(clone(options)); },
    close: async () => {},
  },
  viewport: {
    transformPoint: async (position) => position,
  },
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
    grid: {
      getDpi: async () => 150,
      getScale: async () => ({ parsed: { multiplier: 1.5, unit: "m" } }),
    },
    items: {
      onChange(listener) {
        itemListeners.add(listener);
        return () => itemListeners.delete(listener);
      },
      getItems: async (selector) => currentItems(selector),
      getItemBounds: async (ids) => itemBounds(currentItems(ids)[0]),
      updateItems: async (ids, updater) => {
        const beforeItems = currentItems();
        const wanted = new Set(ids || []);
        const drafts = currentItems().filter((item) => wanted.has(item.id));
        await updater(drafts);
        const byId = new Map(drafts.map((item) => [item.id, item]));
        const nextItems = sceneState.items.map((item) => byId.get(item.id) || item);
        const beforeById = new Map(beforeItems.map((item) => [item.id, item]));
        const nextById = new Map(nextItems.map((item) => [item.id, item]));
        for (const item of nextItems) {
          const parentId = String(item?.attachedTo || "").trim();
          if (!parentId || item?.disableAttachmentBehavior?.includes("POSITION")) continue;
          const beforeChild = beforeById.get(item.id);
          const beforeParent = beforeById.get(parentId);
          const afterParent = nextById.get(parentId);
          if (!beforeChild || !beforeParent || !afterParent) continue;
          const dx = Number(afterParent.position?.x) - Number(beforeParent.position?.x);
          const dy = Number(afterParent.position?.y) - Number(beforeParent.position?.y);
          if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) continue;
          item.position = {
            x: Number(beforeChild.position?.x) + dx,
            y: Number(beforeChild.position?.y) + dy,
          };
        }
        sceneState.items = nextItems;
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

function prismaticCasterItem() {
  return {
    id: "caster",
    name: "Caster",
    layer: "CHARACTER",
    position: { x: -300, y: 0 },
    metadata: {
      [META_KEY]: {
        hp: 10,
        hpMax: 10,
        [`${ID}/spells`]: [{
          spellId: "prismatic-wall",
          instanceId: "prismatic-instance",
          casterId: "caster",
          casterName: "Caster",
          name: "Muro Prismatico",
          turns: 10,
          conc: false,
          castContext: {
            staticZoneOwner: true,
            slotLevel: 9,
            prismaticWall: {
              shape: "wall",
              remainingLayers: ["red", "orange", "yellow", "green", "blue", "indigo", "violet"],
              exemptCreatureIds: ["caster", "friend"],
            },
          },
        }],
      },
    },
  };
}

function prismaticZoneItem() {
  return {
    id: "prismatic-zone",
    name: "Zona: Muro Prismatico",
    layer: "DRAWING",
    position: { x: 0, y: 0 },
    metadata: {
      [SPELL_STATIC_ZONE_META_KEY]: {
        version: 1,
        instanceId: "prismatic-instance",
        ruleId: "prismatic-wall:cast",
        spellId: "prismatic-wall",
        casterId: "caster",
        role: "root",
        targetIds: [],
        exemptCreatureIds: ["caster", "friend"],
      },
      [AOE_AREA_META_KEY]: {
        type: "line",
        start: { x: 0, y: 0 },
        end: { x: 1000, y: 0 },
        dpi: 100,
        gridOrigin: { x: 0, y: 0 },
        basePosition: { x: 0, y: 0 },
        widthSquares: 1,
        hotBand: { side: "both", widthSquares: 4 },
      },
    },
  };
}

function turbineCasterItem() {
  return {
    id: "caster",
    name: "Caster",
    layer: "CHARACTER",
    position: { x: -300, y: 0 },
    metadata: {
      [META_KEY]: {
        hp: 10,
        hpMax: 10,
        [`${ID}/spells`]: [{
          spellId: "xanathar-turbine",
          instanceId: "turbine-instance",
          casterId: "caster",
          casterName: "Caster",
          name: "Turbine",
          conc: true,
          turns: 10,
          castContext: { staticZoneOwner: true },
        }],
      },
    },
  };
}

function turbineTargetItem({ restrained = true } = {}) {
  return {
    id: "target",
    name: "target",
    layer: "CHARACTER",
    position: { x: 50, y: 0 },
    rotation: 17,
    scale: { x: 1.25, y: 0.75 },
    visible: false,
    locked: true,
    metadata: {
      [META_KEY]: {
        hp: 10,
        hpMax: 10,
        marker: "preserve",
        ...(restrained
          ? {
            conditions: {
              instances: [{
                id: "turbine-restrained",
                condition: "Trattenuto",
                active: true,
                parentEffectId: "turbine-instance",
                effectId: "xanathar-turbine-restrained",
              }],
            },
          }
          : {}),
      },
      unrelated: { keep: true },
    },
  };
}

function turbineZoneItem() {
  return {
    id: "turbine-zone",
    name: "Zona: Turbine",
    layer: "DRAWING",
    position: { x: 0, y: 0 },
    locked: true,
    metadata: {
      [SPELL_STATIC_ZONE_META_KEY]: {
        version: 1,
        instanceId: "turbine-instance",
        ruleId: "xanathar-turbine:cast",
        spellId: "xanathar-turbine",
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
  popoverCalls.length = 0;
}

function resetPrismaticScene() {
  sceneState.ready = true;
  sceneState.metadata = {
    [STATE_KEY]: { order: ["caster", "target", "friend"], current: 1, round: 1 },
  };
  sceneState.items = [
    prismaticCasterItem(),
    targetItem("target", { x: 500, y: -150 }),
    targetItem("friend", { x: 500, y: -150 }),
    prismaticZoneItem(),
  ];
  projectedPayloads.length = 0;
  popoverCalls.length = 0;
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

async function preparePrismaticScene() {
  unmountStaticSpellZoneController();
  await wait(300);
  await sceneUnloadForTest();
  resetPrismaticScene();
  await sceneReadyForTest();
  await mountStaticSpellZoneController();
  await wait(220);
}

async function prepareTurbineScene({ targetRestrained = true } = {}) {
  unmountStaticSpellZoneController();
  await wait(300);
  await sceneUnloadForTest();
  sceneState.metadata = {
    [STATE_KEY]: { order: ["caster", "target"], current: 1, round: 1 },
  };
  sceneState.items = [
    turbineCasterItem(),
    turbineTargetItem({ restrained: targetRestrained }),
    turbineZoneItem(),
  ];
  projectedPayloads.length = 0;
  popoverCalls.length = 0;
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

mock.module("../src/effectsMutations.js", {
  exports: {
    requireAppliedEffectsMutation: (result) => result,
    runEffectsMutation: async (_operations, options = {}) => {
      for (const sideEffect of Array.isArray(options.sideEffects)
        ? options.sideEffects
        : []) {
        if (sideEffect?.type !== "elevation:adjust") continue;
        const targetId = String(sideEffect.targetId || "").trim();
        const target = sceneState.items.find((item) => item.id === targetId);
        if (!target) return { status: "conflict" };
        const scale = await sdkStub.scene.grid.getScale();
        const before = normalizeElevation(target.metadata?.[META_KEY]?.elevation);
        const delta = elevationInputToCanonical(sideEffect.delta, scale);
        const max = sideEffect.max === undefined || sideEffect.max === null
          ? null
          : elevationInputToCanonical(sideEffect.max, scale);
        const proposed = normalizeElevation(before + delta);
        const after = Number.isFinite(max)
          ? normalizeElevation(Math.min(proposed, max))
          : proposed;
        if (after === before) continue;
        await sdkStub.scene.items.updateItems([targetId], (drafts) => {
          const draft = drafts.find((item) => item.id === targetId);
          if (!draft) return;
          draft.metadata = {
            ...(draft.metadata || {}),
            [META_KEY]: {
              ...(draft.metadata?.[META_KEY] || {}),
              elevation: after,
            },
          };
        });
      }
      return { status: "applied" };
    },
  },
});

test("Turbine segue il trascinamento manuale del root con i CHARACTER trattenuti", async () => {
  await prepareTurbineScene();

  const before = sceneState.items.find((item) => item.id === "target");
  assert.equal(sceneState.items.find((item) => item.id === "turbine-zone").locked, false);
  await moveItem("turbine-zone", { x: 100, y: 40 });

  const target = sceneState.items.find((item) => item.id === "target");
  assert.deepEqual(target.position, { x: 150, y: 40 });
  assert.equal(target.attachedTo, "turbine-zone");
  assert.deepEqual(target.disableAttachmentBehavior, [
    "ROTATION",
    "SCALE",
    "VISIBLE",
    "DELETE",
    "LOCKED",
    "COPY",
  ]);
  assert.equal(target.rotation, before.rotation);
  assert.deepEqual(target.scale, before.scale);
  assert.equal(target.visible, before.visible);
  assert.equal(target.locked, before.locked);
  assert.deepEqual(target.metadata, before.metadata);
  assert.deepEqual(
    sceneState.items.find((item) => item.id === "turbine-zone").position,
    { x: 100, y: 40 },
  );
});

test("Turbine applica l'attachment nativo quando Trattenuto arriva dopo il mount", async () => {
  await prepareTurbineScene({ targetRestrained: false });

  const before = sceneState.items.find((item) => item.id === "target");
  assert.equal(before.attachedTo, undefined);

  await sdkStub.scene.items.updateItems(["target"], (drafts) => {
    drafts[0].metadata[META_KEY].conditions = {
      instances: [{
        id: "turbine-restrained",
        condition: "Trattenuto",
        active: true,
        parentEffectId: "turbine-instance",
        effectId: "xanathar-turbine-restrained",
      }],
    };
  });
  await wait(220);

  const target = sceneState.items.find((item) => item.id === "target");
  assert.equal(target.attachedTo, "turbine-zone");
  assert.deepEqual(target.disableAttachmentBehavior, [
    "ROTATION",
    "SCALE",
    "VISIBLE",
    "DELETE",
    "LOCKED",
    "COPY",
  ]);
});

test("Turbine aumenta l'elevation soltanto all'inizio del turno del bersaglio e si ferma a 9 m", async () => {
  await prepareTurbineScene();

  const readTargetElevation = () => normalizeElevation(
    sceneState.items.find((item) => item.id === "target")
      ?.metadata?.[META_KEY]?.elevation,
  );
  const targetIsRestrained = () => sceneState.items.find((item) => item.id === "target")
    ?.metadata?.[META_KEY]?.conditions?.instances?.some((condition) => (
      condition?.active !== false
      && condition?.parentEffectId === "turbine-instance"
      && condition?.effectId === "xanathar-turbine-restrained"
    )) === true;
  const setTurn = async (current, round) => {
    await sdkStub.scene.setMetadata({
      [STATE_KEY]: { order: ["caster", "target"], current, round },
    });
    await wait(220);
  };

  assert.equal(readTargetElevation(), 0);
  await setTurn(0, 2);
  assert.equal(readTargetElevation(), 0);
  await setTurn(1, 2);
  assert.equal(readTargetElevation(), 1.5);
  assert.equal(targetIsRestrained(), true);
  await setTurn(1, 2);
  assert.equal(readTargetElevation(), 1.5);
  await setTurn(0, 3);
  assert.equal(readTargetElevation(), 1.5);
  await setTurn(1, 3);
  assert.equal(readTargetElevation(), 3);
  assert.equal(targetIsRestrained(), true);

  await sdkStub.scene.items.updateItems(["target"], (drafts) => {
    drafts[0].metadata[META_KEY].elevation = 9;
  });
  await wait(220);
  await setTurn(0, 4);
  await setTurn(1, 4);
  assert.equal(readTargetElevation(), 9);
});

test("Muro Prismatico apre il popup di attraversamento con il token attraversante preselezionato", async () => {
  await preparePrismaticScene();
  await moveItem("target", { x: 500, y: 150 });

  const opened = popoverCalls.filter((call) => (
    String(call?.url || "").includes("/spell-active-resolution.html")
  ));
  assert.equal(opened.length, 1);
  const payload = JSON.parse(
    new URL(`https://local.test${opened[0].url}`).searchParams.get("payload"),
  );
  assert.equal(payload.spellId, "prismatic-wall");
  assert.equal(payload.actionId, "prismatic-wall-traversal");
  assert.equal(payload.initialTargetId, "target");
  assert.equal(payload.popoverId, opened[0].id);

  const countBeforeExemptMove = popoverCalls.length;
  await moveItem("friend", { x: 500, y: 150 });
  assert.equal(popoverCalls.length, countBeforeExemptMove);
});
