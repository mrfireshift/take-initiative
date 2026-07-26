import { ID } from "./constants.js";

const PAYLOAD_KEY = `${ID}/compact-effects-payload`;
const root = document.querySelector("#effects");

function hueFromKey(key) {
  let hash = 0;
  for (const char of String(key || "")) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % 360;
}

function effectTone(effect) {
  if (effect.kind === "buff") {
    return { background: "#15803d", border: "#86efac" };
  }
  if (effect.kind === "debuff") {
    return { background: "#b91c1c", border: "#fca5a5" };
  }
  if (effect.kind === "concentration") {
    return { background: "#2563eb", border: "#93c5fd" };
  }
  if (effect.kind === "spell") {
    const hue = hueFromKey(effect.key);
    return {
      background: `hsl(${hue}, 70%, 45%)`,
      border: `hsla(${hue}, 80%, 55%, .55)`,
    };
  }
  return { background: "rgba(8,12,21,.94)", border: "rgba(255,255,255,.38)" };
}

function buildPill(effect) {
  const pill = document.createElement("span");
  const tone = effectTone(effect);
  pill.textContent = String(effect.label || "Effetto");
  pill.title = String(effect.title || effect.label || "Effetto");
  Object.assign(pill.style, {
    width: "100%",
    minWidth: "0",
    height: "14px",
    padding: "0 5px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    boxSizing: "border-box",
    overflow: "hidden",
    border: `1px solid ${tone.border}`,
    borderRadius: "999px",
    background: tone.background,
    color: "#fff",
    fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    fontSize: "8px",
    fontWeight: "600",
    lineHeight: "1",
    textAlign: "center",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    boxShadow: "0 1px 4px rgba(0,0,0,.45)",
  });
  return pill;
}

let payload = {};
try { payload = JSON.parse(localStorage.getItem(PAYLOAD_KEY) || "{}"); } catch {}
const effects = Array.isArray(payload.effects) ? payload.effects : [];

Object.assign(root.style, {
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  justifyContent: "flex-start",
  gap: "1px",
  overflow: "visible",
  background: "transparent",
});
root.replaceChildren(...effects.map(buildPill));
