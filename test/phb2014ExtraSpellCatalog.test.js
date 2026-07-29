import test from "node:test";
import assert from "node:assert/strict";

import catalog from "../src/spells-phb2014-extra.json" with { type: "json" };
import {
  getAreaSaveAutomation,
  getAreaSaveSpellOptions,
  getProposedConditions,
  getSpellCatalog,
  getSpellChoiceTiming,
  getSpellDefinition,
  getSpellEffectChoices,
  getSpellEffects,
  getTrackableSpellOptions,
} from "../src/spells-srd.js";

const PHB2014_PREFIX = "phb2014-";

function spell(value) {
  const definition = getSpellDefinition(value);
  assert.ok(definition, `Spell non trovata: ${value}`);
  return definition;
}

function customSaveEffects(definition) {
  const automation = getAreaSaveAutomation(definition);
  return ["passed", "failed", "immune"].flatMap((outcome) =>
    (automation?.[outcome] || []).filter((rule) =>
      rule.effectKind === "buff" || rule.effectKind === "debuff"
    )
  );
}

test("il catalogo PHB 2014 conserva le 40 voci ripulite con ID univoci", () => {
  assert.equal(catalog.schemaVersion, 1);
  assert.equal(catalog.source.id, "phb2014");
  assert.equal(catalog.source.title, "Manuale del Giocatore 2014");
  assert.deepEqual(catalog.source.pageRange, { from: 211, to: 289 });
  assert.equal(catalog.spells.length, 40);
  assert.equal(new Set(catalog.approvedIds).size, 40);
  assert.deepEqual(catalog.approvedIds, catalog.spells.map((entry) => entry.id));
  assert.ok(catalog.spells.every((entry) =>
    entry.id.startsWith(PHB2014_PREFIX)
    && entry.name
    && entry.school
    && entry.duration
    && entry.description
    && entry.source === "phb2014"
  ));

  const serialized = JSON.stringify(catalog);
  assert.equal(serialized.includes("\uFFFD"), false);
  assert.equal(/[ÃÂ]/u.test(serialized), false);
});

test("tutte le 40 spell sono ricercabili e mostrano il riferimento italiano completo", () => {
  const fullCatalog = getSpellCatalog();
  const phbEntries = fullCatalog.filter((entry) => entry.source === "phb2014");

  assert.equal(fullCatalog.length, 477);
  assert.equal(phbEntries.length, 40);
  for (const entry of catalog.spells) {
    const definition = spell(entry.name);
    assert.equal(definition.id, entry.id);
    assert.equal(definition.displayName, entry.name);
    assert.equal(definition.italianReference.description, entry.description);
    assert.equal(definition.italianReference.sourceTitle, "Manuale del Giocatore 2014");
  }
});

test("il tracker include le durate persistenti e il solo istantaneo con effetto residuo", () => {
  const trackableIds = new Set(getTrackableSpellOptions().map((option) => option.id));
  const instantaneous = catalog.spells.filter((entry) => entry.durationKind === "instantaneous");

  assert.equal(getTrackableSpellOptions().length, 356);
  assert.equal(trackableIds.has("phb2014-raggio-di-infermita"), true);
  for (const entry of instantaneous) {
    if (entry.id === "phb2014-raggio-di-infermita") continue;
    assert.equal(trackableIds.has(entry.id), false, entry.name);
  }
  assert.equal(spell("Interdizione alle Lame").defaultTurns, 1);
  assert.equal(spell("Morte Apparente").defaultTurns, 600);
  assert.equal(spell("Telepatia").defaultTurns, 14400);
  assert.equal(spell("Tsunami").defaultTurns, 6);
});

test("HP rapidi riceve le 13 spell PHB con area o trigger spaziale", () => {
  const ids = getAreaSaveSpellOptions()
    .filter((option) => spell(option.id).source === "phb2014")
    .map((option) => option.id);

  assert.deepEqual(ids, [
    "phb2014-braccia-di-hadar",
    "phb2014-raffica-di-spine",
    "phb2014-cordone-di-frecce",
    "phb2014-nube-di-pugnali",
    "phb2014-evoca-raffica",
    "phb2014-fame-di-hadar",
    "phb2014-freccia-folgorante",
    "phb2014-aura-di-purezza",
    "phb2014-aura-di-vita",
    "phb2014-cerchio-di-potere",
    "phb2014-evoca-pioggia-di-armi",
    "phb2014-onda-distruttiva",
    "phb2014-tsunami",
  ]);
  for (const excluded of [
    "Sussurri Dissonanti",
    "Punizione Accecante",
  ]) {
    assert.equal(ids.includes(spell(excluded).id), false, excluded);
  }
});

test("le opzioni del pannello Spells espongono filtri affidabili", () => {
  const options = getTrackableSpellOptions();
  const hypnoticPattern = options.find((entry) => entry.id === "hypnotic-pattern");
  const agathys = options.find((entry) => entry.id === "phb2014-armatura-di-agathys");

  assert.equal(hypnoticPattern.concentration, true);
  assert.equal(hypnoticPattern.area, true);
  assert.equal(hypnoticPattern.automated, true);
  assert.equal(agathys.area, false);
  assert.equal(agathys.automated, true);
});

test("le condizioni standard mancanti sono cablate con la durata corretta", () => {
  const ensnaring = getAreaSaveAutomation("Colpo Intrappolante");
  const crown = getAreaSaveAutomation("Corona di Follia");
  const hunger = getAreaSaveAutomation("Fame di Hadar");
  const wave = getAreaSaveAutomation("Onda Distruttiva");

  assert.equal(ensnaring.failed[0].condition, "Trattenuto");
  assert.deepEqual(ensnaring.failed[0].expiry, { mode: "concentration" });
  assert.equal(crown.failed.some((rule) => rule.condition === "Affascinato"), true);
  assert.equal(hunger.passed[0].condition, "Accecato");
  assert.equal(hunger.failed[0].condition, "Accecato");
  assert.deepEqual(hunger.trackOutcomes, ["passed", "failed"]);
  assert.equal(wave.failed[0].condition, "Prono");
  assert.deepEqual(wave.failed[0].options, { parentEffectId: "" });

  assert.deepEqual(
    getProposedConditions(spell("Percezione delle Bestie")).map((entry) =>
      typeof entry === "string" ? entry : entry.name
    ),
    ["Accecato", "Assordato"],
  );
  assert.deepEqual(
    getProposedConditions(spell("Morte Apparente")).map((entry) =>
      typeof entry === "string" ? entry : entry.name
    ),
    ["Accecato", "Incapacitato"],
  );
});

test("25 spell ricevono almeno una pill buff/debuff meccanica aggiuntiva", () => {
  const withExtraPills = catalog.spells
    .filter((entry) => {
      const definition = spell(entry.id);
      const fixed = getSpellEffects(definition);
      const choices = getSpellEffectChoices(definition).flatMap((choice) =>
        getSpellEffects(definition, choice.value)
      );
      return fixed.length > 0 || choices.length > 0 || customSaveEffects(definition).length > 0;
    })
    .map((entry) => entry.name);

  assert.deepEqual(withExtraPills, [
    "Amicizia",
    "Interdizione alle Lame",
    "Armatura di Agathys",
    "Braccia di Hadar",
    "Colpo Intrappolante",
    "Dardo Stregato",
    "Duello Obbligato",
    "Punizione Incandescente",
    "Raffica di Spine",
    "Sortilegio",
    "Allucinazione di Forza",
    "Corona di Follia",
    "Percezione delle Bestie",
    "Arma Elementale",
    "Freccia Folgorante",
    "Morte Apparente",
    "Aura di Purezza",
    "Aura di Vita",
    "Punizione Demoralizzante",
    "Rampicante Afferrante",
    "Cerchio di Potere",
    "Faretra Rapida",
    "Punizione Esiliante",
    "Telepatia",
    "Tsunami",
  ]);
});

test("le pill con scadenza speciale non ereditano una durata errata dal parent", () => {
  assert.deepEqual(getSpellEffects("Interdizione alle Lame")[0].expiry, {
    mode: "turn-end",
    actor: "source",
    remaining: 1,
    anchor: "next-turn",
  });
  assert.deepEqual(getAreaSaveAutomation("Braccia di Hadar").failed[0].expiry, {
    mode: "turn-start",
    actor: "target",
    remaining: 1,
    anchor: "next-turn",
  });
  assert.deepEqual(getAreaSaveAutomation("Punizione Demoralizzante").failed[0].expiry, {
    mode: "turn-end",
    actor: "target",
    remaining: 1,
    anchor: "next-turn",
  });
  assert.deepEqual(getSpellEffects("Morte Apparente")[0].expiry, {
    mode: "rounds",
    remaining: 600,
  });
  assert.deepEqual(getSpellEffects("Telepatia")[0].expiry, {
    mode: "rounds",
    remaining: 14400,
  });

  const tsunami = getAreaSaveAutomation("Tsunami");
  assert.deepEqual(tsunami.failed[0].expiry, { mode: "concentration" });
  assert.equal(tsunami.failed[0].endsParentOnRemoval, undefined);
});

test("le nuove etichette meccaniche usano lo slash e non il separatore a punto", () => {
  const labels = catalog.spells.flatMap((entry) => {
    const definition = spell(entry.id);
    const choiceEffects = getSpellEffectChoices(definition).flatMap((choice) =>
      getSpellEffects(definition, choice.value)
    );
    return [
      ...getSpellEffects(definition),
      ...choiceEffects,
      ...customSaveEffects(definition).map((rule) => ({ label: rule.condition })),
    ].map((effect) => effect.label);
  });

  assert.ok(labels.length > 0);
  assert.equal(labels.some((label) => /[·•]/u.test(label)), false);
});

test("gli effetti consumati sul colpo e l'esilio extraplanare chiudono la concentrazione", () => {
  for (const name of ["Punizione Tonante", "Punizione Demoralizzante"]) {
    const automation = getAreaSaveAutomation(name);
    assert.equal(automation.concentrationAction, "dismiss", name);
    assert.equal(automation.applyOnSpellCast, true, name);
    assert.equal(automation.failed[0].options.parentEffectId, "", name);
  }
  for (const name of ["Raffica di Spine", "Freccia Folgorante"]) {
    const automation = getAreaSaveAutomation(name);
    assert.equal(automation.concentrationAction, "dismiss", name);
    assert.deepEqual(automation.trackOutcomes, [], name);
  }

  const extraplanar = getSpellEffects("Punizione Esiliante", "extraplanar")[0];
  assert.deepEqual(getSpellChoiceTiming("Punizione Esiliante", "extraplanar"), {
    concentrationAction: "dismiss",
  });
  assert.equal(extraplanar.parentEffectId, "");
  assert.deepEqual(extraplanar.expiry, { mode: "manual" });
  assert.equal(getSpellEffects("Punizione Esiliante", "native")[0].parentEffectId, undefined);
});

test("Sortilegio ricava la durata dal livello dello slot", () => {
  assert.equal(
    getSpellChoiceTiming("Sortilegio", "forza", { slotLevel: 1 }).defaultTurns,
    600,
  );
  assert.equal(
    getSpellChoiceTiming("Sortilegio", "forza", { slotLevel: 3 }).defaultTurns,
    4800,
  );
  assert.equal(
    getSpellChoiceTiming("Sortilegio", "forza", { slotLevel: 5 }).defaultTurns,
    14400,
  );
});

test("Armatura di Agathys e Arma Elementale scalano label e meccaniche con lo slot", () => {
  const agathys = getSpellEffects("Armatura di Agathys", "", { slotLevel: 4 })[0];
  assert.equal(agathys.label, "20 PF temp. / 20 freddo a chi colpisce in mischia");
  assert.equal(agathys.mechanics.tempHp.amount, 20);
  assert.equal(agathys.mechanics.retaliationDamage.amount, 20);

  const elemental = getSpellEffects("Arma Elementale", "fuoco", { slotLevel: 5 })[0];
  assert.equal(elemental.label, "+2 Att / +2d4 fuoco");
  assert.equal(elemental.mechanics.attackRoll.bonus, 2);
  assert.equal(elemental.mechanics.damageBonus.dice, "2d4");
});
