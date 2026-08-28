import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const contextMenu = readFileSync(
  new URL("../src/contextMenu.js", import.meta.url),
  "utf8",
);
const modal = readFileSync(
  new URL("../src/custom-aura-modal.js", import.meta.url),
  "utf8",
);
const html = readFileSync(
  new URL("../custom-aura-modal.html", import.meta.url),
  "utf8",
);
const vite = readFileSync(
  new URL("../vite.config.js", import.meta.url),
  "utf8",
);

test("il menu GM apre l'editor autonomo per il token selezionato", () => {
  assert.match(contextMenu, /custom-aura-manage/);
  assert.match(contextMenu, /roles: \["GM"\]/);
  assert.match(contextMenu, /query\.append\("tokenId"/);
  assert.match(contextMenu, /tokenIds/);
  assert.match(contextMenu, /openTrackedPopover/);
  assert.match(contextMenu, /hidePaper: true/);
  assert.doesNotMatch(contextMenu, /OBR\.modal\.open/);
});

test("la gestione dettagliata è candidabile senza META ma resta single-token", () => {
  const manageStart = contextMenu.indexOf('id: `${ID}/custom-aura-manage`');
  const manageEnd = contextMenu.indexOf('id: `${ID}/custom-aura-apply-preset`');
  assert.ok(manageStart >= 0 && manageEnd > manageStart);
  const manageBlock = contextMenu.slice(manageStart, manageEnd);
  assert.match(manageBlock, /every: \[isCharacter\(\)\]/);
  assert.doesNotMatch(manageBlock, /hasMeta\("!=",?\)/);
  assert.match(manageBlock, /tokenIds\.length > 1/);
  assert.match(manageBlock, /OBR\.notification\.show/);
});

test("l'editor espone il contratto canonico e lo scope stabile dai tokenId", () => {
  for (const marker of [
    /radiusMeters/,
    /style\.fillColor/,
    /style\.strokeColor/,
    /pills\.\$\{pillIndex\}\.label/,
    /reminders\.\$\{remIndex\}\.label/,
    /reminders\.\$\{remIndex\}\.resolution/,
  ]) assert.match(modal, marker);
  assert.match(modal, /min="0" max="300" step="1\.5" data-field="radiusMeters"/);
  assert.match(modal, /pills: \[\]/);
  assert.match(modal, /reminders: \[\]/);
  assert.doesNotMatch(modal, /data-field="pill\./);
  assert.doesNotMatch(modal, /data-field="warnings\./);
  assert.doesNotMatch(modal, /Hidden backward-compatibility/);
  assert.match(modal, /delete meta\[CUSTOM_AURAS_FIELD\]/);
  assert.match(modal, /draft\.metadata = \{ \.\.\.\(draft\.metadata \|\| \{\}\), \[META_KEY\]: meta \}/);
  assert.match(modal, /OBR\.popover\.close/);
  assert.match(modal, /updateItems\(tokens\.map/);
  assert.match(modal, /getAll\("tokenId"\)/);
  assert.match(modal, /loadTokensFromScene/);
  assert.doesNotMatch(modal, /OBR\.player\.onChange/);
  assert.doesNotMatch(html, /add-selection/);
  assert.match(html, /class="glass-shell"/);
  assert.match(html, /custom-aura\.css\?v=5/);
  assert.match(html, /src="\/src\/custom-aura-modal\.js"/);
  assert.match(html, /src="\/src\/popoverDrag\.js"/);
  assert.match(html, /data-drag-handle/);
  assert.match(vite, /customAuraModal/);
});

test("il menu GM offre l'azione rapida per applicare preset di aura", () => {

  assert.match(contextMenu, /custom-aura-apply-preset/);
  assert.match(contextMenu, /mode: "apply-preset"/);
});

test("l'editor supporta multi-pills, multi-reminders, preset e gestione libreria", () => {
  assert.match(modal, /pills\.\$\{pillIndex\}\.label/);
  assert.match(modal, /reminders\.\$\{remIndex\}\.label/);
  assert.match(modal, /reminders\.\$\{remIndex\}\.resolution/);
  assert.match(modal, /reminders\.\$\{remIndex\}\.ability/);
  assert.match(modal, /reminders\.\$\{remIndex\}\.dc/);
  assert.match(modal, /save-as-preset/);
  assert.match(modal, /apply-preset/);
  assert.match(modal, /detach-preset/);
  assert.match(modal, /update-preset/);
  assert.match(modal, /preset-dialog/);
  assert.match(html, /presets-btn/);
});

test("linked aura è read-only e offre modifica preset o detach espliciti", () => {
  assert.match(modal, /const readOnly = isLinked && !isEditingPreset/);
  assert.match(modal, /disabled\(readOnly\)/);
  assert.match(modal, /data-action="update-preset"/);
  assert.match(modal, /data-action="detach-preset"/);
  assert.match(modal, /editingPresetIndex = index/);
  assert.match(modal, /updatePresetDefinition\(existingPreset/);
  assert.match(modal, /presetStore\.savePreset\(updatedPreset\)/);
});

test("quick apply è append-only e salva la lista corrente di ogni token", () => {
  assert.match(modal, /const quickApplyMode = .*mode.*apply-preset/);
  assert.match(modal, /presetDialogTargetIndex = null;[\s\S]{0,180}renderPresetDialog\(\)/);
  assert.match(modal, /appendPresetToCustomAuraList\(current, preset\)/);
  assert.match(modal, /normalizeCustomAuras\(meta\[CUSTOM_AURAS_FIELD\]\)/);
  assert.match(contextMenu, /mode: "apply-preset"/);
});

test("la gestione rapida delle aure esistenti è separata dall'editor dettagliato", () => {
  assert.match(modal, /function auraSummaryTemplate/);
  assert.match(modal, /data-existing-toggle/);
  assert.match(modal, /data-existing-rename/);
  assert.match(modal, /data-action="delete-existing"/);
  assert.match(modal, /data-action="edit-details"/);
  assert.match(modal, /async function persistExistingAuraChange/);
  assert.match(modal, /saveButton\.hidden = !hasDetailDraft/);
  assert.match(modal, /currentIndex = current\.findIndex/);
  assert.match(modal, /delete meta\[CUSTOM_AURAS_FIELD\]/);
  assert.match(modal, /function detailDraftActive/);
  assert.match(modal, /function blockSecondWorkflow/);
  assert.match(modal, /tokens\.length !== 1/);
  assert.match(html, /id="save"[^>]*hidden/);
});

test("i comandi delete di pill e reminder passano la delega del click", () => {
  assert.match(modal, /data-action="delete-pill"/);
  assert.match(modal, /data-action="delete-reminder"/);
  assert.doesNotMatch(modal, /data-action="delete-pill"[^>]*onclick=/);
  assert.doesNotMatch(modal, /data-action="delete-reminder"[^>]*onclick=/);

  const clickStart = modal.indexOf('list.addEventListener("click"');
  const clickEnd = modal.indexOf("\n});", clickStart);
  const clickHandler = modal.slice(clickStart, clickEnd);
  assert.ok(
    clickHandler.indexOf('const button = event.target.closest("button[data-action]")')
      < clickHandler.indexOf('const togglePillEl = button ? null : event.target.closest("[data-toggle-pill]")'),
  );
  assert.match(
    clickHandler,
    /const toggleRemEl = button \? null : event\.target\.closest\("\[data-toggle-rem\]"\)/,
  );
});
