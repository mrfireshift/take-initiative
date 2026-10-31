// Classic (extended) tracker placement: which side of the screen it docks to and how far from that side.
// Pure geometry, stored per browser. The left side at 22 px is the historical default; the right side clears
// OBR's tool column, so the extension panels that OBR opens at the top left (e.g. Dice) stay visible.
export const TRACKER_CLASSIC_DEFAULT_TOP = 52;
export const TRACKER_CLASSIC_LEFT_INSET = 22;
export const TRACKER_CLASSIC_RIGHT_INSET = 96;
export const TRACKER_CLASSIC_BOTTOM_GAP = 72;
export const TRACKER_CLASSIC_MIN_HEIGHT = 360;
const EDGE = 12;

const finite = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function defaultTrackerPlacement(side = "left") {
  return side === "right"
    ? { side: "right", inset: TRACKER_CLASSIC_RIGHT_INSET, top: TRACKER_CLASSIC_DEFAULT_TOP }
    : { side: "left", inset: TRACKER_CLASSIC_LEFT_INSET, top: TRACKER_CLASSIC_DEFAULT_TOP };
}

export function normalizeTrackerPlacement(value) {
  if (!value || typeof value !== "object" || !["left", "right"].includes(value.side)) return defaultTrackerPlacement();
  const fallback = defaultTrackerPlacement(value.side);
  return { side: value.side, inset: Math.max(0, Math.round(finite(value.inset, fallback.inset))), top: Math.max(0, Math.round(finite(value.top, fallback.top))) };
}

// The popover request for a placement: the docked side is the anchored edge, so a resized window keeps it there.
export function trackerPlacementFrame(placement, { width = 340, viewportWidth = 1200, viewportHeight = 900 } = {}) {
  const { side, inset, top } = normalizeTrackerPlacement(placement);
  const maxInset = Math.max(EDGE, viewportWidth - width - EDGE);
  const safeInset = clamp(inset, EDGE, maxInset);
  const safeTop = clamp(top, EDGE, Math.max(EDGE, viewportHeight - TRACKER_CLASSIC_MIN_HEIGHT - EDGE));
  const height = Math.max(TRACKER_CLASSIC_MIN_HEIGHT, Math.floor(viewportHeight - safeTop - TRACKER_CLASSIC_BOTTOM_GAP));
  const left = side === "right" ? viewportWidth - safeInset - width : safeInset;
  return {
    side, left, top: safeTop, width, height,
    anchorPosition: side === "right" ? { left: viewportWidth - safeInset, top: safeTop } : { left: safeInset, top: safeTop },
    origin: { horizontal: side === "right" ? "RIGHT" : "LEFT", vertical: "TOP" },
  };
}

// A drag of (deltaX, deltaY): the tracker docks to the side nearer to its centre, at the dropped distance.
export function moveTrackerPlacement(placement, deltaX, deltaY, { width = 340, viewportWidth = 1200, viewportHeight = 900 } = {}) {
  const frame = trackerPlacementFrame(placement, { width, viewportWidth, viewportHeight });
  const left = clamp(frame.left + finite(deltaX, 0), EDGE, Math.max(EDGE, viewportWidth - width - EDGE));
  const top = clamp(frame.top + finite(deltaY, 0), EDGE, Math.max(EDGE, viewportHeight - TRACKER_CLASSIC_MIN_HEIGHT - EDGE));
  const right = left + width / 2 >= viewportWidth / 2;
  return right
    ? { side: "right", inset: Math.round(viewportWidth - left - width), top: Math.round(top) }
    : { side: "left", inset: Math.round(left), top: Math.round(top) };
}

// The other side, at its default distance; the height on screen stays.
export function toggleTrackerSide(placement) {
  const current = normalizeTrackerPlacement(placement);
  return { ...defaultTrackerPlacement(current.side === "right" ? "left" : "right"), top: current.top };
}

// Side panels (spells, references, effects) open next to the tracker: to its right when it docks left (the
// historical position), to its left when it docks right.
export function trackerSidePanelAnchor(placement, { trackerWidth = 340, viewportWidth = 1200, panelWidth = 560 } = {}) {
  const current = normalizeTrackerPlacement(placement);
  if (current.side === "right") {
    const trackerLeft = viewportWidth - Math.max(EDGE, current.inset) - trackerWidth;
    return { left: Math.max(EDGE, Math.round(trackerLeft - 14 - panelWidth)), top: TRACKER_CLASSIC_DEFAULT_TOP };
  }
  return { left: Math.ceil(trackerWidth + Math.max(0, current.inset - TRACKER_CLASSIC_LEFT_INSET)) + 14, top: TRACKER_CLASSIC_DEFAULT_TOP };
}

// The side a menu opened from the extended tracker grows towards, from the click at `left`: "LEFT" is its left edge
// at the click (it grows rightwards), "RIGHT" its right edge. Towards the map: leftwards when the tracker docks on
// the right, so it never covers the tracker; then rightwards where there is no room on the left, and the other way.
export function contextMenuHorizontalOrigin({ left = 0, width = 0, viewportWidth = 1200, margin = 12, dockedSide = "" } = {}) {
  const fitsRight = left + width <= viewportWidth - margin;
  const fitsLeft = left - width >= margin;
  if (dockedSide === "right") return fitsLeft || !fitsRight ? "RIGHT" : "LEFT";
  return fitsRight ? "LEFT" : "RIGHT";
}

// ---- GM -> players: the shared tracker view (room metadata `${ID}/ui`, field `view`) ----
// Screens differ, so the shared view is proportional: the layout, the extended tracker's side with its distance
// and height as fractions of the screen, the compact bar's anchor as fractions too.
const ratio = (value, size) => Math.round((Number(value) / Math.max(1, Number(size) || 1)) * 10000) / 10000;
const fraction = (value) => (Number.isFinite(Number(value)) ? clamp(Number(value), 0, 1) : null);

export function sharedTrackerView({ layout = "classic", classic = null, compact = null, viewportWidth = 1200, viewportHeight = 900 } = {}) {
  const placement = normalizeTrackerPlacement(classic);
  return {
    layout: layout === "compact" ? "compact" : "classic",
    side: placement.side,
    inset: ratio(placement.inset, viewportWidth),
    top: ratio(placement.top, viewportHeight),
    ...(compact && Number.isFinite(Number(compact.left)) && Number.isFinite(Number(compact.top))
      ? { cx: ratio(compact.left, viewportWidth), cy: ratio(compact.top, viewportHeight) } : {}),
  };
}

// The shared view on this screen; null when it is not a valid view.
export function localTrackerView(view, { viewportWidth = 1200, viewportHeight = 900 } = {}) {
  if (!view || typeof view !== "object" || !["classic", "compact"].includes(view.layout) || !["left", "right"].includes(view.side)) return null;
  const inset = fraction(view.inset), top = fraction(view.top);
  if (inset === null || top === null) return null;
  const cx = fraction(view.cx), cy = fraction(view.cy);
  return {
    layout: view.layout,
    classic: normalizeTrackerPlacement({ side: view.side, inset: Math.round(inset * viewportWidth), top: Math.round(top * viewportHeight) }),
    compact: cx !== null && cy !== null ? { left: Math.round(cx * viewportWidth), top: Math.round(cy * viewportHeight) } : null,
  };
}
