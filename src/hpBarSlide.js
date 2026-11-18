// Lot M5 of the animations study (docs/STUDIO_ANIMAZIONI.md, 18/11): the tracker's HP bars slid to nowhere, they jumped
// (158 → 77px in one frame), and the card was rebuilt ~55ms later with a new bar already at the end. Every writer of the
// bar stays as it is (the card builders, the live HP sync, the HP editor's projection): this module watches the list,
// remembers the width each creature's bar last showed, and slides a bar that changes, or that is born in a rebuilt card,
// from where the eye saw it to its new width. A bar rebuilt in the middle of a slide takes it up where the old one was.
// Only the drawing: the width written by the tracker is the one the bar ends on (canonical HP, never a stored width).
export const HP_BAR_SLIDE_MS = 180;
export const HP_BAR_SLIDE_EASING = "cubic-bezier(.25,.1,.25,1)";

const FILL_SELECTOR = '[data-hp-fill="1"]';

// A collapsed group's card shows the group's HP under its first member's id: its own key, so opening the group does not
// slide the member's bar from the group's.
export function hpFillKey(fill) {
  const id = fill?.dataset?.itemId;
  if (!id) return "";
  const card = fill.closest?.('[data-tracker-card="1"]');
  return card?.dataset?.groupCollapsed === "1" ? `${id}#group` : String(id);
}

export function hpFillPercent(fill) {
  const value = Number.parseFloat(fill?.style?.width);
  return Number.isFinite(value) ? value : null;
}

// What to do with a bar that shows `to`, given what its creature's bar last showed (`record`) at `now`.
// "remember": nothing to slide; "resume": the same slide, on a rebuilt bar, `elapsed` into it; "slide": a new slide.
export function hpSlidePlan(record, to, now, durationMs = HP_BAR_SLIDE_MS) {
  if (!record) return { action: "remember" };
  const elapsed = now - record.start;
  const running = elapsed >= 0 && elapsed < durationMs;
  if (Math.abs(record.to - to) < 0.01) {
    return running ? { action: "resume", from: record.from, to, elapsed } : { action: "remember" };
  }
  return { action: "slide", to, running };
}

function linearAt(record, now, durationMs) {
  const progress = Math.max(0, Math.min(1, (now - record.start) / durationMs));
  return record.from + (record.to - record.from) * progress;
}

export function installHPBarSlide(root, { win = globalThis.window } = {}) {
  if (!root?.querySelectorAll || typeof win?.MutationObserver !== "function") return () => {};
  const shown = new Map();
  const now = () => win.performance?.now?.() ?? Date.now();
  const reducedMotion = () => !!win.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  const tempPartOf = (fill) => Array.from(fill.parentElement?.children || [])
    .find((child) => child?.dataset?.hpTempFill === "1") || null;

  const cancelSlides = (fill) => {
    for (const element of [fill, tempPartOf(fill)]) {
      for (const animation of element?.getAnimations?.() || []) {
        if (animation.__hpBarSlide) animation.cancel();
      }
    }
  };

  const animate = (fill, from, to, elapsed) => {
    const options = { duration: HP_BAR_SLIDE_MS, easing: HP_BAR_SLIDE_EASING };
    const slide = fill.animate?.([{ width: `${from}%` }, { width: `${to}%` }], options);
    if (slide) {
      slide.__hpBarSlide = true;
      slide.currentTime = elapsed;
    }
    // The temporary hit points sit right after the HP (CAP-TEMP): they follow the bar's end.
    const temp = tempPartOf(fill);
    const tempSlide = temp?.animate?.([{ left: `${from}%` }, { left: `${to}%` }], options);
    if (tempSlide) {
      tempSlide.__hpBarSlide = true;
      tempSlide.currentTime = elapsed;
    }
  };

  // Where the bar is drawn now: measured on the bar itself while it slides, else along the slide.
  const shownPercent = (record, at) => {
    const element = record.element;
    const trackWidth = element?.isConnected ? element.parentElement?.clientWidth : 0;
    if (trackWidth > 0 && element.getAnimations?.().some((animation) => animation.__hpBarSlide)) {
      return (element.getBoundingClientRect().width / trackWidth) * 100;
    }
    return linearAt(record, at, HP_BAR_SLIDE_MS);
  };

  const reconcile = (fill) => {
    if (fill.closest?.("[data-active-turn-ghost]")) return;
    const key = hpFillKey(fill);
    const to = hpFillPercent(fill);
    if (!key || to === null) return;
    const record = shown.get(key);
    const at = now();
    const plan = hpSlidePlan(record, to, at);
    if (plan.action === "remember") {
      shown.set(key, { from: to, to, start: record?.start ?? -Infinity, element: fill });
      return;
    }
    if (plan.action === "resume") {
      if (record.element !== fill && !reducedMotion()) animate(fill, plan.from, plan.to, plan.elapsed);
      record.element = fill;
      return;
    }
    const from = plan.running ? shownPercent(record, at) : record.to;
    cancelSlides(fill);
    shown.set(key, { from, to, start: at, element: fill });
    if (!reducedMotion()) animate(fill, from, to, 0);
  };

  const observer = new win.MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "attributes") {
        if (mutation.target?.dataset?.hpFill === "1") reconcile(mutation.target);
        continue;
      }
      for (const node of mutation.addedNodes) {
        if (node?.nodeType !== 1) continue;
        if (node.dataset?.hpFill === "1") reconcile(node);
        node.querySelectorAll?.(FILL_SELECTOR).forEach(reconcile);
      }
    }
  });
  observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["style"] });
  root.querySelectorAll(FILL_SELECTOR).forEach(reconcile);
  return () => observer.disconnect();
}
