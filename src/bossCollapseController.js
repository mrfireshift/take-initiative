// Aree che crollano (Hand Slam): a ogni cambio dello stato di iniziativa il GM porta le immagini allo stadio del
// round corrente. Scrive solo le immagini marcate con BOSS_COLLAPSE_ITEM_KEY, mai lo stato di iniziativa.
import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { BOSS_COLLAPSE_ITEM_KEY, bossCollapseUpdates } from "./bossCollapseCore.js";
import { createSceneMetadataKeyWatcher } from "./sceneMetadataDigest.js";
import { currentSceneEpoch, isCurrentSceneEpoch } from "./sceneEpoch.js";

const STATE_KEY = `${ID}/state`;
const stateMetadataWatcher = createSceneMetadataKeyWatcher(STATE_KEY);
let mounted = false;
let working = false;
let requested = false;
let unsubscribeSceneReady = null;
let unsubscribeSceneMetadata = null;

async function reconcileBossCollapseMarkers() {
  const sceneEpoch = currentSceneEpoch();
  const ready = await OBR.scene.isReady().catch(() => false);
  if (!ready || !isCurrentSceneEpoch(sceneEpoch)) return;
  const [metadata, items] = await Promise.all([
    OBR.scene.getMetadata().catch(() => ({})),
    OBR.scene.items.getItems((item) => !!item?.metadata?.[BOSS_COLLAPSE_ITEM_KEY]).catch(() => []),
  ]);
  if (!isCurrentSceneEpoch(sceneEpoch)) return;
  const updates = bossCollapseUpdates(items, metadata?.[STATE_KEY]?.round);
  if (!updates.length) return;
  const origin = String(globalThis.location?.origin || "http://localhost");
  const byId = new Map(updates.map((update) => [update.id, update]));
  await OBR.scene.items.updateItems([...byId.keys()], (drafts) => {
    for (const draft of drafts) {
      const update = byId.get(draft?.id);
      const record = draft?.metadata?.[BOSS_COLLAPSE_ITEM_KEY];
      if (!update || !record || !draft.image) continue;
      draft.image.url = new URL(update.asset, origin).href;
      // Metadata merged: only the stage of this image changes.
      draft.metadata = { ...draft.metadata, [BOSS_COLLAPSE_ITEM_KEY]: { ...record, stage: update.stage } };
    }
  });
}

function requestReconcile() {
  requested = true;
  if (working) return;
  working = true;
  const run = async () => {
    try {
      while (mounted && requested) {
        requested = false;
        try { await reconcileBossCollapseMarkers(); }
        catch (error) { console.warn("[boss-collapse] reconcile:", error?.message || error); }
      }
    } finally {
      working = false;
    }
  };
  void run();
}

export async function mountBossCollapseController() {
  if (mounted) return true;
  const role = await OBR.player.getRole().catch(() => "PLAYER");
  if (role !== "GM") return false;
  mounted = true;
  unsubscribeSceneReady = OBR.scene.onReadyChange((ready) => {
    stateMetadataWatcher.reset();
    if (ready) requestReconcile();
  });
  unsubscribeSceneMetadata = OBR.scene.onMetadataChange((metadata) => {
    if (stateMetadataWatcher.observe(metadata).changed) requestReconcile();
  });
  requestReconcile();
  return true;
}

export function unmountBossCollapseController() {
  unsubscribeSceneReady?.();
  unsubscribeSceneReady = null;
  unsubscribeSceneMetadata?.();
  unsubscribeSceneMetadata = null;
  stateMetadataWatcher.reset();
  mounted = false;
}
