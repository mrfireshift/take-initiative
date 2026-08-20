import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  historyUndoCutoffAt,
  shouldDismissConcentrationWarningAfterUndo,
} from "../src/concentrationSaveReminderCore.js";

test("Undo chiude solo i warning nati dal punto temporale annullato in poi", () => {
  const warning = { createdAt: 200 };

  assert.equal(
    shouldDismissConcentrationWarningAfterUndo(warning, 250),
    false,
    "annullare un'azione successiva al warning non deve chiuderlo",
  );
  assert.equal(
    shouldDismissConcentrationWarningAfterUndo(warning, 200),
    true,
    "annullare l'azione al confine del warning deve chiuderlo",
  );
  assert.equal(
    shouldDismissConcentrationWarningAfterUndo(warning, 150),
    true,
    "tornare prima del warning deve chiuderlo",
  );
  assert.equal(shouldDismissConcentrationWarningAfterUndo({}, 150), false);
});

test("il cutoff di un Undo multiplo usa l'azione piu vecchia realmente annullata", () => {
  assert.equal(historyUndoCutoffAt([
    { id: "new", at: 400 },
    { id: "mid", at: 300 },
    { id: "old", at: 200 },
  ]), 200);
  assert.equal(historyUndoCutoffAt([{ id: "legacy" }]), 0);
});

test("History e host collegano il lifecycle del popup al cutoff dell'Undo", () => {
  const history = readFileSync(new URL("../src/history.js", import.meta.url), "utf8");
  const initiative = readFileSync(new URL("../src/initiativeList.js", import.meta.url), "utf8");
  const warningUi = readFileSync(new URL("../src/concentration-warning.ts", import.meta.url), "utf8");

  assert.match(history, /historyUndoCutoffAt\(undoOrder\)/);
  assert.match(history, /type: "concentration-warning-history-undo", cutoffAt/);
  assert.match(history, /replay\.warning\?\.createdAt/);

  assert.match(initiative, /normalizeConcentrationWarnings\(event\.data\?\.warnings, createdAt\)/);
  assert.match(initiative, /data\?\.type === "concentration-warning-history-undo"/);
  assert.match(initiative, /shouldDismissConcentrationWarningAfterUndo\(warning, cutoffAt\)/);
  assert.match(initiative, /OBR\.popover\.close\(CONCENTRATION_WARNING_MODAL_ID\)/);

  assert.match(warningUi, /createdAt: number;/);
  assert.match(warningUi, /function normalizeWarnings\(values: any\)/);
  assert.match(warningUi, /createdAt: Math\.max\(0, Math\.floor\(Number\(warning\?\.createdAt\) \|\| 0\)\)/);
});
