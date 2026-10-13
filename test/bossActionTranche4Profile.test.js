// Tranche 4: Hand Slam and Blinding Gleam grammar, the v4 group contract and the circle/emanation area rules.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { importBossActionHTML, validateBossActionProfile } from "../src/bossActionProfileCore.js";
import { getSpellAreaRuleById, validateSpellAreaRule } from "../src/spellAreaRules.js";
import { createSpellAreaPlacementSession } from "../src/spellAreaPlacementCore.js";
import { bossActionAreaRuleId, sanitizeBossAreaPlacement } from "../src/bossActionExecutionCore.js";
import { buildCircleArea, areaHitsBounds } from "../src/aoeGeometryCore.js";

const phase2HTML = await readFile(new URL("fixtures/boss-actions/auril-phase-2.html", import.meta.url), "utf8");
const phase3HTML = await readFile(new URL("fixtures/boss-actions/auril-phase-3.html", import.meta.url), "utf8");
const ability = (profile, name) => profile.abilities.find((entry) => entry.name === name);

test("Hand Slam becomes a PARTIAL DEX group save on a 20 ft circle with Prono until removed", async () => {
  const handSlam = ability(await importBossActionHTML(phase2HTML), "Hand Slam");
  assert.equal(handSlam.automation, "PARTIAL");
  assert.deepEqual(handSlam.usage, { limit: 1, period: "round" });
  assert.deepEqual(handSlam.execution, {
    kind: "save-damage", save: { ability: "dex", dc: 18 },
    target: { mode: "multiple", selection: "area", area: { shape: "circle", size: 20, origin: "un punto della piattaforma" } },
    damage: [{ id: "bludgeoning", formula: "5d10", type: "bludgeoning", printedAverage: 27 }, { id: "cold", formula: "2d6", type: "cold", printedAverage: 7 }],
    success: "half", onFailed: { conditions: [{ condition: "Prono", expiry: { mode: "manual" } }] },
  });
  assert.match(handSlam.manualText, /^L'area colpita diventa Terreno Difficile\..*fuori dall'area\.$/, "difficult terrain and collapse stay manual");
});

test("Blinding Gleam becomes a CON group save from Auril: radiant damage, 1-minute Accecato with a repeated save, immunity on success", async () => {
  const gleam = ability(await importBossActionHTML(phase3HTML), "Blinding Gleam");
  assert.equal(gleam.automation, "PARTIAL");
  assert.deepEqual(gleam.usage, { limit: 1, period: "round" });
  assert.deepEqual(gleam.execution, {
    kind: "save-damage", save: { ability: "con", dc: 19 },
    target: { mode: "multiple", selection: "area", area: { shape: "emanation", size: 30, origin: "Auril" } },
    damage: [{ id: "radiant", formula: "5d10", type: "radiant", printedAverage: 27 }],
    success: "half",
    onFailed: { conditions: [{ condition: "Accecato", expiry: { mode: "rounds", remaining: 10 }, saveReminder: { ability: "con", timing: "turn-end", dc: 19 } }] },
    onPassed: { immunity: { condition: "Accecato", duration: "24h" } },
  });
  assert.match(gleam.manualText, /Copertura Totale/);
});

test("any altered clause leaves Hand Slam or Blinding Gleam manual", async () => {
  for (const [html, name, from, to] of [
    [phase2HTML, "Hand Slam", "condizione Prono.", "condizione Stordito."],
    [phase2HTML, "Hand Slam", "l'area crolla.", "l'area esplode."],
    [phase2HTML, "Hand Slam", "Raggio di 20 ft. centrata su un punto della piattaforma", "Raggio di 20 ft. centrata su Auril"],
    [phase3HTML, "Blinding Gleam", "che origina da Auril", "che origina da Malar"],
    [phase3HTML, "Blinding Gleam", "Accecato di Blinding Gleam", "Accecato di Polar Ray"],
    [phase3HTML, "Blinding Gleam", "alla fine di ciascuno dei propri turni", "all'inizio di ciascuno dei propri turni"],
    [phase3HTML, "Blinding Gleam", "il tiro salvezza iniziale o uno successivo", "il tiro salvezza iniziale"],
    [phase3HTML, "Blinding Gleam", "per 24 ore.", "per 24 ore. Inoltre il bersaglio è Stordito."],
  ]) {
    assert.equal(html.split(from).length, 2, `${from} occurs once`);
    const entry = ability(await importBossActionHTML(html.replace(from, to)), name);
    assert.equal(entry.automation, "UNSUPPORTED", `${name}: ${to}`);
    assert.equal(entry.execution, undefined);
  }
});

test("version 4 validation accepts only the closed group contract", async () => {
  const profile = await importBossActionHTML(phase3HTML);
  assert.deepEqual(validateBossActionProfile(profile), profile);
  for (const mutate of [
    (gleam) => { gleam.execution.save.ability = "wis"; }, // STR joined the group saves in v17 (Marea Informe)
    (gleam) => { gleam.execution.target.area.shape = "sphere"; },
    (gleam) => { gleam.execution.damage[0].type = "fire"; },
    (gleam) => { gleam.execution.damage.push({ ...gleam.execution.damage[0], id: "radiant-2" }); },
    (gleam) => { gleam.execution.damage.push({ id: "cold", formula: "1d6", type: "cold", printedAverage: 3 }, { id: "necrotic", formula: "1d6", type: "necrotic", printedAverage: 3 }); },
    (gleam) => { delete gleam.execution.damage[0].printedAverage; gleam.execution.damage[0].average = 27; },
    (gleam) => { gleam.execution.onFailed.conditions[0].condition = "Stordito"; },
    (gleam) => { gleam.execution.onFailed.conditions[0].expiry.remaining = 100; },
    (gleam) => { gleam.execution.onFailed.conditions[0].expiry = { mode: "manual" }; },
    (gleam) => { gleam.execution.onFailed.conditions[0].saveReminder.timing = "turn-start"; },
    (gleam) => { gleam.execution.onFailed.conditions[0].saveReminder.ability = "wis"; },
    (gleam) => { gleam.execution.onFailed.conditions[0].saveReminder.label = "Script"; },
    (gleam) => { gleam.execution.onPassed.immunity.condition = "Prono"; },
    (gleam) => { gleam.execution.onPassed.immunity.duration = "1h"; },
    (gleam) => { gleam.execution.onPassed.extra = true; },
    (gleam) => { gleam.automation = "SUPPORTED"; },
  ]) {
    const invalid = structuredClone(profile);
    mutate(ability(invalid, "Blinding Gleam"));
    assert.throws(() => validateBossActionProfile(invalid), /invalid|unsupported|unexpected|PARTIAL|manual/i);
  }
});

test("a v3 profile cannot carry the v4 shapes", async () => {
  const current = await importBossActionHTML(phase3HTML);
  const legacy = structuredClone({ ...current, profileVersion: 3, parserVersion: 3 });
  assert.throws(() => validateBossActionProfile(legacy), /unexpected|unsupported|invalid/i);
});

test("circle and emanation map to valid shared placement rules; the emanation is centred on the boss and excludes it", () => {
  assert.equal(bossActionAreaRuleId({ shape: "circle", size: 20 }), "boss-action-area:circle:20ft");
  assert.equal(bossActionAreaRuleId({ shape: "emanation", size: 30 }), "boss-action-area:emanation:30ft");
  const circle = getSpellAreaRuleById("boss-action-area:circle:20ft");
  const emanation = getSpellAreaRuleById("boss-action-area:emanation:30ft");
  for (const rule of [circle, emanation]) assert.equal(validateSpellAreaRule(rule).valid, true, rule.id);
  assert.deepEqual(circle.geometry, { shape: "circle", size: { value: 6, unit: "m", measure: "radius" } });
  assert.deepEqual(circle.placement, { origin: "point", direction: "none", anchor: "world", range: null });
  assert.deepEqual(emanation.geometry, { shape: "circle", size: { value: 9, unit: "m", measure: "radius" } });
  assert.deepEqual(emanation.placement, { origin: "caster", direction: "none", anchor: "caster", range: null });
  assert.equal(emanation.targeting.includeCaster, false, "the boss is never hit by its own emanation");
  assert.equal(createSpellAreaPlacementSession({ requestId: "r1", rule: circle, casterId: "" }).shape, "circle");
  for (const id of ["boss-action-area:circle:22ft", "boss-action-area:emanation:0ft", "boss-action-area:sphere:20ft"]) assert.equal(getSpellAreaRuleById(id), null, id);
});

test("the 20 ft circle covers creatures within 20 ft of the chosen point with the shared geometry", () => {
  const dpi = 150, area = buildCircleArea({ x: 0, y: 0 }, { x: 4 * dpi, y: 0 }, dpi);
  const token = (x, y) => ({ min: { x: x - 75, y: y - 75 }, max: { x: x + 75, y: y + 75 } });
  assert.equal(areaHitsBounds(area, token(450, 0)), true, "15 ft away");
  assert.equal(areaHitsBounds(area, token(0, -600)), true, "at the edge");
  assert.equal(areaHitsBounds(area, token(1200, 0)), false, "40 ft away");
});

test("a circle or an emanation placement may report only its centre; a cone still needs a direction", () => {
  const centre = { x: 5, y: 5 };
  assert.ok(sanitizeBossAreaPlacement({ ruleId: "boss-action-area:emanation:30ft", start: centre, end: centre, areaTargetIds: ["a"] }, { shape: "emanation", size: 30 }));
  assert.ok(sanitizeBossAreaPlacement({ ruleId: "boss-action-area:circle:20ft", start: centre, end: centre, areaTargetIds: [] }, { shape: "circle", size: 20 }));
  assert.equal(sanitizeBossAreaPlacement({ ruleId: "boss-action-area:cone:60ft", start: centre, end: centre }, { shape: "cone", size: 60 }), null);
  assert.equal(sanitizeBossAreaPlacement({ ruleId: "boss-action-area:cone:60ft", start: centre, end: { x: 9, y: 5 } }, { shape: "circle", size: 20 }), null, "rule must match the profile area");
});

test("the fixtures carry the canonical V10 mechanics with the English ability names", async () => {
  const p2 = await importBossActionHTML(phase2HTML);
  const p3 = await importBossActionHTML(phase3HTML);
  assert.equal(ability(p2, "Rimebound Link").category, "trait");
  assert.match(ability(p2, "Doppia Manifestazione").rawText, /Rimebound Link è ancora attivo/);
  assert.deepEqual(ability(p2, "Crush").usage, {}, "no per-round limit");
  assert.match(ability(p2, "Crush").rawText, /Costituzione: CD 19, la creatura Afferrata dal Titano\..*rimane Afferrato e Trattenuto\./);
  assert.match(ability(p2, "Titan's Grasp").rawText, /Successo: Nessun danno e il bersaglio non viene afferrato\./);
  assert.deepEqual(ability(p2, "Meteor Swarm").usage, { limit: 1, period: "phase" });
  assert.deepEqual(ability(p2, "Breathe Deep").usage, { limit: 1, period: "round" });
  assert.match(ability(p2, "Breath of the Long Night").manualText, /ha usato Breathe Deep come prima Azione Epica dello stesso round/);
  assert.match(ability(p2, "Aura Gelida").rawText, /Il Titano non emana quest'aura\./);
  assert.match(phase2HTML, /<b>CA<\/b> 20</);
  assert.match(phase3HTML, /<b>CA<\/b> 17</);
  assert.match(phase3HTML, /<b>PF<\/b> 336</);
  assert.match(ability(p3, "Detonation of the Mark").rawText, /sia con un fallimento sia con un successo\. Libertà di movimento previene/);
  assert.match(ability(p3, "Divine Brilliance").rawText, /questa Reazione è perduta\./);
  for (const profile of [p2, p3]) assert.match(profile.abilities.find((entry) => entry.category === "epic-action").rawText, /\S/);
  assert.match(phase2HTML, /sei slot fissi di iniziativa: Omar, Edelbrand, Lavera, Freddy, Kos e Alane/);
});
