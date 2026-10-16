// Cucitura del Non-Luogo: a portal at each end of the seam, part of the same drawing (same marker, same id list).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { BOSS_SEAM_ITEM_KEY } from "../src/bossActionExecutionCore.js";
import { BOSS_SEAM_PORTAL_ASSET, BOSS_SEAM_PORTAL_CELLS, BOSS_SEAM_PORTAL_PIXELS, bossSeamDrawingIds, bossSeamPortalIds, bossSeamPortalSpecs } from "../src/bossSeamPortalCore.js";

test("the portal ids follow the seam drawing; with the area and its outline they are the 4 ids a seam records", () => {
  assert.deepEqual(bossSeamPortalIds("boss-seam-1"), ["boss-seam-1-portal-start", "boss-seam-1-portal-end"]);
  assert.deepEqual(bossSeamDrawingIds("boss-seam-1"), ["boss-seam-1", "boss-seam-1-geometry", "boss-seam-1-portal-start", "boss-seam-1-portal-end"]);
  assert.deepEqual(bossSeamPortalIds(""), []);
  assert.deepEqual(bossSeamDrawingIds(null), []);
});

test("a portal at the start and one at the end, attached to the seam and carrying its marker", () => {
  const specs = bossSeamPortalSpecs({ itemId: "boss-seam-1", sourceId: "shothragoth", actionInstanceId: "boss-action:1",
    start: { x: 10, y: 20 }, end: { x: 850, y: 20 }, name: "Cucitura del Non-Luogo" });
  assert.deepEqual(specs.map((spec) => [spec.id, spec.attachedTo, spec.position, spec.metadata[BOSS_SEAM_ITEM_KEY]]), [
    ["boss-seam-1-portal-start", "boss-seam-1", { x: 10, y: 20 }, { sourceId: "shothragoth", actionInstanceId: "boss-action:1", portal: "start" }],
    ["boss-seam-1-portal-end", "boss-seam-1", { x: 850, y: 20 }, { sourceId: "shothragoth", actionInstanceId: "boss-action:1", portal: "end" }],
  ]);
  assert.equal(specs[0].name, "Cucitura del Non-Luogo · portale");
  assert.deepEqual(bossSeamPortalSpecs({ itemId: "boss-seam-1", sourceId: "shothragoth", start: { x: 0, y: 0 }, end: null }), []);
  assert.deepEqual(bossSeamPortalSpecs({ itemId: "boss-seam-1", sourceId: "", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } }), []);
});

test("the asset: a square webp with transparency, 10 ft on the map", async () => {
  assert.equal(BOSS_SEAM_PORTAL_ASSET, "/boss-seam-portal.webp");
  assert.equal(BOSS_SEAM_PORTAL_CELLS, 2);
  const bytes = await readFile(new URL("../public/boss-seam-portal.webp", import.meta.url));
  assert.equal(bytes.subarray(8, 12).toString(), "WEBP");
  assert.equal(bytes.subarray(12, 16).toString(), "VP8X");
  assert.ok(bytes[20] & 0x10, "alpha");
  assert.deepEqual([1 + bytes.readUIntLE(24, 3), 1 + bytes.readUIntLE(27, 3)], [BOSS_SEAM_PORTAL_PIXELS, BOSS_SEAM_PORTAL_PIXELS]);
});
