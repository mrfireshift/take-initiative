import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../src/spellStaticZone.js", import.meta.url),
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
    "await reconcileStaticSpellZones(sceneMetadataOverride);",
    "queuedSceneMetadata = metadata;",
    "requestStaticSpellZoneReconcile();",
  ]);
  assert.match(
    source,
    /const sceneMetadata = sceneMetadataOverride[\s\S]*\? sceneMetadataOverride[\s\S]*: fetchedSceneMetadata;/,
  );
});

test("il controller mantiene membership e zone ma non pianifica reminder periodici", () => {
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
      < source.indexOf("planSpellZoneTriggers({"),
  );
});
