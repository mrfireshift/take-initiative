import assert from "node:assert/strict";
import test, { mock } from "node:test";

// Lot L9 of the bugfix pass (OP-06): the elevation labels are the GM's to write. A player client (the table screen's
// tracker page) stayed mounted and reconciled them too: with the GM, two labels for a token, one with an old text.
const META = "com.thebigpicture.initiative/meta";
const LABEL_OWNER = "com.thebigpicture.initiative/elevationLabelOf";
let role = "PLAYER";
const calls = { add: [], del: [], upd: [] };
let items = [];
function builder() {
  const item = { type: "LABEL", metadata: {} };
  const proxy = new Proxy({}, { get: (_target, key) => (key === "build" ? () => item : (value) => {
    if (key === "metadata") item.metadata = value;
    if (key === "attachedTo") item.attachedTo = value;
    if (key === "visible") item.visible = value;
    return proxy;
  }) });
  return proxy;
}
const sdk = {
  onReady() {},
  player: { getRole: async () => role },
  scene: {
    items: {
      getItems: async (filter) => (typeof filter === "function" ? items.filter(filter) : items.slice()),
      addItems: async (list) => { calls.add.push(...list); },
      deleteItems: async (ids) => { calls.del.push(...ids); },
      updateItems: async (ids, update) => {
        calls.upd.push(...ids);
        const drafts = structuredClone(items.filter((item) => ids.includes(item.id)));
        update?.(drafts);
        calls.drafts = drafts;
      },
    },
    grid: { getScale: async () => ({ parsed: { unit: "m" } }), onChange: () => () => {} },
  },
};
mock.module("@owlbear-rodeo/sdk", { exports: { default: sdk, buildLabel: builder } });
mock.module("../src/sceneItemEvents.js", { exports: { subscribeSceneItemChanges: () => () => {} } });

const label = await import("../src/elevationLabel.js");
const { createOptionalRuntimeLifecycle } = await import("../src/options/optionalRuntimeLifecycle.js");
const token = { id: "pc-1", type: "IMAGE", layer: "CHARACTER", name: "Aria", position: { x: 100, y: 100 }, width: 70,
  height: 70, scale: { x: 1, y: 1 }, metadata: { [META]: { elevation: 3 } } };
const lifecycle = () => createOptionalRuntimeLifecycle({
  name: "elevation-labels",
  mount: label.mountElevationLabelWatcher,
  unmount: label.unmountElevationLabelWatcher,
  cleanupOwnedOutputs: label.cleanupOwnedElevationLabels,
  reconcileFull: label.reconcileAllElevationLabels,
});

test("L9: il client di un giocatore non crea né modifica le etichette della quota", async () => {
  role = "PLAYER";
  items = [token];
  Object.assign(calls, { add: [], del: [], upd: [] });
  await lifecycle().setEnabled(true, { reason: "initial" });
  assert.deepEqual([calls.add.length, calls.del.length, calls.upd.length], [0, 0, 0]);
  await label.unmountElevationLabelWatcher();
});

test("L9: il GM toglie la seconda etichetta della quota di uno stesso token", async () => {
  role = "GM";
  const kept = { id: "label-a", type: "LABEL", metadata: { [LABEL_OWNER]: "pc-1" } };
  const extra = { id: "label-b", type: "LABEL", metadata: { [LABEL_OWNER]: "pc-1" } };
  items = [token, kept, extra];
  Object.assign(calls, { add: [], del: [], upd: [] });
  await lifecycle().setEnabled(true, { reason: "initial" });
  assert.equal(calls.add.length, 0);
  assert.deepEqual(calls.del, ["label-a"], "one of the two goes");
  await label.unmountElevationLabelWatcher();
});

// OBR does not hide an attachment with its token: the elevation of a hidden token showed on the players' screen.
test("l'etichetta della quota di un token nascosto è nascosta ai giocatori", async () => {
  role = "GM";
  const hidden = { ...token, visible: false };
  items = [hidden];
  Object.assign(calls, { add: [], del: [], upd: [] });
  await lifecycle().setEnabled(true, { reason: "initial" });
  assert.deepEqual(calls.add.map((item) => item.visible), [false], "a new label on a hidden token");
  await label.unmountElevationLabelWatcher();

  const shown = { id: "label-a", type: "LABEL", visible: true, metadata: { [LABEL_OWNER]: "pc-1" } };
  items = [hidden, shown];
  Object.assign(calls, { add: [], del: [], upd: [] });
  await lifecycle().setEnabled(true, { reason: "initial" });
  assert.deepEqual(calls.drafts.map((item) => item.visible), [false], "the token was hidden after its label was made");
  await label.unmountElevationLabelWatcher();
});
