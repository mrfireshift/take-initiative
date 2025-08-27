// src/conditions.js
import OBR, { buildText, buildShape } from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";

const META_KEY = `${ID}/meta`;
const COND_LABEL_META = `${ID}/condLabel`;
const COND_WIDGET_META = `${ID}/condWidgetOf`; // = <tokenId>, usato sia su SHAPE che TEXT

// === Catalogo condizioni predefinite (ordine UI)
export const CONDITION_LIST = [
  "Accecato",
  "Affascinato",
  "Afferrato",
  "Assordato",
  "Avvelenato",
  "Incapacitato",
  "Invisibile",
  "Paralizzato",
  "Pietrificato",
  "Privo di sensi",
  "Prono",
  "Spaventato",
  "Stordito",
  "Trattenuto",
  "Indebolimento",
  "Ira",
];

const MAX_CUSTOM_SLOTS = 3;

// Colore bordo per condizione (fallback a PILL_CFG.border)
const COND_BORDER = Object.freeze({
  "Accecato":        "#9b59b6",
  "Affascinato":     "#8e44ad",
  "Afferrato":       "#d35400",
  "Assordato":       "#95a5a6",
  "Avvelenato":      "#2ecc71",
  "Incapacitato":    "#e74c3c",
  "Invisibile":      "#7f8c8d",
  "Paralizzato":     "#3498db",
  "Pietrificato":    "#34495e",
  "Privo di sensi":  "#c0392b",
  "Prono":           "#f39c12",
  "Spaventato":      "#1abc9c",
  "Stordito":        "#e67e22",
  "Trattenuto":      "#ff6f00",
  "Indebolimento":   "#d81b60",
  "Ira":  "rgba(255, 0, 0, 1)ff",
});

// Aggiorna automaticamente le pillole quando qualsiasi item cambia.
// Evita doppie registrazioni in dev/HMR.
let __COND_WATCH_MOUNTED = false;
export function mountConditionsLabelWatcher() {
  if (__COND_WATCH_MOUNTED) return;
  __COND_WATCH_MOUNTED = true;

  OBR.scene.items.onChange(async () => {
    try { await refreshConditionLabels(); } catch {}
  });
}

// === Helpers lettura/scrittura metadati condizione
export async function getItemConditions(itemId) {
  const [it] = await OBR.scene.items.getItems(i => i.id === itemId);
  const m = it?.metadata?.[META_KEY]?.conditions || {};
  const flags = m.flags && typeof m.flags === "object" ? m.flags : {};
  const custom = Array.isArray(m.custom) ? m.custom.filter(Boolean) : [];
  return { flags, custom };
}

export async function setItemConditions(itemId, next) {
  await OBR.scene.items.updateItems([itemId], (list) => {
    const it = list[0]; if (!it) return;
    const me = { ...(it.metadata?.[META_KEY] || {}) };
    me.conditions = {
      flags: { ...(next.flags || {}) },
      custom: (next.custom || []).filter(Boolean).slice(0, MAX_CUSTOM_SLOTS),
    };
    it.metadata = { ...(it.metadata || {}), [META_KEY]: me };
  });
}

export async function toggleFlagForItems(itemIds, flagName) {
  if (!flagName) return;
  const ids = (itemIds || []).slice();
  if (!ids.length) return;

  await OBR.scene.items.updateItems(ids, (draft) => {
    for (const it of draft) {
      const me = { ...(it.metadata?.[META_KEY] || {}) };
      const cond = { flags: {}, custom: [], ...(me.conditions || {}) };
      const cur = !!cond.flags[flagName];
      cond.flags[flagName] = !cur;
      me.conditions = cond;
      it.metadata = { ...(it.metadata || {}), [META_KEY]: me };
    }
  });
}

export async function addCustomForItems(itemIds, text) {
  const t = String(text || "").trim();
  if (!t) return;
  const ids = (itemIds || []).slice();
  if (!ids.length) return;

  await OBR.scene.items.updateItems(ids, (draft) => {
    for (const it of draft) {
      const me = { ...(it.metadata?.[META_KEY] || {}) };
      const cond = { flags: {}, custom: [], ...(me.conditions || {}) };
      const arr = Array.isArray(cond.custom) ? cond.custom.slice() : [];
      if (arr.length >= MAX_CUSTOM_SLOTS) {
        arr[arr.length - 1] = t;
      } else {
        arr.push(t);
      }
      cond.custom = arr;
      me.conditions = cond;
      it.metadata = { ...(it.metadata || {}), [META_KEY]: me };
    }
  });
}

export async function clearAllConditionsForItems(itemIds) {
  const ids = (itemIds || []).slice();
  if (!ids.length) return;
  await OBR.scene.items.updateItems(ids, (draft) => {
    for (const it of draft) {
      const me = { ...(it.metadata?.[META_KEY] || {}) };
      delete me.conditions;
      it.metadata = { ...(it.metadata || {}), [META_KEY]: me };
    }
  });
}

// Payload Slate minimale per un testo monoriga
function _mkSlateParagraph(text) {
  return [{ type: "paragraph", children: [{ text: String(text || "") }] }];
}

// === Stima dimensioni testo (via canvas 2D)
function __measureTextPx(text, fontSize = 12, fontFamily = "Inter, system-ui, sans-serif") {
  try {
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d");
    ctx.font = `${fontSize}px ${fontFamily}`;
    const m = ctx.measureText(String(text || ""));
    const w = Math.ceil(m.width);
    const h = Math.ceil(fontSize * 1.25);
    return { w, h };
  } catch {
    const t = String(text || "");
    return { w: Math.ceil(t.length * fontSize * 0.6), h: Math.ceil(fontSize * 1.25) };
  }
}

// Geometria pill: padding/angoli/stroke
const PILL_CFG = {
  fontSize: 16,
  padX: 4,
  padY: 1,
  stroke: 2,
  // colori
  bg: "rgba(0,0,0,0.75)",
  border: "rgba(255, 0, 0, 1)",
  textFill: "#ffffff",
  textStroke: "rgba(0,0,0,.85)",
  textStrokeW: 2,
};

// Calcola size pill a partire dal testo
function __pillSizeFor(text) {
  const { w, h } = __measureTextPx(text, PILL_CFG.fontSize);
  return {
    width: w + PILL_CFG.padX * 2 + PILL_CFG.stroke * 4,
    height: h + PILL_CFG.padY * 2 + PILL_CFG.stroke * 2,
  };
}

// Margine tra chip e chip
const CHIP_GAP = 2;
const CHIP_Z = {
  bg: 100000,
  text: 100001,
};

const CHIP_LAYOUT_NUDGE = {
  x: 0,     // sposta tutto il blocco a sinistra (px). Negativo = sinistra
  topGap: 48,  // usato anche come baseGap per anchor top/bottom
  rowGap: CHIP_GAP,
};

// === Stack condiviso con spells ===
const STACK_GAP = 2; // deve combaciare con spells-tag.js
const CONC_WIDGET_META   = `${ID}/concWidgetOf`;
const CONC_WIDGET_KEY    = `${ID}/concWidgetKey`;
const CONC_WIDGET_CASTER = `${ID}/concWidgetCaster`;

// === NUOVO: configurazione anchor della colonna (top/bottom/center)
const STACK_ANCHOR = "top";              // "bottom" | "top" | "center"
const STACK_DIR    = 1;                     // 1 = giù, -1 = su
const STACK_BASE_GAP = CHIP_LAYOUT_NUDGE.topGap || 6;
const STACK_CENTER_OFFSET = 0;
function stackBaseY(targetItem) {
  const h = Number(targetItem.height) || 70;
  if (STACK_ANCHOR === "top")    return targetItem.position.y - h / 2 - STACK_BASE_GAP;
  if (STACK_ANCHOR === "center") return targetItem.position.y + STACK_CENTER_OFFSET;
  // default: bottom
  return targetItem.position.y + h / 2 + STACK_BASE_GAP;
}

// Metadata per identificare ogni chip (oltre al "owner" token)
const COND_WIDGET_KEY_META = `${ID}/condWidgetKey`; // es. "flag:Prono" o "custom:avvelenato"

// Ordina le flag secondo la tua UI + custom in coda
function __orderedParts(flags = {}, custom = []) {
  const on = CONDITION_LIST.filter(k => !!flags[k]);
  const extras = (custom || []).filter(Boolean);
  return [...on, ...extras];
}

// Genera una chiave stabile per ogni parte
function __chipKeyFor(part) {
  if (CONDITION_LIST.includes(part)) return `flag:${part}`;
  const slug = String(part).toLowerCase().trim().replace(/\s+/g, "-").slice(0, 32);
  return `custom:${slug}`;
}

async function upsertCondLabelForItem(it) {
  return upsertCondWidgetForItem(it);
}

// Lock anti-race: un solo upsert alla volta per token
const __COND_UPSERT_LOCK = new Set();

export async function refreshConditionLabels(itemIds) {
  let items = [];
  if (Array.isArray(itemIds) && itemIds.length) {
    const idset = new Set(itemIds.filter(Boolean));
    items = await OBR.scene.items.getItems(i => idset.has(i.id));
  } else {
    items = await OBR.scene.items.getItems(i => !!i.metadata?.[META_KEY]);
  }

  for (const it of items) {
    if (!it) continue;
    if (__COND_UPSERT_LOCK.has(it.id)) continue;
    __COND_UPSERT_LOCK.add(it.id);
    try { await upsertCondWidgetForItem(it); } catch {} finally { __COND_UPSERT_LOCK.delete(it.id); }
  }
}

// === Anchor-based stack: calcola la Y per "cond:<key>"
async function __stackCYForCondition(targetItem, condKey, condHeight) {
  const tid = targetItem.id;

  // 1) SPELL rows presenti su questo target (qualsiasi caster)
  const spellLabels = await OBR.scene.items.getItems(
    (i) => (i.type === "TEXT" || i.type === "SHAPE")
       && i.metadata?.[CONC_WIDGET_META] === tid
       && !!i.metadata?.[CONC_WIDGET_CASTER]
  );
  const spellRows = new Map(); // sig -> height
  for (const itx of spellLabels) {
    const k = (itx.metadata?.[CONC_WIDGET_KEY] || "").toString().toLowerCase();
    const c = (itx.metadata?.[CONC_WIDGET_CASTER] || "").toString();
    if (!k || !c) continue;
    const sig = `${k}|${c}`;
    const h = itx.type === "SHAPE" ? (Number(itx.height) || condHeight) : null;
    if (!spellRows.has(sig)) spellRows.set(sig, h || condHeight);
    else if (h) spellRows.set(sig, h);
  }

  // 2) COND rows presenti (bg)
  const condShapes = await OBR.scene.items.getItems(
    (i) => i.type === "SHAPE" && i.metadata?.[COND_WIDGET_META] === tid
  );
  const condRows = new Map(); // key -> height
  for (const sh of condShapes) {
    const key = sh.metadata?.[COND_WIDGET_KEY_META];
    if (!key) continue;
    condRows.set(String(key), Number(sh.height) || condHeight);
  }
  if (!condRows.has(condKey)) condRows.set(condKey, condHeight);

  // 3) ordine: spells poi condizioni
  const entries = [];
  for (const [sig, h] of spellRows) entries.push({ group: 0, key: sig, h });
  for (const [key, h] of condRows)  entries.push({ group: 1, key, h });
  entries.sort((A, B) => (A.group - B.group) || String(A.key).localeCompare(String(B.key)));

  // 4) Stack usando l'anchor configurato
  const baseY = stackBaseY(targetItem);
  let cy = baseY, prevH = 0;
  for (let i = 0; i < entries.length; i++) {
    const h = Number(entries[i].h) || condHeight;
    if (i === 0) {
      cy = baseY + STACK_DIR * (h / 2);
    } else {
      cy = cy + STACK_DIR * ((prevH / 2) + STACK_GAP + (h / 2));
    }
    if (entries[i].group === 1 && entries[i].key === condKey) return Math.round(cy);
    prevH = h;
  }
  return Math.round(baseY + STACK_DIR * (condHeight / 2));
}

// === Versione a widget (SHAPE + TEXT) — multi-chip, una per condizione ===
async function upsertCondWidgetForItem(it) {
  const cond = it.metadata?.[META_KEY]?.conditions || {};
  const flags = cond.flags || {};
  const custom = Array.isArray(cond.custom) ? cond.custom : [];

  const parts = __orderedParts(flags, custom);
  const wantNone = parts.length === 0;

  const existing = await OBR.scene.items.getItems(
    (i) => (i.type === "TEXT" || i.type === "SHAPE") && i.metadata?.[COND_WIDGET_META] === it.id
  );

  const buckets = new Map(); // key -> { shape?, text? }
  for (const item of existing) {
    const key = item.metadata?.[COND_WIDGET_KEY_META];
    if (!key) continue;
    const b = buckets.get(key) || {};
    if (item.type === "SHAPE") b.shape = item;
    else if (item.type === "TEXT") b.text = item;
    buckets.set(key, b);
  }

  if (wantNone) {
    if (existing.length) await OBR.scene.items.deleteItems(existing.map(x => x.id));
    return;
  }

  const sizes = parts.map(p => {
    const label = p;
    const { width, height } = __pillSizeFor(label);
    return { label, width, height, key: __chipKeyFor(p) };
  });

  const totalWidth = sizes.reduce((acc, s) => acc + s.width, 0) + CHIP_GAP * (sizes.length - 1);
  const maxH = sizes.reduce((m, s) => Math.max(m, s.height), 0);

  const hasH = typeof it.height === "number" && !Number.isNaN(it.height);
  const tokenTop = hasH ? (it.position.y - it.height / 2) : (it.position.y - 60);

  const startX = it.position.x - totalWidth;
  const anchorY = tokenTop - 8 - (maxH / 2); // legacy (non usato dal nuovo stack, ma lasciato intatto)

  // === Layout a colonna singola (1 per riga), centrato orizzontalmente al token ===
  const CENTER_X = it.position.x + CHIP_LAYOUT_NUDGE.x;
  const rows = sizes.map(s => [s]);

  const layout = Object.create(null);
  for (let r = 0; r < rows.length; r++) {
    const s = rows[r][0];
    const cy = await __stackCYForCondition(it, s.key, s.height);
    const cx = CENTER_X;
    layout[s.key] = { pos: { x: cx, y: cy }, width: s.width, height: s.height, label: s.label };
  }

  // 1) CREA quelli mancanti
  const toAdd = [];
  let xCreate = startX;
  for (const s of sizes) {
    const key = s.key;
    const slot = layout[key];
    const cx = slot.pos.x;
    const cy = slot.pos.y;

    if (!buckets.has(key)) {
      const borderCol = COND_BORDER[s.label] || PILL_CFG.border;
      const shapeBuilt = buildShape()
        .shapeType("RECTANGLE")
        .position({ x: cx, y: cy })
        .attachedTo(it.id)
        .fillColor(PILL_CFG.bg)
        .strokeColor(borderCol)
        .strokeWidth(PILL_CFG.stroke)
        .width(s.width)
        .height(s.height)
        .layer("TEXT")
        .name(`Condizione: ${s.label} (bg)`)
        .metadata({ [COND_WIDGET_META]: it.id, [COND_WIDGET_KEY_META]: key })
        .build();
      try { if ("cornerRadius" in shapeBuilt) shapeBuilt.cornerRadius = PILL_CFG.radius; } catch {}
      shapeBuilt.locked = true;
      shapeBuilt.disableHit = true;
      shapeBuilt.zIndex = CHIP_Z.bg;

      const textBuilt = buildText()
        .richText(_mkSlateParagraph(s.label))
        .position({ x: cx, y: cy })
        .attachedTo(it.id)
        .layer("TEXT")
        .name(`Condizione: ${s.label} (testo)`)
        .metadata({ [COND_WIDGET_META]: it.id, [COND_WIDGET_KEY_META]: key })
        .build();
      textBuilt.locked = true;
      textBuilt.disableHit = true;
      textBuilt.zIndex = CHIP_Z.text;

      toAdd.push(shapeBuilt, textBuilt);
    }
  }
  if (toAdd.length) {
    await OBR.scene.items.addItems(toAdd);

    const fresh = await OBR.scene.items.getItems(
      (i) => (i.type === "TEXT" || i.type === "SHAPE") && i.metadata?.[COND_WIDGET_META] === it.id
    );
    buckets.clear();
    for (const item of fresh) {
      const key = item.metadata?.[COND_WIDGET_KEY_META];
      if (!key) continue;
      const b = buckets.get(key) || {};
      if (item.type === "SHAPE") b.shape = item;
      else if (item.type === "TEXT") b.text = item;
      buckets.set(key, b);
    }
  }

  // 2) AGGIORNA (posizione/size/stile/testo)
  const idsSet = new Set();
  for (const s of sizes) {
    const pair = buckets.get(s.key) || {};
    if (pair.shape) idsSet.add(pair.shape.id);
    if (pair.text)  idsSet.add(pair.text.id);
  }
  const idsToUpdate = Array.from(idsSet);

  // 3) CANCELLA extra
  const validKeys = new Set(sizes.map(s => s.key));
  const toRemove = [];
  for (const [key, pair] of buckets.entries()) {
    if (!validKeys.has(key)) {
      if (pair.shape) toRemove.push(pair.shape.id);
      if (pair.text)  toRemove.push(pair.text.id);
    }
  }
  if (toRemove.length) await OBR.scene.items.deleteItems(toRemove);

  // 4) UPDATE atomico
  await OBR.scene.items.updateItems(idsToUpdate, (draft) => {
    for (const itx of draft) {
      const key  = itx.metadata?.[COND_WIDGET_KEY_META];
      const slot = key ? layout[key] : null;
      if (!slot) continue;

      if (itx.attachedTo !== it.id) itx.attachedTo = it.id;
      if (itx.layer !== "TEXT") itx.layer = "TEXT";
      itx.locked = true;
      itx.disableHit = true;

      if (itx.type === "SHAPE") {
        const posChanged = !itx.position || itx.position.x !== slot.pos.x || itx.position.y !== slot.pos.y;
        const wChanged   = itx.width  !== slot.width  || itx.height !== slot.height;

        if (posChanged) itx.position = { x: slot.pos.x, y: slot.pos.y };
        if (wChanged) { itx.width = slot.width; itx.height = slot.height; }
        if ("cornerRadius" in itx && itx.cornerRadius !== PILL_CFG.radius) itx.cornerRadius = PILL_CFG.radius;
        if (itx.zIndex !== CHIP_Z.bg) itx.zIndex = CHIP_Z.bg;

      } else if (itx.type === "TEXT") {
        const posChanged = !itx.position || itx.position.x !== slot.pos.x || itx.position.y !== slot.pos.y;
        if (posChanged) itx.position = { x: slot.pos.x, y: slot.pos.y };
        if (itx.zIndex !== CHIP_Z.text) itx.zIndex = CHIP_Z.text;

        itx.text = itx.text || {};
        itx.text.type = "RICH";

        const curLabel =
          (Array.isArray(itx.text.richText) && itx.text.richText[0]?.children?.[0]?.text) ||
          itx.text.plainText || "";

        if (curLabel !== slot.label) {
          itx.text.richText = _mkSlateParagraph(slot.label);
          if (itx.text.plainText) delete itx.text.plainText;
        }

        if (itx.text.width !== slot.width)   itx.text.width  = slot.width;
        if (itx.text.height !== slot.height) itx.text.height = slot.height;

        const st = (itx.text.style = itx.text.style || {});
        if (st.fillColor !== PILL_CFG.textFill)        st.fillColor = PILL_CFG.textFill;
        if (st.strokeColor !== PILL_CFG.textStroke)    st.strokeColor = PILL_CFG.textStroke;
        if (st.strokeWidth !== PILL_CFG.textStrokeW)   st.strokeWidth = PILL_CFG.textStrokeW;
        if (st.fontSize !== PILL_CFG.fontSize)         st.fontSize = PILL_CFG.fontSize;
        if (st.textAlign !== "CENTER")                 st.textAlign = "CENTER";
        if (st.textAlignVertical !== "MIDDLE")         st.textAlignVertical = "MIDDLE";
      }
    }
  });
}

// Best-effort: rimuovi vecchie LABEL legacy (compat)
export async function __cleanupLegacyConditionLabels() {
  try {
    const labs = await OBR.scene.items.getItems(i => i.type === "LABEL" && i.metadata?.[COND_LABEL_META]);
    if (labs.length) await OBR.scene.items.deleteItems(labs.map(l => l.id));
  } catch {}
}

// Modifica
// Sostituisci la buildConditionChips esistente
export function buildConditionChips(cond = {}, opts = {}) {
  const flags  = (cond && typeof cond === "object" && cond.flags && typeof cond.flags === "object")
    ? cond.flags : {};
  let custom = Array.isArray(cond?.custom) ? cond.custom : [];

  if (!Array.isArray(custom) && custom && typeof custom === "object") {
    custom = Object.keys(custom).filter(k => !!custom[k]);
  }

  const cap = Array.isArray(opts.cap) ? opts.cap : [];
  const compact = !!opts.compact;

  const wrap = document.createElement("div");
  Object.assign(wrap.style, {
    display: "inline-flex",
    gap: "6px",
    alignItems: "center",
    pointerEvents: "none",
  });

  const mk = (txt) => {
    const s = document.createElement("span");
    s.textContent = String(txt);

    const borderCol = COND_BORDER[txt] || "rgba(255, 255, 255, 1)";

    Object.assign(s.style, {
      fontSize: compact ? "10px" : "11px",
      fontWeight: " 500",
      padding: compact ? "2px 6px" : "4px 8px",
      borderRadius: "999px",
      background: "rgba(0,0,0,.72)",
      color: "#fff",
      border: `2px solid ${borderCol}`,
      lineHeight: "1",
      whiteSpace: "nowrap",
      userSelect: "none",
      pointerEvents: "none",
    });
    return s;
  };

  // 1) flag nell’ordine/whitelist di cap
  for (const name of cap) if (flags[name]) wrap.appendChild(mk(name));

  // 2) eventuali flag attive non in cap
  for (const k of Object.keys(flags)) {
    if (!cap.includes(k) && flags[k]) wrap.appendChild(mk(k));
  }

  // 3) custom
  for (const t of custom) if (t != null && String(t).trim()) wrap.appendChild(mk(String(t)));

  return wrap;
}
