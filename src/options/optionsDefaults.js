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
  "uiSync.showEffectSummaryParts",
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
    effectsDisplayMode: "selected",
    // GM's tracker size on this browser: 1 = 100%, from 0.5 to 2 (players use playerView.trackerScale).
    scale: 1,
    // A player's own "follow the turn" in the Online room profile: off, the turn never moves their view. The Table
    // profile ignores it, the table screen follows the GM's Segui (audit online, O2a).
    playerFollowActiveTurn: false,
    // A player's own tracker size in the Online profile (menu «Schermo»): null follows the room's playerView.trackerScale.
    playerScale: null,
  },
  windows: {
    clocksCompact: false,
    // The attack console opens by itself on the turn of an actor with attacks (pcAttackTurnController.js): a character
    // or an ally with pcAttackAutoOpen, any other creature (monsters, bosses) with pcAttackAutoOpenMonsters. null: the
    // monsters follow pcAttackAutoOpen until their own switch is touched (attacchi dei mostri, lotto 7).
    pcAttackAutoOpen: false,
    pcAttackAutoOpenMonsters: null,
  },
  tools: {
    distance3d: true,
    reference: true,
    // The online archive of 5eTools' bestiaries (attacchi dei mostri, fase 3): the address of its data folder, written
    // once by the GM. Empty by default: the plugin ships no archive address (decision D1).
    fiveToolsArchive: "",
    fiveToolsImages: "",
    fiveTools2024: false,
  },
  runtime: {
    combatLog: true,
    // Off: a player turns the spell animations off on their own screen, in the Online profile only (menu «Schermo»).
    playerAnimations: true,
    // On: a player sees only the reminders about their own characters, in the Online profile only (menu «Schermo»).
    playerRemindersMineOnly: false,
  },
});

const DEFAULT_HP_SURFACE = Object.freeze({
  pc: "hidden",
  ally: "hidden",
  neutral: "hidden",
  enemy: "hidden",
});

export const ROOM_PROFILES = Object.freeze(["table", "online"]);

export const DEFAULT_ROOM_OPTIONS = deepFreeze({
  version: OPTIONS_SCHEMA_VERSION,
  updatedAt: 0,
  // How the room is played (audit online): "table" keeps the table screen's behaviour exactly as it was; "online" lets
  // every player keep their own view (camera, tracker closed). Nothing else reads it in the Table profile.
  profile: "table",
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
      // The death-save popup on the table screen; the GM always sees it.
      showDeathSaves: true,
    },
    bossDetails: "full",
    // Players' tracker size (table screen read from a distance): 1 = 100%, from 0.5 to 2.
    trackerScale: 1,
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
    // Players follow the GM's tracker layout (extended/compact) and position (proportional to the screen).
    trackerPlacement: true,
    effectsDisplayMode: "selected",
    showEffectSummaryParts: true,
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
