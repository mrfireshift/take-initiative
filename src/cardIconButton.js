// Round icon buttons of the tracker card's HP row (character sheet, reaction, and the ± drawn alike): one look for all
// of them. The icon is a public SVG used as a CSS mask, so it takes the button's colour whatever colours the file has.
// 16px: the row has 21px between the name and the HP bar, and the icon keeps 3px above the bar (CARD_ICON_LIFT).
// The clickable area is 24px all the same (hitAreaCore.js).
export const CARD_ICON_BUTTON_SIZE = 16;
export const CARD_ICON_LIFT = "2px";
export const CARD_ICON_BUTTON_STYLE = Object.freeze({
  flex: "0 0 auto",
  minWidth: `${CARD_ICON_BUTTON_SIZE}px`,
  width: `${CARD_ICON_BUTTON_SIZE}px`,
  height: `${CARD_ICON_BUTTON_SIZE}px`,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0",
  borderRadius: "999px",
  boxShadow: "0 1px 3px rgba(0,0,0,.35)",
  pointerEvents: "auto",
});

// Palettes: colour of the icon, fill and ring.
export const CARD_ICON_BUTTON_TONES = Object.freeze({
  sheet: Object.freeze({ color: "#eff6ff", background: "rgba(30,64,175,.62)", border: "1px solid rgba(96,165,250,.75)" }),
  ready: Object.freeze({ color: "#ecfdf5", background: "rgba(6,95,70,.62)", border: "1px solid rgba(52,211,153,.75)" }),
  spent: Object.freeze({ color: "rgba(255,255,255,.42)", background: "rgba(127,29,29,.55)", border: "1px solid rgba(248,113,113,.55)" }),
});

export function cardIconAssetUrl(name) {
  return `${import.meta.env?.BASE_URL || "/"}${name}`;
}

export function buildCardIconGlyph(name, size = 11, documentRef = globalThis.document) {
  const url = cardIconAssetUrl(name);
  const glyph = documentRef.createElement("span");
  glyph.setAttribute("aria-hidden", "true");
  Object.assign(glyph.style, {
    display: "block",
    width: `${size}px`,
    height: `${size}px`,
    background: "currentColor",
    pointerEvents: "none",
    WebkitMask: `url("${url}") center / contain no-repeat`,
    mask: `url("${url}") center / contain no-repeat`,
  });
  return glyph;
}

// The GM's sign that the players do not see this token (lot L16): an eye struck through, beside the name. The players'
// tracker never draws a hidden token, so only the GM's cards carry it.
export function buildHiddenTokenMark(size = 11, documentRef = globalThis.document) {
  const mark = buildCardIconGlyph("hidden-token.svg", size, documentRef);
  mark.dataset.hiddenTokenMark = "1";
  mark.removeAttribute("aria-hidden");
  mark.setAttribute("role", "img");
  mark.title = "Token nascosto: i giocatori non lo vedono";
  mark.setAttribute("aria-label", mark.title);
  Object.assign(mark.style, {
    flex: "0 0 auto",
    color: "rgba(255,255,255,.94)",
    pointerEvents: "auto",
  });
  return mark;
}

// The portrait of a token the GM keeps hidden: dimmed, as Owlbear shows it on the map, with the eye struck through
// in its middle. It catches no click: the card opens, drags and selects as before.
export function markHiddenTokenPortrait(portrait, inner, size, documentRef = globalThis.document) {
  if (!portrait || !inner) return null;
  portrait.dataset.hiddenToken = "1";
  Object.assign(inner.style, { opacity: ".42", filter: "grayscale(.65)" });
  const overlay = documentRef.createElement("div");
  overlay.dataset.hiddenTokenOverlay = "1";
  Object.assign(overlay.style, {
    position: "absolute",
    inset: "0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
    zIndex: "1",
  });
  const mark = buildHiddenTokenMark(Math.round(size * 0.54), documentRef);
  Object.assign(mark.style, { pointerEvents: "none", filter: "drop-shadow(0 1px 3px rgba(0,0,0,.9))" });
  overlay.appendChild(mark);
  portrait.appendChild(overlay);
  if (!portrait.title) portrait.title = mark.title;
  return overlay;
}

export function styleCardIconButton(node, tone) {
  Object.assign(node.style, CARD_ICON_BUTTON_STYLE, CARD_ICON_BUTTON_TONES[tone] || {});
  return node;
}
