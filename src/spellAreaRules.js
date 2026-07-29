import { CATALOG_SPELL_AREA_SPECS } from "./spellAreaCatalog.js";

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
const SPELL_AREA_EFFECT_MODES = Object.freeze([
  "on-confirm",
  "while-inside",
  "manual-trigger",
]);
const SPELL_ZONE_OWNERS = Object.freeze(["caster"]);
const SPELL_ZONE_MOVEMENTS = Object.freeze(["fixed", "manual", "drift"]);
const SPELL_ZONE_EVENTS = Object.freeze([
  "cast",
  "enter",
  "leave",
  "turn-start",
  "turn-end",
]);
const SPELL_ZONE_FREQUENCIES = Object.freeze([
  "once",
  "once-per-turn",
  "always",
]);
const SPELL_ZONE_RESOLUTIONS = Object.freeze([
  "manual-save",
  "manual-effect",
]);

const MEASURE_BY_SHAPE = Object.freeze({
  circle: "radius",
  square: "side",
  cone: "length",
  line: "length",
});

const allowed = (values, value) => values.includes(value);

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
  if (!allowed(SPELL_ZONE_MOVEMENTS, policy.movement)) {
    errors.push("zone-movement-invalid");
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
    for (const trigger of policy.triggers) {
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
        trigger?.skipLinkedConditions !== undefined
        && (
          !Array.isArray(trigger.skipLinkedConditions)
          || trigger.skipLinkedConditions.some((name) => !String(name || "").trim())
        )
      ) {
        errors.push("zone-trigger-skip-conditions-invalid");
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
  if (shape === "line" && !validMeasure(rule?.geometry?.width, "width")) {
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
    && !["cone", "line"].includes(shape)
  ) {
    errors.push("caster-adjacent-shape-invalid");
  }
  if (
    ["cone", "line"].includes(shape)
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

  return {
    valid: errors.length === 0,
    errors: Object.freeze(errors),
  };
}

function defineRule(rule) {
  const validation = validateSpellAreaRule(rule);
  if (!validation.valid) {
    throw new Error(`Invalid spell area rule "${rule?.id || "unknown"}": ${validation.errors.join(", ")}`);
  }
  return deepFreeze(rule);
}

const meters = (value, measure) => Object.freeze({ value, unit: "m", measure });

const CAST_TRIGGER = Object.freeze({ type: "cast" });
const COMMON_TARGETING = Object.freeze({
  filter: "all",
  includeCaster: false,
  confirmTargets: true,
});
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
      ...(spec.shape === "line"
        ? { width: meters(spec.widthMeters, "width") }
        : {}),
    },
    placement: {
      origin: spec.origin,
      direction: ["cone", "line"].includes(spec.shape)
        ? "pointer"
        : "none",
      anchor: spec.origin === "point" ? "world" : "caster",
      ...(spec.origin === "point"
        ? { range: meters(spec.rangeMeters, "range") }
        : {}),
    },
    lifecycle: persistent ? SPELL_LIFECYCLE : PREVIEW_LIFECYCLE,
    targeting: COMMON_TARGETING,
    effectPolicy: aura
      ? membershipEffects.length
        ? { mode: "while-inside", effect: membershipEffects[0] }
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
          membershipTargeting: {
            filter: spec.spellId === "xanathar-collera-della-natura"
              ? "hostile"
              : "all",
            includeCaster: true,
          },
          membershipEffects,
          triggers: [],
        },
      }
      : {}),
    ...(spec.note ? { placementNote: spec.note } : {}),
  });
}

export const SPELL_AREA_RULES = Object.freeze([
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
    targeting: COMMON_TARGETING,
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
    targeting: COMMON_TARGETING,
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
    targeting: COMMON_TARGETING,
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
    targeting: COMMON_TARGETING,
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
    targeting: COMMON_TARGETING,
    effectPolicy: {
      mode: "manual-trigger",
    },
    zonePolicy: {
      placementOptional: true,
      owner: "caster",
      movement: "fixed",
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
    targeting: COMMON_TARGETING,
    effectPolicy: {
      mode: "manual-trigger",
    },
    zonePolicy: {
      placementOptional: true,
      owner: "caster",
      movement: "fixed",
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
    targeting: COMMON_TARGETING,
    effectPolicy: {
      mode: "manual-trigger",
    },
    zonePolicy: {
      placementOptional: true,
      owner: "caster",
      movement: "manual",
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
  return RULES_BY_ID.get(String(ruleId || "").trim()) || null;
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
