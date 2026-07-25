import test from "node:test";
import assert from "node:assert/strict";
import { evaluateLocalAttachmentProbe } from "../src/effectsLocalItemsProbeCore.js";

function snapshot(overrides = {}) {
  return {
    tokenId: "token-a",
    localExists: true,
    globalExists: false,
    markerAttachedTo: "token-a",
    tokenPosition: { x: 100, y: 200 },
    markerPosition: { x: 100, y: 140 },
    markerBoundsCenter: { x: 100, y: 140 },
    ...overrides,
  };
}

test("probe local items: attende uno spostamento misurabile", () => {
  const before = snapshot();
  const result = evaluateLocalAttachmentProbe(before, snapshot());
  assert.equal(result.verdict, "awaiting-move");
  assert.equal(result.localOnly, true);
  assert.equal(result.attachmentReferencePreserved, true);
});

test("probe local items: passa quando i bounds seguono il token globale", () => {
  const before = snapshot();
  const after = snapshot({
    tokenPosition: { x: 135, y: 180 },
    markerBoundsCenter: { x: 135, y: 120 },
  });
  const result = evaluateLocalAttachmentProbe(before, after);
  assert.equal(result.verdict, "pass");
  assert.equal(result.followsParent, true);
  assert.deepEqual(result.tokenDelta, { x: 35, y: -20 });
  assert.deepEqual(result.boundsDelta, { x: 35, y: -20 });
  assert.equal(result.deltaError, 0);
});

test("probe local items: la posizione dell'item prevale su bounds visuali instabili", () => {
  const before = snapshot();
  const after = snapshot({
    tokenPosition: { x: -500, y: 200 },
    markerPosition: { x: -500, y: 140 },
    markerBoundsCenter: { x: -500, y: 85.82 },
  });
  const result = evaluateLocalAttachmentProbe(before, after);
  assert.equal(result.verdict, "pass");
  assert.equal(result.positionFollowsParent, true);
  assert.equal(result.boundsFollowParent, false);
  assert.equal(result.positionDeltaError, 0);
  assert.equal(result.boundsDeltaError, 54.18);
});

test("probe local items: fallisce se il marker non segue il parent", () => {
  const before = snapshot();
  const result = evaluateLocalAttachmentProbe(before, snapshot({
    tokenPosition: { x: 150, y: 200 },
  }));
  assert.equal(result.verdict, "fail");
  assert.equal(result.followsParent, false);
  assert.equal(result.deltaError, 50);
});

test("probe local items: fallisce se il marker compare nello store globale", () => {
  const before = snapshot();
  const result = evaluateLocalAttachmentProbe(before, snapshot({
    tokenPosition: { x: 110, y: 200 },
    markerBoundsCenter: { x: 110, y: 140 },
    globalExists: true,
  }));
  assert.equal(result.verdict, "fail");
  assert.equal(result.localOnly, false);
});
