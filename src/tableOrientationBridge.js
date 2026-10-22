// Background side of the table screen rotation. It stays silent until the userscript of the table browser says
// "hello" from the Owlbear page; only then it reads the initiative state (never writes it) and answers with the
// orientation of the active creature, again at every change. Clients without the userscript do nothing, and only a
// PLAYER client answers: the GM's window on the same machine (same Tampermonkey) never turns.
import { ID } from "./constants.js";
import {
  activeInitiativeId,
  isTableOrientationHello,
  sameTableOrientation,
  tableOrientationFor,
  tableOrientationMessage,
} from "./tableOrientationCore.js";

const STATE_KEY = `${ID}/state`;

export function createTableOrientationBridge({
  obr,
  windowRef = globalThis.window,
  subscribeItems = null,
  roles = ["PLAYER"],
} = {}) {
  let rolePromise = null;
  let target = null;
  let last = null;
  let listening = false;
  let mounted = false;
  let queue = Promise.resolve();
  const unsubscribers = [];

  async function readOrientation() {
    if (!await obr.scene.isReady().catch(() => false)) return tableOrientationFor({});
    const metadata = await obr.scene.getMetadata().catch(() => ({}));
    const state = metadata?.[STATE_KEY] || null;
    const activeId = activeInitiativeId(state);
    const [activeItem = null] = activeId
      ? await obr.scene.items.getItems([activeId]).catch(() => [])
      : [];
    return tableOrientationFor({ state, activeItem });
  }

  function post(orientation, nonce = null) {
    if (!target) return;
    try {
      target.source.postMessage(tableOrientationMessage(orientation, { nonce }), target.origin);
    } catch (error) {
      console.warn("[table-orientation] post:", error?.message || error);
    }
  }

  function refresh({ force = false, nonce = null } = {}) {
    queue = queue.then(async () => {
      const next = await readOrientation();
      if (!force && sameTableOrientation(last, next)) return;
      last = next;
      post(next, nonce);
    }).catch((error) => {
      console.warn("[table-orientation] refresh:", error?.message || error);
    });
    return queue;
  }

  function startListening() {
    if (listening) return;
    listening = true;
    unsubscribers.push(obr.scene.onMetadataChange((metadata) => {
      if (activeInitiativeId(metadata?.[STATE_KEY]) !== (last?.activeId ?? null)) void refresh();
    }));
    unsubscribers.push(obr.scene.onReadyChange(() => { void refresh(); }));
    if (typeof subscribeItems === "function") {
      // The side of the active creature changed (or the creature itself did).
      unsubscribers.push(subscribeItems((event) => {
        const activeId = last?.activeId;
        if (!activeId) return null;
        const items = Array.isArray(event?.items) ? event.items : [];
        if (items.some((item) => item?.id === activeId)) void refresh();
        return null;
      }));
    }
  }

  function roleAllowed() {
    rolePromise ||= Promise.resolve(obr.player?.getRole?.())
      .then((role) => roles.includes(String(role || "").toUpperCase()))
      .catch(() => false);
    return rolePromise;
  }

  async function onMessage(event) {
    if (!isTableOrientationHello(event?.data)) return;
    // Only the Owlbear page that hosts this iframe may ask (the userscript runs there).
    if (event.source !== windowRef.parent && event.source !== windowRef.top) return;
    if (!mounted || !await roleAllowed() || !mounted) return;
    target = { source: event.source, origin: event.origin && event.origin !== "null" ? event.origin : "*" };
    startListening();
    void refresh({ force: true, nonce: typeof event.data.nonce === "string" ? event.data.nonce : null });
  }

  return {
    mount() {
      if (mounted) return;
      mounted = true;
      windowRef.addEventListener("message", onMessage);
    },
    unmount() {
      if (!mounted) return;
      mounted = false;
      windowRef.removeEventListener("message", onMessage);
      for (const unsubscribe of unsubscribers.splice(0)) {
        try { unsubscribe?.(); } catch {}
      }
      listening = false;
      target = null;
      last = null;
      rolePromise = null;
    },
    refresh,
    get active() { return !!target; },
  };
}
