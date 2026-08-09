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

const STATE_KEY = `${ID}/state`;
const pendingResolutions = new Map();

function staleMessage(result) {
  const reason = String(result?.reason || result?.conflicts?.[0]?.reason || "");
  if (reason.includes("scene") || reason.includes("epoch")) {
    return "La scena o il turno sono cambiati: il reminder non è più corrente. Puoi chiuderlo.";
  }
  return "Il reminder non è più corrente. Nessuna conseguenza è stata applicata; puoi chiuderlo.";
}

async function executeReminderResolution({
  notice = null,
  outcome = "",
  damageRoll = 0,
  sceneEpoch = currentSceneEpoch(),
} = {}) {
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

  const labelName = String(
    notice?.spellName
    || notice?.effectName
    || notice?.resolution?.effect?.instanceId
    || "Reminder",
  ).trim();
  const outcomeLabel = {
    passed: "Superato",
    failed: "Fallito",
    immune: "Immune",
  }[plan.outcome] || (plan.resolutionMode === "consume" ? "Chiuso" : plan.outcome);
  const commandId = `reminder-resolution:${plan.activationId}`;
  let mutation;
  try {
    mutation = await runEffectsMutation(plan.operations, {
      commandId,
      sceneEpoch,
      kind: "reminder-resolution",
      label: `Reminder: ${labelName} · ${outcomeLabel}`,
      targetIds: plan.targetIds,
      metadataPatches: plan.metadataPatches,
      sideEffects: plan.sideEffects,
      sceneMetadataPreconditions: plan.sceneMetadataPreconditions,
      requireChanges: true,
        history: {
          kind: "reminder-resolution",
          label: `Reminder: ${labelName} · ${outcomeLabel}`,
          payload: {
            activationId: plan.activationId,
            targetId: plan.targetId,
            outcome: plan.outcome,
            damage: plan.damage.amount,
            damageFactor: plan.damage.factor,
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
    derivedTasks.push(broadcastConcentrationSaveWarnings([{
      itemId: plan.targetId,
      damage: plan.damage.amount,
    }], {
      eventId: `reminder-resolution:${plan.activationId}`,
    }).catch((error) => {
      console.warn("[reminder-resolution] concentration warning:", error?.message || error);
    }));
  }
  await Promise.all(derivedTasks);
  if (plan.operations.some((operation) => {
    const type = String(operation?.type || "");
    return type.startsWith("condition:") || type.startsWith("concentration:");
  })) {
    try {
      const { refreshConditionLabels } = await import("./conditions.js");
      await refreshConditionLabels(mutation.changedIds?.length ? mutation.changedIds : plan.targetIds);
    } catch (error) {
      console.warn("[reminder-resolution] condition labels:", error?.message || error);
    }
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
