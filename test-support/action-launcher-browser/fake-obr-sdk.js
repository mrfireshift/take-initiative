const listeners = new Set();
const actionListeners = new Set();
const messageListeners = new Map();
const state = {
  sceneReady: false,
  actionOpen: false,
  trackerOpen: false,
  actionListenerCount: 0,
  toggleCount: 0,
  lastPopover: null,
  roomMetadata: {},
  probeHangs: false,
};

function notifyFixture() {
  globalThis.dispatchEvent?.(new CustomEvent("action-launcher-fixture-change"));
}

function notifyAction(nextOpen) {
  state.actionOpen = nextOpen === true;
  for (const listener of [...actionListeners]) listener(state.actionOpen);
  notifyFixture();
}

const OBR = {
  scene: {
    isReady: async () => state.sceneReady,
    onReadyChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  },
  action: {
    onOpenChange(listener) {
      actionListeners.add(listener);
      state.actionListenerCount = actionListeners.size;
      notifyFixture();
      return () => {
        actionListeners.delete(listener);
        state.actionListenerCount = actionListeners.size;
      };
    },
    isOpen: async () => state.actionOpen,
    close: async () => notifyAction(false),
    setOpen(nextOpen) {
      notifyAction(nextOpen);
    },
  },
  popover: {
    open: async (options) => {
      state.trackerOpen = true;
      state.toggleCount += 1;
      state.lastPopover = { ...options };
      notifyFixture();
    },
    close: async (id) => {
      if (String(id || "").includes("tracker-popover")) state.trackerOpen = false;
      notifyFixture();
    },
    getWidth: async (id) => {
      if (String(id || "").includes("tracker-popover") && !state.trackerOpen) {
        throw new Error("popover-not-open");
      }
      return 340;
    },
    getHeight: async (id) => {
      if (String(id || "").includes("tracker-popover") && !state.trackerOpen) {
        if (state.probeHangs) return new Promise(() => {});
        throw new Error("popover-not-open");
      }
      return 600;
    },
  },
  viewport: {
    getWidth: async () => 1200,
    getHeight: async () => 900,
  },
  player: {
    getRole: async () => "GM",
  },
  room: {
    id: "action-launcher-browser-room",
    getMetadata: async () => ({ ...state.roomMetadata }),
    setMetadata: async (patch) => {
      state.roomMetadata = { ...state.roomMetadata, ...(patch || {}) };
      notifyFixture();
      return { ...state.roomMetadata };
    },
  },
  broadcast: {
    onMessage(channel, listener) {
      if (!messageListeners.has(channel)) messageListeners.set(channel, new Set());
      messageListeners.get(channel).add(listener);
      return () => messageListeners.get(channel)?.delete(listener);
    },
    sendMessage: async () => true,
  },
  onReady(callback) {
    queueMicrotask(() => callback());
    return () => {};
  },
  __fixture: {
    state,
    setSceneReady(nextReady) {
      state.sceneReady = nextReady === true;
      for (const listener of [...listeners]) listener(state.sceneReady);
      notifyFixture();
    },
    setActionOpen(nextOpen) {
      notifyAction(nextOpen);
    },
  },
};

globalThis.__actionLauncherBrowserFixture = OBR.__fixture;

export default OBR;
