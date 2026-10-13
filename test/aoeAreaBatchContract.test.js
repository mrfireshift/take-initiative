// Source contract: several shapes before one confirmation exist only for a placement whose context carries areaBatch.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const tool = readFileSync(new URL("../src/aoeTargetTool.js", import.meta.url), "utf8");

test("areaBatch is opt-in, never for board tokens or points, and bounded", () => {
  assert.match(tool, /areaBatch: normalizedAreaBatch\(data\?\.context, rule\),/);
  assert.match(tool, /if \(!\(count >= 2 && count <= 12\) \|\| isBoardTokenPlacement\(rule\) \|\| isPointPlacement\(rule\)\) return null;/);
});

test("a released shape is fixed only in a batch; otherwise the single-shape review is unchanged", () => {
  const finish = tool.slice(tool.indexOf("async function finishDrag(state)"), tool.indexOf("function finishMovementDrag(state)"));
  const batch = finish.indexOf("if (spellPlacementSession.areaBatch) {");
  assert.ok(batch > 0);
  assert.ok(batch < finish.lastIndexOf("spellPlacementSession.session = reviewSpellAreaPlacement("), "the batch branch returns before the single-shape review");
  assert.ok(batch > finish.indexOf("state.context?.autoConfirmAnchor === true"), "anchored and point placements keep their own paths");
});

test("confirmation needs every shape, computes hits per shape and returns them together", () => {
  const confirm = tool.slice(tool.indexOf("async function confirmSpellPlacement()"), tool.indexOf("function modeDefinition("));
  assert.match(confirm, /if \(areaBatch\.shapes\.length !== areaBatch\.count\) \{/);
  assert.match(confirm, /const hitTargetIds = await findHitTargetIds\(shape\.area, runtime\.rule\);/);
  assert.match(confirm, /areas,\n    \}\);\n    await closeSpellPlacement\("confirmed"\);/);
  assert.ok(confirm.indexOf("if (runtime?.areaBatch)") < confirm.indexOf("Posiziona prima la sagoma dell'incantesimo."));
});

test("too-close centres are refused; a fixed shape is moved by its inner circle and keeps its number", () => {
  assert.match(tool, /const close = areaBatchTooClose\(areaBatch, state\);\n  if \(close >= 0\) \{/);
  const start = tool.slice(tool.indexOf("function startDrag(type, event)"), tool.indexOf("function moveDrag(event)"));
  assert.match(start, /const grabbed = batchPointer \? areaBatchShapeAt\(areaBatch, batchPointer\) : -1;/);
  assert.match(start, /const \[shape\] = areaBatch\.shapes\.splice\(grabbed, 1\);\n      releaseAreaBatchShape\(spellPlacementSession, shape\);\n      batchOrdinal = shape\.ordinal;/);
  assert.match(start, /\} else if \(areaBatch\.shapes\.length >= areaBatch\.count\) \{[\s\S]*?return;\n    \}/, "with every shape placed, empty space starts nothing");
  assert.ok(start.indexOf("areaBatchShapeAt") < start.indexOf("cancelDrag();"));
  assert.match(tool, /areaBatch\.shapes\.sort\(\(a, b\) => a\.ordinal - b\.ordinal\);/, "the confirmed areas follow the numbers on the map");
  assert.match(tool, /for \(const interaction of runtime\.previewInteractions \|\| \[\]\) interaction\?\.\[1\]\?\.\(\);/, "fixed shapes are cleared on close");
});

test("the extra-damage circle is a fourth preview item only in a batch with an inner radius", () => {
  assert.match(tool, /&& spellPlacementSession\.areaBatch\?\.innerRadiusFeet > 0;/);
  assert.match(tool, /\.\.\.\(innerPreview\n        \? \[\(\(\{ fillColor, strokeColor, fillOpacity \}\) => previewPath\("Centro del danno extra"/);
  assert.match(tool, /AREA_BATCH_INNER_STYLES\[requestedAreaTheme\(state\)\] \|\| AREA_BATCH_INNER_STYLES\.default/);
});

test("an area theme is honoured only for Boss Action areas and only from the closed list", () => {
  assert.match(tool, /return state\?\.rule\?\.spellId === BOSS_ACTION_AREA_SPELL_ID \? String\(state\?\.context\?\.areaTheme \|\| ""\) : "";/);
  assert.match(tool, /spellAreaStyle\(state\.rule\?\.spellId, currentStyle, requestedAreaTheme\(state\)\)/);
  assert.match(tool, /if \(items\[3\] && innerArea\) items\[3\]\.commands = boundaryCommands\(innerArea\.cells\);/);
});
