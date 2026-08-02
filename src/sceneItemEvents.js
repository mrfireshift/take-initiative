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

// Non classificare lo snapshot iniziale (o quello successivo a un unload)
// come delta. Un evento ricevuto durante l'idratazione forza una nuova baseline.
dispatcher.suspend();

async function resumeSceneItemDispatcher(epoch) {
  const revision = ++__sceneBaselineRevision;
  await hydrateSceneItemChangeDispatcher({
    dispatcher,
    readItems: () => OBR.scene.items.getItems(),
    isCurrent: () => (
      revision === __sceneBaselineRevision
      && isCurrentSceneEpoch(epoch)
    ),
  });
}

subscribeSceneEpoch(({ phase, epoch }) => {
  if (phase === "unload") {
    __sceneBaselineRevision += 1;
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
