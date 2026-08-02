import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { normalizeClocksState } from "./clocksCore.js";
import {
  METADATA_OWNERSHIP,
  writeSceneMetadataKey,
} from "./metadataKeyScoped.js";

export const CLOCKS_KEY = `${ID}/clocks`;
export const CLOCKS_POPOVER_ID = `${ID}/clocks-popover`;
export const CLOCKS_POPOVER_CHANNEL = `${ID}/clocks-popover-events`;

let writeQueue = Promise.resolve();

export async function loadClocksState() {
  if (!await OBR.scene.isReady().catch(() => false)) return normalizeClocksState(null);
  const metadata = await OBR.scene.getMetadata();
  return normalizeClocksState(metadata?.[CLOCKS_KEY]);
}

export function updateClocksState(mutator) {
  const run = async () => {
    if (!await OBR.scene.isReady().catch(() => false)) return normalizeClocksState(null);
    const metadata = await OBR.scene.getMetadata();
    const current = normalizeClocksState(metadata?.[CLOCKS_KEY]);
    const candidate = await mutator({
      ...current,
      clocks: current.clocks.map((clock) => ({ ...clock })),
    });
    const next = normalizeClocksState(candidate || current);
    await writeSceneMetadataKey(
      OBR.scene,
      METADATA_OWNERSHIP.CLOCKS,
      next,
      { runtime: "clocks" },
    );
    return next;
  };
  writeQueue = writeQueue.then(run, run);
  return writeQueue;
}
