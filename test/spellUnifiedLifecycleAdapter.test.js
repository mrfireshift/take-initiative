import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSpellUnifiedLifecycleRequest,
  executeSpellUnifiedLifecycle,
  getSpellUnifiedLifecycleEligibility,
  SPELL_UNIFIED_LIFECYCLE_STATUS,
} from "../src/spellUnifiedLifecycleAdapter.js";
import {
  buildSpellUnifiedPanelContract,
  createSpellPanelSession,
} from "../src/spellUnifiedPanelCore.js";

function contract(spellId, options = {}) {
  return buildSpellUnifiedPanelContract({ spellId, ...options });
}

async function capture(contractValue, session, runtime = {}) {
  let request = null;
  const result = await executeSpellUnifiedLifecycle({
    contract: contractValue,
    session,
    runtime: {
      ...runtime,
      executor: async (nextRequest) => {
        request = nextRequest;
        return ["caster-a", ...(nextRequest.targetIds || [])];
      },
    },
  });
  return { result, request };
}

test("adatta un lancio diretto su bersagli discreti", async () => {
  const current = contract("aid");
  const session = createSpellPanelSession({
    contract: current,
    targetIds: ["target-a", "target-b"],
  });
  const { result, request } = await capture(current, session);

  assert.equal(result.status, SPELL_UNIFIED_LIFECYCLE_STATUS.COMMITTED);
  assert.deepEqual(request.targetIds, ["target-a", "target-b"]);
  assert.equal(request.phasePlan.phase, "cast");
  assert.equal(request.requestedConcentration, false);
});

test("propaga la voce di cronologia del lifecycle per rendere Undo disponibile", async () => {
  const current = contract("aid");
  const session = createSpellPanelSession({
    contract: current,
    casterId: "caster-a",
    targetIds: ["target-a"],
  });
  const execution = ["caster-a", "target-a"];
  Object.defineProperties(execution, {
    historyEntryId: { value: "effects-history:cast-1" },
    undoAvailable: { value: true },
  });

  const result = await executeSpellUnifiedLifecycle({
    contract: current,
    session,
    runtime: { executor: async () => execution },
  });

  assert.equal(result.status, SPELL_UNIFIED_LIFECYCLE_STATUS.COMMITTED);
  assert.deepEqual(result.changedIds, ["caster-a", "target-a"]);
  assert.equal(result.historyEntryId, "effects-history:cast-1");
  assert.equal(result.undoAvailable, true);
});

test("risolve un lancio self sul caster senza una seconda selezione", () => {
  const current = contract("alter-self");
  const session = createSpellPanelSession({
    contract: current,
    casterId: "caster-a",
  });
  const request = buildSpellUnifiedLifecycleRequest({
    contract: current,
    session,
  });

  assert.deepEqual(request.targetIds, ["caster-a"]);
  assert.equal(request.casterId, "caster-a");
  assert.equal(request.selectedChoice, "aquatic-adaptation");
});

test("trasferisce concentrazione, variante e automazioni al lifecycle", () => {
  const current = contract("bless");
  const session = createSpellPanelSession({
    contract: current,
    casterId: "caster-a",
    targetIds: ["target-a"],
    applyAutomatedConditions: false,
  });
  const request = buildSpellUnifiedLifecycleRequest({
    contract: current,
    session,
    activeConcentration: null,
  });

  assert.equal(request.requestedConcentration, true);
  assert.equal(request.applyAutomatedConditions, false);
  assert.equal(request.castContext.phase, "cast");
  assert.equal(request.castContext.slotLevel, 1);
});

test("mantiene la stessa instance ID durante una risoluzione extend", () => {
  const current = contract("phb2014-punizione-collerica", { phase: "resolve" });
  const session = createSpellPanelSession({
    contract: current,
    casterId: "caster-a",
    targetIds: ["target-a"],
  });
  const request = buildSpellUnifiedLifecycleRequest({
    contract: current,
    session,
    activeConcentration: {
      instanceId: "prepared:wrathful:1",
      spellId: "phb2014-punizione-collerica",
      targets: ["caster-a"],
    },
  });

  assert.equal(request.phasePlan.phase, "resolve");
  assert.equal(request.activeConcentration.instanceId, "prepared:wrathful:1");
  assert.equal(request.targetIds[0], "target-a");
});

test("supporta una spell manuale senza inventare metadata", () => {
  const manualSpell = {
    id: "custom-manual-spell",
    name: "Effetto manuale",
    displayName: "Effetto manuale",
    level: 0,
    duration: "",
    concentration: false,
    targetMode: "selected",
    effects: [],
    effectChoices: [],
  };
  const current = buildSpellUnifiedPanelContract({ spell: manualSpell });
  const session = createSpellPanelSession({
    contract: current,
    enteredName: "Effetto manuale",
    durationTurns: 3,
    targetIds: ["target-a"],
  });
  const request = buildSpellUnifiedLifecycleRequest({
    contract: current,
    session,
    spell: manualSpell,
  });

  assert.equal(request.turns, 3);
  assert.equal(request.spell.id, "custom-manual-spell");
  assert.equal(request.targetIds[0], "target-a");
});

test("rifiuta area, HP, zone, pedine e active-resolution", async () => {
  const cases = [
    "fireball",
    "bane",
    "chain-lightning",
    "arcane-hand",
    "xanathar-investitura-della-fiamma",
    "xanathar-sfera-della-tempesta",
  ];
  let executorCalls = 0;
  for (const spellId of cases) {
    const current = contract(spellId);
    const session = createSpellPanelSession({
      contract: current,
      casterId: "caster-a",
      targetIds: ["target-a"],
      placement: { state: "confirmed", confirmed: true },
      damageValue: 10,
    });
    const eligibility = getSpellUnifiedLifecycleEligibility(current);
    assert.equal(eligibility.eligible, false, spellId);
    const result = await executeSpellUnifiedLifecycle({
      contract: current,
      session,
      runtime: {
        executor: async () => {
          executorCalls += 1;
          return [];
        },
      },
    });
    assert.equal(result.status, SPELL_UNIFIED_LIFECYCLE_STATUS.REJECTED, spellId);
  }
  assert.equal(executorCalls, 0);
});

test("rifiuta una sessione incompleta prima dell'executor", async () => {
  const current = contract("bless");
  const session = createSpellPanelSession({ contract: current });
  const result = await executeSpellUnifiedLifecycle({
    contract: current,
    session,
    runtime: { executor: async () => assert.fail("executor non atteso") },
  });

  assert.equal(result.status, SPELL_UNIFIED_LIFECYCLE_STATUS.REJECTED);
  assert.equal(result.error.code, "session-incomplete");
});

test("normalizza gli errori dell'executor senza esporre stack", async () => {
  const current = contract("aid");
  const session = createSpellPanelSession({
    contract: current,
    targetIds: ["target-a"],
  });
  const result = await executeSpellUnifiedLifecycle({
    contract: current,
    session,
    runtime: {
      executor: async () => {
        throw new Error("mutation failed");
      },
    },
  });

  assert.equal(result.status, SPELL_UNIFIED_LIFECYCLE_STATUS.FAILED);
  assert.equal(result.error.code, "spell-lifecycle-failed");
  assert.equal(result.error.message, "mutation failed");
  assert.equal(Object.prototype.hasOwnProperty.call(result.error, "stack"), false);
});
