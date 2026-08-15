import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function file(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("il gate browser usa il vero history modal e un fake OBR solo test-only", () => {
  const frame = file("../test-support/combat-log-browser/frame.html");
  const fake = file("../test-support/combat-log-browser/fake-obr-sdk.js");
  const modal = file("../src/history-modal.ts");
  assert.match(frame, /src="\/history-modal\.html\?fixture=browser"/u);
  assert.match(frame, /width: 480px/u);
  assert.match(frame, /height: 640px/u);
  assert.match(fake, /createPerformanceObr/u);
  assert.match(fake, /causality/u);
  assert.match(fake, /5_000/u);
  assert.match(fake, /__combat-log-browser-append/u);
  assert.match(fake, /__combat-log-browser-refresh/u);
  assert.match(fake, /__combat-log-browser-fail-page/u);
  assert.match(modal, /Carica eventi precedenti/u);
  assert.match(modal, /Carica tutto/u);
  assert.match(modal, /importCombatLogJSON/u);
  assert.match(modal, /previewCombatLogRetention/u);
  assert.doesNotMatch(modal, /fake-obr|combat-log-browser/u);
});
