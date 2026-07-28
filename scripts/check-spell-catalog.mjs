import assert from "node:assert/strict";

import catalog from "../src/spells-srd-5.1.json" with { type: "json" };
import italian from "../src/spells-it-2014.json" with { type: "json" };
import phb2014 from "../src/spells-phb2014-extra.json" with { type: "json" };
import {
  SPELLS_5E_SRD,
  durationToRounds,
  getProposedConditions,
  getSpellEffectChoices,
  getSpellEffects,
  getSpellCatalog,
  getSpellDefinition,
  getTrackableSpellOptions,
} from "../src/spells-srd.js";

const fullCatalog = getSpellCatalog();
const options = getTrackableSpellOptions();
const nonInstantaneous = catalog.spells.filter(
  (spell) => spell.duration !== "Instantaneous"
);
const manualDuration = nonInstantaneous.filter(
  (spell) => durationToRounds(spell.duration) == null
);
const italianNames = Object.entries(italian.names || {});

assert.equal(catalog.spells.length, 319);
assert.equal(italianNames.length, 319);
assert.equal(new Set(italianNames.map(([, name]) => name)).size, 319);
assert.equal(nonInstantaneous.length, 232);
assert.equal(phb2014.schemaVersion, 1);
assert.equal(phb2014.source.id, "phb2014");
assert.equal(phb2014.spells.length, 40);
assert.equal(new Set(phb2014.approvedIds).size, 40);
assert.deepEqual(phb2014.approvedIds, phb2014.spells.map((spell) => spell.id));
assert.equal(fullCatalog.length, 477);
assert.equal(fullCatalog.filter((spell) => spell.source === "phb2014").length, 40);
assert.equal(options.length, 355);
assert.equal(SPELLS_5E_SRD.length, options.length);
assert.equal(new Set(options.map((option) => option.id)).size, options.length);
assert.equal(new Set(options.map((option) => option.value)).size, options.length);
assert.ok(options.every((option) => option.label === option.value));
for (const spell of catalog.spells) {
  assert.equal(getSpellDefinition(spell.id).displayName, italian.names[spell.id]);
}

assert.equal(getSpellDefinition("Velocita").id, "haste");
assert.equal(getSpellDefinition("Cecita/Sordita").id, "blindness-deafness");
assert.equal(getSpellDefinition("Scudiscio Mentale di Tasha").source, "legacy");
assert.equal(getSpellDefinition("Assorbire Elementi").id, "xanathar-assorbire-elementi");
assert.equal(getSpellDefinition("Lama Roboante").id, "tasha-lama-roboante");
assert.equal(getSpellDefinition("Scheggia della Mente").id, "tasha-scheggia-della-mente");
assert.equal(getSpellDefinition("Evoca Celestiale").id, "conjure-celestial");
assert.equal(getSpellDefinition("Evoca Celestiale (Tasha)").id, "tasha-evoca-celestiale");
assert.equal(getSpellDefinition("Morsa del Gelo").trackable, true);
assert.equal(getSpellDefinition("Parola del Potere Dolore").expiry.mode, "manual");
assert.equal(getSpellDefinition("Assorbire Elementi").targetMode, "self");
assert.equal(getSpellDefinition("Scudiscio Mentale di Tasha").expiry.actor, "target");
assert.equal(getSpellDefinition("Lama Roboante").expiry.mode, "turn-start");
assert.equal(getSpellDefinition("Scheggia della Mente").expiry.mode, "turn-end");
assert.deepEqual(
  getSpellEffectChoices("Assorbire Elementi").map((choice) => choice.value),
  ["acido", "freddo", "fulmine", "fuoco", "tuono"],
);
assert.deepEqual(
  getSpellEffects("Assorbire Elementi", "fuoco").map((effect) => [
    effect.label,
    effect.expiry.mode,
    effect.manualRemoval === true,
  ]),
  [
    ["Res. fuoco", "turn-start", false],
    ["+1d6 fuoco in mischia", "turn-end", true],
  ],
);
assert.deepEqual(getSpellEffects("bane").map((effect) => [effect.kind, effect.label]), [
  ["debuff", "-1d4 Att/TS"],
]);
assert.deepEqual(getSpellEffects("bless").map((effect) => [effect.kind, effect.label]), [
  ["buff", "+1d4 Att/TS"],
]);
assert.equal(getSpellEffects("guidance")[0].manualRemoval, true);
assert.deepEqual(getSpellEffects("fireball"), []);
assert.deepEqual(getSpellEffectChoices("enhance-ability").map((choice) => choice.value), [
  "fox-cunning",
  "bull-strength",
  "cats-grace",
  "bears-endurance",
  "owls-wisdom",
  "eagles-splendor",
]);
assert.deepEqual(
  getSpellEffects("enhance-ability", "bears-endurance").map((effect) => effect.label),
  ["Vant. prove Cos · 2d6 PF temp"],
);
assert.equal(getSpellEffects("enlarge-reduce", "reduce")[0].kind, "debuff");
assert.equal(getSpellDefinition("shield").expiry.mode, "turn-start");
assert.equal(getSpellDefinition("shield").expiry.actor, "source");
assert.equal(getSpellDefinition("command").expiry.mode, "turn-end");
assert.equal(getSpellDefinition("command").expiry.actor, "target");
assert.equal(getSpellDefinition("fear").targetMode, "area");
assert.equal(getSpellDefinition("invisibility").automation.mode, "automatic");
assert.deepEqual(
  getProposedConditions(getSpellDefinition("blindness-deafness"), "Assordato"),
  ["Assordato"]
);
assert.equal(durationToRounds("1 round"), 1);
assert.equal(durationToRounds("Up to 1 minute"), 10);
assert.equal(durationToRounds("8 hours"), 4800);
assert.equal(durationToRounds("Until dispelled"), null);
assert.equal(getSpellDefinition("arcane-lock").defaultTurns, null);
assert.equal(manualDuration.length, 14);

console.log(JSON.stringify({
  catalog: catalog.spells.length,
  italianNames: italianNames.length,
  fullCatalog: fullCatalog.length,
  phb2014: phb2014.spells.length,
  trackable: options.length,
  nonInstantaneous: nonInstantaneous.length,
  manualDuration: manualDuration.length,
}));
