// src/constants.js
export const ID = "com.thebigpicture.initiative";
export const ACTIVE_TURN_LABEL_META = `${ID}/activeTurnLabel`;
export const TRACKER_PANEL_REQUEST_CHANNEL = `${ID}/tracker-panel-request`;
export const SPELL_ZONE_TRIGGER_NOTICE_CHANNEL = `${ID}/spell-zone-trigger-notice`;
export const EFFECT_SAVE_REMINDER_NOTICE_CHANNEL = `${ID}/effect-save-reminder-notice`;

export function isOnlyActiveTurnLabelChange(changes) {
  return Array.isArray(changes) &&
    changes.length > 0 &&
    changes.every((item) => !!item?.metadata?.[ACTIVE_TURN_LABEL_META]);
}
