// A History entry holds only the fields its action changed: a heal on characters full of effects stays small.
import assert from "node:assert/strict";
import test, { mock } from "node:test";

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: { onReady() {}, broadcast: { onMessage: () => () => {}, sendMessage: async () => {} } },
    buildLabel() {}, buildImage() {}, buildText() {}, buildPath() {}, buildShape() {}, Command: class {},
  },
});
const { changedHistoryFields } = await import("../src/history.js");

const value = (v) => ({ present: true, value: v });
const absent = { present: false };

test("only the changed fields stay, HP with its maximum", () => {
  const effects = Array.from({ length: 30 }, (_, index) => ({ id: `e${index}`, condition: "Benedetto", detail: "x".repeat(200) }));
  const before = { hp: value(10), hpMax: value(40), conditions: value({ version: 2, instances: effects }), spells: absent };
  const after = { hp: value(22), hpMax: value(40), conditions: value({ version: 2, instances: effects }), spells: absent };
  const changed = changedHistoryFields(before, after);
  assert.deepEqual(changed, { before: { hp: value(10), hpMax: value(40) }, after: { hp: value(22), hpMax: value(40) } });
  assert.ok(JSON.stringify(changed).length < 200, "thirty unchanged effects are not carried");
});

test("a field that appears or disappears is a change; nothing changed, nothing kept", () => {
  assert.deepEqual(changedHistoryFields({ deathSaves: absent, hp: value(0) }, { deathSaves: value({ failures: 1 }), hp: value(0) }), {
    before: { deathSaves: absent }, after: { deathSaves: value({ failures: 1 }) },
  });
  assert.deepEqual(changedHistoryFields({ hp: value(5) }, { hp: value(5) }), { before: {}, after: {} });
});
