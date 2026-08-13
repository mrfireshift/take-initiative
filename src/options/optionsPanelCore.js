import {
  cloneOptionsValue,
  normalizeLocalOptions,
  normalizeRoomOptions,
  normalizeSceneOptions,
} from "./optionsNormalize.js";
import { selectOptionsPanelModel } from "./optionsSelectors.js";

export const OPTIONS_PANEL_SCENE_FAMILIES = Object.freeze({
  hp: "playerView.hp",
  effects: "playerView.effects",
  reminders: "playerView.reminders",
  popup: "turn.popup",
  directResolution: "turn.directReminderResolution",
  movementReminder: "turn.movementReminder",
  activeTurnLabel: "map.activeTurnLabel",
});

function clone(value) {
  return cloneOptionsValue(value);
}

export function normalizeOptionsPanelDraft(value = {}) {
  const localInput = value.local && typeof value.local === "object" ? value.local : {};
  const roomInput = value.room && typeof value.room === "object" ? value.room : {};
  const sceneInput = value.scene && typeof value.scene === "object" ? value.scene : {};
  const local = normalizeLocalOptions({
    tracker: {
      layout: localInput.layout,
      followActiveTurn: localInput.followActiveTurn,
    },
    runtime: {
      combatLog: localInput.combatLog,
    },
  });
  const room = normalizeRoomOptions({
    playerView: {
      hp: roomInput.hp,
      effects: roomInput.effects,
      reminders: roomInput.reminders,
    },
    turn: {
      popup: roomInput.popup,
      directReminderResolution: roomInput.directResolution,
      movementReminder: roomInput.movementReminder,
    },
    map: { activeTurnLabel: roomInput.activeTurnLabel },
    automation: {
      knownFactionAssignment: roomInput.knownFactionAssignment
        ?? roomInput.automation?.knownFactionAssignment,
    },
    integrations: {
      embersAnimations: roomInput.embersAnimations
        ?? roomInput.integrations?.embersAnimations,
    },
    uiSync: { trackerOpen: roomInput.trackerOpen },
  });
  const rawOverrides = {};
  for (const [family, path] of Object.entries(OPTIONS_PANEL_SCENE_FAMILIES)) {
    const entry = sceneInput[family];
    rawOverrides[path] = entry?.mode === "override"
      ? { mode: "override", value: clone(entry.value) }
      : { mode: "inherit" };
  }
  const scene = normalizeSceneOptions({ overrides: rawOverrides });
  return {
    local: {
      layout: local.tracker.layout,
      followActiveTurn: local.tracker.followActiveTurn,
      combatLog: local.runtime.combatLog,
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
    },
    scene: Object.fromEntries(Object.entries(OPTIONS_PANEL_SCENE_FAMILIES).map(
      ([family, path]) => {
        const entry = scene.overrides[path];
        const roomFallback = roomValueForFamily(room, family);
        return [family, entry.mode === "override"
          ? { mode: "override", value: clone(entry.value) }
          : { mode: "inherit", value: clone(roomFallback) }];
      },
    )),
  };
}

function roomValueForFamily(room, family) {
  if (family === "hp") return room.playerView.hp;
  if (family === "effects") return room.playerView.effects;
  if (family === "reminders") return room.playerView.reminders;
  if (family === "popup") return room.turn.popup;
  if (family === "directResolution") return room.turn.directReminderResolution;
  if (family === "movementReminder") return room.turn.movementReminder;
  return room.map.activeTurnLabel;
}

export function buildOptionsPanelPatches(draft) {
  const normalized = normalizeOptionsPanelDraft(draft);
  return {
    local: {
      tracker: {
        layout: normalized.local.layout,
        followActiveTurn: normalized.local.followActiveTurn,
      },
      runtime: {
        combatLog: normalized.local.combatLog,
      },
    },
    room: {
      playerView: {
        hp: clone(normalized.room.hp),
        effects: clone(normalized.room.effects),
        reminders: clone(normalized.room.reminders),
      },
      turn: {
        popup: normalized.room.popup,
        directReminderResolution: normalized.room.directResolution,
        movementReminder: normalized.room.movementReminder,
      },
      map: { activeTurnLabel: normalized.room.activeTurnLabel },
      automation: {
        knownFactionAssignment: normalized.room.knownFactionAssignment,
      },
      integrations: {
        embersAnimations: normalized.room.embersAnimations,
      },
      uiSync: { trackerOpen: normalized.room.trackerOpen },
    },
    scene: {
      overrides: Object.fromEntries(Object.entries(OPTIONS_PANEL_SCENE_FAMILIES).map(
        ([family, path]) => {
          const entry = normalized.scene[family];
          return [path, entry.mode === "override"
            ? { mode: "override", value: clone(entry.value) }
            : { mode: "inherit" }];
        },
      )),
    },
  };
}

export async function saveOptionsPanelDraft(service, draft) {
  if (!service?.updateLocal || !service?.updateRoom || !service?.updateScene) {
    throw new TypeError("options panel requires the options service writers");
  }
  const patches = buildOptionsPanelPatches(draft);
  await service.updateLocal(() => patches.local);
  await service.updateRoom((current) => ({
    ...current,
    playerView: { ...current.playerView, ...patches.room.playerView },
    turn: { ...current.turn, ...patches.room.turn },
    map: { ...current.map, ...patches.room.map },
    automation: { ...current.automation, ...patches.room.automation },
    integrations: { ...current.integrations, ...patches.room.integrations },
    uiSync: { ...current.uiSync, ...patches.room.uiSync },
  }));
  await service.updateScene((current) => ({
    ...current,
    overrides: Object.fromEntries([
      ...Object.entries(current.overrides || {}),
      ...Object.entries(patches.scene.overrides).map(([path, entry]) => [
        path,
        { ...(current.overrides?.[path] || {}), ...entry },
      ]),
    ]),
  }));
  return patches;
}

function panelDraftDigest(value) {
  return JSON.stringify(normalizeOptionsPanelDraft(value));
}

function mismatchedPanelScopes(expected, actual) {
  const wanted = normalizeOptionsPanelDraft(expected);
  const found = normalizeOptionsPanelDraft(actual);
  const scopes = [];
  if (JSON.stringify(wanted.local) !== JSON.stringify(found.local)) scopes.push("locale");
  if (JSON.stringify(wanted.room) !== JSON.stringify(found.room)) scopes.push("Room");
  const sceneDigest = (draft) => JSON.stringify(Object.fromEntries(
    Object.entries(draft.scene).map(([family, entry]) => [
      family,
      entry.mode === "override"
        ? { mode: "override", value: entry.value }
        : { mode: "inherit" },
    ]),
  ));
  if (sceneDigest(wanted) !== sceneDigest(found)) scopes.push("scena");
  return scopes;
}

export async function verifyOptionsPanelDraft(service, expectedDraft, {
  attempts = 5,
  delayMs = 200,
  stableReads = 2,
  wait = (ms) => new Promise((resolve) => globalThis.setTimeout(resolve, ms)),
} = {}) {
  if (!service?.readPersisted) {
    throw new TypeError("options panel verification requires persisted selector access");
  }
  const expectedDigest = panelDraftDigest(expectedDraft);
  let persisted = null;
  let consecutiveMatches = 0;
  for (let attempt = 0; attempt < Math.max(1, attempts); attempt += 1) {
    persisted = normalizeOptionsPanelDraft(
      await service.readPersisted(selectOptionsPanelModel),
    );
    if (panelDraftDigest(persisted) === expectedDigest) {
      consecutiveMatches += 1;
      if (consecutiveMatches >= Math.max(1, stableReads)) return persisted;
    } else {
      consecutiveMatches = 0;
    }
    if (attempt + 1 < attempts) await wait(delayMs * (attempt + 1));
  }
  const scopes = mismatchedPanelScopes(expectedDraft, persisted).join(", ") || "non determinato";
  throw new Error(`Persistenza non confermata per lo scope: ${scopes}.`);
}

export function effectiveOptionsPanelShared(draft) {
  const normalized = normalizeOptionsPanelDraft(draft);
  return Object.fromEntries(Object.keys(OPTIONS_PANEL_SCENE_FAMILIES).map((family) => {
    const scene = normalized.scene[family];
    return [family, clone(scene.mode === "override"
      ? scene.value
      : normalized.room[family])];
  }));
}
