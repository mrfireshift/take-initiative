import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSpellActiveActionPlan,
  getSpellOverviewActions,
  spellActiveActionPresentation,
} from "../src/spellActiveActionCore.js";
import { getSpellDefinition } from "../src/spells-srd.js";

function group(overrides = {}) {
  return {
    instanceId: "cast-1",
    casterId: "caster",
    name: "Incantesimo",
    effectInstances: [],
    ...overrides,
  };
}

test("la stessa API espone risoluzioni preparate e attivazioni manuali", () => {
  const prepared = getSpellDefinition("Punizione Collerica");
  const preparedActions = getSpellOverviewActions({
    spell: prepared,
    castContext: { phase: "prepare" },
    casterId: "caster",
    targetIds: ["caster"],
  });
  assert.deepEqual(preparedActions.map((action) => action.type), ["resolve"]);

  const zephyr = getSpellDefinition("Colpo dello Zefiro");
  const zephyrActions = getSpellOverviewActions({
    spell: zephyr,
    casterId: "caster",
    targetIds: ["caster"],
    effectInstances: [{
      itemId: "caster",
      instanceId: "zephyr-ready",
      effectId: "zephyr-strike",
    }],
  });
  assert.deepEqual(zephyrActions.map((action) => action.type), ["manual"]);
  assert.equal(zephyrActions[0].id, "zephyr-strike-attack");

  assert.deepEqual(getSpellOverviewActions({
    spell: zephyr,
    casterId: "caster",
    targetIds: ["caster"],
    effectInstances: [],
  }), []);
});

test("le attivazioni offensive usano il popup dedicato e Sfera richiede la radice", () => {
  const callLightning = getSpellDefinition("Invocare il fulmine");
  const callLightningActions = getSpellOverviewActions({
    spell: callLightning,
    casterId: "caster",
    targetIds: [],
  });
  assert.deepEqual(callLightningActions.map((action) => action.id), [
    "call-lightning-strike",
  ]);
  assert.equal(callLightningActions[0].buttonLabel, "Invoca fulmine");
  assert.equal(callLightningActions[0].turnStartPrompt, true);

  const flame = getSpellDefinition("Investitura della Fiamma");
  const flameSameTurn = getSpellOverviewActions({
    spell: flame,
    casterId: "caster",
    targetIds: [],
    appliedAt: { turnKey: "1:0:caster" },
    currentTurnKey: "1:0:caster",
  });
  assert.equal(flameSameTurn.length, 1);
  assert.equal(flameSameTurn[0].id, "flame-investiture-line");
  assert.equal(flameSameTurn[0].buttonLabel, "Linea di fuoco");
  assert.equal(flameSameTurn[0].unavailableReason, "Disponibile dal turno successivo al lancio.");
  const flameNextTurn = getSpellOverviewActions({
    spell: flame,
    casterId: "caster",
    targetIds: [],
    appliedAt: { turnKey: "1:0:caster" },
    currentTurnKey: "2:0:caster",
  });
  assert.equal(flameNextTurn.length, 1);
  assert.equal(flameNextTurn[0].id, "flame-investiture-line");
  assert.equal(flameNextTurn[0].unavailableReason, undefined);
  const storm = getSpellDefinition("Sfera della Tempesta");
  const manualStorm = {
    ...storm,
    activeActions: storm.activeActions.map((action) => ({
      ...action,
      turnStartPrompt: false,
    })),
  };
  assert.deepEqual(getSpellOverviewActions({
    spell: manualStorm,
    casterId: "caster",
  }), []);
  assert.equal(getSpellOverviewActions({
    spell: manualStorm,
    casterId: "caster",
    zoneItemId: "storm-root",
  })[0].resolutionKind, "single-attack");
  assert.deepEqual(getSpellOverviewActions({
    spell: storm,
    casterId: "caster",
    zoneItemId: "storm-root",
  }), []);
});

test("Colpo dello Zefiro consuma la carica e applica +9 m al caster", () => {
  const spell = getSpellDefinition("Colpo dello Zefiro");
  const plan = buildSpellActiveActionPlan({
    spell,
    actionId: "zephyr-strike-attack",
    group: group({
      name: spell.displayName,
      effectInstances: [{
        itemId: "caster",
        instanceId: "zephyr-ready",
        effectId: "zephyr-strike",
      }],
    }),
    appliedAt: { round: 2, actorId: "caster", turnKey: "2:0:caster" },
    casterName: "Ranger",
  });

  assert.equal(plan.valid, true);
  assert.deepEqual(plan.operations[0], {
    type: "condition:remove-instances",
    removals: [{ itemId: "caster", instanceId: "zephyr-ready" }],
  });
  assert.equal(plan.operations[1].type, "condition:add");
  assert.deepEqual(plan.operations[1].targetIds, ["caster"]);
  assert.equal(plan.operations[1].options.parentEffectId, "cast-1");
  assert.deepEqual(plan.operations[1].options.expiry, {
    mode: "turn-end",
    actor: "source",
    remaining: 1,
  });
  assert.deepEqual(plan.operations[1].options.mechanics.movement, {
    addMeters: 9,
    appliesTo: ["walk"],
    label: "Colpo dello Zefiro (+9 m)",
  });
  assert.match(plan.historyLabel, /Attivazione: Colpo dello Zefiro · Usa colpo/);
});

test("Investitura del Ghiaccio richiede i falliti selezionati e prepara il dimezzamento", () => {
  const spell = getSpellDefinition("Investitura del Ghiaccio");
  const missing = buildSpellActiveActionPlan({
    spell,
    actionId: "ice-investiture-cone",
    group: group({ name: spell.displayName }),
  });
  assert.equal(missing.valid, false);
  assert.ok(missing.errors.includes("targets-required"));

  const plan = buildSpellActiveActionPlan({
    spell,
    actionId: "ice-investiture-cone",
    group: group({ name: spell.displayName }),
    selectedTargetIds: ["target-a", "target-b", "target-a"],
    appliedAt: { round: 3, actorId: "caster", turnKey: "3:0:caster" },
    casterName: "Druido",
  });
  assert.equal(plan.valid, true);
  assert.deepEqual(plan.operations[0].targetIds, ["target-a", "target-b"]);
  assert.equal(plan.operations[0].options.mechanics.movement.multiplier, 0.5);
  assert.deepEqual(plan.operations[0].options.expiry, {
    mode: "turn-start",
    actor: "source",
    remaining: 1,
    anchor: "next-turn",
  });
});

test("Riscaldare il Metallo applica il debuff temporaneo al solo portatore selezionato", () => {
  const spell = getSpellDefinition("heat-metal");
  const overviewActions = getSpellOverviewActions({
    spell,
    casterId: "caster",
  });
  assert.equal(overviewActions.filter((action) => action.id === "heat-metal-repeat").length, 1);
  assert.equal(overviewActions[0].resolutionKind, "single-attack");
  assert.equal(overviewActions[0].effects[0].label, "Svant. attacchi e prove");
  const plan = buildSpellActiveActionPlan({
    spell,
    actionId: "heat-metal-repeat",
    group: group({ name: spell.displayName }),
    selectedTargetIds: ["target"],
    appliedAt: { round: 4, actorId: "caster", turnKey: "4:0:caster" },
    casterName: "Bardo",
  });

  assert.equal(plan.valid, true);
  assert.equal(plan.operations[0].conditionName, "Svant. attacchi e prove");
  assert.deepEqual(plan.operations[0].targetIds, ["target"]);
  assert.equal(plan.operations[0].options.parentEffectId, "cast-1");
  assert.deepEqual(plan.operations[0].options.expiry, {
    mode: "turn-start",
    actor: "source",
    remaining: 1,
    anchor: "next-turn",
  });
});

test("Sguardo Penetrante delega TS superato e le tre varianti al resolver single-save dedicato", () => {
  const spell = getSpellDefinition("eyebite");
  assert.deepEqual(
    getSpellOverviewActions({
      spell,
      casterId: "caster",
      targetIds: ["caster"],
      zoneItemId: "",
    }).map((action) => action.id),
    [
      "eyebite-saved",
      "eyebite-asleep",
      "eyebite-panicked",
      "eyebite-sickened",
    ],
  );

  const plan = buildSpellActiveActionPlan({
    spell,
    actionId: "eyebite-sickened",
    group: group({ name: spell.displayName }),
    selectedTargetIds: ["target"],
    casterName: "Necromante",
  });
  assert.equal(plan.valid, true);
  assert.equal(plan.delegatedResolution, true);
  assert.equal(plan.resolutionKind, "single-save");
  assert.deepEqual(plan.operations, []);
  assert.equal(plan.action.maxTargets, 1);
  assert.equal(plan.action.manualSaveAtTable, true);
  assert.equal(plan.action.failureEffects[0].label, "Nauseato");
  assert.equal(plan.action.failureEffects[0].saveReminder.ability, "wis");
  assert.equal(plan.action.failureEffects[0].saveReminder.timing, "turn-end");
});

test("la presentazione distingue azioni sul caster e azioni sui falliti", () => {
  assert.deepEqual(spellActiveActionPresentation({
    subjectMode: "caster",
    buttonLabel: "Usa colpo",
  }, 0), {
    disabled: false,
    text: "Usa colpo",
    title: "Usa colpo",
  });
  assert.deepEqual(spellActiveActionPresentation({
    subjectMode: "selected",
    buttonLabel: "Cono gelido",
    countLabelSingular: "fallito",
    countLabelPlural: "falliti",
    emptySelectionTitle: "Seleziona i falliti.",
  }, 2), {
    disabled: false,
    text: "Cono gelido · 2 falliti",
    title: "Cono gelido",
  });
  assert.deepEqual(spellActiveActionPresentation({
    subjectMode: "selected",
    buttonLabel: "Applica Nausea",
    maxTargets: 1,
    tooManySelectionTitle: "Seleziona un solo bersaglio.",
  }, 2), {
    disabled: true,
    text: "Applica Nausea · 2 bersagli",
    title: "Seleziona un solo bersaglio.",
  });
  assert.deepEqual(spellActiveActionPresentation({
    subjectMode: "selected",
    buttonLabel: "Fallito: Panico",
    unavailableTargetIds: ["old-target"],
    unavailableSelectionTitle: "Creatura già bersagliata.",
  }, ["old-target"]), {
    disabled: true,
    text: "Fallito: Panico · 1 bersaglio",
    title: "Creatura già bersagliata.",
  });
});

test("le zone mobili non espongono piÃ¹ un'azione di spostamento", () => {
  const spell = getSpellDefinition("xanathar-diavoletto-di-polvere");
  const actions = getSpellOverviewActions({
    spell,
    casterId: "caster",
    zoneItem: {
      id: "zone-1",
    },
    zoneRule: {
      zonePolicy: {
        movement: {
          mode: "bonus-action",
          economy: "bonus-action",
          maximumMeters: 9,
        },
      },
    },
  });
  assert.deepEqual(actions, []);
});

test("Controllare Venti prepara il cambio di modalità della zona senza inventare effetti sui token", () => {
  const spell = getSpellDefinition("xanathar-controllare-venti");
  const plan = buildSpellActiveActionPlan({
    spell,
    actionId: "control-winds-downdraft",
    group: {
      casterId: "caster",
      instanceId: "winds-1",
      name: "Controllare Venti",
      effectInstances: [],
    },
  });

  assert.equal(plan.valid, true);
  assert.equal(plan.zoneRuleChoice, "downdraft");
  assert.deepEqual(plan.operations, []);
  assert.deepEqual(plan.subjectIds, ["caster"]);
});

test("Controllare Acqua espone le quattro modalita come cambi della stessa zona", () => {
  const spell = getSpellDefinition("control-water");
  assert.deepEqual(
    getSpellOverviewActions({
      spell,
      casterId: "caster",
      targetIds: ["caster"],
      zoneItemId: "water-root",
    }).map((action) => action.id),
    [
      "control-water-whirlpool",
      "control-water-flood",
      "control-water-redirect",
      "control-water-part",
    ],
  );
  const plan = buildSpellActiveActionPlan({
    spell,
    actionId: "control-water-flood",
    group: group({
      name: spell.displayName,
      instanceId: "water-1",
    }),
  });
  assert.equal(plan.valid, true);
  assert.equal(plan.zoneRuleChoice, "flood");
  assert.deepEqual(plan.operations, []);
});

test("Collera della Natura applica manualmente Trattenuto e Prono dopo i tiri al tavolo", () => {
  const spell = getSpellDefinition("xanathar-collera-della-natura");
  const vines = buildSpellActiveActionPlan({
    spell,
    actionId: "wrath-of-nature-vines-failed",
    group: group({
      name: spell.displayName,
      instanceId: "wrath-1",
    }),
    selectedTargetIds: ["target"],
    casterName: "Druido",
  });
  assert.equal(vines.valid, true);
  assert.equal(vines.operations[0].conditionName, "Trattenuto");
  assert.equal(vines.operations[0].options.parentEffectId, "wrath-1");
  assert.equal(vines.operations[0].options.parentRemoval, "target");
  assert.deepEqual(
    vines.operations.map((operation) => operation.type),
    ["condition:add", "condition:automate", "concentration:register"],
  );

  const rocks = buildSpellActiveActionPlan({
    spell,
    actionId: "wrath-of-nature-rocks-failed",
    group: group({
      name: spell.displayName,
      instanceId: "wrath-1",
    }),
    selectedTargetIds: ["target"],
  });
  assert.equal(rocks.valid, true);
  assert.equal(rocks.operations[0].conditionName, "Prono");
  assert.equal(rocks.operations[0].options.parentEffectId, "");
});
