import assert from "node:assert/strict";
import test from "node:test";
import {
  COMBAT_LOG_STORAGE_ERROR_CODES,
  CombatLogStorageError,
  decodeCombatLogPageCursor,
  encodeCombatLogPageCursor,
  fingerprintCombatLogBundle,
  normalizeCombatLogStorageBundle,
  planCombatLogEventPage,
  planCombatLogRetention,
  summarizeCombatLogStorage,
  validateCombatLogStorageBundle,
  classifyCombatLogStorageError,
} from "../src/combatLogStorageCore.js";

function bundle(overrides = {}) {
  return {
    format: "take-initiative-combat-log",
    version: 2,
    exportedAt: 100,
    source: { roomId: "room-core" },
    session: {
      id: "session-core",
      name: "Core",
      roomId: "room-core",
      customSessionField: { keep: true },
    },
    events: [{
      id: "event-core",
      sessionId: "session-core",
      sequence: 1,
      kind: "spell",
      payload: { causality: { instanceId: "spell-instance" }, custom: "keep" },
    }],
    ...overrides,
  };
}

test("normalizza v1/v2 preservando campi sconosciuti e causality", () => {
  const v1 = normalizeCombatLogStorageBundle({
    version: 1,
    session: { id: "legacy", roomId: "room-core", legacyField: "preserve" },
    events: [{ id: "legacy-event", payload: { causality: { actionId: "action-1" } } }],
  });
  assert.equal(v1.version, 1);
  assert.equal(v1.events[0].sequence, 1);
  assert.equal(v1.session.legacyField, "preserve");
  assert.equal(v1.events[0].payload.causality.actionId, "action-1");

  const original = bundle();
  const normalized = normalizeCombatLogStorageBundle(original);
  normalized.session.customSessionField.keep = false;
  normalized.events[0].payload.custom = "changed";
  assert.equal(original.session.customSessionField.keep, true);
  assert.equal(original.events[0].payload.custom, "keep");
  assert.equal(normalized.source.session.customSessionField.keep, true);
  assert.equal(normalized.source.events[0].payload.causality.instanceId, "spell-instance");
});

test("fingerprint è deterministico anche se cambia exportedAt", () => {
  const first = normalizeCombatLogStorageBundle(bundle({ exportedAt: 1 }));
  const second = normalizeCombatLogStorageBundle(bundle({ exportedAt: 2 }));
  assert.equal(first.fingerprint, second.fingerprint);
  assert.equal(fingerprintCombatLogBundle({ a: 1, b: 2 }), fingerprintCombatLogBundle({ b: 2, a: 1 }));
});

test("rifiuta versioni future, JSON invalido, bundle ciclici e limiti", () => {
  assert.throws(
    () => normalizeCombatLogStorageBundle({ ...bundle(), version: 3 }),
    (error) => error.code === COMBAT_LOG_STORAGE_ERROR_CODES.UNSUPPORTED_VERSION,
  );
  const invalid = validateCombatLogStorageBundle("not-json");
  assert.equal(invalid.valid, false);
  assert.equal(invalid.error.code, COMBAT_LOG_STORAGE_ERROR_CODES.INVALID_FILE);

  const cyclic = bundle();
  cyclic.session.cycle = cyclic;
  assert.throws(
    () => normalizeCombatLogStorageBundle(cyclic),
    (error) => error.code === COMBAT_LOG_STORAGE_ERROR_CODES.INVALID_FILE,
  );
  assert.throws(
    () => normalizeCombatLogStorageBundle(bundle({ events: new Array(3).fill({ id: "e" }) }), { maxImportEvents: 2 }),
    (error) => error.code === COMBAT_LOG_STORAGE_ERROR_CODES.LIMIT_EXCEEDED,
  );
});

test("cursor e paginazione sono bounded, round-trip e direction-safe", () => {
  const backward = encodeCombatLogPageCursor({ sessionId: "s", direction: "backward", beforeSequence: 51 });
  const decoded = decodeCombatLogPageCursor(backward);
  assert.deepEqual(decoded, {
    sessionId: "s",
    limit: 50,
    direction: "backward",
    beforeSequence: 51,
  });
  const planned = planCombatLogEventPage("s", { cursor: backward, limit: 200 });
  assert.equal(planned.direction, "backward");
  assert.equal(planned.beforeSequence, 51);
  assert.equal(planned.limit, 200);
  assert.equal(planCombatLogEventPage("s", { limit: 1000 }).limit, 200);
  assert.equal(planCombatLogEventPage("s", { limit: 0 }).limit, 50);
});

test("retention esclude sempre active, imported e altre room", () => {
  const sessions = [
    { id: "active", roomId: "room-core", active: true, updatedAt: 1, eventCount: 4 },
    { id: "old", roomId: "room-core", updatedAt: 2, eventCount: 3 },
    { id: "imported", roomId: "room-core", imported: true, updatedAt: 1, eventCount: 10 },
    { id: "other-room", roomId: "other", updatedAt: 1, eventCount: 99 },
  ];
  const preview = planCombatLogRetention(sessions, {
    roomId: "room-core",
    activeSessionId: "active",
    now: 100,
    olderThanMs: 50,
    keepLastN: 0,
  });
  assert.deepEqual(preview.candidates.map((candidate) => candidate.id), ["old"]);
  assert.equal(preview.eventCount, 3);
  const summary = summarizeCombatLogStorage(sessions, { roomId: "room-core", activeSessionId: "active" });
  assert.deepEqual(summary, {
    sessionCount: 3,
    eventCount: 17,
    activeSessionId: "active",
    archivedSessionCount: 2,
    importedSessionCount: 1,
  });
});

test("classifica errori di storage con codice stabile", () => {
  assert.equal(classifyCombatLogStorageError(new DOMException("full", "QuotaExceededError")), "quota");
  assert.equal(classifyCombatLogStorageError({ name: "VersionError" }), "upgrade");
  assert.equal(classifyCombatLogStorageError({ name: "AbortError" }), "aborted");
  assert.equal(classifyCombatLogStorageError(new CombatLogStorageError("blocked", "blocked")), "blocked");
});
