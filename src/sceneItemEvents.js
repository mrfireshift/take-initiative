import OBR from "@owlbear-rodeo/sdk";
import { createSceneItemChangeDispatcher } from "./sceneItemChangeDispatcherCore.js";

const dispatcher = createSceneItemChangeDispatcher({
  debounceMs: 50,
  subscribeSource: (handler) => OBR.scene.items.onChange(handler),
});

export function subscribeSceneItemChanges(handler, options = {}) {
  return dispatcher.subscribe(handler, options);
}