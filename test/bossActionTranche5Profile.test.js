// Tranche 5: Titan's Grasp, Crush and Soul-Numbing Cold grammar and the v5 single-save / group-effect contracts.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { importBossActionHTML, validateBossActionProfile } from "../src/bossActionProfileCore.js";
import { bossGrappledIds, bossGrappleBlocker } from "../src/bossActionExecutionCore.js";

const phase2HTML = await readFile(new URL("fixtures/boss-actions/auril-phase-2.html", import.meta.url), "utf8");
const phase3HTML = await readFile(new URL("fixtures/boss-actions/auril-phase-3.html", import.meta.url), "utf8");
const ability = (profile, name) => profile.abilities.find((entry) => entry.name === name);

test("Titan's Grasp: DEX 18, all-or-nothing damage, Afferrato (escape DC 18) and Trattenuto until removed", async () => {
  const grasp = ability(await importBossActionHTML(phase2HTML), "Titan's Grasp");
  assert.equal(grasp.automation, "PARTIAL");
  assert.deepEqual(grasp.usage, { limit: 1, period: "round" });
  assert.deepEqual(grasp.execution, {
    kind: "save-damage", save: { ability: "dex", dc: 18 }, target: { mode: "single", maxTargets: 1 },
    damage: [{ id: "bludgeoning", formula: "6d10", type: "bludgeoning", printedAverage: 33 }, { id: "cold", formula: "3d6", type: "cold", printedAverage: 10 }],
    success: "none",
    onFailed: { conditions: [{ condition: "Afferrato", expiry: { mode: "manual" }, escapeDC: 18 }, { condition: "Trattenuto", expiry: { mode: "manual" } }] },
    grapple: "grab",
  });
  assert.equal(grasp.manualText, "Verifica che il bersaglio sia entro 20 ft. dal bordo della piattaforma ed entro la portata di una delle mani esposte del Titano. Su TS fallito il bersaglio è sospeso fino a 30 ft. sopra la piattaforma.");
});

test("Crush: CON 19 on the held creature, half on a success, no per-round limit", async () => {
  const crush = ability(await importBossActionHTML(phase2HTML), "Crush");
  assert.deepEqual(crush.usage, {});
  assert.deepEqual(crush.execution, {
    kind: "save-damage", save: { ability: "con", dc: 19 }, target: { mode: "single", maxTargets: 1 },
    damage: [{ id: "bludgeoning", formula: "6d10", type: "bludgeoning", printedAverage: 33 }, { id: "cold", formula: "3d6", type: "cold", printedAverage: 10 }],
    success: "half", grapple: "hold",
  });
});

test("Soul-Numbing Cold: up to three creatures Auril sees within 60 ft, a debuff until the end of the target's next turn", async () => {
  const cold = ability(await importBossActionHTML(phase3HTML), "Soul-Numbing Cold");
  assert.deepEqual(cold.usage, { limit: 1, period: "round" });
  assert.deepEqual(cold.execution, {
    kind: "save-effect", save: { ability: "con", dc: 15 }, target: { mode: "multiple", selection: "manual", maxTargets: 3, range: 60 },
    onFailed: { effect: { speedPenalty: 10, noHealing: true, noTempHP: true, expiry: { mode: "turn-end", actor: "target", remaining: 1, anchor: "next-turn" } } },
  });
  assert.match(cold.manualText, /Velocità, cure e Punti Ferita Temporanei non vengono modificati/);
});

test("Blizzard Strike keeps exactly its earlier single-save shape", async () => {
  assert.deepEqual(ability(await importBossActionHTML(phase3HTML), "Blizzard Strike").execution, {
    kind: "save-damage", save: { ability: "str", dc: 15 }, target: { mode: "single", maxTargets: 1, range: 60 },
    damage: [{ id: "bludgeoning", formula: "2d8", type: "bludgeoning", average: 9 }, { id: "cold", formula: "2d8", type: "cold", average: 9 }], success: "half",
  });
});

test("any altered clause leaves Grasp, Crush or Soul-Numbing Cold manual", async () => {
  for (const [html, name, from, to] of [
    [phase2HTML, "Titan's Grasp", "Nessun danno e il bersaglio non viene afferrato.", "Metà danni soltanto."],
    [phase2HTML, "Titan's Grasp", "le condizioni Afferrato (CD 18 per sfuggire) e Trattenuto", "le condizioni Afferrato (CD 18 per sfuggire) e Stordito"],
    [phase2HTML, "Titan's Grasp", "una sola creatura Afferrata in questo modo alla volta", "fino a due creature Afferrate in questo modo"],
    [phase2HTML, "Crush", "la creatura Afferrata dal Titano.", "una creatura entro 30 ft. dal Titano."],
    [phase2HTML, "Crush", "In entrambi i casi il bersaglio rimane Afferrato e Trattenuto.", "Il bersaglio non è più Afferrato."],
    [phase3HTML, "Soul-Numbing Cold", "che Auril può vedere", "che Malar può vedere"],
    [phase3HTML, "Soul-Numbing Cold", "e non può ottenere Punti Ferita Temporanei.", "e ha la condizione Avvelenato."],
  ]) {
    assert.equal(html.split(from).length, 2, `${from} occurs once`);
    const entry = ability(await importBossActionHTML(html.replace(from, to)), name);
    assert.equal(entry.automation, "UNSUPPORTED", `${name}: ${to}`);
    assert.equal(entry.execution, undefined);
  }
});

test("version 5 validation accepts only the closed single-save and group-effect contracts", async () => {
  const p2 = await importBossActionHTML(phase2HTML);
  const p3 = await importBossActionHTML(phase3HTML);
  assert.deepEqual(validateBossActionProfile(p2), p2);
  assert.deepEqual(validateBossActionProfile(p3), p3);
  for (const [profile, name, mutate] of [
    [p2, "Titan's Grasp", (e) => { e.execution.save.ability = "wis"; }],
    [p2, "Titan's Grasp", (e) => { e.execution.success = "half"; }],
    [p2, "Titan's Grasp", (e) => { e.execution.onFailed.conditions[1].condition = "Stordito"; }],
    [p2, "Titan's Grasp", (e) => { e.execution.onFailed.conditions[1].escapeDC = 18; }],
    [p2, "Titan's Grasp", (e) => { delete e.execution.onFailed.conditions[0].escapeDC; }],
    [p2, "Titan's Grasp", (e) => { e.execution.onFailed.conditions[0].expiry = { mode: "rounds", remaining: 10 }; }],
    [p2, "Titan's Grasp", (e) => { e.execution.grapple = "throw"; }],
    [p2, "Titan's Grasp", (e) => { delete e.execution.grapple; }],
    [p2, "Crush", (e) => { e.execution.onFailed = { conditions: [{ condition: "Trattenuto", expiry: { mode: "manual" } }] }; }],
    [p2, "Crush", (e) => { e.execution.damage.push({ id: "fire", formula: "1d6", type: "fire", printedAverage: 3 }); }],
    [p3, "Soul-Numbing Cold", (e) => { e.execution.target.selection = "area"; }],
    [p3, "Soul-Numbing Cold", (e) => { e.execution.target.maxTargets = 50; }],
    [p3, "Soul-Numbing Cold", (e) => { e.execution.onFailed.effect.noHealing = false; }],
    [p3, "Soul-Numbing Cold", (e) => { e.execution.onFailed.effect.expiry.actor = "source"; }],
    [p3, "Soul-Numbing Cold", (e) => { e.execution.onFailed.effect.label = "Script"; }],
    [p3, "Soul-Numbing Cold", (e) => { e.execution.damage = []; }],
  ]) {
    const invalid = structuredClone(profile);
    mutate(ability(invalid, name));
    assert.throws(() => validateBossActionProfile(invalid), /invalid|unsupported|unexpected|PARTIAL|manual/i, name);
  }
});

test("a v4 profile cannot carry the v5 shapes", async () => {
  for (const html of [phase2HTML, phase3HTML]) {
    const current = await importBossActionHTML(html);
    // Without the v7 presentation group, so only the v5 shapes can make it fail.
    const legacy = structuredClone({ ...current, profileVersion: 4, parserVersion: 4, abilities: current.abilities.map(({ group, ...entry }) => entry) });
    assert.throws(() => validateBossActionProfile(legacy), /unexpected|unsupported|invalid/i);
  }
});

test("grapple helpers: only an active Afferrato from the boss counts; Grasp holds one creature, Crush needs it", async () => {
  const p2 = await importBossActionHTML(phase2HTML);
  const item = (id, instances) => ({ id, metadata: { "com.thebigpicture.initiative/meta": { conditions: { version: 2, instances } } } });
  const items = [item("dars", [{ condition: "Afferrato", sourceId: "auril", active: true }]), item("mira", [{ condition: "Afferrato", sourceId: "other" }]),
    item("sera", [{ condition: "Afferrato", sourceId: "auril", active: false }]), item("auril", [{ condition: "Afferrato", sourceId: "auril" }])];
  assert.deepEqual(bossGrappledIds(items, "auril"), ["dars"]);
  assert.match(bossGrappleBlocker(ability(p2, "Titan's Grasp"), "mira", ["dars"]), /tiene già una creatura/);
  assert.match(bossGrappleBlocker(ability(p2, "Titan's Grasp"), "dars", ["dars"]), /già Afferrato/);
  assert.equal(bossGrappleBlocker(ability(p2, "Titan's Grasp"), "mira", []), "");
  assert.match(bossGrappleBlocker(ability(p2, "Crush"), "mira", ["dars"]), /deve essere Afferrato/);
  assert.equal(bossGrappleBlocker(ability(p2, "Crush"), "dars", ["dars"]), "");
  assert.equal(bossGrappleBlocker(ability(p2, "Icekiss +2"), "mira", ["dars"]), "");
});
