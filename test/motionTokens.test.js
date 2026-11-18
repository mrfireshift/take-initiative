// Lot M4 of the animations study (docs/STUDIO_ANIMAZIONI.md, 18/11): three shared durations for the transitions, with a
// fallback in every var() for a page without the shared sheet. Kept apart on purpose: the movement bar's live 80ms, the
// two menus' 90ms closing (paired with their EXIT_ANIMATION_MS), and the 200/220/300ms the study left as they are.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the three durations in the shared sheet", () => {
  const css = read("public/ui-typography.css");
  assert.match(css, /--obrt-motion-fast: 120ms;/);
  assert.match(css, /--obrt-motion-base: 180ms;/);
  assert.match(css, /--obrt-motion-move: 380ms;/);
});

test("no transition keeps a duration the shared ones replace, and every var() has its fallback", () => {
  const root = new URL("../", import.meta.url);
  const files = [
    ...readdirSync(root).filter((file) => file.endsWith(".html")),
    ...readdirSync(new URL("public/", root)).filter((file) => file.endsWith(".css")).map((file) => `public/${file}`),
    ...readdirSync(new URL("src/", root), { recursive: true }).filter((file) => /\.(js|ts)$/.test(file)).map((file) => `src/${file.replace(/\\/g, "/")}`),
  ];
  const replaced = /transition[^;\n]*(?<![\w.\-])(\.12s|\.14s|\.15s|\.16s|120ms|140ms|160ms|180ms|\.18s|380ms)(?![\w])/;
  for (const file of files) {
    const text = read(file);
    for (const line of text.split("\n")) {
      if (!/transition/.test(line)) continue;
      assert.doesNotMatch(line.replace(/var\(--obrt-motion-[a-z]+, [0-9]+ms\)/g, "VAR"), replaced, `${file}: ${line.trim()}`);
      assert.doesNotMatch(line, /var\(--obrt-motion-(fast|base|move)\)/, `${file}: ${line.trim()}`);
    }
  }
});

test("the durations kept apart on purpose", () => {
  assert.match(read("compact-round-tab.html"), /transition: width 80ms linear, background-color var\(--obrt-motion-fast, 120ms\) ease;/);
  assert.match(read("initiative-card-context-menu.html"), /transition-duration: 90ms;/);
  assert.match(read("src/initiative-card-context-menu.js"), /: 90;/);
});
