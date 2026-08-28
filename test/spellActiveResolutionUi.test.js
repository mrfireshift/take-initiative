import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const popupHtml = read("../spell-active-resolution.html");
const popupController = read("../src/spell-active-resolution.js");
const aoeTargetTool = read("../src/aoeTargetTool.js");
const unifiedPanel = read("../src/spell-unified-panel.js");
const activeAdapter = read("../src/spellUnifiedActiveAdapter.js");
const unifiedPanelView = read("../src/spellUnifiedPanelViewCore.js");
const executor = read("../src/spellApplicationExecutor.js");
const validation = read("../src/spellActiveResolutionValidation.js");
const popoverDrag = read("../src/popoverDrag.js");
const quickHp = read("../src/quick-hp-modal.js");
const vite = read("../vite.config.js");

function section(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0, `marker iniziale assente: ${start}`);
  assert.ok(to > from, `marker finale assente: ${end}`);
  return source.slice(from, to);
}

test("le attivazioni usano un popup dedicato e non la Console HP", () => {
  assert.doesNotMatch(popupHtml, /Risolvi:/);
  assert.doesNotMatch(popupController, /`Risolvi: \${payload\.spellName/);
  assert.match(popupHtml, /id="close"/);
  assert.match(popupHtml, /id="apply"[^>]*>Cura</);
  assert.match(popupHtml, /class="topline"><div id="eyebrow"/);
  assert.match(popupHtml, /class="topline">[\s\S]*<button id="close"/);
  assert.match(popupHtml, /id="footer" class="footer"><button id="apply"/);
  assert.match(popupController, /requestSpellAreaPlacement/);
  assert.match(popupController, /executeSpellActiveResolution/);
  assert.match(popupController, /Sagoma confermata\. I bersagli sono ora bloccati/);
  assert.match(popupHtml, /\[hidden\]\s*\{\s*display:\s*none\s*!important/);
  assert.match(popupHtml, /id="saveTitle"/);
  assert.match(popupHtml, /id="attackTitle"/);
  assert.match(popupHtml, /id="singleHealSection"/);
  assert.match(popupHtml, /id="singleHealTitle" class="section-title">Bersaglio: —<\/div>/);
  assert.doesNotMatch(popupHtml, /<select id="healTarget"/);
  assert.match(popupHtml, /id="healAmountLabel"[^>]*>Cura · 2d6<\/label>/);
  assert.match(popupHtml, /id="healAmount"/);
  assert.match(popupHtml, /id="footer"/);
  assert.doesNotMatch(popupHtml, /id="rootNote"/);
  assert.match(popupHtml, /rgba\(76,29,149,.32\)/);
  assert.match(popupHtml, /backdrop-filter:\s*blur\(6px\) saturate\(120%\)/);
  assert.match(popupHtml, /id="status" class="status" hidden><\/div>/);
  assert.match(popupHtml, /id="damageField" class="field" hidden/);
  assert.match(popupHtml, /data-drag-handle draggable="true"/);
  assert.doesNotMatch(popupHtml, /naturalStorm/);
  assert.match(popupController, /isCallLightning/);
  assert.match(popupController, /isFlameInvestiture/);
  assert.match(popupController, /Posiziona la linea di fuoco/);
  assert.match(popupController, /Linea di fuoco confermata\. I bersagli sono ora bloccati/);
  assert.match(popupController, /\$\("saveTitle"\)\.hidden = callLightning/);
  assert.match(popupController, /targets\.length\} bersagli/);
  assert.match(popupController, /\$\("damageField"\)\.hidden = child \|\| targets\.length === 0/);
  assert.match(popupController, /\$\{childLabel\} \$\{childPlacements\.length\} di/);
  assert.match(popupController, /depthRoll/);
  assert.match(popupController, /dataset\.popoverId/);
  assert.match(popupController, /OBR\.player\.onChange/);
  assert.match(popupController, /OBR\.player\.getSelection/);
  assert.match(popupController, /OBR\.popover\.setHeight/);
  assert.match(popupController, /initializePopoverDrag/);
  assert.match(popupController, /void apply\(\)/);
  assert.match(popupController, /button\.addEventListener\("click", \(event\) => \{\s*event\.stopPropagation\(\);/);
  assert.match(popupController, /\$\("footer"\)\.hidden = !save/);
  assert.match(popupController, /isMultiAttack/);
  assert.match(popupController, /attackEntries/);
  assert.match(popupController, /Applica attacchi/);
  assert.match(popupController, /dalla mano/);
  assert.match(popupController, /select\.hidden = automaticRequiredTarget/);
  assert.match(popupController, /Bersaglio: \${displayName\(entries\[0\]\)}/);
  assert.match(popupController, /manualSaveAtTable/);
  assert.match(popupController, /singleSaveOutcomes/);
  assert.match(popupController, /:\s*"Bersaglio: —"/);
  assert.match(popupController, /Bersaglio: \$\{displayName\(entries\[0\]\)\}/);
  assert.doesNotMatch(popupController, /\$\("healTarget"\)/);
  assert.match(popupController, /\$\("eyebrow"\)\.textContent[\s\S]*?"Aura Attiva"/);
  assert.match(popupController, /`Cura · \$\{healingFormula\}`/);
  assert.match(popupController, /\$\("apply"\)\.textContent = "Cura"/);
  assert.doesNotMatch(popupController, /Inserisci il totale curato/);
  assert.doesNotMatch(popupController, /Bersaglio attualmente nell'aura\./);
  assert.match(popupController, /function isSingleHeal/);
  assert.match(popupController, /singleHealTargetData/);
  assert.match(popupController, /payload\.action\.resolutionKind === "single-heal"/);
  assert.match(popupController, /mobileAuraTargetIds/);
  assert.match(popupController, /gridPlanarDistance/);
  assert.match(validation, /payload\.action\.rangeOrigin === "root"/);
  assert.match(popupController, /excludedTargetEffectIds/);
  assert.match(validation, /excludedTargetEffectIds/);
  assert.match(popupController, /payload\?\.action\?\.excludeAnchorTarget !== true/);
  assert.match(validation, /action\.excludeAnchorTarget === true/);
  assert.match(popupController, /onProgress: anchoredArea/);
  assert.match(popupController, /pendingPlacementPromise/);
  assert.match(popupController, /desiredAnchoredTargetId/);
  assert.match(popupController, /if \(anchoredArea\) \{\s*const allowedIds = new Set\(placement\.targetIds\)/);
  assert.match(aoeTargetTool, /const anchoredPreview = runtime\?\.context\?\.autoConfirmAnchor === true/);
  assert.match(aoeTargetTool, /const targetIds = await findHitTargetIds\(area, spellPlacementSession\.rule\)/);
  assert.match(aoeTargetTool, /await sendSpellPlacementProgress\(spellPlacementSession\)/);
  const anchoredPlacementStart = section(
    aoeTargetTool,
    "async function beginSpellPlacement",
    "async function beginSpellZoneMovement",
  );
  assert.match(anchoredPlacementStart, /const autoAnchor = placementContext\?\.autoConfirmAnchor === true/);
  assert.match(anchoredPlacementStart, /const rangePreview = autoAnchor/);
  assert.match(anchoredPlacementStart, /if \(!autoAnchor\) \{/);
  assert.match(anchoredPlacementStart, /startDrag\(rule\.geometry\.shape/);
  assert.match(popupController, /manualSaveAtTable/);
  assert.match(executor, /type: "token:teleport"/);
  assert.match(popupController, /attacks: isMultiAttack\(\)/);
  assert.doesNotMatch(popupController, /naturalStorm/);
  assert.doesNotMatch(validation, /currentSceneEpoch/);
  assert.match(popoverDrag, /export function initializePopoverDrag/);
  assert.match(popoverDrag, /clientX/);
  assert.match(vite, /spellActiveResolution:\s*path\.resolve/);
  assert.doesNotMatch(quickHp, /spell|area|placement|chain|board/i);
  assert.doesNotMatch(popupHtml, /quick-hp-modal|Effetti ad Area|Tab Danno/iu);
  assert.doesNotMatch(popupController, /quick-hp-modal/iu);
});

test("il pannello costruisce un payload immutabile e apre il popup tracciato", () => {
  assert.match(activeAdapter, /buildSpellActiveResolutionPayload/);
  assert.match(
    unifiedPanelView,
    /"single-save", "single-heal", "child-zone", "zone-movement"/,
  );
  assert.match(activeAdapter, /zoneItemId/);
  assert.match(unifiedPanel, /openTrackedPopover/);
  assert.match(unifiedPanel, /disableClickAway: true/);
  assert.doesNotMatch(unifiedPanel, /spells-panel\.js/);
});

test("una conferma di attivazione passa da una sola mutazione coordinata", () => {
  const apply = section(
    executor,
    "export async function executeSpellActiveResolution",
    "export async function executeSpellBoardTokenStateUpdate",
  );
  assert.equal((apply.match(/runEffectsMutation\(/g) || []).length, 1);
  assert.match(apply, /metadataPatches/);
  assert.match(apply, /type: "spell-active-resolution:validate"/);
  assert.match(apply, /history: \{/);
  assert.doesNotMatch(apply, /createSpellInstanceId|spell:upsert/);
  assert.match(apply, /concentration:break/);
});
