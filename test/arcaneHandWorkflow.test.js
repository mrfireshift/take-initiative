// Mano arcana (Bigby, PHB 2014): the hand's five effects in the spell's popup, from the turn after the cast.
import test from "node:test";
import assert from "node:assert/strict";

import { ID } from "../src/constants.js";
import { getSpellDefinition } from "../src/spells-srd.js";
import {
  buildSpellActiveResolutionFailureOperations,
  buildSpellActiveResolutionLinkedEffectRemovals,
  resolveSpellActiveResolutionDamage,
  spellActiveResolutionDamageFormula,
  validateSpellActiveResolutionAction,
} from "../src/spellActiveResolutionCore.js";
import {
  buildSpellUnifiedActivePopoverRequest,
  buildSpellUnifiedActiveResolutionPayload,
} from "../src/spellUnifiedActiveAdapter.js";
import {
  ARCANE_HAND_TURN_PROMPT_ACTION_IDS,
  spellTurnPromptRequests,
} from "../src/callLightningTurnPromptCore.js";
import { SPELL_BOARD_TOKEN_META_KEY } from "../src/spellBoardTokenCore.js";

const SPELL_ID = "arcane-hand";
const META_KEY = `${ID}/meta`;
const SPELLS_KEY = `${ID}/spells`;

const action = (id) => getSpellDefinition(SPELL_ID).activeActions.find((entry) => entry.id === id);
const payload = (entry) => ({
  spellId: SPELL_ID,
  spellName: "Mano arcana",
  instanceId: "hand-cast-1",
  casterId: "caster",
  casterName: "Mago",
  action: entry,
});

test("le cinque azioni della mano sono valide, azioni bonus nel popup di turno", () => {
  for (const id of ARCANE_HAND_TURN_PROMPT_ACTION_IDS) {
    const entry = action(id);
    assert.ok(entry, id);
    assert.deepEqual(validateSpellActiveResolutionAction(entry).errors || [], [], id);
    assert.equal(entry.economy, "bonus-action", id);
    assert.equal(entry.turnStartPrompt, true, id);
    assert.equal(entry.availableAfterCast, true, id);
  }
  // A Large hand: its 1,5 m reach is measured from its edge (adjacentRing), not from its centre.
  for (const id of ["arcane-hand-clenched", "arcane-hand-grasping", "arcane-hand-forceful"]) {
    assert.equal(action(id).rangeOrigin, "root", id);
    assert.equal(action(id).range.value, 1.5, id);
    assert.equal(action(id).requiresZoneRoot, true, id);
    assert.equal(action(id).adjacentRing, true, id);
  }
  // No saving throw: the popup names the hand's check, or nothing.
  assert.equal(action("arcane-hand-grasping").checkLabel, "Presa · For 26");
  assert.equal(action("arcane-hand-forceful").checkLabel, "Contesa · For 26");
  assert.equal(action("arcane-hand-crush").checkLabel, "");
  assert.equal(action("arcane-hand-interposing").checkLabel, "");
});

test("Pugno serrato: attacco 4d8 forza, +2d8 per slot sopra il 5°", () => {
  const fist = action("arcane-hand-clenched");
  assert.equal(fist.resolutionKind, "single-attack");
  assert.equal(spellActiveResolutionDamageFormula({ action: fist, slotLevel: 5, outcome: "hit" }).scaledFormula, "4d8");
  assert.equal(spellActiveResolutionDamageFormula({ action: fist, slotLevel: 7, outcome: "hit" }).scaledFormula, "8d8");
});

test("Mano stritolatrice: Afferrato collegato alla mano, che sposta la presa senza toccare le altre istanze", () => {
  const grasp = action("arcane-hand-grasping");
  assert.equal(grasp.manualSaveAtTable, true);
  assert.equal(grasp.assumedOutcome, "failed");
  assert.equal(grasp.damage, undefined);
  const operations = buildSpellActiveResolutionFailureOperations({
    action: grasp,
    payload: payload(grasp),
    targetIds: ["ogre"],
    outcomes: { ogre: "failed" },
  });
  assert.equal(operations[0].type, "condition:add");
  assert.equal(operations[0].conditionName, "Afferrato");
  assert.equal(operations[0].options.parentEffectId, "hand-cast-1");
  assert.equal(operations[0].options.effectId, "arcane-hand-grasped");
  assert.deepEqual(operations[0].options.expiry, { mode: "concentration" });

  const removals = buildSpellActiveResolutionLinkedEffectRemovals({
    action: grasp,
    payload: payload(grasp),
    items: [
      { id: "old-target", metadata: { [META_KEY]: { conditions: { version: 2, instances: [
        { id: "old-grasp", parentEffectId: "hand-cast-1", effectId: "arcane-hand-grasped" },
        { id: "interposed", parentEffectId: "hand-cast-1", effectId: "arcane-hand-interposed" },
      ] } } } },
      { id: "other-hand-target", metadata: { [META_KEY]: { conditions: { version: 2, instances: [
        { id: "other-grasp", parentEffectId: "hand-cast-2", effectId: "arcane-hand-grasped" },
      ] } } } },
    ],
  });
  assert.deepEqual(removals, [{ itemId: "old-target", instanceId: "old-grasp" }]);
});

test("Stritola: 2d6 + mod pieni sulla creatura afferrata, +2d6 per slot sopra il 5°", () => {
  const crush = action("arcane-hand-crush");
  assert.equal(crush.requiredTargetEffectId, "arcane-hand-grasped");
  assert.equal(crush.linkedTargetHint, "Afferrato");
  assert.equal(spellActiveResolutionDamageFormula({ action: crush, slotLevel: 6, outcome: "passed" }).scaledFormula, "4d6");
  assert.equal(resolveSpellActiveResolutionDamage({ action: crush, slotLevel: 5, outcome: "passed", roll: 11 }).amount, 11);
});

test("Mano possente registra la contesa senza condizioni; Mano interposta segna il bersaglio", () => {
  const forceful = action("arcane-hand-forceful");
  assert.deepEqual(buildSpellActiveResolutionFailureOperations({
    action: forceful, payload: payload(forceful), targetIds: ["ogre"], outcomes: { ogre: "failed" },
  }), []);

  const interposing = action("arcane-hand-interposing");
  const [add] = buildSpellActiveResolutionFailureOperations({
    action: interposing, payload: payload(interposing), targetIds: ["ogre"], outcomes: { ogre: "failed" },
  });
  assert.equal(add.conditionName, "Mano interposta");
  assert.equal(add.options.effectKind, "debuff");
  assert.equal(add.options.effectId, "arcane-hand-interposed");
  assert.equal(interposing.replaceLinkedEffectId, "arcane-hand-interposed");
});

test("dal turno dopo il lancio il caster riceve un solo popup con i cinque effetti della mano", () => {
  const castTurn = "1:0:caster";
  const items = [
    { id: "caster", name: "Mago", metadata: { [META_KEY]: { [SPELLS_KEY]: [{
      name: "Mano arcana", spellId: SPELL_ID, instanceId: "hand-cast-1", casterId: "caster",
      appliedAt: { round: 1, actorId: "caster", turnKey: castTurn }, conc: true,
      castContext: { boardToken: true, slotLevel: 5 },
    }] } } },
    { id: "hand-token", metadata: { [SPELL_BOARD_TOKEN_META_KEY]: {
      kind: "spell-board-token", spellId: SPELL_ID, instanceId: "hand-cast-1", casterId: "caster",
      slotLevel: 5, state: { revision: 0 },
    } } },
  ];
  assert.deepEqual(spellTurnPromptRequests({ items, actorId: "caster", sceneEpoch: 4, turnKey: castTurn }), []);
  // "Azioni della Mano" from the token's menu asks without a turn: the popup is there even on the cast turn.
  const [fromMenu] = spellTurnPromptRequests({ items, actorId: "caster", sceneEpoch: 4, turnKey: "" });
  assert.equal(fromMenu?.kind, "choice");
  assert.equal(fromMenu.instanceId, "hand-cast-1");
  assert.equal(fromMenu.zoneItemId, "hand-token");
  const [request, ...rest] = spellTurnPromptRequests({ items, actorId: "caster", sceneEpoch: 4, turnKey: "2:0:caster" });
  assert.equal(rest.length, 0);
  assert.equal(request.kind, "choice");
  assert.equal(request.zoneItemId, "hand-token");
  assert.deepEqual(request.actions.map((entry) => entry.actionId), [...ARCANE_HAND_TURN_PROMPT_ACTION_IDS]);
  assert.ok(request.actions.every((entry) => entry.zoneItemId === "hand-token"));
});

test("il pannello incantesimi apre lo stesso popup attivo misurando dalla mano", () => {
  const fist = action("arcane-hand-clenched");
  const built = buildSpellUnifiedActiveResolutionPayload({
    overview: {
      instanceId: "hand-cast-1",
      actions: [fist],
      context: {
        spellId: SPELL_ID, instanceId: "hand-cast-1", casterId: "caster", casterName: "Mago",
        name: "Mano arcana", storedName: "Mano arcana", castContext: { slotLevel: 5 },
        targetIds: ["caster"], targetNames: ["Mago"], zoneItemId: "hand-token", sceneEpoch: 3, revision: 2,
      },
    },
    action: fist,
    actionId: fist.id,
    sceneEpoch: 3,
    revision: 2,
  });
  assert.equal(built.status, "payload-ready");
  assert.equal(built.payload.zoneItemId, "hand-token");
  assert.equal(built.payload.action.resolutionKind, "single-attack");
  assert.match(buildSpellUnifiedActivePopoverRequest(built.payload).url, /spell-active-resolution\.html\?payload=/);
});

test("la Mano arcana con PF è un bersaglio delle console, mai un attore", async () => {
  const { bossActionTargets, bossSelectionTarget } = await import("../src/bossActionsViewCore.js");
  const { isBossActionCreature, isBossActionTargetItem } = await import("../src/bossActionExecutionCore.js");
  const hand = {
    id: "hand-token", name: "Mano arcana (Mago)", type: "IMAGE", layer: "PROP",
    metadata: {
      [META_KEY]: { hp: 45, hpMax: 45, attitude: "pc" },
      [SPELL_BOARD_TOKEN_META_KEY]: { kind: "spell-board-token", spellId: SPELL_ID, instanceId: "hand-cast-1", casterId: "caster" },
    },
  };
  const ogre = { id: "ogre", name: "Ogre", type: "IMAGE", layer: "CHARACTER", metadata: { [META_KEY]: { hp: 59, hpMax: 59, inInitiative: true } } };
  const bareToken = { ...hand, id: "no-hp", metadata: { [SPELL_BOARD_TOKEN_META_KEY]: hand.metadata[SPELL_BOARD_TOKEN_META_KEY] } };
  assert.deepEqual(bossActionTargets([ogre, hand, bareToken], "boss").map((item) => item.id), ["hand-token", "ogre"]);
  assert.equal(bossSelectionTarget([hand], "boss").status, "single");
  assert.equal(isBossActionTargetItem(hand), true);
  assert.equal(isBossActionCreature(hand), false, "the hand never acts as a creature");
  assert.equal(isBossActionTargetItem(bareToken), false, "a token without HP is no target");
});
