// Aree che crollano (Auril, Hand Slam): spec dell'immagine, stadio dal round e aggiornamenti idempotenti.
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  BOSS_COLLAPSE_ITEM_KEY,
  bossCollapseAsset,
  bossCollapseItemId,
  bossCollapseMarker,
  bossCollapseMarkerSpec,
  bossCollapseStage,
  bossCollapseUpdates,
} from "../src/bossCollapseCore.js";

const profile = { bossDefinitionId: "auril", phaseId: "fase2" };
const handSlam = { id: "hand-slam", name: "Hand Slam" };
const CRACKED = "/boss-auril-hand-slam-cracked.webp";
const COLLAPSED = "/boss-auril-hand-slam-collapsed.webp";

function webpSize(bytes) {
  const chunk = bytes.toString("ascii", 12, 16);
  assert.equal(chunk, "VP8X");
  return [1 + bytes.readUIntLE(24, 3), 1 + bytes.readUIntLE(27, 3)];
}

test("solo Hand Slam di Auril ha un'area che crolla", () => {
  assert.ok(bossCollapseMarker(profile, handSlam));
  assert.equal(bossCollapseMarker(profile, { id: "titans-grasp" }), null);
  assert.equal(bossCollapseMarker({ bossDefinitionId: "shothragoth" }, handSlam), null);
});

test("gli asset esistono, sono WebP quadrati da 1000 px", async () => {
  for (const asset of [CRACKED, COLLAPSED]) {
    const bytes = await readFile(new URL(`../public${asset}`, import.meta.url));
    assert.deepEqual(webpSize(bytes), [1000, 1000], asset);
  }
});

test("la spec mette l'immagine incrinata al centro dell'area, 10 caselle di diametro, con ID dall'azione", () => {
  const spec = bossCollapseMarkerSpec({ profile, action: handSlam, sourceId: "auril", actionInstanceId: "slam-1", round: 3, center: { x: 300, y: 450 } });
  assert.equal(spec.id, "slam-1:collapse");
  assert.equal(spec.id, bossCollapseItemId("slam-1"));
  assert.deepEqual(spec.position, { x: 300, y: 450 });
  assert.equal(spec.asset, CRACKED);
  assert.equal(spec.pixels, 1000);
  assert.equal(spec.cells, 10);
  assert.deepEqual(spec.metadata[BOSS_COLLAPSE_ITEM_KEY], {
    sourceId: "auril", bossDefinitionId: "auril", actionId: "hand-slam", actionInstanceId: "slam-1",
    round: 3, collapseAfterRounds: 1, stage: "cracked",
  });
  assert.equal(bossCollapseMarkerSpec({ profile, action: handSlam, sourceId: "auril", actionInstanceId: "slam-1", round: 3, center: null }), null);
  assert.equal(bossCollapseMarkerSpec({ profile, action: { id: "rock" }, sourceId: "auril", actionInstanceId: "slam-1", round: 3, center: { x: 0, y: 0 } }), null);
});

test("l'area crolla alla fine del round successivo e torna incrinata se il round torna indietro", () => {
  const record = { round: 3, collapseAfterRounds: 1 };
  assert.equal(bossCollapseStage(record, 3), "cracked");
  assert.equal(bossCollapseStage(record, 4), "cracked", "round successivo: non ancora");
  assert.equal(bossCollapseStage(record, 5), "collapsed", "fine del round 4");
  assert.equal(bossCollapseStage(record, 4), "cracked", "turno precedente oltre il round");
  assert.equal(bossCollapseStage({ round: null, collapseAfterRounds: 1 }, 9), "cracked", "fuori combattimento");
  assert.equal(bossCollapseAsset({ bossDefinitionId: "auril", actionId: "hand-slam" }, "collapsed"), COLLAPSED);
});

test("gli aggiornamenti riguardano solo le immagini il cui stadio cambia", () => {
  const item = (id, round, stage) => ({ id, metadata: { [BOSS_COLLAPSE_ITEM_KEY]: {
    bossDefinitionId: "auril", actionId: "hand-slam", round, collapseAfterRounds: 1, stage } } });
  const items = [item("a", 1, "cracked"), item("b", 2, "cracked"), item("c", 1, "collapsed"), { id: "token", metadata: {} }];
  assert.deepEqual(bossCollapseUpdates(items, 3), [{ id: "a", stage: "collapsed", asset: COLLAPSED }]);
  assert.deepEqual(bossCollapseUpdates([item("a", 1, "collapsed")], 3), [], "già crollata");
  assert.deepEqual(bossCollapseUpdates([item("c", 1, "collapsed")], 2), [{ id: "c", stage: "cracked", asset: CRACKED }]);
});

// Lot L11 of the bugfix pass (AT-07): an area settled when the combat was cleared keeps its stage.
test("L11: un'area fissata a combattimento svuotato resta allo stadio che aveva", () => {
  const record = { bossDefinitionId: "auril", actionId: "hand-slam", round: 3, collapseAfterRounds: 1, stage: "collapsed" };
  assert.deepEqual(bossCollapseUpdates([{ id: "a", metadata: { [BOSS_COLLAPSE_ITEM_KEY]: record } }], 1, { inCombat: false }),
    [{ id: "a", stage: "collapsed", asset: COLLAPSED, settled: true }]);
  assert.equal(bossCollapseStage({ ...record, settled: true }, 1), "collapsed");
  assert.equal(bossCollapseStage({ ...record, stage: "cracked", settled: true }, 9), "cracked");
  assert.deepEqual(bossCollapseUpdates([{ id: "a", metadata: { [BOSS_COLLAPSE_ITEM_KEY]: { ...record, settled: true } } }], 1, { inCombat: false }), [],
    "already settled: nothing to write");
});
