// Lot M2 of the animations study (docs/STUDIO_ANIMAZIONI.md, 18/11): the notices left at full opacity, the popup closed
// under them. Now the panel fades first (its `.is-leaving` rule) and the popup closes after, the same 180ms everywhere;
// at once for who asks for reduced motion.
export const NOTICE_LEAVE_MS = 180;

export function noticeLeaveDelay() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? 0 : NOTICE_LEAVE_MS;
}

// Fades the panels out, then runs `close`. Returns the timer, for a new notice to cancel the closing.
export function leaveNoticeThen(panels, close) {
  const shown = Array.from(panels || []).filter((panel) => panel?.isConnected);
  for (const panel of shown) panel.classList.add("is-leaving");
  const delay = shown.length ? noticeLeaveDelay() : 0;
  if (!delay) {
    close();
    return 0;
  }
  return window.setTimeout(close, delay);
}
