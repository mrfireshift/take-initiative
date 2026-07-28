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
    const values = typeof entry === "string"
      ? [entry]
      : [entry.spellId, entry.name];
    for (const value of values) {
      const key = String(value || "").trim().toLocaleLowerCase("it");
      if (key) keys.add(key);
    }
  }
  return keys;
}

function activeMovementMechanics(instances) {
  const seen = new Set();
  let addMeters = 0;
  let maximumMeters = Infinity;
  let setMeters = null;
  const reasons = [];

  for (const instance of Array.isArray(instances) ? instances : []) {
    if (!instance || instance.active === false) continue;
    const movement = instance.mechanics?.movement;
    if (!movement || typeof movement !== "object") continue;
    const identity = String(
      instance.effectId || instance.condition || instance.name || instance.id || ""
    ).trim().toLocaleLowerCase("it");
    if (identity && seen.has(identity)) continue;
    if (identity) seen.add(identity);

    const addition = Number(movement.addMeters);
    if (Number.isFinite(addition)) addMeters += addition;
    const maximum = Number(movement.maximumMeters);
    if (Number.isFinite(maximum) && maximum >= 0) {
      maximumMeters = Math.min(maximumMeters, maximum);
    }
    const fixed = Number(movement.setMeters);
    if (Number.isFinite(fixed) && fixed >= 0) {
      setMeters = setMeters == null ? fixed : Math.min(setMeters, fixed);
    }
    const label = String(movement.label || "").trim();
    if (label) reasons.push(label);
  }

  return { addMeters, maximumMeters, setMeters, reasons };
}

export function resolveConditionSpeed(baseSpeedMeters, instances = [], spells = []) {
  const baseSpeed = Math.max(0, Number(baseSpeedMeters) || 0);
  const names = activeConditionNames(instances);
  const movement = activeMovementMechanics(instances);
  const spellKeys = activeSpellKeys(spells);
  const exhaustionLevel = exhaustionLevelFromInstances(instances);
  const prone = names.has("prono");
  const reasons = [];

  for (const [key, label] of ZERO_SPEED_CONDITIONS) {
    if (names.has(key)) reasons.push(label);
  }
  if (exhaustionLevel >= 5) reasons.push(`Indebolimento ${exhaustionLevel}`);
  const hasHypnoticPattern = spellKeys.has("hypnotic-pattern")
    || spellKeys.has("hypnotic pattern")
    || spellKeys.has("trama ipnotica");
  if (hasHypnoticPattern) reasons.push("Trama Ipnotica");
  if (movement.setMeters === 0) reasons.push(...movement.reasons);

  const blocked = reasons.length > 0 || movement.setMeters === 0;

  const hasLongstrider = spellKeys.has("longstrider") || spellKeys.has("passo veloce") || spellKeys.has("passo lunare");
  const hasRayOfFrost = spellKeys.has("ray-of-frost") || spellKeys.has("ray of frost") || spellKeys.has("raggio di gelo");
  const hasHaste = spellKeys.has("haste") || spellKeys.has("velocita") || spellKeys.has("velocità");
  const hasSlow = spellKeys.has("slow") || spellKeys.has("lentezza");

  let modifiedBase = baseSpeed;
  if (!blocked) {
    if (movement.addMeters) {
      modifiedBase = Math.max(0, modifiedBase + movement.addMeters);
      reasons.push(...movement.reasons);
    }
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
    if (Number.isFinite(movement.maximumMeters)) {
      speed = Math.min(speed, movement.maximumMeters);
      if (!movement.addMeters) reasons.push(...movement.reasons);
    }
    if (movement.setMeters != null) speed = movement.setMeters;
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
