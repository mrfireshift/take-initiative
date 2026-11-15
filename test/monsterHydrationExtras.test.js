// Lot SB3 of docs/STUDIO_GIOCO_ONLINE.md (decisions G19–G23): the import's choices travel with a monster's card (SB3a),
// and a token that gets the card from the registry when it joins the initiative gets them too (SB3b): its hit points,
// its size, Legendary, as the token of the sheet got them at Salva.
import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_MONSTER_PROFILE_PIPS,
  MONSTER_PROFILE_TOKEN_SIZES,
  monsterProfileWithImportChoices,
  sanitizeMonsterProfile,
} from "../src/monsterProfileCore.js";
import { MONSTER_TOKEN_SIZES } from "../src/tokenSizeCore.js";
import { MAX_LEGENDARY_PIPS } from "../src/monsterLegendaryCore.js";
import { hydratedMonsterHitPointsLabel, planHydratedMonsterExtras } from "../src/monsterHydrationExtrasCore.js";

const META = "com.thebigpicture.initiative/meta";

test("SB3a: il profilo del mostro tiene le scelte dell'import valide, e solo quelle", () => {
  assert.deepEqual(MONSTER_PROFILE_TOKEN_SIZES, Object.keys(MONSTER_TOKEN_SIZES), "the same size keys as the token's size");
  assert.equal(MAX_MONSTER_PROFILE_PIPS, MAX_LEGENDARY_PIPS, "the tracker's pips");
  const profile = sanitizeMonsterProfile({ source: "manual", hitPoints: { value: 11, formula: "2d8 + 2" }, tokenSize: "large",
    legendary: { actions: 3, resistances: 9 } });
  assert.deepEqual(profile, { source: "manual", hitPoints: { value: 11, formula: "2d8+2" }, tokenSize: "large",
    legendary: { actions: 3, resistances: 5 } });
  const wrong = sanitizeMonsterProfile({ source: "manual", hitPoints: { value: 0 }, tokenSize: "enorme", legendary: { actions: 0, resistances: 3 } });
  assert.deepEqual(wrong, { source: "manual" }, "an invalid choice is left out");
  assert.equal(sanitizeMonsterProfile({ source: "manual", hitPoints: { value: 10000 } }).hitPoints, undefined);
  assert.equal(sanitizeMonsterProfile({ source: "manual", hitPoints: { value: 7.5 } }).hitPoints, undefined);
});

test("SB3a: un nuovo import sostituisce tutte le scelte: quelle non spuntate spariscono", () => {
  const old = { source: "5etools", ref: "Hobgoblin|MM", multiattack: "Due colpi.", hitPoints: { value: 11 }, tokenSize: "large",
    legendary: { actions: 3, resistances: 3 } };
  assert.deepEqual(monsterProfileWithImportChoices(old, { hitPoints: { value: 15, formula: "2d8+6" } }),
    { source: "5etools", ref: "Hobgoblin|MM", multiattack: "Due colpi.", hitPoints: { value: 15, formula: "2d8+6" } });
  assert.deepEqual(monsterProfileWithImportChoices(old, {}), { source: "5etools", ref: "Hobgoblin|MM", multiattack: "Due colpi." });
  assert.equal(monsterProfileWithImportChoices(null, { tokenSize: "large" }), null, "not a monster's card: nothing to add");
});

const square = { type: "IMAGE", layer: "CHARACTER", position: { x: 150, y: 150 }, rotation: 0, scale: { x: 1, y: 1 },
  image: { width: 300, height: 300, url: "hob.png" }, grid: { dpi: 300, offset: { x: 150, y: 150 } } };
const choices = { source: "manual", hitPoints: { value: 11, formula: "2d8+2" }, tokenSize: "large", legendary: { actions: 3, resistances: 2 } };
const token = (id, name, meta = {}, patch = {}) => ({ ...structuredClone(square), id, name, ...patch,
  metadata: { [META]: { attitude: "enemy", inInitiative: true, initiativeCard: { armorClass: 18, monster: choices }, ...meta } } });

test("SB3b: un mostro idratato senza PF li riceve, con la taglia da una casella e il Leggendario", () => {
  const items = [token("h2", "(2) Hobgoblin")];
  const plan = planHydratedMonsterExtras({ items, hydratedIds: ["h2"] });
  assert.equal(plan.hitPoints.updates.length, 1);
  assert.deepEqual([plan.hitPoints.updates[0].itemId, plan.hitPoints.updates[0].hp, plan.hitPoints.updates[0].hpMax], ["h2", 11, 11]);
  assert.equal(plan.hitPoints.updates[0].expectedHP?.missing ?? plan.hitPoints.updates[0].expectedHP, plan.hitPoints.updates[0].expectedHP,
    "the expected values come with the update");
  assert.equal(plan.hitPoints.label, "Hobgoblin: PF dallo statblock (11)");
  assert.deepEqual(plan.sizes, [{ id: "h2", cells: 2 }]);
  assert.deepEqual(plan.legendary, [{ id: "h2", legendary: { actions: 3, resistances: 2 } }]);
});

test("SB3b: chi ha già i PF, un PG, una riserva condivisa e una misura data dal GM restano com'erano", () => {
  const items = [
    token("hp", "Hobgoblin", { hp: 4, hpMax: 11 }),
    token("pc", "Hobgoblin", { attitude: "pc" }),
    token("pool", "Hobgoblin", { sharedHpSourceId: "pool-source" }),
    token("big", "Hobgoblin", {}, { scale: { x: 3, y: 3 } }),
    token("boss", "Hobgoblin", { legendary: { max: 1, current: 1 } }),
    { ...structuredClone(square), id: "plain", name: "Lupo", metadata: { [META]: { attitude: "enemy", initiativeCard: { armorClass: 13 } } } },
  ];
  const plan = planHydratedMonsterExtras({ items, hydratedIds: items.map((item) => item.id) });
  assert.deepEqual(plan.hitPoints.targetIds.sort(), ["big", "boss"], "only the monsters without hit points, never a PC or a pool");
  assert.equal(plan.hitPoints.label, "Hobgoblin: PF dallo statblock (11) · 2 token");
  assert.deepEqual(plan.sizes.map((entry) => entry.id).sort(), ["boss", "hp", "pool"], "the size the GM gave (3 squares) stays");
  assert.deepEqual(plan.legendary.map((entry) => entry.id).sort(), ["big", "hp", "pool"], "never over a boss mode; never a PC");
  assert.deepEqual(planHydratedMonsterExtras({ items, hydratedIds: ["plain"] }),
    { hitPoints: { updates: [], targetIds: [], label: "PF dallo statblock" }, sizes: [], legendary: [] }, "a card without a monster brings nothing");
});

test("SB3b: una scheda importata prima di SB3, senza le scelte, non porta niente (G23)", () => {
  const old = token("h3", "Hobgoblin", { initiativeCard: { armorClass: 18, monster: { source: "manual", ref: "Hobgoblin|MM" } } });
  assert.deepEqual(planHydratedMonsterExtras({ items: [old], hydratedIds: ["h3"] }),
    { hitPoints: { updates: [], targetIds: [], label: "PF dallo statblock" }, sizes: [], legendary: [] });
});

test("SB3b: l'etichetta della Cronologia dice il mostro e il valore, o solo quanti token", () => {
  assert.equal(hydratedMonsterHitPointsLabel([{ name: "Goblin", value: 7 }, { name: "Goblin", value: 7 }]), "Goblin: PF dallo statblock (7) · 2 token");
  assert.equal(hydratedMonsterHitPointsLabel([{ name: "Goblin", value: 7 }, { name: "Orco", value: 15 }]), "PF dallo statblock · 2 token");
});
