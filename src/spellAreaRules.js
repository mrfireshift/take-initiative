import { CATALOG_SPELL_AREA_SPECS } from "./spellAreaCatalog.js";
import { AREA_SAVE_SPELL_ID_SET } from "./areaSaveSpellRules.js";
import { getSpellBoardTokenPlacementRuleById } from "./spellBoardTokenCore.js";

export const SPELL_AREA_KINDS = Object.freeze([
  "instant",
  "zone",
  "aura",
  "emission",
]);

export const SPELL_AREA_SHAPES = Object.freeze([
  "circle",
  "square",
  "cone",
  "line",
  "rectangle",
]);

export const SPELL_AREA_TRIGGER_TYPES = Object.freeze([
  "cast",
  "active-action",
]);

const SPELL_AREA_ORIGINS = Object.freeze(["caster", "caster-adjacent", "point"]);
const SPELL_AREA_DIRECTIONS = Object.freeze(["none", "pointer"]);
const SPELL_AREA_ANCHORS = Object.freeze(["world", "caster"]);
const SPELL_AREA_PERSISTENCE = Object.freeze(["preview", "spell"]);
const SPELL_AREA_TARGET_FILTERS = Object.freeze(["all", "hostile", "friendly"]);
const SPELL_AREA_SELECTION_MODES = Object.freeze(["area", "manual"]);
const SPELL_AREA_EFFECT_MODES = Object.freeze([
  "on-confirm",
  "while-inside",
  "manual-trigger",
]);
const SPELL_ZONE_OWNERS = Object.freeze(["caster"]);
const SPELL_ZONE_MOVEMENTS = Object.freeze(["fixed", "manual", "drift"]);
export const SPELL_ZONE_MOVEMENT_MODES = Object.freeze(["action", "bonus-action"]);
export const SPELL_ZONE_MOVEMENT_ECONOMIES = Object.freeze(["action", "bonus-action"]);
const SPELL_ZONE_EVENTS = Object.freeze([
  "cast",
  "enter",
  "leave",
  "turn-start",
  "turn-end",
  "move",
]);
const SPELL_ZONE_FREQUENCIES = Object.freeze([
  "once",
  "once-per-turn",
  "always",
]);
const SPELL_ZONE_RESOLUTIONS = Object.freeze([
  "informational",
  "manual-save",
  "manual-effect",
  "manual-heal",
]);
const SPELL_ZONE_TARGET_MODES = Object.freeze([
  "actor",
  "members",
  "direct-members",
  "caster",
]);
const SPELL_ZONE_TARGET_SCOPES = Object.freeze(["spell-targets"]);
const SPELL_ZONE_INITIAL_RESOLUTIONS = Object.freeze([
  "none",
  "manual-save",
]);
const SPELL_SAVE_ABILITIES = new Set(["str", "dex", "con", "int", "wis", "cha"]);

const MEASURE_BY_SHAPE = Object.freeze({
  circle: "radius",
  square: "side",
  cone: "length",
  line: "length",
  rectangle: "length",
});

const allowed = (values, value) => values.includes(value);

export function normalizeSpellZoneMovement(value) {
  if (typeof value === "string") return value.trim().toLowerCase();
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const mode = String(value.mode || "").trim().toLowerCase();
  const economy = String(value.economy || "").trim().toLowerCase();
  const maximumMeters = Number(value.maximumMeters);
  if (
    !SPELL_ZONE_MOVEMENT_MODES.includes(mode)
    || !SPELL_ZONE_MOVEMENT_ECONOMIES.includes(economy)
    || !Number.isFinite(maximumMeters)
    || maximumMeters <= 0
    || typeof value.triggerOnAreaMove !== "boolean"
    || typeof value.stopOnFirstContact !== "boolean"
  ) return null;
  const choice = normalizeSpellZoneMovementChoice(value.choice);
  if (value.choice !== undefined && !choice) return null;
  return {
    mode,
    economy,
    maximumMeters,
    triggerOnAreaMove: value.triggerOnAreaMove,
    stopOnFirstContact: value.stopOnFirstContact,
    ...(choice ? { choice } : {}),
  };
}

export function normalizeSpellZoneMovementChoice(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const id = String(value.id || "").trim();
  const required = value.required === true;
  const options = Array.from(new Map(
    (Array.isArray(value.options) ? value.options : [])
      .map((option) => {
        const optionValue = String(option?.value || "").trim();
        const label = String(option?.label || "").trim();
        return optionValue && label ? [optionValue, { value: optionValue, label }] : null;
      })
      .filter(Boolean),
  ).values());
  if (!id || !options.length) return null;
  return { id, required, options };
}

export function normalizeSpellZoneMovementChoiceValue(movement, value = "") {
  const choice = normalizeSpellZoneMovement(movement)?.choice;
  const selected = String(value || "").trim();
  if (!choice) return selected ? null : "";
  if (!selected) return choice.required ? null : "";
  return choice.options.some((option) => option.value === selected)
    ? selected
    : null;
}

function validSpellZoneMovement(value) {
  if (typeof value === "string") return allowed(SPELL_ZONE_MOVEMENTS, value);
  return !!normalizeSpellZoneMovement(value);
}

function validMeasure(value, expectedMeasure = "") {
  return value
    && Number.isFinite(Number(value.value))
    && Number(value.value) > 0
    && value.unit === "m"
    && (!expectedMeasure || value.measure === expectedMeasure);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const entry of Object.values(value)) deepFreeze(entry);
  return Object.freeze(value);
}

function validateMembershipEffect(effect, errors) {
  if (!String(effect?.id || "").trim()) errors.push("zone-effect-id-required");
  const condition = String(effect?.condition || "").trim();
  if (!String(effect?.label || condition).trim()) {
    errors.push("zone-effect-label-required");
  }
  if (!condition && !["buff", "debuff"].includes(effect?.kind)) {
    errors.push("zone-effect-kind-invalid");
  }
  if (
    effect?.mechanics !== undefined
    && (!effect.mechanics || typeof effect.mechanics !== "object")
  ) {
    errors.push("zone-effect-mechanics-invalid");
  }
}

function validateTriggerEntries(triggers, errors) {
  for (const trigger of triggers) {
    if (!String(trigger?.id || "").trim()) errors.push("zone-trigger-id-required");
    if (!String(trigger?.label || "").trim()) errors.push("zone-trigger-label-required");
    if (!allowed(SPELL_ZONE_EVENTS, trigger?.event)) {
      errors.push("zone-trigger-event-invalid");
    }
    if (!allowed(SPELL_ZONE_FREQUENCIES, trigger?.frequency)) {
      errors.push("zone-trigger-frequency-invalid");
    }
    if (!allowed(SPELL_ZONE_RESOLUTIONS, trigger?.resolution)) {
      errors.push("zone-trigger-resolution-invalid");
    }
    if (
      trigger?.healing !== undefined
      && (
        !trigger.healing
        || typeof trigger.healing !== "object"
        || !String(trigger.healing.dice || "").trim()
        || !Number.isInteger(Number(trigger.healing.baseSlot))
        || Number(trigger.healing.baseSlot) < 0
        || !Number.isInteger(Number(trigger.healing.additionalPerSlotAbove))
        || Number(trigger.healing.additionalPerSlotAbove) < 0
      )
    ) {
      errors.push("zone-trigger-healing-invalid");
    }
    if (trigger?.resolution === "manual-heal" && !trigger?.healing) {
      errors.push("zone-trigger-healing-required");
    }
    if (
      trigger?.ability !== undefined
      && !SPELL_SAVE_ABILITIES.has(String(trigger.ability || "").trim().toLowerCase())
    ) {
      errors.push("zone-trigger-ability-invalid");
    }
    if (
      trigger?.failureCondition !== undefined
      && (
        !trigger.failureCondition
        || typeof trigger.failureCondition !== "object"
        || !String(
          trigger.failureCondition.condition
          || trigger.failureCondition.name
          || "",
        ).trim()
      )
    ) {
      errors.push("zone-trigger-failure-condition-invalid");
    }
    if (
      trigger?.requiresOwnTurn !== undefined
      && typeof trigger.requiresOwnTurn !== "boolean"
    ) {
      errors.push("zone-trigger-own-turn-invalid");
    }
    if (
      trigger?.triggerOnAreaMove !== undefined
      && typeof trigger.triggerOnAreaMove !== "boolean"
    ) {
      errors.push("zone-trigger-area-move-invalid");
    }
    if (
      trigger?.requiresAreaMove !== undefined
      && typeof trigger.requiresAreaMove !== "boolean"
    ) {
      errors.push("zone-trigger-requires-area-move-invalid");
    }
    if (
      trigger?.persistsAfterExit !== undefined
      && typeof trigger.persistsAfterExit !== "boolean"
    ) {
      errors.push("zone-trigger-persists-after-exit-invalid");
    }
    if (
      trigger?.requiresConcentration !== undefined
      && typeof trigger.requiresConcentration !== "boolean"
    ) {
      errors.push("zone-trigger-concentration-invalid");
    }
    if (
      trigger?.requiresSourceTurn !== undefined
      && typeof trigger.requiresSourceTurn !== "boolean"
    ) {
      errors.push("zone-trigger-source-turn-invalid");
    }
    if (
      trigger?.targetMode !== undefined
      && !allowed(SPELL_ZONE_TARGET_MODES, trigger.targetMode)
    ) {
      errors.push("zone-trigger-target-mode-invalid");
    }
    if (
      trigger?.requiresRuleChoices !== undefined
      && (
        !Array.isArray(trigger.requiresRuleChoices)
        || trigger.requiresRuleChoices.some((choice) =>
          !String(choice || "").trim()
        )
      )
    ) {
      errors.push("zone-trigger-rule-choices-invalid");
    }
    if (
      trigger?.skipLinkedConditions !== undefined
      && (
        !Array.isArray(trigger.skipLinkedConditions)
        || trigger.skipLinkedConditions.some((name) => !String(name || "").trim())
      )
    ) {
      errors.push("zone-trigger-skip-conditions-invalid");
    }
    if (
      trigger?.skipConditions !== undefined
      && (
        !Array.isArray(trigger.skipConditions)
        || trigger.skipConditions.some((name) => !String(name || "").trim())
      )
    ) {
      errors.push("zone-trigger-skip-conditions-invalid");
    }
    if (
      trigger?.requireConditions !== undefined
      && (
        !Array.isArray(trigger.requireConditions)
        || trigger.requireConditions.some((name) => !String(name || "").trim())
      )
    ) {
      errors.push("zone-trigger-require-conditions-invalid");
    }
    if (
      trigger?.failureEffect !== undefined
      && !String(trigger.failureEffect || "").trim()
    ) {
      errors.push("zone-trigger-failure-effect-invalid");
    }
    if (
      trigger?.damage !== undefined
      && (
        !trigger.damage
        || typeof trigger.damage !== "object"
        || !String(trigger.damage.dice || "").trim()
        || !String(trigger.damage.type || "").trim()
        || !["none", "half"].includes(trigger.damage.onSave)
      )
    ) {
      errors.push("zone-trigger-damage-invalid");
    }
  }
}

function validateZonePolicy(policy, errors) {
  if (!policy || typeof policy !== "object") {
    errors.push("zone-policy-required");
    return;
  }
  if (typeof policy.placementOptional !== "boolean") {
    errors.push("zone-placement-optional-required");
  }
  if (!allowed(SPELL_ZONE_OWNERS, policy.owner)) {
    errors.push("zone-owner-invalid");
  }
  if (!validSpellZoneMovement(policy.movement)) {
    errors.push("zone-movement-invalid");
  }
  if (!allowed(SPELL_ZONE_INITIAL_RESOLUTIONS, policy.initialResolution)) {
    errors.push("zone-initial-resolution-invalid");
  }
  if (
    policy.membershipPaddingSquares !== undefined
    && (
      !Number.isInteger(policy.membershipPaddingSquares)
      || policy.membershipPaddingSquares < 0
    )
  ) {
    errors.push("zone-membership-padding-invalid");
  }
  if (
    policy.targetScope !== undefined
    && !allowed(SPELL_ZONE_TARGET_SCOPES, policy.targetScope)
  ) {
    errors.push("zone-target-scope-invalid");
  }
  if (
    !policy.membershipTargeting
    || typeof policy.membershipTargeting !== "object"
  ) {
    errors.push("zone-membership-targeting-required");
  } else {
    if (!allowed(SPELL_AREA_TARGET_FILTERS, policy.membershipTargeting.filter)) {
      errors.push("zone-membership-filter-invalid");
    }
    if (typeof policy.membershipTargeting.includeCaster !== "boolean") {
      errors.push("zone-membership-include-caster-required");
    }
  }
  if (!Array.isArray(policy.membershipEffects)) {
    errors.push("zone-membership-effects-required");
  } else {
    for (const effect of policy.membershipEffects) {
      validateMembershipEffect(effect, errors);
    }
  }
  if (!Array.isArray(policy.triggers)) {
    errors.push("zone-triggers-required");
  } else {
    validateTriggerEntries(policy.triggers, errors);
  }
}

export function validateSpellAreaRule(rule) {
  const errors = [];
  const triggerType = rule?.trigger?.type;
  const shape = rule?.geometry?.shape;
  const kind = rule?.kind;
  const persistence = rule?.lifecycle?.persistence;

  if (!String(rule?.id || "").trim()) errors.push("id-required");
  if (!String(rule?.spellId || "").trim()) errors.push("spell-id-required");
  if (!allowed(SPELL_AREA_TRIGGER_TYPES, triggerType)) errors.push("trigger-invalid");
  if (
    triggerType === "active-action"
    && !String(rule?.trigger?.actionId || "").trim()
  ) {
    errors.push("action-id-required");
  }
  if (
    triggerType !== "active-action"
    && String(rule?.trigger?.actionId || "").trim()
  ) {
    errors.push("action-id-unexpected");
  }
  if (!allowed(SPELL_AREA_KINDS, kind)) errors.push("kind-invalid");
  if (!allowed(SPELL_AREA_SHAPES, shape)) errors.push("shape-invalid");
  if (!validMeasure(rule?.geometry?.size, MEASURE_BY_SHAPE[shape])) {
    errors.push("size-invalid");
  }
  if (
    rule?.geometry?.width !== undefined
    && !validMeasure(rule.geometry.width, "width")
  ) {
    errors.push("width-invalid");
  }
  if (
    ["line", "rectangle"].includes(shape)
    && !validMeasure(rule?.geometry?.width, "width")
  ) {
    errors.push("line-width-required");
  }
  if (!allowed(SPELL_AREA_ORIGINS, rule?.placement?.origin)) {
    errors.push("origin-invalid");
  }
  if (!allowed(SPELL_AREA_DIRECTIONS, rule?.placement?.direction)) {
    errors.push("direction-invalid");
  }
  if (!allowed(SPELL_AREA_ANCHORS, rule?.placement?.anchor)) {
    errors.push("anchor-invalid");
  }
  if (
    rule?.placement?.range !== undefined
    && !validMeasure(rule.placement.range, "range")
  ) {
    errors.push("range-invalid");
  }
  if (
    rule?.placement?.origin === "point"
    && !validMeasure(rule?.placement?.range, "range")
  ) {
    errors.push("point-range-required");
  }
  if (
    rule?.placement?.origin === "caster-adjacent"
    && !["cone", "line", "rectangle"].includes(shape)
  ) {
    errors.push("caster-adjacent-shape-invalid");
  }
  if (
    ["cone", "line", "rectangle"].includes(shape)
    && rule?.placement?.direction !== "pointer"
  ) {
    errors.push("direction-required");
  }
  if (
    ["circle", "square"].includes(shape)
    && rule?.placement?.direction !== "none"
  ) {
    errors.push("direction-unexpected");
  }
  if (!allowed(SPELL_AREA_PERSISTENCE, persistence)) {
    errors.push("persistence-invalid");
  }
  if (rule?.lifecycle?.endsWithSpell !== (persistence === "spell")) {
    errors.push("spell-lifecycle-mismatch");
  }
  if (!allowed(SPELL_AREA_TARGET_FILTERS, rule?.targeting?.filter)) {
    errors.push("target-filter-invalid");
  }
  if (typeof rule?.targeting?.includeCaster !== "boolean") {
    errors.push("include-caster-required");
  }
  if (typeof rule?.targeting?.confirmTargets !== "boolean") {
    errors.push("confirm-targets-required");
  }
  if (
    rule?.targeting?.selectionMode !== undefined
    && !allowed(SPELL_AREA_SELECTION_MODES, rule.targeting.selectionMode)
  ) {
    errors.push("target-selection-mode-invalid");
  }
  if (!allowed(SPELL_AREA_EFFECT_MODES, rule?.effectPolicy?.mode)) {
    errors.push("effect-mode-invalid");
  }
  if (rule?.effectPolicy?.mode === "while-inside") {
    const effect = rule.effectPolicy.effect;
    const condition = String(effect?.condition || "").trim();
    if (!String(effect?.id || "").trim()) errors.push("inside-effect-id-required");
    if (!String(effect?.label || condition).trim()) {
      errors.push("inside-effect-label-required");
    }
    if (!condition && !["buff", "debuff"].includes(effect?.kind)) {
      errors.push("inside-effect-kind-invalid");
    }
  }
  if (
    kind === "aura"
    && (
      rule?.placement?.origin !== "caster"
      || rule?.placement?.anchor !== "caster"
      || persistence !== "spell"
    )
  ) {
    errors.push("aura-lifecycle-invalid");
  }
  if (
    kind === "emission"
    && (triggerType !== "active-action" || persistence !== "preview")
  ) {
    errors.push("emission-lifecycle-invalid");
  }
  if (kind === "zone") {
    validateZonePolicy(rule?.zonePolicy, errors);
  } else if (rule?.zonePolicy !== undefined) {
    errors.push("zone-policy-unexpected");
  }
  if (rule?.triggerPolicy !== undefined) {
    if (kind !== "aura" || !Array.isArray(rule.triggerPolicy?.triggers)) {
      errors.push("trigger-policy-invalid");
    } else {
      validateTriggerEntries(rule.triggerPolicy.triggers, errors);
    }
  }

  return {
    valid: errors.length === 0,
    errors: Object.freeze(errors),
  };
}

function defineRule(rule) {
  const nextRule = withReminderResolutionData(rule);
  const validation = validateSpellAreaRule(nextRule);
  if (!validation.valid) {
    throw new Error(`Invalid spell area rule "${nextRule?.id || "unknown"}": ${validation.errors.join(", ")}`);
  }
  return deepFreeze(nextRule);
}

const meters = (value, measure) => Object.freeze({ value, unit: "m", measure });

const CAST_TRIGGER = Object.freeze({ type: "cast" });
const COMMON_TARGETING = Object.freeze({
  filter: "all",
  includeCaster: false,
  confirmTargets: true,
});
const CASTER_INCLUDED_TARGETING = Object.freeze({
  ...COMMON_TARGETING,
  includeCaster: true,
});
const CASTER_EXCLUDED_AREA_SAVE_SPELL_IDS = new Set([
  "xanathar-rombo-di-tuono",
  "xanathar-scossa-tellurica",
]);
const areaSaveTargeting = (spellId) =>
  AREA_SAVE_SPELL_ID_SET.has(spellId)
    && !CASTER_EXCLUDED_AREA_SAVE_SPELL_IDS.has(spellId)
    ? CASTER_INCLUDED_TARGETING
    : COMMON_TARGETING;
const PREVIEW_LIFECYCLE = Object.freeze({
  persistence: "preview",
  endsWithSpell: false,
});
const SPELL_LIFECYCLE = Object.freeze({
  persistence: "spell",
  endsWithSpell: true,
});
const ON_CONFIRM = Object.freeze({ mode: "on-confirm" });
const difficultTerrainEffect = (id, label, detail, costMultiplier = 2) => ({
  id,
  kind: "debuff",
  label,
  detail,
  mechanics: {
    movement: {
      costMultiplier,
      category: "difficult-terrain",
      label,
    },
  },
});
const conditionMembershipEffect = (id, condition, detail) => ({
  id,
  condition,
  label: condition,
  detail,
});
const ZONE_INITIAL_SAVE_SPELL_IDS = new Set([
  "antipathy-sympathy",
  "earthquake",
  "entangle",
  "grease",
  "incendiary-cloud",
  "insect-plague",
  "reverse-gravity",
  "storm-of-vengeance",
  "wall-of-fire",
  "wall-of-ice",
  "wall-of-thorns",
  "wind-wall",
  "xanathar-alba",
  "xanathar-creare-falo",
  "xanathar-muro-di-luce",
  "xanathar-sfera-acquea",
  "xanathar-sfera-della-tempesta",
  "xanathar-trasmutare-roccia",
  "xanathar-turbine",
  "phb2014-tsunami",
]);
const CATALOG_ZONE_TRIGGERS = Object.freeze({
  "control-water": [
    {
      id: "control-water-whirlpool-save-on-entry",
      group: "control-water-whirlpool-save",
      label: "Se entra nel vortice (raggio 7,5 m): TS Forza",
      event: "enter",
      frequency: "once-per-turn",
      resolution: "manual-save",
      failureEffect: "2d8 contundenti e resta intrappolato; metà danni e non resta intrappolato se supera.",
      requiresOwnTurn: false,
      triggerOnAreaMove: false,
      persistsAfterExit: true,
      requiresChildZone: true,
      requiresRuleChoices: ["whirlpool"],
      ruleChoice: "whirlpool",
      damage: {
        dice: "2d8",
        type: "contundenti",
        onSave: "half",
      },
    },
    {
      id: "control-water-whirlpool-save-on-turn-start",
      group: "control-water-whirlpool-save",
      label: "Se inizia il turno nel vortice (raggio 7,5 m): TS Forza",
      event: "turn-start",
      frequency: "once-per-turn",
      resolution: "manual-save",
      failureEffect: "2d8 contundenti e resta intrappolato; metà danni e non resta intrappolato se supera.",
      requiresRuleChoices: ["whirlpool"],
      requiresChildZone: true,
      ruleChoice: "whirlpool",
      damage: {
        dice: "2d8",
        type: "contundenti",
        onSave: "half",
      },
    },
    {
      id: "control-water-flood-wave-on-source-turn-start",
      group: "control-water-flood-wave",
      label: "Inondazione: ripeti l'onda all'inizio del turno del caster",
      event: "turn-start",
      frequency: "once-per-turn",
      resolution: "informational",
      requiresSourceTurn: true,
      targetMode: "caster",
      ruleChoice: "flood",
      requiresRuleChoices: ["flood"],
    },
  ],
  "earthquake": [
    {
      id: "earthquake-concentration-save-on-cast",
      group: "earthquake-concentration-save-on-cast",
      label: "TS Costituzione: se fallisce, perde la concentrazione.",
      event: "cast",
      frequency: "once",
      resolution: "informational",
      requiresConcentration: true,
    },
    {
      id: "earthquake-structure-damage-on-cast",
      group: "earthquake-structure-damage-on-cast",
      label: "Strutture: 50 danni contundenti al lancio; se crollano, TS Des (5d6, Prono e sepolto se fallisce).",
      event: "cast",
      frequency: "once",
      resolution: "informational",
      targetMode: "caster",
    },
    {
      id: "earthquake-fissures-on-source-turn-start",
      group: "earthquake-fissures-on-source-turn-start",
      label: "Genera 1d6 fessure; TS Destrezza per chi occupa uno spazio scelto, o cade nella fessura.",
      event: "turn-start",
      frequency: "once",
      resolution: "informational",
      requiresSourceTurn: true,
      targetMode: "caster",
      resolutionData: { actionId: "earthquake-fissures" },
    },
    {
      id: "earthquake-structure-damage-on-source-turn-start",
      group: "earthquake-structure-damage-on-source-turn-start",
      label: "Strutture: 50 danni contundenti; se crollano, TS Des (5d6, Prono e sepolto se fallisce).",
      event: "turn-start",
      frequency: "once-per-turn",
      resolution: "informational",
      requiresSourceTurn: true,
      targetMode: "caster",
    },
    {
      id: "earthquake-ground-save-on-source-turn-end",
      group: "earthquake-ground-save-on-source-turn-end",
      label: "TS Destrezza a fine turno del caster per le creature a terra",
      event: "turn-end",
      frequency: "once-per-turn",
      resolution: "manual-save",
      failureEffect: "Cade Prono.",
      requiresSourceTurn: true,
      targetMode: "members",
      skipConditions: ["Prono"],
    },
  ],
  "xanathar-collera-della-natura": [
    {
      id: "wrath-of-nature-trees-on-source-turn-start",
      group: "wrath-of-nature-trees-on-source-turn-start",
      label: "Alberi: verifica i nemici entro 3 m; TS Destrezza, 4d6 taglienti se falliscono.",
      event: "turn-start",
      frequency: "once-per-turn",
      resolution: "informational",
      requiresSourceTurn: true,
      targetMode: "caster",
    },
    {
      id: "wrath-of-nature-vines-on-source-turn-end",
      group: "wrath-of-nature-vines-on-source-turn-end",
      label: "Liane: scegli una creatura a terra nella zona; TS Forza, Trattenuto se fallisce.",
      event: "turn-end",
      frequency: "once-per-turn",
      resolution: "informational",
      requiresSourceTurn: true,
      targetMode: "caster",
    },
  ],
  "guardian-of-faith": [
    {
      id: "guardian-of-faith-save-on-entry",
      group: "guardian-of-faith-approach",
      label: "TS Destrezza entrando entro 3 m dal Guardiano della Fede",
      event: "enter",
      frequency: "once-per-turn",
      resolution: "manual-save",
      failureEffect: "20 danni radiosi, 10 se superato. Il guardiano svanisce dopo avere inflitto 60 danni totali.",
      requiresOwnTurn: false,
      triggerOnAreaMove: false,
      damage: {
        dice: "20",
        type: "radiosi",
        onSave: "half",
      },
    },
    {
      id: "guardian-of-faith-save-on-move-within",
      group: "guardian-of-faith-approach",
      label: "TS Destrezza muovendosi entro 3 m dal Guardiano della Fede",
      event: "move",
      frequency: "once-per-turn",
      resolution: "manual-save",
      failureEffect: "20 danni radiosi, 10 se superato. Il guardiano svanisce dopo avere inflitto 60 danni totali.",
      requiresOwnTurn: false,
      triggerOnAreaMove: false,
      damage: {
        dice: "20",
        type: "radiosi",
        onSave: "half",
      },
    },
  ],
  "gust-of-wind": [{
    id: "gust-of-wind-save-on-turn-start",
    group: "gust-of-wind-save-on-turn-start",
    label: "TS Forza a inizio turno nella Folata di Vento",
    event: "turn-start",
    frequency: "once-per-turn",
    resolution: "manual-save",
    failureEffect: "Spinta di 4,5 m lontano dal caster, nella direzione della linea.",
  }],
  "spike-growth": [
    {
      id: "spike-growth-damage-on-entry",
      group: "spike-growth-movement-damage",
      label: "Conta 2d4 danni perforanti per ogni 1,5 m percorsi nella Crescita di Spine.",
      event: "enter",
      frequency: "once-per-turn",
      resolution: "informational",
      requiresOwnTurn: false,
      triggerOnAreaMove: false,
    },
    {
      id: "spike-growth-damage-on-move",
      group: "spike-growth-movement-damage",
      label: "Conta 2d4 danni perforanti per ogni 1,5 m percorsi nella Crescita di Spine.",
      event: "move",
      frequency: "once-per-turn",
      resolution: "informational",
      requiresOwnTurn: false,
      triggerOnAreaMove: false,
    },
    {
      id: "spike-growth-damage-on-leave",
      group: "spike-growth-movement-damage",
      label: "Conta 2d4 danni perforanti per ogni 1,5 m percorsi nella Crescita di Spine.",
      event: "leave",
      frequency: "once-per-turn",
      resolution: "informational",
      requiresOwnTurn: false,
      triggerOnAreaMove: false,
    },
  ],
  "black-tentacles": [
    {
      id: "black-tentacles-save-on-entry",
      group: "black-tentacles-save",
      label: "TS Destrezza entrando nei Tentacoli Neri",
      event: "enter",
      frequency: "once-per-turn",
      resolution: "manual-save",
      failureEffect: "3d6 danni contundenti ed è Trattenuto. Può usare un'azione per effettuare una prova di Forza o Destrezza contro la CD della spell e liberarsi.",
      requiresOwnTurn: false,
      triggerOnAreaMove: false,
    },
    {
      id: "black-tentacles-save-on-turn-start",
      group: "black-tentacles-save",
      label: "TS Destrezza a inizio turno nei Tentacoli Neri",
      event: "turn-start",
      frequency: "once-per-turn",
      resolution: "manual-save",
      failureEffect: "3d6 danni contundenti ed è Trattenuto. Può usare un'azione per effettuare una prova di Forza o Destrezza contro la CD della spell e liberarsi.",
      skipConditions: ["Trattenuto"],
    },
    {
      id: "black-tentacles-restrained-damage-on-turn-start",
      group: "black-tentacles-restrained-damage",
      label: "3d6 danni contundenti automatici a inizio turno perché è già Trattenuto dai Tentacoli Neri. Può usare un'azione per effettuare una prova di Forza o Destrezza contro la CD della spell e liberarsi.",
      event: "turn-start",
      frequency: "once-per-turn",
      resolution: "informational",
      requireConditions: ["Trattenuto"],
      damage: {
        dice: "3d6",
        type: "contundenti",
        onSave: "none",
      },
    },
  ],
  "grease": [
    {
      id: "grease-save-on-entry",
      group: "grease-save-on-entry",
      label: "TS Destrezza entrando nell'Unto",
      event: "enter",
      frequency: "once-per-turn",
      resolution: "manual-save",
      failureEffect: "Cade Prono.",
      requiresOwnTurn: false,
      triggerOnAreaMove: false,
    },
    {
      id: "grease-save-on-turn-end",
      group: "grease-save-on-turn-end",
      label: "TS Destrezza a fine turno nell'Unto",
      event: "turn-end",
      frequency: "once-per-turn",
      resolution: "manual-save",
      failureEffect: "Cade Prono.",
    },
  ],
  "sleet-storm": [
    {
      id: "sleet-storm-save-on-entry",
      group: "sleet-storm-prone-save",
      label: "TS Destrezza entrando nella Tempesta di Nevischio",
      event: "enter",
      frequency: "once-per-turn",
      resolution: "manual-save",
      failureEffect: "Cade Prono.",
      requiresOwnTurn: false,
      triggerOnAreaMove: false,
    },
    {
      id: "sleet-storm-save-on-turn-start",
      group: "sleet-storm-prone-save",
      label: "TS Destrezza a inizio turno nella Tempesta di Nevischio",
      event: "turn-start",
      frequency: "once-per-turn",
      resolution: "manual-save",
      failureEffect: "Cade Prono.",
    },
    {
      id: "sleet-storm-concentration-save-on-cast",
      group: "sleet-storm-concentration-save",
      label: "TS Costituzione per mantenere la concentrazione; se fallisce, la perde.",
      event: "cast",
      frequency: "once-per-turn",
      resolution: "informational",
      requiresConcentration: true,
    },
    {
      id: "sleet-storm-concentration-save-on-entry",
      group: "sleet-storm-concentration-save",
      label: "TS Costituzione per mantenere la concentrazione; se fallisce, la perde.",
      event: "enter",
      frequency: "once-per-turn",
      resolution: "informational",
      requiresConcentration: true,
      requiresOwnTurn: false,
      triggerOnAreaMove: false,
    },
    {
      id: "sleet-storm-concentration-save-on-turn-start",
      group: "sleet-storm-concentration-save",
      label: "TS Costituzione per mantenere la concentrazione; se fallisce, la perde.",
      event: "turn-start",
      frequency: "once-per-turn",
      resolution: "informational",
      requiresConcentration: true,
    },
  ],
  "stinking-cloud": [{
    id: "stinking-cloud-save-on-turn-start",
    group: "stinking-cloud-save-on-turn-start",
    label: "TS Costituzione a inizio turno nella Nube Maleodorante",
    event: "turn-start",
    frequency: "once-per-turn",
    resolution: "manual-save",
    failureEffect: "Usa l'azione del turno per vomitare. Le creature che non respirano o sono immuni al veleno superano automaticamente.",
  }],
  "phb2014-nube-di-pugnali": [
    {
      id: "cloud-of-daggers-damage-on-entry",
      group: "cloud-of-daggers-damage",
      label: "4d4 danni taglienti automatici entrando nella Nube di Pugnali.",
      event: "enter",
      frequency: "once-per-turn",
      resolution: "informational",
      requiresOwnTurn: false,
      triggerOnAreaMove: false,
      damage: {
        dice: "4d4",
        type: "taglienti",
        onSave: "none",
      },
    },
    {
      id: "cloud-of-daggers-damage-on-turn-start",
      group: "cloud-of-daggers-damage",
      label: "4d4 danni taglienti automatici a inizio turno nella Nube di Pugnali.",
      event: "turn-start",
      frequency: "once-per-turn",
      resolution: "informational",
      damage: {
        dice: "4d4",
        type: "taglienti",
        onSave: "none",
      },
    },
  ],
  "blade-barrier": [
    {
      id: "blade-barrier-save-on-entry",
      group: "blade-barrier-save-on-entry",
      label: "TS Destrezza entrando nella Barriera di Lame",
      event: "enter",
      frequency: "once-per-turn",
      resolution: "manual-save",
      failureEffect: "6d10 danni taglienti, +1d10 per slot sopra il 6° (metà se superato).",
      requiresOwnTurn: false,
      triggerOnAreaMove: false,
      damage: {
        dice: "6d10",
        type: "taglienti",
        onSave: "half",
      },
    },
    {
      id: "blade-barrier-save-on-turn-start",
      group: "blade-barrier-save-on-turn-start",
      label: "TS Destrezza a inizio turno nella Barriera di Lame",
      event: "turn-start",
      frequency: "once-per-turn",
      resolution: "manual-save",
      failureEffect: "6d10 danni taglienti, +1d10 per slot sopra il 6° (metà se superato).",
      damage: {
        dice: "6d10",
        type: "taglienti",
        onSave: "half",
      },
    },
  ],
  "cloudkill": [
    {
      id: "cloudkill-save-on-entry",
      group: "cloudkill-save-on-entry",
      label: "TS Costituzione entrando nella Nube Mortale",
      event: "enter",
      frequency: "once-per-turn",
      resolution: "manual-save",
      failureEffect: "5d8 danni da veleno, +1d8 per slot sopra il 5° (metà se superato).",
      requiresOwnTurn: false,
      triggerOnAreaMove: false,
      damage: {
        dice: "5d8",
        type: "veleno",
        onSave: "half",
      },
    },
    {
      id: "cloudkill-save-on-turn-start",
      group: "cloudkill-save-on-turn-start",
      label: "TS Costituzione a inizio turno nella Nube Mortale",
      event: "turn-start",
      frequency: "once-per-turn",
      resolution: "manual-save",
      failureEffect: "5d8 danni da veleno, +1d8 per slot sopra il 5° (metà se superato).",
      damage: {
        dice: "5d8",
        type: "veleno",
        onSave: "half",
      },
    },
  ],
  "flaming-sphere": [{
    id: "flaming-sphere-save-on-turn-end",
    group: "flaming-sphere-save-on-turn-end",
    label: "TS Destrezza a fine turno vicino alla Sfera Infuocata",
    event: "turn-end",
    frequency: "once-per-turn",
    resolution: "manual-save",
    failureEffect: "2d6 danni da fuoco, +1d6 per slot sopra il 2° (metà se superato).",
    damage: {
      dice: "2d6",
      type: "fuoco",
      onSave: "half",
    },
  }, {
    id: "flaming-sphere-save-on-contact",
    group: "flaming-sphere-save-on-contact",
    label: "TS Destrezza per contatto con la Sfera Infuocata",
    event: "enter",
    frequency: "once-per-turn",
    resolution: "manual-save",
    targetMode: "direct-members",
    requiresAreaMove: true,
    triggerOnAreaMove: true,
    persistsAfterExit: true,
    failureEffect: "2d6 danni da fuoco, +1d6 per slot sopra il 2° (metà se superato).",
    damage: {
      dice: "2d6",
      type: "fuoco",
      onSave: "half",
    },
  }],
  "incendiary-cloud": [
    {
      id: "incendiary-cloud-save-on-entry",
      group: "incendiary-cloud-save-on-entry",
      label: "TS Destrezza entrando nella Nube Incendiaria",
      event: "enter",
      frequency: "once-per-turn",
      resolution: "manual-save",
      failureEffect: "10d8 danni da fuoco (metà se superato).",
      requiresOwnTurn: false,
      triggerOnAreaMove: false,
      damage: {
        dice: "10d8",
        type: "fuoco",
        onSave: "half",
      },
    },
    {
      id: "incendiary-cloud-save-on-turn-end",
      group: "incendiary-cloud-save-on-turn-end",
      label: "TS Destrezza a fine turno nella Nube Incendiaria",
      event: "turn-end",
      frequency: "once-per-turn",
      resolution: "manual-save",
      failureEffect: "10d8 danni da fuoco (metà se superato).",
      damage: {
        dice: "10d8",
        type: "fuoco",
        onSave: "half",
      },
    },
  ],
  "insect-plague": [
    {
      id: "insect-plague-save-on-entry",
      group: "insect-plague-save-on-entry",
      label: "TS Costituzione entrando nella Piaga degli Insetti",
      event: "enter",
      frequency: "once-per-turn",
      resolution: "manual-save",
      failureEffect: "4d10 danni perforanti, +1d10 per slot sopra il 5° (metà se superato).",
      requiresOwnTurn: false,
      triggerOnAreaMove: false,
      damage: {
        dice: "4d10",
        type: "perforanti",
        onSave: "half",
      },
    },
    {
      id: "insect-plague-save-on-turn-end",
      group: "insect-plague-save-on-turn-end",
      label: "TS Costituzione a fine turno nella Piaga degli Insetti",
      event: "turn-end",
      frequency: "once-per-turn",
      resolution: "manual-save",
      failureEffect: "4d10 danni perforanti, +1d10 per slot sopra il 5° (metà se superato).",
      damage: {
        dice: "4d10",
        type: "perforanti",
        onSave: "half",
      },
    },
  ],
  "wall-of-fire": [
    {
      id: "wall-of-fire-damage-on-entry",
      group: "wall-of-fire-damage-on-entry",
      label: "5d8 danni da fuoco automatici attraversando il Muro di Fuoco.",
      event: "enter",
      frequency: "once-per-turn",
      resolution: "informational",
      requiresOwnTurn: false,
      triggerOnAreaMove: false,
      damage: {
        dice: "5d8",
        type: "fuoco",
        onSave: "none",
      },
    },
    {
      id: "wall-of-fire-damage-on-turn-end",
      group: "wall-of-fire-damage-on-turn-end",
      label: "5d8 danni da fuoco automatici se nel muro o entro 3 m dal lato caldo.",
      event: "turn-end",
      frequency: "once-per-turn",
      resolution: "informational",
      damage: {
        dice: "5d8",
        type: "fuoco",
        onSave: "none",
      },
    },
  ],
  "wall-of-ice": [
    {
      id: "wall-of-ice-frigid-sheet-save-on-entry",
      group: "wall-of-ice-frigid-sheet-save",
      label: "Se attraversa una sezione distrutta del Muro di Ghiaccio: TS Costituzione.",
      event: "enter",
      frequency: "once-per-turn",
      resolution: "manual-save",
      failureEffect: "5d6 danni da freddo, +1d6 per slot sopra il 6° (metà se superato).",
      requiresOwnTurn: false,
      triggerOnAreaMove: false,
      persistsAfterExit: true,
      damage: {
        dice: "5d6",
        type: "freddo",
        onSave: "half",
      },
    },
    {
      id: "wall-of-ice-frigid-sheet-save-on-move",
      group: "wall-of-ice-frigid-sheet-save",
      label: "Se attraversa una sezione distrutta del Muro di Ghiaccio: TS Costituzione.",
      event: "move",
      frequency: "once-per-turn",
      resolution: "manual-save",
      failureEffect: "5d6 danni da freddo, +1d6 per slot sopra il 6° (metà se superato).",
      requiresOwnTurn: false,
      triggerOnAreaMove: false,
      persistsAfterExit: true,
      damage: {
        dice: "5d6",
        type: "freddo",
        onSave: "half",
      },
    },
    {
      id: "wall-of-ice-frigid-sheet-save-on-leave",
      group: "wall-of-ice-frigid-sheet-save",
      label: "Se attraversa una sezione distrutta del Muro di Ghiaccio: TS Costituzione.",
      event: "leave",
      frequency: "once-per-turn",
      resolution: "manual-save",
      failureEffect: "5d6 danni da freddo, +1d6 per slot sopra il 6° (metà se superato).",
      requiresOwnTurn: false,
      triggerOnAreaMove: false,
      persistsAfterExit: true,
      damage: {
        dice: "5d6",
        type: "freddo",
        onSave: "half",
      },
    },
  ],
  "wall-of-thorns": [
    {
      id: "wall-of-thorns-save-on-entry",
      group: "wall-of-thorns-save-on-entry",
      label: "TS Destrezza entrando nel Muro di Spine",
      event: "enter",
      frequency: "once-per-turn",
      resolution: "manual-save",
      failureEffect: "7d8 danni taglienti, +1d8 per slot sopra il 6° (metà se superato).",
      requiresOwnTurn: false,
      triggerOnAreaMove: false,
      damage: {
        dice: "7d8",
        type: "taglienti",
        onSave: "half",
      },
    },
    {
      id: "wall-of-thorns-save-on-turn-end",
      group: "wall-of-thorns-save-on-turn-end",
      label: "TS Destrezza a fine turno nel Muro di Spine",
      event: "turn-end",
      frequency: "once-per-turn",
      resolution: "manual-save",
      failureEffect: "7d8 danni taglienti, +1d8 per slot sopra il 6° (metà se superato).",
      damage: {
        dice: "7d8",
        type: "taglienti",
        onSave: "half",
      },
    },
  ],
  "xanathar-alba": [{
    id: "dawn-save-on-turn-end",
    group: "dawn-save",
    label: "TS Costituzione a fine turno in Alba",
    event: "turn-end",
    frequency: "once-per-turn",
    resolution: "manual-save",
    failureEffect: "4d10 danni radiosi (metà se superato).",
  }],
  "xanathar-diavoletto-di-polvere": [{
    id: "dust-devil-save-on-turn-end",
    group: "dust-devil-save",
    label: "TS Forza a fine turno vicino al Diavoletto di Polvere",
    event: "turn-end",
    frequency: "once-per-turn",
    resolution: "manual-save",
    failureEffect: "Danni contundenti e spinta di 3 m (metà danni e nessuna spinta se superato).",
    damage: {
      dice: "1d8",
      type: "contundenti",
      onSave: "half",
      additionalPerSlotAbove: 1,
      baseSlot: 2,
    },
  }],
  "xanathar-fulgore-nauseante": [
    {
      id: "sickening-radiance-save-on-entry",
      group: "sickening-radiance-save-on-entry",
      label: "TS Costituzione entrando nel Fulgore Nauseante",
      event: "enter",
      frequency: "once-per-turn",
      resolution: "manual-save",
      failureEffect: "4d10 danni radiosi, +1 livello di Indebolimento e invisibilità inefficace (nessun danno se superato).",
      requiresOwnTurn: false,
      triggerOnAreaMove: false,
      damage: {
        dice: "4d10",
        type: "radiosi",
        onSave: "none",
      },
    },
    {
      id: "sickening-radiance-save-on-turn-start",
      group: "sickening-radiance-save-on-turn-start",
      label: "TS Costituzione a inizio turno nel Fulgore Nauseante",
      event: "turn-start",
      frequency: "once-per-turn",
      resolution: "manual-save",
      failureEffect: "4d10 danni radiosi, +1 livello di Indebolimento e invisibilità inefficace (nessun danno se superato).",
      damage: {
        dice: "4d10",
        type: "radiosi",
        onSave: "none",
      },
    },
  ],
  "xanathar-maelstrom": [{
    id: "maelstrom-save-on-turn-start",
    group: "maelstrom-save-on-turn-start",
    label: "TS Forza a inizio turno nel Maelstrom",
    event: "turn-start",
    frequency: "once-per-turn",
    resolution: "manual-save",
    failureEffect: "6d6 danni contundenti e trascinamento di 3 m verso il centro (nessun danno se superato).",
    damage: {
      dice: "6d6",
      type: "contundenti",
      onSave: "none",
    },
  }],
  "xanathar-controllare-venti": [
    {
      id: "control-winds-downdraft-save-on-entry",
      group: "control-winds-downdraft-save",
      label: "TS Forza entrando in volo nella Corrente Discendente",
      event: "enter",
      frequency: "once-per-turn",
      resolution: "manual-save",
      failureEffect: "Se sta volando, cade Prono.",
      requiresOwnTurn: false,
      triggerOnAreaMove: false,
      ruleChoice: "downdraft",
      requiresRuleChoices: ["downdraft"],
    },
    {
      id: "control-winds-downdraft-save-on-turn-start",
      group: "control-winds-downdraft-save",
      label: "TS Forza a inizio turno in volo nella Corrente Discendente",
      event: "turn-start",
      frequency: "once-per-turn",
      resolution: "manual-save",
      failureEffect: "Se sta volando, cade Prono.",
      ruleChoice: "downdraft",
      requiresRuleChoices: ["downdraft"],
    },
  ],
  "xanathar-sfera-acquea": [{
    id: "watery-sphere-save-on-ram",
    group: "watery-sphere-save-on-ram",
    label: "TS Forza: la Sfera Acquea investe il bersaglio.",
    event: "enter",
    frequency: "always",
    resolution: "manual-save",
    failureEffect: "È Trattenuto, immerso nell'acqua e viene trasportato dalla sfera. Le creature Enormi o più grandi superano automaticamente.",
    requiresOwnTurn: false,
    triggerOnAreaMove: true,
    requiresAreaMove: true,
    persistsAfterExit: true,
  }],
  "xanathar-spirito-guaritore": [
    {
      id: "healing-spirit-heal-on-entry",
      group: "healing-spirit-heal",
      label: "Il caster può far recuperare 1d6 PF; +1d6 per slot sopra il 2°. Non funziona su Costrutti o Non Morti.",
      event: "enter",
      frequency: "once-per-turn",
      resolution: "manual-heal",
      healing: { dice: "1d6", additionalPerSlotAbove: 1, baseSlot: 2 },
      requiresOwnTurn: false,
      triggerOnAreaMove: false,
    },
    {
      id: "healing-spirit-heal-on-turn-start",
      group: "healing-spirit-heal",
      label: "Il caster può far recuperare 1d6 PF; +1d6 per slot sopra il 2°. Non funziona su Costrutti o Non Morti.",
      event: "turn-start",
      frequency: "once-per-turn",
      resolution: "manual-heal",
      healing: { dice: "1d6", additionalPerSlotAbove: 1, baseSlot: 2 },
    },
  ],
  "xanathar-creare-falo": [
    {
      id: "create-bonfire-save-on-entry",
      group: "create-bonfire-save-on-entry",
      label: "TS Destrezza entrando nel Falò",
      event: "enter",
      frequency: "once-per-turn",
      resolution: "manual-save",
      failureEffect: "1d8 danni da fuoco, fino a 4d8 in base al livello del caster (nessun danno se superato).",
      requiresOwnTurn: false,
      triggerOnAreaMove: false,
      damage: {
        dice: "1d8",
        type: "fuoco",
        onSave: "none",
      },
    },
    {
      id: "create-bonfire-save-on-turn-end",
      group: "create-bonfire-save-on-turn-end",
      label: "TS Destrezza a fine turno nel Falò",
      event: "turn-end",
      frequency: "once-per-turn",
      resolution: "manual-save",
      failureEffect: "1d8 danni da fuoco, fino a 4d8 in base al livello del caster (nessun danno se superato).",
      damage: {
        dice: "1d8",
        type: "fuoco",
        onSave: "none",
      },
    },
  ],
  "xanathar-oscurita-della-follia": [{
    id: "maddening-darkness-save-on-turn-start",
    group: "maddening-darkness-save",
    label: "TS Saggezza a inizio turno nell'Oscurità della Follia",
    event: "turn-start",
    frequency: "once-per-turn",
    resolution: "manual-save",
    failureEffect: "8d8 danni psichici (metà se superato).",
  }],
  "xanathar-sfera-della-tempesta": [{
    id: "storm-sphere-save-on-turn-end",
    group: "storm-sphere-save",
    label: "TS Forza a fine turno nella Sfera della Tempesta",
    event: "turn-end",
    frequency: "once-per-turn",
    resolution: "manual-save",
    failureEffect: "2d6 danni contundenti (nessun danno se superato).",
  }],
  "xanathar-muro-di-luce": [{
    id: "wall-of-light-damage-on-turn-end",
    group: "wall-of-light-damage-on-turn-end",
    label: "4d8 danni radiosi automatici a fine turno nel Muro di Luce.",
    event: "turn-end",
    frequency: "once-per-turn",
    resolution: "informational",
    damage: {
      dice: "4d8",
      type: "radiosi",
      onSave: "none",
    },
  }],
  "phb2014-cordone-di-frecce": [
    {
      id: "cordon-of-arrows-save-on-entry",
      group: "cordon-of-arrows-save-on-entry",
      label: "TS Destrezza entrando nel Cordone di Frecce",
      event: "enter",
      frequency: "once-per-turn",
      resolution: "manual-save",
      failureEffect: "Se non designato: 1d6 danni perforanti; la munizione si distrugge anche se il TS è superato.",
      requiresOwnTurn: false,
      triggerOnAreaMove: false,
      damage: {
        dice: "1d6",
        type: "perforanti",
        onSave: "none",
      },
    },
    {
      id: "cordon-of-arrows-save-on-turn-end",
      group: "cordon-of-arrows-save-on-turn-end",
      label: "TS Destrezza a fine turno nel Cordone di Frecce",
      event: "turn-end",
      frequency: "once-per-turn",
      resolution: "manual-save",
      failureEffect: "Se non designato: 1d6 danni perforanti; la munizione si distrugge anche se il TS è superato.",
      damage: {
        dice: "1d6",
        type: "perforanti",
        onSave: "none",
      },
    },
  ],
  "phb2014-fame-di-hadar": [
    {
      id: "hunger-of-hadar-damage-on-turn-start",
      group: "hunger-of-hadar-damage-on-turn-start",
      label: "2d6 danni da freddo automatici a inizio turno nella Fame di Hadar.",
      event: "turn-start",
      frequency: "once-per-turn",
      resolution: "informational",
      damage: {
        dice: "2d6",
        type: "freddo",
        onSave: "none",
      },
    },
    {
      id: "hunger-of-hadar-save-on-turn-end",
      group: "hunger-of-hadar-save-on-turn-end",
      label: "TS Destrezza a fine turno nella Fame di Hadar",
      event: "turn-end",
      frequency: "once-per-turn",
      resolution: "manual-save",
      failureEffect: "2d6 danni da acido (nessun danno se superato).",
      damage: {
        dice: "2d6",
        type: "acido",
        onSave: "none",
      },
    },
  ],
});

// Only triggers with an explicit entry here become actionable reminders.  The
// catalog labels remain presentation text; they are never parsed to infer a
// saving throw or an effect.
const REMINDER_TRIGGER_RESOLUTION_DATA = Object.freeze({
  "control-water-whirlpool-save-on-entry": {
    ability: "str",
    failureCondition: { condition: "Intrappolato nel vortice" },
  },
  "control-water-whirlpool-save-on-turn-start": {
    ability: "str",
    failureCondition: { condition: "Intrappolato nel vortice" },
  },
  "earthquake-ground-save-on-source-turn-end": {
    ability: "dex",
    failureCondition: { condition: "Prono" },
  },
  "guardian-of-faith-save-on-entry": { ability: "dex" },
  "guardian-of-faith-save-on-move-within": { ability: "dex" },
  "black-tentacles-save-on-entry": {
    ability: "dex",
    failureCondition: { condition: "Trattenuto" },
    damage: { dice: "3d6", type: "contundenti", onSave: "none" },
  },
  "black-tentacles-save-on-turn-start": {
    ability: "dex",
    failureCondition: { condition: "Trattenuto" },
    damage: { dice: "3d6", type: "contundenti", onSave: "none" },
  },
  "grease-save-on-entry": {
    ability: "dex",
    failureCondition: { condition: "Prono" },
  },
  "grease-save-on-turn-end": {
    ability: "dex",
    failureCondition: { condition: "Prono" },
  },
  "sleet-storm-save-on-entry": {
    ability: "dex",
    failureCondition: { condition: "Prono" },
  },
  "sleet-storm-save-on-turn-start": {
    ability: "dex",
    failureCondition: { condition: "Prono" },
  },
  "blade-barrier-save-on-entry": { ability: "dex" },
  "blade-barrier-save-on-turn-start": { ability: "dex" },
  "cloudkill-save-on-entry": { ability: "con" },
  "cloudkill-save-on-turn-start": { ability: "con" },
  "flaming-sphere-save-on-turn-end": { ability: "dex" },
  "flaming-sphere-save-on-contact": { ability: "dex" },
  "dust-devil-save-on-turn-end": {
    ability: "str",
    damage: {
      dice: "1d8",
      type: "contundenti",
      onSave: "half",
      additionalPerSlotAbove: 1,
      baseSlot: 2,
    },
  },
  "incendiary-cloud-save-on-entry": { ability: "dex" },
  "incendiary-cloud-save-on-turn-end": { ability: "dex" },
  "insect-plague-save-on-entry": { ability: "con" },
  "insect-plague-save-on-turn-end": { ability: "con" },
  "wall-of-ice-frigid-sheet-save-on-entry": { ability: "con" },
  "wall-of-ice-frigid-sheet-save-on-move": { ability: "con" },
  "wall-of-ice-frigid-sheet-save-on-leave": { ability: "con" },
  "wall-of-thorns-save-on-entry": { ability: "dex" },
  "wall-of-thorns-save-on-turn-end": { ability: "dex" },
  "dawn-save-on-turn-end": {
    ability: "con",
    damage: { dice: "4d10", type: "radiosi", onSave: "half" },
  },
  "sickening-radiance-save-on-entry": { ability: "con" },
  "sickening-radiance-save-on-turn-start": { ability: "con" },
  "maelstrom-save-on-turn-start": { ability: "str" },
  "control-winds-downdraft-save-on-entry": {
    ability: "str",
    failureCondition: { condition: "Prono" },
  },
  "control-winds-downdraft-save-on-turn-start": {
    ability: "str",
    failureCondition: { condition: "Prono" },
  },
  "watery-sphere-save-on-ram": {
    ability: "str",
    failureCondition: { condition: "Trattenuto" },
  },
  "create-bonfire-save-on-entry": { ability: "dex" },
  "create-bonfire-save-on-turn-end": { ability: "dex" },
  "maddening-darkness-save-on-turn-start": {
    ability: "wis",
    damage: { dice: "8d8", type: "psichici", onSave: "half" },
  },
  "storm-sphere-save-on-turn-end": {
    ability: "str",
    damage: { dice: "2d6", type: "contundenti", onSave: "none" },
  },
  "cordon-of-arrows-save-on-entry": { ability: "dex" },
  "cordon-of-arrows-save-on-turn-end": { ability: "dex" },
  "hunger-of-hadar-save-on-turn-end": { ability: "dex" },
  "web-save-on-entry": {
    ability: "dex",
    failureCondition: { condition: "Trattenuto" },
  },
  "web-save-on-turn-start": {
    ability: "dex",
    failureCondition: { condition: "Trattenuto" },
  },
  "moonbeam-save-on-entry": { ability: "con" },
  "moonbeam-save-on-turn-start": { ability: "con" },
  "healing-spirit-heal-on-entry": {
    healing: { dice: "1d6", additionalPerSlotAbove: 1, baseSlot: 2 },
  },
  "healing-spirit-heal-on-turn-start": {
    healing: { dice: "1d6", additionalPerSlotAbove: 1, baseSlot: 2 },
  },
  "spirit-guardians-save-on-entry": { ability: "wis" },
  "spirit-guardians-save-on-turn-start": { ability: "wis" },
});

function enrichReminderTriggers(triggers) {
  if (!Array.isArray(triggers)) return triggers;
  return triggers.map((trigger) => {
    const data = REMINDER_TRIGGER_RESOLUTION_DATA[trigger?.id];
    if (!data) return trigger;
    const resolutionData = {
      ...(trigger?.resolutionData && typeof trigger.resolutionData === "object"
        ? trigger.resolutionData
        : {}),
      ...(trigger?.damage ? { damage: trigger.damage } : {}),
      ...(trigger?.healing ? { healing: trigger.healing } : {}),
      ...data,
    };
    return {
      ...trigger,
      ...(data.ability ? { ability: data.ability } : {}),
      resolutionData,
    };
  });
}

function withReminderResolutionData(rule) {
  if (!rule || typeof rule !== "object") return rule;
  const zonePolicy = rule.zonePolicy && typeof rule.zonePolicy === "object"
    ? {
      ...rule.zonePolicy,
      triggers: enrichReminderTriggers(rule.zonePolicy.triggers),
    }
    : rule.zonePolicy;
  const triggerPolicy = rule.triggerPolicy && typeof rule.triggerPolicy === "object"
    ? {
      ...rule.triggerPolicy,
      triggers: enrichReminderTriggers(rule.triggerPolicy.triggers),
    }
    : rule.triggerPolicy;
  return {
    ...rule,
    ...(zonePolicy ? { zonePolicy } : {}),
    ...(triggerPolicy ? { triggerPolicy } : {}),
  };
}

function catalogAreaRule(spec) {
  const zone = spec.kind === "zone";
  const aura = spec.kind === "aura";
  const persistent = zone || aura;
  const membershipEffects = {
    "antimagic-field": [{
      id: "antimagic-field-suppression",
      kind: "debuff",
      label: "Magia soppressa / Campo anti-magia",
      detail: "Gli effetti magici sono soppressi finché la creatura resta nel campo.",
    }],
    "black-tentacles": [
      difficultTerrainEffect(
        "black-tentacles-difficult-terrain",
        "Terreno difficile / Tentacoli Neri",
        "I tentacoli rendono l'area terreno difficile.",
      ),
    ],
    "blade-barrier": [
      difficultTerrainEffect(
        "blade-barrier-difficult-terrain",
        "Terreno difficile / Barriera di Lame",
        "Lo spazio occupato dal muro raddoppia il costo del movimento.",
      ),
    ],
    "cloudkill": [
      conditionMembershipEffect(
        "cloudkill-obscured",
        "Accecato",
        "La nube rende l'area pesantemente oscurata.",
      ),
    ],
    "darkness": [
      conditionMembershipEffect(
        "darkness-obscured",
        "Accecato",
        "L'oscurità magica rende la zona pesantemente oscurata.",
      ),
    ],
    "earthquake": [
      difficultTerrainEffect(
        "earthquake-difficult-terrain",
        "Terreno difficile / Terremoto",
        "Il terreno sconvolto raddoppia il costo del movimento.",
      ),
    ],
    "fog-cloud": [
      conditionMembershipEffect(
        "fog-cloud-obscured",
        "Accecato",
        "La nube rende la zona pesantemente oscurata.",
      ),
    ],
    "grease": [
      difficultTerrainEffect(
        "grease-difficult-terrain",
        "Terreno difficile / Unto",
        "Il grasso rende l'area terreno difficile.",
      ),
    ],
    "gust-of-wind": [{
      id: "gust-of-wind-headwind",
      kind: "debuff",
      label: "Movimento verso il caster ×2",
      detail: "Nell'area, ogni metro di movimento verso il caster costa due metri.",
      mechanics: {
        movement: {
          directional: {
            direction: "toward-source",
            costMultiplier: 2,
            label: "Folata di vento: movimento verso il caster ×2",
          },
          label: "Folata di vento: costo direzionale",
        },
      },
    }],
    "incendiary-cloud": [
      conditionMembershipEffect(
        "incendiary-cloud-obscured",
        "Accecato",
        "La nube incendiaria rende l'area pesantemente oscurata.",
      ),
    ],
    "insect-plague": [
      difficultTerrainEffect(
        "insect-plague-difficult-terrain",
        "Terreno difficile / Piaga degli Insetti",
        "Lo sciame raddoppia il costo del movimento.",
      ),
    ],
    "silence": [
      conditionMembershipEffect(
        "silence-zone",
        "Assordato",
        "Nessun suono può essere creato o attraversare la zona.",
      ),
    ],
    "sleet-storm": [
      conditionMembershipEffect(
        "sleet-storm-obscured",
        "Accecato",
        "Nevischio e ghiaccio rendono l'area pesantemente oscurata.",
      ),
      difficultTerrainEffect(
        "sleet-storm-difficult-terrain",
        "Terreno difficile / Tempesta di Nevischio",
        "Il ghiaccio raddoppia il costo del movimento.",
      ),
    ],
    "spike-growth": [
      difficultTerrainEffect(
        "spike-growth-difficult-terrain",
        "Terreno difficile / Crescita di spine",
        "La vegetazione spinosa raddoppia il costo del movimento.",
      ),
    ],
    "stinking-cloud": [
      conditionMembershipEffect(
        "stinking-cloud-obscured",
        "Accecato",
        "La nube rende l'area pesantemente oscurata.",
      ),
    ],
    "wall-of-thorns": [
      difficultTerrainEffect(
        "wall-of-thorns-difficult-terrain",
        "Terreno difficile ×4 / Muro di Spine",
        "Ogni metro percorso nel muro costa quattro metri di movimento.",
        4,
      ),
    ],
    "xanathar-maelstrom": [
      difficultTerrainEffect(
        "maelstrom-difficult-terrain",
        "Terreno difficile / Maelstrom",
        "Le acque turbolente raddoppiano il costo del movimento.",
      ),
    ],
    "xanathar-sfera-della-tempesta": [
      difficultTerrainEffect(
        "storm-sphere-difficult-terrain",
        "Terreno difficile / Sfera della Tempesta",
        "L'aria turbinante raddoppia il costo del movimento.",
      ),
    ],
    "xanathar-collera-della-natura": [
      difficultTerrainEffect(
        "wrath-of-nature-difficult-terrain",
        "Terreno difficile / Collera della Natura",
        "Erba e sottobosco ostacolano le creature ostili.",
      ),
    ],
    "xanathar-oscurita-della-follia": [
      conditionMembershipEffect(
        "maddening-darkness-obscured",
        "Accecato",
        "L'oscurità magica rende la zona pesantemente oscurata.",
      ),
    ],
    "phb2014-fame-di-hadar": [
      conditionMembershipEffect(
        "hunger-of-hadar-blinded",
        "Accecato",
        "Le creature completamente immerse nell'area sono accecate.",
      ),
      difficultTerrainEffect(
        "hunger-of-hadar-difficult-terrain",
        "Terreno difficile / Fame di Hadar",
        "L'area raddoppia il costo del movimento.",
      ),
    ],
    "xanathar-vento-di-interdizione": [
      conditionMembershipEffect(
        "warding-wind-deafened",
        "Assordato",
        "Il vento assorda le creature nella sua area.",
      ),
      difficultTerrainEffect(
        "warding-wind-difficult-terrain",
        "Terreno difficile / Vento di Interdizione",
        "Il vento raddoppia il costo del movimento per le altre creature.",
      ),
    ],
    "phb2014-aura-di-purezza": [{
      id: "aura-of-purity-zone",
      kind: "buff",
      label: "Aura di Purezza",
      detail: "Resistenza ai veleni e vantaggio ai TS contro varie condizioni.",
    }],
    "phb2014-aura-di-vita": [{
      id: "aura-of-life-zone",
      kind: "buff",
      label: "Aura di Vita",
      detail: "Resistenza ai danni necrotici e protezione della vita nell'aura.",
    }],
    "phb2014-cerchio-di-potere": [{
      id: "circle-of-power-zone",
      kind: "buff",
      label: "Cerchio di Potere",
      detail: "Vantaggio ai TS contro incantesimi ed effetti magici nell'aura.",
    }],
  }[spec.spellId] || [];
  const placementChoices = Array.isArray(spec.placementChoices)
    ? spec.placementChoices.map((choice) => ({
      id: String(choice?.id || "").trim(),
      label: String(choice?.label || "").trim(),
      geometry: {
        size: meters(
          choice?.sizeMeters,
          MEASURE_BY_SHAPE[spec.shape],
        ),
      },
    }))
    : [];
  return defineRule({
    id: `${spec.spellId}:cast`,
    spellId: spec.spellId,
    trigger: CAST_TRIGGER,
    kind: spec.kind,
    geometry: {
      shape: spec.shape,
      size: meters(
        spec.sizeMeters,
        MEASURE_BY_SHAPE[spec.shape],
      ),
      ...(["line", "rectangle"].includes(spec.shape)
        ? { width: meters(spec.widthMeters, "width") }
        : {}),
    },
    placement: {
      origin: spec.origin,
      direction: ["cone", "line", "rectangle"].includes(spec.shape)
        ? "pointer"
        : "none",
      anchor: spec.origin === "point" ? "world" : "caster",
      ...(spec.origin === "point"
        ? { range: meters(spec.rangeMeters, "range") }
        : {}),
    },
    lifecycle: persistent ? SPELL_LIFECYCLE : PREVIEW_LIFECYCLE,
    ...(placementChoices.length ? { placementChoices } : {}),
    targeting: areaSaveTargeting(spec.spellId),
    effectPolicy: aura
      ? membershipEffects.length
        ? {
          mode: "while-inside",
          effect: membershipEffects[0],
          effects: membershipEffects,
        }
        : { mode: "manual-trigger" }
      : zone
        ? { mode: "manual-trigger" }
        : ON_CONFIRM,
    ...(zone
      ? {
          zonePolicy: {
          placementOptional: true,
          owner: "caster",
          movement: spec.movement,
          ...(Number.isInteger(spec.membershipPaddingSquares)
            ? { membershipPaddingSquares: spec.membershipPaddingSquares }
            : {}),
          initialResolution: ZONE_INITIAL_SAVE_SPELL_IDS.has(spec.spellId)
            ? "manual-save"
            : "none",
          membershipTargeting: {
            filter: [
              "guardian-of-faith",
              "xanathar-collera-della-natura",
            ].includes(spec.spellId)
              ? "hostile"
              : "all",
            includeCaster: ![
              "guardian-of-faith",
              "gust-of-wind",
              "phb2014-cordone-di-frecce",
            ].includes(spec.spellId),
            ...(spec.spellId === "forcecage"
              ? { containment: "fully-inside" }
              : {}),
          },
          membershipEffects,
          triggers: CATALOG_ZONE_TRIGGERS[spec.spellId] || [],
        },
      }
      : {}),
    ...(spec.note ? { placementNote: spec.note } : {}),
  });
}

function childZoneRule({
  id,
  spellId,
  actionId,
  shape,
  size,
  width = null,
  triggers = [],
}) {
  return defineRule({
    id,
    spellId,
    trigger: { type: "active-action", actionId },
    kind: "zone",
    geometry: {
      shape,
      size: meters(size, MEASURE_BY_SHAPE[shape]),
      ...(width === null ? {} : { width: meters(width, "width") }),
    },
    placement: {
      origin: "point",
      direction: ["line", "rectangle"].includes(shape) ? "pointer" : "none",
      anchor: "world",
      range: meters(1500, "range"),
    },
    lifecycle: SPELL_LIFECYCLE,
    targeting: {
      filter: "all",
      includeCaster: true,
      confirmTargets: true,
    },
    effectPolicy: { mode: "manual-trigger" },
    zonePolicy: {
      placementOptional: false,
      owner: "caster",
      movement: "fixed",
      initialResolution: "none",
      membershipTargeting: {
        filter: "all",
        includeCaster: true,
      },
      membershipEffects: [],
      triggers,
    },
  });
}

export const SPELL_AREA_RULES = Object.freeze([
  defineRule({
    id: "phb2014-allucinazione-di-forza:cast",
    spellId: "phb2014-allucinazione-di-forza",
    trigger: CAST_TRIGGER,
    kind: "zone",
    geometry: {
      shape: "square",
      size: meters(3, "side"),
    },
    placement: {
      origin: "point",
      direction: "none",
      anchor: "world",
      range: meters(18, "range"),
    },
    lifecycle: SPELL_LIFECYCLE,
    targeting: {
      filter: "all",
      includeCaster: true,
      confirmTargets: true,
      selectionMode: "manual",
    },
    effectPolicy: { mode: "manual-trigger" },
    zonePolicy: {
      placementOptional: false,
      owner: "caster",
      movement: "fixed",
      membershipPaddingSquares: 1,
      targetScope: "spell-targets",
      initialResolution: "none",
      membershipTargeting: {
        filter: "all",
        includeCaster: true,
      },
      membershipEffects: [],
      triggers: [{
        id: "phantasmal-force-caster-turn-damage",
        label: "Allucinazione di Forza: 1d6 danni psichici opzionali",
        event: "turn-start",
        frequency: "once-per-turn",
        resolution: "manual-effect",
        targetMode: "members",
        requiresSourceTurn: true,
        damage: { dice: "1d6", type: "psichici", onSave: "none" },
      }],
    },
  }),
  defineRule({
    id: "fireball:cast",
    spellId: "fireball",
    trigger: CAST_TRIGGER,
    kind: "instant",
    geometry: {
      shape: "circle",
      size: meters(6, "radius"),
    },
    placement: {
      origin: "point",
      direction: "none",
      anchor: "world",
      range: meters(45, "range"),
    },
    lifecycle: PREVIEW_LIFECYCLE,
    targeting: areaSaveTargeting("fireball"),
    effectPolicy: ON_CONFIRM,
  }),
  defineRule({
    id: "call-lightning:cast",
    spellId: "call-lightning",
    trigger: CAST_TRIGGER,
    kind: "instant",
    geometry: {
      shape: "circle",
      size: meters(1.5, "radius"),
    },
    placement: {
      origin: "point",
      direction: "none",
      anchor: "world",
      range: meters(36, "range"),
    },
    lifecycle: PREVIEW_LIFECYCLE,
    targeting: areaSaveTargeting("call-lightning"),
    effectPolicy: ON_CONFIRM,
  }),
  defineRule({
    id: "call-lightning:cloud",
    spellId: "call-lightning",
    trigger: CAST_TRIGGER,
    kind: "zone",
    geometry: {
      shape: "circle",
      size: meters(18, "radius"),
    },
    placement: {
      origin: "point",
      direction: "none",
      anchor: "world",
      range: meters(36, "range"),
    },
    lifecycle: SPELL_LIFECYCLE,
    targeting: {
      filter: "all",
      includeCaster: false,
      confirmTargets: false,
    },
    effectPolicy: {
      mode: "manual-trigger",
    },
    zonePolicy: {
      placementOptional: true,
      owner: "caster",
      movement: "fixed",
      initialResolution: "none",
      membershipTargeting: {
        filter: "all",
        includeCaster: false,
      },
      membershipEffects: [],
      triggers: [],
    },
  }),
  defineRule({
    id: "xanathar-arma-sacra:burst",
    spellId: "xanathar-arma-sacra",
    trigger: {
      type: "active-action",
      actionId: "holy-weapon-dismiss",
    },
    kind: "emission",
    geometry: {
      shape: "circle",
      size: meters(9, "radius"),
    },
    placement: {
      origin: "point",
      direction: "none",
      anchor: "world",
      range: meters(1500, "range"),
    },
    lifecycle: PREVIEW_LIFECYCLE,
    targeting: {
      filter: "all",
      includeCaster: true,
      confirmTargets: true,
    },
    effectPolicy: ON_CONFIRM,
  }),
  defineRule({
    id: "burning-hands:cast",
    spellId: "burning-hands",
    trigger: CAST_TRIGGER,
    kind: "instant",
    geometry: {
      shape: "cone",
      size: meters(4.5, "length"),
    },
    placement: {
      origin: "caster-adjacent",
      direction: "pointer",
      anchor: "caster",
    },
    lifecycle: PREVIEW_LIFECYCLE,
    targeting: areaSaveTargeting("burning-hands"),
    effectPolicy: ON_CONFIRM,
  }),
  defineRule({
    id: "cone-of-cold:cast",
    spellId: "cone-of-cold",
    trigger: CAST_TRIGGER,
    kind: "instant",
    geometry: {
      shape: "cone",
      size: meters(18, "length"),
    },
    placement: {
      origin: "caster-adjacent",
      direction: "pointer",
      anchor: "caster",
    },
    lifecycle: PREVIEW_LIFECYCLE,
    targeting: areaSaveTargeting("cone-of-cold"),
    effectPolicy: ON_CONFIRM,
  }),
  defineRule({
    id: "lightning-bolt:cast",
    spellId: "lightning-bolt",
    trigger: CAST_TRIGGER,
    kind: "instant",
    geometry: {
      shape: "line",
      size: meters(30, "length"),
      width: meters(1.5, "width"),
    },
    placement: {
      origin: "caster-adjacent",
      direction: "pointer",
      anchor: "caster",
    },
    lifecycle: PREVIEW_LIFECYCLE,
    targeting: areaSaveTargeting("lightning-bolt"),
    effectPolicy: ON_CONFIRM,
  }),
  defineRule({
    id: "web:cast",
    spellId: "web",
    trigger: CAST_TRIGGER,
    kind: "zone",
    geometry: {
      shape: "square",
      size: meters(6, "side"),
    },
    placement: {
      origin: "point",
      direction: "none",
      anchor: "world",
      range: meters(18, "range"),
    },
    lifecycle: SPELL_LIFECYCLE,
    targeting: areaSaveTargeting("web"),
    effectPolicy: {
      mode: "manual-trigger",
    },
    zonePolicy: {
      placementOptional: true,
      owner: "caster",
      movement: "fixed",
      initialResolution: "none",
      membershipTargeting: {
        filter: "all",
        includeCaster: true,
      },
      membershipEffects: [
        difficultTerrainEffect(
          "web-difficult-terrain",
          "Terreno difficile / Ragnatela",
          "La zona di ragnatele raddoppia il costo del movimento.",
        ),
      ],
      triggers: [
        {
          id: "web-save-on-entry",
          group: "web-save",
          label: "TS Destrezza entrando nella Ragnatela",
          event: "enter",
          frequency: "once-per-turn",
          resolution: "manual-save",
          failureEffect: "Trattenuto dalla Ragnatela.",
          requiresOwnTurn: false,
          triggerOnAreaMove: false,
          skipLinkedConditions: ["Trattenuto"],
        },
        {
          id: "web-save-on-turn-start",
          group: "web-save",
          label: "TS Destrezza a inizio turno nella Ragnatela",
          event: "turn-start",
          frequency: "once-per-turn",
          resolution: "manual-save",
          failureEffect: "Trattenuto dalla Ragnatela.",
          skipLinkedConditions: ["Trattenuto"],
        },
      ],
    },
  }),
  defineRule({
    id: "entangle:cast",
    spellId: "entangle",
    trigger: CAST_TRIGGER,
    kind: "zone",
    geometry: {
      shape: "square",
      size: meters(6, "side"),
    },
    placement: {
      origin: "point",
      direction: "none",
      anchor: "world",
      range: meters(27, "range"),
    },
    lifecycle: SPELL_LIFECYCLE,
    targeting: areaSaveTargeting("entangle"),
    effectPolicy: {
      mode: "manual-trigger",
    },
    zonePolicy: {
      placementOptional: true,
      owner: "caster",
      movement: "fixed",
      initialResolution: "manual-save",
      membershipTargeting: {
        filter: "all",
        includeCaster: true,
      },
      membershipEffects: [
        difficultTerrainEffect(
          "entangle-difficult-terrain",
          "Terreno difficile / Intralciare",
          "La vegetazione della zona raddoppia il costo del movimento.",
        ),
      ],
      triggers: [],
    },
  }),
  defineRule({
    id: "moonbeam:cast",
    spellId: "moonbeam",
    trigger: CAST_TRIGGER,
    kind: "zone",
    geometry: {
      shape: "circle",
      size: meters(1.5, "radius"),
    },
    placement: {
      origin: "point",
      direction: "none",
      anchor: "world",
      range: meters(36, "range"),
    },
    lifecycle: SPELL_LIFECYCLE,
    targeting: areaSaveTargeting("moonbeam"),
    effectPolicy: {
      mode: "manual-trigger",
    },
    zonePolicy: {
      placementOptional: true,
      owner: "caster",
      movement: {
        mode: "action",
        economy: "action",
        maximumMeters: 18,
        triggerOnAreaMove: false,
        stopOnFirstContact: false,
      },
      initialResolution: "none",
      membershipTargeting: {
        filter: "all",
        includeCaster: true,
      },
      membershipEffects: [],
      triggers: [
        {
          id: "moonbeam-save-on-entry",
          group: "moonbeam-save",
          label: "TS Costituzione entrando nel Raggio Lunare",
          event: "enter",
          frequency: "once-per-turn",
          resolution: "manual-save",
          failureEffect: "Danni radiosi della spell (metà se superato).",
          requiresOwnTurn: true,
          triggerOnAreaMove: false,
          ruleChoice: "damage",
          damage: {
            dice: "2d10",
            type: "radiosi",
            onSave: "half",
          },
        },
        {
          id: "moonbeam-save-on-turn-start",
          group: "moonbeam-save",
          label: "TS Costituzione a inizio turno nel Raggio Lunare",
          event: "turn-start",
          frequency: "once-per-turn",
          resolution: "manual-save",
          failureEffect: "Danni radiosi della spell (metà se superato).",
          ruleChoice: "damage",
          damage: {
            dice: "2d10",
            type: "radiosi",
            onSave: "half",
          },
        },
      ],
    },
  }),
  defineRule({
    id: "spirit-guardians:aura",
    spellId: "spirit-guardians",
    trigger: CAST_TRIGGER,
    kind: "aura",
    geometry: {
      shape: "circle",
      size: meters(4.5, "radius"),
    },
    placement: {
      origin: "caster",
      direction: "none",
      anchor: "caster",
    },
    lifecycle: SPELL_LIFECYCLE,
    targeting: {
      filter: "hostile",
      includeCaster: false,
      confirmTargets: true,
    },
    effectPolicy: {
      mode: "while-inside",
      effect: {
        id: "spirit-guardians-speed",
        kind: "debuff",
        label: "Velocità dimezzata / Guardiani Spirituali",
        detail: "La velocità è dimezzata finché la creatura resta nell'aura.",
        mechanics: {
          movement: {
            multiplier: 0.5,
            label: "Guardiani Spirituali: velocità dimezzata",
          },
        },
      },
    },
    triggerPolicy: {
      triggers: [
        {
          id: "spirit-guardians-save-on-entry",
          group: "spirit-guardians-save",
          label: "TS Saggezza entrando nei Guardiani Spirituali",
          event: "enter",
          frequency: "once-per-turn",
          resolution: "manual-save",
          failureEffect: "3d8 danni radiosi o necrotici, +1d8 per slot sopra il 3° (metà se superato).",
          requiresOwnTurn: false,
          triggerOnAreaMove: false,
          damage: {
            dice: "3d8",
            type: "radiosi o necrotici",
            onSave: "half",
          },
        },
        {
          id: "spirit-guardians-save-on-turn-start",
          group: "spirit-guardians-save",
          label: "TS Saggezza a inizio turno nei Guardiani Spirituali",
          event: "turn-start",
          frequency: "once-per-turn",
          resolution: "manual-save",
          failureEffect: "3d8 danni radiosi o necrotici, +1d8 per slot sopra il 3° (metà se superato).",
          damage: {
            dice: "3d8",
            type: "radiosi o necrotici",
            onSave: "half",
          },
        },
      ],
    },
  }),
  defineRule({
    id: "xanathar-investitura-della-fiamma:aura",
    spellId: "xanathar-investitura-della-fiamma",
    trigger: CAST_TRIGGER,
    kind: "aura",
    geometry: {
      shape: "circle",
      size: meters(1.5, "radius"),
    },
    placement: {
      origin: "caster",
      direction: "none",
      anchor: "caster",
    },
    lifecycle: SPELL_LIFECYCLE,
    targeting: {
      filter: "all",
      includeCaster: false,
      confirmTargets: false,
    },
    effectPolicy: {
      mode: "manual-trigger",
    },
    triggerPolicy: {
      triggers: [
        {
          id: "flame-investiture-damage-on-entry",
          group: "flame-investiture-damage",
          label: "1d10 fuoco entrando nell'aura",
          event: "enter",
          frequency: "once-per-turn",
          resolution: "manual-effect",
          failureEffect: "1d10 danni da fuoco (nessun TS).",
          requiresOwnTurn: false,
          triggerOnAreaMove: false,
          damage: {
            dice: "1d10",
            type: "fuoco",
            onSave: "none",
          },
        },
        {
          id: "flame-investiture-damage-on-turn-end",
          group: "flame-investiture-damage",
          label: "1d10 fuoco a fine turno nell'aura",
          event: "turn-end",
          frequency: "once-per-turn",
          resolution: "manual-effect",
          failureEffect: "1d10 danni da fuoco (nessun TS).",
          damage: {
            dice: "1d10",
            type: "fuoco",
            onSave: "none",
          },
        },
      ],
    },
  }),
  defineRule({
    id: "xanathar-investitura-della-fiamma:linea-di-fuoco",
    spellId: "xanathar-investitura-della-fiamma",
    trigger: {
      type: "active-action",
      actionId: "flame-investiture-line",
    },
    kind: "emission",
    geometry: {
      shape: "line",
      size: meters(4.5, "length"),
      width: meters(1.5, "width"),
    },
    placement: {
      origin: "caster-adjacent",
      direction: "pointer",
      anchor: "caster",
    },
    lifecycle: PREVIEW_LIFECYCLE,
    targeting: {
      filter: "all",
      includeCaster: false,
      confirmTargets: true,
    },
    effectPolicy: ON_CONFIRM,
  }),
  defineRule({
    id: "xanathar-investitura-del-ghiaccio:aura",
    spellId: "xanathar-investitura-del-ghiaccio",
    trigger: CAST_TRIGGER,
    kind: "aura",
    geometry: {
      shape: "circle",
      size: meters(3, "radius"),
    },
    placement: {
      origin: "caster",
      direction: "none",
      anchor: "caster",
    },
    lifecycle: SPELL_LIFECYCLE,
    targeting: {
      filter: "all",
      includeCaster: false,
      confirmTargets: false,
    },
    effectPolicy: {
      mode: "while-inside",
      effect: {
        id: "ice-investiture-difficult-terrain",
        kind: "debuff",
        label: "Terreno difficile / aura ghiacciata",
        detail: "Il terreno ghiacciato dell'aura raddoppia il costo del movimento.",
        mechanics: {
          movement: {
            costMultiplier: 2,
            category: "difficult-terrain",
            label: "Aura ghiacciata: terreno difficile",
          },
        },
      },
    },
  }),
  defineRule({
    id: "xanathar-investitura-del-ghiaccio:ice-investiture-cone",
    spellId: "xanathar-investitura-del-ghiaccio",
    trigger: {
      type: "active-action",
      actionId: "ice-investiture-cone",
    },
    kind: "emission",
    geometry: {
      shape: "cone",
      size: meters(4.5, "length"),
    },
    placement: {
      origin: "caster-adjacent",
      direction: "pointer",
      anchor: "caster",
    },
    lifecycle: PREVIEW_LIFECYCLE,
    targeting: {
      filter: "all",
      includeCaster: false,
      confirmTargets: true,
    },
    effectPolicy: ON_CONFIRM,
  }),
  childZoneRule({
    id: "control-water:whirlpool",
    spellId: "control-water",
    actionId: "control-water-whirlpool",
    shape: "circle",
    size: 7.5,
    triggers: CATALOG_ZONE_TRIGGERS["control-water"],
  }),
  childZoneRule({
    id: "earthquake:fissure",
    spellId: "earthquake",
    actionId: "earthquake-fissures",
    shape: "rectangle",
    size: 60,
    width: 3,
  }),
  ...CATALOG_SPELL_AREA_SPECS.map(catalogAreaRule),
]);

const RULES_BY_ID = new Map();
const RULES_BY_SPELL_ID = new Map();

for (const rule of SPELL_AREA_RULES) {
  if (RULES_BY_ID.has(rule.id)) {
    throw new Error(`Duplicate spell area rule id: ${rule.id}`);
  }
  RULES_BY_ID.set(rule.id, rule);
  const spellRules = RULES_BY_SPELL_ID.get(rule.spellId) || [];
  spellRules.push(rule);
  RULES_BY_SPELL_ID.set(rule.spellId, spellRules);
}

for (const [spellId, rules] of RULES_BY_SPELL_ID.entries()) {
  RULES_BY_SPELL_ID.set(spellId, Object.freeze(rules));
}

export function getSpellAreaRuleById(ruleId) {
  const normalizedRuleId = String(ruleId || "").trim();
  return RULES_BY_ID.get(normalizedRuleId)
    || getSpellBoardTokenPlacementRuleById(normalizedRuleId)
    || null;
}

export function getSpellAreaPlacementChoices(value) {
  const spellId = typeof value === "object"
    ? String(value?.id || "").trim()
    : String(value || "").trim();
  const rule = getSpellAreaRules(spellId, { triggerType: "cast" })
    .find((entry) => Array.isArray(entry.placementChoices));
  return (rule?.placementChoices || []).map((choice) => ({
    value: choice.id,
    label: choice.label,
  }));
}

export function getSpellAreaRuleForPlacement(ruleId, ruleChoice = "") {
  const rule = getSpellAreaRuleById(ruleId);
  const choiceId = String(ruleChoice || "").trim();
  const choice = rule?.placementChoices?.find((entry) => entry.id === choiceId);
  if (!rule || !choice) return rule;
  return deepFreeze({
    ...rule,
    geometry: {
      ...rule.geometry,
      ...choice.geometry,
    },
    placementChoice: choice.id,
  });
}

export function getSpellAreaRules(spellId, {
  triggerType = "",
  actionId = "",
} = {}) {
  const rules = RULES_BY_SPELL_ID.get(String(spellId || "").trim()) || [];
  const normalizedTrigger = String(triggerType || "").trim();
  const normalizedAction = String(actionId || "").trim();
  return rules.filter((rule) =>
    (!normalizedTrigger || rule.trigger.type === normalizedTrigger)
    && (!normalizedAction || rule.trigger.actionId === normalizedAction)
  );
}
