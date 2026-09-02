import assert from "node:assert/strict";
import test, { mock } from "node:test";
import {
  createVersionedIndexedDB,
  versionedKeyRange,
} from "../test-support/fakeVersionedIndexedDb.js";

globalThis.indexedDB = createVersionedIndexedDB();
globalThis.IDBKeyRange = versionedKeyRange;

const META_KEY = "com.thebigpicture.initiative/meta";
const SPELLS_META_KEY = "com.thebigpicture.initiative/spells";
const CONC_META_KEY = "com.thebigpicture.initiative/concentration";
const AOE_AREA_META_KEY = "com.thebigpicture.initiative/aoeArea";
const SPELL_STATIC_ZONE_META_KEY = "com.thebigpicture.initiative/spellStaticZone";
const clone = (value) => (value === undefined ? undefined : structuredClone(value));

const sceneState = {
  ready: true,
  items: [],
  metadata: {},
  gridScale: { parsed: { multiplier: 1.5, unit: "m" } },
};

const calls = {
  getItems: [],
  updateItems: [],
  deleteItems: [],
  addItems: [],
};

const hooks = {
  onGetItems: null,
  onUpdateItems: null,
  onDeleteItems: null,
  onAddItems: null,
};

function resetCalls() {
  calls.getItems = [];
  calls.updateItems = [];
  calls.deleteItems = [];
  calls.addItems = [];
  hooks.onGetItems = null;
  hooks.onUpdateItems = null;
  hooks.onDeleteItems = null;
  hooks.onAddItems = null;
}

const broadcastListeners = new Map();

const sdkStub = {
  onReady() {},
  player: { getRole: async () => "GM" },
  room: { id: "epoch-test-room", getMetadata: async () => ({}) },
  scene: {
    isReady: async () => sceneState.ready,
    onReadyChange() {
      return () => {};
    },
    getMetadata: async () => clone(sceneState.metadata),
    setMetadata: async (update) => {
      sceneState.metadata = { ...sceneState.metadata, ...clone(update) };
    },
    grid: {
      getDpi: async () => 150,
      getScale: async () => clone(sceneState.gridScale),
    },
    items: {
      getItems: async (ids) => {
        calls.getItems.push(typeof ids === "function" ? "predicate" : ids ? clone(ids) : "all");
        if (typeof hooks.onGetItems === "function") {
          await hooks.onGetItems(ids);
        }
        if (typeof ids === "function") {
          return sceneState.items.filter(ids).map(clone);
        }
        const wanted = Array.isArray(ids) ? new Set(ids) : null;
        return sceneState.items
          .filter((item) => !wanted || wanted.has(item.id))
          .map(clone);
      },
      getItemBounds: async (ids) => {
        const id = Array.isArray(ids) ? ids[0] : ids;
        const item = sceneState.items.find((candidate) => candidate?.id === id);
        if (!item) throw new Error("item-missing");
        const x = Number(item.position?.x) || 0;
        const y = Number(item.position?.y) || 0;
        return {
          center: { x, y },
          min: { x: x - 10, y: y - 10 },
          max: { x: x + 10, y: y + 10 },
        };
      },
      updateItems: async (ids, updater) => {
        calls.updateItems.push(clone(ids));
        const wanted = new Set(Array.isArray(ids) ? ids : []);
        const drafts = sceneState.items
          .filter((item) => wanted.has(item.id))
          .map(clone);
        await updater(drafts);
        const byId = new Map(drafts.map((item) => [item.id, item]));
        sceneState.items = sceneState.items.map((item) =>
          byId.has(item.id) ? clone(byId.get(item.id)) : item
        );
        if (typeof hooks.onUpdateItems === "function") {
          await hooks.onUpdateItems(ids);
        }
      },
      deleteItems: async (ids) => {
        calls.deleteItems.push(clone(ids));
        const toDelete = new Set(Array.isArray(ids) ? ids : []);
        sceneState.items = sceneState.items.filter((item) => !toDelete.has(item.id));
        if (typeof hooks.onDeleteItems === "function") {
          await hooks.onDeleteItems(ids);
        }
      },
      addItems: async (items) => {
        calls.addItems.push(items.map((item) => item?.id));
        sceneState.items.push(...items.map(clone));
        if (typeof hooks.onAddItems === "function") {
          await hooks.onAddItems(items);
        }
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
    buildLabel: (...args) => ({ type: "LABEL", args }),
    buildImage: (...args) => ({ type: "IMAGE", args }),
    buildText: (...args) => ({ type: "TEXT", args }),
    buildShape: (...args) => ({ type: "SHAPE", args }),
    Command: { MOVE: 0, LINE: 1, CUBIC: 2, CLOSE: 3 },
    buildPath: () => ({
      commands: () => ({
        fillRule: () => ({
          fillColor: () => ({
            fillOpacity: () => ({
              strokeColor: () => ({
                strokeOpacity: () => ({
                  strokeWidth: () => ({
                    position: () => ({
                      locked: () => ({
                        disableHit: () => ({
                          layer: () => ({
                            metadata: () => ({
                              name: () => ({
                                build: () => ({ id: "mock-path" }),
                              }),
                            }),
                          }),
                        }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    }),
  },
});

const {
  mountEffectsMutationCoordinatorService,
  unmountEffectsMutationCoordinatorService,
  runEffectsMutation,
} = await import("../src/effectsMutations.js");

const {
  invalidateSceneEpoch,
  markSceneEpochReady,
} = await import("../src/sceneEpoch.js");

test.beforeEach(async () => {
  resetCalls();
  broadcastListeners.clear();
  sceneState.items = [];
  sceneState.metadata = {};
  sceneState.gridScale = { parsed: { multiplier: 1.5, unit: "m" } };
  sceneState.ready = true;
  markSceneEpochReady("test-setup");
  await mountEffectsMutationCoordinatorService();
});

test.afterEach(() => {
  unmountEffectsMutationCoordinatorService();
});

function makeChildZoneItems() {
  const caster = {
    id: "caster-1",
    layer: "CHARACTER",
    name: "Caster",
    position: { x: 0, y: 0 },
    metadata: { [META_KEY]: { hp: 20, hpMax: 20 } },
  };
  const rootZone = {
    id: "root-1",
    layer: "DRAWING",
    name: "Zona Root",
    position: { x: 0, y: 0 },
    metadata: {
      [AOE_AREA_META_KEY]: {
        type: "circle",
        start: { x: 0, y: 0 },
        end: { x: 300, y: 0 },
        dpi: 150,
        gridOrigin: { x: 0, y: 0 },
      },
      [SPELL_STATIC_ZONE_META_KEY]: {
        role: "root",
        instanceId: "inst-1",
        casterId: "caster-1",
        spellId: "earthquake",
      },
    },
  };
  const oldChild = {
    id: "child-old",
    layer: "DRAWING",
    name: "Child Old",
    position: { x: 0, y: 0 },
    metadata: {
      [AOE_AREA_META_KEY]: {
        type: "circle",
        start: { x: 0, y: 0 },
        end: { x: 50, y: 0 },
        dpi: 150,
        gridOrigin: { x: 0, y: 0 },
      },
      [SPELL_STATIC_ZONE_META_KEY]: {
        role: "subzone",
        parentZoneId: "root-1",
        parentInstanceId: "inst-1",
        casterId: "caster-1",
        spellId: "earthquake",
        childKind: "dust-cloud",
        activationId: "act-1",
      },
    },
  };
  const newChild = {
    id: "child-new",
    layer: "DRAWING",
    name: "Child New",
    position: { x: 0, y: 0 },
    metadata: {
      [AOE_AREA_META_KEY]: {
        type: "circle",
        start: { x: 0, y: 0 },
        end: { x: 50, y: 0 },
        dpi: 150,
        gridOrigin: { x: 0, y: 0 },
      },
      [SPELL_STATIC_ZONE_META_KEY]: {
        role: "subzone",
        parentZoneId: "root-1",
        parentInstanceId: "inst-1",
        casterId: "caster-1",
        spellId: "earthquake",
        childKind: "dust-cloud",
        activationId: "act-2",
      },
    },
  };
  return { caster, rootZone, oldChild, newChild };
}

function makeMovingZoneScene(actorIds = [], { ruleId = "flaming-sphere:cast" } = {}) {
  const caster = {
    id: "caster-move",
    type: "IMAGE",
    layer: "CHARACTER",
    name: "Caster",
    position: { x: -300, y: 0 },
    metadata: { [META_KEY]: { hp: 20, hpMax: 20 } },
  };
  const root = {
    id: "moving-root",
    type: "SHAPE",
    layer: "DRAWING",
    name: "Moonbeam",
    position: { x: 0, y: 0 },
    rotation: 17,
    scale: { x: 2, y: 3 },
    visible: false,
    locked: true,
    metadata: {
      [AOE_AREA_META_KEY]: {
        type: "circle",
        start: { x: 0, y: 0 },
        end: { x: 150, y: 0 },
        dpi: 150,
        gridOrigin: { x: 0, y: 0 },
        basePosition: { x: 0, y: 0 },
      },
      [SPELL_STATIC_ZONE_META_KEY]: {
        role: "root",
        instanceId: "moving-instance",
        casterId: "caster-move",
        spellId: ruleId.split(":")[0],
        ruleId,
        triggerRuntime: { sequence: 4 },
      },
      unrelated: { keep: true },
    },
  };
  const actors = actorIds.map((id, index) => ({
    id,
    type: "IMAGE",
    layer: "CHARACTER",
    name: id,
    position: { x: 600 + index * 100, y: 40 + index * 20 },
    rotation: 11 + index,
    scale: { x: 1.25, y: 0.75 },
    visible: false,
    locked: true,
    metadata: {
      [META_KEY]: { hp: 12, hpMax: 12 },
      unrelated: { actor: id },
    },
  }));
  sceneState.items = [clone(caster), clone(root), ...actors.map(clone)];
  return { caster, root, actors };
}

async function runMovingZone(
  carriedItemIds = [],
  { ruleId = "flaming-sphere:cast" } = {},
) {
  return runEffectsMutation([], {
    transport: "background",
    history: false,
    sideEffects: [{
      type: "static-zone:move",
      zoneItemId: "moving-root",
      instanceId: "moving-instance",
      ruleId,
      casterId: "caster-move",
      initialPosition: { x: 0, y: 0 },
      proposedPosition: { x: 300, y: 0 },
      carriedItemIds,
    }],
  });
}

function makeElevationItem({ id = "elevation-target", elevation, includeElevation = true } = {}) {
  const canonicalMeta = {
    hp: 18,
    hpMax: 18,
    marker: "preserve",
    ...(includeElevation ? { elevation } : {}),
  };
  const item = {
    id,
    type: "IMAGE",
    layer: "CHARACTER",
    name: "Elevation target",
    position: { x: 40, y: 80 },
    rotation: 13,
    scale: { x: 1.2, y: 0.9 },
    visible: false,
    locked: true,
    metadata: { [META_KEY]: canonicalMeta, unrelated: { keep: true } },
  };
  sceneState.items = [clone(item)];
  return item;
}

async function runElevationAdjustment({
  targetId = "elevation-target",
  delta,
  max,
  expectedElevation,
} = {}) {
  return runEffectsMutation([], {
    transport: "background",
    history: false,
    sideEffects: [{
      type: "elevation:adjust",
      targetId,
      delta,
      ...(max !== undefined ? { max } : {}),
      ...(expectedElevation !== undefined ? { expectedElevation } : {}),
    }],
  });
}

test("TEST 1 — child-zone delete → scene switch stops before addItems", async () => {
  const { caster, rootZone, oldChild, newChild } = makeChildZoneItems();
  sceneState.items = [clone(caster), clone(rootZone), clone(oldChild)];

  hooks.onDeleteItems = async (ids) => {
    if (ids.includes("child-old")) {
      invalidateSceneEpoch("scene-switch-during-delete");
      markSceneEpochReady("scene-b-ready");
    }
  };

  let caughtError = null;
  try {
    await runEffectsMutation([], {
      transport: "background",
      sideEffects: [{
        type: "static-zone:child-zones",
        parentZoneId: "root-1",
        parentInstanceId: "inst-1",
        casterId: "caster-1",
        items: [newChild],
        replaceChildKind: "dust-cloud",
      }],
    });
  } catch (err) {
    caughtError = err;
  }

  // Verify: deleteItems was called for old-child
  assert.ok(calls.deleteItems.some((ids) => ids.includes("child-old")));
  // Verify: addItems was NOT called for child-new
  assert.ok(!calls.addItems.some((ids) => ids.includes("child-new")));
  // Verify: child-new was not inserted into sceneState
  assert.ok(!sceneState.items.some((item) => item.id === "child-new"));
});

test("TEST 2 — zone move subzone read → scene switch halts before root update", async () => {
  const root = {
    id: "root-1",
    layer: "DRAWING",
    name: "Zona Root",
    position: { x: 0, y: 0 },
    metadata: {
      [SPELL_STATIC_ZONE_META_KEY]: {
        role: "root",
        instanceId: "inst-1",
        casterId: "caster-1",
        ruleId: "dust-devil",
      },
    },
  };
  const subzone = {
    id: "sub-1",
    layer: "DRAWING",
    name: "Subzone Dust",
    position: { x: 0, y: 0 },
    metadata: {
      [SPELL_STATIC_ZONE_META_KEY]: {
        role: "subzone",
        instanceId: "inst-1",
        casterId: "caster-1",
      },
    },
  };
  sceneState.items = [clone(root), clone(subzone)];

  hooks.onGetItems = async (ids) => {
    if (Array.isArray(ids) && ids.includes("sub-1")) {
      invalidateSceneEpoch("scene-switch-during-read");
      markSceneEpochReady("scene-b-ready");
    }
  };

  let caughtError = null;
  try {
    await runEffectsMutation([], {
      transport: "background",
      sideEffects: [{
        type: "static-zone:move",
        zoneItemId: "root-1",
        instanceId: "inst-1",
        ruleId: "dust-devil",
        casterId: "caster-1",
        initialPosition: { x: 0, y: 0 },
        proposedPosition: { x: 100, y: 100 },
        movementChoice: "dust-terrain",
      }],
    });
  } catch (err) {
    caughtError = err;
  }

  // Root update must NOT have occurred
  assert.equal(sceneState.items.find((i) => i.id === "root-1")?.position?.x, 0);
  assert.equal(calls.deleteItems.length, 0);
  assert.equal(calls.addItems.length, 0);
});

test("TEST 3 — zone move root update → scene switch halts before subzone delete/add", async () => {
  const root = {
    id: "root-1",
    layer: "DRAWING",
    name: "Zona Root",
    position: { x: 0, y: 0 },
    metadata: {
      [SPELL_STATIC_ZONE_META_KEY]: {
        role: "root",
        instanceId: "inst-1",
        casterId: "caster-1",
        ruleId: "dust-devil",
      },
    },
  };
  const subzone = {
    id: "sub-1",
    layer: "DRAWING",
    name: "Subzone Dust",
    position: { x: 0, y: 0 },
    metadata: {
      [SPELL_STATIC_ZONE_META_KEY]: {
        role: "subzone",
        instanceId: "inst-1",
        casterId: "caster-1",
      },
    },
  };
  sceneState.items = [clone(root), clone(subzone)];

  hooks.onUpdateItems = async (ids) => {
    if (ids.includes("root-1")) {
      invalidateSceneEpoch("scene-switch-during-update");
      markSceneEpochReady("scene-b-ready");
    }
  };

  let caughtError = null;
  try {
    await runEffectsMutation([], {
      transport: "background",
      sideEffects: [{
        type: "static-zone:move",
        zoneItemId: "root-1",
        instanceId: "inst-1",
        ruleId: "dust-devil",
        casterId: "caster-1",
        initialPosition: { x: 0, y: 0 },
        proposedPosition: { x: 100, y: 100 },
        movementChoice: "dust-terrain",
      }],
    });
  } catch (err) {
    caughtError = err;
  }

  // Old subzone delete and replacement subzone add must NOT have been called
  assert.equal(calls.deleteItems.length, 0);
  assert.equal(calls.addItems.length, 0);
  assert.ok(sceneState.items.some((i) => i.id === "sub-1"));
});

test("TEST 4 — zone move child delete → scene switch halts before replacement add", async () => {
  const root = {
    id: "root-1",
    layer: "DRAWING",
    name: "Zona Root",
    position: { x: 0, y: 0 },
    metadata: {
      [SPELL_STATIC_ZONE_META_KEY]: {
        role: "root",
        instanceId: "inst-1",
        casterId: "caster-1",
        ruleId: "dust-devil",
      },
    },
  };
  const subzone = {
    id: "sub-1",
    layer: "DRAWING",
    name: "Subzone Dust",
    position: { x: 0, y: 0 },
    metadata: {
      [SPELL_STATIC_ZONE_META_KEY]: {
        role: "subzone",
        instanceId: "inst-1",
        casterId: "caster-1",
      },
    },
  };
  sceneState.items = [clone(root), clone(subzone)];

  hooks.onDeleteItems = async (ids) => {
    if (ids.includes("sub-1")) {
      invalidateSceneEpoch("scene-switch-during-subzone-delete");
      markSceneEpochReady("scene-b-ready");
    }
  };

  let caughtError = null;
  try {
    await runEffectsMutation([], {
      transport: "background",
      sideEffects: [{
        type: "static-zone:move",
        zoneItemId: "root-1",
        instanceId: "inst-1",
        ruleId: "dust-devil",
        casterId: "caster-1",
        initialPosition: { x: 0, y: 0 },
        proposedPosition: { x: 100, y: 100 },
        movementChoice: "dust-terrain",
      }],
    });
  } catch (err) {
    caughtError = err;
  }

  assert.equal(calls.addItems.length, 0);
});

test("TEST 5 — same epoch normal flow completes delete and add sequentially", async () => {
  const { caster, rootZone, oldChild, newChild } = makeChildZoneItems();
  sceneState.items = [clone(caster), clone(rootZone), clone(oldChild)];

  await runEffectsMutation([], {
    transport: "background",
    sideEffects: [{
      type: "static-zone:child-zones",
      parentZoneId: "root-1",
      parentInstanceId: "inst-1",
      casterId: "caster-1",
      items: [newChild],
      replaceChildKind: "dust-cloud",
    }],
  });

  assert.ok(calls.deleteItems.some((ids) => ids.includes("child-old")));
  assert.ok(calls.addItems.some((ids) => ids.includes("child-new")));
  assert.ok(!sceneState.items.some((item) => item.id === "child-old"));
  assert.ok(sceneState.items.some((item) => item.id === "child-new"));
});

test("TEST 6 — single-write post guard on remove-ended halts cleanly on scene switch", async () => {
  const caster = {
    id: "caster-1",
    layer: "CHARACTER",
    name: "Caster",
    position: { x: 0, y: 0 },
    metadata: {
      [META_KEY]: {
        hp: 20,
        hpMax: 20,
        [SPELLS_META_KEY]: [{
          id: "spell-entry-1",
          name: "Web",
          turns: 10,
          conc: true,
          casterId: "caster-1",
          instanceId: "inst-ended",
        }],
        [CONC_META_KEY]: {
          web: {
            name: "Web",
            instanceId: "inst-ended",
            targets: ["caster-1"],
          },
        },
      },
    },
  };
  const zone = {
    id: "zone-to-remove",
    layer: "DRAWING",
    name: "Zona da rimuovere",
    position: { x: 0, y: 0 },
    metadata: {
      [SPELL_STATIC_ZONE_META_KEY]: {
        role: "root",
        instanceId: "inst-ended",
        casterId: "caster-1",
      },
    },
  };
  sceneState.items = [clone(caster), clone(zone)];

  hooks.onDeleteItems = async (ids) => {
    if (ids.includes("zone-to-remove")) {
      invalidateSceneEpoch("scene-switch-during-remove-ended");
      markSceneEpochReady("scene-b-ready");
    }
  };

  let caughtError = null;
  try {
    await runEffectsMutation([{
      type: "concentration:break",
      casterIds: ["caster-1"],
      reference: "inst-ended",
    }], {
      transport: "background",
      sideEffects: [{
        type: "static-zone:remove-ended",
        selectors: [{ instanceId: "inst-ended" }],
      }],
    });
  } catch (err) {
    caughtError = err;
  }

  assert.ok(calls.deleteItems.some((ids) => ids.includes("zone-to-remove")));
  assert.ok(!sceneState.items.some((i) => i.id === "zone-to-remove"));
});

test("static-zone:move root-only conserva il comportamento e aggiorna un solo item", async () => {
  const { root } = makeMovingZoneScene([]);

  const result = await runMovingZone();

  assert.equal(result.status, "applied");
  assert.deepEqual(sceneState.items.find((item) => item.id === root.id)?.position, { x: 300, y: 0 });
  assert.deepEqual(calls.updateItems, [["moving-root"]]);
  assert.equal(result.commitResult.sideEffectChanges[0].carriedItems, undefined);
  const movedRoot = sceneState.items.find((item) => item.id === root.id);
  assert.equal(movedRoot.rotation, root.rotation);
  assert.deepEqual(movedRoot.scale, root.scale);
  assert.equal(movedRoot.visible, root.visible);
  assert.equal(movedRoot.locked, root.locked);
  assert.deepEqual(movedRoot.metadata.unrelated, root.metadata.unrelated);
});

test("static-zone:move trasla root e N CHARACTER con lo stesso delta, senza doppio movimento", async () => {
  const { actors } = makeMovingZoneScene(["actor-1", "actor-2", "actor-3"]);
  const before = new Map(actors.map((actor) => [actor.id, clone(actor)]));

  const result = await runMovingZone(["actor-1", "actor-2", "actor-1", "moving-root", "actor-3"]);

  assert.equal(result.status, "applied");
  assert.deepEqual(calls.updateItems, [["moving-root", "actor-1", "actor-2", "actor-3"]]);
  for (const actor of actors) {
    const moved = sceneState.items.find((item) => item.id === actor.id);
    assert.deepEqual(moved.position, {
      x: before.get(actor.id).position.x + 300,
      y: before.get(actor.id).position.y,
    });
    assert.equal(moved.attachedTo, undefined);
    assert.equal(moved.rotation, actor.rotation);
    assert.deepEqual(moved.scale, actor.scale);
    assert.equal(moved.visible, actor.visible);
    assert.equal(moved.locked, actor.locked);
    assert.deepEqual(moved.metadata, actor.metadata);
  }
  assert.deepEqual(
    result.commitResult.sideEffectChanges[0].carriedItems.map((item) => item.id),
    ["actor-1", "actor-2", "actor-3"],
  );
});

test("static-zone:move su CHARACTER stale non sovrascrive root o actor", async () => {
  makeMovingZoneScene(["actor-stale"]);
  let carriedReads = 0;
  hooks.onGetItems = async (ids) => {
    if (!Array.isArray(ids) || !ids.includes("actor-stale")) return;
    carriedReads += 1;
    if (carriedReads !== 2) return;
    sceneState.items = sceneState.items.map((item) => item.id === "actor-stale"
      ? { ...item, position: { x: 999, y: 999 } }
      : item);
  };

  const result = await runMovingZone(["actor-stale"]);

  assert.equal(result.status, "applied");
  assert.equal(result.commitResult.sideEffectChanges.length, 0);
  assert.match(result.commitResult.postCommitErrors[0].message, /static-zone-carried-item-position-stale/);
  assert.deepEqual(sceneState.items.find((item) => item.id === "moving-root")?.position, { x: 0, y: 0 });
  assert.deepEqual(sceneState.items.find((item) => item.id === "actor-stale")?.position, { x: 999, y: 999 });
  assert.equal(calls.updateItems.length, 0);
});

test("static-zone:move su CHARACTER eliminato durante il commit fallisce in sicurezza", async () => {
  makeMovingZoneScene(["actor-deleted"]);
  let carriedReads = 0;
  hooks.onGetItems = async (ids) => {
    if (!Array.isArray(ids) || !ids.includes("actor-deleted")) return;
    carriedReads += 1;
    if (carriedReads === 2) {
      sceneState.items = sceneState.items.filter((item) => item.id !== "actor-deleted");
    }
  };

  const result = await runMovingZone(["actor-deleted"]);

  assert.equal(result.status, "applied");
  assert.equal(result.commitResult.sideEffectChanges.length, 0);
  assert.match(result.commitResult.postCommitErrors[0].message, /static-zone-carried-item-missing/);
  assert.deepEqual(sceneState.items.find((item) => item.id === "moving-root")?.position, { x: 0, y: 0 });
  assert.equal(calls.updateItems.length, 0);
});

test("elevation:adjust usa la scala grid live e preserva metadata/campi estranei", async () => {
  sceneState.gridScale = { parsed: { multiplier: 2.5, unit: "m" } };
  const target = makeElevationItem({ elevation: 1.237 });

  const result = await runElevationAdjustment({
    delta: { value: 2, unit: "grid" },
  });

  assert.equal(result.status, "applied");
  assert.deepEqual(calls.updateItems, [[target.id]]);
  const updated = sceneState.items[0];
  assert.equal(updated.metadata[META_KEY].elevation, 6.24);
  assert.equal(updated.metadata[META_KEY].hp, target.metadata[META_KEY].hp);
  assert.equal(updated.metadata[META_KEY].marker, target.metadata[META_KEY].marker);
  assert.deepEqual(updated.metadata.unrelated, target.metadata.unrelated);
  assert.equal(updated.rotation, target.rotation);
  assert.deepEqual(updated.scale, target.scale);
  assert.equal(updated.visible, target.visible);
  assert.equal(updated.locked, target.locked);
  assert.deepEqual(result.commitResult.sideEffectChanges[0], {
    id: target.id,
    type: "elevation:adjust",
    metadataKey: META_KEY,
    metadataField: "elevation",
    beforeElevation: 1.24,
    afterElevation: 6.24,
    beforePresent: true,
  });
});

test("elevation:adjust applica max clamp in unità fisiche senza hardcode della griglia", async () => {
  sceneState.gridScale = { parsed: { multiplier: 5, unit: "ft" } };
  const target = makeElevationItem({ elevation: 20 });

  const result = await runElevationAdjustment({
    delta: { value: 30, unit: "ft" },
    max: { value: 9, unit: "m" },
  });

  assert.equal(result.status, "applied");
  assert.equal(sceneState.items[0].metadata[META_KEY].elevation, 29.53);
  assert.equal(result.commitResult.sideEffectChanges[0].afterElevation, 29.53);
  assert.equal(calls.updateItems.length, 1);
  assert.equal(target.metadata[META_KEY].elevation, 20);
});

test("elevation:adjust protegge il valore atteso e non sovrascrive uno stale", async () => {
  const target = makeElevationItem({ elevation: 3 });
  const expectedConflict = await runElevationAdjustment({
    expectedElevation: 2,
    delta: 1,
  });

  assert.equal(expectedConflict.status, "conflict");
  assert.equal(calls.updateItems.length, 0);
  assert.equal(sceneState.items[0].metadata[META_KEY].elevation, target.metadata[META_KEY].elevation);

  makeElevationItem({ id: "elevation-stale", elevation: 3 });
  let targetedReads = 0;
  hooks.onGetItems = async (ids) => {
    if (!Array.isArray(ids) || !ids.includes("elevation-stale")) return;
    targetedReads += 1;
    if (targetedReads !== 2) return;
    sceneState.items = sceneState.items.map((item) => item.id === "elevation-stale"
      ? { ...item, metadata: { ...item.metadata, [META_KEY]: { ...item.metadata[META_KEY], elevation: 8 } } }
      : item);
  };

  const stale = await runElevationAdjustment({ targetId: "elevation-stale", delta: 1 });

  assert.equal(stale.status, "applied");
  assert.equal(stale.commitResult.sideEffectChanges.length, 0);
  assert.match(stale.commitResult.postCommitErrors[0].message, /elevation-adjust-stale/);
  assert.equal(calls.updateItems.length, 0);
  assert.equal(sceneState.items[0].metadata[META_KEY].elevation, 8);
});

test("elevation:adjust mantiene assente elevation quando il delta è nullo", async () => {
  const target = makeElevationItem({ includeElevation: false });

  const result = await runElevationAdjustment({ delta: 0 });

  assert.equal(result.status, "applied");
  assert.equal(result.commitResult.sideEffectChanges.length, 0);
  assert.equal(calls.updateItems.length, 0);
  assert.equal(Object.prototype.hasOwnProperty.call(
    sceneState.items[0].metadata[META_KEY],
    "elevation",
  ), false);
  assert.deepEqual(sceneState.items[0].metadata, target.metadata);
});
