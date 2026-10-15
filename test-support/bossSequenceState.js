// Boss Actions tests: a boss token whose round log (profile v19+) already holds the given Epic Actions,
// e.g. Breathe Deep before Breath of the Long Night or Gather the Winter Sky before Meteor Swarm.
const META = "com.thebigpicture.initiative/meta";

export function bossStateWithEpicLog(item, profile, round, actionIds = []) {
  const previous = item.metadata?.[META]?.bossActionState || {};
  return {
    version: 1, boundTokenId: item.id, bossDefinitionId: profile.bossDefinitionId,
    bossInstanceId: `boss-instance:${item.id}:${profile.bossDefinitionId}`, ...previous,
    epicLog: { round, actionIds: [...actionIds] },
  };
}

export function withEpicLog(item, profile, round, actionIds = []) {
  const copy = structuredClone(item);
  copy.metadata = { ...copy.metadata, [META]: { ...copy.metadata?.[META], bossActionState: bossStateWithEpicLog(item, profile, round, actionIds) } };
  return copy;
}
