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
