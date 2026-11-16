// Trasformazioni, lotto W4b (docs/PIANO_TRASFORMAZIONI.md, decisione G36): in the GM's background, the token takes the
// size of its form and gets its own back (transformationTokenSizeCore.js). It listens to the pills only ("effects"), not
// to the tokens' scale: a token the GM resizes by hand is left alone. One write for all the tokens; a token moved to fit
// the grid is relocated, not walked (the speed check charges nothing). Outside the History, as the monsters' size: an Undo
// that takes the pill away brings the size back through this same pass.
// 16/11/2026: the form's portrait on the token too (setTokenPortrait keeps its footprint), and its own image back.
import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { suppressMovementHistory } from "./history.js";
import { isCurrentSceneEpoch, currentSceneEpoch } from "./sceneEpoch.js";
import { subscribeSceneItemChanges } from "./sceneItemEvents.js";
import { setTokenCells, tokenCells, tokenCentreSnap } from "./tokenSizeCore.js";
import { setTokenPortrait } from "./tokenPortraitCore.js";
import { TRANSFORMATION_TOKEN_BEFORE_FIELD, planTransformationTokenSizes } from "./transformationTokenSizeCore.js";

const META_KEY = `${ID}/meta`;
let mounted = false;
let unsubscribe = null;
let running = null;
let again = false;

function samePoint(left, right) {
  return Number(left?.x) === Number(right?.x) && Number(left?.y) === Number(right?.y);
}

// The token's own image and its grid, as the field kept them.
function restoreTokenImage(draft, saved) {
  if (!draft.image || !saved?.image || !saved.grid) return;
  draft.image = { ...draft.image, url: saved.image.url, mime: saved.image.mime, width: saved.image.width, height: saved.image.height };
  draft.grid = { ...(draft.grid || {}), dpi: saved.grid.dpi, ...(saved.grid.offset ? { offset: { ...saved.grid.offset } } : {}) };
}

async function reconcileOnce(sceneEpoch) {
  const items = await OBR.scene.items.getItems();
  if (!isCurrentSceneEpoch(sceneEpoch)) return;
  const { resize, restore, portrait } = planTransformationTokenSizes(items, META_KEY);
  if (!resize.length && !restore.length && !portrait.length) return;
  const byId = new Map(items.map((item) => [item.id, item]));
  const resizes = new Map(resize.map((entry) => [entry.id, entry]));
  const restores = new Map(restore.map((entry) => [entry.id, entry]));
  const portraits = new Map(portrait.map((entry) => [entry.id, entry]));
  // Where each token's centre belongs with its new size (an even size on a corner, an odd one in a square).
  const positions = new Map();
  for (const id of [...resizes.keys(), ...restores.keys()]) {
    const item = byId.get(id);
    const scale = restores.get(id)?.scale;
    const cells = resizes.get(id)?.cells || (scale ? tokenCells({ ...item, scale }) : 0);
    if (!cells) continue;
    const { useCorners, useCenter } = tokenCentreSnap(cells);
    const snapped = await OBR.scene.grid.snapPosition(item.position, 1, useCorners, useCenter).catch(() => null);
    if (Number.isFinite(snapped?.x) && Number.isFinite(snapped?.y) && !samePoint(snapped, item.position)) positions.set(id, snapped);
  }
  if (!isCurrentSceneEpoch(sceneEpoch)) return;
  for (const [id, position] of positions) suppressMovementHistory(id, position, 5000, { relocation: true });
  const ids = [...new Set([...resizes.keys(), ...restores.keys(), ...portraits.keys()])];
  await OBR.scene.items.updateItems(ids, (drafts) => {
    for (const draft of drafts) {
      const meta = draft.metadata?.[META_KEY] && typeof draft.metadata[META_KEY] === "object" ? draft.metadata[META_KEY] : {};
      const grow = resizes.get(draft.id);
      const back = restores.get(draft.id);
      const wear = portraits.get(draft.id);
      // The portrait first: it keeps the token's cells, which the size then sets.
      const worn = wear?.portrait ? setTokenPortrait(draft, wear.portrait) : false;
      if (wear?.image) restoreTokenImage(draft, wear);
      const grown = grow ? setTokenCells(draft, grow.cells) : false;
      // What the token had, kept with its first change: never a portrait worn without it.
      const before = grown || worn ? (grow?.before || wear?.before || null) : null;
      if (before) draft.metadata[META_KEY] = { ...meta, [TRANSFORMATION_TOKEN_BEFORE_FIELD]: before };
      if (back) {
        if (back.image) restoreTokenImage(draft, back);
        if (back.scale) draft.scale = { x: back.scale.x, y: back.scale.y };
        const { [TRANSFORMATION_TOKEN_BEFORE_FIELD]: _gone, ...rest } = meta;
        draft.metadata[META_KEY] = rest;
      }
      const position = positions.get(draft.id);
      if (position) draft.position = { x: position.x, y: position.y };
    }
  });
}

// One pass at a time; a change during a pass asks for one more.
function reconcile() {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      await reconcileOnce(currentSceneEpoch()).catch((error) => {
        console.warn("[transformation] token size:", error?.message || error);
      });
    } while (again);
  })().finally(() => { running = null; });
  return running;
}

export async function mountTransformationTokenSizeController() {
  if (mounted) return true;
  const role = await OBR.player.getRole().catch(() => "PLAYER");
  if (role !== "GM") return false;
  mounted = true;
  unsubscribe = subscribeSceneItemChanges(() => { void reconcile(); }, { domains: ["effects"] });
  void reconcile();
  return true;
}

export function unmountTransformationTokenSizeController() {
  unsubscribe?.();
  unsubscribe = null;
  mounted = false;
}
