import OBR from "@owlbear-rodeo/sdk";
import {
  currentSceneEpoch,
  isCurrentSceneEpoch,
  subscribeSceneEpoch,
} from "./sceneEpoch.js";
import { METADATA_OWNERSHIP, writeSceneMetadataKey } from "./metadataKeyScoped.js";
import {
  createInitiativeStateGateway,
  INITIATIVE_STATE_STATUS,
} from "./initiativeStateGatewayCore.js";

let commandSequence = 0;

function sceneContext() {
  const epoch = currentSceneEpoch();
  return {
    ready: isCurrentSceneEpoch(epoch),
    identity: null,
    epoch,
  };
}

export const initiativeStateGateway = createInitiativeStateGateway({
  readState: async ({ scene }) => {
    const metadata = await OBR.scene.getMetadata();
    return metadata?.[METADATA_OWNERSHIP.INITIATIVE_STATE.key];
  },
  writeState: (value, { command }) => writeSceneMetadataKey(
    OBR.scene,
    METADATA_OWNERSHIP.INITIATIVE_STATE,
    value,
    {
      runtime: "initiativeStateGateway",
      commandId: command.commandId,
    },
  ),
  getRole: () => OBR.player.getRole(),
  getSceneContext: sceneContext,
  isSceneCurrent: (captured) => isCurrentSceneEpoch(captured.epoch),
  readBack: true,
});

// The tracker lifecycle invalidates the epoch on unload. Clearing the local
// dedup/pending index here prevents a command from scene A being recognized as
// a retry after the next scene is ready. The queue itself remains chained so
// old SDK awaits cannot overlap a new scene write.
subscribeSceneEpoch(({ phase }) => {
  if (phase === "unload") initiativeStateGateway.resetSceneScope();
});

export function nextInitiativeStateCommandId(prefix = "state") {
  commandSequence += 1;
  return `initiative-state:${String(prefix || "state")}:${currentSceneEpoch()}:${commandSequence}`;
}

export function enqueueInitiativeStatePatch({
  commandId = nextInitiativeStateCommandId("patch"),
  patch,
  ownedFields,
  expected,
  payload,
  sceneEpoch = currentSceneEpoch(),
  sceneIdentity,
  kind = "patch",
  readBack,
} = {}) {
  return initiativeStateGateway.enqueue({
    commandId,
    kind,
    operation: kind,
    patch,
    ownedFields,
    expected,
    payload,
    sceneEpoch,
    sceneIdentity,
    ...(readBack === undefined ? {} : { readBack }),
  });
}

export function enqueueInitiativeStateReducer({
  commandId = nextInitiativeStateCommandId("reducer"),
  reducer,
  ownedFields,
  expected,
  payload,
  sceneEpoch = currentSceneEpoch(),
  sceneIdentity,
  kind = "reducer",
  readBack,
} = {}) {
  return initiativeStateGateway.enqueue({
    commandId,
    kind,
    operation: kind,
    reducer,
    ownedFields,
    expected,
    payload,
    sceneEpoch,
    sceneIdentity,
    ...(readBack === undefined ? {} : { readBack }),
  });
}

export function initiativeStateResultApplied(result) {
  return result?.status === INITIATIVE_STATE_STATUS.APPLIED
    || result?.status === INITIATIVE_STATE_STATUS.UNCHANGED
    || result?.status === INITIATIVE_STATE_STATUS.DUPLICATE;
}

export { INITIATIVE_STATE_STATUS };
