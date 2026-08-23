import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../src/spellStaticZone.js", import.meta.url),
  "utf8",
);
const executorSource = readFileSync(
  new URL("../src/spellApplicationExecutor.js", import.meta.url),
  "utf8",
);

function assertOrdered(markers) {
  let cursor = -1;
  for (const marker of markers) {
    const next = source.indexOf(marker, cursor + 1);
    assert.notEqual(next, -1, `marker mancante: ${marker}`);
    assert.ok(next > cursor, `ordine errato: ${marker}`);
    cursor = next;
  }
}

test("il controller consegna al reconcile l'ultimo snapshot metadata ricevuto", () => {
  assertOrdered([
    "let queuedSceneMetadata = null;",
    "const sceneMetadataOverride = queuedSceneMetadata;",
    "queuedSceneMetadata = null;",
    "await reconcileStaticSpellZones(",
    "queuedSceneMetadata = metadata;",
    "requestStaticSpellZoneReconcile();",
  ]);
  assert.match(
    source,
    /const sceneMetadata = sceneMetadataOverride[\s\S]*\? sceneMetadataOverride[\s\S]*: fetchedSceneMetadata;/,
  );
});

test("il reconcile può essere eseguito subito dopo un'azione di zona", () => {
  assert.match(source, /normalized\.immediate === true/);
  assert.match(source, /return pump\(\);/);
});

test("il cambio modalità della zona riconcilia subito la membership", () => {
  assert.match(
    executorSource,
    /if \(actionPlan\.zoneRuleChoice\) \{[\s\S]*?requestStaticSpellZoneReconcile\([\s\S]*?immediate: true/,
  );
});

test("il controller pianifica i reminder dopo aver riconciliato la membership", () => {
  assert.match(
    source,
    /if \(!SPELL_ZONE_TRIGGER_WORKFLOW_ENABLED\) continue;/,
  );
  assert.ok(
    source.indexOf("areaMembershipPlan({")
      < source.indexOf("if (!SPELL_ZONE_TRIGGER_WORKFLOW_ENABLED) continue;"),
  );
  assert.ok(
    source.indexOf("if (!SPELL_ZONE_TRIGGER_WORKFLOW_ENABLED) continue;")
      < source.indexOf("planStaticSpellZoneReminder({"),
  );
});

test("una scansione bounds incompleta rinvia membership e reminder senza corromperli", () => {
  assert.match(source, /const boundsResult = await sceneItemBounds\.load\(boundedItems\);/);
  assert.match(source, /if \(!boundsResult\.complete\) \{[\s\S]*return;[\s\S]*\}/);
  assert.ok(
    source.indexOf("if (!boundsResult.complete)")
      < source.indexOf("const candidates = creatures.map"),
  );
});

test("i trigger condizionali filtrano concentrazione e condizioni attive", () => {
  assert.match(source, /const CONCENTRATION_KEY = `\$\{ID\}\/concentration`;/);
  assert.match(
    source,
    /requiresConcentration && !itemIsConcentrating\(item\)/,
  );
  assert.match(source, /trigger\?\.requireConditions/);
  assert.match(source, /trigger\?\.requireMovementModes/);
  assert.match(source, /requiredNames\.size > 0/);
  assert.match(source, /itemHasEffectiveMovementMode\(item, mode\)/);
  assert.match(source, /const conditionNames = new Set/);
  assert.ok(
    source.indexOf("suppressedTriggerTargets(")
      < source.indexOf("planStaticSpellZoneReminder({"),
  );
});

test("il controller lascia il trascinamento nativo delle zone mobili", () => {
  assert.match(
    source,
    /filter: \(event\) => \([\s\S]*restoredStaticSpellZoneActivationIds\(event\)\.length > 0/,
  );
  assert.match(source, /rearmedStaticSpellZoneNotices\(/);
  assert.match(source, /rearmActivationIds/);
  assert.doesNotMatch(source, /guardControlledMobileZoneChanges/);
  assert.doesNotMatch(source, /CONTROLLED_MOBILE_ZONE_SPELL_IDS/);
});
