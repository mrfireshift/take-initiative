// Lotto L4 of docs/PIANO_AUTOMAZIONE_INCANTESIMI.md: leveled attack spells in the PC attack console. The dice, rays
// and darts below are read from the 2014 texts (Xanathar's for Chaos Bolt), not from the table under test.
import test from "node:test";
import assert from "node:assert/strict";

import { PC_ATTACK_SPELLS, getPcAttackSpell, pcAttackSpellCount, pcAttackSpellDice } from "../src/pcAttackSpellCatalog.js";
import { getSpellDefinition } from "../src/spells-srd.js";
import { sanitizeQuickAction } from "../src/quickActionsCore.js";
import {
  buildPcAttackMutation, pcAttackActivationOptions, pcAttackOpenSpellCast, pcAttackOutcomesFor, pcAttackPreview,
  pcAttackResolvedAction, pcAttackRiderOptions, pcAttackSpellIds, pcAttackWeaponCantripIds,
} from "../src/pcAttackCore.js";
import { spellbookSpellAttackAction } from "../src/spellbookCatalog.js";
import { damageDefensesForItem } from "../src/damageDefensesCore.js";

const META = "com.thebigpicture.initiative/meta";
const CONCENTRATION = "com.thebigpicture.initiative/concentration";
const spells = { id: "spells", label: "Incantesimi d'attacco", kind: "attack", source: { kind: "spell" } };

test("the table names catalog spells at their level, with the dice and rays of the 2014 texts", () => {
  for (const spell of PC_ATTACK_SPELLS) {
    const definition = getSpellDefinition(spell.spellId);
    assert.ok(definition, spell.spellId);
    assert.equal(definition.level, spell.level, spell.spellId);
  }
  const at = (spellId, slot) => [pcAttackSpellDice(getPcAttackSpell(spellId), slot), pcAttackSpellCount(getPcAttackSpell(spellId), slot)];
  assert.deepEqual(at("inflict-wounds", 1), ["3d10", 1]);
  assert.deepEqual(at("inflict-wounds", 3), ["5d10", 1]);
  assert.deepEqual(at("guiding-bolt", 2), ["5d6", 1]);
  assert.deepEqual(at("phb2014-globo-cromatico", 3), ["5d8", 1]);
  assert.deepEqual(at("xanathar-dardo-di-caos", 1), ["2d8+1d6", 1]);
  assert.deepEqual(at("xanathar-dardo-di-caos", 3), ["2d8+3d6", 1]);
  assert.deepEqual(at("magic-missile", 1), ["1d4+1", 3]);
  assert.deepEqual(at("magic-missile", 4), ["1d4+1", 6]);
  assert.deepEqual(at("scorching-ray", 2), ["2d6", 3]);
  assert.deepEqual(at("scorching-ray", 4), ["2d6", 5]);
  assert.deepEqual(at("vampiric-touch", 3), ["3d6", 1]);
  assert.deepEqual(at("vampiric-touch", 5), ["5d6", 1]);
  // Chromatic Orb's six types; Chaos Bolt's d8 in the order of its table.
  assert.deepEqual(getPcAttackSpell("phb2014-globo-cromatico").types, ["acid", "cold", "lightning", "fire", "thunder", "poison"]);
  assert.deepEqual(getPcAttackSpell("xanathar-dardo-di-caos").types, ["acid", "force", "cold", "lightning", "fire", "psychic", "thunder", "poison"]);
});

test("an attack spell action keeps only the spells of the table; none listed offers them all", () => {
  const action = sanitizeQuickAction({ ...spells, version: 2, source: { kind: "spell", spellIds: ["scorching-ray", "fireball", "scorching-ray"] } });
  assert.deepEqual(action.source, { kind: "spell", spellIds: ["scorching-ray"] });
  assert.deepEqual(pcAttackSpellIds(spells), PC_ATTACK_SPELLS.map((spell) => spell.spellId));
  assert.equal(spellbookSpellAttackAction([action], "scorching-ray")?.id, "spells");
  assert.equal(spellbookSpellAttackAction([action], "guiding-bolt"), null);
  assert.equal(spellbookSpellAttackAction([spells], "fireball"), null);
});

test("a spell attack is a spell: no weapon riders, no weapon cantrips, Magic Missile without an attack roll", () => {
  const bolt = pcAttackResolvedAction(spells, "inflict-wounds");
  assert.deepEqual([bolt.range, bolt.components, bolt.spell.level], ["melee", [{ id: "c1", type: "necrotic" }], 1]);
  assert.deepEqual(pcAttackWeaponCantripIds(spells), []);
  assert.deepEqual(pcAttackOutcomesFor(pcAttackResolvedAction(spells, "magic-missile")), ["hit"]);
  assert.deepEqual(pcAttackOutcomesFor(bolt), ["hit", "critical", "miss"]);
  const rogue = creature("rogue", { initiativeCard: { quickActions: [spells], characterBuild: [{ classId: "ladro", level: 5 }], classFeaturesConfigured: true,
    enabledClassFeatureIds: ["ladro-attacco-furtivo"] } });
  const sneak = pcAttackRiderOptions({ action: spells, spellId: "inflict-wounds", sourceItem: rogue }).find((option) => option.id === "ladro-attacco-furtivo");
  assert.equal(sneak?.available ?? false, false);
  assert.deepEqual(pcAttackActivationOptions({ action: spells, spellId: "magic-missile", sourceItem: rogue, outcome: "hit" }).filter((option) => option.available), []);
});

function creature(id, meta = {}) {
  return { id, name: id, type: "IMAGE", layer: "CHARACTER", metadata: { [META]: { hp: 40, hpMax: 40, inInitiative: true, ...meta } } };
}
const wizard = (meta = {}) => creature("wizard", { initiativeCard: { quickActions: [spells], characterBuild: [{ classId: "mago", level: 5 }] }, ...meta });
const turnState = { round: 2, order: ["wizard", "orc"], current: 0 };
function cast(spellId, { sourceItem = wizard(), targetItem = creature("orc"), outcome = "hit", amount = 7, spellCast = {}, id = "a1" } = {}) {
  return buildPcAttackMutation({ action: spells, spellId, sourceItem, targetItem, outcome, componentAmounts: outcome === "miss" ? {} : { c1: amount },
    attackInstanceId: id, expectedDefenses: damageDefensesForItem(targetItem, META), turnState, spellCast: { castId: "cast-1", slotLevel: getPcAttackSpell(spellId).level, ...spellCast } });
}
const withState = (item, plan) => ({ ...item, metadata: { [META]: { ...item.metadata[META], pcAttackState: plan.options.metadataPatches[0].fields.pcAttackState.value } } });

test("Scorching Ray: the first ray opens the cast and spends the slot, the next ones continue it", () => {
  let caster = wizard();
  const first = cast("scorching-ray", { sourceItem: caster, spellCast: { slotLevel: 3 } });
  assert.deepEqual([first.causality.spell.firstOfCast, first.causality.spell.index, first.causality.spell.total, first.causality.spell.slotLevel],
    [true, 1, 4, 3], "four rays with a 3rd-level slot");
  caster = withState(caster, first);
  assert.equal(pcAttackOpenSpellCast({ sourceItem: caster, spellId: "scorching-ray", turnState }).index, 1);
  for (const index of [2, 3, 4]) {
    const next = cast("scorching-ray", { sourceItem: caster, id: `a${index}`, outcome: index === 3 ? "miss" : "hit" });
    assert.deepEqual([next.causality.spell.firstOfCast, next.causality.spell.index, next.causality.spell.slotLevel], [false, index, 3]);
    caster = withState(caster, next);
  }
  assert.equal(caster.metadata[META].pcAttackState.spellCast, undefined, "the fourth ray closes the cast");
  // Another cast id, or the next turn, opens a new cast.
  assert.equal(cast("scorching-ray", { sourceItem: withState(wizard(), first), spellCast: { castId: "cast-2" } }).causality.spell.firstOfCast, true);
  assert.equal(pcAttackOpenSpellCast({ sourceItem: withState(wizard(), first), spellId: "scorching-ray", turnState: { ...turnState, current: 1 } }), null);
});

test("Magic Missile: every dart hits, one registration each; Shield stops them", () => {
  const dart = cast("magic-missile", { amount: 4 });
  assert.equal(dart.change.requested, 4);
  assert.deepEqual([dart.causality.spell.index, dart.causality.spell.total], [1, 3]);
  const shielded = creature("orc", { conditions: [{ id: "shield", condition: "Scudo", active: true, mechanics: { immunities: ["magic-missile"] } }] });
  assert.throws(() => cast("magic-missile", { targetItem: shielded }), /protetto da Scudo/u);
  assert.match(pcAttackPreview({ action: spells, spellId: "magic-missile", sourceItem: wizard(), targetItem: shielded, outcome: "hit",
    amounts: { c1: "4" }, turnState, spellCast: { castId: "c", slotLevel: 1 } }).blocker, /protetto da Scudo/u);
});

test("Chromatic Orb and Chaos Bolt take the type picked for the attack; the bolt leaps on matching d8, once per creature", () => {
  assert.throws(() => cast("phb2014-globo-cromatico"), /tipo di danno/u);
  const orb = cast("phb2014-globo-cromatico", { spellCast: { damageType: "thunder" } });
  assert.equal(orb.damageComponents[0].type, "thunder");
  let caster = wizard();
  const bolt = cast("xanathar-dardo-di-caos", { sourceItem: caster, spellCast: { damageType: "psychic", doubles: true } });
  assert.equal(bolt.causality.spell.leapPending, true);
  caster = withState(caster, bolt);
  assert.throws(() => cast("xanathar-dardo-di-caos", { sourceItem: caster, id: "a2", spellCast: { damageType: "fire" } }), /non ancora bersagliata/u);
  const leap = cast("xanathar-dardo-di-caos", { sourceItem: caster, id: "a2", targetItem: creature("goblin"), spellCast: { damageType: "fire" } });
  assert.deepEqual([leap.causality.spell.firstOfCast, leap.causality.spell.leap, leap.causality.spell.index, leap.causality.spell.total], [false, true, 2, 2]);
  // A miss never leaps.
  assert.equal(cast("xanathar-dardo-di-caos", { outcome: "miss", spellCast: { damageType: "fire", doubles: true } }).causality.spell.leapPending, undefined);
});

test("Guiding Bolt puts its pill on a hit, none on a miss", () => {
  const hit = cast("guiding-bolt", { spellCast: { slotLevel: 2 } });
  assert.deepEqual(hit.causality.spell.pills, ["Prossimo attacco: vant."]);
  assert.equal(hit.causality.spell.dice, "5d6");
  assert.ok(hit.operations.some((operation) => operation.type === "spell:upsert"));
  assert.equal(cast("guiding-bolt", { outcome: "miss" }).operations.some((operation) => operation.type === "spell:upsert"), false);
});

test("Vampiric Touch: only while its concentration is active; the caster regains half the necrotic damage in the same write", () => {
  assert.throws(() => cast("vampiric-touch"), /pannello incantesimi/u);
  const caster = wizard({ hp: 20, [CONCENTRATION]: { "tocco del vampiro": { spellId: "vampiric-touch", instanceId: "vt", castContext: { slotLevel: 5 } } } });
  const touch = cast("vampiric-touch", { sourceItem: caster, amount: 15 });
  assert.equal(touch.causality.spell.dice, "5d6");
  assert.equal(touch.causality.spell.firstOfCast, false, "the panel spent the slot");
  const updates = touch.operations.find((operation) => operation.type === "hp:set").updates;
  assert.deepEqual(updates.map((update) => [update.itemId, update.hp]), [["orc", 25], ["wizard", 27]]);
  assert.equal(updates[1].hpIntent.mode, "heal");
  assert.deepEqual(touch.causality.spell.casterHeal, { amount: 7, before: 20, after: 27 });
  assert.ok(touch.options.targetIds.includes("wizard"));
  // A resisted touch heals half of what the target took; no spell pill on the target.
  const resistant = creature("orc", { initiativeCard: { damageDefenses: { resistances: ["necrotic"] } } });
  const resisted = cast("vampiric-touch", { sourceItem: caster, targetItem: resistant, amount: 15, id: "a2" });
  assert.deepEqual(resisted.causality.spell.casterHeal, { amount: 3, before: 20, after: 23 });
  assert.equal(resisted.operations.some((operation) => operation.type === "spell:upsert"), false);
  assert.equal(cast("vampiric-touch", { sourceItem: caster, outcome: "miss", id: "a3" }).casterHealChange, undefined);
});
