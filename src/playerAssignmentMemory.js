// The players assigned to the characters, remembered in the room (playerAssignmentMemoryCore.js). The GM's assignment
// from the card menu is saved here; the GM's background gives the remembered player back to a character's token that
// has none (a new scene, a token added again), in the Online room profile only.
import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { METADATA_OWNERSHIP, writeRoomMetadataKey } from "./metadataKeyScoped.js";
import {
  adoptedOwnerForItem,
  localPlayerNamesWith,
  normalizePlayerAssignmentMemory,
  playerAssignmentMemoryWith,
  playerMemoryKeyOfItem,
  rememberedOwnerForItem,
  rememberedPlayerForItem,
  retainPlayerAssignmentMemoryWithinByteBudget,
} from "./playerAssignmentMemoryCore.js";
import { writePlayerAssignment, writeTokenOwner } from "./playerAssignmentWriter.js";
import { actorProfileIdFromItem } from "./actorIdentityCore.js";
import { resolveInitiativeCardActorMatch } from "./initiativeCardRegistryCore.js";
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
  return updatePlayerAssignmentMemory((memory) => playerAssignmentMemoryWith(memory, key, player?.id || null), { obr });
}

// Lot GA4 of docs/STUDIO_GIOCO_ONLINE.md: the memory changed by the «Giocatori» panel of the Options (`update` takes
// the current memory and returns the next one). This file stays the only writer of the room key. Unchanged, no write.
export async function updatePlayerAssignmentMemory(update, { obr = OBR } = {}) {
  const metadata = await obr.room.getMetadata();
  const current = normalizePlayerAssignmentMemory(metadata?.[MEMORY_KEY]);
  const next = retainPlayerAssignmentMemoryWithinByteBudget(update(current));
  if (JSON.stringify(next) === JSON.stringify(current)) return true;
  await writeRoomMetadataKey(obr.room, METADATA_OWNERSHIP.PLAYER_ASSIGNMENTS, next, { runtime: "player-assignment-memory" });
  return true;
}

// GA4: the names and colours of the players the GM's browser has seen, and one more to remember.
export const readRememberedPlayerNames = (storage) => readLocalNames(storage);
export const rememberPlayerName = (player, storage) => rememberLocalName(player, storage);

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
    // Lot GA2 of docs/STUDIO_GIOCO_ONLINE.md: a token with no identity yet is recognised through the card registry
    // (the GM's browser and the room), read once for the pass and only when such a character token is on the map.
    const needsRegistry = snapshot.items.some((item) => item?.layer === "CHARACTER" && !item.attachedTo && !actorProfileIdFromItem(item));
    let registry = null;
    if (needsRegistry) {
      try {
        ({ registry } = await (await import("./initiativeCards.js")).readInitiativeCardRegistry());
      } catch (error) {
        console.warn("[player-assignment] registro delle schede:", error?.message || error);
      }
      if (!isCurrentSceneEpoch(sceneEpoch)) return;
    }
    const registryActorOf = (item) => {
      if (!registry || actorProfileIdFromItem(item)) return "";
      const match = resolveInitiativeCardActorMatch(registry, item);
      return match.status === "matched" ? match.actorProfileId : "";
    };
    for (const item of snapshot.items) {
      if (!isCurrentSceneEpoch(sceneEpoch)) return;
      const registryActorProfileId = registryActorOf(item);
      const player = rememberedPlayerForItem(item, memory, { players, localNames, registryActorProfileId });
      if (player) {
        await writePlayerAssignment([item.id], player, {
          obr,
          fallbackOwnerId: obr.player.id,
          isCurrent: () => isCurrentSceneEpoch(sceneEpoch),
        }).catch((error) => console.warn("[player-assignment] memoria non applicata:", error?.message || error));
        continue;
      }
      // GA2: a character's token the tracker does not know yet gets its player as Owlbear owner, nothing else.
      const ownerId = rememberedOwnerForItem(item, memory, { registryActorProfileId });
      if (ownerId) await writeTokenOwner(item.id, ownerId, { obr, isCurrent: () => isCurrentSceneEpoch(sceneEpoch) });
    }
  };

  // Lot GA3: the owners of the tokens, to see the GM give one to a player from Owlbear's Owner menu. The scene's own
  // change events leave the owner out, so the raw changes are compared here; a scene's first list only fills the map.
  let owners = new Map();
  const seedOwners = () => obr.scene.items.getItems()
    .then((items) => { owners = new Map((Array.isArray(items) ? items : []).map((item) => [item.id, item.createdUserId])); }, () => {});
  const handleOwners = async (items) => {
    const list = Array.isArray(items) ? items : [];
    const changed = list.filter((item) => owners.has(item.id) && owners.get(item.id) !== item.createdUserId);
    owners = new Map(list.map((item) => [item.id, item.createdUserId]));
    if (!changed.length) return;
    const sceneEpoch = currentSceneEpoch();
    const players = await obr.party.getPlayers().catch(() => []);
    for (const item of changed) {
      const player = adoptedOwnerForItem(item, players);
      if (!player || !isCurrentSceneEpoch(sceneEpoch)) continue;
      await rememberPlayerAssignment(item, player, { obr })
        .catch((error) => console.warn("[player-assignment] memoria non salvata:", error?.message || error));
      await writePlayerAssignment([item.id], player, {
        obr,
        fallbackOwnerId: obr.player.id,
        isCurrent: () => isCurrentSceneEpoch(sceneEpoch),
      }).catch((error) => console.warn("[player-assignment] proprietario non adottato:", error?.message || error));
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
      subscribeSceneEpoch(({ phase }) => {
        if (phase === "ready") { waits = 0; owners = new Map(); void seedOwners(); schedule(); }
      }),
      obr.scene.items.onChange((items) => {
        void handleOwners(items).catch((error) => console.warn("[player-assignment] proprietari:", error?.message || error));
      }),
    ];
    void obr.room.getMetadata().then((metadata) => {
      memory = normalizePlayerAssignmentMemory(metadata?.[MEMORY_KEY]);
      schedule();
    }, () => {});
    void seedOwners();
  };
  const stop = () => {
    for (const unsubscribe of stops) { try { unsubscribe?.(); } catch {} }
    stops = [];
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  return service.subscribe(selectOnlineRoomProfile, (online) => (online ? start() : stop()));
}
