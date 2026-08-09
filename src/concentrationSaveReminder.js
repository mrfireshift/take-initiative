import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import {
  concentrationDamageByItemId,
  concentrationSaveWarningsForItems,
} from "./concentrationSaveReminderCore.js";

const CONCENTRATION_WARNING_CHANNEL = `${ID}/concentration-warning`;

let concentrationDamageSequence = 0;

export async function broadcastConcentrationSaveWarnings(changes = [], options = {}) {
  const damageById = concentrationDamageByItemId(changes);
  if (!damageById.size) return [];

  const now = Math.max(0, Math.floor(Number(options.now) || Date.now()));
  const eventId = String(options.eventId || "").trim()
    || `${now}-${++concentrationDamageSequence}`;
  const getItems = options.getItems
    || ((itemIds) => OBR.scene.items.getItems(itemIds));
  const items = Array.isArray(options.items)
    ? options.items
    : await getItems([...damageById.keys()]);
  const normalizedChanges = [...damageById].map(([itemId, damage]) => ({ itemId, damage }));
  const warnings = concentrationSaveWarningsForItems({
    items,
    changes: normalizedChanges,
    eventId,
  });
  if (!warnings.length) return [];

  const sendMessage = options.sendMessage
    || ((channel, payload, delivery) => OBR.broadcast.sendMessage(channel, payload, delivery));
  await sendMessage(CONCENTRATION_WARNING_CHANNEL, {
    type: "show-concentration-warning",
    warnings,
    createdAt: now,
  }, { destination: "ALL" });
  return warnings;
}
