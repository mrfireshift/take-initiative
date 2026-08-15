// src/constants.js
export const ID = "com.thebigpicture.initiative";
export const ACTIVE_TURN_LABEL_META = `${ID}/activeTurnLabel`;
export const TRACKER_PANEL_REQUEST_CHANNEL = `${ID}/tracker-panel-request`;
export const SPELL_ZONE_TRIGGER_NOTICE_CHANNEL = `${ID}/spell-zone-trigger-notice`;
export const EFFECT_SAVE_REMINDER_NOTICE_CHANNEL = `${ID}/effect-save-reminder-notice`;
export const EFFECTS_MUTATION_COMMAND_CHANNEL = `${ID}/effects-mutation-command`;
export const EFFECTS_MUTATION_RESULT_CHANNEL = `${ID}/effects-mutation-result`;
export const HISTORY_OWNER_COMMAND_CHANNEL = `${ID}/history-owner-command`;
export const HISTORY_OWNER_RESULT_CHANNEL = `${ID}/history-owner-result`;
export const RUNTIME_CACHE_CLEANUP_CHANNEL = `${ID}/runtime-cache-cleanup`;

export function isOnlyActiveTurnLabelChange(changes) {
  return Array.isArray(changes) &&
    changes.length > 0 &&
    changes.every((item) => !!item?.metadata?.[ACTIVE_TURN_LABEL_META]);
}
