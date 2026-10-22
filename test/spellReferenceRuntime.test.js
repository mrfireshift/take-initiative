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
});

test("only the reference window and the spell details load the full reference", async () => {
  const { readdirSync, readFileSync } = await import("node:fs");
  const importers = readdirSync(new URL("../src/", import.meta.url))
    .filter((file) => file.endsWith(".js"))
    .filter((file) => /from "\.\/spell-reference-it\.json"/u.test(readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8")));
  assert.deepEqual(importers.sort(), ["reference-modal.js", "spellReferenceItData.js"]);
  const catalog = readFileSync(new URL("../src/spellbookCatalog.js", import.meta.url), "utf8");
  assert.match(catalog, /import\("\.\/spellReferenceItData\.js"\)/u, "the sheet loads it on demand");
});
