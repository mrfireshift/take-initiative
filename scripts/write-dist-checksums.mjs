import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const distRoot = path.resolve(process.cwd(), "dist");
const outputName = "checksums.sha256";

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(absolutePath));
    else if (entry.isFile() && entry.name !== outputName) files.push(absolutePath);
  }
  return files;
}

const files = await collectFiles(distRoot);
const rows = [];
for (const absolutePath of files) {
  const content = await readFile(absolutePath);
  const digest = createHash("sha256").update(content).digest("hex");
  const relativePath = path.relative(distRoot, absolutePath).replaceAll("\\", "/");
  rows.push(`${digest}  ${relativePath}`);
}

await writeFile(path.join(distRoot, outputName), `${rows.join("\n")}\n`, "utf8");
console.log(JSON.stringify({ files: rows.length, output: `dist/${outputName}` }));
