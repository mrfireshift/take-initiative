// src/conditions.js
import OBR, { buildLabel } from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { effectsDiagnostics } from "./effectsDiagnostics.js";
import { conditionLabelNeedsUpdate } from "./effectsReconcilerCore.js";
import {
  EXHAUSTION_CONDITION,
  exhaustionContributionLevelFromInstances,
  exhaustionLevelFromInstances,
  normalizeExhaustionLevel,
  reconcileExhaustionInstances,
} from "./exhaustionCore.js";
import {
  getConditionEntryAdditions,
  getEffectiveConditionInstances as resolveEffectiveConditionInstances,
} from "./conditionRulesCore.js";
import { preserveConditionTimingMetadata } from "./conditionTimingCore.js";
import { compactSpellEffectLabel } from "./effectLabelCore.js";
import { normalizeEffectSaveReminders } from "./effectSaveReminderCore.js";
import {
  CLASS_FEATURE_MAX_VISIBLE_DURATION_ROUNDS,
  classFeatureConditionResourceDie,
} from "./classFeatureCore.js";

const META_KEY = `${ID}/meta`;
const COND_LABEL_META = `${ID}/condLabel`;
const COND_WIDGET_META = `${ID}/condWidgetOf`; // = <tokenId>, usato sia su SHAPE che TEXT

// === Catalogo condizioni predefinite (ordine UI)
export const CONDITION_LIST = [
  "Accecato",
  "Affascinato",
  "Afferrato",
  "Assordato",
  "Avvelenato",
  "Incapacitato",
  "Invisibile",
  "Paralizzato",
  "Pietrificato",
  "Privo di sensi",
  "Prono",
  "Spaventato",
  "Stordito",
  "Trattenuto",
  "Indebolimento",
  "Ira",
];

// Indebolimento si gestisce dalla scheda iniziativa: resta nel catalogo per
// ordinamento e riconoscimento, ma non viene proposto come condizione generica.
export const APPLICABLE_CONDITION_LIST = CONDITION_LIST.filter(
  (name) => name !== EXHAUSTION_CONDITION
);


export const CONDITION_EMOJI = Object.freeze({
  "Accecato": "👁️",
  "Affascinato": "💖",
  "Afferrato": "✊",
  "Assordato": "🔇",
  "Avvelenato": "☠️",
  "Incapacitato": "💫",
  "Invisibile": "🫥",
  "Paralizzato": "⚡",
  "Pietrificato": "🪨",
  "Privo di sensi": "💤",
  "Prono": "⬇️",
  "Spaventato": "😨",
  "Stordito": "💥",
  "Trattenuto": "⛓️",
  "Indebolimento": "🩸",
  "Ira": "🔥",
  "Santuario del Crepuscolo": "🌙",
});

export function formatConditionName(name, preferredEmoji = "") {
  const clean = String(name || "").trim();
  const emoji = String(preferredEmoji || CONDITION_EMOJI[clean] || "").trim();
  return emoji ? `${emoji} ${clean}` : clean;
}
const MAX_CUSTOM_SLOTS = 3;
const CONDITION_SCHEMA_VERSION = 2;
let __conditionIdSequence = 0;

export const CONDITION_EXPIRY_MODES = Object.freeze([
  "manual",
  "rounds",
  "turn-start",
  "turn-end",
  "concentration",
]);

const __CONDITION_EXPIRY_MODE_SET = new Set(CONDITION_EXPIRY_MODES);

function __durationFrom(value) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function __conditionActive(value) {
  if (value && typeof value === "object") return value.active !== false;
  return !!value;
}

function __conditionName(value) {
  if (value && typeof value === "object") {
    return String(value.condition || value.name || "").trim();
  }
  return String(value || "").trim();
}

function __normalizeAppliedAt(value) {
  if (!value || typeof value !== "object") return null;
  const out = {};
  const round = Math.max(1, Math.floor(Number(value.round || 1)));
  if (Number.isFinite(round)) out.round = round;
  if (value.actorId) out.actorId = String(value.actorId);
  if (value.phase) out.phase = String(value.phase);
  if (value.turnKey) out.turnKey = String(value.turnKey);
  return Object.keys(out).length ? out : null;
}

function __normalizeExpiry(value, legacyTurns = null, legacyTiming = "rounds") {
  const raw = value && typeof value === "object" ? value : {};
  let mode = String(raw.mode || raw.kind || (legacyTurns ? legacyTiming : "manual")).trim().toLowerCase();
  if (mode === "round") mode = "rounds";
  if (!__CONDITION_EXPIRY_MODE_SET.has(mode)) mode = legacyTurns ? "rounds" : "manual";

  const out = { mode };
  if (mode === "rounds" || mode === "turn-start" || mode === "turn-end") {
    out.remaining = __durationFrom(raw.remaining ?? raw.turns ?? legacyTurns) || 1;
  }

  const actor = String(raw.actor || "").trim().toLowerCase();
  if (actor === "source" || actor === "target") out.actor = actor;
  if (raw.actorId) out.actorId = String(raw.actorId);
  if (raw.actorName) out.actorName = String(raw.actorName);
  return out;
}

function __normalizeActivation(value, sourceId = "", targetId = "") {
  if (!value || typeof value !== "object") return null;
  const activation = __normalizeExpiry(value);
  if (activation.mode !== "turn-start" && activation.mode !== "turn-end") return null;
  activation.actor = activation.actor === "source" ? "source" : "target";
  if (!activation.actorId) {
    activation.actorId = activation.actor === "source"
      ? String(sourceId || "")
      : String(targetId || "");
  }
  if (value.anchor === "next-turn") activation.anchor = "next-turn";
  return activation;
}

function __normalizeConditionInstance(value, fallbackId) {
  if (!value || typeof value !== "object") return null;
  const activation = __normalizeActivation(value.activation, value.sourceId, value.targetId);
  if (value.active === false && !activation) return null;
  const condition = __conditionName(value);
  if (!condition) return null;

  const instance = {
    id: String(value.id || fallbackId || ""),
    condition,
    active: value.active !== false,
    expiry: __normalizeExpiry(
      value.expiry,
      __durationFrom(value.turns),
      value.durationBy || value.timing || "rounds"
    ),
  };

  if (!instance.id) return null;
  if (value.sourceId) instance.sourceId = String(value.sourceId);
  if (value.sourceName) instance.sourceName = String(value.sourceName);
  if (value.targetId) instance.targetId = String(value.targetId);
  if (activation) instance.activation = activation;
  if (value.parentEffectId) instance.parentEffectId = String(value.parentEffectId);
  if (value.parentFeatureId) instance.parentFeatureId = String(value.parentFeatureId);
  if (value.parentInstanceId) instance.parentInstanceId = String(value.parentInstanceId);
  if (value.type) instance.type = String(value.type);
  if (value.effectId) instance.effectId = String(value.effectId);
  if (value.effectKind === "buff" || value.effectKind === "debuff") {
    instance.effectKind = value.effectKind;
  }
  if (value.resourceDie) instance.resourceDie = String(value.resourceDie).trim();
  if (value.effectDetail) instance.effectDetail = String(value.effectDetail);
  if (value.theme && typeof value.theme === "object") {
    instance.theme = { ...value.theme };
  }
  if (value.mechanics && typeof value.mechanics === "object") {
    instance.mechanics = { ...value.mechanics };
  }
  if (value.manualRemoval === true) instance.manualRemoval = true;
  if (value.mapVisible === false) instance.mapVisible = false;
  if (value.parentRemoval === "target" || value.parentRemoval === "spell") {
    instance.parentRemoval = value.parentRemoval;
  }
  if (value.parentEndCondition && typeof value.parentEndCondition === "object") {
    instance.parentEndCondition = { ...value.parentEndCondition };
  }
  if (value.exhaustionContribution === true) instance.exhaustionContribution = true;
  if (condition === EXHAUSTION_CONDITION) {
    instance.level = value.level === undefined || value.level === null || value.level === ""
      ? 1
      : Math.max(1, normalizeExhaustionLevel(value.level));
  }
  const appliedAt = __normalizeAppliedAt(value.appliedAt);
  if (appliedAt) instance.appliedAt = appliedAt;
  const createdAt = Number(value.createdAt);
  if (Number.isFinite(createdAt) && createdAt > 0) instance.createdAt = createdAt;
  if (value.legacy === true) instance.legacy = true;
  return preserveConditionTimingMetadata(instance, value);
}

function __legacyInstance(name, value, id) {
  if (!__conditionActive(value)) return null;
  const raw = value && typeof value === "object" ? value : {};
  return __normalizeConditionInstance({
    ...raw,
    id,
    condition: name,
    active: true,
    legacy: true,
  }, id);
}

function __allConditionInstances(cond = {}) {
  const src = cond && typeof cond === "object" ? cond : {};
  const out = [];
  const seen = new Set();

  const push = (instance) => {
    if (!instance || seen.has(instance.id)) return;
    seen.add(instance.id);
    out.push(instance);
  };

  const stored = Array.isArray(src.instances) ? src.instances : [];
  stored.forEach((value, index) => {
    push(__normalizeConditionInstance(value, `instance:${index}`));
  });

  const flags = src.flags && typeof src.flags === "object" ? src.flags : {};
  for (const [name, value] of Object.entries(flags)) {
    push(__legacyInstance(name, value, `legacy:flag:${encodeURIComponent(name)}`));
  }

  const custom = Array.isArray(src.custom) ? src.custom.filter(Boolean) : [];
  custom.forEach((value, index) => {
    const name = __conditionName(value);
    if (!name) return;
    push(__legacyInstance(name, value, `legacy:custom:${index}:${encodeURIComponent(name)}`));
  });

  return out;
}

function __cloneConditionInstance(instance) {
  return {
    ...instance,
    expiry: { ...(instance.expiry || { mode: "manual" }) },
    ...(instance.activation ? { activation: { ...instance.activation } } : {}),
    ...(instance.theme ? { theme: { ...instance.theme } } : {}),
    ...(instance.parentEndCondition
      ? { parentEndCondition: { ...instance.parentEndCondition } }
      : {}),
    ...(instance.appliedAt ? { appliedAt: { ...instance.appliedAt } } : {}),
  };
}

export function getConditionInstances(cond = {}) {
  return __allConditionInstances(cond).map(__cloneConditionInstance);
}

export function getEffectiveConditionInstances(cond = {}) {
  return resolveEffectiveConditionInstances(__allConditionInstances(cond));
}

function __persistableConditionInstance(instance) {
  const next = __cloneConditionInstance(instance);
  delete next.legacy;
  return next;
}

function __conditionsForWrite(cond = {}) {
  return {
    version: CONDITION_SCHEMA_VERSION,
    instances: __allConditionInstances(cond).map(__persistableConditionInstance),
  };
}

function __normalizeConditions(cond = {}) {
  const src = cond && typeof cond === "object" ? cond : {};
  return {
    version: Number(src.version) || 1,
    flags: src.flags && typeof src.flags === "object" ? { ...src.flags } : {},
    custom: Array.isArray(src.custom) ? src.custom.filter(Boolean).slice(0, MAX_CUSTOM_SLOTS) : [],
    instances: __allConditionInstances(src),
  };
}

function __newConditionInstanceId() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {}
  __conditionIdSequence += 1;
  return `condition:${Date.now().toString(36)}:${__conditionIdSequence.toString(36)}`;
}

function __buildConditionInstance(conditionName, opts = {}, targetId = "") {
  const condition = String(conditionName || "").trim();
  if (!condition) return null;

  const sourceId = String(opts.sourceId || "").trim();
  const expiry = __normalizeExpiry(
    opts.expiry,
    __durationFrom(opts.turns),
    opts.durationBy || opts.timing || "rounds"
  );

  if (expiry.mode === "turn-start" || expiry.mode === "turn-end") {
    expiry.actor = expiry.actor === "source" ? "source" : "target";
    if (!expiry.actorId) {
      expiry.actorId = expiry.actor === "source" ? sourceId : String(targetId || "");
    }
  }

  const instance = {
    id: __newConditionInstanceId(),
    condition,
    active: true,
    targetId: String(targetId || ""),
    expiry,
    createdAt: Date.now(),
  };

  if (sourceId) instance.sourceId = sourceId;
  if (opts.sourceName) instance.sourceName = String(opts.sourceName);
  if (opts.parentEffectId) instance.parentEffectId = String(opts.parentEffectId);
  if (opts.type || opts.effectType) instance.type = String(opts.type || opts.effectType);
  if (opts.effectId) instance.effectId = String(opts.effectId);
  if (opts.effectKind === "buff" || opts.effectKind === "debuff") {
    instance.effectKind = opts.effectKind;
  }
  if (opts.effectDetail) instance.effectDetail = String(opts.effectDetail);
  if (opts.theme && typeof opts.theme === "object") {
    instance.theme = { ...opts.theme };
  }
  const saveReminders = normalizeEffectSaveReminders(opts.saveReminder);
  if (saveReminders.length) {
    instance.saveReminder = saveReminders.length === 1
      ? saveReminders[0]
      : saveReminders;
  }
  if (opts.mechanics && typeof opts.mechanics === "object") {
    instance.mechanics = { ...opts.mechanics };
  }
  if (opts.manualRemoval === true) instance.manualRemoval = true;
  if (opts.parentRemoval === "target" || opts.parentRemoval === "spell") {
    instance.parentRemoval = opts.parentRemoval;
  }
  if (opts.exhaustionContribution === true) instance.exhaustionContribution = true;
  if (condition === EXHAUSTION_CONDITION) {
    instance.level = Math.max(1, normalizeExhaustionLevel(opts.level || 1));
  }
  const appliedAt = __normalizeAppliedAt(opts.appliedAt);
  if (appliedAt) instance.appliedAt = appliedAt;
  return instance;
}

function __compactExpiryLabel(instance) {
  if (__conditionName(instance) === EXHAUSTION_CONDITION) {
    return ` ${Math.max(1, normalizeExhaustionLevel(instance?.level || 1))}`;
  }
  const resourceDie = String(instance?.resourceDie || "").trim();
  if (resourceDie) return ` (${resourceDie})`;
  const expiry = instance?.expiry || { mode: "manual" };
  const remaining = __durationFrom(expiry.remaining);
  if (expiry.mode === "rounds") {
    return remaining && remaining <= CLASS_FEATURE_MAX_VISIBLE_DURATION_ROUNDS
      ? ` (${remaining})`
      : "";
  }
  if (expiry.mode === "turn-start") {
    const visibleRemaining = remaining && remaining <= CLASS_FEATURE_MAX_VISIBLE_DURATION_ROUNDS
      ? remaining
      : null;
    return ` (I${visibleRemaining && visibleRemaining > 1 ? `:${visibleRemaining}` : ""})`;
  }
  if (expiry.mode === "turn-end") {
    const visibleRemaining = remaining && remaining <= CLASS_FEATURE_MAX_VISIBLE_DURATION_ROUNDS
      ? remaining
      : null;
    return ` (F${visibleRemaining && visibleRemaining > 1 ? `:${visibleRemaining}` : ""})`;
  }
  if (expiry.mode === "concentration") return " (C)";
  return "";
}

function __conditionDisplayData(cond, characterBuild = [], characterBuildBySourceId = null) {
  const source = cond && typeof cond === "object" ? cond : {};
  if (!Array.isArray(source.instances)) return source;
  return {
    ...source,
    instances: source.instances.map((instance) => {
      if (!instance || typeof instance !== "object" || instance.resourceDie) return instance;
      const sourceBuild = characterBuildBySourceId?.get?.(String(instance.sourceId || "").trim())
        || characterBuild;
      if (!Array.isArray(sourceBuild) || !sourceBuild.length) return instance;
      const resourceDie = classFeatureConditionResourceDie(instance, sourceBuild);
      return resourceDie ? { ...instance, resourceDie } : instance;
    }),
  };
}

function __fullExpiryLabel(instance) {
  const expiry = instance?.expiry || { mode: "manual" };
  const remaining = __durationFrom(expiry.remaining) || 1;
  const actor = String(expiry.actorName || "").trim()
    || (expiry.actor === "source" ? "fonte" : "bersaglio");
  if (expiry.mode === "rounds") return `${remaining} round`;
  if (expiry.mode === "turn-start") {
    return `inizio turno ${actor}${remaining > 1 ? ` (tra ${remaining})` : ""}`;
  }
  if (expiry.mode === "turn-end") {
    return `fine turno ${actor}${remaining > 1 ? ` (tra ${remaining})` : ""}`;
  }
  if (expiry.mode === "concentration") return "concentrazione";
  return "manuale";
}

export function formatConditionInstance(instance) {
  const name = __conditionName(instance);
  if (!name) return "";
  const conditionLabel = name === EXHAUSTION_CONDITION
    ? `${formatConditionName(name, instance?.theme?.emoji)} ${Math.max(1, normalizeExhaustionLevel(instance?.level || 1))}`
    : formatConditionName(name, instance?.theme?.emoji);
  const parts = [conditionLabel];
  if (instance?.sourceName) {
    parts.push(`fonte: ${instance.sourceName}`);
  }
  if (instance?.effectDetail) parts.push(String(instance.effectDetail));
  parts.push(__fullExpiryLabel(instance));
  return parts.join(" | ");
}

function __withConditionEntryConsequences(previousInstances, nextInstances, targetId) {
  const next = [...nextInstances];
  for (const addition of getConditionEntryAdditions(previousInstances, next)) {
    const trigger = addition.triggeredBy || {};
    const instance = __buildConditionInstance(addition.condition, {
      type: "automatic",
      appliedAt: trigger.appliedAt,
      expiry: { mode: "manual" },
    }, targetId);
    if (instance) next.push(instance);
  }
  return next;
}
function __groupConditionInstances(cond = {}) {
  const groups = new Map();
  for (const instance of getEffectiveConditionInstances(cond)) {
    const name = __conditionName(instance);
    if (!name) continue;
    const effectKind = instance.effectKind === "buff" || instance.effectKind === "debuff"
      ? instance.effectKind
      : "";
    const key = effectKind
      ? `spell-effect:${String(instance.id || instance.effectId || name)}`
      : name.toLocaleLowerCase();
    const group = groups.get(key) || {
      name,
      instances: [],
      effectKind,
      effectId: String(instance.effectId || ""),
      parentEffectId: String(instance.parentEffectId || ""),
      theme: instance.theme && typeof instance.theme === "object"
        ? { ...instance.theme }
        : null,
    };
    group.instances.push(instance);
    groups.set(key, group);
  }

  const ordered = Array.from(groups.values());
  ordered.sort((a, b) => {
    if (!!a.effectKind !== !!b.effectKind) return a.effectKind ? -1 : 1;
    const ai = CONDITION_LIST.indexOf(a.name);
    const bi = CONDITION_LIST.indexOf(b.name);
    if (ai >= 0 || bi >= 0) {
      if (ai < 0) return 1;
      if (bi < 0) return -1;
      return ai - bi;
    }
    return a.name.localeCompare(b.name);
  });

  return ordered.map((group) => ({
    ...group,
    label: group.effectKind
      ? `${group.theme?.emoji ? `${group.theme.emoji} ` : ""}${compactSpellEffectLabel(group.name)}`
      : group.name === EXHAUSTION_CONDITION
      ? `${formatConditionName(group.name, group.theme?.emoji)} ${exhaustionLevelFromInstances(group.instances)}`
      : group.instances.length > 1
      ? `${formatConditionName(group.name, group.theme?.emoji)} x${group.instances.length}`
      : `${formatConditionName(group.name, group.theme?.emoji)}${__compactExpiryLabel(group.instances[0])}`,
  }));
}
function __conditionLabel(name, value) {
  const instance = value?.condition
    ? value
    : __legacyInstance(name, value, `label:${encodeURIComponent(name)}`);
  return instance
    ? `${formatConditionName(name, instance?.theme?.emoji)}${__compactExpiryLabel(instance)}`
    : formatConditionName(name);
}
// Colore bordo per condizione (fallback a PILL_CFG.border)
const COND_BORDER = Object.freeze({
  "Accecato":        "#9b59b6",
  "Affascinato":     "#8e44ad",
  "Afferrato":       "#d35400",
  "Assordato":       "#95a5a6",
  "Avvelenato":      "#2ecc71",
  "Incapacitato":    "#e74c3c",
  "Invisibile":      "#7f8c8d",
  "Paralizzato":     "#3498db",
  "Pietrificato":    "#34495e",
  "Privo di sensi":  "#c0392b",
  "Prono":           "#f39c12",
  "Spaventato":      "#1abc9c",
  "Stordito":        "#e67e22",
  "Trattenuto":      "#ff6f00",
  "Indebolimento":   "#d81b60",
  "Ira":             "#ff0000",
  "Santuario del Crepuscolo": "#8b5cf6",
});

// Compatibilità per vecchi import: il watcher vive nel coordinatore effetti
// persistente e questo entry point non deve creare un secondo writer.
export function mountConditionsLabelWatcher() {
  return false;
}

// === Helpers lettura/scrittura metadati condizione
export async function getItemConditions(itemId) {
  const [it] = await OBR.scene.items.getItems(i => i.id === itemId);
  return __normalizeConditions(it?.metadata?.[META_KEY]?.conditions || {});
}

async function __runCoordinatedConditionMutation(operations, options = {}) {
  const {
    requireAppliedEffectsMutation,
    runEffectsMutation,
  } = await import("./effectsMutations.js");
  return requireAppliedEffectsMutation(await runEffectsMutation(operations, options));
}

function __conditionUpdatesFromMutation(mutation, targetIds = []) {
  const scope = new Set((targetIds || []).filter(Boolean));
  const updates = new Map();
  for (const change of mutation?.changes || []) {
    if (!change?.fields?.conditions || (scope.size && !scope.has(change.id))) continue;
    updates.set(change.id, {
      version: CONDITION_SCHEMA_VERSION,
      instances: Array.isArray(change.after?.conditions) ? change.after.conditions : [],
    });
  }
  return updates;
}

export async function setItemConditions(itemId, next) {
  const id = String(itemId || "").trim();
  if (!id) return;
  const conditions = __conditionsForWrite(next);
  await __runCoordinatedConditionMutation([{
    type: "condition:set-instances",
    targetIds: [id],
    instancesByTarget: { [id]: conditions.instances },
    applyEntryConsequences: true,
  }], { kind: "condition", targetIds: [id] });
}

export function getExhaustionLevel(cond = {}) {
  return exhaustionLevelFromInstances(__allConditionInstances(cond));
}

export function getExhaustionContributionLevel(cond = {}) {
  return exhaustionContributionLevelFromInstances(__allConditionInstances(cond));
}

export function reconcileExhaustionCondition(cond = {}, level, targetId = "") {
  const instances = reconcileExhaustionInstances(
    __allConditionInstances(cond).map(__persistableConditionInstance),
    level,
    {
      id: __newConditionInstanceId(),
      targetId,
      createdAt: Date.now(),
    }
  );
  return instances.length
    ? { version: CONDITION_SCHEMA_VERSION, instances }
    : null;
}

function __sameCondition(instance, name) {
  return __conditionName(instance).toLocaleLowerCase() === String(name || "").trim().toLocaleLowerCase();
}

export async function toggleFlagForItems(itemIds, flagName, opts = {}) {
  const name = String(flagName || "").trim();
  const ids = (itemIds || []).filter(Boolean);
  if (!name || !ids.length) return;

  await __runCoordinatedConditionMutation([{
    type: "condition:toggle",
    targetIds: ids,
    conditionName: name,
    options: opts,
  }], { kind: "condition", targetIds: ids });
}

export async function addCustomForItems(itemIds, text, opts = {}) {
  const name = String(text || "").trim();
  const ids = (itemIds || []).filter(Boolean);
  if (!name || !ids.length) return;

  await __runCoordinatedConditionMutation([{
    type: "condition:add-custom",
    targetIds: ids,
    conditionName: name,
    options: opts,
  }], { kind: "condition", targetIds: ids });
}

export async function adjustConditionDurationsForItems(itemIds, delta) {
  if (!itemIds?.length || !Number.isFinite(delta) || delta === 0) return new Map();

  const ids = (itemIds || []).filter(Boolean);
  const mutation = await __runCoordinatedConditionMutation([{
    type: "condition:adjust",
    targetIds: ids,
    delta,
  }], { history: false, kind: "condition:adjust", targetIds: ids });
  return __conditionUpdatesFromMutation(mutation, ids);
}

export async function advanceConditionTurnBoundariesForItems(itemIds, boundaries = []) {
  const ids = Array.from(new Set((itemIds || []).filter(Boolean)));
  const events = (Array.isArray(boundaries) ? boundaries : [])
    .map((entry) => ({
      mode: entry?.phase === "start" ? "turn-start" : entry?.phase === "end" ? "turn-end" : "",
      actorId: String(entry?.actorId || "").trim(),
    }))
    .filter((entry) => entry.mode && entry.actorId);
  if (!ids.length || !events.length) return new Map();

  const mutation = await __runCoordinatedConditionMutation([{
    type: "condition:tick-boundaries",
    targetIds: ids,
    boundaries,
  }], { history: false, kind: "condition:tick-boundaries", targetIds: ids });
  return __conditionUpdatesFromMutation(mutation, ids);
}

export async function addOrUpdateConditionForItems(itemIds, conditionName, opts = {}) {
  const name = String(conditionName || "").trim();
  const ids = (itemIds || []).filter(Boolean);
  if (!name || !ids.length) return;

  await __runCoordinatedConditionMutation([{
    type: "condition:add",
    targetIds: ids,
    conditionName: name,
    options: opts,
  }], { kind: "condition", targetIds: ids });
}

export async function removeConditionInstanceFromItems(itemIds, instanceId) {
  const id = String(instanceId || "").trim();
  const ids = (itemIds || []).filter(Boolean);
  if (!id || !ids.length) return;

  await __runCoordinatedConditionMutation([{
    type: "condition:remove-instances",
    removals: ids.map((itemId) => ({ itemId, instanceId: id })),
  }], { kind: "condition", targetIds: ids });
}

export async function removeConditionInstancesFromItems(removals = []) {
  const byItem = new Map();
  for (const removal of Array.isArray(removals) ? removals : []) {
    const itemId = String(removal?.itemId || "").trim();
    const instanceId = String(removal?.instanceId || "").trim();
    if (!itemId || !instanceId) continue;
    const ids = byItem.get(itemId) || new Set();
    ids.add(instanceId);
    byItem.set(itemId, ids);
  }
  if (!byItem.size) return;

  const normalized = [...byItem].flatMap(([itemId, instanceIds]) =>
    [...instanceIds].map((instanceId) => ({ itemId, instanceId }))
  );
  await __runCoordinatedConditionMutation([{
    type: "condition:remove-instances",
    removals: normalized,
  }], { kind: "condition", targetIds: [...byItem.keys()] });
}

export async function removeConditionInstancesByParentEffects(removals = []) {
  const byItem = new Map();
  for (const removal of Array.isArray(removals) ? removals : []) {
    const itemId = String(removal?.itemId || "").trim();
    const parentEffectId = String(removal?.parentEffectId || "").trim();
    if (!itemId || !parentEffectId) continue;
    const ids = byItem.get(itemId) || new Set();
    ids.add(parentEffectId);
    byItem.set(itemId, ids);
  }
  if (!byItem.size) return;

  const normalized = [...byItem].flatMap(([itemId, parentEffectIds]) =>
    [...parentEffectIds].map((parentEffectId) => ({ itemId, parentEffectId }))
  );
  await __runCoordinatedConditionMutation([{
    type: "condition:remove-parent-effects",
    removals: normalized,
    conditionTypes: ["spell"],
  }], { kind: "condition", targetIds: [...byItem.keys()] });
}
export async function removeConditionFromItems(itemIds, conditionName) {
  const name = String(conditionName || "").trim();
  const ids = (itemIds || []).filter(Boolean);
  if (!name || !ids.length) return;

  await __runCoordinatedConditionMutation([{
    type: "condition:remove-name",
    targetIds: ids,
    conditionName: name,
  }], { kind: "condition", targetIds: ids });
}

export async function clearAllConditionsForItems(itemIds) {
  const ids = (itemIds || []).filter(Boolean);
  if (!ids.length) return;
  await __runCoordinatedConditionMutation([{
    type: "condition:clear",
    targetIds: ids,
  }], { kind: "condition", targetIds: ids });
}
// Payload Slate minimale per un testo monoriga
function _mkSlateParagraph(text) {
  return [{ type: "paragraph", children: [{ text: String(text || "") }] }];
}

// === Stima dimensioni testo (via canvas 2D)
function __measureTextPx(text, fontSize = 12, fontFamily = '"Helvetica Neue", Helvetica, Arial, sans-serif') {
  try {
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d");
    ctx.font = `600 ${fontSize}px ${fontFamily}`;
    const m = ctx.measureText(String(text || ""));
    const w = Math.ceil(m.width);
    const h = Math.ceil(fontSize * 1.25);
    return { w, h };
  } catch {
    const t = String(text || "");
    return { w: Math.ceil(t.length * fontSize * 0.6), h: Math.ceil(fontSize * 1.25) };
  }
}

// Geometria pill: padding/angoli/stroke
const PILL_CFG = {
  fontSize: 18,
  fontWeight: 600,
  lineHeight: 1,
  padX: 9,
  padY: 1,
  stroke: 1,
  radius: 7,
  // colori
  bg: "#0e131f",
  bgOpacity: 0.9,
  border: "rgba(255, 0, 0, 1)",
  textFill: "#f8fafc",
  textStroke: "rgba(2,6,23,.55)",
  textStrokeW: 1,
};

// Calcola size pill a partire dal testo
function __pillSizeFor(text) {
  const { w, h } = __measureTextPx(text, PILL_CFG.fontSize);
  return {
    width: w + PILL_CFG.padX * 2 + PILL_CFG.stroke * 4,
    height: h + PILL_CFG.padY * 2 + PILL_CFG.stroke * 2,
  };
}

// Margine tra chip e chip
const CHIP_GAP = 4;
const CHIP_Z = {
  bg: 100000,
  text: 100001,
};

const CHIP_LAYOUT_NUDGE = {
  x: 0.42,  // dorsale piÃ¹ interna, sovrapposta al token
  topGap: 48,  // usato anche come baseGap per anchor top/bottom
  rowGap: CHIP_GAP,
};

// === Stack condiviso con spells ===
const STACK_GAP = 1; // deve combaciare con spells-tag.js
const STACK_CLEARANCE_SCALE = 1.1; // margine anti-overlap allo zoom abituale
const WIDGET_MAX_VIEW_SCALE = 1.35;
const CONC_WIDGET_META   = `${ID}/concWidgetOf`;
const CONC_WIDGET_KEY    = `${ID}/concWidgetKey`;
const CONC_WIDGET_CASTER = `${ID}/concWidgetCaster`;

// La prima riga parte sotto il badge C, lungo la dorsale sinistra del token.
const STACK_DIR = 1;
const STACK_TOP_INSET = -4 / 70; // stack leggermente piÃ¹ alto sul riferimento 1x1
const __stackHeight = (height) => Math.ceil((Number(height) || 27) * STACK_CLEARANCE_SCALE);

function __visualTokenBox(targetItem, bounds = null) {
  const scaleX = Math.abs(Number(targetItem?.scale?.x)) || 1;
  const scaleY = Math.abs(Number(targetItem?.scale?.y)) || 1;
  const fallbackWidth = (Number(targetItem?.width) || 70) * scaleX;
  const fallbackHeight = (Number(targetItem?.height) || 70) * scaleY;
  const left = Number.isFinite(Number(bounds?.min?.x)) ? Number(bounds.min.x) : targetItem.position.x - fallbackWidth / 2;
  const top = Number.isFinite(Number(bounds?.min?.y)) ? Number(bounds.min.y) : targetItem.position.y - fallbackHeight / 2;
  const width = Number.isFinite(Number(bounds?.max?.x)) ? Number(bounds.max.x) - left : fallbackWidth;
  const height = Number.isFinite(Number(bounds?.max?.y)) ? Number(bounds.max.y) - top : fallbackHeight;
  return {
    left,
    top,
    width,
    height,
    diameter: Math.max(1, Math.min(width, height)),
  };
}

function stackBaseY(targetItem, bounds = null) {
  const box = __visualTokenBox(targetItem, bounds);
  return box.top + box.diameter * STACK_TOP_INSET;
}

// Metadata per identificare ogni chip (oltre al "owner" token)
const COND_WIDGET_KEY_META = `${ID}/condWidgetKey`; // es. "flag:Prono" o "custom:avvelenato"
const COND_WIDGET_LAYOUT_META = `${ID}/condWidgetLayout`;
const COND_WIDGET_LAYOUT_VERSION = 2;

// Ordina le flag secondo la tua UI + custom in coda
function __orderedParts(cond = {}) {
  const mapConditions = Array.isArray(cond?.instances)
    ? {
      ...cond,
      instances: cond.instances.filter((instance) => instance?.mapVisible !== false),
    }
    : cond;
  return __groupConditionInstances(mapConditions).map((group) => ({
    name: group.name,
    label: group.label,
    key: group.effectKind
      ? `spell-effect:${String(group.instances[0]?.id || group.effectId || group.name)}`
      : __chipKeyFor(group.name),
    kind: group.effectKind ? "spell-effect" : "condition",
    tone: group.effectKind || "",
    parentEffectId: group.parentEffectId,
    sourceId: String(group.instances[0]?.sourceId || ""),
    theme: group.theme,
  }));
}

// Dati intrinseci delle pill; il writer unificato calcola ordine e coordinate.
export function getConditionWidgetLayoutParts(cond = {}) {
  return __orderedParts(cond).map((part) => ({ ...part }));
}
// Genera una chiave stabile per ogni parte
function __chipKeyFor(part) {
  if (CONDITION_LIST.includes(part)) return `flag:${part}`;
  const slug = String(part).toLowerCase().trim().replace(/\s+/g, "-").slice(0, 32);
  return `custom:${slug}`;
}

function __collectCondWidgetBuckets(items = []) {
  const buckets = new Map();
  const removeIds = new Set();

  for (const item of items) {
    const key = item.metadata?.[COND_WIDGET_KEY_META];
    if (!key) {
      removeIds.add(item.id);
      continue;
    }

    const strKey = String(key);
    const bucket = buckets.get(strKey) || { shape: null, text: null, shapes: [], texts: [] };
    if (
      item.type === "LABEL" &&
      item.metadata?.[COND_WIDGET_LAYOUT_META] === COND_WIDGET_LAYOUT_VERSION
    ) {
      bucket.shapes.push(item);
    } else {
      // Qualsiasi widget legacy (incluse LABEL di una vecchia versione)
      // deve essere rimosso. Ignorarlo lo lascia visibile per sempre e può
      // conservare proprietà di scala non più previste dal layout corrente.
      removeIds.add(item.id);
    }
    buckets.set(strKey, bucket);
  }

  for (const bucket of buckets.values()) {
    bucket.shape = bucket.shapes[0] || null;
    bucket.text = null;
    for (const extra of bucket.shapes.slice(1)) removeIds.add(extra.id);
    for (const extra of bucket.texts.slice(1)) removeIds.add(extra.id);
  }

  return { buckets, removeIds };
}

async function upsertCondLabelForItem(it) {
  return upsertCondWidgetForItem(it);
}

// Lock anti-race: un solo upsert alla volta per token
const __COND_UPSERT_LOCK = new Set();
let __COND_RECONCILE_REVISION = 0;
let __conditionWidgetReconcileRequest = null;

export function configureConditionWidgetWriter(requester = null) {
  __conditionWidgetReconcileRequest = typeof requester === "function" ? requester : null;
}

async function __conditionGetItems(diagnosticsSession, selector) {
  effectsDiagnostics.sdkCall(diagnosticsSession, "getItems");
  try {
    const items = await OBR.scene.items.getItems(selector);
    effectsDiagnostics.sdkResult(diagnosticsSession, "getItems", { returnedItems: items.length });
    return items;
  } catch (error) {
    effectsDiagnostics.sdkError(diagnosticsSession, "getItems");
    throw error;
  }
}

async function __conditionGetItemBounds(diagnosticsSession, itemIds) {
  effectsDiagnostics.sdkCall(diagnosticsSession, "getItemBounds", { requestedItems: itemIds.length });
  try {
    const bounds = await OBR.scene.items.getItemBounds(itemIds);
    effectsDiagnostics.sdkResult(diagnosticsSession, "getItemBounds", { returnedItems: bounds ? itemIds.length : 0 });
    return bounds;
  } catch (error) {
    effectsDiagnostics.sdkError(diagnosticsSession, "getItemBounds");
    throw error;
  }
}

async function __conditionAddItems(diagnosticsSession, items) {
  effectsDiagnostics.sdkCall(diagnosticsSession, "addItems", { requestedItems: items.length });
  try {
    await OBR.scene.items.addItems(items);
    effectsDiagnostics.widgetMutation(diagnosticsSession, "added", items.length);
  } catch (error) {
    effectsDiagnostics.sdkError(diagnosticsSession, "addItems");
    throw error;
  }
}

async function __conditionUpdateItems(diagnosticsSession, itemIds, updater) {
  effectsDiagnostics.sdkCall(diagnosticsSession, "updateItems", { requestedItems: itemIds.length });
  try {
    await OBR.scene.items.updateItems(itemIds, updater);
    effectsDiagnostics.widgetMutation(diagnosticsSession, "updated", itemIds.length);
  } catch (error) {
    effectsDiagnostics.sdkError(diagnosticsSession, "updateItems");
    throw error;
  }
}

async function __conditionDeleteItems(diagnosticsSession, itemIds) {
  effectsDiagnostics.sdkCall(diagnosticsSession, "deleteItems", { requestedItems: itemIds.length });
  try {
    await OBR.scene.items.deleteItems(itemIds);
    effectsDiagnostics.widgetMutation(diagnosticsSession, "deleted", itemIds.length);
  } catch (error) {
    effectsDiagnostics.sdkError(diagnosticsSession, "deleteItems");
    throw error;
  }
}

export async function refreshConditionLabels(itemIds) {
  if (!__conditionWidgetReconcileRequest) {
    effectsDiagnostics.event("reconcile:ignored-non-writer", {
      engine: "conditions",
      requestedTokens: Array.isArray(itemIds) ? itemIds.filter(Boolean).length : 0,
    });
    return { outcome: "ignored-non-writer" };
  }
  return __conditionWidgetReconcileRequest(itemIds);
}

export async function reconcileConditionLabels(itemIds) {
  const revision = ++__COND_RECONCILE_REVISION;
  const requestedIds = [...new Set(Array.isArray(itemIds) ? itemIds.filter(Boolean) : [])];
  const diagnosticsSession = effectsDiagnostics.beginReconcile("conditions", {
    revision,
    targeted: requestedIds.length > 0,
    requestedTokens: requestedIds.length,
  });
  let items = [];
  let processedTokens = 0;
  let errors = 0;
  let outcome = "completed";

  try {
    if (requestedIds.length) {
      const idset = new Set(requestedIds);
      items = await __conditionGetItems(diagnosticsSession, i => idset.has(i.id));
      const foundIds = new Set(items.map((item) => item.id));
      const removedIds = requestedIds.filter((id) => !foundIds.has(id));
      if (removedIds.length) {
        const removedSet = new Set(removedIds);
        const orphanWidgets = await __conditionGetItems(diagnosticsSession,
          (item) => removedSet.has(item.metadata?.[COND_WIDGET_META])
        );
        if (orphanWidgets.length) {
          await __conditionDeleteItems(diagnosticsSession, orphanWidgets.map((item) => item.id));
        }
      }
    } else {
      items = await __conditionGetItems(diagnosticsSession, i => !!i.metadata?.[META_KEY]);
    }

    if (revision !== __COND_RECONCILE_REVISION) {
      effectsDiagnostics.revisionStale(diagnosticsSession, {
        stage: "after-token-scan",
        latestRevision: __COND_RECONCILE_REVISION,
      });
    }

    for (const it of items) {
      if (!it) continue;
      if (__COND_UPSERT_LOCK.has(it.id)) {
        effectsDiagnostics.lockSkipped(diagnosticsSession, { tokenId: it.id });
        continue;
      }
      __COND_UPSERT_LOCK.add(it.id);
      try {
        await upsertCondWidgetForItem(it, diagnosticsSession);
        processedTokens += 1;
      } catch (error) {
        errors += 1;
        console.error("[conditions] label upsert", it.id, error);
      } finally {
        __COND_UPSERT_LOCK.delete(it.id);
      }
    }
  } catch (error) {
    outcome = "failed";
    throw error;
  } finally {
    if (revision !== __COND_RECONCILE_REVISION) {
      effectsDiagnostics.revisionStale(diagnosticsSession, {
        stage: "complete",
        latestRevision: __COND_RECONCILE_REVISION,
      });
    }
    effectsDiagnostics.finishReconcile(diagnosticsSession, {
      outcome,
      scannedTokens: items.length,
      processedTokens,
      errors,
    });
  }

  return { outcome, targetIds: requestedIds.length ? requestedIds : items.map((item) => item.id) };
}

// === Anchor-based stack: calcola la Y per "cond:<key>"
async function __stackCYForCondition(
  targetItem,
  condKey,
  condHeight,
  targetBounds = null,
  diagnosticsSession = null,
  plannedConditions = [],
  prefetchedSpellLabels = null,
) {
  const tid = targetItem.id;

  // 1) SPELL rows presenti su questo target (qualsiasi caster)
  const spellLabels = Array.isArray(prefetchedSpellLabels)
    ? prefetchedSpellLabels
    : await __conditionGetItems(diagnosticsSession,
      (i) => (i.type === "TEXT" || i.type === "SHAPE" || i.type === "LABEL")
        && i.metadata?.[CONC_WIDGET_META] === tid
        && !!i.metadata?.[CONC_WIDGET_CASTER]
    );
  const spellRows = new Map(); // sig -> height
  for (const itx of spellLabels) {
    const k = (itx.metadata?.[CONC_WIDGET_KEY] || "").toString().toLowerCase();
    const c = (itx.metadata?.[CONC_WIDGET_CASTER] || "").toString();
    if (!k || !c) continue;
    const sig = `${k}|${c}`;
    const h = itx.type === "LABEL"
      ? (Number(itx.text?.height) || condHeight)
      : itx.type === "SHAPE" ? (Number(itx.height) || condHeight) : null;
    if (!spellRows.has(sig)) spellRows.set(sig, h || condHeight);
    else if (h) spellRows.set(sig, h);
  }

  // 2) COND rows presenti (bg)
  const condRows = new Map(); // key -> height
  if (plannedConditions.length) {
    for (const planned of plannedConditions) {
      if (!planned?.key) continue;
      condRows.set(String(planned.key), Number(planned.height) || condHeight);
    }
  } else {
    const condShapes = await __conditionGetItems(diagnosticsSession,
      (i) => (i.type === "LABEL" || i.type === "SHAPE") && i.metadata?.[COND_WIDGET_META] === tid
    );
    for (const sh of condShapes) {
      const key = sh.metadata?.[COND_WIDGET_KEY_META];
      if (!key) continue;
      condRows.set(String(key), Number(sh.text?.height ?? sh.height) || condHeight);
    }
  }
  if (!condRows.has(condKey)) condRows.set(condKey, condHeight);

  // 3) ordine: spells poi condizioni
  const entries = [];
  for (const [sig, h] of spellRows) entries.push({ group: 0, key: sig, h });
  for (const [key, h] of condRows)  entries.push({ group: 1, key, h });
  entries.sort((A, B) => (A.group - B.group) || String(A.key).localeCompare(String(B.key)));

  // 4) Stack usando l'anchor configurato
  const baseY = stackBaseY(targetItem, targetBounds);
  let cy = baseY, prevH = 0;
  for (let i = 0; i < entries.length; i++) {
    const h = __stackHeight(entries[i].h || condHeight);
    if (i === 0) {
      cy = baseY + STACK_DIR * (h / 2);
    } else {
      cy = cy + STACK_DIR * ((prevH / 2) + STACK_GAP + (h / 2));
    }
    if (entries[i].group === 1 && entries[i].key === condKey) return Math.round(cy);
    prevH = h;
  }
  return Math.round(baseY + STACK_DIR * (__stackHeight(condHeight) / 2));
}

// === Versione a widget (SHAPE + TEXT) — multi-chip, una per condizione ===
async function upsertCondWidgetForItem(it, diagnosticsSession = null) {
  const rawMeta = it.metadata?.[META_KEY] || {};
  const rawInstances = Array.isArray(rawMeta.conditions?.instances)
    ? rawMeta.conditions.instances
    : [];
  const sourceIds = new Set(rawInstances
    .map((instance) => String(instance?.sourceId || "").trim())
    .filter((sourceId) => sourceId && sourceId !== it.id));
  const sourceItems = sourceIds.size
    ? await __conditionGetItems(diagnosticsSession, (item) => sourceIds.has(item.id))
    : [];
  const characterBuildBySourceId = new Map(
    sourceItems.map((sourceItem) => [
      sourceItem.id,
      sourceItem.metadata?.[META_KEY]?.initiativeCard?.characterBuild,
    ])
  );
  const cond = __conditionDisplayData(
    rawMeta.conditions || {},
    rawMeta.initiativeCard?.characterBuild,
    characterBuildBySourceId,
  );
  const parts = __orderedParts(cond);
  const wantNone = parts.length === 0;

  const existing = await __conditionGetItems(diagnosticsSession,
    (i) => (i.type === "TEXT" || i.type === "SHAPE" || i.type === "LABEL") && i.metadata?.[COND_WIDGET_META] === it.id
  );

  let { buckets, removeIds } = __collectCondWidgetBuckets(existing);

  if (wantNone) {
    if (existing.length) await __conditionDeleteItems(diagnosticsSession, existing.map(x => x.id));
    return;
  }

  const sizes = parts.map(p => {
    const label = p.label;
    const { width, height } = __pillSizeFor(label);
    return { label, name: p.name, width, height, key: p.key, theme: p.theme };
  });

  const totalWidth = sizes.reduce((acc, s) => acc + s.width, 0) + CHIP_GAP * (sizes.length - 1);
  const maxH = sizes.reduce((m, s) => Math.max(m, s.height), 0);

  const hasH = typeof it.height === "number" && !Number.isNaN(it.height);
  const tokenTop = hasH ? (it.position.y - it.height / 2) : (it.position.y - 60);

  const startX = it.position.x - totalWidth;
  const anchorY = tokenTop - 8 - (maxH / 2); // legacy (non usato dal nuovo stack, ma lasciato intatto)

  // === Layout a colonna singola: bordo sinistro stabile a destra del token ===
  const rows = sizes.map(s => [s]);

  let targetBounds = null;
  try { targetBounds = await __conditionGetItemBounds(diagnosticsSession, [it.id]); } catch {}
  const stackSpellLabels = await __conditionGetItems(diagnosticsSession,
    (item) => (item.type === "TEXT" || item.type === "SHAPE" || item.type === "LABEL")
      && item.metadata?.[CONC_WIDGET_META] === it.id
      && !!item.metadata?.[CONC_WIDGET_CASTER]
  );

  const layout = Object.create(null);
  const tokenBox = __visualTokenBox(it, targetBounds);
  for (let r = 0; r < rows.length; r++) {
    const s = rows[r][0];
    const cy = await __stackCYForCondition(
      it,
      s.key,
      s.height,
      targetBounds,
      diagnosticsSession,
      sizes,
      stackSpellLabels,
    );
    const labelLeft = tokenBox.left + tokenBox.diameter * CHIP_LAYOUT_NUDGE.x;
    // Il punto della LABEL coincide con il bordo sinistro, non con il centro:
    // così la dorsale resta stabile anche con lo scaling screen-space di OBR.
    const cx = labelLeft;
    layout[s.key] = {
      pos: { x: cx, y: cy },
      width: s.width,
      height: s.height,
      label: s.label,
      background: /^#[0-9a-f]{6}$/iu.test(String(s.theme?.background || ""))
        ? s.theme.background
        : PILL_CFG.bg,
      text: /^#[0-9a-f]{6}$/iu.test(String(s.theme?.text || ""))
        ? s.theme.text
        : PILL_CFG.textFill,
      border: /^#[0-9a-f]{6}$/iu.test(String(s.theme?.accent || ""))
        ? s.theme.accent
        : COND_BORDER[s.name] || PILL_CFG.border,
    };
  }

  // 1) CREA quelli mancanti
  const toAdd = [];
  let xCreate = startX;
  for (const s of sizes) {
    const key = s.key;
    const slot = layout[key];
    const cx = slot.pos.x;
    const cy = slot.pos.y;

    const pair = buckets.get(key) || {};
    if (!pair.shape) {
      const shapeBuilt = buildLabel()
        .plainText(s.label)
        .position({ x: cx, y: cy })
        .attachedTo(it.id)
        .backgroundColor(slot.background)
        .backgroundOpacity(PILL_CFG.bgOpacity)
        .cornerRadius(slot.height / 2)
        .pointerWidth(0)
        .pointerHeight(0)
        .pointerDirection("LEFT")
        .maxViewScale(WIDGET_MAX_VIEW_SCALE)
        .padding(0)
        .fontFamily('"Helvetica Neue", Helvetica, Arial, sans-serif')
        .fontSize(PILL_CFG.fontSize)
        .fontWeight(PILL_CFG.fontWeight)
        .lineHeight(PILL_CFG.lineHeight)
        .textAlign("CENTER")
        .textAlignVertical("MIDDLE")
        .fillColor(slot.text)
        .strokeColor(PILL_CFG.textStroke)
        .strokeWidth(PILL_CFG.textStrokeW)
        .width(s.width)
        .height(s.height)
        .layer("TEXT")
        .name(`Condizione: ${s.label} (bg)`)
        .metadata({
          [COND_WIDGET_META]: it.id,
          [COND_WIDGET_KEY_META]: key,
          [COND_WIDGET_LAYOUT_META]: COND_WIDGET_LAYOUT_VERSION,
        })
        .build();
      shapeBuilt.locked = true;
      shapeBuilt.disableHit = true;
      shapeBuilt.zIndex = CHIP_Z.bg;
      toAdd.push(shapeBuilt);
    }

  }
  if (toAdd.length) {
    await __conditionAddItems(diagnosticsSession, toAdd);

    const fresh = await __conditionGetItems(diagnosticsSession,
      (i) => (i.type === "TEXT" || i.type === "SHAPE" || i.type === "LABEL") && i.metadata?.[COND_WIDGET_META] === it.id
    );
    const collected = __collectCondWidgetBuckets(fresh);
    buckets = collected.buckets;
    for (const id of collected.removeIds) removeIds.add(id);
  }

  // 2) AGGIORNA (posizione/size/stile/testo)
  const idsSet = new Set();
  for (const s of sizes) {
    const pair = buckets.get(s.key) || {};
    const slot = layout[s.key];
    if (!pair.shape || !slot) continue;
    const desired = {
      targetId: it.id,
      x: slot.pos.x,
      y: slot.pos.y,
      width: slot.width,
      height: slot.height,
      label: slot.label,
      backgroundColor: slot.background,
      backgroundOpacity: PILL_CFG.bgOpacity,
      maxViewScale: WIDGET_MAX_VIEW_SCALE,
      fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
      fontSize: PILL_CFG.fontSize,
      fontWeight: PILL_CFG.fontWeight,
      lineHeight: PILL_CFG.lineHeight,
      textFill: slot.text,
      textStroke: PILL_CFG.textStroke,
      textStrokeWidth: PILL_CFG.textStrokeW,
      zIndex: CHIP_Z.bg,
    };
    if (conditionLabelNeedsUpdate(pair.shape, desired)) idsSet.add(pair.shape.id);
  }
  const idsToUpdate = Array.from(idsSet);

  // 3) CANCELLA extra
  const validKeys = new Set(sizes.map(s => s.key));
  for (const [key, pair] of buckets.entries()) {
      if (!validKeys.has(key)) {
        if (pair.shape) removeIds.add(pair.shape.id);
      }
  }
  const toRemove = Array.from(removeIds);
  if (toRemove.length) await __conditionDeleteItems(diagnosticsSession, toRemove);

  // 4) UPDATE atomico
  if (idsToUpdate.length) await __conditionUpdateItems(diagnosticsSession, idsToUpdate, (draft) => {
    for (const itx of draft) {
      const key  = itx.metadata?.[COND_WIDGET_KEY_META];
      const slot = key ? layout[key] : null;
      if (!slot) continue;

      if (itx.attachedTo !== it.id) itx.attachedTo = it.id;
      if (itx.layer !== "TEXT") itx.layer = "TEXT";
      itx.locked = true;
      itx.disableHit = true;

      if (itx.type === "LABEL") {
        const posChanged = !itx.position || itx.position.x !== slot.pos.x || itx.position.y !== slot.pos.y;
        const wChanged   = itx.text?.width !== slot.width || itx.text?.height !== slot.height;

        if (posChanged) itx.position = { x: slot.pos.x, y: slot.pos.y };
        itx.text = itx.text || {};
        if (wChanged) { itx.text.width = slot.width; itx.text.height = slot.height; }
        itx.text.type = "PLAIN";
        itx.text.plainText = slot.label;
        itx.style = itx.style || {};
        if (itx.style.backgroundColor !== slot.background) itx.style.backgroundColor = slot.background;
        if (itx.style.backgroundOpacity !== PILL_CFG.bgOpacity) itx.style.backgroundOpacity = PILL_CFG.bgOpacity;
        if (itx.style.cornerRadius !== slot.height / 2) itx.style.cornerRadius = slot.height / 2;
        if (itx.style.maxViewScale !== WIDGET_MAX_VIEW_SCALE) itx.style.maxViewScale = WIDGET_MAX_VIEW_SCALE;
        itx.style.pointerWidth = 0;
        itx.style.pointerHeight = 0;
        itx.style.pointerDirection = "LEFT";
        itx.text.style = itx.text.style || {};
        itx.text.style.padding = 0;
        itx.text.style.fontFamily = '"Helvetica Neue", Helvetica, Arial, sans-serif';
        itx.text.style.fontSize = PILL_CFG.fontSize;
        itx.text.style.fontWeight = PILL_CFG.fontWeight;
        itx.text.style.lineHeight = PILL_CFG.lineHeight;
        itx.text.style.textAlign = "CENTER";
        itx.text.style.textAlignVertical = "MIDDLE";
        itx.text.style.fillColor = slot.text;
        itx.text.style.fillOpacity = 1;
        itx.text.style.strokeColor = PILL_CFG.textStroke;
        itx.text.style.strokeWidth = PILL_CFG.textStrokeW;
        if (itx.zIndex !== CHIP_Z.bg) itx.zIndex = CHIP_Z.bg;
      }
    }
  });
}

// Best-effort: rimuovi vecchie LABEL legacy (compat)
export async function __cleanupLegacyConditionLabels() {
  try {
    const labs = await OBR.scene.items.getItems(i => i.type === "LABEL" && i.metadata?.[COND_LABEL_META]);
    if (labs.length) await OBR.scene.items.deleteItems(labs.map(l => l.id));
  } catch {}
}

// Modifica
// Sostituisci la buildConditionChips esistente
export function buildConditionChips(cond = {}, opts = {}) {
  const cap = Array.isArray(opts.cap) ? opts.cap : [];
  const compact = !!opts.compact;
  const groups = __groupConditionInstances(cond).filter((group) => !group.effectKind);
  const pending = groups.slice();
  const ordered = [];

  for (const name of cap) {
    const index = pending.findIndex((group) => group.name === name);
    if (index >= 0) ordered.push(...pending.splice(index, 1));
  }
  ordered.push(...pending);
  if (!ordered.length) return document.createDocumentFragment();

  const wrap = document.createElement("div");
  Object.assign(wrap.style, {
    display: "inline-flex",
    gap: "6px",
    alignItems: "center",
    pointerEvents: "auto",
  });

  for (const group of ordered) {
    const chip = document.createElement("span");
    chip.className = "chip condition-chip";
    chip.dataset.referenceType = "conditions";
    chip.dataset.referenceEntry = group.name;
    const chipLabel = document.createElement("span");
    chipLabel.textContent = group.label;
    chip.appendChild(chipLabel);
    const borderCol = /^#[0-9a-f]{6}$/iu.test(String(group.theme?.accent || ""))
      ? group.theme.accent
      : COND_BORDER[group.name] || "rgba(255, 255, 255, 1)";
    const background = /^#[0-9a-f]{6}$/iu.test(String(group.theme?.background || ""))
      ? group.theme.background
      : "rgba(0,0,0,.72)";
    Object.assign(chip.style, {
      fontSize: compact ? "10px" : "11px",
      fontWeight: "500",
      padding: compact ? "2px 6px" : "4px 8px",
      display: "inline-flex",
      alignItems: "center",
      gap: "3px",
      borderRadius: "999px",
      background,
      color: "#fff",
      border: `2px solid ${borderCol}`,
      lineHeight: "1",
      whiteSpace: "nowrap",
      userSelect: "none",
      pointerEvents: "auto",
      cursor: "pointer",
    });
    const classFeatureInstance = group.instances.length === 1
      ? group.instances[0]
      : null;
    const canTerminateClassFeature = (
      classFeatureInstance?.type === "class-feature"
      || classFeatureInstance?.type === "class-feature-area"
    ) && typeof opts.onTerminateClassFeature === "function";
    if (canTerminateClassFeature) {
      const terminate = document.createElement("button");
      terminate.type = "button";
      terminate.textContent = "×";
      terminate.dataset.cardSelectionIgnore = "1";
      terminate.title = `Termina ${group.name}`;
      terminate.setAttribute("aria-label", terminate.title);
      Object.assign(terminate.style, {
        minWidth: compact ? "10px" : "12px",
        width: compact ? "10px" : "12px",
        height: compact ? "10px" : "12px",
        padding: "0",
        border: "0",
        borderRadius: "50%",
        background: "rgba(0,0,0,.22)",
        color: "inherit",
        font: "inherit",
        fontSize: compact ? "10px" : "11px",
        fontWeight: "800",
        lineHeight: compact ? "10px" : "12px",
        cursor: "pointer",
      });
      terminate.addEventListener("mouseenter", () => {
        terminate.style.background = "rgba(220,38,38,.72)";
      });
      terminate.addEventListener("mouseleave", () => {
        terminate.style.background = "rgba(0,0,0,.22)";
      });
      terminate.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (terminate.disabled) return;
        terminate.disabled = true;
        Promise.resolve(opts.onTerminateClassFeature(classFeatureInstance))
          .catch((error) => {
            terminate.disabled = false;
            console.warn("[conditions] terminate class feature:", error?.message || error);
          });
      });
      chip.appendChild(terminate);
    }
    wrap.appendChild(chip);
  }

  return wrap;
}

export function buildSpellEffectChips(cond = {}, opts = {}) {
  const compact = !!opts.compact;
  const parentEffectId = String(opts.parentEffectId || "").trim();
  const groups = __groupConditionInstances(cond).filter((group) =>
    !!group.effectKind &&
    (!parentEffectId || group.parentEffectId === parentEffectId)
  );
  const frag = document.createDocumentFragment();

  for (const group of groups) {
    const instance = group.instances[0] || {};
    const chip = document.createElement("span");
    chip.className = "chip spell-effect-chip";
    chip.textContent = group.label;
    chip.title = formatConditionInstance(instance);
    chip.dataset.conditionInstanceId = String(instance.id || "");
    chip.dataset.spellEffectKind = group.effectKind;
    const buff = group.effectKind === "buff";
    const background = /^#[0-9a-f]{6}$/iu.test(String(group.theme?.background || ""))
      ? group.theme.background
      : buff ? "rgba(21,128,61,.88)" : "rgba(185,28,28,.88)";
    const border = /^#[0-9a-f]{6}$/iu.test(String(group.theme?.accent || ""))
      ? group.theme.accent
      : buff ? "#86efac" : "#fca5a5";
    Object.assign(chip.style, {
      display: "inline-flex",
      alignItems: "center",
      padding: compact ? "2px 6px" : "4px 8px",
      borderRadius: "999px",
      background,
      color: "#fff",
      border: `2px solid ${border}`,
      boxShadow: "0 1px 0 rgba(0,0,0,.35)",
      fontSize: compact ? "10px" : "11px",
      fontWeight: "600",
      lineHeight: "1",
      whiteSpace: "nowrap",
      userSelect: "none",
      pointerEvents: "auto",
      cursor: "default",
    });
    frag.appendChild(chip);
  }

  return frag;
}
