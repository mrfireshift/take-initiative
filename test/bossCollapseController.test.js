import assert from "node:assert/strict";
import test, { mock } from "node:test";

const KEY = "com.thebigpicture.initiative/bossCollapse";
const STATE_KEY = "com.thebigpicture.initiative/state";
// A Hand Slam image cast in round 1: it collapses from round 3.
const marker = (stage = "cracked") => ({
  id: "slam:collapse", type: "IMAGE", image: { url: `http://localhost/boss-auril-hand-slam-${stage}.webp` },
  metadata: { [KEY]: { bossDefinitionId: "auril", actionId: "hand-slam", round: 1, collapseAfterRounds: 1, stage } },
});

let sceneItems = [marker()];
let snapshotComplete = true;
let sceneRound = 1;
const reads = { metadata: 0, items: 0 };
const writes = [];
let metadataListener = null;
const sdk = {
  player: { getRole: async () => "GM" },
  scene: {
    isReady: async () => true,
    onReadyChange: () => () => {},
    onMetadataChange: (listener) => { metadataListener = listener; return () => {}; },
    getMetadata: async () => { reads.metadata += 1; return { [STATE_KEY]: { round: sceneRound } }; },
    items: {
      getItems: async (filter) => { reads.items += 1; return structuredClone(sceneItems.filter(filter)); },
      updateItems: async (ids, recipe) => {
        const drafts = structuredClone(sceneItems.filter((item) => ids.includes(item.id)));
        const before = JSON.stringify(drafts);
        recipe(drafts);
        if (JSON.stringify(drafts) !== before) {
          writes.push(drafts.map((draft) => draft.metadata[KEY].stage));
          sceneItems = sceneItems.map((item) => drafts.find((draft) => draft.id === item.id) || item);
        }
      },
    },
  },
};
mock.module("@owlbear-rodeo/sdk", { exports: { default: sdk } });
mock.module("../src/sceneItemEvents.js", { exports: {
  readSceneItemsSnapshot: () => ({ complete: snapshotComplete, items: snapshotComplete ? structuredClone(sceneItems) : [] }),
} });
const { mountBossCollapseController, unmountBossCollapseController } = await import("../src/bossCollapseController.js");
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

test("il crollo del boss legge le immagini dallo snapshot e il round dall'evento, senza chiamate SDK a ogni turno", async () => {
  assert.equal(await mountBossCollapseController(), true);
  await settle();
  assert.equal(reads.items, 0, "the complete snapshot holds the marked images");
  assert.equal(reads.metadata, 1, "the first pass, before any event, reads the round");

  metadataListener({ [STATE_KEY]: { round: 2, current: 0, order: ["auril"] } });
  await settle();
  assert.deepEqual(writes, [], "round 2: still cracked, nothing to write");

  metadataListener({ [STATE_KEY]: { round: 3, current: 0, order: ["auril"] } });
  await settle();
  assert.deepEqual(writes, [["collapsed"]], "round 3: the area collapses");
  assert.equal(reads.metadata, 1, "the rounds came from the events");
  assert.equal(reads.items, 0);
  unmountBossCollapseController();
});

test("un'immagine già allo stadio giusto non viene riscritta, e senza snapshot completo si legge la scena", async () => {
  sceneItems = [marker("collapsed")];
  writes.length = 0;
  snapshotComplete = false;
  sceneRound = 4;
  reads.items = 0;
  assert.equal(await mountBossCollapseController(), true);
  await settle();
  metadataListener({ [STATE_KEY]: { round: 4, current: 0, order: ["auril"] } });
  await settle();
  assert.ok(reads.items >= 1, "no complete snapshot: the marked images are read from the scene");
  assert.deepEqual(writes, [], "already collapsed: no write");
  unmountBossCollapseController();
});

// Lot L11 of the bugfix pass (AT-07): Svuota writes round 1, and the collapsed area came back cracked.
test("L11: dopo Svuota l'area crollata resta crollata, anche nel combattimento dopo; il ◀ in combattimento la riporta incrinata", async () => {
  sceneItems = [marker()];
  writes.length = 0;
  snapshotComplete = true;
  assert.equal(await mountBossCollapseController(), true);
  await settle();
  metadataListener({ [STATE_KEY]: { round: 3, current: 0, order: ["auril"] } });
  await settle();
  metadataListener({ [STATE_KEY]: { round: 2, current: 0, order: ["auril"] } });
  await settle();
  assert.deepEqual(writes, [["collapsed"], ["cracked"]], "«Turno precedente» in the combat: back to cracked, as documented");
  metadataListener({ [STATE_KEY]: { round: 3, current: 0, order: ["auril"] } });
  await settle();
  writes.length = 0;
  metadataListener({ [STATE_KEY]: { round: 1, current: 0, order: [] } });
  await settle();
  assert.deepEqual(writes, [["collapsed"]], "Svuota settles the area at its stage");
  assert.equal(sceneItems[0].metadata[KEY].settled, true);
  assert.equal(sceneItems[0].image.url, "http://localhost/boss-auril-hand-slam-collapsed.webp");
  metadataListener({ [STATE_KEY]: { round: 1, current: 0, order: ["goblin"] } });
  await settle();
  metadataListener({ [STATE_KEY]: { round: 2, current: 0, order: ["goblin"] } });
  await settle();
  assert.deepEqual(writes, [["collapsed"]], "a new combat at round 1 and 2 leaves it collapsed");
  unmountBossCollapseController();
});
