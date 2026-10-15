// Tranche 6: Mark of the Frostmaiden, Detonation of the Mark and Frostmaiden's Kiss grammar, the v6 contract and mark helpers.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { importBossActionHTML, validateBossActionProfile } from "../src/bossActionProfileCore.js";
import { bossMarkEffectId, bossProfileMarkIds, bossMarkedDefenses, bossMarkApplies, bossTargetMarked } from "../src/bossActionExecutionCore.js";
import { bossDefendedDamage } from "../src/bossActionsViewCore.js";

const META = "com.thebigpicture.initiative/meta";
const phase2HTML = await readFile(new URL("fixtures/boss-actions/auril-phase-2.html", import.meta.url), "utf8");
const phase3HTML = await readFile(new URL("fixtures/boss-actions/auril-phase-3.html", import.meta.url), "utf8");
const ability = (profile, name) => profile.abilities.find((entry) => entry.name === name);
const p2 = await importBossActionHTML(phase2HTML);
const p3 = await importBossActionHTML(phase3HTML);

test("Mark of the Frostmaiden: one creature, CON 19, a mark with the cold-ward-break rule until removed", () => {
  const mark = ability(p2, "Mark of the Frostmaiden");
  assert.equal(mark.automation, "PARTIAL");
  assert.deepEqual(mark.usage, { limit: 1, period: "round" });
  assert.deepEqual(mark.execution, {
    kind: "save-effect", save: { ability: "con", dc: 19 }, target: { mode: "multiple", selection: "manual", maxTargets: 1, range: 60 },
    onFailed: { mark: { id: "mark-of-the-frostmaiden", rule: "cold-ward-break", expiry: { mode: "manual" } } },
  });
});

test("Detonation of the Mark: requires and consumes the same mark; Trattenuto until the end of the target's next turn", () => {
  const detonation = ability(p3, "Detonation of the Mark");
  assert.deepEqual(detonation.execution, {
    kind: "save-damage", save: { ability: "con", dc: 19 }, target: { mode: "single", maxTargets: 1 },
    damage: [{ id: "cold", formula: "4d8", type: "cold", printedAverage: 18 }, { id: "radiant", formula: "4d8", type: "radiant", printedAverage: 18 }],
    success: "half",
    onFailed: { conditions: [{ condition: "Trattenuto", expiry: { mode: "turn-end", actor: "target", remaining: 1, anchor: "next-turn" } }] },
    requiresMark: { id: "mark-of-the-frostmaiden" }, consumesMark: true,
  });
  assert.match(detonation.manualText, /^Libertà di movimento previene la condizione Trattenuto\./);
  assert.deepEqual(bossProfileMarkIds(p2), ["mark-of-the-frostmaiden"]);
  assert.deepEqual(bossProfileMarkIds(p3), ["mark-of-the-frostmaiden"], "phase 3 knows the mark through Detonation");
  assert.equal(bossMarkEffectId(p2, "mark-of-the-frostmaiden"), bossMarkEffectId(p3, "mark-of-the-frostmaiden"), "both phases share the pill");
});

test("Frostmaiden's Kiss: melee spell attack whose necrotic damage heals the boss; maximum HP stays manual", () => {
  const kiss = ability(p2, "Frostmaiden's Kiss");
  assert.deepEqual(kiss.usage, { limit: 1, period: "round" });
  assert.deepEqual(kiss.execution, {
    kind: "attack-damage", attack: { bonus: 11, type: "spell", modes: ["melee"], reach: 5 }, target: { mode: "single", maxTargets: 1 },
    damage: [{ id: "necrotic", formula: "4d8", type: "necrotic", printedAverage: 18 }, { id: "cold", formula: "2d6", type: "cold", printedAverage: 7 }],
    drain: { component: "necrotic", healsSource: true, maxHpReduction: "manual" },
  });
  assert.match(kiss.manualText, /^Riduci a mano il massimo dei Punti Ferita/);
});

test("any altered clause leaves Mark, Detonation or Kiss manual", async () => {
  for (const [html, name, from, to] of [
    [phase2HTML, "Mark of the Frostmaiden", "la sua Resistenza al freddo è ignorata", "la sua Resistenza al fuoco è ignorata"],
    [phase2HTML, "Mark of the Frostmaiden", "Auril non viene sconfitta", "Malar non viene sconfitta"],
    [phase2HTML, "Frostmaiden's Kiss", "e Auril recupera altrettanti Punti Ferita", "e Auril recupera il doppio dei Punti Ferita"],
    [phase2HTML, "Frostmaiden's Kiss", "danni necrotici più 7 (2d6) danni da freddo. Il massimo", "danni radiosi più 7 (2d6) danni da freddo. Il massimo"],
    [phase3HTML, "Detonation of the Mark", "fino alla fine del proprio turno successivo", "per 1 minuto"],
    [phase3HTML, "Detonation of the Mark", "Il marchio termina sul bersaglio sia con un fallimento sia con un successo.", "Il marchio resta."],
  ]) {
    assert.equal(html.split(from).length, 2, `${from} occurs once`);
    const entry = ability(await importBossActionHTML(html.replace(from, to)), name);
    assert.equal(entry.automation, "UNSUPPORTED", `${name}: ${to}`);
  }
});

test("version 6 validation accepts only the closed mark, drain and mark-requirement shapes; v5 cannot carry them", () => {
  for (const [profile, name, mutate] of [
    [p2, "Mark of the Frostmaiden", (e) => { e.execution.onFailed.mark.rule = "fire-ward-break"; }],
    [p2, "Mark of the Frostmaiden", (e) => { e.execution.onFailed.mark.expiry = { mode: "rounds", remaining: 10 }; }],
    [p2, "Mark of the Frostmaiden", (e) => { e.execution.onFailed.mark.id = "bad id"; }],
    [p2, "Frostmaiden's Kiss", (e) => { e.execution.drain.maxHpReduction = "automatic"; }],
    [p2, "Frostmaiden's Kiss", (e) => { e.execution.drain.component = "cold"; }],
    [p2, "Frostmaiden's Kiss", (e) => { e.execution.attack.modes = ["melee", "ranged"]; }],
    [p3, "Detonation of the Mark", (e) => { delete e.execution.consumesMark; }],
    [p3, "Detonation of the Mark", (e) => { e.execution.onFailed.conditions[0].condition = "Afferrato"; }],
    [p3, "Detonation of the Mark", (e) => { e.execution.grapple = "hold"; }],
  ]) {
    const invalid = structuredClone(profile);
    mutate(ability(invalid, name));
    assert.throws(() => validateBossActionProfile(invalid), /invalid|unsupported|unexpected|PARTIAL|manual/i, name);
  }
  for (const profile of [p2, p3]) {
    const abilities = profile.abilities.map(({ group, ...entry }) => entry); // only the v6 shapes can make it fail
    assert.throws(() => validateBossActionProfile(structuredClone({ ...profile, profileVersion: 5, parserVersion: 5, abilities })), /unexpected|unsupported|invalid/i);
  }
});

test("the mark rule: resistance ignored, immunity as resistance, spent once per round, only on actual cold damage", () => {
  assert.deepEqual(bossMarkedDefenses({ immunities: [], resistances: ["cold", "fire"], vulnerabilities: [] }), { immunities: [], resistances: ["fire"], vulnerabilities: [] });
  assert.deepEqual(bossMarkedDefenses({ immunities: ["cold"], resistances: [], vulnerabilities: ["fire"] }), { immunities: [], resistances: ["cold"], vulnerabilities: ["fire"] });
  const target = { id: "dars", metadata: { [META]: { conditions: { version: 2, instances: [{ id: "m", condition: "Mark of the Frostmaiden", effectId: "monster-mark:auril:mark-of-the-frostmaiden", active: true }] } } } };
  const boss = (markUses) => ({ id: "auril", metadata: { [META]: { bossActionState: markUses ? { markUses } : undefined } } });
  const components = ability(p2, "Icekiss +2").execution.damage;
  assert.equal(bossTargetMarked(target, p3), true);
  assert.equal(bossMarkApplies({ profile: p2, sourceItem: boss(), targetItem: target, round: 2, components, amounts: { slashing: 18, cold: 7 } }), true);
  assert.equal(bossMarkApplies({ profile: p2, sourceItem: boss({ dars: 2 }), targetItem: target, round: 2, components, amounts: { slashing: 18, cold: 7 } }), false, "spent this round");
  assert.equal(bossMarkApplies({ profile: p2, sourceItem: boss({ dars: 1 }), targetItem: target, round: 2, components, amounts: { slashing: 18, cold: 7 } }), true, "a new round");
  assert.equal(bossMarkApplies({ profile: p2, sourceItem: boss(), targetItem: target, round: 2, components, amounts: { slashing: 18, cold: 0 } }), false, "no cold damage");
  assert.equal(bossMarkApplies({ profile: p2, sourceItem: boss(), targetItem: target, round: 2, components, amounts: { slashing: 18, cold: 7 }, factor: "zero" }), false, "a miss");
  assert.equal(bossMarkApplies({ profile: p2, sourceItem: boss(), targetItem: target, round: 2, components: ability(p2, "Rock").execution.damage, amounts: { bludgeoning: 29 } }), false, "no cold component");
  assert.equal(bossDefendedDamage(components, { slashing: 18, cold: 7 }, "hit", { resistances: ["cold"] }, [], true), 25);
  assert.equal(bossDefendedDamage(components, { slashing: 18, cold: 7 }, "hit", { resistances: ["cold"] }, [], false), 21);
});

test("v7 presentation groups come only from explicit manifestation sub-headings and are validated", async () => {
  assert.deepEqual([...new Set(p2.abilities.filter((entry) => entry.group).map((entry) => entry.group))], ["Titano", "Proiezione Fatata", "Auril"]);
  assert.ok(p2.abilities.filter((entry) => entry.category === "trait").every((entry) => entry.group === undefined));
  assert.ok(p3.abilities.every((entry) => entry.group === undefined), "phase 3 has a single manifestation");
  const forged = structuredClone(p2);
  forged.abilities.find((entry) => entry.category === "trait").group = "Titano";
  assert.throws(() => validateBossActionProfile(forged), /group/);
  const long = structuredClone(p2);
  long.abilities.find((entry) => entry.group).group = "x".repeat(61);
  assert.throws(() => validateBossActionProfile(long), /group/);
  await assert.rejects(importBossActionHTML(phase2HTML.replace('<div class="section-title">Tratti</div>', '<div class="section-title">Tratti</div><div class="manifestation">Titano</div>')), /manifestation/);
});

test("v8 Spellcasting: a closed list of printed spells; any other spell or wording stays manual", async () => {
  const spellcasting = ability(p2, "Spellcasting");
  assert.deepEqual(spellcasting.execution.spells.map((entry) => [entry.spellId, entry.perDay ?? (entry.atWill ? "a volontà" : undefined)]),
    [["slow", 3], ["ice-storm", 3], ["freezing-sphere", 1], ["misty-step", "a volontà"]]);
  for (const mutate of [
    (e) => { e.execution.spells[1].spellId = "fireball"; },
    (e) => { e.execution.spells[1].name = "palla di fuoco"; },
    (e) => { e.execution.spells[1].spellId = "slow"; },
    (e) => { e.execution.spells[2].perDay = 0; },
    (e) => { e.execution.spells = []; },
    (e) => { e.execution.spellId = "slow"; },
  ]) {
    const invalid = structuredClone(p2);
    mutate(ability(invalid, "Spellcasting"));
    assert.throws(() => validateBossActionProfile(invalid), /invalid|unsupported|unexpected|empty/i);
  }
  const altered = await importBossActionHTML(phase2HTML.replace("lentezza, tempesta di ghiaccio", "lentezza, palla di fuoco"));
  assert.equal(ability(altered, "Spellcasting").automation, "UNSUPPORTED");
  const v7 = structuredClone({ ...p2, profileVersion: 7, parserVersion: 7 });
  assert.throws(() => validateBossActionProfile(v7), /unexpected|unsupported|invalid/i, "v7 Spellcasting referenced Slow alone");
});

test("v15 Spellcasting: passo velato at will, last in the list, a catalog spell the executor guard accepts", async () => {
  const { bossSpellReferenceIds } = await import("../src/bossActionProfileCore.js");
  const { getSpellDefinition } = await import("../src/spells-srd.js");
  const spellcasting = ability(p2, "Spellcasting");
  assert.deepEqual(spellcasting.execution.spells.at(-1), { spellId: "misty-step", name: "passo velato", atWill: true });
  assert.equal(bossSpellReferenceIds(spellcasting.execution)[0], "slow", "a request without a spell still opens Slow");
  assert.ok(bossSpellReferenceIds(spellcasting.execution).includes("misty-step"));
  assert.equal(getSpellDefinition("misty-step")?.id, "misty-step");
  for (const mutate of [
    (e) => { e.execution.spells.at(-1).atWill = false; },
    (e) => { e.execution.spells.at(-1).perDay = 3; },
  ]) {
    const invalid = structuredClone(p2);
    mutate(ability(invalid, "Spellcasting"));
    assert.throws(() => validateBossActionProfile(invalid), /unsupported|unexpected|invalid/i);
  }
  const v14 = structuredClone({ ...p2, profileVersion: 14, parserVersion: 14 });
  for (const entry of v14.abilities) delete entry.sequence; // v20 shapes
  for (const entry of v14.abilities.filter((row) => ["throw", "effect-end"].includes(row.execution?.kind))) {
    entry.automation = "UNSUPPORTED"; delete entry.execution; entry.manualText = entry.rawText; // v16 shapes
  }
  assert.throws(() => validateBossActionProfile(v14), /unexpected field atWill/, "at will needs v15");
});
