import test from "node:test";
import assert from "node:assert/strict";

import {
  getAreaSaveAutomation,
  getProposedConditions,
  getSpellCatalog,
  getSpellDefinition,
  getSpellEffects,
  getTrackableSpellOptions,
} from "../src/spells-srd.js";

function proposed(spellId, choice = "") {
  return getProposedConditions(getSpellDefinition(spellId), choice);
}

function proposedReminder(spellId, conditionName, choice = "") {
  const condition = proposed(spellId, choice)
    .find((entry) => entry?.name === conditionName);
  return condition?.options?.saveReminder;
}

function failedRule(spellId, effectId = "") {
  const rules = getAreaSaveAutomation(spellId)?.failed || [];
  return effectId
    ? rules.find((rule) => rule.effectId === effectId)
    : rules[0];
}

test("l'audit SRD copre TS a fine turno e TS quando il bersaglio subisce danni", () => {
  assert.equal(
    proposedReminder("blindness-deafness", "Accecato", "Accecato").timing,
    "turn-end",
  );
  assert.equal(
    proposedReminder("dominate-person", "Affascinato").timing,
    "damage",
  );
  assert.deepEqual(
    proposedReminder("hideous-laughter", "Incapacitato")
      .map((reminder) => reminder.timing),
    ["turn-end", "damage"],
  );
  assert.equal(
    proposedReminder("hold-person", "Paralizzato").ability,
    "wis",
  );
  assert.equal(
    proposedReminder("ray-of-enfeeblement", "Danni da Forza dimezzati").ability,
    "con",
  );
});

test("il lotto bersagli copre azioni, attivazioni del caster e varianti di Sguardo", () => {
  const heatMetal = proposedReminder("heat-metal", "Metallo rovente");
  assert.equal(heatMetal, undefined);
  assert.equal(
    getSpellDefinition("heat-metal").activeActions[0].id,
    "heat-metal-repeat",
  );

  const dance = proposedReminder(
    "irresistible-dance",
    "Danza: sul posto · svant. TS DES/att. · attacchi contro con vant.",
  );
  assert.equal(dance.ability, "wis");
  assert.equal(dance.timing, "turn-start");
  assert.match(dance.label, /usare un'azione/);

  const eyebite = getSpellDefinition("eyebite");
  assert.deepEqual(
    eyebite.activeActions.map((action) => action.id),
    [
      "eyebite-saved",
      "eyebite-asleep",
      "eyebite-panicked",
      "eyebite-sickened",
    ],
  );
  assert.equal(
    eyebite.activeActions[3].failureEffects[0].saveReminder.timing,
    "turn-end",
  );
  assert.match(
    eyebite.activeActions[3].failureEffects[0].saveReminder.label,
    /non può più essere bersagliato/,
  );
});

test("le etichette degli effetti semantici non ripetono soltanto il nome della spell", () => {
  const normalized = (value) => String(value || "")
    .trim()
    .toLocaleLowerCase("it")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
  const tautologies = [];
  for (const spell of getSpellCatalog()) {
    for (const proposedCondition of getProposedConditions(spell)) {
      const conditionName = typeof proposedCondition === "string"
        ? proposedCondition
        : proposedCondition?.name;
      const options = proposedCondition?.options || {};
      if (
        options.effectKind
        && normalized(conditionName) === normalized(spell.displayName)
      ) {
        tautologies.push(spell.id);
      }
    }
  }
  assert.deepEqual(tautologies, []);
});

test("Parola del potere stordire traccia l'effetto senza risolvere la soglia PF", () => {
  const spell = getSpellDefinition("power-word-stun");
  const [stunned] = proposed("power-word-stun");

  assert.equal(spell.trackable, true);
  assert.equal(
    getTrackableSpellOptions().some((option) => option.id === spell.id),
    true,
  );
  assert.deepEqual(spell.expiry, { mode: "manual" });
  assert.equal(stunned.name, "Stordito");
  assert.deepEqual(stunned.options, {
    expiry: { mode: "manual" },
    manualRemoval: true,
    endsParentOnRemoval: true,
    parentRemoval: "target",
    saveReminder: {
      ability: "con",
      timing: "turn-end",
      dcSource: "source-spell",
      label: "Se supera il TS, termina Stordito su di sé.",
    },
  });
  assert.equal(spell.saveAutomation, null);
});

test("le risoluzioni persistenti trasferiscono i reminder supportati nella condizione", () => {
  assert.equal(
    failedRule("compulsion", "compulsion-forced-movement").saveReminder,
    undefined,
  );
  assert.equal(
    failedRule("confusion", "confusion-random-turn")
      .saveReminder
      .find((reminder) => reminder.timing === "turn-end")
      .ability,
    "wis",
  );
  assert.equal(
    failedRule("slow", "slow-penalty").saveReminder.timing,
    "turn-end",
  );
  assert.equal(
    failedRule("fear").saveReminder.label,
    "Effettua questo TS solo se il caster non è in vista. Se lo supera, termina Paura su di sé.",
  );
  assert.equal(
    failedRule("fear", "fear-forced-flight").saveReminder.mode,
    "consume",
  );
  assert.equal(
    failedRule("sunburst").saveReminder.ability,
    "con",
  );
});

test("l'audit supplementi e PHB 2014 copre i debuff ricorrenti già modellati", () => {
  assert.equal(
    proposedReminder("xanathar-drago-illusorio", "Spaventato").timing,
    "turn-end",
  );
  assert.equal(
    failedRule("xanathar-sfera-acquea").saveReminder.ability,
    "str",
  );
  assert.equal(
    getSpellEffects("xanathar-immolazione")[0].saveReminder.ability,
    "dex",
  );
  assert.equal(
    getSpellEffects("xanathar-parola-del-potere-dolore")[0]
      .saveReminder.timing,
    "turn-end",
  );
  assert.equal(
    failedRule("phb2014-corona-di-follia").saveReminder.ability,
    "wis",
  );
  assert.equal(
    failedRule("phb2014-punizione-accecante").saveReminder.ability,
    "con",
  );
});

test("Allucinazione Mortale risolve danno e fine della concentrazione dal reminder", () => {
  const frightened = proposed("phantasmal-killer")[0];

  assert.equal(frightened.name, "Spaventato");
  assert.equal(frightened.options.parentRemoval, "spell");
  assert.equal(frightened.options.endsParentOnRemoval, true);
  assert.deepEqual(frightened.options.saveReminder.damage, {
    dice: "4d10",
    type: "psichici",
    onSave: "none",
  });
});
