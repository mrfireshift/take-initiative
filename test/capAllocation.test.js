// CAP-ALLOCATION (PHB 2014): Mass Heal's 700 hit points split among the targets, the conditions it ends and the
// creatures it skips. The owner's decisions A-D1–A-D4 of 11/11/2026.
import test from "node:test";
import assert from "node:assert/strict";

import { ID } from "../src/constants.js";
import {
  MASS_HEAL_SPELL_ID,
  massHealAllocation,
  massHealAllocationText,
  parseMassHealShare,
} from "../src/massHealCore.js";
import { CLEANSE_SPELL_ID_SET, planCleanseTarget } from "../src/cleanseSpellRules.js";
import { getSpellSaveWorkflowRule } from "../src/spellSaveWorkflowRules.js";
import { MULTI_TARGET_SAVE_SPELL_IDS } from "../src/areaSaveSpellRules.js";
import { buildSpellUnifiedPanelContract, createSpellPanelSession } from "../src/spellUnifiedPanelCore.js";
import { buildUnifiedPanelViewModel } from "../src/spellUnifiedPanelViewCore.js";

const META = `${ID}/meta`;
const hp = (entries) => Object.fromEntries(Object.entries(entries).map(([id, [now, max]]) => [id, { hp: now, hpMax: max }]));
const allocate = (targetIds, written = {}, hpById = {}) => massHealAllocation({
  targetIds,
  targetContexts: Object.fromEntries(Object.entries(written).map(([id, share]) => [id, { share }])),
  hpById,
});

test("A-D1: le caselle vuote partono dai PF che mancano, in ordine, finché bastano i 700", () => {
  const full = allocate(["a", "b", "c"], {}, hp({ a: [10, 40], b: [0, 50], c: [20, 20] }));
  assert.deepEqual(full.byTarget, { a: 30, b: 50, c: 0 });
  assert.equal(full.assigned, 80);
  assert.equal(massHealAllocationText(full), "PF assegnati 80/700");
  const short = allocate(["a", "b", "c", "d"], {}, hp({ a: [0, 300], b: [0, 300], c: [0, 300], d: [0, 300] }));
  assert.deepEqual(short.byTarget, { a: 300, b: 300, c: 100, d: 0 });
  assert.equal(short.valid, true);
});

test("A-D1: una casella scritta viene prima, e si ferma ai PF che mancano al bersaglio", () => {
  const written = allocate(["a", "b"], { b: "650" }, hp({ a: [0, 300], b: [0, 700] }));
  assert.deepEqual(written.byTarget, { a: 50, b: 650 });
  const capped = allocate(["a", "b"], { a: "100" }, hp({ a: [10, 40], b: [0, 50] }));
  assert.deepEqual(capped.byTarget, { a: 30, b: 50 });
  assert.deepEqual(capped.cappedIds, ["a"]);
  const zero = allocate(["a"], { a: "0" }, hp({ a: [10, 40] }));
  assert.deepEqual(zero.byTarget, { a: 0 });
});

test("oltre i 700, una casella che non è un numero, nessun bersaglio: non valido", () => {
  const over = allocate(["a", "b"], { a: "400", b: "400" }, hp({ a: [0, 500], b: [0, 500] }));
  assert.equal(over.error, "over");
  assert.equal(over.assigned, 800);
  assert.equal(allocate(["a"], { a: "tanti" }, hp({ a: [0, 50] })).error, "invalid");
  assert.equal(allocate([], {}, {}).error, "no-targets");
  assert.equal(parseMassHealShare(" 12 "), 12);
  assert.equal(parseMassHealShare(""), "");
  assert.equal(parseMassHealShare("1.5"), null);
});

const creature = (id, meta = {}, instances = []) => ({
  id,
  name: id,
  metadata: { [META]: { hp: 10, hpMax: 40, conditions: { version: 2, instances }, ...meta } },
});
const pill = (id, condition, extra = {}) => ({ id, condition, active: true, expiry: { mode: "manual" }, ...extra });

test("A-D2: la sua parte e le condizioni di Guarigione, anche su chi ha già tutti i PF", () => {
  assert.ok(CLEANSE_SPELL_ID_SET.has(MASS_HEAL_SPELL_ID));
  const blind = creature("dars", { hp: 40, hpMax: 40 }, [
    pill("b", "Accecato"),
    pill("d", "Assordato"),
    pill("s", "Spaventato"),
    pill("c", "Contagio: Febbre", { effectId: "contagion-fever" }),
  ]);
  const plan = planCleanseTarget({ spellId: MASS_HEAL_SPELL_ID, item: blind, context: { massHealShare: 0 } });
  assert.equal(plan.healing, 0);
  assert.deepEqual(plan.removeInstanceIds.sort(), ["b", "c", "d"]);
  assert.equal(planCleanseTarget({ spellId: MASS_HEAL_SPELL_ID, item: creature("sera"), context: { massHealShare: 25 } }).healing, 25);
});

test("A-D3 e A-D4: costrutti, non morti e morti restano come sono, con una nota", () => {
  const undead = planCleanseTarget({ spellId: MASS_HEAL_SPELL_ID, item: creature("zombie", { creatureType: "Non morto" }),
    context: { massHealShare: 30 } });
  assert.equal(undead.healing, 0);
  assert.match(undead.note, /costrutti e non morti/u);
  const dead = planCleanseTarget({ spellId: MASS_HEAL_SPELL_ID, item: creature("bryn", { hp: 0 }, [pill("m", "Morto")]),
    context: { massHealShare: 40 } });
  assert.equal(dead.healing, 0);
  assert.match(dead.note, /è morta/u);
});

test("nel pannello: bersagli senza limite entro 18 m, una casella PF per ciascuno", () => {
  assert.ok(MULTI_TARGET_SAVE_SPELL_IDS.includes(MASS_HEAL_SPELL_ID));
  const rule = getSpellSaveWorkflowRule(MASS_HEAL_SPELL_ID);
  assert.equal(rule.targeting.unlimitedTargets, true);
  assert.deepEqual({ ...rule.targeting.spatial }, { mode: "caster-range", maxMeters: 18 });
  assert.deepEqual(rule.targeting.context.fields.map((field) => [field.id, field.type, field.required]), [["share", "number", false]]);
});

function view(targetContext = {}) {
  const contract = buildSpellUnifiedPanelContract({ spellId: MASS_HEAL_SPELL_ID, phase: "cast", castContext: { slotLevel: 9 } });
  const session = createSpellPanelSession({ contract, casterId: "cleric", targetIds: ["dars", "sera"], slotLevel: 9, targetContext });
  return buildUnifiedPanelViewModel({
    contract,
    session,
    casterOptions: [{ value: "cleric", label: "Chierico" }],
    targetCandidates: [
      { key: "dars", label: "Dars", subtitle: "Creatura", hp: 10, hpMax: 60 },
      { key: "sera", label: "Sera", subtitle: "Creatura", hp: 5, hpMax: 38 },
    ],
  });
}

test("il contatore «PF assegnati N/700», i segnaposto delle caselle vuote e l'anteprima di ogni bersaglio", () => {
  const model = view();
  const context = model.targets.context;
  assert.equal(context.label, "PF da ripartire");
  assert.equal(context.summary, "PF assegnati 83/700");
  assert.equal(context.summaryInvalid, false);
  const placeholders = Object.fromEntries(context.targets.map((target) => [target.key, target.placeholders?.share]));
  assert.deepEqual(placeholders, { dars: "50", sera: "33" });
  const rows = new Map(model.effects.preview.targets.map((row) => [row.key, row]));
  assert.equal(rows.get("dars").afterHP, 60);
  assert.equal(rows.get("sera").afterHP, 38);
  const written = view({ dars: { share: "20" } });
  assert.equal(written.targets.context.summary, "PF assegnati 53/700");
  assert.equal(written.targets.context.targets.find((target) => target.key === "dars").placeholders, undefined);
  assert.equal(new Map(written.effects.preview.targets.map((row) => [row.key, row])).get("dars").afterHP, 30);
});
