import test from "node:test";
import assert from "node:assert/strict";

import {
  catalogSpellApplicationOperations,
  spellLifecycleOperations,
} from "../src/spellLifecycleOperationsCore.js";

test("replace, extend e dismiss condividono lo stesso lifecycle", () => {
  const base = {
    targetIds: ["target"],
    casterId: "caster",
    name: "Ragnatela",
    turns: 10,
    concentration: true,
    instanceId: "web",
    spellId: "web",
    spellExpiry: { mode: "concentration" },
    castContext: { slotLevel: 3 },
  };

  assert.deepEqual(
    spellLifecycleOperations(base).map((operation) => operation.type),
    ["concentration:break", "spell:upsert", "concentration:register"],
  );
  assert.deepEqual(
    spellLifecycleOperations(base).find((operation) => operation.type === "spell:upsert").castContext,
    { slotLevel: 3 },
  );
  assert.deepEqual(
    spellLifecycleOperations({
      ...base,
      concentrationAction: "extend",
    }).map((operation) => operation.type),
    ["spell:upsert", "concentration:register"],
  );
  assert.deepEqual(
    spellLifecycleOperations({
      ...base,
      concentrationAction: "dismiss",
    }).map((operation) => operation.type),
    ["concentration:break"],
  );
});

test("dismiss non crea mai una pill spell anche se conserva bersagli ed effetti indipendenti", () => {
  const operations = spellLifecycleOperations({
    targetIds: ["target"],
    casterId: "caster",
    name: "Arma Sacra",
    concentration: true,
    instanceId: "burst",
    concentrationAction: "dismiss",
    conditionApplications: [{
      targetIds: ["target"],
      conditionName: "Accecato",
      options: {
        parentEffectId: "",
        expiry: { mode: "rounds", remaining: 10 },
      },
    }],
  });

  assert.deepEqual(operations.map((operation) => operation.type), [
    "concentration:break",
    "condition:add",
    "condition:automate",
  ]);
  assert.equal(operations.some((operation) => operation.type === "spell:upsert"), false);
});

test("il cast di catalogo materializza condizioni ed effetti nello stesso builder", () => {
  const operations = catalogSpellApplicationOperations({
    targetIds: ["target"],
    casterId: "caster",
    name: "Benedizione",
    turns: 10,
    concentration: true,
    instanceId: "bless",
    proposedConditions: ["Affascinato"],
    proposedEffects: [{
      id: "attack-save-bonus",
      kind: "buff",
      label: "+1d4 Att/TS",
    }],
    conditionOptions: {
      sourceId: "caster",
      expiry: { mode: "concentration" },
    },
  });

  assert.deepEqual(operations.map((operation) => operation.type), [
    "concentration:break",
    "spell:upsert",
    "condition:add",
    "condition:add",
    "concentration:register",
    "condition:automate",
  ]);
});
