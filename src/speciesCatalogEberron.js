// Species catalog, tranche 4: Eberron: Rising from the Last War and the Mostri del Multiverso reprints
// of the changeling and the shifter. Same declarative shape as speciesCatalogVoloMordenkainen.js.
// The Eberron bugbear, goblin, hobgoblin and orc keep the Volo traits that matter at the table: those
// entries name Eberron in alsoIn. Kalashtar, warforged and the dragonmarks have no reprint.

import { FEY_ANCESTRY, ONCE_LONG, PB_LONG, once, opt, passive, perPb, spell, use } from "./speciesCatalogVoloMordenkainen.js";

const ONCE_SHORT = "Una volta per riposo breve o lungo.";
const MINUTE = 10;
const CHANGELING = ["🎭", "#e2e8f0", "#1e293b", "#f8fafc"];
const SHIFTER = ["🐺", "#d6a35c", "#3b2307", "#fff7ed"];

// The intuition of every dragonmark: a d4 added to two kinds of check.
const intuition = (key, name, checks, option) => passive(key, name, `Quando fai una prova di ${checks}, tiri un d4 e lo aggiungi al risultato.`, { option });

// The base species' traits that a dragonmark keeps (it replaces only the subrace, or the half-elf's
// Skill Versatility): the ones that matter in play, as in the Tomo dei Nemici species.
const FEY = (option) => passive(`${option}-ascendenza-fatata`, "Ascendenza fatata", `Tratto dell'elfo e del mezzelfo: ${FEY_ANCESTRY.charAt(0).toLocaleLowerCase("it")}${FEY_ANCESTRY.slice(1)}`, { option });
const HALFLING = (option) => [
  passive(`${option}-fortunato`, "Fortunato", "Tratto dell'halfling: quando ottieni 1 naturale a un tiro per colpire, a una prova di caratteristica o a un tiro salvezza, puoi ritirare il dado e devi usare il nuovo risultato.", { option }),
  passive(`${option}-coraggioso`, "Coraggioso", "Tratto dell'halfling: vantaggio ai tiri salvezza per non essere spaventato.", { option }),
  passive(`${option}-agilita-halfling`, "Agilità halfling", "Tratto dell'halfling: puoi muoverti attraverso lo spazio di qualsiasi creatura di taglia più grande della tua.", { option }),
];

const mark = (id, label, base, aliases) => ({ ...opt(id, `Marchio ${label} (${base})`, aliases), fullName: true });

// Shifting: the same four forms in both books; the temporary hit points, the uses and the Longtooth bite change.
const shifting = (speciesUses, tempHp, longtoothBite) => [
  ["pelle-bestiale", "Pelle bestiale", "ottieni 1d6 punti ferita temporanei in più e +1 alla CA."],
  ["zanna-lunga", "Zanna lunga", `${longtoothBite}: 1d6 + Forza danni perforanti.`],
  ["passo-rapido", "Passo rapido", "+3 m alla velocità camminando; quando una creatura termina il turno entro 1,5 m da te, con una reazione ti muovi fino a 3 m senza provocare attacchi di opportunità."],
  ["caccia-selvaggia", "Caccia selvaggia", "vantaggio alle prove di Saggezza, e nessuna creatura entro 9 m può avere vantaggio ai tiri per colpire contro di te, a meno che tu non sia incapacitato."],
].map(([option, name, effect]) => use(`mutazione-${option}`, `Mutazione: ${name}`, "azione_bonus", "mutazione",
  `Con un'azione bonus assumi un aspetto ferino per 1 minuto (puoi terminarlo prima con un'azione bonus) e ottieni ${tempHp}, applicati all'attivazione. Finché sei mutato, ${effect} ${speciesUses}`,
  { option, effect: { detail: `${name}: ${effect}`, rounds: MINUTE } }));

const SHIFTER_OPTIONS = [
  opt("pelle-bestiale", "Shifter pelle bestiale", ["beasthide", "pelle bestiale"]),
  opt("zanna-lunga", "Shifter zanna lunga", ["longtooth", "zanna lunga"]),
  opt("passo-rapido", "Shifter passo rapido", ["swiftstride", "passo rapido"]),
  opt("caccia-selvaggia", "Shifter caccia selvaggia", ["wildhunt", "caccia selvaggia"]),
];

export const SPECIES_CATALOG_EBERRON = [
  {
    id: "changeling", label: "Changeling", book: "eberron", page: 18, aliases: ["cangiante"], look: CHANGELING,
    traits: [
      passive("mutaforma", "Mutaforma", "Con un'azione cambi aspetto e voce: non puoi imitare una creatura mai vista, cambiare taglia o forma di base, e le tue statistiche non cambiano. Torni al tuo aspetto con un'azione o se muori."),
    ],
  },
  {
    id: "kalashtar", label: "Kalashtar", book: "eberron", page: 23, resistances: ["psychic"], look: ["🔮", "#c4b5fd", "#2e1065", "#f5f3ff"],
    traits: [
      passive("mente-duplice", "Mente duplice", "Vantaggio a tutti i tiri salvezza su Saggezza."),
      passive("disciplina-mentale", "Disciplina mentale", "Resistenza ai danni psichici, già applicata alle difese."),
      passive("legame-mentale", "Legame mentale", "Parli telepaticamente con una creatura che puoi vedere entro 3 m per tuo livello; non serve una lingua comune, ma deve capirne almeno una. Con un'azione le permetti di risponderti telepaticamente per 1 ora, finché resta entro portata."),
      passive("separato-dai-sogni", "Separato dai sogni", "Immune agli incantesimi e agli effetti che richiedono di sognare, come Sogno; non a quelli che fanno addormentare."),
    ],
  },
  {
    id: "shifter", label: "Shifter", book: "eberron", page: 27, aliases: ["mutante"], look: SHIFTER, optionLabel: "Sottorazza", options: SHIFTER_OPTIONS,
    pools: [once("mutazione", "Mutazione", "breve")],
    traits: shifting(ONCE_SHORT, "punti ferita temporanei pari al tuo livello + Costituzione (minimo 1)", "con un'azione bonus puoi fare un colpo senz'armi con le zanne"),
  },
  {
    id: "warforged", label: "Warforged", book: "eberron", page: 36, resistances: ["poison"], aliases: ["forgiato"], look: ["🤖", "#94a3b8", "#0f172a", "#f8fafc"],
    traits: [
      passive("resilienza-costruita", "Resilienza costruita", "Vantaggio ai tiri salvezza contro la condizione avvelenato; resistenza ai danni da veleno, già applicata alle difese. Immune alle malattie; non mangi, non bevi e non respiri; la magia non può farti addormentare."),
      passive("riposo-della-sentinella", "Riposo della sentinella", "Il riposo lungo è di 6 ore di inattività, in cui resti cosciente e vedi e senti normalmente."),
      passive("protezione-integrata", "Protezione integrata", "+1 alla CA, da comprendere nella CA del profilo. Indossi un'armatura in 1 ora, solo se ne hai competenza, e non può esserti tolta contro la tua volontà."),
    ],
  },
  {
    id: "marchio-del-drago", label: "Marchio del drago", book: "eberron", page: 40, optionLabel: "Marchio", aliases: ["dragonmark", "dragonmarked"], look: ["🐉", "#f472b6", "#500724", "#fdf2f8"],
    options: [
      mark("scoperta", "della scoperta", "mezzelfo", ["mark of detection", "detection"]),
      mark("ritrovamento", "del ritrovamento", "mezzorco o umano", ["mark of finding", "finding"]),
      mark("addestramento", "dell'addestramento", "umano", ["mark of handling", "handling"]),
      mark("guarigione", "della guarigione", "halfling", ["mark of healing", "healing"]),
      mark("ospitalita", "dell'ospitalità", "halfling", ["mark of hospitality", "hospitality"]),
      mark("creazione", "della creazione", "umano", ["mark of making", "making"]),
      mark("passaggio", "del passaggio", "umano", ["mark of passage", "passage"]),
      mark("scrittura", "della scrittura", "gnomo", ["mark of scribing", "scribing"]),
      mark("sentinella", "della sentinella", "umano", ["mark of sentinel", "sentinel"]),
      mark("ombra", "dell'ombra", "elfo", ["mark of shadow", "shadow"]),
      { ...mark("tempesta", "della tempesta", "mezzelfo", ["mark of storm", "storm"]), resistances: ["lightning"] },
      { ...mark("protezione", "della protezione", "nano", ["mark of warding", "warding"]), resistances: ["poison"] },
    ],
    pools: [
      once("individuazione-del-magico", "Marchio della scoperta: Individuazione del magico"), once("individuazione-malattie-veleni", "Marchio della scoperta: Individuazione delle malattie e dei veleni"), once("vedere-invisibilita", "Marchio della scoperta: Vedere invisibilità"),
      once("marchio-del-cacciatore", "Marchio del ritrovamento: Marchio del cacciatore"), once("localizza-oggetto", "Marchio del ritrovamento: Localizza oggetto"),
      once("amicizia-con-gli-animali", "Marchio dell'addestramento: Amicizia con gli animali", "breve"), once("parlare-con-gli-animali", "Marchio dell'addestramento: Parlare con gli animali", "breve"),
      once("cura-ferite", "Marchio della guarigione: Cura ferite"), once("ristorare-inferiore", "Marchio della guarigione: Ristorare inferiore"),
      once("purificare-cibo-e-bevande", "Marchio dell'ospitalità: Purificare cibo e bevande"), once("servitore-inosservato", "Marchio dell'ospitalità: Servitore inosservato"),
      once("arma-magica", "Marchio della creazione: Arma magica"),
      once("passo-velato", "Marchio del passaggio: Passo velato"),
      once("comprensione-dei-linguaggi", "Marchio della scrittura: Comprensione dei linguaggi", "breve"), once("bocca-magica", "Marchio della scrittura: Bocca magica"),
      once("scudo", "Marchio della sentinella: Scudo"), once("guardiano-vigile", "Guardiano vigile"),
      once("invisibilita", "Marchio dell'ombra: Invisibilità"),
      once("folata-di-vento", "Marchio della tempesta: Folata di vento"),
      once("allarme", "Marchio della protezione: Allarme"), once("armatura-magica", "Marchio della protezione: Armatura magica"), once("serratura-arcana", "Marchio della protezione: Serratura arcana"),
    ],
    traits: [
      passive("incantesimi-del-marchio", "Incantesimi del marchio", "Se hai la capacità Incantesimi o Magia del patto, gli incantesimi del tuo marchio si aggiungono alla lista della tua classe (tabella del marchio sul manuale)."),

      FEY("scoperta"),
      intuition("intuizione-deduttiva", "Intuizione deduttiva", "Intelligenza (Indagare) o Saggezza (Intuizione)", "scoperta"),
      passive("individuazione-magica", "Individuazione magica", "Lanci Individuazione del magico e Individuazione delle malattie e dei veleni, e dal 3° livello Vedere invisibilità, una volta per riposo lungo ciascuno, senza componenti materiali e con Saggezza come caratteristica da incantatore.", { option: "scoperta" }),
      spell("individuazione-magica-magico", "Individuazione magica: Individuazione del magico", "azione", "individuazione-del-magico", 1, `Lanci Individuazione del magico senza spendere slot né componenti materiali, con Saggezza. ${ONCE_LONG}`, { option: "scoperta" }),
      spell("individuazione-magica-malattie-veleni", "Individuazione magica: Individuazione delle malattie e dei veleni", "azione", "individuazione-malattie-veleni", 1, `Lanci Individuazione delle malattie e dei veleni senza spendere slot né componenti materiali, con Saggezza. ${ONCE_LONG}`, { option: "scoperta" }),
      spell("individuazione-magica-vedere-invisibilita", "Individuazione magica: Vedere invisibilità", "azione", "vedere-invisibilita", 3, `Lanci Vedere invisibilità senza spendere slot né componenti materiali, con Saggezza. ${ONCE_LONG}`, { option: "scoperta" }),

      intuition("intuizione-del-cacciatore", "Intuizione del cacciatore", "Saggezza (Percezione) o Saggezza (Sopravvivenza)", "ritrovamento"),
      passive("magia-del-cercatore", "Magia del cercatore", "Al posto dei tratti del mezzorco o dell'umano: lanci Marchio del cacciatore e dal 3° livello Localizza oggetto, una volta per riposo lungo ciascuno, con Saggezza come caratteristica da incantatore.", { option: "ritrovamento" }),
      spell("magia-del-cercatore-marchio-del-cacciatore", "Magia del cercatore: Marchio del cacciatore", "azione_bonus", "marchio-del-cacciatore", 1, `Lanci Marchio del cacciatore senza spendere slot, con Saggezza. ${ONCE_LONG}`, { option: "ritrovamento" }),
      spell("magia-del-cercatore-localizza-oggetto", "Magia del cercatore: Localizza oggetto", "azione", "localizza-oggetto", 3, `Lanci Localizza oggetto senza spendere slot, con Saggezza. ${ONCE_LONG}`, { option: "ritrovamento" }),

      intuition("intuizione-selvaggia", "Intuizione selvaggia", "Saggezza (Addestrare Animali) o Intelligenza (Natura)", "addestramento"),
      passive("legame-primordiale", "Legame primordiale", "Lanci Amicizia con gli animali e Parlare con gli animali, una volta per riposo breve o lungo ciascuno, senza componenti materiali e con Saggezza come caratteristica da incantatore.", { option: "addestramento" }),
      spell("legame-primordiale-amicizia-con-gli-animali", "Legame primordiale: Amicizia con gli animali", "azione", "amicizia-con-gli-animali", 1, `Lanci Amicizia con gli animali senza spendere slot né componenti materiali, con Saggezza. ${ONCE_SHORT}`, { option: "addestramento" }),
      spell("legame-primordiale-parlare-con-gli-animali", "Legame primordiale: Parlare con gli animali", "azione", "parlare-con-gli-animali", 1, `Lanci Parlare con gli animali senza spendere slot né componenti materiali, con Saggezza. ${ONCE_SHORT}`, { option: "addestramento" }),
      passive("piu-sono-grossi", "Più sono grossi", "Dal 3° livello, gli incantesimi di Legame primordiale funzionano anche sulle mostruosità con Intelligenza 3 o inferiore.", { option: "addestramento", level: 3 }),

      ...HALFLING("guarigione"),
      intuition("intuizione-medica", "Intuizione medica", "Saggezza (Medicina) o con la borsa da erborista", "guarigione"),
      passive("tocco-guaritore", "Tocco guaritore", "Lanci Cura ferite e dal 3° livello Ristorare inferiore, una volta per riposo lungo ciascuno, con Saggezza come caratteristica da incantatore.", { option: "guarigione" }),
      spell("tocco-guaritore-cura-ferite", "Tocco guaritore: Cura ferite", "azione", "cura-ferite", 1, `Lanci Cura ferite senza spendere slot, con Saggezza. ${ONCE_LONG}`, { option: "guarigione" }),
      spell("tocco-guaritore-ristorare-inferiore", "Tocco guaritore: Ristorare inferiore", "azione", "ristorare-inferiore", 3, `Lanci Ristorare inferiore senza spendere slot, con Saggezza. ${ONCE_LONG}`, { option: "guarigione" }),

      ...HALFLING("ospitalita"),
      intuition("sempre-ospitale", "Sempre ospitale", "Carisma (Persuasione) o con le scorte da birraio o gli utensili da cuoco", "ospitalita"),
      passive("magia-del-locandiere", "Magia del locandiere", "Conosci il trucchetto Prestidigitazione; lanci Purificare cibo e bevande e Servitore inosservato, una volta per riposo lungo ciascuno, con Carisma come caratteristica da incantatore.", { option: "ospitalita" }),
      spell("magia-del-locandiere-purificare-cibo-e-bevande", "Magia del locandiere: Purificare cibo e bevande", "azione", "purificare-cibo-e-bevande", 1, `Lanci Purificare cibo e bevande senza spendere slot, con Carisma. ${ONCE_LONG}`, { option: "ospitalita" }),
      spell("magia-del-locandiere-servitore-inosservato", "Magia del locandiere: Servitore inosservato", "azione", "servitore-inosservato", 1, `Lanci Servitore inosservato senza spendere slot, con Carisma. ${ONCE_LONG}`, { option: "ospitalita" }),

      intuition("intuizione-dell-artigiano", "Intuizione dell'artigiano", "Intelligenza (Arcano) o con gli strumenti da artigiano", "creazione"),
      passive("forgiatore-di-incantesimi", "Forgiatore di incantesimi", "Conosci il trucchetto Riparare. Lanci Arma magica una volta per riposo lungo: dura 1 ora e non richiede concentrazione. Caratteristica da incantatore: Intelligenza.", { option: "creazione" }),
      spell("forgiatore-di-incantesimi-arma-magica", "Forgiatore di incantesimi: Arma magica", "azione_bonus", "arma-magica", 1, `Lanci Arma magica senza spendere slot, con Intelligenza: dura 1 ora senza concentrazione. ${ONCE_LONG}`, { option: "creazione" }),

      passive("velocita-del-corriere", "Velocità del corriere", "La velocità base camminando sale a 10,5 m: va compresa nella velocità del profilo.", { option: "passaggio" }),
      intuition("movimento-intuitivo", "Movimento intuitivo", "Destrezza (Acrobazia) o con i veicoli terrestri", "passaggio"),
      spell("passaggio-magico", "Passaggio magico: Passo velato", "azione_bonus", "passo-velato", 1, `Lanci Passo velato senza spendere slot, con Destrezza come caratteristica da incantatore. ${ONCE_LONG}`, { option: "passaggio" }),

      passive("scrittura-astuzia-gnomesca", "Astuzia gnomesca", "Tratto dello gnomo: vantaggio a tutti i tiri salvezza di Intelligenza, Saggezza e Carisma contro la magia.", { option: "scrittura" }),
      intuition("scrittore-dotato", "Scrittore dotato", "Intelligenza (Storia) o con gli strumenti da calligrafo", "scrittura"),
      passive("intuizione-dello-scriba", "Intuizione dello scriba", "Conosci il trucchetto Messaggio; lanci Comprensione dei linguaggi (una volta per riposo breve o lungo) e dal 3° livello Bocca magica (una volta per riposo lungo), con Intelligenza come caratteristica da incantatore.", { option: "scrittura" }),
      spell("intuizione-dello-scriba-comprensione-dei-linguaggi", "Intuizione dello scriba: Comprensione dei linguaggi", "azione", "comprensione-dei-linguaggi", 1, `Lanci Comprensione dei linguaggi senza spendere slot, con Intelligenza. ${ONCE_SHORT}`, { option: "scrittura" }),
      spell("intuizione-dello-scriba-bocca-magica", "Intuizione dello scriba: Bocca magica", "azione", "bocca-magica", 3, `Lanci Bocca magica senza spendere slot, con Intelligenza. ${ONCE_LONG}`, { option: "scrittura" }),

      intuition("intuizione-della-sentinella", "Intuizione della sentinella", "Saggezza (Intuizione) o Saggezza (Percezione)", "sentinella"),
      spell("scudo-del-guardiano", "Scudo del guardiano: Scudo", "reazione", "scudo", 1, `Lanci Scudo senza spendere slot, con Saggezza come caratteristica da incantatore. ${ONCE_LONG}`, { option: "sentinella" }),
      use("guardiano-vigile", "Guardiano vigile", "reazione", "guardiano-vigile", `Quando una creatura che puoi vedere entro 1,5 m da te viene colpita da un attacco, con una reazione scambi il posto con lei e vieni colpito tu al suo posto. ${ONCE_LONG}`, { option: "sentinella" }),

      FEY("ombra"),
      intuition("intuizione-astuta", "Intuizione astuta", "Carisma (Intrattenere) o Destrezza (Furtività)", "ombra"),
      passive("plasmare-le-ombre", "Plasmare le ombre", "Conosci il trucchetto Illusione minore; dal 3° livello lanci Invisibilità una volta per riposo lungo. Caratteristica da incantatore: Carisma.", { option: "ombra" }),
      spell("plasmare-le-ombre-invisibilita", "Plasmare le ombre: Invisibilità", "azione", "invisibilita", 3, `Lanci Invisibilità senza spendere slot, con Carisma. ${ONCE_LONG}`, { option: "ombra" }),

      FEY("tempesta"),
      intuition("intuizione-del-maestro-dei-venti", "Intuizione del maestro dei venti", "Destrezza (Acrobazia) o con gli strumenti da navigatore", "tempesta"),
      passive("dono-della-tempesta", "Dono della tempesta", "Resistenza ai danni da fulmine, già applicata alle difese.", { option: "tempesta" }),
      passive("venti-contrari", "Venti contrari", "Conosci il trucchetto Folata; dal 3° livello lanci Folata di vento una volta per riposo lungo. Caratteristica da incantatore: Carisma.", { option: "tempesta" }),
      spell("venti-contrari-folata-di-vento", "Venti contrari: Folata di vento", "azione", "folata-di-vento", 3, `Lanci Folata di vento senza spendere slot, con Carisma. ${ONCE_LONG}`, { option: "tempesta" }),

      passive("protezione-resilienza-nanica", "Resilienza nanica", "Tratto del nano: vantaggio ai tiri salvezza contro il veleno; la resistenza ai danni da veleno è già applicata alle difese.", { option: "protezione" }),
      intuition("intuizione-del-custode", "Intuizione del custode", "Intelligenza (Indagare) o con gli arnesi da scasso", "protezione"),
      passive("protezioni-e-sigilli", "Protezioni e sigilli", "Lanci Allarme e Armatura magica, e dal 3° livello Serratura arcana, una volta per riposo lungo ciascuno, con Intelligenza come caratteristica da incantatore.", { option: "protezione" }),
      spell("protezioni-e-sigilli-allarme", "Protezioni e sigilli: Allarme", "azione", "allarme", 1, `Lanci Allarme senza spendere slot, con Intelligenza. ${ONCE_LONG}`, { option: "protezione" }),
      spell("protezioni-e-sigilli-armatura-magica", "Protezioni e sigilli: Armatura magica", "azione", "armatura-magica", 1, `Lanci Armatura magica senza spendere slot, con Intelligenza. ${ONCE_LONG}`, { option: "protezione" }),
      spell("protezioni-e-sigilli-serratura-arcana", "Protezioni e sigilli: Serratura arcana", "azione", "serratura-arcana", 3, `Lanci Serratura arcana senza spendere slot, con Intelligenza. ${ONCE_LONG}`, { option: "protezione" }),
    ],
  },
];

export const SPECIES_CATALOG_MULTIVERSO_EBERRON = [
  {
    id: "changeling-multiverso", label: "Changeling", book: "multiverso", page: 10, aliases: ["cangiante"], look: CHANGELING,
    traits: [
      passive("mutaforma", "Mutaforma", "Con un'azione cambi aspetto e voce, anche la taglia tra Media e Piccola; le tue statistiche non cambiano. Torni al tuo aspetto con un'azione o se muori."),
    ],
  },
  {
    id: "shifter-multiverso", label: "Shifter", book: "multiverso", page: 32, aliases: ["mutante"], look: SHIFTER, optionLabel: "Mutazione", options: SHIFTER_OPTIONS,
    pools: [perPb("mutazione", "Mutazione")],
    traits: shifting(PB_LONG, "punti ferita temporanei pari al doppio del bonus di competenza", "puoi fare un colpo senz'armi con le zanne quando ti trasformi e, nei turni successivi, con un'azione bonus"),
  },
];
