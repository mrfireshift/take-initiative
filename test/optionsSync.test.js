import assert from "node:assert/strict";
import test from "node:test";
import { resolveOptions } from "../src/options/optionsResolve.js";
import { refreshOptionsUntilRevision } from "../src/options/optionsSync.js";

test("OPTIONS-003: il Player ripete la rilettura finché raggiunge la revisione GM", async () => {
  let refreshes = 0;
  let snapshot = resolveOptions({
    room: { updatedAt: 10 },
    scene: { updatedAt: 20 },
  });
  const service = {
    get(selector) { return selector(snapshot); },
    async refresh() {
      refreshes += 1;
      if (refreshes === 3) {
        snapshot = resolveOptions({
          room: { updatedAt: 100, turn: { popup: false } },
          scene: { updatedAt: 110 },
        });
      }
    },
  };

  const revision = await refreshOptionsUntilRevision(service, {
    roomUpdatedAt: 100,
    sceneUpdatedAt: 110,
  }, {
    attempts: 4,
    delaysMs: [0],
    wait: async () => {},
  });

  assert.equal(refreshes, 3);
  assert.deepEqual(revision, { roomUpdatedAt: 100, sceneUpdatedAt: 110 });
});

test("OPTIONS-003: la sincronizzazione remota segnala una replica mai convergente", async () => {
  const snapshot = resolveOptions({
    room: { updatedAt: 1 },
    scene: { updatedAt: 2 },
  });
  let refreshes = 0;
  const service = {
    get(selector) { return selector(snapshot); },
    async refresh() { refreshes += 1; },
  };

  await assert.rejects(
    refreshOptionsUntilRevision(service, {
      roomUpdatedAt: 9,
      sceneUpdatedAt: 10,
    }, {
      attempts: 3,
      delaysMs: [0],
      wait: async () => {},
    }),
    /options-revision-timeout/,
  );
  assert.equal(refreshes, 3);
});
