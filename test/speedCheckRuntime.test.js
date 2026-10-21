import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { mock } from "node:test";
import { importBossActionHTML } from "../src/bossActionProfileCore.js";
import { bossProfileAuras } from "../src/bossAuraCore.js";
import { createSceneItemBoundsCache } from "../src/sceneItemBoundsCache.js";
import {
  classifySceneItemSnapshots,
  createSceneItemsSnapshot,
} from "../src/sceneItemChangeDispatcherCore.js";

const META_KEY = "com.thebigpicture.initiative/meta";
const STATE_KEY = "com.thebigpicture.initiative/state";
const clone = (value) => structuredClone(value);
const turn = { order: ["hero", "ally"], current: 0, round: 1 };
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
async function until(predicate) {
  for (let i = 0; i < 100; i += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error("Diagnostic did not settle");
}
function token(id = "hero", x = 0, speed = 9) {
  return {
    id, name: id, position: { x, y: 0 },
    metadata: { [META_KEY]: { attitude: "pc", initiativeCard: { speed } } },
  };
}
let env;
let moduleSequence = 0;
const sdk = {
  scene: {
    getMetadata: async () => ({ [STATE_KEY]: clone(env.turn) }),
    items: {
      async getItems(ids) {
        env.reads += 1;
        if (env.failReadOnce) { env.failReadOnce = false; throw new Error("diagnostic-transient-item-read"); }
        const captured = env.captureReadBeforeDelay ? clone(env.items) : null;
        if (env.readGate) await env.readGate.promise;
        return (captured || env.items).filter((item) => !ids || (typeof ids === "function" ? ids(item) : ids.includes(item.id))).map(clone);
      },
      async updateItems(ids, update) {
        env.updateCalls += 1;
        if (env.writeGate) await env.writeGate.promise;
        const drafts = env.items.filter((item) => ids.includes(item.id)).map(clone);
        update(drafts);
        env.writes.push(clone(drafts));
        for (const item of drafts) env.items[env.items.findIndex((entry) => entry.id === item.id)] = item;
      },
    },
    grid: {
      getDpi: async () => 1,
      snapPosition: async (position) => clone(position),
      async getDistance(a, b) {
        env.distanceReads += 1;
        if (env.distanceGate) await env.distanceGate.promise;
        return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
      },
    },
  },
  broadcast: {
    onMessage: (channel, listener) => { env.messageListeners.set(channel, listener); return () => {}; },
    sendMessage: async (channel, data) => { env.broadcasts.push({ channel, data: clone(data) }); },
  },
};
mock.module("@owlbear-rodeo/sdk", { defaultExport: sdk });
function stub(path, namedExports) {
  mock.module(new URL(path, import.meta.url).href, { namedExports });
}
stub("../src/initiativeCards.js", {
  getInitiativeCard: (item) => item.metadata?.[META_KEY]?.initiativeCard || {},
  async loadInitiativeCard(item) {
    if (env.profileGate) await env.profileGate.promise;
    return item.metadata?.[META_KEY]?.initiativeCard || {};
  },
});
stub("../src/classFeatureCatalog.js", { getEnabledClassFeatures: () => [] });
stub("../src/classFeatureCore.js", { classFeaturePassiveMovementMechanics: () => null });
stub("../src/conditions.js", { getConditionInstances: (conditions) => conditions?.instances || [] });
stub("../src/sceneItemEvents.js", {
  readSceneItemsSnapshot: () => ({ items: clone(env.items), complete: true, sceneEpoch: env.epoch }),
  subscribeSceneItemChanges: (handler) => { env.itemListener = handler; return () => {}; },
});
stub("../src/spatialSceneSnapshot.js", {
  getSpatialSceneSnapshotService: () => env.spatialService || ({
    mount() {},
    getSnapshot: async () => ({ items: clone(env.items), complete: true, sceneEpoch: env.epoch,
      dpiValue: 1, scale: { parsed: { multiplier: 1.5, unit: "m" } } }),
    isCurrent: (snapshot) => env.ready && snapshot.sceneEpoch === env.epoch,
    ensureBounds: async (_snapshot, items) => ({ complete: true, boundsById: new Map(items.map((item) => [item.id, {
      min: { x: item.position.x - 0.5, y: item.position.y - 0.5 },
      max: { x: item.position.x + 0.5, y: item.position.y + 0.5 },
    }])) }),
  }),
});
stub("../src/sceneEpoch.js", {
  currentSceneEpoch: () => env.epoch,
  isCurrentSceneEpoch: (epoch) => env.ready && epoch === env.epoch,
  subscribeSceneEpoch: (listener) => { env.sceneListener = listener; return () => {}; },
});
stub("../src/history.js", { suppressMovementHistory: () => {} });
stub("../src/spellStaticZoneCore.js", {
  SPELL_STATIC_ZONE_META_KEY: "diagnostic/zone", translatedZoneArea: () => null,
});
stub("../src/options/optionsRuntime.js", {
  runtimeOptionsService: { get: () => true }, startRuntimeOptions: async () => {},
});
stub("../src/options/optionsSelectors.js", { selectMovementReminderEnabled: () => true });
stub("../src/metadataKeyScoped.js", {
  METADATA_OWNERSHIP: { SPEED_CHECK_CONTROL: { key: "diagnostic/control" } },
  writeRoomMetadataKey: async () => {},
});

// Keep the real cache/invalidation lifecycle for the terrain integration regressions.
const { createSpatialSceneSnapshotService } = await import("../src/spatialSceneSnapshot.js?terrain-regression");
function realTerrainSpatialService() {
  return createSpatialSceneSnapshotService({
    readItemsSnapshot: () => ({ items: clone(env.items), complete: true, generation: env.spatialGeneration || 0 }),
    readSceneMetadata: () => ({ [STATE_KEY]: clone(env.turn) }),
    readGridDpi: () => 1,
    readGridScale: () => ({ parsed: { multiplier: 1.5, unit: "m" } }),
    isSceneReady: () => env.ready,
    getSceneEpoch: () => env.epoch,
    isCurrentEpoch: (epoch) => env.ready && epoch === env.epoch,
    boundsCache: createSceneItemBoundsCache(async (id) => {
      const item = env.items.find((entry) => entry.id === id);
      return { min: { x: item.position.x - 0.5, y: item.position.y - 0.5 },
        max: { x: item.position.x + 0.5, y: item.position.y + 0.5 } };
    }),
    subscribeItems: (handler) => { env.spatialItemListener = handler; return () => { env.spatialItemListener = null; }; },
    subscribeGrid: () => () => {}, subscribeSceneReady: () => () => {},
    subscribeSceneMetadata: () => () => {}, subscribeEpoch: () => () => {},
  });
}

async function runtime({ items = [token(), token("ally")], readGate, profileGate, failReadOnce = false, captureReadBeforeDelay = false } = {}) {
  env = {
    turn: clone(turn), items: clone(items), readGate, profileGate, failReadOnce, captureReadBeforeDelay,
    reads: 0, distanceReads: 0, writes: [], broadcasts: [], snapshot: null,
    epoch: 0, ready: true, updateCalls: 0, messageListeners: new Map(),
  };
  const api = await import(new URL(`../src/speedCheck.js?regression=${++moduleSequence}`, import.meta.url));
  api.subscribeSpeedCheckState((snapshot) => { env.snapshot = clone(snapshot); });
  api.setSpeedCheckEnabled(true);
  api.syncSpeedCheckTurn(env.turn);
  api.enableSpeedCheckProcessor();
  await until(() => env.reads > 0);
  return api;
}
async function ready() {
  await until(() => env.snapshot?.available || env.snapshot?.disabled);
  await new Promise((resolve) => setImmediate(resolve));
}
function move(api, from, to, extra = {}) {
  const beforePosition = typeof from === "number" ? { x: from, y: 0 } : from;
  const afterPosition = typeof to === "number" ? { x: to, y: 0 } : to;
  env.items.find((item) => item.id === (extra.id || "hero")).position = clone(afterPosition);
  return api.queueSpeedCheckMovements([{ id: "hero", beforePosition, afterPosition, ...extra }]);
}

function metadataEdit(edit) {
  const before = createSceneItemsSnapshot(env.items);
  edit(env.items[0].metadata[META_KEY]);
  return env.itemListener({
    ...classifySceneItemSnapshots(before, createSceneItemsSnapshot(env.items)),
    sceneEpoch: env.epoch,
  });
}

test("Primal Blizzard charges inside movement, follows disabling the aura and preserves Undo", async () => {
  const profile = await importBossActionHTML(readFileSync(new URL("fixtures/boss-actions/auril-phase-3.html", import.meta.url), "utf8"));
  const auril = token("auril");
  auril.metadata[META_KEY].attitude = "enemy";
  auril.metadata[META_KEY].customAuras = bossProfileAuras(profile);
  const api = await runtime({ items: [token(), token("ally"), auril] });
  await ready();
  await move(api, 0, 1);
  assert.equal(env.snapshot.totalMeters, 3, "1.5 m inside the blizzard costs 3 m");
  await move(api, 1, 0, { undo: true });
  assert.equal(env.snapshot.totalMeters, 0);
  const before = createSceneItemsSnapshot(env.items);
  env.items[2].metadata[META_KEY].customAuras.forEach((aura) => { aura.enabled = false; });
  await env.itemListener({ ...classifySceneItemSnapshots(before, createSceneItemsSnapshot(env.items)), sceneEpoch: env.epoch });
  await move(api, 0, 1);
  assert.equal(env.snapshot.totalMeters, 1.5, "a disabled aura leaves the normal movement cost");
});

test("Primal Blizzard refreshes the real spatial cache when its radius or source position changes", async () => {
  const profile = await importBossActionHTML(readFileSync(new URL("fixtures/boss-actions/auril-phase-3.html", import.meta.url), "utf8"));
  const auril = token("auril");
  auril.metadata[META_KEY] = { attitude: "enemy", customAuras: bossProfileAuras(profile) };
  const api = await runtime({ items: [token(), token("ally"), auril] });
  await ready();
  env.spatialService = realTerrainSpatialService();
  const editAura = (edit) => {
    edit(env.items[2]);
    env.spatialGeneration = (env.spatialGeneration || 0) + 1;
    env.spatialItemListener?.({});
  };
  try {
    await move(api, 0, 1);
    assert.equal(env.snapshot.totalMeters, 3);
    editAura((source) => { source.metadata[META_KEY].customAuras.find((aura) => aura.id.endsWith(":primal-blizzard")).radiusMeters = 1.5; });
    await move(api, 1, 2);
    assert.equal(env.snapshot.totalMeters, 4.5, "the next segment is outside the reduced aura");
    editAura((source) => { source.metadata[META_KEY].customAuras.find((aura) => aura.id.endsWith(":primal-blizzard")).radiusMeters = 9; });
    await move(api, 2, 3);
    assert.equal(env.snapshot.totalMeters, 7.5, "the enlarged aura doubles the cost again");
    editAura((source) => { source.position.x = 100; });
    await move(api, 3, 4);
    assert.equal(env.snapshot.totalMeters, 9, "moving Auril moves the terrain away");
    editAura((source) => { source.position.x = 0; });
    await move(api, 4, 5);
    assert.equal(env.snapshot.totalMeters, 12, "moving Auril back restores terrain at the live position");
  } finally {
    env.spatialService.unmount();
  }
});

test("Primal Blizzard charges a crossing only inside and respects the actor's movement immunity", async () => {
  const profile = await importBossActionHTML(readFileSync(new URL("fixtures/boss-actions/auril-phase-3.html", import.meta.url), "utf8"));
  const auril = token("auril");
  auril.metadata[META_KEY] = { attitude: "enemy", customAuras: bossProfileAuras(profile) };
  const api = await runtime({ items: [token("hero", 5), token("ally"), auril] });
  await ready();
  await move(api, 5, 8);
  assert.equal(env.snapshot.totalMeters, 6, "1 cell inside at double cost + 2 cells outside at normal cost");
  await metadataEdit((meta) => { meta.conditions = { instances: [{ id: "terrain-immunity", active: true,
    condition: "Libertà di movimento", mechanics: { movement: { ignoreDifficultTerrain: true } } }] }; });
  await move(api, 8, 0);
  assert.equal(env.snapshot.totalMeters, 18, "8 cells cost 12 m with difficult terrain immunity");
});

test("first segment delivered after initialization corrects a late baseline", async () => {
  const readGate = deferred();
  const api = await runtime({ readGate });
  env.items[0].position.x = 1;
  readGate.resolve();
  await ready();
  await move(api, 0, 1);
  assert.equal(env.snapshot.totalMeters, 1.5);
  assert.equal(env.items[0].metadata[META_KEY].speedCheckMovement.startPosition.x, 0);
  api.resetSpeedCheckMovement();
  await api.queueSpeedCheckMovements([]);
  assert.equal(env.items[0].position.x, 0);
});

test("a rejected delayed first segment preserves its corrected reset origin", async () => {
  const api = await runtime({ items: [token("hero", 7), token("ally")] });
  await ready();
  api.setSpeedCheckMovementLimit(true);
  await move(api, 0, 7);
  assert.equal(env.items[0].position.x, 0);
  assert.equal(env.items[0].metadata[META_KEY].speedCheckMovement.startPosition.x, 0);
  assert.equal(env.snapshot.totalMeters, 0);
});

test("real profile change records can enable an initially disabled actor", async () => {
  await runtime({ items: [token("hero", 0, 0), token("ally")] });
  await ready();
  await metadataEdit((meta) => { meta.initiativeCard.speed = 9; });
  await until(() => env.snapshot?.available);
  assert.equal(env.snapshot.speedMeters, 9);
});

test("profile changes during initialization replace the pending profile read", async () => {
  const profileGate = deferred();
  const api = await runtime({ profileGate });
  await new Promise((resolve) => setImmediate(resolve));
  await metadataEdit((meta) => { meta.initiativeCard.speed = 12; });
  profileGate.resolve();
  await ready();
  assert.equal(env.snapshot.speedMeters, 12);
  await move(api, 0, 1);
  assert.equal(env.snapshot.totalMeters, 1.5);
});

test("attitude edits disable and re-enable tracking only for PCs", async () => {
  await runtime();
  await ready();
  await metadataEdit((meta) => { meta.attitude = "enemy"; });
  await until(() => env.snapshot?.disabled);
  await metadataEdit((meta) => { meta.attitude = "pc"; });
  await until(() => env.snapshot?.available);
});

test("a queued first movement survives a profile refresh during initialization", async () => {
  const profileGate = deferred();
  const api = await runtime({ profileGate });
  const movement = move(api, 0, 1);
  await new Promise((resolve) => setImmediate(resolve));
  await metadataEdit((meta) => { meta.initiativeCard.speed = 12; });
  profileGate.resolve();
  await movement;
  await ready();
  assert.equal(env.snapshot.speedMeters, 12);
  assert.equal(env.snapshot.totalMeters, 1.5);
  assert.equal(env.items[0].metadata[META_KEY].speedCheckMovement.startPosition.x, 0);
});

test("synthetic drag counts its first segment once and cancel retreats it", async () => {
  const api = await runtime({ items: [token("hero", 1), token("ally")] });
  await ready();
  const listener = [...env.messageListeners].find(([channel]) => channel.endsWith("/speed-drag"))?.[1];
  assert.ok(listener);
  const drag = { itemId: "hero", dragId: "first-drag" };
  listener({ data: { ...drag, type: "start" } });
  listener({ data: { ...drag, type: "segment", beforePosition: { x: 0, y: 0 },
    afterPosition: { x: 1, y: 0 }, beforeCell: { x: 0, y: 0 }, afterCell: { x: 1, y: 0 } } });
  await api.queueSpeedCheckMovements([]);
  assert.equal(env.snapshot.totalMeters, 1.5);
  await move(api, 0, 1);
  assert.equal(env.snapshot.totalMeters, 1.5);
  listener({ data: { ...drag, type: "cancel" } });
  await api.queueSpeedCheckMovements([]);
  assert.equal(env.snapshot.totalMeters, 0);
  assert.equal(env.items[0].metadata[META_KEY].speedCheckMovement.startPosition.x, 0);
});

test("late initialization counts first movement and persists its original reset position", async () => {
  const readGate = deferred();
  const api = await runtime({ readGate });
  const movement = move(api, 0, 1);
  readGate.resolve();
  await movement;
  assert.equal(env.snapshot.totalMeters, 1.5);
  assert.equal(env.items[0].metadata[META_KEY].speedCheckMovement.startPosition.x, 0);
  api.resetSpeedCheckMovement();
  await api.queueSpeedCheckMovements([]);
  assert.equal(env.items[0].position.x, 0);
  assert.equal(env.snapshot.totalMeters, 0);
});

function unload() {
  env.epoch += 1;
  env.ready = false;
  env.sceneListener?.({ phase: "unload", epoch: env.epoch });
}
function reload(api, items = [token("hero", 10), token("ally")]) {
  env.items = clone(items);
  env.ready = true;
  env.sceneListener?.({ phase: "ready", epoch: env.epoch });
  api.syncSpeedCheckTurn(env.turn);
}

test("scene reload with identical IDs discards the old baseline", async () => {
  const api = await runtime();
  await ready();
  await move(api, 0, 1);
  unload();
  reload(api);
  await ready();
  await move(api, 10, 11);
  assert.equal(env.snapshot.totalMeters, 1.5);
  assert.equal(env.items[0].metadata[META_KEY].speedCheckMovement.startPosition.x, 10);
});

test("an old initialization read cannot persist into a new scene", async () => {
  const readGate = deferred();
  const api = await runtime({ readGate, captureReadBeforeDelay: true });
  unload();
  reload(api);
  readGate.resolve();
  await ready();
  assert.equal(env.snapshot.totalMeters, 0);
  assert.equal(env.items[0].metadata[META_KEY].speedCheckMovement.startPosition.x, 10);
});

test("an already submitted delayed write cannot overwrite the new scene baseline", async () => {
  const api = await runtime();
  await ready();
  const beforeCalls = env.updateCalls;
  env.writeGate = deferred();
  const pending = move(api, 0, 1);
  await until(() => env.updateCalls > beforeCalls);
  unload();
  reload(api);
  await ready();
  env.writeGate.resolve();
  await pending;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(env.items[0].metadata[META_KEY].speedCheckMovement.totalMeters, 0);
  assert.equal(env.items[0].metadata[META_KEY].speedCheckMovement.startPosition.x, 10);
});

test("a movement waiting for grid distance is discarded on scene unload", async () => {
  const api = await runtime();
  await ready();
  env.distanceGate = deferred();
  const pending = move(api, 0, 1);
  await until(() => env.distanceReads > 0);
  unload();
  reload(api);
  await ready();
  env.distanceGate.resolve();
  await pending;
  assert.equal(env.snapshot.totalMeters, 0);
  assert.equal(env.items[0].metadata[META_KEY].speedCheckMovement.totalMeters, 0);
});

test("turn navigation preserves an already processing outgoing movement", async () => {
  const api = await runtime();
  await ready();
  env.distanceGate = deferred();
  const pending = move(api, 0, 1);
  await until(() => env.distanceReads > 0);
  env.turn.current = 1;
  api.syncSpeedCheckTurn(env.turn);
  await until(() => env.snapshot.itemId === "ally" && env.snapshot.available);
  env.distanceGate.resolve();
  await pending;
  assert.equal(env.items[0].metadata[META_KEY].speedCheckMovement.totalMeters, 1.5);
  assert.equal(env.snapshot.totalMeters, 0);
});

test("combat clear removes only movement data and a rebuilt first turn starts fresh", async () => {
  const api = await runtime();
  await ready();
  await move(api, 0, 1);
  env.items[0].metadata[META_KEY].hp = 7;
  env.items[0].metadata.foreign = { preserve: true };
  const position = clone(env.items[0].position);
  env.turn = { order: [], current: 0, round: 1 };
  await api.clearSpeedCheckCombatMovement(["hero", "ally"]);
  assert.equal(env.items[0].metadata[META_KEY].speedCheckMovement, undefined);
  assert.equal(env.items[0].metadata[META_KEY].hp, 7);
  assert.deepEqual(env.items[0].metadata.foreign, { preserve: true });
  assert.deepEqual(env.items[0].position, position);
  env.turn = clone(turn);
  api.syncSpeedCheckTurn(env.turn);
  await ready();
  assert.equal(env.snapshot.totalMeters, 0);
  await move(api, 1, 2);
  assert.equal(env.snapshot.totalMeters, 1.5);
});

test("the clear-initiative button drains and clears movement after the scene state reset", async () => {
  const api = await runtime();
  await ready();
  await move(api, 0, 1);
  // Hero was removed individually; its previous movement still needs clearing.
  env.items[1].metadata[META_KEY].inInitiative = true;
  let click;
  const button = { style: {}, dataset: {}, addEventListener: (name, handler) => { click = handler; } };
  const source = readFileSync(new URL("../src/initiativeList.js", import.meta.url), "utf8");
  const start = source.indexOf("function makeClearInitiativeBtn()");
  const body = source.slice(start, source.indexOf("let __historyUndoShortcutMounted", start));
  const dependencies = {
    document: { createElement: () => button }, OBR: sdk, META_KEY,
    currentSceneEpoch: () => env.epoch, __isCurrentSceneOperation: (epoch) => epoch === env.epoch && env.ready,
    async resetTrackerState() { env.turn = { order: [], current: 0, round: 1 }; api.syncSpeedCheckTurn(env.turn); },
    clearSpeedCheckCombatMovement: api.clearSpeedCheckCombatMovement,
    renderAll: async () => {},
  };
  const create = new Function("dependencies", `const { ${Object.keys(dependencies).join(", ")} } = dependencies;
    ${body}\nreturn makeClearInitiativeBtn();`);
  create(dependencies);
  await click({ stopPropagation() {} });
  assert.equal(env.items[0].metadata[META_KEY].inInitiative, undefined);
  assert.equal(env.items[0].metadata[META_KEY].speedCheckMovement, undefined);
  assert.equal(env.items[1].metadata[META_KEY].inInitiative, undefined);
  assert.equal(button.disabled, false);
});

test("prewarming the current turn cannot discard its pending first-movement origin", async () => {
  const readGate = deferred();
  const api = await runtime({ readGate });
  const pending = move(api, 0, 1);
  await new Promise((resolve) => setImmediate(resolve));
  api.prewarmSpeedCheckTurn(env.turn);
  readGate.resolve();
  await pending;
  assert.equal(env.snapshot.totalMeters, 1.5);
});

test("a reset waiting in the movement queue cannot reset a new scene", async () => {
  const api = await runtime();
  await ready();
  env.distanceGate = deferred();
  const pending = move(api, 0, 1);
  await until(() => env.distanceReads > 0);
  api.resetSpeedCheckMovement();
  unload();
  reload(api);
  await ready();
  api.adjustSpeedCheckDash(1);
  env.distanceGate.resolve();
  await pending;
  await api.queueSpeedCheckMovements([]);
  assert.equal(env.snapshot.dashCount, 1);
});

test("late initialization retains every segment of a mixed path", async () => {
  const readGate = deferred();
  const api = await runtime({ readGate });
  void move(api, 0, 1);
  const movement = move(api, { x: 1, y: 0 }, { x: 1, y: 1 });
  readGate.resolve();
  await movement;
  assert.equal(env.snapshot.totalMeters, 3);
});

test("late initialization enforces the first movement allowance", async () => {
  const readGate = deferred();
  const api = await runtime({ readGate });
  api.setSpeedCheckMovementLimit(true);
  const movement = move(api, 0, 7);
  readGate.resolve();
  await movement;
  assert.equal(env.items[0].position.x, 0);
  assert.equal(env.snapshot.totalMeters, 0);
  assert.equal(env.broadcasts.filter((entry) => entry.channel.endsWith("/speed-warning")).length, 1);
});

test("late initialization warns after exceeding speed with limiting disabled", async () => {
  const readGate = deferred();
  const api = await runtime({ readGate });
  const movement = move(api, 0, 7);
  readGate.resolve();
  await movement;
  assert.equal(env.snapshot.totalMeters, 10.5);
  assert.equal(env.items[0].position.x, 7);
  assert.equal(env.broadcasts.filter((entry) => entry.channel.endsWith("/speed-warning")).length, 1);
});

test("reload of a persisted turn retains its consumed movement and start position", async () => {
  const item = token("hero", 2);
  item.metadata[META_KEY].speedCheckMovement = {
    turnKey: "1:0:hero", totalMeters: 3, startPosition: { x: 0, y: 0 },
    startCell: { x: 0, y: 0 }, lastCell: { x: 2, y: 0 }, startElevation: 0,
  };
  const readGate = deferred();
  const api = await runtime({ items: [item, token("ally")], readGate });
  const movement = move(api, 2, 3);
  readGate.resolve();
  await movement;
  assert.equal(env.snapshot.totalMeters, 4.5);
  assert.equal(env.items[0].metadata[META_KEY].speedCheckMovement.startPosition.x, 0);
});

test("slow profile, normal movement and Undo retain their current semantics", async () => {
  const profileGate = deferred();
  const api = await runtime({ profileGate });
  const movement = move(api, 0, 2);
  profileGate.resolve();
  await movement;
  assert.equal(env.snapshot.totalMeters, 3);
  await move(api, 2, 0, { undo: true });
  assert.equal(env.snapshot.totalMeters, 0);
  await move(api, 0, 1, { id: "ally" });
  assert.equal(env.snapshot.totalMeters, 0);
});

test("a transient first read failure is retried in the same turn", async () => {
  const api = await runtime({ failReadOnce: true });
  await new Promise((resolve) => setImmediate(resolve));
  await move(api, 0, 1);
  assert.equal(env.snapshot.totalMeters, 1.5);
  assert.equal(env.reads, 2);
});

test("a disabled initial speed can be enabled by editing the card in the same turn", async () => {
  const api = await runtime({ items: [token("hero", 0, 0), token("ally")] });
  await ready();
  env.items[0].metadata[META_KEY].initiativeCard.speed = 9;
  await env.itemListener({ items: clone(env.items), flags: { tracker: true }, changedRecords: [] });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(env.snapshot.available, true);
  await move(api, 0, 1);
  assert.equal(env.snapshot.totalMeters, 1.5);
});

test("editing base speed preserves consumed distance, dash and bonus", async () => {
  const api = await runtime();
  await ready();
  await move(api, 0, 3);
  api.adjustSpeedCheckDash(1);
  api.adjustSpeedCheckBonus(1.5);
  env.items[0].metadata[META_KEY].initiativeCard.speed = 12;
  await env.itemListener({ items: clone(env.items), flags: { tracker: true }, changedRecords: [] });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(env.snapshot.speedMeters, 12);
  assert.equal(env.snapshot.totalMeters, 4.5);
  assert.equal(env.snapshot.remainingMeters, 21);
});

test("condition-only refresh charges standing once without reloading the card", async () => {
  const item = token();
  item.metadata[META_KEY].conditions = { instances: [{ condition: "Prono", active: true }] };
  const api = await runtime({ items: [item, token("ally")] });
  await ready();
  await move(api, 0, 1);
  assert.equal(env.snapshot.totalMeters, 3);
  env.items[0].metadata[META_KEY].conditions.instances = [];
  const event = { items: clone(env.items), flags: { conditions: true }, changedRecords: [] };
  await env.itemListener(event);
  await env.itemListener(event);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(env.snapshot.totalMeters, 7.5);
});
