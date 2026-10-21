import assert from "node:assert/strict";
import test from "node:test";
import { PC_ATTACK_RIDERS, getPcAttackRider, pcAttackCriticalDice, pcAttackRiderDice, pcAttackRidersForCard } from "../src/pcAttackRiderCatalog.js";
import { getClassFeatureDefinition } from "../src/classFeatureCatalog.js";
import { QUICK_ACTION_ATTACK_DAMAGE_TYPES } from "../src/quickActionsCore.js";

const build = (classId, level, subclassId = "") => ({ characterBuild: [{ classId, level, ...(subclassId ? { subclassId } : {}) }] });
const dice = (id, card) => pcAttackRiderDice(getPcAttackRider(id), card);

test("every rider is a class feature of the catalog with a valid damage type and limit", () => {
  for (const rider of PC_ATTACK_RIDERS) {
    assert.ok(getClassFeatureDefinition(rider.id), rider.id);
    const types = rider.type === "weapon" ? [] : rider.type?.choice || [rider.type];
    for (const type of types) assert.ok(QUICK_ACTION_ATTACK_DAMAGE_TYPES.includes(type), `${rider.id}: ${type}`);
    if (rider.limit) {
      assert.ok(["turn", "own-turn"].includes(rider.limit.per), rider.id);
      assert.ok(["attacker", "target"].includes(rider.limit.scope), rider.id);
    }
  }
  assert.equal(PC_ATTACK_RIDERS.filter((rider) => rider.label === "Colpo Divino").length, 8);
});

test("dice follow the class level", () => {
  assert.equal(dice("ladro-attacco-furtivo", build("ladro", 1)), "1d6");
  assert.equal(dice("ladro-attacco-furtivo", build("ladro", 3)), "2d6");
  assert.equal(dice("ladro-attacco-furtivo", build("ladro", 19)), "10d6");
  assert.equal(dice("chierico-dominio-della-vita-colpo-divino", build("chierico", 8)), "1d8");
  assert.equal(dice("chierico-dominio-della-vita-colpo-divino", build("chierico", 14)), "2d8");
  assert.equal(dice("ranger-viandante-fatato-colpi-terribili", build("ranger", 3)), "1d4");
  assert.equal(dice("ranger-viandante-fatato-colpi-terribili", build("ranger", 11)), "1d6");
  assert.equal(dice("barbaro-cammino-dello-zelota-furia-divina", build("barbaro", 3)), "1d6+1");
  assert.equal(dice("barbaro-cammino-dello-zelota-furia-divina", build("barbaro", 10)), "1d6+5");
  assert.equal(dice("barbaro-ira", build("barbaro", 1)), "+2");
  assert.equal(dice("barbaro-ira", build("barbaro", 9)), "+3");
  assert.equal(dice("barbaro-ira", build("barbaro", 16)), "+4");
  assert.equal(dice("warlock-la-lama-del-sortilegio-maledizione-della-lama-del-sortilegio", build("warlock", 5)), "+3");
  assert.equal(dice("warlock-suppliche-occulte-succhiavita", { ...build("warlock", 12), abilityModifiers: { cha: 4 } }), "+4");
  assert.equal(dice("warlock-suppliche-occulte-succhiavita", { ...build("warlock", 12), abilityModifiers: { cha: -1 } }), "+1");
  assert.equal(dice("warlock-suppliche-occulte-succhiavita", build("warlock", 12)), null, "no modifier in the profile: no suggestion");
});

test("a critical hit doubles the dice, never the flat bonus", () => {
  assert.equal(pcAttackCriticalDice("3d6"), "6d6");
  assert.equal(pcAttackCriticalDice("1d6+5"), "2d6+5");
  assert.equal(pcAttackCriticalDice("+2"), "+2");
});

test("an actor gets only the riders of its enabled class features", () => {
  assert.deepEqual(pcAttackRidersForCard(build("ladro", 5)).map((rider) => rider.id), ["ladro-attacco-furtivo"]);
  assert.deepEqual(pcAttackRidersForCard(build("chierico", 7, "chierico-dominio-della-vita")).map((rider) => rider.id), []);
  assert.deepEqual(pcAttackRidersForCard(build("chierico", 8, "chierico-dominio-della-vita")).map((rider) => rider.id), ["chierico-dominio-della-vita-colpo-divino"]);
  assert.deepEqual(pcAttackRidersForCard({ ...build("ladro", 5), classFeaturesConfigured: true, enabledClassFeatureIds: [] }), []);
  assert.deepEqual(pcAttackRidersForCard({}), []);
});
