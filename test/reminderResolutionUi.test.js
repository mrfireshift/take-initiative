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

test("la UI integra i controlli solo nel reminder GM", () => {
  assert.match(turnNotice, /noticeRole !== "GM"[\s\S]{0,140}!row\?\.resolution[\s\S]{0,140}row\.targets\.length !== 1/);
  assert.match(turnNotice, /const RESOLUTION_BUTTON_OUTCOMES = \[/);
  assert.match(turnNotice, /for \(const outcome of RESOLUTION_BUTTON_OUTCOMES\)/);
  assert.doesNotMatch(turnNotice, /for \(const outcome of Object\.values\(REMINDER_OUTCOMES\)\)/);
  assert.doesNotMatch(turnNotice, /noticeRole === "PLAYER"[\s\S]{0,120}createElement\("button"\)/);
});

test("il rerender conserva bozza di esito e risultato dadi", () => {
  assert.match(turnNotice, /const resolutionDrafts = new Map/);
  assert.match(turnNotice, /draft\.damageRoll = damageInput\?\.value \|\| ""/);
  assert.match(turnNotice, /draft\.outcome = outcome/);
  assert.match(turnNotice, /renderSaveReminderBatch\(currentSaveReminderBatch\)/);
});

test("l'esito viene inviato direttamente dal pulsante senza conferma", () => {
  assert.match(turnNotice, /const resolve = async \(outcome: string\)/);
  assert.match(turnNotice, /button\.addEventListener\("click", \(\) => \{\s*void resolve\(outcome\);/);
  assert.doesNotMatch(turnNotice, /textContent = "Conferma"/);
  assert.doesNotMatch(turnNotice, /zone-resolution-confirm/);
});

test("una risoluzione riuscita rimuove subito il reminder risolto", () => {
  assert.match(turnNotice, /function dismissResolvedReminder\(activationId: string\)/);
  assert.match(
    turnNotice,
    /result\.status === "applied" \|\| result\.status === "already-resolved"[\s\S]{0,320}dismissResolvedReminder\(activationId\)/,
  );
  assert.match(turnNotice, /if \(!entries\.length\) \{\s*clearZoneNotice\(\);/);
});

test("un reminder GM risolvibile non avvia timer e mantiene il cambio turno come chiusura", () => {
  assert.match(turnNotice, /const requiresResolution = noticeRole === "GM"/);
  assert.match(turnNotice, /if \(!requiresResolution\) \{\s*zoneHideTimer = window\.setTimeout/);
  assert.match(turnNotice, /shouldClearZoneNoticeAtTurn\(currentZoneTurnKey, notice\.turnKey\)/);
  assert.match(turnNotice, /clearZoneNotice\(\);/);
});

test("il turn notice non ridimensiona il popover durante il bootstrap", () => {
  assert.doesNotMatch(turnNotice, /OBR\.popover\.setWidth|OBR\.popover\.setHeight/);
  assert.doesNotMatch(turnNotice, /requestTurnNoticePopoverResize/);
  assert.match(turnNotice, /type: "turn-notice-layout"/);
  assert.match(turnNotice, /visible: hasTurnNotice \|\| hasZoneNotice/);
});

test("il modal mantiene il click solo sui controlli e il layer zona sopra l'iniziativa", () => {
  assert.match(turnNoticeHtml, /#notice-stack \{[\s\S]{0,260}pointer-events: none;/);
  assert.match(turnNoticeHtml, /#app \{[\s\S]{0,180}z-index: 1;/);
  assert.match(turnNoticeHtml, /#zone-app \{[\s\S]{0,220}z-index: 3;/);
  assert.match(turnNoticeHtml, /\.zone-resolution button,[\s\S]{0,280}pointer-events: auto;/);
});
