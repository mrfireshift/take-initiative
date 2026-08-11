import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const popupHtml = read("../spell-active-resolution.html");
const popupController = read("../src/spell-active-resolution.js");
const spellsPanel = read("../src/spells-panel.js");
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
  assert.match(popupHtml, /Risolvi:/);
  assert.match(popupHtml, /id="close"/);
  assert.match(popupHtml, /id="apply"[^>]*>Applica</);
  assert.match(popupController, /requestSpellAreaPlacement/);
  assert.match(popupController, /executeSpellActiveResolution/);
  assert.match(popupController, /Sagoma confermata\. I bersagli sono ora bloccati/);
  assert.match(popupHtml, /\[hidden\]\s*\{\s*display:\s*none\s*!important/);
  assert.match(popupHtml, /id="saveTitle"/);
  assert.match(popupHtml, /id="attackTitle"/);
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
  assert.match(popupController, /initializePopoverDrag/);
  assert.match(popupController, /void apply\(\)/);
  assert.match(popupController, /button\.addEventListener\("click", \(event\) => \{\s*event\.stopPropagation\(\);/);
  assert.match(popupController, /\$\("footer"\)\.hidden = !save/);
  assert.doesNotMatch(popupController, /naturalStorm/);
  assert.doesNotMatch(validation, /currentSceneEpoch/);
  assert.match(popoverDrag, /export function initializePopoverDrag/);
  assert.match(popoverDrag, /clientX/);
  assert.match(vite, /spellActiveResolution:\s*path\.resolve/);
  assert.match(quickHp, /slotLevel: selectedSpellSlotLevel\(spell\)/);
  assert.doesNotMatch(popupHtml, /quick-hp-modal|Effetti ad Area|Tab Danno/iu);
  assert.doesNotMatch(popupController, /quick-hp-modal/iu);
});

test("il pannello costruisce un payload immutabile e apre il popup tracciato", () => {
  assert.match(spellsPanel, /buildSpellActiveResolutionPayload/);
  assert.match(spellsPanel, /openTrackedPopover/);
  assert.match(spellsPanel, /disableClickAway: true/);
  assert.match(spellsPanel, /zoneItemId: group\?\.zoneItemId/);
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
  assert.doesNotMatch(apply, /createSpellInstanceId|spell:upsert|concentration:break/);
});
