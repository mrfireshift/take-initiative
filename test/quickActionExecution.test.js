import assert from "node:assert/strict";
import test, { mock } from "node:test";

const META_KEY = "com.thebigpicture.initiative/meta";
const sceneItems = new Map();
const areaCalls = [];

const clone = (value) => value === undefined ? undefined : structuredClone(value);

const sdk = {
  player: {
    getSelection: async () => [],
  },
  scene: {
    items: {
      getItems: async (ids) => {
        if (!Array.isArray(ids)) return [...sceneItems.values()].map(clone);
        return ids.map((id) => sceneItems.get(id)).filter(Boolean).map(clone);
      },
    },
  },
};

mock.module("@owlbear-rodeo/sdk", {
  exports: { default: sdk },
});

mock.module("../src/conditionApplicationExecutor.js", {
  exports: {
    executeConditionApplication: async () => [],
  },
});

mock.module("../src/spellApplicationExecutor.js", {
  exports: {
    executeSpellApplication: async () => ({ status: "applied", changedIds: [] }),
    getCurrentSpellAppliedAt: async () => ({
      round: 1,
      actorId: "caster",
      phase: "turn",
      turnKey: "1:caster",
    }),
  },
});

mock.module("../src/spellUnifiedPanelSceneProvider.js", {
  exports: {
    getSpellAreaSpatialValidation: async () => ({}),
    validateSpellAreaSceneSpatial: async () => ({ valid: true, errors: [] }),
  },
});

mock.module("../src/spellUnifiedAreaAdapter.js", {
  exports: {
    getSpellUnifiedAreaEligibility: () => ({ eligible: true, code: null, message: "" }),
    executeSpellUnifiedArea: async (input) => {
      areaCalls.push(input);
      return {
        status: "applied",
        changedIds: input.session.targetIds,
        historyEntryId: "hold-monster-history",
        undoAvailable: true,
        targetIds: input.session.targetIds,
      };
    },
  },
});

const { executeDirectQuickAction } = await import(
  "../src/quickActionExecution.js?quick-action-initial-save"
);

function resetScene() {
  sceneItems.clear();
  areaCalls.length = 0;
  sceneItems.set("caster", {
    id: "caster",
    name: "Mago",
    layer: "CHARACTER",
    metadata: { [META_KEY]: { inInitiative: true } },
  });
  sceneItems.set("target-a", {
    id: "target-a",
    name: "Bersaglio A",
    layer: "CHARACTER",
    metadata: { [META_KEY]: { inInitiative: true } },
  });
  sceneItems.set("target-b", {
    id: "target-b",
    name: "Bersaglio B",
    layer: "CHARACTER",
    metadata: { [META_KEY]: { inInitiative: true } },
  });
}

function action(slotLevel) {
  return {
    id: "quick-hold-monster",
    label: "Blocca Mostri",
    kind: "spell",
    spellId: "hold-monster",
    targetMode: "selection",
    slotLevel,
    launchMode: "auto",
  };
}

test("Quick Action Hold Monster esegue direttamente il ramo failed e conserva History/Undo", async () => {
  resetScene();
  const result = await executeDirectQuickAction({
    action: action(5),
    sourceItem: sceneItems.get("caster"),
    selectedTargetIds: ["target-a"],
  });

  assert.equal(result.mode, "executed");
  assert.equal(result.areaExecution, true);
  assert.equal(result.route, undefined);
  assert.equal(areaCalls.length, 1);
  assert.deepEqual(areaCalls[0].session.outcomes, { "target-a": "failed" });
  assert.equal(result.areaResult.historyEntryId, "hold-monster-history");
  assert.equal(result.areaResult.undoAvailable, true);
});

test("Quick Action multi-target non chiede outcome separati", async () => {
  resetScene();
  const result = await executeDirectQuickAction({
    action: action(6),
    sourceItem: sceneItems.get("caster"),
    selectedTargetIds: ["target-a", "target-b"],
  });

  assert.equal(result.mode, "executed");
  assert.deepEqual(areaCalls[0].session.targetIds, ["target-a", "target-b"]);
  assert.deepEqual(areaCalls[0].session.outcomes, {
    "target-a": "failed",
    "target-b": "failed",
  });
});

test("una Quick Action con input numerico non inventa il danno e mantiene il fallback", async () => {
  resetScene();
  const result = await executeDirectQuickAction({
    action: {
      id: "quick-mind-whip",
      label: "Aculeo Mentale",
      kind: "spell",
      spellId: "legacy-tashas-mind-whip",
      targetMode: "selection",
      launchMode: "auto",
    },
    sourceItem: sceneItems.get("caster"),
    selectedTargetIds: ["target-a"],
  });

  assert.equal(result.mode, "review");
  assert.equal(result.route.destination, "spell-unified-panel");
  assert.equal(areaCalls.length, 0);
});

test("un attacco non viene mai eseguito direttamente: va risolto nella sua console", async () => {
  resetScene();
  const result = await executeDirectQuickAction({
    action: { id: "sword", label: "Spada", kind: "attack", components: [{ type: "slashing" }] },
    sourceItem: sceneItems.get("caster"),
    selectedTargetIds: ["target-a"],
  });
  assert.deepEqual(result, { mode: "review", kind: "attack", reason: "attack-requires-resolution" });
  assert.equal(areaCalls.length, 0);
});

function withBuild(characterBuild, resources = null) {
  const caster = sceneItems.get("caster");
  caster.metadata[META_KEY].initiativeCard = { characterBuild };
  if (resources) caster.metadata[META_KEY].classFeatureState = { version: 1, resources, instances: [] };
}

test("a caster with slots spends one in the spell's own command", async () => {
  resetScene();
  withBuild([{ classId: "mago", level: 9 }]);
  const result = await executeDirectQuickAction({
    action: action(5),
    sourceItem: sceneItems.get("caster"),
    selectedTargetIds: ["target-a"],
  });
  assert.equal(result.mode, "executed");
  assert.equal(result.spellCost, "slot di 5° livello");
  const [operation] = areaCalls[0].runtime.extraOperations;
  assert.equal(operation.type, "class-feature:adjust-resource");
  assert.equal(operation.sourceId, "caster");
  assert.equal(operation.pool.id, "spell-slot-5");
});

test("with no slot left the GM confirms the cast without a slot, or cancels it", async () => {
  resetScene();
  withBuild([{ classId: "mago", level: 9 }], { "spell-slot-5": { current: 0, maximum: 1 } });
  const asked = [];
  const cancelled = await executeDirectQuickAction({
    action: action(5),
    sourceItem: sceneItems.get("caster"),
    selectedTargetIds: ["target-a"],
    confirmSpellSlot: (message) => { asked.push(message); return false; },
  });
  assert.equal(cancelled.mode, "cancelled");
  assert.equal(cancelled.reason, "spell-slot-cancelled");
  assert.equal(areaCalls.length, 0);
  assert.match(asked[0], /Nessuno slot di 5° livello disponibile/);

  const confirmed = await executeDirectQuickAction({
    action: action(5),
    sourceItem: sceneItems.get("caster"),
    selectedTargetIds: ["target-a"],
    confirmSpellSlot: () => true,
  });
  assert.equal(confirmed.mode, "executed");
  assert.equal(confirmed.spellCost, "");
  assert.deepEqual(areaCalls[0].runtime.extraOperations, []);
});

test("a warlock spends a Pact Magic slot and casts at its level", async () => {
  resetScene();
  withBuild([{ classId: "warlock", level: 9 }]);
  const result = await executeDirectQuickAction({
    action: action(null),
    sourceItem: sceneItems.get("caster"),
    selectedTargetIds: ["target-a"],
  });
  assert.equal(result.mode, "executed");
  assert.equal(result.spellCost, "slot del Patto (5°)");
  assert.equal(areaCalls[0].runtime.extraOperations[0].pool.id, "spell-slot-pact");
  assert.equal(areaCalls[0].session.slotLevel, 5);
});

test("a spell quick action with uses of its own spends one, and a free one spends nothing", async () => {
  resetScene();
  withBuild([{ classId: "mago", level: 9 }]);
  const withUses = { ...action(5), cost: "uses", uses: 1 };
  const used = await executeDirectQuickAction({ action: withUses, sourceItem: sceneItems.get("caster"), selectedTargetIds: ["target-a"] });
  assert.equal(used.spellCost, "uso di Blocca Mostri (0/1)");
  assert.equal(areaCalls[0].runtime.extraOperations[0].pool.id, "quick-action-uses:quick-hold-monster");
  const free = await executeDirectQuickAction({ action: { ...action(5), cost: "free" }, sourceItem: sceneItems.get("caster"), selectedTargetIds: ["target-a"] });
  assert.equal(free.spellCost, "");
  assert.deepEqual(areaCalls[1].runtime.extraOperations, []);
});
