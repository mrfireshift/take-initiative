// The JavaScript a built page loads before it runs: its module script and the modules Vite preloads with it (the
// static import graph). Lazily imported code (import()) is not counted, so moving a button's action behind a click
// shows up here as a lighter page.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

// The popups that open by themselves during play (a turn, damage, a zone, a reaction), on every client that shows
// them: a budget in KB of minified startup JavaScript, about 10% above their size on 28/10/2026 (lot F5).
export const NOTICE_STARTUP_BUDGETS_KB = Object.freeze({
  "turn-notice.html": 750,
  "death-save-notice.html": 450,
  "effect-duration.html": 450,
  "concentration-warning.html": 100,
  "boss-link-notice.html": 90,
  "speed-warning.html": 90,
  "counterspell.html": 1590,
  "wild-magic-surge.html": 2990,
});

export function startupScripts(html) {
  const tags = String(html || "").match(/<(?:script|link)\b[^>]*>/gi) || [];
  const scripts = [];
  for (const tag of tags) {
    const isModule = /^<script\b/i.test(tag) && /\btype=["']module["']/i.test(tag);
    const isPreload = /^<link\b/i.test(tag) && /\brel=["']modulepreload["']/i.test(tag);
    if (!isModule && !isPreload) continue;
    const url = tag.match(/\b(?:src|href)=["']([^"']+\.js)["']/i)?.[1];
    if (url && !scripts.includes(url)) scripts.push(url);
  }
  return scripts;
}

export function measurePages(distDir) {
  const sizes = new Map();
  const sizeOf = (url) => {
    if (!sizes.has(url)) {
      const file = path.join(distDir, url.replace(/^\//, ""));
      try {
        const content = readFileSync(file);
        sizes.set(url, { bytes: statSync(file).size, gzipBytes: gzipSync(content).length });
      } catch {
        sizes.set(url, { bytes: 0, gzipBytes: 0, missing: true });
      }
    }
    return sizes.get(url);
  };
  return readdirSync(distDir)
    .filter((name) => name.endsWith(".html"))
    .map((page) => {
      const scripts = startupScripts(readFileSync(path.join(distDir, page), "utf8"));
      const measured = scripts.map(sizeOf);
      return {
        page,
        scripts: scripts.length,
        kb: Math.round(measured.reduce((sum, entry) => sum + entry.bytes, 0) / 1024),
        gzipKb: Math.round(measured.reduce((sum, entry) => sum + entry.gzipBytes, 0) / 1024),
        missing: scripts.filter((url) => sizeOf(url).missing),
      };
    })
    .sort((a, b) => b.kb - a.kb || a.page.localeCompare(b.page));
}

// Pages over their budget, a budgeted page the build no longer has, and scripts a page names but the build lacks.
export function checkBudgets(rows, budgets = NOTICE_STARTUP_BUDGETS_KB) {
  const byPage = new Map(rows.map((row) => [row.page, row]));
  const problems = [];
  for (const [page, budgetKb] of Object.entries(budgets)) {
    const row = byPage.get(page);
    if (!row) problems.push({ page, reason: "missing-page", budgetKb });
    else if (row.kb > budgetKb) problems.push({ page, reason: "over-budget", kb: row.kb, budgetKb });
  }
  for (const row of rows) {
    if (row.missing.length) problems.push({ page: row.page, reason: "missing-scripts", scripts: row.missing });
  }
  return problems;
}
