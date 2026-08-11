import { exhaustionLevelFromInstances } from "./exhaustionCore.js";
import { SPEED_CHECK_METERS_PER_CELL } from "./speedCheckCore.js";

export const MOVEMENT_MODE_ORDER = Object.freeze(["walk", "fly", "swim", "climb"]);

export const MOVEMENT_MODE_LABELS = Object.freeze({
  walk: "Camminare",
  fly: "Volare",
  swim: "Nuotare",
  climb: "Scalare",
});

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

function movementRules(instances) {
  const seen = new Set();
  const rules = [];
  for (const instance of Array.isArray(instances) ? instances : []) {
    if (!instance || instance.active === false) continue;
    const movement = instance.mechanics?.movement;
    if (!movement || typeof movement !== "object") continue;
    const identity = [
      instance.sourceId || "",
      instance.parentEffectId || instance.parentInstanceId || "",
      instance.effectId || instance.condition || instance.name || instance.id || "",
    ].join("|").trim().toLocaleLowerCase("it");
    if (identity && seen.has(identity)) continue;
    if (identity) seen.add(identity);
    rules.push({
      ...movement,
      ...(instance.condition || instance.name
        ? { conditionName: String(instance.condition || instance.name).trim() }
        : {}),
      ...(instance.sourceId && !movement.sourceId
        ? { sourceId: String(instance.sourceId) }
        : {}),
      ...(instance.parentEffectId && !movement.instanceId
        ? { instanceId: String(instance.parentEffectId) }
        : instance.parentInstanceId && !movement.instanceId
          ? { instanceId: String(instance.parentInstanceId) }
          : {}),
      ...(instance.type && !movement.sourceType
        ? { sourceType: String(instance.type) }
        : {}),
      ...(instance.type === "spell" && movement.magical !== true
        ? { magical: true }
        : {}),
    });
  }
  return rules;
}

function finiteNonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function normalizedModes(value) {
  return new Set((Array.isArray(value) ? value : [])
    .map((mode) => String(mode || "").trim().toLocaleLowerCase("it"))
    .filter((mode) => MOVEMENT_MODE_ORDER.includes(mode)));
}

function ruleAppliesToMode(rule, mode) {
  if (!Array.isArray(rule?.appliesTo) || !rule.appliesTo.length) return true;
  return normalizedModes(rule.appliesTo).has(mode);
}

function pushUnique(values, value) {
  const label = String(value || "").trim();
  if (label && !values.includes(label)) values.push(label);
}

function normalizedMovementImmunity(value) {
  const key = String(value || "").trim().toLocaleLowerCase("it");
  if (["difficult-terrain", "difficult terrain", "terreno difficile"].includes(key)) {
    return "difficult-terrain";
  }
  if ([
    "magical-speed-reduction",
    "magical speed reduction",
    "riduzione velocità magica",
    "riduzione velocita magica",
  ].includes(key)) {
    return "magical-speed-reduction";
  }
  return "";
}

function movementImmunities(rule) {
  const values = [
    ...(Array.isArray(rule?.immunities) ? rule.immunities : []),
    ...(Array.isArray(rule?.immuneTo) ? rule.immuneTo : []),
    ...(rule?.ignoreDifficultTerrain === true ? ["difficult-terrain"] : []),
    ...(rule?.ignoreMagicalSpeedReductions === true
      ? ["magical-speed-reduction"]
      : []),
  ];
  return values.map(normalizedMovementImmunity).filter(Boolean);
}

function directionalMovementEntries(rule, inherited = {}) {
  const raw = rule?.directional
    ?? rule?.directionalCosts
    ?? rule?.directionalCost
    ?? [];
  const entries = Array.isArray(raw) ? raw : [raw];
  return entries.map((entry) => {
    if (!entry || typeof entry !== "object") return null;
    const costMultiplier = Number(entry.costMultiplier);
    if (!Number.isFinite(costMultiplier) || costMultiplier < 1) return null;
    const direction = String(entry.direction || "toward-source").trim().toLocaleLowerCase("it");
    if (direction !== "toward-source") return null;
    return {
      direction,
      costMultiplier,
      sourceId: String(entry.sourceId || rule?.sourceId || inherited.sourceId || "").trim(),
      instanceId: String(
        entry.instanceId || rule?.instanceId || inherited.instanceId || ""
      ).trim(),
      zoneId: String(entry.zoneId || rule?.zoneId || "").trim(),
      label: String(entry.label || rule?.label || "Costo direzionale").trim(),
    };
  }).filter(Boolean);
}

function halvedSpeedInWholeCells(baseSpeedMeters) {
  const baseCells = Math.max(0, Number(baseSpeedMeters) || 0) / SPEED_CHECK_METERS_PER_CELL;
  return Math.floor((baseCells / 2) + 1e-9) * SPEED_CHECK_METERS_PER_CELL;
}

function spellFlags(spellKeys) {
  return {
    longstrider: spellKeys.has("longstrider")
      || spellKeys.has("passo veloce")
      || spellKeys.has("passo lunare"),
    rayOfFrost: spellKeys.has("ray-of-frost")
      || spellKeys.has("ray of frost")
      || spellKeys.has("raggio di gelo"),
    haste: spellKeys.has("haste")
      || spellKeys.has("velocita")
      || spellKeys.has("velocità"),
    slow: spellKeys.has("slow") || spellKeys.has("lentezza"),
    freedomOfMovement: spellKeys.has("freedom-of-movement")
      || spellKeys.has("libertà di movimento")
      || spellKeys.has("liberta di movimento"),
    hypnoticPattern: spellKeys.has("hypnotic-pattern")
      || spellKeys.has("hypnotic pattern")
      || spellKeys.has("trama ipnotica"),
  };
}

function baseModeSources(baseSpeedMeters, rules) {
  const sources = new Map([["walk", Math.max(0, Number(baseSpeedMeters) || 0)]]);
  const copies = [];

  for (const rule of rules) {
    const modes = rule?.modes && typeof rule.modes === "object" ? rule.modes : {};
    for (const mode of MOVEMENT_MODE_ORDER) {
      const definition = modes[mode];
      if (!definition || typeof definition !== "object") continue;
      const granted = finiteNonNegative(definition.grantMeters);
      if (granted != null) {
        sources.set(mode, Math.max(sources.get(mode) ?? 0, granted));
      }
      const copyFrom = String(definition.copyFrom || definition.copy || "")
        .trim()
        .toLocaleLowerCase("it");
      if (MOVEMENT_MODE_ORDER.includes(copyFrom)) copies.push({ mode, copyFrom });
    }
  }

  for (let pass = 0; pass < MOVEMENT_MODE_ORDER.length; pass += 1) {
    let changed = false;
    for (const { mode, copyFrom } of copies) {
      if (!sources.has(copyFrom)) continue;
      const copied = sources.get(copyFrom);
      if (!sources.has(mode) || copied > sources.get(mode)) {
        sources.set(mode, copied);
        changed = true;
      }
    }
    if (!changed) break;
  }

  let exclusive = null;
  const suppressed = new Set();
  for (const rule of rules) {
    const declaredExclusive = normalizedModes(rule?.exclusiveModes);
    if (declaredExclusive.size) {
      exclusive = exclusive == null
        ? declaredExclusive
        : new Set([...exclusive].filter((mode) => declaredExclusive.has(mode)));
    }
    for (const mode of normalizedModes(rule?.suppressModes)) suppressed.add(mode);
  }

  for (const mode of [...sources.keys()]) {
    if ((exclusive && !exclusive.has(mode)) || suppressed.has(mode)) sources.delete(mode);
  }
  return sources;
}

function resolveMode({
  mode,
  sourceMeters,
  rules,
  names,
  flags,
  exhaustionLevel,
  prone,
}) {
  const reasons = [];
  let addMeters = 0;
  let maximumMeters = Infinity;
  let setMeters = null;
  let movementMultiplier = 1;
  let movementCostMultiplier = 1;
  const movementImmunitySet = new Set(
    rules.flatMap((rule) => movementImmunities(rule))
  );
  if (flags.freedomOfMovement) {
    movementImmunitySet.add("difficult-terrain");
    movementImmunitySet.add("magical-speed-reduction");
  }
  const directionalCostModifiers = [];
  const directionalKeys = new Set();
  const ignoreDifficultTerrain = movementImmunitySet.has("difficult-terrain");
  const ignoreMagicalSpeedReductions = movementImmunitySet.has("magical-speed-reduction");
  const isMagicalReduction = (rule, value, property) => {
    if (rule?.magical !== true && rule?.sourceType !== "spell") return false;
    if (property === "multiplier") return Number(value) < 1;
    return (property === "maximum" || property === "setMeters")
      && Number(value) < sourceMeters;
  };
  const isDifficultTerrain = (rule) => (
    rule?.category === "difficult-terrain"
      || rule?.movementCategory === "difficult-terrain"
      || /\bterreno difficile\b/iu.test(
        String(rule?.conditionName || rule?.label || ""),
      )
  );
  const collectDirectional = (rule, definition = null) => {
    const entries = directionalMovementEntries(definition || rule, {
      sourceId: rule?.sourceId,
      instanceId: rule?.instanceId,
    });
    for (const entry of entries) {
      const key = [
        entry.sourceId,
        entry.instanceId,
        entry.zoneId,
        entry.direction,
        entry.costMultiplier,
      ].join("|");
      if (directionalKeys.has(key)) continue;
      directionalKeys.add(key);
      directionalCostModifiers.push(entry);
      pushUnique(reasons, entry.label);
    }
    return entries.length > 0;
  };

  for (const rule of rules) {
    const definition = rule?.modes?.[mode];
    let touched = false;
    if (ruleAppliesToMode(rule, mode)) {
      const addition = Number(rule.addMeters);
      if (Number.isFinite(addition)) {
        addMeters += addition;
        touched = true;
      }
      const maximum = finiteNonNegative(rule.maximumMeters);
      if (maximum != null && !(
        ignoreMagicalSpeedReductions && isMagicalReduction(rule, maximum, "maximum")
      )) {
        maximumMeters = Math.min(maximumMeters, maximum);
        touched = true;
      }
      const fixed = finiteNonNegative(rule.setMeters);
      if (fixed != null && !(
        ignoreMagicalSpeedReductions && isMagicalReduction(rule, fixed, "setMeters")
      )) {
        setMeters = setMeters == null ? fixed : Math.min(setMeters, fixed);
        touched = true;
      }
      const multiplier = finiteNonNegative(rule.multiplier);
      if (multiplier != null && !(
        ignoreMagicalSpeedReductions && isMagicalReduction(rule, multiplier, "multiplier")
      )) {
        movementMultiplier *= multiplier;
        touched = true;
      }
      const costMultiplier = finiteNonNegative(rule.costMultiplier);
      if (
        costMultiplier != null
        && costMultiplier >= 1
        && !(ignoreDifficultTerrain && isDifficultTerrain(rule))
      ) {
        movementCostMultiplier = Math.max(movementCostMultiplier, costMultiplier);
        touched = true;
      }
      touched ||= collectDirectional(rule);
    }
    if (definition && typeof definition === "object") {
      const addition = Number(definition.addMeters);
      if (Number.isFinite(addition)) {
        addMeters += addition;
        touched = true;
      }
      const maximum = finiteNonNegative(definition.maximumMeters);
      if (maximum != null && !(
        ignoreMagicalSpeedReductions && isMagicalReduction(rule, maximum, "maximum")
      )) {
        maximumMeters = Math.min(maximumMeters, maximum);
        touched = true;
      }
      const fixed = finiteNonNegative(definition.setMeters);
      if (fixed != null && !(
        ignoreMagicalSpeedReductions && isMagicalReduction(rule, fixed, "setMeters")
      )) {
        setMeters = setMeters == null ? fixed : Math.min(setMeters, fixed);
        touched = true;
      }
      const multiplier = finiteNonNegative(definition.multiplier);
      if (multiplier != null && !(
        ignoreMagicalSpeedReductions && isMagicalReduction(rule, multiplier, "multiplier")
      )) {
        movementMultiplier *= multiplier;
        touched = true;
      }
      const costMultiplier = finiteNonNegative(definition.costMultiplier);
      if (
        costMultiplier != null
        && costMultiplier >= 1
        && !(ignoreDifficultTerrain && isDifficultTerrain({ ...rule, ...definition }))
      ) {
        movementCostMultiplier = Math.max(movementCostMultiplier, costMultiplier);
        touched = true;
      }
      touched ||= collectDirectional(rule, definition);
      touched ||= finiteNonNegative(definition.grantMeters) != null
        || !!definition.copyFrom
        || !!definition.copy;
    }
    const exclusive = normalizedModes(rule?.exclusiveModes);
    touched ||= exclusive.has(mode);
    if (touched) pushUnique(reasons, rule.label);
  }

  const blockedReasons = [];
  for (const [key, label] of ZERO_SPEED_CONDITIONS) {
    if (names.has(key)) pushUnique(blockedReasons, label);
  }
  if (exhaustionLevel >= 5) pushUnique(blockedReasons, `Indebolimento ${exhaustionLevel}`);
  if (flags.hypnoticPattern) pushUnique(blockedReasons, "Trama Ipnotica");

  let speed = Math.max(0, sourceMeters + addMeters);
  if (flags.longstrider) {
    speed += 3;
    pushUnique(reasons, "Passo Veloce (+3m)");
  }
  if (flags.rayOfFrost && !flags.freedomOfMovement) {
    speed = Math.max(0, speed - 3);
    pushUnique(reasons, "Raggio di Gelo (-3m)");
  }

  const halved = exhaustionLevel >= 2 || (flags.slow && !flags.freedomOfMovement);
  if (flags.haste) {
    speed *= 2;
    pushUnique(reasons, "Velocità (×2)");
  }
  if (halved) {
    speed = halvedSpeedInWholeCells(speed);
    if (exhaustionLevel >= 2) {
      pushUnique(reasons, `Indebolimento ${exhaustionLevel}: velocità dimezzata`);
    }
    if (flags.slow) pushUnique(reasons, "Lentezza: velocità dimezzata");
  }
  if (movementMultiplier !== 1) {
    speed = movementMultiplier < 1
      ? Math.floor(((speed / SPEED_CHECK_METERS_PER_CELL) * movementMultiplier) + 1e-9)
        * SPEED_CHECK_METERS_PER_CELL
      : speed * movementMultiplier;
  }
  if (Number.isFinite(maximumMeters)) speed = Math.min(speed, maximumMeters);
  if (setMeters != null) speed = setMeters;

  const forcedZero = maximumMeters === 0 || setMeters === 0 || movementMultiplier === 0;
  const blocked = blockedReasons.length > 0 || forcedZero;
  if (blockedReasons.length) {
    speed = 0;
    reasons.length = 0;
  }
  if (prone) pushUnique(reasons, "Prono: movimento ×2");

  const allReasons = [...blockedReasons];
  for (const reason of reasons) pushUnique(allReasons, reason);
  return {
    id: mode,
    label: MOVEMENT_MODE_LABELS[mode],
    baseSpeedMeters: sourceMeters,
    speedMeters: Math.max(0, speed),
    blocked,
    blocksSpeedBonuses: blocked,
    reasons: allReasons,
    summary: allReasons.join(" · "),
    movementMultiplier,
    movementCostMultiplier,
    movementImmunities: [...movementImmunitySet],
    directionalCostModifiers,
  };
}

export function resolveMovementProfile(
  baseSpeedMeters,
  instances = [],
  spells = [],
  preferredMode = "walk",
) {
  const baseSpeed = Math.max(0, Number(baseSpeedMeters) || 0);
  const names = activeConditionNames(instances);
  const rules = movementRules(instances);
  const spellKeys = activeSpellKeys(spells);
  const flags = spellFlags(spellKeys);
  const exhaustionLevel = exhaustionLevelFromInstances(instances);
  const prone = names.has("prono");
  const sources = baseModeSources(baseSpeed, rules);
  const movementModes = MOVEMENT_MODE_ORDER
    .filter((mode) => sources.has(mode))
    .map((mode) => resolveMode({
      mode,
      sourceMeters: sources.get(mode),
      rules,
      names,
      flags,
      exhaustionLevel,
      prone,
    }));
  const requestedMode = String(preferredMode || "").trim().toLocaleLowerCase("it");
  const active = movementModes.find((entry) => entry.id === requestedMode)
    || movementModes.find((entry) => entry.id === "walk")
    || movementModes[0]
    || {
      id: "walk",
      label: MOVEMENT_MODE_LABELS.walk,
      baseSpeedMeters: baseSpeed,
      speedMeters: 0,
      blocked: true,
      blocksSpeedBonuses: true,
      movementMultiplier: 1,
      movementImmunities: [],
      directionalCostModifiers: [],
      reasons: [],
      summary: "",
    };
  const halved = exhaustionLevel >= 2 || (flags.slow && !flags.freedomOfMovement);
  const multiplier = active.blocked
    ? 0
    : (flags.haste ? 2 : 1) * (halved ? 0.5 : 1) * (active.movementMultiplier ?? 1);

  return {
    activeMode: active.id,
    activeModeLabel: active.label,
    movementModes,
    modes: Object.fromEntries(movementModes.map((entry) => [entry.id, { ...entry }])),
    hasMovementModes: movementModes.some((entry) => entry.baseSpeedMeters > 0),
    baseSpeedMeters: baseSpeed,
    modeBaseSpeedMeters: active.baseSpeedMeters,
    speedMeters: active.speedMeters,
    exhaustionLevel,
    multiplier,
    blocked: active.blocked,
    blocksSpeedBonuses: active.blocksSpeedBonuses,
    prone,
    movementCostMultiplier: Math.max(1, active.movementCostMultiplier || 1)
      + (prone ? 1 : 0),
    movementImmunities: [
      ...new Set([
        ...(active.movementImmunities || []),
        ...(flags.freedomOfMovement
          ? ["difficult-terrain", "magical-speed-reduction"]
          : []),
      ]),
    ],
    directionalCostModifiers: active.directionalCostModifiers || [],
    reasons: [...active.reasons],
    summary: active.summary,
  };
}
