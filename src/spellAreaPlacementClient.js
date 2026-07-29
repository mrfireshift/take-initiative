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
      },
      { destination: "LOCAL" },
    ).catch((error) => finish(reject, error));
  });
}
