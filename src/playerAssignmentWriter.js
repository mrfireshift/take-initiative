// Writes the player of a token (playerAssignmentCore.js): merge-only on the plugin metadata, then the Owlbear owner.
import OBR from "@owlbear-rodeo/sdk";
import {
  OWNER_ONLY_PERMISSION,
  normalizePlayerAssignment,
  pluginMetaWithPlayerAssignment,
} from "./playerAssignmentCore.js";
import { ID } from "./constants.js";

const META_KEY = `${ID}/meta`;

// Returns { written, owner, ownerOnly }: owner says whether Owlbear accepted the new owner, ownerOnly whether the
// room permission that limits players to their own tokens is on. `fallbackOwnerId` (the GM) takes the token back
// when the assignment is cleared.
export async function writePlayerAssignment(ids, player, { isCurrent = () => true, obr = OBR, fallbackOwnerId = "" } = {}) {
  const targetIds = Array.from(new Set((Array.isArray(ids) ? ids : []).filter((id) => typeof id === "string" && id)));
  if (!targetIds.length || !isCurrent()) return { written: false, owner: false, ownerOnly: false };
  const assignment = normalizePlayerAssignment(player);
  await obr.scene.items.updateItems(targetIds, (items) => {
    for (const item of items) {
      item.metadata[META_KEY] = pluginMetaWithPlayerAssignment(item.metadata, assignment);
    }
  });
  if (!isCurrent()) return { written: true, owner: false, ownerOnly: false };
  // The owner is a separate write: if Owlbear refuses it, the assignment stays and the GM can use Owlbear's Owner menu.
  const ownerId = assignment?.id || String(fallbackOwnerId || "");
  let owner = false;
  if (ownerId) {
    try {
      await obr.scene.items.updateItems(targetIds, (items) => {
        for (const item of items) item.createdUserId = ownerId;
      });
      owner = true;
    } catch (error) {
      console.warn("[player-assignment] proprietario non cambiato:", error?.message || error);
    }
  }
  let ownerOnly = false;
  try { ownerOnly = (await obr.room.getPermissions()).includes(OWNER_ONLY_PERMISSION); } catch {}
  return { written: true, owner, ownerOnly };
}
