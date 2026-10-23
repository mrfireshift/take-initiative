// Species catalog, tranche 7: the tortle (The Tortle Package) and the minor species of one-off
// supplements: the grung (One Grung Above), the verdan (Acquisitions Incorporated) and the locathah
// (Locathah Rising), plus the Mostri del Multiverso tortle. Same declarative shape as
// speciesCatalogVoloMordenkainen.js. Grung, verdan and locathah have no reprint.

import { passive, use } from "./speciesCatalogVoloMordenkainen.js";

const TORTLE = ["🐢", "#86efac", "#14532d", "#f0fdf4"];
const ARMOR = "Il guscio ti dà una CA base di 17 (la Destrezza non conta). Non puoi indossare armature leggere, medie o pesanti; lo scudo si somma. Va compresa nella CA del profilo.";
const BREATH = "Puoi trattenere il respiro fino a 1 ora.";
// Shell Defense has no uses and no duration: the label stays until removed, when the tortle emerges.
const shellDefense = () => use("difesa-del-guscio", "Difesa del guscio", "azione", "",
  "Con un'azione ti ritiri nel guscio: +4 alla CA e vantaggio ai tiri salvezza su Forza e Costituzione. Finché ci resti sei prono, la tua velocità è 0 e non può aumentare, hai svantaggio ai tiri salvezza su Destrezza, non puoi usare reazioni e l'unica azione possibile è un'azione bonus per uscire. Rimuovi l'etichetta quando esci.",
  { effect: { detail: "+4 CA; vantaggio ai TS su Forza e Costituzione; prono, velocità 0, svantaggio ai TS su Destrezza, niente reazioni.", rounds: null } });

export const SPECIES_CATALOG_TORTLE = [
  {
    id: "tortle", label: "Tortle", book: "tortle", page: 4, look: TORTLE,
    traits: [
      passive("artigli", "Artigli", "Gli artigli sono un'arma naturale per i colpi senz'armi: 1d4 + Forza danni taglienti. Configurali tra gli Attacchi."),
      passive("trattenere-il-respiro", "Trattenere il respiro", BREATH),
      passive("armatura-naturale", "Armatura naturale", ARMOR),
      shellDefense(),
    ],
  },
];

export const SPECIES_CATALOG_GRUNG = [
  {
    id: "grung", label: "Grung", book: "grung", page: 2, immunities: ["poison"], look: ["🐸", "#facc15", "#422006", "#fefce8"],
    traits: [
      passive("anfibio", "Anfibio", "Respiri aria e acqua."),
      passive("immunita-al-veleno", "Immunità al veleno", "Immune ai danni da veleno (già applicato alle difese) e alla condizione avvelenato."),
      passive("pelle-velenosa", "Pelle velenosa", "Chi ti afferra o tocca direttamente la tua pelle supera un TS su Costituzione CD 12 o è avvelenato per 1 minuto; se non è più a contatto, ripete il TS alla fine di ogni suo turno. Puoi anche spalmare il veleno su un'arma perforante come parte dell'attacco: se colpisci, il bersaglio supera un TS su Costituzione CD 12 o subisce 2d4 danni da veleno."),
      passive("salto-da-fermo", "Salto da fermo", "Salti in lungo fino a 7,5 m e in alto fino a 4,5 m, con o senza rincorsa."),
      passive("dipendenza-dall-acqua", "Dipendenza dall'acqua", "Se in un giorno non resti immerso in acqua per almeno 1 ora, alla fine del giorno subisci un livello di indebolimento, che recuperi solo immergendoti per 1 ora."),
    ],
  },
];

export const SPECIES_CATALOG_ACQUISITIONS = [
  {
    id: "verdan", label: "Verdan", book: "acquisitions", page: 14, look: ["🌿", "#4ade80", "#052e16", "#f0fdf4"],
    traits: [
      passive("guarigione-del-sangue-nero", "Guarigione del sangue nero", "Quando ottieni 1 o 2 su un Dado Vita speso alla fine di un riposo breve, puoi ritirarlo e devi usare il nuovo risultato."),
      passive("telepatia-limitata", "Telepatia limitata", "Comunichi telepaticamente idee semplici a qualsiasi creatura che puoi vedere entro 9 m, anche senza una lingua comune; non può risponderti telepaticamente."),
      passive("intuito-telepatico", "Intuito telepatico", "Vantaggio a tutti i tiri salvezza su Saggezza e Carisma."),
    ],
  },
];

export const SPECIES_CATALOG_LOCATHAH = [
  {
    id: "locathah", label: "Locathah", book: "locathah", page: 4, look: ["🐟", "#38bdf8", "#082f49", "#f0f9ff"],
    traits: [
      passive("armatura-naturale", "Armatura naturale", "Senza armatura la tua CA è 12 + Destrezza, e lo scudo si somma: va compresa nella CA del profilo."),
      passive("volonta-del-leviatano", "Volontà del leviatano", "Vantaggio ai tiri salvezza per non essere affascinato, spaventato, paralizzato, avvelenato o stordito, e per non essere addormentato."),
      passive("anfibio-limitato", "Anfibio limitato", "Respiri aria e acqua e hai velocità di nuotare 9 m, ma devi immergerti almeno una volta ogni 4 ore o inizi a soffocare."),
    ],
  },
];

export const SPECIES_CATALOG_MULTIVERSO_TORTLE = [
  {
    id: "tortle-multiverso", label: "Tortle", book: "multiverso", page: 34, look: TORTLE,
    traits: [
      passive("artigli", "Artigli", "Gli artigli sono un'arma naturale per i colpi senz'armi: 1d6 + Forza danni taglienti. Configurali tra gli Attacchi."),
      passive("trattenere-il-respiro", "Trattenere il respiro", BREATH),
      passive("armatura-naturale", "Armatura naturale", ARMOR),
      shellDefense(),
    ],
  },
];
