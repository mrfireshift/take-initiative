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
});
