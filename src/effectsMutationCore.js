import {
  conditionKey,
  getConditionEntryAdditions,
  hasEffectiveCondition,
} from "./conditionRulesCore.js";
import { normalizeExhaustionLevel } from "./exhaustionCore.js";

const CONDITION_SCHEMA_VERSION = 2;
const EXHAUSTION_CONDITION = "Indebolimento";

const clone = (value) => {
  if (value === undefined) return undefined;
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

const uniqueIds = (values = []) => Array.from(new Set(
  (Array.isArray(values) ? values : []).map((value) => String(value || "").trim()).filter(Boolean)
));

const spellKey = (value) => String(value || "").trim().toLocaleLowerCase("it");

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function normalizeState(item) {
  return {
    id: String(item?.id || "").trim(),
    name: String(item?.name || "").trim(),
    spells: Array.isArray(item?.spells) ? clone(item.spells) : [],
    concentrations: item?.concentrations && typeof item.concentrations === "object"
      ? clone(item.concentrations)
      : {},
    conditions: Array.isArray(item?.conditions) ? clone(item.conditions) : [],
  };
}

function normalizedExpiry(value, legacyTurns = null, legacyTiming = "rounds") {
  const raw = value && typeof value === "object" ? value : {};
  const duration = (input) => {
    const parsed = Math.floor(Number(input));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };
  let mode = String(raw.mode || raw.kind || (legacyTurns ? legacyTiming : "manual"))
    .trim()
    .toLocaleLowerCase("it");
  if (mode === "round") mode = "rounds";
  if (!["manual", "rounds", "turn-start", "turn-end", "concentration"].includes(mode)) {
    mode = legacyTurns ? "rounds" : "manual";
  }

  const expiry = { mode };
  if (mode === "rounds" || mode === "turn-start" || mode === "turn-end") {
    expiry.remaining = duration(raw.remaining ?? raw.turns ?? legacyTurns) || 1;
  }
  const actor = String(raw.actor || "").trim().toLocaleLowerCase("it");
  if (actor === "source" || actor === "target") expiry.actor = actor;
  if (raw.actorId) expiry.actorId = String(raw.actorId);
  if (raw.actorName) expiry.actorName = String(raw.actorName);
  if (raw.anchor === "next-turn") expiry.anchor = "next-turn";
  return expiry;
}

function normalizedAppliedAt(value) {
  if (!value || typeof value !== "object") return null;
  const result = {};
  const round = Math.max(1, Math.floor(Number(value.round || 1)));
  if (Number.isFinite(round)) result.round = round;
  if (value.actorId) result.actorId = String(value.actorId);
  if (value.phase) result.phase = String(value.phase);
  if (value.turnKey) result.turnKey = String(value.turnKey);
  return Object.keys(result).length ? result : null;
}

function boundaryMatchCount(expiry, actorId, appliedAt, boundaries) {
  return boundaries.filter((boundary) => {
    if (boundary.mode !== expiry.mode || boundary.actorId !== actorId) return false;
    if (expiry.anchor !== "next-turn" || !appliedAt?.turnKey || !boundary.turnKey) return true;
    return boundary.turnKey !== appliedAt.turnKey;
  }).length;
}

function conditionInstance(operation, targetId, instanceId, conditionName, overrides = {}) {
  const options = { ...(operation?.options || {}), ...overrides };
  const condition = String(conditionName || operation?.conditionName || "").trim();
  if (!condition || !targetId || !instanceId) return null;
  const sourceId = String(options.sourceId || "").trim();
  const expiry = normalizedExpiry(
    options.expiry,
    Math.max(0, Math.floor(Number(options.turns) || 0)) || null,
    options.durationBy || options.timing || "rounds"
  );

  if (expiry.mode === "turn-start" || expiry.mode === "turn-end") {
    expiry.actor = expiry.actor === "source" ? "source" : "target";
    if (!expiry.actorId) expiry.actorId = expiry.actor === "source" ? sourceId : targetId;
  }
  const appliedAt = normalizedAppliedAt(options.appliedAt);

  const instance = {
    id: String(instanceId),
    condition,
    active: true,
    targetId,
    expiry,
    createdAt: Number(operation?.createdAt) || Date.now(),
  };
  if (sourceId) instance.sourceId = sourceId;
  if (options.sourceName) instance.sourceName = String(options.sourceName);
  if (options.parentEffectId) instance.parentEffectId = String(options.parentEffectId);
  if (options.type || options.effectType) instance.type = String(options.type || options.effectType);
  if (options.effectId) instance.effectId = String(options.effectId);
  if (options.effectKind === "buff" || options.effectKind === "debuff") {
    instance.effectKind = options.effectKind;
  }
  if (options.effectDetail) instance.effectDetail = String(options.effectDetail);
  if (options.manualRemoval === true) instance.manualRemoval = true;
  if (options.endsParentOnRemoval === true) instance.endsParentOnRemoval = true;
  if (options.exhaustionContribution === true) instance.exhaustionContribution = true;
  if (condition === EXHAUSTION_CONDITION) {
    instance.level = Math.max(1, normalizeExhaustionLevel(options.level || 1));
  }
  if (appliedAt) instance.appliedAt = appliedAt;
  return instance;
}

function appendCondition(state, operation, targetId) {
  const instanceId = String(operation?.instanceIds?.[targetId] || "").trim();
  const instance = conditionInstance(operation, targetId, instanceId, operation.conditionName);
  if (!instance) return;
  if (state.conditions.some((entry) => String(entry?.id || "") === instance.id)) return;
  const parentEffectId = String(instance.parentEffectId || "").trim();
  const matchingIndex = instance.exhaustionContribution === true || !parentEffectId
    ? -1
    : state.conditions.findIndex((entry) =>
      conditionKey(entry) === conditionKey(instance)
      && String(entry?.parentEffectId || "").trim() === parentEffectId
      && String(entry?.sourceId || "").trim() === String(instance.sourceId || "").trim()
      && String(entry?.effectId || "").trim() === String(instance.effectId || "").trim()
    );
  if (matchingIndex >= 0) {
    const existing = state.conditions[matchingIndex];
    state.conditions[matchingIndex] = {
      ...existing,
      ...instance,
      id: existing.id,
      createdAt: existing.createdAt,
    };
    return;
  }

  const previous = clone(state.conditions);
  const next = [...state.conditions, instance];
  for (const addition of getConditionEntryAdditions(previous, next)) {
    const childName = String(addition?.condition || "").trim();
    const childKey = conditionKey(childName);
    const childId = String(
      operation?.consequenceInstanceIds?.[targetId]?.[childKey] || `${instance.id}:automatic:${childKey}`
    ).trim();
    if (!childName || !childId || next.some((entry) => String(entry?.id || "") === childId)) continue;
    const trigger = addition?.triggeredBy || {};
    const child = conditionInstance(operation, targetId, childId, childName, {
      sourceId: "",
      sourceName: "",
      parentEffectId: "",
      type: "automatic",
      appliedAt: trigger.appliedAt,
      expiry: { mode: "manual" },
    });
    if (child) next.push(child);
  }
  state.conditions = next;
}

function removeLinkedConditions(state, removedSpells) {
  const parentIds = new Set((removedSpells || [])
    .map((spell) => String(spell?.instanceId || "").trim())
    .filter(Boolean));
  if (!parentIds.size) return;
  state.conditions = state.conditions.filter((instance) =>
    String(instance?.type || "") !== "spell" ||
    !parentIds.has(String(instance?.parentEffectId || ""))
  );
}

function removeSpells(state, predicate) {
  const removed = [];
  const next = [];
  for (const spell of state.spells) {
    if (predicate(spell)) removed.push(spell);
    else next.push(spell);
  }
  if (removed.length) {
    state.spells = next;
    removeLinkedConditions(state, removed);
  }
  return removed;
}

function removeSpellByNameAndSource(state, name, casterId) {
  const wanted = spellKey(name);
  const sourceId = String(casterId || "").trim();
  if (!wanted) return [];
  return removeSpells(state, (spell) => {
    if (spellKey(spell?.name) !== wanted) return false;
    if (sourceId && spell?.casterId && String(spell.casterId) !== sourceId) return false;
    return true;
  });
}

function removeSpellByInstance(state, instanceId) {
  const wanted = String(instanceId || "").trim();
  if (!wanted) return [];
  return removeSpells(state, (spell) => String(spell?.instanceId || "") === wanted);
}

function breakConcentration(states, casterId, reference = null) {
  const caster = states.get(String(casterId || "").trim());
  if (!caster) return;
  const wanted = String(reference || "").trim();
  const keys = Object.keys(caster.concentrations || {});
  const matchedKeys = wanted
    ? keys.filter((key) => spellKey(key) === spellKey(wanted) ||
      String(caster.concentrations[key]?.instanceId || "") === wanted)
      .slice(0, 1)
    : keys;

  for (const matchedKey of matchedKeys) {
    const entry = caster.concentrations[matchedKey] || {};
    const instanceId = String(entry.instanceId || "").trim();
    const spellName = String(entry.name || matchedKey).trim();
    for (const targetId of uniqueIds(entry.targets)) {
      const target = states.get(targetId);
      if (!target) continue;
      if (instanceId) removeSpellByInstance(target, instanceId);
      else removeSpellByNameAndSource(target, spellName, caster.id);
    }
    delete caster.concentrations[matchedKey];
  }
}

function breakConcentrationOnTargets(states, casterId, reference, targetIds = []) {
  const caster = states.get(String(casterId || "").trim());
  const wanted = String(reference || "").trim();
  const scopedTargets = new Set(uniqueIds(targetIds));
  if (!caster || !wanted || !scopedTargets.size) return;

  const matchedKey = Object.keys(caster.concentrations || {})
    .find((key) => spellKey(key) === spellKey(wanted) ||
      String(caster.concentrations[key]?.instanceId || "") === wanted);
  if (!matchedKey) return;

  const entry = caster.concentrations[matchedKey] || {};
  const currentTargets = uniqueIds(entry.targets);
  const removedTargets = currentTargets.filter((targetId) => scopedTargets.has(targetId));
  if (!removedTargets.length) return;

  const instanceId = String(entry.instanceId || "").trim();
  const spellName = String(entry.name || matchedKey).trim();
  for (const targetId of removedTargets) {
    const target = states.get(targetId);
    if (!target) continue;
    if (instanceId) removeSpellByInstance(target, instanceId);
    else removeSpellByNameAndSource(target, spellName, caster.id);
  }

  const remainingTargets = currentTargets.filter((targetId) => !scopedTargets.has(targetId));
  if (remainingTargets.length) {
    caster.concentrations[matchedKey] = { ...entry, targets: remainingTargets };
  } else {
    delete caster.concentrations[matchedKey];
  }
}

function applySpellUpsert(state, operation) {
  const sourceId = String(operation?.source || "").trim();
  for (const previousName of uniqueIds(operation?.replaceNames)) {
    removeSpellByNameAndSource(state, previousName, sourceId);
  }

  const name = String(operation?.name || "").trim();
  if (!name) return;
  const instanceId = String(operation?.instanceId || "").trim();
  const spellId = String(operation?.spellId || "").trim();
  const index = instanceId
    ? state.spells.findIndex((spell) => String(spell?.instanceId || "") === instanceId)
    : state.spells.findIndex((spell) =>
      spellKey(spell?.name) === spellKey(name) &&
      (!sourceId || !spell?.casterId || String(spell.casterId) === sourceId)
    );
  const extra = {};
  if (sourceId) extra.casterId = sourceId;
  if (operation?.conc != null) extra.conc = operation.conc === true;
  if (instanceId) extra.instanceId = instanceId;
  if (spellId) extra.spellId = spellId;
  const appliedAt = normalizedAppliedAt(operation?.appliedAt);
  if (appliedAt) extra.appliedAt = appliedAt;
  const expiry = normalizedExpiry(operation?.expiry);
  if (operation?.expiry && expiry.mode !== "rounds") {
    if (expiry.mode === "turn-start" || expiry.mode === "turn-end") {
      expiry.actor = expiry.actor === "target" ? "target" : "source";
      if (!expiry.actorId) expiry.actorId = expiry.actor === "target" ? state.id : sourceId;
    }
    extra.expiry = expiry;
  }
  const turns = Math.max(1, Math.floor(Number(operation?.turns) || 1));

  if (index >= 0) {
    state.spells[index] = { ...state.spells[index], turns, ...extra };
  } else {
    state.spells.push({
      id: String(operation?.entryIds?.[state.id] || `${operation.operationId}:entry:${state.id}`),
      name,
      turns,
      ...extra,
    });
  }
}

function applySpellAdjustment(states, operation) {
  const expiredConcentrations = [];
  for (const targetId of uniqueIds(operation?.targetIds)) {
    const state = states.get(targetId);
    if (!state?.spells.length) continue;
    const next = [];
    const removed = [];
    for (const spell of state.spells) {
      if (
        spell?.expiry?.mode === "manual" ||
        spell?.expiry?.mode === "turn-start" ||
        spell?.expiry?.mode === "turn-end"
      ) {
        next.push(spell);
        continue;
      }
      const current = Math.max(0, Number(spell?.turns || 0));
      const turns = Math.max(0, current + Number(operation?.delta || 0));
      if (turns > 0) next.push({ ...spell, turns });
      else {
        removed.push(spell);
        if (spell?.conc) expiredConcentrations.push(spell);
      }
    }
    state.spells = next;
    removeLinkedConditions(state, removed);
  }

  const seen = new Set();
  for (const spell of expiredConcentrations) {
    const casterId = String(spell?.casterId || "").trim();
    const reference = String(spell?.instanceId || spell?.name || "").trim();
    const signature = `${casterId}|${reference}`;
    if (!casterId || !reference || seen.has(signature)) continue;
    seen.add(signature);
    breakConcentration(states, casterId, reference);
  }
}

function normalizedBoundaries(boundaries = []) {
  return (Array.isArray(boundaries) ? boundaries : []).map((boundary) => ({
    mode: boundary?.phase === "start" ? "turn-start"
      : boundary?.phase === "end" ? "turn-end"
      : "",
    actorId: String(boundary?.actorId || "").trim(),
    turnKey: String(boundary?.turnKey || "").trim(),
  })).filter((boundary) => boundary.mode && boundary.actorId);
}

function finishExpiredConcentrations(states, spells = []) {
  const seen = new Set();
  for (const spell of spells) {
    const casterId = String(spell?.casterId || "").trim();
    const reference = String(spell?.instanceId || spell?.name || "").trim();
    const signature = `${casterId}|${reference}`;
    if (!casterId || !reference || seen.has(signature)) continue;
    seen.add(signature);
    breakConcentration(states, casterId, reference);
  }
}

function applySpellBoundaryAdjustment(states, operation) {
  const boundaries = normalizedBoundaries(operation?.boundaries);
  if (!boundaries.length) return;
  const expiredConcentrations = [];
  for (const targetId of uniqueIds(operation?.targetIds)) {
    const state = states.get(targetId);
    if (!state?.spells.length) continue;
    const next = [];
    const removed = [];
    for (const spell of state.spells) {
      const expiry = spell?.expiry || {};
      if (expiry.mode !== "turn-start" && expiry.mode !== "turn-end") {
        next.push(spell);
        continue;
      }
      const actorId = String(expiry.actorId || (
        expiry.actor === "target" ? state.id : spell?.casterId
      ) || "").trim();
      const matches = boundaryMatchCount(expiry, actorId, spell?.appliedAt, boundaries);
      const remaining = Math.max(1, Math.floor(Number(expiry.remaining) || 1));
      const nextRemaining = remaining - matches;
      if (nextRemaining > 0) {
        next.push({ ...spell, expiry: { ...expiry, remaining: nextRemaining } });
      } else {
        removed.push(spell);
        if (spell?.conc) expiredConcentrations.push(spell);
      }
    }
    state.spells = next;
    removeLinkedConditions(state, removed);
  }
  finishExpiredConcentrations(states, expiredConcentrations);
}

function applyConditionBoundaryAdjustment(states, operation) {
  const boundaries = normalizedBoundaries(operation?.boundaries);
  if (!boundaries.length) return;
  for (const targetId of uniqueIds(operation?.targetIds)) {
    const state = states.get(targetId);
    if (!state?.conditions.length) continue;
    state.conditions = state.conditions.flatMap((instance) => {
      const expiry = instance?.expiry || {};
      if (expiry.mode !== "turn-start" && expiry.mode !== "turn-end") return [instance];
      const actorId = String(expiry.actorId || (
        expiry.actor === "source" ? instance?.sourceId : state.id
      ) || "").trim();
      const matches = boundaryMatchCount(expiry, actorId, instance?.appliedAt, boundaries);
      const remaining = Math.max(1, Math.floor(Number(expiry.remaining) || 1));
      const nextRemaining = remaining - matches;
      return nextRemaining > 0
        ? [{ ...instance, expiry: { ...expiry, remaining: nextRemaining } }]
        : [];
    });
  }
}

function applyConditionAdjustment(states, operation) {
  const delta = Number(operation?.delta || 0);
  if (!Number.isFinite(delta) || delta === 0) return;
  for (const targetId of uniqueIds(operation?.targetIds)) {
    const state = states.get(targetId);
    if (!state?.conditions.length) continue;
    const next = [];
    for (const instance of state.conditions) {
      const expiry = instance.expiry || { mode: "manual" };
      const mode = String(expiry.mode || "").trim().toLocaleLowerCase("it");
      const duration = (input) => {
        const parsed = Math.floor(Number(input));
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
      };
      const remaining = duration(expiry.remaining);
      if (mode !== "rounds" || !remaining) {
        next.push(instance);
        continue;
      }
      const nextRemaining = Math.max(0, remaining + delta);
      if (nextRemaining > 0) {
        next.push({
          ...instance,
          expiry: { ...expiry, remaining: nextRemaining },
        });
      }
    }
    state.conditions = next;
  }
}

function applyConditionAutomation(states, subjectIds) {
  const incapacitated = new Set();
  for (const subjectId of uniqueIds(subjectIds)) {
    const subject = states.get(subjectId);
    if (subject && hasEffectiveCondition(subject.conditions, "Incapacitato")) {
      incapacitated.add(subjectId);
    }
  }
  if (!incapacitated.size) return;

  for (const casterId of incapacitated) breakConcentration(states, casterId);
  for (const state of states.values()) {
    state.conditions = state.conditions.filter((instance) =>
      conditionKey(instance) !== "afferrato" ||
      !incapacitated.has(String(instance?.sourceId || ""))
    );
  }
}

function applyOperation(states, operation, options) {
  const targetIds = uniqueIds(operation?.targetIds);
  switch (operation?.type) {
    case "spell:set":
      for (const targetId of targetIds) {
        const state = states.get(targetId);
        if (state) state.spells = Array.isArray(operation.spells) ? clone(operation.spells) : [];
      }
      break;
    case "spell:upsert":
      for (const targetId of targetIds) {
        const state = states.get(targetId);
        if (state) applySpellUpsert(state, operation);
      }
      break;
    case "spell:remove-instance":
      for (const targetId of targetIds) {
        const state = states.get(targetId);
        if (state) removeSpellByInstance(state, operation.instanceId);
      }
      break;
    case "spell:remove-name-source":
      for (const targetId of targetIds) {
        const state = states.get(targetId);
        if (state) removeSpellByNameAndSource(state, operation.name, operation.casterId);
      }
      break;
    case "spell:clear-non-concentration":
      for (const targetId of targetIds) {
        const state = states.get(targetId);
        if (state) removeSpells(state, (spell) => !spell?.conc);
      }
      break;
    case "spell:adjust":
      applySpellAdjustment(states, operation);
      break;
    case "effects:tick-round":
      applySpellAdjustment(states, operation);
      applyConditionAdjustment(states, operation);
      break;
    case "effects:tick-boundaries":
      applySpellBoundaryAdjustment(states, operation);
      applyConditionBoundaryAdjustment(states, operation);
      break;
    case "concentration:register": {
      const caster = states.get(String(operation.casterId || "").trim());
      const key = spellKey(operation.name);
      if (!caster || !key) break;
      const previous = caster.concentrations[key] && typeof caster.concentrations[key] === "object"
        ? caster.concentrations[key]
        : {};
      const entry = {
        ...previous,
        targets: uniqueIds([...(previous.targets || []), ...targetIds]),
        name: String(operation.name || "").trim(),
      };
      if (operation.instanceId) entry.instanceId = String(operation.instanceId);
      if (operation.spellId) entry.spellId = String(operation.spellId);
      caster.concentrations[key] = entry;
      break;
    }
    case "concentration:break":
      for (const casterId of uniqueIds(operation.casterIds || [operation.casterId])) {
        breakConcentration(states, casterId, operation.reference ?? null);
      }
      break;
    case "concentration:break-targets":
      for (const casterId of uniqueIds(operation.casterIds || [operation.casterId])) {
        breakConcentrationOnTargets(
          states,
          casterId,
          operation.reference ?? null,
          targetIds
        );
      }
      break;
    case "condition:add":
      for (const targetId of targetIds) {
        const state = states.get(targetId);
        if (state) appendCondition(state, operation, targetId);
      }
      break;
    case "condition:add-custom": {
      const known = new Set((options.knownConditionNames || []).map(conditionKey));
      const maxCustom = Math.max(1, Number(options.maxCustomConditions) || 3);
      for (const targetId of targetIds) {
        const state = states.get(targetId);
        if (!state) continue;
        const customIndexes = state.conditions
          .map((instance, index) => known.has(conditionKey(instance)) ? -1 : index)
          .filter((index) => index >= 0);
        if (customIndexes.length >= maxCustom) {
          state.conditions.splice(customIndexes[customIndexes.length - 1], 1);
        }
        appendCondition(state, operation, targetId);
      }
      break;
    }
    case "condition:toggle":
      for (const targetId of targetIds) {
        const state = states.get(targetId);
        if (!state) continue;
        const active = state.conditions.some((instance) =>
          conditionKey(instance) === conditionKey(operation.conditionName)
        );
        if (active) {
          state.conditions = state.conditions.filter((instance) =>
            conditionKey(instance) !== conditionKey(operation.conditionName)
          );
        } else {
          appendCondition(state, operation, targetId);
        }
      }
      break;
    case "condition:remove-instances": {
      const byItem = new Map();
      for (const removal of operation.removals || []) {
        const itemId = String(removal?.itemId || "").trim();
        const instanceId = String(removal?.instanceId || "").trim();
        if (!itemId || !instanceId) continue;
        const ids = byItem.get(itemId) || new Set();
        ids.add(instanceId);
        byItem.set(itemId, ids);
      }
      for (const [itemId, instanceIds] of byItem) {
        const state = states.get(itemId);
        if (!state) continue;
        const parentIds = new Set(state.conditions
          .filter((instance) =>
            instanceIds.has(String(instance?.id || "")) &&
            instance?.endsParentOnRemoval === true
          )
          .map((instance) => String(instance?.parentEffectId || "").trim())
          .filter(Boolean));
        state.conditions = state.conditions.filter((instance) =>
          !instanceIds.has(String(instance?.id || ""))
        );
        const removedSpells = [];
        for (const parentId of parentIds) {
          removedSpells.push(...removeSpellByInstance(state, parentId));
        }
        finishExpiredConcentrations(states, removedSpells.filter((spell) => spell?.conc));
      }
      break;
    }
    case "condition:remove-parent-effects": {
      const byItem = new Map();
      for (const removal of operation.removals || []) {
        const itemId = String(removal?.itemId || "").trim();
        const parentEffectId = String(removal?.parentEffectId || "").trim();
        if (!itemId || !parentEffectId) continue;
        const ids = byItem.get(itemId) || new Set();
        ids.add(parentEffectId);
        byItem.set(itemId, ids);
      }
      for (const [itemId, parentIds] of byItem) {
        const state = states.get(itemId);
        if (state) state.conditions = state.conditions.filter((instance) =>
          String(instance?.type || "") !== "spell" ||
          !parentIds.has(String(instance?.parentEffectId || ""))
        );
      }
      break;
    }
    case "condition:remove-name":
      for (const targetId of targetIds) {
        const state = states.get(targetId);
        if (state) state.conditions = state.conditions.filter((instance) =>
          conditionKey(instance) !== conditionKey(operation.conditionName)
        );
      }
      break;
    case "condition:clear":
      for (const targetId of targetIds) {
        const state = states.get(targetId);
        if (state) state.conditions = [];
      }
      break;
    case "condition:automate":
      applyConditionAutomation(states, operation.subjectIds || targetIds);
      break;
    default:
      break;
  }
}

export function buildEffectsMutationPlan(items = [], operations = [], options = {}) {
  const original = new Map();
  const states = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const state = normalizeState(item);
    if (!state.id || states.has(state.id)) continue;
    original.set(state.id, clone(state));
    states.set(state.id, state);
  }

  for (const operation of Array.isArray(operations) ? operations : []) {
    applyOperation(states, operation, options);
  }

  const changes = [];
  for (const [id, state] of states) {
    const before = original.get(id);
    const fields = {
      spells: !sameValue(before.spells, state.spells),
      concentrations: !sameValue(before.concentrations, state.concentrations),
      conditions: !sameValue(before.conditions, state.conditions),
    };
    if (!fields.spells && !fields.concentrations && !fields.conditions) continue;
    changes.push({
      id,
      fields,
      before: {
        spells: clone(before.spells),
        concentrations: clone(before.concentrations),
        conditions: clone(before.conditions),
      },
      after: {
        spells: clone(state.spells),
        concentrations: clone(state.concentrations),
        conditions: clone(state.conditions),
      },
    });
  }

  return {
    operations: clone(operations),
    changes,
    changedIds: changes.map((change) => change.id),
    states: [...states.values()].map(clone),
  };
}

export const EFFECTS_MUTATION_CONDITION_VERSION = CONDITION_SCHEMA_VERSION;
