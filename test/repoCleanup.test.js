import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";

// Lot L22 (decision D7): the archives, backups, Vite template leftovers and merge leftovers left the repo, and so did
// the two pages nothing ever opened (zone reminders live in the turn notice, conditions are removed from their modal).
const root = (path) => new URL(`../${path}`, import.meta.url);

const REMOVED = [
  "src.zip",
  "audit-final-perf.json",
  "backlog.txt",
  "concentration-widget-backup.js",
  "src/counter.js",
  "src/javascript.svg",
  "src/style.css",
  "src/saveSpellCore.js.orig",
  "src/spellApplicationPlanCore.js.orig",
  "src/spellAreaStyleCore.js.orig",
  "test/deferredSpellWorkflow.test.js.orig",
  "test/reminderResolutionUi.test.js.orig",
  "test/spellAreaStyleCore.test.js.orig",
  "test/spellColorCore.test.js.orig",
  "zone-trigger-notice.html",
  "src/zone-trigger-notice.ts",
  "ctx-remove-condition.html",
  "src/ctx-remove-condition.ts",
];

test("L22: i file morti e le pagine mai aperte non sono più nel repo", () => {
  for (const path of REMOVED) assert.equal(existsSync(root(path)), false, path);
});

test("L22: la build e i tetti di perf:bundle non citano le pagine tolte", () => {
  const vite = readFileSync(root("vite.config.js"), "utf8");
  const budgets = readFileSync(root("scripts/perfBundleCore.mjs"), "utf8");
  for (const page of ["zone-trigger-notice.html", "ctx-remove-condition.html"]) {
    assert.equal(vite.includes(page), false, `vite.config.js: ${page}`);
    assert.equal(budgets.includes(page), false, `perfBundleCore.mjs: ${page}`);
  }
});
