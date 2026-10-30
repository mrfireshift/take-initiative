// Simulated Owlbear Rodeo SDK for the Boss Actions preview. One shared state lives in the top window;
// every iframe (popover) gets a facade bound to that state, like OBR's per-iframe SDK instances.
const clone = (value) => (value === undefined ? undefined : structuredClone(value));

function createHost(win) {
  const state = {
    role: "GM", selection: [], items: [], sceneMetadata: {}, roomMetadata: {}, popovers: new Map(),
    listeners: { player: new Set(), items: new Set(), sceneMeta: new Set(), roomMeta: new Set(), ready: new Set(), broadcast: new Map() },
    missing: [],
  };
  const emit = (set, payload) => { for (const listener of [...set]) { try { listener(clone(payload)); } catch (error) { console.error(error); } } };
  const notifyItems = () => emit(state.listeners.items, state.items);
  const host = {
    state,
    setSelection(ids) { state.selection = [...ids]; emit(state.listeners.player, { id: "gm", role: state.role, selection: state.selection }); host.onSelection?.(state.selection); },
    setItems(items) { state.items = clone(items); notifyItems(); host.onItems?.(state.items); },
    setSceneMetadata(update) { state.sceneMetadata = { ...state.sceneMetadata, ...clone(update) }; emit(state.listeners.sceneMeta, state.sceneMetadata); host.onSceneMetadata?.(state.sceneMetadata); },
    onPopover: null, onSelection: null, onItems: null, onSceneMetadata: null,
  };
  const ns = (name, impl) => new Proxy(impl, {
    get(target, key) {
      if (key in target || typeof key !== "string" || key === "then") return target[key];
      return (...args) => { state.missing.push(`${name}.${key}`); console.warn("[fake-obr] missing", `${name}.${key}`, args); return Promise.resolve(undefined); };
    },
  });
  host.sdk = ns("OBR", {
    isAvailable: true, isReady: true,
    onReady(callback) { setTimeout(callback, 0); },
    player: ns("player", {
      id: "gm", getRole: async () => state.role, getId: async () => "gm", getName: async () => "GM",
      getSelection: async () => clone(state.selection),
      select: async (ids) => host.setSelection(ids), deselect: async () => host.setSelection([]),
      onChange(listener) { state.listeners.player.add(listener); return () => state.listeners.player.delete(listener); },
      getConnectionId: async () => "gm-connection",
    }),
    party: ns("party", { getPlayers: async () => clone(state.party || []), onChange: () => () => {} }),
    room: ns("room", {
      id: "preview-room",
      getMetadata: async () => clone(state.roomMetadata),
      setMetadata: async (update) => { state.roomMetadata = { ...state.roomMetadata, ...clone(update) }; emit(state.listeners.roomMeta, state.roomMetadata); },
      onMetadataChange(listener) { state.listeners.roomMeta.add(listener); return () => state.listeners.roomMeta.delete(listener); },
    }),
    scene: ns("scene", {
      isReady: async () => true,
      onReadyChange(listener) { state.listeners.ready.add(listener); return () => state.listeners.ready.delete(listener); },
      getMetadata: async () => clone(state.sceneMetadata),
      setMetadata: async (update) => host.setSceneMetadata(update),
      onMetadataChange(listener) { state.listeners.sceneMeta.add(listener); return () => state.listeners.sceneMeta.delete(listener); },
      items: ns("scene.items", {
        getItems: async (filter) => clone(state.items.filter((item) => !filter || (typeof filter === "function" ? filter(item) : filter.includes(item.id)))),
        updateItems: async (filter, updater) => {
          const drafts = clone(state.items.filter((item) => (typeof filter === "function" ? filter(item) : (Array.isArray(filter) ? filter.map((i) => i.id || i) : []).includes(item.id))));
          updater(drafts);
          const byId = new Map(drafts.map((item) => [item.id, item]));
          host.setItems(state.items.map((item) => byId.get(item.id) || item));
        },
        addItems: async (items) => host.setItems([...state.items, ...clone(items)]),
        deleteItems: async (ids) => host.setItems(state.items.filter((item) => !ids.includes(item.id))),
        onChange(listener) { state.listeners.items.add(listener); return () => state.listeners.items.delete(listener); },
        getItemAttachments: async () => [],
        // Bounds of the drawn token square (position is the centre, preview.size its side) on the harness map.
        getItemBounds: async (ids) => {
          const boxes = state.items.filter((item) => ids.includes(item.id) && item.preview).map((item) => ({
            min: { x: item.position.x - item.preview.size / 2, y: item.position.y - item.preview.size / 2 },
            max: { x: item.position.x + item.preview.size / 2, y: item.position.y + item.preview.size / 2 } }));
          if (!boxes.length) throw new Error("no bounds");
          const min = { x: Math.min(...boxes.map((b) => b.min.x)), y: Math.min(...boxes.map((b) => b.min.y)) };
          const max = { x: Math.max(...boxes.map((b) => b.max.x)), y: Math.max(...boxes.map((b) => b.max.y)) };
          return { min, max, width: max.x - min.x, height: max.y - min.y, center: { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2 } };
        },
      }),
      local: ns("scene.local", { getItems: async () => [], addItems: async () => {}, updateItems: async () => {}, deleteItems: async () => {}, onChange: () => () => {} }),
      grid: ns("scene.grid", { getDpi: async () => state.gridDpi || 150, getScale: async () => ({ parsed: { multiplier: 5, unit: "ft" } }) }),
    }),
    broadcast: ns("broadcast", {
      onMessage(channel, listener) { const set = state.listeners.broadcast.get(channel) || new Set(); set.add(listener); state.listeners.broadcast.set(channel, set); return () => set.delete(listener); },
      async sendMessage(channel, data) { for (const listener of [...(state.listeners.broadcast.get(channel) || [])]) await listener({ data: clone(data), connectionId: "gm-connection" }); },
    }),
    popover: ns("popover", {
      async open(options) { const previous = state.popovers.get(options.id); state.popovers.set(options.id, { ...clone(options) }); host.onPopover?.("open", options, previous); },
      async close(id) { state.popovers.delete(id); host.onPopover?.("close", { id }); },
      async getWidth(id) { return state.popovers.get(id)?.width; },
      async getHeight(id) { return state.popovers.get(id)?.height; },
      async setWidth(id, width) { const p = state.popovers.get(id); if (p) { p.width = width; host.onPopover?.("resize", p); } },
      async setHeight(id, height) { const p = state.popovers.get(id); if (p) { p.height = height; host.onPopover?.("resize", p); } },
    }),
    modal: ns("modal", { open: async () => {}, close: async () => {} }),
    viewport: ns("viewport", { getWidth: async () => win.innerWidth, getHeight: async () => win.innerHeight }),
    notification: ns("notification", { show: async (message) => console.info("[notification]", message) }),
    contextMenu: ns("contextMenu", { create: async () => {}, remove: async () => {} }),
    tool: ns("tool", {}), action: ns("action", { getHeight: async () => 0, setHeight: async () => {}, onOpenChange: () => () => {} }),
    theme: ns("theme", { getTheme: async () => ({ mode: "DARK" }), onChange: () => () => {} }),
    interaction: ns("interaction", {}), assets: ns("assets", {}),
  });
  return host;
}

const top = (() => { try { return window.top; } catch { return window; } })();
const host = top.__fakeObrHost || (top.__fakeObrHost = createHost(top));
// Like postMessage, every value crossing into this realm is cloned with this realm's structuredClone.
const localClone = (value) => { try { return structuredClone(value); } catch { return value; } };
function facade(target) {
  return new Proxy(target, {
    get(t, key) {
      const value = t[key];
      if (typeof value === "function") {
        return (...args) => {
          const wrapped = key === "updateItems" ? args : args.map((arg) => (typeof arg === "function" ? (...inner) => arg(...inner.map(localClone)) : arg));
          const out = value.apply(t, wrapped);
          return out && typeof out.then === "function" ? out.then(localClone) : out;
        };
      }
      return value && typeof value === "object" ? facade(value) : value;
    },
  });
}
export const fakeHost = host;
export default (window === top ? host.sdk : facade(host.sdk));
// Every setter is recorded on the item as the SDK's builders lay it out: each builder gives its type, the style
// setters go to style (to text.style for a text or a label), the text setters to text, anything else (id, layer,
// position, metadata, …) on the item itself. The first argument of buildImage is its image and the second its grid.
const STYLE_SETTERS = new Set(["fillColor", "fillOpacity", "strokeColor", "strokeOpacity", "strokeWidth", "strokeDash",
  "fontFamily", "fontSize", "fontWeight", "textAlign", "textAlignVertical", "lineHeight", "padding",
  "backgroundColor", "backgroundOpacity", "cornerRadius", "pointerDirection", "pointerWidth", "pointerHeight", "maxViewScale", "minViewScale"]);
const TEXT_SETTERS = { plainText: "plainText", richText: "richText", textType: "type" };
const builder = (type) => (image, grid) => {
  const textual = type === "TEXT" || type === "LABEL";
  const item = { id: "built-" + Math.random().toString(36).slice(2), type, metadata: {},
    ...(type === "IMAGE" ? { image, grid } : {}),
    ...(textual ? { text: { type: "PLAIN", plainText: "", style: {} } } : { style: {} }) };
  const b = new Proxy({}, { get: (t, k) => (k === "build" ? () => item : (value) => {
    if (textual && TEXT_SETTERS[k]) item.text[TEXT_SETTERS[k]] = value;
    else if (textual && (k === "width" || k === "height")) item.text[k] = value;
    else if (STYLE_SETTERS.has(k) && type !== "IMAGE") (textual ? item.text.style : item.style)[k] = value;
    else item[k] = value;
    return b;
  }) });
  return b;
};
export const buildLabel = builder("LABEL"), buildImage = builder("IMAGE"), buildText = builder("TEXT"),
  buildPath = builder("PATH"), buildShape = builder("SHAPE");
export class Command {}
export const typeTheme = {};
