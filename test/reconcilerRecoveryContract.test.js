import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function source(path) {
  return readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
}

test("effects layout e HP widgets usano il reconciler convergente", () => {
  const effects = source("effectsLayout.js");
  const hp = source("hpbar-items.js");
  assert.match(effects, /reconcileOwnedSceneItems/);
  assert.match(effects, /isCurrentSceneEpoch/);
  assert.match(hp, /reconcileHPBarItems|createHPBars/);
  assert.match(hp, /reconcileOwnedSceneItems/);
  assert.match(hp, /itemsByIdentity/);
});

test("le due aura non mutano membership o visuali con bounds parziali", () => {
  for (const path of ["spellAuraController.js", "classFeatureAuraController.js"]) {
    const controller = source(path);
    assert.match(controller, /createSceneItemBoundsCache/);
    assert.match(controller, /if \(!boundsResult\.complete\)/);
    assert.match(controller, /reconcileOwnedSceneItems/);
    assert.match(controller, /isCurrentSceneEpoch\(sceneEpoch\)/);
    assert.match(controller, /schedule.*AuraRecovery/);
  }
});

test("le zone ritentano bounds e reconcile falliti e verificano delete e rollback", () => {
  const controller = source("spellStaticZone.js");
  const transaction = source("staticSpellZoneRemovalCore.js");
  assert.match(controller, /scheduleStaticSpellZoneRecovery/);
  assert.match(controller, /readItems: \(ids\) => OBR\.scene\.items\.getItems\(ids\)/);
  assert.match(transaction, /reconcileOwnedSceneItems/);
  assert.match(transaction, /rollbackError/);
});
