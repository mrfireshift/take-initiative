// Counterspell's cast from its popup (counterspell.html): the ordinary recorded cast (spellCastRecord.js) with what
// it spends (the slot or the quick action's use, spellSlotSpendCore.js), the reaction (spellReactionCore.js) and,
// when the spell is countered, the slot the countered caster loses, in one command and one Undo.
import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { getSpellDefinition } from "./spells-srd.js";
import { sanitizeQuickActions } from "./quickActionsCore.js";
import { planSpellCastCost, spellSlotChoices } from "./spellSlotSpendCore.js";
import { planSpellReactionSpend } from "./spellReactionCore.js";
import { executeSpellCastRecord } from "./spellCastRecord.js";
import { getEffectsMutationSceneContext } from "./effectsMutations.js";
import { measureItems } from "./distance3d.js";
import { currentSceneEpoch, isCurrentSceneEpoch } from "./sceneEpoch.js";
import {
  COUNTERSPELL_BASE_LEVEL,
  COUNTERSPELL_OUTCOMES,
  COUNTERSPELL_SPELL_ID,
  planCounterspellContext,
} from "./counterspellCore.js";

const META_KEY = `${ID}/meta`;
const STATE_KEY = `${ID}/state`;

const metaOf = (item) => item?.metadata?.[META_KEY] || {};

function quickActionOf(caster, quickActionId) {
  const id = String(quickActionId || "").trim();
  if (!id) return null;
  return sanitizeQuickActions(metaOf(caster).initiativeCard?.quickActions, { limit: 64, attackLimit: 64 })
    .find((action) => action.id === id && action.spellId === COUNTERSPELL_SPELL_ID) || null;
}

// The slots the caster can counter with: its own, from the 3rd level up, then Pact Magic; a caster without slots
// (a monster, an NPC) picks the level it casts at, spending nothing.
export function counterspellSlotOptions(caster) {
  const card = metaOf(caster).initiativeCard || {};
  const choices = spellSlotChoices({
    characterBuild: card.characterBuild,
    resources: metaOf(caster).classFeatureState?.resources,
    spellLevel: COUNTERSPELL_BASE_LEVEL,
  });
  if (choices.length) {
    return [
      ...choices.map((choice) => ({
        value: choice.value, source: choice.pact ? "pact" : "", level: choice.level, label: choice.label, available: choice.current > 0,
      })),
      { value: "none", source: "none", level: COUNTERSPELL_BASE_LEVEL, label: "Senza slot (3°)", available: true },
    ];
  }
  return [3, 4, 5, 6, 7, 8, 9].map((level) => ({ value: `free-${level}`, source: "none", level, label: `${level}° livello`, available: true }));
}

// The creatures the caster may be countering, nearest first, with their distance in the scene's unit.
export async function loadCounterspellScene(casterId) {
  const [items, dpi, scale] = await Promise.all([
    OBR.scene.items.getItems().catch(() => []),
    OBR.scene.grid.getDpi().catch(() => 1),
    OBR.scene.grid.getScale().catch(() => ({ parsed: { multiplier: 1, unit: "" } })),
  ]);
  const caster = items.find((item) => item.id === casterId) || null;
  const unit = String(scale?.parsed?.unit || "").trim();
  const context = { dpi: Math.max(1, Number(dpi) || 1), multiplier: Math.max(0, Number(scale?.parsed?.multiplier) || 1) };
  const rangeLimit = /^(ft|feet|piedi)/iu.test(unit) ? 60 : 18;
  const candidates = items
    .filter((item) => item.id !== casterId && item.layer === "CHARACTER" && !item.attachedTo && item.metadata?.[META_KEY])
    .map((item) => {
      let distance = null;
      try { distance = caster ? Math.round(measureItems(caster, item, context).spatial * 10) / 10 : null; } catch {}
      return { item, distance, inRange: distance === null || distance <= rangeLimit, inInitiative: metaOf(item).inInitiative === true };
    })
    .sort((left, right) => Number(right.inInitiative) - Number(left.inInitiative)
      || (left.distance ?? Infinity) - (right.distance ?? Infinity));
  return { caster, candidates, unit, rangeLimit };
}

/**
 * Casts Counterspell. selection: { casterId, quickActionId, slot: one of counterspellSlotOptions, targetId, spell,
 * spellName, spellLevel, checkResult, checkTotal, spendTargetSlot }. confirm(message) is asked when nothing is left
 * to spend or the reaction is already used. Returns { status: "cast" | "cancelled" | "invalid", message, context }.
 */
export async function castCounterspell(selection = {}, { confirm = () => false } = {}) {
  const sceneEpoch = currentSceneEpoch();
  const casterId = String(selection.casterId || "").trim();
  const targetId = String(selection.targetId || "").trim();
  const [caster, target] = await Promise.all([
    OBR.scene.items.getItems([casterId]).then((items) => items[0] || null),
    targetId ? OBR.scene.items.getItems([targetId]).then((items) => items[0] || null) : Promise.resolve(null),
  ]);
  if (!caster) return { status: "invalid", message: "Il lanciatore non è più sulla scena." };
  const card = metaOf(caster).initiativeCard || {};
  const slot = selection.slot || { source: "none", level: COUNTERSPELL_BASE_LEVEL };
  const cost = planSpellCastCost({
    action: quickActionOf(caster, selection.quickActionId),
    sourceId: caster.id,
    characterBuild: card.characterBuild,
    abilityModifiers: card.abilityModifiers || null,
    resources: metaOf(caster).classFeatureState?.resources,
    spellLevel: COUNTERSPELL_BASE_LEVEL,
    slotLevel: slot.level,
    source: slot.source,
    phase: "cast",
  });
  const slotLevel = cost.slotLevel ?? slot.level ?? COUNTERSPELL_BASE_LEVEL;

  // The countered caster's slot: spent only when its spell is countered, and only when the plugin tracks its slots.
  const targetCard = metaOf(target).initiativeCard || {};
  const preview = planCounterspellContext({ ...selection, target, slotLevel });
  if (!preview.ok) return { status: "invalid", message: preview.error };
  const countered = preview.context.outcome === COUNTERSPELL_OUTCOMES.COUNTERED;
  const targetCost = target && countered && selection.spendTargetSlot !== false && preview.context.spellLevel >= 1
    ? planSpellCastCost({
      sourceId: target.id,
      characterBuild: targetCard.characterBuild,
      abilityModifiers: targetCard.abilityModifiers || null,
      resources: metaOf(target).classFeatureState?.resources,
      spellLevel: preview.context.spellLevel,
      slotLevel: preview.context.spellLevel,
      phase: "cast",
    })
    : null;
  const targetOperation = targetCost?.operation
    ? { ...targetCost.operation, operationId: `${targetCost.operation.operationId}:countered` }
    : null;
  const planned = planCounterspellContext({
    ...selection, target, slotLevel, targetSlot: targetOperation ? targetCost.spent : "",
  });

  if (cost.exhausted && !await confirm(`${cost.message}\n\nLanciare comunque Controincantesimo senza spenderlo?`)) {
    return { status: "cancelled", message: "Lancio annullato: niente da spendere." };
  }
  const sceneMetadata = await OBR.scene.getMetadata().catch(() => ({}));
  const reaction = planSpellReactionSpend({ spellId: COUNTERSPELL_SPELL_ID, caster, initiativeState: sceneMetadata?.[STATE_KEY] });
  if (reaction.alreadyUsed && !await confirm(`${reaction.message}\n\nLanciare comunque Controincantesimo?`)) {
    return { status: "cancelled", message: "Lancio annullato: reazione già usata." };
  }
  if (!isCurrentSceneEpoch(sceneEpoch)) return { status: "cancelled", message: "Scena cambiata." };
  const sceneContext = await getEffectsMutationSceneContext({});
  await executeSpellCastRecord({
    spell: getSpellDefinition(COUNTERSPELL_SPELL_ID),
    casterId: caster.id,
    casterName: caster.name || "",
    targetIds: target ? [target.id] : [],
    castContext: { slotLevel, counterspell: planned.context },
    sceneEpoch,
    isCurrent: isCurrentSceneEpoch,
    sceneIdentity: sceneContext.sceneIdentity,
    commandId: sceneContext.commandId,
    extraOperations: [...(cost.operation ? [cost.operation] : []), ...reaction.operations, ...(targetOperation ? [targetOperation] : [])],
    castCost: cost.spent,
  });
  const spent = [cost.spent, reaction.applies && !reaction.alreadyUsed ? "reazione" : "", planned.context.targetSlot
    ? `${planned.context.targetName}: ${planned.context.targetSlot}` : ""].filter(Boolean);
  return {
    status: "cast",
    context: planned.context,
    message: `${countered ? "Incantesimo annullato" : "Controincantesimo non riuscito"}${spent.length ? ` · speso: ${spent.join(", ")}` : ""}.`,
  };
}
