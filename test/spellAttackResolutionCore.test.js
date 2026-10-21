import assert from "node:assert/strict";
import test from "node:test";
import { getSpellAttackResolution, getSpellDefinition } from "../src/spells-srd.js";

test("only Acid Arrow gets the delayed acid damage; other attack spells keep their own hit effect", () => {
  const acid = getSpellAttackResolution(getSpellDefinition("acid-arrow"), "hit", { slotLevel: 2 });
  assert.equal(acid.deferredEffect.id, "acid-arrow-delayed-acid");
  assert.equal(acid.effect.id, "acid-arrow-delayed-acid");
  for (const id of ["chill-touch", "ray-of-frost", "guiding-bolt"]) {
    const hit = getSpellAttackResolution(getSpellDefinition(id), "hit", { slotLevel: 1 });
    assert.equal(hit.deferredEffect, undefined, id);
    assert.notEqual(hit.effect?.id, "acid-arrow-delayed-acid", id);
    assert.doesNotMatch(JSON.stringify(hit), /Freccia acida/u, id);
  }
  assert.equal(getSpellAttackResolution(getSpellDefinition("chill-touch"), "hit").effect.id, "healing-blocked");
  assert.equal(getSpellAttackResolution(getSpellDefinition("chill-touch"), "miss").effect, undefined);
});

test("a hit with Chill Touch or Ray of Frost adds its pill once, with the spell's expiry", async () => {
  const { buildSpellApplicationIntent, buildSpellApplicationPlan } = await import("../src/spellApplicationPlanCore.js");
  for (const [id, label] of [["chill-touch", "Niente recupero PF"], ["ray-of-frost", "Velocità −3 m"]]) {
    const intent = buildSpellApplicationIntent({ spell: getSpellDefinition(id), casterId: "caster", targetIds: ["target"], selectedChoice: "hit",
      attackOutcome: "hit", castContext: { slotLevel: 0 } });
    const plan = buildSpellApplicationPlan({ intent, instanceId: `${id}-1`, casterName: "Mago" });
    const pills = plan.operations.filter((operation) => operation.type === "condition:add");
    assert.deepEqual(pills.map((operation) => operation.conditionName), [label], id);
    assert.deepEqual(pills[0].options.expiry, { mode: "turn-start", actor: "source", remaining: 1, anchor: "next-turn" }, id);
  }
  const frost = getSpellDefinition("ray-of-frost").effects[0];
  assert.deepEqual(frost.mechanics.movement, { addMeters: -3, appliesTo: ["walk"], label: "Raggio di gelo (−3 m)" });
});
