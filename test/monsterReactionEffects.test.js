// The reactions and bonus actions of a monster that act on the map (27/11/2026, Strahd Reloaded, the Wizard of Wines):
// a reaction that casts a spell on the monster when it is attacked (Gift of the Gulthias), one that gives it a form keeping
// its hit points (Guardian of the Gulthias), a bonus action that casts a spell of 1 action (Speed of the Adder). The texts
// are invented, written as those stat blocks are.
import test, { mock } from "node:test";
import assert from "node:assert/strict";

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: { onReady() {}, scene: { items: { getItems: async () => [] } } },
    buildPath: () => ({}), buildLabel: () => ({}), buildImage: () => ({}), buildText: () => ({}), buildShape: () => ({}),
    Command: { MOVE: 0, LINE: 1, CUBIC: 2, CLOSE: 3 },
  },
});

const { monsterReactionFromEntry } = await import("../src/monsterReactionParseCore.js");
const { reactionCandidates } = await import("../src/reactionCandidatesCore.js");
const { pcAttackMonsterTraitEntries } = await import("../src/pcAttackMonsterTraitsCore.js");
const { MONSTER_FORM_TEMPLATE, transformationFormAllowed, transformationFormNamed, transformationPillParts, transformedCardView,
  activeTransformation } = await import("../src/transformationFormsCore.js");
const { transformationFormHpOf, transformationTemporaryHpOf } = await import("../src/transformationHpCore.js");

const META = "com.thebigpicture.initiative/meta";
const SPELLS = "com.thebigpicture.initiative/spells";
const BARK = { name: "Heartwood Ward",
  text: "In response to being attacked by a creature it can see, the thornwarden casts barkskin, provided it has a 2nd-level spell slot available. (The spell doesn't require concentration when cast in this way.)" };
const ROOTS = { name: "Root Mantle (1/day)",
  text: "In response to being targeted by an attack or spell, Veska magically polymorphs into a shambling mound for 1 minute. In her new form, Veska retains her game statistics (including her hit points), spellcasting abilities, and ability to speak, but her AC, movement modes, Strength, Dexterity, resistances, immunities, and special senses are replaced by those of her new form." };
const SWIFT = { name: "Swift Sap", text: "The thornwarden casts a spell it knows with a casting time of 1 action. (It can't cast another spell during the same turn, except for a cantrip with a casting time of 1 action.)" };

test("the two reactions read: the spell, its slot and no concentration; the form, its minutes and the hit points kept", () => {
  assert.deepEqual(monsterReactionFromEntry(BARK), { kind: "cast-when-attacked", name: "Heartwood Ward", text: BARK.text,
    spellName: "barkskin", slotLevel: 2, noConcentration: true });
  assert.deepEqual(monsterReactionFromEntry(ROOTS), { kind: "form-when-targeted", name: "Root Mantle (1/day)", text: ROOTS.text,
    formName: "shambling mound", minutes: 1, keepsHp: true });
  // A form that takes the form's hit points is not this kind of form: no keepsHp.
  const replaced = monsterReactionFromEntry({ name: "Shift", text: "In response to being targeted by an attack, the hag polymorphs into a giant owl for 10 minutes." });
  assert.equal(replaced.keepsHp, undefined);
  assert.equal(replaced.minutes, 10);
});

const creature = (id, meta = {}, name = id) => ({ id, name, layer: "CHARACTER", metadata: { [META]: { hp: 40, hpMax: 40, attitude: "pc", ...meta } } });
const hero = creature("hero", {}, "Mira");
const warden = (meta = {}) => creature("warden", { attitude: "enemy", initiativeCard: { armorClass: 11, characterBuild: [{ classId: "druido", level: 4 }],
  spellbook: { spellIds: ["barkskin", "produce-flame"] } }, ...meta }, "Guardiano");
const state = { round: 1, current: 0, order: ["hero", "warden"] };
const hit = { trigger: "hit", attackerId: "hero", targetIds: ["warden"], range: "melee", attackRoll: true, damageTypes: ["slashing"] };
const npcsOn = { actors: { pcs: true, npcs: true } };
const run = (target, reactions) => reactionCandidates(hit, { items: [hero, target], state, options: npcsOn,
  monsterReactions: { warden: reactions.map(monsterReactionFromEntry) } }).candidates;

test("Gift of the Gulthias in the prompt: Usa casts the spell, with its slot and without concentration", () => {
  const [candidate] = run(warden(), [BARK]);
  assert.equal(candidate.reactionId, "monster-cast-when-attacked");
  assert.equal(candidate.flow, "monster-cast");
  assert.equal(candidate.label, "Heartwood Ward");
  assert.equal(candidate.spellId, "barkskin");
  assert.equal(candidate.slotLevel, 2);
  assert.equal(candidate.noConcentration, true);
  assert.equal(candidate.short, "Lancia Pelle coriacea (slot di 2°)");
  // Not while barkskin lasts on it, nor without a 2nd-level slot left, nor when it cannot cast it.
  assert.deepEqual(run(warden({ [SPELLS]: [{ spellId: "barkskin", name: "Pelle coriacea" }] }), [BARK]), []);
  assert.deepEqual(run(warden({ classFeatureState: { resources: { "spell-slot-2": { current: 0, maximum: 3 } } } }), [BARK]), []);
  const noBook = creature("warden", { attitude: "enemy", initiativeCard: { armorClass: 11 } }, "Guardiano");
  assert.deepEqual(run(noBook, [BARK]), []);
});

test("Guardian of the Gulthias in the prompt: the form named, its minutes; never while already in a form", () => {
  const [candidate] = run(warden(), [ROOTS]);
  assert.equal(candidate.reactionId, "monster-form-when-targeted");
  assert.equal(candidate.flow, "monster-form");
  assert.equal(candidate.formName, "shambling mound");
  assert.equal(candidate.minutes, 1);
  assert.equal(candidate.short, "Forma: shambling mound");
  const inForm = warden({ conditions: { version: 2, instances: [{ id: "f", condition: "Forma", active: true,
    mechanics: { transformation: { ...MONSTER_FORM_TEMPLATE, form: { name: "Shambling Mound", type: "plant", cr: "5", speeds: { walk: 6 } } } } }] } });
  assert.deepEqual(run(inForm, [ROOTS]), []);
});

test("the monster's form keeps its hit points, its mind and its spells; the form brings its AC and no limit", () => {
  const mound = { name: "Shambling Mound", type: "plant", cr: "5", size: "large", armorClass: 15, hitPoints: { average: 136 },
    abilities: { str: 18, dex: 8, con: 16, int: 5, wis: 10, cha: 5 }, speeds: { walk: 6, swim: 6 },
    damageDefenses: { resistances: ["cold", "fire"], immunities: ["lightning"] } };
  assert.equal(transformationFormAllowed(mound, { kind: "monster-form" }).allowed, true);
  const parts = transformationPillParts({ template: MONSTER_FORM_TEMPLATE, form: mound, label: "Root Mantle" });
  const pill = { id: "p", active: true, mechanics: parts.mechanics };
  assert.equal(pill.mechanics.transformation.hitPoints, "own");
  assert.equal(transformationFormHpOf(pill), null, "no hit points swapped");
  assert.equal(transformationTemporaryHpOf(pill), null);
  assert.deepEqual(pill.mechanics.damageDefenses, { resistances: ["cold", "fire"], immunities: ["lightning"] });
  const meta = { conditions: { version: 2, instances: [pill] } };
  const view = transformedCardView({ armorClass: 11, abilityModifiers: { str: 0, dex: 1, int: 1, wis: 2 } }, activeTransformation(meta));
  assert.equal(view.armorClass, 15);
  assert.equal(view.abilityModifiers.str, 4);
  assert.equal(view.abilityModifiers.wis, 2, "its mind stays");
  // The card's quick form the text names, found by name.
  assert.equal(transformationFormNamed({ transformationForms: [mound] }, "shambling mound")?.name, "Shambling Mound");
  assert.equal(transformationFormNamed({ transformationForms: [mound] }, "giant owl"), null);
});

test("in the Capacità tab: what each entry can do, from its own text", () => {
  const view = { header: [], sections: [{ title: "Bonus Actions", entries: [SWIFT] }, { title: "Reactions", entries: [BARK, ROOTS] }] };
  assert.deepEqual(pcAttackMonsterTraitEntries(view).map((entry) => [entry.label, entry.monsterUse]), [
    ["Swift Sap", { kind: "action-spell" }],
    ["Heartwood Ward", { kind: "cast", spellName: "barkskin", slotLevel: 2, noConcentration: true }],
    ["Root Mantle (1/day)", { kind: "form", formName: "shambling mound", minutes: 1 }],
  ]);
});

// 27/11, second part: the reaction after the damage, Indomitable, the English names of the spells outside the SRD.
const MISTY = { name: "Fading Step", text: "In response to taking damage, Veska casts misty step." };
const STUBBORN = { name: "Stubborn Root", text: "Trigger: A hostile creature ends its turn. Effect: Veska can repeat the saving throw against one effect or condition currently affecting her. (This reaction has no effect if the effect or condition didn't originally require her to fail a saving throw.)" };

test("after the damage: the reaction gives the spell itself, with no slot and no book", () => {
  assert.deepEqual(monsterReactionFromEntry(MISTY), { kind: "cast-when-damaged", name: "Fading Step", text: MISTY.text, spellName: "misty step" });
  const veska = creature("warden", { attitude: "enemy", initiativeCard: { armorClass: 13 } }, "Veska");
  const candidates = reactionCandidates({ ...hit, trigger: "damage" }, { items: [hero, veska], state, options: npcsOn,
    monsterReactions: { warden: [monsterReactionFromEntry(MISTY)] } }).candidates;
  assert.deepEqual(candidates.map((candidate) => [candidate.reactionId, candidate.flow, candidate.timing, candidate.spellId, candidate.free, candidate.short]),
    [["monster-cast-when-damaged", "monster-cast", "after", "misty-step", true, "Lancia Passo velato (senza slot)"]]);
  const view = { header: [], sections: [{ title: "Reactions", entries: [MISTY, STUBBORN] }] };
  assert.deepEqual(pcAttackMonsterTraitEntries(view).map((entry) => entry.monsterUse), [
    { kind: "cast", spellName: "misty step", slotLevel: 0, noConcentration: false }, { kind: "repeat-save" }]);
});

test("Indomitable: the effects on it whose save can be repeated, with their ability and DC", async () => {
  const { repeatableSaveEffects } = await import("../src/monsterRepeatSaveCore.js");
  assert.equal(monsterReactionFromEntry(STUBBORN).kind, "repeat-save");
  const caster = creature("caster", { initiativeCard: { spellSaveDC: 14 } }, "Mira");
  const held = creature("warden", { attitude: "enemy", conditions: { version: 2, instances: [
    { id: "hold", condition: "Paralizzato", spellName: "Blocca persone", active: true, sourceId: "caster",
      saveReminder: { ability: "wis", timing: "turn-end", dcSource: "source-spell" } },
    { id: "slow", condition: "Lentezza", active: true, saveReminder: { ability: "wis", timing: "turn-end", dc: 15 } },
    { id: "prone", condition: "Prono", active: true },
  ] } }, "Veska");
  assert.deepEqual(repeatableSaveEffects(held, [caster, held]).map((effect) => [effect.instanceId, effect.label, effect.abilityLabel, effect.dc]),
    [["hold", "Blocca persone", "Saggezza", 14], ["slow", "Lentezza", "Saggezza", 15]]);
});

test("the English names of the spells outside the SRD: found, never shown", async () => {
  const { getSpellDefinition } = await import("../src/spells-srd.js");
  assert.deepEqual(["Thorn Whip", "gust", "Infestation", "snare", "Zephyr Strike", "cordon of arrows", "Absorb Elements"]
    .map((name) => [getSpellDefinition(name)?.id, getSpellDefinition(name)?.displayName]), [
    ["phb2014-frusta-di-spine", "Frusta di Spine"], ["xanathar-folata", "Folata"], ["xanathar-infestazione", "Infestazione"],
    ["xanathar-trabocchetto", "Trabocchetto"], ["xanathar-colpo-dello-zefiro", "Colpo dello Zefiro"], ["phb2014-cordone-di-frecce", "Cordone di Frecce"],
    ["xanathar-assorbire-elementi", "Assorbire Elementi"]]);
  assert.equal(getSpellDefinition("Gust of Wind")?.id, "gust-of-wind");
});
