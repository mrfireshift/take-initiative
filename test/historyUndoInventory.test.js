import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("il percorso produttivo Undo non contiene più write SDK legacy in history.js", () => {
  const source = read("../src/history.js");
  assert.doesNotMatch(source, /OBR\.scene\.items\.(?:deleteItems|updateItems|addItems)/);
  assert.match(source, /undoEffectsMutation\(undoOrder/);
  assert.match(source, /requestHistoryOwnerRemove/);
});

test("il planner Undo vive fuori dalla UI e il commit passa dal coordinator", () => {
  const core = read("../src/historyUndoCore.js");
  const effects = read("../src/effectsMutations.js");
  assert.match(core, /export function buildHistoryUndoPlan/);
  assert.match(effects, /plan\?\.historyUndo === true/);
  assert.match(effects, /commitHistoryUndoPlan\(plan/);
});

