// Species traits that change hit points: the catalog, the amounts from the sheet, the plans of the HP write, the last
// damage read from the history, Relentless Endurance's notice and the combat log lines.
import assert from "node:assert/strict";
import test from "node:test";
import { SPECIES_FEATURES } from "../src/speciesTraitCore.js";
import { planSpeciesHpTrait, speciesHealDice, speciesHpTraitAmount, speciesLastDamageTaken, speciesReductionHint } from "../src/speciesHpTraitCore.js";
import { relentlessEnduranceFeature, relentlessEnduranceNotice, shouldAnnounceRelentlessEndurance } from "../src/classFeatureReminderCore.js";
import { buildCombatLogPresentation } from "../src/combatLogPresentationCore.js";

const META = "com.thebigpicture.initiative/meta";
const feature = (id) => SPECIES_FEATURES.find((entry) => entry.id === id);
const card = (level, mods = {}, species = null) => ({ characterBuild: [{ classId: "guerriero", level }],
  abilityModifiers: { str: 0, dex: 0, con: 2, int: 0, wis: 0, cha: 0, ...mods }, ...(species ? { species } : {}) });
const meta = (hp, hpMax = 40, extra = {}) => ({ hp, hpMax, ...extra });

test("the catalog: 18 traits that change hit points; Healing Hands touches a creature", () => {
  const traits = SPECIES_FEATURES.filter((entry) => entry.hpTrait);
  assert.equal(traits.length, 18);
  const kinds = traits.reduce((count, entry) => ({ ...count, [entry.hpTrait.kind]: (count[entry.hpTrait.kind] || 0) + 1 }), {});
  assert.deepEqual(kinds, { relentless: 2, heal: 2, temp: 3, shift: 8, reduce: 3 });
  const hands = feature("specie-aasimar-mani-guaritrici");
  assert.equal(hands.targetMode, "selection");
  assert.deepEqual(hands.targeting, { mode: "single-target", rangeMeters: 1.5, maxTargets: 1, excludeSource: false });
  assert.equal(feature("specie-goliath-resistenza-della-pietra").targetMode, "self");
  assert.doesNotMatch(feature("specie-shifter-mutazione-pelle-bestiale").description, /a mano/);
});

test("amounts from the sheet: level, proficiency bonus, Constitution", () => {
  assert.equal(speciesHpTraitAmount("level", card(7)), 7);
  assert.equal(speciesHpTraitAmount("pb", card(5)), 3);
  assert.equal(speciesHpTraitAmount("2pb", card(5)), 6);
  assert.equal(speciesHpTraitAmount("con-min1", card(5, { con: -1 })), 1);
  assert.equal(speciesHpTraitAmount("level-con-min1", card(1, { con: -3 })), 1);
  assert.equal(speciesHpTraitAmount("level-con-min1", card(4, { con: 2 })), 6);
  assert.equal(speciesHpTraitAmount("con-min1", { characterBuild: [] }), null, "no modifier on the sheet");
  assert.deepEqual(speciesHealDice({ dice: "pb-d4" }, card(9)), { count: 4, faces: 4, min: 4, max: 16, label: "4d4" });
  assert.equal(speciesReductionHint(feature("specie-goliath-resistenza-della-pietra").hpTrait, card(3)), "1d12 + 2");
  assert.equal(speciesReductionHint(feature("specie-hadozee-schivata-hadozee").hpTrait, card(5)), "1d6 + 3");
});

test("Relentless Endurance: 0 → 1 HP, only at 0 HP, never while dead or rolling death saves", () => {
  const relentless = feature("specie-mezzorco-tenacia-implacabile");
  const plan = planSpeciesHpTrait({ feature: relentless, card: card(5), targetMeta: meta(0) });
  assert.deepEqual([plan.ok, plan.change.afterHP], [true, 1]);
  assert.match(planSpeciesHpTrait({ feature: relentless, card: card(5), targetMeta: meta(3) }).blocker, /solo a 0 PF/);
  assert.match(planSpeciesHpTrait({ feature: relentless, card: card(5), targetMeta: meta(0, 40, { deathSaves: { successes: 0, failures: 1 } }) }).blocker,
    /tiri contro la morte/);
  assert.match(planSpeciesHpTrait({ feature: relentless, card: card(5),
    targetMeta: meta(0, 40, { conditions: { instances: [{ condition: "Morto" }] } }), targetName: "Grom" }).blocker, /Grom è morto/);
});

test("Healing Hands: the level (Volo) or the d4s rolled (Mostri del Multiverso), never above the maximum", () => {
  const volo = planSpeciesHpTrait({ feature: feature("specie-aasimar-mani-guaritrici"), card: card(6), targetMeta: meta(30) });
  assert.deepEqual([volo.amount, volo.change.afterHP], [6, 36]);
  const capped = planSpeciesHpTrait({ feature: feature("specie-aasimar-mani-guaritrici"), card: card(6), targetMeta: meta(38) });
  assert.equal(capped.change.afterHP, 40);
  const motm = feature("specie-aasimar-multiverso-mani-guaritrici");
  assert.match(planSpeciesHpTrait({ feature: motm, card: card(5), targetMeta: meta(10), value: "13" }).blocker, /3d4 \(3–12\)/);
  assert.equal(planSpeciesHpTrait({ feature: motm, card: card(5), targetMeta: meta(10), value: "8" }).change.afterHP, 18);
  assert.match(planSpeciesHpTrait({ feature: motm, card: card(5), targetMeta: meta(40), value: "8", targetName: "Zar" }).blocker, /Zar ha già tutti i PF/);
});

test("temporary hit points: Adrenaline Rush, Hungry Jaws (hit or miss) and Shifting with Beasthide's d6", () => {
  const rush = planSpeciesHpTrait({ feature: feature("specie-orco-multiverso-scarica-di-adrenalina"), card: card(5), targetMeta: meta(40) });
  assert.deepEqual([rush.amount, rush.change.afterHP], [3, 43], "the part above hpMax is the temporary one");
  const kept = planSpeciesHpTrait({ feature: feature("specie-orco-multiverso-scarica-di-adrenalina"), card: card(5), targetMeta: meta(45) });
  assert.equal(kept.change.changed, false);
  assert.match(kept.warning, /non si sommano/);
  const jaws = feature("specie-lucertoloide-fauci-fameliche");
  assert.equal(planSpeciesHpTrait({ feature: jaws, card: card(3, { con: 3 }), targetMeta: meta(40) }).amount, 3);
  const missed = planSpeciesHpTrait({ feature: jaws, card: card(3), targetMeta: meta(40), hit: false });
  assert.deepEqual([missed.ok, missed.change], [true, null], "a missed bite spends only the use");
  assert.match(planSpeciesHpTrait({ feature: jaws, card: card(3), targetMeta: meta(0) }).blocker, /a 0 PF/);
  const beasthide = feature("specie-shifter-mutazione-pelle-bestiale");
  assert.match(planSpeciesHpTrait({ feature: beasthide, card: card(4), targetMeta: meta(40) }).blocker, /1d6 tirato/);
  const shifted = planSpeciesHpTrait({ feature: beasthide, card: card(4), targetMeta: meta(40), value: "5" });
  assert.deepEqual([shifted.amount, shifted.change.afterHP], [11, 51], "level 4 + Con 2 + d6 5");
  assert.equal(planSpeciesHpTrait({ feature: feature("specie-shifter-multiverso-mutazione-zanna-lunga"), card: card(5), targetMeta: meta(40) }).amount, 6);
});

test("Stone's Endurance: the smaller of the roll and the damage comes back, temporary hit points included", () => {
  const stone = feature("specie-goliath-resistenza-della-pietra");
  const plan = planSpeciesHpTrait({ feature: stone, card: card(5), targetMeta: meta(22), value: "9", damage: "18" });
  assert.deepEqual([plan.amount, plan.change.afterHP], [9, 31]);
  const all = planSpeciesHpTrait({ feature: stone, card: card(5), targetMeta: meta(38), value: "12", damage: "5" });
  assert.equal(all.change.afterHP, 43, "5 damage taken from 43 (3 temporary): all of it comes back");
  assert.match(planSpeciesHpTrait({ feature: stone, card: card(5), targetMeta: meta(22), value: "9" }).blocker, /danni subiti/);
});

test("the last damage from the history: only the token's last HP change, and only if nothing changed since", () => {
  const entry = (id, before, after, extra = {}) => ({ id, changes: [{ id: "grom", beforeMetadata: { hp: { present: true, value: before } },
    afterMetadata: { hp: { present: true, value: after } } }, ...(extra.others || [])] });
  const entries = [entry("e1", 40, 30), { id: "e2", changes: [{ id: "other", beforeMetadata: { hp: 10 }, afterMetadata: { hp: 2 } }] }];
  assert.deepEqual(speciesLastDamageTaken(entries, "grom", 30), { amount: 10, beforeHP: 40, afterHP: 30, entryId: "e1" });
  assert.equal(speciesLastDamageTaken(entries, "grom", 34), null, "the HP changed since");
  assert.equal(speciesLastDamageTaken([...entries, entry("e3", 30, 35)], "grom", 35), null, "the last change was a heal");
  assert.equal(speciesLastDamageTaken([], "grom", 30), null);
});

test("Relentless Endurance's notice: dropping to 0 HP with the use left", () => {
  const halfOrc = (hp, extra = {}) => ({ id: "grom", name: "Grom", layer: "CHARACTER", metadata: { [META]: {
    hp, hpMax: 40, initiativeCard: card(5, {}, { id: "mezzorco" }), ...extra } } });
  assert.equal(relentlessEnduranceFeature(halfOrc(10))?.id, "specie-mezzorco-tenacia-implacabile");
  assert.equal(shouldAnnounceRelentlessEndurance({ beforeItem: halfOrc(5), afterItem: halfOrc(0) }), true);
  assert.equal(shouldAnnounceRelentlessEndurance({ beforeItem: halfOrc(0), afterItem: halfOrc(0) }), false, "already at 0 HP");
  const spent = { classFeatureState: { version: 1, resources: { "specie-mezzorco-tenacia-implacabile-usi": { current: 0 } }, instances: [] } };
  assert.equal(shouldAnnounceRelentlessEndurance({ beforeItem: halfOrc(5, spent), afterItem: halfOrc(0, spent) }), false, "no use left");
  const dead = { conditions: { version: 2, instances: [{ condition: "Morto" }] } };
  assert.equal(shouldAnnounceRelentlessEndurance({ beforeItem: halfOrc(5), afterItem: halfOrc(0, dead) }), false, "killed outright");
  const notice = relentlessEnduranceNotice({ item: halfOrc(0), activationId: "n1" });
  assert.equal(notice.effectName, "Tenacia implacabile");
  assert.match(notice.instruction, /Resta a 1 PF/);
});

test("the combat log names the trait, what it did and the use spent", () => {
  const payload = { speciesTrait: { name: "Resistenza della pietra", actor: { id: "grom", name: "Grom" }, detail: "Riduzione 9 su 18 danni: 9 PF restituiti",
    damageFrom: "history", spent: [{ name: "Resistenza della pietra", before: 1, after: 0 }] } };
  const lines = buildCombatLogPresentation(null, [{ category: "hp", kind: "hp-species-trait", payload }]).events[0].details.flatMap((section) => section.lines);
  assert.ok(lines.includes("Tratto di specie: Resistenza della pietra di Grom"), lines.join(" | "));
  assert.ok(lines.includes("Riduzione 9 su 18 danni: 9 PF restituiti (danni dalla cronologia)"), lines.join(" | "));
  assert.ok(lines.includes("Speso: Resistenza della pietra 1 → 0"), lines.join(" | "));
  assert.ok(!lines.includes("Fonte: non tracciata"));
});
