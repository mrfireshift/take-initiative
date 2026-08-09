import test from "node:test";
import assert from "node:assert/strict";

import { spellColorFor, spellEffectThemeFor } from "../src/spellColorCore.js";
import { getSpellCatalog } from "../src/spells-srd.js";

test("la palette usa danno, scuola e riferimenti descrittivi del catalogo", () => {
  assert.equal(spellColorFor("fireball").theme, "fire");
  assert.equal(spellColorFor("shield").theme, "abjuration");
  assert.equal(spellColorFor("xanathar-alba").theme, "radiant");
  assert.equal(spellColorFor("phb2014-armatura-di-agathys").theme, "cold");
  assert.equal(spellColorFor("xanathar-sfera-al-vetriolo").theme, "acid");
});

test("nessuna spell catalogata ricade nel fallback arcano", () => {
  const fallbackIds = getSpellCatalog()
    .filter((spell) => spellColorFor(spell).theme === "arcane")
    .map((spell) => spell.id);

  assert.deepEqual(fallbackIds, []);
});

test("le pill di Sfera e Freccia acida condividono il tema acido", () => {
  const sphereTheme = spellEffectThemeFor("xanathar-sfera-al-vetriolo");
  const arrowTheme = spellEffectThemeFor("Freccia acida");
  assert.deepEqual(sphereTheme, arrowTheme);
  assert.equal(sphereTheme.background, "#65a30d");
  assert.equal(sphereTheme.accent, "#bef264");
});
