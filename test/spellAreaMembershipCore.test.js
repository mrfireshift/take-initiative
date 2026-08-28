import test from "node:test";
import assert from "node:assert/strict";

import {
  areaMembershipEffects,
  areaMembershipPlan,
  areaMembershipTargetIds,
  staleAreaMembershipEffectRemovals,
} from "../src/spellAreaMembershipCore.js";
import { getSpellAreaRuleById } from "../src/spellAreaRules.js";

const META = "meta";
const bounds = (x, y, size = 100) => ({
  min: { x, y },
  max: { x: x + size, y: y + size },
});
const token = (id, {
  attitude = "neutral",
  conditions = [],
} = {}) => ({
  id,
  metadata: {
    [META]: {
      attitude,
      ...(conditions.length ? {
        conditions: { version: 2, instances: conditions },
      } : {}),
    },
  },
});

test("la membership di zona usa geometria, fazione e inclusione caster", () => {
  const rule = {
    ...getSpellAreaRuleById("web:cast"),
    targeting: {
      filter: "hostile",
      includeCaster: false,
      confirmTargets: true,
    },
    zonePolicy: {
      ...getSpellAreaRuleById("web:cast").zonePolicy,
      membershipTargeting: {
        filter: "hostile",
        includeCaster: false,
      },
    },
  };
  const caster = token("caster", { attitude: "pc" });
  const ally = token("ally", { attitude: "ally" });
  const enemy = token("enemy", { attitude: "enemy" });
  const outside = token("outside", { attitude: "enemy" });
  const area = { cells: [{ x: 0, y: 0, width: 300, height: 300 }] };

  assert.deepEqual(areaMembershipTargetIds({
    sourceId: "caster",
    rule,
    area,
    metaKey: META,
    candidates: [
      { item: caster, bounds: bounds(0, 0) },
      { item: ally, bounds: bounds(100, 0) },
      { item: enemy, bounds: bounds(200, 0) },
      { item: outside, bounds: bounds(400, 0) },
    ],
  }), ["enemy"]);
});

test("l'aura di Investitura della Fiamma include anche gli alleati ma esclude il caster", () => {
  const rule = getSpellAreaRuleById("xanathar-investitura-della-fiamma:aura");
  const area = { cells: [{ x: 0, y: 0, width: 300, height: 300 }] };
  const caster = token("caster", { attitude: "pc" });
  const ally = token("ally", { attitude: "ally" });
  const enemy = token("enemy", { attitude: "enemy" });

  assert.deepEqual(areaMembershipTargetIds({
    sourceId: "caster",
    rule,
    area,
    metaKey: META,
    candidates: [
      { item: caster, bounds: bounds(0, 0) },
      { item: ally, bounds: bounds(100, 0) },
      { item: enemy, bounds: bounds(200, 0) },
    ],
  }), ["ally", "enemy"]);
});

test("Aura di Purezza esclude il caster mentre applica la pill buff all'alleato", () => {
  const area = { cells: [{ x: 0, y: 0, width: 300, height: 300 }] };
  const caster = token("caster", { attitude: "pc" });
  const ally = token("ally", { attitude: "ally" });

  const rule = getSpellAreaRuleById("phb2014-aura-di-purezza:cast");
  const candidates = [
    { item: caster, bounds: bounds(0, 0) },
    { item: ally, bounds: bounds(100, 0) },
  ];
  assert.deepEqual(areaMembershipTargetIds({
    sourceId: "caster",
    rule,
    area,
    metaKey: META,
    candidates,
  }), ["ally"]);

  const additions = areaMembershipPlan({
    instanceId: "purity-instance",
    sourceId: "caster",
    rule,
    desiredTargetIds: ["ally"],
    items: candidates.map(({ item }) => item),
    metaKey: META,
  }).operations.filter((operation) => operation.type === "condition:add");
  assert.deepEqual(additions.map((operation) => operation.targetIds), [["ally"]]);
  assert.equal(additions[0].conditionName, rule.effectPolicy.effect.label);
});

test("Aura di Vita include caster e alleati, ma esclude i bersagli ostili", () => {
  const rule = getSpellAreaRuleById("phb2014-aura-di-vita:cast");
  const area = { cells: [{ x: 0, y: 0, width: 300, height: 300 }] };
  const candidates = [
    { item: token("caster", { attitude: "pc" }), bounds: bounds(0, 0) },
    { item: token("ally", { attitude: "ally" }), bounds: bounds(100, 0) },
    { item: token("enemy", { attitude: "enemy" }), bounds: bounds(200, 0) },
  ];

  assert.equal(rule.targeting.includeCaster, true);
  assert.equal(rule.targeting.filter, "non-hostile");
  assert.deepEqual(areaMembershipTargetIds({
    sourceId: "caster",
    rule,
    area,
    metaKey: META,
    candidates,
  }), ["caster", "ally"]);

  const additions = areaMembershipPlan({
    instanceId: "life-instance",
    sourceId: "caster",
    rule,
    desiredTargetIds: ["caster", "ally"],
    items: candidates.map(({ item }) => item),
    metaKey: META,
  }).operations.filter((operation) => operation.type === "condition:add");
  assert.deepEqual(additions.map((operation) => operation.targetIds), [["caster", "ally"]]);
  assert.equal(additions[0].conditionName, rule.effectPolicy.effect.label);
});

test("Aura di Vitalità include ogni creatura corrente, caster compreso", () => {
  const rule = getSpellAreaRuleById("phb2014-aura-di-vitalita:cast");
  const area = { cells: [{ x: 0, y: 0, width: 300, height: 300 }] };
  const candidates = [
    { item: token("caster", { attitude: "pc" }), bounds: bounds(0, 0) },
    { item: token("ally", { attitude: "ally" }), bounds: bounds(100, 0) },
    { item: token("enemy", { attitude: "enemy" }), bounds: bounds(200, 0) },
  ];

  assert.equal(rule.targeting.includeCaster, true);
  assert.deepEqual(areaMembershipTargetIds({
    sourceId: "caster",
    rule,
    area,
    metaKey: META,
    candidates,
  }), ["caster", "ally", "enemy"]);
});

test("il caster nell'area resta incluso anche nella membership persistente", () => {
  const rule = getSpellAreaRuleById("web:cast");
  const caster = token("caster", { attitude: "pc" });
  const area = { cells: [{ x: 0, y: 0, width: 200, height: 200 }] };
  assert.equal(rule.targeting.includeCaster, true);
  assert.equal(rule.zonePolicy.membershipTargeting.includeCaster, true);
  assert.deepEqual(areaMembershipTargetIds({
    sourceId: "caster",
    rule,
    area,
    metaKey: META,
    candidates: [{ item: caster, bounds: bounds(0, 0) }],
  }), ["caster"]);
});

test("Sfera Infuocata estende la membership alla corona di una casella", () => {
  const rule = getSpellAreaRuleById("flaming-sphere:cast");
  const area = { cells: [{ x: 0, y: 0, width: 100, height: 100 }] };
  const candidates = [
    { item: token("direct"), bounds: bounds(0, 0) },
    { item: token("adjacent"), bounds: bounds(100, 0) },
    { item: token("diagonal"), bounds: bounds(100, 100) },
    { item: token("outside"), bounds: bounds(200, 0) },
  ];

  assert.equal(rule.zonePolicy.membershipPaddingSquares, 1);
  assert.deepEqual(areaMembershipTargetIds({
    sourceId: "caster",
    rule,
    area,
    metaKey: META,
    candidates,
  }), ["direct", "adjacent", "diagonal"]);
  assert.deepEqual(areaMembershipTargetIds({
    sourceId: "caster",
    rule,
    area,
    metaKey: META,
    candidates,
    membershipPaddingSquares: 0,
  }), ["direct"]);
});

test("Gabbia di forza non duplica una pillola tecnica sui token", () => {
  const rule = getSpellAreaRuleById("forcecage:cast");
  const area = { cells: [{ x: 0, y: 0, width: 600, height: 600 }] };
  const candidates = [
    { item: token("inside"), bounds: bounds(150, 150) },
    { item: token("edge"), bounds: bounds(550, 150) },
  ];

  assert.equal(rule.zonePolicy.membershipTargeting.containment, "fully-inside");
  assert.deepEqual(areaMembershipEffects(rule), []);
  assert.deepEqual(areaMembershipTargetIds({
    sourceId: "caster",
    rule,
    area,
    metaKey: META,
    candidates,
  }), ["inside"]);
  assert.deepEqual(areaMembershipPlan({
    instanceId: "forcecage-instance",
    sourceId: "caster",
    rule,
    desiredTargetIds: ["inside"],
    items: candidates.map(({ item }) => item),
    metaKey: META,
  }).operations, []);
});

test("entrata e uscita applicano e rimuovono il terreno difficile della zona", () => {
  const rule = getSpellAreaRuleById("web:cast");
  const items = [
    token("leaving", {
      conditions: [{
        id: "old-condition",
        condition: "Terreno difficile / Ragnatela",
        parentEffectId: "spell-1",
        effectId: "web-difficult-terrain",
        effectKind: "debuff",
      }],
    }),
    token("unrelated", {
      conditions: [{
        id: "other-condition",
        condition: "Terreno difficile / Ragnatela",
        parentEffectId: "spell-2",
        effectId: "web-difficult-terrain",
        effectKind: "debuff",
      }],
    }),
  ];

  const plan = areaMembershipPlan({
    instanceId: "spell-1",
    sourceId: "caster",
    rule,
    desiredTargetIds: ["entering"],
    items,
    metaKey: META,
    sourceName: "Omar",
  });

  assert.deepEqual(plan.entering, ["entering"]);
  assert.deepEqual(plan.leaving, ["leaving"]);
  assert.deepEqual(plan.operations[0].removals, [{
    itemId: "leaving",
    instanceId: "old-condition",
  }]);
  assert.equal(plan.operations[1].conditionName, "Terreno difficile / Ragnatela");
  assert.equal(plan.operations[1].options.parentEffectId, "spell-1");
  assert.equal(plan.operations[1].options.mechanics.movement.costMultiplier, 2);
  assert.deepEqual(plan.operations[1].options.expiry, { mode: "manual" });
});

test("Ragnatela rimuove la condition linked quando il bersaglio esce dalla zona", () => {
  const rule = getSpellAreaRuleById("web:cast");
  const items = [
    token("leaving", {
      conditions: [{
        id: "restrained-condition",
        condition: "Trattenuto",
        parentEffectId: "web-instance",
        effectId: "web-save-on-turn-start",
      }],
    }),
  ];

  const plan = areaMembershipPlan({
    instanceId: "web-instance",
    sourceId: "caster",
    rule,
    desiredTargetIds: [],
    items,
    metaKey: META,
    removeLinkedTriggerConditions: true,
  });

  assert.deepEqual(
    plan.operations,
    [{
      type: "condition:remove-instances",
      removals: [{ itemId: "leaving", instanceId: "restrained-condition" }],
    }],
  );
});

test("Folata di vento persiste sourceId, istanza e zona nel modificatore direzionale", () => {
  const plan = areaMembershipPlan({
    instanceId: "gust-instance",
    sourceId: "caster",
    zoneId: "gust-zone",
    rule: getSpellAreaRuleById("gust-of-wind:cast"),
    desiredTargetIds: ["target"],
    items: [],
    metaKey: META,
  });
  const directional = plan.operations[0].options.mechanics.movement.directional;
  assert.deepEqual(directional, [{
    direction: "toward-source",
    costMultiplier: 2,
    label: "Folata di vento: movimento verso il caster ×2",
    sourceId: "caster",
    instanceId: "gust-instance",
    zoneId: "gust-zone",
  }]);
});

test("Controllare Venti espone una pill sintetica per modalità e la rimuove quando i venti sono sospesi", () => {
  const rule = getSpellAreaRuleById("xanathar-controllare-venti:cast");
  const labels = ["gusts", "downdraft", "updraft"].map((choice) => {
    const effect = areaMembershipEffects(rule, choice)[0];
    assert.ok(effect);
    assert.ok(effect.label.split(" / ").every((segment) => /^\p{Lu}/u.test(segment)));
    return effect.label;
  });
  assert.deepEqual(labels, [
    "Folate / Svantaggio a distanza / Controvento ×2",
    "Discendente / Svantaggio a distanza / TS Forza se vola",
    "Ascendente / Caduta dimezzata / Salto in alto +3 m",
  ]);

  const plan = areaMembershipPlan({
    instanceId: "winds-instance",
    sourceId: "caster",
    rule,
    ruleChoice: "downdraft",
    desiredTargetIds: ["target"],
    items: [],
    metaKey: META,
  });
  assert.equal(plan.operations[0].conditionName, labels[1]);
  assert.equal(plan.operations[0].options.effectId, "control-winds-membership");

  const switched = areaMembershipPlan({
    instanceId: "winds-instance",
    sourceId: "caster",
    rule,
    ruleChoice: "gusts",
    desiredTargetIds: ["target"],
    items: [token("target", {
      conditions: [{
        id: "winds-condition",
        condition: labels[1],
        parentEffectId: "winds-instance",
        effectId: "control-winds-membership",
        effectKind: "debuff",
      }],
    })],
    metaKey: META,
  });
  assert.deepEqual(switched.operations[0], {
    type: "condition:remove-instances",
    removals: [{ itemId: "target", instanceId: "winds-condition" }],
  });
  assert.equal(switched.operations[1].conditionName, labels[0]);

  const paused = areaMembershipPlan({
    instanceId: "winds-instance",
    sourceId: "caster",
    rule,
    ruleChoice: "paused",
    desiredTargetIds: [],
    items: [token("target", {
      conditions: [{
        id: "winds-condition",
        condition: labels[1],
        parentEffectId: "winds-instance",
        effectId: "control-winds-membership",
        effectKind: "debuff",
      }],
    })],
    metaKey: META,
  });
  assert.deepEqual(paused.operations, [{
    type: "condition:remove-instances",
    removals: [{ itemId: "target", instanceId: "winds-condition" }],
  }]);
});

test("gli effetti passivi sono dichiarativi e il cleanup rispetta le istanze attive", () => {
  const web = getSpellAreaRuleById("web:cast");
  assert.deepEqual(
    areaMembershipEffects(web).map((effect) => effect.id),
    ["web-difficult-terrain"],
  );
  const items = [
    token("active", { conditions: [{
      id: "active-condition",
      parentEffectId: "spell-active",
      effectId: "web-difficult-terrain",
    }] }),
    token("stale", { conditions: [{
      id: "stale-condition",
      parentEffectId: "spell-ended",
      effectId: "entangle-difficult-terrain",
    }] }),
  ];
  assert.deepEqual(staleAreaMembershipEffectRemovals(items, {
    activeInstanceIds: ["spell-active"],
    effectIds: ["web-difficult-terrain", "entangle-difficult-terrain"],
    metaKey: META,
  }), [{ itemId: "stale", instanceId: "stale-condition" }]);
});

test("una zona semantica applica una condizione reale senza marcarla come debuff", () => {
  const plan = areaMembershipPlan({
    instanceId: "spell-darkness",
    sourceId: "caster",
    rule: getSpellAreaRuleById("darkness:cast"),
    desiredTargetIds: ["target"],
    items: [],
    metaKey: META,
    sourceName: "Omar",
  });

  assert.equal(plan.operations[0].conditionName, "Accecato");
  assert.equal(plan.operations[0].options.effectId, "darkness-obscured");
  assert.equal(plan.operations[0].options.parentEffectId, "spell-darkness");
  assert.equal("effectKind" in plan.operations[0].options, false);
});

test("Vento di Interdizione applica insieme Assordato e terreno difficile", () => {
  const rule = getSpellAreaRuleById("xanathar-vento-di-interdizione:cast");
  assert.deepEqual(
    areaMembershipEffects(rule).map((effect) => effect.id),
    [
      "warding-wind-deafened",
      "warding-wind-difficult-terrain",
    ],
  );

  const plan = areaMembershipPlan({
    instanceId: "warding-wind-instance",
    sourceId: "caster",
    rule,
    desiredTargetIds: ["target"],
    items: [],
    metaKey: META,
    sourceName: "Lavera",
  });
  const additions = plan.operations.filter(
    (operation) => operation.type === "condition:add"
  );
  assert.equal(additions.length, 2);
  assert.equal(additions[0].conditionName, "Assordato");
  assert.equal(
    additions[1].options.mechanics.movement.costMultiplier,
    2,
  );
});

test("la riconciliazione migra una vecchia label generica alla condizione reale", () => {
  const plan = areaMembershipPlan({
    instanceId: "spell-darkness",
    sourceId: "caster",
    rule: getSpellAreaRuleById("darkness:cast"),
    desiredTargetIds: ["target"],
    items: [token("target", {
      conditions: [{
        id: "legacy-darkness",
        condition: "Oscurità magica",
        parentEffectId: "spell-darkness",
        effectId: "darkness-obscured",
        effectKind: "debuff",
      }],
    })],
    metaKey: META,
  });

  assert.deepEqual(plan.operations[0].removals, [{
    itemId: "target",
    instanceId: "legacy-darkness",
  }]);
  assert.equal(plan.operations[1].conditionName, "Accecato");
});

test("SP-B04A — la membership di Unto espone Terreno difficile come pill standard", () => {
  const rule = getSpellAreaRuleById("grease:cast");
  const plan = areaMembershipPlan({
    instanceId: "grease-instance",
    sourceId: "caster",
    zoneId: "grease-zone",
    rule,
    desiredTargetIds: ["target"],
    items: [],
    metaKey: META,
    sourceName: "Caster",
  });
  const addition = plan.operations.find((operation) => operation.type === "condition:add");

  assert.equal(addition.conditionName, "Terreno difficile / Unto");
  assert.equal(addition.options.effectId, "grease-difficult-terrain");
  assert.equal("effectKind" in addition.options, false);
  assert.equal(addition.options.mechanics.movement.costMultiplier, 2);
});
