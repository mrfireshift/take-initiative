import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildSpellCausality,
  normalizeCombatLogCausality,
  COMBAT_LOG_CAUSALITY_EVENT_TYPES,
} from "../src/combatLogCausalityCore.js";

test("il core causale è puro e non importa runtime", () => {
  const source = readFileSync(new URL("../src/combatLogCausalityCore.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /@owlbear-rodeo|document\.|window\.|indexedDB/i);
  assert.deepEqual(COMBAT_LOG_CAUSALITY_EVENT_TYPES.slice(0, 7), [
    "application/cast",
    "prepare",
    "resolution",
    "active-action",
    "area/save-resolution",
    "reminder-resolution",
    "zone-move",
  ]);
});

test("la causalità v1 normalizza application, caster, target e concentrazione", () => {
  const input = {
    eventType: "application/cast",
    spell: { id: "fireball", displayName: "Palla di fuoco" },
    instanceId: "spell-instance-1",
    castContext: { phase: "cast", slotLevel: 3 },
    casterId: "caster-1",
    casterName: "Arannis",
    targetIds: ["target-2", "target-1"],
    targetNames: { "target-1": "Goblin", "target-2": "Ogre" },
    concentrationAction: "replace",
  };
  const before = JSON.stringify(input);
  const causality = buildSpellCausality(input);
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(causality.cause, {
    kind: "spell",
    spellId: "fireball",
    spellName: "Palla di fuoco",
    instanceId: "spell-instance-1",
    slotLevel: 3,
  });
  assert.deepEqual(causality.actor, { id: "caster-1", name: "Arannis", role: "caster" });
  assert.deepEqual(causality.targets.map((target) => target.name), ["Ogre", "Goblin"]);
  assert.deepEqual(causality.concentration, { action: "start", instanceId: "spell-instance-1" });
});

test("object map degli outcome e attacco mantengono ordine e distinzione danno/HP", () => {
  const causality = buildSpellCausality({
    eventType: "resolution",
    spellId: "ray-of-frost",
    spellName: "Raggio rovente",
    instanceId: "spell-2",
    casterId: "caster-1",
    casterName: "Arannis",
    targetIds: ["ogre", "goblin"],
    targetNames: { ogre: "Ogre", goblin: "Goblin" },
    outcomes: { goblin: "miss", ogre: "hit" },
    attacks: [{ targetId: "ogre", attackOutcome: "hit", damageRoll: 12 }],
    action: { id: "ray", label: "Attiva", resolutionKind: "single-attack" },
    damageRoll: 12,
    targets: [{ id: "ogre", requestedDamage: 12, appliedHpDelta: -8, damageFactor: 1 }],
  });
  assert.deepEqual(causality.targets, [
    { id: "ogre", name: "Ogre", outcome: "hit", requestedDamage: 12, appliedHpDelta: -8, damageFactor: 1 },
    { id: "goblin", name: "Goblin", outcome: "miss" },
  ]);
  assert.equal(causality.action.damageRoll, 12);
  assert.equal(causality.targets[0].appliedHpDelta, -8);
  assert.equal(causality.targets[0].requestedDamage, 12);
});

test("area, reminder e zone usano solo i campi espliciti", () => {
  const area = buildSpellCausality({
    eventType: "area/save-resolution",
    spellId: "fireball",
    spellName: "Palla di fuoco",
    instanceId: "area-1",
    casterId: "caster-1",
    targetIds: ["goblin", "immune"],
    targetNames: { goblin: "Goblin", immune: "Immune" },
    outcomes: { goblin: "failed", immune: "immune" },
    targets: [
      { id: "goblin", requestedDamage: 28, appliedHpDelta: -14, damageFactor: 0.5 },
      { id: "immune", requestedDamage: 0, appliedHpDelta: 0, damageFactor: 0 },
    ],
    damageRoll: 28,
    zone: { action: "resolve", zoneItemId: "zone-1", ruleId: "fireball:cast" },
  });
  assert.equal(area.targets[0].outcome, "failed");
  assert.deepEqual(area.zone, { action: "resolve", zoneItemId: "zone-1", ruleId: "fireball:cast" });

  const reminder = buildSpellCausality({
    eventType: "reminder-resolution",
    spellName: "Sfera della tempesta",
    instanceId: "spell-3",
    sourceId: "caster-1",
    sourceName: "Arannis",
    targetIds: ["goblin"],
    targets: [{ id: "goblin", name: "Goblin", outcome: "failed", requestedDamage: 10, appliedHpDelta: -5, damageFactor: "half" }],
    damageRoll: 10,
    activationId: "activation-1",
  });
  assert.equal(reminder.actor.role, "source");
  assert.equal(reminder.targets[0].damageFactor, 0.5);
  assert.deepEqual(reminder.reminder, { activationId: "activation-1" });

  const zone = buildSpellCausality({
    eventType: "zone-reorient",
    spellId: "wind-wall",
    zoneItemId: "zone-2",
    ruleId: "wind-wall:line",
    movementChoice: "clockwise",
    turn: { id: "active-turn", name: "Arannis" },
  });
  assert.equal(zone.actor, undefined);
  assert.equal(zone.zone.movementChoice, "clockwise");
  assert.equal(JSON.stringify(zone).includes("active-turn"), false);
});

test("normalizzazione JSON-safe, deterministica e tollerante ai cicli", () => {
  const cyclic = { eventType: "resolution", spellId: "x" };
  cyclic.self = cyclic;
  const normalized = normalizeCombatLogCausality(cyclic);
  assert.doesNotThrow(() => JSON.stringify(normalized));
  assert.deepEqual(
    buildSpellCausality({ eventType: "resolution", outcomes: { b: "passed", a: "failed" }, targetIds: ["a", "b"] }),
    buildSpellCausality({ eventType: "resolution", outcomes: { a: "failed", b: "passed" }, targetIds: ["a", "b"] }),
  );
  assert.equal(normalized.version, 1);
  assert.equal(normalized.domain, "spell");
});
