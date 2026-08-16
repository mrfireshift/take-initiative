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
      getScale: async () => ({ parsed: { multiplier: 1.5, unit: "m" } }),
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
