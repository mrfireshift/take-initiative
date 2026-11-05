import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const controller = readFileSync(
  new URL("../src/preparedSpellResolutionController.js", import.meta.url),
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
  assert.match(vite, /spellActiveResolution:\s*path\.resolve/);
});

test("il popup si apre accanto al caster e poi resta dove lo mette il GM", () => {
  assert.match(controller, /async function worldAnchorForCaster/);
  assert.match(controller, /OBR\.viewport\.transformPoint\(worldAnchor\)/);
  assert.match(controller, /if \(opened\.has\(instanceId\)\) return;/);
  assert.doesNotMatch(controller, /setInterval|ANCHOR_POLL_MS|refreshPreparedSpellAnchors/, "nessun timer: era solo della pagina ancorata");
});

test("V11: la pagina morta non c'è più, e nessuno può aprirla", () => {
  for (const path of ["../prepared-spell-resolution.html", "../src/prepared-spell-resolution.js"]) {
    assert.equal(existsSync(new URL(path, import.meta.url)), false, path);
  }
  assert.doesNotMatch(controller, /prepared-spell-resolution\.html/);
  assert.doesNotMatch(vite, /prepared-spell-resolution\.html|preparedSpellResolution:/);
  assert.match(activeResolution, /PREPARED_SPELL_RESOLUTION_CHANNEL/, "il canale di sincronizzazione resta: lo usa il popup comune");
});

test("il refresh mantiene solo il lavoro più recente senza coda di frame stale", () => {
  assert.match(controller, /let controllerWorkRunning = false;/);
  assert.match(controller, /let reconcileRequested = false;/);
  assert.match(controller, /if \(controllerWorkRunning\) return;/);
  assert.doesNotMatch(controller, /reconcileQueue = reconcileQueue\.then/);
});

test("popover e pannello condividono lo stesso executor delle azioni attive", () => {
  assert.match(activeResolution, /executeSpellActiveAction/);
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
  assert.match(controller, /\.filter\(\(group\) => currentTurnActorId\s*&& String\(group\?\.casterId \|\| ""\)\.trim\(\) === currentTurnActorId\)/);
  assert.match(controller, /createSceneMetadataKeyWatcher/);
  assert.match(controller, /currentTurnActorId/);
  assert.match(activeResolution, /isPreparedResolution/);
  assert.match(activeResolution, /executeSpellActiveAction/);
  assert.match(activeResolution, /action\?\.type === "manual"/);
  assert.match(activeResolution, /const casterName = String\(payload\.casterName/);
  assert.match(activeResolution, /"Pronto sul caster"/);
  assert.match(activeResolution, /executeSpellApplication/);
  assert.match(activeResolution, /\$\("attackOutcomes"\)\.hidden = true/);
  assert.match(activeResolution, /\$\("attackTitle"\)\.textContent = "Bersaglio"/);
  assert.match(activeResolution, /targetSelect\.hidden = true/);
  assert.match(activeResolution, /formatCompactTarget\(displayName\(targets\[0\]\)\)/);
  assert.match(activeResolution, /damageInput\.closest\("\.field"\)\.hidden = !damageRequired/);
  assert.match(activeResolution, /const visible = saveRequired/);
  assert.match(activeResolution, /renderAmountLabel\(\$\("attackDamageLabel"\), damage\?\.type, damage\?\.dice\)/);
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
  assert.match(activeResolution, /\$\("apply"\)\.textContent = "Risolvi"/);
  assert.match(activeResolution, /Seleziona un bersaglio prima di continuare/);
});
