// Species catalog, tranche 10: the custom lineage of the Calderone Omnicomprensivo di Tasha. Same declarative
// shape as speciesCatalogVoloMordenkainen.js. Tasha's "Customizing Your Origin" is a rule, not a species: it
// moves ability score increases, proficiencies and languages, which the plugin does not track.

import { passive } from "./speciesCatalogVoloMordenkainen.js";

export const SPECIES_CATALOG_TASHA = [
  {
    id: "lignaggio-personalizzato", label: "Lignaggio personalizzato", book: "tasha", page: 8, aliases: ["custom lineage", "lignaggio"],
    look: ["🧩", "#f472b6", "#500724", "#fdf2f8"],
    traits: [
      passive("talento", "Talento", "Ottieni un talento a tua scelta di cui soddisfi i requisiti. Gli effetti del talento si configurano a parte: capacità, Azioni rapide, difese."),
      passive("tratto-variabile", "Tratto variabile", "Scegli scurovisione entro 18 m o la competenza in un'abilità: va riportata nella scheda."),
    ],
  },
];
