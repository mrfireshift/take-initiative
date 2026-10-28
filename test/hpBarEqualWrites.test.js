// The map HP bars are written by the tracker's preview and again by the background on the canonical event. A flush
// writes only the bars and labels whose values differ: the second writer finds them already right and sends
// nothing, while a token without bars still gets them.
import test, { mock } from "node:test";
import assert from "node:assert/strict";

const KEY = "com.thebigpicture.initiative/meta";
const BAR = "com.thebigpicture.initiative/hpbar";
const TEXT = "com.thebigpicture.initiative/hptext";
let items = [];
let changeListener = null;
let sequence = 0;
const writes = [];
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
    updateItems: async (ids, update) => {
      const wanted = ids.map(entry => (typeof entry === "object" ? entry?.id : entry));
      writes.push(wanted);
      const drafts = structuredClone(items.filter(item => wanted.includes(item.id))); update(drafts);
      items = items.map(item => drafts.find(draft => draft.id === item.id) || item);
    },
    addItems: async added => { items.push(...structuredClone(added)); },
    deleteItems: async ids => { items = items.filter(item => !ids.includes(item.id)); },
  } } };
mock.module("@owlbear-rodeo/sdk", { exports: { default: sdk, buildShape: () => builder("SHAPE"), buildText: () => builder("TEXT") } });
mock.module("../src/sceneItemEvents.js", { exports: { subscribeSceneItemChanges: handler => {
  changeListener = handler; return () => { changeListener = null; };
} } });
const { markSceneEpochReady } = await import("../src/sceneEpoch.js");
// Two module instances, as the background and the tracker iframes each have their own.
const background = await import("../src/hpbar-items.js");
const tracker = await import("../src/hpbar-items.js?tracker");

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, message) {
  const deadline = Date.now() + 3000;
  while (!predicate() && Date.now() < deadline) await sleep(10);
  assert.ok(predicate(), message);
}
const widget = kind => items.find(item => item.metadata?.[BAR]?.targetId === "goblin" && item.metadata[BAR].kind === kind);
const label = () => items.find(item => item.metadata?.[TEXT]?.targetId === "goblin");

test("a bar already right is not written again; a token without bars still gets them", async () => {
  markSceneEpochReady("hp-bar-equal-writes");
  items = [{ id: "goblin", layer: "CHARACTER", type: "IMAGE", zIndex: 4,
    metadata: { [KEY]: { hp: 40, hpMax: 40, attitude: "pc", inInitiative: true } } }];
  try {
    // The background mounts on a scene where the token has no bars: they are created.
    await background.mountHPBars();
    await until(() => widget("bg") && widget("fg") && label()?.text?.plainText === "40/40", "the bars are created");
    const bgId = widget("bg").id;
    const fgId = widget("fg").id;
    const textId = label().id;

    // The tracker writes the new value: only the fill and the label change, not the background shape.
    items.find(item => item.id === "goblin").metadata[KEY].hp = 20;
    await tracker.mountHPBars({ deferInitialSync: true, observeSceneItems: false });
    writes.length = 0;
    tracker.syncHPBarNow("goblin", 20, 40);
    await until(() => label()?.text?.plainText === "20/40" && widget("fg").width === 62, "the tracker updates the bar");
    const written = new Set(writes.flat());
    assert.ok(written.has(fgId) && written.has(textId), JSON.stringify(writes));
    assert.equal(written.has(bgId), false, "the background shape keeps its values and is not written");

    // The background then receives the canonical event for the same value: nothing left to write.
    writes.length = 0;
    changeListener({ items: structuredClone(items.filter(item => item.id === "goblin")), flags: { hpBars: true } });
    await sleep(500);
    assert.deepEqual(writes, [], "the second writer sends nothing");
    assert.equal(widget("fg").width, 62);
    assert.equal(label().text.plainText, "20/40");
  } finally {
    await tracker.unmountHPBars();
    await background.unmountHPBars();
  }
});
