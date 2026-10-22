// The rules text of the class features (class-features-descriptions.json, written by
// scripts/generate-class-feature-catalog.mjs). Only the character sheet shows it: it loads the file after its first
// render, so the tracker and the background never parse it.
let descriptions = null;
let loading = null;

export function classFeatureDescriptionsLoaded() {
  return !!descriptions;
}

export function loadClassFeatureDescriptions() {
  loading ||= import("./classFeatureDescriptionsData.js")
    .then((module) => { descriptions = module.default || {}; })
    .catch((error) => {
      loading = null;
      throw error;
    });
  return loading;
}

// The text of a class feature once loaded; a species trait carries its own.
export function classFeatureDescription(feature) {
  return descriptions?.[feature?.id] || feature?.description || "";
}
