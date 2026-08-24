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
const legacyResolutionHtml = readFileSync(
  new URL("../prepared-spell-resolution.html", import.meta.url),
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
  assert.match(activeResolution, /Incantesimo preparato/);
  assert.match(activeResolution, /\$\("caster"\)\.textContent = `Caster:/);
  assert.match(activeResolution, /"Pronto sul caster"/);
  assert.match(activeResolution, /executeSpellApplication/);
  assert.match(activeResolution, /\$\("attackOutcomes"\)\.hidden = true/);
  assert.match(activeResolution, /\$\("attackTitle"\)\.textContent = "Bersaglio"/);
  assert.match(activeResolution, /targetSelect\.hidden = true/);
  assert.match(activeResolution, /Bersaglio: \$\{displayName\(targets\[0\]\)\}/);
  assert.match(activeResolution, /damageInput\.closest\("\.field"\)\.hidden = !damageRequired/);
  assert.match(activeResolution, /const visible = saveRequired/);
  assert.match(activeResolution, /Danno extra · \$\{damageLabel\}/);
  assert.match(activeResolution, /\$\("attackDamage"\)\.placeholder = "Totale"/);
  assert.doesNotMatch(activeResolution, /Totale \$\{damage\.dice\} già tirato/);
  assert.doesNotMatch(activeResolution, /preparedTargetInfo/);
  assert.doesNotMatch(activeResolution, /TS già risolto al tavolo/);
  assert.doesNotMatch(activeResolution, /Il bersaglio viene considerato colpito/);
  assert.doesNotMatch(activeResolution, /Conferma l'esito del TS/);
  assert.match(activeResolution, /attackOutcome: "hit"/);
  assert.doesNotMatch(activeResolutionHtml, /id="preparedTargetInfo"/);
  assert.match(activeResolutionHtml, /id="preparedChoice"/);

  const preparedBranch = activeResolution.slice(
    activeResolution.indexOf("if (isPreparedResolution())"),
    activeResolution.indexOf("const callLightning = isCallLightning();"),
  );
  assert.doesNotMatch(preparedBranch, /Esito del colpo|Esito dell'attacco|Colpito|Mancato|Critico/);
  assert.doesNotMatch(preparedBranch, /weapon-melee|weapon-ranged|weapon/);
  assert.doesNotMatch(preparedBranch, /Risoluzione pronta|Conferma la risoluzione|Conferma il risultato del tiro già effettuato/);
  assert.match(preparedBranch, /\$\("summary"\)\.hidden = true/);
  assert.match(activeResolution, /\$\("apply"\)\.textContent = "Risolvi"/);
  assert.match(activeResolution, /Seleziona un bersaglio prima di continuare/);
  assert.match(popover, /: manual \? presentation\.text : "Risolvi"/);
  assert.match(popover, /resolveButton\.title = manual \? presentation\.title : ""/);
  assert.match(popover, /status\.textContent = ""/);
  assert.doesNotMatch(popover, /status\.textContent = currentTargetIds\.length/);
  assert.match(popover, /label: "Fallito"/);
  assert.match(popover, /label: "Superato"/);
  assert.doesNotMatch(popover, /label: "TS fallito"|label: "TS superato"/);
  assert.doesNotMatch(legacyResolutionHtml, /attackOutcome|Esito dell'attacco|Colpito|Mancato|Critico/);
  assert.match(legacyResolutionHtml, /<span id="status"><\/span>/);
  assert.match(legacyResolutionHtml, /placeholder="Totale"/);
  assert.match(popover, /attackOutcome: "hit"/);
  assert.doesNotMatch(popover, /Conferma l'esito dell'attacco|Inserisci il danno extra già tirato/);
});
