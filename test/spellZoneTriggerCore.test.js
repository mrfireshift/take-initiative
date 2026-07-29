import test from "node:test";
import assert from "node:assert/strict";
import { getSpellAreaRuleById } from "../src/spellAreaRules.js";
import { SPELL_STATIC_ZONE_META_KEY } from "../src/spellStaticZoneCore.js";
import {
  consumeSpellZoneTrigger,
  mergePlannedSpellZoneTriggerRuntime,
  pendingSpellZoneTriggerActivations,
  planSpellZoneTriggers,
} from "../src/spellZoneTriggerCore.js";

const zoneMetadata = (overrides = {}) => ({
  instanceId: "spell-zone",
  ruleId: "web:cast",
  spellId: "web",
  casterId: "caster",
  role: "root",
  ...overrides,
});

const state = (current, round = 1) => ({
  order: ["caster", "target"],
  current,
  round,
});

test("l'inizializzazione fotografa la membership senza generare trigger retroattivi", () => {
  const plan = planSpellZoneTriggers({
    rule: getSpellAreaRuleById("web:cast"),
    zoneMetadata: zoneMetadata(),
    currentTargetIds: ["target"],
    initiativeState: state(1),
    areaPosition: { x: 10, y: 20 },
    now: 100,
  });

  assert.deepEqual(plan.newActivations, []);
  assert.deepEqual(plan.runtime.memberIds, ["target"]);
  assert.equal(plan.runtime.initialized, true);
  assert.equal(plan.runtime.evaluatedActorId, "target");
});

test("Ragnatela prepara il TS a inizio turno una sola volta nel turno", () => {
  const rule = getSpellAreaRuleById("web:cast");
  const initialized = planSpellZoneTriggers({
    rule,
    zoneMetadata: zoneMetadata(),
    currentTargetIds: ["target"],
    initiativeState: state(0),
    now: 100,
  });
  const turnStart = planSpellZoneTriggers({
    rule,
    zoneMetadata: zoneMetadata(),
    runtime: initialized.runtime,
    currentTargetIds: ["target"],
    initiativeState: state(1),
    now: 200,
  });

  assert.equal(turnStart.newActivations.length, 1);
  assert.equal(turnStart.newActivations[0].triggerId, "web-save-on-turn-start");
  assert.deepEqual(turnStart.newActivations[0].targetIds, ["target"]);

  const left = planSpellZoneTriggers({
    rule,
    zoneMetadata: zoneMetadata(),
    runtime: turnStart.runtime,
    currentTargetIds: [],
    initiativeState: state(1),
    now: 300,
  });
  assert.deepEqual(left.runtime.pending, []);
  const reentered = planSpellZoneTriggers({
    rule,
    zoneMetadata: zoneMetadata(),
    runtime: left.runtime,
    currentTargetIds: ["target"],
    initiativeState: state(1),
    now: 400,
  });
  assert.deepEqual(reentered.newActivations, []);
});

test("i reminder scaduti non sopravvivono all'uscita o al turno successivo", () => {
  const rule = getSpellAreaRuleById("web:cast");
  const initialized = planSpellZoneTriggers({
    rule,
    zoneMetadata: zoneMetadata(),
    currentTargetIds: ["target"],
    initiativeState: state(0),
    now: 100,
  });
  const turnStart = planSpellZoneTriggers({
    rule,
    zoneMetadata: zoneMetadata(),
    runtime: initialized.runtime,
    currentTargetIds: ["target"],
    initiativeState: state(1),
    now: 200,
  });
  assert.equal(turnStart.runtime.pending.length, 1);

  const nextRound = planSpellZoneTriggers({
    rule,
    zoneMetadata: zoneMetadata(),
    runtime: turnStart.runtime,
    currentTargetIds: [],
    initiativeState: state(0, 2),
    now: 300,
  });
  assert.deepEqual(nextRound.runtime.pending, []);
});

test("il merge applica la pulizia pianificata senza perdere aggiunte concorrenti", () => {
  const base = {
    initialized: true,
    pending: [{ id: "stale", targetIds: ["target"], createdAt: 10 }],
  };
  const planned = {
    ...base,
    pending: [],
  };
  const current = {
    ...base,
    pending: [
      ...base.pending,
      { id: "concurrent", targetIds: ["other"], createdAt: 20 },
    ],
  };
  const merged = mergePlannedSpellZoneTriggerRuntime(
    current,
    planned,
    [],
    base,
  );
  assert.deepEqual(
    merged.pending.map((entry) => entry.id),
    ["concurrent"],
  );
});

test("Ragnatela ripropone il TS al round seguente dopo un esito non applicato", () => {
  const rule = getSpellAreaRuleById("web:cast");
  const initialized = planSpellZoneTriggers({
    rule,
    zoneMetadata: zoneMetadata(),
    currentTargetIds: ["target"],
    initiativeState: state(0),
    now: 100,
  });
  const firstTurn = planSpellZoneTriggers({
    rule,
    zoneMetadata: zoneMetadata(),
    runtime: initialized.runtime,
    currentTargetIds: ["target"],
    initiativeState: state(1),
    now: 200,
  });
  const consumed = consumeSpellZoneTrigger(
    firstTurn.runtime,
    firstTurn.newActivations[0].id,
  );
  const nextRound = planSpellZoneTriggers({
    rule,
    zoneMetadata: zoneMetadata(),
    runtime: consumed,
    currentTargetIds: ["target"],
    initiativeState: state(1, 2),
    now: 300,
  });

  assert.equal(nextRound.newActivations.length, 1);
  assert.equal(
    nextRound.newActivations[0].triggerId,
    "web-save-on-turn-start",
  );
  assert.deepEqual(nextRound.newActivations[0].targetIds, ["target"]);
});

test("Ragnatela prepara trigger per creature diverse e di nuovo al turno seguente", () => {
  const rule = getSpellAreaRuleById("web:cast");
  const initiativeState = (current, round = 1) => ({
    order: ["caster", "first", "second"],
    current,
    round,
  });
  const initialized = planSpellZoneTriggers({
    rule,
    zoneMetadata: zoneMetadata(),
    currentTargetIds: [],
    initiativeState: initiativeState(0),
    now: 100,
  });
  const firstEntered = planSpellZoneTriggers({
    rule,
    zoneMetadata: zoneMetadata(),
    runtime: initialized.runtime,
    currentTargetIds: ["first"],
    initiativeState: initiativeState(1),
    now: 200,
  });
  assert.deepEqual(firstEntered.newActivations[0].targetIds, ["first"]);

  const secondTurn = planSpellZoneTriggers({
    rule,
    zoneMetadata: zoneMetadata(),
    runtime: firstEntered.runtime,
    currentTargetIds: ["first"],
    initiativeState: initiativeState(2),
    now: 300,
  });
  const secondEntered = planSpellZoneTriggers({
    rule,
    zoneMetadata: zoneMetadata(),
    runtime: secondTurn.runtime,
    currentTargetIds: ["first", "second"],
    initiativeState: initiativeState(2),
    now: 400,
  });
  assert.deepEqual(secondEntered.newActivations[0].targetIds, ["second"]);

  const nextFirstTurn = planSpellZoneTriggers({
    rule,
    zoneMetadata: zoneMetadata(),
    runtime: secondEntered.runtime,
    currentTargetIds: ["first", "second"],
    initiativeState: initiativeState(1, 2),
    now: 500,
  });
  assert.equal(nextFirstTurn.newActivations.length, 1);
  assert.equal(
    nextFirstTurn.newActivations[0].triggerId,
    "web-save-on-turn-start",
  );
  assert.deepEqual(nextFirstTurn.newActivations[0].targetIds, ["first"]);
});

test("un effetto già collegato alla zona sopprime il trigger ridondante", () => {
  const rule = getSpellAreaRuleById("web:cast");
  const initialized = planSpellZoneTriggers({
    rule,
    zoneMetadata: zoneMetadata(),
    currentTargetIds: ["target"],
    initiativeState: state(0),
  });
  const turnStart = planSpellZoneTriggers({
    rule,
    zoneMetadata: zoneMetadata(),
    runtime: initialized.runtime,
    currentTargetIds: ["target"],
    initiativeState: state(1),
    suppressedTargetIdsByTrigger: {
      "web-save-on-turn-start": ["target"],
    },
  });

  assert.deepEqual(turnStart.newActivations, []);
});

test("Ragnatela ricorda il TS anche quando una creatura entra fuori dal proprio turno", () => {
  const rule = getSpellAreaRuleById("web:cast");
  const initialized = planSpellZoneTriggers({
    rule,
    zoneMetadata: zoneMetadata(),
    currentTargetIds: [],
    initiativeState: state(0),
  });
  const enteredOutsideOwnTurn = planSpellZoneTriggers({
    rule,
    zoneMetadata: zoneMetadata(),
    runtime: initialized.runtime,
    currentTargetIds: ["target"],
    initiativeState: state(0),
  });
  assert.equal(enteredOutsideOwnTurn.newActivations.length, 1);
  assert.equal(
    enteredOutsideOwnTurn.newActivations[0].triggerId,
    "web-save-on-entry",
  );
  assert.deepEqual(
    enteredOutsideOwnTurn.newActivations[0].targetIds,
    ["target"],
  );

  const reset = planSpellZoneTriggers({
    rule,
    zoneMetadata: zoneMetadata(),
    runtime: enteredOutsideOwnTurn.runtime,
    currentTargetIds: [],
    initiativeState: state(1),
  });
  const enteredOnOwnTurn = planSpellZoneTriggers({
    rule,
    zoneMetadata: zoneMetadata(),
    runtime: reset.runtime,
    currentTargetIds: ["target"],
    initiativeState: state(1),
  });
  assert.equal(enteredOnOwnTurn.newActivations[0].triggerId, "web-save-on-entry");
});

test("spostare l'area non equivale a far entrare le creature", () => {
  const rule = getSpellAreaRuleById("moonbeam:cast");
  const initialized = planSpellZoneTriggers({
    rule,
    zoneMetadata: zoneMetadata({
      ruleId: rule.id,
      spellId: rule.spellId,
    }),
    currentTargetIds: [],
    initiativeState: state(1),
    areaPosition: { x: 0, y: 0 },
  });
  const moved = planSpellZoneTriggers({
    rule,
    zoneMetadata: zoneMetadata({
      ruleId: rule.id,
      spellId: rule.spellId,
    }),
    runtime: initialized.runtime,
    currentTargetIds: ["target"],
    initiativeState: state(1),
    areaPosition: { x: 50, y: 0 },
  });

  assert.deepEqual(moved.newActivations, []);
});

test("Raggio Lunare conserva il suggerimento danno nel trigger", () => {
  const rule = getSpellAreaRuleById("moonbeam:cast");
  const metadata = zoneMetadata({
    ruleId: rule.id,
    spellId: rule.spellId,
  });
  const initialized = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    currentTargetIds: ["target"],
    initiativeState: state(0),
  });
  const turnStart = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    runtime: initialized.runtime,
    currentTargetIds: ["target"],
    initiativeState: state(1),
    now: 250,
  });

  assert.equal(turnStart.newActivations[0].damage.dice, "2d10");
  assert.equal(turnStart.newActivations[0].damage.onSave, "half");
  assert.equal(turnStart.newActivations[0].ruleChoice, "damage");
});

test("i trigger pendenti sono ordinati e consumabili senza perdere lo stato", () => {
  const runtime = {
    initialized: true,
    pending: [
      { id: "later", targetIds: ["b"], createdAt: 20 },
      { id: "first", targetIds: ["a"], createdAt: 10 },
    ],
    handledKeys: ["once:test:a"],
  };
  const items = [{
    id: "zone-root",
    metadata: {
      [SPELL_STATIC_ZONE_META_KEY]: {
        ...zoneMetadata(),
        triggerRuntime: runtime,
      },
    },
  }];

  assert.deepEqual(
    pendingSpellZoneTriggerActivations(items).map((entry) => entry.id),
    ["first", "later"],
  );
  const consumed = consumeSpellZoneTrigger(runtime, "first");
  assert.deepEqual(consumed.pending.map((entry) => entry.id), ["later"]);
  assert.deepEqual(consumed.handledKeys, ["once:test:a"]);
});

test("il merge concorrente non ripristina un trigger già consumato", () => {
  const planned = {
    initialized: true,
    memberIds: ["target"],
    pending: [{ id: "old", targetIds: ["target"], createdAt: 10 }],
    handledKeys: ["turn:1:1:target:web-save:target"],
    sequence: 1,
  };
  const currentAfterConsume = consumeSpellZoneTrigger(planned, "old");
  const merged = mergePlannedSpellZoneTriggerRuntime(
    currentAfterConsume,
    planned,
    [{ id: "new", targetIds: ["target"], createdAt: 20 }],
  );

  assert.deepEqual(merged.pending.map((entry) => entry.id), ["new"]);
  assert.equal(merged.sequence, 1);
});

test("persistent runtime permits later tokens, entries, and rounds with unresolved reminders", () => {
  const rule = getSpellAreaRuleById("web:cast");
  const initiativeState = (current, round = 1) => ({
    order: ["caster", "first", "second", "third"],
    current,
    round,
  });
  let runtime = null;

  const reconcile = ({ current, round = 1, members, now }) => {
    const baseRuntime = runtime;
    const plan = planSpellZoneTriggers({
      rule,
      zoneMetadata: zoneMetadata(),
      runtime: baseRuntime,
      currentTargetIds: members,
      initiativeState: initiativeState(current, round),
      now,
    });
    runtime = mergePlannedSpellZoneTriggerRuntime(
      runtime,
      plan.runtime,
      plan.newActivations,
      baseRuntime,
    );
    return plan.newActivations;
  };

  assert.deepEqual(reconcile({
    current: 0,
    members: ["first", "second"],
    now: 100,
  }), []);
  assert.deepEqual(
    reconcile({
      current: 1,
      members: ["first", "second"],
      now: 200,
    }).map((activation) => activation.targetIds),
    [["first"]],
  );
  assert.deepEqual(
    reconcile({
      current: 2,
      members: ["first", "second"],
      now: 300,
    }).map((activation) => activation.targetIds),
    [["second"]],
  );
  assert.deepEqual(
    reconcile({
      current: 2,
      members: ["first", "second", "third"],
      now: 400,
    }).map((activation) => activation.targetIds),
    [["third"]],
  );
  assert.deepEqual(
    reconcile({
      current: 1,
      round: 2,
      members: ["first", "second", "third"],
      now: 500,
    }).map((activation) => activation.targetIds),
    [["first"]],
  );
});
