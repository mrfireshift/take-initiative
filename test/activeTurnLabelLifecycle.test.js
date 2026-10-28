// Lot L10 of the bugfix pass (TR-02, TR-10): the "Turno di…" label is an attachment of the active token and goes with
// it when the token is deleted. The tracker kept the deleted label in its cache and "updated" it for the rest of the
// session: no label any more. Runs the real label functions of src/initiativeList.js with a fake scene.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/initiativeList.js", import.meta.url), "utf8");
const cut = (from, to) => {
  const a = source.indexOf(from);
  const b = source.indexOf(to, a + from.length);
  if (a < 0 || b < 0) throw new Error(`cut failed: ${from}`);
  return source.slice(a, b);
};
const fns = [
  cut("async function __cleanupActiveTurnLabels(", "// Copia - Aggiunta (subito dopo isEpicActionId)"),
  cut("// The turn label follows its token's position", "let __mutatingActiveLabel = 0;"),
  cut("function __activeTurnLabelWidth(", "async function __pumpActiveTurnLabel()"),
].join("\n");

// --- fake scene with OBR's attachment semantics (an attachment is deleted with its parent unless DELETE is disabled)
const META = "com.thebigpicture.initiative/activeTurnLabel";
let items = [
  { id: "goblin", type: "IMAGE", position: { x: 0, y: 0 }, metadata: {} },
  { id: "orc", type: "IMAGE", position: { x: 300, y: 0 }, metadata: {} },
];
let nextId = 1;
const clone = (v) => structuredClone(v);
const scene = {
  async getItems(filter) {
    if (Array.isArray(filter)) return clone(items.filter((i) => filter.includes(i.id)));
    return clone(typeof filter === "function" ? items.filter(filter) : items);
  },
  async addItems(list) { items.push(...clone(list)); },
  async deleteItems(ids) {
    const doomed = new Set(ids);
    for (const item of items) {
      if (item.attachedTo && doomed.has(item.attachedTo) && !(item.disableAttachmentBehavior || []).includes("DELETE")) {
        doomed.add(item.id);
      }
    }
    items = items.filter((i) => !doomed.has(i.id));
  },
  async updateItems(ids, update) { // same shape as the SDK: read the existing items, run the producer, write back
    const drafts = clone(items.filter((i) => ids.includes(i.id)));
    update(drafts);
    for (const d of drafts) items[items.findIndex((i) => i.id === d.id)] = d;
  },
  async getItemBounds() { return { min: { x: 0, y: 0 }, max: { x: 150, y: 150 } }; },
};
const OBR = {
  scene: { items: scene, local: { getItems: async () => [], deleteItems: async () => {} }, grid: { getDpi: async () => 150 } },
};
const buildLabel = () => {
  const item = { type: "LABEL", text: {}, style: {}, metadata: {} };
  const b = new Proxy({}, {
    get(_, key) {
      if (key === "build") return () => ({ ...item, id: `label-${nextId++}` });
      return (value) => {
        if (key === "position") item.position = value;
        else if (key === "attachedTo") item.attachedTo = value;
        else if (key === "metadata") item.metadata = value;
        else if (key === "plainText") item.text.plainText = value;
        else if (key === "disableAttachmentBehavior") item.disableAttachmentBehavior = value;
        return b;
      };
    },
  });
  return b;
};

const factory = new Function("deps", `
  let { OBR, buildLabel, ACTIVE_LABEL_META, IS_GM } = deps;
  const __isCurrentSceneOperation = () => true;
  const currentSceneEpoch = () => 1;
  const ACTIVE_LABEL_MAX_WIDTH = 312, ACTIVE_LABEL_FONT = 22, ACTIVE_LABEL_HEIGHT = 32, ACTIVE_LABEL_GAP_PX = 9;
  const ACTIVE_LABEL_BG = "#b91c1c", ACTIVE_LABEL_BG_OPACITY = .94, ACTIVE_LABEL_POINTER_WIDTH = 14;
  const ACTIVE_LABEL_POINTER_HEIGHT = 10, ACTIVE_LABEL_MAX_VIEW_SCALE = 1.35;
  let __activeTurnLabel = null, __activeTurnLabelInitialized = false, __activeTurnLabelDpi = null;
  let __mutatingActiveLabel = 0, __activeTurnLabelRevision = 0, __activeTurnLabelLatestKey = null;
  ${fns}
  return { upsertActiveTurnLabel, cache: () => __activeTurnLabel };
`);

test("L10: cancellato il token dell'etichetta, l'etichetta del turno rinasce sul turno dopo", async () => {
  const runtime = factory({ OBR, buildLabel, ACTIVE_LABEL_META: META, IS_GM: true });
  const labels = () => items.filter((item) => item.metadata?.[META]);
  await runtime.upsertActiveTurnLabel("goblin", "Turno di Goblin");
  assert.equal(labels().length, 1);
  await scene.deleteItems(["goblin"]);
  assert.equal(labels().length, 0, "the label went with its token");
  await assert.rejects(runtime.upsertActiveTurnLabel("orc", "Turno di Orc"), /active-turn-label-missing/);
  await runtime.upsertActiveTurnLabel("orc", "Turno di Orc"); // the pump's retry
  assert.deepEqual(labels().map((label) => label.attachedTo), ["orc"]);
  assert.deepEqual(labels()[0].disableAttachmentBehavior, ["ROTATION", "SCALE", "COPY"], "never turned, scaled or copied with its token");
});
