import test from "node:test";
import assert from "node:assert/strict";

import { getSpellDefinition } from "../src/spells-srd.js";
import {
  buildSpellActiveActionPlan,
  getSpellOverviewActions,
} from "../src/spellActiveActionCore.js";
import { buildEffectsMutationPlan } from "../src/effectsMutationCore.js";

function token(id, overrides = {}) {
  return {
    id,
    name: id,
    spells: [],
    concentrations: {},
    conditions: [],
    ...overrides,
  };
}

function state(plan, id) {
  return plan.states.find((entry) => entry.id === id);
}

test("Telecinesi espone un retarget manuale sempre disponibile dal pannello", () => {
  const spell = getSpellDefinition("telekinesis");
  const actions = getSpellOverviewActions({
    spell,
    casterId: "caster",
    targetIds: ["old-target"],
    appliedAt: { turnKey: "1:0:caster" },
    currentTurnKey: "1:1:other",
  });

  assert.equal(actions.length, 1);
  assert.equal(actions[0].id, "telekinesis-retarget");
  assert.equal(actions[0].buttonLabel, "Cambia bersaglio");
  assert.equal(actions[0].subjectMode, "selected");
  assert.equal(actions[0].maxTargets, 1);
  assert.deepEqual(actions[0].range, { value: 18, unit: "m" });
  assert.equal(actions[0].rangeOrigin, "caster");
  assert.deepEqual(actions[0].unavailableTargetIds, ["old-target"]);
  assert.equal(actions[0].turnStartPrompt, undefined);
});

test("Telecinesi prepara un retarget atomico della stessa istanza", () => {
  const spell = getSpellDefinition("telekinesis");
  const plan = buildSpellActiveActionPlan({
    spell,
    actionId: "telekinesis-retarget",
    group: {
      instanceId: "telekinesis-1",
      spellId: "telekinesis",
      casterId: "caster",
      casterName: "Mago",
      name: "Telecinesi",
      storedName: "Telecinesi",
      castContext: { slotLevel: 5 },
      appliedAt: { round: 3, actorId: "caster", turnKey: "3:0:caster" },
      targets: new Map([["old-target", "Vecchio"]]),
      turns: [87],
      effectInstances: [],
    },
    selectedTargetIds: ["new-target"],
    casterName: "Mago",
  });

  assert.equal(plan.valid, true);
  assert.deepEqual(plan.subjectIds, ["new-target"]);
  assert.deepEqual(plan.operations.map((operation) => operation.type), [
    "spell:upsert",
    "concentration:register",
    "concentration:break-targets",
  ]);

  const upsert = plan.operations[0];
  assert.deepEqual(upsert.targetIds, ["new-target"]);
  assert.equal(upsert.name, "Telecinesi");
  assert.equal(upsert.turns, 87);
  assert.equal(upsert.conc, true);
  assert.equal(upsert.source, "caster");
  assert.equal(upsert.instanceId, "telekinesis-1");
  assert.equal(upsert.spellId, "telekinesis");
  assert.deepEqual(upsert.castContext, { slotLevel: 5 });
  assert.deepEqual(upsert.appliedAt, { round: 3, actorId: "caster", turnKey: "3:0:caster" });

  assert.deepEqual(plan.operations[1], {
    type: "concentration:register",
    casterId: "caster",
    targetIds: ["new-target"],
    name: "Telecinesi",
    instanceId: "telekinesis-1",
    spellId: "telekinesis",
    appliedAt: { round: 3, actorId: "caster", turnKey: "3:0:caster" },
    castContext: { slotLevel: 5 },
  });
  assert.deepEqual(plan.operations[2], {
    type: "concentration:break-targets",
    casterId: "caster",
    targetIds: ["old-target"],
    reference: "telekinesis-1",
  });
});

test("il retarget Telecinesi sposta spell e concentrazione senza terminarle", () => {
  const spell = getSpellDefinition("telekinesis");
  const actionPlan = buildSpellActiveActionPlan({
    spell,
    actionId: "telekinesis-retarget",
    group: {
      instanceId: "telekinesis-1",
      spellId: "telekinesis",
      casterId: "caster",
      casterName: "Mago",
      name: "Telecinesi",
      storedName: "Telecinesi",
      castContext: { slotLevel: 5 },
      appliedAt: { round: 3, actorId: "caster", turnKey: "3:0:caster" },
      targets: new Map([["old-target", "Vecchio"]]),
      turns: [87],
      effectInstances: [],
    },
    selectedTargetIds: ["new-target"],
    casterName: "Mago",
  });

  const mutation = buildEffectsMutationPlan([
    token("caster", {
      concentrations: {
        telecinesi: {
          name: "Telecinesi",
          instanceId: "telekinesis-1",
          spellId: "telekinesis",
          targets: ["old-target"],
        },
      },
    }),
    token("old-target", {
      spells: [{
        id: "tele-old",
        name: "Telecinesi",
        turns: 87,
        conc: true,
        casterId: "caster",
        casterName: "Mago",
        instanceId: "telekinesis-1",
        spellId: "telekinesis",
        castContext: { slotLevel: 5 },
      }],
    }),
    token("new-target"),
  ], actionPlan.operations);

  assert.deepEqual(new Set(mutation.changedIds), new Set(["caster", "old-target", "new-target"]));
  assert.deepEqual(state(mutation, "old-target").spells, []);
  assert.equal(state(mutation, "new-target").spells.length, 1);
  assert.equal(state(mutation, "new-target").spells[0].instanceId, "telekinesis-1");
  assert.equal(state(mutation, "new-target").spells[0].turns, 87);
  assert.deepEqual(state(mutation, "caster").concentrations.telecinesi.targets, ["new-target"]);
  assert.equal(state(mutation, "caster").concentrations.telecinesi.instanceId, "telekinesis-1");
});
