// No page declares its theme on the root. Inside Owlbear Rodeo's iframe, a page whose theme differs from the iframe's gets an
// opaque black canvas behind it: black in the corners of the glass and under it, which turns the glass into a solid grey
// (lot V1 of the purple popups' audit). The dark theme goes on the page's glass instead.
import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const pages = readdirSync(root).filter((file) => file.endsWith(".html"));
const sheets = readdirSync(new URL("public/", root)).filter((file) => file.endsWith(".css")).map((file) => `public/${file}`);

test("no page and no sheet of the plugin declares its theme on the root", () => {
  assert.ok(pages.length > 30, "the pages are read");
  const offenders = [...pages, ...sheets].filter((file) => /(?:^|[\s,}])(?::root|html|body)\s*(?:,[^{]*)?\{[^}]*color-scheme/.test(read(file)));
  assert.deepEqual(offenders, []);
});

test("the faction configurator and the areas' look carry the dark theme on their glass, with no shadow outside it", () => {
  const configurator = read("faction-configurator.html");
  assert.match(configurator, /\.shell \{ color-scheme: dark; box-shadow: inset 0 1px 0 rgba\(255, 255, 255, \.07\); \}/);
  assert.match(configurator, /<main class="shell" data-glass-popover="1"/);
  assert.match(read("public/aoe-settings.css"), /\.aoe-style-shell \{\s*color-scheme: dark;\s*box-shadow: inset 0 1px 0 rgba\(255, 255, 255, \.07\);/);
  assert.match(read("aoe-settings.html"), /<main class="aoe-style-shell" data-glass-popover="1"/);
});

test("the faction configurator opens tall enough for its two buttons", () => {
  const modal = read("src/options-modal.js");
  const opening = modal.slice(modal.indexOf("const width = 420;"), modal.indexOf('url: "/faction-configurator.html"'));
  assert.match(opening, /const height = 500;/);
  assert.match(read("faction-configurator.html"), /data-clear>Azzera registro</);
});
