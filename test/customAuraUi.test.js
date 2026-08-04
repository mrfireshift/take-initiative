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

test("l'editor espone dimensione, stile, pill, warning e selezione automatica", () => {
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
  assert.match(modal, /getSelection\(\)/);
  assert.match(modal, /OBR\.player\.onChange/);
  assert.match(modal, /setActiveSelection/);
  assert.match(modal, /preserveInitialOnEmpty/);
  assert.match(modal, /setInterval/);
  assert.doesNotMatch(html, /add-selection/);
  assert.match(html, /class="glass-shell"/);
  assert.match(html, /custom-aura\.css\?v=4/);
  assert.match(html, /src="\/src\/custom-aura-modal\.js"/);
  assert.match(html, /src="\/src\/popoverDrag\.js"/);
  assert.match(html, /data-drag-handle/);
  assert.match(vite, /customAuraModal/);
});
