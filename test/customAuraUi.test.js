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

test("l'editor espone dimensione, stile, pill, warning e scope stabile dai tokenId", () => {
  for (const marker of [
    "radiusMeters",
    "style.fillColor",
    "style.strokeColor",
    "pill.enabled",
    "pill.label",
    "warnings.start.enabled",
    "warnings.end.enabled",
  ]) {
    assert.match(modal, new RegExp(marker.replace(".", "\\.")));
  }
  assert.match(modal, /delete meta\[CUSTOM_AURAS_FIELD\]/);
  assert.match(modal, /draft\.metadata = \{ \.\.\.\(draft\.metadata \|\| \{\}\), \[META_KEY\]: meta \}/);
  assert.match(modal, /OBR\.popover\.close/);
  assert.match(modal, /updateItems\(tokens\.map/);
  assert.match(modal, /getAll\("tokenId"\)/);
  assert.match(modal, /loadTokensFromScene/);
  assert.doesNotMatch(modal, /OBR\.player\.onChange/);
  assert.doesNotMatch(html, /add-selection/);
  assert.match(html, /class="glass-shell"/);
  assert.match(html, /custom-aura\.css\?v=4/);
  assert.match(html, /src="\/src\/custom-aura-modal\.js"/);
  assert.match(html, /src="\/src\/popoverDrag\.js"/);
  assert.match(html, /data-drag-handle/);
  assert.match(vite, /customAuraModal/);
});

test("il menu GM offre l'azione rapida per applicare preset di aura", () => {

  assert.match(contextMenu, /custom-aura-apply-preset/);
  assert.match(contextMenu, /Applica preset aura…/);
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
  assert.match(html, /Libreria Preset/);
});


