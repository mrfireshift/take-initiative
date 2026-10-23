import assert from "node:assert/strict";
import test from "node:test";
import { createLocalOptionsStore } from "../src/options/localOptionsStore.js";
import { createPcAttackAutoOpenOption } from "../src/pcAttackAutoOpenOption.js";

const LOCAL_KEY = "com.thebigpicture.initiative/options-local";
function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: (key) => (data.has(key) ? data.get(key) : null), setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key) };
}

test("the switch reads the local option (off by default) and writes only its own key", async () => {
  const storage = memoryStorage({ [LOCAL_KEY]: JSON.stringify({ tracker: { scale: 1.5 }, runtime: { combatLog: false } }) });
  const option = createPcAttackAutoOpenOption(createLocalOptionsStore({ storage, eventTarget: null }));
  const seen = [];
  const off = await option.subscribe((value) => seen.push(value));
  assert.deepEqual(seen, [false]);
  await option.set(true);
  assert.deepEqual(seen, [false, true]);
  const stored = JSON.parse(storage.getItem(LOCAL_KEY));
  assert.equal(stored.windows.pcAttackAutoOpen, true);
  assert.equal(stored.tracker.scale, 1.5, "the other local options stay");
  assert.equal(stored.runtime.combatLog, false);
  off(); option.stop();
});
