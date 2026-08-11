import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../src/quick-hp-modal.js", import.meta.url),
  "utf8",
);
const markup = readFileSync(
  new URL("../quick-hp-modal.html", import.meta.url),
  "utf8",
);

test("la conferma della sagoma blocca solo la selezione dei bersagli", () => {
  assert.match(source, /targetSelectionLocked = true;/);
  assert.match(source, /checkbox\.disabled = disabled \|\| busy \|\| selectionLocked;/);
  assert.match(source, /if \(disabled \|\| busy \|\| selectionLocked\) return;/);
  assert.match(
    source,
    /renderOutcomeButtons\(item, disabled \|\| \(selectionLocked && !selected\)\)/,
  );
});

test("il lock è visibile, reversibile e ignora la selezione esterna", () => {
  assert.match(markup, /id="targetLock" hidden/);
  assert.match(markup, /id="unlockTargets"/);
  assert.match(source, /if \(targetSelectionLocked\) return;/);
  assert.match(
    source,
    /unlockTargetsButton\.addEventListener\("click",[\s\S]*targetSelectionLocked = false;/,
  );
});

test("zone vuote, aure e token magici conservano il lifecycle", () => {
  assert.match(
    source,
    /&& !boardTokenPlacement\s*\n\s*&& !cloudPending\s*\n\s*\) return;/,
  );
  assert.match(
    source,
    /allowEmptyTargets:[\s\S]*cloudPending/,
  );
  assert.match(source, /castContext: mobileAuraPlacement\s*\n\s*\|\| boardTokenPlacement/);
  assert.match(source, /type: "spell-board-token:place"/);
  assert.match(source, /SPELL_ZONE_TRIGGER_WORKFLOW_ENABLED/);
});

test("il preset di una quick action legge anche il registro della stanza", () => {
  assert.match(source, /getInitiativeCard, loadInitiativeCard/);
  assert.match(source, /const profile = await loadInitiativeCard\(source\)/);
  assert.match(source, /findQuickAction\(profile, QUICK_ACTION_ID\)/);
});

test("il visual Fireball parte prima della pipeline di mutazione HP", () => {
  const noOpGuard = source.indexOf('status.textContent = "Nessuna modifica da applicare."');
  const visualStart = source.indexOf("void emitFireballVisual", noOpGuard);
  const historyStart = source.indexOf("await withItemMetaHistory", noOpGuard);

  assert.ok(noOpGuard >= 0);
  assert.ok(visualStart > noOpGuard);
  assert.ok(historyStart > visualStart);
  assert.equal(source.lastIndexOf("void emitFireballVisual"), visualStart);
});

test("Invocare il fulmine alimenta il visual persistente con il preview della nube", () => {
  assert.match(
    source,
    /if \(matchedVisualContext && spell\?\.id === "call-lightning"\) \{\s*\/\/ Il loop persistente rappresenta la nube, non la scarica istantanea\.\s*matchedVisualContext\.preview = callLightningCloudPlacement\.preview;\s*\}/,
  );
});

test("Catena di fulmini usa il primario, il riferimento temporaneo e la rivalidazione finale", () => {
  assert.match(markup, /id="chainLightningControls" hidden/);
  assert.match(markup, /id="chainPrimary"/);
  assert.match(markup, /Bersaglio primario<\/span>/);
  assert.doesNotMatch(markup, /id="chainLightningSummary"/);
  assert.match(markup, /\.chain-lightning-controls select\{[^}]*min-height:48px/);
  assert.match(markup, /\.chain-lightning-controls\{[^}]*width:min\(100%,190px\)/);
  assert.match(source, /resolveChainLightningSceneTargeting/);
  assert.match(source, /startItemInteraction\(\[reference\]\)/);
  assert.match(source, /clearChainLightningReference\(\);\r?\n  void OBR\.broadcast\.sendMessage/);
});

test("cambiando il primario Catena di fulmini la selezione viene sostituita", () => {
  assert.match(source, /selectedIds = new Set\(\[chainPrimaryId\]\);/);
  assert.match(source, /saveOutcomes\.clear\(\);/);
  assert.match(source, /updateSceneSelection\(\[chainPrimaryId\], true, true\)/);
});

test("Gabbia di forza usa una scelta di posizionamento e il contratto di contenimento", () => {
  assert.match(source, /getSpellAreaPlacementChoices/);
  assert.match(source, /ruleChoice: selectedSpellPlacementChoice\(\)/);
  assert.match(source, /pendingSpellAreaPlacement\.ruleChoice/);
});

test("il workflow TS condiviso conserva la scelta nel cast e nella singola transazione", () => {
  assert.match(source, /getSpellSaveWorkflowChoiceOptions/);
  assert.match(source, /choiceValue: selectedSaveRuleChoice\(\)/);
  assert.match(source, /await withItemMetaHistory/);
  assert.match(source, /runEffectsMutation\(coordinatedOperations, \{[\s\S]*history: false/);
  assert.match(source, /await undoHistoryThrough\(lastEntryId\)/);
});

test("il contesto per bersaglio espande la entry selezionata senza editor globale", () => {
  assert.match(markup, /target-context-submenu/);
  assert.doesNotMatch(markup, /id="targetContextEditor"/);
  assert.match(markup, /\.target-entry\{display:grid/);
  assert.match(source, /renderTargetContextFields/);
  assert.match(source, /entry\.classList\.add\("has-target-context"\)/);
  assert.match(source, /entry\.appendChild\(contextFields\)/);
});
