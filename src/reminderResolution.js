import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import {
  buildReminderResolutionPlan,
} from "./reminderResolutionCore.js";
import {
  EFFECTS_MUTATION_STATUS,
  getEffectsMutationSceneContext,
  runEffectsMutation,
} from "./effectsMutations.js";
import { syncHPBarNow, syncHPTextBatchNow } from "./hpbar-items.js";
import { syncHPBatchToMemory } from "./hpMemory.js";
import {
  currentSceneEpoch,
  isCurrentSceneEpoch,
  subscribeSceneEpoch,
} from "./sceneEpoch.js";
import { broadcastConcentrationSaveWarnings } from "./concentrationSaveReminder.js";
import { buildSpellCausality } from "./combatLogCausalityCore.js";

const STATE_KEY = `${ID}/state`;
const META_KEY = `${ID}/meta`;
const REMINDER_RESOLUTIONS_FIELD = "reminderResolutions";
const pendingResolutions = new Map();
const pendingResolutionRecoveryWaiters = new Set();
const REMINDER_RESOLUTION_RECOVERY_BACKOFF_MS = Object.freeze([750, 1500, 3000]);
const REMINDER_RESOLUTION_RECOVERY_MAX_DELAY_MS = 5000;
let reminderResolutionGeneration = 0;
export const REMINDER_RESOLUTION_DEFER_HISTORY_ENABLED = true;

function cloneValue(value) {
  if (value === undefined) return undefined;
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function resolutionIsCurrent(sceneEpoch, generation) {
  return generation === reminderResolutionGeneration && isCurrentSceneEpoch(sceneEpoch);
}

function staleResolutionResult() {
  return {
    status: "stale",
    message: "La scena è cambiata: il reminder non è più corrente. Puoi chiuderlo.",
  };
}

function isBackgroundTransportFailure(value) {
  return value?.status === EFFECTS_MUTATION_STATUS.FAILED
    && (
      value?.error?.name === "BackgroundTransportError"
      || value?.name === "BackgroundTransportError"
    );
}

function failedResolutionResult(error) {
  return {
    status: "failed",
    message: String(
      error?.message
      || error?.error?.message
      || "Risoluzione non riuscita; nessuna conseguenza è stata registrata.",
    ),
  };
}

function recoveryDelayMs(recoveryAttempt) {
  const index = Math.max(0, Number(recoveryAttempt) - 1);
  return Math.min(
    REMINDER_RESOLUTION_RECOVERY_MAX_DELAY_MS,
    REMINDER_RESOLUTION_RECOVERY_BACKOFF_MS[index]
      || REMINDER_RESOLUTION_RECOVERY_MAX_DELAY_MS,
  );
}

function waitForResolutionRecovery({ sceneEpoch, generation, delayMs }) {
  return new Promise((resolve) => {
    let settled = false;
    let timer = null;
    const waiter = {
      cancel() {
        finish(false);
      },
    };
    const finish = (available) => {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      pendingResolutionRecoveryWaiters.delete(waiter);
      resolve(available === true);
    };
    timer = setTimeout(() => finish(
      resolutionIsCurrent(sceneEpoch, generation),
    ), Math.max(0, Number(delayMs) || 0));
    pendingResolutionRecoveryWaiters.add(waiter);
  });
}

function plannedReminderMarker(plan) {
  const patch = (Array.isArray(plan?.metadataPatches) ? plan.metadataPatches : [])
    .find((entry) => String(entry?.id || "") === String(plan?.targetId || ""));
  const markerValue = patch?.fields?.[REMINDER_RESOLUTIONS_FIELD]?.value;
  const marker = markerValue?.[plan?.activationId];
  return marker && typeof marker === "object" ? cloneValue(marker) : null;
}

function reminderMarkerMatches(actual, expected) {
  if (!actual || typeof actual !== "object" || !expected || typeof expected !== "object") {
    return false;
  }
  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(expected).sort();
  if (actualKeys.length !== expectedKeys.length
    || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    return false;
  }
  return expectedKeys.every((key) => actual[key] === expected[key]);
}

function canonicalProbeHasBlockingSideEffect(plan) {
  return Array.isArray(plan?.sideEffects) && plan.sideEffects.length > 0;
}

function recoveredReminderMutation({ descriptor, plan }) {
  const changedIds = Array.isArray(plan?.targetIds) && plan.targetIds.length
    ? [...plan.targetIds]
    : [plan.targetId];
  return {
    status: EFFECTS_MUTATION_STATUS.APPLIED,
    commandId: descriptor.commandId,
    correlationId: descriptor.commandId,
    kind: "reminder-resolution",
    sceneEpoch: descriptor.options.sceneEpoch,
    sceneIdentity: descriptor.sceneIdentity,
    committed: true,
    changedIds,
    plan: {
      changedIds,
      changes: cloneValue(plan.changes || []),
    },
    historyPending: descriptor.options.deferHistory === true,
    historyRecovered: false,
    historySkipped: false,
    historyError: descriptor.options.deferHistory === true
      ? { name: "DeferredEffectsHistory", message: "effects-history-deferred" }
      : null,
    historyEntry: { id: descriptor.historyEntryId },
    postCommitErrors: [],
    sideEffectsPending: [],
    sideEffectsRecovered: false,
    commitResult: {
      status: EFFECTS_MUTATION_STATUS.APPLIED,
      committed: true,
      changedIds,
      postCommitErrors: [],
      sideEffectsPending: [],
      sideEffectChanges: [],
    },
  };
}

async function probeCanonicalReminderCommit({ descriptor, plan, sceneEpoch, generation }) {
  if (!resolutionIsCurrent(sceneEpoch, generation)) return { stale: true, committed: false };
  let items = [];
  try {
    items = await OBR.scene.items.getItems([descriptor.targetId]);
  } catch {}
  if (!resolutionIsCurrent(sceneEpoch, generation)) return { stale: true, committed: false };

  const target = (Array.isArray(items) ? items : [])
    .find((item) => String(item?.id || "") === String(descriptor.targetId));
  const actualMarker = target?.metadata?.[META_KEY]?.[REMINDER_RESOLUTIONS_FIELD]?.[descriptor.activationId];
  const markerMatches = reminderMarkerMatches(actualMarker, descriptor.expectedReminderMarker);
  const committed = markerMatches && !canonicalProbeHasBlockingSideEffect(plan);
  console.debug("[reminder-resolution] canonical-probe", {
    activationId: descriptor.activationId,
    commandId: descriptor.commandId,
    committed,
  });
  if (!committed) return { stale: false, committed: false };

  console.debug("[reminder-resolution] recovered-from-canonical", {
    activationId: descriptor.activationId,
    commandId: descriptor.commandId,
  });
  return {
    stale: false,
    committed: true,
    mutation: recoveredReminderMutation({ descriptor, plan }),
  };
}

// A scene unload invalidates a recovery that may still be waiting for the
// transport. The in-flight request itself is owned by the Effects transport;
// the generation guard below prevents its result from applying to a new scene.
subscribeSceneEpoch((event) => {
  if (event?.phase === "unload") clearReminderResolutionQueue();
});

function createResolutionAttemptId() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {}
  return `${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
}

function staleMessage(result) {
  const reason = String(result?.reason || result?.conflicts?.[0]?.reason || "");
  if (reason.includes("scene") || reason.includes("epoch")) {
    return "La scena o il turno sono cambiati: il reminder non è più corrente. Puoi chiuderlo.";
  }
  return "Il reminder non è più corrente. Nessuna conseguenza è stata applicata; puoi chiuderlo.";
}

function reminderDamageFactor(value) {
  const number = Number(value);
  if (Number.isFinite(number)) return number;
  return {
    zero: 0,
    none: 0,
    quarter: 0.25,
    half: 0.5,
    full: 1,
    double: 2,
  }[String(value || "").trim().toLowerCase()];
}

function reminderCausality(notice, plan) {
  const resolution = notice?.resolution && typeof notice.resolution === "object"
    ? notice.resolution
    : {};
  const effect = resolution.effect && typeof resolution.effect === "object"
    ? resolution.effect
    : {};
  const activation = resolution.activation && typeof resolution.activation === "object"
    ? resolution.activation
    : {};
  const target = Array.isArray(notice?.targets)
    ? notice.targets.find((entry) => String(entry?.id || "") === String(plan?.targetId || ""))
    : null;
  const hpDelta = plan?.hpChange
    && Number.isFinite(Number(plan.hpChange.before))
    && Number.isFinite(Number(plan.hpChange.after))
    ? Number(plan.hpChange.after) - Number(plan.hpChange.before)
    : undefined;
  const concentrationAction = notice?.concentrationAction
    || resolution.concentrationAction
    || effect.concentrationAction;
  const action = resolution.action && typeof resolution.action === "object"
    ? resolution.action
    : {
      ...(resolution.actionId ? { id: resolution.actionId } : {}),
      ...(resolution.actionLabel || resolution.label
        ? { label: resolution.actionLabel || resolution.label }
        : {}),
    };
  const isZeroDamageOutcome = plan?.outcome === "passed" || plan?.outcome === "immune" || Number(plan?.damage?.amount) === 0;
  const targetRequestedDamage = isZeroDamageOutcome ? undefined : (resolution.damage ? plan?.damage?.roll : undefined);
  const actionDamageRoll = isZeroDamageOutcome ? undefined : (resolution.damage ? plan?.damage?.roll : undefined);

  return buildSpellCausality({
    eventType: "reminder-resolution",
    spellId: notice?.spellId
      || effect?.spellId
      || resolution.spellId
      || effect.spellId
      || activation.spellId,
    spellName: notice?.spellName
      || effect?.spellName
      || resolution.spellName
      || effect.spellName
      || activation.spellName,
    instanceId: notice?.instanceId || effect.instanceId || activation.instanceId,
    slotLevel: notice?.slotLevel || resolution.slotLevel || effect.slotLevel,
    phase: notice?.phase || resolution.phase,
    casterId: notice?.casterId
      || plan?.sourceId
      || resolution.source?.id
      || activation.casterId,
    casterName: notice?.casterName
      || notice?.sourceName
      || resolution.source?.name
      || activation.casterName,
    actorRole: notice?.casterId
      || notice?.casterName
      || activation.casterId
      || activation.casterName
      ? "caster"
      : "source",
    targets: [{
      id: plan?.targetId,
      name: target?.name,
      outcome: plan?.outcome,
      requestedDamage: targetRequestedDamage,
      appliedHpDelta: hpDelta,
      damageFactor: resolution.damage ? reminderDamageFactor(plan?.damage?.factor) : undefined,
    }],
    targetIds: plan?.targetId ? [plan.targetId] : [],
    action,
    damageRoll: actionDamageRoll,
    concentrationAction,
    concentrationInstanceId: effect.instanceId || notice?.instanceId || activation.instanceId,
    zone: activation.kind === "zone"
      ? {
        action: "resolve",
        zoneItemId: activation.zoneItemId,
        ruleId: activation.ruleId,
      }
      : undefined,
    reminder: { activationId: plan?.activationId || notice?.activationId },
  });
}

function formatReminderResolutionLabel({ notice, plan }) {
  const resolution = notice?.resolution && typeof notice.resolution === "object"
    ? notice.resolution
    : {};
  const effect = resolution.effect || {};
  const meaningfulName = (...values) => {
    for (const value of values) {
      const candidate = String(value || "").trim();
      if (!candidate) continue;
      const normalized = candidate.toLocaleLowerCase("it-IT").replace(/\s+/gu, " ");
      if (!["incantesimo", "promemoria", "tiro salvezza"].includes(normalized)) return candidate;
    }
    return "";
  };
  const spellName = meaningfulName(
    notice?.spellName,
    effect?.spellName,
    effect?.provenance?.spellName,
    resolution?.spellName,
    resolution?.activation?.spellName,
  );
  const rawName = String(
    spellName
    || notice?.effectName
    || "",
  ).trim();
  const namedSubject = meaningfulName(rawName);
  const isInternalId = !rawName
    || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawName)
    || /^cond-inst-/i.test(rawName)
    || /^spell-inst-/i.test(rawName);
  const activationKind = String(resolution?.activation?.kind || "").trim().toLowerCase();
  const hasConcentrationAction = Object.values(resolution?.outcomes || {}).some((outcome) =>
    Array.isArray(outcome?.actions)
      && outcome.actions.some((action) => String(action?.kind || "").trim().toLowerCase() === "concentration")
  );
  const isConcentration = activationKind === "concentration-save" || hasConcentrationAction;
  const hasValue = (value) => value !== undefined && value !== null && String(value).trim() !== "";
  const hasSpellIdentity = Boolean(
    spellName
    || notice?.spellId
    || effect?.spellId
    || effect?.provenance?.spellId
    || resolution?.spellId
    || hasValue(notice?.slotLevel)
    || hasValue(effect?.slotLevel)
    || hasValue(resolution?.slotLevel)
  );
  const isSave = !!(
    notice?.ability
    || notice?.saveLabel
    || plan?.save
    || resolution?.save?.ability
    || notice?.kind === "effect-save"
    || isConcentration
  );
  const isAreaReminder = !isConcentration && activationKind === "zone" && isSave;
  const isSpellReminder = !isConcentration && !isAreaReminder && (
    hasSpellIdentity
    || ["zone", "zone-effect"].includes(String(notice?.kind || ""))
    || activationKind === "zone"
  );
  const hasNamedSubject = !isInternalId && Boolean(namedSubject);
  const humanName = isInternalId
    ? (isConcentration
      ? "Concentrazione"
      : isAreaReminder
        ? "Permanenza area"
        : isSpellReminder
          ? "Incantesimo"
          : (isSave ? "Tiro salvezza" : "Promemoria"))
    : namedSubject;
  const labelName = isConcentration
    ? `Concentrazione${hasNamedSubject ? `: ${namedSubject}` : ""}`
    : isAreaReminder
      ? `Permanenza area${hasNamedSubject ? `: ${namedSubject}` : ""}`
    : isSpellReminder
      ? `Incantesimo${hasNamedSubject ? `: ${namedSubject}` : ""}`
      : humanName;
  const outcome = plan?.outcome;
  const outcomeText = {
    passed: isSave ? "TS superato" : "Superato",
    failed: isSave ? "TS fallito" : "Fallito",
    immune: "Immune",
    confirmed: "Confermato",
  }[outcome] || (plan?.resolutionMode === "consume" ? "Chiuso" : outcome || "Risolto");
  return `${labelName} · ${outcomeText}`;
}

async function completeReminderResolution({
  mutation,
  plan,
  sceneEpoch,
  items,
  outcomeLabel,
  isCurrent,
}) {
  const derivedTasks = [];
  if (plan.hpChange && isCurrent()) {
    const update = {
      tokenId: plan.targetId,
      hp: plan.hpChange.after,
      hpMax: plan.hpChange.hpMax,
    };
    syncHPBarNow(update.tokenId, update.hp, update.hpMax);
    derivedTasks.push(Promise.all([
      syncHPTextBatchNow([update]),
      syncHPBatchToMemory([{
        itemId: update.tokenId,
        hp: update.hp,
        hpMax: update.hpMax,
      }], { sceneEpoch, items }),
    ]).catch((error) => {
      // Visuals are derived from canonical metadata; a failed widget update
      // must not create a second History operation or undo the mutation.
      console.warn("[reminder-resolution] HP visual sync:", error?.message || error);
    }));
  }
  if (
    plan.hpChange
    && plan.hpChange.after < plan.hpChange.before
    && isCurrent()
  ) {
    const causeHistoryEntryId = String(mutation?.historyEntry?.id || "").trim();
    derivedTasks.push(broadcastConcentrationSaveWarnings([{
      itemId: plan.targetId,
      damage: plan.damage.amount,
    }], {
      eventId: `reminder-resolution:${plan.activationId}`,
      causeHistoryEntryId,
      sceneEpoch,
      warningRuntimeScope: mutation?.sceneIdentity
        || mutation?.historyEntry?.effectsMutation?.sceneIdentity
        || "",
    }).catch((error) => {
      console.warn("[reminder-resolution] concentration warning:", error?.message || error);
    }));
  }
  await Promise.all(derivedTasks);
  if (plan.operations.some((operation) => {
    const type = String(operation?.type || "");
    return type.startsWith("condition:") || type.startsWith("concentration:");
  })) {
    // Il reconcile delle pill/label è derivato dallo stato canonico già committato.
    // Non deve trattenere l'ACK del popup: in caso di coda Effects occupata il
    // reminder deve comunque uscire subito da "Risoluzione in corso…".
    void import("./conditions.js")
      .then(({ refreshConditionLabels }) =>
        refreshConditionLabels(mutation.changedIds?.length ? mutation.changedIds : plan.targetIds)
      )
      .catch((error) => {
        console.warn("[reminder-resolution] condition labels:", error?.message || error);
      });
  }
  if (mutation?.commitResult?.sideEffectsPending?.length) {
    return {
      status: "applied",
      message: "Reminder risolto; la chiusura visuale dell'attivazione sarà completata dal coordinatore.",
      mutation,
      plan,
    };
  }
  return {
    status: "applied",
    message: plan.resolutionMode === "consume"
      ? "Reminder chiuso."
      : `Risolto: ${outcomeLabel}.`,
    mutation,
    plan,
  };
}

async function executeReminderResolution({
  notice = null,
  outcome = "",
  damageRoll = 0,
  sceneEpoch = currentSceneEpoch(),
  historyReplay = null,
} = {}) {
  const resolutionAttemptId = createResolutionAttemptId();
  const generation = reminderResolutionGeneration;
  if (await OBR.player.getRole().catch(() => "PLAYER") !== "GM") {
    return { status: "forbidden", message: "Solo il GM può risolvere un reminder." };
  }
  if (!resolutionIsCurrent(sceneEpoch, generation)) return staleResolutionResult();
  if (!await OBR.scene.isReady().catch(() => false)) {
    return {
      status: "stale",
      message: "La scena non è disponibile: nessuna conseguenza è stata applicata.",
    };
  }
  const [items, sceneMetadata] = await Promise.all([
    OBR.scene.items.getItems(),
    OBR.scene.getMetadata().catch(() => ({})),
  ]);
  if (!resolutionIsCurrent(sceneEpoch, generation)) return staleResolutionResult();
  const plan = buildReminderResolutionPlan({
    notice,
    items,
    outcome,
    damageRoll,
    sceneMetadata,
  });
  if (plan.status !== "ready") {
    return plan;
  }

  const resolutionLabel = formatReminderResolutionLabel({ notice, plan });
  const outcomeLabel = {
    passed: "Superato",
    failed: "Fallito",
    immune: "Immune",
    confirmed: "Confermato",
  }[plan.outcome] || (plan.resolutionMode === "consume" ? "Chiuso" : plan.outcome);
  const commandId = `reminder-resolution:${plan.activationId}:${resolutionAttemptId}`;

  let sceneContext;
  try {
    sceneContext = await getEffectsMutationSceneContext({ commandId });
  } catch (error) {
    return resolutionIsCurrent(sceneEpoch, generation)
      ? failedResolutionResult(error)
      : staleResolutionResult();
  }
  if (!resolutionIsCurrent(sceneEpoch, generation)) return staleResolutionResult();
  const sceneIdentity = String(sceneContext?.sceneIdentity || "").trim();
  if (!sceneIdentity) {
    return failedResolutionResult({
      message: "Contesto scena del coordinatore non disponibile.",
    });
  }

  // Build the complete command once. Every recovery attempt reuses this
  // descriptor, including the immutable History payload and scene identity.
  const descriptor = {
    activationId: plan.activationId,
    targetId: plan.targetId,
    resolutionAttemptId,
    commandId,
    historyEntryId: `effects-history:${commandId}`,
    sceneIdentity,
    expectedReminderMarker: plannedReminderMarker(plan),
    operations: cloneValue(plan.operations),
    options: cloneValue({
      commandId,
      sceneEpoch,
      sceneIdentity,
      kind: "reminder-resolution",
      label: resolutionLabel,
      targetIds: plan.targetIds,
      metadataPatches: plan.metadataPatches,
      sideEffects: plan.sideEffects,
      sceneMetadataPreconditions: plan.sceneMetadataPreconditions,
      requireChanges: true,
      deferHistory: REMINDER_RESOLUTION_DEFER_HISTORY_ENABLED,
      history: {
        kind: "reminder-resolution",
        label: resolutionLabel,
        payload: {
          activationId: plan.activationId,
          targetId: plan.targetId,
          outcome: plan.outcome,
          damage: plan.damage.amount,
          damageFactor: plan.damage.factor,
          ...(plan.hpChange && typeof plan.hpChange === "object"
            ? { hpChange: cloneValue(plan.hpChange) }
            : {}),
          ...(historyReplay && typeof historyReplay === "object"
            ? { replay: JSON.parse(JSON.stringify(historyReplay)) }
            : {}),
          causality: reminderCausality(notice, plan),
        },
      },
    }),
  };

  let mutation;
  let recoveryAttempt = 0;
  while (true) {
    if (!resolutionIsCurrent(sceneEpoch, generation)) return staleResolutionResult();
    try {
      mutation = await runEffectsMutation(descriptor.operations, descriptor.options);
    } catch (error) {
      mutation = {
        status: EFFECTS_MUTATION_STATUS.FAILED,
        error: {
          name: String(error?.name || "Error"),
          message: String(error?.message || error),
        },
      };
    }
    if (!resolutionIsCurrent(sceneEpoch, generation)) return staleResolutionResult();
    if (mutation?.status === EFFECTS_MUTATION_STATUS.APPLIED) break;
    if (isBackgroundTransportFailure(mutation)) {
      const canonicalRecovery = await probeCanonicalReminderCommit({
        descriptor,
        plan,
        sceneEpoch,
        generation,
      });
      if (canonicalRecovery.stale || !resolutionIsCurrent(sceneEpoch, generation)) {
        return staleResolutionResult();
      }
      if (canonicalRecovery.committed) {
        mutation = canonicalRecovery.mutation;
        break;
      }
      recoveryAttempt += 1;
      const delayMs = recoveryDelayMs(recoveryAttempt);
      console.debug("[reminder-resolution] transport-pending", {
        activationId: descriptor.activationId,
        commandId: descriptor.commandId,
        recoveryAttempt,
        recoveryDelayMs: delayMs,
      });
      const recoveryReady = await waitForResolutionRecovery({
        sceneEpoch,
        generation,
        delayMs,
      });
      if (!recoveryReady || !resolutionIsCurrent(sceneEpoch, generation)) {
        return staleResolutionResult();
      }
      console.debug("[reminder-resolution] recovery-attempt", {
        activationId: descriptor.activationId,
        commandId: descriptor.commandId,
        recoveryAttempt,
        recoveryDelayMs: delayMs,
      });
      continue;
    }
    const stale = mutation?.status === EFFECTS_MUTATION_STATUS.CONFLICT
      || mutation?.status === EFFECTS_MUTATION_STATUS.REJECTED;
    return {
      status: stale ? "stale" : "failed",
      message: stale
        ? staleMessage(mutation)
        : String(mutation?.error?.message || "Risoluzione non riuscita; nessuna conseguenza è stata registrata."),
    };
  }

  return completeReminderResolution({
    mutation,
    plan,
    sceneEpoch,
    items,
    outcomeLabel,
    isCurrent: () => resolutionIsCurrent(sceneEpoch, generation),
  });
}

export function resolveReminder(options = {}) {
  const activationId = String(
    options?.notice?.activationId
    || options?.notice?.resolution?.activation?.activationId
    || "",
  ).trim();
  if (!activationId) return executeReminderResolution(options);
  const current = pendingResolutions.get(activationId);
  if (current) return current;
  const task = executeReminderResolution(options).finally(() => {
    if (pendingResolutions.get(activationId) === task) pendingResolutions.delete(activationId);
  });
  pendingResolutions.set(activationId, task);
  return task;
}

export function clearReminderResolutionQueue() {
  reminderResolutionGeneration += 1;
  pendingResolutions.clear();
  for (const waiter of [...pendingResolutionRecoveryWaiters]) waiter.cancel();
}
