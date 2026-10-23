// The spells a species casts without a slot: the 99 traits linked to the spell catalog, the casting ability (the
// trait's, or the one chosen with the species), the DC, the trait's use as the cast's cost, the panel's request.
import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { SPECIES_FEATURES, speciesHasSpellAbilityChoice } from "../src/speciesTraitCore.js";
import { getSpellDefinition } from "../src/spells-srd.js";
import { sanitizeQuickAction } from "../src/quickActionsCore.js";
import {
  planSpeciesSpellCost, speciesSpellAbility, speciesSpellActionId, speciesSpellCast, speciesSpellFeatureId, speciesSpellOpenRequest,
} from "../src/speciesInnateSpellCore.js";

const sdk = { onReady() {}, broadcast: { onMessage: () => () => {}, sendMessage: async () => {} }, scene: { items: { getItems: async () => [] } } };
mock.module("@owlbear-rodeo/sdk", { exports: { default: sdk, buildLabel() {}, buildImage() {}, buildPath() {}, buildShape() {}, buildText() {}, Command: class {} } });
const { sanitizeInitiativeCard } = await import("../src/initiativeCards.js");

const feature = (id) => SPECIES_FEATURES.find((entry) => entry.id === id);
const card = (species, mods = {}, level = 5, extra = {}) => ({ characterBuild: [{ classId: "mago", level }],
  abilityModifiers: { str: 0, dex: 1, con: 2, int: 4, wis: 1, cha: 2, ...mods }, species, ...extra });
const REBUKE = "specie-tiefling-eredita-infernale-intimorire-infernale";
const MISTY = "specie-githyanki-multiverso-psionica-githyanki-passo-velato";

test("the catalog: every trait that casts a spell names one of the spell catalog", () => {
  const traits = SPECIES_FEATURES.filter((entry) => entry.innateSpell);
  assert.equal(traits.length, 99);
  assert.deepEqual(traits.filter((entry) => !getSpellDefinition(entry.innateSpell.spellId)).map((entry) => entry.id), []);
  const unlinked = SPECIES_FEATURES.filter((entry) => !entry.innateSpell && entry.activation.primary !== "passiva"
    && /^(Dal \d° livello )?[Ll]anci /u.test(entry.description));
  assert.deepEqual(unlinked.map((entry) => entry.id), []);
  assert.deepEqual(feature(REBUKE).innateSpell, { spellId: "hellish-rebuke", slotLevel: 2, ability: "cha", self: false });
  assert.equal(feature("specie-genasi-fondersi-con-la-pietra").innateSpell.spellId, "pass-without-trace");
  assert.equal(feature("specie-duergar-magia-duergar-invisibilita").innateSpell.self, true);
  assert.equal(feature(MISTY).innateSpell.ability, "choice");
  assert.equal(feature("specie-coboldo-multiverso-grido-draconico")?.innateSpell, undefined, "a war cry, not a spell");
  assert.ok(traits.every((entry) => sanitizeQuickAction({ id: speciesSpellActionId(entry.id), label: "x", kind: "feature", featureId: entry.id })
    ?.id === speciesSpellActionId(entry.id)), "every id fits a quick action id");
});

test("the casting ability: the trait's, or the one chosen with the species, else the highest of Int, Wis and Cha", () => {
  assert.equal(speciesSpellAbility(feature(REBUKE), card({ id: "tiefling" })), "cha");
  const gith = { id: "githyanki-multiverso", ancestryId: "" };
  assert.equal(speciesSpellAbility(feature(MISTY), card(gith)), "int", "Int +4 is the highest");
  assert.equal(speciesSpellAbility(feature(MISTY), card(gith, {}, 5, { speciesSpellAbility: "cha" })), "cha");
  assert.equal(speciesSpellAbility(feature(MISTY), card(gith, { int: 1, wis: 1, cha: 1 })), "int", "a tie: the first");
  assert.equal(speciesHasSpellAbilityChoice("githyanki-multiverso"), true);
  assert.equal(speciesHasSpellAbilityChoice("tiefling"), false);
  assert.equal(sanitizeInitiativeCard({ speciesSpellAbility: "wis" }).speciesSpellAbility, "wis");
  assert.equal(sanitizeInitiativeCard({ speciesSpellAbility: "str" }).speciesSpellAbility, null);
  assert.equal(Object.hasOwn(sanitizeInitiativeCard({}), "speciesSpellAbility"), false, "profiles without it keep their shape");
});

test("the cast: the trait's DC and uses, only for the character's species, level and that spell", () => {
  const tiefling = card({ id: "tiefling" });
  const cast = speciesSpellCast({ actionId: speciesSpellActionId(REBUKE), card: tiefling, spellId: "hellish-rebuke" });
  assert.equal(cast.dc, 13, "8 + 3 + Cha 2, not the wizard's Int");
  assert.deepEqual([cast.uses.current, cast.uses.maximum], [1, 1]);
  assert.equal(cast.label, "Incantesimo di specie: Eredità infernale: Intimorire infernale · CD 13 (Carisma) · usi 1/1");
  assert.equal(speciesSpellCast({ actionId: speciesSpellActionId(REBUKE), card: tiefling, spellId: "shield" }), null, "another spell");
  assert.equal(speciesSpellCast({ actionId: speciesSpellActionId(REBUKE), card: card({ id: "elfo", ancestryId: "alto" }) }), null, "not this species");
  assert.equal(speciesSpellCast({ actionId: speciesSpellActionId(REBUKE), card: card({ id: "tiefling" }, {}, 2) }), null, "from 3rd level");
  assert.equal(speciesSpellCast({ actionId: "quick-1", card: tiefling }), null);
  assert.equal(speciesSpellFeatureId(speciesSpellActionId(REBUKE)), REBUKE);
});

test("the cost: one use of the trait in the spell's command; none left asks the GM", () => {
  const tiefling = card({ id: "tiefling" });
  const cast = speciesSpellCast({ actionId: speciesSpellActionId(REBUKE), card: tiefling });
  const cost = planSpeciesSpellCost({ cast, sourceId: "zar", card: tiefling });
  assert.equal(cost.operation.type, "class-feature:adjust-resource");
  assert.equal(cost.operation.pool.id, "specie-tiefling-intimorire-infernale-usi");
  assert.deepEqual([cost.operation.sourceId, cost.operation.adjustment.delta], ["zar", -1]);
  assert.equal(cost.spent, "uso di Eredità infernale: Intimorire infernale (0/1)");
  const spent = speciesSpellCast({ actionId: speciesSpellActionId(REBUKE), card: tiefling,
    resources: { "specie-tiefling-intimorire-infernale-usi": { current: 0 } } });
  const none = planSpeciesSpellCost({ cast: spent, sourceId: "zar", card: tiefling });
  assert.deepEqual([none.operation, none.exhausted], [null, true]);
  assert.match(none.message, /Nessun uso rimasto/);
  assert.equal(planSpeciesSpellCost({ cast, sourceId: "zar", card: tiefling, phase: "turn-start" }).operation, null, "only the cast spends");
});

test("the panel's request: the spell, no slot, its level, the character as target of a spell on itself", () => {
  assert.deepEqual(speciesSpellOpenRequest(feature(REBUKE), "zar"), { intent: "spell-cast", sourceId: "zar", casterId: "zar",
    spellId: "hellish-rebuke", slotSource: "none", slotLevel: 2, quickActionId: speciesSpellActionId(REBUKE), origin: "quick-action" });
  assert.deepEqual(speciesSpellOpenRequest(feature("specie-duergar-magia-duergar-invisibilita"), "dur").targetIds, ["dur"]);
  assert.equal(speciesSpellOpenRequest(feature(REBUKE), ""), null);
});
