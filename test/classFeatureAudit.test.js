import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const audit = JSON.parse(fs.readFileSync(
  new URL("../data/class-features/class-feature-automation-audit.json", import.meta.url),
  "utf8",
));

test("l'audit copre tutti i record dei quattro overlay", () => {
  assert.equal(audit.scope.totalMechanics, 860);
  assert.equal(audit.scope.runtimeCatalogRecords, 860);
  assert.equal(audit.features.length, 860);
  assert.equal(new Set(audit.features.map((feature) => feature.id)).size, 860);
});

test("l'audit separa marker token, effetti istantanei e gestione al tavolo", () => {
  assert.deepEqual(audit.summary.byCombatTracking, {
    tavolo: 649,
    token_marker_review: 159,
    instant_effect: 43,
    token_marker: 9,
  });
  assert.equal(audit.summary.tokenMarkerCandidateCount, 9);
  assert.equal(audit.summary.structuredMarkerReviewCount, 12);
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

test("CF-001B.9: persistentLifecycleCount === persistentMatrix.length === 96", () => {
  const persistent = audit.features.filter((f) => f.persistentCategory !== null);
  assert.equal(persistent.length, 96);
  assert.equal(audit.reconciledSummary.persistentLifecycleCount, 96);
});

test("CF-001B.10: catalogGapCount === 0", () => {
  const catalogGaps = audit.features.filter((f) => f.catalogStatus === "CATALOG_GAP");
  assert.equal(catalogGaps.length, 0);
  assert.equal(audit.reconciledSummary.catalogGapCount, 0);
});

test("CF-001B.11: functionalGapCount === 421", () => {
  const functionalGaps = audit.features.filter((f) => f.coverageStatus === "GAP");
  assert.equal(functionalGaps.length, 421);
  assert.equal(audit.reconciledSummary.functionalGapCount, 421);
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
  assert.equal(assassinate.runtimeExposed, true);
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
    PARTIAL: 56,
    TRACK_ONLY: 178,
    MANUAL: 618,
    NONE: 0,
  });
  assert.deepEqual(audit.reconciledSummary.targetAutomation, {
    FULL: 31,
    PARTIAL: 382,
    TRACK_ONLY: 87,
    MANUAL: 360,
    UNREVIEWED: 0,
  });
  assert.deepEqual(audit.reconciledSummary.coverageStatus, {
    ACCEPTED: 439,
    GAP: 421,
    UNREVIEWED: 0,
  });
});

// ==========================================
// FASE 0: BACKLOG PER ARCHETIPO E PRIMITIVA
// ==========================================

test("Backlog.1: ogni record dichiara archetipo e primitiva noti", () => {
  const archetypes = new Set(Object.keys(audit.backlog.archetypes));
  const primitives = new Set(Object.keys(audit.backlog.primitives));
  for (const f of audit.features) {
    assert.ok(archetypes.has(f.archetype), `Archetipo sconosciuto: ${f.archetype} su ${f.id}`);
    assert.ok(primitives.has(f.requiredPrimitive), `Primitiva sconosciuta: ${f.requiredPrimitive} su ${f.id}`);
    assert.equal(typeof f.dataOnlyCandidate, "boolean");
    assert.ok(Array.isArray(f.archetypeEvidence) && f.archetypeEvidence.length > 0, f.id);
  }
});

test("Backlog.2: dataOnlyCandidate vale solo per capacità aperte con primitiva disponibile", () => {
  for (const f of audit.features) {
    const implemented = f.runtime.status === "implemented";
    const available = audit.backlog.primitives[f.requiredPrimitive].available;
    assert.equal(f.dataOnlyCandidate, !implemented && available, f.id);
  }
});

test("Backlog.3: i riepiloghi coincidono con le righe", () => {
  const open = audit.features.filter((f) => f.runtime.status !== "implemented");
  assert.equal(audit.backlog.dataOnlyCandidateCount, open.filter((f) => f.dataOnlyCandidate).length);
  assert.equal(audit.backlog.needsPrimitiveCount, open.filter((f) => !f.dataOnlyCandidate).length);
  for (const [id, entry] of Object.entries(audit.backlog.primitives)) {
    assert.equal(entry.open, open.filter((f) => f.requiredPrimitive === id).length, id);
  }
  const classTotal = Object.values(audit.backlog.byClass).reduce((total, entry) =>
    total + entry.implemented + entry.dataOnlyReference + entry.dataOnlyAutomation + entry.needsPrimitive, 0);
  assert.equal(classTotal, 860);
});

test("Backlog.4: le capacità implementate derivano l'archetipo dall'adapter", () => {
  const byId = (id) => audit.features.find((f) => f.id === id);
  assert.equal(byId("barbaro-ira").archetype, "timed-condition");
  assert.equal(byId("paladino-aura-di-protezione").archetype, "aura");
  assert.equal(byId("bardo-ispirazione-bardica").archetype, "custom-adapter");
  assert.equal(byId("paladino-percezione-del-divino").archetype, "resource-only");
  const implemented = audit.features.filter((f) => f.runtime.status === "implemented");
  assert.equal(implemented.length, audit.scope.runtimeImplemented);
  assert.ok(implemented.every((f) => f.dataOnlyCandidate === false));
});

test("Backlog.5: capacità di riferimento per archetipo", () => {
  const expectations = {
    "monaco-colpo-stordente": ["save-outcome-condition", "condition-choice", true],
    "bardo-collegio-del-valore-ispirazione-in-combattimento": ["resource-only", "resource-only", true],
    "ladro-elusione": ["reference", "reference-only", true],
    "druido-forma-selvatica": ["transformation", "transformation", false],
    "guerriero-recuperare-energie": ["hp-change", "value-input", false],
    "ranger-signore-delle-bestie-compagno-del-ranger": ["companion-summon", "linked-token", false],
    "mago-recupero-arcano": ["spell-bridge", "spell-bridge", false],
  };
  for (const [id, [archetype, primitive, dataOnly]] of Object.entries(expectations)) {
    const feature = audit.features.find((f) => f.id === id);
    assert.equal(feature.archetype, archetype, id);
    assert.equal(feature.requiredPrimitive, primitive, id);
    assert.equal(feature.dataOnlyCandidate, dataOnly, id);
  }
});

test("Backlog.6: le opzioni di una capacità implementata restano descrittive", () => {
  const option = audit.features.find((f) =>
    f.id === "barbaro-cammino-dell-araldo-della-tempesta-aura-tempestosa-mare"
  );
  assert.equal(option.archetype, "reference");
  assert.deepEqual(option.archetypeEvidence, ["opzione-di-capacita-implementata"]);
});

test("Backlog.7: i pool basati su modificatori di caratteristica sono segnalati", () => {
  const inspiration = audit.features.find((f) => f.id === "bardo-ispirazione-bardica");
  assert.ok(inspiration.archetypeEvidence.includes("pool-modificatore:bardo-ispirazione-bardica-usi"));
});

test("Backlog.8: determinismo della distribuzione per archetipo", () => {
  assert.deepEqual(audit.summary.byArchetype, {
    reference: 424,
    "instant-reminder": 134,
    "timed-condition": 90,
    "resource-only": 72,
    "hp-change": 27,
    aura: 25,
    "save-outcome-condition": 20,
    movement: 19,
    "companion-summon": 17,
    "spell-bridge": 14,
    "custom-adapter": 13,
    transformation: 5,
  });
  assert.equal(audit.backlog.dataOnlyCandidateCount, 700);
  assert.equal(audit.backlog.dataOnlyAutomationCount, 123);
  assert.equal(audit.backlog.needsPrimitiveCount, 63);
});
