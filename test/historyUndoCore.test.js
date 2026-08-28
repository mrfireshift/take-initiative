import test from "node:test";
import assert from "node:assert/strict";
import {
  buildHistoryUndoPlan,
  historyEntryMatchesUndoBefore,
  historyUndoItemMatches,
  historyUndoPlanConflicts,
} from "../src/historyUndoCore.js";

const META = "com.thebigpicture.initiative/meta";
const SPELLS = "com.thebigpicture.initiative/spells";
const CONCENTRATION = "com.thebigpicture.initiative/concentration";
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const snapshot = (value) => value === undefined
  ? { present: false }
  : { present: true, value };
const normalizeConditions = (value) => Array.isArray(value?.instances)
  ? value.instances
  : Array.isArray(value) ? value : [];
const objectOnlyNormalizeConditions = (value) => Array.isArray(value?.instances)
  ? value.instances
  : [];

function item(id, metadata = {}, position = { x: 1, y: 1 }) {
  return {
    id,
    name: id,
    position,
    metadata: { [META]: { ...metadata } },
  };
}

function plan(sceneItems, entries) {
  return buildHistoryUndoPlan({
    sceneItems,
    entryOrEntries: entries,
    metadataKey: META,
    effectKeys: {
      conditions: "conditions",
      spells: SPELLS,
      concentrations: CONCENTRATION,
    },
    normalizeConditions,
  });
}

function fieldEntry(id, field, before, after, entryId = `${id}-${field}`) {
  return {
    id: entryId,
    changes: [{ id, before: { [field]: snapshot(before) }, after: { [field]: snapshot(after) } }],
  };
}

function metadataOf(result, id) {
  return result.finalItems.find((entry) => entry.id === id)?.item?.metadata?.[META];
}

function contagionCondition({ successes, failures, remaining = 100798, id = "contagion-1" }) {
  return {
    id,
    condition: "Contagio · Carne putrefatta",
    active: true,
    sourceId: "caster",
    sourceName: "Anyanca",
    targetId: "hero",
    parentEffectId: "contagion-parent",
    type: "spell",
    effectId: "contagion-rotting-flesh",
    effectKind: "debuff",
    expiry: { mode: "rounds", remaining },
    summaryParts: [
      { id: "contagion-disease:rotting-flesh", label: "Carne putrefatta" },
      { id: "contagion-progress", label: `S ${successes}/3 · F ${failures}/3` },
    ],
    effectDetail: "Svantaggio alle prove di Carisma; vulnerabilità a tutti i danni.",
    mechanics: {
      contagionDiseaseId: "rotting-flesh",
      repeatedSaveProgress: {
        successes,
        failures,
        successThreshold: 3,
        failureThreshold: 3,
      },
    },
    manualRemoval: true,
    parentRemoval: "target",
    saveReminder: {
      ability: "con",
      timing: "turn-end",
      actor: "target",
      success: "keep-effect",
      dcSource: "source-spell",
      label: "Contagio: ripeti il TS Costituzione.",
    },
  };
}

function conditionMutationEntry(id, before, after, entryId) {
  return {
    id: entryId,
    effectsMutation: {
      changes: [{
        id,
        fields: { conditions: true },
        before: { conditions: before },
        after: { conditions: after },
      }],
    },
  };
}

test("ripristina un solo campo metadata e conserva i campi estranei", () => {
  const result = plan([item("a", { hp: 5, initiative: 18, foreign: { v: 2 } })], [
    fieldEntry("a", "hp", 10, 5),
  ]);
  assert.equal(result.status, undefined);
  assert.equal(metadataOf(result, "a").hp, 10);
  assert.equal(metadataOf(result, "a").initiative, 18);
  assert.deepEqual(metadataOf(result, "a").foreign, { v: 2 });
});

test("un live diverso dall'after produce conflict prima del piano", () => {
  const result = plan([item("a", { hp: 3 })], [fieldEntry("a", "hp", 10, 5, "entry-a")]);
  assert.equal(result.status, "conflict");
  assert.equal(result.conflicts[0].entryId, "entry-a");
  assert.equal(result.conflicts[0].itemId, "a");
  assert.equal(result.conflicts[0].field, "hp");
});

test("un campo estraneo modificato dopo l'azione non causa conflict", () => {
  const result = plan([item("a", { hp: 5, initiative: 20 })], [
    fieldEntry("a", "hp", 10, 5),
  ]);
  assert.equal(result.status, undefined);
  assert.equal(metadataOf(result, "a").initiative, 20);
});

test("un campo aggiunto torna assente senza confondere undefined e null", () => {
  const result = plan([item("a", { hp: 5, marker: null })], [
    fieldEntry("a", "marker", undefined, null),
  ]);
  assert.equal(result.status, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(metadataOf(result, "a"), "marker"), false);
});

test("un campo eliminato viene ripristinato anche se il valore è falsy", () => {
  const result = plan([item("a", { hp: 5 })], [
    fieldEntry("a", "zero", 0, undefined, "zero"),
  ]);
  assert.equal(result.status, undefined);
  assert.equal(metadataOf(result, "a").zero, 0);
});

test("null e campo assente restano stati distinti", () => {
  const result = plan([item("a", { hp: 5, marker: null })], [
    fieldEntry("a", "marker", null, undefined, "null-entry"),
  ]);
  assert.equal(result.status, "conflict");
});

test("un conflitto su un item blocca il batch multi-item", () => {
  const result = plan([
    item("a", { hp: 5 }),
    item("b", { hp: 3 }),
  ], [
    fieldEntry("a", "hp", 10, 5, "a-entry"),
    fieldEntry("b", "hp", 20, 5, "b-entry"),
  ]);
  assert.equal(result.status, "conflict");
  assert.equal(result.changes, undefined);
  assert.equal(result.conflicts.some((entry) => entry.itemId === "b"), true);
});

test("Undo-through simula newest verso oldest sullo stesso campo", () => {
  const result = plan([item("a", { hp: 3 })], [
    fieldEntry("a", "hp", 5, 3, "newer"),
    fieldEntry("a", "hp", 10, 5, "older"),
  ]);
  assert.equal(result.status, undefined);
  assert.equal(metadataOf(result, "a").hp, 10);
});

test("Undo-through incoerente produce conflict atomico", () => {
  const result = plan([item("a", { hp: 7 })], [
    fieldEntry("a", "hp", 5, 3, "newer"),
    fieldEntry("a", "hp", 10, 5, "older"),
  ]);
  assert.equal(result.status, "conflict");
});

test("entry multiple su campi diversi compone lo stato finale", () => {
  const result = plan([item("a", { hp: 5, initiative: 12, foreign: true })], [
    fieldEntry("a", "initiative", 18, 12, "initiative"),
    fieldEntry("a", "hp", 10, 5, "hp"),
  ]);
  assert.equal(result.status, undefined);
  assert.deepEqual(metadataOf(result, "a"), {
    hp: 10,
    initiative: 18,
    foreign: true,
  });
});

test("la posizione corrispondente viene ripristinata nel piano", () => {
  const entry = {
    id: "move",
    changes: [{
      id: "a",
      beforePosition: { x: 0, y: 0 },
      afterPosition: { x: 4, y: 4 },
    }],
  };
  const result = plan([item("a", { hp: 5 }, { x: 4, y: 4 })], [entry]);
  assert.deepEqual(result.finalItems[0].item.position, { x: 0, y: 0 });
});

test("una posizione modificata successivamente produce conflict", () => {
  const entry = {
    id: "move",
    changes: [{
      id: "a",
      beforePosition: { x: 0, y: 0 },
      afterPosition: { x: 4, y: 4 },
    }],
  };
  const result = plan([item("a", { hp: 5 }, { x: 8, y: 8 })], [entry]);
  assert.equal(result.status, "conflict");
  assert.equal(result.conflicts[0].field, "position");
});

test("un token mancante richiesto da metadata produce conflict", () => {
  const result = plan([], [fieldEntry("missing", "hp", 10, 5, "missing-entry")]);
  assert.equal(result.status, "conflict");
  assert.equal(result.conflicts[0].reason, "missing-item");
});

test("Undo della creazione elimina solo lo snapshot ancora invariato", () => {
  const created = item("created", { hp: 5 });
  const result = plan([created], [{
    id: "create",
    changes: [{ id: "created", sceneBefore: null, sceneAfter: created }],
  }]);
  assert.equal(result.status, undefined);
  assert.equal(result.finalItems[0].item, null);
});

test("Undo della creazione confligge con una modifica successiva", () => {
  const created = item("created", { hp: 5 });
  const changed = item("created", { hp: 4 });
  const result = plan([changed], [{
    id: "create",
    changes: [{ id: "created", sceneBefore: null, sceneAfter: created }],
  }]);
  assert.equal(result.status, "conflict");
  assert.equal(result.conflicts[0].reason, "scene-item-snapshot-mismatch");
});

test("Undo della cancellazione ripristina lo snapshot se l'ID è assente", () => {
  const deleted = item("deleted", { hp: 7 });
  const result = plan([], [{
    id: "delete",
    changes: [{ id: "deleted", sceneBefore: deleted, sceneAfter: null }],
  }]);
  assert.equal(result.status, undefined);
  assert.deepEqual(result.finalItems[0].item, deleted);
});

test("una collisione di ID impedisce il ripristino della cancellazione", () => {
  const deleted = item("deleted", { hp: 7 });
  const collision = item("deleted", { hp: 8 });
  const result = plan([collision], [{
    id: "delete",
    changes: [{ id: "deleted", sceneBefore: deleted, sceneAfter: null }],
  }]);
  assert.equal(result.status, "conflict");
});

test("batch misto metadata e lifecycle prepara un solo risultato finale", () => {
  const created = item("created", { hp: 2 });
  const result = plan([
    item("a", { hp: 5 }),
    created,
  ], [
    fieldEntry("a", "hp", 10, 5, "metadata"),
    { id: "create", changes: [{ id: "created", sceneBefore: null, sceneAfter: created }] },
  ]);
  assert.equal(result.status, undefined);
  assert.equal(metadataOf(result, "a").hp, 10);
  assert.equal(result.finalItems.find((entry) => entry.id === "created").item, null);
});

test("batch misto metadata e lifecycle fallisce senza piano se un item è stale", () => {
  const created = item("created", { hp: 2 });
  const result = plan([
    item("a", { hp: 3 }),
    created,
  ], [
    fieldEntry("a", "hp", 10, 5, "metadata"),
    { id: "create", changes: [{ id: "created", sceneBefore: null, sceneAfter: item("created", { hp: 4 }) }] },
  ]);
  assert.equal(result.status, "conflict");
  assert.equal(result.changes, undefined);
});

test("batch misto effects e non-effects blocca tutto su un conflict", () => {
  const result = plan([item("a", {
    hp: 5,
    conditions: { version: 1, instances: [{ id: "bless" }] },
  }), item("b", { hp: 2 })], [
    {
      id: "effects",
      effectsMutation: {
        changes: [{
          id: "a",
          fields: { conditions: true },
          before: { conditions: [] },
          after: { conditions: [{ id: "bless" }] },
        }],
      },
    },
    fieldEntry("b", "hp", 9, 2, "hp"),
  ]);
  assert.equal(result.status, undefined);
  assert.deepEqual(metadataOf(result, "a").conditions, undefined);
  assert.equal(metadataOf(result, "b").hp, 9);
});

test("un conflict effects in un batch misto non applica la parte HP simulata", () => {
  const result = plan([item("a", {
    hp: 5,
    conditions: { version: 1, instances: [{ id: "changed" }] },
  }), item("b", { hp: 2 })], [
    {
      id: "effects",
      effectsMutation: {
        changes: [{
          id: "a",
          fields: { conditions: true },
          before: { conditions: [] },
          after: { conditions: [{ id: "bless" }] },
        }],
      },
    },
    fieldEntry("b", "hp", 9, 2, "hp"),
  ]);
  assert.equal(result.status, "conflict");
  assert.equal(result.changes, undefined);
});

test("classFeatureState è un campo atomico e preserva l'iniziativa", () => {
  const result = plan([item("a", {
    classFeatureState: { rage: { uses: 1 } },
    initiative: 17,
  })], [fieldEntry(
    "a",
    "classFeatureState",
    { rage: { uses: 2 } },
    { rage: { uses: 1 } },
    "feature",
  )]);
  assert.equal(result.status, undefined);
  assert.deepEqual(metadataOf(result, "a").classFeatureState, { rage: { uses: 2 } });
  assert.equal(metadataOf(result, "a").initiative, 17);
});

test("la normalizzazione effects confronta l'ordine delle chiavi semanticamente", () => {
  const result = plan([item("a", {
    conditions: { version: 1, instances: [{ id: "c", expiry: { actor: "target", mode: "turn" } }] },
  })], [{
    id: "effects",
    effectsMutation: {
      changes: [{
        id: "a",
        fields: { conditions: true },
        before: { conditions: [] },
        after: { conditions: [{ id: "c", expiry: { mode: "turn", actor: "target" } }] },
      }],
    },
  }]);
  assert.equal(result.status, undefined);
});

test("Undo composito normalizza gli array di condizioni del piano effetti", () => {
  const unconscious = [
    { id: "zero-hp", condition: "Privo di sensi", active: true },
    { id: "prone", condition: "Prono", active: true },
  ];
  const result = buildHistoryUndoPlan({
    sceneItems: [item("a", {
      hp: 0,
      hpMax: 20,
      conditions: { version: 2, instances: unconscious },
    })],
    entryOrEntries: {
      id: "quick-hp-zero",
      effectsMutation: {
        changes: [{
          id: "a",
          fields: { conditions: true },
          before: { conditions: [] },
          after: { conditions: unconscious },
          metadataFields: { hp: true },
          beforeMetadata: { hp: snapshot(12) },
          afterMetadata: { hp: snapshot(0) },
        }],
      },
    },
    metadataKey: META,
    effectKeys: {
      conditions: "conditions",
      spells: SPELLS,
      concentrations: CONCENTRATION,
    },
    normalizeConditions: objectOnlyNormalizeConditions,
  });

  assert.equal(result.status, undefined);
  assert.equal(metadataOf(result, "a").hp, 12);
  assert.equal(metadataOf(result, "a").conditions, undefined);
});

test("historyUndoPlanConflicts considera solo i campi posseduti", () => {
  const result = plan([item("a", { hp: 5, foreign: 2 })], [fieldEntry("a", "hp", 10, 5)]);
  const live = item("a", { hp: 5, foreign: 3 });
  assert.deepEqual(historyUndoPlanConflicts(result, [live], { phase: "before" }), []);
});

test("un campo atomico modificato da un'altra azione viene segnalato con entry e item", () => {
  const result = plan([item("a", { classFeatureState: { uses: 1 } })], [fieldEntry(
    "a",
    "classFeatureState",
    { uses: 2 },
    { uses: 1 },
    "feature-entry",
  )]);
  const conflicts = historyUndoPlanConflicts(result, [item("a", { classFeatureState: { uses: 0 } })]);
  assert.equal(conflicts[0].entryId, "feature-entry");
  assert.equal(conflicts[0].itemId, "a");
});

test("la baseline comprende più token e mantiene l'ordine stabile degli ID", () => {
  const result = plan([
    item("b", { hp: 2 }),
    item("a", { hp: 4 }),
  ], [
    fieldEntry("a", "hp", 8, 4, "a"),
    fieldEntry("b", "hp", 6, 2, "b"),
  ]);
  assert.deepEqual(result.changedIds, ["a", "b"]);
});

test("un cambio posizione e metadata sullo stesso item resta field-scoped", () => {
  const result = plan([item("a", { hp: 5, initiative: 20 }, { x: 4, y: 4 })], [{
    id: "mixed",
    changes: [{
      id: "a",
      before: { hp: snapshot(10) },
      after: { hp: snapshot(5) },
      beforePosition: { x: 0, y: 0 },
      afterPosition: { x: 4, y: 4 },
    }],
  }]);
  assert.equal(result.status, undefined);
  assert.equal(metadataOf(result, "a").hp, 10);
  assert.equal(metadataOf(result, "a").initiative, 20);
  assert.deepEqual(result.finalItems[0].item.position, { x: 0, y: 0 });
});

test("il piano conserva gli snapshot iniziali e finali per il read-back", () => {
  const result = plan([item("a", { hp: 5 })], [fieldEntry("a", "hp", 10, 5)]);
  assert.equal(result.initialItems[0].item.metadata[META].hp, 5);
  assert.equal(result.finalItems[0].item.metadata[META].hp, 10);
});


test("History Undo confronta correttamente i draft Proxy di OBR senza DataCloneError", () => {
  const burning = {
    id: "immolation-burning-instance",
    condition: "In fiamme · 4d6 a fine turno",
    spellId: "xanathar-immolazione",
    spellName: "Immolazione",
    saveReminder: {
      ability: "dex",
      timing: "turn-end",
      success: "remove-effect",
      damage: { dice: "4d6", type: "fuoco", onSave: "none" },
    },
  };
  const concentration = {
    immolazione: {
      instanceId: "immolation-instance",
      spellId: "xanathar-immolazione",
      name: "Immolazione",
    },
  };

  // Replica il tipo di valori ricevuti dentro OBR.scene.items.updateItems:
  // metadata/istanze sono draft Immer (Proxy), che structuredClone rifiuta.
  const proxiedBurning = new Proxy(burning, {});
  const proxiedConcentration = new Proxy(concentration, {});
  const draft = {
    id: "target",
    metadata: {
      [META]: {
        conditions: { version: 1, instances: [proxiedBurning] },
        [CONCENTRATION]: proxiedConcentration,
      },
    },
  };

  const change = {
    id: "target",
    fields: { conditions: true, concentrations: true },
    before: { conditions: [], concentrations: {} },
    after: { conditions: [burning], concentrations: concentration },
  };

  assert.equal(historyUndoItemMatches(draft, change, {
    phase: "after",
    metadataKey: META,
    effectKeys: {
      conditions: "conditions",
      spells: SPELLS,
      concentrations: CONCENTRATION,
    },
    normalizeConditions,
  }), true);
});

test("il consumo di un reminder di aura è Undo scoped all'activation e tollera altri avanzamenti del triggerRuntime", () => {
  const AURA_KEY = "com.thebigpicture.initiative/spellAura";
  const activation = {
    id: "flame-turn-end-1",
    triggerId: "flame-investiture-damage-on-turn-end",
    targetIds: ["target"],
    turnKey: "1:1",
    damage: { dice: "1d10", type: "fuoco", onSave: "none" },
  };
  const target = item("target", { hp: 43, hpMax: 50 });
  const aura = {
    id: "aura-root",
    name: "Aura mobile: Investitura della Fiamma",
    position: { x: 0, y: 0 },
    metadata: {
      [AURA_KEY]: {
        instanceId: "flame-instance",
        triggerRuntime: {
          initialized: true,
          memberIds: ["target"],
          evaluatedTurnKey: "1:2",
          evaluatedActorId: "ally",
          handledKeys: ["turn:1:1:flame-investiture-damage-on-turn-end:target"],
          pending: [],
          sequence: 9,
        },
      },
    },
  };
  const entry = {
    id: "history-flame-turn-end",
    effectsMutation: {
      changes: [{
        id: "target",
        metadataFields: { hp: true },
        beforeMetadata: { hp: snapshot(50) },
        afterMetadata: { hp: snapshot(43) },
      }],
      sideEffects: [{
        id: "aura-root",
        type: "reminder-zone-activation",
        metadataKey: AURA_KEY,
        activationId: activation.id,
        activation,
      }],
    },
  };

  const result = plan([target, aura], [entry]);
  assert.equal(result.status, undefined);
  const restoredTarget = result.finalItems.find((row) => row.id === "target")?.item;
  const restoredAura = result.finalItems.find((row) => row.id === "aura-root")?.item;
  assert.equal(restoredTarget.metadata[META].hp, 50);
  assert.equal(
    restoredAura.metadata[AURA_KEY].triggerRuntime.evaluatedTurnKey,
    "1:2",
    "Undo must preserve runtime fields advanced after the reminder",
  );
  assert.equal(restoredAura.metadata[AURA_KEY].triggerRuntime.sequence, 9);
  assert.deepEqual(
    restoredAura.metadata[AURA_KEY].triggerRuntime.pending,
    [activation],
    "Undo must restore only the consumed activation",
  );

  const auraChange = result.changes.find((change) => change.id === "aura-root");
  assert.equal(auraChange.zoneTriggerActivations.length, 1);
  assert.equal(historyUndoItemMatches(aura, auraChange, {
    phase: "before",
    metadataKey: META,
    effectKeys: { conditions: "conditions", spells: SPELLS, concentrations: CONCENTRATION },
    normalizeConditions,
  }), true);
  assert.equal(historyUndoItemMatches(restoredAura, auraChange, {
    phase: "after",
    metadataKey: META,
    effectKeys: { conditions: "conditions", spells: SPELLS, concentrations: CONCENTRATION },
    normalizeConditions,
  }), true);
});

test("technical item cambia solo runtime bookkeeping -> Undo PASS; normale token modificato -> Undo CONFLICT", () => {
  const STATIC_ZONE_KEY = "com.thebigpicture.initiative/spellStaticZone";
  // Technical item created in history
  const technicalCreated = {
    id: "zone-1",
    name: "Spirit Guardians",
    layer: "DRAWING",
    position: { x: 100, y: 100 },
    metadata: {
      [STATIC_ZONE_KEY]: {
        instanceId: "inst-sg-1",
        spellId: "spirit-guardians",
        ruleId: "sg:zone",
        role: "root",
        triggerRuntime: { sequence: 1 },
      },
    },
  };
  const createEntry = {
    id: "hist-create-zone",
    effectsMutation: {
      changes: [{
        id: "zone-1",
        lifecycle: {
          before: null,
          after: clone(technicalCreated),
        },
      }],
    },
  };
  // In live scene, technical item's runtime trigger advanced (bookkeeping only)
  const technicalLive = {
    ...technicalCreated,
    metadata: {
      ...technicalCreated.metadata,
      [STATIC_ZONE_KEY]: {
        ...technicalCreated.metadata[STATIC_ZONE_KEY],
        triggerRuntime: { sequence: 5, pending: [] },
      },
    },
  };
  const passResult = plan([technicalLive], [createEntry]);
  assert.equal(passResult.status, undefined, "Technical item runtime bookkeeping change must not block Undo");
  assert.equal(passResult.finalItems.find((e) => e.id === "zone-1")?.item, null);

  // Normal user token created in history
  const tokenCreated = {
    id: "token-user",
    name: "Goblin",
    layer: "CHARACTER",
    position: { x: 50, y: 50 },
    metadata: { [META]: { hp: 10, hpMax: 10 } },
  };
  const tokenCreateEntry = {
    id: "hist-create-token",
    effectsMutation: {
      changes: [{
        id: "token-user",
        lifecycle: {
          before: null,
          after: clone(tokenCreated),
        },
      }],
    },
  };
  // Normal token was modified in scene after creation (e.g. name or position changed)
  const tokenModifiedLive = {
    ...tokenCreated,
    name: "Goblin Leader",
    position: { x: 80, y: 80 },
  };
  const conflictResult = plan([tokenModifiedLive], [tokenCreateEntry]);
  assert.equal(conflictResult.status, "conflict", "Normal scene item modified after creation must trigger CONFLICT");
  assert.equal(conflictResult.conflicts[0].reason, "scene-item-snapshot-mismatch");
});

test("granular conditions: azione modifica Condizione A; riconciliatore history:false aggiunge Condizione B -> Undo rimuove A e preserva B", () => {
  const condA = { id: "inst-a", condition: "Accecato", name: "Accecato" };
  const condB = { id: "inst-b", condition: "Spaventato", name: "Spaventato" };
  const targetToken = item("hero", {
    hp: 20,
    conditions: { version: 1, instances: [clone(condA), clone(condB)] }, // Live scene has both A and B
  });
  // Action only added Cond A (before was empty, after had Cond A)
  const entry = {
    id: "hist-add-a",
    effectsMutation: {
      changes: [{
        id: "hero",
        fields: { conditions: true },
        before: { conditions: [] },
        after: { conditions: [clone(condA)] },
      }],
    },
  };
  const result = plan([targetToken], [entry]);
  assert.equal(result.status, undefined, "Unowned Condition B must not cause false conflict");
  const finalMeta = result.finalItems.find((e) => e.id === "hero")?.item?.metadata?.[META];
  const finalConds = finalMeta.conditions.instances;
  assert.equal(finalConds.length, 1);
  assert.equal(finalConds[0].id, "inst-b", "Condition B must be preserved while Condition A is removed");
});

test("granular conditions: azione modifica Condizione A; modifica successiva altera Condizione A -> Undo segnala CONFLICT", () => {
  const condA = { id: "inst-a", condition: "Accecato", name: "Accecato", value: 1 };
  const condAModified = { id: "inst-a", condition: "Accecato", name: "Accecato", value: 2 };
  const targetToken = item("hero", {
    hp: 20,
    conditions: { version: 1, instances: [clone(condAModified)] },
  });
  const entry = {
    id: "hist-add-a",
    effectsMutation: {
      changes: [{
        id: "hero",
        fields: { conditions: true },
        before: { conditions: [] },
        after: { conditions: [clone(condA)] },
      }],
    },
  };
  const result = plan([targetToken], [entry]);
  assert.equal(result.status, "conflict", "Direct modification of owned Condition A must CONFLICT");
  assert.equal(result.conflicts[0].field, "conditions");
});

test("granular conditions: update con solo drift temporale preserva remaining live durante Undo", () => {
  const before = contagionCondition({ successes: 1, failures: 0 });
  const after = contagionCondition({ successes: 2, failures: 0 });
  const current = contagionCondition({ successes: 2, failures: 0, remaining: 100797 });
  const result = plan([item("hero", {
    conditions: { version: 2, instances: [current] },
  })], [conditionMutationEntry("hero", [before], [after], "contagion-success-2")]);

  assert.equal(result.status, undefined);
  const restored = metadataOf(result, "hero").conditions.instances[0];
  assert.equal(restored.mechanics.repeatedSaveProgress.successes, 1);
  assert.equal(restored.mechanics.repeatedSaveProgress.failures, 0);
  assert.equal(restored.expiry.remaining, 100797);
});

test("granular conditions: un conflitto semantico resta bloccato anche con lo stesso drift temporale", () => {
  const before = contagionCondition({ successes: 1, failures: 0 });
  const after = contagionCondition({ successes: 2, failures: 0 });
  const current = contagionCondition({ successes: 3, failures: 0, remaining: 100797 });
  const result = plan([item("hero", {
    conditions: { version: 2, instances: [current] },
  })], [conditionMutationEntry("hero", [before], [after], "contagion-success-2")]);

  assert.equal(result.status, "conflict");
  assert.equal(result.conflicts[0].field, "conditions");
  assert.equal(result.conflicts[0].reason, "current-value-mismatch");
});

test("granular conditions: expiry realmente modificata resta strict e viene ripristinata", () => {
  const before = contagionCondition({ successes: 1, failures: 0, remaining: 100798 });
  const after = contagionCondition({ successes: 2, failures: 0, remaining: 100797 });
  const current = contagionCondition({ successes: 2, failures: 0, remaining: 100797 });
  const result = plan([item("hero", {
    conditions: { version: 2, instances: [current] },
  })], [conditionMutationEntry("hero", [before], [after], "contagion-expiry-update")]);

  assert.equal(result.status, undefined);
  assert.equal(metadataOf(result, "hero").conditions.instances[0].expiry.remaining, 100798);

  const staleCurrent = contagionCondition({ successes: 2, failures: 0, remaining: 100796 });
  const conflict = plan([item("hero", {
    conditions: { version: 2, instances: [staleCurrent] },
  })], [conditionMutationEntry("hero", [before], [after], "contagion-expiry-update")]);
  assert.equal(conflict.status, "conflict");
});

test("granular conditions: add con countdown avanzato resta annullabile", () => {
  const after = contagionCondition({ successes: 0, failures: 0 });
  const current = contagionCondition({ successes: 0, failures: 0, remaining: 100797 });
  const result = plan([item("hero", {
    conditions: { version: 2, instances: [current] },
  })], [conditionMutationEntry("hero", [], [after], "contagion-add")]);

  assert.equal(result.status, undefined);
  assert.deepEqual(metadataOf(result, "hero").conditions, undefined);
});

test("granular conditions: remove conserva il conflitto su una condition ricreata", () => {
  const before = contagionCondition({ successes: 1, failures: 0 });
  const recreated = contagionCondition({ successes: 2, failures: 0, remaining: 100797 });
  const result = plan([item("hero", {
    conditions: { version: 2, instances: [recreated] },
  })], [conditionMutationEntry("hero", [before], [], "contagion-remove")]);

  assert.equal(result.status, "conflict");
  assert.equal(result.conflicts[0].field, "conditions");
});

test("granular conditions: due Undo consecutivi di Contagio preservano il countdown live", () => {
  const s0 = contagionCondition({ successes: 0, failures: 0, remaining: 100800 });
  const s1 = contagionCondition({ successes: 1, failures: 0, remaining: 100800 });
  const s2 = contagionCondition({ successes: 2, failures: 0, remaining: 100800 });
  const first = conditionMutationEntry("hero", [s0], [s1], "contagion-success-1");
  const second = conditionMutationEntry("hero", [s1], [s2], "contagion-success-2");

  const afterSecondSave = plan([item("hero", {
    conditions: {
      version: 2,
      instances: [{ ...s2, expiry: { mode: "rounds", remaining: 100797 } }],
    },
  })], [second]);
  assert.equal(afterSecondSave.status, undefined);
  const afterFirstUndo = afterSecondSave.finalItems.find((entry) => entry.id === "hero").item;
  const firstUndo = plan([afterFirstUndo], [first]);
  assert.equal(firstUndo.status, undefined);
  const restored = metadataOf(firstUndo, "hero").conditions.instances[0];
  assert.equal(restored.mechanics.repeatedSaveProgress.successes, 0);
  assert.equal(restored.expiry.remaining, 100797);
});



test("granular conditions: dynamic area membership recreated with new instance id remains undoable", () => {
  const castMembership = {
    id: "cloudkill-old",
    condition: "Accecato",
    active: true,
    targetId: "hero",
    sourceId: "caster",
    parentEffectId: "spell-cloudkill-1",
    type: "spell",
    effectId: "cloudkill-obscured",
    expiry: { mode: "manual" },
    createdAt: 1000,
  };
  const reconciledMembership = {
    ...clone(castMembership),
    id: "cloudkill-new",
    createdAt: 2000,
  };
  const targetToken = item("hero", {
    hp: 20,
    conditions: { version: 1, instances: [reconciledMembership] },
  });
  const entry = {
    id: "hist-cloudkill-cast",
    effectsMutation: {
      changes: [{
        id: "hero",
        fields: { conditions: true },
        before: { conditions: [] },
        after: { conditions: [castMembership] },
      }],
    },
  };
  const result = plan([targetToken], [entry]);
  assert.equal(result.status, undefined, "Recreated membership owned by same spell/effect must not conflict");
  const finalMeta = result.finalItems.find((e) => e.id === "hero")?.item?.metadata?.[META];
  assert.equal(finalMeta?.conditions, undefined, "Undo cast must remove the current recreated membership instance");
});

test("granular conditions: dynamic area membership with changed owned mechanics still conflicts", () => {
  const castMembership = {
    id: "cloudkill-old",
    condition: "Accecato",
    active: true,
    targetId: "hero",
    sourceId: "caster",
    parentEffectId: "spell-cloudkill-1",
    type: "spell",
    effectId: "cloudkill-obscured",
    mechanics: { test: 1 },
    expiry: { mode: "manual" },
    createdAt: 1000,
  };
  const changedMembership = {
    ...clone(castMembership),
    id: "cloudkill-new",
    createdAt: 2000,
    mechanics: { test: 2 },
  };
  const targetToken = item("hero", {
    hp: 20,
    conditions: { version: 1, instances: [changedMembership] },
  });
  const entry = {
    id: "hist-cloudkill-cast",
    effectsMutation: {
      changes: [{
        id: "hero",
        fields: { conditions: true },
        before: { conditions: [] },
        after: { conditions: [castMembership] },
      }],
    },
  };
  const result = plan([targetToken], [entry]);
  assert.equal(result.status, "conflict", "A real mutation of owned membership semantics must remain a conflict");
  assert.equal(result.conflicts[0].field, "conditions");
});
test("static-zone-move: movimento zona con successivo avanzamento del triggerRuntime -> Undo move PASS", () => {
  const STATIC_ZONE_KEY = "com.thebigpicture.initiative/spellStaticZone";
  const zoneToken = {
    id: "sz-1",
    name: "Wall of Fire",
    position: { x: 300, y: 300 }, // Live position is afterPosition
    metadata: {
      [STATIC_ZONE_KEY]: {
        instanceId: "wof-1",
        ruleId: "wof:move",
        triggerRuntime: { evaluatedTurnKey: "2:1", sequence: 10 }, // advanced runtime
      },
    },
  };
  const moveEntry = {
    id: "hist-move-wof",
    effectsMutation: {
      sideEffects: [{
        id: "sz-1",
        type: "static-zone-move",
        metadataKey: STATIC_ZONE_KEY,
        instanceId: "wof-1",
        beforePosition: { x: 100, y: 100 },
        afterPosition: { x: 300, y: 300 },
      }],
    },
  };
  const result = plan([zoneToken], [moveEntry]);
  assert.equal(result.status, undefined);
  const revertedZone = result.finalItems.find((e) => e.id === "sz-1")?.item;
  assert.deepEqual(revertedZone.position, { x: 100, y: 100 }, "Position must be reverted to beforePosition");
  assert.equal(revertedZone.metadata[STATIC_ZONE_KEY].triggerRuntime.sequence, 10, "triggerRuntime must be preserved");
});

test("token:teleport: side-effect in mutazione composita -> Undo PASS", () => {
  const tokenToTeleport = item("wizard", { hp: 15 }, { x: 500, y: 500 });
  const compositeEntry = {
    id: "hist-teleport-damage",
    effectsMutation: {
      changes: [{
        id: "wizard",
        metadataFields: { hp: true },
        beforeMetadata: { hp: snapshot(25) },
        afterMetadata: { hp: snapshot(15) },
      }],
      sideEffects: [{
        id: "wizard",
        type: "token:teleport",
        beforePosition: { x: 100, y: 100 },
        afterPosition: { x: 500, y: 500 },
      }],
    },
  };
  const result = plan([tokenToTeleport], [compositeEntry]);
  assert.equal(result.status, undefined);
  const restored = result.finalItems.find((e) => e.id === "wizard")?.item;
  assert.equal(restored.metadata[META].hp, 25, "HP reverted");
  assert.deepEqual(restored.position, { x: 100, y: 100 }, "Position reverted");
});




test("granular spells: runtime turn countdown history:false does not block Undo of the cast", () => {
  const cloudkill = {
    id: "cloudkill-entry",
    name: "Nube mortale",
    turns: 100,
    casterId: "caster",
    conc: true,
    instanceId: "cloudkill-instance",
    spellId: "cloudkill",
    appliedAt: { round: 2, actorId: "caster", phase: "turn", turnKey: "2:0:caster" },
    castContext: { staticZoneOwner: true, staticZoneRuleId: "cloudkill:cast", slotLevel: 5 },
    expiry: { mode: "concentration" },
  };
  const progressed = { ...clone(cloudkill), turns: 99 };
  const caster = item("caster", { hp: 20, [SPELLS]: [progressed] });
  const entry = {
    id: "hist-cloudkill-cast-turn-progress",
    effectsMutation: {
      changes: [{
        id: "caster",
        fields: { spells: true },
        before: { spells: [] },
        after: { spells: [cloudkill] },
      }],
    },
  };

  const result = plan([caster], [entry]);
  assert.equal(result.status, undefined, "Automatic round countdown must not stale the cast entry");
  const finalMeta = result.finalItems.find((e) => e.id === "caster")?.item?.metadata?.[META];
  assert.deepEqual(finalMeta?.[SPELLS] || [], [], "Undo cast must remove the progressed spell instance");
});

test("granular spells: unrelated spell is preserved while undoing a progressed cast", () => {
  const cloudkill = {
    id: "cloudkill-entry", name: "Nube mortale", turns: 100, casterId: "caster", conc: true,
    instanceId: "cloudkill-instance", spellId: "cloudkill", expiry: { mode: "concentration" },
  };
  const unrelated = {
    id: "other-entry", name: "Armatura magica", turns: 20, casterId: "caster", conc: false,
    instanceId: "armor-instance", spellId: "mage-armor", expiry: { mode: "rounds" },
  };
  const caster = item("caster", { hp: 20, [SPELLS]: [{ ...clone(cloudkill), turns: 99 }, unrelated] });
  const entry = {
    id: "hist-cloudkill-cast-preserve-other",
    effectsMutation: { changes: [{
      id: "caster", fields: { spells: true }, before: { spells: [] }, after: { spells: [cloudkill] },
    }] },
  };
  const result = plan([caster], [entry]);
  assert.equal(result.status, undefined);
  const finalSpells = result.finalItems.find((e) => e.id === "caster")?.item?.metadata?.[META]?.[SPELLS] || [];
  assert.equal(finalSpells.length, 1);
  assert.equal(finalSpells[0].instanceId, "armor-instance");
});

test("granular spells: semantic change to the owned spell still conflicts", () => {
  const cloudkill = {
    id: "cloudkill-entry", name: "Nube mortale", turns: 100, casterId: "caster", conc: true,
    instanceId: "cloudkill-instance", spellId: "cloudkill",
    castContext: { staticZoneOwner: true, staticZoneRuleId: "cloudkill:cast", slotLevel: 5 },
    expiry: { mode: "concentration" },
  };
  const changed = {
    ...clone(cloudkill),
    turns: 99,
    castContext: { ...cloudkill.castContext, slotLevel: 6 },
  };
  const caster = item("caster", { hp: 20, [SPELLS]: [changed] });
  const entry = {
    id: "hist-cloudkill-cast-semantic-change",
    effectsMutation: { changes: [{
      id: "caster", fields: { spells: true }, before: { spells: [] }, after: { spells: [cloudkill] },
    }] },
  };
  const result = plan([caster], [entry]);
  assert.equal(result.status, "conflict");
  assert.equal(result.conflicts[0].field, "spells");
});

test("granular terminal spell: accumulo e pending expiry non bloccano Undo del cast", () => {
  const terminalResolution = {
    kind: "delayed-blast-fireball",
    accumulation: {
      mode: "turn-end",
      actor: "caster",
      max: 10,
      path: ["delayedBlastFireball", "accumulatedDice"],
    },
  };
  const castContext = {
    slotLevel: 7,
    delayedBlastFireball: {
      baseDice: 12,
      accumulatedDice: 0,
      position: { x: 10, y: 20 },
    },
    terminalResolution,
  };
  const castSpell = {
    id: "dbf-entry",
    name: "Palla di fuoco ritardata",
    spellId: "delayed-blast-fireball",
    turns: 10,
    casterId: "caster",
    conc: true,
    instanceId: "dbf-instance",
    castContext,
    expiry: { mode: "concentration" },
    summaryParts: [{ id: "dbf-damage", label: "12d6 fuoco" }],
  };
  const liveSpell = {
    ...clone(castSpell),
    turns: 12,
    castContext: {
      ...castContext,
      delayedBlastFireball: { ...castContext.delayedBlastFireball, accumulatedDice: 10 },
    },
    summaryParts: [{ id: "dbf-damage", label: "22d6 fuoco" }],
  };
  const liveConcentration = {
    name: castSpell.name,
    spellId: castSpell.spellId,
    instanceId: castSpell.instanceId,
    targets: ["caster"],
    castContext: liveSpell.castContext,
    pendingTermination: {
      instanceId: castSpell.instanceId,
      reason: "expiry",
      requestId: "temporal:dbf:expiry",
      terminalResolution,
    },
  };
  const entry = {
    id: "hist-dbf-cast",
    effectsMutation: {
      changes: [{
        id: "caster",
        fields: { spells: true, concentrations: true },
        before: { spells: [], concentrations: {} },
        after: {
          spells: [castSpell],
          concentrations: { "delayed-blast-fireball": {
            name: castSpell.name,
            spellId: castSpell.spellId,
            instanceId: castSpell.instanceId,
            targets: ["caster"],
            castContext,
          } },
        },
      }],
    },
  };
  const result = plan([item("caster", {
    [SPELLS]: [liveSpell],
    [CONCENTRATION]: { "delayed-blast-fireball": liveConcentration },
  })], [entry]);
  assert.equal(result.status, undefined);
  const restored = metadataOf(result, "caster");
  assert.deepEqual(restored?.[SPELLS] || [], []);
  assert.deepEqual(restored?.[CONCENTRATION] || {}, {});
});

test("token:teleport: Undo durante la stessa animazione pending accetta beforePosition solo con operationId corrispondente", () => {
  const token = { id: "tele-pending", name: "Mago", position: { x: 0, y: 0 }, visible: true, metadata: { [META]: {} } };
  const entry = {
    id: "hist-tele-pending",
    effectsMutation: {
      commandId: "tele-op-1",
      changes: [],
      sideEffects: [{
        id: "tele-pending",
        type: "token:teleport",
        operationId: "tele-op-1",
        beforePosition: { x: 0, y: 0 },
        afterPosition: { x: 300, y: 300 },
      }],
    },
  };
  const result = buildHistoryUndoPlan({
    sceneItems: [token],
    entryOrEntries: [entry],
    metadataKey: META,
    effectKeys: { conditions: "conditions", spells: SPELLS, concentrations: CONCENTRATION },
    normalizeConditions,
    teleportAnimationLookup: (id) => id === "tele-pending" ? { operationId: "tele-op-1" } : null,
  });
  assert.equal(result.status, undefined);
  assert.deepEqual(result.finalItems.find((item) => item.id === "tele-pending").item.position, { x: 0, y: 0 });
});

test("token:teleport: beforePosition senza la stessa animazione pending resta un vero CONFLICT", () => {
  const token = { id: "tele-stale", name: "Mago", position: { x: 0, y: 0 }, visible: true, metadata: { [META]: {} } };
  const entry = {
    id: "hist-tele-stale",
    effectsMutation: {
      commandId: "tele-op-1",
      changes: [],
      sideEffects: [{
        id: "tele-stale",
        type: "token:teleport",
        operationId: "tele-op-1",
        beforePosition: { x: 0, y: 0 },
        afterPosition: { x: 300, y: 300 },
      }],
    },
  };
  const result = buildHistoryUndoPlan({
    sceneItems: [token],
    entryOrEntries: [entry],
    metadataKey: META,
    effectKeys: { conditions: "conditions", spells: SPELLS, concentrations: CONCENTRATION },
    normalizeConditions,
    teleportAnimationLookup: () => null,
  });
  assert.equal(result.status, "conflict");
  assert.equal(result.conflicts[0].reason, "current-value-mismatch");
});

test("legacy static-zone removal: side effect lifecycle senza type resta undoable", () => {
  const removedZone = {
    id: "legacy-zone-removed",
    name: "Zona concentrazione",
    type: "SHAPE",
    position: { x: 200, y: 300 },
    visible: true,
    metadata: {
      "com.thebigpicture.initiative/spellStaticZone": {
        instanceId: "conc-zone-1",
        spellId: "wall-of-light",
        ruleId: "wall-of-light:zone",
      },
    },
  };
  const entry = {
    id: "history-concentration-break-legacy",
    effectsMutation: {
      changes: [],
      sideEffects: [{
        id: removedZone.id,
        before: removedZone,
        after: null,
      }],
    },
  };

  const result = plan([], [entry]);
  assert.equal(result.status, undefined);
  const restored = result.finalItems.find((candidate) => candidate.id === removedZone.id)?.item;
  assert.deepEqual(restored, removedZone);
});

test("side effect senza type non viene trattato come lifecycle se before e after esistono entrambi", () => {
  const live = item("ambiguous", { hp: 5 });
  const entry = {
    id: "history-ambiguous-untyped",
    effectsMutation: {
      changes: [],
      sideEffects: [{
        id: "ambiguous",
        before: item("ambiguous", { hp: 10 }),
        after: live,
      }],
    },
  };

  const result = plan([live], [entry]);
  assert.equal(result.status, "conflict");
  assert.equal(result.conflicts[0].reason, "unsupported-side-effect");
});

test("reminder-resolution già nello stato before viene riconosciuta come Undo già applicato", () => {
  const spell = {
    id: "spell-entry",
    name: "Guardiani spirituali",
    turns: 100,
    casterId: "caster",
    conc: true,
    instanceId: "spirit-instance",
    spellId: "spirit-guardians",
    expiry: { mode: "concentration" },
  };
  const concentration = {
    "guardiani spirituali": {
      targets: ["caster"],
      name: "Guardiani spirituali",
      instanceId: "spirit-instance",
      spellId: "spirit-guardians",
    },
  };
  const previousMarkers = {
    "concentration-save:older:caster": { version: 1, outcome: "passed", resolvedAt: 1 },
  };
  const resolvedMarkers = {
    ...previousMarkers,
    "concentration-save:failed:caster": { version: 1, outcome: "failed", resolvedAt: 2 },
  };
  const entry = {
    id: "effects-history:reminder-resolution:concentration-save:failed:caster",
    kind: "reminder-resolution",
    effectsMutation: {
      changes: [{
        id: "caster",
        fields: { spells: true, concentrations: true },
        before: { spells: [spell], concentrations: concentration },
        after: { spells: [], concentrations: {} },
        metadataFields: { reminderResolutions: true },
        beforeMetadata: { reminderResolutions: { present: true, value: previousMarkers } },
        afterMetadata: { reminderResolutions: { present: true, value: resolvedMarkers } },
      }],
      sideEffects: [],
    },
  };
  const currentBefore = item("caster", {
    [SPELLS]: [spell],
    [CONCENTRATION]: concentration,
    reminderResolutions: previousMarkers,
  });

  assert.equal(historyEntryMatchesUndoBefore({
    sceneItems: [currentBefore],
    entry,
    metadataKey: META,
    effectKeys: { conditions: "conditions", spells: SPELLS, concentrations: CONCENTRATION },
    normalizeConditions,
  }), true);
});

test("reminder-resolution parzialmente ripristinata non viene scambiata per Undo già applicato", () => {
  const spell = {
    id: "spell-entry-partial",
    name: "Guardiani spirituali",
    casterId: "caster-partial",
    conc: true,
    instanceId: "spirit-instance-partial",
    spellId: "spirit-guardians",
  };
  const concentration = {
    "guardiani spirituali": {
      targets: ["caster-partial"],
      instanceId: "spirit-instance-partial",
      spellId: "spirit-guardians",
    },
  };
  const entry = {
    id: "partial-reminder-resolution",
    kind: "reminder-resolution",
    effectsMutation: {
      changes: [{
        id: "caster-partial",
        fields: { spells: true, concentrations: true },
        before: { spells: [spell], concentrations: concentration },
        after: { spells: [], concentrations: {} },
      }],
      sideEffects: [],
    },
  };
  const partial = item("caster-partial", {
    [SPELLS]: [spell],
    [CONCENTRATION]: {},
  });
  assert.equal(historyEntryMatchesUndoBefore({
    sceneItems: [partial],
    entry,
    metadataKey: META,
    effectKeys: { conditions: "conditions", spells: SPELLS, concentrations: CONCENTRATION },
    normalizeConditions,
  }), false);
});

test("Undo di un reminder zona ripristina solo la propria activation e preserva reminder accumulati", () => {
  const ZONE_KEY = "com.thebigpicture.initiative/spellStaticZone";
  const consumed = {
    id: "cloudkill-turn-1",
    triggerId: "cloudkill-save-on-turn-start",
    targetIds: ["target"],
    turnKey: "2:1:target",
  };
  const pendingLater = [
    {
      id: "cloudkill-entry-2",
      triggerId: "cloudkill-save-on-entry",
      targetIds: ["other"],
      turnKey: "2:1:other",
    },
    {
      id: "cloudkill-turn-3",
      triggerId: "cloudkill-save-on-turn-start",
      targetIds: ["third"],
      turnKey: "2:1:third",
    },
  ];
  const zone = {
    id: "cloudkill-root",
    name: "Zona: Nube mortale",
    metadata: {
      [ZONE_KEY]: {
        instanceId: "cloudkill-instance",
        spellId: "cloudkill",
        ruleId: "cloudkill:cast",
        triggerRuntime: {
          initialized: true,
          memberIds: ["target", "other", "third"],
          evaluatedTurnKey: "2:1:third",
          handledKeys: [],
          pending: pendingLater,
          sequence: 12,
        },
      },
    },
  };
  const entry = {
    id: "history-cloudkill-reminder-1",
    effectsMutation: {
      changes: [],
      sideEffects: [{
        id: zone.id,
        type: "reminder-zone-activation",
        metadataKey: ZONE_KEY,
        activationId: consumed.id,
        activation: consumed,
      }],
    },
  };

  const result = plan([zone], [entry]);
  assert.equal(result.status, undefined);
  const restored = result.finalItems.find((row) => row.id === zone.id)?.item;
  assert.deepEqual(
    restored.metadata[ZONE_KEY].triggerRuntime.pending.map((activation) => activation.id),
    [pendingLater[0].id, pendingLater[1].id, consumed.id],
  );
  assert.equal(restored.metadata[ZONE_KEY].triggerRuntime.sequence, 12);
  assert.equal(restored.metadata[ZONE_KEY].triggerRuntime.evaluatedTurnKey, "2:1:third");
});
