import {
  conditionKey,
  getConditionEntryAdditions,
  hasEffectiveCondition,
} from "./conditionRulesCore.js";
import { normalizeExhaustionLevel } from "./exhaustionCore.js";
import { normalizeEffectSaveReminders } from "./effectSaveReminderCore.js";
import {
  normalizeDeferredEffects,
  normalizeSpellEndConsequences,
} from "./spellLifecycleContracts.js";
import {
  createPendingTermination,
  normalizeTerminationContinuation,
  pendingTerminationForEntry,
  terminalResolutionDescriptor,
  terminationRequestId,
} from "./spellTerminationGatewayCore.js";

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

const FREEDOM_OF_MOVEMENT_KEYS = new Set([
  "freedom-of-movement",
  "freedom of movement",
  "libertà di movimento",
  "liberta di movimento",
]);

const FREEDOM_OF_MOVEMENT_IMMUNITIES = Object.freeze({
  names: Object.freeze(["paralizzato", "trattenuto"]),
  magicalOnly: true,
});

function conditionImmunityRules(state) {
  const rules = [];
  for (const instance of Array.isArray(state?.conditions) ? state.conditions : []) {
    if (!instance || instance.active === false) continue;
    const raw = instance?.mechanics?.conditionImmunities
      ?? instance?.mechanics?.conditions?.immunities;
    const definition = Array.isArray(raw)
      ? { names: raw }
      : raw && typeof raw === "object"
        ? raw
        : null;
    const names = Array.isArray(definition?.names)
      ? definition.names.map(conditionKey).filter(Boolean)
      : [];
    if (names.length) {
      rules.push({
        names: new Set(names),
        magicalOnly: definition.magicalOnly === true,
      });
    }
  }

  const freedomSpellActive = (Array.isArray(state?.spells) ? state.spells : [])
    .some((spell) => FREEDOM_OF_MOVEMENT_KEYS.has(spellKey(
      typeof spell === "string" ? spell : spell?.spellId,
    )) || FREEDOM_OF_MOVEMENT_KEYS.has(spellKey(
      typeof spell === "string" ? spell : spell?.name,
    )));
  if (freedomSpellActive) {
    rules.push({
      names: new Set(FREEDOM_OF_MOVEMENT_IMMUNITIES.names),
      magicalOnly: true,
    });
  }
  return rules;
}

function magicalConditionApplication(options = {}) {
  const type = String(options?.type || options?.effectType || "")
    .trim()
    .toLocaleLowerCase("it");
  return options?.magical === true
    || String(options?.sourceType || "").trim().toLocaleLowerCase("it") === "spell"
    || type === "spell"
    || type === "spell-effect";
}

function conditionBlockedByImmunity(state, conditionName, options = {}) {
  const name = conditionKey(conditionName);
  if (!name) return false;
  const magical = magicalConditionApplication(options);
  return conditionImmunityRules(state).some((rule) =>
    rule.names.has(name) && (!rule.magicalOnly || magical)
  );
}

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

function normalizedActivation(value, sourceId, targetId) {
  if (!value || typeof value !== "object") return null;
  const activation = normalizedExpiry(value);
  if (activation.mode !== "turn-start" && activation.mode !== "turn-end") return null;
  activation.actor = activation.actor === "source" ? "source" : "target";
  if (!activation.actorId) {
    activation.actorId = activation.actor === "source" ? sourceId : targetId;
  }
  return activation;
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

function normalizedSummaryParts(value) {
  return (Array.isArray(value) ? value : [])
    .map((part, index) => {
      const id = String(part?.id || part?.key || `part-${index + 1}`).trim();
      const label = String(part?.label || part?.text || "").trim();
      return id && label
        ? {
          id: id.slice(0, 80),
          label: label.slice(0, 160),
          ...(part?.stack === true ? { stack: true } : {}),
        }
        : null;
    })
    .filter(Boolean)
    .slice(0, 12);
}

function boundaryMatchCount(expiry, actorId, appliedAt, boundaries) {
  return boundaries.filter((boundary) => {
    if (boundary.mode !== expiry.mode || boundary.actorId !== actorId) return false;
    if (expiry.anchor !== "next-turn" || !appliedAt?.turnKey || !boundary.turnKey) return true;
    return boundary.turnKey !== appliedAt.turnKey;
  }).length;
}

function terminalAccumulationRule(spell) {
  const descriptor = terminalResolutionDescriptor(spell);
  const accumulation = descriptor?.accumulation;
  if (!accumulation || typeof accumulation !== "object") return null;
  const path = Array.isArray(accumulation.path)
    ? accumulation.path.map((part) => String(part || "").trim()).filter(Boolean)
    : [];
  const max = Number(accumulation.max);
  if (
    accumulation.mode !== "turn-end"
    || !path.length
    || !Number.isFinite(max)
    || max < 0
  ) return null;
  return {
    ...accumulation,
    path,
    max: Math.floor(max),
  };
}

function temporalActorId(value) {
  return String(value || "").trim().replace(/::p\d+$/u, "");
}

function applyTerminalAccumulation(spell, stateId, boundaries = [], mutationContext = null) {
  const rule = terminalAccumulationRule(spell);
  if (!rule || !Array.isArray(boundaries) || !boundaries.length) return spell;
  const casterId = temporalActorId(spell?.casterId || stateId || "");
  let increment = 0;
  for (const boundary of boundaries) {
    if (boundary?.mode !== rule.mode) continue;
    const actor = rule.actor === "target"
      ? temporalActorId(stateId)
      : casterId;
    if (!actor || temporalActorId(boundary?.actorId) !== actor) continue;
    increment += 1;
  }
  if (!increment) return spell;
  const context = spell?.castContext && typeof spell.castContext === "object"
    ? clone(spell.castContext)
    : {};
  let cursor = context;
  for (let index = 0; index < rule.path.length - 1; index += 1) {
    const part = rule.path[index];
    if (!cursor[part] || typeof cursor[part] !== "object" || Array.isArray(cursor[part])) {
      cursor[part] = {};
    } else {
      cursor[part] = { ...cursor[part] };
    }
    cursor = cursor[part];
  }
  const leaf = rule.path[rule.path.length - 1];
  const current = Math.max(0, Math.floor(Number(cursor[leaf]) || 0));
  const next = Math.min(rule.max, current + increment);
  if (
    next !== current
    && mutationContext
    && typeof mutationContext === "object"
  ) {
    mutationContext.terminalAccumulationApplied = true;
  }
  cursor[leaf] = next;
  return { ...spell, castContext: context };
}

function syncConcentrationCastContext(state) {
  if (!state || !state.concentrations || !Array.isArray(state.spells)) return;
  for (const spell of state.spells) {
    if (!spell?.conc || !spell?.castContext || typeof spell.castContext !== "object") continue;
    const instanceId = String(spell.instanceId || "").trim();
    if (!instanceId) continue;
    const key = Object.keys(state.concentrations).find((candidate) => (
      String(state.concentrations[candidate]?.instanceId || "") === instanceId
    ));
    if (!key) continue;
    const entry = state.concentrations[key] || {};
    state.concentrations[key] = {
      ...entry,
      castContext: clone(spell.castContext),
    };
  }
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
  const activation = normalizedActivation(options.activation, sourceId, targetId);

  if (expiry.mode === "turn-start" || expiry.mode === "turn-end") {
    expiry.actor = expiry.actor === "source" ? "source" : "target";
    if (!expiry.actorId) expiry.actorId = expiry.actor === "source" ? sourceId : targetId;
  }
  const appliedAt = normalizedAppliedAt(options.appliedAt);

  const instance = {
    id: String(instanceId),
    condition,
    active: activation ? false : options.active !== false,
    targetId,
    expiry,
    createdAt: Number(operation?.createdAt) || Date.now(),
  };
  if (activation) instance.activation = activation;
  if (sourceId) instance.sourceId = sourceId;
  if (options.sourceName) instance.sourceName = String(options.sourceName);
  if (options.parentEffectId) instance.parentEffectId = String(options.parentEffectId);
  if (options.spellName) instance.spellName = String(options.spellName);
  if (options.spellId) instance.spellId = String(options.spellId);
  if (options.type || options.effectType) instance.type = String(options.type || options.effectType);
  if (options.effectId) instance.effectId = String(options.effectId);
  if (options.effectKind === "buff" || options.effectKind === "debuff") {
    instance.effectKind = options.effectKind;
  }
  const summaryParts = normalizedSummaryParts(options.summaryParts);
  if (summaryParts.length) instance.summaryParts = summaryParts;
  if (options.displayLabel) instance.displayLabel = String(options.displayLabel);
  if (options.magical === true) instance.magical = true;
  if (options.effectDetail) instance.effectDetail = String(options.effectDetail);
  if (options.theme && typeof options.theme === "object") {
    instance.theme = clone(options.theme);
  }
  const saveReminders = normalizeEffectSaveReminders(options.saveReminder);
  if (saveReminders.length) {
    instance.saveReminder = saveReminders.length === 1
      ? saveReminders[0]
      : saveReminders;
  }
  const deferredEffects = normalizeDeferredEffects(
    options.deferredEffects ?? options.deferredEffect,
  ).map((effect) => ({
    ...effect,
    ...(sourceId || options.sourceName
      ? {
        provenance: {
          ...(effect.provenance || {}),
          ...(sourceId ? { casterId: sourceId } : {}),
          ...(options.sourceName ? { casterName: String(options.sourceName) } : {}),
        },
      }
      : {}),
  }));
  if (deferredEffects.length) instance.deferredEffects = deferredEffects;
  if (options.mechanics && typeof options.mechanics === "object") {
    instance.mechanics = clone(options.mechanics);
  }
  if (options.manualRemoval === true) instance.manualRemoval = true;
  if (options.mapVisible === false) instance.mapVisible = false;
  if (options.endsParentOnRemoval === true) instance.endsParentOnRemoval = true;
  if (options.parentRemoval === "target" || options.parentRemoval === "spell") {
    instance.parentRemoval = options.parentRemoval;
  }
  if (
    options.parentEndCondition
    && typeof options.parentEndCondition === "object"
    && String(options.parentEndCondition.condition || "").trim()
  ) {
    instance.parentEndCondition = clone(options.parentEndCondition);
  }
  if (options.exhaustionContribution === true) instance.exhaustionContribution = true;
  if (condition === EXHAUSTION_CONDITION) {
    instance.level = Math.max(1, normalizeExhaustionLevel(options.level || 1));
  }
  if (appliedAt) instance.appliedAt = appliedAt;
  return instance;
}

function appendCondition(state, operation, targetId) {
  if (conditionBlockedByImmunity(
    state,
    operation?.conditionName,
    operation?.options || {},
  )) return;
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
      // Le conseguenze automatiche (es. Prono entrando in Privo di sensi)
      // sono condizioni fisiche indipendenti: non devono ereditare lifecycle,
      // mechanics o identity dell'effetto che le ha generate.
      sourceId: "",
      sourceName: "",
      parentEffectId: "",
      spellName: "",
      spellId: "",
      type: "automatic",
      effectId: "",
      effectKind: "",
      magical: false,
      effectDetail: "",
      theme: null,
      saveReminder: null,
      deferredEffects: null,
      deferredEffect: null,
      mechanics: null,
      manualRemoval: false,
      mapVisible: true,
      endsParentOnRemoval: false,
      parentRemoval: "",
      parentEndCondition: null,
      exhaustionContribution: false,
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
  // parentEffectId è il legame autorevole col lifecycle del parent.
  // Non dipendere da type=spell: condizioni create da percorsi legacy o
  // normalizzate come condizioni standard devono comunque terminare col parent.
  state.conditions = state.conditions.filter((instance) =>
    !parentIds.has(String(instance?.parentEffectId || "").trim())
  );
}

function removeLinkedConditionsFromAllStates(states, parentEffectId) {
  const parentId = String(parentEffectId || "").trim();
  if (!parentId) return;
  for (const state of states.values()) {
    state.conditions = state.conditions.filter((instance) =>
      String(instance?.parentEffectId || "").trim() !== parentId
    );
  }
}

function applyParentEndConditions(
  state,
  parentEffectIds = [],
  { naturalOnly = false } = {},
) {
  const parentIds = new Set(uniqueIds(parentEffectIds));
  if (!parentIds.size) return;
  const linked = state.conditions.filter((instance) =>
    parentIds.has(String(instance?.parentEffectId || "").trim())
    && instance?.parentEndCondition
    && typeof instance.parentEndCondition === "object"
    && (naturalOnly || instance.parentEndCondition.naturalOnly !== true)
  );
  for (const instance of linked) {
    const consequence = instance.parentEndCondition;
    const conditionName = String(consequence.condition || "").trim();
    const key = conditionKey(conditionName);
    if (!conditionName) continue;
    const hasIndependentMatchingCondition = state.conditions.some((entry) =>
      entry?.active !== false
      && conditionKey(entry) === key
      && !parentIds.has(String(entry?.parentEffectId || "").trim())
    );
    if (hasIndependentMatchingCondition) continue;
    appendCondition(state, {
      createdAt: Number(instance.createdAt) || Date.now(),
      conditionName,
      instanceIds: {
        [state.id]: `${instance.id}:parent-end:${key}`,
      },
      options: {
        type: "automatic",
        ...(consequence.options && typeof consequence.options === "object"
          ? clone(consequence.options)
          : {}),
        expiry: consequence.expiry && typeof consequence.expiry === "object"
          ? clone(consequence.expiry)
          : { mode: "manual" },
      },
    }, state.id);
  }
}

function applyParentEndConditionsToAllStates(states, parentEffectId) {
  const parentId = String(parentEffectId || "").trim();
  if (!parentId) return;
  for (const state of states.values()) {
    applyParentEndConditions(state, [parentId]);
  }
}

function applySpellEndConsequences(state, removedSpells) {
  for (const spell of Array.isArray(removedSpells) ? removedSpells : []) {
    const consequences = normalizeSpellEndConsequences(spell?.onSpellEnd);
    if (!consequences.length) continue;
    for (const consequence of consequences) {
      const targetId = consequence.target === "source"
        ? String(spell?.casterId || "").trim()
        : state.id;
      if (!targetId || targetId !== state.id) continue;
      const parentId = String(spell?.instanceId || spell?.id || "").trim();
      const instanceId = `${parentId}:on-spell-end:${consequence.id}:${targetId}`;
      const options = {
        ...(consequence.options || {}),
        type: "automatic",
        ...(spell?.casterId ? { sourceId: String(spell.casterId) } : {}),
        ...(spell?.casterName ? { sourceName: String(spell.casterName) } : {}),
      };
      delete options.parentEffectId;
      appendCondition(state, {
        operationId: `spell-end:${parentId}:${consequence.id}`,
        createdAt: Number(spell?.appliedAt?.round) || Date.now(),
        conditionName: consequence.condition,
        instanceIds: { [targetId]: instanceId },
        options,
      }, targetId);
    }
  }
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
    applySpellEndConsequences(state, removed);
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

function cleanupRemovedSpellLinksFromAllStates(states, removedSpells = []) {
  const parentEffectIds = uniqueIds(
    (Array.isArray(removedSpells) ? removedSpells : [])
      .map((spell) => String(spell?.instanceId || "").trim())
      .filter(Boolean),
  );
  for (const parentEffectId of parentEffectIds) {
    applyParentEndConditionsToAllStates(states, parentEffectId);
    removeLinkedConditionsFromAllStates(states, parentEffectId);
  }
}

function concentrationMatchesReference(entry, key, reference) {
  const wanted = String(reference || "").trim();
  if (!wanted) return true;
  const pending = pendingTerminationForEntry(entry);
  return spellKey(key) === spellKey(wanted)
    || String(entry?.instanceId || "") === wanted
    || String(pending?.instanceId || "") === wanted;
}

function matchingConcentrationKeys(caster, reference = null) {
  if (!caster) return [];
  const keys = Object.keys(caster.concentrations || {})
    .filter((key) => concentrationMatchesReference(caster.concentrations[key], key, reference));
  return String(reference || "").trim() ? keys.slice(0, 1) : keys;
}

function concentrationEntryForSpell(states, spell) {
  const casterId = String(spell?.casterId || "").trim();
  if (!casterId) return null;
  const caster = states.get(casterId);
  if (!caster) return null;
  const instanceId = String(spell?.instanceId || "").trim();
  const name = String(spell?.name || "").trim();
  const key = Object.keys(caster.concentrations || {}).find((candidate) => {
    const entry = caster.concentrations[candidate] || {};
    const pending = pendingTerminationForEntry(entry);
    return (instanceId && String(entry.instanceId || "") === instanceId)
      || (instanceId && String(pending?.instanceId || "") === instanceId)
      || (name && spellKey(candidate) === spellKey(name));
  });
  return key ? {
    caster,
    key,
    entry: caster.concentrations[key] || {},
  } : null;
}

function terminalResolutionForConcentration(states, caster, entry) {
  const instanceId = String(entry?.instanceId || "").trim();
  const spellCandidates = [];
  if (instanceId) {
    for (const state of states.values()) {
      const spell = state.spells.find((candidate) => (
        String(candidate?.instanceId || "") === instanceId
      ));
      if (spell) spellCandidates.push(spell);
    }
  }
  if (!spellCandidates.length && entry?.name) {
    const name = spellKey(entry.name);
    for (const state of states.values()) {
      const spell = state.spells.find((candidate) => (
        spellKey(candidate?.name) === name
        && (!candidate?.casterId || String(candidate.casterId) === caster.id)
      ));
      if (spell) spellCandidates.push(spell);
    }
  }
  return terminalResolutionDescriptor(entry, spellCandidates[0] || null);
}

function terminationEvent(caster, key, entry, pending, reused = false) {
  return {
    casterId: caster.id,
    concentrationKey: key,
    reference: String(entry?.instanceId || key || "").trim(),
    instanceId: String(pending?.instanceId || entry?.instanceId || key || "").trim(),
    pendingTermination: clone(pending),
    ...(reused ? { reused: true } : {}),
  };
}

function beginPendingTermination(states, caster, key, operation = {}, context = {}) {
  const entry = caster?.concentrations?.[key];
  if (!entry || typeof entry !== "object") return null;
  const instanceId = String(entry.instanceId || key || "").trim();
  if (!instanceId) return null;
  if (String(context?.bypassInstanceId || "").trim() === instanceId) return null;

  const existing = pendingTerminationForEntry(entry);
  if (existing) return terminationEvent(caster, key, entry, existing, true);

  const terminalResolution = terminalResolutionForConcentration(states, caster, entry);
  if (!terminalResolution) return null;
  const pending = createPendingTermination({
    instanceId,
    reason: operation?.reason || context?.reason || "termination",
    requestId: operation?.requestId || operation?.operationId
      || terminationRequestId({ casterId: caster.id, instanceId }),
    terminalResolution,
    continuation: operation?.continuation,
    createdAt: operation?.createdAt,
  });
  if (!pending) return null;
  caster.concentrations[key] = {
    ...entry,
    pendingTermination: pending,
  };
  return terminationEvent(caster, key, caster.concentrations[key], pending);
}

function pendingEventForSpell(states, spell, operation = {}, context = {}) {
  if (!spell?.conc) return null;
  const match = concentrationEntryForSpell(states, spell);
  if (!match) return null;
  return beginPendingTermination(states, match.caster, match.key, operation, context);
}

function spellHasPendingTermination(states, spell) {
  if (!spell?.conc) return false;
  const match = concentrationEntryForSpell(states, spell);
  return !!pendingTerminationForEntry(match?.entry);
}

function attachTerminationContinuation(states, event, continuation) {
  const normalized = normalizeTerminationContinuation(continuation);
  if (!normalized) return event;
  const caster = states.get(String(event?.casterId || "").trim());
  const key = String(event?.concentrationKey || "").trim();
  const entry = caster?.concentrations?.[key];
  const pending = pendingTerminationForEntry(entry);
  const hasContinuation = pending?.continuation
    && (pending.continuation.operations?.length || pending.continuation.options);
  if (!entry || !pending || hasContinuation) return event;
  const nextPending = { ...pending, continuation: normalized };
  caster.concentrations[key] = { ...entry, pendingTermination: nextPending };
  return {
    ...event,
    pendingTermination: clone(nextPending),
  };
}

function breakConcentration(states, casterId, reference = null, context = {}, operation = {}) {
  const caster = states.get(String(casterId || "").trim());
  if (!caster) return null;
  const matchedKeys = matchingConcentrationKeys(caster, reference);

  // Terminal rules arbitrate before ordinary cleanup, preserving the parent
  // and its concentration entry until a resolver explicitly resumes it.
  for (const matchedKey of matchedKeys) {
    const pending = beginPendingTermination(
      states,
      caster,
      matchedKey,
      operation,
      context,
    );
    if (pending) return pending;
  }

  for (const matchedKey of matchedKeys) {
    const entry = caster.concentrations[matchedKey] || {};
    const instanceId = String(entry.instanceId || "").trim();
    const spellName = String(entry.name || matchedKey).trim();
    if (instanceId) applyParentEndConditionsToAllStates(states, instanceId);
    for (const targetId of uniqueIds(entry.targets)) {
      const target = states.get(targetId);
      if (!target) continue;
      if (instanceId) removeSpellByInstance(target, instanceId);
      else removeSpellByNameAndSource(target, spellName, caster.id);
    }
    if (instanceId) removeSpellByInstance(caster, instanceId);
    else removeSpellByNameAndSource(caster, spellName, caster.id);
    if (instanceId) removeLinkedConditionsFromAllStates(states, instanceId);
    delete caster.concentrations[matchedKey];
  }
  return null;
}

function breakConcentrationOnTargets(
  states,
  casterId,
  reference,
  targetIds = [],
  context = {},
  operation = {},
) {
  const caster = states.get(String(casterId || "").trim());
  const wanted = String(reference || "").trim();
  const scopedTargets = new Set(uniqueIds(targetIds));
  if (!caster || !wanted || !scopedTargets.size) return null;

  const matchedKey = Object.keys(caster.concentrations || {})
    .find((key) => spellKey(key) === spellKey(wanted) ||
      String(caster.concentrations[key]?.instanceId || "") === wanted);
  if (!matchedKey) return null;

  const entry = caster.concentrations[matchedKey] || {};
  const existingPending = pendingTerminationForEntry(entry);
  if (existingPending) {
    return terminationEvent(caster, matchedKey, entry, existingPending, true);
  }
  const currentTargets = uniqueIds(entry.targets);
  const removedTargets = currentTargets.filter((targetId) => scopedTargets.has(targetId));
  if (!removedTargets.length) return null;

  const instanceId = String(entry.instanceId || "").trim();
  const spellName = String(entry.name || matchedKey).trim();
  const remainingTargets = currentTargets.filter((targetId) => !scopedTargets.has(targetId));

  // Rimuovere l'ultimo target equivale a terminare davvero la concentrazione.
  // Delega al lifecycle completo così spell, parent-end e child effect remoti
  // vengono puliti nello stesso modo del normale concentration:break.
  if (!remainingTargets.length) {
    const pending = beginPendingTermination(states, caster, matchedKey, operation, context);
    if (pending) return pending;
    return breakConcentration(
      states,
      caster.id,
      instanceId || matchedKey,
      context,
      operation,
    );
  }

  for (const targetId of removedTargets) {
    const target = states.get(targetId);
    if (!target) continue;
    if (instanceId) removeSpellByInstance(target, instanceId);
    else removeSpellByNameAndSource(target, spellName, caster.id);
  }

  caster.concentrations[matchedKey] = { ...entry, targets: remainingTargets };
  return null;
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
  if (operation?.casterName) extra.casterName = String(operation.casterName);
  if (operation?.conc != null) extra.conc = operation.conc === true;
  if (instanceId) extra.instanceId = instanceId;
  if (spellId) extra.spellId = spellId;
  const appliedAt = normalizedAppliedAt(operation?.appliedAt);
  if (appliedAt) extra.appliedAt = appliedAt;
  if (operation?.castContext && typeof operation.castContext === "object") {
    extra.castContext = clone(operation.castContext);
  }
  if (Array.isArray(operation?.summaryParts)) {
    extra.summaryParts = normalizedSummaryParts(operation.summaryParts);
  }
  const onSpellEnd = normalizeSpellEndConsequences(operation?.onSpellEnd);
  if (onSpellEnd.length) extra.onSpellEnd = { conditions: onSpellEnd };
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

function applySpellAdjustment(states, operation, context = {}) {
  // Temporal descriptors normally carry raw `{ phase: "start" | "end" }`
  // boundaries.  Normalize them before applying per-instance terminal rules
  // so a boundary that also expires a spell still contributes its final
  // turn-end accumulation before the gateway preserves the parent.
  const boundaries = normalizedBoundaries(operation?.boundaries);
  const expiredConcentrations = [];
  const pendingTerminations = [];
  for (const targetId of uniqueIds(operation?.targetIds)) {
    const state = states.get(targetId);
    if (!state?.spells.length) continue;
    const next = [];
    const removed = [];
    for (const rawSpell of state.spells) {
      const spell = operation?.boundaries
        && operation?.skipTerminalAccumulation !== true
        && !spellHasPendingTermination(states, rawSpell)
        ? applyTerminalAccumulation(rawSpell, state.id, boundaries, context)
        : rawSpell;
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
        const pending = pendingEventForSpell(
          states,
          spell,
          { ...operation, reason: operation?.reason || "expiry" },
          context,
        );
        if (pending) {
          next.push(spell);
          pendingTerminations.push(pending);
        } else {
          removed.push(spell);
          if (spell?.conc) expiredConcentrations.push(spell);
        }
      }
    }
    state.spells = next;
    syncConcentrationCastContext(state);
    applySpellEndConsequences(state, removed);
    applyParentEndConditions(
      state,
      removed
        .filter((spell) => spell?.conc === true)
        .map((spell) => spell?.instanceId),
      { naturalOnly: true },
    );
    removeLinkedConditions(state, removed);
  }

  const seen = new Set();
  for (const spell of expiredConcentrations) {
    const casterId = String(spell?.casterId || "").trim();
    const reference = String(spell?.instanceId || spell?.name || "").trim();
    const signature = `${casterId}|${reference}`;
    if (!casterId || !reference || seen.has(signature)) continue;
    seen.add(signature);
    const pending = breakConcentration(
      states,
      casterId,
      reference,
      context,
      { ...operation, reason: operation?.reason || "expiry" },
    );
    if (pending) pendingTerminations.push(pending);
  }
  return pendingTerminations[0] || null;
}

function normalizedBoundaries(boundaries = []) {
  return (Array.isArray(boundaries) ? boundaries : []).map((boundary) => ({
    mode: boundary?.mode === "turn-start" || boundary?.phase === "start" ? "turn-start"
      : boundary?.mode === "turn-end" || boundary?.phase === "end" ? "turn-end"
      : "",
    actorId: String(boundary?.actorId || "").trim(),
    turnKey: String(boundary?.turnKey || "").trim(),
  })).filter((boundary) => boundary.mode && boundary.actorId);
}

function finishExpiredConcentrations(states, spells = [], context = {}, operation = {}) {
  const seen = new Set();
  let pendingTermination = null;
  for (const spell of spells) {
    const casterId = String(spell?.casterId || "").trim();
    const reference = String(spell?.instanceId || spell?.name || "").trim();
    const signature = `${casterId}|${reference}`;
    if (!casterId || !reference || seen.has(signature)) continue;
    seen.add(signature);
    const pending = breakConcentration(states, casterId, reference, context, operation);
    if (pending && !pendingTermination) pendingTermination = pending;
  }
  return pendingTermination;
}

function conditionParentRemoval(instance) {
  if (instance?.parentRemoval === "target" || instance?.parentRemoval === "spell") {
    return instance.parentRemoval;
  }
  return instance?.endsParentOnRemoval === true ? "spell" : "";
}

function applySpellBoundaryAdjustment(states, operation, context = {}) {
  const boundaries = normalizedBoundaries(operation?.boundaries);
  if (!boundaries.length) return;
  const expiredConcentrations = [];
  const pendingTerminations = [];
  for (const targetId of uniqueIds(operation?.targetIds)) {
    const state = states.get(targetId);
    if (!state?.spells.length) continue;
    const next = [];
    const removed = [];
    for (const rawSpell of state.spells) {
      const spell = operation?.skipTerminalAccumulation === true
        || spellHasPendingTermination(states, rawSpell)
        ? rawSpell
        : applyTerminalAccumulation(rawSpell, state.id, boundaries, context);
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
        const pending = pendingEventForSpell(
          states,
          spell,
          { ...operation, reason: operation?.reason || "expiry" },
          context,
        );
        if (pending) {
          next.push(spell);
          pendingTerminations.push(pending);
        } else {
          removed.push(spell);
          if (spell?.conc) expiredConcentrations.push(spell);
        }
      }
    }
    state.spells = next;
    syncConcentrationCastContext(state);
    applySpellEndConsequences(state, removed);
    applyParentEndConditions(
      state,
      removed
        .filter((spell) => spell?.conc === true)
        .map((spell) => spell?.instanceId),
      { naturalOnly: true },
    );
    removeLinkedConditions(state, removed);
  }
  const pending = finishExpiredConcentrations(
    states,
    expiredConcentrations,
    context,
    { ...operation, reason: operation?.reason || "expiry" },
  );
  if (pending) pendingTerminations.push(pending);
  return pendingTerminations[0] || null;
}

function applyConditionBoundaryAdjustment(states, operation) {
  const boundaries = normalizedBoundaries(operation?.boundaries);
  if (!boundaries.length) return;
  for (const targetId of uniqueIds(operation?.targetIds)) {
    const state = states.get(targetId);
    if (!state?.conditions.length) continue;
    state.conditions = state.conditions.flatMap((instance) => {
      const activation = instance?.activation || null;
      if (
        instance?.active === false
        && activation
        && (activation.mode === "turn-start" || activation.mode === "turn-end")
      ) {
        const actorId = String(activation.actorId || (
          activation.actor === "source" ? instance?.sourceId : state.id
        ) || "").trim();
        const matches = boundaryMatchCount(activation, actorId, instance?.appliedAt, boundaries);
        const remaining = Math.max(1, Math.floor(Number(activation.remaining) || 1));
        const nextRemaining = remaining - matches;
        if (nextRemaining > 0) {
          return [{ ...instance, activation: { ...activation, remaining: nextRemaining } }];
        }
        const activated = { ...instance, active: true };
        delete activated.activation;
        return [activated];
      }
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

function applyConditionAutomation(states, subjectIds, context = {}, operation = {}) {
  const incapacitated = new Set();
  for (const subjectId of uniqueIds(subjectIds)) {
    const subject = states.get(subjectId);
    if (subject && hasEffectiveCondition(subject.conditions, "Incapacitato")) {
      incapacitated.add(subjectId);
    }
  }
  if (!incapacitated.size) return null;

  for (const casterId of incapacitated) {
    const pending = breakConcentration(states, casterId, null, context, operation);
    if (pending) return pending;
  }
  for (const state of states.values()) {
    state.conditions = state.conditions.filter((instance) =>
      conditionKey(instance) !== "afferrato" ||
      !incapacitated.has(String(instance?.sourceId || ""))
    );
  }
  return null;
}

function pendingEventForSpellRemoval(states, state, predicate, operation, context) {
  const spell = state?.spells?.find((candidate) => predicate(candidate));
  return spell ? pendingEventForSpell(states, spell, operation, context) : null;
}

function concentrationKeyForPending(caster, operation = {}) {
  const requestedInstance = String(operation?.instanceId || "").trim();
  const reference = String(operation?.reference || "").trim();
  return Object.keys(caster?.concentrations || {}).find((key) => {
    const entry = caster.concentrations[key] || {};
    const pending = pendingTerminationForEntry(entry);
    return (requestedInstance && String(entry.instanceId || "") === requestedInstance)
      || (requestedInstance && String(pending?.instanceId || "") === requestedInstance)
      || (reference && concentrationMatchesReference(entry, key, reference));
  }) || "";
}

function resumeTermination(states, operation, context = {}) {
  const casterId = String(operation?.casterId || operation?.casterIds?.[0] || "").trim();
  const caster = states.get(casterId);
  if (!caster) return {
    terminationConflict: { reason: "terminal-resolution-caster-missing", casterId },
  };
  const key = concentrationKeyForPending(caster, operation);
  if (!key) return {
    terminationConflict: {
      reason: "terminal-resolution-instance-missing",
      casterId,
      instanceId: String(operation?.instanceId || operation?.reference || "").trim() || null,
    },
  };
  const entry = caster.concentrations[key] || {};
  const pending = pendingTerminationForEntry(entry);
  if (!pending) return {
    terminationConflict: {
      reason: "terminal-resolution-not-pending",
      casterId,
      instanceId: String(entry.instanceId || key),
    },
  };
  const requestId = String(operation?.requestId || "").trim();
  if (!requestId || requestId !== String(pending.requestId || "")) return {
    terminationConflict: {
      reason: "terminal-resolution-stale-request",
      casterId,
      instanceId: String(pending.instanceId || entry.instanceId || key),
      requestId: requestId || null,
    },
  };

  const instanceId = String(pending.instanceId || entry.instanceId || key).trim();
  const resumed = breakConcentration(
    states,
    caster.id,
    instanceId,
    { ...context, bypassInstanceId: instanceId },
    { ...operation, reason: "terminal-resolution-resume" },
  );
  if (resumed) return resumed;

  const continuation = normalizeTerminationContinuation(pending.continuation);
  if (!continuation?.operations?.length) return null;
  for (const [index, continuationOperation] of continuation.operations.entries()) {
    const replayOperation = {
      ...continuationOperation,
      operationId: continuationOperation?.operationId
        || `${pending.requestId}:continuation:${index + 1}`,
      createdAt: continuationOperation?.createdAt || Date.now(),
    };
    const outcome = applyOperation(
      states,
      replayOperation,
      context?.options || {},
      context,
    );
    if (outcome?.terminationConflict) return outcome;
    if (outcome?.pendingTermination) {
      const remaining = continuation.operations.slice(index + 1);
      const nested = attachTerminationContinuation(
        states,
        outcome.pendingTermination,
        remaining.length ? { operations: remaining } : null,
      );
      return { ...outcome, pendingTermination: nested.pendingTermination };
    }
  }
  return null;
}

function applyOperation(states, operation, options = {}, context = {}) {
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
        if (!state) continue;
        for (const previousName of uniqueIds(operation?.replaceNames)) {
          const pending = pendingEventForSpellRemoval(
            states,
            state,
            (spell) => (
              spellKey(spell?.name) === spellKey(previousName)
              && (!operation.source
                || !spell?.casterId
                || String(spell.casterId) === String(operation.source))
            ),
            { ...operation, reason: operation?.reason || "replacement" },
            context,
          );
          if (pending) return { pendingTermination: pending, deferOperation: true };
        }
        applySpellUpsert(state, operation);
      }
      break;
    case "spell:remove-instance":
      for (const targetId of targetIds) {
        const state = states.get(targetId);
        if (!state) continue;
        const pending = pendingEventForSpellRemoval(
          states,
          state,
          (spell) => String(spell?.instanceId || "") === String(operation.instanceId || ""),
          operation,
          context,
        );
        if (pending) return { pendingTermination: pending, deferOperation: true };
        const removedSpells = removeSpellByInstance(state, operation.instanceId);
        cleanupRemovedSpellLinksFromAllStates(states, removedSpells);
      }
      break;
    case "spell:remove-name-source":
      for (const targetId of targetIds) {
        const state = states.get(targetId);
        if (!state) continue;
        const pending = pendingEventForSpellRemoval(
          states,
          state,
          (spell) => (
            spellKey(spell?.name) === spellKey(operation.name)
            && (!operation.casterId
              || !spell?.casterId
              || String(spell.casterId) === String(operation.casterId))
          ),
          operation,
          context,
        );
        if (pending) return { pendingTermination: pending, deferOperation: true };
        const removedSpells = removeSpellByNameAndSource(state, operation.name, operation.casterId);
        cleanupRemovedSpellLinksFromAllStates(states, removedSpells);
      }
      break;
    case "spell:clear-non-concentration":
      for (const targetId of targetIds) {
        const state = states.get(targetId);
        if (state) removeSpells(state, (spell) => !spell?.conc);
      }
      break;
    case "spell:adjust":
      {
        const pending = applySpellAdjustment(states, operation, context);
        if (pending) return { pendingTermination: pending };
      }
      break;
    case "effects:tick-round":
      {
        const pending = applySpellAdjustment(states, operation, context);
        if (pending) return { pendingTermination: pending };
      }
      applyConditionAdjustment(states, operation);
      break;
    case "condition:adjust":
      applyConditionAdjustment(states, operation);
      break;
    case "effects:tick-boundaries":
      {
        const pending = applySpellBoundaryAdjustment(states, operation, context);
        if (pending) return { pendingTermination: pending };
      }
      applyConditionBoundaryAdjustment(states, operation);
      break;
    case "condition:tick-boundaries":
      applyConditionBoundaryAdjustment(states, operation);
      break;
    case "concentration:register": {
      const caster = states.get(String(operation.casterId || "").trim());
      const key = spellKey(operation.name);
      if (!caster || !key) break;
      const pendingEntry = Object.entries(caster.concentrations || {})
        .find(([, entry]) => pendingTerminationForEntry(entry));
      if (pendingEntry) {
        const pending = pendingTerminationForEntry(pendingEntry[1]);
        return {
          pendingTermination: terminationEvent(
            caster,
            pendingEntry[0],
            pendingEntry[1],
            pending,
            true,
          ),
          deferOperation: true,
        };
      }
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
      const appliedAt = normalizedAppliedAt(operation.appliedAt);
      if (appliedAt) entry.appliedAt = appliedAt;
      if (operation.castContext && typeof operation.castContext === "object") {
        entry.castContext = clone(operation.castContext);
      }
      caster.concentrations[key] = entry;
      break;
    }
    case "concentration:break":
      for (const casterId of uniqueIds(operation.casterIds || [operation.casterId])) {
        const pending = breakConcentration(
          states,
          casterId,
          operation.reference ?? null,
          context,
          operation,
        );
        if (pending) return { pendingTermination: pending };
      }
      break;
    case "termination:request":
      for (const casterId of uniqueIds(operation.casterIds || [operation.casterId])) {
        const pending = breakConcentration(
          states,
          casterId,
          operation.reference ?? operation.instanceId ?? null,
          context,
          operation,
        );
        if (pending) return { pendingTermination: pending };
      }
      break;
    case "concentration:break-targets":
      for (const casterId of uniqueIds(operation.casterIds || [operation.casterId])) {
        const pending = breakConcentrationOnTargets(
          states,
          casterId,
          operation.reference ?? null,
          targetIds,
          context,
          operation,
        );
        if (pending) return { pendingTermination: pending };
      }
      break;
    case "condition:add":
      for (const targetId of targetIds) {
        const state = states.get(targetId);
        if (state) appendCondition(state, operation, targetId);
      }
      break;
    case "condition:add-instances": {
      const byTarget = operation.instancesByTarget && typeof operation.instancesByTarget === "object"
        ? operation.instancesByTarget
        : {};
      for (const [targetId, additions] of Object.entries(byTarget)) {
        const state = states.get(targetId);
        if (!state || !Array.isArray(additions) || !additions.length) continue;
        const known = new Set(state.conditions.map((instance) => String(instance?.id || "")));
        for (const instance of additions) {
          const id = String(instance?.id || "").trim();
          if (!id || known.has(id)) continue;
          if (conditionBlockedByImmunity(
            state,
            instance?.condition || instance?.name,
            instance,
          )) continue;
          state.conditions.push(clone(instance));
          known.add(id);
        }
      }
      break;
    }
    case "condition:set-instances": {
      const byTarget = operation.instancesByTarget && typeof operation.instancesByTarget === "object"
        ? operation.instancesByTarget
        : {};
      for (const [targetId, instances] of Object.entries(byTarget)) {
        const state = states.get(targetId);
        if (!state) continue;
        const previous = clone(state.conditions);
        state.conditions = Array.isArray(instances) ? clone(instances) : [];
        if (operation.applyEntryConsequences !== true) continue;
        for (const addition of getConditionEntryAdditions(previous, state.conditions)) {
          const childName = String(addition?.condition || "").trim();
          const childKey = conditionKey(childName);
          const childId = String(
            operation?.consequenceInstanceIds?.[targetId]?.[childKey]
            || `${operation.operationId}:automatic:${targetId}:${childKey}`
          ).trim();
          if (!childName || !childId || state.conditions.some((entry) => String(entry?.id || "") === childId)) {
            continue;
          }
          const child = conditionInstance(operation, targetId, childId, childName, {
            type: "automatic",
            appliedAt: addition?.triggeredBy?.appliedAt,
            expiry: { mode: "manual" },
          });
          if (child) state.conditions.push(child);
        }
      }
      break;
    }
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
        const parentActions = new Map();
        for (const instance of state.conditions) {
          if (!instanceIds.has(String(instance?.id || ""))) continue;
          const parentId = String(instance?.parentEffectId || "").trim();
          const policy = conditionParentRemoval(instance);
          if (!parentId || !policy) continue;
          const previous = parentActions.get(parentId);
          parentActions.set(parentId, {
            parentId,
            policy: previous?.policy === "spell" || policy === "spell" ? "spell" : "target",
            sourceId: String(instance?.sourceId || previous?.sourceId || "").trim(),
          });
        }
        // Preflight concentration termination before removing the child
        // condition or parent spell. A terminal rule must preserve the full
        // parent instance while its resolver is pending.
        for (const action of parentActions.values()) {
          const concentrationSpell = state.spells.find((spell) => (
            String(spell?.instanceId || "") === action.parentId && spell?.conc === true
          ));
          if (!concentrationSpell) continue;
          const match = concentrationEntryForSpell(states, concentrationSpell);
          const entry = match?.entry || {};
          const currentTargets = uniqueIds(entry.targets);
          const terminatesWholeInstance = action.policy === "spell"
            || !currentTargets.some((targetId) => targetId !== itemId);
          if (!terminatesWholeInstance) continue;
          const pending = pendingEventForSpell(
            states,
            concentrationSpell,
            operation,
            context,
          );
          if (pending) return { pendingTermination: pending, deferOperation: true };
        }
        state.conditions = state.conditions.filter((instance) =>
          !instanceIds.has(String(instance?.id || ""))
        );
        const globallyRemovedSpells = [];
        for (const action of parentActions.values()) {
          const removedSpells = removeSpellByInstance(state, action.parentId);
          if (action.policy === "target") {
            const concentrationSpell = removedSpells.find((spell) => spell?.conc);
            const casterId = String(
              concentrationSpell?.casterId || action.sourceId || ""
            ).trim();
            if (casterId) {
              const pending = breakConcentrationOnTargets(
                states,
                casterId,
                action.parentId,
                [itemId],
                context,
                operation,
              );
              if (pending) return { pendingTermination: pending };
            }
          } else {
            globallyRemovedSpells.push(...removedSpells.filter((spell) => spell?.conc));
          }
        }
        const pending = finishExpiredConcentrations(
          states,
          globallyRemovedSpells,
          context,
          operation,
        );
        if (pending) return { pendingTermination: pending, deferOperation: true };
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
      const globalParentIds = new Set(
        (Array.isArray(operation.parentEffectIds) ? operation.parentEffectIds : [])
          .map((value) => String(value || "").trim())
          .filter(Boolean)
      );
      if (globalParentIds.size) {
        for (const itemId of states.keys()) byItem.set(itemId, globalParentIds);
      }
      for (const [itemId, parentIds] of byItem) {
        const state = states.get(itemId);
        if (state) state.conditions = state.conditions.filter((instance) => {
          if (!parentIds.has(String(instance?.parentEffectId || "").trim())) return true;
          // Se conditionTypes è esplicito, conserva il filtro richiesto dal caller
          // (es. class-feature). Senza filtro, il parentEffectId è autorevole e
          // l'intero effetto figlio va rimosso indipendentemente dal campo type.
          if (!Array.isArray(operation.conditionTypes)) return false;
          const allowedTypes = operation.conditionTypes.map((value) => String(value || ""));
          return !allowedTypes.includes(String(instance?.type || ""));
        });
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
      {
        const pending = applyConditionAutomation(
          states,
          operation.subjectIds || targetIds,
          context,
          operation,
        );
        if (pending) return { pendingTermination: pending, deferOperation: true };
      }
      break;
    case "termination:resume": {
      const outcome = resumeTermination(states, operation, context);
      if (outcome?.terminationConflict || outcome?.pendingTermination) return outcome;
      break;
    }
    default:
      break;
  }
  return null;
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

  const terminationEvents = [];
  const terminationConflicts = [];
  const orderedOperations = Array.isArray(operations) ? operations : [];
  const context = {
    options,
    bypassInstanceId: "",
    terminalAccumulationApplied: false,
  };
  for (let index = 0; index < orderedOperations.length; index += 1) {
    const operation = orderedOperations[index];
    const outcome = applyOperation(states, operation, options, context);
    if (outcome?.terminationConflict) {
      terminationConflicts.push(clone(outcome.terminationConflict));
      break;
    }
    if (outcome?.pendingTermination) {
      const event = outcome.pendingTermination;
      const explicitContinuation = normalizeTerminationContinuation(operation?.continuation);
      const tailOperations = orderedOperations.slice(index + 1);
      const continuationOperations = outcome.deferOperation
        ? [operation, ...tailOperations]
        : tailOperations;
      const continuation = explicitContinuation?.operations?.length
        ? explicitContinuation
        : continuationOperations.length
          ? { operations: clone(continuationOperations) }
          : null;
      const attached = attachTerminationContinuation(states, event, continuation);
      const signature = `${attached?.casterId || ""}|${attached?.instanceId || ""}`;
      if (!terminationEvents.some((candidate) => (
        `${candidate?.casterId || ""}|${candidate?.instanceId || ""}` === signature
      ))) {
        terminationEvents.push(clone(attached));
      }
      // The original lifecycle tail is the gateway continuation. Do not
      // apply it while the terminal resolution is pending.
      break;
    }
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

  if (terminationConflicts.length) {
    return {
      status: "conflict",
      reason: terminationConflicts[0]?.reason || "terminal-resolution-conflict",
      conflicts: terminationConflicts,
      terminationConflicts,
      terminationEvents,
      ...(terminationEvents.length ? { pendingTerminations: terminationEvents } : {}),
      operations: clone(operations),
      changes: [],
      changedIds: [],
      states: [...states.values()].map(clone),
    };
  }

  return {
    operations: clone(operations),
    changes,
    changedIds: changes.map((change) => change.id),
    states: [...states.values()].map(clone),
    ...(context.terminalAccumulationApplied ? { terminalAccumulationApplied: true } : {}),
    ...(terminationEvents.length ? { pendingTerminations: terminationEvents } : {}),
  };
}

export const EFFECTS_MUTATION_CONDITION_VERSION = CONDITION_SCHEMA_VERSION;
