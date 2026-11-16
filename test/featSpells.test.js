// Lot F3a of docs/STUDIO_TALENTI.md: the spells a feat grants of its own (not chosen), cast like a species' innate
// spells: the feat's use spent in the cast's command, its DC and ability, in the book as "Talento" where the slots work
// too, among the spells a creature can cast (the reaction prompts), and a warning when a quick action repeats one.
import assert from "node:assert/strict";
import test from "node:test";
import { FEATS, FEAT_FEATURES, FEAT_RESOURCE_POOLS, featGrantedSpells, featSpellAbility, featWarnings } from "../src/featCatalog.js";
import { planSpeciesSpellCost, speciesSpellActionId, speciesSpellCast } from "../src/speciesInnateSpellCore.js";
import { spellbookGroupsForProfile } from "../src/spellbookCatalog.js";
import { creatureCastableSpellIds } from "../src/attackReactionsCore.js";
import { getSpellDefinition } from "../src/spells-srd.js";
import { CLASS_FEATURE_RESOURCE_POOL_BY_ID } from "../src/classFeatureCatalog.js";

const META = "com.thebigpicture.initiative/meta";
const card = (feats, extra = {}) => ({ characterBuild: [{ classId: "ladro", level: 5 }], abilityModifiers: { int: 1, wis: 2, cha: 3 },
  feats, ...extra });
const cast = (featureId, profile, resources = {}) => speciesSpellCast({ actionId: speciesSpellActionId(featureId), card: profile, resources });
// The feats' own spells; those the player chooses (lot F3b) are in test/featChosenSpells.test.js.
const spellRecords = () => FEAT_FEATURES.filter((feature) => feature.innateSpell && !feature.featChoice);

test("seven feats grant spells of their own: one record each, with a spell of the catalog and the feat's use", () => {
  assert.deepEqual([...new Set(spellRecords().map((feature) => feature.featId))], ["alta-magia-drow", "magia-degli-elfi-dei-boschi",
    "teletrasporto-fatato", "contaminazione-fatata", "contaminazione-ombrosa", "telecinesi", "telepatia"]);
  for (const feature of spellRecords()) {
    assert.ok(getSpellDefinition(feature.innateSpell.spellId), feature.id);
    assert.ok(feature.id.startsWith(`talento-${feature.featId}-`), feature.id);
    for (const poolId of feature.trackedResourcePoolIds) assert.ok(CLASS_FEATURE_RESOURCE_POOL_BY_ID.get(poolId), poolId);
  }
  // At will: Drow High Magic's Detect Magic, Telekinetic's Mage Hand. Fey Teleportation's use comes back with a short rest.
  assert.deepEqual(spellRecords().filter((feature) => !feature.trackedResourcePoolIds.length).map((feature) => feature.innateSpell.spellId),
    ["detect-magic", "mage-hand"]);
  assert.deepEqual(CLASS_FEATURE_RESOURCE_POOL_BY_ID.get("talento-teletrasporto-fatato-passo-velato-usi").refresh.map((entry) => entry.event),
    ["riposo_breve", "riposo_lungo"]);
  // Fortunato and Orcish Fury, the eight uses of these spells, and the chosen slots of the Touched feats (lot F3b-1), of
  // Magic Initiate and of Artificer Initiate (lot F3b-2).
  assert.equal(FEAT_RESOURCE_POOLS.length, 2 + 8 + 2 + 2);
});

test("a feat's spell is cast with the feat's use and DC: the half feat's ability, chosen or the highest it offers", () => {
  const fey = card([{ id: "contaminazione-fatata", ability: "cha" }]);
  const misty = cast("talento-contaminazione-fatata-passo-velato", fey);
  assert.deepEqual([misty.spellId, misty.ability, misty.dc, misty.uses.current, misty.uses.maximum],
    ["misty-step", "cha", 14, 1, 1]);
  assert.equal(misty.label, "Incantesimo di talento: Contaminazione Fatata: Passo velato · CD 14 (Carisma) · usi 1/1");
  const cost = planSpeciesSpellCost({ cast: misty, sourceId: "pc", card: fey });
  assert.deepEqual([cost.operation.pool.id, cost.operation.adjustment, cost.spent],
    ["talento-contaminazione-fatata-passo-velato-usi", { delta: -1 }, "uso di Contaminazione Fatata: Passo velato (0/1)"]);
  assert.match(planSpeciesSpellCost({ cast: cast("talento-contaminazione-fatata-passo-velato", fey,
    { "talento-contaminazione-fatata-passo-velato-usi": { current: 0 } }), card: fey }).message, /^Nessun uso rimasto/u);
  // Without the choice, the highest of Intelligence, Wisdom and Charisma; a fixed ability stays its own.
  assert.equal(featSpellAbility(misty.feature, card([{ id: "contaminazione-fatata" }])), "cha");
  assert.equal(featSpellAbility(misty.feature, card([{ id: "contaminazione-fatata" }], { abilityModifiers: { int: 4, wis: 2, cha: 1 } })), "int");
  assert.equal(cast("talento-teletrasporto-fatato-passo-velato", card([{ id: "teletrasporto-fatato", ability: "cha" }])).ability, "int");
  assert.equal(cast("talento-contaminazione-fatata-passo-velato", card([])), null, "without the feat, no cast");
});

test("a spell at will spends nothing", () => {
  const drow = card([{ id: "alta-magia-drow" }]);
  const detect = cast("talento-alta-magia-drow-individuazione-del-magico", drow);
  assert.deepEqual([detect.uses, detect.label], [null, "Incantesimo di talento: Alta Magia Drow: Individuazione del magico · CD 14 (Carisma)"]);
  assert.deepEqual(planSpeciesSpellCost({ cast: detect, sourceId: "pc", card: drow }).operation, null);
});

test("the book lists as «Talento» the spells the slots can cast too; the reaction prompts know them all", () => {
  const profile = card([{ id: "contaminazione-fatata", ability: "cha" }, { id: "telepatia" }, { id: "alta-magia-drow" }]);
  assert.deepEqual(featGrantedSpells(profile), [{ spellId: "misty-step", source: "Talento: Contaminazione Fatata" },
    { spellId: "detect-thoughts", source: "Talento: Telepatia" }]);
  const granted = spellbookGroupsForProfile(profile).flatMap((group) => group.spells).filter((spell) => spell.granted);
  // In the book's order (by name in each level).
  assert.deepEqual(granted.map((spell) => [spell.id, spell.granted, spell.prepared]),
    [["detect-thoughts", "Talento: Telepatia", true], ["misty-step", "Talento: Contaminazione Fatata", true]]);
  const castable = creatureCastableSpellIds({ id: "pc", metadata: { [META]: { initiativeCard: profile } } });
  for (const spellId of ["misty-step", "detect-thoughts", "detect-magic", "levitate", "dispel-magic"]) assert.ok(castable.has(spellId), spellId);
});

test("a granted spell also among the quick actions: the sheet points it out, once", () => {
  const quick = [{ kind: "spell", spellId: "misty-step", label: "Passo velato" }, { kind: "attack", label: "Spada" }];
  assert.deepEqual(featWarnings([{ id: "contaminazione-fatata" }, { id: "contaminazione-fatata" }, { id: "robusto" }], null, quick), [
    ["Passo velato arriva con il talento ed è anche nelle Azioni rapide: toglila da lì, o gli usi contano due volte."],
    ["Già scelto."],
    [],
  ]);
  assert.deepEqual(featWarnings([{ id: "contaminazione-fatata" }]), [[]]);
  // The lines of the feats with spells say where they are cast.
  for (const id of ["alta-magia-drow", "telepatia", "telecinesi"]) {
    assert.match(FEATS.find((entry) => entry.id === id).plugin, /si lancia(?:no)? dall[ae] (?:sua|loro) card/u, id);
  }
});
