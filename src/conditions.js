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
  "Concentrazione",
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
  "Concentrazione":  "#7c4dff",
});


// Aggiorna automaticamente le pillole quando qualsiasi item cambia.
// Evita doppie registrazioni in dev/HMR.
let __COND_WATCH_MOUNTED = false;
export function mountConditionsLabelWatcher() {
  if (__COND_WATCH_MOUNTED) return;
  __COND_WATCH_MOUNTED = true;

  // Nota: non ci affidiamo all'argomento del callback (che varia tra versioni dell’SDK),
  // e facciamo un refresh “mirato” usando il nostro scanner interno.
  OBR.scene.items.onChange(async () => {
    try { await refreshConditionLabels(); } catch {}
  });
}

// === Helpers lettura/scrittura metadati condizione
export async function getItemConditions(itemId) {
  // FIX: usa un filtro per id, non un array
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
        arr[arr.length - 1] = t; // sovrascrivi l'ultimo slot
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
    const h = Math.ceil(fontSize * 1.25); // riga singola
    return { w, h };
  } catch {
    // fallback molto prudente
    const t = String(text || "");
    return { w: Math.ceil(t.length * fontSize * 0.6), h: Math.ceil(fontSize * 1.25) };
  }
}

// Geometria pill: padding/angoli/stroke
const PILL_CFG = {
  fontSize: 22,
  padX: 4,
  padY: 1,
  stroke: 2,                    // spessore bordo
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
    width: w + PILL_CFG.padX * 2 + PILL_CFG.stroke * 2,
    height: h + PILL_CFG.padY * 2 + PILL_CFG.stroke * 2,
  };

}
// Margine tra chip e chip
const CHIP_GAP = 4; 
const CHIP_Z = {
  bg: 100000,   // shape/sfondo
  text: 100001, // testo sopra
};

const CHIP_LAYOUT_NUDGE = {
  x: -64,     // sposta tutto il blocco a sinistra (px). Negativo = sinistra
  topGap: 32, // distanza dal bordo superiore del token alla prima riga (più alto = più su)
  rowGap: CHIP_GAP, // distanza verticale tra righe (lascia CHIP_GAP o aumenta)
};

// Metadata per identificare ogni chip (oltre al "owner" token)
const COND_WIDGET_KEY_META = `${ID}/condWidgetKey`; // es. "flag:Prono" o "custom:avvelenato"

// Ordina le flag secondo la tua UI + custom in coda
function __orderedParts(flags = {}, custom = []) {
  const on = CONDITION_LIST.filter(k => !!flags[k]); // rispetta l’ordine UI
  const extras = (custom || []).filter(Boolean);
  return [...on, ...extras];
}

// Genera una chiave stabile per ogni parte
function __chipKeyFor(part, flags, custom) {
  // se è una flag nota, prefissa "flag:", altrimenti custom con slug breve
  if (CONDITION_LIST.includes(part)) return `flag:${part}`;
  const slug = String(part).toLowerCase().trim().replace(/\s+/g, "-").slice(0, 32);
  return `custom:${slug}`;
}


async function upsertCondLabelForItem(it) {
  // ← legacy no-op per compat: reindirizziamo alla versione a widget
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

  // serializza per token per evitare doppie addItems in parallelo
  for (const it of items) {
    if (!it) continue;
    if (__COND_UPSERT_LOCK.has(it.id)) continue;
    __COND_UPSERT_LOCK.add(it.id);
    try {
      await upsertCondWidgetForItem(it);
    } catch (_) {
      // no-op
    } finally {
      __COND_UPSERT_LOCK.delete(it.id);
    }
  }
}

// === Versione a widget (SHAPE + TEXT) — multi-chip, una per condizione ===
async function upsertCondWidgetForItem(it) {
  const cond = it.metadata?.[META_KEY]?.conditions || {};
  const flags = cond.flags || {};
  const custom = Array.isArray(cond.custom) ? cond.custom : [];

  // Parti attive nell'ordine desiderato (UI -> custom)
  const parts = __orderedParts(flags, custom);
  const wantNone = parts.length === 0;

  // Recupera tutti i widget (SHAPE+TEXT) già associati a questo token
  const existing = await OBR.scene.items.getItems(
    (i) => (i.type === "TEXT" || i.type === "SHAPE") && i.metadata?.[COND_WIDGET_META] === it.id
  );

  // Mappa esistenti per "chiave chip"
  const buckets = new Map(); // key -> { shape?, text? }
  for (const item of existing) {
    const key = item.metadata?.[COND_WIDGET_KEY_META];
    if (!key) continue;
    const b = buckets.get(key) || {};
    if (item.type === "SHAPE") b.shape = item;
    else if (item.type === "TEXT") b.text = item;
    buckets.set(key, b);
  }

  // Se non ci sono condizioni, rimuovi eventuali residui e chiudi
  if (wantNone) {
    if (existing.length) await OBR.scene.items.deleteItems(existing.map(x => x.id));
    return;
  }

  // Per centrare meglio: calcola larghezza totale delle chip
  const sizes = parts.map(p => {
    const label = p; // testo chip = nome condizione (o custom)
    const { width, height } = __pillSizeFor(label);
    return { label, width, height, key: __chipKeyFor(p, flags, custom) };
  });

  const totalWidth = sizes.reduce((acc, s) => acc + s.width, 0) + CHIP_GAP * (sizes.length - 1);
  const maxH = sizes.reduce((m, s) => Math.max(m, s.height), 0);

  // se IMAGE (token) ha height, usala per agganciarti al bordo superiore; altrimenti fallback fisso
  const hasH = typeof it.height === "number" && !Number.isNaN(it.height);
  const tokenTop = hasH ? (it.position.y - it.height / 2) : (it.position.y - 60);

  const startX = it.position.x - totalWidth;
  const anchorY = tokenTop - 8 - (maxH / 2); // 8px di gap sopra il bordo

  // === Layout centrato sul token: righe da max 2 chip (2-2-2...),
  //     ogni riga è centrata orizzontalmente rispetto al centro del token
  const CENTER_X = it.position.x + CHIP_LAYOUT_NUDGE.x;
  const TOP_GAP  = CHIP_LAYOUT_NUDGE.topGap;
  const ROW_CAP  = 1;
  const ROW_GAP  = CHIP_LAYOUT_NUDGE.rowGap;

  // spezza in righe da 2
  const rows = [];
  for (let i = 0; i < sizes.length; i += ROW_CAP) rows.push(sizes.slice(i, i + ROW_CAP));

  // altezza di ogni riga
  const rowHeights = rows.map(r => r.reduce((m, s) => Math.max(m, s.height), 0));

  // bordo superiore del blocco (ancorato sopra al token)
  let yCursorTop = tokenTop - TOP_GAP;

  // mappa layout: key -> { pos, width, height, label }
  const layout = Object.create(null);

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const rh  = rowHeights[r];

    // centratura orizzontale della riga
    const rowWidth = row.reduce((sum, s) => sum + s.width, 0) + CHIP_GAP * (row.length - 1);
    let xCursor = CENTER_X - rowWidth / 2;

    // centro verticale della riga corrente
    const cy = yCursorTop + rh / 2;

    for (const s of row) {
      const cx = xCursor + s.width / 2;
      layout[s.key] = { pos: { x: cx, y: cy }, width: s.width, height: s.height, label: s.label };
      xCursor += s.width + CHIP_GAP;
    }

    // passa alla riga successiva
    yCursorTop += rh + ROW_GAP;
  }

// 1) CREA quelli mancanti (in coordinate di scena, NON attached)
const toAdd = [];
let xCreate = startX;
for (const s of sizes) {
  const key = s.key;
  const slot = layout[key];
  const cx = slot.pos.x;
  const cy = slot.pos.y;

  if (!buckets.has(key)) {
    // SHAPE sotto
    const borderCol = COND_BORDER[s.label] || PILL_CFG.border;
    const shapeBuilt = buildShape()
      .shapeType("RECTANGLE")
      .position({ x: cx, y: cy })  // WORLD
      .attachedTo(it.id)           // segue il token
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

    // TEXT sopra
    const textBuilt = buildText()
      .richText(_mkSlateParagraph(s.label))
      .position({ x: cx, y: cy })
      .attachedTo(it.id)           // segue il token
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
  
  // rileggo per aggiornare i riferimenti nei buckets
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

  // 2) AGGIORNA posizione, dimensioni, testo di tutte le chip volute (nell’ordine)
    const idsSet = new Set();
  for (const s of sizes) {
    const pair = buckets.get(s.key) || {};
    if (pair.shape) idsSet.add(pair.shape.id);
    if (pair.text)  idsSet.add(pair.text.id);
  }
  const idsToUpdate = Array.from(idsSet);

  // 3) CANCELLA eventuali chip extra non più richieste
  const validKeys = new Set(sizes.map(s => s.key));
  const toRemove = [];
  for (const [key, pair] of buckets.entries()) {
    if (!validKeys.has(key)) {
      if (pair.shape) toRemove.push(pair.shape.id);
      if (pair.text)  toRemove.push(pair.text.id);
    }
  }
  if (toRemove.length) await OBR.scene.items.deleteItems(toRemove);

  // 4) UPDATE atomico di shape+text (posizione / size / style / richText) — solo se cambia
  await OBR.scene.items.updateItems(idsToUpdate, (draft) => {
    for (const itx of draft) {
      const key  = itx.metadata?.[COND_WIDGET_KEY_META];
      const slot = key ? layout[key] : null;
      if (!slot) continue;

      // campi comuni (li settiamo solo se diversi)
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

        // confronta label corrente
        const curLabel =
          (Array.isArray(itx.text.richText) && itx.text.richText[0]?.children?.[0]?.text) ||
          itx.text.plainText || "";

        if (curLabel !== slot.label) {
          itx.text.richText = _mkSlateParagraph(slot.label);
          if (itx.text.plainText) delete itx.text.plainText;
        }

        // bbox testo: cambia solo se serve
        if (itx.text.width !== slot.width)  itx.text.width  = slot.width;
        if (itx.text.height !== slot.height) itx.text.height = slot.height;

        // stile: applica solo se mancano o sono diversi
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

  // compat: se per caso arriva lo schema vecchio (custom oggetto -> chiavi truthy)
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

  return wrap; // <-- direttamente un Node
}