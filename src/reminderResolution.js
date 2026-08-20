import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import {
  buildReminderResolutionPlan,
} from "./reminderResolutionCore.js";
import {
  EFFECTS_MUTATION_STATUS,
  runEffectsMutation,
} from "./effectsMutations.js";
import { syncHPBarNow, syncHPTextBatchNow } from "./hpbar-items.js";
import { syncHPBatchToMemory } from "./hpMemory.js";
import { currentSceneEpoch, isCurrentSceneEpoch } from "./sceneEpoch.js";
import { broadcastConcentrationSaveWarnings } from "./concentrationSaveReminder.js";
import { buildSpellCausality } from "./combatLogCausalityCore.js";

const STATE_KEY = `${ID}/state`;
const pendingResolutions = new Map();
export const REMINDER_RESOLUTION_DEFER_HISTORY_ENABLED = true;

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
    spellId: notice?.spellId || effect?.spellId || resolution.spellId || effect.spellId,
    spellName: notice?.spellName || effect?.spellName || notice?.effectName || resolution.spellName || effect.spellName,
    instanceId: notice?.instanceId || effect.instanceId,
    slotLevel: notice?.slotLevel || resolution.slotLevel || effect.slotLevel,
    phase: notice?.phase || resolution.phase,
    casterId: notice?.casterId || plan?.sourceId || resolution.source?.id,
    casterName: notice?.casterName || notice?.sourceName || resolution.source?.name,
    actorRole: notice?.casterId ? "caster" : "source",
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
    concentrationInstanceId: effect.instanceId || notice?.instanceId,
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
  const effect = notice?.resolution?.effect || {};
  const rawName = String(
    notice?.spellName
    || effect?.spellName
    || notice?.effectName
    || ""
  ).trim();
  const isInternalId = !rawName
    || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawName)
    || /^cond-inst-/i.test(rawName)
    || /^spell-inst-/i.test(rawName);
  const isSave = !!(
    notice?.ability
    || notice?.saveLabel
    || plan?.save
    || notice?.kind === "effect-save"
  );
  const humanName = isInternalId
    ? (isSave ? "Tiro salvezza" : "Promemoria")
    : rawName;
  const outcome = plan?.outcome;
  const outcomeText = {
    passed: isSave ? "TS superato" : "Superato",
    failed: isSave ? "TS fallito" : "Fallito",
    immune: "Immune",
    confirmed: "Confermato",
  }[outcome] || (plan?.resolutionMode === "consume" ? "Chiuso" : outcome || "Risolto");
  return `${humanName} · ${outcomeText}`;
}

async function executeReminderResolution({
  notice = null,
  outcome = "",
  damageRoll = 0,
  sceneEpoch = currentSceneEpoch(),
  historyReplay = null,
} = {}) {
  const resolutionAttemptId = createResolutionAttemptId();
  if (await OBR.player.getRole().catch(() => "PLAYER") !== "GM") {
    return { status: "forbidden", message: "Solo il GM può risolvere un reminder." };
  }
  if (!isCurrentSceneEpoch(sceneEpoch)) {
    return {
      status: "stale",
      message: "La scena è cambiata: il reminder non è più corrente. Puoi chiuderlo.",
    };
  }
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
  if (!isCurrentSceneEpoch(sceneEpoch)) {
    return {
      status: "stale",
      message: "La scena è cambiata: il reminder non è più corrente. Puoi chiuderlo.",
    };
  }
  const plan = buildReminderResolutionPlan({
    notice,
    items,
    outcome,
    damageRoll,
    sceneMetadata,
  });
  if (plan.status !== "ready") return plan;

  const resolutionLabel = formatReminderResolutionLabel({ notice, plan });
  const outcomeLabel = {
    passed: "Superato",
    failed: "Fallito",
    immune: "Immune",
    confirmed: "Confermato",
  }[plan.outcome] || (plan.resolutionMode === "consume" ? "Chiuso" : plan.outcome);
  const commandId = `reminder-resolution:${plan.activationId}:${resolutionAttemptId}`;
  let mutation;
  try {
    mutation = await runEffectsMutation(plan.operations, {
      commandId,
      sceneEpoch,
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
          ...(historyReplay && typeof historyReplay === "object"
            ? { replay: JSON.parse(JSON.stringify(historyReplay)) }
            : {}),
          causality: reminderCausality(notice, plan),
        },
      },
    });
  } catch (error) {
    return {
      status: "failed",
      message: String(error?.message || "Risoluzione non riuscita; nessuna conseguenza è stata registrata."),
    };
  }
  if (mutation?.status !== EFFECTS_MUTATION_STATUS.APPLIED) {
    const stale = mutation?.status === EFFECTS_MUTATION_STATUS.CONFLICT
      || mutation?.status === EFFECTS_MUTATION_STATUS.REJECTED;
    return {
      status: stale ? "stale" : "failed",
      message: stale
        ? staleMessage(mutation)
        : String(mutation?.error?.message || "Risoluzione non riuscita; nessuna conseguenza è stata registrata."),
    };
  }

  const derivedTasks = [];
  if (plan.hpChange && isCurrentSceneEpoch(sceneEpoch)) {
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
    && isCurrentSceneEpoch(sceneEpoch)
  ) {
    const causeHistoryEntryId = String(mutation?.historyEntry?.id || "").trim();
    derivedTasks.push(broadcastConcentrationSaveWarnings([{
      itemId: plan.targetId,
      damage: plan.damage.amount,
    }], {
      eventId: `reminder-resolution:${plan.activationId}`,
      causeHistoryEntryId,
      sceneEpoch,
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
  pendingResolutions.clear();
}
