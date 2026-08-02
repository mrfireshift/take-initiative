import assert from "node:assert/strict";
import test from "node:test";
import { ACTIVE_TURN_LABEL_META, ID } from "../src/constants.js";
import {
  classifySceneItemChanges,
  createSceneItemChangeDispatcher,
} from "../src/sceneItemChangeDispatcherCore.js";

const META_KEY = ID + "/meta";
const CONCENTRATION_META_KEY = ID + "/concentration";

function token(overrides = {}) {
  return {
    id: "token-1",
    type: "IMAGE",
    name: "Goblin",
    position: { x: 0, y: 0 },
    image: { url: "goblin.png" },
    metadata: { [META_KEY]: { hp: 10, hpMax: 10, attitude: "enemy" } },
    ...overrides,
  };
}

test("classifies movement without scheduling tracker or HP work", () => {
  const before = token();
  const after = token({ position: { x: 70, y: 0 } });
  const event = classifySceneItemChanges([before], [after]);

  assert.equal(event.flags.movement, true);
  assert.equal(event.flags.tracker, false);
  assert.equal(event.flags.hpBars, false);
  assert.equal(event.flags.hpMemoryAutofill, false);
});

test("classifies persisted speed state without scheduling a tracker render", () => {
  const before = token();
  const after = token({
    metadata: {
      [META_KEY]: {
        hp: 10,
        hpMax: 10,
        attitude: "enemy",
        speedCheckMovement: { turnKey: "1:0:token-1", totalMeters: 1.5 },
      },
    },
  });
  const event = classifySceneItemChanges([before], [after]);

  assert.equal(event.flags.speedCheck, true);
  assert.equal(event.flags.tracker, false);
  assert.equal(event.flags.hpMemoryAutofill, false);
});

test("classifies canonical HP, conditions and concentration independently", () => {
  const before = token();
  const hpEvent = classifySceneItemChanges([before], [token({
    metadata: { [META_KEY]: { hp: 6, hpMax: 10, attitude: "enemy" } },
  })]);
  assert.equal(hpEvent.flags.hpBars, true);
  assert.equal(hpEvent.flags.tracker, true);
  assert.equal(hpEvent.flags.conditions, false);
  assert.equal(hpEvent.flags.concentration, false);

  const conditionsEvent = classifySceneItemChanges([before], [token({
    metadata: {
      [META_KEY]: {
        hp: 10,
        hpMax: 10,
        attitude: "enemy",
        conditions: { Prono: true },
      },
    },
  })]);
  assert.equal(conditionsEvent.flags.conditions, true);
  assert.equal(conditionsEvent.flags.concentration, false);

  const concentrationEvent = classifySceneItemChanges([before], [token({
    metadata: {
      [META_KEY]: {
        hp: 10,
        hpMax: 10,
        attitude: "enemy",
        [CONCENTRATION_META_KEY]: { benedizione: { targets: ["token-1"] } },
      },
    },
  })]);
  assert.equal(concentrationEvent.flags.concentration, true);
  assert.equal(concentrationEvent.flags.conditions, false);
});

test("recognizes active-turn label-only updates", () => {
  const before = {
    id: "label-1",
    type: "LABEL",
    text: { plainText: "Turno di Goblin" },
    position: { x: 0, y: 0 },
    metadata: { [ACTIVE_TURN_LABEL_META]: { enabled: true } },
  };
  const after = { ...before, position: { x: 20, y: 30 } };
  const event = classifySceneItemChanges([before], [after]);

  assert.equal(event.flags.activeTurnLabelOnly, true);
  assert.equal(event.flags.tracker, false);
  assert.equal(event.flags.hpBars, false);
});

test("classifies token removal conservatively", () => {
  const event = classifySceneItemChanges([token()], []);

  assert.equal(event.flags.removed, true);
  assert.equal(event.flags.tracker, true);
  assert.equal(event.flags.hpBars, true);
  assert.equal(event.flags.conditions, true);
  assert.equal(event.flags.concentration, true);
  assert.deepEqual(event.changedIds, ["token-1"]);
  assert.equal(event.changedRecords.length, 1);
  assert.equal(event.changedRecords[0].before.item.id, "token-1");
  assert.equal(event.changedRecords[0].after, null);
});

test("schedules HP autofill when a new character token enters the scene", () => {
  const event = classifySceneItemChanges([], [token({ layer: "CHARACTER", metadata: {} })]);

  assert.equal(event.flags.added, true);
  assert.equal(event.flags.hpMemoryAutofill, true);
  assert.equal(event.changedRecords.length, 1);
  assert.equal(event.changedRecords[0].before, null);
  assert.equal(event.changedRecords[0].after.item.id, "token-1");
});

test("exposes the exact transition when an existing token enters initiative", () => {
  const before = token({ layer: "CHARACTER" });
  const after = token({
    layer: "CHARACTER",
    metadata: {
      [META_KEY]: {
        hp: 10,
        hpMax: 10,
        attitude: "enemy",
        initiative: 10,
        inInitiative: true,
      },
    },
  });
  const event = classifySceneItemChanges([before], [after]);

  assert.equal(event.flags.added, false);
  assert.equal(event.flags.tracker, true);
  assert.equal(event.changedRecords[0].before.item.metadata[META_KEY].inInitiative, undefined);
  assert.equal(event.changedRecords[0].after.item.metadata[META_KEY].inInitiative, true);
});

test("i widget derivati non riattivano i renderer degli effetti", () => {
  const conditionWidget = {
    id: "condition-widget-1",
    type: "SHAPE",
    position: { x: 0, y: 0 },
    metadata: { [ID + "/condWidgetOf"]: "token-1" },
  };
  const event = classifySceneItemChanges([], [conditionWidget]);

  assert.equal(event.flags.widgets, true);
  assert.equal(event.flags.concentration, false);
  assert.equal(event.flags.conditions, false);
  assert.equal(event.flags.tracker, false);

  const concentrationWidget = {
    id: "concentration-widget-1",
    type: "LABEL",
    position: { x: 0, y: 0 },
    metadata: {
      [ID + "/concWidgetOf"]: "token-1",
      [ID + "/concWidgetCaster"]: "caster-1",
    },
  };
  const concentrationEvent = classifySceneItemChanges([], [concentrationWidget]);
  assert.equal(concentrationEvent.flags.widgets, true);
  assert.equal(concentrationEvent.flags.concentration, false);
  assert.equal(concentrationEvent.flags.conditions, false);
});

test("debounces derived work while immediate subscribers receive every movement", async () => {
  let emit;
  let pendingTimer = null;
  let schedules = 0;
  let cancellations = 0;
  const dispatcher = createSceneItemChangeDispatcher({
    initialItems: [token()],
    subscribeSource(callback) {
      emit = callback;
      return () => {};
    },
    setTimer(callback) {
      schedules += 1;
      pendingTimer = callback;
      return callback;
    },
    clearTimer(handle) {
      cancellations += 1;
      if (pendingTimer === handle) pendingTimer = null;
    },
  });

  const immediate = [];
  const batched = [];
  dispatcher.subscribe((event) => immediate.push(event), { immediate: true });
  dispatcher.subscribe((event) => batched.push(event));

  emit([token({ position: { x: 70, y: 0 } })]);
  emit([token({ position: { x: 140, y: 0 } })]);

  assert.equal(immediate.length, 2);
  assert.equal(batched.length, 0);
  assert.equal(schedules, 2);
  assert.equal(cancellations, 1);

  await dispatcher.flush();
  assert.equal(batched.length, 1);
  assert.equal(batched[0].flags.movement, true);
  assert.deepEqual(batched[0].items[0].position, { x: 140, y: 0 });
});

test("un cambio scena idrata il baseline senza trasformarlo in aggiunte o rimozioni", async () => {
  let emit;
  let pendingTimer = null;
  let epoch = 4;
  const dispatcher = createSceneItemChangeDispatcher({
    initialItems: [token({ id: "scene-a-token" })],
    getEpoch: () => epoch,
    subscribeSource(callback) {
      emit = callback;
      return () => {};
    },
    setTimer(callback) {
      pendingTimer = callback;
      return callback;
    },
    clearTimer(handle) {
      if (pendingTimer === handle) pendingTimer = null;
    },
  });
  const events = [];
  dispatcher.subscribe((event) => events.push(event));

  emit([token({ id: "scene-a-token", position: { x: 70, y: 0 } })]);
  dispatcher.suspend();
  epoch = 5;
  dispatcher.resume([token({ id: "scene-b-token" })]);
  emit([token({ id: "scene-b-token" })]);
  await dispatcher.flush();

  assert.equal(events.length, 0);

  emit([token({ id: "scene-b-token", position: { x: 70, y: 0 } })]);
  await dispatcher.flush();

  assert.equal(events.length, 1);
  assert.equal(events[0].sceneEpoch, 5);
  assert.equal(events[0].flags.added, false);
  assert.equal(events[0].flags.removed, false);
  assert.equal(events[0].flags.movement, true);
  assert.deepEqual(events[0].items.map((item) => item.id), ["scene-b-token"]);
});

test("lo snapshot completo viene aggiornato e invalidato insieme al lifecycle", () => {
  let emit;
  const dispatcher = createSceneItemChangeDispatcher({
    initialItems: [token({ id: "scene-a-token" })],
    subscribeSource(callback) {
      emit = callback;
      return () => {};
    },
    setTimer(callback) { return callback; },
    clearTimer() {},
  });
  dispatcher.subscribe(() => {}, { immediate: true });

  const baseline = dispatcher.getSnapshot();
  assert.equal(baseline.complete, true);
  assert.deepEqual(baseline.items.map((item) => item.id), ["scene-a-token"]);

  emit([token({ id: "scene-a-token", position: { x: 70, y: 0 } })]);
  const changed = dispatcher.getSnapshot();
  assert.ok(changed.generation > baseline.generation);
  assert.deepEqual(changed.items[0].position, { x: 70, y: 0 });

  dispatcher.suspend();
  const suspended = dispatcher.getSnapshot();
  assert.equal(suspended.complete, false);
  assert.deepEqual(suspended.items, []);
  assert.ok(suspended.generation > changed.generation);

  dispatcher.resume([token({ id: "scene-b-token" })]);
  const resumed = dispatcher.getSnapshot();
  assert.equal(resumed.complete, true);
  assert.deepEqual(resumed.items.map((item) => item.id), ["scene-b-token"]);
  assert.ok(resumed.generation > suspended.generation);
});
