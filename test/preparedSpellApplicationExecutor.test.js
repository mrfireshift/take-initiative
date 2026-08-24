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

const sdk = {
  onReady() {},
  room: { id: "prepared-runtime-room", getMetadata: async () => ({}) },
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
      updateItems: async () => {},
      deleteItems: async () => {},
      addItems: async () => {},
    },
    grid: { getScale: async () => ({ parsed: { multiplier: 1.5, unit: "m" } }) },
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
        historyEntryId: "history-prepared-1",
        undoAvailable: true,
      };
    },
    requireAppliedEffectsMutation: (result) => result,
    tickRoundEffects: async () => ({ status: "applied", changedIds: [] }),
  },
});

const { getSpellDefinition } = await import("../src/spells-srd.js");
const { getSpellCastPhasePlan } = await import("../src/spellCastPhaseCore.js");
const { executeSpellApplication } = await import(
  "../src/spellApplicationExecutor.js?prepared-runtime",
);

function token(id, name, meta) {
  return {
    id,
    name,
    metadata: { [META_KEY]: { hp: 50, hpMax: 50, ...meta } },
  };
}

function resetScene() {
  mutationCalls.length = 0;
  items.clear();
  items.set("caster", token("caster", "Ranger", {
    [SPELLS_KEY]: [{
      spellId: "phb2014-punizione-tonante",
      instanceId: "thunderous-instance",
      castContext: { phase: "prepare", slotLevel: 1 },
    }],
    [CONCENTRATION_KEY]: {
      "Punizione Tonante": {
        spellId: "phb2014-punizione-tonante",
        instanceId: "thunderous-instance",
        targets: ["caster"],
      },
    },
  }));
  items.set("target", token("target", "Goblin", {}));
}

function request(overrides = {}) {
  const spell = getSpellDefinition("Punizione Tonante");
  const castContext = { phase: "resolve", slotLevel: 1 };
  return {
    spell,
    enteredName: spell.displayName,
    turns: 9,
    casterId: "caster",
    targetIds: ["target"],
    castContext,
    phasePlan: getSpellCastPhasePlan(spell, "resolve", castContext),
    activeConcentration: { instanceId: "thunderous-instance", targets: ["caster"] },
    requestedConcentration: true,
    manualAttackOutcomeRequired: true,
    attackOutcome: "hit",
    saveOutcome: "passed",
    damageValue: 7,
    appliedAt: { round: 1, actorId: "caster", phase: "turn", turnKey: "1:caster" },
    casterName: "Ranger",
    ...overrides,
  };
}

test("prepared resolve usa HP/History canonici e dismiss scoped", async () => {
  resetScene();
  const result = await executeSpellApplication(request());

  assert.equal(result.historyEntryId, "history-prepared-1");
  assert.equal(mutationCalls.length, 1);
  const [{ operations, options }] = mutationCalls;
  assert.deepEqual(operations[0], {
    type: "concentration:break",
    casterIds: ["caster"],
    reference: "thunderous-instance",
  });
  assert.equal(options.metadataPatches[0].id, "target");
  assert.equal(options.metadataPatches[0].fields.hp.value, 43);
  assert.equal(options.history.payload.causality.action.attackOutcome, "hit");
  assert.equal(options.history.payload.causality.action.damageRoll, 7);
  assert.equal(options.history.payload.causality.targets[0].requestedDamage, 7);
});

test("miss prepared non consuma e stale resolve non duplica mutation", async () => {
  resetScene();
  const missed = await executeSpellApplication(request({
    attackOutcome: "miss",
    saveOutcome: undefined,
    damageValue: undefined,
  }));
  assert.equal(missed.status, "miss");
  assert.equal(missed.pending, true);
  assert.equal(mutationCalls.length, 0);

  items.get("caster").metadata[META_KEY][SPELLS_KEY] = [];
  const stale = await executeSpellApplication(request());
  assert.equal(stale.status, "stale");
  assert.equal(stale.stale, true);
  assert.equal(mutationCalls.length, 0);
});
