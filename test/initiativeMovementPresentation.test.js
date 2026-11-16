import test from "node:test";
import assert from "node:assert/strict";

import {
  classicSpeedReadoutParts,
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
        attributes: {},
        children: [],
        textContent: "",
        setAttribute(name, value) {
          this.attributes[name] = String(value);
        },
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

test("la riga del tracker esteso divide metri e caselle, senza la parola", () => {
  assert.deepEqual(
    classicSpeedReadoutParts({ totalMeters: 4.5, allowanceMeters: 9, totalCells: 3, allowanceCells: 6 }),
    { meters: "4,5 / 9 m", cells: "3/6" },
  );
  assert.deepEqual(classicSpeedReadoutParts(null), { meters: "", cells: "" });
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
  assert.equal(result.wrap.style.gridTemplateColumns, "20px minmax(0, 1fr) 20px");
  assert.equal(decrease.title, undefined);
  assert.deepEqual(decrease.attributes, {});
  assert.equal(decrease.textContent, "−");
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

test("lo stepper dà nome e suggerimento ai pulsanti - e +", () => {
  const result = makeMovementStepper("Scatto ×0", () => {}, () => {}, {
    documentRef: createTestDocument(),
    decreaseLabel: "Uno scatto in meno",
    increaseLabel: "Uno scatto in più",
  });
  const [decrease, , increase] = result.wrap.children;
  assert.equal(decrease.title, "Uno scatto in meno");
  assert.equal(decrease.attributes["aria-label"], "Uno scatto in meno");
  assert.equal(increase.title, "Uno scatto in più");
  assert.equal(increase.attributes["aria-label"], "Uno scatto in più");
});
