import { getSpellAreaRules } from "./spellAreaRules.js";
import { MULTI_TARGET_SAVE_SPELL_ID_SET } from "./areaSaveSpellRules.js";
import { getSpellBoardTokenPlacementRule } from "./spellBoardTokenCore.js";

const uniqueIds = (values = []) => Array.from(new Set(
  (Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean)
));

export function getQuickHpInstantAreaRule(spellId) {
  return getSpellAreaRules(spellId, { triggerType: "cast" })
    .find((rule) => rule.kind === "instant") || null;
}

export function getQuickHpPlaceableAreaRule(spellId) {
  const boardTokenRule = getSpellBoardTokenPlacementRule(spellId);
  if (boardTokenRule) return boardTokenRule;
  const castRules = getSpellAreaRules(spellId, { triggerType: "cast" });
  return castRules.find((rule) =>
    rule.kind === "instant" || rule.kind === "zone"
  )
    || getSpellAreaRules(spellId, { triggerType: "active-action" })
      .find((rule) => rule.kind === "emission")
    || castRules.find((rule) => rule.kind === "aura")
    || null;
}

export function quickHpSpellUsesSaveOutcomes({
  spellId = "",
  castSaveSpellIds = [],
  activeZoneTrigger = null,
} = {}) {
  const normalizedSpellId = String(spellId || "").trim();
  if (!normalizedSpellId) return false;
  const matchingZoneTrigger =
    String(activeZoneTrigger?.spellId || "").trim() === normalizedSpellId;
  if (matchingZoneTrigger) {
    return activeZoneTrigger?.resolution === "manual-save";
  }
  const placementRule = getQuickHpPlaceableAreaRule(normalizedSpellId);
  if (placementRule?.kind === "zone") {
    return placementRule.zonePolicy?.initialResolution === "manual-save";
  }
  if (placementRule?.kind === "aura") return false;
  const castRequiresSave = castSaveSpellIds instanceof Set
    ? castSaveSpellIds.has(normalizedSpellId)
    : uniqueIds(castSaveSpellIds).includes(normalizedSpellId);
  return castRequiresSave;
}

export function quickHpAreaPlacementPresentation({
  spellId = "",
  casterId = "",
  busy = false,
} = {}) {
  const rule = getQuickHpPlaceableAreaRule(spellId);
  const multiTargetWithoutTemplate = MULTI_TARGET_SAVE_SPELL_ID_SET.has(
    String(spellId || "").trim(),
  );
  const boardToken = rule?.kind === "board-token";
  let placementTitle = "Seleziona un incantesimo con area posizionabile";
  if (rule) {
    placementTitle = boardToken
      ? `Posiziona il token di ${rule.spellId}`
      : `Posiziona la sagoma di ${rule.spellId}`
        + (rule.placementNote ? `. ${rule.placementNote}` : "");
  }
  return {
    rule,
    hidden: multiTargetWithoutTemplate && !boardToken,
    disabled: !!busy || !rule || !String(casterId || "").trim(),
    text: boardToken ? "Posiziona token" : "Posiziona area",
    title: !rule
      ? placementTitle
      : casterId
        ? placementTitle
        : "Seleziona prima il caster",
  };
}

export function confirmedSpellAreaTargetIds(result, availableIds = []) {
  if (result?.status !== "confirmed") return [];
  const available = new Set(uniqueIds(availableIds));
  return uniqueIds(result?.preview?.targetIds)
    .filter((id) => available.has(id));
}
