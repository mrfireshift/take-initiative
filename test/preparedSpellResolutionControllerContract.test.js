import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const controller = readFileSync(
  new URL("../src/preparedSpellResolutionController.js", import.meta.url),
  "utf8",
);
const popover = readFileSync(
  new URL("../src/prepared-spell-resolution.js", import.meta.url),
  "utf8",
);
const unifiedPanel = readFileSync(
  new URL("../src/spell-unified-panel.js", import.meta.url),
  "utf8",
);
const activeAdapter = readFileSync(
  new URL("../src/spellUnifiedActiveAdapter.js", import.meta.url),
  "utf8",
);
const activeResolution = readFileSync(
  new URL("../src/spell-active-resolution.js", import.meta.url),
  "utf8",
);
const activeResolutionHtml = readFileSync(
  new URL("../spell-active-resolution.html", import.meta.url),
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

test("popover e pannello condividono lo stesso executor delle azioni attive", () => {
  assert.match(popover, /executeSpellActiveAction/);
  assert.match(unifiedPanel, /executeSpellUnifiedActiveAction/);
  assert.match(activeAdapter, /importedExecutor\("executeSpellActiveAction"\)/);
  assert.doesNotMatch(unifiedPanel, /spells-panel\.js/);
});

test("le preparazioni usano il popup mobile shared e non il route legacy ancorato", () => {
  assert.match(activeAdapter, /urlBase = "\/spell-active-resolution\.html"/);
  assert.match(activeAdapter, /mode: "prepared"/);
  assert.match(controller, /buildSpellUnifiedPreparedPopoverRequest/);
  assert.match(controller, /SPELL_UNIFIED_PREPARED_AREA_SPELL_IDS/);
  assert.match(controller, /openTrackedPopover/);
  assert.match(controller, /action\?\.type === "resolve" \|\| action\?\.type === "manual"/);
  assert.match(controller, /actionType !== "resolve" && actionType !== "manual"/);
  assert.match(controller, /createSceneMetadataKeyWatcher/);
  assert.match(controller, /currentTurnActorId/);
  assert.match(activeResolution, /isPreparedResolution/);
  assert.match(activeResolution, /executeSpellActiveAction/);
  assert.match(activeResolution, /action\?\.type === "manual"/);
  assert.match(activeResolution, /"Pronto sul caster"/);
  assert.match(activeResolution, /executeSpellApplication/);
  assert.match(activeResolution, /\$\("attackOutcomes"\)\.hidden = true/);
  assert.match(activeResolution, /"Bersaglio colpito: " \+ displayName\(targets\[0\]\)/);
  assert.match(activeResolution, /\$\("attackDamage"\)\.placeholder = "Totale"/);
  assert.doesNotMatch(activeResolution, /Totale \$\{damage\.dice\} già tirato/);
  assert.doesNotMatch(activeResolution, /preparedTargetInfo/);
  assert.doesNotMatch(activeResolution, /TS già risolto al tavolo/);
  assert.doesNotMatch(activeResolution, /Il bersaglio viene considerato colpito/);
  assert.doesNotMatch(activeResolution, /Conferma l'esito del TS/);
  assert.match(activeResolution, /attackOutcome: "hit"/);
  assert.doesNotMatch(activeResolutionHtml, /id="preparedTargetInfo"/);
  assert.match(activeResolutionHtml, /id="preparedChoice"/);
});
