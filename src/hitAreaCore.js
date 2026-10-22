// The smallest clickable area (WCAG 2.5.8, --obrt-hit-min): a control drawn smaller gets a transparent square of this
// size centred on it, so the drawing keeps its size and only the area that answers the pointer grows.
export const HIT_AREA_MIN_SIZE = 24;

// Appends the transparent square to `control` (a button, or any element with its own click handler): a click on the
// square has the control as its target's closest ancestor, so the control's handlers run as for a click on it. The
// control becomes the square's containing block if it was not positioned. Returns the square.
export function extendHitArea(control, { size = HIT_AREA_MIN_SIZE, documentRef = globalThis.document } = {}) {
  if (!control?.style || !documentRef?.createElement) return null;
  if (!control.style.position || control.style.position === "static") control.style.position = "relative";
  const area = documentRef.createElement("span");
  area.dataset.hitArea = "1";
  area.setAttribute("aria-hidden", "true");
  Object.assign(area.style, {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: `${size}px`,
    height: `${size}px`,
    transform: "translate(-50%, -50%)",
    background: "transparent",
    pointerEvents: "auto",
  });
  control.appendChild(area);
  return area;
}
