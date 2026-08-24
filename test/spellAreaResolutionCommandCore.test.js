import test from "node:test";
import assert from "node:assert/strict";

import { buildSpellUnifiedPanelContract } from "../src/spellUnifiedPanelCore.js";
import {
  buildSpellAreaResolutionCommand,
  SPELL_AREA_RESOLUTION_ERROR_CODES,
} from "../src/spellAreaResolutionCommandCore.js";

const casterId = "caster-1";

function contract(spellId, phase = "cast", actionId = "") {
  return buildSpellUnifiedPanelContract({ spellId, phase, actionId });
}

function placement({
  spellId,
  ruleId,
  caster = casterId,
  targetIds = [],
  status = "confirmed",
  sceneEpoch,
  boardToken = false,
} = {}) {
  return {
    status,
    spellId,
    ruleId,
    casterId: caster,
    ...(sceneEpoch === undefined ? {} : { sceneEpoch }),
    preview: {
      ...(boardToken ? { position: { x: 10, y: 20 } } : {
        start: { x: 0, y: 0 },
        end: { x: 3, y: 0 },
        gridOrigin: { x: 0, y: 0 },
      }),
      targetIds,
    },
  };
}

function hasError(command, code) {
  assert.equal(command.errors.includes(code), true, `${code} missing`);
}

function fireballInput(overrides = {}) {
  return {
    contract: contract("fireball"),
    casterId,
    slotLevel: 3,
    placement: placement({
      spellId: "fireball",
      ruleId: "fireball:cast",
      targetIds: ["target-a", "target-b"],
    }),
    outcomes: { "target-a": "failed", "target-b": "passed" },
    hpAmount: 20,
    ...overrides,
  };
}

test("Palla di fuoco valida con placement ed esiti completi", () => {
  const command = buildSpellAreaResolutionCommand(fireballInput());

  assert.equal(command.valid, true);
  assert.equal(command.source.kind, "cast");
  assert.deepEqual(command.targeting.targetIds, ["target-a", "target-b"]);
  assert.equal(command.placement.status, "confirmed");
  assert.equal(command.placement.ruleId, "fireball:cast");
  assert.equal(command.hp.mode, "damage");
  assert.equal(command.hp.amount, 20);
  assert.equal(command.hp.outcomeFactors["target-a"], "full");
  assert.equal(command.hp.outcomeFactors["target-b"], "half");
  assert.equal(command.execution.lane, "area-transaction");
  assert.equal(command.execution.requiresCompositeUndo, true);
});

test("Palla di fuoco invalida senza placement", () => {
  const command = buildSpellAreaResolutionCommand(fireballInput({ placement: null }));

  assert.equal(command.valid, false);
  hasError(command, SPELL_AREA_RESOLUTION_ERROR_CODES.PLACEMENT_REQUIRED);
});

test("Palla di fuoco invalida con esiti mancanti", () => {
  const command = buildSpellAreaResolutionCommand(
    fireballInput({ outcomes: { "target-a": "failed" } }),
  );

  assert.equal(command.valid, false);
  hasError(command, "outcomes-incomplete");
});

test("il placement appartenente a un'altra spell viene rifiutato", () => {
  const command = buildSpellAreaResolutionCommand(fireballInput({
    placement: placement({
      spellId: "fog-cloud",
      ruleId: "fog-cloud:cast",
      targetIds: ["target-a", "target-b"],
    }),
  }));

  assert.equal(command.valid, false);
  hasError(command, SPELL_AREA_RESOLUTION_ERROR_CODES.PLACEMENT_RULE_MISMATCH);
  hasError(command, SPELL_AREA_RESOLUTION_ERROR_CODES.PLACEMENT_SPELL_MISMATCH);
});

test("il placement con caster incompatibile viene rifiutato", () => {
  const command = buildSpellAreaResolutionCommand(fireballInput({
    placement: placement({ spellId: "fireball", ruleId: "fireball:cast", caster: "other-caster" }),
  }));

  assert.equal(command.valid, false);
  hasError(command, SPELL_AREA_RESOLUTION_ERROR_CODES.PLACEMENT_CASTER_MISMATCH);
});

test("Anatema usa targeting discreto e delega la risoluzione TS", () => {
  const command = buildSpellAreaResolutionCommand({
    contract: contract("bane"),
    casterId,
    slotLevel: 1,
    targetIds: ["target-a", "target-b"],
    outcomes: { "target-a": "failed", "target-b": "passed" },
  });

  assert.equal(command.valid, true);
  assert.equal(command.targeting.mode, "discrete");
  assert.deepEqual(command.resolution.targeting.targetIds, ["target-a", "target-b"]);
});

test("Anatema invalida esiti incompleti", () => {
  const command = buildSpellAreaResolutionCommand({
    contract: contract("bane"),
    casterId,
    slotLevel: 1,
    targetIds: ["target-a", "target-b"],
    outcomes: { "target-a": "failed" },
  });

  assert.equal(command.valid, false);
  hasError(command, "outcomes-incomplete");
});

test("Catena di fulmini richiede il primario", () => {
  const command = buildSpellAreaResolutionCommand({
    contract: contract("chain-lightning"),
    casterId,
    slotLevel: 6,
    targetIds: ["target-a", "target-b"],
    outcomes: { "target-a": "failed", "target-b": "passed" },
    primaryDistanceMeters: 20,
    secondaryDistancesMeters: { "target-a": 5, "target-b": 5 },
    hpAmount: 20,
  });

  assert.equal(command.valid, false);
  hasError(command, "primary-required");
});

test("Catena di fulmini rifiuta un primario non selezionato", () => {
  const command = buildSpellAreaResolutionCommand({
    contract: contract("chain-lightning"),
    casterId,
    slotLevel: 6,
    primaryTargetId: "primary",
    targetIds: ["secondary"],
    outcomes: { secondary: "failed" },
    primaryDistanceMeters: 20,
    secondaryDistancesMeters: { secondary: 5 },
    hpAmount: 20,
  });

  assert.equal(command.valid, false);
  hasError(command, "primary-not-selected");
});

test("Catena di fulmini rifiuta troppi secondari", () => {
  const targetIds = ["primary", "a", "b", "c", "d"];
  const command = buildSpellAreaResolutionCommand({
    contract: contract("chain-lightning"),
    casterId,
    slotLevel: 6,
    primaryTargetId: "primary",
    targetIds,
    outcomes: Object.fromEntries(targetIds.map((id) => [id, "failed"])),
    primaryDistanceMeters: 20,
    secondaryDistancesMeters: { a: 5, b: 5, c: 5, d: 5 },
    hpAmount: 20,
  });

  assert.equal(command.valid, false);
  hasError(command, "secondary-limit-exceeded");
});

test("Catena di fulmini rifiuta una distanza non valida", () => {
  const command = buildSpellAreaResolutionCommand({
    contract: contract("chain-lightning"),
    casterId,
    slotLevel: 6,
    primaryTargetId: "primary",
    targetIds: ["primary", "secondary"],
    outcomes: { primary: "failed", secondary: "passed" },
    primaryDistanceMeters: 50,
    secondaryDistancesMeters: { secondary: 5 },
    hpAmount: 20,
  });

  assert.equal(command.valid, false);
  hasError(command, "primary-out-of-range");
});

test("Catena di fulmini valida con slot superiore e snapshot spaziale", () => {
  const targetIds = ["primary", "a", "b", "c", "d"];
  const command = buildSpellAreaResolutionCommand({
    contract: contract("chain-lightning"),
    casterId,
    slotLevel: 7,
    primaryTargetId: "primary",
    targetIds,
    outcomes: Object.fromEntries(targetIds.map((id) => [id, "failed"])),
    primaryDistanceMeters: 20,
    secondaryDistancesMeters: { a: 5, b: 5, c: 5, d: 5 },
    hpAmount: 20,
  });

  assert.equal(command.valid, true);
  assert.equal(command.targeting.spatialValidation.maximumSecondaryTargets, 4);
  assert.equal(command.targeting.primaryTargetId, "primary");
});

test("Cura ferite di massa produce HP in modalità heal", () => {
  const command = buildSpellAreaResolutionCommand({
    contract: contract("mass-cure-wounds"),
    casterId,
    slotLevel: 5,
    placement: placement({
      spellId: "mass-cure-wounds",
      ruleId: "mass-cure-wounds:cast",
      targetIds: ["ally-a", "ally-b"],
    }),
    hpAmount: 12,
  });

  assert.equal(command.valid, true);
  assert.equal(command.hp.mode, "heal");
  assert.equal(command.hp.amount, 12);
  assert.deepEqual(command.targeting.targetIds, ["ally-a", "ally-b"]);
});

test("una zona senza TS iniziale può essere dichiarata senza bersagli", () => {
  const command = buildSpellAreaResolutionCommand({
    contract: contract("fog-cloud"),
    casterId,
    slotLevel: 1,
  });

  assert.equal(command.valid, true);
  assert.deepEqual(command.targeting.targetIds, []);
  assert.equal(command.execution.hasZones, true);
});

test("Muro di Fuoco può creare la zona senza bersagli iniziali", () => {
  const contractValue = buildSpellUnifiedPanelContract({
    spellId: "wall-of-fire",
    choiceValue: "line-hot-left",
  });
  const command = buildSpellAreaResolutionCommand({
    contract: contractValue,
    casterId,
    slotLevel: 4,
    choiceValue: "line-hot-left",
    placement: placement({
      spellId: "wall-of-fire",
      ruleId: "wall-of-fire:cast",
      targetIds: [],
    }),
  });

  assert.equal(command.valid, true);
  assert.deepEqual(command.targeting.targetIds, []);
  assert.equal(command.hp.required, false);
  assert.equal(command.hp.amount, null);
  assert.equal(command.execution.hasZones, true);
});

test("Muro di Fuoco conserva TS e danno iniziali quando la sagoma contiene bersagli", () => {
  const contractValue = buildSpellUnifiedPanelContract({
    spellId: "wall-of-fire",
    choiceValue: "line-hot-left",
  });
  const command = buildSpellAreaResolutionCommand({
    contract: contractValue,
    casterId,
    slotLevel: 4,
    choiceValue: "line-hot-left",
    placement: placement({
      spellId: "wall-of-fire",
      ruleId: "wall-of-fire:cast",
      targetIds: ["target-a"],
    }),
    outcomes: { "target-a": "failed" },
    hpAmount: 20,
  });

  assert.equal(command.valid, true);
  assert.deepEqual(command.targeting.targetIds, ["target-a"]);
  assert.equal(command.hp.required, true);
  assert.equal(command.hp.amount, 20);
});

test("Sfera della Tempesta senza placement confermato è invalida", () => {
  const command = buildSpellAreaResolutionCommand({
    contract: contract("xanathar-sfera-della-tempesta"),
    casterId,
    slotLevel: 4,
    targetIds: ["target-a"],
    outcomes: { "target-a": "failed" },
    hpAmount: 10,
  });

  assert.equal(command.valid, false);
  hasError(command, "placement-required");
});

test("Sfera della Tempesta conserva placement confermato", () => {
  const command = buildSpellAreaResolutionCommand({
    contract: contract("xanathar-sfera-della-tempesta"),
    casterId,
    slotLevel: 4,
    placement: placement({
      spellId: "xanathar-sfera-della-tempesta",
      ruleId: "xanathar-sfera-della-tempesta:cast",
      targetIds: ["target-a"],
    }),
    outcomes: { "target-a": "failed" },
    hpAmount: 10,
  });

  assert.equal(command.valid, true);
  assert.equal(command.placement.policy, "required");
  assert.deepEqual(command.targeting.targetIds, ["target-a"]);
});

test("Investitura della Fiamma usa placement automatico", () => {
  const command = buildSpellAreaResolutionCommand({
    contract: contract("xanathar-investitura-della-fiamma"),
    casterId,
    slotLevel: 6,
    hpAmount: 10,
  });

  assert.equal(command.valid, true);
  assert.equal(command.placement.policy, "automatic");
  assert.equal(command.placement.status, "automatic");
  assert.equal(command.placement.ruleId, "xanathar-investitura-della-fiamma:aura");
});

test("Mano arcana richiede e conserva il placement board-token", () => {
  const command = buildSpellAreaResolutionCommand({
    contract: contract("arcane-hand"),
    casterId,
    slotLevel: 5,
    placement: placement({
      spellId: "arcane-hand",
      ruleId: "arcane-hand:board-token",
      targetIds: [],
      boardToken: true,
    }),
  });

  assert.equal(command.valid, true);
  assert.equal(command.placement.policy, "required");
  assert.equal(command.placement.preview.position.x, 10);
  assert.equal(command.execution.hasTokens, true);
  assert.equal(command.execution.requiresCompositeUndo, true);
});

test("Mano arcana senza placement è invalida", () => {
  const command = buildSpellAreaResolutionCommand({
    contract: contract("arcane-hand"),
    casterId,
    slotLevel: 5,
  });

  assert.equal(command.valid, false);
  hasError(command, "placement-required");
});

test("Raffica di Spine in prepare viene rifiutata dalla lane area", () => {
  const command = buildSpellAreaResolutionCommand({
    contract: contract("phb2014-raffica-di-spine", "prepare"),
    casterId,
    slotLevel: 2,
  });

  assert.equal(command.valid, false);
  hasError(command, "lane-incompatible");
});

test("Raffica di Spine in resolve usa il placement area", () => {
  const command = buildSpellAreaResolutionCommand({
    contract: contract("phb2014-raffica-di-spine", "resolve"),
    casterId,
    parentInstanceId: "prepared-1",
    slotLevel: 2,
    placement: placement({
      spellId: "phb2014-raffica-di-spine",
      ruleId: "phb2014-raffica-di-spine:cast",
      targetIds: ["target-a"],
    }),
    outcomes: { "target-a": "failed" },
    hpAmount: 12,
  });

  assert.equal(command.valid, true);
  assert.equal(command.source.kind, "prepared-resolution");
  assert.deepEqual(command.targeting.targetIds, ["target-a"]);
});

test("Raffica di Spine lega l'area al primary target e il miss lascia pending", () => {
  const base = {
    contract: contract("phb2014-raffica-di-spine", "resolve"),
    spellId: "phb2014-raffica-di-spine",
    phase: "resolve",
    source: { kind: "prepared-resolution", parentInstanceId: "prepared-hail" },
    casterId,
    slotLevel: 2,
    primaryTargetId: "target-a",
    placement: placement({
      spellId: "phb2014-raffica-di-spine",
      ruleId: "phb2014-raffica-di-spine:cast",
      targetIds: ["target-a", "target-b"],
    }),
  };
  const hit = buildSpellAreaResolutionCommand({
    ...base,
    attackOutcome: "hit",
    outcomes: { "target-a": "failed", "target-b": "passed" },
    hpAmount: 12,
  });
  assert.equal(hit.valid, true, hit.errors?.join(", "));
  assert.equal(hit.targeting.primaryTargetId, "target-a");
  assert.equal(hit.outcomes.attack, "hit");
  assert.equal(hit.hp.amount, 12);

  const miss = buildSpellAreaResolutionCommand({
    ...base,
    placement: placement({
      spellId: "phb2014-raffica-di-spine",
      ruleId: "phb2014-raffica-di-spine:cast",
      targetIds: ["target-a"],
    }),
    attackOutcome: "miss",
  });
  assert.equal(miss.valid, true, miss.errors?.join(", "));
  assert.equal(miss.targeting.primaryTargetId, "target-a");
  assert.equal(miss.hp.mode, "none");
});

test("Freccia Folgorante separa primary damage, area e fattore miss", () => {
  const command = buildSpellAreaResolutionCommand({
    contract: contract("phb2014-freccia-folgorante", "resolve"),
    spellId: "phb2014-freccia-folgorante",
    phase: "resolve",
    source: { kind: "prepared-resolution", parentInstanceId: "prepared-lightning" },
    casterId,
    slotLevel: 3,
    primaryTargetId: "target-a",
    primaryDamageAmount: 16,
    attackOutcome: "miss",
    targetIds: ["target-a", "target-b"],
    outcomes: { "target-a": "failed", "target-b": "passed" },
    placement: placement({
      spellId: "phb2014-freccia-folgorante",
      ruleId: "phb2014-freccia-folgorante:cast",
      targetIds: ["target-a", "target-b"],
    }),
    hpAmount: 8,
  });

  assert.equal(command.valid, true, command.errors?.join(", "));
  assert.equal(command.targeting.primaryTargetId, "target-a");
  assert.equal(command.outcomes.attack, "miss");
  assert.equal(command.hp.primaryAmount, 16);
  assert.equal(command.hp.primaryOutcomeFactor, "half");
  assert.equal(command.hp.amount, 8);
  assert.equal(command.hp.outcomeFactors["target-a"], "full");
  assert.equal(command.hp.outcomeFactors["target-b"], "half");
});

test("zone trigger valido è precompilato ma non consumato", () => {
  const command = buildSpellAreaResolutionCommand({
    contract: contract("xanathar-sfera-della-tempesta"),
    source: { kind: "zone-trigger", sceneEpoch: 7, activationId: "activation-1" },
    sceneEpoch: 7,
    activationId: "activation-1",
    expectedZoneInstanceId: "zone-instance-1",
    casterId,
    slotLevel: 4,
    zoneTrigger: {
      activationId: "activation-1",
      instanceId: "zone-instance-1",
      spellId: "xanathar-sfera-della-tempesta",
      casterId,
      targetIds: ["target-a"],
      targetLocked: true,
      sceneEpoch: 7,
      ruleId: "xanathar-sfera-della-tempesta:cast",
      resolution: "manual-save",
      damage: { dice: "2d6", type: "contundenti" },
    },
    outcomes: { "target-a": "failed" },
    hpAmount: 8,
  });

  assert.equal(command.valid, true);
  assert.equal(command.source.kind, "zone-trigger");
  assert.equal(command.source.activationId, "activation-1");
  assert.equal(command.execution.zoneTrigger.instanceId, "zone-instance-1");
  assert.deepEqual(command.targeting.targetIds, ["target-a"]);
});

test("zone trigger senza activation ID è invalido", () => {
  const command = buildSpellAreaResolutionCommand({
    contract: contract("xanathar-sfera-della-tempesta"),
    source: { kind: "zone-trigger", sceneEpoch: 7 },
    sceneEpoch: 7,
    expectedZoneInstanceId: "zone-instance-1",
    casterId,
    slotLevel: 4,
    zoneTrigger: {
      instanceId: "zone-instance-1",
      spellId: "xanathar-sfera-della-tempesta",
      casterId,
      targetIds: ["target-a"],
      targetLocked: true,
      sceneEpoch: 7,
      ruleId: "xanathar-sfera-della-tempesta:cast",
      resolution: "manual-save",
    },
    outcomes: { "target-a": "failed" },
    hpAmount: 8,
  });

  assert.equal(command.valid, false);
  hasError(command, "zone-trigger-activation-required");
});

test("zone trigger con scene epoch incompatibile è invalido", () => {
  const command = buildSpellAreaResolutionCommand({
    contract: contract("xanathar-sfera-della-tempesta"),
    source: { kind: "zone-trigger", sceneEpoch: 8, activationId: "activation-1" },
    sceneEpoch: 8,
    expectedZoneInstanceId: "zone-instance-1",
    casterId,
    slotLevel: 4,
    zoneTrigger: {
      activationId: "activation-1",
      instanceId: "zone-instance-1",
      spellId: "xanathar-sfera-della-tempesta",
      casterId,
      targetIds: ["target-a"],
      targetLocked: true,
      sceneEpoch: 7,
      ruleId: "xanathar-sfera-della-tempesta:cast",
      resolution: "manual-save",
    },
    outcomes: { "target-a": "failed" },
    hpAmount: 8,
  });

  assert.equal(command.valid, false);
  hasError(command, "scene-epoch-mismatch");
});

test("target context richiesto ma assente", () => {
  const command = buildSpellAreaResolutionCommand({
    contract: contract("banishment"),
    casterId,
    slotLevel: 4,
    targetIds: ["target-a"],
    outcomes: { "target-a": "failed" },
    casterDistancesMeters: { "target-a": 10 },
  });

  assert.equal(command.valid, false);
  hasError(command, "target-context-required");
});

test("choice obbligatoria assente", () => {
  const command = buildSpellAreaResolutionCommand({
    contract: contract("xanathar-anatema-elementale"),
    casterId,
    slotLevel: 4,
    targetIds: ["target-a"],
    outcomes: { "target-a": "failed" },
  });

  assert.equal(command.valid, false);
  hasError(command, "choice-required");
});

test("input HP invalido", () => {
  const command = buildSpellAreaResolutionCommand(fireballInput({ hpAmount: -1 }));

  assert.equal(command.valid, false);
  hasError(command, "hp-invalid");
});

test("il comando è serializzabile senza Map o Set", () => {
  const command = buildSpellAreaResolutionCommand(fireballInput());
  const json = JSON.stringify(command);
  const parsed = JSON.parse(json);

  assert.equal(parsed.type, "spell-area-resolution");
  assert.deepEqual(parsed.targeting.targetContexts, {});
  assert.equal(json.includes("Map"), false);
  assert.equal(json.includes("Set"), false);
});

test("il comando è immutabile e non muta gli input", () => {
  const targetIds = ["target-a", "target-b"];
  const outcomes = { "target-a": "failed", "target-b": "passed" };
  const input = fireballInput({ targetIds, outcomes });
  const command = buildSpellAreaResolutionCommand(input);

  targetIds.push("target-c");
  outcomes["target-a"] = "immune";

  assert.deepEqual(command.targeting.targetIds, ["target-a", "target-b"]);
  assert.equal(command.outcomes.byTarget["target-a"], "failed");
  assert.equal(Object.isFrozen(command), true);
  assert.equal(Object.isFrozen(command.targeting), true);
  assert.equal(Object.isFrozen(command.execution), true);
});

test("i codici errore sono stabili e privi di messaggi UI", () => {
  const input = fireballInput({ placement: null, outcomes: {} });
  const first = buildSpellAreaResolutionCommand(input);
  const second = buildSpellAreaResolutionCommand(input);

  assert.deepEqual(first.errors, second.errors);
  assert.equal(first.errors.every((error) => /^[a-z0-9-]+$/.test(error)), true);
  assert.equal(first.errors.some((error) => error.includes(" ")), false);
  assert.equal(first.valid, false);
});
