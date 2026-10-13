// Shothragoth, l'Informe (profile v17): the fixture of a second epic boss and the shapes it shares with Auril.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { importBossActionHTML, validateBossActionProfile } from "../src/bossActionProfileCore.js";
import { buildBossActionGroupMutation, buildBossActionMutation } from "../src/bossActionExecutionCore.js";
import { bossActionExecutionKind, bossActionRowMeta, bossAreaTheme, bossDamageTypeLabel } from "../src/bossActionsViewCore.js";
import { bossProfileAuras } from "../src/bossAuraCore.js";
import { spellAreaStyle } from "../src/spellAreaStyleCore.js";
import { getBossActionAreaRuleById } from "../src/spellAreaRules.js";

const META = "com.thebigpicture.initiative/meta";
const html = await readFile(new URL("fixtures/boss-actions/shothragoth.html", import.meta.url), "utf8");
const profile = await importBossActionHTML(html, { sourceName: "shothragoth.html" });
const ability = (name) => profile.abilities.find((entry) => entry.name === name);
const creature = (id, hp, extra = {}) => ({ id, name: id, type: "IMAGE", layer: "CHARACTER", metadata: { [META]: { hp, hpMax: hp, inInitiative: true, ...extra } } });
const defenses = (list) => ({ initiativeCard: { damageDefenses: { immunities: [], resistances: [], vulnerabilities: [], ...list } } });
const boss = creature("shothragoth", 406);

test("the fixture imports as one phase of «Shothragoth»: seven traits, eight epic actions, Italian names", () => {
  assert.equal(profile.name, "Shothragoth, l'Informe");
  assert.deepEqual([profile.bossDefinitionId, profile.phaseId, profile.profileId], ["shothragoth", "fase1", "shothragoth-fase1"]);
  const counts = {};
  for (const entry of profile.abilities) counts[entry.category] = (counts[entry.category] || 0) + 1;
  assert.deepEqual(counts, { trait: 7, "epic-action": 8 });
  assert.deepEqual(profile.abilities.filter((entry) => entry.category === "epic-action").map((entry) => entry.name), [
    "Arto che Precede il Corpo", "Fauce Impossibile", "Scagliare", "Marea Informe", "Il Corpo Non Era Qui", "Cucitura del Non-Luogo",
    "Strappare la Cucitura", "Resistenza Epica"]);
  assert.deepEqual(ability("Strappare la Cucitura").usage, { note: "Special Recharge" }, "«(Ricarica Speciale)» is the recharge note");
  assert.deepEqual(ability("Marea Informe").usage, { limit: 1, period: "round" });
});

test("S1, S2 and S3: nine abilities run on shared shapes; the others stay manual reference text", () => {
  const running = profile.abilities.filter((entry) => entry.automation !== "UNSUPPORTED").map((entry) => [entry.name, entry.automation]);
  assert.deepEqual(running, [["Presenza Incompatibile", "PARTIAL"], ["Arto che Precede il Corpo", "PARTIAL"], ["Fauce Impossibile", "SUPPORTED"], ["Scagliare", "PARTIAL"],
    ["Marea Informe", "PARTIAL"], ["Il Corpo Non Era Qui", "PARTIAL"], ["Cucitura del Non-Luogo", "PARTIAL"], ["Strappare la Cucitura", "PARTIAL"],
    ["Resistenza Epica", "PARTIAL"]]);
  for (const entry of profile.abilities.filter((row) => row.automation === "UNSUPPORTED")) {
    assert.equal(entry.execution, undefined, entry.name);
    assert.equal(entry.manualText, entry.rawText, entry.name);
  }
});

test("Fauce Impossibile: a melee weapon attack, reach 10 ft, 4d8+5 force; defenses apply", () => {
  const fauce = ability("Fauce Impossibile");
  assert.deepEqual(fauce.execution, { kind: "attack-damage", attack: { bonus: 10, type: "weapon", modes: ["melee"], reach: 10 },
    target: { mode: "single", maxTargets: 1 }, damage: [{ id: "force", formula: "4d8+5", type: "force", printedAverage: 23 }] });
  assert.equal(bossActionExecutionKind(fauce), "attack-damage");
  assert.equal(bossActionRowMeta(fauce, {}).tag, "Attacco +10");
  assert.equal(bossDamageTypeLabel("force"), "forza");
  assert.equal(bossDamageTypeLabel("psychic"), "psichici");
  const plan = buildBossActionMutation({ profile, action: fauce, sourceItem: boss, targetItem: creature("dars", 60, defenses({ resistances: ["force"] })),
    mode: "melee", outcome: "hit", componentAmounts: { force: 23 }, actionInstanceId: "boss-action:fauce", round: 1 });
  assert.equal(plan.change.afterHP, 49, "force resistance halves 23");
});

test("Marea Informe: STR 18 in a 15 ft emanation, 3d10 force, Prono on a failure; the push stays on the map", () => {
  const marea = ability("Marea Informe");
  assert.deepEqual(marea.execution, { kind: "save-damage", save: { ability: "str", dc: 18 },
    target: { mode: "multiple", selection: "area", area: { shape: "emanation", size: 15, origin: "Shothragoth" } },
    damage: [{ id: "force", formula: "3d10", type: "force", printedAverage: 16 }], success: "half",
    onFailed: { conditions: [{ condition: "Prono", expiry: { mode: "manual" } }] } });
  assert.match(marea.manualText, /il bersaglio viene spinto fino a 15 ft\. in linea retta direttamente lontano da Shothragoth: la spinta si risolve sulla mappa\./);
  assert.ok(getBossActionAreaRuleById("boss-action-area:emanation:15ft"));
  const plan = buildBossActionGroupMutation({ profile, action: marea, sourceItem: boss, targetItems: [creature("dars", 60), creature("mira", 45)],
    outcomes: { dars: "failed", mira: "passed" }, componentAmounts: { force: 16 }, actionInstanceId: "boss-action:marea", round: 1,
    areaPlacement: { ruleId: "boss-action-area:emanation:15ft", start: { x: 0, y: 0 }, end: { x: 450, y: 0 }, areaTargetIds: ["dars", "mira"] } });
  assert.deepEqual(plan.causality.targets.map((target) => [target.id, target.requestedDamage, target.conditions.map((entry) => entry.condition)]),
    [["dars", 16, ["Prono"]], ["mira", 8, []]]);
});

test("Resistenza Epica: the masculine wording is the same flat d20, 11+", () => {
  const resistenza = ability("Resistenza Epica");
  assert.deepEqual(resistenza.execution, { kind: "effect-end", roll: { die: 20, threshold: 11 } });
  assert.deepEqual(resistenza.usage, {});
  assert.equal(bossActionExecutionKind(resistenza), "effect-end");
});

test("Presenza Incompatibile: a custom aura of 3d6 psychic at the start of the turn, named after the trait, void palette", () => {
  const presenza = ability("Presenza Incompatibile");
  assert.deepEqual(presenza.auras, [{ key: "presenza-incompatibile", name: "Presenza Incompatibile", radiusFeet: 10, origin: "Shothragoth",
    pills: [{ key: "inside", label: "Presenza Incompatibile", detail: "Entro 10 ft. da Shothragoth: 10 (3d6) danni psichici a inizio turno.", kind: "debuff" }],
    reminders: [{ key: "damage", event: "turn-start", resolution: "manual-damage", label: "Inizia il turno entro 10 ft. da Shothragoth: 10 (3d6) danni psichici.",
      damage: { dice: "3d6", type: "psichico" } }] }]);
  assert.doesNotMatch(presenza.manualText, /marchio/, "no boss mark rule for psychic damage");
  const [aura] = bossProfileAuras(profile);
  assert.deepEqual([aura.id, aura.radiusMeters, aura.style.fillColor, aura.targeting.filter],
    ["boss-aura:shothragoth:fase1:presenza-incompatibile", 3, "#2e1065", "hostile"]);
  assert.equal(aura.reminders[0].damage.type, "psichico");
});

test("the void theme for Shothragoth's area drawings; v16 profiles cannot carry the v17 shapes", () => {
  assert.equal(bossAreaTheme(profile), "void");
  assert.deepEqual(spellAreaStyle("boss-action-area", { fillOpacity: 0.2, strokeWidth: 1 }, "void"),
    { fillColor: "#2e1065", strokeColor: "#c4b5fd", fillOpacity: 0.2, strokeWidth: 1 });
  const v16 = structuredClone({ ...profile, profileVersion: 16, parserVersion: 16 });
  for (const entry of v16.abilities.filter((row) => ["Presenza Incompatibile", "Resistenza Epica"].includes(row.name))) {
    entry.automation = "UNSUPPORTED"; delete entry.execution; delete entry.auras; entry.manualText = entry.rawText;
  }
  for (const entry of v16.abilities.filter((row) => ["Arto che Precede il Corpo", "Scagliare", "Il Corpo Non Era Qui"].includes(row.name))) {
    entry.automation = "UNSUPPORTED"; delete entry.execution; entry.manualText = entry.rawText; // v18 shapes
  }
  for (const entry of v16.abilities.filter((row) => row.sequence)) {
    entry.automation = "UNSUPPORTED"; delete entry.execution; delete entry.sequence; entry.manualText = entry.rawText; // v19 shapes
  }
  assert.throws(() => validateBossActionProfile(v16), /unsupported|unexpected|invalid/i, "force damage, STR group saves and plain melee attacks need v17");
});
