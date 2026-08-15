import OBR from "@owlbear-rodeo/sdk";
import { ID } from "../constants.js";
import { createOptionsService } from "./optionsService.js";
import { selectOptionsRevision } from "./optionsSelectors.js";
import { refreshOptionsUntilRevision } from "./optionsSync.js";

export const runtimeOptionsService = createOptionsService({ sdk: OBR });
export const OPTIONS_INVALIDATION_CHANNEL = `${ID}/options-invalidation`;
const runtimeInstanceId = typeof globalThis.crypto?.randomUUID === "function"
  ? globalThis.crypto.randomUUID()
  : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

let startPromise = null;
let invalidationListenerMounted = false;

function mountOptionsInvalidationListener() {
  if (invalidationListenerMounted) return;
  invalidationListenerMounted = true;
  OBR.broadcast.onMessage(OPTIONS_INVALIDATION_CHANNEL, (event) => {
    if (event?.data?.type !== "options-invalidated") return;
    if (event.data.sourceInstanceId === runtimeInstanceId) return;
    if (event.data.scope === "local") {
      void runtimeOptionsService.refresh("broadcast-local-invalidation").catch((error) => {
        console.warn("[options] local invalidation refresh:", error?.message || error);
      });
      return;
    }
    void refreshOptionsUntilRevision(
      runtimeOptionsService,
      event.data.revision,
    ).catch((error) => {
      console.warn("[options] invalidation refresh:", error?.message || error);
    });
  });
}

export function startRuntimeOptions() {
  mountOptionsInvalidationListener();
  startPromise ||= runtimeOptionsService.start().catch((error) => {
    startPromise = null;
    console.warn("[options] runtime:", error?.message || error);
    throw error;
  });
  return startPromise;
}

export function broadcastRuntimeOptionsInvalidation(reason = "save", { scope = "shared" } = {}) {
  const revision = runtimeOptionsService.get(selectOptionsRevision);
  return OBR.broadcast.sendMessage(
    OPTIONS_INVALIDATION_CHANNEL,
    {
      type: "options-invalidated",
      reason,
      scope,
      revision,
      sourceInstanceId: runtimeInstanceId,
    },
    { destination: "ALL" },
  );
}
