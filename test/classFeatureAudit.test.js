import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const audit = JSON.parse(fs.readFileSync(
  new URL("../data/class-features/class-feature-automation-audit.json", import.meta.url),
  "utf8",
));

test("l'audit copre tutti i record dei quattro overlay", () => {
  assert.equal(audit.scope.totalMechanics, 860);
  assert.equal(audit.scope.runtimeCatalogRecords, 551);
  assert.equal(audit.features.length, 860);
  assert.equal(new Set(audit.features.map((feature) => feature.id)).size, 860);
});

test("l'audit separa marker token, effetti istantanei e gestione al tavolo", () => {
  assert.deepEqual(audit.summary.byCombatTracking, {
    tavolo: 649,
    token_marker_review: 160,
    instant_effect: 43,
    token_marker: 8,
  });
  assert.equal(audit.summary.tokenMarkerCandidateCount, 8);
  assert.equal(audit.summary.structuredMarkerReviewCount, 13);
  assert.equal(audit.summary.textualMarkerReviewCount, 147);
  assert.equal(audit.summary.deterministicExcludedCount, 4);
  assert.equal(audit.summary.resourceCriterionIgnored, true);
});

test("Ispirazione Bardica viene identificata come marker su un token", () => {
  const inspiration = audit.features.find((feature) => feature.id === "bardo-ispirazione-bardica");
  assert.equal(inspiration.recommendation.mode, "token_marker");
  assert.deepEqual(inspiration.recommendation.resourcePoolIds, ["bardo-ispirazione-bardica-usi"]);
  assert.equal(inspiration.recommendation.knownTarget, true);
  assert.equal(inspiration.recommendation.knownRoundDuration, true);
});

test("le Feature già implementate restano marker token", () => {
  const rage = audit.features.find((feature) => feature.id === "barbaro-ira");
  const vow = audit.features.find((feature) => feature.id === "paladino-giuramento-di-vendetta-incanalare-divinita-giuramento-di-inimicizia");
  const twilight = audit.features.find((feature) => feature.id === "chierico-dominio-del-crepuscolo-incanalare-divinita-santuario-del-crepuscolo");
  assert.equal(rage.recommendation.mode, "token_marker");
  assert.equal(vow.recommendation.mode, "token_marker");
  assert.equal(twilight.recommendation.mode, "token_marker");
  assert.equal(vow.runtime.status, "implemented");
  assert.equal(twilight.runtime.status, "implemented");
});

test("le candidate deterministiche e i contenitori di risorse restano fuori dal perimetro", () => {
  const deterministic = audit.features.find((feature) => feature.id === "ladro-elusione");
  const channelDivinity = audit.features.find((feature) => feature.id === "chierico-incanalare-divinita");
  const pactMagic = audit.features.find((feature) => feature.id === "warlock-magia-del-patto");
  const protectionAura = audit.features.find((feature) => feature.id === "paladino-aura-di-protezione");
  assert.equal(deterministic.recommendation.mode, "tavolo");
  assert.equal(deterministic.recommendation.scopeExclusion, "solo_riferimento");
  assert.equal(channelDivinity.recommendation.mode, "tavolo");
  assert.equal(pactMagic.recommendation.mode, "tavolo");
  assert.equal(protectionAura.recommendation.mode, "tavolo");
});

// ==========================================
// CF-001B: 20 INVARIANTS DI RECONCILIATION
// ==========================================

test("CF-001B.1: esattamente 860 record totali", () => {
  assert.equal(audit.features.length, 860);
  assert.equal(audit.reconciledSummary.totalRecords, 860);
});

test("CF-001B.2: tutti gli ID sono unici", () => {
  const idSet = new Set(audit.features.map((f) => f.id));
  assert.equal(idSet.size, 860);
  const featureIdSet = new Set(audit.features.map((f) => f.featureId));
  assert.equal(featureIdSet.size, 860);
});

test("CF-001B.3: enum currentAutomationLevel validi", () => {
  const valid = new Set(["FULL", "PARTIAL", "TRACK_ONLY", "MANUAL", "NONE"]);
  for (const f of audit.features) {
    assert.ok(valid.has(f.currentAutomationLevel), `Invalid currentAutomationLevel: ${f.currentAutomationLevel} on ${f.id}`);
  }
});

test("CF-001B.4: enum targetAutomationLevel validi", () => {
  const valid = new Set(["FULL", "PARTIAL", "TRACK_ONLY", "MANUAL", "UNREVIEWED"]);
  for (const f of audit.features) {
    assert.ok(valid.has(f.targetAutomationLevel), `Invalid targetAutomationLevel: ${f.targetAutomationLevel} on ${f.id}`);
  }
});

test("CF-001B.5: enum coverageStatus validi", () => {
  const valid = new Set(["ACCEPTED", "GAP", "UNREVIEWED"]);
  for (const f of audit.features) {
    assert.ok(valid.has(f.coverageStatus), `Invalid coverageStatus: ${f.coverageStatus} on ${f.id}`);
  }
});

test("CF-001B.6: summary counts coincidono esattamente con le righe calcolate", () => {
  const curCounts = { FULL: 0, PARTIAL: 0, TRACK_ONLY: 0, MANUAL: 0, NONE: 0 };
  const tgtCounts = { FULL: 0, PARTIAL: 0, TRACK_ONLY: 0, MANUAL: 0, UNREVIEWED: 0 };
  const covCounts = { ACCEPTED: 0, GAP: 0, UNREVIEWED: 0 };
  const tstCounts = { DIRECT: 0, INDIRECT: 0, NONE: 0 };

  for (const f of audit.features) {
    curCounts[f.currentAutomationLevel]++;
    tgtCounts[f.targetAutomationLevel]++;
    covCounts[f.coverageStatus]++;
    tstCounts[f.testCoverageStatus]++;
  }

  assert.deepEqual(audit.reconciledSummary.currentAutomation, curCounts);
  assert.deepEqual(audit.reconciledSummary.targetAutomation, tgtCounts);
  assert.deepEqual(audit.reconciledSummary.coverageStatus, covCounts);
  assert.deepEqual(audit.reconciledSummary.testCoverageStatus, tstCounts);
});

test("CF-001B.7: customCodeCount === customCodeMatrix.length === 15", () => {
  const customFeatures = audit.features.filter((f) => f.usesCustomCode);
  assert.equal(customFeatures.length, 15);
  assert.equal(audit.reconciledSummary.customCodeCount, 15);
});

test("CF-001B.8: resourcePoolCount === resourceMatrix.length === 104", () => {
  assert.equal(audit.resourcePools.length, 104);
  assert.equal(audit.reconciledSummary.resourcePoolCount, 104);
});

test("CF-001B.9: persistentLifecycleCount === persistentMatrix.length === 67", () => {
  const persistent = audit.features.filter((f) => f.persistentCategory !== null);
  assert.equal(persistent.length, 67);
  assert.equal(audit.reconciledSummary.persistentLifecycleCount, 67);
});

test("CF-001B.10: catalogGapCount === 0", () => {
  const catalogGaps = audit.features.filter((f) => f.catalogStatus === "CATALOG_GAP");
  assert.equal(catalogGaps.length, 0);
  assert.equal(audit.reconciledSummary.catalogGapCount, 0);
});

test("CF-001B.11: functionalGapCount === 463", () => {
  const functionalGaps = audit.features.filter((f) => f.coverageStatus === "GAP");
  assert.equal(functionalGaps.length, 463);
  assert.equal(audit.reconciledSummary.functionalGapCount, 463);
});

test("CF-001B.12: testGapCount === 0 (all test gaps closed in CF-B01)", () => {
  const testGaps = audit.features.filter((f) => f.testGap === true);
  assert.equal(testGaps.length, 0);
  assert.equal(audit.reconciledSummary.testGapCount, 0);
});

test("CF-001B.13: sourceConflictCount === 3", () => {
  const conflicts = audit.features.filter((f) => f.sourceConflict === true);
  assert.equal(conflicts.length, 3);
  assert.equal(audit.reconciledSummary.sourceConflictCount, 3);
});

test("CF-001B.14: CATALOG_GAP implica assenza reale da tutte le fonti", () => {
  // Tutte le 860 feature provengono da fonti interne caricate, quindi nessuna è CATALOG_GAP
  for (const f of audit.features) {
    assert.equal(f.catalogStatus, "CATALOGED");
  }
});

test("CF-001B.15: missing direct test non genera automaticamente functional GAP", () => {
  // Una feature con target MANUAL e current MANUAL è ACCEPTED anche se testCoverageStatus è NONE
  const manualNoTest = audit.features.filter((f) =>
    f.targetAutomationLevel === "MANUAL"
    && f.currentAutomationLevel === "MANUAL"
    && f.testCoverageStatus === "NONE"
  );
  assert.ok(manualNoTest.length > 0);
  for (const f of manualNoTest) {
    assert.equal(f.coverageStatus, "ACCEPTED");
  }
});

test("CF-001B.16: Assassinare invariants", () => {
  const assassinate = audit.features.find((f) => f.id === "ladro-assassino-assassinare");
  assert.ok(assassinate);
  assert.equal(assassinate.catalogStatus, "CATALOGED");
  assert.equal(assassinate.currentAutomationLevel, "MANUAL");
  assert.equal(assassinate.targetAutomationLevel, "MANUAL");
  assert.equal(assassinate.runtimeExposed, false);
  assert.equal(assassinate.sourceConflict, true);
  assert.equal(assassinate.coverageStatus, "ACCEPTED");
});

test("CF-001B.17: Preservare Vita invariants", () => {
  const preserveLife = audit.features.find((f) => f.id === "chierico-dominio-della-vita-incanalare-divinita-preservare-vita");
  assert.ok(preserveLife);
  assert.equal(preserveLife.currentAutomationLevel, "TRACK_ONLY");
  assert.equal(preserveLife.targetAutomationLevel, "PARTIAL");
  assert.equal(preserveLife.sourceConflict, true);
  assert.equal(preserveLife.coverageStatus, "GAP");
  assert.equal(preserveLife.gapCategory, "EXECUTION_GAP");
});

test("CF-001B.18: Recuperare Energie invariants", () => {
  const secondWind = audit.features.find((f) => f.id === "guerriero-recuperare-energie");
  assert.ok(secondWind);
  assert.equal(secondWind.currentAutomationLevel, "TRACK_ONLY");
  assert.equal(secondWind.targetAutomationLevel, "PARTIAL");
  assert.equal(secondWind.sourceConflict, true);
  assert.equal(secondWind.coverageStatus, "GAP");
  assert.equal(secondWind.gapCategory, "EXECUTION_GAP");
});

test("CF-001B.19: Spirito del Lupo invariants", () => {
  const wolfSpirit = audit.features.find((f) => f.id === "barbaro-cammino-del-combattente-totemico-spirito-totemico-lupo");
  assert.ok(wolfSpirit);
  assert.equal(wolfSpirit.currentAutomationLevel, "FULL");
  assert.equal(wolfSpirit.targetAutomationLevel, "FULL");
  assert.equal(wolfSpirit.coverageStatus, "ACCEPTED");
  assert.equal(wolfSpirit.persistentCategory, "SPATIAL_AURA");
});

test("CF-001B.20: determinismo delle metriche canoniche", () => {
  assert.deepEqual(audit.reconciledSummary.currentAutomation, {
    FULL: 8,
    PARTIAL: 40,
    TRACK_ONLY: 148,
    MANUAL: 630,
    NONE: 34,
  });
  assert.deepEqual(audit.reconciledSummary.targetAutomation, {
    FULL: 30,
    PARTIAL: 383,
    TRACK_ONLY: 87,
    MANUAL: 360,
    UNREVIEWED: 0,
  });
  assert.deepEqual(audit.reconciledSummary.coverageStatus, {
    ACCEPTED: 397,
    GAP: 463,
    UNREVIEWED: 0,
  });
});
