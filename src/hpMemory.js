// hpMemory.js
import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { subscribeSceneItemChanges } from "./sceneItemEvents.js";
import { reconcileZeroHPConditionsForItems } from "./hpConditionAutomation.js";
import {
  currentSceneEpoch,
  isCurrentSceneEpoch,
  subscribeSceneEpoch,
} from "./sceneEpoch.js";
import { createSceneEpochTimer } from "./sceneEpochTimerCore.js";
import {
  METADATA_OWNERSHIP,
  writeRoomMetadataKey,
} from "./metadataKeyScoped.js";

let __attSubMounted = false;        // evita doppie subscribe
let __hpApplyBusyEpoch = null;
let __roomHPWriteQueue = Promise.resolve();
let __roomHPFallbackWarned = false;

const ROOM_HP_KEY = `${ID}/hpMemory`; // mappa: { "<name>||<portrait>": { hp, hpMax, t } }
const LOCAL_HP_KEY = `${ID}/hpMemory/local`;
const META_KEY = `${ID}/meta`;      // stesso namespace usato nel plugin

const __attitudeRescanTimer = createSceneEpochTimer({
  isCurrent: isCurrentSceneEpoch,
});
const __hpAutofillTimer = createSceneEpochTimer({
  isCurrent: isCurrentSceneEpoch,
});

subscribeSceneEpoch(({ phase }) => {
  if (phase !== "unload") return;
  __attitudeRescanTimer.cancel();
  __hpAutofillTimer.cancel();
});

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
async function readRoomHPMap(sceneEpoch = currentSceneEpoch()) {
  if (!isCurrentSceneEpoch(sceneEpoch)) return {};
  const md = await OBR.room.getMetadata().catch(() => ({}));
  if (!isCurrentSceneEpoch(sceneEpoch)) return {};
  return mergeHPMaps(readLocalHPMap(), md?.[ROOM_HP_KEY]);
}
async function writeRoomHPMap(updater, { sceneEpoch = currentSceneEpoch() } = {}) {
  if (!isCurrentSceneEpoch(sceneEpoch)) return {};
  const write = async () => {
    if (!isCurrentSceneEpoch(sceneEpoch)) return {};
    const md = await OBR.room.getMetadata().catch(() => ({}));
    if (!isCurrentSceneEpoch(sceneEpoch)) return {};
    const prev = mergeHPMaps(readLocalHPMap(), md?.[ROOM_HP_KEY]);
    const next = (typeof updater === "function") ? updater({ ...prev }) : { ...prev, ...(updater || {}) };
    const normalizedNext = normalizeHPMap(next);
    if (!isCurrentSceneEpoch(sceneEpoch)) return {};
    const localWritten = writeLocalHPMap(normalizedNext);
    try {
      // setMetadata fa già merge con gli altri metadata della Room.
      if (!isCurrentSceneEpoch(sceneEpoch)) return normalizedNext;
      // Il writer invia soltanto la chiave di memoria Room posseduta.
      await writeRoomMetadataKey(
        OBR.room,
        METADATA_OWNERSHIP.ROOM_MEMORY,
        normalizedNext,
        { runtime: "hpMemory" },
      );
      if (!isCurrentSceneEpoch(sceneEpoch)) return normalizedNext;
      __roomHPFallbackWarned = false;
    } catch (error) {
      if (!isCurrentSceneEpoch(sceneEpoch)) return normalizedNext;
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

async function persistRemovedHPItems(items = [], sceneEpoch = currentSceneEpoch()) {
  if (!isCurrentSceneEpoch(sceneEpoch)) return;
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

  if (!isCurrentSceneEpoch(sceneEpoch)) return;
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
  }, { sceneEpoch });
}

// Debounce per la scansione delle attitude correnti in scena
function scheduleAttitudeRescan(delay = 120, sceneEpoch = currentSceneEpoch()) {
  __attitudeRescanTimer.schedule(sceneEpoch, delay, (epoch) =>
    rescanAndPersistAttitudes(epoch).catch(() => {})
  );
}

// Legge tutti gli item, prende l'attitude presente e la salva come "ultima" in room
async function rescanAndPersistAttitudes(sceneEpoch = currentSceneEpoch()) {
  if (!isCurrentSceneEpoch(sceneEpoch)) return;
  const items = await OBR.scene.items.getItems();
  if (!isCurrentSceneEpoch(sceneEpoch)) return;
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

  if (!isCurrentSceneEpoch(sceneEpoch)) return;
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
  }, { sceneEpoch });
}

// ——— API: chiamala una volta in onReady (facoltativa ma pulita)
export async function initHPMemory() {
  const sceneEpoch = currentSceneEpoch();
  if (!isCurrentSceneEpoch(sceneEpoch)) return;
  // best-effort: assicura che la struttura esista
  await writeRoomHPMap(m => m, { sceneEpoch });
  if (!isCurrentSceneEpoch(sceneEpoch)) return;

  // Monta una sola volta un watcher che aggiorna SEMPRE l'ultima attitude
  if (!__attSubMounted) {
    __attSubMounted = true;
    try {
      subscribeSceneItemChanges(async (event) => {
        const eventEpoch = event?.sceneEpoch ?? currentSceneEpoch();
        if (!isCurrentSceneEpoch(eventEpoch)) return;
        try {
          await persistRemovedHPItems(event.removedItems, eventEpoch);
        } catch (err) {
          console.warn("[hpMemory] removed item save failed:", err?.message || err);
        }
        if (!isCurrentSceneEpoch(eventEpoch)) return;
        scheduleAttitudeRescan(120, eventEpoch); // debounce breve: 120ms
      }, { filter: (event) => event.flags.hpMemory });
    } catch (err) {
      console.warn("[hpMemory] attitude watcher subscribe failed:", err?.message || err);
    }
  }

  // prima scansione all'avvio (copre lo stato attuale)
  scheduleAttitudeRescan(0, sceneEpoch);
}

// ——— Salva nella memoria gli HP dell’item se è un PG
export async function saveHPToMemoryByItemId(
  itemId,
  hp,
  hpMax,
  { sceneEpoch = currentSceneEpoch() } = {},
) {
  if (!isCurrentSceneEpoch(sceneEpoch)) return;
  const [item] = await OBR.scene.items.getItems([itemId]);
  if (!isCurrentSceneEpoch(sceneEpoch)) return;
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
  }, { sceneEpoch });
}

// ——— All’avvio della lista: riempi HP mancanti dei PG da memoria (senza toccare i mostri)
export async function removeHPFromMemoryByItemId(
  itemId,
  { sceneEpoch = currentSceneEpoch() } = {},
) {
  if (!isCurrentSceneEpoch(sceneEpoch)) return;
  const [item] = await OBR.scene.items.getItems([itemId]);
  if (!isCurrentSceneEpoch(sceneEpoch)) return;
  if (!item) return;
  const key = pcKeyFromItem(item);
  if (!key) return;

  await writeRoomHPMap((map) => {
    delete map[key];
    return map;
  }, { sceneEpoch });
}

export async function applyHPMemoryToSceneForMissingHP(sceneEpoch = currentSceneEpoch()) {
  if (!isCurrentSceneEpoch(sceneEpoch)) return;
  if (__hpApplyBusyEpoch === sceneEpoch) return;
  __hpApplyBusyEpoch = sceneEpoch;
  try {
    const map = await readRoomHPMap(sceneEpoch);
    if (!isCurrentSceneEpoch(sceneEpoch)) return;
    if (!Object.keys(map).length) return;

    const all = await OBR.scene.items.getItems();
    if (!isCurrentSceneEpoch(sceneEpoch)) return;
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

    if (!isCurrentSceneEpoch(sceneEpoch)) return;
    await OBR.scene.items.updateItems(targets.map(t => t.id), (list) => {
  if (!isCurrentSceneEpoch(sceneEpoch)) return;
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
    if (!isCurrentSceneEpoch(sceneEpoch)) return;
    await reconcileZeroHPConditionsForItems(
      targets.map((target) => target.id),
      { sceneEpoch },
    );
    if (!isCurrentSceneEpoch(sceneEpoch)) return;

    try {
      const { syncHPBarNow } = await import("./hpbar-items.js");
      if (!isCurrentSceneEpoch(sceneEpoch)) return;
      for (const t of targets) syncHPBarNow(t.id, t.hp, t.hpMax);
    } catch {}
  } finally {
    if (__hpApplyBusyEpoch === sceneEpoch) __hpApplyBusyEpoch = null;
  }
}

export function scheduleHPMemoryAutofill(delay = 150, sceneEpoch = currentSceneEpoch()) {
  __hpAutofillTimer.schedule(sceneEpoch, delay, (epoch) =>
    applyHPMemoryToSceneForMissingHP(epoch).catch(() => {})
  );
}
