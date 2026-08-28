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
import { effectSummaryPartsFor } from "../src/effectLabelCore.js";

test("tutti i supplementi sono nel catalogo e le spell istantanee pure restano escluse dal tracker", () => {
  assert.equal(getSpellCatalog().length, 477);
  assert.equal(getTrackableSpellOptions().length, 358);
  assert.equal(getSpellDefinition("Catapulta").trackable, false);
  assert.equal(getSpellDefinition("Morsa del Gelo").trackable, true);
});

test("Gabbia dell'Anima resta tracking-only con durata e riferimento RAW completi", () => {
  const spell = getSpellDefinition("xanathar-gabbia-dellanima");
  assert.ok(spell);
  assert.equal(spell.trackable, true);
  assert.equal(spell.duration, "8 ore");
  assert.equal(spell.defaultTurns, 4800);
  assert.equal(spell.concentration, false);
  assert.equal(getTrackableSpellOptions().some((option) => option.id === spell.id), true);
  assert.deepEqual(spell.activeActions, []);
  assert.deepEqual(spell.effects, []);

  const description = spell.italianReference.description;
  for (const phrase of [
    "anima intrappolata",
    "sei volte",
    "Rubare Vita",
    "Interrogare Anima",
    "Esperienza in Prestito",
    "Occhi dei Morti",
  ]) {
    assert.match(description, new RegExp(phrase, "iu"));
  }
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

test("anti-invisibilità e Investiture dichiarano summaryParts senza perdere il detail", () => {
  const expected = {
    "xanathar-aculeo-mentale": [
      { id: "mind-spike-location", label: "Localizzato" },
      { id: "mind-spike-no-hiding", label: "No nascondersi" },
      { id: "mind-spike-no-invisibility", label: "No invis." },
    ],
    "xanathar-investitura-del-ghiaccio": [
      { id: "ice-investiture-cold-immunity", label: "Imm. freddo" },
      { id: "ice-investiture-fire-resistance", label: "Res. fuoco" },
      { id: "ice-investiture-difficult-terrain-aura", label: "Terreno diff. aura" },
    ],
    "xanathar-investitura-del-vento": [
      { id: "wind-investiture-flight", label: "Volo 18 m" },
      { id: "wind-investiture-ranged-disadvantage", label: "Svant. att. distanza" },
    ],
    "xanathar-investitura-della-fiamma": [
      { id: "flame-investiture-fire-immunity", label: "Imm. fuoco" },
      { id: "flame-investiture-cold-resistance", label: "Res. freddo" },
    ],
    "xanathar-investitura-della-pietra": [
      { id: "stone-investiture-weapon-resistance", label: "Res. armi non magiche" },
      { id: "stone-investiture-rock-walk", label: "Passo nella roccia" },
    ],
  };

  for (const [spellId, summaryParts] of Object.entries(expected)) {
    const [effect] = getSpellEffects(spellId);
    assert.deepEqual(effect.summaryParts, summaryParts, spellId);
    assert.deepEqual(effectSummaryPartsFor({ effectId: effect.id }), summaryParts, spellId);
    assert.ok(effect.detail, spellId);
  }
});

test("Debilitazione e Immolazione separano comportamento ricorrente e danno", () => {
  const enervation = getSpellEffects("xanathar-debilitazione")[0];
  const immolation = getSpellEffects("xanathar-immolazione")[0];
  const tenser = getSpellEffects("xanathar-trasformazione-di-tenser")[0];

  assert.deepEqual(enervation.summaryParts, [
    { id: "enervation-repeat-damage", label: "Azione: ripeti danni" },
    { id: "enervation-heal-half", label: "Cura metà danni" },
  ]);
  assert.ok(enervation.detail);

  assert.deepEqual(immolation.summaryParts, [
    { id: "immolation-end-turn-save", label: "TS Des fine turno" },
    { id: "immolation-fire-damage", label: "4d6 fuoco" },
  ]);
  assert.equal(immolation.saveReminder.timing, "turn-end");
  assert.ok(immolation.detail);

  assert.deepEqual(tenser.summaryParts, [
    { id: "tensers-temporary-hit-points", label: "50 PF temp." },
    { id: "tensers-weapon-attack-advantage", label: "Vant. att. armi" },
    { id: "tensers-force-damage", label: "+2d12 forza" },
    { id: "tensers-martial-proficiency", label: "Comp. marziali" },
  ]);
  assert.ok(tenser.detail);
});

test("le varianti difensive dichiarano summaryParts per ogni scelta persistente", () => {
  const cases = [
    ["xanathar-arma-sacra", "", [
      { id: "holy-weapon-magical", label: "Arma magica" },
      { id: "holy-weapon-radiant-damage", label: "+2d8 radiosi" },
    ]],
    ["xanathar-interdizione-primordiale", "", [
      { id: "elemental-resistances-five-types", label: "Res. 5 elementi" },
      { id: "elemental-resistances-reaction-immunity", label: "Reaz.: Imm. tipo" },
    ]],
    ["tasha-fortezza-della-mente", "", [
      { id: "intellect-fortress-psychic-resistance", label: "Res. psichici" },
      { id: "intellect-fortress-mental-save-advantage", label: "Vant. TS Int/Sag/Car" },
    ]],
    ["xanathar-guardiano-della-natura", "primal-beast", [
      { id: "primal-beast-speed", label: "Vel +3 m" },
      { id: "primal-beast-darkvision", label: "Scurovisione" },
      { id: "primal-beast-strength-advantage", label: "Vant. att. Forza" },
      { id: "primal-beast-force-damage", label: "+1d6 forza" },
    ]],
    ["xanathar-guardiano-della-natura", "great-tree", [
      { id: "great-tree-temporary-hit-points", label: "10 PF temp." },
      { id: "great-tree-constitution-save-advantage", label: "Vant. TS Cos" },
      { id: "great-tree-dex-wis-attack-advantage", label: "Vant. att. Des/Sag" },
      { id: "great-tree-difficult-terrain-aura", label: "Terreno diff. aura" },
    ]],
    ["tasha-abito-ultraterreno-di-tasha", "lower-planes", [
      { id: "lower-planes-armor-class", label: "+2 CA" },
      { id: "lower-planes-flight", label: "Volo 12 m" },
      { id: "lower-planes-elemental-immunity", label: "Imm. fuoco/veleno" },
      { id: "lower-planes-poisoned-immunity", label: "Imm. avvelenato" },
      { id: "lower-planes-magical-attacks", label: "Attacchi magici" },
      { id: "lower-planes-extra-attack", label: "Attacco extra" },
    ]],
    ["tasha-abito-ultraterreno-di-tasha", "upper-planes", [
      { id: "upper-planes-armor-class", label: "+2 CA" },
      { id: "upper-planes-flight", label: "Volo 12 m" },
      { id: "upper-planes-elemental-immunity", label: "Imm. radiosi/necrotici" },
      { id: "upper-planes-charmed-immunity", label: "Imm. affascinato" },
      { id: "upper-planes-magical-attacks", label: "Attacchi magici" },
      { id: "upper-planes-extra-attack", label: "Attacco extra" },
    ]],
  ];

  for (const [spellId, choice, summaryParts] of cases) {
    const [effect] = getSpellEffects(spellId, choice);
    assert.deepEqual(effect.summaryParts, summaryParts, `${spellId}:${choice}`);
    assert.ok(effect.detail, `${spellId}:${choice}`);
  }
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
