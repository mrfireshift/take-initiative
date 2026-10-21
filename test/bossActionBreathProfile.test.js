// Breath of the Long Night: profile v3 grammar, contract and backward compatibility.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import test from "node:test";
import { importBossActionHTML, validateBossActionProfile } from "../src/bossActionProfileCore.js";
import { createBossActionProfileStore } from "../src/bossActionProfileStore.js";

const phase2HTML = await readFile(new URL("fixtures/boss-actions/auril-phase-2.html", import.meta.url), "utf8");
const ability = (profile, name) => profile.abilities.find((entry) => entry.name === name);
const BREATH = "Breath of the Long Night";
const memoryStorage = () => { const values = new Map(); return { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) }; };
// An older parser version saw only Breath as a group action: v4-only shapes (Hand Slam) were manual.
function asVersion(profile, version) {
  const legacy = structuredClone({ ...profile, profileVersion: version, parserVersion: version,
    profileRevision: createHash("sha256").update(`${version}\n${phase2HTML}`).digest("hex") });
  for (const entry of legacy.abilities) {
    delete entry.group; // the presentation group arrived with v7
    delete entry.sequence; // the Epic Action sequence arrived with v19 (Auril's with v20)
    // Hurl and Epic Resistance arrived with v16: before, they were manual text.
    if (["throw", "effect-end"].includes(entry.execution?.kind)) { entry.automation = "UNSUPPORTED"; delete entry.execution; entry.manualText = entry.rawText; }
    // The at-will spell arrived with v15.
    if (entry.execution?.kind === "spell-reference" && Array.isArray(entry.execution.spells)) entry.execution.spells = entry.execution.spells.filter((spell) => !spell.atWill);
    // Trait auras arrived with v11: before, the trait was manual text.
    if (entry.auras) { entry.automation = "UNSUPPORTED"; delete entry.auras; entry.manualText = entry.rawText; }
    if (entry.execution?.kind === "spell-reference") entry.execution = { kind: "spell-reference", spellId: "slow", saveDC: entry.execution.saveDC, attackBonus: entry.execution.attackBonus };
    // Shapes added after that version (v4 groups, v5 single saves and effects) were manual text.
    if (entry.execution && entry.name !== BREATH && (entry.execution.target?.mode === "multiple" || entry.execution.grapple || entry.execution.drain || entry.execution.kind === "save-effect")) {
      entry.automation = "UNSUPPORTED"; delete entry.execution; entry.manualText = entry.rawText;
    }
  }
  return legacy;
}

test("the real Breath description becomes a PARTIAL multi-target CON save with printed components and Accecato on failure", async () => {
  const profile = await importBossActionHTML(phase2HTML, { sourceName: "auril-phase-2.html" });
  const breath = ability(profile, BREATH);
  assert.equal(profile.profileVersion, 25);
  assert.equal(profile.parserVersion, 25);
  assert.equal(breath.automation, "PARTIAL");
  assert.equal(breath.category, "epic-action");
  assert.deepEqual(breath.usage, { limit: 1, period: "round", note: "Special Recharge" }, "1/Round is counted; the recharge stays a manual note");
  assert.deepEqual(breath.execution, {
    kind: "save-damage",
    save: { ability: "con", dc: 19 },
    target: { mode: "multiple", selection: "area", area: { shape: "cone", size: 60, origin: "Titano" } },
    damage: [
      { id: "cold", formula: "6d10", type: "cold", printedAverage: 33 },
      { id: "necrotic", formula: "3d8", type: "necrotic", printedAverage: 13 },
    ],
    success: "half",
    onFailed: { conditions: [{ condition: "Accecato", expiry: { mode: "turn-end", actor: "source", remaining: 1, anchor: "next-turn" } }] },
  });
  // v20: the printed requirement is the sequence; the manual text only names where the recharge comes from.
  assert.deepEqual(breath.sequence, { slot: "last", after: "breathe-deep" });
  assert.equal(breath.manualText.split("\n")[0], "La ricarica viene da Breathe Deep, usata come prima Azione Epica dello stesso round: verificata dal registro del round.");
  assert.match(breath.rawText, /^Breath of the Long Night \(1\/Round, Special Recharge\)\. Tiro Salvezza su Costituzione: CD 19, ogni creatura in un Cono di 60 ft\. che origina dal Titano\..*che usa nel round\.$/);
  assert.equal(profile.rawSource.html, phase2HTML);
  assert.equal(profile.rawSource.sourceHash, createHash("sha256").update(phase2HTML).digest("hex"));
  assert.ok(!profile.diagnostics.some((row) => row.abilityId === breath.id));
});

test("any unknown or altered Breath clause leaves the whole ability manual", async () => {
  const cases = [
    phase2HTML.replace("ultima Azione Epica che usa nel round.</p>", "ultima Azione Epica che usa nel round. Inoltre il bersaglio è Spaventato.</p>"),
    phase2HTML.replace("turno successivo di Auril", "turno successivo del bersaglio"),
    phase2HTML.replace("in un Cono di 60 ft. che origina dal Titano", "in una Sfera di 60 ft. che origina dal Titano"),
    phase2HTML.replace("la condizione Accecato fino", "la condizione Assordato fino"),
    phase2HTML.replace("danni da freddo più 13 (3d8) danni necrotici, e il", "danni da freddo più 13 (3d8) danni radiosi, e il"),
    phase2HTML.replace("Successo:</b> Metà danni soltanto. Auril può usare questa Azione Epica soltanto se ha usato", "Successo:</b> Nessun danno. Auril può usare questa Azione Epica soltanto se ha usato"),
    phase2HTML.replace("ha usato Breathe Deep come prima Azione Epica dello stesso round", "ha usato Breathe Deep in un round precedente"),
  ];
  for (const html of cases) {
    assert.notEqual(html, phase2HTML, "fixture edit must apply");
    const breath = ability(await importBossActionHTML(html), BREATH);
    assert.equal(breath.automation, "UNSUPPORTED");
    assert.equal(breath.execution, undefined);
    assert.equal(breath.manualText.split("\n")[0], breath.rawText);
  }
});

test("corrected combo: Breathe Deep opens and Breath closes every round, both counted 1/Round", async () => {
  const profile = await importBossActionHTML(phase2HTML);
  const deep = ability(profile, "Breathe Deep");
  assert.deepEqual(deep.usage, { limit: 1, period: "round" });
  assert.equal(deep.automation, "UNSUPPORTED", "Breathe Deep stays a manual registration");
  assert.deepEqual(deep.sequence, { slot: "first" }, "v20: the first Epic Action of the round, checked when it is registered");
  assert.match(deep.rawText, /si ricarica fino alla fine del round; la ricarica non si trasferisce al round successivo\. .*soltanto se è la prima Azione Epica che usa nel round, e non nello stesso round di Gather the Winter Sky\./);
  assert.doesNotMatch(phase2HTML, /1\/Phase\)\.<\/span> Breath of the Long Night si ricarica/);
});

test("the original round-1 wording and plain Special Recharge title still parse without inventing a counter", async () => {
  const original = phase2HTML
    .replace("Breath of the Long Night (1/Round, Special Recharge).", "Breath of the Long Night (Special Recharge).")
    .replace("l'ultima Azione Epica che usa nel round.</p>", "l'ultima Azione Epica che usa durante il round 1.</p>");
  assert.notEqual(original, phase2HTML);
  const breath = ability(await importBossActionHTML(original), BREATH);
  assert.equal(breath.automation, "PARTIAL");
  assert.deepEqual(breath.usage, { note: "Special Recharge" });
  assert.match(breath.manualText.split("\n")[0], /durante il round 1\.$/);
  assert.equal(breath.sequence, undefined, "a round-numbered requirement stays a manual confirmation");
});

test("version 3 validation accepts only the exact group contract", async () => {
  const profile = asVersion(await importBossActionHTML(phase2HTML), 3);
  assert.deepEqual(validateBossActionProfile(profile), profile, "a stored v3 Breath stays valid");
  for (const mutate of [
    (breath) => { breath.execution.save.ability = "dex"; },
    (breath) => { breath.execution.target.selection = "auto"; },
    (breath) => { breath.execution.target.selection = "manual"; },
    (breath) => { breath.execution.target.area.shape = "sphere"; },
    (breath) => { breath.execution.target.area.geometry = [0, 0]; },
    (breath) => { breath.execution.damage[1].type = "radiant"; },
    (breath) => { delete breath.execution.damage[0].printedAverage; breath.execution.damage[0].average = 33; },
    (breath) => { breath.execution.onFailed.conditions[0].condition = "Prono"; },
    (breath) => { breath.execution.onFailed.conditions[0].expiry.actor = "target"; },
    (breath) => { breath.execution.onFailed.conditions[0].expiry.remaining = 2; },
    (breath) => { breath.execution.onFailed.conditions.push(structuredClone(breath.execution.onFailed.conditions[0])); },
    (breath) => { breath.execution.success = "none"; },
    (breath) => { breath.automation = "SUPPORTED"; },
    (breath) => { delete breath.manualText; },
  ]) {
    const invalid = structuredClone(profile);
    mutate(ability(invalid, BREATH));
    assert.throws(() => validateBossActionProfile(invalid), /invalid|unsupported|unexpected|PARTIAL|manual/i);
  }
});

test("v2 profiles stay readable without Breath mechanics and cannot carry the v3 group shape", async () => {
  const current = await importBossActionHTML(phase2HTML);
  const legacy = asVersion(current, 2);
  const breath = ability(legacy, BREATH);
  breath.automation = "UNSUPPORTED"; delete breath.execution; breath.manualText = breath.rawText;
  assert.deepEqual(validateBossActionProfile(legacy), legacy);
  const forged = structuredClone(legacy);
  Object.assign(ability(forged, BREATH), { automation: "PARTIAL", execution: structuredClone(ability(current, BREATH).execution),
    manualText: ability(current, BREATH).manualText });
  assert.throws(() => validateBossActionProfile(forged), /unexpected|unsupported|invalid/i);
  const store = createBossActionProfileStore({ storage: memoryStorage() });
  store.put(legacy); store.put(current);
  assert.deepEqual(store.list().map((profile) => profile.profileVersion), [2, 25], "both revisions of the same phase coexist");
});

test("v3 export/import keeps HTML, raw text and the normalized group contract without truncation", async () => {
  const profile = await importBossActionHTML(phase2HTML, { sourceName: "auril-phase-2.html" });
  const source = createBossActionProfileStore({ storage: memoryStorage() });
  source.put(profile);
  const json = source.exportProfile(profile.profileId, profile.profileRevision);
  const target = createBossActionProfileStore({ storage: memoryStorage() });
  const imported = target.importProfile(json);
  assert.deepEqual(imported, profile);
  assert.equal(imported.rawSource.html.length, phase2HTML.length);
  assert.deepEqual(ability(imported, BREATH).execution, ability(profile, BREATH).execution);
});
