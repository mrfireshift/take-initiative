// What sits on a token without turning with it (lot L20): the map HP bar follows the token's scale but never its
// rotation, the effect pills never turn either.

// The token's bounds as if it were not rotated: the same centre, its image's size at its scale. OBR's bounds of a
// rotated token are its turned box, wider and taller: a bar measured on them grew and dropped at every turn. Bounds of
// an unrotated token, or of an item without an image, are returned as they are.
export function unrotatedTokenBounds(bounds, token, sceneDpi) {
  const rotation = ((Number(token?.rotation) || 0) % 360 + 360) % 360;
  if (!bounds?.min || !bounds?.max || rotation === 0) return bounds;
  const imageWidth = Number(token?.image?.width);
  const imageHeight = Number(token?.image?.height);
  const gridDpi = Number(token?.grid?.dpi);
  const dpi = Number(sceneDpi);
  if (!(imageWidth > 0 && imageHeight > 0 && gridDpi > 0 && dpi > 0)) return bounds;
  const width = imageWidth * Math.abs(Number(token?.scale?.x ?? 1)) * dpi / gridDpi;
  const height = imageHeight * Math.abs(Number(token?.scale?.y ?? 1)) * dpi / gridDpi;
  const center = { x: (bounds.min.x + bounds.max.x) / 2, y: (bounds.min.y + bounds.max.y) / 2 };
  return {
    ...bounds,
    min: { x: center.x - width / 2, y: center.y - height / 2 },
    max: { x: center.x + width / 2, y: center.y + height / 2 },
    width,
    height,
    center,
  };
}

// An item's attachment behaviours with the ones it must not inherit from its token added.
export function attachmentBehaviorsWith(current, ...required) {
  return [...new Set([...(Array.isArray(current) ? current : []), ...required])];
}

export function hasAttachmentBehaviors(item, ...required) {
  const current = Array.isArray(item?.disableAttachmentBehavior) ? item.disableAttachmentBehavior : [];
  return required.every((behavior) => current.includes(behavior));
}
