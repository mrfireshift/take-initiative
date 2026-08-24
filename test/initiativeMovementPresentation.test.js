import test from "node:test";
import assert from "node:assert/strict";

import {
  makeMovementStepper,
  movementNumber,
  movementReadoutSummary,
} from "../src/initiativeMovementPresentation.js";

function createTestDocument() {
  return {
    createElement(tagName) {
      return {
        tagName: String(tagName).toUpperCase(),
        style: {},
        listeners: {},
        children: [],
        textContent: "",
        addEventListener(type, listener) {
          this.listeners[type] = listener;
        },
        append(...children) {
          this.children.push(...children);
        },
        dispatch(type, event) {
          this.listeners[type]?.(event);
        },
      };
    },
  };
}

test("il formatter movimento conserva locale italiano e massimo un decimale", () => {
  assert.equal(movementNumber(0), "0");
  assert.equal(movementNumber(1.54), "1,5");
  assert.equal(movementNumber(1234.56), "1234,6");
  assert.equal(movementNumber(undefined), "0");
});

test("il readout mantiene le forme classic e compact correnti", () => {
  const snapshot = {
    totalMeters: 4.5,
    allowanceMeters: 9,
    totalCells: 3,
    allowanceCells: 6,
  };

  assert.equal(
    movementReadoutSummary(snapshot, false),
    "4,5 / 9 m · 3/6 caselle",
  );
  assert.equal(
    movementReadoutSummary(snapshot, true),
    "4,5/9 m · (3/6)",
  );
  assert.equal(movementReadoutSummary(null, true), "");
});

test("lo stepper conserva struttura, stile e ordine delle callback", () => {
  const calls = [];
  const documentRef = createTestDocument();
  const result = makeMovementStepper(
    "Bonus 0 m",
    () => calls.push("decrease"),
    () => calls.push("increase"),
    { documentRef },
  );

  const [decrease, value, increase] = result.wrap.children;
  assert.equal(result.wrap.style.gridTemplateColumns, "24px minmax(0, 1fr) 24px");
  assert.equal(decrease.textContent, "-");
  assert.equal(decrease.type, "button");
  assert.equal(value, result.value);
  assert.equal(value.textContent, "Bonus 0 m");
  assert.equal(increase.textContent, "+");
  assert.equal(increase.type, "button");

  const events = [];
  decrease.dispatch("click", { stopPropagation: () => events.push("stop-decrease") });
  increase.dispatch("click", { stopPropagation: () => events.push("stop-increase") });
  assert.deepEqual(events, ["stop-decrease", "stop-increase"]);
  assert.deepEqual(calls, ["decrease", "increase"]);
});
