import test from "node:test";
import assert from "node:assert/strict";
import {
  bindClassicHPEditor,
  bindClassicInitiativeEditor,
  bindGroupHPDeltaEditor,
  enableClassicCardRename,
  normalizeInitiativeInput,
  normalizeSignedIntegerInput,
  parseInlineMath,
} from "../src/initiativeEditors.js";

function createTestDocument() {
  const documentRef = {
    activeElement: null,
    listeners: {},
    addEventListener(type, listener) {
      if (!this.listeners[type]) this.listeners[type] = [];
      this.listeners[type].push(listener);
    },
    removeEventListener(type, listener) {
      this.listeners[type] = (this.listeners[type] || [])
        .filter((candidate) => candidate !== listener);
    },
    createElement(tagName) {
      const element = {
        tagName: String(tagName).toUpperCase(),
        style: {},
        dataset: {},
        attributes: {},
        children: [],
        listeners: {},
        parentNode: null,
        isConnected: false,
        textContent: "",
        title: "",
        appendChild(child) {
          this.children.push(child);
          child.parentNode = this;
          child.isConnected = true;
          return child;
        },
        append(...children) {
          for (const child of children) this.appendChild(child);
        },
        removeChild(child) {
          const index = this.children.indexOf(child);
          if (index < 0) throw new Error("child not found");
          this.children.splice(index, 1);
          child.parentNode = null;
          child.isConnected = false;
          return child;
        },
        contains(candidate) {
          if (candidate === this) return true;
          return this.children.some((child) => child.contains?.(candidate));
        },
        getAttribute(name) {
          return this.attributes[name] ?? null;
        },
        setAttribute(name, value) {
          this.attributes[name] = String(value);
        },
        removeAttribute(name) {
          delete this.attributes[name];
        },
        closest(selector) {
          let current = this;
          while (current) {
            if (selector === "[data-item-id]" && current.dataset.itemId) {
              return current;
            }
            current = current.parentNode;
          }
          return null;
        },
        getBoundingClientRect() {
          return { left: 0, top: 0, width: 50, height: 20 };
        },
        replaceWith(replacement) {
          if (!this.parentNode) return;
          const parent = this.parentNode;
          const index = parent.children.indexOf(this);
          if (index < 0) return;
          parent.children[index] = replacement;
          replacement.parentNode = parent;
          replacement.isConnected = true;
          this.parentNode = null;
          this.isConnected = false;
        },
        addEventListener(type, listener) {
          if (!this.listeners[type]) this.listeners[type] = [];
          this.listeners[type].push(listener);
        },
        async dispatch(type, event = {}) {
          for (const listener of this.listeners[type] || []) {
            await listener(event);
          }
        },
        focus() {
          this.focused = true;
          documentRef.activeElement = this;
        },
        select() {
          this.selected = true;
        },
      };
      let innerHTML = "";
      Object.defineProperty(element, "innerHTML", {
        get() {
          return innerHTML;
        },
        set(value) {
          innerHTML = String(value);
          for (const child of this.children) {
            child.parentNode = null;
            child.isConnected = false;
          }
          this.children = [];
        },
      });
      return element;
    },
  };
  return documentRef;
}

function createTestEvent(overrides = {}) {
  return {
    defaultPrevented: false,
    propagationStopped: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {
      this.propagationStopped = true;
    },
    stopImmediatePropagation() {
      this.immediatePropagationStopped = true;
    },
    ...overrides,
  };
}

function flushAsyncEvents() {
  return new Promise((resolve) => setImmediate(resolve));
}

test("parseInlineMath conserva assoluti, delta e clamp a zero", () => {
  assert.equal(parseInlineMath("", 12), 12);
  assert.equal(parseInlineMath("+5", 12), 17);
  assert.equal(parseInlineMath("-20", 12), 0);
  assert.equal(parseInlineMath("7", 12), 7);
  assert.equal(parseInlineMath("abc", 12), 12);
});

test("i normalizzatori conservano i contratti correnti degli editor", () => {
  assert.equal(normalizeSignedIntegerInput("  +12a3 "), "+123");
  assert.equal(normalizeSignedIntegerInput("--8"), "-8");
  assert.equal(normalizeSignedIntegerInput("1+2"), "12");
  assert.equal(normalizeInitiativeInput(" 2a-1 "), "-21");
  assert.equal(normalizeInitiativeInput("-12"), "-12");
});

test("il wiring iniziativa gestisce apertura, commit e cleanup via callback", async () => {
  const documentRef = createTestDocument();
  const badge = documentRef.createElement("div");
  badge.textContent = "14";
  const calls = [];

  bindClassicInitiativeEditor({
    badge,
    isEditable: () => true,
    armClickIgnore: (duration) => calls.push(["ignore", duration]),
    beginEdit: async () => calls.push(["begin"]),
    readValue: async () => 17,
    editorReady: () => calls.push(["ready"]),
    cleanupEdit: () => calls.push(["cleanup"]),
    saveValue: async (value) => calls.push(["save", value]),
    afterCommit: async (value) => calls.push(["after", value]),
    afterCancel: async () => calls.push(["cancel"]),
    isFillMode: () => false,
    finishFillMode: async () => calls.push(["finish-fill"]),
    openFillNeighbor: async () => calls.push(["fill-neighbor"]),
    commitAndOpenNeighbor: async ({ commit }) => commit(),
    documentRef,
    requestAnimationFrameRef: (callback) => callback(),
    setTimeoutRef: (callback) => callback(),
  });

  await badge.dispatch("pointerdown", createTestEvent());
  const input = badge.children[0];
  assert.equal(input.tagName, "INPUT");
  assert.equal(input.value, "17");
  assert.equal(input.pattern, "-?\\d*");
  assert.equal(input.focused, true);
  assert.equal(input.selected, true);
  assert.equal(badge.dataset.initEditing, "1");

  input.value = " 21 ";
  await input.dispatch("keydown", createTestEvent({ key: "Enter" }));
  assert.equal(badge.textContent, "21");
  assert.equal(badge.dataset.initEditing, undefined);
  assert.equal(badge.__commitFn, undefined);
  assert.deepEqual(calls, [
    ["ignore", 350],
    ["begin"],
    ["ready"],
    ["save", "21"],
    ["cleanup"],
    ["after", "21"],
  ]);
});

test("il wiring HP conserva delta, anteprima e callback di persistenza", async () => {
  const documentRef = createTestDocument();
  const card = documentRef.createElement("article");
  card.dataset.itemId = "goblin-1";
  card.setAttribute("draggable", "true");
  const pill = documentRef.createElement("div");
  pill.textContent = "12/20";
  pill.innerHTML = "12/20";
  pill.style.fontSize = "12px";
  const hpFill = documentRef.createElement("div");
  card.appendChild(pill);
  card.appendChild(hpFill);

  let editingItemId = null;
  const calls = [];
  const parseRelativeDelta = (value) => {
    const match = /^([+\-])(\d+)$/.exec(String(value || "").trim());
    if (!match) return null;
    const amount = parseInt(match[2], 10);
    return match[1] === "-" ? -amount : amount;
  };

  bindClassicHPEditor({
    pill,
    itemId: "goblin-1",
    snapshotHP: 10,
    snapshotHPMax: 18,
    hpFill,
    getEditingItemId: () => editingItemId,
    isCurrentEditor: () => editingItemId === "goblin-1",
    armClickIgnore: (duration) => calls.push(["ignore", duration]),
    handoffEditor: async () => calls.push(["handoff"]),
    beginEdit: async () => {
      editingItemId = "goblin-1";
      calls.push(["begin"]);
    },
    readLiveValues: async () => ({ hp: 12, hpMax: 20 }),
    editorReady: () => calls.push(["ready"]),
    cleanupEdit: () => {
      editingItemId = null;
      calls.push(["cleanup"]);
    },
    parseRelativeDelta,
    setDeltaButtonActive: (active) => calls.push(["linked", active]),
    shouldIgnoreDocumentClick: () => false,
    formatHP: (hp, hpMax) => `${hp}/${hpMax}`,
    hpColorByPct: () => "#yellow",
    saveValues: async (result) => calls.push(["save", result]),
    afterCommit: async (result) => calls.push(["after", result]),
    commitAndOpenNeighbor: async ({ commit }) => commit(),
    documentRef,
    requestAnimationFrameRef: (callback) => callback(),
    setTimeoutRef: (callback) => callback(),
  });

  await pill.dispatch("pointerdown", createTestEvent({ clientX: 5 }));
  assert.equal(pill.dataset.hpEditing, "1");
  assert.equal(pill.__iHP.value, "12");
  assert.equal(pill.__iMax.value, "20");
  assert.equal(pill.__iHP.focused, true);
  assert.equal(card.getAttribute("draggable"), "false");

  pill.__iHP.value = "-5";
  await pill.__iHP.dispatch("keydown", createTestEvent({ key: "Enter" }));

  const expectedResult = {
    nextHP: 7,
    nextHPMax: 20,
    recalibratesMax: false,
    concentrationDamage: 5,
  };
  assert.equal(pill.innerHTML, "7/20");
  assert.equal(hpFill.style.width, "35%");
  assert.equal(hpFill.style.background, "#yellow");
  assert.equal(pill.dataset.hpEditing, undefined);
  assert.equal(editingItemId, null);
  assert.equal(card.getAttribute("draggable"), "true");
  assert.deepEqual(calls, [
    ["ignore", 350],
    ["begin"],
    ["ready"],
    ["save", expectedResult],
    ["cleanup"],
    ["linked", false],
    ["after", expectedResult],
  ]);
});

function createHPEditorRecoveryHarness({
  readLiveValues = async () => ({ hp: 10, hpMax: 20 }),
  saveValues = async () => {},
  isCurrentOperation = () => true,
  syncRecoveredValues = null,
  formatHP = (hp, hpMax) => `${hp}/${hpMax}`,
} = {}) {
  const documentRef = createTestDocument();
  const card = documentRef.createElement("article");
  card.dataset.itemId = "arch-06-token";
  card.setAttribute("draggable", "true");
  const pill = documentRef.createElement("div");
  pill.textContent = "10/20";
  pill.innerHTML = "10/20";
  const hpFill = documentRef.createElement("div");
  card.appendChild(pill);
  card.appendChild(hpFill);

  let editingItemId = null;
  let cleanupCalls = 0;
  const afterCommitCalls = [];
  bindClassicHPEditor({
    pill,
    itemId: "arch-06-token",
    snapshotHP: 10,
    snapshotHPMax: 20,
    hpFill,
    getEditingItemId: () => editingItemId,
    isCurrentEditor: () => editingItemId === "arch-06-token",
    isCurrentOperation,
    armClickIgnore: () => {},
    handoffEditor: async () => {},
    beginEdit: async () => { editingItemId = "arch-06-token"; },
    readLiveValues,
    editorReady: () => {},
    cleanupEdit: () => {
      editingItemId = null;
      cleanupCalls += 1;
    },
    syncRecoveredValues,
    parseRelativeDelta: () => null,
    setDeltaButtonActive: () => {},
    shouldIgnoreDocumentClick: () => false,
    formatHP,
    hpColorByPct: () => "#yellow",
    saveValues,
    afterCommit: async (result) => afterCommitCalls.push(result),
    commitAndOpenNeighbor: async ({ commit }) => commit(),
    documentRef,
    requestAnimationFrameRef: (callback) => callback(),
    setTimeoutRef: (callback) => callback(),
  });

  return {
    documentRef,
    card,
    pill,
    hpFill,
    afterCommitCalls,
    get cleanupCalls() { return cleanupCalls; },
    get editingItemId() { return editingItemId; },
    open: async () => {
      await pill.dispatch("pointerdown", createTestEvent({ clientX: 5 }));
      return { hpInput: pill.__iHP, wrap: pill.children[0] };
    },
  };
}

test("ARCH-06 T1: l'editor HP conserva il commit riuscito 10 → 3 e completa il cleanup", async () => {
  const canonical = { hp: 10, hpMax: 20 };
  const harness = createHPEditorRecoveryHarness({
    readLiveValues: async () => ({ ...canonical }),
    saveValues: async ({ nextHP, nextHPMax }) => {
      canonical.hp = nextHP;
      canonical.hpMax = nextHPMax;
    },
  });

  const { hpInput } = await harness.open();
  hpInput.value = "3";
  await hpInput.dispatch("keydown", createTestEvent({ key: "Enter" }));

  assert.deepEqual(canonical, { hp: 3, hpMax: 20 });
  assert.equal(harness.pill.innerHTML, "3/20");
  assert.equal(harness.hpFill.style.width, "15%");
  assert.equal(harness.pill.dataset.hpEditing, undefined);
  assert.equal(harness.pill.__commitFn, undefined);
  assert.equal(harness.pill.__iHP, undefined);
  assert.equal(harness.card.getAttribute("draggable"), "true");
  assert.equal(harness.editingItemId, null);
  assert.equal(harness.cleanupCalls, 1);
  assert.equal(harness.afterCommitCalls.length, 1);
});

test("ARCH-06 T2: il focusout con writer canonico rifiutato recupera 10 e chiude l'editor", async () => {
  const canonical = { hp: 10, hpMax: 20 };
  let liveReads = 0;
  const recoveredVisuals = [];
  const harness = createHPEditorRecoveryHarness({
    readLiveValues: async () => {
      liveReads += 1;
      return { ...canonical };
    },
    saveValues: async () => { throw new Error("injected-canonical-write-failure"); },
    syncRecoveredValues: ({ hp, hpMax }) => recoveredVisuals.push({ hp, hpMax }),
  });

  const { hpInput, wrap } = await harness.open();
  hpInput.value = "3";
  liveReads = 0;
  harness.documentRef.activeElement = null;
  await wrap.dispatch("focusout", createTestEvent());
  await flushAsyncEvents();

  assert.deepEqual(canonical, { hp: 10, hpMax: 20 });
  assert.equal(liveReads, 1, "la failure rilegge il canonico una sola volta");
  assert.equal(harness.pill.innerHTML, "10/20");
  assert.equal(harness.hpFill.style.width, "50%");
  assert.deepEqual(recoveredVisuals, [{ hp: 10, hpMax: 20 }]);
  assert.equal(harness.pill.dataset.hpEditing, undefined);
  assert.equal(harness.pill.__commitFn, undefined);
  assert.equal(harness.pill.__iHP, undefined);
  assert.equal(harness.card.getAttribute("draggable"), "true");
  assert.equal(harness.editingItemId, null);
  assert.equal(harness.cleanupCalls, 1);
  assert.equal(harness.afterCommitCalls.length, 0);
});

test("ARCH-06 T4: una scene change durante il commit pulisce A senza proiettare su B", async () => {
  const canonical = { hp: 10, hpMax: 20 };
  let operationCurrent = true;
  let recoveryReads = 0;
  const projections = [];
  const recoveredVisuals = [];
  const harness = createHPEditorRecoveryHarness({
    isCurrentOperation: () => operationCurrent,
    readLiveValues: async () => {
      recoveryReads += 1;
      return { ...canonical };
    },
    saveValues: async () => {
      operationCurrent = false;
      throw new Error("scene-changed-during-commit");
    },
    formatHP: (hp, hpMax) => {
      projections.push(`${hp}/${hpMax}`);
      return `${hp}/${hpMax}`;
    },
    syncRecoveredValues: (values) => recoveredVisuals.push(values),
  });

  const { hpInput } = await harness.open();
  hpInput.value = "3";
  recoveryReads = 0;
  await hpInput.dispatch("keydown", createTestEvent({ key: "Enter" }));

  assert.deepEqual(canonical, { hp: 10, hpMax: 20 });
  assert.equal(recoveryReads, 0, "la recovery della scena A non legge/proietta la scena B");
  assert.deepEqual(projections, ["3/20"]);
  assert.deepEqual(recoveredVisuals, []);
  assert.equal(harness.pill.dataset.hpEditing, undefined);
  assert.equal(harness.pill.__commitFn, undefined);
  assert.equal(harness.editingItemId, null);
  assert.equal(harness.cleanupCalls, 1);
  assert.equal(harness.afterCommitCalls.length, 0);
});

test("ARCH-06 T5: zero è un HP valido nel commit dell'editor", async () => {
  const canonical = { hp: 10, hpMax: 20 };
  const harness = createHPEditorRecoveryHarness({
    readLiveValues: async () => ({ ...canonical }),
    saveValues: async ({ nextHP, nextHPMax }) => {
      canonical.hp = nextHP;
      canonical.hpMax = nextHPMax;
    },
  });

  const { hpInput } = await harness.open();
  hpInput.value = "0";
  await hpInput.dispatch("keydown", createTestEvent({ key: "Enter" }));

  assert.deepEqual(canonical, { hp: 0, hpMax: 20 });
  assert.equal(harness.pill.innerHTML, "0/20");
  assert.equal(harness.hpFill.style.width, "0%");
  assert.equal(harness.pill.dataset.hpEditing, undefined);
  assert.equal(harness.cleanupCalls, 1);
});

test("l'editor delta HP di gruppo delega soltanto il valore normalizzato", async () => {
  const documentRef = createTestDocument();
  const card = documentRef.createElement("article");
  card.setAttribute("draggable", "true");
  const button = documentRef.createElement("button");
  card.appendChild(button);
  const calls = [];
  const parseRelativeDelta = (value) => {
    const match = /^([+\-])(\d+)$/.exec(String(value || "").trim());
    if (!match) return null;
    const amount = parseInt(match[2], 10);
    return match[1] === "-" ? -amount : amount;
  };

  bindGroupHPDeltaEditor({
    button,
    card,
    armClickIgnore: (duration) => calls.push(["ignore", duration]),
    closeEditors: async () => calls.push(["close"]),
    parseRelativeDelta,
    applyDelta: async (delta) => calls.push(["apply", delta]),
    documentRef,
    requestAnimationFrameRef: (callback) => callback(),
  });

  await button.dispatch("click", createTestEvent());
  const input = card.children[0];
  assert.equal(input.tagName, "INPUT");
  assert.equal(input.dataset.groupHpDeltaEditor, "1");
  assert.equal(input.focused, true);
  assert.equal(input.selected, true);
  assert.equal(card.getAttribute("draggable"), "false");

  input.value = " +4px ";
  await input.dispatch("input");
  assert.equal(input.value, "+4");
  await input.dispatch("keydown", createTestEvent({ key: "Enter" }));
  await flushAsyncEvents();

  assert.equal(card.children[0], button);
  assert.equal(card.getAttribute("draggable"), "true");
  assert.deepEqual(calls, [
    ["ignore", 350],
    ["close"],
    ["apply", 4],
  ]);
});

test("il rename classico mantiene stile, dataset e persistenza iniettata", async () => {
  const documentRef = createTestDocument();
  const card = documentRef.createElement("article");
  const name = documentRef.createElement("div");
  const nameLabel = documentRef.createElement("span");
  name.appendChild(nameLabel);
  card.appendChild(name);
  card.draggable = true;
  const saved = [];

  enableClassicCardRename({
    card,
    name,
    nameLabel,
    getOriginalName: () => "Goblin",
    borderColor: "#abcdef",
    dragAllowed: true,
    saveName: async (nextName) => saved.push(nextName),
    documentRef,
  });

  assert.equal(nameLabel.title, "Doppio clic per rinominare il token");
  assert.equal(nameLabel.style.cursor, "text");
  await nameLabel.dispatch("dblclick", createTestEvent());
  const input = name.children[0];
  assert.equal(input.tagName, "INPUT");
  assert.equal(input.dataset.cardSelectionIgnore, "1");
  assert.equal(input.style.border, "1px solid #abcdef");
  assert.equal(card.dataset.renaming, "1");
  assert.equal(card.draggable, false);

  input.value = "  Hobgoblin  ";
  await input.dispatch("keydown", createTestEvent({ key: "Enter" }));
  await flushAsyncEvents();
  assert.deepEqual(saved, ["Hobgoblin"]);
  assert.equal(name.children[0], nameLabel);
  assert.equal(nameLabel.textContent, "Hobgoblin");
  assert.equal(name.title, "Hobgoblin");
  assert.equal(card.dataset.renaming, undefined);
  assert.equal(card.draggable, true);
});
