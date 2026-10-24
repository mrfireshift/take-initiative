// The Wild Magic Surge engine's writes (wildMagicSurgeCore.js plans them): the same calls the Conditions popup,
// the character sheet and the class features make, so History, the combat log and Undo treat them as theirs.
import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { executeConditionApplication } from "./conditionApplicationExecutor.js";
import {
  getEffectsMutationSceneContext,
  requireAppliedEffectsMutation,
  runEffectsMutation,
} from "./effectsMutations.js";
import {
  adjustClassFeatureResource,
  getClassFeatureState,
  restoreWildMagicTidesOfChaos,
} from "./classFeatureRuntime.js";
import { getInitiativeCard } from "./initiativeCards.js";
import { spellSlotStatus } from "./spellSlotCore.js";
import { calculateQuickHPChange, QUICK_HP_MODES } from "./quickHpCore.js";
import { currentInitiativeTurnKey } from "./turnBoundaryCore.js";
import { refreshConditionLabels } from "./conditions.js";
import { lowestSpentSpellSlot, WILD_MAGIC_TIDES_POOL_ID } from "./wildMagicSurgeCore.js";

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

async function applyPill(pill, { appliedAt, sceneContext, suffix = "" }) {
  const { expiry, sourceName, ...extraOptions } = pill.options;
  await executeConditionApplication({
    conditionName: pill.conditionName,
    targetIds: pill.targetIds,
    // A buff never takes a "custom" slot: it must not evict the target's other effects.
    conditionMode: "add",
    sourceId: "",
    sourceName: sourceName || "",
    appliedAt,
    expiry,
    extraOptions,
    sceneIdentity: sceneContext.sceneIdentity,
    commandId: `${sceneContext.commandId}${suffix}`,
  });
}

async function applyCondition(condition, { appliedAt, sceneContext, sorcererId, sorcererName, suffix = "" }) {
  const rounds = Math.floor(Number(condition.rounds) || 0);
  await executeConditionApplication({
    conditionName: condition.conditionName,
    targetIds: condition.targetIds,
    conditionMode: "add",
    sourceId: sorcererId,
    sourceName: sorcererName || "",
    appliedAt,
    expiry: rounds > 0 ? { mode: "rounds", remaining: rounds } : { mode: "manual" },
    sceneIdentity: sceneContext.sceneIdentity,
    commandId: `${sceneContext.commandId}${suffix}`,
  });
}

async function applyHeal({ targetId, amount }, label) {
  const [item] = await OBR.scene.items.getItems([targetId]);
  const meta = item?.metadata?.[META_KEY] || {};
  const hp = Number(meta.hp);
  const hpMax = Number(meta.hpMax);
  if (!item || !Number.isFinite(hp) || !Number.isFinite(hpMax) || hpMax <= 0) throw new Error("PF dello Stregone non validi.");
  const change = calculateQuickHPChange({ mode: QUICK_HP_MODES.HEAL, value: amount, hp, hpMax });
  if (!change.changed) return { hpChange: change };
  const mutation = await runEffectsMutation([{
    type: "hp:set",
    updates: [{
      itemId: targetId,
      hp: change.afterHP,
      hpMax: change.hpMax,
      hpIntent: { mode: QUICK_HP_MODES.HEAL, amount, eventId: `wild-magic-${Date.now()}` },
      expectedHP: expectation(meta, "hp"),
      expectedHPMax: expectation(meta, "hpMax"),
    }],
  }], { kind: "hp", label: `${label}: +${change.delta} PF`, targetIds: [targetId] });
  requireAppliedEffectsMutation(mutation);
  await refreshConditionLabels([targetId]);
  return { hpChange: change };
}

async function restoreLowestSpellSlot(sorcererId) {
  const [item] = await OBR.scene.items.getItems([sorcererId]);
  if (!item) throw new Error("Stregone non trovato.");
  const slot = lowestSpentSpellSlot(spellSlotStatus(getInitiativeCard(item)?.characterBuild, getClassFeatureState(item).resources));
  if (!slot) return { message: "Nessuno slot speso da recuperare." };
  await adjustClassFeatureResource(sorcererId, slot.poolId, { delta: 1 });
  return { message: `Slot di ${slot.level}° livello recuperato.` };
}

// Applica: the plan's writes, then the use of Onde di Caos given back when asked. The spell plan is opened by the
// popup in the spell panel; it never reaches here.
export async function applyWildMagicSurgePlan(plan, { sorcererId, sorcererName = "", recoverTides = false } = {}) {
  if (!plan?.ok) throw new Error(plan?.error || "Esito non applicabile.");
  const sceneContext = await getEffectsMutationSceneContext({});
  const appliedAt = await appliedAtNow();
  const context = { appliedAt, sceneContext, sorcererId, sorcererName };
  let message = "";
  if (plan.kind === "buff") {
    await applyPill(plan.pill, context);
    if (plan.condition) await applyCondition(plan.condition, { ...context, suffix: ":condition" });
    message = `Pillola «${plan.pill.conditionName}» applicata.`;
  } else if (plan.kind === "condition") {
    await applyCondition(plan.condition, context);
    message = `${plan.condition.conditionName} applicato.`;
  } else if (plan.kind === "heal") {
    const { hpChange } = await applyHeal(plan.heal, plan.label);
    message = hpChange.changed ? `Recuperati ${hpChange.delta} PF.` : "PF già al massimo.";
  } else if (plan.kind === "sorcery-points") {
    await adjustClassFeatureResource(sorcererId, plan.poolId, { reset: true });
    message = "Punti stregoneria ripristinati.";
  } else if (plan.kind === "spell-slot") {
    ({ message } = await restoreLowestSpellSlot(sorcererId));
  } else {
    message = plan.hint || "Risolvi l'esito al tavolo.";
  }
  if (recoverTides) {
    await restoreWildMagicTidesOfChaos(sorcererId);
    message = `${message} Onde di Caos recuperate.`;
  }
  return { message };
}
