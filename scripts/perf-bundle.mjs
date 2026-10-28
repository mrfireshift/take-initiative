// npm run perf:bundle [-- --dist <folder>] [--json]: the startup JavaScript of every built page (dist by default,
// so run it after a build), and the budgets of the popups that open by themselves during play. It exits with 1 when
// a budgeted page grows past its budget, so a new feature cannot make a notice heavier unnoticed.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkBudgets, measurePages, NOTICE_STARTUP_BUDGETS_KB } from "./perfBundleCore.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
const distIndex = args.indexOf("--dist");
const distDir = path.resolve(root, distIndex >= 0 ? args[distIndex + 1] : "dist");
const rows = measurePages(distDir);
const problems = checkBudgets(rows);

if (args.includes("--json")) {
  console.log(JSON.stringify({ distDir, rows, budgets: NOTICE_STARTUP_BUDGETS_KB, problems }, null, 2));
} else {
  console.log(`Startup JavaScript per page (${path.relative(root, distDir) || "."}):`);
  console.log("  KB\tgzip KB\tscripts\tbudget\tpage");
  for (const row of rows) {
    const budget = NOTICE_STARTUP_BUDGETS_KB[row.page];
    const mark = budget !== undefined && row.kb > budget ? "  ← over budget" : "";
    console.log(`  ${row.kb}\t${row.gzipKb}\t${row.scripts}\t${budget ?? ""}\t${row.page}${mark}`);
  }
  for (const problem of problems) {
    if (problem.reason === "over-budget") console.error(`✖ ${problem.page}: ${problem.kb} KB, budget ${problem.budgetKb} KB`);
    else if (problem.reason === "missing-page") console.error(`✖ ${problem.page}: page with a budget not found in the build`);
    else console.error(`✖ ${problem.page}: scripts not found in the build: ${problem.scripts.join(", ")}`);
  }
  if (!problems.length) console.log("✔ every notice popup is within its budget");
}
process.exit(problems.length ? 1 : 0);
