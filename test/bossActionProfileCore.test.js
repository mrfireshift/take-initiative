import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  importBossActionHTML,
  sanitizeBossActionBinding,
  validateBossActionProfile,
} from "../src/bossActionProfileCore.js";

const phase2HTML = await readFile(new URL("fixtures/boss-actions/auril-phase-2.html", import.meta.url), "utf8");
const phase3HTML = await readFile(new URL("fixtures/boss-actions/auril-phase-3.html", import.meta.url), "utf8");
const ability = (profile, name) => profile.abilities.find((entry) => entry.name === name);

for (const [label, html, counts] of [
  ["phase 2", phase2HTML, { trait: 7, "epic-action": 14 }],
  ["phase 3", phase3HTML, { trait: 7, "epic-action": 6, reaction: 2 }],
]) {
  test(`imports every ${label} entry across both layout columns without truncation`, async () => {
    const profile = await importBossActionHTML(html, { sourceName: `${label}.html` });
    const actual = {};
    for (const entry of profile.abilities) actual[entry.category] = (actual[entry.category] || 0) + 1;
    assert.deepEqual(actual, counts);
    assert.equal(profile.rawSource.html, html);
    assert.equal(profile.rawSource.sourceName, `${label}.html`);
    assert.equal(profile.rawSource.sourceHash, createHash("sha256").update(html).digest("hex"));
    assert.equal(profile.parserVersion, 22);
    assert.equal(profile.profileVersion, 22);
    assert.equal(new Set(profile.abilities.map((entry) => entry.id)).size, profile.abilities.length);
    assert.ok(profile.abilities.every((entry) => entry.rawText.includes(entry.name)));
    assert.match(ability(profile, "Epic Resistance").rawText, /altera le sue statistiche\. Il tiro non è una prova con il d20: .*farlo ripetere\./);
  });
}

test("phase identity is explicit and shares only the boss definition identity", async () => {
  const first = await importBossActionHTML(phase2HTML);
  const second = await importBossActionHTML(phase3HTML);
  assert.equal(first.bossDefinitionId, second.bossDefinitionId);
  assert.equal(first.phaseId, "fase2");
  assert.equal(second.phaseId, "fase3");
  assert.notEqual(first.profileId, second.profileId);
  assert.match(first.profileRevision, /^[a-f0-9]{64}$/);
  assert.notEqual(first.profileRevision, first.rawSource.sourceHash);
  assert.equal(first.profileRevision, createHash("sha256").update(`22\n${phase2HTML}`).digest("hex"));
  assert.deepEqual(await importBossActionHTML(phase2HTML), first);
});

test("Icekiss uses its two printed dice expressions rather than inventing a combined pool", async () => {
  const action = ability(await importBossActionHTML(phase2HTML), "Icekiss +2");
  assert.equal(action.automation, "SUPPORTED");
  assert.deepEqual(action.execution, {
    kind: "attack-damage",
    attack: { bonus: 12, modes: ["melee", "ranged"], reach: 10, range: { normal: 150, long: 600 } },
    target: { mode: "single", maxTargets: 1 },
    damage: [
      { id: "slashing", formula: "2d10+7", printedAverage: 18, type: "slashing" },
      { id: "cold", formula: "2d6", printedAverage: 7, type: "cold" },
    ],
  });
});


test("Polar Ray derives separate component averages without assigning its printed total to either", async () => {
  const action = ability(await importBossActionHTML(phase3HTML), "Polar Ray");
  assert.equal(action.automation, "SUPPORTED");
  assert.deepEqual(action.execution, {
    kind: "attack-damage",
    printedTotalAverage: 21,
    attack: { bonus: 11, type: "spell", modes: ["ranged"], range: { normal: 120 } },
    target: { mode: "single", maxTargets: 1 },
    damage: [
      { id: "cold", formula: "3d6", average: 10, type: "cold" },
      { id: "necrotic", formula: "3d6", average: 10, type: "necrotic" },
    ],
  });
  assert.match(action.rawText, /21 \(6d6\) danni/);
  assert.equal(action.manualText, undefined);
});

test("Rock keeps its printed single damage pool; its Gather prerequisite is the round's sequence (v20)", async () => {
  const action = ability(await importBossActionHTML(phase2HTML), "Rock");
  assert.equal(action.automation, "PARTIAL");
  assert.deepEqual(action.execution, {
    kind: "attack-damage",
    attack: { bonus: 10, type: "weapon", modes: ["ranged"], range: { normal: 50, long: 100 } },
    target: { mode: "single", maxTargets: 1 },
    damage: [{ id: "bludgeoning", formula: "7d6+5", printedAverage: 29, type: "bludgeoning" }],
  });
  assert.deepEqual(action.sequence, { after: "gather-the-winter-sky" });
  assert.equal(action.manualText, "Solo nel round in cui Gather the Winter Sky è attivo: verificato dal registro del round.");
  // Without Gather the Winter Sky in the profile, Rock keeps the printed prerequisite to confirm.
  const alone = ability(await importBossActionHTML(phase2HTML.replace("Gather the Winter Sky (1/Phase).", "Raccolta del Cielo (1/Phase).")), "Rock");
  assert.equal(alone.sequence, undefined);
  assert.equal(alone.manualText, "Auril può usare questa Azione Epica soltanto mentre Gather the Winter Sky è attivo.");
});

test("ranged grammars reject unknown suffixes and inconsistent Polar Ray splits as wholly manual", async () => {
  const cases = [
    [phase2HTML.replace("Sky è attivo.</p>", "Sky è attivo. Inoltre il bersaglio muore.</p>"), "Rock"],
    [phase2HTML.replace("soltanto mentre Gather the Winter Sky è attivo.", "anche se Gather the Winter Sky non è attivo."), "Rock"],
    [phase3HTML.replace("3d6 necrotici.</p>", "3d6 necrotici. Inoltre il bersaglio muore.</p>"), "Polar Ray"],
    [phase3HTML.replace("di cui 3d6 da freddo", "di cui 2d6 da freddo"), "Polar Ray"],
    [phase3HTML.replace("e 3d6 necrotici", "e 3d8 necrotici"), "Polar Ray"],
  ];
  for (const [html, name] of cases) {
    const action = ability(await importBossActionHTML(html), name);
    assert.equal(action.automation, "UNSUPPORTED", name);
    assert.equal(action.execution, undefined, name);
    assert.equal(action.manualText, action.rawText, name);
  }
});

test("version 2 validates only the supported ranged shapes and optional attack type", async () => {
  const rock = await importBossActionHTML(phase2HTML);
  const polar = await importBossActionHTML(phase3HTML);
  for (const [profile, name] of [[rock, "Rock"], [polar, "Polar Ray"]]) {
    // v10: Divine Brilliance copies Polar Ray and is cross-checked against it; this case edits Polar Ray alone.
    const withoutType = { ...structuredClone(profile), abilities: structuredClone(profile).abilities.filter((entry) => !entry.execution?.sourceAction) };
    assert.equal(ability(withoutType, name).execution?.kind, "attack-damage");
    delete ability(withoutType, name).execution.attack.type;
    assert.equal(ability(validateBossActionProfile(withoutType), name).execution.attack.type, undefined);
    delete ability(withoutType, name).execution.printedTotalAverage;
    assert.equal(ability(validateBossActionProfile(withoutType), name).execution.printedTotalAverage, undefined);
  }
  const cases = [
    [rock, "Rock", (entry) => { entry.execution.attack.type = "script"; }],
    [rock, "Rock", (entry) => { entry.execution.attack.type = "spell"; }],
    [rock, "Rock", (entry) => { entry.execution.attack.reach = 5; }],
    [rock, "Rock", (entry) => { delete entry.execution.attack.range.long; }],
    [rock, "Rock", (entry) => { entry.execution.attack.modes = ["melee"]; }],
    [rock, "Rock", (entry) => { entry.execution.damage.push({ id: "cold", formula: "1d6", average: 3, type: "cold" }); }],
    [rock, "Rock", (entry) => { delete entry.manualText; }],
    [polar, "Polar Ray", (entry) => { entry.execution.attack.type = "weapon"; }],
    [polar, "Polar Ray", (entry) => { entry.execution.attack.range.long = 240; }],
    [polar, "Polar Ray", (entry) => { entry.execution.damage[1].type = "cold"; }],
    [polar, "Polar Ray", (entry) => { entry.execution.damage[0].printedAverage = 21; }],
    [polar, "Polar Ray", (entry) => { entry.execution.damage.pop(); }],
    [polar, "Polar Ray", (entry) => { entry.execution.printedTotalAverage = "21"; }],
    [polar, "Polar Ray", (entry) => { entry.execution.printedTotalAverage = -1; }],
    [polar, "Polar Ray", (entry) => { entry.execution.printedTotalAverage = 21.5; }],
    [polar, "Polar Ray", (entry) => { entry.execution.printedTotalAverage = NaN; }],
    [polar, "Polar Ray", (entry) => { entry.execution.printedTotalAverage = Infinity; }],
    [polar, "Polar Ray", (entry) => { entry.execution.printedTotalAverage = 10001; }],
  ];
  for (const [profile, name, mutate] of cases) {
    const invalid = structuredClone(profile);
    mutate(ability(invalid, name));
    assert.throws(() => validateBossActionProfile(invalid), /invalid|unsupported|unexpected|damage|manual/i);
  }
});

test("version 1 retains its original descriptor constraints while mixed versions are rejected", async () => {
  const profile = await importBossActionHTML(phase2HTML);
  // Version 1 predates the presentation group (v7).
  // ...and the v8 spell list: Spellcasting referenced Slow alone.
  const withoutGroup = ({ group, ...entry }) => entry.execution?.kind === "spell-reference"
    ? { ...entry, execution: { kind: "spell-reference", spellId: "slow", saveDC: entry.execution.saveDC, attackBonus: entry.execution.attackBonus } } : entry;
  const legacy = { ...profile, profileVersion: 1, parserVersion: 1, profileRevision: profile.rawSource.sourceHash,
    abilities: [withoutGroup(ability(profile, "Icekiss +2")), withoutGroup(ability(profile, "Spellcasting"))] };
  assert.deepEqual(validateBossActionProfile(legacy), legacy);
  for (const mutate of [
    (copy) => { copy.profileVersion = 2; },
    (copy) => { copy.parserVersion = 2; },
    (copy) => { copy.abilities[0].execution.printedTotalAverage = 25; },
    (copy) => { copy.abilities[0].execution.attack.type = "weapon"; },
    (copy) => { copy.abilities[0].execution.attack.modes = ["ranged"]; },
    (copy) => { copy.abilities[0].execution.damage.pop(); },
    (copy) => { copy.abilities[0].execution.damage[1].type = "necrotic"; },
  ]) {
    const invalid = structuredClone(legacy);
    mutate(invalid);
    assert.throws(() => validateBossActionProfile(invalid), /invalid|unsupported|unexpected|damage/i);
  }
});

test("Blizzard damage is separated from the literal manual movement remainder", async () => {
  const action = ability(await importBossActionHTML(phase3HTML), "Blizzard Strike");
  assert.equal(action.automation, "PARTIAL");
  assert.equal(action.id, "blizzard-strike");
  assert.deepEqual(action.usage, { limit: 1, period: "round" });
  assert.deepEqual(action.execution, {
    kind: "save-damage",
    save: { ability: "str", dc: 15 },
    target: { mode: "single", maxTargets: 1, range: 60 },
    damage: [
      { id: "bludgeoning", formula: "2d8", average: 9, type: "bludgeoning" },
      { id: "cold", formula: "2d8", average: 9, type: "cold" },
    ],
    success: "half",
  });
  assert.equal(action.manualText, "Il bersaglio viene spinto fino a 20 ft. in una direzione scelta da Auril.");
});

test("Spellcasting lists every printed spell with its daily limit while retaining the full text", async () => {
  const action = ability(await importBossActionHTML(phase2HTML), "Spellcasting");
  assert.equal(action.automation, "PARTIAL");
  assert.deepEqual(action.execution, { kind: "spell-reference", spells: [{ spellId: "slow", name: "lentezza", perDay: 3 }, { spellId: "ice-storm", name: "tempesta di ghiaccio", perDay: 3 }, { spellId: "freezing-sphere", name: "sfera congelante di Otiluke", perDay: 1 }, { spellId: "misty-step", name: "passo velato", atWill: true }], saveDC: 19, attackBonus: 11 });
  assert.match(action.rawText, /tempesta di ghiaccio/);
  assert.match(action.rawText, /sfera congelante di Otiluke\.$/);
  assert.ok(action.manualText.includes("tempesta di ghiaccio"));
});

test("unrecognized powers never acquire mechanics from coincidental dice or keywords", async () => {
  for (const [html, supported] of [
    [phase2HTML, ["Aura Gelida", "Hurl", "Epic Resistance", "Icekiss +2", "Frostmaiden's Kiss", "Mark of the Frostmaiden", "Spellcasting", "Breath of the Long Night", "Rock", "Hand Slam", "Titan's Grasp", "Crush", "Meteor Swarm"]],
    [phase3HTML, ["Blizzard Strike", "Polar Ray", "Blinding Gleam", "Soul-Numbing Cold", "Detonation of the Mark", "Divine Brilliance", "Aura Gelida", "Primal Blizzard", "Epic Resistance"]],
  ]) {
    const profile = await importBossActionHTML(html);
    // v20: Breathe Deep and Gather the Winter Sky stay manual registrations with only a sequence.
    const sequenced = ["Breathe Deep", "Gather the Winter Sky"];
    for (const entry of profile.abilities.filter((row) => !supported.includes(row.name))) {
      assert.equal(entry.automation, "UNSUPPORTED", entry.name);
      assert.equal(entry.execution, undefined, entry.name);
      if (sequenced.includes(entry.name)) assert.equal(entry.sequence?.slot, "first", entry.name);
      else assert.equal(entry.manualText, entry.rawText, entry.name);
    }
  }
  const modified = phase2HTML.replace("danni da freddo.</p>\n<p class=\"entry\"><span class=\"title\">Frostmaiden", "danni da freddo. Inoltre il bersaglio muore.</p>\n<p class=\"entry\"><span class=\"title\">Frostmaiden");
  assert.notEqual(modified, phase2HTML, "fixture edit must apply");
  assert.equal(ability(await importBossActionHTML(modified), "Icekiss +2").automation, "UNSUPPORTED");
});

test("HTML is inert even with script, handler, remote resource, and hidden nested entry payloads", async () => {
  const hostile = phase2HTML.replace("<body>", '<body onload="globalThis.bossParserExecuted=true"><script>globalThis.bossParserExecuted=true</script><iframe src="https://invalid.example"><p class="entry"><span class="title">Fake.</span>ignored</p></iframe><img src="https://invalid.example/image" onerror="globalThis.bossParserExecuted=true">');
  const result = await importBossActionHTML(hostile);
  assert.equal(result.abilities.length, 21);
  assert.equal(globalThis.bossParserExecuted, undefined);
  assert.equal(result.rawSource.html, hostile);
  assert.ok(result.abilities.every((entry) => !entry.rawText.includes("bossParserExecuted")));
});

test("numeric and named entities become safe plain text without losing long descriptions", async () => {
  const longText = "Testo integro. ".repeat(3000);
  const html = phase2HTML.replace("Doppia Manifestazione.", "Doppia &amp; Manifestazione.").replace("Auril occupa due manifestazioni", `${longText}Auril occupa due manifestazioni`).replace("Rimebound Link.", "Rimebound &#76;ink.");
  const profile = await importBossActionHTML(html);
  assert.ok(ability(profile, "Doppia & Manifestazione").rawText.includes(longText.trim()));
  assert.ok(ability(profile, "Rimebound Link"));
});

test("empty, ambiguous, missing title, and unclosed HTML are rejected explicitly", async () => {
  for (const html of ["", "<html><body>Nothing</body></html>", phase2HTML.replace("Icekiss +2.", ""), phase2HTML.replace("</p>\n<p class=\"entry\"><span class=\"title\">Frostmaiden", "\n<p class=\"entry\"><span class=\"title\">Frostmaiden"), phase2HTML + phase3HTML]) {
    assert.notEqual(html, phase2HTML, "fixture edit must apply");
    await assert.rejects(importBossActionHTML(html), /HTML|entry|title|statblock|phase|document/i);
  }
});

test("strict validation rejects unsafe descriptors, versions, identities, and damaged original source", async () => {
  const profile = await importBossActionHTML(phase2HTML);
  const cases = [
    (copy) => { copy.profileVersion = 99; },
    (copy) => { copy.parserVersion = 99; },
    (copy) => { copy.phaseId = ""; },
    (copy) => { copy.rawSource.html += "tamper"; },
    (copy) => { copy.abilities.find((entry) => entry.name === "Icekiss +2").execution.eval = "alert(1)"; },
    (copy) => { copy.abilities.find((entry) => entry.name === "Icekiss +2").execution.damage[0].formula = "2d10;alert(1)"; },
    (copy) => { copy.abilities.find((entry) => entry.name === "Icekiss +2").execution.attack.range.long = 0; },
    (copy) => { copy.abilities.find((entry) => entry.name === "Icekiss +2").execution.target.mode = "everyone"; },
    (copy) => { copy.abilities[0].execution = { kind: "script", source: "alert(1)" }; },
    (copy) => { copy.abilities.push(copy.abilities[0]); },
    (copy) => { copy.resources = { hp: 580 }; },
  ];
  for (const change of cases) {
    const copy = structuredClone(profile);
    change(copy);
    assert.throws(() => validateBossActionProfile(copy), /invalid|unsupported|unexpected|duplicate|integrity/i);
  }
  assert.deepEqual(validateBossActionProfile(JSON.parse(JSON.stringify(profile))), profile);
});

test("validation consumes structured safe data without reparsing raw prose", async () => {
  const profile = await importBossActionHTML(phase2HTML);
  ability(profile, "Icekiss +2").rawText = "Preserved editorial text; runtime still uses the validated descriptor.";
  assert.equal(ability(validateBossActionProfile(profile), "Icekiss +2").execution.attack.bonus, 12);
});

test("Actor binding retains four compact identity fields and rejects invalid references", async () => {
  const profile = await importBossActionHTML(phase2HTML);
  const bound = sanitizeBossActionBinding({ ...profile, instanceId: "never-bind-instance" });
  assert.deepEqual(bound, {
    profileId: profile.profileId,
    profileRevision: profile.profileRevision,
    bossDefinitionId: profile.bossDefinitionId,
    phaseId: profile.phaseId,
  });
  assert.equal(sanitizeBossActionBinding({ profileId: "only-id" }), null);
  assert.equal(sanitizeBossActionBinding(null), null);
  assert.ok(JSON.stringify(bound).length < 250);
});

test("forged executable array serialization hooks are rejected without running", async () => {
  const profile = await importBossActionHTML(phase2HTML);
  let executed = false;
  ability(profile, "Icekiss +2").execution.attack.modes = { toJSON() { executed = true; return ["melee", "ranged"]; } };
  assert.throws(() => validateBossActionProfile(profile), /invalid|unsupported|array/i);
  assert.equal(executed, false);
});

test("JSON import and compact binding reject revisions incompatible with action provenance",async()=>{
  const profile=await importBossActionHTML(phase2HTML);
  for(const revision of ["rev-1","a".repeat(63),"z".repeat(64)]){
    const invalid={...profile,profileRevision:revision};
    assert.equal(sanitizeBossActionBinding(invalid),null);
    assert.throws(()=>validateBossActionProfile(invalid),/identity|revision/i);
  }
});
