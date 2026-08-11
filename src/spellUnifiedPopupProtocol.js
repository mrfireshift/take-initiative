import { ID } from "./constants.js";

export const SPELL_UNIFIED_PANEL_POPUP_CHANNEL =
  `${ID}/spell-unified-panel-popup`;

export const SPELL_UNIFIED_PANEL_POPUP_EVENT =
  `${ID}/spell-unified-panel-popup-result`;

export const SPELL_UNIFIED_PANEL_POPUP_STATUSES = Object.freeze({
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  CLOSED: "closed",
  FAILED: "failed",
});

function text(value) {
  return String(value ?? "").trim();
}

export function buildSpellUnifiedPopupEvent({
  source = "",
  status = "",
  instanceId = "",
  actionId = "",
  popoverId = "",
  message = "",
  ...details
} = {}) {
  return {
    type: SPELL_UNIFIED_PANEL_POPUP_EVENT,
    source: text(source),
    status: text(status),
    instanceId: text(instanceId),
    actionId: text(actionId),
    popoverId: text(popoverId),
    ...(text(message) ? { message: text(message) } : {}),
    ...details,
  };
}

export function isSpellUnifiedPopupEvent(
  event,
  { instanceId = "", actionId = "", popoverId = "" } = {},
) {
  const data = event?.data && typeof event.data === "object"
    ? event.data
    : event;
  if (!data || data.type !== SPELL_UNIFIED_PANEL_POPUP_EVENT) return false;
  if (text(instanceId) && text(data.instanceId) !== text(instanceId)) return false;
  if (text(actionId) && text(data.actionId) !== text(actionId)) return false;
  if (text(popoverId) && text(data.popoverId) !== text(popoverId)) return false;
  return true;
}
