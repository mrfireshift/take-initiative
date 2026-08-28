import test from "node:test";
import assert from "node:assert/strict";

import {
  findActiveSpellConcentration,
  getSpellCastPhaseOptions,
  getSpellCastPhasePlan,
  isPreparedSpellCast,
  spellPhaseAttackOutcomeRequired,
  withSpellPhaseTransitionOperations,
} from "../src/spellCastPhaseCore.js";
import { getSpellDefinition } from "../src/spells-srd.js";

test("le punizioni espongono solo la preparazione nel pannello Incantesimi", () => {
  for (const name of [
    "Punizione Collerica",
    "Punizione Incandescente",
    "Punizione Tonante",
    "Punizione Accecante",
    "Punizione Demoralizzante",
    "Punizione Esiliante",
    "Punizione Marchiante",
  ]) {
    const spell = getSpellDefinition(name);
    assert.deepEqual(
      getSpellCastPhaseOptions(spell).map((phase) => phase.value),
      ["prepare"],
      name,
    );
    assert.equal(getSpellCastPhasePlan(spell).subjectMode, "caster", name);
    assert.deepEqual(
      getSpellCastPhaseOptions(spell, "resolve").map((phase) => phase.value),
      ["resolve"],
      name,
    );
    assert.equal(getSpellCastPhasePlan(spell, "resolve").subjectMode, "selected", name);
  }

  for (const name of ["Colpo Intrappolante", "Raffica di Spine", "Freccia Folgorante"]) {
    assert.deepEqual(
      getSpellCastPhaseOptions(getSpellDefinition(name)).map((phase) => phase.value),
      ["prepare", "resolve"],
      name,
    );
  }
});

test("gli esiti dell'attacco appartengono solo alla risoluzione prepared", () => {
  for (const name of [
    "Colpo Intrappolante",
    "Punizione Collerica",
    "Punizione Incandescente",
    "Punizione Tonante",
    "Raffica di Spine",
    "Freccia Folgorante",
    "Punizione Accecante",
    "Punizione Demoralizzante",
    "Punizione Esiliante",
    "Punizione Marchiante",
  ]) {
    const spell = getSpellDefinition(name);
    assert.equal(
      spellPhaseAttackOutcomeRequired(getSpellCastPhasePlan(spell, "prepare")),
      false,
      `${name} prepare`,
    );
    assert.equal(
      spellPhaseAttackOutcomeRequired(getSpellCastPhasePlan(spell, "resolve")),
      name === "Raffica di Spine" || name === "Freccia Folgorante" ? false : true,
      `${name} resolve`,
    );
  }
});

test("la preparazione scala le label con lo slot e non applica gli esiti al caster", () => {
  const ensnaring = getSpellDefinition("Colpo Intrappolante");
  const prepare = getSpellCastPhasePlan(ensnaring, "prepare", { slotLevel: 4 });

  assert.equal(prepare.useCatalogAutomation, false);
  assert.match(prepare.effects[0].label, /4d6 per turno/);
  assert.equal(prepare.effects[0].mechanics.ongoingDamage.dice, "4d6");
  assert.equal(prepare.effects[0].parentRemoval, "spell");
});

test("le fasi misurabili espongono dati coerenti e non scalano spell senza upcast", () => {
  const lightning = getSpellCastPhasePlan(
    getSpellDefinition("Freccia Folgorante"),
    "prepare",
    { slotLevel: 5 },
  ).effects[0];
  const blinding = getSpellCastPhasePlan(
    getSpellDefinition("Punizione Accecante"),
    "prepare",
    { slotLevel: 7 },
  ).effects[0];

  assert.equal(lightning.mechanics.damageReplacement.dice, "6d8");
  assert.equal(lightning.mechanics.areaDamage.dice, "4d8");
  assert.match(lightning.label, /area 4d8 fulmine/);
  assert.equal(blinding.mechanics.damageBonus.dice, "3d8");
  assert.match(blinding.label, /\+3d8 radiosi/);
});

test("Freccia Folgorante scala in modo indipendente primary e area", () => {
  const expected = new Map([
    [3, ["4d8", "2d8"]],
    [4, ["5d8", "3d8"]],
    [5, ["6d8", "4d8"]],
    [9, ["10d8", "8d8"]],
  ]);
  const spell = getSpellDefinition("Freccia Folgorante");

  for (const [slotLevel, [primary, secondary]] of expected) {
    const mechanics = getSpellCastPhasePlan(spell, "resolve", { slotLevel })
      .resolution.mechanics;
    assert.equal(mechanics.damageReplacement.dice, primary, `${slotLevel} primary`);
    assert.equal(mechanics.areaDamage.dice, secondary, `${slotLevel} secondary`);
  }
});

test("Punizione Marchiante conserva il contract weapon prepared e scala con lo slot", () => {
  const spell = getSpellDefinition("Punizione Marchiante");
  const expected = new Map([
    [2, "2d6"],
    [3, "3d6"],
    [5, "5d6"],
    [9, "9d6"],
  ]);

  assert.equal(spell.displayName, "Punizione Marchiante");
  for (const [slotLevel, dice] of expected) {
    const plan = getSpellCastPhasePlan(spell, "resolve", { slotLevel });
    assert.equal(plan.attack.restriction, "weapon", `${slotLevel} attack`);
    assert.equal(plan.concentrationAction, "extend", `${slotLevel} concentration`);
    assert.equal(plan.resolution.mechanics.damageBonus.dice, dice, `${slotLevel} damage`);
    assert.equal(plan.resolution.mechanics.damageBonus.type, "radiosi", `${slotLevel} type`);
  }
});

test("il contratto prepared distingue weapon, anchor e outcome fisico opzionale", () => {
  const ensnaring = getSpellCastPhasePlan(
    getSpellDefinition("Colpo Intrappolante"),
    "resolve",
  );
  const banishing = getSpellCastPhasePlan(
    getSpellDefinition("Punizione Esiliante"),
    "resolve",
  );
  const hail = getSpellCastPhasePlan(
    getSpellDefinition("Raffica di Spine"),
    "resolve",
  );
  const lightning = getSpellCastPhasePlan(
    getSpellDefinition("Freccia Folgorante"),
    "resolve",
  );

  assert.equal(ensnaring.attack.restriction, "weapon");
  assert.equal(banishing.attack.restriction, "weapon");
  assert.equal(hail.attack.restriction, "weapon-ranged");
  assert.equal(lightning.attack.restriction, "weapon-ranged");
  assert.deepEqual(lightning.attack.outcomes, []);
  assert.equal(lightning.attack.outcomeRequired, false);
  assert.equal(lightning.attack.primaryDamageMode, "final-applied");
  assert.equal(lightning.attack.areaAnchor, "primary-target");
  assert.equal(lightning.attack.consumeOnMiss, true);
  assert.equal(hail.attack.areaAnchor, "primary-target");
  assert.equal(hail.attack.outcomeRequired, false);
  assert.equal(hail.attack.consumeOnMiss, false);
});

test("la risoluzione distingue trasferimento e consumo della concentrazione", () => {
  assert.equal(
    getSpellCastPhasePlan(
      getSpellDefinition("Punizione Collerica"),
      "resolve",
    ).concentrationAction,
    "extend",
  );
  assert.equal(
    getSpellCastPhasePlan(
      getSpellDefinition("Punizione Tonante"),
      "resolve",
    ).concentrationAction,
    "dismiss",
  );
});

test("una spell attiva è risolvibile solo finché rappresenta la preparazione", () => {
  const spell = getSpellDefinition("Punizione Collerica");

  assert.equal(isPreparedSpellCast({
    spell,
    castContext: { phase: "prepare", slotLevel: 1 },
    casterId: "caster",
    targetIds: ["caster"],
  }), true);
  assert.equal(isPreparedSpellCast({
    spell,
    castContext: { phase: "resolve", slotLevel: 1 },
    casterId: "caster",
    targetIds: ["target"],
  }), false);
  assert.equal(isPreparedSpellCast({
    spell,
    casterId: "caster",
    targetIds: ["caster"],
  }), true);
  assert.equal(isPreparedSpellCast({
    spell: getSpellDefinition("Benedizione"),
    casterId: "caster",
    targetIds: ["caster"],
  }), false);
});

test("trova la concentrazione preparata per id, nome o spellId", () => {
  const spell = getSpellDefinition("Punizione Collerica");
  const active = findActiveSpellConcentration({
    "punizione collerica": {
      name: "Punizione Collerica",
      spellId: spell.id,
      instanceId: "wrathful",
      targets: ["caster"],
    },
  }, spell);

  assert.equal(active.instanceId, "wrathful");
});

test("la risoluzione persistente trasferisce la concentrazione dal caster al bersaglio", () => {
  const operations = withSpellPhaseTransitionOperations({
    operations: [{ type: "spell:upsert", targetIds: ["target"] }],
    phasePlan: { phase: "resolve" },
    concentrationAction: "extend",
    activeConcentration: { instanceId: "wrathful" },
    casterId: "caster",
  });

  assert.deepEqual(operations[0], {
    type: "concentration:break-targets",
    casterIds: ["caster"],
    reference: "wrathful",
    targetIds: ["caster"],
  });
  assert.equal(operations[1].type, "spell:upsert");
});
