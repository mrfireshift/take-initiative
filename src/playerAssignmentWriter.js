// Writes the player of a token (playerAssignmentCore.js): merge-only on the plugin metadata, then the Owlbear owner.
import OBR from "@owlbear-rodeo/sdk";
import {
  CHARACTER_UPDATE_PERMISSION,
  OWNER_ONLY_PERMISSION,
  normalizePlayerAssignment,
  pluginMetaWithPlayerAssignment,
} from "./playerAssignmentCore.js";
import { ID } from "./constants.js";

const META_KEY = `${ID}/meta`;

// Lot GA2 of docs/STUDIO_GIOCO_ONLINE.md: the Owlbear owner alone, for a character's token the tracker does not know
// yet. Checked again on the draft: a token that got the plugin's metadata in between is left to the usual assignment.
// Returns whether Owlbear took it.
export async function writeTokenOwner(id, ownerId, { isCurrent = () => true, obr = OBR } = {}) {
  if (!id || !ownerId || !isCurrent()) return false;
  let written = false;
  try {
    await obr.scene.items.updateItems([id], (items) => {
      for (const item of items) {
        if (item.metadata?.[META_KEY] || item.createdUserId === ownerId) continue;
        item.createdUserId = ownerId;
        written = true;
      }
    });
  } catch (error) {
    console.warn("[player-assignment] proprietario non cambiato:", error?.message || error);
    return false;
  }
  return written;
}

// Returns { written, owner, ownerOnly, canUpdate }: owner says whether Owlbear accepted the new owner, ownerOnly
// whether the room permission that limits players to their own tokens is on, canUpdate whether players may move
// characters at all (Character → Update). `fallbackOwnerId` (the GM) takes the token back
// when the assignment is cleared.
export async function writePlayerAssignment(ids, player, { isCurrent = () => true, obr = OBR, fallbackOwnerId = "" } = {}) {
  const targetIds = Array.from(new Set((Array.isArray(ids) ? ids : []).filter((id) => typeof id === "string" && id)));
  if (!targetIds.length || !isCurrent()) return { written: false, owner: false, ownerOnly: false, canUpdate: false };
  const assignment = normalizePlayerAssignment(player);
  await obr.scene.items.updateItems(targetIds, (items) => {
    for (const item of items) {
      item.metadata[META_KEY] = pluginMetaWithPlayerAssignment(item.metadata, assignment);
    }
  });
  if (!isCurrent()) return { written: true, owner: false, ownerOnly: false, canUpdate: false };
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
  let permissions = [];
  try { permissions = await obr.room.getPermissions(); } catch {}
  const list = Array.isArray(permissions) ? permissions : [];
  return {
    written: true,
    owner,
    ownerOnly: list.includes(OWNER_ONLY_PERMISSION),
    canUpdate: list.includes(CHARACTER_UPDATE_PERMISSION),
  };
}
