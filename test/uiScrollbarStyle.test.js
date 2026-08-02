import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const scrollbarCss = read("../public/ui-scrollbars.css");
const typographyCss = read("../public/ui-typography.css");
const glassCss = read("../public/popover-glass.css");
const initiativeCardHtml = read("../initiative-card-modal.html");

test("la scrollbar condivisa usa track trasparente e thumb discreto", () => {
  assert.match(scrollbarCss, /--obrt-scrollbar-size:\s*8px/);
  assert.match(scrollbarCss, /::-webkit-scrollbar-track,[\s\S]*background:\s*transparent/);
  assert.match(scrollbarCss, /::-webkit-scrollbar-thumb\s*\{[\s\S]*border-radius:\s*999px/);
  assert.match(scrollbarCss, /scrollbar-color:\s*var\(--obrt-scrollbar-thumb\)\s+transparent/);
  assert.match(scrollbarCss, /::-webkit-scrollbar-button\s*\{[\s\S]*display:\s*none/);
});

test("gli stylesheet condivisi propagano la scrollbar a tutte le viste principali", () => {
  assert.match(typographyCss, /@import url\("\/ui-scrollbars\.css"\)/);
  assert.match(glassCss, /@import url\("\/ui-scrollbars\.css"\)/);
  for (const path of [
    "../zone-trigger-notice.html",
    "../turn-notice.html",
    "../concentration-warning.html",
    "../background.html",
    "../action-launcher.html",
    "../speed-warning.html",
  ]) {
    assert.match(read(path), /href="\/ui-scrollbars\.css"/);
  }
});

test("l'editor Azioni rapide nasconde i campi incompatibili e usa un solo scroll", () => {
  assert.match(
    initiativeCardHtml,
    /\.quick-action-editor-grid label\[hidden\]\s*\{\s*display:none !important;\s*\}/,
  );
  assert.match(
    initiativeCardHtml,
    /\.quick-actions-editor-list\s*\{\s*display:grid;[^}]*\}/,
  );
  const editorListRule = initiativeCardHtml.match(
    /\.quick-actions-editor-list\s*\{([^}]*)\}/,
  )?.[1] || "";
  assert.doesNotMatch(editorListRule, /overflow-y|max-height/);
  assert.match(initiativeCardHtml, /input,textarea,select\s*\{\s*min-width:0;/);
});

test("la scheda iniziativa mantiene il backdrop su un layer 3D non ottimizzabile", () => {
  const glassShellRule = initiativeCardHtml.match(/\.glass-shell\s*\{([^}]*)\}/)?.[1] || "";
  assert.match(glassShellRule, /transform:\s*translateZ\(\.001px\)/);
  assert.match(glassShellRule, /backface-visibility:\s*hidden/);
  assert.doesNotMatch(glassShellRule, /clip-path/);
});
