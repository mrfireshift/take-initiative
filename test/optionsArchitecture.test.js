import assert from "node:assert/strict";
import test from "node:test";
import {
  createDefaultLocalOptions,
  createDefaultRoomOptions,
  createDefaultSceneOptions,
} from "../src/options/optionsDefaults.js";
import {
  compactRoomOptionsForStorage,
  compactSceneOptionsForStorage,
  mergeOptionsDocuments,
  normalizeLocalOptions,
  normalizeRoomOptions,
  normalizeSceneOptions,
} from "../src/options/optionsNormalize.js";
import { resolveOptions } from "../src/options/optionsResolve.js";
import {
  selectActiveTurnLabelEnabled,
  selectEmbersAnimationsEnabled,
  selectEffectsDisplayMode,
  selectFollowActiveTurn,
  selectMapHpBarsEnabled,
  selectPlayerHpVisibility,
  selectSceneOverriddenPaths,
  selectTrackerLayout,
  selectTurnPopupEnabled,
} from "../src/options/optionsSelectors.js";

test("OPTIONS-001: i default versionati riproducono il comportamento legacy", () => {
  const local = createDefaultLocalOptions();
  const room = createDefaultRoomOptions();
  const scene = createDefaultSceneOptions();

  assert.deepEqual(local, {
    version: 1,
    updatedAt: 0,
    tracker: {
      layout: "classic",
      followActiveTurn: true,
      toolbarPreset: "full",
      effectsDisplayMode: "selected",
    },
    windows: { clocksCompact: false },
    tools: { distance3d: true, reference: true },
    runtime: { combatLog: true },
  });
  assert.deepEqual(room.playerView.hp.trackerClassic, {
    pc: "exact", ally: "exact", neutral: "hidden", enemy: "hidden",
  });
  assert.deepEqual(room.playerView.hp.trackerCompact, {
    pc: "exact", ally: "hidden", neutral: "hidden", enemy: "hidden",
  });
  assert.deepEqual(room.playerView.hp.map, {
    pc: "exact", ally: "exact", neutral: "hidden", enemy: "hidden",
  });
  assert.deepEqual(room.playerView.effects, {
    conditions: "all", spells: "all", concentration: "all",
  });
  assert.deepEqual(room.playerView.reminders, {
    visibility: "full", showDc: true, showCaster: true,
  });
  assert.equal(room.playerView.bossDetails, "full");
  assert.deepEqual(room.turn, {
    popup: true,
    directReminderResolution: "assisted",
    movementReminder: true,
  });
  assert.deepEqual(room.map, {
    hpBars: true, effectLabels: true, activeTurnLabel: true, elevationLabels: true,
  });
  assert.equal(room.tools.clocks, true);
  assert.equal(room.automation.knownFactionAssignment, true);
  assert.equal(room.integrations.embersAnimations, true);
  assert.deepEqual(room.uiSync, {
    trackerOpen: true,
    effectsDisplayMode: "selected",
  });
  assert.ok(Object.values(scene.overrides).every((entry) => entry.mode === "inherit"));
});

test("OPTIONS-001: normalizza input mancanti, corrotti e parziali senza perdere unknown", () => {
  assert.deepEqual(normalizeLocalOptions("corrotto"), createDefaultLocalOptions());
  assert.deepEqual(normalizeRoomOptions(["non", "valido"]), createDefaultRoomOptions());
  assert.deepEqual(normalizeSceneOptions(false), createDefaultSceneOptions());

  const room = normalizeRoomOptions({
    version: 7,
    futureTopLevel: { keep: true },
    playerView: {
      futurePlayerPolicy: "keep",
      hp: {
        trackerClassic: { pc: "status", futureFaction: "keep" },
      },
    },
    turn: { popup: false, futureTurn: 42 },
    map: { hpBars: "invalid", futureMap: true },
  });
  assert.equal(room.version, 7);
  assert.deepEqual(room.futureTopLevel, { keep: true });
  assert.equal(room.playerView.futurePlayerPolicy, "keep");
  assert.equal(room.playerView.hp.trackerClassic.pc, "status");
  assert.equal(room.playerView.hp.trackerClassic.ally, "exact");
  assert.equal(room.playerView.hp.trackerClassic.futureFaction, "keep");
  assert.equal(room.turn.popup, false);
  assert.equal(room.turn.futureTurn, 42);
  assert.equal(room.map.hpBars, true);
  assert.equal(room.map.futureMap, true);

  const integrations = normalizeRoomOptions({
    integrations: { embersAnimations: false, futureIntegration: "keep" },
  });
  assert.equal(integrations.integrations.embersAnimations, false);
  assert.equal(integrations.integrations.futureIntegration, "keep");

  const scene = normalizeSceneOptions({
    futureTopLevel: true,
    overrides: {
      "turn.popup": { mode: "override", value: false, futureEntry: "keep" },
      "future.module": { mode: "override", value: 123 },
    },
  });
  assert.equal(scene.futureTopLevel, true);
  assert.deepEqual(scene.overrides["turn.popup"], {
    mode: "override", value: false, futureEntry: "keep",
  });
  assert.deepEqual(scene.overrides["future.module"], { mode: "override", value: 123 });
});

test("OPTIONS-001: il merge conserva unknown e ignora undefined come cancellazione", () => {
  const merged = mergeOptionsDocuments({
    future: { keep: 1, nested: { a: true } },
    turn: { popup: true },
  }, {
    future: { nested: { b: true } },
    turn: { popup: false, ignored: undefined },
  });
  assert.deepEqual(merged, {
    future: { keep: 1, nested: { a: true, b: true } },
    turn: { popup: false },
  });
});

test("OPTIONS-003: la persistenza compatta omette i default e conserva gli unknown", () => {
  const room = compactRoomOptionsForStorage({
    version: 3,
    updatedAt: 123,
    futureRoot: { keep: true },
    playerView: {
      futurePlayer: "keep",
      hp: { trackerClassic: { enemy: "exact" } },
    },
  });
  const scene = compactSceneOptionsForStorage({
    updatedAt: 456,
    futureScene: true,
    overrides: {
      "turn.popup": { mode: "inherit" },
      "playerView.hp": { mode: "override", value: { trackerClassic: { enemy: "exact" } } },
      "future.module": { mode: "override", value: 42 },
    },
  });

  assert.equal(room.version, 3);
  assert.equal(room.updatedAt, 123);
  assert.deepEqual(room.futureRoot, { keep: true });
  assert.equal(room.playerView.futurePlayer, "keep");
  assert.equal(room.playerView.hp.trackerClassic.enemy, "exact");
  assert.equal(Object.hasOwn(room.turn || {}, "popup"), false);
  assert.equal(scene.updatedAt, 456);
  assert.equal(Object.hasOwn(scene.overrides, "turn.popup"), false);
  assert.equal(scene.overrides["playerView.hp"].mode, "override");
  assert.deepEqual(scene.overrides["future.module"], { mode: "override", value: 42 });
  assert.equal(normalizeRoomOptions(room).playerView.hp.trackerClassic.enemy, "exact");
  assert.equal(normalizeSceneOptions(scene).overrides["playerView.hp"].mode, "override");
});

test("OPTIONS-001: la precedenza è default, Room, override scena e locale solo locale", () => {
  const resolved = resolveOptions({
    local: {
      tracker: { layout: "compact" },
      playerView: { hp: { trackerClassic: { enemy: "exact" } } },
    },
    room: {
      turn: { popup: false },
      map: { hpBars: false, activeTurnLabel: false },
      uiSync: { effectsDisplayMode: "compact" },
      playerView: { hp: { trackerClassic: { enemy: "hidden" } } },
    },
    scene: {
      overrides: {
        "turn.popup": { mode: "override", value: true },
        "map.hpBars": { mode: "inherit" },
        "map.activeTurnLabel": { mode: "override", value: true },
      },
    },
  });

  assert.equal(selectTrackerLayout(resolved), "compact");
  assert.equal(selectTurnPopupEnabled(resolved), true);
  assert.equal(selectMapHpBarsEnabled(resolved), false);
  assert.equal(selectActiveTurnLabelEnabled(resolved), true);
  assert.equal(selectEffectsDisplayMode(resolved), "compact");
  assert.equal(selectPlayerHpVisibility(resolved, {
    surface: "trackerClassic", attitude: "enemy",
  }), "hidden");
  assert.deepEqual(selectSceneOverriddenPaths(resolved), ["turn.popup", "map.activeTurnLabel"]);
  assert.equal(selectEmbersAnimationsEnabled(resolved), true);
});

test("OPTIONS-001: inherit torna alla Room e il fallback legacy locale vale solo se il campo manca", () => {
  const inherited = resolveOptions({
    local: { tracker: { layout: "compact" } },
    legacyLocal: { tracker: { layout: "classic", followActiveTurn: false } },
    room: { turn: { popup: false } },
    scene: { overrides: { "turn.popup": "inherit" } },
  });
  assert.equal(selectTurnPopupEnabled(inherited), false);
  assert.equal(selectTrackerLayout(inherited), "compact");
  assert.equal(selectFollowActiveTurn(inherited), false);

  const explicit = resolveOptions({
    local: { tracker: { followActiveTurn: true } },
    legacyLocal: { tracker: { followActiveTurn: false } },
  });
  assert.equal(selectFollowActiveTurn(explicit), true);

  const corruptedField = resolveOptions({
    local: { tracker: { layout: "non-valido" } },
    legacyLocal: { tracker: { layout: "compact" } },
  });
  assert.equal(selectTrackerLayout(corruptedField), "compact");
});
