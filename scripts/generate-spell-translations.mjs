import fs from "node:fs";

import catalog from "../src/spells-srd-5.1.json" with { type: "json" };

const DICTIONARY_URL = "https://gist.githubusercontent.com/rubenspischedda/23c0db6a3b22160c392ae8b0269a0b55/raw/e164ca18f13e24fa3a9c45f7bea4cf63321a9d25/dnd-5e-it.json";
const OUTPUT_PATH = "src/spells-it-2014.json";

const ITALIAN_OVERRIDES = Object.freeze({
  "acid-arrow": "Freccia acida",
  "arcane-hand": "Mano arcana",
  "arcane-sword": "Spada arcana",
  "arcanists-magic-aura": "Aura magica dell'arcanista",
  "black-tentacles": "Tentacoli neri",
  "branding-smite": "Punizione Marchiante",
  "faithful-hound": "Segugio fedele",
  "floating-disk": "Disco fluttuante",
  "freezing-sphere": "Sfera congelante",
  "hideous-laughter": "Risata incontenibile",
  "instant-summons": "Evocazione istantanea",
  "irresistible-dance": "Danza irresistibile",
  "locate-animals-or-plants": "Localizza animali o vegetali",
  "magnificent-mansion": "Reggia meravigliosa",
  "poison-spray": "Spruzzo velenoso",
  "private-sanctum": "Santuario privato",
  "resilient-sphere": "Sfera elastica",
  "secret-chest": "Scrigno segreto",
  "telepathic-bond": "Legame telepatico",
  "tiny-hut": "Capanna",
});

function lookupKey(value) {
  return String(value || "").trim().toLocaleLowerCase("en").replace(/\s+/g, " ");
}

function displayName(value) {
  const clean = String(value || "").trim();
  return clean ? clean[0].toLocaleUpperCase("it") + clean.slice(1) : "";
}

const response = await fetch(DICTIONARY_URL);
if (!response.ok) throw new Error("Italian dictionary HTTP " + response.status);
const dictionary = await response.json();

const translations = new Map();
for (const entry of Array.isArray(dictionary?.items) ? dictionary.items : []) {
  const key = lookupKey(entry?.key);
  const value = displayName(entry?.value);
  if (key && value && !translations.has(key)) translations.set(key, value);
}

const names = {};
const missing = [];
for (const spell of catalog.spells || []) {
  const translated = ITALIAN_OVERRIDES[spell.id] || translations.get(lookupKey(spell.name));
  if (!translated) {
    missing.push(spell.id + ": " + spell.name);
    continue;
  }
  names[spell.id] = displayName(translated);
}

if (missing.length) {
  throw new Error("Missing Italian spell names:\n" + missing.join("\n"));
}
if (Object.keys(names).length !== 319) {
  throw new Error("Expected 319 Italian spell names, received " + Object.keys(names).length);
}

const payload = {
  schemaVersion: 1,
  ruleset: "D&D 5e SRD 5.1 (2014)",
  language: "it",
  source: DICTIONARY_URL,
  generatedAt: new Date().toISOString().slice(0, 10),
  names,
};

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2) + "\n", "utf8");
console.log("Wrote " + Object.keys(names).length + " Italian spell names to " + OUTPUT_PATH);
