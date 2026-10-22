// Round 18px icon buttons of the tracker card's HP row (character sheet, reaction): one look for all of them. The icon
// is a public SVG used as a CSS mask, so it takes the button's colour whatever colours the file has.
export const CARD_ICON_BUTTON_STYLE = Object.freeze({
  flex: "0 0 auto",
  minWidth: "18px",
  width: "18px",
  height: "18px",
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

export function buildCardIconGlyph(name, size = 13) {
  const url = cardIconAssetUrl(name);
  const glyph = document.createElement("span");
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

export function styleCardIconButton(node, tone) {
  Object.assign(node.style, CARD_ICON_BUTTON_STYLE, CARD_ICON_BUTTON_TONES[tone] || {});
  return node;
}
