// Species catalog, tranche 3: Elemental Evil Player's Companion, Guida del Giocatore alla Costa della
// Spada and the Mostri del Multiverso reprints of the aarakocra and the genasi. Same declarative shape
// as speciesCatalogVoloMordenkainen.js; speciesTraitCore.js turns it into records.
// The Elemental Evil goliath and deep gnome and the Costa della Spada duergar and deep gnome have the
// same text as the Volo and Tomo dei Nemici ones: those entries name these manuals in alsoIn.

import { FEY_ANCESTRY, MM_ABILITY, ONCE_LONG, PB_LONG, once, opt, passive, perPb, spell, use } from "./speciesCatalogVoloMordenkainen.js";

const CON = "con Costituzione come caratteristica da incantatore";
const TIEFLING = ["😈", "#fb7185", "#4c0519", "#fff1f2"];
const GENASI = ["🌀", "#fb923c", "#431407", "#fff7ed"];
const AARAKOCRA = ["🦅", "#fcd34d", "#422006", "#fffbeb"];

export const SPECIES_CATALOG_ELEMENTAL = [
  {
    id: "aarakocra", label: "Aarakocra", book: "elemental", page: 5, look: AARAKOCRA,
    traits: [
      passive("volo", "Volo", "Velocità di volare 15 m, ma non mentre indossi un'armatura media o pesante."),
      passive("artigli", "Artigli", "Hai competenza nei colpi senz'armi con gli artigli, che infliggono 1d4 danni taglienti. Configurali tra gli Attacchi."),
    ],
  },
  {
    id: "genasi", label: "Genasi", book: "elemental", page: 9, look: GENASI, optionLabel: "Elemento",
    options: [
      opt("aria", "Genasi dell'aria", ["air", "air genasi", "aria"]),
      opt("terra", "Genasi della terra", ["earth", "earth genasi", "terra"]),
      opt("fuoco", "Genasi del fuoco", ["fire", "fire genasi", "fuoco"], ["fire"]),
      opt("acqua", "Genasi dell'acqua", ["water", "water genasi", "acqua"], ["acid"]),
    ],
    pools: [once("levitazione", "Mescolarsi al vento: Levitazione"), once("passare-senza-tracce", "Fondersi con la pietra: Passare senza tracce"),
      once("mani-brucianti", "Raggiungere la fiamma: Mani brucianti"), once("creare-o-distruggere-acqua", "Richiamo dell'onda: Creare o distruggere acqua")],
    traits: [
      passive("respiro-inesauribile", "Respiro inesauribile", "Puoi trattenere il respiro all'infinito, finché non sei incapacitato.", { option: "aria" }),
      spell("mescolarsi-al-vento", "Mescolarsi al vento: Levitazione", "azione", "levitazione", 1, `Lanci Levitazione senza spendere slot né componenti materiali, ${CON}. ${ONCE_LONG}`, { option: "aria" }),
      passive("camminare-sulla-terra", "Camminare sulla terra", "Attraversi il terreno difficile di terra o pietra senza spendere movimento extra.", { option: "terra" }),
      spell("fondersi-con-la-pietra", "Fondersi con la pietra: Passare senza tracce", "azione", "passare-senza-tracce", 1, `Lanci Passare senza tracce senza spendere slot né componenti materiali, ${CON}. ${ONCE_LONG}`, { option: "terra" }),
      passive("resistenza-al-fuoco", "Resistenza al fuoco", "Resistenza ai danni da fuoco, già applicata alle difese.", { option: "fuoco" }),
      passive("raggiungere-la-fiamma", "Raggiungere la fiamma", `Conosci il trucchetto Produrre fiamma. Dal 3° livello lanci Mani brucianti come incantesimo di 1° livello una volta per riposo lungo, ${CON}.`, { option: "fuoco" }),
      spell("raggiungere-la-fiamma-mani-brucianti", "Raggiungere la fiamma: Mani brucianti", "azione", "mani-brucianti", 3, `Lanci Mani brucianti come incantesimo di 1° livello senza spendere slot, con Costituzione. ${ONCE_LONG}`, { option: "fuoco" }),
      passive("resistenza-all-acido", "Resistenza all'acido", "Resistenza ai danni da acido, già applicata alle difese.", { option: "acqua" }),
      passive("anfibio", "Anfibio", "Respiri aria e acqua; velocità di nuotare 9 m.", { option: "acqua" }),
      passive("richiamo-dell-onda", "Richiamo dell'onda", `Conosci il trucchetto Modellare acqua. Dal 3° livello lanci Creare o distruggere acqua come incantesimo di 2° livello una volta per riposo lungo, ${CON}.`, { option: "acqua" }),
      spell("richiamo-dell-onda-creare-o-distruggere-acqua", "Richiamo dell'onda: Creare o distruggere acqua", "azione", "creare-o-distruggere-acqua", 3, `Lanci Creare o distruggere acqua come incantesimo di 2° livello senza spendere slot, con Costituzione. ${ONCE_LONG}`, { option: "acqua" }),
    ],
  },
];

// Costa della Spada: the half-elf and tiefling variants, and the ghostwise halfling.
const HALF_ELF_VARIANTS = [
  opt("abilita", "Versatilità nelle abilità", ["skill versatility", "standard"]),
  opt("armi", "Addestramento nelle armi elfiche", ["elf weapon training"]),
  opt("trucchetto", "Trucchetto dell'alto elfo", ["high elf cantrip", "cantrip"]),
  opt("piede-lesto", "Piede lesto", ["fleet of foot", "wood elf"]),
  opt("maschera", "Maschera della selva", ["mask of the wild"]),
  opt("drow", "Magia drow", ["drow magic", "drow"]),
  opt("acquatico", "Discendenza acquatica", ["aquatic", "swim"]),
];

export const SPECIES_CATALOG_COSTA = [
  {
    id: "halfling-spettrale", label: "Halfling spettrale", book: "costa", page: 110, aliases: ["ghostwise", "ghostwise halfling"], look: ["🍀", "#a3e635", "#1a2e05", "#f7fee7"],
    traits: [
      passive("fortunato", "Fortunato", "Tratto dell'halfling (Manuale del Giocatore p. 28): quando ottieni 1 naturale a un tiro per colpire, a una prova di caratteristica o a un tiro salvezza, puoi ritirare il dado e devi usare il nuovo risultato."),
      passive("coraggioso", "Coraggioso", "Tratto dell'halfling: vantaggio ai tiri salvezza per non essere spaventato."),
      passive("agilita-halfling", "Agilità halfling", "Tratto dell'halfling: puoi muoverti attraverso lo spazio di qualsiasi creatura di taglia più grande della tua."),
      passive("linguaggio-silenzioso", "Linguaggio silenzioso", "Parli telepaticamente con una creatura alla volta entro 9 m; ti capisce solo se condividete una lingua."),
    ],
  },
  {
    id: "mezzelfo-variante", label: "Mezzelfo", book: "costa", page: 116, optionLabel: "Variante", aliases: ["half elf", "mezz elfo"], look: ["🌗", "#818cf8", "#1e1b4b", "#eef2ff"],
    options: HALF_ELF_VARIANTS,
    pools: [once("luminescenza", "Magia drow: Luminescenza"), once("oscurita", "Magia drow: Oscurità")],
    traits: [
      passive("ascendenza-fatata", "Ascendenza fatata", FEY_ANCESTRY),
      passive("trucchetto", "Trucchetto", "Al posto di Versatilità nelle abilità: conosci un trucchetto a scelta dalla lista del mago, con Intelligenza come caratteristica da incantatore. Aggiungilo al libro degli incantesimi.", { option: "trucchetto" }),
      passive("piede-lesto", "Piede lesto", "Al posto di Versatilità nelle abilità: velocità base sul terreno 10,5 m. Impostala nella velocità del profilo.", { option: "piede-lesto" }),
      passive("maschera-della-selva", "Maschera della selva", "Al posto di Versatilità nelle abilità: puoi tentare di nasconderti anche quando sei solo leggermente oscurato da fogliame, pioggia fitta, neve che cade, nebbia o altri fenomeni naturali.", { option: "maschera" }),
      passive("magia-drow", "Magia drow", "Al posto di Versatilità nelle abilità: conosci il trucchetto Luci danzanti; dal 3° livello lanci Luminescenza e dal 5° Oscurità, una volta per riposo lungo ciascuno, con Carisma.", { option: "drow" }),
      spell("magia-drow-luminescenza", "Magia drow: Luminescenza", "azione", "luminescenza", 3, `Lanci Luminescenza senza spendere slot, con Carisma. ${ONCE_LONG}`, { option: "drow" }),
      spell("magia-drow-oscurita", "Magia drow: Oscurità", "azione", "oscurita", 5, `Lanci Oscurità senza spendere slot, con Carisma. ${ONCE_LONG}`, { option: "drow" }),
      passive("discendenza-acquatica", "Discendenza acquatica", "Al posto di Versatilità nelle abilità, se discendi dagli elfi marini: velocità di nuotare 9 m.", { option: "acquatico" }),
    ],
  },
  {
    id: "tiefling-variante", label: "Tiefling", book: "costa", page: 118, optionLabel: "Variante", resistances: ["fire"], aliases: ["tiefling variante"], look: TIEFLING,
    options: [
      opt("eredita", "Eredità infernale", ["infernal legacy", "feral", "ferino", "appearance"]),
      opt("lingua", "Lingua del diavolo", ["devil s tongue", "devils tongue"]),
      opt("fuoco", "Fuoco infernale", ["hellfire"]),
      opt("alato", "Alato", ["winged"]),
    ],
    pools: [once("intimorire-infernale", "Eredità infernale: Intimorire infernale"), once("oscurita", "Eredità infernale: Oscurità"),
      once("charme-su-persone", "Lingua del diavolo: Charme su persone"), once("estasiare", "Lingua del diavolo: Estasiare"),
      once("mani-brucianti", "Fuoco infernale: Mani brucianti"), once("fuoco-oscurita", "Fuoco infernale: Oscurità")],
    traits: [
      passive("resistenza-infernale", "Resistenza infernale", "Resistenza ai danni da fuoco, già applicata alle difese."),
      passive("eredita-infernale", "Eredità infernale", "Come nel Manuale del Giocatore (anche per il tiefling ferino o dall'aspetto diverso): conosci Taumaturgia; dal 3° livello Intimorire infernale come incantesimo di 2° livello e dal 5° Oscurità, una volta per riposo lungo ciascuno, con Carisma.", { option: "eredita" }),
      spell("eredita-infernale-intimorire-infernale", "Eredità infernale: Intimorire infernale", "reazione", "intimorire-infernale", 3, `Lanci Intimorire infernale come incantesimo di 2° livello senza spendere slot, con Carisma. ${ONCE_LONG}`, { option: "eredita" }),
      spell("eredita-infernale-oscurita", "Eredità infernale: Oscurità", "azione", "oscurita", 5, `Lanci Oscurità senza spendere slot, con Carisma. ${ONCE_LONG}`, { option: "eredita" }),
      passive("lingua-del-diavolo", "Lingua del diavolo", "Al posto di Eredità infernale: conosci Beffa crudele; dal 3° livello Charme su persone come incantesimo di 2° livello e dal 5° Estasiare, una volta per riposo lungo ciascuno, con Carisma.", { option: "lingua" }),
      spell("lingua-del-diavolo-charme-su-persone", "Lingua del diavolo: Charme su persone", "azione", "charme-su-persone", 3, `Lanci Charme su persone come incantesimo di 2° livello senza spendere slot, con Carisma. ${ONCE_LONG}`, { option: "lingua" }),
      spell("lingua-del-diavolo-estasiare", "Lingua del diavolo: Estasiare", "azione", "estasiare", 5, `Lanci Estasiare senza spendere slot, con Carisma. ${ONCE_LONG}`, { option: "lingua" }),
      passive("fuoco-infernale", "Fuoco infernale", "Eredità infernale con Mani brucianti al posto di Intimorire infernale: conosci Taumaturgia; dal 3° livello Mani brucianti come incantesimo di 2° livello e dal 5° Oscurità, una volta per riposo lungo ciascuno, con Carisma.", { option: "fuoco" }),
      spell("fuoco-infernale-mani-brucianti", "Fuoco infernale: Mani brucianti", "azione", "mani-brucianti", 3, `Lanci Mani brucianti come incantesimo di 2° livello senza spendere slot, con Carisma. ${ONCE_LONG}`, { option: "fuoco" }),
      spell("fuoco-infernale-oscurita", "Fuoco infernale: Oscurità", "azione", "fuoco-oscurita", 5, `Lanci Oscurità senza spendere slot, con Carisma. ${ONCE_LONG}`, { option: "fuoco" }),
      passive("alato", "Alato", "Al posto di Eredità infernale: ali da pipistrello ti danno una velocità di volare 9 m, ma non mentre indossi un'armatura pesante.", { option: "alato" }),
    ],
  },
];

export const SPECIES_CATALOG_MULTIVERSO_ELEMENTAL = [
  {
    id: "aarakocra-multiverso", label: "Aarakocra", book: "multiverso", page: 6, look: AARAKOCRA,
    pools: [once("folata-di-vento", "Richiamo del vento: Folata di vento")],
    traits: [
      passive("volo", "Volo", "Velocità di volare pari alla velocità camminando, ma non mentre indossi un'armatura media o pesante."),
      passive("artigli", "Artigli", "Gli artigli sono un'arma naturale per i colpi senz'armi: 1d6 + Forza danni taglienti. Configurali tra gli Attacchi."),
      spell("richiamo-del-vento", "Richiamo del vento: Folata di vento", "azione", "folata-di-vento", 3, `Dal 3° livello lanci Folata di vento senza componenti, una volta per riposo lungo (puoi lanciarlo anche con gli slot); ${MM_ABILITY}.`),
    ],
  },
  {
    id: "genasi-multiverso", label: "Genasi", book: "multiverso", page: 16, look: GENASI, optionLabel: "Elemento",
    options: [
      opt("aria", "Genasi dell'aria", ["air", "air genasi", "aria"], ["lightning"]),
      opt("terra", "Genasi della terra", ["earth", "earth genasi", "terra"]),
      opt("fuoco", "Genasi del fuoco", ["fire", "fire genasi", "fuoco"], ["fire"]),
      opt("acqua", "Genasi dell'acqua", ["water", "water genasi", "acqua"], ["acid"]),
    ],
    pools: [once("caduta-morbida", "Mescolarsi al vento: Caduta morbida"), once("levitazione", "Mescolarsi al vento: Levitazione"),
      perPb("interdizione-alle-lame", "Fondersi con la pietra: Interdizione alle lame"), once("passare-senza-tracce", "Fondersi con la pietra: Passare senza tracce"),
      once("mani-brucianti", "Raggiungere la fiamma: Mani brucianti"), once("lama-infuocata", "Raggiungere la fiamma: Lama infuocata"),
      once("creare-o-distruggere-acqua", "Richiamo dell'onda: Creare o distruggere acqua"), once("camminare-sull-acqua", "Richiamo dell'onda: Camminare sull'acqua")],
    traits: [
      passive("respiro-inesauribile", "Respiro inesauribile", "Puoi trattenere il respiro all'infinito, finché non sei incapacitato.", { option: "aria" }),
      passive("resistenza-al-fulmine", "Resistenza al fulmine", "Resistenza ai danni da fulmine, già applicata alle difese.", { option: "aria" }),
      passive("mescolarsi-al-vento", "Mescolarsi al vento", `Conosci il trucchetto Stretta folgorante. Dal 3° livello lanci Caduta morbida e dal 5° Levitazione, una volta per riposo lungo ciascuno senza componenti materiali (puoi lanciarli anche con gli slot); ${MM_ABILITY}.`, { option: "aria" }),
      spell("mescolarsi-al-vento-caduta-morbida", "Mescolarsi al vento: Caduta morbida", "reazione", "caduta-morbida", 3, `Lanci Caduta morbida senza spendere slot né componenti materiali. ${ONCE_LONG}`, { option: "aria" }),
      spell("mescolarsi-al-vento-levitazione", "Mescolarsi al vento: Levitazione", "azione", "levitazione", 5, `Lanci Levitazione senza spendere slot né componenti materiali. ${ONCE_LONG}`, { option: "aria" }),
      passive("camminare-sulla-terra", "Camminare sulla terra", "Attraversi il terreno difficile di terra o pietra senza spendere movimento extra.", { option: "terra" }),
      passive("fondersi-con-la-pietra", "Fondersi con la pietra", `Conosci il trucchetto Interdizione alle lame e puoi lanciarlo come azione bonus. Dal 5° livello lanci Passare senza tracce una volta per riposo lungo senza componenti materiali (puoi lanciarlo anche con gli slot); ${MM_ABILITY}.`, { option: "terra" }),
      use("fondersi-con-la-pietra-interdizione-alle-lame", "Fondersi con la pietra: Interdizione alle lame", "azione_bonus", "interdizione-alle-lame", `Lanci Interdizione alle lame come azione bonus. ${PB_LONG}`, { option: "terra" }),
      spell("fondersi-con-la-pietra-passare-senza-tracce", "Fondersi con la pietra: Passare senza tracce", "azione", "passare-senza-tracce", 5, `Lanci Passare senza tracce senza spendere slot né componenti materiali. ${ONCE_LONG}`, { option: "terra" }),
      passive("resistenza-al-fuoco", "Resistenza al fuoco", "Resistenza ai danni da fuoco, già applicata alle difese.", { option: "fuoco" }),
      passive("raggiungere-la-fiamma", "Raggiungere la fiamma", `Conosci il trucchetto Produrre fiamma. Dal 3° livello lanci Mani brucianti e dal 5° Lama infuocata, una volta per riposo lungo ciascuno senza componenti materiali (puoi lanciarli anche con gli slot); ${MM_ABILITY}.`, { option: "fuoco" }),
      spell("raggiungere-la-fiamma-mani-brucianti", "Raggiungere la fiamma: Mani brucianti", "azione", "mani-brucianti", 3, `Lanci Mani brucianti senza spendere slot né componenti materiali. ${ONCE_LONG}`, { option: "fuoco" }),
      spell("raggiungere-la-fiamma-lama-infuocata", "Raggiungere la fiamma: Lama infuocata", "azione_bonus", "lama-infuocata", 5, `Lanci Lama infuocata senza spendere slot né componenti materiali. ${ONCE_LONG}`, { option: "fuoco" }),
      passive("resistenza-all-acido", "Resistenza all'acido", "Resistenza ai danni da acido, già applicata alle difese.", { option: "acqua" }),
      passive("anfibio", "Anfibio", "Respiri aria e acqua; velocità di nuotare pari alla velocità camminando.", { option: "acqua" }),
      passive("richiamo-dell-onda", "Richiamo dell'onda", `Conosci il trucchetto Fiotto acido. Dal 3° livello lanci Creare o distruggere acqua e dal 5° Camminare sull'acqua, una volta per riposo lungo ciascuno senza componenti materiali (puoi lanciarli anche con gli slot); ${MM_ABILITY}.`, { option: "acqua" }),
      spell("richiamo-dell-onda-creare-o-distruggere-acqua", "Richiamo dell'onda: Creare o distruggere acqua", "azione", "creare-o-distruggere-acqua", 3, `Lanci Creare o distruggere acqua senza spendere slot né componenti materiali. ${ONCE_LONG}`, { option: "acqua" }),
      spell("richiamo-dell-onda-camminare-sull-acqua", "Richiamo dell'onda: Camminare sull'acqua", "azione", "camminare-sull-acqua", 5, `Lanci Camminare sull'acqua senza spendere slot né componenti materiali. ${ONCE_LONG}`, { option: "acqua" }),
    ],
  },
];
