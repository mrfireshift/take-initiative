import assert from "node:assert/strict";
import test from "node:test";
import {
  actorVitalsByteSize,
  actorVitalsRecordFor,
  compareActorVitalsRecords,
  isAbsentActorVitalsRecord,
  mergeActorVitalsRegistries,
  normalizeActorVitalsRegistry,
  retainActorVitalsRegistryWithinByteBudget,
  upsertActorVitalsAbsentRecord,
  upsertActorVitalsRecord,
} from "../src/actorVitalsCore.js";

test("il registry normalizza dati mancanti, corrotti o parziali senza lanciare", () => {
  const normalized = normalizeActorVitalsRegistry({
    actors: {
      good: { hp: 12, hpMax: 27, updatedAt: 10, revision: 2 },
      partial: { hp: "bad", futureField: { keep: true } },
      bad: null,
    },
    futureTopLevel: { keep: true },
  });
  assert.equal(normalized.schemaVersion, 1);
  assert.deepEqual(normalized.actors.good, { hp: 12, hpMax: 27, updatedAt: 10, revision: 2 });
  assert.deepEqual(normalized.actors.partial, { futureField: { keep: true } });
  assert.deepEqual(normalized.futureTopLevel, { keep: true });
});

test("updatedAt e revision selezionano lo stato più autorevole", () => {
  const older = { hp: 4, hpMax: 10, updatedAt: 100, revision: 8 };
  const newer = { hp: 9, hpMax: 10, updatedAt: 101, revision: 1 };
  assert.equal(compareActorVitalsRecords(newer, older), 1);
  assert.equal(actorVitalsRecordFor(
    mergeActorVitalsRegistries({ actors: { actor: older } }, { actors: { actor: newer } }),
    "actor",
  ).hp, 9);
});

test("l'aggiornamento incrementa revision e conserva campi sconosciuti", () => {
  const initial = {
    schemaVersion: 1,
    actors: { actor: { hp: 2, hpMax: 10, updatedAt: 10, revision: 3, future: "keep" } },
  };
  const next = upsertActorVitalsRecord(initial, "actor", 7, 10, { now: () => 11 });
  assert.deepEqual(next.actors.actor, {
    hp: 7,
    hpMax: 10,
    updatedAt: 11,
    revision: 4,
    future: "keep",
  });
});

test("assenza HP e snapshot validi condividono updatedAt/revision come autorità", () => {
  const valid = { hp: 7, hpMax: 10, updatedAt: 10, revision: 1 };
  const absent = { hpState: "absent", updatedAt: 11, revision: 2 };
  assert.equal(compareActorVitalsRecords(absent, valid), 1);
  assert.equal(isAbsentActorVitalsRecord(actorVitalsRecordFor(
    mergeActorVitalsRegistries(
      { actors: { actor: valid } },
      { actors: { actor: absent } },
    ),
    "actor",
  )), true);

  const restored = upsertActorVitalsRecord(
    { actors: { actor: absent } },
    "actor",
    0,
    10,
    { now: () => 12 },
  );
  assert.deepEqual(restored.actors.actor, {
    hp: 0,
    hpMax: 10,
    updatedAt: 12,
    revision: 3,
  });
});

test("l'invalidazione versionata rimuove i valori ma conserva campi futuri", () => {
  const absent = upsertActorVitalsAbsentRecord({
    actors: {
      actor: { hp: 7, hpMax: 10, updatedAt: 10, revision: 4, future: "keep" },
    },
  }, "actor", { now: () => 11 });
  assert.deepEqual(absent.actors.actor, {
    hpState: "absent",
    updatedAt: 11,
    revision: 5,
    future: "keep",
  });
});

test("la retention Room è deterministica e resta nel budget", () => {
  const source = {
    schemaVersion: 1,
    actors: {
      old: { hp: 1, hpMax: 10, updatedAt: 1, revision: 1, note: "x".repeat(100) },
      recent: { hp: 9, hpMax: 10, updatedAt: 2, revision: 1, note: "y".repeat(100) },
    },
  };
  const oneRecordBudget = actorVitalsByteSize({
    schemaVersion: 1,
    actors: { recent: source.actors.recent },
  });
  const retained = retainActorVitalsRegistryWithinByteBudget(source, oneRecordBudget);
  assert.ok(actorVitalsByteSize(retained) <= oneRecordBudget);
  assert.deepEqual(Object.keys(retained.actors), ["recent"]);
});

test("PC/alleati senza actorProfileId non entrano nel registry nuovo", () => {
  assert.deepEqual(actorVitalsRecordFor({}, ""), null);
  const unchanged = upsertActorVitalsRecord({}, "", 5, 10, { now: () => 1 });
  assert.deepEqual(unchanged.actors, {});
});
