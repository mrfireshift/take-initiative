import assert from "node:assert/strict";
import test from "node:test";

import { ID } from "../src/constants.js";
import {
  CALL_LIGHTNING_TURN_PROMPT_ACTION_ID,
  callLightningTurnPromptPayloads,
  CONTROL_WINDS_DOWNDRAFT_TURN_PROMPT_ACTION_ID,
  CONTROL_WINDS_GUSTS_TURN_PROMPT_ACTION_ID,
  CONTROL_WINDS_PAUSE_TURN_PROMPT_ACTION_ID,
  CONTROL_WINDS_UPDRAFT_TURN_PROMPT_ACTION_ID,
  FLAME_INVESTITURE_TURN_PROMPT_ACTION_ID,
  HEAT_METAL_TURN_PROMPT_ACTION_ID,
  HOLY_WEAPON_TURN_PROMPT_ACTION_ID,
  MAXIMILIAN_GRAB_TURN_PROMPT_ACTION_ID,
  MAXIMILIAN_CRUSH_TURN_PROMPT_ACTION_ID,
  spellTurnPromptRequests,
  STORM_SPHERE_TURN_PROMPT_ACTION_ID,
} from "../src/callLightningTurnPromptCore.js";
import { SPELL_STATIC_ZONE_META_KEY } from "../src/spellStaticZoneCore.js";
import { SPELL_BOARD_TOKEN_META_KEY } from "../src/spellBoardTokenCore.js";

const META_KEY = `${ID}/meta`;
const SPELLS_KEY = `${ID}/spells`;
const CONC_META_KEY = `${ID}/concentration`;

function item(id, spells = []) {
  return {
    id,
    name: id,
    metadata: {
      [META_KEY]: {
        [SPELLS_KEY]: spells,
      },
    },
  };
}

function ownerSpell(instanceId, casterId) {
  return {
    name: "Invocare il fulmine",
    spellId: "call-lightning",
    instanceId,
    casterId,
    conc: true,
    castContext: {
      staticZoneOwner: true,
      staticZoneRuleId: "call-lightning:cloud",
      slotLevel: 5,
    },
  };
}

function stormSphereOwnerSpell(instanceId, casterId) {
  return {
    name: "Sfera della Tempesta",
    spellId: "xanathar-sfera-della-tempesta",
    instanceId,
    casterId,
    conc: true,
    castContext: {
      staticZoneOwner: true,
      staticZoneRuleId: "xanathar-sfera-della-tempesta:cast",
      slotLevel: 4,
    },
  };
}

function flameInvestitureOwnerSpell(instanceId, casterId, turnKey) {
  return {
    name: "Investitura della Fiamma",
    spellId: "xanathar-investitura-della-fiamma",
    instanceId,
    casterId,
    appliedAt: { round: 1, actorId: casterId, turnKey },
    conc: true,
    castContext: {
      mobileAura: true,
      slotLevel: 6,
    },
  };
}

function heatMetalOwnerSpell(instanceId, casterId, turnKey) {
  return {
    name: "Riscaldare il Metallo",
    spellId: "heat-metal",
    instanceId,
    casterId,
    appliedAt: { round: 1, actorId: casterId, turnKey },
    conc: true,
    castContext: { slotLevel: 2 },
  };
}

test("il prompt seleziona solo le istanze di Invocare il fulmine del turno corrente", () => {
  const payloads = callLightningTurnPromptPayloads({
    actorId: "caster-a::p1",
    sceneEpoch: 8,
    turnKey: "2:1:caster-a::p1",
    items: [
      item("caster-a", [ownerSpell("call-a", "caster-a")]),
      item("caster-b", [ownerSpell("call-b", "caster-b")]),
      item("target", [{
        ...ownerSpell("call-a", "caster-a"),
        castContext: { slotLevel: 5 },
      }]),
    ],
  });

  assert.equal(payloads.length, 1);
  assert.equal(payloads[0].instanceId, "call-a");
  assert.equal(payloads[0].casterId, "caster-a");
  assert.equal(payloads[0].actionId, CALL_LIGHTNING_TURN_PROMPT_ACTION_ID);
  assert.equal(payloads[0].turnKey, "2:1:caster-a::p1");
  assert.equal(payloads[0].slotLevel, 5);
});

test("più istanze e caster restano separati senza entrare nello stato di iniziativa", () => {
  const items = [
    item("caster-a", [
      ownerSpell("call-a1", "caster-a"),
      ownerSpell("call-a2", "caster-a"),
    ]),
    item("caster-b", [ownerSpell("call-b", "caster-b")]),
  ];
  const payloads = callLightningTurnPromptPayloads({
    items,
    actorId: "caster-a",
    sceneEpoch: 3,
    turnKey: "1:0:caster-a",
  });

  assert.deepEqual(
    payloads.map((payload) => payload.instanceId),
    ["call-a1", "call-a2"],
  );
  assert.equal(payloads.some((payload) => payload.instanceId === "call-b"), false);
  assert.equal(items.every((candidate) => !candidate.order), true);
});

test("il prompt di turno espone il fulmine opzionale della Sfera della Tempesta", () => {
  const payloads = callLightningTurnPromptPayloads({
    items: [
      item("caster-a", [stormSphereOwnerSpell("storm-a", "caster-a")]),
      item("caster-b", [stormSphereOwnerSpell("storm-b", "caster-b")]),
      {
        id: "storm-root",
        metadata: {
          [SPELL_STATIC_ZONE_META_KEY]: {
            role: "root",
            instanceId: "storm-a",
            casterId: "caster-a",
          },
        },
      },
    ],
    actorId: "caster-a",
    sceneEpoch: 4,
    turnKey: "1:0:caster-a",
  });

  assert.equal(payloads.length, 1);
  assert.equal(payloads[0].spellId, "xanathar-sfera-della-tempesta");
  assert.equal(payloads[0].actionId, STORM_SPHERE_TURN_PROMPT_ACTION_ID);
  assert.equal(payloads[0].instanceId, "storm-a");
  assert.equal(payloads[0].slotLevel, 4);
  assert.equal(payloads[0].zoneItemId, "storm-root");
});

test("la Linea di fuoco compare dal turno successivo al lancio e usa il popup dedicato", () => {
  const castTurn = "1:0:caster-a";
  const items = [
    item("caster-a", [flameInvestitureOwnerSpell("flame-a", "caster-a", castTurn)]),
  ];

  assert.deepEqual(callLightningTurnPromptPayloads({
    items,
    actorId: "caster-a",
    sceneEpoch: 5,
    turnKey: castTurn,
  }), []);

  const payloads = callLightningTurnPromptPayloads({
    items,
    actorId: "caster-a",
    sceneEpoch: 5,
    turnKey: "2:0:caster-a",
  });
  assert.equal(payloads.length, 1);
  assert.equal(payloads[0].spellId, "xanathar-investitura-della-fiamma");
  assert.equal(payloads[0].actionId, FLAME_INVESTITURE_TURN_PROMPT_ACTION_ID);
  assert.equal(payloads[0].slotLevel, 6);
  assert.equal(payloads[0].zoneItemId, undefined);
});

test("Riscaldare il Metallo usa il turn prompt standard dalla tornata successiva", () => {
  const castTurn = "1:0:caster-a";
  const target = item("target", [heatMetalOwnerSpell("heat-a", "caster-a", castTurn)]);
  const caster = item("caster-a", []);
  caster.metadata[META_KEY][CONC_META_KEY] = {
    "heat-a": {
      instanceId: "heat-a",
      spellId: "heat-metal",
      name: "Riscaldare il Metallo",
      targets: ["target"],
      appliedAt: { round: 1, actorId: "caster-a", turnKey: castTurn },
      castContext: { slotLevel: 2 },
    },
  };
  const items = [
    caster,
    target,
  ];

  assert.deepEqual(spellTurnPromptRequests({
    items,
    actorId: "caster-a",
    sceneEpoch: 5,
    turnKey: castTurn,
  }), []);

  const requests = spellTurnPromptRequests({
    items,
    actorId: "caster-a",
    sceneEpoch: 5,
    turnKey: "2:0:caster-a",
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].kind, "action");
  assert.equal(requests[0].payload.actionId, HEAT_METAL_TURN_PROMPT_ACTION_ID);
  assert.equal(requests[0].payload.action.resolutionKind, "single-save");
  assert.equal(requests[0].payload.action.economy, "bonus-action");
  assert.equal(requests[0].payload.action.save.ability, "con");
  assert.equal(requests[0].payload.action.requiredTargetEffectId, undefined);
  assert.equal(requests[0].payload.linkedTargetId, "target");
});

test("Arma Sacra apre al turno successivo il popup condiviso per l'esplosione", () => {
  const castTurn = "1:0:caster-a";
  const items = [item("caster-a", [{
    name: "Arma Sacra",
    spellId: "xanathar-arma-sacra",
    instanceId: "holy-weapon-a",
    casterId: "caster-a",
    appliedAt: { round: 1, actorId: "caster-a", turnKey: castTurn },
    conc: true,
    castContext: { slotLevel: 5 },
  }])];

  assert.deepEqual(spellTurnPromptRequests({
    items,
    actorId: "caster-a",
    sceneEpoch: 6,
    turnKey: castTurn,
  }), []);

  const requests = spellTurnPromptRequests({
    items,
    actorId: "caster-a",
    sceneEpoch: 6,
    turnKey: "2:0:caster-a",
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].kind, "action");
  assert.equal(requests[0].payload.spellId, "xanathar-arma-sacra");
  assert.equal(requests[0].payload.actionId, HOLY_WEAPON_TURN_PROMPT_ACTION_ID);
  assert.equal(requests[0].payload.slotLevel, 5);
  assert.equal(requests[0].payload.action.placementRuleId, "xanathar-arma-sacra:burst");
});

test("Controllare Venti apre un chooser condiviso per tutte le modalità al turno del caster", () => {
  const castTurn = "1:0:caster-a";
  const requests = spellTurnPromptRequests({
    items: [
      item("caster-a", [{
        name: "Controllare Venti",
        spellId: "xanathar-controllare-venti",
        instanceId: "winds-a",
        casterId: "caster-a",
        appliedAt: { round: 1, actorId: "caster-a", turnKey: castTurn },
        conc: true,
        castContext: {
          staticZoneOwner: true,
          staticZoneRuleId: "xanathar-controllare-venti:cast",
          slotLevel: 5,
        },
      }]),
      {
        id: "winds-root",
        metadata: {
          [SPELL_STATIC_ZONE_META_KEY]: {
            role: "root",
            instanceId: "winds-a",
            casterId: "caster-a",
          },
        },
      },
    ],
    actorId: "caster-a",
    sceneEpoch: 12,
    turnKey: "2:0:caster-a",
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].kind, "choice");
  assert.match(requests[0].choiceHint, /modalità/iu);
  assert.deepEqual(
    requests[0].actions.map((payload) => payload.actionId),
    [
      CONTROL_WINDS_GUSTS_TURN_PROMPT_ACTION_ID,
      CONTROL_WINDS_DOWNDRAFT_TURN_PROMPT_ACTION_ID,
      CONTROL_WINDS_UPDRAFT_TURN_PROMPT_ACTION_ID,
      CONTROL_WINDS_PAUSE_TURN_PROMPT_ACTION_ID,
    ],
  );
  assert.ok(requests[0].actions.every((payload) => (
    payload.executionKind === "active-action"
    && payload.action.economy === "action"
    && payload.zoneItemId === "winds-root"
  )));
});

function maximilianOwnerSpell(instanceId, casterId, turnKey) {
  return {
    name: "Stretta della Terra di Maximilian",
    spellId: "xanathar-stretta-della-terra-di-maximilian",
    instanceId,
    casterId,
    appliedAt: { round: 1, actorId: casterId, turnKey },
    conc: true,
    castContext: { boardToken: true, slotLevel: 2 },
  };
}

test("Maximilian apre dal turno successivo un solo chooser con Afferra e Stritola", () => {
  const castTurn = "1:0:caster-a";
  const items = [
    item("caster-a", [maximilianOwnerSpell("grasp-a", "caster-a", castTurn)]),
    {
      id: "max-hand",
      metadata: {
        [SPELL_BOARD_TOKEN_META_KEY]: {
          kind: "spell-board-token",
          spellId: "xanathar-stretta-della-terra-di-maximilian",
          instanceId: "grasp-a",
          casterId: "caster-a",
          slotLevel: 2,
          state: { revision: 0 },
        },
      },
    },
  ];

  assert.deepEqual(spellTurnPromptRequests({
    items, actorId: "caster-a", sceneEpoch: 9, turnKey: castTurn,
  }), []);

  const requests = spellTurnPromptRequests({
    items, actorId: "caster-a", sceneEpoch: 9, turnKey: "2:0:caster-a",
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].kind, "choice");
  assert.equal(requests[0].instanceId, "grasp-a");
  assert.equal(requests[0].zoneItemId, "max-hand");
  assert.deepEqual(
    requests[0].actions.map((payload) => payload.actionId),
    [MAXIMILIAN_GRAB_TURN_PROMPT_ACTION_ID, MAXIMILIAN_CRUSH_TURN_PROMPT_ACTION_ID],
  );
  assert.ok(requests[0].actions.every((payload) => payload.zoneItemId === "max-hand"));
});
