import OBR, { buildLabel } from "@owlbear-rodeo/sdk";
import { ID, ACTIVE_TURN_LABEL_META, TRACKER_PANEL_REQUEST_CHANNEL } from "./constants.js";
import { mountHPBars, syncHPBarNow, syncHPTextNow } from "./hpbar-items.js";
import { applyHPMemoryToSceneForMissingHP, saveHPToMemoryByItemId, scheduleHPMemoryAutofill } from "./hpMemory.js";
import { buildConditionChips, refreshConditionLabels, adjustConditionDurationsForItems, advanceConditionTurnBoundariesForItems, CONDITION_LIST as EFFECT_CONDITIONS, formatConditionName, formatConditionInstance, getEffectiveConditionInstances } from "./conditions";
import { buildSpellChips, getSpellsFromItem, adjustSpellsForItems } from "./spells.js";
import { commitEffectsMutationPlan, prepareEffectsMutation } from "./effectsMutations.js";
import { withItemMetaHistory, mountMovementHistoryWatcher, subscribeMovementSegments } from "./history.js";
import { recordCombatTurn } from "./combatLog.js";
import { adjustSpeedCheckBonus, adjustSpeedCheckDash, enableSpeedCheckProcessor, mountSpeedCheckStateBroadcast, mountSpeedWarningBroadcast, queueSpeedCheckMovements, resetSpeedCheckMovement, setSpeedCheckEnabled, setSpeedCheckMovementLimit, subscribeSpeedCheckState, syncSpeedCheckTurn } from "./speedCheck.js";
import { subscribeSceneItemChanges } from "./sceneItemEvents.js";
import { buildTurnNoticePayload } from "./turnNotice.js";
import {
  getZeroHPConditionHistoryIds,
  reconcileZeroHPConditionsForItems,
} from "./hpConditionAutomation.js";
import {
  TRACKER_LAYOUT_CHANNEL,
  TRACKER_LAYOUT_CLASSIC,
  TRACKER_LAYOUT_COMPACT,
  TRACKER_POPOVER_ID,
  getCompactTrackerPopoverAnchor,
  getTrackerLayout,
  setTrackerLayout,
} from "./trackerPopover.js";
import {
  FACTION_CONFIGURATOR_ID,
  readFactionRegistry,
  rememberFactionForIds,
  registeredAttitudeForItem,
} from "./factionRegistry.js";
import {
  INITIATIVE_GROUP_SEPARATOR as __GROUP_SEP,
  __autoCollapseSnapshot,
  __buildGroups,
  __groupKey,
  _indexName,
  _parseIndexedName,
  compactEntriesForRender,
  expandParagonEntries,
  reorderBlockWithinSameInitiativeState,
  reorderWithinSameInitiativeState,
  sanitizeState,
  sortByInitiative,
} from "./initiativeOrderCore.js";
import {
  advanceInitiativeState,
  createSerialProcessor,
  initiativeStateDigest,
  isCurrentRenderRevision,
} from "./initiativeRenderCore.js";

  // Configurazione condizioni per tag card
export const CONDITIONS = [
  "Accecato", "Affascinato", "Afferrato", "Assordato", "Avvelenato",
  "Incapacitato", "Invisibile", "Paralizzato", "Pietrificato", "Privo di sensi",
  "Prono", "Spaventato", "Stordito", "Trattenuto", "Indebolimento", "Concentrazione", "Ira", "Giuramento di Inimicizia"
];
// — Dock condizioni (chip) sulla card
const COND_DOCK_CFG = {
  top: -6,                 // px dall’alto dell’header
  rightFromBadge: 0,   // ← non servirà più
  leftFromContent: -5
};
  const STATE_KEY = `${ID}/state`;
  const META_KEY  = `${ID}/meta`;
  const SPELLS_META_KEY = `${ID}/spells`;
  const CONC_META_KEY = `${ID}/concentration`; // { [spellKey]: { targets: [...] } }
  const CONCENTRATION_WARNING_CHANNEL = `${ID}/concentration-warning`;
  const CONCENTRATION_WARNING_MODAL_ID = `${ID}/concentration-warning-modal`;
  const TURN_NOTICE_CHANNEL = ID + "/turn-notice";
  const TURN_NOTICE_MODAL_ID = ID + "/turn-notice-modal";
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
  
  const FOCUS_MIN_PAD_PX = 64;
  const FOCUS_GRID_SPAN = 10; // Campo visivo fisso, indipendente dalle dimensioni token
  const FOCUS_FALLBACK_DPI = 150;
  const ARROW_PROXY_WINDOW_MS = 2000
  // ===== LAIR ACTIONS =====
  const LAIR_ID          = "__LAIR__";
  const LAIR_NAME        = "Azioni di Tana";
  const LAIR_INITIATIVE  = 20;
  const LAIR_PORTRAIT = "/lair-actions.svg";

  const BADGE_SIZE  = 36; // diametro del badge iniziativa (px)
  const BADGE_RIGHT = 8; // distanza del badge dal bordo destro (px)

  // --- Active Turn Label (ancorata al token attivo)
  const ACTIVE_LABEL_META = ACTIVE_TURN_LABEL_META;
  const ACTIVE_LABEL_TEXT_FMT = (nameBase) => `Turno di ${nameBase}`;
  const ACTIVE_LABEL_FONT = 22;
  const ACTIVE_LABEL_HEIGHT = 32;
  const ACTIVE_LABEL_MAX_WIDTH = 312;
  const ACTIVE_LABEL_BG = "#b91c1c";
  const ACTIVE_LABEL_BG_OPACITY = 0.94;
  const ACTIVE_LABEL_MAX_VIEW_SCALE = 1.35;
  const ACTIVE_LABEL_GAP_PX = 9;
  const ACTIVE_LABEL_POINTER_WIDTH = 14;
  const ACTIVE_LABEL_POINTER_HEIGHT = 10;

  // === EPIC ACTIONS (voci virtuali in lista) ===
  const EPIC_ACT_PREFIX = "__EPIC__";

  // --- Fallback chips condizioni (se conditions.js lancia)
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

  // se custom è oggetto (vecchi dump), usa le chiavi truthy
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
let __activeTurnLabelRetryTimer = null;
let __navigationDesiredState = null;
let __navigationPumpRunning = false;
let __navigationFlushTimer = null;
let __navigationDesiredAt = 0;
let __navigationRevision = 0;
let __lastNavigationAt = 0;
let __renderRequestRevision = 0;
let __latestAcceptedRenderRevision = 0;
let __lastInitiativeMetadataDigest;
let __lastQueuedInitiativeMetadataDigest;
const __initiativeMetadataProcessor = createSerialProcessor();
let __initiativeMetadataRevision = 0;
let __optimisticNavigationDigest = null;
let __lastActiveId = null;
let __lastConditionTurnState = null;
let __conditionNavigationHint = null;
let __conditionTurnQueue = Promise.resolve();
let __roundEffectQueue = Promise.resolve();
let __selectedSceneItemIds = new Set();
let __playerSelectionUnsubscribe = null;
let __playerSelectionPollTimer = null;
let __playerSelectionPollBusy = false;
const NAVIGATION_STALE_GRACE_MS = 500;
const NAVIGATION_WRITE_SETTLE_MS = 60;
const INITIATIVE_DIAGNOSTICS_STORAGE_KEY = `${ID}/initiative-diagnostics`;
const INITIATIVE_DIAGNOSTICS_MAX_EVENTS = 500;
const __initiativeDiagnosticEvents = [];
let __initiativeDiagnosticSequence = 0;
let __initiativeDiagnosticsEnabled = (() => {
  try { return window.localStorage.getItem(INITIATIVE_DIAGNOSTICS_STORAGE_KEY) === "1"; }
  catch { return false; }
})();

function __initiativeDiag(event, detail = {}) {
  if (!__initiativeDiagnosticsEnabled) return;
  const entry = {
    seq: ++__initiativeDiagnosticSequence,
    ms: Math.round(performance.now()),
    event,
    ...detail,
  };
  __initiativeDiagnosticEvents.push(entry);
  if (__initiativeDiagnosticEvents.length > INITIATIVE_DIAGNOSTICS_MAX_EVENTS) {
    __initiativeDiagnosticEvents.splice(0, __initiativeDiagnosticEvents.length - INITIATIVE_DIAGNOSTICS_MAX_EVENTS);
  }
  console.debug("[initiative-diag]", entry);
}

globalThis.__tbpInitiativeDiagnostics = {
  enable() {
    __initiativeDiagnosticsEnabled = true;
    try { window.localStorage.setItem(INITIATIVE_DIAGNOSTICS_STORAGE_KEY, "1"); } catch {}
    __initiativeDiag("diagnostics:enabled");
    return "Diagnostica iniziativa attiva";
  },
  disable() {
    __initiativeDiag("diagnostics:disabled");
    __initiativeDiagnosticsEnabled = false;
    try { window.localStorage.removeItem(INITIATIVE_DIAGNOSTICS_STORAGE_KEY); } catch {}
    return "Diagnostica iniziativa disattivata";
  },
  clear() {
    __initiativeDiagnosticEvents.length = 0;
    __initiativeDiagnosticSequence = 0;
    return "Eventi diagnostici cancellati";
  },
  dump() {
    return __initiativeDiagnosticEvents.map((entry) => ({ ...entry }));
  },
  summary() {
    const counts = {};
    for (const entry of __initiativeDiagnosticEvents) {
      counts[entry.event] = (counts[entry.event] || 0) + 1;
    }
    const first = __initiativeDiagnosticEvents[0];
    const last = __initiativeDiagnosticEvents[__initiativeDiagnosticEvents.length - 1];
    return {
      events: __initiativeDiagnosticEvents.length,
      durationMs: first && last ? last.ms - first.ms : 0,
      counts,
      lastEvent: last ? { ...last } : null,
    };
  },
  table() {
    console.table(__initiativeDiagnosticEvents);
    return __initiativeDiagnosticEvents.length;
  },
};


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
    __activeTurnLabelInitialized = false;
    __activeTurnLabel = null;
    console.warn("[activeLabel] global init failed:", e?.message || e);
    throw e;
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

// Mantiene sincronizzati il nome interno del token e la label nativa mostrata
// sotto l'immagine da Owlbear Rodeo, senza modificare lo stile del testo.
function __setSceneTokenDisplayName(item, nextName) {
  if (!item) return;
  item.name = nextName;
  if (item.type !== "IMAGE" || !item.text || typeof item.text !== "object") return;
  item.text = {
    ...item.text,
    plainText: nextName,
    richText: [
      {
        type: "paragraph",
        children: [{ text: nextName }],
      },
    ],
  };
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
  extraHeight: 28,       // modulo boss da 88px, cornice estesa compresa
  zIndex: 6,            // per sovrapporsi leggermente alle altre
  shadow: "0 0 10px rgba(255, 0, 0, 0.8)" // alone leggero dorato
};

const BOSS_PORTRAIT_FRAME_SRC = "/boss-frame-ui.png";
const BOSS_PORTRAIT_FRAME_SCALE = 1.38;
const BOSS_PORTRAIT_FRAME_SCALE_COMPACT = 1.3;
const BOSS_PORTRAIT_FRAME_MASK = "radial-gradient(circle at 50% 50%, transparent 0 43%, #000 44%)";

// --- ZOOM CONFIG GLOBALE ---
const ZOOM_CFG = {
  scale: 1.035,                                   // enfasi attiva senza invadere le card adiacenti
  dur:   500,                                      // ms
  ease:  "cubic-bezier(.16,.84,.22,1)"             // easing morbido
};

function __applyZoomTransition(el) {
  const dur = ZOOM_CFG.dur;
  // NB: box-shadow un filo più corto, height come prima
  el.style.transition = `transform ${dur}ms ${ZOOM_CFG.ease}, scale ${dur}ms ${ZOOM_CFG.ease}, box-shadow ${Math.max(120, dur - 40)}ms ease, height .15s ease`;
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
  gap: 2,                    // tra i singoli pips
  paddingX: 0,
  paddingY: 0,
  size: 7,                  // lato del diamante/circolo
  diamond: true              // true=♦, false=●
};

const LEG_RESOURCE_CFG = {
  top: 31,
  clusterGap: 3,
  controlWidth: 14,
  controlHeight: 10,
};

const DEFAULT_LEGENDARY_RESISTANCES = 3;

// --- Paragon controls: stessa posizione/stile dei Legendary (+/-)
const PAR_CTRL_CFG = {
  top: -8,
  right: null,            // se null → usa rightFromBadge come i Legendary
  rightFromBadge: 105,    // identico ai Legendary; se vuoi più vicino al badge, riduci
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
  posBoss:   { top: -6, right: null, rightFromBadge: 100, gap: 6, reserve: 120 },
  posAction: { top: -6, right: null, rightFromBadge: 115, gap: 6, reserve: 120 },

  // Stile delle pill
  epic: {
    label: "Boss Epico",
    fontSize: 12, fontWeight: 700, padX: 6, padY: 2, radius: 999,
    bg: "rgba(255, 0, 0, 1)", color: "#fff",
    border: "1px solid rgba(0, 0, 0, 1)", letterSpacing: .2
  },
  action: {
    label: "Azione Epica",
    fontSize: 9, fontWeight: 500, padX: 8, padY: 2, radius: 999,
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
  let __trackerLayout = getTrackerLayout();

  function isCompactTrackerLayout() {
    return __trackerLayout === TRACKER_LAYOUT_COMPACT;
  }


  export function mountInitiativeList(container) {
    if (container.__initiativeMounted) return;   // ← evita montaggi doppi
    container.__initiativeMounted = true;
    const styleTag = document.createElement("style");
styleTag.textContent = `
  :root, body { height: 100%; overflow: hidden; }
  .tbp-root {
    font-family: var(--obrt-font-ui, "Helvetica Neue", Helvetica, Arial, sans-serif);
    font-feature-settings: "kern" 1, "liga" 1;
  }
  .tbp-root button, .tbp-root input, .tbp-root textarea, .tbp-root select {
    font-family: inherit;
  }
  .tbp-root, .tbp-root *:not(input):not(textarea):not([contenteditable="true"]) {
    -webkit-user-select: none;
    user-select: none;
  }
`;
document.head.appendChild(styleTag);

container.classList.add("tbp-root");
container.style.height = "100%";
container.style.overflow = "hidden";

container.addEventListener("mousedown", (e) => {
  if (__editingHPForId || __editingInitForId) return;

  const t = e.target;
  if (t.closest('[data-item-id]') || t.closest('[draggable="true"]')) return;

  const interactive = t.closest("input, textarea, [contenteditable='true'], button, [role='button']");
  if (!interactive) {
    e.preventDefault();
    try { window.getSelection?.().removeAllRanges?.(); } catch {}
  }
}, { capture: true });

const col = document.createElement("div");
col.style.display = "flex";
col.style.flexDirection = "column";
col.style.alignItems = "stretch";
col.style.gap = "8px";
col.style.height = "100%";
col.style.overflow = "hidden";
container.replaceChildren(col);

function mkBtn(txt) {
  const b = document.createElement("button");
  b.textContent = txt;
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
  b.addEventListener("mousedown", (event) => event.preventDefault());
  b.style.outline = "none";
  b.onmouseenter = () => (b.style.background = "rgba(255,255,255,0.08)");
  b.onmouseleave = () => (b.style.background = "transparent");
  return b;
}

const btnPrev = mkBtn("\u25B2");
const btnNext = mkBtn("\u25BC");

// pill “Turno N”
const roundPill = document.createElement("div");
roundPill.title = "Numero di turni (scatta quando l'iniziativa avanza e ritorna all'inizio)";
Object.assign(roundPill.style, {
  alignSelf: "center",
  width: "calc(100% - 16px)",
  maxWidth: "460px",
  minHeight: "52px",
  boxSizing: "border-box",
  padding: "8px 12px",
  fontSize: "12px",
  fontWeight: "500",
  lineHeight: "1",
  color: "#fff",
  background: "linear-gradient(180deg, rgba(14,19,31,.82), rgba(8,12,21,.76))",
  border: "1px solid rgba(148,163,184,.28)",
  borderRadius: "18px",
  boxShadow: "0 8px 22px rgba(0,0,0,.24), inset 0 1px 0 rgba(255,255,255,.05)",
  userSelect: "none",
  display: "inline-flex",
  alignItems: "center",
  gap: "7px",
});

const roundStatus = document.createElement("div");
Object.assign(roundStatus.style, {
  flex: "1 1 120px",
  minWidth: "120px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "7px",
});

const roundLabel = document.createElement("span");
roundLabel.id = "tbp-round-label";
Object.assign(roundLabel.style, {
  flex: "0 0 auto",
  overflow: "visible",
  whiteSpace: "nowrap",
  fontSize: "15px",
  fontWeight: "700",
});

const roundResetSlot = document.createElement("div");
Object.assign(roundResetSlot.style, {
  display: "inline-flex",
  alignItems: "center",
  paddingRight: "7px",
  borderRight: "1px solid rgba(148,163,184,.22)",
});


roundStatus.append(roundLabel);
roundPill.appendChild(roundStatus);
const trackerDragHandle = document.createElement("button");
trackerDragHandle.type = "button";
trackerDragHandle.draggable = true;
trackerDragHandle.textContent = "\u2630";
trackerDragHandle.title = "Trascina per spostare il tracker. Doppio click per ricentrare";
trackerDragHandle.setAttribute("aria-label", trackerDragHandle.title);
Object.assign(trackerDragHandle.style, {
  flex: "0 0 auto",
  width: "28px",
  height: "28px",
  display: "none",
  alignItems: "center",
  justifyContent: "center",
  padding: "0",
  border: "1px solid rgba(148,163,184,.28)",
  borderRadius: "8px",
  background: "rgba(0,0,0,.34)",
  color: "rgba(255,255,255,.82)",
  fontSize: "15px",
  lineHeight: "1",
  cursor: "grab",
  touchAction: "none",
});

let __compactDragStart = null;
trackerDragHandle.addEventListener("dragstart", (event) => {
  if (!isCompactTrackerLayout()) {
    event.preventDefault();
    return;
  }
  event.stopPropagation();
  const rect = col.getBoundingClientRect();
  __compactDragStart = {
    x: Number.isFinite(event.screenX) ? event.screenX : event.clientX,
    y: Number.isFinite(event.screenY) ? event.screenY : event.clientY,
  };
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", "initiative-tracker");
  event.dataTransfer.setDragImage(
    col,
    Math.max(0, event.clientX - rect.left),
    Math.max(0, event.clientY - rect.top),
  );
  trackerDragHandle.style.cursor = "grabbing";
});
trackerDragHandle.addEventListener("dragend", (event) => {
  if (!__compactDragStart) return;
  event.stopPropagation();
  const endX = Number.isFinite(event.screenX) ? event.screenX : event.clientX;
  const endY = Number.isFinite(event.screenY) ? event.screenY : event.clientY;
  const deltaX = endX - __compactDragStart.x;
  const deltaY = endY - __compactDragStart.y;
  __compactDragStart = null;
  trackerDragHandle.style.cursor = "grab";
  if (!Number.isFinite(endX) || !Number.isFinite(endY)) return;
  if (Math.abs(deltaX) + Math.abs(deltaY) < 4) return;
  void OBR.broadcast.sendMessage(TRACKER_LAYOUT_CHANNEL, {
    type: "tracker-position-change",
    deltaX,
    deltaY,
  }, { destination: "LOCAL" });
});
trackerDragHandle.addEventListener("dblclick", (event) => {
  if (!isCompactTrackerLayout()) return;
  event.preventDefault();
  event.stopPropagation();
  void OBR.broadcast.sendMessage(TRACKER_LAYOUT_CHANNEL, {
    type: "tracker-position-reset",
  }, { destination: "LOCAL" });
});

roundPill.appendChild(trackerDragHandle);


const layoutToggleButton = document.createElement("button");
layoutToggleButton.type = "button";
layoutToggleButton.dataset.layoutToggle = "1";
Object.assign(layoutToggleButton.style, {
  flex: "0 0 auto",
  width: "28px",
  height: "28px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0",
  border: "1px solid rgba(148,163,184,.28)",
  borderRadius: "8px",
  background: "rgba(0,0,0,.34)",
  color: "#fff",
  fontSize: "16px",
  lineHeight: "1",
  cursor: "pointer",
});

const layoutToggleIcon = document.createElement("img");
layoutToggleIcon.alt = "";
layoutToggleIcon.setAttribute("aria-hidden", "true");
Object.assign(layoutToggleIcon.style, {
  width: "18px",
  height: "18px",
  display: "block",
  objectFit: "contain",
  pointerEvents: "none",
});
const layoutToggleCaption = document.createElement("span");
layoutToggleCaption.dataset.layoutToggleCaption = "1";
layoutToggleCaption.setAttribute("aria-hidden", "true");
Object.assign(layoutToggleCaption.style, {
  display: "inline",
  pointerEvents: "none",
  whiteSpace: "nowrap",
  fontSize: "10px",
  fontWeight: "700",
  lineHeight: "1",
});
layoutToggleButton.append(layoutToggleIcon, layoutToggleCaption);

function updateLayoutToggleButton() {
  const compact = isCompactTrackerLayout();
  trackerDragHandle.style.display = compact ? "inline-flex" : "none";
  layoutToggleIcon.src = compact
    ? "/modalita-estesa.svg"
    : "/modalita-compatta.svg";
  layoutToggleButton.title = compact
    ? "Passa alla modalità estesa"
    : "Passa alla modalità compatta";
  layoutToggleButton.setAttribute("aria-label", layoutToggleButton.title);
  layoutToggleButton.setAttribute("aria-pressed", String(compact));
  layoutToggleCaption.textContent = compact ? "Estesa" : "Compatta";
  layoutToggleCaption.style.display = compact ? "none" : "inline";
}

layoutToggleButton.addEventListener("click", (event) => {
  event.stopPropagation();
  void __closeCompactEffectsPopover();
  __trackerLayout = isCompactTrackerLayout()
    ? TRACKER_LAYOUT_CLASSIC
    : TRACKER_LAYOUT_COMPACT;
  updateLayoutToggleButton();
  applyTrackerLayout();
  void renderAll();
  void setTrackerLayout(__trackerLayout).catch((error) => {
    console.warn("[tracker-layout] salvataggio fallito:", error?.message || error);
  });
});

roundPill.appendChild(layoutToggleButton);
updateLayoutToggleButton();
const roundActions = document.createElement("div");
roundActions.dataset.roundActions = "1";
Object.assign(roundActions.style, {
  display: "inline-flex",
  alignItems: "center",
  gap: "3px",
});

const roundHistorySlot = document.createElement("div");
Object.assign(roundHistorySlot.style, {
  display: "inline-flex",
  alignItems: "center",
  paddingLeft: "7px",
  borderLeft: "1px solid rgba(148,163,184,.22)",
});

// ⬇️ NUOVO: bottone reset turno (solo GM)
function makeRoundResetBtn() {
  const b = document.createElement("button");
  b.type = "button";
  b.dataset.resetRound = "1";
  b.title = "Resetta il round a 1 (solo GM)";
  b.textContent = "↺";
  Object.assign(b.style, {
    width: "24px",
    height: "24px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid rgba(255,255,255,.18)",
    background: "rgba(0,0,0,.45)",
    color: "#fff",
    fontSize: "12px",
    fontWeight: "700",
    lineHeight: "1",
    borderRadius: "8px",
    cursor: "pointer",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.08)",
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

function makeAddAllInitiativeBtn() {
  const b = document.createElement("button");
  b.type = "button";
  b.dataset.addAllInitiative = "1";
  b.title = "Aggiungi tutti i token della scena all'iniziativa (solo GM)";
  b.textContent = "+";
  Object.assign(b.style, {
    width: "24px",
    height: "24px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid rgba(74,222,128,.68)",
    background: "rgba(21,128,61,.62)",
    color: "#fff",
    fontSize: "15px",
    fontWeight: "700",
    lineHeight: "1",
    borderRadius: "8px",
    cursor: "pointer",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.08)",
    padding: "0 0 2px",
  });
  b.addEventListener("click", async (event) => {
    event.stopPropagation();
    b.disabled = true;
    try {
      const items = await OBR.scene.items.getItems((item) => (
        item.layer === "CHARACTER" && !item.attachedTo
      ));
      const pending = items.filter((item) => item.metadata?.[META_KEY]?.inInitiative !== true);
      if (!pending.length) {
        await OBR.notification.show("Tutti i token sono gia nell'iniziativa.", "INFO");
        return;
      }

      const ids = pending.map((item) => item.id);
      const registry = await readFactionRegistry();
      const resolvedAttitudes = new Map();
      let unknownCount = 0;
      for (const item of pending) {
        const previous = item.metadata?.[META_KEY] || {};
        const registered = registeredAttitudeForItem(item, registry);
        if (!previous.attitude && !registered) unknownCount += 1;
        resolvedAttitudes.set(item.id, registered || previous.attitude || "enemy");
      }
      await OBR.scene.items.updateItems(ids, (drafts) => {
        for (const item of drafts) {
          const previous = { ...(item.metadata?.[META_KEY] || {}) };
          item.metadata = {
            ...(item.metadata || {}),
            [META_KEY]: {
              ...previous,
              initiative: previous.initiative ?? 10,
              attitude: resolvedAttitudes.get(item.id) || previous.attitude || "enemy",
              inInitiative: true,
            },
          };
        }
      });
      await reconcileStateWithItems();
      await enforceUniqueNamePrefixes();
      await renderAll();
      await OBR.notification.show(
        `${ids.length} token aggiunti all'iniziativa.${unknownCount ? ` ${unknownCount} non riconosciuti: ostili.` : ""}`,
        "SUCCESS"
      );
    } catch {
      await OBR.notification.show("Impossibile aggiungere tutti i token.", "ERROR").catch(() => {});
    } finally {
      b.disabled = false;
    }
  });
  return b;
}
function makeFactionConfiguratorBtn() {
  const b = document.createElement("button");
  b.type = "button";
  b.dataset.factionConfigurator = "1";
  b.title = "Configura le fazioni automatiche (solo GM)";
  Object.assign(b.style, {
    width: "24px",
    height: "24px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid rgba(147,197,253,.55)",
    background: "rgba(30,64,175,.48)",
    color: "#fff",
    lineHeight: "1",
    borderRadius: "8px",
    cursor: "pointer",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.08)",
    padding: "0",
  });
  const icon = document.createElement("img");
  icon.src = (import.meta.env.BASE_URL || "/") + "mark.svg";
  icon.alt = "";
  Object.assign(icon.style, {
    width: "12px",
    height: "12px",
    display: "block",
    filter: "brightness(0) invert(1)",
    pointerEvents: "none",
  });
  b.appendChild(icon);
  b.addEventListener("click", async (event) => {
    event.stopPropagation();
    b.disabled = true;
    const popupUrl = "/faction-configurator.html";
    try {
      const [anchorPosition] = await Promise.all([
        getTrackerPopoverAnchor(),
        fetch(popupUrl, { cache: "force-cache" }).catch(() => null),
      ]);
      await OBR.popover.close(FACTION_CONFIGURATOR_ID).catch(() => {});
      await OBR.popover.open({
        id: FACTION_CONFIGURATOR_ID,
        url: popupUrl,
        width: 420,
        height: 420,
        anchorReference: "POSITION",
        anchorPosition,
        anchorOrigin: { horizontal: "LEFT", vertical: "TOP" },
        transformOrigin: { horizontal: "LEFT", vertical: "TOP" },
        disableClickAway: true,
        marginThreshold: 12,
        hidePaper: true,
      });
    } catch {
      await OBR.notification.show("Impossibile aprire il configuratore fazioni.", "ERROR").catch(() => {});
    } finally {
      b.disabled = false;
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
    width: "24px",
    height: "24px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid rgba(248,113,113,.55)",
    background: "rgba(127,29,29,.55)",
    color: "#fff",
    fontSize: "14px",
    fontWeight: "700",
    lineHeight: "1",
    borderRadius: "8px",
    cursor: "pointer",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.08)",
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
  b.title = "Registro combattimento e Undo (solo GM)";
  Object.assign(b.style, {
    width: "24px",
    height: "24px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid rgba(147,197,253,.62)",
    background: "rgba(30,64,175,.58)",
    color: "#fff",
    fontSize: "14px",
    fontWeight: "700",
    lineHeight: "1",
    borderRadius: "8px",
    cursor: "pointer",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.08)",
    padding: "0",
  });
  const icon = document.createElement("img");
  icon.src = (import.meta.env.BASE_URL || "/") + "history.svg";
  icon.alt = "";
  Object.assign(icon.style, {
    width: "14px",
    height: "14px",
    display: "block",
    pointerEvents: "none",
  });
  b.appendChild(icon);
  b.addEventListener("click", async (e) => {
    e.stopPropagation();
    const popupId = `${ID}/history-modal`;
    if (!await beginTrackerPopoverToggle(popupId)) return;
    try {
      const anchorPosition = await getTrackerPopoverAnchor();
      await OBR.modal.close(popupId).catch(() => {});
      await OBR.popover.close(popupId).catch(() => {});
      await OBR.popover.open({
        id: popupId,
        url: "/history-modal.html",
        width: 480,
        height: 640,
        anchorReference: "POSITION",
        anchorPosition,
        anchorOrigin: { horizontal: "LEFT", vertical: "TOP" },
        transformOrigin: { horizontal: "LEFT", vertical: "TOP" },
        disableClickAway: true,
        marginThreshold: 12,
        hidePaper: true,
      });
      __openTrackerPopoverId = popupId;
    } catch (err) {
      __openTrackerPopoverId = "";
      console.warn("[history] popover open error:", err?.message || err);
    }
  });
  return b;
}

const topRow = document.createElement("div");
Object.assign(topRow.style, {
  alignSelf: "center",
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "6px",
  paddingBottom: "2px",
  flexDirection: "column",
  flexWrap: "nowrap",
});

const viewOptionsRow = document.createElement("div");
Object.assign(viewOptionsRow.style, {
  width: "calc(100% - 32px)",
  maxWidth: "430px",
  minHeight: "40px",
  boxSizing: "border-box",
  display: "none",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "4px",
  padding: "4px",
  border: "1px solid rgba(148,163,184,.2)",
  borderRadius: "13px",
  background: "rgba(8,12,21,.46)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,.04)",
});

const sceneOptionsGroup = document.createElement("div");
Object.assign(sceneOptionsGroup.style, {
  display: "inline-flex",
  alignItems: "center",
  gap: "2px",
});
const toolOptionsGroup = document.createElement("div");
Object.assign(toolOptionsGroup.style, {
  display: "inline-flex",
  alignItems: "center",
  gap: "2px",
  paddingLeft: "5px",
  borderLeft: "1px solid rgba(148,163,184,.2)",
});
function makeToolbarSection(title, content) {
  const section = document.createElement("section");
  const heading = document.createElement("div");
  heading.textContent = title;
  heading.dataset.toolbarHeading = "1";
  Object.assign(section.style, {
    minWidth: "0",
    display: "flex",
    alignItems: "center",
  });
  Object.assign(heading.style, {
    display: "none",
    color: "rgba(255,255,255,.58)",
    fontSize: "9px",
    fontWeight: "700",
    letterSpacing: ".08em",
    textTransform: "uppercase",
  });
  section.append(heading, content);
  return { section, heading };
}

function decorateToolbarControl(control, label) {
  control.dataset.toolbarControl = "1";
  const caption = document.createElement("span");
  caption.dataset.toolbarCaption = "1";
  caption.textContent = label;
  Object.assign(caption.style, {
    display: "none",
    maxWidth: "100%",
    overflow: "hidden",
    color: "rgba(255,255,255,.88)",
    fontSize: "10px",
    fontWeight: "600",
    lineHeight: "1.1",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    pointerEvents: "none",
  });
  control.appendChild(caption);
  return control;
}

const encounterToolbar = makeToolbarSection("Incontro", sceneOptionsGroup);
const trackersToolbar = makeToolbarSection("Tracker", toolOptionsGroup);
viewOptionsRow.append(encounterToolbar.section, trackersToolbar.section);
topRow.append(roundPill, viewOptionsRow);

// Toggle dello zoom automatico. Il default resta attivo per compatibilità
// con le scene che non hanno ancora salvato questa preferenza.
const zoomToggleWrap = document.createElement("label");
Object.assign(zoomToggleWrap.style, {
  position: "relative",
  width: "28px",
  minHeight: "28px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0",
  background: "transparent",
  border: "1px solid transparent",
  borderRadius: "8px",
  userSelect: "none",
  cursor: "pointer",
});

const zoomChk = document.createElement("input");
zoomChk.type = "checkbox";
zoomChk.checked = true;
Object.assign(zoomChk.style, {
  position: "absolute",
  width: "1px",
  height: "1px",
  opacity: "0",
  pointerEvents: "none",
});
zoomChk.title = "Centra automaticamente la scena sul token attivo";

const zoomLbl = document.createElement("img");
zoomLbl.src = `${import.meta.env.BASE_URL || "/"}zoom-on-token.svg`;
zoomLbl.alt = "";
Object.assign(zoomLbl.style, {
  width: "15px",
  height: "15px",
  objectFit: "contain",
  pointerEvents: "none",
});

function setCompactToggleVisual(wrap, active) {
  const classic = !isCompactTrackerLayout();
  wrap.setAttribute("aria-pressed", active ? "true" : "false");
  wrap.style.background = active
    ? "linear-gradient(180deg, rgba(37,99,235,.88), rgba(30,64,175,.72))"
    : classic ? "linear-gradient(180deg, rgba(255,255,255,.075), rgba(255,255,255,.025))" : "transparent";
  wrap.style.borderColor = active
    ? "rgba(147,197,253,.8)"
    : classic ? "rgba(148,163,184,.24)" : "transparent";
  wrap.style.boxShadow = active
    ? "inset 0 1px 0 rgba(255,255,255,.2), 0 5px 14px rgba(30,64,175,.26)"
    : classic ? "inset 0 1px 0 rgba(255,255,255,.04)" : "none";
}

zoomToggleWrap.append(zoomChk, zoomLbl);
decorateToolbarControl(zoomToggleWrap, "Follow");
zoomToggleWrap.title = zoomChk.title;
zoomToggleWrap.setAttribute("aria-label", zoomChk.title);
setCompactToggleVisual(zoomToggleWrap, zoomChk.checked);
sceneOptionsGroup.appendChild(zoomToggleWrap);

function makeGlobalPanelButton(title, iconPath, invert = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.title = title;
  button.setAttribute("aria-label", title);
  Object.assign(button.style, {
    width: "28px",
    minWidth: "28px",
    height: "28px",
    padding: "0",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "8px",
    border: "1px solid transparent",
    background: "transparent",
    boxShadow: "none",
    cursor: "pointer",
  });
  const icon = document.createElement("img");
  icon.src = `${import.meta.env.BASE_URL || "/"}${iconPath}`;
  icon.alt = "";
  Object.assign(icon.style, {
    width: "15px",
    height: "15px",
    display: "block",
    objectFit: "contain",
    filter: invert ? "brightness(0) invert(1)" : "none",
    pointerEvents: "none",
  });
  button.appendChild(icon);
  decorateToolbarControl(button, title);
  return button;
}

const globalPanelsWrap = document.createElement("div");
Object.assign(globalPanelsWrap.style, {
  display: "none",
  alignItems: "center",
  gap: "2px",
});
const globalEffectsButton = makeGlobalPanelButton("Condizioni", "conditions-panel.svg");
const globalSpellsButton = makeGlobalPanelButton("Incantesimi", "spells-panel.svg");
const globalQuickHPButton = makeGlobalPanelButton("Danno rapido", "quick-damage.svg");
globalQuickHPButton.querySelector("[data-toolbar-caption='1']").textContent = "Danno";
const EFFECTS_POPUP_ID = `${ID}/effects-modal`;
const SPELLS_POPUP_ID = `${ID}/spells-modal`;
const QUICK_HP_POPUP_ID = `${ID}/quick-hp-modal`;
globalEffectsButton.setAttribute("aria-pressed", "false");
globalSpellsButton.setAttribute("aria-pressed", "false");
globalQuickHPButton.setAttribute("aria-pressed", "false");
const trackedMoveButton = makeGlobalPanelButton("Movimento tracciato", "speed-panel.svg");
trackedMoveButton.querySelector("[data-toolbar-caption='1']").textContent = "Movimento";
trackedMoveButton.setAttribute("aria-pressed", "false");
let trackedMoveActive = false;

function setTrackedMoveButtonActive(active) {
  const classic = !isCompactTrackerLayout();
  trackedMoveActive = !!active;
  setSpeedCheckEnabled(trackedMoveActive);
  trackedMoveButton.setAttribute("aria-pressed", active ? "true" : "false");
  trackedMoveButton.style.background = active
    ? "linear-gradient(180deg, rgba(37,99,235,.88), rgba(30,64,175,.72))"
    : classic ? "linear-gradient(180deg, rgba(255,255,255,.075), rgba(255,255,255,.025))" : "transparent";
  trackedMoveButton.style.borderColor = active
    ? "rgba(147,197,253,.8)"
    : classic ? "rgba(148,163,184,.24)" : "transparent";
  trackedMoveButton.style.boxShadow = active
    ? "inset 0 1px 0 rgba(255,255,255,.2), 0 5px 14px rgba(30,64,175,.26)"
    : classic ? "inset 0 1px 0 rgba(255,255,255,.04)" : "none";
}

trackedMoveButton.addEventListener("click", () => {
  setTrackedMoveButtonActive(!trackedMoveActive);
});
globalEffectsButton.addEventListener("click", () => void openGlobalEffectsPopup());
globalSpellsButton.addEventListener("click", () => void openGlobalSpellsPopup());
globalQuickHPButton.addEventListener("click", () => void openGlobalQuickHPPopup());
globalPanelsWrap.append(globalEffectsButton, globalSpellsButton, globalQuickHPButton);
toolOptionsGroup.append(globalPanelsWrap, trackedMoveButton);

const movementReadout = document.createElement("div");
Object.assign(movementReadout.style, {
  width: "calc(100% - 24px)",
  maxWidth: "440px",
  boxSizing: "border-box",
  display: "none",
  flexDirection: "column",
  gap: "6px",
  padding: "8px 12px",
  border: "1px solid rgba(148,163,184,.2)",
  borderRadius: "12px",
  background: "linear-gradient(180deg, rgba(12,17,28,.64), rgba(7,11,19,.52))",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,.04), 0 5px 14px rgba(0,0,0,.18)",
  color: "#fff",
  userSelect: "none",
  cursor: "pointer",
});
const movementReadoutLine = document.createElement("div");
Object.assign(movementReadoutLine.style, {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "10px",
  fontSize: "11px",
});
const movementReadoutValue = document.createElement("strong");
Object.assign(movementReadoutValue.style, {
  flex: "1 1 auto",
  minWidth: "0",
  overflow: "hidden",
  fontSize: "14px",
  fontWeight: "700",
  fontVariantNumeric: "tabular-nums",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});
const movementReadoutMeta = document.createElement("span");
Object.assign(movementReadoutMeta.style, {
  flex: "0 0 auto",
  color: "rgba(255,255,255,.72)",
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
});
const movementReadoutTrack = document.createElement("div");
Object.assign(movementReadoutTrack.style, {
  height: "4px",
  overflow: "hidden",
  borderRadius: "999px",
  background: "rgba(0,0,0,.38)",
});
const movementReadoutBar = document.createElement("div");
Object.assign(movementReadoutBar.style, {
  width: "0%",
  height: "100%",
  borderRadius: "inherit",
  background: "#3b82f6",
  transition: "width 80ms linear, background-color 120ms ease",
});
movementReadoutTrack.appendChild(movementReadoutBar);
const movementCompactLimitControl = document.createElement("label");
movementCompactLimitControl.title = "Limita movimento";
Object.assign(movementCompactLimitControl.style, {
  display: "none",
  flex: "0 0 auto",
  alignItems: "center",
  justifyContent: "center",
  width: "16px",
  height: "16px",
  cursor: "pointer",
});
const movementCompactLimitCheckbox = document.createElement("input");
movementCompactLimitCheckbox.type = "checkbox";
movementCompactLimitCheckbox.setAttribute("aria-label", "Limita movimento alla disponibilità del turno");
Object.assign(movementCompactLimitCheckbox.style, {
  width: "13px",
  height: "13px",
  margin: "0",
  accentColor: "#3b82f6",
  cursor: "pointer",
});
movementCompactLimitControl.appendChild(movementCompactLimitCheckbox);
movementReadoutLine.append(movementReadoutValue, movementReadoutMeta, movementCompactLimitControl);
const movementDetails = document.createElement("div");
Object.assign(movementDetails.style, {
  display: "none",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "6px",
  paddingTop: "7px",
  borderTop: "1px solid rgba(255,255,255,.12)",
});
const movementDetailValues = {};
for (const [key, label] of [
  ["speed", "Velocit\u00e0"],
  ["allowance", "Disponibile"],
  ["total", "Totale turno"],
  ["remaining", "Residuo"],
]) {
  const cell = document.createElement("div");
  Object.assign(cell.style, {
    minWidth: "0",
    padding: "5px 7px",
    border: "1px solid rgba(255,255,255,.11)",
    borderRadius: "6px",
    background: "rgba(255,255,255,.055)",
  });
  const caption = document.createElement("div");
  caption.textContent = label;
  Object.assign(caption.style, {
    color: "rgba(255,255,255,.58)",
    fontSize: "9px",
    textTransform: "uppercase",
  });
  const value = document.createElement("strong");
  Object.assign(value.style, {
    display: "block",
    overflow: "hidden",
    marginTop: "2px",
    fontSize: "11px",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  });
  movementDetailValues[key] = value;
  cell.append(caption, value);
  movementDetails.appendChild(cell);
}
const movementAllowanceControls = document.createElement("div");
Object.assign(movementAllowanceControls.style, {
  gridColumn: "1 / -1",
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "6px",
});
function makeMovementStepper(label, onDecrease, onIncrease) {
  const wrap = document.createElement("div");
  Object.assign(wrap.style, {
    display: "grid",
    gridTemplateColumns: "24px minmax(0, 1fr) 24px",
    alignItems: "center",
    gap: "4px",
    padding: "4px",
    border: "1px solid rgba(255,255,255,.11)",
    borderRadius: "6px",
    background: "rgba(255,255,255,.055)",
  });
  const decrease = document.createElement("button");
  const increase = document.createElement("button");
  const value = document.createElement("strong");
  decrease.type = increase.type = "button";
  decrease.textContent = "-";
  increase.textContent = "+";
  value.textContent = label;
  Object.assign(value.style, {
    overflow: "hidden",
    fontSize: "10px",
    textAlign: "center",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  });
  for (const button of [decrease, increase]) {
    Object.assign(button.style, {
      width: "24px",
      height: "24px",
      padding: "0",
      border: "1px solid rgba(255,255,255,.18)",
      borderRadius: "50%",
      background: "rgba(0,0,0,.28)",
      color: "#fff",
      fontSize: "15px",
      lineHeight: "1",
      cursor: "pointer",
    });
  }
  decrease.addEventListener("click", (event) => {
    event.stopPropagation();
    onDecrease();
  });
  increase.addEventListener("click", (event) => {
    event.stopPropagation();
    onIncrease();
  });
  wrap.append(decrease, value, increase);
  return { wrap, value };
}
const movementDashStepper = makeMovementStepper(
  "Scatto x0",
  () => adjustSpeedCheckDash(-1),
  () => adjustSpeedCheckDash(1),
);
const movementBonusStepper = makeMovementStepper(
  "Bonus 0 m",
  () => adjustSpeedCheckBonus(-1.5),
  () => adjustSpeedCheckBonus(1.5),
);
movementAllowanceControls.append(movementDashStepper.wrap, movementBonusStepper.wrap);
movementDetails.appendChild(movementAllowanceControls);
const movementResetButton = document.createElement("button");
movementResetButton.type = "button";
movementResetButton.textContent = "Reset movimento";
Object.assign(movementResetButton.style, {
  minHeight: "28px",
  border: "1px solid rgba(255,255,255,.2)",
  borderRadius: "999px",
  background: "rgba(255,255,255,.09)",
  color: "#fff",
  font: "inherit",
  fontSize: "11px",
  fontWeight: "700",
  cursor: "pointer",
});
const movementActions = document.createElement("div");
Object.assign(movementActions.style, {
  gridColumn: "1 / -1",
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
  alignItems: "stretch",
  gap: "6px",
});
const movementLimitControl = document.createElement("label");
Object.assign(movementLimitControl.style, {
  minHeight: "28px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "6px",
  padding: "0 8px",
  boxSizing: "border-box",
  border: "1px solid rgba(255,255,255,.2)",
  borderRadius: "999px",
  background: "rgba(255,255,255,.09)",
  color: "#fff",
  fontSize: "11px",
  fontWeight: "700",
  cursor: "pointer",
  whiteSpace: "nowrap",
});
const movementLimitCheckbox = document.createElement("input");
movementLimitCheckbox.type = "checkbox";
movementLimitCheckbox.setAttribute("aria-label", "Limita movimento alla disponibilità del turno");
Object.assign(movementLimitCheckbox.style, {
  width: "14px",
  height: "14px",
  margin: "0",
  accentColor: "#3b82f6",
  cursor: "pointer",
});
const movementLimitLabel = document.createElement("span");
movementLimitLabel.textContent = "Limita movimento";
movementLimitControl.append(movementLimitCheckbox, movementLimitLabel);
movementActions.append(movementLimitControl, movementResetButton);
movementDetails.appendChild(movementActions);
movementReadout.append(movementReadoutLine, movementReadoutTrack, movementDetails);
topRow.appendChild(movementReadout);

let movementDetailsOpen = false;
movementReadout.addEventListener("click", () => {
  if (isCompactTrackerLayout()) {
    movementDetailsOpen = false;
    movementDetails.style.display = "none";
    return;
  }
  movementDetailsOpen = !movementDetailsOpen;
  movementDetails.style.display = movementDetailsOpen ? "grid" : "none";
});
movementResetButton.addEventListener("click", (event) => {
  event.stopPropagation();
  resetSpeedCheckMovement();
});
movementLimitControl.addEventListener("click", (event) => event.stopPropagation());
movementLimitCheckbox.addEventListener("change", () => {
  setSpeedCheckMovementLimit(movementLimitCheckbox.checked);
});
movementCompactLimitControl.addEventListener("click", (event) => event.stopPropagation());
movementCompactLimitCheckbox.addEventListener("change", () => {
  setSpeedCheckMovementLimit(movementCompactLimitCheckbox.checked);
});

let latestMovementSnapshot = null;

function movementNumber(value) {
  return Number(value || 0).toLocaleString("it-IT", { maximumFractionDigits: 1 });
}

function movementReadoutSummary(snapshot, compact = isCompactTrackerLayout()) {
  if (!snapshot) return "";
  return compact
    ? movementNumber(snapshot.totalMeters) + "/" + movementNumber(snapshot.allowanceMeters) + " m · (" + movementNumber(snapshot.totalCells) + "/" + movementNumber(snapshot.allowanceCells) + ")"
    : movementNumber(snapshot.totalMeters) + " / " + movementNumber(snapshot.allowanceMeters) + " m · " + movementNumber(snapshot.totalCells) + "/" + movementNumber(snapshot.allowanceCells) + " caselle";
}

subscribeSpeedCheckState((snapshot) => {
  latestMovementSnapshot = snapshot;
  queueMicrotask(() => updateActiveCardMovementIndicator(snapshot));
  const visible = snapshot.available;
  movementReadout.style.display = visible ? "flex" : "none";
  if (!visible) return;
  movementReadoutValue.textContent = snapshot.name || "Movimento";
  movementReadoutMeta.textContent = movementReadoutSummary(snapshot);
  movementReadout.title = snapshot.name + ": " + movementNumber(snapshot.totalMeters) + " m totali nel turno; " + movementNumber(snapshot.remainingMeters) + " m al limite disponibile"
    + (snapshot.conditionSummary ? "; " + snapshot.conditionSummary : "");

  movementDetailValues.speed.textContent = movementNumber(snapshot.speedMeters) + " m"
    + (snapshot.baseSpeedMeters !== snapshot.speedMeters
      ? " (base " + movementNumber(snapshot.baseSpeedMeters) + " m)"
      : "");
  movementDetailValues.allowance.textContent = movementNumber(snapshot.allowanceMeters) + " m";
  movementDetailValues.total.textContent = movementNumber(snapshot.totalMeters) + " m";
  movementDetailValues.remaining.textContent = movementNumber(snapshot.remainingMeters) + " m";

  movementDashStepper.value.textContent = "Scatto x" + snapshot.dashCount;
  movementBonusStepper.value.textContent = "Bonus " + movementNumber(snapshot.bonusMeters) + " m";
  movementLimitCheckbox.checked = snapshot.movementLimited === true;
  movementCompactLimitCheckbox.checked = snapshot.movementLimited === true;
  const percent = Math.max(0, Math.min(100, snapshot.progress * 100));
  movementReadoutBar.style.width = percent + "%";
  movementReadoutBar.style.background = snapshot.blocked || percent >= 99.9 ? "#ef4444" : percent >= 75 ? "#f59e0b" : "#3b82f6";
});

// wrapper della lista — l’UNICO che scrolla
const trackWrap = document.createElement("div");
trackWrap.style.flex = "1 1 auto";        // ← occupa tutto lo spazio rimanente
trackWrap.style.minHeight = "0";          // ← fondamentale in flex
trackWrap.style.overflow = "auto";        // ← unica scrollbar
trackWrap.style.overscrollBehavior = "contain";
trackWrap.style.overflowAnchor = "none";
trackWrap.style.padding = "0";
trackWrap.style.boxSizing = "border-box";
trackWrap.style.position = "relative";

// (rimuovi i vecchi limiti! niente maxHeight/minHeight qui)
// trackWrap.style.maxHeight = "575px";  // ← ELIMINATO
// trackWrap.style.minHeight = "120px";  // ← ELIMINATO

const track = document.createElement("div");
track.style.display = "flex";
track.style.position = "relative";
track.style.flexDirection = "column";
track.style.alignItems = "center";
track.style.gap = "6px";
track.style.paddingTop = "8px";
track.style.paddingBottom = "8px";
trackWrap.appendChild(track);

function updateActiveCardMovementIndicator() {
  track.querySelector('[data-speed-card-indicator="1"]')?.remove();
}

// === Drag & Drop per pareggi d'iniziativa (delegato sul track) ===
if (!track.__dndMounted) {
  track.__dndMounted = true;

track.addEventListener("dragstart", (ev) => {
  const card = ev.target.closest('[data-item-id]');
  if (!card) return;
  if (card.dataset.isEpic === "1") { ev.preventDefault(); return; }

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
  const horizontal = isCompactTrackerLayout();
  const before = horizontal
    ? ev.clientX < (r.left + r.width / 2)
    : ev.clientY < (r.top + r.height / 2);

  if (!over.dataset.dropHint) over.dataset.dropHint = "1";
  over.style.borderTop = horizontal ? "" : before ? "2px solid rgba(255,255,255,.85)" : "";
  over.style.borderBottom = horizontal ? "" : before ? "" : "2px solid rgba(255,255,255,.85)";
  over.style.borderLeft = horizontal && before ? "2px solid rgba(255,255,255,.85)" : "";
  over.style.borderRight = horizontal && !before ? "2px solid rgba(255,255,255,.85)" : "";
});

track.addEventListener("drop", async (ev) => {
  if (!__draggingId) return;
  const over = ev.target.closest('[data-item-id]');
  if (!over) return;
  if (String(over.dataset.initiative || "") !== String(__draggingInit)) return;

  ev.preventDefault();
  const r = over.getBoundingClientRect();
  const before = isCompactTrackerLayout()
    ? ev.clientX < (r.left + r.width / 2)
    : ev.clientY < (r.top + r.height / 2);

  const sourceId = __draggingId;
  const targetId = over.dataset.itemId;

  // pulizia hint e opacità
  const hinted = track.querySelectorAll('[data-drop-hint]');
  hinted.forEach(n => {
    n.style.borderTop = "";
    n.style.borderBottom = "";
    n.style.borderLeft = "";
    n.style.borderRight = "";
    delete n.dataset.dropHint;
  });
  const dragging = Array.from(track.querySelectorAll('[data-item-id]')).find((node) =>
    node.dataset.itemId === __draggingId
  );
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

track.addEventListener("dragend", () => {
  track.querySelectorAll('[data-drop-hint]').forEach((node) => {
    node.style.borderTop = "";
    node.style.borderBottom = "";
    node.style.borderLeft = "";
    node.style.borderRight = "";
    delete node.dataset.dropHint;
  });
  const dragging = Array.from(track.querySelectorAll('[data-item-id]'))
    .find((node) => node.dataset.itemId === __draggingId);
  if (dragging) dragging.style.opacity = "";
  __draggingId = null;
  __draggingInit = null;
  __draggingWasCollapsed = false;
});
}
// --- Toggle Lair (Azioni di Tana a iniziativa 20) ---
const lairToggleWrap = document.createElement("label");
Object.assign(lairToggleWrap.style, {
  position: "relative",
  width: "28px",
  minHeight: "28px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0",
  background: "transparent",
  border: "1px solid transparent",
  borderRadius: "8px",
  userSelect: "none",
  cursor: "pointer",
});

const lairChk = document.createElement("input");
lairChk.type = "checkbox";
Object.assign(lairChk.style, {
  position: "absolute",
  width: "1px",
  height: "1px",
  opacity: "0",
  pointerEvents: "none",
});

const lairLbl = document.createElement("img");
lairLbl.src = `${import.meta.env.BASE_URL || "/"}lair-actions.svg`;
lairLbl.alt = "";
Object.assign(lairLbl.style, {
  width: "16px",
  height: "16px",
  objectFit: "contain",
  pointerEvents: "none",
});

lairToggleWrap.append(lairChk, lairLbl);
decorateToolbarControl(lairToggleWrap, "Tana");
lairToggleWrap.title = "Azioni di Tana";
lairToggleWrap.setAttribute("aria-label", lairToggleWrap.title);

// inizializza lo stato visivo dal metadata
(async () => {
  const st = await getSceneState();
  lairChk.checked = !!st?.lairEnabled;
  setCompactToggleVisual(lairToggleWrap, lairChk.checked);
})();

lairChk.addEventListener("change", async (e) => {
  const enabled = !!e.target.checked;
  setCompactToggleVisual(lairToggleWrap, enabled);
  await setSceneState(prev => ({ ...(prev || {}), lairEnabled: enabled }));
  await reconcileStateWithItems();
  await renderAll();
});

zoomChk.addEventListener("change", async (e) => {
  const enabled = !!e.target.checked;
  setCompactToggleVisual(zoomToggleWrap, enabled);
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
const compactNavigationRow = document.createElement("div");
const classicNavigationRow = document.createElement("div");
const compactRoundControls = document.createElement("div");
const compactAdminMenu = document.createElement("div");
const compactMoreButton = mkBtn("…");

compactMoreButton.title = "Altre azioni del tracker";
compactMoreButton.setAttribute("aria-label", compactMoreButton.title);
compactMoreButton.setAttribute("aria-haspopup", "menu");
compactMoreButton.setAttribute("aria-expanded", "false");
compactAdminMenu.setAttribute("role", "menu");
compactAdminMenu.setAttribute("aria-label", "Altre azioni del tracker");
compactAdminMenu.style.display = "none";

function setCompactAdminMenuOpen(open) {
  const visible = !!open && isCompactTrackerLayout();
  compactAdminMenu.style.display = visible ? "grid" : "none";
  compactMoreButton.setAttribute("aria-expanded", visible ? "true" : "false");
}

compactMoreButton.addEventListener("click", (event) => {
  event.stopPropagation();
  setCompactAdminMenuOpen(compactMoreButton.getAttribute("aria-expanded") !== "true");
});
document.addEventListener("pointerdown", (event) => {
  if (compactMoreButton.getAttribute("aria-expanded") === "true" && !roundPill.contains(event.target)) {
    setCompactAdminMenuOpen(false);
  }
});
compactAdminMenu.addEventListener("click", (event) => {
  if (event.target.closest("button")) window.setTimeout(() => setCompactAdminMenuOpen(false), 0);
});

function applyToolbarLayoutPresentation(compact) {
  if (!IS_GM) {
    viewOptionsRow.style.display = "none";
    return;
  }
  const classic = !compact;

  Object.assign(viewOptionsRow.style, classic ? {
    display: "grid",
    flex: "0 0 auto",
    width: "100%",
    maxWidth: "none",
    height: "auto",
    minHeight: "68px",
    gridTemplateColumns: "minmax(88px, 2fr) minmax(0, 4fr)",
    gridAutoRows: "auto",
    alignItems: "stretch",
    justifyItems: "stretch",
    alignContent: "normal",
    justifyContent: "stretch",
    gap: "6px",
    padding: "5px",
    overflow: "hidden",
    boxSizing: "border-box",
    border: "1px solid rgba(148,163,184,.22)",
    borderRadius: "14px",
    background: "linear-gradient(180deg, rgba(16,21,31,.78), rgba(7,11,18,.72))",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.05)",
  } : {
    display: "grid",
    flex: "0 0 98px",
    width: "98px",
    maxWidth: "98px",
    height: "100%",
    minHeight: "0",
    gridTemplateColumns: "repeat(2, 40px)",
    gridAutoRows: "38px",
    alignItems: "center",
    justifyItems: "center",
    alignContent: "center",
    justifyContent: "center",
    gap: "4px",
    padding: "5px",
    overflow: "hidden",
    boxSizing: "border-box",
    border: "1px solid rgba(148,163,184,.24)",
    borderRadius: "14px",
    background: "linear-gradient(180deg, rgba(31,39,51,.82), rgba(18,24,34,.78))",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.07), 0 8px 20px rgba(0,0,0,.22)",
  });

  for (const toolbar of [encounterToolbar, trackersToolbar]) {
    Object.assign(toolbar.section.style, {
      display: classic ? "flex" : "contents",
      flex: classic ? "1 1 0" : "0 0 auto",
      width: classic ? "100%" : "auto",
      minWidth: "0",
      flexDirection: "column",
      alignItems: "stretch",
      gap: classic ? "4px" : "0",
      overflow: classic ? "hidden" : "visible",
    });
    toolbar.heading.style.display = classic ? "block" : "none";
    toolbar.heading.style.textAlign = "center";
  }

  Object.assign(sceneOptionsGroup.style, {
    width: classic ? "100%" : "auto",
    minWidth: "0",
    display: classic ? "grid" : "contents",
    gridTemplateColumns: classic ? "repeat(2, minmax(0, 1fr))" : "none",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: classic ? "3px" : "0",
  });
  Object.assign(toolOptionsGroup.style, {
    width: classic ? "100%" : "auto",
    minWidth: "0",
    display: classic ? "grid" : "contents",
    gridTemplateColumns: classic ? "repeat(4, minmax(0, 1fr))" : "none",
    alignItems: "center",
    justifyContent: "center",
    gap: classic ? "3px" : "0",
    paddingLeft: classic ? "7px" : "0",
    paddingTop: "0",
    boxSizing: "border-box",
    borderLeft: classic ? "1px solid rgba(148,163,184,.24)" : "none",
    borderTop: "none",
  });
  Object.assign(globalPanelsWrap.style, {
    display: classic ? "contents" : "contents",
    width: "auto",
    minWidth: "0",
    alignItems: "center",
    flexDirection: "row",
    gap: "0",
  });

  viewOptionsRow.querySelectorAll("[data-toolbar-control='1']").forEach((control) => {
    const active = control.getAttribute("aria-pressed") === "true";
    Object.assign(control.style, {
      width: classic ? "100%" : "40px",
      minWidth: "0",
      maxWidth: classic ? "100%" : "40px",
      boxSizing: "border-box",
      height: classic ? "46px" : "36px",
      minHeight: classic ? "46px" : "36px",
      flexDirection: classic ? "column" : "row",
      justifyContent: "center",
      gap: classic ? "3px" : "0",
      padding: "0 2px",
      overflow: "hidden",
      borderRadius: classic ? "10px" : "9px",
      border: active
        ? "1px solid rgba(147,197,253,.8)"
        : "1px solid rgba(148,163,184,.24)",
      background: active
        ? "linear-gradient(180deg, rgba(37,99,235,.88), rgba(30,64,175,.72))"
        : "linear-gradient(180deg, rgba(255,255,255,.075), rgba(255,255,255,.025))",
      boxShadow: active
        ? "inset 0 1px 0 rgba(255,255,255,.2), 0 5px 14px rgba(30,64,175,.26)"
        : "inset 0 1px 0 rgba(255,255,255,.04)",
    });
    const icon = control.querySelector("img");
    if (icon) {
      icon.style.width = classic ? "18px" : "18px";
      icon.style.height = classic ? "18px" : "18px";
      icon.style.flex = "0 0 auto";
    }
    const caption = control.querySelector("[data-toolbar-caption='1']");
    if (caption) {
      caption.style.display = classic ? "block" : "none";
      caption.style.width = "100%";
      caption.style.maxWidth = "100%";
      caption.style.fontSize = "8px";
      caption.style.lineHeight = "1";
      caption.style.letterSpacing = "-.01em";
      caption.style.whiteSpace = "nowrap";
      caption.style.overflow = "hidden";
      caption.style.textOverflow = "clip";
      caption.style.textAlign = "center";
    }
  });
}

function ensureAdminMenuLabel(control, text) {
  if (!control) return null;
  let label = control.querySelector("[data-admin-menu-label='1']");
  if (!label) {
    label = document.createElement("span");
    label.dataset.adminMenuLabel = "1";
    control.appendChild(label);
  }
  label.textContent = text;
  Object.assign(label.style, {
    flex: "1 1 auto",
    minWidth: "0",
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
    textAlign: "left",
    pointerEvents: "none",
    fontSize: "10px",
    fontWeight: "700",
  });
  return label;
}

function applyAdminMenuPresentation(compact) {
  Object.assign(compactAdminMenu.style, {
    position: "absolute",
    left: compact ? "calc(100% + 8px)" : "auto",
    right: compact ? "auto" : "0",
    top: compact ? "auto" : "calc(100% + 6px)",
    bottom: compact ? "0" : "auto",
    zIndex: "40",
    width: compact ? "184px" : "178px",
    maxHeight: compact ? "168px" : "none",
    overflowX: "hidden",
    overflowY: compact ? "auto" : "visible",
    gridTemplateColumns: "1fr",
    gridTemplateRows: "",
    alignItems: "stretch",
    justifyItems: "stretch",
    justifyContent: "stretch",
    gap: "3px",
    padding: "6px",
    boxSizing: "border-box",
    border: "1px solid rgba(148,163,184,.32)",
    borderRadius: "12px",
    background: "rgba(13,18,27,.98)",
    boxShadow: "0 12px 30px rgba(0,0,0,.48), inset 0 1px 0 rgba(255,255,255,.07)",
  });

  const entries = [
    [roundResetSlot.querySelector("button"), "Reset round", false],
    ...(compact ? [[roundHistorySlot.querySelector("button"), "Cronologia", false]] : []),
    [roundActions.querySelector("[data-add-all-initiative='1']"), "Aggiungi attori", false],
    [roundActions.querySelector("[data-faction-configurator='1']"), "Configura fazioni", false],
    [roundActions.querySelector("[data-clear-initiative='1']"), "Svuota iniziativa", true],
  ];

  roundPill.querySelectorAll("[data-admin-menu-label='1']").forEach((label) => {
    label.style.display = compactAdminMenu.contains(label.parentElement) ? "block" : "none";
  });

  for (const [control, text, danger] of entries) {
    if (!control) continue;
    const label = ensureAdminMenuLabel(control, text);
    const inMenu = compactAdminMenu.contains(control);
    label.style.display = inMenu ? "block" : "none";
    if (!inMenu) continue;
    Object.assign(control.style, {
      width: "100%",
      minWidth: "0",
      maxWidth: "none",
      height: compact ? "28px" : "30px",
      minHeight: compact ? "28px" : "30px",
      gridColumn: "1",
      gridRow: "auto",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-start",
      gap: "8px",
      padding: "0 9px",
      borderRadius: "8px",
      textAlign: "left",
      border: danger ? "1px solid rgba(248,113,113,.42)" : "1px solid rgba(148,163,184,.20)",
      background: danger
        ? "linear-gradient(180deg, rgba(127,29,29,.78), rgba(69,10,10,.72))"
        : "linear-gradient(180deg, rgba(255,255,255,.075), rgba(255,255,255,.025))",
    });
    const icon = control.querySelector("img");
    if (icon) {
      icon.style.width = "16px";
      icon.style.height = "16px";
      icon.style.flex = "0 0 16px";
    }
  }

  roundResetSlot.style.display = compactAdminMenu.contains(roundResetSlot) ? "contents" : "inline-flex";
  roundHistorySlot.style.display = compactAdminMenu.contains(roundHistorySlot) ? "contents" : "inline-flex";
  roundActions.style.display = compactAdminMenu.contains(roundActions) ? "contents" : "flex";
}

function applyHeaderLayoutPresentation(compact) {
  const classic = !compact;
  roundPill.style.gap = classic ? "3px" : "4px";
  roundPill.style.overflow = classic ? "hidden" : "visible";
  roundStatus.style.flex = classic ? "1 1 72px" : "0 0 auto";
  roundStatus.style.width = classic ? "auto" : "100%";
  roundStatus.style.minWidth = classic ? "70px" : "0";
  roundStatus.style.overflow = classic ? "hidden" : "visible";
  roundStatus.style.flexDirection = classic ? "row" : "column";
  roundStatus.style.justifyContent = classic ? "flex-start" : "center";
  roundStatus.style.gap = classic ? "4px" : "1px";
  roundStatus.style.paddingBottom = classic ? "0" : "4px";
  roundStatus.style.borderBottom = classic ? "none" : "1px solid rgba(148,163,184,.22)";
  roundLabel.style.fontSize = classic ? "15px" : "13px";
  roundLabel.style.whiteSpace = "nowrap";
  roundActions.style.width = classic ? "auto" : "100%";
  roundActions.style.display = classic ? "flex" : "contents";
  roundActions.style.gridColumn = compact ? "1" : "auto";
  roundActions.style.flexWrap = "nowrap";
  roundActions.style.justifyContent = classic ? "flex-start" : "center";
  roundActions.style.gap = "3px";
  Object.assign(roundResetSlot.style, {
    display: classic ? "inline-flex" : "contents",
    gridColumn: compact ? "1" : "auto",
    paddingRight: classic ? "3px" : "0",
    paddingTop: "0",
    borderRight: classic ? "1px solid rgba(148,163,184,.24)" : "none",
    borderTop: "none",
  });
  Object.assign(roundHistorySlot.style, {
    display: compact ? "contents" : "inline-flex",
    paddingLeft: classic ? "2px" : "0",
    borderLeft: classic ? "1px solid rgba(148,163,184,.24)" : "none",
  });

  roundPill.querySelectorAll("button").forEach((button) => {
    const primary = button === btnPrev || button === btnNext || button === compactMoreButton;
    const admin = compactAdminMenu.contains(button);
    button.style.width = classic ? (button === layoutToggleButton ? "66px" : "26px") : admin ? "30px" : "26px";
    button.style.minWidth = compact ? (admin ? "30px" : "26px") : "";
    button.style.maxWidth = "";
    button.style.height = classic ? "28px" : admin ? "30px" : "26px";
    button.style.minHeight = compact ? (admin ? "30px" : "26px") : "";
    button.style.borderRadius = classic ? "10px" : "9px";
    button.style.gridColumn = "";
    button.style.gridRow = "";
    button.style.justifyContent = "center";
    button.style.gap = "";
    button.style.padding = "0";
    button.tabIndex = primary || admin ? 0 : button.tabIndex;
  });

  Object.assign(trackerDragHandle.style, {
    display: compact ? "flex" : "none",
    width: compact ? "26px" : "",
    minWidth: compact ? "26px" : "",
    height: compact ? "26px" : "",
    justifyContent: "center",
    padding: "0",
  });
  Object.assign(layoutToggleButton.style, classic ? {
    width: "66px",
    minWidth: "66px",
    height: "28px",
    padding: "0 5px",
    gap: "4px",
    justifyContent: "center",
    border: "1px solid rgba(96,165,250,.52)",
    background: "linear-gradient(180deg, rgba(37,99,235,.34), rgba(30,64,175,.22))",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.10)",
    color: "#dbeafe",
    fontSize: "9px",
  } : {
    width: "26px",
    minWidth: "26px",
    height: "26px",
    padding: "0",
    gap: "0",
    justifyContent: "center",
    border: "1px solid rgba(148,163,184,.24)",
    background: "rgba(8,12,21,.72)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.05)",
    color: "#fff",
    fontSize: "9px",
  });
  layoutToggleIcon.style.width = classic ? "16px" : "15px";
  layoutToggleIcon.style.height = classic ? "16px" : "15px";
  layoutToggleCaption.style.display = classic ? "inline" : "none";
  layoutToggleCaption.style.fontSize = classic ? "9px" : "10px";
  if (compact) {
    applyAdminMenuPresentation(true);
  } else {
    roundPill.querySelectorAll("[data-admin-menu-label='1']").forEach((label) => {
      label.style.display = "none";
    });
  }

  if (compact) {
    btnPrev.textContent = "◀";
    btnNext.textContent = "▶";
    btnPrev.title = "Turno precedente";
    btnNext.title = "Turno successivo";
    btnPrev.setAttribute("aria-label", btnPrev.title);
    btnNext.setAttribute("aria-label", btnNext.title);
    Object.assign(btnNext.style, {
      border: "1px solid rgba(96,165,250,.86)",
      background: "linear-gradient(180deg, rgba(37,99,235,.92), rgba(30,64,175,.82))",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,.18), 0 4px 10px rgba(30,64,175,.28)",
    });
    Object.assign(btnPrev.style, {
      border: "1px solid rgba(148,163,184,.28)",
      background: "rgba(255,255,255,.055)",
    });
  }
}

function mountCompactSideControls() {
  setCompactAdminMenuOpen(false);
  if (IS_GM) {
    compactAdminMenu.replaceChildren(roundResetSlot, roundHistorySlot, roundActions);
    compactRoundControls.replaceChildren(trackerDragHandle, layoutToggleButton, compactMoreButton);
  } else {
    compactAdminMenu.replaceChildren();
    compactRoundControls.replaceChildren(trackerDragHandle, layoutToggleButton);
  }
  roundPill.replaceChildren(roundStatus, compactRoundControls, movementReadout, compactAdminMenu);
}

function restoreClassicHeader() {
  setCompactAdminMenuOpen(false);
  compactAdminMenu.replaceChildren();
  compactRoundControls.replaceChildren(compactMoreButton);
  roundPill.replaceChildren(
    roundResetSlot,
    roundStatus,
    layoutToggleButton,
    roundActions,
    roundHistorySlot,
    trackerDragHandle,
  );
  topRow.replaceChildren(roundPill, viewOptionsRow, movementReadout);
}
function applyTrackerLayout() {
  const compact = isCompactTrackerLayout();
  container.dataset.trackerLayout = compact
    ? TRACKER_LAYOUT_COMPACT
    : TRACKER_LAYOUT_CLASSIC;
  const glassRoot = container.closest("[data-glass-popover='1']");
  if (glassRoot) glassRoot.dataset.trackerLayout = container.dataset.trackerLayout;

  if (compact) {
    mountCompactSideControls();
    Object.assign(col.style, {
      flexDirection: "row",
      alignItems: "stretch",
      gap: "2px",
      padding: "2px",
      boxSizing: "border-box",
      border: "1px solid rgba(148,163,184,.26)",
      borderRadius: "16px",
      background: "linear-gradient(180deg, rgba(28,35,46,.68), rgba(16,22,31,.60))",
      boxShadow: "0 8px 20px rgba(0,0,0,.22), inset 0 1px 0 rgba(255,255,255,.05)",
    });
    Object.assign(topRow.style, {
      flex: "0 0 auto",
      width: "100%",
      gap: "3px",
      padding: "0",
      paddingBottom: "0",
      border: "0",
      borderRadius: "0",
      background: "transparent",
      boxShadow: "none",
    });
    Object.assign(roundPill.style, {
      position: "relative",
      flex: "0 0 118px",
      width: "118px",
      maxWidth: "118px",
      height: "100%",
      minHeight: "0",
      flexDirection: "column",
      justifyContent: "center",
      padding: "4px",
      boxSizing: "border-box",
      borderRadius: "11px",
      background: "linear-gradient(180deg, rgba(39,48,61,.92), rgba(22,29,40,.92))",
    });
    Object.assign(compactRoundControls.style, {
      width: "100%",
      display: "grid",
      gridTemplateColumns: "26px",
      alignItems: "center",
      justifyContent: "center",
      gap: "3px",
    });
    Object.assign(compactAdminMenu.style, {
      position: "absolute",
      left: "calc(100% + 8px)",
      bottom: "0",
      zIndex: "40",
      width: "150px",
      maxHeight: "none",
      overflow: "visible",
      gridTemplateColumns: "repeat(4, 30px)",
      gridTemplateRows: "repeat(2, 30px)",
      alignItems: "center",
      justifyContent: "center",
      gap: "5px",
      padding: "7px",
      boxSizing: "border-box",
      border: "1px solid rgba(148,163,184,.32)",
      borderRadius: "12px",
      background: "rgba(13,18,27,.98)",
      boxShadow: "0 12px 30px rgba(0,0,0,.48), inset 0 1px 0 rgba(255,255,255,.07)",
    });
    Object.assign(movementReadout.style, {
      width: "100%",
      minWidth: "0",
      gap: "3px",
      padding: "3px 4px",
      borderRadius: "10px",
      fontSize: "9px",
      textAlign: "center",
      cursor: "default",
    });
    movementDetailsOpen = false;
    movementDetails.style.display = "none";
    movementReadoutValue.style.display = "none";
    movementCompactLimitControl.style.display = IS_GM ? "inline-flex" : "none";
    movementReadoutMeta.textContent = movementReadoutSummary(latestMovementSnapshot, true);
    movementReadoutLine.style.justifyContent = "center";
    Object.assign(movementReadoutMeta.style, {
      flex: "1 1 auto",
      minWidth: "0",
      width: "100%",
      overflow: "hidden",
      fontSize: "9px",
      textAlign: "center",
      textOverflow: "ellipsis",
    });
    Object.assign(compactNavigationRow.style, {
      flex: "1 1 auto",
      minHeight: "0",
      width: "auto",
      display: "flex",
      alignItems: "stretch",
      gap: "3px",
      overflow: "hidden",
    });
    trackWrap.dataset.compactScroll = "1";
    Object.assign(trackWrap.style, {
      flex: "1 1 auto",
      minWidth: "0",
      minHeight: "0",
      overflowX: "auto",
      overflowY: "hidden",
      padding: "0",
      scrollBehavior: "smooth",
      overscrollBehavior: "contain",
    });
    Object.assign(track.style, {
      minWidth: "100%",
      minHeight: "100%",
      width: "max-content",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: "5px",
      padding: "2px 7px 4px",
      boxSizing: "border-box",
    });
    for (const [button, text, label, primary] of [
      [btnPrev, "‹", "Turno precedente", false],
      [btnNext, "›", "Turno successivo", true],
    ]) {
      button.textContent = text;
      button.title = label;
      button.setAttribute("aria-label", label);
      button.tabIndex = 0;
      Object.assign(button.style, {
        flex: "0 0 28px",
        width: "28px",
        minWidth: "28px",
        height: "100%",
        minHeight: "28px",
        padding: "0",
        border: primary ? "1px solid rgba(96,165,250,.82)" : "1px solid transparent",
        borderRadius: "10px",
        background: primary
          ? "linear-gradient(180deg, rgba(37,99,235,.90), rgba(30,64,175,.78))"
          : "rgba(8,12,21,.28)",
        boxShadow: primary ? "inset 0 1px 0 rgba(255,255,255,.16)" : "none",
        fontSize: "24px",
      });
    }
    compactNavigationRow.replaceChildren(btnPrev, trackWrap, btnNext);
    col.replaceChildren(roundPill, compactNavigationRow, viewOptionsRow);
  } else {
    restoreClassicHeader();
    delete trackWrap.dataset.compactScroll;
    Object.assign(movementReadout.style, {
      gap: "6px",
      padding: "8px 12px",
      borderRadius: "12px",
      cursor: "pointer",
    });
    movementReadoutValue.style.display = "block";
    movementCompactLimitControl.style.display = "none";
    movementReadoutMeta.textContent = movementReadoutSummary(latestMovementSnapshot, false);
    movementReadoutLine.style.justifyContent = "space-between";
    Object.assign(movementReadoutMeta.style, {
      flex: "0 0 auto",
      minWidth: "",
      width: "auto",
      overflow: "visible",
      fontSize: "",
      textAlign: "left",
      textOverflow: "clip",
    });
    Object.assign(col.style, {
      flexDirection: "column",
      alignItems: "stretch",
      gap: "5px",
      padding: "0",
      border: "none",
      borderRadius: "0",
      background: "transparent",
      boxShadow: "none",
    });
    Object.assign(topRow.style, {
      flex: "0 0 auto",
      width: "calc(100% - 12px)",
      gap: "5px",
      padding: "4px",
      paddingBottom: "4px",
      boxSizing: "border-box",
      border: "1px solid rgba(148,163,184,.25)",
      borderRadius: "16px",
      background: "linear-gradient(180deg, rgba(25,25,27,.88), rgba(13,15,20,.84))",
      boxShadow: "0 14px 34px rgba(0,0,0,.32), inset 0 1px 0 rgba(255,255,255,.07)",
    });
    Object.assign(roundPill.style, {
      position: "relative",
      flex: "1 1 auto",
      width: "100%",
      maxWidth: "none",
      height: "auto",
      minHeight: "46px",
      flexDirection: "row",
      justifyContent: "flex-start",
      padding: "4px 6px",
      borderRadius: "12px",
      background: "linear-gradient(180deg, rgba(14,19,31,.82), rgba(8,12,21,.76))",
    });
    Object.assign(trackWrap.style, {
      flex: "1 1 auto",
      minWidth: "",
      minHeight: "0",
      overflow: "auto",
      padding: "0",
      scrollBehavior: "",
      overscrollBehavior: "",
    });
    Object.assign(track.style, {
      minWidth: "",
      minHeight: "",
      width: "",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "",
      gap: "6px",
      padding: "6px 0",
    });
    Object.assign(classicNavigationRow.style, {
      flex: "0 0 30px",
      alignSelf: "center",
      width: "calc(100% - 12px)",
      height: "30px",
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "4px",
      padding: "2px",
      boxSizing: "border-box",
      border: "1px solid rgba(148,163,184,.20)",
      borderRadius: "10px",
      background: "rgba(9,13,21,.44)",
    });
    for (const [button, text, label, primary] of [
      [btnPrev, "▲", "Turno precedente", false],
      [btnNext, "▼", "Turno successivo", true],
    ]) {
      button.textContent = text;
      button.title = label;
      button.setAttribute("aria-label", label);
      Object.assign(button.style, {
        flex: "",
        width: "100%",
        minWidth: "",
        height: "26px",
        minHeight: "",
        padding: "0 6px",
        border: primary ? "1px solid rgba(96,165,250,.58)" : "1px solid transparent",
        borderRadius: "8px",
        background: primary ? "rgba(37,99,235,.34)" : "transparent",
        boxShadow: primary ? "inset 0 1px 0 rgba(255,255,255,.10)" : "none",
        fontSize: "15px",
      });
    }
    classicNavigationRow.replaceChildren(btnPrev, btnNext);
    col.replaceChildren(topRow, trackWrap, classicNavigationRow);
  }
  applyHeaderLayoutPresentation(compact);
  applyToolbarLayoutPresentation(compact);
}

applyTrackerLayout();
// stile scrollbar (già presente, lo riutilizziamo)
function injectScrollbarStyles() {
  if (document.getElementById("tbp-scrollbar-style")) return;
  const s = document.createElement("style");
  s.id = "tbp-scrollbar-style";
  s.textContent = `
  .tbp-scroll::-webkit-scrollbar { width: 10px; height: 10px; }
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
  .tbp-scroll[data-compact-scroll="1"]::-webkit-scrollbar { height: 4px; }
  .tbp-scroll[data-compact-scroll="1"]::-webkit-scrollbar-thumb { background-color: rgba(148,163,184,.42); border-width: 1px; }
  .tbp-scroll[data-compact-scroll="1"]:hover::-webkit-scrollbar-thumb,
  .tbp-scroll[data-compact-scroll="1"].is-scrolling::-webkit-scrollbar-thumb { background-color: rgba(148,163,184,.58); }
  .tbp-scroll[data-compact-scroll="1"] { scrollbar-color: rgba(148,163,184,.42) transparent; }
  .tbp-scroll[data-compact-scroll="1"]:hover,
  .tbp-scroll[data-compact-scroll="1"].is-scrolling { scrollbar-color: rgba(148,163,184,.58) transparent; }
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
let __compactScrollActivityTimer = null;
function markCompactCarouselScrolling() {
  if (!isCompactTrackerLayout()) return;
  trackWrap.classList.add("is-scrolling");
  window.clearTimeout(__compactScrollActivityTimer);
  __compactScrollActivityTimer = window.setTimeout(() => {
    trackWrap.classList.remove("is-scrolling");
  }, 850);
}
trackWrap.addEventListener("wheel", (event) => {
  event.stopPropagation();
  if (isCompactTrackerLayout() && Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
    event.preventDefault();
    trackWrap.scrollLeft += event.deltaY;
  }
  markCompactCarouselScrolling();
}, { passive: false });
trackWrap.addEventListener("scroll", markCompactCarouselScrolling, { passive: true });


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


async function buildBiasedBBox(bounds, gridDpi, gridSpan = FOCUS_GRID_SPAN, minPadPx = FOCUS_MIN_PAD_PX) {
  const cx = (Number(bounds?.min?.x) + Number(bounds?.max?.x)) / 2;
  const cy = (Number(bounds?.min?.y) + Number(bounds?.max?.y)) / 2;

  const dpi = Math.max(1, Number(gridDpi) || FOCUS_FALLBACK_DPI);
  const focusSize = Math.max(1, dpi * gridSpan + 2 * minPadPx);

  return {
    min:   { x: cx - focusSize / 2, y: cy - focusSize / 2 },
    max:   { x: cx + focusSize / 2, y: cy + focusSize / 2 },
    width:  focusSize,
    height: focusSize,
    center: { x: cx, y: cy },
  };
}

async function centerOnItem(itemId, expectedNavigationRevision = null) {
  if (!itemId) return false;
  try {
    const items = await OBR.scene.items.getItems([itemId]);
    if (!items || items.length === 0) return false;

    const [raw, gridDpi] = await Promise.all([
      OBR.scene.items.getItemBounds([itemId]),
      OBR.scene.grid.getDpi().catch(() => FOCUS_FALLBACK_DPI),
    ]);
    if (!raw) return false;

    const biased = await buildBiasedBBox(raw, gridDpi);
    if (
      expectedNavigationRevision !== null &&
      expectedNavigationRevision !== __navigationRevision
    ) {
      __initiativeDiag("viewport:focus-skipped-before-animate", {
        anchorId: itemId,
        navigationRevision: expectedNavigationRevision,
      });
      return false;
    }
    await OBR.viewport.animateToBounds(biased);
    return true;
  } catch (e) {
    console.warn("[initiative] centerOnItem failed:", e?.message || e);
    return false;
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
let __selectFocusRunningKey = null;
let __selectFocusCompletedKey = null;
const VIEWPORT_FOCUS_SETTLE_MS = 220;
let __viewportFocusDesired = null;
let __viewportFocusTimer = null;
let __viewportFocusRunning = false;

function __scheduleViewportFocus(itemId, revision) {
  __viewportFocusDesired = {
    itemId,
    revision,
    queuedAt: Date.now(),
  };
  if (__viewportFocusTimer !== null) {
    window.clearTimeout(__viewportFocusTimer);
    __viewportFocusTimer = null;
  }
  __initiativeDiag("viewport:focus-queued", {
    anchorId: itemId,
    navigationRevision: revision,
  });
  if (__viewportFocusRunning) return;
  __viewportFocusTimer = window.setTimeout(() => {
    __viewportFocusTimer = null;
    void __flushViewportFocus();
  }, VIEWPORT_FOCUS_SETTLE_MS);
}

async function __flushViewportFocus() {
  if (__viewportFocusRunning) return;
  const desired = __viewportFocusDesired;
  if (!desired) return;
  const expectedAnchorId = __resolveAnchorForActive(__activeIdForState(__latestInitiativeState));
  if (desired.revision !== __navigationRevision || desired.itemId !== expectedAnchorId) {
    if (__viewportFocusDesired === desired) __viewportFocusDesired = null;
    __initiativeDiag("viewport:focus-skipped-stale", {
      anchorId: desired.itemId,
      expectedAnchorId,
      navigationRevision: desired.revision,
    });
    return;
  }

  __viewportFocusDesired = null;
  __viewportFocusRunning = true;
  __initiativeDiag("viewport:focus-start", {
    anchorId: desired.itemId,
    navigationRevision: desired.revision,
  });
  try {
    const animated = await centerOnItem(desired.itemId, desired.revision);
    if (!animated) return;
    __initiativeDiag(
      desired.revision === __navigationRevision
        ? "viewport:focus-complete"
        : "viewport:focus-complete-stale",
    {
      anchorId: desired.itemId,
      navigationRevision: desired.revision,
    });
  } catch (err) {
    console.warn("[initiative] viewport focus queue error:", err?.message || err);
  } finally {
    __viewportFocusRunning = false;
    if (__viewportFocusDesired) {
      const elapsed = Date.now() - __viewportFocusDesired.queuedAt;
      const wait = Math.max(0, VIEWPORT_FOCUS_SETTLE_MS - elapsed);
      __viewportFocusTimer = window.setTimeout(() => {
        __viewportFocusTimer = null;
        void __flushViewportFocus();
      }, wait);
    }
  }
}

function queueSelectAndFocus(itemId, autoFocus = true) {
  const expectedActiveId = __activeIdForState(__latestInitiativeState);
  if (expectedActiveId && itemId !== expectedActiveId) {
    __initiativeDiag("selection:skipped-stale", {
      activeId: itemId,
      expectedActiveId,
      navigationRevision: __navigationRevision,
    });
    return;
  }
  const anchorId = __resolveAnchorForActive(itemId);
  if (!anchorId) return;
  const requestKey = `${__navigationRevision}\u0000${anchorId}\u0000${autoFocus ? "1" : "0"}`;
  if (
    requestKey === __selectFocusDesired?.key ||
    requestKey === __selectFocusRunningKey ||
    requestKey === __selectFocusCompletedKey
  ) {
    __initiativeDiag("selection:skipped-duplicate", {
      activeId: itemId,
      anchorId,
      navigationRevision: __navigationRevision,
    });
    return;
  }
  __selectFocusDesired = {
    itemId: anchorId,
    autoFocus,
    revision: __navigationRevision,
    key: requestKey,
  };
  __initiativeDiag("selection:queued", {
    activeId: itemId,
    anchorId,
    autoFocus,
    navigationRevision: __navigationRevision,
  });
  if (IS_GM) {
    __setTrackerSelection([anchorId]);
    __initiativeDiag("selection:optimistic", {
      anchorId,
      navigationRevision: __navigationRevision,
    });
  }
  if (autoFocus) {
    __scheduleViewportFocus(anchorId, __navigationRevision);
  } else {
    __viewportFocusDesired = null;
    if (__viewportFocusTimer !== null) {
      window.clearTimeout(__viewportFocusTimer);
      __viewportFocusTimer = null;
    }
  }
  if (__selectFocusPumpRunning) return;

  __selectFocusPumpRunning = true;
  void (async () => {
    try {
      while (__selectFocusDesired) {
        const desired = __selectFocusDesired;
        __selectFocusDesired = null;
        if (desired.revision !== __navigationRevision) continue;
        __selectFocusRunningKey = desired.key;

        __initiativeDiag("selection:select-start", {
          anchorId: desired.itemId,
          navigationRevision: desired.revision,
        });
        await selectInScene(desired.itemId, true);
        __initiativeDiag("selection:select-complete", {
          anchorId: desired.itemId,
          navigationRevision: desired.revision,
        });
        if (desired.revision === __navigationRevision) {
          __selectFocusCompletedKey = desired.key;
        }
        __selectFocusRunningKey = null;
      }
    } catch (err) {
      __selectFocusCompletedKey = null;
      console.warn("[initiative] select/focus queue error:", err?.message || err);
    } finally {
      __selectFocusRunningKey = null;
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

function __activeTurnLabelWidth(text) {
  return Math.min(
    ACTIVE_LABEL_MAX_WIDTH,
    Math.max(72, Math.ceil(String(text ?? "").length * ACTIVE_LABEL_FONT * 0.58 + 24))
  );
}

function __activeTurnLabelPosition(anchor, bounds, dpi) {
  const minX = Number(bounds?.min?.x);
  const maxX = Number(bounds?.max?.x);
  const minY = Number(bounds?.min?.y);
  const centerX = Number.isFinite(minX) && Number.isFinite(maxX)
    ? (minX + maxX) / 2
    : Number(anchor?.position?.x) || 0;
  const topY = Number.isFinite(minY)
    ? minY
    : (Number(anchor?.position?.y) || 0) - (Math.max(1, Number(dpi) || 1) / 2);
  return {
    x: centerX,
    y: topY - ACTIVE_LABEL_GAP_PX,
  };
}

function __setActiveTurnLabelText(item, text) {
  const textValue = String(text ?? "");
  const width = __activeTurnLabelWidth(textValue);
  const prevTextStyle =
    (item.text && typeof item.text === "object" && item.text.style) || {};
  item.text = item.text && typeof item.text === "object" ? item.text : {};
  item.text.type = "PLAIN";
  item.text.plainText = textValue;
  item.text.width = width;
  item.text.height = ACTIVE_LABEL_HEIGHT;
  item.text.style = {
    ...prevTextStyle,
    padding: 0,
    fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    fontSize: ACTIVE_LABEL_FONT,
    fontWeight: 600,
    lineHeight: 1,
    textAlign: "CENTER",
    textAlignVertical: "MIDDLE",
    fillColor: "#f8fafc",
    fillOpacity: 1,
    strokeColor: "rgba(2,6,23,.55)",
    strokeWidth: 1,
  };
  item.style = {
    ...(item.style || {}),
    backgroundColor: ACTIVE_LABEL_BG,
    backgroundOpacity: ACTIVE_LABEL_BG_OPACITY,
    cornerRadius: ACTIVE_LABEL_HEIGHT / 2,
    pointerWidth: ACTIVE_LABEL_POINTER_WIDTH,
    pointerHeight: ACTIVE_LABEL_POINTER_HEIGHT,
    pointerDirection: "DOWN",
    maxViewScale: ACTIVE_LABEL_MAX_VIEW_SCALE,
  };
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
        item.locked = true;
        item.disableHit = true;
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

  let anchorBounds = null;
  try { anchorBounds = await OBR.scene.items.getItemBounds([anchorId]); } catch {}
  const pos = __activeTurnLabelPosition(anchor, anchorBounds, dpi);

  if (!existing) {
    if (revision !== __activeTurnLabelRevision) return;
    __mutatingActiveLabel++;
    try {
      const labelWidth = __activeTurnLabelWidth(textStr);
      const item = buildLabel()
        .plainText(textStr)
        .width(labelWidth)
        .height(ACTIVE_LABEL_HEIGHT)
        .padding(0)
        .fontFamily('"Helvetica Neue", Helvetica, Arial, sans-serif')
        .fontSize(ACTIVE_LABEL_FONT)
        .fontWeight(600)
        .lineHeight(1)
        .textAlign("CENTER")
        .textAlignVertical("MIDDLE")
        .fillColor("#f8fafc")
        .strokeColor("rgba(2,6,23,.55)")
        .strokeWidth(1)
        .layer("TEXT")
        .position(pos)
        .attachedTo(anchorId)
        .locked(true)
        .disableHit(true)
        .style({
          backgroundColor: ACTIVE_LABEL_BG,
          backgroundOpacity: ACTIVE_LABEL_BG_OPACITY,
          cornerRadius: ACTIVE_LABEL_HEIGHT / 2,
          pointerDirection: "DOWN",
          pointerWidth: ACTIVE_LABEL_POINTER_WIDTH,
          pointerHeight: ACTIVE_LABEL_POINTER_HEIGHT,
          maxViewScale: ACTIVE_LABEL_MAX_VIEW_SCALE,
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
      item.locked = true;
      item.disableHit = true;
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
  } catch (err) {
    __activeTurnLabelInitialized = false;
    __activeTurnLabel = null;
    throw err;
  } finally {
    __mutatingActiveLabel--;
  }
}
async function __pumpActiveTurnLabel() {
  if (__activeTurnLabelPumpRunning) return;
  __activeTurnLabelPumpRunning = true;
  let failedDesired = null;
  try {
    while (__activeTurnLabelDesired) {
      const desired = __activeTurnLabelDesired;
      __activeTurnLabelDesired = null;
      failedDesired = desired;
      if (
        desired.revision !== __activeTurnLabelRevision ||
        desired.navigationRevision !== __navigationRevision
      ) {
        __initiativeDiag("label:skipped-superseded", {
          anchorId: desired.anchorId,
          labelRevision: desired.revision,
          navigationRevision: desired.navigationRevision,
        });
        continue;
      }
      __initiativeDiag("label:update-start", {
        anchorId: desired.anchorId,
        text: desired.text,
        labelRevision: desired.revision,
      });
      await upsertActiveTurnLabel(
        desired.anchorId,
        desired.text,
        desired.anchor,
        desired.revision
      );
      __initiativeDiag("label:update-complete", {
        anchorId: desired.anchorId,
        text: desired.text,
        labelRevision: desired.revision,
      });
      failedDesired = null;
    }
  } catch (err) {
    __activeTurnLabelLatestKey = null;
    if (failedDesired && !__activeTurnLabelDesired) __activeTurnLabelDesired = failedDesired;
    console.warn("[active-label] update queue error:", err?.message || err);
  } finally {
    __activeTurnLabelPumpRunning = false;
    if (__activeTurnLabelDesired) {
      if (__activeTurnLabelRetryTimer === null) {
        __activeTurnLabelRetryTimer = window.setTimeout(() => {
          __activeTurnLabelRetryTimer = null;
          void __pumpActiveTurnLabel();
        }, 250);
      }
    }
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
    navigationRevision: __navigationRevision,
  };
  __initiativeDiag("label:queued", {
    activeId,
    anchorId,
    text,
    labelRevision: revision,
  });

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
  __initiativeDiag("navigation:flush-start", {
    activeId: __activeIdForState(desired),
    round: desired.round,
    current: desired.current,
    navigationRevision: __navigationRevision,
  });
  try {
    await setSceneState(desired);
    const desiredActiveId = __activeIdForState(desired);
    const latestActiveId = __activeIdForState(__latestInitiativeState);
    if (!__navigationDesiredState && desiredActiveId === latestActiveId) {
      syncActiveTurnLabel(desiredActiveId);
    }
    __initiativeDiag("navigation:flush-complete", {
      activeId: desiredActiveId,
      navigationRevision: __navigationRevision,
    });
  } catch (err) {
    console.warn("[initiative] navigation queue error:", err?.message || err);
    if (!__navigationDesiredState) {
      __optimisticNavigationDigest = null;
      __lastNavigationAt = 0;
      try {
        __latestInitiativeState = await getSceneState();
        await renderAll("navigation-error");
      } catch (reconcileErr) {
        console.warn("[initiative] navigation reconcile error:", reconcileErr?.message || reconcileErr);
      }
    }
  } finally {
    __navigationPumpRunning = false;
    if (__navigationDesiredState) __scheduleNavigationStateFlush();
  }
}

function queueNavigationState(next) {
  __navigationDesiredState = next;
  __navigationDesiredAt = Date.now();
  __initiativeDiag("navigation:queued", {
    activeId: __activeIdForState(next),
    round: next?.round,
    current: next?.current,
    navigationRevision: __navigationRevision,
  });
  __scheduleNavigationStateFlush();
}
function __activeIdForState(state) {
  return Array.isArray(state?.order) ? state.order[state.current] : null;
}

function __matchesLatestActiveTurn(state) {
  if (!__latestInitiativeState) return true;
  return (
    __activeIdForState(state) === __activeIdForState(__latestInitiativeState) &&
    Math.floor(Number(state?.current) || 0) === Math.floor(Number(__latestInitiativeState?.current) || 0) &&
    Math.max(1, Math.floor(Number(state?.round) || 1)) ===
      Math.max(1, Math.floor(Number(__latestInitiativeState?.round) || 1))
  );
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
      legendaryResistances: (() => {
        if (!meta.legendary || Number(meta.legendary.max) <= 0) return { max: 0, current: 0 };
        const stored = meta.legendaryResistances;
        const max = stored && typeof stored === "object"
          ? Math.max(0, Math.floor(Number(stored.max) || 0))
          : DEFAULT_LEGENDARY_RESISTANCES;
        const current = stored && typeof stored === "object"
          ? Math.max(0, Math.min(max, Math.floor(Number(stored.current) || 0)))
          : max;
        return { max, current };
      })(),
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
function __selectionIdsForEntry(entry) {
  const members = Array.isArray(entry?.__groupMembers) && entry.__groupMembers.length
    ? entry.__groupMembers
    : [entry];
  return Array.from(new Set(members
    .map((member) => splitParagonId(member?.id).baseId)
    .filter((id) => id && !isLairId(id) && !isEpicActionId(id))));
}

function __applyTrackerSelectionState(card) {
  const ids = Array.isArray(card?.__selectionItemIds) ? card.__selectionItemIds : [];
  const selectedCount = ids.filter((id) => __selectedSceneItemIds.has(id)).length;
  const fullySelected = ids.length > 0 && selectedCount === ids.length;
  const partlySelected = selectedCount > 0 && !fullySelected;
  card.dataset.selectionState = fullySelected ? "all" : partlySelected ? "partial" : "none";
  __syncTrackerCardStateClasses(card);
  if (card.__selectionBaseShadow == null) {
    card.__selectionBaseShadow = card.style.boxShadow || "";
  }

  if (card.dataset.compactCard === "1") {
    const glow = fullySelected
      ? "0 0 0 2px rgba(255,255,255,.96), 0 0 12px 4px rgba(255,255,255,.68), 0 0 22px 7px rgba(255,255,255,.30)"
      : partlySelected
        ? "0 0 0 1px rgba(255,255,255,.82), 0 0 9px 3px rgba(255,255,255,.48)"
        : "";
    card.style.boxShadow = [card.__selectionBaseShadow, glow].filter(Boolean).join(", ");
    card.style.outline = "none";
    card.style.outlineOffset = "";
    return;
  }

  const glow = fullySelected
    ? "0 0 0 2px rgba(255,255,255,.98), 0 0 11px 4px rgba(255,255,255,.92), 0 0 25px 9px rgba(255,255,255,.50)"
    : partlySelected
      ? "0 0 0 1px rgba(255,255,255,.84), 0 0 9px 3px rgba(255,255,255,.72), 0 0 19px 6px rgba(255,255,255,.32)"
      : "";
  card.style.boxShadow = [card.__selectionBaseShadow, glow].filter(Boolean).join(", ");
  card.style.outline = "none";
  card.style.outlineOffset = "";
}

function __setTrackerSelection(ids) {
  const next = new Set(Array.isArray(ids) ? ids.filter(Boolean) : []);
  if (next.size === __selectedSceneItemIds.size &&
      [...next].every((id) => __selectedSceneItemIds.has(id))) return;
  __selectedSceneItemIds = next;
  document.querySelectorAll("[data-tracker-card='1']").forEach(__applyTrackerSelectionState);
}

async function __refreshTrackerSelectionFromScene() {
  if (__playerSelectionPollBusy) return;
  __playerSelectionPollBusy = true;
  try { __setTrackerSelection(await OBR.player.getSelection()); } catch {}
  finally { __playerSelectionPollBusy = false; }
}

async function __selectTrackerEntry(entry, event) {
  const ids = __selectionIdsForEntry(entry);
  if (!ids.length) return;
  const additive = !!(event?.ctrlKey || event?.metaKey || event?.shiftKey);

  try {
    if (!additive) {
      __setTrackerSelection(ids);
      await OBR.player.select(ids, true);
      return;
    }

    const allSelected = ids.every((id) => __selectedSceneItemIds.has(id));
    const next = new Set(__selectedSceneItemIds);
    for (const id of ids) {
      if (allSelected) next.delete(id);
      else next.add(id);
    }
    __setTrackerSelection([...next]);
    if (allSelected) await OBR.player.deselect(ids);
    else await OBR.player.select(ids, false);
  } catch (err) {
    console.warn("[initiative] tracker selection error:", err?.message || err);
    try { __setTrackerSelection(await OBR.player.getSelection()); } catch {}
  }
}

async function __mountTrackerSelectionSync() {
  if (__playerSelectionUnsubscribe) return;
  await __refreshTrackerSelectionFromScene();
  __playerSelectionUnsubscribe = OBR.player.onChange((player) => {
    if (Array.isArray(player?.selection)) __setTrackerSelection(player.selection);
  });
  __playerSelectionPollTimer = window.setInterval(__refreshTrackerSelectionFromScene, 1500);
}

// Collassa TUTTI i gruppi (len>1) tranne quello dell'elemento attivo
async function __applyAutoCollapse(entries, state) {
  const { collapsed, changed } = __autoCollapseSnapshot(entries, state);
  if (changed) await setSceneState(prev => ({ ...(prev || {}), collapsed }));
  __initiativeDiag(changed ? "collapse:changed" : "collapse:unchanged", {
    activeId: __activeIdForState(state),
  });
  return changed;
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
  await reconcileZeroHPConditionsForItems(targetIds);

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
  syncTrackerHPNow(itemId, n, nm);

  await OBR.scene.items.updateItems([itemId], (items) => {
    for (const it of items) {
      const prevMeta = (it.metadata && it.metadata[META_KEY]) || {};
      it.metadata = {
        ...(it.metadata || {}),
        [META_KEY]: { ...prevMeta, hp: n, hpMax: nm },
      };
    }
  });
  await reconcileZeroHPConditionsForItems([itemId]);


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

function concentrationSaveDC(damage) {
  return Math.max(10, Math.floor(Math.max(0, Number(damage) || 0) / 2));
}

let __concentrationWarningListenerMounted = false;
let __concentrationWarningModalQueue = Promise.resolve();

function normalizeConcentrationWarnings(values = []) {
  return (Array.isArray(values) ? values : []).slice(0, 20).map((warning) => ({
    name: String(warning?.name || "Token").trim().slice(0, 80) || "Token",
    damage: Math.max(0, Math.floor(Number(warning?.damage) || 0)),
    dc: Math.max(10, Math.floor(Number(warning?.dc) || 10)),
    portrait: String(warning?.portrait || "").trim().slice(0, 2048),
    attitude: String(warning?.attitude || "neutral").trim().toLowerCase(),
  })).filter((warning) => warning.damage > 0);
}

async function openConcentrationWarningModal(data) {
  const warnings = normalizeConcentrationWarnings(data?.warnings);
  if (!warnings.length) return;

  try { await OBR.modal.close(CONCENTRATION_WARNING_MODAL_ID); } catch {}
  const payload = encodeURIComponent(JSON.stringify({ warnings }));
  await OBR.modal.open({
    id: CONCENTRATION_WARNING_MODAL_ID,
    url: `/concentration-warning.html?payload=${payload}`,
    fullScreen: true,
    hideBackdrop: true,
    hidePaper: true,
    disablePointerEvents: true,
  });
}

function mountConcentrationWarningBroadcast() {
  if (__concentrationWarningListenerMounted) return;
  __concentrationWarningListenerMounted = true;
  OBR.broadcast.onMessage(CONCENTRATION_WARNING_CHANNEL, (event) => {
    if (event?.data?.type !== "show-concentration-warning") return;
    const run = async () => {
      try {
        await openConcentrationWarningModal(event.data);
      } catch (err) {
        console.warn("[concentration] warning modal error:", err?.message || err);
      }
    };
    __concentrationWarningModalQueue = __concentrationWarningModalQueue.then(run, run);
  });
}

let __turnNoticeListenerMounted = false;
let __turnNoticeSequence = 0;

async function mountTurnNoticeBroadcast() {
  if (__turnNoticeListenerMounted) return;
  __turnNoticeListenerMounted = true;
  await OBR.modal.open({
    id: TURN_NOTICE_MODAL_ID,
    url: "/turn-notice.html",
    fullScreen: true,
    hideBackdrop: true,
    hidePaper: true,
    disablePointerEvents: true,
  });
}

async function broadcastTurnNotice(state) {
  if (!IS_GM) return;
  const notice = buildTurnNoticePayload(state, __activeLabelEntriesById);
  if (!notice) return;
  await OBR.broadcast.sendMessage(TURN_NOTICE_CHANNEL, {
    type: "show-turn-notice",
    ...notice,
    noticeId: (Date.now() * 1000) + (++__turnNoticeSequence % 1000),
  }, { destination: "ALL" });
}
async function showConcentrationDamageWarning(changes = []) {
  if (!IS_GM) return;

  const damageById = new Map();
  for (const change of changes) {
    const itemId = String(change?.itemId || "").trim();
    const damage = Math.max(0, Math.floor(Number(change?.damage) || 0));
    if (!itemId || damage <= 0) continue;
    damageById.set(itemId, Math.max(damageById.get(itemId) || 0, damage));
  }
  if (!damageById.size) return;

  const items = await OBR.scene.items.getItems([...damageById.keys()]);
  const warnings = [];
  for (const item of items) {
    const concentration = item.metadata?.[META_KEY]?.[CONC_META_KEY];
    if (!concentration || typeof concentration !== "object" || !Object.keys(concentration).length) continue;
    const damage = damageById.get(item.id) || 0;
    warnings.push({
      name: item.name || "Token",
      damage,
      dc: concentrationSaveDC(damage),
      portrait: getTokenImageUrl(item) || "",
      attitude: item.metadata?.[META_KEY]?.attitude || "neutral",
    });
  }
  if (!warnings.length) return;

  await OBR.broadcast.sendMessage(CONCENTRATION_WARNING_CHANNEL, {
    type: "show-concentration-warning",
    warnings,
    createdAt: Date.now(),
  }, { destination: "ALL" });
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
    syncTrackerHPNow(update.itemId, update.hp, update.hpMax);
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
  await reconcileZeroHPConditionsForItems([...byId.keys()]);

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
  const historyIds = await getZeroHPConditionHistoryIds(
    updates.map((update) => update.itemId)
  );
  await withItemMetaHistory({
    kind: "hp",
    label: `Ricalibrazione HP/Max gruppo: ${groupName} (×${updates.length})`,
    itemIds: historyIds,
    fields: ["hp", "hpMax", "conditions", SPELLS_META_KEY, CONC_META_KEY],
  }, () => updateMultipleHP(updates));

  return updates.length;
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
  const nHP = Math.max(0, Math.floor(Number(hp) || 0));
  const nHPMax = Math.max(0, Math.floor(Number(hpMax) || 0));
  const hasHP = nHPMax > 0;
  const pct = hasHP ? Math.max(0, Math.min(1, nHP / nHPMax)) : 0;
  const cards = Array.from(document.querySelectorAll("[data-tracker-card='1']"))
    .filter((card) => card.dataset.itemId === String(itemId) ||
      card.__selectionItemIds?.includes(String(itemId)));

  for (const card of cards) {
    const canSeeHP = card.dataset.hpCanSee === "1";
    const showHP = canSeeHP && hasHP;
    const knockedOut = showHP && card.dataset.groupCollapsed !== "1" && nHP <= 0;
    card.dataset.hpVisible = showHP ? "1" : "0";
    card.dataset.knockedOut = knockedOut ? "1" : "0";
    card.style.filter = knockedOut
      ? "saturate(.42) brightness(.72)"
      : card.dataset.compactCard === "1" && card.dataset.active === "1"
        ? "brightness(1.13)"
        : "none";
    card.style.opacity = knockedOut ? ".84" : "1";

    const pill = card.querySelector("[data-badge='hp']");
    if (pill && pill.dataset.hpEditing !== "1") {
      pill.innerHTML = formatHPHTML(nHP, nHPMax);
      pill.style.color = knockedOut ? "rgba(255,255,255,.58)" : "#fff";
    }

    const hpText = card.querySelector("[data-card-hp-text='1']");
    if (hpText) {
      hpText.textContent = showHP ? `HP ${nHP} / ${nHPMax}` : "";
      hpText.style.display = showHP ? "block" : "none";
      hpText.style.color = knockedOut ? "rgba(255,255,255,.58)" : "rgba(226,232,240,.82)";
    }

    const fill = card.querySelector("[data-hp-fill='1']");
    if (fill) {
      fill.style.width = `${pct * 100}%`;
      fill.style.background = knockedOut ? "#475569" : hpColorByPct(pct);
      if (fill.parentElement) fill.parentElement.style.display = showHP ? "block" : "none";
    }

    let koBadge = card.querySelector("[data-card-ko-badge='1']");
    if (knockedOut && !koBadge) {
      koBadge = compactStatusBadge("KO", `Fuori combattimento: 0 / ${nHPMax}`);
      koBadge.dataset.cardKoBadge = "1";
      Object.assign(koBadge.style, card.dataset.compactCard === "1" ? {
        position: "absolute", right: "6px", top: "6px", height: "21px",
        zIndex: "6", pointerEvents: "none",
      } : {
        position: "absolute", left: card.dataset.koBadgeLeft || "42px",
        top: card.dataset.koBadgeTop || "1px", height: "20px", minWidth: "25px",
        zIndex: "8", pointerEvents: "none",
      });
      card.appendChild(koBadge);
    } else if (!knockedOut) {
      koBadge?.remove();
    } else if (koBadge) {
      koBadge.title = `Fuori combattimento: 0 / ${nHPMax}`;
    }
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

async function setLegendaryResistanceCurrent(itemId, nextCurrent) {
  await OBR.scene.items.updateItems([itemId], (items) => {
    const it = items[0];
    if (!it) return;
    const metadata = it.metadata || {};
    const meta = { ...(metadata[META_KEY] || {}) };
    if (!meta.legendary || Number(meta.legendary.max) <= 0) return;
    const stored = meta.legendaryResistances;
    const max = stored && typeof stored === "object"
      ? Math.max(0, Math.floor(Number(stored.max) || 0))
      : DEFAULT_LEGENDARY_RESISTANCES;
    const current = Math.max(0, Math.min(max, Math.floor(Number(nextCurrent) || 0)));
    meta.legendaryResistances = { max, current };
    metadata[META_KEY] = meta;
    it.metadata = metadata;
  });
}

async function setLegendaryResistanceMax(itemId, nextMax) {
  const max = Math.max(1, Math.min(5, Math.floor(Number(nextMax) || 0)));
  await OBR.scene.items.updateItems([itemId], (items) => {
    const it = items[0];
    if (!it) return;
    const metadata = it.metadata || {};
    const meta = { ...(metadata[META_KEY] || {}) };
    if (!meta.legendary || Number(meta.legendary.max) <= 0) return;
    const stored = meta.legendaryResistances;
    const current = stored && typeof stored === "object"
      ? Math.max(0, Math.min(max, Math.floor(Number(stored.current) || 0)))
      : Math.min(max, DEFAULT_LEGENDARY_RESISTANCES);
    meta.legendaryResistances = { max, current };
    metadata[META_KEY] = meta;
    it.metadata = metadata;
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


// ===== Legendary UI helpers: diamanti per le azioni, scudi per le resistenze =====
function mkLegendaryResourcePips(resource, onSet, attitude = "enemy", kind = "action") {
  const wrap = document.createElement("div");
  Object.assign(wrap.style, {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: `${LEG_PIPS_CFG.gap}px`,
    flexDirection: "row",
    justifyContent: "flex-start",
  });

  const max = Math.max(0, Number(resource?.max) || 0);
  const cur = Math.max(0, Math.min(max, Number(resource?.current) || 0));
  const isResistance = kind === "resistance";

  const ON = (() => {
    if (isResistance) return { bg: "#3b82f6", glow: "drop-shadow(0 0 4px rgba(96,165,250,.88))" };
    if (attitude === "enemy")   return { bg: "#eee8e6", glow: "0 0 8px rgba(255, 61, 61, 0.7)" };
    if (attitude === "neutral") return { bg: "#a16207", glow: "0 0 7px rgba(161,98,7,.60)"  };
    return { bg: "#7f1d1d", glow: "0 0 6px rgba(127,29,29,.55)" };
  })();

  for (let i = 1; i <= max; i++) {
    const pip = document.createElement("button");
    pip.type = "button";
    const size = isResistance ? LEG_PIPS_CFG.size + 1 : LEG_PIPS_CFG.size;
    const baseTransform = isResistance ? "none" : "rotate(45deg)";
    Object.assign(pip.style, {
      width: `${size}px`,
      minWidth: `${size}px`,
      height: `${size}px`,
      minHeight: `${size}px`,
      padding: "0",
      transform: baseTransform,
      clipPath: isResistance
        ? "polygon(50% 0, 94% 18%, 82% 72%, 50% 100%, 18% 72%, 6% 18%)"
        : "none",
      borderRadius: isResistance ? "0" : "1px",
      border: isResistance ? "none" : "1px solid rgba(255,255,255,.28)",
      background: isResistance ? "rgba(15,23,42,.92)" : "rgba(0,0,0,.58)",
      boxShadow: isResistance ? "none" : "inset 0 0 0 1px rgba(0,0,0,.5)",
      filter: isResistance ? "drop-shadow(0 0 1px rgba(147,197,253,.85))" : "none",
      opacity: "1",
      cursor: IS_GM ? "pointer" : "default",
      transition: "transform .12s ease, opacity .12s ease, box-shadow .12s ease, filter .12s ease, background-color .12s ease",
    });
    if (i <= cur) {
      pip.style.background = ON.bg;
      if (isResistance) pip.style.filter = ON.glow;
      else pip.style.boxShadow = `${ON.glow}, inset 0 0 1px rgba(0,0,0,.6)`;
    }
    const label = isResistance ? "Resistenza leggendaria" : "Azione leggendaria";
    pip.title = `${label}: ${cur}/${max}`;
    pip.setAttribute("aria-label", `${label} ${i} di ${max}`);
    pip.setAttribute("aria-pressed", i <= cur ? "true" : "false");
    pip.addEventListener("mouseenter", () => {
      pip.style.transform = `${baseTransform === "none" ? "" : `${baseTransform} `}scale(1.12)`;
      pip.style.opacity = "1";
    });
    pip.addEventListener("mouseleave", () => {
      pip.style.transform = baseTransform;
      pip.style.opacity = ".9";
    });
    pip.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (!IS_GM) return;
      const next = i <= cur ? i - 1 : i;
      onSet(next);
    });

    wrap.appendChild(pip);
  }
  return wrap;
}

function mkLegendaryPips(legendary, onSet, attitude = "enemy") {
  return mkLegendaryResourcePips(legendary, onSet, attitude, "action");
}

function mkLegendaryResistancePips(resistances, onSet) {
  return mkLegendaryResourcePips(resistances, onSet, "enemy", "resistance");
}

// Quanti chip mostrare prima del "+N"
const MAX_VISIBLE_CHIPS = 3;

// Stile pill generico, simile ai chip
function styleChipPill(el, { compact = true } = {}) {
  Object.assign(el.style, {
    fontSize: compact ? "10px" : "11px",
    fontWeight: "600",
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
  dock.style.flexDirection = "column";
  dock.style.alignItems = "flex-start";
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
    flexDirection: "column",
    alignItems: "flex-start",
    gap: CHIP_GAP_PX + "px",
    paddingTop: "2px",
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

  const more = document.createElement("button");
  more.type = "button";
  more.textContent = `+${hidden.length} ⌄`;
  more.dataset.cardSelectionIgnore = "1";
  more.setAttribute("aria-expanded", "false");
  more.setAttribute("aria-label", `Mostra altri ${hidden.length} effetti`);
  styleChipPill(more, { compact });
  Object.assign(more.style, {
    minHeight: "20px",
    height: "18px",
    padding: "0 6px 2px",
    fontFamily: "inherit",
  });
  more.title = `Mostra altri ${hidden.length} effetti`;
  let expanded = false;
  const ownerCard = dock.closest('[data-tracker-card="1"]');
  const ownerZIndex = ownerCard?.style.zIndex || "";

  more.addEventListener("click", (ev) => {
    ev.stopPropagation();
    expanded = !expanded;
    row2.style.display = expanded ? "flex" : "none";
    more.setAttribute("aria-expanded", expanded ? "true" : "false");
    more.setAttribute("aria-label", expanded ? "Comprimi effetti" : `Mostra altri ${hidden.length} effetti`);
    more.textContent = expanded ? "− ⌃" : `+${hidden.length} ⌄`;
    more.style.background = expanded ? "rgba(59,130,246,.82)" : "rgba(0,0,0,.72)";
    more.title = expanded ? "Comprimi effetti" : `Mostra altri ${hidden.length} effetti`;
    if (ownerCard) ownerCard.style.zIndex = expanded ? "30" : ownerZIndex;
  });

  row1.appendChild(more);
  dock.append(row1, row2);
}


async function getTrackerPopoverAnchor() {
  let trackerWidth = 340;
  try {
    trackerWidth = Math.max(240, Number(await OBR.action.getWidth()) || trackerWidth);
  } catch {}
  const viewportWidth = Math.max(
    Number(window.innerWidth) || 0,
    Number(document.documentElement?.getBoundingClientRect?.().width) || 0,
    Number(document.body?.getBoundingClientRect?.().width) || 0,
  );
  trackerWidth = Math.max(trackerWidth, viewportWidth);
  return { left: Math.ceil(trackerWidth) + 14, top: 52 };
}

async function resolveGlobalPopupSourceEntry() {
  const [entries, state, selection] = await Promise.all([
    readEntries(),
    getSceneState(),
    OBR.player.getSelection().catch(() => []),
  ]);
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  for (const selectedId of Array.isArray(selection) ? selection : []) {
    const entry = byId.get(splitParagonId(selectedId).baseId);
    if (entry) return entry;
  }
  const order = Array.isArray(state?.order) ? state.order : [];
  const activeIndex = Math.max(0, Math.min(order.length - 1, state?.current ?? 0));
  const activeId = order.length ? order[activeIndex] : "";
  const activeEntry = byId.get(splitParagonId(activeId).baseId);
  return activeEntry || entries[0] || null;
}

async function openGlobalEffectsPopup() {
  const sourceEntry = await resolveGlobalPopupSourceEntry();
  if (sourceEntry) await openCardEffectsPopup(sourceEntry);
}

async function openGlobalSpellsPopup() {
  const sourceEntry = await resolveGlobalPopupSourceEntry();
  if (sourceEntry) await openCardSpellsPopup(sourceEntry);
}

async function openGlobalQuickHPPopup() {
  await openQuickHPPopup();
}

const TRACKER_POPOVER_TOGGLE_CHANNEL = `${ID}/tracker-popover-toggle`;
const TRACKER_POPOVER_IDS = [
  `${ID}/history-modal`,
  `${ID}/effects-modal`,
  `${ID}/spells-modal`,
  `${ID}/quick-hp-modal`,
  `${ID}/initiative-card-modal`,
  `${ID}/compact-effects-popover`,
];
let __openTrackerPopoverId = "";

function syncGlobalPanelButtonPressedState() {
  globalEffectsButton.setAttribute("aria-pressed", String(__openTrackerPopoverId === EFFECTS_POPUP_ID));
  globalSpellsButton.setAttribute("aria-pressed", String(__openTrackerPopoverId === SPELLS_POPUP_ID));
  globalQuickHPButton.setAttribute("aria-pressed", String(__openTrackerPopoverId === QUICK_HP_POPUP_ID));
  applyToolbarLayoutPresentation(isCompactTrackerLayout());
}

function setOpenTrackerPopoverId(popupId = "") {
  __openTrackerPopoverId = popupId;
  syncGlobalPanelButtonPressedState();
}

function mountTrackerPopoverToggleListener() {
  OBR.broadcast.onMessage(TRACKER_POPOVER_TOGGLE_CHANNEL, (event) => {
    const data = event?.data;
    if (data?.type === "closed" && data.id === __openTrackerPopoverId) {
      setOpenTrackerPopoverId();
    }
    if (data?.type === "resize" && data.id === __openTrackerPopoverId) {
      const height = Math.max(320, Math.min(560, Math.round(Number(data.height) || 0)));
      void OBR.popover.setHeight(data.id, height).catch(() => {});
    }
  });
  OBR.broadcast.onMessage(TRACKER_PANEL_REQUEST_CHANNEL, (event) => {
    const data = event?.data;
    if (data?.type !== "open") return;
    if (data.panel === "conditions" && __openTrackerPopoverId !== EFFECTS_POPUP_ID) {
      void openGlobalEffectsPopup();
    }
    if (data.panel === "quick-hp" && __openTrackerPopoverId !== QUICK_HP_POPUP_ID) {
      void openGlobalQuickHPPopup();
    }
  });
}

async function beginTrackerPopoverToggle(popupId) {
  if (__openTrackerPopoverId === popupId) {
    await OBR.popover.close(popupId).catch(() => {});
    setOpenTrackerPopoverId();
    return false;
  }
  await Promise.all(TRACKER_POPOVER_IDS.map((id) => OBR.popover.close(id).catch(() => {})));
  __expandedCompactEffectsId = null;
  setOpenTrackerPopoverId();
  return true;
}

async function openQuickHPPopup() {
  const popupId = QUICK_HP_POPUP_ID;
  if (!await beginTrackerPopoverToggle(popupId)) return;
  try { await OBR.modal.close(popupId); } catch {}
  try { await OBR.popover.close(popupId); } catch {}
  const anchorPosition = await getTrackerPopoverAnchor();
  try {
    await OBR.popover.open({
      id: popupId,
      url: "/quick-hp-modal.html",
      width: 620,
      height: 590,
      anchorReference: "POSITION",
      anchorPosition,
      anchorOrigin: { horizontal: "LEFT", vertical: "TOP" },
      transformOrigin: { horizontal: "LEFT", vertical: "TOP" },
      disableClickAway: true,
      marginThreshold: 12,
      hidePaper: true,
    });
    setOpenTrackerPopoverId(popupId);
  } catch (err) {
    setOpenTrackerPopoverId();
    console.warn("[quick-hp] popover open error:", err?.message || err);
  }
}

async function openCardEffectsPopup(sourceEntry, entries) {
  if (!sourceEntry || isLairId(sourceEntry.id) || isEpicActionId(sourceEntry.id)) return;

  const sourceId = splitParagonId(sourceEntry.id).baseId;
  if (!sourceId) return;

  const popupId = EFFECTS_POPUP_ID;
  if (!await beginTrackerPopoverToggle(popupId)) return;
  try { await OBR.modal.close(popupId); } catch {}
  try { await OBR.popover.close(popupId); } catch {}
  const anchorPosition = await getTrackerPopoverAnchor();
  try {
    await OBR.popover.open({
      id: popupId,
      url: `/effects-modal.html?source=${encodeURIComponent(sourceId)}`,
      width: 560,
      height: 560,
      anchorReference: "POSITION",
      anchorPosition,
      anchorOrigin: { horizontal: "LEFT", vertical: "TOP" },
      transformOrigin: { horizontal: "LEFT", vertical: "TOP" },
      disableClickAway: true,
      marginThreshold: 12,
      hidePaper: true,
    });
    setOpenTrackerPopoverId(popupId);
  } catch (err) {
    setOpenTrackerPopoverId();
    console.warn("[effects] popover open error:", err?.message || err);
  }
}

async function openCardSpellsPopup(sourceEntry) {
  if (!sourceEntry || isLairId(sourceEntry.id) || isEpicActionId(sourceEntry.id)) return;

  const sourceId = splitParagonId(sourceEntry.id).baseId;
  if (!sourceId) return;

  const popupId = SPELLS_POPUP_ID;
  if (!await beginTrackerPopoverToggle(popupId)) return;
  const popupUrl = `/spells-modal.html?source=${encodeURIComponent(sourceId)}`;
  const [anchorPosition] = await Promise.all([
    getTrackerPopoverAnchor(),
    fetch(popupUrl, { cache: "force-cache" }).catch(() => null),
  ]);
  try { await OBR.modal.close(popupId); } catch {}
  try { await OBR.popover.close(popupId); } catch {}
  try {
    await OBR.popover.open({
      id: popupId,
      url: popupUrl,
      width: 560,
      height: 560,
      anchorReference: "POSITION",
      anchorPosition,
      anchorOrigin: { horizontal: "LEFT", vertical: "TOP" },
      transformOrigin: { horizontal: "LEFT", vertical: "TOP" },
      disableClickAway: true,
      marginThreshold: 12,
      hidePaper: true,
    });
    setOpenTrackerPopoverId(popupId);
  } catch (err) {
    setOpenTrackerPopoverId();
    console.warn("[spells] popover open error:", err?.message || err);
  }
}

async function openInitiativeCardPopup(sourceEntry) {
  if (!sourceEntry || sourceEntry.__groupCollapsed || sourceEntry.attitude !== "pc" ||
      isLairId(sourceEntry.id) || isEpicActionId(sourceEntry.id)) return;

  const sourceId = splitParagonId(sourceEntry.id).baseId;
  if (!sourceId) return;

  const popupId = `${ID}/initiative-card-modal`;
  if (!await beginTrackerPopoverToggle(popupId)) return;
  try { await OBR.modal.close(popupId); } catch {}
  try { await OBR.popover.close(popupId); } catch {}
  const anchorPosition = await getTrackerPopoverAnchor();
  try {
    await OBR.popover.open({
      id: popupId,
      url: `/initiative-card-modal.html?source=${encodeURIComponent(sourceId)}`,
      width: 440,
      height: 380,
      anchorReference: "POSITION",
      anchorPosition,
      anchorOrigin: { horizontal: "LEFT", vertical: "TOP" },
      transformOrigin: { horizontal: "LEFT", vertical: "TOP" },
      disableClickAway: true,
      marginThreshold: 12,
      hidePaper: true,
    });
    __openTrackerPopoverId = popupId;
  } catch (err) {
    __openTrackerPopoverId = "";
    console.warn("[initiative-card] popover open error:", err?.message || err);
  }
}

let __initiativeCardContextMenu = null;
let __initiativeCardContextMenuAbort = null;

function __closeInitiativeCardContextMenu() {
  __initiativeCardContextMenuAbort?.abort();
  __initiativeCardContextMenuAbort = null;
  __initiativeCardContextMenu?.remove();
  __initiativeCardContextMenu = null;
}

function __cardBossMode(entry) {
  if (entry?.isEpic) return "epic";
  if (Number(entry?.paragonActions) > 1) return "paragon";
  if (Number(entry?.legendary?.max) > 0) return "legendary";
  return "none";
}

function __contextScopeIds(entry) {
  const entryIds = __selectionIdsForEntry(entry);
  if (entry?.__groupCollapsed) return entryIds;
  const trackerIds = new Set();
  document.querySelectorAll("[data-tracker-card='1']").forEach((card) => {
    for (const id of card.__selectionItemIds || []) trackerIds.add(id);
  });
  const selected = [...__selectedSceneItemIds].filter((id) => trackerIds.has(id));
  return selected.length > 1 ? selected : entryIds.slice(0, 1);
}

async function __selectContextScope(ids) {
  const scopeIds = Array.from(new Set((ids || []).filter(Boolean)));
  if (!scopeIds.length) return;
  __setTrackerSelection(scopeIds);
  await OBR.player.select(scopeIds, true);
}

async function __setCardAttitude(ids, attitude) {
  const scopeIds = Array.from(new Set((ids || []).filter(Boolean)));
  if (!scopeIds.length) return;
  await OBR.scene.items.updateItems(scopeIds, (items) => {
    for (const item of items) {
      const meta = { ...(item.metadata?.[META_KEY] || {}), attitude };
      item.metadata = { ...(item.metadata || {}), [META_KEY]: meta };
    }
  });
  await rememberFactionForIds(scopeIds, attitude).catch(() => {});
  await reconcileStateWithItems();
  await renderAll();
}

async function __setCardBossMode(entry, mode) {
  const id = splitParagonId(entry?.id).baseId;
  if (!id) return;
  await OBR.scene.items.updateItems([id], (items) => {
    const item = items[0];
    if (!item) return;
    const meta = { ...(item.metadata?.[META_KEY] || {}) };
    delete meta.legendary;
    delete meta.legendaryResistances;
    delete meta.paragon;
    delete meta.epic;
    if (mode === "legendary") {
      meta.legendary = { max: 3, current: 3 };
      meta.legendaryResistances = {
        max: DEFAULT_LEGENDARY_RESISTANCES,
        current: DEFAULT_LEGENDARY_RESISTANCES,
      };
    }
    if (mode === "paragon") meta.paragon = { actions: 2 };
    if (mode === "epic") {
      meta.epic = { enabled: 1 };
      meta.initiative = 20;
    }
    item.metadata = { ...(item.metadata || {}), [META_KEY]: meta };
  });
  await setSceneState((previous) => {
    const paragonInits = { ...(previous?.paragonInits || {}) };
    if (mode === "paragon") {
      const initiative = Number(entry?.initiative) || 10;
      paragonInits[id] = [initiative, initiative];
    } else {
      delete paragonInits[id];
    }
    return { ...(previous || {}), paragonInits };
  });
  await reconcileStateWithItems();
  await renderAll();
}

async function __removeCardFromInitiative(ids) {
  const scopeIds = Array.from(new Set((ids || []).filter(Boolean)));
  if (!scopeIds.length) return;
  await OBR.scene.items.updateItems(scopeIds, (items) => {
    for (const item of items) {
      const meta = { ...(item.metadata?.[META_KEY] || {}) };
      delete meta.inInitiative;
      item.metadata = { ...(item.metadata || {}), [META_KEY]: meta };
    }
  });
  await reconcileStateWithItems();
  await renderAll();
}

async function __clearCardConditions(ids) {
  const scopeIds = Array.from(new Set((ids || []).filter(Boolean)));
  if (!scopeIds.length) return;
  await __selectContextScope(scopeIds);
  const mutationPlan = await prepareEffectsMutation([{
    type: "condition:clear",
    targetIds: scopeIds,
  }]);
  await withItemMetaHistory({
    kind: "condition",
    label: scopeIds.length > 1 ? "Rimosse tutte le condizioni (selezione)" : "Rimosse tutte le condizioni",
    itemIds: mutationPlan.changedIds,
    fields: ["conditions"],
  }, () => commitEffectsMutationPlan(mutationPlan));
  await refreshConditionLabels(scopeIds);
}

async function __clearCardSpells(ids) {
  const scopeIds = Array.from(new Set((ids || []).filter(Boolean)));
  if (!scopeIds.length) return;
  await __selectContextScope(scopeIds);
  const mutationPlan = await prepareEffectsMutation([{
    type: "spell:clear-non-concentration",
    targetIds: scopeIds,
  }]);
  await withItemMetaHistory({
    kind: "spell",
    label: scopeIds.length > 1 ? "Terminati incantesimi (selezione)" : "Terminati incantesimi",
    itemIds: mutationPlan.changedIds,
    fields: [SPELLS_META_KEY, "conditions"],
  }, () => commitEffectsMutationPlan(mutationPlan));
  await refreshConditionLabels(scopeIds);
}

async function __clearCardConcentrations(ids) {
  const scopeIds = Array.from(new Set((ids || []).filter(Boolean)));
  if (!scopeIds.length) return;
  const mutationPlan = await prepareEffectsMutation([{
    type: "concentration:break",
    casterIds: scopeIds,
  }]);
  if (!mutationPlan.changedIds.length) return;

  await __selectContextScope(scopeIds);
  const historyIds = mutationPlan.changedIds;
  await withItemMetaHistory({
    kind: "spell",
    label: scopeIds.length > 1 ? "Terminate concentrazioni multiple" : "Terminata concentrazione",
    itemIds: historyIds,
    fields: [SPELLS_META_KEY, CONC_META_KEY, "conditions"],
  }, () => commitEffectsMutationPlan(mutationPlan));
  await refreshConditionLabels(historyIds);
}

function __openInitiativeCardContextMenu(sourceEntry, event) {
  if (!IS_GM || !sourceEntry ||
      isLairId(sourceEntry.id) || isEpicActionId(sourceEntry.id)) return;

  event.preventDefault();
  event.stopPropagation();
  __closeInitiativeCardContextMenu();
  const scopeIds = __contextScopeIds(sourceEntry);
  const isBulkScope = scopeIds.length > 1;
  const menuTitle = sourceEntry.__groupCollapsed
    ? sourceEntry.__groupBase
    : sourceEntry.name;

  const menu = document.createElement("div");
  menu.setAttribute("role", "menu");
  Object.assign(menu.style, {
    position: "fixed",
    left: `${event.clientX}px`,
    top: `${event.clientY}px`,
    minWidth: "216px",
    maxHeight: "calc(100vh - 16px)",
    padding: "5px",
    border: "1px solid rgba(255,255,255,.16)",
    borderRadius: "12px",
    background: "rgba(42,47,64,.62)",
    backdropFilter: "blur(18px) saturate(125%)",
    WebkitBackdropFilter: "blur(18px) saturate(125%)",
    boxShadow: "0 16px 42px rgba(0,0,0,.46), inset 0 1px 0 rgba(255,255,255,.07)",
    color: "#fff",
    fontFamily: 'var(--obrt-font-ui, "Helvetica Neue", Helvetica, Arial, sans-serif)',
    fontSize: "12px",
    zIndex: "100000",
    overflowY: "auto",
    overscrollBehavior: "contain",
  });

  const title = document.createElement("div");
  title.textContent = isBulkScope
    ? `${menuTitle || "Azioni"} (${scopeIds.length})`
    : (menuTitle || "Azioni");
  Object.assign(title.style, {
    padding: "5px 7px 7px",
    marginBottom: "3px",
    borderBottom: "1px solid rgba(255,255,255,.12)",
    fontSize: "12px",
    fontWeight: "700",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  });
  menu.appendChild(title);

  const asset = (name) => `${import.meta.env.BASE_URL || "/"}${name}`;
  const iconNode = (icon, color) => {
    if (color) {
      const dot = document.createElement("span");
      Object.assign(dot.style, {
        width: "11px", height: "11px", flex: "0 0 11px",
        borderRadius: "999px", background: color,
        border: "1px solid rgba(255,255,255,.55)",
      });
      return dot;
    }
    const image = document.createElement("img");
    image.src = asset(icon);
    image.alt = "";
    Object.assign(image.style, {
      width: "16px", height: "16px", flex: "0 0 16px",
      objectFit: "contain", pointerEvents: "none",
      filter: icon === "conditions-panel.svg" || icon === "spells-panel.svg" || icon === "character-sheet.svg"
        ? "none" : "brightness(0) invert(1)",
    });
    return image;
  };

  const makeAction = (parent, label, icon, action, options = {}) => {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "menuitem");
    button.disabled = !!options.disabled;
    button.setAttribute("aria-disabled", String(!!options.disabled));
    if (options.title) button.title = options.title;
    Object.assign(button.style, {
      width: "100%", minHeight: "31px", padding: "5px 7px",
      border: "0", borderRadius: "7px",
      background: options.current ? "rgba(37,99,235,.30)" : "transparent",
      color: options.disabled ? "rgba(255,255,255,.42)" : options.danger ? "#fecaca" : "#fff",
      fontFamily: "inherit", fontSize: "12px", fontWeight: "600",
      textAlign: "left", cursor: options.disabled ? "default" : "pointer",
      display: "flex", alignItems: "center", gap: "7px",
      opacity: options.disabled ? ".62" : "1",
    });
    button.appendChild(iconNode(icon, options.color));
    const labelNode = document.createElement("span");
    labelNode.textContent = label;
    labelNode.style.flex = "1 1 auto";
    button.appendChild(labelNode);
    if (options.trailing) {
      const trailing = document.createElement("span");
      trailing.textContent = options.trailing;
      trailing.style.opacity = ".72";
      button.appendChild(trailing);
    }
    button.addEventListener("pointerenter", () => {
      if (options.disabled) return;
      button.style.background = "rgba(255,255,255,.12)";
    });
    button.addEventListener("pointerleave", () => {
      if (options.disabled) return;
      button.style.background = options.current ? "rgba(37,99,235,.30)" : "transparent";
    });
    if (action && !options.disabled) {
      button.addEventListener("click", async (clickEvent) => {
        clickEvent.preventDefault();
        clickEvent.stopPropagation();
        __closeInitiativeCardContextMenu();
        await action();
      });
    }
    parent.appendChild(button);
    return button;
  };

  const addAction = (label, icon, action, options) =>
    makeAction(menu, label, icon, action, options);
  let openSubmenu = null;
  const addSubmenu = (label, icon, entries) => {
    const wrap = document.createElement("div");
    const content = document.createElement("div");
    Object.assign(content.style, {
      display: "none", margin: "1px 0 3px 23px", padding: "2px",
      borderLeft: "1px solid rgba(255,255,255,.14)",
    });
    const trigger = makeAction(wrap, label, icon, null, { trailing: ">" });
    trigger.addEventListener("click", (clickEvent) => {
      clickEvent.preventDefault();
      clickEvent.stopPropagation();
      if (openSubmenu && openSubmenu !== content) openSubmenu.style.display = "none";
      const show = content.style.display === "none";
      content.style.display = show ? "block" : "none";
      openSubmenu = show ? content : null;
    });
    for (const entry of entries) {
      makeAction(content, entry.label, entry.icon, entry.action, entry.options);
    }
    wrap.appendChild(content);
    menu.appendChild(wrap);
  };
  const divider = () => {
    const line = document.createElement("div");
    Object.assign(line.style, {
      height: "1px", margin: "3px 5px",
      background: "rgba(255,255,255,.12)",
    });
    menu.appendChild(line);
  };

  const expandedTokenMenu = !isCompactTrackerLayout() && !sourceEntry.__groupCollapsed;
  const hasActiveConcentration = !!sourceEntry.isConcentrating || scopeIds.some((id) =>
    __activeLabelEntriesById.get(id)?.isConcentrating
  );

  addAction("Condizioni", "conditions-panel.svg", async () => {
    await __selectContextScope(scopeIds);
    await openCardEffectsPopup(sourceEntry);
  });
  if (expandedTokenMenu) {
    addAction("Rimuovi condizioni", "conditions-panel.svg",
      () => __clearCardConditions(scopeIds), { danger: true });
    divider();
  }
  addAction("Incantesimi", "spells-panel.svg", async () => {
    await __selectContextScope(scopeIds);
    await openCardSpellsPopup(sourceEntry);
  });
  if (expandedTokenMenu) {
    addAction("Termina incantesimi", "spells-panel.svg",
      () => __clearCardSpells(scopeIds), { danger: true });
    addAction("Termina concentrazione", "spells-panel.svg",
      () => __clearCardConcentrations(scopeIds), {
        danger: true,
        disabled: !hasActiveConcentration,
        title: hasActiveConcentration ? "Termina la concentrazione attiva" : "Nessuna concentrazione attiva",
      });
    divider();
  }
  if (!isBulkScope && sourceEntry.attitude === "pc") {
    addAction("Scheda iniziativa", "character-sheet.svg", () => openInitiativeCardPopup(sourceEntry));
    divider();
  } else if (!expandedTokenMenu) {
    divider();
  }
  const attitudes = [
    { value: "ally", label: "Alleato", color: "#22c55e" },
    { value: "neutral", label: "Neutrale", color: "#eab308" },
    { value: "pc", label: "Personaggio", color: "#3b82f6" },
    { value: "enemy", label: "Nemico", color: "#ef4444" },
  ];
  addSubmenu("Cambia fazione", "mark.svg", attitudes.map((item) => ({
    label: item.label,
    icon: "mark.svg",
    action: () => __setCardAttitude(scopeIds, item.value),
    options: {
      color: item.color,
      current: (!isBulkScope || sourceEntry.__groupCollapsed) && sourceEntry.attitude === item.value,
      trailing: (!isBulkScope || sourceEntry.__groupCollapsed) && sourceEntry.attitude === item.value ? "Attiva" : "",
    },
  })));

  if (!isBulkScope && sourceEntry.attitude === "enemy") {
    const activeMode = __cardBossMode(sourceEntry);
    const modes = [
      { value: "none", label: "Nessuno", icon: "boss-remove.svg" },
      { value: "legendary", label: "Azioni Leggendarie", icon: "boss.svg" },
      { value: "paragon", label: "Paragon Boss", icon: "boss.svg" },
      { value: "epic", label: "Epic Boss", icon: "boss.svg" },
    ];
    addSubmenu("Tipo di Boss", "boss.svg", modes.map((item) => ({
      label: item.label,
      icon: item.icon,
      action: () => __setCardBossMode(sourceEntry, item.value),
      options: {
        current: activeMode === item.value,
        trailing: activeMode === item.value ? "Attivo" : "",
      },
    })));
  }


  divider();
  addAction("Rimuovi dall'iniziativa", "remove.svg",
    () => __removeCardFromInitiative(scopeIds), {
      danger: true,
      trailing: isBulkScope ? String(scopeIds.length) : "",
    });

  document.body.appendChild(menu);
  __initiativeCardContextMenu = menu;
  const rect = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(event.clientX, window.innerWidth - rect.width - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(event.clientY, window.innerHeight - rect.height - 8))}px`;

  const abort = new AbortController();
  __initiativeCardContextMenuAbort = abort;
  document.addEventListener("pointerdown", (outsideEvent) => {
    if (!menu.contains(outsideEvent.target)) __closeInitiativeCardContextMenu();
  }, { capture: true, signal: abort.signal });
  document.addEventListener("keydown", (keyEvent) => {
    if (keyEvent.key === "Escape") __closeInitiativeCardContextMenu();
  }, { signal: abort.signal });
  document.addEventListener("scroll", __closeInitiativeCardContextMenu, {
    capture: true, signal: abort.signal,
  });
  window.addEventListener("blur", __closeInitiativeCardContextMenu, { signal: abort.signal });
}
    // ===== Render card
let __lastCompactPopoverSize = "";
let __compactPopoverResizeRevision = 0;

function resizeCompactTrackerPopover(entries) {
  void entries;
  const requestedWidth = 1180;
  const requestedHeight = 156;
  const requestKey = `${requestedWidth}x${requestedHeight}`;
  if (__lastCompactPopoverSize === requestKey) return;
  __lastCompactPopoverSize = requestKey;
  const revision = ++__compactPopoverResizeRevision;

  void (async () => {
    let viewportWidth = 1200;
    try { viewportWidth = Number(await OBR.viewport.getWidth()) || viewportWidth; } catch {}
    if (revision !== __compactPopoverResizeRevision || !isCompactTrackerLayout()) return;
    const width = Math.max(260, Math.min(requestedWidth, Math.floor(viewportWidth - 32)));
    try {
      await Promise.all([
        OBR.popover.setWidth(TRACKER_POPOVER_ID, width),
        OBR.popover.setHeight(TRACKER_POPOVER_ID, requestedHeight),
      ]);
    } catch (error) {
      if (revision === __compactPopoverResizeRevision) __lastCompactPopoverSize = "";
      console.warn("[tracker-layout] ridimensionamento compatto fallito:", error?.message || error);
    }
  })();
}

const GROUP_LAYOUT_ANIMATION_MS = 460;
const GROUP_LAYOUT_STAGGER_MS = 34;
const GROUP_LAYOUT_MAX_STAGGER_MS = 140;
const GROUP_LAYOUT_EASING = "cubic-bezier(.45,0,.55,1)";
const GROUP_CARD_SWAP_FADE_MS = 220;
const GROUP_CARD_SWAP_EASING = "cubic-bezier(.22,1,.36,1)";
let __finishGroupLayoutTransition = null;
let __activeGroupLayoutSignature = null;
let __afterGroupLayoutTransition = null;
let __pendingGroupLayoutNodes = null;

function __runAfterGroupLayoutTransition(callback) {
  __afterGroupLayoutTransition = callback;
  if (__finishGroupLayoutTransition) return;
  const pending = __afterGroupLayoutTransition;
  __afterGroupLayoutTransition = null;
  requestAnimationFrame(() => pending?.());
}

function __scrollTrackerCardIntoView(card) {
  if (!(card instanceof HTMLElement)) return;
  const wrapRect = trackWrap.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  const compact = isCompactTrackerLayout();
  const wrapCenter = compact
    ? wrapRect.left + wrapRect.width / 2
    : wrapRect.top + wrapRect.height / 2;
  const cardCenter = compact
    ? cardRect.left + cardRect.width / 2
    : cardRect.top + cardRect.height / 2;
  const distance = cardCenter - wrapCenter;
  const viewportSize = compact ? wrapRect.width : wrapRect.height;
  const outside = compact
    ? cardRect.left < wrapRect.left || cardRect.right > wrapRect.right
    : cardRect.top < wrapRect.top || cardRect.bottom > wrapRect.bottom;
  if (!outside) return;

  if (Math.abs(distance) > viewportSize * 0.72) {
    if (compact) trackWrap.scrollLeft += distance;
    else trackWrap.scrollTop += distance;
    return;
  }
  card.scrollIntoView?.({
    behavior: "smooth",
    block: compact ? "nearest" : "center",
    inline: compact ? "center" : "nearest",
  });
}

function __groupLayoutSignature(nodes) {
  const layout = isCompactTrackerLayout() ? "compact" : "classic";
  return `${layout}:${nodes
    .filter((node) => node instanceof HTMLElement && node.dataset.trackerCard === "1")
    .map((node) => `${node.dataset.groupKey || ""}:${node.dataset.itemId || ""}:${node.dataset.groupCollapsed || "0"}`)
    .join("|")}`;
}

function __syncTrackerCardStateClasses(card) {
  if (!(card instanceof HTMLElement)) return;
  card.classList.toggle("is-active", card.dataset.active === "1");
  card.classList.toggle("is-selected", card.dataset.selectionState === "all");
  card.classList.toggle("is-partially-selected", card.dataset.selectionState === "partial");
  card.classList.toggle("is-collapsed", card.dataset.groupCollapsed === "1");
}

function __copyTrackerCardOuterState(liveCard, nextCard) {
  for (const attribute of Array.from(liveCard.attributes)) {
    if (!nextCard.hasAttribute(attribute.name)) liveCard.removeAttribute(attribute.name);
  }
  for (const attribute of Array.from(nextCard.attributes)) {
    liveCard.setAttribute(attribute.name, attribute.value);
  }
  liveCard.__selectionBaseShadow = nextCard.__selectionBaseShadow ?? nextCard.style.boxShadow ?? "";
  __syncTrackerCardStateClasses(liveCard);
}

function __reconcileTrackCardsById(nextNodes) {
  const nextCards = nextNodes.filter(
    (node) => node instanceof HTMLElement && node.dataset.trackerCard === "1"
  );
  const liveCards = Array.from(track.children).filter(
    (node) => node instanceof HTMLElement && node.dataset.trackerCard === "1"
  );
  if (
    liveCards.length !== nextCards.length ||
    liveCards.some((card, index) => card.dataset.itemId !== nextCards[index]?.dataset.itemId)
  ) return false;

  let replaced = 0;
  for (let index = 0; index < liveCards.length; index++) {
    const liveCard = liveCards[index];
    const nextCard = nextCards[index];
    if (liveCard.innerHTML !== nextCard.innerHTML) {
      liveCard.replaceWith(nextCard);
      replaced += 1;
      continue;
    }
    __copyTrackerCardOuterState(liveCard, nextCard);
  }
  __initiativeDiag("render:cards-reconciled", {
    preserved: liveCards.length - replaced,
    replaced,
    layout: isCompactTrackerLayout() ? "compact" : "classic",
  });
  return true;
}

const ACTIVE_CARD_VISUAL_PROPERTIES = [
  "background",
  "backgroundColor",
  "border",
  "borderColor",
  "boxShadow",
  "filter",
  "opacity",
  "scale",
  "zIndex",
];

function __syncActiveCardVisuals(nextNodes) {
  const nextById = new Map(nextNodes
    .filter((node) => node instanceof HTMLElement && node.dataset.trackerCard === "1")
    .map((node) => [node.dataset.itemId, node]));
  const nextByGroup = new Map();
  for (const node of nextNodes) {
    if (!(node instanceof HTMLElement) || node.dataset.trackerCard !== "1") continue;
    const groupKey = node.dataset.groupKey;
    if (groupKey && !nextByGroup.has(groupKey)) nextByGroup.set(groupKey, node);
  }
  const liveCards = Array.from(track.querySelectorAll("[data-tracker-card='1']"));
  for (const liveCard of liveCards) {
    const nextCard = nextById.get(liveCard.dataset.itemId) ||
      nextByGroup.get(liveCard.dataset.groupKey);
    if (!nextCard) {
      delete liveCard.dataset.active;
      liveCard.style.scale = "1";
      __syncTrackerCardStateClasses(liveCard);
      continue;
    }
    if (nextCard.dataset.active === "1") liveCard.dataset.active = "1";
    else delete liveCard.dataset.active;
    for (const property of ACTIVE_CARD_VISUAL_PROPERTIES) {
      liveCard.style[property] = nextCard.style[property] || "";
    }
    liveCard.__selectionBaseShadow = nextCard.style.boxShadow || "";
    __applyTrackerSelectionState(liveCard);
    __syncTrackerCardStateClasses(liveCard);
  }
}

function __animateActiveCardEntrance(animateActive, expectedActiveId = null) {
  if (!animateActive || window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
  const card = Array.from(track.querySelectorAll("[data-tracker-card='1'][data-active='1']"))
    .find((candidate) => !expectedActiveId || candidate.dataset.itemId === String(expectedActiveId));
  if (!(card instanceof HTMLElement)) {
    __initiativeDiag("animation:active-skipped-missing", {
      activeId: expectedActiveId,
      layout: isCompactTrackerLayout() ? "compact" : "classic",
    });
    return;
  }
  const targetScale = card.style.scale || String(ZOOM_CFG.scale);
  const previousTransition = card.style.transition;
  card.style.transition = "none";
  card.style.scale = "1";
  void card.offsetHeight;
  card.style.transition = previousTransition;
  card.style.scale = targetScale;
  __initiativeDiag("animation:active-start", {
    activeId: card.dataset.itemId,
    layout: isCompactTrackerLayout() ? "compact" : "classic",
  });
}

function __groupAccordionFrames(dx, dy, baseTransform = "none") {
  const compact = isCompactTrackerLayout();
  const axisX = compact ? dx : 0;
  const axisY = compact ? 0 : dy;
  const transformSuffix = baseTransform && baseTransform !== "none"
    ? ` ${baseTransform}`
    : "";
  return [
    { transform: `translate(${axisX}px, ${axisY}px)${transformSuffix}` },
    { transform: baseTransform || "none" },
  ];
}

function __trackerCardsByGroup(nodes) {
  const groups = new Map();
  for (const node of nodes) {
    if (!(node instanceof HTMLElement) || node.dataset.trackerCard !== "1") continue;
    const key = node.dataset.groupKey;
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(node);
  }
  return groups;
}

function __captureTransitionCard(card) {
  const rect = card.getBoundingClientRect();
  return {
    rect,
    layoutLeft: card.offsetLeft,
    layoutTop: card.offsetTop,
    width: card.offsetWidth || rect.width,
    height: card.offsetHeight || rect.height,
    originalStyle: card.getAttribute("style"),
    baseTransform: card.style.transform || "none",
  };
}

function __replaceTrackCardsMagnetic(nodes) {
  const compact = isCompactTrackerLayout();
  const nextNodes = nodes.filter(Boolean);
  const nextSignature = __groupLayoutSignature(nextNodes);
  if (__finishGroupLayoutTransition && __activeGroupLayoutSignature === nextSignature) {
    __pendingGroupLayoutNodes = nextNodes;
    __syncActiveCardVisuals(nextNodes);
    __initiativeDiag("animation:group-coalesced", {
      layout: compact ? "compact" : "classic",
    });
    return;
  }

  __finishGroupLayoutTransition?.();
  __finishGroupLayoutTransition = null;
  __activeGroupLayoutSignature = null;
  __pendingGroupLayoutNodes = null;

  const oldCards = Array.from(track.children).filter(
    (node) => node instanceof HTMLElement && node.dataset.trackerCard === "1"
  );
  const oldGroups = __trackerCardsByGroup(oldCards);
  const nextGroups = __trackerCardsByGroup(nextNodes);
  const transitions = [];
  for (const [key, nextCards] of nextGroups) {
    const previousCards = oldGroups.get(key) || [];
    const wasCollapsed = previousCards.length === 1 && previousCards[0].dataset.groupCollapsed === "1";
    const isCollapsed = nextCards.length === 1 && nextCards[0].dataset.groupCollapsed === "1";
    if (wasCollapsed && nextCards.length > 1) transitions.push({ key, type: "expand" });
    else if (previousCards.length > 1 && isCollapsed) transitions.push({ key, type: "collapse" });
  }

  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (!transitions.length) {
    const currentSignature = __groupLayoutSignature(oldCards);
    if (currentSignature === nextSignature && __reconcileTrackCardsById(nextNodes)) return;
    track.replaceChildren(...nextNodes);
    return;
  }
  if (reducedMotion) {
    track.replaceChildren(...nextNodes);
    return;
  }

  const scrollLeftBefore = trackWrap.scrollLeft;
  const scrollTopBefore = trackWrap.scrollTop;
  const oldSnapshots = new Map(oldCards.map((card) => [card.dataset.itemId, __captureTransitionCard(card)]));
  track.replaceChildren(...nextNodes);
  const renderedGroups = __trackerCardsByGroup(nextNodes);
  const finalSnapshots = new Map(nextNodes
    .filter((card) => card instanceof HTMLElement && card.dataset.trackerCard === "1")
    .map((card) => [card.dataset.itemId, __captureTransitionCard(card)]));
  const promotedCards = nextNodes
    .filter((card) => card instanceof HTMLElement && card.dataset.trackerCard === "1")
    .map((card) => ({
      card,
      willChange: card.style.willChange,
      backfaceVisibility: card.style.backfaceVisibility,
    }));
  for (const { card } of promotedCards) {
    card.style.willChange = "transform";
    card.style.backfaceVisibility = "hidden";
  }
  const stages = [];

  const setAbsoluteCard = (card, snapshot, firstSnapshot, stageWidth, stageHeight) => {
    const offset = compact
      ? snapshot.rect.left - firstSnapshot.rect.left
      : snapshot.layoutTop - firstSnapshot.layoutTop;
    Object.assign(card.style, {
      position: "absolute",
      left: compact
        ? `${offset}px`
        : `${snapshot.layoutLeft - firstSnapshot.layoutLeft}px`,
      top: compact ? `${(stageHeight - snapshot.height) / 2}px` : `${offset}px`,
      width: `${snapshot.width}px`,
      minWidth: `${snapshot.width}px`,
      maxWidth: `${snapshot.width}px`,
      height: `${snapshot.height}px`,
      margin: "0",
      pointerEvents: "none",
      transition: "none",
      willChange: "transform, opacity",
      backfaceVisibility: "hidden",
    });
    return offset;
  };

  for (const { key, type } of transitions) {
    const oldGroup = (oldGroups.get(key) || [])
      .map((card) => ({ card, snapshot: oldSnapshots.get(card.dataset.itemId) }))
      .filter(({ snapshot }) => !!snapshot)
      .sort((a, b) => compact
        ? a.snapshot.rect.left - b.snapshot.rect.left
        : a.snapshot.rect.top - b.snapshot.rect.top
      );
    const rendered = (renderedGroups.get(key) || [])
      .map((card) => ({ card, snapshot: finalSnapshots.get(card.dataset.itemId) }))
      .filter(({ snapshot }) => !!snapshot)
      .sort((a, b) => compact
        ? a.snapshot.rect.left - b.snapshot.rect.left
        : a.snapshot.rect.top - b.snapshot.rect.top
      );
    if (!oldGroup.length || !rendered.length) continue;

    const stage = document.createElement("div");
    stage.dataset.groupTransitionStage = "1";
    const source = type === "collapse" ? oldGroup : rendered;
    const firstSnapshot = source[0].snapshot;
    const firstRect = firstSnapshot.rect;
    const lastRecord = source[source.length - 1];
    const expandedSize = compact
      ? lastRecord.snapshot.rect.right - firstRect.left
      : lastRecord.snapshot.layoutTop + lastRecord.snapshot.height - firstSnapshot.layoutTop;
    const motherSize = compact
      ? (type === "collapse" ? rendered[0].snapshot.width : oldGroup[0].snapshot.width)
      : (type === "collapse" ? rendered[0].snapshot.height : oldGroup[0].snapshot.height);
    const stageWidth = compact
      ? (type === "collapse" ? expandedSize : expandedSize)
      : Math.max(...source.map(({ snapshot }) => snapshot.width));
    const stageHeight = compact
      ? Math.max(...source.map(({ snapshot }) => snapshot.height))
      : (type === "collapse" ? expandedSize : expandedSize);
    const initialSize = type === "collapse" ? expandedSize : motherSize;
    const finalSize = type === "collapse" ? motherSize : expandedSize;
    Object.assign(stage.style, {
      position: "relative",
      flex: `0 0 ${initialSize}px`,
      width: `${compact ? initialSize : stageWidth}px`,
      minWidth: `${compact ? initialSize : stageWidth}px`,
      height: `${compact ? stageHeight : initialSize}px`,
      minHeight: `${compact ? stageHeight : initialSize}px`,
      alignSelf: "center",
      overflow: "visible",
      boxSizing: "border-box",
      zIndex: "2",
      contain: "layout style",
      willChange: "flex-basis",
      marginLeft: compact ? "0" : (source[0].card.style.marginLeft || "0"),
      marginRight: compact ? "0" : (source[0].card.style.marginRight || "0"),
    });

    const movingRecords = [];
    let finalCards = [];
    let finalLead = null;
    let finalLeadStyle = null;
    let swapVisual = null;

    if (type === "collapse") {
      finalLead = rendered[0].card;
      finalLeadStyle = finalLead.getAttribute("style");
      finalLead.replaceWith(stage);
      oldGroup.forEach(({ card, snapshot }, index) => {
        const visual = card;
        const activeVisual = visual.dataset.active === "1";
        visual.removeAttribute("id");
        const offset = setAbsoluteCard(visual, snapshot, firstSnapshot, stageWidth, stageHeight);
        visual.style.zIndex = index === 0 ? "1000" : String(900 - index);
        // Le card attive usano il gradiente/opacità della fazione. Un
        // backgroundColor pieno qui lo copriva durante la chiusura del gruppo
        // e faceva sparire anche la percezione dello zoom attivo.
        if (!activeVisual) visual.style.backgroundColor = "rgb(31, 39, 51)";
        else visual.style.backgroundColor = "";
        stage.appendChild(visual);
        if (index === 0) swapVisual = visual;
        else movingRecords.push({ card: visual, offset, baseTransform: snapshot.baseTransform, index: index - 1, count: oldGroup.length - 1 });
      });
      const finalSnapshot = rendered[0].snapshot;
      setAbsoluteCard(finalLead, finalSnapshot, finalSnapshot, stageWidth, stageHeight);
      finalLead.style.left = compact ? "0" : `${(stageWidth - finalSnapshot.width) / 2}px`;
      finalLead.style.top = compact ? `${(stageHeight - finalSnapshot.height) / 2}px` : "0";
      finalLead.style.visibility = "hidden";
      finalLead.style.zIndex = "1001";
      stage.appendChild(finalLead);
      finalCards = [finalLead];
    } else {
      const firstCard = rendered[0].card;
      firstCard.replaceWith(stage);
      for (const { card, snapshot } of rendered) {
        const originalStyle = card.getAttribute("style");
        const offset = setAbsoluteCard(card, snapshot, firstSnapshot, stageWidth, stageHeight);
        card.style.zIndex = card === firstCard ? "1000" : "800";
        stage.appendChild(card);
        movingRecords.push({ card, offset, baseTransform: snapshot.baseTransform, originalStyle, index: movingRecords.length, count: rendered.length });
      }
      const oldLead = oldGroup[0];
      swapVisual = oldLead.card;
      swapVisual.removeAttribute("id");
      setAbsoluteCard(swapVisual, oldLead.snapshot, oldLead.snapshot, stageWidth, stageHeight);
      swapVisual.style.left = compact ? "0" : `${(stageWidth - oldLead.snapshot.width) / 2}px`;
      swapVisual.style.top = compact ? `${(stageHeight - oldLead.snapshot.height) / 2}px` : "0";
      swapVisual.style.zIndex = "1001";
      stage.appendChild(swapVisual);
      finalCards = rendered.map(({ card }) => card);
    }

    const maxStaggerSteps = Math.max(
      0,
      movingRecords.length - (type === "expand" ? 2 : 1)
    );
    const transitionDuration = GROUP_LAYOUT_ANIMATION_MS + Math.min(
      maxStaggerSteps * GROUP_LAYOUT_STAGGER_MS,
      GROUP_LAYOUT_MAX_STAGGER_MS
    );
    stages.push({
      key,
      type,
      stage,
      initialSize,
      finalSize,
      stageWidth,
      stageHeight,
      movingRecords,
      finalCards,
      finalLead,
      finalLeadStyle,
      finalLeadOpacity: finalLead?.style.opacity || "1",
      swapVisual,
      transitionDuration,
    });
  }

  trackWrap.scrollLeft = Math.min(scrollLeftBefore, Math.max(0, trackWrap.scrollWidth - trackWrap.clientWidth));
  trackWrap.scrollTop = Math.min(scrollTopBefore, Math.max(0, trackWrap.scrollHeight - trackWrap.clientHeight));

  const animations = [];
  const play = (element, frames, options) => {
    const animation = element.animate?.(frames, options);
    if (animation) animations.push(animation);
    return animation;
  };
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    for (const animation of animations) animation.cancel?.();
    for (const record of stages) {
      if (record.type === "collapse") {
        if (!record.finalLead) continue;
        if (record.finalLeadStyle === null) record.finalLead.removeAttribute("style");
        else record.finalLead.setAttribute("style", record.finalLeadStyle);
        if (record.stage.isConnected) record.stage.replaceWith(record.finalLead);
      } else {
        for (const moving of record.movingRecords) {
          if (moving.originalStyle === null) moving.card.removeAttribute("style");
          else moving.card.setAttribute("style", moving.originalStyle);
        }
        if (record.stage.isConnected) record.stage.replaceWith(...record.finalCards);
      }
    }
    for (const promoted of promotedCards) {
      promoted.card.style.willChange = promoted.willChange;
      promoted.card.style.backfaceVisibility = promoted.backfaceVisibility;
    }
    const pendingNodes = __pendingGroupLayoutNodes;
    __pendingGroupLayoutNodes = null;
    if (pendingNodes && !__reconcileTrackCardsById(pendingNodes)) {
      track.replaceChildren(...pendingNodes);
    }
    if (__finishGroupLayoutTransition === finish) __finishGroupLayoutTransition = null;
    if (__activeGroupLayoutSignature === nextSignature) __activeGroupLayoutSignature = null;
    __initiativeDiag("animation:group-finished", {
      layout: compact ? "compact" : "classic",
      coalesced: !!pendingNodes,
    });
    const afterTransition = __afterGroupLayoutTransition;
    __afterGroupLayoutTransition = null;
    if (afterTransition) requestAnimationFrame(() => afterTransition());
  };
  __finishGroupLayoutTransition = finish;
  __activeGroupLayoutSignature = nextSignature;

  requestAnimationFrame(() => {
    if (finished) return;
    for (const record of stages) {
      const compactFrames = [
        { flexBasis: `${record.initialSize}px`, width: `${record.initialSize}px`, minWidth: `${record.initialSize}px` },
        { flexBasis: `${record.finalSize}px`, width: `${record.finalSize}px`, minWidth: `${record.finalSize}px` },
      ];
      const classicFrames = [
        { flexBasis: `${record.initialSize}px`, height: `${record.initialSize}px`, minHeight: `${record.initialSize}px` },
        { flexBasis: `${record.finalSize}px`, height: `${record.finalSize}px`, minHeight: `${record.finalSize}px` },
      ];
      play(record.stage, compact ? compactFrames : classicFrames, {
        duration: record.transitionDuration,
        easing: GROUP_LAYOUT_EASING,
        fill: "forwards",
      });

      for (const moving of record.movingRecords) {
        if (record.type === "collapse") {
          const reverseDelay = Math.min(
            Math.max(0, moving.count - 1 - moving.index) * GROUP_LAYOUT_STAGGER_MS,
            GROUP_LAYOUT_MAX_STAGGER_MS
          );
          play(moving.card, __groupAccordionFrames(
            compact ? -moving.offset : 0,
            compact ? 0 : -moving.offset,
            moving.baseTransform
          ), {
            duration: GROUP_LAYOUT_ANIMATION_MS,
            delay: reverseDelay,
            easing: GROUP_LAYOUT_EASING,
            direction: "reverse",
            fill: "both",
          });
        } else if (moving.offset > 0) {
          play(moving.card, __groupAccordionFrames(
            compact ? -moving.offset : 0,
            compact ? 0 : -moving.offset,
            moving.baseTransform
          ), {
            duration: GROUP_LAYOUT_ANIMATION_MS,
            delay: Math.min(Math.max(0, moving.index - 1) * GROUP_LAYOUT_STAGGER_MS, GROUP_LAYOUT_MAX_STAGGER_MS),
            easing: GROUP_LAYOUT_EASING,
            fill: "backwards",
          });
        }
      }

      if (record.type === "expand") {
        play(record.swapVisual, [{ opacity: 1 }, { opacity: 0 }], {
          duration: GROUP_CARD_SWAP_FADE_MS,
          easing: GROUP_CARD_SWAP_EASING,
          fill: "forwards",
        });
      } else {
        const fadeDelay = record.transitionDuration - GROUP_CARD_SWAP_FADE_MS;
        play(record.swapVisual, [{ opacity: 1 }, { opacity: 0 }], {
          duration: GROUP_CARD_SWAP_FADE_MS,
          delay: fadeDelay,
          easing: GROUP_CARD_SWAP_EASING,
          fill: "forwards",
        });
        record.finalLead.style.visibility = "";
        play(record.finalLead, [
          { opacity: 0 },
          { opacity: Number.parseFloat(record.finalLeadOpacity) || 1 },
        ], {
          duration: GROUP_CARD_SWAP_FADE_MS,
          delay: fadeDelay,
          easing: GROUP_CARD_SWAP_EASING,
          fill: "backwards",
        });
      }
    }

    const totalDuration = stages.reduce(
      (maximum, record) => Math.max(maximum, record.transitionDuration),
      GROUP_LAYOUT_ANIMATION_MS
    );
    window.setTimeout(finish, totalDuration + 80);
  });
}

function __replaceTrackCardsAnimated(nodes) {
  __replaceTrackCardsMagnetic(nodes);
}

function compactStatusBadge(text, title, tone = "neutral") {
  const badge = document.createElement("span");
  badge.textContent = text;
  badge.title = title;
  const colors = tone === "concentration"
    ? { background: "#2563eb", border: "#93c5fd" }
    : tone === "resistance"
      ? { background: "#1e3a8a", border: "#93c5fd" }
    : tone === "legendary"
      ? { background: "#991b1b", border: "#fca5a5" }
      : { background: "rgba(8,12,21,.92)", border: "rgba(255,255,255,.34)" };
  Object.assign(badge.style, {
    minWidth: "17px",
    height: "17px",
    boxSizing: "border-box",
    padding: "0 4px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: `1px solid ${colors.border}`,
    borderRadius: "999px",
    background: colors.background,
    color: "#fff",
    fontSize: "9px",
    fontWeight: "700",
    lineHeight: "1",
    boxShadow: "0 1px 4px rgba(0,0,0,.55)",
    whiteSpace: "nowrap",
    flex: "0 0 auto",
  });
  return badge;
}

let __expandedCompactEffectsId = null;
const COMPACT_CARD_WIDTH = 92;
const COMPACT_CARD_HEIGHT = 120;

function __compactConditionPillLabel(instance) {
  const name = String(instance?.condition || "").trim();
  let label = formatConditionName(name) || name || "Condizione";
  if (name === "Indebolimento") {
    label += ` ${Math.max(1, Math.floor(Number(instance?.level) || 1))}`;
  }
  const expiry = instance?.expiry || {};
  const remaining = Math.max(0, Math.floor(Number(expiry.remaining) || 0));
  if (expiry.mode === "rounds" && remaining) label += ` (${remaining})`;
  else if (expiry.mode === "turn-start") label += ` (I${remaining > 1 ? `:${remaining}` : ""})`;
  else if (expiry.mode === "turn-end") label += ` (F${remaining > 1 ? `:${remaining}` : ""})`;
  else if (expiry.mode === "concentration") label += " (C)";
  return label;
}

function __compactEffectItems(conditionInstances, spells, concentrating) {
  const effects = conditionInstances.map((instance) => ({
    kind: "condition",
    label: __compactConditionPillLabel(instance),
    title: formatConditionInstance(instance),
  }));
  for (const spell of spells) {
    const turns = Math.max(0, Math.floor(Number(spell?.turns) || 0));
    effects.push({
      kind: "spell",
      key: __spellKey(spell?.name),
      label: `${String(spell?.name || "Incantesimo")} (${turns})`,
      title: `${String(spell?.name || "Incantesimo")} · ${turns} round rimanenti${spell?.conc ? " · concentrazione" : ""}`,
    });
  }
  if (concentrating && !spells.some((spell) => spell?.conc)) {
    effects.push({
      kind: "concentration",
      label: "Concentrazione",
      title: "Concentrazione attiva",
    });
  }
  return effects;
}

function __buildCompactEffectPill(effect, preview = false) {
  const pill = document.createElement("span");
  pill.textContent = effect.label;
  pill.title = effect.title || effect.label;
  const spellColor = effect.kind === "spell" ? __spellColor(effect.key) : null;
  const background = effect.kind === "concentration"
    ? "#2563eb"
    : spellColor?.solid || "rgba(8,12,21,.94)";
  const border = effect.kind === "concentration"
    ? "#93c5fd"
    : spellColor?.border || "rgba(255,255,255,.38)";
  Object.assign(pill.style, {
    minWidth: "0",
    maxWidth: preview ? "100%" : "196px",
    height: preview ? "14px" : "17px",
    padding: "0 5px",
    display: "inline-flex",
    alignItems: "center",
    boxSizing: "border-box",
    overflow: "hidden",
    border: `1px solid ${border}`,
    borderRadius: "999px",
    background,
    color: "#fff",
    fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    fontSize: "8px",
    fontWeight: "600",
    lineHeight: "1",
    justifyContent: "center",
    textAlign: "center",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    boxShadow: "0 1px 4px rgba(0,0,0,.45)",
  });
  return pill;
}

const COMPACT_EFFECTS_POPOVER_ID = `${ID}/compact-effects-popover`;
const COMPACT_EFFECTS_PAYLOAD_KEY = `${ID}/compact-effects-payload`;

async function __closeCompactEffectsPopover() {
  __expandedCompactEffectsId = null;
  await OBR.popover.close(COMPACT_EFFECTS_POPOVER_ID).catch(() => {});
}

async function __toggleCompactEffectsPopover(card, effectAnchor, entryId, effects) {
  if (__expandedCompactEffectsId === entryId) {
    await __closeCompactEffectsPopover();
    return false;
  }

  const remainingEffects = effects.slice(1);
  if (!remainingEffects.length) return false;
  localStorage.setItem(COMPACT_EFFECTS_PAYLOAD_KEY, JSON.stringify({ effects: remainingEffects }));

  const trackerAnchor = await getCompactTrackerPopoverAnchor();
  const cardRect = card.getBoundingClientRect();
  const effectAnchorRect = effectAnchor.getBoundingClientRect();
  const trackerLeft = trackerAnchor.left - (window.innerWidth / 2);
  const trackerTop = trackerAnchor.top - window.innerHeight;
  const anchorPosition = {
    left: Math.round(trackerLeft + effectAnchorRect.left + effectAnchorRect.width / 2),
    top: Math.round(trackerTop + effectAnchorRect.bottom),
  };
  const width = Math.max(72, Math.round(cardRect.width));
  const height = remainingEffects.length * 14 + Math.max(0, remainingEffects.length - 1) + 4;

  await OBR.popover.close(COMPACT_EFFECTS_POPOVER_ID).catch(() => {});
  try {
    await OBR.popover.open({
      id: COMPACT_EFFECTS_POPOVER_ID,
      url: "/compact-effects.html",
      width,
      height,
      anchorReference: "POSITION",
      anchorPosition,
      anchorOrigin: { horizontal: "CENTER", vertical: "BOTTOM" },
      transformOrigin: { horizontal: "CENTER", vertical: "TOP" },
      disableClickAway: true,
      marginThreshold: 0,
      hidePaper: true,
    });
    __expandedCompactEffectsId = entryId;
    return true;
  } catch (error) {
    __expandedCompactEffectsId = null;
    console.warn("[compact-effects] apertura pannello fallita:", error?.message || error);
    return false;
  }
}

function renderCompactTrack(entries, state, { animateActive = false } = {}) {
  const order = Array.isArray(state?.order) ? state.order : [];
  const activeIndex = Math.max(0, Math.min(order.length - 1, Number(state?.current) || 0));
  const activeId = order[activeIndex] || null;
  const activeChanged = !!activeId && activeId !== __lastRenderedActiveId;
  const visibleEntries = compactEntriesForRender(entries, state);

  track.style.justifyContent = "safe center";
  const nodes = visibleEntries.map((entry) => {
    const members = Array.isArray(entry.__groupMembers) && entry.__groupMembers.length
      ? entry.__groupMembers
      : [entry];
    const memberIds = new Set(members.map((member) => member.id));
    const active = memberIds.has(activeId);
    const boss = !!entry.isEpic ||
      Number(entry.paragonActions) > 1 ||
      Number(entry.legendary?.max) > 0;
    const virtual = isLairId(entry.id) || isEpicActionId(entry.id);
    const attitude = String(entry.attitude || "").toLowerCase();
    const faction = factionColors(attitude);
    const cardWidth = COMPACT_CARD_WIDTH;
    const portraitSize = boss ? 59 : 49;
    const canSeeHP = IS_GM || attitude === "pc";
    const hp = Number(entry.hp);
    const hpMax = Number(entry.hpMax);
    const hasHP = !virtual && Number.isFinite(hpMax) && hpMax > 0;
    const showHP = canSeeHP && hasHP;
    const safeHP = hasHP && Number.isFinite(hp) ? Math.max(0, hp) : 0;
    const hpPercent = hasHP ? Math.max(0, Math.min(1, safeHP / hpMax)) : 0;
    const knockedOut = showHP && !entry.__groupCollapsed && safeHP <= 0;
    const effectMembers = entry.__groupCollapsed ? [] : members;
    const conditionInstances = effectMembers.flatMap((member) =>
      getEffectiveConditionInstances(member.conditions || {})
    );
    const spells = effectMembers.flatMap((member) =>
      Array.isArray(member.spells) ? member.spells : []
    );
    const concentrating = effectMembers.some((member) => member.isConcentrating);
    const compactEffects = __compactEffectItems(conditionInstances, spells, concentrating);
    const hasExpandableEffects = compactEffects.length > 1;

    const card = document.createElement("article");
    card.dataset.itemId = entry.id;
    card.dataset.initiative = String(entry.initiative || 0);
    card.dataset.groupCollapsed = entry.__groupCollapsed ? "1" : "0";
    card.dataset.groupKey = entry.__groupKey || __groupKey(entry);
    card.dataset.trackerCard = "1";
    card.dataset.compactCard = "1";
    card.dataset.hpCanSee = canSeeHP ? "1" : "0";
    card.dataset.hpVisible = showHP ? "1" : "0";
    card.dataset.knockedOut = knockedOut ? "1" : "0";
    card.dataset.hasEffectOverflow = hasExpandableEffects ? "1" : "0";
    card.dataset.isEpic = entry.isEpic ? "1" : "0";
    card.__selectionItemIds = __selectionIdsForEntry(entry);
    const dragAllowed = !(virtual || entry.isEpic);
    card.setAttribute("draggable", dragAllowed ? "true" : "false");
    card.setAttribute("aria-label", `${entry.name || "Creatura"}, iniziativa ${entry.initiative ?? 0}`);
    card.title = virtual
      ? entry.name
      : "Click: seleziona token. Ctrl/Shift+click: selezione multipla. Click destro: azioni";
    Object.assign(card.style, {
      position: "relative",
      flex: `0 0 ${cardWidth}px`,
      width: `${cardWidth}px`,
      minWidth: `${cardWidth}px`,
      height: `${COMPACT_CARD_HEIGHT}px`,
      padding: "3px 5px 2px",
      boxSizing: "border-box",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "flex-start",
      color: "#fff",
      border: `${active ? 2 : 1}px solid ${rgba(faction.border, active ? .98 : .78)}`,
      borderRadius: "11px",
      background: active
        ? `linear-gradient(155deg, ${rgba(faction.base, .86)}, ${rgba(faction.base, .60)} 56%, rgba(24,31,41,.96))`
        : `linear-gradient(155deg, ${rgba(faction.base, .50)}, ${rgba(faction.base, .30)} 54%, rgba(20,27,37,.95))`,
      boxShadow: active
        ? `0 0 0 2px ${rgba(faction.border, .92)}, 0 0 16px 3px ${rgba(faction.border, .48)}, inset 0 1px 0 rgba(255,255,255,.18)`
        : `0 4px 10px rgba(0,0,0,.28), inset 0 0 0 1px ${rgba(faction.border, .12)}`,
      cursor: card.__selectionItemIds.length ? "pointer" : "default",
      filter: knockedOut ? "saturate(.42) brightness(.72)" : active ? "brightness(1.13)" : "none",
      opacity: knockedOut ? ".84" : "1",
      transform: "translateZ(0)",
      scale: active ? String(ZOOM_CFG.scale) : "1",
      transformOrigin: "50% 50%",
      transition: "scale 160ms ease, filter 160ms ease, box-shadow 160ms ease, border-color 160ms ease",
      zIndex: active ? "5" : boss ? "3" : "1",
    });
    card.__selectionBaseShadow = card.style.boxShadow;

    card.addEventListener("click", (event) => {
      if (event.target.closest("button, [role='button']")) return;
      event.stopPropagation();
      void __selectTrackerEntry(entry, event);
    });
    card.addEventListener("contextmenu", (event) => {
      __openInitiativeCardContextMenu(entry, event);
    });

    const portrait = document.createElement("div");
    Object.assign(portrait.style, {
      position: "relative",
      width: `${portraitSize}px`,
      height: `${portraitSize}px`,
      flex: `0 0 ${portraitSize}px`,
      marginTop: boss ? "6px" : "4px",
      overflow: "hidden",
      border: `2px solid ${faction.border}`,
      borderRadius: "50%",
      boxSizing: "border-box",
      background: `linear-gradient(145deg, ${rgba(faction.base, .42)}, rgba(31,39,51,.94))`,
      boxShadow: active
        ? `0 0 0 1px ${rgba(faction.border, .92)}, 0 0 9px ${rgba(faction.border, .36)}, 0 3px 9px rgba(0,0,0,.38)`
        : "0 3px 9px rgba(0,0,0,.38)",
      zIndex: "2",
    });

    if (entry.portrait) {
      const image = document.createElement("img");
      image.src = entry.portrait;
      image.alt = "";
      Object.assign(image.style, {
        width: "100%",
        height: "100%",
        display: "block",
        objectFit: "cover",
        objectPosition: "50% 50%",
        transform: "scale(1.04)",
      });
      portrait.appendChild(image);
    } else {
      const fallback = document.createElement("div");
      fallback.textContent = String(entry.name || "?").slice(0, 1).toUpperCase();
      Object.assign(fallback.style, {
        width: "100%",
        height: "100%",
        display: "grid",
        placeItems: "center",
        fontSize: "23px",
        fontWeight: "700",
        background: `linear-gradient(145deg, ${rgba(faction.base, .60)}, rgba(8,12,21,.92))`,
      });
      portrait.appendChild(fallback);
    }

    if (boss) {
      const bossFrame = document.createElement("img");
      const bossFrameSize = Math.round(portraitSize * BOSS_PORTRAIT_FRAME_SCALE_COMPACT);
      bossFrame.src = BOSS_PORTRAIT_FRAME_SRC;
      bossFrame.alt = "";
      bossFrame.setAttribute("aria-hidden", "true");
      bossFrame.draggable = false;
      Object.assign(bossFrame.style, {
        position: "absolute",
        left: "50%",
        top: `${3 + (boss ? 6 : 4) + (portraitSize / 2)}px`,
        width: `${bossFrameSize}px`,
        height: `${bossFrameSize}px`,
        objectFit: "contain",
        transform: "translate(-50%, -50%)",
        pointerEvents: "none",
        filter: "drop-shadow(0 2px 4px rgba(0,0,0,.72))",
        WebkitMaskImage: BOSS_PORTRAIT_FRAME_MASK,
        maskImage: BOSS_PORTRAIT_FRAME_MASK,
        zIndex: "3",
      });
      card.appendChild(bossFrame);
    }

    const initiative = document.createElement("span");
    initiative.textContent = String(entry.initiative ?? 0);
    initiative.title = "Iniziativa";
    Object.assign(initiative.style, {
      position: "absolute",
      left: "6px",
      top: "6px",
      minWidth: "25px",
      height: "25px",
      padding: "0 4px",
      boxSizing: "border-box",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      border: `1px solid ${rgba(faction.border, active ? .98 : .78)}`,
      borderRadius: "999px",
      background: "rgba(7,11,18,.96)",
      color: "#fff",
      fontSize: "11px",
      fontWeight: "700",
      boxShadow: "0 2px 6px rgba(0,0,0,.56)",
      zIndex: "4",
    });
    card.appendChild(initiative);

    if (entry.__groupCollapsed && entry.__groupCount > 1) {
      const count = compactStatusBadge(`x${entry.__groupCount}`, "Gruppo collassato");
      Object.assign(count.style, {
        position: "absolute",
        right: "6px",
        top: "6px",
        height: "24px",
        minWidth: "27px",
        zIndex: "5",
      });
      card.appendChild(count);
    } else if (entry.isEpicAction || entry.isEpic || isLairId(entry.id)) {
      const label = compactStatusBadge(
        entry.isEpicAction ? "EP" : entry.isEpic ? "E" : "L",
        entry.isEpicAction ? "Azione Epica" : entry.isEpic ? "Boss Epico" : "Azione di Tana",
        entry.isEpicAction || entry.isEpic ? "legendary" : "neutral"
      );
      Object.assign(label.style, {
        position: "absolute",
        right: "6px",
        top: "6px",
        height: "24px",
        minWidth: "27px",
        zIndex: "5",
      });
      card.appendChild(label);
    }

    if (active) {
      const activeMarker = document.createElement("span");
      activeMarker.title = "Turno attivo";
      activeMarker.setAttribute("aria-label", activeMarker.title);
      Object.assign(activeMarker.style, {
        position: "absolute",
        top: "2px",
        left: "50%",
        width: "0",
        height: "0",
        transform: "translateX(-50%)",
        borderLeft: "5px solid transparent",
        borderRight: "5px solid transparent",
        borderTop: `7px solid ${faction.border}`,
        zIndex: "6",
      });
      card.appendChild(activeMarker);
    }

    if (knockedOut) {
      const ko = compactStatusBadge("KO", `Fuori combattimento: 0 / ${hpMax}`);
      ko.dataset.cardKoBadge = "1";
      Object.assign(ko.style, {
        position: "absolute",
        right: "6px",
        top: entry.__groupCollapsed && entry.__groupCount > 1 ? "34px" : "6px",
        height: "21px",
        zIndex: "6",
      });
      card.appendChild(ko);
    }


    const name = document.createElement("div");
    name.textContent = entry.__groupCollapsed
      ? `${entry.__groupBase} (Gruppo)`
      : entry.name;
    name.title = entry.__groupCollapsed
      ? `${entry.__groupBase} (x${entry.__groupCount})`
      : entry.name;
    Object.assign(name.style, {
      width: "100%",
      height: "14px",
      marginTop: "1px",
      overflow: "hidden",
      color: active ? "#fff" : "rgba(255,255,255,.90)",
      fontSize: "9px",
      fontWeight: active ? "700" : "600",
      lineHeight: "14px",
      textAlign: "center",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      textShadow: "0 1px 3px #000",
    });
    if (IS_GM && !virtual && !entry.__groupCollapsed) {
      name.title = "Doppio clic per rinominare il token";
      name.style.cursor = "text";
      name.addEventListener("dblclick", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (card.dataset.renaming === "1") return;

        const originalName = String(entry.name || "").trim();
        const input = document.createElement("input");
        input.type = "text";
        input.value = originalName;
        input.maxLength = 120;
        input.autocomplete = "off";
        input.spellcheck = false;
        Object.assign(input.style, {
          width: "100%",
          height: "20px",
          marginTop: "0",
          padding: "1px 4px",
          border: `1px solid ${faction.border}`,
          borderRadius: "5px",
          background: "rgba(5,9,15,.97)",
          color: "#fff",
          fontSize: "9px",
          fontWeight: "700",
          textAlign: "center",
          outline: "none",
        });

        card.dataset.renaming = "1";
        card.draggable = false;
        name.replaceWith(input);
        input.focus();
        input.select();

        let finished = false;
        const finish = async (save) => {
          if (finished) return;
          finished = true;
          const nextName = input.value.trim();
          let displayedName = originalName;
          if (save && nextName && nextName !== originalName) {
            try {
              await OBR.scene.items.updateItems([entry.id], (items) => {
                const item = items[0];
                __setSceneTokenDisplayName(item, nextName);
              });
              displayedName = nextName;
              entry.name = nextName;
            } catch (error) {
              console.warn("[initiative] compact rename token:", error?.message || error);
            }
          }
          name.textContent = displayedName;
          name.title = displayedName;
          if (input.isConnected) input.replaceWith(name);
          delete card.dataset.renaming;
          card.draggable = dragAllowed;
        };

        input.addEventListener("pointerdown", (event) => event.stopPropagation());
        input.addEventListener("click", (event) => event.stopPropagation());
        input.addEventListener("dblclick", (event) => event.stopPropagation());
        input.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void finish(true);
          } else if (event.key === "Escape") {
            event.preventDefault();
            void finish(false);
          }
        });
        input.addEventListener("blur", () => void finish(true));
      });
    }

    const hpText = document.createElement("div");
    hpText.dataset.cardHpText = "1";
    hpText.textContent = showHP
      ? `HP ${Math.round(safeHP)} / ${Math.round(hpMax)}`
      : "";
    Object.assign(hpText.style, {
      display: showHP ? "block" : "none",
      width: "100%",
      height: "11px",
      overflow: "hidden",
      color: knockedOut ? "rgba(255,255,255,.58)" : "rgba(226,232,240,.82)",
      fontSize: "8px",
      fontWeight: "500",
      lineHeight: "11px",
      textAlign: "center",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    });

    const hpTrack = document.createElement("div");
    Object.assign(hpTrack.style, {
      display: showHP ? "block" : "none",
      width: "calc(100% - 8px)",
      height: "5px",
      marginTop: "1px",
      overflow: "hidden",
      border: "1px solid rgba(0,0,0,.76)",
      borderRadius: "999px",
      background: "rgba(0,0,0,.64)",
      boxSizing: "border-box",
    });
    const hpFill = document.createElement("div");
    hpFill.dataset.hpFill = "1";
    hpFill.dataset.itemId = entry.id;
    Object.assign(hpFill.style, {
      width: showHP ? `${hpPercent * 100}%` : "0%",
      height: "100%",
      background: knockedOut ? "#475569" : hpColorByPct(hpPercent),
    });
    hpTrack.appendChild(hpFill);

    const status = document.createElement("div");
    status.dataset.cardSelectionIgnore = "1";
    Object.assign(status.style, {
      width: "100%",
      height: "14px",
      flex: "0 0 14px",
      marginTop: "0",
      padding: "0",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "2px",
      overflow: "visible",
      border: "0",
      background: "transparent",
      fontFamily: "inherit",
    });
    const legendary = members.find((member) => Number(member.legendary?.max) > 0)?.legendary;
    const legendaryResistances = members.find(
      (member) => Number(member.legendaryResistances?.max) > 0
    )?.legendaryResistances;

    let previewPill = null;
    let effectSlot = null;
    const effectsPopoverOpen = __expandedCompactEffectsId === entry.id;
    if (compactEffects.length) {
      effectSlot = document.createElement("div");
      Object.assign(effectSlot.style, {
        position: "relative",
        minWidth: "0",
        flex: "1 1 auto",
        height: "14px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "visible",
      });
      previewPill = __buildCompactEffectPill(compactEffects[0], true);
      previewPill.style.flex = "1 1 100%";
      if (hasExpandableEffects) {
        previewPill.setAttribute("role", "button");
        previewPill.setAttribute("tabindex", "0");
        previewPill.setAttribute("aria-expanded", effectsPopoverOpen ? "true" : "false");
        previewPill.setAttribute("aria-label", effectsPopoverOpen ? "Nascondi gli altri effetti" : `Mostra altri ${compactEffects.length - 1} effetti`);
        previewPill.style.cursor = "pointer";
      }
      effectSlot.appendChild(previewPill);
      status.appendChild(effectSlot);
    }

    let moreEffectsButton = null;
    if (hasExpandableEffects) {
      moreEffectsButton = document.createElement("button");
      moreEffectsButton.type = "button";
      moreEffectsButton.textContent = "+";
      moreEffectsButton.dataset.cardSelectionIgnore = "1";
      moreEffectsButton.setAttribute("aria-expanded", effectsPopoverOpen ? "true" : "false");
      moreEffectsButton.setAttribute("aria-label", effectsPopoverOpen ? "Nascondi gli altri effetti" : `Mostra altri ${compactEffects.length - 1} effetti`);
      moreEffectsButton.title = effectsPopoverOpen ? "Nascondi gli altri effetti" : `Mostra altri ${compactEffects.length - 1} effetti`;
      Object.assign(moreEffectsButton.style, {
        position: "absolute",
        top: "calc(100% + 1px)",
        left: "50%",
        width: "16px",
        height: "16px",
        padding: "0 0 1px",
        display: effectsPopoverOpen ? "none" : "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        border: "1px solid rgba(255,255,255,.34)",
        borderRadius: "50%",
        background: "rgba(8,12,21,.92)",
        color: "#fff",
        fontFamily: "inherit",
        fontSize: "13px",
        fontWeight: "800",
        lineHeight: "1",
        cursor: "pointer",
        boxShadow: "0 1px 4px rgba(0,0,0,.45)",
        transform: "translateX(-50%)",
        zIndex: "22",
      });
    }

    if (legendary) {
      const badge = compactStatusBadge(
        `A${Math.max(0, Number(legendary.current) || 0)}`,
        `Azioni leggendarie: ${Math.max(0, Number(legendary.current) || 0)}/${Math.max(0, Number(legendary.max) || 0)}`,
        "legendary"
      );
      badge.style.height = "14px";
      status.appendChild(badge);
    }
    if (legendaryResistances) {
      const badge = compactStatusBadge(
        `R${Math.max(0, Number(legendaryResistances.current) || 0)}`,
        `Resistenze leggendarie: ${Math.max(0, Number(legendaryResistances.current) || 0)}/${Math.max(0, Number(legendaryResistances.max) || 0)}`,
        "resistance"
      );
      badge.style.height = "14px";
      status.appendChild(badge);
    }

    card.append(portrait, name, hpText, hpTrack, status);
    if (moreEffectsButton) effectSlot.appendChild(moreEffectsButton);
    if (hasExpandableEffects) {
      const syncEffectsToggleState = (opened) => {
        moreEffectsButton.style.display = opened ? "none" : "inline-flex";
        moreEffectsButton.setAttribute("aria-expanded", opened ? "true" : "false");
        moreEffectsButton.setAttribute("aria-label", opened ? "Nascondi gli altri effetti" : `Mostra altri ${compactEffects.length - 1} effetti`);
        moreEffectsButton.title = opened ? "Nascondi gli altri effetti" : `Mostra altri ${compactEffects.length - 1} effetti`;
        previewPill.setAttribute("aria-expanded", opened ? "true" : "false");
        previewPill.setAttribute("aria-label", opened ? "Nascondi gli altri effetti" : `Mostra altri ${compactEffects.length - 1} effetti`);
      };
      const toggleEffects = async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const opened = await __toggleCompactEffectsPopover(card, previewPill, entry.id, compactEffects);
        syncEffectsToggleState(opened);
      };
      moreEffectsButton.addEventListener("pointerdown", (event) => event.stopPropagation());
      moreEffectsButton.addEventListener("click", toggleEffects);
      previewPill.addEventListener("pointerdown", (event) => event.stopPropagation());
      previewPill.addEventListener("click", toggleEffects);
      previewPill.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        void toggleEffects(event);
      });
    }
    if (active) card.dataset.active = "1";
    __applyTrackerSelectionState(card);
    return card;
  });

  __replaceTrackCardsAnimated(nodes);
  __animateActiveCardEntrance(animateActive && activeChanged, activeId);
  if (__expandedCompactEffectsId && !nodes.some((node) =>
    node.dataset.itemId === __expandedCompactEffectsId && node.dataset.hasEffectOverflow === "1"
  )) {
    void __closeCompactEffectsPopover();
  }
  resizeCompactTrackerPopover(visibleEntries);
  updateActiveCardMovementIndicator();
  if (__scrollActiveOnNextRender || activeChanged) {
    __scrollActiveOnNextRender = false;
    __runAfterGroupLayoutTransition(() => {
      __scrollTrackerCardIntoView(track.querySelector('[data-active="1"]'));
    });
  }
  __lastRenderedActiveId = activeId;
}

    function renderTrack(entries, state, opts = {}) {
    if (__suspendRenders) return;
    const animateActive = !!opts.animateActive;
    if (isCompactTrackerLayout()) {
      renderCompactTrack(entries, state, { animateActive });
      return;
    }
    const len = state.order.length;
    const activeIdx = state.current ?? 0;
    const currentActiveId = len ? state.order[activeIdx] : null;   // <-- AGGIUNTO QUI
    const nextId = len ? state.order[(activeIdx + 1) % len] : null;

    // ---- PRE-PROCESS: costruiamo una lista “entriesForRender” che rispetta i collapse
    const collapsed = state?.collapsed || {};
    const groups = __buildGroups(entries);

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
    card.dataset.groupKey = e.__groupKey || __groupKey(e);
    card.dataset.trackerCard = "1";
    card.__selectionItemIds = __selectionIdsForEntry(e);
    card.title = "Click: seleziona token. Ctrl/Shift+click: selezione multipla. Click destro: azioni";
    card.style.cursor = card.__selectionItemIds.length ? "pointer" : "default";
    card.addEventListener("click", (event) => {
      if (event.target.closest("button, input, select, textarea, [contenteditable='true'], [role='button'], [data-badge], [data-card-selection-ignore]")) return;
      event.stopPropagation();
      void __selectTrackerEntry(e, event);
    });
    card.addEventListener("contextmenu", (event) => {
      __openInitiativeCardContextMenu(e, event);
    });

    const HAS_LEG = !!(e.legendary && Number(e.legendary.max) > 0);
    const HAS_PAR = Number(e.paragonActions) > 1;
    const IS_EPIC = !!e.isEpic;
    const IS_BOSS = HAS_LEG || HAS_PAR || IS_EPIC;
    const CLASSIC_HP_VALUE = Number.isFinite(Number(e.hp)) ? Number(e.hp) : 0;
    const CLASSIC_HP_MAX = Number.isFinite(Number(e.hpMax)) ? Number(e.hpMax) : 0;
    const CLASSIC_HP_VISIBLE = IS_GM || ["ally", "pc"].includes(String(e.attitude || "").toLowerCase());
    const KNOCKED_OUT = CLASSIC_HP_VISIBLE && !e.__groupCollapsed &&
      !isLairId(e.id) && !isEpicActionId(e.id) &&
      CLASSIC_HP_MAX > 0 && CLASSIC_HP_VALUE <= 0;
    card.dataset.hpCanSee = CLASSIC_HP_VISIBLE ? "1" : "0";
    card.dataset.hpVisible = CLASSIC_HP_VISIBLE && CLASSIC_HP_MAX > 0 ? "1" : "0";
    card.dataset.knockedOut = KNOCKED_OUT ? "1" : "0";
    const PLAYER_CARD_HAS_HP = !IS_GM && !e.__groupCollapsed &&
      ["ally", "pc"].includes(String(e.attitude || "").toLowerCase());
    const PLAYER_BOSS_VERTICAL_OFFSET = IS_BOSS && !IS_GM && !PLAYER_CARD_HAS_HP
      ? (HAS_LEG ? 16 : 7)
      : 0;

    const cardEffectData = __safeConditions(e.__groupCollapsed ? null : e.conditions);
    const HAS_CARD_EFFECTS =
      !e.__groupCollapsed && (
      Object.keys(cardEffectData.flags || {}).length > 0 ||
      (cardEffectData.custom?.length || 0) > 0 ||
      (cardEffectData.instances?.length || 0) > 0 ||
      (Array.isArray(e.spells) && e.spells.length > 0) ||
      !!e.isConcentrating);

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
    card.style.marginLeft = "20px"; // spazio per il ritratto e i controlli radiali
    card.style.background = `linear-gradient(105deg, ${rgba(c.base, .38)} 0%, ${rgba(c.base, .16)} 58%, rgba(31,39,51,.94) 100%)`;
    card.style.border = "none";
    card.style.borderRadius = `${R_INNER}px`;
    card.style.overflow = "visible";

    // 1) Outline nero esterno — SHARP
    const outline = document.createElement("div");
    Object.assign(outline.style, {
      position: "absolute",
      inset: "0",
      border: `${OUTLINE_W}px solid ${rgba(c.border, .72)}`,
      borderRadius: `${R_OUTER}px`,
      pointerEvents: "none",
      zIndex: "0",
    });

    // 2a) FONDO COLORATO dell’anello (esterno squadrato)
    const ringFill = document.createElement("div");
    Object.assign(ringFill.style, {
      position: "absolute",
      inset: `${OUTLINE_W}px`,
      border: `1px solid ${rgba(c.base, .22)}`,
      background: "transparent",
      borderRadius: `${Math.max(0, R_OUTER - OUTLINE_W)}px`,
      pointerEvents: "none",
      zIndex: "0",
    });

    // 2b) “TAPPO” centrale che crea il buco arrotondato
    const ringHole = document.createElement("div");
    Object.assign(ringHole.style, {
      position: "absolute",
      inset: `${OUTLINE_W + FRAME_W}px`,
      borderRadius: `${R_INNER}px`,
      background: "transparent",
      pointerEvents: "none",
      zIndex: "0",
    });

    // (opzionale) lieve sheen che segue l’anello
    const sheen = document.createElement("div");
    Object.assign(sheen.style, {
      position: "absolute",
      inset: `${OUTLINE_W}px`,
      background: "linear-gradient(135deg, rgba(255,255,255,.10), transparent 42%)",
      borderRadius: `${Math.max(0, R_OUTER - OUTLINE_W)}px`,
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
card.style.minWidth = "284px";
card.style.maxWidth = "284px";
card.style.padding  = "0px 0px 0px";
card.style.boxSizing = "border-box";
card.style.color = "#fff";
card.style.display = "flex";
card.style.flexDirection = "column";
card.style.alignItems = "stretch";
card.style.gap = "0";

// altezza base + boost se boss
const BASE_CARD_H = 60;
const MAIN_CARD_H = IS_BOSS ? (BASE_CARD_H + LEG_BOSS_CFG.extraHeight) : BASE_CARD_H;
const EFFECT_ROW_H = HAS_CARD_EFFECTS ? 14 : 0;
const CARD_H = MAIN_CARD_H + EFFECT_ROW_H;
card.style.height = CARD_H + "px";

// applica cornice stile BG3 (come prima)
applyBG3Frame(card, c, {
  outlineW: 1.5,
  frameW: 2,
  rOuter: 16,
  rInner: 14
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
  card.style.scale = "1";
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
      `linear-gradient(105deg,
        ${rgba(c.base, .82)} 0%,
        ${rgba(c.base, .52)} 52%,
        rgba(34,43,56,.96) 100%
      )`;

    card.style.boxShadow =
      `0 0 0 2px ${c.border},
      0 0 16px 3px ${rgba(c.base, .42)},
      inset 0 0 0 1px rgba(255,255,255,.38)`;

    card.dataset.active = "1";
{

  // --- ZOOM ATTIVO: anima SOLTANTO quando cambia l’attivo ---
  const baseScale   = IS_BOSS ? (LEG_BOSS_CFG?.scale ?? 1) : 1;
  card.style.scale = String(ZOOM_CFG.scale);
  card.dataset.zoomState = "active";

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
    left: IS_BOSS ? "-8px" : `${L}px`,
    top: IS_BOSS ? "auto" : "50%",
    bottom: IS_BOSS ? "0px" : "auto",
    transform: IS_BOSS ? "none" : "translateY(55%)",
    width: `${S}px`,
    height: `${S}px`,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: `${F}px`,
    fontWeight: "700",
    color: "#fff",
    background: c.border,
    boxShadow: "0 2px 6px rgba(0,0,0,.85), 0 0 0 2px rgba(0,0,0,.6)",
    zIndex: IS_BOSS ? "8" : "4",
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

  if (KNOCKED_OUT) {
    card.style.filter = "saturate(.42) brightness(.72)";
    card.style.opacity = ".84";
  }

  // --- header: avatar + name + badge (tutto in riga)

  // --- costanti avatar/overlap ---
  const AVA_BASE  = 58;                 // diametro avatar “normale”
  const OVER_BASE = 12;                 // sporgenza normale

// Se ha azioni leggendarie, avatar più grande e un filo più “sporgente”
  const AVA  = IS_BOSS ? 72 : AVA_BASE;
  const OVER = IS_BOSS ? 0 : OVER_BASE;
  const AVATAR_LEFT = IS_BOSS ? -12 : -OVER;

  // header: avatar + name + badge
  const header = document.createElement("div");
  const CONTENT_LEFT = IS_BOSS ? 76 : (AVA - OVER + 12);
  const BOSS_CONTENT_OFFSET = IS_BOSS
    ? Math.round((MAIN_CARD_H - BASE_CARD_H) / 2)
    : 0;
  const BOSS_HP_ROW_TOP = HAS_LEG ? 49 : 43;
  const BOSS_HP_BAR_BOTTOM = HAS_LEG ? 8 : 14;
  const CENTER_SINGLE_LINE_NAME = !!e.__groupCollapsed || !!e.isEpicAction || isEpicActionId(e.id);
  Object.assign(header.style, {
    position: "relative",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    height: `${MAIN_CARD_H}px`,
    flex: `0 0 ${MAIN_CARD_H}px`,
    width: "100%",
    padding: "0",
    paddingLeft: `${CONTENT_LEFT}px`,      // spazio per il testo (riusa la costante)
    paddingRight: `${BADGE_RIGHT + BADGE_SIZE + 10}px`,
    boxSizing: "border-box",
  });

  // Wrapper + img: clip perfetto e cover affidabile
const AVATAR_ZOOM = 1.20; // ↑ porta a 1.08/1.12 se alcuni ritratti hanno “cornici” interne

const avatarWrap = document.createElement("div"); // contiene e clippa
Object.assign(avatarWrap.style, {
  position: "absolute",
  left: `${AVATAR_LEFT}px`,
  top: "50%",
  transform: "translateY(-50%)",
  width: `${AVA}px`,
  height: `${AVA}px`,
  borderRadius: "50%",
  overflow: "hidden",
  zIndex: IS_BOSS ? "3" : "2",
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
    fontWeight: "700",
    fontSize: "18px",
    background: "rgba(255,255,255,.08)",
    color: "#fff",
    transform: `scale(${AVATAR_ZOOM})`,
    transformOrigin: "50% 50%",
  });
}

avatarWrap.appendChild(avatarInner);

let knockedOutBadge = null;
card.dataset.koBadgeLeft = `${AVATAR_LEFT + AVA - 17}px`;
card.dataset.koBadgeTop = IS_BOSS ? "2px" : "1px";
if (KNOCKED_OUT) {
  knockedOutBadge = compactStatusBadge("KO", `Fuori combattimento: 0 / ${CLASSIC_HP_MAX}`);
  knockedOutBadge.dataset.cardKoBadge = "1";
  Object.assign(knockedOutBadge.style, {
    position: "absolute",
    left: `${AVATAR_LEFT + AVA - 17}px`,
    top: IS_BOSS ? "2px" : "1px",
    height: "20px",
    minWidth: "25px",
    zIndex: "8",
    pointerEvents: "none",
  });
}

let bossPortraitFrame = null;
if (IS_BOSS) {
  const frameSize = Math.round(AVA * BOSS_PORTRAIT_FRAME_SCALE);
  const frameOutset = Math.round((frameSize - AVA) / 2);
  bossPortraitFrame = document.createElement("img");
  bossPortraitFrame.src = BOSS_PORTRAIT_FRAME_SRC;
  bossPortraitFrame.alt = "";
  bossPortraitFrame.setAttribute("aria-hidden", "true");
  bossPortraitFrame.draggable = false;
  Object.assign(bossPortraitFrame.style, {
    position: "absolute",
    left: `${AVATAR_LEFT - frameOutset}px`,
    top: "50%",
    width: `${frameSize}px`,
    height: `${frameSize}px`,
    objectFit: "contain",
    transform: "translateY(-50%)",
    pointerEvents: "none",
    filter: "drop-shadow(0 2px 5px rgba(0,0,0,.78))",
    zIndex: "7",
  });
}

  const bossTopRow = IS_BOSS && !e.__groupCollapsed
    ? document.createElement("div")
    : null;
  if (bossTopRow) {
    Object.assign(bossTopRow.style, {
      position: "absolute",
      top: HAS_LEG
        ? `${8 + PLAYER_BOSS_VERTICAL_OFFSET}px`
        : `${IS_GM ? 21 : (Math.round((MAIN_CARD_H - 20) / 2) - 7 + PLAYER_BOSS_VERTICAL_OFFSET)}px`,
      left: `${CONTENT_LEFT}px`,
      right: `${BADGE_RIGHT + BADGE_SIZE + 10}px`,
      height: "20px",
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-start",
      gap: "3px",
      minWidth: "0",
      overflow: "hidden",
      zIndex: "5",
    });
  }

  // Ogni boss usa una riga HP dedicata: mai affiancata al nome.
  const legendaryHPRow = IS_BOSS && !e.__groupCollapsed
    ? document.createElement("div")
    : null;
  if (legendaryHPRow) {
    Object.assign(legendaryHPRow.style, {
      position: "absolute",
      top: `${BOSS_HP_ROW_TOP}px`,
      left: `${CONTENT_LEFT}px`,
      right: `${BADGE_RIGHT + BADGE_SIZE + 10}px`,
      height: "20px",
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-start",
      gap: "3px",
      minWidth: "0",
      zIndex: "5",
    });
  }

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
if (HAS_LEG && !e.__groupCollapsed) {
  Object.assign(name.style, {
    position: "absolute",
    top: "15px",
    left: `${CONTENT_LEFT}px`,
    right: `${BADGE_RIGHT + BADGE_SIZE + 10}px`,
  });
}

const nameLabel = document.createElement("span");
nameLabel.textContent = e.__groupCollapsed ? `${e.__groupBase} (Gruppo)` : e.name;
Object.assign(nameLabel.style, {
  flex: "1 1 auto",
  minWidth: "0",
  textAlign: "left",
  fontSize: "15px",
  fontWeight: "700",
  letterSpacing: "-.01em",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});
if (IS_GM && !e.__groupCollapsed && !isLairId(e.id) && !isEpicActionId(e.id)) {
  nameLabel.title = "Doppio clic per rinominare il token";
  nameLabel.style.cursor = "text";
  nameLabel.addEventListener("dblclick", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (card.dataset.renaming === "1") return;

    const originalName = String(e.name || "").trim();
    const input = document.createElement("input");
    input.type = "text";
    input.value = originalName;
    input.maxLength = 120;
    input.autocomplete = "off";
    input.spellcheck = false;
    input.dataset.cardSelectionIgnore = "1";
    Object.assign(input.style, {
      flex: "1 1 auto",
      minWidth: "0",
      height: "28px",
      padding: "2px 7px",
      border: `1px solid ${c.border}`,
      borderRadius: "7px",
      background: "rgba(5,9,15,.96)",
      color: "#fff",
      font: "inherit",
      fontSize: "14px",
      fontWeight: "700",
      outline: "none",
    });

    card.dataset.renaming = "1";
    card.draggable = false;
    nameLabel.replaceWith(input);
    input.focus();
    input.select();

    let finished = false;
    const finish = async (save) => {
      if (finished) return;
      finished = true;
      const nextName = input.value.trim();
      let displayedName = originalName;
      if (save && nextName && nextName !== originalName) {
        try {
          await OBR.scene.items.updateItems([e.id], (items) => {
            const item = items[0];
            __setSceneTokenDisplayName(item, nextName);
          });
          displayedName = nextName;
          e.name = nextName;
        } catch (error) {
          console.warn("[initiative] rename token:", error?.message || error);
        }
      }
      nameLabel.textContent = displayedName;
      name.title = displayedName;
      if (input.isConnected) input.replaceWith(nameLabel);
      delete card.dataset.renaming;
      card.draggable = DRAG_OK;
    };

    input.addEventListener("pointerdown", (event) => event.stopPropagation());
    input.addEventListener("click", (event) => event.stopPropagation());
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void finish(true);
      } else if (event.key === "Escape") {
        event.preventDefault();
        void finish(false);
      }
    });
    input.addEventListener("blur", () => void finish(true));
  });
}
name.appendChild(nameLabel);


let cardToolsDock = null;
let placeCardToolInRadialSlot = null;
if (IS_GM && !isLairId(e.id) && !isEpicActionId(e.id)) {
  cardToolsDock = document.createElement("div");
  if (e.__groupCollapsed) {
    Object.assign(cardToolsDock.style, {
      position: "absolute",
      top: "calc(50% + 9px)",
      left: `${AVA - OVER + 18}px`,
      right: "auto",
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

    const radialAngles = IS_BOSS ? [212, 180, 132] : [228, 180, 132];
    const radialButtonSize = 20;
    const radialRadius = (AVA / 2) - 2;
    const radialLeftOffset = IS_BOSS ? -8 : -4;
    placeCardToolInRadialSlot = (button, slot) => {
      const angle = (radialAngles[slot] ?? 0) * (Math.PI / 180);
      const center = AVA / 2;
      const left = center + (Math.cos(angle) * radialRadius) - (radialButtonSize / 2) + radialLeftOffset;
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

if (cardToolsDock && e.__groupCollapsed) {
  const groupDeltaButton = document.createElement("button");
  groupDeltaButton.type = "button";
  groupDeltaButton.textContent = "±";
  groupDeltaButton.title = "Ricalibra HP correnti e massimi di tutto il gruppo";
  groupDeltaButton.setAttribute("aria-label", groupDeltaButton.title);
  Object.assign(groupDeltaButton.style, {
    flex: "0 0 auto",
    minWidth: "24px",
    width: "24px",
    height: "20px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0",
    borderRadius: "999px",
    border: "1px solid rgba(255,255,255,.22)",
    background: "rgba(0,0,0,.52)",
    color: "#fff",
    fontSize: "15px",
    fontWeight: "700",
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
      width: "52px",
      height: "20px",
      boxSizing: "border-box",
      padding: "0 4px",
      borderRadius: "999px",
      border: "1px solid rgba(251,191,36,.82)",
      outline: "none",
      background: "rgba(245,158,11,.42)",
      color: "#fff",
      fontSize: "12px",
      fontWeight: "700",
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
  tagsDock.dataset.cardSelectionIgnore = "1";
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
    fontWeight: String(cfg.fontWeight ?? 700),
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
    left:  (AVA - OVER - (CHIP / 2)) + "px",               // AVA - OVER - CHIP/2
    top:   `calc(50% + ${(AVA / 2) - (CHIP / 2) - OFFSET}px)`, // 50% + AVA/2 - CHIP/2 - offset
    width:  CHIP + "px",
    height: CHIP + "px",
    borderRadius: "999px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "12px",
    fontWeight: "700",
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
    position: "absolute",
    top: HAS_LEG
      ? "8px"
      : `${((!IS_GM && !PLAYER_CARD_HAS_HP && !IS_BOSS) || CENTER_SINGLE_LINE_NAME)
        ? Math.round((MAIN_CARD_H - 22) / 2)
        : (8 + BOSS_CONTENT_OFFSET)}px`,
    left: `${CONTENT_LEFT}px`,
    right: `${BADGE_RIGHT + BADGE_SIZE + (HAS_LEG ? 102 : 10)}px`,
    height: HAS_LEG ? "20px" : "22px",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    flex: "1 1 auto",
    minWidth: "0",                 // necessario per ellissi in flex
    fontSize: "15px",
    fontWeight: "700",
    textAlign: "left",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    zIndex: "4",
  });
  if (bossTopRow) {
    Object.assign(name.style, {
      position: "relative",
      top: "auto",
      left: "auto",
      right: "auto",
      width: "auto",
      maxWidth: "100%",
      height: "20px",
      flex: "0 1 auto",
      justifyContent: "flex-start",
      textAlign: "left",
      zIndex: "1",
    });
  }
  if (!IS_GM && !bossTopRow) {
    name.style.justifyContent = "flex-start";
    name.style.textAlign = "left";
  }

  // badge iniziativa (ancorato a destra, centrato verticalmente)
  const badge = document.createElement("div");
  badge.textContent = String(e.initiative);
  badge.title = "Click per modificare l'iniziativa";
  Object.assign(badge.style, {
  position: "absolute",
  right: BADGE_RIGHT + "px",
  top: `${MAIN_CARD_H / 2}px`,
  transform: "translateY(-50%)",
  width: BADGE_SIZE + "px",
  height: BADGE_SIZE + "px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0",
  fontSize: "16px",
  fontWeight: "700",
  lineHeight: "1",
  color: "#fff",
  background: "rgba(24,32,44,.84)",
  border: `1px solid ${rgba(c.border, .88)}`,
  borderRadius: "50%",
  boxShadow: `0 4px 12px rgba(0,0,0,.42), inset 0 0 0 1px ${rgba(c.base, .18)}`,
  cursor: "text",
});

// --- Dock per condizioni
const condDock = document.createElement("div");
condDock.style.position = "absolute";
condDock.style.top = `${MAIN_CARD_H - 5}px`;
condDock.style.left = `${CONTENT_LEFT}px`;
condDock.style.right = "10px";
condDock.style.minHeight = "18px";
condDock.style.zIndex = "10";
condDock.style.overflow = "visible"; // importantissimo per far “uscire” l’overlay
condDock.style.display = "flex";
condDock.style.flexDirection = "row";
condDock.style.alignItems = "center";   // ancora a sinistra
condDock.style.gap = CHIP_GAP_PX + "px";
header.appendChild(condDock);

// --- CHIPS: condizioni + incantesimi in un unico gruppo con overflow condiviso ---
const fragAll = document.createDocumentFragment();

// 1) Condizioni
const condData = cardEffectData;
const hasAny = (Object.keys(condData.flags).length > 0) || (condData.custom && condData.custom.length > 0) || condData.instances.length > 0;
if (hasAny) {
  const fragCond = __buildConditionChipsSafe(condData, { cap: CONDITIONS, compact: true });
  if (fragCond) fragAll.appendChild(fragCond);
}

// 2) Incantesimi
if (!e.__groupCollapsed && Array.isArray(e.spells) && e.spells.length) {
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
mountChipsWithOverflow(condDock, fragAll, { compact: true, limit: 2 });

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
  fontWeight: "700",
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
  chev.dataset.cardSelectionIgnore = "1";
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
    fontWeight: "700",
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
  chev.dataset.cardSelectionIgnore = "1";
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
    fontWeight: "700",
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

// --- FASCIA RISORSE LEGGENDARIE: fuori dal nome e dalla riga HP ---
if (!e.__groupCollapsed && e.legendary && Number(e.legendary.max) > 0) {
  const resourceDock = document.createElement("div");
  Object.assign(resourceDock.style, {
    position: "absolute",
    top: `${(IS_GM ? 29 : LEG_RESOURCE_CFG.top) + PLAYER_BOSS_VERTICAL_OFFSET}px`,
    left: `${CONTENT_LEFT}px`,
    right: `${BADGE_RIGHT + BADGE_SIZE + 8}px`,
    minHeight: "18px",
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: `${LEG_RESOURCE_CFG.clusterGap}px`,
    overflow: "hidden",
    zIndex: "5",
    pointerEvents: "auto",
  });

  const makeResourceLabel = (text, title) => {
    const label = document.createElement("span");
    label.textContent = text;
    label.title = title;
    Object.assign(label.style, {
      flex: "0 0 auto",
      color: "rgba(255,255,255,.74)",
      fontSize: "7px",
      fontWeight: "700",
      lineHeight: "1",
      letterSpacing: ".04em",
    });
    return label;
  };

  const actionsCluster = document.createElement("div");
  Object.assign(actionsCluster.style, {
    display: "flex",
    alignItems: "center",
    gap: "3px",
    minWidth: "0",
    flex: "0 0 auto",
  });
  actionsCluster.append(
    makeResourceLabel("A", "Azioni leggendarie"),
    mkLegendaryPips(
      e.legendary,
      async (nextCurrent) => {
        if (!IS_GM) return;
        try { await setLegendaryCurrent(e.id, nextCurrent); } catch {}
      },
      e.attitude || "enemy",
    ),
  );

  const makeMaxControls = (resourceName, currentMax, onChange) => {
    const maxControls = document.createElement("div");
    Object.assign(maxControls.style, {
      display: "grid",
      gridTemplateRows: `repeat(2, ${LEG_RESOURCE_CFG.controlHeight}px)`,
      alignItems: "center",
      gap: "0",
      width: `${LEG_RESOURCE_CFG.controlWidth}px`,
      height: `${LEG_RESOURCE_CFG.controlHeight * 2}px`,
      flex: "0 0 auto",
    });
    const makeMaxButton = (text, delta) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = text;
      button.title = delta < 0
        ? `Riduci ${resourceName} massime`
        : `Aumenta ${resourceName} massime`;
      Object.assign(button.style, {
        width: `${LEG_RESOURCE_CFG.controlWidth}px`,
        minWidth: `${LEG_RESOURCE_CFG.controlWidth}px`,
        height: `${LEG_RESOURCE_CFG.controlHeight}px`,
        minHeight: `${LEG_RESOURCE_CFG.controlHeight}px`,
        padding: "0",
        borderRadius: delta < 0 ? "4px 4px 1px 1px" : "1px 1px 4px 4px",
        border: "1px solid rgba(255,255,255,.18)",
        background: "rgba(0,0,0,.68)",
        color: "#fff",
        fontSize: "9px",
        fontWeight: "700",
        lineHeight: "1",
        cursor: "pointer",
      });
      button.addEventListener("click", async (event) => {
        event.stopPropagation();
        const nextMax = Math.max(1, Math.min(5, Number(currentMax) + delta));
        try { await onChange(nextMax); } catch {}
      });
      return button;
    };
    maxControls.append(makeMaxButton("+", 1), makeMaxButton("−", -1));
    return maxControls;
  };

  if (IS_GM) {
    actionsCluster.appendChild(makeMaxControls(
      "azioni leggendarie",
      e.legendary.max,
      (nextMax) => setLegendaryMax(e.id, nextMax),
    ));
  }

  const divider = document.createElement("span");
  Object.assign(divider.style, {
    width: "1px",
    height: "12px",
    flex: "0 0 1px",
    background: "rgba(255,255,255,.18)",
  });

  const resistances = e.legendaryResistances || {
    max: DEFAULT_LEGENDARY_RESISTANCES,
    current: DEFAULT_LEGENDARY_RESISTANCES,
  };
  const resistanceCluster = document.createElement("div");
  Object.assign(resistanceCluster.style, {
    display: "flex",
    alignItems: "center",
    gap: "3px",
    minWidth: "0",
    flex: "0 0 auto",
  });
  resistanceCluster.append(
    makeResourceLabel("R", "Resistenze leggendarie"),
    mkLegendaryResistancePips(
      resistances,
      async (nextCurrent) => {
        if (!IS_GM) return;
        try { await setLegendaryResistanceCurrent(e.id, nextCurrent); } catch {}
      },
    ),
  );
  if (IS_GM) {
    resistanceCluster.appendChild(makeMaxControls(
      "resistenze leggendarie",
      resistances.max,
      (nextMax) => setLegendaryResistanceMax(e.id, nextMax),
    ));
  }

  resourceDock.append(actionsCluster, divider, resistanceCluster);
  header.appendChild(resourceDock);
}

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
      fontWeight: "700",
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
  lab.textContent = String(e.paragonActions);
  Object.assign(lab.style, {
    width: `${PAR_CTRL_CFG.btnSize}px`,
    height: `${PAR_CTRL_CFG.btnSize}px`,
    minWidth: `${PAR_CTRL_CFG.btnSize}px`,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    boxSizing: "border-box",
    borderRadius: `${PAR_CTRL_CFG.btnRadius}px`,
    border: "1px solid rgba(255,255,255,.18)",
    background: "rgba(0, 0, 0, 0.72)",
    color: "#fff",
    fontSize: "12px",
    fontWeight: "700",
    lineHeight: "1",
    userSelect: "none",
  });
  
  const btnMinus = mkParBtn("−", -1);
  const btnPlus  = mkParBtn("+", +1);

  dockPar.append(btnMinus, btnPlus, lab);
  header.appendChild(dockPar);
}

  header.append(avatarWrap);
  if (knockedOutBadge) header.appendChild(knockedOutBadge);
  if (bossPortraitFrame) header.appendChild(bossPortraitFrame);
  if (bossTopRow) {
    bossTopRow.appendChild(name);
    header.appendChild(bossTopRow);
    if (legendaryHPRow) header.appendChild(legendaryHPRow);
    header.appendChild(badge);
  } else {
    header.append(name, badge);
  }
// Indicatore concentrazione: pallino con "C" solo sulle card dei singoli token.
{
  // Le card aggregate di gruppo non espongono effetti dei membri.
  const concOn = !e.__groupCollapsed && !!e.isConcentrating;
  if (concOn) {
    // Il colore deriva dalla concentrazione del token rappresentato dalla card.
    const k = e.concSpellKey || null;
    const col = k ? __spellColor(k) : { solid: "rgba(0,0,0,0.80)", border: "rgba(255,255,255,.18)" };

    const C_DOT_SIZE = 18;           // diametro pallino
    const cDot = document.createElement("div");
    cDot.textContent = "C";
    cDot.title = k
      ? `Concentrazione: ${k[0].toUpperCase() + k.slice(1)}`
      : "Concentrazione attiva";

    Object.assign(cDot.style, {
      boxSizing: "border-box",
      flex: "0 0 auto",
      width: C_DOT_SIZE + "px",
      height: C_DOT_SIZE + "px",
      borderRadius: "50%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: "10px",
      fontWeight: "700",
      lineHeight: "1",
      color: "#fff",
      background: col.solid,      // ⟵ colore della spell
      border: `2px solid rgba(0,0,0,1)`,
      boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.5)",
      zIndex: "6",
      pointerEvents: "none"
    });
    const chipRow = condDock.firstElementChild;
    if (chipRow) chipRow.prepend(cDot);
    else condDock.appendChild(cDot);
  }
}


  card.appendChild(header);

// === HP pill (solo GM)
// === HP pill (GM sempre; Player solo per ally/pc)
const _att = String(e.attitude || "").toLowerCase();
const PLAYER_VISIBLE_ATTITUDES = ["ally", "pc"];
const _playerCanSeeHP = PLAYER_VISIBLE_ATTITUDES.includes(_att);

if ((IS_GM || _playerCanSeeHP) && !e.__groupCollapsed && !isLairId(e.id) && !isEpicActionId(e.id)) {
  const hpControlsRow = document.createElement("div");
  Object.assign(hpControlsRow.style, {
    position: "absolute",
    top: IS_BOSS ? "0px" : `${MAIN_CARD_H - 32}px`,
    left: `${CONTENT_LEFT}px`,
    right: `${BADGE_RIGHT + BADGE_SIZE + 10}px`,
    height: IS_BOSS ? `${MAIN_CARD_H - 4}px` : "25px",
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: "4px",
    paddingBottom: IS_BOSS ? "0" : "6px",
    boxSizing: "border-box",
    zIndex: "3",
    pointerEvents: IS_BOSS ? "none" : "auto",
  });

  const pill = document.createElement("div");
  pill.title = "Click: modifica HP. +N/-N sui token selezionati; ± modifica anche gli HP massimi";
  pill.style.position = "relative";
  pill.style.marginRight = "0";
  pill.style.padding = "0";
  pill.style.fontSize = "12px";
  pill.style.fontWeight = "700";
  pill.style.lineHeight = "13px";
  pill.style.color = "#fff";
  pill.style.background = "transparent";
  pill.style.border = "none";
  pill.style.borderRadius = "0";
  pill.style.boxShadow = "none";
  pill.style.cursor = "text";
  pill.style.zIndex = "3";
  pill.style.pointerEvents = "auto";

  const hpVal  = CLASSIC_HP_VALUE;
  const hpMaxV = CLASSIC_HP_MAX;
  pill.innerHTML = formatHPHTML(hpVal, hpMaxV);   // <-- usa HTML per colorare cur se temp
  if (KNOCKED_OUT) pill.style.color = "rgba(255,255,255,.58)";
  pill.dataset.badge  = "hp";
  pill.dataset.itemId = e.id;

  // === Barra HP visuale accanto alla pill ===
  const hpBarWrap = document.createElement("div");
  hpBarWrap.style.position = "absolute";
  hpBarWrap.style.left = "0";
  hpBarWrap.style.right = "0";
  hpBarWrap.style.bottom = IS_BOSS ? `${BOSS_HP_BAR_BOTTOM}px` : "0";
  hpBarWrap.style.width = "auto";
  hpBarWrap.style.height = "6px";
  hpBarWrap.style.boxSizing = "border-box";
  hpBarWrap.style.background = "rgba(0,0,0,.68)";
  hpBarWrap.style.border = "1px solid rgba(0,0,0,.85)";
  hpBarWrap.style.borderRadius = "999px";
  hpBarWrap.style.overflow = "hidden";
  hpBarWrap.style.zIndex = "3";
  hpBarWrap.style.boxShadow = "inset 0 1px 2px rgba(0,0,0,.65)";

  const initPct = hpMaxV > 0 ? Math.max(0, Math.min(1, hpVal / hpMaxV)) : 0;
  const hpFill = document.createElement("div");
  hpFill.dataset.hpFill = "1";
  hpFill.dataset.itemId = e.id;
  hpFill.style.width = (initPct * 100) + "%";
  hpFill.style.height = "100%";
  hpFill.style.background = KNOCKED_OUT
    ? "#475569"
    : initPct > 0.66 ? "#16a34a" : initPct > 0.33 ? "#facc15" : "#dc2626";

  hpBarWrap.appendChild(hpFill);

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

  let initiativeCardButton = null;
  if (e.attitude === "pc") {
    initiativeCardButton = document.createElement("button");
    initiativeCardButton.type = "button";
    initiativeCardButton.title = "Apri scheda iniziativa";
    initiativeCardButton.setAttribute("aria-label", initiativeCardButton.title);
    Object.assign(initiativeCardButton.style, {
      flex: "0 0 auto",
      minWidth: "18px",
      width: "18px",
      height: "18px",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "0",
      borderRadius: "999px",
      border: "1px solid rgba(255,255,255,.22)",
      background: "rgba(0,0,0,.52)",
      cursor: "pointer",
      boxShadow: "0 1px 3px rgba(0,0,0,.35)",
      pointerEvents: "auto",
    });
    const initiativeCardIcon = document.createElement("img");
    initiativeCardIcon.src = `${import.meta.env.BASE_URL || "/"}character-sheet.svg`;
    initiativeCardIcon.alt = "";
    Object.assign(initiativeCardIcon.style, {
      width: "13px",
      height: "13px",
      display: "block",
      pointerEvents: "none",
    });
    initiativeCardButton.appendChild(initiativeCardIcon);
    initiativeCardButton.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      event.preventDefault();
    });
    initiativeCardButton.addEventListener("click", (event) => {
      event.stopPropagation();
      event.preventDefault();
      void openInitiativeCardPopup(e);
    });
  } else if (IS_GM) {
    hpDeltaButton = document.createElement("button");
    hpDeltaButton.type = "button";
    hpDeltaButton.textContent = "±";
    hpDeltaButton.title = "Ricalibra HP correnti e massimi dello stesso +N/-N";
    hpDeltaButton.setAttribute("aria-label", hpDeltaButton.title);
    hpDeltaButton.setAttribute("aria-pressed", "false");
    Object.assign(hpDeltaButton.style, {
      flex: "0 0 auto",
      minWidth: "18px",
      width: "18px",
      height: "18px",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "0",
      borderRadius: "999px",
      border: "1px solid rgba(255,255,255,.22)",
      background: "rgba(0,0,0,.52)",
      color: "#fff",
      fontSize: "13px",
      fontWeight: "700",
      lineHeight: "1",
      cursor: "pointer",
      boxShadow: "0 1px 3px rgba(0,0,0,.35)",
      pointerEvents: "auto",
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
    hpDeltaButton.style.fontSize = "13px";
  }

  const hpCaption = document.createElement("span");
  hpCaption.textContent = "HP";
  Object.assign(hpCaption.style, {
    color: "rgba(255,255,255,.62)",
    fontSize: "11px",
    fontWeight: "700",
    lineHeight: "13px",
    pointerEvents: "none",
  });

  if (legendaryHPRow) {
    hpCaption.style.fontSize = "9px";
    hpCaption.style.lineHeight = "11px";
    const legendaryHPButton = initiativeCardButton || hpDeltaButton;
    if (legendaryHPButton) {
      legendaryHPButton.style.width = "18px";
      legendaryHPButton.style.minWidth = "18px";
      legendaryHPButton.style.height = "18px";
    }
    legendaryHPRow.append(hpCaption, pill);
    if (initiativeCardButton) legendaryHPRow.appendChild(initiativeCardButton);
    if (hpDeltaButton) legendaryHPRow.appendChild(hpDeltaButton);
    hpControlsRow.appendChild(hpBarWrap);
  } else if (bossTopRow) {
    hpCaption.style.fontSize = "9px";
    hpCaption.style.lineHeight = "11px";
    const bossHPButton = initiativeCardButton || hpDeltaButton;
    if (bossHPButton) {
      bossHPButton.style.width = "18px";
      bossHPButton.style.minWidth = "18px";
      bossHPButton.style.height = "18px";
    }
    bossTopRow.append(hpCaption, pill);
    if (initiativeCardButton) bossTopRow.appendChild(initiativeCardButton);
    if (hpDeltaButton) bossTopRow.appendChild(hpDeltaButton);
    hpControlsRow.appendChild(hpBarWrap);
  } else {
    hpControlsRow.appendChild(hpCaption);
    hpControlsRow.appendChild(pill);
    if (initiativeCardButton) hpControlsRow.appendChild(initiativeCardButton);
    if (hpDeltaButton) hpControlsRow.appendChild(hpDeltaButton);
    hpControlsRow.appendChild(hpBarWrap);
  }
  card.appendChild(hpControlsRow);

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
    inp.style.fontFamily = "inherit";
    inp.style.fontSize = pill.style.fontSize || "12px";
    inp.style.fontWeight = pill.style.fontWeight || "700";
    inp.style.lineHeight = pill.style.lineHeight || "13px";
    inp.style.padding = "0";
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
    hpFill.style.background = nextHPMax > 0 && nextHP <= 0 ? "#475569" : hpColorByPct(pct);


    const isMultiTarget = multiUpdates.length > 1;
    const recalibratesMax = linkedHPMaxDelta && hpDelta !== null;
    const concentrationDamage = hpDelta !== null && hpDelta < 0
      ? Math.abs(hpDelta)
      : Math.max(0, hpVal - nextHP);
    const concentrationDamageChanges = recalibratesMax || concentrationDamage <= 0
      ? []
      : (isMultiTarget
          ? multiUpdates.map((update) => ({ itemId: update.itemId, damage: concentrationDamage }))
          : [{ itemId: e.id, damage: concentrationDamage }]);
    let historyIds = isMultiTarget ? multiUpdates.map((update) => update.itemId) : [e.id];
    if (!isMultiTarget) {
      try {
        const group = await _getGroupForItemId(e.id);
        historyIds = Array.from(new Set([e.id, ...(group?.members || [])]));
      } catch {}
    }
    historyIds = await getZeroHPConditionHistoryIds(historyIds);

    await withItemMetaHistory({
      kind: "hp",
      label: isMultiTarget
        ? (recalibratesMax ? "Ricalibrazione HP/Max multitarget" : "Modifica HP multitarget")
        : (recalibratesMax ? "Ricalibrazione HP/Max" : "Modifica HP"),
      itemIds: historyIds,
      fields: ["hp", "hpMax", "conditions", SPELLS_META_KEY, CONC_META_KEY],
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
    if (concentrationDamageChanges.length) {
      try {
        await showConcentrationDamageWarning(concentrationDamageChanges);
      } catch (err) {
        console.warn("[concentration] damage warning error:", err?.message || err);
      }
    }
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
}
      __applyTrackerSelectionState(card);
      return card;
    });

    __replaceTrackCardsAnimated(nodes);
    __animateActiveCardEntrance(animateActive, currentActiveId);
    updateActiveCardMovementIndicator(latestMovementSnapshot);

  if (__scrollActiveOnNextRender) {
    __scrollActiveOnNextRender = false;
    __runAfterGroupLayoutTransition(() => {
      __scrollTrackerCardIntoView(track.querySelector('[data-active="1"]'));
    });
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
  const [st, entries] = await Promise.all([getSceneState(), readEntries()]);
  const next = reorderWithinSameInitiativeState(
    st,
    entries,
    sourceId,
    targetId,
    placeBefore,
    { lairInitiative: LAIR_INITIATIVE },
  );
  if (!next) return;
  await setSceneState(prev => ({
    ...(prev || {}),
    order: next.order,
    current: next.current,
  }));
}

// Sposta un BLOCCO di ID (sourceIds) prima/dopo targetId SOLO nel blocco dei pari iniziativa
async function _reorderBlockWithinSameInitiative(sourceIds, targetId, placeBefore) {
  const [st, entries] = await Promise.all([getSceneState(), readEntries()]);
  const next = reorderBlockWithinSameInitiativeState(
    st,
    entries,
    sourceIds,
    targetId,
    placeBefore,
    { lairInitiative: LAIR_INITIATIVE },
  );
  if (!next) return;
  await setSceneState(prev => ({
    ...(prev || {}),
    order: next.order,
    current: next.current,
  }));
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

function __renderOptimisticNavigationState(state) {
  if (__suspendRenders || __editingInitForId || __editingHPForId) return false;
  const order = Array.isArray(state?.order) ? state.order : [];
  if (!order.length) return false;
  const ordered = order.map((id) => __activeLabelEntriesById.get(id)).filter(Boolean);
  if (ordered.length !== order.length) {
    __initiativeDiag("render:optimistic-skipped-missing-entry", {
      expected: order.length,
      resolved: ordered.length,
      activeId: __activeIdForState(state),
    });
    return false;
  }

  const activeId = __activeIdForState(state);
  const animateActive = activeId !== __prevActiveId;
  try {
    const lbl = document.getElementById("tbp-round-label");
    if (lbl) lbl.textContent = `Round ${Math.max(1, state.round || 1)}`;
    renderTrack(ordered, state, { animateActive });
    __prevActiveId = activeId;
    __optimisticNavigationDigest = initiativeStateDigest(state);
    __initiativeDiag("render:optimistic-committed", {
      activeId,
      animateActive,
      layout: getTrackerLayout(),
      navigationRevision: __navigationRevision,
    });
    return true;
  } catch (err) {
    console.warn("[initiative] optimistic navigation render:", err?.message || err);
    return false;
  }
}

async function renderAll(reason = "unspecified") {
  if (__suspendRenders) return;
  const renderRevision = ++__renderRequestRevision;
  __initiativeDiag("render:requested", { renderRevision, reason });
  const stateRaw = await getSceneState();
  // Gli snapshot intermedi di una raffica di click non devono ridisegnare
  // lista, fumetto o selezione sopra lo stato ottimistico più recente.
  if (__isStaleNavigationState(stateRaw)) {
    __initiativeDiag("render:skipped-stale-navigation", {
      renderRevision,
      reason,
      activeId: __activeIdForState(stateRaw),
    });
    return;
  }
  if (renderRevision < __latestAcceptedRenderRevision) {
    __initiativeDiag("render:skipped-superseded", { renderRevision, reason });
    return;
  }
  __latestAcceptedRenderRevision = renderRevision;
  const baseEntries  = await getEntriesWithLair(stateRaw);
  if (!isCurrentRenderRevision(renderRevision, __latestAcceptedRenderRevision)) {
    __initiativeDiag("render:skipped-superseded", { renderRevision, reason });
    return;
  }
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
  if (__isStaleNavigationState(stateClean)) {
    __initiativeDiag("render:skipped-stale-before-commit", {
      renderRevision,
      reason,
      activeId: __activeIdForState(stateClean),
    });
    return;
  }
  if (!__navigationPumpRunning && !__navigationDesiredState) {
    __latestInitiativeState = stateClean;
  }
  zoomChk.checked = isAutoFocusEnabled(stateClean);
  setCompactToggleVisual(zoomToggleWrap, zoomChk.checked);

    try {
      const lbl = document.getElementById("tbp-round-label");
      if (lbl) lbl.textContent = `Round ${Math.max(1, stateClean.round || 1)}`;
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
      if (!isCurrentRenderRevision(renderRevision, __latestAcceptedRenderRevision)) {
        __initiativeDiag("render:skipped-superseded", { renderRevision, reason });
        return;
      }
      if (__isStaleNavigationState(stateClean)) {
        __initiativeDiag("render:skipped-stale-before-commit", {
          renderRevision,
          reason,
          activeId: __activeIdForState(stateClean),
        });
        return;
      }
    }
    // Evita rimpiazzi DOM mentre c'è un editor aperto o stiamo switchando editor
    if (__suspendRenders) return;
    if (__editingInitForId || __editingHPForId) {
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

    const cleanDigest = initiativeStateDigest(stateClean);
    if (reason === "metadata" && cleanDigest === __optimisticNavigationDigest) {
      __optimisticNavigationDigest = null;
      __prevActiveId = activeIdNow;
      __initiativeDiag("render:optimistic-acknowledged", {
        renderRevision,
        activeId: activeIdNow,
        layout: getTrackerLayout(),
      });
      return;
    }
    if (reason === "metadata" && !__navigationPumpRunning && !__navigationDesiredState) {
      __optimisticNavigationDigest = null;
    }

    const animateActive = (activeIdNow !== __prevActiveId);

    renderTrack(ordered, stateClean, { animateActive });  // <-- passa il flag
    __initiativeDiag("render:committed", {
      renderRevision,
      reason,
      activeId: activeIdNow,
      animateActive,
      layout: getTrackerLayout(),
    });

    __prevActiveId = activeIdNow; // aggiorna per il prossimo render
  }

  OBR.onReady(async () => {
    mountTrackerPopoverToggleListener();
    mountSpeedCheckStateBroadcast();
    mountConcentrationWarningBroadcast();
    await mountTurnNoticeBroadcast().catch(() => {});
    await mountSpeedWarningBroadcast().catch(() => {});
    setTrackedMoveButtonActive(false);
    try {
      const role =
        (await OBR.player?.getRole?.()) ||
        (await OBR.room?.getRole?.()) ||
        "PLAYER";
      IS_GM = String(role).toUpperCase() === "GM";
      viewOptionsRow.style.display = IS_GM ? "flex" : "none";
      globalPanelsWrap.style.display = IS_GM ? "inline-flex" : "none";
      zoomToggleWrap.style.display = IS_GM ? "flex" : "none";
      trackedMoveButton.style.display = IS_GM ? "inline-flex" : "none";
      movementAllowanceControls.style.display = IS_GM ? "grid" : "none";
      movementActions.style.display = IS_GM ? "grid" : "none";
      movementCompactLimitControl.style.display = IS_GM && isCompactTrackerLayout() ? "inline-flex" : "none";
      // Mostra il toggle Tana solo al GM (e nascondilo a tutti gli altri)
try {
  const hasBtn = !!roundPill.querySelector('[data-reset-round="1"]');
  const hasAddAllBtn = !!roundPill.querySelector('[data-add-all-initiative="1"]');
  const hasFactionConfiguratorBtn = !!roundPill.querySelector('[data-faction-configurator="1"]');
  const hasClearBtn = !!roundPill.querySelector('[data-clear-initiative="1"]');
  const hasHistoryBtn = !!roundPill.querySelector('[data-history="1"]');
  if (IS_GM) {
    if (!roundResetSlot.isConnected) roundPill.prepend(roundResetSlot);
    if (!roundActions.isConnected) roundPill.appendChild(roundActions);
    if (!roundHistorySlot.isConnected) roundPill.appendChild(roundHistorySlot);
    if (!hasBtn) roundResetSlot.appendChild(makeRoundResetBtn());
    if (!hasAddAllBtn) roundActions.appendChild(makeAddAllInitiativeBtn());
    if (!hasClearBtn) roundActions.appendChild(makeClearInitiativeBtn());
    if (!hasFactionConfiguratorBtn) roundActions.appendChild(makeFactionConfiguratorBtn());
    if (!hasHistoryBtn) roundHistorySlot.appendChild(makeHistoryBtn());
  } else {
    if (hasBtn) roundPill.querySelector('[data-reset-round="1"]').remove();
    if (hasAddAllBtn) roundPill.querySelector('[data-add-all-initiative="1"]').remove();
    if (hasFactionConfiguratorBtn) roundPill.querySelector('[data-faction-configurator="1"]').remove();
    if (hasClearBtn) roundPill.querySelector('[data-clear-initiative="1"]').remove();
    if (hasHistoryBtn) roundPill.querySelector('[data-history="1"]').remove();
    if (roundResetSlot.isConnected) roundResetSlot.remove();
    if (roundActions.isConnected) roundActions.remove();
    if (roundHistorySlot.isConnected) roundHistorySlot.remove();
  }
} catch {}

try {
  if (IS_GM) {
    if (!lairToggleWrap.isConnected) {
      // inserisci il toggle tra la pill “Turno” e la lista
      if (IS_GM) {
  if (!lairToggleWrap.isConnected) sceneOptionsGroup.appendChild(lairToggleWrap);
} else {
  if (lairToggleWrap.isConnected) lairToggleWrap.remove();
}
    }
  } else {
    if (lairToggleWrap.isConnected) lairToggleWrap.remove();
  }
} catch {}
    applyTrackerLayout();

    } catch {
      IS_GM = false;
    }
    await __mountTrackerSelectionSync();
    try {
} catch (e) {
  console.error("[hpbar] mount error", e?.error?.message || e?.message || e);
}
  await mountHPBars();
  if (IS_GM) {
    enableSpeedCheckProcessor();
    subscribeMovementSegments(queueSpeedCheckMovements);
    await mountMovementHistoryWatcher();
  }
  await ensureState();
  await reconcileStateWithItems();
  await enforceUniqueNamePrefixes();
  await renderAll("boot");
  __lastInitiativeMetadataDigest = initiativeStateDigest(await getSceneState());
  __lastQueuedInitiativeMetadataDigest = __lastInitiativeMetadataDigest;
  __lastActiveId = __activeIdForState(__latestInitiativeState);
  syncSpeedCheckTurn(__latestInitiativeState);
  __lastRoundSeen = Math.max(1, Number(__latestInitiativeState?.round || 1));
  __lastConditionTurnState = __conditionTurnStateSnapshot(__latestInitiativeState);
  if (IS_GM) {
    void recordCombatTurn(__latestInitiativeState).catch((err) => {
      console.warn("[combat-log] initial turn:", err?.message || err);
    });
  }

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

async function __processInitiativeMetadata(st, stateDigest, metadataRevision) {
  __lastInitiativeMetadataDigest = stateDigest;
  if (__isStaleNavigationState(st)) {
    __initiativeDiag("metadata:skipped-stale-navigation", {
      activeId: __activeIdForState(st),
      metadataRevision,
    });
    return;
  }
  __initiativeDiag("metadata:processing", {
    activeId: __activeIdForState(st),
    round: st?.round,
    current: st?.current,
    metadataRevision,
  });
  syncSpeedCheckTurn(st);

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

  let roundEffectAdjustment = Promise.resolve();
  try {
    if (st && Array.isArray(st.order) && st.order.length > 0) {
      const roundNow = Math.max(1, Number(st.round || 1));
      if (__lastRoundSeen == null) {
        __lastRoundSeen = roundNow;
      } else if (roundNow !== __lastRoundSeen) {
        const delta = __lastRoundSeen - roundNow;
        __lastRoundSeen = roundNow;

        if (IS_GM) {
          const tokenIds = st.order
            .map(id => (typeof splitParagonId === "function" ? splitParagonId(id).baseId : id))
            .filter(id => id && !isLairId(id) && !isEpicActionId(id));
          const unique = Array.from(new Set(tokenIds));
          const run = async () => {
            await adjustSpellsForItems(unique, delta);
            await adjustConditionDurationsForItems(unique, delta);
          };
          __roundEffectQueue = __roundEffectQueue.then(run, run);
          roundEffectAdjustment = __roundEffectQueue;
        }
      }
    }
  } catch (err) {
    console.warn("[effects] queue round tick error:", err);
  }

  await renderAll("metadata"); // ridisegna UI
  if (!st || !Array.isArray(st.order) || st.order.length === 0) {
    return;
  }

  const activeId = st.order[st.current];

// --- Tick incantesimi/condizioni per ROUND (con direzione) ---
try {
  await roundEffectAdjustment;
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
  const previousActiveId = __lastActiveId;
  __lastActiveId = activeId;
  if (IS_GM) {
    void recordCombatTurn(st).catch((err) => {
      console.warn("[combat-log] turn:", err?.message || err);
    });
  }
  if (previousActiveId && IS_GM) {
    void broadcastTurnNotice(st).catch((err) => {
      console.warn("[turn-notice] broadcast error:", err?.message || err);
    });
  }

  // Reset delle azioni leggendarie a inizio turno della creatura attiva
  // Se è la Tana, niente reset legend e niente focus su scena
if (!isLairId(activeId) && !isEpicActionId(activeId)) {
  try { await resetLegendaryIfAny(activeId); }
  catch (e) { console.warn("[legendary] reset on turn:", e?.message || e); }

  queueSelectAndFocus(activeId, isAutoFocusEnabled(st));
}
  try {
    if (__matchesLatestActiveTurn(st)) {
      const entriesNow = await readEntries();
      const collapseChanged = await __applyAutoCollapse(entriesNow, st); // espandi gruppo attivo, collassa altri
      if (collapseChanged) await renderAll("auto-collapse");
    } else {
      __initiativeDiag("collapse:skipped-stale", {
        activeId,
        expectedActiveId: __activeIdForState(__latestInitiativeState),
      });
    }
  } catch (e) {
    console.warn("[initiative] auto-collapse on turn change:", e?.message || e);
  }
}

OBR.scene.onMetadataChange((meta) => {
  const st = meta?.[STATE_KEY];
  const stateDigest = initiativeStateDigest(st);
  if (stateDigest === __lastQueuedInitiativeMetadataDigest) {
    __initiativeDiag("metadata:skipped-unchanged", {
      activeId: __activeIdForState(st),
    });
    return;
  }
  __lastQueuedInitiativeMetadataDigest = stateDigest;
  const metadataRevision = ++__initiativeMetadataRevision;
  const run = () => __processInitiativeMetadata(st, stateDigest, metadataRevision);
  void __initiativeMetadataProcessor.enqueue(run).catch((err) => {
    console.warn("[initiative] metadata queue error:", err?.message || err);
  });
});

  subscribeSceneItemChanges(({ items }) => {
    for (const item of items || []) {
      const meta = item?.metadata?.[META_KEY];
      if (!meta || meta.inInitiative !== true) continue;
      syncTrackerHPNow(item.id, meta.hp, meta.hpMax);
    }
  }, {
    filter: (event) => event.flags.hpBars,
    immediate: true,
  });

  subscribeSceneItemChanges(async () => {
    if (__mutatingActiveLabel > 0) return;
    await reconcileStateWithItems();
    await enforceUniqueNamePrefixes();
    await renderAll();
  }, { filter: (event) => event.flags.tracker });

  // ——— Auto-ripristino HP quando cambia qualcosa tra gli item della scena
// (nuovi token, nome/ritratto cambiati, metadata azzerati, ecc.)
try {
  subscribeSceneItemChanges(() => {
    scheduleHPMemoryAutofill(150); // 150ms debounce
  }, { filter: (event) => event.flags.hpMemoryAutofill });
} catch (e) {
  console.warn("[hpMemory] onChange subscribe failed", e);
}

    btnPrev.addEventListener("click", async () => {
    const st = __latestInitiativeState || await getSceneState();
    if (!st || !st.order || st.order.length === 0) return;
    const nextBase = advanceInitiativeState(st, -1);
    const prevIdx = nextBase.current;
    const nextRound = nextBase.round;
    const cachedEntries = Array.from(__activeLabelEntriesById.values());
    const { collapsed } = __autoCollapseSnapshot(cachedEntries, nextBase);
    const next = { ...nextBase, collapsed };
    __latestInitiativeState = next;
    const activeId = next.order[next.current];
    __conditionNavigationHint = { activeId, current: prevIdx, round: nextRound, direction: -1 };
    const revision = ++__navigationRevision;
    __lastNavigationAt = Date.now();
    __scrollActiveOnNextRender = true;
    __initiativeDiag("navigation:intent", {
      direction: -1,
      activeId,
      round: nextRound,
      current: prevIdx,
      navigationRevision: revision,
    });
    syncActiveTurnLabel(activeId);
    __renderOptimisticNavigationState(next);

    queueNavigationState(next);
    try { delete document.__tbpZoomStamp; } catch {}

    if (revision !== __navigationRevision) return;
    if (activeId && !isLairId(activeId)) {
      queueSelectAndFocus(activeId, isAutoFocusEnabled(next));
    }

  });

  btnNext.addEventListener("click", async () => {
    const st = __latestInitiativeState || await getSceneState();
    if (!st || !st.order || st.order.length === 0) return;
    const nextBase = advanceInitiativeState(st, 1);
    const nextIdx = nextBase.current;
    const nextRound = nextBase.round;
    const cachedEntries = Array.from(__activeLabelEntriesById.values());
    const { collapsed } = __autoCollapseSnapshot(cachedEntries, nextBase);
    const next = { ...nextBase, collapsed };
    __latestInitiativeState = next;
    const activeId = next.order[next.current];
    __conditionNavigationHint = { activeId, current: nextIdx, round: nextRound, direction: 1 };
    const revision = ++__navigationRevision;
    __lastNavigationAt = Date.now();
    __scrollActiveOnNextRender = true;
    __initiativeDiag("navigation:intent", {
      direction: 1,
      activeId,
      round: nextRound,
      current: nextIdx,
      navigationRevision: revision,
    });
    syncActiveTurnLabel(activeId);
    __renderOptimisticNavigationState(next);

    queueNavigationState(next);
    try { delete document.__tbpZoomStamp; } catch {}

    if (revision !== __navigationRevision) return;
    if (activeId && !isLairId(activeId)) {
      queueSelectAndFocus(activeId, isAutoFocusEnabled(next));
    }

  });

}
