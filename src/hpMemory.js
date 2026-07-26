// hpMemory.js
import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { subscribeSceneItemChanges } from "./sceneItemEvents.js";
import { reconcileZeroHPConditionsForItems } from "./hpConditionAutomation.js";

let __attSubMounted = false;        // evita doppie subscribe
let __attScanTimer = null;          // debounce per la scansione attitude
let __hpApplyTimer = null;
let __hpApplyBusy = false; // evita loop quando noi stessi scriviamo hp
let __roomHPWriteQueue = Promise.resolve();
let __roomHPFallbackWarned = false;

const ROOM_HP_KEY = `${ID}/hpMemory`; // mappa: { "<name>||<portrait>": { hp, hpMax, t } }
const LOCAL_HP_KEY = `${ID}/hpMemory/local`;
const META_KEY = `${ID}/meta`;      // stesso namespace usato nel plugin

// ——— helper: normalizza il "nome base" rimuovendo tutti i prefissi "(n) "
function baseName(raw) {
  const s = String(raw || "Unnamed").trim();
  return s.replace(/^(\(\d+\)\s*)+/, "").trim();
}

// ——— chiave stabile per un PG: baseName + portrait url
function portraitUrlFromItem(item) {
  return String(
    item?.image?.url ||
    item?.image?.src ||
    item?.image?.href ||
    item?.asset?.image?.url ||
    item?.asset?.image?.src ||
    item?.asset?.image?.href ||
    item?.asset?.url ||
    item?.asset?.src ||
    item?.data?.src ||
    item?.src ||
    ""
  ).trim();
}

function memoryKeyFromItem(item) {
  return `${baseName(item?.name)}||${portraitUrlFromItem(item)}`;
}

function pcKeyFromItem(item) {
  if (!item) return null;
  const meta = item.metadata?.[META_KEY] || {};
  // Il tracker tratta un token in iniziativa senza attitude esplicita come Ally.
  // Manteniamo lo stesso fallback anche per la memoria HP; le attitude esplicite
  // (enemy/neutral) continuano invece a essere escluse.
  const att = String(meta.attitude || (meta.inInitiative === true ? "ally" : ""))
    .trim()
    .toLowerCase();
  if (att !== "pc" && att !== "ally") return null; // memorizziamo personaggi e alleati
  return memoryKeyFromItem(item);
}

function normalizeHPMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const normalized = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!key || !entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    normalized[key] = { ...entry };
  }
  return normalized;
}

function hpMemoryTimestamp(entry) {
  return Math.max(
    Math.max(0, Number(entry?.t) || 0),
    Math.max(0, Number(entry?.tAtt) || 0)
  );
}

function mergeHPMaps(...sources) {
  const merged = {};
  for (const source of sources) {
    for (const [key, entry] of Object.entries(normalizeHPMap(source))) {
      const current = merged[key];
      if (!current || hpMemoryTimestamp(entry) >= hpMemoryTimestamp(current)) {
        merged[key] = entry;
      }
    }
  }
  return merged;
}

function readLocalHPMap() {
  try {
    if (typeof localStorage === "undefined") return {};
    return normalizeHPMap(JSON.parse(localStorage.getItem(LOCAL_HP_KEY) || "{}"));
  } catch {
    return {};
  }
}

function writeLocalHPMap(map) {
  try {
    if (typeof localStorage === "undefined") return false;
    localStorage.setItem(LOCAL_HP_KEY, JSON.stringify(normalizeHPMap(map)));
    return true;
  } catch {
    return false;
  }
}

// ——— lettura/scrittura su Room metadata
async function readRoomHPMap() {
  const md = await OBR.room.getMetadata().catch(() => ({}));
  return mergeHPMaps(readLocalHPMap(), md?.[ROOM_HP_KEY]);
}
async function writeRoomHPMap(updater) {
  const write = async () => {
    const md = await OBR.room.getMetadata().catch(() => ({}));
    const prev = mergeHPMaps(readLocalHPMap(), md?.[ROOM_HP_KEY]);
    const next = (typeof updater === "function") ? updater({ ...prev }) : { ...prev, ...(updater || {}) };
    const normalizedNext = normalizeHPMap(next);
    const localWritten = writeLocalHPMap(normalizedNext);
    try {
      // setMetadata fa già merge con gli altri metadata della Room.
      await OBR.room.setMetadata({ [ROOM_HP_KEY]: normalizedNext });
      __roomHPFallbackWarned = false;
    } catch (error) {
      if (!localWritten) throw error;
      if (!__roomHPFallbackWarned) {
        __roomHPFallbackWarned = true;
        console.warn("[hpMemory] Room metadata unavailable or full; using local fallback:", error?.message || error);
      }
    }
    return normalizedNext;
  };

  // La scansione attitude e il salvataggio HP possono partire quasi insieme.
  // Serializzare il read-modify-write evita di perdere uno dei due aggiornamenti.
  const result = __roomHPWriteQueue.then(write, write);
  __roomHPWriteQueue = result.catch(() => {});
  return result;
}

async function persistRemovedHPItems(items = []) {
  const snapshots = [];
  for (const item of items) {
    const key = pcKeyFromItem(item);
    if (!key) continue;

    const meta = item.metadata?.[META_KEY] || {};
    const hp = Number(meta.hp);
    const hpMax = Number(meta.hpMax);
    if (!Number.isFinite(hp) || !Number.isFinite(hpMax) || hpMax <= 0) continue;

    snapshots.push({
      key,
      hp: Math.max(0, Math.floor(hp)),
      hpMax: Math.max(0, Math.floor(hpMax)),
      attitude: meta.attitude || null,
    });
  }
  if (!snapshots.length) return;

  await writeRoomHPMap((map) => {
    const savedAt = Date.now();
    for (const snapshot of snapshots) {
      const previous = map[snapshot.key] && typeof map[snapshot.key] === "object"
        ? map[snapshot.key]
        : {};
      map[snapshot.key] = {
        ...previous,
        hp: snapshot.hp,
        hpMax: snapshot.hpMax,
        attitude: snapshot.attitude,
        t: savedAt,
      };
    }
    return map;
  });
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
    const key = memoryKeyFromItem(it);

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
        attitude: String(payload.attitude || "").trim().toLowerCase(),
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
      subscribeSceneItemChanges(async (event) => {
        try {
          await persistRemovedHPItems(event.removedItems);
        } catch (err) {
          console.warn("[hpMemory] removed item save failed:", err?.message || err);
        }
        scheduleAttitudeRescan(120); // debounce breve: 120ms
      }, { filter: (event) => event.flags.hpMemory });
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
  const att  = String(item.metadata?.[META_KEY]?.attitude || "").trim().toLowerCase() || null;

  await writeRoomHPMap((m) => {
    const previous = m[key] && typeof m[key] === "object" ? m[key] : {};
    m[key] = { ...previous, hp: nHP, hpMax: nMax, attitude: att, t: Date.now() };
    return m;
  });
}

// ——— All’avvio della lista: riempi HP mancanti dei PG da memoria (senza toccare i mostri)
export async function removeHPFromMemoryByItemId(itemId) {
  const [item] = await OBR.scene.items.getItems([itemId]);
  if (!item) return;
  const key = pcKeyFromItem(item);
  if (!key) return;

  await writeRoomHPMap((map) => {
    delete map[key];
    return map;
  });
}

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

      const key = memoryKeyFromItem(it);

      const memo = map[key];
      if (!memo) continue;

      const nHP  = Math.max(0, Math.floor(Number(memo.hp)    || 0));
      const nMax = Math.max(0, Math.floor(Number(memo.hpMax) || 0));
      targets.push({ id: it.id, hp: nHP, hpMax: nMax, attitude: memo.attitude });
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
    await reconcileZeroHPConditionsForItems(targets.map((target) => target.id));

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
