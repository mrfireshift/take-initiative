import { ID } from "../constants.js";

export const OPTIONS_SCHEMA_VERSION = 1;

export const LOCAL_OPTIONS_KEY = `${ID}/options-local`;
export const ROOM_OPTIONS_KEY = `${ID}/options-room`;
export const SCENE_OPTIONS_KEY = `${ID}/options-scene`;

export const LEGACY_LOCAL_OPTIONS_KEYS = Object.freeze({
  trackerLayout: `${ID}/tracker-layout`,
  clocksCompact: `${ID}/clocks-compact`,
});

export const SCENE_OVERRIDE_PATHS = Object.freeze([
  "playerView.hp",
  "playerView.effects",
  "playerView.reminders",
  "playerView.bossDetails",
  "turn.popup",
  "turn.directReminderResolution",
  "turn.movementReminder",
  "map.hpBars",
  "map.effectLabels",
  "map.activeTurnLabel",
  "map.elevationLabels",
]);

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export const DEFAULT_LOCAL_OPTIONS = deepFreeze({
  version: OPTIONS_SCHEMA_VERSION,
  updatedAt: 0,
  tracker: {
    layout: "classic",
    followActiveTurn: true,
    toolbarPreset: "full",
  },
  windows: {
    clocksCompact: false,
  },
  tools: {
    distance3d: true,
    reference: true,
  },
  runtime: {
    combatLog: true,
  },
});

const DEFAULT_HP_SURFACE = Object.freeze({
  pc: "hidden",
  ally: "hidden",
  neutral: "hidden",
  enemy: "hidden",
});

export const DEFAULT_ROOM_OPTIONS = deepFreeze({
  version: OPTIONS_SCHEMA_VERSION,
  updatedAt: 0,
  playerView: {
    hp: {
      trackerClassic: {
        ...DEFAULT_HP_SURFACE,
        pc: "exact",
        ally: "exact",
      },
      trackerCompact: {
        ...DEFAULT_HP_SURFACE,
        pc: "exact",
      },
      map: {
        ...DEFAULT_HP_SURFACE,
        pc: "exact",
        ally: "exact",
      },
    },
    effects: {
      conditions: "all",
      spells: "all",
      concentration: "all",
    },
    reminders: {
      visibility: "full",
      showDc: true,
      showCaster: true,
    },
    bossDetails: "full",
  },
  turn: {
    popup: true,
    directReminderResolution: "assisted",
    movementReminder: true,
  },
  map: {
    hpBars: true,
    effectLabels: true,
    activeTurnLabel: true,
    elevationLabels: true,
  },
  tools: {
    clocks: true,
  },
  automation: {
    knownFactionAssignment: true,
  },
  integrations: {
    embersAnimations: true,
  },
  uiSync: {
    trackerOpen: true,
  },
});

export const DEFAULT_SCENE_OPTIONS = deepFreeze({
  version: OPTIONS_SCHEMA_VERSION,
  updatedAt: 0,
  overrides: Object.fromEntries(
    SCENE_OVERRIDE_PATHS.map((path) => [path, { mode: "inherit" }]),
  ),
});

export function createDefaultLocalOptions() {
  return clone(DEFAULT_LOCAL_OPTIONS);
}

export function createDefaultRoomOptions() {
  return clone(DEFAULT_ROOM_OPTIONS);
}

export function createDefaultSceneOptions() {
  return clone(DEFAULT_SCENE_OPTIONS);
}
