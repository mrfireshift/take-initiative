globalThis.document ||= {
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {},
  removeEventListener: () => {},
};
globalThis.localStorage ||= {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};
globalThis.MutationObserver ||= class {
  observe() {}
  disconnect() {}
};

import test, { mock } from "node:test";
import assert from "node:assert/strict";

import { ID } from "../src/constants.js";
import { SPELL_STATIC_ZONE_META_KEY } from "../src/spellStaticZoneCore.js";
import {
  HEAT_METAL_TURN_PROMPT_ACTION_ID,
  STORM_SPHERE_TURN_PROMPT_ACTION_ID,
} from "../src/callLightningTurnPromptCore.js";

const META_KEY = `${ID}/meta`;
const SPELLS_KEY = `${ID}/spells`;
const CONC_META_KEY = `${ID}/concentration`;

let sceneItemsMock = [];
let openPopoverCalls = [];
let closePopoverCalls = [];
let turnNoticeHandler = null;

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    buildLabel: () => ({
      plainText() { return this; },
      position() { return this; },
      width() { return this; },
      height() { return this; },
      padding() { return this; },
      fontSize() { return this; },
      fontWeight() { return this; },
      fillColor() { return this; },
      strokeColor() { return this; },
      strokeWidth() { return this; },
      backgroundColor() { return this; },
      backgroundOpacity() { return this; },
      cornerRadius() { return this; },
      pointerWidth() { return this; },
      pointerHeight() { return this; },
      attachedTo() { return this; },
      layer() { return this; },
      locked() { return this; },
      disableHit() { return this; },
      zIndex() { return this; },
      name() { return this; },
      metadata() { return this; },
      build() { return { id: "mock-label" }; },
    }),
    buildImage: () => ({ build: () => ({ id: "mock-image" }) }),
    buildPath: () => ({ build: () => ({ id: "mock-path" }) }),
    buildText: () => ({ build: () => ({ id: "mock-text" }) }),
    buildShape: () => ({ build: () => ({ id: "mock-shape" }) }),
    Command: class Command {},
    default: {
      onReady() {},
      player: {
        getRole: async () => "GM",
        getSelection: async () => [],
        getId: async () => "gm-user",
        getName: async () => "GM",
        onChange: () => () => {},
      },
      scene: {
        isReady: async () => true,
        getMetadata: async () => ({}),
        onReadyChange: () => () => {},
        items: {
          getItems: async () => sceneItemsMock,
          getItemBounds: async (ids) => {
            const list = Array.isArray(ids) ? ids : [ids];
            return list.map(() => ({
              min: { x: 100, y: 100 },
              max: { x: 250, y: 250 },
              center: { x: 175, y: 175 },
              width: 150,
              height: 150,
            }));
          },
          onChange: () => () => {},
        },
      },
      viewport: {
        transformPoint: async (p) => ({ x: p.x, y: p.y }),
        getWidth: async () => 1200,
        getHeight: async () => 800,
      },
      broadcast: {
        onMessage: (channel, handler) => {
          if (channel.includes("turn-notice")) {
            turnNoticeHandler = handler;
          }
          return () => {};
        },
        sendMessage: async () => {},
      },
      popover: {
        open: async (options) => {
          openPopoverCalls.push(options);
        },
        close: async (id) => {
          closePopoverCalls.push(id);
        },
        getWidth: async () => 280,
        getHeight: async () => 320,
      },
    },
  },
});

mock.module("../src/initiativeCards.js", {
  exports: {
    getInitiativeCard: () => null,
  },
});

const {
  mountCallLightningTurnPromptController,
  unmountCallLightningTurnPromptController,
} = await import("../src/callLightningTurnPromptController.js");

function createCasterToken(id, instanceId) {
  return {
    id,
    name: "Mago",
    position: { x: 100, y: 100 },
    layer: "CHARACTER",
    metadata: {
      [META_KEY]: {
        hp: 30,
        hpMax: 30,
        attitude: "pc",
        conditions: { version: 2, instances: [] },
        [SPELLS_KEY]: [{
          name: "Sfera della Tempesta",
          spellId: "xanathar-sfera-della-tempesta",
          instanceId,
          casterId: id,
          conc: true,
          castContext: {
            staticZoneOwner: true,
            staticZoneRuleId: "xanathar-sfera-della-tempesta:cast",
            slotLevel: 4,
          },
        }],
        [CONC_META_KEY]: {
          [instanceId]: {
            instanceId,
            spellId: "xanathar-sfera-della-tempesta",
            name: "Sfera della Tempesta",
          },
        },
      },
    },
  };
}

function createZoneRoot(instanceId, casterId) {
  return {
    id: "zone-root-1",
    name: "Sfera della Tempesta",
    position: { x: 300, y: 300 },
    metadata: {
      [SPELL_STATIC_ZONE_META_KEY]: {
        role: "root",
        instanceId,
        casterId,
        spellId: "xanathar-sfera-della-tempesta",
      },
    },
  };
}

function createHeatMetalCasterToken(id, instanceId, turnKey) {
  return {
    id,
    name: "Mago",
    position: { x: 100, y: 100 },
    layer: "CHARACTER",
    metadata: {
      [META_KEY]: {
        hp: 30,
        hpMax: 30,
        attitude: "pc",
        conditions: { version: 2, instances: [] },
        [SPELLS_KEY]: [],
        [CONC_META_KEY]: {
          [instanceId]: {
            instanceId,
            spellId: "heat-metal",
            name: "Riscaldare il Metallo",
            targets: ["heat-target"],
            appliedAt: { round: 1, actorId: id, turnKey },
            castContext: { slotLevel: 3 },
          },
        },
      },
    },
  };
}

function createHeatMetalTargetToken(instanceId, casterId, turnKey) {
  return {
    id: "heat-target",
    name: "Portatore",
    position: { x: 180, y: 100 },
    layer: "CHARACTER",
    metadata: {
      [META_KEY]: {
        conditions: { version: 2, instances: [] },
        [SPELLS_KEY]: [{
          name: "Riscaldare il Metallo",
          spellId: "heat-metal",
          instanceId,
          casterId,
          appliedAt: { round: 1, actorId: casterId, turnKey },
          conc: true,
          castContext: { slotLevel: 3 },
        }],
      },
    },
  };
}

test("CONTROLLER INTEGRATION — Turn notice triggers openTrackedPopover exactly once for caster", async () => {
  const casterId = "caster-1";
  const instanceId = "storm-instance-1";
  const caster = createCasterToken(casterId, instanceId);
  const zoneRoot = createZoneRoot(instanceId, casterId);
  sceneItemsMock = [caster, zoneRoot];
  openPopoverCalls = [];
  closePopoverCalls = [];

  await mountCallLightningTurnPromptController();
  assert.ok(typeof turnNoticeHandler === "function", "Turn notice listener must be registered");

  // 1. Turn notice per un altro token -> 0 chiamate popover open
  openPopoverCalls = [];
  await turnNoticeHandler({
    data: {
      type: "show-turn-notice",
      currentId: "other-enemy",
      turnKey: "1:0:other-enemy",
      sceneEpoch: 1,
    },
  });
  // Give async queue a moment to flush
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(openPopoverCalls.length, 0, "No popover for other tokens");

  // 2. Turn notice per il caster di Sfera della Tempesta -> openTrackedPopover chiamato esattamente 1 volta
  openPopoverCalls = [];
  await turnNoticeHandler({
    data: {
      type: "show-turn-notice",
      currentId: casterId,
      turnKey: "1:1:caster-1",
      sceneEpoch: 1,
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(openPopoverCalls.length, 1, "Popover must be opened once on caster turn");
  const call = openPopoverCalls[0];
  assert.ok(call.url.includes("spell-active-resolution.html"), "URL must point to spell-active-resolution.html");
  assert.ok(call.url.includes("payload="), "URL must contain payload query param");

  const urlObj = new URL(call.url, "http://localhost");
  const parsedPayload = JSON.parse(decodeURIComponent(urlObj.searchParams.get("payload")));
  assert.equal(parsedPayload.spellId, "xanathar-sfera-della-tempesta");
  assert.equal(parsedPayload.actionId, STORM_SPHERE_TURN_PROMPT_ACTION_ID);
  assert.equal(parsedPayload.instanceId, instanceId);
  assert.equal(parsedPayload.casterId, casterId);
  assert.equal(parsedPayload.zoneItemId, "zone-root-1");

  // 3. Reconcile / turn notice ripetuto sullo STESSO turno -> nessun duplicate open
  openPopoverCalls = [];
  await turnNoticeHandler({
    data: {
      type: "show-turn-notice",
      currentId: casterId,
      turnKey: "1:1:caster-1",
      sceneEpoch: 1,
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(openPopoverCalls.length, 0, "No duplicate popover opens on the same turn");

  // 4. Turno avanza ad altro combattente -> popover viene chiuso
  closePopoverCalls = [];
  await turnNoticeHandler({
    data: {
      type: "show-turn-notice",
      currentId: "other-enemy",
      turnKey: "1:2:other-enemy",
      sceneEpoch: 1,
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(closePopoverCalls.length > 0, "Popover must be closed when turn changes");

  // 5. Fine concentrazione sul caster -> nessun popover aperto
  caster.metadata[META_KEY][SPELLS_KEY] = [];
  caster.metadata[META_KEY].concentration = {};
  openPopoverCalls = [];
  await turnNoticeHandler({
    data: {
      type: "show-turn-notice",
      currentId: casterId,
      turnKey: "2:1:caster-1",
      sceneEpoch: 1,
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(openPopoverCalls.length, 0, "No popover after concentration ends");

  await unmountCallLightningTurnPromptController();
});

test("CONTROLLER INTEGRATION — Heat Metal apre il popup mobile solo dal turno successivo", async () => {
  const casterId = "heat-caster";
  const instanceId = "heat-instance-1";
  const castTurn = "1:0:heat-caster";
  sceneItemsMock = [
    createHeatMetalCasterToken(casterId, instanceId, castTurn),
    createHeatMetalTargetToken(instanceId, casterId, castTurn),
  ];
  openPopoverCalls = [];
  closePopoverCalls = [];

  await mountCallLightningTurnPromptController();
  assert.ok(typeof turnNoticeHandler === "function", "Turn notice listener must be registered");

  await turnNoticeHandler({
    data: {
      type: "show-turn-notice",
      currentId: casterId,
      turnKey: castTurn,
      sceneEpoch: 2,
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(openPopoverCalls.length, 0, "Heat Metal must not open on the cast turn");

  await turnNoticeHandler({
    data: {
      type: "show-turn-notice",
      currentId: casterId,
      turnKey: "2:0:heat-caster",
      sceneEpoch: 2,
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(openPopoverCalls.length, 1, "Heat Metal must open on the next caster turn");
  const call = openPopoverCalls[0];
  assert.ok(call.url.includes("spell-active-resolution.html"));
  assert.equal(call.width, 360);
  const urlObj = new URL(call.url, "http://localhost");
  const payload = JSON.parse(decodeURIComponent(urlObj.searchParams.get("payload")));
  assert.equal(payload.spellId, "heat-metal");
  assert.equal(payload.actionId, HEAT_METAL_TURN_PROMPT_ACTION_ID);
  assert.equal(payload.action.resolutionKind, "single-save");
  assert.equal(payload.action.economy, "bonus-action");
  assert.deepEqual(payload.action.save, { ability: "con", onSuccess: "none" });
  assert.equal(payload.action.damage.onSave, "full");
  assert.equal(payload.action.attack, undefined);
  assert.equal(payload.action.effectOn, undefined);
  assert.equal(payload.linkedTargetId, "heat-target");
  assert.doesNotMatch(call.url, /prepared-spell-resolution\.html/);

  await unmountCallLightningTurnPromptController();
});
