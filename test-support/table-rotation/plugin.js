// The real background bridge on a fake Owlbear SDK: an in-memory initiative state and four tokens with a side.
import { createTableOrientationBridge } from "/src/tableOrientationBridge.js";

const META_KEY = "com.thebigpicture.initiative/meta";
const STATE_KEY = "com.thebigpicture.initiative/state";
const items = [
  { id: "aria", name: "Aria", side: "north" },
  { id: "__LAIR__", name: "Azione di tana (virtuale)", virtual: true },
  { id: "borin", name: "Borin", side: "south" },
  { id: "goblin", name: "Goblin (nessun lato)" },
  { id: "cael", name: "Cael", side: "east" },
  { id: "dorn", name: "Dorn", side: "west" },
];
const sceneItems = items.filter((item) => !item.virtual).map((item) => ({
  id: item.id, name: item.name, metadata: { [META_KEY]: item.side ? { tableSide: item.side } : {} },
}));
let state = { order: items.map((item) => item.id), current: 0, round: 1 };
const metadataListeners = [];

// ?role=GM shows that the GM's window ignores the userscript.
const role = new URLSearchParams(location.search).get("role") || "PLAYER";
const obr = {
  player: { getRole: async () => role },
  scene: {
    isReady: async () => true,
    getMetadata: async () => ({ [STATE_KEY]: state }),
    onMetadataChange: (handler) => { metadataListeners.push(handler); return () => {}; },
    onReadyChange: () => () => {},
    items: { getItems: async (ids) => sceneItems.filter((item) => ids.includes(item.id)) },
  },
};

const status = document.getElementById("status");
const bridge = createTableOrientationBridge({ obr, windowRef: window });
bridge.mount();
window.addEventListener("message", (event) => {
  if (event.data?.type === "hello") status.textContent = `hello da ${event.origin} · ponte ${bridge.active ? "attivo" : "inattivo"}`;
});

function render() {
  const list = document.getElementById("order");
  list.replaceChildren(...items.map((item, index) => {
    const li = document.createElement("li");
    li.textContent = `${item.name}${item.side ? ` → ${item.side}` : ""}`;
    if (index === state.current) li.className = "active";
    return li;
  }));
}

function nextTurn() {
  state = { ...state, current: (state.current + 1) % state.order.length };
  render();
  for (const handler of metadataListeners) handler({ [STATE_KEY]: state });
}
document.getElementById("next").addEventListener("click", nextTurn);
// Lab automation: the host page can advance the turn (`plugin.contentWindow.postMessage({ lab: "next" }, "*")`).
window.addEventListener("message", (event) => { if (event.data?.lab === "next") nextTurn(); });
render();
