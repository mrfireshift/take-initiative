// Trasformazioni, lotto W3 (docs/PIANO_TRASFORMAZIONI.md): la console usa la forma che la pill della Forma Selvatica porta.
// W3a: gli attacchi della forma tra le azioni concesse, magici col Colpo Primordiale; armi, soffio e incantesimi della
// scheda messi da parte, salvo Incantesimi Bestiali. W3b: CA, TS e immunità del bersaglio trasformato (G26, G27).
import assert from "node:assert/strict";
import test from "node:test";
import { spellGrantedActionForItem, spellGrantedActionsForItem } from "../src/spellGrantedActionsCore.js";
import { pcAttackPickerEntries } from "../src/pcAttackPickerCore.js";
import { pcAttackTargetConditionImmune, pcAttackTargetSaveBonus } from "../src/pcAttackCore.js";
import { reactionPromptEffectText } from "../src/reactionPromptView.js";
import { activeTransformation, transformedCardView } from "../src/transformationCore.js";

const META = "com.thebigpicture.initiative/meta";
const bite = { id: "form-1", label: "Bite", kind: "attack", range: "melee", attackBonus: 4, components: [{ type: "piercing", formula: "2d4+2" }] };
const wolf = { name: "Wolf", ref: "Wolf|MM", source: "5etools", type: "beast", cr: "1/4", size: "medium", armorClass: 13,
  abilities: { str: 12, dex: 15, con: 12, int: 3, wis: 12, cha: 6 }, speeds: { walk: 12 }, conditionImmunities: ["avvelenato"],
  actions: [bite] };
const scimitar = { id: "scimitar", label: "Scimitarra", kind: "attack", range: "melee", components: [{ type: "slashing", formula: "1d6+2" }] };
const cantrips = { id: "cantrip", label: "Trucchetto", kind: "attack", source: { kind: "cantrip", spellIds: ["fire-bolt"] } };

function druid({ level = 4, circle = "", form = wolf, active = true } = {}) {
  return {
    id: "druid",
    name: "Ilse",
    metadata: {
      [META]: {
        hp: 30,
        hpMax: 30,
        initiativeCard: {
          characterBuild: [{ classId: "druido", level, subclassId: circle }],
          armorClass: 12,
          abilityModifiers: { str: 0, dex: 2, con: 1, int: 0, wis: 3, cha: 0 },
          savingThrows: { str: 0, dex: 4, con: 1, int: 2, wis: 5, cha: 0 },
          quickActions: [scimitar, cantrips],
        },
        conditions: { version: 2, instances: [{ id: "class-feature:ws1:druid", condition: "Forma Selvatica", active,
          effectId: "druido-forma-selvatica",
          parentEffectId: "ws1",
          mechanics: { transformation: { kind: "wild-shape", keepsMind: true, keepsFeatures: true, canCast: false, ...(form ? { form } : {}) } } }] },
      },
    },
  };
}

test("W3a: gli attacchi della forma sono azioni concesse, con un id che dice la pill; l'elenco sa della forma", () => {
  const actions = spellGrantedActionsForItem(druid());
  assert.deepEqual(actions.map((action) => [action.id, action.label, action.magical === true]),
    [["spell-grant:form-ws1-form-1", "Bite", false]]);
  assert.deepEqual(actions.transformation, { name: "Wolf", canCast: false });
  assert.equal(Object.keys(actions).length, 1, "the transformation is a property of the list, not an element");
  assert.equal(spellGrantedActionForItem(druid(), "spell-grant:form-ws1-form-1").label, "Bite");
  assert.equal(spellGrantedActionsForItem(druid({ active: false })).transformation, undefined, "a pill turned off");
  assert.equal(spellGrantedActionsForItem(druid({ form: null })).transformation, undefined, "a pill without a form (the sheet)");
});

test("W3a: Colpo Primordiale (Luna, 6°) rende magici gli attacchi; Incantesimi Bestiali (18°) lascia lanciare", () => {
  assert.equal(spellGrantedActionsForItem(druid({ level: 6, circle: "druido-circolo-della-luna" }))[0].magical, true);
  assert.equal(spellGrantedActionsForItem(druid({ level: 5, circle: "druido-circolo-della-luna" }))[0].magical, undefined);
  assert.equal(spellGrantedActionsForItem(druid({ level: 6, circle: "druido-circolo-della-terra" }))[0].magical, undefined);
  assert.equal(spellGrantedActionsForItem(druid({ level: 18 })).transformation.canCast, true);
});

test("W3a: in forma la console mostra gli attacchi della forma, non le armi né gli incantesimi della scheda", () => {
  const card = druid().metadata[META].initiativeCard;
  const normal = pcAttackPickerEntries(card, { grantedActions: [] });
  assert.ok(normal.some((entry) => entry.label === "Scimitarra"));
  assert.ok(normal.some((entry) => entry.tab === "cantrips"));
  const shaped = pcAttackPickerEntries(card, { grantedActions: spellGrantedActionsForItem(druid()) });
  assert.deepEqual(shaped.filter((entry) => entry.tab === "attacks").map((entry) => entry.label), ["Bite"]);
  assert.equal(shaped.some((entry) => entry.tab === "cantrips" || entry.tab === "spells"), false);
  assert.ok(shaped.some((entry) => entry.tab === "features"), "the features stay");
  const moon = pcAttackPickerEntries(card, { grantedActions: spellGrantedActionsForItem(druid({ level: 6, circle: "druido-circolo-della-luna" })) });
  assert.equal(moon.find((entry) => entry.label === "Bite").magical, true);
  const beastSpells = pcAttackPickerEntries(card, { grantedActions: spellGrantedActionsForItem(druid({ level: 18 })) });
  assert.ok(beastSpells.some((entry) => entry.tab === "cantrips"), "Beast Spells: the spells come back");
  assert.equal(beastSpells.some((entry) => entry.label === "Scimitarra"), false, "the weapons do not");
});

test("W3b: il bersaglio in forma tira i TS fisici della forma, con la competenza del druido; la mente resta sua", () => {
  const item = druid();
  assert.equal(pcAttackTargetSaveBonus(item, "str"), 1, "the wolf's Strength");
  assert.equal(pcAttackTargetSaveBonus(item, "dex"), 4, "the wolf's +2 with the druid's proficiency (+4 on the sheet over +2)");
  assert.equal(pcAttackTargetSaveBonus(item, "con"), 1);
  assert.equal(pcAttackTargetSaveBonus(item, "wis"), 5, "the druid's own Wisdom save");
  assert.equal(pcAttackTargetSaveBonus(druid({ form: null }), "str"), 0, "no form: the sheet");
  const view = transformedCardView(item.metadata[META].initiativeCard, activeTransformation(item.metadata[META]));
  assert.equal(view.armorClass, 13);
  assert.deepEqual(view.abilityModifiers, { str: 1, dex: 2, con: 1, int: 0, wis: 3, cha: 0 });
  const polymorphed = transformedCardView(item.metadata[META].initiativeCard,
    { form: wolf, template: { kind: "polymorph", keepsMind: false, keepsFeatures: false } });
  assert.equal(polymorphed.savingThrows.wis, 1, "Polymorph: the beast's mind");
  assert.equal(polymorphed.savingThrows.dex, 2, "and no proficiency of the creature");
});

test("W3b: le immunità della forma si sommano a quelle della creatura; la CA della forma negli avvisi di reazione", () => {
  assert.equal(pcAttackTargetConditionImmune(druid(), "Avvelenato"), true);
  assert.equal(pcAttackTargetConditionImmune(druid({ form: null }), "Avvelenato"), false);
  const shield = { reactionId: "shield", short: "+5 CA", reactorId: "druid" };
  assert.equal(reactionPromptEffectText(shield, [druid()]), "+5 CA · CA 13 → 18: un tiro da 13 a 17 diventa Mancato");
  assert.equal(reactionPromptEffectText(shield, [druid({ form: null })]), "+5 CA · CA 12 → 17: un tiro da 12 a 16 diventa Mancato");
});

test("W3b: la scheda della card mostra la CA della forma, con la sua nel titolo; finita la forma, la sua", async () => {
  const { transformationArmorClassView } = await import("../src/transformationFormsCore.js");
  const meta = (item) => item.metadata[META];
  const inForm = druid();
  assert.deepEqual(transformationArmorClassView(meta(inForm).initiativeCard, meta(inForm)),
    { armorClass: 13, title: "CA di Wolf, finché dura la forma; la sua: 12" });
  const ended = druid({ active: false });
  assert.deepEqual(transformationArmorClassView(meta(ended).initiativeCard, meta(ended)), { armorClass: 12, title: "" });
  assert.deepEqual(transformationArmorClassView({}, {}), { armorClass: null, title: "" });
});

test("W3a: l'id dell'attacco della forma resta uguale dopo la pulizia della console, anche con gli id lunghi di Owlbear", async () => {
  const { pcAttackAction } = await import("../src/pcAttackCore.js");
  const item = druid();
  const pill = item.metadata[META].conditions.instances[0];
  pill.id = "class-feature:3f2b9c1e-7d4a-4c8e-9b1f-2a6d5e8c4b7a:5c1d9e2f-8a7b-4c3d-9e1f-0a2b3c4d5e6f";
  pill.parentEffectId = "3f2b9c1e-7d4a-4c8e-9b1f-2a6d5e8c4b7a";
  const [action] = spellGrantedActionsForItem(item);
  assert.equal(pcAttackAction(action).id, action.id);
  assert.ok(action.id.length <= 96);
  assert.equal(spellGrantedActionForItem(item, pcAttackAction(action).id).label, "Bite");
});
