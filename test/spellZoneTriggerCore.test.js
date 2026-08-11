import test from "node:test";
import assert from "node:assert/strict";
import { CLASS_FEATURE_AURA_META_KEY } from "../src/classFeatureAuraCore.js";
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

test("i trigger pendenti riconoscono anche le aure delle capacità di classe", () => {
  const pending = pendingSpellZoneTriggerActivations([{
    id: "angel-aura",
    metadata: {
      [CLASS_FEATURE_AURA_META_KEY]: {
        triggerRuntime: {
          pending: [{ id: "angel-trigger", targetIds: ["enemy"], createdAt: 1 }],
        },
      },
    },
  }]);

  assert.deepEqual(pending, [{
    id: "angel-trigger",
    targetIds: ["enemy"],
    createdAt: 1,
    zoneItemId: "angel-aura",
    zoneItemIds: ["angel-aura"],
  }]);
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

test("Sfera Infuocata distingue prossimità e contatto durante lo spostamento", () => {
  const rule = getSpellAreaRuleById("flaming-sphere:cast");
  const metadata = zoneMetadata({
    ruleId: rule.id,
    spellId: rule.spellId,
  });
  const initialized = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    currentTargetIds: ["target"],
    currentDirectTargetIds: [],
    initiativeState: state(0),
    areaPosition: { x: 0, y: 0 },
  });
  const movedNearby = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    runtime: initialized.runtime,
    currentTargetIds: ["target"],
    currentDirectTargetIds: [],
    initiativeState: state(0),
    areaPosition: { x: 50, y: 0 },
  });
  assert.deepEqual(movedNearby.newActivations, []);

  const movedIntoContact = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    runtime: movedNearby.runtime,
    currentTargetIds: ["target"],
    currentDirectTargetIds: ["target"],
    initiativeState: state(0),
    areaPosition: { x: 100, y: 0 },
  });
  assert.equal(movedIntoContact.newActivations.length, 1);
  assert.equal(
    movedIntoContact.newActivations[0].triggerId,
    "flaming-sphere-save-on-contact",
  );
  assert.deepEqual(movedIntoContact.newActivations[0].targetIds, ["target"]);
});

test("Sfera Infuocata usa la membership di prossimità a fine turno", () => {
  const rule = getSpellAreaRuleById("flaming-sphere:cast");
  const metadata = zoneMetadata({
    ruleId: rule.id,
    spellId: rule.spellId,
  });
  const initialized = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    currentTargetIds: ["target"],
    initiativeState: state(1),
  });
  const turnEnded = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    runtime: initialized.runtime,
    currentTargetIds: ["target"],
    initiativeState: state(0, 2),
  });

  assert.equal(turnEnded.newActivations.length, 1);
  assert.equal(
    turnEnded.newActivations[0].triggerId,
    "flaming-sphere-save-on-turn-end",
  );
  assert.deepEqual(turnEnded.newActivations[0].targetIds, ["target"]);
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
  assert.equal(
    turnStart.newActivations[0].failureEffect,
    "Danni radiosi della spell (metà se superato).",
  );
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

test("una stessa attivazione sovrapposta a piu sottozone produce un solo reminder", () => {
  const activation = {
    id: "activation-1",
    targetIds: ["first"],
    createdAt: 10,
  };
  const childMetadata = {
    ...zoneMetadata({
      role: "subzone",
      parentZoneId: "root-1",
      parentInstanceId: "spell-1",
      activationId: "activation-batch",
      childKind: "fissure",
    }),
    triggerRuntime: { initialized: true, pending: [activation] },
  };
  const secondChildMetadata = {
    ...childMetadata,
    triggerRuntime: {
      initialized: true,
      pending: [{ ...activation, targetIds: ["second", "first"] }],
    },
  };
  const items = [
    { id: "child-1", metadata: { [SPELL_STATIC_ZONE_META_KEY]: childMetadata } },
    { id: "child-2", metadata: { [SPELL_STATIC_ZONE_META_KEY]: secondChildMetadata } },
  ];

  assert.deepEqual(
    pendingSpellZoneTriggerActivations(items),
    [{
      ...activation,
      zoneItemId: "child-1",
      zoneItemIds: ["child-1", "child-2"],
      targetIds: ["first", "second"],
    }],
  );
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

test("il merge accetta runtime provenienti da un draft Immer", () => {
  const pendingDraft = new Proxy({
    id: "old",
    triggerId: "web-save-on-turn-start",
    targetIds: ["target"],
    createdAt: 10,
  }, {});
  const currentDraft = new Proxy({
    initialized: true,
    memberIds: ["target"],
    evaluatedTurnKey: "1:1:target",
    evaluatedActorId: "target",
    handledKeys: ["turn:1:1:target:web-save:target"],
    pending: new Proxy([pendingDraft], {}),
    sequence: 1,
  }, {});
  const planned = {
    ...currentDraft,
    pending: [{
      id: "new",
      triggerId: "web-save-on-turn-start",
      targetIds: ["target"],
      createdAt: 20,
    }],
    sequence: 2,
  };

  const merged = mergePlannedSpellZoneTriggerRuntime(
    currentDraft,
    planned,
    planned.pending,
    currentDraft,
  );

  assert.deepEqual(merged.pending.map((entry) => entry.id), ["new"]);
  assert.equal(merged.sequence, 2);
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

test("il primo gruppo di zone avvisa token distinti e si ripete al round seguente", () => {
  const cases = [
    ["xanathar-alba:cast", "turn-end"],
    ["xanathar-oscurita-della-follia:cast", "turn-start"],
    ["xanathar-diavoletto-di-polvere:cast", "turn-end"],
    ["xanathar-sfera-della-tempesta:cast", "turn-end"],
  ];
  const initiativeState = (current, round) => ({
    order: ["first", "second"],
    current,
    round,
  });

  for (const [ruleId, event] of cases) {
    const rule = getSpellAreaRuleById(ruleId);
    const metadata = zoneMetadata({
      ruleId: rule.id,
      spellId: rule.spellId,
    });
    let runtime = planSpellZoneTriggers({
      rule,
      zoneMetadata: metadata,
      currentTargetIds: ["first", "second"],
      initiativeState: initiativeState(event === "turn-start" ? 1 : 0, 1),
      now: 100,
    }).runtime;
    const boundaries = event === "turn-start"
      ? [[0, 2, "first"], [1, 2, "second"], [0, 3, "first"]]
      : [[1, 1, "first"], [0, 2, "second"], [1, 2, "first"]];

    for (const [current, round, expectedTargetId] of boundaries) {
      const plan = planSpellZoneTriggers({
        rule,
        zoneMetadata: metadata,
        runtime,
        currentTargetIds: ["first", "second"],
        initiativeState: initiativeState(current, round),
        now: 100 + round * 10 + current,
      });
      assert.equal(plan.newActivations.length, 1, ruleId);
      assert.equal(plan.newActivations[0].event, event, ruleId);
      assert.equal(
        plan.newActivations[0].failureEffect,
        rule.zonePolicy.triggers[0].failureEffect,
        ruleId,
      );
      assert.deepEqual(
        plan.newActivations[0].targetIds,
        [expectedTargetId],
        ruleId,
      );
      runtime = plan.runtime;
    }
  }
});

test("ingresso e fine turno restano eventi distinti nelle zone che li richiedono", () => {
  const rule = getSpellAreaRuleById("incendiary-cloud:cast");
  const metadata = zoneMetadata({
    ruleId: rule.id,
    spellId: rule.spellId,
  });
  const initiativeState = (current) => ({
    order: ["target", "other"],
    current,
    round: 1,
  });
  const initialized = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    currentTargetIds: [],
    initiativeState: initiativeState(0),
    now: 100,
  });
  const entered = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    runtime: initialized.runtime,
    currentTargetIds: ["target"],
    initiativeState: initiativeState(0),
    now: 200,
  });
  assert.deepEqual(
    entered.newActivations.map((activation) => activation.triggerId),
    ["incendiary-cloud-save-on-entry"],
  );

  const ended = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    runtime: entered.runtime,
    currentTargetIds: ["target"],
    initiativeState: initiativeState(1),
    now: 300,
  });
  assert.deepEqual(
    ended.newActivations.map((activation) => activation.triggerId),
    ["incendiary-cloud-save-on-turn-end"],
  );
});

test("Fame di Hadar separa danno automatico iniziale e TS finale", () => {
  const rule = getSpellAreaRuleById("phb2014-fame-di-hadar:cast");
  const metadata = zoneMetadata({
    ruleId: rule.id,
    spellId: rule.spellId,
  });
  const initiativeState = (current, round) => ({
    order: ["target", "other"],
    current,
    round,
  });
  const initialized = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    currentTargetIds: ["target"],
    initiativeState: initiativeState(1, 1),
    now: 100,
  });
  const started = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    runtime: initialized.runtime,
    currentTargetIds: ["target"],
    initiativeState: initiativeState(0, 2),
    now: 200,
  });
  assert.equal(started.newActivations[0].resolution, "informational");
  assert.equal(started.newActivations[0].damage.type, "freddo");
  assert.deepEqual(started.runtime.pending, []);

  const ended = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    runtime: started.runtime,
    currentTargetIds: ["target"],
    initiativeState: initiativeState(1, 2),
    now: 300,
  });
  assert.equal(ended.newActivations[0].resolution, "manual-save");
  assert.equal(ended.newActivations[0].damage.type, "acido");
  assert.equal(ended.runtime.pending.length, 1);
});

test("Fame di Hadar aggrega fine turno e inizio turno di token consecutivi", () => {
  const rule = getSpellAreaRuleById("phb2014-fame-di-hadar:cast");
  const metadata = zoneMetadata({
    ruleId: rule.id,
    spellId: rule.spellId,
  });
  const initialized = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    currentTargetIds: ["first", "second"],
    initiativeState: {
      order: ["first", "second"],
      current: 0,
      round: 1,
    },
    now: 100,
  });
  const transition = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    runtime: initialized.runtime,
    currentTargetIds: ["first", "second"],
    initiativeState: {
      order: ["first", "second"],
      current: 1,
      round: 1,
    },
    now: 200,
  });

  assert.deepEqual(
    transition.newActivations.map((activation) => activation.event),
    ["turn-start", "turn-end"],
  );
  assert.deepEqual(
    transition.newActivations.map((activation) => activation.turnKey),
    ["1:1:second", "1:0:first"],
  );
  assert.deepEqual(
    transition.newActivations.map((activation) => activation.noticeTurnKey),
    ["1:1:second", "1:1:second"],
  );

  const merged = mergePlannedSpellZoneTriggerRuntime(
    initialized.runtime,
    transition.runtime,
    transition.newActivations,
    initialized.runtime,
  );
  assert.deepEqual(
    merged.pending.map((activation) => activation.resolution),
    ["manual-save"],
  );
});

test("i danni automatici vengono notificati senza restare nella coda dei TS", () => {
  const rule = getSpellAreaRuleById("xanathar-muro-di-luce:cast");
  const metadata = zoneMetadata({
    ruleId: rule.id,
    spellId: rule.spellId,
  });
  const initialized = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    currentTargetIds: ["target"],
    initiativeState: {
      order: ["target", "other"],
      current: 0,
      round: 1,
    },
    now: 100,
  });
  const ended = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    runtime: initialized.runtime,
    currentTargetIds: ["target"],
    initiativeState: {
      order: ["target", "other"],
      current: 1,
      round: 1,
    },
    now: 200,
  });

  assert.equal(ended.newActivations.length, 1);
  assert.equal(ended.newActivations[0].resolution, "informational");
  assert.deepEqual(ended.runtime.pending, []);
});

test("il lotto standard di inizio turno avvisa ogni token e si ripete", () => {
  const ruleIds = [
    "blade-barrier:cast",
    "cloudkill:cast",
    "xanathar-fulgore-nauseante:cast",
    "xanathar-maelstrom:cast",
  ];
  const initiativeState = (current, round) => ({
    order: ["first", "second"],
    current,
    round,
  });

  for (const ruleId of ruleIds) {
    const rule = getSpellAreaRuleById(ruleId);
    const metadata = zoneMetadata({
      ruleId: rule.id,
      spellId: rule.spellId,
    });
    let runtime = planSpellZoneTriggers({
      rule,
      zoneMetadata: metadata,
      currentTargetIds: ["first", "second"],
      initiativeState: initiativeState(1, 1),
      now: 100,
    }).runtime;

    for (const [current, round, expectedTargetId] of [
      [0, 2, "first"],
      [1, 2, "second"],
      [0, 3, "first"],
    ]) {
      const plan = planSpellZoneTriggers({
        rule,
        zoneMetadata: metadata,
        runtime,
        currentTargetIds: ["first", "second"],
        initiativeState: initiativeState(current, round),
        now: 100 + round * 10 + current,
      });
      assert.equal(plan.newActivations.length, 1, ruleId);
      assert.equal(plan.newActivations[0].event, "turn-start", ruleId);
      assert.deepEqual(
        plan.newActivations[0].targetIds,
        [expectedTargetId],
        ruleId,
      );
      runtime = plan.runtime;
    }
  }
});

test("Nube Mortale distingue ingresso e inizio del turno seguente", () => {
  const rule = getSpellAreaRuleById("cloudkill:cast");
  const metadata = zoneMetadata({
    ruleId: rule.id,
    spellId: rule.spellId,
  });
  const initiativeState = (current, round) => ({
    order: ["target", "other"],
    current,
    round,
  });
  const initialized = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    currentTargetIds: [],
    initiativeState: initiativeState(0, 1),
    now: 100,
  });
  const entered = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    runtime: initialized.runtime,
    currentTargetIds: ["target"],
    initiativeState: initiativeState(0, 1),
    now: 200,
  });
  assert.deepEqual(
    entered.newActivations.map((activation) => activation.triggerId),
    ["cloudkill-save-on-entry"],
  );
  const otherTurn = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    runtime: entered.runtime,
    currentTargetIds: ["target"],
    initiativeState: initiativeState(1, 1),
    now: 300,
  });
  const nextTargetTurn = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    runtime: otherTurn.runtime,
    currentTargetIds: ["target"],
    initiativeState: initiativeState(0, 2),
    now: 400,
  });
  assert.deepEqual(
    nextTargetTurn.newActivations.map((activation) => activation.triggerId),
    ["cloudkill-save-on-turn-start"],
  );
});

test("Unto conserva separati il TS d'ingresso e quello di fine turno", () => {
  const rule = getSpellAreaRuleById("grease:cast");
  const metadata = zoneMetadata({
    ruleId: rule.id,
    spellId: rule.spellId,
  });
  const initiativeState = (current) => ({
    order: ["target", "other"],
    current,
    round: 1,
  });
  const initialized = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    currentTargetIds: [],
    initiativeState: initiativeState(0),
    now: 100,
  });
  const entered = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    runtime: initialized.runtime,
    currentTargetIds: ["target"],
    initiativeState: initiativeState(0),
    now: 200,
  });
  const ended = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    runtime: entered.runtime,
    currentTargetIds: ["target"],
    initiativeState: initiativeState(1),
    now: 300,
  });

  assert.deepEqual(
    entered.newActivations.map((activation) => activation.triggerId),
    ["grease-save-on-entry"],
  );
  assert.deepEqual(
    ended.newActivations.map((activation) => activation.triggerId),
    ["grease-save-on-turn-end"],
  );
  assert.deepEqual(
    ended.runtime.pending.map((activation) => activation.triggerId),
    ["grease-save-on-turn-end"],
  );
});

test("Tentacoli Neri alterna TS e danno automatico in base a Trattenuto", () => {
  const rule = getSpellAreaRuleById("black-tentacles:cast");
  const metadata = zoneMetadata({
    ruleId: rule.id,
    spellId: rule.spellId,
  });
  const saveTriggerId = "black-tentacles-save-on-turn-start";
  const damageTriggerId = "black-tentacles-restrained-damage-on-turn-start";
  const initiativeState = (current, round) => ({
    order: ["target", "other"],
    current,
    round,
  });
  const initialized = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    currentTargetIds: ["target"],
    initiativeState: initiativeState(1, 1),
    now: 100,
  });
  const freeTarget = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    runtime: initialized.runtime,
    currentTargetIds: ["target"],
    initiativeState: initiativeState(0, 2),
    suppressedTargetIdsByTrigger: {
      [damageTriggerId]: ["target"],
    },
    now: 200,
  });

  assert.deepEqual(
    freeTarget.newActivations.map((activation) => activation.triggerId),
    [saveTriggerId],
  );
  assert.equal(freeTarget.newActivations[0].resolution, "manual-save");

  const otherTurn = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    runtime: freeTarget.runtime,
    currentTargetIds: ["target"],
    initiativeState: initiativeState(1, 2),
    now: 300,
  });
  const restrainedTarget = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    runtime: otherTurn.runtime,
    currentTargetIds: ["target"],
    initiativeState: initiativeState(0, 3),
    suppressedTargetIdsByTrigger: {
      [saveTriggerId]: ["target"],
    },
    now: 400,
  });

  assert.deepEqual(
    restrainedTarget.newActivations.map((activation) => activation.triggerId),
    [damageTriggerId],
  );
  assert.equal(restrainedTarget.newActivations[0].resolution, "informational");
  assert.equal(restrainedTarget.newActivations[0].damage.dice, "3d6");
  assert.deepEqual(restrainedTarget.runtime.pending, []);
});

test("Tempesta di Nevischio aggrega il TS ambientale e quello di concentrazione", () => {
  const rule = getSpellAreaRuleById("sleet-storm:cast");
  const metadata = zoneMetadata({
    ruleId: rule.id,
    spellId: rule.spellId,
  });
  const concentrationTriggerIds = rule.zonePolicy.triggers
    .filter((trigger) => trigger.requiresConcentration)
    .map((trigger) => trigger.id);
  const suppressionFor = (targetIds) => Object.fromEntries(
    concentrationTriggerIds.map((triggerId) => [triggerId, targetIds])
  );
  const initiativeState = (current, round) => ({
    order: ["caster", "other"],
    current,
    round,
  });

  const initialized = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    currentTargetIds: ["caster", "other"],
    initiativeState: initiativeState(0, 1),
    suppressedTargetIdsByTrigger: suppressionFor(["other"]),
    now: 100,
  });
  assert.deepEqual(
    initialized.newActivations.map((activation) => ({
      triggerId: activation.triggerId,
      targetIds: activation.targetIds,
    })),
    [{
      triggerId: "sleet-storm-concentration-save-on-cast",
      targetIds: ["caster"],
    }],
  );
  assert.deepEqual(initialized.runtime.pending, []);

  const otherTurn = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    runtime: initialized.runtime,
    currentTargetIds: ["caster", "other"],
    initiativeState: initiativeState(1, 1),
    suppressedTargetIdsByTrigger: suppressionFor(["other"]),
    now: 200,
  });
  assert.deepEqual(
    otherTurn.newActivations.map((activation) => activation.triggerId),
    ["sleet-storm-save-on-turn-start"],
  );

  const casterTurn = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    runtime: otherTurn.runtime,
    currentTargetIds: ["caster", "other"],
    initiativeState: initiativeState(0, 2),
    suppressedTargetIdsByTrigger: suppressionFor(["other"]),
    now: 300,
  });
  assert.deepEqual(
    casterTurn.newActivations.map((activation) => activation.triggerId),
    [
      "sleet-storm-save-on-turn-start",
      "sleet-storm-concentration-save-on-turn-start",
    ],
  );
  assert.deepEqual(
    casterTurn.newActivations.map((activation) => activation.targetIds),
    [["caster"], ["caster"]],
  );
  assert.equal(casterTurn.runtime.pending.length, 1);
});

test("Nube di Pugnali notifica il danno senza lasciare un TS pendente", () => {
  const rule = getSpellAreaRuleById("phb2014-nube-di-pugnali:cast");
  const metadata = zoneMetadata({
    ruleId: rule.id,
    spellId: rule.spellId,
  });
  const initialized = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    currentTargetIds: [],
    initiativeState: state(1),
    now: 100,
  });
  const entered = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    runtime: initialized.runtime,
    currentTargetIds: ["target"],
    initiativeState: state(1),
    now: 200,
  });

  assert.equal(entered.newActivations[0].resolution, "informational");
  assert.equal(entered.newActivations[0].damage.dice, "4d4");
  assert.equal(entered.newActivations[0].damage.type, "taglienti");
  assert.deepEqual(entered.runtime.pending, []);
});

test("Nube Maleodorante ripropone il TS a ogni inizio turno", () => {
  const rule = getSpellAreaRuleById("stinking-cloud:cast");
  const metadata = zoneMetadata({
    ruleId: rule.id,
    spellId: rule.spellId,
  });
  const initiativeState = (current, round) => ({
    order: ["target", "other"],
    current,
    round,
  });
  const initialized = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    currentTargetIds: ["target"],
    initiativeState: initiativeState(1, 1),
    now: 100,
  });
  const first = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    runtime: initialized.runtime,
    currentTargetIds: ["target"],
    initiativeState: initiativeState(0, 2),
    now: 200,
  });
  const other = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    runtime: consumeSpellZoneTrigger(
      first.runtime,
      first.newActivations[0].id,
    ),
    currentTargetIds: ["target"],
    initiativeState: initiativeState(1, 2),
    now: 300,
  });
  const repeated = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    runtime: other.runtime,
    currentTargetIds: ["target"],
    initiativeState: initiativeState(0, 3),
    now: 400,
  });

  assert.equal(
    first.newActivations[0].triggerId,
    "stinking-cloud-save-on-turn-start",
  );
  assert.equal(
    repeated.newActivations[0].triggerId,
    "stinking-cloud-save-on-turn-start",
  );
  assert.deepEqual(repeated.newActivations[0].targetIds, ["target"]);
});

test("Controllare Venti attiva i TS soltanto con Corrente Discendente", () => {
  const rule = getSpellAreaRuleById("xanathar-controllare-venti:cast");
  const gustsMetadata = zoneMetadata({
    instanceId: "winds-1",
    ruleId: rule.id,
    spellId: rule.spellId,
    ruleChoice: "gusts",
  });
  const initialized = planSpellZoneTriggers({
    rule,
    zoneMetadata: gustsMetadata,
    currentTargetIds: ["target"],
    initiativeState: state(0),
    now: 100,
  });
  const gustsTurn = planSpellZoneTriggers({
    rule,
    zoneMetadata: gustsMetadata,
    runtime: initialized.runtime,
    currentTargetIds: ["target"],
    initiativeState: state(1),
    now: 200,
  });
  assert.deepEqual(gustsTurn.newActivations, []);

  const downdraftTurn = planSpellZoneTriggers({
    rule,
    zoneMetadata: {
      ...gustsMetadata,
      ruleChoice: "downdraft",
    },
    runtime: initialized.runtime,
    currentTargetIds: ["target"],
    initiativeState: state(1),
    now: 300,
  });
  assert.equal(downdraftTurn.newActivations.length, 1);
  assert.equal(
    downdraftTurn.newActivations[0].triggerId,
    "control-winds-downdraft-save-on-turn-start",
  );
  assert.equal(downdraftTurn.newActivations[0].ruleChoice, "downdraft");
});

test("Sfera Acquea richiede il TS soltanto quando la zona investe un nuovo bersaglio", () => {
  const rule = getSpellAreaRuleById("xanathar-sfera-acquea:cast");
  const metadata = zoneMetadata({
    ruleId: rule.id,
    spellId: rule.spellId,
  });
  const initialized = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    currentTargetIds: [],
    initiativeState: state(0),
    areaPosition: { x: 0, y: 0 },
    now: 100,
  });
  const creatureEntered = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    runtime: initialized.runtime,
    currentTargetIds: ["target"],
    initiativeState: state(0),
    areaPosition: { x: 0, y: 0 },
    now: 200,
  });
  assert.deepEqual(creatureEntered.newActivations, []);

  const cleared = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    runtime: creatureEntered.runtime,
    currentTargetIds: [],
    initiativeState: state(0),
    areaPosition: { x: 0, y: 0 },
    now: 300,
  });
  const rammed = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    runtime: cleared.runtime,
    currentTargetIds: ["target"],
    initiativeState: state(0),
    areaPosition: { x: 150, y: 0 },
    now: 400,
  });
  assert.equal(rammed.newActivations.length, 1);
  assert.equal(rammed.newActivations[0].triggerId, "watery-sphere-save-on-ram");

  const movedPast = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    runtime: rammed.runtime,
    currentTargetIds: [],
    initiativeState: state(0),
    areaPosition: { x: 300, y: 0 },
    now: 500,
  });
  assert.equal(movedPast.runtime.pending.length, 1);
});

test("Spirito Guaritore non si attiva spostando lo spirito sopra una creatura", () => {
  const rule = getSpellAreaRuleById("xanathar-spirito-guaritore:cast");
  const metadata = zoneMetadata({
    ruleId: rule.id,
    spellId: rule.spellId,
  });
  const initialized = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    currentTargetIds: [],
    initiativeState: state(0),
    areaPosition: { x: 0, y: 0 },
    now: 100,
  });
  const spiritMoved = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    runtime: initialized.runtime,
    currentTargetIds: ["target"],
    initiativeState: state(0),
    areaPosition: { x: 150, y: 0 },
    now: 200,
  });
  assert.deepEqual(spiritMoved.newActivations, []);

  const left = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    runtime: spiritMoved.runtime,
    currentTargetIds: [],
    initiativeState: state(0),
    areaPosition: { x: 150, y: 0 },
    now: 300,
  });
  const creatureEntered = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    runtime: left.runtime,
    currentTargetIds: ["target"],
    initiativeState: state(0),
    areaPosition: { x: 150, y: 0 },
    now: 400,
  });
  assert.equal(creatureEntered.newActivations.length, 1);
  assert.equal(
    creatureEntered.newActivations[0].triggerId,
    "healing-spirit-heal-on-entry",
  );
  assert.equal(creatureEntered.runtime.pending.length, 1);
  assert.equal(creatureEntered.runtime.pending[0].resolution, "manual-heal");
});

test("Crescita di Spine aggrega entrata, movimento interno e uscita nello stesso turno", () => {
  const rule = getSpellAreaRuleById("spike-growth:cast");
  const metadata = zoneMetadata({
    ruleId: rule.id,
    spellId: rule.spellId,
  });
  const initialized = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    currentTargetIds: [],
    initiativeState: state(0),
    areaPosition: { x: 0, y: 0 },
    now: 100,
  });
  const entered = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    runtime: initialized.runtime,
    currentTargetIds: ["target"],
    currentTargetPositions: { target: { x: 0, y: 0 } },
    initiativeState: state(0),
    areaPosition: { x: 0, y: 0 },
    now: 200,
  });
  assert.equal(entered.newActivations.length, 1);

  const moved = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    runtime: entered.runtime,
    currentTargetIds: ["target"],
    currentTargetPositions: { target: { x: 150, y: 0 } },
    initiativeState: state(0),
    areaPosition: { x: 0, y: 0 },
    now: 300,
  });
  const left = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    runtime: moved.runtime,
    currentTargetIds: [],
    initiativeState: state(0),
    areaPosition: { x: 0, y: 0 },
    now: 400,
  });
  assert.deepEqual(moved.newActivations, []);
  assert.deepEqual(left.newActivations, []);
  assert.deepEqual(entered.runtime.pending, []);
});

test("Guardiano della Fede reagisce al primo movimento interno di ogni turno", () => {
  const rule = getSpellAreaRuleById("guardian-of-faith:cast");
  const metadata = zoneMetadata({
    ruleId: rule.id,
    spellId: rule.spellId,
  });
  const initialized = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    currentTargetIds: ["target"],
    currentTargetPositions: { target: { x: 0, y: 0 } },
    initiativeState: state(0),
    areaPosition: { x: 0, y: 0 },
    now: 100,
  });
  const firstMove = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    runtime: initialized.runtime,
    currentTargetIds: ["target"],
    currentTargetPositions: { target: { x: 150, y: 0 } },
    initiativeState: state(0),
    areaPosition: { x: 0, y: 0 },
    now: 200,
  });
  assert.equal(firstMove.newActivations.length, 1);
  assert.equal(
    firstMove.newActivations[0].triggerId,
    "guardian-of-faith-save-on-move-within",
  );

  const repeatedMove = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    runtime: firstMove.runtime,
    currentTargetIds: ["target"],
    currentTargetPositions: { target: { x: 300, y: 0 } },
    initiativeState: state(0),
    areaPosition: { x: 0, y: 0 },
    now: 300,
  });
  assert.deepEqual(repeatedMove.newActivations, []);

  const nextTurnMove = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    runtime: repeatedMove.runtime,
    currentTargetIds: ["target"],
    currentTargetPositions: { target: { x: 450, y: 0 } },
    initiativeState: state(1),
    areaPosition: { x: 0, y: 0 },
    now: 400,
  });
  assert.equal(nextTurnMove.newActivations.length, 1);
  assert.equal(
    nextTurnMove.newActivations[0].triggerId,
    "guardian-of-faith-save-on-move-within",
  );
});

test("Guardiano della Fede non duplica ingresso e movimento nello stesso turno", () => {
  const rule = getSpellAreaRuleById("guardian-of-faith:cast");
  const metadata = zoneMetadata({
    ruleId: rule.id,
    spellId: rule.spellId,
  });
  const initialized = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    currentTargetIds: [],
    initiativeState: state(1),
    areaPosition: { x: 0, y: 0 },
    now: 100,
  });
  const entered = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    runtime: initialized.runtime,
    currentTargetIds: ["target"],
    currentTargetPositions: { target: { x: 0, y: 0 } },
    initiativeState: state(1),
    areaPosition: { x: 0, y: 0 },
    now: 200,
  });
  assert.equal(
    entered.newActivations[0].triggerId,
    "guardian-of-faith-save-on-entry",
  );

  const moved = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    runtime: entered.runtime,
    currentTargetIds: ["target"],
    currentTargetPositions: { target: { x: 150, y: 0 } },
    initiativeState: state(1),
    areaPosition: { x: 0, y: 0 },
    now: 300,
  });
  assert.deepEqual(moved.newActivations, []);
});

test("i trigger del turno del caster possono rivolgersi ai membri o al caster", () => {
  const earthquake = getSpellAreaRuleById("earthquake:cast");
  const metadata = zoneMetadata({
    instanceId: "earthquake-1",
    ruleId: earthquake.id,
    spellId: earthquake.spellId,
  });
  const initiativeState = (current, round = 1) => ({
    order: ["caster", "first", "second"],
    current,
    round,
  });
  const initialized = planSpellZoneTriggers({
    rule: earthquake,
    zoneMetadata: metadata,
    currentTargetIds: ["caster", "first", "second"],
    initiativeState: initiativeState(0),
    suppressedTargetIdsByTrigger: {
      "earthquake-concentration-save-on-cast": ["caster", "first", "second"],
    },
  });
  const casterTurnEnd = planSpellZoneTriggers({
    rule: earthquake,
    zoneMetadata: metadata,
    runtime: initialized.runtime,
    currentTargetIds: ["caster", "first", "second"],
    initiativeState: initiativeState(1),
  });
  assert.deepEqual(
    casterTurnEnd.newActivations.map((activation) => [
      activation.triggerId,
      activation.targetIds,
    ]),
    [[
      "earthquake-ground-save-on-source-turn-end",
      ["caster", "first", "second"],
    ]],
  );

  const nextCasterTurn = planSpellZoneTriggers({
    rule: earthquake,
    zoneMetadata: metadata,
    runtime: casterTurnEnd.runtime,
    currentTargetIds: ["caster", "first", "second"],
    initiativeState: initiativeState(0, 2),
  });
  assert.deepEqual(
    nextCasterTurn.newActivations.map((activation) => [
      activation.triggerId,
      activation.targetIds,
    ]),
    [
      ["earthquake-fissures-on-source-turn-start", ["caster"]],
      ["earthquake-structure-damage-on-source-turn-start", ["caster"]],
    ],
  );
});

test("Controllare Acqua attiva il TS soltanto con la modalita Vortice", () => {
  const water = getSpellAreaRuleById("control-water:cast");
  const metadata = zoneMetadata({
    instanceId: "water-1",
    ruleId: water.id,
    spellId: water.spellId,
    role: "subzone",
    parentZoneId: "water-root",
    parentInstanceId: "water-1",
    childKind: "whirlpool",
    activationId: "activation-1",
    ruleChoice: "whirlpool",
  });
  const initialized = planSpellZoneTriggers({
    rule: water,
    zoneMetadata: metadata,
    currentTargetIds: [],
    initiativeState: state(0),
  });
  const entered = planSpellZoneTriggers({
    rule: water,
    zoneMetadata: metadata,
    runtime: initialized.runtime,
    currentTargetIds: ["target"],
    initiativeState: state(0),
  });
  assert.equal(entered.newActivations[0].ruleChoice, "whirlpool");
  assert.deepEqual(entered.newActivations[0].targetIds, ["target"]);

  const left = planSpellZoneTriggers({
    rule: water,
    zoneMetadata: { ...metadata, ruleChoice: "flood" },
    runtime: entered.runtime,
    currentTargetIds: [],
    initiativeState: state(1),
  });
  const enteredDuringFlood = planSpellZoneTriggers({
    rule: water,
    zoneMetadata: { ...metadata, ruleChoice: "flood" },
    runtime: left.runtime,
    currentTargetIds: ["target"],
    initiativeState: state(1),
  });
  assert.deepEqual(enteredDuringFlood.newActivations, []);
});

test("Collera della Natura ricorda al caster Liane e Alberi ai confini corretti", () => {
  const wrath = getSpellAreaRuleById("xanathar-collera-della-natura:cast");
  const metadata = zoneMetadata({
    instanceId: "wrath-1",
    ruleId: wrath.id,
    spellId: wrath.spellId,
  });
  const initialized = planSpellZoneTriggers({
    rule: wrath,
    zoneMetadata: metadata,
    currentTargetIds: ["target"],
    initiativeState: state(0),
  });
  const casterEnd = planSpellZoneTriggers({
    rule: wrath,
    zoneMetadata: metadata,
    runtime: initialized.runtime,
    currentTargetIds: ["target"],
    initiativeState: state(1),
  });
  assert.deepEqual(
    casterEnd.newActivations.map((activation) => [
      activation.triggerId,
      activation.targetIds,
    ]),
    [["wrath-of-nature-vines-on-source-turn-end", ["caster"]]],
  );

  const nextCasterStart = planSpellZoneTriggers({
    rule: wrath,
    zoneMetadata: metadata,
    runtime: casterEnd.runtime,
    currentTargetIds: ["target"],
    initiativeState: state(0, 2),
  });
  assert.deepEqual(
    nextCasterStart.newActivations.map((activation) => [
      activation.triggerId,
      activation.targetIds,
    ]),
    [["wrath-of-nature-trees-on-source-turn-start", ["caster"]]],
  );
});
