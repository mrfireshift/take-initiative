import assert from "node:assert/strict";

import catalog from "../src/spells-srd-5.1.json" with { type: "json" };
import italian from "../src/spells-it-2014.json" with { type: "json" };
import {
  SPELLS_5E_SRD,
  durationToRounds,
  getProposedConditions,
  getSpellDefinition,
  getTrackableSpellOptions,
} from "../src/spells-srd.js";

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
assert.equal(options.length, 235);
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
  trackable: options.length,
  nonInstantaneous: nonInstantaneous.length,
  manualDuration: manualDuration.length,
}));
