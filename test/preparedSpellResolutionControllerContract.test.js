import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const controller = readFileSync(
  new URL("../src/preparedSpellResolutionController.js", import.meta.url),
  "utf8",
);
const background = readFileSync(
  new URL("../src/background.js", import.meta.url),
  "utf8",
);
const vite = readFileSync(
  new URL("../vite.config.js", import.meta.url),
  "utf8",
);

test("il background monta il popover preparato e Vite include la sua pagina", () => {
  assert.match(background, /mountPreparedSpellResolutionController/);
  assert.match(vite, /preparedSpellResolution:\s*path\.resolve/);
});

test("l'ancoraggio fluido conserva i bounds mondo e aggiorna solo la viewport", () => {
  assert.match(controller, /const ANCHOR_POLL_MS = 40;/);
  assert.match(controller, /async function worldAnchorForCaster/);
  assert.match(controller, /runtime\.worldAnchor/);
  assert.match(controller, /OBR\.viewport\.transformPoint\(worldAnchor\)/);
  assert.doesNotMatch(
    controller,
    /refreshPreparedSpellAnchors[\s\S]*getItemBounds/,
  );
});

test("il refresh mantiene solo il lavoro più recente senza coda di frame stale", () => {
  assert.match(controller, /let controllerWorkRunning = false;/);
  assert.match(controller, /let reconcileRequested = false;/);
  assert.match(controller, /let anchorRefreshRequested = false;/);
  assert.match(controller, /if \(controllerWorkRunning\) return;/);
  assert.doesNotMatch(controller, /reconcileQueue = reconcileQueue\.then/);
});
