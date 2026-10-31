// CAP-TEMP: the temporary hit points inside the map's HP bar, a light cyan part right after the fill, on the total of
// the HP and the temporary hit points; it goes away with them. The harness is the one of hpBarEqualWrites.test.js.
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
const background = await import("../src/hpbar-items.js");

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, message) {
  const deadline = Date.now() + 3000;
  while (!predicate() && Date.now() < deadline) await sleep(10);
  assert.ok(predicate(), message);
}
const widget = kind => items.find(item => item.metadata?.[BAR]?.targetId === "goblin" && item.metadata[BAR].kind === kind);
const label = () => items.find(item => item.metadata?.[TEXT]?.targetId === "goblin");


const goblin = () => items.find((item) => item.id === "goblin");
const emit = () => changeListener({ items: structuredClone([goblin()]), flags: { hpBars: true } });

test("the bar shows the temporary hit points after the HP, on their total, and drops their part when they go", async () => {
  markSceneEpochReady("hp-bar-temp-hp");
  items = [{ id: "goblin", layer: "CHARACTER", type: "IMAGE", zIndex: 4,
    metadata: { [KEY]: { hp: 20, hpMax: 40, tempHp: 10, attitude: "pc", inInitiative: true } } }];
  try {
    await background.mountHPBars();
    await until(() => widget("temp") && label()?.text?.plainText === "20/40 +10", "the bar and its temporary part");
    // 125 px inside: the HP on 40 (the total, 30, is within the maximum), the temporary part right after them.
    assert.deepEqual([widget("fg").width, widget("temp").width], [62, 31]);
    assert.equal(widget("temp").position.x, widget("fg").position.x + 62);
    assert.equal(widget("temp").visible, true, "a PC's exact HP: the players see it");

    // Past the maximum the scale grows: 40 + 20 on 60.
    Object.assign(goblin().metadata[KEY], { hp: 40, tempHp: 20 });
    emit();
    await until(() => widget("fg")?.width === 83, "the fill shrinks to make room");
    assert.equal(widget("temp").width, 41);

    // None left: the part is removed, the fill back on the maximum.
    delete goblin().metadata[KEY].tempHp;
    emit();
    await until(() => !widget("temp"), "the temporary part goes");
    assert.equal(widget("fg").width, 125);
  } finally {
    await background.unmountHPBars();
  }
});
