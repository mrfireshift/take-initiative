import { SPEED_CHECK_METERS_PER_CELL } from "./speedCheckCore.js";
import { resolveMovementProfile } from "./movementProfileCore.js";

export { resolveMovementProfile } from "./movementProfileCore.js";

export function resolveConditionSpeed(
  baseSpeedMeters,
  instances = [],
  spells = [],
  preferredMode = "walk",
) {
  return resolveMovementProfile(baseSpeedMeters, instances, spells, preferredMode);
}

export function proneStandingCostMeters(effectiveSpeedMeters) {
  const speed = Math.max(0, Number(effectiveSpeedMeters) || 0);
  return Math.round((speed / 2) * 1000) / 1000;
}

export function conditionMovementCostCells(movedCells, multiplier = 1) {
  const cells = Math.max(0, Number(movedCells) || 0);
  const cost = Math.max(1, Number(multiplier) || 1);
  return cells * cost;
}
