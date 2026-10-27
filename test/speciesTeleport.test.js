// The species teleports: Fey Step (eladrin, with its season from 3rd level), Blessing of the Raven Queen (shadar-kai,
// resistance to all damage from 3rd level), Starlight Step (astral elf). The plan of the command: who moves, the pills,
// Summer's fire damage after each creature's defenses.
import assert from "node:assert/strict";
import test from "node:test";
import { SPECIES_FEATURES } from "../src/speciesTraitCore.js";
import { planSpeciesTeleport, speciesTeleportInfo, speciesTeleportRuleId, speciesTeleportSeason } from "../src/speciesTeleportCore.js";

const M = "meta";
const feature = (id) => SPECIES_FEATURES.find((entry) => entry.id === id);
const FEY = "specie-eladrin-passo-fatato";
const FEY_MOTM = "specie-eladrin-multiverso-passo-fatato";
const RAVEN = "specie-shadar-kai-benedizione-della-regina-corvo";
const card = (species, level = 5, mods = {}) => ({ characterBuild: [{ classId: "mago", level }], abilityModifiers: { int: 4, wis: 1, cha: 3, ...mods }, species });
const creature = (id, name, hp = 20) => ({ id, name, metadata: { [M]: { hp, hpMax: hp } } });
const source = creature("ela", "Ela");
const plan = (id, cardValue, targets = [], defenses = {}) => planSpeciesTeleport({ feature: feature(id), card: cardValue, sourceItem: source, targets,
  position: { x: 300, y: 150 }, metaKey: M, defensesFor: (item) => defenses[item.id] || {} });

test("the five teleports: 9 m on the map, with the boss's teleport rule", () => {
  const ids = SPECIES_FEATURES.filter((entry) => entry.speciesTeleport).map((entry) => entry.id);
  assert.deepEqual(ids, [FEY, RAVEN, FEY_MOTM, "specie-shadar-kai-multiverso-benedizione-della-regina-corvo", "specie-elfo-astrale-passo-di-luce-stellare"]);
  assert.equal(speciesTeleportRuleId(feature(FEY)), "boss-action-area:teleport:30ft");
  const astral = plan("specie-elfo-astrale-passo-di-luce-stellare", card({ id: "elfo-astrale" }));
  assert.deepEqual([astral.ok, astral.subjectId, astral.conditions, astral.damage], [true, "ela", [], []]);
  assert.match(planSpeciesTeleport({ feature: feature(FEY), card: card({ id: "eladrin", ancestryId: "estate" }), sourceItem: source }).blocker, /destinazione/);
});

test("the eladrin's season from 3rd level: Winter, Autumn, Spring and Summer", () => {
  assert.equal(speciesTeleportSeason(feature(FEY), card({ id: "eladrin", ancestryId: "inverno" }, 2)), "", "not before 3rd level");
  const winter = plan(FEY, card({ id: "eladrin", ancestryId: "inverno" }), [creature("orc", "Orco")]);
  assert.deepEqual(winter.conditions.map((entry) => [entry.targetId, entry.condition, entry.expiry.mode]), [["orc", "Spaventato", "turn-end"]]);
  assert.match(plan(FEY, card({ id: "eladrin", ancestryId: "inverno" }), [creature("a", "A"), creature("b", "B")]).blocker, /al massimo 1 creatura/);
  const autumn = plan(FEY, card({ id: "eladrin", ancestryId: "autunno" }), [creature("a", "A"), creature("b", "B")]);
  assert.deepEqual(autumn.conditions.map((entry) => [entry.condition, entry.rounds, entry.mechanics]), [["Affascinato", 10, { endsOnDamage: true }], ["Affascinato", 10, { endsOnDamage: true }]]);
  const spring = plan(FEY, card({ id: "eladrin", ancestryId: "primavera" }), [creature("ally", "Alleato")]);
  assert.equal(spring.subjectId, "ally", "the willing creature moves instead");
  assert.match(plan(FEY, card({ id: "eladrin", ancestryId: "primavera" })).blocker, /creatura consenziente/);
  const summer = plan(FEY, card({ id: "eladrin", ancestryId: "estate" }), [creature("orc", "Orco"), creature("imp", "Imp")], { imp: { resistances: ["fire"] } });
  assert.deepEqual(summer.damage.map((row) => [row.item.id, row.amount, row.change.afterHP]), [["orc", 3, 17], ["imp", 1, 19]], "Cha +3; the imp resists fire");
  const motm = plan(FEY_MOTM, card({ id: "eladrin-multiverso", ancestryId: "estate" }), [creature("orc", "Orco")]);
  assert.equal(motm.damage[0].amount, 3, "Mostri del Multiverso: the proficiency bonus");
});

test("the season's save DC: Charisma (Tomo dei Nemici) or the species' chosen ability (Mostri del Multiverso)", () => {
  assert.match(speciesTeleportInfo(feature(FEY), card({ id: "eladrin", ancestryId: "inverno" })).text, /TS Saggezza CD 14 \(Carisma\)/);
  assert.match(speciesTeleportInfo(feature(FEY_MOTM), card({ id: "eladrin-multiverso", ancestryId: "inverno" })).text, /CD 15 \(Intelligenza\)/);
  assert.doesNotMatch(speciesTeleportInfo(feature(FEY), card({ id: "eladrin", ancestryId: "primavera" })).text, /CD/);
});

test("the shadar-kai: resistance to all damage until the start of its next turn, from 3rd level", () => {
  assert.deepEqual(plan(RAVEN, card({ id: "shadar-kai" }, 2)).conditions, []);
  const [pill] = plan(RAVEN, card({ id: "shadar-kai" }, 3)).conditions;
  assert.deepEqual([pill.targetId, pill.condition, pill.expiry.mode], ["ela", "Resistenza ai danni", "turn-start"]);
  assert.ok(pill.mechanics.damageDefenses.resistances.includes("fire") && pill.mechanics.damageDefenses.resistances.includes("slashing"));
});
