import test, { mock } from "node:test";
import assert from "node:assert/strict";

const META_KEY = "com.thebigpicture.initiative/meta";
const SPELLS_KEY = "com.thebigpicture.initiative/spells";
const CONCENTRATION_KEY = "com.thebigpicture.initiative/concentration";
const STATE_KEY = "com.thebigpicture.initiative/state";

const items = new Map();
const mutationCalls = [];

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

const boundsById = new Map();
const sdk = {
  onReady() {},
  room: { id: "active-resolution-runtime-room", getMetadata: async () => ({}) },
  player: { getRole: async () => "GM" },
  scene: {
    getMetadata: async () => ({
      [STATE_KEY]: { round: 1, current: 0, order: ["caster", "target"] },
    }),
    items: {
      getItems: async (ids) => {
        const selected = Array.isArray(ids)
          ? ids.map((id) => items.get(id)).filter(Boolean)
          : [...items.values()];
        return selected.map(clone);
      },
      getItemBounds: async (ids) => {
        const id = Array.isArray(ids) ? ids[0] : ids;
        return clone(boundsById.get(id)) || null;
      },
      updateItems: async () => {},
      deleteItems: async () => {},
      addItems: async () => {},
    },
    grid: {
      getDpi: async () => 100,
      getScale: async () => ({ parsed: { multiplier: 1.5, unit: "m" } }),
      snapPosition: async (position) => position,
    },
  },
  broadcast: {
    onMessage: () => () => {},
    sendMessage: async () => {},
  },
};

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: sdk,
    buildLabel: () => ({ build: () => ({ id: "label" }) }),
    buildImage: () => ({ build: () => ({ id: "image" }) }),
    buildText: () => ({ build: () => ({ id: "text" }) }),
    buildShape: () => ({ build: () => ({ id: "shape" }) }),
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
                              name: () => ({ build: () => ({ id: "path" }) }),
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

mock.module("../src/effectsMutations.js", {
  exports: {
    runEffectsMutation: async (operations, options) => {
      mutationCalls.push({ operations, options });
      return {
        status: "applied",
        committed: true,
        changedIds: ["caster", "target"],
        historyEntryId: "history-vitality-1",
        undoAvailable: true,
      };
    },
    requireAppliedEffectsMutation: (result) => result,
    tickRoundEffects: async () => ({ status: "applied", changedIds: [] }),
  },
});

const { getSpellDefinition } = await import("../src/spells-srd.js");
const {
  buildSpellActiveResolutionPayload,
} = await import("../src/spellActiveResolutionCore.js");
const {
  executeSpellActiveResolution,
} = await import("../src/spellApplicationExecutor.js?active-resolution-runtime");

function token(id, name, meta) {
  return {
    id,
    name,
    metadata: { [META_KEY]: { hp: 50, hpMax: 50, ...meta } },
  };
}

function resetScene({ targetX = 100 } = {}) {
  mutationCalls.length = 0;
  items.clear();
  boundsById.clear();
  items.set("caster", token("caster", "Caster", {
    hp: 45,
    hpMax: 50,
    [SPELLS_KEY]: [{
      spellId: "phb2014-aura-di-vitalita",
      instanceId: "vitality-instance",
      casterId: "caster",
      name: "Aura di Vitalità",
      conc: true,
    }],
    [CONCENTRATION_KEY]: {
      "vitality-instance": {
        spellId: "phb2014-aura-di-vitalita",
        instanceId: "vitality-instance",
      },
    },
  }));
  items.set("target", token("target", "Target", { hp: 6, hpMax: 20, attitude: "ally" }));
  boundsById.set("caster", {
    min: { x: 0, y: 0 },
    max: { x: 100, y: 100 },
    center: { x: 50, y: 50 },
  });
  boundsById.set("target", {
    min: { x: targetX, y: 0 },
    max: { x: targetX + 100, y: 100 },
    center: { x: targetX + 50, y: 50 },
  });
}

function payload() {
  const spell = getSpellDefinition("Aura di Vitalità");
  return buildSpellActiveResolutionPayload({
    spell,
    action: spell.activeActions[0],
    group: {
      instanceId: "vitality-instance",
      casterId: "caster",
      casterName: "Caster",
      castContext: { mobileAura: true, slotLevel: 4 },
    },
    sceneEpoch: 7,
  });
}

test("single-heal applica una sola mutazione HP, mantiene spell/concentrazione e resta Undoabile", async () => {
  resetScene();
  const result = await executeSpellActiveResolution({
    payload: payload(),
    targetIds: ["target"],
    damageRoll: 9,
    sceneEpoch: 7,
    isCurrent: () => true,
  });

  assert.equal(result.historyEntryId, "history-vitality-1");
  assert.equal(result.undoAvailable, true);
  assert.equal(mutationCalls.length, 1);
  const [{ operations, options }] = mutationCalls;
  assert.deepEqual(operations, []);
  assert.equal(options.metadataPatches.length, 1);
  assert.equal(options.metadataPatches[0].id, "target");
  assert.equal(options.metadataPatches[0].fields.hp.value, 15);
  assert.equal(options.metadataPatches[0].fields.hpMax.value, 20);
  assert.equal(options.history.payload.healingRoll, 9);
  assert.equal(options.history.payload.causality.targets[0].appliedHpDelta, 9);
  assert.equal(options.history.payload.causality.concentrationAction, undefined);
});

test("single-heal rifiuta il bersaglio fuori dall'aura mobile prima della mutazione", async () => {
  resetScene({ targetX: 1000 });

  await assert.rejects(
    executeSpellActiveResolution({
      payload: payload(),
      targetIds: ["target"],
      damageRoll: 9,
      sceneEpoch: 7,
      isCurrent: () => true,
    }),
    /target-outside-aura/,
  );
  assert.equal(mutationCalls.length, 0);
});

test("single-heal rifiuta un parent stale senza consumare lo spell", async () => {
  resetScene();
  items.get("caster").metadata[META_KEY][SPELLS_KEY] = [];
  items.get("caster").metadata[META_KEY][CONCENTRATION_KEY] = {};

  await assert.rejects(
    executeSpellActiveResolution({
      payload: payload(),
      targetIds: ["target"],
      damageRoll: 9,
      sceneEpoch: 7,
      isCurrent: () => true,
    }),
    /spell-instance-missing/,
  );
  assert.equal(mutationCalls.length, 0);
});

test("single-heal consente il caster come bersaglio valido", async () => {
  resetScene();
  const result = await executeSpellActiveResolution({
    payload: payload(),
    targetIds: ["caster"],
    damageRoll: 4,
    sceneEpoch: 7,
    isCurrent: () => true,
  });

  assert.equal(result.historyEntryId, "history-vitality-1");
  assert.equal(mutationCalls.length, 1);
  assert.equal(mutationCalls[0].options.metadataPatches[0].id, "caster");
  assert.equal(mutationCalls[0].options.metadataPatches[0].fields.hp.value, 49);
});
