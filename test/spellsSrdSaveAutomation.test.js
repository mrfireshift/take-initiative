import test from "node:test";
import assert from "node:assert/strict";
import spellReferenceData from "../src/spell-reference-it.json" with { type: "json" };
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
  assert.equal(ids.has("bane"), true);
  assert.equal(ids.has("legacy-tashas-mind-whip"), true);
  assert.equal(ids.has("chain-lightning"), true);
  assert.equal(ids.has("command"), true);
  assert.equal(ids.has("xanathar-anatema-elementale"), true);
  assert.equal(ids.has("banishment"), true);
  assert.equal(ids.has("xanathar-aculeo-mentale"), true);
  assert.equal(ids.has("xanathar-disperdere"), false);
  assert.equal(ids.has("xanathar-metamorfosi-di-massa"), false);
  assert.equal(ids.has("xanathar-muro-di-luce"), true);
  assert.equal(ids.has("xanathar-scossa-tellurica"), true);
  assert.equal(ids.has("glyph-of-warding"), true);
  assert.equal(ids.has("compulsion"), true);
  assert.equal(ids.has("divine-word"), true);
  assert.equal(ids.has("spirit-guardians"), true);
  assert.equal(ids.has("xanathar-investitura-del-ghiaccio"), true);
  assert.equal(ids.has("xanathar-investitura-del-vento"), false);
  assert.equal(ids.has("xanathar-investitura-della-fiamma"), true);
  assert.equal(ids.has("spiritual-weapon"), true);
  assert.equal(ids.has("arcane-sword"), true);
  assert.equal(ids.has("tasha-lama-del-disastro"), true);
  assert.equal(ids.has("arcane-hand"), true);
  assert.equal(ids.has("xanathar-investitura-della-pietra"), false);
  assert.equal(ids.has("xanathar-trabocchetto"), true);
  assert.equal(ids.has("phb2014-cordone-di-frecce"), true);
  assert.equal(ids.has("alarm"), true);
  assert.equal(ids.has("darkness"), true);
  assert.equal(ids.has("fog-cloud"), true);
  assert.equal(ids.has("silence"), true);
  assert.equal(ids.has("spike-growth"), true);
  assert.equal(ids.has("phb2014-nube-di-pugnali"), true);
  assert.equal(ids.has("phb2014-aura-di-purezza"), true);
  assert.equal(ids.has("color-spray"), true);
  assert.equal(ids.has("holy-aura"), true);
  assert.equal(ids.has("mass-cure-wounds"), true);
  assert.equal(ids.has("sleep"), true);
  assert.equal(ids.has("disintegrate"), false);
  assert.equal(ids.has("xanathar-immolazione"), false);
  assert.equal(ids.has("tasha-lenza-elettrizzante"), false);
  assert.equal(options.find((option) => option.id === "hypnotic-pattern")?.automated, true);
  assert.equal(options.find((option) => option.id === "bane")?.automated, true);
  assert.equal(options.find((option) => option.id === "legacy-tashas-mind-whip")?.automated, true);
  assert.equal(options.find((option) => option.id === "chain-lightning")?.automated, true);
  assert.equal(options.find((option) => option.id === "command")?.automated, true);
  assert.equal(options.find((option) => option.id === "banishment")?.automated, true);
  assert.equal(getAreaSaveAutomation("xanathar-disperdere"), null);
  assert.equal(getAreaSaveAutomation("xanathar-metamorfosi-di-massa"), null);
});

test("i workflow multi-bersaglio senza sagoma riusano gli effetti esistenti", () => {
  const bane = getAreaSaveAutomation("bane");
  const mindWhip = getAreaSaveAutomation("legacy-tashas-mind-whip");
  const chainLightning = getAreaSaveAutomation("chain-lightning");

  assert.equal(bane.failed[0].effectId, "attack-save-penalty");
  assert.deepEqual(bane.failed[0].expiry, { mode: "concentration" });
  assert.equal(
    mindWhip.failed[0].effectId,
    "no-reaction-and-limited-turn-options",
  );
  assert.deepEqual(mindWhip.failed[0].expiry, {
    mode: "turn-end",
    actor: "target",
    remaining: 1,
    anchor: "next-turn",
  });
  assert.deepEqual(chainLightning.trackOutcomes, []);
});

test("Aculeo Mentale applica Localizzato soltanto ai TS falliti", () => {
  const automation = getAreaSaveAutomation("xanathar-aculeo-mentale");

  assert.deepEqual(automation.trackOutcomes, ["failed"]);
  assert.equal(automation.passed, undefined);
  assert.equal(automation.immune, undefined);
  assert.deepEqual(automation.failed.map((rule) => rule.effectId), ["location-known"]);
  assert.equal(automation.failed[0].condition, "Localizzato · invis. inefficace");
});

test("Anatema Elementale riusa l'effetto del tipo scelto soltanto sui fallimenti", () => {
  const automation = getAreaSaveAutomation("xanathar-anatema-elementale", "fuoco");

  assert.deepEqual(automation.trackOutcomes, ["failed"]);
  assert.equal(automation.passed, undefined);
  assert.equal(automation.immune, undefined);
  assert.deepEqual(automation.failed, [{
    condition: "Niente res. fuoco · +2d6/turno",
    effectId: "elemental-bane-fuoco",
    effectKind: "debuff",
    effectDetail: "Perde la resistenza ai danni da fuoco; la prima volta in ogni turno in cui li subisce, riceve 2d6 danni extra.",
    expiry: { mode: "concentration" },
  }]);
  assert.equal(getAreaSaveAutomation("xanathar-anatema-elementale", "inesistente"), null);
});

test("Comando applica una sola scelta ai fallimenti e rende Prono soltanto Supplica", () => {
  for (const choice of ["avvicinati", "fermo", "fuggi", "lascia"]) {
    const automation = getAreaSaveAutomation("command", choice);
    assert.deepEqual(automation.trackOutcomes, ["failed"], choice);
    assert.equal(automation.failed, undefined, choice);
  }

  const supplica = getAreaSaveAutomation("command", "supplica");
  assert.deepEqual(supplica.trackOutcomes, ["failed"]);
  assert.deepEqual(supplica.failed, [{
    condition: "Prono",
    options: {
      parentEffectId: "",
      manualRemoval: true,
      activation: {
        mode: "turn-start",
        actor: "target",
        remaining: 1,
        anchor: "next-turn",
      },
    },
  }]);
  assert.equal(getAreaSaveAutomation("command", "non-esiste"), null);
});

test("Esilio espone l'automazione dichiarativa", () => {
  const banishment = getAreaSaveAutomation("banishment");
  assert.deepEqual(banishment.trackOutcomes, ["failed"]);
  assert.deepEqual(banishment.failed.map((rule) => rule.condition), ["Incapacitato"]);
  assert.deepEqual(banishment.failed[0].expiry, { mode: "concentration" });
  assert.equal(getAreaSaveAutomation("xanathar-disperdere"), null);
  assert.equal(getSpellDefinition("banishment").concentration, true);
  assert.equal(getSpellDefinition("xanathar-metamorfosi-di-massa").concentration, true);
});

test("le nuove aree collegano condizioni e casi senza effetto persistente", () => {
  assert.equal(
    getAreaSaveAutomation("color-spray").failed[0].condition,
    "Accecato",
  );
  assert.equal(
    getAreaSaveAutomation("holy-aura").failed[0].effectKind,
    "buff",
  );
  assert.equal(
    getAreaSaveAutomation("holy-aura").failed[0].condition,
    "Vantaggio TS · svantaggio Att",
  );
  assert.deepEqual(
    getAreaSaveAutomation("mass-cure-wounds").trackOutcomes,
    [],
  );
  assert.equal(
    getAreaSaveAutomation("sleep").failed[0].condition,
    "Privo di sensi",
  );
  assert.equal(
    getAreaSaveAutomation("compulsion").failed[0].effectId,
    "compulsion-forced-movement",
  );
  assert.deepEqual(
    getAreaSaveAutomation("divine-word").trackOutcomes,
    [],
  );
  assert.equal(
    getAreaSaveAutomation("xanathar-investitura-del-ghiaccio")
      .failed[0].effectId,
    "ice-investiture-slow",
  );
  const flame = getSpellDefinition("xanathar-investitura-della-fiamma");
  assert.equal(flame.effects[0].label, "Imm. fuoco · Res. freddo");
  assert.match(flame.effects[0].detail, /immune ai danni da fuoco/i);
  assert.equal(
    getAreaSaveAutomation("xanathar-investitura-della-pietra"),
    null,
  );
  assert.equal(
    getAreaSaveAutomation("xanathar-trabocchetto")
      .failed[0].condition,
    "Trattenuto",
  );
  assert.deepEqual(
    getAreaSaveAutomation("glyph-of-warding").trackOutcomes,
    [],
  );
  assert.deepEqual(
    getAreaSaveAutomation("phb2014-cordone-di-frecce").trackOutcomes,
    [],
  );
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

test("Nube Maleodorante collega Conati alla zona fino alla fine del turno corrente", () => {
  const automation = getAreaSaveAutomation("stinking-cloud");
  const [rule] = automation.failed;

  assert.equal(rule.condition, "Conati: azione persa");
  assert.deepEqual(rule.expiry, {
    mode: "turn-end",
    actor: "target",
    remaining: 1,
  });
  assert.equal(rule.options?.parentEffectId, undefined);
  assert.deepEqual(automation.trackOutcomes, []);
});

test("Tempesta di Nevischio lascia Prono alla risoluzione manuale del master", () => {
  const automation = getAreaSaveAutomation("sleet-storm");

  assert.deepEqual(automation.trackOutcomes, []);
  assert.equal(automation.failed, undefined);
});

test("le varianti persistenti distinguono modalita esclusive ed effetti concorrenti", () => {
  assert.deepEqual(
    getAreaSaveRuleChoices("control-water").map((choice) => choice.value),
    ["whirlpool", "flood", "redirect", "part"],
  );
  assert.deepEqual(getAreaSaveRuleChoices("earthquake"), []);
  assert.deepEqual(
    getAreaSaveAutomation("earthquake").failed.map((rule) => rule.condition),
    ["Prono"],
  );
  assert.deepEqual(
    getAreaSaveRuleChoices("xanathar-collera-della-natura"),
    [],
  );
  assert.deepEqual(
    getAreaSaveAutomation("xanathar-collera-della-natura").trackOutcomes,
    [],
  );
});

test("Tentacoli Neri lascia Trattenuto al GM; Bagliore Solare e Confusione applicano gli effetti", () => {
  const tentacles = getAreaSaveAutomation("black-tentacles");
  const sunbeam = getAreaSaveAutomation("sunbeam");
  const sunburst = getAreaSaveAutomation("sunburst");
  const confusion = getAreaSaveAutomation("confusion");

  assert.deepEqual(tentacles.trackOutcomes, []);
  assert.equal(tentacles.failed, undefined);

  assert.equal(sunbeam.failed[0].condition, "Accecato");
  assert.equal(spellReferenceData.spells.sunbeam.description.includes("6d8 danni radiosi"), true);
  assert.equal(spellReferenceData.spells.sunbeam.components.includes("una lente"), true);
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
  const fearForcedFlight = fear.failed.find((rule) => rule.effectId === "fear-forced-flight");
  const fearSave = fear.failed.find((rule) => rule.condition === "Spaventato");
  assert.match(fearForcedFlight.effectDetail, /lascia cadere ciò che impugna/u);
  assert.match(fearForcedFlight.effectDetail, /drop avviene una sola volta/u);
  assert.match(fearForcedFlight.effectDetail, /percorso disponibile più sicuro/u);
  assert.deepEqual(fearForcedFlight.saveReminder, {
    timing: "turn-start",
    mode: "consume",
    label: "Nel tuo turno usa Scatto e allontanati dal caster lungo il percorso più sicuro, se hai un luogo verso cui muoverti.",
  });
  assert.equal(
    fearSave.saveReminder.label,
    "Effettua questo TS solo se il caster non è in vista. Se lo supera, termina Paura su di sé.",
  );
  assert.equal(
    hypnoticPattern.failed.every((rule) => rule.endsParentOnRemoval === true),
    true,
  );
  assert.match(faerieFire.failed[0].effectDetail, /invisibilità/u);
});

test("Lentezza rende visibili tutte le limitazioni RAW senza automatizzare il turno", () => {
  const automation = getAreaSaveAutomation("slow");
  assert.deepEqual(automation.trackOutcomes, ["failed"]);
  assert.equal(automation.failed.length, 1);

  const [rule] = automation.failed;
  assert.equal(rule.effectId, "slow-penalty");
  assert.equal(rule.effectKind, "debuff");
  assert.equal(rule.parentRemoval, "target");
  assert.match(rule.effectDetail, /Velocità dimezzata/u);
  assert.match(rule.effectDetail, /CA -2/u);
  assert.match(rule.effectDetail, /TS Des -2/u);
  assert.match(rule.effectDetail, /niente reazioni/u);
  assert.match(rule.effectDetail, /una sola tra azione e azione bonus/u);
  assert.match(rule.effectDetail, /più di un attacco in mischia o a distanza/u);
  assert.match(rule.effectDetail, /d20/u);
  assert.match(rule.effectDetail, /11\+/u);
  assert.match(rule.effectDetail, /turno successivo/u);
  assert.match(rule.effectDetail, /manuali al tavolo/u);
  assert.deepEqual(rule.saveReminder, {
    ability: "wis",
    timing: "turn-end",
    dcSource: "source-spell",
    label: "Se supera il TS, termina Lentezza su di sé.",
  });
  assert.equal(rule.saveReminder.damage, undefined);
  assert.equal(rule.dice, undefined);
  assert.equal(rule.attackLimit, undefined);
  assert.equal(rule.spellCastingInterception, undefined);
});

test("gli effetti istantanei restano indipendenti dalla pill tecnica dello spell", () => {
  for (const id of [
    "grease",
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

test("Controllare Venti lascia al GM l'applicazione di Prono dopo il TS al tavolo", () => {
  const automation = getAreaSaveAutomation(
    "xanathar-controllare-venti",
    "downdraft",
  );
  assert.deepEqual(automation.trackOutcomes, []);
  assert.equal(automation.failed, undefined);
});
