import { METADATA_OWNERSHIP, writeSceneMetadataKey } from "./metadataKeyScoped.js";
import { compactHistoryEntryForStorage } from "./historyOwnerCore.js";
import { perfProbeEnabled, perfRecord } from "./perfProbe.js";
import { buildLocalRecoveryAnchor, isLocalRecoveryAnchor } from "./historyLocalStoreCore.js";

export const EFFECTS_RECOVERY_KEY = METADATA_OWNERSHIP.EFFECTS_RECOVERY.key;
export const EFFECTS_RECOVERY_LIMITS = Object.freeze({ records: 16, bytes: 131072, receipts: 128 });
const clone = (value) => value === undefined ? undefined : structuredClone(value);
const durable = (value) => JSON.parse(JSON.stringify(value, (key, next) => (
  key === "sceneEpoch" || key === "sceneIdentity" || key === "warningRuntimeScope" ? undefined : next
)));
const supported = new Set(["token:teleport", "reminder:consume-zone-activation", "spell-active-resolution:validate"]);
const phases = new Set(["PREPARED", "CANONICAL_COMMITTED", "SIDE_EFFECTS_PENDING", "HISTORY_PENDING", "COMPLETE"]);
// The History entry is journaled as the History stores it: its effectsMutation.changes, a copy of its changes, is
// left out and rebuilt when the record is read (with characters full of effects, a third of every journal write).
const storedHistoryEntry = (entry) => compactHistoryEntryForStorage(entry);
const usableHistoryEntry = (entry) => {
  const mutation = entry?.effectsMutation;
  if (!mutation || typeof mutation !== "object" || !Array.isArray(entry.changes)) return entry;
  return {
    ...entry,
    effectsMutation: {
      ...mutation,
      ...(Array.isArray(mutation.changes) ? {} : { changes: clone(entry.changes) }),
      ...(Array.isArray(mutation.sideEffects) ? {} : { sideEffects: [] }),
    },
  };
};
const validStore = (value) => value?.schemaVersion === 1 && typeof value.scopeId === "string"
  && value.scopeId.length > 0 && value.records && typeof value.records === "object"
  && !Array.isArray(value.records) && Array.isArray(value.receipts);

export function supportsEffectsRecovery(command, plan = null) {
  return command.history !== false
    && !(command.suppressHistoryOnTerminalAccumulation && plan?.terminalAccumulationApplied)
    && !(plan?.undoSideEffects?.length)
    && (plan?.preparedSideEffects || command.sideEffects || []).every((effect) => supported.has(effect.type));
}

// Where the journal lives (ARCH-009). Step 1: the scene metadata key, exactly as before.
export function createSceneEffectsRecoveryStorage(obr) {
  return Object.freeze({
    read: async () => (await obr.scene.getMetadata())[EFFECTS_RECOVERY_KEY],
    write: (value) => writeSceneMetadataKey(obr.scene, METADATA_OWNERSHIP.EFFECTS_RECOVERY, value, { runtime: "effectsRecovery" }),
  });
}

// ARCH-009 step 4: the journal in the GM browser's IndexedDB behind the GM-local flag, with only an anchor
// { schemaVersion: 2, storage: "local", scopeId } in the scene key. The anchor keeps the scopeId that History
// entries carry as recoveryScope (history.js reads it from the scene to validate a replay).
// - read: a scene anchor is read from IndexedDB, any other value is returned as it is; with no anchor the scene read
//   and its timing are those of createSceneEffectsRecoveryStorage. A journal written in another browser reads as an
//   empty journal with the same scopeId.
// - write: flag off, the scene as before (a local journal moves back whole). Flag on, IndexedDB; the anchor is
//   written only when the scene does not hold it yet, so a migrated journal costs no scene write per command.
//   A journal still in the scene (version 1) moves with that write, scopeId and pending records included.
export function createLocalEffectsRecoveryStorage({
  obr,
  database,
  isEnabled = () => false,
  currentRoomId = () => String(obr?.room?.id || ""),
  now = () => Date.now(),
  onLocalJournalUnavailable = () => {},
  onLocalStoreFailed = () => {},
}) {
  const writeScene = (value) => writeSceneMetadataKey(obr.scene, METADATA_OWNERSHIP.EFFECTS_RECOVERY, value, { runtime: "effectsRecovery" });
  let anchorScopeId = null;
  let knownRecords = 0;

  async function readLocal(anchor) {
    anchorScopeId = anchor.scopeId;
    const record = await database.get(anchor.scopeId);
    const roomId = currentRoomId();
    if (record?.store && (!roomId || !record.roomId || record.roomId === roomId)) return record.store;
    onLocalJournalUnavailable({ scopeId: anchor.scopeId });
    return { schemaVersion: 1, scopeId: anchor.scopeId, records: {}, receipts: [] };
  }

  async function writeLocal(value) {
    const scopeId = value?.scopeId;
    const records = Object.keys(value?.records || {}).length;
    // A new pending command: check once that the scene still holds this journal's anchor (another plugin version or
    // GM window may have rewritten the key meanwhile); the later writes of the same command trust that check.
    if (records > knownRecords && anchorScopeId === scopeId) {
      const current = (await obr.scene.getMetadata())[EFFECTS_RECOVERY_KEY];
      if (!isLocalRecoveryAnchor(current) || current.scopeId !== scopeId) anchorScopeId = null;
    }
    knownRecords = records;
    try {
      await database.put({ scopeId, roomId: currentRoomId(), store: value, touchedAt: now() });
    } catch (error) {
      // D3: no usable IndexedDB while the journal is still in the scene keeps it there; once the scene holds an
      // anchor the error stands, as any failed journal write.
      if (anchorScopeId) throw error;
      onLocalStoreFailed(error);
      return writeScene(value);
    }
    if (anchorScopeId !== scopeId) {
      await writeScene(buildLocalRecoveryAnchor({ scopeId }));
      anchorScopeId = scopeId;
    }
  }

  return Object.freeze({
    read: async () => {
      const value = (await obr.scene.getMetadata())[EFFECTS_RECOVERY_KEY];
      knownRecords = 0;
      if (isLocalRecoveryAnchor(value)) return readLocal(value);
      anchorScopeId = null;
      return value;
    },
    write: (value) => {
      if (!isEnabled()) {
        anchorScopeId = null;
        return writeScene(value);
      }
      return writeLocal(value);
    },
  });
}

// One instance belongs to the GM background. Every method is invoked on the
// existing Effects coordinator lane; this module owns no queue or subscription.
export function createEffectsRecovery({
  obr, buildHistory, appendHistory, inspectCanonical, applySideEffect,
  storage = createSceneEffectsRecoveryStorage(obr),
}) {
  let store = null;
  let scope = null;
  let uncertain = false;
  const retryable = new Set();
  const currentRoom = () => String(obr.room.id || "");
  const compatible = (record) => record?.schemaVersion === 1
    && record.roomId === currentRoom() && record.scopeId === scope
    && phases.has(record.phase) && Array.isArray(record.changes)
    && Array.isArray(record.sideEffects) && Array.isArray(record.completedSideEffects)
    && typeof record.historyEntry?.id === "string";
  const check = (isCurrent) => { if (!isCurrent()) throw new Error("recovery-scene-changed"); };

  async function load(isCurrent) {
    const saved = await storage.read();
    check(isCurrent);
    uncertain = false;
    if (saved && !validStore(saved)) {
      store = saved; scope = null;
      return;
    }
    store = saved ? clone(saved) : null;
    scope = store?.scopeId || null;
  }

  // Reserve the largest progress representation before allowing a commit.
  // A record that fits PREPARED must also fit all subsequent progress marks.
  function budgetBytes(value) {
    const reserved = clone(value);
    for (const record of Object.values(reserved.records)) {
      if (!Array.isArray(record.sideEffects)) continue;
      record.phase = "SIDE_EFFECTS_PENDING";
      record.completedSideEffects = record.sideEffects.map((_, index) => `${record.commandId}:side:${index}`);
    }
    return Math.max(...[value, reserved].map((entry) => new TextEncoder().encode(JSON.stringify({ [EFFECTS_RECOVERY_KEY]: entry })).length));
  }

  async function write(next, isCurrent, savedCommandId = "") {
    check(isCurrent);
    const recordCount = Object.keys(next.records).length;
    const probePhase = perfProbeEnabled()
      ? (savedCommandId ? String(next.records[savedCommandId]?.phase || "-") : "cleanup")
      : null;
    if (recordCount > EFFECTS_RECOVERY_LIMITS.records || budgetBytes(next) > EFFECTS_RECOVERY_LIMITS.bytes) {
      if (probePhase) perfRecord("recovery-write", { phase: probePhase, records: recordCount, skipped: "over-budget" });
      // The record being saved does not fit even without the other pending records: it is too large by itself (many
      // effects on several targets). Otherwise the journal is full.
      const lone = savedCommandId && next.records[savedCommandId]
        ? { ...next, records: { [savedCommandId]: next.records[savedCommandId] } }
        : null;
      throw new Error(recordCount <= EFFECTS_RECOVERY_LIMITS.records && lone && budgetBytes(lone) > EFFECTS_RECOVERY_LIMITS.bytes
        ? "effects-recovery-record-too-large"
        : "effects-recovery-budget-exceeded");
    }
    if (probePhase) perfRecord("recovery-write", { phase: probePhase, records: recordCount, receipts: next.receipts?.length || 0 });
    try { await storage.write(durable(next)); }
    catch (error) {
      // A lost response may still have persisted the phase or receipt.
      // Refresh the cache before a later command can overwrite that progress.
      uncertain = true;
      if (isCurrent()) await load(isCurrent).catch(() => {});
      throw error;
    }
    check(isCurrent);
    store = clone(next); scope = next.scopeId;
  }

  async function save(record, isCurrent) {
    if (store && !validStore(store)) throw new Error("effects-recovery-store-incompatible");
    const base = store || { schemaVersion: 1, scopeId: crypto.randomUUID(), records: {}, receipts: [] };
    const next = clone(base);
    next.records = { ...next.records, [record.commandId]: durable({ ...record, roomId: record.roomId || currentRoom(), scopeId: base.scopeId, updatedAt: Date.now() }) };
    if (next.records[record.commandId].historyEntry?.effectsMutation) {
      next.records[record.commandId].historyEntry.effectsMutation.recoveryScope = { roomId: next.records[record.commandId].roomId, scopeId: base.scopeId };
    }
    next.records[record.commandId].historyEntry = storedHistoryEntry(next.records[record.commandId].historyEntry);
    await write(next, isCurrent, record.commandId);
    const saved = clone(next.records[record.commandId]);
    return { ...saved, historyEntry: usableHistoryEntry(saved.historyEntry) };
  }

  async function remove(record, isCurrent, completed = false) {
    const next = clone(store);
    if (!next?.records?.[record.commandId]) return;
    delete next.records[record.commandId];
    if (completed && !next.receipts.some((receipt) => receipt.commandId === record.commandId && receipt.roomId === record.roomId)) {
      next.receipts.push({ commandId: record.commandId, roomId: record.roomId, historyEntryId: record.historyEntry?.id || null, completedAt: Date.now() });
      next.receipts = next.receipts.slice(-EFFECTS_RECOVERY_LIMITS.receipts);
    }
    await write(next, isCurrent);
    retryable.delete(record.commandId);
  }

  async function prepare(command, plan, sideEffectChanges, isCurrent) {
    check(isCurrent);
    const historyEntry = await buildHistory(command, plan, sideEffectChanges);
    if (!historyEntry) return null;
    return save({
      schemaVersion: 1, commandId: command.commandId, correlationId: command.correlationId,
      kind: command.kind, phase: "PREPARED", createdAt: Date.now(),
      changes: clone(plan.changes || []), historyEntry: durable(historyEntry),
      sideEffects: durable(plan.preparedSideEffects || []), completedSideEffects: [],
    }, isCurrent);
  }

  function result(record, complete, error = null) {
    return {
      status: "applied", committed: true, recoveryManaged: true,
      historyEntry: clone(record.historyEntry), historyPending: !complete && record.phase !== "COMPLETE", recoveryPending: !complete,
      historyError: error ? { name: "EffectsRecoveryPending", message: String(error.message || error).slice(0, 300) } : null,
      changedIds: record.changes.map((change) => change.id), changes: clone(record.changes),
      sideEffectChanges: clone((record.historyEntry?.effectsMutation?.sideEffects || []).filter((change) => complete
        || record.sideEffects.some((effect, index) => effect.id === change.id && record.completedSideEffects.includes(`${record.commandId}:side:${index}`)))),
      sideEffectsPending: complete ? [] : record.sideEffects.filter((_, index) => !record.completedSideEffects.includes(`${record.commandId}:side:${index}`))
        .map((value) => ({ kind: "apply", value })),
      postCommitErrors: error ? [{ phase: "durable-recovery", message: String(error.message || error).slice(0, 300) }] : [],
    };
  }

  // deferHistory (a command with deferRecoveryHistory): stop at HISTORY_PENDING and answer the caller; the
  // History append and the cleanup run later on the Effects lane (recover), behind the existing Undo barrier.
  async function resume(input, isCurrent, { canonicalCommitted = false, deferHistory = false } = {}) {
    let record = clone(input);
    if (!compatible(record)) return null;
    record.historyEntry = usableHistoryEntry(record.historyEntry);
    try {
      check(isCurrent);
      if (record.phase === "PREPARED") {
        const state = canonicalCommitted ? "after" : await inspectCanonical(record.changes);
        check(isCurrent);
        if (state === "before") { await remove(record, isCurrent); return null; }
        if (state !== "after") throw new Error("recovery-canonical-conflict");
        // Without side effects HISTORY_PENDING always follows CANONICAL_COMMITTED: every command writes it at once,
        // one scene write less, with the same crash window after the canonical commit.
        const skipToHistory = !record.sideEffects.length;
        record = await save({ ...record, phase: skipToHistory ? "HISTORY_PENDING" : "CANONICAL_COMMITTED" }, isCurrent);
      }
      if (record.phase !== "HISTORY_PENDING" && record.phase !== "COMPLETE") {
        for (let index = 0; index < record.sideEffects.length; index++) {
          const identity = `${record.commandId}:side:${index}`;
          if (record.completedSideEffects.includes(identity)) continue;
          check(isCurrent);
          await applySideEffect(record.sideEffects[index], isCurrent, { recovering: !canonicalCommitted });
          record = await save({ ...record, phase: "SIDE_EFFECTS_PENDING", completedSideEffects: [...record.completedSideEffects, identity] }, isCurrent);
        }
        record = await save({ ...record, phase: "HISTORY_PENDING" }, isCurrent);
      }
      if (deferHistory && record.phase === "HISTORY_PENDING") {
        retryable.add(record.commandId);
        return result(record, false);
      }
      if (record.phase !== "COMPLETE") {
        check(isCurrent);
        await appendHistory(record.historyEntry, record.commandId);
        check(isCurrent);
        // The History owner keeps one entry per id (appending it again is a duplicate, a no-op): the cleanup below
        // is the progress mark, one scene write less. If it fails, a later recovery appends the same entry again
        // harmlessly and clears the record; the caller already knows its History is written.
        record = { ...record, phase: "COMPLETE" };
      }
      await remove(record, isCurrent, true);
      return result(record, true);
    } catch (error) {
      const reason = String(error.message || error);
      if (!reason.includes("conflict") && !reason.includes("-missing") && isCurrent()) retryable.add(record.commandId);
      else retryable.delete(record.commandId);
      return result(record, false, error);
    }
  }

  async function recover(isCurrent) {
    if (uncertain) await load(isCurrent);
    for (const record of Object.values(store?.records || {})) {
      if (!isCurrent()) break;
      if (compatible(record)) await resume(record, isCurrent);
    }
  }

  async function beforeCommand(command, isCurrent) {
    if (uncertain) await load(isCurrent);
    const record = store?.records?.[command.commandId];
    if (record) {
      if (!compatible(record)) return { status: "conflict", committed: false, reason: "recovery-wrong-scene" };
      const recovered = await resume(record, isCurrent);
      if (recovered) return { ...recovered, commitResult: recovered, duplicate: true };
    }
    const receipt = Array.isArray(store?.receipts) ? store.receipts.find((entry) => entry.commandId === command.commandId && entry.roomId === currentRoom()) : null;
    if (scope && receipt) return { status: "applied", committed: true, duplicate: true, historyEntryId: receipt.historyEntryId, historyEntry: { id: receipt.historyEntryId }, historyPending: false, changedIds: [], changes: [] };
    // A command that records its History at once first completes the deferred ones, so the History keeps the
    // order of the commits; another deferred command does not wait.
    if (command.deferRecoveryHistory !== true
      && Object.values(store?.records || {}).some((pending) => compatible(pending) && pending.phase === "HISTORY_PENDING")) {
      await recover(isCurrent);
    }
    // Do not let a newer canonical write erase the evidence needed to resolve
    // an ambiguous commit. Ordinary HISTORY_PENDING records need no such gate.
    if (Object.values(store?.records || {}).some((pending) => compatible(pending) && pending.phase === "PREPARED")) {
      await recover(isCurrent);
      if (Object.values(store?.records || {}).some((pending) => compatible(pending) && pending.phase === "PREPARED")) {
        return { status: "conflict", committed: false, reason: "recovery-canonical-pending" };
      }
    }
    return null;
  }

  return { load, prepare, resume, recover, beforeCommand,
    abandon: (record, isCurrent) => remove(record, isCurrent),
    pending: () => Object.values(store?.records || {}).some(compatible),
    has: (commandId) => compatible(store?.records?.[commandId]),
    retryPending: () => [...retryable].some((commandId) => compatible(store?.records?.[commandId])),
  };
}
