// Attacchi dei mostri, fase 5, lotto 0: il lettore ad euristica delle azioni dei mostri. Regole sulle formule fisse del
// Manuale dei Mostri 2014, mai sul nome di un mostro; con o senza i tag di 5eTools.
import assert from "node:assert/strict";
import test from "node:test";
import { monsterActionAreaOrigin, monsterActionConditions, monsterActionDuration, monsterActionImmunityHours, monsterActionPlainText,
  monsterActionRepeat, monsterHitEffects, monsterSaveEffects } from "../src/monsterActionHeuristicsCore.js";

test("il testo in chiaro: i tag di 5eTools come li stampa il libro", () => {
  assert.equal(monsterActionPlainText("a {@dc 13} Constitution saving throw or be {@condition poisoned} for 1 minute"),
    "a DC 13 Constitution saving throw or be poisoned for 1 minute");
  assert.equal(monsterActionPlainText("{@atk mw} {@hit 5} to hit. {@h}7 ({@damage 1d10 + 2}) piercing damage."), "mw +5 to hit. Hit: 7 (1d10 + 2) piercing damage.");
});

test("le condizioni di un fallimento: una o più, mai quelle solo nominate", () => {
  assert.deepEqual(monsterActionConditions("must succeed on a DC 15 Wisdom saving throw or be frightened for 1 minute"), ["frightened"]);
  assert.deepEqual(monsterActionConditions("or become poisoned and paralyzed"), ["poisoned", "paralyzed"]);
  assert.deepEqual(monsterActionConditions("or be knocked prone"), ["prone"]);
  assert.deepEqual(monsterActionConditions("or fall unconscious"), ["unconscious"]);
  assert.deepEqual(monsterActionConditions("or be magically charmed"), ["charmed"]);
  assert.deepEqual(monsterActionConditions("or be {@condition restrained}"), ["restrained"], "with 5eTools' tags too");
  assert.deepEqual(monsterActionConditions("The target can't be charmed while it is invisible."), []);
});

test("durata, tiro ripetuto, immunità di 24 ore", () => {
  assert.deepEqual(monsterActionDuration("frightened for 1 minute"), { rounds: 10 });
  assert.deepEqual(monsterActionDuration("stunned for 1 round"), { rounds: 1 });
  assert.deepEqual(monsterActionDuration("charmed for 1 hour"), { rounds: 600 });
  assert.deepEqual(monsterActionDuration("restrained until the end of its next turn"), { until: "turn-end", anchor: "target" });
  assert.deepEqual(monsterActionDuration("blinded until the end of the dragon's next turn"), { until: "turn-end", anchor: "source" });
  assert.equal(monsterActionDuration("frightened"), null);
  assert.deepEqual(monsterActionRepeat("The target can repeat the saving throw at the end of each of its turns, ending the effect on itself on a success."),
    { timing: "turn-end", ends: true });
  assert.deepEqual(monsterActionRepeat("A creature must repeat the saving throw at the start of each of its turns."), { timing: "turn-start", ends: false });
  assert.equal(monsterActionImmunityHours("the creature is immune to the dragon's Frightful Presence for the next 24 hours"), 24);
  assert.equal(monsterActionImmunityHours("immune to fire"), null);
});

test("un'azione a tiro salvezza: condizioni, durata e ripetizione lette insieme; danni che finiscono il sonno", () => {
  const presence = monsterSaveEffects("Each creature of the dragon's choice that is within 120 feet of the dragon must succeed on a DC 19 Wisdom saving throw "
    + "or become frightened for 1 minute. A creature can repeat the saving throw at the end of each of its turns, ending the effect on itself on a success. "
    + "If a creature's saving throw is successful or the effect ends for it, the creature is immune to the dragon's Frightful Presence for the next 24 hours.");
  assert.deepEqual(presence, { conditions: ["frightened"], duration: { rounds: 10 }, repeat: { timing: "turn-end", ends: true }, immuneHours: 24, endsOnDamage: false });
  const sleep = monsterSaveEffects("Each creature in that area must succeed on a DC 18 Constitution saving throw or fall unconscious for 10 minutes. "
    + "This effect ends for a creature if the creature takes damage or someone uses an action to wake it.");
  assert.deepEqual([sleep.conditions, sleep.duration, sleep.endsOnDamage], [["unconscious"], { rounds: 100 }, true]);
  // A damage only action: no condition, no duration.
  assert.deepEqual(monsterSaveEffects("must make a DC 21 Dexterity saving throw, taking 63 (18d6) fire damage on a failed save, or half as much damage on a successful one.").conditions, []);
});

test("l'area: dal mostro (soffio, «within N feet of», cubo) o su un punto; «of its choice»", () => {
  assert.deepEqual(monsterActionAreaOrigin("The dragon exhales fire in a 60-foot cone.", "cone"), { origin: "self", choice: false });
  assert.deepEqual(monsterActionAreaOrigin("Each creature of its choice within 30 feet of it", "sphere"), { origin: "self", choice: true });
  assert.deepEqual(monsterActionAreaOrigin("a 20-foot-radius sphere centered on a point it can see within 120 feet", "sphere"), { origin: "point", choice: false });
  assert.deepEqual(monsterActionAreaOrigin("something happens in an area", "sphere"), { origin: null, choice: false });
});

test("gli effetti al colpo: tiro salvezza secondario, afferrato con la CD di fuga, prono, spinta", () => {
  assert.deepEqual(monsterHitEffects("Hit: 7 (1d10 + 2) piercing damage, and the target must succeed on a DC 11 Constitution saving throw or be poisoned for 1 minute. "
    + "The target can repeat the saving throw at the end of each of its turns, ending the effect on itself on a success."),
  { save: { ability: "con", dc: 11, half: false, conditions: ["poisoned"], duration: { rounds: 10 }, repeat: { timing: "turn-end", ends: true } } });
  assert.deepEqual(monsterHitEffects("Hit: 7 (1d8 + 3) piercing damage, and the target must make a DC 11 Constitution saving throw, taking 9 (2d8) poison damage "
    + "on a failed save, or half as much damage on a successful one."), { save: { ability: "con", dc: 11, half: true, damage: [{ type: "poison", formula: "2d8" }] } });
  assert.deepEqual(monsterHitEffects("Hit: 15 (2d10 + 4) bludgeoning damage, and the target is grappled (escape DC 16). Until this grapple ends, the target is restrained."),
    { grapple: { escapeDC: 16, conditions: ["restrained"] } });
  assert.deepEqual(monsterHitEffects("Hit: 10 (2d6 + 3) bludgeoning damage. If the target is a creature, it must succeed on a DC 15 Strength saving throw or be knocked prone."),
    { save: { ability: "str", dc: 15, half: false, conditions: ["prone"] } });
  assert.deepEqual(monsterHitEffects("Hit: 12 (2d8 + 3) bludgeoning damage, and the target is pushed up to 10 feet away."), { pushFeet: 10 });
  assert.deepEqual(monsterHitEffects("Hit: 5 (1d6 + 2) slashing damage."), {});
});
