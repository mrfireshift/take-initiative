import test from "node:test";
import assert from "node:assert/strict";

import catalog from "../src/spells-supplements-2014.json" with { type: "json" };
import runtimeCatalog from "../src/spells-supplements-runtime.json" with { type: "json" };
import { readPrivateSpellTexts } from "../scripts/privateSources.mjs";

// The texts are in the GM's private folder (compendio delle regole, fase 2): the tests that read them are skipped
// without it.
const xanatharTexts = readPrivateSpellTexts("xanathar");
const tashaTexts = readPrivateSpellTexts("tasha");

function spell(id) {
  return catalog.spells.find((entry) => entry.id === id);
}

test("il catalogo supplementi conserva tutte le voci con ID univoci", () => {
  assert.equal(catalog.schemaVersion, 1);
  assert.equal(catalog.spells.length, 116);
  assert.deepEqual(
    Object.fromEntries(catalog.sources.map((source) => [source.id, source.spellCount])),
    { xanathar: 95, tasha: 21 }
  );
  assert.equal(new Set(catalog.spells.map((entry) => entry.id)).size, 116);
  assert.ok(catalog.spells.every((entry) =>
    entry.name && entry.school && entry.duration &&
    ["xanathar", "tasha"].includes(entry.source)
  ));
});

test("il catalogo nel repo non contiene i testi dei supplementi", () => {
  for (const entries of [catalog.spells, runtimeCatalog.spells]) {
    assert.ok(entries.every((entry) => !("description" in entry) && !("higherLevels" in entry)));
  }
});

test("la cartella privata ha il testo di ogni incantesimo dei supplementi", { skip: !(xanatharTexts && tashaTexts) && "testi privati assenti" }, () => {
  for (const entry of catalog.spells) {
    const texts = entry.source === "xanathar" ? xanatharTexts : tashaTexts;
    assert.ok(texts[entry.id]?.description, entry.id);
  }
});

test("il catalogo runtime contiene tutti gli incantesimi forniti", () => {
  assert.equal(runtimeCatalog.spells.length, 116);
  assert.deepEqual(
    runtimeCatalog.spells.map((entry) => entry.id),
    runtimeCatalog.approvedIds
  );
  assert.deepEqual(runtimeCatalog.approvedIds, catalog.spells.map((entry) => entry.id));
});

test("il catalogo generato non contiene caratteri di sostituzione o mojibake", () => {
  const serialized = JSON.stringify(catalog);
  assert.equal(serialized.includes("\uFFFD"), false);
  assert.equal(/[ÃÂ]/u.test(serialized), false);
});

test("le collisioni Tasha con i nomi Conjure SRD restano incantesimi distinti", () => {
  for (const id of [
    "tasha-evoca-celestiale",
    "tasha-evoca-elementale",
    "tasha-evoca-folletto",
  ]) {
    assert.equal(spell(id).review.integrationStatus, "collision-review");
    assert.equal(spell(id).review.flags.includes("name-collision-existing"), true);
    assert.equal(spell(id).review.duplicateOf, null);
  }
  assert.equal(
    spell("tasha-scudiscio-mentale-di-tasha").review.integrationStatus,
    "merge-existing"
  );
});

test("tutti gli incantesimi da un round hanno una proposta di scadenza", () => {
  const oneRound = catalog.spells.filter((entry) => entry.duration === "1 round");
  assert.equal(oneRound.length, 4);
  assert.ok(oneRound.every((entry) =>
    entry.review.proposedAutomation?.spellExpiry?.mode &&
    entry.review.proposedAutomation?.spellExpiry?.actor
  ));
  assert.deepEqual(
    spell("tasha-scudiscio-mentale-di-tasha").review.proposedAutomation.spellExpiry,
    { mode: "turn-end", actor: "target", remaining: 1, anchor: "next-turn" }
  );
  assert.equal(
    spell("xanathar-assorbire-elementi").review.proposedAutomation.effects.length,
    2
  );
});

test("la normalizzazione separa descrizione e progressione ai livelli superiori", { skip: !xanatharTexts && "testi privati assenti" }, () => {
  const mindSpike = spell("xanathar-aculeo-mentale");
  const text = xanatharTexts[mindSpike.id];
  assert.equal(text.description.includes("Ai Livelli Superiori"), false);
  assert.match(text.higherLevels, /3° livello/u);
  assert.equal(mindSpike.defaultTurns, 600);
  assert.equal(mindSpike.concentration, true);
});
