import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(
  new URL("../initiative-card-modal.html", import.meta.url),
  "utf8",
);
const source = readFileSync(
  new URL("../src/initiative-card-modal.js", import.meta.url),
  "utf8",
);
const trackerSource = readFileSync(
  new URL("../src/initiativeList.js", import.meta.url),
  "utf8",
);

test("la Scheda iniziativa espone tre tab accessibili", () => {
  assert.match(html, /class="card-tabs"\s+role="tablist"/);
  assert.match(html, /id="statsTab"[^>]*role="tab"[^>]*aria-controls="view"/);
  assert.match(html, /id="quickActionsTab"[^>]*role="tab"[^>]*aria-controls="quickActionsView"/);
  assert.match(html, /id="classFeaturesTab"[^>]*role="tab"[^>]*aria-controls="classFeaturesView"/);
  assert.match(html, /id="view"[^>]*role="tabpanel"[^>]*aria-labelledby="statsTab"/);
  assert.match(html, /id="quickActionsView"[^>]*role="tabpanel"[^>]*aria-labelledby="quickActionsTab"/);
  assert.match(html, /id="classFeaturesView"[^>]*role="tabpanel"[^>]*aria-labelledby="classFeaturesTab"/);
});

test("scheda e card osservano la stessa modifica metadata delle capacita", () => {
  assert.match(source, /function subscribeToSourceItemChanges\(\)/);
  assert.match(source, /OBR\.scene\.items\.onChange\(\(items\) =>/);
  assert.match(source, /function subscribeToSceneStateChanges\(\)/);
  assert.match(source, /OBR\.scene\.onMetadataChange\(\(metadata\) =>/);
  assert.match(source, /profile = getInitiativeCard\(item\);[\s\S]*?renderView\(\);/);
  assert.match(trackerSource, /deactivateClassFeature\(sourceId, instanceId\)/);
  assert.match(trackerSource, /renderAll\("class-feature-context-deactivate"\)/);
  assert.match(trackerSource, /renderAll\("class-feature-quick-action"\)/);
});

test("il dialog ATTIVE consente di terminare anche un'aura dal GM", () => {
  assert.match(source, /if \(isGM\) \{[\s\S]*?class-feature-end/);
  assert.match(source, /deactivateClassFeature\(item\.id, instance\.instanceId\)/);
});

test("statistiche, azioni rapide e capacità vivono in pannelli distinti", () => {
  const statsViewStart = html.indexOf('id="view"');
  const quickViewStart = html.indexOf('id="quickActionsView"');
  const quickBlockStart = html.indexOf('id="quickActionsBlock"');
  const featuresViewStart = html.indexOf('id="classFeaturesView"');
  assert.ok(statsViewStart >= 0);
  assert.ok(quickViewStart > statsViewStart);
  assert.ok(quickBlockStart > quickViewStart);
  assert.ok(featuresViewStart > quickBlockStart);
  assert.match(html, /id="statsEditPane"\s+class="edit-pane"/);
  assert.match(html, /id="quickActionsEditPane"\s+class="quick-actions-editor edit-pane"/);
  assert.match(html, /id="classFeaturesEditPane"\s+class="edit-pane"/);
});

test("il cambio tab sincronizza vista, editor e altezza del popover", () => {
  assert.match(source, /let activeCardTab = "stats"/);
  assert.match(source, /function syncCardTabs\(\)/);
  assert.match(source, /\$\("view"\)\.hidden = editing \|\| !statsActive/);
  assert.match(source, /\$\("quickActionsView"\)\.hidden = editing \|\| !quickActionsActive/);
  assert.match(source, /\$\("classFeaturesView"\)\.hidden = editing \|\| !classFeaturesActive/);
  assert.match(source, /\$\("statsTab"\)\.addEventListener\("click", \(\) => setCardTab\("stats"\)\)/);
  assert.match(source, /\$\("quickActionsTab"\)\.addEventListener\("click", \(\) => setCardTab\("quick-actions"\)\)/);
  assert.match(source, /\$\("classFeaturesTab"\)\.addEventListener\("click", \(\) => setCardTab\("class-features"\)\)/);
  assert.match(source, /\$\("attacksView"\)\.hidden = editing \|\| !attacksActive/);
  assert.match(source, /\$\("attacksTab"\)\.addEventListener\("click", \(\) => setCardTab\("attacks"\)\)/);
  assert.match(source, /classFeaturesActive \? 760 : quickActionsActive \|\| attacksActive \? 680 : 640/);
});

test("la Scheda iniziativa apre più alta senza ampliare gli altri popover", () => {
  assert.match(trackerSource, /url: `\/initiative-card-modal\.html\?source=\$\{encodeURIComponent\(sourceId\)\}\$\{quickActionId \? `[\s\S]*?` : ""\}`,[\s\S]*?height: 560/);
  assert.match(trackerSource, /data\.id === `\$\{ID\}\/initiative-card-modal` \? 760 : 560/);
});

test("l'editor salva build multiclasse e capacità abilitate", () => {
  assert.match(html, /id="characterBuildLine"/);
  assert.match(html, /id="classBuildEditorList"/);
  assert.match(html, /id="classFeatureEditorList"/);
  assert.match(source, /const characterBuild = collectCharacterBuildEditor\(\{ validate: true \}\)/);
  assert.match(source, /enabledClassFeatureIds: collectEnabledClassFeatureIds\(characterBuild\)/);
  assert.match(source, /classFeaturesConfigured: true/);
});

test("la Scheda iniziativa importa tutti gli helper Class Feature usati nel render risorse", () => {
  const coreImport = source.match(
    /import\s*\{([\s\S]*?)\}\s*from\s*"\.\/classFeatureCore\.js";/,
  )?.[1] || "";

  for (const helper of [
    "classFeatureResourceEntries",
    "resolveClassFeatureResourceMaximum",
    "resolveClassFeatureResourceDie",
  ]) {
    assert.match(coreImport, new RegExp(`\\b${helper}\\b`), `${helper} deve essere importato da classFeatureCore.js`);
    assert.match(source, new RegExp(`${helper}\\s*\\(`), `${helper} deve essere realmente usato dalla Scheda iniziativa`);
  }
});

test("gli attacchi hanno una scheda, un elenco e un editor propri, separati dalle azioni rapide", () => {
  assert.match(html, /id="attacksTab"[^>]*aria-controls="attacksView"[^>]*hidden/);
  assert.match(html, /id="attacksTabCount"/);
  assert.match(html, /id="attacks" class="quick-actions-list"/);
  assert.match(html, /id="attacksEditPane"/);
  assert.match(html, /id="attackEditorList"/);
  assert.match(html, /id="attackAdd"/);
  // The quick action editor no longer offers attacks; attack rows have the kind fixed.
  assert.match(source, /selectControl\(attackRow \? \[\["attack", "Attacco"\]\] : \[\s*\["spell", "Incantesimo"\],\s*\["condition", "Condizione"\],\s*\["feature", "Capacità di classe"\],\s*\]/);
  assert.match(source, /\$\("attacksTab"\)\.hidden = !isGM/);
  assert.match(source, /buildQuickActionEditorRow\(action, \{ attack: true \}\)/);
  assert.match(source, /\.\.\.\$\("attackEditorList"\)\.querySelectorAll\("\[data-quick-action-row='1'\]"\)/);
});

test("la scheda Attacchi importa un blocco come righe dell'editor, senza salvare né duplicare", () => {
  assert.match(html, /id="attackImportToggle"[^>]*aria-controls="attackImport"/);
  assert.match(html, /id="attackImport" class="attack-import" hidden/);
  assert.match(html, /id="attackImportText"/);
  assert.match(html, /id="attackImportApply"/);
  assert.match(source, /parseQuickActionAttackImport\(\$\("attackImportText"\)\.value\)/);
  assert.match(source, /if \(names\.has\(nameKey\(attack\.label\)\)\) \{\s*duplicates \+= 1;/);
  assert.match(source, />= MAX_QUICK_ACTION_ATTACKS\) \{\s*overLimit \+= 1;/);
  assert.match(source, /buildQuickActionEditorRow\(\{ \.\.\.attack, id: quickActionId\(\) \}, \{ attack: true \}\)/);
  assert.match(source, /\$\("attackImportApply"\)\.addEventListener\("click", importAttacks\)/);
});
