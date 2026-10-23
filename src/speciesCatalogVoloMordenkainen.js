// Species catalog, tranche 2: Guida di Volo ai Mostri, Tomo dei Nemici di Mordenkainen and the
// Mostri del Multiverso reprints, kept side by side like the PHB and Fizban dragonborn.
// Pure declarative data: speciesTraitCore.js turns it into species, resource pools and trait records.
// Every text is a summary written for the plugin, to check on the manual at the page given.
//
// Species: { id, label, book, page, look: [emoji, accent, background, text], optionLabel?, options?,
//   resistances?, immunities?, aliases?, alsoIn? (manuals with the same text), pools?, traits }. A pool is { key, name, count: 1 | "pb", rest }.
// A trait: { key, name, text, page?, option?, act? (passiva), level? (1), uses? (pool key),
//   effect? ({ detail, rounds }: a buff pill on the character) }.

export const passive = (key, name, text, extra = {}) => ({ key, name, text, ...extra });
export const use = (key, name, act, uses, text, extra = {}) => ({ key, name, act, uses, text, ...extra });
export const once = (key, name, rest = "lungo") => ({ key, name, count: 1, rest });
export const perPb = (key, name, rest = "lungo") => ({ key, name, count: "pb", rest });
export const opt = (id, label, aliases = [], resistances = []) => ({ id, label, aliases, resistances });

export const FEY_ANCESTRY = "Vantaggio ai tiri salvezza per non essere affascinato; la magia non può farti addormentare.";
const FEY_ANCESTRY_MM = "Vantaggio ai tiri salvezza per evitare o terminare la condizione affascinato.";
const SUNLIGHT = "Svantaggio ai tiri per colpire e alle prove di Saggezza (Percezione) basate sulla vista quando tu, il bersaglio o ciò che cerchi di percepire si trova alla luce diretta del sole.";
export const MM_ABILITY = "caratteristica a scelta tra Intelligenza, Saggezza e Carisma";
export const PB_LONG = "Usi pari al bonus di competenza per riposo lungo.";
export const ONCE_LONG = "Una volta per riposo lungo.";
const ONCE_SHORT = "Una volta per riposo breve o lungo.";
const MINUTE = 10;

// An innate spell: it spends the species' own use and appears from the given level.
export const spell = (key, name, act, uses, level, text, extra = {}) => use(key, name, act, uses, text, { level, ...extra });

const TIEFLING_BLOODLINES = [
  // [option, label, page, cantrip, 3rd-level spell, cast as 2nd level, act, 5th-level spell, act]
  ["asmodeus", "Asmodeus", 21, "Taumaturgia", "Intimorire infernale", true, "reazione", "Oscurità", "azione"],
  ["baalzebul", "Baalzebul", 21, "Taumaturgia", "Raggio di infermità", true, "azione", "Corona di follia", "azione"],
  ["dispater", "Dispater", 21, "Taumaturgia", "Camuffare se stesso", false, "azione", "Individuazione dei pensieri", "azione"],
  ["fierna", "Fierna", 22, "Amicizia", "Charme su persone", true, "azione", "Suggestione", "azione"],
  ["glasya", "Glasya", 22, "Illusione minore", "Camuffare se stesso", false, "azione", "Invisibilità", "azione"],
  ["levistus", "Levistus", 22, "Raggio di gelo", "Armatura di Agathys", true, "azione", "Oscurità", "azione"],
  ["mammon", "Mammon", 22, "Mano magica", "Disco fluttuante di Tenser", false, "azione", "Serratura arcana", "azione"],
  ["mefistofele", "Mefistofele", 23, "Mano magica", "Mani brucianti", true, "azione", "Lama infuocata", "azione_bonus"],
  ["zariel", "Zariel", 23, "Taumaturgia", "Punizione incandescente", true, "azione_bonus", "Punizione marchiante", "azione_bonus"],
];

const tieflingBloodlineTraits = TIEFLING_BLOODLINES.flatMap(([id, label, page, cantrip, third, asSecond, thirdAct, fifth, fifthAct]) => [
  passive(`eredita-${id}`, `Eredità di ${label}`, `Conosci il trucchetto ${cantrip}. Dal 3° livello lanci ${third}${asSecond ? " come incantesimo di 2° livello" : ""} e dal 5° ${fifth}, una volta per riposo lungo ciascuno, con Carisma come caratteristica da incantatore.`, { option: id, page }),
  spell(`eredita-${id}-3`, `Eredità di ${label}: ${third}`, thirdAct, `eredita-${id}-3`, 3, `Lanci ${third}${asSecond ? " come incantesimo di 2° livello" : ""} senza spendere slot, con Carisma. ${ONCE_LONG}`),
  spell(`eredita-${id}-5`, `Eredità di ${label}: ${fifth}`, fifthAct, `eredita-${id}-5`, 5, `Lanci ${fifth} senza spendere slot, con Carisma. ${ONCE_LONG}`),
].map((trait) => ({ ...trait, option: id, page })));

export const SPECIES_CATALOG_VOLO = [
  {
    id: "aasimar", label: "Aasimar", book: "volo", page: 105, look: ["😇", "#fde68a", "#422006", "#fffbeb"],
    optionLabel: "Sottorazza", resistances: ["necrotic", "radiant"],
    options: [
      opt("protettore", "Aasimar protettore", ["protector", "protector aasimar"]),
      opt("flagello", "Aasimar flagello", ["scourge", "scourge aasimar"]),
      opt("caduto", "Aasimar caduto", ["fallen", "fallen aasimar"]),
    ],
    pools: [once("mani-guaritrici", "Mani guaritrici"), once("anima-radiosa", "Anima radiosa"), once("consunzione-radiosa", "Consunzione radiosa"), once("sudario-necrotico", "Sudario necrotico")],
    traits: [
      passive("resistenza-celestiale", "Resistenza celestiale", "Resistenza ai danni necrotici e radiosi, già applicata alle difese."),
      use("mani-guaritrici", "Mani guaritrici", "azione", "mani-guaritrici", `Con un'azione tocchi una creatura, che recupera punti ferita pari al tuo livello. ${ONCE_LONG}`),
      passive("portatore-di-luce", "Portatore di luce", "Conosci il trucchetto Luce, con Carisma come caratteristica da incantatore."),
      use("anima-radiosa", "Anima radiosa", "azione", "anima-radiosa", `Dal 3° livello, con un'azione, ti trasformi per 1 minuto (puoi terminare prima con un'azione bonus): ali spettrali ti danno velocità di volare 9 m e, una volta in ciascun tuo turno, un bersaglio che danneggi con un attacco o un incantesimo subisce danni radiosi extra pari al tuo livello. ${ONCE_LONG}`,
        { option: "protettore", level: 3, effect: { detail: "Volare 9 m; una volta per turno danni radiosi extra pari al livello.", rounds: MINUTE } }),
      use("consunzione-radiosa", "Consunzione radiosa", "azione", "consunzione-radiosa", `Dal 3° livello, con un'azione, per 1 minuto emani luce intensa entro 3 m e fioca per altri 3 m: alla fine di ogni tuo turno tu e ogni creatura entro 3 m subite danni radiosi pari a metà del tuo livello (arrotondato per eccesso); una volta in ciascun tuo turno, un bersaglio che danneggi con un attacco o un incantesimo subisce danni radiosi extra pari al tuo livello. Puoi terminarla con un'azione bonus. ${ONCE_LONG}`,
        { option: "flagello", level: 3, effect: { detail: "Fine turno: danni radiosi a te e a chi è entro 3 m; una volta per turno danni radiosi extra pari al livello.", rounds: MINUTE } }),
      use("sudario-necrotico", "Sudario necrotico", "azione", "sudario-necrotico", `Dal 3° livello, con un'azione, ti trasformi per 1 minuto: le altre creature entro 3 m che possono vederti superano un TS su Carisma (CD 8 + competenza + Carisma) o sono spaventate da te fino alla fine del tuo prossimo turno. Una volta in ciascun tuo turno, un bersaglio che danneggi con un attacco o un incantesimo subisce danni necrotici extra pari al tuo livello. Puoi terminarlo con un'azione bonus. ${ONCE_LONG}`,
        { option: "caduto", level: 3, effect: { detail: "Una volta per turno danni necrotici extra pari al livello.", rounds: MINUTE } }),
    ],
  },
  {
    id: "firbolg", label: "Firbolg", book: "volo", page: 107, look: ["🌲", "#86efac", "#14532d", "#f0fdf4"],
    pools: [once("individuazione", "Magia firbolg: Individuazione del magico", "breve"), once("camuffare", "Magia firbolg: Camuffare se stesso", "breve"), once("passo-nascosto", "Passo nascosto", "breve")],
    traits: [
      passive("magia-firbolg", "Magia firbolg", "Lanci Individuazione del magico e Camuffare se stesso con Saggezza, ciascuno una volta per riposo breve o lungo. Con Camuffare se stesso puoi sembrare fino a 90 cm più basso."),
      spell("magia-firbolg-individuazione", "Magia firbolg: Individuazione del magico", "azione", "individuazione", 1, `Lanci Individuazione del magico senza spendere slot, con Saggezza. ${ONCE_SHORT}`),
      spell("magia-firbolg-camuffare", "Magia firbolg: Camuffare se stesso", "azione", "camuffare", 1, `Lanci Camuffare se stesso senza spendere slot, con Saggezza; puoi sembrare fino a 90 cm più basso. ${ONCE_SHORT}`),
      use("passo-nascosto", "Passo nascosto", "azione_bonus", "passo-nascosto", `Con un'azione bonus diventi invisibile fino all'inizio del tuo prossimo turno, o finché non attacchi, tiri danni o costringi una creatura a un tiro salvezza. ${ONCE_SHORT}`),
      passive("linguaggio-delle-bestie-e-delle-foglie", "Linguaggio delle bestie e delle foglie", "Bestie e piante capiscono il senso delle tue parole, ma tu non capisci le loro. Vantaggio alle prove di Carisma per influenzarle."),
    ],
  },
  {
    id: "goliath", label: "Goliath", book: "volo", page: 109, alsoIn: ["elemental"], look: ["⛰️", "#cbd5e1", "#1e293b", "#f8fafc"],
    pools: [once("resistenza-della-pietra", "Resistenza della pietra", "breve")],
    traits: [
      use("resistenza-della-pietra", "Resistenza della pietra", "reazione", "resistenza-della-pietra", `Quando subisci danni, con una reazione tiri 1d12 + Costituzione e riduci i danni di quel totale. ${ONCE_SHORT}`),
      passive("nato-sulle-montagne", "Nato sulle montagne", "Sei acclimatato all'alta quota, anche oltre i 6.000 m, e ai climi freddi."),
    ],
  },
  {
    id: "kenku", label: "Kenku", book: "volo", page: 111, look: ["🐦‍⬛", "#a5b4fc", "#1e1b4b", "#eef2ff"],
    traits: [
      passive("contraffazione-esperta", "Contraffazione esperta", "Sai riprodurre la calligrafia e i manufatti altrui: vantaggio alle prove per produrre falsi o copie di oggetti esistenti."),
      passive("mimica", "Mimica", "Imiti suoni e voci che hai sentito. Chi ascolta capisce che è un'imitazione superando una prova di Saggezza (Intuizione) contrapposta alla tua prova di Carisma (Inganno)."),
    ],
  },
  {
    id: "lucertoloide", label: "Lucertoloide", book: "volo", page: 113, aliases: ["lizardfolk", "uomo lucertola"], look: ["🦎", "#4ade80", "#14532d", "#f0fdf4"],
    pools: [once("fauci-fameliche", "Fauci fameliche", "breve")],
    traits: [
      passive("morso", "Morso", "Arma naturale: 1d6 + Forza danni perforanti. Configurala tra gli Attacchi."),
      passive("artigiano-astuto", "Artigiano astuto", "Durante un riposo breve, da una bestia, costrutto, drago, mostruosità o vegetale ucciso di taglia Piccola o superiore ricavi uno scudo, un randello, un giavellotto o 1d4 dardi o aghi da cerbottana. Serve una lama o gli arnesi adatti."),
      passive("trattenere-il-respiro", "Trattenere il respiro", "Puoi trattenere il respiro fino a 15 minuti."),
      passive("armatura-naturale", "Armatura naturale", "Senza armatura la tua CA è 13 + Destrezza, e lo scudo si somma: va compresa nella CA del profilo."),
      use("fauci-fameliche", "Fauci fameliche", "azione_bonus", "fauci-fameliche", `In combattimento, con un'azione bonus, fai un attacco speciale con il morso: se colpisci infliggi i danni normali e ottieni punti ferita temporanei pari al modificatore di Costituzione (minimo 1). ${ONCE_SHORT}`),
    ],
  },
  {
    id: "tabaxi", label: "Tabaxi", book: "volo", page: 115, look: ["🐆", "#fbbf24", "#451a03", "#fffbeb"],
    traits: [
      passive("agilita-felina", "Agilità felina", "Quando ti muovi nel tuo turno in combattimento, puoi raddoppiare la velocità fino alla fine del turno. Per rifarlo devi prima passare un tuo turno senza muoverti."),
      passive("artigli-felini", "Artigli felini", "Velocità di scalare 6 m. Gli artigli sono un'arma naturale: 1d4 + Forza danni taglienti. Configurali tra gli Attacchi."),
    ],
  },
  {
    id: "tritone", label: "Tritone", book: "volo", page: 118, aliases: ["triton"], resistances: ["cold"], look: ["🔱", "#38bdf8", "#082f49", "#f0f9ff"],
    pools: [once("nube-di-nebbia", "Nube di nebbia"), once("folata-di-vento", "Folata di vento"), once("muro-d-acqua", "Muro d'acqua")],
    traits: [
      passive("anfibio", "Anfibio", "Respiri aria e acqua."),
      passive("controllo-di-aria-e-acqua", "Controllo di aria e acqua", "Lanci Nube di nebbia; dal 3° livello Folata di vento e dal 5° Muro d'acqua, una volta per riposo lungo ciascuno, con Carisma come caratteristica da incantatore."),
      spell("controllo-nube-di-nebbia", "Controllo di aria e acqua: Nube di nebbia", "azione", "nube-di-nebbia", 1, `Lanci Nube di nebbia senza spendere slot, con Carisma. ${ONCE_LONG}`),
      spell("controllo-folata-di-vento", "Controllo di aria e acqua: Folata di vento", "azione", "folata-di-vento", 3, `Lanci Folata di vento senza spendere slot, con Carisma. ${ONCE_LONG}`),
      spell("controllo-muro-d-acqua", "Controllo di aria e acqua: Muro d'acqua", "azione", "muro-d-acqua", 5, `Lanci Muro d'acqua senza spendere slot, con Carisma. ${ONCE_LONG}`),
      passive("emissario-del-mare", "Emissario del mare", "Comunichi idee semplici alle bestie che respirano acqua: capiscono le tue parole, tu non le loro."),
      passive("guardiano-degli-abissi", "Guardiano degli abissi", "Resistenza ai danni da freddo, già applicata alle difese. Ignori gli svantaggi degli ambienti sottomarini profondi."),
    ],
  },
  {
    id: "bugbear", label: "Bugbear", book: "volo", page: 119, look: ["🐻", "#d6a35c", "#3b2307", "#fff7ed"],
    traits: [
      passive("arti-lunghi", "Arti lunghi", "Quando attacchi in mischia nel tuo turno, la tua portata aumenta di 1,5 m."),
      passive("attacco-a-sorpresa", "Attacco a sorpresa", "Se sorprendi una creatura e la colpisci con un attacco nel tuo primo turno di combattimento, l'attacco infligge 2d6 danni extra. Una volta per combattimento."),
    ],
  },
  {
    id: "goblin", label: "Goblin", book: "volo", page: 119, look: ["👺", "#a3e635", "#1a2e05", "#f7fee7"],
    pools: [once("furia-dei-piccoli", "Furia dei piccoli", "breve")],
    traits: [
      use("furia-dei-piccoli", "Furia dei piccoli", "innesco", "furia-dei-piccoli", `Quando danneggi con un attacco o un incantesimo una creatura di taglia più grande della tua, infliggi danni extra pari al tuo livello. ${ONCE_SHORT}`),
      passive("fuga-agile", "Fuga agile", "Puoi Disimpegnarti o Nasconderti come azione bonus in ciascun tuo turno."),
    ],
  },
  {
    id: "hobgoblin", label: "Hobgoblin", book: "volo", page: 119, look: ["🛡️", "#f97316", "#431407", "#fff7ed"],
    pools: [once("salvare-la-faccia", "Salvare la faccia", "breve")],
    traits: [
      use("salvare-la-faccia", "Salvare la faccia", "innesco", "salvare-la-faccia", `Quando manchi un tiro per colpire o fallisci una prova di caratteristica o un tiro salvezza, aggiungi al tiro un bonus pari al numero di alleati entro 9 m che puoi vedere (massimo +5). ${ONCE_SHORT}`),
    ],
  },
  {
    id: "coboldo", label: "Coboldo", book: "volo", page: 119, aliases: ["kobold"], look: ["🦴", "#f87171", "#450a0a", "#fef2f2"],
    pools: [once("strisciare-piagnucolare-implorare", "Strisciare, piagnucolare e implorare", "breve")],
    traits: [
      use("strisciare-piagnucolare-implorare", "Strisciare, piagnucolare e implorare", "azione", "strisciare-piagnucolare-implorare", `Con un'azione ti umili: fino alla fine del tuo prossimo turno gli alleati hanno vantaggio ai tiri per colpire contro i nemici entro 3 m da te che possono vederti. ${ONCE_SHORT}`),
      passive("tattiche-del-branco", "Tattiche del branco", "Vantaggio al tiro per colpire contro una creatura se almeno un tuo alleato non incapacitato si trova entro 1,5 m da essa."),
      passive("sensibilita-alla-luce-del-sole", "Sensibilità alla luce del sole", SUNLIGHT),
    ],
  },
  {
    id: "orco", label: "Orco", book: "volo", page: 120, aliases: ["orc"], look: ["👹", "#84cc16", "#1a2e05", "#f7fee7"],
    traits: [
      passive("aggressivo", "Aggressivo", "Con un'azione bonus ti muovi fino alla tua velocità verso una creatura ostile che puoi vedere."),
    ],
  },
  {
    id: "yuan-ti", label: "Yuan-ti purosangue", book: "volo", page: 120, aliases: ["yuan ti", "yuan ti pureblood", "yuan ti purosangue"], immunities: ["poison"], look: ["🐍", "#34d399", "#022c22", "#ecfdf5"],
    pools: [once("suggestione", "Incantesimi innati: Suggestione")],
    traits: [
      passive("incantesimi-innati", "Incantesimi innati", "Conosci il trucchetto Spruzzo velenoso. Lanci Amicizia con gli animali a volontà, ma solo sui serpenti; dal 3° livello Suggestione una volta per riposo lungo. Caratteristica da incantatore: Carisma."),
      spell("incantesimi-innati-suggestione", "Incantesimi innati: Suggestione", "azione", "suggestione", 3, `Lanci Suggestione senza spendere slot, con Carisma. ${ONCE_LONG}`),
      passive("resistenza-alla-magia", "Resistenza alla magia", "Vantaggio ai tiri salvezza contro incantesimi e altri effetti magici."),
      passive("immunita-al-veleno", "Immunità al veleno", "Immune ai danni da veleno (già applicato alle difese) e alla condizione avvelenato."),
    ],
  },
];

export const SPECIES_CATALOG_TOMO = [
  {
    id: "tiefling-stirpe", label: "Tiefling", book: "tomo", page: 21, look: ["😈", "#fb7185", "#4c0519", "#fff1f2"],
    optionLabel: "Stirpe", resistances: ["fire"], aliases: ["tiefling stirpe"],
    options: TIEFLING_BLOODLINES.map(([id, label]) => opt(id, `Tiefling di ${label}`, [label, `${label} tiefling`])),
    pools: TIEFLING_BLOODLINES.flatMap(([id, label, , , third, , , fifth]) => [once(`eredita-${id}-3`, `Eredità di ${label}: ${third}`), once(`eredita-${id}-5`, `Eredità di ${label}: ${fifth}`)]),
    traits: [
      passive("resistenza-infernale", "Resistenza infernale", "Resistenza ai danni da fuoco, già applicata alle difese."),
      ...tieflingBloodlineTraits,
    ],
  },
  {
    id: "eladrin", label: "Eladrin", book: "tomo", page: 61, look: ["🍂", "#f59e0b", "#422006", "#fffbeb"],
    pools: [once("passo-fatato", "Passo fatato", "breve")],
    traits: [
      passive("ascendenza-fatata", "Ascendenza fatata", FEY_ANCESTRY),
      use("passo-fatato", "Passo fatato", "azione_bonus", "passo-fatato", `Con un'azione bonus ti teletrasporti fino a 9 m in uno spazio libero che puoi vedere. ${ONCE_SHORT}`),
    ],
  },
  {
    id: "elfo-marino", label: "Elfo marino", book: "tomo", page: 62, aliases: ["sea elf"], look: ["🌊", "#22d3ee", "#083344", "#ecfeff"],
    traits: [
      passive("ascendenza-fatata", "Ascendenza fatata", FEY_ANCESTRY),
      passive("figlio-del-mare", "Figlio del mare", "Velocità di nuotare 9 m; respiri aria e acqua."),
      passive("amico-del-mare", "Amico del mare", "Comunichi idee semplici con qualsiasi bestia che abbia una velocità di nuotare."),
    ],
  },
  {
    id: "shadar-kai", label: "Shadar-kai", book: "tomo", page: 62, resistances: ["necrotic"], look: ["🪶", "#94a3b8", "#020617", "#f8fafc"],
    pools: [once("benedizione-della-regina-corvo", "Benedizione della Regina Corvo")],
    traits: [
      passive("ascendenza-fatata", "Ascendenza fatata", FEY_ANCESTRY),
      passive("resistenza-necrotica", "Resistenza necrotica", "Resistenza ai danni necrotici, già applicata alle difese."),
      use("benedizione-della-regina-corvo", "Benedizione della Regina Corvo", "azione_bonus", "benedizione-della-regina-corvo", `Con un'azione bonus ti teletrasporti fino a 9 m in uno spazio libero che puoi vedere. Dal 3° livello, dopo il teletrasporto, hai resistenza a tutti i danni fino all'inizio del tuo prossimo turno. ${ONCE_LONG}`),
    ],
  },
  {
    id: "duergar", label: "Duergar", book: "tomo", page: 81, alsoIn: ["costa"], resistances: ["poison"], aliases: ["grey dwarf", "gray dwarf", "nano grigio"], look: ["⚒️", "#a8a29e", "#1c1917", "#fafaf9"],
    pools: [once("ingrandire", "Magia duergar: Ingrandire/ridurre"), once("invisibilita", "Magia duergar: Invisibilità")],
    traits: [
      passive("resilienza-nanica", "Resilienza nanica", "Tratto del nano (Manuale del Giocatore p. 20): vantaggio ai tiri salvezza contro il veleno; la resistenza ai danni da veleno è già applicata alle difese."),
      passive("resilienza-duergar", "Resilienza duergar", "Vantaggio ai tiri salvezza contro le illusioni e per non essere affascinato o paralizzato."),
      passive("magia-duergar", "Magia duergar", "Dal 3° livello lanci su te stesso Ingrandire/ridurre (solo ingrandire) e dal 5° Invisibilità, una volta per riposo lungo ciascuno, senza componenti materiali e con Intelligenza. Non puoi lanciarli alla luce diretta del sole."),
      spell("magia-duergar-ingrandire", "Magia duergar: Ingrandire", "azione", "ingrandire", 3, `Lanci Ingrandire/ridurre su te stesso, solo per ingrandirti, senza spendere slot né componenti materiali, con Intelligenza. Non alla luce diretta del sole. ${ONCE_LONG}`),
      spell("magia-duergar-invisibilita", "Magia duergar: Invisibilità", "azione", "invisibilita", 5, `Lanci Invisibilità su te stesso senza spendere slot né componenti materiali, con Intelligenza. Non alla luce diretta del sole. ${ONCE_LONG}`),
      passive("sensibilita-alla-luce-del-sole", "Sensibilità alla luce del sole", SUNLIGHT),
    ],
  },
  {
    id: "githyanki", label: "Githyanki", book: "tomo", page: 96, look: ["⚔️", "#facc15", "#422006", "#fefce8"],
    pools: [once("saltare", "Psionica githyanki: Saltare"), once("passo-velato", "Psionica githyanki: Passo velato")],
    traits: [
      passive("psionica-githyanki", "Psionica githyanki", "Conosci il trucchetto Mano magica, e la mano è invisibile. Dal 3° livello lanci Saltare e dal 5° Passo velato, una volta per riposo lungo ciascuno, senza componenti e con Intelligenza."),
      spell("psionica-githyanki-saltare", "Psionica githyanki: Saltare", "azione", "saltare", 3, `Lanci Saltare senza spendere slot né componenti, con Intelligenza. ${ONCE_LONG}`),
      spell("psionica-githyanki-passo-velato", "Psionica githyanki: Passo velato", "azione_bonus", "passo-velato", 5, `Lanci Passo velato senza spendere slot né componenti, con Intelligenza. ${ONCE_LONG}`),
    ],
  },
  {
    id: "githzerai", label: "Githzerai", book: "tomo", page: 96, look: ["🧘", "#c4b5fd", "#2e1065", "#f5f3ff"],
    pools: [once("scudo", "Psionica githzerai: Scudo"), once("individuazione-dei-pensieri", "Psionica githzerai: Individuazione dei pensieri")],
    traits: [
      passive("disciplina-mentale", "Disciplina mentale", "Vantaggio ai tiri salvezza per non essere affascinato o spaventato."),
      passive("psionica-githzerai", "Psionica githzerai", "Conosci il trucchetto Mano magica, e la mano è invisibile. Dal 3° livello lanci Scudo e dal 5° Individuazione dei pensieri, una volta per riposo lungo ciascuno, senza componenti e con Saggezza."),
      spell("psionica-githzerai-scudo", "Psionica githzerai: Scudo", "reazione", "scudo", 3, `Lanci Scudo senza spendere slot né componenti, con Saggezza. ${ONCE_LONG}`),
      spell("psionica-githzerai-individuazione-dei-pensieri", "Psionica githzerai: Individuazione dei pensieri", "azione", "individuazione-dei-pensieri", 5, `Lanci Individuazione dei pensieri senza spendere slot né componenti, con Saggezza. ${ONCE_LONG}`),
    ],
  },
  {
    id: "gnomo-profondita", label: "Gnomo delle profondità", book: "tomo", page: 113, alsoIn: ["elemental", "costa"], aliases: ["deep gnome", "svirfneblin"], look: ["💎", "#7dd3fc", "#0c4a6e", "#f0f9ff"],
    traits: [
      passive("astuzia-gnomesca", "Astuzia gnomesca", "Tratto dello gnomo (Manuale del Giocatore p. 37): vantaggio a tutti i tiri salvezza di Intelligenza, Saggezza e Carisma contro la magia."),
      passive("mimetismo-della-pietra", "Mimetismo della pietra", "Vantaggio alle prove di Destrezza (Furtività) per nasconderti in terreno roccioso."),
    ],
  },
];

export const SPECIES_CATALOG_MULTIVERSO = [
  {
    id: "aasimar-multiverso", label: "Aasimar", book: "multiverso", page: 7, resistances: ["necrotic", "radiant"], look: ["😇", "#fde68a", "#422006", "#fffbeb"],
    pools: [once("mani-guaritrici", "Mani guaritrici"), once("rivelazione-celestiale", "Rivelazione celestiale")],
    traits: [
      passive("resistenza-celestiale", "Resistenza celestiale", "Resistenza ai danni necrotici e radiosi, già applicata alle difese."),
      use("mani-guaritrici", "Mani guaritrici", "azione", "mani-guaritrici", `Con un'azione tocchi una creatura, che recupera tanti d4 punti ferita quanto il tuo bonus di competenza. ${ONCE_LONG}`),
      passive("portatore-di-luce", "Portatore di luce", "Conosci il trucchetto Luce, con Carisma come caratteristica da incantatore."),
      use("rivelazione-celestiale-ali", "Rivelazione celestiale: Ali celestiali", "azione_bonus", "rivelazione-celestiale", `Dal 3° livello, con un'azione bonus, ti trasformi per 1 minuto: ali spettrali ti danno una velocità di volare pari alla velocità camminando. Una volta in ciascun tuo turno, un bersaglio che danneggi con un attacco o un incantesimo subisce danni radiosi extra pari al bonus di competenza. Una Rivelazione celestiale per riposo lungo.`,
        { level: 3, effect: { detail: "Volare pari alla velocità camminando; una volta per turno danni radiosi extra pari al bonus di competenza.", rounds: MINUTE } }),
      use("rivelazione-celestiale-radiosita", "Rivelazione celestiale: Radiosità interiore", "azione_bonus", "rivelazione-celestiale", `Dal 3° livello, con un'azione bonus, ti trasformi per 1 minuto: emani luce intensa entro 3 m e fioca per altri 3 m, e alla fine di ogni tuo turno ogni creatura entro 3 m subisce danni radiosi pari al bonus di competenza. Una volta in ciascun tuo turno, un bersaglio che danneggi con un attacco o un incantesimo subisce danni radiosi extra pari al bonus di competenza. Una Rivelazione celestiale per riposo lungo.`,
        { level: 3, effect: { detail: "Fine turno: danni radiosi a chi è entro 3 m; una volta per turno danni radiosi extra pari al bonus di competenza.", rounds: MINUTE } }),
      use("rivelazione-celestiale-sudario", "Rivelazione celestiale: Sudario necrotico", "azione_bonus", "rivelazione-celestiale", `Dal 3° livello, con un'azione bonus, ti trasformi per 1 minuto: le altre creature entro 3 m che possono vederti superano un TS su Carisma (CD 8 + competenza + Carisma) o sono spaventate da te fino alla fine del tuo prossimo turno. Una volta in ciascun tuo turno, un bersaglio che danneggi con un attacco o un incantesimo subisce danni necrotici extra pari al bonus di competenza. Una Rivelazione celestiale per riposo lungo.`,
        { level: 3, effect: { detail: "Una volta per turno danni necrotici extra pari al bonus di competenza.", rounds: MINUTE } }),
    ],
  },
  {
    id: "bugbear-multiverso", label: "Bugbear", book: "multiverso", page: 8, look: ["🐻", "#d6a35c", "#3b2307", "#fff7ed"],
    traits: [
      passive("ascendenza-fatata", "Ascendenza fatata", FEY_ANCESTRY_MM),
      passive("arti-lunghi", "Arti lunghi", "Quando attacchi in mischia nel tuo turno, la tua portata aumenta di 1,5 m."),
      passive("attacco-a-sorpresa", "Attacco a sorpresa", "Se colpisci con un tiro per colpire una creatura che non ha ancora svolto un turno in questo combattimento, infliggi 2d6 danni extra."),
    ],
  },
  {
    id: "duergar-multiverso", label: "Duergar", book: "multiverso", page: 12, resistances: ["poison"], aliases: ["grey dwarf", "gray dwarf", "nano grigio"], look: ["⚒️", "#a8a29e", "#1c1917", "#fafaf9"],
    pools: [once("ingrandire", "Magia duergar: Ingrandire/ridurre"), once("invisibilita", "Magia duergar: Invisibilità")],
    traits: [
      passive("magia-duergar", "Magia duergar", `Dal 3° livello lanci su te stesso Ingrandire/ridurre e dal 5° Invisibilità, una volta per riposo lungo ciascuno senza componenti materiali (puoi lanciarli anche con gli slot); ${MM_ABILITY}.`),
      spell("magia-duergar-ingrandire", "Magia duergar: Ingrandire/ridurre", "azione", "ingrandire", 3, `Lanci Ingrandire/ridurre su te stesso senza spendere slot né componenti materiali. ${ONCE_LONG}`),
      spell("magia-duergar-invisibilita", "Magia duergar: Invisibilità", "azione", "invisibilita", 5, `Lanci Invisibilità su te stesso senza spendere slot né componenti materiali. ${ONCE_LONG}`),
      passive("resilienza-nanica", "Resilienza nanica", "Vantaggio ai tiri salvezza per evitare o terminare la condizione avvelenato; la resistenza ai danni da veleno è già applicata alle difese."),
      passive("fortezza-psionica", "Fortezza psionica", "Vantaggio ai tiri salvezza per evitare o terminare le condizioni affascinato e stordito."),
    ],
  },
  {
    id: "eladrin-multiverso", label: "Eladrin", book: "multiverso", page: 13, look: ["🍂", "#f59e0b", "#422006", "#fffbeb"],
    optionLabel: "Stagione",
    options: [opt("autunno", "Eladrin d'autunno", ["autumn"]), opt("inverno", "Eladrin d'inverno", ["winter"]), opt("primavera", "Eladrin di primavera", ["spring"]), opt("estate", "Eladrin d'estate", ["summer"])],
    pools: [perPb("passo-fatato", "Passo fatato")],
    traits: [
      passive("ascendenza-fatata", "Ascendenza fatata", FEY_ANCESTRY_MM),
      use("passo-fatato", "Passo fatato", "azione_bonus", "passo-fatato", `Con un'azione bonus ti teletrasporti fino a 9 m in uno spazio libero che puoi vedere. ${PB_LONG} Dal 3° livello aggiunge l'effetto della stagione, con CD 8 + competenza + Intelligenza, Saggezza o Carisma. La stagione cambia alla fine di un riposo lungo (Trance): aggiornala nel profilo.`),
      passive("passo-fatato-autunno", "Passo fatato d'autunno", "Dal 3° livello, subito dopo il Passo fatato, fino a due creature che puoi vedere entro 3 m superano un TS su Saggezza o sono affascinate da te per 1 minuto, o finché tu o i tuoi compagni non le danneggiate.", { option: "autunno", level: 3 }),
      passive("passo-fatato-inverno", "Passo fatato d'inverno", "Dal 3° livello, prima del Passo fatato, una creatura che puoi vedere entro 1,5 m supera un TS su Saggezza o è spaventata da te fino alla fine del tuo prossimo turno.", { option: "inverno", level: 3 }),
      passive("passo-fatato-primavera", "Passo fatato di primavera", "Dal 3° livello, quando usi il Passo fatato, puoi toccare una creatura consenziente entro 1,5 m: si teletrasporta lei al posto tuo, in uno spazio libero entro 9 m da te che puoi vedere.", { option: "primavera", level: 3 }),
      passive("passo-fatato-estate", "Passo fatato d'estate", "Dal 3° livello, subito dopo il Passo fatato, ogni creatura a tua scelta che puoi vedere entro 1,5 m subisce danni da fuoco pari al bonus di competenza.", { option: "estate", level: 3 }),
    ],
  },
  {
    id: "elfo-marino-multiverso", label: "Elfo marino", book: "multiverso", page: 30, aliases: ["sea elf"], look: ["🌊", "#22d3ee", "#083344", "#ecfeff"],
    traits: [
      passive("ascendenza-fatata", "Ascendenza fatata", FEY_ANCESTRY_MM),
      passive("figlio-del-mare", "Figlio del mare", "Velocità di nuotare pari alla velocità camminando; respiri aria e acqua."),
      passive("amico-del-mare", "Amico del mare", "Comunichi idee semplici con qualsiasi bestia che abbia una velocità di nuotare."),
    ],
  },
  {
    id: "firbolg-multiverso", label: "Firbolg", book: "multiverso", page: 15, look: ["🌲", "#86efac", "#14532d", "#f0fdf4"],
    pools: [once("individuazione", "Magia firbolg: Individuazione del magico"), once("camuffare", "Magia firbolg: Camuffare se stesso"), perPb("passo-nascosto", "Passo nascosto")],
    traits: [
      passive("magia-firbolg", "Magia firbolg", `Lanci Individuazione del magico e Camuffare se stesso, una volta per riposo lungo ciascuno (puoi lanciarli anche con gli slot); ${MM_ABILITY}. Con Camuffare se stesso puoi sembrare fino a 90 cm più basso.`),
      spell("magia-firbolg-individuazione", "Magia firbolg: Individuazione del magico", "azione", "individuazione", 1, `Lanci Individuazione del magico senza spendere slot. ${ONCE_LONG}`),
      spell("magia-firbolg-camuffare", "Magia firbolg: Camuffare se stesso", "azione", "camuffare", 1, `Lanci Camuffare se stesso senza spendere slot; puoi sembrare fino a 90 cm più basso. ${ONCE_LONG}`),
      use("passo-nascosto", "Passo nascosto", "azione_bonus", "passo-nascosto", `Con un'azione bonus diventi invisibile fino all'inizio del tuo prossimo turno, o finché non attacchi, tiri danni o costringi una creatura a un tiro salvezza. ${PB_LONG}`),
      passive("linguaggio-delle-bestie-e-delle-foglie", "Linguaggio delle bestie e delle foglie", "Bestie e piante capiscono il senso delle tue parole, ma tu non capisci le loro. Vantaggio alle prove di Carisma per influenzarle."),
    ],
  },
  {
    id: "githyanki-multiverso", label: "Githyanki", book: "multiverso", page: 18, resistances: ["psychic"], look: ["⚔️", "#facc15", "#422006", "#fefce8"],
    pools: [once("saltare", "Psionica githyanki: Saltare"), once("passo-velato", "Psionica githyanki: Passo velato")],
    traits: [
      passive("psionica-githyanki", "Psionica githyanki", `Conosci il trucchetto Mano magica, e la mano è invisibile. Dal 3° livello lanci Saltare e dal 5° Passo velato, una volta per riposo lungo ciascuno senza componenti (puoi lanciarli anche con gli slot); ${MM_ABILITY}.`),
      spell("psionica-githyanki-saltare", "Psionica githyanki: Saltare", "azione", "saltare", 3, `Lanci Saltare senza spendere slot né componenti. ${ONCE_LONG}`),
      spell("psionica-githyanki-passo-velato", "Psionica githyanki: Passo velato", "azione_bonus", "passo-velato", 5, `Lanci Passo velato senza spendere slot né componenti. ${ONCE_LONG}`),
      passive("resilienza-psichica", "Resilienza psichica", "Resistenza ai danni psichici, già applicata alle difese."),
    ],
  },
  {
    id: "githzerai-multiverso", label: "Githzerai", book: "multiverso", page: 19, resistances: ["psychic"], look: ["🧘", "#c4b5fd", "#2e1065", "#f5f3ff"],
    pools: [once("scudo", "Psionica githzerai: Scudo"), once("individuazione-dei-pensieri", "Psionica githzerai: Individuazione dei pensieri")],
    traits: [
      passive("disciplina-mentale", "Disciplina mentale", "Vantaggio ai tiri salvezza per evitare o terminare le condizioni affascinato e spaventato."),
      passive("psionica-githzerai", "Psionica githzerai", `Conosci il trucchetto Mano magica, e la mano è invisibile. Dal 3° livello lanci Scudo e dal 5° Individuazione dei pensieri, una volta per riposo lungo ciascuno senza componenti (puoi lanciarli anche con gli slot); ${MM_ABILITY}.`),
      spell("psionica-githzerai-scudo", "Psionica githzerai: Scudo", "reazione", "scudo", 3, `Lanci Scudo senza spendere slot né componenti. ${ONCE_LONG}`),
      spell("psionica-githzerai-individuazione-dei-pensieri", "Psionica githzerai: Individuazione dei pensieri", "azione", "individuazione-dei-pensieri", 5, `Lanci Individuazione dei pensieri senza spendere slot né componenti. ${ONCE_LONG}`),
      passive("resilienza-psichica", "Resilienza psichica", "Resistenza ai danni psichici, già applicata alle difese."),
    ],
  },
  {
    id: "gnomo-profondita-multiverso", label: "Gnomo delle profondità", book: "multiverso", page: 11, aliases: ["deep gnome", "svirfneblin"], look: ["💎", "#7dd3fc", "#0c4a6e", "#f0f9ff"],
    pools: [once("camuffare", "Dono degli svirfneblin: Camuffare se stesso"), once("anti-individuazione", "Dono degli svirfneblin: Anti-individuazione"), perPb("mimetismo", "Mimetismo svirfneblin")],
    traits: [
      passive("dono-degli-svirfneblin", "Dono degli svirfneblin", `Dal 3° livello lanci Camuffare se stesso e dal 5° Anti-individuazione, una volta per riposo lungo ciascuno senza componenti materiali (puoi lanciarli anche con gli slot); ${MM_ABILITY}.`),
      spell("dono-degli-svirfneblin-camuffare", "Dono degli svirfneblin: Camuffare se stesso", "azione", "camuffare", 3, `Lanci Camuffare se stesso senza spendere slot né componenti materiali. ${ONCE_LONG}`),
      spell("dono-degli-svirfneblin-anti-individuazione", "Dono degli svirfneblin: Anti-individuazione", "azione", "anti-individuazione", 5, `Lanci Anti-individuazione senza spendere slot né componenti materiali. ${ONCE_LONG}`),
      passive("resistenza-alla-magia-gnomesca", "Resistenza alla magia gnomesca", "Vantaggio ai tiri salvezza di Intelligenza, Saggezza e Carisma contro gli incantesimi."),
      use("mimetismo-svirfneblin", "Mimetismo svirfneblin", "innesco", "mimetismo", `Quando fai una prova di Destrezza (Furtività) puoi farla con vantaggio. ${PB_LONG}`),
    ],
  },
  {
    id: "goblin-multiverso", label: "Goblin", book: "multiverso", page: 20, look: ["👺", "#a3e635", "#1a2e05", "#f7fee7"],
    pools: [perPb("furia-dei-piccoli", "Furia dei piccoli")],
    traits: [
      passive("ascendenza-fatata", "Ascendenza fatata", FEY_ANCESTRY_MM),
      use("furia-dei-piccoli", "Furia dei piccoli", "innesco", "furia-dei-piccoli", `Quando danneggi con un attacco o un incantesimo una creatura di taglia più grande della tua, infliggi danni extra pari al bonus di competenza, al massimo una volta per turno. ${PB_LONG}`),
      passive("fuga-agile", "Fuga agile", "Puoi Disimpegnarti o Nasconderti come azione bonus in ciascun tuo turno."),
    ],
  },
  {
    id: "goliath-multiverso", label: "Goliath", book: "multiverso", page: 21, resistances: ["cold"], look: ["⛰️", "#cbd5e1", "#1e293b", "#f8fafc"],
    pools: [perPb("resistenza-della-pietra", "Resistenza della pietra")],
    traits: [
      passive("nato-sulle-montagne", "Nato sulle montagne", "Resistenza ai danni da freddo, già applicata alle difese; sei acclimatato all'alta quota."),
      use("resistenza-della-pietra", "Resistenza della pietra", "reazione", "resistenza-della-pietra", `Quando subisci danni, con una reazione tiri 1d12 + Costituzione e riduci i danni di quel totale. ${PB_LONG}`),
    ],
  },
  {
    id: "hobgoblin-multiverso", label: "Hobgoblin", book: "multiverso", page: 23, look: ["🛡️", "#f97316", "#431407", "#fff7ed"],
    pools: [perPb("dono-fatato", "Dono fatato"), perPb("fortuna-dei-molti", "Fortuna dei molti")],
    traits: [
      passive("ascendenza-fatata", "Ascendenza fatata", FEY_ANCESTRY_MM),
      use("dono-fatato", "Dono fatato", "azione_bonus", "dono-fatato", `Con un'azione bonus compi l'azione Aiutare. ${PB_LONG} Dal 3° livello scegli ogni volta un beneficio: Ospitalità (tu e la creatura aiutata ottenete 1d6 + bonus di competenza punti ferita temporanei), Passaggio (tu e la creatura aiutata avete +3 m alla velocità camminando fino all'inizio del tuo prossimo turno) o Dispetto (fino all'inizio del tuo prossimo turno, la prima volta che la creatura aiutata colpisce un bersaglio con un tiro per colpire, quel bersaglio ha svantaggio al suo prossimo tiro per colpire entro 1 minuto).`),
      use("fortuna-dei-molti", "Fortuna dei molti", "innesco", "fortuna-dei-molti", `Quando manchi un tiro per colpire o fallisci una prova di caratteristica o un tiro salvezza, aggiungi al tiro un bonus pari al numero di alleati entro 9 m che puoi vedere (massimo +3). ${PB_LONG}`),
    ],
  },
  {
    id: "kenku-multiverso", label: "Kenku", book: "multiverso", page: 24, look: ["🐦‍⬛", "#a5b4fc", "#1e1b4b", "#eef2ff"],
    pools: [perPb("memoria-kenku", "Memoria kenku")],
    traits: [
      passive("duplicazione-esperta", "Duplicazione esperta", "Quando copi una scrittura o un manufatto, tuo o altrui, hai vantaggio alle prove per produrne un duplicato esatto."),
      use("memoria-kenku", "Memoria kenku", "innesco", "memoria-kenku", `Prima di tirare, ti dai vantaggio a una prova di caratteristica che usa un'abilità in cui hai competenza. ${PB_LONG}`),
      passive("mimica", "Mimica", "Imiti suoni e voci che hai sentito. Chi ascolta capisce che è un'imitazione superando una prova di Saggezza (Intuizione) contrapposta alla tua prova di Carisma (Inganno)."),
    ],
  },
  {
    id: "coboldo-multiverso", label: "Coboldo", book: "multiverso", page: 25, aliases: ["kobold"], look: ["🦴", "#f87171", "#450a0a", "#fef2f2"],
    optionLabel: "Retaggio",
    options: [opt("astuzia", "Retaggio dell'astuzia", ["craftiness"]), opt("sfida", "Retaggio della sfida", ["defiance"]), opt("stregoneria", "Retaggio della stregoneria draconica", ["draconic sorcery"])],
    pools: [perPb("grido-draconico", "Grido draconico")],
    traits: [
      use("grido-draconico", "Grido draconico", "azione_bonus", "grido-draconico", `Con un'azione bonus lanci un grido ai nemici entro 3 m: fino all'inizio del tuo prossimo turno tu e i tuoi alleati avete vantaggio ai tiri per colpire contro quelli che possono sentirti. ${PB_LONG}`),
      passive("retaggio-sfida", "Retaggio coboldo: Sfida", "Vantaggio ai tiri salvezza per evitare o terminare la condizione spaventato.", { option: "sfida" }),
      passive("retaggio-stregoneria", "Retaggio coboldo: Stregoneria draconica", `Conosci un trucchetto a scelta dalla lista dello stregone; ${MM_ABILITY}. Aggiungilo al libro degli incantesimi.`, { option: "stregoneria" }),
    ],
  },
  {
    id: "lucertoloide-multiverso", label: "Lucertoloide", book: "multiverso", page: 26, aliases: ["lizardfolk", "uomo lucertola"], look: ["🦎", "#4ade80", "#14532d", "#f0fdf4"],
    pools: [perPb("fauci-fameliche", "Fauci fameliche")],
    traits: [
      passive("morso", "Morso", "Arma naturale: 1d6 + Forza danni taglienti. Configurala tra gli Attacchi."),
      passive("trattenere-il-respiro", "Trattenere il respiro", "Puoi trattenere il respiro fino a 15 minuti."),
      passive("armatura-naturale", "Armatura naturale", "Senza armatura la tua CA è 13 + Destrezza, e lo scudo si somma: va compresa nella CA del profilo."),
      use("fauci-fameliche", "Fauci fameliche", "azione_bonus", "fauci-fameliche", `Con un'azione bonus fai un attacco speciale con il morso: se colpisci infliggi i danni normali e ottieni punti ferita temporanei pari al bonus di competenza. ${PB_LONG}`),
    ],
  },
  {
    id: "orco-multiverso", label: "Orco", book: "multiverso", page: 28, aliases: ["orc"], look: ["👹", "#84cc16", "#1a2e05", "#f7fee7"],
    pools: [perPb("scarica-di-adrenalina", "Scarica di adrenalina", "breve"), once("tenacia-implacabile", "Tenacia implacabile")],
    traits: [
      use("scarica-di-adrenalina", "Scarica di adrenalina", "azione_bonus", "scarica-di-adrenalina", "Con un'azione bonus compi l'azione Scattare e ottieni punti ferita temporanei pari al bonus di competenza. Usi pari al bonus di competenza per riposo breve o lungo."),
      use("tenacia-implacabile", "Tenacia implacabile", "innesco", "tenacia-implacabile", `Quando scendi a 0 punti ferita ma non vieni ucciso sul colpo, puoi scendere invece a 1 punto ferita. ${ONCE_LONG} Riporta i PF a 1 e spendi l'uso.`),
    ],
  },
  {
    id: "shadar-kai-multiverso", label: "Shadar-kai", book: "multiverso", page: 31, resistances: ["necrotic"], look: ["🪶", "#94a3b8", "#020617", "#f8fafc"],
    pools: [perPb("benedizione-della-regina-corvo", "Benedizione della Regina Corvo")],
    traits: [
      passive("ascendenza-fatata", "Ascendenza fatata", FEY_ANCESTRY_MM),
      passive("resistenza-necrotica", "Resistenza necrotica", "Resistenza ai danni necrotici, già applicata alle difese."),
      use("benedizione-della-regina-corvo", "Benedizione della Regina Corvo", "azione_bonus", "benedizione-della-regina-corvo", `Con un'azione bonus ti teletrasporti fino a 9 m in uno spazio libero che puoi vedere. ${PB_LONG} Dal 3° livello, dopo il teletrasporto, hai resistenza a tutti i danni fino all'inizio del tuo prossimo turno.`),
    ],
  },
  {
    id: "tabaxi-multiverso", label: "Tabaxi", book: "multiverso", page: 33, look: ["🐆", "#fbbf24", "#451a03", "#fffbeb"],
    traits: [
      passive("artigli-felini", "Artigli felini", "Velocità di scalare pari alla velocità camminando. Gli artigli sono un'arma naturale: 1d6 + Forza danni taglienti. Configurali tra gli Attacchi."),
      passive("agilita-felina", "Agilità felina", "Quando ti muovi nel tuo turno in combattimento, puoi raddoppiare la velocità fino alla fine del turno. Per rifarlo devi prima passare un tuo turno senza muoverti."),
    ],
  },
  {
    id: "tritone-multiverso", label: "Tritone", book: "multiverso", page: 35, aliases: ["triton"], resistances: ["cold"], look: ["🔱", "#38bdf8", "#082f49", "#f0f9ff"],
    pools: [once("nube-di-nebbia", "Nube di nebbia"), once("folata-di-vento", "Folata di vento"), once("camminare-sull-acqua", "Camminare sull'acqua")],
    traits: [
      passive("anfibio", "Anfibio", "Respiri aria e acqua."),
      passive("controllo-di-aria-e-acqua", "Controllo di aria e acqua", `Lanci Nube di nebbia; dal 3° livello Folata di vento e dal 5° Camminare sull'acqua, una volta per riposo lungo ciascuno (puoi lanciarli anche con gli slot); ${MM_ABILITY}.`),
      spell("controllo-nube-di-nebbia", "Controllo di aria e acqua: Nube di nebbia", "azione", "nube-di-nebbia", 1, `Lanci Nube di nebbia senza spendere slot. ${ONCE_LONG}`),
      spell("controllo-folata-di-vento", "Controllo di aria e acqua: Folata di vento", "azione", "folata-di-vento", 3, `Lanci Folata di vento senza spendere slot. ${ONCE_LONG}`),
      spell("controllo-camminare-sull-acqua", "Controllo di aria e acqua: Camminare sull'acqua", "azione", "camminare-sull-acqua", 5, `Lanci Camminare sull'acqua senza spendere slot. ${ONCE_LONG}`),
      passive("emissario-del-mare", "Emissario del mare", "Comunichi idee semplici a bestie, elementali e mostruosità che hanno una velocità di nuotare: capiscono le tue parole, tu non le loro."),
      passive("guardiano-degli-abissi", "Guardiano degli abissi", "Resistenza ai danni da freddo, già applicata alle difese."),
    ],
  },
  {
    id: "yuan-ti-multiverso", label: "Yuan-ti", book: "multiverso", page: 36, resistances: ["poison"], aliases: ["yuan ti"], look: ["🐍", "#34d399", "#022c22", "#ecfdf5"],
    pools: [once("suggestione", "Incantesimi serpentini: Suggestione")],
    traits: [
      passive("resistenza-alla-magia", "Resistenza alla magia", "Vantaggio ai tiri salvezza contro gli incantesimi."),
      passive("resilienza-al-veleno", "Resilienza al veleno", "Vantaggio ai tiri salvezza per evitare o terminare la condizione avvelenato; la resistenza ai danni da veleno è già applicata alle difese."),
      passive("incantesimi-serpentini", "Incantesimi serpentini", `Conosci il trucchetto Spruzzo velenoso. Lanci Amicizia con gli animali a volontà, ma solo sui serpenti; dal 3° livello Suggestione una volta per riposo lungo (puoi lanciarlo anche con gli slot); ${MM_ABILITY}.`),
      spell("incantesimi-serpentini-suggestione", "Incantesimi serpentini: Suggestione", "azione", "suggestione", 3, `Lanci Suggestione senza spendere slot. ${ONCE_LONG}`),
    ],
  },
];
