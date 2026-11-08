// Avvisi di reazione, lots R2b, R3a and R3b (docs/STUDIO_AVVISI_REAZIONE.md): Usa on a class feature used with a
// reaction, through the flows the plugin already has (classFeatureRuntime.js).
// - useReactionFeature (R2b, R3a): a feature with a resource spends one use of it with the reaction, in one command
//   (adjustClassFeatureResource, as the card's spend); a feature without one marks only "Reazione usata"
//   (useClassFeatureReaction, as the attack console's "Usa reazione"). The effect stays at the table.
// - planReactionFeatureSpend (R3b, decision E3): the same reaction and resource as operations for the attack's own
//   command, read again at the commit, so that one Undo gives back the damage, the reaction and the resource.
import { classFeatureResourceStatus, getClassFeatureDefinition, getClassFeatureResourcePool, getEnabledClassFeatures } from "./classFeatureCatalog.js";
import { planReactionSpend } from "./reactionTrackerCore.js";
import { spellSlotPoolId, spellSlotStatus } from "./spellSlotCore.js";
import { spellSlotSpendOperation } from "./spellSlotSpendCore.js";
import { reactionTriggerEntry } from "./reactionTriggerCatalog.js";
import { ID } from "./constants.js";

const META_KEY = `${ID}/meta`;
const text = (value) => String(value ?? "").trim();

export async function useReactionFeature({ sourceId = "", featureId = "", runtime = null, monster = false, label = "" } = {}) {
  // Lot R4: a monster's reaction from its stat block: only its "Reazione usata".
  if (monster) return useMonsterReaction({ sourceId, label });
  const feature = getClassFeatureDefinition(text(featureId));
  if (!feature || !text(sourceId)) return { ok: false, message: "Capacità non disponibile." };
  const api = runtime || await import("./classFeatureRuntime.js");
  const cost = (Array.isArray(feature.resourceCosts) ? feature.resourceCosts : []).find((entry) => text(entry?.poolId));
  try {
    if (cost) {
      const amount = cost.variable === true ? 1 : Math.max(1, Math.floor(Number(cost.amount) || 1));
      await api.adjustClassFeatureResource(text(sourceId), text(cost.poolId), { delta: -amount }, { featureId: feature.id });
    } else {
      await api.useClassFeatureReaction({ sourceId: text(sourceId), featureId: feature.id });
    }
  } catch (error) {
    return { ok: false, message: String(error?.message || error || "Reazione non registrata.") };
  }
  return { ok: true, feature, message: `${feature.name}: reazione${cost ? " e risorsa" : ""} segnate.` };
}

// Lot R4: a monster's reaction (Parry, a reaction after a hit): "Reazione usata", in combat only, in a command of its own.
async function useMonsterReaction({ sourceId = "", label = "" } = {}) {
  const id = text(sourceId);
  if (!id) return { ok: false, message: "Creatura non trovata." };
  try {
    const [{ default: OBR }, effects, conditions] = await Promise.all([import("@owlbear-rodeo/sdk"),
      import("./effectsMutations.js"), import("./conditions.js")]);
    const [[item], metadata] = await Promise.all([OBR.scene.items.getItems([id]), OBR.scene.getMetadata()]);
    if (!item) return { ok: false, message: "Creatura non trovata." };
    const name = text(item.name) || "La creatura";
    const spend = planReactionSpend({ casterId: item.id, casterName: name, conditions: item.metadata?.[META_KEY]?.conditions,
      initiativeState: metadata?.[`${ID}/state`] || null });
    if (spend.alreadyUsed) return { ok: false, message: spend.message };
    if (!spend.operations.length) return { ok: false, message: "Fuori dal combattimento: nessuna reazione da segnare." };
    const result = await effects.runEffectsMutation(spend.operations, { kind: "monster-reaction",
      label: `Reazione: ${text(label) || "mostro"} (${name})`, targetIds: [item.id] });
    effects.requireAppliedEffectsMutation(result);
    await conditions.refreshConditionLabels([item.id]);
  } catch (error) {
    return { ok: false, message: String(error?.message || error || "Reazione non registrata.") };
  }
  return { ok: true, feature: null, message: `${text(label) || "Reazione"}: reazione segnata.` };
}

/**
 * The operations a damage reaction adds to the attack's command (lot R3b): the reactor's "Reazione usata" (in combat
 * only, as every reaction) and one use of its feature's resource, or for Canzone di Difesa the slot of the level chosen
 * (decision E4). reactorItem: the creature read again at the commit; reaction: { reactionId, featureId, slotLevel }.
 * { ok, operations, message }: not ok when the feature left the sheet, the reaction is used or the resource is empty.
 */
export function planReactionFeatureSpend({ reactorItem = null, reaction = {}, initiativeState = null, operationId = "" } = {}) {
  const name = text(reactorItem?.name) || "La creatura";
  const entry = reactionTriggerEntry(reaction?.reactionId);
  // Lot R4: a monster's reaction (its stat block's Uncanny Dodge): only the reaction, no resource.
  if (entry?.source === "monster" && reactorItem?.id) {
    const meta = reactorItem.metadata?.[META_KEY] || {};
    const spend = planReactionSpend({ casterId: reactorItem.id, casterName: name, conditions: meta.conditions, initiativeState });
    if (spend.alreadyUsed) return { ok: false, operations: [], message: `${name} ha già usato la reazione: togli la riga.` };
    return { ok: true, operations: [...spend.operations], message: "" };
  }
  const feature = getClassFeatureDefinition(text(reaction?.featureId));
  if (!reactorItem?.id || !entry || !feature || !(entry.featureIds || []).includes(feature.id)) {
    return { ok: false, operations: [], message: `${name}: reazione non disponibile.` };
  }
  const meta = reactorItem.metadata?.[META_KEY] || {};
  const card = meta.initiativeCard || {};
  if (!getEnabledClassFeatures(card).some((value) => value.id === feature.id)) {
    return { ok: false, operations: [], message: `${name}: ${feature.name} non è più nella scheda: togli la riga.` };
  }
  const spend = planReactionSpend({ casterId: reactorItem.id, casterName: name, conditions: meta.conditions, initiativeState });
  if (spend.alreadyUsed) return { ok: false, operations: [], message: `${name} ha già usato la reazione: togli la riga.` };
  const operations = [...spend.operations];
  const opId = text(operationId) || `damage-reaction:${reactorItem.id}:${entry.id}`;
  if (Number.isInteger(entry.effect?.perSlotLevel)) {
    const poolId = spellSlotPoolId(reaction?.slotLevel);
    const slot = spellSlotStatus(card.characterBuild, meta.classFeatureState?.resources).find((row) => !row.pact && row.poolId === poolId);
    if (!poolId || !slot) return { ok: false, operations: [], message: `${name}: nessuno slot di quel livello.` };
    if (slot.current < 1) return { ok: false, operations: [], message: `${name}: slot di ${reaction.slotLevel}° livello esauriti.` };
    operations.push(spellSlotSpendOperation({ sourceId: reactorItem.id, poolId, characterBuild: card.characterBuild,
      abilityModifiers: card.abilityModifiers || null, operationId: `${opId}:slot` }));
    return { ok: true, operations, message: "" };
  }
  const cost = (Array.isArray(feature.resourceCosts) ? feature.resourceCosts : []).find((value) => text(value?.poolId));
  if (cost) {
    const status = classFeatureResourceStatus(feature, card, meta.classFeatureState);
    if (!status.ready) return { ok: false, operations: [], message: `${name}: ${feature.name}, risorsa esaurita.` };
    const pool = getClassFeatureResourcePool(text(cost.poolId));
    if (!pool) return { ok: false, operations: [], message: `${name}: risorsa di ${feature.name} non trovata.` };
    const amount = cost.variable === true ? 1 : Math.max(1, Math.floor(Number(cost.amount) || 1));
    operations.push({ type: "class-feature:adjust-resource", operationId: `${opId}:resource`, sourceId: reactorItem.id, pool,
      characterBuild: card.characterBuild, abilityModifiers: card.abilityModifiers || null, adjustment: { delta: -amount } });
  }
  return { ok: true, operations, message: "" };
}
