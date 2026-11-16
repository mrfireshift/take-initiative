// Trasformazioni, lotto W7 (docs/PIANO_TRASFORMAZIONI.md): the four spells of a form, pure. The cast through the area panel
// and the coordinator is in transformationHpIntegration.test.js.
import assert from "node:assert/strict";
import test from "node:test";
import {
  transformationSpellApplications,
  transformationSpellContext,
  transformationSpellFieldContext,
} from "../src/transformationSpellsCore.js";
import { getSpellSaveWorkflowRule } from "../src/spellSaveWorkflowRules.js";
import { transformationFormAllowed, transformationSpellTemplate } from "../src/transformationFormsCore.js";

const META = "com.thebigpicture.initiative/meta";
const WOLF = { name: "Wolf", type: "beast", cr: "1/4", size: "medium", hitPoints: { average: 11 }, speeds: { walk: 12 }, actions: [] };
const OGRE = { name: "Ogre", type: "giant", cr: "2", size: "large", hitPoints: { average: 59 }, speeds: { walk: 12 }, actions: [] };
const TREX = { name: "Tyrannosaurus Rex", type: "beast", cr: "8", size: "huge", hitPoints: { average: 136 }, speeds: { walk: 15 }, actions: [] };
const token = (id, extra = {}) => ({ id, name: id, metadata: { [META]: { hp: 30, hpMax: 30, ...extra } } });
const pc = (id, level) => token(id, { attitude: "pc", initiativeCard: { characterBuild: [{ classId: "mago", level, subclassId: "" }] } });

test("W7: i quattro incantesimi hanno la loro pill, mente e capacità come dice il PHB 2014", () => {
  assert.deepEqual(Object.fromEntries(["shapechange", "polymorph", "true-polymorph", "animal-shapes"].map((id) => {
    const { conditionName, keepsMind, keepsFeatures, canCast } = transformationSpellTemplate(id);
    return [id, [conditionName, keepsMind, keepsFeatures, canCast]];
  })), {
    shapechange: ["Trasformazione", true, true, true],
    polymorph: ["Metamorfosi", false, false, false],
    "true-polymorph": ["Metamorfosi Pura", false, false, false],
    "animal-shapes": ["Forme Animali", true, false, false],
  });
  assert.equal(transformationSpellTemplate("fireball"), null);
  for (const id of ["shapechange", "polymorph", "true-polymorph", "animal-shapes"]) {
    assert.equal(getSpellSaveWorkflowRule(id)?.targeting?.context?.fields?.[0]?.type, "transformation-form", id);
  }
});

test("W7: i limiti: il livello del PG bersaglio, il GS sconosciuto di un mostro, il livello di chi lancia", () => {
  const onPc = transformationSpellContext({ spellId: "polymorph", target: pc("hero", 5) });
  assert.deepEqual(onPc, { kind: "polymorph", targetLevel: 5, crUnknown: true });
  assert.equal(transformationFormAllowed(TREX, onPc).allowed, false, "CR 8 over a 5th-level character");
  const onMonster = transformationSpellContext({ spellId: "polymorph", target: token("orc") });
  const check = transformationFormAllowed(TREX, onMonster);
  assert.deepEqual([check.allowed, check.note], [true, "GS del bersaglio sconosciuto: il limite lo controlla il tavolo."]);
  assert.equal(transformationFormAllowed(OGRE, onMonster).allowed, false, "Polymorph: a beast");
  assert.equal(transformationFormAllowed(OGRE, transformationSpellContext({ spellId: "true-polymorph", target: token("orc") })).allowed, true);
  assert.deepEqual(transformationSpellFieldContext({ spellId: "shapechange", casterLevel: 17 }), { kind: "shapechange", casterLevel: 17, crUnknown: true });
  assert.equal(transformationFormAllowed(TREX, transformationSpellFieldContext({ spellId: "animal-shapes" })).allowed, false,
    "Animal Shapes: Large or smaller, CR 4 or lower");
});

test("W7: le pill di un lancio: una per bersaglio preso, con la sua forma; gli errori in italiano", () => {
  const caster = pc("caster", 17);
  const shaped = transformationSpellApplications({ spellId: "animal-shapes", takenIds: ["a", "b"],
    targetContexts: { a: { form: WOLF }, b: { form: WOLF } }, items: [token("a"), token("b"), caster], caster });
  assert.equal(shaped.errors.length, 0);
  assert.deepEqual(shaped.applications.map((entry) => [entry.targetIds, entry.conditionName, entry.options.displayLabel]),
    [[["a"], "Forme Animali", "Forme Animali · Wolf"], [["b"], "Forme Animali", "Forme Animali · Wolf"]]);
  assert.deepEqual(shaped.applications[0].options.mechanics.movement.modes, { walk: { replaceMeters: 12 } });
  assert.equal(shaped.applications[0].options.mechanics.transformation.formHp, 11);
  const errors = transformationSpellApplications({ spellId: "polymorph", takenIds: ["down", "none"],
    targetContexts: { down: { form: WOLF } }, items: [token("down", { hp: 0 }), token("none")], caster }).errors;
  assert.deepEqual(errors, ["down è a 0 PF: Metamorfosi non ha effetto.", "none: scegli la forma."]);
  assert.deepEqual(transformationSpellApplications({ spellId: "shapechange", takenIds: ["ally"], targetContexts: { ally: { form: OGRE } },
    items: [token("ally"), caster], caster }).errors, ["Trasformazione: il bersaglio è chi lancia, non ally."]);
  assert.deepEqual(transformationSpellApplications({ spellId: "fireball", takenIds: ["a"] }), { applications: [], errors: [] });
});

// Lotto W7e (decisions of 16/11/2026): Mass Polymorph and the surge's sheep.
test("W7e: Metamorfosi di Massa: PF temporanei, una bestia fino al GS o a metà del livello", async () => {
  const { transformationTemporaryHpOf } = await import("../src/transformationHpCore.js");
  const shaped = transformationSpellApplications({ spellId: "xanathar-metamorfosi-di-massa", takenIds: ["hero"],
    targetContexts: { hero: { form: WOLF } }, items: [pc("hero", 5)] });
  const options = shaped.applications[0].options;
  assert.deepEqual([shaped.errors, options.displayLabel, options.mechanics.endsWhenTempHpGone, options.mechanics.tempHpLocked],
    [[], "Metamorfosi di Massa · Wolf", true, true]);
  assert.equal(transformationTemporaryHpOf({ active: true, mechanics: options.mechanics }), 11);
  const context = transformationSpellContext({ spellId: "xanathar-metamorfosi-di-massa", target: pc("hero", 5) });
  assert.equal(transformationFormAllowed({ ...WOLF, cr: "2" }, context).allowed, true, "CR 2 within half of 5");
  assert.match(transformationFormAllowed({ ...WOLF, cr: "3" }, context).reasons[0], /oltre metà del livello del bersaglio \(5°\)/);
  assert.equal(getSpellSaveWorkflowRule("xanathar-metamorfosi-di-massa")?.targeting?.maximum, 10);
});

test("W7e: l'Impulso 77–78 apre Metamorfosi sullo stregone con la pecora già scelta", async () => {
  const { CLASS_FEATURE_BY_ID } = await import("../src/classFeatureCatalog.js");
  const { getSpellDefinition } = await import("../src/spells-srd.js");
  const { WILD_MAGIC_SURGE_FEATURE_ID, WILD_MAGIC_SURGE_SHEEP_FORM, planWildMagicSurgeAction } = await import("../src/wildMagicSurgeCore.js");
  const { buildSpellUnifiedPanelRouteQuery, normalizeSpellUnifiedPanelOpenRequest } = await import("../src/spellUnifiedPanelRoutingCore.js");
  const { sanitizeTransformationForm } = await import("../src/transformationFormsCore.js");
  const row = CLASS_FEATURE_BY_ID.get(WILD_MAGIC_SURGE_FEATURE_ID).wildMagicTable.find((entry) => entry.d100 === "77-78");
  const plan = planWildMagicSurgeAction(row, { sorcererId: "sor", sorcererName: "Zefiro", spell: getSpellDefinition(row.spellId) });
  assert.deepEqual([plan.ok, plan.route.spellId, plan.route.targetIds, plan.route.targetContext.sor.form.name],
    [true, "polymorph", ["sor"], "Pecora"]);
  const query = Object.fromEntries(new URLSearchParams(buildSpellUnifiedPanelRouteQuery(plan.route)));
  assert.equal(normalizeSpellUnifiedPanelOpenRequest(query).targetContext?.sor?.form?.name, "Pecora", "the sheep goes through the panel's route");
  const sheep = sanitizeTransformationForm(WILD_MAGIC_SURGE_SHEEP_FORM);
  assert.deepEqual([sheep.type, sheep.cr, sheep.hitPoints.average, sheep.actions[0].label], ["beast", "0", 4, "Cornata"]);
  assert.equal(transformationFormAllowed(sheep, transformationSpellContext({ spellId: "polymorph", target: pc("sor", 3) })).allowed, true);
});

// 16/11/2026: the portrait of the form, from the GM's 5eTools image mirror.
test("ritratto: il percorso da 5eTools, anche per una forma rapida salvata prima; la pill lo porta se scelto", async () => {
  const { transformationFormPortraitPath, transformationFormPortraitUrl, sanitizeTransformationForm } = await import("../src/transformationFormsCore.js");
  assert.equal(transformationFormPortraitPath({ source: "5etools", ref: "Brown Bear|MM" }), "bestiary/tokens/MM/Brown%20Bear.webp");
  assert.equal(transformationFormPortraitPath({ source: "manual", ref: "Brown Bear|MM" }), "", "a form typed as text has none");
  assert.equal(sanitizeTransformationForm({ ...WOLF, portrait: "bestiary/tokens/MM/Wolf.webp" }).portrait, "bestiary/tokens/MM/Wolf.webp");
  assert.equal(sanitizeTransformationForm({ ...WOLF, portrait: "../../etc/passwd" }).portrait, undefined);
  assert.equal(transformationFormPortraitUrl({ source: "5etools", ref: "Wolf|MM" }, ""), "", "no mirror, no portrait");
  assert.equal(transformationFormPortraitUrl({ source: "5etools", ref: "Wolf|MM" }, "https://images.test/img/"),
    "https://images.test/img/bestiary/tokens/MM/Wolf.webp");
  const portrait = { url: "https://images.test/img/bestiary/tokens/MM/Wolf.webp", width: 280, height: 280 };
  const shaped = transformationSpellApplications({ spellId: "polymorph", takenIds: ["orc"],
    targetContexts: { orc: { form: WOLF, formPortrait: portrait } }, items: [token("orc")] });
  assert.deepEqual(shaped.applications[0].options.mechanics.transformation.portrait, { ...portrait, mime: "image/webp" });
  const plain = transformationSpellApplications({ spellId: "polymorph", takenIds: ["orc"], targetContexts: { orc: { form: WOLF, formPortrait: "" } },
    items: [token("orc")] });
  assert.equal(plain.applications[0].options.mechanics.transformation.portrait, undefined);
});
