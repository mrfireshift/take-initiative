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
  return broadcastConcentrationWarnings(warnings, { ...options, eventId, now });
}

async function hiddenConcentratorIds(warnings, knownItems = null) {
  const ids = [...new Set(warnings.map((warning) => String(warning?.targetId || "")).filter(Boolean))];
  if (!ids.length) return new Set();
  try {
    const items = Array.isArray(knownItems) && ids.every((id) => knownItems.some((item) => item?.id === id))
      ? knownItems
      : await OBR.scene.items.getItems(ids);
    return new Set(items.filter((item) => item?.visible === false).map((item) => String(item.id)));
  } catch {
    return new Set();
  }
}

// Already built warnings (e.g. an aura's concentration save, without damage) on the same channel.
export async function broadcastConcentrationWarnings(warnings = [], options = {}) {
  if (!Array.isArray(warnings) || !warnings.length) return [];
  const sceneEpoch = Number(options.sceneEpoch);
  if (!Number.isSafeInteger(sceneEpoch) || sceneEpoch < 0) return [];
  const now = Math.max(0, Math.floor(Number(options.now) || Date.now()));
  const warningRuntimeScope = await warningRuntimeScopeFor(options);
  const scopedWarnings = warnings.map((warning) => ({
    ...warning,
    ...(warningRuntimeScope ? { warningRuntimeScope } : {}),
  }));

  const sendMessage = options.sendMessage
    || ((channel, payload, delivery) => OBR.broadcast.sendMessage(channel, payload, delivery));
  // Lot L16: the warning of a creature the GM keeps hidden stays with the GM (this client); the others go to all.
  const hiddenIds = await hiddenConcentratorIds(scopedWarnings, options.items);
  const groups = [
    [scopedWarnings.filter((warning) => !hiddenIds.has(String(warning?.targetId || ""))), "ALL"],
    [scopedWarnings.filter((warning) => hiddenIds.has(String(warning?.targetId || ""))), "LOCAL"],
  ];
  for (const [group, destination] of groups) {
    if (!group.length) continue;
    await sendMessage(CONCENTRATION_WARNING_CHANNEL, {
      type: "show-concentration-warning",
      warnings: group,
      createdAt: now,
      sceneEpoch,
      ...(warningRuntimeScope ? { warningRuntimeScope } : {}),
    }, { destination });
  }
  return scopedWarnings;
}
