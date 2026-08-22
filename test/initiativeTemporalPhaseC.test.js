import test from "node:test";
import assert from "node:assert/strict";
import { createInitiativeTemporalLane } from "../src/initiativeTemporalLaneCore.js";
import { createTurnNoticeDeliveryCapability } from "../src/turnNoticeDeliveryCore.js";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test("la temporal lane conserva FIFO e non applica il descriptor successivo dopo un failure semantico", async () => {
  const applied = [];
  const events = [];
  let fail = true;
  const lane = createInitiativeTemporalLane({
    apply: async (descriptor) => {
      if (fail) {
        fail = false;
        return { status: "conflict", reason: "semantic-conflict" };
      }
      applied.push(descriptor.transitionSeq);
      return { status: "applied" };
    },
    isCurrent: () => true,
    onEvent: (event) => events.push(event),
  });

  const first = lane.enqueue({ transitionSeq: 1, metadataRevision: 1 });
  const second = lane.enqueue({ transitionSeq: 2, metadataRevision: 2 });
  assert.equal((await first).status, "blocked");
  assert.equal((await second).status, "blocked");
  assert.deepEqual(applied, []);
  assert.ok(events.some((event) => event.type === "blocked"));
  assert.equal(lane.recover("semantic-failure"), false);
  assert.equal(lane.getState().status, "semantic-blocked");

  lane.reset("scene-unload");
  const recovered = await lane.enqueue({ transitionSeq: 3, metadataRevision: 3 });
  assert.equal(recovered.status, "applied");
  assert.deepEqual(applied, [3]);
  assert.equal(lane.getState().blocked, false);
});

test("transport-pending mantiene A come HEAD e recover drena A→B→C in FIFO", async () => {
  const applied = [];
  const events = [];
  let transportAvailable = false;
  const lane = createInitiativeTemporalLane({
    recoveryDelayMs: null,
    apply: async (descriptor) => {
      if (!transportAvailable) {
        return {
          status: "failed",
          error: { name: "BackgroundTransportError", message: "offline" },
        };
      }
      applied.push(descriptor.transitionSeq);
      return { status: "applied" };
    },
    isCurrent: () => true,
    onEvent: (event) => events.push(event),
  });

  const results = [
    lane.enqueue({ transitionSeq: 1, commandId: "temporal-A" }),
    lane.enqueue({ transitionSeq: 2, commandId: "temporal-B" }),
    lane.enqueue({ transitionSeq: 3, commandId: "temporal-C" }),
  ];
  await tick();
  assert.equal(lane.getState().status, "transport-pending");
  assert.equal(lane.getState().blocked, false);
  assert.equal(lane.getState().transportPending, true);
  assert.deepEqual(applied, []);

  transportAvailable = true;
  assert.equal(lane.recover("transport-restored"), true);
  assert.deepEqual((await Promise.all(results)).map((result) => result.status), [
    "applied",
    "applied",
    "applied",
  ]);
  assert.deepEqual(applied, [1, 2, 3]);
  assert.ok(events.some((event) => event.type === "transport-pending"));
  assert.ok(events.some((event) => event.type === "recovery-attempt"));
  assert.equal(events.filter((event) => event.type === "applied").length, 3);
  assert.equal(lane.getState().status, "queued");
});

test("molte transition restano accodate durante l'outage e riprendono senza inversioni", async () => {
  const applied = [];
  let transportAvailable = false;
  const lane = createInitiativeTemporalLane({
    recoveryDelayMs: null,
    apply: async (descriptor) => {
      if (!transportAvailable) {
        return {
          status: "failed",
          error: { name: "BackgroundTransportError", message: "offline" },
        };
      }
      applied.push(descriptor.transitionSeq);
      return { status: "applied" };
    },
    isCurrent: () => true,
  });

  const results = Array.from({ length: 20 }, (_, index) => lane.enqueue({
    transitionSeq: index + 1,
    commandId: `temporal-stress-${index + 1}`,
  }));
  await tick();
  assert.equal(lane.getState().status, "transport-pending");
  assert.equal(lane.getState().pending, 20);
  assert.deepEqual(applied, []);

  transportAvailable = true;
  lane.recover("navigation-activity");
  await Promise.all(results);
  assert.deepEqual(applied, Array.from({ length: 20 }, (_, index) => index + 1));
});

test("scene reset cancella il transport-pending e non riavvia la coda della scena precedente", async () => {
  let applyCount = 0;
  const lane = createInitiativeTemporalLane({
    recoveryDelayMs: null,
    apply: async () => {
      applyCount += 1;
      return {
        status: "failed",
        error: { name: "BackgroundTransportError", message: "offline" },
      };
    },
    isCurrent: () => true,
  });

  const result = lane.enqueue({ transitionSeq: 1, commandId: "old-scene-A" });
  await tick();
  assert.equal(lane.getState().status, "transport-pending");

  lane.reset("scene-unload");
  assert.equal(lane.getState().status, "queued");
  assert.equal(lane.getState().transportPending, false);
  assert.equal(lane.recover("late-transport-success"), false);
  assert.equal((await result).status, "stale");
  assert.equal(applyCount, 1);
});

test("la temporal lane processa A→B→C→D in ordine anche se la UI arriva già a D", async () => {
  const applied = [];
  const lane = createInitiativeTemporalLane({
    apply: async (descriptor) => {
      applied.push(descriptor.transitionSeq);
      await tick();
      return { status: "applied" };
    },
    isCurrent: () => true,
  });

  const results = await Promise.all([
    lane.enqueue({ transitionSeq: 1, metadataRevision: 10 }),
    lane.enqueue({ transitionSeq: 2, metadataRevision: 11 }),
    lane.enqueue({ transitionSeq: 3, metadataRevision: 12 }),
  ]);
  assert.deepEqual(results.map((result) => result.status), ["applied", "applied", "applied"]);
  assert.deepEqual(applied, [1, 2, 3]);
});

test("round 1→2 con transport failure recuperato non consuma il cursor e 2→1 resta inverso corretto", async () => {
  const appliedDeltas = [];
  let transportAttempts = 0;
  const lane = createInitiativeTemporalLane({
    apply: async (descriptor) => {
      transportAttempts += 1;
      if (transportAttempts === 1) {
        // Il transport retry è bounded e conserva descriptor/commandId; la
        // lane riceve l'ACK soltanto dopo il secondo attempt.
        transportAttempts += 1;
      }
      appliedDeltas.push(descriptor.roundDelta);
      return { status: "applied" };
    },
    isCurrent: () => true,
  });
  const forward = { transitionSeq: 10, roundDelta: -1, roundCommandId: "round-10" };
  const reverse = { transitionSeq: 11, roundDelta: 1, roundCommandId: "round-11" };
  assert.equal((await lane.enqueue(forward)).status, "applied");
  assert.equal((await lane.enqueue(reverse)).status, "applied");
  assert.equal(transportAttempts, 3);
  assert.deepEqual(appliedDeltas, [-1, 1]);
});

test("Turn Notice: failure non consuma la delivery key e un secondo producer deduplica", async () => {
  const sent = [];
  const events = [];
  let fail = true;
  const delivery = createTurnNoticeDeliveryCapability({
    send: async (payload) => {
      if (fail) {
        fail = false;
        throw new Error("transport-down");
      }
      sent.push(payload.turnKey);
      return true;
    },
    isCurrent: () => true,
    onEvent: (event) => events.push(event),
  });
  const notice = { type: "show-turn-notice", turnKey: "r1:tB", currentId: "B" };

  await delivery.request(notice, 4, { source: "navigation" });
  assert.equal(delivery.getState().lastDeliveredKey, "");
  await delivery.request(notice, 4, { source: "metadata" });
  await tick();
  assert.deepEqual(sent, ["r1:tB"]);
  assert.equal(delivery.getState().lastDeliveredKey, "4:r1:tB");
  assert.equal(events.filter((event) => event.type === "delivered").length, 1);
});

test("Turn Notice latest-wins: B/C superseded prima dell'invio e D viene consegnato", async () => {
  const sent = [];
  const delivery = createTurnNoticeDeliveryCapability({
    send: async (payload) => {
      sent.push(payload.turnKey);
      return true;
    },
    isCurrent: () => true,
  });

  const requests = [
    delivery.request({ turnKey: "r1:tB", currentId: "B" }, 7),
    delivery.request({ turnKey: "r1:tC", currentId: "C" }, 7),
    delivery.request({ turnKey: "r1:tD", currentId: "D" }, 7),
  ];
  await Promise.all(requests);
  assert.deepEqual(sent, ["r1:tD"]);
});

test("scene reset invalida pending/latest Turn Notice e temporal lane state", async () => {
  let allowSend;
  const sendGate = new Promise((resolve) => { allowSend = resolve; });
  const sent = [];
  const delivery = createTurnNoticeDeliveryCapability({
    send: async (payload) => {
      await sendGate;
      sent.push(payload.turnKey);
      return true;
    },
    isCurrent: () => true,
  });
  const pending = delivery.request({ turnKey: "r1:tA", currentId: "A" }, 1);
  delivery.reset("scene-unload");
  allowSend();
  await pending;
  assert.deepEqual(sent, []);
  assert.equal(delivery.getState().lastDeliveredKey, "");
});
