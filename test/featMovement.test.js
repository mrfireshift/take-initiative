// Lot F2-1 of docs/STUDIO_TALENTI.md: Mobile's +3 m and Squat Nimbleness's +1,5 m as passive speeds of their records, read
// by the Speed Tracker as Fast Movement's; Mobile's id as the Speed Tracker names it (its Dash and difficult terrain,
// test/speedCheckRuntime.test.js); Squat Nimbleness's advantage to escape a grapple for the attack console (decision M6).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { classFeaturePassiveMovementMechanics } from "../src/classFeatureCore.js";
import { getEnabledClassFeatures } from "../src/classFeatureCatalog.js";
import { resolveConditionSpeed } from "../src/conditionSpeedCore.js";
import { featFeatureId, featFeaturesForProfile } from "../src/featCatalog.js";
import { pcAttackGrappleEscapeAdvantage } from "../src/pcAttackCore.js";

const card = (feats) => ({ characterBuild: [{ classId: "guerriero", level: 4 }], classFeaturesConfigured: true, enabledClassFeatureIds: [],
  species: { id: "nano" }, feats });
// The passive speeds of a card as the Speed Tracker builds them (speedCheck.js, conditionSpeedForItem).
const speedOf = (profile, base = 9) => resolveConditionSpeed(base, getEnabledClassFeatures(profile)
  .map((feature) => ({ feature, movement: classFeaturePassiveMovementMechanics(feature) }))
  .filter((entry) => entry.movement)
  .map(({ feature, movement }) => ({ id: `class-feature-passive:${feature.id}`, effectId: feature.id, condition: feature.name, active: true,
    mechanics: { movement } }))).speedMeters;

test("Mobile and Squat Nimbleness are passive speeds of their records: +3 m and +1,5 m in the Speed Tracker", () => {
  const [mobile] = featFeaturesForProfile(card([{ id: "mobilita" }]));
  assert.equal(mobile.id, "talento-mobilita");
  assert.equal(mobile.activation.primary, "passiva");
  assert.deepEqual(classFeaturePassiveMovementMechanics(mobile), { addMeters: 3, label: "Mobilità (+3 m)" });
  const [squat] = featFeaturesForProfile(card([{ id: "agilita-tarchiata", ability: "dex" }]));
  assert.deepEqual(classFeaturePassiveMovementMechanics(squat), { addMeters: 1.5, label: "Agilità Tarchiata (+1,5 m)" });
  assert.equal(speedOf(card([])), 9);
  assert.equal(speedOf(card([{ id: "mobilita" }])), 12);
  assert.equal(speedOf(card([{ id: "agilita-tarchiata", ability: "dex" }])), 10.5);
  assert.equal(speedOf(card([{ id: "mobilita" }, { id: "agilita-tarchiata", ability: "str" }]), 7.5), 12);
  assert.match(mobile.description, /\+3 m nello Speed Tracker/u);
  assert.match(squat.description, /Afferrato da/u);
});

test("the Speed Tracker names Mobile by its record's id", async () => {
  assert.equal(featFeatureId("mobilita"), "talento-mobilita");
  const source = await readFile(new URL("../src/speedCheck.js", import.meta.url), "utf8");
  assert.match(source, /export const MOBILE_FEATURE_ID = "talento-mobilita";/u);
});

test("Squat Nimbleness's advantage to escape a grapple: the feat's name, nothing without it", () => {
  assert.equal(pcAttackGrappleEscapeAdvantage(card([{ id: "agilita-tarchiata", ability: "dex" }])), "Agilità Tarchiata");
  assert.equal(pcAttackGrappleEscapeAdvantage(card([{ id: "mobilita" }])), "");
  assert.equal(pcAttackGrappleEscapeAdvantage({}), "");
});
