// Trasformazioni, lotto W4b (docs/PIANO_TRASFORMAZIONI.md, decisione G36): the token takes the size of the form a pill
// carries, and gets its own back when the pill is gone (its end, an Undo, a rest). What it had goes in a field of the
// token, transformationTokenBefore, written with the first change and taken away with the last. Only the scale (and the
// image) come back, never the position: the creature may have moved in its form.
// 16/11/2026: the form's portrait too, when chosen (mechanics.transformation.portrait): the token wears it, keeping its
// footprint (setTokenPortrait), and gets its own image back at the end; the field keeps the image and its grid.
// Pure: transformationTokenSize.js writes.
import { MONSTER_TOKEN_SIZES, tokenCells } from "./tokenSizeCore.js";
import { activeTransformation, sanitizeTransformationPortrait } from "./transformationFormsCore.js";

export const TRANSFORMATION_TOKEN_BEFORE_FIELD = "transformationTokenBefore";

const isCreatureToken = (item) => item?.type === "IMAGE" && item.layer === "CHARACTER" && !item.attachedTo;

function savedScale(value) {
  const x = Number(value?.scale?.x);
  const y = Number(value?.scale?.y);
  return Number.isFinite(x) && Number.isFinite(y) && x !== 0 && y !== 0 ? { x, y } : null;
}

// The token's own image and grid, as they were before the portrait: null when the field has none (a token changed
// before the portraits, or only resized).
function savedImage(value) {
  const image = value?.image;
  const grid = value?.grid;
  const width = Number(image?.width);
  const height = Number(image?.height);
  const dpi = Number(grid?.dpi);
  if (typeof image?.url !== "string" || !image.url || !(width > 0) || !(height > 0) || !(dpi > 0)) return null;
  return {
    image: { url: image.url, mime: String(image.mime || "image/webp"), width, height },
    grid: { dpi, ...(grid.offset && Number.isFinite(Number(grid.offset.x)) && Number.isFinite(Number(grid.offset.y))
      ? { offset: { x: Number(grid.offset.x), y: Number(grid.offset.y) } } : {}) },
  };
}

// What the token is before the form changes it: its scale, its image and the image's grid.
function tokenSnapshot(item) {
  return {
    scale: { x: Number(item.scale?.x) || 1, y: Number(item.scale?.y) || 1 },
    ...(savedImage({ image: item.image, grid: item.grid }) || {}),
  };
}

/**
 * What the tokens need now:
 * - resize ([{ id, cells, before }]): the form's size;
 * - portrait ([{ id, portrait, before }]): the form's portrait on the token, or ([{ id, image, grid }]) its own image back
 *   while it stays in a form that has none (a new form);
 * - restore ([{ id, scale, image, grid }]): the form is gone, the token as it was.
 * before is what the field keeps, given with the first change of a token (null when the field has it already, or when
 * another entry of the same token gives it). A token whose geometry is unknown, a boss's (its own images), a token
 * already as the form wants it: nothing. A second pass after the writes finds nothing to do.
 */
export function planTransformationTokenSizes(items = [], metaKey = "") {
  const resize = [];
  const restore = [];
  const portrait = [];
  for (const item of Array.isArray(items) ? items : []) {
    if (!isCreatureToken(item)) continue;
    const meta = item.metadata?.[metaKey] || {};
    const kept = Object.hasOwn(meta, TRANSFORMATION_TOKEN_BEFORE_FIELD) ? meta[TRANSFORMATION_TOKEN_BEFORE_FIELD] : undefined;
    const active = activeTransformation(meta);
    if (active) {
      const cells = MONSTER_TOKEN_SIZES[active.form?.size]?.cells || 0;
      const now = tokenCells(item);
      const wanted = meta.initiativeCard?.bossActionBinding ? null : sanitizeTransformationPortrait(active.template?.portrait);
      const keptImage = kept === undefined ? null : savedImage(kept);
      const needResize = !!cells && !!now && now !== cells;
      const needPortrait = !!wanted && item.image?.url !== wanted.url && !!item.grid;
      const before = kept === undefined && (needResize || needPortrait) ? tokenSnapshot(item) : null;
      if (needResize) resize.push({ id: item.id, cells, before });
      if (needPortrait) portrait.push({ id: item.id, portrait: wanted, before: needResize ? null : before });
      else if (!wanted && keptImage && item.image?.url !== keptImage.image.url) portrait.push({ id: item.id, ...keptImage });
      continue;
    }
    if (kept !== undefined) restore.push({ id: item.id, scale: savedScale(kept), ...(savedImage(kept) || {}) });
  }
  return { resize, restore, portrait };
}
