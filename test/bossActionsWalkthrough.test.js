// End-to-end GM walkthrough: real popover controller + real runtime, coordinator and History over a simulated SDK.
import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { readFile } from "node:fs/promises";
import { createVersionedIndexedDB, versionedKeyRange } from "../test-support/fakeVersionedIndexedDb.js";
import { createBossActionsDocument, textOf, createMemorySessionStorage } from "../test-support/fakeBossActionsDom.js";

globalThis.indexedDB = createVersionedIndexedDB();
globalThis.IDBKeyRange = versionedKeyRange;
globalThis.location = { pathname: "/background.html", search: "" };
globalThis.sessionStorage = createMemorySessionStorage();

const META = "com.thebigpicture.initiative/meta";
const STATE = "com.thebigpicture.initiative/state";
const HISTORY_KEY = "com.thebigpicture.initiative/history";
const clone = (value) => structuredClone(value);
let sceneItems = [], sceneMetadata = {}, roomMetadata = {}, selection = [], sequence = 0;
const broadcast = new Map();
const live = { player: new Set(), meta: new Set(), items: new Set() };
const subscribe = (set, listener) => { set.add(listener); return () => set.delete(listener); };
const notify = (set, value) => { for (const listener of [...set]) listener(clone(value)); };
const sdk = {
  onReady() {},
  player: { getRole: async () => "GM", getSelection: async () => clone(selection), onChange: (listener) => subscribe(live.player, listener) },
  room: { id: "walkthrough", getMetadata: async () => clone(roomMetadata),
    setMetadata: async (u) => { roomMetadata = { ...roomMetadata, ...clone(u) }; }, onMetadataChange: () => () => {} },
  scene: {
    isReady: async () => true, onReadyChange: () => () => {},
    getMetadata: async () => clone(sceneMetadata),
    setMetadata: async (u) => { sceneMetadata = { ...sceneMetadata, ...clone(u) }; notify(live.meta, sceneMetadata); },
    onMetadataChange: (listener) => subscribe(live.meta, listener),
    items: {
      getItems: async (ids) => clone(sceneItems.filter((i) => !ids || (typeof ids === "function" ? ids(i) : ids.includes(i.id)))),
      updateItems: async (ids, updater) => {
        const drafts = clone(sceneItems.filter((i) => (typeof ids === "function" ? ids(i) : ids.includes(i.id))));
        updater(drafts); const byId = new Map(drafts.map((i) => [i.id, i]));
        sceneItems = sceneItems.map((i) => byId.get(i.id) || i);
        notify(live.items, sceneItems);
      },
      addItems: async (items) => { sceneItems.push(...clone(items)); notify(live.items, sceneItems); },
      deleteItems: async (ids) => { sceneItems = sceneItems.filter((i) => !ids.includes(i.id)); notify(live.items, sceneItems); },
      onChange: (listener) => subscribe(live.items, listener),
    },
  },
  broadcast: {
    onMessage(channel, listener) { const set = broadcast.get(channel) || new Set(); set.add(listener); broadcast.set(channel, set); return () => set.delete(listener); },
    async sendMessage(channel, data) { for (const listener of [...(broadcast.get(channel) || [])]) await listener({ data: clone(data) }); },
  },
  popover: { open: async () => {}, close: async () => {}, getHeight: async () => 500, setHeight: async () => {} },
};
mock.module("@owlbear-rodeo/sdk", { exports: { default: sdk, buildLabel() {}, buildImage() {}, buildText() {}, buildPath() {}, buildShape() {}, Command: class {} } });

const effects = await import("../src/effectsMutations.js");
const history = await import("../src/history.js");
const historyOwner = await import("../src/historyOwner.js");
const { currentSceneEpoch, markSceneEpochReady } = await import("../src/sceneEpoch.js");
const { createBossActionRuntime } = await import("../src/bossActionExecution.js");
const { createBossActionProfileStore } = await import("../src/bossActionProfileStore.js");
const { combatEventFromHistoryEntryV3 } = await import("../src/combatLogV3Core.js");
const { bootBossActions, defaultBossActionUndo } = await import("../src/boss-actions.js");
const { buildConeArea, areaHitsBounds } = await import("../src/aoeGeometryCore.js");
const { getSpellAreaRuleById } = await import("../src/spellAreaRules.js");

// Stand-in for the shared map tool: same cone geometry and hit test, tracked creatures only, origin token excluded.
let nextCone = null;
async function simulatedConePlacement(request) {
  const rule = getSpellAreaRuleById(request.ruleId);
  if (!rule || !nextCone) return { status: "cancelled" };
  const dpi = 150, cells = Math.round(rule.geometry.size.value / 1.5);
  const end = { x: nextCone.origin.x + nextCone.direction.x * cells * dpi, y: nextCone.origin.y + nextCone.direction.y * cells * dpi };
  const area = buildConeArea(nextCone.origin, end, dpi);
  const targetIds = sceneItems
    .filter((item) => item.layer === "CHARACTER" && item.metadata?.[META]?.inInitiative && item.id !== request.casterId)
    .filter((item) => areaHitsBounds(area, { min: { x: item.position.x - 75, y: item.position.y - 75 }, max: { x: item.position.x + 75, y: item.position.y + 75 } }))
    .map((item) => item.id);
  return { status: "confirmed", preview: { start: nextCone.origin, end, targetIds } };
}

const memory = new Map();
const store = createBossActionProfileStore({ storage: { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v) } });
const meta = (id) => sceneItems.find((i) => i.id === id).metadata[META];
const creature = (id, name, hp, extra = {}) => ({ id, name, type: "IMAGE", layer: "CHARACTER", position: { x: 0, y: 0 }, metadata: { [META]: { hp, hpMax: hp, inInitiative: true, ...extra } } });
const settle = async () => { for (let i = 0; i < 4; i += 1) await new Promise((resolve) => setTimeout(resolve, 5)); };

async function popover() {
  const doc = createBossActionsDocument();
  const runtime = createBossActionRuntime({ api: sdk, store, postDamage: async () => [] });
  const controller = bootBossActions(doc, { api: sdk, store, runtime, sourceId: "auril", schedule: (callback) => setTimeout(callback, 0),
    undo: (entryId) => defaultBossActionUndo(entryId, { epoch: currentSceneEpoch() }), placeArea: simulatedConePlacement });
  await controller.ready; await settle();
  const $ = (id) => doc.getElementById(id);
  const ui = {
    doc, controller, $,
    status: () => $("boss-status").textContent,
    row: (name) => $("boss-abilities").querySelectorAll("button").find((b) => b.dataset.actionId && controller.getPresentation().profile.abilities.find((a) => a.id === b.dataset.actionId)?.name === name),
    form: () => $("boss-resolution").querySelector("#boss-action-form"),
    apply: () => $("boss-resolution").querySelector("#boss-apply"),
    target: () => $("boss-target-name")?.textContent,
    async open(name) { await ui.row(name).click(); await settle(); },
    async importFile(name) {
      const content = await readFile(new URL("./fixtures/boss-actions/" + name, import.meta.url), "utf8");
      $("boss-file").files = [{ name, text: async () => content }];
      await $("boss-import").click();
    },
    async bind(index) { $("boss-profile").value = String(index); await $("boss-bind").click(); await settle(); },
    async choose(outcome) { await $("boss-resolution").querySelector(`[data-outcome="${outcome}"]`).click(); },
    async amount(id, value) { const input = $("boss-resolution").querySelector(`[data-component-id="${id}"]`); input.value = String(value); await input.emit("input"); },
    async confirm() { const input = $("boss-manual-confirmed"); input.checked = true; await input.emit("change"); },
    async submit() { await ui.form().emit("submit"); await settle(); },
  };
  return ui;
}
async function select(ids) { selection = [...ids]; notify(live.player, { selection }); await settle(); }
const bossEntries = async () => (await history.getHistoryEntries()).filter((e) => e.kind === "monster-action");

test.beforeEach(async () => {
  effects.unmountEffectsMutationCoordinatorService(); historyOwner.unmountHistoryOwner();
  sdk.room.id = `walkthrough-${++sequence}`; memory.clear(); selection = []; globalThis.sessionStorage.clear();
  sceneItems = [creature("auril", "Auril", 580, { epic: true }), creature("dars", "Dars", 60), creature("mira", "Mira", 45),
    { id: "auril-bar", type: "SHAPE", layer: "ATTACHMENT", attachedTo: "auril", metadata: {} }];
  sceneMetadata = { [STATE]: { round: 1, order: ["auril", "dars", "mira"], current: 0 }, [HISTORY_KEY]: { version: 1, roomId: sdk.room.id, entries: [] } };
  roomMetadata = {}; markSceneEpochReady("walkthrough");
  await historyOwner.mountHistoryOwner(); await effects.mountEffectsMutationCoordinatorService();
});
test.after(() => { effects.unmountEffectsMutationCoordinatorService(); historyOwner.unmountHistoryOwner(); });

test("phase 2: Icekiss with the selected creature is three interactions and Undo from the console restores HP", async () => {
  const ui = await popover();
  await ui.importFile("auril-phase-2.html"); await ui.bind(0);
  assert.equal(ui.controller.getPresentation().profile.profileVersion, 22);
  await select(["auril-bar", "mira"]);
  await ui.open("Icekiss +2");                 // 1
  assert.equal(ui.target(), "Mira");
  await ui.choose("hit");                      // 2
  await ui.submit();                           // 3
  assert.equal(meta("mira").hp, 20);
  assert.match(ui.status(), /Mira · colpito · 25 danni \(taglienti 18 \+ freddo 7\) · PF 45 → 20\/45/);
  const [entry] = await bossEntries();
  assert.deepEqual(entry.payload.damageComponents.map((c) => [c.type, c.amount]), [["slashing", 18], ["cold", 7]]);
  const event = combatEventFromHistoryEntryV3(entry);
  assert.equal(event.provenance.actor.tokenId, "auril");
  assert.equal(event.provenance.cause.actionName, "Icekiss +2");
  assert.equal(ui.$("boss-undo").hidden, false);
  await ui.$("boss-undo").click(); await settle();
  assert.equal(meta("mira").hp, 45);
  assert.match(ui.status(), /annullata/);
  ui.controller.destroy();
});

test("phase 3: Blizzard is three interactions, consumes 1/round with the damage and refreshes the badge without Aggiorna", async () => {
  const ui = await popover();
  await ui.importFile("auril-phase-3.html"); await ui.bind(0);
  await select(["dars"]);
  await ui.open("Blizzard Strike"); await ui.choose("failed"); await ui.submit();
  assert.equal(meta("dars").hp, 42);
  assert.match(ui.status(), /TS fallito · 18 danni \(contundenti 9 \+ freddo 9\).*uso 1\/1 nel round 1/s);
  assert.match(textOf(ui.row("Blizzard Strike")), /Esaurita/);
  await sdk.scene.setMetadata({ [STATE]: { ...sceneMetadata[STATE], round: 2 } }); await settle();
  assert.match(textOf(ui.row("Blizzard Strike")), /1\/1 round/, "round change refreshes availability locally");
  assert.match(ui.$("boss-phase").textContent, /Round 2/);
  ui.controller.destroy();
});

test("phase 2: Rock requires the prerequisite, Slow opens the spell workflow without consuming", async () => {
  const opened = [];
  const open = sdk.popover.open; sdk.popover.open = async (options) => { opened.push(options); };
  try {
    const ui = await popover();
    await ui.importFile("auril-phase-2.html"); await ui.bind(0);
    await select(["dars"]);
    // v20: Rock only in the round of Gather the Winter Sky, read from the round log.
    await ui.open("Rock"); await ui.choose("hit");
    assert.equal(ui.apply().disabled, true);
    assert.match(ui.$("boss-apply-hint").textContent, /Rock richiede Gather the Winter Sky nello stesso round/);
    await ui.submit(); assert.equal(meta("dars").hp, 60);
    await ui.$("boss-back").click(); await settle();
    await ui.open("Gather the Winter Sky"); await ui.confirm();
    await ui.$("boss-resolution").querySelector("#boss-register").click(); await settle();
    await ui.open("Rock"); await ui.choose("hit");
    assert.equal(ui.$("boss-manual-confirmed"), null, "no prerequisite to tick");
    await ui.submit();
    assert.equal(meta("dars").hp, 31);
    // During Gather the Winter Sky only the listed actions: Spellcasting waits for the next round.
    assert.match(textOf(ui.row("Spellcasting")), /Bloccata/);
    await sdk.scene.setMetadata({ [STATE]: { ...sceneMetadata[STATE], round: 2 } }); await settle();
    await ui.open("Spellcasting");
    await ui.$("boss-resolution").querySelector("#boss-cast-slow").click(); await settle();
    assert.match(opened[0].url, /spell-unified-panel\.html\?.*monster-action/);
    await ui.$("boss-resolution").querySelector("#boss-cast-freezing-sphere").click(); await settle();
    assert.match(opened[1].url, /spellId=freezing-sphere/);
    assert.match(textOf(ui.$("boss-resolution")), /1\/1 round/);
    assert.equal((await bossEntries()).length, 2, "Gather the Winter Sky and Rock");
    ui.controller.destroy();
  } finally { sdk.popover.open = open; }
});

test("phase 3: Polar Ray keeps components separate; the locked draft never moves to a newly selected creature", async () => {
  const ui = await popover();
  await ui.importFile("auril-phase-3.html"); await ui.bind(0);
  await select(["dars"]);
  await ui.open("Polar Ray"); await ui.choose("hit"); await ui.amount("cold", 12);
  await select(["mira"]);
  assert.equal(ui.target(), "Dars");
  await ui.submit();
  assert.equal(meta("dars").hp, 38); assert.equal(meta("mira").hp, 45);
  assert.match(ui.status(), /22 danni \(freddo 12 \+ necrotici 10\)/);
  ui.controller.destroy();
});

test("back before commit and a removed target never mutate", async () => {
  const ui = await popover();
  await ui.importFile("auril-phase-3.html"); await ui.bind(0);
  await select(["mira"]);
  await ui.open("Blizzard Strike"); await ui.choose("failed");
  await ui.$("boss-back").click(); await settle();
  assert.equal((await bossEntries()).length, 0);
  assert.match(textOf(ui.row("Blizzard Strike")), /1\/1 round/);
  await ui.open("Polar Ray"); await ui.choose("hit");
  await sdk.scene.items.updateItems(["mira"], (items) => { items[0].metadata[META].inInitiative = false; }); await settle();
  assert.equal(ui.apply().disabled, true, "a target removed from the tracker blocks Applica");
  await ui.submit();
  assert.equal(meta("mira").hp, 45); assert.equal((await bossEntries()).length, 0);
  ui.controller.destroy();
});

test("export, fresh browser storage and reload restore the bound definition", async () => {
  const ui = await popover();
  await ui.importFile("auril-phase-3.html"); await ui.bind(0);
  const profile = ui.controller.getPresentation().profile;
  const json = store.exportProfile(profile.profileId, profile.profileRevision);
  ui.controller.destroy();
  memory.clear();
  const reopened = await popover();
  assert.equal(reopened.$("boss-manage-view").hidden, false);
  assert.match(textOf(reopened.$("boss-abilities")), /Definizione non presente/);
  reopened.$("boss-file").files = [{ name: "auril.json", text: async () => json }];
  await reopened.$("boss-import").click(); await settle();
  assert.equal(reopened.controller.getPresentation().profile.profileRevision, profile.profileRevision);
  assert.ok(reopened.row("Polar Ray"));
  reopened.controller.destroy();
});

test("phase 2: Breathe Deep opens the round, Breath closes it in the last slot — real cone, saves, damage, one console Undo", async () => {
  // Origin at (0,0) pointing east: 60 ft = 12 cells. Lyra stands behind the origin, outside the cone.
  const place = (item, x, y) => ({ ...item, position: { x, y } });
  sceneItems = sceneItems.map((item) => item.id === "dars" ? place(item, 450, 0) : item.id === "mira" ? place(item, 1200, 300) : item.id === "auril" ? place(item, -300, 0) : item);
  sceneItems.push(place(creature("sera", "Sera", 38), 1500, -500), place(creature("lyra", "Lyra", 30), -900, 0));
  nextCone = { origin: { x: 0, y: 0 }, direction: { x: 1, y: 0 } };
  // Dars, Mira and Sera are the characters: three Epic Action slots. The round starts after Dars's turn.
  for (const item of sceneItems) if (["dars", "mira", "sera"].includes(item.id)) item.metadata[META].attitude = "pc";
  sceneMetadata[STATE] = { ...sceneMetadata[STATE], order: ["auril", "dars", "__EPIC__:auril:1", "mira", "sera", "__EPIC__:auril:2"], current: 1 };
  const ui = await popover();
  await ui.importFile("auril-phase-2.html"); await ui.bind(0);
  assert.match(ui.$("boss-phase").textContent, /Azione Epica 1\/3/);
  // Breath waits for Breathe Deep in the same round.
  await ui.open("Breath of the Long Night");
  assert.match(ui.$("boss-apply-hint").textContent, /richiede Breathe Deep nello stesso round/);
  await ui.$("boss-back").click(); await settle();
  await ui.open("Breathe Deep"); await ui.confirm();
  await ui.$("boss-resolution").querySelector("#boss-register").click(); await settle();
  assert.deepEqual(ui.controller.getPresentation().sequence.log, ["breathe-deep"]);
  // A second first Epic Action in the same round is refused.
  assert.match(textOf(ui.row("Gather the Winter Sky")), /Bloccata/);
  // The turn moves to the end of Sera's: the last slot of the round.
  await sdk.scene.setMetadata({ [STATE]: { ...sceneMetadata[STATE], current: 5 } }); await settle();
  assert.match(ui.$("boss-phase").textContent, /Azione Epica 3\/3 \(ultima\)/);
  await select(["lyra"]);
  await ui.open("Breath of the Long Night");
  const rows = () => ui.$("boss-group-targets").querySelectorAll("[data-target-id]");
  assert.equal(rows().length, 0, "no group before drawing");
  assert.equal(ui.$("boss-manual-confirmed"), null, "no recharge to tick: it comes from the round log");
  assert.equal(ui.$("boss-sequence-confirmed"), null, "the last slot needs no confirmation");
  await ui.$("boss-draw-area").click(); await settle();
  assert.deepEqual(rows().map((row) => row.dataset.targetId), ["dars", "mira", "sera"], "hits from the real cone geometry");
  const choose = async (id, value) => { await rows().find((row) => row.dataset.targetId === id).querySelector(`[data-group-outcome="${value}"]`).click(); };
  await choose("dars", "failed"); await choose("mira", "failed"); await choose("sera", "passed");
  await select(["mira"]);
  await ui.submit();
  assert.equal(meta("dars").hp, 14); assert.equal(meta("mira").hp, 0); assert.equal(meta("sera").hp, 16);
  const blinded = (id) => (meta(id).conditions?.instances || []).filter((entry) => entry.condition === "Accecato");
  assert.equal(blinded("dars").length, 1); assert.equal(blinded("mira").length, 1); assert.equal(blinded("sera").length, 0);
  assert.equal(meta("lyra").hp, 30);
  assert.equal((await bossEntries()).length, 2, "Breathe Deep and Breath");
  assert.equal((await bossEntries())[1].payload.causality.area.verification, "placed");
  assert.match(ui.status(), /Dars · TS fallito · 46 danni · PF 60 → 14 · Accecato/);
  assert.match(ui.status(), /Sera · TS superato · 22 danni · PF 38 → 16/);
  assert.equal(ui.$("boss-undo").hidden, false);
  await ui.$("boss-undo").click(); await settle();
  assert.equal(meta("dars").hp, 60); assert.equal(meta("mira").hp, 45); assert.equal(meta("sera").hp, 38);
  for (const id of ["dars", "mira", "sera"]) assert.equal(blinded(id).length, 0, id);
  assert.deepEqual(meta("auril").bossActionState.epicLog, { round: 1, actionIds: ["breathe-deep"] }, "Undo keeps Breathe Deep");
  ui.controller.destroy();
});

test("regression: the single-target actions still resolve after the group pipeline", async () => {
  const ui = await popover();
  await ui.importFile("auril-phase-2.html"); await ui.bind(0);
  await select(["dars"]);
  await ui.open("Icekiss +2"); await ui.choose("miss"); await ui.submit();
  assert.equal(meta("dars").hp, 60);
  assert.equal((await bossEntries()).length, 1);
  ui.controller.destroy();
});
