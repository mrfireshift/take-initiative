// Attacchi dei mostri, fase 4, lotto 1: lo statblock sostituisce quello di prima; i token omonimi hanno lo stesso statblock.
import assert from "node:assert/strict";
import test from "node:test";
import { MONSTER_STATBLOCK_FIELDS, monsterStatblockOf, monsterStatblockSectionsToClear, monsterStatblockTargets, sameMonsterStatblock }
  from "../src/monsterStatblockShareCore.js";

const META = "com.thebigpicture.initiative/meta";
const creature = (id, name, meta = {}) => ({ id, name, type: "IMAGE", layer: "CHARACTER", metadata: { [META]: { inInitiative: true, ...meta } } });
const goblinCard = { armorClass: 15, quickActions: [{ id: "a", label: "Scimitar", kind: "attack", components: [{ id: "c1", type: "slashing" }] }],
  monster: { source: "5etools", ref: "Goblin|MM" }, notes: "Tratti: Nimble Escape.", exhaustion: 2, actorProfileId: "actor-1", savingThrows: { str: null } };

test("le sezioni da svuotare: quelle che lo statblock sostituisce e quelle che non ha; mai quelle tolte dal GM", () => {
  const sections = { stats: {}, attacks: [], notes: "x" };
  assert.deepEqual(monsterStatblockSectionsToClear({ sections, chosen: ["stats", "attacks"] }),
    ["classes", "stats", "abilities", "saves", "defenses", "spells", "innate", "attacks", "multiattack"], "a block without spells leaves none of the previous ones (lotto 4)");
  assert.deepEqual(monsterStatblockSectionsToClear({ sections, chosen: ["stats", "attacks", "notes"] }).includes("notes"), true);
  assert.deepEqual(monsterStatblockSectionsToClear({ sections: { classes: [], stats: {}, abilities: {}, saves: {}, defenses: {}, spells: {}, innate: [], attacks: [],
    multiattack: "m", notes: "n" }, chosen: [] }), [],
    "a block with every section, all unticked: nothing emptied");
});

test("lo statblock della scheda: solo i suoi campi, mai lo stato del token", () => {
  const statblock = monsterStatblockOf(goblinCard);
  assert.deepEqual(Object.keys(statblock).sort(), ["armorClass", "monster", "notes", "quickActions", "savingThrows"]);
  assert.equal(statblock.exhaustion, undefined);
  assert.equal(statblock.actorProfileId, undefined);
  statblock.quickActions[0].label = "cambiato";
  assert.equal(goblinCard.quickActions[0].label, "Scimitar", "a copy, never the card itself");
  assert.ok(MONSTER_STATBLOCK_FIELDS.includes("spellbook"));
  assert.equal(sameMonsterStatblock(goblinCard, { ...goblinCard, exhaustion: 0, actorProfileId: "actor-2" }), true);
  assert.equal(sameMonsterStatblock(goblinCard, { ...goblinCard, armorClass: 16 }), false);
});

test("gli omonimi: le altre creature con lo stesso nome, mai un personaggio, mai senza statblock di mostro", () => {
  const items = [creature("g1", "Goblin"), creature("g2", "(2) Goblin"), creature("g3", "goblin", { attitude: "enemy" }),
    creature("pc", "Goblin", { attitude: "pc" }), creature("o", "Orco"), { id: "label", name: "Goblin", type: "TEXT", layer: "TEXT", metadata: {} }];
  assert.deepEqual(monsterStatblockTargets(items, "g1", goblinCard).map((item) => item.id), ["g2", "g3"]);
  assert.deepEqual(monsterStatblockTargets(items, "g1", { armorClass: 12 }), [], "a character's card is its own");
  assert.deepEqual(monsterStatblockTargets(items, "o", goblinCard), []);
});
