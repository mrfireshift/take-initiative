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

function activeSpellKeys(spells) {
  const keys = new Set();
  for (const entry of Array.isArray(spells) ? spells : []) {
    if (!entry) continue;
    const name = String(typeof entry === "string" ? entry : entry.name || "").trim().toLocaleLowerCase("it");
    if (name) keys.add(name);
  }
  return keys;
}

export function resolveConditionSpeed(baseSpeedMeters, instances = [], spells = []) {
  const baseSpeed = Math.max(0, Number(baseSpeedMeters) || 0);
  const names = activeConditionNames(instances);
  const spellKeys = activeSpellKeys(spells);
  const exhaustionLevel = exhaustionLevelFromInstances(instances);
  const prone = names.has("prono");
  const reasons = [];

  for (const [key, label] of ZERO_SPEED_CONDITIONS) {
    if (names.has(key)) reasons.push(label);
  }
  if (exhaustionLevel >= 5) reasons.push(`Indebolimento ${exhaustionLevel}`);

  const blocked = reasons.length > 0;

  const hasLongstrider = spellKeys.has("longstrider") || spellKeys.has("passo veloce") || spellKeys.has("passo lunare");
  const hasRayOfFrost = spellKeys.has("ray of frost") || spellKeys.has("raggio di gelo");
  const hasHaste = spellKeys.has("haste") || spellKeys.has("velocita") || spellKeys.has("velocità");
  const hasSlow = spellKeys.has("slow") || spellKeys.has("lentezza");

  let modifiedBase = baseSpeed;
  if (!blocked) {
    if (hasLongstrider) {
      modifiedBase += 3;
      reasons.push("Passo Veloce (+3m)");
    }
    if (hasRayOfFrost) {
      modifiedBase = Math.max(0, modifiedBase - 3);
      reasons.push("Raggio di Gelo (-3m)");
    }
  }

  const halved = !blocked && (exhaustionLevel >= 2 || hasSlow);
  if (!blocked && exhaustionLevel >= 2) reasons.push(`Indebolimento ${exhaustionLevel}: velocità dimezzata`);
  if (!blocked && hasSlow) reasons.push("Lentezza: velocità dimezzata");

  if (!blocked && hasHaste) reasons.push("Velocità (×2)");
  if (prone) reasons.push("Prono: movimento ×2");

  let speedMeters = 0;
  if (blocked) {
    speedMeters = 0;
  } else {
    let speed = modifiedBase;
    if (hasHaste) speed = speed * 2;
    if (halved) speed = halvedSpeedInWholeCells(speed);
    speedMeters = Math.max(0, speed);
  }

  const multiplier = blocked ? 0 : (hasHaste ? 2 : 1) * (halved ? 0.5 : 1);

  return {
    baseSpeedMeters: baseSpeed,
    speedMeters,
    exhaustionLevel,
    multiplier,
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
