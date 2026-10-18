// Tranche 9: Divine Brilliance (a group attack reaction that repeats Polar Ray) and the frost theme of boss areas.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { importBossActionHTML, validateBossActionProfile } from "../src/bossActionProfileCore.js";
import { buildBossActionGroupMutation, bossTriggerMet, isBossActionGroupAttack, isBossActionGroupExecution } from "../src/bossActionExecutionCore.js";
import { bossActionExecutionKind, bossActionRowMeta, bossAreaTheme, bossGroupApplyBlocker, bossGroupMissingDamageIds, bossGroupOutcomes,
  bossGroupConfirmationText, validateBossActionGroupSelection, bossDefendedDamage } from "../src/bossActionsViewCore.js";
import { spellAreaStyle } from "../src/spellAreaStyleCore.js";
import { evasionAppliesTo } from "../src/damageDefensesCore.js";

const META = "com.thebigpicture.initiative/meta";
const phase3HTML = await readFile(new URL("fixtures/boss-actions/auril-phase-3.html", import.meta.url), "utf8");
const phase2HTML = await readFile(new URL("fixtures/boss-actions/auril-phase-2.html", import.meta.url), "utf8");
const p3 = await importBossActionHTML(phase3HTML);
const p2 = await importBossActionHTML(phase2HTML);
const ability = (profile, name) => profile.abilities.find((entry) => entry.name === name);
const brilliance = ability(p3, "Divine Brilliance");
const polar = ability(p3, "Polar Ray");
const creature = (id, hp, extra = {}) => ({ id, name: id, type: "IMAGE", layer: "CHARACTER", metadata: { [META]: { hp, hpMax: Math.max(hp, 60), inInitiative: true, ...extra } } });
const resist = (type) => ({ initiativeCard: { damageDefenses: { immunities: [], resistances: [type], vulnerabilities: [] } } });
const EMANATION = (ids) => ({ ruleId: "boss-action-area:emanation:120ft", start: { x: 0, y: 0 }, end: { x: 3600, y: 0 }, areaTargetIds: ids });
const plan = (overrides = {}) => buildBossActionGroupMutation({
  profile: p3, action: brilliance, sourceItem: creature("auril", 98), round: 3, actionInstanceId: "boss-action:t9",
  targetItems: [creature("dars", 60, resist("cold")), creature("mira", 45), creature("sera", 38)],
  outcomes: { dars: "hit", mira: "hit", sera: "miss" }, targetAmounts: { dars: { cold: 12, necrotic: 9 }, mira: { cold: 4, necrotic: 15 } },
  manualConfirmed: true, areaPlacement: EMANATION(["dars", "mira", "sera"]), ...overrides,
});

test("Divine Brilliance: Polar Ray against every conscious creature within 120 ft, below 105 HP, 1/Phase, a reaction to confirm", () => {
  assert.equal(brilliance.category, "reaction");
  assert.equal(brilliance.automation, "PARTIAL");
  assert.deepEqual(brilliance.usage, { limit: 1, period: "phase" });
  assert.deepEqual(brilliance.execution, {
    kind: "attack-damage", printedTotalAverage: 21,
    attack: { bonus: 11, type: "spell", modes: ["ranged"], range: { normal: 120 } },
    target: { mode: "multiple", selection: "area", area: { shape: "emanation", size: 120, origin: "Auril" }, conscious: true },
    damage: polar.execution.damage, sourceAction: "polar-ray", trigger: { hpBelow: 105 }, requiresConfirmation: true,
  });
  assert.deepEqual(brilliance.execution.attack, polar.execution.attack, "the attack is the printed Polar Ray");
  assert.match(brilliance.manualText, /questa Reazione è perduta\. Togli dal gruppo le creature che Auril non può vedere\.$/);
  assert.equal(bossActionExecutionKind(brilliance), "group-save");
  assert.equal(isBossActionGroupAttack(brilliance), true);
  assert.equal(isBossActionGroupExecution(brilliance), true);
  assert.equal(isBossActionGroupAttack(polar), false);
  assert.equal(evasionAppliesTo(brilliance.execution), false, "an attack is not a DEX save");
  assert.equal(bossActionRowMeta(brilliance, {}).tag, "Attacco +11 · ogni creatura entro 120 ft");
});

test("altered Divine Brilliance clauses or a missing Polar Ray stay manual; the v10 contract is closed and cross-checked", async () => {
  for (const [from, to] of [
    ["contro ogni creatura cosciente che può vedere", "contro ogni creatura che può vedere"],
    ["scende sotto 105 Punti Ferita per la prima volta", "scende sotto 105 Punti Ferita"],
    ["questa Reazione è perduta.", "Auril può usarla nel round successivo."],
  ]) {
    assert.equal(phase3HTML.split(from).length, 2, from);
    assert.equal(ability(await importBossActionHTML(phase3HTML.replace(from, to)), "Divine Brilliance").automation, "UNSUPPORTED", to);
  }
  const noPolar = await importBossActionHTML(phase3HTML.replace("Polar Ray.</span>", "Frost Ray.</span>"));
  assert.equal(ability(noPolar, "Divine Brilliance").automation, "UNSUPPORTED");
  assert.equal(ability(noPolar, "Divine Brilliance").execution, undefined);
  assert.ok(noPolar.diagnostics.some((row) => row.abilityId === "divine-brilliance" && /attacco di riferimento non trovato/.test(row.message)));
  for (const mutate of [
    (profile) => { ability(profile, "Divine Brilliance").execution.attack.bonus = 15; },
    (profile) => { ability(profile, "Divine Brilliance").execution.damage[0].formula = "6d6"; },
    (profile) => { ability(profile, "Polar Ray").execution.attack.bonus = 9; },
    (profile) => { ability(profile, "Divine Brilliance").execution.sourceAction = "blizzard-strike"; },
    (profile) => { ability(profile, "Divine Brilliance").execution.target.conscious = false; },
    (profile) => { ability(profile, "Divine Brilliance").execution.target.area.shape = "circle"; },
    (profile) => { ability(profile, "Divine Brilliance").execution.requiresConfirmation = false; },
    (profile) => { ability(profile, "Divine Brilliance").execution.trigger = { hpBelow: 105, every: "round" }; },
  ]) {
    const invalid = structuredClone(p3);
    mutate(invalid);
    assert.throws(() => validateBossActionProfile(invalid), /invalid|unsupported|unexpected|needs/i);
  }
  assert.throws(() => validateBossActionProfile(structuredClone({ ...p3, profileVersion: 9, parserVersion: 9 })), /unexpected|unsupported|invalid/i);
});

test("one attack and one damage roll per creature; defenses per creature; a miss deals nothing; one use per phase", () => {
  const result = plan();
  const byId = Object.fromEntries(result.causality.targets.map((target) => [target.id, target]));
  assert.equal(byId.dars.requestedDamage, 6 + 9, "cold resistance halves only Dars's own cold roll");
  assert.equal(byId.mira.requestedDamage, 19);
  assert.equal(byId.sera.requestedDamage, 0);
  assert.equal(byId.sera.outcome, "miss");
  assert.deepEqual(result.operations, [{ type: "hp:set", updates: [
    { itemId: "dars", hp: 45, hpMax: 60, hpIntent: { mode: "damage", amount: 15, eventId: "boss-action:t9:dars" }, expectedHP: { present: true, value: 60 }, expectedHPMax: { present: true, value: 60 } },
    { itemId: "mira", hp: 26, hpMax: 60, hpIntent: { mode: "damage", amount: 19, eventId: "boss-action:t9:mira" }, expectedHP: { present: true, value: 45 }, expectedHPMax: { present: true, value: 60 } },
  ] }]);
  assert.deepEqual(result.causality.resources, [{ actionId: "divine-brilliance", phaseId: "fase3", period: "phase", limit: 1, beforeUsed: 0, afterUsed: 1 }]);
  assert.deepEqual(result.causality.attack, { ...polar.execution.attack, mode: "ranged", sourceAction: "polar-ray" });
  assert.deepEqual(result.causality.trigger, { hpBelow: 105, bossHp: 98 });
  assert.equal(result.causality.area.placement.ruleId, "boss-action-area:emanation:120ft");
  assert.match(result.options.history.payload.manualRemainder, /Innesco: auril a 98 PF, sotto 105/);
  assert.equal(result.options.label, "auril: Divine Brilliance → 3 bersagli");
});

test("the plan refuses: no confirmation, no trigger, no emanation, a creature at 0 HP, a missing outcome or damage roll", () => {
  assert.throws(() => plan({ manualConfirmed: false }), /Conferma innesco e Reazione/);
  assert.throws(() => plan({ sourceItem: creature("auril", 105) }), /Innesco non avvenuto: auril deve essere sotto 105 PF \(ora 105\)/);
  assert.throws(() => plan({ areaPlacement: null }), /Posiziona l’emanazione/);
  assert.throws(() => plan({ targetItems: [creature("dars", 0)], outcomes: { dars: "miss" } }), /dars è a 0 PF: non è cosciente/);
  assert.throws(() => plan({ outcomes: { dars: "hit", mira: "hit" } }), /Manca l’esito dell’attacco contro sera/);
  assert.throws(() => plan({ targetAmounts: { dars: { cold: 12 } , mira: { cold: 4, necrotic: 15 } } }), /Inserisci il danno/);
  assert.throws(() => plan({ targetAmounts: { dars: { cold: 12, necrotic: 9, fire: 3 }, mira: { cold: 4, necrotic: 15 } } }), /Componente di danno sconosciuta/);
  assert.equal(bossTriggerMet(brilliance, creature("auril", 104)), true);
  assert.equal(bossTriggerMet(brilliance, creature("auril", 105)), false);
  assert.equal(bossTriggerMet(polar, creature("auril", 1)), false, "no trigger, nothing to meet");
});

test("the boss mark applies to the cold of a marked creature that is hit", () => {
  const MARK = { conditions: { version: 2, instances: [{ id: "m", condition: "Mark of the Frostmaiden", active: true, effectId: "monster-mark:auril:mark-of-the-frostmaiden" }] } };
  const result = plan({ targetItems: [creature("dars", 60, { ...resist("cold"), ...MARK }), creature("mira", 45), creature("sera", 38)], expectedMarkedIds: ["dars"] });
  const dars = result.causality.targets.find((target) => target.id === "dars");
  assert.equal(dars.markRule, true);
  assert.equal(dars.requestedDamage, 12 + 9, "the mark ignores Dars's cold resistance");
  assert.throws(() => plan({ expectedMarkedIds: ["dars"] }), /Il marchio di dars è cambiato/);
});

test("console rules: hit/miss outcomes, a damage roll for every hit, the trigger confirmation and the selection value", () => {
  assert.deepEqual(bossGroupOutcomes(brilliance), [["hit", "Colpito"], ["miss", "Mancato"]]);
  assert.deepEqual(bossGroupOutcomes(ability(p2, "Hand Slam")), [["failed", "Fallito"], ["passed", "Superato"]]);
  assert.equal(bossGroupConfirmationText(brilliance), "Conferma innesco e Reazione disponibile.");
  assert.deepEqual(bossGroupMissingDamageIds(brilliance, ["a", "b", "c"], { a: "hit", b: "hit", c: "miss" }, { a: { cold: "10", necrotic: "10" }, b: { cold: "" } }), ["b"]);
  const base = { targetIds: ["a", "b"], outcomes: { a: "hit", b: "miss" }, manualConfirmed: true, areaRequired: true, area: {}, areaShape: brilliance.execution.target.area,
    confirmationText: "x", outcomeValues: ["hit", "miss"] };
  assert.equal(bossGroupApplyBlocker(base), "");
  assert.equal(bossGroupApplyBlocker({ ...base, missingDamageIds: ["a"] }), "Inserisci i danni di 1 bersaglio colpito.");
  assert.equal(bossGroupApplyBlocker({ ...base, outcomes: { a: "failed" } }), "Manca l’esito di 2 bersagli.");
  const targets = [creature("auril", 98), creature("dars", 60), creature("mira", 45)];
  const selection = validateBossActionGroupSelection({ sourceId: "auril", action: brilliance, targetIds: ["dars", "mira"], targets,
    outcomes: { dars: "hit", mira: "miss" }, manualConfirmed: true, area: EMANATION(["dars", "mira"]), targetAmounts: { dars: { cold: "11", necrotic: "8" } } });
  assert.deepEqual(selection, { ok: true, value: { sourceId: "auril", actionId: "divine-brilliance", targetIds: ["dars", "mira"], outcomes: { dars: "hit", mira: "miss" },
    targetAmounts: { dars: { cold: 11, necrotic: 8 } }, manualConfirmed: true, areaPlacement: EMANATION(["dars", "mira"]) } });
  assert.equal(validateBossActionGroupSelection({ sourceId: "auril", action: brilliance, targetIds: ["dars"], targets, outcomes: { dars: "hit" }, manualConfirmed: true,
    area: EMANATION(["dars"]), targetAmounts: {} }).error, "Inserisci i danni di 1 bersaglio colpito.");
  assert.equal(bossDefendedDamage(brilliance.execution.damage, { cold: 12, necrotic: 9 }, "hit", { resistances: ["cold"] }), 15);
});

test("frost theme: only Auril's boss areas, only a requestable theme, the user's opacity and width kept", () => {
  assert.equal(bossAreaTheme(p3), "frost");
  assert.equal(bossAreaTheme({ bossDefinitionId: "tiamat" }), "");
  const base = { fillColor: "#ffffff", strokeColor: "#ffffff", fillOpacity: 0.3, strokeWidth: 1.4 };
  assert.deepEqual(spellAreaStyle("boss-action-area", base, "frost"), { fillColor: "#7dd3fc", strokeColor: "#f0f9ff", fillOpacity: 0.3, strokeWidth: 1.4 });
  assert.deepEqual(spellAreaStyle("boss-action-area", base), { ...base, fillColor: "#6366f1", strokeColor: "#a5b4fc" }, "without a theme, the arcane default");
  assert.deepEqual(spellAreaStyle("fireball", base, "fire-but-unknown"), spellAreaStyle("fireball", base), "an unknown request changes nothing");
  assert.deepEqual(spellAreaStyle("fireball", base, "arcane"), spellAreaStyle("fireball", base), "spell themes cannot be requested");
});
