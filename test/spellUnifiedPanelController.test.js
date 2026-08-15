import assert from "node:assert/strict";
import test from "node:test";
import { ID } from "../src/constants.js";
import { getSpellDefinition } from "../src/spells-srd.js";
import {
  buildSpellUnifiedPopupEvent,
  SPELL_UNIFIED_PANEL_POPUP_CHANNEL,
  SPELL_UNIFIED_PANEL_POPUP_STATUSES,
} from "../src/spellUnifiedPopupProtocol.js";
import { SPELL_AREA_PLACEMENT_CHANNEL } from "../src/spellAreaPlacementCore.js";
import { routeSpellUnifiedPanelOpenRequest } from "../src/spellUnifiedPanelRoutingCore.js";

const META_KEY = ID + "/meta";
const sdkStub = {
  onReady: () => {},
  broadcast: {
    onMessage: () => () => {},
    sendMessage: async () => {},
  },
  popover: {
    close: async () => {},
  },
  scene: {
    items: {
      getItems: async () => [],
      onChange: () => () => {},
    },
  },
};
const { mock } = await import("node:test");
mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: sdkStub,
    buildImage: () => ({}),
    buildLabel: () => ({}),
    buildPath: () => ({}),
    buildShape: () => ({}),
    buildText: () => ({}),
    Command: class {},
  },
});
globalThis.document = { querySelector: () => null };
globalThis.window = {
  addEventListener: () => {},
  removeEventListener: () => {},
};
const { bootSpellUnifiedPanel } = await import("../src/spell-unified-panel.js");

class FakeNode {
  constructor(documentRef, tagName) {
    this.ownerDocument = documentRef;
    this.tagName = String(tagName || "div").toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.attributes = {};
    this.dataset = {};
    this.listeners = new Map();
    this.className = "";
    this.id = "";
    this.textContent = "";
    this.value = "";
    this.checked = false;
    this.disabled = false;
    this.hidden = false;
    this.selected = false;
  }

  append(...nodes) {
    for (const node of nodes.flat()) {
      if (!node) continue;
      if (node.parentNode) node.parentNode.removeChild(node);
      node.parentNode = this;
      this.children.push(node);
    }
  }

  appendChild(node) {
    this.append(node);
    return node;
  }

  removeChild(node) {
    const index = this.children.indexOf(node);
    if (index >= 0) {
      this.children.splice(index, 1);
      node.parentNode = null;
    }
    return node;
  }

  replaceChildren(...nodes) {
    for (const child of [...this.children]) this.removeChild(child);
    this.append(...nodes);
  }

  setAttribute(name, value) {
    const normalized = String(name);
    const stringValue = String(value);
    this.attributes[normalized] = stringValue;
    if (normalized === "id") this.id = stringValue;
    if (normalized === "class") this.className = stringValue;
    if (normalized === "value") this.value = stringValue;
    if (normalized === "checked") this.checked = stringValue !== "false";
    if (normalized.startsWith("data-")) {
      const key = normalized.slice(5).replace(/-([a-z])/g, (match, letter) =>
        letter.toUpperCase());
      this.dataset[key] = stringValue;
    }
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name)
      ? this.attributes[name]
      : null;
  }

  addEventListener(type, callback) {
    const callbacks = this.listeners.get(type) || [];
    callbacks.push(callback);
    this.listeners.set(type, callbacks);
  }

  async emit(type, overrides = {}) {
    const event = {
      type,
      target: this,
      currentTarget: this,
      preventDefault() {},
      stopPropagation() {},
      ...overrides,
    };
    const callbacks = this.listeners.get(type) || [];
    await Promise.all(callbacks.map((callback) => Promise.resolve(callback(event))));
  }

  click() {
    return this.emit("click");
  }

  focus() {
    this.ownerDocument.activeElement = this;
  }

  setSelectionRange() {}

  matches(selector) {
    const value = String(selector || "").trim();
    if (!value) return false;
    if (value.startsWith("#")) return this.id === value.slice(1);
    if (value.startsWith(".")) {
      return this.className.split(/\s+/).includes(value.slice(1));
    }
    if (value === "*" || value.toLowerCase() === this.tagName.toLowerCase()) return true;
    const attribute = value.match(/^\[([^\]=]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]+)))?\]$/);
    if (!attribute) return false;
    const name = attribute[1];
    const expected = attribute[2] ?? attribute[3] ?? attribute[4];
    const actual = this.getAttribute(name)
      ?? (name.startsWith("data-")
        ? this.dataset[name.slice(5).replace(/-([a-z])/g, (match, letter) =>
          letter.toUpperCase())]
        : this[name]);
    if (expected === undefined) return actual !== undefined && actual !== null;
    return String(actual) === expected;
  }

  closest(selector) {
    let current = this;
    while (current) {
      if (current.matches(selector)) return current;
      current = current.parentNode;
    }
    return null;
  }

  querySelectorAll(selector) {
    const found = [];
    const visit = (node) => {
      if (node.matches?.(selector)) found.push(node);
      for (const child of node.children || []) visit(child);
    };
    visit(this);
    return found;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  get firstChild() {
    return this.children[0] || null;
  }

  get childElementCount() {
    return this.children.length;
  }
}

class FakeTextNode {
  constructor(text) {
    this.textContent = String(text);
    this.parentNode = null;
  }
}

class FakeDocument {
  constructor() {
    this.activeElement = null;
    this.root = new FakeNode(this, "body");
  }

  createElement(tagName) {
    return new FakeNode(this, tagName);
  }

  createTextNode(text) {
    return new FakeTextNode(text);
  }

  getElementById(id) {
    return this.root.querySelector("#" + id);
  }

  querySelector(selector) {
    return this.root.querySelector(selector);
  }

  querySelectorAll(selector) {
    return this.root.querySelectorAll(selector);
  }
}

class FakeWindow {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, callback) {
    const callbacks = this.listeners.get(type) || [];
    callbacks.push(callback);
    this.listeners.set(type, callbacks);
  }

  removeEventListener(type, callback) {
    const callbacks = this.listeners.get(type) || [];
    this.listeners.set(type, callbacks.filter((candidate) => candidate !== callback));
  }
}

class FakeBroadcast {
  constructor() {
    this.listeners = new Map();
    this.calls = [];
    this.pendingPlacement = null;
  }

  onMessage(channel, callback) {
    const callbacks = this.listeners.get(channel) || [];
    callbacks.push(callback);
    this.listeners.set(channel, callbacks);
    return () => {
      this.listeners.set(
        channel,
        (this.listeners.get(channel) || []).filter((candidate) => candidate !== callback),
      );
    };
  }

  async sendMessage(channel, data) {
    this.calls.push({ channel, data });
    if (channel === SPELL_AREA_PLACEMENT_CHANNEL) {
      if (data.type === "start") this.pendingPlacement = data;
      if (data.type === "confirm" || data.type === "cancel") {
        const requestId = data.requestId;
        this.pendingPlacement = null;
        this.emit(channel, {
          type: "result",
          requestId,
          status: data.type === "confirm" ? "confirmed" : "cancelled",
          preview: data.type === "confirm"
            ? { label: "Area confermata", targetIds: ["target-a"] }
            : null,
        });
      }
    }
  }

  emit(channel, data) {
    for (const callback of this.listeners.get(channel) || []) callback({ data });
  }
}

function sceneItems() {
  return [
    {
      id: "caster-a",
      name: "Caster A",
      layer: "CHARACTER",
      metadata: { [META_KEY]: { hp: 30, hpMax: 30, faction: "pc" } },
    },
    {
      id: "target-a",
      name: "Target A",
      layer: "CHARACTER",
      metadata: { [META_KEY]: { hp: 20, hpMax: 20, faction: "enemy" } },
    },
    {
      id: "target-b",
      name: "Target B",
      layer: "CHARACTER",
      metadata: { [META_KEY]: { hp: 18, hpMax: 18, faction: "enemy" } },
    },
  ];
}

function createProvider({ overview = [], pendingTriggers = [] } = {}) {
  let currentOverview = overview;
  let currentPendingTriggers = pendingTriggers;
  const items = sceneItems();
  const itemById = new Map(items.map((item) => [item.id, item]));
  return {
    getCatalogEntries: () => [
      { key: "fireball", label: "Palla di fuoco", flags: { placement: true, targeting: true } },
      { key: "bless", label: "Benedizione", flags: { concentration: true, targeting: true } },
      { key: "xanathar-sfera-della-tempesta", label: "Sfera della Tempesta", flags: { placement: true, active: true } },
    ],
    getCasters: async () => items,
    targetCandidate: (item) => ({
      key: item.id,
      label: item.name,
      subtitle: item.id === "caster-a" ? "Caster" : "Creatura",
      faction: item.metadata?.[META_KEY]?.faction || "neutral",
      hp: item.metadata?.[META_KEY]?.hp,
      hpMax: item.metadata?.[META_KEY]?.hpMax,
    }),
    getOverview: async () => currentOverview,
    getContextOrSelectionIds: async () => [],
    getCardTargetIds: async () => [],
    getCasterConcentrations: async () => ({}),
    getPendingZoneTriggers: async () => currentPendingTriggers,
    setSelection: async () => {},
    onSelectionChange: () => () => {},
    onSceneItemsChange: () => () => {},
    setOverview(value) {
      currentOverview = value;
    },
    setPendingTriggers(value) {
      currentPendingTriggers = value;
    },
    itemById,
  };
}

function createDocument() {
  const documentRef = new FakeDocument();
  const root = documentRef.createElement("main");
  root.id = "spell-unified-panel-root";
  documentRef.root.append(root);
  return { documentRef, root };
}

async function settle(turns = 8) {
  for (let index = 0; index < turns; index += 1) {
    await Promise.resolve();
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function requiredNode(root, selector) {
  const node = root.querySelector(selector);
  assert.ok(node, "missing node " + selector);
  return node;
}

function targetRow(root, key) {
  return requiredNode(root, '[data-target-key="' + key + '"]');
}

function targetInput(root, key) {
  const input = targetRow(root, key).querySelector("input");
  assert.ok(input, "missing target input " + key);
  return input;
}

function boot(options) {
  const { documentRef, root } = createDocument();
  const windowRef = new FakeWindow();
  const panel = bootSpellUnifiedPanel(documentRef, {
    windowRef,
    ...options,
  });
  return { documentRef, root, windowRef, panel };
}

test("il controller completa cast area, placement, undo e reset senza duplicare la mutation", async () => {
  const provider = createProvider();
  const broadcast = new FakeBroadcast();
  const areaCommands = [];
  const undoCalls = [];
  const { root, panel } = boot({
    provider,
    broadcast,
    route: { status: "ready", spellId: "fireball", session: { casterId: "caster-a" } },
    areaExecutor: async (command) => {
      areaCommands.push(command);
      return {
        status: "applied",
        changedIds: command.targeting.targetIds,
        historyEntryId: "history-1",
        undoAvailable: true,
      };
    },
    undoHistoryThrough: async (historyEntryId) => {
      undoCalls.push(historyEntryId);
      return Object.assign([{ changes: [{ id: "target-a" }] }], { status: "applied" });
    },
  });
  await settle();

  assert.equal(root.querySelector(".unified-effect-inputs"), null);
  assert.ok(root.querySelector("#spell-unified-sticky-damage"));
  assert.equal(root.querySelector('[data-undo-capable="true"]'), null);
  assert.equal(root.querySelector(".unified-quiet-button"), null);
  assert.equal(
    requiredNode(root, ".unified-reference-button").querySelector("img")?.getAttribute("src"),
    "/info.svg",
  );
  assert.equal(root.querySelector(".unified-placement h2"), null);
  assert.equal(root.querySelector(".unified-placement-card__status"), null);
  assert.equal(root.querySelector(".unified-placement-card__rules"), null);
  assert.equal(root.querySelector(".unified-placement-preview"), null);
  assert.equal(requiredNode(root, ".unified-placement").querySelector(".unified-state-dot"), null);

  const target = targetInput(root, "target-a");
  target.checked = true;
  await target.emit("change");
  const outcome = requiredNode(targetRow(root, "target-a"), '[data-outcome="failed"]');
  root.scrollTop = 123;
  root.scrollLeft = 7;
  requiredNode(root, ".unified-target-list").scrollTop = 41;
  await outcome.click();
  assert.equal(root.scrollTop, 123);
  assert.equal(root.scrollLeft, 7);
  assert.equal(requiredNode(root, ".unified-target-list").scrollTop, 41);
  const damage = requiredNode(root, '[data-field="damage"]');
  assert.equal(damage.getAttribute("type"), "text");
  assert.equal(damage.getAttribute("min"), null);
  damage.value = "12";
  await damage.emit("change");

  await requiredNode(root, '[data-placement-action="required"]').click();
  await settle(3);
  assert.equal(panel.state.session.placement.state, "pending");
  assert.ok(broadcast.pendingPlacement);

  await requiredNode(root, "[data-placement-confirm]").click();
  await settle(8);
  assert.equal(panel.state.session.placement.state, "confirmed");
  assert.deepEqual(panel.state.session.targetIds, ["target-a"]);

  await requiredNode(targetRow(root, "target-a"), '[data-outcome="failed"]').click();
  const confirmedDamage = requiredNode(root, '[data-field="damage"]');
  confirmedDamage.value = "12";
  await confirmedDamage.emit("change");
  const primary = requiredNode(root, '[data-primary-action="apply"]');
  assert.equal(primary.disabled, false);
  await primary.click();
  await settle(10);

  assert.equal(areaCommands.length, 1);
  assert.deepEqual(areaCommands[0].targeting.targetIds, ["target-a"]);
  assert.equal(panel.state.session.commitState.state, "committed");
  const undo = requiredNode(root, '[data-undo-capable="true"]');
  assert.equal(undo.disabled, false);
  await undo.click();
  await settle(8);
  assert.deepEqual(undoCalls, ["history-1"]);
  assert.equal(panel.state.session.undoState.available, false);
  assert.equal(root.querySelector(".unified-quiet-button"), null);
  assert.equal(panel.state.session.spellId, "fireball");
  assert.deepEqual(panel.state.session.targetIds, ["target-a"]);
  assert.equal(panel.state.session.placement.state, "confirmed");
  assert.equal(areaCommands.length, 1);
});

test("Allucinazione di Forza blocca il bersaglio prima del placement e non lo deseleziona", async () => {
  const provider = createProvider();
  const selectionWrites = [];
  const selectionListeners = [];
  provider.setSelection = async (ids) => selectionWrites.push([...ids]);
  provider.onSelectionChange = (callback) => {
    selectionListeners.push(callback);
    return () => {};
  };
  const broadcast = new FakeBroadcast();
  const { root, panel } = boot({
    provider,
    broadcast,
    route: {
      status: "ready",
      spellId: "phb2014-allucinazione-di-forza",
      session: { casterId: "caster-a" },
    },
  });
  await settle();

  const target = targetInput(root, "target-a");
  target.checked = true;
  await target.emit("change");
  await requiredNode(root, '[data-placement-action="required"]').click();
  await settle(3);

  assert.equal(panel.state.session.placement.state, "pending");
  assert.equal(panel.state.session.placement.targetLocked, true);
  assert.deepEqual(panel.state.session.targetIds, ["target-a"]);
  assert.equal(targetInput(root, "target-a").disabled, true);
  assert.deepEqual(selectionWrites, [["target-a"]]);

  await selectionListeners[0](["target-b"]);
  assert.deepEqual(panel.state.session.targetIds, ["target-a"]);
});

test("Catena di fulmini seleziona il primario al primo clic e conserva il primario sui secondari", async () => {
  const provider = createProvider();
  const selectionListeners = [];
  const references = [];
  provider.onSelectionChange = (callback) => {
    selectionListeners.push(callback);
    return () => {};
  };
  provider.validateTargetSelection = async () => ({
    valid: true,
    errors: [],
    invalidDistanceTargetIds: [],
  });
  provider.showTargetingReference = async (options) => references.push(options);
  provider.clearTargetingReference = () => {};
  const { root, panel } = boot({
    provider,
    broadcast: new FakeBroadcast(),
    route: {
      status: "ready",
      spellId: "chain-lightning",
      session: { casterId: "caster-a", slotLevel: 6 },
    },
  });
  await settle();

  await selectionListeners[0](["target-a"]);
  await settle();
  assert.equal(panel.state.session.primaryTargetId, "target-a");
  assert.deepEqual(panel.state.session.targetIds, ["target-a"]);
  assert.equal(references.length, 1);
  assert.equal(references[0].radiusMeters, 9);

  await selectionListeners[0](["target-b"]);
  await settle();
  assert.equal(panel.state.session.primaryTargetId, "target-a");
  assert.deepEqual(panel.state.session.targetIds, ["target-a", "target-b"]);

  await requiredNode(root, "[data-primary-reset]").click();
  await settle();
  assert.equal(panel.state.session.primaryTargetId, "");
  assert.deepEqual(panel.state.session.targetIds, []);
  await selectionListeners[0](["target-b"]);
  await settle();
  assert.equal(panel.state.session.primaryTargetId, "target-b");
  assert.deepEqual(panel.state.session.targetIds, ["target-b"]);
});

test("una quick action area avvia il broadcast di placement all'apertura del controller", async () => {
  const provider = createProvider();
  const broadcast = new FakeBroadcast();
  const route = routeSpellUnifiedPanelOpenRequest({
    sourceId: "caster-a",
    spellId: "fireball",
    quickActionId: "quick-fireball",
    origin: "quick-action",
  });
  const { panel } = boot({ provider, broadcast, route });

  await settle(10);

  assert.equal(panel.state.session.placement.state, "pending");
  assert.equal(broadcast.pendingPlacement?.ruleId, "fireball:cast");
  assert.equal(broadcast.pendingPlacement?.casterId, "caster-a");
  await panel.destroy();
});

test("il controller collega popup, completamento, chiusura e terminazione ai contratti attivi", async () => {
  const stormAction = getSpellDefinition("xanathar-sfera-della-tempesta")
    .activeActions.find((action) => action.id === "storm-sphere-lightning");
  const stormOverview = [{
    instanceId: "storm-1",
    name: "Sfera della Tempesta",
    casterName: "Caster A",
    context: {
      spellId: "xanathar-sfera-della-tempesta",
      instanceId: "storm-1",
      casterId: "caster-a",
      casterName: "Caster A",
      zoneItemId: "zone-1",
      sceneEpoch: 1,
      revision: 1,
    },
    actions: [{ ...stormAction }],
  }];
  const provider = createProvider({ overview: stormOverview });
  const broadcast = new FakeBroadcast();
  const opened = [];
  const closed = [];
  const undoCalls = [];
  const { root, panel } = boot({
    provider,
    broadcast,
    route: {
      status: "ready",
      spellId: "xanathar-sfera-della-tempesta",
      session: {
        casterId: "caster-a",
        activeInstanceId: "storm-1",
        activeActionId: "storm-sphere-lightning",
      },
    },
    sceneEpoch: 1,
    currentSceneEpoch: 1,
    currentRevision: 1,
    openActiveResolution: async (payload) => opened.push(payload),
    closePopover: async (id) => closed.push(id),
    undoHistoryEntry: async (historyEntryId) => {
      undoCalls.push(historyEntryId);
      return Object.assign([{ changes: [{ id: "target-a" }] }], { status: "applied" });
    },
  });
  await settle();

  await requiredNode(root, '[data-primary-action="resolve-active-action"]').click();
  await settle(10);
  assert.equal(opened.length, 1, JSON.stringify({
    opened,
    activeActionState: panel.state.session.activeActionState,
    feedback: panel.state.session.feedback,
  }));
  assert.equal(panel.state.session.activeActionState.state, "opened");

  broadcast.emit(
    SPELL_UNIFIED_PANEL_POPUP_CHANNEL,
    buildSpellUnifiedPopupEvent({
      status: SPELL_UNIFIED_PANEL_POPUP_STATUSES.COMPLETED,
      instanceId: "storm-1",
      actionId: "storm-sphere-lightning",
      historyEntryId: "history-popup",
      undoAvailable: true,
    }),
  );
  await settle(8);
  assert.equal(panel.state.session.activeActionState.state, "selected");
  assert.equal(panel.state.session.feedback.state, "success");
  assert.equal(panel.state.session.undoState.available, true);
  await requiredNode(root, '[data-undo-capable="true"]').click();
  await settle(8);
  assert.deepEqual(undoCalls, ["history-popup"]);
  assert.equal(panel.state.session.undoState.available, false);

  assert.equal(root.querySelector(".unified-quiet-button"), null);
  assert.equal(closed.length, 0);

  const terminationProvider = createProvider({
    overview: [{
      instanceId: "bless-1",
      name: "Benedizione",
      casterName: "Caster A",
      context: {
        spellId: "bless",
        instanceId: "bless-1",
        casterId: "caster-a",
        targetIds: ["target-a"],
        concentration: true,
      },
    }],
  });
  const mutations = [];
  const terminationPanel = boot({
    provider: terminationProvider,
    broadcast: new FakeBroadcast(),
    route: { status: "ready", spellId: "bless", session: { casterId: "caster-a" } },
    runEffectsMutation: async (operations) => {
      mutations.push(operations);
      return { status: "applied" };
    },
    requireAppliedEffectsMutation: () => {},
    refreshConditionLabels: async () => {},
  });
  await settle();
  await requiredNode(
    terminationPanel.root,
    '[data-terminate-instance="bless-1"]',
  ).click();
  await settle(10);
  assert.equal(mutations.length, 1);
  assert.equal(
    mutations[0].some((operation) => operation.type === "spell:remove-instance"),
    true,
  );
});

test("la terminazione non lascia il pannello bloccato se il refresh delle label resta in attesa", async () => {
  const provider = createProvider({
    overview: [{
      instanceId: "bless-lock-1",
      name: "Benedizione",
      casterName: "Caster A",
      context: {
        spellId: "bless",
        instanceId: "bless-lock-1",
        casterId: "caster-a",
        targetIds: ["target-a"],
        concentration: true,
      },
    }],
  });
  const openedReferences = [];
  const { root, panel: terminationPanel } = boot({
    provider,
    broadcast: new FakeBroadcast(),
    route: { status: "ready", spellId: "bless", session: { casterId: "caster-a" } },
    runEffectsMutation: async () => {
      provider.setOverview([]);
      return { status: "applied" };
    },
    requireAppliedEffectsMutation: () => {},
    refreshConditionLabels: () => new Promise(() => {}),
    openReferencePopover: async (payload) => openedReferences.push(payload),
  });
  await settle();
  await requiredNode(
    root,
    '[data-terminate-instance="bless-lock-1"]',
  ).click();
  await settle(10);

  assert.equal(terminationPanel.state.committing, false);
  assert.equal(terminationPanel.state.session.feedback.state, "success");
  await requiredNode(root, ".unified-combobox-toggle").click();
  assert.equal(terminationPanel.state.catalogState.expanded, true);
  await requiredNode(root, ".unified-reference-button").click();
  await settle(2);
  assert.deepEqual(openedReferences, [{ tab: "spells", entry: "bless" }]);
});

test("la terminazione chiude l'eventuale risoluzione attiva della stessa spell", async () => {
  const provider = createProvider({
    overview: [{
      instanceId: "bless-popup-1",
      name: "Benedizione",
      casterName: "Caster A",
      context: {
        spellId: "bless",
        instanceId: "bless-popup-1",
        casterId: "caster-a",
        targetIds: ["target-a"],
        concentration: true,
      },
      actions: [{ id: "resolve-bless", type: "resolve", label: "Risolvi" }],
    }],
  });
  const closedPopovers = [];
  const { root, panel } = boot({
    provider,
    broadcast: new FakeBroadcast(),
    route: {
      status: "ready",
      spellId: "bless",
      session: {
        casterId: "caster-a",
        activeInstanceId: "bless-popup-1",
        activeActionId: "resolve-bless",
        activeActionState: {
          state: "opened",
          instanceId: "bless-popup-1",
          actionId: "resolve-bless",
        },
      },
    },
    runEffectsMutation: async () => {
      provider.setOverview([]);
      return { status: "applied" };
    },
    requireAppliedEffectsMutation: () => {},
    refreshConditionLabels: async () => {},
    closePopover: async (id) => closedPopovers.push(id),
  });
  await settle();
  await requiredNode(root, '[data-terminate-instance="bless-popup-1"]').click();
  await settle(10);

  assert.equal(closedPopovers.length, 1);
  assert.equal(panel.state.session.activeInstanceId, "");
  assert.equal(panel.state.session.activeActionState.state, "idle");
});
