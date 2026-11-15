// The runtime excerpt of the Italian spell reference: what the rules modules read without loading the 466 KB file.
import test from "node:test";
import assert from "node:assert/strict";
import reference from "../src/spell-reference-it.json" with { type: "json" };
import excerpt from "../src/spell-reference-it-runtime.json" with { type: "json" };

test("the runtime excerpt matches the full Italian reference", () => {
  assert.equal(excerpt.schemaVersion, reference.schemaVersion);
  for (const [id, spell] of Object.entries(excerpt.spells)) {
    assert.deepEqual(spell, reference.spells[id], `${id} differs from spell-reference-it.json`);
  }
  const rituals = Object.values(reference.spells).filter((spell) => spell.ritual === true).map((spell) => spell.id).sort();
  assert.deepEqual(excerpt.ritualIds, rituals);
  // The spells the Ready action can hold (docs/STUDIO_AZIONI_DI_TURNO.md §9, lot T6a): cast with 1 action, cantrips too.
  const oneAction = Object.values(reference.spells).filter((spell) => /^1 azione(?! bonus)/u.test(String(spell.castingTime || "")))
    .map((spell) => spell.id).sort();
  assert.deepEqual(excerpt.oneActionIds, oneAction);
  assert.equal(oneAction.length, 242);
});

test("the reference window and the spell details load the full reference only on demand", async () => {
  const { readdirSync, readFileSync } = await import("node:fs");
  const importers = readdirSync(new URL("../src/", import.meta.url))
    .filter((file) => file.endsWith(".js"))
    .filter((file) => /from "\.\/spell-reference-it\.json"/u.test(readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8")));
  assert.deepEqual(importers.sort(), ["spellReferenceItData.js"]);
  const catalog = readFileSync(new URL("../src/spellbookCatalog.js", import.meta.url), "utf8");
  assert.match(catalog, /import\("\.\/spellReferenceItData\.js"\)/u, "the sheet loads it on demand");
  const modal = readFileSync(new URL("../src/reference-modal.js", import.meta.url), "utf8");
  assert.match(modal, /import\("\.\/spellReferenceItData\.js"\)/u, "the encyclopedia loads it with its Spells tab");
});
