import assert from "node:assert/strict";
import test from "node:test";
import { describeError } from "../src/errorText.js";

test("an error is shown in words, never as [object Object]", () => {
  assert.equal(describeError(new Error("history-local-store-blocked")), "history-local-store-blocked");
  assert.equal(describeError({ code: "quota", detail: 1 }), '{"code":"quota","detail":1}');
  assert.equal(describeError({ message: { reason: "x" } }), '{"reason":"x"}');
  assert.equal(describeError({}, "Operazione fallita."), "Operazione fallita.");
  assert.equal(describeError(null, "Operazione fallita."), "Operazione fallita.");
  assert.equal(describeError("Too many requests"), "Too many requests");
});
