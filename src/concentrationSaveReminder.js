import OBR from "@owlbear-rodeo/sdk";
import { EFFECT_SAVE_REMINDER_NOTICE_CHANNEL, ID } from "./constants.js";
import {
  concentrationDamageByItemId,
  concentrationSaveWarningsForItems,
} from "./concentrationSaveReminderCore.js";
import {
  effectSaveReminderNoticesForDamage,
  effectSaveReminderSourceIds,
} from "./effectSaveReminderCore.js";

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

// The saves an effect asks for when its creature takes damage (Dominate, Hideous Laughter): after the commit of a damage
// that comes from the spell panel or from a zone's reminder; the consoles send their own. Only a notice: nothing is
// written here, the GM's answer takes the usual road.
export async function broadcastEffectSaveDamageNotices(changes = [], options = {}) {
  const damageById = concentrationDamageByItemId(changes);
  if (!damageById.size) return [];
  const getItems = options.getItems
    || ((itemIds) => OBR.scene.items.getItems(itemIds));
  const items = await getItems([...damageById.keys()]);
  const sourceIds = effectSaveReminderSourceIds(items)
    .filter((itemId) => !damageById.has(itemId));
  const notices = effectSaveReminderNoticesForDamage({
    items: sourceIds.length ? items.concat(await getItems(sourceIds)) : items,
    damageById,
    eventId: String(options.eventId || "").trim()
      || `${Date.now()}-${++concentrationDamageSequence}`,
  });
  if (!notices.length) return [];
  const send = options.send || (await import("./options/reminderProjectionBroadcast.js")).sendProjectedReminderPayload;
  await send(EFFECT_SAVE_REMINDER_NOTICE_CHANNEL, {
    type: "show-effect-save-notices",
    notices,
  });
  return notices;
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
