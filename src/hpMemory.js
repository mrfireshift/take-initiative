// hpMemory.js
import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./contextMenu";

let __attSubMounted = false;        // evita doppie subscribe
let __attScanTimer = null;          // debounce per la scansione attitude
let __hpApplyTimer = null;
let __hpApplyBusy = false; // evita loop quando noi stessi scriviamo hp

const ROOM_HP_KEY = `${ID}/hpMemory`; // mappa: { "<name>||<portrait>": { hp, hpMax, t } }
const META_KEY = `${ID}/meta`;      // stesso namespace usato nel plugin

// ——— helper: normalizza il "nome base" rimuovendo tutti i prefissi "(n) "
function baseName(raw) {
  const s = String(raw || "Unnamed").trim();
  return s.replace(/^(\(\d+\)\s*)+/, "").trim();
}

// ——— chiave stabile per un PG: baseName + portrait url
function pcKeyFromItem(item) {
  if (!item) return null;
  const att = item.metadata?.[`${ID}/meta`]?.attitude;
  if (att !== "pc") return null; // memorizziamo solo i personaggi
  const nm = baseName(item.name);
  // portrait robusto (copre le varianti usate nel progetto)
  let url = null;
  const img = item.image || item;
  url = img?.url || img?.src || img?.href || item?.data?.src || null;
  return `${nm}||${url || ""}`;
}

// ——— lettura/scrittura su Room metadata
async function readRoomHPMap() {
  const md = await OBR.room.getMetadata();
  const obj = md?.[ROOM_HP_KEY];
  return (obj && typeof obj === "object") ? obj : {};
}
async function writeRoomHPMap(updater) {
  const md = await OBR.room.getMetadata();
  const prev = (md?.[ROOM_HP_KEY] && typeof md[ROOM_HP_KEY] === "object") ? md[ROOM_HP_KEY] : {};
  const next = (typeof updater === "function") ? updater({ ...prev }) : { ...prev, ...(updater || {}) };
  await OBR.room.setMetadata({ ...md, [ROOM_HP_KEY]: next });
  return next;
}

// Debounce per la scansione delle attitude correnti in scena
function scheduleAttitudeRescan(delay = 120) {
  if (__attScanTimer) clearTimeout(__attScanTimer);
  __attScanTimer = setTimeout(() => {
    rescanAndPersistAttitudes().catch(() => {});
  }, delay);
}

// Legge tutti gli item, prende l'attitude presente e la salva come "ultima" in room
async function rescanAndPersistAttitudes() {
  const items = await OBR.scene.items.getItems();
  if (!items || !items.length) return;

  const updates = new Map(); // key -> {attitude}
  for (const it of items) {
    const meta = it.metadata?.[META_KEY] || {};
    const att = meta?.attitude;
    if (!att || typeof att !== "string" || !att.trim()) continue;

    // Chiave per identità visiva (nome base + portrait) — non filtriamo per "pc":
    const nm = String(it.name || "").trim().replace(/^(\(\d+\)\s*)+/, "").trim();
    const url = it?.image?.url || it?.image?.src || it?.image?.href || it?.data?.src || "";
    const key = `${nm}||${url}`;

    if (!key) continue;
    updates.set(key, { attitude: att.trim() });
  }

  if (updates.size === 0) return;

  await writeRoomHPMap((m) => {
    for (const [key, payload] of updates) {
      const prev = (m[key] && typeof m[key] === "object") ? m[key] : {};
      // preserva hp/hpMax se già memorizzati; aggiorna SEMPRE attitude e timestamp dedicato
      m[key] = {
        ...prev,
        attitude: payload.attitude,
        tAtt: Date.now(),
      };
    }
    return m;
  });
}

// ——— API: chiamala una volta in onReady (facoltativa ma pulita)
export async function initHPMemory() {
  // best-effort: assicura che la struttura esista
  await writeRoomHPMap(m => m);

  // Monta una sola volta un watcher che aggiorna SEMPRE l'ultima attitude
  if (!__attSubMounted) {
    __attSubMounted = true;
    try {
      OBR.scene.items.onChange(() => {
        scheduleAttitudeRescan(120); // debounce breve: 120ms
      });
    } catch (err) {
      console.warn("[hpMemory] attitude watcher subscribe failed:", err?.message || err);
    }
  }

  // prima scansione all'avvio (copre lo stato attuale)
  scheduleAttitudeRescan(0);
}

// ——— Salva nella memoria gli HP dell’item se è un PG
export async function saveHPToMemoryByItemId(itemId, hp, hpMax) {
  const [item] = await OBR.scene.items.getItems([itemId]);
  if (!item) return;
  const key = pcKeyFromItem(item);
  if (!key) return; // non è un PG → ignora

  const nHP  = Math.max(0, Math.floor(Number(hp)    || 0));
  const nMax = Math.max(0, Math.floor(Number(hpMax) || 0));
  const att  = item.metadata?.[`${ID}/meta`]?.attitude || null;

  await writeRoomHPMap((m) => {
    m[key] = { hp: nHP, hpMax: nMax, attitude: att, t: Date.now() };
    return m;
  });
}

// ——— All’avvio della lista: riempi HP mancanti dei PG da memoria (senza toccare i mostri)
export async function applyHPMemoryToSceneForMissingHP() {
  if (__hpApplyBusy) return;
  __hpApplyBusy = true;
  try {
    const map = await readRoomHPMap();
    if (!Object.keys(map).length) return;

    const all = await OBR.scene.items.getItems();
    const targets = [];

    for (const it of all) {
      const meta = it.metadata?.[`${ID}/meta`] || {};
      const hasHP = (meta.hp ?? null) != null || (meta.hpMax ?? null) != null;
      if (hasHP) continue;

      const nm = String(it.name || "").trim().replace(/^(\(\d+\)\s*)+/, "").trim();
      let url = it?.image?.url || it?.image?.src || it?.image?.href || it?.data?.src || "";
      const key = `${nm}||${url}`;

      const memo = map[key];
      if (!memo) continue;

      const nHP  = Math.max(0, Math.floor(Number(memo.hp)    || 0));
      const nMax = Math.max(0, Math.floor(Number(memo.hpMax) || 0));
      const clampedHP = (nMax > 0) ? Math.min(nHP, nMax) : nHP;

      targets.push({ id: it.id, hp: clampedHP, hpMax: nMax, attitude: memo.attitude });
    }

    if (!targets.length) return;

    await OBR.scene.items.updateItems(targets.map(t => t.id), (list) => {
  for (const it of list) {
    const t = targets.find(x => x.id === it.id);
    if (!t) continue;

    // Meta esistente del plugin
    const prev = it.metadata?.[`${ID}/meta`] || {};

    // Base: aggiorna sempre HP/HPMax
    const nextMeta = {
      ...prev,
      hp: t.hp,
      hpMax: t.hpMax,
    };

    // NEW: ripristina attitude solo se NON c'è già sul token
    // e solo se in memoria è disponibile (t.attitude valorizzata)
    if ((prev.attitude == null || prev.attitude === "") && t.attitude) {
      nextMeta.attitude = t.attitude;
    }

    it.metadata = {
      ...(it.metadata || {}),
      [`${ID}/meta`]: nextMeta,
    };
  }
});

    try {
      const { syncHPBarNow } = await import("./hpbar-items.js");
      for (const t of targets) syncHPBarNow(t.id, t.hp, t.hpMax);
    } catch {}
  } finally {
    __hpApplyBusy = false;
  }
}

export function scheduleHPMemoryAutofill(delay = 150) {
  if (__hpApplyTimer) clearTimeout(__hpApplyTimer);
  __hpApplyTimer = setTimeout(() => {
    applyHPMemoryToSceneForMissingHP().catch(() => {});
  }, delay);
}