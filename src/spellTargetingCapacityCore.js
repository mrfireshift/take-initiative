export const DEFAULT_DISCRETE_TARGET_MAXIMUM = 1;

export const TARGETING_CAPACITY_CLASSIFICATIONS = Object.freeze({
  DEFAULT_SINGLE_TARGET: "single-target-default",
  FIXED_MULTI_TARGET: "fixed-multi-target",
  SLOT_SCALING: "slot-scaling",
  CHARACTER_LEVEL_SCALING: "character-level-scaling",
  UNBOUNDED: "unbounded",
  SPECIAL: "special/non-linear",
  NOT_APPLICABLE: "not-applicable",
});

const MAX_SPELL_SLOT_LEVEL = 9;

function hasOwn(value, key) {
  return !!value
    && typeof value === "object"
    && Object.prototype.hasOwnProperty.call(value, key);
}

function integerOrNull(value) {
  if (value === null || value === undefined
    || (typeof value === "string" && value.trim() === "")) return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function nonNegativeIntegerOrNull(value) {
  const number = integerOrNull(value);
  return number !== null && number >= 0 ? number : null;
}

function text(value) {
  return String(value || "").trim();
}

function declarationValue(declaration) {
  const outer = declaration && typeof declaration === "object"
    ? declaration
    : {};
  const nested = outer.targeting && typeof outer.targeting === "object"
    ? outer.targeting
    : null;
  const value = { ...(nested || outer) };
  if (nested) {
    for (const key of [
      "maximum",
      "maxTargets",
      "baseMaximum",
      "baseSlot",
      "additionalPerSlotAbove",
      "unbounded",
      "unlimitedTargets",
      "maximumResolver",
      "resolver",
      "maximumIncludesPrimary",
      "minimum",
    ]) {
      if (!hasOwn(value, key) && hasOwn(outer, key)) value[key] = outer[key];
    }
  }
  return value;
}

function resolverName(raw) {
  return text(raw.maximumResolver || raw.resolver || raw.capacityResolver)
    .toLocaleLowerCase("it");
}

function characterLevelFrom(context, raw) {
  return integerOrNull(
    context.characterLevel
      ?? context.castContext?.characterLevel
      ?? context.castContext?.casterLevel
      ?? raw.characterLevel,
  );
}

function slotLevelFrom(context, raw) {
  return integerOrNull(
    context.slotLevel
      ?? context.castContext?.slotLevel
      ?? raw.baseSlot,
  );
}

function namedResolverMaximum(name, context, raw) {
  if (name === "eldritch-blast-beams" || name === "character-level-beams") {
    const level = Math.max(1, characterLevelFrom(context, raw) ?? 1);
    return {
      maximum: level >= 17 ? 4 : level >= 11 ? 3 : level >= 5 ? 2 : 1,
      classification: TARGETING_CAPACITY_CLASSIFICATIONS.CHARACTER_LEVEL_SCALING,
      contextMissing: characterLevelFrom(context, raw) === null,
    };
  }
  if (name === "etherealness-passengers") {
    const baseSlot = nonNegativeIntegerOrNull(raw.baseSlot) ?? 7;
    const slot = Math.max(baseSlot, Math.min(
      MAX_SPELL_SLOT_LEVEL,
      slotLevelFrom(context, raw) ?? baseSlot,
    ));
    const creaturesPerHigherSlot = nonNegativeIntegerOrNull(
      raw.additionalPerSlotAbove,
    ) ?? 3;
    return {
      maximum: slot <= baseSlot
        ? 1
        : Math.max(1, slot - baseSlot) * creaturesPerHigherSlot,
      classification: TARGETING_CAPACITY_CLASSIFICATIONS.SPECIAL,
    };
  }
  if (name === "passenger-capacity") {
    const runtimeMaximum = nonNegativeIntegerOrNull(
      context.passengerCapacity
        ?? context.castContext?.passengerCapacity
        ?? context.castContext?.maximumPassengers,
    );
    return {
      maximum: runtimeMaximum,
      classification: TARGETING_CAPACITY_CLASSIFICATIONS.SPECIAL,
      runtimeResolved: runtimeMaximum !== null,
    };
  }
  return null;
}

function resolverMaximum(raw, context) {
  const name = resolverName(raw);
  if (!name) return null;
  if (typeof raw.maximumResolver === "function") {
    const result = raw.maximumResolver({ ...context, targeting: raw });
    if (result && typeof result === "object") {
      return {
        maximum: nonNegativeIntegerOrNull(result.maximum),
        classification: text(result.classification)
          || TARGETING_CAPACITY_CLASSIFICATIONS.SPECIAL,
        runtimeResolved: result.maximum !== null && result.maximum !== undefined,
      };
    }
    return {
      maximum: nonNegativeIntegerOrNull(result),
      classification: TARGETING_CAPACITY_CLASSIFICATIONS.SPECIAL,
      runtimeResolved: result !== null && result !== undefined,
    };
  }
  return namedResolverMaximum(name, context, raw) || {
    maximum: null,
    classification: TARGETING_CAPACITY_CLASSIFICATIONS.SPECIAL,
    runtimeResolved: false,
  };
}

function scalingMaximum(raw, context) {
  const baseMaximum = nonNegativeIntegerOrNull(raw.baseMaximum);
  const baseSlot = nonNegativeIntegerOrNull(raw.baseSlot);
  const additionalPerSlotAbove = nonNegativeIntegerOrNull(raw.additionalPerSlotAbove);
  const hasAnyScalingField = ["baseMaximum", "baseSlot", "additionalPerSlotAbove"]
    .some((key) => hasOwn(raw, key));
  if (!hasAnyScalingField) return null;
  if (baseMaximum === null || baseSlot === null || additionalPerSlotAbove === null) {
    return {
      maximum: null,
      invalid: true,
      baseMaximum,
      baseSlot,
      additionalPerSlotAbove,
    };
  }
  const requestedSlot = slotLevelFrom(context, raw) ?? baseSlot;
  const slot = Math.max(baseSlot, Math.min(MAX_SPELL_SLOT_LEVEL, requestedSlot));
  return {
    maximum: baseMaximum + Math.max(0, slot - baseSlot) * additionalPerSlotAbove,
    baseMaximum,
    baseSlot,
    additionalPerSlotAbove,
  };
}

export function targetingDeclaration(value) {
  return declarationValue(value);
}

export function resolveTargetingCapacity({
  mode = "discrete",
  declaration = null,
  slotLevel = null,
  characterLevel = null,
  castContext = null,
  initialTargeting = mode === "discrete",
  defaultDiscreteTargeting = mode === "discrete",
  ignoreTargetLimit = false,
  targetIds = [],
  source = null,
  minimum = null,
} = {}) {
  const raw = declarationValue(declaration);
  const context = {
    slotLevel,
    characterLevel,
    castContext: castContext && typeof castContext === "object" ? castContext : {},
  };
  const errors = [];
  const explicitUnbounded = raw.unbounded === true || raw.unlimitedTargets === true;
  const name = resolverName(raw);
  const hasResolver = !!name || typeof raw.maximumResolver === "function";
  const hasMaximum = hasOwn(raw, "maximum") || hasOwn(raw, "maxTargets");
  const declaredMaximum = hasOwn(raw, "maximum") ? raw.maximum : raw.maxTargets;
  const hasScaling = ["baseMaximum", "baseSlot", "additionalPerSlotAbove"]
    .some((key) => hasOwn(raw, key))
    && !hasMaximum
    && !hasResolver
    && !explicitUnbounded;
  const hasScalingCapacityFields = ["baseMaximum", "additionalPerSlotAbove"]
    .some((key) => hasOwn(raw, key));
  let maximum = null;
  let classification = TARGETING_CAPACITY_CLASSIFICATIONS.NOT_APPLICABLE;
  let resolved = true;
  let contextMissing = false;
  let baseMaximum = nonNegativeIntegerOrNull(raw.baseMaximum);
  let baseSlot = nonNegativeIntegerOrNull(raw.baseSlot);
  let additionalPerSlotAbove = nonNegativeIntegerOrNull(raw.additionalPerSlotAbove);

  if (explicitUnbounded) {
    classification = TARGETING_CAPACITY_CLASSIFICATIONS.UNBOUNDED;
    if (hasMaximum || hasScalingCapacityFields || hasResolver) {
      errors.push("unbounded-with-capacity");
    }
  } else if (hasResolver) {
    const resolvedValue = resolverMaximum(raw, context);
    maximum = resolvedValue.maximum;
    classification = resolvedValue.classification;
    resolved = resolvedValue.runtimeResolved !== false;
    contextMissing = resolvedValue.contextMissing === true;
  } else if (hasMaximum) {
    const numericMaximum = nonNegativeIntegerOrNull(declaredMaximum);
    if (declaredMaximum === null || declaredMaximum === undefined || numericMaximum === null) {
      errors.push("maximum-null-without-unbounded");
    } else {
      maximum = numericMaximum;
      classification = numericMaximum > 1
        ? TARGETING_CAPACITY_CLASSIFICATIONS.FIXED_MULTI_TARGET
        : TARGETING_CAPACITY_CLASSIFICATIONS.DEFAULT_SINGLE_TARGET;
    }
  } else if (hasScaling) {
    const resolvedScaling = scalingMaximum(raw, context);
    maximum = resolvedScaling.maximum;
    baseMaximum = resolvedScaling.baseMaximum;
    baseSlot = resolvedScaling.baseSlot;
    additionalPerSlotAbove = resolvedScaling.additionalPerSlotAbove;
    classification = TARGETING_CAPACITY_CLASSIFICATIONS.SLOT_SCALING;
    if (resolvedScaling.invalid) errors.push("scaling-declaration-incomplete");
  } else if (initialTargeting && defaultDiscreteTargeting && mode === "discrete") {
    maximum = DEFAULT_DISCRETE_TARGET_MAXIMUM;
    baseMaximum = DEFAULT_DISCRETE_TARGET_MAXIMUM;
    classification = TARGETING_CAPACITY_CLASSIFICATIONS.DEFAULT_SINGLE_TARGET;
  }

  const minimumValue = nonNegativeIntegerOrNull(
    minimum !== null && minimum !== undefined ? minimum : raw.minimum,
  );
  const normalizedMinimum = minimumValue ?? (
    mode === "discrete" && initialTargeting ? 1 : 0
  );
  const bypassable = Number.isInteger(maximum) && maximum >= 0;
  const state = applyTargetingLimitState({
    minimum: normalizedMinimum,
    maximum,
    baseMaximum,
    additionalPerSlotAbove: additionalPerSlotAbove ?? 0,
    baseSlot,
    maximumIncludesPrimary: raw.maximumIncludesPrimary !== false,
    source: source || text(raw.source) || null,
    classification,
    bypassable,
    resolved,
    contextMissing,
    errors,
  }, {
    ignoreTargetLimit,
    targetIds,
  });
  return Object.freeze(state);
}

export function applyTargetingLimitState(
  capacity = {},
  { ignoreTargetLimit = false, targetIds = [], targetCount = null } = {},
) {
  const maximum = nonNegativeIntegerOrNull(capacity.maximum);
  const bypassable = capacity.bypassable === true
    || (Number.isInteger(maximum) && maximum >= 0);
  const effectiveMaximum = ignoreTargetLimit === true && bypassable
    ? null
    : maximum;
  const count = targetCount === null || targetCount === undefined
    ? Array.from(new Set(
      (Array.isArray(targetIds) ? targetIds : [])
        .map((value) => text(value))
        .filter(Boolean),
    )).length
    : Math.max(0, Math.floor(Number(targetCount) || 0));
  const rawExceeded = maximum !== null && count > maximum;
  const exceeded = effectiveMaximum !== null && count > effectiveMaximum;
  return {
    ...capacity,
    maximum,
    effectiveMaximum,
    bypassable,
    ignoreTargetLimit: ignoreTargetLimit === true,
    targetCount: count,
    rawExceeded,
    exceeded,
    errors: Array.isArray(capacity.errors) ? [...capacity.errors] : [],
  };
}

export function validateTargetingCapacity({
  capacity = null,
  targetIds = [],
  ignoreTargetLimit = false,
} = {}) {
  const state = applyTargetingLimitState(capacity || {}, {
    ignoreTargetLimit,
    targetIds,
  });
  const errors = [...state.errors];
  if (state.exceeded && !errors.includes("target-limit-exceeded")) {
    errors.push("target-limit-exceeded");
  }
  return {
    ...state,
    valid: errors.length === 0,
    errors,
  };
}

export function auditTargetingCapacityEntries(entries = []) {
  const results = [];
  const violations = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    const capacity = resolveTargetingCapacity({
      mode: entry?.mode || "discrete",
      declaration: entry?.declaration || entry?.targeting || null,
      initialTargeting: entry?.initialTargeting !== false,
      defaultDiscreteTargeting: entry?.defaultDiscreteTargeting !== false,
      slotLevel: entry?.slotLevel,
      characterLevel: entry?.characterLevel,
      castContext: entry?.castContext,
      source: entry?.source || entry?.id || null,
    });
    const result = {
      id: text(entry?.id),
      classification: capacity.classification,
      maximum: capacity.maximum,
      errors: [...capacity.errors],
    };
    results.push(result);
    const requiresBoundedContract = entry?.mode === "discrete"
      && entry?.initialTargeting !== false
      && capacity.classification !== TARGETING_CAPACITY_CLASSIFICATIONS.UNBOUNDED
      && capacity.classification !== TARGETING_CAPACITY_CLASSIFICATIONS.SPECIAL;
    if (requiresBoundedContract && capacity.maximum === null) {
      violations.push({ id: result.id, error: "discrete-targeting-unbounded" });
    }
    for (const error of capacity.errors) violations.push({ id: result.id, error });
  }
  return {
    valid: violations.length === 0,
    violations,
    results,
  };
}
