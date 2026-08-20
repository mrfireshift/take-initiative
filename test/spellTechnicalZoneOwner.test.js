import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const tagPath = new URL("../src/spells-tag.js", import.meta.url);
const spellsPath = new URL("../src/spells.js", import.meta.url);
const listPath = new URL("../src/initiativeList.js", import.meta.url);

test("targets esplicitamente vuoti non ricadono sul caster nelle pill mappa", async () => {
  const source = await readFile(tagPath, "utf8");

  assert.match(
    source,
    /const targets = Array\.isArray\(v\.targets\) \? v\.targets\.filter\(Boolean\) : \[selfId\]/,
  );
  assert.doesNotMatch(
    source,
    /Array\.isArray\(v\.targets\) && v\.targets\.length \? v\.targets\.filter\(Boolean\) : \[selfId\]/,
  );
});

test("il tracker filtra soltanto il record tecnico proprietario della zona", async () => {
  const [spells, list] = await Promise.all([
    readFile(spellsPath, "utf8"),
    readFile(listPath, "utf8"),
  ]);

  assert.match(
    spells,
    /spell\?\.castContext\?\.staticZoneOwner !== true/,
  );
  assert.match(list, /spells: getVisibleSpellsFromItem\(it\)/);
});


test("Investitura della Fiamma mostra la pill concentrazione solo sul caster", async () => {
  const source = await readFile(tagPath, "utf8");

  assert.match(
    source,
    /SELF_ONLY_CONCENTRATION_LABEL_SPELL_IDS = new Set\(\[\s*"xanathar-investitura-della-fiamma"/,
  );
  assert.match(
    source,
    /SELF_ONLY_CONCENTRATION_LABEL_SPELL_KEYS = new Set\(\[\s*spellKey\("Investitura della Fiamma"\)/,
  );
  assert.match(
    source,
    /concentrationLabelTargets\(\{[\s\S]*spellId,[\s\S]*spellName: name,[\s\S]*targets,[\s\S]*casterId: selfId/,
  );
  assert.match(
    source,
    /isInvalidSelfOnlyConcentrationWidget\(widget\)[\s\S]*casterId === targetId/,
  );
  assert.match(
    source,
    /invalidSelfOnlyWidgetIds[\s\S]*__concentrationDeleteItems\(diagnosticsSession, invalidSelfOnlyWidgetIds\)/,
  );
});
