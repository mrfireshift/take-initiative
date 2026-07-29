  // src/spells-tag.js
  import OBR, { buildLabel } from "@owlbear-rodeo/sdk";
  import { ID } from "./constants.js";
  import { getSpellDefinition } from "./spells-srd.js";
  import { spellExpiryCounter } from "./spellExpiryCore.js";
  import { effectsDiagnostics } from "./effectsDiagnostics.js";

  /* ===================== DEBUG ===================== */
  const DEBUG_CONC = false;
  const dlog = (...a) => { if (DEBUG_CONC) console.debug("[conc]", ...a); };

  async function __concentrationGetItems(diagnosticsSession, selector) {
    effectsDiagnostics.sdkCall(diagnosticsSession, "getItems");
    try {
      const items = await OBR.scene.items.getItems(selector);
      effectsDiagnostics.sdkResult(diagnosticsSession, "getItems", { returnedItems: items.length });
      return items;
    } catch (error) {
      effectsDiagnostics.sdkError(diagnosticsSession, "getItems");
      throw error;
    }
  }

  async function __concentrationGetItemBounds(diagnosticsSession, itemIds) {
    effectsDiagnostics.sdkCall(diagnosticsSession, "getItemBounds", { requestedItems: itemIds.length });
    try {
      const bounds = await OBR.scene.items.getItemBounds(itemIds);
      effectsDiagnostics.sdkResult(diagnosticsSession, "getItemBounds", { returnedItems: bounds ? itemIds.length : 0 });
      return bounds;
    } catch (error) {
      effectsDiagnostics.sdkError(diagnosticsSession, "getItemBounds");
      throw error;
    }
  }

  async function __concentrationAddItems(diagnosticsSession, items) {
    effectsDiagnostics.sdkCall(diagnosticsSession, "addItems", { requestedItems: items.length });
    try {
      await OBR.scene.items.addItems(items);
      effectsDiagnostics.widgetMutation(diagnosticsSession, "added", items.length);
    } catch (error) {
      effectsDiagnostics.sdkError(diagnosticsSession, "addItems");
      throw error;
    }
  }

  async function __concentrationUpdateItems(diagnosticsSession, itemIds, updater) {
    effectsDiagnostics.sdkCall(diagnosticsSession, "updateItems", { requestedItems: itemIds.length });
    try {
      await OBR.scene.items.updateItems(itemIds, updater);
      effectsDiagnostics.widgetMutation(diagnosticsSession, "updated", itemIds.length);
    } catch (error) {
      effectsDiagnostics.sdkError(diagnosticsSession, "updateItems");
      throw error;
    }
  }

  async function __concentrationDeleteItems(diagnosticsSession, itemIds) {
    effectsDiagnostics.sdkCall(diagnosticsSession, "deleteItems", { requestedItems: itemIds.length });
    try {
      await OBR.scene.items.deleteItems(itemIds);
      effectsDiagnostics.widgetMutation(diagnosticsSession, "deleted", itemIds.length);
    } catch (error) {
      effectsDiagnostics.sdkError(diagnosticsSession, "deleteItems");
      throw error;
    }
  }

  /* ===================== METADATA KEYS ===================== */
  const META_KEY           = `${ID}/meta`;

  const SPELLS_META_KEY    = `${ID}/spells`;
  const CONC_META_KEY      = `${ID}/concentration`;
  const CONC_WIDGET_META   = `${ID}/concWidgetOf`;     // owner: caster (dot) o target (label)
  const CONC_WIDGET_KEY    = `${ID}/concWidgetKey`;    // spell key
  const CONC_WIDGET_CASTER = `${ID}/concWidgetCaster`; // caster id (per label)
  const CONC_LABEL_HASHKEY = `${ID}/concLabelHash`;    // hash label (testo+dimensioni)
  const CONC_DOT_LAYOUT_KEY = `${ID}/concDotLayout`;
  const CONC_DOT_LAYOUT_VERSION = 9;
  const CONC_LABEL_LAYOUT_KEY = `${ID}/concLabelLayout`;
  const CONC_LABEL_LAYOUT_VERSION = 2;

  // Chiavi di root che NON sono spell e vanno ignorate
  const RESERVED_ROOT_KEYS = new Set([
    CONC_META_KEY,                // "concentration" lo gestiamo a parte
    "flags", "flag",
    "conditions", "status",
    "notes", "note",
    "initiative", "turn",
    "hp", "bars", "aura",
    "effects"
  ]);

  /* ===================== STILE: PALLINO ===================== */
  const DOT_DIAMETER = 42;
  const DOT_GAP      = 4;
  const DOT_FONT     = 23;
  const Z_DOT_TEXT   = 100021;

  /* ===================== STILE: LABEL ===================== */
  // Dimensioni/padding
  const LABEL_FONT    = 18;
  const LABEL_FONT_WEIGHT = 600;
  const LABEL_LINE_HEIGHT = 1;
  const LABEL_PAD_X   = 12;
  const LABEL_HEIGHT  = 27;
  const LABEL_MAX_W   = 300;
  const WIDGET_MAX_VIEW_SCALE = 1.35;

  // === Stack condiviso (spells + condizioni) ===
  const STACK_GAP = 1;                  // spazio compatto, calibrato sullo zoom abituale
  const STACK_CLEARANCE_SCALE = 1.1;    // margine anti-overlap senza amplificare il gap allo zoom vicino
  const COND_META_WIDGET_OF = `${ID}/condWidgetOf`;   // mirror da conditions.js
  const COND_META_WIDGET_KEY = `${ID}/condWidgetKey`; // mirror da conditions.js
  const COND_STACK_FALLBACK_H = 27;     // se non trovo l'altezza shape condizione

  // La prima riga parte sotto il badge C, lungo la dorsale sinistra del token.
  const STACK_DIR = 1;
  const STACK_TOP_INSET = -4 / 70; // stack leggermente piÃ¹ alto sul riferimento 1x1
  const __stackHeight = (height) => Math.ceil((Number(height) || LABEL_HEIGHT) * STACK_CLEARANCE_SCALE);
  function __visualTokenBox(targetItem, bounds = null) {
    const scaleX = Math.abs(Number(targetItem?.scale?.x)) || 1;
    const scaleY = Math.abs(Number(targetItem?.scale?.y)) || 1;
    const fallbackWidth = (Number(targetItem?.width) || 70) * scaleX;
    const fallbackHeight = (Number(targetItem?.height) || 70) * scaleY;
    const left = Number.isFinite(Number(bounds?.min?.x)) ? Number(bounds.min.x) : targetItem.position.x - fallbackWidth / 2;
    const top = Number.isFinite(Number(bounds?.min?.y)) ? Number(bounds.min.y) : targetItem.position.y - fallbackHeight / 2;
    const width = Number.isFinite(Number(bounds?.max?.x)) ? Number(bounds.max.x) - left : fallbackWidth;
    const height = Number.isFinite(Number(bounds?.max?.y)) ? Number(bounds.max.y) - top : fallbackHeight;
    return {
      left,
      top,
      width,
      height,
      diameter: Math.max(1, Math.min(width, height)),
    };
  }

  function stackBaseY(targetItem, bounds = null) {
    const box = __visualTokenBox(targetItem, bounds);
    return box.top + box.diameter * STACK_TOP_INSET;
  }

  // === Calcola la Y (centro) della riga in base all'indice (0-based), senza leggere la scena ===
  // Usa la stessa metrica della colonna: LABEL_HEIGHT, STACK_GAP, STACK_DIR e LABEL_OFFSET_Y.
  function __rowCYForIndex(targetItem, idx, targetBounds = null) {
    const baseY = stackBaseY(targetItem, targetBounds);
    const stackH = __stackHeight(LABEL_HEIGHT);
    const step  = stackH + STACK_GAP;                 // riserva la crescita screen-space massima
    // Prima riga (idx = 0) è a metà LABEL_HEIGHT dal baseY, poi si aggiunge step * idx
    const cy = baseY + STACK_DIR * (idx * step + stackH / 2);
    return Math.round(cy + LABEL_OFFSET_Y);
}

  // Distanza dal bordo superiore del token (usata per il calcolo box width/centro X)
  const LABEL_GAP     = 6;

  // Inset della dorsale rispetto al bordo sinistro visuale del token.
  const LABEL_OFFSET_X = 0.42;
  const LABEL_OFFSET_Y = -1;

    // === Layer target delle label ===
  const LAYER_BG   = "TEXT";
  const LAYER_TEXT = "TEXT";

  // z-index: testo sopra qualsiasi BG (margine ampio)
  const Z_LABEL_BG   = 220000;    // era 100018

  const DOT_BG_NAME     = "Concentrazione (bg)";
  const DOT_TEXT_NAME   = "Concentrazione (C)";
  const LABEL_BG_NAME   = "Concentrazione (label bg)";

  /* ===================== COLORE (stessa logica della initiativeList) ===================== */
  function spellKey(name) {
    return String(name || "").trim().toLowerCase();
  }
  function hueFromKey(key) {
    let h = 0; const s = String(key || "");
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h % 360;
  }
  function spellColorFromKey(key) {
    const hue = hueFromKey(String(key || ""));
    return {
      solid: `hsl(${hue}, 70%, 45%)`,
      fillOpacity: 0.88,
      border: `hsla(${hue}, 90%, 72%, .95)`,
    };
  }

  /* ===================== UTIL ===================== */
  function titleCaseLite(s) { return String(s || "").replace(/\S+/g, w => w[0]?.toUpperCase() + w.slice(1)); }
  let __labelMeasureContext = null;
  function estimateTextWidthPx(text, fontPx = LABEL_FONT) {
    try {
      __labelMeasureContext ||= document.createElement("canvas").getContext("2d");
      if (__labelMeasureContext) {
        __labelMeasureContext.font = `${LABEL_FONT_WEIGHT} ${fontPx}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
        return Math.ceil(__labelMeasureContext.measureText(String(text || "")).width);
      }
    } catch {}
    return Math.ceil(String(text || "").length * fontPx * 0.52);
  }
  function hash32(str) { let h = 0x811c9dc5; for (let i=0;i<str.length;i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h>>>0).toString(16); }

  /* ===== Centro pallino ===== */
  function calcDotCenterFor(it, d = DOT_DIAMETER, gap = DOT_GAP, bounds = null) {
    const fallback = __visualTokenBox(it);
    const left = Number.isFinite(Number(bounds?.min?.x)) ? Number(bounds.min.x) : fallback.left;
    const top = Number.isFinite(Number(bounds?.min?.y)) ? Number(bounds.min.y) : fallback.top;
    const width = Number.isFinite(Number(bounds?.max?.x)) ? Number(bounds.max.x) - left : fallback.width;
    const height = Number.isFinite(Number(bounds?.max?.y)) ? Number(bounds.max.y) - top : fallback.height;
    const radius = Math.max(1, Math.min(width, height) / 2);
    const circleInset = radius * (.9 - Math.SQRT1_2);
    return {
      cx: left + circleInset,
      cy: top + circleInset,
    };
  }

  /* ===== Box label sopra il target (Semplificato) ===== */
  // Restituisce centro e dimensioni; coord arrotondate per evitare sub-pixel
  function calcLabelBoxForTarget(target, textWidth) {
    const labelW = Math.min(LABEL_MAX_W, textWidth + LABEL_PAD_X * 2);
    const labelH = LABEL_HEIGHT;

    const top = target.position.y - (Number(target.height) || 70) / 2;

    // Centro della label: centrato orizzontalmente al token, sopra di LABEL_GAP,
    // con offset globali X/Y applicati.
    let cx = target.position.x + LABEL_OFFSET_X;
    let cy = top - LABEL_GAP - labelH / 2 + LABEL_OFFSET_Y;

    cx = Math.round(cx);
    cy = Math.round(cy);

    // Top-left calcolato solo per compatibilità (non usato dal TEXT)
    const tx = Math.round(cx - labelW / 2);
    const ty = Math.round(cy - labelH / 2);

    return { labelW, labelH, labelCx: cx, labelCy: cy, labelTx: tx, labelTy: ty };
  }

  // Calcola la Y (centro) per una entry "spell:<key|caster>" dentro la colonna unificata del target.
  // Stack orientabile tramite STACK_ANCHOR/STACK_DIR.
  // NEW: planned → elenco di righe (sig) già pianificate nel batch corrente, così il calcolo le considera
  async function __stackCYForSpell(targetItem, entrySig, planned = []) {
    const tid = targetItem.id;
    const baseY = stackBaseY(targetItem);

    // 1) tutte le label SPELL già presenti su questo target (qualsiasi caster)
    const allSpellWidgets = await OBR.scene.items.getItems(
      (i) => (i.type === "TEXT" || i.type === "SHAPE" || i.type === "LABEL")
        && i.metadata?.[CONC_WIDGET_META] === tid
        && !!i.metadata?.[CONC_WIDGET_CASTER]
    );

    // sig = keyNorm|casterId -> height
    const spellRows = new Map();
    for (const it of allSpellWidgets) {
      const k = spellKey(it.metadata?.[CONC_WIDGET_KEY] || "");
      const c = String(it.metadata?.[CONC_WIDGET_CASTER] || "");
      if (!k || !c) continue;
      const sig = `${k}|${c}`;
      const h = it.type === "LABEL"
        ? (Number(it.text?.height) || LABEL_HEIGHT)
        : it.type === "SHAPE" ? (Number(it.height) || LABEL_HEIGHT) : null;
      if (!spellRows.has(sig)) spellRows.set(sig, h || LABEL_HEIGHT);
      else if (h) spellRows.set(sig, h);
    }

    // 2) COND presenti (per l'altezza basta lo SHAPE bg)
    const condShapes = await OBR.scene.items.getItems(
      (i) => (i.type === "LABEL" || i.type === "SHAPE") && i.metadata?.[COND_META_WIDGET_OF] === tid
    );
    const condRows = new Map();
    for (const sh of condShapes) {
      const key = sh.metadata?.[COND_META_WIDGET_KEY];
      if (!key) continue;
      condRows.set(String(key), Number(sh.text?.height ?? sh.height) || COND_STACK_FALLBACK_H);
    }

    // 3) lista ordinata: spells (group 0), poi condizioni (group 1)
    const entries = [];
    for (const [sig, h] of spellRows) entries.push({ group: 0, key: sig, h });
    for (const [key, h] of condRows)  entries.push({ group: 1, key, h });

    // include anche le righe "prenotate" ma non ancora in scena
    for (const sig of planned) {
      if (!entries.some(e => e.group === 0 && e.key === sig)) {
        entries.push({ group: 0, key: sig, h: LABEL_HEIGHT });
      }
    }

    // assicurati che l'entry corrente sia presente
    if (!entries.some(e => e.group === 0 && e.key === entrySig)) {
      entries.push({ group: 0, key: entrySig, h: LABEL_HEIGHT });
    }

    entries.sort((A, B) => (A.group - B.group) || String(A.key).localeCompare(String(B.key)));

    // 4) Stack rispetto all'anchor scelto
    let cy = baseY;
    let prevH = 0;
    for (let i = 0; i < entries.length; i++) {
      const h = __stackHeight(entries[i].h);
      if (i === 0) {
        cy = baseY + STACK_DIR * (h / 2);
      } else {
        cy = cy + STACK_DIR * ((prevH / 2) + STACK_GAP + (h / 2));
      }
      if (entries[i].group === 0 && entries[i].key === entrySig) {
        return Math.round(cy + LABEL_OFFSET_Y);
      }
      prevH = h;
    }
    return Math.round(baseY + STACK_DIR * (__stackHeight(LABEL_HEIGHT) / 2) + LABEL_OFFSET_Y);
  }
  
  /* ===== Piano da cache esistente (no extra getItems) ===== */
// Calcola l'ordine delle righe spell per un target dato, unendo:
// - label spell già in scena su quel target (di QUALSIASI caster)
// - label che stiamo per creare per questo caster
function __spellPlanFromExisting(tid, existingWidgetsForTid = [], assigns, casterId) {
  const sigs = new Set();

  // 1) già in scena (qualsiasi caster)
  for (const w of existingWidgetsForTid) {
    const k = spellKey(w.metadata?.[CONC_WIDGET_KEY] || "");
    const c = String(w.metadata?.[CONC_WIDGET_CASTER] || "");
    if (k && c) sigs.add(`${k}|${c}`);
  }

  // 2) che stiamo per creare noi (solo se includono questo tid)
  for (const a of assigns) {
    const t = (a.targets && a.targets.length) ? a.targets : [casterId];
    if (t.includes(tid)) sigs.add(`${spellKey(a.key)}|${casterId}`);
  }

  // ordine stabile
  return [...sigs].sort((A, B) => String(A).localeCompare(String(B)));
}

  /* ===================== LETTURA ASSEGNAZIONI ===================== */

  function readSpellTurns(value) {
    if (value === undefined || value === null || value === "") return null;
    const turns = Number(value);
    return Number.isFinite(turns) ? Math.max(0, Math.floor(turns)) : null;
  }

  // Normalizza qualsiasi forma di META_KEY[SPELLS_META_KEY] in array di {name,id,conc,targets}
  function readSpellsList(it) {
    const meta = it?.metadata?.[META_KEY] || {};
    const raw = meta?.[SPELLS_META_KEY];
    const out = [];

    if (Array.isArray(raw)) {
      for (const s of raw) {
        if (!s) continue;
        out.push({
          name: (s.name ?? s.key ?? s.id ?? "").toString().trim(),
          id:   (s.id ?? "").toString().trim() || null,
          instanceId: (s.instanceId ?? "").toString().trim() || null,
          casterId: (s.casterId ?? "").toString().trim() || null,
          turns: readSpellTurns(s.turns),
          expiry: s.expiry && typeof s.expiry === "object" ? { ...s.expiry } : null,
          conc: !!s.conc,
          targets: Array.isArray(s.targets) ? s.targets.filter(Boolean) : undefined,
        });
      }
    } else if (raw && typeof raw === "object") {
      for (const [k, v] of Object.entries(raw)) {
        const name = (v?.name ?? v?.key ?? k).toString().trim();
        out.push({
          name,
          id: (v?.id ?? "").toString().trim() || null,
          instanceId: (v?.instanceId ?? "").toString().trim() || null,
          casterId: (v?.casterId ?? "").toString().trim() || null,
          turns: readSpellTurns(v?.turns),
          expiry: v?.expiry && typeof v.expiry === "object" ? { ...v.expiry } : null,
          conc: !!v?.conc,
          targets: Array.isArray(v?.targets) ? v.targets.filter(Boolean) : undefined,
        });
      }
    }

    dlog("extract:spellsRaw", {
      token: it?.name || it?.id,
      type: Array.isArray(raw) ? "array" : typeof raw,
      preview: (() => { try { return JSON.stringify(raw)?.slice(0, 300); } catch { return String(raw); } })()
    });
    return out;
  }

  function readConcKey(it) {
    const conc = it?.metadata?.[META_KEY]?.[CONC_META_KEY];
    if (!conc || typeof conc !== "object") return null;
    const keys = Object.keys(conc);
    return keys.length ? keys[0] : null;
  }

  /**
   * Estrae tutte le assegnazioni:
   *  - concentration → da CONC_META_KEY (displayName = chiave; colorSeed = id se trovato in SPELLS, altrimenti name)
   *  - spells senza concentrazione → da SPELLS_META_KEY (solo entries conc:false)
   *  Per ogni entry senza targets → fallback al token stesso.
   *  Ritorna: Array<{ key:string, targets:string[], colorSeed:string, isConc:boolean }>
   */
  function extractAssignments(it) {
    const res = [];
    const selfId = it?.id;
    const meta = it?.metadata?.[META_KEY] || {};
    const spells = readSpellsList(it);

    // mappa name -> id per ricavare il seed colore coerente con la card
    // --- 1) CONCENTRATION ---
    const concObj = meta?.[CONC_META_KEY];
    if (concObj && typeof concObj === "object") {
      for (const [name, v] of Object.entries(concObj)) {
        if (!v || typeof v !== "object") continue;
        const targets = Array.isArray(v.targets) && v.targets.length ? v.targets.filter(Boolean) : [selfId];
        const colorKey = spellKey(name);   // usa il nome normalizzato
        res.push({
          key: String(name),
          targets,
          colorKey,
          isConc: true,
          instanceId: String(v.instanceId || "").trim() || null,
          turns: null,
        });
      }
    }

    // --- 2) SPELLS (NO CONC) ---
    for (const s of spells) {
    if (!s?.name || s.conc) continue;

    // targets: []  -> significa "nessun target": NON fallback
    // targets: undefined/null -> fallback al token stesso
    let targets;
    if (s.targets === undefined || s.targets === null) {
      targets = [selfId];
    } else {
      targets = Array.isArray(s.targets) ? s.targets.filter(Boolean) : [];
    }
    if (!targets.length) continue; // importante: niente assegnazione => niente label

    const colorKey = spellKey(s.name);
    res.push({
      key: s.name,
      targets,
      colorKey,
      isConc: false,
      instanceId: s.instanceId,
      turns: s.turns,
      expiry: s.expiry,
    });
  }


    // --- dedup su (key normalizzata + targets) ---
    const seen = new Set();
    const out = [];
    for (const a of res) {
      const sig = `${a.key.toLowerCase()}|${a.targets.slice().sort().join(",")}`;
      if (!seen.has(sig)) { seen.add(sig); out.push(a); }
    }

    dlog("extractAssignments", {
      token: it?.name || it?.id,
      metaKeys: Object.keys(meta),
      picked: out.map(x => ({ key: x.key, targets: x.targets, conc: x.isConc }))
    });

    return out;
  }

  // Snapshot normalizzato usato dal renderer unificato. Non legge né modifica la scena.
  export function getSpellWidgetLayoutData(it) {
    return {
      concentrationKey: readConcKey(it),
      spellEntries: readSpellsList(it),
      assignments: extractAssignments(it).map((assignment) => ({
        ...assignment,
        displayName: getSpellDefinition(assignment.key)?.displayName || titleCaseLite(assignment.key),
        color: spellColorFromKey(assignment.colorKey),
      })),
    };
  }

  /** Digest deterministico di tutte le assegnazioni (per gating refresh) */
  function assignmentsDigest(it) {
    const assigns = extractAssignments(it);
    const norm = assigns
      .map(a => ({ k: a.key.toLowerCase(), t: [...a.targets].sort(), r: a.turns, e: a.expiry }))
      .sort((A, B) => A.k.localeCompare(B.k));
    const durations = readSpellsList(it)
      .map((spell) => ({
        i: spell.instanceId || "",
        k: spellKey(spell.name),
        c: spell.casterId || "",
        r: spell.turns,
        e: spell.expiry || null,
      }))
      .sort((A, B) => A.i.localeCompare(B.i) || A.k.localeCompare(B.k));
    return JSON.stringify({ assignments: norm, durations });
  }

  async function hasConcentrationWidgetDrift(tokens, diagnosticsSession = null) {
    const expectedDots = new Set(tokens.filter((token) => !!readConcKey(token)).map((token) => token.id));
    const expectedLabels = new Set();
    for (const caster of tokens) {
      for (const assignment of extractAssignments(caster)) {
        const targets = assignment.targets?.length ? assignment.targets : [caster.id];
        for (const targetId of targets) {
          expectedLabels.add(`${caster.id}|${spellKey(assignment.key)}|${targetId}`);
        }
      }
    }
    const widgets = await __concentrationGetItems(diagnosticsSession, (item) =>
      !!item.metadata?.[CONC_WIDGET_META] && (
        item.name === DOT_BG_NAME || item.name === DOT_TEXT_NAME ||
        item.name === LABEL_BG_NAME
      )
    );
    const validDots = new Map();
    const validLabels = new Map();

    for (const widget of widgets) {
      const ownerId = widget.metadata?.[CONC_WIDGET_META];
      const isDotLabel =
        widget.type === "LABEL" &&
        widget.name === DOT_TEXT_NAME &&
        widget.text?.type === "PLAIN" &&
        widget.text?.plainText === "C";
      if (widget.name === DOT_BG_NAME || widget.name === DOT_TEXT_NAME) {
        if (
          !isDotLabel ||
          !expectedDots.has(ownerId) ||
          widget.metadata?.[CONC_DOT_LAYOUT_KEY] !== CONC_DOT_LAYOUT_VERSION
        ) return true;
        validDots.set(ownerId, (validDots.get(ownerId) || 0) + 1);
        continue;
      }

      const casterId = widget.metadata?.[CONC_WIDGET_CASTER];
      const key = spellKey(widget.metadata?.[CONC_WIDGET_KEY]);
      const signature = `${casterId}|${key}|${ownerId}`;
      if (
        !expectedLabels.has(signature) ||
        widget.type !== "LABEL" ||
        widget.name !== LABEL_BG_NAME ||
        widget.metadata?.[CONC_LABEL_LAYOUT_KEY] !== CONC_LABEL_LAYOUT_VERSION
      ) return true;
      validLabels.set(signature, (validLabels.get(signature) || 0) + 1);
    }

    for (const ownerId of expectedDots) {
      if (validDots.get(ownerId) !== 1) return true;
    }
    for (const signature of expectedLabels) {
      if (validLabels.get(signature) !== 1) return true;
    }
    return false;
  }

/* ===================== UPSERT PALLINO + LABEL ===================== */
/* ===================== UPSERT PALLINO + LABEL ===================== */
async function upsertDotForItem(it, diagnosticsSession = null) {
  const concKey = readConcKey(it);
  const assigns = extractAssignments(it);

  dlog("upsert:token", {
    id: it.id, name: it.name, concKey,
    assigns: assigns.map(a => ({ k:a.key, n:a.targets.length, conc:a.isConc }))
  });

  // ===== Prefetch per ridurre chiamate =====
  // Unica lista di target coinvolti (di default il caster stesso)
  const targetsUnion = new Set();
  for (const a of assigns) {
    const t = (a.targets && a.targets.length) ? a.targets : [it.id];
    for (const tid of t) targetsUnion.add(tid);
  }

  // Il badge deve essere misurato prima che i widget prodotti da questo caster
  // entrino nei bounds del token. La migrazione elimina una sola volta il dot
  // instabile e le label self, che vengono ricreate nello stesso upsert.
  let casterOwned = await __concentrationGetItems(diagnosticsSession,
    (i) => (i.type === "TEXT" || i.type === "SHAPE" || i.type === "LABEL") && (
      i.metadata?.[CONC_WIDGET_META] === it.id ||
      i.metadata?.[CONC_WIDGET_CASTER] === it.id
    )
  );
  let dotLabel = casterOwned.find(x =>
    x.type === "LABEL" && x.name === DOT_TEXT_NAME &&
    x.metadata?.[CONC_DOT_LAYOUT_KEY] === CONC_DOT_LAYOUT_VERSION
  );
  const staleDots = casterOwned.filter(x =>
    (x.name === DOT_BG_NAME || x.name === DOT_TEXT_NAME) && x.id !== dotLabel?.id
  );
  if (concKey && !dotLabel && staleDots.length) {
    const migrationIds = new Set(staleDots.map(x => x.id));
    for (const widget of casterOwned) {
      if (
        widget.name === LABEL_BG_NAME &&
        widget.metadata?.[CONC_WIDGET_CASTER] === it.id &&
        widget.metadata?.[CONC_WIDGET_META] === it.id
      ) migrationIds.add(widget.id);
    }
    await __concentrationDeleteItems(diagnosticsSession, Array.from(migrationIds));
    casterOwned = casterOwned.filter(widget => !migrationIds.has(widget.id));
  }

  // 1) Tutti i widget SPELL (di QUALSIASI caster) per i target coinvolti
  const allSpellWidgetsForTargets = await __concentrationGetItems(diagnosticsSession,
    (i) => (i.type === "TEXT" || i.type === "SHAPE" || i.type === "LABEL") &&
           !!i.metadata?.[CONC_WIDGET_CASTER] &&
           targetsUnion.has(i.metadata?.[CONC_WIDGET_META])
  );

  // indicizzazione per targetId
  const labelsByTarget = new Map(); // tid -> items[]
  for (const w of allSpellWidgetsForTargets) {
    const tid = w.metadata?.[CONC_WIDGET_META];
    if (!labelsByTarget.has(tid)) labelsByTarget.set(tid, []);
    labelsByTarget.get(tid).push(w);
  }

  // 2) Oggetti target (token) in una botta sola
  const targetItemsList = await __concentrationGetItems(diagnosticsSession, i => targetsUnion.has(i.id));
  const tById = new Map(targetItemsList.map(t => [t.id, t]));

  // I bounds reali tengono conto della dimensione/scala visuale del token.
  // Li riutilizziamo per tutte le label del batch, così la dorsale resta
  // costante anche tra token 1x1, 2x2 e superiori.
  const boundsByTarget = new Map();
  await Promise.all(Array.from(targetsUnion, async (tid) => {
    try {
      const bounds = await __concentrationGetItemBounds(diagnosticsSession, [tid]);
      if (bounds) boundsByTarget.set(tid, bounds);
    } catch {}
  }));

  const existingAll = casterOwned.filter(x => x.metadata?.[CONC_WIDGET_CASTER] === it.id);
  const toAdd = [];
  const toDel = [];

  // Mappe update (UNICO updateItems alla fine)
  const shapeUpdate = new Map(); // id -> spec (x,y,w,h,fill,stroke,sw,z,hash,layer?)

  // ===== DOT (solo se c'è concentrazione) =====
  if (!concKey) {
    for (const e of casterOwned) if (e.name === DOT_BG_NAME || e.name === DOT_TEXT_NAME) toDel.push(e.id);
  } else {
    const concAssign = assigns.find(a => a.isConc && a.key === concKey);
    const colorKey   = concAssign?.colorKey ?? spellKey(concKey);
    const col        = spellColorFromKey(colorKey);
    for (const legacyDot of casterOwned.filter(x =>
      (x.name === DOT_BG_NAME || x.name === DOT_TEXT_NAME) &&
      x.id !== dotLabel?.id
    )) toDel.push(legacyDot.id);

    // Cerchio e lettera sono due attachment distinti: una vecchia coppia può
    // avere trasformazioni diverse, oppure uno dei due elementi può mancare.
    // In entrambi i casi li ricreiamo insieme, una sola volta per versione.

    if (!dotLabel) {
      const { cx, cy } = calcDotCenterFor(
        it,
        DOT_DIAMETER,
        DOT_GAP,
        null
      );
      dotLabel = buildLabel()
        .plainText("C")
        .position({ x: cx, y: cy })
        .width(DOT_DIAMETER).height(DOT_DIAMETER)
        .padding(0)
        .fontFamily('"Helvetica Neue", Helvetica, Arial, sans-serif')
        .fontSize(DOT_FONT).fontWeight(700).lineHeight(1)
        .textAlign("CENTER").textAlignVertical("MIDDLE")
        .fillColor("#ffffff").strokeColor("rgba(0,0,0,.85)").strokeWidth(2)
        .backgroundColor(col.solid).backgroundOpacity(1)
        .cornerRadius(DOT_DIAMETER / 2).pointerWidth(0).pointerHeight(0)
        .pointerDirection("DOWN")
        .maxViewScale(WIDGET_MAX_VIEW_SCALE)
        .attachedTo(it.id).layer(LAYER_TEXT)
        .name(DOT_TEXT_NAME)
        .metadata({
          [CONC_WIDGET_META]: it.id,
          [CONC_WIDGET_KEY]: concKey,
          [CONC_DOT_LAYOUT_KEY]: CONC_DOT_LAYOUT_VERSION,
        })
        .build();
      dotLabel.locked = true; dotLabel.disableHit = true; dotLabel.zIndex = Z_DOT_TEXT;
      toAdd.push(dotLabel);
    } else {
      // Non riconciliare stile o dimensioni a ogni refresh: anche un update
      // apparentemente neutro fa riapplicare a OBR la trasformazione attachment.
      const dotNeedsUpdate = dotLabel.metadata?.[CONC_WIDGET_KEY] !== concKey;
      if (dotNeedsUpdate) {
        shapeUpdate.set(dotLabel.id, {
          fill: col.solid,
          fillOpacity: 1,
          key: concKey,
        });
      }
    }

  }

  // ===== LABEL (tutte le assegnazioni) =====
  // pulizia key non più attive
  const activeKeys = new Set(assigns.map(a => spellKey(a.key)));
  for (const e of existingAll) {
    const k = spellKey(e.metadata?.[CONC_WIDGET_KEY] || "");
    if (k && !activeKeys.has(k)) toDel.push(e.id);
  }

  // per ogni assegnazione…
  for (const a of assigns) {
    const keyRaw  = a.key;
    const keyNorm = spellKey(keyRaw);
    const col     = spellColorFromKey(a.colorKey);
    const spellName = getSpellDefinition(keyRaw)?.displayName || titleCaseLite(keyRaw);
    const targets = a.targets && a.targets.length ? a.targets : [it.id];

    // esistenti di questo caster+key
    const existingForKey = existingAll.filter(e => spellKey(e.metadata?.[CONC_WIDGET_KEY]) === keyNorm);

    // elimina target non più valido
    const tset = new Set(targets);
    for (const e of existingForKey) {
      if (!tset.has(e.metadata?.[CONC_WIDGET_META])) toDel.push(e.id);
    }

    for (const tid of targets) {
      const tgt = tById.get(tid);
      if (!tgt) continue;

      const targetSpell = readSpellsList(tgt).find((spell) => {
        if (a.instanceId && spell.instanceId) return spell.instanceId === a.instanceId;
        return spellKey(spell.name) === keyNorm && (!spell.casterId || spell.casterId === it.id);
      });
      const displayedSpell = targetSpell || (
        Number.isFinite(a.turns) || a.expiry ? { turns: a.turns, expiry: a.expiry } : null
      );
      const counter = displayedSpell === null
        ? ""
        : spellExpiryCounter(displayedSpell);
      const spellTitle = counter ? `${spellName} (${counter})` : spellName;

      // Piano stabile SENZA nuove query
      const plan = __spellPlanFromExisting(tid, labelsByTarget.get(tid) || [], assigns, it.id);
      const entrySig = `${keyNorm}|${it.id}`;
      const rowIndex = Math.max(0, plan.indexOf(entrySig));
      const targetBounds = boundsByTarget.get(tid) || null;
      const labelCy  = __rowCYForIndex(tgt, rowIndex, targetBounds);

      // dimensioni/posizione
      const approxW = estimateTextWidthPx(spellTitle, LABEL_FONT);
      const labelW  = Math.min(LABEL_MAX_W, approxW + LABEL_PAD_X * 2);
      const labelH  = LABEL_HEIGHT;
      const targetBox = __visualTokenBox(tgt, targetBounds);
      const labelLeft = targetBox.left + targetBox.diameter * LABEL_OFFSET_X;
      // LABEL usa `position` come punto di ancoraggio del pointer. Ancorando
      // il lato LEFT, tutte le pill condividono la stessa dorsale anche quando
      // Owlbear le mantiene a dimensione costante nello spazio dello schermo.
      const labelCx = Math.round(labelLeft);

      const labelHash = hash32(`${spellTitle}|${labelW}|${LABEL_FONT}|${LABEL_HEIGHT}`);

      for (const legacyBg of existingForKey.filter(x =>
        x.metadata?.[CONC_WIDGET_META] === tid && (
          x.type !== "LABEL" ||
          x.metadata?.[CONC_LABEL_LAYOUT_KEY] !== CONC_LABEL_LAYOUT_VERSION
        )
      )) toDel.push(legacyBg.id);
      const labelBg = existingForKey.find(x =>
        x.type === "LABEL" &&
        x.metadata?.[CONC_WIDGET_META] === tid &&
        x.metadata?.[CONC_LABEL_LAYOUT_KEY] === CONC_LABEL_LAYOUT_VERSION
      );

      // --- BG (SHAPE) ---
      if (!labelBg) {
        const bg = buildLabel()
          .plainText(spellTitle)
          .position({ x: labelCx, y: labelCy })
          .width(labelW).height(labelH)
          .padding(0)
          .fontFamily('"Helvetica Neue", Helvetica, Arial, sans-serif')
          .fontSize(LABEL_FONT).fontWeight(LABEL_FONT_WEIGHT).lineHeight(LABEL_LINE_HEIGHT)
          .textAlign("CENTER").textAlignVertical("MIDDLE")
          .fillColor("#f8fafc").strokeColor("rgba(2,6,23,.55)").strokeWidth(1)
          .backgroundColor(col.solid).backgroundOpacity(col.fillOpacity)
          .cornerRadius(labelH / 2).pointerWidth(0).pointerHeight(0)
          .pointerDirection("LEFT")
          .maxViewScale(WIDGET_MAX_VIEW_SCALE)
          .attachedTo(tid).layer(LAYER_BG)
          .name(LABEL_BG_NAME)
          .metadata({
            [CONC_WIDGET_META]: tid,
            [CONC_WIDGET_KEY]: keyNorm,
            [CONC_WIDGET_CASTER]: it.id,
            [CONC_LABEL_HASHKEY]: labelHash,
            [CONC_LABEL_LAYOUT_KEY]: CONC_LABEL_LAYOUT_VERSION,
          })
          .build();
        bg.locked = true; bg.disableHit = true; bg.zIndex = Z_LABEL_BG;
        toAdd.push(bg);
      } else {
        const moveShape = Math.abs((labelBg.position?.x ?? 0) - labelCx) > 0.5 ||
                          Math.abs((labelBg.position?.y ?? 0) - labelCy) > 0.5;
        const needSizeColor = labelBg.style?.backgroundColor !== col.solid ||
                              labelBg.style?.backgroundOpacity !== col.fillOpacity ||
                              labelBg.style?.maxViewScale !== WIDGET_MAX_VIEW_SCALE ||
                              labelBg.style?.pointerDirection !== "LEFT" ||
                              labelBg.text?.plainText !== spellTitle ||
                              labelBg.text?.style?.padding !== 0 ||
                              labelBg.text?.style?.lineHeight !== LABEL_LINE_HEIGHT ||
                              labelBg.text?.width !== labelW || labelBg.text?.height !== labelH ||
                              labelBg.metadata?.[CONC_LABEL_HASHKEY] !== labelHash;

        if (moveShape || needSizeColor) {
          shapeUpdate.set(labelBg.id, {
            x: labelCx, y: labelCy,
            w: labelW, h: labelH,
            fill: col.solid, fillOpacity: col.fillOpacity,
            text: spellTitle, fontSize: LABEL_FONT, fontWeight: LABEL_FONT_WEIGHT,
            z: Z_LABEL_BG, hash: labelHash,
            layer: LAYER_BG, radius: labelH / 2, maxViewScale: WIDGET_MAX_VIEW_SCALE
          });
        } else if (labelBg.layer !== LAYER_BG || labelBg.zIndex !== Z_LABEL_BG) {
          shapeUpdate.set(labelBg.id, { z: Z_LABEL_BG, layer: LAYER_BG });
        }
      }

    }
  }

  // === Applica cambiamenti ===
  if (toDel.length) { dlog("del", toDel.length); await __concentrationDeleteItems(diagnosticsSession, toDel); }
  if (toAdd.length)  { dlog("add", toAdd.map(x => x.name)); await __concentrationAddItems(diagnosticsSession, toAdd); }

  // Aggiorna soltanto i LABEL che hanno davvero bisogno di riconciliazione.
  const idsToUpd = Array.from(shapeUpdate.keys());
  if (idsToUpd.length) {
    dlog("upd:mixed", idsToUpd.length);
    await __concentrationUpdateItems(diagnosticsSession, idsToUpd, (draft) => {
      for (const itx of draft) {
        itx.locked = true;
        itx.disableHit = true;
        if (itx.type === "SHAPE") {
          const spec = shapeUpdate.get(itx.id);
          if (!spec) continue;

          if (spec.layer == null) spec.layer = LAYER_BG;

          itx.style = itx.style || {};
          if (spec.fill != null)   itx.style.fillColor   = spec.fill;
          if (spec.fillOpacity != null) itx.style.fillOpacity = spec.fillOpacity;
          if (spec.stroke != null) itx.style.strokeColor = spec.stroke;
          if (spec.sw != null)     itx.style.strokeWidth = spec.sw;

          if (spec.w != null) itx.width  = spec.w;
          if (spec.h != null) itx.height = spec.h;
          if (spec.radius != null && "cornerRadius" in itx) itx.cornerRadius = spec.radius;
          if (spec.z != null) itx.zIndex = spec.z;
          if (itx.layer !== spec.layer) itx.layer = spec.layer;

          if (spec.x != null && spec.y != null) itx.position = { x: Math.round(spec.x), y: Math.round(spec.y) };
          if (spec.hash) itx.metadata = { ...(itx.metadata || {}), [CONC_LABEL_HASHKEY]: spec.hash };
        } else if (itx.type === "LABEL") {
          const spec = shapeUpdate.get(itx.id);
          if (!spec) continue;
          const isDotLabel = itx.name === DOT_TEXT_NAME;

          itx.style = itx.style || {};
          if (spec.fill != null) itx.style.backgroundColor = spec.fill;
          if (spec.fillOpacity != null) itx.style.backgroundOpacity = spec.fillOpacity;
          if (spec.radius != null) itx.style.cornerRadius = spec.radius;
          if (spec.maxViewScale != null) itx.style.maxViewScale = spec.maxViewScale;
          itx.style.pointerWidth = 0;
          itx.style.pointerHeight = 0;
          itx.style.pointerDirection = isDotLabel ? "DOWN" : "LEFT";
          itx.text = itx.text || {};
          itx.text.type = "PLAIN";
          if (spec.text != null) itx.text.plainText = spec.text;
          itx.text.style = itx.text.style || {};
          itx.text.style.padding = 0;
          itx.text.style.fontFamily = '"Helvetica Neue", Helvetica, Arial, sans-serif';
          itx.text.style.fontSize = spec.fontSize ?? (isDotLabel ? DOT_FONT : LABEL_FONT);
          itx.text.style.fontWeight = spec.fontWeight ?? (isDotLabel ? 700 : LABEL_FONT_WEIGHT);
          itx.text.style.lineHeight = isDotLabel ? 1 : LABEL_LINE_HEIGHT;
          itx.text.style.textAlign = "CENTER";
          itx.text.style.textAlignVertical = "MIDDLE";
          itx.text.style.fillColor = "#f8fafc";
          itx.text.style.fillOpacity = 1;
          itx.text.style.strokeColor = isDotLabel ? "rgba(0,0,0,.85)" : "rgba(2,6,23,.55)";
          itx.text.style.strokeWidth = isDotLabel ? 2 : 1;
          if (spec.w != null) itx.text.width = spec.w;
          if (spec.h != null) itx.text.height = spec.h;
          if (spec.z != null) itx.zIndex = spec.z;
          if (spec.layer != null && itx.layer !== spec.layer) itx.layer = spec.layer;
          if (spec.x != null && spec.y != null) {
            itx.position = { x: Math.round(spec.x), y: Math.round(spec.y) };
          }
          if (spec.hash) {
            itx.metadata = { ...(itx.metadata || {}), [CONC_LABEL_HASHKEY]: spec.hash };
          }
          if (spec.key) {
            itx.metadata = { ...(itx.metadata || {}), [CONC_WIDGET_KEY]: spec.key };
          }
        }
      }
    });
  }
}

  /* ===================== RACE/DEBOUNCE & SNAPSHOT ===================== */
  const __CONC_UPSERT_LOCK = new Set();
  let __CONC_RECONCILE_REVISION = 0;
  let __concentrationWidgetReconcileRequest = null;
  let __debounceTimer = null;
  const __assignSnapshot = new Map(); // tokenId -> digest di tutte le assegnazioni

  export function configureConcentrationWidgetWriter(requester = null) {
    __concentrationWidgetReconcileRequest = typeof requester === "function" ? requester : null;
  }

  function __scheduleRefresh() {
    if (__debounceTimer) return;
    __debounceTimer = setTimeout(async () => {
      __debounceTimer = null;
      try {
        await refreshConcentrationDots();
      } catch (e) {
        dlog("debounced:refresh-error", e);
        // Se è un RateLimit, prova un retry singolo dopo un piccolo backoff
        const msg = String(e?.message || e?.name || "");
        if (/rate|too many/i.test(msg)) {
          setTimeout(() => {
            refreshConcentrationDots().catch(err => dlog("retry:refresh-error", err));
          }, 180);
        }
      }
    }, 140); // debounce più alto per ridurre burst di onChange
  }

  /* ===================== REFRESH GLOBALE ===================== */
  export async function refreshConcentrationDots(itemIds) {
    if (!__concentrationWidgetReconcileRequest) {
      effectsDiagnostics.event("reconcile:ignored-non-writer", {
        engine: "concentration",
        requestedTokens: Array.isArray(itemIds) ? itemIds.filter(Boolean).length : 0,
      });
      return { outcome: "ignored-non-writer", affectedTargetIds: [] };
    }
    return __concentrationWidgetReconcileRequest(itemIds);
  }

  export async function reconcileConcentrationDots(itemIds) {
    const revision = ++__CONC_RECONCILE_REVISION;
    const requestedIds = [...new Set(Array.isArray(itemIds) ? itemIds.filter(Boolean) : [])];
    const targeted = requestedIds.length > 0;
    const diagnosticsSession = effectsDiagnostics.beginReconcile("concentration", {
      revision,
      targeted,
      requestedTokens: requestedIds.length,
    });
    let tokens = [];
    let linkedWidgets = [];
    let castersWithAssignments = 0;
    let castersWithoutAssignments = 0;
    let processedCasters = 0;
    let skippedLockedCasters = 0;
    let driftChecked = false;
    let snapshotUpdated = false;
    let outcome = "completed";
    const affectedTargetIds = new Set();

    dlog("refresh:begin");

    try {
    if (targeted) {
      const requestedSet = new Set(requestedIds);
      const seedTokens = await __concentrationGetItems(diagnosticsSession,
        (item) => requestedSet.has(item.id) && !!item.metadata?.[META_KEY]
      );
      const relatedTargets = new Set(requestedIds);
      const candidateCasterIds = new Set(requestedIds);

      for (const token of seedTokens) {
        for (const spell of readSpellsList(token)) {
          if (spell.casterId) candidateCasterIds.add(spell.casterId);
        }
        for (const assignment of extractAssignments(token)) {
          const targets = assignment.targets?.length ? assignment.targets : [token.id];
          for (const targetId of targets) relatedTargets.add(targetId);
        }
      }

      linkedWidgets = await __concentrationGetItems(diagnosticsSession,
        (item) => (item.type === "TEXT" || item.type === "SHAPE" || item.type === "LABEL") && (
          relatedTargets.has(item.metadata?.[CONC_WIDGET_META]) ||
          candidateCasterIds.has(item.metadata?.[CONC_WIDGET_CASTER])
        )
      );
      for (const widget of linkedWidgets) {
        const targetId = widget.metadata?.[CONC_WIDGET_META];
        const casterId = widget.metadata?.[CONC_WIDGET_CASTER];
        if (targetId && casterId) affectedTargetIds.add(targetId);
        if (casterId) candidateCasterIds.add(casterId);
      }

      const candidateIds = new Set([...requestedIds, ...candidateCasterIds]);
      const extraIds = new Set([...candidateIds].filter((id) => !requestedSet.has(id)));
      const extraTokens = extraIds.size
        ? await __concentrationGetItems(diagnosticsSession,
          (item) => extraIds.has(item.id) && !!item.metadata?.[META_KEY]
        )
        : [];
      const byId = new Map([...seedTokens, ...extraTokens].map((item) => [item.id, item]));
      tokens = [...byId.values()];
    } else {
      tokens = await __concentrationGetItems(diagnosticsSession, i => !!i.metadata?.[META_KEY]);
    }
    dlog("refresh:scan-count", tokens.length);

    if (revision !== __CONC_RECONCILE_REVISION) {
      effectsDiagnostics.revisionStale(diagnosticsSession, {
        stage: "after-token-scan",
        latestRevision: __CONC_RECONCILE_REVISION,
      });
    }

    let anyChanged = false;
    const currentIds = new Set(tokens.map(t => t.id));
    const staleLinkedIds = targeted
      ? linkedWidgets.filter((widget) => {
        const targetId = widget.metadata?.[CONC_WIDGET_META];
        const casterId = widget.metadata?.[CONC_WIDGET_CASTER];
        return (targetId && requestedIds.includes(targetId) && !currentIds.has(targetId)) ||
          (casterId && requestedIds.includes(casterId) && !currentIds.has(casterId));
      }).map((widget) => widget.id)
      : [];
    if (staleLinkedIds.length) anyChanged = true;
    const snapshotIdsToCheck = targeted ? requestedIds : [...__assignSnapshot.keys()];
    for (const oldId of snapshotIdsToCheck) {
      if (__assignSnapshot.has(oldId) && !currentIds.has(oldId)) { anyChanged = true; break; }
    }
    if (!anyChanged) {
      for (const t of tokens) {
        const dig = assignmentsDigest(t);
        if (__assignSnapshot.get(t.id) !== dig) { anyChanged = true; break; }
      }
    }
    if (!targeted && !anyChanged && __assignSnapshot.size) {
      driftChecked = true;
      anyChanged = await hasConcentrationWidgetDrift(tokens, diagnosticsSession);
    }
    if (!anyChanged && __assignSnapshot.size) {
      outcome = "no-change";
      dlog("refresh:skip(no-change)");
      return { outcome, affectedTargetIds: [...affectedTargetIds] };
    }

    if (staleLinkedIds.length) {
      const staleSet = new Set(staleLinkedIds);
      await __concentrationDeleteItems(diagnosticsSession, [...staleSet]);
      linkedWidgets = linkedWidgets.filter((widget) => !staleSet.has(widget.id));
    }

    const should = new Set();

    for (const it of tokens) {
      const assigns = extractAssignments(it);
      if (!assigns.length) {
        castersWithoutAssignments += 1;
        // SAFE: pulisco solo ciò che dipende da questo token come CASTER
        // (label con CONC_WIDGET_CASTER === it.id) oppure il DOT attaccato al token.
        const mine = await __concentrationGetItems(diagnosticsSession,
          (i) => (i.type === "TEXT" || i.type === "SHAPE" || i.type === "LABEL") && (
            // label generate da questo token come caster
            i.metadata?.[CONC_WIDGET_CASTER] === it.id ||
            // dot di concentrazione attaccato a questo token
            (i.metadata?.[CONC_WIDGET_META] === it.id && (i.name === DOT_BG_NAME || i.name === DOT_TEXT_NAME))
          )
        );
        for (const widget of mine) {
          const targetId = widget.metadata?.[CONC_WIDGET_META];
          if (targetId && widget.metadata?.[CONC_WIDGET_CASTER]) {
            affectedTargetIds.add(targetId);
          }
        }
        if (mine.length) {
          dlog("cleanup(token-safe)", it.name, mine.length);
          await __concentrationDeleteItems(diagnosticsSession, mine.map(m => m.id));
        }
        continue;
      }

      castersWithAssignments += 1;

      // owner validi
      should.add(it.id);
      for (const a of assigns) {
        for (const tid of (a.targets?.length ? a.targets : [it.id])) {
          should.add(tid);
          affectedTargetIds.add(tid);
        }
      }

      if (__CONC_UPSERT_LOCK.has(it.id)) {
        skippedLockedCasters += 1;
        effectsDiagnostics.lockSkipped(diagnosticsSession, { tokenId: it.id });
        continue;
      }
      __CONC_UPSERT_LOCK.add(it.id);
      try {
        await upsertDotForItem(it, diagnosticsSession);
        processedCasters += 1;
      }
      finally { __CONC_UPSERT_LOCK.delete(it.id); }
    }

    // ---- Aggiorna lo snapshot per bloccare loop su onChange dei nostri widget
    try {
      if (!targeted) __assignSnapshot.clear();
      else {
        for (const id of requestedIds) {
          if (!currentIds.has(id)) __assignSnapshot.delete(id);
        }
      }
      for (const t of tokens) {
        __assignSnapshot.set(t.id, assignmentsDigest(t));
      }
      snapshotUpdated = true;
    } catch {}

    // === Cleanup più sicuro: non cancellare label appena create se almeno caster O target sono "attesi"
    const allWidgets = targeted ? linkedWidgets : await __concentrationGetItems(diagnosticsSession,
      (i) => (i.type === "TEXT" || i.type === "SHAPE" || i.type === "LABEL") && (i.metadata?.[CONC_WIDGET_META] || i.metadata?.[CONC_WIDGET_CASTER])
    );

    const toRemove = [];
    for (const w of allWidgets) {
      const metaTarget = w.metadata?.[CONC_WIDGET_META];      // per DOT = casterId, per LABEL = targetId
      const metaCaster = w.metadata?.[CONC_WIDGET_CASTER] || null;

      if (targeted) {
        const targetRemoved = metaTarget && requestedIds.includes(metaTarget) && !currentIds.has(metaTarget);
        const casterRemoved = metaCaster && requestedIds.includes(metaCaster) && !currentIds.has(metaCaster);
        if (targetRemoved || casterRemoved) toRemove.push(w.id);
        continue;
      }

      // Regola:
      // - Se è un DOT (non ha caster), deve esistere l'owner (caster) in "should".
      // - Se è una LABEL (ha caster), la teniamo se almeno UNO tra target o caster è in "should".
      //   Questo evita che un micro-gap negli update faccia sparire label appena generate.
      if (metaCaster) {
        const keep = (metaTarget && should.has(metaTarget)) || (metaCaster && should.has(metaCaster));
        if (!keep) toRemove.push(w.id);
      } else {
        // DOT
        const keep = metaTarget && should.has(metaTarget);
        if (!keep) toRemove.push(w.id);
      }
    }

    if (toRemove.length) {
      dlog("cleanup:orphans(safe)", toRemove.length);
      await __concentrationDeleteItems(diagnosticsSession, [...new Set(toRemove)]);
    }
    } catch (error) {
      outcome = "failed";
      throw error;
    } finally {
      if (revision !== __CONC_RECONCILE_REVISION) {
        effectsDiagnostics.revisionStale(diagnosticsSession, {
          stage: "complete",
          latestRevision: __CONC_RECONCILE_REVISION,
        });
      }
      effectsDiagnostics.finishReconcile(diagnosticsSession, {
        outcome,
        scannedTokens: tokens.length,
        castersWithAssignments,
        castersWithoutAssignments,
        processedCasters,
        skippedLockedCasters,
        driftChecked,
        snapshotUpdated,
        snapshotUpdatedAfterLockSkip: snapshotUpdated && skippedLockedCasters > 0,
      });
    }
    return { outcome, affectedTargetIds: [...affectedTargetIds] };
  }

  /* ================ WATCHER LEGACY (NO-OP) ================ */
  export function mountConcentrationWatcher() {
    return false;
  }
