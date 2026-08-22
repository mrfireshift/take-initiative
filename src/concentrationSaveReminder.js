import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import {
  concentrationDamageByItemId,
  concentrationSaveWarningsForItems,
} from "./concentrationSaveReminderCore.js";

const CONCENTRATION_WARNING_CHANNEL = `${ID}/concentration-warning`;

let concentrationDamageSequence = 0;

async function warningRuntimeScopeFor(options = {}) {
  const supplied = String(
    options.warningRuntimeScope || options.sceneIdentity || "",
  ).trim();
  if (supplied) return supplied;
  try {
    const { getEffectsMutationSceneContext } = await import("./effectsMutations.js");
    const context = await getEffectsMutationSceneContext({
      commandId: String(options.eventId || "concentration-warning").trim(),
    });
    return String(context?.sceneIdentity || "").trim();
  } catch {
    return "";
  }
}

export async function broadcastConcentrationSaveWarnings(changes = [], options = {}) {
  const damageById = concentrationDamageByItemId(changes);
  if (!damageById.size) return [];

  const sceneEpoch = Number(options.sceneEpoch);
  if (!Number.isSafeInteger(sceneEpoch) || sceneEpoch < 0) return [];

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
    causeHistoryEntryId: String(options.causeHistoryEntryId || "").trim(),
  });
  if (!warnings.length) return [];
  const warningRuntimeScope = await warningRuntimeScopeFor(options);
  const scopedWarnings = warnings.map((warning) => ({
    ...warning,
    ...(warningRuntimeScope ? { warningRuntimeScope } : {}),
  }));

  const sendMessage = options.sendMessage
    || ((channel, payload, delivery) => OBR.broadcast.sendMessage(channel, payload, delivery));
  await sendMessage(CONCENTRATION_WARNING_CHANNEL, {
    type: "show-concentration-warning",
    warnings: scopedWarnings,
    createdAt: now,
    sceneEpoch,
    ...(warningRuntimeScope ? { warningRuntimeScope } : {}),
  }, { destination: "ALL" });
  return scopedWarnings;
}
