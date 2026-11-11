// D3 of the study of 6/11 on the two points left out of the popups' audit: every spell attack of the popup offers Critico,
// as the PC attack console does, and shows the critical's dice as the console says them. The number stays the GM's, with
// the dice doubled; a critical on a PC at 0 HP gives two death save failures (test/arcaneHandAttackLog.test.js).
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { SPELL_ACTIVE_RESOLUTION_ACTIONS } from "../src/spellActiveResolutionRules.js";
import { spellActiveResolutionCriticalFormula, spellActiveResolutionDamageFormula } from "../src/spellActiveResolutionCore.js";
import { pcAttackCriticalDice } from "../src/pcAttackRiderCatalog.js";

const actions = Object.values(SPELL_ACTIVE_RESOLUTION_ACTIONS).flat();
const action = (id) => actions.find((entry) => entry.id === id);

test("every single attack of the popup offers Critico, as the PC attack console", () => {
  const attacks = actions.filter((entry) => entry.resolutionKind === "single-attack");
  // 8 with the Faithful Hound's bite (CAP-ORIGIN, lotto O2).
  assert.equal(attacks.length, 8);
  for (const entry of attacks) {
    assert.ok(entry.attack.outcomes.includes("critical"), `${entry.id} senza Critico`);
    assert.ok(entry.attack.outcomes.includes("hit") && entry.attack.outcomes.includes("miss"), entry.id);
  }
});

test("the critical's dice: every die twice, with the slot's dice; Blade of Disaster says its own", () => {
  const critical = (id, slotLevel) => spellActiveResolutionCriticalFormula({ action: action(id), slotLevel });
  assert.equal(critical("crown-of-stars-launch", 7), "8d12");
  assert.equal(critical("wall-of-light-beam", 5), "8d8");
  assert.equal(critical("wall-of-light-beam", 6), "10d8");
  assert.equal(critical("arcane-sword-attack", 7), "6d10");
  assert.equal(critical("spiritual-weapon-attack", 2), "2d8");
  assert.equal(critical("spiritual-weapon-attack", 4), "4d8");
  assert.equal(critical("storm-sphere-lightning", 4), "8d6");
  assert.equal(critical("storm-sphere-lightning", 6), "12d6");
  assert.equal(critical("arcane-hand-clenched", 5), "8d8");
  assert.equal(critical("arcane-hand-clenched", 6), "12d8");
  assert.equal(critical("blade-of-disaster-attacks", 9), "12d12");
  // The same doubling as the console's.
  for (const [id, slotLevel] of [["crown-of-stars-launch", 7], ["storm-sphere-lightning", 6], ["arcane-hand-clenched", 6]]) {
    const hit = spellActiveResolutionDamageFormula({ action: action(id), slotLevel, outcome: "hit" }).scaledFormula;
    assert.equal(critical(id, slotLevel), pcAttackCriticalDice(hit), id);
  }
});

test("the popup writes the critical's dice beside the damage, for one attack and for several", () => {
  const source = readFileSync(new URL("../src/spell-active-resolution.js", import.meta.url), "utf8");
  assert.match(source, /function attackDiceText\(outcome\) \{/);
  assert.match(source, /return `\$\{dice\} · critico \$\{spellActiveResolutionCriticalFormula\(/);
  assert.match(source, /payload\?\.action\?\.resolutionKind === "single-attack" \? attackDiceText\(attackOutcome\) : damageDice/);
  assert.match(source, /renderAmountLabel\(damageLabel, payload\?\.action\?\.damage\?\.type, attackDiceText\(entry\.attackOutcome\)\)/);
});

test("a critical is a hit for the effects on a hit, with one attack as with several", () => {
  const source = readFileSync(new URL("../src/spellApplicationExecutor.js", import.meta.url), "utf8");
  assert.match(source, /\.filter\(\(entry\) => \["hit", "critical"\]\.includes\(entry\.attackOutcome\)\)/);
  assert.match(source, /: \["hit", "critical"\]\.includes\(attackOutcome\) && action\?\.resolutionKind === "single-attack"/);
});
