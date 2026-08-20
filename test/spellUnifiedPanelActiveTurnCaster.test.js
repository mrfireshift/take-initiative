import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveGlobalSpellSourceEntryCore,
} from "../src/spellUnifiedPanelRoutingCore.js";
import { ID } from "../src/constants.js";

const META_KEY = ID + "/meta";
const STATE_KEY = ID + "/state";

// Stub OBR SDK for testing
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
    this._value = "";
    this.checked = false;
    this.disabled = false;
    this.hidden = false;
    this.selected = false;
  }

  get value() {
    if (this.tagName === "SELECT") {
      const selectedOption = this.children.find((child) => child.selected);
      return selectedOption
        ? (selectedOption.attributes?.value ?? selectedOption._value ?? "")
        : (this._value ?? "");
    }
    return this._value ?? this.attributes?.value ?? "";
  }

  set value(val) {
    this._value = String(val ?? "");
    if (this.tagName === "SELECT") {
      for (const child of this.children) {
        child.selected = String(child.attributes?.value ?? child._value ?? "") === String(val);
      }
    }
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

  querySelectorAll(selector) {
    const found = [];
    const visit = (node) => {
      if (node.matches?.(selector)) found.push(node);
      for (const child of node.children || []) visit(child);
    };
    for (const child of this.children || []) visit(child);
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

async function settle(turns = 8) {
  for (let index = 0; index < turns; index += 1) {
    await Promise.resolve();
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function makeEntry(id, name, attitude = "friendly") {
  return {
    id,
    name,
    attitude,
    initiative: 15,
    hp: 20,
    hpMax: 20,
  };
}

// --------------------------------------------------
// R1 — ACTIVE WINS OVER SELECTION
// --------------------------------------------------
test("R1 — Active initiative actor wins over map selection", () => {
  const lavera = makeEntry("lavera-id", "Lavera");
  const goblin = makeEntry("goblin-id", "Goblin", "enemy");
  const entries = [lavera, goblin];
  const state = { order: ["lavera-id", "goblin-id"], current: 0 };
  const selection = ["goblin-id"];

  const resolved = resolveGlobalSpellSourceEntryCore({
    entries,
    state,
    selection,
  });

  assert.equal(resolved?.id, "lavera-id", "Active actor (Lavera) must win over map selection (Goblin)");
});

// --------------------------------------------------
// R2 — DROPDOWN REFLECTS ACTIVE CASTER
// --------------------------------------------------
test("R2 — Caster dropdown reflects active caster on initial render", async () => {
  const documentRef = new FakeDocument();
  const root = documentRef.createElement("main");
  root.id = "spell-unified-panel-root";
  documentRef.root.append(root);
  const windowRef = new FakeWindow();

  const lavera = { id: "lavera-id", name: "Lavera", layer: "CHARACTER", metadata: { [META_KEY]: { faction: "pc" } } };
  const edelbrand = { id: "edelbrand-id", name: "Edelbrand", layer: "CHARACTER", metadata: { [META_KEY]: { faction: "pc" } } };
  const items = [lavera, edelbrand];

  const provider = {
    getCatalogEntries: () => [
      { key: "bless", label: "Benedizione", flags: { concentration: true, targeting: true } },
    ],
    getCasters: async () => items,
    targetCandidate: (item) => ({
      key: item.id,
      label: item.name,
      subtitle: item.id === "lavera-id" ? "Caster" : "Creatura",
      faction: "pc",
    }),
    getTargetCandidates: async () => [
      { key: "lavera-id", label: "Lavera", faction: "ally" },
      { key: "edelbrand-id", label: "Edelbrand", faction: "ally" },
    ],
    getOverview: async () => [],
    getContextOrSelectionIds: async () => [],
    getCardTargetIds: async () => [],
    getCasterConcentrations: async () => ({}),
    getPendingZoneTriggers: async () => [],
    setSelection: async () => {},
    onSelectionChange: () => () => {},
    onSceneItemsChange: () => () => {},
  };

  const controller = bootSpellUnifiedPanel(documentRef, {
    windowRef,
    provider,
    route: {
      status: "ready",
      spellId: "bless",
      sourceId: "lavera-id",
      session: { casterId: "lavera-id" },
    },
  });

  await settle();

  const casterSelect = root.querySelector("#spell-unified-caster");
  assert.ok(casterSelect, "Caster select element should exist");
  assert.equal(casterSelect.value, "lavera-id", "Caster select value must match Lavera ID");
  assert.equal(controller.state.session.casterId, "lavera-id");

  controller.destroy();
});

// --------------------------------------------------
// R3 — DIFFERENT TARGET SELECTED
// --------------------------------------------------
test("R3 — Selecting different targets on map does not alter caster", () => {
  const lavera = makeEntry("lavera-id", "Lavera");
  const enemy1 = makeEntry("enemy-1", "Orco 1", "enemy");
  const enemy2 = makeEntry("enemy-2", "Orco 2", "enemy");
  const entries = [lavera, enemy1, enemy2];
  const state = { order: ["lavera-id", "enemy-1", "enemy-2"], current: 0 };
  const selection = ["enemy-1", "enemy-2"];

  const resolved = resolveGlobalSpellSourceEntryCore({
    entries,
    state,
    selection,
  });

  assert.equal(resolved?.id, "lavera-id", "Target selection must not alter caster");
});

// --------------------------------------------------
// R4 — EXPLICIT CARD SOURCE
// --------------------------------------------------
test("R4 — Explicit card / quick action source overrides active turn", () => {
  const lavera = makeEntry("lavera-id", "Lavera");
  const edelbrand = makeEntry("edelbrand-id", "Edelbrand");
  const entries = [lavera, edelbrand];
  // Active turn is Edelbrand
  const state = { order: ["edelbrand-id", "lavera-id"], current: 0 };
  const selection = [];

  // Quick Action triggered from Lavera's card
  const resolved = resolveGlobalSpellSourceEntryCore({
    entries,
    state,
    selection,
    explicitSourceId: "lavera-id",
  });

  assert.equal(resolved?.id, "lavera-id", "Explicit source must win over active actor");
});

// --------------------------------------------------
// R5 — MANUAL OVERRIDE
// --------------------------------------------------
test("R5 — Manual dropdown change persists across rerenders", async () => {
  const documentRef = new FakeDocument();
  const root = documentRef.createElement("main");
  root.id = "spell-unified-panel-root";
  documentRef.root.append(root);
  const windowRef = new FakeWindow();

  const lavera = { id: "lavera-id", name: "Lavera", layer: "CHARACTER", metadata: { [META_KEY]: { faction: "pc" } } };
  const edelbrand = { id: "edelbrand-id", name: "Edelbrand", layer: "CHARACTER", metadata: { [META_KEY]: { faction: "pc" } } };
  const items = [lavera, edelbrand];

  const provider = {
    getCatalogEntries: () => [
      { key: "bless", label: "Benedizione", flags: { concentration: true, targeting: true } },
    ],
    getCasters: async () => items,
    targetCandidate: (item) => ({
      key: item.id,
      label: item.name,
      subtitle: item.id === "lavera-id" ? "Caster" : "Creatura",
      faction: "pc",
    }),
    getTargetCandidates: async () => [
      { key: "lavera-id", label: "Lavera", faction: "ally" },
      { key: "edelbrand-id", label: "Edelbrand", faction: "ally" },
    ],
    getOverview: async () => [],
    getContextOrSelectionIds: async () => [],
    getCardTargetIds: async () => [],
    getCasterConcentrations: async () => ({}),
    getPendingZoneTriggers: async () => [],
    setSelection: async () => {},
    onSelectionChange: () => () => {},
    onSceneItemsChange: () => () => {},
  };

  const controller = bootSpellUnifiedPanel(documentRef, {
    windowRef,
    provider,
    route: {
      status: "ready",
      spellId: "bless",
      sourceId: "lavera-id",
      session: { casterId: "lavera-id" },
    },
  });

  await settle();

  const casterSelect = root.querySelector("#spell-unified-caster");
  assert.ok(casterSelect, "Caster select element should exist");
  assert.equal(casterSelect.value, "lavera-id");

  // User manually selects Edelbrand
  casterSelect.value = "edelbrand-id";
  await casterSelect.emit("change");

  assert.equal(controller.state.session.casterId, "edelbrand-id");

  // Simulate background scene refresh (e.g. token move, HP change)
  await controller.refreshScene();
  await settle();

  assert.equal(controller.state.session.casterId, "edelbrand-id", "Manual override must persist after scene refresh");

  const reRenderedSelect = root.querySelector("#spell-unified-caster");
  assert.equal(reRenderedSelect.value, "edelbrand-id", "Dropdown value must still show Edelbrand");

  controller.destroy();
});

// --------------------------------------------------
// R6 — REOPEN AFTER TURN CHANGE
// --------------------------------------------------
test("R6 — Reopening global spell panel after turn change uses new active actor", () => {
  const lavera = makeEntry("lavera-id", "Lavera");
  const edelbrand = makeEntry("edelbrand-id", "Edelbrand");
  const entries = [lavera, edelbrand];

  // First opening on Lavera's turn
  const stateTurn1 = { order: ["lavera-id", "edelbrand-id"], current: 0 };
  const resolvedTurn1 = resolveGlobalSpellSourceEntryCore({
    entries,
    state: stateTurn1,
    selection: [],
  });
  assert.equal(resolvedTurn1?.id, "lavera-id");

  // Turn advances to Edelbrand
  const stateTurn2 = { order: ["lavera-id", "edelbrand-id"], current: 1 };
  const resolvedTurn2 = resolveGlobalSpellSourceEntryCore({
    entries,
    state: stateTurn2,
    selection: [],
  });
  assert.equal(resolvedTurn2?.id, "edelbrand-id", "Reopening after turn change must resolve Edelbrand");
});

// --------------------------------------------------
// R7 — VIRTUAL ENTRY FALLBACK (LAIR / EPIC)
// --------------------------------------------------
test("R7 — Virtual entries (Lair / Epic) are skipped and safe fallback is used", () => {
  const boss = makeEntry("boss-id", "Drago");
  const pc = makeEntry("pc-id", "Guerriero");
  const entries = [boss, pc];

  // Active entry is LAIR
  const stateLair = { order: ["__LAIR__", "boss-id", "pc-id"], current: 0 };
  const resolvedLair = resolveGlobalSpellSourceEntryCore({
    entries,
    state: stateLair,
    selection: [],
  });
  assert.equal(resolvedLair?.id, "boss-id", "Lair must be skipped; fallback to first eligible entry");

  // Active entry is EPIC action
  const stateEpic = { order: ["__EPIC__::boss-id::after::pc-id", "boss-id", "pc-id"], current: 0 };
  const resolvedEpic = resolveGlobalSpellSourceEntryCore({
    entries,
    state: stateEpic,
    selection: ["pc-id"],
  });
  assert.equal(resolvedEpic?.id, "pc-id", "Epic must be skipped; fallback to selection if present");
});

// --------------------------------------------------
// PARAGON BASE ID RESOLUTION
// --------------------------------------------------
test("Paragon virtual ID resolves to base actor", () => {
  const boss = makeEntry("boss-id", "Boss Paragon");
  const pc = makeEntry("pc-id", "Guerriero");
  const entries = [boss, pc];

  const stateParagon = { order: ["boss-id::p1", "pc-id"], current: 0 };
  const resolvedParagon = resolveGlobalSpellSourceEntryCore({
    entries,
    state: stateParagon,
    selection: [],
  });
  assert.equal(resolvedParagon?.id, "boss-id", "Paragon virtual ID must resolve to base actor");
});

// --------------------------------------------------
// R8 — EFFECTS PANEL REGRESSION GUARD
// --------------------------------------------------
test("R8 — Effects panel source resolution keeps selection-first priority while spells uses active-first", async () => {
  const { readFile } = await import("node:fs/promises");
  const initiativeSource = await readFile(
    new URL("../src/initiativeList.js", import.meta.url),
    "utf8",
  );

  // Verify openGlobalEffectsPopup continues to use resolveGlobalPopupSourceEntry
  assert.match(
    initiativeSource,
    /async function openGlobalEffectsPopup\(\)\s*\{\s*const sourceEntry = await resolveGlobalPopupSourceEntry\(\);/,
    "openGlobalEffectsPopup must preserve resolveGlobalPopupSourceEntry call",
  );

  // Verify openGlobalSpellsPopup uses resolveGlobalSpellSourceEntry
  assert.match(
    initiativeSource,
    /async function openGlobalSpellsPopup\([\s\S]*?\)\s*\{\s*const sourceEntry = await resolveGlobalSpellSourceEntry\(/,
    "openGlobalSpellsPopup must use resolveGlobalSpellSourceEntry",
  );
});
