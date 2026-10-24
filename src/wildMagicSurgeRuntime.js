// The Wild Magic Surge engine's writes (wildMagicSurgeCore.js plans them): the operations the Conditions popup, the
// character sheet and the class features write, in one command named after the surge, so History, the combat log
// and Undo show "Impulso di Magia Selvaggia" and take the whole outcome back at once.
import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import {
  conditionMutationOperations,
  getEffectsMutationSceneContext,
  requireAppliedEffectsMutation,
  runEffectsMutation,
} from "./effectsMutations.js";
import { getClassFeatureState } from "./classFeatureRuntime.js";
import { getClassFeatureResourcePool } from "./classFeatureCatalog.js";
import { currentSceneEpoch } from "./sceneEpoch.js";
import { getInitiativeCard } from "./initiativeCards.js";
import { spellSlotStatus } from "./spellSlotCore.js";
import { calculateQuickHPChange, QUICK_HP_MODES } from "./quickHpCore.js";
import { currentInitiativeTurnKey } from "./turnBoundaryCore.js";
import { refreshConditionLabels } from "./conditions.js";
import { lowestSpentSpellSlot, WILD_MAGIC_TIDES_POOL_ID, wildMagicSurgeRecord } from "./wildMagicSurgeCore.js";

const META_KEY = `${ID}/meta`;
const STATE_KEY = `${ID}/state`;

function expectation(meta, field) {
  return Object.prototype.hasOwnProperty.call(meta || {}, field)
    ? { present: true, value: structuredClone(meta[field]) }
    : { present: false };
}

async function appliedAtNow() {
  const metadata = await OBR.scene.getMetadata().catch(() => ({}));
  const state = metadata?.[STATE_KEY] || { order: [], current: 0, round: 1 };
  const order = Array.isArray(state.order) ? state.order : [];
  return {
    round: Math.max(1, Number(state.round || 1)),
    actorId: order[state.current] || null,
    phase: "turn",
    turnKey: currentInitiativeTurnKey(state),
  };
}

// Onde di Caos spent: the surge the DM asked for gives its use back.
export async function wildMagicTidesSpent(sorcererId) {
  const [item] = await OBR.scene.items.getItems([sorcererId]);
  const current = getClassFeatureState(item)?.resources?.[WILD_MAGIC_TIDES_POOL_ID]?.current;
  return current !== null && current !== undefined && Number(current) <= 0;
}

// The writes of each outcome, as operations of one command: the pill or condition, the healing, the resource.
function conditionOperations({ conditionName, targetIds, sourceId = "", sourceName = "", appliedAt, expiry, extraOptions = {} }) {
  return conditionMutationOperations({
    targetIds,
    conditionName,
    mode: "add",
    options: { ...extraOptions, sourceId, sourceName, appliedAt, expiry },
  });
}

function pillOperations(pill, appliedAt) {
  const { expiry, sourceName, ...extraOptions } = pill.options;
  // A buff never takes a "custom" slot: it must not evict the target's other effects.
  return conditionOperations({
    conditionName: pill.conditionName, targetIds: pill.targetIds, sourceName: sourceName || "", appliedAt, expiry, extraOptions,
  });
}

function surgeConditionOperations(condition, { appliedAt, sorcererId, sorcererName }) {
  const rounds = Math.floor(Number(condition.rounds) || 0);
  return conditionOperations({
    conditionName: condition.conditionName,
    targetIds: condition.targetIds,
    sourceId: sorcererId,
    sourceName: sorcererName || "",
    appliedAt,
    expiry: rounds > 0 ? { mode: "rounds", remaining: rounds } : { mode: "manual" },
  });
}

function resourceOperation(item, poolId, adjustment, suffix) {
  const pool = getClassFeatureResourcePool(poolId);
  if (!pool) throw new Error(`Risorsa non trovata: ${poolId}.`);
  const card = getInitiativeCard(item) || {};
  return {
    type: "class-feature:adjust-resource",
    operationId: `wild-magic-surge:${Date.now().toString(36)}:${suffix}`,
    sourceId: item.id,
    pool,
    characterBuild: card.characterBuild,
    abilityModifiers: card.abilityModifiers,
    adjustment,
  };
}

function healOperation(item, { amount }) {
  const meta = item?.metadata?.[META_KEY] || {};
  const hp = Number(meta.hp);
  const hpMax = Number(meta.hpMax);
  if (!Number.isFinite(hp) || !Number.isFinite(hpMax) || hpMax <= 0) throw new Error("PF dello Stregone non validi.");
  const change = calculateQuickHPChange({ mode: QUICK_HP_MODES.HEAL, value: amount, hp, hpMax });
  return {
    change,
    operation: change.changed ? {
      type: "hp:set",
      updates: [{
        itemId: item.id,
        hp: change.afterHP,
        hpMax: change.hpMax,
        hpIntent: { mode: QUICK_HP_MODES.HEAL, amount, eventId: `wild-magic-${Date.now()}` },
        expectedHP: expectation(meta, "hp"),
        expectedHPMax: expectation(meta, "hpMax"),
      }],
    } : null,
  };
}

// The combat log of this page, for a surge that writes nothing (resolved at the table, a spell cast from the panel):
// the entry has no History, as a recorded cast that spends nothing (spellCastRecord.js).
async function recordInCombatLog(entry, sceneEpoch) {
  const [{ startRuntimeOptions }, combatLog] = await Promise.all([
    import("./options/optionsRuntime.js"),
    import("./combatLog.js"),
  ]);
  await startRuntimeOptions().catch(() => {});
  combatLog.mountCombatLogEventSink();
  return combatLog.recordHistoryInCombatLog(entry, { sceneEpoch });
}

/**
 * Applica: one command with the outcome's writes and, when asked, the use of Onde di Caos given back, named
 * "Impulso di Magia Selvaggia (72): ..." in History and in the combat log (wildMagicSurgeRecord). An outcome that
 * writes nothing (at the table, a spell the popup opens in the panel) is still written to the combat log.
 */
export async function applyWildMagicSurgePlan(plan, {
  sorcererId, sorcererName = "", recoverTides = false, row = null, roll = null, outcome = "",
} = {}) {
  if (!plan?.ok) throw new Error(plan?.error || "Esito non applicabile.");
  const sceneEpoch = currentSceneEpoch();
  const [item] = await OBR.scene.items.getItems([sorcererId]);
  if (!item) throw new Error("Stregone non trovato.");
  const appliedAt = await appliedAtNow();
  const operations = [];
  const targetIds = new Set([sorcererId]);
  let kind = "class-feature";
  let message = "";
  let done = String(outcome || "").trim();
  if (plan.kind === "buff") {
    operations.push(...pillOperations(plan.pill, appliedAt));
    for (const id of plan.pill.targetIds) targetIds.add(id);
    if (plan.condition) operations.push(...surgeConditionOperations(plan.condition, { appliedAt, sorcererId, sorcererName }));
    kind = "condition";
    done ||= `pillola «${plan.pill.conditionName}»${plan.condition ? ` e ${plan.condition.conditionName}` : ""}`;
    message = `Pillola «${plan.pill.conditionName}» applicata.`;
  } else if (plan.kind === "condition") {
    operations.push(...surgeConditionOperations(plan.condition, { appliedAt, sorcererId, sorcererName }));
    for (const id of plan.condition.targetIds) targetIds.add(id);
    kind = "condition";
    done ||= plan.condition.conditionName;
    message = `${plan.condition.conditionName} applicato.`;
  } else if (plan.kind === "heal") {
    const { change, operation } = healOperation(item, plan.heal);
    if (operation) operations.push(operation);
    kind = "hp";
    done ||= change.changed ? `+${change.delta} PF (${plan.heal.dice})` : `nessun PF (${plan.heal.dice}, già al massimo)`;
    message = change.changed ? `Recuperati ${change.delta} PF.` : "PF già al massimo.";
  } else if (plan.kind === "sorcery-points") {
    operations.push(resourceOperation(item, plan.poolId, { reset: true }, "points"));
    done ||= "punti stregoneria ripristinati";
    message = "Punti stregoneria ripristinati.";
  } else if (plan.kind === "spell-slot") {
    const slot = lowestSpentSpellSlot(spellSlotStatus(getInitiativeCard(item)?.characterBuild, getClassFeatureState(item).resources));
    if (slot) operations.push(resourceOperation(item, slot.poolId, { delta: 1 }, "slot"));
    done ||= slot ? `slot di ${slot.level}° livello recuperato` : "nessuno slot speso";
    message = slot ? `Slot di ${slot.level}° livello recuperato.` : "Nessuno slot speso da recuperare.";
  } else {
    done ||= "al tavolo";
    message = plan.hint || "Risolvi l'esito al tavolo.";
  }
  if (recoverTides) {
    operations.push(resourceOperation(item, WILD_MAGIC_TIDES_POOL_ID, { delta: 1 }, "tides"));
    done = `${done} · Onde di Caos recuperate`;
    message = `${message} Onde di Caos recuperate.`;
  }
  const record = wildMagicSurgeRecord({ row, roll, outcome: done, sorcererId, sorcererName: sorcererName || item.name || "" });
  if (operations.length) {
    const sceneContext = await getEffectsMutationSceneContext({});
    const mutation = await runEffectsMutation(operations, {
      kind,
      label: record.label,
      targetIds: [...targetIds],
      sceneIdentity: sceneContext.sceneIdentity,
      commandId: sceneContext.commandId,
      history: { kind, label: record.label, payload: record.payload },
    });
    requireAppliedEffectsMutation(mutation);
    await refreshConditionLabels(mutation.changedIds || [...targetIds]);
  } else {
    await recordInCombatLog({
      id: "",
      kind,
      label: record.label,
      at: Date.now(),
      changes: [],
      payload: record.payload,
      provenance: { recordingSource: "wild-magic-surge" },
    }, sceneEpoch).catch((error) => console.warn("[wild-magic] combat log:", error?.message || error));
  }
  return { message, label: record.label };
}
