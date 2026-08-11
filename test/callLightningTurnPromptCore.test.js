import assert from "node:assert/strict";
import test from "node:test";

import { ID } from "../src/constants.js";
import {
  CALL_LIGHTNING_TURN_PROMPT_ACTION_ID,
  callLightningTurnPromptPayloads,
  FLAME_INVESTITURE_TURN_PROMPT_ACTION_ID,
  STORM_SPHERE_TURN_PROMPT_ACTION_ID,
} from "../src/callLightningTurnPromptCore.js";
import { SPELL_STATIC_ZONE_META_KEY } from "../src/spellStaticZoneCore.js";

const META_KEY = `${ID}/meta`;
const SPELLS_KEY = `${ID}/spells`;

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
