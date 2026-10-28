// Aree che crollano (Auril, Hand Slam): un'immagine sul livello Props al centro dell'area colpita, sostituita
// quando l'area crolla alla fine del round successivo. Dati puri: il runtime costruisce l'immagine da questa
// spec e il controller in background calcola lo stadio dal round, senza leggere il testo dell'abilità.
import { ID } from "./constants.js";

export const BOSS_COLLAPSE_ITEM_KEY = `${ID}/bossCollapse`;

// Per boss e azione: le immagini sono quadrate (1000 px) e coprono `cells` caselle di diametro, bordo compreso
// (raggio 20 ft = 8 caselle, più una casella di bordo per lato).
const BOSS_COLLAPSE_MARKERS = Object.freeze({
  "auril:hand-slam": Object.freeze({
    name: "Hand Slam",
    pixels: 1000,
    cells: 10,
    collapseAfterRounds: 1,
    assets: Object.freeze({
      cracked: "/boss-auril-hand-slam-cracked.webp",
      collapsed: "/boss-auril-hand-slam-collapsed.webp",
    }),
  }),
});

export const BOSS_COLLAPSE_STAGES = Object.freeze(["cracked", "collapsed"]);

function markerKey(bossDefinitionId, actionId) {
  return `${String(bossDefinitionId || "").trim()}:${String(actionId || "").trim()}`;
}

export function bossCollapseMarker(profile, action) {
  return BOSS_COLLAPSE_MARKERS[markerKey(profile?.bossDefinitionId, action?.id)] || null;
}

function finitePoint(value) {
  const x = Number(value?.x), y = Number(value?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function roundNumber(value) {
  const round = Number(value);
  return Number.isInteger(round) && round >= 1 ? round : null;
}

export function bossCollapseItemId(actionInstanceId) {
  const id = String(actionInstanceId || "").trim();
  return id ? `${id}:collapse` : "";
}

// L'area crolla alla fine del round successivo: con Hand Slam nel round N, dal round N + 2 in poi.
// Senza round (fuori combattimento) l'area resta incrinata finché il GM non la rimuove.
// Un'area fissata (settled: il combattimento è stato svuotato) resta allo stadio che aveva: il round 1 di Svuota o di
// un nuovo combattimento non la fa tornare incrinata. «Turno precedente» durante il combattimento sì.
export function bossCollapseStage(record, round) {
  if (record?.settled === true && BOSS_COLLAPSE_STAGES.includes(record.stage)) return record.stage;
  const castRound = roundNumber(record?.round);
  const current = roundNumber(round);
  const after = Math.max(0, Math.floor(Number(record?.collapseAfterRounds) || 0));
  return castRound !== null && current !== null && current > castRound + after ? "collapsed" : "cracked";
}

// L'immagine di un'azione eseguita: centro dell'area, ID derivato dall'azione (un nuovo invio non la duplica).
export function bossCollapseMarkerSpec({ profile, action, sourceId, actionInstanceId, round, center } = {}) {
  const marker = bossCollapseMarker(profile, action);
  const position = finitePoint(center);
  const id = bossCollapseItemId(actionInstanceId);
  const source = String(sourceId || "").trim();
  if (!marker || !position || !id || !source) return null;
  const record = {
    sourceId: source,
    bossDefinitionId: String(profile.bossDefinitionId),
    actionId: String(action.id),
    actionInstanceId: String(actionInstanceId),
    round: roundNumber(round),
    collapseAfterRounds: marker.collapseAfterRounds,
    stage: "cracked",
  };
  return {
    id,
    name: `${marker.name} · area`,
    position,
    pixels: marker.pixels,
    cells: marker.cells,
    asset: marker.assets.cracked,
    metadata: { [BOSS_COLLAPSE_ITEM_KEY]: record },
  };
}

export function bossCollapseAsset(record, stage) {
  const marker = BOSS_COLLAPSE_MARKERS[markerKey(record?.bossDefinitionId, record?.actionId)];
  return marker?.assets?.[stage] || "";
}

// Le immagini da aggiornare per il round corrente: solo quelle il cui stadio è cambiato.
// inCombat false (ordine svuotato): ogni area non ancora fissata viene fissata allo stadio che ha.
export function bossCollapseUpdates(items, round, { inCombat = true } = {}) {
  const updates = [];
  for (const item of Array.isArray(items) ? items : []) {
    const record = item?.metadata?.[BOSS_COLLAPSE_ITEM_KEY];
    if (!item?.id || !record || typeof record !== "object") continue;
    if (!inCombat) {
      const stage = BOSS_COLLAPSE_STAGES.includes(record.stage) ? record.stage : "cracked";
      const asset = bossCollapseAsset(record, stage);
      if (asset && record.settled !== true) updates.push({ id: item.id, stage, asset, settled: true });
      continue;
    }
    const stage = bossCollapseStage(record, round);
    const asset = bossCollapseAsset(record, stage);
    if (!asset || record.stage === stage) continue;
    updates.push({ id: item.id, stage, asset });
  }
  return updates;
}
