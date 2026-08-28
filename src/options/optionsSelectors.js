import { cloneOptionsValue } from "./optionsNormalize.js";

function resolved(options) {
  if (!options || typeof options !== "object" || !options.local || !options.shared) {
    throw new TypeError("options selector requires a resolved options snapshot");
  }
  return options;
}

function clone(value) {
  return cloneOptionsValue(value);
}

export function selectResolvedOptions(options) {
  return clone(resolved(options));
}

export function selectTrackerLayout(options) {
  return resolved(options).local.tracker.layout;
}

export function selectFollowActiveTurn(options) {
  return resolved(options).local.tracker.followActiveTurn;
}

export function selectToolbarPreset(options) {
  return resolved(options).local.tracker.toolbarPreset;
}

export function selectEffectsDisplayMode(options) {
  return resolved(options).shared.uiSync.effectsDisplayMode;
}

export function selectEffectSummaryPartsEnabled(options) {
  return resolved(options).shared.uiSync.showEffectSummaryParts;
}

export function selectClocksCompact(options) {
  return resolved(options).local.windows.clocksCompact;
}

export function selectDistance3dToolEnabled(options) {
  return resolved(options).local.tools.distance3d;
}

export function selectReferenceToolEnabled(options) {
  return resolved(options).local.tools.reference;
}

export function selectCombatLogEnabled(options) {
  return resolved(options).local.runtime.combatLog;
}

export function selectPlayerHpPolicy(options) {
  return clone(resolved(options).shared.playerView.hp);
}

export function selectPlayerHpVisibility(options, { surface, attitude } = {}) {
  const policy = resolved(options).shared.playerView.hp;
  const surfaceKey = ["trackerClassic", "trackerCompact", "map"].includes(surface)
    ? surface
    : "trackerClassic";
  const attitudeKey = ["pc", "ally", "neutral", "enemy"].includes(attitude)
    ? attitude
    : "enemy";
  return policy[surfaceKey][attitudeKey];
}

export function selectPlayerEffectsPolicy(options) {
  return clone(resolved(options).shared.playerView.effects);
}

export function selectPlayerReminderPolicy(options) {
  return clone(resolved(options).shared.playerView.reminders);
}

export function selectPlayerBossDetails(options) {
  return resolved(options).shared.playerView.bossDetails;
}

export function selectTurnPopupEnabled(options) {
  return resolved(options).shared.turn.popup;
}

export function selectDirectReminderResolution(options) {
  return resolved(options).shared.turn.directReminderResolution;
}

export function selectMovementReminderEnabled(options) {
  return resolved(options).shared.turn.movementReminder;
}

export function selectMapHpBarsEnabled(options) {
  return resolved(options).shared.map.hpBars;
}

export function selectMapEffectLabelsEnabled(options) {
  return resolved(options).shared.map.effectLabels;
}

export function selectActiveTurnLabelEnabled(options) {
  return resolved(options).shared.map.activeTurnLabel;
}

export function selectElevationLabelsEnabled(options) {
  return resolved(options).shared.map.elevationLabels;
}

export function selectClocksToolEnabled(options) {
  return resolved(options).shared.tools.clocks;
}

export function selectKnownFactionAssignmentEnabled(options) {
  return resolved(options).shared.automation.knownFactionAssignment;
}

export function selectEmbersAnimationsEnabled(options) {
  return resolved(options).shared.integrations.embersAnimations;
}

export function selectTrackerOpenSyncEnabled(options) {
  return resolved(options).shared.uiSync.trackerOpen;
}

export function selectSceneOverriddenPaths(options) {
  return [...resolved(options).source.overriddenPaths];
}

export function selectOptionsRevision(options) {
  const value = resolved(options).source;
  return {
    roomUpdatedAt: Number(value.room?.updatedAt) || 0,
    sceneUpdatedAt: Number(value.scene?.updatedAt) || 0,
  };
}

export function selectTrackerProjectionPolicy(options) {
  const value = resolved(options).shared.playerView;
  return clone({ hp: value.hp, effects: value.effects, bossDetails: value.bossDetails });
}

export function selectReminderProjectionPolicy(options) {
  const value = resolved(options);
  return clone({
    player: value.shared.playerView.reminders,
    popup: value.shared.turn.popup,
    directResolution: value.shared.turn.directReminderResolution,
  });
}

function panelSceneEntry(options, path, roomValue) {
  const entry = resolved(options).source.scene?.overrides?.[path];
  return entry?.mode === "override"
    ? { mode: "override", value: clone(entry.value) }
    : { mode: "inherit", value: clone(roomValue) };
}

export function selectOptionsPanelModel(options) {
  const value = resolved(options);
  const room = value.source.room;
  if (!room || typeof room !== "object") {
    throw new TypeError("options panel selector requires normalized scope sources");
  }
  return clone({
    local: {
      layout: value.local.tracker.layout,
      followActiveTurn: value.local.tracker.followActiveTurn,
      combatLog: value.local.runtime.combatLog,
    },
    room: {
      trackerOpen: room.uiSync.trackerOpen,
      knownFactionAssignment: room.automation.knownFactionAssignment,
      embersAnimations: room.integrations.embersAnimations,
      hp: room.playerView.hp,
      effects: room.playerView.effects,
      reminders: room.playerView.reminders,
      popup: room.turn.popup,
      directResolution: room.turn.directReminderResolution,
      movementReminder: room.turn.movementReminder,
      activeTurnLabel: room.map.activeTurnLabel,
      summaryParts: room.uiSync.showEffectSummaryParts,
    },
    scene: {
      hp: panelSceneEntry(value, "playerView.hp", room.playerView.hp),
      effects: panelSceneEntry(value, "playerView.effects", room.playerView.effects),
      reminders: panelSceneEntry(value, "playerView.reminders", room.playerView.reminders),
      popup: panelSceneEntry(value, "turn.popup", room.turn.popup),
      directResolution: panelSceneEntry(
        value,
        "turn.directReminderResolution",
        room.turn.directReminderResolution,
      ),
      movementReminder: panelSceneEntry(
        value,
        "turn.movementReminder",
        room.turn.movementReminder,
      ),
      activeTurnLabel: panelSceneEntry(
        value,
        "map.activeTurnLabel",
        room.map.activeTurnLabel,
      ),
      summaryParts: panelSceneEntry(
        value,
        "uiSync.showEffectSummaryParts",
        room.uiSync.showEffectSummaryParts,
      ),
    },
  });
}
