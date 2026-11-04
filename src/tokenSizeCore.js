// A monster's size on the map, from its stat block. Pure, on plain items and on the draft item of an updateItems call.
// The size is read at the import and written once, after the sheet's Salva: it is not kept on the card.
import { ID } from "./constants.js";
import { monsterNamesakes } from "./monsterHitPointsImportCore.js";

const META_KEY = `${ID}/meta`;

// Tiny stays on one square: the plugin's geometry counts at least one anyway, and the bars and labels are drawn for it.
export const MONSTER_TOKEN_SIZES = Object.freeze({
  tiny: Object.freeze({ label: "Minuscola", cells: 1 }),
  small: Object.freeze({ label: "Piccola", cells: 1 }),
  medium: Object.freeze({ label: "Media", cells: 1 }),
  large: Object.freeze({ label: "Grande", cells: 2 }),
  huge: Object.freeze({ label: "Enorme", cells: 3 }),
  gargantuan: Object.freeze({ label: "Mastodontica", cells: 4 }),
});

const SIZE_ALIASES = new Map(Object.entries({
  tiny: "tiny", t: "tiny", minuscola: "tiny", minuscolo: "tiny",
  small: "small", s: "small", piccola: "small", piccolo: "small",
  medium: "medium", m: "medium", media: "medium", medio: "medium",
  large: "large", l: "large", grande: "large",
  huge: "huge", h: "huge", enorme: "huge",
  gargantuan: "gargantuan", g: "gargantuan", mastodontica: "gargantuan", mastodontico: "gargantuan",
}));

// "Large", "grande" or "L": "large"; "" for what it does not know.
export function normalizeMonsterSize(value) {
  return SIZE_ALIASES.get(String(value ?? "").trim().toLocaleLowerCase("it")) || "";
}

// "Grande, 2×2 caselle"; "Media, 1 casella".
export function monsterTokenSizeText(size) {
  const entry = MONSTER_TOKEN_SIZES[size];
  if (!entry) return "";
  return `${entry.label}, ${entry.cells === 1 ? "1 casella" : `${entry.cells}×${entry.cells} caselle`}`;
}

// The squares an image spans at scale 1, across and down; null for anything else.
function unscaledCells(item) {
  if (!item || item.type !== "IMAGE" || !item.image || !item.grid) return null;
  const width = Number(item.image.width) / Number(item.grid.dpi);
  const height = Number(item.image.height) / Number(item.grid.dpi);
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 ? { width, height } : null;
}

// The squares the token spans on its longer side, at least 1 as the plugin's geometry counts them; 0 if it is no image.
export function tokenCells(item) {
  const cells = unscaledCells(item);
  if (!cells) return 0;
  const across = cells.width * (Math.abs(Number(item.scale?.x)) || 1);
  const down = cells.height * (Math.abs(Number(item.scale?.y)) || 1);
  return Math.max(1, Math.round(Math.max(across, down)));
}

// The token's scale for that many squares on its longer side: the image keeps its shape, a mirrored token stays mirrored.
export function setTokenCells(item, cells) {
  const unscaled = unscaledCells(item);
  const target = Number(cells);
  if (!unscaled || !Number.isFinite(target) || target <= 0) return false;
  const factor = target / Math.max(unscaled.width, unscaled.height);
  item.scale = { x: (Number(item.scale?.x) < 0 ? -1 : 1) * factor, y: (Number(item.scale?.y) < 0 ? -1 : 1) * factor };
  return true;
}

// Where the token's centre belongs: an even size between the squares, on a corner of the grid, an odd one in a square.
export function tokenCentreSnap(cells) {
  const even = Number(cells) % 2 === 0;
  return { useCorners: even, useCenter: !even };
}

// The tokens to resize: the sheet's and its namesakes, as the shared stat block; never a character, never one already
// that size, so a token the GM has sized by hand to the same squares stays as it is.
export function planMonsterTokenSize({ items = [], sourceId = "", cells } = {}) {
  const source = items.find((item) => item?.id === sourceId);
  const targetIds = [...(source ? [source] : []), ...monsterNamesakes(items, sourceId)]
    .filter((item) => String(item.metadata?.[META_KEY]?.attitude || "").trim().toLowerCase() !== "pc"
      && tokenCells(item) > 0 && tokenCells(item) !== Number(cells))
    .map((item) => item.id);
  return { targetIds };
}
