// M5 of the class features' defenses (08/11): ✦ Magica in the attack console. A weapon attack marked magical gets through
// the defenses against nonmagical attacks; the console keeps them in view struck through, and a click applies one again to
// that hit. The card remembers the flag; the features that make attacks magical are reminded beside it.
import assert from "node:assert/strict";
import test, { mock } from "node:test";

const sdk = { onReady() {}, player: { getRole: async () => "GM" }, room: {}, broadcast: { onMessage: () => () => {}, sendMessage: async () => {} },
  scene: { items: { getItems: async () => [] }, getMetadata: async () => ({}) } };
mock.module("@owlbear-rodeo/sdk", { exports: { default: sdk, buildLabel() {}, buildImage() {}, buildPath() {}, buildShape() {}, buildText() {}, Command: class {} } });
const { sanitizeQuickAction, quickActionMonsterAttackFields } = await import("../src/quickActionsCore.js");
const { buildPcAttackMutation, pcAttackAreaPreview, pcAttackAreaRowDamage, pcAttackDefenseText, pcAttackMagicHint, pcAttackMagicToggleable,
  pcAttackPreview } = await import("../src/pcAttackCore.js");
const { pcAttackPickerEntries } = await import("../src/pcAttackPickerCore.js");
const { createPcAttackRuntime } = await import("../src/pcAttackExecution.js");
const { damageDefensesForItem } = await import("../src/damageDefensesCore.js");
const { fiveToolsMonsterToStatblock } = await import("../src/fiveToolsMonsterCore.js");
const { parseCharacterSheetImport } = await import("../src/characterSheetImportCore.js");

const META = "com.thebigpicture.initiative/meta";
const BPS = ["bludgeoning", "piercing", "slashing"];
const creature = (id, card, attitude = "enemy") => ({ id, name: id, type: "IMAGE", layer: "CHARACTER", position: { x: 0, y: 0 },
  metadata: { [META]: { hp: 50, hpMax: 50, attitude, inInitiative: true, initiativeCard: card } } });
const sword = (extra = {}) => ({ version: 2, id: "sword", label: "Spada lunga +1", kind: "attack", targetMode: "selection", range: "melee",
  components: [{ id: "c1", type: "slashing", formula: "1d8+4" }], ...extra });
const devil = creature("devil", { damageDefenses: { resistances: ["cold", ...BPS] }, monster: { source: "5etools", nonmagicalDefenses: { types: BPS, except: ["silvered"] } } });
const hero = creature("hero", { quickActions: [sword()] }, "pc");

test("the flag is stored only on a weapon attack and only when on; the sheet's editor keeps it", () => {
  assert.equal(sanitizeQuickAction(sword({ magical: true })).magical, true);
  assert.equal(Object.hasOwn(sanitizeQuickAction(sword({ magical: false })), "magical"), false);
  assert.equal(Object.hasOwn(sanitizeQuickAction(sword()), "magical"), false, "an action of before keeps its shape");
  assert.deepEqual(quickActionMonsterAttackFields(sanitizeQuickAction(sword({ magical: true }))), { magical: true }, "kept by the editor's row");
  const save = { id: "spit", label: "Sputo", kind: "attack", range: "ranged", save: "dex", saveDC: 13, saveHalf: true, components: [{ type: "acid" }], magical: true };
  assert.equal(Object.hasOwn(sanitizeQuickAction(save), "magical"), false, "never on a save action");
  const cantrip = { id: "cantrips", label: "Trucchetti", kind: "attack", source: { kind: "cantrip", spellIds: ["phb2014-frusta-di-spine"] }, magical: true };
  assert.equal(Object.hasOwn(sanitizeQuickAction(cantrip), "magical"), false);
  assert.deepEqual([pcAttackMagicToggleable(sword()), pcAttackMagicToggleable(save), pcAttackMagicToggleable(cantrip)], [true, false, false]);
});

test("the preview: struck through with the reason, full damage; a click applies it again to this hit", () => {
  const hit = (action, extra = {}) => pcAttackPreview({ action, sourceItem: hero, targetItem: devil, outcome: "hit", amounts: { c1: 9 }, ...extra });
  const plain = hit(sword());
  assert.equal(plain.total, 4, "a nonmagical sword: resisted");
  assert.equal(plain.defenses[0].magic, undefined);
  const magic = hit(sword({ magical: true }));
  assert.equal(magic.total, 9);
  assert.deepEqual(magic.defenses, [{ type: "slashing", defense: "resistance", ignored: true, nonmagical: "non magici né d'argento", magic: true }]);
  const chip = { ...magic.defenses[0], ...magic.defenseCounts.find((row) => row.type === "slashing"), short: true };
  assert.equal(pcAttackDefenseText(chip), "Res. taglienti non magici · superata (arma magica)");
  const again = hit(sword({ magical: true }), { reappliedDefenses: ["slashing"] });
  assert.equal(again.total, 4);
  assert.equal(again.defenses[0].ignored, false);
  assert.equal(pcAttackDefenseText({ ...again.defenses[0], ...again.defenseCounts[0], short: true }), "Res. taglienti non magici: 9 → 4");
  const cold = hit(sword({ magical: true, components: [{ id: "c1", type: "cold" }] }));
  assert.equal(cold.total, 4, "a resistance that holds against magic too stays as it is");
  assert.equal(cold.defenses[0].magic, undefined);
});

test("the commit takes the same numbers, from the live action", () => {
  const commit = (action, reappliedDefenses = []) => buildPcAttackMutation({ action, sourceItem: hero, targetItem: devil, outcome: "hit",
    componentAmounts: { c1: 9 }, attackInstanceId: "pc-attack:m5", expectedDefenses: damageDefensesForItem(devil, META), reappliedDefenses });
  const damage = (plan) => plan.damageComponents.reduce((sum, component) => sum + component.amount, 0);
  assert.equal(damage(commit(sword())), 4);
  assert.equal(damage(commit(sword({ magical: true }))), 9);
  assert.equal(commit(sword({ magical: true })).damageComponents[0].defenseIgnored, "resistance", "the log says what did not count");
  assert.equal(damage(commit(sword({ magical: true }), ["slashing"])), 4);
});

test("a spell's damage hides them as before; an area of a magic weapon says why on the creature's row", () => {
  const whip = { version: 2, id: "cantrips", label: "Trucchetti", kind: "attack", targetMode: "selection", source: { kind: "cantrip", spellIds: ["phb2014-frusta-di-spine"] } };
  const spell = pcAttackPreview({ action: whip, spellId: "phb2014-frusta-di-spine", sourceItem: hero, targetItem: devil, outcome: "hit", amounts: { c1: 9 } });
  assert.deepEqual([spell.total, spell.defenses.length], [9, 0]);
  assert.equal(pcAttackAreaRowDamage({ counted: true, total: 9, defenseCounts: [{ type: "piercing", defense: "resistance", ignored: true, magic: true, before: 9, after: 9 }] }).reason,
    "Res. perforanti · superata (arma magica)");
});

test("Piercing Arrow from a magic bow: the line's creatures take it in full", () => {
  const arrow = "guerriero-arciere-arcano-tiro-arcano-freccia-perforante";
  const archer = creature("archer", { characterBuild: [{ classId: "guerriero", level: 7, subclassId: "guerriero-arciere-arcano" }],
    classFeaturesConfigured: true, enabledClassFeatureIds: ["guerriero-arciere-arcano-tiro-arcano", arrow, "guerriero-arciere-arcano-freccia-magica"] }, "pc");
  const bow = { version: 2, id: "bow", label: "Arco lungo", kind: "attack", targetMode: "selection", range: "ranged", components: [{ id: "c1", type: "piercing", formula: "1d8+3" }] };
  const area = (action) => pcAttackAreaPreview({ action, attackMode: arrow, sourceItem: archer,
    members: [{ item: devil, outcome: "failed" }], amounts: { c1: 9 }, modeAmount: 4 });
  const plain = area(bow);
  assert.equal(plain.rows.length, 1, plain.blocker);
  assert.deepEqual(plain.rows[0].defenseCounts.map((row) => [row.type, row.before, row.after]), [["piercing", 13, 6]], "the die adds to the piercing");
  const magic = area({ ...bow, magical: true }).rows[0];
  assert.equal(magic.total, 13);
  assert.equal(pcAttackAreaRowDamage(magic).reason, "Res. perforanti (non magici né d'argento) · superata (arma magica)");
  assert.equal(pcAttackMagicHint(bow, archer.metadata[META].initiativeCard), "Freccia Magica: le frecce scoccate con un arco possono esserlo");
});

test("the picker marks a magic weapon; the features remind it beside ✦ Magica while it is off", () => {
  const entries = pcAttackPickerEntries({ quickActions: [sword({ magical: true }), sword({ id: "dagger", label: "Pugnale" })] });
  assert.deepEqual(entries.filter((entry) => entry.tab === "attacks").map((entry) => [entry.actionId, entry.magical === true]), [["sword", true], ["dagger", false]]);
  const monk = { characterBuild: [{ classId: "monaco", level: 6 }] };
  const unarmed = sword({ id: "fist", label: "Colpo senz'armi", components: [{ id: "c1", type: "bludgeoning", formula: "1d6+4" }] });
  assert.equal(pcAttackMagicHint(unarmed, monk), "Colpi Ki Potenziati: i colpi senz'armi sono magici");
  assert.equal(pcAttackMagicHint(sword({ label: "Bastone" }), monk), "", "a staff is no unarmed strike");
  assert.equal(pcAttackMagicHint(unarmed, { characterBuild: [{ classId: "monaco", level: 5 }] }), "", "from the 6th level");
  assert.equal(pcAttackMagicHint({ ...unarmed, magical: true }, monk), "", "on: nothing to remind");
  const pact = { characterBuild: [{ classId: "warlock", level: 3 }], classFeaturesConfigured: true,
    enabledClassFeatureIds: ["warlock-dono-del-patto", "warlock-dono-del-patto-patto-della-lama"] };
  assert.equal(pcAttackMagicHint(sword(), pact), "Patto della Lama: l'arma del patto è magica");
  assert.equal(pcAttackMagicHint(sword(), { characterBuild: [{ classId: "warlock", level: 3 }] }), "", "the pact is a choice of the sheet");
});

test("the console writes the flag on the card, a partial save that keeps the other actions as they are", async () => {
  const dagger = sword({ id: "dagger", label: "Pugnale", components: [{ id: "c1", type: "piercing", formula: "1d4+2" }] });
  const item = creature("hero", { quickActions: [sword(), dagger] }, "pc");
  const saves = [];
  const api = { player: { getRole: async () => "GM" }, scene: { items: { getItems: async (ids) => (!ids || ids.includes(item.id) ? [item] : []) }, getMetadata: async () => ({}) } };
  const runtime = createPcAttackRuntime({ api, getSceneContext: async () => ({ commandId: "cmd", sceneIdentity: "scene-a" }), getEpoch: () => 1,
    isCurrentEpoch: () => true, saveCard: async (id, name, value, options) => { saves.push({ id, name, value, options }); } });
  assert.deepEqual(await runtime.setPcAttackActionMagical({ sourceId: "hero", actionId: "sword", magical: true }), { magical: true });
  assert.equal(saves.length, 1);
  assert.deepEqual(saves[0].value.quickActions.map((action) => [action.id, action.magical === true]), [["sword", true], ["dagger", false]]);
  assert.deepEqual([saves[0].options.sceneIdentity, saves[0].options.preserveExhaustion], ["scene-a", true]);
  item.metadata[META].initiativeCard = { quickActions: saves[0].value.quickActions };
  await runtime.setPcAttackActionMagical({ sourceId: "hero", actionId: "sword", magical: false });
  assert.equal(Object.hasOwn(saves[1].value.quickActions[0], "magical"), false, "off: the field goes away");
  await assert.rejects(runtime.setPcAttackActionMagical({ sourceId: "hero", actionId: "missing", magical: true }), /Attacco con arma non trovato/);
});

// M5b: the 5eTools import marks them by itself, down to the card's attacks.
test("from 5eTools: a monster whose weapon attacks are magical, and any spell attack, arrive with the flag", () => {
  const convert = (fields) => fiveToolsMonsterToStatblock({ name: "Test", source: "MM", ac: [15], hp: { average: 30 }, speed: { walk: 30 }, ...fields });
  const claw = { name: "Claw", entries: ["{@atk mw} {@hit 8} to hit, reach 5 ft., one target. {@h}12 ({@damage 2d8 + 3}) slashing damage."] };
  const ray = { name: "Ray", entries: ["{@atk rs} {@hit 7} to hit, range 60 ft., one target. {@h}10 ({@damage 3d6}) piercing damage."] };
  const golem = convert({ trait: [{ name: "Magic Weapons", entries: ["The golem's weapon attacks are magical."] }], action: [claw] });
  assert.deepEqual(golem.block.actions.map((action) => [action.name, action.magical === true]), [["Claw", true]]);
  assert.ok(golem.report.includes("attacchi magici, già segnati ✦ nella console: Claw"));
  const attacks = parseCharacterSheetImport(JSON.stringify(golem.block)).sections.attacks;
  assert.equal(attacks[0].magical, true, "on the card's attack");
  const plain = convert({ action: [claw, ray] });
  assert.deepEqual(plain.block.actions.map((action) => [action.name, action.magical === true]), [["Claw", false], ["Ray", true]]);
  assert.equal(parseCharacterSheetImport(JSON.stringify(plain.block)).sections.attacks[0].magical, undefined);
});
