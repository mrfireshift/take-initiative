import { initiativeStateDigest } from "./initiativeRenderCore.js";

function metadataValue(metadata, key) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return undefined;
  return metadata[key];
}

export function sceneMetadataKeyDigest(metadata, key) {
  return initiativeStateDigest(metadataValue(metadata, key));
}

export function createSceneMetadataKeyWatcher(key, digest = sceneMetadataKeyDigest) {
  let initialized = false;
  let previousDigest = null;

  function observe(metadata) {
    const nextDigest = digest(metadata, key);
    const changed = !initialized || nextDigest !== previousDigest;
    initialized = true;
    previousDigest = nextDigest;
    return {
      changed,
      digest: nextDigest,
      value: metadataValue(metadata, key),
    };
  }

  function seed(metadata) {
    const result = observe(metadata);
    return { ...result, changed: false };
  }

  function reset() {
    initialized = false;
    previousDigest = null;
  }

  return Object.freeze({
    observe,
    seed,
    reset,
    get digest() {
      return previousDigest;
    },
    get initialized() {
      return initialized;
    },
  });
}
