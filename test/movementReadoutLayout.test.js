// The expanded tracker's movement panel (18/11, the user's layout X): the name and the metres on the first row; the mode
// (the whole row's width), the lock and the reset on the second; Scatto and Bonus on the third; the bar last. Every
// control 26px tall, the texts never below 10px, a smaller padding; for the players the mode is plain text at the left
// edge, as the bar under it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const tracker = readFileSync(new URL("../src/initiativeList.js", import.meta.url), "utf8");
const block = tracker.slice(tracker.indexOf("const movementReadout = document.createElement(\"div\");"), tracker.indexOf("function renderMovementReadoutMeta("));
const style = (name) => block.slice(block.indexOf(`Object.assign(${name}.style, {`), block.indexOf("});", block.indexOf(`Object.assign(${name}.style, {`)));

test("name and metres, then mode with lock and reset, then the allowance, and the bar last", () => {
  assert.ok(block.includes("movementReadoutHead.append(movementReadoutValue, movementReadoutMeta);"));
  assert.match(block, /movementReadoutLine\.append\(\s+movementModeChip,\s+movementCompactLimitControl,\s+movementLimitControl,\s+\);/);
  assert.ok(block.includes("movementReadoutLine.append(movementResetButton);"));
  assert.ok(block.includes("movementDetails.append(movementDashStepper.wrap, movementBonusStepper.wrap);"));
  assert.ok(block.includes("movementReadout.append(movementReadoutHead, movementReadoutLine, movementDetails, movementReadoutTrack);"));
  // The reset is the GM's, as Scatto and Bonus.
  assert.ok(block.includes('movementResetButton.style.display = IS_GM && !isCompactTrackerLayout() ? "inline-flex" : "none";'));
});

test("every control 26px tall, the mode across the row, the name giving way before the metres", () => {
  assert.match(style("movementModeChip"), /flex: "1 1 auto",[\s\S]*height: "26px",/);
  assert.match(style("movementLimitControl"), /width: "26px",\s+height: "26px",/);
  assert.match(style("movementResetButton"), /width: "26px",\s+height: "26px",/);
  assert.match(style("movementReadoutValue"), /flex: "1 1 auto",/);
  const presentation = readFileSync(new URL("../src/initiativeMovementPresentation.js", import.meta.url), "utf8");
  assert.match(presentation, /gridTemplateColumns: "20px minmax\(0, 1fr\) 20px",[\s\S]*padding: "2px",[\s\S]*border: "1px solid/);
});

test("the texts one step smaller, none below 10px; a smaller padding; the players' mode at the edge", () => {
  assert.match(style("movementReadoutValue"), /fontSize: "12px",/);
  assert.match(style("movementReadoutMeters"), /fontSize: "11px",/);
  assert.match(style("movementModeChip"), /fontSize: "10px",/);
  assert.ok(block.includes('stepper.value.style.fontSize = "10px";'));
  for (const size of block.matchAll(/fontSize: "(\d+(?:\.\d+)?)px"/g)) assert.ok(Number(size[1]) >= 10, size[0]);
  assert.match(style("movementReadout"), /gap: "5px",\s+padding: "6px 8px",/);
  assert.match(tracker, /gap: "5px",\s+padding: "6px 8px",\s+borderRadius: "14px",/);
  assert.match(tracker, /padding: selectable \? "0 18px 0 6px" : "0",/);
  assert.match(tracker, /borderWidth: selectable \? "1px" : "0",/);
  assert.match(tracker, /height: selectable \? "26px" : "auto",/);
  assert.match(style("movementReadoutHead"), /fontSize: "10px",/);
});
