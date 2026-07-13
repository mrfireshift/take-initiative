  // src/spells-tag.js
  import OBR, { buildText, buildShape } from "@owlbear-rodeo/sdk";
  import { ID } from "./contextMenu";
  import { isOnlyActiveTurnLabelChange } from "./constants.js";

  /* ===================== DEBUG ===================== */
  const DEBUG_CONC = true;
  // log anche su console.log per evitare filtri sui debug
  const dlog = (...a) => { if (DEBUG_CONC) console.debug("[conc]", ...a); };
  console.log("[conc] module loaded");

  /* ===================== METADATA KEYS ===================== */
  const META_KEY           = `${ID}/meta`;

  const SPELLS_META_KEY    = `${ID}/spells`;
  const CONC_META_KEY      = `${ID}/concentration`;
  const CONC_WIDGET_META   = `${ID}/concWidgetOf`;     // owner: caster (dot) o target (label)
  const CONC_WIDGET_KEY    = `${ID}/concWidgetKey`;    // spell key
  const CONC_WIDGET_CASTER = `${ID}/concWidgetCaster`; // caster id (per label)
  const CONC_LABEL_HASHKEY = `${ID}/concLabelHash`;    // hash label (testo+dimensioni)

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
  const DOT_DIAMETER = 40;
  const DOT_GAP      = 1;
  const DOT_FONT     = 24;
  const Z_DOT_BG     = 100020;
  const Z_DOT_TEXT   = 100021;

  /* ===================== STILE: LABEL ===================== */
  // Dimensioni/padding
  const LABEL_FONT    = 16;
  const LABEL_PAD_X   = 12;
  const LABEL_HEIGHT  = 26;
  const LABEL_MAX_W   = 180;

  // === Stack condiviso (spells + condizioni) ===
  const STACK_GAP = 2;                  // spazio verticale tra righe
  const COND_META_WIDGET_OF = `${ID}/condWidgetOf`;   // mirror da conditions.js
  const COND_META_WIDGET_KEY = `${ID}/condWidgetKey`; // mirror da conditions.js
  const COND_STACK_FALLBACK_H = 24;     // se non trovo l'altezza shape condizione

  // === Anchor della colonna ===
  // "bottom" | "top" | "center"
  const STACK_ANCHOR = "top";     // cambia qui per ancorare la colonna
  const STACK_DIR    = 1;            // 1 = cresce verso il basso; -1 = verso l'alto
  const STACK_BASE_GAP = 48;          // distanza dal token quando anchor top/bottom (usa LABEL_GAP)
  const STACK_CENTER_OFFSET = 0;     // offset extra per anchor "center"

  function stackBaseY(targetItem) {
    const h = Number(targetItem.height) || 70;
    if (STACK_ANCHOR === "top")    return targetItem.position.y - h / 2 - STACK_BASE_GAP;
    if (STACK_ANCHOR === "center") return targetItem.position.y + STACK_CENTER_OFFSET;
    // default "bottom"
    return targetItem.position.y + h / 2 + STACK_BASE_GAP;
  }

  // === Calcola la Y (centro) della riga in base all'indice (0-based), senza leggere la scena ===
  // Usa la stessa metrica della colonna: LABEL_HEIGHT, STACK_GAP, STACK_DIR e LABEL_OFFSET_Y.
  function __rowCYForIndex(targetItem, idx) {
    const baseY = stackBaseY(targetItem);
    const step  = LABEL_HEIGHT + STACK_GAP;           // distanza centro-centro tra righe
    // Prima riga (idx = 0) è a metà LABEL_HEIGHT dal baseY, poi si aggiunge step * idx
    const cy = baseY + STACK_DIR * (idx * step + LABEL_HEIGHT / 2);
    return Math.round(cy + LABEL_OFFSET_Y);
}

  // Distanza dal bordo superiore del token (usata per il calcolo box width/centro X)
  const LABEL_GAP     = 6;

  // Offset globali rispetto al token (positivi: destra/giù)
  const LABEL_OFFSET_X = 0;
  const LABEL_OFFSET_Y = -1;

  // micro offset testo (normalmente 0, lasciamo per eventuali fine-tuning)
  const LABEL_TEXT_DX = 0;
  const LABEL_TEXT_DY = 0;

    // === Layer target per BG (shape) e TEXT delle label ===
  const LAYER_BG   = "TEXT";
  const LAYER_TEXT = "TEXT";

  // z-index: testo sopra qualsiasi BG (margine ampio)
  const Z_LABEL_BG   = 220000;    // era 100018
  const Z_LABEL_TEXT = 230000;    // era 100022

  const DOT_BG_NAME     = "Concentrazione (bg)";
  const DOT_TEXT_NAME   = "Concentrazione (C)";
  const LABEL_BG_NAME   = "Concentrazione (label bg)";
  const LABEL_TEXT_NAME = "Concentrazione (label)";

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
    return { solid: `hsl(${hue}, 70%, 45%)` };
  }

  /* ===================== UTIL ===================== */
  function titleCaseLite(s) { return String(s || "").replace(/\S+/g, w => w[0]?.toUpperCase() + w.slice(1)); }
  function estimateTextWidthPx(text, fontPx = LABEL_FONT) { return Math.ceil(String(text||"").length * fontPx * 0.58); }
  function hash32(str) { let h = 0x811c9dc5; for (let i=0;i<str.length;i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h>>>0).toString(16); }

  /* ===== Centro pallino ===== */
  function calcDotCenterFor(it, d = DOT_DIAMETER, gap = DOT_GAP) {
    const w = Number(it.width)  || 70;
    const h = Number(it.height) || 70;
    const left = it.position.x - w / 2;
    const top  = it.position.y - h / 2;
    return { cx: left - gap - d / 2, cy: top - gap - d / 2 };
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
      (i) => (i.type === "TEXT" || i.type === "SHAPE")
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
      const h = it.type === "SHAPE" ? (Number(it.height) || LABEL_HEIGHT) : null;
      if (!spellRows.has(sig)) spellRows.set(sig, h || LABEL_HEIGHT);
      else if (h) spellRows.set(sig, h);
    }

    // 2) COND presenti (per l'altezza basta lo SHAPE bg)
    const condShapes = await OBR.scene.items.getItems(
      (i) => i.type === "SHAPE" && i.metadata?.[COND_META_WIDGET_OF] === tid
    );
    const condRows = new Map();
    for (const sh of condShapes) {
      const key = sh.metadata?.[COND_META_WIDGET_KEY];
      if (!key) continue;
      condRows.set(String(key), Number(sh.height) || COND_STACK_FALLBACK_H);
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
      const h = Number(entries[i].h) || LABEL_HEIGHT;
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
    return Math.round(baseY + STACK_DIR * (LABEL_HEIGHT / 2) + LABEL_OFFSET_Y);
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
    const nameToId = new Map(spells.map(s => [s.name?.toLowerCase(), s.id || ""]));

    // --- 1) CONCENTRATION ---
    const concObj = meta?.[CONC_META_KEY];
    if (concObj && typeof concObj === "object") {
      for (const [name, v] of Object.entries(concObj)) {
        if (!v || typeof v !== "object") continue;
        const targets = Array.isArray(v.targets) && v.targets.length ? v.targets.filter(Boolean) : [selfId];
        const colorKey = spellKey(name);   // usa il nome normalizzato
        res.push({ key: String(name), targets, colorKey, isConc: true });
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
    res.push({ key: s.name, targets, colorKey, isConc: false });
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

  /** Digest deterministico di tutte le assegnazioni (per gating refresh) */
  function assignmentsDigest(it) {
    const assigns = extractAssignments(it);
    if (!assigns.length) return "";
    const norm = assigns
      .map(a => ({ k: a.key.toLowerCase(), t: [...a.targets].sort() }))
      .sort((A, B) => A.k.localeCompare(B.k));
    return JSON.stringify(norm);
  }

/* ===================== UPSERT PALLINO + LABEL ===================== */
/* ===================== UPSERT PALLINO + LABEL ===================== */
async function upsertDotForItem(it) {
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

  // 1) Tutti i widget SPELL (di QUALSIASI caster) per i target coinvolti
  const allSpellWidgetsForTargets = await OBR.scene.items.getItems(
    (i) => (i.type === "TEXT" || i.type === "SHAPE") &&
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
  const targetItemsList = await OBR.scene.items.getItems(i => targetsUnion.has(i.id));
  const tById = new Map(targetItemsList.map(t => [t.id, t]));

  // 3) Widget di questo caster (dot + sue label)
  const casterOwned = await OBR.scene.items.getItems(
    (i) => (i.type === "TEXT" || i.type === "SHAPE") && (
      i.metadata?.[CONC_WIDGET_META] === it.id ||               // dot e/o testo dot
      i.metadata?.[CONC_WIDGET_CASTER] === it.id                // label create da questo caster
    )
  );

  const existingAll = casterOwned.filter(x => x.metadata?.[CONC_WIDGET_CASTER] === it.id);
  const toAdd = [];
  const toDel = [];

  // Mappe update (UNICO updateItems alla fine)
  const shapeUpdate = new Map(); // id -> spec (x,y,w,h,fill,stroke,sw,z,hash,layer?)
  const textUpdate  = new Map(); // id -> spec (x,y,w,h,z)

  // ===== DOT (solo se c'è concentrazione) =====
  if (!concKey) {
    for (const e of casterOwned) if (e.name === DOT_BG_NAME || e.name === DOT_TEXT_NAME) toDel.push(e.id);
  } else {
    const concAssign = assigns.find(a => a.isConc && a.key === concKey);
    const colorKey   = concAssign?.colorKey ?? spellKey(concKey);
    const col        = spellColorFromKey(colorKey);
    const { cx, cy } = calcDotCenterFor(it, DOT_DIAMETER, DOT_GAP);
    const tx = cx - DOT_DIAMETER / 2;
    const ty = cy - DOT_DIAMETER / 2;

    let dotShape = casterOwned.find(x => x.type === "SHAPE" && x.name === DOT_BG_NAME);
    let dotText  = casterOwned.find(x => x.type === "TEXT"  && x.name === DOT_TEXT_NAME);

    if (!dotShape) {
      dotShape = buildShape()
        .shapeType("CIRCLE")
        .position({ x: cx, y: cy })
        .width(DOT_DIAMETER).height(DOT_DIAMETER)
        .fillColor(col.solid).strokeColor("rgba(0,0,0,1)").strokeWidth(2)
        .attachedTo(it.id).layer(LAYER_TEXT)
        .name(DOT_BG_NAME)
        .metadata({ [CONC_WIDGET_META]: it.id, [CONC_WIDGET_KEY]: concKey })
        .build();
      dotShape.locked = true; dotShape.disableHit = true; dotShape.zIndex = Z_DOT_BG;
      toAdd.push(dotShape);
    } else {
      const need = dotShape.style?.fillColor !== col.solid || dotShape.width !== DOT_DIAMETER || dotShape.height !== DOT_DIAMETER;
      if (need) shapeUpdate.set(dotShape.id, {
        w: DOT_DIAMETER, h: DOT_DIAMETER,
        fill: col.solid, stroke: "rgba(0,0,0,1)", sw: 2,
        z: Z_DOT_BG, layer: LAYER_TEXT
      });
    }

    if (!dotText) {
      const txt = buildText()
        .position({ x: tx, y: ty }).width(DOT_DIAMETER).height(DOT_DIAMETER)
        .plainText("C").textType("PLAIN").fontSize(DOT_FONT)
        .textAlign("CENTER").textAlignVertical("MIDDLE")
        .fillColor("#ffffff").strokeColor("rgba(0,0,0,.85)").strokeWidth(2)
        .attachedTo(it.id).layer(LAYER_TEXT).name(DOT_TEXT_NAME)
        .metadata({ [CONC_WIDGET_META]: it.id, [CONC_WIDGET_KEY]: concKey })
        .build();
      txt.locked = true; txt.disableHit = true; txt.zIndex = Z_DOT_TEXT;
      toAdd.push(txt);
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
    const spellTitle = titleCaseLite(keyRaw);
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

      // Piano stabile SENZA nuove query
      const plan = __spellPlanFromExisting(tid, labelsByTarget.get(tid) || [], assigns, it.id);
      const entrySig = `${keyNorm}|${it.id}`;
      const rowIndex = Math.max(0, plan.indexOf(entrySig));
      const labelCy  = __rowCYForIndex(tgt, rowIndex);

      // dimensioni/posizione
      const approxW = estimateTextWidthPx(spellTitle, LABEL_FONT);
      const labelW  = Math.min(LABEL_MAX_W, approxW + LABEL_PAD_X * 2);
      const labelH  = LABEL_HEIGHT;
      const labelCx = Math.round(tgt.position.x + LABEL_OFFSET_X);

      const labelHash = hash32(`${spellTitle}|${labelW}|${LABEL_FONT}|${LABEL_HEIGHT}`);

      const labelBg  = existingForKey.find(x => x.type === "SHAPE" && x.metadata?.[CONC_WIDGET_META] === tid);
      const labelTxt = existingForKey.find(x => x.type === "TEXT"  && x.metadata?.[CONC_WIDGET_META] === tid);

      // --- BG (SHAPE) ---
      if (!labelBg) {
        const bg = buildShape()
          .shapeType("RECTANGLE")
          .position({ x: labelCx, y: labelCy })
          .width(labelW).height(labelH)
          .fillColor(col.solid).strokeColor("rgba(0,0,0,1)").strokeWidth(1)
          .attachedTo(tid).layer(LAYER_BG)
          .name(LABEL_BG_NAME)
          .metadata({
            [CONC_WIDGET_META]: tid,
            [CONC_WIDGET_KEY]: keyNorm,
            [CONC_WIDGET_CASTER]: it.id,
            [CONC_LABEL_HASHKEY]: labelHash
          })
          .build();
        bg.locked = true; bg.disableHit = true; bg.zIndex = Z_LABEL_BG;
        toAdd.push(bg);
      } else {
        const moveShape = Math.abs((labelBg.position?.x ?? 0) - labelCx) > 0.5 ||
                          Math.abs((labelBg.position?.y ?? 0) - labelCy) > 0.5;
        const needSizeColor = labelBg.style?.fillColor !== col.solid ||
                              labelBg.width !== labelW || labelBg.height !== labelH ||
                              labelBg.metadata?.[CONC_LABEL_HASHKEY] !== labelHash;

        if (moveShape || needSizeColor) {
          shapeUpdate.set(labelBg.id, {
            x: labelCx, y: labelCy,
            w: labelW, h: labelH,
            fill: col.solid, stroke: "rgba(0,0,0,1)", sw: 1,
            z: Z_LABEL_BG, hash: labelHash,
            layer: LAYER_BG
          });
        } else if (labelBg.layer !== LAYER_BG || labelBg.zIndex !== Z_LABEL_BG) {
          shapeUpdate.set(labelBg.id, { z: Z_LABEL_BG, layer: LAYER_BG });
        }
      }

      // --- TEXT ---
      if (!labelTxt) {
        const txt = buildText()
          .position({ x: labelCx + LABEL_TEXT_DX, y: labelCy + LABEL_TEXT_DY })
          .width(labelW).height(labelH)
          .plainText(spellTitle).textType("PLAIN").fontSize(LABEL_FONT)
          .textAlign("CENTER").textAlignVertical("MIDDLE")
          .fillColor("#ffffff").strokeColor("rgba(0,0,0,.7)").strokeWidth(1)
          .attachedTo(tid).layer(LAYER_TEXT).name(LABEL_TEXT_NAME)
          .metadata({
            [CONC_WIDGET_META]: tid,
            [CONC_WIDGET_KEY]: keyNorm,
            [CONC_WIDGET_CASTER]: it.id,
            [CONC_LABEL_HASHKEY]: labelHash
          })
          .build();
        txt.locked = true; txt.disableHit = true; txt.zIndex = Z_LABEL_TEXT;
        toAdd.push(txt);
      } else if (labelTxt.metadata?.[CONC_LABEL_HASHKEY] !== labelHash) {
        toDel.push(labelTxt.id);
        const txt = buildText()
          .position({ x: labelCx + LABEL_TEXT_DX, y: labelCy + LABEL_TEXT_DY })
          .width(labelW).height(labelH)
          .plainText(spellTitle).textType("PLAIN").fontSize(LABEL_FONT)
          .textAlign("CENTER").textAlignVertical("MIDDLE")
          .fillColor("#ffffff").strokeColor("rgba(0,0,0,.7)").strokeWidth(1)
          .attachedTo(tid).layer(LAYER_TEXT).name(LABEL_TEXT_NAME)
          .metadata({
            [CONC_WIDGET_META]: tid,
            [CONC_WIDGET_KEY]: keyNorm,
            [CONC_WIDGET_CASTER]: it.id,
            [CONC_LABEL_HASHKEY]: labelHash
          })
          .build();
        txt.locked = true; txt.disableHit = true; txt.zIndex = Z_LABEL_TEXT;
        toAdd.push(txt);
      } else {
        textUpdate.set(labelTxt.id, {
          x: labelCx + LABEL_TEXT_DX,
          y: labelCy + LABEL_TEXT_DY,
          w: labelW, h: labelH, z: Z_LABEL_TEXT
        });
      }
    }
  }

  // === Applica cambiamenti ===
  if (toDel.length) { dlog("del", toDel.length); await OBR.scene.items.deleteItems(toDel); }
  if (toAdd.length)  { dlog("add", toAdd.map(x => x.name)); await OBR.scene.items.addItems(toAdd); }

  // UNICO updateItems per SHAPE e TEXT
  const idsToUpd = [...shapeUpdate.keys(), ...textUpdate.keys()];
  if (idsToUpd.length) {
    dlog("upd:mixed", idsToUpd.length);
    await OBR.scene.items.updateItems(idsToUpd, (draft) => {
      for (const itx of draft) {
        if (itx.type === "SHAPE") {
          const spec = shapeUpdate.get(itx.id);
          if (!spec) continue;

          if (spec.layer == null) spec.layer = LAYER_BG;

          itx.style = itx.style || {};
          if (spec.fill != null)   itx.style.fillColor   = spec.fill;
          if (spec.stroke != null) itx.style.strokeColor = spec.stroke;
          if (spec.sw != null)     itx.style.strokeWidth = spec.sw;

          if (spec.w != null) itx.width  = spec.w;
          if (spec.h != null) itx.height = spec.h;
          if (spec.z != null) itx.zIndex = spec.z;
          if (itx.layer !== spec.layer) itx.layer = spec.layer;

          if (spec.x != null && spec.y != null) itx.position = { x: Math.round(spec.x), y: Math.round(spec.y) };
          if (spec.hash) itx.metadata = { ...(itx.metadata || {}), [CONC_LABEL_HASHKEY]: spec.hash };
        } else if (itx.type === "TEXT") {
          const spec = textUpdate.get(itx.id);
          if (!spec) continue;

          if (spec.x != null && spec.y != null) itx.position = { x: Math.round(spec.x), y: Math.round(spec.y) };
          itx.text = itx.text || {};
          if (spec.w != null) itx.text.width  = spec.w;
          if (spec.h != null) itx.text.height = spec.h;
          if (spec.z != null) itx.zIndex = spec.z;
          if (itx.layer !== LAYER_TEXT) itx.layer = LAYER_TEXT;
        }
      }
    });
  }
}

  /* ===================== RACE/DEBOUNCE & SNAPSHOT ===================== */
  const __CONC_UPSERT_LOCK = new Set();
  let __debounceTimer = null;
  const __assignSnapshot = new Map(); // tokenId -> digest di tutte le assegnazioni

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
  export async function refreshConcentrationDots() {
    dlog("refresh:begin");

    const tokens = await OBR.scene.items.getItems(i => !!i.metadata?.[META_KEY]);
    dlog("refresh:scan-count", tokens.length);

    let anyChanged = false;
    const currentIds = new Set(tokens.map(t => t.id));
    for (const oldId of __assignSnapshot.keys()) { if (!currentIds.has(oldId)) { anyChanged = true; break; } }
    if (!anyChanged) {
      for (const t of tokens) {
        const dig = assignmentsDigest(t);
        if (__assignSnapshot.get(t.id) !== dig) { anyChanged = true; break; }
      }
    }
    if (!anyChanged && __assignSnapshot.size) { dlog("refresh:skip(no-change)"); return; }

    const should = new Set();

    for (const it of tokens) {
      const assigns = extractAssignments(it);
      if (!assigns.length) {
        // SAFE: pulisco solo ciò che dipende da questo token come CASTER
        // (label con CONC_WIDGET_CASTER === it.id) oppure il DOT attaccato al token.
        const mine = await OBR.scene.items.getItems(
          (i) => (i.type === "TEXT" || i.type === "SHAPE") && (
            // label generate da questo token come caster
            i.metadata?.[CONC_WIDGET_CASTER] === it.id ||
            // dot di concentrazione attaccato a questo token
            (i.metadata?.[CONC_WIDGET_META] === it.id && (i.name === DOT_BG_NAME || i.name === DOT_TEXT_NAME))
          )
        );
        if (mine.length) {
          dlog("cleanup(token-safe)", it.name, mine.length);
          await OBR.scene.items.deleteItems(mine.map(m => m.id));
        }
        continue;
      }

      // owner validi
      should.add(it.id);
      for (const a of assigns) for (const tid of (a.targets?.length ? a.targets : [it.id])) should.add(tid);

      if (__CONC_UPSERT_LOCK.has(it.id)) continue;
      __CONC_UPSERT_LOCK.add(it.id);
      try { await upsertDotForItem(it); }
      finally { __CONC_UPSERT_LOCK.delete(it.id); }
    }

    // ---- Aggiorna lo snapshot per bloccare loop su onChange dei nostri widget
    try {
      __assignSnapshot.clear();
      for (const t of tokens) {
        __assignSnapshot.set(t.id, assignmentsDigest(t));
      }
    } catch {}

    // === Cleanup più sicuro: non cancellare label appena create se almeno caster O target sono "attesi"
    const allWidgets = await OBR.scene.items.getItems(
      (i) => (i.type === "TEXT" || i.type === "SHAPE") && (i.metadata?.[CONC_WIDGET_META] || i.metadata?.[CONC_WIDGET_CASTER])
    );

    const toRemove = [];
    for (const w of allWidgets) {
      const metaTarget = w.metadata?.[CONC_WIDGET_META];      // per DOT = casterId, per LABEL = targetId
      const metaCaster = w.metadata?.[CONC_WIDGET_CASTER] || null;

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
      await OBR.scene.items.deleteItems(toRemove);
    }
  }

  /* ===================== WATCHER ===================== */
  let __mounted = false;
  export function mountConcentrationWatcher() {
    if (__mounted) return;
    __mounted = true;
    dlog("watcher:mounted");
    refreshConcentrationDots().catch(e => dlog("watcher:init-error", e));
    OBR.scene.items.onChange((changes = []) => {
      if (isOnlyActiveTurnLabelChange(changes)) return;
      dlog("onChange");
      __scheduleRefresh();
    });
  }

  // montaggio automatico se non lo fai tu altrove
  try { OBR?.onReady?.(() => mountConcentrationWatcher()); } catch {}
