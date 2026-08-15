import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  SPELL_BOARD_TOKEN_META_KEY,
  spellBoardTokenMetadata,
} from "../src/spellBoardTokenCore.js";
import {
  spellBoardTokenTrackerItems,
  updateSpellBoardTokenSnapshot,
} from "../src/spellBoardTokenTrackerCore.js";
import { readFullRenderItemSnapshot } from "../src/initiativeFullRenderSnapshotCore.js";

const initiativeSource = readFileSync(
  new URL("../src/initiativeList.js", import.meta.url),
  "utf8",
);
const fullRenderStart = initiativeSource.indexOf("async function __executeFullRenderRequest");
const fullRenderEnd = initiativeSource.indexOf("OBR.onReady(async () => {", fullRenderStart + 10);
const fullRenderSource = initiativeSource.slice(fullRenderStart, fullRenderEnd);

function boardToken(id, casterId = "caster") {
  return {
    id,
    layer: "PROP",
    image: { url: `https://assets.test/${id}.png` },
    metadata: {
      [SPELL_BOARD_TOKEN_META_KEY]: spellBoardTokenMetadata({
        spellId: "spiritual-weapon",
        instanceId: `${id}-instance`,
        casterId,
      }),
    },
  };
}

test("un snapshot item completo valido è riusato senza letture SDK", async () => {
  const items = [{ id: "caster", layer: "CHARACTER" }, boardToken("board-1")];
  let reads = 0;
  const result = await readFullRenderItemSnapshot({
    snapshot: {
      complete: true,
      sceneEpoch: 4,
      revision: 8,
      generation: 12,
      items,
    },
    sceneEpoch: 4,
    sourceRevision: 8,
    sourceGeneration: 12,
    readItems: async () => {
      reads += 1;
      return [];
    },
  });
  assert.equal(reads, 0);
  assert.equal(result.reused, true);
  assert.strictEqual(result.items, items);
  assert.deepEqual(spellBoardTokenTrackerItems(result.items).map((item) => item.id), ["board-1"]);
});

test("snapshot incompleto, revision stale e scene switch fanno un solo fallback full", async () => {
  let reads = 0;
  const readItems = async () => {
    reads += 1;
    return [boardToken(`fallback-${reads}`)];
  };
  for (const options of [
    { complete: false, sceneEpoch: 4, revision: 8, generation: 12 },
    { complete: true, sceneEpoch: 4, revision: 8, generation: 12, sourceRevision: 9 },
    { complete: true, sceneEpoch: 3, revision: 8, generation: 12 },
  ]) {
    const result = await readFullRenderItemSnapshot({
      snapshot: options,
      sceneEpoch: 4,
      sourceRevision: options.sourceRevision || 8,
      sourceGeneration: 12,
      readItems,
    });
    assert.equal(result.reused, false);
    assert.equal(result.fallback, true);
    assert.equal(spellBoardTokenTrackerItems(result.items).length, 1);
  }
  assert.equal(reads, 3);
});

test("board token add/remove resta equivalente usando la stessa lista raw", () => {
  const first = boardToken("board-1");
  const second = boardToken("board-2");
  const initial = spellBoardTokenTrackerItems([first]);
  const added = updateSpellBoardTokenSnapshot(initial, {
    items: [second],
    changedRecords: [],
    removedItems: [],
  });
  assert.deepEqual(added.map((item) => item.id).sort(), ["board-1", "board-2"]);
  const removed = updateSpellBoardTokenSnapshot(added, {
    items: [],
    changedRecords: [{ before: second, after: null }],
    removedItems: [second],
  });
  assert.deepEqual(removed.map((item) => item.id), ["board-1"]);
});

test("il full render usa un solo raw snapshot per entries e board token", () => {
  assert.ok(fullRenderStart >= 0);
  assert.match(fullRenderSource, /readSceneItemsSnapshot\(sceneEpoch\)/);
  assert.match(fullRenderSource, /readFullRenderItemSnapshot\(/);
  assert.match(fullRenderSource, /getEntriesWithLair\(stateRaw, rawItems\)/);
  assert.match(fullRenderSource, /spellBoardTokenTrackerItems\(rawItems\)/);
  assert.doesNotMatch(fullRenderSource, /getSpellBoardTokenItems\(/);
  assert.match(initiativeSource, /sourceGeneration: __latestSceneItemEventGeneration/);
  assert.match(initiativeSource, /updateSpellBoardTokenSnapshot\(__spellBoardTokenItems, event\)/);
  assert.match(fullRenderSource, /expandParagonEntries\(baseEntries, stateRaw\)/);
  assert.match(fullRenderSource, /makeEpicActionEntry/);
});
