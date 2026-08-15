import test from "node:test";
import assert from "node:assert/strict";
import {
  buildHistoryUndoPlan,
  historyUndoPlanConflicts,
} from "../src/historyUndoCore.js";

const META = "com.thebigpicture.initiative/meta";
const SPELLS = "com.thebigpicture.initiative/spells";
const CONCENTRATION = "com.thebigpicture.initiative/concentration";
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
