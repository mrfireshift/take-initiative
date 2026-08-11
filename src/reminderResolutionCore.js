import { ID } from "./constants.js";
import { resolveZeroHPUnconsciousAction } from "./hpConditionRulesCore.js";
import {
  exhaustionLevelFromInstances,
  normalizeExhaustionLevel,
} from "./exhaustionCore.js";

export const REMINDER_RESOLUTION_VERSION = 1;
export const REMINDER_RESOLUTIONS_FIELD = "reminderResolutions";
export const REMINDER_OUTCOMES = Object.freeze({
  PASSED: "passed",
  FAILED: "failed",
  IMMUNE: "immune",
});

const META_KEY = `${ID}/meta`;
const OUTCOME_KEYS = Object.freeze([
  REMINDER_OUTCOMES.PASSED,
  REMINDER_OUTCOMES.FAILED,
  REMINDER_OUTCOMES.IMMUNE,
]);
const ACTION_KINDS = new Set(["condition", "spell", "concentration", "movement"]);
const ACTIONS = new Set([
  "apply",
  "keep",
  "none",
  "remove-instance",
  "remove-name",
  "remove-parent",
  "reconcile-exhaustion",
  "break",
  "break-targets",
  "spend",
]);
const DAMAGE_FACTORS = new Set(["full", "half", "zero"]);
const ABILITIES = Object.freeze({
  str: "str",
  dex: "dex",
  con: "con",
  int: "int",
  wis: "wis",
  cha: "cha",
});
const ABILITY_ALIASES = new Map([
  ["str", "str"], ["strength", "str"], ["for", "str"], ["forza", "str"],
  ["dex", "dex"], ["dexterity", "dex"], ["des", "dex"], ["destrezza", "dex"],
  ["con", "con"], ["constitution", "con"], ["cos", "con"], ["costituzione", "con"],
  ["int", "int"], ["intelligence", "int"], ["intelligenza", "int"],
  ["wis", "wis"], ["wisdom", "wis"], ["sag", "wis"], ["saggezza", "wis"],
  ["cha", "cha"], ["charisma", "cha"], ["car", "cha"], ["carisma", "cha"],
]);

const clone = (value) => {
  if (value === undefined) return undefined;
  if (typeof globalThis.structuredClone === "function") {
    try {
      return globalThis.structuredClone(value);
    } catch {
      // OBR drafts may be Immer proxies; JSON is the persistence contract.
    }
  }
  return JSON.parse(JSON.stringify(value));
};

const text = (value, fallback = "", maxLength = 240) =>
  (String(value || "").trim() || fallback).slice(0, maxLength);

function normalizedAbility(value) {
  const key = String(value || "")
    .trim()
    .toLocaleLowerCase("it")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
  return ABILITIES[ABILITY_ALIASES.get(key)] || "";
}

function optionalDC(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(0, Math.min(99, Math.round(number)))
    : null;
}

function uniqueIds(values = []) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => text(value, "", 200))
      .filter(Boolean),
  ));
}

function normalizedTarget(value, fallbackId = "") {
  const id = text(value?.id || value || fallbackId, "", 200);
  return id ? { id, ...(value?.name ? { name: text(value.name, "Token", 100) } : {}) } : null;
}

function normalizeDamage(value) {
  if (!value || typeof value !== "object") return null;
  const dice = text(value.dice, "", 80);
  const type = text(value.type, "", 80);
  if (!dice || !type) return null;
  const factor = (candidate, fallback) => {
    const normalized = String(candidate || "").trim().toLowerCase();
    return DAMAGE_FACTORS.has(normalized) ? normalized : fallback;
  };
  const onSave = String(value.onSave || "").trim().toLowerCase();
  const additionalPerSlotAbove = Number(value.additionalPerSlotAbove);
  const baseSlot = Number(value.baseSlot);
  return {
    dice,
    type,
    onFailed: factor(value.onFailed || value.onFailure, "full"),
    onPassed: factor(
      value.onPassed || value.onSuccess,
      onSave === "half" ? "half" : "zero",
    ),
    onImmune: factor(value.onImmune, "zero"),
    ...(Number.isInteger(additionalPerSlotAbove) && additionalPerSlotAbove > 0
      ? { additionalPerSlotAbove }
      : {}),
    ...(Number.isInteger(baseSlot) && baseSlot >= 0 ? { baseSlot } : {}),
  };
}

function normalizeHealing(value) {
  if (!value || typeof value !== "object") return null;
  const dice = text(value.dice, "", 80);
  const additionalPerSlotAbove = Number(value.additionalPerSlotAbove);
  const baseSlot = Number(value.baseSlot);
  if (
    !dice
    || !Number.isInteger(additionalPerSlotAbove)
    || additionalPerSlotAbove < 0
    || !Number.isInteger(baseSlot)
    || baseSlot < 0
  ) return null;
  return { dice, additionalPerSlotAbove, baseSlot };
}

function scaledDiceFormula(value, slotLevel = null) {
  const normalized = value && typeof value === "object" ? { ...value } : null;
  if (!normalized) return null;
  const level = Number(slotLevel);
  const baseSlot = Number(normalized.baseSlot);
  const additional = Number(normalized.additionalPerSlotAbove);
  if (
    !Number.isInteger(level)
    || !Number.isInteger(baseSlot)
    || !Number.isInteger(additional)
    || additional <= 0
    || level <= baseSlot
  ) return normalized;
  const extra = (level - baseSlot) * additional;
  const match = String(normalized.dice || "").trim().match(/^(\d+)d(\d+)$/i);
  if (!match) return { ...normalized, slotLevel: level };
  return {
    ...normalized,
    dice: `${Number(match[1]) + extra}d${match[2]}`,
    slotLevel: level,
  };
}

export function scaleReminderResolutionData({
  damage = null,
  healing = null,
  slotLevel = null,
} = {}) {
  return {
    ...(damage ? { damage: scaledDiceFormula(normalizeDamage(damage), slotLevel) } : {}),
    ...(healing ? { healing: scaledDiceFormula(normalizeHealing(healing), slotLevel) } : {}),
    ...(Number.isInteger(Number(slotLevel)) ? { slotLevel: Number(slotLevel) } : {}),
  };
}

function normalizeAction(value) {
  if (!value || typeof value !== "object") return null;
  const kind = text(value.kind, "", 32).toLowerCase();
  const action = text(value.action, "", 40).toLowerCase();
  if (!ACTION_KINDS.has(kind) || !ACTIONS.has(action)) return null;
  const output = { kind, action };
  const target = normalizedTarget(value.targetId || value.target);
  if (target) output.targetId = target.id;
  for (const key of ["instanceId", "name", "parentEffectId", "casterId", "reference"]) {
    const valueText = text(value[key], "", 200);
    if (valueText) output[key] = valueText;
  }
  if (value.options && typeof value.options === "object") {
    output.options = clone(value.options);
  }
  return output;
}

function outcomeMode(value) {
  const mode = text(value, "", 40).toLowerCase();
  if (["remove-effect", "keep-effect", "none"].includes(mode)) return mode;
  return "";
}

function normalizeOutcome(value) {
  const mode = typeof value === "string" ? outcomeMode(value) : "";
  if (mode) return { mode, actions: [] };
  if (!value || typeof value !== "object") return null;
  const actions = (Array.isArray(value.actions) ? value.actions : [])
    .map(normalizeAction)
    .filter(Boolean);
  const objectMode = outcomeMode(value.mode);
  if (!actions.length && !objectMode) return null;
  return {
    ...(objectMode ? { mode: objectMode } : {}),
    actions,
  };
}

function outcomeValue(value, key) {
  if (value?.outcomes && typeof value.outcomes === "object") {
    return value.outcomes[key];
  }
  return value?.[key === REMINDER_OUTCOMES.PASSED
    ? "success"
    : key === REMINDER_OUTCOMES.FAILED
      ? "failure"
      : "immune"];
}

export function normalizeReminderResolution(value, context = {}) {
  if (!value || typeof value !== "object") return null;
  const target = normalizedTarget(value.target, context.targetId);
  const source = normalizedTarget(value.source, context.sourceId);
  const saveSource = value.save && typeof value.save === "object" ? value.save : value;
  const ability = normalizedAbility(saveSource.ability || context.ability);
  const dc = optionalDC(saveSource.dc ?? context.dc);
  const damage = normalizeDamage(value.damage || context.damage);
  const healing = normalizeHealing(value.healing || context.healing);
  const outcomes = {};
  for (const key of OUTCOME_KEYS) {
    const normalized = normalizeOutcome(outcomeValue(value, key));
    if (normalized) outcomes[key] = normalized;
  }
  const activation = value.activation && typeof value.activation === "object"
    ? clone(value.activation)
    : context.activation && typeof context.activation === "object"
      ? clone(context.activation)
      : null;
  const effect = value.effect && typeof value.effect === "object"
    ? clone(value.effect)
    : context.effect && typeof context.effect === "object"
      ? clone(context.effect)
      : null;
  const mode = ["consume", "manual-heal", "manual-damage", "choice"].includes(value.mode)
    ? value.mode
    : "";
  const choiceLabels = value.choiceLabels && typeof value.choiceLabels === "object"
    ? Object.fromEntries(OUTCOME_KEYS
      .map((key) => [key, text(value.choiceLabels[key], "", 80)])
      .filter(([, label]) => label))
    : {};
  const slotLevel = Number(value.slotLevel ?? context.slotLevel);
  if (!ability && dc === null && !damage && !healing && !Object.keys(outcomes).length && !mode) return null;
  return {
    version: REMINDER_RESOLUTION_VERSION,
    ...(mode ? { mode } : {}),
    ...(target ? { target } : {}),
    ...(source ? { source } : {}),
    ...(ability ? { save: { ability, ...(dc !== null ? { dc } : {}) } } : {}),
    ...(damage ? { damage } : {}),
    ...(healing ? { healing } : {}),
    ...(Number.isInteger(slotLevel) && slotLevel >= 0 ? { slotLevel } : {}),
    ...(Object.keys(choiceLabels).length ? { choiceLabels } : {}),
    ...(Object.keys(outcomes).length ? { outcomes } : {}),
    ...(activation ? { activation } : {}),
    ...(effect ? { effect } : {}),
  };
}

function conditionInstances(item) {
  const value = item?.metadata?.[META_KEY]?.conditions;
  if (Array.isArray(value)) return value;
  return Array.isArray(value?.instances) ? value.instances : [];
}

function spellInstances(item) {
  const value = item?.metadata?.[META_KEY]?.[`${ID}/spells`];
  return Array.isArray(value) ? value : [];
}

function concentrationEntries(item) {
  const value = item?.metadata?.[META_KEY]?.[`${ID}/concentration`];
  return value && typeof value === "object" ? value : {};
}

function metadataSnapshot(meta, field) {
  const present = Object.prototype.hasOwnProperty.call(meta || {}, field);
  return present ? { present: true, value: clone(meta[field]) } : { present: false };
}

function effectSaveIsRecognized(instance, reminder) {
  return !!instance?.id && (
    !!reminder?.resolution
    || instance?.manualRemoval === true
    || instance?.endsParentOnRemoval === true
    || !!String(instance?.parentEffectId || "").trim()
    || !!String(instance?.effectId || "").trim()
  );
}

function replaceReminderReference(action, context) {
  const next = { ...action };
  if (next.instanceId === "$reminder") next.instanceId = context.instanceId;
  if (next.targetId === "$target") next.targetId = context.targetId;
  if (next.targetId === "$source") next.targetId = context.sourceId;
  return next;
}

function materializeOutcome(outcome, context, fallbackMode = "none") {
  const normalized = normalizeOutcome(outcome) || { mode: fallbackMode, actions: [] };
  const actions = normalized.actions
    .map((action) => replaceReminderReference(action, context))
    .map((action) => ({
      ...action,
      ...(action.targetId ? {} : { targetId: context.targetId }),
    }));
  if (normalized.mode === "remove-effect") {
    actions.push({
      kind: "condition",
      action: "remove-instance",
      targetId: context.targetId,
      instanceId: context.instanceId,
    });
  }
  return {
    ...(normalized.mode ? { mode: normalized.mode } : {}),
    actions: [...new Map(actions.map((action) => [
      JSON.stringify(action),
      action,
    ])).values()],
  };
}

export function buildEffectSaveReminderResolution({
  item = null,
  instance = null,
  reminder = null,
  dc = null,
  activationId = "",
  turnKey = "",
} = {}) {
  if (!effectSaveIsRecognized(instance, reminder)) return null;
  const targetId = text(item?.id, "", 200);
  const instanceId = text(instance?.id, "", 200);
  if (!targetId || !instanceId) return null;
  const sourceId = text(instance?.sourceId, "", 200);
  const explicit = reminder?.resolution && typeof reminder.resolution === "object"
    ? reminder.resolution
    : {};
  const resolution = normalizeReminderResolution({
    ...explicit,
    ability: explicit.ability || reminder?.ability,
    dc: explicit.dc ?? dc,
    damage: explicit.damage || reminder?.damage,
    success: explicit.success || reminder?.success || "remove-effect",
    failure: explicit.failure || "keep-effect",
    immune: explicit.immune || "remove-effect",
  }, {
    targetId,
    sourceId,
    activation: {
      kind: "effect-save",
      activationId: text(activationId, "", 300),
      turnKey: text(turnKey, "", 300),
    },
    effect: {
      kind: "condition",
      targetId,
      instanceId,
      parentEffectId: text(instance?.parentEffectId, "", 200),
    },
  });
  if (!resolution) return null;
  const context = { targetId, sourceId, instanceId };
  const outcomes = {
    [REMINDER_OUTCOMES.PASSED]: materializeOutcome(
      resolution.outcomes?.[REMINDER_OUTCOMES.PASSED],
      context,
      "remove-effect",
    ),
    [REMINDER_OUTCOMES.FAILED]: materializeOutcome(
      resolution.outcomes?.[REMINDER_OUTCOMES.FAILED],
      context,
      "keep-effect",
    ),
    [REMINDER_OUTCOMES.IMMUNE]: materializeOutcome(
      resolution.outcomes?.[REMINDER_OUTCOMES.IMMUNE],
      context,
      "remove-effect",
    ),
  };
  return {
    ...resolution,
    outcomes,
  };
}

export function buildMovementEscapeReminderResolution({
  targetId = "",
  restrictionInstanceId = "",
  activationId = "",
  turnKey = "",
  costMeters = 1.5,
} = {}) {
  const target = text(targetId, "", 200);
  const restriction = text(restrictionInstanceId, "", 200);
  const activation = text(activationId, "", 300);
  const cost = Number(costMeters);
  if (!target || !restriction || !activation || !Number.isFinite(cost) || cost <= 0) {
    return null;
  }
  return normalizeReminderResolution({
    mode: "choice",
    target: { id: target },
    activation: {
      kind: "movement-escape",
      activationId: activation,
      turnKey: text(turnKey, "", 300),
    },
    choiceLabels: {
      passed: `Spendi ${String(cost).replace(".", ",")} m`,
      failed: "Non ora",
    },
    outcomes: {
      passed: {
        actions: [
          {
            kind: "movement",
            action: "spend",
            targetId: target,
            options: { meters: cost },
          },
          {
            kind: "condition",
            action: "remove-instance",
            targetId: target,
            instanceId: restriction,
          },
        ],
      },
      failed: { actions: [] },
    },
  });
}

export function buildDeferredEffectResolution({
  item = null,
  instance = null,
  deferredEffect = null,
  activationId = "",
  turnKey = "",
} = {}) {
  const targetId = text(item?.id, "", 200);
  const instanceId = text(instance?.id, "", 200);
  if (!targetId || !instanceId || !deferredEffect?.id) return null;
  const save = deferredEffect.save && typeof deferredEffect.save === "object"
    ? clone(deferredEffect.save)
    : null;
  const explicit = deferredEffect.resolution && typeof deferredEffect.resolution === "object"
    ? clone(deferredEffect.resolution)
    : {};
  const resolution = normalizeReminderResolution({
    ...explicit,
    ...(save ? { save } : { mode: "consume" }),
    target: { id: targetId },
    activation: {
      kind: "deferred-effect",
      activationId: text(activationId, "", 300),
      turnKey: text(turnKey, "", 300),
    },
    effect: {
      kind: "condition",
      targetId,
      instanceId,
      removeOnResolve: true,
    },
  });
  if (!resolution) return null;
  const context = { targetId, instanceId };
  if (resolution.mode === "consume") {
    return resolution;
  }
  return {
    ...resolution,
    outcomes: Object.fromEntries(OUTCOME_KEYS.map((outcome) => [
      outcome,
      materializeOutcome(resolution.outcomes?.[outcome], context, "none"),
    ])),
  };
}

function zoneFailureActions({
  failureCondition,
  targetId,
  sourceId,
  sourceName,
  parentEffectId,
  triggerId,
} = {}) {
  const condition = failureCondition && typeof failureCondition === "object"
    ? failureCondition
    : null;
  const name = text(condition?.condition || condition?.name, "", 160);
  if (!name) return [];
  const options = {
    type: "spell",
    sourceId,
    sourceName,
    parentEffectId,
    ...(triggerId ? { effectId: triggerId } : {}),
    expiry: { mode: "manual" },
    ...(condition?.options && typeof condition.options === "object"
      ? clone(condition.options)
      : {}),
  };
  return [{
    kind: "condition",
    action: "apply",
    targetId,
    name,
    options,
  }];
}

export function buildZoneTriggerReminderResolution({
  activation = null,
  targetId = "",
  sourceId = "",
  sourceName = "",
  dc = null,
  metadataKey = "",
  slotLevel = null,
} = {}) {
  if (!["manual-save", "manual-heal", "manual-effect"].includes(activation?.resolution)) {
    return null;
  }
  const normalizedTargetId = text(targetId, "", 200);
  const normalizedSourceId = text(sourceId || activation?.casterId, "", 200);
  const resolutionData = activation?.resolutionData
    && typeof activation.resolutionData === "object"
    ? activation.resolutionData
    : {};
  const scaled = scaleReminderResolutionData({
    damage: activation?.damage || resolutionData.damage,
    healing: activation?.healing || resolutionData.healing,
    slotLevel: slotLevel ?? activation?.slotLevel ?? resolutionData.slotLevel,
  });
  const activationContext = {
    kind: "zone",
    activationId: text(activation?.id, "", 300),
    zoneItemId: text(activation?.zoneItemId, "", 200),
    instanceId: text(activation?.instanceId, "", 200),
    triggerId: text(activation?.triggerId, "", 200),
    turnKey: text(activation?.turnKey, "", 300),
    ...(metadataKey ? { metadataKey } : {}),
  };
  if (activation?.resolution === "manual-heal") {
    if (!normalizedTargetId || !scaled.healing) return null;
    return normalizeReminderResolution({
      mode: "manual-heal",
      healing: scaled.healing,
      slotLevel: scaled.slotLevel,
      target: { id: normalizedTargetId },
      source: { id: normalizedSourceId },
      activation: activationContext,
    });
  }
  if (activation?.resolution === "manual-effect") {
    if (!normalizedTargetId || !scaled.damage) return null;
    return normalizeReminderResolution({
      mode: "manual-damage",
      damage: scaled.damage,
      slotLevel: scaled.slotLevel,
      target: { id: normalizedTargetId },
      source: { id: normalizedSourceId },
      activation: activationContext,
    });
  }
  const ability = normalizedAbility(
    activation?.ability || resolutionData.ability,
  );
  if (!normalizedTargetId || !ability) return null;
  const resolution = normalizeReminderResolution({
    ability,
    dc,
    damage: scaled.damage,
    slotLevel: scaled.slotLevel,
    outcomes: {
      passed: activation?.success && typeof activation.success === "object"
        ? activation.success
        : { actions: [] },
      failed: {
        actions: zoneFailureActions({
          failureCondition: activation?.failureCondition || resolutionData.failureCondition,
          targetId: normalizedTargetId,
          sourceId: normalizedSourceId,
          sourceName,
          parentEffectId: activation?.instanceId,
          triggerId: activation?.triggerId,
        }),
      },
      immune: activation?.immune && typeof activation.immune === "object"
        ? activation.immune
        : { actions: [] },
    },
    targetId: normalizedTargetId,
    sourceId: normalizedSourceId,
    activation: activationContext,
  });
  if (!resolution) return null;
  const context = { targetId: normalizedTargetId, sourceId: normalizedSourceId };
  return {
    ...resolution,
    outcomes: {
      [REMINDER_OUTCOMES.PASSED]: materializeOutcome(
        resolution.outcomes?.[REMINDER_OUTCOMES.PASSED],
        context,
        "none",
      ),
      [REMINDER_OUTCOMES.FAILED]: materializeOutcome(
        resolution.outcomes?.[REMINDER_OUTCOMES.FAILED],
        context,
        "none",
      ),
      [REMINDER_OUTCOMES.IMMUNE]: materializeOutcome(
        resolution.outcomes?.[REMINDER_OUTCOMES.IMMUNE],
        context,
        "none",
      ),
    },
  };
}

export function reminderResolutionDamage(resolution, outcome, roll) {
  const damage = resolution?.damage;
  if (!damage) return { roll: 0, factor: "zero", amount: 0 };
  const normalizedOutcome = String(outcome || "").trim().toLowerCase();
  const factor = resolution?.mode === "manual-damage"
    ? "full"
    : normalizedOutcome === REMINDER_OUTCOMES.FAILED
      ? damage.onFailed
    : normalizedOutcome === REMINDER_OUTCOMES.IMMUNE
      ? damage.onImmune
      : damage.onPassed;
  const numericRoll = Math.max(0, Math.floor(Number(roll) || 0));
  const amount = factor === "full"
    ? numericRoll
    : factor === "half"
      ? Math.floor(numericRoll / 2)
      : 0;
  return { roll: numericRoll, factor, amount };
}

export function reminderResolutionNeedsDamage(resolution) {
  return !!resolution?.damage;
}

export function reminderResolutionControls({ role = "PLAYER", resolution = null } = {}) {
  if (String(role || "").toUpperCase() !== "GM" || !resolution) return [];
  return resolution.mode === "manual-damage"
    ? ["confirmed"]
    : OUTCOME_KEYS;
}

function conditionNameKey(instance) {
  return text(instance?.condition || instance?.name, "", 160)
    .toLocaleLowerCase("it");
}

function findCondition(item, instanceId) {
  const wanted = text(instanceId, "", 200);
  return conditionInstances(item).find((instance) =>
    String(instance?.id || "") === wanted
    && instance?.active !== false,
  ) || null;
}

function actionTargetId(action, targetId) {
  return text(action?.targetId || targetId, "", 200);
}

function sceneTurnKey(sceneMetadata) {
  const state = sceneMetadata?.[`${ID}/state`];
  const order = Array.isArray(state?.order) ? state.order : [];
  const current = Math.max(0, Math.min(
    order.length - 1,
    Math.floor(Number(state?.current) || 0),
  ));
  const actorId = String(order[current] || "").trim();
  return actorId
    ? [Math.max(1, Math.floor(Number(state?.round) || 1)), current, actorId].join(":")
    : "";
}

function spellByInstance(item, instanceId) {
  const wanted = text(instanceId, "", 200);
  return spellInstances(item).find((spell) =>
    String(spell?.instanceId || "") === wanted,
  ) || null;
}

function normalizedMarkerMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return clone(value);
}

function outcomeActions(resolution, outcome) {
  const value = resolution?.outcomes?.[outcome];
  return Array.isArray(value?.actions) ? value.actions : [];
}

function actionOperations({ action, targetId, itemsById, sceneMetadata = null }) {
  const resolvedTargetId = actionTargetId(action, targetId);
  const targetItem = itemsById.get(resolvedTargetId);
  if (!resolvedTargetId || !targetItem) {
    return { error: "Il bersaglio del reminder non esiste più." };
  }
  const kind = text(action?.kind, "", 32).toLowerCase();
  const type = text(action?.action, "", 40).toLowerCase();
  if (type === "none" || type === "keep") return { operations: [] };
  if (kind === "movement" && type === "spend") {
    const meters = Number(action?.options?.meters ?? action?.meters);
    if (!Number.isFinite(meters) || meters <= 0) {
      return { error: "Il reminder non indica un costo di movimento valido." };
    }
    const meta = targetItem?.metadata?.[META_KEY] || {};
    const payload = meta.speedCheckMovement && typeof meta.speedCheckMovement === "object"
      ? meta.speedCheckMovement
      : null;
    const currentTurnKey = sceneTurnKey(sceneMetadata);
    const sameTurn = payload?.turnKey
      && currentTurnKey
      && String(payload.turnKey) === currentTurnKey
      && String(currentTurnKey.split(":").slice(2).join(":"))
        .replace(/::p\d+$/u, "") === resolvedTargetId;
    if (!sameTurn || !Number.isFinite(Number(payload?.totalMeters))) {
      // Se lo Speed Tracker non sta seguendo questo attore, il pulsante
      // resta comunque una conferma manuale del costo RAW.
      return { operations: [] };
    }
    return {
      operations: [],
      metadataPatches: [{
        id: resolvedTargetId,
        fields: {
          speedCheckMovement: {
            expected: { present: true, value: clone(payload) },
            value: {
              ...clone(payload),
              totalMeters: Math.round((Number(payload.totalMeters) + meters) * 1000) / 1000,
            },
          },
        },
      }],
    };
  }
  if (kind === "condition" && type === "remove-instance") {
    const instanceId = text(action?.instanceId, "", 200);
    if (!findCondition(targetItem, instanceId)) {
      return { error: "La condizione del reminder non è più attiva." };
    }
    return {
      operations: [{
        type: "condition:remove-instances",
        removals: [{ itemId: resolvedTargetId, instanceId }],
      }],
    };
  }
  if (kind === "condition" && type === "apply") {
    const name = text(action?.name || action?.conditionName, "", 160);
    if (!name) return { error: "Il reminder non descrive la condizione da applicare." };
    const options = action?.options && typeof action.options === "object"
      ? clone(action.options)
      : {};
    return {
      operations: [
        {
          type: "condition:add",
          targetIds: [resolvedTargetId],
          conditionName: name,
          options,
        },
        { type: "condition:automate", subjectIds: [resolvedTargetId] },
      ],
    };
  }
  if (kind === "condition" && type === "reconcile-exhaustion") {
    const options = action?.options && typeof action.options === "object"
      ? action.options
      : {};
    const currentLevel = exhaustionLevelFromInstances(conditionInstances(targetItem));
    const requestedLevel = options.level === undefined
      ? currentLevel + (Number(options.delta) || 1)
      : Number(options.level);
    return {
      operations: [{
        type: "condition:reconcile-exhaustion",
        targetIds: [resolvedTargetId],
        level: normalizeExhaustionLevel(requestedLevel),
      }],
    };
  }
  if (kind === "condition" && type === "remove-name") {
    const name = text(action?.name || action?.conditionName, "", 160);
    if (!name || !conditionInstances(targetItem).some((entry) => conditionNameKey(entry) === name.toLocaleLowerCase("it"))) {
      return { error: "La condizione del reminder non è più attiva." };
    }
    return {
      operations: [{ type: "condition:remove-name", targetIds: [resolvedTargetId], conditionName: name }],
    };
  }
  if (kind === "condition" && type === "remove-parent") {
    const parentEffectId = text(action?.parentEffectId, "", 200);
    if (!parentEffectId) return { error: "Il reminder non indica l'effetto da terminare." };
    const hasParent = conditionInstances(targetItem).some((entry) =>
      String(entry?.parentEffectId || "") === parentEffectId,
    );
    if (!hasParent) return { error: "L'effetto del reminder non è più attivo." };
    return {
      operations: [{
        type: "condition:remove-parent-effects",
        removals: [{ itemId: resolvedTargetId, parentEffectId }],
        conditionTypes: ["spell"],
      }],
    };
  }
  if (kind === "spell" && type === "remove-instance") {
    const instanceId = text(action?.instanceId, "", 200);
    const spell = spellByInstance(targetItem, instanceId);
    if (!spell) return { error: "L'istanza spell del reminder non è più attiva." };
    const operations = [];
    const casterId = text(action?.casterId || spell?.casterId, "", 200);
    if (spell?.conc === true && casterId) {
      operations.push({
        type: "concentration:break-targets",
        casterIds: [casterId],
        reference: instanceId,
        targetIds: [resolvedTargetId],
      });
    }
    operations.push({
      type: "spell:remove-instance",
      targetIds: [resolvedTargetId],
      instanceId,
    });
    return { operations };
  }
  if (kind === "concentration" && type === "break") {
    const sourceId = text(action?.casterId || action?.targetId, "", 200);
    const reference = text(action?.reference || action?.instanceId || action?.name, "", 200);
    const entries = concentrationEntries(itemsById.get(sourceId));
    const matchedEntry = Object.entries(entries).find(([key, entry]) =>
      key.toLocaleLowerCase("it") === reference.toLocaleLowerCase("it")
      || String(entry?.instanceId || "") === reference,
    )?.[1];
    if (!sourceId || !matchedEntry) {
      return { error: "La concentrazione del reminder non è più attiva." };
    }
    const instanceId = text(matchedEntry?.instanceId, "", 200);
    return {
      operations: [{
        type: "concentration:break",
        casterIds: [sourceId],
        reference: reference || null,
      }],
      sideEffects: instanceId ? [{
        type: "static-zone:remove-ended",
        selectors: [{ instanceId }],
      }] : [],
    };
  }
  if (kind === "concentration" && type === "break-targets") {
    const sourceId = text(action?.casterId, "", 200);
    const reference = text(action?.reference || action?.instanceId || action?.name, "", 200);
    if (!sourceId || !reference) return { error: "Il reminder non indica la concentrazione da terminare." };
    return {
      operations: [{
        type: "concentration:break-targets",
        casterIds: [sourceId],
        reference,
        targetIds: [resolvedTargetId],
      }],
    };
  }
  return { error: "Il reminder contiene un'azione non supportata." };
}

function activationMetadata(root, metadataKey, activationId, targetId) {
  const metadata = root?.metadata?.[metadataKey];
  const pending = Array.isArray(metadata?.triggerRuntime?.pending)
    ? metadata.triggerRuntime.pending
    : [];
  const activation = pending.find((entry) => String(entry?.id || "") === activationId);
  if (!metadata || !activation || !uniqueIds(activation.targetIds).includes(targetId)) return null;
  return { metadata, activation };
}

export function buildReminderResolutionPlan({
  notice = null,
  items = [],
  outcome = "",
  damageRoll = 0,
  sceneMetadata = null,
  now = Date.now(),
} = {}) {
  const resolution = normalizeReminderResolution(notice?.resolution);
  const normalizedOutcome = String(outcome || "").trim().toLowerCase();
  const consumeOnly = resolution?.mode === "consume";
  const manualHeal = resolution?.mode === "manual-heal";
  const manualDamage = resolution?.mode === "manual-damage";
  const validOutcome = manualHeal
    ? ["apply", "ignore"].includes(normalizedOutcome)
    : manualDamage
      ? normalizedOutcome === "confirmed"
      : consumeOnly || OUTCOME_KEYS.includes(normalizedOutcome);
  if (!resolution || !validOutcome) {
    return { status: "informational", message: "Questo reminder è solo informativo." };
  }
  const noticeTargetIds = uniqueIds((notice?.targets || []).map((target) => target?.id));
  if (noticeTargetIds.length > 1) {
    return { status: "unsupported", message: "La risoluzione aggregata di più bersagli non è disponibile." };
  }
  const targetIds = uniqueIds(
    resolution.target?.id
      ? [resolution.target.id]
      : noticeTargetIds,
  );
  if (targetIds.length !== 1) {
    return { status: "unsupported", message: "La risoluzione aggregata di più bersagli non è disponibile." };
  }
  if (noticeTargetIds.length === 1 && noticeTargetIds[0] !== targetIds[0]) {
    return { status: "stale", message: "Il bersaglio del reminder è cambiato." };
  }
  const targetId = targetIds[0];
  const activationId = text(
    resolution.activation?.activationId || notice?.activationId,
    "",
    300,
  );
  if (!activationId) return { status: "unsupported", message: "Il reminder non ha un identificativo risolvibile." };
  const itemsById = new Map((Array.isArray(items) ? items : []).map((item) => [String(item?.id || ""), item]));
  const target = itemsById.get(targetId);
  if (!target) return { status: "stale", message: "Il bersaglio del reminder non esiste più." };
  const meta = target?.metadata?.[META_KEY] || {};
  const markerMap = normalizedMarkerMap(meta[REMINDER_RESOLUTIONS_FIELD]);
  if (Object.prototype.hasOwnProperty.call(markerMap, activationId)) {
    return { status: "already-resolved", message: "Questo reminder è già stato risolto." };
  }

  const sourceId = text(resolution.source?.id, "", 200);
  if (sourceId && !itemsById.has(sourceId)) {
    return { status: "stale", message: "La sorgente dell'effetto non esiste più." };
  }

  const activationKind = text(resolution.activation?.kind, "", 40);
  let zoneSideEffect = null;
  if (activationKind === "zone") {
    const zoneItemId = text(resolution.activation?.zoneItemId, "", 200);
    const metadataKey = text(resolution.activation?.metadataKey, "", 200);
    const root = itemsById.get(zoneItemId);
    const currentActivation = activationMetadata(root, metadataKey, activationId, targetId);
    if (!root || !currentActivation) {
      return { status: "stale", message: "L'attivazione della zona non è più disponibile." };
    }
    zoneSideEffect = {
      type: "reminder:consume-zone-activation",
      itemId: zoneItemId,
      metadataKey,
      activationId,
      targetId,
    };
  }

  const effectInstanceId = text(resolution.effect?.instanceId, "", 200);
  if ((activationKind === "effect-save" || activationKind === "deferred-effect") && effectInstanceId) {
    const instance = findCondition(target, effectInstanceId);
    if (!instance) return { status: "stale", message: "L'effetto del reminder non è più attivo." };
    if (sourceId && String(instance.sourceId || "") !== sourceId) {
      return { status: "stale", message: "La sorgente dell'effetto è cambiata." };
    }
  }

  const normalizedDamageRoll = resolution.damage
    ? (damageRoll === "" || damageRoll === null || damageRoll === undefined
      ? null
      : Number(damageRoll))
    : 0;
  if (
    resolution.damage
    && (normalizedDamageRoll === null
      || !Number.isFinite(normalizedDamageRoll)
      || normalizedDamageRoll < 0)
  ) {
    return { status: "invalid", message: "Inserisci un risultato dei dadi valido." };
  }
  const damage = reminderResolutionDamage(
    resolution,
    normalizedOutcome,
    normalizedDamageRoll,
  );
  const healingRoll = resolution.healing && normalizedOutcome === "apply"
    ? (damageRoll === "" || damageRoll === null || damageRoll === undefined
      ? null
      : Number(damageRoll))
    : 0;
  if (
    manualHeal
    && normalizedOutcome === "apply"
    && (healingRoll === null || !Number.isFinite(healingRoll) || healingRoll < 0)
  ) {
    return { status: "invalid", message: "Inserisci un risultato dei dadi valido." };
  }
  const hpBefore = Number(meta.hp);
  const hpMax = Number(meta.hpMax);
  const creatureType = String(
    meta.creatureType || meta.creatureTypeName || meta.creatureTypeLabel || "",
  ).trim().toLocaleLowerCase("it");
  if (manualHeal && normalizedOutcome === "apply" && /costrutt|non.?morto/u.test(creatureType)) {
    return { status: "unsupported", message: "Costrutti e Non Morti non possono recuperare PF." };
  }
  const healing = manualHeal && normalizedOutcome === "apply"
    ? {
      roll: Math.max(0, Math.floor(Number(healingRoll) || 0)),
      amount: Math.max(
        0,
        Math.min(
          Number.isFinite(hpMax) ? Math.floor(hpMax) : 0,
          Number.isFinite(hpBefore) ? Math.floor(hpBefore) + Math.floor(Number(healingRoll) || 0) : 0,
        ) - (Number.isFinite(hpBefore) ? Math.floor(hpBefore) : 0),
      ),
    }
    : { roll: 0, amount: 0 };
  const hasDamage = damage.amount > 0;
  const hasHealing = healing.amount > 0;
  if ((hasDamage || (manualHeal && normalizedOutcome === "apply")) && (
    !Object.prototype.hasOwnProperty.call(meta, "hp")
    || !Object.prototype.hasOwnProperty.call(meta, "hpMax")
    || !Number.isFinite(hpBefore)
    || !Number.isFinite(hpMax)
    || hpMax <= 0
  )) {
    return { status: "unsupported", message: "Il bersaglio non ha HP canonici configurati." };
  }
  const hpChange = hasDamage
    ? {
      before: Math.max(0, Math.floor(hpBefore)),
      after: Math.max(0, Math.floor(hpBefore) - damage.amount),
      hpMax: Math.max(0, Math.floor(hpMax)),
    }
    : hasHealing
      ? {
        before: Math.max(0, Math.floor(hpBefore)),
        after: Math.min(Math.max(0, Math.floor(hpMax)), Math.max(0, Math.floor(hpBefore) + healing.amount)),
        hpMax: Math.max(0, Math.floor(hpMax)),
      }
      : null;

  const operations = [];
  const actionSideEffects = [];
  const actionMetadataPatches = [];
  for (const action of outcomeActions(resolution, normalizedOutcome)) {
    const result = actionOperations({ action, targetId, itemsById, sceneMetadata });
    if (result.error) return { status: "stale", message: result.error };
    operations.push(...result.operations);
    actionSideEffects.push(...(result.sideEffects || []));
    actionMetadataPatches.push(...(result.metadataPatches || []));
  }

  if (
    activationKind === "deferred-effect"
    && effectInstanceId
    && resolution.effect?.removeOnResolve !== false
    && !operations.some((operation) => operation.type === "condition:remove-instances"
      && operation.removals?.some((removal) => removal.instanceId === effectInstanceId))
  ) {
    operations.push({
      type: "condition:remove-instances",
      removals: [{ itemId: targetId, instanceId: effectInstanceId }],
    });
  }

  if (hpChange && !manualHeal) {
    const zeroAction = resolveZeroHPUnconsciousAction(
      { ...meta, hp: hpChange.after, hpMax: hpChange.hpMax },
      conditionInstances(target),
    );
    if (zeroAction.add) {
      operations.push({
        type: "condition:add",
        targetIds: [targetId],
        conditionName: "Privo di sensi",
        options: { type: "zero-hp-unconscious", expiry: { mode: "manual" } },
      });
      operations.push({ type: "condition:automate", subjectIds: [targetId] });
    }
    if (zeroAction.removeInstanceIds?.length) {
      operations.push({
        type: "condition:remove-instances",
        removals: zeroAction.removeInstanceIds.map((instanceId) => ({
          itemId: targetId,
          instanceId,
        })),
      });
    }
  }

  const nextMarkers = {
    ...markerMap,
    [activationId]: {
      version: REMINDER_RESOLUTION_VERSION,
      outcome: normalizedOutcome,
      ...(damage.amount ? { damage: damage.amount } : {}),
      ...(healing.amount ? { healing: healing.amount } : {}),
      resolvedAt: Math.max(0, Math.floor(Number(now) || Date.now())),
    },
  };
  const markerEntries = Object.entries(nextMarkers);
  const boundedMarkers = Object.fromEntries(markerEntries.slice(-128));
  const metadataFields = {
    [REMINDER_RESOLUTIONS_FIELD]: {
      expected: metadataSnapshot(meta, REMINDER_RESOLUTIONS_FIELD),
      value: boundedMarkers,
    },
  };
  if (hpChange) {
    metadataFields.hp = {
      expected: metadataSnapshot(meta, "hp"),
      value: hpChange.after,
    };
    metadataFields.hpMax = {
      expected: metadataSnapshot(meta, "hpMax"),
      value: hpChange.hpMax,
    };
  }
  const commandTargetIds = uniqueIds([
    targetId,
    sourceId,
    zoneSideEffect?.itemId,
    ...operations.flatMap((operation) => operation.targetIds || []),
  ]);
  return {
    status: "ready",
    outcome: normalizedOutcome,
    ...(consumeOnly ? { resolutionMode: "consume" } : {}),
    ...(manualHeal ? { resolutionMode: "manual-heal" } : {}),
    ...(manualDamage ? { resolutionMode: "manual-damage" } : {}),
    targetId,
    sourceId,
    activationId,
    damage,
    healing,
    hpChange,
    operations,
    metadataPatches: [
      { id: targetId, fields: metadataFields },
      ...actionMetadataPatches,
    ],
    sideEffects: [
      ...(zoneSideEffect ? [zoneSideEffect] : []),
      ...actionSideEffects,
    ],
    targetIds: commandTargetIds,
    sceneMetadataPreconditions: sceneMetadata && Object.prototype.hasOwnProperty.call(sceneMetadata, `${ID}/state`)
      ? [{ key: `${ID}/state`, value: clone(sceneMetadata[`${ID}/state`]) }]
      : [],
    message: "Reminder risolto.",
  };
}

export function reminderResolutionMetadataKey() {
  return META_KEY;
}
