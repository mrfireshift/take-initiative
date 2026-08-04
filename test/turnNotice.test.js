import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTurnNoticePayload,
  isInitiativeTurnTransition,
  isTurnNoticeForScene,
} from "../src/turnNotice.js";

test("builds current and next turn names", () => {
  const entries = new Map([
    ["anya", { name: "Anya", portrait: "anya.png", attitude: "pc" }],
    ["karmakar", { name: "Karmakar" }],
  ]);
  assert.deepEqual(buildTurnNoticePayload({ order: ["anya", "karmakar"], current: 0, round: 3 }, entries), {
    currentId: "anya",
    nextId: "karmakar",
    currentName: "Anya",
    nextName: "Karmakar",
    currentPortrait: "anya.png",
    currentAttitude: "pc",
    round: 3,
    turnKey: "3:0:anya",
  });
});

test("wraps next turn and resolves virtual entries", () => {
  const entries = new Map([
    ["boss", { name: "Zariel" }],
    ["__EPIC__::boss::after::anya", { name: "Zariel" }],
  ]);
  const payload = buildTurnNoticePayload({
    order: ["boss", "__EPIC__::boss::after::anya"],
    current: 1,
    round: 2,
  }, entries);
  assert.equal(payload.currentName, "Zariel (Azione Epica)");
  assert.equal(payload.nextName, "Zariel");
});

test("returns null for an empty initiative", () => {
  assert.equal(buildTurnNoticePayload({ order: [] }, new Map()), null);
});

test("accetta un notice solo nello scene epoch che lo ha prodotto", () => {
  const payload = { sceneEpoch: 4 };
  assert.equal(isTurnNoticeForScene(payload, 4, true), true);
  assert.equal(isTurnNoticeForScene(payload, 5, true), false);
  assert.equal(isTurnNoticeForScene(payload, 4, false), false);
});

test("riconosce solo un vero avanzamento a ordine invariato", () => {
  const freddy = { order: ["freddy", "omar"], current: 0, round: 1 };
  const omar = { order: ["freddy", "omar"], current: 1, round: 1 };

  assert.equal(isInitiativeTurnTransition(freddy, omar), true);
  assert.equal(isInitiativeTurnTransition(omar, freddy), true);
  assert.equal(isInitiativeTurnTransition(freddy, freddy), false);
  assert.equal(isInitiativeTurnTransition(null, freddy), false);
  assert.equal(isInitiativeTurnTransition(
    { order: [], current: 0, round: 1 },
    freddy,
  ), false);
  assert.equal(isInitiativeTurnTransition(
    { order: ["freddy"], current: 0, round: 1 },
    freddy,
  ), false);
});
