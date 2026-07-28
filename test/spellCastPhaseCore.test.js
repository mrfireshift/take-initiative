import test from "node:test";
import assert from "node:assert/strict";

import {
  findActiveSpellConcentration,
  getSpellCastPhaseOptions,
  getSpellCastPhasePlan,
  isPreparedSpellCast,
  withSpellPhaseTransitionOperations,
} from "../src/spellCastPhaseCore.js";
import { getSpellDefinition } from "../src/spells-srd.js";

test("le punizioni e i colpi preparati espongono preparazione e risoluzione", () => {
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
  ]) {
    const spell = getSpellDefinition(name);
    assert.deepEqual(
      getSpellCastPhaseOptions(spell).map((phase) => phase.value),
      ["prepare", "resolve"],
      name,
    );
    assert.equal(getSpellCastPhasePlan(spell).subjectMode, "caster", name);
    assert.equal(
      getSpellCastPhasePlan(spell, "resolve").subjectMode,
      "selected",
      name,
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
