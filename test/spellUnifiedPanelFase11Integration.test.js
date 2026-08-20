import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("gli entry point legacy spell aprono il popover canonico senza applicare", async () => {
  const [initiative, cardModal, legacyHtml, unifiedHtml] = await Promise.all([
    read("../src/initiativeList.js"),
    read("../src/initiative-card-modal.js"),
    read("../spells-modal.html"),
    read("../spell-unified-panel.html"),
  ]);

  assert.match(initiative, /buildSpellUnifiedPanelRouteQuery/);
  assert.match(initiative, /url: popupUrl/);
  assert.match(initiative, /\/spell-unified-panel\.html\$\{/);
  assert.doesNotMatch(initiative, /url:\s*`\/spells-modal\.html/);
  assert.doesNotMatch(initiative, /panel === "quick-hp" && action\?\.kind === "spell"/);
  assert.match(initiative, /const canonicalSpellRequest = spellIntent/);
  assert.match(initiative, /intent: "spell-cast",[\s\S]*panel: "spells"/);
  assert.match(initiative, /canonicalSpellRequest\.intent === "spell-cast"[\s\S]*openCardSpellsPopup\(requestedSource/);
  assert.match(initiative, /data\.panel === "quick-hp"[\s\S]*openGlobalQuickHPPopup/);
  assert.match(cardModal, /const routeRequest = action\.kind === "spell"/);
  assert.match(cardModal, /result\.route\?\.request/);
  assert.match(legacyHtml, /window\.location\.replace\(destination\)/);
  assert.match(legacyHtml, /spell-unified-panel\.html/);
  assert.doesNotMatch(legacyHtml, /spellSelect|spellSearch|applyOperation/);
  assert.match(unifiedHtml, /data-popover-id="com\.thebigpicture\.initiative\/spells-modal"/);
});

test("la Console manuale non monta preset spell o trigger all'apertura e conserva apply/undo", async () => {
  const [html, source] = await Promise.all([
    read("../quick-hp-modal.html"),
    read("../src/quick-hp-modal.js"),
  ]);
  assert.match(html, /Console effetti manuali/);
  assert.doesNotMatch(html, /areaSpellPanel|areaSpellTab|spellSearch|spellSelect/);
  assert.match(source, /async function applyOperation/);
  assert.match(source, /async function undoLastOperation/);
  assert.match(source, /withItemMetaHistory/);
  assert.match(source, /undoHistoryThrough/);
  assert.doesNotMatch(source, /areaEffectTab|SPELL_ZONE_TRIGGER_WORKFLOW_ENABLED/);
  assert.doesNotMatch(source, /import[\s\S]*SPELL_ZONE_TRIGGER_WORKFLOW_ENABLED/);
  assert.doesNotMatch(source, /OBR\.broadcast\.onMessage\(SPELL_ZONE_TRIGGER_NOTICE_CHANNEL/);
});

test("active resolution resta un popup dedicato e il pannello unificato non importa executor legacy", async () => {
  const [activeHtml, unifiedController, vite] = await Promise.all([
    read("../spell-active-resolution.html"),
    read("../src/spell-unified-panel.js"),
    read("../vite.config.js"),
  ]);
  assert.doesNotMatch(activeHtml, /Risolvi:/);
  assert.match(vite, /spellActiveResolution:\s*path\.resolve/);
  assert.match(vite, /spellUnifiedPanel:\s*path\.resolve/);
  assert.match(unifiedController, /executeSpellUnifiedActiveAction/);
  assert.doesNotMatch(unifiedController, /executeSpellApplication|applyOperation|getSpellAreaRule/);
});

test("il pannello aspetta OBR.onReady prima di leggere caster e bersagli", async () => {
  const source = await read("../src/spell-unified-panel.js");
  assert.match(source, /if \(typeof OBR\?\.onReady === "function"\) OBR\.onReady\(start\);/);
  assert.doesNotMatch(
    source,
    /querySelector\("\[data-popover-id=\\"com\.thebigpicture\.initiative\/spells-modal\\"\]"\)\) start\(\);/,
  );
});

test("il pannello può confermare o annullare il placement geometrico attivo", async () => {
  const [source, tool, placementCore] = await Promise.all([
    read("../src/spell-unified-panel.js"),
    read("../src/aoeTargetTool.js"),
    read("../src/spellAreaPlacementCore.js"),
  ]);
  assert.match(source, /SPELL_AREA_PLACEMENT_CHANNEL/);
  assert.match(source, /type, requestId/);
  assert.match(source, /onPlacementConfirm: \(\) => void sendPlacementControl\("confirm"\)/);
  assert.match(source, /onPlacementCancel: \(\) =>/);
  assert.match(source, /cancelSpellAreaPlacementRequest\(requestId/);
  assert.match(tool, /spellAreaPlacementParentUnavailable\(placementContext, parentZone, parentArea\)/);
  assert.match(placementCore, /return !!parentZoneId && \(!parentZone \|\| !parentArea\)/);
});

test("la shell mantiene dimensioni e gerarchia compatte dei pannelli originari", async () => {
  const [initiative, html, view, activeView, css] = await Promise.all([
    read("../src/initiativeList.js"),
    read("../spell-unified-panel.html"),
    read("../src/spellUnifiedPanelViewCore.js"),
    read("../src/spellUnifiedPanelEffectsView.js"),
    read("../public/spell-unified-panel.css"),
  ]);
  assert.match(initiative, /width:\s*560,\s*\n\s*height:\s*760,/);
  assert.match(html, /<h1 id="unified-panel-title">Incantesimi<\/h1>/);
  assert.doesNotMatch(view, /root\.append\(renderHero/);
  assert.match(view, /renderPlacementStage[\s\S]*renderTargetMatrix/);
  assert.match(activeView, /Incantesimi attivi sul campo/);
  assert.match(activeView, /onActiveTerminate/);
  assert.match(css, /\.unified-cast-setup/);
  assert.match(css, /\.unified-targets\.is-simple/);
  assert.match(css, /\.unified-targets\.is-simple \.unified-target-row\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto/);
  assert.doesNotMatch(css, /--unified-accent-strong:\s*#34d399/);
});

test("i popup di risoluzione geometrici espongono lo stesso ponte di conferma", async () => {
  const [active, quick, activeHtml, quickHtml] = await Promise.all([
    read("../src/spell-active-resolution.js"),
    read("../src/quick-hp-modal.js"),
    read("../spell-active-resolution.html"),
    read("../quick-hp-modal.html"),
  ]);
  assert.match(active, /confirmSpellAreaPlacementRequest/);
  assert.match(active, /createSpellAreaPlacementRequestId/);
  assert.doesNotMatch(quick, /confirmSpellAreaPlacementRequest|createSpellAreaPlacementRequestId/);
  assert.match(activeHtml, /id="confirmPlacement"/);
  assert.doesNotMatch(quickHtml, /areaPlacementConfirm|areaSpell/);
});

test("SP-B04A — la terminazione delle static zone owner-side rimuove il lifecycle dal caster", async () => {
  const source = await read("../src/spell-unified-panel.js");
  assert.match(source, /const lifecycleTargetIds = uniqueIds\(\[/);
  assert.match(source, /context\.castContext\?\.staticZoneOwner === true && casterId \? \[casterId\] : \[\]/);
  assert.match(source, /spell:remove-instance", targetIds: lifecycleTargetIds, instanceId/);
});
