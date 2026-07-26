import test from "node:test";
import assert from "node:assert/strict";
import {
  getAreaSaveAutomation,
  getAreaSaveSpellOptions,
  getSpellDefinition,
} from "../src/spells-srd.js";

test("il catalogo espone gli incantesimi ad area per la Console HP", () => {
  const options = getAreaSaveSpellOptions();
  const ids = new Set(options.map((option) => option.id));

  assert.ok(options.length > 0);
  assert.equal(ids.has("entangle"), true);
  assert.equal(ids.has("hypnotic-pattern"), true);
  assert.equal(ids.has("fireball"), true);
  assert.equal(ids.has("xanathar-muro-di-luce"), true);
  assert.equal(ids.has("xanathar-scossa-tellurica"), true);
  assert.equal(ids.has("alarm"), false);
  assert.equal(ids.has("disintegrate"), false);
  assert.equal(ids.has("sleep"), false);
  assert.equal(ids.has("xanathar-immolazione"), false);
  assert.equal(ids.has("tasha-lenza-elettrizzante"), false);
  assert.equal(options.find((option) => option.id === "hypnotic-pattern")?.automated, true);
});

test("Trama Ipnotica descrive due condizioni solo per i falliti", () => {
  const spell = getSpellDefinition("hypnotic-pattern");

  assert.equal(spell.concentration, true);
  assert.deepEqual(spell.saveAutomation.trackOutcomes, ["failed"]);
  assert.deepEqual(
    spell.saveAutomation.failed.map((rule) => [rule.condition, rule.expiry]),
    [
      ["Affascinato", { mode: "concentration" }],
      ["Incapacitato", { mode: "concentration" }],
    ],
  );
  assert.equal(spell.saveAutomation.passed, undefined);
});

test("Muro di Luce mantiene la cecità a durata propria", () => {
  const spell = getSpellDefinition("xanathar-muro-di-luce");
  const [rule] = spell.saveAutomation.failed;

  assert.equal(spell.concentration, true);
  assert.deepEqual(rule.expiry, { mode: "rounds", remaining: 10 });
  assert.equal(rule.options.parentEffectId, "");
});

test("Luminescenza riusa il debuff del catalogo sui soli falliti", () => {
  const automation = getAreaSaveAutomation("faerie-fire");
  const [rule] = automation.failed;

  assert.deepEqual(automation.trackOutcomes, ["failed"]);
  assert.equal(rule.condition, "Attacchi contro: vant.");
  assert.equal(rule.effectId, "incoming-attack-advantage");
  assert.equal(rule.effectKind, "debuff");
  assert.deepEqual(rule.expiry, { mode: "concentration" });
});

test("Scossa Sinaptica e Miscela Caustica preservano effetti e durate esistenti", () => {
  const synaptic = getAreaSaveAutomation("xanathar-scossa-sinaptica").failed[0];
  const caustic = getAreaSaveAutomation("tasha-miscela-caustica-di-tasha").failed[0];

  assert.equal(synaptic.effectId, "synaptic-static-penalty");
  assert.deepEqual(synaptic.expiry, { mode: "rounds", remaining: 10 });
  assert.equal(synaptic.manualRemoval, true);
  assert.equal(synaptic.endsParentOnRemoval, true);
  assert.equal(caustic.effectId, "caustic-acid");
  assert.deepEqual(caustic.expiry, { mode: "concentration" });
  assert.equal(caustic.manualRemoval, true);
});

test("Pirotecnica applica solo la variante con tiro salvezza", () => {
  const automation = getAreaSaveAutomation("xanathar-pirotecnica");
  const [rule] = automation.failed;

  assert.equal(rule.effectId, "fireworks-blinded");
  assert.equal(rule.condition, "Accecato");
  assert.deepEqual(rule.expiry, {
    mode: "turn-end",
    actor: "source",
    remaining: 1,
    anchor: "next-turn",
  });
});
