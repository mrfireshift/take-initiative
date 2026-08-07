import { selectOptionsRevision } from "./optionsSelectors.js";

const asRevision = (value) => ({
  roomUpdatedAt: Math.max(0, Math.round(Number(value?.roomUpdatedAt) || 0)),
  sceneUpdatedAt: Math.max(0, Math.round(Number(value?.sceneUpdatedAt) || 0)),
});

export function optionsRevisionReached(current, expected) {
  const actual = asRevision(current);
  const target = asRevision(expected);
  return actual.roomUpdatedAt >= target.roomUpdatedAt
    && actual.sceneUpdatedAt >= target.sceneUpdatedAt;
}

export async function refreshOptionsUntilRevision(service, expectedRevision, {
  attempts = 6,
  delaysMs = [150, 300, 600, 1_000, 1_500],
  wait = (ms) => new Promise((resolve) => globalThis.setTimeout(resolve, ms)),
} = {}) {
  if (!service?.refresh || !service?.get) {
    throw new TypeError("options synchronization requires refresh and selector access");
  }
  const target = asRevision(expectedRevision);
  let current = asRevision(service.get(selectOptionsRevision));
  if (optionsRevisionReached(current, target)) return current;

  const limit = Math.max(1, Math.round(Number(attempts) || 1));
  for (let attempt = 0; attempt < limit; attempt += 1) {
    const delay = Math.max(0, Number(delaysMs[attempt] ?? delaysMs.at(-1) ?? 0) || 0);
    if (delay) await wait(delay);
    await service.refresh("broadcast-invalidation");
    current = asRevision(service.get(selectOptionsRevision));
    if (optionsRevisionReached(current, target)) return current;
  }
  throw new Error(
    `options-revision-timeout room=${current.roomUpdatedAt}/${target.roomUpdatedAt} `
    + `scene=${current.sceneUpdatedAt}/${target.sceneUpdatedAt}`,
  );
}
