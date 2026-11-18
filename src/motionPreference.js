// Lot M3 of the animations study (docs/STUDIO_ANIMAZIONI.md, 18/11): the reduced motion preference for the JavaScript
// animations. The stylesheet's rule (public/ui-typography.css) cannot stop a scroll asked with behavior "smooth".
export function prefersReducedMotion(win = globalThis.window) {
  return !!win?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
}

export function smoothScrollBehavior(win = globalThis.window) {
  return prefersReducedMotion(win) ? "auto" : "smooth";
}
