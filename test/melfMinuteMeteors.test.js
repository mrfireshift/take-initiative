// Melf's Minute Meteors (Xanathar) after CAP-MULTIAREA: no several areas to join, since each meteor is an explosion of
// its own; a counter (CAP-RESOURCE) and a bonus action that throws one meteor at a time. The expectations are read
// from the text: six meteors, two more per slot above the 3rd, one or two per use, 2d6 fire within 1,5 m, DEX save.
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: { onReady() {}, scene: { items: { getItems: async () => [] } } },
    buildPath: () => ({}),
    buildLabel: () => ({}),
    buildImage: () => ({}),
    buildText: () => ({}),
    buildShape: () => ({}),
    Command: { MOVE: 0, LINE: 1, CUBIC: 2, CLOSE: 3 },
  },
});

import { ID } from "../src/constants.js";
import { getSpellDefinition } from "../src/spells-srd.js";
import { buildSpellApplicationIntent, buildSpellApplicationPlan } from "../src/spellApplicationPlanCore.js";
import {
  buildSpellActiveResolutionResourceOperations,
  getSpellResolutionAction,
  validateSpellActiveResolutionAction,
} from "../src/spellActiveResolutionCore.js";
import { MELF_METEOR_TURN_PROMPT_ACTION_ID, spellTurnPromptRequests } from "../src/callLightningTurnPromptCore.js";
import { getSpellAreaRuleById } from "../src/spellAreaRules.js";
import { spellSaveDamageFormula } from "../src/spellCastResolutionRules.js";
import { spellPillCounter } from "../src/spellExpiryCore.js";

const SPELL_ID = "xanathar-minuscole-meteore-di-melf";
const META_KEY = `${ID}/meta`;
const SPELLS_KEY = `${ID}/spells`;

function castUpsert(slotLevel) {
  const spell = getSpellDefinition(SPELL_ID);
  const intent = buildSpellApplicationIntent({
    spell,
    enteredName: spell.displayName,
    turns: spell.defaultTurns,
    casterId: "caster",
    targetIds: ["caster"],
    castContext: { slotLevel },
  });
  const plan = buildSpellApplicationPlan({ intent, instanceId: `melf-${slotLevel}`, casterName: "Maga" });
  return plan.operations.find((operation) => operation.type === "spell:upsert");
}

function activeMeteors({ remaining = 5, total = 6, turnKey = "1:0:caster", conc = true } = {}) {
  return {
    id: "melf-entry",
    name: "Minuscole Meteore di Melf",
    spellId: SPELL_ID,
    instanceId: "melf-instance",
    casterId: "caster",
    casterName: "Maga",
    turns: 100,
    conc,
    appliedAt: { round: 1, actorId: "caster", turnKey },
    castContext: {
      slotLevel: 3,
      uses: { key: "meteors", label: "meteore", remaining, total, showInPill: true },
    },
  };
}

const item = (id, spells = []) => ({ id, name: id, layer: "CHARACTER", metadata: { [META_KEY]: { [SPELLS_KEY]: spells } } });

test("Six meteors and two more per slot above the 3rd; the cast's own meteor is already spent", () => {
  for (const [slotLevel, total] of [[3, 6], [4, 8], [5, 10], [9, 18]]) {
    const uses = castUpsert(slotLevel)?.castContext?.uses;
    assert.ok(uses, `slot ${slotLevel}`);
    assert.equal(uses.key, "meteors");
    assert.equal(uses.label, "meteore");
    assert.equal(uses.total, total, `slot ${slotLevel}`);
    assert.equal(uses.remaining, total - 1, "the panel resolves the first meteor at the cast");
    assert.equal(uses.showInPill, true);
  }
  assert.equal(spellPillCounter(activeMeteors({ remaining: 5 })), "5");
  assert.equal(spellSaveDamageFormula(SPELL_ID, "failed", 5), "2d6", "a higher slot gives meteors, not dice");
});

test("The area cast keeps the counter on a pill of the caster, and the first meteor's damage on whom it hits", async () => {
  const { buildSpellUnifiedPanelContract } = await import("../src/spellUnifiedPanelCore.js");
  const { buildSpellAreaResolutionCommand } = await import("../src/spellAreaResolutionCommandCore.js");
  const { buildSpellAreaResolutionExecutionPlan } = await import("../src/spellAreaResolutionExecutor.js");
  const token = (id, hp) => ({ id, name: id, type: "IMAGE", layer: "CHARACTER", position: { x: 0, y: 0 }, metadata: { [META_KEY]: { hp, hpMax: hp, inInitiative: true } } });
  const items = [token("caster", 30), token("goblin", 7)];
  for (const [slotLevel, remaining, total] of [[3, 5, 6], [5, 9, 10]]) {
    const contract = buildSpellUnifiedPanelContract({ spellId: SPELL_ID, phase: "cast", castContext: { slotLevel } });
    const ruleId = contract.presentation.placement.ruleId;
    const command = buildSpellAreaResolutionCommand({
      contract, spellId: SPELL_ID, phase: "cast", source: { kind: "cast", sceneEpoch: 3 }, casterId: "caster", slotLevel,
      targetIds: ["goblin"], candidateTargetIds: ["goblin"], targetLocked: true,
      placement: { status: "confirmed", confirmed: true, ruleId, spellId: SPELL_ID, casterId: "caster", targetLocked: true,
        targetIds: ["goblin"], preview: { type: "circle", start: { x: 0, y: 0 }, end: { x: 70, y: 0 }, radius: 70,
          gridOrigin: { x: 0, y: 0 }, dpi: 70, targetIds: ["goblin"], targetLocked: true } },
      outcomes: { goblin: "failed" },
      hp: { mode: "damage", amount: 5 },
      sceneEpoch: 3, currentSceneEpoch: 3, validateSpatial: false,
    });
    assert.equal(command.valid, true, JSON.stringify(command.errors));
    const plan = await buildSpellAreaResolutionExecutionPlan(command, {
      sceneEpoch: 3, isCurrent: () => true,
      readItems: async (ids) => items.filter((item) => ids.includes(item.id)),
      readAllItems: async () => items, readSceneMetadata: async () => ({}),
      getInitiativeActorId: async () => null, createSpellInstanceId: async () => "melf-instance",
      getStaticZoneItems: async () => [], buildStaticZoneItems: () => [],
    });
    assert.equal(plan.valid !== false, true, JSON.stringify(plan.errors));
    const upserts = plan.effectOperations.filter((operation) => operation.type === "spell:upsert");
    assert.equal(upserts.length, 1, JSON.stringify(upserts));
    assert.deepEqual(upserts[0].targetIds, ["caster"], "the pill on the caster, none on the goblin hit");
    assert.equal(upserts[0].conc, true);
    assert.deepEqual([upserts[0].castContext.uses.remaining, upserts[0].castContext.uses.total], [remaining, total], `slot ${slotLevel}`);
    const register = plan.effectOperations.find((operation) => operation.type === "concentration:register");
    assert.equal(register?.casterId, "caster");
    const goblin = plan.entries.find((entry) => entry.item?.id === "goblin");
    assert.equal(goblin?.change?.afterHP, 2, "the first meteor: 5 fire on a failed save, 7 -> 2");
    assert.equal(plan.entries.some((entry) => entry.item?.id === "caster"), false, "the caster's pill writes no hit points");
  }
});

test("Lancia meteora: a bonus action, one explosion on its own point, 2d6 fire, half on a DEX save", () => {
  const action = getSpellResolutionAction(SPELL_ID, "melf-meteor");
  assert.ok(action);
  assert.deepEqual(validateSpellActiveResolutionAction(action).errors || [], []);
  assert.equal(action.economy, "bonus-action");
  assert.equal(action.resolutionKind, "save-area");
  assert.notEqual(action.availableAfterCast, true, "a second meteor on the cast's turn too");
  assert.equal(action.placementRuleId, `${SPELL_ID}:cast`);
  const rule = getSpellAreaRuleById(action.placementRuleId);
  assert.equal(rule.geometry.shape, "circle");
  assert.equal(rule.geometry.size.value, 1.5, "within 1,5 m of the point");
  assert.equal(rule.placement.range.value, 36);
  assert.equal(rule.placement.multiArea, undefined, "two meteors are two explosions, never one joined area");
  assert.equal(action.rangeOrigin, "caster");
  assert.deepEqual(action.save, { ability: "dex", onSuccess: "half" });
  assert.equal(action.damage.formula, "2d6");
  assert.equal(action.damage.type, "fuoco");
  assert.equal(action.damage.onSave, "half");
  assert.equal(action.damage.baseSlot, undefined, "no dice per slot");
  assert.deepEqual(action.resource, { key: "meteors", consume: 1, endSpellAtZero: true, endConcentrationAtZero: true });
  assert.deepEqual(action.placementWords, { place: "Posiziona la meteora", again: "Riposiziona la meteora", done: "Meteora confermata" });
  assert.equal(action.allowEmptyTargets, true, "a meteor sent where nobody stands is spent all the same");
  assert.equal(action.damageRequiredWithTargetsOnly, true);
  assert.match(action.detail, /^Azione bonus: /u, "the cost said once, as the panel's list reads it");
});

test("Each meteor spends one; the last one ends the spell and its concentration", () => {
  const action = getSpellResolutionAction(SPELL_ID, "melf-meteor");
  const payload = { instanceId: "melf-instance", casterId: "caster" };
  const one = buildSpellActiveResolutionResourceOperations({ action, payload, spellEntry: activeMeteors({ remaining: 5 }) });
  assert.equal(one.valid, true);
  assert.equal(one.remaining, 4);
  assert.equal(one.operations[0].castContext.uses.remaining, 4);
  const last = buildSpellActiveResolutionResourceOperations({ action, payload, spellEntry: activeMeteors({ remaining: 1 }) });
  assert.equal(last.remaining, 0);
  assert.deepEqual(last.operations, [{ type: "concentration:break", casterIds: ["caster"], reference: "melf-instance" }],
    "breaking the concentration ends the spell too, as for Flame Arrows");
  const none = buildSpellActiveResolutionResourceOperations({ action, payload, spellEntry: activeMeteors({ remaining: 0 }) });
  assert.equal(none.valid, false);
});

test("The caster's later turns offer a meteor; the cast's turn does not, its second meteor is the panel's", () => {
  const items = [item("caster", [activeMeteors({ turnKey: "1:0:caster" })]), item("goblin")];
  assert.equal(MELF_METEOR_TURN_PROMPT_ACTION_ID, "melf-meteor");
  assert.deepEqual(spellTurnPromptRequests({ items, actorId: "caster", sceneEpoch: 3, turnKey: "1:0:caster" }), []);
  const later = spellTurnPromptRequests({ items, actorId: "caster", sceneEpoch: 3, turnKey: "2:0:caster" });
  assert.equal(later.length, 1);
  assert.equal(later[0].kind, "action");
  assert.equal(later[0].payload.spellId, SPELL_ID);
  assert.equal(later[0].payload.actionId, "melf-meteor");
  assert.equal(later[0].payload.castContext.uses.remaining, 5);
  assert.deepEqual(spellTurnPromptRequests({ items, actorId: "goblin", sceneEpoch: 3, turnKey: "2:0:goblin" }), [], "only the caster's turn");
});

test("The popup says the meteor's own words", () => {
  const popup = readFileSync(new URL("../src/spell-active-resolution.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const words = popup.slice(popup.indexOf("function placementWords()"), popup.indexOf("function creaturesHit("));
  assert.match(words, /const declared = payload\?\.action\?\.placementWords;/);
  assert.ok(words.indexOf("declared") < words.indexOf("isCallLightning()"), "the declared words first, the old ones untouched");
});
