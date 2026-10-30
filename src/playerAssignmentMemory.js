// The players assigned to the characters, remembered in the room (playerAssignmentMemoryCore.js). The GM's assignment
// from the card menu is saved here; the GM's background gives the remembered player back to a character's token that
// has none (a new scene, a token added again), in the Online room profile only.
import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { METADATA_OWNERSHIP, writeRoomMetadataKey } from "./metadataKeyScoped.js";
import {
  localPlayerNamesWith,
  normalizePlayerAssignmentMemory,
  playerAssignmentMemoryWith,
  playerMemoryKeyOfItem,
  rememberedPlayerForItem,
  retainPlayerAssignmentMemoryWithinByteBudget,
} from "./playerAssignmentMemoryCore.js";
import { writePlayerAssignment } from "./playerAssignmentWriter.js";
import { runtimeOptionsService } from "./options/optionsRuntime.js";
import { selectOnlineRoomProfile } from "./options/optionsSelectors.js";
import { readSceneItemsSnapshot, subscribeSceneItemChanges } from "./sceneItemEvents.js";
import { currentSceneEpoch, isCurrentSceneEpoch, subscribeSceneEpoch } from "./sceneEpoch.js";

const MEMORY_KEY = METADATA_OWNERSHIP.PLAYER_ASSIGNMENTS.key;
const LOCAL_NAMES_KEY = `${ID}/player-assignments/local`;

function readLocalNames(storage = globalThis.localStorage) {
  try {
    const value = JSON.parse(storage?.getItem(LOCAL_NAMES_KEY) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function rememberLocalName(player, storage = globalThis.localStorage) {
  try { storage?.setItem(LOCAL_NAMES_KEY, JSON.stringify(localPlayerNamesWith(readLocalNames(storage), player))); } catch {}
}

// The GM's choice from the card menu: remembered for this character (null forgets it).
export async function rememberPlayerAssignment(item, player, { obr = OBR } = {}) {
  const key = playerMemoryKeyOfItem(item);
  if (!key) return false;
  if (player) rememberLocalName(player);
  const metadata = await obr.room.getMetadata();
  const next = retainPlayerAssignmentMemoryWithinByteBudget(
    playerAssignmentMemoryWith(metadata?.[MEMORY_KEY], key, player?.id || null),
  );
  if (JSON.stringify(next) === JSON.stringify(normalizePlayerAssignmentMemory(metadata?.[MEMORY_KEY]))) return true;
  await writeRoomMetadataKey(obr.room, METADATA_OWNERSHIP.PLAYER_ASSIGNMENTS, next, { runtime: "player-assignment-memory" });
  return true;
}

// GM background: listens only while the room profile is Online.
export function mountPlayerAssignmentMemory({ obr = OBR, service = runtimeOptionsService } = {}) {
  let memory = {};
  let stops = [];
  let running = null;
  let again = false;
  let timer = null;
  let waits = 0;

  const applyRemembered = async () => {
    const sceneEpoch = currentSceneEpoch();
    const snapshot = readSceneItemsSnapshot(sceneEpoch);
    if (!Object.keys(memory).length) return;
    // A scene just opened: its items arrive a moment later; wait for them a few times.
    if (!snapshot.complete) {
      if (waits < 10) { waits += 1; again = true; }
      return;
    }
    waits = 0;
    const players = await obr.party.getPlayers().catch(() => []);
    const localNames = readLocalNames();
    for (const item of snapshot.items) {
      if (!isCurrentSceneEpoch(sceneEpoch)) return;
      const player = rememberedPlayerForItem(item, memory, { players, localNames });
      if (!player) continue;
      await writePlayerAssignment([item.id], player, {
        obr,
        fallbackOwnerId: obr.player.id,
        isCurrent: () => isCurrentSceneEpoch(sceneEpoch),
      }).catch((error) => console.warn("[player-assignment] memoria non applicata:", error?.message || error));
    }
  };

  // One pass at a time; changes during a pass ask for one more.
  const schedule = (delay = 300) => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (running) { again = true; return; }
      running = applyRemembered().finally(() => {
        running = null;
        if (again) { again = false; schedule(waits ? 1000 : 300); }
      });
    }, delay);
  };

  const start = () => {
    if (stops.length) return;
    stops = [
      obr.room.onMetadataChange((metadata) => {
        memory = normalizePlayerAssignmentMemory(metadata?.[MEMORY_KEY]);
        schedule();
      }),
      subscribeSceneItemChanges((event) => {
        if (event?.flags?.added || event?.flags?.attitude || event?.flags?.tracker || event?.flags?.trackerStructure) schedule();
      }),
      // A new scene: its characters' tokens get their remembered players.
      subscribeSceneEpoch(({ phase }) => { if (phase === "ready") { waits = 0; schedule(); } }),
    ];
    void obr.room.getMetadata().then((metadata) => {
      memory = normalizePlayerAssignmentMemory(metadata?.[MEMORY_KEY]);
      schedule();
    }, () => {});
  };
  const stop = () => {
    for (const unsubscribe of stops) { try { unsubscribe?.(); } catch {} }
    stops = [];
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  return service.subscribe(selectOnlineRoomProfile, (online) => (online ? start() : stop()));
}
