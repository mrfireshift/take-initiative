// Species catalog, tranche 9: Spelljammer: Astral Adventurer's Guide and Dragonlance: Shadow of the Dragon
// Queen. Same declarative shape as speciesCatalogVoloMordenkainen.js. Both books came after Mostri del
// Multiverso and use its design (uses equal to the proficiency bonus, a spellcasting ability of choice):
// no reprint.

import { FEY_ANCESTRY_MM, MM_ABILITY, ONCE_LONG, PB_LONG, once, passive, perPb, use } from "./speciesCatalogVoloMordenkainen.js";

const type = (name) => passive("tipo-di-creatura", "Tipo di creatura", `Il tuo tipo di creatura è ${name}, non umanoide.`);
const CARAPACE = (key, name) => passive(key, name, "Senza armatura la tua CA è 13 + Destrezza, e lo scudo si somma: va compresa nella CA del profilo.");

export const SPECIES_CATALOG_SPELLJAMMER = [
  {
    id: "elfo-astrale", label: "Elfo astrale", book: "spelljammer", page: 10, aliases: ["astral elf"], look: ["✨", "#c4b5fd", "#1e1b4b", "#f5f3ff"],
    pools: [perPb("passo-di-luce-stellare", "Passo di luce stellare")],
    traits: [
      passive("ascendenza-fatata", "Ascendenza fatata", FEY_ANCESTRY_MM),
      passive("fuoco-astrale", "Fuoco astrale", `Conosci un trucchetto a scelta tra Luci danzanti, Luce e Fiamma sacra; ${MM_ABILITY}. Aggiungilo al libro degli incantesimi.`),
      use("passo-di-luce-stellare", "Passo di luce stellare", "azione_bonus", "passo-di-luce-stellare", `Con un'azione bonus ti teletrasporti fino a 9 m in uno spazio libero che puoi vedere. ${PB_LONG}`),
    ],
  },
  {
    id: "autognomo", label: "Autognomo", book: "spelljammer", page: 11, resistances: ["poison"], aliases: ["autognome"], look: ["⚙️", "#94a3b8", "#0f172a", "#f8fafc"],
    pools: [perPb("costruito-per-il-successo", "Costruito per il successo")],
    traits: [
      type("costrutto"),
      CARAPACE("involucro-corazzato", "Involucro corazzato"),
      use("costruito-per-il-successo", "Costruito per il successo", "innesco", "costruito-per-il-successo", `Dopo aver visto il d20 di un tiro per colpire, una prova di caratteristica o un tiro salvezza, ma prima dell'esito, tiri un d4 e lo aggiungi. ${PB_LONG}`),
      passive("macchina-curativa", "Macchina curativa", "Se qualcuno lancia Riparare su di te, puoi spendere un Dado Vita e recuperare i punti ferita tirati. Cura ferite, Parola guaritrice, le loro versioni di massa e Salvare i morenti funzionano su di te."),
      passive("natura-meccanica", "Natura meccanica", "Resistenza ai danni da veleno, già applicata alle difese; immune alle malattie; vantaggio ai tiri salvezza per non essere paralizzato o avvelenato. Non mangi, non bevi e non respiri."),
      passive("riposo-della-sentinella", "Riposo della sentinella", "Il riposo lungo è di 6 ore di inattività, in cui resti cosciente."),
    ],
  },
  {
    id: "giff", label: "Giff", book: "spelljammer", page: 12, look: ["🦛", "#a8a29e", "#292524", "#fafaf9"],
    pools: [perPb("scintilla-astrale", "Scintilla astrale")],
    traits: [
      use("scintilla-astrale", "Scintilla astrale", "innesco", "scintilla-astrale", `Quando colpisci un bersaglio con un'arma semplice o da guerra, puoi infliggergli danni da forza extra pari al bonus di competenza. ${PB_LONG}`),
      passive("padronanza-delle-armi-da-fuoco", "Padronanza delle armi da fuoco", "Hai competenza in tutte le armi da fuoco, ignori la proprietà ricarica e attaccare a gittata lunga con un'arma da fuoco non ti dà svantaggio."),
      passive("corporatura-da-ippopotamo", "Corporatura da ippopotamo", "Vantaggio alle prove di Forza e ai tiri salvezza su Forza; conti come una taglia più grande per la capacità di carico."),
    ],
  },
  {
    id: "hadozee", label: "Hadozee", book: "spelljammer", page: 13, look: ["🐒", "#fbbf24", "#451a03", "#fffbeb"],
    pools: [perPb("schivata-hadozee", "Schivata hadozee")],
    traits: [
      passive("piedi-abili", "Piedi abili", "Con un'azione bonus usi i piedi per manipolare un oggetto, aprire o chiudere una porta o un contenitore, o prendere o posare un oggetto Minuscolo."),
      passive("planata", "Planata", "Quando cadi da almeno 3 m d'altezza, con una reazione distendi le membrane e plani: ti sposti in orizzontale fino alla tua velocità camminando e non subisci danni da caduta."),
      use("schivata-hadozee", "Schivata hadozee", "reazione", "schivata-hadozee", `Quando subisci danni, con una reazione tiri 1d6, aggiungi il bonus di competenza e riduci i danni di quel totale. ${PB_LONG}`),
    ],
  },
  {
    id: "plasmoide", label: "Plasmoide", book: "spelljammer", page: 14, resistances: ["acid", "poison"], aliases: ["plasmoid"], look: ["🫧", "#86efac", "#14532d", "#f0fdf4"],
    traits: [
      type("melma"),
      passive("amorfo", "Amorfo", "Ti infili in spazi larghi 2,5 cm senza l'equipaggiamento; vantaggio alle prove per afferrare o liberarti da una presa."),
      passive("trattenere-il-respiro", "Trattenere il respiro", "Puoi trattenere il respiro fino a 1 ora."),
      passive("resilienza-naturale", "Resilienza naturale", "Resistenza ai danni da acido e da veleno, già applicata alle difese; vantaggio ai tiri salvezza per non essere avvelenato."),
      passive("plasmare-se-stesso", "Plasmare sé stesso", "Con un'azione assumi una forma umanoide (testa, braccia, gambe) o torni una massa informe. Con un'azione bonus estendi o riassorbi uno pseudopodo lungo 3 m che manipola oggetti fino a 4,5 kg ma non attacca."),
    ],
  },
  {
    id: "thri-kreen", label: "Thri-kreen", book: "spelljammer", page: 15, aliases: ["thri kreen", "thrikreen"], look: ["🦗", "#a3e635", "#1a2e05", "#f7fee7"],
    traits: [
      type("mostruosità"),
      CARAPACE("carapace", "Carapace"),
      passive("carapace-camaleontico", "Carapace camaleontico", "Con un'azione cambi il colore del carapace come l'ambiente circostante: vantaggio alle prove di Destrezza (Furtività) per nasconderti lì."),
      passive("braccia-secondarie", "Braccia secondarie", "Le braccia secondarie manipolano oggetti, aprono o chiudono porte e contenitori, prendono o posano oggetti Minuscoli e impugnano armi con la proprietà leggera."),
      passive("insonne", "Insonne", "Non dormi e resti cosciente durante il riposo lungo, purché eviti attività faticose."),
      passive("telepatia-thri-kreen", "Telepatia thri-kreen", "Senza parlare condividi pensieri con una creatura che puoi vedere entro 36 m e che conosce almeno una lingua; non serve una lingua comune."),
    ],
  },
];

export const SPECIES_CATALOG_DRAGONLANCE = [
  {
    id: "kender", label: "Kender", book: "dragonlance", page: 20, look: ["🎒", "#f9a8d4", "#500724", "#fdf2f8"],
    pools: [once("impavido", "Impavido"), perPb("provocazione", "Provocazione")],
    traits: [
      passive("impavido", "Impavido", "Vantaggio ai tiri salvezza per evitare o terminare la condizione spaventato."),
      use("impavido-successo", "Impavido: successo", "innesco", "impavido", `Quando fallisci un tiro salvezza per evitare o terminare la condizione spaventato, puoi considerarlo un successo. ${ONCE_LONG}`),
      use("provocazione", "Provocazione", "azione_bonus", "provocazione", `Con un'azione bonus insulti una creatura entro 18 m che può sentirti e capirti: supera un TS su Saggezza (CD 8 + competenza + Intelligenza, Saggezza o Carisma) o ha svantaggio ai tiri per colpire contro bersagli diversi da te fino all'inizio del tuo prossimo turno. ${PB_LONG}`),
    ],
  },
];
