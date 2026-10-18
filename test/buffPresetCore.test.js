// Buffs composed in the Conditions popup: actor-free effects with defenses, notes and spell effects.
import test, { mock } from "node:test";
import assert from "node:assert/strict";

mock.module("@owlbear-rodeo/sdk", { exports: { default: { onReady() {} }, buildLabel() {}, buildImage() {}, buildText() {}, buildPath() {}, buildShape() {}, Command: class {} } });
const {
  planBuffApplication, buffDurationRounds, buffPresetFromOptionValue, buffDefenseRows, buffSpellDefinition,
  isBuffOptionValue, normalizeBuffDefinition, BUFF_PRESETS,
} = await import("../src/buffPresetCore.js");
const { createBuffPresetStore, BUFF_PRESETS_STORAGE_KEY } = await import("../src/buffPresetStore.js");
const { damageDefensesForItem } = await import("../src/damageDefensesCore.js");
const { effectSummaryPartsFor } = await import("../src/effectLabelCore.js");

const META = "com.thebigpicture.initiative/meta";

test("durations convert minutes and hours to rounds", () => {
  assert.equal(buffDurationRounds(1, "minutes"), 10);
  assert.equal(buffDurationRounds(1, "hours"), 600);
  assert.equal(buffDurationRounds(3, "rounds"), 3);
  assert.equal(buffDurationRounds(0, "hours"), null);
});

test("a composed buff carries several defenses, notes as micropills and no caster", () => {
  const plan = planBuffApplication({
    definition: { name: "Benedizione di Auril", icon: "❄️", notes: "+1 CA, vant. TS Cos", duration: 10, unit: "minutes" },
    defenseRows: [{ kind: "immunity", type: "cold" }, { kind: "resistance", type: "fire" }, { kind: "resistance", type: "cold" }],
    giver: "Sacerdotessa",
    effectKey: "buff-123",
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.conditionName, "Benedizione di Auril");
  assert.equal(plan.options.sourceId, undefined, "no caster");
  assert.equal(plan.options.sourceName, "Sacerdotessa");
  assert.equal(plan.options.effectId, "buff:buff-123");
  assert.equal(plan.options.displayLabel, "Benedizione di Auril");
  assert.equal(plan.options.theme.emoji, "❄️");
  assert.deepEqual(plan.options.expiry, { mode: "rounds", remaining: 100 });
  assert.deepEqual(plan.options.mechanics.damageDefenses, { immunities: ["cold"], resistances: ["fire"], vulnerabilities: [] },
    "immunity wins over a resistance to the same type");
  assert.deepEqual(effectSummaryPartsFor(plan.options).map((part) => part.label), ["+1 CA", "vant. TS Cos", "Imm. freddo", "Res. fuoco"]);
  assert.match(plan.options.effectDetail, /Concesso da Sacerdotessa/);
  const item = { id: "pc", metadata: { [META]: { conditions: { instances: [{ id: "b", condition: plan.conditionName, active: true, ...plan.options }] } } } };
  assert.deepEqual(damageDefensesForItem(item, META).immunities, ["cold"]);
});

test("a buff needs a name; all damage types round-trip through the composer rows", () => {
  assert.equal(planBuffApplication({ definition: { name: " " } }).ok, false);
  const plan = planBuffApplication({ definition: { name: "Invulnerabile", duration: 1, unit: "minutes" }, defenseRows: [{ kind: "resistance", type: "all" }] });
  assert.equal(plan.options.mechanics.damageDefenses.resistances.length, 13);
  assert.deepEqual(effectSummaryPartsFor(plan.options), [{ id: "damage-defense-resistance-all", label: "Res. tutti i danni" }]);
  assert.deepEqual(buffDefenseRows(plan.definition.defenses), [{ kind: "resistance", type: "all" }]);
});

test("models are starting points; option values tell buffs apart from conditions", () => {
  assert.ok(BUFF_PRESETS.length >= 6);
  assert.equal(buffPresetFromOptionValue("buff:pozione-di-eroismo").name, "Pozione di Eroismo");
  assert.equal(isBuffOptionValue("buff-new"), true);
  assert.equal(isBuffOptionValue("buff-saved:x"), true);
  assert.equal(isBuffOptionValue("Prono"), false);
  assert.deepEqual(normalizeBuffDefinition({ name: "X", notes: "a, b, c, d, e" }).notes, ["a", "b", "c", "d"]);
});

test("a buff linked to a spell casts it without concentration for the buff's duration", () => {
  const speed = planBuffApplication({ definition: buffPresetFromOptionValue("buff:pozione-di-velocita") });
  assert.deepEqual(speed.spell, { id: "haste", choice: "" });
  assert.equal(speed.rounds, 10);
  assert.equal(speed.pill, false, "Haste's own pills are the whole buff");
  const growth = planBuffApplication({ definition: buffPresetFromOptionValue("buff:pozione-di-crescita") });
  assert.deepEqual(growth.spell, { id: "enlarge-reduce", choice: "enlarge" });
  const heroism = planBuffApplication({ definition: buffPresetFromOptionValue("buff:pozione-di-eroismo") });
  assert.equal(heroism.spell.id, "bless");
  assert.equal(heroism.pill, true, "the 10 temporary HP stay as a micropill on the buff's own pill");
  const custom = planBuffApplication({ definition: { name: "Dono di Auril", spellId: "Pelle di Pietra", duration: 1, unit: "hours" } });
  assert.equal(custom.spell.id, "Pelle di Pietra");
  assert.equal(planBuffApplication({ definition: { name: "Senza durata", spellId: "haste" } }).ok, false, "a spell buff needs a duration");
  const cast = buffSpellDefinition({ id: "haste", concentration: true, expiry: { mode: "turn-end" } });
  assert.equal(cast.concentration, false);
  assert.equal(cast.expiry, null);
});

test("saved buffs persist in browser storage, update in place and can be removed", () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const store = createBuffPresetStore({ storage });
  const saved = store.save({ name: "Dono di Auril", icon: "❄️", defenses: { immunities: ["cold"] }, duration: 1, unit: "hours" });
  assert.ok(saved.id);
  assert.equal(store.list().length, 1);
  store.save({ ...saved.definition, notes: ["+2 CA"] }, saved.id);
  assert.equal(store.list().length, 1, "same id: updated, not duplicated");
  assert.deepEqual(store.get(saved.id).definition.notes, ["+2 CA"]);
  assert.ok(values.get(BUFF_PRESETS_STORAGE_KEY).includes("Dono di Auril"));
  assert.equal(store.save({ name: "" }), null);
  assert.equal(store.remove(saved.id), true);
  assert.deepEqual(store.list(), []);
});
