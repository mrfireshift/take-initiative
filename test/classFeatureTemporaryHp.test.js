// CAP-TEMP, lotto T2a (texts 2014: Xanathar, Tasha): the class features that give temporary hit points by their
// level, in the same command as their pill. The amounts below are read from the texts, not from the catalog.
import test from "node:test";
import assert from "node:assert/strict";
import { CLASS_FEATURE_BY_ID } from "../src/classFeatureCatalog.js";
import { classFeatureTemporaryHpAmount, classFeatureTemporaryHpApplications } from "../src/classFeatureCore.js";

const build = (classId, level) => [{ classId, level }];

test("the amount: per level, base + level, by level, a die rolled at the table", () => {
  const druid = { classId: "druido" };
  assert.equal(classFeatureTemporaryHpAmount(druid, 5), 5);
  assert.equal(classFeatureTemporaryHpAmount(druid, { perClassLevel: 4 }, { characterBuild: build("druido", 6) }), 24);
  assert.equal(classFeatureTemporaryHpAmount(druid, { base: 5, plusClassLevel: true }, { characterBuild: build("druido", 6) }), 11);
  const table = { byClassLevel: { 3: 2, 5: 3, 10: 4, 15: 5, 20: 6 } };
  assert.deepEqual([3, 4, 5, 12, 20].map((level) => classFeatureTemporaryHpAmount(druid, table, { characterBuild: build("druido", level) })),
    [2, 2, 3, 4, 6]);
  assert.equal(classFeatureTemporaryHpAmount(druid, { die: "1d12" }, { value: "7" }), 7);
  assert.equal(classFeatureTemporaryHpAmount(druid, { die: "1d12" }, { value: "13" }), null, "beyond the die");
  assert.equal(classFeatureTemporaryHpAmount(druid, { die: "1d6", plusClassLevel: true }, { value: 4, characterBuild: build("druido", 3) }), 7);
  assert.equal(classFeatureTemporaryHpAmount(druid, { perClassLevel: 4 }, { characterBuild: [] }), null, "no level on the sheet");
});

test("Symbiotic Entity: 4 temporary hit points per druid level, to the druid", () => {
  const feature = CLASS_FEATURE_BY_ID.get("druido-circolo-delle-spore-entita-simbiotica");
  assert.deepEqual(classFeatureTemporaryHpApplications(feature, { sourceId: "druid", targetIds: ["druid"],
    characterBuild: build("druido", 5) }), [{ targetId: "druid", amount: 20 }]);
});

test("Tomb of Levistus: 10 temporary hit points per warlock level, to the warlock", () => {
  const feature = CLASS_FEATURE_BY_ID.get("warlock-suppliche-occulte-tomba-di-levistus");
  assert.deepEqual(classFeatureTemporaryHpApplications(feature, { sourceId: "warlock", targetIds: ["warlock"],
    characterBuild: build("warlock", 7) }), [{ targetId: "warlock", amount: 70 }]);
  assert.match(feature.effectPlan.detail, /attivala prima del danno/u);
});

test("Spirit Totem, Bear: 5 + druid level to the creatures selected in the aura, the druid alone when none is", () => {
  const feature = CLASS_FEATURE_BY_ID.get("druido-circolo-del-pastore-totem-spirituale");
  const activation = (selectedTargetIds) => classFeatureTemporaryHpApplications(feature, { sourceId: "druid", targetIds: ["druid"],
    selectedTargetIds, choiceId: "orso", characterBuild: build("druido", 4) });
  assert.deepEqual(activation(["druid", "fighter", "rogue"]),
    [{ targetId: "druid", amount: 9 }, { targetId: "fighter", amount: 9 }, { targetId: "rogue", amount: 9 }]);
  assert.deepEqual(activation([]), [{ targetId: "druid", amount: 9 }]);
  assert.deepEqual(classFeatureTemporaryHpApplications(feature, { sourceId: "druid", choiceId: "falco",
    characterBuild: build("druido", 4) }), [], "the Hawk gives none");
});

test("Storm Aura, Tundra: 2 to 6 by barbarian level to the creatures selected, from the configured environment", () => {
  const feature = CLASS_FEATURE_BY_ID.get("barbaro-cammino-dell-araldo-della-tempesta-aura-tempestosa");
  const at = (level) => classFeatureTemporaryHpApplications(feature, { sourceId: "bar", targetIds: ["bar"], selectedTargetIds: ["bar", "ally"],
    choiceId: "tundra", characterBuild: build("barbaro", level) }).map((row) => row.amount);
  assert.deepEqual([3, 5, 10, 15, 20].map((level) => at(level)[0]), [2, 3, 4, 5, 6]);
  assert.equal(at(5).length, 2);
  assert.deepEqual(classFeatureTemporaryHpApplications(feature, { sourceId: "bar", choiceId: "deserto",
    characterBuild: build("barbaro", 5) }), [], "the Desert gives none");
});

test("Wild Surge, Shadowy Tendrils: the 1d12 rolled at the table to the barbarian; none entered, none given", async () => {
  const { classFeatureTemporaryHpDie } = await import("../src/classFeatureCore.js");
  const feature = CLASS_FEATURE_BY_ID.get("barbaro-cammino-della-magia-selvaggia-impeto-selvaggio");
  assert.equal(classFeatureTemporaryHpDie(feature, "1"), "1d12");
  assert.equal(classFeatureTemporaryHpDie(feature, "2"), "");
  assert.deepEqual(classFeatureTemporaryHpApplications(feature, { sourceId: "bar", targetIds: ["bar"], choiceId: "1", value: 8,
    characterBuild: build("barbaro", 3) }), [{ targetId: "bar", amount: 8 }]);
  assert.deepEqual(classFeatureTemporaryHpApplications(feature, { sourceId: "bar", targetIds: ["bar"], choiceId: "1",
    characterBuild: build("barbaro", 3) }), []);
});
