// Il conto delle difese nelle anteprime: dice cosa ha fatto ogni difesa al danno digitato, con la stessa aritmetica del totale e
// della registrazione.
import assert from "node:assert/strict";
import test from "node:test";
import { bossDefendedDamage, bossDefenseCounts } from "../src/bossActionsViewCore.js";
import { componentDamageAfterDefense, damageDefenseCount } from "../src/damageDefensesCore.js";
import { buildPcAttackMutation, pcAttackAreaPreview, pcAttackAreaRowDamage, pcAttackPreview } from "../src/pcAttackCore.js";
import { sanitizeQuickAction } from "../src/quickActionsCore.js";

const META_KEY = "com.thebigpicture.initiative/meta";
const creature = (id, card = {}, attitude = "enemy") => ({ id, name: id, type: "IMAGE", layer: "CHARACTER", position: { x: 0, y: 0 },
  metadata: { [META_KEY]: { hp: 100, hpMax: 100, attitude, inInitiative: true, initiativeCard: card } } });
const defending = (id, damageDefenses, card = {}) => creature(id, { damageDefenses, ...card });
const sword = sanitizeQuickAction({ id: "sword", label: "Spada", kind: "attack", range: "melee", components: [{ type: "slashing", formula: "1d8" }] });
const hero = creature("hero", {}, "pc");

test("il conto e il totale vengono dallo stesso calcolo, per ogni esito e difesa", () => {
  const defenses = { resistances: ["slashing"], immunities: ["fire"], vulnerabilities: ["cold"] };
  const components = [{ id: "a", type: "slashing" }, { id: "b", type: "slashing" }, { id: "c", type: "fire" }, { id: "d", type: "cold" }, { id: "e", type: "necrotic" }];
  const amounts = { a: 7, b: 3, c: 9, d: 5, e: 11 };
  for (const outcome of ["hit", "failed", "passed"]) {
    for (const ignored of [[], ["slashing"], ["slashing", "fire", "cold"]]) {
      for (const evasion of [false, true]) {
        const total = bossDefendedDamage(components, amounts, outcome, defenses, ignored, false, evasion);
        const counts = bossDefenseCounts(components, amounts, outcome, defenses, ignored, false, evasion);
        const label = `${outcome} ${ignored} ${evasion}`;
        if (evasion && outcome === "passed") {
          assert.equal(total, 0, label);
          assert.deepEqual(counts, [], label);
          continue;
        }
        const factor = (outcome === "passed") !== evasion ? "half" : "full";
        const undefended = componentDamageAfterDefense(amounts.e, factor, null);
        assert.equal(counts.reduce((sum, row) => sum + row.after, 0) + undefended, total, label);
        assert.deepEqual(counts.map((row) => [row.type, row.before, row.ignored]),
          [["slashing", 10, ignored.includes("slashing")], ["fire", 9, ignored.includes("fire")], ["cold", 5, ignored.includes("cold")]], label);
      }
    }
  }
});

test("il conto: una riga per tipo difeso, niente se non passa danno o non è digitato", () => {
  const resist = { resistances: ["slashing"] };
  const two = [{ id: "a", type: "slashing" }, { id: "b", type: "slashing" }];
  assert.deepEqual(bossDefenseCounts(two, { a: 8, b: 4 }, "hit", resist), [{ type: "slashing", defense: "resistance", ignored: false, before: 12, after: 6 }]);
  assert.deepEqual(bossDefenseCounts(two, { a: 8, b: 4 }, "miss", resist), []);
  assert.deepEqual(bossDefenseCounts(two, {}, "hit", resist), [], "nothing typed");
  assert.deepEqual(bossDefenseCounts(two, { a: "", b: "0" }, "hit", resist), [], "empty and zero");
  assert.deepEqual(bossDefenseCounts([{ id: "c", type: "cold" }], { c: 10 }, "hit", resist), [], "a type without a defense");
  assert.deepEqual(bossDefenseCounts(two, { a: 8 }, "passed", resist).map((row) => [row.before, row.after]), [[8, 2]], "the save, then the defense");
  // The Frostmaiden's mark: an immunity to cold counts as a resistance in this resolution, as in the total.
  assert.deepEqual(bossDefenseCounts([{ id: "c", type: "cold" }], { c: 10 }, "hit", { immunities: ["cold"] }, [], true),
    [{ type: "cold", defense: "resistance", ignored: false, before: 10, after: 5 }]);
});

test("le parole del conto: la difesa, il danno digitato, cosa ne resta", () => {
  assert.equal(damageDefenseCount({ type: "slashing", defense: "resistance", before: 10, after: 5 }), "Res. taglienti: 10 → 5");
  assert.equal(damageDefenseCount({ type: "fire", defense: "immunity", before: 7, after: 0 }), "Imm. fuoco: 7 → 0");
  assert.equal(damageDefenseCount({ type: "bludgeoning", defense: "vulnerability", before: 10, after: 20 }), "Vuln. contundenti: 10 → 20");
  assert.equal(damageDefenseCount({ type: "slashing", defense: "resistance", nonmagical: "non magici né d'argento", before: 10, after: 5 }),
    "Res. taglienti (non magici né d'argento): 10 → 5");
  assert.equal(damageDefenseCount({ type: "slashing", defense: "resistance", ignored: true, before: 10, after: 10 }), "Res. taglienti", "ignored: the tag alone");
  assert.equal(damageDefenseCount({ type: "slashing", defense: "resistance" }), "Res. taglienti", "nothing typed: the tag alone");
});

test("console attacchi: il conto del colpo, con la registrazione che dice lo stesso", () => {
  const devil = defending("devil", { resistances: ["slashing", "radiant"], immunities: ["fire"] }, { monster: { source: "manual", nonmagicalDefenses: { types: ["slashing"], except: ["silvered"] } } });
  const preview = (extra) => pcAttackPreview({ action: sword, sourceItem: hero, targetItem: devil, amounts: { c1: 10 }, ...extra });
  const hit = preview({ outcome: "hit" });
  assert.equal(hit.total, 5);
  assert.deepEqual(hit.defenseCounts, [{ type: "slashing", defense: "resistance", ignored: false, before: 10, after: 5, nonmagical: "non magici né d'argento" }]);
  assert.equal(damageDefenseCount({ ...hit.defenses[0], ...hit.defenseCounts[0] }), "Res. taglienti (non magici né d'argento): 10 → 5");
  const committed = buildPcAttackMutation({ action: sword, sourceItem: hero, targetItem: devil, outcome: "hit", componentAmounts: { c1: 10 }, attackInstanceId: "a1" });
  assert.equal(committed.change.requested, hit.total);
  const ignored = preview({ outcome: "hit", ignoredDefenses: ["slashing"] });
  assert.equal(ignored.total, 10);
  assert.deepEqual(ignored.defenseCounts.map((row) => [row.ignored, row.before, row.after]), [[true, 10, 10]]);
  assert.deepEqual(preview({ outcome: "miss" }).defenseCounts, [], "a miss: nothing to count");
  assert.deepEqual(preview({ outcome: "" }).defenseCounts, [], "no outcome: the total is not there either");
  const mixed = preview({ outcome: "critical", extras: [{ label: "Punizione", type: "radiant", amount: 9 }, { label: "Fuoco", type: "fire", amount: 8 }] });
  assert.equal(mixed.total, 9);
  assert.deepEqual(mixed.defenseCounts.map((row) => [row.type, row.before, row.after]), [["slashing", 10, 5], ["radiant", 9, 4], ["fire", 8, 0]]);
  assert.deepEqual(pcAttackPreview({ action: sword, sourceItem: hero, targetItem: creature("plain"), outcome: "hit", amounts: { c1: 10 } }).defenseCounts, []);
});

test("console attacchi: il danno al colpo di un mostro e la seconda creatura dicono le loro difese", () => {
  const spiderBite = sanitizeQuickAction({ id: "bite", label: "Morso", kind: "attack", range: "melee", components: [{ type: "piercing", formula: "1d8" }],
    attackBonus: 5, reachFeet: 5, onHit: { save: { ability: "con", dc: 11, half: true, damage: [{ type: "poison", formula: "2d8" }] } } });
  const poisoned = (saveOutcome, targetItem) => pcAttackPreview({ action: spiderBite, sourceItem: creature("spider", { monster: { source: "manual" }, quickActions: [spiderBite] }),
    targetItem, outcome: "hit", amounts: { c1: 7 }, hitEffect: { saveOutcome, amounts: { h1: 9 } } });
  const failed = poisoned("failed", defending("orc", { resistances: ["poison"] }));
  assert.equal(failed.total, 11);
  assert.deepEqual(failed.hitEffectCounts.map((row) => [row.type, row.defense, row.before, row.after]), [["poison", "resistance", 9, 4]]);
  assert.deepEqual(failed.defenses, [], "not a button: the console cannot ignore it");
  assert.deepEqual(poisoned("passed", defending("orc", { immunities: ["poison"] })).hitEffectCounts.map((row) => [row.before, row.after]), [[9, 0]]);
  assert.equal(poisoned("failed", creature("orc")).hitEffectCounts, undefined);

  const mage = creature("mage", { characterBuild: [{ classId: "mago", level: 5 }], quickActions: [{ id: "c", label: "Trucchetto", kind: "attack", source: { kind: "cantrip" } }] }, "pc");
  const flame = (secondaryItem) => pcAttackPreview({ action: sword, sourceItem: mage, targetItem: creature("ghoul"), secondaryItem, outcome: "hit", amounts: { c1: 8 },
    weaponCantrip: { spellId: "tasha-lama-verdefiamma", amount: 5, secondary: { targetId: secondaryItem.id, amount: 6 } } });
  const resisted = flame(defending("imp", { resistances: ["fire"] }));
  assert.equal(resisted.secondary.total, 3);
  assert.deepEqual(resisted.secondary.defenseCounts.map((row) => [row.type, row.before, row.after]), [["fire", 6, 3]]);
  assert.equal(flame(creature("imp")).secondary.defenseCounts, undefined);
});

test("console attacchi: un incantesimo a più tipi non ha difese finché non si sceglie il tipo", () => {
  const orb = sanitizeQuickAction({ id: "orb", label: "Incantesimo d'attacco", kind: "attack", source: { kind: "spell", spellIds: ["phb2014-globo-cromatico"] } });
  const mage = creature("mage", { characterBuild: [{ classId: "mago", level: 5 }] }, "pc");
  const preview = (spellCast) => pcAttackPreview({ action: orb, spellId: "phb2014-globo-cromatico", sourceItem: mage, targetItem: defending("orc", { resistances: ["acid"] }), outcome: "hit", amounts: { c1: 12 }, spellCast });
  const unpicked = preview({ castId: "c1" });
  assert.deepEqual([unpicked.defenses, unpicked.defenseCounts], [[], []], "acid is only the type it holds meanwhile");
  const acid = preview({ castId: "c1", damageType: "acid" });
  assert.deepEqual(acid.defenses.map((row) => row.type), ["acid"]);
  assert.deepEqual(acid.defenseCounts.map((row) => [row.before, row.after]), [[12, 6]]);
  assert.deepEqual(preview({ castId: "c1", damageType: "cold" }).defenses, [], "another type: no defense");
});

test("console attacchi, area: ogni creatura dice cosa subisce e perché", () => {
  const breath = sanitizeQuickAction({ id: "breath", label: "Soffio", kind: "attack", range: "ranged", components: [{ type: "fire", formula: "18d6" }],
    save: "dex", saveDC: 21, saveHalf: true, area: { shape: "cone", sizeFeet: 60 } });
  const dragon = creature("dragon", { monster: { source: "manual" }, quickActions: [breath] });
  const resist = defending("resist", { resistances: ["fire"] });
  const immune = defending("immune", { immunities: ["fire"] });
  const plain = creature("plain");
  const preview = (members, amounts = { c1: 60 }) => pcAttackAreaPreview({ action: breath, sourceItem: dragon, members, amounts });
  const view = preview([{ item: resist, outcome: "failed" }, { item: immune, outcome: "failed" }, { item: plain, outcome: "failed" }]);
  assert.deepEqual(view.rows.map(pcAttackAreaRowDamage), [{ amount: "−30", reason: "Res. fuoco: 60 → 30" }, { amount: "Nessun danno", reason: "Imm. fuoco: 60 → 0" }, { amount: "−60", reason: "" }]);
  assert.equal(view.total, 90, "the sum of the rows");
  const rows = preview([{ item: resist, outcome: "passed" }, { item: plain, outcome: "immune" }, { item: immune, outcome: "" }]).rows;
  assert.deepEqual(rows.map(pcAttackAreaRowDamage), [{ amount: "−15", reason: "Res. fuoco: 60 → 15" }, { amount: "Nessun danno", reason: "" }, null]);
  const unrolled = preview([{ item: resist, outcome: "failed" }, { item: plain, outcome: "immune" }], {}).rows;
  assert.deepEqual(unrolled.map(pcAttackAreaRowDamage), [null, { amount: "Nessun danno", reason: "" }], "without the roll only who takes nothing is known");
  const fright = sanitizeQuickAction({ id: "fright", label: "Presenza", kind: "attack", components: [], save: "wis", saveDC: 19, area: { shape: "sphere", sizeFeet: 120 }, onFail: { condition: "Spaventato" } });
  const conditionOnly = pcAttackAreaPreview({ action: fright, sourceItem: dragon, members: [{ item: plain, outcome: "failed" }], amounts: {} }).rows;
  assert.equal(pcAttackAreaRowDamage(conditionOnly[0]), null, "an area without damage says nothing of it");
  assert.equal(pcAttackAreaRowDamage(null), null);
});
