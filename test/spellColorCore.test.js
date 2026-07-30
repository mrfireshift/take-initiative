import test from "node:test";
import assert from "node:assert/strict";

import { spellColorFor } from "../src/spellColorCore.js";
import { getSpellCatalog } from "../src/spells-srd.js";

test("la palette usa danno, scuola e riferimenti descrittivi del catalogo", () => {
  assert.equal(spellColorFor("fireball").theme, "fire");
  assert.equal(spellColorFor("shield").theme, "abjuration");
  assert.equal(spellColorFor("xanathar-alba").theme, "radiant");
  assert.equal(spellColorFor("phb2014-armatura-di-agathys").theme, "cold");
});

test("nessuna spell catalogata ricade nel fallback arcano", () => {
  const fallbackIds = getSpellCatalog()
    .filter((spell) => spellColorFor(spell).theme === "arcane")
    .map((spell) => spell.id);

  assert.deepEqual(fallbackIds, []);
});
