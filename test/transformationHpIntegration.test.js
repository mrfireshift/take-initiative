// Trasformazioni, lotto W5 (docs/PIANO_TRASFORMAZIONI.md §5.14): the hit points of a form through the real coordinator,
// History and area command. The harness is the one of maxHpIntegration.test.js.
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
  room: { id: "transformation-hp-room", getMetadata: async () => ({}) },
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

const clientEffects = await import("../src/effectsMutations.js?transformation-hp-real-client");
globalThis.location = { pathname: "/background.html" };
const backgroundEffects = await import("../src/effectsMutations.js?transformation-hp-real-background");
globalThis.location = { pathname: "/plugin.html" };
const baseEffects = await import("../src/effectsMutations.js?transformation-hp-real-base");
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

const history = await import("../src/history.js?transformation-hp-real-history");
const historyOwner = await import("../src/historyOwner.js?transformation-hp-real-owner");
mock.module("../src/history.js", { exports: { ...history } });
const { currentSceneEpoch, markSceneEpochReady } = await import("../src/sceneEpoch.js");
const { buildSpellUnifiedPanelContract } = await import("../src/spellUnifiedPanelCore.js?transformation-hp-real-panel");
const { buildSpellAreaResolutionCommand } = await import("../src/spellAreaResolutionCommandCore.js?transformation-hp-real-command");
const { executeSpellAreaResolution } = await import("../src/spellAreaResolutionExecutor.js?transformation-hp-real-executor");
const { planEffectSaveReminderNotices } = await import("../src/effectSaveReminderCore.js?transformation-hp-real-reminder-core");
const { resolveReminder, clearReminderResolutionQueue } = await import("../src/reminderResolution.js?transformation-hp-real-reminder");
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
      roomId: "transformation-hp-room",
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



const DRUID = "druid";
const token = (id, hp, hpMax, extra = {}) => ({ id, name: id, type: "IMAGE", layer: "CHARACTER", position: { x: 0, y: 0 },
  metadata: { [META_KEY]: { hp, hpMax, conditions: { version: 2, instances: [] }, [CONCENTRATION_KEY]: {}, [SPELLS_KEY]: [], ...extra } } });
const meta = (id) => sceneState.items.find((item) => item.id === id).metadata[META_KEY];
const instances = (id) => meta(id).conditions?.instances || [];
const pillOf = (id, label) => instances(id).find((entry) => entry.condition === label && entry.active !== false);
const hpOf = (id) => [meta(id).hp, meta(id).hpMax];
const formOf = (id) => pillOf(id, "Forma Selvatica");
const stashOf = (id) => formOf(id)?.mechanics?.transformation?.stash;

async function undoLast() {
  const entries = await history.getHistoryEntries();
  const result = await history.undoHistoryThrough(entries.at(-1).id, { sceneEpoch: currentSceneEpoch() });
  assert.equal(normalizeHistoryUndoResult(result).outcome, HISTORY_UNDO_OUTCOME.COMMITTED, JSON.stringify(result));
}

async function run(operations, label, targetIds, extra = {}) {
  const result = await clientEffects.runEffectsMutation(operations, { kind: "condition", label, targetIds,
    history: { kind: "condition", label }, ...extra });
  clientEffects.requireAppliedEffectsMutation(result);
  await convergeDeferredEffectsHistory();
  return result;
}

// The druid's Wild Shape pill as the console puts it (W2a): a wolf, SRD 5.1.
const WOLF = { name: "Wolf", type: "beast", cr: "1/4", size: "medium", hitPoints: { average: 11, formula: "2d8+2" },
  armorClass: 13, abilities: { str: 12, dex: 15, con: 12, int: 3, wis: 12, cha: 6 }, speeds: { walk: 12 }, actions: [] };
const BEAR = { ...WOLF, name: "Brown Bear", cr: "1", size: "large", hitPoints: { average: 34, formula: "4d10+12" } };
const wildShape = (id, form = WOLF, extra = {}) => ({ id, condition: "Forma Selvatica",
  displayLabel: `Forma Selvatica · ${form.name}`, active: true, type: "class-feature", effectId: "druido-forma-selvatica",
  sourceId: DRUID, targetId: DRUID, parentEffectId: `activation-${id}`, expiry: { mode: "manual" },
  mechanics: { transformation: { kind: "wild-shape", keepsMind: true, keepsFeatures: true, canCast: false, form,
    formHp: form.hitPoints.average } }, ...extra });
const shift = (id = "ws-1", form = WOLF) => run([{ type: "condition:add-instances", instancesByTarget: { [DRUID]: [wildShape(id, form)] } }],
  "Forma Selvatica", [DRUID]);
const damage = (amount, hp, extra = {}) => run([{ type: "hp:set", updates: [{ itemId: DRUID, hp, hpMax: meta(DRUID).hpMax,
  hpIntent: { mode: "damage", amount, eventId: `hit-${amount}` }, ...extra }] }], "Danno", [DRUID]);
const druid = (hp = 34, hpMax = 40, extra = {}) => token(DRUID, hp, hpMax, { attitude: "pc", ...extra });
const AID = (id, amount) => ({ type: "condition:add", targetIds: [DRUID], conditionName: "Aiuto",
  options: { type: "spell", spellId: "aid", effectId: "aid-vitality", mechanics: { maxHp: { amount, raisesCurrent: true } },
    expiry: { mode: "manual" }, manualRemoval: true }, operationId: id });
const WARD = { id: "ward-1", condition: "Interdizione alla morte", active: true, type: "spell", spellId: "death-ward",
  mechanics: { deathWard: true }, expiry: { mode: "manual" } };

test("W5b: la forma arriva con i suoi PF, quelli del druido vanno sulla pill; un solo Annulla rimette tutto", async () => {
  await resetScene([druid()]);
  const result = await shift();
  assert.deepEqual([hpOf(DRUID), stashOf(DRUID)], [[11, 11], { hp: 34, hpMax: 40 }]);
  assert.deepEqual(result.plan?.reactionRecords ?? (await history.getHistoryEntries()).at(-1).payload?.reactions,
    [{ id: DRUID, kind: "transformation", text: "Forma Selvatica · Wolf: 11 PF della forma, i suoi (34/40) messi da parte" }]);
  await undoLast();
  assert.deepEqual([hpOf(DRUID), formOf(DRUID)], [[34, 40], undefined]);
});

test("W5b: 15 danni sul lupo: torna druido con l'eccesso (30/40), pill finita; l'Annulla rimette lupo e pill", async () => {
  await resetScene([druid()]);
  await shift();
  await damage(15, 0);
  assert.deepEqual([hpOf(DRUID), formOf(DRUID)], [[30, 40], undefined]);
  assert.equal(pillOf(DRUID, "Privo di sensi"), undefined);
  const entry = (await history.getHistoryEntries()).at(-1);
  assert.deepEqual(entry.payload?.reactions, [{ id: DRUID, kind: "transformation",
    text: "Forma Selvatica · Wolf: a 0 PF torna alla sua forma, 4 di danno in eccesso sui suoi PF (34 → 30)" }]);
  await undoLast();
  assert.deepEqual([hpOf(DRUID), stashOf(DRUID)], [[11, 11], { hp: 34, hpMax: 40 }]);
});

test("W5b: 45 danni: druido a 0, privo di sensi; 85 danni: morto per danno massiccio sul massimo del druido", async () => {
  await resetScene([druid()]);
  await shift();
  await damage(45, 0);
  assert.deepEqual([hpOf(DRUID), formOf(DRUID)?.id, !!pillOf(DRUID, "Privo di sensi"), !!pillOf(DRUID, "Morto")],
    [[0, 40], undefined, true, false]);
  await resetScene([druid()]);
  await shift();
  await damage(84, 0);
  assert.equal(!!pillOf(DRUID, "Morto"), false, "84: 73 past the wolf, 39 past the druid's 34: below its maximum of 40");
  await resetScene([druid()]);
  await shift();
  await damage(85, 0);
  assert.deepEqual([hpOf(DRUID), !!pillOf(DRUID, "Morto")], [[0, 40], true], "85: 40 past the druid's 34");
});

test("W5b, G34: l'Interdizione guarda i PF veri: scatta solo se l'eccesso porta il druido a 0", async () => {
  await resetScene([druid(34, 40, { conditions: { version: 2, instances: [WARD] } })]);
  await shift();
  await damage(15, 0);
  assert.deepEqual([hpOf(DRUID), !!pillOf(DRUID, "Interdizione alla morte")], [[30, 40], true], "the ward stays");
  await resetScene([druid(34, 40, { conditions: { version: 2, instances: [WARD] } })]);
  await shift();
  await damage(50, 0);
  assert.deepEqual([hpOf(DRUID), !!pillOf(DRUID, "Interdizione alla morte"), !!pillOf(DRUID, "Privo di sensi")],
    [[1, 40], false, false]);
});

test("W5b, G18: i PF temporanei prendono il danno per primi e restano nel loro campo", async () => {
  await resetScene([druid(34, 40, { tempHp: 5 })]);
  await shift();
  assert.deepEqual([hpOf(DRUID), meta(DRUID).tempHp, stashOf(DRUID)], [[11, 11], 5, { hp: 34, hpMax: 40 }]);
  await run([{ type: "hp:set", updates: [{ itemId: DRUID, hp: 1, hpMax: 11, tempHp: 0,
    hpIntent: { mode: "damage", amount: 15, eventId: "hit" } }] }], "Danno", [DRUID]);
  assert.deepEqual([hpOf(DRUID), meta(DRUID).tempHp ?? 0, !!formOf(DRUID)], [[1, 11], 0, true], "no return: the wolf at 1");
  await resetScene([druid(34, 40, { tempHp: 5 })]);
  await shift();
  await run([{ type: "hp:set", updates: [{ itemId: DRUID, hp: 0, hpMax: 11, tempHp: 0,
    hpIntent: { mode: "damage", amount: 20, eventId: "hit" } }] }], "Danno", [DRUID]);
  assert.deepEqual([hpOf(DRUID), meta(DRUID).tempHp ?? 0, !!formOf(DRUID)], [[30, 40], 0, false], "20: 5 temporary, 11 wolf, 4 druid");
});

test("W5b, G33: Aiuto durante la forma va sui PF messi da parte; alla fine il druido torna con il bonus", async () => {
  await resetScene([druid()]);
  await shift();
  await run([AID("aid-op", 5)], "Aiuto", [DRUID]);
  assert.deepEqual([hpOf(DRUID), stashOf(DRUID)], [[11, 11], { hp: 39, hpMax: 45 }], "the wolf does not move");
  await run([{ type: "condition:remove-instances", removals: [{ itemId: DRUID, instanceId: formOf(DRUID).id }] }], "Fine", [DRUID]);
  assert.deepEqual([hpOf(DRUID), !!pillOf(DRUID, "Aiuto")], [[39, 45], true]);
  await run([{ type: "condition:remove-instances", removals: [{ itemId: DRUID, instanceId: pillOf(DRUID, "Aiuto").id }] }], "Fine", [DRUID]);
  assert.deepEqual(hpOf(DRUID), [39, 40], "Aid ends on the druid as usual");
});

test("W5b: la forma che finisce in altro modo (✕, Termina) rimette i PF del druido interi, ferito o no", async () => {
  await resetScene([druid()]);
  await shift();
  await damage(8, 3);
  assert.deepEqual(hpOf(DRUID), [3, 11]);
  await run([{ type: "condition:remove-parent-effects", parentEffectIds: [formOf(DRUID).parentEffectId],
    conditionTypes: ["class-feature", "class-feature-area"] }], "Capacità terminata", [DRUID]);
  assert.deepEqual([hpOf(DRUID), formOf(DRUID)], [[34, 40], undefined]);
  await undoLast();
  assert.deepEqual(hpOf(DRUID), [3, 11]);
});

test("W5b, G39: l'editor in linea che scrive 0 sulla forma la chiude, e il druido torna con i suoi PF interi", async () => {
  await resetScene([druid()]);
  await shift();
  await run([{ type: "hp:set", updates: [{ itemId: DRUID, hp: 0, hpMax: 11 }] }], "PF", [DRUID]);
  assert.deepEqual([hpOf(DRUID), formOf(DRUID), !!pillOf(DRUID, "Privo di sensi")], [[34, 40], undefined, false]);
});

test("W5b: una patch con i PF (un promemoria) passa dallo stesso ritorno, e il suo Privo di sensi non resta", async () => {
  await resetScene([druid()]);
  await shift();
  await run([
    { type: "condition:add", targetIds: [DRUID], conditionName: "Privo di sensi",
      options: { type: "hp-zero", expiry: { mode: "manual" } } },
  ], "Promemoria", [DRUID], { metadataPatches: [{ id: DRUID, hpIntent: { mode: "damage", amount: 20, eventId: "reminder" },
    fields: { hp: { mode: "set", value: 0, expected: { present: true, value: 11 } },
      hpMax: { mode: "assert", expected: { present: true, value: 11 } } } }] });
  assert.deepEqual([hpOf(DRUID), formOf(DRUID), !!pillOf(DRUID, "Privo di sensi")], [[25, 40], undefined, false]);
});

test("W5b, G28: una forma nuova prende il posto della vecchia, e i PF messi da parte restano quelli del druido", async () => {
  await resetScene([druid()]);
  await shift("ws-1", WOLF);
  await damage(5, 6);
  await shift("ws-2", BEAR);
  assert.deepEqual([hpOf(DRUID), stashOf(DRUID), instances(DRUID).filter((entry) => entry.condition === "Forma Selvatica").length],
    [[34, 34], { hp: 34, hpMax: 40 }, 1]);
});

// Lotto W5c: the area panel writes its HP itself (updateHP); the return happens there, before Death Ward.
const CASTER = "caster";
async function castOn(spellId, slotLevel, targetId, { amount, outcome, status = "applied" } = {}) {
  const contract = buildSpellUnifiedPanelContract({ spellId, phase: "cast", castContext: { slotLevel } });
  const command = buildSpellAreaResolutionCommand({
    contract, spellId, phase: "cast", casterId: CASTER, slotLevel, targetIds: [targetId],
    ...(outcome ? { outcomes: { [targetId]: outcome } } : {}),
    ...(amount !== undefined ? { hpAmount: amount } : {}),
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

test("W5c: 28 danni dal pannello delle aree sul lupo: druido 17/40, pill finita; l'Annulla del pannello rimette il lupo", async () => {
  await resetScene([token(CASTER, 30, 30), druid()]);
  await shift();
  await castOn("disintegrate", 6, DRUID, { amount: 28, outcome: "failed" });
  assert.deepEqual([hpOf(DRUID), formOf(DRUID), !!pillOf(DRUID, "Privo di sensi")], [[17, 40], undefined, false]);
  const entry = (await history.getHistoryEntries()).at(-1);
  assert.ok((entry.payload?.reactions || []).some((record) => record.id === DRUID && record.kind === "transformation"
    && record.text.includes("17 di danno in eccesso sui suoi PF (34 → 17)")), JSON.stringify(entry.payload?.reactions));
  await undoLast();
  assert.deepEqual([hpOf(DRUID), stashOf(DRUID)], [[11, 11], { hp: 34, hpMax: 40 }]);
});

test("W5c, G40: Disintegrazione da 40 sul lupo: a 0 PF della forma torna druido con l'eccesso (5/40), vivo", async () => {
  await resetScene([token(CASTER, 30, 30), druid()]);
  await shift();
  await castOn("disintegrate", 6, DRUID, { amount: 40, outcome: "failed" });
  assert.deepEqual([hpOf(DRUID), formOf(DRUID), !!pillOf(DRUID, "Morto")], [[5, 40], undefined, false]);
});

test("W5c, G34: l'Interdizione del pannello guarda i PF veri: salva il druido dalla polvere a 1 PF", async () => {
  await resetScene([token(CASTER, 30, 30), druid(34, 40, { conditions: { version: 2, instances: [WARD] } })]);
  await shift();
  await castOn("disintegrate", 6, DRUID, { amount: 50, outcome: "failed" });
  assert.deepEqual([hpOf(DRUID), !!pillOf(DRUID, "Interdizione alla morte"), formOf(DRUID)], [[1, 40], false, undefined]);
});

test("W5c, G40: se l'eccesso porta il druido a 0, Disintegrazione lo riduce in polvere", async () => {
  await resetScene([token(CASTER, 30, 30), druid()]);
  await shift();
  await castOn("disintegrate", 6, DRUID, { amount: 50, outcome: "failed" });
  assert.deepEqual([hpOf(DRUID), formOf(DRUID), !!pillOf(DRUID, "Morto")], [[0, 40], undefined, true]);
});

test("W5b, §5.7: la concentrazione del druido resta se l'eccesso non lo porta a 0, finisce se sì", async () => {
  const concentrating = () => druid(34, 40, { [CONCENTRATION_KEY]: { spellId: "faerie-fire", instanceId: "ff-1", targets: [] } });
  await resetScene([concentrating()]);
  await shift();
  await damage(15, 0);
  assert.ok(Object.keys(meta(DRUID)[CONCENTRATION_KEY] || {}).length, "30/40: still concentrating");
  await resetScene([concentrating()]);
  await shift();
  await damage(45, 0);
  assert.deepEqual(meta(DRUID)[CONCENTRATION_KEY] || {}, {}, "0/40: the concentration ends");
});

test("W5d, G41: la memoria chiude la forma dal coordinatore: PF del registro, pill finita, nessun danno", async () => {
  const { endTransformationsForRestoredHp } = await import("../src/transformationHpRestore.js");
  await resetScene([druid()]);
  await shift();
  await endTransformationsForRestoredHp([{ itemId: DRUID, instanceId: formOf(DRUID).id, hp: 20, hpMax: 40,
    expectedFields: { hp: { present: true, value: 11 }, hpMax: { present: true, value: 11 } } }],
  { sceneEpoch: currentSceneEpoch() });
  await convergeDeferredEffectsHistory();
  assert.deepEqual([hpOf(DRUID), formOf(DRUID), !!pillOf(DRUID, "Privo di sensi")], [[20, 40], undefined, false]);
});

// Lotto W5e, decision G38: the party's rest ends the form and starts from the druid's own HP, in the rest's own command.
const { groupRestMembers, groupRestMemberSummary, planGroupRestHpWrites, planGroupRestPillEndings } = await import("../src/groupRestCore.js");
async function rest(longRest, recovered = {}) {
  const members = groupRestMembers(sceneState.items);
  const updates = planGroupRestHpWrites({ members, longRest, recovered, eventId: "rest-test" });
  await run([
    ...(updates.length ? [{ type: "hp:set", damageEnds: false, updates }] : []),
    ...planGroupRestPillEndings({ members, longRest }),
  ], "Riposo", members.map((member) => member.id));
  return { members, updates };
}

test("W5e, G38: il riposo lungo chiude la forma e porta il druido al suo massimo, non il lupo", async () => {
  await resetScene([druid(30, 40)]);
  await shift();
  await damage(6, 5);
  const { members, updates } = await rest(true);
  assert.deepEqual([hpOf(DRUID), formOf(DRUID)], [[40, 40], undefined]);
  assert.equal(groupRestMemberSummary(members[0], updates[0], { longRest: true }),
    "PF 30 → 40 · Forma Selvatica · Wolf: torna alla sua forma");
});

test("W5e, G38: il riposo breve parte dai PF del druido, anche senza PF recuperati", async () => {
  await resetScene([druid(30, 40)]);
  await shift();
  await rest(false, { [DRUID]: 6 });
  assert.deepEqual([hpOf(DRUID), formOf(DRUID)], [[36, 40], undefined]);
  await resetScene([druid(30, 40)]);
  await shift();
  await rest(false);
  assert.deepEqual([hpOf(DRUID), formOf(DRUID)], [[30, 40], undefined], "nothing recovered: its own 30/40, not the wolf's");
});

// Lotto W7: the spells of a form through the area panel, each target with the form of its row; the pill is the spell's,
// so it ends with the caster's concentration, and the coordinator swaps the hit points (W5).
const OGRE_FORM = { name: "Ogre", type: "giant", cr: "2", size: "large", hitPoints: { average: 59, formula: "7d10+21" },
  armorClass: 11, speeds: { walk: 12 }, actions: [] };
async function castForm(spellId, slotLevel, targetIds, forms, { outcomes, status = "applied" } = {}) {
  const contract = buildSpellUnifiedPanelContract({ spellId, phase: "cast", castContext: { slotLevel } });
  const command = buildSpellAreaResolutionCommand({
    contract, spellId, phase: "cast", casterId: CASTER, slotLevel, targetIds,
    ...(outcomes ? { outcomes } : {}),
    targetContexts: Object.fromEntries(Object.entries(forms).map(([id, form]) => [id, { form }])),
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
const spellPill = (id, label) => instances(id).find((entry) => entry.condition === label && entry.active !== false);

test("W7b: Metamorfosi su un orco ostile che fallisce: lupo 11/11, i suoi PF sulla pill; finita la concentrazione torna 30/30", async () => {
  await resetScene([token(CASTER, 30, 30), token("orc", 30, 30, { attitude: "enemy" })]);
  await castForm("polymorph", 4, ["orc"], { orc: WOLF }, { outcomes: { orc: "failed" } });
  const pill = spellPill("orc", "Metamorfosi");
  assert.deepEqual([pill.displayLabel, hpOf("orc"), pill.mechanics.transformation.stash, pill.mechanics.transformation.keepsMind],
    ["Metamorfosi · Wolf", [11, 11], { hp: 30, hpMax: 30 }, false]);
  assert.ok(Object.keys(meta(CASTER)[CONCENTRATION_KEY] || {}).length, "the caster concentrates");
  await run([{ type: "concentration:break", casterIds: [CASTER] }], "Concentrazione", [CASTER, "orc"]);
  assert.deepEqual([hpOf("orc"), spellPill("orc", "Metamorfosi")], [[30, 30], undefined]);
});

test("W7b: Metamorfosi superata non trasforma; su una creatura a 0 PF, e senza forma, il pannello lo dice", async () => {
  await resetScene([token(CASTER, 30, 30), token("orc", 30, 30, { attitude: "enemy" }), token("down", 0, 30, { attitude: "enemy" })]);
  await castForm("polymorph", 4, ["orc"], { orc: WOLF }, { outcomes: { orc: "passed" }, status: "noop" });
  assert.deepEqual([hpOf("orc"), spellPill("orc", "Metamorfosi")], [[30, 30], undefined]);
  const down = await castForm("polymorph", 4, ["down"], { down: WOLF }, { outcomes: { down: "failed" }, status: "rejected" })
    .catch((error) => error);
  assert.match(JSON.stringify(down), /a 0 PF: Metamorfosi non ha effetto/);
});

test("W7b: Metamorfosi vuole una bestia; Metamorfosi Pura accetta un altro tipo", async () => {
  await resetScene([token(CASTER, 30, 30), token("hero", 40, 40, { attitude: "pc",
    initiativeCard: { characterBuild: [{ classId: "guerriero", level: 5, subclassId: "" }] } })]);
  const refused = await castForm("polymorph", 4, ["hero"], { hero: OGRE_FORM }, { outcomes: { hero: "failed" }, status: "rejected" })
    .catch((error) => error);
  assert.match(JSON.stringify(refused), /forma non ammessa/);
  await castForm("true-polymorph", 9, ["hero"], { hero: { ...OGRE_FORM, cr: "2" } }, { outcomes: { hero: "failed" } });
  assert.deepEqual([spellPill("hero", "Metamorfosi Pura")?.displayLabel, hpOf("hero")], ["Metamorfosi Pura · Ogre", [59, 59]]);
});

test("W7d: Forme Animali su due creature, ognuna con la sua forma, senza TS", async () => {
  await resetScene([token(CASTER, 30, 30), token("a", 20, 20, { attitude: "pc" }), token("b", 25, 25, { attitude: "pc" })]);
  await castForm("animal-shapes", 8, ["a", "b"], { a: WOLF, b: BEAR });
  assert.deepEqual([spellPill("a", "Forme Animali")?.displayLabel, hpOf("a"), spellPill("b", "Forme Animali")?.displayLabel, hpOf("b")],
    ["Forme Animali · Wolf", [11, 11], "Forme Animali · Brown Bear", [34, 34]]);
});

test("W7a: Trasformazione su chi lancia; su un altro il pannello lo rifiuta", async () => {
  await resetScene([token(CASTER, 30, 30, { attitude: "pc", initiativeCard: { characterBuild: [{ classId: "mago", level: 17, subclassId: "" }] } }),
    token("ally", 20, 20, { attitude: "pc" })]);
  const wrong = await castForm("shapechange", 9, ["ally"], { ally: OGRE_FORM }, { status: "rejected" }).catch((error) => error);
  assert.match(JSON.stringify(wrong), /il bersaglio è chi lancia/);
  await castForm("shapechange", 9, [CASTER], { [CASTER]: OGRE_FORM });
  const pill = spellPill(CASTER, "Trasformazione");
  assert.deepEqual([pill?.displayLabel, hpOf(CASTER), pill?.mechanics.transformation.keepsMind, pill?.mechanics.transformation.canCast],
    ["Trasformazione · Ogre", [59, 59], true, true]);
});

// Lotto W7e (Xanathar, decisions of 16/11/2026): Mass Polymorph keeps the creature's hit points and gives it the form's as
// temporary ones, which no other source replaces; with none left, dead, or at the end of the spell, it is back.
const massPill = (id) => spellPill(id, "Metamorfosi di Massa");
const tempOf = (id) => meta(id).tempHp ?? 0;

test("W7e: Metamorfosi di Massa: PF temporanei della forma, i suoi PF restano; senza più PF temporanei torna normale", async () => {
  await resetScene([token(CASTER, 30, 30), token("orc", 30, 30, { attitude: "enemy" }),
    token("hero", 40, 40, { attitude: "pc", initiativeCard: { characterBuild: [{ classId: "guerriero", level: 5, subclassId: "" }] } })]);
  await castForm("xanathar-metamorfosi-di-massa", 9, ["orc", "hero"], { orc: WOLF, hero: WOLF });
  assert.deepEqual([hpOf("orc"), tempOf("orc"), meta("orc").tempHpSource, massPill("orc")?.displayLabel],
    [[30, 30], 11, massPill("orc")?.id, "Metamorfosi di Massa · Wolf"]);
  assert.equal(massPill("orc").mechanics.transformation.stash, undefined, "no hit points swapped");
  assert.deepEqual([hpOf("hero"), tempOf("hero")], [[40, 40], 11]);
  await run([{ type: "hp:set", updates: [{ itemId: "orc", hp: 30, hpMax: 30, tempHp: 6, hpIntent: { mode: "damage", amount: 5, eventId: "hit" } }] }],
    "Danno", ["orc"]);
  assert.deepEqual([hpOf("orc"), tempOf("orc"), !!massPill("orc")], [[30, 30], 6, true]);
  await run([{ type: "hp:set", updates: [{ itemId: "orc", hp: 26, hpMax: 30, tempHp: 0, hpIntent: { mode: "damage", amount: 10, eventId: "hit-2" } }] }],
    "Danno", ["orc"]);
  assert.deepEqual([hpOf("orc"), tempOf("orc"), massPill("orc")], [[26, 30], 0, undefined]);
});

test("W7e: i PF temporanei della forma non si sostituiscono con altri, e il registro dice perché", async () => {
  await resetScene([token(CASTER, 30, 30), token("orc", 30, 30, { attitude: "enemy" })]);
  await castForm("xanathar-metamorfosi-di-massa", 9, ["orc"], { orc: WOLF });
  const grant = await run([{ type: "hp:set", updates: [{ itemId: "orc", hp: 30, hpMax: 30, tempHp: 20, tempHpSourceId: "false-life",
    hpIntent: { mode: "temp", amount: 20, eventId: "grant" } }] }], "PF temporanei", ["orc"]);
  assert.deepEqual([tempOf("orc"), meta("orc").tempHpSource], [11, massPill("orc").id]);
  // Nothing changes, so no History entry: the writer reads why from its result (plan.reactionRecords).
  assert.deepEqual(grant.plan?.reactionRecords, [{ id: "orc", kind: "temp-hp-locked",
    text: "Metamorfosi di Massa · Wolf: i PF temporanei della forma non si sostituiscono con altri" }]);
  await run([{ type: "hp:set", updates: [{ itemId: "orc", hp: 30, hpMax: 30, tempHp: 4 }] }], "PF", ["orc"]);
  assert.equal(tempOf("orc"), 4, "lowering them by hand is allowed");
});

test("W7e: finita la concentrazione o morto, torna normale e i PF temporanei della forma se ne vanno", async () => {
  await resetScene([token(CASTER, 30, 30), token("orc", 30, 30, { attitude: "enemy" })]);
  await castForm("xanathar-metamorfosi-di-massa", 9, ["orc"], { orc: WOLF });
  await run([{ type: "concentration:break", casterIds: [CASTER] }], "Concentrazione", [CASTER, "orc"]);
  assert.deepEqual([hpOf("orc"), tempOf("orc"), massPill("orc")], [[30, 30], 0, undefined]);
  await resetScene([token(CASTER, 30, 30), token("orc", 30, 30, { attitude: "enemy" })]);
  await castForm("xanathar-metamorfosi-di-massa", 9, ["orc"], { orc: WOLF });
  await run([{ type: "hp:set", updates: [{ itemId: "orc", hp: 0, hpMax: 30, hpIntent: { mode: "damage", amount: 0, eventId: "pwk",
    instantDeath: true, deathDetail: "Parola del potere uccidere" } }] }], "Morte", ["orc"]);
  assert.deepEqual([!!spellPill("orc", "Morto"), massPill("orc"), tempOf("orc")], [true, undefined, 0]);
});

test("W7e: il limite è il GS del bersaglio, o metà del suo livello", async () => {
  await resetScene([token(CASTER, 30, 30),
    token("hero", 40, 40, { attitude: "pc", initiativeCard: { characterBuild: [{ classId: "guerriero", level: 1, subclassId: "" }] } })]);
  const refused = await castForm("xanathar-metamorfosi-di-massa", 9, ["hero"], { hero: BEAR }, { status: "rejected" }).catch((error) => error);
  assert.match(JSON.stringify(refused), /oltre metà del livello del bersaglio/);
});

// Decision G25: a boss mode, shared HP or HP not tracked keep their own; the pill is a label that says why.
test("G25: Metamorfosi su un boss, su due creature a PF condivisi e su un orco: solo l'orco prende i PF della forma", async () => {
  await resetScene([
    token("boss", 120, 120, { initiativeCard: { bossActionBinding: { profileId: "auril" } } }),
    token("link", 50, 50, { sharedHpSourceId: "pool" }), token("pool", 50, 50),
    token("orc", 15, 15),
  ]);
  const options = { type: "spell", spellId: "polymorph", displayLabel: "Metamorfosi · Wolf", effectDetail: "Wolf (bestia, GS 1/4).",
    expiry: { mode: "manual" }, manualRemoval: true,
    mechanics: { transformation: { kind: "polymorph", keepsMind: false, keepsFeatures: false, canCast: false, form: WOLF, formHp: 11 },
      movement: { walk: 12 } } };
  await run([{ type: "condition:add", targetIds: ["boss", "link", "orc"], conditionName: "Metamorfosi", options }],
    "Metamorfosi", ["boss", "link", "orc"]);
  assert.deepEqual([hpOf("boss"), hpOf("link"), hpOf("orc")], [[120, 120], [50, 50], [11, 11]]);
  assert.equal(pillOf("orc", "Metamorfosi").mechanics.transformation.stash.hp, 15);
  for (const [id, words] of [["boss", "modalità boss"], ["link", "PF condivisi"]]) {
    const pill = pillOf(id, "Metamorfosi");
    assert.equal(pill.mechanics, undefined, `${id}: nothing reads the form`);
    assert.ok(pill.effectDetail.startsWith(`Wolf (bestia, GS 1/4). Qui la forma resta un'etichetta (${words})`), pill.effectDetail);
    assert.equal(pill.displayLabel, "Metamorfosi · Wolf");
  }
});

// Decision G28: a new form while Shapechange or Animal Shapes lasts, from the attack console (transformationChangeRuntime.js).
const changeForm = async (sourceId, form) => {
  const { changeTransformationForm } = await import("../src/transformationChangeRuntime.js");
  const result = await changeTransformationForm({ sourceId, form }, { api: sdkStub, run: clientEffects.runEffectsMutation,
    requireApplied: clientEffects.requireAppliedEffectsMutation });
  await convergeDeferredEffectsHistory();
  return result;
};

test("G28: Trasformazione cambia forma: i PF non salgono sopra gli attuali, i suoi restano da parte; l'Annulla e la concentrazione", async () => {
  await resetScene([token(CASTER, 30, 30, { attitude: "pc", initiativeCard: { characterBuild: [{ classId: "mago", level: 17, subclassId: "" }] } })]);
  await castForm("shapechange", 9, [CASTER], { [CASTER]: OGRE_FORM });
  const parent = spellPill(CASTER, "Trasformazione").parentEffectId;
  await run([{ type: "hp:set", updates: [{ itemId: CASTER, hp: 40, hpMax: 59, hpIntent: { mode: "damage", amount: 19, eventId: "hit" } }] }],
    "Danno", [CASTER]);
  assert.equal((await changeForm(CASTER, BEAR)).label, "caster: Trasformazione · Brown Bear");
  let pill = spellPill(CASTER, "Trasformazione");
  assert.deepEqual([pill.displayLabel, hpOf(CASTER), pill.mechanics.transformation.stash, pill.parentEffectId],
    ["Trasformazione · Brown Bear", [34, 34], { hp: 30, hpMax: 30 }, parent]);
  assert.equal(instances(CASTER).filter((entry) => entry.condition === "Trasformazione").length, 1, "the old pill made way");
  await run([{ type: "hp:set", updates: [{ itemId: CASTER, hp: 20, hpMax: 34, hpIntent: { mode: "damage", amount: 14, eventId: "hit-2" } }] }],
    "Danno", [CASTER]);
  await changeForm(CASTER, OGRE_FORM);
  assert.deepEqual(hpOf(CASTER), [20, 59], "a form with more HP: the current ones stay");
  await undoLast();
  pill = spellPill(CASTER, "Trasformazione");
  assert.deepEqual([pill.displayLabel, hpOf(CASTER)], ["Trasformazione · Brown Bear", [20, 34]]);
  await run([{ type: "concentration:break", casterIds: [CASTER] }], "Concentrazione", [CASTER]);
  assert.deepEqual([hpOf(CASTER), spellPill(CASTER, "Trasformazione")], [[30, 30], undefined]);
});

test("G28: Forme Animali: la forma nuova arriva con i suoi PF interi; i limiti dell'incantesimo valgono ancora", async () => {
  await resetScene([token(CASTER, 30, 30), token("a", 20, 20, { attitude: "pc" })]);
  await castForm("animal-shapes", 8, ["a"], { a: WOLF });
  await run([{ type: "hp:set", updates: [{ itemId: "a", hp: 4, hpMax: 11, hpIntent: { mode: "damage", amount: 7, eventId: "hit" } }] }],
    "Danno", ["a"]);
  await changeForm("a", BEAR);
  assert.deepEqual([spellPill("a", "Forme Animali").displayLabel, hpOf("a"), spellPill("a", "Forme Animali").mechanics.transformation.stash],
    ["Forme Animali · Brown Bear", [34, 34], { hp: 20, hpMax: 20 }]);
  await assert.rejects(changeForm("a", OGRE_FORM), /Forma non ammessa/);
  await assert.rejects(changeForm(CASTER, WOLF), /Nessuna Trasformazione o Forme Animali attiva/);
});
