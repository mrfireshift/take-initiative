// Species catalog, tranche 5: Guildmasters' Guide to Ravnica, Mythic Odysseys of Theros and the Mostri
// del Multiverso reprints of the centaur, the minotaur and the satyr. Same declarative shape as
// speciesCatalogVoloMordenkainen.js; a trait's option may be a list of options.
// The Ravnica goblin is the Volo one; the Theros centaur, minotaur and triton are the Ravnica and Volo
// ones: those entries name these manuals in alsoIn. Loxodon, Simic hybrid, vedalken and leonin have no
// reprint.

import { once, opt, passive, use } from "./speciesCatalogVoloMordenkainen.js";

const ONCE_SHORT = "Una volta per riposo breve o lungo.";
const CENTAUR = ["🏹", "#d6a35c", "#3b2307", "#fff7ed"];
const MINOTAUR = ["🐂", "#b45309", "#2b1103", "#fff7ed"];
const SATYR = ["🎶", "#a3e635", "#1a2e05", "#f7fee7"];

// Simic hybrid: one Animal Enhancement at 1st level, another at 5th, from a longer list. The option is
// the pair; each enhancement applies to the pairs that chose it, from the level it was chosen at.
const FIRST = [
  ["planata", "planata della manta", "Planata della manta", "Quando cadi e non sei incapacitato, sottrai fino a 30 m dalla caduta nel calcolo dei danni e ti sposti fino a 60 cm in orizzontale per ogni 30 cm di discesa."],
  ["scalatore", "scalatore agile", "Scalatore agile", "Velocità di scalare pari alla velocità camminando."],
  ["subacqueo", "adattamento subacqueo", "Adattamento subacqueo", "Respiri aria e acqua; velocità di nuotare pari alla velocità camminando."],
];
const FIFTH_ONLY = [
  ["appendici", "appendici prensili", "Appendici prensili", "Due appendici (chele, tentacoli o simili) sono armi naturali per i colpi senz'armi: 1d6 + Forza danni contundenti. Quando colpisci una creatura con una di esse, puoi tentare di afferrarla come azione bonus. Non impugnano armi né scudi."],
  ["carapace", "carapace", "Carapace", "+1 alla CA quando non indossi un'armatura pesante: va compreso nella CA del profilo."],
  ["sputo", "sputo acido", "Sputo acido", null],
];
const SIMIC_PAIRS = FIRST.flatMap(([first, firstName]) => [...FIRST.filter(([id]) => id !== first), ...FIFTH_ONLY]
  .map(([second, secondName]) => ({ first, second, label: `Ibrido Simic: ${firstName}, al 5° ${secondName}` })));
const pairsWith = (slot, id) => SIMIC_PAIRS.filter((pair) => pair[slot] === id).map((pair) => `${pair.first}-${pair.second}`);

const simicTraits = [
  ...FIRST.flatMap(([id, , name, text]) => [
    passive(`potenziamento-${id}`, name, `Potenziamento animale del 1° livello. ${text}`, { option: pairsWith("first", id) }),
    passive(`potenziamento-${id}-5`, name, `Potenziamento animale del 5° livello. ${text}`, { option: pairsWith("second", id), level: 5 }),
  ]),
  ...FIFTH_ONLY.filter(([id]) => id !== "sputo").map(([id, , name, text]) =>
    passive(`potenziamento-${id}`, name, `Potenziamento animale del 5° livello. ${text}`, { option: pairsWith("second", id), level: 5 })),
  use("potenziamento-sputo-acido", "Sputo acido", "azione", "sputo-acido",
    "Potenziamento animale del 5° livello. Con un'azione sputi acido contro una creatura o un oggetto che vedi entro 9 m: TS su Destrezza (CD 8 + Costituzione + competenza) o 2d10 danni da acido (3d10 all'11° livello, 4d10 al 17°). Usi pari al modificatore di Costituzione (minimo 1) per riposo lungo.",
    { option: pairsWith("second", "sputo"), level: 5 }),
];

export const SPECIES_CATALOG_RAVNICA = [
  {
    id: "centauro", label: "Centauro", book: "ravnica", page: 15, alsoIn: ["theros"], aliases: ["centaur"], look: CENTAUR,
    traits: [
      passive("fatato", "Fatato", "Il tuo tipo di creatura è folletto, non umanoide."),
      passive("carica", "Carica", "Se ti muovi di almeno 9 m in linea retta verso un bersaglio e lo colpisci con un attacco con arma da mischia nello stesso turno, subito dopo puoi fare un attacco con gli zoccoli contro di lui come azione bonus."),
      passive("zoccoli", "Zoccoli", "Arma naturale: 1d4 + Forza danni contundenti. Configurala tra gli Attacchi."),
      passive("struttura-equina", "Struttura equina", "Conti come una taglia più grande per la capacità di carico; ogni metro di scalata che richiede mani e piedi ti costa 4 metri extra di movimento."),
    ],
  },
  {
    id: "loxodon", label: "Loxodon", book: "ravnica", page: 18, look: ["🐘", "#94a3b8", "#1e293b", "#f8fafc"],
    traits: [
      passive("serenita-loxodon", "Serenità loxodon", "Vantaggio ai tiri salvezza per non essere affascinato o spaventato."),
      passive("armatura-naturale", "Armatura naturale", "Senza armatura la tua CA è 12 + Costituzione, e lo scudo si somma: va compresa nella CA del profilo."),
      passive("proboscide", "Proboscide", "Afferri oggetti e sollevi fino a 5 volte la tua Forza in libbre, entro 1,5 m; puoi usarla per respirare sott'acqua come un boccaglio. Non impugna armi né scudi e non fa lavori di precisione."),
      passive("olfatto-acuto", "Olfatto acuto", "Vantaggio alle prove di Saggezza (Percezione), Saggezza (Sopravvivenza) e Intelligenza (Indagare) basate sull'olfatto."),
    ],
  },
  {
    id: "minotauro", label: "Minotauro", book: "ravnica", page: 19, alsoIn: ["theros"], aliases: ["minotaur"], look: MINOTAUR,
    traits: [
      passive("corna", "Corna", "Arma naturale: 1d6 + Forza danni perforanti. Configurala tra gli Attacchi."),
      passive("carica-incornante", "Carica incornante", "Subito dopo aver Scattato e esserti mosso di almeno 6 m, puoi fare un attacco in mischia con le corna come azione bonus."),
      passive("corna-martellanti", "Corna martellanti", "Subito dopo aver colpito una creatura con un attacco in mischia durante l'azione di Attacco, puoi usare un'azione bonus per spingerla di 1,5 m con le corna: TS su Forza (CD 8 + competenza + Forza) per resistere. Non funziona su creature di più di una taglia più grandi di te."),
    ],
  },
  {
    id: "ibrido-simic", label: "Ibrido Simic", book: "ravnica", page: 20, optionLabel: "Potenziamenti", aliases: ["simic hybrid", "simic"], look: ["🧬", "#2dd4bf", "#042f2e", "#f0fdfa"],
    options: SIMIC_PAIRS.map(({ first, second, label }) => opt(`${first}-${second}`, label)),
    pools: [{ key: "sputo-acido", name: "Sputo acido", count: "max(1, modificatore_costituzione)", rest: "lungo" }],
    traits: simicTraits,
  },
  {
    id: "vedalken", label: "Vedalken", book: "ravnica", page: 21, look: ["💧", "#60a5fa", "#172554", "#eff6ff"],
    traits: [
      passive("distacco-vedalken", "Distacco vedalken", "Vantaggio a tutti i tiri salvezza di Intelligenza, Saggezza e Carisma."),
      passive("precisione-instancabile", "Precisione instancabile", "Quando fai una prova con l'abilità o lo strumento scelti per questo tratto, tiri un d4 e lo aggiungi al risultato."),
      passive("parzialmente-anfibio", "Parzialmente anfibio", "Puoi respirare sott'acqua per un totale di 1 ora; per rifarlo devi finire un riposo lungo."),
    ],
  },
];

export const SPECIES_CATALOG_THEROS = [
  {
    id: "leonin", label: "Leonin", book: "theros", page: 21, look: ["🦁", "#fbbf24", "#451a03", "#fffbeb"],
    pools: [once("ruggito-intimidatorio", "Ruggito intimidatorio", "breve")],
    traits: [
      passive("artigli", "Artigli", "Gli artigli sono un'arma naturale per i colpi senz'armi: 1d4 + Forza danni taglienti. Configurali tra gli Attacchi."),
      use("ruggito-intimidatorio", "Ruggito intimidatorio", "azione_bonus", "ruggito-intimidatorio", `Con un'azione bonus ruggisci: ogni creatura a tua scelta entro 3 m che può sentirti supera un TS su Saggezza (CD 8 + competenza + Costituzione) o è spaventata da te fino alla fine del tuo prossimo turno. ${ONCE_SHORT}`),
    ],
  },
  {
    id: "satiro", label: "Satiro", book: "theros", page: 25, aliases: ["satyr"], look: SATYR,
    traits: [
      passive("fatato", "Fatato", "Il tuo tipo di creatura è folletto, non umanoide."),
      passive("ariete", "Ariete", "Le testate sono colpi senz'armi: 1d4 + Forza danni contundenti. Configurali tra gli Attacchi."),
      passive("resistenza-alla-magia", "Resistenza alla magia", "Vantaggio ai tiri salvezza contro incantesimi e altri effetti magici."),
      passive("balzi-gioiosi", "Balzi gioiosi", "Quando fai un salto in lungo o in alto, tiri un d8 e aggiungi altrettanti piedi (30 cm ciascuno) alla distanza, anche da fermo; la distanza extra costa movimento normalmente."),
    ],
  },
];

export const SPECIES_CATALOG_MULTIVERSO_RAVNICA_THEROS = [
  {
    id: "centauro-multiverso", label: "Centauro", book: "multiverso", page: 9, aliases: ["centaur"], look: CENTAUR,
    traits: [
      passive("fatato", "Fatato", "Il tuo tipo di creatura è folletto, non umanoide."),
      passive("carica", "Carica", "Se ti muovi di almeno 9 m in linea retta verso un bersaglio e lo colpisci con un attacco con arma da mischia nello stesso turno, subito dopo puoi fare un attacco con gli zoccoli contro di lui come azione bonus."),
      passive("zoccoli", "Zoccoli", "Arma naturale: 1d6 + Forza danni contundenti. Configurala tra gli Attacchi."),
      passive("struttura-equina", "Struttura equina", "Conti come una taglia più grande per la capacità di carico; ogni metro di scalata che richiede mani e piedi ti costa 4 metri extra di movimento."),
    ],
  },
  {
    id: "minotauro-multiverso", label: "Minotauro", book: "multiverso", page: 27, aliases: ["minotaur"], look: MINOTAUR,
    traits: [
      passive("corna", "Corna", "Arma naturale: 1d6 + Forza danni perforanti. Configurala tra gli Attacchi."),
      passive("carica-incornante", "Carica incornante", "Subito dopo aver Scattato e esserti mosso di almeno 6 m, puoi fare un attacco in mischia con le corna come azione bonus."),
      passive("corna-martellanti", "Corna martellanti", "Subito dopo aver colpito una creatura con un attacco in mischia durante l'azione di Attacco, puoi usare un'azione bonus per spingerla fino a 3 m: TS su Forza (CD 8 + competenza + Forza) per resistere. Non funziona su creature di più di una taglia più grandi di te."),
      passive("memoria-del-labirinto", "Memoria del labirinto", "Sai sempre dov'è il nord; vantaggio alle prove di Saggezza (Sopravvivenza) per orientarti o seguire tracce."),
    ],
  },
  {
    id: "satiro-multiverso", label: "Satiro", book: "multiverso", page: 29, aliases: ["satyr"], look: SATYR,
    traits: [
      passive("fatato", "Fatato", "Il tuo tipo di creatura è folletto, non umanoide."),
      passive("ariete", "Ariete", "Le testate sono un'arma naturale per i colpi senz'armi: 1d6 + Forza danni contundenti. Configurali tra gli Attacchi."),
      passive("resistenza-alla-magia", "Resistenza alla magia", "Vantaggio ai tiri salvezza contro gli incantesimi."),
      passive("balzi-gioiosi", "Balzi gioiosi", "Quando fai un salto in lungo o in alto, tiri un d8 e aggiungi altrettanti piedi (30 cm ciascuno) alla distanza, anche da fermo; la distanza extra costa movimento normalmente."),
    ],
  },
];
