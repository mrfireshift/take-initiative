import test from "node:test";
import assert from "node:assert/strict";

import {
  SPELL_AREA_RULES,
  getSpellAreaRuleById,
  getSpellAreaRules,
  validateSpellAreaRule,
} from "../src/spellAreaRules.js";
import {
  AREA_FIELD_NON_POPOVER_REASONS,
  AREA_PLACEMENT_ONLY_SPELL_IDS,
  AREA_POPOVER_SPELL_IDS,
  AREA_SAVE_SPELL_IDS,
} from "../src/areaSaveSpellRules.js";
import { SPELL_ZONE_TRIGGER_WORKFLOW_ENABLED } from "../src/spellZoneTriggerCore.js";
import { getSpellCatalog, getSpellDefinition } from "../src/spells-srd.js";

test("tutte le regole iniziali rispettano il contratto e puntano al catalogo", () => {
  assert.ok(SPELL_AREA_RULES.length > 0);
  for (const rule of SPELL_AREA_RULES) {
    assert.deepEqual(validateSpellAreaRule(rule), {
      valid: true,
      errors: [],
    });
    assert.ok(getSpellDefinition(rule.spellId), rule.spellId);
    assert.equal(Object.isFrozen(rule), true);
    assert.equal(Object.isFrozen(rule.geometry), true);
    assert.equal(Object.isFrozen(rule.geometry.size), true);
  }
});

test("il lookup distingue cast e attivazioni della stessa spell", () => {
  const spellId = "xanathar-investitura-del-ghiaccio";
  const allRules = getSpellAreaRules(spellId);
  const castRules = getSpellAreaRules(spellId, { triggerType: "cast" });
  const actionRules = getSpellAreaRules(spellId, {
    triggerType: "active-action",
    actionId: "ice-investiture-cone",
  });

  assert.equal(allRules.length, 2);
  assert.deepEqual(castRules.map((rule) => rule.kind), ["aura"]);
  assert.deepEqual(actionRules.map((rule) => rule.kind), ["emission"]);
  assert.equal(actionRules[0].geometry.shape, "cone");
  assert.equal(actionRules[0].geometry.size.value, 4.5);
});

test("le quattro geometrie pilota hanno misure e vincoli espliciti", () => {
  const fireball = getSpellAreaRuleById("fireball:cast");
  const burningHands = getSpellAreaRuleById("burning-hands:cast");
  const lightningBolt = getSpellAreaRuleById("lightning-bolt:cast");
  const web = getSpellAreaRuleById("web:cast");

  assert.deepEqual(fireball.geometry.size, {
    value: 6,
    unit: "m",
    measure: "radius",
  });
  assert.equal(fireball.placement.range.value, 45);
  assert.equal(burningHands.placement.origin, "caster-adjacent");
  assert.equal(burningHands.placement.direction, "pointer");
  assert.equal(lightningBolt.placement.origin, "caster-adjacent");
  assert.equal(lightningBolt.geometry.width.value, 1.5);
  assert.equal(web.lifecycle.persistence, "spell");
  assert.equal(web.effectPolicy.mode, "manual-trigger");
  assert.equal(web.zonePolicy.placementOptional, true);
  assert.equal(web.zonePolicy.membershipTargeting.includeCaster, true);
  assert.equal(web.zonePolicy.membershipEffects[0].mechanics.movement.costMultiplier, 2);

  const entangle = getSpellAreaRuleById("entangle:cast");
  assert.equal(entangle.geometry.shape, "square");
  assert.equal(entangle.geometry.size.value, 6);
  assert.equal(entangle.placement.range.value, 27);
  assert.equal(entangle.zonePolicy.owner, "caster");
  assert.equal(entangle.zonePolicy.movement, "fixed");
});

test("il validatore rifiuta lifecycle incoerenti senza correggerli implicitamente", () => {
  const invalidAura = {
    id: "invalid:aura",
    spellId: "invalid",
    trigger: { type: "cast" },
    kind: "aura",
    geometry: {
      shape: "circle",
      size: { value: 3, unit: "m", measure: "radius" },
    },
    placement: {
      origin: "point",
      direction: "none",
      anchor: "world",
      range: { value: 9, unit: "m", measure: "range" },
    },
    lifecycle: {
      persistence: "preview",
      endsWithSpell: false,
    },
    targeting: {
      filter: "hostile",
      includeCaster: false,
      confirmTargets: false,
    },
    effectPolicy: {
      mode: "while-inside",
    },
  };

  const validation = validateSpellAreaRule(invalidAura);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.includes("aura-lifecycle-invalid"));
});

test("linee e attivazioni manuali richiedono i dati specifici", () => {
  const missing = validateSpellAreaRule({
    id: "invalid:line",
    spellId: "invalid",
    trigger: { type: "active-action" },
    kind: "emission",
    geometry: {
      shape: "line",
      size: { value: 9, unit: "m", measure: "length" },
    },
    placement: {
      origin: "caster",
      direction: "pointer",
      anchor: "caster",
    },
    lifecycle: {
      persistence: "preview",
      endsWithSpell: false,
    },
    targeting: {
      filter: "all",
      includeCaster: false,
      confirmTargets: true,
    },
    effectPolicy: {
      mode: "on-confirm",
    },
  });

  assert.equal(missing.valid, false);
  assert.ok(missing.errors.includes("action-id-required"));
  assert.ok(missing.errors.includes("line-width-required"));
});

test("l'origine adiacente al caster è usata solo da coni e linee emessi dal caster", () => {
  for (const rule of SPELL_AREA_RULES.filter((entry) =>
    entry.placement.origin === "caster-adjacent"
  )) {
    assert.ok(["cone", "line"].includes(rule.geometry.shape), rule.id);
  }
  assert.equal(
    getSpellAreaRuleById("blade-barrier:cast").placement.origin,
    "point",
  );
  assert.equal(
    getSpellAreaRuleById("xanathar-drago-illusorio:cast").placement.origin,
    "point",
  );

  const invalid = {
    ...getSpellAreaRuleById("fireball:cast"),
    placement: {
      origin: "caster-adjacent",
      direction: "none",
      anchor: "caster",
    },
  };
  const validation = validateSpellAreaRule(invalid);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.includes("caster-adjacent-shape-invalid"));
});

test("il contratto delle zone valida trigger futuri senza attivarli implicitamente", () => {
  const web = getSpellAreaRuleById("web:cast");
  const valid = validateSpellAreaRule({
    ...web,
    id: "test:zone-trigger",
    zonePolicy: {
      ...web.zonePolicy,
      triggers: [{
        id: "save-on-entry",
        label: "Tiro salvezza all'ingresso",
        event: "enter",
        frequency: "once-per-turn",
        resolution: "manual-save",
      }],
    },
  });
  assert.deepEqual(valid, { valid: true, errors: [] });

  const invalid = validateSpellAreaRule({
    ...web,
    id: "test:invalid-zone-trigger",
    zonePolicy: {
      ...web.zonePolicy,
      triggers: [{
        id: "",
        label: "",
        event: "movement",
        frequency: "sometimes",
        resolution: "automatic-damage",
      }],
    },
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.includes("zone-trigger-id-required"));
  assert.ok(invalid.errors.includes("zone-trigger-label-required"));
  assert.ok(invalid.errors.includes("zone-trigger-event-invalid"));
  assert.ok(invalid.errors.includes("zone-trigger-frequency-invalid"));
  assert.ok(invalid.errors.includes("zone-trigger-resolution-invalid"));
});

test("Ragnatela e Raggio Lunare dichiarano i trigger periodici pilota", () => {
  const web = getSpellAreaRuleById("web:cast");
  const moonbeam = getSpellAreaRuleById("moonbeam:cast");

  assert.deepEqual(
    web.zonePolicy.triggers.map((trigger) => trigger.event),
    ["enter", "turn-start"],
  );
  assert.ok(web.zonePolicy.triggers.every((trigger) => trigger.group === "web-save"));
  assert.equal(moonbeam.geometry.size.value, 1.5);
  assert.equal(moonbeam.zonePolicy.movement, "manual");
  assert.equal(moonbeam.zonePolicy.triggers[0].damage.dice, "2d10");
  assert.equal(moonbeam.zonePolicy.triggers[0].damage.onSave, "half");
  assert.equal(SPELL_ZONE_TRIGGER_WORKFLOW_ENABLED, false);
});

test("ogni incantesimo del popover Effetti ad Area ha una sagoma di lancio", () => {
  assert.equal(AREA_SAVE_SPELL_IDS.length, 99);
  assert.equal(AREA_PLACEMENT_ONLY_SPELL_IDS.length, 31);
  assert.equal(AREA_POPOVER_SPELL_IDS.length, 130);
  for (const spellId of AREA_POPOVER_SPELL_IDS) {
    const rules = getSpellAreaRules(spellId);
    assert.ok(
      rules.some((rule) =>
        ["instant", "zone", "aura", "emission"].includes(rule.kind)
      ),
      spellId,
    );
  }
});

test("l'audit classifica ogni campo area dell'intero catalogo", () => {
  const excludedIds = Object.keys(AREA_FIELD_NON_POPOVER_REASONS);
  const popoverIds = new Set(AREA_POPOVER_SPELL_IDS);
  assert.equal(excludedIds.length, 27);
  for (const spellId of excludedIds) {
    assert.ok(getSpellDefinition(spellId)?.area, spellId);
    assert.equal(popoverIds.has(spellId), false, spellId);
  }
  for (const spell of getSpellCatalog().filter((entry) => entry.area)) {
    assert.equal(
      popoverIds.has(spell.id)
        || Object.hasOwn(AREA_FIELD_NON_POPOVER_REASONS, spell.id),
      true,
      spell.id,
    );
  }
});

test("le zone senza TS conservano geometria, ciclo di vita ed effetti di membership", () => {
  const darkness = getSpellAreaRuleById("darkness:cast");
  const spikeGrowth = getSpellAreaRuleById("spike-growth:cast");
  const purityAura = getSpellAreaRuleById("phb2014-aura-di-purezza:cast");

  assert.equal(darkness.kind, "zone");
  assert.equal(darkness.geometry.size.value, 4.5);
  assert.equal(darkness.zonePolicy.membershipEffects[0].id, "darkness-obscured");
  assert.equal(darkness.zonePolicy.membershipEffects[0].condition, "Accecato");
  assert.equal(spikeGrowth.kind, "zone");
  assert.equal(
    spikeGrowth.zonePolicy.membershipEffects[0].mechanics.movement.costMultiplier,
    2,
  );
  assert.equal(purityAura.kind, "aura");
  assert.equal(purityAura.placement.anchor, "caster");
  assert.equal(purityAura.effectPolicy.effect.id, "aura-of-purity-zone");
});

test("l'audit delle zone usa condizioni reali e meccaniche di movimento certe", () => {
  const expectedConditions = {
    darkness: ["Accecato"],
    "fog-cloud": ["Accecato"],
    silence: ["Assordato"],
    "sleet-storm": ["Accecato"],
    "stinking-cloud": ["Accecato"],
    "xanathar-oscurita-della-follia": ["Accecato"],
    "xanathar-vento-di-interdizione": ["Assordato"],
    "phb2014-fame-di-hadar": ["Accecato"],
  };
  for (const [spellId, conditions] of Object.entries(expectedConditions)) {
    const rule = getSpellAreaRuleById(`${spellId}:cast`);
    const membershipEffects = rule.zonePolicy?.membershipEffects
      || [rule.effectPolicy?.effect].filter(Boolean);
    assert.deepEqual(
      membershipEffects
        .map((effect) => effect.condition)
        .filter(Boolean),
      conditions,
      spellId,
    );
  }

  assert.equal(
    getSpellAreaRuleById("wall-of-thorns:cast")
      .zonePolicy.membershipEffects[0]
      .mechanics.movement.costMultiplier,
    4,
  );
  for (const spellId of [
    "black-tentacles",
    "earthquake",
    "grease",
    "insect-plague",
    "sleet-storm",
    "spike-growth",
    "xanathar-collera-della-natura",
    "xanathar-maelstrom",
    "phb2014-fame-di-hadar",
  ]) {
    assert.equal(
      getSpellAreaRuleById(`${spellId}:cast`)
        .zonePolicy.membershipEffects
        .some((effect) =>
          effect.mechanics?.movement?.costMultiplier === 2
        ),
      true,
      spellId,
    );
  }
  assert.equal(
    getSpellAreaRuleById("xanathar-collera-della-natura:cast")
      .zonePolicy.membershipTargeting.filter,
    "hostile",
  );
});
