import assert from "node:assert/strict";
import test from "node:test";
import { buildTurnNoticePayload } from "../src/turnNotice.js";

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
