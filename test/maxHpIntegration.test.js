// CAP-MAXHP (docs/PIANO_CAP_MAXHP.md): the pills that raise or lower the hit point maximum through the real coordinator,
// History and cast. The harness is the one of tempHpIntegration.test.js.
import assert from "node:assert/strict";
import test, { mock } from "node:test";
import {
  createVersionedIndexedDB,
  versionedKeyRange,
} from "../test-support/fakeVersionedIndexedDb.js";

const previousIndexedDB = globalThis.indexedDB;
const previousKeyRange = globalThis.IDBKeyRange;
const previousLocation = globalThis.location;
globalThis.indexedDB = createVersionedIndexedDB();
globalThis.IDBKeyRange = versionedKeyRange;
globalThis.location = { pathname: "/plugin.html" };

const META_KEY = "com.thebigpicture.initiative/meta";
const STATE_KEY = "com.thebigpicture.initiative/state";
const SPELLS_KEY = "com.thebigpicture.initiative/spells";
const CONCENTRATION_KEY = "com.thebigpicture.initiative/concentration";

const clone = (value) => value === undefined ? undefined : structuredClone(value);
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

const sceneState = {
  ready: true,
  metadata: {},
  items: [],
};
const readyListeners = new Set();
const broadcastListeners = new Map();

function currentItems(ids) {
  const wanted = Array.isArray(ids) ? new Set(ids) : null;
  return sceneState.items
    .filter((item) => !wanted || wanted.has(item?.id))
    .map(clone);
}

const itemChangeListeners = new Set();

function emitItemsChange() {
  const items = sceneState.items.map(clone);
  for (const listener of [...itemChangeListeners]) {
    try { listener(items); } catch {}
  }
}

const sdkStub = {
  onReady: () => {},
  player: { getRole: async () => "GM" },
  room: { id: "max-hp-room", getMetadata: async () => ({}) },
  scene: {
    isReady: async () => sceneState.ready,
    onReadyChange(listener) {
      readyListeners.add(listener);
      return () => readyListeners.delete(listener);
    },
    getMetadata: async () => clone(sceneState.metadata),
    setMetadata: async (update) => {
      sceneState.metadata = { ...sceneState.metadata, ...clone(update) };
    },
    items: {
      getItems: async (predicateOrIds) => {
        if (!predicateOrIds) return currentItems();
        if (Array.isArray(predicateOrIds)) return currentItems(predicateOrIds);
        if (typeof predicateOrIds === "function") {
          return sceneState.items.filter(predicateOrIds).map(clone);
        }
        return currentItems();
      },
      updateItems: async (predicateOrIds, updater) => {
        let targets = [];
        if (typeof predicateOrIds === "function") {
          targets = sceneState.items.filter(predicateOrIds).map(clone);
        } else if (Array.isArray(predicateOrIds)) {
          const set = new Set(predicateOrIds);
          targets = sceneState.items.filter((it) => set.has(it.id)).map(clone);
        } else {
          targets = sceneState.items.map(clone);
        }
        await updater(targets);
        const byId = new Map(targets.map((item) => [item.id, item]));
        sceneState.items = sceneState.items.map((item) => byId.get(item.id) || item);
        emitItemsChange();
      },
      deleteItems: async (ids) => {
        const wanted = new Set(ids || []);
        sceneState.items = sceneState.items.filter((item) => !wanted.has(item.id));
        emitItemsChange();
      },
      addItems: async (items) => {
        sceneState.items.push(...clone(items || []));
        emitItemsChange();
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
    buildText: (...args) => ({ type: "TEXT", args }),
    buildShape: (...args) => ({ type: "SHAPE", args }),
    Command: class Command {},
  },
});

const clientEffects = await import("../src/effectsMutations.js?max-hp-real-client");
globalThis.location = { pathname: "/background.html" };
const backgroundEffects = await import("../src/effectsMutations.js?max-hp-real-background");
globalThis.location = { pathname: "/plugin.html" };
const baseEffects = await import("../src/effectsMutations.js?max-hp-real-base");
mock.module("../src/effectsMutations.js", {
  exports: {
    ...baseEffects,
    EFFECTS_MUTATION_STATUS: clientEffects.EFFECTS_MUTATION_STATUS,
    runEffectsMutation: clientEffects.runEffectsMutation,
    undoEffectsMutation: clientEffects.undoEffectsMutation,
    hasPendingEffectsHistory: clientEffects.hasPendingEffectsHistory,
    flushPendingEffectsHistory: clientEffects.flushPendingEffectsHistory,
  },
});

const history = await import("../src/history.js?max-hp-real-history");
const historyOwner = await import("../src/historyOwner.js?max-hp-real-owner");
mock.module("../src/history.js", { exports: { ...history } });
const { currentSceneEpoch, markSceneEpochReady } = await import("../src/sceneEpoch.js");
const { buildSpellUnifiedPanelContract } = await import("../src/spellUnifiedPanelCore.js?max-hp-real-panel");
const { buildSpellAreaResolutionCommand } = await import("../src/spellAreaResolutionCommandCore.js?max-hp-real-command");
const { executeSpellAreaResolution } = await import("../src/spellAreaResolutionExecutor.js?max-hp-real-executor");
const { planEffectSaveReminderNotices } = await import("../src/effectSaveReminderCore.js?max-hp-real-reminder-core");
const { resolveReminder, clearReminderResolutionQueue } = await import("../src/reminderResolution.js?max-hp-real-reminder");
const { normalizeHistoryUndoResult, HISTORY_UNDO_OUTCOME } = await import("../src/historyUndoResultCore.js");
const { refreshConditionLabels } = await import("../src/conditions.js");
const { DEATH_SAVES_FIELD } = await import("../src/deathSaveCore.js");


async function resetScene(tokens = []) {
  historyOwner.unmountHistoryOwner();
  backgroundEffects.unmountEffectsMutationCoordinatorService();
  clearReminderResolutionQueue();
  sceneState.metadata = {
    [STATE_KEY]: {
      round: 1,
      current: 0,
      order: tokens.map((t) => t.id),
    },
    ["com.thebigpicture.initiative/history"]: {
      version: 1,
      roomId: "max-hp-room",
      entries: [],
    },
  };
  sceneState.items = tokens.map(clone);
  markSceneEpochReady("test-reset");
  await historyOwner.mountHistoryOwner();
  await backgroundEffects.mountEffectsMutationCoordinatorService();
}

async function convergeDeferredEffectsHistory() {
  const sceneEpoch = currentSceneEpoch();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    clientEffects.flushPendingEffectsHistory(sceneEpoch);
    backgroundEffects.flushPendingEffectsHistory(sceneEpoch);
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (
      !clientEffects.hasPendingEffectsHistory(sceneEpoch)
      && !backgroundEffects.hasPendingEffectsHistory(sceneEpoch)
    ) return;
  }
  assert.fail("Deferred Effects History did not converge");
}

test.before(async () => {
  await historyOwner.mountHistoryOwner();
  await backgroundEffects.mountEffectsMutationCoordinatorService();
});

test.after(() => {
  clearReminderResolutionQueue();
  backgroundEffects.unmountEffectsMutationCoordinatorService();
  historyOwner.unmountHistoryOwner();
  globalThis.indexedDB = previousIndexedDB;
  globalThis.IDBKeyRange = previousKeyRange;
  if (previousLocation === undefined) delete globalThis.location;
  else globalThis.location = previousLocation;
});


const CASTER = "caster";
const token = (id, hp, hpMax, extra = {}) => ({ id, name: id, type: "IMAGE", layer: "CHARACTER", position: { x: 0, y: 0 },
  metadata: { [META_KEY]: { hp, hpMax, conditions: { version: 2, instances: [] }, [CONCENTRATION_KEY]: {}, [SPELLS_KEY]: [], ...extra } } });
const meta = (id) => sceneState.items.find((item) => item.id === id).metadata[META_KEY];
const pills = (id) => (meta(id).conditions?.instances || []).filter((entry) => entry.active !== false).map((entry) => entry.condition).sort();

async function undoLast() {
  const entries = await history.getHistoryEntries();
  const result = await history.undoHistoryThrough(entries.at(-1).id, { sceneEpoch: currentSceneEpoch() });
  assert.equal(normalizeHistoryUndoResult(result).outcome, HISTORY_UNDO_OUTCOME.COMMITTED, JSON.stringify(result));
}

// CAP-MAXHP, lotto X1: the pill that raises or lowers the maximum, through the real coordinator, History and the cast.
const { executeSpellApplication } = await import("../src/spellApplicationExecutor.js?max-hp-cast");
const { getSpellDefinition } = await import("../src/spells-srd.js");

const AID = (id, amount, extra = {}) => ({ id, condition: "Aiuto", active: true, type: "spell", spellId: "aid",
  effectId: "aid-vitality", mechanics: { maxHp: { amount, raisesCurrent: true } }, expiry: { mode: "manual" },
  manualRemoval: true, ...extra });
const withPills = (instances) => ({ conditions: { version: 2, instances } });
const hpOf = (id) => [meta(id).hp, meta(id).hpMax];
const pillOf = (id, label) => (meta(id).conditions?.instances || []).find((entry) => entry.condition === label && entry.active !== false);

async function run(operations, label, targetIds) {
  const result = await clientEffects.runEffectsMutation(operations, { kind: "condition", label, targetIds,
    history: { kind: "condition", label } });
  clientEffects.requireAppliedEffectsMutation(result);
  await convergeDeferredEffectsHistory();
  return result;
}

const aidOperation = (targetIds, amount = 5) => ({ type: "condition:add", targetIds, conditionName: "Aiuto",
  options: { type: "spell", spellId: "aid", effectId: "aid-vitality", effectDetail: "PF massimi e attuali aumentati.",
    mechanics: { maxHp: { amount, raisesCurrent: true } }, summaryParts: [{ id: "aid-max-hp", label: `PF max +${amount}` }],
    expiry: { mode: "manual" }, manualRemoval: true } });
const addAid = (targetIds, amount = 5) => run([aidOperation(targetIds, amount)], "Aiuto", targetIds);
const endPill = (itemId, instanceId) => run([{ type: "condition:remove-instances", removals: [{ itemId, instanceId }] }],
  "Fine", [itemId]);

test("X1: Aiuto alza massimo e PF nello stesso comando, e un solo Annulla li riporta indietro", async () => {
  await resetScene([token("hero", 20, 30)]);
  await addAid(["hero"]);
  assert.deepEqual(hpOf("hero"), [25, 35]);
  assert.ok(pillOf("hero", "Aiuto"));
  await undoLast();
  assert.deepEqual([...hpOf("hero"), pillOf("hero", "Aiuto")], [20, 30, undefined]);
});

test("X1: la fine della pill riporta giù il massimo; i PF scendono solo se sono sopra", async () => {
  await resetScene([token("hero", 20, 30), token("tank", 30, 30)]);
  await addAid(["hero", "tank"]);
  assert.deepEqual([hpOf("hero"), hpOf("tank")], [[25, 35], [35, 35]]);
  await endPill("hero", pillOf("hero", "Aiuto").id);
  assert.deepEqual(hpOf("hero"), [25, 30], "wounded: the hit points stay");
  await endPill("tank", pillOf("tank", "Aiuto").id);
  assert.deepEqual(hpOf("tank"), [30, 30], "at full: within the maximum that comes back");
  await undoLast();
  assert.deepEqual([...hpOf("tank"), !!pillOf("tank", "Aiuto")], [35, 35, true]);
});

test("X1: un danno e la fine della pill nello stesso comando, sopra quello che il comando scrive", async () => {
  await resetScene([token("hero", 35, 35, withPills([AID("aid-1", 5, { targetId: "hero" })]))]);
  await run([
    { type: "hp:set", updates: [{ itemId: "hero", hp: 30, hpMax: 35, hpIntent: { mode: "damage", amount: 5, eventId: "hit-5" } }] },
    { type: "condition:remove-instances", removals: [{ itemId: "hero", instanceId: "aid-1" }] },
  ], "Danno e fine", ["hero"]);
  assert.deepEqual(hpOf("hero"), [30, 30]);
});

test("X1: il vecchio formato passa ai PF temporanei nella stessa scrittura, senza perderli", async () => {
  await resetScene([token("hero", 40, 30)]);
  await addAid(["hero"]);
  assert.deepEqual([...hpOf("hero"), meta("hero").tempHp], [35, 35, 10]);
});

test("X1: Aiuto su un PG a 0 PF lo rialza: esce dai TS contro la morte e da Privo di sensi", async () => {
  await resetScene([token("hero", 6, 30, { attitude: "pc" })]);
  const hit = await clientEffects.runEffectsMutation([{ type: "hp:set", updates: [{ itemId: "hero", hp: 0, hpMax: 30,
    hpIntent: { mode: "damage", amount: 6, eventId: "down" } }] }], { kind: "hp", label: "Danno", targetIds: ["hero"],
  history: { kind: "hp", label: "Danno" } });
  clientEffects.requireAppliedEffectsMutation(hit);
  await convergeDeferredEffectsHistory();
  assert.ok(pillOf("hero", "Privo di sensi"), "down at 0 HP");
  await addAid(["hero"]);
  assert.deepEqual([...hpOf("hero"), !!pillOf("hero", "Privo di sensi"), meta("hero")[DEATH_SAVES_FIELD]], [5, 35, false, undefined]);
  await undoLast();
  assert.deepEqual([...hpOf("hero"), !!pillOf("hero", "Privo di sensi")], [0, 30, true]);
});

test("X1, M9: PF condivisi o non tracciati: la pill arriva come etichetta e i PF non cambiano", async () => {
  await resetScene([token("boss", 50, 50), token("titan", 50, 50, { sharedHpSourceId: "boss" }),
    { ...token("ghost", 0, 0), metadata: { [META_KEY]: { conditions: { version: 2, instances: [] } } } }]);
  await addAid(["boss", "titan", "ghost"]);
  assert.deepEqual([hpOf("boss"), hpOf("titan"), hpOf("ghost")], [[50, 50], [50, 50], [undefined, undefined]]);
  for (const id of ["boss", "titan", "ghost"]) {
    const pill = pillOf(id, "Aiuto");
    assert.ok(pill, id);
    assert.equal(pill.mechanics?.maxHp, undefined, id);
    assert.match(pill.effectDetail, /il bonus va messo a mano/u, id);
    assert.deepEqual(pill.summaryParts || [], [], id);
  }
});

test("X1, M2: lo stesso incantesimo due volte vale il più forte; togliendo il più forte resta l'altro", async () => {
  await resetScene([token("hero", 30, 30)]);
  await addAid(["hero"], 5);
  await addAid(["hero"], 10);
  assert.deepEqual(hpOf("hero"), [40, 40], "+10, not +15");
  const strong = (meta("hero").conditions.instances || []).find((entry) => entry.mechanics?.maxHp?.amount === 10);
  await endPill("hero", strong.id);
  assert.deepEqual(hpOf("hero"), [35, 35]);
});

test("X1: una scrittura che conosce già le pill del comando (maxHpAware) resta com'è", async () => {
  await resetScene([token("hero", 35, 35, withPills([AID("aid-1", 5, { targetId: "hero" })]))]);
  await run([
    { type: "hp:set", updates: [{ itemId: "hero", hp: 30, hpMax: 30, maxHpAware: true,
      hpIntent: { mode: "rest", amount: 0, eventId: "rest" } }] },
    { type: "condition:remove-instances", removals: [{ itemId: "hero", instanceId: "aid-1" }] },
  ], "Riposo", ["hero"]);
  assert.deepEqual(hpOf("hero"), [30, 30], "not 25");
});

test("X1: il lancio vero di Aiuto al 3° livello: +10 su tre bersagli, scadenza manuale, una voce di Cronologia", async () => {
  await resetScene([token(CASTER, 18, 30), token("ally", 40, 40), token("orc", 7, 15, { attitude: "enemy" })]);
  const spell = getSpellDefinition("aid");
  await executeSpellApplication({ spell, casterId: CASTER, casterName: "Chierica", targetIds: [CASTER, "ally", "orc"],
    turns: spell.defaultTurns || 10, castContext: { slotLevel: 3 }, requestedConcentration: false,
    sceneEpoch: currentSceneEpoch(), isCurrent: () => true });
  await convergeDeferredEffectsHistory();
  assert.deepEqual([hpOf(CASTER), hpOf("ally"), hpOf("orc")], [[28, 40], [50, 50], [17, 25]]);
  const pill = pillOf("ally", "Aiuto");
  assert.deepEqual([pill.mechanics.maxHp, pill.expiry, pill.summaryParts.map((part) => part.label)],
    [{ raisesCurrent: true, restEnds: "long", amount: 10 }, { mode: "manual" }, ["PF max +10"]]);
  assert.ok(pill.effectDetail.startsWith("PF max +10. PF massimi e PF attuali aumentati per 8 ore"), pill.effectDetail);
  await undoLast();
  assert.deepEqual([hpOf(CASTER), hpOf("ally"), hpOf("orc"), pillOf("ally", "Aiuto")], [[18, 30], [40, 40], [7, 15], undefined]);
});

// CAP-MAXHP, lotto X2: Harm through the area command, and the cures that end its disease.
async function castOn(spellId, slotLevel, targetId, { amount, outcome, targetContexts, status = "applied" } = {}) {
  const contract = buildSpellUnifiedPanelContract({ spellId, phase: "cast", castContext: { slotLevel } });
  const command = buildSpellAreaResolutionCommand({
    contract, spellId, phase: "cast", casterId: CASTER, slotLevel, targetIds: [targetId],
    ...(outcome ? { outcomes: { [targetId]: outcome } } : {}),
    ...(amount !== undefined ? { hpAmount: amount } : {}),
    ...(targetContexts ? { targetContexts } : {}),
    validateSpatial: false,
  });
  assert.equal(command.valid, true, JSON.stringify(command.errors));
  const result = await executeSpellAreaResolution(command, {
    getItems: sdkStub.scene.items.getItems,
    updateItems: sdkStub.scene.items.updateItems,
    deleteItems: sdkStub.scene.items.deleteItems,
    getSceneMetadata: sdkStub.scene.getMetadata,
    setSceneMetadata: sdkStub.scene.setMetadata,
    currentSceneEpoch,
    isCurrent: () => true,
    syncHPVisuals: async () => {},
    emitFireballVisual: async () => {},
    withItemMetaHistory: history.withItemMetaHistory,
  });
  assert.equal(result.status, status, JSON.stringify(result.errors || result));
  await convergeDeferredEffectsHistory();
  return result;
}

const harmOf = (id) => pillOf(id, "Ferire");

test("X2: Ferire fallito: 49 necrotici e massimo ridotto di 49 nello stesso lancio; un solo Annulla", async () => {
  await resetScene([token(CASTER, 60, 60), token("orc", 80, 100, { attitude: "enemy" })]);
  await castOn("harm", 6, "orc", { amount: 49, outcome: "failed" });
  assert.deepEqual(hpOf("orc"), [31, 51]);
  const pill = harmOf("orc");
  assert.deepEqual([pill.mechanics, pill.expiry, pill.manualRemoval, pill.spellId], [{ maxHp: { amount: -49, stack: "harm", restEnds: "short" }, disease: true },
    { mode: "manual" }, true, "harm"]);
  assert.ok(pill.effectDetail.startsWith("PF max −49. Malattia virulenta"), pill.effectDetail);
  await undoLast();
  assert.deepEqual([...hpOf("orc"), harmOf("orc")], [80, 100, undefined]);
});

test("X2: il danno non porta sotto 1 PF; superato: metà, nessuna riduzione; la riduzione tiene il massimo almeno a 1", async () => {
  await resetScene([token(CASTER, 60, 60), token("orc", 30, 100, { attitude: "enemy" }), token("ogre", 20, 100, { attitude: "enemy" }),
    token("imp", 40, 40, { attitude: "enemy" })]);
  await castOn("harm", 6, "orc", { amount: 49, outcome: "failed" });
  assert.deepEqual(hpOf("orc"), [1, 51], "1 HP, and the whole 49 off the maximum");
  await castOn("harm", 6, "ogre", { amount: 49, outcome: "passed" });
  assert.deepEqual([...hpOf("ogre"), harmOf("ogre")], [1, 100, undefined], "24 of 20: held at 1, no reduction on a success");
  await castOn("harm", 6, "imp", { amount: 49, outcome: "failed" });
  assert.deepEqual([...hpOf("imp"), harmOf("imp").mechanics.maxHp.amount], [1, 1, -39]);
});

test("X2, M2: un secondo Ferire più forte prende il posto del primo, contato dal massimo intero", async () => {
  await resetScene([token(CASTER, 60, 60), token("orc", 100, 100, { attitude: "enemy" })]);
  await castOn("harm", 6, "orc", { amount: 30, outcome: "failed" });
  assert.deepEqual(hpOf("orc"), [70, 70]);
  await castOn("harm", 6, "orc", { amount: 80, outcome: "failed" });
  assert.deepEqual(hpOf("orc"), [1, 20], "100 − 80, not 70 − 80");
});

test("X2, M10: Ristorare inferiore sulla malattia chiude la riduzione e il massimo torna", async () => {
  await resetScene([token(CASTER, 60, 60), token("hero", 31, 51, { attitude: "pc",
    ...withPills([{ id: "harm-1", condition: "Ferire", active: true, spellId: "harm", effectId: "harm-reduction",
      mechanics: { maxHp: { amount: -49, stack: "harm" }, disease: true }, expiry: { mode: "manual" }, manualRemoval: true }]) })]);
  await castOn("lesser-restoration", 2, "hero", { targetContexts: { hero: { cleanseCondition: "disease" } } });
  assert.deepEqual([...hpOf("hero"), harmOf("hero")], [31, 100, undefined]);
  await undoLast();
  assert.deepEqual([...hpOf("hero"), !!harmOf("hero")], [31, 51, true]);
});

test("X2, M10: Guarigione chiude la riduzione e cura fino al massimo che torna; un solo Annulla", async () => {
  await resetScene([token(CASTER, 60, 60), token("hero", 31, 51, { attitude: "pc",
    ...withPills([{ id: "harm-1", condition: "Ferire", active: true, spellId: "harm", effectId: "harm-reduction",
      mechanics: { maxHp: { amount: -49, stack: "harm" }, disease: true }, expiry: { mode: "manual" }, manualRemoval: true }]) })]);
  await castOn("heal", 6, "hero");
  assert.deepEqual([...hpOf("hero"), harmOf("hero")], [100, 100, undefined], "31 + 70 on a maximum of 100, not 51");
  await undoLast();
  assert.deepEqual([...hpOf("hero"), !!harmOf("hero")], [31, 51, true]);
});

// CAP-MAXHP, lotto X3: Greater Restoration, one effect of the GM's choice (decision M7: a reduction only when it is a pill).
const harmPill = (id, amount) => ({ id, condition: "Ferire", active: true, spellId: "harm", effectId: "harm-reduction",
  mechanics: { maxHp: { amount, stack: "harm" }, disease: true }, expiry: { mode: "manual" }, manualRemoval: true });

test("X3: Ristorare superiore sulla riduzione dei PF massimi: toglie la più forte e il massimo torna; un Annulla", async () => {
  await resetScene([token(CASTER, 60, 60), token("hero", 31, 51, { attitude: "pc", ...withPills([harmPill("harm-1", -49)]) })]);
  const result = await castOn("greater-restoration", 5, "hero", { targetContexts: { hero: { cleanseCondition: "max-hp" } } });
  assert.deepEqual([...hpOf("hero"), harmOf("hero")], [31, 100, undefined]);
  assert.equal(JSON.stringify(result).includes("niente da terminare"), false);
  await undoLast();
  assert.deepEqual([...hpOf("hero"), !!harmOf("hero")], [31, 51, true]);
});

test("X3: Ristorare superiore toglie un livello di indebolimento, e la scheda che tiene la base lo segue", async () => {
  await resetScene([token(CASTER, 60, 60), token("hero", 20, 40, { attitude: "pc", initiativeCard: { name: "Hero", exhaustion: 3 },
    ...withPills([{ id: "ex-1", condition: "Indebolimento", active: true, level: 3, expiry: { mode: "manual" } }]) })]);
  await castOn("greater-restoration", 5, "hero", { targetContexts: { hero: { cleanseCondition: "exhaustion" } } });
  const exhaustion = (meta("hero").conditions.instances || []).filter((entry) => entry.condition === "Indebolimento" && entry.active !== false);
  assert.deepEqual([exhaustion.map((entry) => entry.level), meta("hero").initiativeCard.exhaustion], [[2], 2]);
  await undoLast();
  const back = (meta("hero").conditions.instances || []).filter((entry) => entry.condition === "Indebolimento" && entry.active !== false);
  assert.deepEqual([back.map((entry) => entry.level), meta("hero").initiativeCard.exhaustion], [[3], 3]);
});

test("X3: Ristorare superiore termina un solo Affascinato; senza l'effetto scelto, solo una nota", async () => {
  await resetScene([token(CASTER, 60, 60), token("hero", 20, 40, { attitude: "pc", ...withPills([
    { id: "ch-1", condition: "Affascinato", active: true, expiry: { mode: "manual" } },
    { id: "ch-2", condition: "Affascinato", active: true, expiry: { mode: "manual" } }]) })]);
  await castOn("greater-restoration", 5, "hero", { targetContexts: { hero: { cleanseCondition: "Affascinato" } } });
  assert.deepEqual(pills("hero"), ["Affascinato"]);
  // Nothing to end: no command, the note for the GM.
  const result = await castOn("greater-restoration", 5, "hero", { targetContexts: { hero: { cleanseCondition: "Pietrificato" } },
    status: "noop" });
  assert.match(result.notes.join(" "), /niente da terminare per la scelta fatta/u);
  const ability = await castOn("greater-restoration", 5, "hero", { targetContexts: { hero: { cleanseCondition: "ability" } },
    status: "noop" });
  assert.match(ability.notes.join(" "), /riduzioni di caratteristica/u);
  assert.deepEqual(hpOf("hero"), [20, 40]);
});

// CAP-MAXHP, lotto X4: Heroes' Feast, one 2d10 for each creature (decision M6), its cures and its 24-hour pill.
async function castOnAll(spellId, slotLevel, targetIds, { targetContexts, status = "applied" } = {}) {
  const contract = buildSpellUnifiedPanelContract({ spellId, phase: "cast", castContext: { slotLevel } });
  const command = buildSpellAreaResolutionCommand({
    contract, spellId, phase: "cast", casterId: CASTER, slotLevel, targetIds,
    ...(targetContexts ? { targetContexts } : {}),
    validateSpatial: false,
  });
  assert.equal(command.valid, true, JSON.stringify(command.errors));
  const result = await executeSpellAreaResolution(command, {
    getItems: sdkStub.scene.items.getItems,
    updateItems: sdkStub.scene.items.updateItems,
    deleteItems: sdkStub.scene.items.deleteItems,
    getSceneMetadata: sdkStub.scene.getMetadata,
    setSceneMetadata: sdkStub.scene.setMetadata,
    currentSceneEpoch,
    isCurrent: () => true,
    syncHPVisuals: async () => {},
    emitFireballVisual: async () => {},
    withItemMetaHistory: history.withItemMetaHistory,
  });
  assert.equal(result.status, status, JSON.stringify(result.errors || result));
  await convergeDeferredEffectsHistory();
  return result;
}

const feastOf = (id) => pillOf(id, "Banchetto degli eroi");

test("X4: Banchetto degli eroi: ogni creatura col suo 2d10, cure di veleno e malattie nello stesso comando; un Annulla", async () => {
  await resetScene([token(CASTER, 18, 30), token("ally", 40, 40), token("hero", 31, 51, { attitude: "pc",
    ...withPills([harmPill("harm-1", -49), { id: "po-1", condition: "Avvelenato", active: true, expiry: { mode: "manual" } }]) })]);
  await castOnAll("heroes-feast", 6, [CASTER, "ally", "hero"], { targetContexts: {
    [CASTER]: { feastRoll: 12 }, ally: { feastRoll: 7 }, hero: { feastRoll: 15 } } });
  assert.deepEqual([hpOf(CASTER), hpOf("ally"), hpOf("hero")], [[30, 42], [47, 47], [46, 115]]);
  assert.deepEqual(pills("hero"), ["Banchetto degli eroi"], "Harm's disease and the poison are cured");
  const pill = feastOf("hero");
  assert.deepEqual([pill.mechanics.maxHp, pill.mechanics.conditionImmunities.names, pill.mechanics.damageDefenses, pill.expiry],
    [{ amount: 15, raisesCurrent: true, stack: "heroes-feast" }, ["Spaventato", "Avvelenato"], { immunities: ["poison"] }, { mode: "manual" }]);
  assert.deepEqual(pill.summaryParts.map((part) => part.label), ["PF max +15", "Imm. Veleno, Spaventato", "Vant. TS Sag"]);
  // Immune to being poisoned and frightened for its duration.
  await run([{ type: "condition:add", targetIds: ["hero"], conditionName: "Avvelenato", options: { expiry: { mode: "manual" } } }],
    "Veleno", ["hero"]);
  assert.deepEqual(pills("hero"), ["Banchetto degli eroi"], "blocked: no change and no History entry");
  await undoLast();
  assert.deepEqual([hpOf(CASTER), hpOf("ally"), hpOf("hero"), pills("hero")],
    [[18, 30], [40, 40], [31, 51], ["Avvelenato", "Ferire"]]);
});

test("X4: un tiro fuori da 2–20 non dà i benefici, con una nota; le cure restano", async () => {
  await resetScene([token(CASTER, 18, 30), token("hero", 20, 40, { attitude: "pc",
    ...withPills([{ id: "po-1", condition: "Avvelenato", active: true, expiry: { mode: "manual" } }]) })]);
  const result = await castOnAll("heroes-feast", 6, ["hero"], { targetContexts: { hero: { feastRoll: 25 } } });
  assert.deepEqual([...hpOf("hero"), pills("hero")], [20, 40, []]);
  assert.match(result.notes.join(" "), /il tiro di 2d10 va da 2 a 20/u);
});

// CAP-MAXHP, decision M11: the party's rest through the coordinator, as takeGroupRest builds it.
const { groupRestMembers, planGroupRestHpWrites, planGroupRestPillEndings } = await import("../src/groupRestCore.js");

test("X5, M11: il riposo lungo chiude Aiuto e Ferire nello stesso comando, i PF sul massimo che torna; un Annulla", async () => {
  await resetScene([token("omar", 35, 35, { attitude: "pc", ...withPills([AID("aid-1", 5, { targetId: "omar",
    mechanics: { maxHp: { amount: 5, raisesCurrent: true, restEnds: "long" } } })]) }),
  token("lavera", 31, 51, { attitude: "pc", ...withPills([{ ...harmPill("harm-1", -49),
    mechanics: { maxHp: { amount: -49, stack: "harm", restEnds: "short" }, disease: true } }]) })]);
  const members = groupRestMembers(sceneState.items);
  const updates = planGroupRestHpWrites({ members, longRest: true, eventId: "rest-1" });
  await run([
    { type: "hp:set", damageEnds: false, updates },
    ...planGroupRestPillEndings({ members, longRest: true }),
  ], "Riposo lungo del gruppo", ["omar", "lavera"]);
  assert.deepEqual([hpOf("omar"), hpOf("lavera"), pills("omar"), pills("lavera")], [[30, 30], [100, 100], [], []]);
  await undoLast();
  assert.deepEqual([hpOf("omar"), hpOf("lavera"), pills("omar"), pills("lavera")], [[35, 35], [31, 51], ["Aiuto"], ["Ferire"]]);
});
