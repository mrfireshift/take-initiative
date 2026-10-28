// Lot V3: a Boss console reduced before it was closed comes back reduced without first showing its panel. The page
// folds the body before its first paint from the same session key the console writes, and the console sets its
// popover height at startup, before its scene reads.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ID } from "../src/constants.js";

const html = readFileSync(new URL("../boss-actions.html", import.meta.url), "utf8");
const source = readFileSync(new URL("../src/boss-actions.js", import.meta.url), "utf8");

test("the page folds a reduced console before its first paint, with the console's own key", () => {
  assert.match(source, /const MINIMIZED_STORAGE_KEY=`\$\{ID\}\/boss-actions-minimized`;/);
  const key = `${ID}/boss-actions-minimized`;
  const inline = html.match(/<body>\s*<script>([\s\S]*?)<\/script>/)?.[1] || "";
  assert.ok(inline.includes(`sessionStorage.getItem("${key}") === "true"`), "the inline script reads the console's key");
  assert.match(inline, /document\.body\.dataset\.minimized = "true"/);
  assert.match(html, /body\[data-minimized="true"\] \.panel, body\[data-minimized="true"\] \.status-bar \{ display: none; \}/);
});

test("the console restores its reduced height at startup, before the scene reads, and only once", () => {
  const restore = source.indexOf("const restoreMinimized=readSession(MINIMIZED_STORAGE_KEY)===true ? setMinimized(true)");
  const mount = source.indexOf("const ready=lifecycle.mount()");
  assert.ok(restore > 0 && restore < mount, "the fold starts before lifecycle.mount");
  assert.equal(source.match(/readSession\(MINIMIZED_STORAGE_KEY\)/g).length, 1, "no second fold after the reads");
  assert.match(source, /mountLiveUpdates\(\);\s*await restoreMinimized;/);
});
