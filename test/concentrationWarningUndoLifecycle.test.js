import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildConcentrationSaveWarning,
  concentrationSaveWarningsForItems,
} from "../src/concentrationSaveReminderCore.js";

test("il warning conserva l'ID History causale senza dipendere dai timestamp", () => {
  const warning = buildConcentrationSaveWarning({
    casterId: "caster",
    concentration: { bless: { instanceId: "bless-1", name: "Benedizione" } },
    damage: 12,
    causeHistoryEntryId: " history-entry-1 ",
  });

  assert.equal(warning.notice.causeHistoryEntryId, "history-entry-1");
  assert.equal(buildConcentrationSaveWarning({
    casterId: "caster",
    concentration: { bless: { instanceId: "bless-1" } },
    damage: 12,
  }).notice.causeHistoryEntryId, undefined);
});

test("la generazione batch propaga lo stesso ID History causale", () => {
  const warnings = concentrationSaveWarningsForItems({
    items: [{
      id: "caster",
      metadata: {
        "com.thebigpicture.initiative/meta": {
          "com.thebigpicture.initiative/concentration": {
            bless: { instanceId: "bless-1", name: "Benedizione" },
          },
        },
      },
    }],
    changes: [{ itemId: "caster", damage: 12 }],
    causeHistoryEntryId: "history-entry-2",
  });

  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].notice.causeHistoryEntryId, "history-entry-2");
});

test("History e host collegano il lifecycle del popup agli ID delle entry annullate", () => {
  const history = readFileSync(new URL("../src/history.js", import.meta.url), "utf8");
  const initiative = readFileSync(new URL("../src/initiativeList.js", import.meta.url), "utf8");

  assert.match(history, /dismissConcentrationWarningsCausedByEntries\(undoOrder, sceneEpoch\)/);
  assert.match(history, /type: "dismiss-concentration-warnings-by-history"/);
  assert.match(history, /historyEntryIds,/);
  assert.match(history, /causeHistoryEntryId && undoEntryIds\.has\(causeHistoryEntryId\)/);

  assert.match(initiative, /function dismissConcentrationWarningsByHistoryEntryIds\(/);
  assert.match(initiative, /warning\?\.notice\?\.causeHistoryEntryId/);
  assert.match(initiative, /__dismissedConcentrationWarningCauseIds\.has\(causeHistoryEntryId\)/);
  assert.match(initiative, /"dismiss-concentration-warnings-by-history"/);
});
