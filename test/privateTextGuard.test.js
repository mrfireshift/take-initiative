// Compendio delle regole, fase 2: the texts of the manuals that are not in the SRD stay out of the repository. The
// spell catalogs keep their facts, the raw spell files live in the GM's private folder (scripts/privateSources.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import supplementCatalog from "../src/spells-supplements-2014.json" with { type: "json" };
import supplementRuntime from "../src/spells-supplements-runtime.json" with { type: "json" };
import phbExtra from "../src/spells-phb2014-extra.json" with { type: "json" };
import { getSpellCatalog } from "../src/spells-srd.js";

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
