import OBR, { buildLabel } from "@owlbear-rodeo/sdk";
import { ID } from "./contextMenu";
import { ACTIVE_TURN_LABEL_META, isOnlyActiveTurnLabelChange } from "./constants.js";
import { mountHPBars, syncHPBarNow, syncHPTextNow } from "./hpbar-items.js";
import { mountConcentrationWatcher } from "./spells-tag.js";
import { applyHPMemoryToSceneForMissingHP, saveHPToMemoryByItemId, scheduleHPMemoryAutofill } from "./hpMemory.js";
import { buildConditionChips, refreshConditionLabels, adjustConditionDurationsForItems, advanceConditionTurnBoundariesForItems, CONDITION_LIST as EFFECT_CONDITIONS, formatConditionName, addOrUpdateConditionForItems, removeConditionFromItems, getConditionInstances } from "./conditions";
import { buildSpellChips, tickSpellsForItems, getSpellsFromItem, adjustSpellsForItems } from "./spells.js";
import { withItemMetaHistory, mountMovementHistoryWatcher } from "./history.js";

  // Configurazione condizioni per tag card
export const CONDITIONS = [
  "Accecato", "Affascinato", "Afferrato", "Assordato", "Avvelenato",
  "Incapacitato", "Invisibile", "Paralizzato", "Pietrificato", "Privo di sensi",
  "Prono", "Spaventato", "Stordito", "Trattenuto", "Indebolimento", "Concentrazione", "Ira"
];
// — Dock condizioni (chip) sulla card
const COND_DOCK_CFG = {
  top: -6,                 // px dall’alto dell’header
  rightFromBadge: 0,   // ← non servirà più
  leftFromContent: -5
};
  const STATE_KEY = `${ID}/state`;
  const META_KEY  = `${ID}/meta`;
  const CONC_META_KEY = `${ID}/concentration`; // { [spellKey]: { targets: [...] } }

  // —— CHIP STYLE PRESET (condizioni + spell)
const CHIP_FONT_PX   = 11;  // dimensione testo dentro la pill
const CHIP_HEIGHT_PX = 18;  // altezza visiva della pill
const CHIP_PAD_X_PX  = 6;   // padding orizzontale
const CHIP_RADIUS_PX = 9;   // bordo arrotondato (mezzo dell'altezza)
const CHIP_GAP_PX    = 2;   // distanza tra pill adiacenti

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
    // opzionali:
    // boxShadow: "inset 0 -1px 0 rgba(255,255,255,.12)"
  });
}

// Normalizza il nome spell a chiave
function __spellKey(name) {
  return String(name || "").trim().toLowerCase();
}
// Hash → hue (0..359) e palette leggibile
function __hueFromKey(key) {
  let h = 0;
  for (let i = 0; i < String(key).length; i++) h = (h * 31 + String(key).charCodeAt(i)) >>> 0;
  return h % 360;
}
function __spellColor(key) {
  const hue = __hueFromKey(String(key || ""));
  return {
    bgSoft:  `hsla(${hue}, 70%, 45%, .28)`,
    border:  `hsla(${hue}, 80%, 55%, .55)`,
    solid:   `hsl(${hue}, 70%, 45%)`,
  };
}
  
  const FOCUS_MIN_PAD_PX = 64;    // prima era 64: spazio minimo extra attorno al token
  const FOCUS_ZOOM_BIAS  = 10;  // 1 = fit preciso; >1 = zoom più lontano
  const ARROW_PROXY_WINDOW_MS = 2000
  // ===== LAIR ACTIONS =====
  const LAIR_ID          = "__LAIR__";
  const LAIR_NAME        = "Azioni di Tana";
  const LAIR_INITIATIVE  = 20;
  const LAIR_PORTRAIT = "/lair.png";

  const BADGE_SIZE  = 28; // diametro del badge iniziativa (px)
  const BADGE_RIGHT = 12; // distanza del badge dal bordo destro (px)

  // --- Active Turn Label (ancorata al token attivo)
  const ACTIVE_LABEL_META = ACTIVE_TURN_LABEL_META;
  const ACTIVE_LABEL_TEXT_FMT = (nameBase) => `Turno di ${nameBase}`;
  // offset verticale in celle (negativo = sopra il token)
  const ACTIVE_LABEL_OFFSET_Y_CELLS = -0.6;

  // === EPIC ACTIONS (voci virtuali in lista) ===
  const EPIC_ACT_PREFIX = "__EPIC__";

  // --- Fallback chips condizioni (se conditions.js lancia)
function __chip(label, compact=true) {
  const s = document.createElement("span");
  s.textContent = String(label);
  Object.assign(s.style, {
    fontSize: compact ? "10px" : "11px",
    fontWeight: "800",
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

  // se custom è oggetto (vecchi dump), usa le chiavi truthy
  if (!Array.isArray(custom) && custom && typeof custom === "object") {
    custom = Object.keys(custom).filter(k => !!custom[k]);
  }

  const instances = getConditionInstances(cond);
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
  // standard (rispetta l’ordine/whitelist di cap)
  for (const name of cap) {
    if (flags[name]) frag.appendChild(__chip(name, compact));
  }
  // eventuali flag “fuori cap”
  for (const k of Object.keys(flags)) {
    if (!cap.includes(k) && flags[k]) frag.appendChild(__chip(k, compact));
  }
  // custom
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
  // fallback nostro (silenzioso)
  return __buildChipsSimple(cond, opts);
}

let __activeTurnLabel = null;
let __activeTurnLabelInitialized = false;
let __activeTurnLabelDpi = null;
let __activeLabelEntriesById = new Map();
let __latestInitiativeState = null;
let __activeTurnLabelDesired = null;
let __activeTurnLabelPumpRunning = false;
let __navigationDesiredState = null;
let __navigationPumpRunning = false;
let __navigationFlushTimer = null;
let __navigationDesiredAt = 0;
let __navigationRevision = 0;
let __lastNavigationAt = 0;
let __lastConditionTurnState = null;
let __conditionNavigationHint = null;
let __conditionTurnQueue = Promise.resolve();
const NAVIGATION_STALE_GRACE_MS = 500;
const NAVIGATION_WRITE_SETTLE_MS = 60;


  // Scansione e deduplicazione una tantum all'avvio.
async function __cleanupActiveTurnLabels() {
  if (!IS_GM) {
    __activeTurnLabel = null;
    __activeTurnLabelInitialized = true;
    return null;
  }

  // Elimina le label locali create dalle build precedenti.
  try {
    const locals = await OBR.scene.local.getItems(
      (it) => it.type === "LABEL" && it.metadata?.[ACTIVE_LABEL_META]
    );
    if (locals.length) await OBR.scene.local.deleteItems(locals.map((it) => it.id));
  } catch (e) {
    console.warn("[activeLabel] local cleanup failed:", e?.message || e);
  }

  let globals = [];
  try {
    globals = await OBR.scene.items.getItems(
      (it) => it.type === "LABEL" && it.metadata?.[ACTIVE_LABEL_META]
    );
    if (globals.length > 1) {
      await OBR.scene.items.deleteItems(globals.slice(1).map((it) => it.id));
      globals = globals.slice(0, 1);
    }
  } catch (e) {
    console.warn("[activeLabel] global init failed:", e?.message || e);
  }

  __activeTurnLabel = globals[0] || null;
  __activeTurnLabelInitialized = true;
  return __activeTurnLabel;
}
  function isEpicActionId(id) {
  return typeof id === "string" && id.startsWith(EPIC_ACT_PREFIX);
}

// Copia - Aggiunta (subito dopo isEpicActionId)
function __safeConditions(c) {
  const src = (c && typeof c === "object") ? c : {};
  const flags = (src.flags && typeof src.flags === "object") ? src.flags : {};
  const custom = Array.isArray(src.custom) ? src.custom : [];
  const instances = Array.isArray(src.instances) ? src.instances : [];
  return { ...src, flags, custom, instances };
}
// Parser sicuro del "base name" senza i prefissi "(n) "
function __safeBaseName(name) {
  try {
    if (typeof _parseIndexedName === "function") {
      return _parseIndexedName(name).base;
    }
  } catch {}
  const raw = String(name || "Unnamed").trim();
  return raw.replace(/^(\(\d+\)\s*)+/, "").trim();
}

// Crea una voce virtuale "Epic Action" del boss dopo un certo PG
function makeEpicActionEntry(bossEntry, pcEntry) {
  // id unico stabile (non finisce nei metadata della scena)
  const id = `${EPIC_ACT_PREFIX}::${bossEntry.id}::after::${pcEntry.id}`;
  return {
    id,
    // stesso nome del token (boss)
    name: bossEntry.name,
    initiative: pcEntry.initiative,    // badge informativo; non editabile
    portrait: bossEntry.portrait || null,
    attitude: bossEntry.attitude || "enemy",
    hp: null,
    hpMax: null,
    isEpicAction: true,
    epicBossId: bossEntry.id,
    epicAfterPCId: pcEntry.id,
    conditions: __safeConditions(null),
  };
}

  let __lastRenderedActiveId = null;
  let __prevActiveId = null;
  let __lastRoundSeen = null;
  let __scrollActiveOnNextRender = false;

  function isLairId(id) { return id === LAIR_ID; }
  function makeLairEntry() {
  return {
    id: LAIR_ID,
    name: LAIR_NAME,
    initiative: LAIR_INITIATIVE,
    portrait: LAIR_PORTRAIT,
    attitude: "enemy",
    hp: null,
    hpMax: null,
    legendary: { max: 0, current: 0 },
    conditions: __safeConditions(null),
  };
}

  const LEG_BOSS_CFG = {
  scale: 1,          // quanto ingrandire la card
  extraHeight: 24,       // px in più all’altezza base
  zIndex: 6,            // per sovrapporsi leggermente alle altre
  shadow: "0 0 10px rgba(255, 0, 0, 0.8)" // alone leggero dorato
};

// --- ZOOM CONFIG GLOBALE ---
const ZOOM_CFG = {
  scale: 1.1,                                     // +6% elegante
  dur:   500,                                      // ms
  ease:  "cubic-bezier(.16,.84,.22,1)"             // easing morbido
};

function __applyZoomTransition(el) {
  const dur = ZOOM_CFG.dur;
  // NB: box-shadow un filo più corto, height come prima
  el.style.transition = `transform ${dur}ms ${ZOOM_CFG.ease}, box-shadow ${Math.max(120, dur - 40)}ms ease, height .15s ease`;
}

// Applica una transform senza animazione, poi ripristina la transition desiderata
function __instaTransform(el, value) {
  const prev = el.style.transition;
  el.style.transition = "none";
  el.style.transform = value;
  // commit layout per evitare transizioni fantasma
  void el.offsetHeight; // eslint-disable-line no-unused-expressions
  el.style.transition = prev || "";
  if (!prev) __applyZoomTransition(el);
}

  // ===== Legendary UI (2 gruppi indipendenti) =====
  const LEG_PIPS_CFG = {
  // Posizione del GRUPPO PIPS rispetto all'header
  top: 45,                    // px dall'alto dell'header
  right: null,               // se null, usa rightFromBadge; altrimenti override assoluto in px
  rightFromBadge: 130,        // distanza dal bordo destro del badge iniziativa
  // Parametri interni del gruppo pips
  gap: 4,                    // tra i singoli pips
  paddingX: 0,
  paddingY: 0,
  size: 8,                  // lato del diamante/circolo
  diamond: true              // true=♦, false=●
};

  const LEG_CTRL_CFG = {
  // Posizione del GRUPPO CONTROLLI (+/-) rispetto all'header
  top: -8,                   // px dall'alto dell'header (indipendente dai pips)
  right: null,               // se null, usa rightFromBadge; altrimenti override assoluto in px
  rightFromBadge: 179,        // distanza dal bordo destro del badge iniziativa
  // Parametri interni del gruppo controlli
  gap: 2,                    // tra i due bottoni
  paddingX: 0,
  paddingY: 0,
  btnSize: 20,               // lato dei bottoni
  btnRadius: 16,             // raggio dei bottoni
  // Stile pill del gruppo controlli
  //dockBg: "rgba(0,0,0,.22)",
  //dockBorder: "1px solid rgba(255,255,255,.18)",
  //dockRadius: 12,
};

// --- Paragon controls: stessa posizione/stile dei Legendary (+/-)
const PAR_CTRL_CFG = {
  top: -8,
  right: null,            // se null → usa rightFromBadge come i Legendary
  rightFromBadge: 149,    // identico ai Legendary; se vuoi più vicino al badge, riduci
  gap: 2,
  paddingX: 0,
  paddingY: 0,
  btnSize: 20,
  btnRadius: 32,
  // dockBg: "rgba(0,0,0,.22)",
  // dockBorder: "1px solid rgba(255,255,255,.18)",
  // dockRadius: 12,
};

// Se ti serve riservare più spazio a destra del testo per i due gruppi:
  const HEADER_RIGHT_PAD_EXTRA = 120; // px extra oltre al badge

// --- EPIC / EPIC ACTION tag config (solo controlli via JS) ---
const EPIC_TAG_CFG = {
  posBoss:   { top: -6, right: null, rightFromBadge: 146, gap: 6, reserve: 120 },
  posAction: { top: -6, right: null, rightFromBadge: 146, gap: 6, reserve: 120 },

  // Stile delle pill
  epic: {
    label: "Boss Epico",
    fontSize: 12, fontWeight: 700, padX: 6, padY: 2, radius: 999,
    bg: "rgba(255, 0, 0, 1)", color: "#fff",
    border: "1px solid rgba(0, 0, 0, 1)", letterSpacing: .2
  },
  action: {
    label: "Azione Epica",
    fontSize: 9, fontWeight: 500, padX: 6, padY: 2, radius: 999,
    bg: "rgba(255, 0, 0, 1)", color: "#fff",
    border: "1px solid rgba(6, 0, 0, 1)", letterSpacing: .2
  }
};

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
    mountConcentrationWatcher();

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
  padding: "8px 32px",
  fontSize: "14px",
  fontWeight: "600",
  lineHeight: "1",
  color: "#fff",
  background: "rgba(0, 0, 0, 0.33)",
  border: "1px solid rgba(255,255,255,.18)",
  borderRadius: "32px",
  boxShadow: "0 2px 6px rgba(0,0,0,.45)",
  userSelect: "none",
  display: "inline-flex",
  alignItems: "center",
  gap: "8px"
});

// ⬇️ NUOVO: label separato così non perdiamo il bottone ai render
const roundLabel = document.createElement("span");
roundLabel.id = "tbp-round-label";
roundPill.appendChild(roundLabel);

const roundSep = document.createElement("span");
roundSep.textContent = "•";
Object.assign(roundSep.style, { opacity: ".6" });

const turnCounter = document.createElement("span");
turnCounter.id = "tbp-turn-counter";
Object.assign(turnCounter.style, {
  fontVariantNumeric: "tabular-nums",
  opacity: ".9"
});

// di default lo nascondo finché non ho dati
roundSep.style.display = "none";
turnCounter.style.display = "none";

roundPill.append(roundSep, turnCounter);

// ⬇️ NUOVO: bottone reset turno (solo GM)
function makeRoundResetBtn() {
  const b = document.createElement("button");
  b.type = "button";
  b.dataset.resetRound = "1";
  b.title = "Resetta il turno a 1 (solo GM)";
  b.textContent = "↺";
  Object.assign(b.style, {
    width: "22px",
    height: "22px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid rgba(255,255,255,.18)",
    background: "rgba(0,0,0,.45)",
    color: "#fff",
    fontSize: "13px",
    fontWeight: "800",
    lineHeight: "1",
    borderRadius: "999px",
    cursor: "pointer",
    boxShadow: "0 1px 3px rgba(0,0,0,.35)",
    padding: "0",
  });
  b.addEventListener("click", async (e) => {
    e.stopPropagation();
    try {
      await setSceneState(prev => ({ ...(prev || {}), round: 1 }));
      await renderAll();
    } catch (err) {
      console.warn("[round-reset] errore reset turno:", err?.message || err);
    }
  });
  return b;
}

function makeClearInitiativeBtn() {
  const b = document.createElement("button");
  b.type = "button";
  b.dataset.clearInitiative = "1";
  b.title = "Rimuovi tutte le card dall'iniziativa (solo GM)";
  b.textContent = "×";
  Object.assign(b.style, {
    width: "22px",
    height: "22px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid rgba(248,113,113,.55)",
    background: "rgba(127,29,29,.55)",
    color: "#fff",
    fontSize: "16px",
    fontWeight: "800",
    lineHeight: "1",
    borderRadius: "999px",
    cursor: "pointer",
    boxShadow: "0 1px 3px rgba(0,0,0,.35)",
    padding: "0",
  });
  b.addEventListener("click", async (e) => {
    e.stopPropagation();
    b.disabled = true;
    try {
      const items = await OBR.scene.items.getItems(
        it => it.metadata?.[META_KEY]?.inInitiative === true
      );
      const ids = items.map(it => it.id);
      if (ids.length) {
        await OBR.scene.items.updateItems(ids, (drafts) => {
          for (const it of drafts) {
            const me = { ...(it.metadata?.[META_KEY] || {}) };
            delete me.inInitiative;
            it.metadata = { ...(it.metadata || {}), [META_KEY]: me };
          }
        });
      }
      await resetTrackerState();
      await renderAll();
    } catch (err) {
      console.warn("[initiative-clear] errore svuotamento:", err?.message || err);
    } finally {
      b.disabled = false;
    }
  });
  return b;
}

function makeHistoryBtn() {
  const b = document.createElement("button");
  b.type = "button";
  b.dataset.history = "1";
  b.title = "Cronologia e Undo (solo GM)";
  b.textContent = "\u21B6";
  Object.assign(b.style, {
    width: "22px",
    height: "22px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid rgba(255,255,255,.18)",
    background: "rgba(0,0,0,.45)",
    color: "#fff",
    fontSize: "14px",
    fontWeight: "800",
    lineHeight: "1",
    borderRadius: "999px",
    cursor: "pointer",
    boxShadow: "0 1px 3px rgba(0,0,0,.35)",
    padding: "0",
  });
  b.addEventListener("click", async (e) => {
    e.stopPropagation();
    try {
      await OBR.modal.open({
        id: `${ID}/history-modal`,
        url: "/history-modal.html",
        width: 480,
        height: 460,
      });
    } catch (err) {
      console.warn("[history] modal open error:", err?.message || err);
    }
  });
  return b;
}

// ROW in alto: Turno + Toggle Tana (solo GM)
const topRow = document.createElement("div");
Object.assign(topRow.style, {
  alignSelf: "center",
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
  flexWrap: "wrap",     // se si stringe, va a capo con grazia
});
topRow.appendChild(roundPill);

// Toggle dello zoom automatico. Il default resta attivo per compatibilità
// con le scene che non hanno ancora salvato questa preferenza.
const zoomToggleWrap = document.createElement("label");
Object.assign(zoomToggleWrap.style, {
  alignSelf: "center",
  display: "flex",
  alignItems: "center",
  gap: "6px",
  padding: "2px 8px",
  background: "rgba(0,0,0,.28)",
  border: "1px solid rgba(255,255,255,.18)",
  borderRadius: "999px",
  boxShadow: "0 1px 4px rgba(0,0,0,.35)",
  userSelect: "none",
  cursor: "pointer",
});

const zoomChk = document.createElement("input");
zoomChk.type = "checkbox";
zoomChk.checked = true;
zoomChk.style.transform = "scale(1.1)";
zoomChk.style.cursor = "pointer";
zoomChk.title = "Centra automaticamente la scena sul token attivo";

const zoomLbl = document.createElement("span");
zoomLbl.textContent = "Zoom";
Object.assign(zoomLbl.style, {
  fontSize: "12px",
  fontWeight: "700",
  color: "#fff",
});

zoomToggleWrap.append(zoomChk, zoomLbl);
topRow.appendChild(zoomToggleWrap);

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

track.addEventListener("dragstart", (ev) => {
  const card = ev.target.closest('[data-item-id]');
  if (card.dataset.isEpic === "1") { ev.preventDefault(); return; }
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
// --- Toggle Lair (Azioni di Tana a iniziativa 20) ---
const lairToggleWrap = document.createElement("label");
Object.assign(lairToggleWrap.style, {
  alignSelf: "center",
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "2px 8px",
  background: "rgba(0,0,0,.28)",
  border: "1px solid rgba(255,255,255,.18)",
  borderRadius: "999px",
  boxShadow: "0 1px 4px rgba(0,0,0,.35)",
  userSelect: "none",
  cursor: "pointer",
});

const lairChk = document.createElement("input");
lairChk.type = "checkbox";
lairChk.style.transform = "scale(1.1)";
lairChk.style.cursor = "pointer";

const lairLbl = document.createElement("span");
lairLbl.textContent = "Tana";
Object.assign(lairLbl.style, { fontSize: "12px", fontWeight: "700", color: "#fff" });

lairToggleWrap.append(lairChk, lairLbl);

// inizializza lo stato visivo dal metadata
(async () => {
  const st = await getSceneState();
  lairChk.checked = !!st?.lairEnabled;
})();

lairChk.addEventListener("change", async (e) => {
  const enabled = !!e.target.checked;
  await setSceneState(prev => ({ ...(prev || {}), lairEnabled: enabled }));
  await reconcileStateWithItems();
  await renderAll();
});

zoomChk.addEventListener("change", async (e) => {
  const enabled = !!e.target.checked;
  const next = {
    ...(__latestInitiativeState || {}),
    ui: {
      ...(__latestInitiativeState?.ui || {}),
      autoFocus: enabled,
    },
  };
  __latestInitiativeState = next;
  await setSceneState(prev => ({
    ...(prev || {}),
    ui: { ...(prev?.ui || {}), autoFocus: enabled },
  }));
});

// Inserisci il toggle tra Turno e Lista
col.append(btnPrev, topRow, trackWrap, btnNext);

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

// HP Memory: riempi HP mancanti dei token da memoria (all'avvio)
(async () => {
  try {
    await applyHPMemoryToSceneForMissingHP();
  } catch (err) {
    console.warn("[hpMemory] apply on mount:", err?.message || err);
  }
})();


// ——— HP Memory: riempi HP mancanti dei PG da memoria stanza
(async () => {
  try {
    await applyHPMemoryToSceneForMissingHP();
  } catch (err) {
    console.warn("[hpMemory] apply on mount:", err?.message || err);
  }
})();

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
  // Solo il GM forza la selezione locale del token
  if (!IS_GM || !itemId) return;
  try {
    await OBR.player.select([itemId], replace);
  } catch {}
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

function isAutoFocusEnabled(state) {
  return state?.ui?.autoFocus !== false;
}

async function selectAndFocus(itemId, autoFocus = true) {
  await selectInScene(itemId, true);
  if (autoFocus) await centerOnItem(itemId);
}

let __selectFocusDesired = null;
let __selectFocusPumpRunning = false;

function queueSelectAndFocus(itemId, autoFocus = true) {
  const anchorId = __resolveAnchorForActive(itemId);
  if (!anchorId) return;
  __selectFocusDesired = {
    itemId: anchorId,
    autoFocus,
    revision: __navigationRevision,
  };
  if (__selectFocusPumpRunning) return;

  __selectFocusPumpRunning = true;
  void (async () => {
    try {
      while (__selectFocusDesired) {
        const desired = __selectFocusDesired;
        __selectFocusDesired = null;
        if (desired.revision !== __navigationRevision) continue;

        await selectInScene(desired.itemId, true);
        if (
          desired.autoFocus &&
          desired.revision === __navigationRevision &&
          !__selectFocusDesired
        ) {
          await centerOnItem(desired.itemId);
        }
      }
    } catch (err) {
      console.warn("[initiative] select/focus queue error:", err?.message || err);
    } finally {
      __selectFocusPumpRunning = false;
      if (__selectFocusDesired) {
        const desired = __selectFocusDesired;
        __selectFocusDesired = null;
        queueSelectAndFocus(desired.itemId, desired.autoFocus);
      }
    }
  })();
}

// Restituisce l'ID del token reale a cui ancorare la label (null se virtuale)
function __resolveAnchorForActive(activeId) {
  if (!activeId) return null;
  if (isEpicActionId && isEpicActionId(activeId)) return null; // voce virtuale
  if (isLairId && isLairId(activeId)) return null;             // Tana è virtuale
  const { baseId } = splitParagonId(activeId);                  // paragon -> base
  return baseId || activeId;
}

// Trova la label attiva esistente (identificata dal nostro metadata)
async function __findExistingActiveLabel() {
  if (__activeTurnLabelInitialized) return __activeTurnLabel;
  return await __cleanupActiveTurnLabels();
}

let __mutatingActiveLabel = 0;
let __activeTurnLabelRevision = 0;
let __activeTurnLabelLatestKey = null;

function __setActiveTurnLabelText(item, text) {
  const prevStyle =
    (item.text && typeof item.text === "object" && item.text.style) ||
    { fillColor: "#ffffff", strokeColor: "rgba(0,0,0,.85)", strokeWidth: 2 };
  item.text = item.text && typeof item.text === "object" ? item.text : {};
  item.text.type = "PLAIN";
  item.text.plainText = text;
  item.text.style = { ...prevStyle };
}

async function upsertActiveTurnLabel(anchorId, displayText, anchorSnapshot = null, revision = __activeTurnLabelRevision) {
  const textStr = String(displayText ?? "");
  const existing = await __findExistingActiveLabel();

  if (!anchorId) {
    if (existing && existing.visible !== false) {
      await OBR.scene.items.updateItems([existing.id], (list) => {
        const item = list[0];
        if (!item) return;
        item.visible = false;
        item.disableAttachmentBehavior = (item.disableAttachmentBehavior || [])
          .filter((behavior) => behavior !== "POSITION");
      });
      existing.visible = false;
      existing.disableAttachmentBehavior = (existing.disableAttachmentBehavior || [])
        .filter((behavior) => behavior !== "POSITION");
    }
    return;
  }

  const dpi = __activeTurnLabelDpi ?? await OBR.scene.grid.getDpi();
  __activeTurnLabelDpi = dpi;
  const anchor = anchorSnapshot || (await OBR.scene.items.getItems([anchorId]))[0];
  if (!anchor) {
    __activeTurnLabelLatestKey = null;
    return;
  }

  const pos = {
    x: anchor.position.x,
    y: anchor.position.y + ACTIVE_LABEL_OFFSET_Y_CELLS * dpi,
  };

  if (!existing) {
    if (revision !== __activeTurnLabelRevision) return;
    __mutatingActiveLabel++;
    try {
      const item = buildLabel()
        .plainText(textStr)
        .fillColor("#ffffffff")
        .strokeColor("rgba(0,0,0,.85)")
        .strokeWidth(2)
        .layer("TEXT")
        .position(pos)
        .attachedTo(anchorId)
        .style({
          backgroundColor: "#ff0000a8",
          backgroundOpacity: 0.75,
          cornerRadius: 14,
          pointerDirection: "DOWN",
          pointerWidth: 16,
          pointerHeight: 12,
        })
        .metadata({ [ACTIVE_LABEL_META]: { enabled: true } })
        .name("Turno attuale")
        .build();
      await OBR.scene.items.addItems([item]);
      __activeTurnLabel = item;
    } finally {
      __mutatingActiveLabel--;
    }
    return;
  }

  if (revision !== __activeTurnLabelRevision) return;

  __mutatingActiveLabel++;
  try {
    // Attachment e posizione cambiano insieme, ricostruendo il legame col token.
    await OBR.scene.items.updateItems([existing.id], (list) => {
      const item = list[0];
      if (!item) return;
      item.attachedTo = anchorId;
      item.position = pos;
      item.visible = true;
      item.layer = "TEXT";
      __setActiveTurnLabelText(item, textStr);
      item.disableAttachmentBehavior = (item.disableAttachmentBehavior || [])
        .filter((behavior) => behavior !== "POSITION");
    });
    existing.attachedTo = anchorId;
    existing.position = pos;
    existing.visible = true;
    existing.disableAttachmentBehavior = (existing.disableAttachmentBehavior || [])
      .filter((behavior) => behavior !== "POSITION");
    __setActiveTurnLabelText(existing, textStr);
    __activeTurnLabel = existing;
  } finally {
    __mutatingActiveLabel--;
  }
}
async function __pumpActiveTurnLabel() {
  if (__activeTurnLabelPumpRunning) return;
  __activeTurnLabelPumpRunning = true;
  try {
    while (__activeTurnLabelDesired) {
      const desired = __activeTurnLabelDesired;
      __activeTurnLabelDesired = null;
      if (desired.revision !== __activeTurnLabelRevision) continue;
      await upsertActiveTurnLabel(
        desired.anchorId,
        desired.text,
        desired.anchor,
        desired.revision
      );
    }
  } catch (err) {
    __activeTurnLabelLatestKey = null;
    console.warn("[active-label] update queue error:", err?.message || err);
  } finally {
    __activeTurnLabelPumpRunning = false;
    if (__activeTurnLabelDesired) void __pumpActiveTurnLabel();
  }
}

function syncActiveTurnLabel(activeId) {
  if (!IS_GM) return;
  const anchorId = __resolveAnchorForActive(activeId);
  const activeEntry =
    __activeLabelEntriesById.get(activeId) ||
    __activeLabelEntriesById.get(anchorId);
  const labelName = activeEntry?.name
    ? __safeBaseName(activeEntry.name)
    : "Turno";
  const text = ACTIVE_LABEL_TEXT_FMT(labelName);
  const key = `${anchorId || ""}\u0000${text}`;
  if (__activeTurnLabelLatestKey === key) return;

  __activeTurnLabelLatestKey = key;
  const revision = ++__activeTurnLabelRevision;
  __activeTurnLabelDesired = {
    anchorId,
    text,
    anchor: activeEntry?.position ? activeEntry : null,
    revision,
  };

  if (!__activeTurnLabelPumpRunning) void __pumpActiveTurnLabel();
}
function __scheduleNavigationStateFlush() {
  if (__navigationFlushTimer !== null) clearTimeout(__navigationFlushTimer);
  const elapsed = Date.now() - __navigationDesiredAt;
  const wait = Math.max(0, NAVIGATION_WRITE_SETTLE_MS - elapsed);
  __navigationFlushTimer = setTimeout(() => {
    __navigationFlushTimer = null;
    void __flushNavigationState();
  }, wait);
}

async function __flushNavigationState() {
  if (__navigationPumpRunning) return;
  const desired = __navigationDesiredState;
  if (!desired) return;

  __navigationDesiredState = null;
  __navigationPumpRunning = true;
  try {
    await setSceneState(desired);
    const desiredActiveId = __activeIdForState(desired);
    const latestActiveId = __activeIdForState(__latestInitiativeState);
    if (!__navigationDesiredState && desiredActiveId === latestActiveId) {
      syncActiveTurnLabel(desiredActiveId);
    }
  } catch (err) {
    console.warn("[initiative] navigation queue error:", err?.message || err);
  } finally {
    __navigationPumpRunning = false;
    if (__navigationDesiredState) __scheduleNavigationStateFlush();
  }
}

function queueNavigationState(next) {
  __navigationDesiredState = next;
  __navigationDesiredAt = Date.now();
  __scheduleNavigationStateFlush();
}
function __activeIdForState(state) {
  return Array.isArray(state?.order) ? state.order[state.current] : null;
}

function __conditionTurnStateSnapshot(state) {
  const order = Array.isArray(state?.order) ? state.order.slice() : [];
  if (!order.length) return null;
  const current = Math.max(0, Math.min(order.length - 1, Math.floor(Number(state?.current) || 0)));
  const round = Math.max(1, Math.floor(Number(state?.round) || 1));
  return { order, current, round };
}

function __conditionActorId(id) {
  if (!id || isLairId(id) || isEpicActionId(id)) return null;
  return splitParagonId(id).baseId || null;
}

function __forwardConditionTurnBoundaries(previous, next, directionHint = 0) {
  if (directionHint < 0 || !previous || !next) return [];
  if (previous.order.length !== next.order.length) return [];
  if (previous.order.some((id, index) => id !== next.order[index])) return [];

  const length = next.order.length;
  const previousOrdinal = ((previous.round - 1) * length) + previous.current;
  const nextOrdinal = ((next.round - 1) * length) + next.current;
  const distance = nextOrdinal - previousOrdinal;
  if (distance <= 0 || distance > 1000) return [];

  const boundaries = [];
  for (let ordinal = previousOrdinal; ordinal < nextOrdinal; ordinal += 1) {
    const endingActorId = __conditionActorId(next.order[ordinal % length]);
    const startingActorId = __conditionActorId(next.order[(ordinal + 1) % length]);
    if (endingActorId) boundaries.push({ phase: "end", actorId: endingActorId });
    if (startingActorId) boundaries.push({ phase: "start", actorId: startingActorId });
  }
  return boundaries;
}

function __conditionDirectionHintFor(state) {
  const hint = __conditionNavigationHint;
  if (!hint) return 0;
  const matches =
    hint.round === Math.max(1, Math.floor(Number(state?.round) || 1)) &&
    hint.current === Math.floor(Number(state?.current) || 0) &&
    hint.activeId === __activeIdForState(state);
  if (!matches) return 0;
  __conditionNavigationHint = null;
  return hint.direction;
}

function __isStaleNavigationState(state) {
  const inNavigationGrace =
    __lastNavigationAt > 0 &&
    (Date.now() - __lastNavigationAt) < NAVIGATION_STALE_GRACE_MS;
  if (!__navigationPumpRunning && !__navigationDesiredState && !inNavigationGrace) return false;
  const expectedId = __activeIdForState(__latestInitiativeState);
  const receivedId = __activeIdForState(state);
  return !!expectedId && receivedId !== expectedId;
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
  const wasSuspended = __suspendRenders;
  __suspendRenders = true;                // congela i render durante la chiusura
  try {
    const openInit = document.querySelector('[data-init-editing="1"]');
    if (openInit && typeof openInit.__commitFn === "function") {
      await openInit.__commitFn();
    }
    const openHP = document.querySelector('[data-hp-editing="1"]');
    if (openHP && typeof openHP.__commitFn === "function") {
      await openHP.__commitFn();
    }
  } catch (e) {
    console.warn("[edit] closeOpenEditors", e?.message || e);
  } finally {
    __suspendRenders = wasSuspended;      // ← ripristina come prima
  }
}

let __arrowProxyUntil = 0;
function armArrowProxy() {
  __arrowProxyUntil = Date.now() + ARROW_PROXY_WINDOW_MS;
}

let __ignoreDocClickUntil = 0;
function armDocClickIgnore(ms = 250) {
  __ignoreDocClickUntil = Date.now() + ms;
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
// ===== Leggi token tracciati (senza ordinare qui)
async function readEntries() {
  const items = await OBR.scene.items.getItems();
  const out = [];
  const seen = new Set();

  for (const it of items) {
    const meta = it.metadata && it.metadata[META_KEY];
    if (!meta) continue;

    // ⬅️⬅️ PATCH: mostra SOLO i token marcati esplicitamente in iniziativa
    if (meta.inInitiative !== true) continue;

    if (seen.has(it.id)) continue;
    seen.add(it.id);

    // Concentrazione: presente SOLO sul caster, come oggetto non vuoto
    const concObj = it.metadata?.[META_KEY]?.[CONC_META_KEY] || null;
    const isConcentrating =
      !!(concObj && typeof concObj === "object" && Object.keys(concObj).length > 0);

    out.push({
      conditions: __safeConditions(it.metadata?.[META_KEY]?.conditions),
      id: it.id,
      name: it.name || "Unnamed",
      position: it.position ? { x: it.position.x, y: it.position.y } : null,
      initiative: (meta.epic ? LAIR_INITIATIVE : (Number(meta.initiative) || 0)),
      portrait: getTokenImageUrl(it),
      attitude: meta.attitude || "ally",
      hp: (meta.hp ?? null),
      hpMax: (meta.hpMax ?? null),
      isEpic: !!meta.epic,
      paragonActions:
        (meta.paragon && Number(meta.paragon.actions) > 0)
          ? Math.max(1, Math.floor(Number(meta.paragon.actions)))
          : 0,
      legendary:
        (meta.legendary && typeof meta.legendary === "object")
          ? { max: Number(meta.legendary.max) || 0, current: Math.max(0, Number(meta.legendary.current) || 0) }
          : { max: 0, current: 0 },
      spells: getSpellsFromItem(it),

      // Flag concentrazione + chiave spell
      isConcentrating: !!(it.metadata?.[META_KEY]?.[CONC_META_KEY] &&
                          typeof it.metadata?.[META_KEY]?.[CONC_META_KEY] === "object" &&
                          Object.keys(it.metadata?.[META_KEY]?.[CONC_META_KEY]).length > 0),
      concSpellKey: (() => {
        const conc = it.metadata?.[META_KEY]?.[CONC_META_KEY];
        if (!conc || typeof conc !== "object") return null;
        const keys = Object.keys(conc);
        return keys.length ? keys[0] : null;   // per design: una sola concentrazione per caster
      })(),
    });
  }
  return out;
}

// Unisce entries reali + lair (se attiva a stato)
async function getEntriesWithLair(state) {
  const base = await readEntries();
  if (state?.lairEnabled) base.push(makeLairEntry());
  return base;
}

// id virtuali paragon: "<baseId>::p<k>" con k>=1
function isParagonVirtualId(id) {
  return typeof id === "string" && id.includes("::p");
}
function splitParagonId(id) {
  if (!isParagonVirtualId(id)) return { baseId: id, idx: 0 };
  const [baseId, tail] = id.split("::p");
  const idx = Math.max(0, parseInt(tail, 10) || 0);
  return { baseId, idx };
}

// Espande le entry in base a paragonActions, replicando le card.
// Per k=0 mantiene l'id originale; per k>=1 crea id virtuali "<id>::p<k>".
// La initiative per-card viene presa da state.paragonInits[baseId][k] se presente.
function expandParagonEntries(entries, state) {
  const out = [];
  const pInits = (state && state.paragonInits) || {};
  for (const e of entries) {
    const n = Math.max(0, Math.floor(Number(e.paragonActions) || 0));
    if (n <= 1) { out.push(e); continue; }

    // clona n volte; k=0 conserva id base
    for (let k = 0; k < n; k++) {
      const clone = { ...e };
      if (k > 0) clone.id = `${e.id}::p${k}`;

      // iniziativa per-card
      const arr = Array.isArray(pInits[e.id]) ? pInits[e.id] : [];
      const ini = Number.isFinite(arr[k]) ? Math.floor(arr[k]) : e.initiative;
      clone.initiative = ini;

      // bookkeeping (utile in UI)
      clone.__paragonIndex = k;
      clone.__paragonBaseId = e.id;

      out.push(clone);
    }
  }
  return out;
}

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
  // Azione Epica: mai raggruppare
  if (e.isEpicAction) return `EPICACTION${__GROUP_SEP}${e.id}`;

  // Paragon (quando esistono le card replicate): mai raggruppare
  // (include anche la card base k=0 quando Paragon è attivo)
  if (e.__paragonIndex !== undefined) return `PARAGON${__GROUP_SEP}${e.id}`;

  // Resto: raggruppo per attitude + base-name
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

// --- Grouping per propagazione: identico alle tab visive ---
function _groupKeyFromEntry(e) {
  const { base } = _parseIndexedName(e.name || "");
  return `${e.attitude || "ally"}${__GROUP_SEP}${base}`;
}

async function _getGroupForItemId(itemId) {
  const entries = await readEntries();
  const me = entries.find(x => x.id === itemId);
  if (!me) return { key: null, members: [], me: null, entries };
  const key = _groupKeyFromEntry(me);
  const members = entries.filter(x => _groupKeyFromEntry(x) === key).map(x => x.id);
  return { key, members, me, entries };
}
// Raccoglie i group-key (attitude + base-name) attualmente presenti in scena
async function __currentSeedGroupKeySet() {
  const entries = await readEntries(); // solo token reali
  const keys = new Set();
  for (const e of entries) {
    const k = _groupKeyFromEntry(e);
    if (k) keys.add(k);
  }
  return keys;
}

// Rimuove da state.seededGroups le chiavi che non hanno più membri in scena
async function __gcSeededGroups() {
  const st = await getSceneState();
  const prev = (st && st.seededGroups) || {};
  const present = await __currentSeedGroupKeySet();

  let changed = false;
  const next = { ...prev };
  for (const k of Object.keys(prev)) {
    if (!present.has(k)) { // gruppo scomparso → sblocca autofill futuro
      delete next[k];
      changed = true;
    }
  }
  if (changed) {
    await setSceneState(p => ({ ...(p || {}), seededGroups: next }));
  }
}

// Backfill di iniziativa per i gruppi già seedati quando compaiono nuovi membri
async function __backfillInitiativeForSeededGroups() {
  const st = await getSceneState();
  const seeded = st?.seededGroups || {};
  const keys = Object.keys(seeded).filter(k => seeded[k]?.initiative);
  if (!keys.length) return;

  // prendi tutti i token "tracciati" (con il nostro META_KEY)
  const all = await OBR.scene.items.getItems();
  const tracked = all.filter(it => it?.metadata?.[META_KEY]);

  // Raggruppa con la stessa chiave usata dalle tab del tracker.
  const byKey = new Map();
  for (const it of tracked) {
    const meta = it.metadata?.[META_KEY] || {};
    const entryLike = { name: it.name || "", attitude: meta.attitude || "ally" };
    const key = _groupKeyFromEntry(entryLike);
    if (!keys.includes(key)) continue;              // solo gruppi già seedati per iniziativa
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(it);
  }

  for (const k of keys) {
    const items = byKey.get(k) || [];
    if (items.length <= 1) continue;

    // scegli un valore "seed" dal primo membro con initTouched=true (fallback: qualunque >0)
    let seed = null;
    for (const it of items) {
      const m = it.metadata?.[META_KEY] || {};
      if (m.epic) continue;
      if (m.initTouched === true && Number.isFinite(m.initiative) && Number(m.initiative) !== 0) {
        seed = Math.floor(Number(m.initiative)); break;
      }
    }
    if (seed === null) {
      for (const it of items) {
        const m = it.metadata?.[META_KEY] || {};
        if (m.epic) continue;
        if (Number.isFinite(m.initiative) && Number(m.initiative) !== 0) {
          seed = Math.floor(Number(m.initiative)); break;
        }
      }
    }
    if (!Number.isFinite(seed)) continue;

    // target = nuovi membri non-epic con iniziativa mancante/zero e non "toccati"
    const targets = items
      .filter(it => {
        const m = it.metadata?.[META_KEY] || {};
        if (m.epic) return false;
        const touched = m.initTouched === true;
        const ini = m.initiative;
        const hasIni = ini !== undefined && ini !== null;
        return !touched && (!hasIni || Number(ini) === 0);
      })
      .map(it => it.id);

    if (!targets.length) continue;

    await OBR.scene.items.updateItems(targets, (list) => {
      for (const it of list) {
        const prev = it.metadata?.[META_KEY] || {};
        it.metadata = { ...(it.metadata || {}), [META_KEY]: { ...prev, initiative: seed, initTouched: true } };
      }
    });
  }
}

// Propagazione iniziativa al gruppo (prima volta + backfill per nuovi membri)
async function trySeedGroupInitiative(itemId, value) {
  const st = await getSceneState();
  const { key, members } = await _getGroupForItemId(itemId);
  if (!key || members.length <= 1) return;

  const already = !!st?.seededGroups?.[key]?.initiative;

  // carica gli item reali del gruppo
  const items = await OBR.scene.items.getItems(members);

  // Non toccare mai gli Epic
  const notEpic = (it) => !(it.metadata?.[META_KEY]?.epic);

  // target:
  // - prima volta: tutti i non-epic
  // - backfill: solo i non-epic con initiative mancante O zero e NON "toccati" (initTouched !== true)
  let targetIds;
  if (!already) {
    targetIds = items.filter(notEpic).map(it => it.id);
  } else {
  targetIds = items
    .filter(notEpic)
    .filter(it => (it.metadata?.[META_KEY]?.initTouched !== true))
    .map(it => it.id);
    if (targetIds.length === 0) return; // niente da backfillare
  }

  const val = Number.isFinite(Number(value)) ? Math.floor(Number(value)) : 0;

  await OBR.scene.items.updateItems(targetIds, (list) => {
    for (const it of list) {
      const prevMeta = (it.metadata && it.metadata[META_KEY]) || {};
      it.metadata = {
        ...(it.metadata || {}),
        [META_KEY]: { ...prevMeta, initiative: val, initTouched: true } // ⟵ segna come “toccato”
      };
    }
  });

  // Se era la prima volta, marca il gruppo come seedato per iniziativa
  if (!already) {
    await setSceneState(prev => ({
      ...(prev || { order: [], current: 0, round: 1 }),
      seededGroups: {
        ...(prev?.seededGroups || {}),
        [key]: { ...(prev?.seededGroups?.[key] || {}), initiative: true }
      }
    }));
  }

  await reconcileStateWithItems();
  await renderAll();
}

// Propagazione HP/HPMax al gruppo con backfill per nuovi membri
async function trySeedGroupHP(itemId, hp, hpMax) {
  const st = await getSceneState();
  const { key, members } = await _getGroupForItemId(itemId);
  if (!key || members.length <= 1) return;

  const already = !!st?.seededGroups?.[key]?.hp;

  // Un HP massimo positivo indica che il membro è già stato inizializzato.
  // Conserva sia i mostri danneggiati sia quelli a 0 HP, e riempi in un solo
  // passaggio tutti i fratelli ancora vuoti o compilati solo a metà.
  const items = await OBR.scene.items.getItems(members);
  const targetIds = items
    .filter(it => it.id !== itemId)
    .filter(it => {
      const memberHPMax = Number(it.metadata?.[META_KEY]?.hpMax);
      return !Number.isFinite(memberHPMax) || memberHPMax <= 0;
    })
    .map(it => it.id);
  if (targetIds.length === 0) return;

  const nHP  = Math.max(0, Math.floor(Number(hp)    || 0));
  const nMax = Math.max(0, Math.floor(Number(hpMax) || 0));
  const nHPclamped = nMax > 0 ? Math.min(nHP, nMax) : nHP;

  await OBR.scene.items.updateItems(targetIds, (list) => {
    for (const it of list) {
      const prevMeta = (it.metadata && it.metadata[META_KEY]) || {};
      it.metadata = { ...(it.metadata || {}), [META_KEY]: { ...prevMeta, hp: nHPclamped, hpMax: nMax } };
    }
  });

  // Modifica
  // aggiorna subito barre + testo (best-effort)
  try {
    const { syncHPBarNow, syncHPTextNow } = await import("./hpbar-items.js");
    for (const id of targetIds) {
      syncHPBarNow(id, nHPclamped, nMax);
      syncHPTextNow(id, nHPclamped, nMax);
      syncTrackerHPNow(id, nHPclamped, nMax);
    }
  } catch (err) {
    console.warn("[hpbar/hptext] group backfill error", err?.message || err);
  }

  // Se era la prima volta, marca il gruppo come seedato per HP
  if (!already) {
    await setSceneState(prev => ({
      ...(prev || { order: [], current: 0, round: 1 }),
      seededGroups: {
        ...(prev?.seededGroups || {}),
        [key]: { ...(prev?.seededGroups?.[key] || {}), hp: true }
      }
    }));
  }

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

  // Avvia subito l'aggiornamento visivo, senza aspettare il round-trip dei metadata.
  syncHPBarNow(itemId, n, nm);
  void syncHPTextNow(itemId, n, nm);

  await OBR.scene.items.updateItems([itemId], (items) => {
    for (const it of items) {
      const prevMeta = (it.metadata && it.metadata[META_KEY]) || {};
      it.metadata = {
        ...(it.metadata || {}),
        [META_KEY]: { ...prevMeta, hp: n, hpMax: nm },
      };
    }
  });


  // NEW: salva nella memoria stanza (cross‑scene) se è un PG
  try {
    await saveHPToMemoryByItemId(itemId, n, nm);
  } catch (err) {
    console.warn("[hpMemory] save error:", err?.message || err);
  }
}

function parseRelativeHPDelta(value) {
  const match = /^([+\-])(\d+)$/.exec(String(value || "").trim());
  if (!match) return null;
  const amount = Math.floor(Number(match[2]) || 0);
  return match[1] === "-" ? -amount : amount;
}

async function updateMultipleHP(updates = []) {
  const byId = new Map();
  for (const update of updates) {
    const itemId = String(update?.itemId || "").trim();
    if (!itemId) continue;
    byId.set(itemId, {
      itemId,
      hp: Math.max(0, Math.floor(Number(update?.hp) || 0)),
      hpMax: Math.max(0, Math.floor(Number(update?.hpMax) || 0)),
    });
  }
  if (!byId.size) return;

  for (const update of byId.values()) {
    syncHPBarNow(update.itemId, update.hp, update.hpMax);
    void syncHPTextNow(update.itemId, update.hp, update.hpMax);
  }

  await OBR.scene.items.updateItems([...byId.keys()], (items) => {
    for (const it of items) {
      const update = byId.get(it.id);
      if (!update) continue;
      const prevMeta = (it.metadata && it.metadata[META_KEY]) || {};
      it.metadata = {
        ...(it.metadata || {}),
        [META_KEY]: { ...prevMeta, hp: update.hp, hpMax: update.hpMax },
      };
    }
  });

  for (const update of byId.values()) {
    try {
      await saveHPToMemoryByItemId(update.itemId, update.hp, update.hpMax);
    } catch (err) {
      console.warn("[hpMemory] multi save error:", err?.message || err);
    }
  }
}

async function applyGroupHPMaxDelta(itemId, delta) {
  const amount = Math.floor(Number(delta) || 0);
  if (!amount) return 0;

  const { members, me } = await _getGroupForItemId(itemId);
  if (members.length <= 1) return 0;

  const items = await OBR.scene.items.getItems(members);
  const updates = items
    .filter((item) => item.metadata?.[META_KEY]?.inInitiative === true)
    .map((item) => {
      const meta = item.metadata?.[META_KEY] || {};
      const hp = Math.max(0, Math.floor(Number(meta.hp) || 0));
      const hpMax = Math.max(0, Math.floor(Number(meta.hpMax) || 0));
      return {
        itemId: item.id,
        hp: Math.max(0, hp + amount),
        hpMax: Math.max(0, hpMax + amount),
      };
    });
  if (updates.length <= 1) return 0;

  const groupName = _parseIndexedName(me?.name || "Gruppo").base || "Gruppo";
  await withItemMetaHistory({
    kind: "hp",
    label: `Ricalibrazione HP/Max gruppo: ${groupName} (×${updates.length})`,
    itemIds: updates.map((update) => update.itemId),
    fields: ["hp", "hpMax"],
  }, () => updateMultipleHP(updates));

  return updates.length;
}

// ===== Ordina per iniziativa (desc) con tiebreak:
// 1) iniziativa desc
// 2) se pareggio a 20: la Tana va SEMPRE dopo gli altri
// 3) poi mantieni l'ordine manuale nei pareggi
// 4) fallback stabile su id
function sortByInitiative(entries, state) {
  const order = Array.isArray(state?.order) ? state.order : [];
  const pos = new Map(order.map((id, i) => [id, i]));

  return [...entries].sort((a, b) => {
    const ia = Number(a.initiative) || 0;
    const ib = Number(b.initiative) || 0;
    if (ib !== ia) return ib - ia; // desc

    // --- TIEBREAK SPECIFICO EPIC (vincono i pareggi a 20) ---
    if (ia === LAIR_INITIATIVE) {
      const aEpic = !!a.isEpic;
      const bEpic = !!b.isEpic;
      if (aEpic !== bEpic) return aEpic ? -1 : 1; // Epic prima
    }

    // --- TIEBREAK SPECIFICO TANA ---
    if (ia === LAIR_INITIATIVE) {
      const aIsLair = isLairId(a.id);
      const bIsLair = isLairId(b.id);
      if (aIsLair !== bIsLair) {
        // la Tana perde sempre i pareggi → va dopo
        return aIsLair ? 1 : -1;
      }
    }

    // tiebreak normale: rispetta eventuale riordino manuale
    const pa = pos.has(a.id) ? pos.get(a.id) : Number.MAX_SAFE_INTEGER;
    const pb = pos.has(b.id) ? pos.get(b.id) : Number.MAX_SAFE_INTEGER;
    if (pa !== pb) return pa - pb;

    // fallback deterministico
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
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
    case "pc": // NEW: azzurro per i personaggi
      return {
        border: "#3AA7FF",
        glow: "rgba(58,167,255,.28)",
        base: "#3AA7FF",
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

  // Mostra "cur/max"; se cur > max, colora cur per indicare Temp HP
  // Mostra "cur/max"; se cur > max, colora cur per indicare Temp HP
  function formatHPHTML(cur, max) {
  const nCur = Math.max(0, Math.floor(Number(cur) || 0));
  const nMax = Math.max(0, Math.floor(Number(max) || 0));
  const hasTemp = nMax > 0 && nCur > nMax;

  // azzurro leggibile (coerente con palette PC)
  const tempColor = "#3AA7FF";

  if (hasTemp) {
    // pointer-events:none → il click passa alla pill (evitiamo target=span)
    return `<span style="color:${tempColor};pointer-events:none">${nCur}</span>/${nMax}`;
  }
  return `${nCur}/${nMax}`;
}

function syncTrackerHPNow(itemId, hp, hpMax) {
  const pill = document.querySelector(
    `[data-badge="hp"][data-item-id="${itemId}"]`
  );
  if (pill && pill.dataset.hpEditing !== "1") {
    pill.innerHTML = formatHPHTML(hp, hpMax);
  }

  const fill = document.querySelector(
    `[data-hp-fill="1"][data-item-id="${itemId}"]`
  );
  if (fill) {
    const pct = hpMax > 0 ? Math.max(0, Math.min(1, hp / hpMax)) : 0;
    fill.style.width = `${pct * 100}%`;
    fill.style.background = hpColorByPct(pct);
  }
}

  // aggiorna l'iniziativa del token e riallinea l'ordine
  async function updateInitiative(itemId, nextVal) {
  const val = Number.isFinite(Number(nextVal)) ? Math.floor(Number(nextVal)) : 0;
  const { baseId, idx } = splitParagonId(itemId);

  // aggiorna stato per-card
  await setSceneState(prev => {
    const p = { ...(prev?.paragonInits || {}) };
    const arr = Array.isArray(p[baseId]) ? p[baseId].slice() : [];
    const wantLen = Math.max(arr.length, idx + 1);
    while (arr.length < wantLen) arr.push(val);
    arr[idx] = val;
    p[baseId] = arr;
    return { ...(prev || {}), paragonInits: p };
  });

  // se è il card 0 (base), scrivi anche nel token per coerenza con la logica esistente
  if (idx === 0) {
    await OBR.scene.items.updateItems([baseId], (items) => {
      for (const it of items) {
        const prevMeta = (it.metadata && it.metadata[META_KEY]) || {};
        it.metadata = { ...(it.metadata || {}), [META_KEY]: { ...prevMeta, initiative: val, initTouched: true }  };
      }
    });
  }
}

// ===== Legendary helpers =====

async function setParagonActions(baseId, nextActions) {
  const n = Math.max(0, Math.floor(Number(nextActions) || 0));
  await OBR.scene.items.updateItems([baseId], (items) => {
    const it = items[0];
    if (!it) return;
    const me = { ...(it.metadata?.[META_KEY] || {}) };
    if (n <= 1) {
      // disattiva Paragon se <=1
      if (me.paragon) delete me.paragon;
    } else {
      me.paragon = { actions: n };
    }
    it.metadata = { ...(it.metadata || {}), [META_KEY]: me };
  });

  // adatta paragonInits (mantieni le prime, tronca/estendi col valore della base)
  const baseEntries = await readEntries();
  const base = baseEntries.find(x => x.id === baseId);
  const baseInit = Number(base?.initiative) || 0;

  await setSceneState(prev => {
    const p = { ...(prev?.paragonInits || {}) };
    let arr = Array.isArray(p[baseId]) ? p[baseId].slice() : [baseInit];
    if (n <= 1) {
      delete p[baseId];
    } else {
      if (arr.length > n) arr = arr.slice(0, n);
      while (arr.length < n) arr.push(baseInit);
      p[baseId] = arr;
    }
    return { ...(prev || {}), paragonInits: p };
  });
}

// Imposta current a un valore specifico (clamp 0..max; se max>0, min=1)
async function setLegendaryCurrent(itemId, nextCurrent) {
  await OBR.scene.items.updateItems([itemId], (items) => {
    const it = items[0];
    if (!it) return;
    const m  = it.metadata || {};
    const me = { ...(m[META_KEY] || {}) };
    const lg = { ...(me.legendary || { max: 0, current: 0 }) };

    const max = Math.max(0, Number(lg.max) || 0);
    const wanted = Number(nextCurrent) || 0;
    const cur = Math.max(0, Math.min(max, wanted));

    me.legendary = { max, current: cur };
    m[META_KEY] = me;
    it.metadata = m;
  });
}

// Reset al pieno a inizio turno della creatura attiva
async function resetLegendaryIfAny(activeId) {
  if (!activeId) return;
  await OBR.scene.items.updateItems([activeId], (items) => {
    const it = items[0];
    if (!it) return;
    const m  = it.metadata || {};
    const me = { ...(m[META_KEY] || {}) };
    if (me.legendary && Number(me.legendary.max) > 0) {
      me.legendary.current = Number(me.legendary.max) || 0;
      m[META_KEY] = me;
      it.metadata = m;
    }
  });
}
// Cambia il numero massimo di pips (clamp 1..10) e corregge current
async function setLegendaryMax(itemId, nextMax) {
  // ← prima partiva da 0..10; ora impediamo di scendere sotto 1
  const max = Math.max(1, Math.min(5, Math.floor(Number(nextMax) || 0)));
  await OBR.scene.items.updateItems([itemId], (items) => {
    const it = items[0]; if (!it) return;
    const m  = it.metadata || {};
    const me = { ...(m[META_KEY] || {}) };
    const cur = Math.max(0, Math.min(max, Number(me.legendary?.current || 0)));
    me.legendary = { max, current: max > 0 ? cur : 0 }; // max è sempre ≥1 qui
    m[META_KEY] = me;
    it.metadata = m;
  });
}


// ===== Legendary UI helpers (pips minacciosi, parametrici) =====
function mkLegendaryPips(legendary, onSet, attitude = "enemy") {
  const wrap = document.createElement("div");
  Object.assign(wrap.style, {
    display: "flex",
    alignItems: "center",
    gap: `${LEG_PIPS_CFG.gap}px`,
    flexDirection: "row",          // ← ordine naturale: da sinistra a destra
    justifyContent: "flex-start",  // ← l’origine resta ancorata a sinistra
  });

  const max = Math.max(0, Number(legendary?.max) || 0);
  const cur = Math.max(0, Number(legendary?.current) || 0);

  const ON = (() => {
    if (attitude === "enemy")   return { bg: "#dc2626", glow: "0 0 8px rgba(220,38,38,.70)" };
    if (attitude === "neutral") return { bg: "#a16207", glow: "0 0 7px rgba(161,98,7,.60)"  };
    return { bg: "#7f1d1d", glow: "0 0 6px rgba(127,29,29,.55)" }; // ally
  })();

  for (let i = 1; i <= max; i++) {
    const pip = document.createElement("div");
    const S = `${LEG_PIPS_CFG.size}px`;
    Object.assign(pip.style, {
      width: S,
      height: S,
      transform: LEG_PIPS_CFG.diamond ? "rotate(45deg)" : "none",
      borderRadius: LEG_PIPS_CFG.diamond ? "1px" : "999px",
      border: "2px solid rgba(255, 0, 0, 1)",
      background: "rgba(0, 0, 0, 0.5)",
      boxShadow: "inset 0 0 0 1px rgba(0, 0, 0, 0.5)",
      opacity: "1",
      cursor: IS_GM ? "pointer" : "default",
      transition: "transform .12s ease, opacity .12s ease, box-shadow .12s ease, background-color .12s ease",
    });
    if (i <= cur) {
      pip.style.background = ON.bg;
      pip.style.boxShadow  = `${ON.glow}, inset 0 0 1px rgba(0,0,0,.6)`;
      pip.style.borderColor = "rgba(255,255,255,.28)";
    }
    pip.title = "Azione leggendaria";
    pip.addEventListener("mouseenter", () => {
      const rot = LEG_PIPS_CFG.diamond ? "rotate(45deg) " : "";
      pip.style.transform = `${rot}scale(1.12)`; pip.style.opacity = "1";
    });
    pip.addEventListener("mouseleave", () => {
      pip.style.transform = LEG_PIPS_CFG.diamond ? "rotate(45deg)" : "none"; pip.style.opacity = ".9";
    });
    pip.addEventListener("click", (ev) => {
  ev.stopPropagation();
  if (!IS_GM) return;

  const next = (i <= cur) ? (i - 1) : i; // 1→0 consentito
  onSet(next);
});

    wrap.appendChild(pip);
  }
  return wrap;
}

// Quanti chip mostrare prima del "+N"
const MAX_VISIBLE_CHIPS = 3;

// Stile pill generico, simile ai chip
function styleChipPill(el, { compact = true } = {}) {
  Object.assign(el.style, {
    fontSize: compact ? "10px" : "11px",
    fontWeight: "800",
    padding: compact ? "1px 6px" : "2px 8px",
    borderRadius: "999px",
    background: "rgba(0,0,0,.72)",
    color: "#fff",
    border: "1px solid rgba(255,255,255,.18)",
    lineHeight: "1",
    whiteSpace: "nowrap",
    userSelect: "none",
    cursor: "pointer",
  });
}

// Estrae TUTTE le chip reali da un fragment (anche se miste cond/spell).
// - Prende elementi marcati esplicitamente (.chip, .spell-chip, .condition-chip, [data-chip])
// - In AGGIUNTA, raccoglie i "leaf" (span/div senza figli) non già presi.
//   Questo copre le condition chip che non usano classi specifiche.
function __collectChipsDeep(frag) {
  const tmp = document.createElement("div");
  tmp.appendChild(frag); // reparent temporaneo

  const out = [];
  const seen = new Set();

  // 1) chip esplicite (spell usa .chip, condizioni potrebbero avere data-attr)
  const explicit = tmp.querySelectorAll(".chip, .spell-chip, .condition-chip, .cond-chip, [data-chip]");
  explicit.forEach(el => { if (!seen.has(el)) { seen.add(el); out.push(el); } });

  // 2) fallback robusto: tutti i leaf elements significativi (span/div senza figli)
  const leaves = tmp.querySelectorAll("span, div");
  leaves.forEach(el => {
    if (el.children.length === 0 && !seen.has(el)) {
      // escludi micro-elementi vuoti/spaziatori
      const txt = (el.textContent || "").trim();
      if (txt.length) { seen.add(el); out.push(el); }
    }
  });

  return out;
}

// Monta i chip con overflow → +N che espande/comprime **su seconda riga**
// Monta chip con overflow condiviso (condizioni + incantesimi):
// prime `limit` in riga 1, le altre dietro al toggle +N in riga 2.
function mountChipsWithOverflow(dock, frag, { compact = true, limit = MAX_VISIBLE_CHIPS } = {}) {
  const chips = __collectChipsDeep(frag); // 👈 ora abbiamo TUTTE le chip “piatte”
  const row1 = document.createElement("div");
  Object.assign(row1.style, {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: CHIP_GAP_PX + "px",
  });

  // di default nascosta; la apro col toggle
  const row2 = document.createElement("div");
  Object.assign(row2.style, {
    display: "none",
    flexDirection: "row",
    alignItems: "center",
    gap: CHIP_GAP_PX + "px",
  });

  if (chips.length <= limit) {
    row1.append(...chips);
    dock.append(row1);
    return;
  }

  const visible = chips.slice(0, limit);
  const hidden  = chips.slice(limit);

  row1.append(...visible);
  row2.append(...hidden);

  const more = document.createElement("span");
  more.textContent = `+${hidden.length}`;
  styleChipPill(more, { compact });
  more.title = `Mostra altre ${hidden.length} condizioni`;
  let expanded = false;

  more.addEventListener("click", (ev) => {
    ev.stopPropagation();
    expanded = !expanded;
    row2.style.display = expanded ? "flex" : "none";
    more.textContent = expanded ? "−" : `+${hidden.length}`;
    more.title = expanded ? "Comprimi" : `Mostra altre ${hidden.length} condizioni`;
  });

  row1.appendChild(more);
  dock.append(row1, row2);
}


async function openCardEffectsPopup(sourceEntry, entries) {
  if (!sourceEntry || sourceEntry.__groupCollapsed || isLairId(sourceEntry.id) || isEpicActionId(sourceEntry.id)) return;

  const sourceId = splitParagonId(sourceEntry.id).baseId;
  if (!sourceId) return;

  try {
    await OBR.modal.open({
      id: `${ID}/effects-modal`,
      url: `/effects-modal.html?source=${encodeURIComponent(sourceId)}`,
      width: 720,
      height: 600,
      hideBackdrop: true,
    });
  } catch (err) {
    console.warn("[effects] modal open error:", err?.message || err);
  }
}

async function openCardSpellsPopup(sourceEntry) {
  if (!sourceEntry || sourceEntry.__groupCollapsed || isLairId(sourceEntry.id) || isEpicActionId(sourceEntry.id)) return;

  const sourceId = splitParagonId(sourceEntry.id).baseId;
  if (!sourceId) return;

  try {
    await OBR.modal.open({
      id: `${ID}/spells-modal`,
      url: `/spells-modal.html?source=${encodeURIComponent(sourceId)}`,
      width: 720,
      height: 600,
      hideBackdrop: true,
    });
  } catch (err) {
    console.warn("[spells] modal open error:", err?.message || err);
  }
}
    // ===== Render card
    function renderTrack(entries, state, opts = {}) {
    if (__suspendRenders) return;
    const animateActive = !!opts.animateActive;
    const len = state.order.length;
    const activeIdx = state.current ?? 0;
    const currentActiveId = len ? state.order[activeIdx] : null;   // <-- AGGIUNTO QUI
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

    const HAS_LEG = !!(e.legendary && Number(e.legendary.max) > 0);
    const HAS_PAR = Number(e.paragonActions) > 1;
    const IS_EPIC = !!e.isEpic;
    const IS_BOSS = HAS_LEG || HAS_PAR || IS_EPIC;

    const DRAG_OK = !(isLairId(e.id) || isEpicActionId(e.id) || IS_EPIC);
    card.setAttribute("draggable", DRAG_OK ? "true" : "false");
    card.dataset.isEpicAction = e.isEpicAction ? "1" : "0";


    function applyBG3Frame(card, c, opts = {}) {
    const OUTLINE_W = opts.outlineW ?? 2;   // bordo nero
    const FRAME_W   = opts.frameW   ?? 4;   // spessore anello
    const R_OUTER   = opts.rOuter   ?? 12;  // esterno (SPIGOLO: teniamolo 0 sugli strati)
    const R_INNER   = opts.rInner   ?? 12;  // raggio interno ARROTONDATO
    const EPS = 0.5;

    // base card (tuo background neutro)
    card.style.position = "relative";
    card.style.marginLeft = "22px"; // spazio per i controlli radiali sul bordo del ritratto
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

    // --- RESET base per tutte le card ---
    const baseScale = IS_BOSS ? (LEG_BOSS_CFG?.scale ?? 1) : 1;
    const wantBase  = `translateZ(0) scale(${baseScale})`;
    if (card.dataset.zoomState !== "base") {
      __instaTransform(card, wantBase);
      card.dataset.zoomState = "base";
  }
  card.style.zIndex = IS_BOSS ? String(LEG_BOSS_CFG.zIndex) : "";

}

// base card
card.style.minWidth = "240px";
card.style.maxWidth = "240px";
card.style.padding  = "0px 0px 0px";
card.style.color = "#fff";
card.style.display = "flex";
card.style.flexDirection = "column";
card.style.alignItems = "stretch";
card.style.gap = "100%";

// altezza base + boost se boss
const BASE_CARD_H = 48;
const CARD_H = IS_BOSS ? (BASE_CARD_H + LEG_BOSS_CFG.extraHeight) : BASE_CARD_H;
card.style.height = CARD_H + "px";

// applica cornice stile BG3 (come prima)
applyBG3Frame(card, c, {
  outlineW: 1.5,
  frameW: 4,
  rOuter: 0,
  rInner: 8
});

// sostituisci l'assegnazione fissa dell'altezza:
card.style.height = CARD_H + "px";
;
if (HAS_LEG) {
  card.style.transform = `scale(${LEG_BOSS_CFG.scale})`;
  card.style.zIndex = String(LEG_BOSS_CFG.zIndex);
  
  // aggiungi un alone dorato soft senza togliere le ombre esistenti
  const prev = card.style.boxShadow || "";
  card.style.boxShadow = (prev ? (prev + ", ") : "") + LEG_BOSS_CFG.shadow;
} else {
  card.style.transform = "none";
}
  const baseScale = IS_BOSS ? (LEG_BOSS_CFG?.scale ?? 1) : 1;
  card.style.transform = `translateZ(0) scale(${baseScale})`;
  card.style.zIndex = IS_BOSS ? String(LEG_BOSS_CFG.zIndex) : "";

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
{

  // --- ZOOM ATTIVO: anima SOLTANTO quando cambia l’attivo ---
  const baseScale   = IS_BOSS ? (LEG_BOSS_CFG?.scale ?? 1) : 1;
  const activeScale = baseScale * ZOOM_CFG.scale;
  const target      = `translateZ(0) scale(${activeScale})`;

      if (animateActive) {
      __instaTransform(card, `translateZ(0) scale(${baseScale})`);
      requestAnimationFrame(() => {
        card.style.transform = target;
        card.dataset.zoomState = "active";
      });
    } else {
      const prev = card.style.transition;
      card.style.transition = "none";
      card.style.transform = target;
      void card.offsetHeight;
      card.style.transition = prev || "";
      card.dataset.zoomState = "active";
    }

    card.style.zIndex = "6";
  }

  // Badge "turno attivo" (⚔) dimensionato in proporzione alla card/boss
if (isActive) {
  // Fattore di scala: i boss usano avatar 1.5× (vedi AVA = AVA_BASE * 1.5)
  const K = IS_BOSS ? 1.3 : 1;

  const BADGE_BASE_SIZE = 18;  // size standard
  const BADGE_BASE_LEFT = -15;  // offset standard
  const BADGE_BASE_FONT = 12;  // font standard

  const S = Math.round(BADGE_BASE_SIZE * K);  // diametro badge
  const L = Math.round(BADGE_BASE_LEFT * K);  // distanza da sinistra
  const F = Math.round(BADGE_BASE_FONT * K);  // font-size

  const activeBadge = document.createElement("div");
  activeBadge.textContent = "⚔";
  Object.assign(activeBadge.style, {
    position: "absolute",
    left: `${L}px`,
    top: "50%",
    transform: "translateY(55%)",
    width: `${S}px`,
    height: `${S}px`,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: `${F}px`,
    fontWeight: "900",
    color: "#fff",
    background: c.border,
    boxShadow: "0 2px 6px rgba(0,0,0,.85), 0 0 0 2px rgba(0,0,0,.6)",
    zIndex: "4",
    pointerEvents: "none",
  });
  card.appendChild(activeBadge);
}
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
  const AVA_BASE  = 52;                 // diametro avatar “normale”
  const OVER_BASE = 12;                 // sporgenza normale

// Se ha azioni leggendarie, avatar più grande e un filo più “sporgente”
  const AVA  = IS_BOSS ? Math.round(AVA_BASE * 1.5) : AVA_BASE;
  const OVER = IS_BOSS ? Math.round(OVER_BASE * 1.2) : OVER_BASE;

  // header: avatar + name + badge
  const header = document.createElement("div");
  const CONTENT_LEFT = (AVA - OVER + 12); // ← inizio contenuto (subito a destra dell’avatar)
  Object.assign(header.style, {
    position: "relative",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    height: "100%",
    width: "100%",
    padding: "8px 16px",
    paddingLeft: `${CONTENT_LEFT}px`,      // spazio per il testo (riusa la costante)
    paddingRight: "40px",
    boxSizing: "border-box",
  });

  // Wrapper + img: clip perfetto e cover affidabile
const AVATAR_ZOOM = 1.20; // ↑ porta a 1.08/1.12 se alcuni ritratti hanno “cornici” interne

const avatarWrap = document.createElement("div"); // contiene e clippa
Object.assign(avatarWrap.style, {
  position: "absolute",
  left: `-${OVER}px`,
  top: "50%",
  transform: "translateY(-50%)",
  width: `${AVA}px`,
  height: `${AVA}px`,
  borderRadius: "50%",
  overflow: "hidden",
  zIndex: "2",
  boxShadow: `
    0 0 0 2px ${c.base},
    0 0 0 4px black,
    0 0 10px ${c.glow}
  `,
  transition: "width .15s ease, height .15s ease, left .15s ease"
});

let avatarInner;
if (e.portrait) {
  avatarInner = document.createElement("img");
  avatarInner.src = e.portrait;
  avatarInner.alt = e.name;
  Object.assign(avatarInner.style, {
    width: "100%",
    height: "100%",
    objectFit: "cover",           // << riempi sempre il cerchio
    objectPosition: "50% 50%",
    display: "block",
    transform: `scale(${AVATAR_ZOOM})`, // << micro-zoom opzionale
    transformOrigin: "50% 50%",
  });
} else {
  avatarInner = document.createElement("div"); // fallback con iniziale
  avatarInner.textContent = e.name.slice(0,1).toUpperCase();
  Object.assign(avatarInner.style, {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: "800",
    fontSize: "18px",
    background: "rgba(255,255,255,.08)",
    color: "#fff",
    transform: `scale(${AVATAR_ZOOM})`,
    transformOrigin: "50% 50%",
  });
}

avatarWrap.appendChild(avatarInner);

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

let cardToolsDock = null;
let placeCardToolInRadialSlot = null;
if (IS_GM && !isLairId(e.id) && !isEpicActionId(e.id)) {
  cardToolsDock = document.createElement("div");
  if (e.__groupCollapsed) {
    Object.assign(cardToolsDock.style, {
      position: "absolute",
      top: "-8px",
      right: `${BADGE_RIGHT + BADGE_SIZE + 8}px`,
      display: "flex",
      alignItems: "center",
      gap: "4px",
      zIndex: "12",
      pointerEvents: "auto",
    });
  } else {
    Object.assign(cardToolsDock.style, {
      position: "absolute",
      left: `-${OVER}px`,
      top: "50%",
      transform: "translateY(-50%)",
      width: `${AVA}px`,
      height: `${AVA}px`,
      zIndex: "12",
      pointerEvents: "none",
    });

    const radialAngles = [228, 180, 132];
    const radialButtonSize = 20;
    const radialRadius = (AVA / 2) - 2;
    placeCardToolInRadialSlot = (button, slot) => {
      const angle = (radialAngles[slot] ?? 0) * (Math.PI / 180);
      const center = AVA / 2;
      const left = center + (Math.cos(angle) * radialRadius) - (radialButtonSize / 2);
      const top = center + (Math.sin(angle) * radialRadius) - (radialButtonSize / 2);
      Object.assign(button.style, {
        position: "absolute",
        left: `${Math.round(left)}px`,
        top: `${Math.round(top)}px`,
        width: `${radialButtonSize}px`,
        minWidth: `${radialButtonSize}px`,
        height: `${radialButtonSize}px`,
        padding: "0",
        pointerEvents: "auto",
      });
    };
  }
  header.appendChild(cardToolsDock);
}

if (cardToolsDock && !e.__groupCollapsed) {
  const effectsBtn = document.createElement("button");
  effectsBtn.type = "button";
  effectsBtn.textContent = "✨";
  effectsBtn.title = "Gestisci condizioni ed effetti";
  effectsBtn.setAttribute("aria-label", effectsBtn.title);
  Object.assign(effectsBtn.style, {
    flex: "0 0 auto",
    width: "24px",
    height: "24px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0",
    borderRadius: "999px",
    border: "1px solid rgba(255,255,255,.22)",
    background: "rgba(0,0,0,.52)",
    color: "#fff",
    fontSize: "13px",
    lineHeight: "1",
    cursor: "pointer",
    boxShadow: "0 1px 3px rgba(0,0,0,.35)",
  });
  effectsBtn.addEventListener("pointerdown", (ev) => {
    ev.stopPropagation();
    ev.preventDefault();
  });
  effectsBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    ev.preventDefault();
    openCardEffectsPopup(e, entries);
  });
  placeCardToolInRadialSlot?.(effectsBtn, 0);
  cardToolsDock.appendChild(effectsBtn);

  const spellsBtn = document.createElement("button");
  spellsBtn.type = "button";
  spellsBtn.title = "Gestisci incantesimi";
  spellsBtn.setAttribute("aria-label", spellsBtn.title);
  Object.assign(spellsBtn.style, {
    flex: "0 0 auto",
    width: "24px",
    height: "24px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0",
    borderRadius: "999px",
    border: "1px solid rgba(255,255,255,.22)",
    background: "rgba(0,0,0,.52)",
    color: "#fff",
    cursor: "pointer",
    boxShadow: "0 1px 3px rgba(0,0,0,.35)",
  });
  const spellsIcon = document.createElement("img");
  spellsIcon.src = `${import.meta.env.BASE_URL || "/"}spells.svg`;
  spellsIcon.alt = "";
  Object.assign(spellsIcon.style, {
    width: "17px",
    height: "17px",
    display: "block",
    filter: "brightness(0) invert(1)",
    pointerEvents: "none",
  });
  spellsBtn.appendChild(spellsIcon);
  spellsBtn.addEventListener("pointerdown", (ev) => {
    ev.stopPropagation();
    ev.preventDefault();
  });
  spellsBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    ev.preventDefault();
    openCardSpellsPopup(e);
  });
  placeCardToolInRadialSlot?.(spellsBtn, 1);
  cardToolsDock.appendChild(spellsBtn);
}

if (cardToolsDock && e.__groupCollapsed) {
  const groupDeltaButton = document.createElement("button");
  groupDeltaButton.type = "button";
  groupDeltaButton.textContent = `HP ± ×${e.__groupCount || e.__groupMembers?.length || 0}`;
  groupDeltaButton.title = "Ricalibra HP correnti e massimi di tutto il gruppo";
  Object.assign(groupDeltaButton.style, {
    flex: "0 0 auto",
    minWidth: "58px",
    height: "24px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 6px",
    borderRadius: "999px",
    border: "1px solid rgba(255,255,255,.22)",
    background: "rgba(0,0,0,.52)",
    color: "#fff",
    fontSize: "11px",
    fontWeight: "800",
    lineHeight: "1",
    cursor: "pointer",
    boxShadow: "0 1px 3px rgba(0,0,0,.35)",
  });
  groupDeltaButton.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
    event.preventDefault();
    armDocClickIgnore(350);
  });
  groupDeltaButton.addEventListener("click", async (event) => {
    event.stopPropagation();
    event.preventDefault();
    armDocClickIgnore(350);
    await closeOpenEditors();

    const input = document.createElement("input");
    input.type = "text";
    input.inputMode = "numeric";
    input.placeholder = "+/-";
    input.pattern = "[+\\-]?\\d*";
    input.dataset.groupHpDeltaEditor = "1";
    Object.assign(input.style, {
      width: "58px",
      height: "24px",
      boxSizing: "border-box",
      padding: "0 6px",
      borderRadius: "999px",
      border: "1px solid rgba(251,191,36,.82)",
      outline: "none",
      background: "rgba(245,158,11,.42)",
      color: "#fff",
      fontSize: "12px",
      fontWeight: "800",
      textAlign: "center",
      boxShadow: "0 1px 3px rgba(0,0,0,.35)",
    });

    const previousDraggable = card.getAttribute("draggable");
    card.setAttribute("draggable", "false");
    groupDeltaButton.replaceWith(input);

    let finished = false;
    const restore = () => {
      if (input.isConnected) input.replaceWith(groupDeltaButton);
      if (previousDraggable === null) card.removeAttribute("draggable");
      else card.setAttribute("draggable", previousDraggable);
    };
    const cancel = () => {
      if (finished) return;
      finished = true;
      restore();
    };
    const commit = async () => {
      if (finished) return;
      const delta = parseRelativeHPDelta(input.value);
      if (delta === null || delta === 0) {
        cancel();
        return;
      }
      finished = true;
      input.disabled = true;
      const wasSuspended = __suspendRenders;
      __suspendRenders = true;
      try {
        await applyGroupHPMaxDelta(e.id, delta);
      } catch (err) {
        console.warn("[hp] group delta error:", err?.message || err);
      } finally {
        __suspendRenders = wasSuspended;
        restore();
        await renderAll();
      }
    };

    input.addEventListener("pointerdown", (ev) => ev.stopPropagation());
    input.addEventListener("click", (ev) => ev.stopPropagation());
    input.addEventListener("input", () => {
      let value = String(input.value || "").replace(/\s+/g, "");
      value = value.replace(/(?!^)[+\-]/g, "");
      value = value.replace(/(?!^[+\-])\D+/g, "");
      input.value = value;
    });
    input.addEventListener("keydown", (keyEvent) => {
      if (keyEvent.key === "Enter") {
        keyEvent.preventDefault();
        void commit();
      } else if (keyEvent.key === "Escape") {
        keyEvent.preventDefault();
        cancel();
      }
    });
    input.addEventListener("blur", () => void commit());
    requestAnimationFrame(() => {
      input.focus({ preventScroll: true });
      input.select();
    });
  });
  cardToolsDock.appendChild(groupDeltaButton);
}

  // ---- TAGs spostabili (posizione salvata in scena)
  const tagsDock = document.createElement("div");
  Object.assign(tagsDock.style, {
    position: "absolute",
    display: "flex",
    gap: "6px",
    alignItems: "center",
    transform: "translate(-50%, -50%)",
    pointerEvents: "auto",
    zIndex: "5",
  });
  // posizione percentuale (left/top) letta dallo stato
  (function setTagsDockPosFromState(){
    const tp = (state?.ui?.tagsDock) || { x: 0.72, y: 0.50 };
    tagsDock.style.left = (tp.x * 100) + "%";
    tagsDock.style.top  = (tp.y * 100) + "%";
  })();

  // Drag dei tag (solo GM): trascina l’intero dock
  if (IS_GM) {
    tagsDock.style.cursor = "grab";
    let dragging = false, rect = null, pid = 0;
    const onMove = async (ev) => {
      if (!dragging || !rect) return;
      const x = (ev.clientX - rect.left) / rect.width;
      const y = (ev.clientY - rect.top)  / rect.height;
      const nx = Math.max(0.05, Math.min(0.95, x));
      const ny = Math.max(0.10, Math.min(0.90, y));
      tagsDock.style.left = (nx * 100) + "%";
      tagsDock.style.top  = (ny * 100) + "%";
      await setSceneState(prev => ({
        ...(prev || {}),
        ui: { ...(prev?.ui || {}), tagsDock: { x: nx, y: ny } }
      }));
    };
    const onUp = () => {
      dragging = false;
      tagsDock.releasePointerCapture?.(pid);
      document.removeEventListener("pointermove", onMove, true);
      document.removeEventListener("pointerup", onUp, true);
      tagsDock.style.cursor = "grab";
    };
    tagsDock.addEventListener("pointerdown", (ev) => {
      if (!IS_GM) return;
      ev.stopPropagation();
      pid = ev.pointerId || 0;
      dragging = true;
      tagsDock.setPointerCapture?.(pid);
      rect = header.getBoundingClientRect();
      tagsDock.style.cursor = "grabbing";
      document.addEventListener("pointermove", onMove, true);
      document.addEventListener("pointerup", onUp, true);
    });
  }

// --- Tag Dock (EPIC e AZIONE EPICA) separati: non draggabili ---
if (!e.__groupCollapsed) {
  const mkPill = (cfg) => {
  const s = document.createElement("span");
  s.textContent = cfg.label || "";

  // letter-spacing sicuro: usa valore numerico → "Npx", altrimenti default "0.5px"
  const ls = Number.isFinite(cfg?.letterSpacing) ? `${cfg.letterSpacing}px` : "0.5px";

  Object.assign(s.style, {
    fontSize: `${cfg.fontSize ?? 11}px`,
    fontWeight: String(cfg.fontWeight ?? 800),
    padding: `${cfg.padY ?? 2}px ${cfg.padX ?? 6}px`,
    borderRadius: `${cfg.radius ?? 999}px`,
    background: cfg.bg || "rgba(147,112,219,.35)",
    color: cfg.color || "#fff",
    border: cfg.border || "1px solid rgba(255,255,255,.18)",
    letterSpacing: ls,
    whiteSpace: "nowrap", 
    userSelect: "none",
    pointerEvents: "none",
  });

  return s;
};

  // Boss Epico
  if (IS_EPIC) {
    const pos = EPIC_TAG_CFG.posBoss;
    const dockBoss = document.createElement("div");
    Object.assign(dockBoss.style, {
      position: "absolute",
      top: `${pos.top}px`,
      right: `${__rightPxFrom(pos)}px`,
      display: "flex",
      alignItems: "center",
      gap: `${pos.gap || 6}px`,
      zIndex: "5",
      pointerEvents: "none"
    });
    dockBoss.appendChild(mkPill(EPIC_TAG_CFG.epic));
    header.appendChild(dockBoss);
  }

  // Azione Epica (entry virtuale)
  if (e.isEpicAction) {
    const pos = EPIC_TAG_CFG.posAction;
    const dockAct = document.createElement("div");
    Object.assign(dockAct.style, {
      position: "absolute",
      top: `${pos.top}px`,
      right: `${__rightPxFrom(pos)}px`,
      display: "flex",
      alignItems: "center",
      gap: `${pos.gap || 6}px`,
      zIndex: "5",
      pointerEvents: "none"
    });
    dockAct.appendChild(mkPill(EPIC_TAG_CFG.action));
    header.appendChild(dockAct);
  }
}

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
  right: BADGE_RIGHT + "px",
  top: "50%",
  transform: "translateY(-50%)",
  width: BADGE_SIZE + "px",
  height: BADGE_SIZE + "px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0",
  fontSize: "14px",
  fontWeight: "700",
  lineHeight: "1",
  color: "#fff",
  background: "rgba(0,0,0,.72)",
  border: "1px solid rgba(255,255,255,.18)",
  borderRadius: "50%",
  boxShadow: "0 0 0 1px rgba(0,0,0,.25)",
  cursor: "text",
});

// --- Dock per condizioni
const condDock = document.createElement("div");
condDock.style.position = "absolute";
condDock.style.top = `${COND_DOCK_CFG.top}px`;
condDock.style.left = `${CONTENT_LEFT + (COND_DOCK_CFG.leftFromContent || 0)}px`;
condDock.style.right = "auto";
condDock.style.zIndex = "10";
condDock.style.overflow = "visible"; // importantissimo per far “uscire” l’overlay
condDock.style.display = "flex";
condDock.style.flexDirection = "column";
condDock.style.alignItems = "flex-start";   // ancora a sinistra
condDock.style.gap = CHIP_GAP_PX + "px";
header.appendChild(condDock);

// --- CHIPS: condizioni + incantesimi in un unico gruppo con overflow condiviso ---
const fragAll = document.createDocumentFragment();

// 1) Condizioni
const condData = __safeConditions(e.conditions);
const hasAny = (Object.keys(condData.flags).length > 0) || (condData.custom && condData.custom.length > 0) || condData.instances.length > 0;
if (hasAny) {
  const fragCond = __buildConditionChipsSafe(condData, { cap: CONDITIONS, compact: true });
  if (fragCond) fragAll.appendChild(fragCond);
}

// 2) Incantesimi
if (Array.isArray(e.spells) && e.spells.length) {
  const fragSp = buildSpellChips(e.spells);

  // colore pieno = stesso del badge "C"
    const chips = Array.from(fragSp.childNodes).filter(n => n.nodeType === 1);
  for (let i = 0; i < chips.length && i < e.spells.length; i++) {
    const k   = __spellKey(e.spells[i]?.name);
    const col = __spellColor(k);
    const el  = chips[i];
    el.style.background = col.solid; // ⟵ colore pieno, no alpha
    // NON toccare font/padding/radius/border/shadow: gestiscili in spells.js
  }

  fragAll.appendChild(fragSp);
}

// 3) Monta TUTTO assieme: 3 visibili in totale, poi +N
condDock.style.gap = CHIP_GAP_PX + "px";
mountChipsWithOverflow(condDock, fragAll, { compact: true, limit: 3 });

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
  if (e.__groupCollapsed || e.isEpic || e.isEpicAction) { ev.preventDefault(); ev.stopPropagation(); return; }
  if (badge.dataset.editing === "1") return;

  ev.stopImmediatePropagation();
  ev.preventDefault();
  armDocClickIgnore(350);                           // un filo più lunga
  const onPU = () => {                              // estendi un attimo dopo il pointerup
    armDocClickIgnore(150);
    document.removeEventListener("pointerup", onPU, true);
  };
  document.addEventListener("pointerup", onPU, true);

  // 1) blocca subito i render e marca l'ID che sta per entrare in edit
  __suspendRenders = true;
  __editingInitForId = e.id;

  // 2) chiudi QUALSIASI altro editor già aperto
  await closeOpenEditors(); 

  const input = document.createElement("input");
  input.type = "text";                // niente spinner
  input.inputMode = "numeric";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.pattern = "-?\\d*";

  let liveInit = null;
  try {
  const [live] = await OBR.scene.items.getItems([e.id]);
  const mm = live?.metadata?.[META_KEY] || {};
  if (Number.isFinite(mm.initiative)) liveInit = Math.floor(Number(mm.initiative));
  } catch {}
  const prefillInit = (liveInit ?? (Number.isFinite(e.initiative) ? Math.floor(Number(e.initiative)) : 0));
  input.value = String(prefillInit);

  // 3) l'editor è stabile → sblocca i render nel prossimo tick
  setTimeout(() => { __suspendRenders = false; }, 0);

  Object.assign(input.style, {
  width: "100%",           // riempi il cerchio
  height: "100%",
  boxSizing: "border-box",
  margin: "0",
  padding: "0",
  border: "none",
  outline: "none",
  background: "transparent",
  color: "#fff",
  fontSize: "15px",
  fontWeight: "800",
  textAlign: "center",
  lineHeight: "1",
  appearance: "none",
});

  if (e.isEpic) {
  badge.title = "Un Epic Boss agisce sempre su iniziativa 20.";
  badge.style.cursor = "default";
}
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
  try { await trySeedGroupInitiative(e.id, normalized); } catch (err) { console.warn(err); }

  cleanup();

  // 🔧 NEW: riordina SUBITO e ridisegna
  await reconcileStateWithItems();
  await renderAll();

  // (senza TAB) centra la card nella sua nuova posizione
  requestAnimationFrame(() => {
    const me = document.querySelector(`[data-item-id="${e.id}"]`);
    me?.scrollIntoView?.({ behavior: "smooth", block: "center", inline: "nearest" });
  });
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
  tabbing = true;

  // 📸 fotografiamo l'ordine PRIMA del riordino
  let preOrder = [];
  try {
    const st = await getSceneState();
    preOrder = Array.isArray(st?.order) ? [...st.order] : [];
  } catch {}

  await commit();   // aggiorna, riordina, renderizza
  tabbing = false;

  let targetId = null;
  const direction = goPrev ? -1 : 1;

  // 🔍 cerchiamo il vicino basandoci su preOrder (quello originale)
  const idx = preOrder.indexOf(e.id);
  if (idx >= 0) {
    let i = idx + direction;
    while (i >= 0 && i < preOrder.length) {
      const candId = preOrder[i];

      // escludiamo pill non editabili
      const cardEl  = document.querySelector(`[data-item-id="${candId}"]`);
      const badgeEl = document.querySelector(`[data-badge="init"][data-item-id="${candId}"]`);
      const collapsed  = cardEl?.dataset.groupCollapsed === "1";
      const isEpicBoss = cardEl?.dataset.isEpic === "1";
      const isEpicAct  = typeof isEpicActionId === "function" ? isEpicActionId(candId) : false;

      const editable = !!badgeEl && !collapsed && !isEpicBoss && !isEpicAct;
      if (editable) { targetId = candId; break; }

      i += direction;
    }
  }

  if (targetId) {
    requestAnimationFrame(() => {
      const nextEl = document.querySelector(
        `[data-badge="init"][data-item-id="${targetId}"]`
      );
      if (nextEl) {
        nextEl.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
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
    left: "24px",
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
// ===== 2 DOCKS INDIPENDENTI: PIPS e CONTROLLI (+/-) =====
function __rightPxFrom(cfg) {
  // Se cfg.right è numerico → assoluto; altrimenti calcola dal bordo destro oltre il badge
  if (Number.isFinite(cfg.right)) return Number(cfg.right);
  return BADGE_RIGHT + BADGE_SIZE + Number(cfg.rightFromBadge || 0);
}

// --- DOCK PIPS (indipendente) ---
if (!e.__groupCollapsed && e.legendary && Number(e.legendary.max) > 0) {
    const dockPips = document.createElement("div");
    Object.assign(dockPips.style, {
    position: "absolute",
    top: `${LEG_PIPS_CFG.top}px`,
    left: `${CONTENT_LEFT + (LEG_PIPS_CFG.offsetX || 0)}px`, // ← ancora fissa a sinistra
    display: "flex",
    alignItems: "center",
    // Niente sfondo/bordo di default: è solo il gruppo pips
    zIndex: "5",
    pointerEvents: "auto",
  });

  const pipsNode = mkLegendaryPips(
    e.legendary,
    async (nextCurrent) => { if (IS_GM) { try { await setLegendaryCurrent(e.id, nextCurrent); } catch {} } },
    e.attitude || "enemy"
  );
  dockPips.appendChild(pipsNode);
  header.appendChild(dockPips);
}

// --- DOCK CONTROLLI LEGENDARY (+/−) ---
if (!e.__groupCollapsed && IS_GM && e.legendary && Number(e.legendary.max) > 0) {
  const dockCtrl = document.createElement("div");
  Object.assign(dockCtrl.style, {
    position: "absolute",
    top: `${LEG_CTRL_CFG.top}px`,
    right: `${__rightPxFrom(LEG_CTRL_CFG)}px`,
    display: "flex",
    alignItems: "center",
    gap: `${LEG_CTRL_CFG.gap}px`,
    padding: `${LEG_CTRL_CFG.paddingY}px ${LEG_CTRL_CFG.paddingX}px`,
    borderRadius: `${LEG_CTRL_CFG.dockRadius}px`,
    background: LEG_CTRL_CFG.dockBg,
    border: LEG_CTRL_CFG.dockBorder,
    zIndex: "5",
    pointerEvents: "auto",
  });

  const mkLegBtn = (txt, delta) => {
    const b = document.createElement("button");
    b.type = "button";
    Object.assign(b.style, {
      width: `${LEG_CTRL_CFG.btnSize}px`,
      height: `${LEG_CTRL_CFG.btnSize}px`,
      borderRadius: `${LEG_CTRL_CFG.btnRadius}px`,
      border: "1px solid rgba(255,255,255,.18)",
      background: "rgba(0, 0, 0, 0.72)",
      color: "#fff",
      fontSize: "12px",
      fontWeight: "800",
      lineHeight: "1",
      padding: "0",
      cursor: "pointer",
      boxShadow: "0 1px 3px rgba(0,0,0,.4)",
      transition: "transform .12s ease, background-color .12s ease, border-color .12s ease",
    });
    b.textContent = txt;
    b.addEventListener("mouseenter", () => { b.style.transform = "translateY(-1px)"; });
    b.addEventListener("mouseleave", () => { b.style.transform = "translateY(0)"; });
    b.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      const nextMax = Math.max(1, Math.min(10, Number(e.legendary.max) + delta));
      try { await setLegendaryMax(e.id, nextMax); } catch {}
    });
    return b;
  };

  dockCtrl.appendChild(mkLegBtn("−", -1));
  dockCtrl.appendChild(mkLegBtn("+", +1));
  header.appendChild(dockCtrl);
} // ← CHIUDE il blocco Legendary

// --- DOCK PARAGON (+ / −) --- (solo GM, attivo solo se Legendary assente/0)
if (!e.__groupCollapsed && IS_GM && Number(e.paragonActions) > 0 &&
    (!e.legendary || Number(e.legendary.max) === 0)) {
  const dockPar = document.createElement("div");
  Object.assign(dockPar.style, {
    position: "absolute",
    top: `${PAR_CTRL_CFG.top}px`,
    right: `${__rightPxFrom(PAR_CTRL_CFG)}px`,
    display: "flex",
    alignItems: "center",
    gap: `${PAR_CTRL_CFG.gap}px`,
    padding: `${PAR_CTRL_CFG.paddingY}px ${PAR_CTRL_CFG.paddingX}px`,
    borderRadius: `${PAR_CTRL_CFG.dockRadius || 0}px`,
    background: PAR_CTRL_CFG.dockBg || "transparent",
    border: PAR_CTRL_CFG.dockBorder || "none",
    zIndex: "5",
    pointerEvents: "auto",
  });

  const mkParBtn = (txt, delta) => {
    const b = document.createElement("button");
    b.type = "button";
    Object.assign(b.style, {
      width: `${PAR_CTRL_CFG.btnSize}px`,
      height: `${PAR_CTRL_CFG.btnSize}px`,
      borderRadius: `${PAR_CTRL_CFG.btnRadius}px`,
      border: "1px solid rgba(255,255,255,.18)",
      background: "rgba(0, 0, 0, 0.72)",
      color: "#fff",
      fontSize: "12px",
      fontWeight: "800",
      lineHeight: "1",
      padding: "0",
      cursor: "pointer",
      boxShadow: "0 1px 3px rgba(0,0,0,.4)",
      transition: "transform .12s ease, background-color .12s ease, border-color .12s ease",
    });
    b.textContent = txt;
    b.addEventListener("mouseenter", () => { b.style.transform = "translateY(-1px)"; });
    b.addEventListener("mouseleave", () => { b.style.transform = "translateY(0)"; });
    b.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      const baseId = e.__paragonBaseId || e.id;
      const cur = Math.max(1, Math.floor(Number(e.paragonActions) || 1));
      const next = Math.max(1, Math.min(10, cur + delta));
      try {
        await setParagonActions(baseId, next);
        await reconcileStateWithItems();
        await renderAll();
      } catch (err) {
        console.warn("[paragon] set actions error:", err?.message || err);
      }
    });
    return b;
  };

  const lab = document.createElement("div");
  lab.textContent = `P:${String(e.paragonActions)}`;
  Object.assign(lab.style, {
    fontSize: "12px",
    fontWeight: "800",
    minWidth: "28px",
    textAlign: "center",
    color: "#fff",
    userSelect: "none",
  });
  
  const btnMinus = mkParBtn("−", -1);
  const btnPlus  = mkParBtn("+", +1);

  dockPar.append(btnMinus, btnPlus, lab);
  header.appendChild(dockPar);
}

  header.append(avatarWrap, name, badge);
// Indicatore concentrazione: pallino con "C" se il caster sta concentrando
// Se la card è collassata, lo mostriamo se QUALSIASI membro del gruppo sta concentrando.
{
  // ON se il caster (o un membro del gruppo collassato) sta concentrando
  const concOn = !!(e.isConcentrating ||
                    (e.__groupCollapsed && Array.isArray(e.__groupMembers) &&
                     e.__groupMembers.some(m => m.isConcentrating)));
  if (concOn) {
    // Ricava la chiave spell dal caster o, se collassato, dal primo membro che ce l’ha
    const k = e.concSpellKey ||
              (e.__groupCollapsed
                ? (e.__groupMembers?.find(m => m.concSpellKey)?.concSpellKey || null)
                : null);
    const col = k ? __spellColor(k) : { solid: "rgba(0,0,0,0.80)", border: "rgba(255,255,255,.18)" };

    const C_DOT_SIZE = 18;           // diametro pallino
    const cDot = document.createElement("div");
    cDot.textContent = "C";
    cDot.title = k
      ? `Concentrazione: ${k[0].toUpperCase() + k.slice(1)}`
      : "Concentrazione attiva";

    Object.assign(cDot.style, {
      position: "absolute",
      right: "98%",              // lasciamo libero di “uscire” dalla card vicino all’avatar
      top: "15%",
      transform: "translateY(-50%)",
      width: C_DOT_SIZE + "px",
      height: C_DOT_SIZE + "px",
      borderRadius: "50%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: "10px",
      fontWeight: "800",
      lineHeight: "1",
      color: "#fff",
      background: col.solid,      // ⟵ colore della spell
      border: `2px solid rgba(0,0,0,1)`,
      boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.5)",
      zIndex: "6",
      pointerEvents: "none"
    });
    header.appendChild(cDot);
  }
}


  card.appendChild(header);

// === HP pill (solo GM)
// === HP pill (GM sempre; Player solo per ally/pc)
const _att = String(e.attitude || "").toLowerCase();
const PLAYER_VISIBLE_ATTITUDES = ["ally", "pc"];
const _playerCanSeeHP = PLAYER_VISIBLE_ATTITUDES.includes(_att);

if ((IS_GM || _playerCanSeeHP) && !e.__groupCollapsed && !isLairId(e.id) && !isEpicActionId(e.id)) {
  const pill = document.createElement("div");
  pill.title = "Click: modifica HP. +N/-N sui token selezionati; ± modifica anche gli HP massimi";
  pill.style.position = "absolute";
  pill.style.top = "75%";
  pill.style.left = "19%";
  pill.style.padding = "2px 8px";
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
  pill.innerHTML = formatHPHTML(hpVal, hpMaxV);   // <-- usa HTML per colorare cur se temp
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
  hpFill.dataset.hpFill = "1";
  hpFill.dataset.itemId = e.id;
  hpFill.style.width = (initPct * 100) + "%";
  hpFill.style.height = "100%";
  hpFill.style.background = initPct > 0.66 ? "#16a34a" : initPct > 0.33 ? "#facc15" : "#dc2626";

  hpBarWrap.appendChild(hpFill);

  card.appendChild(pill);
  card.appendChild(hpBarWrap);

  let hpDeltaButton = null;
  const setHPDeltaButtonActive = (active) => {
    if (!hpDeltaButton) return;
    hpDeltaButton.setAttribute("aria-pressed", String(!!active));
    hpDeltaButton.style.background = active
      ? "rgba(245,158,11,.42)"
      : "rgba(0,0,0,.52)";
    hpDeltaButton.style.borderColor = active
      ? "rgba(251,191,36,.82)"
      : "rgba(255,255,255,.22)";
  };

  if (IS_GM) {
    hpDeltaButton = document.createElement("button");
    hpDeltaButton.type = "button";
    hpDeltaButton.textContent = "±";
    hpDeltaButton.title = "Ricalibra HP correnti e massimi dello stesso +N/-N";
    hpDeltaButton.setAttribute("aria-label", hpDeltaButton.title);
    hpDeltaButton.setAttribute("aria-pressed", "false");
    Object.assign(hpDeltaButton.style, {
      flex: "0 0 auto",
      minWidth: "42px",
      height: "24px",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "0 6px",
      borderRadius: "999px",
      border: "1px solid rgba(255,255,255,.22)",
      background: "rgba(0,0,0,.52)",
      color: "#fff",
      fontSize: "11px",
      fontWeight: "800",
      lineHeight: "1",
      cursor: "pointer",
      boxShadow: "0 1px 3px rgba(0,0,0,.35)",
    });
    hpDeltaButton.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      event.preventDefault();
      armDocClickIgnore(350);
    });
    hpDeltaButton.addEventListener("click", (event) => {
      event.stopPropagation();
      event.preventDefault();
      armDocClickIgnore(350);

      if (
        pill.dataset.hpEditing === "1" &&
        __editingHPForId === e.id &&
        typeof pill.__setLinkedHPMaxDelta === "function"
      ) {
        pill.__setLinkedHPMaxDelta(!pill.__linkedHPMaxDelta);
        pill.__iHP?.focus({ preventScroll: true });
        pill.__iHP?.select();
        return;
      }

      pill.dataset.hpOpenLinkedDelta = "1";
      const rect = pill.getBoundingClientRect();
      pill.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true,
        clientX: rect.left + 1,
        clientY: rect.top + (rect.height / 2),
      }));
    });
    placeCardToolInRadialSlot?.(hpDeltaButton, 2);
    hpDeltaButton.style.fontSize = "15px";
    cardToolsDock?.appendChild(hpDeltaButton);
  }

// === apertura editor HP su pointerdown (con handoff robusto) ===

if (IS_GM) {
pill.addEventListener("pointerdown", async (ev) => {
  ev.stopImmediatePropagation();
  ev.preventDefault();

    // --- Se questa pill è già in edit: NON rebootare l'editor, cambia solo focus ---
  if (pill.dataset.hpEditing === "1" && __editingHPForId === e.id) {
    // ignora i click di scia per evitare il commit del doc-click handler
    armDocClickIgnore(200);

    // calcolo metà rispetto alla pill (non al target interno)
    const r = pill.getBoundingClientRect();
    const clickedRightHalf = (ev.clientX - r.left) > (r.width / 2);

    // referenze agli input già esistenti (memorizzate su pill in fase di bootstrap)
    const iHP  = pill.__iHP;
    const iMax = pill.__iMax;

    if (clickedRightHalf && iMax) {
      iMax.focus({ preventScroll: true });
      iMax.select();
    } else if (iHP) {
      iHP.focus({ preventScroll: true });
      iHP.select();
    }
    return; // ⬅️ importantissimo: NON proseguire con il bootstrap (evita flicker)
  }

  // ⬅︎⬅︎ NEW — HANDOFF: se c'è già una pill HP in edit e NON è questa,
  // chiudi prima quella e rilancia questo pointerdown al prossimo frame.
  if (__editingHPForId && __editingHPForId !== e.id) {
    const targetId = e.id;
    __suspendRenders = true;                 // niente rimpiazzi DOM durante il passaggio
    try { await closeOpenEditors(); } catch {}
    requestAnimationFrame(() => {
      // ignora eventuali click di scia generati dal commit della prima pill
      armDocClickIgnore(250);
      const nextEl = document.querySelector(
        `[data-badge="hp"][data-item-id="${targetId}"]`
      );
      if (nextEl) {
        nextEl.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      }
      __suspendRenders = false;
    });
    return; // ← importantissimo: NON proseguire con il bootstrap dell’editor adesso
  }

  // Da qui in giù: comportamento normale di apertura editor per questa pill

  // Estendi la finestra di ignore per il click di coda generato da questo pointerdown
  armDocClickIgnore(350);
  const onPU = () => {
    armDocClickIgnore(150); // un filo in più appena dopo il pointerup
    document.removeEventListener("pointerup", onPU, true);
  };
  document.addEventListener("pointerup", onPU, true);

  // Inghiotte il PRIMO click di coda (solo se cade dentro la pill aperta)
  const swallowFirstClick = (evt) => {
    if (pill.contains(evt.target)) { evt.stopPropagation(); evt.preventDefault(); }
  };
  document.addEventListener("click", swallowFirstClick, { capture: true, once: true });

  // 🔒 Congela subito e marca l’ID in edit (evita che un render distrugga il DOM appena creato)
  __suspendRenders = true;
  __editingHPForId = e.id;

  // Chiudi eventuali altri editor (qui NON entriamo più nel caso HP→HP grazie all’handoff sopra)
  await closeOpenEditors();

  // Flag locale per questa pill
  pill.dataset.hpEditing = "1";

  // Disabilita drag sulla card finché editi
  const cardEl = pill.closest('[data-item-id]');
  const prevDraggable = cardEl ? cardEl.getAttribute("draggable") : null;
  if (cardEl) cardEl.setAttribute("draggable", "false");

  // ====== (tutto il resto del tuo bootstrap editor rimane uguale) ======
  // Parser inline, prefill, costruzione wrap + input iHP/iMax, stile, ecc...
  // --- INIZIO: blocco invariato dal tuo codice ---

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

  // 4) PREFILL ROBUSTO + LIVE (autofill immediato quando si passa alla successiva)
let liveHP = null, liveMax = null;
try {
  const [live] = await OBR.scene.items.getItems([e.id]);
  const mm = live?.metadata?.[META_KEY] || {};
  if (Number.isFinite(mm.hp))   liveHP = mm.hp;
  if (Number.isFinite(mm.hpMax)) liveMax = mm.hpMax;
} catch {}

const pillTxt = (pill.textContent || "").trim();
let fromPillHP = null, fromPillMax = null;
{
  const m = /^(\d+)\s*\/\s*(\d+)$/.exec(pillTxt);
  if (m) { fromPillHP = parseInt(m[1], 10); fromPillMax = parseInt(m[2], 10); }
}

// Priorità: valori live dei metadata (post-seed) → testo pill → snapshot `e`
const hpVal  = (liveHP  ?? fromPillHP ?? (Number.isFinite(e.hp)    ? e.hp    : 0));
const hpMaxV = (liveMax ?? fromPillMax ?? (Number.isFinite(e.hpMax) ? e.hpMax : 0));


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
    inp.pattern = "[+\\-]?\\d*";
    // stile
    inp.style.width = "22px";
    inp.style.border = "none";
    inp.style.outline = "none";
    inp.style.background = "transparent";
    inp.style.color = "#fff";
    inp.style.fontSize = "15px";
    inp.style.fontWeight = "700";
    inp.style.textAlign = "center";
    // filters
    inp.addEventListener("wheel", (e2) => e2.preventDefault(), { passive: false });
    inp.addEventListener("keydown", (ke) => {
      if (ke.key === "ArrowUp" || ke.key === "ArrowDown") ke.preventDefault();
    });
    inp.addEventListener("input", () => {
      let v = (inp.value || "").replace(/\s+/g, "");
      v = v.replace(/(?!^)[+\-]/g, "");
      v = v.replace(/(?!^[+\-])\D+/g, "");
      inp.value = v;
    });
    inp.addEventListener("click", (e2) => e2.stopPropagation());
  }
  iHP.value  = String(Number.isFinite(hpVal)  ? hpVal  : 0);
  iMax.value = String(Number.isFinite(hpMaxV) ? hpMaxV : 0);

  let linkedHPMaxDelta = false;
  const syncLinkedHPMaxDelta = () => {
    if (!linkedHPMaxDelta) return;
    const relative = parseRelativeHPDelta(iHP.value);
    iMax.value = relative === null ? String(hpMaxV) : iHP.value.trim();
  };
  const setLinkedHPMaxDelta = (enabled) => {
    linkedHPMaxDelta = !!enabled;
    pill.__linkedHPMaxDelta = linkedHPMaxDelta;
    setHPDeltaButtonActive(linkedHPMaxDelta);
    iMax.readOnly = linkedHPMaxDelta;
    iMax.style.opacity = linkedHPMaxDelta ? ".72" : "1";
    if (linkedHPMaxDelta) syncLinkedHPMaxDelta();
    else iMax.value = String(hpMaxV);
  };
  iHP.addEventListener("input", syncLinkedHPMaxDelta);

  const slash = document.createElement("span");

    // --- NEW: select-all anche quando clicco direttamente dentro gli input ---
  // Se l'editor è aperto e clicco nell'input, impedisco il posizionamento del caret
  // e forzo focus+select: così "+5" / "-3" sostituiscono il valore intero.
  for (const inp of [iHP, iMax]) {
    inp.addEventListener("pointerdown", (pe) => {
      if (pill.dataset.hpEditing === "1" && __editingHPForId === e.id) {
        pe.preventDefault(); // evita che il browser posizioni il caret dove clicco
        // ignora eventuale click di scia che potrebbe far scattare il commit globale
        armDocClickIgnore(200);
        // seleziona tutto al frame successivo
        setTimeout(() => {
          try { inp.focus({ preventScroll: true }); inp.select(); } catch {}
        }, 0);
      }
      // NB: manteniamo lo stopPropagation già presente più sotto sugli input click
    }, { capture: true });
  }

  slash.textContent = "/";
  slash.style.opacity = ".8";
  slash.addEventListener("click", (e2) => e2.stopPropagation());

  const oldHTML = pill.innerHTML;
  pill.textContent = "";
  wrap.append(iHP, slash, iMax);
  pill.appendChild(wrap);

  pill.__iHP  = iHP;
  pill.__iMax = iMax;
  pill.__setLinkedHPMaxDelta = setLinkedHPMaxDelta;
  if (pill.dataset.hpOpenLinkedDelta === "1") {
    delete pill.dataset.hpOpenLinkedDelta;
    setLinkedHPMaxDelta(true);
  }

  // Commit se esci dalla pill (ma non quando vai tra iHP/iMax)
  wrap.addEventListener("focusout", () => {
    setTimeout(async () => {
      const ae = document.activeElement;
      if (!pill.contains(ae)) { await commit(); }
    }, 0);
  });

  // Focus SINCRONO su metà cliccata
  const r = pill.getBoundingClientRect();
  const clickedRightHalf = (ev.clientX - r.left) > (r.width / 2);
  (clickedRightHalf ? iMax : iHP).focus({ preventScroll: true });
  (clickedRightHalf ? iMax : iHP).select();

  // ✅ ora l’editor è stabile: sblocca i render
  setTimeout(() => { __suspendRenders = false; }, 0);

  // ---- commit/cancel + export verso closeOpenEditors()
  let committed = false;

  function cleanup() {
    try { document.removeEventListener("click", onDocClick, true); } catch {}
    __editingHPForId = null;
    delete pill.dataset.hpEditing;
        delete pill.__iHP;
    delete pill.__iMax;
    delete pill.__setLinkedHPMaxDelta;
    delete pill.__linkedHPMaxDelta;
    delete pill.__commitFn;
    delete pill.__cancelFn;
    setHPDeltaButtonActive(false);
    if (cardEl) {
      if (prevDraggable === null) cardEl.removeAttribute("draggable");
      else cardEl.setAttribute("draggable", prevDraggable);
    }
  }

  const commit = async () => {
    if (committed) return;
    committed = true;

    const vHP  = iHP.value.trim();
    const vMax = iMax.value.trim();

    let nextHP    = parseInlineMath(vHP,  hpVal);
    let nextHPMax = parseInlineMath(vMax, hpMaxV);

    const hpDelta = parseRelativeHPDelta(vHP);
    const hpMaxDelta = parseRelativeHPDelta(vMax);
    let multiUpdates = [];
    if (!linkedHPMaxDelta && (hpDelta !== null || hpMaxDelta !== null)) {
      try {
        const selected = await OBR.player.getSelection();
        const selectedIds = Array.from(new Set(Array.isArray(selected) ? selected : []));
        if (selectedIds.length > 1 && selectedIds.includes(e.id)) {
          const selectedItems = await OBR.scene.items.getItems(selectedIds);
          const trackedItems = selectedItems.filter((item) =>
            item.metadata?.[META_KEY]?.inInitiative === true
          );
          if (trackedItems.length > 1 && trackedItems.some((item) => item.id === e.id)) {
            multiUpdates = trackedItems.map((item) => {
              const meta = item.metadata?.[META_KEY] || {};
              const baseHP = Math.max(0, Math.floor(Number(meta.hp) || 0));
              const baseHPMax = Math.max(0, Math.floor(Number(meta.hpMax) || 0));
              return {
                itemId: item.id,
                hp: hpDelta === null ? baseHP : Math.max(0, baseHP + hpDelta),
                hpMax: hpMaxDelta === null ? baseHPMax : Math.max(0, baseHPMax + hpMaxDelta),
              };
            });
            const sourceUpdate = multiUpdates.find((update) => update.itemId === e.id);
            if (sourceUpdate) {
              nextHP = sourceUpdate.hp;
              nextHPMax = sourceUpdate.hpMax;
            }
          }
        }
      } catch (err) {
        console.warn("[hp] multi selection error:", err?.message || err);
      }
    }

    // ⬇️ NIENTE CLAMP: consentiamo HP > HP Max per modellare i Temp HP
    // (la barra resta clampata a 100% tramite pct)

    pill.innerHTML = formatHPHTML(nextHP, nextHPMax);  // <-- HTML con colore per temp
    const pct = nextHPMax > 0 ? Math.max(0, Math.min(1, nextHP / nextHPMax)) : 0;
    hpFill.style.width = (pct * 100) + "%";
    hpFill.style.background = hpColorByPct(pct);


    const isMultiTarget = multiUpdates.length > 1;
    const recalibratesMax = linkedHPMaxDelta && hpDelta !== null;
    let historyIds = isMultiTarget ? multiUpdates.map((update) => update.itemId) : [e.id];
    if (!isMultiTarget) {
      try {
        const group = await _getGroupForItemId(e.id);
        historyIds = Array.from(new Set([e.id, ...(group?.members || [])]));
      } catch {}
    }

    await withItemMetaHistory({
      kind: "hp",
      label: isMultiTarget
        ? (recalibratesMax ? "Ricalibrazione HP/Max multitarget" : "Modifica HP multitarget")
        : (recalibratesMax ? "Ricalibrazione HP/Max" : "Modifica HP"),
      itemIds: historyIds,
      fields: ["hp", "hpMax"],
    }, async () => {
      if (isMultiTarget) {
        await updateMultipleHP(multiUpdates);
      } else {
        await updateHP(e.id, nextHP, nextHPMax);
        try { await trySeedGroupHP(e.id, nextHP, nextHPMax); }
        catch (err) { console.warn("[hp] group seed error:", err?.message || err); }
      }
    });

    cleanup();
  };

  const cancel = () => {
    if (committed) return;
    committed = true;
    pill.innerHTML = oldHTML;
    cleanup();
  };

  const onDocClick = async (evt) => {
    if (Date.now() < __ignoreDocClickUntil) return; // 👈 ignora click di scia
    if (pill.contains(evt.target)) return;
    await commit();
  };
  document.addEventListener("click", onDocClick, true);

  pill.__commitFn = commit;
  pill.__cancelFn = cancel;

  // Commit e passa alla pill vicina (come nel tuo codice)
  const commitAndOpenNeighbor = async (goPrev = false) => {
    let targetId = null;
    const direction = goPrev ? -1 : 1;

    __suspendRenders = true;
    try {
      // fotografa ordine prima del commit
      let preOrder = [];
      try {
        const st = await getSceneState();
        preOrder = Array.isArray(st?.order) ? [...st.order] : [];
      } catch {}

      await commit();

      // trova vicino editabile
      const idx = preOrder.indexOf(e.id);
      if (idx >= 0) {
        let i = idx + direction;
        while (i >= 0 && i < preOrder.length) {
          const candId = preOrder[i];
          const cardEl2  = document.querySelector(`[data-item-id="${candId}"]`);
          const badgeEl2 = document.querySelector(`[data-badge="hp"][data-item-id="${candId}"]`);
          const collapsed = cardEl2?.dataset.groupCollapsed === "1";
          const isEpicAct = typeof isEpicActionId === "function" ? isEpicActionId(candId) : false;
          if (badgeEl2 && !collapsed && !isEpicAct) { targetId = candId; break; }
          i += direction;
        }
      }

      if (targetId) {
        requestAnimationFrame(() => {
          const nextEl = document.querySelector(
            `[data-badge="hp"][data-item-id="${targetId}"]`
          );
          if (nextEl) {
            // ignora il click che nasce dal nostro dispatch
            armDocClickIgnore(250);
            nextEl.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
            nextEl.scrollIntoView?.({ block: "center", inline: "nearest", behavior: "smooth" });
            requestAnimationFrame(() => { __suspendRenders = false; });
          } else {
            __suspendRenders = false;
          }
        });
      } else {
        __suspendRenders = false;
      }
    } catch (err) {
      __suspendRenders = false;
      throw err;
    }
  };

  // keymap
  const onKeyHP = async (ke) => {
    if (ke.key === "Enter")  {
      ke.preventDefault();
      if (ke.altKey) setLinkedHPMaxDelta(true);
      await commit();
      return;
    }
    if (ke.key === "Escape") { ke.preventDefault();  cancel();     return; }
    if (ke.key === "Tab") {
      ke.preventDefault();
      if (ke.shiftKey) { await commitAndOpenNeighbor(true); }
      else { iMax.focus({ preventScroll: true }); iMax.select(); }
    }
  };
  const onKeyMax = async (ke) => {
    if (ke.key === "Enter")  { ke.preventDefault(); await commit(); return; }
    if (ke.key === "Escape") { ke.preventDefault();  cancel();     return; }
    if (ke.key === "Tab") {
      ke.preventDefault();
      if (ke.shiftKey) { iHP.focus({ preventScroll: true }); iHP.select(); }
      else { await commitAndOpenNeighbor(false); }
    }
  };

  iHP.addEventListener("keydown", onKeyHP);
  iMax.addEventListener("keydown", onKeyMax);
});
}
}      return card;
    });

    track.replaceChildren(...nodes.filter(Boolean));

  if (__scrollActiveOnNextRender) {
    __scrollActiveOnNextRender = false;
    const active = track.querySelector('[data-active="1"]');
    active?.scrollIntoView?.({ behavior: "smooth", block: "center", inline: "nearest" });
  }

  __lastRenderedActiveId = currentActiveId;  // <-- ora esiste
}

async function ensureState() {
  const state = await getSceneState();
  if (state) return;
  const sorted = sortByInitiative(await getEntriesWithLair(null), null);
  await setSceneState({
    order: [...new Set(sorted.map(e => e.id))],
    current: 0,
    round: 1,
    seededGroups: {},
    collapsed: {},
    ui: {
    activeBadge: { x: 0.12, y: 0.60 }, // 12% da sinistra, 60% dall’alto
    tagsDock:    { x: 0.72, y: 0.50 }  // badge EPIC a destra, centrato
    }
  });
}

  function arraysEqual(a, b) {
    if (a === b) return true;
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;

  }
async function reconcileStateWithItems() {
  await __gcSeededGroups();
  await __backfillInitiativeForSeededGroups();  // ← NEW: backfill per nuovi membri

  const state   = await getSceneState();
  const entries = await getEntriesWithLair(state);

  if (!entries || entries.length === 0) {
    await resetTrackerState();
    return true;
  }

  const expanded = expandParagonEntries(entries, state);
  const sorted   = sortByInitiative(expanded, state);

// base: SOLO item reali (niente EPIC virtual qui)
  let newOrder = [...new Set(sorted.map(e => e.id))];

// Se ci sono Epic Boss, inserisci una voce virtuale dopo OGNI PG
  const byId = new Map(sorted.map(e => [e.id, e]));
  const epicBosses = sorted.filter(e => !!e.isEpic);
  if (epicBosses.length > 0) {
  const injected = [];
  for (let i = 0; i < newOrder.length; i++) {
    const id = newOrder[i];
    injected.push(id);

    const ent = byId.get(id);
    if (!ent) continue;
    // solo dopo i PG
    if (String(ent.attitude || "") !== "pc") continue;

    // per OGNI Epic Boss aggiungo una voce virtuale
    for (const boss of epicBosses) {
      const vId = `${EPIC_ACT_PREFIX}::${boss.id}::after::${id}`;
      injected.push(vId);
    }
  }
  newOrder = injected;
}

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
  const paragonInits = state?.paragonInits || {};
  await setSceneState({ order: newOrder, current: newCurrent, round, seededGroups, collapsed, paragonInits });
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
  const isTwenty = init === LAIR_INITIATIVE;
  const srcIsEpic = !!byId.get(sourceId)?.isEpic;
  // Mai muovere gli Epic
  if (isTwenty && srcIsEpic) return;
  if ((Number(dst.initiative) || 0) !== init) return;  // solo fra pari

  const curOrder = Array.isArray(st?.order) ? st.order.slice() : [];
  if (!curOrder.length) return;

  const isSameInit = (id) => (Number(byId.get(id)?.initiative) || 0) === init;
  const indices = curOrder.map((id, i) => (isSameInit(id) ? i : -1)).filter(i => i >= 0);
  if (!indices.length) return;

  const blockStart = Math.min(...indices);
  const blockEnd   = Math.max(...indices);
  const tieIds     = curOrder.slice(blockStart, blockEnd + 1);
  const pinnedCount = isTwenty ? tieIds.filter(id => !!byId.get(id)?.isEpic).length : 0;

  const srcIdx = tieIds.indexOf(sourceId);
  const dstIdx = tieIds.indexOf(targetId);
  if (srcIdx < 0 || dstIdx < 0) return;

  const cut = tieIds.splice(srcIdx, 1)[0];
  let insertAt = placeBefore ? dstIdx : (dstIdx + 1);
  if (dstIdx > srcIdx) insertAt -= 1;        // correzione indice dopo la rimozione
  // Non far passare avanti agli Epic a 20
  if (isTwenty && !byId.get(cut)?.isEpic && insertAt < pinnedCount) {
    insertAt = pinnedCount;
  }
  tieIds.splice(insertAt, 0, cut);

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
  const isTwenty = init === LAIR_INITIATIVE;
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
  const pinnedCount = isTwenty ? tieIds.filter(id => !!byId.get(id)?.isEpic).length : 0;

  // estrai le sorgenti (mantenendo l’ordine relativo)
  const srcSet = new Set(uniqSrc);
  const moving = tieIds.filter(id => srcSet.has(id));
  if (!moving.length) return;
  // Se il blocco contiene un Epic a 20, non si muove
  if (isTwenty && moving.some(id => !!byId.get(id)?.isEpic)) return;

  // rimuovi le sorgenti dal blocco
  const tieFiltered = tieIds.filter(id => !srcSet.has(id));

  // trova l’indice del target NEL blocco filtrato
  const dstIdx = tieFiltered.indexOf(targetId);
  if (dstIdx < 0) return;

  let insertAt = placeBefore ? dstIdx : (dstIdx + 1);
  if (isTwenty && insertAt < pinnedCount) insertAt = pinnedCount;
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
  const { members } = await _getGroupForItemId(sourceLeadId);
// Se nel gruppo c'è un Epic (a 20), non consentire lo spostamento del blocco
try {
const entries = await readEntries();
const byId = new Map(entries.map(e => [e.id, e]));
if ((members || []).some(id => !!byId.get(id)?.isEpic)) return;
} catch {}
  const ids = (members && members.length > 0) ? members : [sourceLeadId];
  await _reorderBlockWithinSameInitiative(ids, targetId, placeBefore);
}

  function sanitizeState(state, byId) {
  const seen = new Set();
  const cleanOrder = [];

  for (const id of state?.order ?? []) {
    if (!byId.has(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    cleanOrder.push(id);
  }

  if (cleanOrder.length === 0) {
    return { order: [], current: 0, round: 1, seededGroups: {}, collapsed: {}, paragonInits: {} };
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
  const paragonInits = (state && typeof state.paragonInits === "object" && state.paragonInits) || {};

  const ui = (state && typeof state.ui === "object" && state.ui) || {};
  return { order: cleanOrder, current, round, seededGroups, collapsed, paragonInits, ui };
}

async function renderAll() {
  if (__suspendRenders) return;
  const stateRaw = await getSceneState();
  // Gli snapshot intermedi di una raffica di click non devono ridisegnare
  // lista, fumetto o selezione sopra lo stato ottimistico più recente.
  if (__isStaleNavigationState(stateRaw)) return;
  const baseEntries  = await getEntriesWithLair(stateRaw);
  const entries = expandParagonEntries(baseEntries, stateRaw);

  // Costruisci le entry VIRTUALI EPIC corrispondenti all’ordine che inietteremo
  const epicBosses = entries.filter(e => !!e.isEpic);
  const pcs        = entries.filter(e => String(e.attitude || "") === "pc");
  const epicVirtuals = [];
  if (epicBosses.length > 0 && pcs.length > 0) {
  for (const pc of pcs) {
    for (const boss of epicBosses) {
      epicVirtuals.push(makeEpicActionEntry(boss, pc));
    }
  }
}

// byId deve conoscere anche le voci virtuali
const entriesWithVirtuals = entries.concat(epicVirtuals);
const byId = new Map(entriesWithVirtuals.map((e) => [e.id, e]));
__activeLabelEntriesById = byId;


  const stateClean = sanitizeState(stateRaw ?? { order: [], current: 0 }, byId);
  if (!__navigationPumpRunning && !__navigationDesiredState) {
    __latestInitiativeState = stateClean;
  }
  zoomChk.checked = isAutoFocusEnabled(stateClean);

    try {
  const lbl = document.getElementById("tbp-round-label");
  if (lbl) lbl.textContent = `Round ${Math.max(1, stateClean.round || 1)}`;

  const cnt = document.getElementById("tbp-turn-counter");
  const sep = roundPill.querySelector("span:nth-child(2)"); // il puntino "•"

  const tot = Array.isArray(stateClean.order) ? stateClean.order.length : 0;
  const cur = Math.max(0, Math.min(tot, (stateClean.current ?? 0) + 1));

  if (cnt && sep) {
    if (tot > 0) {
      cnt.textContent = `${cur}/${tot}`;
      cnt.style.display = "";
      sep.style.display = "";
    } else {
      // niente partecipanti → nascondi contatore e separatore
      cnt.style.display = "none";
      sep.style.display = "none";
    }
  }
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
    const activeIdNow = stateClean.order[stateClean.current];
    // === Active Turn Label: risolvi l'ancora e aggiorna/crea la label ===
try {
  syncActiveTurnLabel(activeIdNow);
} catch (err) {
  console.warn("[active-label] upsert error:", err?.message || err);
}

    const animateActive = (activeIdNow !== __prevActiveId);

    renderTrack(ordered, stateClean, { animateActive });  // <-- passa il flag

    __prevActiveId = activeIdNow; // aggiorna per il prossimo render
  }

  OBR.onReady(async () => {
    try {
      const role =
        (await OBR.player?.getRole?.()) ||
        (await OBR.room?.getRole?.()) ||
        "PLAYER";
      IS_GM = String(role).toUpperCase() === "GM";
      // Mostra il toggle Tana solo al GM (e nascondilo a tutti gli altri)
try {
  const hasBtn = !!roundPill.querySelector('[data-reset-round="1"]');
  const hasClearBtn = !!roundPill.querySelector('[data-clear-initiative="1"]');
  const hasHistoryBtn = !!roundPill.querySelector('[data-history="1"]');
  if (IS_GM) {
    if (!hasBtn) roundPill.appendChild(makeRoundResetBtn());
    if (!hasClearBtn) roundPill.appendChild(makeClearInitiativeBtn());
    if (!hasHistoryBtn) roundPill.appendChild(makeHistoryBtn());
  } else {
    if (hasBtn) roundPill.querySelector('[data-reset-round="1"]').remove();
    if (hasClearBtn) roundPill.querySelector('[data-clear-initiative="1"]').remove();
    if (hasHistoryBtn) roundPill.querySelector('[data-history="1"]').remove();
  }
} catch {}

try {
  if (IS_GM) {
    if (!lairToggleWrap.isConnected) {
      // inserisci il toggle tra la pill “Turno” e la lista
      if (IS_GM) {
  if (!lairToggleWrap.isConnected) topRow.appendChild(lairToggleWrap);
} else {
  if (lairToggleWrap.isConnected) lairToggleWrap.remove();
}
    }
  } else {
    if (lairToggleWrap.isConnected) lairToggleWrap.remove();
  }
} catch {}

    } catch {
      IS_GM = false;
    }
    try {
} catch (e) {
  console.error("[hpbar] mount error", e?.error?.message || e?.message || e);
}
  await mountHPBars();
  if (IS_GM) await mountMovementHistoryWatcher();
  await ensureState();
  await reconcileStateWithItems();
  await enforceUniqueNamePrefixes();
  await renderAll();
  __lastConditionTurnState = __conditionTurnStateSnapshot(__latestInitiativeState);

  if (IS_GM) {
    try {
      const { syncHPBarNow } = await import("./hpbar-items.js");
      const st = await getSceneState();
      const entries = await getEntriesWithLair(st);
      for (const e of entries) {
      if (isLairId(e.id)) continue; // la Tana non ha HP
  syncHPBarNow(e.id, e.hp ?? 0, e.hpMax ?? 0);
}

    } catch (err) {
      console.warn("[hpbar] boot sync error", err);
    }
  }
});

  let __lastActiveId = null;

OBR.scene.onMetadataChange(async (meta) => {
  const st = meta?.[STATE_KEY];
  if (__isStaleNavigationState(st)) return;

  let conditionTransition = null;
  if (st && Array.isArray(st.order) && st.order.length > 0) {
    const previousTurnState = __lastConditionTurnState;
    const nextTurnState = __conditionTurnStateSnapshot(st);
    const directionHint = __conditionDirectionHintFor(st);
    const boundaries = __forwardConditionTurnBoundaries(previousTurnState, nextTurnState, directionHint);
    __lastConditionTurnState = nextTurnState;
    conditionTransition = { previousTurnState, nextTurnState, boundaries };
  } else {
    __lastConditionTurnState = null;
    __conditionNavigationHint = null;
  }

  await renderAll(); // ridisegna UI
  if (!st || !Array.isArray(st.order) || st.order.length === 0) return;

  const activeId = st.order[st.current];

// --- Tick incantesimi/condizioni per ROUND (con direzione) ---
try {
  const roundNow = Math.max(1, Number(st.round || 1));
  if (__lastRoundSeen == null) {
    __lastRoundSeen = roundNow; // prima inizializzazione: niente tick
  } else if (roundNow !== __lastRoundSeen) {
    const delta = __lastRoundSeen - roundNow;

    const tokenIds = (Array.isArray(st.order) ? st.order : [])
      .map(id => (typeof splitParagonId === "function" ? splitParagonId(id).baseId : id))
      .filter(id => id && !isLairId(id) && !isEpicActionId(id));
    const unique = Array.from(new Set(tokenIds));

    await adjustSpellsForItems(unique, delta);
    await adjustConditionDurationsForItems(unique, delta);
    __lastRoundSeen = roundNow;
  }
} catch (err) {
  console.warn("[effects] tick round error:", err);
}

try {
  const { previousTurnState, nextTurnState, boundaries = [] } = conditionTransition || {};
  if (IS_GM && boundaries.length) {
    const run = async () => {
      const tokenIds = Array.from(new Set(
        [...(previousTurnState?.order || []), ...(nextTurnState?.order || [])]
          .map(__conditionActorId)
          .filter(Boolean)
      ));
      await withItemMetaHistory({
        kind: "condition",
        label: "Scadenza condizioni di turno",
        itemIds: tokenIds,
        fields: ["conditions"],
      }, () => advanceConditionTurnBoundariesForItems(tokenIds, boundaries));
    };
    __conditionTurnQueue = __conditionTurnQueue.then(run, run);
    await __conditionTurnQueue;
  }
} catch (err) {
  console.warn("[conditions] tick turn boundary error:", err?.message || err);
}

  if (!activeId || activeId === __lastActiveId) return;
  __lastActiveId = activeId;

  // Reset delle azioni leggendarie a inizio turno della creatura attiva
  // Se è la Tana, niente reset legend e niente focus su scena
if (!isLairId(activeId) && !isEpicActionId(activeId)) {
  try { await resetLegendaryIfAny(activeId); }
  catch (e) { console.warn("[legendary] reset on turn:", e?.message || e); }

  queueSelectAndFocus(activeId, isAutoFocusEnabled(st));
}
  try {
    const roundNow = Math.max(1, Number(st.round || 1));
  if (__lastRoundSeen == null) {
    __lastRoundSeen = roundNow; // prima inizializzazione → niente tick
  } else if (roundNow !== __lastRoundSeen) {
    // scala di 1 tutti i token in iniziativa (usa id base per paragon)
    const tokenIds = (Array.isArray(st.order) ? st.order : [])
      .map(id => (splitParagonId ? splitParagonId(id).baseId : id))
      .filter(Boolean);
    const unique = Array.from(new Set(tokenIds));
    await tickSpellsForItems(unique);
    __lastRoundSeen = roundNow;
  }
} catch (err) {
  console.warn("[spells] tick round error:", err);
}

  try {
    const entriesNow = await readEntries();
    await __applyAutoCollapse(entriesNow, st); // espandi gruppo attivo, collassa altri
    await renderAll();                         // ridisegna per evitare flicker
  } catch (e) {
    console.warn("[initiative] auto-collapse on turn change:", e?.message || e);
  }
});

  OBR.scene.items.onChange(async (changes = []) => {
    if (__mutatingActiveLabel > 0 || isOnlyActiveTurnLabelChange(changes)) return;
    await reconcileStateWithItems();
    await enforceUniqueNamePrefixes();
    await renderAll();
  });

  // ——— Auto-ripristino HP quando cambia qualcosa tra gli item della scena
// (nuovi token, nome/ritratto cambiati, metadata azzerati, ecc.)
try {
  OBR.scene.items.onChange((changes = []) => {
    if (isOnlyActiveTurnLabelChange(changes)) return;
    scheduleHPMemoryAutofill(150); // 150ms debounce
  });
} catch (e) {
  console.warn("[hpMemory] onChange subscribe failed", e);
}

    btnPrev.addEventListener("click", async () => {
    const st = __latestInitiativeState || await getSceneState();
    if (!st || !st.order || st.order.length === 0) return;
    const len = st.order.length;

    const prevIdx = (st.current - 1 + len) % len;
    const wrapped = prevIdx === (len - 1);                      // ritorno a fine
    const nextRound = Math.max(1, (st.round || 1) - (wrapped ? 1 : 0));

    const next = { ...st, current: prevIdx, round: nextRound };
    __latestInitiativeState = next;
    const activeId = next.order[next.current];
    __conditionNavigationHint = { activeId, current: prevIdx, round: nextRound, direction: -1 };
    const revision = ++__navigationRevision;
    __lastNavigationAt = Date.now();
    __scrollActiveOnNextRender = true;

    queueNavigationState(next);
    try { delete document.__tbpZoomStamp; } catch {}

    try {
    const entriesNow = await readEntries();
    if (revision !== __navigationRevision) return;
    await __applyAutoCollapse(entriesNow, next);
    } catch {}

    if (revision !== __navigationRevision) return;
    if (activeId && !isLairId(activeId)) {
      queueSelectAndFocus(activeId, isAutoFocusEnabled(next));
    }

    handoffFocusToCanvas?.();
    armArrowProxy?.();
  });

  btnNext.addEventListener("click", async () => {
    const st = __latestInitiativeState || await getSceneState();
    if (!st || !st.order || st.order.length === 0) return;
    const len = st.order.length;

    const nextIdx = (st.current + 1) % len;
    const wrapped = nextIdx === 0;                              // ritorno a inizio
    const nextRound = Math.max(1, (st.round || 1) + (wrapped ? 1 : 0));

    const next = { ...st, current: nextIdx, round: nextRound };
    __latestInitiativeState = next;
    const activeId = next.order[next.current];
    __conditionNavigationHint = { activeId, current: nextIdx, round: nextRound, direction: 1 };
    const revision = ++__navigationRevision;
    __lastNavigationAt = Date.now();
    __scrollActiveOnNextRender = true;

    queueNavigationState(next);
    try { delete document.__tbpZoomStamp; } catch {}

    try {
    const entriesNow = await readEntries();
    if (revision !== __navigationRevision) return;
    await __applyAutoCollapse(entriesNow, next);
    } catch {}

    if (revision !== __navigationRevision) return;
    if (activeId && !isLairId(activeId)) {
      queueSelectAndFocus(activeId, isAutoFocusEnabled(next));
    }

    handoffFocusToCanvas?.();
    armArrowProxy?.();
  });

}
