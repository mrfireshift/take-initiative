export const COMPACT_ADMIN_MENU_ACTIONS = Object.freeze([
  "reset-round",
  "history",
  "add-all",
  "fill-initiative",
  "factions",
  "clear-initiative",
]);

export const INITIATIVE_CARD_MENU_ACTIONS = Object.freeze([
  "conditions",
  "clear-conditions",
  "spells",
  "clear-spells",
  "clear-concentration",
  "class-feature-activate",
  "class-feature-deactivate",
  "class-feature-reset-resources",
  "initiative-card",
  "attitude",
  "boss-mode",
  "remove",
]);

export const INITIATIVE_CARD_ATTITUDES = Object.freeze([
  "ally",
  "neutral",
  "pc",
  "enemy",
]);

export const INITIATIVE_CARD_BOSS_MODES = Object.freeze([
  "none",
  "legendary",
  "paragon",
  "epic",
]);

const COMPACT_ADMIN_MENU_ACTION_SET = new Set(COMPACT_ADMIN_MENU_ACTIONS);
const INITIATIVE_CARD_SIMPLE_ACTION_SET = new Set(
  INITIATIVE_CARD_MENU_ACTIONS.filter((action) =>
    action !== "attitude"
      && action !== "boss-mode"
      && action !== "class-feature-activate"
      && action !== "class-feature-deactivate"
  )
);
const INITIATIVE_CARD_ATTITUDE_SET = new Set(INITIATIVE_CARD_ATTITUDES);
const INITIATIVE_CARD_BOSS_MODE_SET = new Set(INITIATIVE_CARD_BOSS_MODES);

export function createMenuRequestId({
  now = Date.now,
  random = Math.random,
} = {}) {
  const timestamp = Math.max(0, Math.trunc(Number(now()) || 0));
  const randomValue = Number(random());
  const boundedRandom = Number.isFinite(randomValue)
    ? Math.min(Math.max(randomValue, 0), 0.999999999999)
    : 0;
  const entropy = Math.floor(boundedRandom * 0x100000000)
    .toString(36)
    .padStart(7, "0");
  return `${timestamp}-${entropy}`;
}

export function createMenuMessage(requestId, type, details = {}) {
  return {
    ...details,
    type: String(type || ""),
    requestId: String(requestId || ""),
  };
}

export function isMenuMessageForRequest(data, requestId) {
  return (
    !!requestId &&
    !!data &&
    typeof data === "object" &&
    data.requestId === requestId
  );
}

export function menuPayloadStorageKey(prefix, requestId) {
  const normalizedPrefix = String(prefix || "");
  const normalizedRequestId = String(requestId || "");
  return normalizedPrefix && normalizedRequestId
    ? `${normalizedPrefix}${normalizedRequestId}`
    : "";
}

export function writeStoredMenuPayload(storage, prefix, requestId, payload) {
  const key = menuPayloadStorageKey(prefix, requestId);
  if (!key || !storage?.setItem || !payload || typeof payload !== "object") {
    return false;
  }
  try {
    storage.setItem(key, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function readStoredMenuPayload(storage, prefix, requestId) {
  const key = menuPayloadStorageKey(prefix, requestId);
  if (!key || !storage?.getItem) return null;
  try {
    const payload = JSON.parse(storage.getItem(key) || "null");
    return payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload
      : null;
  } catch {
    return null;
  }
}

export function removeStoredMenuPayload(storage, prefix, requestId) {
  const key = menuPayloadStorageKey(prefix, requestId);
  if (!key || !storage?.removeItem) return false;
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function isAllowedCompactAdminMenuAction(action) {
  return COMPACT_ADMIN_MENU_ACTION_SET.has(String(action || ""));
}

export function isAllowedInitiativeCardMenuAction(action, value = "") {
  const normalizedAction = String(action || "");
  const normalizedValue = String(value || "");
  if (INITIATIVE_CARD_SIMPLE_ACTION_SET.has(normalizedAction)) return true;
  if (normalizedAction === "attitude") {
    return INITIATIVE_CARD_ATTITUDE_SET.has(normalizedValue);
  }
  if (normalizedAction === "boss-mode") {
    return INITIATIVE_CARD_BOSS_MODE_SET.has(normalizedValue);
  }
  if (
    normalizedAction === "class-feature-activate"
    || normalizedAction === "class-feature-deactivate"
  ) {
    return /^[a-zA-Z0-9:_-]{1,220}$/.test(normalizedValue);
  }
  return false;
}
