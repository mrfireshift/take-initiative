import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { calculateQuickHPChange, quickHPAppliedMessage } from "../src/quickHpCore.js";

// Lot L20 of the bugfix pass, polish R3 "Console PF": «Applicato a N bersagli» counted the targets a command reached,
// also those it left as they were (a heal on full HP).
test("L20: la console PF conta i bersagli cambiati e dice a parte quelli invariati", () => {
  assert.equal(quickHPAppliedMessage({ changedCount: 2 }), "Applicato a 2 bersagli.");
  assert.equal(quickHPAppliedMessage({ changedCount: 1 }), "Applicato a 1 bersaglio.");
  assert.equal(quickHPAppliedMessage({ changedCount: 2, unchangedCount: 1 }), "Applicato a 2 bersagli (1 invariato).");
  assert.equal(quickHPAppliedMessage({ changedCount: 0, unchangedCount: 3 }), "Applicato a 0 bersagli (3 invariati).");
  assert.equal(quickHPAppliedMessage({ save: true, changedCount: 3 }), "Risoluzione applicata a 3 bersagli.");

  const fullHeal = calculateQuickHPChange({ mode: "heal", value: 5, hp: 20, hpMax: 20 });
  assert.equal(fullHeal.changed, false, "a heal on full HP changes nothing");
  assert.equal(calculateQuickHPChange({ mode: "heal", value: 5, hp: 12, hpMax: 20 }).changed, true);

  const modal = readFileSync(new URL("../src/quick-hp-modal.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(modal, /const changedHPIds = entries\.filter\(\(entry\) => entry\.change\?\.changed\)\.map\(\(entry\) => entry\.item\.id\);/);
  assert.match(modal, /status\.textContent = quickHPAppliedMessage\(\{\n\s+save: mode === QUICK_HP_MODES\.SAVE,\n\s+changedCount: changedIds\.length,\n\s+unchangedCount: reachedCount - changedIds\.length,/);
  assert.doesNotMatch(modal, /`Applicato a \$\{entries\.length\} bersagli\.`/);
});
