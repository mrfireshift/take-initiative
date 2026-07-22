import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import {
  configureConditionWidgetWriter,
} from "./conditions.js";
import {
  configureConcentrationWidgetWriter,
} from "./spells-tag.js";
import { reconcileEffectsLayout, setEffectsLayoutGridDpi } from "./effectsLayout.js";
import {
  EFFECTS_DIAGNOSTICS_CONTROL_CHANNEL,
  EFFECTS_DIAGNOSTICS_RESPONSE_CHANNEL,
  effectsDiagnostics,
} from "./effectsDiagnostics.js";
import {
  collectEffectsInvalidation,
  createEffectsReconcileQueue,
  isEffectsWidgetWriterRole,
} from "./effectsReconcilerCore.js";
import { subscribeSceneItemChanges } from "./sceneItemEvents.js";

const META_KEY = `${ID}/meta`;
const SPELLS_META_KEY = `${ID}/spells`;

let mounted = false;
let writer = false;
let unsubscribe = null;
let unsubscribeDiagnostics = null;
let unsubscribeGrid = null;

const queue = createEffectsReconcileQueue({
  async run(batch, context) {
    await reconcileEffectsLayout(batch, context);
  },
});

function requestConditions(itemIds) {
  const request = Array.isArray(itemIds)
    ? queue.request({ conditions: itemIds })
    : queue.request({ full: true });
  return request.done;
}

function requestConcentration(itemIds) {
  const request = Array.isArray(itemIds)
    ? queue.request({ concentration: itemIds })
    : queue.request({ full: true });
  return request.done;
}

async function getPlayerRole() {
  return (await OBR.player?.getRole?.()) ||
    (await OBR.room?.getRole?.()) ||
    "PLAYER";
}

export async function mountEffectsReconciler() {
  if (mounted) return writer;
  mounted = true;

  let role = "PLAYER";
  try { role = await getPlayerRole(); } catch {}
  writer = isEffectsWidgetWriterRole(role);
  if (!writer) return false;

  configureConditionWidgetWriter(requestConditions);
  configureConcentrationWidgetWriter(requestConcentration);

  unsubscribeDiagnostics = OBR.broadcast.onMessage(EFFECTS_DIAGNOSTICS_CONTROL_CHANNEL, async (event) => {
    const data = event?.data;
    if (data?.type !== "request" || !data.requestId) return;
    try {
      let result;
      if (data.command === "reset") {
        effectsDiagnostics.enable();
        await new Promise((resolve) => setTimeout(resolve, 200));
        await queue.idle();
        effectsDiagnostics.clear();
        result = { state: { writer, mounted, ...queue.getState() } };
      } else if (data.command === "state") {
        result = { writer, mounted, ...queue.getState() };
      } else {
        await new Promise((resolve) => setTimeout(resolve, 150));
        await queue.idle();
        result = { summary: effectsDiagnostics.summary(), events: effectsDiagnostics.dump() };
      }
      await OBR.broadcast.sendMessage(EFFECTS_DIAGNOSTICS_RESPONSE_CHANNEL, {
        requestId: data.requestId,
        ok: true,
        result,
      }, { destination: "LOCAL" });
    } catch (error) {
      await OBR.broadcast.sendMessage(EFFECTS_DIAGNOSTICS_RESPONSE_CHANNEL, {
        requestId: data.requestId,
        ok: false,
        error: String(error?.message || error),
      }, { destination: "LOCAL" }).catch(() => {});
    }
  });

  unsubscribe = subscribeSceneItemChanges((event) => {
    const invalidation = collectEffectsInvalidation(event, {
      metaKey: META_KEY,
      spellsKey: SPELLS_META_KEY,
    });
    queue.request(invalidation).done.catch((error) => {
      console.error("[effects] reconcile", error);
    });
  }, {
    filter: (event) => !!(event.flags.conditions || event.flags.concentration),
  });

  unsubscribeGrid = OBR.scene.grid.onChange((grid) => {
    if (!setEffectsLayoutGridDpi(grid?.dpi)) return;
    queue.request({ full: true }).done.catch((error) => {
      console.error("[effects] grid reconcile", error);
    });
  });

  queue.request({ full: true }).done.catch((error) => {
    console.error("[effects] initial reconcile", error);
  });
  return true;
}

export function unmountEffectsReconciler() {
  unsubscribe?.();
  unsubscribe = null;
  unsubscribeDiagnostics?.();
  unsubscribeDiagnostics = null;
  unsubscribeGrid?.();
  unsubscribeGrid = null;
  configureConditionWidgetWriter(null);
  configureConcentrationWidgetWriter(null);
  mounted = false;
  writer = false;
}

globalThis.__tbpEffectsReconciler = {
  state: () => ({ writer, mounted, ...queue.getState() }),
  idle: () => queue.idle(),
  reconcileAll: () => writer
    ? queue.request({ full: true }).done
    : Promise.resolve({ outcome: "ignored-non-writer" }),
};
