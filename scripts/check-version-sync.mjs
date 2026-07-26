import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const includeDist = process.argv.includes("--dist");
const semverPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

async function readJson(relativePath) {
  const absolutePath = path.resolve(root, relativePath);
  return JSON.parse(await readFile(absolutePath, "utf8"));
}

const packageJson = await readJson("package.json");
const packageLock = await readJson("package-lock.json");
const manifest = await readJson("public/manifest.json");
const versions = new Map([
  ["package.json", packageJson.version],
  ["package-lock.json", packageLock.version],
  ["package-lock.json#packages[\"\"]", packageLock.packages?.[""]?.version],
  ["public/manifest.json", manifest.version],
]);

if (includeDist) {
  const distManifest = await readJson("dist/manifest.json");
  const buildInfo = await readJson("dist/build-info.json");
  versions.set("dist/manifest.json", distManifest.version);
  versions.set("dist/build-info.json", buildInfo.version);

  const validCommit = /^[0-9a-f]{7,64}$/i.test(String(buildInfo.commit || ""));
  if (
    !validCommit ||
    !buildInfo.shortCommit ||
    typeof buildInfo.dirty !== "boolean" ||
    !Number.isInteger(buildInfo.sourceDateEpoch)
  ) {
    throw new Error("dist/build-info.json non contiene un'identita di build completa");
  }
}

const expected = packageJson.version;
if (!semverPattern.test(String(expected || ""))) {
  throw new Error(`Versione non SemVer in package.json: ${expected}`);
}

const mismatches = [...versions].filter(([, version]) => version !== expected);
if (mismatches.length) {
  const details = mismatches.map(([file, version]) => `${file}=${version}`).join(", ");
  throw new Error(`Versioni non allineate; attesa ${expected}: ${details}`);
}

console.log(JSON.stringify({
  version: expected,
  checked: [...versions.keys()],
  dist: includeDist,
}));
