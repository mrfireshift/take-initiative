import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const controller = readFileSync(
  new URL("../src/effectSaveReminderController.js", import.meta.url),
  "utf8",
);
const background = readFileSync(
  new URL("../src/background.js", import.meta.url),
  "utf8",
);
const initiative = readFileSync(
  new URL("../src/initiativeList.js", import.meta.url),
  "utf8",
);
const quickHP = readFileSync(
  new URL("../src/quick-hp-modal.js", import.meta.url),
  "utf8",
);
const turnNotice = readFileSync(
  new URL("../src/turn-notice.ts", import.meta.url),
  "utf8",
);
const turnNoticeHost = readFileSync(
  new URL("../src/turnNoticeHost.js", import.meta.url),
  "utf8",
);

test("il background monta il controller GM e serializza gli avanzamenti", () => {
  assert.match(background, /mountEffectSaveReminderController/);
  assert.match(controller, /OBR\.player\.getRole\(\)/);
  assert.match(controller, /OBR\.scene\.onMetadataChange\(enqueueReconcile\)/);
  assert.match(controller, /reconcileQueue = reconcileQueue\.then\(run, run\)/);
  assert.match(controller, /announcedActivationIds\.has\(notice\.activationId\)/);
  assert.match(controller, /currentSceneEpoch/);
  assert.match(controller, /isCurrentSceneEpoch\(sceneEpoch\)/);
  assert.match(controller, /includeCurrentTurnStart: previousState !== null/);
});

test("i due percorsi canonici del danno emettono reminder indipendenti dalla concentrazione", () => {
  assert.match(initiative, /effectSaveReminderNoticesForDamage\(\{/);
  assert.match(initiative, /EFFECT_SAVE_REMINDER_NOTICE_CHANNEL/);
  assert.match(initiative, /await Promise\.all\(broadcasts\)/);
  assert.match(quickHP, /showEffectSaveDamageWarnings\(entries\)/);
  assert.match(quickHP, /EFFECT_SAVE_REMINDER_NOTICE_CHANNEL/);
});

test("il layer piccolo ascolta i reminder effetto anche prima del gate delle zone", () => {
  const listener = turnNotice.indexOf(
    'data?.type === "show-effect-save-notices"',
    turnNotice.indexOf("OBR.onReady(() => {"),
  );
  const zoneGate = turnNotice.indexOf(
    "if (!SPELL_ZONE_TRIGGER_WORKFLOW_ENABLED) return;",
  );
  assert.ok(listener >= 0);
  assert.ok(zoneGate > listener);
  assert.match(
    turnNoticeHost,
    /OBR\.broadcast\.onMessage\(EFFECT_SAVE_REMINDER_NOTICE_CHANNEL/,
  );
  assert.match(
    turnNotice,
    /kind:\s*informational\s*\?\s*"effect-reminder"\s*:\s*"effect-save"/,
  );
  assert.match(turnNotice, /showEffectSaveNotices\(data\)/);
});
