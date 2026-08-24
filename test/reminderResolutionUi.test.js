import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const turnNotice = readFileSync(
  new URL("../src/turn-notice.ts", import.meta.url),
  "utf8",
);
const turnNoticeHtml = readFileSync(
  new URL("../turn-notice.html", import.meta.url),
  "utf8",
);
const historySource = readFileSync(
  new URL("../src/history.js", import.meta.url),
  "utf8",
);
const reminderRender = turnNotice.slice(
  turnNotice.indexOf("function renderSaveReminderBatch(batch: any)"),
  turnNotice.indexOf("function flushSaveReminderNotices()"),
);

test("la UI integra i controlli solo nel reminder GM", () => {
  assert.match(turnNotice, /function reminderRowRequiresResponse\(row: any\)/);
  assert.match(turnNotice, /noticeRole === "GM"/);
  assert.match(turnNotice, /!!row\?\.resolution/);
  assert.match(turnNotice, /row\.targets\.length === 1/);
  assert.match(turnNotice, /if \(!reminderRowRequiresResponse\(row\)\) return;/);
  assert.match(turnNotice, /const RESOLUTION_BUTTON_OUTCOMES = \[/);
  assert.match(turnNotice, /for \(const option of outcomeOptions\)/);
  assert.doesNotMatch(turnNotice, /dismissOnly/);
  assert.doesNotMatch(turnNotice, /button\.textContent = dismissOnly \? "Chiudi"/);
  assert.doesNotMatch(turnNotice, /for \(const outcome of Object\.values\(REMINDER_OUTCOMES\)\)/);
  assert.doesNotMatch(turnNotice, /noticeRole === "PLAYER"[\s\S]{0,120}createElement\("button"\)/);
});

test("il rerender conserva bozza di esito e risultato dadi", () => {
  assert.match(turnNotice, /const resolutionDrafts = new Map/);
  assert.match(turnNotice, /draft\.damageRoll = damageInput\?\.value \|\| ""/);
  assert.match(turnNotice, /draft\.outcome = outcome/);
  assert.match(turnNotice, /renderSaveReminderBatch\(currentSaveReminderBatch\)/);
});

test("un esito a danno zero può essere risolto senza compilare il campo dadi", () => {
  assert.match(turnNotice, /reminderResolutionOutcomeNeedsDamage/);
  assert.match(
    turnNotice,
    /damageInput[\s\S]{0,240}manualHeal[\s\S]{0,140}reminderResolutionOutcomeNeedsDamage\(row\.resolution, outcome\)[\s\S]{0,180}Inserisci un risultato dei dadi valido/,
  );
});

test("i TS mantengono i pulsanti diretti e il danno automatico usa Conferma", () => {
  assert.match(turnNotice, /const resolve = async \(outcome: string\)/);
  assert.match(turnNotice, /button\.addEventListener\("click", \(event\) => \{\s*event\.stopPropagation\(\);\s*void resolve\(option\.value\);/);
  assert.match(turnNotice, /row\.resolution\?\.mode === "manual-damage"/);
  assert.match(turnNotice, /label: "Conferma"/);
});

test("una risoluzione riuscita rimuove subito il reminder risolto", () => {
  assert.match(turnNotice, /function dismissResolvedReminder\(activationId: string, \{ zone = false \} = \{\}\)/);
  assert.match(
    turnNotice,
    /result\.status === "applied" \|\| result\.status === "already-resolved"[\s\S]{0,520}dismissResolvedReminder\(activationId,/,
  );
  assert.match(turnNotice, /if \(!entries\.length\) \{\s*clearZoneNotice\(\);/);
});

test("i reminder con risposta GM restano aperti senza timer automatico", () => {
  assert.match(turnNotice, /function reminderRowRequiresResponse\(row: any\)/);
  assert.match(turnNotice, /if \(!reminderRowRequiresResponse\(row\)\) return;/);
  assert.match(turnNotice, /const requiresResponse = presentation\.rows\.some\(reminderRowRequiresResponse\)/);
  assert.match(turnNotice, /row\.resolution\?\.mode !== "consume"/);
  assert.match(reminderRender, /if \(!requiresResponse && !hasPersistentReminder\) \{[\s\S]*?panel\.appendChild\(timer\)[\s\S]*?zoneHideTimer = window\.setTimeout/);
  assert.doesNotMatch(turnNotice, /textContent = "Chiudi"/);
  assert.match(turnNotice, /shouldClearZoneNoticeAtTurn\(currentZoneTurnKey, notice\.turnKey\)/);
  assert.match(turnNotice, /clearZoneNotice\(\);/);
});

test("il turn notice non ridimensiona il popover durante il bootstrap", () => {
  assert.doesNotMatch(turnNotice, /OBR\.popover\.setWidth|OBR\.popover\.setHeight/);
  assert.doesNotMatch(turnNotice, /requestTurnNoticePopoverResize/);
  assert.match(turnNotice, /type: "turn-notice-layout"/);
  assert.match(turnNotice, /visible: hasTurnNotice \|\| hasZoneNotice/);
  assert.match(turnNotice, /layoutRevision,/);
  assert.match(turnNotice, /const layoutRevision = \+\+noticeLayoutRevision/);
});

test("il modal mantiene il click solo sui controlli e il layer zona sopra l'iniziativa", () => {
  assert.match(turnNoticeHtml, /#notice-stack \{[\s\S]{0,260}pointer-events: none;/);
  assert.match(turnNoticeHtml, /#app \{[\s\S]{0,180}z-index: 1;/);
  assert.match(turnNoticeHtml, /#zone-app \{[\s\S]{0,220}z-index: 3;/);
  assert.match(turnNoticeHtml, /\.zone-resolution button,[\s\S]{0,280}pointer-events: auto;/);
});

test("un reminder consumabile resta visibile senza barra o timer automatico", () => {
  assert.match(turnNotice, /row\.resolution\?\.mode !== "consume"/);
  assert.match(
    reminderRender,
    /const hasPersistentReminder = presentation\.rows\.some\(\(row: any\) =>\s*row\.resolution\?\.mode === "consume"\s*\);/,
  );
  assert.match(reminderRender, /if \(!requiresResponse && !hasPersistentReminder\) \{/);
  assert.doesNotMatch(turnNotice, /textContent = "Chiudi"/);
});


test("un reminder in aggregazione mantiene visibile il turn-notice host fino al render", () => {
  assert.match(
    turnNotice,
    /const hasPendingSaveReminder = pendingSaveReminderNotices\.length > 0 \|\| saveReminderAggregationTimer !== 0;/,
  );
  assert.match(
    turnNotice,
    /const hasZoneNotice = !!currentZonePanel \|\| hasPendingSaveReminder;/,
  );
  assert.match(
    turnNotice,
    /if \(!batch \|\| !renderSaveReminderBatch\(batch\)\) \{[\s\S]{0,120}announceNoticeLayout\(\{ force: true \}\);/,
  );
});

test("la baseline delle zone non consuma il payload live che apre il popover", () => {
  assert.match(
    turnNotice,
    /planZoneTriggerNoticeDelivery\([\s\S]{0,180}\{ baseline \},[\s\S]{0,80}if \(baseline\) return;/,
  );
  assert.doesNotMatch(
    turnNotice,
    /if \(baseline\) \{[\s\S]{0,160}rememberAnnouncementIds\(announcedZoneActivationIds/,
  );
});
test("Undo di una risoluzione zona può riannunciare lo stesso activationId", () => {
  assert.match(turnNotice, /dismissResolvedReminder\(activationId: string, \{ zone = false \} = \{\}\)/);
  assert.match(turnNotice, /if \(zone\) announcedZoneActivationIds\.delete\(activationId\);/);
  assert.match(turnNotice, /zone: row\?\.resolution\?\.activation\?\.kind === "zone"/);
  assert.match(turnNotice, /const items = await OBR\.scene\.items\.getItems\(\);/);
  assert.match(turnNotice, /for \(const activationId of \[\.\.\.announcedZoneActivationIds\]\) \{[\s\S]{0,160}!pendingIds\.has\(activationId\)[\s\S]{0,120}announcedZoneActivationIds\.delete\(activationId\)/);
  assert.match(turnNotice, /unsubscribeZoneItemChanges = subscribeSceneItemChanges\(\(\) => \{[\s\S]{0,100}requestPendingZoneNoticeSync\(\);/);
});

test("il riarmo generico avviene solo nel payload canonico successivo", () => {
  assert.match(
    turnNotice,
    /Array\.isArray\(raw\?\.rearmActivationIds\)[\s\S]{0,260}announcedEffectActivationIds\.delete\(notice\.activationId\)/,
  );
  const dismissBlock = turnNotice.slice(
    turnNotice.indexOf("function dismissResolvedReminder"),
    turnNotice.indexOf("function buildResolutionControls"),
  );
  assert.doesNotMatch(dismissBlock, /announcedEffectActivationIds\.delete/);
});

test("il Turn Notice elimina gli effect-save replay che non sono più canonici", () => {
  assert.match(turnNotice, /function currentEffectSaveReminderActivationIds/);
  assert.match(turnNotice, /effectSaveReminderNoticeFromHistoryReplay\(\{ replay, items \}\)/);
  assert.match(turnNotice, /pruneEffectSaveReminderNoticeBatch\(/);
  assert.match(turnNotice, /announcedEffectActivationIds\.delete\(activationId\)/);
});

test("History indirizza le activation di aura mobile al relativo owner", () => {
  assert.match(
    turnNotice,
    /activation\.metadataKey === SPELL_AURA_META_KEY[\s\S]{0,80}\? "spell-aura"/,
  );
  assert.match(historySource, /replay\.owner === "spell-aura"/);
});
