/**
 * Selects the raw item array for a full tracker render. The caller owns the
 * render/state guards; this provider only decides whether the Event Hub
 * snapshot is current enough or one full SDK read is required.
 */
export async function readFullRenderItemSnapshot({
  snapshot = null,
  sceneEpoch = null,
  sourceRevision = 0,
  sourceGeneration = 0,
  readItems,
} = {}) {
  const revision = Number(snapshot?.revision) || 0;
  const generation = Number(snapshot?.generation) || 0;
  const requestedRevision = Number(sourceRevision) || 0;
  const requestedGeneration = Number(sourceGeneration) || 0;
  const sameEpoch = sceneEpoch === null || sceneEpoch === undefined
    || snapshot?.sceneEpoch === undefined
    || Number(snapshot.sceneEpoch) === Number(sceneEpoch);
  const reusable = snapshot?.complete === true
    && sameEpoch
    && (requestedRevision <= 0 || revision >= requestedRevision)
    && (requestedGeneration <= 0 || generation >= requestedGeneration);
  if (reusable) {
    return {
      items: Array.isArray(snapshot.items) ? snapshot.items : [],
      reused: true,
      fallback: false,
      revision,
      generation,
    };
  }
  if (typeof readItems !== "function") {
    throw new TypeError("full-render-item-reader-required");
  }
  const items = await readItems();
  return {
    items: Array.isArray(items) ? items : [],
    reused: false,
    fallback: true,
    revision,
    generation,
  };
}

