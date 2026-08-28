import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildOptionsPanelPatches,
  effectiveOptionsPanelShared,
  normalizeOptionsPanelDraft,
  saveOptionsPanelDraft,
  verifyOptionsPanelDraft,
} from "../src/options/optionsPanelCore.js";
import { resolveOptions } from "../src/options/optionsResolve.js";
import { selectOptionsPanelModel } from "../src/options/optionsSelectors.js";

test("OPTIONS-003: il selector del pannello espone i gruppi senza metadata grezzi", () => {
  const model = selectOptionsPanelModel(resolveOptions({
    local: { tracker: { layout: "compact", followActiveTurn: false } },
    room: {
      uiSync: { trackerOpen: false },
      integrations: { embersAnimations: false },
      turn: { popup: false, directReminderResolution: "informational" },
    },
    scene: {
      overrides: {
        "turn.popup": { mode: "override", value: true },
        "playerView.hp": { mode: "inherit" },
      },
    },
  }));

  assert.deepEqual(model.local, {
    layout: "compact",
    followActiveTurn: false,
    combatLog: true,
  });
  assert.equal(model.room.trackerOpen, false);
  assert.equal(model.room.knownFactionAssignment, true);
  assert.equal(model.room.embersAnimations, false);
  assert.equal(model.room.popup, false);
  assert.equal(model.room.directResolution, "informational");
  assert.deepEqual(model.scene.popup, { mode: "override", value: true });
  assert.equal(model.scene.hp.mode, "inherit");
  assert.deepEqual(Object.keys(model.room).sort(), [
    "activeTurnLabel", "directResolution", "effects", "embersAnimations", "hp", "knownFactionAssignment", "movementReminder", "popup", "reminders", "summaryParts", "trackerOpen",
  ]);
  assert.deepEqual(Object.keys(model.scene).sort(), [
    "activeTurnLabel", "directResolution", "effects", "hp", "movementReminder", "popup", "reminders", "summaryParts",
  ]);
});

test("OPTIONS-003: il draft normalizza dati parziali e produce sole patch approvate", () => {
  const draft = normalizeOptionsPanelDraft({
    local: { layout: "invalid", followActiveTurn: "yes" },
    room: { popup: false, trackerOpen: false, unrelated: "drop" },
    scene: {
      popup: { mode: "override", value: true },
      effects: { mode: "invalid", value: { conditions: "hidden" } },
    },
  });
  const patches = buildOptionsPanelPatches(draft);

  assert.deepEqual(draft.local, {
    layout: "classic",
    followActiveTurn: true,
    combatLog: true,
  });
  assert.equal(patches.room.turn.popup, false);
  assert.equal(patches.room.automation.knownFactionAssignment, true);
  assert.equal(patches.room.integrations.embersAnimations, true);
  assert.equal(patches.room.uiSync.trackerOpen, false);
  assert.equal(Object.hasOwn(patches.room, "unrelated"), false);
  assert.deepEqual(patches.scene.overrides["turn.popup"], { mode: "override", value: true });
  assert.deepEqual(patches.scene.overrides["playerView.effects"], { mode: "inherit" });
  assert.deepEqual(Object.keys(patches.scene.overrides).sort(), [
    "map.activeTurnLabel",
    "playerView.effects",
    "playerView.hp",
    "playerView.reminders",
    "turn.directReminderResolution",
    "turn.movementReminder",
    "turn.popup",
    "uiSync.showEffectSummaryParts",
  ]);
});

test("OPTIONS-004: il Combat Log locale può essere disattivato senza cambiare gli scope condivisi", () => {
  const draft = normalizeOptionsPanelDraft({ local: { combatLog: false } });
  const patches = buildOptionsPanelPatches(draft);

  assert.equal(draft.local.combatLog, false);
  assert.deepEqual(patches.local.runtime, { combatLog: false });
  assert.equal(Object.hasOwn(patches, "room"), true);
  assert.equal(Object.hasOwn(patches, "scene"), true);
});

test("OPTIONS-003: automatic faction assignment is saved in Room", () => {
  const draft = normalizeOptionsPanelDraft({
    room: { knownFactionAssignment: false },
  });
  const patches = buildOptionsPanelPatches(draft);

  assert.equal(draft.room.knownFactionAssignment, false);
  assert.deepEqual(patches.room.automation, { knownFactionAssignment: false });
});

test("OPTIONS-004: le animazioni Embers sono salvate come policy Room", () => {
  const draft = normalizeOptionsPanelDraft({
    room: { embersAnimations: false },
  });
  const patches = buildOptionsPanelPatches(draft);

  assert.equal(draft.room.embersAnimations, false);
  assert.deepEqual(patches.room.integrations, { embersAnimations: false });
});

test("OPTIONS-003: inherit usa Room nell'anteprima e override usa il valore scena", () => {
  const draft = normalizeOptionsPanelDraft({
    room: { popup: false, activeTurnLabel: true },
    scene: {
      popup: { mode: "inherit" },
      activeTurnLabel: { mode: "override", value: false },
    },
  });
  const effective = effectiveOptionsPanelShared(draft);
  assert.equal(effective.popup, false);
  assert.equal(effective.activeTurnLabel, false);
});

test("OPTIONS-003: il salvataggio conserva unknown Room, scena e override entry", async () => {
  const state = {
    local: { futureLocal: true },
    room: {
      futureRoom: { keep: true },
      playerView: { futurePlayer: 7 },
      turn: { futureTurn: "keep" },
      map: {},
      uiSync: {},
    },
    scene: {
      futureScene: true,
      overrides: {
        "turn.popup": { mode: "override", value: false, futureEntry: "keep" },
        "future.module": { mode: "override", value: 42 },
      },
    },
  };
  const service = {
    async updateLocal(updater) { state.local = updater(state.local); },
    async updateRoom(updater) { state.room = updater(state.room); },
    async updateScene(updater) { state.scene = updater(state.scene); },
  };
  await saveOptionsPanelDraft(service, normalizeOptionsPanelDraft({
    room: { popup: true },
    scene: { popup: { mode: "inherit" } },
  }));

  assert.deepEqual(state.room.futureRoom, { keep: true });
  assert.equal(state.room.playerView.futurePlayer, 7);
  assert.equal(state.room.turn.futureTurn, "keep");
  assert.equal(state.scene.futureScene, true);
  assert.deepEqual(state.scene.overrides["future.module"], { mode: "override", value: 42 });
  assert.equal(state.scene.overrides["turn.popup"].futureEntry, "keep");
  assert.equal(state.scene.overrides["turn.popup"].mode, "inherit");
});

test("OPTIONS-003: il pannello usa selector e writer, non storage o metadata diretti", () => {
  const source = readFileSync(new URL("../src/options-modal.js", import.meta.url), "utf8");
  const html = readFileSync(new URL("../options-modal.html", import.meta.url), "utf8");
  const css = readFileSync(new URL("../public/options-modal.css", import.meta.url), "utf8");
  const glassCss = readFileSync(new URL("../public/popover-glass.css", import.meta.url), "utf8");
  const tracker = readFileSync(new URL("../src/initiativeList.js", import.meta.url), "utf8");
  const syncOpen = readFileSync(new URL("../src/sync-open.js", import.meta.url), "utf8");

  assert.match(source, /selectOptionsPanelModel/);
  assert.match(source, /saveOptionsPanelDraft/);
  assert.match(source, /broadcastRuntimeOptionsInvalidation/);
  assert.doesNotMatch(source, /localStorage|\.getMetadata\(|\.setMetadata\(/);
  assert.match(html, /Anteprima Player/);
  assert.match(html, /Automazioni e integrazioni/);
  assert.match(html, /turn-options-grid/);
  assert.match(html, /option-card-actions inline/);
  assert.match(html, /data-room-section/);
  assert.match(html, /data-scope="room"/);
  assert.match(html, /data-scope="scene"/);
  assert.match(html, /data-local="combatLog"/);
  assert.doesNotMatch(html, /section-index|data-preview-index/);
  assert.doesNotMatch(html, /data-local="(?:layout|followActiveTurn)"/);
  assert.match(html, /data-room="knownFactionAssignment"/);
  assert.match(html, /data-room="embersAnimations"/);
  assert.match(html, /Animazioni Embers/);
  assert.match(html, /Riproduci animazioni/);
  assert.match(html, /Fazioni automatiche/);
  assert.match(html, /Eredita/);
  assert.match(tracker, /options-modal\.html/);
  assert.match(tracker, /data-options-panel/);
  assert.doesNotMatch(tracker, /data-faction-configurator/);
  assert.match(syncOpen, /selectTrackerOpenSyncEnabled/);
  assert.match(source, /inactiveReminderDetail/);
  assert.match(source, /reminderHasDetails/);
  assert.match(source, /Disponibile solo con Contenuto: Completo/);
  assert.match(html, /class="glass-shell" data-glass-popover="1"/);
  assert.match(html, /<main id="options-app" class="panel">/);
  assert.match(html, /popover-glass\.css/);
  assert.doesNotMatch(css, /color-scheme\s*:/);
  assert.doesNotMatch(css, /--options-smoked-glass|#options-app[^}]*background/);
  assert.match(css, /\.options-section\s*\{[^}]*background:\s*transparent/);
  assert.match(glassCss, /\[data-glass-popover="1"\]/);
  assert.match(glassCss, /backdrop-filter:\s*blur\(18px\)/);
});

test("OPTIONS-003: l'invalidazione non rilegge lo snapshot nell'iframe che salva", () => {
  const runtime = readFileSync(new URL("../src/options/optionsRuntime.js", import.meta.url), "utf8");

  assert.match(runtime, /sourceInstanceId:\s*runtimeInstanceId/);
  assert.match(runtime, /event\.data\.sourceInstanceId === runtimeInstanceId/);
  assert.match(runtime, /refreshOptionsUntilRevision/);
  assert.match(runtime, /revision,\s*sourceInstanceId/);
  assert.match(runtime, /destination:\s*"ALL"/);
});

test("OPTIONS-003: il pannello conferma il salvataggio solo dopo il read-back persistito", async () => {
  const expected = normalizeOptionsPanelDraft({
    room: { popup: false },
    scene: { popup: { mode: "inherit" } },
  });
  const stale = normalizeOptionsPanelDraft({ room: { popup: true } });
  let reads = 0;
  const service = {
    async readPersisted(selector) {
      reads += 1;
      const current = reads < 2 ? stale : expected;
      return selector(resolveOptions(buildOptionsPanelPatches(current)));
    },
  };

  const persisted = await verifyOptionsPanelDraft(service, expected, {
    attempts: 3,
    delayMs: 0,
    stableReads: 1,
    wait: async () => {},
  });
  assert.equal(reads, 2);
  assert.equal(persisted.room.popup, false);
});

test("OPTIONS-003: un read-back divergente non produce un falso successo", async () => {
  const expected = normalizeOptionsPanelDraft({ room: { popup: false } });
  const stale = normalizeOptionsPanelDraft({ room: { popup: true } });
  const service = {
    async readPersisted(selector) {
      return selector(resolveOptions(buildOptionsPanelPatches(stale)));
    },
  };

  await assert.rejects(
    verifyOptionsPanelDraft(service, expected, {
      attempts: 2,
      delayMs: 0,
      wait: async () => {},
    }),
    /Persistenza non confermata per lo scope: Room/,
  );
});

test("OPTIONS-003: la conferma richiede due letture persistite consecutive", async () => {
  const expected = normalizeOptionsPanelDraft({ room: { popup: false } });
  const stale = normalizeOptionsPanelDraft({ room: { popup: true } });
  const sequence = [expected, stale, expected, expected];
  let reads = 0;
  const service = {
    async readPersisted(selector) {
      const current = sequence[Math.min(reads, sequence.length - 1)];
      reads += 1;
      return selector(resolveOptions(buildOptionsPanelPatches(current)));
    },
  };

  const persisted = await verifyOptionsPanelDraft(service, expected, {
    attempts: 4,
    delayMs: 0,
    stableReads: 2,
    wait: async () => {},
  });

  assert.equal(reads, 4);
  assert.equal(persisted.room.popup, false);
});
