import test from "node:test";
import assert from "node:assert/strict";

import { getSpellDefinition } from "../src/spells-srd.js";
import { renderSpellOverview } from "../src/spellsPanelOverviewView.js";

function createTestDocument() {
  const createNode = (tagName = "") => ({
    tagName: String(tagName).toUpperCase(),
    attributes: {},
    children: [],
    dataset: {},
    disabled: false,
    listeners: {},
    textContent: "",
    title: "",
    value: "",
    append(...children) {
      this.children.push(...children);
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    replaceChildren(...children) {
      this.children = [...children];
    },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    addEventListener(type, listener) {
      if (!this.listeners[type]) this.listeners[type] = [];
      this.listeners[type].push(listener);
    },
    async dispatch(type, event = {}) {
      const normalizedEvent = {
        preventDefault() {},
        stopPropagation() {},
        ...event,
      };
      for (const listener of this.listeners[type] || []) {
        await listener(normalizedEvent);
      }
    },
  });

  return {
    createElement: createNode,
    createTextNode(textContent) {
      return { nodeType: 3, textContent };
    },
  };
}

function createReferenceButton(documentRef, title, onClick) {
  const button = documentRef.createElement("button");
  button.title = title;
  button.addEventListener("click", onClick);
  return button;
}

function overviewGroup(overrides = {}) {
  return {
    instanceId: "spell-instance",
    storedName: "Benedizione",
    spellId: "bless",
    castContext: {},
    name: "Benedizione",
    casterId: "caster",
    casterName: "Chierico",
    concentrating: true,
    targets: new Map([
      ["target-a", "Guerriero"],
      ["target-b", "Ladro"],
    ]),
    turns: [3, 2],
    counters: [],
    ...overrides,
  };
}

test("la panoramica vuota aggiorna conteggio e placeholder", () => {
  const documentRef = createTestDocument();
  const overviewList = documentRef.createElement("div");
  const overviewCount = documentRef.createElement("span");

  renderSpellOverview({
    document: documentRef,
    overviewList,
    overviewCount,
    groups: [],
  });

  assert.equal(overviewCount.textContent, "0");
  assert.equal(overviewList.children.length, 1);
  assert.equal(overviewList.children[0].className, "overview-empty");
  assert.equal(
    overviewList.children[0].textContent,
    "Nessun incantesimo attivo sul campo.",
  );
});

test("la riga conserva contenuto, riferimenti e azioni di terminazione", async () => {
  const documentRef = createTestDocument();
  const overviewList = documentRef.createElement("div");
  const overviewCount = documentRef.createElement("span");
  const opened = [];
  const terminatedTargets = [];
  const terminatedGroups = [];
  const group = overviewGroup();

  renderSpellOverview({
    document: documentRef,
    overviewList,
    overviewCount,
    groups: [group],
    createReferenceButton: (title, onClick) => (
      createReferenceButton(documentRef, title, onClick)
    ),
    onOpenReference(currentGroup) {
      opened.push(currentGroup);
    },
    async onTerminateTarget(currentGroup, targetId) {
      terminatedTargets.push([currentGroup, targetId]);
    },
    async onTerminate(currentGroup) {
      terminatedGroups.push(currentGroup);
    },
  });

  assert.equal(overviewCount.textContent, "1");
  const row = overviewList.children[0];
  const content = row.children[0];
  const actions = row.children[1];
  const heading = content.children[0];
  const targets = content.children[2];
  assert.equal(row.className, "spell-overview-row");
  assert.equal(heading.children[0].textContent, "Benedizione");
  assert.equal(heading.children[2].textContent, "2-3 round");
  assert.equal(heading.children[3].title, "Concentrazione");
  assert.equal(targets.children[2].textContent, ", ");

  await heading.children[1].dispatch("click");
  await targets.children[1].children[1].dispatch("click");
  await actions.children[0].dispatch("click");

  assert.deepEqual(opened, [group]);
  assert.deepEqual(terminatedTargets, [[group, "target-a"]]);
  assert.deepEqual(terminatedGroups, [group]);
});

test("la preparazione espone la risoluzione solo con bersagli selezionati", async () => {
  const documentRef = createTestDocument();
  const overviewList = documentRef.createElement("div");
  const spell = getSpellDefinition("Punizione Collerica");
  const group = overviewGroup({
    storedName: "Punizione Collerica",
    spellId: spell.id,
    name: spell.displayName,
    castContext: { phase: "prepare", slotLevel: 1 },
    targets: new Map([["caster", "Chierico"]]),
    turns: [10],
  });
  let selectedTargetIds = [];
  const resolutions = [];

  renderSpellOverview({
    document: documentRef,
    overviewList,
    groups: [group],
    createReferenceButton: (title, onClick) => (
      createReferenceButton(documentRef, title, onClick)
    ),
    getSelectedTargetIds: () => selectedTargetIds,
    async onResolve(payload) {
      resolutions.push(payload);
    },
  });

  const row = overviewList.children[0];
  const targets = row.children[0].children[2];
  const resolve = row.children[1].children[0];
  assert.equal(targets.children[0].textContent, "Preparato su: ");
  assert.equal(resolve.dataset.resolveSpell, "1");

  await resolve.dispatch("click");
  assert.equal(resolutions.length, 0);
  assert.equal(resolve.disabled, false);

  selectedTargetIds = ["enemy"];
  await resolve.dispatch("click");
  assert.equal(resolutions.length, 1);
  assert.equal(resolutions[0].group, group);
  assert.equal(resolutions[0].spell.id, spell.id);
  assert.deepEqual(resolutions[0].targetIds, ["enemy"]);
  assert.equal(resolutions[0].selectedChoice, "");
});

test("Colpo dello Zefiro mostra e consuma l'azione direttamente nella scheda", async () => {
  const documentRef = createTestDocument();
  const overviewList = documentRef.createElement("div");
  const spell = getSpellDefinition("Colpo dello Zefiro");
  const group = overviewGroup({
    storedName: spell.displayName,
    spellId: spell.id,
    name: spell.displayName,
    casterId: "caster",
    casterName: "Ranger",
    targets: new Map([["caster", "Ranger"]]),
    effectInstances: [{
      itemId: "caster",
      instanceId: "zephyr-ready",
      effectId: "zephyr-strike",
    }],
  });
  const activations = [];

  renderSpellOverview({
    document: documentRef,
    overviewList,
    groups: [group],
    createReferenceButton: (title, onClick) => (
      createReferenceButton(documentRef, title, onClick)
    ),
    async onActivate(payload) {
      activations.push(payload);
    },
  });

  const action = overviewList.children[0].children[1].children[0];
  assert.equal(action.className, "activate-spell");
  assert.equal(action.textContent, "Usa colpo");
  assert.equal(action.disabled, false);

  await action.dispatch("click");

  assert.equal(activations.length, 1);
  assert.equal(activations[0].action.id, "zephyr-strike-attack");
  assert.deepEqual(activations[0].targetIds, []);
});

test("Investitura del Ghiaccio conta i falliti selezionati nell'azione", async () => {
  const documentRef = createTestDocument();
  const overviewList = documentRef.createElement("div");
  const spell = getSpellDefinition("Investitura del Ghiaccio");
  const group = overviewGroup({
    storedName: spell.displayName,
    spellId: spell.id,
    name: spell.displayName,
    casterId: "caster",
    casterName: "Druido",
    targets: new Map([["caster", "Druido"]]),
  });
  let selectedTargetIds = [];
  const activations = [];

  renderSpellOverview({
    document: documentRef,
    overviewList,
    groups: [group],
    createReferenceButton: (title, onClick) => (
      createReferenceButton(documentRef, title, onClick)
    ),
    getSelectedTargetIds: () => selectedTargetIds,
    async onActivate(payload) {
      activations.push(payload);
    },
  });

  const action = overviewList.children[0].children[1].children[0];
  assert.equal(action.textContent, "Cono gelido · 0 falliti");
  assert.equal(action.disabled, true);

  await action.dispatch("click");
  assert.equal(activations.length, 0);

  selectedTargetIds = ["enemy-a", "enemy-b"];
  action.disabled = false;
  await action.dispatch("click");
  assert.equal(activations.length, 1);
  assert.deepEqual(activations[0].targetIds, ["enemy-a", "enemy-b"]);
});

test("un errore d'azione riabilita il controllo e mantiene il messaggio", async () => {
  const documentRef = createTestDocument();
  const overviewList = documentRef.createElement("div");
  const errors = [];

  renderSpellOverview({
    document: documentRef,
    overviewList,
    groups: [overviewGroup()],
    createReferenceButton: (title, onClick) => (
      createReferenceButton(documentRef, title, onClick)
    ),
    async onTerminateTarget() {
      throw new Error("fallimento atteso");
    },
    onActionError(action, error) {
      errors.push([action, error.message]);
    },
  });

  const terminateTarget = overviewList.children[0]
    .children[0]
    .children[2]
    .children[1]
    .children[1];
  await terminateTarget.dispatch("click");

  assert.equal(terminateTarget.disabled, false);
  assert.deepEqual(errors, [["terminate target spell", "fallimento atteso"]]);
});
