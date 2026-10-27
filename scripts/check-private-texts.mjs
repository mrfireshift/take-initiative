// Looks for the manuals' texts outside the GM's private folder (compendio delle regole, fase 2): every run of 12 words
// of a private source (scripts/privateSources.mjs: the texts and the raw files) that is not SRD text is searched in the
// files the repository tracks and, with --dist=<dir>, in a build. Needs the private folder; prints what it finds and
// exits with 1 when a file holds a private run.
//
//   node scripts/check-private-texts.mjs [--dist=dist]
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { hasPrivateDir, privateDir } from "./privateSources.mjs";

const RUN = 12;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// The SRD texts the repository carries on purpose: a run found in them is SRD, wherever else it appears.
const SRD_FILES = ["src/rules-reference-it.json", "src/spell-reference-it.json", "src/class-features-descriptions.json"];
const TEXT_FILE = /\.(?:json|js|mjs|ts|html|md|txt|css)$/u;

export function normalizeWords(text) {
  return String(text)
    .toLocaleLowerCase("it")
    .normalize("NFD")
    .replace(/[̀-ͯ]/gu, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

export function runsOf(words, step = 1) {
  const runs = [];
  for (let index = 0; index + RUN <= words.length; index += step) runs.push(words.slice(index, index + RUN).join(" "));
  return runs;
}

// The fields of the raw files that hold a manual's text; their other fields (ids, notes, mechanics) are the plugin's.
const RAW_TEXT_KEYS = new Set(["descrizione", "effetto", "description", "higherLevels"]);

// Every string of a JSON value (only those under one of keys, when given), or the text of another file.
function stringsOf(file, keys = null) {
  const text = fs.readFileSync(file, "utf8");
  if (!file.endsWith(".json")) return [text];
  const strings = [];
  const walk = (value, key) => {
    if (typeof value === "string") {
      if (!keys || keys.has(key)) strings.push(value);
    } else if (Array.isArray(value)) value.forEach((item) => walk(item, key));
    else if (value && typeof value === "object") Object.entries(value).forEach(([name, item]) => walk(item, name));
  };
  walk(JSON.parse(text), null);
  return strings;
}

// The private files and the keys to read in each: every string of the texts, the text fields of the raw files.
// The PDF's raw text (sorgenti/regole/*.txt) is left out: its rules are in testi/<book>/regole.json, and the rest of
// it (a spell's components, its school) is the facts the catalogs keep on purpose.
function privateSources(dir) {
  return filesUnder(dir).filter((file) => !file.endsWith(".txt")).map((file) => ({
    file,
    keys: path.relative(dir, file).startsWith("testi") ? null : RAW_TEXT_KEYS,
  }));
}

function filesUnder(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "pacchetti" ? [] : filesUnder(full);
    return TEXT_FILE.test(entry.name) ? [full] : [];
  });
}

// The private runs: from the texts and the raw files ({ file, keys }), minus the runs of the SRD texts.
export function privateRuns({ privateFiles, srdFiles }) {
  const srd = new Set(srdFiles.flatMap((file) => stringsOf(file).flatMap((text) => runsOf(normalizeWords(text)))));
  const runs = new Set();
  for (const { file, keys } of privateFiles) {
    for (const text of stringsOf(file, keys)) {
      for (const run of runsOf(normalizeWords(text))) if (!srd.has(run)) runs.add(run);
    }
  }
  return runs;
}

// { file, count, sample } for every file that holds a private run.
export function findPrivateRuns(files, runs) {
  const found = [];
  for (const file of files) {
    let text;
    try { text = fs.readFileSync(file, "utf8"); } catch { continue; }
    const hits = runsOf(normalizeWords(text)).filter((run) => runs.has(run));
    if (hits.length) found.push({ file, count: hits.length, sample: hits[0] });
  }
  return found;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!hasPrivateDir()) throw new Error(`Cartella privata assente: ${privateDir()}`);
  const runs = privateRuns({
    privateFiles: privateSources(privateDir()),
    srdFiles: SRD_FILES.map((file) => path.join(ROOT, file)),
  });
  const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split("\n")
    .filter((file) => TEXT_FILE.test(file) && !file.startsWith("dist/"))
    .map((file) => path.join(ROOT, file));
  const dist = process.argv.slice(2).find((arg) => arg.startsWith("--dist="))?.slice("--dist=".length);
  const targets = [...tracked, ...(dist ? filesUnder(path.resolve(dist)) : [])];
  const found = findPrivateRuns(targets, runs);
  console.log(`${runs.size} sequenze private cercate in ${targets.length} file.`);
  for (const { file, count, sample } of found.sort((left, right) => right.count - left.count)) {
    console.log(`${String(count).padStart(6)}  ${path.relative(ROOT, file)}  «${sample}»`);
  }
  if (found.length) process.exitCode = 1;
}
