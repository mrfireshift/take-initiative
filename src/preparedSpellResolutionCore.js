import { ID } from "./constants.js";
import { getSpellOverviewActions } from "./spellActiveActionCore.js";
import { getSpellCastPhasePlan } from "./spellCastPhaseCore.js";
import {
  getSpellDefinition,
  getSpellEffectChoices,
} from "./spells-srd.js";
import { spellOverviewGroups } from "./spellsPanelViewCore.js";

export const PREPARED_SPELL_RESOLUTION_CHANNEL =
  `${ID}/prepared-spell-resolution`;

const uniqueIds = (values = []) => Array.from(new Set(
  (Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean)
));

function groupTargetIds(group) {
  if (group?.targets instanceof Map) return uniqueIds([...group.targets.keys()]);
  if (Array.isArray(group?.targets)) return uniqueIds(group.targets);
  if (group?.targets && typeof group.targets === "object") {
    return uniqueIds(Object.keys(group.targets));
  }
  return [];
}

export function preparedSpellDefinition(group) {
  return getSpellDefinition(group?.spellId || group?.storedName);
}

export function isPreparedSpellResolutionGroup(group) {
  const spell = preparedSpellDefinition(group);
  const instanceId = String(group?.instanceId || "").trim();
  const casterId = String(group?.casterId || "").trim();
  if (!spell || !instanceId || !casterId) return false;
  return getSpellOverviewActions({
    spell,
    castContext: group?.castContext,
    casterId,
    targetIds: groupTargetIds(group),
    effectInstances: group?.effectInstances,
  }).some((action) => action.type === "resolve");
}

export function preparedSpellResolutionGroups(items = []) {
  return spellOverviewGroups(items).filter(isPreparedSpellResolutionGroup);
}

export function findPreparedSpellResolutionGroup(items = [], instanceId = "") {
  const reference = String(instanceId || "").trim();
  if (!reference) return null;
  return preparedSpellResolutionGroups(items)
    .find((group) => String(group.instanceId || "").trim() === reference)
    || null;
}

export function preparedSpellResolutionChoices(group) {
  const spell = preparedSpellDefinition(group);
  if (!spell) return [];
  return getSpellEffectChoices(spell).map((choice) => ({
    value: String(choice?.value || ""),
    label: String(choice?.label || choice?.value || ""),
  }));
}

export function buildPreparedSpellResolutionRequest({
  group = null,
  targetIds = [],
  selectedChoice = "",
} = {}) {
  if (!isPreparedSpellResolutionGroup(group)) {
    throw new Error("prepared-spell-stale");
  }
  const targets = uniqueIds(targetIds);
  if (!targets.length) throw new Error("prepared-spell-targets-required");

  const spell = preparedSpellDefinition(group);
  const castContext = {
    ...(group.castContext && typeof group.castContext === "object"
      ? group.castContext
      : {}),
    phase: "resolve",
  };
  const choice = String(
    selectedChoice || group.castContext?.choice || ""
  ).trim();

  return {
    spell,
    enteredName: String(group.storedName || group.name || ""),
    turns: Math.max(1, ...(Array.isArray(group.turns) ? group.turns : [])),
    casterId: String(group.casterId || "").trim(),
    targetIds: targets,
    castContext,
    selectedChoice: choice,
    phasePlan: getSpellCastPhasePlan(spell, "resolve", castContext),
    applyAutomatedConditions: group.castContext?.applyAutomatedConditions !== false,
    activeConcentration: {
      instanceId: String(group.instanceId || "").trim(),
      spellId: String(group.spellId || spell?.id || "").trim(),
      name: String(group.storedName || group.name || "").trim(),
      targets: groupTargetIds(group),
    },
    historyLabel: "Risoluzione: " + String(group.name || spell?.displayName || spell?.name),
  };
}

export function preparedSpellResolutionPopoverId(instanceId = "") {
  const reference = String(instanceId || "").trim();
  let hash = 2166136261;
  for (let index = 0; index < reference.length; index += 1) {
    hash ^= reference.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const suffix = reference
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(-28) || "spell";
  return `${ID}/prepared-spell-resolution-${suffix}-${(hash >>> 0).toString(36)}`;
}
