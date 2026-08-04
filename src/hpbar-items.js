// src/hpbar-items.js
import OBR, { buildShape, buildText } from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { subscribeSceneItemChanges } from "./sceneItemEvents.js";
import { reconcileOwnedSceneItems } from "./sceneItemReconcileCore.js";
import { currentSceneEpoch, isCurrentSceneEpoch } from "./sceneEpoch.js";

/* ========= Chiavi metadata ========= */
const META_KEY         = `${ID}/meta`;    // nei token: { hp, hpMax, ... }
const HPBAR_META_FLAG  = `${ID}/hpbar`;   // nelle shape-barre: { kind: "bg"|"fg", targetId }
const HPTEXT_META_FLAG = `${ID}/hptext`;  // text item: { targetId }

/* ========= Parametri estetici/posizionamento ========= */
// Barra “mini”: sottile, centrata, sotto al bordo, con lieve sovrapposizione
const OVERLAP_FRAC     = 0.25; // quanto “entra” nel token (in % dell’altezza)
const GAP_FRAC         = 0.02; // piccolo distacco verso il basso
const BAR_INSET        = 2;
const BAR_BG_COLOR     = "#0f172a";
const BAR_BG_OPACITY   = 0.82;
const BAR_BORDER_COLOR = "rgba(255,255,255,0.34)";
const BAR_FILL_OPACITY = 0.96;
const HP_TEXT_FONT_SIZE = 12;
const HP_WIDGET_RECOVERY_DELAY_MS = 500;
let   IS_GM            = false;

/* ========= Throttle/Batch (evita rate limit) ========= */
const FLUSH_MS  = 120;                  // aggiorna al massimo ogni 120ms
const _pending  = new Map();            // tokenId -> {hp, hpMax}
let   _flushT   = null;
let   _flushing = false;
let   _sceneEpoch = 0;
let   _readyListenerMounted = false;
let   _sceneItemListenerMounted = false;

// cache dell’ultimo stato applicato (evita update inutili)
const _last = new Map(); // tokenId -> {barW, barH, leftX, topY, pct, color}
const _barRefs = new Map(); // tokenId -> {fgId, inner, textId?}
const _fastFillPending = new Map(); // tokenId -> {hp, hpMax}
let _fastFillScheduled = false;
let _fastFillFlushing = false;
const _tokenRevision = new Map(); // tokenId -> ultimo aggiornamento richiesto
const _textRevision = new Map(); // tokenId -> ultimo testo richiesto
const _textQueues = new Map(); // tokenId -> coda seriale del testo HP
const _recoveryTimers = new Set();

function nextTokenRevision(tokenId) {
  const next = (_tokenRevision.get(tokenId) || 0) + 1;
  _tokenRevision.set(tokenId, next);
  return next;
}

function scheduleFlush(delay = FLUSH_MS) {
  if (_flushing || _flushT) return;
  _flushT = setTimeout(() => {
    _flushT = null;
    void flushQueued();
  }, Math.max(0, delay));
}

function resetRuntimeState() {
  _sceneEpoch += 1;
  if (_flushT) clearTimeout(_flushT);
  _flushT = null;
  _pending.clear();
  _last.clear();
  _barRefs.clear();
  _fastFillPending.clear();
  _fastFillScheduled = false;
  _tokenRevision.clear();
  _textRevision.clear();
  for (const timer of _recoveryTimers) clearTimeout(timer);
  _recoveryTimers.clear();
}

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
  if (p > 0.66) return "#22c55e"; // verde
  if (p > 0.33) return "#f59e0b"; // ambra
  return "#ef4444";               // rosso
}

function hpTextValue(hp, hpMax) {
  const nHP  = Math.max(0, Math.floor(Number(hp) || 0));
  const nMax = Math.max(0, Math.floor(Number(hpMax) || 0));
  return `${nHP}/${nMax}`;
}

function hpTextPosition(leftX, topY, barW, barH, value) {
  const estimatedWidth = String(value || "").length * HP_TEXT_FONT_SIZE * 0.58;
  return {
    x: Math.round(leftX + Math.max(BAR_INSET, (barW - estimatedWidth) / 2)),
    y: Math.round(topY + Math.max(0, (barH - HP_TEXT_FONT_SIZE) / 2)),
  };
}

function rememberHPTextRef(tokenId, textId) {
  if (!textId) return;
  const ref = _barRefs.get(tokenId);
  if (ref) _barRefs.set(tokenId, { ...ref, textId });
}

function scheduleFastFill() {
  if (_fastFillScheduled || _fastFillFlushing) return;
  _fastFillScheduled = true;
  setTimeout(() => {
    _fastFillScheduled = false;
    void flushFastFills();
  }, 0);
}

async function flushFastFills() {
  if (_fastFillFlushing) return;
  _fastFillFlushing = true;
  try {
    const entries = Array.from(_fastFillPending.entries());
    _fastFillPending.clear();
    if (!entries.length) return;

    // Una label può essere stata creata dal fallback dopo la prima cache delle barre.
    // Risolvi tutti gli eventuali ID mancanti con una sola lettura della scena.
    const missingTextTargets = new Set(entries
      .filter(([tokenId, next]) => next.epoch === _sceneEpoch && _barRefs.get(tokenId) && !_barRefs.get(tokenId).textId)
      .map(([tokenId]) => tokenId));
    if (missingTextTargets.size) {
      const sceneItems = await OBR.scene.items.getItems();
      for (const item of sceneItems) {
        const targetId = item.metadata?.[HPTEXT_META_FLAG]?.targetId;
        if (missingTextTargets.has(targetId)) rememberHPTextRef(targetId, item.id);
      }
    }

    const updatesById = new Map();
    for (const [tokenId, next] of entries) {
      if (next.epoch !== _sceneEpoch) continue;
      const ref = _barRefs.get(tokenId);
      if (!ref) continue;

      const pct = clamp01(next.hpMax > 0 ? next.hp / next.hpMax : 0);
      updatesById.set(ref.fgId, {
        width: Math.floor(ref.inner * pct),
        fillColor: hpColorByPct(pct),
      });
      if (ref.textId) {
        const plainText = hpTextValue(next.hp, next.hpMax);
        updatesById.set(ref.textId, {
          plainText,
          position: hpTextPosition(ref.leftX, ref.topY, ref.barW, ref.barH, plainText),
        });
      }
    }

    const ids = Array.from(updatesById.keys());
    if (!ids.length) return;
    await OBR.scene.items.updateItems(ids, (items) => {
      for (const item of items) {
        const update = updatesById.get(item.id);
        if (!update) continue;
        if (update.width !== undefined) {
          item.width = update.width;
          item.style = {
            ...(item.style || {}),
            fillColor: update.fillColor,
            fillOpacity: BAR_FILL_OPACITY,
          };
        }
        if (update.plainText !== undefined) {
          if (!item.text) item.text = { type: "PLAIN", plainText: update.plainText };
          item.text.type = "PLAIN";
          item.text.plainText = update.plainText;
        }
        if (update.position) item.position = update.position;
      }
    });
  } catch (error) {
    console.warn("[hpbar] fast batch error:", error?.message || error);
  } finally {
    _fastFillFlushing = false;
    if (_fastFillPending.size) scheduleFastFill();
  }
}

function queueFastFill(tokenId, hp, hpMax) {
  _fastFillPending.set(tokenId, {
    hp: Number(hp) || 0,
    hpMax: Number(hpMax) || 0,
    epoch: _sceneEpoch,
  });
  scheduleFastFill();
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
  const barW = Math.round(W * 0.86);

  // Spessore più corposo: clamp 10..14 px
  const barH = Math.round(Math.max(17, Math.min(24, H * 0.11)));

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

function hpBarIdentity(tokenId, kind) {
  return `${tokenId}|${kind}`;
}

function hpBarItemIdentity(item) {
  const metadata = item?.metadata?.[HPBAR_META_FLAG];
  return metadata?.targetId && (metadata.kind === "bg" || metadata.kind === "fg")
    ? hpBarIdentity(metadata.targetId, metadata.kind)
    : "";
}

async function createHPBars(
  tokenId,
  sceneEpoch = currentSceneEpoch(),
  layout = null,
  itemsSnapshot = null,
){
  const L = layout || await computeBarLayout(tokenId);
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
    .fillColor(BAR_BG_COLOR).fillOpacity(BAR_BG_OPACITY)
    .strokeColor(BAR_BORDER_COLOR).strokeWidth(1)
    .metadata({ [HPBAR_META_FLAG]: { kind: "bg", targetId: tokenId } })
    .name("HPBAR_BG")
    .build();

  const fg = buildShape()
    .shapeType("RECTANGLE")
    .width(0) // impostata nel layout
    .height(Math.max(1, barH - BAR_INSET * 2))
    .position({ x: leftX + BAR_INSET, y: topY + BAR_INSET })
    .attachedTo(tokenId).locked(true).disableHit(true)
    .layer("ATTACHMENT")
    .disableAttachmentBehavior(["ROTATION","VISIBLE","COPY","SCALE"])
    .visible(false)
    .zIndex(tokenZ + 3)
    .fillColor("#22c55e").fillOpacity(BAR_FILL_OPACITY)
    .strokeColor("transparent").strokeWidth(0)
    .metadata({ [HPBAR_META_FLAG]: { kind: "fg", targetId: tokenId } })
    .name("HPBAR_FG")
    .build();

  const result = await reconcileOwnedSceneItems({
    desired: [
      { identity: hpBarIdentity(tokenId, "bg"), item: bg, tokenId },
      { identity: hpBarIdentity(tokenId, "fg"), item: fg, tokenId },
    ],
    readItems: () => OBR.scene.items.getItems((item) => (
      item?.metadata?.[HPBAR_META_FLAG]?.targetId === tokenId
    )),
    identityOfItem: hpBarItemIdentity,
    isCompatible: (item, spec) => (
      item.type === "SHAPE"
      && item.attachedTo === spec.tokenId
      && item.layer === "ATTACHMENT"
    ),
    buildItem: (spec) => spec.item,
    addItems: (items) => OBR.scene.items.addItems(items),
    deleteItems: (ids) => OBR.scene.items.deleteItems(ids),
    isCurrent: () => isCurrentSceneEpoch(sceneEpoch),
    initialItems: Array.isArray(itemsSnapshot)
      ? itemsSnapshot.filter((item) => item?.metadata?.[HPBAR_META_FLAG]?.targetId === tokenId)
      : null,
  });
  return {
    bg: result.itemsByIdentity.get(hpBarIdentity(tokenId, "bg")) || null,
    fg: result.itemsByIdentity.get(hpBarIdentity(tokenId, "fg")) || null,
  };
}

/* ========= Coda aggiornamenti (batch) ========= */
function queueToken(tokenId, hp, hpMax){
  const nHP  = Number(hp)    || 0;
  const nMax = Number(hpMax) || 0;
  const revision = nextTokenRevision(tokenId);
  _pending.set(tokenId, { hp: nHP, hpMax: nMax, revision, epoch: _sceneEpoch });

  scheduleFlush(FLUSH_MS);
}

async function flushQueued(){
  if (_flushing) {
    scheduleFlush(0);
    return;
  }
  _flushing = true;

  const hpTextUpdates = [];
  const candidates = [];
  const operationEpoch = currentSceneEpoch();
  let entries = [];
  try {
    await waitForSceneReady();
    if (!isCurrentSceneEpoch(operationEpoch)) return;

    entries = Array.from(_pending.entries());
    _pending.clear();
    if (!entries.length) { return; }

    const idsToUpdate = [];
    const updatesById = new Map();

    // mappa: tokenId -> textItem (se esiste)
    const allItemsNow = await OBR.scene.items.getItems();
    const itemsById = new Map(allItemsNow.map(it => [it.id, it]));
    const hptextByToken = new Map();
    const hptextCountsByToken = new Map();
    const hpbarKindsByToken = new Map();
    for (const it of allItemsNow) {
      const m = it.metadata?.[HPTEXT_META_FLAG];
      if (m?.targetId) {
        hptextByToken.set(m.targetId, it);
        hptextCountsByToken.set(m.targetId, (hptextCountsByToken.get(m.targetId) || 0) + 1);
      }
      const barMeta = it.metadata?.[HPBAR_META_FLAG];
      if (barMeta?.targetId) {
        if (!hpbarKindsByToken.has(barMeta.targetId)) hpbarKindsByToken.set(barMeta.targetId, new Map());
        const counts = hpbarKindsByToken.get(barMeta.targetId);
        counts.set(barMeta.kind, (counts.get(barMeta.kind) || 0) + 1);
        if ((barMeta.kind === "bg" || barMeta.kind === "fg") && (
          it.type !== "SHAPE"
          || it.attachedTo !== barMeta.targetId
          || it.layer !== "ATTACHMENT"
        )) {
          counts.set("invalid", (counts.get("invalid") || 0) + 1);
        }
      }
    }

    for (const [tokenId, { hp, hpMax, revision, epoch }] of entries){
      if (epoch !== _sceneEpoch || _tokenRevision.get(tokenId) !== revision) continue;
      // Ricava item+nome (solo per log)
      const item = itemsById.get(tokenId) || null;
      if (!item) continue;

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
        const barKinds = hpbarKindsByToken.get(tokenId);
        const textItem = hptextByToken.get(tokenId);
        const textIsCurrent = hptextCountsByToken.get(tokenId) === 1
          && textItem?.type === "TEXT"
          && textItem?.attachedTo === tokenId
          && textItem?.layer === "ATTACHMENT"
          && textItem?.text?.plainText === hpTextValue(hp, hpMax);
        if (!keysChanged.length
          && barKinds?.get("bg") === 1
          && barKinds?.get("fg") === 1
          && !barKinds?.get("shadow")
          && !barKinds?.get("invalid")
          && textIsCurrent) {
          continue;
        }
      }

      // Crea prima gli elementi mancanti e pulisce duplicati/legacy soltanto
      // dopo aver verificato una coppia completa nella scena corrente.
      const { bg, fg } = await createHPBars(
        tokenId,
        operationEpoch,
        layout,
        allItemsNow,
      );
      if (!bg || !fg) continue;

      // Geometria e fill
      const inner = Math.max(0, barW - BAR_INSET * 2);
      const fillW = Math.floor(inner * pct);

      // Visibilità per i player: SOLO Ally/PC → true; Enemy/Neutral → false.
      // Il GM vede comunque anche quando visible=false.
      const att = getAttitude(item);
      const playerVisible = isPlayerVisibleAttitude(att);

      updatesById.set(bg.id, {
        width: barW, height: barH,
        position: { x: leftX, y: topY },
        zIndex: tokenZ + 2,
        fillColor: BAR_BG_COLOR,
        fillOpacity: BAR_BG_OPACITY,
        strokeColor: BAR_BORDER_COLOR,
        strokeWidth: 1,
        visible: playerVisible,
      });
      updatesById.set(fg.id, {
        width: fillW, height: Math.max(1, barH - BAR_INSET * 2),
        position: { x: leftX + BAR_INSET, y: topY + BAR_INSET },
        zIndex: tokenZ + 3,
        fillColor: color, fillOpacity: BAR_FILL_OPACITY,
        strokeColor: "transparent",
        strokeWidth: 0,
        visible: playerVisible,
      });
      idsToUpdate.push(bg.id, fg.id);

      // riallinea anche il TEXT se esiste (NO width/height sui TextItem)
      const txt = hptextByToken.get(tokenId);
      if (txt) {
        const plainText = hpTextValue(hp, hpMax);
        updatesById.set(txt.id, {
          position: hpTextPosition(leftX, topY, barW, barH, plainText),
          zIndex: tokenZ + 1000,
          visible: playerVisible,
          plainText,
          fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
          fontSize: HP_TEXT_FONT_SIZE,
          fontWeight: 700,
          fillColor: "#f8fafc",
          strokeColor: "rgba(2,6,23,0.9)",
          strokeWidth: 2,
        });
        idsToUpdate.push(txt.id);
      }

      candidates.push({ tokenId, hp, hpMax, revision, epoch, sig, bgId: bg.id, fgId: fg.id, textId: txt?.id || null, inner });
    }

    let updatedIds = new Set();
    if (idsToUpdate.length) {
      // ricontrollo esistenza id prima di aggiornare
      const current = await OBR.scene.items.getItems(idsToUpdate);
      const existing = new Set(current.map(i => i?.id).filter(Boolean));
      const finalIds = Array.from(new Set(idsToUpdate.filter(id => existing.has(id))));

      if (finalIds.length) {
        await OBR.scene.items.updateItems(finalIds, (items) => {
          for (const it of items) {
            const u = updatesById.get(it.id);
            if (!u) { continue; }
            it.locked = true;
            it.disableHit = true;

            const isText = !!it.text;

            if (!isText) {
              // SHAPE (bg/fg): ok width/height/pos/zIndex/visible + fill
              if (u.width       !== undefined) { it.width = u.width; }
              if (u.height      !== undefined) { it.height = u.height; }
              if (u.position)                   { it.position = u.position; }
              if (u.zIndex      !== undefined) { it.zIndex = u.zIndex; }
              if (u.visible     !== undefined) { it.visible = !!u.visible; }
              if (u.plainText   !== undefined) {
                it.text.type = "PLAIN";
                it.text.plainText = u.plainText;
              }

              if (u.fillColor || u.fillOpacity !== undefined) {
                it.style = { ...(it.style || {}) };
                if (u.fillColor)                 { it.style.fillColor   = u.fillColor; }
                if (u.fillOpacity !== undefined) { it.style.fillOpacity = u.fillOpacity; }
                if (u.strokeColor !== undefined) { it.style.strokeColor = u.strokeColor; }
                if (u.strokeWidth !== undefined) { it.style.strokeWidth = u.strokeWidth; }
              }
            } else {
              // TEXT: solo pos/zIndex/visibilità (no width/height/no fill)
              if (u.position)                   { it.position = u.position; }
              if (u.zIndex      !== undefined) { it.zIndex = u.zIndex; }
              if (u.visible     !== undefined) { it.visible = !!u.visible; }
              if (u.plainText   !== undefined) {
                it.text.type = "PLAIN";
                it.text.plainText = u.plainText;
              }
              it.text.style = {
                ...(it.text.style || {}),
                fontFamily: u.fontFamily ?? it.text.style?.fontFamily,
                fontSize: u.fontSize ?? it.text.style?.fontSize,
                fontWeight: u.fontWeight ?? it.text.style?.fontWeight,
                lineHeight: 1,
                textAlign: "CENTER",
                textAlignVertical: "MIDDLE",
                fillColor: u.fillColor ?? it.text.style?.fillColor,
                strokeColor: u.strokeColor ?? it.text.style?.strokeColor,
                strokeWidth: u.strokeWidth ?? it.text.style?.strokeWidth,
              };
            }
          }
        });
        updatedIds = new Set(finalIds);
      }
    }

    // La cache rappresenta soltanto aggiornamenti confermati da OBR.
    for (const candidate of candidates) {
      if (candidate.epoch !== _sceneEpoch) continue;
      if (_tokenRevision.get(candidate.tokenId) !== candidate.revision) continue;
      if (!updatedIds.has(candidate.bgId) || !updatedIds.has(candidate.fgId)) continue;
      _last.set(candidate.tokenId, candidate.sig);
      _barRefs.set(candidate.tokenId, {
        fgId: candidate.fgId,
        inner: candidate.inner,
        textId: candidate.textId,
        leftX: candidate.sig.leftX,
        topY: candidate.sig.topY,
        barW: candidate.sig.barW,
        barH: candidate.sig.barH,
      });
      if (!candidate.textId || !updatedIds.has(candidate.textId)) hpTextUpdates.push(candidate);
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
    console.warn("[hpbar] flush error:", e?.message || e);
    if (isCurrentSceneEpoch(operationEpoch)) {
      for (const [tokenId, pending] of entries) {
        if (pending.epoch !== _sceneEpoch) continue;
        const newer = _pending.get(tokenId);
        if (!newer || newer.revision < pending.revision) {
          _pending.set(tokenId, pending);
        }
      }
    }
  } finally {
    _flushing = false;
    if (_pending.size) scheduleFlush(0);
  }

  // Il testo segue le barre senza trattenere il lock del batch grafico.
  for (const { tokenId, hp, hpMax, revision, epoch } of hpTextUpdates) {
    if (epoch !== _sceneEpoch || _tokenRevision.get(tokenId) !== revision) continue;
    await syncHPTextNow(tokenId, hp, hpMax);
  }
}

/* ========= Entrypoint pubblico ========= */
function hasCanonicalHP(meta) {
  return !!meta && ((meta.hp ?? null) !== null || (meta.hpMax ?? null) !== null);
}

async function queueCanonicalHPItems() {
  const items = await OBR.scene.items.getItems();
  for (const item of items) {
    const meta = item.metadata?.[META_KEY];
    if (!hasCanonicalHP(meta)) continue;
    queueToken(item.id, Number(meta.hp) || 0, Number(meta.hpMax) || 0);
  }
  if (_flushT) clearTimeout(_flushT);
  _flushT = null;
  scheduleFlush(0);
}

export async function removeHPWidgetsBatchNow(tokenIds = []) {
  const targets = new Set(
    (Array.isArray(tokenIds) ? tokenIds : [tokenIds])
      .map((tokenId) => String(tokenId || "").trim())
      .filter(Boolean),
  );
  if (!targets.size) return;
  const epoch = _sceneEpoch;
  const pendingTexts = [];
  for (const tokenId of targets) {
    _pending.delete(tokenId);
    _fastFillPending.delete(tokenId);
    _last.delete(tokenId);
    _barRefs.delete(tokenId);
    _tokenRevision.set(tokenId, (_tokenRevision.get(tokenId) || 0) + 1);
    _textRevision.set(tokenId, (_textRevision.get(tokenId) || 0) + 1);
    const pendingText = _textQueues.get(tokenId);
    if (pendingText) pendingTexts.push(pendingText);
  }
  if (pendingTexts.length) await Promise.allSettled(pendingTexts);
  if (epoch !== _sceneEpoch) return;
  const widgets = await OBR.scene.items.getItems((item) => {
    const hpBarTargetId = item.metadata?.[HPBAR_META_FLAG]?.targetId;
    const hpTextTargetId = item.metadata?.[HPTEXT_META_FLAG]?.targetId;
    return targets.has(hpBarTargetId) || targets.has(hpTextTargetId);
  });
  if (epoch !== _sceneEpoch) return;
  if (widgets.length) await OBR.scene.items.deleteItems(widgets.map((item) => item.id));
}

export async function removeHPWidgetsNow(tokenId) {
  return removeHPWidgetsBatchNow([tokenId]);
}

export async function mountHPBars(){
  const { deferInitialSync = false } = arguments[0] || {};
  try {
    const role =
      (await OBR.player?.getRole?.()) ||
      (await OBR.room?.getRole?.()) || "PLAYER";
    IS_GM = String(role).toUpperCase() === "GM";
  } catch { IS_GM = false; }

  if (!deferInitialSync) {
    await waitForSceneReady();

    if (IS_GM) {
      const all = await OBR.scene.items.getItems();
      const oldShadows = all
        .filter(it => it.metadata?.[HPBAR_META_FLAG]?.kind === "shadow")
        .map(it => it.id);
      if (oldShadows.length) await OBR.scene.items.deleteItems(oldShadows);

      await queueCanonicalHPItems();
    }
  }

  if (!_readyListenerMounted) {
    _readyListenerMounted = true;
    OBR.scene.onReadyChange((ready) => {
      resetRuntimeState();
      if (!ready || !IS_GM) return;
      void queueCanonicalHPItems().catch((error) => {
        console.warn("[hpbar] scene ready sync error:", error?.message || error);
      });
    });
  }

  if (!_sceneItemListenerMounted) {
    _sceneItemListenerMounted = true;
    subscribeSceneItemChanges(({ items }) => {
      if (!IS_GM) return;
      for (const cur of items) {
        if (cur.metadata?.[HPBAR_META_FLAG]) continue;
        const m = cur.metadata?.[META_KEY];
        if (!hasCanonicalHP(m)) continue;
        queueToken(cur.id, Number(m.hp)||0, Number(m.hpMax)||0);
      }
    }, { filter: (event) => event.flags.hpBars });
  }
}

export async function syncInitialHPBars() {
  return mountHPBars();
}

export function syncHPBarNow(tokenId, hp, hpMax) {
  try {
    queueFastFill(tokenId, hp, hpMax);
    queueToken(tokenId, Number(hp) || 0, Number(hpMax) || 0);
    if (_flushT) clearTimeout(_flushT);
    _flushT = null;
    scheduleFlush(0);
  } catch {}
}

function hpTextIdentity(tokenId) {
  return `hptext|${tokenId}`;
}

function buildHPTextItem(spec) {
  return buildText()
    .plainText(spec.text)
    .textType("PLAIN")
    .fontFamily('"Helvetica Neue", Helvetica, Arial, sans-serif')
    .fontSize(HP_TEXT_FONT_SIZE)
    .fontWeight(700)
    .lineHeight(1)
    .textAlign("CENTER")
    .textAlignVertical("MIDDLE")
    .fillColor("#f8fafc")
    .strokeColor("rgba(2,6,23,0.9)")
    .strokeWidth(2)
    .position(spec.position)
    .layer("ATTACHMENT")
    .attachedTo(spec.tokenId)
    .locked(true)
    .disableHit(true)
    .disableAttachmentBehavior(["ROTATION","VISIBLE","COPY","SCALE"])
    .zIndex(spec.zIndex)
    .visible(spec.visible)
    .metadata({ [HPTEXT_META_FLAG]: { targetId: spec.tokenId } })
    .name("HP Text")
    .build();
}

function hpTextNeedsUpdate(item, spec) {
  return item.layer !== "ATTACHMENT"
    || item.attachedTo !== spec.tokenId
    || item.locked !== true
    || item.disableHit !== true
    || item.position?.x !== spec.position.x
    || item.position?.y !== spec.position.y
    || item.zIndex !== spec.zIndex
    || item.visible !== spec.visible
    || item.text?.plainText !== spec.text;
}

function applyHPTextSpec(item, spec) {
  item.layer = "ATTACHMENT";
  item.attachedTo = spec.tokenId;
  item.locked = true;
  item.disableHit = true;
  item.position = spec.position;
  item.zIndex = spec.zIndex;
  item.visible = spec.visible;
  if (!item.text) item.text = { type: "PLAIN", plainText: spec.text };
  item.text.type = "PLAIN";
  item.text.plainText = spec.text;
  item.text.style = {
    ...(item.text.style || {}),
    fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    fontSize: HP_TEXT_FONT_SIZE,
    fontWeight: 700,
    lineHeight: 1,
    textAlign: "CENTER",
    textAlignVertical: "MIDDLE",
    fillColor: "#f8fafc",
    strokeColor: "rgba(2,6,23,0.9)",
    strokeWidth: 2,
  };
  item.metadata = {
    ...(item.metadata || {}),
    [HPTEXT_META_FLAG]: { targetId: spec.tokenId },
  };
}

async function reconcileHPTextItem(spec, sceneEpoch, initialItems = null) {
  return reconcileOwnedSceneItems({
    desired: [{ ...spec, identity: hpTextIdentity(spec.tokenId) }],
    readItems: () => OBR.scene.items.getItems((item) => (
      item?.metadata?.[HPTEXT_META_FLAG]?.targetId === spec.tokenId
    )),
    identityOfItem: (item) => {
      const targetId = item?.metadata?.[HPTEXT_META_FLAG]?.targetId;
      return targetId ? hpTextIdentity(targetId) : "";
    },
    isCompatible: (item, desired) => (
      item.type === "TEXT"
      && item.attachedTo === desired.tokenId
    ),
    needsUpdate: hpTextNeedsUpdate,
    buildItem: buildHPTextItem,
    addItems: (items) => OBR.scene.items.addItems(items),
    updateItems: async (updates) => {
      const byId = new Map(updates.map(({ item, spec: desired }) => [item.id, desired]));
      await OBR.scene.items.updateItems([...byId.keys()], (items) => {
        for (const item of items) {
          const desired = byId.get(item.id);
          if (desired) applyHPTextSpec(item, desired);
        }
      });
    },
    deleteItems: (ids) => OBR.scene.items.deleteItems(ids),
    isCurrent: () => isCurrentSceneEpoch(sceneEpoch),
    initialItems,
  });
}

// Modifica
// Crea/aggiorna un item di TESTO "(HP/Max - %)" sopra le HPBAR.
// Usa il TextBuilder correttamente (plainText + metodi stile del builder).
async function syncHPTextAtRevision(tokenId, hp, hpMax, revision, epoch) {
  const sceneEpoch = currentSceneEpoch();
  try {
    await waitForSceneReady();
    if (epoch !== _sceneEpoch || _textRevision.get(tokenId) !== revision) return;

    const [token] = await OBR.scene.items.getItems([tokenId]);
    if (!token) return;

    const L = await computeBarLayout(tokenId);
    if (!L) return;
    const { leftX, topY, barH, tokenZ } = L;

    const textStr = hpTextValue(hp, hpMax);

    // Visibilità lato player (GM vede comunque anche se false)
    const att = getAttitude(token);
    const playerVisible = isPlayerVisibleAttitude(att);

    const pos = hpTextPosition(leftX, topY, L.barW, barH, textStr);
    const z   = (Number(tokenZ) || 0) + 1000;

    // dedup
    const all = await OBR.scene.items.getItems();
    if (epoch !== _sceneEpoch || _textRevision.get(tokenId) !== revision) return;
    const result = await reconcileHPTextItem({
      tokenId,
      text: textStr,
      position: pos,
      zIndex: z,
      visible: playerVisible,
    }, sceneEpoch, all.filter((item) => (
      item.metadata?.[HPTEXT_META_FLAG]?.targetId === tokenId
    )));
    const existing = result.itemsByIdentity.get(hpTextIdentity(tokenId)) || null;
    if (existing) rememberHPTextRef(tokenId, existing.id);
  } catch (error) {
    console.warn("[hptext] sync error:", error?.message || error);
    if (
      epoch === _sceneEpoch
      && _textRevision.get(tokenId) === revision
      && isCurrentSceneEpoch(sceneEpoch)
    ) {
      const recoveryTimer = setTimeout(() => {
        _recoveryTimers.delete(recoveryTimer);
        if (
          epoch === _sceneEpoch
          && _textRevision.get(tokenId) === revision
          && isCurrentSceneEpoch(sceneEpoch)
        ) {
          void syncHPTextNow(tokenId, hp, hpMax);
        }
      }, HP_WIDGET_RECOVERY_DELAY_MS);
      _recoveryTimers.add(recoveryTimer);
    }
  }
}

export function syncHPTextNow(tokenId, hp, hpMax) {
  const revision = (_textRevision.get(tokenId) || 0) + 1;
  const epoch = _sceneEpoch;
  _textRevision.set(tokenId, revision);

  const previous = _textQueues.get(tokenId) || Promise.resolve();
  const run = previous
    .catch(() => {})
    .then(() => syncHPTextAtRevision(tokenId, hp, hpMax, revision, epoch));
  const tracked = run.finally(() => {
    if (_textQueues.get(tokenId) === tracked) _textQueues.delete(tokenId);
  });
  _textQueues.set(tokenId, tracked);
  return tracked;
}

// Aggiornamento affidabile per operazioni multi-target: risolve le label dalla
// scena corrente e le modifica con un solo batch composto esclusivamente da TextItem.
export async function syncHPTextBatchNow(updates = []) {
  const valuesByToken = new Map();
  for (const update of updates) {
    const tokenId = String(update?.tokenId || "");
    if (!tokenId) continue;
    valuesByToken.set(tokenId, {
      hp: Number(update.hp) || 0,
      hpMax: Number(update.hpMax) || 0,
    });
  }
  if (!valuesByToken.size) return;

  const epoch = _sceneEpoch;
  // Invalida eventuali aggiornamenti testuali più vecchi ancora in coda.
  for (const tokenId of valuesByToken.keys()) {
    _textRevision.set(tokenId, (_textRevision.get(tokenId) || 0) + 1);
  }

  await waitForSceneReady();
  if (epoch !== _sceneEpoch) return;

  const sceneItems = await OBR.scene.items.getItems();
  if (epoch !== _sceneEpoch) return;

  const textIds = [];
  const foundTargets = new Set();
  const textCountsByTarget = new Map();
  for (const item of sceneItems) {
    const targetId = item.metadata?.[HPTEXT_META_FLAG]?.targetId;
    if (!valuesByToken.has(targetId)) continue;
    textIds.push(item.id);
    foundTargets.add(targetId);
    textCountsByTarget.set(targetId, (textCountsByTarget.get(targetId) || 0) + 1);
    rememberHPTextRef(targetId, item.id);
  }

  if (textIds.length) {
    try {
      await OBR.scene.items.updateItems(Array.from(new Set(textIds)), (items) => {
        for (const item of items) {
          const targetId = item.metadata?.[HPTEXT_META_FLAG]?.targetId;
          const value = valuesByToken.get(targetId);
          if (!value) continue;
          const plainText = hpTextValue(value.hp, value.hpMax);
          if (!item.text) item.text = { type: "PLAIN", plainText };
          item.text.type = "PLAIN";
          item.text.plainText = plainText;
        }
      });
    } catch {
      await Promise.all([...valuesByToken].map(([tokenId, value]) =>
        syncHPTextNow(tokenId, value.hp, value.hpMax)
      ));
      return;
    }
  }

  // Il fallback convergente crea le label mancanti e compatta i duplicati.
  const missing = Array.from(valuesByToken.entries())
    .filter(([tokenId]) => (
      !foundTargets.has(tokenId)
      || (textCountsByTarget.get(tokenId) || 0) !== 1
    ));
  await Promise.all(missing.map(([tokenId, value]) =>
    syncHPTextNow(tokenId, value.hp, value.hpMax)
  ));
}
