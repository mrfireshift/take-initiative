// Persistent Embers loops come back after a room reload or a scene change.
import test from "node:test";
import assert from "node:assert/strict";
import { ID } from "../src/constants.js";
import {
  EMBERS_ZONE_VISUAL_KEY,
  activeMatchedVisualLifecycles,
  rehydrationLayers,
  storableVisualPreview,
  translatedVisualPreview,
  zoneVisualMetadata,
} from "../src/embersVisualRehydrationCore.js";
import { buildMatchedVisualEvent, isMatchedClassFeatureVisual, isMatchedSpellVisualSpell } from "../src/embersMatchedVisualCore.js";

const META = `${ID}/meta`;
const SPELLS = `${ID}/spells`;
const CONC = `${ID}/concentration`;
const ZONE = `${ID}/spellStaticZone`;
const token = (id, meta = {}, extra = {}) => ({ id, metadata: { [META]: meta }, ...extra });
const options = { isSpellVisual: isMatchedSpellVisualSpell, isFeatureVisual: isMatchedClassFeatureVisual, zoneMetaKey: ZONE };

test("Bless on two targets is one lifecycle with its caster and both targets", () => {
  const bless = (casterId) => ({ id: "e", name: "Benedizione", spellId: "bless", casterId, instanceId: "bless-1", turns: 8, conc: true });
  const items = [
    token("cleric", { [CONC]: { benedizione: { instanceId: "bless-1", spellId: "bless", targets: ["kos", "lavera"] } } }),
    token("kos", { [SPELLS]: [bless("cleric")] }),
    token("lavera", { [SPELLS]: [bless("cleric")] }),
    token("goblin", { [SPELLS]: [{ instanceId: "x", spellId: "not-a-visual" }] }),
  ];
  const [lifecycle, ...others] = activeMatchedVisualLifecycles(items, options);
  assert.equal(others.length, 0);
  assert.equal(lifecycle.lifecycleId, "bless-1");
  assert.equal(lifecycle.spellId, "bless");
  assert.equal(lifecycle.casterId, "cleric");
  assert.deepEqual(lifecycle.targetIds.sort(), ["kos", "lavera"]);
  assert.equal(lifecycle.preview, null);
});

test("only the loop comes back, without delay; an area loop needs the stored placement", () => {
  const event = buildMatchedVisualEvent({ spellId: "bless", casterId: "c", targetIds: ["t"], caster: { x: 0, y: 0 },
    targets: [{ id: "t", center: { x: 100, y: 100 }, diameter: 150 }], sceneDpi: 150, lifecycleId: "l" });
  const layers = rehydrationLayers(event.layers);
  assert.deepEqual(layers.map((layer) => [layer.effectId, layer.delay]), [["blessLoop", 0]], "no blessIntro");
  const area = [{ effectId: "webLoop", persistent: true, anchor: "area", attachedTo: "" }];
  assert.deepEqual(rehydrationLayers(area), [], "no placement: skipped rather than drawn in the wrong place");
  assert.equal(rehydrationLayers(area, { hasPreview: true }).length, 1);
});

test("a zone spell keeps its placement on the zone root and follows the zone when it moves", () => {
  const stored = zoneVisualMetadata({
    preview: { type: "circle", start: { x: 300, y: 300 }, end: { x: 450, y: 300 }, dpi: 150, targetIds: ["a", "b"], extra: "drop" },
    placementChoice: "",
    zonePosition: { x: 0, y: 0 },
  });
  assert.deepEqual(stored.preview, { type: "circle", start: { x: 300, y: 300 }, end: { x: 450, y: 300 }, dpi: 150 }, "geometry only");
  const zone = token("zone-root", {}, {
    position: { x: 150, y: -150 },
  });
  zone.metadata[ZONE] = { version: 1, instanceId: "moon-1", spellId: "moonbeam", casterId: "druid", role: "root" };
  zone.metadata[EMBERS_ZONE_VISUAL_KEY] = stored;
  const [lifecycle] = activeMatchedVisualLifecycles([zone], options);
  assert.equal(lifecycle.zoneId, "zone-root");
  assert.equal(lifecycle.casterId, "druid");
  assert.deepEqual(lifecycle.preview.start, { x: 450, y: 150 }, "moved by the zone's position delta");
  assert.deepEqual(lifecycle.preview.end, { x: 600, y: 150 });
  assert.equal(storableVisualPreview({ end: { x: 1, y: 1 } }), null, "a placement without a start is not stored");
  assert.equal(translatedVisualPreview(null, { x: 1, y: 1 }), null);
});

test("a zone placed before this change has no stored placement", () => {
  const zone = token("old-zone");
  zone.metadata[ZONE] = { version: 1, instanceId: "web-1", spellId: "web", casterId: "wizard", role: "root" };
  const [lifecycle] = activeMatchedVisualLifecycles([zone], options);
  assert.equal(lifecycle.preview, null);
});

test("an expired class-feature activation does not come back", () => {
  const state = (expiresRound) => ({ version: 1, resources: {}, instances: [{ instanceId: "insp-1", featureId: "bardo-ispirazione-bardica",
    sourceId: "bard", targetIds: ["kos"], suppressedTargetIds: [], startedRound: 1, startedTurnKey: "", expiresRound, createdAt: 1 }] });
  const active = activeMatchedVisualLifecycles([token("bard", { classFeatureState: state(null) })], { ...options, currentRound: 5 });
  assert.deepEqual(active.map((entry) => [entry.featureId, entry.casterId, entry.targetIds]), [["bardo-ispirazione-bardica", "bard", ["kos"]]]);
  assert.deepEqual(activeMatchedVisualLifecycles([token("bard", { classFeatureState: state(3) })], { ...options, currentRound: 5 }), []);
});
