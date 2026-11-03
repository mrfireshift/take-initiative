// CAP-STABILIZE of docs/PIANO_AUTOMAZIONE_INCANTESIMI.md: who Spare the Dying and Revivify can affect. The expectations
// below are read from the 2014 texts, not from the definitions under test.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { creatureIsDead, planStabilizeTarget, returnFromDeathCondition } from "../src/stabilizeSpellRules.js";

const META_KEY = "com.thebigpicture.initiative/meta";
const pill = (id, condition, extra = {}) => ({ id, condition, active: true, ...extra });
const creature = (hp, hpMax, { pills = [], ...extra } = {}) => ({ id: "target", name: "Aria",
  metadata: { [META_KEY]: { hp, hpMax, conditions: { version: 2, instances: pills }, ...extra } } });
const pc = (hp, hpMax = 30, extra = {}) => creature(hp, hpMax, { attitude: "pc", ...extra });
const spare = (item) => planStabilizeTarget({ spellId: "spare-the-dying", item });
const revivify = (item) => planStabilizeTarget({ spellId: "revivify", item });
const MORTO = pill("dead-1", "Morto");

test("dead: Morto on any creature, or a creature that is no PC at 0 HP; a PC at 0 HP is dying", () => {
  assert.equal(creatureIsDead(pc(0).metadata[META_KEY]), false);
  assert.equal(creatureIsDead(pc(0, 30, { pills: [MORTO] }).metadata[META_KEY]), true);
  assert.equal(creatureIsDead(creature(0, 7, { attitude: "enemy" }).metadata[META_KEY]), true);
  assert.equal(creatureIsDead(creature(3, 7, { attitude: "enemy" }).metadata[META_KEY]), false);
  assert.equal(creatureIsDead(creature(3, 7, { pills: [MORTO] }).metadata[META_KEY]), true);
  assert.equal(creatureIsDead(creature(0, 7, { pills: [pill("dead-2", "Morto", { active: false })], attitude: "pc" }).metadata[META_KEY]), false, "an ended pill does not count");
});

test("Spare the Dying: a dying PC becomes stable, its tally emptied only when it has one", () => {
  const dying = spare(pc(0, 30, { deathSaves: { successes: 1, failures: 2 } }));
  assert.deepEqual([dying.error, dying.stabilize, dying.clearTally, dying.healing], ["", true, true, 0]);
  const fresh = spare(pc(0));
  assert.deepEqual([fresh.error, fresh.stabilize, fresh.clearTally], ["", true, false]);
});

test("Spare the Dying refuses who it cannot affect", () => {
  assert.match(spare(pc(5)).error, /non è a 0 PF/u);
  assert.match(spare(pc(0, 30, { pills: [pill("stable-1", "Stabile")] })).error, /già stabile/u);
  assert.match(spare(pc(0, 30, { pills: [MORTO] })).error, /è morta/u);
  assert.match(spare(creature(0, 7, { attitude: "enemy" })).error, /è morta/u, "no PC at 0 HP is dead");
  assert.match(spare(pc(0, 30, { creatureType: "Non morto" })).error, /costrutti e non morti/u);
  assert.match(spare(pc(0, 30, { creatureType: "Costrutto" })).error, /costrutti e non morti/u);
  assert.match(spare({ id: "target", name: "Aria", metadata: { [META_KEY]: { attitude: "pc" } } }).error, /non ha PF/u);
});

test("Revivify: back to 1 HP, Morto gone with a zombie that was going to rise", () => {
  const dead = revivify(pc(0, 30, { pills: [MORTO, pill("zombie-1", "Si rianima come zombi", { effectId: "finger-of-death-zombie" }),
    pill("other-1", "Avvelenato")] }));
  assert.equal(dead.error, "");
  assert.equal(dead.healing, 1);
  assert.deepEqual(dead.removeInstanceIds, ["dead-1", "zombie-1"], "the poison stays: Revivify does not cure it");
  const monster = revivify(creature(0, 7, { attitude: "enemy" }));
  assert.deepEqual([monster.error, monster.healing, monster.removeInstanceIds], ["", 1, []]);
});

test("Revivify refuses the living, the dying and Disintegrate's dust", () => {
  assert.match(revivify(pc(5)).error, /non è morta/u);
  assert.match(revivify(pc(0)).error, /non è morta/u, "a PC at 0 HP is still dying");
  assert.match(revivify(creature(0, 7, { attitude: "enemy", pills: [pill("dead-3", "Morto",
    { effectDetail: "Disintegrato: cumulo di polvere grigia (tranne gli oggetti magici)." })] })).error, /Resurrezione pura/u);
});

const truly = (item) => planStabilizeTarget({ spellId: "true-resurrection", item });
const reincarnate = (item) => planStabilizeTarget({ spellId: "reincarnate", item });

test("True Resurrection: all the HP; it ends poison, diseases and curses, not what the text leaves", () => {
  const plan = truly(pc(0, 30, { pills: [MORTO, pill("p-1", "Avvelenato"), pill("d-1", "Peste", { mechanics: { contagionDiseaseId: "x" } }),
    pill("c-1", "Svant.", { effectId: "curse-wasted-action" }), pill("h-1", "Sortilegio", { spellId: "phb2014-sortilegio" }),
    pill("s-1", "Spaventato"), pill("n-1", "Prono")] }));
  assert.equal(plan.healing, 30);
  assert.deepEqual(plan.removeInstanceIds, ["dead-1", "p-1", "d-1", "c-1", "h-1"]);
  assert.equal(truly(creature(4, 7, { pills: [MORTO] })).healing, 3, "the HP it is missing");
  assert.match(truly(pc(5)).error, /non è morta/u);
  assert.equal(truly(pc(0, 30, { pills: [pill("dead-3", "Morto", { effectDetail: "Disintegrato: polvere." })] })).error, "", "the dust comes back");
});

test("Reincarnate: 1 HP with a note; the dust and a creature the token says is no humanoid are refused", () => {
  const plan = reincarnate(pc(0, 30, { pills: [MORTO, pill("p-1", "Avvelenato")] }));
  assert.deepEqual([plan.error, plan.healing, plan.removeInstanceIds], ["", 1, ["dead-1"]]);
  assert.match(plan.note, /Aria torna a 1 PF.*d100/u);
  assert.equal(reincarnate(creature(0, 7, { attitude: "enemy", creatureType: "Umanoide (goblinoide)" })).error, "");
  assert.equal(reincarnate(creature(0, 7, { attitude: "enemy" })).error, "", "no type on the token: the GM has chosen");
  assert.match(reincarnate(creature(0, 7, { attitude: "enemy", creatureType: "Bestia" })).error, /umanoide/u);
  assert.match(reincarnate(pc(0, 30, { pills: [pill("dead-3", "Morto", { effectDetail: "Disintegrato: polvere." })] })).error, /Resurrezione pura/u);
  assert.match(reincarnate(pc(0)).error, /non è morta/u);
});

const raise = (item) => planStabilizeTarget({ spellId: "raise-dead", item });
const resurrect = (item) => planStabilizeTarget({ spellId: "resurrection", item });

test("Raise Dead and Resurrection: 1 HP and all the HP, the poison gone, −4 to come; the disease stays: it is Contagion's, magical", () => {
  const dead = pc(0, 30, { pills: [MORTO, pill("p-1", "Avvelenato"), pill("d-1", "Peste", { mechanics: { contagionDiseaseId: "x" } })] });
  for (const [plan, healing] of [[raise(dead), 1], [resurrect(dead), 30]]) {
    assert.deepEqual([plan.error, plan.healing, plan.returnPenalty, plan.removeInstanceIds], ["", healing, 4, ["dead-1", "p-1"]]);
  }
  assert.equal(raise(dead).note, "");
  assert.match(resurrect(dead).note, /un anno o più/u);
});

test("a second return from death starts the penalty over, from one pill", () => {
  const plan = raise(pc(0, 30, { pills: [MORTO, pill("r-1", "Ritorno dalla morte −1", { effectId: "return-from-death" })] }));
  assert.deepEqual([plan.returnPenalty, plan.removeInstanceIds], [4, ["dead-1", "r-1"]]);
});

test("Raise Dead and Resurrection refuse the living, the dust and an undead, not a construct", () => {
  for (const plan of [raise, resurrect]) {
    assert.match(plan(pc(5)).error, /non è morta/u);
    assert.match(plan(pc(0, 30, { pills: [pill("dead-3", "Morto", { effectDetail: "Disintegrato: polvere." })] })).error, /Resurrezione pura/u);
    assert.match(plan(creature(0, 22, { attitude: "enemy", creatureType: "Non morto" })).error, /non morto/u);
    assert.equal(plan(creature(0, 22, { attitude: "enemy", creatureType: "Costrutto" })).error, "");
  }
});

test("the pill of the return from death: its value in the name, to read at the table", () => {
  const { conditionName, options } = returnFromDeathCondition(3);
  assert.equal(conditionName, "Ritorno dalla morte −3");
  assert.deepEqual([options.effectId, options.mechanics.returnFromDeathPenalty, options.expiry.mode], ["return-from-death", 3, "manual"]);
  assert.equal(options.effectKind, undefined, "a debuff with no spell pill around it would be hidden on the card");
  assert.match(options.effectDetail, /−3 ai tiri per colpire, ai tiri salvezza e alle prove/u);
});

test("the pills of an instantaneous spell show on the card: the penalty and the zombie", async () => {
  const { __compactEffectItems } = await import("../src/initiativeCardCompact.js");
  const { planHpBranchAfterDamage } = await import("../src/hpBranchSpellRules.js");
  const labels = (instance) => __compactEffectItems([{ id: "pill-1", active: true, ...instance }], [], false).map((effect) => effect.label);
  const { conditionName, options } = returnFromDeathCondition(4);
  assert.deepEqual(labels({ condition: conditionName, ...options }), ["Ritorno dalla morte −4"]);
  const { pills: [zombie] } = planHpBranchAfterDamage({ spellId: "xanathar-flusso-di-energia-negativa", outcome: "failed",
    item: { name: "Goblin", metadata: { [META_KEY]: { hpMax: 7 } } }, change: { hp: 7, afterHP: 0, requested: 31, hpMax: 7 } });
  assert.deepEqual(labels({ condition: zombie.condition, effectId: zombie.effectId, expiry: zombie.expiry, effectKind: zombie.effectKind }), ["Si rianima come zombi"]);
});

test("the panel shows why the spell refuses the creature, not a generic failure", () => {
  const panel = readFileSync(new URL("../src/spell-unified-panel.js", import.meta.url), "utf8");
  assert.match(panel, /code === "stabilize-target-invalid" && result\.errors\[0\]\.message/u);
});

test("Revivify on Morto with HP above 0 only takes the pill off", () => {
  const plan = revivify(creature(4, 7, { pills: [MORTO] }));
  assert.deepEqual([plan.error, plan.healing, plan.removeInstanceIds], ["", 0, ["dead-1"]]);
});
