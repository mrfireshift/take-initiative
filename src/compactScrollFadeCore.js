// The compact strip fades on the side where more creatures are scrolled out of view, so a strip that ends at the
// edge of the tracker does not look complete. A pixel of tolerance absorbs the fractional scroll positions of a
// scaled tracker.
const SCROLL_EDGE_TOLERANCE = 1;

export function compactScrollFadeEdges({ scrollLeft = 0, scrollWidth = 0, clientWidth = 0 } = {}) {
  const left = Number(scrollLeft) || 0;
  const hidden = (Number(scrollWidth) || 0) - (Number(clientWidth) || 0);
  if (!(hidden > SCROLL_EDGE_TOLERANCE)) return { left: false, right: false };
  return {
    left: left > SCROLL_EDGE_TOLERANCE,
    right: left < hidden - SCROLL_EDGE_TOLERANCE,
  };
}
