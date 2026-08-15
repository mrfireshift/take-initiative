import {
  createDefaultLocalOptions,
  createDefaultRoomOptions,
  createDefaultSceneOptions,
  OPTIONS_SCHEMA_VERSION,
  SCENE_OVERRIDE_PATHS,
} from "./optionsDefaults.js";

export function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function cloneOptionsValue(value) {
  return JSON.parse(JSON.stringify(value));
}

export function mergeOptionsDocuments(base, patch) {
  const left = isPlainObject(base) ? base : {};
  const right = isPlainObject(patch) ? patch : {};
  const result = cloneOptionsValue(left);
  for (const [key, value] of Object.entries(right)) {
    if (value === undefined) continue;
    result[key] = isPlainObject(value) && isPlainObject(result[key])
      ? mergeOptionsDocuments(result[key], value)
      : cloneOptionsValue(value);
  }
  return result;
}

function compactAgainstDefaults(value, defaults) {
  const source = objectOrEmpty(value);
  const baseline = objectOrEmpty(defaults);
  const compact = {};
  for (const [key, current] of Object.entries(source)) {
    if (!Object.hasOwn(baseline, key)) {
      compact[key] = cloneOptionsValue(current);
      continue;
    }
    const fallback = baseline[key];
    if (isPlainObject(current) && isPlainObject(fallback)) {
      const nested = compactAgainstDefaults(current, fallback);
      if (Object.keys(nested).length) compact[key] = nested;
      continue;
    }
    if (JSON.stringify(current) !== JSON.stringify(fallback)) {
      compact[key] = cloneOptionsValue(current);
    }
  }
  return compact;
}

function objectOrEmpty(value) {
  return isPlainObject(value) ? value : {};
}

function normalizedVersion(value) {
  const version = Number(value);
  return Number.isInteger(version) && version >= OPTIONS_SCHEMA_VERSION
    ? version
    : OPTIONS_SCHEMA_VERSION;
}

function normalizedUpdatedAt(value) {
  const updatedAt = Number(value);
  return Number.isFinite(updatedAt) && updatedAt >= 0 ? Math.round(updatedAt) : 0;
}

function booleanOr(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function enumOr(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function layeredBoolean(source, legacy, key, fallback) {
  if (typeof source[key] === "boolean") return source[key];
  if (typeof legacy[key] === "boolean") return legacy[key];
  return fallback;
}

function layeredEnum(source, legacy, key, allowed, fallback) {
  if (allowed.includes(source[key])) return source[key];
  if (allowed.includes(legacy[key])) return legacy[key];
  return fallback;
}

export function normalizeLocalOptions(value, { legacy = {} } = {}) {
  const defaults = createDefaultLocalOptions();
  const source = objectOrEmpty(value);
  const legacySource = objectOrEmpty(legacy);
  const tracker = objectOrEmpty(source.tracker);
  const legacyTracker = objectOrEmpty(legacySource.tracker);
  const windows = objectOrEmpty(source.windows);
  const legacyWindows = objectOrEmpty(legacySource.windows);
  const tools = objectOrEmpty(source.tools);
  const legacyTools = objectOrEmpty(legacySource.tools);
  const runtime = objectOrEmpty(source.runtime);
  const legacyRuntime = objectOrEmpty(legacySource.runtime);

  return {
    ...source,
    version: normalizedVersion(source.version),
    updatedAt: normalizedUpdatedAt(source.updatedAt),
    tracker: {
      ...tracker,
      layout: layeredEnum(
        tracker,
        legacyTracker,
        "layout",
        ["classic", "compact"],
        defaults.tracker.layout,
      ),
      followActiveTurn: layeredBoolean(
        tracker,
        legacyTracker,
        "followActiveTurn",
        defaults.tracker.followActiveTurn,
      ),
      toolbarPreset: layeredEnum(
        tracker,
        legacyTracker,
        "toolbarPreset",
        ["full", "essential"],
        defaults.tracker.toolbarPreset,
      ),
      effectsDisplayMode: layeredEnum(
        tracker,
        legacyTracker,
        "effectsDisplayMode",
        ["selected", "all", "compact"],
        defaults.tracker.effectsDisplayMode,
      ),
    },
    windows: {
      ...windows,
      clocksCompact: layeredBoolean(
        windows,
        legacyWindows,
        "clocksCompact",
        defaults.windows.clocksCompact,
      ),
    },
    tools: {
      ...tools,
      distance3d: layeredBoolean(
        tools,
        legacyTools,
        "distance3d",
        defaults.tools.distance3d,
      ),
      reference: layeredBoolean(
        tools,
        legacyTools,
        "reference",
        defaults.tools.reference,
      ),
    },
    runtime: {
      ...runtime,
      combatLog: layeredBoolean(
        runtime,
        legacyRuntime,
        "combatLog",
        defaults.runtime.combatLog,
      ),
    },
  };
}

const HP_VISIBILITY = ["exact", "bar", "status", "hidden"];
const EFFECT_VISIBILITY = ["all", "summary", "hidden"];
const REMINDER_VISIBILITY = ["full", "summary", "notice", "hidden"];
const BOSS_VISIBILITY = ["full", "summary", "hidden"];

function normalizeHpSurface(value, defaults) {
  const source = objectOrEmpty(value);
  return {
    ...source,
    pc: enumOr(source.pc, HP_VISIBILITY, defaults.pc),
    ally: enumOr(source.ally, HP_VISIBILITY, defaults.ally),
    neutral: enumOr(source.neutral, HP_VISIBILITY, defaults.neutral),
    enemy: enumOr(source.enemy, HP_VISIBILITY, defaults.enemy),
  };
}

function normalizeHpPolicy(value, defaults) {
  const source = objectOrEmpty(value);
  return {
    ...source,
    trackerClassic: normalizeHpSurface(source.trackerClassic, defaults.trackerClassic),
    trackerCompact: normalizeHpSurface(source.trackerCompact, defaults.trackerCompact),
    map: normalizeHpSurface(source.map, defaults.map),
  };
}

function normalizeEffectsPolicy(value, defaults) {
  const source = objectOrEmpty(value);
  return {
    ...source,
    conditions: enumOr(source.conditions, EFFECT_VISIBILITY, defaults.conditions),
    spells: enumOr(source.spells, EFFECT_VISIBILITY, defaults.spells),
    concentration: enumOr(source.concentration, EFFECT_VISIBILITY, defaults.concentration),
  };
}

function normalizeReminderPolicy(value, defaults) {
  const source = objectOrEmpty(value);
  return {
    ...source,
    visibility: enumOr(source.visibility, REMINDER_VISIBILITY, defaults.visibility),
    showDc: booleanOr(source.showDc, defaults.showDc),
    showCaster: booleanOr(source.showCaster, defaults.showCaster),
  };
}

export function normalizeRoomOptions(value) {
  const defaults = createDefaultRoomOptions();
  const source = objectOrEmpty(value);
  const playerView = objectOrEmpty(source.playerView);
  const turn = objectOrEmpty(source.turn);
  const map = objectOrEmpty(source.map);
  const tools = objectOrEmpty(source.tools);
  const automation = objectOrEmpty(source.automation);
  const integrations = objectOrEmpty(source.integrations);
  const uiSync = objectOrEmpty(source.uiSync);

  return {
    ...source,
    version: normalizedVersion(source.version),
    updatedAt: normalizedUpdatedAt(source.updatedAt),
    playerView: {
      ...playerView,
      hp: normalizeHpPolicy(playerView.hp, defaults.playerView.hp),
      effects: normalizeEffectsPolicy(playerView.effects, defaults.playerView.effects),
      reminders: normalizeReminderPolicy(playerView.reminders, defaults.playerView.reminders),
      bossDetails: enumOr(
        playerView.bossDetails,
        BOSS_VISIBILITY,
        defaults.playerView.bossDetails,
      ),
    },
    turn: {
      ...turn,
      popup: booleanOr(turn.popup, defaults.turn.popup),
      directReminderResolution: enumOr(
        turn.directReminderResolution,
        ["assisted", "informational"],
        defaults.turn.directReminderResolution,
      ),
      movementReminder: booleanOr(turn.movementReminder, defaults.turn.movementReminder),
    },
    map: {
      ...map,
      hpBars: booleanOr(map.hpBars, defaults.map.hpBars),
      effectLabels: booleanOr(map.effectLabels, defaults.map.effectLabels),
      activeTurnLabel: booleanOr(map.activeTurnLabel, defaults.map.activeTurnLabel),
      elevationLabels: booleanOr(map.elevationLabels, defaults.map.elevationLabels),
    },
    tools: {
      ...tools,
      clocks: booleanOr(tools.clocks, defaults.tools.clocks),
    },
    automation: {
      ...automation,
      knownFactionAssignment: booleanOr(
        automation.knownFactionAssignment,
        defaults.automation.knownFactionAssignment,
      ),
    },
    integrations: {
      ...integrations,
      embersAnimations: booleanOr(
        integrations.embersAnimations,
        defaults.integrations.embersAnimations,
      ),
    },
    uiSync: {
      ...uiSync,
      trackerOpen: booleanOr(uiSync.trackerOpen, defaults.uiSync.trackerOpen),
      effectsDisplayMode: enumOr(
        uiSync.effectsDisplayMode,
        ["selected", "all", "compact"],
        defaults.uiSync.effectsDisplayMode,
      ),
    },
  };
}

export function compactRoomOptionsForStorage(value) {
  const normalized = normalizeRoomOptions(value);
  const compact = compactAgainstDefaults(normalized, createDefaultRoomOptions());
  return {
    version: normalized.version,
    updatedAt: normalized.updatedAt,
    ...compact,
  };
}

const overrideValueNormalizers = Object.freeze({
  "playerView.hp": (value) => normalizeRoomOptions({ playerView: { hp: value } }).playerView.hp,
  "playerView.effects": (value) => normalizeRoomOptions({ playerView: { effects: value } }).playerView.effects,
  "playerView.reminders": (value) => normalizeRoomOptions({ playerView: { reminders: value } }).playerView.reminders,
  "playerView.bossDetails": (value) => normalizeRoomOptions({ playerView: { bossDetails: value } }).playerView.bossDetails,
  "turn.popup": (value) => normalizeRoomOptions({ turn: { popup: value } }).turn.popup,
  "turn.directReminderResolution": (value) => normalizeRoomOptions({ turn: { directReminderResolution: value } }).turn.directReminderResolution,
  "turn.movementReminder": (value) => normalizeRoomOptions({ turn: { movementReminder: value } }).turn.movementReminder,
  "map.hpBars": (value) => normalizeRoomOptions({ map: { hpBars: value } }).map.hpBars,
  "map.effectLabels": (value) => normalizeRoomOptions({ map: { effectLabels: value } }).map.effectLabels,
  "map.activeTurnLabel": (value) => normalizeRoomOptions({ map: { activeTurnLabel: value } }).map.activeTurnLabel,
  "map.elevationLabels": (value) => normalizeRoomOptions({ map: { elevationLabels: value } }).map.elevationLabels,
});

function normalizeOverride(value, normalizeValue) {
  if (value === "inherit") return { mode: "inherit" };
  const source = objectOrEmpty(value);
  if (source.mode !== "override" || !Object.hasOwn(source, "value")) {
    const { value: ignored, ...unknown } = source;
    return { ...unknown, mode: "inherit" };
  }
  return {
    ...source,
    mode: "override",
    value: normalizeValue(source.value),
  };
}

export function normalizeSceneOptions(value) {
  const defaults = createDefaultSceneOptions();
  const source = objectOrEmpty(value);
  const sourceOverrides = objectOrEmpty(source.overrides);
  const overrides = { ...sourceOverrides };
  for (const path of SCENE_OVERRIDE_PATHS) {
    overrides[path] = normalizeOverride(
      sourceOverrides[path] ?? defaults.overrides[path],
      overrideValueNormalizers[path],
    );
  }
  return {
    ...source,
    version: normalizedVersion(source.version),
    updatedAt: normalizedUpdatedAt(source.updatedAt),
    overrides,
  };
}

export function compactSceneOptionsForStorage(value) {
  const normalized = normalizeSceneOptions(value);
  const compact = compactAgainstDefaults(normalized, createDefaultSceneOptions());
  return {
    version: normalized.version,
    updatedAt: normalized.updatedAt,
    ...compact,
  };
}
