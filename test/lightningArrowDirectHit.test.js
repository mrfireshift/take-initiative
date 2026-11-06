// D1 and D2 of the study of 6/11 on the two points left out of the popups' audit: Lightning Arrow's own hit in its popup.
// PHB 2014: instead of the weapon's damage, 4d8 lightning on a hit and half as much on a miss, 1d8 more for each slot
// level above 3rd; a critical hit doubles those dice. Hit or miss, the creatures within 3 m of the target make a Dexterity
// save against 2d8. The popup asks the hit's outcome and roll (both required), counts the half and the target's defense,
// and writes the hit with the burst in one command: one Undo.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reset, cleanup, meta, token, sdk, history } from "../test-support/sharedHpHarness.js";

const {
  buildSpellActiveResolutionPayload,
  getSpellResolutionAction,
  resolveSpellActiveResolutionDirectHitDamage,
  spellActiveResolutionDirectHitFormula,
  spellActiveResolutionPopoverHeight,
} = await import("../src/spellActiveResolutionCore.js");
const { executeSpellActiveResolution } = await import("../src/spellApplicationExecutor.js");
const { currentSceneEpoch } = await import("../src/sceneEpoch.js");

const SPELL = { id: "phb2014-freccia-folgorante", name: "Freccia Folgorante", level: 3 };
const SPELLS_KEY = "com.thebigpicture.initiative/spells";
const action = getSpellResolutionAction(SPELL.id, "lightning-arrow-area");

test.after(cleanup);

test("the rule: the arrow's hit on the burst's target, with its outcomes, its dice and the half on a miss", () => {
  assert.equal(action.buttonLabel, "Risolvi freccia");
  assert.equal(action.excludeAnchorTarget, true, "the burst spares the arrow's target");
  assert.deepEqual(action.directHit.outcomes, ["hit", "critical", "miss"]);
  assert.equal(action.directHit.onMiss, "half");
  assert.deepEqual(action.directHit.damage, { formula: "4d8", type: "fulmine", onSave: "none", baseSlot: 3, additionalPerSlotAbove: 1 });
  assert.equal(action.damage.formula, "2d8", "the burst keeps its own dice");
  assert.deepEqual(
    spellActiveResolutionDirectHitFormula({ action, slotLevel: 3 }),
    { formula: "4d8", scaledFormula: "4d8", criticalFormula: "8d8" },
  );
  assert.deepEqual(
    spellActiveResolutionDirectHitFormula({ action, slotLevel: 5 }),
    { formula: "4d8", scaledFormula: "6d8", criticalFormula: "12d8" },
  );
});

test("the hit's sum: all of it on a hit or a critical, half on a miss, then the defense", () => {
  const amount = (outcome, roll, defense = null) => resolveSpellActiveResolutionDirectHitDamage({ action, slotLevel: 3, outcome, roll, defense });
  assert.equal(amount("hit", 18).amount, 18);
  assert.equal(amount("critical", 36).amount, 36);
  assert.equal(amount("miss", 18).amount, 9);
  assert.equal(amount("miss", 17).amount, 8);
  assert.equal(amount("hit", 18, "resistance").amount, 9);
  assert.equal(amount("miss", 18, "resistance").amount, 4, "the half first, the defense after it");
  assert.equal(amount("hit", 18, "immunity").amount, 0);
  assert.equal(amount("hit", 18, "vulnerability").amount, 36);
  assert.equal(amount("hit", 0).amount, 0);
  assert.equal(amount("hit", "").valid, false, "an empty roll is no roll");
  assert.equal(amount("", 18).valid, false);
  assert.equal(amount("passed", 18).valid, false);
});

test("the arrow and the thorns are resolved with the attack they ride: no action of their own, no Azione bonus on the popup", () => {
  assert.equal(action.economy, "gm");
  assert.equal(getSpellResolutionAction("phb2014-raffica-di-spine", "hail-of-thorns-area").economy, "gm");
  const source = readFileSync(new URL("../src/spell-active-resolution.js", import.meta.url), "utf8");
  assert.match(source, /value === "gm";/, "a GM command shows no cost on the popup");
});

test("the popup is taller than an area's, for the hit above the burst", () => {
  assert.equal(spellActiveResolutionPopoverHeight({ action }), 560);
  assert.equal(spellActiveResolutionPopoverHeight({ action: getSpellResolutionAction("phb2014-raffica-di-spine", "hail-of-thorns-area") }), 450);
});

const bounds = (x) => ({ min: { x, y: 0 }, max: { x: x + 150, y: 150 }, center: { x: x + 75, y: 75 }, width: 150, height: 150 });
const positions = { caster: 0, goblin: 600, orc: 750 };
// The burst on the goblin: 3 m of radius at 150 px for 1.5 m, its cells counted from the goblin's own (as the tool does).
const placement = {
  type: "circle", start: { x: 675, y: 75 }, end: { x: 975, y: 75 }, gridOrigin: { x: 600, y: 0 }, dpi: 150,
  anchorTargetId: "goblin", anchorOrigin: { x: 675, y: 75 }, targetIds: ["orc"],
};

async function scene({ goblin = {}, orc = {} } = {}) {
  await reset([
    token("caster", { attitude: "pc", inInitiative: true,
      [SPELLS_KEY]: [{ instanceId: "arrow-1", spellId: SPELL.id, casterId: "caster", castContext: { slotLevel: 3 } }] }),
    token("goblin", { hp: 30, hpMax: 30, inInitiative: true, ...goblin }),
    token("orc", { hp: 30, hpMax: 30, inInitiative: true, ...orc }),
  ]);
  sdk.scene.grid = { getDpi: async () => 150, getScale: async () => ({ parsed: { multiplier: 1.5, unit: "m" } }) };
  sdk.scene.items.getItemBounds = async (ids) => bounds(positions[Array.isArray(ids) ? ids[0] : ids] ?? 0);
  return buildSpellActiveResolutionPayload({
    spell: SPELL,
    action,
    group: { instanceId: "arrow-1", casterId: "caster", castContext: { slotLevel: 3 } },
    sceneEpoch: 1,
  });
}

const resolve = (payload, directHit, extra = {}) => executeSpellActiveResolution({
  payload,
  placement,
  targetIds: ["orc"],
  outcomes: { orc: "failed" },
  damageRoll: 7,
  directHit,
  ...extra,
});

test("a hit on a target resistant to lightning: 9 to it, the burst's 7 to the creature beside it, one entry", async () => {
  const payload = await scene({ goblin: { initiativeCard: { damageDefenses: { resistances: ["lightning"] } } } });
  await resolve(payload, { targetId: "goblin", attackOutcome: "hit", damageRoll: 18 });
  assert.equal(meta("goblin").hp, 21);
  assert.equal(meta("orc").hp, 23);
  const entries = await history.getHistoryEntries();
  const entry = entries.at(-1);
  assert.equal(entry.label, "Attivazione: Freccia Folgorante · Risolvi freccia → goblin: colpito");
  const changed = entry.changes.map((change) => change.id).sort();
  assert.ok(changed.includes("goblin") && changed.includes("orc"), changed.join(","));
  const target = entry.payload.causality.targets.find((record) => record.id === "goblin");
  assert.equal(target.outcome, "hit");
  assert.equal(target.requestedDamage, 9);
  assert.deepEqual(target.defenses, [{ type: "lightning", defense: "resistance" }]);
  assert.deepEqual(entry.payload.directHit, { targetId: "goblin", attackOutcome: "hit", damageRoll: 18 });
  // One Undo puts both back.
  const undo = await history.undoHistoryThrough(entry.id, { sceneEpoch: currentSceneEpoch() });
  assert.ok(undo, "undo");
  assert.equal(meta("goblin").hp, 30);
  assert.equal(meta("orc").hp, 30);
});

test("a miss: half of the roll, and the defense after the half", async () => {
  const payload = await scene({ goblin: { initiativeCard: { damageDefenses: { resistances: ["lightning"] } } } });
  await resolve(payload, { targetId: "goblin", attackOutcome: "miss", damageRoll: 18 });
  assert.equal(meta("goblin").hp, 26);
  assert.equal(meta("orc").hp, 23, "the burst comes hit or miss");
});

test("a click on the chip ignores the target's defense", async () => {
  const payload = await scene({ goblin: { initiativeCard: { damageDefenses: { resistances: ["lightning"] } } } });
  await resolve(payload, { targetId: "goblin", attackOutcome: "hit", damageRoll: 18 }, { ignoredDefenses: { goblin: ["lightning"] } });
  assert.equal(meta("goblin").hp, 12);
});

test("a critical on a PC at 0 HP: two death save failures, as an attack's critical", async () => {
  const payload = await scene({ goblin: { attitude: "pc", hp: 0 } });
  // 10 and not more: from 30 HP of maximum, 30 at 0 HP would be an instant death, three failures.
  await resolve(payload, { targetId: "goblin", attackOutcome: "critical", damageRoll: 10 });
  assert.equal(meta("goblin").deathSaves?.failures, 2);
});

test("the hit is required, and only on the burst's target", async () => {
  const refused = async (directHit) => {
    const payload = await scene();
    await assert.rejects(resolve(payload, directHit), /Invalid active spell resolution/);
    try { await resolve(await scene(), directHit); } catch (error) { return String(error?.message || error); }
    return "";
  };
  assert.match(await refused(null), /direct-hit-outcome-required/);
  assert.match(await refused({ targetId: "goblin", attackOutcome: "", damageRoll: 18 }), /direct-hit-outcome-required/);
  assert.match(await refused({ targetId: "goblin", attackOutcome: "hit", damageRoll: "" }), /direct-hit-damage-required/);
  assert.match(await refused({ targetId: "orc", attackOutcome: "hit", damageRoll: 18 }), /direct-hit-target-invalid/);
  assert.equal(meta("goblin").hp, 30, "nothing is written");
});

test("the popup sends the hit with the burst, and the main button waits for its outcome and its damage", () => {
  const source = readFileSync(new URL("../src/spell-active-resolution.js", import.meta.url), "utf8");
  assert.match(source, /directHit: directHitAction\(\)\s*\? \{ targetId: currentAnchoredTargetId\(\), attackOutcome: directHitOutcome, damageRoll: directHitRoll\(\) \}/);
  assert.match(source, /if \(!directHitOutcome\) return "Manca l'esito del colpo\.";/);
  assert.match(source, /return directHitRoll\(\) \? "" : "Manca il danno del colpo\.";/);
  assert.match(source, /\|\| !!hitMissing/);
  assert.match(source, /renderSummary\(hitMissing \|\| areaMissing, "Colpo", subjectDamage\(directHitSubject\(\)\)/);
  const page = readFileSync(new URL("../spell-active-resolution.html", import.meta.url), "utf8");
  assert.match(page, /<div id="directHit" class="direct-hit" hidden>/);
  for (const outcome of ["hit", "critical", "miss"]) assert.match(page, new RegExp(`data-direct-hit-outcome="${outcome}"`));
});
