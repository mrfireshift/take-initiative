// The Wild Magic Surge engine: the d100 finds its row, and each row's action is planned for the sorcerer.
import assert from "node:assert/strict";
import test from "node:test";
import { CLASS_FEATURE_BY_ID } from "../src/classFeatureCatalog.js";
import { getSpellDefinition } from "../src/spells-srd.js";
import {
  lowestSpentSpellSlot,
  normalizeWildMagicRoll,
  planWildMagicSurgeAction,
  rollWildMagicDice,
  WILD_MAGIC_SURGE_ACTIONS,
  WILD_MAGIC_SURGE_FEATURE_ID,
  wildMagicPillDraft,
  wildMagicRangeBounds,
  wildMagicRowForRoll,
} from "../src/wildMagicSurgeCore.js";

const rows = CLASS_FEATURE_BY_ID.get(WILD_MAGIC_SURGE_FEATURE_ID).wildMagicTable;
const row = (range) => rows.find((entry) => entry.d100 === range);
const plan = (range, options = {}) => planWildMagicSurgeAction(row(range), {
  sorcererId: "sor", sorcererName: "Zefiro", spell: row(range)?.spellId ? getSpellDefinition(row(range).spellId) : null, ...options,
});

test("every d100 from 1 to 100 finds exactly one row, and every row has an action", () => {
  assert.deepEqual(wildMagicRangeBounds("01-02"), [1, 2]);
  assert.deepEqual(wildMagicRangeBounds("99-00"), [99, 100]);
  assert.equal(normalizeWildMagicRoll("00"), 100);
  assert.equal(normalizeWildMagicRoll("0"), 100);
  assert.equal(normalizeWildMagicRoll("101"), null);
  assert.equal(normalizeWildMagicRoll("4.5"), null);
  for (let roll = 1; roll <= 100; roll += 1) {
    const matches = rows.filter((entry) => {
      const [low, high] = wildMagicRangeBounds(entry.d100);
      return roll >= low && roll <= high;
    });
    assert.equal(matches.length, 1, `d100 ${roll}`);
    assert.equal(wildMagicRowForRoll(rows, roll), matches[0]);
  }
  assert.equal(wildMagicRowForRoll(rows, "100").d100, "99-00");
  assert.deepEqual(Object.keys(WILD_MAGIC_SURGE_ACTIONS).sort(), rows.map((entry) => entry.d100).sort());
  for (const entry of rows) {
    if (entry.spellId) {
      assert.equal(WILD_MAGIC_SURGE_ACTIONS[entry.d100].kind, "spell", `${entry.d100} casts its spell`);
      assert.ok(getSpellDefinition(entry.spellId), `${entry.spellId} is in the catalog`);
    }
  }
});

test("every buff row makes a valid pill on the sorcerer", () => {
  for (const [range, action] of Object.entries(WILD_MAGIC_SURGE_ACTIONS)) {
    if (action.kind !== "buff") continue;
    const result = plan(range);
    assert.equal(result.ok, true, range);
    assert.deepEqual(result.pill.targetIds, ["sor"], range);
    assert.equal(result.pill.options.effectKind, "buff");
    assert.match(result.pill.options.effectId, new RegExp(`wild-magic-${range}`, "u"));
  }
  const minute = plan("03-04").pill;
  assert.deepEqual(minute.options.expiry, { mode: "rounds", remaining: 10 }, "1 minute is 10 rounds");
  assert.deepEqual(plan("17-18").pill.options.expiry, { mode: "manual" }, "until the sneeze: removed by hand");
  const resistance = plan("71-72").pill.options.mechanics.damageDefenses;
  assert.equal(resistance.resistances.length, 13, "resistance to all damage");
  const plant = plan("41-42");
  assert.equal(plant.pill.options.mechanics.damageDefenses.vulnerabilities.length, 13);
  assert.deepEqual(plant.condition, { conditionName: "Incapacitato", targetIds: ["sor"], rounds: 1 });
  const piercing = plan("95-96", { selectionIds: ["sor", "gob", "orc"] });
  assert.deepEqual(piercing.pill.targetIds, ["sor", "gob", "orc"], "the sorcerer and the creatures selected");
  assert.deepEqual(piercing.pill.options.mechanics.damageDefenses.vulnerabilities, ["piercing"]);
});

test("conditions, spells, healing and resources are planned for the runtime", () => {
  assert.deepEqual(plan("89-90").condition, { conditionName: "Invisibile", targetIds: ["sor"], rounds: 10 });
  assert.equal(plan("69-70").ok, false, "the creatures within 9 m are selected on the map");
  assert.deepEqual(plan("69-70", { selectionIds: ["sor", "gob"] }).condition.targetIds, ["gob"]);

  const fireball = plan("07-08");
  assert.equal(fireball.kind, "spell");
  assert.deepEqual(fireball.route, {
    sourceId: "sor", casterId: "sor", spellId: "fireball", slotSource: "none", slotLevel: 3, targetIds: ["sor"], origin: "wild-magic-surge",
    withoutConcentration: true,
  });
  assert.equal(plan("09-10").route.slotLevel, 5, "magic missile at 5th level");
  const confusion = plan("13-14");
  assert.equal(confusion.noConcentration, true);
  assert.equal(confusion.route.durationTurns, 10);
  assert.equal(confusion.route.slotLevel, 4, "the spell's own level");
  assert.equal(plan("07-08", { spell: null }).ok, false);

  assert.equal(plan("39-40").ok, false, "the 2d10 total is needed");
  assert.deepEqual(plan("39-40", { healTotal: "13" }).heal, { targetId: "sor", amount: 13, dice: "2d10" });
  assert.equal(plan("99-00").kind, "sorcery-points");
  assert.equal(plan("59-60").kind, "spell-slot");
  assert.equal(plan("05-06").kind, "manual");
  assert.equal(planWildMagicSurgeAction(row("03-04"), {}).ok, false, "no sorcerer, no plan");
});

test("the small builder: a pill drafted from the row, edited by the GM, replaces the row's action", () => {
  assert.deepEqual(wildMagicPillDraft(row("05-06")), { name: "Modron evocato", icon: "🎁", duration: 1, unit: "minutes", notes: "" });
  assert.deepEqual(wildMagicPillDraft(row("65-66")), { name: "Impulso 65-66", icon: "✨", duration: 1, unit: "minutes", notes: "" });
  const custom = plan("65-66", { draft: { name: "Fulmini erranti", icon: "⚡", duration: "2", unit: "rounds", notes: "4d10, tre bersagli" } });
  assert.equal(custom.kind, "buff");
  assert.equal(custom.pill.conditionName, "Fulmini erranti");
  assert.deepEqual(custom.pill.options.expiry, { mode: "rounds", remaining: 2 });
  assert.equal(custom.pill.options.summaryParts.length, 2);
  assert.equal(plan("65-66", { draft: { name: " " } }).ok, false);
});

test("59-60 restores the lowest slot spent; the 2d10 roll stays within its dice", () => {
  const slots = [
    { poolId: "spell-slot-1", level: 1, maximum: 4, current: 4, pact: false },
    { poolId: "spell-slot-2", level: 2, maximum: 3, current: 1, pact: false },
    { poolId: "spell-slot-3", level: 3, maximum: 2, current: 0, pact: false },
    { poolId: "spell-slot-pact", level: 1, maximum: 1, current: 0, pact: true },
  ];
  assert.equal(lowestSpentSpellSlot(slots).poolId, "spell-slot-2");
  assert.equal(lowestSpentSpellSlot(slots.slice(0, 1)), null);
  assert.equal(rollWildMagicDice("2d10", () => 0), 2);
  assert.equal(rollWildMagicDice("2d10", () => 0.999), 20);
  assert.equal(rollWildMagicDice("pippo"), null);
});
