import test from "node:test";
import assert from "node:assert/strict";
import { shouldRoomInitiativeCardWin } from "../src/initiativeCardConflict.js";

const decide = (overrides = {}) => shouldRoomInitiativeCardWin({
  hasRoomVersion: true,
  hasTokenProfile: true,
  roomDeleted: false,
  roomHasValues: true,
  tokenHasValues: true,
  roomUpdatedAt: 100,
  tokenUpdatedAt: 100,
  ...overrides,
});

test("hydrates a new token from the room card", () => {
  assert.equal(decide({ hasTokenProfile: false }), true);
});

test("a filled room card beats a newer empty token card", () => {
  assert.equal(decide({ tokenHasValues: false, roomUpdatedAt: 100, tokenUpdatedAt: 200 }), true);
});

test("a filled token card repairs a newer empty room card", () => {
  assert.equal(decide({ roomHasValues: false, tokenHasValues: true, roomUpdatedAt: 200, tokenUpdatedAt: 100 }), false);
});

test("timestamps decide between two filled cards", () => {
  assert.equal(decide({ roomUpdatedAt: 99, tokenUpdatedAt: 100 }), false);
  assert.equal(decide({ roomUpdatedAt: 101, tokenUpdatedAt: 100 }), true);
});

test("explicit room deletion remains timestamp based", () => {
  assert.equal(decide({ roomDeleted: true, roomHasValues: false, roomUpdatedAt: 101, tokenUpdatedAt: 100 }), true);
  assert.equal(decide({ roomDeleted: true, roomHasValues: false, roomUpdatedAt: 99, tokenUpdatedAt: 100 }), false);
});