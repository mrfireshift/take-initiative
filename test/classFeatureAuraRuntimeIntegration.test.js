import test, { mock } from "node:test";
import assert from "node:assert/strict";

let currentSceneItems = [];
let currentSceneMetadata = {};
let playerSelection = [];

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: {
      onReady() {},
      room: { id: "test-room", getMetadata: async () => ({}) },
      scene: {
        isReady: async () => true,
        getMetadata: async () => currentSceneMetadata,
        onReadyChange: () => () => {},
        grid: {
          getDpi: async () => 150,
          getScale: async () => ({ parsed: { multiplier: 1.5, unit: "m" } }),
          snapPosition: async (pos) => pos,
          onChange: () => () => {},
        },
        items: {
          getItems: async (idsOrFilter) => {
            if (typeof idsOrFilter === "function") {
              return currentSceneItems.filter(idsOrFilter);
            }
            if (Array.isArray(idsOrFilter)) {
              const set = new Set(idsOrFilter);
              return currentSceneItems.filter((item) => set.has(item.id));
            }
            return currentSceneItems;
          },
          getItemBounds: async (ids) => {
            const list = Array.isArray(ids) ? ids : [ids];
            return list.map((id) => {
              const item = currentSceneItems.find((entry) => entry.id === id);
              const x = item?.position?.x || 0;
              const y = item?.position?.y || 0;
              return {
                min: { x, y },
                max: { x: x + 150, y: y + 150 },
                width: 150,
                height: 150,
              };
            });
          },
          updateItems: async (idsOrFilter, updater) => {
            const targets = typeof idsOrFilter === "function"
              ? currentSceneItems.filter(idsOrFilter)
              : Array.isArray(idsOrFilter)
                ? currentSceneItems.filter((i) => idsOrFilter.includes(i.id))
                : currentSceneItems;
            updater(targets);
            return targets;
          },
          onChange: () => () => {},
        },
      },
      player: {
        getRole: async () => "GM",
        getSelection: async () => playerSelection,
      },
      broadcast: {
        onMessage: () => () => {},
        sendMessage: async () => {},
      },
    },
    buildLabel: (...args) => ({ type: "LABEL", args }),
    buildImage: (...args) => ({ type: "IMAGE", args }),
    buildPath: (...args) => ({ type: "PATH", args }),
    buildText: (...args) => ({ type: "TEXT", args }),
    buildShape: (...args) => ({ type: "SHAPE", args }),
    Command: class Command {},
  },
});

mock.module("../src/initiativeCards.js", {
  exports: {
    getInitiativeCard: (item) => item?.metadata?.[META_KEY]?.initiativeCard || {},
    getCharacterBuild: (item) => item?.metadata?.[META_KEY]?.initiativeCard?.characterBuild || [],
  },
});

const { ID } = await import("../src/constants.js");
const { CLASS_FEATURE_BY_ID, CLASS_FEATURE_RESOURCE_POOL_BY_ID } = await import("../src/classFeatureCatalog.js");
const {
  planClassFeatureActivation,
  CLASS_FEATURE_STATE_FIELD,
} = await import("../src/classFeatureCore.js");
const {
  collectActiveClassFeatureAuras,
  classFeatureAuraTargetIds,
  classFeatureAuraMembershipPlan,
  staleClassFeatureAuraEffectRemovals,
} = await import("../src/classFeatureAuraCore.js");
const { prepareEffectsMutation } = await import("../src/effectsMutations.js");
const { changedSceneItemMetadataKeys, classifySceneItemChanges } = await import("../src/sceneItemChangeDispatcherCore.js");

const META_KEY = `${ID}/meta`;
const STATE_KEY = `${ID}/state`;

function makeToken({
  id,
  name,
  attitude = "ally",
  x = 0,
  y = 0,
  conditions = [],
  classFeatureState = null,
  characterBuild = [],
}) {
  return {
    id,
    name,
    type: "IMAGE",
    layer: "CHARACTER",
    position: { x, y },
    metadata: {
      [META_KEY]: {
        attitude,
        ...(conditions.length ? { conditions: { instances: conditions } } : { conditions: { instances: [] } }),
        ...(classFeatureState ? { [CLASS_FEATURE_STATE_FIELD]: classFeatureState } : {}),
        initiativeCard: { characterBuild },
      },
    },
  };
}

test("CF-B01B Integration: SceneItemChangeDispatcher includes domain aura when classFeatureState changes", () => {
  const barbarianBefore = makeToken({
    id: "barbarian",
    name: "Barbaro",
    attitude: "pc",
    x: 0,
    y: 0,
  });

  const barbarianAfter = makeToken({
    id: "barbarian",
    name: "Barbaro",
    attitude: "pc",
    x: 0,
    y: 0,
    classFeatureState: {
      instances: [
        {
          instanceId: "tempest-protect-1",
          featureId: "barbaro-cammino-dell-araldo-della-tempesta-tempesta-protettrice",
          active: true,
        },
      ],
    },
  });

  const plan = classifySceneItemChanges([barbarianBefore], [barbarianAfter]);
  assert.ok(plan.domains.includes("aura"), "Dispatcher must include aura domain when classFeatureState changes");
});

test("CF-B01B Integration: Tempesta Protettrice propagates aura to selected allies via mutation without manual push", async () => {
  const rageFeature = CLASS_FEATURE_BY_ID.get("barbaro-ira");
  const stormAuraFeature = CLASS_FEATURE_BY_ID.get("barbaro-cammino-dell-araldo-della-tempesta-aura-tempestosa");
  const tempestProtectFeature = CLASS_FEATURE_BY_ID.get("barbaro-cammino-dell-araldo-della-tempesta-tempesta-protettrice");

  const build = [{ classId: "barbaro", level: 10, subclassId: "barbaro-cammino-dell-araldo-della-tempesta" }];

  // 1. Activate Rage
  const rageAct = planClassFeatureActivation({
    feature: rageFeature,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: build,
    sourceId: "barbarian",
    targetIds: ["barbarian"],
    instanceId: "rage-inst",
  });

  // 2. Activate Storm Aura (Desert)
  const stormAuraAct = planClassFeatureActivation({
    state: rageAct.state,
    feature: stormAuraFeature,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: build,
    sourceId: "barbarian",
    targetIds: ["barbarian"],
    instanceId: "storm-aura-inst",
    choiceId: "deserto",
  });

  // 3. Activate Tempesta Protettrice (targeting Ally 1)
  const tempestProtectAct = planClassFeatureActivation({
    state: stormAuraAct.state,
    feature: tempestProtectFeature,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: build,
    sourceId: "barbarian",
    targetIds: ["ally-1"],
    instanceId: "tempest-protect-inst",
  });
  assert.equal(tempestProtectAct.ok, true);

  // Setup scene: Barbarian at (0,0), Ally 1 at (50, 0) inside 3m aura (300px), Ally 2 at (50,0) inside (not selected), Enemy at (50,0) inside
  const barbarian = makeToken({
    id: "barbarian",
    name: "Barbaro",
    attitude: "pc",
    x: 0,
    y: 0,
    classFeatureState: tempestProtectAct.state,
    characterBuild: build,
  });
  const ally1 = makeToken({ id: "ally-1", name: "Alleato 1", attitude: "ally", x: 50, y: 0 });
  const ally2 = makeToken({ id: "ally-2", name: "Alleato 2", attitude: "ally", x: 50, y: 0 });
  const enemy = makeToken({ id: "enemy", name: "Nemico", attitude: "enemy", x: 50, y: 0 });

  currentSceneItems = [barbarian, ally1, ally2, enemy];

  // --- SCENARIO 1: ENTRY RECONCILE ---
  const auras = collectActiveClassFeatureAuras(currentSceneItems, {
    metaKey: META_KEY,
    featureById: CLASS_FEATURE_BY_ID,
    characterBuildBySourceId: new Map([["barbarian", build]]),
  });
  const protectAura = auras.find((a) => a.featureId === tempestProtectFeature.id);
  assert.ok(protectAura, "Tempesta Protettrice aura must be collected");
  assert.equal(protectAura.membershipMode, "selected");

  const candidates = currentSceneItems.map((item) => ({
    item,
    bounds: { min: item.position, max: { x: item.position.x + 150, y: item.position.y + 150 } },
  }));

  // Build 3m circle area (3m at 1.5m/cell with 150dpi = 2 cells = 300px radius)
  const { buildCircleArea } = await import("../src/aoeGeometryCore.js");
  const area = buildCircleArea({ x: 0, y: 0 }, { x: 300, y: 0 }, 150, { x: 0, y: 0 });

  const targetIds = classFeatureAuraTargetIds({
    aura: protectAura,
    area,
    candidates,
    metaKey: META_KEY,
  });
  assert.deepEqual(targetIds, ["ally-1"], "Only selected ally (Ally 1) inside aura should be targeted");

  const plan = classFeatureAuraMembershipPlan({
    aura: protectAura,
    desiredTargetIds: targetIds,
    items: currentSceneItems,
    metaKey: META_KEY,
  });
  assert.equal(plan.operations.length, 1);
  assert.equal(plan.operations[0].type, "condition:add");

  // Execute REAL Effects Mutation
  const mutation = await prepareEffectsMutation(plan.operations, { sceneItems: currentSceneItems });
  assert.ok(Array.isArray(mutation.changes));
  const ally1Change = mutation.changes.find((c) => c.id === "ally-1");
  assert.ok(ally1Change, "Ally 1 must receive condition change");
  assert.equal(ally1Change.after.conditions.length, 1);
  const createdCondition = ally1Change.after.conditions[0];
  assert.equal(createdCondition.condition, "Resistenza: Fuoco");
  assert.equal(createdCondition.effectKind, "buff");
  assert.equal(createdCondition.type, "class-feature-area");

  // Commit condition to ally1 in scene mock
  ally1.metadata[META_KEY].conditions.instances = ally1Change.after.conditions;

  // --- SCENARIO 2: EXIT RECONCILE ---
  // Move Ally 1 outside 3m aura to (500, 0)
  ally1.position = { x: 500, y: 0 };
  const candidatesOutside = currentSceneItems.map((item) => ({
    item,
    bounds: { min: item.position, max: { x: item.position.x + 150, y: item.position.y + 150 } },
  }));

  const outsideTargetIds = classFeatureAuraTargetIds({
    aura: protectAura,
    area,
    candidates: candidatesOutside,
    metaKey: META_KEY,
  });
  assert.deepEqual(outsideTargetIds, [], "No allies should be targeted when outside");

  const exitPlan = classFeatureAuraMembershipPlan({
    aura: protectAura,
    desiredTargetIds: outsideTargetIds,
    items: currentSceneItems,
    metaKey: META_KEY,
  });
  assert.equal(exitPlan.operations.length, 1);
  assert.equal(exitPlan.operations[0].type, "condition:remove-instances");

  const exitMutation = await prepareEffectsMutation(exitPlan.operations, { sceneItems: currentSceneItems });
  const ally1ExitChange = exitMutation.changes.find((c) => c.id === "ally-1");
  assert.ok(ally1ExitChange);
  assert.equal(ally1ExitChange.after.conditions.length, 0, "Condition must be removed upon exit");

  // Commit exit
  ally1.metadata[META_KEY].conditions.instances = [];

  // --- SCENARIO 3: RE-ENTRY RECONCILE ---
  // Move Ally 1 back inside to (50, 0)
  ally1.position = { x: 50, y: 0 };
  const reEntryCandidates = currentSceneItems.map((item) => ({
    item,
    bounds: { min: item.position, max: { x: item.position.x + 150, y: item.position.y + 150 } },
  }));

  const reEntryTargetIds = classFeatureAuraTargetIds({
    aura: protectAura,
    area,
    candidates: reEntryCandidates,
    metaKey: META_KEY,
  });
  assert.deepEqual(reEntryTargetIds, ["ally-1"]);

  const reEntryPlan = classFeatureAuraMembershipPlan({
    aura: protectAura,
    desiredTargetIds: reEntryTargetIds,
    items: currentSceneItems,
    metaKey: META_KEY,
  });
  assert.equal(reEntryPlan.operations.length, 1);

  const reEntryMutation = await prepareEffectsMutation(reEntryPlan.operations, { sceneItems: currentSceneItems });
  const ally1ReEntryChange = reEntryMutation.changes.find((c) => c.id === "ally-1");
  assert.ok(ally1ReEntryChange);
  assert.equal(ally1ReEntryChange.after.conditions.length, 1, "Condition must be re-added exactly once");

  // Commit re-entry
  ally1.metadata[META_KEY].conditions.instances = ally1ReEntryChange.after.conditions;

  // Repeated reconcile when already inside should produce 0 operations (no duplicates)
  const noopPlan = classFeatureAuraMembershipPlan({
    aura: protectAura,
    desiredTargetIds: ["ally-1"],
    items: currentSceneItems,
    metaKey: META_KEY,
  });
  assert.equal(noopPlan.operations.length, 0, "No duplicate operations when already inside");

  // --- SCENARIO 4: PARENT END (Storm Aura Ends) ---
  // Deactivate Storm Aura -> Tempesta Protettrice also becomes inactive because untilFeatureId === "storm-aura"
  const inactiveState = {
    ...barbarian.metadata[META_KEY].classFeatureState,
    instances: [], // both auras ended
  };
  barbarian.metadata[META_KEY].classFeatureState = inactiveState;

  const aurasAfterEnd = collectActiveClassFeatureAuras(currentSceneItems, {
    metaKey: META_KEY,
    featureById: CLASS_FEATURE_BY_ID,
  });
  assert.equal(aurasAfterEnd.length, 0, "No active auras after parent end");

  const staleRemovals = staleClassFeatureAuraEffectRemovals(currentSceneItems, {
    activeInstanceIds: [],
    metaKey: META_KEY,
  });
  assert.equal(staleRemovals.length, 1);
  assert.equal(staleRemovals[0].itemId, "ally-1");

  const cleanupMutation = await prepareEffectsMutation(
    [{ type: "condition:remove-instances", removals: staleRemovals }],
    { sceneItems: currentSceneItems },
  );
  const ally1CleanupChange = cleanupMutation.changes.find((c) => c.id === "ally-1");
  assert.ok(ally1CleanupChange);
  assert.equal(ally1CleanupChange.after.conditions.length, 0, "Stale aura condition cleaned up");
});

test("CF-B01B Integration: Selection change updates aura targets (Ally 1 removed, Ally 2 added)", async () => {
  const rageFeature = CLASS_FEATURE_BY_ID.get("barbaro-ira");
  const stormAuraFeature = CLASS_FEATURE_BY_ID.get("barbaro-cammino-dell-araldo-della-tempesta-aura-tempestosa");
  const tempestProtectFeature = CLASS_FEATURE_BY_ID.get("barbaro-cammino-dell-araldo-della-tempesta-tempesta-protettrice");
  const build = [{ classId: "barbaro", level: 10, subclassId: "barbaro-cammino-dell-araldo-della-tempesta" }];

  const rageAct = planClassFeatureActivation({
    feature: rageFeature,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: build,
    sourceId: "barbarian",
    targetIds: ["barbarian"],
    instanceId: "rage-inst-sel",
  });

  const stormAuraAct = planClassFeatureActivation({
    state: rageAct.state,
    feature: stormAuraFeature,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: build,
    sourceId: "barbarian",
    targetIds: ["barbarian"],
    instanceId: "storm-aura-inst",
    choiceId: "deserto",
  });

  const initialAct = planClassFeatureActivation({
    state: stormAuraAct.state,
    feature: tempestProtectFeature,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: build,
    sourceId: "barbarian",
    targetIds: ["ally-1"],
    instanceId: "tempest-protect-sel",
  });

  const barbarian = makeToken({
    id: "barbarian",
    name: "Barbaro",
    attitude: "pc",
    x: 0,
    y: 0,
    classFeatureState: initialAct.state,
    characterBuild: build,
  });
  const ally1 = makeToken({
    id: "ally-1",
    name: "Alleato 1",
    attitude: "ally",
    x: 50,
    y: 0,
    conditions: [
      {
        id: "cond-ally-1",
        condition: "Resistenza: Anima Tempestosa",
        active: true,
        type: "class-feature-area",
        parentEffectId: "tempest-protect-sel",
        effectId: "barbaro-cammino-dell-araldo-della-tempesta-tempesta-protettrice:area",
        effectKind: "buff",
      },
    ],
  });
  const ally2 = makeToken({ id: "ally-2", name: "Alleato 2", attitude: "ally", x: 50, y: 0 });

  currentSceneItems = [barbarian, ally1, ally2];

  // Update activation with new selection: targetIds: ["ally-2"]
  const updatedAct = planClassFeatureActivation({
    state: stormAuraAct.state,
    feature: tempestProtectFeature,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: build,
    sourceId: "barbarian",
    targetIds: ["ally-2"],
    instanceId: "tempest-protect-sel",
  });
  barbarian.metadata[META_KEY].classFeatureState = updatedAct.state;

  const auras = collectActiveClassFeatureAuras(currentSceneItems, {
    metaKey: META_KEY,
    featureById: CLASS_FEATURE_BY_ID,
    characterBuildBySourceId: new Map([["barbarian", build]]),
  });
  const aura = auras.find((a) => a.featureId === tempestProtectFeature.id);
  assert.ok(aura);

  const { buildCircleArea } = await import("../src/aoeGeometryCore.js");
  const area = buildCircleArea({ x: 0, y: 0 }, { x: 300, y: 0 }, 150, { x: 0, y: 0 });
  const candidates = currentSceneItems.map((item) => ({
    item,
    bounds: { min: item.position, max: { x: item.position.x + 150, y: item.position.y + 150 } },
  }));

  const targetIds = classFeatureAuraTargetIds({
    aura,
    area,
    candidates,
    metaKey: META_KEY,
  });
  assert.deepEqual(targetIds, ["ally-2"], "New targetIds must include Ally 2 and exclude Ally 1");

  const plan = classFeatureAuraMembershipPlan({
    aura,
    desiredTargetIds: targetIds,
    items: currentSceneItems,
    metaKey: META_KEY,
  });

  assert.deepEqual(plan.entering, ["ally-2"]);
  assert.deepEqual(plan.leaving, ["ally-1"]);

  const mutation = await prepareEffectsMutation(plan.operations, { sceneItems: currentSceneItems });
  const ally1Change = mutation.changes.find((c) => c.id === "ally-1");
  const ally2Change = mutation.changes.find((c) => c.id === "ally-2");

  assert.ok(ally1Change, "Ally 1 must have condition removed");
  assert.equal(ally1Change.after.conditions.length, 0);

  assert.ok(ally2Change, "Ally 2 must have condition added");
  assert.equal(ally2Change.after.conditions.length, 1);
  assert.equal(ally2Change.after.conditions[0].condition, "Resistenza: Fuoco");
});

test("CF-B01C: Tempesta Protettrice specializes resistance for Mare (Fulmine) and Tundra (Freddo)", async () => {
  const rageFeature = CLASS_FEATURE_BY_ID.get("barbaro-ira");
  const stormAuraFeature = CLASS_FEATURE_BY_ID.get("barbaro-cammino-dell-araldo-della-tempesta-aura-tempestosa");
  const tempestProtectFeature = CLASS_FEATURE_BY_ID.get("barbaro-cammino-dell-araldo-della-tempesta-tempesta-protettrice");
  const build = [{ classId: "barbaro", level: 10, subclassId: "barbaro-cammino-dell-araldo-della-tempesta" }];

  const rageAct = planClassFeatureActivation({
    feature: rageFeature,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: build,
    sourceId: "barbarian",
    targetIds: ["barbarian"],
    instanceId: "rage-inst",
  });

  // 1. MARE -> Resistenza: Fulmine
  const seaAuraAct = planClassFeatureActivation({
    state: rageAct.state,
    feature: stormAuraFeature,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: build,
    sourceId: "barbarian",
    targetIds: ["barbarian"],
    instanceId: "storm-sea-inst",
    choiceId: "mare",
  });

  const seaProtectAct = planClassFeatureActivation({
    state: seaAuraAct.state,
    feature: tempestProtectFeature,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: build,
    sourceId: "barbarian",
    targetIds: ["ally-1"],
    instanceId: "protect-sea-inst",
  });
  assert.equal(seaProtectAct.ok, true);

  const barbarianSea = makeToken({
    id: "barbarian",
    name: "Barbaro",
    attitude: "pc",
    x: 0,
    y: 0,
    classFeatureState: seaProtectAct.state,
    characterBuild: build,
  });
  const allySea = makeToken({ id: "ally-1", name: "Alleato 1", attitude: "ally", x: 50, y: 0 });
  const seaItems = [barbarianSea, allySea];
  currentSceneItems = seaItems;

  const seaAuras = collectActiveClassFeatureAuras(seaItems, {
    metaKey: META_KEY,
    featureById: CLASS_FEATURE_BY_ID,
    characterBuildBySourceId: new Map([["barbarian", build]]),
  });
  const seaAura = seaAuras.find((a) => a.featureId === tempestProtectFeature.id);
  assert.ok(seaAura);
  assert.equal(seaAura.targetEffects[0].label, "Resistenza: Fulmine");

  const { buildCircleArea } = await import("../src/aoeGeometryCore.js");
  const area = buildCircleArea({ x: 0, y: 0 }, { x: 300, y: 0 }, 150, { x: 0, y: 0 });
  const seaCandidates = seaItems.map((item) => ({
    item,
    bounds: { min: item.position, max: { x: item.position.x + 150, y: item.position.y + 150 } },
  }));
  const seaTargetIds = classFeatureAuraTargetIds({ aura: seaAura, area, candidates: seaCandidates, metaKey: META_KEY });
  const seaPlan = classFeatureAuraMembershipPlan({ aura: seaAura, desiredTargetIds: seaTargetIds, items: seaItems, metaKey: META_KEY });
  const seaMutation = await prepareEffectsMutation(seaPlan.operations, { sceneItems: seaItems });
  const allySeaChange = seaMutation.changes.find((c) => c.id === "ally-1");
  assert.ok(allySeaChange);
  assert.equal(allySeaChange.after.conditions[0].condition, "Resistenza: Fulmine");

  // 2. TUNDRA -> Resistenza: Freddo
  const tundraAuraAct = planClassFeatureActivation({
    state: rageAct.state,
    feature: stormAuraFeature,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: build,
    sourceId: "barbarian",
    targetIds: ["barbarian"],
    instanceId: "storm-tundra-inst",
    choiceId: "tundra",
  });

  const tundraProtectAct = planClassFeatureActivation({
    state: tundraAuraAct.state,
    feature: tempestProtectFeature,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: build,
    sourceId: "barbarian",
    targetIds: ["ally-1"],
    instanceId: "protect-tundra-inst",
  });
  assert.equal(tundraProtectAct.ok, true);

  const barbarianTundra = makeToken({
    id: "barbarian",
    name: "Barbaro",
    attitude: "pc",
    x: 0,
    y: 0,
    classFeatureState: tundraProtectAct.state,
    characterBuild: build,
  });
  const allyTundra = makeToken({ id: "ally-1", name: "Alleato 1", attitude: "ally", x: 50, y: 0 });
  const tundraItems = [barbarianTundra, allyTundra];
  currentSceneItems = tundraItems;

  const tundraAuras = collectActiveClassFeatureAuras(tundraItems, {
    metaKey: META_KEY,
    featureById: CLASS_FEATURE_BY_ID,
    characterBuildBySourceId: new Map([["barbarian", build]]),
  });
  const tundraAura = tundraAuras.find((a) => a.featureId === tempestProtectFeature.id);
  assert.ok(tundraAura);
  assert.equal(tundraAura.targetEffects[0].label, "Resistenza: Freddo");

  const tundraCandidates = tundraItems.map((item) => ({
    item,
    bounds: { min: item.position, max: { x: item.position.x + 150, y: item.position.y + 150 } },
  }));
  const tundraTargetIds = classFeatureAuraTargetIds({ aura: tundraAura, area, candidates: tundraCandidates, metaKey: META_KEY });
  const tundraPlan = classFeatureAuraMembershipPlan({ aura: tundraAura, desiredTargetIds: tundraTargetIds, items: tundraItems, metaKey: META_KEY });
  const tundraMutation = await prepareEffectsMutation(tundraPlan.operations, { sceneItems: tundraItems });
  const allyTundraChange = tundraMutation.changes.find((c) => c.id === "ally-1");
  assert.ok(allyTundraChange);
  assert.equal(allyTundraChange.after.conditions[0].condition, "Resistenza: Freddo");
});

test("CF-B01C: Variant change from Deserto to Mare replaces Resistenza: Fuoco with Resistenza: Fulmine without duplicates", async () => {
  const tempestProtectFeature = CLASS_FEATURE_BY_ID.get("barbaro-cammino-dell-araldo-della-tempesta-tempesta-protettrice");
  const build = [{ classId: "barbaro", level: 10, subclassId: "barbaro-cammino-dell-araldo-della-tempesta" }];

  const allyWithFire = makeToken({
    id: "ally-1",
    name: "Alleato 1",
    attitude: "ally",
    x: 50,
    y: 0,
    conditions: [
      {
        id: "cond-protect-fire",
        condition: "Resistenza: Fuoco",
        active: true,
        type: "class-feature-area",
        parentEffectId: "protect-inst",
        effectId: "barbaro-cammino-dell-araldo-della-tempesta-tempesta-protettrice:area",
        effectKind: "buff",
      },
    ],
  });

  const barbarianSea = makeToken({
    id: "barbarian",
    name: "Barbaro",
    attitude: "pc",
    x: 0,
    y: 0,
    classFeatureState: {
      instances: [
        {
          instanceId: "storm-aura-inst",
          featureId: "barbaro-cammino-dell-araldo-della-tempesta-aura-tempestosa",
          choiceId: "mare",
          active: true,
        },
        {
          instanceId: "protect-inst",
          featureId: "barbaro-cammino-dell-araldo-della-tempesta-tempesta-protettrice",
          parentInstanceId: "storm-aura-inst",
          choiceId: "mare",
          targetIds: ["ally-1"],
          active: true,
        },
      ],
    },
    characterBuild: build,
  });

  const sceneItems = [barbarianSea, allyWithFire];
  currentSceneItems = sceneItems;

  const auras = collectActiveClassFeatureAuras(sceneItems, {
    metaKey: META_KEY,
    featureById: CLASS_FEATURE_BY_ID,
    characterBuildBySourceId: new Map([["barbarian", build]]),
  });
  const aura = auras.find((a) => a.featureId === tempestProtectFeature.id);
  assert.ok(aura);
  assert.equal(aura.targetEffects[0].label, "Resistenza: Fulmine");

  const { buildCircleArea } = await import("../src/aoeGeometryCore.js");
  const area = buildCircleArea({ x: 0, y: 0 }, { x: 300, y: 0 }, 150, { x: 0, y: 0 });
  const candidates = sceneItems.map((item) => ({
    item,
    bounds: { min: item.position, max: { x: item.position.x + 150, y: item.position.y + 150 } },
  }));
  const targetIds = classFeatureAuraTargetIds({ aura, area, candidates, metaKey: META_KEY });

  const plan = classFeatureAuraMembershipPlan({ aura, desiredTargetIds: targetIds, items: sceneItems, metaKey: META_KEY });
  assert.equal(plan.operations.length, 2, "Must produce removal of old condition and addition of new condition");

  const mutation = await prepareEffectsMutation(plan.operations, { sceneItems });
  const allyChange = mutation.changes.find((c) => c.id === "ally-1");
  assert.ok(allyChange);
  assert.equal(allyChange.after.conditions.length, 1);
  assert.equal(allyChange.after.conditions[0].condition, "Resistenza: Fulmine");
});
