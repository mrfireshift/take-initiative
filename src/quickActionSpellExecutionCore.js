import {
  quickActionDirectTargetIds,
  quickActionPanel,
  sanitizeQuickAction,
} from "./quickActionsCore.js";
import { ID } from "./constants.js";
import {
  getAreaSaveSpellOptions,
  getSpellChoiceTiming,
  getSpellDefinition,
  getSpellEffectChoices,
} from "./spells-srd.js";
import {
  resolveSpellConcentration,
  resolveSpellSlotLevel,
  resolveSpellSubjectIds,
} from "./spellCastContextCore.js";
import { getSpellCastPhasePlan } from "./spellCastPhaseCore.js";
import { getMobileAuraRule } from "./spellAuraCore.js";

const areaSpellIds = new Set(getAreaSaveSpellOptions().map((spell) => spell.id));
const META_KEY = `${ID}/meta`;
const CONC_META_KEY = `${ID}/concentration`;

export function quickActionConcentrationNames(item) {
  const concentrations = item?.metadata?.[META_KEY]?.[CONC_META_KEY];
  if (!concentrations || typeof concentrations !== "object") return [];
  return Array.from(new Set(
    Object.entries(concentrations)
      .map(([key, entry]) =>
        String(entry?.name || entry?.spellName || key || "").trim()
      )
      .filter(Boolean)
  ));
}

export function buildDirectQuickActionSpellRequest({
  action = null,
  sourceId = "",
  selectedTargetIds = [],
} = {}) {
  const normalized = sanitizeQuickAction(action);
  const casterId = String(sourceId || "").trim();
  if (
    !normalized
    || normalized.kind !== "spell"
    || quickActionPanel(normalized) !== "spells"
  ) {
    return { mode: "review", reason: "unsupported-action" };
  }
  const spell = getSpellDefinition(normalized.spellId);
  if (!spell || !casterId) {
    return { mode: "review", reason: "spell-or-caster-missing" };
  }
  if (areaSpellIds.has(spell.id)) {
    return { mode: "review", reason: "area-review-required" };
  }
  if (getSpellEffectChoices(spell).length > 0) {
    return { mode: "review", reason: "choice-review-required" };
  }

  const slotLevel = resolveSpellSlotLevel(spell, normalized.slotLevel);
  const castContext = {
    slotLevel,
    mobileAura: !!getMobileAuraRule(spell.id),
  };
  const phasePlan = getSpellCastPhasePlan(spell, "", castContext);
  const requestedTargetIds = quickActionDirectTargetIds(
    normalized,
    casterId,
    selectedTargetIds,
  );
  if (!requestedTargetIds.length) {
    return {
      mode: "review",
      reason: normalized.targetMode === "selection"
        ? "single-target-required"
        : "targets-missing",
    };
  }
  const targetIds = resolveSpellSubjectIds({
    spell,
    casterId,
    selectedIds: requestedTargetIds,
    subjectMode: phasePlan.subjectMode,
  });
  if (!targetIds.length) {
    return { mode: "review", reason: "targets-missing" };
  }

  const timing = getSpellChoiceTiming(spell, "", castContext);
  const turns = normalized.turns
    ?? timing?.defaultTurns
    ?? spell.defaultTurns
    ?? 1;
  const requestedConcentration = resolveSpellConcentration(spell, false);
  const concentrationAction = timing?.concentrationAction
    || phasePlan.concentrationAction
    || "replace";

  return {
    mode: "direct",
    kind: "spell",
    replacesConcentration:
      requestedConcentration && concentrationAction === "replace",
    request: {
      spell,
      enteredName: spell.displayName || spell.name,
      turns,
      casterId,
      targetIds,
      castContext,
      selectedChoice: "",
      phasePlan,
      applyAutomatedConditions: normalized.applyAutomations !== false,
      requestedConcentration,
    },
  };
}
