export const EFFECTS_MUTATION_STATUS = Object.freeze({
  APPLIED: "applied",
  REJECTED: "rejected",
  FAILED: "failed",
  CONFLICT: "conflict",
  RECOVERY_REQUIRED: "recovery-required",
});

function createId(prefix) {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {}
  return `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
}

function clone(value) {
  if (value === undefined) return undefined;
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function serializeError(error) {
  return {
    name: String(error?.name || "Error"),
    message: String(error?.message || error || "Operazione effetti fallita."),
  };
}

function normalizeIds(values = []) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  ));
}

function normalizeCommand(input, defaults = {}) {
  const source = Array.isArray(input)
    ? { operations: input, ...defaults }
    : { ...(input || {}), ...defaults, ...(input || {}) };
  const commandId = String(source.commandId || "").trim() || createId("effects-command");
  const correlationId = String(source.correlationId || "").trim() || commandId;
  const targetIds = normalizeIds(source.targetIds);
  const history = source.history === undefined ? true : source.history;
  return {
    ...source,
    commandId,
    correlationId,
    sceneEpoch: source.sceneEpoch,
    sceneIdentity: source.sceneIdentity ?? null,
    kind: String(source.kind || "effects").trim() || "effects",
    sourceId: String(source.sourceId || "").trim(),
    targetIds,
    sideEffects: clone(source.sideEffects || []),
    metadataPatches: clone(source.metadataPatches || []),
    history,
  };
}

function baseResult(command, status, extra = {}) {
  return {
    status,
    commandId: command.commandId,
    correlationId: command.correlationId,
    sceneEpoch: command.sceneEpoch,
    sceneIdentity: command.sceneIdentity,
    kind: command.kind,
    ...extra,
  };
}

function staleResult(command, reason = "stale-scene-epoch", extra = {}) {
  return baseResult(command, EFFECTS_MUTATION_STATUS.REJECTED, {
    reason,
    committed: false,
    changedIds: [],
    changes: [],
    ...extra,
  });
}

export function createEffectsMutationCoordinator({
  prepare,
  commit,
  prepareUndo,
  buildHistoryEntry = null,
  recordHistory = async () => null,
  isCurrent = () => true,
} = {}) {
  if (typeof prepare !== "function") throw new TypeError("prepare must be a function");
  if (typeof commit !== "function") throw new TypeError("commit must be a function");
  if (typeof prepareUndo !== "function") {
    prepareUndo = async () => ({
      status: EFFECTS_MUTATION_STATUS.FAILED,
      error: { name: "UnsupportedOperation", message: "Undo effects non configurato." },
    });
  }

  let queue = Promise.resolve();
  let queued = 0;
  let running = false;
  let completed = 0;

  const currentFor = (command) => () => {
    try {
      return typeof isCurrent === "function"
        ? isCurrent(command.sceneIdentity ?? command.sceneEpoch, command)
        : true;
    } catch {
      return false;
    }
  };

  async function execute(command) {
    running = true;
    const isCommandCurrent = currentFor(command);
    if (!isCommandCurrent()) {
      running = false;
      completed += 1;
      return staleResult(command);
    }

    let committed = false;
    try {
      if (typeof command.operations === "function") {
        throw new TypeError("effects-command-operations-must-be-serializable");
      }
      const operations = command.operations;

      const plan = await prepare(
        Array.isArray(operations) ? operations : [],
        { command, sceneEpoch: command.sceneEpoch, isCurrent: isCommandCurrent },
      );
      if (plan?.status === EFFECTS_MUTATION_STATUS.CONFLICT) {
        return baseResult(command, EFFECTS_MUTATION_STATUS.CONFLICT, {
          ...plan,
          changedIds: [],
          changes: [],
        });
      }
      if (plan?.status === EFFECTS_MUTATION_STATUS.REJECTED) {
        return staleResult(command, plan.reason || "stale-after-prepare");
      }
      if (!isCommandCurrent()) return staleResult(command, "stale-after-prepare");

      const commitResult = await commit(plan, {
        command,
        sceneEpoch: command.sceneEpoch,
        isCurrent: isCommandCurrent,
      });
      if (
        commitResult?.status === EFFECTS_MUTATION_STATUS.REJECTED
        && commitResult?.committed !== true
      ) {
        return staleResult(command, commitResult.reason || "stale-before-commit");
      }
      committed = true;

      let historyEntry = null;
      let historyError = null;
      let historySkipped = false;
      const hasLogicalChanges = !!plan?.changedIds?.length;
      const hasSideEffectChanges = !!commitResult?.sideEffectChanges?.length;
      // Some temporal callers opt into silent History only when the prepared
      // plan actually changed a terminal-resolution accumulator.  Keeping the
      // decision here avoids making ordinary boundary ticks non-undoable.
      const historyEnabled = command.history !== false
        && !(
          command.suppressHistoryOnTerminalAccumulation === true
          && plan?.terminalAccumulationApplied === true
        );
      if (historyEnabled && (hasLogicalChanges || hasSideEffectChanges) && isCommandCurrent()) {
        if (command.deferHistory === true) {
          try {
            historyEntry = typeof buildHistoryEntry === "function"
              ? await buildHistoryEntry({
                command,
                plan,
                commitResult,
                sceneEpoch: command.sceneEpoch,
                isCurrent: isCommandCurrent,
              })
              : null;
          } catch (error) {
            historyEntry = error?.historyEntry || null;
          }
          historyError = {
            name: "DeferredEffectsHistory",
            message: "effects-history-deferred",
          };
        } else {
          try {
            historyEntry = await recordHistory({
              command,
              plan,
              commitResult,
              sceneEpoch: command.sceneEpoch,
              isCurrent: isCommandCurrent,
            });
          } catch (error) {
            historyError = serializeError(error);
            historyEntry = clone(error?.historyEntry || null);
          }
        }
      } else if (historyEnabled && (hasLogicalChanges || hasSideEffectChanges)) {
        historySkipped = true;
        historyError = {
          name: "SceneChangedAfterCommit",
          message: "scene-changed-after-commit",
        };
      }

      return baseResult(command, EFFECTS_MUTATION_STATUS.APPLIED, {
        operations: clone(Array.isArray(operations) ? operations : []),
        plan,
        commitResult,
        historyEntry,
        historyError,
        historyPending: !!historyError && !historySkipped,
        historySkipped,
        postCommitErrors: clone(commitResult?.postCommitErrors || []),
        sideEffectsPending: clone(commitResult?.sideEffectsPending || []),
        changedIds: Array.isArray(plan?.changedIds) ? [...plan.changedIds] : [],
        changes: Array.isArray(plan?.changes) ? plan.changes : [],
        committed: true,
      });
    } catch (error) {
      if (committed) {
        return baseResult(command, EFFECTS_MUTATION_STATUS.APPLIED, {
          operations: clone(Array.isArray(command.operations) ? command.operations : []),
          plan: null,
          commitResult: null,
          historyEntry: null,
          historyError: null,
          historyPending: false,
          changedIds: [],
          changes: [],
          committed: true,
          postCommitErrors: [{
            phase: "post-commit",
            ...serializeError(error),
          }],
        });
      }
      return baseResult(command, EFFECTS_MUTATION_STATUS.FAILED, {
        error: serializeError(error),
        committed,
        changedIds: [],
        changes: [],
      });
    } finally {
      running = false;
      completed += 1;
    }
  }

  function enqueue(input, options = {}) {
    const command = normalizeCommand(input, options);
    queued += 1;
    const task = queue.then(
      () => execute(command),
      () => execute(command),
    );
    queue = task.catch(() => {});
    return task;
  }

  function enqueueUndo(entryOrEntries, options = {}) {
    const command = normalizeCommand({
      ...options,
      kind: options.kind || "effects:undo",
      history: false,
      undo: true,
      entry: entryOrEntries,
    });
    queued += 1;
    const task = queue.then(async () => {
      running = true;
      const isCommandCurrent = currentFor(command);
      if (!isCommandCurrent()) {
        running = false;
        completed += 1;
        return staleResult(command);
      }
      let committed = false;
      try {
        const prepared = await prepareUndo(entryOrEntries, {
          command,
          sceneEpoch: command.sceneEpoch,
          isCurrent: isCommandCurrent,
        });
        if (prepared?.status === EFFECTS_MUTATION_STATUS.CONFLICT) {
          return baseResult(command, EFFECTS_MUTATION_STATUS.CONFLICT, {
            ...prepared,
            changedIds: [],
            changes: [],
          });
        }
        if (prepared?.status === EFFECTS_MUTATION_STATUS.REJECTED) {
          return staleResult(command, prepared.reason || "stale-scene-epoch");
        }
        if (prepared?.status === EFFECTS_MUTATION_STATUS.FAILED) {
          return baseResult(command, EFFECTS_MUTATION_STATUS.FAILED, {
            ...prepared,
            changedIds: [],
            changes: [],
          });
        }
        if (!isCommandCurrent()) return staleResult(command, "stale-after-prepare");
        const plan = prepared?.plan || prepared;
        const commitResult = await commit(plan, {
          command,
          sceneEpoch: command.sceneEpoch,
          isCurrent: isCommandCurrent,
        });
        if (commitResult?.status === EFFECTS_MUTATION_STATUS.CONFLICT) {
          return baseResult(command, EFFECTS_MUTATION_STATUS.CONFLICT, {
            plan,
            commitResult,
            conflicts: clone(commitResult.conflicts || []),
            changedIds: [],
            changes: [],
            committed: false,
          });
        }
        if (commitResult?.status === EFFECTS_MUTATION_STATUS.FAILED) {
          return baseResult(command, EFFECTS_MUTATION_STATUS.FAILED, {
            plan,
            commitResult,
            error: clone(commitResult.failure || null),
            recovery: clone(commitResult.recovery || null),
            changedIds: [],
            changes: [],
            committed: false,
          });
        }
        if (commitResult?.status === EFFECTS_MUTATION_STATUS.RECOVERY_REQUIRED) {
          return baseResult(command, EFFECTS_MUTATION_STATUS.RECOVERY_REQUIRED, {
            plan,
            commitResult,
            recovery: clone(commitResult.recovery || null),
            changedIds: Array.isArray(commitResult.changedIds) ? [...commitResult.changedIds] : [],
            changes: [],
            committed: false,
            recoveryRequired: true,
          });
        }
        if (
          commitResult?.status === EFFECTS_MUTATION_STATUS.REJECTED
          && commitResult?.committed !== true
        ) {
          return staleResult(command, commitResult.reason || "stale-before-commit");
        }
        if (
          commitResult?.status === EFFECTS_MUTATION_STATUS.REJECTED
          && commitResult?.committed === true
        ) {
          return baseResult(command, EFFECTS_MUTATION_STATUS.RECOVERY_REQUIRED, {
            plan,
            commitResult,
            changedIds: Array.isArray(commitResult.changedIds) ? [...commitResult.changedIds] : [],
            changes: [],
            committed: false,
            recoveryRequired: true,
          });
        }
        committed = true;
        return baseResult(command, EFFECTS_MUTATION_STATUS.APPLIED, {
          plan,
          commitResult,
          postCommitErrors: clone(commitResult?.postCommitErrors || []),
          sideEffectsPending: clone(commitResult?.sideEffectsPending || []),
          changedIds: Array.isArray(plan?.changedIds) ? [...plan.changedIds] : [],
          changes: Array.isArray(plan?.changes) ? plan.changes : [],
          committed: true,
        });
      } catch (error) {
        if (committed) {
          return baseResult(command, EFFECTS_MUTATION_STATUS.APPLIED, {
            plan: null,
            commitResult: null,
            changedIds: [],
            changes: [],
            committed: true,
            postCommitErrors: [{
              phase: "post-commit",
              ...serializeError(error),
            }],
          });
        }
        return baseResult(command, EFFECTS_MUTATION_STATUS.FAILED, {
          error: serializeError(error),
          committed,
          changedIds: [],
          changes: [],
        });
      } finally {
        running = false;
        completed += 1;
      }
    });
    queue = task.catch(() => {});
    return task;
  }

  function enqueueMaintenance(action) {
    if (typeof action !== "function") {
      return Promise.reject(new TypeError("maintenance action must be a function"));
    }
    queued += 1;
    const task = queue.then(async () => {
      running = true;
      try {
        return await action();
      } finally {
        running = false;
        completed += 1;
      }
    }, async () => {
      running = true;
      try {
        return await action();
      } finally {
        running = false;
        completed += 1;
      }
    });
    queue = task.catch(() => {});
    return task;
  }

  return {
    enqueue,
    enqueueUndo,
    enqueueMaintenance,
    idle: () => queue,
    getState: () => ({ queued, running, completed }),
  };
}

export function mutationResultError(result) {
  const status = String(result?.status || "failed");
  const reason = String(result?.reason || "").trim();
  const fallbackMessage = `Effects mutation ${status}${reason ? `: ${reason}` : ""}.`;
  const error = new Error(result?.error?.message || fallbackMessage);
  error.name = result?.error?.name || "EffectsMutationError";
  error.status = result?.status;
  error.reason = result?.reason;
  error.result = result;
  return error;
}
