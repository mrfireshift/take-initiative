import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const KEY = "com.thebigpicture.initiative/meta";
const BAR = "com.thebigpicture.initiative/hpbar";
const TEXT = "com.thebigpicture.initiative/hptext";
let items = [];
let changeListener = null;
let sequence = 0;
function builder(type) {
  const item = { id: `widget-${++sequence}`, type, style: {}, ...(type === "TEXT" ? { text: { type: "PLAIN", style: {} } } : {}) };
  const api = new Proxy({}, { get: (_, field) => field === "build" ? () => structuredClone(item) : value => {
    if (field === "plainText") item.text.plainText = value;
    else if (["metadata", "attachedTo", "layer", "position", "width", "height", "visible"].includes(field)) item[field] = value;
    return api;
  } });
  return api;
}
const sdk = { onReady() {}, player: { getRole: async () => "GM" },
  scene: { getMetadata: async () => ({}), onReadyChange: () => () => {}, items: {
    getItems: async ids => structuredClone(items.filter(item => !ids || (typeof ids === "function" ? ids(item) : ids.includes(item.id)))),
    getItemBounds: async () => ({ width: 150, height: 150, min: { x: 0, y: 0 }, max: { x: 150, y: 150 } }),
    // Ids or items, as the SDK takes them.
    updateItems: async (ids, update) => { const wanted = ids.map(entry => (typeof entry === "object" ? entry?.id : entry));
      const drafts = structuredClone(items.filter(item => wanted.includes(item.id))); update(drafts);
      items = items.map(item => drafts.find(draft => draft.id === item.id) || item); },
    addItems: async added => { items.push(...structuredClone(added)); },
    deleteItems: async ids => { items = items.filter(item => !ids.includes(item.id)); },
  } } };
mock.module("@owlbear-rodeo/sdk", { exports: { default: sdk, buildShape: () => builder("SHAPE"), buildText: () => builder("TEXT") } });
mock.module("../src/sceneItemEvents.js", { exports: { subscribeSceneItemChanges: handler => {
  changeListener = handler; return () => { changeListener = null; };
} } });
const { markSceneEpochReady } = await import("../src/sceneEpoch.js");
const { selectMapHpBarsEnabled, selectTrackerProjectionPolicy } = await import("../src/options/optionsSelectors.js");
const { mountHPBarsBackgroundRuntime } = await import("../src/hpBarRuntime.js");
async function until(predicate) {
  const deadline = Date.now() + 3000;
  while (!predicate() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
  assert.ok(predicate(), "HP widgets did not converge");
}

test("background updates every linked map widget with the tracker closed and honors the enable option", async () => {
  const background = readFileSync(new URL("../src/background.js", import.meta.url), "utf8");
  assert.match(background, /mountHPBarsBackgroundRuntime\(/);
  markSceneEpochReady("map-shared-hp");
  const ids = ["auril", "hand", "head"];
  items = ids.map((id, index) => ({ id, layer: "CHARACTER", type: "IMAGE", metadata: { [KEY]: {
    hp: 100, hpMax: 100, attitude: "pc", ...(index ? { sharedHpSourceId: "auril", sharedHpExcludeFromInitiative: true } : {}),
  } } }));
  items.push({ id: "foreign-attachment", layer: "ATTACHMENT", attachedTo: "hand", metadata: { other: true } });
  let enabled = true;
  const listeners = new Map();
  const policy = { hp: { map: { pc: "exact", ally: "exact", neutral: "hidden", enemy: "hidden" } } };
  const service = { get: selector => selector === selectMapHpBarsEnabled ? enabled : policy,
    subscribe: (selector, handler) => { listeners.set(selector, handler); return () => listeners.delete(selector); } };
  const runtime = mountHPBarsBackgroundRuntime({ service });
  try {
    await runtime.ready;
    await until(() => items.filter(item => item.metadata?.[TEXT]?.targetId).length === 3);
    const widgetIds = items.filter(item => item.metadata?.[BAR] || item.metadata?.[TEXT]).map(item => item.id).sort();
    for (const item of items.filter(item => ids.includes(item.id))) item.metadata[KEY].hp = 25;
    changeListener({ items: structuredClone(items.filter(item => ids.includes(item.id))), flags: { hpBars: true } });
    await until(() => ids.every(id => items.find(item => item.metadata?.[TEXT]?.targetId === id)?.text.plainText === "25/100"));
    assert.deepEqual(items.filter(item => item.metadata?.[BAR] || item.metadata?.[TEXT]).map(item => item.id).sort(), widgetIds);
    assert.ok(items.filter(item => item.metadata?.[BAR]?.kind === "fg").every(item => item.width === 31),
      JSON.stringify(items.filter(item => item.metadata?.[BAR]?.kind === "fg")));
    listeners.get(selectTrackerProjectionPolicy)({ hp: { map: { pc: "hidden" } } });
    await until(() => items.filter(item => item.metadata?.[BAR]).every(item => item.visible === false));
    enabled = false;
    listeners.get(selectMapHpBarsEnabled)(false);
    await runtime.lifecycle.idle();
    assert.equal(items.filter(item => item.metadata?.[BAR] || item.metadata?.[TEXT]).length, 0);
    assert.equal(changeListener, null);
    assert.ok(items.some(item => item.id === "foreign-attachment"));
  } finally { await runtime.stop(); }
});
