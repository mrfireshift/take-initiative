import OBR from "@owlbear-rodeo/sdk";
import {
  createSceneItemChangeDispatcher,
  hydrateSceneItemChangeDispatcher,
} from "./sceneItemChangeDispatcherCore.js";
import {
  currentSceneEpoch,
  isCurrentSceneEpoch,
  subscribeSceneEpoch,
} from "./sceneEpoch.js";

const dispatcher = createSceneItemChangeDispatcher({
  debounceMs: 50,
  subscribeSource: (handler) => OBR.scene.items.onChange(handler),
  getEpoch: currentSceneEpoch,
});

let __sceneBaselineRevision = 0;
let __sceneSnapshotEpoch = null;

// Non classificare lo snapshot iniziale (o quello successivo a un unload)
// come delta. Un evento ricevuto durante l'idratazione forza una nuova baseline.
dispatcher.suspend();

async function resumeSceneItemDispatcher(epoch) {
  const revision = ++__sceneBaselineRevision;
  const resumed = await hydrateSceneItemChangeDispatcher({
    dispatcher,
    readItems: () => OBR.scene.items.getItems(),
    isCurrent: () => (
      revision === __sceneBaselineRevision
      && isCurrentSceneEpoch(epoch)
    ),
  });
  if (
    resumed
    && revision === __sceneBaselineRevision
    && isCurrentSceneEpoch(epoch)
  ) {
    __sceneSnapshotEpoch = epoch;
  }
  return resumed;
}

subscribeSceneEpoch(({ phase, epoch }) => {
  if (phase === "unload") {
    __sceneBaselineRevision += 1;
    __sceneSnapshotEpoch = null;
    dispatcher.suspend();
    return;
  }
  void resumeSceneItemDispatcher(epoch).catch((error) => {
    console.warn("[scene-items] scene baseline:", error?.message || error);
  });
});

OBR.onReady(() => {
  void resumeSceneItemDispatcher(currentSceneEpoch()).catch((error) => {
    console.warn("[scene-items] initial baseline:", error?.message || error);
  });
});

export function subscribeSceneItemChanges(handler, options = {}) {
  return dispatcher.subscribe((event) => {
    if (event?.sceneEpoch !== undefined && !isCurrentSceneEpoch(event.sceneEpoch)) {
      return null;
    }
    return handler(event);
  }, options);
}

export function readSceneItemsSnapshot(sceneEpoch = currentSceneEpoch()) {
  const snapshot = dispatcher.getSnapshot();
  const complete = snapshot.complete === true
    && __sceneSnapshotEpoch !== null
    && Number(__sceneSnapshotEpoch) === Number(sceneEpoch)
    && isCurrentSceneEpoch(sceneEpoch);
  return {
    ...snapshot,
    complete,
    sceneEpoch,
    items: complete ? snapshot.items : [],
  };
}

export function isCurrentSceneItemEvent(event, {
  sceneEpoch = currentSceneEpoch(),
  revision = null,
} = {}) {
  if (!event) return false;
  if (event.sceneEpoch !== undefined && Number(event.sceneEpoch) !== Number(sceneEpoch)) {
    return false;
  }
  if (event.sceneEpoch !== undefined && !isCurrentSceneEpoch(event.sceneEpoch)) {
    return false;
  }
  if (revision === null || revision === undefined) return true;
  return Number(event.revision || 0) >= Number(revision || 0);
}

export function sceneItemEventCorrelation(event) {
  return String(
    event?.correlationId
      || event?.commandId
      || event?.source?.correlationId
      || "",
  ).trim() || null;
}
