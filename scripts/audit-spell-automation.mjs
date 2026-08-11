import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import phb2014Data from "../src/spells-phb2014-extra.json" with { type: "json" };
import referenceData from "../src/spell-reference-it.json" with { type: "json" };
import supplementData from "../src/spells-supplements-runtime.json" with { type: "json" };
import {
  getAreaSaveRuleChoices,
  getSpellCatalog,
  getTrackableSpellOptions,
} from "../src/spells-srd.js";
import { getSpellAreaRules } from "../src/spellAreaRules.js";
import { getSpellCastPhaseOptions } from "../src/spellCastPhaseCore.js";
import {
  getSpellSaveWorkflowChoiceOptions,
  getSpellSaveWorkflowRule,
} from "../src/spellSaveWorkflowRules.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const JSON_OUTPUT = path.join(ROOT, "data", "spell-automation-audit.json");
const MARKDOWN_OUTPUT = path.join(ROOT, "docs", "AUDIT_AUTOMAZIONE_INCANTESIMI.md");

const CONDITIONS = Object.freeze([
  "Accecato",
  "Affascinato",
  "Afferrato",
  "Assordato",
  "Avvelenato",
  "Incapacitato",
  "Invisibile",
  "Paralizzato",
  "Pietrificato",
  "Privo di sensi",
  "Prono",
  "Spaventato",
  "Stordito",
  "Trattenuto",
  "Indebolimento",
]);

const EXTERNAL_MOVEMENT_SPELL_IDS = new Set([
  "longstrider",
  "ray-of-frost",
  "haste",
  "slow",
  "hypnotic-pattern",
]);

const INTENTIONALLY_MANUAL_SPELL_IDS = new Set([
  "xanathar-disperdere",
  "xanathar-metamorfosi-di-massa",
  "wish",
]);

const CURATED_AUDIT_EXCLUSION_SPELL_IDS = new Set([
  "alter-self",
  "feather-fall",
  "water-walk",
  "meld-into-stone",
  "gaseous-form",
  "project-image",
  "silent-image",
  "hunters-mark",
  "modify-memory",
  "phb2014-sortilegio",
  "zone-of-truth",
]);

const GAP_LABELS = Object.freeze({
  TEXT_MISSING: "testo regolamentare locale mancante",
  TRACKING_MISSING: "tracking persistente assente",
  AREA_GEOMETRY_MISSING: "geometria d'area assente",
  AREA_VARIANT_GEOMETRY: "varianti geometriche dell'area incomplete",
  AREA_MEMBERSHIP_MARKER: "pill di appartenenza all'area assente",
  AREA_LIFECYCLE_MISSING: "lifecycle persistente dell'area assente",
  ZONE_TRIGGER_MISSING: "trigger spaziali o di turno assenti",
  SAVE_WORKFLOW_MISSING: "workflow batch/area del tiro salvezza assente",
  STATUS_MISSING: "condizione o stato RAW non rappresentato",
  MOVEMENT_MECHANICS_MISSING: "meccanica di movimento assente",
  TURN_EFFECT_MISSING: "effetto ricorrente di turno assente",
  ACTIVE_PHASE_MISSING: "azione o fase successiva al lancio assente",
  CHOICE_WORKFLOW_MISSING: "varianti rilevanti non modellate",
  LINGERING_EFFECT_MISSING: "effetto persistente di una spell istantanea assente",
  DIRECTIONAL_MOVEMENT_COST: "costo di movimento direzionale non calcolato",
  AREA_SMOKE_TEST: "smoke test geometrico e lifecycle ancora richiesto",
  CHILD_ZONE_GEOMETRY: "sottozona figlia non modellata",
  MODE_SPECIFIC_RUNTIME: "runtime specifico delle modalità incompleto",
  HOT_SIDE_GEOMETRY: "lato caldo e fascia adiacente non modellati",
  CROSSING_DETECTION: "attraversamento continuo non rilevato",
  SLOT_SCALING: "progressione con lo slot non applicata al trigger",
  LAYER_STATE_MACHINE: "strati distruttibili e stato per strato assenti",
  ENTRY_EXIT_FALL: "ingresso, sospensione e caduta finale non risolti",
  ROUND_STATE_MACHINE: "progressione degli effetti per round assente",
  PROJECTILE_BOUNDARY: "vincoli a proiettili e attraversamento assenti",
  MOVABLE_ZONE_RUNTIME: "movimento manuale della zona non risolto",
  MULTI_SAVE_SEQUENCE: "sequenza di più TS e uscita dalla condizione incompleta",
  VARIANT_ZONE_RUNTIME: "varianti della zona e relativi trigger incomplete",
  BOUNDARY_REJECTION: "barriera e interruzione al contatto non risolte",
  AURA_PASSIVE_RUNTIME: "effetti passivi dell'aura incompleti",
  AURA_HEAL_ACTION: "azione di cura entro l'aura assente",
  DELAYED_DAMAGE: "danno differito non tracciato",
  REPEATED_ACTION: "azione ripetibile della spell assente",
  RESOURCE_STATE: "contatore o risorsa interna della spell assente",
  MULTI_SAVE_STATE: "stato di successi/fallimenti multipli assente",
  CONDITIONAL_TRIGGER: "trigger condizionale durante la durata assente",
  RETARGET_ACTION: "azione di trasferimento a un nuovo bersaglio assente",
  POST_EXPIRY_EFFECT: "conseguenza alla fine della spell assente",
  MOBILE_ZONE_ACTION: "azione di spostamento della zona assente",
  MOVEMENT_IMMUNITY: "eccezioni e immunità ai costi di movimento assenti",
  ENDING_DETONATION: "detonazione e accumulo alla terminazione assenti",
  RANDOM_TURN_STATE: "stato casuale ricorrente di turno assente",
  RANDOM_RESULT_STATE: "esito casuale e relativo stato non rappresentati",
  PASSIVE_RULES_MISSING: "regole passive e limitazioni della spell incomplete",
});

const CURATED_REVIEW = Object.freeze({
  "xanathar-anatema-elementale": {
    gaps: ["CONDITIONAL_TRIGGER"],
    note: "Il workflow batch del TS Costituzione, la scelta condivisa del tipo, il limite con slot superiori e la validazione pairwise entro 9 m sono operativi; resta manuale il trigger della prima applicazione di danno compatibile in ogni turno, con +2d6 e rimozione della resistenza.",
  },
  "compulsion": {
    gaps: ["REPEATED_ACTION", "MOVEMENT_MECHANICS_MISSING"],
    note: "Il TS iniziale è coperto; manca la direzione scelta dal caster con azione bonus a ogni turno e il movimento obbligato dei bersagli prima del loro normale movimento.",
  },
  "dominate-beast": {
    gaps: ["REPEATED_ACTION", "CONDITIONAL_TRIGGER"],
    note: "Affascinato e TS iniziale sono coperti; mancano il controllo preciso tramite azione e il nuovo TS Saggezza ogni volta che il bersaglio subisce danni.",
  },
  "dominate-monster": {
    gaps: ["REPEATED_ACTION", "CONDITIONAL_TRIGGER"],
    note: "Affascinato e TS iniziale sono coperti; mancano il controllo preciso tramite azione e il nuovo TS Saggezza ogni volta che il bersaglio subisce danni.",
  },
  "dominate-person": {
    gaps: ["REPEATED_ACTION", "CONDITIONAL_TRIGGER"],
    note: "Affascinato e TS iniziale sono coperti; mancano il controllo preciso tramite azione e il nuovo TS Saggezza ogni volta che il bersaglio subisce danni.",
  },
  "animal-shapes": {
    gaps: ["REPEATED_ACTION", "CHOICE_WORKFLOW_MISSING"],
    note: "Manca l'azione dei turni successivi che cambia nuovamente, anche in modo diverso per ciascun bersaglio, le forme e i blocchi statistiche associati.",
  },
  "xanathar-frecce-infuocate": {
    gaps: ["RESOURCE_STATE", "CONDITIONAL_TRIGGER"],
    note: "Servono il contatore condiviso delle dodici munizioni e il consumo dell'effetto al primo colpo o mancato di ogni freccia estratta.",
  },
  "mislead": {
    gaps: ["STATUS_MISSING", "REPEATED_ACTION"],
    note: "Mancano Invisibile sul caster, l'entità illusoria mobile e le azioni successive per muoverla e alternare l'uso dei sensi.",
  },
  "xanathar-lama-dombra": {
    gaps: ["REPEATED_ACTION"],
    note: "La spell non espone l'arma creata né l'azione bonus che la fa ricomparire nella mano dopo che è stata lasciata cadere o lanciata.",
  },
  "flame-blade": {
    gaps: ["REPEATED_ACTION"],
    note: "La durata è tracciata, ma non esiste l'azione ripetibile per effettuare gli attacchi in mischia con la lama creata.",
  },
  "xanathar-modellare-acqua": {
    gaps: ["AREA_GEOMETRY_MISSING", "CHOICE_WORKFLOW_MISSING"],
    note: "Le quattro manipolazioni del cubo d'acqua, incluse congelamento e animazione persistenti, non sono selezionabili né collegate a una geometria opzionale.",
  },
  "xanathar-modellare-terra": {
    gaps: ["AREA_GEOMETRY_MISSING", "CHOICE_WORKFLOW_MISSING", "MOVEMENT_MECHANICS_MISSING"],
    note: "Mancano le modalità del cubo e, per il terreno reso difficile o normale per un'ora, una zona persistente collegata al costo di movimento.",
  },
  "xanathar-muro-dacqua": {
    gaps: ["MOVEMENT_MECHANICS_MISSING", "CONDITIONAL_TRIGGER"],
    note: "La parete non applica terreno difficile né le interazioni contestuali con attacchi a distanza, danni da fuoco e congelamento locale da freddo.",
  },
  "speak-with-plants": {
    gaps: ["MOVEMENT_MECHANICS_MISSING", "CHOICE_WORKFLOW_MISSING"],
    note: "L'aura è presente, ma manca la scelta di rendere normale o difficile il terreno vegetale e il relativo collegamento allo Speed Tracker.",
  },
  "branding-smite": {
    gaps: ["CONDITIONAL_TRIGGER", "PASSIVE_RULES_MISSING"],
    note: "Manca la risoluzione sul prossimo colpo: danni radiosi, rivelazione di un bersaglio invisibile e blocco di nuova invisibilità fino alla fine della spell.",
  },
  "prismatic-spray": {
    gaps: ["RANDOM_RESULT_STATE", "MULTI_SAVE_SEQUENCE", "STATUS_MISSING"],
    note: "La sagoma e il primo TS esistono, ma non il d8 per ciascun bersaglio, il doppio raggio con 8, i TS successivi e gli stati Accecato, Trattenuto e Pietrificato.",
  },
  "shapechange": {
    gaps: ["REPEATED_ACTION", "CHOICE_WORKFLOW_MISSING"],
    note: "Mancano la forma e i PF correnti come stato dell'istanza e l'azione che sostituisce la forma nei turni successivi rispettando i limiti RAW.",
  },
  "flesh-to-stone": {
    gaps: ["MULTI_SAVE_STATE", "STATUS_MISSING"],
    note: "Richiede Trattenuto iniziale, conteggio indipendente di tre successi o fallimenti e transizione a Pietrificato permanente dopo concentrazione completa.",
  },
  "holy-aura": {
    gaps: ["CONDITIONAL_TRIGGER", "STATUS_MISSING"],
    note: "Ogni colpo in mischia di immondo o non morto contro un protetto innesca un TS Costituzione che può applicare Accecato fino al termine della spell.",
  },
  "contagion": {
    gaps: ["MULTI_SAVE_STATE", "CONDITIONAL_TRIGGER"],
    note: "Occorrono conteggio 3 successi/3 fallimenti, sei malattie alternative e trigger specifici come Stordito quando il bersaglio subisce danni.",
  },
  "xanathar-corona-di-stelle": {
    gaps: ["RESOURCE_STATE", "REPEATED_ACTION"],
    note: "La spell parte con sette scintille, ne consuma una per azione bonus e termina alla settima; anche la luce dipende dal residuo.",
  },
  "xanathar-debilitazione": {
    gaps: ["REPEATED_ACTION", "CONDITIONAL_TRIGGER"],
    note: "Dopo il fallimento iniziale, ogni azione del caster ripete automaticamente i danni e cura la metà; altre azioni, gittata o copertura terminano la spell.",
  },
  "xanathar-gabbia-dellanima": {
    gaps: ["RESOURCE_STATE", "REPEATED_ACTION"],
    note: "L'anima dispone di sei usi condivisi tra più azioni con durate e conseguenze differenti; il registro non espone il contatore né le opzioni.",
  },
  "xanathar-interdizione-primordiale": {
    gaps: ["CONDITIONAL_TRIGGER", "POST_EXPIRY_EFFECT"],
    note: "Una reazione al danno trasforma tutte le resistenze nell'immunità al tipo scelto fino alla fine del turno successivo.",
  },
  blink: {
    gaps: ["RANDOM_TURN_STATE", "POST_EXPIRY_EFFECT"],
    note: "Richiede d20 a ogni fine turno, stato sul Piano Etereo e rientro all'inizio del turno successivo o alla terminazione.",
  },
  "xanathar-investitura-del-vento": {
    gaps: ["REPEATED_ACTION", "POST_EXPIRY_EFFECT"],
    note: "La velocità di volo è modellabile, ma mancano il cubo offensivo ripetibile e la caduta se la spell termina mentre il caster è in volo.",
  },
  "xanathar-investitura-della-pietra": {
    gaps: ["REPEATED_ACTION", "MOVEMENT_IMMUNITY", "POST_EXPIRY_EFFECT"],
    note: "Servono terremoto ripetibile, immunità al costo del terreno difficile, attraversamento della pietra ed espulsione con Stordito se il movimento termina al suo interno.",
  },
  "xanathar-muro-di-luce": {
    gaps: ["RESOURCE_STATE", "REPEATED_ACTION", "TURN_EFFECT_MISSING"],
    note: "Ogni raggio usa un'azione e accorcia il muro di 3 m; restano inoltre danno a fine turno e TS ricorrente contro Accecato.",
  },
  "delayed-blast-fireball": {
    gaps: ["ENDING_DETONATION", "RESOURCE_STATE", "CONDITIONAL_TRIGGER"],
    note: "La sfera accumula 1d6 a fine turno, esplode alla terminazione o al contatto e può essere lanciata altrove dopo un TS riuscito.",
  },
  "tasha-sudario-spirituale": {
    gaps: ["CONDITIONAL_TRIGGER", "MOVEMENT_MECHANICS_MISSING", "TURN_EFFECT_MISSING"],
    note: "Ogni bersaglio colpito riceve blocco cure e, se scelto vicino al caster, -3 m fino all'inizio del turno successivo; il trigger nasce dal colpo.",
  },
  telekinesis: {
    gaps: ["REPEATED_ACTION", "STATUS_MISSING"],
    note: "Ogni round può cambiare bersaglio o ripetere la contesa; una creatura sollevata resta Trattenuta fino al termine del turno successivo.",
  },
  "control-water": {
    gaps: ["CHILD_ZONE_GEOMETRY", "MODE_SPECIFIC_RUNTIME"],
    note: "Le quattro azioni sono esposte, ma la massa controllata e il vortice richiedono geometrie distinte; trascinamento, onda ricorrente e prove di uscita non sono completi.",
  },
  earthquake: {
    gaps: ["CHILD_ZONE_GEOMETRY", "MODE_SPECIFIC_RUNTIME"],
    note: "Zona madre, terreno difficile e reminder principali esistono; crepe e strutture non sono entità spaziali indipendenti con risoluzione atomica.",
  },
  "wall-of-fire": {
    gaps: ["HOT_SIDE_GEOMETRY", "CROSSING_DETECTION", "SLOT_SCALING"],
    note: "Il muro e i reminder base esistono; non sono rappresentati lato caldo, fascia di 3 m, attraversamento senza sosta e aumento dei danni per slot.",
  },
  "prismatic-wall": {
    gaps: ["LAYER_STATE_MACHINE", "CROSSING_DETECTION", "MULTI_SAVE_SEQUENCE"],
    note: "La sagoma base esiste, ma i sette strati, le distruzioni progressive, gli effetti per strato e le sequenze di TS non hanno uno stato dedicato.",
  },
  "reverse-gravity": {
    gaps: ["ENTRY_EXIT_FALL", "ZONE_TRIGGER_MISSING"],
    note: "La geometria non basta: servono salita, collisione, sospensione e caduta coordinata quando termina la spell.",
  },
  "storm-of-vengeance": {
    gaps: ["ROUND_STATE_MACHINE", "STATUS_MISSING", "MOVEMENT_MECHANICS_MISSING"],
    note: "L'area esiste, ma i round 1-10 cambiano danni, TS, Assordato, terreno difficile e oscuramento.",
  },
  "wind-wall": {
    gaps: ["PROJECTILE_BOUNDARY", "CROSSING_DETECTION"],
    note: "La sagoma esiste; mancano blocco selettivo di creature/oggetti, proiettili e forme gassose.",
  },
  "xanathar-turbine": {
    gaps: ["MOVABLE_ZONE_RUNTIME", "MULTI_SAVE_SEQUENCE", "ENTRY_EXIT_FALL"],
    note: "Servono zona mobile, doppio TS, trascinamento verticale, movimento con la zona, prova di fuga e caduta finale.",
  },
  "xanathar-trasmutare-roccia": {
    gaps: ["VARIANT_ZONE_RUNTIME", "MOVEMENT_MECHANICS_MISSING", "ZONE_TRIGGER_MISSING"],
    note: "Le due trasformazioni richiedono varianti distinte, costo 4x nel fango, TS al lancio/ingresso/fine turno e uscita o distruzione della roccia.",
  },
  "antilife-shell": {
    gaps: ["BOUNDARY_REJECTION", "CROSSING_DETECTION"],
    note: "L'aura segue il caster, ma il confine deve respingere categorie selettive e terminare se il caster forza un attraversamento.",
  },
  "phb2014-aura-di-vita": {
    gaps: ["AURA_PASSIVE_RUNTIME", "TURN_EFFECT_MISSING"],
    note: "Servono resistenza necrotica, protezione del massimo PF e recupero di 1 PF a inizio turno per creature non ostili a 0 PF.",
  },
  "phb2014-aura-di-vitalita": {
    gaps: ["AURA_HEAL_ACTION"],
    note: "L'aura deve delimitare i bersagli validi dell'azione bonus di cura da 2d6.",
  },
});

const CURATED_COMPLETE = Object.freeze({
  "bane": "Il workflow batch del TS Carisma, il limite di tre bersagli al 1° livello (+1 per slot superiore) e l'effetto -1d4 sui soli fallimenti sono dichiarati e operativi.",
  "bless": "La spell seleziona più creature ma non richiede loro un TS iniziale: i riferimenti ai tiri salvezza descrivono il bonus +1d4 già modellato.",
  "enhance-ability": "Il riferimento a Incapacitato è soltanto una condizione che disabilita il beneficio di Grazia del Gatto; le sei varianti e i loro effetti sono già modellati.",
  "phb2014-morte-apparente": "Accecato, Incapacitato, velocità 0 e resistenze sono già modellati; Avvelenato compare nel testo come effetto sospeso, non come condizione applicata.",
  "plane-shift": "La modalità con più creature riguarda soltanto bersagli consenzienti; il TS Carisma appartiene alla modalità offensiva contro un unico bersaglio e resta manuale.",
  "xanathar-immolazione": "Il TS iniziale è single-target e resta manuale; il runtime copre già l'effetto In Fiamme, il TS ricorrente di fine turno e la relativa conclusione.",
  "legacy-tashas-mind-whip": "Il workflow batch del TS Intelligenza, il limite di un bersaglio al 2° livello (+1 per slot superiore), il danno dimezzato ai successi e l'effetto di turno sui soli fallimenti sono dichiarati e operativi.",
  "chain-lightning": "Il workflow dedicato seleziona un primario entro 45 m dal caster e secondari distinti entro 9 m dal primario, scala il massimo con lo slot e rivalida le distanze alla conferma; ogni bersaglio mantiene il proprio esito del TS Destrezza e il riferimento da 9 m non crea una zona persistente. Gli oggetti restano una gestione manuale futura.",
  "freedom-of-movement": "Lo Speed Tracker applica le immunità selettive a terreno difficile e riduzioni magiche della velocità; le applicazioni magiche di Paralizzato e Trattenuto vengono rifiutate. Al turno del bersaglio un reminder propone di spendere 1,5 m per rimuovere una singola restrizione non magica Afferrato o Trattenuto e aggiorna il consumo quando il tracker è attivo; senza tracker resta una conferma manuale del costo RAW.",
  "command": "Il workflow batch del TS Saggezza scala da un bersaglio al 1° livello (+1 per slot superiore), conserva una sola scelta di comando per il cast, applica gli effetti ai soli fallimenti e attiva Prono di Supplica all'inizio del turno successivo, lasciandolo persistente; la pill tecnica scade alla fine di quel turno.",
  "call-lightning": "Il lancio crea una nube temporalesca persistente di raggio 18 m collegata alla concentrazione del caster e conserva la scarica iniziale da 1,5 m; il prompt per richiamare i fulmini appare all'inizio di ogni turno del caster, fuori dal pannello Spells, si chiude al cambio di turno e risolve TS Destrezza, danni e scaling dello slot in una transazione.",
  "xanathar-investitura-della-fiamma": "L'aura mobile di 1,5 m considera solo le creature ostili e produce reminder manuali da 1d10 fuoco all'ingresso e a fine turno con input danno e Conferma; il caster riceve la pill informativa di immunità al fuoco e resistenza al freddo. Dal turno successivo al lancio, la Linea di fuoco opzionale usa il popup dedicato con TS Destrezza e 4d8 fuoco.",
  "xanathar-sfera-della-tempesta": "Il trigger di TS e danni a fine turno resta invariato; l'azione bonus Fulmine usa il centro della zona come origine, rivalida 18 m e indica il vantaggio dentro la sfera.",
  "gust-of-wind": "La zona persistente e il TS a inizio turno restano invariati; il contratto dello Speed Tracker raddoppia soltanto la porzione di ogni segmento realmente percorsa verso il caster, usa la posizione corrente della sorgente, conserva il costo nel percorso per Undo e deduplica la stessa istanza. Geometria, membership, cambio direzione e lifecycle sono coperti dai test logici dedicati.",
  "banishment": "Il workflow batch del TS Carisma, il limite con slot superiori, il contesto dell'origine del piano, Incapacitato per i nativi del piano e la distinzione fra interruzione anticipata e scadenza naturale sono operativi; il ritorno o la permanenza fuori piano restano una gestione fisica manuale intenzionale.",
  "acid-arrow": "La risoluzione assistita Colpito/Mancato mostra il danno iniziale manuale, applica la metà sul mancato e crea sul colpito un solo reminder differito indipendente, con scaling 4d4/2d4 dal 2° livello e +1d4 per slot superiore; non viene creata una spell persistente né viene applicato danno automaticamente.",
  "xanathar-sfera-al-vetriolo": "Il TS fallito crea soltanto il reminder indipendente 5d4 danni da acido alla fine del prossimo turno; il notice precede la scadenza della condizione, il consumo è persistito per token e non viene applicato danno automaticamente.",
  "haste": "Alla terminazione ogni bersaglio riceve una conseguenza indipendente fino alla fine del proprio turno successivo, con pill semantica, velocità effettiva 0 m e testo che vieta movimento e azioni; la conseguenza non è figlia della spell rimossa.",
  "xanathar-trasformazione-di-tenser": "Alla terminazione il caster riceve un reminder immediato per TS Costituzione CD 15; il fallimento usa la riconciliazione canonica di Indebolimento e il reminder viene consumato in una transazione separata dalla terminazione.",
  forcecage: "Il workflow di zona offre Gabbia 4×4 e Box solida 2×2 e conserva la variante in ruleChoice; non duplica una pill tecnica sui token. Il TS Carisma per il teletrasporto resta manuale.",
  "moonbeam": "La zona mobile usa l'azione dichiarativa fino a 18 m, conserva la stessa root/istanza e non genera TS quando viene spostata sopra una creatura; ingresso e inizio turno restano trigger indipendenti.",
  "flaming-sphere": "La zona usa l'azione bonus fino a 9 m, rileva il primo contatto diretto lungo il percorso con arresto e un solo reminder, mentre la corona da 1,5 m continua a usare il TS di fine turno; dadi e scelta di eventuali ambiguità restano manuali.",
  "xanathar-spirito-guaritore": "La zona usa l'azione bonus fino a 9 m senza attivare cure durante il riposizionamento; ingresso autonomo e inizio turno producono reminder manuali di cura con scaling 1d6 per slot, esclusioni di Costrutti/Non Morti e consumo una tantum.",
  "xanathar-diavoletto-di-polvere": "La zona usa l'azione bonus fino a 9 m; il TS Forza a fine turno mostra il danno strutturato 1d8 con scaling e spinta solo sul fallimento. La scelta esplicita del terreno crea o sostituisce una nube di detriti da 3 m, oscuramento pesante e scadenza al turno successivo del caster.",
  "spiritual-weapon": "Effetti ad Area posiziona e conferma entro gittata una pedina magica persistente, poi liberamente trascinabile e collegata all'istanza. La scheda mostra movimento 6 m, portata 1,5 m, attacco 1d8 + modificatore e scaling dello slot; una mini-card subordinata del tracker indica l'azione bonus senza alterare l'ordine.",
  "arcane-sword": "Effetti ad Area posiziona e conferma entro gittata una pedina magica persistente collegata alla concentrazione. Movimento 6 m, portata 1,5 m e attacco ricorrente da 3d10 forza restano riferimenti da tabellone; terminazione e Undo includono la pedina.",
  "tasha-lama-del-disastro": "Effetti ad Area posiziona e conferma entro gittata una pedina persistente trascinabile con movimento 9 m e portata 1,5 m. La scheda espone i due attacchi da 4d12, il critico 18–20 da 12d12 e l'attraversamento delle barriere; la risoluzione dei tiri resta manuale.",
  "arcane-hand": "Effetti ad Area posiziona e conferma entro gittata la Mano come pedina persistente trascinabile con movimento 18 m, CA 20 e PF propri pari ai PF massimi del caster. Le quattro modalità, il bersaglio associato, lo scaling e gli aggiornamenti dei PF sono esposti nella scheda e inclusi in cronologia e Undo.",
});

const SIGNAL_PATTERNS = Object.freeze({
  area: [
    /\b(?:cono|cubo|cilindro|sfera|linea|muro|aura)\b/iu,
    /\b(?:raggio|diametro|lato) di \d/iu,
    /\bogni creatura (?:situata |presente )?(?:in|entro|sotto) (?:l['’])?area\b/iu,
  ],
  save: [/\btiro salvezza\b/iu],
  movement: [
    /\bterreno difficile\b/iu,
    /\bvelocità[^.]{0,90}(?:dimezz|ridott|aument|pari a|diventa|scende|sale|metri)\b/iu,
    /\b(?:non può|incapace di) muoversi\b/iu,
    /\bmovimento[^.]{0,90}(?:costa|spende|usa|raddoppi|quadruplic)\b/iu,
    /\b(?:camminare|volare|nuotare|scalare) (?:pari a|di) \d/iu,
  ],
  turn: [
    /\b(?:inizio|fine) (?:di |del |della )?(?:ogni |suo |proprio |tuo |un )?turno\b/iu,
    /\bturno successivo\b/iu,
    /\bper ogni round\b/iu,
    /\bround \d/iu,
  ],
  spatialTrigger: [
    /\b(?:entra|entri|ingresso|attraversa|attraversare|esce|uscire) (?:nel|nella|dall['’]|da quell['’]|in quell['’])?/iu,
    /\bprima volta (?:in un turno )?(?:in cui )?(?:entra|attraversa)\b/iu,
    /\btermina (?:il proprio |il suo )?turno (?:entro|in|nell['’])[^.]{0,60}\b(?:area|zona|muro|aura|nube|vortice|ragnatela)\b/iu,
  ],
  casterAction: [
    /\bl['’]incantatore può usare (?:la sua |un['’])?azione(?: bonus)?\b/iu,
    /\bcome azione bonus[^.]{0,100}l['’]incantatore\b/iu,
    /\bcon un['’]azione durante il suo turno\b/iu,
  ],
  nextAttack: [
    /\bprossim[oa] (?:attacco|colpo)\b/iu,
    /\bquando colpisce[^.]{0,100}(?:incantesimo|bersaglio)\b/iu,
  ],
  choice: [
    /\bsceglie uno de(?:i|gli) (?:seguenti )?effetti\b/iu,
    /\buna delle (?:opzioni|forme|modalità) seguenti\b/iu,
    /\bpuò scegliere (?:uno|una)\b/iu,
  ],
  lingering: [
    /\bfino (?:all['’]|al )?(?:inizio|fine) del turno successivo\b/iu,
    /\balla fine del suo turno successivo\b/iu,
    /\bper \d+ (?:round|minut|or[ae]|giorn)/iu,
  ],
  combat: [
    /\b(?:dann[oi]|punti ferita|attacco|tiro salvezza|classe armatura|cura|recupera)\b/iu,
  ],
});

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("it")
    .replace(/[’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function sentenceEvidence(text, patterns, limit = 2) {
  const sentences = String(text || "")
    .replace(/\r/g, "")
    .split(/(?<=[.!?])\s+|\n+/u)
    .map((entry) => entry.trim())
    .filter(Boolean);
  return sentences
    .filter((sentence) => patterns.some((pattern) => pattern.test(sentence)))
    .slice(0, limit)
    .map((sentence) => sentence.length > 260 ? `${sentence.slice(0, 257)}…` : sentence);
}

function hasSignal(text, name) {
  return SIGNAL_PATTERNS[name].some((pattern) => pattern.test(text));
}

function referenceMap() {
  return new Map([
    ...Object.values(referenceData.spells || {}).map((entry) => [entry.id, entry]),
    ...(supplementData.spells || []).map((entry) => [entry.id, entry]),
    ...(phb2014Data.spells || []).map((entry) => [entry.id, entry]),
  ]);
}

function sourceLabel(spell) {
  if (spell.source === "xanathar") return "Xanathar";
  if (spell.source === "tasha") return "Tasha";
  if (spell.source === "phb2014") return "PHB 2014";
  if (spell.source === "legacy") return "Legacy";
  return "SRD 5.1";
}

function conditionMentions(value) {
  const normalized = normalize(value);
  return CONDITIONS.filter((condition) => normalized.includes(normalize(condition)));
}

function appliedConditionMentions(text) {
  const sentences = String(text || "")
    .replace(/\r/g, "")
    .split(/(?<=[.!?])\s+|\n+/u)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const applied = [];
  for (const sentence of sentences) {
    const normalizedSentence = normalize(sentence);
    for (const condition of CONDITIONS) {
      const normalizedCondition = normalize(condition);
      if (!normalizedSentence.includes(normalizedCondition)) continue;
      if (
        normalizedSentence.includes(`e gia ${normalizedCondition}`)
        || normalizedSentence.includes(`era gia ${normalizedCondition}`)
        || normalizedSentence.includes(`se e ${normalizedCondition}`)
        || normalizedSentence.includes(`se era ${normalizedCondition}`)
      ) continue;
      if (/\be gia [^.]+vantaggio [^.]+tiro salvezza\b/u.test(normalizedSentence)) continue;
      if (/\b(?:non trae|non ottiene|non beneficia|non puo beneficiare)\b/u.test(normalizedSentence)) continue;
      if (/\bl'incantatore[^.]+incapacitat[^.]+(?:termina|termine)\b/u.test(normalizedSentence)) continue;
      if (/\b(?:immune|immunita|non puo essere|non e piu|rimuove|rimuovere|porre termine|protegge|resistenza|nessun beneficio|non ottiene)\b/u.test(normalizedSentence)) {
        continue;
      }
      const conditionIndex = normalizedSentence.indexOf(normalizedCondition);
      const prefix = normalizedSentence.slice(Math.max(0, conditionIndex - 120), conditionIndex);
      if (/\b(?:e gia|era gia|se e|se era)\s*$/u.test(prefix)) continue;
      if (/\bnon (?:e|diventa|rimane|resta|cade|viene)\b/u.test(prefix)) continue;
      if (/\b(?:diventa|rimane|resta|cade|viene|e|essere|soggett[oa] alla condizione)\b/u.test(prefix)) {
        applied.push(condition);
      }
    }
  }
  return unique(applied);
}

function collectImplementedConditions(spell, areaRules) {
  const values = [];
  const add = (value) => {
    if (Array.isArray(value)) value.forEach(add);
    else if (typeof value === "string") values.push(value);
  };
  add(spell.automation?.conditions);
  add(spell.automation?.choices);
  add(Object.keys(spell.automation?.conditionOptions || {}));
  for (const outcome of ["passed", "failed", "immune"]) {
    for (const rule of spell.saveAutomation?.[outcome] || []) add(rule.condition);
  }
  for (const choice of getSpellSaveWorkflowChoiceOptions(spell.id)) {
    for (const outcome of ["passed", "failed", "immune"]) {
      for (const rule of choice.automation?.[outcome] || []) add(rule.condition);
    }
  }
  const effects = [
    ...(spell.effects || []),
    ...(spell.effectChoices || []).flatMap((choice) => choice.effects || []),
    ...(spell.activeActions || []).flatMap((action) => action.effects || []),
  ];
  for (const effect of effects) add(effect.condition || effect.label);
  for (const rule of areaRules) {
    for (const effect of [
      ...(rule.effectPolicy?.effects || []),
      ...(rule.effectPolicy?.effect ? [rule.effectPolicy.effect] : []),
      ...(rule.zonePolicy?.membershipEffects || []),
    ]) add(effect.condition || effect.label);
    for (const trigger of [
      ...(rule.zonePolicy?.triggers || []),
      ...(rule.triggerPolicy?.triggers || []),
    ]) {
      add(trigger.failureCondition?.condition || trigger.failureCondition?.name);
      add(trigger.resolutionData?.failureCondition?.condition);
    }
  }
  return unique(values.flatMap(conditionMentions));
}

function objectHasKey(value, keys) {
  if (!value || typeof value !== "object") return false;
  for (const [key, child] of Object.entries(value)) {
    if (keys.has(key)) return true;
    if (objectHasKey(child, keys)) return true;
  }
  return false;
}

function hasTurnBoundary(value) {
  if (!value || typeof value !== "object") return false;
  if (["turn-start", "turn-end"].includes(value.mode)) return true;
  if (["turn-start", "turn-end"].includes(value.timing)) return true;
  return Object.values(value).some(hasTurnBoundary);
}

function areaTriggers(areaRules) {
  return areaRules.flatMap((rule) => [
    ...(rule.zonePolicy?.triggers || []),
    ...(rule.triggerPolicy?.triggers || []),
  ]);
}

function isInstantaneous(spell, reference) {
  return /istantane|instantaneous/iu.test(`${spell.duration || ""} ${reference?.duration || ""}`);
}

function isLongCastingTime(reference) {
  const value = normalize(reference?.castingTime);
  if (!value) return false;
  return !/^1 (?:azione|reazione)\b/u.test(value);
}

function isSummoning(spell, text) {
  const name = normalize(spell.displayName || spell.name);
  return /^(?:evoca|evocare|convoca|animare morti|animare oggetti|creare non morti|danza macabra|servitore|segugio fedele|trova famiglio)\b/u.test(name)
    || /\bevoca (?:una|un|fino a|sei|otto) creatur/u.test(normalize(text));
}

function hasRequiredSavingThrow(text) {
  const normalizedText = normalize(text);
  return /\b(?:deve|devono|dovra|dovranno) (?:effettuare|superare) (?:un |uno |dei |i )?tir[oi] salvezza\b/u.test(normalizedText)
    || /\beffettua(?:no)? (?:un |uno |dei |i )?tir[oi] salvezza su\b/u.test(normalizedText)
    || /\bse (?:lo |li )?(?:fallisce|falliscono|supera|superano),?[^.]{0,120}\b(?:dann[oi]|condizione|incantesimo)\b/u.test(normalizedText);
}

function inferSaveScope(spell, text, areaRules, affectsAreaTargets) {
  if (!hasRequiredSavingThrow(text)) return "—";
  if (spell.id === "plane-shift") return "singolo";
  if (affectsAreaTargets || areaRules.length > 0) return "area";

  const normalizedText = normalize(text);
  const multiTargetPatterns = [
    /\b(?:due|tre|quattro|cinque|sei|sette|otto|nove|dieci|\d+) (?:creature|bersagli)\b/u,
    /\b(?:creature|bersagli) (?:a sua scelta|scelt[ei]|influenzat[ei])\b/u,
    /\b(?:una creatura|un bersaglio) aggiuntiv[oa]\b/u,
    /\b(?:piu|varie|numerose) (?:creature|bersagli)\b/u,
  ];
  return multiTargetPatterns.some((pattern) => pattern.test(normalizedText))
    ? "multiplo"
    : "singolo";
}

function gap(code, evidence = []) {
  return {
    code,
    label: GAP_LABELS[code] || code,
    evidence: unique(evidence),
  };
}

function deriveSpellAudit(spell, reference, trackableIds) {
  const text = [reference?.description, reference?.higherLevels]
    .filter(Boolean)
    .join("\n\n")
    .trim();
  const normalizedText = normalize(text);
  const areaRules = getSpellAreaRules(spell.id);
  const triggers = areaTriggers(areaRules);
  const textConditions = appliedConditionMentions(text);
  const implementedConditions = collectImplementedConditions(spell, areaRules);
  const areaEvidence = sentenceEvidence(text, SIGNAL_PATTERNS.area);
  const saveEvidence = sentenceEvidence(text, SIGNAL_PATTERNS.save);
  const movementEvidence = sentenceEvidence(text, SIGNAL_PATTERNS.movement);
  const turnEvidence = sentenceEvidence(text, SIGNAL_PATTERNS.turn);
  const phaseEvidence = sentenceEvidence(text, [
    ...SIGNAL_PATTERNS.casterAction,
    ...SIGNAL_PATTERNS.nextAttack,
  ]);
  const choiceEvidence = sentenceEvidence(text, SIGNAL_PATTERNS.choice);
  const spatialEvidence = sentenceEvidence(text, SIGNAL_PATTERNS.spatialTrigger);
  const instantaneous = isInstantaneous(spell, reference);
  const areaName = /^(?:muro|aura|campo|zona|tempesta|turbine)\b/u.test(normalize(spell.displayName));
  const affectsAreaTargets = /\bogni creatura[^.]{0,120}(?:area|raggio|cono|cubo|cilindro|sfera|linea|muro|aura|nube)\b/iu.test(text)
    || /\bcreature?[^.]{0,90}(?:entra|attraversa|termina il proprio turno)\b/iu.test(text);
  const structuredArea = !!spell.area
    && (affectsAreaTargets || areaName || spell.targetMode === "area");
  const areaText = structuredArea
    || (spell.targetModeCandidate === "area" && (affectsAreaTargets || areaName))
    || (!!reference?.areaCandidate && (affectsAreaTargets || areaName));
  const saveText = hasSignal(text, "save");
  const saveScope = inferSaveScope(spell, text, areaRules, affectsAreaTargets);
  const batchSaveWorkflowRequired = saveScope === "area" || saveScope === "multiplo";
  const movementText = hasSignal(text, "movement");
  const turnText = hasSignal(text, "turn");
  const spatialTriggerText = hasSignal(text, "spatialTrigger");
  const actionablePhaseEvidence = phaseEvidence.filter((sentence) =>
    !/\b(?:far terminare|interrompere|congedare)\b/iu.test(sentence)
  );
  const casterActionText = actionablePhaseEvidence.length > 0;
  const nextAttackText = hasSignal(text, "nextAttack");
  const choiceText = hasSignal(text, "choice");
  const lingeringText = instantaneous && hasSignal(text, "lingering");
  const combatText = hasSignal(text, "combat") || textConditions.length > 0;
  const longCastingTime = isLongCastingTime(reference);
  const summoning = isSummoning(spell, text);
  const intentionallyManual = INTENTIONALLY_MANUAL_SPELL_IDS.has(spell.id);
  const curatedAuditExclusion = CURATED_AUDIT_EXCLUSION_SPELL_IDS.has(spell.id);
  const excluded = longCastingTime
    || summoning
    || intentionallyManual
    || curatedAuditExclusion;
  const spatialPersistenceText = !instantaneous && areaText && (
    spatialTriggerText
    || /\b(?:muro|aura|zona|nube|turbine)[^.]{0,160}(?:permane|rimane|si muove|per la durata|finche l'incantesimo non termina)\b/iu.test(normalizedText)
    || /\bnell'?area[^.]{0,120}(?:per la durata|finche l'incantesimo non termina)\b/iu.test(normalizedText)
  );
  const persistentText = !instantaneous && (spatialPersistenceText || movementText || turnText);

  const persistentArea = areaRules.some((rule) =>
    ["zone", "aura"].includes(rule.kind)
    && rule.lifecycle?.persistence === "spell"
  );
  const saveWorkflowRule = getSpellSaveWorkflowRule(spell.id);
  const saveImplemented = !!spell.saveAutomation
    || !!spell.automation
    || !!saveWorkflowRule
    || areaRules.some((rule) => rule.targeting?.confirmTargets === true)
    || triggers.some((trigger) => trigger.resolution === "manual-save")
    || objectHasKey(spell.activeActions, new Set(["savingThrow"]))
    || ((spell.activeActions || []).length > 0 && saveText);
  const movementImplemented = !!spell.boardToken
    || EXTERNAL_MOVEMENT_SPELL_IDS.has(spell.id) || objectHasKey({
    effects: spell.effects,
    effectChoices: spell.effectChoices,
    actions: spell.activeActions,
    areaRules,
  }, new Set(["movement", "forcedMovement", "speed", "speedModes", "costMultiplier"]));
  const turnImplemented = triggers.some((trigger) =>
    ["turn-start", "turn-end"].includes(trigger.event)
  ) || objectHasKey({
    effects: spell.effects,
    effectChoices: spell.effectChoices,
    activeActions: spell.activeActions,
    saveAutomation: spell.saveAutomation,
  }, new Set(["saveReminder", "ongoingDamage"]))
    || hasTurnBoundary({
      expiry: spell.expiry,
      effects: spell.effects,
      effectChoices: spell.effectChoices,
      activeActions: spell.activeActions,
      saveAutomation: spell.saveAutomation,
    })
    || ["turn-start", "turn-end"].includes(spell.expiry?.mode);
  const phaseOptions = getSpellCastPhaseOptions(spell);
  const phaseImplemented = phaseOptions.length > 0
    || (spell.activeActions || []).length > 0
    || areaRules.some((rule) => rule.trigger?.type === "active-action");
  const choiceImplemented = (spell.effectChoices || []).length > 0
    || getAreaSaveRuleChoices(spell).length > 0
    || getSpellSaveWorkflowChoiceOptions(saveWorkflowRule).length > 0
    || (spell.activeActions || []).length > 1;
  const statusImplemented = textConditions.length === 0
    || textConditions.every((condition) => implementedConditions.includes(condition));
  const trackingImplemented = trackableIds.has(spell.id);

  const curated = CURATED_REVIEW[spell.id] || null;
  const curatedComplete = CURATED_COMPLETE[spell.id] || "";
  const gaps = [];
  if (!text) gaps.push(gap("TEXT_MISSING"));
  if (!curated && !curatedComplete && text && !excluded) {
    if (!instantaneous && combatText && !trackingImplemented && !persistentArea) {
      gaps.push(gap("TRACKING_MISSING", turnEvidence));
    }
    if (areaText && combatText && !areaRules.length) {
      gaps.push(gap("AREA_GEOMETRY_MISSING", areaEvidence));
    }
    if (spatialPersistenceText && areaRules.length && !persistentArea) {
      gaps.push(gap("AREA_LIFECYCLE_MISSING", areaEvidence));
    }
    const membershipImplemented = areaRules.some((rule) =>
      (rule.zonePolicy?.membershipEffects || []).length
      || rule.effectPolicy?.mode === "while-inside"
    );
    if (
      combatText
      && spatialPersistenceText
      && (spatialTriggerText || turnText)
      && persistentArea
      && !triggers.length
      && !membershipImplemented
    ) {
      gaps.push(gap("ZONE_TRIGGER_MISSING", [...spatialEvidence, ...turnEvidence]));
    }
    if (
      saveText
      && batchSaveWorkflowRequired
      && (areaText || textConditions.length || lingeringText || saveScope === "multiplo")
      && !saveImplemented
    ) {
      gaps.push(gap("SAVE_WORKFLOW_MISSING", saveEvidence));
    }
    if (textConditions.length && !statusImplemented) {
      const missing = textConditions.filter((name) => !implementedConditions.includes(name));
      gaps.push(gap("STATUS_MISSING", [`Condizioni non rappresentate: ${missing.join(", ")}`]));
    }
    if (movementText && !instantaneous && !movementImplemented) {
      gaps.push(gap("MOVEMENT_MECHANICS_MISSING", movementEvidence));
    }
    const consequentialTurnEvidence = turnEvidence.filter((sentence) =>
      /\b(?:subisce|recupera|tiro salvezza|diventa|rimane|termina|non può|può usare|dann[oi])\b/iu.test(sentence)
    );
    if (consequentialTurnEvidence.length && (persistentText || lingeringText) && !turnImplemented) {
      gaps.push(gap("TURN_EFFECT_MISSING", consequentialTurnEvidence));
    }
    if (combatText && (casterActionText || nextAttackText) && !phaseImplemented) {
      gaps.push(gap("ACTIVE_PHASE_MISSING", phaseEvidence));
    }
    if (choiceText && (areaText || casterActionText) && !choiceImplemented) {
      gaps.push(gap("CHOICE_WORKFLOW_MISSING", choiceEvidence));
    }
    if (
      combatText
      && lingeringText
      && !trackingImplemented
      && !saveImplemented
      && !(spell.effects || []).length
    ) {
      gaps.push(gap("LINGERING_EFFECT_MISSING", turnEvidence));
    }
  }
  if (curated) {
    gaps.push(...curated.gaps.map((code) => gap(code, sentenceEvidence(text, [
      ...SIGNAL_PATTERNS.area,
      ...SIGNAL_PATTERNS.turn,
      ...SIGNAL_PATTERNS.movement,
      ...SIGNAL_PATTERNS.casterAction,
    ], 3))));
  }

  let priority = "—";
  if (curated) priority = "P1";
  else if (gaps.some((entry) => entry.code === "TEXT_MISSING")) priority = "P2";
  else if (gaps.some((entry) => [
    "LINGERING_EFFECT_MISSING",
    "ZONE_TRIGGER_MISSING",
  ].includes(entry.code))) priority = "P2";
  else if (gaps.length) priority = "P3";

  let assessment = "coperto";
  if (excluded) assessment = longCastingTime
    ? "escluso: casting time"
    : summoning
      ? "escluso: evocazione"
      : curatedAuditExclusion
        ? "escluso: decisione curata"
        : "manuale intenzionale";
  else if (!text) assessment = "revisione: testo mancante";
  else if (gaps.length) assessment = curated ? "parziale: revisione curata" : "revisione testuale";
  else if (instantaneous && !combatText && !trackingImplemented) assessment = "riferimento/utilità";
  else if (instantaneous && combatText && !areaText && !lingeringText) assessment = "istantaneo: gestione manuale";

  const signals = unique([
    areaText && "area",
    saveText && (saveScope === "—" ? "riferimento TS" : `TS:${saveScope}`),
    textConditions.length && `status:${textConditions.join("/")}`,
    movementText && "movimento",
    turnText && "turni",
    spatialTriggerText && "ingresso/attraversamento",
    (casterActionText || nextAttackText) && "fasi/azioni",
    choiceText && "varianti",
    lingeringText && "effetto istantaneo persistente",
  ]);
  const coverage = unique([
    trackingImplemented && "tracking",
    areaRules.length && `aree:${areaRules.map((rule) => rule.kind).join("/")}`,
    persistentArea && "lifecycle",
    saveImplemented && "TS",
    implementedConditions.length && `status:${implementedConditions.join("/")}`,
    movementImplemented && "movimento",
    spell.boardToken && "pedina magica",
    turnImplemented && "turni",
    phaseImplemented && "fasi/azioni",
    choiceImplemented && "varianti",
  ]);

  return {
    id: spell.id,
    name: spell.displayName || spell.name,
    source: sourceLabel(spell),
    level: Number(spell.level) || 0,
    castingTime: reference?.castingTime || "",
    duration: reference?.duration || spell.duration || "",
    textAvailable: !!text,
    saveScope,
    inAuditScope: !excluded,
    exclusionReason: longCastingTime
      ? "casting time maggiore di 1 azione"
      : summoning
        ? "evocazione fuori dal runtime operativo"
        : curatedAuditExclusion
          ? "esclusione curata dal perimetro operativo"
        : intentionallyManual
          ? "gestione manuale intenzionale"
          : "",
    reviewBasis: (curated || curatedComplete) ? "curata sul testo RAW" : "screening testuale conservativo",
    scope: excluded
      ? (longCastingTime
        ? "fuori perimetro: casting time"
        : summoning
          ? "evocazione"
          : curatedAuditExclusion
            ? "fuori perimetro: decisione curata"
            : "manuale")
      : (combatText ? "combattimento" : "utilità/riferimento"),
    signals,
    coverage,
    assessment,
    priority,
    gaps,
    conditions: {
      raw: textConditions,
      implemented: implementedConditions,
    },
    runtime: {
      trackable: trackingImplemented,
      areaRuleIds: areaRules.map((rule) => rule.id),
      areaKinds: unique(areaRules.map((rule) => rule.kind)),
      triggerIds: triggers.map((trigger) => trigger.id),
      saveAutomation: saveImplemented,
      batchSaveWorkflowRequired,
      effectCount: (spell.effects || []).length
        + (spell.effectChoices || []).reduce((sum, choice) => sum + (choice.effects || []).length, 0),
      activeActionIds: (spell.activeActions || []).map((action) => action.id),
      phaseOptions: phaseOptions.map((option) => option.value),
      movementMechanics: movementImplemented,
      ...(spell.boardToken ? { boardToken: true } : {}),
    },
    evidence: {
      area: areaEvidence,
      save: saveEvidence,
      movement: movementEvidence,
      turn: turnEvidence,
      phase: phaseEvidence,
      choice: choiceEvidence,
      spatial: spatialEvidence,
    },
    curatedNote: curated?.note || curatedComplete,
  };
}

function countBy(rows, read) {
  const counts = {};
  for (const row of rows) {
    const key = String(read(row) || "—");
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b, "it")));
}

export function buildSpellAutomationAudit() {
  const references = referenceMap();
  const trackableIds = new Set(getTrackableSpellOptions().map((entry) => entry.id));
  const allRows = getSpellCatalog()
    .map((spell) => deriveSpellAudit(
      spell,
      references.get(spell.id) || spell.italianReference || null,
      trackableIds,
    ))
    .sort((a, b) => a.name.localeCompare(b.name, "it") || a.id.localeCompare(b.id));
  const rows = allRows.filter((row) => row.inAuditScope);
  const excludedRows = allRows.filter((row) => !row.inAuditScope);
  const openRows = rows.filter((row) => row.gaps.length);
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ rows, excluded: excludedRows.map((row) => [row.id, row.exclusionReason]) }))
    .digest("hex")
    .slice(0, 16);
  return {
    schemaVersion: 3,
    ruleset: "D&D 5e 2014",
    methodology: "Confronto deterministico tra testi regolamentari locali e contratti runtime per spell lanciabili con 1 azione, 1 azione bonus o 1 reazione; i P1 sono revisionati manualmente sul testo RAW. Il TS iniziale single-target resta manuale e non costituisce una lacuna batch.",
    fingerprint,
    summary: {
      catalogTotal: allRows.length,
      catalog: rows.length,
      textsAvailable: rows.filter((row) => row.textAvailable).length,
      excluded: excludedRows.length,
      excludedByReason: countBy(excludedRows, (row) => row.exclusionReason),
      trackable: rows.filter((row) => row.runtime.trackable).length,
      withAreaRules: rows.filter((row) => row.runtime.areaRuleIds.length).length,
      openRows: openRows.length,
      confirmed: rows.filter((row) => row.priority === "P1").length,
      highConfidence: rows.filter((row) => row.priority === "P2").length,
      reviewCandidates: rows.filter((row) => row.priority === "P3").length,
      curatedP1: rows.filter((row) => row.priority === "P1").length,
      manuallyReviewed: rows.filter((row) => row.reviewBasis === "curata sul testo RAW").length,
      byPriority: countBy(rows, (row) => row.priority),
      byAssessment: countBy(rows, (row) => row.assessment),
      bySaveScope: countBy(rows, (row) => row.saveScope),
      byGap: countBy(openRows.flatMap((row) => row.gaps), (entry) => entry.code),
    },
    rows,
    excluded: excludedRows.map((row) => ({
      id: row.id,
      name: row.name,
      source: row.source,
      castingTime: row.castingTime,
      reason: row.exclusionReason,
    })),
  };
}

function mdCell(value) {
  return String(value || "—").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function renderCountTable(values) {
  return [
    "| Stato | Totale |",
    "| --- | ---: |",
    ...Object.entries(values).map(([key, count]) => `| ${mdCell(key)} | ${count} |`),
  ].join("\n");
}

function renderPrioritySection(audit, priority, title) {
  const rows = audit.rows.filter((row) => row.priority === priority);
  const lines = [`## ${title}`, ""];
  if (!rows.length) return [...lines, "Nessuna voce.", ""].join("\n");
  lines.push("| Incantesimo | Fonte | Lacune | Evidenza/valutazione |", "| --- | --- | --- | --- |");
  for (const row of rows) {
    const evidence = row.curatedNote
      || row.gaps.flatMap((entry) => entry.evidence).slice(0, 2).join(" ")
      || "Segnalazione strutturale senza estratto testuale breve.";
    lines.push(`| ${mdCell(row.name)} | ${mdCell(row.source)} | ${mdCell(row.gaps.map((entry) => entry.label).join("; "))} | ${mdCell(evidence)} |`);
  }
  lines.push("");
  return lines.join("\n");
}

export function renderSpellAutomationMarkdown(audit) {
  const lines = [
    "# Audit automazione incantesimi",
    "",
    "> **Audit generato e operativo.** Non descrive soltanto la presenza nel catalogo:",
    "> confronta il testo regolamentare locale con tracking, aree, lifecycle, TS,",
    "> condizioni, movimento, trigger di turno, azioni e fasi effettivamente dichiarati",
    "> nel runtime. Rigenerare con `npm run audit:spells` dopo modifiche al catalogo.",
    "",
    "## Metodo e limiti",
    "",
    `- Catalogo sorgente: **${audit.summary.catalogTotal}** definizioni; perimetro operativo: **${audit.summary.catalog}**; testi disponibili nel perimetro: **${audit.summary.textsAvailable}**.`,
    `- Fuori perimetro: **${audit.summary.excluded}** definizioni. Sono escluse a priori le spell con casting time maggiore di 1 azione e le esclusioni curate dal perimetro operativo.`,
    `- Definizioni tracciabili: **${audit.summary.trackable}**; definizioni con almeno una regola di area: **${audit.summary.withAreaRules}**.`,
    `- Casi revisionati manualmente sul testo RAW: **${audit.summary.manuallyReviewed}**; lacune confermate P1: **${audit.summary.curatedP1}**.`,
    `- Impronta deterministica dello snapshot: \`${audit.fingerprint}\`.`,
    "- P1 indica una lacuna confermata; P2 una discrepanza testuale ad alta confidenza; P3 una candidata da validare prima di modificare il runtime.",
    "- Il TS iniziale di una spell puramente single-target resta manuale e non è una lacuna; il workflow TS è richiesto per aree, bersagli multipli e progressioni di slot multi-target.",
    "- I tiri fisici e gli altri effetti dichiaratamente manuali non sono considerati bug se esiste il workflow/reminder corretto.",
    "- Evocazioni, gestioni intenzionalmente manuali ed esclusioni curate restano fuori dal runtime operativo; sono elencate soltanto nella sezione `excluded` del JSON.",
    "",
    "### Esclusioni dal perimetro",
    "",
    renderCountTable(audit.summary.excludedByReason),
    "",
    "### Distribuzione delle valutazioni",
    "",
    renderCountTable(audit.summary.byAssessment),
    "",
    "### Distribuzione delle priorità",
    "",
    renderCountTable(audit.summary.byPriority),
    "",
    "### Ambito dei tiri salvezza",
    "",
    renderCountTable(audit.summary.bySaveScope),
    "",
    renderPrioritySection(audit, "P1", "P1 — lacune confermate sul testo RAW"),
    renderPrioritySection(audit, "P2", "P2 — discrepanze ad alta confidenza"),
    renderPrioritySection(audit, "P3", "P3 — candidate da revisionare"),
    "## Matrice completa",
    "",
    "La colonna **Segnali RAW** deriva dal testo; **Copertura runtime** deriva esclusivamente dai dati e dalle regole effettivamente importate dal plugin.",
    "",
    "| Incantesimo | ID | Fonte/Liv. | Ambito | Ambito TS | Segnali RAW | Copertura runtime | Valutazione | Priorità | Lacune |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const row of audit.rows) {
    lines.push(`| ${mdCell(row.name)} | \`${mdCell(row.id)}\` | ${mdCell(`${row.source} / ${row.level}`)} | ${mdCell(row.scope)} | ${mdCell(row.saveScope)} | ${mdCell(row.signals.join(", "))} | ${mdCell(row.coverage.join(", "))} | ${mdCell(row.assessment)} | ${row.priority} | ${mdCell(row.gaps.map((entry) => entry.label).join("; "))} |`);
  }
  lines.push(
    "",
    "## Dati macchina",
    "",
    "La versione completa con condizioni rilevate, ID delle regole, trigger ed estratti di evidenza è in `data/spell-automation-audit.json`.",
    "",
  );
  return lines.join("\n");
}

export async function writeSpellAutomationAudit() {
  const audit = buildSpellAutomationAudit();
  await fs.mkdir(path.dirname(JSON_OUTPUT), { recursive: true });
  await fs.writeFile(JSON_OUTPUT, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
  await fs.writeFile(MARKDOWN_OUTPUT, `${renderSpellAutomationMarkdown(audit)}\n`, "utf8");
  return audit;
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const audit = await writeSpellAutomationAudit();
  console.log(JSON.stringify({
    catalog: audit.summary.catalog,
    catalogTotal: audit.summary.catalogTotal,
    excluded: audit.summary.excluded,
    textsAvailable: audit.summary.textsAvailable,
    openRows: audit.summary.openRows,
    confirmed: audit.summary.confirmed,
    curatedP1: audit.summary.curatedP1,
    manuallyReviewed: audit.summary.manuallyReviewed,
    fingerprint: audit.fingerprint,
    markdown: path.relative(ROOT, MARKDOWN_OUTPUT),
    json: path.relative(ROOT, JSON_OUTPUT),
  }));
}
