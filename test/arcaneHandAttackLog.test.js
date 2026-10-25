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

const logged = [];
mock.module("../src/effectsMutations.js", {
  exports: {
    runEffectsMutation: async (operations, options) => {
      mutationCalls.push({ operations, options });
      // A miss: the HP patch confirms the same value, so the coordinator keeps no History entry.
      const miss = options?.history?.payload?.attackOutcome === "miss";
      return miss
        ? { status: "applied", committed: true, changedIds: [], historyEntryId: null, undoAvailable: false }
        : { status: "applied", committed: true, changedIds: ["ogre"], historyEntryId: "history-fist-1", undoAvailable: true };
    },
    requireAppliedEffectsMutation: (result) => result,
    tickRoundEffects: async () => ({ status: "applied", changedIds: [] }),
  },
});
mock.module("../src/spellCastRecord.js", {
  exports: {
    executeSpellCastRecord: async () => [],
    recordInCombatLog: async (entry) => { logged.push(entry); return []; },
  },
});

const { getSpellDefinition } = await import("../src/spells-srd.js");
const { buildSpellActiveResolutionPayload } = await import("../src/spellActiveResolutionCore.js");
const { executeSpellActiveResolution } = await import("../src/spellApplicationExecutor.js?arcane-hand-attack-log");

const BOARD_KEY = "com.thebigpicture.initiative/spellBoardToken";
function scene() {
  mutationCalls.length = 0;
  logged.length = 0;
  items.clear();
  boundsById.clear();
  const parent = { spellId: "arcane-hand", instanceId: "hand-1", casterId: "caster", name: "Mano arcana", conc: true, turns: 10, castContext: { slotLevel: 5, boardToken: true } };
  items.set("caster", { id: "caster", name: "Alane", metadata: { [META_KEY]: { hp: 30, hpMax: 30, [SPELLS_KEY]: [parent],
    [CONCENTRATION_KEY]: { "mano arcana": { ...parent, targets: ["caster"] } } } } });
  items.set("hand", { id: "hand", name: "Mano arcana (Alane)", layer: "PROP", position: { x: 0, y: 0 },
    metadata: { [META_KEY]: { hp: 30, hpMax: 30 }, [BOARD_KEY]: { kind: "spell-board-token", spellId: "arcane-hand", instanceId: "hand-1", casterId: "caster" } } });
  items.set("ogre", { id: "ogre", name: "Ogre", layer: "CHARACTER", position: { x: 200, y: 0 }, metadata: { [META_KEY]: { hp: 59, hpMax: 59, inInitiative: true } } });
  boundsById.set("hand", { min: { x: 0, y: 0 }, max: { x: 200, y: 200 }, center: { x: 100, y: 100 }, width: 200, height: 200 });
  boundsById.set("ogre", { min: { x: 200, y: 0 }, max: { x: 300, y: 100 }, center: { x: 250, y: 50 }, width: 100, height: 100 });
  const spell = getSpellDefinition("arcane-hand");
  return {
    ...buildSpellActiveResolutionPayload({
      spell,
      action: spell.activeActions.find((entry) => entry.id === "arcane-hand-clenched"),
      group: { ...parent, casterName: "Alane" },
      sceneEpoch: 7,
    }),
    zoneItemId: "hand",
  };
}

test("Pugno serrato a segno: la voce nomina bersaglio ed esito, come la console dei PG", async () => {
  const payload = scene();
  await executeSpellActiveResolution({ payload, targetIds: ["ogre"], attackOutcome: "hit", damageRoll: 18, sceneEpoch: 7, isCurrent: () => true });
  assert.equal(mutationCalls.length, 1);
  assert.equal(mutationCalls[0].options.history.label, "Attivazione: Mano arcana · Pugno serrato → Ogre: colpito");
  assert.equal(mutationCalls[0].options.history.payload.attackOutcome, "hit");
  assert.deepEqual(logged, []);
});

test("Pugno serrato critico su un PG a 0 PF: il critico arriva ai TS contro la morte", async () => {
  const intentFor = async (attackOutcome) => {
    const payload = scene();
    items.get("ogre").metadata[META_KEY] = { attitude: "pc", hp: 0, hpMax: 59, inInitiative: true };
    await executeSpellActiveResolution({ payload, targetIds: ["ogre"], attackOutcome, damageRoll: 18, sceneEpoch: 7, isCurrent: () => true });
    return mutationCalls[0].options.metadataPatches.find((patch) => patch.id === "ogre").hpIntents[0];
  };
  assert.equal((await intentFor("critical")).critical, true);
  assert.equal((await intentFor("hit")).critical, undefined);
});

test("Pugno serrato mancato: il comando non salva nulla, ma il registro lo riceve con lo stesso nome", async () => {
  const payload = scene();
  // As the PC console: a miss is recorded with the damage field left empty.
  await executeSpellActiveResolution({ payload, targetIds: ["ogre"], attackOutcome: "miss", damageRoll: "", sceneEpoch: 7, isCurrent: () => true });
  assert.equal(mutationCalls.length, 1, "the same command, with its validation");
  assert.equal(logged.length, 1);
  assert.equal(logged[0].label, "Attivazione: Mano arcana · Pugno serrato → Ogre: mancato");
  assert.equal(logged[0].kind, "spell-active-resolution");
  assert.equal(logged[0].payload.attackOutcome, "miss");
});

test("Pugno serrato segue la console dei PG: esito prima, danno solo per colpito o critico", async () => {
  const { spellActiveResolutionAttackDamageRequired } = await import("../src/spellActiveResolutionCore.js");
  const fist = getSpellDefinition("arcane-hand").activeActions.find((entry) => entry.id === "arcane-hand-clenched");
  assert.deepEqual(fist.attack.outcomes, ["hit", "critical", "miss"]);
  assert.equal(fist.attack.consoleFlow, true);
  assert.equal(spellActiveResolutionAttackDamageRequired(fist, "miss"), false);
  assert.equal(spellActiveResolutionAttackDamageRequired(fist, "hit"), true);
  assert.equal(spellActiveResolutionAttackDamageRequired(fist, "critical"), true);
});
