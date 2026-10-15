// Tranche 10: trait auras (Aura Gelida, Primal Blizzard) in the profile and as custom auras on the bound token.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { importBossActionHTML, validateBossActionProfile } from "../src/bossActionProfileCore.js";
import { bossAuraId, bossAuraStatus, bossProfileAuras, isBossManagedAura, mergeBossAuras, removeBossAuras } from "../src/bossAuraCore.js";
import { customAuraRule } from "../src/customAuraCore.js";

const phase2HTML = await readFile(new URL("fixtures/boss-actions/auril-phase-2.html", import.meta.url), "utf8");
const phase3HTML = await readFile(new URL("fixtures/boss-actions/auril-phase-3.html", import.meta.url), "utf8");
const p2 = await importBossActionHTML(phase2HTML);
const p3 = await importBossActionHTML(phase3HTML);
const ability = (profile, name) => profile.abilities.find((entry) => entry.name === name);

test("Aura Gelida: 10 ft from the manifestation that emanates it, a pill on who is inside, 3d6 cold at the start of the turn", () => {
  const phase2 = ability(p2, "Aura Gelida");
  assert.equal(phase2.category, "trait");
  assert.equal(phase2.automation, "PARTIAL");
  assert.equal(phase2.execution, undefined, "an aura is data, never an execution");
  assert.deepEqual(phase2.auras, [{ key: "aura-gelida", name: "Aura Gelida", radiusFeet: 10, origin: "Proiezione Fatata",
    pills: [{ key: "inside", label: "Aura Gelida", detail: "Entro 10 ft. dalla Proiezione Fatata: 10 (3d6) danni da freddo a inizio turno.", kind: "debuff" }],
    reminders: [{ key: "damage", event: "turn-start", resolution: "manual-damage", label: "Inizia il turno entro 10 ft. dalla Proiezione Fatata: 10 (3d6) danni da freddo.",
      damage: { dice: "3d6", type: "freddo" } }] }]);
  assert.match(phase2.manualText, /^Il Titano non emana quest'aura\. Il danno del promemoria non legge le difese/);
  const phase3 = ability(p3, "Aura Gelida");
  assert.equal(phase3.auras[0].origin, "Grembo Invernale");
  assert.equal(phase3.auras[0].pills[0].detail, "Entro 10 ft. dal Grembo Invernale: 10 (3d6) danni da freddo a inizio turno.");
  assert.equal(phase3.auras[0].reminders[0].label, "Inizia il turno entro 10 ft. dal Grembo Invernale: 10 (3d6) danni da freddo.");
  assert.doesNotMatch(phase3.manualText, /Titano/);
});

test("Primal Blizzard: the 30 ft blizzard (debuff pill, a concentration save at the end of the turn) and the wind that pushes the player characters", () => {
  const blizzard = ability(p3, "Primal Blizzard");
  assert.equal(blizzard.automation, "PARTIAL");
  assert.deepEqual(blizzard.auras, [
    { key: "primal-blizzard", name: "Primal Blizzard", radiusFeet: 30, origin: "Grembo Invernale",
      pills: [{ key: "blizzard", label: "Nella tormenta", detail: "Scarsamente oscurato · Svantaggio ai tiri per colpire contro Auril.", kind: "debuff" }],
      reminders: [{ key: "concentration", event: "turn-end", resolution: "concentration-save", label: "Mantiene la concentrazione nella tormenta: TS COS CD 10 o la perde.", dc: 10 }] },
    { key: "primal-blizzard-wind", name: "Primal Blizzard · Vento", radiusFeet: 30, origin: "Grembo Invernale", scope: "platform", targets: "pc", pills: [],
      reminders: [{ key: "push", event: "turn-start", resolution: "manual-save", label: "Sulla piattaforma: TS FOR CD 15; fallimento: spinto fino a 10 ft. lontano dal Grembo Invernale e Prono.", ability: "str", dc: 15,
        failureCondition: "Prono" }] },
  ]);
  assert.match(blizzard.manualText, /adatta il raggio di «Primal Blizzard · Vento» alla piattaforma\.$/);
  for (const name of ["Forma Statica", "Crushing Downdraft", "Edge of the Storm", "Resistenza alla Magia"]) {
    assert.equal(ability(p3, name).automation, "UNSUPPORTED", name);
    assert.equal(ability(p3, name).auras, undefined, name);
  }
});

test("altered aura clauses stay manual; the v11 aura contract is closed", async () => {
  for (const [html, name, from, to] of [
    [phase3HTML, "Aura Gelida", "subisce 10 (3d6) danni da freddo.", "subisce 10 (3d6) danni da freddo e ha la condizione Prono."],
    [phase2HTML, "Aura Gelida", "Una creatura diversa da Auril", "Una creatura diversa da Tiamat"],
    [phase3HTML, "Primal Blizzard", "CD 10 o perde la concentrazione", "CD 10 o perde la concentrazione e subisce 2d6 danni"],
    [phase3HTML, "Primal Blizzard", "spinto fino a 10 ft. in linea retta", "spinto fino a 10 ft. in una direzione"],
  ]) {
    assert.equal(html.split(from).length, 2, from);
    const changed = ability(await importBossActionHTML(html.replace(from, to)), name);
    assert.equal(changed.automation, "UNSUPPORTED", to);
    assert.equal(changed.auras, undefined, to);
  }
  for (const mutate of [
    (profile) => { ability(profile, "Aura Gelida").auras[0].radiusFeet = 12; },
    (profile) => { ability(profile, "Aura Gelida").auras[0].reminders[0].damage.type = "fuoco"; },
    (profile) => { ability(profile, "Aura Gelida").auras[0].reminders[0].event = "enter"; },
    (profile) => { ability(profile, "Primal Blizzard").auras[0].reminders[0].ability = "wis"; },
    (profile) => { ability(profile, "Primal Blizzard").auras[0].pills[0].kind = "buff"; },
    (profile) => { ability(profile, "Primal Blizzard").auras[1].scope = "arena"; },
    (profile) => { ability(profile, "Primal Blizzard").auras[1].key = "primal-blizzard"; },
    (profile) => { ability(profile, "Primal Blizzard").auras[0].targeting = { filter: "all" }; },
    (profile) => { ability(profile, "Aura Gelida").automation = "SUPPORTED"; },
    (profile) => { const polar = ability(profile, "Polar Ray"); polar.auras = structuredClone(ability(profile, "Aura Gelida").auras); },
  ]) {
    const invalid = structuredClone(p3);
    mutate(invalid);
    assert.throws(() => validateBossActionProfile(invalid), /invalid|unsupported|unexpected|must|duplicate/i);
  }
  assert.throws(() => validateBossActionProfile(structuredClone({ ...p3, profileVersion: 10, parserVersion: 10 })), /unexpected/i, "a v10 profile cannot carry auras");
  // The at-will spell arrived with v15: a v11 copy keeps the three daily spells.
  const v11 = structuredClone({ ...p2, profileVersion: 11, parserVersion: 11 });
  for (const entry of v11.abilities) delete entry.sequence; // v20 shapes
  ability(v11, "Spellcasting").execution.spells = ability(v11, "Spellcasting").execution.spells.filter((spell) => !spell.atWill);
  for (const entry of v11.abilities.filter((row) => ["throw", "effect-end"].includes(row.execution?.kind))) {
    entry.automation = "UNSUPPORTED"; delete entry.execution; entry.manualText = entry.rawText; // v16 shapes
  }
  assert.doesNotThrow(() => validateBossActionProfile(v11), "Aura Gelida keeps the v11 contract");
  assert.throws(() => validateBossActionProfile(structuredClone({ ...p3, profileVersion: 12, parserVersion: 12 })), /unexpected|unsupported/i,
    "PG targets and the concentration save need v13");
});

test("each profile aura becomes a custom aura: stable id, radius in metres, frost style, hostile creatures, fixed DCs", () => {
  const auras = bossProfileAuras(p3);
  assert.deepEqual(auras.map((aura) => [aura.id, aura.name, aura.radiusMeters]), [
    ["boss-aura:auril:fase3:primal-blizzard", "Primal Blizzard", 9],
    ["boss-aura:auril:fase3:primal-blizzard-wind", "Primal Blizzard · Vento", 9],
    ["boss-aura:auril:fase3:aura-gelida", "Aura Gelida", 3],
  ]);
  const [blizzard, wind, cold] = auras;
  assert.deepEqual(cold.targeting, { filter: "hostile", includeSource: false }, "the Titan's tokens and Auril stay out");
  assert.equal(cold.style.fillColor, "#38bdf8");
  assert.deepEqual(cold.reminders.map((reminder) => [reminder.event, reminder.resolution, reminder.damage.dice, reminder.damage.type]), [["turn-start", "manual-damage", "3d6", "freddo"]]);
  assert.deepEqual(blizzard.pills, [{ id: "blizzard", enabled: true, label: "Nella tormenta", detail: "Scarsamente oscurato · Svantaggio ai tiri per colpire contro Auril.", kind: "debuff" }]);
  assert.deepEqual([blizzard.reminders[0].resolution, blizzard.reminders[0].dcMode, blizzard.reminders[0].dc], ["concentration-save", "fixed", 10]);
  assert.deepEqual(wind.targeting, { filter: "pc", includeSource: false }, "the push: player characters only");
  assert.deepEqual(blizzard.targeting, { filter: "hostile", includeSource: false });
  assert.deepEqual([wind.reminders[0].ability, wind.reminders[0].dc, wind.reminders[0].event], ["str", 15, "turn-start"]);
  // The custom aura system runs them: a while-inside pill and once-per-turn reminders with the fixed DC.
  const rule = customAuraRule(blizzard);
  assert.equal(rule.effectPolicy.effects[0].kind, "debuff");
  // The concentration save never waits as a zone notice: it becomes a concentration warning.
  assert.deepEqual([rule.triggerPolicy.triggers[0].event, rule.triggerPolicy.triggers[0].resolution], ["turn-end", "informational"]);
  assert.equal(customAuraRule(cold).triggerPolicy.triggers[0].resolution, "manual-effect");
  assert.equal(bossProfileAuras(p2).length, 1);
  assert.equal(bossProfileAuras(p2)[0].id, bossAuraId(p2, "aura-gelida"));
});

test("merging keeps the token's other auras and the GM's edits; replace restores; another phase's auras leave", () => {
  const mine = { id: "mine", name: "Mia aura", radiusMeters: 6 };
  const first = mergeBossAuras([mine], p3);
  assert.deepEqual(first.added, ["Primal Blizzard", "Primal Blizzard · Vento", "Aura Gelida"]);
  assert.equal(first.changed, true);
  assert.equal(first.auras[0].id, "mine");
  // The GM widens the wind to the platform and switches Aura Gelida off: a rebind keeps both edits.
  const edited = first.auras.map((aura) => aura.name === "Primal Blizzard · Vento" ? { ...aura, radiusMeters: 12 } : aura.name === "Aura Gelida" ? { ...aura, enabled: false } : aura);
  const again = mergeBossAuras(edited, p3);
  assert.equal(again.changed, false);
  assert.deepEqual(again.added, []);
  assert.deepEqual(bossAuraStatus(edited, p3).map((aura) => [aura.name, aura.present, aura.enabled]),
    [["Primal Blizzard", true, true], ["Primal Blizzard · Vento", true, true], ["Aura Gelida", true, false]]);
  const restored = mergeBossAuras(edited, p3, { replace: true });
  assert.deepEqual(restored.restored, ["Primal Blizzard", "Primal Blizzard · Vento", "Aura Gelida"]);
  assert.equal(restored.auras.find((aura) => aura.name === "Primal Blizzard · Vento").radiusMeters, 9);
  assert.equal(restored.auras.find((aura) => aura.name === "Aura Gelida").enabled, true);
  // Phase 2 bound to the same token: the phase 3 auras are removed, phase 2's Aura Gelida is added.
  const phase2 = mergeBossAuras(first.auras, p2);
  assert.deepEqual(phase2.removed, ["Primal Blizzard", "Primal Blizzard · Vento", "Aura Gelida"]);
  assert.deepEqual(phase2.auras.map((aura) => aura.id), ["mine", "boss-aura:auril:fase2:aura-gelida"]);
  const cleared = removeBossAuras(first.auras, "auril");
  assert.deepEqual(cleared.auras.map((aura) => aura.id), ["mine"]);
  assert.deepEqual(removeBossAuras(first.auras, "tiamat").removed, [], "another boss's auras are not ours");
  assert.equal(isBossManagedAura(mine), false);
  // A token linked before the pill existed (v11): a rebind adds the pill and keeps the GM's radius.
  const before = first.auras.map((aura) => aura.name === "Aura Gelida" ? { ...aura, pills: [], radiusMeters: 4.5 } : aura);
  const completed = mergeBossAuras(before, p3);
  assert.deepEqual(completed.updated, ["Aura Gelida"]);
  assert.deepEqual(completed.added, []);
  const cold = completed.auras.find((aura) => aura.name === "Aura Gelida");
  assert.deepEqual(cold.pills.map((pill) => [pill.id, pill.label, pill.kind]), [["inside", "Aura Gelida", "debuff"]]);
  assert.equal(cold.radiusMeters, 4.5, "the GM's radius stays");
  assert.deepEqual(mergeBossAuras(completed.auras, p3).updated, [], "nothing more to add");
  assert.equal(bossAuraStatus([], p3).every((aura) => !aura.present), true);
});
