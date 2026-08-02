import test from "node:test";
import assert from "node:assert/strict";

import {
  planOwnedSceneItemReconcile,
  reconcileOwnedSceneItems,
} from "../src/sceneItemReconcileCore.js";

function clone(value) {
  return structuredClone(value);
}

function desiredState() {
  return [
    { identity: "a", value: 2, attachedTo: "token-a", position: { x: 10, y: 20 } },
    { identity: "b", value: 3, attachedTo: "token-b", position: { x: 30, y: 40 } },
  ];
}

function initialState() {
  return [
    { id: "a-old", identity: "a", value: 1, attachedTo: "token-a", position: { x: 10, y: 20 } },
    { id: "a-duplicate", identity: "a", value: 0, attachedTo: "token-a", position: { x: 10, y: 20 } },
    { id: "orphan", identity: "orphan", value: 1 },
  ];
}

function createFaultStore({ phase = null, timing = "before" } = {}) {
  let items = initialState();
  let nextId = 1;
  let injected = false;

  const maybeFail = (currentPhase, currentTiming) => {
    if (injected || phase !== currentPhase || timing !== currentTiming) return;
    injected = true;
    throw new Error(`fault:${currentPhase}:${currentTiming}`);
  };

  return {
    async readItems() {
      maybeFail("read", "before");
      const result = clone(items);
      maybeFail("read", "after");
      return result;
    },
    async addItems(additions) {
      maybeFail("add", "before");
      for (const item of additions) {
        items.push({ ...clone(item), id: item.id || `new-${nextId++}` });
      }
      maybeFail("add", "after");
    },
    async updateItems(updates) {
      maybeFail("update", "before");
      for (const { item, spec } of updates) {
        const target = items.find((entry) => entry.id === item.id);
        if (target) Object.assign(target, clone(spec));
      }
      maybeFail("update", "after");
    },
    async deleteItems(ids) {
      maybeFail("delete", "before");
      const removed = new Set(ids);
      items = items.filter((item) => !removed.has(item.id));
      maybeFail("delete", "after");
    },
    snapshot: () => clone(items),
  };
}

async function convergeWithFault(fault) {
  const store = createFaultStore(fault);
  const result = await reconcileOwnedSceneItems({
    desired: desiredState(),
    readItems: store.readItems,
    identityOfItem: (item) => item.identity,
    isCompatible: (item, spec) => item.attachedTo === spec.attachedTo,
    needsUpdate: (item, spec) => (
      item.value !== spec.value
      || item.position?.x !== spec.position.x
      || item.position?.y !== spec.position.y
    ),
    buildItem: (spec) => clone(spec),
    addItems: store.addItems,
    updateItems: store.updateItems,
    deleteItems: store.deleteItems,
  });
  const finalItems = store.snapshot().sort((left, right) => left.identity.localeCompare(right.identity));
  assert.deepEqual(finalItems.map((item) => ({
    identity: item.identity,
    value: item.value,
    attachedTo: item.attachedTo,
    position: item.position,
  })), desiredState());
  assert.equal(new Set(finalItems.map((item) => item.identity)).size, 2);
  return result;
}

test("il piano non elimina il vecchio item finché manca un sostituto compatibile", () => {
  const plan = planOwnedSceneItemReconcile({
    desired: [{ identity: "a", attachedTo: "new-token" }],
    existing: [{ id: "old", identity: "a", attachedTo: "old-token" }],
    identityOfItem: (item) => item.identity,
    isCompatible: (item, spec) => item.attachedTo === spec.attachedTo,
  });

  assert.equal(plan.additions.length, 1);
  assert.deepEqual(plan.deleteIds, ["old"]);
});

for (const phase of ["read", "add", "update", "delete"]) {
  for (const timing of ["before", "after"]) {
    test(`fault injection ${phase}/${timing} converge senza duplicati`, async () => {
      const result = await convergeWithFault({ phase, timing });
      assert.equal(result.outcome, "recovered");
      assert.equal(result.metrics.errors[0].phase, phase);
    });
  }
}

test("un cambio epoch interrompe la convergenza prima della mutazione successiva", async () => {
  const store = createFaultStore();
  let current = true;
  const result = await reconcileOwnedSceneItems({
    desired: desiredState(),
    readItems: async () => {
      const items = await store.readItems();
      current = false;
      return items;
    },
    identityOfItem: (item) => item.identity,
    buildItem: (spec) => clone(spec),
    addItems: store.addItems,
    updateItems: store.updateItems,
    deleteItems: store.deleteItems,
    isCurrent: () => current,
  });

  assert.equal(result.outcome, "stale");
  assert.deepEqual(store.snapshot(), initialState());
});
