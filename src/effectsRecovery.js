import { METADATA_OWNERSHIP, writeSceneMetadataKey } from "./metadataKeyScoped.js";

export const EFFECTS_RECOVERY_KEY = METADATA_OWNERSHIP.EFFECTS_RECOVERY.key;
export const EFFECTS_RECOVERY_LIMITS = Object.freeze({ records: 16, bytes: 131072, receipts: 128 });
const clone = (value) => value === undefined ? undefined : structuredClone(value);
const durable = (value) => JSON.parse(JSON.stringify(value, (key, next) => (
  key === "sceneEpoch" || key === "sceneIdentity" || key === "warningRuntimeScope" ? undefined : next
)));
const supported = new Set(["token:teleport", "reminder:consume-zone-activation", "spell-active-resolution:validate"]);
const phases = new Set(["PREPARED", "CANONICAL_COMMITTED", "SIDE_EFFECTS_PENDING", "HISTORY_PENDING", "COMPLETE"]);
const validStore = (value) => value?.schemaVersion === 1 && typeof value.scopeId === "string"
  && value.scopeId.length > 0 && value.records && typeof value.records === "object"
  && !Array.isArray(value.records) && Array.isArray(value.receipts);

export function supportsEffectsRecovery(command, plan = null) {
  return command.history !== false
    && !(command.suppressHistoryOnTerminalAccumulation && plan?.terminalAccumulationApplied)
    && !(plan?.undoSideEffects?.length)
    && (plan?.preparedSideEffects || command.sideEffects || []).every((effect) => supported.has(effect.type));
}

// One instance belongs to the GM background. Every method is invoked on the
// existing Effects coordinator lane; this module owns no queue or subscription.
export function createEffectsRecovery({ obr, buildHistory, appendHistory, inspectCanonical, applySideEffect }) {
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
    const metadata = await obr.scene.getMetadata();
    check(isCurrent);
    uncertain = false;
    const saved = metadata[EFFECTS_RECOVERY_KEY];
    if (saved && !validStore(saved)) {
      store = saved; scope = null;
      return;
    }
    store = saved ? clone(saved) : null;
    scope = store?.scopeId || null;
  }

  async function write(next, isCurrent) {
    check(isCurrent);
    // Reserve the largest progress representation before allowing a commit.
    // A record that fits PREPARED must also fit all subsequent progress marks.
    const reserved = clone(next);
    for (const record of Object.values(reserved.records)) {
      if (!Array.isArray(record.sideEffects)) continue;
      record.phase = "SIDE_EFFECTS_PENDING";
      record.completedSideEffects = record.sideEffects.map((_, index) => `${record.commandId}:side:${index}`);
    }
    if (Object.keys(next.records).length > EFFECTS_RECOVERY_LIMITS.records
      || Math.max(...[next, reserved].map((value) => new TextEncoder().encode(JSON.stringify({ [EFFECTS_RECOVERY_KEY]: value })).length)) > EFFECTS_RECOVERY_LIMITS.bytes) {
      throw new Error("effects-recovery-budget-exceeded");
    }
    try { await writeSceneMetadataKey(obr.scene, METADATA_OWNERSHIP.EFFECTS_RECOVERY, durable(next), { runtime: "effectsRecovery" }); }
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
    await write(next, isCurrent);
    return clone(next.records[record.commandId]);
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

  async function resume(input, isCurrent, { canonicalCommitted = false } = {}) {
    let record = clone(input);
    if (!compatible(record)) return null;
    try {
      check(isCurrent);
      if (record.phase === "PREPARED") {
        const state = canonicalCommitted ? "after" : await inspectCanonical(record.changes);
        check(isCurrent);
        if (state === "before") { await remove(record, isCurrent); return null; }
        if (state !== "after") throw new Error("recovery-canonical-conflict");
        record = await save({ ...record, phase: "CANONICAL_COMMITTED" }, isCurrent);
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
      if (record.phase !== "COMPLETE") {
        check(isCurrent);
        await appendHistory(record.historyEntry, record.commandId);
        check(isCurrent);
        record = await save({ ...record, phase: "COMPLETE" }, isCurrent);
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
