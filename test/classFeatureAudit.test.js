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
