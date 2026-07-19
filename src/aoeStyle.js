import { ID } from "./constants.js";

export const AOE_STYLE_KEY = `${ID}/aoe-style`;
export const AOE_STYLE_CHANNEL = `${ID}/aoe-style-events`;
export const AOE_SETTINGS_POPOVER_ID = `${ID}/aoe-style-popover`;
export const AOE_AREA_META_KEY = `${ID}/aoeArea`;

export const DEFAULT_AOE_STYLE = Object.freeze({
  fillColor: "#38bdf8",
  strokeColor: "#7dd3fc",
  fillOpacity: 0.18,
  strokeWidth: 1,
});

function normalizeColor(value, fallback) {
  const color = String(value || "").trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(color) ? color : fallback;
}

export function normalizeAoEStyle(value = {}) {
  const legacyColor = normalizeColor(value.color, DEFAULT_AOE_STYLE.fillColor);
  const fillColor = normalizeColor(value.fillColor, legacyColor);
  const strokeColor = normalizeColor(value.strokeColor, legacyColor);
  const fillOpacity = Math.max(0.05, Math.min(0.45, Number(value.fillOpacity) || DEFAULT_AOE_STYLE.fillOpacity));
  const strokeWidth = Math.max(0.4, Math.min(3, Number(value.strokeWidth) || DEFAULT_AOE_STYLE.strokeWidth));
  return { fillColor, strokeColor, fillOpacity, strokeWidth };
}

export function loadAoEStyle() {
  try { return normalizeAoEStyle(JSON.parse(localStorage.getItem(AOE_STYLE_KEY) || "{}")); }
  catch { return { ...DEFAULT_AOE_STYLE }; }
}

export function saveAoEStyle(value) {
  const style = normalizeAoEStyle(value);
  localStorage.setItem(AOE_STYLE_KEY, JSON.stringify(style));
  return style;
}
