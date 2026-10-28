// npm run perf:bundle (lot F5): a page's startup JavaScript is its module script plus the modules Vite preloads, and
// a notice popup over its budget, a budgeted page missing from the build or a missing script fail the check.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { checkBudgets, measurePages, NOTICE_STARTUP_BUDGETS_KB, startupScripts } from "../scripts/perfBundleCore.mjs";

test("the startup scripts are the module script and the preloaded modules, nothing else", () => {
  const html = `<!doctype html><head>
    <script type="module" crossorigin src="/assets/turnNotice-a1.js"></script>
    <link rel="modulepreload" crossorigin href="/assets/constants-b2.js">
    <link rel="modulepreload" crossorigin href="/assets/constants-b2.js">
    <link rel="stylesheet" href="/assets/turnNotice-c3.css">
    <script src="/legacy.js"></script>
  </head>`;
  assert.deepEqual(startupScripts(html), ["/assets/turnNotice-a1.js", "/assets/constants-b2.js"]);
});

test("pages are measured from the build and checked against the notice budgets", (t) => {
  const dist = mkdtempSync(path.join(tmpdir(), "perf-bundle-"));
  t.after(() => rmSync(dist, { recursive: true, force: true }));
  mkdirSync(path.join(dist, "assets"));
  writeFileSync(path.join(dist, "assets", "shared.js"), "x".repeat(40 * 1024));
  writeFileSync(path.join(dist, "assets", "notice.js"), "y".repeat(80 * 1024));
  writeFileSync(path.join(dist, "speed-warning.html"),
    '<script type="module" src="/assets/notice.js"></script><link rel="modulepreload" href="/assets/shared.js">');
  writeFileSync(path.join(dist, "index.html"),
    '<script type="module" src="/assets/shared.js"></script><link rel="modulepreload" href="/assets/gone.js">');

  const rows = measurePages(dist);
  assert.deepEqual(rows.map((row) => [row.page, row.kb, row.scripts]), [["speed-warning.html", 120, 2], ["index.html", 40, 2]]);
  assert.ok(rows[0].gzipKb < rows[0].kb);

  const problems = checkBudgets(rows, { "speed-warning.html": 100, "turn-notice.html": 750 });
  assert.deepEqual(problems, [
    { page: "speed-warning.html", reason: "over-budget", kb: 120, budgetKb: 100 },
    { page: "turn-notice.html", reason: "missing-page", budgetKb: 750 },
    { page: "index.html", reason: "missing-scripts", scripts: ["/assets/gone.js"] },
  ]);
  assert.deepEqual(checkBudgets(rows, { "speed-warning.html": 120 }).map((problem) => problem.reason), ["missing-scripts"]);
});

test("every budget names a page of the build", async () => {
  const { readFileSync } = await import("node:fs");
  const config = readFileSync(new URL("../vite.config.js", import.meta.url), "utf8");
  for (const page of Object.keys(NOTICE_STARTUP_BUDGETS_KB)) {
    assert.ok(config.includes(`"${page}"`), `${page} is an input of the build`);
  }
});
