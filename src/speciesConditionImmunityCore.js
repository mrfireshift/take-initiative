// The conditions a species is immune to (Volo's yuan-ti pureblood and the grung: poisoned), read by the effects engine
// with the creature (effectsMutations.js → effectsMutationCore.js), which then never adds that condition. Kept apart
// from the species catalog so the engine does not load it.
// Pure: no SDK, DOM or runtime state.
const SPECIES_CONDITION_IMMUNITIES = Object.freeze({
  "yuan-ti": Object.freeze(["Avvelenato"]),
  grung: Object.freeze(["Avvelenato"]),
});

// The condition names the profile's species is immune to ([] for none).
export function speciesConditionImmunities(species) {
  const id = String(species?.id || "").trim();
  return SPECIES_CONDITION_IMMUNITIES[id] ? [...SPECIES_CONDITION_IMMUNITIES[id]] : [];
}
