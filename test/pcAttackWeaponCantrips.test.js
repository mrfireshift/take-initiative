import assert from "node:assert/strict";
import test from "node:test";
import { buildPcAttackMutation, pcAttackCantripIds, pcAttackPreview, pcAttackRiderOptions, pcAttackWeaponCantripOptions } from "../src/pcAttackCore.js";
import { getPcAttackCantrip, pcAttackWeaponCantripDice } from "../src/pcAttackCantripCatalog.js";

const META = "com.thebigpicture.initiative/meta";
const rapier = { id: "rapier", label: "Stocco", kind: "attack", range: "melee", components: [{ type: "piercing" }] };
const bow = { id: "bow", label: "Arco", kind: "attack", range: "ranged", components: [{ type: "piercing" }] };
const knows = (spellIds) => ({ id: "cantrip", label: "Trucchetto", kind: "attack", source: { kind: "cantrip", ...(spellIds ? { spellIds } : {}) } });
const creature = (id, name, meta = {}) => ({ id, name, type: "IMAGE", layer: "CHARACTER", metadata: { [META]: { hp: 30, hpMax: 30, inInitiative: true, ...meta } } });
const card = (level, spellIds = ["tasha-lama-roboante", "tasha-lama-verdefiamma"]) => ({ characterBuild: [{ classId: "ladro", level }], quickActions: [rapier, knows(spellIds)] });
const vex = (level = 5, spellIds) => creature("vex", "Vex", { initiativeCard: card(level, spellIds) });
const goblin = (meta = {}) => creature("goblin", "Goblin", meta);
const imp = (meta = {}) => creature("imp", "Imp", { hp: 10, hpMax: 10, ...meta });
const turnState = { round: 1, order: ["vex", "goblin", "imp"], current: 0 };
const plan = (overrides = {}) => buildPcAttackMutation({ action: rapier, sourceItem: vex(), targetItem: goblin(), outcome: "hit", componentAmounts: { c1: 7 },
  attackInstanceId: "blade-1", turnState, ...overrides });

test("weapon cantrip dice by character level", () => {
  const booming = getPcAttackCantrip("tasha-lama-roboante"), green = getPcAttackCantrip("tasha-lama-verdefiamma");
  assert.deepEqual([1, 5, 11, 17].map((level) => pcAttackWeaponCantripDice(booming, level)),
    [{ hit: "", trigger: "1d8" }, { hit: "1d8", trigger: "2d8" }, { hit: "2d8", trigger: "3d8" }, { hit: "3d8", trigger: "4d8" }]);
  assert.deepEqual([1, 5, 11, 17].map((level) => pcAttackWeaponCantripDice(green, level)),
    [{ hit: "", secondary: "mod." }, { hit: "1d8", secondary: "1d8 + mod." }, { hit: "2d8", secondary: "2d8 + mod." }, { hit: "3d8", secondary: "3d8 + mod." }]);
});

test("a melee weapon attack offers the weapon cantrips the actor knows; the cantrip console never does", () => {
  assert.deepEqual(pcAttackWeaponCantripOptions(rapier, card(5)).map((option) => option.spellId), ["tasha-lama-roboante", "tasha-lama-verdefiamma"]);
  assert.deepEqual(pcAttackWeaponCantripOptions(rapier, card(5, ["tasha-lama-roboante", "fire-bolt"])).map((option) => option.spellId), ["tasha-lama-roboante"]);
  assert.equal(pcAttackWeaponCantripOptions(rapier, { characterBuild: [], quickActions: [rapier, knows()] }).length, 2, "an action listing none offers all");
  assert.deepEqual(pcAttackWeaponCantripOptions(bow, card(5)), [], "only melee weapon attacks");
  assert.deepEqual(pcAttackWeaponCantripOptions(rapier, { quickActions: [rapier] }), [], "no cantrip action, no weapon cantrip");
  assert.equal(pcAttackCantripIds(knows()).includes("tasha-lama-roboante"), false);
});

test("Booming Blade: extra thunder on the hit and its pill from the spell catalog with the movement damage", () => {
  const result = plan({ weaponCantrip: { spellId: "tasha-lama-roboante", amount: 5 } });
  assert.deepEqual(result.damageComponents.map((c) => [c.id, c.type, c.amount]), [["c1", "piercing", 7], ["w:tasha-lama-roboante", "thunder", 5]]);
  const pill = result.operations.find((operation) => operation.type === "condition:add");
  assert.equal(pill.conditionName, "Movimento: danni tuono");
  assert.match(pill.options.effectDetail, /Danni: 2d8 da tuono\.$/);
  assert.deepEqual(pill.options.expiry, { mode: "turn-start", actor: "source", remaining: 1, anchor: "next-turn" });
  assert.ok(result.operations.some((operation) => operation.type === "spell:upsert"));
  assert.deepEqual(result.causality.weaponCantrip, { spellId: "tasha-lama-roboante", name: "Lama Roboante", type: "thunder", dice: "1d8",
    triggerDice: "2d8", pills: ["Movimento: danni tuono"] });
  const low = plan({ sourceItem: vex(4), weaponCantrip: { spellId: "tasha-lama-roboante" } });
  assert.equal(low.damageComponents.length, 1, "no extra dice before 5th level");
  assert.match(low.operations.find((operation) => operation.type === "condition:add").options.effectDetail, /Danni: 1d8 da tuono\./);
});

test("Green-Flame Blade: the fire jumps to a second creature with its own defenses and hit points, in the same command", () => {
  const result = plan({ weaponCantrip: { spellId: "tasha-lama-verdefiamma", amount: 4, secondary: { targetId: "imp", amount: 6 } },
    secondaryItem: imp(), expectedSecondaryDefenses: {} });
  assert.deepEqual(result.operations[0].updates.map((update) => [update.itemId, update.hp]), [["goblin", 19], ["imp", 4]]);
  assert.deepEqual(result.options.targetIds, ["goblin", "imp"]);
  assert.deepEqual(result.causality.targets.map((target) => [target.id, target.outcome, target.requestedDamage]), [["goblin", "hit", 11], ["imp", "secondary", 6]]);
  assert.equal(result.options.metadataPatches.at(-1).id, "imp");
  const immune = { immunities: ["fire"], resistances: [], vulnerabilities: [] };
  const fireproof = plan({ weaponCantrip: { spellId: "tasha-lama-verdefiamma", amount: 4, secondary: { targetId: "imp", amount: 6 } },
    secondaryItem: imp({ initiativeCard: { damageDefenses: immune } }), expectedSecondaryDefenses: immune });
  assert.deepEqual(fireproof.operations[0].updates.map((update) => update.itemId), ["goblin"]);
  assert.throws(() => plan({ weaponCantrip: { spellId: "tasha-lama-verdefiamma", amount: 4, secondary: { targetId: "imp", amount: 6 } },
    secondaryItem: imp({ initiativeCard: { damageDefenses: immune } }), expectedSecondaryDefenses: {} }), /difese/);
  assert.throws(() => plan({ weaponCantrip: { spellId: "tasha-lama-verdefiamma", amount: 4, secondary: { targetId: "goblin", amount: 6 } },
    secondaryItem: goblin() }), /un'altra creatura/);
  assert.throws(() => plan({ weaponCantrip: { spellId: "tasha-lama-roboante", amount: 4, secondary: { targetId: "imp", amount: 6 } },
    secondaryItem: imp() }), /nessuna seconda creatura/);
});

test("weapon cantrips need a hit and a known cantrip; weapon riders still apply", () => {
  assert.throws(() => plan({ outcome: "miss", componentAmounts: {}, weaponCantrip: { spellId: "tasha-lama-roboante" } }), /solo se l'attacco colpisce/);
  assert.throws(() => plan({ sourceItem: vex(5, ["fire-bolt"]), weaponCantrip: { spellId: "tasha-lama-roboante", amount: 3 } }), /non disponibile/);
  assert.throws(() => plan({ weaponCantrip: { spellId: "tasha-lama-roboante" } }), /Inserisci il danno|danno/);
  const sneak = pcAttackRiderOptions({ action: rapier, sourceItem: vex(), targetItem: goblin(), turnState })[0];
  assert.equal(sneak.available, true, "Booming Blade is a weapon attack: Sneak Attack applies");
  const both = plan({ weaponCantrip: { spellId: "tasha-lama-roboante", amount: 5 }, riders: [{ id: "ladro-attacco-furtivo", type: "piercing", amount: 10 }] });
  assert.equal(both.change.requested, 22);
  const preview = pcAttackPreview({ action: rapier, sourceItem: vex(), targetItem: goblin(), outcome: "hit", amounts: { c1: "7" },
    weaponCantrip: { spellId: "tasha-lama-verdefiamma", amount: "4", secondary: { targetId: "imp", amount: "6" } }, secondaryItem: imp() });
  assert.deepEqual([preview.ready, preview.total, preview.secondary.total, preview.secondary.hp.after], [true, 11, 6, 4]);
  assert.equal(pcAttackPreview({ action: rapier, sourceItem: vex(), targetItem: goblin(), outcome: "hit", amounts: { c1: "7" },
    weaponCantrip: { spellId: "tasha-lama-roboante", amount: "" } }).blocker, "Inserisci il danno di Lama Roboante.");
});
