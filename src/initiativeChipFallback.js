import {
  buildConditionChips,
  getEffectiveConditionInstances,
} from "./conditions.js";
import { spellColorFor } from "./spellColorCore.js";

const CHIP_FONT_PX = 11;
const CHIP_HEIGHT_PX = 18;
const CHIP_PAD_X_PX = 6;
const CHIP_RADIUS_PX = 9;
const CHIP_GAP_PX = 2;

function __styleChip(el) {
  Object.assign(el.style, {
    display: "inline-flex",
    alignItems: "center",
    height: CHIP_HEIGHT_PX + "px",
    lineHeight: CHIP_HEIGHT_PX + "px",
    padding: `0 ${CHIP_PAD_X_PX}px`,
    borderRadius: CHIP_RADIUS_PX + "px",
    fontSize: CHIP_FONT_PX + "px",
    fontWeight: "600",
    letterSpacing: "0.2px",
  });
}

function __spellKey(name) {
  return String(name || "").trim().toLowerCase();
}

function __spellColor(key) {
  return spellColorFor(key);
}

function __chip(label, compact=true) {
  const s = document.createElement("span");
  s.textContent = String(label);
  Object.assign(s.style, {
    fontSize: compact ? "10px" : "11px",
    fontWeight: "700",
    padding: compact ? "1px 5px" : "2px 6px",
    borderRadius: "999px",
    background: "rgba(0,0,0,.72)",
    color: "#fff",
    border: "1px solid rgba(255,255,255,.18)",
    lineHeight: "1",
    userSelect: "none",
    whiteSpace: "nowrap",
  });
  return s;
}

function __buildChipsSimple(cond, opts = {}) {
  const frag = document.createDocumentFragment();
  const cap = Array.isArray(opts.cap) ? opts.cap : [];
  const compact = !!opts.compact;

  const flags  = (cond && typeof cond === "object" && cond.flags && typeof cond.flags === "object")
    ? cond.flags : {};
  let custom = (cond && typeof cond === "object" && Array.isArray(cond.custom))
    ? cond.custom
    : [];

  // se custom e oggetto (vecchi dump), usa le chiavi truthy
  if (!Array.isArray(custom) && custom && typeof custom === "object") {
    custom = Object.keys(custom).filter(k => !!custom[k]);
  }

  const instances = getEffectiveConditionInstances(cond);
  if (instances.length) {
    const grouped = new Map();
    for (const instance of instances) {
      const name = String(instance.condition || "").trim();
      if (!name) continue;
      const current = grouped.get(name) || 0;
      grouped.set(name, current + 1);
    }
    const names = [
      ...cap.filter((name) => grouped.has(name)),
      ...Array.from(grouped.keys()).filter((name) => !cap.includes(name)),
    ];
    for (const name of names) {
      const count = grouped.get(name) || 0;
      frag.appendChild(__chip(count > 1 ? `${name} x${count}` : name, compact));
    }
    return frag;
  }
  for (const name of cap) {
    if (flags[name]) frag.appendChild(__chip(name, compact));
  }
  for (const k of Object.keys(flags)) {
    if (!cap.includes(k) && flags[k]) frag.appendChild(__chip(k, compact));
  }
  for (const t of custom) {
    if (t != null && String(t).trim()) frag.appendChild(__chip(String(t), compact));
  }
  return frag;
}

function __buildConditionChipsSafe(cond, opts) {
  try {
    if (typeof buildConditionChips === "function") {
      return buildConditionChips(cond, opts);
    }
  } catch (err) {
    console.warn("[conditions] chip render (fallback):", err?.message || err);
  }
  return __buildChipsSimple(cond, opts);
}

// End initiative chip fallback family.
export {
  CHIP_GAP_PX,
  __buildChipsSimple,
  __buildConditionChipsSafe,
  __chip,
  __spellColor,
  __spellKey,
  __styleChip,
};
