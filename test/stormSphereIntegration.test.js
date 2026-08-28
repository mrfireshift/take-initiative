import test, { mock } from "node:test";
import assert from "node:assert/strict";

import { ID } from "../src/constants.js";
import { getSpellAreaRuleById } from "../src/spellAreaRules.js";
import {
  areaMembershipEffects,
  areaMembershipPlan,
  areaMembershipTargetIds,
  staleAreaMembershipEffectRemovals,
} from "../src/spellAreaMembershipCore.js";
import {
  buildArea,
} from "../src/aoeGeometryCore.js";
import {
  buildSpellAreaResolutionCommand,
} from "../src/spellAreaResolutionCommandCore.js";
import {
  buildSpellUnifiedPanelContract,
} from "../src/spellUnifiedPanelCore.js";
import {
  resolveMovementProfile,
} from "../src/movementProfileCore.js";
import {
  movementCostForSegment,
} from "../src/speedCheckCore.js";
import {
  CALL_LIGHTNING_TURN_PROMPT_ACTION_ID,
  callLightningTurnPromptPayloads,
  STORM_SPHERE_TURN_PROMPT_ACTION_ID,
} from "../src/callLightningTurnPromptCore.js";
import {
  SPELL_STATIC_ZONE_META_KEY,
} from "../src/spellStaticZoneCore.js";
import {
  buildZoneTriggerReminderResolution,
  reminderResolutionDamage,
} from "../src/reminderResolutionCore.js";
import {
  spellActiveResolutionDamageFormula,
  getSpellResolutionAction,
} from "../src/spellActiveResolutionCore.js";
import { spellSaveDamageFormula } from "../src/spellCastResolutionRules.js";

const META_KEY = `${ID}/meta`;
const SPELLS_KEY = `${ID}/spells`;

function createToken(id, {
  name = id,
  hp = 30,
  hpMax = 30,
  attitude = "enemy",
  conditions = [],
  spells = [],
  concentration = {},
  position = { x: 0, y: 0 },
} = {}) {
  return {
    id,
    name,
    position,
    layer: "CHARACTER",
    metadata: {
      [META_KEY]: {
        hp,
        hpMax,
        attitude,
        conditions: { version: 2, instances: conditions },
        [SPELLS_KEY]: spells,
        concentration,
      },
    },
  };
}

// ---------------------------------------------------------------------
// PIPELINE A: SAVE RESOLUTION (INITIAL CAST & END-OF-TURN)
// ---------------------------------------------------------------------

test("PIPELINE A1 — Initial cast: TS fallito infligge danno pieno contundente", () => {
  const contract = buildSpellUnifiedPanelContract({
    spellId: "xanathar-sfera-della-tempesta",
  });
  const command = buildSpellAreaResolutionCommand({
    contract,
    spellId: "xanathar-sfera-della-tempesta",
    casterId: "caster-1",
    targetIds: ["target-1"],
    outcomes: { "target-1": "failed" },
    hpAmount: 10,
    placement: {
      status: "confirmed",
      targetIds: ["target-1"],
      preview: {
        type: "circle",
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 },
        dpi: 150,
      },
    },
  });

  assert.equal(command.valid, true, JSON.stringify(command.errors));
  assert.equal(command.hp.outcomeFactors["target-1"], "full");
});

test("PIPELINE A2 — Initial cast: TS superato infligge 0 danni (NON meta danno)", () => {
  const contract = buildSpellUnifiedPanelContract({
    spellId: "xanathar-sfera-della-tempesta",
  });
  const command = buildSpellAreaResolutionCommand({
    contract,
    spellId: "xanathar-sfera-della-tempesta",
    casterId: "caster-1",
    targetIds: ["target-1"],
    outcomes: { "target-1": "passed" },
    hpAmount: 10,
    placement: {
      status: "confirmed",
      targetIds: ["target-1"],
      preview: {
        type: "circle",
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 },
        dpi: 150,
      },
    },
  });

  assert.equal(command.valid, true, JSON.stringify(command.errors));
  // In the pre-patch build, outcomeFactors["target-1"] is erroneously "half".
  // Expected: "zero"
  assert.equal(command.hp.outcomeFactors["target-1"], "zero");
});

test("PIPELINE A3 — End-turn: TS fallito infligge danno pieno", () => {
  const rule = getSpellAreaRuleById("xanathar-sfera-della-tempesta:cast");
  const endTurnTrigger = rule.zonePolicy.triggers.find((t) => t.id === "storm-sphere-save-on-turn-end");
  assert.ok(endTurnTrigger);

  const resolution = buildZoneTriggerReminderResolution({
    activation: endTurnTrigger,
    targetId: "target-1",
    sourceId: "caster-1",
  });
  assert.ok(resolution);

  const damage = reminderResolutionDamage(resolution, "failed", 8);
  assert.equal(damage.factor, "full");
  assert.equal(damage.amount, 8);
});

test("PIPELINE A4 — End-turn: TS superato infligge 0 danni", () => {
  const rule = getSpellAreaRuleById("xanathar-sfera-della-tempesta:cast");
  const endTurnTrigger = rule.zonePolicy.triggers.find((t) => t.id === "storm-sphere-save-on-turn-end");
  assert.ok(endTurnTrigger);

  const resolution = buildZoneTriggerReminderResolution({
    activation: endTurnTrigger,
    targetId: "target-1",
    sourceId: "caster-1",
  });
  assert.ok(resolution);

  const damage = reminderResolutionDamage(resolution, "passed", 8);
  assert.equal(damage.factor, "zero");
  assert.equal(damage.amount, 0);
});

test("PIPELINE A5 — Sfera della Tempesta scala cast, fine turno e fulmine bonus", () => {
  const endTurnTrigger = getSpellAreaRuleById("xanathar-sfera-della-tempesta:cast")
    .zonePolicy.triggers
    .find((trigger) => trigger.id === "storm-sphere-save-on-turn-end");
  const activeAction = getSpellResolutionAction(
    "xanathar-sfera-della-tempesta",
    STORM_SPHERE_TURN_PROMPT_ACTION_ID,
  );
  const expected = new Map([
    [4, ["2d6", "4d6"]],
    [5, ["3d6", "5d6"]],
    [9, ["7d6", "9d6"]],
  ]);

  for (const [slotLevel, [areaFormula, lightningFormula]] of expected) {
    assert.equal(
      spellSaveDamageFormula("xanathar-sfera-della-tempesta", "failed", slotLevel),
      areaFormula,
    );
    assert.equal(
      spellSaveDamageFormula("xanathar-sfera-della-tempesta", "passed", slotLevel),
      areaFormula,
    );

    const endTurnResolution = buildZoneTriggerReminderResolution({
      activation: endTurnTrigger,
      targetId: "target-1",
      sourceId: "caster-1",
      slotLevel,
    });
    assert.equal(endTurnResolution.damage.dice, areaFormula);

    const lightningDamage = spellActiveResolutionDamageFormula({
      action: activeAction,
      slotLevel,
    });
    assert.equal(lightningDamage.scaledFormula, lightningFormula);
  }
});

// ---------------------------------------------------------------------
// PIPELINE P: MANDATORY PLACEMENT CONTRACT
// ---------------------------------------------------------------------

test("PIPELINE P1 — Sfera della Tempesta non puo completare un cast valido senza placement confermato", () => {
  const contract = buildSpellUnifiedPanelContract({
    spellId: "xanathar-sfera-della-tempesta",
  });
  // The placement policy for Storm Sphere MUST be required (mandatory)
  assert.equal(contract.presentation.placement.policy, "required");
  assert.equal(contract.presentation.placement.required, true);

  // Cast without placement must be invalid
  const commandWithoutPlacement = buildSpellAreaResolutionCommand({
    contract,
    casterId: "caster-1",
    slotLevel: 4,
    targetIds: ["target-1"],
    outcomes: { "target-1": "failed" },
    hpAmount: 10,
  });

  assert.equal(commandWithoutPlacement.valid, false);
  assert.ok(commandWithoutPlacement.errors.includes("placement-required"));
});

test("PIPELINE P2 — Cancel placement non lascia concentrazione, spell instance o zone owner", () => {
  const contract = buildSpellUnifiedPanelContract({
    spellId: "xanathar-sfera-della-tempesta",
  });

  const commandCancelled = buildSpellAreaResolutionCommand({
    contract,
    casterId: "caster-1",
    slotLevel: 4,
    placement: { status: "pending" },
    targetIds: ["target-1"],
    outcomes: { "target-1": "failed" },
    hpAmount: 10,
  });

  assert.equal(commandCancelled.valid, false);
  assert.ok(commandCancelled.errors.includes("placement-pending"));
});

// ---------------------------------------------------------------------
// PIPELINE B: STATIC ZONE → MOVEMENT TRACKER END-TO-END
// ---------------------------------------------------------------------

test("PIPELINE B — Terreno difficile della Sfera della Tempesta end-to-end (inside, exit, spell-end)", () => {
  const rule = getSpellAreaRuleById("xanathar-sfera-della-tempesta:cast");
  assert.ok(rule);
  assert.equal(rule.kind, "zone");

  const effects = areaMembershipEffects(rule);
  assert.equal(effects.length, 1);
  assert.equal(effects[0].id, "storm-sphere-difficult-terrain");
  assert.equal(effects[0].mechanics.movement.costMultiplier, 2);
  assert.equal(effects[0].mechanics.movement.category, "difficult-terrain");

  // TEST 5: Token fuori dalla sfera
  const outsideToken = createToken("token-outside", { position: { x: 500, y: 500 } });
  const sphereArea = buildArea("circle", { x: 100, y: 100 }, { x: 200, y: 100 }, 150);
  const candidates = [
    { item: outsideToken, bounds: { min: { x: 500, y: 500 }, max: { x: 600, y: 600 } } },
  ];

  const outsideTargetIds = areaMembershipTargetIds({
    sourceId: "caster-1",
    rule,
    area: sphereArea,
    candidates,
    metaKey: META_KEY,
  });
  assert.deepEqual(outsideTargetIds, []);

  // Profilo movimento del token fuori: costo moltiplicatore = 1
  const outsideProfile = resolveMovementProfile(9, outsideToken.metadata[META_KEY].conditions.instances);
  assert.equal(outsideProfile.movementCostMultiplier, 1);
  const outsideCost = movementCostForSegment({
    movedCells: 3,
    beforePosition: { x: 500, y: 500 },
    afterPosition: { x: 500, y: 800 },
    baseMultiplier: outsideProfile.movementCostMultiplier,
  });
  assert.equal(outsideCost.chargedCells, 3);

  // TEST 6: Token entra/è dentro la sfera
  const insideToken = createToken("token-inside", { position: { x: 100, y: 100 } });
  const insideCandidates = [
    { item: insideToken, bounds: { min: { x: 90, y: 90 }, max: { x: 110, y: 110 } } },
  ];

  const insideTargetIds = areaMembershipTargetIds({
    sourceId: "caster-1",
    rule,
    area: sphereArea,
    candidates: insideCandidates,
    metaKey: META_KEY,
  });
  assert.deepEqual(insideTargetIds, ["token-inside"]);

  const enterPlan = areaMembershipPlan({
    instanceId: "storm-instance-1",
    sourceId: "caster-1",
    rule,
    desiredTargetIds: insideTargetIds,
    items: [insideToken],
    metaKey: META_KEY,
    sourceName: "Mago",
  });

  assert.equal(enterPlan.operations.length, 1);
  const addOp = enterPlan.operations[0];
  assert.equal(addOp.type, "condition:add");
  assert.deepEqual(addOp.targetIds, ["token-inside"]);
  assert.equal(addOp.conditionName, "Terreno difficile / Sfera della Tempesta");
  assert.equal(addOp.options.mechanics.movement.costMultiplier, 2);

  // Simula applicazione dell'operazione al token metadata (reconciled)
  const modifiedInsideToken = createToken("token-inside", {
    position: { x: 100, y: 100 },
    conditions: [{
      id: "cond-storm-1",
      condition: addOp.conditionName,
      name: addOp.conditionName,
      parentEffectId: "storm-instance-1",
      effectId: "storm-sphere-difficult-terrain",
      effectKind: "debuff",
      sourceId: "caster-1",
      active: true,
      mechanics: addOp.options.mechanics,
    }],
  });

  // Verifica Movement Tracker sul token dentro la sfera: 3 cells mosse -> 6 charged!
  const insideProfile = resolveMovementProfile(9, modifiedInsideToken.metadata[META_KEY].conditions.instances);
  assert.equal(insideProfile.movementCostMultiplier, 2);
  const insideCost = movementCostForSegment({
    movedCells: 3,
    beforePosition: { x: 100, y: 100 },
    afterPosition: { x: 100, y: 400 },
    baseMultiplier: insideProfile.movementCostMultiplier,
  });
  assert.equal(insideCost.chargedCells, 6);

  // TEST 7: Token esce dalla sfera
  const exitPlan = areaMembershipPlan({
    instanceId: "storm-instance-1",
    sourceId: "caster-1",
    rule,
    desiredTargetIds: [],
    items: [modifiedInsideToken],
    metaKey: META_KEY,
  });

  assert.equal(exitPlan.leaving.length, 1);
  assert.equal(exitPlan.leaving[0], "token-inside");
  assert.equal(exitPlan.operations.length, 1);
  assert.equal(exitPlan.operations[0].type, "condition:remove-instances");
  assert.deepEqual(exitPlan.operations[0].removals, [{
    itemId: "token-inside",
    instanceId: "cond-storm-1",
  }]);

  // Dopo la rimozione della condizione, torna normale: 3 cells mosse -> 3 charged
  const exitedToken = createToken("token-inside", { position: { x: 500, y: 500 }, conditions: [] });
  const exitedProfile = resolveMovementProfile(9, exitedToken.metadata[META_KEY].conditions.instances);
  assert.equal(exitedProfile.movementCostMultiplier, 1);
  const exitedCost = movementCostForSegment({
    movedCells: 3,
    beforePosition: { x: 500, y: 500 },
    afterPosition: { x: 500, y: 800 },
    baseMultiplier: exitedProfile.movementCostMultiplier,
  });
  assert.equal(exitedCost.chargedCells, 3);

  // TEST 8: Termina la spell -> cleanup stale condition
  const staleRemovals = staleAreaMembershipEffectRemovals([modifiedInsideToken], {
    activeInstanceIds: [],
    effectIds: ["storm-sphere-difficult-terrain"],
    metaKey: META_KEY,
  });
  assert.deepEqual(staleRemovals, [{ itemId: "token-inside", instanceId: "cond-storm-1" }]);
});

// ---------------------------------------------------------------------
// PIPELINE C: CASTER TURN → MAP POPOVER END-TO-END
// ---------------------------------------------------------------------

test("PIPELINE C — Popover azione bonus Sfera della Tempesta sul turno del caster end-to-end", () => {
  const casterId = "caster-1";
  const instanceId = "storm-instance-1";

  const casterToken = createToken(casterId, {
    attitude: "pc",
    spells: [{
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
    }],
    concentration: {
      [instanceId]: {
        instanceId,
        spellId: "xanathar-sfera-della-tempesta",
        name: "Sfera della Tempesta",
      },
    },
  });

  const zoneRootItem = {
    id: "zone-root-item-1",
    name: "Sfera della Tempesta",
    metadata: {
      [SPELL_STATIC_ZONE_META_KEY]: {
        role: "root",
        instanceId,
        casterId,
        spellId: "xanathar-sfera-della-tempesta",
      },
    },
  };

  const sceneItems = [casterToken, zoneRootItem];

  // Turno di un altro token -> Nessun prompt per Sfera della Tempesta
  const otherTurnPayloads = callLightningTurnPromptPayloads({
    items: sceneItems,
    actorId: "other-enemy",
    sceneEpoch: 1,
    turnKey: "1:0:other-enemy",
  });
  assert.equal(otherTurnPayloads.length, 0);

  // Inizia il turno del caster -> Prompt disponibile
  const casterTurnPayloads = callLightningTurnPromptPayloads({
    items: sceneItems,
    actorId: casterId,
    sceneEpoch: 1,
    turnKey: "1:1:caster-1",
  });
  assert.equal(casterTurnPayloads.length, 1);
  const payload = casterTurnPayloads[0];
  assert.equal(payload.spellId, "xanathar-sfera-della-tempesta");
  assert.equal(payload.actionId, STORM_SPHERE_TURN_PROMPT_ACTION_ID);
  assert.equal(payload.instanceId, instanceId);
  assert.equal(payload.casterId, casterId);
  assert.equal(payload.zoneItemId, "zone-root-item-1");
  assert.equal(payload.slotLevel, 4);
  assert.equal(payload.action.economy, "bonus-action");
  assert.equal(payload.action.resolutionKind, "single-attack");
  assert.equal(payload.action.damage.formula, "4d6");
  assert.equal(payload.action.damage.type, "fulmine");

  // Stesso turno / render ripetuto -> Esattamente 1 istanza (nessun duplicato)
  const repeatPayloads = callLightningTurnPromptPayloads({
    items: sceneItems,
    actorId: casterId,
    sceneEpoch: 1,
    turnKey: "1:1:caster-1",
  });
  assert.equal(repeatPayloads.length, 1);

  // Avanza ad altro turno -> Nessun prompt
  const nextTurnPayloads = callLightningTurnPromptPayloads({
    items: sceneItems,
    actorId: "target-2",
    sceneEpoch: 1,
    turnKey: "1:2:target-2",
  });
  assert.equal(nextTurnPayloads.length, 0);

  // Nuovo turno caster (round successivo) -> Prompt nuovamente disponibile
  const round2CasterPayloads = callLightningTurnPromptPayloads({
    items: sceneItems,
    actorId: casterId,
    sceneEpoch: 1,
    turnKey: "2:1:caster-1",
  });
  assert.equal(round2CasterPayloads.length, 1);
  assert.equal(round2CasterPayloads[0].instanceId, instanceId);

  // Concentrazione termina -> Nessun prompt
  const casterNoConc = createToken(casterId, {
    attitude: "pc",
    spells: [],
    concentration: {},
  });
  const noConcPayloads = callLightningTurnPromptPayloads({
    items: [casterNoConc, zoneRootItem],
    actorId: casterId,
    sceneEpoch: 1,
    turnKey: "2:1:caster-1",
  });
  assert.equal(noConcPayloads.length, 0);
});
