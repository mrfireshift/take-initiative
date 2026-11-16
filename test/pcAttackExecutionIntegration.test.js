import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { createVersionedIndexedDB, versionedKeyRange } from "../test-support/fakeVersionedIndexedDb.js";

globalThis.indexedDB = createVersionedIndexedDB();
globalThis.IDBKeyRange = versionedKeyRange;
globalThis.location = { pathname: "/background.html" };

const META_KEY = "com.thebigpicture.initiative/meta";
const HISTORY_KEY = "com.thebigpicture.initiative/history";
const clone = (value) => structuredClone(value);

let sceneItems = [];
let sceneMetadata = {};
let roomMetadata = {};
let role = "GM";
let testSequence = 0;
const broadcastListeners = new Map();

const sdk = {
  onReady() {},
  player: { getRole: async () => role },
  room: {
    id: "pc-attack-room",
    getMetadata: async () => clone(roomMetadata),
    setMetadata: async (update) => { roomMetadata = { ...roomMetadata, ...clone(update) }; },
    onMetadataChange: () => () => {},
  },
  scene: {
    isReady: async () => true,
    onReadyChange: () => () => {},
    grid: { getDpi: async () => 100, getScale: async () => ({ parsed: { multiplier: 5, unit: "ft" } }) },
    // The Embers renderer: the end of a cantrip's pill (Undo, expiry) removes its loop from the local items.
    local: { getItems: async () => [], addItems: async () => {}, updateItems: async () => {}, deleteItems: async () => {}, onChange: () => () => {} },
    getMetadata: async () => clone(sceneMetadata),
    setMetadata: async (update) => { sceneMetadata = { ...sceneMetadata, ...clone(update) }; },
    items: {
      getItems: async (ids) => clone(sceneItems.filter((item) => (
        !ids || (typeof ids === "function" ? ids(item) : ids.includes(item.id))
      ))),
      updateItems: async (ids, updater) => {
        const drafts = clone(sceneItems.filter((item) => (typeof ids === "function" ? ids(item) : ids.includes(item.id))));
        updater(drafts);
        const byId = new Map(drafts.map((item) => [item.id, item]));
        sceneItems = sceneItems.map((item) => byId.get(item.id) || item);
      },
      // A token is one 100 px cell from its position (the grid below: 100 dpi, 5 ft per cell).
      getItemBounds: async (ids) => {
        const item = sceneItems.find((candidate) => candidate.id === ids[0]);
        if (!item) throw new Error("missing item");
        const { x, y } = item.position || { x: 0, y: 0 };
        return { min: { x, y }, max: { x: x + 100, y: y + 100 }, width: 100, height: 100, center: { x: x + 50, y: y + 50 } };
      },
      addItems: async (items) => { sceneItems.push(...clone(items)); },
      deleteItems: async (ids) => { sceneItems = sceneItems.filter((item) => !ids.includes(item.id)); },
      onChange: () => () => {},
    },
  },
  broadcast: {
    onMessage(channel, listener) {
      const listeners = broadcastListeners.get(channel) || new Set();
      listeners.add(listener);
      broadcastListeners.set(channel, listeners);
      return () => listeners.delete(listener);
    },
    async sendMessage(channel, data) {
      for (const listener of [...(broadcastListeners.get(channel) || [])]) await listener({ data: clone(data) });
    },
  },
};

mock.module("@owlbear-rodeo/sdk", {
  exports: { default: sdk, buildLabel() {}, buildImage() {}, buildText() {}, buildPath() {}, buildShape() {}, Command: class {} },
});

const effects = await import("../src/effectsMutations.js");
const history = await import("../src/history.js");
const historyOwner = await import("../src/historyOwner.js");
const { currentSceneEpoch, markSceneEpochReady } = await import("../src/sceneEpoch.js");
const { createPcAttackRuntime } = await import("../src/pcAttackExecution.js");
const { combatEventFromHistoryEntryV3 } = await import("../src/combatLogV3Core.js");

const sword = { id: "holy-sword", label: "Spada sacra", kind: "attack", range: "melee",
  components: [{ type: "slashing", formula: "1d8+3" }, { type: "radiant", formula: "2d8" }] };
const meta = (id) => sceneItems.find((item) => item.id === id).metadata[META_KEY];
let runtime;
let posted;
let visuals;
let baselineCount;

test.beforeEach(async () => {
  effects.unmountEffectsMutationCoordinatorService(); historyOwner.unmountHistoryOwner();
  sdk.room.id = `pc-attack-history-${++testSequence}`;
  role = "GM";
  sceneItems = [
    { id: "aria", name: "Aria", type: "IMAGE", layer: "CHARACTER", position: { x: 0, y: 0 }, metadata: { [META_KEY]: {
      hp: 40, hpMax: 40, inInitiative: true, initiativeCard: { quickActions: [sword] }, untouched: "actor" } } },
    { id: "ghoul", name: "Ghoul", type: "IMAGE", layer: "CHARACTER", position: { x: 40, y: 20 }, metadata: { [META_KEY]: {
      hp: 30, hpMax: 30, inInitiative: true, untouched: "target" } } },
  ];
  sceneMetadata = { ["com.thebigpicture.initiative/state"]: { round: 2, order: ["aria", "ghoul"], current: 0 },
    [HISTORY_KEY]: { version: 1, roomId: sdk.room.id, entries: [] } };
  roomMetadata = {};
  markSceneEpochReady("pc-attack-test");
  await historyOwner.mountHistoryOwner(); await effects.mountEffectsMutationCoordinatorService();
  posted = [];
  visuals = [];
  runtime = createPcAttackRuntime({ api: sdk, postDamage: async (row) => { posted.push(row.change.requested); return []; },
    emitVisual: async (request) => { visuals.push(request); return { sent: true }; } });
  baselineCount = (await history.getHistoryEntries()).length;
});
test.after(() => { effects.unmountEffectsMutationCoordinatorService(); historyOwner.unmountHistoryOwner(); });

async function attack(decisions = {}) {
  const presentation = await runtime.getPcAttackPresentation("aria", "holy-sword");
  return runtime.executePcAttack({ sourceId: "aria", actionId: "holy-sword", targetId: "ghoul", sceneIdentity: presentation.sceneIdentity,
    expectedAction: presentation.action, expectedDefenses: {}, outcome: "hit", componentAmounts: { c1: 8, c2: 9 }, ...decisions });
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const attackEntry = async () => (await history.getHistoryEntries()).find((entry) => entry.kind === "pc-attack");

test("presentation lists the attack and the tracked creatures, never the attacker", async () => {
  const presentation = await runtime.getPcAttackPresentation("aria", "holy-sword");
  assert.equal(presentation.action.label, "Spada sacra");
  assert.deepEqual(presentation.action.components.map((c) => c.id), ["c1", "c2"]);
  assert.deepEqual(presentation.targets.map((item) => item.id), ["ghoul"]);
  assert.equal(presentation.actionId, "holy-sword");
  assert.deepEqual(presentation.picker.map((entry) => entry.key), ["holy-sword"]);
});

test("presentation carries the Capacità tab's features: uses left and active state, as the tracker card reads them", async () => {
  meta("aria").initiativeCard = { characterBuild: [{ classId: "barbaro", level: 3 }], quickActions: [sword] };
  const presentation = await runtime.getPcAttackPresentation("aria", "holy-sword");
  const features = presentation.picker.filter((entry) => entry.tab === "features");
  assert.deepEqual([features[0].featureId, features[0].mode], ["barbaro-ira", "activate"], "the build's features, no quick action needed");
  assert.deepEqual(presentation.featureState.active, {}, "nothing active");
  assert.deepEqual(presentation.featureState.resources["barbaro-ira"].map((row) => [row.poolId, row.current, row.maximum]), [["barbaro-ira-usi", 3, 3]]);
  assert.ok(presentation.featureState.enabledIds.includes("barbaro-ira"));
});

test("presentation without an action opens on the last attack, else the first weapon", async () => {
  const cantrip = { id: "cantrip", label: "Trucchetto", kind: "attack", source: { kind: "cantrip", spellIds: ["fire-bolt", "ray-of-frost"] } };
  meta("aria").initiativeCard = { quickActions: [sword, cantrip] };
  const first = await runtime.getPcAttackPresentation("aria", "");
  assert.equal(first.actionId, "holy-sword");
  assert.equal(first.spellId, undefined);
  meta("aria").pcAttackState = { lastAttack: { quickActionId: "cantrip", spellId: "ray-of-frost" } };
  const last = await runtime.getPcAttackPresentation("aria", "");
  assert.deepEqual([last.actionId, last.spellId, last.action.label], ["cantrip", "ray-of-frost", "Trucchetto"]);
  const asked = await runtime.getPcAttackPresentation("aria", "holy-sword");
  assert.equal(asked.actionId, "holy-sword", "an action asked for wins over the last attack");
});

test("a hit is one History entry with attack provenance in the Combat Log, and Undo restores everything", async () => {
  const result = await attack();
  assert.equal(meta("ghoul").hp, 13);
  assert.equal(meta("aria").untouched, "actor");
  assert.equal(meta("ghoul").untouched, "target");
  assert.equal(meta("aria").pcAttackState.lastAttack.outcome, "hit");
  assert.deepEqual(result.hpChange, { before: 30, after: 13, hpMax: 30 });
  assert.equal(result.undoAvailable, true);
  assert.deepEqual(posted, [17], "post-damage projections run once");
  await tick();
  assert.deepEqual(visuals, [], "a weapon attack has no spell animation");
  assert.equal((await history.getHistoryEntries()).length, baselineCount + 1);
  const entry = await attackEntry();
  assert.equal(entry.payload.damageComponents.length, 2);
  const event = combatEventFromHistoryEntryV3(entry);
  assert.equal(event.provenance.actor.id, "aria");
  assert.equal(event.provenance.cause.kind, "pc-attack");
  assert.equal(event.provenance.cause.attackInstanceId, event.correlationId);
  const undone = await history.undoHistoryThrough(entry.id, { sceneEpoch: currentSceneEpoch() });
  assert.equal(undone.status, "applied", JSON.stringify(undone));
  assert.equal(meta("ghoul").hp, 30);
  assert.equal(Object.hasOwn(meta("aria"), "pcAttackState"), false);
});

test("a miss is still one undoable History entry, without damage or projections", async () => {
  await attack({ outcome: "miss", componentAmounts: {} });
  assert.equal(meta("ghoul").hp, 30);
  assert.deepEqual(posted, []);
  assert.equal((await history.getHistoryEntries()).length, baselineCount + 1);
  const entry = await attackEntry();
  assert.equal(entry.payload.causality.action.attackOutcome, "miss");
  await history.undoHistoryThrough(entry.id, { sceneEpoch: currentSceneEpoch() });
  assert.equal(Object.hasOwn(meta("aria"), "pcAttackState"), false);
});

test("two attacks in a row (Extra Attack) are two entries; undoing the second keeps the first", async () => {
  await attack({ attackInstanceId: "first" });
  await attack({ attackInstanceId: "second", componentAmounts: { c1: 5, c2: 0 } });
  assert.equal(meta("ghoul").hp, 8);
  const entries = (await history.getHistoryEntries()).filter((entry) => entry.kind === "pc-attack");
  assert.equal(entries.length, 2);
  await history.undoHistoryThrough(entries[entries.length - 1].id, { sceneEpoch: currentSceneEpoch() });
  assert.equal(meta("ghoul").hp, 13);
  assert.equal(meta("aria").pcAttackState.lastAttack.attackInstanceId, "first");
});

test("a retry with the same identity returns the stored result; different decisions are rejected", async () => {
  const first = await attack({ attackInstanceId: "retry" });
  const again = await attack({ attackInstanceId: "retry" });
  assert.equal(again.duplicate, true);
  assert.equal(again.historyEntryId, first.historyEntryId);
  assert.equal(meta("ghoul").hp, 13);
  assert.deepEqual(posted, [17]);
  await assert.rejects(() => attack({ attackInstanceId: "retry", componentAmounts: { c1: 1, c2: 1 } }), /decisioni/);
  // Lot L11 (AT-05): a monster's save on a hit is a decision too: a retry with another outcome does not run the old plan.
  await assert.rejects(() => attack({ attackInstanceId: "retry", hitEffect: { saveOutcome: "passed", amounts: {} } }), /decisioni/);
});

test("only the GM records; a changed action or a missing target is rejected before any mutation", async () => {
  role = "PLAYER";
  await assert.rejects(() => runtime.executePcAttack({ sourceId: "aria", actionId: "holy-sword", targetId: "ghoul", outcome: "hit",
    componentAmounts: { c1: 1, c2: 1 } }), /GM/);
  role = "GM";
  const presentation = await runtime.getPcAttackPresentation("aria", "holy-sword");
  meta("aria").initiativeCard.quickActions = [{ ...sword, components: [{ type: "fire" }] }];
  await assert.rejects(() => runtime.executePcAttack({ sourceId: "aria", actionId: "holy-sword", targetId: "ghoul",
    expectedAction: presentation.action, outcome: "hit", componentAmounts: { c1: 1, c2: 1 } }), /cambiata/);
  await assert.rejects(() => attack({ targetId: "gone" }), /bersaglio/);
  assert.equal(meta("ghoul").hp, 30);
  assert.equal((await history.getHistoryEntries()).length, baselineCount);
});

const sneak = { id: "ladro-attacco-furtivo", type: "slashing", amount: 10 };
function makeRogue() { meta("aria").initiativeCard.characterBuild = [{ classId: "ladro", level: 5 }]; }

test("Sneak Attack once per turn across Extra Attack; Undo of the first makes it available again", async () => {
  makeRogue();
  const first = await attack({ attackInstanceId: "first", riders: [sneak] });
  assert.equal(meta("ghoul").hp, 3);
  assert.deepEqual(first.riders.map((rider) => rider.name), ["Attacco Furtivo"]);
  assert.equal(meta("aria").pcAttackState.riderUses.length, 1);
  await assert.rejects(() => attack({ attackInstanceId: "second", riders: [sneak], componentAmounts: { c1: 1, c2: 0 } }), /Già usato in questo turno/);
  assert.equal(meta("ghoul").hp, 3);
  const entry = (await history.getHistoryEntries()).find((candidate) => candidate.kind === "pc-attack");
  assert.equal(entry.payload.causality.riders[0].featureId, "ladro-attacco-furtivo");
  await history.undoHistoryThrough(entry.id, { sceneEpoch: currentSceneEpoch() });
  assert.equal(meta("ghoul").hp, 30);
  assert.equal(Object.hasOwn(meta("aria"), "pcAttackState"), false);
  await attack({ attackInstanceId: "third", riders: [sneak] });
  assert.equal(meta("ghoul").hp, 3);
});

test("a turn change before the commit refuses a rider counted per turn, and writes nothing", async () => {
  makeRogue();
  const realRuntime = runtime;
  runtime = createPcAttackRuntime({ api: sdk, emitVisual: async () => ({ sent: false }), postDamage: async () => [],
    runMutation: async (operations, options) => {
      // The next turn starts while the command travels to the coordinator.
      sceneMetadata["com.thebigpicture.initiative/state"] = { ...sceneMetadata["com.thebigpicture.initiative/state"], current: 1 };
      return effects.runEffectsMutation(operations, options);
    } });
  await assert.rejects(() => attack({ attackInstanceId: "late", riders: [sneak] }), /turno/);
  runtime = realRuntime;
  assert.equal(meta("ghoul").hp, 30);
  assert.equal(Object.hasOwn(meta("aria"), "pcAttackState"), false);
  assert.equal((await history.getHistoryEntries()).length, baselineCount);
});

test("Eldritch Smite with Prono: one command for damage and pill; Undo removes both", async () => {
  Object.assign(meta("aria").initiativeCard, { characterBuild: [{ classId: "warlock", level: 5 }], classFeaturesConfigured: true,
    enabledClassFeatureIds: ["warlock-suppliche-occulte-punizione-occulta"] });
  const result = await attack({ attackInstanceId: "eldritch", componentAmounts: { c1: 5, c2: 0 },
    riders: [{ id: "warlock-suppliche-occulte-punizione-occulta", type: "force", amount: 18, slotLevel: 3, onHit: true }] });
  assert.equal(meta("ghoul").hp, 7);
  assert.deepEqual(result.conditions, ["Prono"]);
  assert.match(result.followUps.join(" "), /slot di 3° livello/);
  const conditions = (value) => (Array.isArray(value) ? value : value?.instances || []).map((instance) => instance.condition);
  assert.ok(conditions(meta("ghoul").conditions).includes("Prono"));
  assert.equal((await history.getHistoryEntries()).filter((entry) => entry.kind === "pc-attack").length, 1);
  const entry = (await history.getHistoryEntries()).find((candidate) => candidate.kind === "pc-attack");
  await history.undoHistoryThrough(entry.id, { sceneEpoch: currentSceneEpoch() });
  assert.equal(meta("ghoul").hp, 30);
  assert.equal(conditions(meta("ghoul").conditions).includes("Prono"), false);
});

test("a book's attack spells without an action on the sheet: the console builds it, registers, logs and undoes as with a saved one", async () => {
  const { buildCombatLogPresentation } = await import("../src/combatLogPresentationCore.js");
  meta("aria").initiativeCard = { characterBuild: [{ classId: "mago", level: 5 }], spellbook: { spellIds: ["fire-bolt", "guiding-bolt", "bless"] } };
  const opened = await runtime.getPcAttackPresentation("aria", "");
  assert.deepEqual([opened.actionId, opened.spellId, opened.action.source], ["book-attack:cantrip", "fire-bolt", { kind: "cantrip", spellIds: ["fire-bolt"] }],
    "an actor without weapons opens on its first attack of the book");
  assert.deepEqual(opened.picker.filter((entry) => entry.spellId).map((entry) => [entry.spellId, entry.mode]),
    [["fire-bolt", "attack"], ["bless", "launch"], ["guiding-bolt", "attack"]]);

  const presentation = await runtime.getPcAttackPresentation("aria", "book-attack:spell");
  const hit = await runtime.executePcAttack({ sourceId: "aria", actionId: "book-attack:spell", spellId: "guiding-bolt", targetId: "ghoul",
    sceneIdentity: presentation.sceneIdentity, expectedAction: presentation.action, expectedDefenses: {}, outcome: "hit", componentAmounts: { c1: 12 },
    spellCast: { castId: "bolt-1", slotLevel: 2 }, attackInstanceId: "bolt" });
  assert.equal(meta("ghoul").hp, 18);
  assert.equal(hit.spell.slotSpent, "slot di 2° livello");
  assert.equal(meta("aria").classFeatureState.resources["spell-slot-2"].current, 2, "the slot is spent as with a saved action");
  assert.deepEqual(meta("aria").initiativeCard.quickActions, undefined, "nothing is written on the card");
  assert.equal(meta("aria").pcAttackState.lastAttack.quickActionId, "book-attack:spell");
  const reopened = await runtime.getPcAttackPresentation("aria", "");
  assert.deepEqual([reopened.actionId, reopened.spellId], ["book-attack:spell", "guiding-bolt"], "it opens on the last attack");

  const entry = await attackEntry();
  const details = buildCombatLogPresentation(null, [combatEventFromHistoryEntryV3(entry)]).events[0].details.flatMap((section) => section.lines).join(" | ");
  assert.match(details, /Dardo tracciante/);
  await history.undoHistoryThrough(entry.id, { sceneEpoch: currentSceneEpoch() });
  assert.equal(meta("ghoul").hp, 30);
  assert.equal(meta("aria").classFeatureState?.resources?.["spell-slot-2"]?.current ?? 3, 3, "Undo gives the slot back");
});

test("a book that changes under an open attack: the console asks to reopen it, and writes nothing", async () => {
  meta("aria").initiativeCard = { characterBuild: [{ classId: "mago", level: 5 }], spellbook: { spellIds: ["fire-bolt", "ray-of-frost"] } };
  const presentation = await runtime.getPcAttackPresentation("aria", "book-attack:cantrip");
  meta("aria").initiativeCard.spellbook.spellIds = ["fire-bolt"];
  const request = { sourceId: "aria", actionId: "book-attack:cantrip", spellId: "fire-bolt", targetId: "ghoul", sceneIdentity: presentation.sceneIdentity,
    expectedAction: presentation.action, expectedDefenses: {}, outcome: "hit", componentAmounts: { c1: 5 }, attackInstanceId: "changed" };
  await assert.rejects(() => runtime.executePcAttack(request), /L'azione è cambiata/);
  meta("aria").initiativeCard.spellbook.spellIds = ["mage-hand"];
  await assert.rejects(() => runtime.getPcAttackPresentation("aria", "book-attack:cantrip"), /Azione di attacco non trovata/);
  assert.equal(meta("ghoul").hp, 30);
});

test("Vampiric Touch: the runtime offers its cast until the caster concentrates on it, then its touches", async () => {
  meta("aria").initiativeCard = { characterBuild: [{ classId: "mago", level: 5 }], spellbook: { spellIds: ["vampiric-touch"] } };
  const entry = (presentation) => presentation.picker.find((row) => row.spellId === "vampiric-touch");
  const waiting = await runtime.getPcAttackPresentation("aria", "");
  assert.equal(entry(waiting).mode, "launch");
  assert.equal(waiting.action, null, "no attack to open on yet");
  meta("aria")["com.thebigpicture.initiative/concentration"] = { tocco: { spellId: "vampiric-touch", instanceId: "vt", castContext: { slotLevel: 3 } } };
  const active = await runtime.getPcAttackPresentation("aria", "");
  assert.deepEqual([entry(active).mode, active.actionId, active.spellId], ["attack", "book-attack:spell", "vampiric-touch"]);
});

test("a cantrip attack: one History entry, an Attack event in the Combat Log naming the cantrip", async () => {
  const { buildCombatLogPresentation } = await import("../src/combatLogPresentationCore.js");
  Object.assign(meta("aria").initiativeCard, { characterBuild: [{ classId: "mago", level: 11 }],
    quickActions: [sword, { id: "cantrip", label: "Trucchetto", kind: "attack", source: { kind: "cantrip" } }] });
  const presentation = await runtime.getPcAttackPresentation("aria", "cantrip");
  const result = await runtime.executePcAttack({ sourceId: "aria", actionId: "cantrip", spellId: "ray-of-frost", targetId: "ghoul",
    sceneIdentity: presentation.sceneIdentity, expectedAction: presentation.action, expectedDefenses: {}, outcome: "hit", componentAmounts: { c1: 14 },
    attackInstanceId: "frost" });
  assert.equal(meta("ghoul").hp, 16);
  assert.equal(result.cantrip.name, "Raggio di gelo");
  await tick();
  assert.deepEqual(visuals.map(({ spellId, casterId, targetIds, eventId, lifecycleId, persistent }) => ({ spellId, casterId, targetIds, eventId, lifecycleId, persistent })),
    [{ spellId: "ray-of-frost", casterId: "aria", targetIds: ["ghoul"], eventId: "frost", lifecycleId: "frost:spell", persistent: true }],
    "the Embers animation of the cantrip, once; its loops last with the pill's spell instance");
  assert.equal(result.manualRemainder, "");
  assert.deepEqual(result.conditions, ["Velocità −3 m"]);
  const pills = (value) => (Array.isArray(value) ? value : value?.instances || []).map((instance) => instance.condition);
  assert.ok(pills(meta("ghoul").conditions).includes("Velocità −3 m"), "the pill is on the target");
  // The spell is the large pill on the target; its effect is a mini pill linked to it.
  assert.match(JSON.stringify(meta("ghoul")["com.thebigpicture.initiative/spells"] ?? null), /Raggio di gelo/);
  const frost = (meta("ghoul").conditions?.instances || meta("ghoul").conditions || []).find((instance) => instance.condition === "Velocità −3 m");
  assert.equal(frost.parentEffectId, "frost:spell");
  assert.equal(meta("aria").pcAttackState.lastAttack.spellId, "ray-of-frost");
  const entry = (await history.getHistoryEntries()).find((candidate) => candidate.kind === "pc-attack");
  const event = combatEventFromHistoryEntryV3(entry);
  assert.equal(event.category, "attack");
  const details = buildCombatLogPresentation(null, [event]).events[0].details.flatMap((section) => section.lines).join(" | ");
  assert.match(details, /Trucchetto: Raggio di gelo \(3d8\)/);
  await assert.rejects(() => runtime.executePcAttack({ sourceId: "aria", actionId: "cantrip", spellId: "magic-stone", targetId: "ghoul",
    outcome: "hit", componentAmounts: { c1: 1 } }), /Trucchetto non disponibile/);
});

// Found at the table: a missed cantrip still played its Embers animation on the target.
test("a missed cantrip attack plays no Embers animation", async () => {
  Object.assign(meta("aria").initiativeCard, { characterBuild: [{ classId: "mago", level: 11 }],
    quickActions: [sword, { id: "cantrip", label: "Trucchetto", kind: "attack", source: { kind: "cantrip" } }] });
  const presentation = await runtime.getPcAttackPresentation("aria", "cantrip");
  await runtime.executePcAttack({ sourceId: "aria", actionId: "cantrip", spellId: "ray-of-frost", targetId: "ghoul",
    sceneIdentity: presentation.sceneIdentity, expectedAction: presentation.action, expectedDefenses: {}, outcome: "miss", componentAmounts: {},
    attackInstanceId: "frost-miss" });
  await tick();
  assert.deepEqual(visuals, []);
});

test("a failed save against Frostbite: damage, spell instance and pill in one command; one Undo removes them all", async () => {
  Object.assign(meta("aria").initiativeCard, { characterBuild: [{ classId: "druido", level: 5 }], spellSaveDC: 13,
    quickActions: [sword, { id: "cantrip", label: "Trucchetto", kind: "attack", source: { kind: "cantrip" } }] });
  const presentation = await runtime.getPcAttackPresentation("aria", "cantrip");
  const result = await runtime.executePcAttack({ sourceId: "aria", actionId: "cantrip", spellId: "xanathar-morsa-del-gelo", targetId: "ghoul",
    sceneIdentity: presentation.sceneIdentity, expectedAction: presentation.action, expectedDefenses: {}, outcome: "failed", componentAmounts: { c1: 8 },
    attackInstanceId: "frostbite" });
  const pills = (value) => (Array.isArray(value) ? value : value?.instances || []).map((instance) => instance.condition);
  const spells = () => JSON.stringify(meta("ghoul")["com.thebigpicture.initiative/spells"] ?? null);
  assert.equal(meta("ghoul").hp, 22);
  assert.deepEqual(result.conditions, ["Prossimo attacco con arma: svant."]);
  assert.ok(pills(meta("ghoul").conditions).includes("Prossimo attacco con arma: svant."));
  assert.match(spells(), /Morsa del Gelo/);
  assert.equal((await history.getHistoryEntries()).filter((entry) => entry.kind === "pc-attack").length, 1);
  const entry = (await history.getHistoryEntries()).find((candidate) => candidate.kind === "pc-attack");
  await history.undoHistoryThrough(entry.id, { sceneEpoch: currentSceneEpoch() });
  assert.equal(meta("ghoul").hp, 30);
  assert.equal(pills(meta("ghoul").conditions).includes("Prossimo attacco con arma: svant."), false);
  assert.doesNotMatch(spells(), /Morsa del Gelo/);
});

test("Green-Flame Blade: target and second creature in one History entry; one Undo restores both; Booming Blade leaves its pill", async () => {
  Object.assign(meta("aria").initiativeCard, { characterBuild: [{ classId: "ladro", level: 5 }],
    quickActions: [sword, { id: "cantrip", label: "Trucchetto", kind: "attack", source: { kind: "cantrip", spellIds: ["tasha-lama-verdefiamma", "tasha-lama-roboante"] } }] });
  sceneItems.push({ id: "imp", name: "Imp", type: "IMAGE", layer: "CHARACTER", position: { x: 60, y: 20 }, metadata: { [META_KEY]: { hp: 10, hpMax: 10, inInitiative: true } } });
  const presentation = await runtime.getPcAttackPresentation("aria", "holy-sword");
  const result = await runtime.executePcAttack({ sourceId: "aria", actionId: "holy-sword", targetId: "ghoul", sceneIdentity: presentation.sceneIdentity,
    expectedAction: presentation.action, expectedDefenses: {}, outcome: "hit", componentAmounts: { c1: 8, c2: 0 }, attackInstanceId: "green",
    weaponCantrip: { spellId: "tasha-lama-verdefiamma", amount: 4, secondary: { targetId: "imp", amount: 7 } }, expectedSecondaryDefenses: {} });
  assert.deepEqual([meta("ghoul").hp, meta("imp").hp], [18, 3]);
  assert.deepEqual(result.secondary, { id: "imp", name: "Imp", before: 10, after: 3 });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(visuals.map(({ spellId, targetIds, persistent }) => [spellId, targetIds, persistent]),
    [["tasha-lama-verdefiamma", ["ghoul", "imp"], false]], "the woven cantrip's animation leaps to the second creature; no pill, no loop");
  assert.deepEqual(posted, [12, 7], "post-damage projections for both creatures");
  const entries = (await history.getHistoryEntries()).filter((entry) => entry.kind === "pc-attack");
  assert.equal(entries.length, 1);
  await history.undoHistoryThrough(entries[0].id, { sceneEpoch: currentSceneEpoch() });
  assert.deepEqual([meta("ghoul").hp, meta("imp").hp], [30, 10]);

  await runtime.executePcAttack({ sourceId: "aria", actionId: "holy-sword", targetId: "ghoul", sceneIdentity: presentation.sceneIdentity,
    expectedAction: presentation.action, expectedDefenses: {}, outcome: "hit", componentAmounts: { c1: 8, c2: 0 }, attackInstanceId: "boom",
    weaponCantrip: { spellId: "tasha-lama-roboante", amount: 3 } });
  const pills = (value) => (Array.isArray(value) ? value : value?.instances || []).map((instance) => instance.condition);
  assert.equal(meta("ghoul").hp, 19);
  assert.ok(pills(meta("ghoul").conditions).includes("Movimento: danni tuono"));
  assert.match(JSON.stringify(meta("ghoul")["com.thebigpicture.initiative/spells"] ?? null), /Lama Roboante/);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(visuals.slice(1).map(({ spellId, lifecycleId, persistent }) => [spellId, lifecycleId, persistent]),
    [["tasha-lama-roboante", "boom:spell", true]], "Booming Blade's loop lasts with its pill");
});

test("an activation on a hit: damage, die spent and pill in one History entry; one Undo restores the HP, the pill and the die", async () => {
  Object.assign(meta("aria").initiativeCard, { characterBuild: [{ classId: "guerriero", level: 10, subclassId: "guerriero-maestro-di-battaglia" }],
    abilityModifiers: { str: 4, dex: 2, con: 3, int: 0, wis: 1, cha: 0 }, classFeaturesConfigured: true,
    enabledClassFeatureIds: ["guerriero-maestro-di-battaglia-manovre", "guerriero-maestro-di-battaglia-manovre-attacco-minaccioso"] });
  const result = await attack({ attackInstanceId: "menace", activations: [{ id: "guerriero-maestro-di-battaglia-manovre-attacco-minaccioso",
    type: "slashing", amount: 6, saveOutcome: "failed" }] });
  const pills = () => (meta("ghoul").conditions?.instances || meta("ghoul").conditions || []).map((instance) => instance.condition);
  assert.equal(meta("ghoul").hp, 7);
  assert.ok(pills().includes("Spaventato"));
  assert.equal(meta("aria").classFeatureState.resources["guerriero-dadi-superiorita"].current, 4);
  assert.deepEqual(result.activations.map((activation) => [activation.name, activation.save.outcome, activation.effect.applied]),
    [["Attacco Minaccioso", "failed", true]]);
  assert.deepEqual(result.conditions, ["Spaventato"]);
  const entries = (await history.getHistoryEntries()).filter((entry) => entry.kind === "pc-attack");
  assert.equal(entries.length, 1);
  await history.undoHistoryThrough(entries[0].id, { sceneEpoch: currentSceneEpoch() });
  assert.equal(meta("ghoul").hp, 30);
  assert.equal(pills().includes("Spaventato"), false);
  assert.equal(meta("aria").classFeatureState?.resources?.["guerriero-dadi-superiorita"]?.current ?? 5, 5);
});

test("a self pill from an activation: the attacker's pill is applied and its labels refreshed", async () => {
  const refreshed = [];
  runtime = createPcAttackRuntime({ api: sdk, emitVisual: async () => ({ sent: false }), postDamage: async () => [], refreshLabels: async (ids) => { refreshed.push(...ids); } });
  Object.assign(meta("aria").initiativeCard, { characterBuild: [{ classId: "bardo", level: 6, subclassId: "bardo-collegio-delle-spade" }],
    abilityModifiers: { str: 0, dex: 3, con: 1, int: 0, wis: 0, cha: 4 }, classFeaturesConfigured: true,
    enabledClassFeatureIds: ["bardo-collegio-delle-spade-virtuosismo-della-lama", "bardo-collegio-delle-spade-virtuosismo-della-lama-virtuosismo-difensivo"] });
  await attack({ attackInstanceId: "flourish", activations: [{ id: "bardo-collegio-delle-spade-virtuosismo-della-lama-virtuosismo-difensivo",
    type: "slashing", amount: 5 }] });
  const pills = (id) => (meta(id).conditions?.instances || meta(id).conditions || []).map((instance) => instance.condition);
  assert.ok(pills("aria").includes("Virtuosismo Difensivo"));
  assert.equal(pills("ghoul").includes("Virtuosismo Difensivo"), false);
  assert.equal(meta("aria").classFeatureState.resources["bardo-ispirazione-bardica-usi"].current, 3);
  assert.deepEqual(refreshed, ["aria"]);
});

test("Sweeping Attack: the target, the second creature and the die in one History entry; one Undo restores all three", async () => {
  Object.assign(meta("aria").initiativeCard, { characterBuild: [{ classId: "guerriero", level: 10, subclassId: "guerriero-maestro-di-battaglia" }],
    abilityModifiers: { str: 4, dex: 2, con: 3, int: 0, wis: 1, cha: 0 }, classFeaturesConfigured: true,
    enabledClassFeatureIds: ["guerriero-maestro-di-battaglia-manovre", "guerriero-maestro-di-battaglia-manovre-attacco-con-spazzata"] });
  sceneItems.push({ id: "imp", name: "Imp", type: "IMAGE", layer: "CHARACTER", position: { x: 60, y: 20 }, metadata: { [META_KEY]: { hp: 10, hpMax: 10, inInitiative: true } } });
  const result = await attack({ attackInstanceId: "sweep", expectedSecondaryDefenses: {},
    activations: [{ id: "guerriero-maestro-di-battaglia-manovre-attacco-con-spazzata", type: "slashing", amount: 6, secondaryTargetId: "imp" }] });
  assert.deepEqual([meta("ghoul").hp, meta("imp").hp], [13, 4]);
  assert.deepEqual(result.secondary, { id: "imp", name: "Imp", before: 10, after: 4 });
  assert.equal(meta("aria").classFeatureState.resources["guerriero-dadi-superiorita"].current, 4);
  const entries = (await history.getHistoryEntries()).filter((entry) => entry.kind === "pc-attack");
  assert.equal(entries.length, 1);
  await history.undoHistoryThrough(entries[0].id, { sceneEpoch: currentSceneEpoch() });
  assert.deepEqual([meta("ghoul").hp, meta("imp").hp], [30, 10]);
  assert.equal(meta("aria").classFeatureState?.resources?.["guerriero-dadi-superiorita"]?.current ?? 5, 5);
});

// Lot F2-3 of docs/STUDIO_TALENTI.md: Maneuvering Attack's ally is read from the scene like the target, its pill «No AdO»
// and its reaction in the attack's entry; one Undo takes them away.
test("Maneuvering Attack: the ally chosen gets «No AdO: <target>» and its reaction spent in the attack's entry; one Undo takes them away", async () => {
  const MANEUVER = "guerriero-maestro-di-battaglia-manovre-attacco-con-manovra";
  Object.assign(meta("aria"), { attitude: "pc" });
  Object.assign(meta("ghoul"), { attitude: "enemy" });
  Object.assign(meta("aria").initiativeCard, { characterBuild: [{ classId: "guerriero", level: 3, subclassId: "guerriero-maestro-di-battaglia" }],
    abilityModifiers: { str: 4, dex: 2, con: 3, int: 0, wis: 1, cha: 0 }, classFeaturesConfigured: true,
    enabledClassFeatureIds: ["guerriero-maestro-di-battaglia-superiorita-in-combattimento", MANEUVER] });
  sceneItems.push({ id: "mira", name: "Mira", type: "IMAGE", layer: "CHARACTER", position: { x: 20, y: 20 },
    metadata: { [META_KEY]: { hp: 20, hpMax: 20, attitude: "pc", inInitiative: true } } });
  await attack({ attackInstanceId: "maneuvering", activations: [{ id: MANEUVER, type: "slashing", amount: 5, allyId: "mira" }] });
  const pills = (id) => (meta(id).conditions?.instances || meta(id).conditions || []).map((instance) => instance.condition);
  assert.deepEqual(pills("mira"), ["No AdO: Ghoul", "Reazione usata"]);
  assert.equal(meta("ghoul").hp, 30 - 8 - 9 - 5);
  const entries = (await history.getHistoryEntries()).filter((entry) => entry.kind === "pc-attack");
  assert.equal(entries.length, 1);
  await history.undoHistoryThrough(entries[0].id, { sceneEpoch: currentSceneEpoch() });
  assert.deepEqual(pills("mira"), []);
  assert.equal(meta("ghoul").hp, 30);
});

test("Inspiring Smite: damage and temporary hit points to the paladin and an ally in one entry, their own projections; one Undo restores them", async () => {
  const projected = [];
  runtime = createPcAttackRuntime({ api: sdk, emitVisual: async () => ({ sent: false }), postDamage: async () => [], postTempHp: async ({ rows }) => { projected.push(...rows.map((row) => row.item.id)); } });
  const ISPIRATRICE = "paladino-giuramento-di-gloria-incanalare-divinita-punizione-ispiratrice";
  Object.assign(meta("aria"), { hp: 30 });
  Object.assign(meta("aria").initiativeCard, { characterBuild: [{ classId: "paladino", level: 7, subclassId: "paladino-giuramento-di-gloria" }],
    abilityModifiers: { str: 4, dex: 0, con: 2, int: 0, wis: 1, cha: 3 }, classFeaturesConfigured: true,
    enabledClassFeatureIds: ["paladino-punizione-divina", ISPIRATRICE] });
  sceneItems.push({ id: "imp", name: "Imp", type: "IMAGE", layer: "CHARACTER", position: { x: 60, y: 20 }, metadata: { [META_KEY]: { hp: 4, hpMax: 10, inInitiative: true } } });
  const result = await attack({ attackInstanceId: "inspire", riders: [{ id: "paladino-punizione-divina", type: "radiant", amount: 9, slotLevel: 1 }],
    activations: [{ id: ISPIRATRICE, amount: 12, tempHp: [{ targetId: "aria", amount: 5 }, { targetId: "imp", amount: 7 }] }] });
  assert.deepEqual([meta("ghoul").hp, meta("aria").hp, meta("imp").hp], [4, 30, 4]);
  assert.deepEqual([meta("aria").tempHp, meta("imp").tempHp], [5, 7], "in their own field: the wounded imp keeps its 4 HP");
  assert.deepEqual(result.tempHp, [{ id: "aria", name: "Aria", before: 0, after: 5 }, { id: "imp", name: "Imp", before: 0, after: 7 }]);
  assert.deepEqual(projected, ["aria", "imp"]);
  const entries = (await history.getHistoryEntries()).filter((entry) => entry.kind === "pc-attack");
  assert.equal(entries.length, 1);
  await history.undoHistoryThrough(entries[0].id, { sceneEpoch: currentSceneEpoch() });
  assert.deepEqual([meta("ghoul").hp, meta("aria").hp, meta("imp").hp], [30, 30, 4]);
  assert.deepEqual([Object.hasOwn(meta("aria"), "tempHp"), Object.hasOwn(meta("imp"), "tempHp")], [false, false],
    "the Undo takes the temporary hit points away");
});

test("Quivering Palm: the vibrations on a hit, then ending them (0 HP) as a command of its own; Undo brings the vibrations back", async () => {
  const fist = { id: "fist", label: "Colpo senz'armi", kind: "attack", range: "melee", components: [{ type: "bludgeoning" }] };
  Object.assign(meta("aria").initiativeCard, { characterBuild: [{ classId: "monaco", level: 17, subclassId: "monaco-via-della-mano-aperta" }],
    abilityModifiers: { str: 1, dex: 4, con: 2, int: 0, wis: 3, cha: 0 }, classFeaturesConfigured: true,
    enabledClassFeatureIds: ["monaco-via-della-mano-aperta-palmo-tremante"], quickActions: [fist] });
  const presentation = await runtime.getPcAttackPresentation("aria", "fist");
  await runtime.executePcAttack({ sourceId: "aria", actionId: "fist", targetId: "ghoul", sceneIdentity: presentation.sceneIdentity,
    expectedAction: presentation.action, expectedDefenses: {}, outcome: "hit", componentAmounts: { c1: 6 }, attackInstanceId: "palm-hit",
    activations: [{ id: "monaco-via-della-mano-aperta-palmo-tremante" }] });
  const pills = () => (meta("ghoul").conditions?.instances || meta("ghoul").conditions || []).map((instance) => instance.condition);
  assert.ok(pills().includes("Palmo Tremante"));
  assert.equal(meta("aria").classFeatureState.resources["monaco-punti-ki"].current, 14);
  const ended = await runtime.endQuiveringPalm({ sourceId: "aria", targetId: "ghoul", outcome: "failed", attackInstanceId: "palm-end",
    sceneIdentity: presentation.sceneIdentity });
  assert.deepEqual(ended.hpChange, { before: 24, after: 0, hpMax: 30 });
  assert.equal(pills().includes("Palmo Tremante"), false);
  assert.equal(meta("aria").classFeatureState.instances.some((instance) => instance.featureId === "monaco-via-della-mano-aperta-palmo-tremante"), false);
  const entries = (await history.getHistoryEntries()).filter((entry) => entry.kind === "pc-attack");
  assert.equal(entries.length, 2);
  await history.undoHistoryThrough(entries[1].id, { sceneEpoch: currentSceneEpoch() });
  assert.equal(meta("ghoul").hp, 24);
  assert.ok(pills().includes("Palmo Tremante"));
  assert.equal(meta("aria").classFeatureState.instances.some((instance) => instance.featureId === "monaco-via-della-mano-aperta-palmo-tremante"), true);
});

test("an area cantrip: the creatures near the caster proposed from the map; one History entry for all of them; one Undo", async () => {
  const { buildCombatLogPresentation } = await import("../src/combatLogPresentationCore.js");
  Object.assign(meta("aria").initiativeCard, { characterBuild: [{ classId: "mago", level: 5 }], spellSaveDC: 14,
    quickActions: [sword, { id: "cantrip", label: "Trucchetto", kind: "attack", source: { kind: "cantrip" } }] });
  sceneItems.push(
    { id: "imp", name: "Imp", type: "IMAGE", layer: "CHARACTER", position: { x: 60, y: 120 }, metadata: { [META_KEY]: { hp: 10, hpMax: 10, inInitiative: true } } },
    { id: "far", name: "Lontano", type: "IMAGE", layer: "CHARACTER", position: { x: 1000, y: 1000 }, metadata: { [META_KEY]: { hp: 10, hpMax: 10, inInitiative: true } } });
  assert.deepEqual(await runtime.getPcAttackNearby({ sourceId: "aria", centerId: "aria", radiusFeet: 5 }), ["ghoul", "imp"]);
  assert.deepEqual(await runtime.getPcAttackNearby({ sourceId: "aria", centerId: "imp", radiusFeet: 10 }), ["aria", "ghoul"]);
  const presentation = await runtime.getPcAttackPresentation("aria", "cantrip");
  const request = { sourceId: "aria", actionId: "cantrip", spellId: "tasha-turbine-di-spade", expectedAction: presentation.action,
    sceneIdentity: presentation.sceneIdentity, members: [{ targetId: "ghoul", outcome: "failed" }, { targetId: "imp", outcome: "passed" }],
    componentAmounts: { c1: 7 }, expectedDefenses: { ghoul: [], imp: [] }, attackInstanceId: "whirl" };
  const result = await runtime.executePcAttackArea(request);
  assert.deepEqual([meta("ghoul").hp, meta("imp").hp, meta("far").hp], [23, 10, 10]);
  assert.deepEqual(result.rows.map((row) => [row.id, row.outcome, row.damage, row.before, row.after]),
    [["ghoul", "failed", 7, 30, 23], ["imp", "passed", 0, 10, 10]]);
  assert.equal(result.undoAvailable, true);
  assert.deepEqual(posted, [7, 0].filter((amount) => amount > 0), "projections only for the creatures whose HP changed");
  const again = await runtime.executePcAttackArea(request);
  assert.equal(again.duplicate, true);
  await tick();
  assert.deepEqual(visuals.map(({ spellId, targetIds, persistent }) => [spellId, targetIds, persistent]), [["tasha-turbine-di-spade", ["ghoul", "imp"], false]],
    "the area cantrip is offered to the renderer once, with every creature hit; a retry sends nothing");
  assert.equal(meta("ghoul").hp, 23);
  const entries = (await history.getHistoryEntries()).filter((entry) => entry.kind === "pc-attack");
  assert.equal(entries.length, 1);
  const event = combatEventFromHistoryEntryV3(entries[0]);
  assert.equal(event.category, "attack");
  const details = buildCombatLogPresentation(null, [event]).events[0].details.flatMap((section) => section.lines).join(" | ");
  assert.match(details, /Area: 2 creature entro 1,5 m/);
  assert.match(details, /Imp: Superato/);
  await history.undoHistoryThrough(entries[0].id, { sceneEpoch: currentSceneEpoch() });
  assert.deepEqual([meta("ghoul").hp, meta("imp").hp], [30, 10]);
  assert.equal(Object.hasOwn(meta("aria"), "pcAttackState"), false);
  await assert.rejects(() => runtime.executePcAttackArea({ ...request, attackInstanceId: "whirl-2", members: [{ targetId: "gone", outcome: "failed" }] }),
    /non è più presente/);
});

function paladinWithSlots(resources = null) {
  Object.assign(meta("aria").initiativeCard, { characterBuild: [{ classId: "paladino", level: 5 }], classFeaturesConfigured: true,
    enabledClassFeatureIds: ["paladino-punizione-divina"] });
  if (resources) meta("aria").classFeatureState = { version: 1, resources, instances: [] };
}
const slots = () => meta("aria").classFeatureState?.resources || {};

test("Divine Smite spends its slot in the attack's command; one Undo gives back the damage and the slot", async () => {
  paladinWithSlots();
  await attack({ attackInstanceId: "smite-slot", riders: [{ id: "paladino-punizione-divina", type: "radiant", amount: 9, slotLevel: 2 }] });
  assert.equal(slots()["spell-slot-2"].current, 1);
  const entry = await attackEntry();
  assert.equal(entry.payload.causality.riders[0].slotTracked, true);
  await history.undoHistoryThrough(entry.id, { sceneEpoch: currentSceneEpoch() });
  assert.equal(meta("ghoul").hp, 30);
  assert.equal(slots()["spell-slot-2"]?.current ?? 2, 2);
});

test("Divine Smite without a slot left is refused, unless the GM confirms the attack without one", async () => {
  paladinWithSlots({ "spell-slot-1": { current: 0, maximum: 4 } });
  const riders = [{ id: "paladino-punizione-divina", type: "radiant", amount: 9, slotLevel: 1 }];
  await assert.rejects(attack({ attackInstanceId: "smite-empty", riders }), /Nessuno slot di 1° livello disponibile/);
  assert.equal(meta("ghoul").hp, 30, "nothing was written");
  await attack({ attackInstanceId: "smite-confirmed", riders, castWithoutSlot: true });
  assert.equal(meta("ghoul").hp, 4);
  assert.equal(slots()["spell-slot-1"].current, 0);
  assert.equal((await attackEntry()).payload.causality.riders[0].slotTracked, false);
});

test("Eldritch Smite spends a Pact Magic slot", async () => {
  Object.assign(meta("aria").initiativeCard, { characterBuild: [{ classId: "warlock", level: 5 }], classFeaturesConfigured: true,
    enabledClassFeatureIds: ["warlock-suppliche-occulte-punizione-occulta"] });
  await attack({ attackInstanceId: "eldritch-slot", componentAmounts: { c1: 5, c2: 0 },
    riders: [{ id: "warlock-suppliche-occulte-punizione-occulta", type: "force", amount: 18, slotLevel: 3 }] });
  assert.equal(slots()["spell-slot-pact"].current, 1);
});

test("a smite with an activation that writes the class-feature state spends its slot in that same write", async () => {
  runtime = createPcAttackRuntime({ api: sdk, emitVisual: async () => ({ sent: false }), postDamage: async () => [], postTempHp: async () => {} });
  const ISPIRATRICE = "paladino-giuramento-di-gloria-incanalare-divinita-punizione-ispiratrice";
  Object.assign(meta("aria").initiativeCard, { characterBuild: [{ classId: "paladino", level: 7, subclassId: "paladino-giuramento-di-gloria" }],
    abilityModifiers: { str: 4, dex: 0, con: 2, int: 0, wis: 1, cha: 3 }, classFeaturesConfigured: true,
    enabledClassFeatureIds: ["paladino-punizione-divina", ISPIRATRICE] });
  await attack({ attackInstanceId: "inspire-slot", riders: [{ id: "paladino-punizione-divina", type: "radiant", amount: 9, slotLevel: 2 }],
    activations: [{ id: ISPIRATRICE, amount: 12, tempHp: [{ targetId: "aria", amount: 5 }] }] });
  const resources = slots();
  assert.equal(resources["spell-slot-2"].current, 2, "paladin 7 has three 2nd-level slots");
  assert.equal(resources["paladino-incanalare-divinita-usi"].current, 0, "and the Channel Divinity use");
  await history.undoHistoryThrough((await attackEntry()).id, { sceneEpoch: currentSceneEpoch() });
  assert.equal(slots()["spell-slot-2"]?.current ?? 3, 3);
});

// Lotto L4: leveled attack spells. The first registration of a cast spends its slot in its command; the next rays and
// Vampiric Touch's touches spend nothing.
const attackSpells = { id: "wizard-spells", label: "Incantesimi d'attacco", kind: "attack", source: { kind: "spell" } };
function wizardWithSpells(extra = {}) {
  Object.assign(meta("aria").initiativeCard, { quickActions: [attackSpells], characterBuild: [{ classId: "mago", level: 5 }] });
  Object.assign(meta("aria"), extra);
}
async function castSpell(spellId, decisions = {}) {
  const presentation = await runtime.getPcAttackPresentation("aria", "wizard-spells");
  return runtime.executePcAttack({ sourceId: "aria", actionId: "wizard-spells", targetId: "ghoul", sceneIdentity: presentation.sceneIdentity,
    expectedAction: presentation.action, expectedDefenses: {}, outcome: "hit", spellId, componentAmounts: { c1: 6 }, ...decisions });
}

test("Scorching Ray: three rays, one slot spent with the first; one Undo of the first gives back the slot", async () => {
  wizardWithSpells();
  const spellCast = { castId: "rays", slotLevel: 2 };
  const first = await castSpell("scorching-ray", { attackInstanceId: "ray-1", spellCast });
  assert.equal(first.spell.slotSpent, "slot di 2° livello");
  assert.equal(slots()["spell-slot-2"].current, 2, "wizard 5 has three 2nd-level slots");
  const undoFirst = (await attackEntry()).id;
  await history.undoHistoryThrough(undoFirst, { sceneEpoch: currentSceneEpoch() });
  assert.equal(slots()["spell-slot-2"]?.current ?? 3, 3);
  assert.equal(meta("aria").pcAttackState?.spellCast, undefined, "the cast is closed with its first ray");
  await castSpell("scorching-ray", { attackInstanceId: "ray-1b", spellCast });
  await castSpell("scorching-ray", { attackInstanceId: "ray-2", spellCast });
  const third = await castSpell("scorching-ray", { attackInstanceId: "ray-3", spellCast, outcome: "miss", componentAmounts: {} });
  assert.deepEqual([third.spell.index, third.spell.total, third.spell.firstOfCast], [3, 3, false]);
  assert.equal(slots()["spell-slot-2"].current, 2, "only the first ray spent a slot");
  assert.equal(meta("ghoul").hp, 18);
  // Lot DM1 of docs/STUDIO_GIOCO_ONLINE.md: the cast stays, complete, until «Nuovo lancio»; a fourth ray is refused.
  assert.equal(meta("aria").pcAttackState.spellCast.complete, true);
  await assert.rejects(castSpell("scorching-ray", { attackInstanceId: "ray-4", spellCast }), /lancio completo \(3\/3\)/u);
  assert.equal(slots()["spell-slot-2"].current, 2, "no slot spent by the refused ray");
});

test("a spell without a slot left is refused, unless the GM confirms the cast without one", async () => {
  wizardWithSpells({ classFeatureState: { version: 1, resources: { "spell-slot-1": { current: 0, maximum: 4 } }, instances: [] } });
  await assert.rejects(castSpell("inflict-wounds", { attackInstanceId: "iw-empty", spellCast: { castId: "iw", slotLevel: 1 } }),
    /Nessuno slot di 1° livello disponibile/);
  assert.equal(meta("ghoul").hp, 30);
  const result = await castSpell("inflict-wounds", { attackInstanceId: "iw-free", spellCast: { castId: "iw", slotLevel: 1 }, castWithoutSlot: true });
  assert.equal(result.spell.slotTracked, false);
  assert.equal(meta("ghoul").hp, 24);
});

test("Vampiric Touch heals the caster in the touch's command; one Undo restores both creatures", async () => {
  const healed = [];
  runtime = createPcAttackRuntime({ api: sdk, emitVisual: async () => ({ sent: false }), postDamage: async () => [],
    postTempHp: async ({ rows }) => { healed.push(...rows.map((row) => [row.item.id, row.change.afterHP])); } });
  wizardWithSpells({ hp: 20, "com.thebigpicture.initiative/concentration": {
    "tocco del vampiro": { spellId: "vampiric-touch", instanceId: "vt", targets: [], castContext: { slotLevel: 3 } } } });
  const result = await castSpell("vampiric-touch", { attackInstanceId: "vt-1", componentAmounts: { c1: 11 }, spellCast: {} });
  assert.deepEqual([meta("ghoul").hp, meta("aria").hp], [19, 25]);
  assert.deepEqual(result.spell.casterHeal, { amount: 5, before: 20, after: 25 });
  assert.deepEqual(healed, [["aria", 25]], "the caster's HP bar, text and memory follow");
  assert.equal(slots()["spell-slot-3"], undefined, "no slot spent by the touch");
  await history.undoHistoryThrough((await attackEntry()).id, { sceneEpoch: currentSceneEpoch() });
  assert.deepEqual([meta("ghoul").hp, meta("aria").hp], [30, 20]);
});

// CAP-LINK: Invisibility ends when its bearer attacks, in the attack's command; one Undo makes the bearer invisible again.
test("an invisible attacker loses Invisibility with the attack; one Undo gives it back", async () => {
  Object.assign(meta("aria"), {
    conditions: { version: 2, instances: [{ id: "inv-pill", condition: "Invisibile", active: true, targetId: "aria", parentEffectId: "inv-1", sourceId: "aria", type: "spell" }] },
    "com.thebigpicture.initiative/spells": [{ instanceId: "inv-1", spellId: "invisibility", name: "Invisibilità", source: "aria", turns: 600 }],
  });
  await attack({ attackInstanceId: "invisible-strike", outcome: "miss", componentAmounts: {} });
  const pills = () => (Array.isArray(meta("aria").conditions) ? meta("aria").conditions : meta("aria").conditions?.instances || []).map((entry) => entry.id);
  assert.deepEqual(pills(), []);
  const entry = await attackEntry();
  assert.equal(entry.payload.causality.linkEnds[0].spellId, "invisibility");
  await history.undoHistoryThrough(entry.id, { sceneEpoch: currentSceneEpoch() });
  assert.deepEqual(pills(), ["inv-pill"]);
});

test("a critical hit on a PC at 0 HP: no HP change, two death save failures, one Undo", async () => {
  Object.assign(meta("ghoul"), { attitude: "pc", hp: 0,
    conditions: { version: 2, instances: [{ id: "ko", condition: "Privo di sensi", active: true, targetId: "ghoul", type: "hp-zero" }] } });
  await attack({ attackInstanceId: "coup-de-grace", outcome: "critical" });
  assert.equal(meta("ghoul").hp, 0);
  assert.deepEqual(meta("ghoul").deathSaves, { successes: 0, failures: 2 });
  await history.undoHistoryThrough((await attackEntry()).id, { sceneEpoch: currentSceneEpoch() });
  assert.equal(meta("ghoul").deathSaves, undefined);
});

const reactionsOf = (id) => (meta(id).conditions?.instances || []).filter((instance) => instance.condition === "Reazione usata");

test("an attack off turn with the reaction: the attack and \"Reazione usata\" in one History entry; one Undo restores both", async () => {
  sceneMetadata["com.thebigpicture.initiative/state"] = { round: 2, order: ["aria", "ghoul"], current: 1 };
  const result = await attack({ attackInstanceId: "opportunity", useReaction: true });
  assert.deepEqual(result.reaction, { spent: true, alreadyUsed: false });
  assert.equal(meta("ghoul").hp, 13);
  assert.equal(reactionsOf("aria").length, 1);
  assert.equal(reactionsOf("aria")[0].expiry?.mode, "turn-start");
  assert.equal((await history.getHistoryEntries()).length, baselineCount + 1);
  const second = await attack({ attackInstanceId: "second", useReaction: true });
  assert.deepEqual(second.reaction, { spent: false, alreadyUsed: true });
  assert.equal(reactionsOf("aria").length, 1, "never marked twice");
  const entry = await attackEntry();
  await history.undoHistoryThrough(entry.id, { sceneEpoch: currentSceneEpoch() });
  assert.equal(meta("ghoul").hp, 30);
  assert.equal(reactionsOf("aria").length, 0);
});

test("an attack on the actor's own turn, or off turn without the reaction asked for, marks nothing", async () => {
  const own = await attack({ attackInstanceId: "own-turn", useReaction: true });
  assert.equal(own.reaction, undefined, "Aria's own turn");
  assert.equal(reactionsOf("aria").length, 0);
  sceneMetadata["com.thebigpicture.initiative/state"] = { round: 2, order: ["aria", "ghoul"], current: 1 };
  const plain = await attack({ attackInstanceId: "held" });
  assert.equal(plain.reaction, undefined);
  assert.equal(reactionsOf("aria").length, 0);
});

// The release of a readied spell in the console (lot T6d of docs/STUDIO_AZIONI_DI_TURNO.md): the hold as the spell panel's
// «Prepara» writes it (lot T6b), then the attack off the caster's turn with the reaction.
const SPELLS = "com.thebigpicture.initiative/spells";
const CONCENTRATION = "com.thebigpicture.initiative/concentration";
async function holdSpell(spellId, slotLevel) {
  const { getSpellDefinition } = await import("../src/spells-srd.js");
  const { buildSpellApplicationIntent, buildSpellApplicationPlan } = await import("../src/spellApplicationPlanCore.js");
  const intent = buildSpellApplicationIntent({ spell: getSpellDefinition(spellId), enteredName: spellId, turns: 1, casterId: "aria",
    targetIds: ["aria"], castContext: { readied: true, phase: "prepare", ...(slotLevel ? { slotLevel } : {}) } });
  const plan = buildSpellApplicationPlan({ intent, instanceId: `hold:${spellId}`, appliedAt: { round: 2, actorId: "aria", phase: "turn", turnKey: "2:0:aria" },
    casterName: "Aria" });
  const result = await effects.runEffectsMutation(plan.operations, { kind: "spell", label: plan.historyLabel, targetIds: ["aria"],
    history: { kind: "spell", label: plan.historyLabel } });
  assert.equal(result.status, "applied", JSON.stringify(result));
  sceneMetadata["com.thebigpicture.initiative/state"] = { round: 2, order: ["aria", "ghoul"], current: 1 };
  return `hold:${spellId}`;
}
const pillsOf = (id) => (meta(id).conditions?.instances || []).filter((instance) => instance.active !== false).map((instance) => instance.condition).sort();

test("a readied Scorching Ray released off turn: no slot, the hold ends with the first ray and the reaction; the next rays go on; one Undo each", async () => {
  meta("aria").initiativeCard = { characterBuild: [{ classId: "mago", level: 5 }], spellbook: { spellIds: ["scorching-ray"] } };
  const holdId = await holdSpell("scorching-ray", 3);
  assert.deepEqual(pillsOf("aria"), ["Azione preparata"]);
  const before = (await history.getHistoryEntries()).length;
  const presentation = await runtime.getPcAttackPresentation("aria", "book-attack:spell");
  const ray = (attackInstanceId, amount) => runtime.executePcAttack({ sourceId: "aria", actionId: "book-attack:spell", spellId: "scorching-ray",
    targetId: "ghoul", sceneIdentity: presentation.sceneIdentity, expectedAction: presentation.action, expectedDefenses: {}, outcome: "hit",
    componentAmounts: { c1: amount }, spellCast: { castId: "rays-1", slotLevel: 2 }, useReaction: true, attackInstanceId });
  const first = await ray("ray-a", 7);
  assert.equal(meta("ghoul").hp, 23);
  assert.deepEqual([first.spell.slotLevel, first.spell.index, first.spell.total, first.spell.slotSpent], [3, 1, 4, undefined],
    "the hold's slot, not the one asked for: four rays at the 3rd level, none spent");
  assert.deepEqual([first.spell.readiedRelease, first.readiedRelease?.name], [{ instanceId: holdId }, "Raggio rovente"]);
  assert.equal(meta("aria").classFeatureState?.resources?.["spell-slot-3"]?.current ?? 2, 2, "no slot spent at the release");
  assert.deepEqual(first.reaction, { spent: true, alreadyUsed: false, readied: true });
  assert.deepEqual(pillsOf("aria"), ["Reazione usata"], "the hold's pill gone, the reaction spent");
  assert.deepEqual([(meta("aria")[SPELLS] || []).filter((entry) => entry.instanceId === holdId), meta("aria")[CONCENTRATION]], [[], {}]);
  const second = await ray("ray-b", 6);
  assert.equal(meta("ghoul").hp, 17);
  assert.deepEqual([second.spell.index, second.spell.total, second.spell.slotSpent, second.spell.readiedRelease, second.readiedRelease],
    [2, 4, undefined, undefined, undefined], "the next ray goes on as any cast's");
  const entries = await history.getHistoryEntries();
  assert.equal(entries.length, before + 2);
  await history.undoHistoryThrough(entries.at(-2).id, { sceneEpoch: currentSceneEpoch() });
  assert.equal(meta("ghoul").hp, 30);
  assert.deepEqual(pillsOf("aria"), ["Azione preparata"], "Undo: the hold back, the reaction too");
  assert.deepEqual(Object.values(meta("aria")[CONCENTRATION] || {}).map((entry) => entry.instanceId), [holdId]);
});

test("a readied Fire Bolt released off turn ends its hold even on a miss; on the caster's own turn Fire Bolt is a plain cast", async () => {
  meta("aria").initiativeCard = { characterBuild: [{ classId: "mago", level: 5 }], spellbook: { spellIds: ["fire-bolt"] } };
  const holdId = await holdSpell("fire-bolt", null);
  const presentation = await runtime.getPcAttackPresentation("aria", "book-attack:cantrip");
  const bolt = (attackInstanceId, extra = {}) => runtime.executePcAttack({ sourceId: "aria", actionId: "book-attack:cantrip", spellId: "fire-bolt",
    targetId: "ghoul", sceneIdentity: presentation.sceneIdentity, expectedAction: presentation.action, expectedDefenses: {}, outcome: "miss",
    componentAmounts: {}, attackInstanceId, ...extra });
  sceneMetadata["com.thebigpicture.initiative/state"] = { round: 2, order: ["aria", "ghoul"], current: 0 };
  const own = await bolt("own-turn");
  assert.equal(own.readiedRelease, undefined, "Aria's own turn: no release");
  assert.deepEqual(pillsOf("aria"), ["Azione preparata"], "the hold stays");
  sceneMetadata["com.thebigpicture.initiative/state"] = { round: 2, order: ["aria", "ghoul"], current: 1 };
  const released = await bolt("released", { useReaction: true });
  assert.deepEqual(released.readiedRelease, { instanceId: holdId, spellId: "fire-bolt", name: "Dardo di fuoco" });
  assert.equal(meta("ghoul").hp, 30);
  assert.deepEqual(pillsOf("aria"), ["Reazione usata"]);
  assert.deepEqual(meta("aria")[CONCENTRATION], {});
});

// Preparare → Un incantesimo held straight from the console (after lot T6e): the hold, the slot and the other
// concentrations in one command; one Undo gives everything back.
test("Preparare → Un incantesimo from the console: Fireball held at the 3rd level, its slot spent, one Undo", async () => {
  meta("aria").initiativeCard = { characterBuild: [{ classId: "mago", level: 5 }], spellbook: { spellIds: ["fireball", "misty-step"] } };
  meta("aria").attitude = "pc";
  const presentation = await runtime.getPcAttackPresentation("aria", "");
  const prepare = (extra = {}) => runtime.executePcReadiedSpell({ sourceId: "aria", spellId: "fireball", slotLevel: 3,
    attackInstanceId: "ready-fireball", sceneIdentity: presentation.sceneIdentity, ...extra });
  const result = await prepare();
  assert.deepEqual([result.hold.name, result.hold.slotLevel, result.spent], ["Palla di fuoco", 3, "slot di 3° livello"]);
  assert.equal(meta("aria").classFeatureState.resources["spell-slot-3"].current, 1, "a 3rd-level slot spent");
  const pill = (meta("aria").conditions?.instances || []).find((instance) => instance.condition === "Azione preparata");
  assert.equal(pill.displayLabel, "Azione preparata · Palla di fuoco (3°)");
  assert.equal(pill.mechanics?.gmOnly, undefined, "a PC's hold is seen by all (P10)");
  const record = (meta("aria")[SPELLS] || []).find((entry) => entry.castContext?.readied === true);
  assert.deepEqual([record.spellId, record.castContext.phase, record.castContext.slotLevel], ["fireball", "prepare", 3]);
  assert.deepEqual(Object.values(meta("aria")[CONCENTRATION]).map((entry) => entry.instanceId), [record.instanceId]);
  const entry = (await history.getHistoryEntries()).at(-1);
  assert.equal(entry.label, "Preparazione: Palla di fuoco");
  assert.deepEqual((await prepare()).duplicate, true, "a retry with the same identity returns the stored result");
  await assert.rejects(runtime.executePcReadiedSpell({ sourceId: "aria", spellId: "fireball", slotLevel: 3, attackInstanceId: "again",
    sceneIdentity: presentation.sceneIdentity }), /Ha già un'azione preparata/u);
  await history.undoHistoryThrough(entry.id, { sceneEpoch: currentSceneEpoch() });
  assert.equal(meta("aria").classFeatureState?.resources?.["spell-slot-3"]?.current ?? 2, 2, "Undo gives the slot back");
  assert.equal((meta("aria").conditions?.instances || []).some((instance) => instance.condition === "Azione preparata"), false);
  assert.deepEqual(meta("aria")[CONCENTRATION] || {}, {});
});

test("Preparare → Un incantesimo: only on the caster's turn, only a spell cast with 1 action; an enemy's hold stays the GM's", async () => {
  meta("aria").initiativeCard = { characterBuild: [{ classId: "mago", level: 5 }], spellbook: { spellIds: ["fireball", "misty-step", "fire-bolt"] } };
  const presentation = await runtime.getPcAttackPresentation("aria", "");
  const prepare = (spellId, extra = {}) => runtime.executePcReadiedSpell({ sourceId: "aria", spellId, attackInstanceId: `ready-${spellId}-${Math.random()}`,
    sceneIdentity: presentation.sceneIdentity, ...extra });
  await assert.rejects(prepare("misty-step"), /Si prepara solo un incantesimo da 1 azione/u, "a bonus action");
  sceneMetadata["com.thebigpicture.initiative/state"] = { round: 2, order: ["aria", "ghoul"], current: 1 };
  await assert.rejects(prepare("fire-bolt"), /Solo nel turno della creatura/u);
  sceneMetadata["com.thebigpicture.initiative/state"] = { round: 2, order: ["aria", "ghoul"], current: 0 };
  meta("aria").attitude = "enemy";
  const cantrip = await prepare("fire-bolt");
  assert.deepEqual([cantrip.hold.name, cantrip.hold.slotLevel, cantrip.spent], ["Dardo di fuoco", undefined, ""], "a cantrip: no slot (P11)");
  const pill = (meta("aria").conditions?.instances || []).find((instance) => instance.condition === "Azione preparata");
  assert.deepEqual([pill.displayLabel, pill.mechanics?.gmOnly], ["Azione preparata · Dardo di fuoco", true], "an enemy's hold: the GM's (P10)");
});

// Lot T4a of docs/STUDIO_AZIONI_DI_TURNO.md (decision A1): an action granted by a feature, from its card in Capacità:
// the Azioni tab's command with the feature's cost in it; one Undo gives everything back.
test("Passo del Vento: the Dash and its ki in one History entry; one Undo gives back both", async () => {
  meta("aria").initiativeCard = { characterBuild: [{ classId: "monaco", level: 2 }] };
  const presentation = await runtime.getPcAttackPresentation("aria", "");
  const result = await runtime.executePcTurnAction({ sourceId: "aria", kind: "dash", via: "monaco-ki-passo-del-vento",
    attackInstanceId: "wind-1", sceneIdentity: presentation.sceneIdentity });
  assert.deepEqual(result.turnAction.via, { featureId: "monaco-ki-passo-del-vento", name: "Passo del Vento", spent: "Punti Ki 1/2" });
  assert.equal(meta("aria").classFeatureState.resources["monaco-punti-ki"].current, 1);
  assert.equal(meta("aria").pcAttackState.turnActions.dashes, 1, "the movement panel's dash");
  const entry = (await history.getHistoryEntries()).at(-1);
  assert.equal(entry.label, "Aria: Scatto (Passo del Vento)");
  await assert.rejects(runtime.executePcTurnAction({ sourceId: "aria", kind: "hide", via: "monaco-ki-passo-del-vento",
    attackInstanceId: "wind-2", sceneIdentity: presentation.sceneIdentity }), /non dà questa azione/u);
  await history.undoHistoryThrough(entry.id, { sceneEpoch: currentSceneEpoch() });
  assert.equal(meta("aria").classFeatureState?.resources?.["monaco-punti-ki"]?.current ?? 2, 2, "the ki back");
  assert.equal(meta("aria").pcAttackState?.turnActions?.dashes ?? 0, 0, "the dash gone");
});

test("Scarica di adrenalina: the Dash, its use and its temporary hit points in one entry; one Undo removes them", async () => {
  meta("aria").initiativeCard = { characterBuild: [{ classId: "guerriero", level: 4 }], species: { id: "orco-multiverso" } };
  const presentation = await runtime.getPcAttackPresentation("aria", "");
  const result = await runtime.executePcTurnAction({ sourceId: "aria", kind: "dash", via: "specie-orco-multiverso-scarica-di-adrenalina",
    attackInstanceId: "rush-1", sceneIdentity: presentation.sceneIdentity });
  assert.deepEqual(result.turnAction.via.tempHp, { amount: 2, after: 2 });
  assert.deepEqual([meta("aria").hp, meta("aria").hpMax, meta("aria").tempHp], [40, 40, 2], "PB 2, the HP untouched");
  const pool = Object.entries(meta("aria").classFeatureState.resources).find(([id]) => id.includes("adrenalina"));
  assert.equal(pool?.[1].current, 1, "one use of two spent");
  const entry = (await history.getHistoryEntries()).at(-1);
  assert.equal(entry.label, "Aria: Scatto (Scarica di adrenalina)");
  await history.undoHistoryThrough(entry.id, { sceneEpoch: currentSceneEpoch() });
  assert.equal(meta("aria").tempHp ?? 0, 0, "the temporary hit points gone");
  assert.equal(meta("aria").classFeatureState?.resources?.[pool[0]]?.current ?? 2, 2, "the use back");
});

// Lot T4b (decision A2): a movement without opportunity attacks granted by a feature, in one command.
test("Schermagliatore in the ghoul's turn: «Movimento: no AdO» until that turn's end and the reaction, in one entry; one Undo", async () => {
  meta("aria").initiativeCard = { characterBuild: [{ classId: "ladro", level: 3, subclassId: "ladro-esploratore" }] };
  sceneMetadata["com.thebigpicture.initiative/state"] = { round: 2, order: ["aria", "ghoul"], current: 1 };
  const presentation = await runtime.getPcAttackPresentation("aria", "");
  const result = await runtime.executePcNoOpportunity({ sourceId: "aria", via: "ladro-esploratore-schermagliatore", targetIds: [],
    attackInstanceId: "skirmish-1", sceneIdentity: presentation.sceneIdentity });
  assert.deepEqual([result.turnAction.kind, result.turnAction.movers, result.turnAction.reaction], ["no-opportunity", ["Aria"], true]);
  const pills = (meta("aria").conditions?.instances || []).filter((instance) => instance.active !== false);
  const move = pills.find((instance) => instance.condition === "Movimento: no AdO");
  assert.deepEqual([move.expiry.mode, move.expiry.actorId], ["turn-end", "ghoul"], "until the end of the ghoul's turn");
  assert.ok(pills.some((instance) => instance.condition === "Reazione usata"));
  const entry = (await history.getHistoryEntries()).at(-1);
  assert.equal(entry.label, "Aria: Schermagliatore");
  await assert.rejects(runtime.executePcNoOpportunity({ sourceId: "aria", via: "ladro-esploratore-schermagliatore", targetIds: [],
    attackInstanceId: "skirmish-2", sceneIdentity: presentation.sceneIdentity }), /ha già usato la reazione/u);
  await history.undoHistoryThrough(entry.id, { sceneEpoch: currentSceneEpoch() });
  assert.deepEqual((meta("aria").conditions?.instances || []).filter((instance) => instance.active !== false).map((instance) => instance.condition), []);
});

// Lot T4c (decision A3): a class pill «Invisibile» that ends on an attack goes in the attack's own command.
test("Cloak of Shadows ends with the attack, hit or miss, in its command; Psychic Veil stays on a miss", async () => {
  const pill = (featureId) => ({ version: 2, instances: [{ id: `invisible-${featureId}`, condition: "Invisibile", effectId: featureId,
    sourceId: "aria", targetId: "aria", active: true, expiry: { mode: "manual" }, createdAt: 1 }] });
  const pillsOf = () => (meta("aria").conditions?.instances || []).filter((instance) => instance.active !== false).map((instance) => instance.effectId);
  meta("aria").conditions = pill("chierico-dominio-dell-inganno-incanalare-divinita-manto-di-ombre");
  await attack({ outcome: "miss", componentAmounts: {} });
  assert.deepEqual(pillsOf(), [], "a miss ends it too");
  const entry = await attackEntry();
  await history.undoHistoryThrough(entry.id, { sceneEpoch: currentSceneEpoch() });
  assert.deepEqual(pillsOf(), ["chierico-dominio-dell-inganno-incanalare-divinita-manto-di-ombre"], "Undo brings it back");
  meta("aria").conditions = pill("ladro-lama-spirituale-velo-psichico");
  await attack({ outcome: "miss", componentAmounts: {}, attackInstanceId: "veil-miss" });
  assert.deepEqual(pillsOf(), ["ladro-lama-spirituale-velo-psichico"], "no damage: the veil stays");
  await attack({ attackInstanceId: "veil-hit" });
  assert.deepEqual(pillsOf(), [], "damage dealt: the veil ends");
});
