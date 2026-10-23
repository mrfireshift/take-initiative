// Species catalog, tranche 8: Explorer's Guide to Wildemount and Van Richten's Guide to Ravenloft. Same
// declarative shape as speciesCatalogVoloMordenkainen.js. No Mostri del Multiverso reprint.
// The Wildemount sea elf is the Tomo dei Nemici one: that entry names Wildemount in alsoIn. Wildemount's
// pallid elf and lotusden halfling are species of their own with the play traits of the elf and the
// halfling, like the Tomo dei Nemici subraces. The hollow one is a supernatural gift added to a species,
// not a species: it is not in this catalog.

import { FEY_ANCESTRY, MM_ABILITY, ONCE_LONG, PB_LONG, once, opt, passive, perPb, spell, use } from "./speciesCatalogVoloMordenkainen.js";

const ONCE_SHORT = "Una volta per riposo breve o lungo.";

export const SPECIES_CATALOG_WILDEMOUNT = [
  {
    id: "elfo-pallido", label: "Elfo pallido", book: "wildemount", page: 163, aliases: ["pallid elf"], look: ["🌙", "#e2e8f0", "#1e293b", "#f8fafc"],
    pools: [once("sonno", "Benedizione della Tessitrice Lunare: Sonno"), once("invisibilita", "Benedizione della Tessitrice Lunare: Invisibilità")],
    traits: [
      passive("ascendenza-fatata", "Ascendenza fatata", `Tratto dell'elfo (Manuale del Giocatore p. 23): ${FEY_ANCESTRY.charAt(0).toLocaleLowerCase("it")}${FEY_ANCESTRY.slice(1)}`),
      passive("senso-incisivo", "Senso incisivo", "Vantaggio alle prove di Intelligenza (Indagare) e Saggezza (Intuizione)."),
      passive("benedizione-della-tessitrice-lunare", "Benedizione della Tessitrice Lunare", "Conosci il trucchetto Luce. Dal 3° livello lanci Sonno e dal 5° Invisibilità su te stesso, una volta per riposo lungo ciascuno, senza componenti materiali e con Saggezza."),
      spell("benedizione-sonno", "Benedizione della Tessitrice Lunare: Sonno", "azione", "sonno", 3, `Lanci Sonno senza spendere slot né componenti materiali, con Saggezza. ${ONCE_LONG}`),
      spell("benedizione-invisibilita", "Benedizione della Tessitrice Lunare: Invisibilità", "azione", "invisibilita", 5, `Lanci Invisibilità su te stesso senza spendere slot né componenti materiali, con Saggezza. ${ONCE_LONG}`),
    ],
  },
  {
    id: "halfling-lotusden", label: "Halfling lotusden", book: "wildemount", page: 164, aliases: ["lotusden", "lotusden halfling"], look: ["🍀", "#a3e635", "#1a2e05", "#f7fee7"],
    pools: [once("intralciare", "Figlio del bosco: Intralciare"), once("crescita-di-spine", "Figlio del bosco: Crescita di spine")],
    traits: [
      passive("fortunato", "Fortunato", "Tratto dell'halfling (Manuale del Giocatore p. 28): quando ottieni 1 naturale a un tiro per colpire, a una prova di caratteristica o a un tiro salvezza, puoi ritirare il dado e devi usare il nuovo risultato."),
      passive("coraggioso", "Coraggioso", "Tratto dell'halfling: vantaggio ai tiri salvezza per non essere spaventato."),
      passive("agilita-halfling", "Agilità halfling", "Tratto dell'halfling: puoi muoverti attraverso lo spazio di qualsiasi creatura di taglia più grande della tua."),
      passive("figlio-del-bosco", "Figlio del bosco", "Conosci il trucchetto Artificio druidico. Dal 3° livello lanci Intralciare e dal 5° Crescita di spine, una volta per riposo lungo ciascuno, senza componenti materiali e con Saggezza."),
      spell("figlio-del-bosco-intralciare", "Figlio del bosco: Intralciare", "azione", "intralciare", 3, `Lanci Intralciare senza spendere slot né componenti materiali, con Saggezza. ${ONCE_LONG}`),
      spell("figlio-del-bosco-crescita-di-spine", "Figlio del bosco: Crescita di spine", "azione", "crescita-di-spine", 5, `Lanci Crescita di spine senza spendere slot né componenti materiali, con Saggezza. ${ONCE_LONG}`),
      passive("passo-tra-gli-alberi", "Passo tra gli alberi", "Vantaggio alle prove di Saggezza (Sopravvivenza) per seguire tracce; il terreno difficile di piante e sottobosco non magici non ti costa movimento extra."),
    ],
  },
  {
    id: "dragonide-wildemount", label: "Dragonide di Wildemount", book: "wildemount", page: 168, optionLabel: "Variante", aliases: ["wildemount dragonborn"], look: ["🐉", "#a78bfa", "#3b0764", "#f5f3ff"],
    options: [opt("draconblood", "Draconblood", ["draconblood dragonborn"]), opt("ravenite", "Ravenite", ["ravenite dragonborn"])],
    pools: [once("presenza-energica", "Presenza energica", "breve"), once("assalto-vendicativo", "Assalto vendicativo", "breve")],
    traits: [
      use("presenza-energica", "Presenza energica", "innesco", "presenza-energica", `Al posto di Arma a soffio e Resistenza ai danni: quando fai una prova di Carisma (Intimidire o Persuasione), puoi farla con vantaggio. ${ONCE_SHORT}`, { option: "draconblood" }),
      use("assalto-vendicativo", "Assalto vendicativo", "reazione", "assalto-vendicativo", `Al posto di Arma a soffio e Resistenza ai danni: quando subisci danni da una creatura entro la portata di un'arma che impugni, con una reazione fai un attacco con quell'arma contro di lei. ${ONCE_SHORT}`, { option: "ravenite" }),
    ],
  },
];

export const SPECIES_CATALOG_RAVENLOFT = [
  {
    id: "dhampir", label: "Dhampir", book: "ravenloft", page: 10, look: ["🧛", "#f87171", "#450a0a", "#fef2f2"],
    pools: [perPb("morso-vampirico", "Morso vampirico: potenziamento")],
    traits: [
      passive("natura-senza-morte", "Natura senza morte", "Non hai bisogno di respirare."),
      passive("scalata-del-ragno", "Scalata del ragno", "Velocità di scalare pari alla velocità camminando. Dal 3° livello ti muovi su superfici verticali e a testa in giù sui soffitti, con le mani libere."),
      passive("morso-vampirico", "Morso vampirico", "Il morso è un'arma naturale: 1d4 + Costituzione danni perforanti, con la Costituzione anche al tiro per colpire. Hai vantaggio a colpire con il morso quando ti manca almeno metà dei punti ferita. Configuralo tra gli Attacchi."),
      use("morso-vampirico-potenziamento", "Morso vampirico: potenziamento", "innesco", "morso-vampirico", `Quando colpisci con il morso una creatura che non è un costrutto né un non morto, puoi recuperare punti ferita pari ai danni perforanti inflitti, oppure ottenere un bonus pari a quei danni alla prossima prova di caratteristica o al prossimo tiro per colpire. ${PB_LONG}`),
    ],
  },
  {
    id: "hexblood", label: "Hexblood", book: "ravenloft", page: 11, look: ["🔮", "#c084fc", "#3b0764", "#faf5ff"],
    pools: [once("gettone-inquietante", "Gettone inquietante"), once("camuffare-se-stesso", "Magia del sortilegio: Camuffare se stesso"), once("sortilegio", "Magia del sortilegio: Sortilegio")],
    traits: [
      passive("fatato", "Fatato", "Il tuo tipo di creatura è folletto, non umanoide."),
      use("gettone-inquietante", "Gettone inquietante", "azione_bonus", "gettone-inquietante", `Con un'azione bonus ti stacchi senza danno una ciocca, un'unghia o un dente e ne fai un gettone. Finché qualcuno lo porta, con un'azione puoi mandargli un messaggio telepatico, o vedere e sentire attorno al gettone per 1 minuto, se è sullo stesso piano entro 15 km. ${ONCE_LONG}`),
      passive("magia-del-sortilegio", "Magia del sortilegio", `Lanci Camuffare se stesso e Sortilegio, una volta per riposo lungo ciascuno (puoi lanciarli anche con gli slot); ${MM_ABILITY}.`),
      spell("magia-del-sortilegio-camuffare-se-stesso", "Magia del sortilegio: Camuffare se stesso", "azione", "camuffare-se-stesso", 1, `Lanci Camuffare se stesso senza spendere slot. ${ONCE_LONG}`),
      spell("magia-del-sortilegio-sortilegio", "Magia del sortilegio: Sortilegio", "azione_bonus", "sortilegio", 1, `Lanci Sortilegio senza spendere slot. ${ONCE_LONG}`),
    ],
  },
  {
    id: "reborn", label: "Reborn", book: "ravenloft", page: 12, resistances: ["poison"], aliases: ["rinato"], look: ["⚰️", "#a8a29e", "#1c1917", "#fafaf9"],
    pools: [perPb("conoscenza-da-una-vita-passata", "Conoscenza da una vita passata")],
    traits: [
      passive("natura-senza-morte", "Natura senza morte", "Vantaggio ai tiri salvezza contro le malattie e la condizione avvelenato; resistenza ai danni da veleno, già applicata alle difese. Vantaggio ai tiri salvezza contro la morte. Non mangi, non bevi, non respiri e non dormi; la magia non può farti addormentare. Il riposo lungo è di 4 ore di inattività, cosciente."),
      use("conoscenza-da-una-vita-passata", "Conoscenza da una vita passata", "innesco", "conoscenza-da-una-vita-passata", `Quando fai una prova di caratteristica che usa un'abilità, puoi tirare un d6 e aggiungerlo al risultato. ${PB_LONG}`),
    ],
  },
];
