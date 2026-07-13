// src/constants.js
export const ID = "com.thebigpicture.initiative";
export const ACTIVE_TURN_LABEL_META = `${ID}/activeTurnLabel`;

export function isOnlyActiveTurnLabelChange(changes) {
  return Array.isArray(changes) &&
    changes.length > 0 &&
    changes.every((item) => !!item?.metadata?.[ACTIVE_TURN_LABEL_META]);
}
