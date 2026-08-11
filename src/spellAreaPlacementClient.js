import { SPELL_AREA_PLACEMENT_CHANNEL } from "./spellAreaPlacementCore.js";

const DEFAULT_PLACEMENT_REQUEST_TIMEOUT_MS = 12000;
const DEFAULT_PLACEMENT_START_RETRY_DELAYS_MS = Object.freeze([
  150,
  300,
  600,
  1000,
]);

export function createSpellAreaPlacementRequestId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `spell-area-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function requestSpellAreaPlacement({
  ruleId = "",
  casterId = "",
  ruleChoice = "",
  context = null,
  requestId = createSpellAreaPlacementRequestId(),
} = {}, {
  broadcast = null,
  windowRef = globalThis.window,
  requestTimeoutMs = DEFAULT_PLACEMENT_REQUEST_TIMEOUT_MS,
  retryDelaysMs = DEFAULT_PLACEMENT_START_RETRY_DELAYS_MS,
} = {}) {
  const normalizedRuleId = String(ruleId || "").trim();
  const normalizedRequestId = String(requestId || "").trim();
  if (!normalizedRuleId || !normalizedRequestId) {
    return Promise.reject(new Error("placement-request-invalid"));
  }
  if (!broadcast?.onMessage || !broadcast?.sendMessage) {
    return Promise.reject(new Error("placement-broadcast-required"));
  }

  const retryDelays = (Array.isArray(retryDelaysMs)
    ? retryDelaysMs
    : DEFAULT_PLACEMENT_START_RETRY_DELAYS_MS)
    .map((delay) => Math.max(0, Number(delay) || 0));
  const timeoutMs = Math.max(
    0,
    Number(requestTimeoutMs) || DEFAULT_PLACEMENT_REQUEST_TIMEOUT_MS,
  );

  return new Promise((resolve, reject) => {
    let settled = false;
    let accepted = false;
    let retryTimer = null;
    let timeoutTimer = null;
    let retryIndex = 0;
    const setTimer = (callback, delay) => (
      typeof windowRef?.setTimeout === "function"
        ? windowRef.setTimeout(callback, delay)
        : globalThis.setTimeout(callback, delay)
    );
    const clearTimer = (timer) => {
      if (timer === null || timer === undefined) return;
      if (typeof windowRef?.clearTimeout === "function") {
        windowRef.clearTimeout(timer);
      } else {
        globalThis.clearTimeout(timer);
      }
    };
    const cleanup = () => {
      unsubscribe?.();
      windowRef?.removeEventListener?.("beforeunload", cancelOnUnload);
      clearTimer(retryTimer);
      clearTimer(timeoutTimer);
    };
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };
    const cancelOnUnload = () => {
      void broadcast.sendMessage(
        SPELL_AREA_PLACEMENT_CHANNEL,
        {
          type: "cancel",
          requestId: normalizedRequestId,
        },
        { destination: "LOCAL" },
      ).catch(() => {});
    };
    const startPayload = {
      type: "start",
      requestId: normalizedRequestId,
      ruleId: normalizedRuleId,
      casterId: String(casterId || "").trim(),
      ...(String(ruleChoice || "").trim()
        ? { ruleChoice: String(ruleChoice).trim() }
        : {}),
      ...(context && typeof context === "object" ? { context } : {}),
    };
    const sendStart = () => {
      if (settled || accepted) return;
      void broadcast.sendMessage(
        SPELL_AREA_PLACEMENT_CHANNEL,
        startPayload,
        { destination: "LOCAL" },
      ).catch((error) => finish(reject, error));
    };
    const scheduleRetry = () => {
      if (settled || accepted || retryIndex >= retryDelays.length) return;
      const delay = retryDelays[retryIndex];
      retryIndex += 1;
      retryTimer = setTimer(() => {
        retryTimer = null;
        sendStart();
        scheduleRetry();
      }, delay);
    };
    const unsubscribe = broadcast.onMessage(
      SPELL_AREA_PLACEMENT_CHANNEL,
      (event) => {
        const data = event?.data || {};
        if (
          data.type === "accepted"
          && String(data.requestId || "") === normalizedRequestId
        ) {
          accepted = true;
          clearTimer(retryTimer);
          retryTimer = null;
          clearTimer(timeoutTimer);
          timeoutTimer = null;
          return;
        }
        if (
          data.type !== "result"
          || String(data.requestId || "") !== normalizedRequestId
        ) {
          return;
        }
        finish(resolve, data);
      },
    );
    windowRef?.addEventListener?.("beforeunload", cancelOnUnload, { once: true });
    if (timeoutMs > 0) {
      timeoutTimer = setTimer(() => finish(resolve, {
        type: "result",
        requestId: normalizedRequestId,
        ruleId: normalizedRuleId,
        status: "error",
        error: "placement-transport-timeout",
      }), timeoutMs);
    }
    sendStart();
    scheduleRetry();
  });
}

export async function cancelSpellAreaPlacementRequest(
  requestId,
  {
    broadcast = null,
  } = {},
) {
  const normalizedRequestId = String(requestId || "").trim();
  if (!normalizedRequestId || !broadcast?.sendMessage) return false;
  await broadcast.sendMessage(
    SPELL_AREA_PLACEMENT_CHANNEL,
    {
      type: "cancel",
      requestId: normalizedRequestId,
    },
    { destination: "LOCAL" },
  );
  return true;
}

export async function confirmSpellAreaPlacementRequest(
  requestId,
  {
    broadcast = null,
  } = {},
) {
  const normalizedRequestId = String(requestId || "").trim();
  if (!normalizedRequestId || !broadcast?.sendMessage) return false;
  await broadcast.sendMessage(
    SPELL_AREA_PLACEMENT_CHANNEL,
    {
      type: "confirm",
      requestId: normalizedRequestId,
    },
    { destination: "LOCAL" },
  );
  return true;
}

export function requestSpellZoneMovement({
  ruleId = "",
  casterId = "",
  instanceId = "",
  zoneItemId = "",
  initialPosition = null,
  contactTargetId = "",
  movementChoice = "",
  sceneEpoch = null,
  ruleChoice = "",
  requestId = createSpellAreaPlacementRequestId(),
} = {}, options = {}) {
  return requestPlacementRequest({
    type: "move-start",
    requestId,
    ruleId,
    casterId,
    instanceId,
    zoneItemId,
    initialPosition,
    contactTargetId,
    movementChoice,
    sceneEpoch,
    ruleChoice,
  }, options);
}

function requestPlacementRequest(payload, {
  broadcast = null,
  windowRef = globalThis.window,
} = {}) {
  const normalizedRuleId = String(payload?.ruleId || "").trim();
  const normalizedRequestId = String(payload?.requestId || "").trim();
  if (!normalizedRuleId || !normalizedRequestId) {
    return Promise.reject(new Error("placement-request-invalid"));
  }
  if (!broadcast?.onMessage || !broadcast?.sendMessage) {
    return Promise.reject(new Error("placement-broadcast-required"));
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      unsubscribe?.();
      windowRef?.removeEventListener?.("beforeunload", cancelOnUnload);
    };
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };
    const cancelOnUnload = () => {
      void broadcast.sendMessage(
        SPELL_AREA_PLACEMENT_CHANNEL,
        { type: "cancel", requestId: normalizedRequestId },
        { destination: "LOCAL" },
      ).catch(() => {});
    };
    const unsubscribe = broadcast.onMessage(
      SPELL_AREA_PLACEMENT_CHANNEL,
      (event) => {
        const data = event?.data || {};
        if (
          data.type !== "result"
          || String(data.requestId || "") !== normalizedRequestId
        ) return;
        finish(resolve, data);
      },
    );
    windowRef?.addEventListener?.("beforeunload", cancelOnUnload, { once: true });
    void broadcast.sendMessage(
      SPELL_AREA_PLACEMENT_CHANNEL,
      {
        ...payload,
        ruleId: normalizedRuleId,
        requestId: normalizedRequestId,
        casterId: String(payload?.casterId || "").trim(),
        instanceId: String(payload?.instanceId || "").trim(),
        zoneItemId: String(payload?.zoneItemId || "").trim(),
        ...(payload?.initialPosition ? { initialPosition: payload.initialPosition } : {}),
        ...(String(payload?.contactTargetId || "").trim()
          ? { contactTargetId: String(payload.contactTargetId).trim() }
          : {}),
        ...(String(payload?.movementChoice || "").trim()
          ? { movementChoice: String(payload.movementChoice).trim() }
          : {}),
        ...(Number.isFinite(Number(payload?.sceneEpoch))
          ? { sceneEpoch: Number(payload.sceneEpoch) }
          : {}),
        ...(String(payload?.ruleChoice || "").trim()
          ? { ruleChoice: String(payload.ruleChoice).trim() }
          : {}),
      },
      { destination: "LOCAL" },
    ).catch((error) => finish(reject, error));
  });
}
