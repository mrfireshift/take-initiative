import test from "node:test";
import assert from "node:assert/strict";

import {
  appendClassicEpicTags,
  buildClassicBossChrome,
  buildClassicLegendaryResourceDock,
  buildClassicParagonDock,
  buildLegendaryResourcePips,
} from "../src/initiativeCardBossClassic.js";

function createTestDocument() {
  return {
    createElement(tagName) {
      return {
        tagName: String(tagName).toUpperCase(),
        style: {},
        dataset: {},
        attributes: {},
        children: [],
        listeners: {},
        textContent: "",
        title: "",
        appendChild(child) {
          this.children.push(child);
          return child;
        },
        append(...children) {
          this.children.push(...children);
        },
        setAttribute(name, value) {
          this.attributes[name] = String(value);
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
      };
    },
  };
}

function eventStub() {
  return {
    stopped: false,
    stopPropagation() {
      this.stopped = true;
    },
  };
}

const pipsConfig = { gap: 2, size: 7 };
const resourceConfig = {
  top: 31,
  clusterGap: 3,
  controlWidth: 14,
  controlHeight: 10,
};
const paragonConfig = {
  top: -8,
  right: null,
  rightFromBadge: 105,
  gap: 2,
  paddingX: 0,
  paddingY: 0,
  btnSize: 20,
  btnRadius: 32,
};

test("la chrome boss conserva cornice e righe Legendary", () => {
  const documentRef = createTestDocument();
  const chrome = buildClassicBossChrome({
    isBoss: true,
    hasLegendary: true,
    groupCollapsed: false,
    isGM: true,
    playerBossVerticalOffset: 0,
    avatarSize: 72,
    avatarLeft: -12,
    mainCardHeight: 76,
    contentLeft: 76,
    badgeRight: 10,
    badgeSize: 42,
    portraitFrameSrc: "/boss-frame.svg",
    portraitFrameScale: 1.25,
    documentRef,
  });

  assert.equal(chrome.portraitFrame.src, "/boss-frame.svg");
  assert.equal(chrome.portraitFrame.style.width, "90px");
  assert.equal(chrome.portraitFrame.style.left, "-21px");
  assert.equal(chrome.topRow.style.top, "8px");
  assert.equal(chrome.topRow.style.left, "76px");
  assert.equal(chrome.topRow.style.right, "62px");
  assert.equal(chrome.hpRow.style.top, "49px");
  assert.equal(chrome.bossHPBarBottom, 8);
});

test("i pips Legendary conservano ordine, stato e callback GM", async () => {
  const documentRef = createTestDocument();
  const values = [];
  const pips = buildLegendaryResourcePips(
    { max: 3, current: 2 },
    (value) => values.push(value),
    {
      isGM: true,
      attitude: "enemy",
      config: pipsConfig,
      documentRef,
    },
  );

  assert.equal(pips.children.length, 3);
  assert.equal(pips.children[0].attributes["aria-pressed"], "true");
  assert.equal(pips.children[1].style.background, "#ff0000");
  assert.equal(pips.children[2].attributes["aria-pressed"], "false");
  const event = eventStub();
  await pips.children[0].dispatch("click", event);
  assert.equal(event.stopped, true);
  assert.deepEqual(values, [0]);
});

test("i tag Epic mantengono ordine boss poi azione virtuale", () => {
  const documentRef = createTestDocument();
  const header = documentRef.createElement("div");
  const config = {
    posBoss: { top: -6, right: null, rightFromBadge: 100, gap: 6 },
    posAction: { top: -6, right: null, rightFromBadge: 115, gap: 6 },
    epic: { label: "Boss Epico", fontSize: 12 },
    action: { label: "Azione Epica", fontSize: 9 },
  };

  const docks = appendClassicEpicTags(
    header,
    { isEpicAction: true },
    {
      isEpic: true,
      config,
      badgeRight: 10,
      badgeSize: 42,
      documentRef,
    },
  );

  assert.deepEqual(header.children, docks);
  assert.equal(docks[0].children[0].textContent, "Boss Epico");
  assert.equal(docks[0].style.right, "152px");
  assert.equal(docks[1].children[0].textContent, "Azione Epica");
  assert.equal(docks[1].style.right, "167px");
});

test("il dock Legendary conserva cluster e routing dei controlli", async () => {
  const documentRef = createTestDocument();
  const calls = [];
  const dock = buildClassicLegendaryResourceDock(
    {
      id: "dragon",
      attitude: "enemy",
      legendary: { max: 3, current: 2 },
      legendaryResistances: { max: 3, current: 1 },
    },
    {
      isGM: true,
      playerBossVerticalOffset: 0,
      contentLeft: 76,
      badgeRight: 10,
      badgeSize: 42,
      resourceConfig,
      pipsConfig,
      defaultResistances: 3,
      onActionCurrent: async (value) => calls.push(["action", value]),
      onActionMax: async (value) => calls.push(["action-max", value]),
      onResistanceCurrent: async (value) => calls.push(["resistance", value]),
      onResistanceMax: async (value) => calls.push(["resistance-max", value]),
      documentRef,
    },
  );

  assert.equal(dock.children.length, 3);
  const [actions, divider, resistances] = dock.children;
  assert.equal(actions.children[0].textContent, "A");
  assert.equal(divider.style.width, "1px");
  assert.equal(resistances.children[0].textContent, "R");

  await actions.children[1].children[1].dispatch("click", eventStub());
  await actions.children[2].children[0].dispatch("click", eventStub());
  await resistances.children[1].children[0].dispatch("click", eventStub());
  await resistances.children[2].children[1].dispatch("click", eventStub());
  assert.deepEqual(calls, [
    ["action", 1],
    ["action-max", 4],
    ["resistance", 0],
    ["resistance-max", 2],
  ]);
});

test("il dock Paragon mantiene ordine meno, più, contatore", async () => {
  const documentRef = createTestDocument();
  const calls = [];
  const dock = buildClassicParagonDock(
    {
      id: "hydra",
      __paragonBaseId: "hydra-base",
      paragonActions: 3,
      legendary: { max: 0 },
    },
    {
      isGM: true,
      config: paragonConfig,
      badgeRight: 10,
      badgeSize: 42,
      onSetActions: async (...args) => calls.push(args),
      documentRef,
    },
  );

  assert.deepEqual(
    dock.children.map((child) => child.textContent),
    ["−", "+", "3"],
  );
  assert.equal(dock.style.right, "157px");
  await dock.children[0].dispatch("click", eventStub());
  await dock.children[1].dispatch("click", eventStub());
  assert.deepEqual(calls, [
    ["hydra-base", 2],
    ["hydra-base", 4],
  ]);
});

test("un'Azione Epica virtuale non monta dock Legendary o Paragon", () => {
  const epicAction = {
    id: "__EPIC__::dragon::after::hero",
    isEpicAction: true,
  };

  assert.equal(buildClassicLegendaryResourceDock(epicAction, {
    isGM: true,
  }), null);
  assert.equal(buildClassicParagonDock(epicAction, {
    isGM: true,
  }), null);
});
