import assert from "node:assert/strict";
import test, { mock } from "node:test";

// Lot L13 of the bugfix pass (OP-03): «Imposta quota…» on tokens at different heights showed an empty field and an
// indeterminate «Sta scalando»; Applica took every token to 0 and stopped all of them climbing.
const META_KEY = "com.thebigpicture.initiative/meta";
let items = [];
let writes = 0;
const sdk = {
  scene: {
    items: {
      updateItems: async (ids, updater) => {
        writes += 1;
        const drafts = structuredClone(items.filter((item) => ids.includes(item.id)));
        updater(drafts);
        items = items.map((item) => drafts.find((draft) => draft.id === item.id) || item);
      },
    },
  },
};
mock.module("@owlbear-rodeo/sdk", { exports: { default: sdk } });
const { writeElevationForItems } = await import("../src/distance3d.js");

const token = (id, elevation, climbing) => ({ id, metadata: { [META_KEY]: { elevation, climbing, hp: 10 } } });
const state = () => items.map((item) => [item.id, item.metadata[META_KEY].elevation, item.metadata[META_KEY].climbing]);

test("L13: senza quota né casella decisa, ogni token tiene la sua; una sola delle due cambia solo quella", async () => {
  items = [token("a", 3, true), token("b", 6, false)];
  writes = 0;
  await writeElevationForItems(["a", "b"], null, null);
  assert.equal(writes, 0, "nothing decided: nothing written");
  assert.deepEqual(state(), [["a", 3, true], ["b", 6, false]]);

  await writeElevationForItems(["a", "b"], null, true);
  assert.deepEqual(state(), [["a", 3, true], ["b", 6, true]], "only the climbing box");

  await writeElevationForItems(["a", "b"], 4.5, null);
  assert.deepEqual(state(), [["a", 4.5, true], ["b", 4.5, true]], "only the height");
  assert.equal(items[0].metadata[META_KEY].hp, 10, "the rest of the metadata is merged");
});

test("L13: la finestra passa «invariata» per un campo vuoto con quote diverse e per la casella indeterminata", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("../src/ctx-elevation.js", import.meta.url), "utf8");
  assert.match(source, /typed === "" \? mixedElevation \? null : 0 : typed/);
  assert.match(source, /climbingInput\.indeterminate \? null : climbingInput\.checked/);
  assert.match(source, /mixedElevation = !same && values\.length > 1;/);
});
