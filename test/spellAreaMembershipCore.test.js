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

test("il filtro membership può includere il caster escluso dal TS iniziale", () => {
  const rule = getSpellAreaRuleById("web:cast");
  const caster = token("caster", { attitude: "pc" });
  const area = { cells: [{ x: 0, y: 0, width: 200, height: 200 }] };
  assert.equal(rule.targeting.includeCaster, false);
  assert.equal(rule.zonePolicy.membershipTargeting.includeCaster, true);
  assert.deepEqual(areaMembershipTargetIds({
    sourceId: "caster",
    rule,
    area,
    metaKey: META,
    candidates: [{ item: caster, bounds: bounds(0, 0) }],
  }), ["caster"]);
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
