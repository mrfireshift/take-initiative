import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import test from "node:test";
import { importBossActionHTML, validateBossActionProfile } from "../src/bossActionProfileCore.js";
import { bossCollapseMarker } from "../src/bossCollapseCore.js";
import { withoutLinkResistance } from "../test-support/bossLegacyProfile.js";

for (const [phase, hp, ac, executable, auraCount] of [[2, 495, 20, 12, 1], [3, 294, 17, 7, 3]]) {
  test(`canonical V12 phase ${phase} keeps final stats and the engine's action identities`, async () => {
    const html = await readFile(new URL(`fixtures/boss-actions/auril-phase-${phase}.html`, import.meta.url), "utf8");
    assert.match(html, /name="auril-canonical-version" content="2026-10-18-v12-hp495-294-v3"/);
    const stat = (key) => html.match(new RegExp(`<div data-stat="${key}"[^>]*>([\\s\\S]*?)</div>`))?.[1].replace(/<[^>]*>/g, "").trim();
    assert.equal(stat("hp"), `PF ${hp}`);
    assert.equal(stat("ac"), `CA ${ac}`);
    assert.equal(stat("initiative"), "Iniziativa 20");

    const profile = await importBossActionHTML(html);
    assert.equal(profile.profileId, `auril-fase${phase}`);
    assert.equal(profile.abilities.filter((entry) => entry.execution).length, executable);
    assert.equal(profile.abilities.flatMap((entry) => entry.auras || []).length, auraCount);
    if (phase === 2) {
      assert.equal(profile.abilities.filter((entry) => entry.sequence).length, 5);
      assert.ok(bossCollapseMarker(profile, profile.abilities.find((entry) => entry.id === "hand-slam")));
      assert.deepEqual(profile.abilities.find((entry) => entry.id === "crush").usage, { limit: 1, period: "round" });
      const grasp = profile.abilities.find((entry) => entry.id === "titan-s-grasp");
      assert.match(grasp.rawText, /35 danni effettivi nello stesso turno/);
      assert.match(grasp.manualText, /da qualsiasi fonte/);
      assert.match(grasp.manualText, /inflitti direttamente alla mano/);
      assert.doesNotMatch(grasp.rawText, /Liberazione dalla presa|gestione manuale/);
      assert.match(grasp.manualText, /Il conteggio si azzera alla fine di ogni turno/);
      assert.doesNotMatch(grasp.manualText, /40 danni|singolo personaggio|non contano.*Oggetti Animati/);
      assert.match(html, /La soglia di 35 danni riguarda solo la mano/);
      assert.doesNotMatch(html, /La soglia di 40 danni|i danni di personaggi diversi non si sommano/);
      assert.match(profile.abilities.find((entry) => entry.id === "spellcasting").manualText, /limite condiviso di Spellcasting 1\/Round/);
      assert.match(profile.abilities.find((entry) => entry.id === "breath-of-the-long-night").manualText, /rilascio è obbligatorio/);
      assert.match(profile.abilities.find((entry) => entry.id === "crush").manualText, /prigioniero cosciente/);
    } else {
      const brilliance = profile.abilities.find((entry) => entry.id === "divine-brilliance");
      assert.equal(brilliance.execution.trigger.hpBelow, 105);
      assert.equal(brilliance.execution.sourceAction, "polar-ray");
      assert.match(profile.abilities.find((entry) => entry.id === "primal-blizzard").manualText, /non a ogni Azione Epica/);
      assert.match(html, /si manifesta con 294 Punti Ferita/);
    }
  });
}

test("manual annotations preserve the execution grammar and reject missing targets or empty text", async () => {
  const html = await readFile(new URL("fixtures/boss-actions/auril-phase-2.html", import.meta.url), "utf8");
  const addNote = (id, text) => html.replace('</article>', `<p class="manual-note" id="boss-note-${id}">${text}</p></article>`);
  const baseline = (await importBossActionHTML(html)).abilities.find((entry) => entry.id === "icekiss-2");
  const annotated = (await importBossActionHTML(addNote("icekiss-2", "Solo un promemoria manuale."))).abilities.find((entry) => entry.id === "icekiss-2");
  assert.deepEqual(annotated.execution, baseline.execution);
  assert.equal(annotated.rawText, baseline.rawText);
  assert.equal(annotated.manualText, "Solo un promemoria manuale.");
  await assert.rejects(importBossActionHTML(addNote("missing-action", "Promemoria.")), /manual note target/i);
  await assert.rejects(importBossActionHTML(addNote("icekiss-2", "  ")), /manual note text/i);
});

test("an annotation inside an ability is part of its printed text and preserves its execution", async () => {
  const html = await readFile(new URL("fixtures/boss-actions/auril-phase-2.html", import.meta.url), "utf8");
  const baseline = (await importBossActionHTML(html)).abilities.find((entry) => entry.id === "icekiss-2");
  const annotatedHtml = html.replace(/(<p class="entry"><span class="title">Icekiss[\s\S]*?)(<\/p>)/,
    '$1 <span class="manual-note" id="boss-note-icekiss-2">Testo aggiuntivo della capacità.</span>$2');
  assert.notEqual(annotatedHtml, html);
  const annotated = (await importBossActionHTML(annotatedHtml)).abilities.find((entry) => entry.id === "icekiss-2");
  assert.deepEqual(annotated.execution, baseline.execution);
  assert.equal(annotated.automation, baseline.automation);
  assert.match(annotated.rawText, /Testo aggiuntivo della capacità\.$/);
  assert.equal(annotated.manualText, "Testo aggiuntivo della capacità.");
  await assert.rejects(importBossActionHTML(annotatedHtml.replace("boss-note-icekiss-2", "boss-note-crush")), /manual note target/i);
});

test("existing version 22 to 24 profiles remain valid after the parser revision", async () => {
  const html = await readFile(new URL("fixtures/boss-actions/auril-phase-2.html", import.meta.url), "utf8");
  for (const version of [22, 23, 24]) {
    const legacy = await importBossActionHTML(html);
    withoutLinkResistance(legacy);
    legacy.profileVersion = legacy.parserVersion = version;
    legacy.profileRevision = createHash("sha256").update(`${version}\n${html}`).digest("hex");
    assert.deepEqual(validateBossActionProfile(legacy), legacy);
  }
});
