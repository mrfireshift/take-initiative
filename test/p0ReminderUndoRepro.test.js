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

const ID = "com.thebigpicture.initiative";
const META_KEY = `${ID}/meta`;
const STATE_KEY = `${ID}/state`;
const SPELLS_KEY = `${ID}/spells`;
const CONCENTRATION_KEY = `${ID}/concentration`;
const HISTORY_KEY = `${ID}/history`;

const clone = (value) => value === undefined ? undefined : structuredClone(value);
const scene = {
  ready: true,
  metadata: {},
  items: [],
};
const readyListeners = new Set();
const metadataListeners = new Set();
const broadcastListeners = new Map();

function itemsFor(ids) {
  if (typeof ids === "function") return scene.items.filter(ids).map(clone);
  const wanted = Array.isArray(ids) ? new Set(ids) : null;
  return scene.items.filter((item) => !wanted || wanted.has(item.id)).map(clone);
}

const sdkStub = {
  onReady() {},
  player: {
    getRole: async () => "GM",
    getId: async () => "gm",
  },
  room: { id: "p0-reminder-undo-room", getMetadata: async () => ({}) },
  scene: {
    isReady: async () => scene.ready,
    onReadyChange(listener) {
      readyListeners.add(listener);
      return () => readyListeners.delete(listener);
    },
    onMetadataChange(listener) {
      metadataListeners.add(listener);
      return () => metadataListeners.delete(listener);
    },
    getMetadata: async () => clone(scene.metadata),
    setMetadata: async (update) => {
      scene.metadata = { ...scene.metadata, ...clone(update) };
      for (const listener of metadataListeners) listener(clone(scene.metadata));
    },
    items: {
      getItems: async (ids) => itemsFor(ids),
      updateItems: async (ids, updater) => {
        const drafts = itemsFor(ids);
        await updater(drafts);
        const byId = new Map(drafts.map((item) => [item.id, item]));
        scene.items = scene.items.map((item) => byId.get(item.id) || item);
      },
      addItems: async (items) => { scene.items.push(...clone(items || [])); },
      deleteItems: async (ids) => {
        const wanted = new Set(ids || []);
        scene.items = scene.items.filter((item) => !wanted.has(item.id));
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
        listener({ data: clone(data) });
      }
    },
  },
};

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: sdkStub,
    buildLabel: () => ({ build: () => ({ id: "label" }) }),
    buildImage: () => ({ build: () => ({ id: "image" }) }),
    buildText: () => ({ build: () => ({ id: "text" }) }),
    buildShape: () => ({ build: () => ({ id: "shape" }) }),
    buildPath: () => ({ build: () => ({ id: "path" }) }),
    Command: class Command {},
  },
});

const clientEffects = await import("../src/effectsMutations.js?p0-reminder-client");
globalThis.location = { pathname: "/background.html" };
const backgroundEffects = await import("../src/effectsMutations.js?p0-reminder-background");
globalThis.location = { pathname: "/plugin.html" };
const baseEffects = await import("../src/effectsMutations.js?p0-reminder-base");

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

const history = await import("../src/history.js?p0-reminder-history");
const historyOwner = await import("../src/historyOwner.js?p0-reminder-owner");
const { currentSceneEpoch } = await import("../src/sceneEpoch.js");
const { reconcileOwnedSceneItems } = await import("../src/sceneItemReconcileCore.js?p0-reminder-reconcile");
const { planEffectSaveReminderNotices } = await import("../src/effectSaveReminderCore.js?p0-reminder-core");
const { SPELL_AURA_META_KEY } = await import("../src/spellAuraCore.js?p0-reminder-aura");
const { SPELL_STATIC_ZONE_META_KEY } = await import("../src/spellStaticZoneCore.js?p0-reminder-static");
const { zoneTriggerNoticeFromActivation } = await import("../src/zoneTriggerNoticeCore.js?p0-reminder-zone");
const { resolveReminder, clearReminderResolutionQueue } = await import("../src/reminderResolution.js?p0-reminder-resolver");
mock.module("../src/history.js", { exports: { ...history } });
const { buildSpellUnifiedPanelContract } = await import("../src/spellUnifiedPanelCore.js?p0-reminder-spell-panel");
const { buildSpellAreaResolutionCommand } = await import("../src/spellAreaResolutionCommandCore.js?p0-reminder-spell-command");
const { executeSpellAreaResolution } = await import("../src/spellAreaResolutionExecutor.js?p0-reminder-spell-executor");

const CASTER_ID = "p0-caster";
const TARGET_ID = "p0-target";
const INSTANCE_ID = "p0-immolation-instance";
const SPIRIT_GUARDIANS_INSTANCE_ID = "p0-spirit-guardians-instance";
const SPIRIT_GUARDIANS_AURA_ID = "p0-spirit-guardians-aura";

function createSceneItems() {
  return [
    {
      id: CASTER_ID,
      name: "Caster",
      metadata: {
        [META_KEY]: {
          hp: 50,
          hpMax: 50,
          conditions: [],
          [SPELLS_KEY]: [],
          [CONCENTRATION_KEY]: {
            immolazione: {
              instanceId: INSTANCE_ID,
              spellId: "xanathar-immolazione",
              name: "Immolazione",
              targets: [TARGET_ID],
            },
          },
        },
      },
    },
    {
      id: TARGET_ID,
      name: "Target",
      metadata: {
        [META_KEY]: {
          hp: 72,
          hpMax: 100,
          [SPELLS_KEY]: [{
            instanceId: INSTANCE_ID,
            spellId: "xanathar-immolazione",
            name: "Immolazione",
            casterId: CASTER_ID,
            conc: true,
          }],
          [CONCENTRATION_KEY]: {},
          conditions: [{
            id: INSTANCE_ID,
            condition: "In fiamme · 4d6 a fine turno",
            active: true,
            sourceId: CASTER_ID,
            parentEffectId: INSTANCE_ID,
            endsParentOnRemoval: true,
            spellId: "xanathar-immolazione",
            spellName: "Immolazione",
            saveReminder: {
              ability: "dex",
              timing: "turn-end",
              success: "remove-effect",
              failure: "keep-effect",
              damage: { dice: "4d6", type: "fuoco", onSave: "none" },
            },
          }],
        },
      },
    },
  ];
}

function createPreCastImmolationItems() {
  return [
    {
      id: CASTER_ID,
      name: "Caster",
      metadata: {
        [META_KEY]: {
          hp: 50,
          hpMax: 50,
          conditions: [],
          [SPELLS_KEY]: [],
          [CONCENTRATION_KEY]: {},
        },
      },
    },
    {
      id: TARGET_ID,
      name: "Target",
      metadata: {
        [META_KEY]: {
          hp: 100,
          hpMax: 100,
          conditions: [],
          [SPELLS_KEY]: [],
          [CONCENTRATION_KEY]: {},
        },
      },
    },
  ];
}

async function castProductiveImmolation() {
  const contract = buildSpellUnifiedPanelContract({ spellId: "xanathar-immolazione" });
  const command = buildSpellAreaResolutionCommand({
    contract,
    spellId: "xanathar-immolazione",
    phase: "cast",
    casterId: CASTER_ID,
    slotLevel: 5,
    targetIds: [TARGET_ID],
    outcomes: { [TARGET_ID]: "failed" },
    hpAmount: 28,
    validateSpatial: false,
  });
  return executeSpellAreaResolution(command);
}

function createZoneItems(kind) {
  const isAura = kind === "spirit-guardians";
  const instanceId = `${kind}-instance`;
  const zoneItemId = `${kind}-zone`;
  const activation = {
    id: `${kind}:save-on-turn-start:2:1:p0-target:1`,
    instanceId,
    ruleId: isAura ? "spirit-guardians:aura" : "cloudkill:cast",
    spellId: kind,
    casterId: CASTER_ID,
    zoneItemId,
    triggerId: isAura
      ? "spirit-guardians-save-on-turn-start"
      : "cloudkill-save-on-turn-start",
    event: "turn-start",
    resolution: "manual-save",
    ability: isAura ? "wis" : "con",
    damage: {
      dice: isAura ? "3d8" : "5d8",
      type: isAura ? "radiosi" : "veleno",
      onSave: "half",
    },
    targetIds: [TARGET_ID],
    turnKey: "2:1:p0-target",
    noticeTurnKey: "2:1:p0-target",
  };
  const zoneMetadata = {
    instanceId,
    ruleId: activation.ruleId,
    spellId: kind,
    casterId: CASTER_ID,
    ...(isAura ? {} : { role: "root" }),
    triggerRuntime: {
      initialized: true,
      pending: [activation],
      handledKeys: [],
      sequence: 1,
    },
  };
  return {
    activation,
    items: [
      {
        id: CASTER_ID,
        name: "Caster",
        metadata: { [META_KEY]: { initiativeCard: { spellSaveDC: 18 } } },
      },
      {
        id: TARGET_ID,
        name: "Target",
        metadata: {
          [META_KEY]: {
            hp: 100,
            hpMax: 100,
            conditions: [],
          },
        },
      },
      {
        id: zoneItemId,
        name: isAura ? "Aura: Guardiani Spirituali" : "Zona: Nube Mortale",
        metadata: {
          [isAura ? SPELL_AURA_META_KEY : SPELL_STATIC_ZONE_META_KEY]: zoneMetadata,
        },
      },
    ],
  };
}

function createConcentratedSpiritGuardiansItems() {
  const consumedActivation = {
    id: "spirit-guardians:save-on-entry:prior:p0-target",
    instanceId: SPIRIT_GUARDIANS_INSTANCE_ID,
    ruleId: "spirit-guardians:aura",
    spellId: "spirit-guardians",
    casterId: CASTER_ID,
    triggerId: "spirit-guardians-save-on-entry",
    event: "entry",
    resolution: "manual-save",
    ability: "wis",
    damage: { dice: "3d8", type: "radiosi", onSave: "half" },
    targetIds: [TARGET_ID],
    turnKey: "1:1:p0-target",
  };
  return {
    consumedActivation,
    items: [
      {
        id: CASTER_ID,
        name: "Caster",
        metadata: {
          [META_KEY]: {
            hp: 50,
            hpMax: 50,
            conditions: [],
            [SPELLS_KEY]: [],
            [CONCENTRATION_KEY]: {
              "spirit-guardians": {
                instanceId: SPIRIT_GUARDIANS_INSTANCE_ID,
                spellId: "spirit-guardians",
                name: "Guardiani Spirituali",
                targets: [TARGET_ID],
              },
            },
          },
        },
      },
      {
        id: TARGET_ID,
        name: "Target",
        metadata: {
          [META_KEY]: {
            hp: 50,
            hpMax: 50,
            conditions: [],
            [SPELLS_KEY]: [{
              instanceId: SPIRIT_GUARDIANS_INSTANCE_ID,
              spellId: "spirit-guardians",
              name: "Guardiani Spirituali",
              casterId: CASTER_ID,
              conc: true,
            }],
            [CONCENTRATION_KEY]: {},
          },
        },
      },
      {
        id: SPIRIT_GUARDIANS_AURA_ID,
        name: "Aura: Guardiani Spirituali",
        layer: "DRAWING",
        position: { x: 0, y: 0 },
        metadata: {
          [SPELL_AURA_META_KEY]: {
            instanceId: SPIRIT_GUARDIANS_INSTANCE_ID,
            ruleId: "spirit-guardians:aura",
            spellId: "spirit-guardians",
            casterId: CASTER_ID,
            triggerRuntime: {
              initialized: true,
              pending: [],
              handledKeys: [consumedActivation.id],
              sequence: 2,
            },
          },
        },
      },
    ],
  };
}

function consumedSpiritGuardiansHistoryEntry(activation) {
  return {
    id: "effects-history:prior-spirit-guardians-reminder",
    version: 4,
    at: history.createActionTimestamp(),
    kind: "reminder-resolution",
    label: "Risoluzione reminder Guardiani Spirituali",
    changes: [],
    effectsMutation: {
      version: 1,
      commandId: "prior-spirit-guardians-reminder",
      correlationId: "prior-spirit-guardians-reminder",
      commandType: "reminder-resolution",
      sceneEpoch: currentSceneEpoch(),
      sceneIdentity: null,
      targetIds: [SPIRIT_GUARDIANS_AURA_ID],
      fields: [],
      changes: [],
      sideEffects: [{
        id: SPIRIT_GUARDIANS_AURA_ID,
        type: "reminder-zone-activation",
        metadataKey: SPELL_AURA_META_KEY,
        activationId: activation.id,
        activation,
      }],
    },
  };
}

async function runConcentrationBreak(commandId, instanceId = SPIRIT_GUARDIANS_INSTANCE_ID) {
  return backgroundEffects.runEffectsMutation([{
    type: "concentration:break",
    casterIds: [CASTER_ID],
    reference: instanceId,
  }], {
    commandId,
    correlationId: commandId,
    kind: "concentration",
    label: "Interruzione concentrazione",
    targetIds: [CASTER_ID, TARGET_ID],
    sceneEpoch: currentSceneEpoch(),
    sideEffects: [{
      type: "static-zone:remove-ended",
      selectors: [{ instanceId }],
    }],
  });
}

async function appendHpEntry(label, hp) {
  await history.withItemMetaHistory({
    itemIds: [TARGET_ID],
    fields: ["hp"],
    label,
  }, async () => {
    await sdkStub.scene.items.updateItems([TARGET_ID], (drafts) => {
      drafts[0].metadata[META_KEY].hp = hp;
    });
  });
  const entries = await history.getHistoryEntries();
  return entries.at(-1);
}

test.before(async () => {
  globalThis.location = { pathname: "/background.html" };
  await historyOwner.mountHistoryOwner();
  await backgroundEffects.mountEffectsMutationCoordinatorService();
  globalThis.location = { pathname: "/plugin.html" };
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

test("P0 repro: Immolazione resolution does not permanently block prior Undo", async () => {
  scene.items = createSceneItems();
  scene.metadata = {
    [STATE_KEY]: { order: [CASTER_ID, TARGET_ID], current: 0, round: 1 },
    [HISTORY_KEY]: { version: 1, roomId: sdkStub.room.id, entries: [] },
  };
  clearReminderResolutionQueue();

  const first = await appendHpEntry("Action A", 71);
  const second = await appendHpEntry("Action B", 70);
  const notices = planEffectSaveReminderNotices({
    items: await sdkStub.scene.items.getItems(),
    previousInitiativeState: { round: 1, current: 1, order: [CASTER_ID, TARGET_ID] },
    initiativeState: { round: 2, current: 0, order: [CASTER_ID, TARGET_ID] },
    includeCurrentTurnStart: false,
  });
  const notice = notices.find((entry) => entry.spellName === "Immolazione");
  assert.ok(notice, "Immolazione reminder must be produced");

  const resolution = await resolveReminder({
    notice,
    outcome: "passed",
    damageRoll: 20,
    sceneEpoch: currentSceneEpoch(),
  });
  assert.equal(resolution.status, "applied");
  const immediateUndo = await history.undoHistoryThrough(undefined, {
    sceneEpoch: currentSceneEpoch(),
  });
  assert.equal(immediateUndo.status, "applied");
  assert.equal(immediateUndo[0].id, resolution.mutation.historyEntry.id);

  const entries = await history.getHistoryEntries();
  assert.deepEqual(entries.map((entry) => entry.id), [first.id, second.id]);

  const undonePrevious = await history.undoHistoryThrough(undefined, {
    sceneEpoch: currentSceneEpoch(),
  });
  assert.equal(undonePrevious[0].id, second.id);
});

test("P0 faithful cast chain: productive Immolazione resolution does not block cast Undo", async () => {
  scene.items = createPreCastImmolationItems();
  scene.metadata = {
    [STATE_KEY]: { order: [CASTER_ID, TARGET_ID], current: 0, round: 1 },
    [HISTORY_KEY]: { version: 1, roomId: sdkStub.room.id, entries: [] },
  };
  clearReminderResolutionQueue();

  const castResult = await castProductiveImmolation();
  assert.equal(castResult.status, "applied");
  const castEntries = await history.getHistoryEntries();
  assert.equal(castEntries.length, 1, "productive cast must create one History entry");
  const castEntry = castEntries[0];
  assert.match(castEntry.label, /Immolazione/);

  const second = await appendHpEntry("Action B", 70);
  const notices = planEffectSaveReminderNotices({
    items: await sdkStub.scene.items.getItems(),
    previousInitiativeState: { round: 1, current: 1, order: [CASTER_ID, TARGET_ID] },
    initiativeState: { round: 2, current: 0, order: [CASTER_ID, TARGET_ID] },
    includeCurrentTurnStart: false,
  });
  const notice = notices.find((entry) => entry.spellName === "Immolazione");
  assert.ok(notice, "productive cast must produce an effect-save reminder");

  const resolution = await resolveReminder({
    notice,
    outcome: "passed",
    damageRoll: 20,
    sceneEpoch: currentSceneEpoch(),
  });
  assert.equal(resolution.status, "applied");
  const immediateUndo = await history.undoHistoryThrough(undefined, {
    sceneEpoch: currentSceneEpoch(),
  });
  assert.equal(immediateUndo.status, "applied");
  assert.equal(immediateUndo[0].id, resolution.mutation.historyEntry.id);
  assert.deepEqual(
    (await history.getHistoryEntries()).map((entry) => entry.id),
    [castEntry.id, second.id],
  );

  const undonePrevious = await history.undoHistoryThrough(undefined, {
    sceneEpoch: currentSceneEpoch(),
  });
  assert.equal(undonePrevious.status, "applied");
  assert.equal(undonePrevious[0].id, second.id);
  const undoneCast = await history.undoHistoryThrough(castEntry.id, {
    sceneEpoch: currentSceneEpoch(),
  });
  assert.equal(undoneCast.status, "applied");
});

for (const kind of ["cloudkill", "spirit-guardians"]) {
  test(`P0 comparison: ${kind} zone resolution converges before prior Undo`, async () => {
    const zone = createZoneItems(kind);
    scene.items = zone.items;
    scene.metadata = {
      [STATE_KEY]: { order: [CASTER_ID, TARGET_ID], current: 0, round: 1 },
      [HISTORY_KEY]: { version: 1, roomId: sdkStub.room.id, entries: [] },
    };
    clearReminderResolutionQueue();

    const first = await appendHpEntry("Action A", 99);
    const second = await appendHpEntry("Action B", 98);
    const notice = zoneTriggerNoticeFromActivation(
      zone.activation,
      new Map(scene.items.map((item) => [item.id, item])),
    );
    assert.ok(notice, `${kind} reminder must be produced`);

    const resolution = await resolveReminder({
      notice,
      outcome: "passed",
      damageRoll: 20,
      sceneEpoch: currentSceneEpoch(),
    });
    assert.equal(resolution.status, "applied");
    const immediateUndo = await history.undoHistoryThrough(undefined, {
      sceneEpoch: currentSceneEpoch(),
    });
    assert.equal(immediateUndo.status, "applied");
    assert.equal(immediateUndo[0].id, resolution.mutation.historyEntry.id);
    assert.equal(resolution.mutation.commitResult.sideEffectChanges.length, 1);
    assert.equal(
      resolution.mutation.commitResult.sideEffectChanges[0].type,
      "reminder-zone-activation",
    );
    const afterUndo = scene.items.find((item) => item.id === zone.activation.zoneItemId);
    const restoredRuntime = afterUndo.metadata[
      kind === "spirit-guardians" ? SPELL_AURA_META_KEY : SPELL_STATIC_ZONE_META_KEY
    ].triggerRuntime;
    assert.deepEqual(restoredRuntime.pending.map((entry) => entry.id), [zone.activation.id]);

    const undonePrevious = await history.undoHistoryThrough(undefined, {
      sceneEpoch: currentSceneEpoch(),
    });
    assert.equal(undonePrevious.status, "applied");
    assert.equal(undonePrevious[0].id, second.id);
    assert.equal(first.id, (await history.getHistoryEntries()).at(-1)?.id);
  });
}

test("P0 regression: concentration break preserves mobile aura for chained Undo", async () => {
  const setup = createConcentratedSpiritGuardiansItems();
  scene.items = setup.items;
  scene.metadata = {
    [STATE_KEY]: { order: [CASTER_ID, TARGET_ID], current: 0, round: 1 },
    [HISTORY_KEY]: { version: 1, roomId: sdkStub.room.id, entries: [] },
  };
  clearReminderResolutionQueue();

  await history.recordEffectsMutationHistory({
    command: {
      commandId: "prior-spirit-guardians-reminder",
      correlationId: "prior-spirit-guardians-reminder",
    },
    historyEntry: consumedSpiritGuardiansHistoryEntry(setup.consumedActivation),
    sceneEpoch: currentSceneEpoch(),
  });

  const hpEntry = await appendHpEntry("HP prima della rottura concentrazione", 49);
  const breakResult = await runConcentrationBreak("p0-spirit-guardians-concentration-break");
  assert.equal(breakResult.status, "applied");

  const currentHistoryEntries = await history.getHistoryEntries();
  const breakEntry = currentHistoryEntries.at(-1);
  assert.ok(breakEntry, "concentration break must create a History entry");
  assert.ok(
    (breakEntry.effectsMutation?.sideEffects || [])
      .some((change) => change.id === SPIRIT_GUARDIANS_AURA_ID),
    "the concentration break History must retain the mobile aura snapshot",
  );

  await reconcileOwnedSceneItems({
    desired: [],
    readItems: () => sdkStub.scene.items.getItems(
      (item) => !!item?.metadata?.[SPELL_AURA_META_KEY],
    ),
    identityOfItem: (item) => item?.metadata?.[SPELL_AURA_META_KEY]?.instanceId,
    deleteItems: (ids) => sdkStub.scene.items.deleteItems(ids),
  });
  assert.equal(scene.items.some((item) => item.id === SPIRIT_GUARDIANS_AURA_ID), false);

  const undoBreak = await history.undoHistoryThrough(undefined, {
    sceneEpoch: currentSceneEpoch(),
  });
  assert.equal(undoBreak.status, "applied");
  assert.ok(scene.items.some((item) => item.id === SPIRIT_GUARDIANS_AURA_ID));

  const undoHp = await history.undoHistoryThrough(undefined, {
    sceneEpoch: currentSceneEpoch(),
  });
  assert.equal(undoHp.status, "applied");
  assert.equal(undoHp[0].id, hpEntry.id);

  const undoReminder = await history.undoHistoryThrough(undefined, {
    sceneEpoch: currentSceneEpoch(),
  });
  assert.equal(undoReminder.status, "applied");
  assert.equal(undoReminder[0].id, "effects-history:prior-spirit-guardians-reminder");
  const restoredAura = scene.items.find((item) => item.id === SPIRIT_GUARDIANS_AURA_ID);
  assert.deepEqual(
    restoredAura.metadata[SPELL_AURA_META_KEY].triggerRuntime.pending.map((entry) => entry.id),
    [setup.consumedActivation.id],
  );
});

test("P0 regression: concentration re-break removes and restores one aura without duplication", async () => {
  const setup = createConcentratedSpiritGuardiansItems();
  scene.items = setup.items;
  scene.metadata = {
    [STATE_KEY]: { order: [CASTER_ID, TARGET_ID], current: 0, round: 1 },
    [HISTORY_KEY]: { version: 1, roomId: sdkStub.room.id, entries: [] },
  };
  clearReminderResolutionQueue();

  const firstBreak = await runConcentrationBreak("p0-spirit-break-one");
  assert.equal(firstBreak.status, "applied");
  assert.equal(scene.items.some((item) => item.id === SPIRIT_GUARDIANS_AURA_ID), false);
  const firstEntry = (await history.getHistoryEntries()).at(-1);
  assert.ok(
    firstEntry.effectsMutation.sideEffects.some((change) => change.id === SPIRIT_GUARDIANS_AURA_ID),
  );

  const undoFirst = await history.undoHistoryThrough(undefined, {
    sceneEpoch: currentSceneEpoch(),
  });
  assert.equal(undoFirst.status, "applied");
  assert.equal(
    scene.items.filter((item) => item.id === SPIRIT_GUARDIANS_AURA_ID).length,
    1,
  );

  const secondBreak = await runConcentrationBreak("p0-spirit-break-two");
  assert.equal(secondBreak.status, "applied");
  assert.equal(scene.items.some((item) => item.id === SPIRIT_GUARDIANS_AURA_ID), false);
  const secondEntry = (await history.getHistoryEntries()).at(-1);
  assert.notEqual(secondEntry.id, firstEntry.id);
  assert.ok(
    secondEntry.effectsMutation.sideEffects.some((change) => change.id === SPIRIT_GUARDIANS_AURA_ID),
  );

  const undoSecond = await history.undoHistoryThrough(undefined, {
    sceneEpoch: currentSceneEpoch(),
  });
  assert.equal(undoSecond.status, "applied");
  assert.equal(
    scene.items.filter((item) => item.id === SPIRIT_GUARDIANS_AURA_ID).length,
    1,
  );
});

test("P0 regression: static-zone concentration child keeps its identity across Undo", async () => {
  const setup = createConcentratedSpiritGuardiansItems();
  const staticZoneId = "p0-spirit-guardians-static-zone";
  const aura = setup.items.find((item) => item.id === SPIRIT_GUARDIANS_AURA_ID);
  aura.id = staticZoneId;
  aura.name = "Zona: Guardiani Spirituali";
  aura.metadata = {
    [SPELL_STATIC_ZONE_META_KEY]: {
      ...aura.metadata[SPELL_AURA_META_KEY],
      role: "root",
    },
  };
  scene.items = setup.items;
  scene.metadata = {
    [STATE_KEY]: { order: [CASTER_ID, TARGET_ID], current: 0, round: 1 },
    [HISTORY_KEY]: { version: 1, roomId: sdkStub.room.id, entries: [] },
  };
  clearReminderResolutionQueue();

  const priorEntry = consumedSpiritGuardiansHistoryEntry(setup.consumedActivation);
  priorEntry.id = "effects-history:prior-static-zone-reminder";
  priorEntry.effectsMutation.commandId = "prior-static-zone-reminder";
  priorEntry.effectsMutation.correlationId = "prior-static-zone-reminder";
  priorEntry.effectsMutation.targetIds = [staticZoneId];
  priorEntry.effectsMutation.sideEffects[0] = {
    ...priorEntry.effectsMutation.sideEffects[0],
    id: staticZoneId,
    metadataKey: SPELL_STATIC_ZONE_META_KEY,
  };
  await history.recordEffectsMutationHistory({
    command: {
      commandId: "prior-static-zone-reminder",
      correlationId: "prior-static-zone-reminder",
    },
    historyEntry: priorEntry,
    sceneEpoch: currentSceneEpoch(),
  });

  const breakResult = await runConcentrationBreak("p0-static-concentration-break");
  assert.equal(breakResult.status, "applied");
  assert.equal(scene.items.some((item) => item.id === staticZoneId), false);

  const undoBreak = await history.undoHistoryThrough(undefined, {
    sceneEpoch: currentSceneEpoch(),
  });
  assert.equal(undoBreak.status, "applied");
  assert.equal(scene.items.filter((item) => item.id === staticZoneId).length, 1);
  assert.equal(
    scene.items.find((item) => item.id === staticZoneId).metadata[SPELL_STATIC_ZONE_META_KEY].instanceId,
    SPIRIT_GUARDIANS_INSTANCE_ID,
  );

  const undoReminder = await history.undoHistoryThrough(undefined, {
    sceneEpoch: currentSceneEpoch(),
  });
  assert.equal(undoReminder.status, "applied");
});

test("P0 regression: concentration without a scene child does not create a ghost item", async () => {
  const setup = createConcentratedSpiritGuardiansItems();
  scene.items = setup.items.filter((item) => item.id !== SPIRIT_GUARDIANS_AURA_ID);
  scene.metadata = {
    [STATE_KEY]: { order: [CASTER_ID, TARGET_ID], current: 0, round: 1 },
    [HISTORY_KEY]: { version: 1, roomId: sdkStub.room.id, entries: [] },
  };
  clearReminderResolutionQueue();

  const breakResult = await runConcentrationBreak("p0-concentration-without-child");
  assert.equal(breakResult.status, "applied");
  assert.equal(breakResult.commitResult.sideEffectChanges.length, 0);
  assert.equal(scene.items.some((item) => item.id === SPIRIT_GUARDIANS_AURA_ID), false);

  const undoBreak = await history.undoHistoryThrough(undefined, {
    sceneEpoch: currentSceneEpoch(),
  });
  assert.equal(undoBreak.status, "applied");
  assert.equal(scene.items.some((item) => item.id === SPIRIT_GUARDIANS_AURA_ID), false);
});
