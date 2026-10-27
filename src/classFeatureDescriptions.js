// The rules text of the class features (class-features-descriptions.json, written by
// scripts/generate-class-feature-catalog.mjs). Only the character sheet shows it: it loads the file after its first
// render, so the tracker and the background never parse it. The file holds the SRD texts only: the others come from
// the GM's private packs (compendio delle regole, fase 2), read with it.
import { PRIVATE_PACK_BOOKS } from "./privatePackCore.js";

let descriptions = null;
let loading = null;
let privateTexts = new Map();

// The class-feature texts of the packs this browser keeps; none when IndexedDB is unavailable.
function loadPrivateTexts() {
  return import("./privatePackStore.js")
    .then((store) => store.createPrivatePackStore().all())
    .then((packs) => new Map(packs.flatMap((pack) => Object.entries(pack.classFeatures || {}))))
    .catch(() => new Map());
}

export function classFeatureDescriptionsLoaded() {
  return !!descriptions;
}

export function loadClassFeatureDescriptions() {
  loading ||= Promise.all([import("./classFeatureDescriptionsData.js"), loadPrivateTexts()])
    .then(([module, texts]) => {
      privateTexts = texts;
      descriptions = module.default || {};
    })
    .catch((error) => {
      loading = null;
      throw error;
    });
  return loading;
}

// The text of a class feature once loaded: the SRD one, else its pack's; a species trait carries its own.
export function classFeatureDescription(feature) {
  return descriptions?.[feature?.id] || privateTexts.get(feature?.id) || feature?.description || "";
}

// The manual whose private pack holds the text of a feature this browser has not imported, once the texts are
// loaded; "" for a feature with its text or from no manual of the packs.
export function classFeatureMissingText(feature) {
  if (!descriptions || classFeatureDescription(feature)) return "";
  return PRIVATE_PACK_BOOKS[feature?.source] ? feature.source : "";
}
