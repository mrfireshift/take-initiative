// Species catalog, tranche 6: The Wild Beyond the Witchlight and Strixhaven: A Curriculum of Chaos. Same
// declarative shape as speciesCatalogVoloMordenkainen.js.
// Witchlight already uses the Mostri del Multiverso design: its fairy and harengon are reprinted there
// with the same text, so those entries name Mostri del Multiverso in alsoIn. The owlin has no reprint.

import { MM_ABILITY, ONCE_LONG, PB_LONG, once, passive, perPb, spell, use } from "./speciesCatalogVoloMordenkainen.js";

const FLIGHT = "Velocità di volare pari alla velocità camminando, ma non mentre indossi un'armatura media o pesante.";

export const SPECIES_CATALOG_WITCHLIGHT = [
  {
    id: "fata", label: "Fata", book: "witchlight", page: 12, alsoIn: ["multiverso"], aliases: ["fairy"], look: ["🧚", "#f0abfc", "#4a044e", "#fdf4ff"],
    pools: [once("luminescenza", "Magia fatata: Luminescenza"), once("ingrandire-ridurre", "Magia fatata: Ingrandire/ridurre")],
    traits: [
      passive("fatato", "Fatato", "Il tuo tipo di creatura è folletto, non umanoide."),
      passive("volo", "Volo", FLIGHT),
      passive("magia-fatata", "Magia fatata", `Conosci il trucchetto Artificio druidico. Dal 3° livello lanci Luminescenza e dal 5° Ingrandire/ridurre, una volta per riposo lungo ciascuno senza componenti materiali (puoi lanciarli anche con gli slot); ${MM_ABILITY}.`),
      spell("magia-fatata-luminescenza", "Magia fatata: Luminescenza", "azione", "luminescenza", 3, `Lanci Luminescenza senza spendere slot né componenti materiali. ${ONCE_LONG}`),
      spell("magia-fatata-ingrandire-ridurre", "Magia fatata: Ingrandire/ridurre", "azione", "ingrandire-ridurre", 5, `Lanci Ingrandire/ridurre senza spendere slot né componenti materiali. ${ONCE_LONG}`),
    ],
  },
  {
    id: "harengon", label: "Harengon", book: "witchlight", page: 13, alsoIn: ["multiverso"], look: ["🐇", "#fcd34d", "#422006", "#fffbeb"],
    pools: [perPb("salto-del-coniglio", "Salto del coniglio")],
    traits: [
      passive("grilletto-della-lepre", "Grilletto della lepre", "Aggiungi il bonus di competenza ai tiri per l'iniziativa: va compreso nel valore che inserisci nel tracker."),
      passive("passo-fortunato", "Passo fortunato", "Quando fallisci un tiro salvezza su Destrezza, con una reazione tiri un d4 e lo aggiungi al risultato, che può così diventare un successo. Non puoi farlo se sei prono o la tua velocità è 0."),
      use("salto-del-coniglio", "Salto del coniglio", "azione_bonus", "salto-del-coniglio", `Con un'azione bonus salti di un numero di piedi pari a 5 volte il bonus di competenza (1,5 m per punto) senza provocare attacchi di opportunità. Solo se la tua velocità è superiore a 0. ${PB_LONG}`),
    ],
  },
];

export const SPECIES_CATALOG_STRIXHAVEN = [
  {
    id: "owlin", label: "Owlin", book: "strixhaven", page: 29, look: ["🦉", "#d6d3d1", "#292524", "#fafaf9"],
    traits: [
      passive("volo", "Volo", FLIGHT),
    ],
  },
];
