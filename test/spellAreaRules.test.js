import test from "node:test";
import assert from "node:assert/strict";

import {
  SPELL_AREA_RULES,
  getSpellAreaRuleById,
  getSpellAreaRules,
  validateSpellAreaRule,
} from "../src/spellAreaRules.js";
import { buildArea } from "../src/aoeGeometryCore.js";
import {
  AREA_FIELD_NON_POPOVER_REASONS,
  AREA_PLACEABLE_SPELL_IDS,
  AREA_PLACEMENT_ONLY_SPELL_IDS,
  AREA_POPOVER_SPELL_IDS,
  AREA_SAVE_SPELL_IDS,
  MULTI_TARGET_SAVE_SPELL_IDS,
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

test("Investitura della Fiamma separa aura persistente e linea dell'attivazione", () => {
  const castRule = getSpellAreaRuleById("xanathar-investitura-della-fiamma:aura");
  const actionRule = getSpellAreaRuleById("xanathar-investitura-della-fiamma:linea-di-fuoco");
  assert.equal(castRule.kind, "aura");
  assert.equal(castRule.lifecycle.persistence, "spell");
  assert.equal(castRule.geometry.size.value, 1.5);
  assert.equal(castRule.targeting.filter, "all");
  assert.equal(castRule.targeting.includeCaster, false);
  assert.deepEqual(
    castRule.triggerPolicy.triggers.map((trigger) => [trigger.event, trigger.resolution]),
    [["enter", "manual-effect"], ["turn-end", "manual-effect"]],
  );
  assert.deepEqual(
    castRule.triggerPolicy.triggers.map((trigger) => trigger.damage),
    [
      { dice: "1d10", type: "fuoco", onSave: "none" },
      { dice: "1d10", type: "fuoco", onSave: "none" },
    ],
  );
  assert.equal(actionRule.kind, "emission");
  assert.equal(actionRule.trigger.actionId, "flame-investiture-line");
  assert.equal(actionRule.geometry.width.value, 1.5);
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
  assert.equal(web.zonePolicy.initialResolution, "none");
  assert.equal(web.zonePolicy.membershipTargeting.includeCaster, true);
  assert.equal(web.zonePolicy.membershipEffects[0].mechanics.movement.costMultiplier, 2);

  const entangle = getSpellAreaRuleById("entangle:cast");
  assert.equal(entangle.geometry.shape, "square");
  assert.equal(entangle.geometry.size.value, 6);
  assert.equal(entangle.placement.range.value, 27);
  assert.equal(entangle.zonePolicy.owner, "caster");
  assert.equal(entangle.zonePolicy.movement, "fixed");
  assert.equal(entangle.zonePolicy.initialResolution, "manual-save");
});

test("Allucinazione di Forza limita area e reminder al bersaglio della spell", () => {
  const rule = getSpellAreaRuleById("phb2014-allucinazione-di-forza:cast");
  const [trigger] = rule.zonePolicy.triggers;

  assert.equal(rule.kind, "zone");
  assert.equal(rule.geometry.shape, "square");
  assert.equal(rule.geometry.size.value, 3);
  assert.equal(rule.placement.range.value, 18);
  assert.equal(rule.targeting.selectionMode, "manual");
  assert.equal(rule.zonePolicy.targetScope, "spell-targets");
  assert.equal(rule.zonePolicy.membershipPaddingSquares, 1);
  assert.equal(trigger.event, "turn-start");
  assert.equal(trigger.requiresSourceTurn, true);
  assert.equal(trigger.targetMode, "members");
  assert.deepEqual(trigger.damage, {
    dice: "1d6",
    type: "psichici",
    onSave: "none",
  });
});

test("Invocare il fulmine separa il punto della scarica dalla nube persistente", () => {
  const cast = getSpellAreaRuleById("call-lightning:cast");
  const cloud = getSpellAreaRuleById("call-lightning:cloud");

  assert.equal(cast.kind, "instant");
  assert.equal(cast.geometry.size.value, 1.5);
  assert.equal(cast.placement.range.value, 36);
  assert.equal(cloud.kind, "zone");
  assert.equal(cloud.geometry.size.value, 18);
  assert.equal(cloud.placement.origin, "point");
  assert.equal(cloud.placement.range.value, 36);
  assert.equal(cloud.lifecycle.persistence, "spell");
  assert.equal(cloud.zonePolicy.initialResolution, "none");
  assert.deepEqual(
    getSpellAreaRules("call-lightning", { triggerType: "cast" })
      .map((rule) => rule.id),
    ["call-lightning:cast", "call-lightning:cloud"],
  );
});

test("Arma Sacra usa un'esplosione mobile di 9 m solo al congedo", () => {
  const rule = getSpellAreaRuleById("xanathar-arma-sacra:burst");

  assert.equal(rule.trigger.type, "active-action");
  assert.equal(rule.trigger.actionId, "holy-weapon-dismiss");
  assert.equal(rule.kind, "emission");
  assert.equal(rule.geometry.shape, "circle");
  assert.equal(rule.geometry.size.value, 9);
  assert.equal(rule.placement.origin, "point");
  assert.equal(rule.placement.anchor, "world");
  assert.equal(rule.targeting.includeCaster, true);
  assert.equal(rule.lifecycle.persistence, "preview");
  assert.equal(
    getSpellAreaRules("xanathar-arma-sacra", { triggerType: "cast" }).length,
    0,
  );
});

test("le aree ostili includono il caster salvo immunità esplicite", () => {
  assert.equal(
    getSpellAreaRuleById("fireball:cast").targeting.includeCaster,
    true,
  );
  assert.equal(
    getSpellAreaRuleById("meteor-swarm:cast").targeting.includeCaster,
    true,
  );
  assert.equal(
    getSpellAreaRuleById("xanathar-rombo-di-tuono:cast")
      .targeting.includeCaster,
    false,
  );
  assert.equal(
    getSpellAreaRuleById("xanathar-scossa-tellurica:cast")
      .targeting.includeCaster,
    false,
  );
  assert.equal(
    getSpellAreaRuleById("phb2014-braccia-di-hadar:cast")
      .targeting.includeCaster,
    false,
  );
  assert.equal(
    getSpellAreaRuleById("phb2014-onda-distruttiva:cast")
      .targeting.includeCaster,
    false,
  );
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
    assert.ok(
      ["cone", "line", "rectangle"].includes(rule.geometry.shape),
      rule.id,
    );
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
        failureEffect: "",
      }],
    },
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.includes("zone-trigger-id-required"));
  assert.ok(invalid.errors.includes("zone-trigger-label-required"));
  assert.ok(invalid.errors.includes("zone-trigger-event-invalid"));
  assert.ok(invalid.errors.includes("zone-trigger-frequency-invalid"));
  assert.ok(invalid.errors.includes("zone-trigger-resolution-invalid"));
  assert.ok(invalid.errors.includes("zone-trigger-failure-effect-invalid"));

  const invalidInitialResolution = validateSpellAreaRule({
    ...web,
    id: "test:invalid-initial-resolution",
    zonePolicy: {
      ...web.zonePolicy,
      initialResolution: "automatic",
    },
  });
  assert.equal(invalidInitialResolution.valid, false);
  assert.ok(
    invalidInitialResolution.errors.includes("zone-initial-resolution-invalid")
  );

  const invalidConcentrationFilter = validateSpellAreaRule({
    ...web,
    id: "test:invalid-concentration-filter",
    zonePolicy: {
      ...web.zonePolicy,
      triggers: [{
        ...web.zonePolicy.triggers[0],
        requiresConcentration: "yes",
      }],
    },
  });
  assert.equal(invalidConcentrationFilter.valid, false);
  assert.ok(
    invalidConcentrationFilter.errors.includes(
      "zone-trigger-concentration-invalid"
    )
  );

  const invalidRequiredConditionFilter = validateSpellAreaRule({
    ...web,
    id: "test:invalid-required-condition-filter",
    zonePolicy: {
      ...web.zonePolicy,
      triggers: [{
        ...web.zonePolicy.triggers[0],
        requireConditions: ["Trattenuto", ""],
      }],
    },
  });
  assert.equal(invalidRequiredConditionFilter.valid, false);
  assert.ok(
    invalidRequiredConditionFilter.errors.includes(
      "zone-trigger-require-conditions-invalid"
    )
  );
});

test("Ragnatela e Raggio Lunare dichiarano i trigger periodici pilota", () => {
  const web = getSpellAreaRuleById("web:cast");
  const moonbeam = getSpellAreaRuleById("moonbeam:cast");

  assert.deepEqual(
    web.zonePolicy.triggers.map((trigger) => trigger.event),
    ["enter", "turn-start"],
  );
  assert.ok(web.zonePolicy.triggers.every((trigger) => trigger.group === "web-save"));
  assert.ok(web.zonePolicy.triggers.every(
    (trigger) => trigger.failureEffect === "Trattenuto dalla Ragnatela."
  ));
  assert.equal(moonbeam.geometry.size.value, 1.5);
  assert.deepEqual(moonbeam.zonePolicy.movement, {
    mode: "action",
    economy: "action",
    maximumMeters: 18,
    triggerOnAreaMove: false,
    stopOnFirstContact: false,
  });
  assert.equal(moonbeam.zonePolicy.triggers[0].damage.dice, "2d10");
  assert.equal(moonbeam.zonePolicy.triggers[0].damage.onSave, "half");
  assert.equal(
    moonbeam.zonePolicy.triggers[0].failureEffect,
    "Danni radiosi della spell (metà se superato).",
  );
  assert.equal(SPELL_ZONE_TRIGGER_WORKFLOW_ENABLED, true);
});

test("i trigger manuali migrati espongono dati di risoluzione strutturati", () => {
  const web = getSpellAreaRuleById("web:cast").zonePolicy.triggers[0];
  const moonbeam = getSpellAreaRuleById("moonbeam:cast").zonePolicy.triggers[0];
  const dawn = getSpellAreaRuleById("xanathar-alba:cast").zonePolicy.triggers[0];

  assert.equal(web.ability, "dex");
  assert.deepEqual(web.resolutionData.failureCondition, {
    condition: "Trattenuto",
  });
  assert.equal(moonbeam.ability, "con");
  assert.equal(moonbeam.resolutionData.damage.onSave, "half");
  assert.deepEqual(dawn.resolutionData.damage, {
    dice: "4d10",
    type: "radiosi",
    onSave: "half",
  });
});

test("il primo gruppo di zone dichiara confine, TS ed effetto del fallimento", () => {
  const expected = {
    "xanathar-alba": {
      event: "turn-end",
      label: "TS Costituzione a fine turno in Alba",
      failureEffect: "4d10 danni radiosi (metà se superato).",
    },
    "xanathar-oscurita-della-follia": {
      event: "turn-start",
      label: "TS Saggezza a inizio turno nell'Oscurità della Follia",
      failureEffect: "8d8 danni psichici (metà se superato).",
    },
    "xanathar-diavoletto-di-polvere": {
      event: "turn-end",
      label: "TS Forza a fine turno vicino al Diavoletto di Polvere",
      failureEffect: "Danni contundenti e spinta di 3 m (metà danni e nessuna spinta se superato).",
    },
    "xanathar-sfera-della-tempesta": {
      event: "turn-end",
      label: "TS Forza a fine turno nella Sfera della Tempesta",
      failureEffect: "2d6 danni contundenti (nessun danno se superato).",
    },
  };

  for (const [spellId, values] of Object.entries(expected)) {
    const [trigger] = getSpellAreaRuleById(`${spellId}:cast`)
      .zonePolicy.triggers;
    assert.equal(trigger.event, values.event, spellId);
    assert.equal(trigger.frequency, "once-per-turn", spellId);
    assert.equal(trigger.resolution, "manual-save", spellId);
    assert.equal(trigger.label, values.label, spellId);
    assert.equal(trigger.failureEffect, values.failureEffect, spellId);
    if (spellId === "xanathar-diavoletto-di-polvere") {
      assert.deepEqual(trigger.damage, {
        dice: "1d8",
        type: "contundenti",
        onSave: "half",
        additionalPerSlotAbove: 1,
        baseSlot: 2,
      }, spellId);
    } else {
      assert.equal(trigger.damage, undefined, spellId);
    }
  }
});

test("i tre lotti di danno a fine turno dichiarano tutti i trigger auditati", () => {
  const expected = {
    "flaming-sphere": ["turn-end:manual-save", "enter:manual-save"],
    "incendiary-cloud": ["enter:manual-save", "turn-end:manual-save"],
    "insect-plague": ["enter:manual-save", "turn-end:manual-save"],
    "wall-of-fire": ["enter:informational", "turn-end:informational"],
    "wall-of-thorns": ["enter:manual-save", "turn-end:manual-save"],
    "xanathar-creare-falo": ["enter:manual-save", "turn-end:manual-save"],
    "xanathar-muro-di-luce": ["turn-end:informational"],
    "phb2014-cordone-di-frecce": [
      "enter:manual-save",
      "turn-end:manual-save",
    ],
    "phb2014-fame-di-hadar": [
      "turn-start:informational",
      "turn-end:manual-save",
    ],
  };

  for (const [spellId, triggerContracts] of Object.entries(expected)) {
    const rule = getSpellAreaRuleById(`${spellId}:cast`);
    assert.equal(rule.kind, "zone", spellId);
    assert.deepEqual(
      rule.zonePolicy.triggers.map((trigger) =>
        `${trigger.event}:${trigger.resolution}`
      ),
      triggerContracts,
      spellId,
    );
    assert.ok(
      rule.zonePolicy.triggers.every((trigger) => trigger.damage?.dice),
      spellId,
    );
  }

  const flamingSphere = getSpellAreaRuleById("flaming-sphere:cast");
  assert.equal(flamingSphere.geometry.shape, "circle");
  assert.equal(flamingSphere.geometry.size.value, 1.5);
  assert.deepEqual(flamingSphere.zonePolicy.movement, {
    mode: "bonus-action",
    economy: "bonus-action",
    maximumMeters: 9,
    triggerOnAreaMove: true,
    stopOnFirstContact: true,
  });
  assert.equal(flamingSphere.zonePolicy.membershipPaddingSquares, 1);
  const contactTrigger = flamingSphere.zonePolicy.triggers.find(
    (trigger) => trigger.id === "flaming-sphere-save-on-contact"
  );
  assert.equal(contactTrigger.targetMode, "direct-members");
  assert.equal(contactTrigger.requiresAreaMove, true);
  assert.equal(contactTrigger.triggerOnAreaMove, true);
  assert.equal(contactTrigger.persistsAfterExit, true);
  assert.equal(
    getSpellAreaRuleById("phb2014-cordone-di-frecce:cast")
      .zonePolicy.membershipTargeting.includeCaster,
    false,
  );
});

test("il lotto standard di inizio turno dichiara ingresso, TS e danni", () => {
  const expected = {
    "blade-barrier": [
      "enter:manual-save:6d10",
      "turn-start:manual-save:6d10",
    ],
    "cloudkill": [
      "enter:manual-save:5d8",
      "turn-start:manual-save:5d8",
    ],
    "xanathar-fulgore-nauseante": [
      "enter:manual-save:4d10",
      "turn-start:manual-save:4d10",
    ],
    "xanathar-maelstrom": [
      "turn-start:manual-save:6d6",
    ],
  };

  for (const [spellId, triggerContracts] of Object.entries(expected)) {
    const rule = getSpellAreaRuleById(`${spellId}:cast`);
    assert.deepEqual(
      rule.zonePolicy.triggers.map((trigger) =>
        `${trigger.event}:${trigger.resolution}:${trigger.damage.dice}`
      ),
      triggerContracts,
      spellId,
    );
    assert.ok(
      rule.zonePolicy.triggers.every((trigger) =>
        trigger.failureEffect && trigger.frequency === "once-per-turn"
      ),
      spellId,
    );
  }

  assert.match(
    getSpellAreaRuleById("xanathar-fulgore-nauseante:cast")
      .zonePolicy.triggers[0].failureEffect,
    /livello di Indebolimento/,
  );
});

test("il lotto delle zone differite dichiara TS, danni automatici e concentrazione", () => {
  const expected = {
    "black-tentacles": [
      "enter:manual-save",
      "turn-start:manual-save",
      "turn-start:informational",
    ],
    grease: [
      "enter:manual-save",
      "turn-end:manual-save",
    ],
    "stinking-cloud": [
      "turn-start:manual-save",
    ],
    "phb2014-nube-di-pugnali": [
      "enter:informational",
      "turn-start:informational",
    ],
  };
  for (const [spellId, contracts] of Object.entries(expected)) {
    const rule = getSpellAreaRuleById(`${spellId}:cast`);
    assert.deepEqual(
      rule.zonePolicy.triggers.map((trigger) =>
        `${trigger.event}:${trigger.resolution}`
      ),
      contracts,
      spellId,
    );
  }

  const daggers = getSpellAreaRuleById(
    "phb2014-nube-di-pugnali:cast"
  ).zonePolicy.triggers;
  assert.ok(daggers.every((trigger) =>
    trigger.damage?.dice === "4d4"
    && trigger.damage?.type === "taglienti"
  ));

  const tentacles = getSpellAreaRuleById(
    "black-tentacles:cast"
  ).zonePolicy.triggers;
  assert.deepEqual(tentacles[1].skipConditions, ["Trattenuto"]);
  assert.deepEqual(tentacles[2].requireConditions, ["Trattenuto"]);
  assert.equal(tentacles[2].damage.dice, "3d6");
  assert.match(tentacles[2].label, /prova di Forza o Destrezza/);

  const sleet = getSpellAreaRuleById("sleet-storm:cast");
  assert.deepEqual(
    sleet.zonePolicy.triggers.map((trigger) =>
      `${trigger.event}:${trigger.resolution}`
    ),
    [
      "enter:manual-save",
      "turn-start:manual-save",
      "cast:informational",
      "enter:informational",
      "turn-start:informational",
    ],
  );
  assert.ok(
    sleet.zonePolicy.triggers
      .filter((trigger) => trigger.resolution === "informational")
      .every((trigger) => trigger.requiresConcentration === true)
  );
});

test("Folata, Guardiano, Guardiani Spirituali e Controllare Venti seguono i trigger RAW", () => {
  const gust = getSpellAreaRuleById("gust-of-wind:cast");
  assert.equal(gust.kind, "zone");
  assert.equal(gust.geometry.shape, "rectangle");
  assert.equal(gust.geometry.size.value, 18);
  assert.equal(gust.geometry.width.value, 3);
  assert.equal(gust.zonePolicy.movement, "manual");
  assert.equal(gust.zonePolicy.followCaster, true);
  assert.equal(gust.zonePolicy.initialResolution, "none");
  assert.deepEqual(
    gust.zonePolicy.triggers.map((trigger) => trigger.event),
    ["turn-start"],
  );
  assert.deepEqual(
    gust.zonePolicy.membershipEffects[0].mechanics.movement.directional,
    {
      direction: "toward-source",
      costMultiplier: 2,
      label: "Folata di vento: movimento verso il caster ×2",
    },
  );
  assert.equal(
    gust.zonePolicy.membershipEffects[0].label,
    "Movimento verso il caster ×2",
  );
  assert.match(
    gust.zonePolicy.membershipEffects[0].detail,
    /movimento verso il caster costa due metri/,
  );

  const guardian = getSpellAreaRuleById("guardian-of-faith:cast");
  assert.equal(guardian.zonePolicy.initialResolution, "none");
  assert.equal(guardian.zonePolicy.membershipTargeting.filter, "hostile");
  assert.deepEqual(
    guardian.zonePolicy.triggers.map((trigger) => trigger.event),
    ["enter", "move"],
  );
  assert.ok(guardian.zonePolicy.triggers.every((trigger) =>
    trigger.group === "guardian-of-faith-approach"
  ));
  assert.equal(guardian.zonePolicy.triggers[0].damage.dice, "20");
  assert.equal(guardian.zonePolicy.triggers[0].damage.onSave, "half");
  assert.match(guardian.zonePolicy.triggers[0].failureEffect, /60 danni/);

  const spirits = getSpellAreaRuleById("spirit-guardians:aura");
  assert.deepEqual(
    spirits.triggerPolicy.triggers.map((trigger) => trigger.event),
    ["enter", "turn-start"],
  );
  assert.ok(spirits.triggerPolicy.triggers.every((trigger) =>
    trigger.damage.dice === "3d8"
    && trigger.damage.onSave === "half"
  ));

  const winds = getSpellAreaRuleById("xanathar-controllare-venti:cast");
  assert.equal(winds.zonePolicy.initialResolution, "none");
  assert.deepEqual(
    winds.zonePolicy.triggers.map((trigger) => trigger.event),
    ["enter", "turn-start"],
  );
  assert.ok(winds.zonePolicy.triggers.every((trigger) =>
    trigger.ruleChoice === "downdraft"
    && trigger.requiresRuleChoices.includes("downdraft")
  ));
});

test("lo smoke test logico di Folata copre sagoma, direzioni e lifecycle di membership", () => {
  const rule = getSpellAreaRuleById("gust-of-wind:cast");
  for (const dpi of [100, 150]) {
    for (const direction of [
      { x: 12 * dpi, y: 0 },
      { x: -12 * dpi, y: 0 },
      { x: 0, y: 12 * dpi },
      { x: 12 * dpi / Math.SQRT2, y: 12 * dpi / Math.SQRT2 },
    ]) {
      const area = buildArea(
        "rectangle",
        { x: 0, y: 0 },
        direction,
        dpi,
        { x: 0, y: 0 },
        { widthSquares: 2 },
      );
      assert.equal(area.squares, 12);
      assert.equal(area.widthSquares, 2);
      assert.ok(area.cells.length > 0);
    }
  }
  assert.equal(rule.lifecycle.persistence, "spell");
  assert.equal(rule.lifecycle.endsWithSpell, true);
  assert.equal(rule.zonePolicy.membershipEffects.length, 1);
  assert.equal(rule.zonePolicy.triggers[0].event, "turn-start");
});

test("Sfera Acquea, Spirito Guaritore, Crescita di Spine e Muro di Ghiaccio tracciano movimento e attraversamento", () => {
  const waterySphere = getSpellAreaRuleById("xanathar-sfera-acquea:cast");
  assert.equal(waterySphere.zonePolicy.movement, "manual");
  assert.equal(waterySphere.zonePolicy.triggers.length, 1);
  assert.equal(waterySphere.zonePolicy.triggers[0].event, "enter");
  assert.equal(waterySphere.zonePolicy.triggers[0].requiresAreaMove, true);
  assert.equal(waterySphere.zonePolicy.triggers[0].triggerOnAreaMove, true);
  assert.equal(waterySphere.zonePolicy.triggers[0].persistsAfterExit, true);

  const healingSpirit = getSpellAreaRuleById("xanathar-spirito-guaritore:cast");
  assert.deepEqual(
    healingSpirit.zonePolicy.triggers.map((trigger) => trigger.event),
    ["enter", "turn-start"],
  );
  assert.ok(healingSpirit.zonePolicy.triggers.every((trigger) =>
    trigger.resolution === "manual-heal"
    && trigger.group === "healing-spirit-heal"
  ));
  assert.equal(healingSpirit.zonePolicy.triggers[0].triggerOnAreaMove, false);

  const spikeGrowth = getSpellAreaRuleById("spike-growth:cast");
  assert.deepEqual(
    spikeGrowth.zonePolicy.triggers.map((trigger) => trigger.event),
    ["enter", "move", "leave"],
  );
  assert.ok(spikeGrowth.zonePolicy.triggers.every((trigger) =>
    trigger.resolution === "informational"
    && trigger.group === "spike-growth-movement-damage"
  ));

  const wallOfIce = getSpellAreaRuleById("wall-of-ice:cast");
  assert.equal(wallOfIce.geometry.shape, "line");
  assert.equal(wallOfIce.geometry.size.value, 30);
  assert.equal(wallOfIce.geometry.width.value, 1.5);
  assert.deepEqual(
    wallOfIce.zonePolicy.triggers.map((trigger) => trigger.event),
    ["enter", "move", "leave"],
  );
  assert.ok(wallOfIce.zonePolicy.triggers.every((trigger) =>
    trigger.damage.dice === "5d6"
    && trigger.damage.onSave === "half"
    && trigger.persistsAfterExit === true
  ));
});

test("ogni incantesimo posizionabile del popover ha una sagoma di lancio", () => {
  assert.equal(AREA_SAVE_SPELL_IDS.length, 97);
  assert.equal(AREA_PLACEMENT_ONLY_SPELL_IDS.length, 34);
  assert.equal(AREA_PLACEABLE_SPELL_IDS.length, 132);
  assert.equal(MULTI_TARGET_SAVE_SPELL_IDS.length, 7);
  assert.equal(AREA_POPOVER_SPELL_IDS.length, 139);
  assert.equal(AREA_SAVE_SPELL_IDS.includes("phb2014-fame-di-hadar"), false);
  assert.equal(
    AREA_PLACEMENT_ONLY_SPELL_IDS.includes("phb2014-fame-di-hadar"),
    true,
  );
  for (const spellId of AREA_PLACEABLE_SPELL_IDS) {
    const rules = getSpellAreaRules(spellId);
    assert.ok(
      rules.some((rule) =>
        ["instant", "zone", "aura", "emission"].includes(rule.kind)
      ),
      spellId,
    );
  }
  for (const spellId of MULTI_TARGET_SAVE_SPELL_IDS) {
    assert.deepEqual(getSpellAreaRules(spellId), [], spellId);
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
  const lifeAura = getSpellAreaRuleById("phb2014-aura-di-vita:cast");
  const vitalityAura = getSpellAreaRuleById("phb2014-aura-di-vitalita:cast");

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
  assert.equal(purityAura.targeting.confirmTargets, false);
  assert.equal(purityAura.targeting.includeCaster, false);
  assert.equal(getSpellDefinition("Aura di Purezza").targetMode, "self");
  assert.equal(
    purityAura.effectPolicy.effect.label,
    "Res. veleno / vant. TS / no malattie",
  );
  assert.equal(lifeAura.targeting.confirmTargets, false);
  assert.equal(lifeAura.targeting.includeCaster, false);
  assert.equal(getSpellDefinition("Aura di Vita").targetMode, "self");
  assert.equal(
    lifeAura.effectPolicy.effect.label,
    "Res. necrotici / max PF / +1 PF a 0",
  );
  assert.equal(vitalityAura.kind, "aura");
  assert.deepEqual(vitalityAura.geometry.size, {
    value: 9,
    unit: "m",
    measure: "radius",
  });
  assert.equal(vitalityAura.placement.origin, "caster");
  assert.equal(vitalityAura.lifecycle.persistence, "spell");
  assert.equal(vitalityAura.effectPolicy.mode, "manual-trigger");
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
    "blade-barrier",
    "earthquake",
    "grease",
    "insect-plague",
    "sleet-storm",
    "spike-growth",
    "xanathar-collera-della-natura",
    "xanathar-maelstrom",
    "xanathar-sfera-della-tempesta",
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

test("le tre zone con varianti separano le modalita dagli effetti concorrenti", () => {
  const water = getSpellAreaRuleById("control-water:cast");
  assert.equal(water.zonePolicy.initialResolution, "none");
  assert.deepEqual(
    water.zonePolicy.triggers.map((trigger) => [
      trigger.event,
      trigger.ruleChoice,
    ]),
    [
      ["enter", "whirlpool"],
      ["turn-start", "whirlpool"],
      ["turn-start", "flood"],
    ],
  );
  assert.ok(water.zonePolicy.triggers
    .filter((trigger) => trigger.ruleChoice === "whirlpool")
    .every((trigger) =>
    trigger.requiresRuleChoices.includes("whirlpool")
    ));
  assert.equal(
    water.zonePolicy.triggers.find((trigger) => trigger.ruleChoice === "flood")
      ?.requiresRuleChoices?.includes("flood"),
    true,
  );

  const earthquake = getSpellAreaRuleById("earthquake:cast");
  assert.equal(earthquake.zonePolicy.initialResolution, "manual-save");
  assert.deepEqual(
    earthquake.zonePolicy.triggers.map((trigger) => trigger.id),
    [
      "earthquake-concentration-save-on-cast",
      "earthquake-structure-damage-on-cast",
      "earthquake-fissures-on-source-turn-start",
      "earthquake-structure-damage-on-source-turn-start",
      "earthquake-ground-save-on-source-turn-end",
    ],
  );
  assert.equal(earthquake.zonePolicy.triggers.at(-1).targetMode, "members");
  assert.deepEqual(
    earthquake.zonePolicy.triggers.at(-1).skipConditions,
    ["Prono"],
  );

  const wrath = getSpellAreaRuleById("xanathar-collera-della-natura:cast");
  assert.equal(wrath.zonePolicy.initialResolution, "none");
  assert.deepEqual(
    wrath.zonePolicy.triggers.map((trigger) => [
      trigger.event,
      trigger.requiresSourceTurn,
      trigger.targetMode,
    ]),
    [
      ["turn-start", true, "caster"],
      ["turn-end", true, "caster"],
    ],
  );
});
