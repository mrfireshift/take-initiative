import test from "node:test";
import assert from "node:assert/strict";

import {
  getProposedConditions,
  getSpellCatalog,
  getSpellChoiceTiming,
  getSpellDefinition,
  getSpellEffectChoices,
  getSpellEffects,
  getTrackableSpellOptions,
} from "../src/spells-srd.js";

test("tutti i supplementi sono nel catalogo e le spell istantanee pure restano escluse dal tracker", () => {
  assert.equal(getSpellCatalog().length, 477);
  assert.equal(getTrackableSpellOptions().length, 358);
  assert.equal(getSpellDefinition("Catapulta").trackable, false);
  assert.equal(getSpellDefinition("Morsa del Gelo").trackable, true);
});

test("le collisioni di nome Tasha sono selezionabili senza sostituire le spell SRD", () => {
  assert.equal(getSpellDefinition("Evoca Celestiale").id, "conjure-celestial");
  assert.equal(getSpellDefinition("Evoca Celestiale (Tasha)").id, "tasha-evoca-celestiale");
  const values = getTrackableSpellOptions().map((option) => option.value);
  assert.equal(new Set(values).size, values.length);
});

test("le condizioni indipendenti dal parent conservano la propria durata", () => {
  assert.deepEqual(getProposedConditions(getSpellDefinition("Muro di Luce")), [{
    name: "Accecato",
    options: {
      expiry: { mode: "rounds", remaining: 10 },
      parentEffectId: "",
      manualRemoval: true,
      saveReminder: {
        ability: "con",
        timing: "turn-end",
        dcSource: "source-spell",
        label: "Se supera il TS, termina Accecato su di sé.",
      },
    },
  }]);
  assert.deepEqual(getProposedConditions(getSpellDefinition("Sonnellino")), ["Privo di sensi"]);
});

test("Pirotecnica e Cerimonia impostano la durata in base alla scelta", () => {
  assert.deepEqual(getSpellChoiceTiming("Pirotecnica", "fireworks"), {
    defaultTurns: 1,
    spellExpiry: {
      mode: "turn-end",
      actor: "source",
      remaining: 1,
      anchor: "next-turn",
    },
  });
  assert.deepEqual(getSpellChoiceTiming("Pirotecnica", "smoke"), {
    defaultTurns: 10,
    spellExpiry: null,
  });
  assert.equal(getSpellChoiceTiming("Cerimonia", "wedding").defaultTurns, 100800);
});

test("gli effetti persistenti istantanei dichiarano consumo e scadenza", () => {
  const frostbite = getSpellEffects("Morsa del Gelo")[0];
  assert.equal(frostbite.manualRemoval, true);
  assert.deepEqual(frostbite.expiry, {
    mode: "turn-end",
    actor: "target",
    remaining: 1,
    anchor: "next-turn",
  });
  assert.equal(getSpellEffects("Parola del Potere Dolore")[0].expiry.mode, "manual");
  assert.deepEqual(getSpellEffects("Scossa Sinaptica")[0].expiry, {
    mode: "rounds",
    remaining: 10,
  });
});

test("Abilità Potenziata espone tutte le abilità SRD come scelta", () => {
  const choices = getSpellEffectChoices("Abilità Potenziata");

  assert.equal(choices.length, 18);
  assert.deepEqual(choices.map((choice) => choice.label), [
    "Acrobazia",
    "Addestrare Animali",
    "Arcano",
    "Atletica",
    "Furtività",
    "Indagare",
    "Inganno",
    "Intimidire",
    "Intrattenere",
    "Intuizione",
    "Medicina",
    "Natura",
    "Percezione",
    "Persuasione",
    "Rapidità di Mano",
    "Religione",
    "Sopravvivenza",
    "Storia",
  ]);

  const selected = getSpellEffects("Abilità Potenziata", "furtivita");
  assert.deepEqual(selected.map((effect) => effect.label), ["Maestria: Furtività"]);
});

test("l'audit iniziale dichiara i reminder TS ricorrenti nelle regole spell", () => {
  const fear = getProposedConditions(getSpellDefinition("Incuti Paura"))[0];
  const enemies = getSpellEffects("Nemici in Abbondanza")[0];
  const synaptic = getSpellEffects("Scossa Sinaptica")[0];
  const searing = getSpellEffects("Punizione Incandescente")[0];

  assert.deepEqual(fear.options.saveReminder, {
    ability: "wis",
    timing: "turn-end",
    dcSource: "source-spell",
    success: "remove-effect",
    label: "Se supera il TS, termina Spaventato su di sé.",
  });
  assert.equal(enemies.saveReminder.timing, "damage");
  assert.equal(synaptic.saveReminder.timing, "turn-end");
  assert.equal(searing.saveReminder.timing, "turn-start");
});

test("Sfera Acquea sgancia il singolo bersaglio e lo rende Prono solo alla fine della spell", () => {
  const restrained = getSpellDefinition("Sfera Acquea").saveAutomation.failed[0];
  assert.equal(restrained.parentRemoval, "target");
  assert.deepEqual(restrained.parentEndCondition, {
    condition: "Prono",
    expiry: { mode: "manual" },
  });
});
