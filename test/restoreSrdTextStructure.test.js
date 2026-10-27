import test from "node:test";
import assert from "node:assert/strict";

import {
  correctFeatureText,
  correctSpellText,
  restoreRulesTextStructure,
  restoreRulesTextTable,
  restoreWordSpacing,
  rulesTextWords,
  srdStructureIndex,
  unmatchedRulesWords,
} from "../scripts/restore-srd-text-structure.mjs";
import reference from "../src/spell-reference-it.json" with { type: "json" };

// What pdftotext writes: one line per paragraph, bullet items inline, a footer, a paragraph cut by a page break.
const PDF_TEXT = [
  "Comunione con la natura",
  "Divinazione di 5° livello (rituale)",
  "L'incantatore diventa brevemente un tutt'uno con la natura, acquisendo la conoscenza del territorio circostante.",
  "L'incantatore ottiene immediatamente la conoscenza di un massimo di tre fatti a sua scelta sui seguenti argomenti:",
  "• terreno e distese d'acqua • vegetali, minerali, animali o popolazioni",
  "predominanti • edifici",
  "Rivendita vietata. È permesso fotocopiare o stampare questo documento per il solo uso personale.",
  "Per esempio, l'incantatore potrebbe determinare la posizione di potenti non morti nell'area.",
  "Un bersaglio influenzato può effettuare un tiro salvezza su Saggezza alla fine di ogni suo turno.",
].join("\n");

const FLATTENED = "L'incantatore diventa brevemente un tutt'uno con la natura, acquisendo la conoscenza del territorio circostante. "
  + "L'incantatore ottiene immediatamente la conoscenza di un massimo di tre fatti a sua scelta sui seguenti argomenti: "
  + "* terreno e distese d'acqua * vegetali, minerali, animali o popolazioni predominanti * edifici "
  + "Per esempio, l'incantatore potrebbe determinare la posizione di potenti non morti nell'area. "
  + "Unbersaglio influenzato può effettuare un tiro salvezza su Saggezza alla fine di ogni suo turno.";

const index = srdStructureIndex(PDF_TEXT);

test("i paragrafi e le voci del PDF tornano nel testo appiattito, con le stesse parole", () => {
  const restored = restoreRulesTextStructure(FLATTENED, index);
  assert.equal(restored, [
    "L'incantatore diventa brevemente un tutt'uno con la natura, acquisendo la conoscenza del territorio circostante.",
    "",
    "L'incantatore ottiene immediatamente la conoscenza di un massimo di tre fatti a sua scelta sui seguenti argomenti:",
    "• terreno e distese d'acqua",
    "• vegetali, minerali, animali o popolazioni predominanti",
    "• edifici",
    "",
    "Per esempio, l'incantatore potrebbe determinare la posizione di potenti non morti nell'area.",
    "",
    // A word joined by the extraction ("Unbersaglio") still finds its paragraph.
    "Unbersaglio influenzato può effettuare un tiro salvezza su Saggezza alla fine di ogni suo turno.",
  ].join("\n"));
  assert.equal(rulesTextWords(restored), rulesTextWords(FLATTENED));
  assert.equal(restoreRulesTextStructure(restored, index), restored, "a second run changes nothing");
});

test("un testo che il PDF non ha resta com'è", () => {
  const text = "Il barbaro entra in ira con un'azione bonus. Hai vantaggio sulle prove di Forza e sui tiri salvezza su Forza.";
  assert.equal(restoreRulesTextStructure(text, index), text);
});

test("senza fine frase non si apre un paragrafo, e un * davanti a una minuscola senza elenco è un prodotto", () => {
  const pdf = srdStructureIndex([
    "Teletrasporto psichico. Come azione bonus, il personaggio lancia la lama a una distanza pari a tre metri.",
    "Per esempio, l'incantatore potrebbe determinare la posizione di potenti non morti nell'area.",
  ].join("\n"));
  const text = "Teletrasporto psichico. Come azione bonus, il personaggio lancia la lama a una distanza pari a 3 metri * il risultato del dado, "
    + "Per esempio, l'incantatore potrebbe determinare la posizione di potenti non morti nell'area.";
  assert.equal(restoreRulesTextStructure(text, pdf), text);
});

test("le tabelle note tornano righe di celle, una volta sola", () => {
  const text = "Il GM tira un d100. d100 Razza 01-04. Dragonide 05-13 Elfoalto 14-21 Elfo deiboschi 22-25 Elfo oscuro 26-29 Gnomo delle foreste "
    + "30-35 Gnomo delle rocce 36-43. Halfling piedelesto 44-51 Halflingtozzo 52-55 Mezzelfo 56-59 Mezzorco 60-68 Nano delle colline "
    + "69-76 Nano delle montagne 77-80 Tiefling 81-100. Umano La creatura reincarnata ricorda la sua vita.";
  const restored = restoreRulesTextTable(text, "reincarnate");
  assert.match(restored, /^Il GM tira un d100\.\n\nd100 \| Razza\n01-04 \| Dragonide\n/);
  assert.match(restored, /\n81-100 \| Umano\n\nLa creatura reincarnata ricorda la sua vita\.$/);
  assert.equal(rulesTextWords(restored), rulesTextWords(text));
  assert.equal(restoreRulesTextTable(restored, "reincarnate"), restored);
  assert.equal(restoreRulesTextTable(text, "fireball"), text);
});

test("le parole unite dall'estrazione tornano separate come nel PDF, con le stesse lettere", () => {
  const text = "Unbersaglio influenzato può effettuare untiro salvezza su Sagezza alla fine di ogni suo turno.";
  const spaced = restoreWordSpacing(text, index);
  // "Sagezza" has other letters than the PDF's "Saggezza": it is only reported.
  assert.equal(spaced, "Un bersaglio influenzato può effettuare un tiro salvezza su Sagezza alla fine di ogni suo turno.");
  assert.equal(restoreWordSpacing(spaced, index), spaced, "a second run changes nothing");
  assert.deepEqual(unmatchedRulesWords(spaced, index).map(({ word, pdf }) => [word, pdf]), [["Sagezza", "saggezza"]]);
});

test("una parola unita si separa solo accanto alle stesse parole del PDF", () => {
  const text = "Per esempio, l'incantatore potrebbe determinare untiro.";
  assert.equal(restoreWordSpacing(text, index), text);
});

test("negli incantesimi SRD non restano le parole unite più comuni", () => {
  const texts = Object.values(reference.spells).map((spell) => `${spell.description} ${spell.higherLevels}`).join(" ");
  for (const joined of ["untiro", "Unbersaglio", "Ilglifo", "inuno", "deiboschi", "perlato"]) {
    assert.doesNotMatch(texts, new RegExp(`\b${joined}\b`, "u"), joined);
  }
});

test("i dadi dei trucchetti e gli articoli letti come numeri tornano come nel PDF", () => {
  const spell = {
    description: "Il bersaglio subisce 1d10 danni da fuoco. 1 danni dell'incantesimo aumentano di 1d10 quando l'incantatore "
      + "raggiunge il 5° livello (2410), 1'11° livello (3410) e il 17°livello (4410).",
    higherLevels: "",
  };
  const corrected = correctSpellText("fire-bolt", spell);
  assert.equal(corrected.description, "Il bersaglio subisce 1d10 danni da fuoco. I danni dell'incantesimo aumentano di 1d10 quando "
    + "l'incantatore raggiunge il 5° livello (2d10), l'11° livello (3d10) e il 17° livello (4d10).");
  assert.deepEqual(correctSpellText("fire-bolt", corrected), corrected, "a second run changes nothing");
  assert.equal(correctSpellText("magic-jar", { description: "11 corpo dell'incantatore cade in catalessi.", higherLevels: "" }).description,
    "Il corpo dell'incantatore cade in catalessi.");
});

test("una correzione che non trova più il suo testo ferma lo script", () => {
  assert.throws(() => correctSpellText("tiny-hut", { description: "Un testo diverso.", higherLevels: "" }), /tiny-hut/u);
});

test("negli incantesimi SRD i dadi dei trucchetti e le parole lette male sono corretti", () => {
  const text = (id) => `${reference.spells[id].description} ${reference.spells[id].higherLevels}`;
  assert.match(text("fire-bolt"), /\(2d10\), l'11° livello \(3d10\) e il 17° livello \(4d10\)/u);
  assert.match(text("vicious-mockery"), /\(2d4\), l'11° livello \(3d4\) e il 17° livello \(4d4\)/u);
  assert.match(text("astral-projection"), /un'incarnazione separata/u);
  assert.match(text("ice-storm"), /superiore al 4°\./u);
  assert.match(text("create-or-destroy-water"), /fino a 45 litri d'acqua/u);
  const all = Object.keys(reference.spells).map(text).join(" ");
  assert.doesNotMatch(all, /\(\d{3,4}\)|1'11°|«1|\b1l\b|(?:^|[.!?:]\s)1{1,2} [a-zàèéìòù]/u);
});

test("una frase comune a più capacità non sposta il testo nel punto sbagliato del libro", () => {
  const book = srdStructureIndex([
    "Quando un monaco sceglie questa tradizione al 3° livello, ottiene competenza nell'abilità Intrattenere.",
    "Una riga di un'altra capacità che non c'entra nulla con il testo cercato.",
    "Quando un monaco sceglie questa tradizione al 3° livello, il suo addestramento speciale nelle arti marziali gli consente di padroneggiare alcune armi.",
    "Armi da Kensei. Il monaco sceglie due tipi di armi che saranno le sue armi da kensei: un'arma da mischia e un'arma a distanza.",
    "Parata Agile. Se il monaco effettua un colpo senz'armi come parte dell'azione di Attacco nel suo turno, ottiene un bonus alla CA.",
  ].join("\n"));
  const text = "Quando un monaco sceglie questa tradizione al 3° livello, il suo addestramento speciale nelle arti marziali gli consente di padroneggiare alcune armi. "
    + "Armi da Kensei. Il monaco sceglie due tipi di armi che saranno le sue armi da kensei: un'arma da mischia e un'arma a distanza. "
    + "Parata Agile. Se il monaco effettua un colpo senz'armi come parte dell'azione di Attacco nel suo turno, ottiene un bonus alla CA.";
  assert.deepEqual(restoreRulesTextStructure(text, book).split("\n\n").map((paragraph) => paragraph.slice(0, 14)),
    ["Quando un mona", "Armi da Kensei", "Parata Agile. "]);
});

test("le correzioni delle capacità si applicano una volta e fermano lo script se il testo cambia", () => {
  const id = "stregone-mente-aberrante-conversazione-telepatica";
  const text = "Fino a un minimo di 1,5 km. affinché si capiscano, i due parlano una lingua comprensibile a entrambi. La connessione dura un minuto.";
  const corrected = correctFeatureText(id, text);
  assert.equal(corrected, "Fino a un minimo di 1,5 km. Affinché si capiscano, i due parlano una lingua comprensibile a entrambi.\n\nLa connessione dura un minuto.");
  assert.equal(correctFeatureText(id, corrected), corrected);
  assert.throws(() => correctFeatureText(id, "Un altro testo."), new RegExp(id, "u"));
  assert.equal(correctFeatureText("barbaro-ira", "Testo invariato."), "Testo invariato.");
});
