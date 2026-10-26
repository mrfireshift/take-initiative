// A token's image replaced by a portrait (attacchi dei mostri, fase 4, lotto 3). Pure, on the draft item of an
// updateItems call. The token keeps its size on the map: the grid of the image is computed again from the new file's
// size, so as many cells as before span its width; the offset (the token's anchor) keeps the same place in the image.
// Only an image item; anything else stays as it is.
export function setTokenPortrait(item, { url, width, height, mime = "image/webp" } = {}) {
  if (!item || item.type !== "IMAGE" || !item.image || !item.grid) return false;
  const oldWidth = Number(item.image.width);
  const oldHeight = Number(item.image.height);
  const oldDpi = Number(item.grid.dpi);
  const newWidth = Math.round(Number(width));
  const newHeight = Math.round(Number(height));
  if (!url || ![oldWidth, oldHeight, oldDpi, newWidth, newHeight].every((value) => Number.isFinite(value) && value > 0)) return false;
  const cells = oldWidth / oldDpi;
  const offset = item.grid.offset || { x: oldWidth / 2, y: oldHeight / 2 };
  item.image = { ...item.image, url, mime, width: newWidth, height: newHeight };
  item.grid = { ...item.grid, dpi: newWidth / cells,
    offset: { x: (Number(offset.x) / oldWidth) * newWidth, y: (Number(offset.y) / oldHeight) * newHeight } };
  return true;
}
