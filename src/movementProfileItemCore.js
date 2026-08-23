import { ID } from "./constants.js";
import { getEnabledClassFeatures } from "./classFeatureCatalog.js";
import { classFeaturePassiveMovementMechanics } from "./classFeatureCore.js";
import { resolveConditionSpeed } from "./conditionSpeedCore.js";
import { getConditionInstances } from "./conditions.js";
import { getInitiativeCard } from "./initiativeCards.js";

const META_KEY = `${ID}/meta`;
const SPELLS_META_KEY = `${ID}/spells`;

export function resolveItemMovementProfile(
  item = null,
  baseSpeedMeters = undefined,
  preferredMode = "walk",
) {
  const meta = item?.metadata?.[META_KEY] || {};
  const profile = getInitiativeCard(item);
  const baseSpeed = baseSpeedMeters === undefined
    ? profile?.speed
    : baseSpeedMeters;
  const passiveFeatureInstances = getEnabledClassFeatures(profile)
    .map((feature) => {
      const movement = classFeaturePassiveMovementMechanics(feature);
      return movement
        ? {
          id: `class-feature-passive:${feature.id}`,
          effectId: feature.id,
          condition: feature.name,
          active: true,
          mechanics: { movement },
        }
        : null;
    })
    .filter(Boolean);
  return resolveConditionSpeed(
    baseSpeed,
    [
      ...passiveFeatureInstances,
      ...getConditionInstances(meta.conditions || {}),
    ],
    meta[SPELLS_META_KEY] || [],
    preferredMode,
  );
}

export function itemHasEffectiveMovementMode(
  item = null,
  mode = "",
  baseSpeedMeters = undefined,
) {
  const wanted = String(mode || "").trim().toLocaleLowerCase("it");
  if (!wanted) return false;
  const profile = resolveItemMovementProfile(item, baseSpeedMeters, wanted);
  return (Array.isArray(profile?.movementModes) ? profile.movementModes : [])
    .some((entry) => (
      String(entry?.id || "").trim().toLocaleLowerCase("it") === wanted
      && Number(entry?.speedMeters) > 0
    ));
}
