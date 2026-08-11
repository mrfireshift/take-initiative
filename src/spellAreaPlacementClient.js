import { SPELL_AREA_PLACEMENT_CHANNEL } from "./spellAreaPlacementCore.js";

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
} = {}) {
  const normalizedRuleId = String(ruleId || "").trim();
  const normalizedRequestId = String(requestId || "").trim();
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
        {
          type: "cancel",
          requestId: normalizedRequestId,
        },
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
        ) {
          return;
        }
        finish(resolve, data);
      },
    );
    windowRef?.addEventListener?.("beforeunload", cancelOnUnload, { once: true });
    void broadcast.sendMessage(
      SPELL_AREA_PLACEMENT_CHANNEL,
      {
        type: "start",
        requestId: normalizedRequestId,
        ruleId: normalizedRuleId,
        casterId: String(casterId || "").trim(),
        ...(String(ruleChoice || "").trim()
          ? { ruleChoice: String(ruleChoice).trim() }
          : {}),
        ...(context && typeof context === "object" ? { context } : {}),
      },
      { destination: "LOCAL" },
    ).catch((error) => finish(reject, error));
  });
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
