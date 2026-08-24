import { resolveTargetingCapacity } from "./spellTargetingCapacityCore.js";

const uniqueIds = (values = []) => Array.from(new Set(
  (Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean),
));

export const CHAIN_LIGHTNING_TARGETING = Object.freeze({
  spellId: "chain-lightning",
  saveAbility: "dex",
  selectionMode: "primary-then-secondary",
  baseSlot: 6,
  maxSlot: 9,
  primaryRangeMeters: 45,
  secondaryRangeMeters: 9,
  baseSecondaryMaximum: 3,
  additionalSecondaryPerSlotAbove: 1,
});

export function chainLightningSecondaryMaximum(
  slotLevel,
  rule = CHAIN_LIGHTNING_TARGETING,
) {
  const slot = Math.floor(Number(slotLevel));
  if (!Number.isInteger(slot)) return 0;
  return Math.max(0, resolveTargetingCapacity({
    mode: "discrete",
    declaration: {
      baseMaximum: Number(rule.baseSecondaryMaximum) || 0,
      additionalPerSlotAbove: Number(rule.additionalSecondaryPerSlotAbove) || 0,
      baseSlot: Number(rule.baseSlot) || 0,
    },
    slotLevel: slot,
    initialTargeting: true,
    defaultDiscreteTargeting: false,
  }).maximum ?? 0);
}

function addError(errors, error) {
  if (!errors.includes(error)) errors.push(error);
}

export function resolveChainLightningTargeting({
  spellId = CHAIN_LIGHTNING_TARGETING.spellId,
  slotLevel = CHAIN_LIGHTNING_TARGETING.baseSlot,
  primaryId = "",
  secondaryIds = [],
  primaryDistanceMeters = null,
  secondaryDistancesMeters = {},
  validateDistances = true,
  rule = CHAIN_LIGHTNING_TARGETING,
  ignoreTargetLimit = false,
} = {}) {
  const errors = [];
  const normalizedSpellId = String(spellId || "").trim();
  const normalizedPrimaryId = String(primaryId || "").trim();
  const rawSecondaryIds = (Array.isArray(secondaryIds) ? secondaryIds : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const normalizedSecondaryIds = uniqueIds(rawSecondaryIds);
  const duplicateTargetIds = uniqueIds([
    ...rawSecondaryIds.filter((id, index) => rawSecondaryIds.indexOf(id) !== index),
    ...(normalizedPrimaryId && normalizedSecondaryIds.includes(normalizedPrimaryId)
      ? [normalizedPrimaryId]
      : []),
  ]);
  const slot = Number(slotLevel);
  const validSlot = Number.isInteger(slot)
    && slot >= Math.floor(Number(rule.baseSlot) || 0)
    && slot <= Math.floor(Number(rule.maxSlot) || 9);
  const secondaryCapacity = resolveTargetingCapacity({
    mode: "discrete",
    declaration: {
      baseMaximum: Number(rule.baseSecondaryMaximum) || 0,
      additionalPerSlotAbove: Number(rule.additionalSecondaryPerSlotAbove) || 0,
      baseSlot: Number(rule.baseSlot) || 0,
    },
    slotLevel: slot,
    targetIds: normalizedSecondaryIds,
    ignoreTargetLimit,
    initialTargeting: true,
    defaultDiscreteTargeting: false,
    source: "chain-lightning-secondary-targeting",
  });
  const maximumSecondaryTargets = secondaryCapacity.maximum ?? 0;
  const effectiveMaximumSecondaryTargets = secondaryCapacity.effectiveMaximum;

  if (normalizedSpellId !== String(rule.spellId || "").trim()) {
    addError(errors, "workflow-spell-mismatch");
  }
  if (!validSlot) addError(errors, "slot-level-invalid");
  if (!normalizedPrimaryId) addError(errors, "primary-required");
  if (duplicateTargetIds.length) addError(errors, "duplicate-targets");
  if (effectiveMaximumSecondaryTargets !== null
    && normalizedSecondaryIds.length > effectiveMaximumSecondaryTargets) {
    addError(errors, "secondary-limit-exceeded");
  }

  const invalidDistanceTargetIds = [];
  if (validateDistances) {
    if (!Number.isFinite(Number(primaryDistanceMeters))) {
      addError(errors, "primary-distance-unavailable");
    } else if (
      Number(primaryDistanceMeters) > Number(rule.primaryRangeMeters) + 1e-9
    ) {
      addError(errors, "primary-out-of-range");
      invalidDistanceTargetIds.push(normalizedPrimaryId);
    }
    for (const targetId of normalizedSecondaryIds) {
      const distance = Number(secondaryDistancesMeters?.[targetId]);
      if (!Number.isFinite(distance)) {
        addError(errors, "secondary-distance-unavailable");
        invalidDistanceTargetIds.push(targetId);
      } else if (distance > Number(rule.secondaryRangeMeters) + 1e-9) {
        addError(errors, "secondary-out-of-range");
        invalidDistanceTargetIds.push(targetId);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors: Object.freeze(errors),
    spellId: normalizedSpellId,
    slotLevel: validSlot ? slot : null,
    primaryId: normalizedPrimaryId,
    secondaryIds: Object.freeze(normalizedSecondaryIds),
    targetIds: Object.freeze([
      ...(normalizedPrimaryId ? [normalizedPrimaryId] : []),
      ...normalizedSecondaryIds.filter((id) => id !== normalizedPrimaryId),
    ]),
    duplicateTargetIds: Object.freeze(duplicateTargetIds),
    invalidDistanceTargetIds: Object.freeze(uniqueIds(invalidDistanceTargetIds)),
    maximumSecondaryTargets,
    effectiveMaximumSecondaryTargets,
    maximumTargets: 1 + maximumSecondaryTargets,
    effectiveMaximumTargets: effectiveMaximumSecondaryTargets === null
      ? null
      : 1 + effectiveMaximumSecondaryTargets,
    ignoreTargetLimit: ignoreTargetLimit === true,
    targetingCapacity: secondaryCapacity,
    primaryDistanceMeters: Number.isFinite(Number(primaryDistanceMeters))
      ? Number(primaryDistanceMeters)
      : null,
    secondaryDistancesMeters: Object.freeze({
      ...(secondaryDistancesMeters && typeof secondaryDistancesMeters === "object"
        ? secondaryDistancesMeters
        : {}),
    }),
    rule,
  };
}
