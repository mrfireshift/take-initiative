// src/hpbar-items.js
import OBR, { buildShape, buildText } from "@owlbear-rodeo/sdk";
import { ID } from "./contextMenu";
import { isOnlyActiveTurnLabelChange } from "./constants.js";

/* ========= Chiavi metadata ========= */
const META_KEY         = `${ID}/meta`;    // nei token: { hp, hpMax, ... }
const HPBAR_META_FLAG  = `${ID}/hpbar`;   // nelle shape-barre: { kind: "bg"|"fg", targetId }
const HPTEXT_META_FLAG = `${ID}/hptext`;  // text item: { targetId }

/* ========= Parametri estetici/posizionamento ========= */
// Barra “mini”: sottile, centrata, sotto al bordo, con lieve sovrapposizione
const OVERLAP_FRAC     = 0.25; // quanto “entra” nel token (in % dell’altezza)
const GAP_FRAC         = 0.02; // piccolo distacco verso il basso
let   IS_GM            = false;

/* ========= Throttle/Batch (evita rate limit) ========= */
const FLUSH_MS  = 120;                  // aggiorna al massimo ogni 120ms
const _pending  = new Map();            // tokenId -> {hp, hpMax}
let   _flushT   = null;
let   _flushing = false;

// cache dell’ultimo stato applicato (evita update inutili)
const _last = new Map(); // tokenId -> {barW, barH, leftX, topY, pct, color}
const _barRefs = new Map(); // tokenId -> {fgId, inner}
const _fastFillPending = new Map(); // tokenId -> {hp, hpMax}
const _fastFillRunning = new Set();

/* ========= Utils ========= */
const clamp   = (n, a, b) => Math.max(a, Math.min(b, n));
const clamp01 = (n) => clamp(n, 0, 1);

// Config: quali attitude sono visibili ai player
const PLAYER_VISIBLE_ATTITUDES = ["ally", "pc"];

// diff veloce fra due firme
function __diffSig(a = {}, b = {}) {
  const diff = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (a[k] !== b[k]) diff[k] = { from: a[k], to: b[k] };
  }
  return diff;
}

// Normalizza l'attitude
function getAttitude(item){
  try {
    const att = String(item?.metadata?.[META_KEY]?.attitude || "").toLowerCase().trim();
    return att || null;
  } catch { return null; }
}

function isPlayerVisibleAttitude(att){
  const a = (att || "").toLowerCase();
  return PLAYER_VISIBLE_ATTITUDES.includes(a);
}

function hpColorByPct(p){
  if (p > 0.66) return "#16a34a"; // verde
  if (p > 0.33) return "#facc15"; // giallo
  return "#dc2626";               // rosso
}

function queueFastFill(tokenId, hp, hpMax) {
  _fastFillPending.set(tokenId, {
    hp: Number(hp) || 0,
    hpMax: Number(hpMax) || 0,
  });
  if (_fastFillRunning.has(tokenId)) return;

  _fastFillRunning.add(tokenId);
  void (async () => {
    try {
      while (_fastFillPending.has(tokenId)) {
        const next = _fastFillPending.get(tokenId);
        _fastFillPending.delete(tokenId);

        const ref = _barRefs.get(tokenId);
        if (!ref) continue;

        const pct = clamp01(next.hpMax > 0 ? next.hp / next.hpMax : 0);
        const fillW = Math.floor(ref.inner * pct);
        const color = hpColorByPct(pct);

        try {
          await OBR.scene.items.updateItems([ref.fgId], (items) => {
            const fg = items[0];
            if (!fg) return;
            fg.width = fillW;
            fg.style = { ...(fg.style || {}), fillColor: color, fillOpacity: 1 };
          });
        } catch {
          _barRefs.delete(tokenId);
        }
      }
    } finally {
      _fastFillRunning.delete(tokenId);
      if (_fastFillPending.has(tokenId)) {
        const next = _fastFillPending.get(tokenId);
        queueFastFill(tokenId, next.hp, next.hpMax);
      }
    }
  })();
}

// Attende che la scena sia pronta (evita "No scene found")
async function waitForSceneReady(timeoutMs = 10000) {
  const start = Date.now();
  while (true) {
    try {
      await OBR.scene.getMetadata();
      return;
    } catch (e) {
      const msg = e?.message || e?.error?.message || "";
      if (msg.includes("No scene found") || msg.includes("MissingDataError")) {
        if (Date.now() - start > timeoutMs) throw e;
        await new Promise(r => setTimeout(r, 150));
        continue;
      }
      throw e;
    }
  }
}

// OBR non espone getItem(id): emuliamo
async function getItemById(id) {
  const all = await OBR.scene.items.getItems();
  return all.find(it => it.id === id) || null;
}

/* ========= Dimensioni e layout proporzionali ========= */

// Spessore/larghezza proporzionali alla taglia del token
function computeBarSizeByToken(bbox){
  const W = bbox.width;
  const H = bbox.height;

  // Larghezza = 60% della larghezza del token (clamp morbido 45..75%)
  const barW = Math.round(Math.max(W * 0.45, Math.min(W * 0.80, W * 0.90)));

  // Spessore più corposo: clamp 10..14 px
  const barH = Math.round(Math.max(14, Math.min(22, H * 0.1)));

  return { barW, barH };
}

async function computeBarLayout(tokenId, tokenSnapshot = null){
  let b;
  try { b = await OBR.scene.items.getItemBounds([tokenId]); }
  catch { return null; }
  if (!b) return null;

  const { barW, barH } = computeBarSizeByToken(b);

  // sotto al token: 2% di distacco e 6% di sovrapposizione al bordo
  const gap     = Math.max(1, Math.round(b.height * GAP_FRAC));
  const overlap = Math.round(b.height * OVERLAP_FRAC);

  const cx   = (b.min.x + b.max.x) / 2;
  const leftX = Math.round(cx - barW / 2);
  const topY  = Math.round(b.max.y - overlap + gap);

  const tokenItem = tokenSnapshot || await getItemById(tokenId);
  const tokenZ    = tokenItem?.zIndex ?? 0;

  return { barW, barH, leftX, topY, tokenZ };
}

/* ========= Creazione & ricerca shape ========= */

// Trova la base/riempimento di un token e rimuove eventuali duplicati/ombre
async function findHPBars(tokenId, itemsSnapshot = null){
  const items = itemsSnapshot || await OBR.scene.items.getItems();
  const ofToken = items.filter(
    it => it.metadata?.[HPBAR_META_FLAG]?.targetId === tokenId
  );

  const byKind = new Map();
  for (const it of ofToken) {
    const k = it.metadata[HPBAR_META_FLAG].kind; // "bg" | "fg" | (vecchie "shadow")
    if (!byKind.has(k)) byKind.set(k, []);
    byKind.get(k).push(it);
  }

  // elimina ombre e duplicati (tieni il primo per kind)
  const toDelete = [];
  for (const [k, arr] of byKind) {
    if (k === "shadow") toDelete.push(...arr.map(x=>x.id)); // non usiamo più le ombre
    if (arr.length > 1) toDelete.push(...arr.slice(1).map(x=>x.id));
  }
  if (toDelete.length) await OBR.scene.items.deleteItems(toDelete);

  const bg = (byKind.get("bg") || [])[0] || null;
  const fg = (byKind.get("fg") || [])[0] || null;
  return { bg, fg };
}

async function createHPBars(tokenId){
  const L = await computeBarLayout(tokenId);
  if (!L) return null;
  const { barW, barH, leftX, topY, tokenZ } = L;

  const bg = buildShape()
    .shapeType("RECTANGLE")
    .width(barW).height(barH)
    .position({ x: leftX, y: topY })
    .attachedTo(tokenId).locked(true).disableHit(true)
    .layer("ATTACHMENT")
    .disableAttachmentBehavior(["ROTATION","VISIBLE","COPY","SCALE"])
    .visible(false) // GM-only
    .zIndex(tokenZ + 2)
    .fillColor("rgba(0, 0, 0, 1)")
    .strokeColor("rgba(0,0,0,1)").strokeWidth(1)
    .metadata({ [HPBAR_META_FLAG]: { kind: "bg", targetId: tokenId } })
    .name("HPBAR_BG")
    .build();

  const fg = buildShape()
    .shapeType("RECTANGLE")
    .width(0) // impostata nel layout
    .height(barH - 2)
    .position({ x: leftX + 1, y: topY + 1 })
    .attachedTo(tokenId).locked(true).disableHit(true)
    .layer("ATTACHMENT")
    .disableAttachmentBehavior(["ROTATION","VISIBLE","COPY","SCALE"])
    .visible(false)
    .zIndex(tokenZ + 3)
    .fillColor("#16a34a")
    .strokeColor("transparent").strokeWidth(0)
    .metadata({ [HPBAR_META_FLAG]: { kind: "fg", targetId: tokenId } })
    .name("HPBAR_FG")
    .build();

  await OBR.scene.items.addItems([bg, fg]);
  return { bg, fg };
}

/* ========= Coda aggiornamenti (batch) ========= */
function queueToken(tokenId, hp, hpMax){
  const nHP  = Number(hp)    || 0;
  const nMax = Number(hpMax) || 0;
  _pending.set(tokenId, { hp: nHP, hpMax: nMax });

  if (!_flushT) _flushT = setTimeout(flushQueued, FLUSH_MS);
}

async function flushQueued(){
  if (_flushing) return;
  _flushing = true;
  clearTimeout(_flushT); _flushT = null;

  const startedAt = Date.now();
  const hpTextUpdates = [];
  try {
    await waitForSceneReady();

    const entries = Array.from(_pending.entries());
    _pending.clear();
    if (!entries.length) { return; }

    const idsToUpdate = [];
    const updatesById = new Map();

    // mappa: tokenId -> textItem (se esiste)
    const allItemsNow = await OBR.scene.items.getItems();
    const itemsById = new Map(allItemsNow.map(it => [it.id, it]));
    const hptextByToken = new Map();
    for (const it of allItemsNow) {
      const m = it.metadata?.[HPTEXT_META_FLAG];
      if (m?.targetId) hptextByToken.set(m.targetId, it);
    }

    for (const [tokenId, { hp, hpMax }] of entries){
      // Ricava item+nome (solo per log)
      const item = itemsById.get(tokenId) || null;
      const nameForLog = item?.name || tokenId;

      // Layout
      const layout = await computeBarLayout(tokenId, item);
      if (!layout) { continue; }

      const { barW, barH, leftX, topY, tokenZ } = layout;
      const pct   = clamp01(hpMax > 0 ? hp / hpMax : 0);
      const color = hpColorByPct(pct);

      // Firma di dedup (include hp/hpMax)
      const sig = { barW, barH, leftX, topY, pct, color, hp, hpMax };
      const last = _last.get(tokenId);
      if (last) {
        const ds = __diffSig(last, sig);
        const keysChanged = Object.keys(ds);
        if (!keysChanged.length) {
          continue;
        }
      }

      // Trova o crea le due shape (bg/fg)
      let { bg, fg } = await findHPBars(tokenId, allItemsNow);
      if (!bg || !fg){
        const created = await createHPBars(tokenId);
        if (created) ({ bg, fg } = created);
        else { continue; }
      }

      // Geometria e fill
      const inner = Math.max(0, barW - 2);
      const fillW = Math.floor(inner * pct);
      _barRefs.set(tokenId, { fgId: fg.id, inner });

      // Visibilità per i player: SOLO Ally/PC → true; Enemy/Neutral → false.
      // Il GM vede comunque anche quando visible=false.
      const att = getAttitude(item);
      const playerVisible = isPlayerVisibleAttitude(att);

      updatesById.set(bg.id, {
        width: barW, height: barH,
        position: { x: leftX, y: topY },
        zIndex: tokenZ + 2,
        visible: playerVisible,
      });
      updatesById.set(fg.id, {
        width: fillW, height: barH - 2,
        position: { x: leftX + 1, y: topY + 1 },
        zIndex: tokenZ + 3,
        fillColor: color, fillOpacity: 1,
        visible: playerVisible,
      });
      idsToUpdate.push(bg.id, fg.id);

      // riallinea anche il TEXT se esiste (NO width/height sui TextItem)
      const txt = hptextByToken.get(tokenId);
      if (txt) {
        updatesById.set(txt.id, {
          position: { x: leftX, y: topY },
          zIndex: tokenZ + 1000,
          visible: playerVisible,
        });
        idsToUpdate.push(txt.id);
      }

      // Memorizza l'ultimo stato
      _last.set(tokenId, sig);
      hpTextUpdates.push({ tokenId, hp, hpMax });
    }

    if (idsToUpdate.length) {
      // ricontrollo esistenza id prima di aggiornare
      const current = await OBR.scene.items.getItems(idsToUpdate);
      const existing = new Set(current.map(i => i?.id).filter(Boolean));
      const finalIds = idsToUpdate.filter(id => existing.has(id));

      if (finalIds.length) {
        await OBR.scene.items.updateItems(finalIds, (items) => {
          for (const it of items) {
            const u = updatesById.get(it.id);
            if (!u) { continue; }

            const isText = !!it.text;

            if (!isText) {
              // SHAPE (bg/fg): ok width/height/pos/zIndex/visible + fill
              if (u.width       !== undefined) { it.width = u.width; }
              if (u.height      !== undefined) { it.height = u.height; }
              if (u.position)                   { it.position = u.position; }
              if (u.zIndex      !== undefined) { it.zIndex = u.zIndex; }
              if (u.visible     !== undefined) { it.visible = !!u.visible; }

              if (u.fillColor || u.fillOpacity !== undefined) {
                it.style = { ...(it.style || {}) };
                if (u.fillColor)                 { it.style.fillColor   = u.fillColor; }
                if (u.fillOpacity !== undefined) { it.style.fillOpacity = u.fillOpacity; }
              }
            } else {
              // TEXT: solo pos/zIndex/visibilità (no width/height/no fill)
              if (u.position)                   { it.position = u.position; }
              if (u.zIndex      !== undefined) { it.zIndex = u.zIndex; }
              if (u.visible     !== undefined) { it.visible = !!u.visible; }
            }
          }
        });
      }
    }

    // Pulizia orfani (barre senza token target)
    const all = await OBR.scene.items.getItems();
    const ids = new Set(all.map(i => i.id));
    const toRemove = [];
    for (const it of all){
      const m = it.metadata?.[HPBAR_META_FLAG];
      if (m && !ids.has(m.targetId)) toRemove.push(it.id);
    }
    if (toRemove.length) {
      await OBR.scene.items.deleteItems(toRemove);
    }

  } catch (e) {
    // silenzioso
  } finally {
    _flushing = false;
    if (_pending.size && !_flushT) {
      _flushT = setTimeout(flushQueued, 0);
    }
  }

  // Il testo segue le barre senza trattenere il lock del batch grafico.
  for (const { tokenId, hp, hpMax } of hpTextUpdates) {
    await syncHPTextNow(tokenId, hp, hpMax);
  }
}

/* ========= Entrypoint pubblico ========= */
function hasCanonicalHP(meta) {
  return !!meta && ((meta.hp ?? null) !== null || (meta.hpMax ?? null) !== null);
}

export async function removeHPWidgetsNow(tokenId) {
  if (!tokenId) return;
  const widgets = await OBR.scene.items.getItems((item) =>
    item.metadata?.[HPBAR_META_FLAG]?.targetId === tokenId ||
    item.metadata?.[HPTEXT_META_FLAG]?.targetId === tokenId
  );
  if (widgets.length) await OBR.scene.items.deleteItems(widgets.map((item) => item.id));
}

export async function mountHPBars(){
  try {
    const role =
      (await OBR.player?.getRole?.()) ||
      (await OBR.room?.getRole?.()) || "PLAYER";
    IS_GM = String(role).toUpperCase() === "GM";
  } catch { IS_GM = false; }

  await waitForSceneReady();

  if (IS_GM) {
    const all = await OBR.scene.items.getItems();
    const oldShadows = all
      .filter(it => it.metadata?.[HPBAR_META_FLAG]?.kind === "shadow")
      .map(it => it.id);
    if (oldShadows.length) await OBR.scene.items.deleteItems(oldShadows);

    const items = await OBR.scene.items.getItems();
    for (const it of items){
      const m = it.metadata?.[META_KEY];
      if (!hasCanonicalHP(m)) continue;
      queueToken(it.id, Number(m.hp)||0, Number(m.hpMax)||0);
    }

    setTimeout(flushQueued, 0);
  }

  let itemsChangeTimer = null;
  OBR.scene.items.onChange((changes = []) => {
    if (!IS_GM) return;
    if (isOnlyActiveTurnLabelChange(changes)) return;
    clearTimeout(itemsChangeTimer);
    itemsChangeTimer = setTimeout(async () => {
      const items = await OBR.scene.items.getItems();
      const byId  = new Map(items.map(it => [it.id, it]));
      for (const ch of changes){
        const cur = byId.get(ch.id);
        if (!cur) continue;
        if (cur.metadata?.[HPBAR_META_FLAG]) continue;
        const m = cur.metadata?.[META_KEY];
        if (!hasCanonicalHP(m)) continue;
        queueToken(cur.id, Number(m.hp)||0, Number(m.hpMax)||0);
      }
    }, 0);
  });

  let metaChangeTimer = null;
  OBR.scene.onMetadataChange(() => {
    if (!IS_GM) return;
    clearTimeout(metaChangeTimer);
    metaChangeTimer = setTimeout(async () => {
      const items = await OBR.scene.items.getItems();
      for (const it of items){
        const m = it.metadata?.[META_KEY];
        if (!hasCanonicalHP(m)) continue;
        queueToken(it.id, Number(m.hp)||0, Number(m.hpMax)||0);
      }
    }, 0);
  });
}

export function syncHPBarNow(tokenId, hp, hpMax) {
  try {
    queueFastFill(tokenId, hp, hpMax);
    queueToken(tokenId, Number(hp) || 0, Number(hpMax) || 0);
    setTimeout(flushQueued, 0);
  } catch {}
}

// Modifica
// Crea/aggiorna un item di TESTO "(HP/Max - %)" sopra le HPBAR.
// Usa il TextBuilder correttamente (plainText + metodi stile del builder).
export async function syncHPTextNow(tokenId, hp, hpMax) {
  try {
    await waitForSceneReady();

    const [token] = await OBR.scene.items.getItems([tokenId]);
    if (!token) return;

    const L = await computeBarLayout(tokenId);
    if (!L) return;
    const { leftX, topY, barH, tokenZ } = L;

    const nHP  = Math.max(0, Math.floor(Number(hp)    || 0));
    const nMax = Math.max(0, Math.floor(Number(hpMax) || 0));
    const pct  = nMax > 0 ? Math.round(Math.min(1, nHP / nMax) * 100) : 0;
    const textStr = `${nHP}/${nMax} (${pct}%)`;

    // Visibilità lato player (GM vede comunque anche se false)
    const att = getAttitude(token);
    const playerVisible = isPlayerVisibleAttitude(att);

    const pos = { x: leftX, y: topY - 1 };
    const z   = (Number(tokenZ) || 0) + 1000;

    // dedup
    const all = await OBR.scene.items.getItems();
    let existing = all.find(it => it.metadata?.[HPTEXT_META_FLAG]?.targetId === tokenId);
    const dups = all
      .filter(it => it.id !== (existing?.id) && it.metadata?.[HPTEXT_META_FLAG]?.targetId === tokenId)
      .map(it => it.id);
    if (dups.length) await OBR.scene.items.deleteItems(dups);

    if (!existing) {
      const textItem = buildText()
        .plainText(textStr)          // ← contenuto testuale
        .textType("PLAIN")           // ← esplicito per evitare ambiguità
        .fontFamily("Inter, Arial, sans-serif")
        .fontSize(14)
        .textAlign("CENTER")
        .textAlignVertical("MIDDLE")
        .fillColor("#ffffff")
        .strokeColor("rgba(0,0,0,0.8)")
        .strokeWidth(2)
        .position(pos)
        .layer("ATTACHMENT")
        .attachedTo(tokenId)
        .zIndex(z)
        .visible(playerVisible)
        .metadata({ [HPTEXT_META_FLAG]: { targetId: tokenId } })
        .name("HP Text")
        .build();

      await OBR.scene.items.addItems([textItem]);
    } else {
      await OBR.scene.items.updateItems([existing.id], (list) => {
        const it = list[0]; if (!it) return;
        it.layer      = "ATTACHMENT";
        it.attachedTo = tokenId;
        it.position   = pos;
        it.zIndex     = z;
        it.visible    = playerVisible;

        // Aggiorna contenuto e stile tramite proprietà del Text item
        if (!it.text) it.text = { type: "PLAIN", plainText: textStr };
        it.text.type = "PLAIN";
        it.text.plainText = textStr;

        // Alcune proprietà di stile stanno su it.text.style; altre sono a livello item per i builder.
        // Qui preserviamo font/align se già presenti.
        it.text.style = {
          ...(it.text.style || {}),
          fontFamily: (it.text.style?.fontFamily) || "Inter, Arial, sans-serif",
          fontSize:   (it.text.style?.fontSize)   || 14,
          textAlign:  "CENTER",
          textAlignVertical: "MIDDLE",
          fillColor:  (it.text.style?.fillColor)  || "#ffffff",
          strokeColor: (it.text.style?.strokeColor) || "rgba(0,0,0,0.8)",
          strokeWidth: (typeof it.text.style?.strokeWidth === "number") ? it.text.style.strokeWidth : 2,
        };

        if (!it.metadata) it.metadata = {};
        it.metadata[HPTEXT_META_FLAG] = { targetId: tokenId };
      });
    }
  } catch (error) {
    // silenzioso
  }
}
