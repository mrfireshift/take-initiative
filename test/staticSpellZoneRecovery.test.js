import test from "node:test";
import assert from "node:assert/strict";

import { runStaticSpellZoneRemovalTransaction } from "../src/staticSpellZoneRemovalCore.js";

const snapshots = [
  { id: "zone-root", attachedTo: null },
  { id: "zone-geometry", attachedTo: "zone-root" },
];

function createStore({ phase, timing }) {
  let items = structuredClone(snapshots);
  let injected = false;
  const fail = (currentPhase, currentTiming) => {
    if (injected || phase !== currentPhase || timing !== currentTiming) return;
    injected = true;
    throw new Error(`fault:${currentPhase}:${currentTiming}`);
  };
  return {
    readItems: async (ids) => items
      .filter((item) => ids.includes(item.id))
      .map((item) => structuredClone(item)),
    deleteItems: async (ids) => {
      fail("delete", "before");
      items = items.filter((item) => !ids.includes(item.id));
      fail("delete", "after");
    },
    addItems: async (values) => {
      fail("add", "before");
      for (const value of values) {
        if (!items.some((item) => item.id === value.id)) items.push(structuredClone(value));
      }
      fail("add", "after");
    },
    snapshot: () => structuredClone(items),
  };
}

for (const timing of ["before", "after"]) {
  test(`la rimozione zona recupera un delete ambiguo ${timing}`, async () => {
    const store = createStore({ phase: "delete", timing });
    let actionCalls = 0;
    const result = await runStaticSpellZoneRemovalTransaction({
      snapshots,
      readItems: store.readItems,
      deleteItems: store.deleteItems,
      addItems: store.addItems,
      action: async () => {
        actionCalls += 1;
        return "committed";
      },
    });

    assert.equal(result, "committed");
    assert.equal(actionCalls, 1);
    assert.deepEqual(store.snapshot(), []);
  });

  test(`il rollback zona recupera un add ambiguo ${timing}`, async () => {
    const store = createStore({ phase: "add", timing });
    await assert.rejects(
      runStaticSpellZoneRemovalTransaction({
        snapshots,
        readItems: store.readItems,
        deleteItems: store.deleteItems,
        addItems: store.addItems,
        action: async () => { throw new Error("action-failed"); },
      }),
      /action-failed/,
    );

    assert.deepEqual(
      store.snapshot().sort((left, right) => left.id.localeCompare(right.id)),
      structuredClone(snapshots).sort((left, right) => left.id.localeCompare(right.id)),
    );
  });
}
