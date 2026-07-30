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

test("la Scheda iniziativa espone due tab accessibili", () => {
  assert.match(html, /class="card-tabs"\s+role="tablist"/);
  assert.match(html, /id="statsTab"[^>]*role="tab"[^>]*aria-controls="view"/);
  assert.match(html, /id="quickActionsTab"[^>]*role="tab"[^>]*aria-controls="quickActionsView"/);
  assert.match(html, /id="view"[^>]*role="tabpanel"[^>]*aria-labelledby="statsTab"/);
  assert.match(html, /id="quickActionsView"[^>]*role="tabpanel"[^>]*aria-labelledby="quickActionsTab"/);
});

test("azioni rapide e statistiche vivono in pannelli distinti anche in modifica", () => {
  const statsViewStart = html.indexOf('id="view"');
  const quickViewStart = html.indexOf('id="quickActionsView"');
  const quickBlockStart = html.indexOf('id="quickActionsBlock"');
  assert.ok(statsViewStart >= 0);
  assert.ok(quickViewStart > statsViewStart);
  assert.ok(quickBlockStart > quickViewStart);
  assert.match(html, /id="statsEditPane"\s+class="edit-pane"/);
  assert.match(html, /id="quickActionsEditPane"\s+class="quick-actions-editor edit-pane"/);
});

test("il cambio tab sincronizza vista, editor e altezza del popover", () => {
  assert.match(source, /let activeCardTab = "stats"/);
  assert.match(source, /function syncCardTabs\(\)/);
  assert.match(source, /\$\("view"\)\.hidden = editing \|\| quickActionsActive/);
  assert.match(source, /\$\("quickActionsView"\)\.hidden = editing \|\| !quickActionsActive/);
  assert.match(source, /\$\("statsTab"\)\.addEventListener\("click", \(\) => setCardTab\("stats"\)\)/);
  assert.match(source, /\$\("quickActionsTab"\)\.addEventListener\("click", \(\) => setCardTab\("quick-actions"\)\)/);
  assert.match(source, /\? \(quickActionsActive \? 680 : 640\)\s*: 560/);
});

test("la Scheda iniziativa apre più alta senza ampliare gli altri popover", () => {
  assert.match(trackerSource, /url: `\/initiative-card-modal\.html\?source=\$\{encodeURIComponent\(sourceId\)\}`,[\s\S]*?height: 560/);
  assert.match(trackerSource, /data\.id === `\$\{ID\}\/initiative-card-modal` \? 680 : 560/);
});
