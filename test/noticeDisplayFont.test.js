// Lot L7 of the tracker UI study (docs/STUDIO_UI_TRACKER_BG3.md, D7 of 18/11): the titles of the notices in Vollkorn,
// served by the plugin with its license, Georgia while it loads; the rest of the interface keeps its UI font.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const typography = read("public/ui-typography.css");

test("Vollkorn is served by the plugin, with the SIL Open Font License beside it", () => {
  const font = readFileSync(new URL("../public/fonts/vollkorn-latin-wght-normal.woff2", import.meta.url));
  assert.equal(font.subarray(0, 4).toString("latin1"), "wOF2");
  assert.equal(statSync(new URL("../public/fonts/vollkorn-latin-wght-normal.woff2", import.meta.url)).size, 46356);
  const license = read("public/fonts/Vollkorn-OFL.txt");
  assert.match(license, /SIL Open Font License, Version 1\.1/);
  assert.match(license, /The Vollkorn Project Authors/);
});

test("the typography loads Vollkorn and puts it first in the notices' font, Georgia behind it", () => {
  assert.ok(typography.startsWith('@import url("/ui-scrollbars.css");'), "the import stays first");
  const face = typography.slice(typography.indexOf("@font-face {"), typography.indexOf("}", typography.indexOf("@font-face {")));
  assert.match(face, /font-family: "Vollkorn";/);
  assert.match(face, /font-weight: 400 900;/);
  assert.match(face, /font-display: swap;/);
  assert.match(face, /src: url\("\/fonts\/vollkorn-latin-wght-normal\.woff2"\) format\("woff2"\);/);
  assert.match(typography, /--obrt-font-display: "Vollkorn", Georgia, "Times New Roman", serif;/);
});

test("Figtree is the interface's font, served with its license; the notices' text uses it, no system font", () => {
  const font = readFileSync(new URL("../public/fonts/figtree-latin-wght-normal.woff2", import.meta.url));
  assert.equal(font.subarray(0, 4).toString("latin1"), "wOF2");
  assert.equal(font.length, 20156);
  const license = read("public/fonts/Figtree-OFL.txt");
  assert.match(license, /SIL Open Font License, Version 1\.1/);
  assert.match(license, /The Figtree Project Authors/);
  const at = typography.indexOf('font-family: "Figtree";');
  const face = typography.slice(typography.lastIndexOf("@font-face {", at), typography.indexOf("}", at));
  assert.match(face, /font-weight: 300 900;/);
  assert.match(face, /font-display: swap;/);
  assert.match(face, /src: url\("\/fonts\/figtree-latin-wght-normal\.woff2"\) format\("woff2"\);/);
  assert.match(typography, /--obrt-font-ui: "Figtree", "Helvetica Neue", Helvetica, Arial, sans-serif;/);
  for (const page of ["turn-notice.html", "boss-link-notice.html", "concentration-warning.html", "reaction-move.html", "speed-warning.html"]) {
    assert.doesNotMatch(read(page), /system-ui/, page);
  }
  // The compact name is measured in the font it is drawn in.
  assert.match(read("src/initiativeCardCompact.js"), /11px "Figtree", "Helvetica Neue", Helvetica, Arial, sans-serif/);
});

test("every notice that draws its titles with the display font loads the shared typography", () => {
  for (const page of ["turn-notice.html", "boss-link-notice.html", "concentration-warning.html", "reaction-move.html", "speed-warning.html"]) {
    const html = read(page);
    assert.match(html, /ui-typography\.css/, page);
    assert.match(html, /var\(--obrt-font-display/, page);
  }
});
