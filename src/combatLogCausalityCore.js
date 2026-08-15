const CAUSALITY_VERSION = 1;
const CAUSALITY_DOMAIN = "spell";

export const COMBAT_LOG_CAUSALITY_EVENT_TYPES = Object.freeze([
  "application/cast",
  "prepare",
  "resolution",
  "active-action",
  "area/save-resolution",
  "reminder-resolution",
  "zone-move",
  "zone-reorient",
  "board-token-update",
  "concentration-start",
  "concentration-end",
]);

const EVENT_TYPE_SET = new Set(COMBAT_LOG_CAUSALITY_EVENT_TYPES);
const CONCENTRATION_ACTIONS = Object.freeze({
  start: "start",
  replace: "start",
  continue: "continue",
  extend: "continue",
  end: "end",
  dismiss: "end",
  break: "break",
});

function isObject(value) {
  return !!value && typeof value === "object";
}

function hasOwn(value, key) {
  return isObject(value) && Object.prototype.hasOwnProperty.call(value, key);
}

function text(value) {
  if (value === null || value === undefined) return "";
  try {
    return String(value).trim();
  } catch {
    return "";
  }
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  try {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  } catch {
    return null;
  }
}

function optionalNumber(value) {
  const number = finiteNumber(value);
  return number === null ? undefined : number;
}

function optionalNonNegativeNumber(value) {
  const number = optionalNumber(value);
  return number === undefined || number < 0 ? undefined : number;
}

function firstText(...values) {
  for (const value of values) {
    const result = text(value);
    if (result) return result;
  }
  return "";
}

function arrayLike(value) {
  if (Array.isArray(value)) return value;
  if (value instanceof Set) return [...value];
  if (value instanceof Map) return [...value.entries()];
  return [];
}

function mapValue(value, key) {
  if (!key || value === null || value === undefined) return undefined;
  if (value instanceof Map) return value.get(key);
  if (isObject(value) && !Array.isArray(value) && hasOwn(value, key)) return value[key];
  return undefined;
}

function arrayRecord(value, id) {
  if (!Array.isArray(value) || !id) return undefined;
  return value.find((entry) => (
    firstText(entry?.id, entry?.targetId, entry?.tokenId, entry?.target) === id
  ));
}

function recordFromCollection(collection, id) {
  if (!id || collection === null || collection === undefined) return undefined;
  const direct = mapValue(collection, id) || arrayRecord(collection, id);
  if (direct !== undefined) return direct;
  if (collection instanceof Map) {
    for (const [key, value] of collection.entries()) {
      if (text(key) === id) return value;
    }
  }
  return undefined;
}

function outcomeFrom(value, id, targetRecord, attackRecord) {
  const direct = firstText(
    attackRecord?.attackOutcome,
    attackRecord?.outcome,
    targetRecord?.outcome,
    targetRecord?.result,
  );
  if (direct) return direct;
  const outcomeValue = (entry) => firstText(
    entry?.outcome,
    entry?.result,
    entry,
  );
  const mapped = firstText(
    outcomeValue(recordFromCollection(value?.outcomes, id)),
    outcomeValue(recordFromCollection(value?.results, id)),
    outcomeValue(recordFromCollection(value?.outcomeByTarget, id)),
  );
  if (mapped) return mapped;
  if (value?.targets && !Array.isArray(value.targets)) {
    const targetValue = mapValue(value.targets, id);
    const targetOutcome = outcomeValue(targetValue);
    if (targetOutcome) return targetOutcome;
  }
  if (value?.targetOutcomes && !Array.isArray(value.targetOutcomes)) {
    const targetOutcome = outcomeValue(mapValue(value.targetOutcomes, id));
    if (targetOutcome) return targetOutcome;
  }
  if (id && value?.targetIds && arrayLike(value.targetIds).length === 1) {
    return firstText(value.outcome, value.result);
  }
  return "";
}

function targetEntries(value) {
  const entries = [];
  const seen = new Set();
  const add = (raw, fallbackId = "") => {
    const record = isObject(raw) && !Array.isArray(raw) ? raw : {};
    const id = firstText(
      record.id,
      record.targetId,
      record.tokenId,
      typeof raw === "string" || typeof raw === "number" ? raw : "",
      fallbackId,
    );
    const name = firstText(record.name, record.targetName);
    const key = id ? `id:${id}` : name ? `name:${name}` : "";
    if (!key) return;
    if (seen.has(key)) {
      const existing = entries.find((entry) => (entry.id ? `id:${entry.id}` : `name:${entry.name}`) === key);
      if (existing) {
        existing.name ||= name;
        existing.record = { ...existing.record, ...record };
      }
      return;
    }
    seen.add(key);
    entries.push({ id, name, record });
  };

  for (const raw of arrayLike(value?.targets)) {
    if (Array.isArray(raw) && raw.length === 2 && !isObject(raw[0])) {
      add(
        isObject(raw[1])
          ? { ...raw[1], id: raw[1].id || raw[0] }
          : { id: raw[0], name: raw[1] },
        raw[0],
      );
    } else {
      add(raw);
    }
  }
  for (const raw of arrayLike(value?.targetSnapshots)) add(raw);
  for (const raw of arrayLike(value?.targetIds)) add(raw);
  for (const raw of arrayLike(value?.subjectIds)) add(raw);
  for (const raw of arrayLike(value?.effectSubjectIds)) add(raw);
  for (const raw of arrayLike(value?.ids)) add(raw);

  const appendMapKeys = (collection) => {
    if (!isObject(collection) || Array.isArray(collection) || collection instanceof Map) return;
    for (const key of Object.keys(collection).sort()) {
      const valueForKey = collection[key];
      if (isObject(valueForKey) && !Array.isArray(valueForKey)) {
        add({ ...valueForKey, id: valueForKey.id || key }, key);
      } else if (valueForKey && collection === value?.targetNames) {
        add({ id: key, name: valueForKey }, key);
      } else {
        add(key);
      }
    }
  };
  appendMapKeys(value?.outcomes);
  appendMapKeys(value?.results);
  appendMapKeys(value?.targetOutcomes);
  appendMapKeys(value?.targets);
  appendMapKeys(value?.targetNames);

  for (const raw of Array.isArray(value?.attacks) ? value.attacks : []) add(raw);
  return entries;
}

function attackFor(value, id) {
  if (!id || !Array.isArray(value?.attacks)) return undefined;
  return value.attacks.find((entry) => firstText(entry?.targetId, entry?.id, entry?.target) === id);
}

function targetNumber(record, keys) {
  for (const key of keys) {
    if (hasOwn(record, key)) {
      const number = optionalNumber(record[key]);
      if (number !== undefined) return number;
    }
  }
  return undefined;
}

function damageFactorValue(value) {
  const numeric = optionalNumber(value);
  if (numeric !== undefined) return numeric;
  return {
    zero: 0,
    none: 0,
    quarter: 0.25,
    half: 0.5,
    full: 1,
    double: 2,
  }[text(value).toLowerCase()];
}

function normalizeConcentration(value, fallbackInstanceId = "") {
  const source = isObject(value) ? value : {};
  const action = CONCENTRATION_ACTIONS[text(source.action || source.kind || value).toLowerCase()];
  if (!action) return undefined;
  const instanceId = firstText(source.instanceId, source.id, fallbackInstanceId);
  return {
    action,
    ...(instanceId ? { instanceId } : {}),
  };
}

function normalizeZone(value, fallback = {}) {
  const source = isObject(value) ? value : {};
  const action = firstText(source.action, fallback.action);
  const zoneItemId = firstText(source.zoneItemId, source.id, fallback.zoneItemId);
  const ruleId = firstText(source.ruleId, fallback.ruleId);
  const movementChoice = firstText(source.movementChoice, fallback.movementChoice);
  if (!action && !zoneItemId && !ruleId && !movementChoice) return undefined;
  return {
    ...(action ? { action } : {}),
    ...(zoneItemId ? { zoneItemId } : {}),
    ...(ruleId ? { ruleId } : {}),
    ...(movementChoice ? { movementChoice } : {}),
  };
}

function normalizeAction(value, source) {
  const action = isObject(value) ? value : {};
  const id = firstText(action.id, action.actionId, source.actionId);
  const label = firstText(action.label, action.buttonLabel, source.actionLabel);
  const attackOutcome = firstText(action.attackOutcome, source.attackOutcome);
  const damageRoll = optionalNonNegativeNumber(
    hasOwn(action, "damageRoll") ? action.damageRoll : source.damageRoll,
  );
  if (!id && !label && !attackOutcome && damageRoll === undefined) return undefined;
  return {
    ...(id ? { id } : {}),
    ...(label ? { label } : {}),
    ...(attackOutcome ? { attackOutcome } : {}),
    ...(damageRoll !== undefined ? { damageRoll } : {}),
  };
}

function normalizeActor(value, source) {
  const actor = isObject(value) ? value : {};
  const id = firstText(actor.id, actor.casterId, source.casterId, source.actorId, source.sourceId);
  const name = firstText(actor.name, actor.casterName, source.casterName, source.actorName, source.sourceName);
  const role = firstText(
    actor.role,
    source.actorRole,
    source.casterId || source.casterName ? "caster" : "",
    source.sourceId || source.sourceName ? "source" : "",
  );
  if (!id && !name && !role) return undefined;
  return {
    ...(id ? { id } : {}),
    ...(name ? { name } : {}),
    ...(role ? { role } : {}),
  };
}

function normalizeCause(value, source) {
  const cause = isObject(value) ? value : {};
  const spell = isObject(source.spell) ? source.spell : {};
  const spellId = firstText(cause.spellId, cause.id, source.spellId, spell.id);
  const spellName = firstText(cause.spellName, cause.name, source.spellName, spell.displayName, spell.name);
  const instanceId = firstText(cause.instanceId, cause.effectInstanceId, source.instanceId);
  const slotLevel = optionalNumber(
    hasOwn(cause, "slotLevel")
      ? cause.slotLevel
      : hasOwn(source, "slotLevel")
        ? source.slotLevel
        : source.castContext?.slotLevel,
  );
  return {
    kind: "spell",
    ...(spellId ? { spellId } : {}),
    ...(spellName ? { spellName } : {}),
    ...(instanceId ? { instanceId } : {}),
    ...(slotLevel !== undefined ? { slotLevel } : {}),
  };
}

function normalizedTargets(source) {
  const records = targetEntries(source);
  return records.map(({ id, name, record }) => {
    const attack = attackFor(source, id);
    const outcome = outcomeFrom(source, id, record, attack);
    const target = {
      ...(id ? { id } : {}),
      ...(name ? { name } : {}),
      ...(outcome ? { outcome } : {}),
    };
    const requestedDamage = targetNumber(
      { ...record, ...(attack && isObject(attack) ? attack : {}) },
      ["requestedDamage", "damageRequested", "damage"],
    );
    const appliedHpDelta = targetNumber(record, ["appliedHpDelta", "actualHpDelta", "hpDelta"]);
    const damageFactor = hasOwn(record, "damageFactor")
      ? damageFactorValue(record.damageFactor)
      : hasOwn(record, "factor")
        ? damageFactorValue(record.factor)
        : undefined;
    if (requestedDamage !== undefined) target.requestedDamage = requestedDamage;
    if (appliedHpDelta !== undefined) target.appliedHpDelta = appliedHpDelta;
    if (damageFactor !== undefined) target.damageFactor = damageFactor;
    return target;
  });
}

function buildFrom(source = {}) {
  const input = isObject(source) && !Array.isArray(source) ? source : {};
  const eventType = firstText(input.eventType, input.type);
  const causality = {
    version: CAUSALITY_VERSION,
    domain: CAUSALITY_DOMAIN,
    ...(EVENT_TYPE_SET.has(eventType) ? { eventType } : {}),
  };
  const cause = normalizeCause(input.cause, input);
  causality.cause = cause;
  const actor = normalizeActor(input.actor, input);
  if (actor) causality.actor = actor;
  const phase = firstText(input.phase, input.castContext?.phase, input.action?.phase);
  if (phase) causality.phase = phase;
  const action = normalizeAction(input.action, input);
  if (action) {
    if (!action.attackOutcome && Array.isArray(input.attacks) && input.attacks.length === 1) {
      const attackOutcome = firstText(input.attacks[0]?.attackOutcome, input.attacks[0]?.outcome);
      if (attackOutcome) action.attackOutcome = attackOutcome;
    }
    causality.action = action;
  }
  const targets = normalizedTargets(input);
  if (targets.length) causality.targets = targets;
  const concentration = normalizeConcentration(
    input.concentration || input.concentrationAction,
    firstText(input.concentrationInstanceId, input.instanceId),
  );
  if (concentration) causality.concentration = concentration;
  const zone = normalizeZone(input.zone, {
    action: input.zoneAction,
    zoneItemId: input.zoneItemId,
    ruleId: input.ruleId,
    movementChoice: input.movementChoice,
  });
  if (zone) causality.zone = zone;
  const activationId = firstText(
    input.reminder?.activationId,
    input.activationId,
  );
  if (activationId) causality.reminder = { activationId };
  return causality;
}

export function buildSpellCausality(input = {}) {
  try {
    return buildFrom(input);
  } catch {
    return { version: CAUSALITY_VERSION, domain: CAUSALITY_DOMAIN };
  }
}

export function normalizeCombatLogCausality(value) {
  return buildSpellCausality(value);
}

export { CAUSALITY_DOMAIN, CAUSALITY_VERSION };
