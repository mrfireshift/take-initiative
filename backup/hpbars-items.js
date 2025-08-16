// src/hpbar-items.js
import OBR, { buildShape } from "@owlbear-rodeo/sdk";
import { ID } from "./contextMenu";

/* ========= Chiavi metadata ========= */
const META_KEY        = `${ID}/meta`;   // nei token: { hp, hpMax, ... }
const HPBAR_META_FLAG = `${ID}/hpbar`;  // nelle shape-barre: { kind: "bg"|"fg", targetId }

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

/* ========= Utils ========= */
const clamp   = (n, a, b) => Math.max(a, Math.min(b, n));
const clamp01 = (n) => clamp(n, 0, 1);

function hpColorByPct(p){
  if (p > 0.66) return "#16a34a"; // verde
  if (p > 0.33) return "#facc15"; // giallo
  return "#dc2626";               // rosso
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

async function computeBarLayout(tokenId){
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

  const tokenItem = await getItemById(tokenId);
  const tokenZ    = tokenItem?.zIndex ?? 0;

  return { barW, barH, leftX, topY, tokenZ };
}

/* ========= Creazione & ricerca shape ========= */

// Trova la base/riempimento di un token e rimuove eventuali duplicati/ombre
async function findHPBars(tokenId){
  const items = await OBR.scene.items.getItems();
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
  _pending.set(tokenId, { hp: Number(hp)||0, hpMax: Number(hpMax)||0 });
  if (!_flushT) _flushT = setTimeout(flushQueued, FLUSH_MS);
}

async function flushQueued(){
  if (_flushing) return;
  _flushing = true;
  clearTimeout(_flushT); _flushT = null;

  try {
    await waitForSceneReady();

    const entries = Array.from(_pending.entries());
    _pending.clear();
    if (!entries.length) return;

    const idsToUpdate = [];
    const updatesById = new Map();

    for (const [tokenId, { hp, hpMax }] of entries){
      const layout = await computeBarLayout(tokenId);
      if (!layout) continue;

      const { barW, barH, leftX, topY, tokenZ } = layout;
      const pct   = clamp01(hpMax > 0 ? hp / hpMax : 0);
      const color = hpColorByPct(pct);

      const sig = { barW, barH, leftX, topY, pct, color };
      const last = _last.get(tokenId);
      if (last &&
          last.barW===sig.barW && last.barH===sig.barH &&
          last.leftX===sig.leftX && last.topY===sig.topY &&
          last.pct===sig.pct && last.color===sig.color) {
        continue;
      }

      let { bg, fg } = await findHPBars(tokenId);
      if (!bg || !fg){
        const created = await createHPBars(tokenId);
        if (created) ({ bg, fg } = created);
        else continue;
      }

      const inner = Math.max(0, barW - 2);
      const fillW = Math.floor(inner * pct);

      updatesById.set(bg.id, {
        width: barW, height: barH,
        position: { x: leftX, y: topY },
        zIndex: tokenZ + 2,
      });

      updatesById.set(fg.id, {
        width: fillW, height: barH - 2,
        position: { x: leftX + 1, y: topY + 1 },
        zIndex: tokenZ + 3,
        fillColor: color, fillOpacity: 1,
      });

      idsToUpdate.push(bg.id, fg.id);
      _last.set(tokenId, sig);
    }

    if (idsToUpdate.length) {
  await OBR.scene.items.updateItems(idsToUpdate, (items) => {
    for (const it of items) {
      const u = updatesById.get(it.id);
      if (!u) continue;
      if (u.width       !== undefined) it.width = u.width;
      if (u.height      !== undefined) it.height = u.height;
      if (u.position)                   it.position = u.position;
      if (u.zIndex      !== undefined) it.zIndex = u.zIndex;
      // colore: va dentro it.style
      if (u.fillColor || u.fillOpacity !== undefined) {
        it.style = { ...(it.style || {}) };
        if (u.fillColor)                 it.style.fillColor   = u.fillColor;
        if (u.fillOpacity !== undefined) it.style.fillOpacity = u.fillOpacity;
      }
    }
  });
}

    const all = await OBR.scene.items.getItems();
    const ids = new Set(all.map(i => i.id));
    const toRemove = [];
    for (const it of all){
      const m = it.metadata?.[HPBAR_META_FLAG];
      if (m && !ids.has(m.targetId)) toRemove.push(it.id);
    }
    if (toRemove.length) await OBR.scene.items.deleteItems(toRemove);

  } catch (e) {
    console.warn("[hpbar] flush error", e?.error?.message || e?.message || e);
  } finally {
    _flushing = false;
  }
}

/* ========= Entrypoint pubblico ========= */
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
      if (!m) continue;
      queueToken(it.id, Number(m.hp)||0, Number(m.hpMax)||0);
    }
    setTimeout(flushQueued, 0);
  }

  let itemsChangeTimer = null;
  OBR.scene.items.onChange((changes = []) => {
    if (!IS_GM) return;
    clearTimeout(itemsChangeTimer);
    itemsChangeTimer = setTimeout(async () => {
      const items = await OBR.scene.items.getItems();
      const byId  = new Map(items.map(it => [it.id, it]));
      for (const ch of changes){
        const cur = byId.get(ch.id);
        if (!cur) continue;
        if (cur.metadata?.[HPBAR_META_FLAG]) continue;
        const m = cur.metadata?.[META_KEY];
        if (!m) continue;
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
        if (!m) continue;
        queueToken(it.id, Number(m.hp)||0, Number(m.hpMax)||0);
      }
    }, 0);
  });
}

export function syncHPBarNow(tokenId, hp, hpMax) {
  try {
    queueToken(tokenId, Number(hp) || 0, Number(hpMax) || 0);
    setTimeout(flushQueued, 0);
  } catch {}
}