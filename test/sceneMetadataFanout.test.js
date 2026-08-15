import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ID } from "../src/constants.js";
import {
  createSceneMetadataKeyWatcher,
  sceneMetadataKeyDigest,
} from "../src/sceneMetadataDigest.js";

const STATE_KEY = `${ID}/state`;
const sourceFiles = [
  "spatialSceneSnapshot.js",
  "spellAuraController.js",
  "classFeatureAuraController.js",
  "customAuraController.js",
  "spellStaticZone.js",
  "effectSaveReminderController.js",
  "classFeatureReminderController.js",
].map((name) => [
  name,
  readFileSync(new URL(`../src/${name}`, import.meta.url), "utf8"),
]);
const sourceByName = Object.fromEntries(sourceFiles);

test("il digest state è stabile per ordine, riferimenti e oggetti annidati", () => {
  const first = {
    [STATE_KEY]: {
      order: ["a", "b"],
      current: 0,
      boss: { lair: { initiative: 20, active: true }, phase: 2 },
    },
  };
  const reordered = {
    extra: { history: [1, 2, 3] },
    [STATE_KEY]: {
      boss: { phase: 2, lair: { active: true, initiative: 20 } },
      current: 0,
      order: ["a", "b"],
    },
  };
  assert.equal(
    sceneMetadataKeyDigest(first, STATE_KEY),
    sceneMetadataKeyDigest(reordered, STATE_KEY),
  );
  assert.equal(
    sceneMetadataKeyDigest({ [STATE_KEY]: undefined }, STATE_KEY),
    sceneMetadataKeyDigest({}, STATE_KEY),
  );
});

test("watcher distingue first seed, no-op, clear e vero cambio state", () => {
  const watcher = createSceneMetadataKeyWatcher(STATE_KEY);
  const state = { order: ["a"], current: 0, round: 1 };
  assert.equal(watcher.seed({ [STATE_KEY]: state, history: { id: 1 } }).changed, false);
  assert.equal(watcher.observe({ history: { id: 2 }, [STATE_KEY]: { ...state } }).changed, false);
  assert.equal(watcher.observe({ [STATE_KEY]: { ...state, round: 2 } }).changed, true);
  assert.equal(watcher.observe({ history: { id: 3 } }).changed, true);
  assert.equal(watcher.observe({}).changed, false);
  watcher.reset();
  assert.equal(watcher.initialized, false);
  assert.equal(watcher.seed({ [STATE_KEY]: { round: 9 } }).changed, false);
});

test("i consumer usano la chiave state e mantengono recovery/watchdog", () => {
  const spatial = sourceByName["spatialSceneSnapshot.js"];
  assert.match(spatial, /createSceneMetadataKeyWatcher\(STATE_KEY\)/);
  assert.match(spatial, /metadataEventsIgnored/);
  assert.match(spatial, /stateMetadataWatcher\.observe/);
  assert.match(spatial, /stateMetadataWatcher\.seed/);

  for (const [name, source] of sourceFiles.slice(1, 4)) {
    assert.match(source, /createSceneMetadataKeyWatcher\(STATE_KEY\)/, name);
    assert.match(source, /stateMetadataWatcher\.(?:observe|seed)/, name);
    assert.match(source, /reason: "metadata"/, name);
  }

  const staticSource = sourceByName["spellStaticZone.js"];
  assert.match(staticSource, /scheduleStaticSpellZoneWatchdog/);
  assert.match(staticSource, /requestStaticSpellZoneReconcile\(\{ reason: "recovery", force: true \}\)/);
  assert.match(staticSource, /queuedSceneMetadata = metadata/);
  assert.match(staticSource, /stateMetadataWatcher\.observe[\s\S]*queuedSceneMetadata = metadata/);

  const effectSource = sourceByName["effectSaveReminderController.js"];
  assert.match(effectSource, /domains: \["effects"\]/);
  assert.match(effectSource, /filter: \(event\) => !event\?\.derived\?\.output/);
  assert.doesNotMatch(effectSource, /domains: \["movement"\]/);

  const classReminder = sourceByName["classFeatureReminderController.js"];
  const hpSubscription = classReminder.slice(classReminder.indexOf("unsubscribeItems = subscribeSceneItemChanges"));
  assert.match(hpSubscription, /domains: \["hp"\]/);
  assert.doesNotMatch(hpSubscription, /scene\.getMetadata\(\)/);
  assert.match(classReminder, /initiativeStateSnapshot/);
});
