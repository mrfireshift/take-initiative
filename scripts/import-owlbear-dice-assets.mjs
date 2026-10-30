// Imports the 3D dice assets of Owlbear Rodeo Dice (GNU GPLv3, https://github.com/owlbear-rodeo/dice) for the Online
// dice tray (docs/PIANO_DADI_ONLINE.md, lot D-2). Usage: node scripts/import-owlbear-dice-assets.mjs <dice checkout>
// It copies the rounded dice meshes, the tray, the eight dice styles and the light map into public/dice/, and reads
// from the checkout's sources (as text, nothing is executed) each die's number locators, mesh rotation and collider
// into src/diceAssets.json.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const checkout = process.argv[2];
if (!checkout || !existsSync(path.join(checkout, "src", "meshes", "rounded"))) {
  console.error("Uso: node scripts/import-owlbear-dice-assets.mjs <cartella del repository owlbear-rodeo/dice>");
  process.exit(1);
}
const root = process.cwd();
const source = (...parts) => path.join(checkout, "src", ...parts);
const publicDir = path.join(root, "public", "dice");

const DICE = ["d4", "d6", "d8", "d10", "d12", "d20", "d100"];
const STYLES = Object.freeze({
  galaxy: { label: "Galassia", material: "physical", maps: ["albedo", "orm", "normal"], density: 1,
    params: { clearcoat: 1, clearcoatRoughness: 0.3 } },
  gemstone: { label: "Gemma", material: "physical", maps: ["albedo", "orm", "normal"], density: 1, params: {} },
  glass: { label: "Vetro", material: "physical", maps: ["albedo", "mask", "normal"], density: 1.5,
    params: { sheen: 1, sheenColor: "#4abff4", roughness: 0.3, metalness: 0, transmission: 1, thickness: 2,
      envMapIntensity: 1, attenuationColor: "#2bff73", attenuationDistance: 0.1 } },
  iron: { label: "Ferro", material: "standard", maps: ["albedo", "orm", "normal"], density: 2, params: { metalness: 1 } },
  nebula: { label: "Nebulosa", material: "physical", maps: ["albedo", "orm", "normal"], density: 1, params: {} },
  sunrise: { label: "Alba", material: "physical", maps: ["albedo", "orm", "normal"], density: 1, params: {} },
  sunset: { label: "Tramonto", material: "physical", maps: ["albedo", "orm", "normal"], density: 1, params: {} },
  walnut: { label: "Noce", material: "standard", maps: ["albedo", "orm", "normal"], density: 1.5, params: {} },
});

// Numbers only, with Math.PI and the four operations: the sources are read as text, never evaluated.
function number(expression) {
  const tokens = String(expression).replace(/Math\.PI/g, String(Math.PI)).match(/\d*\.?\d+(?:e-?\d+)?|[-+*/()]/g) || [];
  let index = 0;
  const peek = () => tokens[index];
  const factor = () => {
    const token = tokens[index++];
    if (token === "-") return -factor();
    if (token === "+") return factor();
    if (token === "(") {
      const value = sum();
      index += 1;
      return value;
    }
    const value = Number(token);
    if (!Number.isFinite(value)) throw new Error(`Espressione non valida: ${expression}`);
    return value;
  };
  const product = () => {
    let value = factor();
    while (peek() === "*" || peek() === "/") value = tokens[index++] === "*" ? value * factor() : value / factor();
    return value;
  };
  const sum = () => {
    let value = product();
    while (peek() === "+" || peek() === "-") value = tokens[index++] === "+" ? value + product() : value - product();
    return value;
  };
  return sum();
}

// A list of numbers; a trailing comma leaves an empty entry, skipped.
const vector = (text) => text.split(",").map((part) => part.trim()).filter(Boolean).map(number);

function readMesh(die) {
  const text = readFileSync(source("meshes", "rounded", `${die.toUpperCase()}.tsx`), "utf8");
  const meshTag = /<mesh\b[\s\S]*?>/.exec(text)?.[0] || "";
  const rotation = /rotation=\{\[([^\]]+)\]\}/.exec(meshTag);
  const locators = [];
  const pattern = /name="(\d+)_locator_(\d+)"\s*position=\{\[([^\]]+)\]\}/g;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    locators.push({ value: Number(match[2]), position: vector(match[3]) });
  }
  if (!locators.length) throw new Error(`Nessun localizzatore in ${die}`);
  return { meshRotation: rotation ? vector(rotation[1]) : [0, 0, 0], locators };
}

function readCollider(die) {
  const file = die === "d100" ? "D10Collider.tsx" : `${die.toUpperCase()}Collider.tsx`;
  const text = readFileSync(source("colliders", file), "utf8");
  const list = /const vertices = \[([\s\S]*?)\]\.map/.exec(text);
  if (!list) throw new Error(`Collider non trovato per ${die}`);
  const values = vector(list[1].replace(/\s+/g, " ")).map((value) => value / 10);
  const points = [];
  for (let i = 0; i < values.length; i += 3) points.push(values.slice(i, i + 3).map((v) => Math.round(v * 1e6) / 1e6));
  return points;
}

function copy(from, to) {
  mkdirSync(path.dirname(to), { recursive: true });
  copyFileSync(from, to);
}

let commit = "";
try { commit = execFileSync("git", ["-C", checkout, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(); } catch {}

const dice = {};
for (const die of DICE) {
  copy(source("meshes", "rounded", `${die}.glb`), path.join(publicDir, "meshes", `${die}.glb`));
  dice[die] = { mesh: `dice/meshes/${die}.glb`, scale: 0.1, ...readMesh(die), collider: readCollider(die) };
}
copy(source("meshes", "tray.glb"), path.join(publicDir, "meshes", "tray.glb"));

const styles = {};
for (const [style, definition] of Object.entries({ ...STYLES, tray: { material: "standard", maps: ["albedo", "orm", "normal"], params: {} } })) {
  const maps = {};
  for (const map of definition.maps) {
    const file = map === "mask" ? "mask.png" : `${map}.jpg`;
    copy(source("materials", style, file), path.join(publicDir, "materials", style, file));
    maps[map] = `dice/materials/${style}/${file}`;
  }
  styles[style] = { ...definition, maps };
}
copy(source("environment.hdr"), path.join(publicDir, "environment.hdr"));

const assets = {
  source: { repository: "https://github.com/owlbear-rodeo/dice", commit, license: "GPL-3.0" },
  dice,
  tray: { mesh: "dice/meshes/tray.glb", scale: 0.1, offsetY: -0.33, material: "tray" },
  styles,
  environment: "dice/environment.hdr",
};
writeFileSync(path.join(root, "src", "diceAssets.json"), `${JSON.stringify(assets, null, 2)}\n`);
writeFileSync(path.join(publicDir, "NOTICE.md"), `# Asset dei dadi 3D

Modelli, materiali, vassoio e mappa di luce vengono da Owlbear Rodeo Dice
(https://github.com/owlbear-rodeo/dice${commit ? `, commit ${commit}` : ""}),
Copyright (C) 2023 Owlbear Rodeo, distribuiti secondo la GNU GPLv3
(vedi LICENSE nella radice del repository). Importati con
scripts/import-owlbear-dice-assets.mjs.
`);
console.log(`Asset dei dadi importati da ${checkout}${commit ? ` (${commit.slice(0, 8)})` : ""}.`);
