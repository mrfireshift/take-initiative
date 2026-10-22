// Lotto L1 of docs/PIANO_AUTOMAZIONE_INCANTESIMI.md: the passive benefits of the 2014 texts as pills, and Pass without
// Trace as a mobile aura. The expectations below are read from the 2014 texts, not from the definitions under test.
import test from "node:test";
import assert from "node:assert/strict";

import { getSpellDefinition, getSpellEffects } from "../src/spells-srd.js";
import {
  buildSpellApplicationIntent,
  buildSpellApplicationPlan,
} from "../src/spellApplicationPlanCore.js";
import { buildSpellUnifiedPanelContract } from "../src/spellUnifiedPanelCore.js";
import { buildQuickActionSpellLaunchPlan } from "../src/quickActionSpellExecutionCore.js";
import {
  collectActiveMobileAuras,
  getMobileAuraRule,
  mobileAuraLegacyCasterEffectRemovals,
  mobileAuraMembershipPlan,
  mobileAuraTargetIds,
} from "../src/spellAuraCore.js";
import { ALL_DAMAGE_TYPES } from "../src/supplementSpellRules.js";
import { DAMAGE_TYPES, damageDefensesForItem, hasDamageDefenses } from "../src/damageDefensesCore.js";
import { effectSummaryPartsFor } from "../src/effectLabelCore.js";
import { buildEffectsMutationPlan } from "../src/effectsMutationCore.js";
import { pcAttackPreview } from "../src/pcAttackCore.js";
import { bossDefendedDamage } from "../src/bossActionsViewCore.js";

// spellId: [kind, pill label, mini pill labels]
const PASSIVE_BENEFITS = Object.freeze({
  "mage-armor": ["buff", "CA 13 + Des", ["CA 13 + Des"]],
  "barkskin": ["buff", "CA minima 16", ["CA min 16"]],
  "beacon-of-hope": ["buff", "Vant. TS Sag/morte · cure max", ["Vant. TS Sag", "Vant. TS morte", "Cure al massimo"]],
  "enthrall": ["debuff", "Svant. Percezione verso altri", ["Svant. Percezione"]],
  "expeditious-retreat": ["buff", "Scatto come azione bonus", ["Scatto: az. bonus"]],
  "foresight": ["buff", "Vant. tiri e TS · att. contro svant.", ["Non sorpreso", "Vant. att./prove/TS", "Att. contro svant."]],
  "jump": ["buff", "Salto triplicato", ["Salto ×3"]],
  "levitate": ["debuff", "Levita: ±6 m in verticale", ["±6 m in verticale", "Orizzontale solo spingendo"]],
  "suggestion": ["debuff", "Segue la suggestione", ["Segue il suggerimento", "Danno dal caster o alleati: fine"]],
  "mass-suggestion": ["debuff", "Segue la suggestione", ["Segue il suggerimento", "Danno dal caster o alleati: fine"]],
  "protection-from-evil-and-good": ["buff", "Svant. ai loro att. · no charme/paura", ["Svant. att. da 6 tipi", "No charme/paura/possessione"]],
  "protection-from-poison": ["buff", "Vant. TS veleno · res. veleno", ["Vant. TS avvelenato", "Res. veleno"]],
  "resilient-sphere": ["debuff", "Chiuso nella sfera", ["Nulla entra né esce", "Rotola a metà vel."]],
  "stoneskin": ["buff", "Res. C/P/T non magici", ["Res. C/P/T non magici"]],
  "xanathar-invulnerabilita": ["buff", "Immune a tutti i danni", ["Imm. tutti i danni"]],
});

// Mechanics that change damage or HP: only the damage defenses of the three wards, applied by the PC attack and boss
// consoles (damageDefensesCore.js); Stoneskin stays a pill, since the engine cannot tell magical damage apart.
const HP_MECHANICS = ["damageDefenses", "damageResistances", "damageBonus", "hp", "healing", "temporaryHitPoints", "endsOnDamage"];
const WARDS = Object.freeze({
  "protection-from-poison": { resistances: ["poison"] },
  "xanathar-invulnerabilita": { immunities: ALL_DAMAGE_TYPES },
});

function castPlan(spellId, targetIds = ["target"]) {
  const spell = getSpellDefinition(spellId);
  const intent = buildSpellApplicationIntent({
    spell,
    enteredName: spell.displayName,
    turns: spell.defaultTurns,
    casterId: "caster",
    targetIds,
    castContext: {},
    requestedConcentration: spell.concentration === true,
  });
  return buildSpellApplicationPlan({ intent, instanceId: "instance", appliedAt: { round: 1 }, casterName: "Caster" });
}

test("each passive benefit has the pill of its 2014 text", () => {
  for (const [spellId, [kind, label, parts]] of Object.entries(PASSIVE_BENEFITS)) {
    const effects = getSpellEffects(spellId);
    assert.equal(effects.length, 1, spellId);
    const [effect] = effects;
    assert.equal(effect.kind, kind, spellId);
    assert.equal(effect.label, label, spellId);
    assert.ok(effect.detail.length > 20, `${spellId}: a detail explains the benefit`);
    assert.deepEqual(effect.summaryParts.map((part) => part.label), parts, spellId);
  }
});

test("only the wards change damage, through their damage defenses; Stoneskin stays a pill", () => {
  for (const spellId of Object.keys(PASSIVE_BENEFITS)) {
    const [effect] = getSpellEffects(spellId);
    const allowed = WARDS[spellId] ? ["damageDefenses"] : [];
    for (const field of HP_MECHANICS.filter((name) => !allowed.includes(name))) {
      assert.equal(Object.hasOwn(effect.mechanics || {}, field), false, `${spellId}: ${field}`);
    }
    if (WARDS[spellId]) assert.deepEqual(effect.mechanics.damageDefenses, WARDS[spellId], spellId);
  }
  assert.equal(getSpellEffects("stoneskin")[0].mechanics, undefined);
  const aura = getMobileAuraRule("pass-without-trace");
  assert.deepEqual(Object.keys(aura.effectPolicy.effect.mechanics).sort(), ["abilityCheck", "deriveLabel"]);
});

test("Invulnerability lists every damage type of the engine", () => {
  assert.deepEqual([...ALL_DAMAGE_TYPES], DAMAGE_TYPES.map((type) => type.id));
});

test("the cast puts the pill on the targets, for the spell's duration or concentration", () => {
  const expiries = {
    "mage-armor": { mode: "rounds", remaining: 4800 },
    "jump": { mode: "rounds", remaining: 10 },
    "mass-suggestion": { mode: "rounds", remaining: 14400 },
    "barkskin": { mode: "concentration" },
    "suggestion": { mode: "concentration" },
    "stoneskin": { mode: "concentration" },
  };
  for (const [spellId, expiry] of Object.entries(expiries)) {
    const plan = castPlan(spellId);
    const condition = plan.operations.find((operation) => operation.type === "condition:add");
    assert.ok(condition, spellId);
    assert.deepEqual(condition.targetIds, ["target"], spellId);
    assert.equal(condition.conditionName, PASSIVE_BENEFITS[spellId][1], spellId);
    assert.equal(condition.options.effectId, getSpellEffects(spellId)[0].id, spellId);
    assert.equal(condition.options.parentEffectId, "instance", spellId);
    assert.deepEqual(condition.options.expiry, expiry, spellId);
    assert.equal(
      plan.operations.some((operation) => operation.type === "concentration:register"),
      expiry.mode === "concentration",
      spellId,
    );
  }
});

test("Suggestion ends with its pill; Mass Suggestion ends for one creature at a time", () => {
  const [suggestion] = getSpellEffects("suggestion");
  assert.equal(suggestion.manualRemoval, true);
  assert.equal(suggestion.endsParentOnRemoval, true);
  const [mass] = getSpellEffects("mass-suggestion");
  assert.equal(mass.manualRemoval, true);
  assert.equal(mass.endsParentOnRemoval, undefined);
});

test("Beacon of Hope and Enthrall take any number of creatures", () => {
  for (const spellId of ["beacon-of-hope", "enthrall"]) {
    const limit = buildSpellUnifiedPanelContract({ spellId }).presentation.targeting.limit;
    assert.equal(limit.classification, "unbounded", spellId);
    assert.equal(limit.maximum, null, spellId);
  }
  assert.equal(buildSpellUnifiedPanelContract({ spellId: "mass-suggestion" }).presentation.targeting.limit.maximum, 12);
});

test("Protection from Energy applies the resistance of the type chosen", () => {
  const types = { acido: "acid", freddo: "cold", fulmine: "lightning", fuoco: "fire", tuono: "thunder" };
  assert.deepEqual(getSpellDefinition("protection-from-energy").effectChoices.map((choice) => choice.id), Object.keys(types));
  for (const [type, damageType] of Object.entries(types)) {
    const [effect] = getSpellEffects("protection-from-energy", type);
    assert.equal(effect.label, `Res. ${type}`);
    assert.equal(effect.kind, "buff");
    assert.deepEqual(effect.mechanics.damageDefenses, { resistances: [damageType] });
    // The mini pill the defenses derive, once.
    assert.deepEqual(effectSummaryPartsFor(effect).map((part) => part.label), [`Res. ${type}`]);
  }
  assert.deepEqual(effectSummaryPartsFor(getSpellEffects("protection-from-poison")[0]).map((part) => part.label),
    ["Vant. TS avvelenato", "Res. veleno"]);
  assert.deepEqual(effectSummaryPartsFor(getSpellEffects("xanathar-invulnerabilita")[0]).map((part) => part.label),
    ["Imm. tutti i danni"]);
});

// The real chain: the spell's plan, the effects mutation that stores its pill on the token, the console's damage.
const META_KEY = "com.thebigpicture.initiative/meta";
const cantrips = { id: "cantrip", label: "Trucchetto", kind: "attack", source: { kind: "cantrip" } };

function castOn(spellId, { choice = "", self = false } = {}) {
  const spell = getSpellDefinition(spellId);
  const casterId = self ? "target" : "warder";
  const intent = buildSpellApplicationIntent({
    spell,
    enteredName: spell.displayName,
    turns: spell.defaultTurns,
    casterId,
    targetIds: ["target"],
    castContext: {},
    selectedChoice: choice,
    requestedConcentration: spell.concentration === true,
  });
  const plan = buildSpellApplicationPlan({ intent, instanceId: "ward", appliedAt: { round: 1 }, casterName: "Warder" });
  // The ids the runtime gives each operation before planning it (effectsMutations.js prepareOperation).
  const operations = plan.operations.map((operation, index) => ({
    ...operation,
    operationId: `operation-${index}`,
    createdAt: 100 + index,
    ...(operation.type === "condition:add"
      ? { instanceIds: Object.fromEntries(operation.targetIds.map((id) => [id, `${id}-condition-${index}`])) }
      : {}),
    ...(operation.type === "spell:upsert"
      ? { entryIds: Object.fromEntries(operation.targetIds.map((id) => [id, `${id}-spell-${index}`])) }
      : {}),
  }));
  return buildEffectsMutationPlan([{ id: "warder", name: "Warder" }, { id: "target", name: "Target" }], operations);
}

function tokenOf(mutation) {
  const state = mutation.states.find((entry) => entry.id === "target");
  return { id: "target", name: "Target", type: "IMAGE", layer: "CHARACTER",
    metadata: { [META_KEY]: { hp: 30, hpMax: 30, inInitiative: true, conditions: state.conditions } } };
}

test("the PC attack console halves the damage Protection from Energy resists, and the GM may ignore it", () => {
  const fire = tokenOf(castOn("protection-from-energy", { choice: "fuoco" }));
  assert.deepEqual(damageDefensesForItem(fire, META_KEY).resistances, ["fire"]);
  const preview = (targetItem, ignoredDefenses = []) => pcAttackPreview({ action: cantrips, spellId: "fire-bolt", targetItem,
    outcome: "hit", amounts: { c1: "9" }, ignoredDefenses });
  const resisted = preview(fire);
  assert.deepEqual([resisted.total, resisted.defenses.map((row) => [row.type, row.defense])], [4, [["fire", "resistance"]]]);
  assert.equal(resisted.hp.after, 26);
  assert.equal(preview(fire, ["fire"]).total, 9, "the GM ignores the resistance");
  assert.equal(preview(tokenOf(castOn("protection-from-energy", { choice: "freddo" }))).total, 9, "cold does not resist fire");
});

test("Protection from Poison halves poison damage; Invulnerability takes none; Stoneskin defends nothing", () => {
  const poisoned = tokenOf(castOn("protection-from-poison"));
  const spray = pcAttackPreview({ action: cantrips, spellId: "poison-spray", targetItem: poisoned, outcome: "failed", amounts: { c1: "9" } });
  assert.deepEqual([spray.total, spray.defenses.map((row) => row.defense)], [4, ["resistance"]]);
  const invulnerable = tokenOf(castOn("xanathar-invulnerabilita", { self: true }));
  assert.equal(pcAttackPreview({ action: cantrips, spellId: "fire-bolt", targetItem: invulnerable, outcome: "critical",
    amounts: { c1: "18" } }).total, 0);
  // A boss's breath and claws: every component takes nothing.
  assert.equal(bossDefendedDamage([{ id: "a", type: "cold" }, { id: "b", type: "slashing" }], { a: 22, b: 9 }, "hit",
    damageDefensesForItem(invulnerable, META_KEY)), 0);
  assert.equal(hasDamageDefenses(damageDefensesForItem(tokenOf(castOn("stoneskin")), META_KEY)), false);
});

test("the defense ends with the spell: concentration lost, no more immunity", () => {
  const cast = castOn("xanathar-invulnerabilita", { self: true });
  assert.equal(hasDamageDefenses(damageDefensesForItem(tokenOf(cast), META_KEY)), true);
  const ended = buildEffectsMutationPlan(cast.states, [{ type: "concentration:break", casterIds: ["target"], reference: "ward" }]);
  assert.equal(hasDamageDefenses(damageDefensesForItem(tokenOf(ended), META_KEY)), false);
});

const META = "meta";
const SPELLS = "spells";
const bounds = (x, y, size = 100) => ({ min: { x, y }, max: { x: x + size, y: y + size } });
const creature = (id, attitude, conditions = []) => ({
  id,
  metadata: {
    [META]: {
      attitude,
      [SPELLS]: [],
      ...(conditions.length ? { conditions: { version: 2, instances: conditions } } : {}),
    },
  },
});

test("Pass without Trace is a mobile aura of 9 m, cast at once from the spellbook", () => {
  const contract = buildSpellUnifiedPanelContract({ spellId: "pass-without-trace" });
  assert.equal(contract.execution.lane, "area-transaction");
  assert.equal(contract.presentation.placement.policy, "automatic");
  assert.equal(contract.presentation.inputs.targets.required, false);
  const rule = getMobileAuraRule("pass-without-trace");
  assert.equal(rule.kind, "aura");
  assert.equal(rule.geometry.size.value, 9);
  assert.equal(rule.targeting.filter, "friendly");
  assert.equal(rule.targeting.includeCaster, true);
  assert.equal(rule.effectPolicy.mode, "while-inside");
  assert.equal(rule.effectPolicy.effect.label, "+10 Furtività");
  assert.deepEqual(rule.effectPolicy.effect.mechanics.abilityCheck, { bonus: 10, skill: "Furtività" });
  const plan = buildQuickActionSpellLaunchPlan({
    action: { version: 2, id: "book:pass-without-trace", label: "Passare senza tracce", kind: "spell",
      spellId: "pass-without-trace", targetMode: "self", slotLevel: null, turns: null, applyAutomations: true, launchMode: "auto" },
    sourceId: "druid",
  });
  assert.equal(plan.mode, "direct");
  assert.equal(plan.areaExecution, true);
});

test("Pass without Trace covers the caster's side within the aura, the caster included", () => {
  const spells = [{ spellId: "pass-without-trace", instanceId: "pwt", casterId: "druid", castContext: { mobileAura: true } }];
  const druid = { ...creature("druid", "pc"), metadata: { [META]: { attitude: "pc", [SPELLS]: spells } } };
  const [aura] = collectActiveMobileAuras([druid], { metaKey: META, spellsKey: SPELLS });
  assert.equal(aura.spellId, "pass-without-trace");
  const area = { cells: [{ x: 0, y: 0, width: 400, height: 400 }] };
  const inside = mobileAuraTargetIds({
    aura,
    area,
    metaKey: META,
    candidates: [
      { item: druid, bounds: bounds(100, 100) },
      { item: creature("rogue", "pc"), bounds: bounds(200, 100) },
      { item: creature("hireling", "ally"), bounds: bounds(100, 200) },
      { item: creature("merchant", "neutral"), bounds: bounds(200, 200) },
      { item: creature("orc", "enemy"), bounds: bounds(300, 100) },
      { item: creature("far-ranger", "pc"), bounds: bounds(600, 600) },
    ],
  });
  assert.deepEqual(inside, ["druid", "rogue", "hireling"]);
  const membership = mobileAuraMembershipPlan({
    aura,
    desiredTargetIds: inside,
    items: [druid, creature("rogue", "pc"), creature("hireling", "ally")],
    metaKey: META,
    sourceName: "Druido",
  });
  assert.deepEqual(membership.entering, ["druid", "rogue", "hireling"]);
  const [add] = membership.operations;
  assert.equal(add.type, "condition:add");
  assert.equal(add.conditionName, "+10 Furtività");
  assert.equal(add.options.parentEffectId, "pwt");
  assert.equal(add.options.effectId, "pass-without-trace-aura");
});

test("the aura replaces the caster's personal Pass without Trace pill", () => {
  const spells = [{ spellId: "pass-without-trace", instanceId: "pwt", casterId: "druid", castContext: { mobileAura: true } }];
  const druid = {
    id: "druid",
    metadata: {
      [META]: {
        attitude: "pc",
        [SPELLS]: spells,
        conditions: {
          version: 2,
          instances: [
            { id: "personal", parentEffectId: "pwt", effectId: "stealth-bonus" },
            { id: "from-aura", parentEffectId: "pwt", effectId: "pass-without-trace-aura" },
          ],
        },
      },
    },
  };
  const [aura] = collectActiveMobileAuras([druid], { metaKey: META, spellsKey: SPELLS });
  assert.deepEqual(mobileAuraLegacyCasterEffectRemovals({ aura, items: [druid], metaKey: META }), [
    { itemId: "druid", instanceId: "personal" },
  ]);
});
