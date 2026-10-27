// Compendio delle regole, fase 2: the texts of the manuals that are not in the SRD stay out of the repository. The
// spell catalogs keep their facts, the raw spell files live in the GM's private folder (scripts/privateSources.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import supplementCatalog from "../src/spells-supplements-2014.json" with { type: "json" };
import supplementRuntime from "../src/spells-supplements-runtime.json" with { type: "json" };
import phbExtra from "../src/spells-phb2014-extra.json" with { type: "json" };
import { getSpellCatalog } from "../src/spells-srd.js";
import { loadSpellbookSpellReference, spellbookSpellDetails } from "../src/spellbookCatalog.js";
import { privateTextMissingNote } from "../src/privatePackCore.js";

test("i cataloghi degli incantesimi non SRD non hanno testi", () => {
  for (const [name, catalog] of [["supplementi", supplementCatalog], ["runtime", supplementRuntime], ["PHB", phbExtra]]) {
    const withText = catalog.spells.filter((spell) => "description" in spell || "higherLevels" in spell).map((spell) => spell.id);
    assert.deepEqual(withText, [], name);
  }
});

test("nel catalogo runtime un incantesimo non SRD ha i fatti e il rimando al pacchetto, mai il testo", () => {
  const privateSpells = getSpellCatalog().filter((spell) => spell.italianReference?.privateSource);
  // 115 of the supplements (Tasha's Mind Whip is served as its legacy entry), 41 of the Manuale, the legacy Mind Whip.
  assert.equal(privateSpells.length, 157);
  for (const spell of privateSpells) {
    assert.equal(spell.italianReference.description, undefined, spell.id);
    assert.equal(spell.italianReference.higherLevels, undefined, spell.id);
    assert.ok(["xanathar", "tasha", "phb2014"].includes(spell.italianReference.privateSource), spell.id);
    assert.ok(spell.italianReference.privateTextId, spell.id);
  }
});

test("i file grezzi degli incantesimi non stanno nel repo", () => {
  const raw = new URL("../docs/class-features/raw/", import.meta.url);
  const spellFiles = fs.existsSync(raw) ? fs.readdirSync(raw).filter((file) => file.startsWith("incantesimi_")) : [];
  assert.deepEqual(spellFiles, []);
});

test("senza pacchetto la scheda mostra i fatti di un incantesimo di Xanathar e dice quale pacchetto ha il testo", async () => {
  // Node has no IndexedDB: no pack is imported, as in a browser that never opened the Pacchetti panel.
  await loadSpellbookSpellReference();
  const details = spellbookSpellDetails("xanathar-aculeo-mentale");
  assert.equal(details.description, "");
  assert.equal(details.missingText, "xanathar");
  assert.ok(details.castingTime && details.range && details.duration);
  assert.match(privateTextMissingNote(details.missingText), /«Guida Omnicomprensiva di Xanathar»/u);
  // An SRD spell never asks for a pack.
  assert.equal(spellbookSpellDetails("fireball").missingText, "");
});
