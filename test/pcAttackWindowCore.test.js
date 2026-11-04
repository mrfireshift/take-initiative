import assert from "node:assert/strict";
import test from "node:test";
import { PC_ATTACK_MAX_HEIGHT, PC_ATTACK_MIN_HEIGHT, pcAttackWindowFloor, pcAttackWindowHeight, pcAttackWindowLimit } from "../src/pcAttackWindowCore.js";

test("the window is as tall as its content, between its minimum and its limit", () => {
  assert.deepEqual(pcAttackWindowHeight({ content: 300 }), { height: 300, capped: false });
  assert.deepEqual(pcAttackWindowHeight({ content: 40 }), { height: PC_ATTACK_MIN_HEIGHT, capped: false });
  assert.deepEqual(pcAttackWindowHeight({ content: 900 }), { height: PC_ATTACK_MAX_HEIGHT, capped: true }, "too much: the long lists give way");
  assert.deepEqual(pcAttackWindowHeight({ content: 500, limit: 400 }), { height: 400, capped: true });
});

test("during an attack it keeps its height; an open menu counts only while it is open, and is never what caps it", () => {
  assert.deepEqual(pcAttackWindowHeight({ content: 300, floor: 366 }), { height: 366, capped: false });
  assert.deepEqual(pcAttackWindowHeight({ content: 300, menu: 411 }), { height: 411, capped: false });
  assert.deepEqual(pcAttackWindowHeight({ content: 300, menu: 800, limit: 500 }), { height: 500, capped: false }, "a menu scrolls inside itself");
});

test("the limit: never beyond the screen with the window's top where it is, never above the maximum", () => {
  assert.equal(pcAttackWindowLimit({ top: 60, viewport: 720 }), 648);
  assert.equal(pcAttackWindowLimit({ top: 60, viewport: 2000 }), PC_ATTACK_MAX_HEIGHT);
  assert.equal(pcAttackWindowLimit({ top: 700, viewport: 720 }), PC_ATTACK_MIN_HEIGHT, "dragged to the bottom: it stays usable, and the host keeps it on screen");
  assert.equal(pcAttackWindowLimit(), PC_ATTACK_MAX_HEIGHT, "a screen it cannot read");
});

test("the floor: the tallest height of this attack, gone with it; no attack, no floor", () => {
  assert.equal(pcAttackWindowFloor({ key: "a", lastKey: "", floor: 0, content: 300 }), 300, "a new attack starts from what it needs");
  assert.equal(pcAttackWindowFloor({ key: "a", lastKey: "a", floor: 300, content: 366 }), 366, "it grows");
  assert.equal(pcAttackWindowFloor({ key: "a", lastKey: "a", floor: 366, content: 300 }), 366, "it does not shrink");
  assert.equal(pcAttackWindowFloor({ key: "b", lastKey: "a", floor: 366, content: 300 }), 300, "the next attack lets it go");
  assert.equal(pcAttackWindowFloor({ key: "", lastKey: "a", floor: 366, content: 300 }), 0, "a spell to cast or a feature to use keeps nothing");
});
