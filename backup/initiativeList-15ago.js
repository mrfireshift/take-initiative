  import OBR from "@owlbear-rodeo/sdk";
  import { ID } from "./contextMenu";
  import { mountHPBars } from "./hpbar-items.js"

  const STATE_KEY = `${ID}/state`;
  const META_KEY  = `${ID}/meta`;
  const FOCUS_MIN_PAD_PX = 64;    // prima era 64: spazio minimo extra attorno al token
  const FOCUS_ZOOM_BIAS  = 10;  // 1 = fit preciso; >1 = zoom più lontano
  const ARROW_PROXY_WINDOW_MS = 2000

  // --- Drag & Drop (riordino fra pari iniziativa) ---
  let __draggingId   = null;   // id card trascinata
  let __draggingInit = null;   // iniziativa della card trascinata
  let __draggingWasCollapsed = false; // true se la card sorgente è un lead collassato

  let __editingInitForId = null; // già presente dal fix precedente
  let __editingHPForId   = null; // nuovo: lock per pill HP
  let __suspendRenders   = false; // nuovo: sospende render durante lo switch di editor
  let IS_GM = false;

  export function mountInitiativeList(container) {
    if (container.__initiativeMounted) return;   // ← evita montaggi doppi
    container.__initiativeMounted = true;

    const styleTag = document.createElement("style");
styleTag.textContent = `
  :root, body { height: 100%; overflow: hidden; }
  /* niente text-select nel widget tranne campi editabili */
  .tbp-root, .tbp-root *:not(input):not(textarea):not([contenteditable="true"]) {
    -webkit-user-select: none;
    user-select: none;
  }
`;
document.head.appendChild(styleTag);

// segna il container come root del widget
container.classList.add("tbp-root");
container.style.height = "100%";
container.style.overflow = "hidden";

container.addEventListener("mousedown", (e) => {
  // Se è aperto un editor (HP o iniziativa) non bloccare/alterare nulla
  if (__editingHPForId || __editingInitForId) return;

  const t = e.target;

  // CONSENTI drag&drop e click sulle card: niente preventDefault
  if (t.closest('[data-item-id]') || t.closest('[draggable="true"]')) {
    return;
  }

  // Interattivi consentiti
  const interactive = t.closest("input, textarea, [contenteditable='true'], button, [role='button']");
  if (!interactive) {
    e.preventDefault();
    try { window.getSelection?.().removeAllRanges?.(); } catch {}
  }
}, { capture: true });

// ===== LAYOUT VERTICALE: ▲ – Turno – Track – ▼ (full-height, single scroller) =====
const col = document.createElement("div");
col.style.display = "flex";
col.style.flexDirection = "column";
col.style.alignItems = "stretch";
col.style.gap = "8px";
col.style.height = "100%";      // ← piena altezza
col.style.overflow = "hidden";  // ← niente scroll qui
container.replaceChildren(col);

function mkBtn(txt) {
  const b = document.createElement("button");
  b.textContent = txt;                  // ▲ / ▼
  b.style.width = "100%";
  b.style.height = "28px";
  b.style.padding = "0 6px";
  b.style.border = "none";
  b.style.borderRadius = "6px";
  b.style.cursor = "pointer";
  b.style.background = "transparent";
  b.style.color = "white";
  b.style.fontSize = "18px";
  b.style.userSelect = "none";
  b.type = "button";
  b.tabIndex = -1;
  b.addEventListener("mousedown", (e) => e.preventDefault());
  b.style.outline = "none";
  b.onmouseenter = () => (b.style.background = "rgba(255,255,255,0.08)");
  b.onmouseleave = () => (b.style.background = "transparent");
  return b;
}

const btnPrev = mkBtn("▲");
const btnNext = mkBtn("▼");

// pill “Turno N”
const roundPill = document.createElement("div");
roundPill.title = "Numero di turni (scatta quando l'iniziativa avanza e ritorna all'inizio)";
Object.assign(roundPill.style, {
  alignSelf: "center",
  padding: "4px 10px",
  fontSize: "13px",
  fontWeight: "800",
  lineHeight: "1",
  color: "#fff",
  background: "rgba(0,0,0,.72)",
  border: "1px solid rgba(255,255,255,.18)",
  borderRadius: "14px",
  boxShadow: "0 2px 6px rgba(0,0,0,.45)",
  userSelect: "none",
});
roundPill.textContent = "Turno 1";

// wrapper della lista — l’UNICO che scrolla
const trackWrap = document.createElement("div");
trackWrap.style.flex = "1 1 auto";        // ← occupa tutto lo spazio rimanente
trackWrap.style.minHeight = "0";          // ← fondamentale in flex
trackWrap.style.overflow = "auto";        // ← unica scrollbar
trackWrap.style.overscrollBehavior = "contain";
trackWrap.style.padding = "0";
trackWrap.style.boxSizing = "border-box";

// (rimuovi i vecchi limiti! niente maxHeight/minHeight qui)
// trackWrap.style.maxHeight = "575px";  // ← ELIMINATO
// trackWrap.style.minHeight = "120px";  // ← ELIMINATO

const track = document.createElement("div");
track.style.display = "flex";
track.style.flexDirection = "column";
track.style.alignItems = "center";
track.style.gap = "12px";
track.style.paddingTop = "8px";
track.style.paddingBottom = "8px";
trackWrap.appendChild(track);

// === Drag & Drop per pareggi d'iniziativa (delegato sul track) ===
if (!track.__dndMounted) {
  track.__dndMounted = true;

  const clearHints = () => {
    const hinted = track.querySelectorAll('[data-drop-hint]');
    hinted.forEach(n => {
      n.style.borderTop    = "";
      n.style.borderBottom = "";
      delete n.dataset.dropHint;
    });
  };

track.addEventListener("dragstart", (ev) => {
  const card = ev.target.closest('[data-item-id]');
  if (!card) return;

  const init = card.dataset.initiative || "";
  const peers = track.querySelectorAll(`[data-initiative="${init}"]`);
  if (peers.length < 2) { ev.preventDefault(); return; } // drag solo se ci sono pari

  __draggingId   = card.dataset.itemId;
  __draggingInit = Number(init) || 0;
  __draggingWasCollapsed = card.dataset.groupCollapsed === "1";

  ev.dataTransfer?.setData?.("text/plain", __draggingId);
  if (ev.dataTransfer) ev.dataTransfer.effectAllowed = "move";

  card.style.opacity = ".6";
});

track.addEventListener("dragover", (ev) => {
  if (!__draggingId) return;
  const over = ev.target.closest('[data-item-id]');
  if (!over) return;
  // il target può essere collassato o meno, l’unico vincolo è la stessa iniziativa
  if (String(over.dataset.initiative || "") !== String(__draggingInit)) return;

  ev.preventDefault(); // abilita il drop
  const r = over.getBoundingClientRect();
  const before = ev.clientY < (r.top + r.height / 2);

  if (!over.dataset.dropHint) over.dataset.dropHint = "1";
  over.style.borderTop    = before ? "2px solid rgba(255,255,255,.85)" : "";
  over.style.borderBottom = before ? "" : "2px solid rgba(255,255,255,.85)";
});

track.addEventListener("drop", async (ev) => {
  if (!__draggingId) return;
  const over = ev.target.closest('[data-item-id]');
  if (!over) return;
  if (String(over.dataset.initiative || "") !== String(__draggingInit)) return;

  ev.preventDefault();
  const r = over.getBoundingClientRect();
  const before = ev.clientY < (r.top + r.height / 2);

  const sourceId = __draggingId;
  const targetId = over.dataset.itemId;

  // pulizia hint e opacità
  const hinted = track.querySelectorAll('[data-drop-hint]');
  hinted.forEach(n => {
    n.style.borderTop    = "";
    n.style.borderBottom = "";
    delete n.dataset.dropHint;
  });
  const dragging = track.querySelector('[data-item-id][style*="opacity"]');
  if (dragging) dragging.style.opacity = "";

  // Riordino: se sto trascinando un LEAD collassato, sposto tutto il blocco gruppo
  if (__draggingWasCollapsed) {
    await _reorderCollapsedGroupWithinSameInitiative(sourceId, targetId, before);
  } else {
    await _reorderWithinSameInitiative(sourceId, targetId, before);
  }

  __draggingId = null;
  __draggingInit = null;
  __draggingWasCollapsed = false;
});
}

// ordine verticale: ▲ – Turno – Lista – ▼
col.append(btnPrev, roundPill, trackWrap, btnNext);

// stile scrollbar (già presente, lo riutilizziamo)
function injectScrollbarStyles() {
  if (document.getElementById("tbp-scrollbar-style")) return;
  const s = document.createElement("style");
  s.id = "tbp-scrollbar-style";
  s.textContent = `
  .tbp-scroll::-webkit-scrollbar { width: 10px; }
  .tbp-scroll::-webkit-scrollbar-track { background: transparent; }
  .tbp-scroll::-webkit-scrollbar-thumb {
    background-color: rgba(148,163,184,0.35);
    border-radius: 8px;
    border: 2px solid transparent;
    background-clip: padding-box;
  }
  .tbp-scroll:hover::-webkit-scrollbar-thumb { background-color: rgba(148,163,184,0.55); }
  .tbp-scroll::-webkit-scrollbar-thumb:active { background-color: rgba(148,163,184,0.75); }
  .tbp-scroll { scrollbar-width: thin; scrollbar-color: rgba(148,163,184,0.55) transparent; }
  `;
  document.head.appendChild(s);
}
injectScrollbarStyles();
trackWrap.classList.add("tbp-scroll");

// opzionale: isola la rotellina (niente scroll “a cascata”)
trackWrap.addEventListener("wheel", (e) => e.stopPropagation(), { passive: true });


    // ===== Stato scena
    async function getSceneState() {
      const md = await OBR.scene.getMetadata();
      return md[STATE_KEY];
    }
    async function setSceneState(next) {
  const md   = await OBR.scene.getMetadata();
  const prev = md[STATE_KEY] || { order: [], current: 0, collapsed: {} };
  const raw  = (typeof next === "function") ? next(prev) : next;
  const value = { ...prev, ...(raw || {}) }; // <- MERGE: non perdiamo campi extra
  await OBR.scene.setMetadata({ ...md, [STATE_KEY]: value });
}

    // ===== Hard reset dello stato iniziativa (quando non resta alcun token tracciato)
async function resetTrackerState() {
  const md = await OBR.scene.getMetadata();
  await OBR.scene.setMetadata({
    ...md,
    [STATE_KEY]: {
      order: [],
      current: 0,
      round: 1,
      seededGroups: {},   // azzera anche i seed per gruppi
    },
  });
}


    // ===== Selezione + centratura viewport (robusta) =====
async function selectInScene(itemId, replace = true) {
  if (!itemId) return;
  try { await OBR.player.select([itemId], replace); } catch {}
}

async function buildBiasedBBox(bounds, bias = FOCUS_ZOOM_BIAS, minPadPx = FOCUS_MIN_PAD_PX) {
  const w  = Number(bounds?.width  ?? (bounds?.max?.x ?? 0) - (bounds?.min?.x ?? 0));
  const h  = Number(bounds?.height ?? (bounds?.max?.y ?? 0) - (bounds?.min?.y ?? 0));
  const cx = (Number(bounds?.min?.x) + Number(bounds?.max?.x)) / 2;
  const cy = (Number(bounds?.min?.y) + Number(bounds?.max?.y)) / 2;

  // Applica un bias (>1 = più “largo”) + un padding minimo in pixel
  const effW = Math.max(1, w * bias + 2 * minPadPx);
  const effH = Math.max(1, h * bias + 2 * minPadPx);

  return {
    min:   { x: cx - effW / 2, y: cy - effH / 2 },
    max:   { x: cx + effW / 2, y: cy + effH / 2 },
    width:  effW,
    height: effH,
    center: { x: cx, y: cy },
  };
}

async function centerOnItem(itemId) {
  if (!itemId) return;
  try {
    const items = await OBR.scene.items.getItems([itemId]);
    if (!items || items.length === 0) return;

    const raw = await OBR.scene.items.getItemBounds([itemId]);
    if (!raw) return;

    const biased = await buildBiasedBBox(raw);
    await OBR.viewport.animateToBounds(biased);
  } catch (e) {
    console.warn("[initiative] centerOnItem failed:", e?.message || e);
  }
}

async function selectAndFocus(itemId) {
  await selectInScene(itemId, true);
  await centerOnItem(itemId);
}

function handoffFocusToCanvas() {
  try {
    // togli il focus da qualunque cosa nel plugin
    if (document.activeElement && document.activeElement.blur) {
      document.activeElement.blur();
    }
  } catch {}
  // prova a riportare il focus alla finestra host (funziona in molti browser se chiamato su gesto utente)
  try { window.top && window.top.focus && window.top.focus(); } catch {}
}

async function closeOpenEditors() {
  __suspendRenders = true;  // evita che un render distrugga il nuovo input che stai aprendo
  try {
    const openInit = document.querySelector('[data-init-editing="1"]');
    if (openInit && typeof openInit.__commitFn === "function") {
      await openInit.__commitFn(); // commit silenzioso
    }
    const openHP = document.querySelector('[data-hp-editing="1"]');
    if (openHP && typeof openHP.__commitFn === "function") {
      await openHP.__commitFn();
    }
  } catch (e) {
    console.warn("[edit] closeOpenEditors", e?.message || e);
  } finally {
    // non facciamo render qui: lo farà la prossima azione (o il commit dell’editor corrente)
    __suspendRenders = false;
  }
}

let __arrowProxyUntil = 0;
function armArrowProxy() {
  __arrowProxyUntil = Date.now() + ARROW_PROXY_WINDOW_MS;
}

async function nudgeSelectionBy(dxCells, dyCells, doubleStep = false) {
  const sel = await OBR.player.getSelection();
  if (!sel || sel.length === 0) return;

  const dpi = await OBR.scene.grid.getDpi(); // 1 cella in px
  const step = (doubleStep ? 2 : 1) * dpi;

  // leggiamo posizioni correnti
  const items = await OBR.scene.items.getItems(sel);
  // nuova posizione
  const newPos = items.map((it) => ({
    x: it.position.x + dxCells * step,
    y: it.position.y + dyCells * step,
  }));

  // aggiorniamo
  await OBR.scene.items.updateItems(items, (draft) => {
    for (let i = 0; i < draft.length; i++) {
      draft[i].position.x = newPos[i].x;
      draft[i].position.y = newPos[i].y;
    }
  });
}

    // ===== Image URL dal token
    function getTokenImageUrl(it) {
      if (it.image && typeof it.image === "object") {
        if (typeof it.image.url === "string") return it.image.url;
        if (typeof it.image.src === "string") return it.image.src;
        if (typeof it.image.href === "string") return it.image.href;
      }
      if (typeof it.src === "string") return it.src;
      if (it.data && typeof it.data.src === "string") return it.data.src;
      return null;
    }

    // ===== Leggi token tracciati (senza ordinare qui)
  async function readEntries() {
    const items = await OBR.scene.items.getItems();
    const byId = new Map();
    for (const it of items) {
      const meta = it.metadata && it.metadata[META_KEY];
      if (!meta) continue;
      if (byId.has(it.id)) continue; // dedupe
      byId.set(it.id, {
        id: it.id,
        name: it.name || "Unnamed",
        initiative: Number(meta.initiative) || 0,
        portrait: getTokenImageUrl(it),
        attitude: meta.attitude || "ally",
        hp: (meta.hp ?? null),
        hpMax: (meta.hpMax ?? null),
      });
    }
    return [...byId.values()];
}

// ——— helpers per rename + label TEXT ———
const _sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 1) Parser: rimuove TUTTI i prefissi "(n) " e restituisce base pulita
function _parseIndexedName(name) {
  const raw = String(name || "Unnamed").trim();
  const first = raw.match(/^\((\d+)\)/);
  const index = first ? parseInt(first[1], 10) : null;
  const base  = raw.replace(/^(\(\d+\)\s*)+/, "").trim(); // elimina ogni "(n) "
  return { index, base };
}

function _indexName(base, n) {
  return `(${n}) ${base}`;
}

// === Raggruppamento per base-name + attitude (solo per UI) ===
const __GROUP_SEP = "::";
function __groupKey(e) {
  const { base } = _parseIndexedName(e.name);
  return `${e.attitude || "ally"}${__GROUP_SEP}${base}`;
}

function __buildGroups(entries) {
  const m = new Map();
  for (const e of entries) {
    const k = __groupKey(e);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(e);
  }
  return m;
}

// Collassa TUTTI i gruppi (len>1) tranne quello dell'elemento attivo
async function __applyAutoCollapse(entries, state) {
  if (!state) return;
  const groups = __buildGroups(entries);
  const activeId = Array.isArray(state.order) ? state.order[state.current] : null;

  const next = { ...(state.collapsed || {}) };
  let changed = false;

  // ripulisci chiavi non più presenti
  for (const k of Object.keys(next)) {
    if (!groups.has(k)) { delete next[k]; changed = true; }
  }

  // default: collassa tutti i gruppi con più membri
  for (const [k, list] of groups) {
    if (list.length > 1 && next[k] === undefined) { next[k] = true; changed = true; }
  }

  // espandi SOLO il gruppo dell'attivo
  if (activeId) {
    for (const [k, list] of groups) {
      if (list.length <= 1) continue;
      const containsActive = list.some(m => m.id === activeId);
      const wantCollapsed = !containsActive;
      if (!!next[k] !== wantCollapsed) { next[k] = wantCollapsed; changed = true; }
    }
  }

  if (changed) {
    await setSceneState(prev => ({ ...(prev || {}), collapsed: next }));
  }
}

// Slate payload minimale per un'etichetta monoriga
function _mkSlateParagraph(text) {
  return [{ type: "paragraph", children: [{ text: String(text || "") }] }];
}

// --- Grouping per propagazione (nome base + immagine) ---
function _groupKeyFromEntry(e) {
  // usa già il parser esistente per rimuovere i prefissi "(n) "
  const { base } = _parseIndexedName(e.name || "");
  const img = e.portrait || "";
  return `${base}||${img}`;
}

async function _getGroupForItemId(itemId) {
  const entries = await readEntries();
  const me = entries.find(x => x.id === itemId);
  if (!me) return { key: null, members: [], me: null, entries };
  const key = _groupKeyFromEntry(me);
  const members = entries.filter(x => _groupKeyFromEntry(x) === key).map(x => x.id);
  return { key, members, me, entries };
}
// Propagazione iniziativa al gruppo (solo la prima volta)
async function trySeedGroupInitiative(itemId, value) {
  const st = await getSceneState();
  const { key, members } = await _getGroupForItemId(itemId);
  if (!key || members.length <= 1) return;

  const already = st?.seededGroups?.[key]?.initiative;
  if (already) return;

  // scrivi l’iniziativa su TUTTI i membri del gruppo
  const val = Number.isFinite(Number(value)) ? Math.floor(Number(value)) : 0;
  await OBR.scene.items.updateItems(members, (list) => {
    for (const it of list) {
      const prevMeta = (it.metadata && it.metadata[META_KEY]) || {};
      it.metadata = { ...(it.metadata || {}), [META_KEY]: { ...prevMeta, initiative: val } };
    }
  });

  // marca il gruppo come seedato per iniziativa
  await setSceneState(prev => ({
    ...(prev || { order: [], current: 0, round: 1 }),
    seededGroups: {
      ...(prev?.seededGroups || {}),
      [key]: { ...(prev?.seededGroups?.[key] || {}), initiative: true }
    }
  }));

  // ricalcola l’ordine e ridisegna
  await reconcileStateWithItems();
  await renderAll();
}

// Propagazione HP/HPMax al gruppo (solo la prima volta)
async function trySeedGroupHP(itemId, hp, hpMax) {
  const st = await getSceneState();
  const { key, members } = await _getGroupForItemId(itemId);
  if (!key || members.length <= 1) return;

  const already = st?.seededGroups?.[key]?.hp;
  if (already) return;

  const nHP  = Math.max(0, Math.floor(Number(hp)    || 0));
  const nMax = Math.max(0, Math.floor(Number(hpMax) || 0));
  const nHPclamped = nMax > 0 ? Math.min(nHP, nMax) : nHP;

  await OBR.scene.items.updateItems(members, (list) => {
    for (const it of list) {
      const prevMeta = (it.metadata && it.metadata[META_KEY]) || {};
      it.metadata = { ...(it.metadata || {}), [META_KEY]: { ...prevMeta, hp: nHPclamped, hpMax: nMax } };
    }
  });

  // aggiorna subito le barre HP per tutti (best-effort)
  try {
    const { syncHPBarNow } = await import("./hpbar-items.js");
    for (const id of members) syncHPBarNow(id, nHPclamped, nMax);
  } catch (err) {
    console.warn("[hpbar] group sync error", err?.message || err);
  }

  // marca il gruppo come seedato per HP
  await setSceneState(prev => ({
    ...(prev || { order: [], current: 0, round: 1 }),
    seededGroups: {
      ...(prev?.seededGroups || {}),
      [key]: { ...(prev?.seededGroups?.[key] || {}), hp: true }
    }
  }));

  await renderAll();
}

/**
 * Aggiorna la label visibile dei token rinominati.
 * Copre tutti i casi: text su root o su item.image, stringa/plainText/richText/Slate.
 * "updates": array di { id: tokenId, nameWanted: string }.
 */
async function _syncAttachedLabels(updates) {
  if (!updates?.length) return;

  const wantedById = new Map(updates.map(u => [u.id, u.nameWanted]));
  const ids = Array.from(wantedById.keys());

  const toSlate = (txt) => [{ type: "paragraph", children: [{ text: String(txt) }] }];

  const setTextOn = (holder, txt) => {
    if (!holder || !("text" in holder)) return false;
    const val = holder.text;

    if (typeof val === "string" || val === undefined || val === null) {
      holder.text = String(txt);
    } else if (Array.isArray(val)) {
      // già Slate → sostituisco
      holder.text = toSlate(txt);
    } else if (typeof val === "object") {
      // varianti note: { plainText }, { richText }
      if ("plainText" in val) val.plainText = String(txt);
      else if ("richText" in val) val.richText = toSlate(txt);
      else holder.text = toSlate(txt); // fallback
    } else {
      holder.text = String(txt);
    }

    // se esiste, assicura che venga mostrata come LABEL
    if ("textItemType" in holder) holder.textItemType = "LABEL";
    return true;
  };

  await OBR.scene.items.updateItems(ids, (itemsToUpdate) => {
    for (const it of itemsToUpdate) {
      const newText = wantedById.get(it.id);
      if (!newText) continue;

      // 1) prova sul root dell’item
      let ok = setTextOn(it, newText);

      // 2) prova anche sul sotto-oggetto image (alcuni build lo tengono lì)
      if (it.image && typeof it.image === "object") {
        if (!ok) ok = setTextOn(it.image, newText);
        // forza comunque il tipo LABEL se presente solo qui
        if ("textItemType" in it.image) it.image.textItemType = "LABEL";
      }

      // 3) best-effort: se il root espone direttamente textItemType, imposta LABEL
      if ("textItemType" in it) it.textItemType = "LABEL";
    }
  });
}

// Rinomina solo i nuovi e mantiene stabili gli indici esistenti.
// Inoltre sincronizza SEMPRE le label (anche se non c’è stato un rename).
async function enforceUniqueNamePrefixes() {
  const items   = await OBR.scene.items.getItems();
  const tracked = items.filter(it => it.metadata?.[META_KEY]);

  // Raggruppa per base pulita
  const groups = new Map();
  for (const it of tracked) {
    const { index, base } = _parseIndexedName(it.name);
    const key = base || "Unnamed";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ id: it.id, name: it.name || "", base: key, index });
  }

  const renames   = [];
  const labelSync = [];

  for (const [base, arr] of groups) {
    if (arr.length <= 1) continue;

    // Ordine deterministico per conflitti/assegnazioni
    arr.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

    const used      = new Set();
    const keepers   = [];
    const unassigned = [];

    // Mantieni gli indici validi unici; il resto passa in "unassigned"
    for (const e of arr) {
      if (Number.isInteger(e.index) && e.index > 0 && !used.has(e.index)) {
        used.add(e.index);
        keepers.push(e);
      } else {
        unassigned.push(e);
      }
    }

    // Il prossimo indice parte dal MAX esistente: niente rinumerazioni
    let maxIndex = 0;
    for (const k of keepers) maxIndex = Math.max(maxIndex, k.index || 0);

    // Assegna indici nuovi solo ai non assegnati
    for (const u of unassigned) {
      maxIndex += 1;
      u.index = maxIndex;
    }

    // Costruisci i nomi finali e prepara rename + sync label
    for (const e of [...keepers, ...unassigned]) {
      const want = _indexName(base, e.index);
      labelSync.push({ id: e.id, nameWanted: want });        // sync SEMPRE
      if (e.name !== want) renames.push({ id: e.id, nameWanted: want }); // rename solo se serve
    }
  }

  if (renames.length) {
    await OBR.scene.items.updateItems(
      renames.map(u => u.id),
      (list) => {
        for (const it of list) {
          const u = renames.find(x => x.id === it.id);
          if (u) it.name = u.nameWanted;
        }
      }
    );
  }

  if (labelSync.length) {
    await _syncAttachedLabels(labelSync); // aggiorna la label anche senza rename
  }
}

async function updateHP(itemId, nextHP, nextHPMax) {
  const n  = nextHP    === "" ? 0 : Math.floor(Number(nextHP)    || 0);
  const nm = nextHPMax === "" ? 0 : Math.floor(Number(nextHPMax) || 0);

  await OBR.scene.items.updateItems([itemId], (items) => {
    for (const it of items) {
      const prevMeta = (it.metadata && it.metadata[META_KEY]) || {};
      it.metadata = {
        ...(it.metadata || {}),
        [META_KEY]: { ...prevMeta, hp: n, hpMax: nm },
      };
    }
  });

  // pinga il modulo hpbar per l’aggiornamento immediato
  try {
    const { syncHPBarNow } = await import("./hpbar-items.js");
    syncHPBarNow(itemId, n, nm);
  } catch (err) {
    console.warn("[hpbar] sync error", err);
  }
}

// ===== Ordina per iniziativa (desc) con tie-break sull'ordine esistente =====
function sortByInitiative(entries, state) {
  const order = Array.isArray(state?.order) ? state.order : [];
  const pos = new Map(order.map((id, i) => [id, i]));
  return [...entries].sort((a, b) => {
    const ia = Number(a.initiative) || 0;
    const ib = Number(b.initiative) || 0;
    if (ib !== ia) return ib - ia; // desc
    const pa = pos.has(a.id) ? pos.get(a.id) : Number.MAX_SAFE_INTEGER;
    const pb = pos.has(b.id) ? pos.get(b.id) : Number.MAX_SAFE_INTEGER;
    if (pa !== pb) return pa - pb; // mantieni ordine manuale nei pareggi
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; // fallback deterministico
  });
}

    // ===== Colori fazione (border/glow + base per i gradienti)
  function factionColors(att) {
    switch (att) {
      case "enemy":
        return {
          border: "#ef4444",
          glow: "rgba(239,68,68,.28)",
          base: "#ef4444",
        };
      case "neutral":
        return {
          border: "#eab308",
          glow: "rgba(234,179,8,.24)",
          base: "#eab308",
        };
      default: // ally
        return {
          border: "#22c55e",
          glow: "rgba(34,197,94,.28)",
          base: "#22c55e",
        };
    }
  }

  // helper: hex -> rgba con alpha
  function rgba(hex, a) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!m) return hex; // fallback se già rgba
    const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  function clamp01(n){ return Math.max(0, Math.min(1, n)); }
  function hpColorByPct(p){
    if (p > 0.66) return "#16a34a"; // verde
    if (p > 0.33) return "#facc15"; // giallo
    return "#dc2626";               // rosso
  }

  // aggiorna l'iniziativa del token e riallinea l'ordine
  async function updateInitiative(itemId, nextVal) {
    const val = Number.isFinite(Number(nextVal)) ? Math.floor(Number(nextVal)) : 0;

    await OBR.scene.items.updateItems([itemId], (items) => {
      for (const it of items) {
        const prevMeta = (it.metadata && it.metadata[META_KEY]) || {};
        it.metadata = {
          ...(it.metadata || {}),
          [META_KEY]: { ...prevMeta, initiative: val },
        };
      }
    });
  }

    // ===== Render card
    function renderTrack(entries, state) {
    const len = state.order.length;
    const activeIdx = state.current ?? 0;
    const nextId = len ? state.order[(activeIdx + 1) % len] : null;
    // ---- PRE-PROCESS: costruiamo una lista “entriesForRender” che rispetta i collapse
const collapsed = state?.collapsed || {};
const groups = new Map(); // key -> array di membri
for (const e of entries) {
  const k = __groupKey(e);
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(e);
}

const emitted = new Set();
const entriesForRender = [];
for (const e of entries) {
  const k = __groupKey(e);
  const list = groups.get(k) || [e];

  if (list.length > 1 && collapsed[k]) {
    // gruppo collassato: emetti una sola card “lead”
    if (emitted.has(k)) continue;
    const lead = { 
      ...list[0],
      __groupKey: k,
      __groupMembers: list.slice(),
      __groupCollapsed: true,
      __groupBase: _parseIndexedName(e.name).base,
      __groupCount: list.length
    };
    entriesForRender.push(lead);
    emitted.add(k);
  } else {
    // gruppo espanso: segna la prima card per mostrare il chevron "▾"
    if (list.length > 1 && list[0].id === e.id) {
      e.__groupFirst = true;
      e.__groupKey = k;
      e.__groupBase = _parseIndexedName(e.name).base;
      e.__groupCount = list.length;
    }
    entriesForRender.push(e);
  }
}

    const nodes = entriesForRender.map((e) => {
    const c = factionColors(e.attitude);
    const card = document.createElement("div");
    card.dataset.itemId     = e.id;
    card.dataset.initiative = String(e.initiative || 0);
    card.dataset.groupCollapsed = e.__groupCollapsed ? "1" : "0";
    card.setAttribute("draggable", "true");


      function ringMask(el, insetPx){
        Object.assign(el.style, {
        padding: `${insetPx}px`, // spessore dell’anello
        WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
        mask:       "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
        WebkitMaskComposite: "xor",
        maskComposite: "exclude",
      });
    }
    function applyBG3Frame(card, c, opts = {}) {
    const OUTLINE_W = opts.outlineW ?? 2;   // bordo nero
    const FRAME_W   = opts.frameW   ?? 4;   // spessore anello
    const R_OUTER   = opts.rOuter   ?? 12;  // esterno (SPIGOLO: teniamolo 0 sugli strati)
    const R_INNER   = opts.rInner   ?? 12;  // raggio interno ARROTONDATO
    const EPS = 0.5;

    // base card (tuo background neutro)
    card.style.position = "relative";
    card.style.marginLeft = "16px"; // o il valore che vuoi
    card.style.background = "linear-gradient(180deg, rgba(12,16,22,.65), rgba(12,16,22,.35))";
    card.style.border = "none";
    card.style.borderRadius = `${R_INNER}px`; // raggio del contenuto
    card.style.height = "48px"; // o un valore che ti piace
    card.style.overflow = "visible"; // importante per permettere la fuoriuscita

    // 1) Outline nero esterno — SHARP
    const outline = document.createElement("div");
    Object.assign(outline.style, {
      position: "absolute",
      inset: "0",
      border: `${OUTLINE_W}px solid #000`,
      borderRadius: "0px",            // spigolo vivo
      pointerEvents: "none",
      zIndex: "0",
    });

    // 2a) FONDO COLORATO dell’anello (esterno squadrato)
    const ringFill = document.createElement("div");
    Object.assign(ringFill.style, {
      position: "absolute",
      inset: `${OUTLINE_W}px`,        // parte subito dopo l'outline
      background: `
        linear-gradient(135deg,
          ${c.base} 0%,
          ${c.base} 100%)
      `,
      borderRadius: "0px",            // SPIGOLO VIVO all’esterno
      pointerEvents: "none",
      zIndex: "0",
    });

    // 2b) “TAPPO” centrale che crea il buco arrotondato
    const ringHole = document.createElement("div");
    Object.assign(ringHole.style, {
      position: "absolute",
      inset: `${OUTLINE_W + FRAME_W}px`,     // spessore anello
      borderRadius: `${R_INNER}px`,          // ARROTONDATO all’interno
      background: "inherit",                 // stesso bg della card
      // bevel interno (facoltativo)
      boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.9)",
      pointerEvents: "none",
      zIndex: "0",
    });

    // (opzionale) lieve sheen che segue l’anello
    const sheen = document.createElement("div");
    Object.assign(sheen.style, {
      position: "absolute",
      inset: `${OUTLINE_W}px`,
      background: `
        linear-gradient(140deg, rgba(255,255,255,0.10), transparent 45%),
        linear-gradient(320deg, rgba(255,255,255,0.06), transparent 55%)
      `,
      borderRadius: "0px",            // fuori squadrato
      pointerEvents: "none",
      zIndex: "0",
    });

    card.append(outline, ringFill, ringHole, sheen);
  }

  // base card
  card.style.minWidth = "250px";
  card.style.maxWidth = "250px";
  card.style.padding  = "0px 0px 0px";
  card.style.color = "#fff";
  card.style.display = "flex";
  card.style.flexDirection = "column";
  card.style.alignItems = "stretch";
  card.style.gap = "100%";

  // applica la cornice stile BG3
  applyBG3Frame(card, c, {
    outlineW: 1.5,
    frameW: 4,
    rOuter: 0,
    rInner: 8
  });

    const isActive = e.__groupMembers
  ? e.__groupMembers.some(m => m.id === state.order[state.current])
  : (state.order[state.current] === e.id);

const isNext = e.__groupMembers
  ? e.__groupMembers.some(m => m.id === nextId)
  : (nextId === e.id);

  if (isActive) {
    // gradiente “tintato” col colore di fazione
    card.style.background =
      `linear-gradient(135deg,
        ${rgba(c.base, 0.58)} 0%,
        ${rgba(c.base, 1.00)} 100%
      ), linear-gradient(75deg, rgba(165, 165, 165, 0.53), rgba(255, 255, 255, 1))`;

    card.style.boxShadow =
      `0 0 0 2px ${c.glow},
      0 0 14px 2px ${c.glow},
      inset 0 0 0 1px rgba(255,255,255,.66)`;

    card.dataset.active = "1";

  const activeBadge = document.createElement("div");
    activeBadge.textContent = "⚔";
    Object.assign(activeBadge.style, {
      position: "absolute",
      left: "28px",                 // spilla sul lato sinistro della card
      top: "50%",
      transform: "translateY(55%)", // spostala leggermente in basso
      width: "18px",
      height: "18px",
      borderRadius: "50%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: "14px",
      fontWeight: "900",
      color: "#fff",
      background: c.border,
      boxShadow: "0 2px 6px rgba(0,0,0,.85), 0 0 0 2px rgba(0,0,0,.6)",
      zIndex: "4",
      pointerEvents: "none",
    });
    card.appendChild(activeBadge);

  }

  if (isNext && !isActive) {
    // stessa tinta ma molto più soft
    card.dataset.next = "1";
    card.style.boxShadow =
      `0 0 0 1px ${c.glow},
      inset 0 0 0 1px rgba(255,255,255,.28)`;
  }

  // --- header: avatar + name + badge (tutto in riga)

  // --- costanti avatar/overlap ---
  const AVA = 52;     // diametro avatar
  const OVER = 12;    // quanto sporge fuori a sinistra

  // header: avatar + name + badge
  const header = document.createElement("div");
  Object.assign(header.style, {
    position: "relative",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    height: "100%",
    width: "100%",
    padding: "8px 16px",
    paddingLeft: `${AVA - OVER + 12}px`,   // spazio per il testo
    paddingRight: "40px",
    boxSizing: "border-box",
  });

  let avatar;
  if (e.portrait) {
    avatar = document.createElement("img");
    avatar.src = e.portrait;
    avatar.alt = e.name;
  } else {
    avatar = document.createElement("div");
    avatar.textContent = e.name.slice(0,1).toUpperCase();
    Object.assign(avatar.style, {
      border: "1px solid rgba(255,255,255,.22)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontWeight: "800",
      fontSize: "18px",
      background: "rgba(255,255,255,.08)",
    });
  }

  // stile comune overlap
  Object.assign(avatar.style, {
    position: "absolute",
    left: `-${OVER}px`,
    top: "50%",
    transform: "translateY(-50%)",
    width: `${AVA}px`,
    height: `${AVA}px`,
    borderRadius: "50%",
    objectFit: "cover",
    flex: "0 0 auto",
    zIndex: "2",
    boxShadow: `0 0 0 2px ${c.base}, 0 0 10px ${c.glow}`,
  });

  // nome (parte subito a destra dell’avatar)
  const name = document.createElement("div");
  name.title = e.__groupCollapsed ? `${e.__groupBase} (${e.__groupCount})` : e.name;


  Object.assign(name.style, {
  flex: "1 1 auto",
  minWidth: "0",
  display: "flex",
  alignItems: "center",
  gap: "6px",
});

const nameLabel = document.createElement("span");
nameLabel.textContent = e.__groupCollapsed ? e.__groupBase : e.name;
Object.assign(nameLabel.style, {
  flex: "1 1 auto",
  minWidth: "0",
  fontSize: "14px",
  fontWeight: "700",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});
name.appendChild(nameLabel);

// --- CHIP ×N SULL'AVATAR (solo se collassato) ---
if (e.__groupCollapsed && e.__groupCount > 1) {
  const CHIP = 32;            // diametro chip (regola qui)
  const OFFSET = 7;           // quanto rientra dall'angolo

  const cnt = document.createElement("div");
  cnt.textContent = `×${e.__groupCount}`;
  Object.assign(cnt.style, {
    position: "absolute",
    left:  (52 - 12 - (CHIP / 2)) + "px",               // AVA - OVER - CHIP/2
    top:   `calc(50% + ${(52 / 2) - (CHIP / 2) - OFFSET}px)`, // 50% + AVA/2 - CHIP/2 - offset
    width:  CHIP + "px",
    height: CHIP + "px",
    borderRadius: "999px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "12px",
    fontWeight: "800",
    color: "#fff",
    background: "rgba(0,0,0,.85)",
    border: "1px solid rgba(255,255,255,.22)",
    boxShadow: "0 2px 6px rgba(0,0,0,.55)",
    zIndex: "6",
    pointerEvents: "none",
  });
  header.appendChild(cnt);
}

  Object.assign(name.style, {
    position: "relative",   // serve per la riserva del paddingRight
    display: "flex",
    alignItems: "center",
    gap: "6px",
    flex: "1 1 auto",
    minWidth: "0",                 // necessario per ellissi in flex
    fontSize: "14px",
    fontWeight: "700",
    textAlign: "left",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    zIndex: "1",
  });

  // badge iniziativa (ancorato a destra, centrato verticalmente)
  const badge = document.createElement("div");
  badge.textContent = String(e.initiative);
  badge.title = "Click per modificare l'iniziativa";
  Object.assign(badge.style, {
    position: "absolute",
    right: "12px",
    top: "50%",
    transform: "translateY(-50%)",
    padding: "5px 6px",
    fontSize: "16px",
    fontWeight: "700",
    lineHeight: "1.2",
    color: "#fff",
    background: "rgba(0,0,0,.72)",
    border: "1px solid rgba(255,255,255,.18)",
    borderRadius: "64px",
    boxShadow: "0 0 0 1px rgba(0,0,0,.25)",
    cursor: "text",
  });

if (e.__groupCollapsed) {
  // Sulla card collassata l’iniziativa è solo informativa
  badge.title = "Espandi il gruppo per modificare le iniziative";
  badge.style.cursor = "default";
}

badge.style.userSelect = "none";
badge.dataset.badge  = "init";
badge.dataset.itemId = e.id;

badge.addEventListener("pointerdown", async (ev) => {
  // se è già in editing, non fare nulla
  if (e.__groupCollapsed) { ev.preventDefault(); ev.stopPropagation(); return; }
  if (badge.dataset.editing === "1") return;

  ev.preventDefault();
  ev.stopPropagation();

  // chiudi QUALSIASI altro editor già aperto (HP o iniziativa)
  await closeOpenEditors();

  // entra in modalità editing con lock (evita re-render)
  __editingInitForId = e.id;

  const input = document.createElement("input");
  input.type = "text";                // niente spinner
  input.inputMode = "numeric";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.pattern = "-?\\d*";
  input.value = String(e.initiative);

  Object.assign(input.style, {
    width: "46px",
    boxSizing: "border-box",
    border: "none",
    outline: "none",
    background: "transparent",
    color: "#fff",
    fontSize: "16px",
    fontWeight: "700",
    textAlign: "center",
  });

  const old = badge.textContent;
  badge.textContent = "";
  badge.appendChild(input);
  badge.dataset.editing = "1";
  badge.dataset.initEditing = "1";    // ← per closeOpenEditors()

  // inghiotte il PRIMO click di coda
  const swallowFirstClick = (evt) => {
    if (badge.contains(evt.target)) {
      evt.stopPropagation();
      evt.preventDefault();
    }
  };
  document.addEventListener("click", swallowFirstClick, { capture: true, once: true });

  // filtri input
  input.addEventListener("wheel", (e) => e.preventDefault(), { passive: false });
  input.addEventListener("keydown", (ke) => {
    if (ke.key === "ArrowUp" || ke.key === "ArrowDown") ke.preventDefault();
  });
  input.addEventListener("input", () => {
    let v = input.value.replace(/[^\d-]/g, "");
    if (v.indexOf("-") > 0) v = "-" + v.replace(/-/g, "");
    input.value = v;
  });
  input.addEventListener("pointerdown", (e2) => { e2.stopPropagation(); });

  // focus SINCRONO
  input.focus({ preventScroll: true });
  input.select();

  // ---- commit/cancel con guard anti-doppio commit ----
  let committed = false;
  let tabbing = false;

  const cleanup = () => {
    delete badge.dataset.editing;
    delete badge.dataset.initEditing;
    __editingInitForId = null;        // sblocca re-render
    delete badge.__commitFn;
    delete badge.__cancelFn;
  };

  const commit = async () => {
  if (committed) return;
  committed = true;
  const v = input.value.trim();
  try { badge.removeChild(input); } catch {}
  const normalized = v === "" ? old : String(Math.floor(Number(v) || 0));
  badge.textContent = normalized;

  await updateInitiative(e.id, normalized);
  // <<< PROPAGAZIONE (prima volta) >>>
  try { await trySeedGroupInitiative(e.id, normalized); } catch (err) { console.warn(err); }

  cleanup();
  await renderAll();
};

  const cancel = () => {
    if (committed) return;
    committed = true;
    try { badge.removeChild(input); } catch {}
    badge.textContent = old;
    cleanup();
    renderAll();
  };

  // salva i puntatori per closeOpenEditors()
  badge.__commitFn = commit;
  badge.__cancelFn = cancel;

  // helper: conferma e apre la pill adiacente (sotto/ sopra) in base a goPrev
  const commitAndOpenNeighbor = async (goPrev = false) => {
    let targetId = null;
    try {
      const st = await getSceneState();
      const order = Array.isArray(st?.order) ? st.order : [];
      const idx = order.indexOf(e.id);
      if (idx >= 0) {
        const ni = goPrev ? idx - 1 : idx + 1;
        if (ni >= 0 && ni < order.length) targetId = order[ni];
      }
    } catch {}

    tabbing = true;
    await commit();
    tabbing = false;

    if (targetId) {
      // aspetta il render, poi entra in edit sulla pill target
      requestAnimationFrame(() => {
        const nextEl = document.querySelector(
          `[data-badge="init"][data-item-id="${targetId}"]`
        );
        if (nextEl) {
          nextEl.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
          // scrolla e focus input se già presente
          nextEl.scrollIntoView?.({ block: "center", inline: "nearest", behavior: "smooth" });
          const nxt = nextEl.querySelector("input");
          if (nxt) { try { nxt.focus({ preventScroll: true }); nxt.select(); } catch {} }
        }
      });
    }
  };

  // tastiera: Enter = solo commit; Tab = commit + vai giù (Shift+Tab su)
  input.addEventListener("keydown", async (ke) => {
    if (ke.key === "Enter")  { ke.preventDefault(); await commit(); return; }
    if (ke.key === "Escape") { ke.preventDefault();  cancel();     return; }
    if (ke.key === "Tab")    { ke.preventDefault(); await commitAndOpenNeighbor(ke.shiftKey); return; }
  });

  // su blur, commit normale (ma non durante il jump via TAB)
  input.addEventListener("blur", () => {
    if (!tabbing) requestAnimationFrame(() => commit());
  });
});

if (e.__groupCollapsed) {
  const chev = document.createElement("div");
  chev.textContent = "▸";
  Object.assign(chev.style, {
    position: "absolute",
    left: "2px",                   // ← a sinistra del badge ⚔ (che sta a ~24px)
    top: "50%",
    transform: "translateY(30%)",  // stessa verticale del badge ⚔
    width: "22px",                 // stessa taglia del badge ⚔
    height: "22px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "14px",
    fontWeight: "800",
    color: "#fff",
    background: "rgba(0,0,0,.80)",
    border: "1px solid rgba(255,255,255,.22)",
    boxShadow: "0 2px 6px rgba(0,0,0,.55)",
    cursor: "pointer",
    userSelect: "none",
    zIndex: "6",
  });
  chev.title = `Espandi gruppo “${e.__groupBase}”`;
  chev.addEventListener("click", async (ev) => {
    ev.stopPropagation();
    await setSceneState(prev => {
      const c = { ...(prev.collapsed || {}) };
      delete c[e.__groupKey];
      return { ...prev, collapsed: c };
    });
  });
  header.appendChild(chev);
}

else if (e.__groupFirst) {
  const chev = document.createElement("div");
  chev.textContent = "▾";
  Object.assign(chev.style, {
    position: "absolute",
    left: "2px",
    top: "50%",
    transform: "translateY(30%)",
    width: "22px",
    height: "22px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "14px",
    fontWeight: "800",
    color: "#fff",
    background: "rgba(0,0,0,.80)",
    border: "1px solid rgba(255,255,255,.22)",
    boxShadow: "0 2px 6px rgba(0,0,0,.55)",
    cursor: "pointer",
    userSelect: "none",
    zIndex: "6",
  });
  chev.title = `Comprimi gruppo “${e.__groupBase}”`;
  chev.addEventListener("click", async (ev) => {
    ev.stopPropagation();
    await setSceneState(prev => {
      const c = { ...(prev.collapsed || {}) };
      c[e.__groupKey] = true;
      return { ...prev, collapsed: c };
    });
  });
  header.appendChild(chev);
}

  header.append(avatar, name, badge);
  card.appendChild(header);

// === HP pill (solo GM)
if (IS_GM && !e.__groupCollapsed) {
  const pill = document.createElement("div");
  pill.title = "Click per modificare HP (puoi usare +N o -N)";
  pill.style.position = "absolute";
  pill.style.top = "70%";
  pill.style.left = "19%";
  pill.style.padding = "4px 8px";
  pill.style.fontSize = "13px";
  pill.style.fontWeight = "700";
  pill.style.lineHeight = "1";
  pill.style.color = "#fff";
  pill.style.background = "rgba(0,0,0,.72)";
  pill.style.border = "1px solid rgba(255,255,255,.18)";
  pill.style.borderRadius = "16px";
  pill.style.boxShadow = "0 2px 6px rgba(0,0,0,.45)";
  pill.style.cursor = "text";
  pill.style.zIndex = "3";

  const hpVal  = Number.isFinite(e.hp)    ? e.hp    : 0;
  const hpMaxV = Number.isFinite(e.hpMax) ? e.hpMax : 0;
  pill.textContent = `${hpVal}/${hpMaxV}`;
  pill.dataset.badge  = "hp";
  pill.dataset.itemId = e.id;

  // === Barra HP visuale accanto alla pill ===
  const hpBarWrap = document.createElement("div");
  hpBarWrap.style.position = "absolute";
  hpBarWrap.style.top = "80%";
  hpBarWrap.style.left = "calc(23% + 60px)"; // spostata a destra della pill
  hpBarWrap.style.width = "90px";
  hpBarWrap.style.height = "12px";
  hpBarWrap.style.background = "rgba(0, 0, 0, 0.85)";
  hpBarWrap.style.border = "1px solid rgba(0, 0, 0, 1)";
  hpBarWrap.style.borderRadius = "16px";
  hpBarWrap.style.overflow = "hidden";
  hpBarWrap.style.zIndex = "3";
  hpBarWrap.style.boxShadow = "0 2px 6px rgba(0,0,0,.55)";

  const initPct = hpMaxV > 0 ? Math.max(0, Math.min(1, hpVal / hpMaxV)) : 0;
  const hpFill = document.createElement("div");
  hpFill.style.width = (initPct * 100) + "%";
  hpFill.style.height = "100%";
  hpFill.style.background = initPct > 0.66 ? "#16a34a" : initPct > 0.33 ? "#facc15" : "#dc2626";

  hpBarWrap.appendChild(hpFill);

  card.appendChild(pill);
  card.appendChild(hpBarWrap);

  // Apriamo l’editor su pointerdown per evitare click “di coda”
  pill.addEventListener("pointerdown", async (ev) => {
  ev.stopPropagation();
  ev.preventDefault(); // evita selezione/drag prima di montare gli input
  if (pill.dataset.hpEditing === "1") return; // già aperto

  // 1) Chiudi QUALSIASI altro editor già aperto (HP o iniziativa)
  await closeOpenEditors();

  // 2) Marca questa pill come “in edit” + disabilita temporaneamente il drag della card
  __editingHPForId = e.id;
  pill.dataset.hpEditing = "1";
  const cardEl = pill.closest('[data-item-id]');
  const prevDraggable = cardEl ? cardEl.getAttribute("draggable") : null;
  if (cardEl) cardEl.setAttribute("draggable", "false");

  // 3) Parser inline (+N/-N o assoluti)
  function parseInlineMath(input, baseValue) {
    const s = String(input || "").trim();
    if (s === "") return baseValue;
    const m = /^([+\-])(\d+)$/.exec(s);
    if (m) {
      const sign = m[1] === "-" ? -1 : 1;
      const n = parseInt(m[2], 10);
      return Math.max(0, (baseValue || 0) + sign * n);
    }
    const abs = parseInt(s, 10);
    if (!Number.isNaN(abs)) return Math.max(0, abs);
    return baseValue;
  }

  // 4) PREFILL ROBUSTO: prova dalla pill, poi dai metadata
  const pillTxt = (pill.textContent || "").trim();
  let fromPillHP = null, fromPillMax = null;
  const m = /^(\d+)\s*\/\s*(\d+)$/.exec(pillTxt);
  if (m) { fromPillHP = parseInt(m[1], 10); fromPillMax = parseInt(m[2], 10); }

  const hpVal  = Number.isFinite(fromPillHP)  ? fromPillHP  : (Number.isFinite(e.hp)    ? e.hp    : 0);
  const hpMaxV = Number.isFinite(fromPillMax) ? fromPillMax : (Number.isFinite(e.hpMax) ? e.hpMax : 0);

  // editor: due input "text" (niente spinner)
  const wrap = document.createElement("div");
  wrap.style.display = "flex";
  wrap.style.alignItems = "center";
  wrap.style.gap = "4px";

  const iHP  = document.createElement("input");
  const iMax = document.createElement("input");
  for (const inp of [iHP, iMax]) {
    inp.type = "text";
    inp.inputMode = "numeric";
    inp.autocomplete = "off";
    inp.spellcheck = false;
    inp.pattern = "[+\\-]?\\d*";   // consenti +N/-N o numero
    // stile
    inp.style.width = "22px";
    inp.style.border = "none";
    inp.style.outline = "none";
    inp.style.background = "transparent";
    inp.style.color = "#fff";
    inp.style.fontSize = "15px";
    inp.style.fontWeight = "700";
    inp.style.textAlign = "center";
    // niente wheel / arrows verticali
    inp.addEventListener("wheel", (e) => e.preventDefault(), { passive: false });
    inp.addEventListener("keydown", (ke) => {
      if (ke.key === "ArrowUp" || ke.key === "ArrowDown") ke.preventDefault();
    });
    // pulizia: un solo segno in testa e cifre
    inp.addEventListener("input", () => {
      let v = (inp.value || "").replace(/\s+/g, "");
      v = v.replace(/(?!^)[+\-]/g, "");        // solo segno iniziale
      v = v.replace(/(?!^[+\-])\D+/g, "");     // poi solo cifre
      inp.value = v;
    });
    // non propagare click interni
    inp.addEventListener("click", (e2) => e2.stopPropagation());
  }
  iHP.value  = "";     // vuoto → usa base come preview
  iMax.value = "";

  const slash = document.createElement("span");
  slash.textContent = "/";
  slash.style.opacity = ".8";
  slash.addEventListener("click", (e2) => e2.stopPropagation());

  const oldHTML = pill.innerHTML;
  pill.textContent = "";
  wrap.append(iHP, slash, iMax);
  pill.appendChild(wrap);

  // focus su XX o YY in base al click (se clicchi a destra della pill -> YY)
  const clickedRightHalf = ev.offsetX > pill.clientWidth / 2;
  (clickedRightHalf ? iMax : iHP).focus({ preventScroll: true });
  (clickedRightHalf ? iMax : iHP).select();

  // ---- commit/cancel con guard + supporto TAB-jump ----
  let committed = false;
  let tabbing = false;

  const commit = async () => {
    if (committed) return;
    committed = true;

    // leggi gli originali dalla pill (prima di sostituirla li avevamo)
    const hpVal  = Number.isFinite(e.hp)    ? e.hp    : 0;
    const hpMaxV = Number.isFinite(e.hpMax) ? e.hpMax : 0;

    const vHP  = iHP.value.trim();
    const vMax = iMax.value.trim();

    // calcola con inline math rispetto agli originali
    let nextHP    = parseInlineMath(vHP,  hpVal);
    let nextHPMax = parseInlineMath(vMax, hpMaxV);
  
    // clamp: HP <= HPMax (se > 0)
    if (nextHPMax > 0) nextHP = Math.min(nextHP, nextHPMax);

    pill.innerHTML = `${nextHP}/${nextHPMax}`;
    // aggiorna mini-barra visuale accanto alla pill
    const pct = nextHPMax > 0 ? Math.max(0, Math.min(1, nextHP / nextHPMax)) : 0;
    hpFill.style.width = (pct * 100) + "%";
    hpFill.style.background = hpColorByPct(pct);

    await updateHP(e.id, nextHP, nextHPMax);
    try { await trySeedGroupHP(e.id, nextHP, nextHPMax); } catch (err) { console.warn(err); }
    cleanup();
    // (opzionale) ridisegna adesso che non sei più in edit
    // await renderAll();
  };

  const cancel = () => {
    if (committed) return;
    committed = true;
    pill.innerHTML = oldHTML;
    cleanup();
    // renderAll(); // opzionale
  };

  // chiudi solo cliccando FUORI dalla pill
  const onDocClick = async (evt) => {
    if (!pill.contains(evt.target)) {
      await commit();
    }
  };
  document.addEventListener("click", onDocClick, { capture: true });

  function cleanup() {
    try { document.removeEventListener("click", onDocClick, { capture: true }); } catch {}
    __editingHPForId = null;
    delete pill.dataset.hpEditing;
    delete pill.__commitFn;
    delete pill.__cancelFn;
  }

  // espone commit/cancel a closeOpenEditors()
  pill.__commitFn = commit;
  pill.__cancelFn = cancel;

  // helper: commit e apri l'editor HP del vicino (giù o su)
  const commitAndOpenNeighbor = async (goPrev = false) => {
    let targetId = null;
    try {
      const st = await getSceneState();
      const order = Array.isArray(st?.order) ? st.order : [];
      const idx = order.indexOf(e.id);
      if (idx >= 0) {
        const ni = goPrev ? idx - 1 : idx + 1;
        if (ni >= 0 && ni < order.length) targetId = order[ni];
      }
    } catch {}

    tabbing = true;
    await commit();
    tabbing = false;

    if (targetId) {
      // aspetta il re-render, poi apri editor del target (focus su HP corrente)
      requestAnimationFrame(() => {
        const nextEl = document.querySelector(
          `[data-badge="hp"][data-item-id="${targetId}"]`
        );
        if (nextEl) {
          nextEl.dispatchEvent(new MouseEvent("click", { bubbles: true }));
          nextEl.scrollIntoView?.({ block: "center", inline: "nearest", behavior: "smooth" });
          // prova a focusare l'input HP (il primo)
          const inputs = nextEl.querySelectorAll("input");
          const first = inputs && inputs[0];
          if (first) { try { first.focus({ preventScroll: true }); first.select(); } catch {} }
        }
      });
    }
  };

  // keymap:
  //  - Enter su uno qualunque: commit
  //  - Esc: cancel
  //  - Tab su HP: focus HPMax (senza commit). Shift+Tab: commit + vai al precedente
  //  - Tab su HPMax: commit + vai al successivo. Shift+Tab: focus HP
  const onKeyHP = async (ke) => {
    if (ke.key === "Enter") { ke.preventDefault(); await commit(); return; }
    if (ke.key === "Escape") { ke.preventDefault(); cancel(); return; }
    if (ke.key === "Tab") {
      ke.preventDefault();
      if (ke.shiftKey) { await commitAndOpenNeighbor(true); }
      else { iMax.focus({ preventScroll: true }); iMax.select(); }
    }
  };
  const onKeyMax = async (ke) => {
    if (ke.key === "Enter") { ke.preventDefault(); await commit(); return; }
    if (ke.key === "Escape") { ke.preventDefault(); cancel(); return; }
    if (ke.key === "Tab") {
      ke.preventDefault();
      if (ke.shiftKey) { iHP.focus({ preventScroll: true }); iHP.select(); }
      else { await commitAndOpenNeighbor(false); }
    }
  };

  iHP.addEventListener("keydown", onKeyHP);
  iMax.addEventListener("keydown", onKeyMax);
});
}      return card;
    });

    track.replaceChildren(...nodes.filter(Boolean));

    const active = track.querySelector('[data-active="1"]');
  active?.scrollIntoView?.({ behavior: "smooth", block: "center", inline: "nearest" });

  }

async function ensureState() {
  const state = await getSceneState();
  if (state) return;
  const sorted = sortByInitiative(await readEntries(), null);
  await setSceneState({
    order: [...new Set(sorted.map(e => e.id))],
    current: 0,
    round: 1,
    seededGroups: {},
    collapsed: {}
  });
}

  function arraysEqual(a, b) {
    if (a === b) return true;
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;

  }
async function reconcileStateWithItems() {
  const [state, entries] = await Promise.all([getSceneState(), readEntries()]);

  // → Se non c'è più nessun token con META_KEY, reset completo (turno=1)
  if (!entries || entries.length === 0) {
    await resetTrackerState();
    return true;
  }

  const sorted   = sortByInitiative(entries, state);
  const newOrder = [...new Set(sorted.map(e => e.id))];

  let newCurrent = 0;
  const activeId = state?.order?.[state.current];
  if (activeId) {
    const idx = newOrder.indexOf(activeId);
    if (idx >= 0) newCurrent = idx;
  }

  if (state &&
      state.current === newCurrent &&
      state.order &&
      state.order.length === newOrder.length &&
      state.order.every((id, i) => id === newOrder[i])) {
    return false;
  }

  const round = Math.max(1, state?.round || 1);
  const seededGroups = state?.seededGroups || {};
  const collapsed = state?.collapsed || {};
  await setSceneState({ order: newOrder, current: newCurrent, round, seededGroups, collapsed });
  return true;
}

// --- DnD helper: sposta sourceId prima/dopo targetId ma SOLO fra pari iniziativa
async function _reorderWithinSameInitiative(sourceId, targetId, placeBefore) {
  if (!sourceId || !targetId || sourceId === targetId) return;

  const [st, entries] = await Promise.all([getSceneState(), readEntries()]);
  const byId = new Map(entries.map(e => [e.id, e]));
  const src = byId.get(sourceId);
  const dst = byId.get(targetId);
  if (!src || !dst) return;

  const init = Number(src.initiative) || 0;
  if ((Number(dst.initiative) || 0) !== init) return;  // solo fra pari

  const curOrder = Array.isArray(st?.order) ? st.order.slice() : [];
  if (!curOrder.length) return;

  const isSameInit = (id) => (Number(byId.get(id)?.initiative) || 0) === init;
  const indices = curOrder.map((id, i) => (isSameInit(id) ? i : -1)).filter(i => i >= 0);
  if (!indices.length) return;

  const blockStart = Math.min(...indices);
  const blockEnd   = Math.max(...indices);
  const tieIds     = curOrder.slice(blockStart, blockEnd + 1);

  const srcIdx = tieIds.indexOf(sourceId);
  const dstIdx = tieIds.indexOf(targetId);
  if (srcIdx < 0 || dstIdx < 0) return;

  const cut = tieIds.splice(srcIdx, 1)[0];
  const insertAt = placeBefore ? dstIdx : (dstIdx + 1);
  tieIds.splice(insertAt > srcIdx ? insertAt - 1 : insertAt, 0, cut);

  const newOrder = curOrder.slice(0, blockStart).concat(tieIds, curOrder.slice(blockEnd + 1));

  // mantieni attivo lo stesso ID (se presente)
  const activeId = st?.order?.[st.current];
  const newCurrent = Math.max(0, newOrder.indexOf(activeId));

  await setSceneState(prev => ({ ...(prev || {}), order: newOrder, current: newCurrent }));
}

// Sposta un BLOCCO di ID (sourceIds) prima/dopo targetId SOLO nel blocco dei pari iniziativa
async function _reorderBlockWithinSameInitiative(sourceIds, targetId, placeBefore) {
  if (!Array.isArray(sourceIds) || sourceIds.length === 0) return;
  if (!targetId) return;
  const uniqSrc = [...new Set(sourceIds)];
  if (uniqSrc.includes(targetId)) return; // niente no-op

  const [st, entries] = await Promise.all([getSceneState(), readEntries()]);
  const byId = new Map(entries.map(e => [e.id, e]));
  const target = byId.get(targetId);
  if (!target) return;

  // tutte le sorgenti devono esistere
  const allSrc = uniqSrc.map(id => byId.get(id)).filter(Boolean);
  if (allSrc.length !== uniqSrc.length) return;

  // vincolo: tutte le sorgenti e il target devono avere la STESSA iniziativa
  const init = Number(target.initiative) || 0;
  for (const s of allSrc) {
    if ((Number(s.initiative) || 0) !== init) {
      console.warn("[dnd] gruppo contiene iniziative diverse: annullo move");
      return;
    }
  }

  const curOrder = Array.isArray(st?.order) ? st.order.slice() : [];
  if (!curOrder.length) return;

  // blocco contiguo di pari iniziativa nell'ordine corrente
  const isSameInit = (id) => (Number(byId.get(id)?.initiative) || 0) === init;
  const indices = curOrder.map((id, i) => (isSameInit(id) ? i : -1)).filter(i => i >= 0);
  if (!indices.length) return;

  const blockStart = Math.min(...indices);
  const blockEnd   = Math.max(...indices);
  const tieIds     = curOrder.slice(blockStart, blockEnd + 1);

  // estrai le sorgenti (mantenendo l’ordine relativo)
  const srcSet = new Set(uniqSrc);
  const moving = tieIds.filter(id => srcSet.has(id));
  if (!moving.length) return;

  // rimuovi le sorgenti dal blocco
  const tieFiltered = tieIds.filter(id => !srcSet.has(id));

  // trova l’indice del target NEL blocco filtrato
  const dstIdx = tieFiltered.indexOf(targetId);
  if (dstIdx < 0) return;

  const insertAt = placeBefore ? dstIdx : (dstIdx + 1);
  tieFiltered.splice(insertAt, 0, ...moving);

  // ricompone l'ordine finale
  const newOrder = curOrder.slice(0, blockStart).concat(tieFiltered, curOrder.slice(blockEnd + 1));

  // preserva l'attivo
  const activeId = st?.order?.[st.current];
  const newCurrent = Math.max(0, newOrder.indexOf(activeId));

  await setSceneState(prev => ({ ...(prev || {}), order: newOrder, current: newCurrent }));
}

// Wrapper: trova i membri del gruppo del lead collassato e chiama il riordino a blocco
async function _reorderCollapsedGroupWithinSameInitiative(sourceLeadId, targetId, placeBefore) {
  const { members } = await _getGroupForItemId(sourceLeadId); // già presente nel tuo file
  const ids = (members && members.length > 0) ? members : [sourceLeadId];
  await _reorderBlockWithinSameInitiative(ids, targetId, placeBefore);
}

  function sanitizeState(state, byId) {
  const seen = new Set();
  const cleanOrder = [];

  for (const id of state?.order ?? []) {
    if (!byId.has(id)) continue;   // scarta ID non più esistenti
    if (seen.has(id)) continue;    // scarta duplicati
    seen.add(id);
    cleanOrder.push(id);
  }

  // Se non restano elementi → RESET visivo: round=1 e seededGroups azzerati
  if (cleanOrder.length === 0) {
    return { order: [], current: 0, round: 1, seededGroups: {}, collapsed: {} };
  }

  const activeId = state?.order?.[state.current];
  let current = 0;
  if (activeId && byId.has(activeId)) {
    const idx = cleanOrder.indexOf(activeId);
    current = idx >= 0 ? idx : 0;
  } else {
    current = Math.min(state?.current ?? 0, cleanOrder.length - 1);
  }
    const round = Math.max(1, state?.round || 1);
    const seededGroups = state?.seededGroups || {};
    const collapsed = (state && typeof state.collapsed === "object" && state.collapsed) || {};
    return { order: cleanOrder, current, round, seededGroups, collapsed };

  }

    async function renderAll() {
    // leggi in parallelo
    const [stateRaw, entries] = await Promise.all([getSceneState(), readEntries()]);
    const byId = new Map(entries.map((e) => [e.id, e]));

    // stato “pulito” per evitare flicker/duplicati
    const stateClean = sanitizeState(stateRaw ?? { order: [], current: 0 }, byId);

    try {
      roundPill.textContent = `Turno ${Math.max(1, stateClean.round || 1)}`;
    } catch {}

    // se lo stato pulito è diverso dal raw, riallinea i metadata una volta sola
    const needFix =
      !stateRaw ||
      stateRaw.current !== stateClean.current ||
      (stateRaw.order?.length || 0) !== stateClean.order.length ||
      (stateRaw.order || []).some((id, i) => id !== stateClean.order[i]);

    if (needFix) {
      // N.B. questo triggherà onMetadataChange, ma intanto noi renderizziamo già giusto
      await setSceneState(stateClean);

    }
    // Evita rimpiazzi DOM mentre c'è un editor aperto o stiamo switchando editor
    if (__suspendRenders) return;
    if (__editingInitForId || __editingHPForId) {
    if (needFix) await setSceneState(stateClean); // allinea lo stato, ma NON ridisegnare
    return;
}
    // costruisci la lista rispettando l’ordine pulito
    const ordered = stateClean.order.map((id) => byId.get(id)).filter(Boolean);

    // render “idempotente”
    renderTrack(ordered, stateClean);
  }

  OBR.onReady(async () => {
    try {
      const role =
        (await OBR.player?.getRole?.()) ||
        (await OBR.room?.getRole?.()) ||
        "PLAYER";
      IS_GM = String(role).toUpperCase() === "GM";
    } catch {
      IS_GM = false;
    }
    try {
} catch (e) {
  console.error("[hpbar] mount error", e?.error?.message || e?.message || e);
}
  await mountHPBars();
  await ensureState();
  await reconcileStateWithItems();
  await enforceUniqueNamePrefixes();
  await renderAll();

  if (IS_GM) {
    try {
      const { syncHPBarNow } = await import("./hpbar-items.js");
      const entries = await readEntries();
      for (const e of entries) {
        syncHPBarNow(e.id, e.hp ?? 0, e.hpMax ?? 0);
      }
    } catch (err) {
      console.warn("[hpbar] boot sync error", err);
    }
  }
});

  let __lastActiveId = null;

OBR.scene.onMetadataChange(async (meta) => {
  await renderAll(); // ridisegna UI
    const st = meta?.[STATE_KEY];
    if (!st || !Array.isArray(st.order) || st.order.length === 0) return;
    const activeId = st.order[st.current];
    if (!activeId || activeId === __lastActiveId) return;
    __lastActiveId = activeId;
    await selectAndFocus(activeId);
  try {
  const entriesNow = await readEntries();
  await __applyAutoCollapse(entriesNow, st); // espandi il gruppo dell'attivo, collassa gli altri
  await renderAll();                         // ridisegna subito per evitare flicker
} catch (e) {
  console.warn("[initiative] auto-collapse on turn change:", e?.message || e);
}
});

  OBR.scene.items.onChange(async (changes = []) => {
    await reconcileStateWithItems();
    await enforceUniqueNamePrefixes();
    await renderAll();
  });

    btnPrev.addEventListener("click", async () => {
    const st = await getSceneState();
    if (!st || !st.order || st.order.length === 0) return;
    const len = st.order.length;

    const prevIdx = (st.current - 1 + len) % len;
    const wrapped = prevIdx === (len - 1);                      // ritorno a fine
    const nextRound = Math.max(1, (st.round || 1) - (wrapped ? 1 : 0));

    const next = { ...st, current: prevIdx, round: nextRound };
    await setSceneState(next);

    try {
    const entriesNow = await readEntries();
    await __applyAutoCollapse(entriesNow, next);
    } catch {}

    const activeId = next.order[next.current];
    if (activeId) await selectAndFocus(activeId);

    handoffFocusToCanvas?.();
    armArrowProxy?.();
  });

  btnNext.addEventListener("click", async () => {
    const st = await getSceneState();
    if (!st || !st.order || st.order.length === 0) return;
    const len = st.order.length;

    const nextIdx = (st.current + 1) % len;
    const wrapped = nextIdx === 0;                              // ritorno a inizio
    const nextRound = Math.max(1, (st.round || 1) + (wrapped ? 1 : 0));

    const next = { ...st, current: nextIdx, round: nextRound };
    await setSceneState(next);

    try {
    const entriesNow = await readEntries();
    await __applyAutoCollapse(entriesNow, next);
    } catch {}


    const activeId = next.order[next.current];
    if (activeId) await selectAndFocus(activeId);

    handoffFocusToCanvas?.();
    armArrowProxy?.();
  });

}