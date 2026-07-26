import test from "node:test";
import assert from "node:assert/strict";
import {
  getAreaSaveAutomation,
  getAreaSaveRuleChoices,
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

test("Tentacoli Neri, Bagliore Solare e Confusione applicano gli effetti mancanti", () => {
  const tentacles = getAreaSaveAutomation("black-tentacles");
  const sunbeam = getAreaSaveAutomation("sunbeam");
  const sunburst = getAreaSaveAutomation("sunburst");
  const confusion = getAreaSaveAutomation("confusion");

  assert.equal(tentacles.failed[0].condition, "Trattenuto");
  assert.deepEqual(tentacles.failed[0].expiry, { mode: "concentration" });
  assert.equal(tentacles.failed[0].endsParentOnRemoval, true);

  assert.equal(sunbeam.failed[0].condition, "Accecato");
  assert.deepEqual(sunbeam.failed[0].expiry, {
    mode: "turn-start",
    actor: "source",
    remaining: 1,
    anchor: "next-turn",
  });
  assert.equal(sunburst.failed[0].condition, "Accecato");
  assert.deepEqual(sunburst.failed[0].expiry, { mode: "rounds", remaining: 10 });

  assert.equal(confusion.trackOutcomes.includes("failed"), true);
  assert.equal(confusion.failed[0].effectId, "confusion-random-turn");
  assert.equal(confusion.failed[0].effectKind, "debuff");
});

test("Paura, Trama Ipnotica e Luminescenza includono le regole specifiche dello spell", () => {
  const fear = getAreaSaveAutomation("fear");
  const hypnoticPattern = getAreaSaveAutomation("hypnotic-pattern");
  const faerieFire = getAreaSaveAutomation("faerie-fire");

  assert.equal(fear.failed.some((rule) => rule.condition === "Spaventato"), true);
  assert.equal(fear.failed.some((rule) => rule.effectId === "fear-forced-flight"), true);
  assert.equal(fear.failed.every((rule) => rule.endsParentOnRemoval === true), true);
  assert.equal(
    hypnoticPattern.failed.every((rule) => rule.endsParentOnRemoval === true),
    true,
  );
  assert.match(faerieFire.failed[0].effectDetail, /invisibilità/u);
});

test("gli effetti istantanei restano indipendenti dalla pill tecnica dello spell", () => {
  for (const id of [
    "grease",
    "sleet-storm",
    "sunbeam",
    "sunburst",
    "xanathar-onda-di-marea",
    "xanathar-scossa-tellurica",
  ]) {
    const automation = getAreaSaveAutomation(id);
    assert.deepEqual(automation.trackOutcomes, [], id);
    assert.equal(automation.failed[0].options.parentEffectId, "", id);
  }
});

test("le varianti impediscono di applicare condizioni arbitrarie agli spell ambigui", () => {
  const symbolChoices = getAreaSaveRuleChoices("symbol");
  assert.deepEqual(
    symbolChoices.map((choice) => choice.value),
    ["death", "discord", "despair", "fear", "insanity", "pain", "sleep", "stunning"],
  );
  assert.deepEqual(getAreaSaveAutomation("symbol", "death").trackOutcomes, []);
  assert.equal(getAreaSaveAutomation("symbol", "pain").failed[0].condition, "Incapacitato");
  assert.equal(getAreaSaveAutomation("symbol", "sleep").failed[0].condition, "Privo di sensi");

  assert.equal(
    getAreaSaveAutomation("xanathar-drago-illusorio", "frightful").failed[0].condition,
    "Spaventato",
  );
  assert.equal(
    getAreaSaveAutomation("xanathar-drago-illusorio", "breath").failed,
    undefined,
  );
  assert.equal(getAreaSaveAutomation("moonbeam", "damage").failed, undefined);
  assert.equal(
    getAreaSaveAutomation("moonbeam", "shapechanger").failed[0].effectId,
    "moonbeam-shapechanger-reversion",
  );
});

test("il catalogo marca automatici gli SRD e i supplementi con effetti da TS", () => {
  const options = new Map(getAreaSaveSpellOptions().map((option) => [option.id, option]));
  for (const id of [
    "black-tentacles",
    "calm-emotions",
    "confusion",
    "grease",
    "moonbeam",
    "prismatic-spray",
    "prismatic-wall",
    "reverse-gravity",
    "sleet-storm",
    "slow",
    "stinking-cloud",
    "sunbeam",
    "sunburst",
    "symbol",
    "weird",
    "zone-of-truth",
    "xanathar-collera-della-natura",
    "xanathar-controllare-venti",
    "xanathar-fulgore-nauseante",
    "xanathar-onda-di-marea",
    "xanathar-scossa-tellurica",
    "xanathar-sfera-al-vetriolo",
    "xanathar-trasmutare-roccia",
    "xanathar-turbine",
  ]) {
    assert.equal(options.get(id)?.automated, true, id);
  }
});

test("Fulgore Nauseante separa Indebolimento additivo e blocco dell'invisibilità", () => {
  const automation = getAreaSaveAutomation("xanathar-fulgore-nauseante");
  const exhaustion = automation.failed.find((rule) => rule.condition === "Indebolimento");
  const visibility = automation.failed.find(
    (rule) => rule.effectId === "sickening-radiance-no-invisibility"
  );

  assert.equal(exhaustion.options.exhaustionContribution, true);
  assert.deepEqual(exhaustion.expiry, { mode: "concentration" });
  assert.equal(visibility.effectKind, "debuff");
  assert.deepEqual(visibility.expiry, { mode: "concentration" });
});
