import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const modal = readFileSync(new URL("../src/quick-hp-modal.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const between = (start, end) => modal.slice(modal.indexOf(start), modal.indexOf(end, modal.indexOf(start)));

// Lot U4 of the system UX audit: busy came on only after three reads (the live items, the applied-at state, the
// owner's scene context), so a quick second click on Applica could apply the same damage twice.
test("U4: la console Effetti è occupata dal clic su Applica, prima di ogni lettura, e si libera sempre", () => {
  const apply = between("async function applyOperation() {", "async function applyOperationNow() {");
  const busyAt = apply.indexOf("busy = true;");
  assert.ok(busyAt > 0, "Apply sets busy itself");
  assert.ok(busyAt < apply.indexOf("await "), "busy comes on before anything is awaited");
  assert.match(apply, /try \{\n\s+await applyOperationNow\(\);\n\s+\} finally \{\n\s+busy = false;\n\s+applying = false;\n\s+renderTargets\(\);/);

  const work = between("async function applyOperationNow() {", "async function undoLastOperation() {");
  assert.doesNotMatch(work, /busy = (true|false);/, "only applyOperation switches busy, so no way out leaves it on");
});

test("U4: durante l'applicazione il pulsante dice «Applico…», non durante l'Annulla", () => {
  assert.match(modal, /applyButton\.textContent = applying\n\s+\? "Applico…"/);
  const undo = between("async function undoLastOperation() {", "\n}\n");
  assert.doesNotMatch(undo, /applying = true/);
});
