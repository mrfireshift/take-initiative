import assert from "node:assert/strict";
import test, { mock } from "node:test";

const META_KEY = "com.thebigpicture.initiative/meta";
const STATE_KEY = "com.thebigpicture.initiative/state";
const sceneItems = new Map();
const localItems = new Map();
const localCalls = { addAttempts: [], addItems: [], deleteItems: [] };
const broadcasts = [];
const listeners = new Map();
const mutationCalls = [];
let nextMutationGate = null;
let failLocalAdd = false;

const clone = (value) => value === undefined ? undefined : structuredClone(value);

function sceneItem(id) {
  return sceneItems.get(id) || null;
}

const sdk = {
  onReady() {},
  room: {
    id: "shield-vfx-repro-room",
    getMetadata: async () => ({}),
    onMetadataChange: () => () => {},
  },
  player: { getRole: async () => "GM" },
  scene: {
    isReady: async () => true,
    onReadyChange: () => () => {},
    onMetadataChange: () => () => {},
    getMetadata: async () => ({
      [STATE_KEY]: { round: 1, current: 0, order: ["caster"] },
    }),
    items: {
      getItems: async (ids) => {
        if (typeof ids === "function") {
          return [...sceneItems.values()].filter(ids).map(clone);
        }
        if (!Array.isArray(ids)) return [...sceneItems.values()].map(clone);
        return ids.map(sceneItem).filter(Boolean).map(clone);
      },
      getItemBounds: async () => ({
        min: { x: 25, y: 25 },
        max: { x: 175, y: 175 },
        width: 150,
        height: 150,
      }),
      updateItems: async () => {},
      addItems: async (items) => {
        for (const item of items) sceneItems.set(item.id, clone(item));
      },
      deleteItems: async (ids) => {
        for (const id of ids) sceneItems.delete(id);
      },
    },
    grid: {
      getDpi: async () => 150,
      getScale: async () => ({ parsed: { multiplier: 1.5, unit: "m" } }),
    },
    local: {
      getItems: async (predicate) => {
        const values = [...localItems.values()];
        return (typeof predicate === "function" ? values.filter(predicate) : values).map(clone);
      },
      addItems: async (items) => {
        localCalls.addAttempts.push(items.map((item) => item.id));
        if (failLocalAdd) throw new Error("simulated-vfx-render-failure");
        localCalls.addItems.push(items.map((item) => item.id));
        for (const item of items) localItems.set(item.id, clone(item));
      },
      deleteItems: async (ids) => {
        localCalls.deleteItems.push([...ids]);
        for (const id of ids) localItems.delete(id);
      },
    },
  },
  broadcast: {
    onMessage(channel, listener) {
      const channelListeners = listeners.get(channel) || new Set();
      channelListeners.add(listener);
      listeners.set(channel, channelListeners);
      return () => channelListeners.delete(listener);
    },
    async sendMessage(channel, data, options) {
      broadcasts.push({ channel, data: clone(data), options: clone(options) });
      for (const listener of [...(listeners.get(channel) || [])]) {
        await listener({ data: clone(data) });
      }
    },
  },
};

function imageBuilder() {
  const item = {
    id: `shield-vfx-local-${localItems.size + localCalls.addItems.length + 1}`,
    metadata: {},
  };
  const builder = {
    scale(value) { item.scale = value; return builder; },
    position(value) { item.position = value; return builder; },
    rotation(value) { item.rotation = value; return builder; },
    disableHit(value) { item.disableHit = value; return builder; },
    locked(value) { item.locked = value; return builder; },
    layer(value) { item.layer = value; return builder; },
    disableAutoZIndex(value) { item.disableAutoZIndex = value; return builder; },
    visible(value) { item.visible = value; return builder; },
    zIndex(value) { item.zIndex = value; return builder; },
    metadata(value) { item.metadata = { ...item.metadata, ...value }; return builder; },
    name(value) { item.name = value; return builder; },
    attachedTo(value) { item.attachedTo = value; return builder; },
    build() { return item; },
  };
  return builder;
}

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: sdk,
    buildImage: () => imageBuilder(),
    buildLabel: () => ({ build: () => ({ id: "label" }) }),
    buildText: () => ({ build: () => ({ id: "text" }) }),
    buildShape: () => ({ build: () => ({ id: "shape" }) }),
    buildPath: () => ({ build: () => ({ id: "path" }) }),
    Command: { MOVE: 0, LINE: 1, CUBIC: 2, CLOSE: 3 },
  },
});

mock.module("../src/effectsMutations.js", {
  exports: {
    conditionMutationOperations: (request) => [{ type: "condition:add", request }],
    runEffectsMutation: async (operations, options) => {
      mutationCalls.push({ operations: clone(operations), options: clone(options) });
      const mutationGate = nextMutationGate;
      nextMutationGate = null;
      if (mutationGate) {
        mutationGate.markEntered();
        await mutationGate.promise;
      }
      return {
        status: "applied",
        committed: true,
        changedIds: ["caster"],
        historyEntryId: "shield-history-1",
        undoAvailable: true,
        changes: [],
      };
    },
    requireAppliedEffectsMutation: (result) => result,
    tickRoundEffects: async () => ({ status: "applied", changedIds: [] }),
  },
});

const { executeDirectQuickAction } = await import("../src/quickActionExecution.js?shield-vfx-repro");
const { executeSpellUnifiedLifecycle } = await import("../src/spellUnifiedLifecycleAdapter.js");
const {
  buildSpellUnifiedPanelContract,
  createSpellPanelSession,
} = await import("../src/spellUnifiedPanelCore.js");
const renderer = await import("../src/embersMatchedVisualRenderer.js");
const {
  currentSceneEpoch,
  invalidateSceneEpoch,
  markSceneEpochReady,
} = await import("../src/sceneEpoch.js");
const {
  buildMatchedVisualEvent,
  getMatchedSpellVisualDefinition,
  matchedVisualLayerPlan,
} = await import("../src/embersMatchedVisualCore.js");

function reset() {
  sceneItems.clear();
  localItems.clear();
  localCalls.addAttempts.length = 0;
  localCalls.addItems.length = 0;
  localCalls.deleteItems.length = 0;
  broadcasts.length = 0;
  mutationCalls.length = 0;
  nextMutationGate = null;
  failLocalAdd = false;
  sceneItems.set("caster", {
    id: "caster",
    name: "Caster",
    layer: "CHARACTER",
    position: { x: 100, y: 100 },
    metadata: { [META_KEY]: { inInitiative: true } },
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, timeout, label) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await sleep(20);
  }
  assert.fail(`Timed out waiting for ${label}`);
}

function createMutationGate() {
  let release;
  let markEntered;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  const entered = new Promise((resolve) => {
    markEntered = resolve;
  });
  return { promise, release, entered, markEntered };
}

test("Shield usa la definizione matched corrente e il lifecycle cosmetico previsto", () => {
  const definition = getMatchedSpellVisualDefinition("shield");
  assert.equal(definition.spellId, "shield");
  assert.deepEqual(definition.visuals.map((visual) => visual.effectId), [
    "shieldIntro",
    "shieldLoop",
  ]);
  assert.equal(definition.visuals[0].kind, "circle");
  assert.equal(definition.visuals[0].anchor, "caster");
  assert.equal(definition.visuals[0].persistent, false);
  assert.equal(definition.visuals[0].oneShot, false);
  assert.equal(definition.visuals[1].persistent, true);
  assert.equal(definition.visuals[1].attachedTo, "caster");
  assert.equal(definition.visuals[1].delay, 1100);
  assert.deepEqual(definition.endVisuals.map((visual) => visual.effectId), [
    "shieldOutroFade",
  ]);

  const event = buildMatchedVisualEvent({
    spellId: "shield",
    eventId: "shield-definition-event",
    lifecycleId: "shield-definition-lifecycle",
    casterId: "caster",
    caster: { id: "caster", center: { x: 100, y: 100 }, diameter: 200 },
    sceneDpi: 150,
    sceneEpoch: 0,
  });
  assert.equal(event.layers.length, 2);
  const introPlan = matchedVisualLayerPlan(event.layers[0], event.dpi);
  assert.match(
    introPlan.url,
    /1st_Level\/Shield\/Shield_01_Regular_Blue_Intro_400x400\.webm$/u,
  );
  assert.equal(introPlan.duration, 1200);
  assert.equal(event.layers[1].attachedTo, "caster");
});

test("repro: Quick Action Shield percorre mutation, matched event e renderer", async () => {
  reset();
  renderer.mountEmbersMatchedVisualRenderer();
  try {
    const result = await executeDirectQuickAction({
      action: {
        id: "quick-shield",
        label: "Scudo",
        kind: "spell",
        spellId: "shield",
        targetMode: "self",
        launchMode: "auto",
      },
      sourceItem: sceneItem("caster"),
    });

    await sleep(80);

    assert.equal(result.mode, "executed", JSON.stringify(result));
    assert.equal(mutationCalls.length, 1);
    assert.equal(broadcasts.length, 1);
    assert.equal(broadcasts[0].data.spellId, "shield");
    assert.equal(broadcasts[0].data.type, "embers-matched");
    assert.equal(broadcasts[0].data.mode, "start");
    assert.equal(broadcasts[0].data.layers[0].effectId, "shieldIntro");
    assert.equal(localCalls.addItems.length, 1);
    assert.equal(localCalls.addItems[0].length, 1);
  } finally {
    await renderer.unmountEmbersMatchedVisualRenderer();
  }
});

test("repro: Unified spell workflow Shield raggiunge lo stesso executor e il renderer", async () => {
  reset();
  renderer.mountEmbersMatchedVisualRenderer();
  try {
    const contract = buildSpellUnifiedPanelContract({ spellId: "shield" });
    const session = createSpellPanelSession({
      contract,
      casterId: "caster",
    });
    const result = await executeSpellUnifiedLifecycle({
      contract,
      session,
      runtime: {
        commandId: "unified-shield-cast",
        sceneEpoch: currentSceneEpoch(),
        sceneIdentity: "scene-shield-vfx",
      },
    });
    await sleep(80);

    assert.equal(result.status, "committed");
    assert.equal(result.request.spell.id, "shield");
    assert.equal(mutationCalls.length, 1);
    assert.equal(broadcasts.length, 1);
    assert.equal(broadcasts[0].data.spellId, "shield");
    assert.equal(broadcasts[0].data.mode, "start");
    assert.equal(localCalls.addItems.length, 1);
  } finally {
    await renderer.unmountEmbersMatchedVisualRenderer();
  }
});

test("Shield usa il renderer matched una sola volta per cast e consente il cast successivo", async () => {
  reset();
  renderer.mountEmbersMatchedVisualRenderer();
  try {
    const action = (id) => ({
      id,
      label: "Scudo",
      kind: "spell",
      spellId: "shield",
      targetMode: "self",
      launchMode: "auto",
    });
    const first = await executeDirectQuickAction({
      action: action("quick-shield-1"),
      sourceItem: sceneItem("caster"),
    });
    const second = await executeDirectQuickAction({
      action: action("quick-shield-2"),
      sourceItem: sceneItem("caster"),
    });
    await sleep(100);

    assert.equal(first.mode, "executed");
    assert.equal(second.mode, "executed");
    assert.equal(mutationCalls.length, 2);
    assert.equal(broadcasts.length, 2);
    assert.deepEqual(
      broadcasts.map((entry) => entry.data.spellId),
      ["shield", "shield"],
    );
    assert.equal(new Set(broadcasts.map((entry) => entry.data.eventId)).size, 2);
    assert.equal(localCalls.addItems.length, 2);
    assert.equal(localItems.size, 2);
  } finally {
    await renderer.unmountEmbersMatchedVisualRenderer();
  }
});

test("Shield of Faith restaura il consumer della stessa primitive matched", async () => {
  reset();
  renderer.mountEmbersMatchedVisualRenderer();
  try {
    const result = await executeDirectQuickAction({
      action: {
        id: "quick-shield-of-faith",
        label: "Scudo della fede",
        kind: "spell",
        spellId: "shield-of-faith",
        targetMode: "self",
        launchMode: "auto",
      },
      sourceItem: sceneItem("caster"),
    });
    await sleep(80);

    assert.equal(result.mode, "executed");
    assert.equal(mutationCalls.length, 1);
    assert.equal(broadcasts.length, 1);
    assert.equal(broadcasts[0].data.spellId, "shield-of-faith");
    assert.deepEqual(
      broadcasts[0].data.layers.map((layer) => layer.effectId),
      ["shieldFaithIntro", "shieldFaithLoop"],
    );
    assert.equal(localCalls.addItems.length, 1);
    assert.equal(localItems.size, 1);
  } finally {
    await renderer.unmountEmbersMatchedVisualRenderer();
  }
});

test("Shield segue il terminal end e pulisce intro, loop persistente e outro", async () => {
  reset();
  renderer.mountEmbersMatchedVisualRenderer();
  try {
    const result = await executeDirectQuickAction({
      action: {
        id: "quick-shield-lifecycle",
        label: "Scudo",
        kind: "spell",
        spellId: "shield",
        targetMode: "self",
        launchMode: "auto",
      },
      sourceItem: sceneItem("caster"),
    });
    assert.equal(result.mode, "executed");
    await waitFor(() => localItems.size === 1, 500, "Shield intro creation");
    assert.equal(
      [...localItems.values()][0].metadata?.["com.thebigpicture.initiative/embersMatchedVisual"]?.effectId,
      "shieldIntro",
    );

    await waitFor(
      () => [...localItems.values()].some((item) => (
        item.metadata?.["com.thebigpicture.initiative/embersMatchedVisual"]?.effectId === "shieldLoop"
      )),
      1600,
      "Shield persistent loop creation",
    );
    const lifecycleId = broadcasts[0].data.lifecycleId;
    const endResult = await renderer.emitMatchedSpellVisualEnd({
      spellId: "shield",
      casterId: "caster",
      lifecycleId,
      targetIds: [],
      sceneEpoch: currentSceneEpoch(),
    });
    assert.equal(endResult.sent, true);
    await waitFor(
      () => ![...localItems.values()].some((item) => (
        item.metadata?.["com.thebigpicture.initiative/embersMatchedVisual"]?.effectId === "shieldLoop"
      )),
      500,
      "Shield loop terminal cleanup",
    );
    assert.ok(
      [...localItems.values()].some((item) => (
        item.metadata?.["com.thebigpicture.initiative/embersMatchedVisual"]?.effectId === "shieldOutroFade"
      )),
      "Shield outro must be created at terminal end",
    );
    await waitFor(() => localItems.size === 0, 1800, "Shield outro cleanup");
    assert.ok(localCalls.deleteItems.length >= 2);
  } finally {
    await renderer.unmountEmbersMatchedVisualRenderer();
  }
});

test("un failure del renderer non impedisce l'applicazione meccanica di Shield", async () => {
  reset();
  renderer.mountEmbersMatchedVisualRenderer();
  failLocalAdd = true;
  try {
    const result = await executeDirectQuickAction({
      action: {
        id: "quick-shield-render-failure",
        label: "Scudo",
        kind: "spell",
        spellId: "shield",
        targetMode: "self",
        launchMode: "auto",
      },
      sourceItem: sceneItem("caster"),
    });
    await sleep(80);

    assert.equal(result.mode, "executed");
    assert.deepEqual(result.changedIds, ["caster"]);
    assert.equal(mutationCalls.length, 1);
    assert.equal(broadcasts.length, 1);
    assert.equal(localCalls.addAttempts.length, 1);
    assert.equal(localItems.size, 0);
  } finally {
    failLocalAdd = false;
    await renderer.unmountEmbersMatchedVisualRenderer();
  }
});

test("Shield dal pannello non perde il matched start quando l'epoch del workflow è privato", async () => {
  reset();
  renderer.mountEmbersMatchedVisualRenderer();
  try {
    // The unified panel owns a private scene lifecycle. Its epoch may still
    // be 0 while the matched renderer's shared epoch is already 1 after a
    // scene reload. The mechanic must commit, but the visual must use the
    // renderer's compatible epoch rather than being rejected as stale.
    invalidateSceneEpoch("shield-private-workflow-epoch");
    markSceneEpochReady("shield-private-workflow-ready");
    assert.equal(currentSceneEpoch(), 1);

    const contract = buildSpellUnifiedPanelContract({ spellId: "shield" });
    const session = createSpellPanelSession({
      contract,
      casterId: "caster",
    });
    const result = await executeSpellUnifiedLifecycle({
      contract,
      session,
      runtime: {
        // This is the value a fresh private panel lifecycle captures.
        sceneEpoch: 0,
        visualSceneEpoch: currentSceneEpoch(),
        isCurrent: () => true,
        commandId: "shield-private-workflow-cast",
      },
    });
    await sleep(80);

    assert.equal(result.status, "committed");
    assert.equal(result.request.visualSceneEpoch, 1);
    assert.equal(mutationCalls.length, 1);
    assert.equal(broadcasts.length, 1);
    assert.equal(broadcasts[0].data.spellId, "shield");
    assert.equal(broadcasts[0].data.mode, "start");
    assert.equal(broadcasts[0].data.sceneEpoch, 1);
    assert.equal(localCalls.addItems.length, 1);
  } finally {
    await renderer.unmountEmbersMatchedVisualRenderer();
  }
});

test("repro: Quick Action Shield non riancora il VFX alla scena successiva", async () => {
  reset();
  renderer.mountEmbersMatchedVisualRenderer();
  try {
    const castEpoch = currentSceneEpoch();
    const mutationGate = createMutationGate();
    nextMutationGate = mutationGate;

    const castPromise = executeDirectQuickAction({
      action: {
        id: "quick-shield-scene-race",
        label: "Scudo",
        kind: "spell",
        spellId: "shield",
        targetMode: "self",
        launchMode: "auto",
      },
      sourceItem: sceneItem("caster"),
    });
    await mutationGate.entered;

    invalidateSceneEpoch("shield-scene-switch");
    markSceneEpochReady("shield-next-scene-ready");
    mutationGate.release();

    const result = await castPromise;
    await sleep(80);

    assert.equal(result.mode, "executed");
    assert.equal(mutationCalls.length, 1);
    assert.equal(broadcasts.length, 0);
    assert.equal(localCalls.addItems.length, 0);
    assert.notEqual(currentSceneEpoch(), castEpoch);
  } finally {
    nextMutationGate?.release?.();
    await renderer.unmountEmbersMatchedVisualRenderer();
  }
});
