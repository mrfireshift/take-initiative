import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const tagPath = new URL("../src/spells-tag.js", import.meta.url);
const spellsPath = new URL("../src/spells.js", import.meta.url);
const movementToolPath = new URL("../src/aoeTargetTool.js", import.meta.url);
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

test("il tracker tiene fuori dalle pill i record tecnici sugli item non caster", async () => {
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

test("il record owner static-zone è visibile solo sul token caster", async () => {
  const source = await readFile(spellsPath, "utf8");

  assert.match(source, /const itemId = String\(item\?\.id \|\| ""\)\.trim\(\)/);
  assert.match(
    source,
    /String\(spell\?\.casterId \|\| ""\)\.trim\(\) === itemId/,
  );
});

test("il record owner di Turbine non diventa una pill sul caster", async () => {
  const source = await readFile(spellsPath, "utf8");

  assert.match(source, /const isTurbine = spellId === "xanathar-turbine"/);
  assert.match(
    source,
    /const isTurbineOwner = isTurbine && \([\s\S]{0,180}casterId === itemId/,
  );
  assert.match(source, /const spellId = String\(spell\?\.spellId \|\| ""\)\.trim\(\)/);
  assert.match(source, /if \(isTurbineOwner\) return false;/);
});

test("il riepilogo esclude Turbine anche da un vecchio record owner senza castContext", async () => {
  const source = await readFile(new URL("../src/spellsPanelViewCore.js", import.meta.url), "utf8");

  assert.match(source, /function isTurbineSpellRecord\(spell\)/);
  assert.match(source, /function isTechnicalOwnerRecord\(spell, itemId\)/);
  assert.match(source, /if \(!isTechnicalOwnerRecord\(spell, target\.id\)\)/);
  assert.match(
    source,
    /filter\(\(targetId\) => !\(isTurbine && targetId === String\(caster\.id \|\| ""\)\.trim\(\)\)\)/,
  );
});

test("il tool AOE non crea più i comandi generici di conferma/annulla movimento", async () => {
  const source = await readFile(movementToolPath, "utf8");

  assert.doesNotMatch(
    source,
    /createAction\(\{[\s\S]{0,500}id: SPELL_MOVEMENT_CONFIRM_ACTION_ID/,
  );
  assert.doesNotMatch(
    source,
    /createAction\(\{[\s\S]{0,500}id: SPELL_MOVEMENT_CANCEL_ACTION_ID/,
  );
  assert.match(source, /removeAction\(SPELL_MOVEMENT_CONFIRM_ACTION_ID\)/);
  assert.match(source, /removeAction\(SPELL_MOVEMENT_CANCEL_ACTION_ID\)/);
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
