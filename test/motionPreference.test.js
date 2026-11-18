// Lot M3 of the animations study (docs/STUDIO_ANIMAZIONI.md, 18/11): reduced motion everywhere. One rule in the shared
// stylesheet for the CSS (the expiry bars and the loading spinner kept: they are information), and the preference read
// by the scrolls JavaScript asks to be smooth.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { prefersReducedMotion, smoothScrollBehavior } from "../src/motionPreference.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const windowWith = (matches) => ({ matchMedia: (query) => ({ matches: matches && query === "(prefers-reduced-motion: reduce)" }) });

test("the preference, and the scroll it asks for", () => {
  assert.equal(prefersReducedMotion(windowWith(true)), true);
  assert.equal(prefersReducedMotion(windowWith(false)), false);
  assert.equal(prefersReducedMotion({}), false);
  assert.equal(smoothScrollBehavior(windowWith(true)), "auto");
  assert.equal(smoothScrollBehavior(windowWith(false)), "smooth");
});

test("one rule in the shared stylesheet: transitions, animations and scrolling at once, the information kept", () => {
  const css = read("public/ui-typography.css");
  const rule = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(rule, /transition-duration: 0\.01ms !important;/);
  assert.match(rule, /scroll-behavior: auto !important;/);
  assert.match(rule, /\*:not\(\.tbp-loading__spinner\),\n\s+\*:not\(\.timer\):not\(\.zone-timer\)::before,\n\s+\*:not\(\.timer\):not\(\.zone-timer\)::after \{\n\s+animation-duration: 0\.01ms !important;/);
  // The expiry bars it keeps are the ones the notices draw.
  for (const page of ["turn-notice", "speed-warning", "concentration-warning", "boss-link-notice"]) {
    assert.match(read(`${page}.html`), /\.timer::after \{/, page);
  }
  assert.match(read("turn-notice.html"), /\.zone-timer::after \{/);
  assert.match(read("index.html"), /\.tbp-loading__spinner \{[^}]*animation: tbp-loading-spin/);
});

test("no scroll in the plugin asks to be smooth whatever the preference", () => {
  const sources = readdirSync(new URL("../src", import.meta.url), { recursive: true })
    .filter((file) => /\.(js|ts)$/.test(file));
  for (const file of sources) {
    assert.doesNotMatch(read(`src/${file.replace(/\\/g, "/")}`), /behavior: "smooth"/, file);
  }
  assert.equal(read("src/initiativeList.js").split("behavior: smoothScrollBehavior()").length - 1, 6);
  assert.match(read("src/compactCompanionDrawer.js"), /behavior: smoothScrollBehavior\(\)/);
});
