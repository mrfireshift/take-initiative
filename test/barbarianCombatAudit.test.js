import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const audit = JSON.parse(fs.readFileSync(
  new URL("../data/class-features/barbaro-combat-audit.json", import.meta.url),
  "utf8",
));

test("l'audit Barbaro copre la classe base e tutti i Cammini presenti", () => {
  assert.equal(audit.scope.classId, "barbaro");
  assert.equal(audit.scope.totalFeatures, 68);
  assert.equal(audit.features.length, 68);
  assert.equal(new Set(audit.features.map((feature) => feature.id)).size, 68);
  assert.equal(audit.scope.subclassIds.length, 7);
});

test("la classificazione Barbaro separa marker, review, istantanei e tavolo", () => {
  assert.deepEqual(audit.summary.byMode, {
    tavolo: 27,
    token_marker: 19,
    covered_by_parent: 3,
    instant_effect: 13,
    token_marker_review: 6,
  });
  assert.equal(audit.summary.actionableMarkerCount, 25);
});

test("i marker prioritari hanno bersaglio e durata espliciti", () => {
  const priorityIds = [
    "barbaro-ira",
    "barbaro-attacco-irruento",
    "barbaro-cammino-del-berserker-frenesia",
    "barbaro-cammino-del-berserker-presenza-intimidatoria",
    "barbaro-cammino-del-combattente-totemico-spirito-totemico-aquila",
    "barbaro-cammino-del-combattente-totemico-spirito-totemico-lupo",
    "barbaro-cammino-del-combattente-totemico-spirito-totemico-orso",
    "barbaro-cammino-del-guardiano-ancestrale-protettori-ancestrali",
    "barbaro-cammino-della-bestia-forma-della-bestia",
    "barbaro-cammino-della-bestia-chiamata-alla-caccia",
    "barbaro-cammino-della-magia-selvaggia-magia-corroborante",
    "barbaro-cammino-dello-zelota-presenza-zelante",
  ];
  for (const id of priorityIds) {
    const feature = audit.features.find((entry) => entry.id === id);
    assert.equal(feature.combatAudit.mode, "token_marker", id);
    assert.notEqual(feature.combatAudit.targetScope, "none", id);
    assert.notEqual(feature.combatAudit.duration, "passiva", id);
  }
});

test("le varianti composite non duplicano pill e gli HP con dado restano manuali", () => {
  const claws = audit.features.find((entry) => entry.id === "barbaro-cammino-della-bestia-forma-della-bestia-artigli");
  const tail = audit.features.find((entry) => entry.id === "barbaro-cammino-della-bestia-forma-della-bestia-coda");
  const tundra = audit.features.find((entry) => entry.id === "barbaro-cammino-dell-araldo-della-tempesta-aura-tempestosa-tundra");
  assert.equal(claws.combatAudit.mode, "covered_by_parent");
  assert.equal(tail.combatAudit.mode, "covered_by_parent");
  assert.equal(claws.combatAudit.parentId, "barbaro-cammino-della-bestia-forma-della-bestia");
  assert.equal(tundra.combatAudit.mode, "instant_effect");
  assert.match(tundra.combatAudit.reason, /HP temporanei/);
});

test("i parent dichiarati dalle decisioni esistono nell'audit", () => {
  const ids = new Set(audit.features.map((feature) => feature.id));
  for (const feature of audit.features) {
    if (feature.combatAudit.parentId) assert.equal(ids.has(feature.combatAudit.parentId), true, feature.id);
  }
});

test("Lupo usa un'aura automatica e Protettori resta assistito fino alla fine di Ira", () => {
  const lupo = audit.features.find(
    (entry) => entry.id === "barbaro-cammino-del-combattente-totemico-spirito-totemico-lupo",
  );
  const protettori = audit.features.find(
    (entry) => entry.id === "barbaro-cammino-del-guardiano-ancestrale-protettori-ancestrali",
  );
  assert.equal(lupo.combatAudit.targetScope, "aura");
  assert.match(lupo.combatAudit.reason, /aura automatica/i);
  assert.equal(protettori.combatAudit.targetScope, "single_target");
  assert.equal(
    protettori.combatAudit.duration,
    "fino_all_inizio_del_prossimo_turno_o_fine_ira",
  );
  assert.match(protettori.combatAudit.reason, /conferma manuale/i);
  assert.match(protettori.combatAudit.reason, /resistenza/i);
});

test("l'audit verifica le durate runtime dei marker prioritari", () => {
  assert.equal(audit.durationAudit.length, 19);
  assert.equal(audit.durationAudit.every((entry) => entry.matches), true);
  const zelante = audit.durationAudit.find(
    (entry) => entry.id === "barbaro-cammino-dello-zelota-presenza-zelante",
  );
  const protettori = audit.durationAudit.find(
    (entry) => entry.id === "barbaro-cammino-del-guardiano-ancestrale-protettori-ancestrali",
  );
  assert.deepEqual(zelante.actual, { kind: "next-turn" });
  assert.deepEqual(protettori.expected, {
    kind: "next-turn-until-feature",
    featureId: "barbaro-ira",
  });
  assert.deepEqual(protettori.actual, {
    kind: "next-turn-until-feature",
    featureId: "barbaro-ira",
  });
});
