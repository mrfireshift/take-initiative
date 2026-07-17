import { exhaustionLevelFromInstances } from "./exhaustionCore.js";
import { SPEED_CHECK_METERS_PER_CELL } from "./speedCheckCore.js";

const ZERO_SPEED_CONDITIONS = Object.freeze(new Map([
  ["afferrato", "Afferrato"],
  ["trattenuto", "Trattenuto"],
  ["paralizzato", "Paralizzato"],
  ["pietrificato", "Pietrificato"],
  ["stordito", "Stordito"],
  ["privo di sensi", "Privo di sensi"],
]));

function activeConditionNames(instances) {
  const names = new Map();
  for (const instance of Array.isArray(instances) ? instances : []) {
    if (!instance || instance.active === false) continue;
    const name = String(instance.condition || instance.name || "").trim();
    if (name) names.set(name.toLocaleLowerCase("it"), name);
  }
  return names;
}

function halvedSpeedInWholeCells(baseSpeedMeters) {
  const baseCells = Math.max(0, Number(baseSpeedMeters) || 0) / SPEED_CHECK_METERS_PER_CELL;
  const halvedCells = Math.floor((baseCells / 2) + 1e-9);
  return halvedCells * SPEED_CHECK_METERS_PER_CELL;
}

export function resolveConditionSpeed(baseSpeedMeters, instances = []) {
  const baseSpeed = Math.max(0, Number(baseSpeedMeters) || 0);
  const names = activeConditionNames(instances);
  const exhaustionLevel = exhaustionLevelFromInstances(instances);
  const prone = names.has("prono");
  const reasons = [];

  for (const [key, label] of ZERO_SPEED_CONDITIONS) {
    if (names.has(key)) reasons.push(label);
  }
  if (exhaustionLevel >= 5) reasons.push(`Indebolimento ${exhaustionLevel}`);

  const blocked = reasons.length > 0;
  const halved = !blocked && exhaustionLevel >= 2;
  if (halved) reasons.push(`Indebolimento ${exhaustionLevel}: velocità dimezzata`);
  if (prone) reasons.push("Prono: movimento ×2");

  const speedMeters = blocked
    ? 0
    : halved
      ? halvedSpeedInWholeCells(baseSpeed)
      : baseSpeed;

  return {
    baseSpeedMeters: baseSpeed,
    speedMeters,
    exhaustionLevel,
    multiplier: blocked ? 0 : halved ? 0.5 : 1,
    blocked,
    blocksSpeedBonuses: blocked,
    prone,
    movementCostMultiplier: prone ? 2 : 1,
    reasons,
    summary: reasons.join(" · "),
  };
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
