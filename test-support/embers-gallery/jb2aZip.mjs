// JB2A Patreon library read straight from its download link through HTTP Range requests: the zip's index, then single
// files on demand (no 10 GB download). Dev tool for the Embers galleries; the share token stays in the git-ignored
// jb2a-patreon/.share file and every extracted file in jb2a-patreon/.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { inflateRawSync } from "node:zlib";

export const JB2A_LOCAL_DIR = join(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "jb2a-patreon");
const INDEX_FILE = join(JB2A_LOCAL_DIR, "index.json");
const SHARE_URL = "https://storage.jb2a.com/public.php/webdav/";

function shareToken() {
  const file = join(JB2A_LOCAL_DIR, ".share");
  if (!existsSync(file)) throw new Error(`Manca ${file}: il token del link di download JB2A (la parte dopo /s/).`);
  return readFileSync(file, "utf8").trim();
}

async function range(start, end) {
  const auth = "Basic " + Buffer.from(`${shareToken()}:`).toString("base64");
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(SHARE_URL, { headers: { Authorization: auth, Range: `bytes=${start}-${end}` } });
      if (res.status !== 206) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (error) { if (attempt >= 3) throw error; }
  }
}

let indexPromise = null;
// Path inside the library (or the module root) → its place in the zip.
export function loadJb2aIndex() {
  indexPromise ||= (async () => {
    if (existsSync(INDEX_FILE)) return JSON.parse(readFileSync(INDEX_FILE, "utf8"));
    const auth = "Basic " + Buffer.from(`${shareToken()}:`).toString("base64");
    const head = await fetch(SHARE_URL, { method: "HEAD", headers: { Authorization: auth } });
    const total = Number(head.headers.get("content-length"));
    const tail = await range(total - 65536, total - 1);
    const loc = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x06, 0x07]));
    const recordAt = Number(tail.readBigUInt64LE(loc + 8));
    const z64 = await range(recordAt, recordAt + 55);
    const cdSize = Number(z64.readBigUInt64LE(40)), cdOffset = Number(z64.readBigUInt64LE(48));
    const cd = await range(cdOffset, cdOffset + cdSize - 1);
    const index = {};
    for (let p = 0; p < cd.length && cd.readUInt32LE(p) === 0x02014b50;) {
      const method = cd.readUInt16LE(p + 10);
      let csize = cd.readUInt32LE(p + 20), usize = cd.readUInt32LE(p + 24), offset = cd.readUInt32LE(p + 42);
      const nameLen = cd.readUInt16LE(p + 28), extraLen = cd.readUInt16LE(p + 30), commentLen = cd.readUInt16LE(p + 32);
      const name = cd.toString("utf8", p + 46, p + 46 + nameLen);
      const extra = cd.subarray(p + 46 + nameLen, p + 46 + nameLen + extraLen);
      for (let q = 0; q < extra.length;) {
        const id = extra.readUInt16LE(q), len = extra.readUInt16LE(q + 2);
        if (id === 1) {
          let r = q + 4;
          if (usize === 0xffffffff) { usize = Number(extra.readBigUInt64LE(r)); r += 8; }
          if (csize === 0xffffffff) { csize = Number(extra.readBigUInt64LE(r)); r += 8; }
          if (offset === 0xffffffff) offset = Number(extra.readBigUInt64LE(r));
        }
        q += 4 + len;
      }
      if (!name.endsWith("/")) index[name.replace(/^jb2a_patreon\/(Library\/)?/, "")] = { method, csize, usize, offset };
      p += 46 + nameLen + extraLen + commentLen;
    }
    mkdirSync(JB2A_LOCAL_DIR, { recursive: true });
    writeFileSync(INDEX_FILE, JSON.stringify(index));
    return index;
  })();
  return indexPromise;
}

const pending = new Map();
// One file of the library, extracted once into jb2a-patreon/ and then served from disk.
export async function jb2aFile(path) {
  const target = join(JB2A_LOCAL_DIR, path);
  if (existsSync(target)) return target;
  if (!pending.has(path)) pending.set(path, (async () => {
    const entry = (await loadJb2aIndex())[path];
    if (!entry) throw new Error(`Non nella libreria: ${path}`);
    const header = await range(entry.offset, entry.offset + 29);
    const start = entry.offset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
    const data = await range(start, start + entry.csize - 1);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, entry.method === 8 ? inflateRawSync(data) : data);
    return target;
  })().finally(() => pending.delete(path)));
  return pending.get(path);
}

// The library by animation "shape": a file name without color, size and distance. One entry per shape with its
// variants, its smallest clip and the thumbnail closest to it.
const COLOR = /_(Regular|Dark|Bright|Light)?_?(Blue|Green|Red|Purple|Yellow|Orange|Pink|White|Black|Grey|Gray|Teal|Brown|Rainbow|Refraction|Multicolou?red)[A-Za-z]*\d*(?=_|$)/g;
export function shapeOf(path) {
  return path.replace(/\.webm$/, "").replace(/_\d+x\d+$/, "").replace(/_\d{2}ft(_\d+)?(_\d+x\d+)?$/, "")
    .replace(COLOR, "_<c>").replace(/(_<c>)+/g, "_<c>");
}
export async function jb2aShapes() {
  const index = await loadJb2aIndex();
  const paths = Object.keys(index);
  const thumbs = new Set(paths.filter((p) => p.endsWith("_Thumb.webp")));
  // A thumbnail of the same shape when none matches the clip's exact name (another color, size or distance).
  const thumbByShape = new Map();
  for (const thumb of thumbs) {
    const key = shapeOf(thumb.replace(/_Thumb\.webp$/, ".webm"));
    if (!thumbByShape.has(key)) thumbByShape.set(key, thumb);
  }
  const shapes = new Map();
  for (const path of paths) {
    if (!path.endsWith(".webm")) continue;
    const key = shapeOf(path);
    const shape = shapes.get(key) || { key, family: path.split("/").slice(0, 2).join("/"), variants: [] };
    shape.variants.push({ path, size: index[path].usize });
    shapes.set(key, shape);
  }
  return [...shapes.values()].map((shape) => {
    shape.variants.sort((a, b) => a.size - b.size);
    const stems = shape.variants.map((v) => v.path.replace(/(_\d{2}ft(_\d+)?)?(_\d+x\d+)?\.webm$/, "_Thumb.webp"));
    const thumb = stems.find((t) => thumbs.has(t)) || thumbByShape.get(shape.key) || null;
    return { ...shape, thumb };
  });
}
