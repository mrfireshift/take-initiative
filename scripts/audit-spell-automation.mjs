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
import { ID } from "../src/constants.js";
import {
  buildSpellApplicationIntent,
  buildSpellApplicationPlan,
} from "../src/spellApplicationPlanCore.js";
import { getSpellOverviewActions } from "../src/spellActiveActionCore.js";
import { getSpellAreaRules } from "../src/spellAreaRules.js";
import { getSpellCastPhaseOptions } from "../src/spellCastPhaseCore.js";
import { callLightningTurnPromptPayloads } from "../src/callLightningTurnPromptCore.js";
import {
  getSpellSaveWorkflowChoiceOptions,
  getSpellSaveWorkflowRule,
} from "../src/spellSaveWorkflowRules.js";
import { SPELL_STATIC_ZONE_META_KEY } from "../src/spellStaticZoneCore.js";
import {
  buildSpellUnifiedAreaCommand,
  getSpellUnifiedAreaEligibility,
} from "../src/spellUnifiedAreaAdapter.js";
import {
  buildSpellUnifiedLifecycleRequest,
  getSpellUnifiedLifecycleEligibility,
} from "../src/spellUnifiedLifecycleAdapter.js";
import {
  buildSpellUnifiedPanelContract,
  createSpellPanelSession,
  getSpellUnifiedActiveActionDeclarations,
} from "../src/spellUnifiedPanelCore.js";
import { buildSpellUnifiedCatalogEntries } from "../src/spellUnifiedPanelCatalogCore.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const JSON_OUTPUT = path.join(ROOT, "data", "spell-automation-audit.json");
const MARKDOWN_OUTPUT = path.join(ROOT, "docs", "AUDIT_AUTOMAZIONE_INCANTESIMI.md");
const META_KEY = `${ID}/meta`;
const SPELLS_KEY = `${ID}/spells`;

const INTEGRATION_ISSUE_LABELS = Object.freeze({
  UNIFIED_CATALOG_MISSING: "incantesimo non esposto nella console unificata",
  CONTRACT_MISSING: "contratto della console unificata non costruibile",
  CAST_PATH_INVALID: "nessun percorso di cast valido nella console unificata",
  CAST_NO_MUTATIONS: "il cast non produce alcuna mutazione significativa",
  PERSISTENCE_UNDECLARED: "l'azione successiva richiede un'istanza che il cast non dichiara persistente",
  ACTIVE_ACTION_UNREACHABLE: "azione successiva dichiarata ma non raggiungibile dalla UI",
  ACTIVE_ACTION_REMINDER_ONLY: "azioni raggiungibili soltanto tramite reminder, senza fallback nella scheda attiva",
});

const AUTOMATION_LEVELS = Object.freeze(["FULL", "PARTIAL", "TRACK_ONLY", "MANUAL"]);
const COVERAGE_STATUSES = Object.freeze(["ACCEPTED", "GAP", "UNREVIEWED"]);
const TARGET_AUTOMATION_LEVELS = Object.freeze(["FULL", "PARTIAL", "TRACK_ONLY", "MANUAL", "UNREVIEWED"]);
const UI_EXPOSURES = Object.freeze(["UNIFIED", "TRACKER_ONLY", "REFERENCE_ONLY", "NONE"]);
const TARGET_UI_EXPOSURES = Object.freeze(["UNIFIED", "TRACKER_ONLY", "REFERENCE_ONLY", "NONE", "UNREVIEWED"]);
const SMOKE_CATEGORIES = Object.freeze(["CAST", "CONCENTRATION", "AREA_GEOMETRY", "PERSISTENCE", "TURN_TRIGGER", "ACTIVE_ACTION", "CLEANUP"]);
const VERIFICATION_EVIDENCE = Object.freeze(["STRUCTURAL", "UNIT_TEST", "RUNTIME_SMOKE"]);

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
    gaps: [],
    note: "La manipolazione libera e il congelamento/animazione dell'acqua hanno gestione ambientale manuale al tavolo; l'assenza di automazione o geometria dedicata non costituisce un RAW gap del tracker.",
  },
  "xanathar-modellare-terra": {
    gaps: [],
    note: "Le modalità del cubo di terra e la gestione del terreno difficile/normale hanno gestione ambientale manuale al tavolo; l'assenza di automazione non costituisce un RAW gap del tracker.",
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
  "holy-aura": {
    gaps: ["CONDITIONAL_TRIGGER", "STATUS_MISSING"],
    note: "Ogni colpo in mischia di immondo o non morto contro un protetto innesca un TS Costituzione che può applicare Accecato fino al termine della spell.",
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
    gaps: [],
    note: "Le quattro azioni sono esposte, ma la massa controllata e il vortice richiedono geometrie distinte; trascinamento, onda ricorrente e prove di uscita non sono completi.",
  },
  earthquake: {
    gaps: [],
    note: "Zona madre, terreno difficile e reminder principali esistono; crepe e strutture non sono entità spaziali indipendenti con risoluzione atomica.",
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
  "xanathar-anatema-elementale": "PASS: il workflow batch del TS Costituzione, la scelta condivisa del tipo, il limite con slot superiori e la validazione pairwise entro 9 m sono operativi. Il danno aggiuntivo e la rimozione della resistenza restano manuali per scelta di perimetro: il plugin non dispone degli strumenti per automatizzarli.",
  "wall-of-fire": "PASS: il placement obbligatorio espone muro lineare o circolare ad anello e conserva il lato caldo scelto; il corpo, la fascia adiacente di 3 m e l'attraversamento continuo alimentano trigger distinti con deduplicazione una-volta-per-turno. Il danno iniziale e persistente usa input manuale con scaling 5d8 +1d8 per slot sopra il 4°; il plugin non automatizza il tiro o l'applicazione dei danni.",
  "incendiary-cloud": "PASS: il placement obbligatorio crea la zona statica della nube e il workflow condiviso copre TS iniziale, 10d8 fuoco con metà al successo, ingresso, fine turno, scaling dello slot, fan-out indipendente per bersaglio, reminder resolution, membership, mutation e cleanup di concentrazione. Il movimento della nube resta manuale RAW: non esistono prompt di turn-start, drift automatico o swept-area trigger; il movimento della creatura dentro la nube continua a usare il trigger di ingresso.",
  "xanathar-arma-sacra": "PASS: il cast persistente e il congedo dell'arma sono esposti nel popup condiviso al turno del caster e restano disponibili nel pannello Incantesimi come fallback; l'esplosione mantiene il placement previsto dalla situazione dell'arma, risolve TS Costituzione e 4d8 radiosi con metà al successo. Il fallimento applica Accecato come Condition nativa con durata di 1 minuto e TS Costituzione a fine turno, indipendente dalla concentrazione; fan-out, reminder resolution e cleanup restano sul workflow shared.",
  "xanathar-controllare-venti": "PASS: la zona persistente espone nel popup del turno del caster le quattro modalità RAW (Folate, Corrente Discendente, Corrente Ascendente, Sospendi), con il pannello Incantesimi come fallback. Le pill membership sintetiche si aggiornano immediatamente al cambio di modalità; Corrente Discendente limita il reminder TS Forza alle creature con velocità di volo effettiva. Reconcile membership, trigger di ingresso/inizio turno, cleanup, reload e assenza di swept-area trigger sul cambio modalità usano i contratti shared.",
  "eyebite": "PASS: il cast persistente e il popup condiviso del turno del caster espongono le quattro scelte RAW; ogni bersaglio mantiene il proprio esito del TS Saggezza e un bersaglio che supera il tiro viene escluso da questa istanza. Privo di sensi, Spaventato e Nauseato usano gli effetti e i reminder shared con cleanup legato alla concentrazione, mentre il pannello resta il fallback operativo.",
  "confusion": "PASS: il workflow area-save multi-target, lo scaling della geometria, gli esiti indipendenti, l'effetto persistente per bersaglio e il cleanup target-scoped/concentrazione sono auditati e approvati. La tabella RAW d10 (movimento/direzione casuali, nessun movimento o azione, attacco in mischia casuale, oppure turno normale) è rappresentata nel detail e nel reminder turn-start come tiro fisico manuale: nessun dice roller, action enforcement o automazione del risultato; il TS Saggezza resta il reminder di fine turno.",
  "slow": "PASS: il workflow area-save multi-target, il limite massimo di 6 bersagli, gli esiti indipendenti, la singola condizione persistente e il cleanup target-scoped/concentrazione sono auditati e approvati. Velocità dimezzata, CA -2, TS Destrezza -2, niente reazioni e vincolo azione o bonus action sono visibili nelle summary pills; il limite di un attacco e la regola del lancio da 1 azione con d20/ritardo al turno successivo restano nel detail, senza action-economy enforcement, attack limiter o spell interception.",
  "fear": "PASS: il cono di 9 m, il targeting area multi-target, gli esiti indipendenti e il TS Saggezza iniziale sono auditati e approvati. Il fallimento applica Spaventato e forced-flight alla stessa parent spell target-scoped; il reminder turn-start ricorda Scatto e allontanamento dal caster lungo il percorso più sicuro, mentre il drop iniziale e la verifica di linea di vista restano manuali/informativi. Il TS Saggezza ricorrente vale solo se il caster non è in vista; successo, concentrazione e cleanup preservano l'identità per bersaglio, senza inventory/drop system, movimento, pathfinding o motore LOS.",
  "flesh-to-stone": "PASS: il cast single-target entro 18 m applica Trattenuto soltanto al fallimento del TS Costituzione iniziale e mostra subito il contatore S 0/3 · F 1/3 sulla stessa condition. Il TS Costituzione di fine turno aggiorna contatori indipendenti; tre successi rimuovono l'istanza e il parent target-scoped, mentre tre fallimenti terminano i reminder e sostituiscono Trattenuto con la sola condition canonica Pietrificato, che diventa permanente alla concentrazione mantenuta. Il lifecycle di concentrazione, cleanup e Undo restano identity-based e il primo tiro per colpire/save viene risolto al tavolo.",
  "contagion": "PASS: il cast single-target a Contatto confermato dopo il colpo applica una malattia obbligatoria fra le sei opzioni RAW, con durata di 7 giorni senza concentrazione. Ogni bersaglio conserva sulla stessa disease instance la progressione S/F non consecutiva e il reminder TS Costituzione di fine turno; tre successi rimuovono malattia, child effects e parent, mentre tre fallimenti stabilizzano l'effetto e interrompono i TS successivi. I descriptor delle malattie, le conditions canoniche Accecato/Stordito e il trigger danno→Stordito riusano primitive shared; tiro per colpire e dadi restano manuali al tavolo.",
  "xanathar-parola-radiosa": "PASS: il workflow area-save multi-target, danno e scaling, fan-out indipendente e reminder resolution sono auditati e approvati. Resta soltanto un follow-up visuale non bloccante: assegnare all'area il tema colore radiant della spell.",
  "phb2014-nube-di-pugnali": "PASS: la zona statica persistente, i trigger di ingresso e inizio turno, i danni 4d4 con scaling dello slot, il fan-out per bersaglio, la resolution manuale dell'effetto, membership e cleanup sono auditati e approvati.",
  "stinking-cloud": "PASS: la zona statica persistente, il TS Costituzione a inizio turno, la conseguenza di azione persa, il reminder per bersaglio, membership e cleanup di concentrazione sono auditati e approvati.",
  "web": "PASS: il punto entro 18 m crea una zona statica quadrata di 6 m per concentrazione fino a 1 ora; il cast non risolve un TS iniziale. Terreno difficile e membership persistente sono riconciliati; l'ingresso durante il proprio turno e l'inizio del proprio turno usano trigger distinti, una volta per turno, con TS Destrezza ed esiti indipendenti per bersaglio. Il fallimento applica Trattenuto, mentre la prova di Forza come azione e l'uscita dalla zona rimuovono la condizione collegata. Reconcile/reload e cleanup chiudono la zona e i legami senza stato stale.",
  "xanathar-fulgore-nauseante": "PASS: la zona statica di raggio 9 m resta in concentrazione fino a 10 minuti e non risolve un TS iniziale. Entrata e inizio del turno usano TS Costituzione una volta per turno; il successo non crea azioni persistenti né danno, mentre il fallimento compone 4d10 radiosi, una contribution separata di Indebolimento e l'effetto di luce/anti-invisibilità dalla save automation RAW. Ogni effetto è legato alla specifica spell instance con expiry di concentrazione; il cleanup esistente rimuove soltanto i livelli e l'effetto prodotti da quella istanza. La composizione passa dal contratto generico `failureAutomation: \"spell-save\"` e non interpreta `failureEffect` testuale. Evidenza: `test/sickeningRadianceZoneComposition.test.js`, suite mirata 156/156 e build Vite riuscita.",
  "control-water": "La massa controllata resta una sola zona madre di 30 m legata alla concentrazione. Vortice usa una sottozona circolare fissa da 7,5 m, con contenimento rivalidato e reminder TS Forza 2d8; Inondazione conserva il reminder dell'onda sul turno del caster, mentre Deviare corrente e Separare le acque cambiano modalitÃ  e rimuovono il vortice senza inventare condizioni o movimento automatico.",
  earthquake: "La zona madre di 30 m conserva terreno difficile, TS e reminder delle strutture. Al primo turno successivo del caster il popup chiede da 1 a 6 fessure consecutive, ciascuna larga 3 m e avviata da un punto qualsiasi del bordo della root con orientamento libero; la geometria viene ritagliata alle sole caselle interne, i bersagli vengono deduplicati, il TS Destrezza Ã¨ raccolto una sola volta e il fallimento usa soltanto l'effetto semantico Caduto nella fessura, lasciando profonditÃ , quota e crolli manuali.",
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
  "xanathar-investitura-della-fiamma": "L'aura mobile di 1,5 m include tutte le creature nell'area tranne il caster, compresi gli alleati, e produce reminder manuali da 1d10 fuoco all'ingresso e a fine turno con input danno e Conferma; il caster riceve la pill informativa di immunità al fuoco e resistenza al freddo. Dal turno successivo al lancio, la Linea di fuoco opzionale usa il popup dedicato con TS Destrezza e 4d8 fuoco.",
  "xanathar-sfera-della-tempesta": "Il trigger di TS e danni a fine turno resta invariato; l'azione bonus Fulmine usa il centro della zona come origine, rivalida 18 m e indica il vantaggio dentro la sfera.",
  "heat-metal": "PASS: il cast applica sempre il danno pieno e crea subito il reminder condiviso per la decisione di lasciare cadere l'oggetto; solo l'esito \"Non può / non lascia\" apre il TS Costituzione e soltanto il fallimento applica Svant. attacchi e prove fino all'inizio del prossimo turno del caster. Il repeat usa una sola active action `heat-metal-repeat`, azione bonus, dal turno successivo al lancio, con target collegato, box del danno, scaling 2d8 +1d8 per slot sopra il 2° e workflow Undo condiviso.",
  "gust-of-wind": "La zona persistente e il TS a inizio turno restano invariati; il contratto dello Speed Tracker raddoppia soltanto la porzione di ogni segmento realmente percorsa verso il caster, usa la posizione corrente della sorgente, conserva il costo nel percorso per Undo e deduplica la stessa istanza. Geometria, membership, cambio direzione e lifecycle sono coperti dai test logici dedicati.",
  "banishment": "Il workflow batch del TS Carisma, il limite con slot superiori, il contesto dell'origine del piano, Incapacitato per i nativi del piano e la distinzione fra interruzione anticipata e scadenza naturale sono operativi; il ritorno o la permanenza fuori piano restano una gestione fisica manuale intenzionale.",
  "acid-arrow": "La risoluzione assistita Colpito/Mancato mostra il danno iniziale manuale, applica la metà sul mancato e crea sul colpito un solo reminder differito indipendente, con scaling 4d4/2d4 dal 2° livello e +1d4 per slot superiore; non viene creata una spell persistente né viene applicato danno automaticamente.",
  "phb2014-freccia-folgorante": "PASS: il cast prepara sul caster un’istanza concentrata; la risoluzione del prossimo attacco a distanza non richiede Hit/Miss/Critical e riceve dal GM il danno primario finale già applicato. Il click sul bersaglio primario ancora automaticamente il cerchio di 3 m, calcola la membership e raccoglie i TS Destrezza con danno secondario e scaling indipendente; primary, secondary, consumo della preparazione, concentrazione, History composita e Undo restano nella stessa transazione. Tiro per colpire e dadi restano manuali al tavolo.",
  "xanathar-coltello-di-ghiaccio": "PASS: il workflow area condiviso conserva il bersaglio primario dell’attacco, il danno perforante iniziale manuale solo su colpo e l’esplosione indipendente dal colpo, con TS Destrezza, danno freddo e scaling secondo il descriptor della spell. Tiro per colpire, dadi e modificatori restano manuali al tavolo; membership, mutazioni HP, History e cleanup seguono il percorso condiviso.",
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

function integrationIssue(code, severity = "P0") {
  return {
    code,
    severity,
    label: INTEGRATION_ISSUE_LABELS[code] || code,
  };
}

function validSyntheticContextValue(field) {
  if (Array.isArray(field?.options) && field.options.length) return field.options[0].value;
  if (["number", "integer", "numeric"].includes(field?.type)) return 1;
  if (["boolean", "checkbox"].includes(field?.type)) return true;
  return "current-plane";
}

function syntheticTargetIds(contract) {
  const inputs = contract?.presentation?.inputs || {};
  const targeting = contract?.presentation?.targeting || {};
  const required = inputs.targets?.required === true
    || targeting.mode !== "none"
    || targeting.confirmTargets === true;
  if (!required) return [];
  const maximum = Number.isInteger(inputs.targets?.maximum) && inputs.targets.maximum > 0
    ? inputs.targets.maximum
    : Number.isInteger(targeting.limit?.maximum) && targeting.limit.maximum > 0
      ? targeting.limit.maximum
      : 1;
  const count = contract?.spell?.id === "chain-lightning" ? Math.min(2, maximum) : 1;
  return Array.from({ length: count }, (_, index) => index ? `target-${index}` : "target");
}

function syntheticPlacement(contract, targetIds, castContext = {}) {
  const placement = contract?.presentation?.placement || {};
  if (placement.policy === "unavailable") return null;
  const rule = placement.rules?.[0] || {};
  if (placement.policy === "automatic") {
    return {
      status: "automatic",
      state: "automatic",
      policy: "automatic",
      ruleId: rule.ruleId || placement.ruleId,
      spellId: contract.spell.id,
      casterId: "caster",
      confirmed: true,
      targetIds,
    };
  }
  const placementResult = {
    status: "confirmed",
    state: "confirmed",
    confirmed: true,
    policy: placement.policy,
    ruleId: rule.ruleId || placement.ruleId,
    spellId: contract.spell.id,
    casterId: "caster",
    targetIds,
    targetLocked: true,
    preview: {
      type: rule.shape || "circle",
      start: { x: 0, y: 0 },
      end: { x: 50, y: 0 },
      gridOrigin: { x: 0, y: 0 },
      dpi: 50,
      position: { x: 0, y: 0 },
      targetIds,
    },
  };

  const composition = contract?.presentation?.composition;
  if (composition?.required === true) {
    const compositionKey = composition.key || "composition";
    const selected = castContext[compositionKey] || {};
    const counts = selected.counts && typeof selected.counts === "object"
      ? selected.counts
      : selected;
    placementResult.preview.positions = (composition.options || []).flatMap((option) => (
      Array.from({ length: Math.max(0, Math.floor(Number(counts?.[option.id]) || 0)) }, (_, index) => ({
        objectSize: option.id,
        ordinal: index,
        position: { x: index * 50, y: index * 50 },
      }))
    ));
  }

  return placementResult;
}

function syntheticSession(contract) {
  const inputs = contract?.presentation?.inputs || {};
  const targetIds = syntheticTargetIds(contract);
  const contextFields = contract?.presentation?.targeting?.workflow?.context?.fields || [];
  const targetContext = Object.fromEntries(targetIds.map((targetId) => [
    targetId,
    Object.fromEntries(contextFields
      .filter((field) => field.required === true)
      .map((field) => [field.id, validSyntheticContextValue(field)])),
  ]));
  const attack = contract?.presentation?.outcomes?.mode === "attack";

  const castContext = {};
  const composition = contract?.presentation?.composition;
  if (composition?.required === true) {
    const compositionKey = composition.key || "composition";
    const option = (composition.options || [])[0];
    if (option) {
      castContext[compositionKey] = {
        counts: {
          [option.id]: 1,
        },
      };
    }
  }

  return createSpellPanelSession({
    contract,
    casterId: "caster",
    slotLevel: inputs.slot?.required ? contract.presentation.slot.default : null,
    variant: inputs.variant?.required
      ? contract.presentation.variant.options?.[0]?.value
      : "",
    durationTurns: inputs.duration?.required ? 1 : null,
    targetIds,
    primaryTargetId: inputs.primaryTarget?.required ? targetIds[0] : "",
    outcomes: attack ? {} : Object.fromEntries(targetIds.map((id) => [id, "failed"])),
    attackOutcome: attack ? "hit" : "",
    targetContext,
    castContext,
    placement: syntheticPlacement(contract, targetIds, castContext),
    hpValues: {
      damage: inputs.damage?.required ? 12 : null,
      healing: inputs.healing?.required ? 12 : null,
    },
    requestedConcentration: contract?.presentation?.concentration?.required === true,
    phase: contract?.presentation?.phase?.selected,
  });
}

function syntheticCastAudit(contract) {
  const session = syntheticSession(contract);
  const lifecycle = getSpellUnifiedLifecycleEligibility(contract);
  if (lifecycle.eligible) {
    try {
      const request = buildSpellUnifiedLifecycleRequest({ contract, session });
      const intent = buildSpellApplicationIntent(request);
      const plan = buildSpellApplicationPlan({
        intent,
        instanceId: "audit-instance",
        casterName: "Caster",
      });
      const operationTypes = (plan?.operations || []).map((operation) => operation.type || "unknown");
      const trackingOnly = operationTypes.length > 0 && operationTypes.every((type) => [
        "spell:upsert",
        "spell:remove",
        "concentration:break",
        "concentration:register",
      ].includes(type));
      return {
        adapter: "spell-lifecycle",
        valid: operationTypes.length > 0,
        operationTypes,
        mutationMode: operationTypes.length ? (trackingOnly ? "tracking" : "mechanical") : "none",
        errors: operationTypes.length ? [] : ["cast-no-mutations"],
      };
    } catch (error) {
      return {
        adapter: "spell-lifecycle",
        valid: false,
        operationTypes: [],
        mutationMode: "none",
        errors: [String(error?.code || error?.message || error)],
      };
    }
  }

  const area = getSpellUnifiedAreaEligibility(contract, session);
  if (area.eligible) {
    try {
      const command = buildSpellUnifiedAreaCommand({
        contract,
        session,
        source: { sceneEpoch: 1 },
        candidateTargetIds: ["target", "target-1", "target-2", "target-3"],
        spatialValidation: {
          primaryDistanceMeters: 1,
          casterDistancesMeters: {
            target: 1,
            "target-1": 1,
            "target-2": 1,
            "target-3": 1,
          },
          secondaryDistancesMeters: {
            "target-1": 1,
            "target-2": 1,
            "target-3": 1,
          },
          pairwiseDistancesMeters: [],
        },
      });
      return {
        adapter: "area-transaction",
        valid: command.valid === true,
        operationTypes: [],
        mutationMode: "executor-deferred",
        errors: (command.errors || []).map((error) => error.code || error.message),
      };
    } catch (error) {
      return {
        adapter: "area-transaction",
        valid: false,
        operationTypes: [],
        mutationMode: "none",
        errors: [String(error?.code || error?.message || error)],
      };
    }
  }

  return {
    adapter: "none",
    valid: false,
    operationTypes: [],
    mutationMode: "none",
    errors: unique([lifecycle.code, area.code]),
  };
}

function syntheticReminderActionIds(spell, areaRules) {
  const instanceId = "audit-instance";
  const casterId = "caster";
  const persistentRule = areaRules.find((rule) => ["zone", "aura"].includes(rule.kind));
  const ownerSpell = {
    name: spell.displayName || spell.name,
    storedName: spell.name,
    spellId: spell.id,
    instanceId,
    casterId,
    conc: spell.concentration === true,
    appliedAt: { round: 1, actorId: casterId, turnKey: "1:0:caster" },
    castContext: {
      staticZoneOwner: true,
      staticZoneRuleId: persistentRule?.id || "",
      mobileAura: true,
      slotLevel: Math.max(1, Number(spell.level) || 1),
    },
  };
  const items = [{
    id: casterId,
    name: "Caster",
    metadata: {
      [META_KEY]: {
        [SPELLS_KEY]: [ownerSpell],
      },
    },
  }];
  if (persistentRule) {
    items.push({
      id: "zone-root",
      name: spell.displayName || spell.name,
      metadata: {
        [SPELL_STATIC_ZONE_META_KEY]: {
          role: "root",
          instanceId,
          casterId,
          spellId: spell.id,
        },
      },
    });
  }
  return unique(callLightningTurnPromptPayloads({
    items,
    actorId: casterId,
    sceneEpoch: 1,
    turnKey: "2:0:caster",
  }).filter((payload) => payload.spellId === spell.id).map((payload) => payload.actionId));
}

function activeActionReachability(spell, areaRules) {
  const declarations = getSpellUnifiedActiveActionDeclarations(spell.id);
  if (!declarations.length) {
    return {
      declaredActionIds: [],
      panelActionIds: [],
      reminderActionIds: [],
      unreachableActionIds: [],
      mode: "none",
    };
  }
  const effectIds = unique(declarations.flatMap((action) => action.consumesEffectIds || []));
  const panelActionIds = new Set(getSpellOverviewActions({
    spell,
    castContext: { slotLevel: Math.max(1, Number(spell.level) || 1) },
    casterId: "caster",
    targetIds: ["target"],
    effectInstances: effectIds.map((effectId, index) => ({
      effectId,
      itemId: `effect-${index}`,
      active: true,
    })),
    zoneItemId: "zone-root",
    appliedAt: { turnKey: "1:0:caster" },
    currentTurnKey: "2:0:other",
  }).map((action) => action.id));
  for (const action of declarations) {
    if (action.resolutionKind === "zone-movement") panelActionIds.add(action.id);
  }
  const reminderActionIds = syntheticReminderActionIds(spell, areaRules);
  const reachable = new Set([...panelActionIds, ...reminderActionIds]);
  const unreachableActionIds = declarations
    .map((action) => action.id)
    .filter((actionId) => !reachable.has(actionId));
  const reminderOnly = panelActionIds.size === 0
    && reminderActionIds.length > 0
    && declarations.every((action) => reminderActionIds.includes(action.id));
  return {
    declaredActionIds: declarations.map((action) => action.id),
    panelActionIds: [...panelActionIds],
    reminderActionIds,
    unreachableActionIds,
    mode: unreachableActionIds.length
      ? "unreachable"
      : reminderOnly
        ? "reminder-only"
        : reminderActionIds.length
          ? "panel-and-reminder"
          : "panel",
  };
}

function deriveSmokeCategories({
  spell,
  areaRules,
  triggers,
  contract,
  saveImplemented,
  implementedConditions,
  trackingImplemented,
  persistentArea,
  turnImplemented,
  phaseImplemented,
}) {
  const categories = new Set();
  if (
    contract?.execution?.lane === "area-transaction"
    || contract?.execution?.lane === "spell-area"
    || saveImplemented
    || implementedConditions.length > 0
    || spell.boardToken
    || (spell.effects || []).length > 0
  ) {
    categories.add("CAST");
  }
  if (spell.concentration === true) {
    categories.add("CONCENTRATION");
  }
  if (
    areaRules.length > 0
    && areaRules.some((rule) =>
      rule.geometry
      || ["zone", "aura", "line", "cone", "sphere", "cylinder", "cube", "box"].includes(rule.kind)
      || rule.type === "teleport-target"
    )
  ) {
    categories.add("AREA_GEOMETRY");
  }
  if (
    persistentArea
    || trackingImplemented
    || contract?.execution?.hasZones === true
    || contract?.execution?.hasTokens === true
    || spell.boardToken
  ) {
    categories.add("PERSISTENCE");
  }
  if (
    turnImplemented
    || triggers.length > 0
    || areaRules.some((r) => (r.zonePolicy?.triggers || []).some((t) => ["turn-start", "turn-end", "round-change"].includes(t.event)))
  ) {
    categories.add("TURN_TRIGGER");
  }
  if (
    (spell.activeActions || []).length > 0
    || phaseImplemented
  ) {
    categories.add("ACTIVE_ACTION");
  }
  if (
    spell.onSpellEnd
    || spell.expiry
    || persistentArea
    || spell.boardToken
  ) {
    categories.add("CLEANUP");
  }
  return Array.from(categories).sort();
}

function deriveVerificationEvidence(spellId, integration) {
  const evidence = [];
  if (
    integration?.catalog?.exposed
    && integration?.contract
    && (integration?.cast?.valid || integration?.status === "reachable")
  ) {
    evidence.push("STRUCTURAL");
  }
  return evidence;
}

function buildIntegrationAudit({
  spell,
  areaRules,
  unifiedCatalogById,
  trackable,
  regulatoryGaps,
  targetUiExposure,
  hasDeclaredAutomationExpectation,
  currentAutomationLevelCandidate,
}) {
  const catalogEntry = unifiedCatalogById.get(spell.id) || null;
  const issues = [];

  if (!catalogEntry) {
    if (targetUiExposure === "UNIFIED") {
      issues.push(integrationIssue("UNIFIED_CATALOG_MISSING", "P0"));
    } else {
      issues.push(integrationIssue("UNIFIED_CATALOG_MISSING", "—"));
    }
  }

  let contract = null;
  try {
    contract = buildSpellUnifiedPanelContract({ spellId: spell.id });
  } catch {
    contract = null;
  }
  if (!contract) {
    if (targetUiExposure === "UNIFIED") {
      issues.push(integrationIssue("CONTRACT_MISSING", "P0"));
    } else {
      issues.push(integrationIssue("CONTRACT_MISSING", "—"));
    }
    const severe = issues.some((issue) => issue.severity === "P0");
    const fragile = issues.some((issue) => issue.code === "ACTIVE_ACTION_REMINDER_ONLY");
    return {
      status: severe ? "disconnected" : (catalogEntry ? "partial" : "unexposed"),
      priority: severe ? "P0" : fragile ? "P1" : "—",
      issues,
      catalog: { exposed: !!catalogEntry, sources: [...(catalogEntry?.sources || [])] },
      contract: null,
      cast: null,
      persistence: null,
      actions: null,
      smokeRequired: false,
      smokeCategories: [],
    };
  }

  const cast = syntheticCastAudit(contract);
  if (!cast.valid) {
    const isNoMutations = cast.errors.includes("cast-no-mutations");
    if (isNoMutations) {
      if (hasDeclaredAutomationExpectation) {
        issues.push(integrationIssue("CAST_NO_MUTATIONS", "P0"));
      } else {
        issues.push(integrationIssue("CAST_NO_MUTATIONS", "—"));
      }
    } else {
      issues.push(integrationIssue("CAST_PATH_INVALID", "P0"));
    }
  }

  const actions = activeActionReachability(spell, areaRules);
  if (actions.unreachableActionIds.length) {
    issues.push(integrationIssue("ACTIVE_ACTION_UNREACHABLE", "P0"));
  } else if (actions.mode === "reminder-only") {
    issues.push(integrationIssue("ACTIVE_ACTION_REMINDER_ONLY", "P1"));
  }

  const requiresPersistentInstance = spell.concentration === true
    || areaRules.some((rule) => ["zone", "aura"].includes(rule.kind))
    || actions.declaredActionIds.length > 0;
  const persistenceDeclared = trackable
    || contract.execution?.hasZones === true
    || contract.execution?.hasTokens === true
    || cast.operationTypes.includes("spell:upsert");
  if (actions.declaredActionIds.length && !persistenceDeclared) {
    issues.push(integrationIssue("PERSISTENCE_UNDECLARED", "P0"));
  }

  const severe = issues.some((issue) => issue.severity === "P0");
  const fragile = issues.some((issue) => issue.code === "ACTIVE_ACTION_REMINDER_ONLY");
  const status = severe
    ? "disconnected"
    : fragile
      ? "fragile"
      : regulatoryGaps.length
        ? "partial"
        : catalogEntry
          ? "reachable"
          : "unexposed";

  return {
    status,
    priority: severe ? "P0" : fragile ? "P1" : "—",
    issues,
    catalog: {
      exposed: !!catalogEntry,
      sources: [...(catalogEntry?.sources || [])],
    },
    contract: {
      lane: contract.execution?.lane || "",
      targetingMode: contract.presentation?.targeting?.mode || "none",
      placementPolicy: contract.presentation?.placement?.policy || "unavailable",
      visibleInputs: Object.entries(contract.presentation?.inputs || {})
        .filter(([, input]) => input?.visible === true)
        .map(([name]) => name),
    },
    cast,
    persistence: {
      required: requiresPersistentInstance,
      declared: persistenceDeclared,
      ruleIds: areaRules
        .filter((rule) => ["zone", "aura", "board-token"].includes(rule.kind))
        .map((rule) => rule.id),
    },
    actions,
    smokeRequired: requiresPersistentInstance || actions.declaredActionIds.length > 0,
    smokeCategories: [],
  };
}

function deriveSpellAudit(spell, reference, trackableIds, unifiedCatalogById) {
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
  const trackingImplemented = (spell.trackable === true || trackableIds.has(spell.id))
    && (!instantaneous || spell.trackable === true);

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
  if (curated?.gaps?.length) priority = "P1";
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

  const hasDeclaredAutomationExpectation = spell.concentration === true
    || (spell.effects || []).length > 0
    || !!spell.saveAutomation
    || !!spell.boardToken
    || (spell.activeActions || []).length > 0
    || (areaRules.length > 0 && areaRules.some((r) => r.save || r.damage || r.effects || r.targeting?.confirmTargets));

  const catalogEntry = unifiedCatalogById.get(spell.id) || null;
  const currentUiExposure = catalogEntry
    ? "UNIFIED"
    : (trackingImplemented ? "TRACKER_ONLY" : (text ? "REFERENCE_ONLY" : "NONE"));
  const targetUiExposure = currentUiExposure === "UNIFIED" ? "UNIFIED" : "UNREVIEWED";

  const hasMechanicalAutomationCandidate = (areaRules.length > 0 && areaRules.some((r) => r.save || r.damage || r.effects || r.targeting?.confirmTargets))
    || implementedConditions.length > 0
    || saveImplemented
    || movementImplemented
    || !!spell.boardToken
    || (spell.activeActions || []).length > 0
    || phaseImplemented;

  const currentAutomationLevelCandidate = hasMechanicalAutomationCandidate
    ? (gaps.length === 0 && !!curatedComplete ? "FULL" : "PARTIAL")
    : (trackingImplemented || persistentArea || spell.concentration === true ? "TRACK_ONLY" : "MANUAL");

  const integration = buildIntegrationAudit({
    spell,
    areaRules,
    unifiedCatalogById,
    trackable: trackingImplemented,
    regulatoryGaps: gaps,
    targetUiExposure,
    hasDeclaredAutomationExpectation,
    currentAutomationLevelCandidate,
  });

  const hasMechanicalAutomation = hasMechanicalAutomationCandidate
    || integration.cast?.mutationMode === "mechanical"
    || integration.cast?.adapter === "area-transaction";

  let currentAutomationLevel = "MANUAL";
  if (hasMechanicalAutomation) {
    const hasIssues = gaps.length > 0
      || integration.status === "disconnected"
      || integration.status === "fragile"
      || integration.status === "partial"
      || integration.issues.some((issue) => issue.severity === "P0" || issue.code === "ACTIVE_ACTION_REMINDER_ONLY");
    currentAutomationLevel = (!hasIssues && integration.status === "reachable" && !!curatedComplete) ? "FULL" : "PARTIAL";
  } else if (trackingImplemented || persistentArea || spell.concentration === true) {
    currentAutomationLevel = "TRACK_ONLY";
  } else {
    currentAutomationLevel = "MANUAL";
  }

  let coverageStatus = "UNREVIEWED";
  const hasKnownGap = gaps.length > 0
    || integration.issues.some((issue) => issue.severity === "P0" || issue.code === "ACTIVE_ACTION_REMINDER_ONLY" || issue.code === "ACTIVE_ACTION_UNREACHABLE");

  if (hasKnownGap) {
    coverageStatus = "GAP";
  } else if (intentionallyManual) {
    coverageStatus = "ACCEPTED";
  } else if (curatedComplete && gaps.length === 0 && integration.status === "reachable") {
    coverageStatus = "ACCEPTED";
  } else if (curatedComplete && currentAutomationLevel === "TRACK_ONLY" && gaps.length === 0) {
    coverageStatus = "ACCEPTED";
  } else {
    coverageStatus = "UNREVIEWED";
  }

  let targetAutomationLevel = "UNREVIEWED";
  if (intentionallyManual) {
    targetAutomationLevel = "MANUAL";
  } else if (coverageStatus === "ACCEPTED") {
    targetAutomationLevel = currentAutomationLevel;
  } else {
    targetAutomationLevel = "UNREVIEWED";
  }

  const smokeCategories = deriveSmokeCategories({
    spell,
    areaRules,
    triggers,
    contract: integration.contract,
    saveImplemented,
    implementedConditions,
    trackingImplemented,
    persistentArea,
    turnImplemented,
    phaseImplemented,
  });
  integration.smokeCategories = smokeCategories;
  integration.smokeRequired = smokeCategories.length > 0;

  const verificationEvidence = deriveVerificationEvidence(spell.id, integration);

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
    currentAutomationLevel,
    coverageStatus,
    targetAutomationLevel,
    currentUiExposure,
    targetUiExposure,
    smokeCategories,
    verificationEvidence,
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
      smokeCategories,
      ...(spell.boardToken ? { boardToken: true } : {}),
    },
    integration,
    evidence: {
      area: areaEvidence,
      save: saveEvidence,
      movement: movementEvidence,
      turn: turnEvidence,
      phase: phaseEvidence,
      choice: choiceEvidence,
      spatial: spatialEvidence,
    },
    curatedNote: curatedComplete || curated?.note,
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
  const unifiedCatalogById = new Map(
    buildSpellUnifiedCatalogEntries().map((entry) => [entry.key, entry]),
  );
  const allRows = getSpellCatalog()
    .map((spell) => deriveSpellAudit(
      spell,
      references.get(spell.id) || spell.italianReference || null,
      trackableIds,
      unifiedCatalogById,
    ))
    .sort((a, b) => a.name.localeCompare(b.name, "it") || a.id.localeCompare(b.id));
  const legacyOperationalRows = allRows.filter((row) => row.inAuditScope);
  const excludedRows = allRows.filter((row) => !row.inAuditScope);
  const openRows = allRows.filter((row) => row.gaps.length > 0);
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({
      rows: allRows.map((row) => [row.id, row.currentAutomationLevel, row.coverageStatus, row.targetAutomationLevel, row.priority, row.gaps.map((g) => g.code)]),
      excluded: excludedRows.map((row) => [row.id, row.exclusionReason]),
    }))
    .digest("hex")
    .slice(0, 16);

  return {
    schemaVersion: 5,
    ruleset: "D&D 5e 2014",
    methodology: "Audit incrementale multi-asse: conformità al testo regolamentare, raggiungibilità nella console unificata, livello di automazione attuale vs target e categorizzazione smoke.",
    fingerprint,
    summary: {
      catalogTotal: allRows.length,
      catalog: allRows.length,
      textsAvailable: allRows.filter((row) => row.textAvailable).length,
      excluded: excludedRows.length,
      legacyOperationalCount: legacyOperationalRows.length,
      legacyExcludedCount: excludedRows.length,
      excludedByReason: countBy(excludedRows, (row) => row.exclusionReason),
      currentAutomationLevel: countBy(allRows, (row) => row.currentAutomationLevel),
      coverageStatus: countBy(allRows, (row) => row.coverageStatus),
      targetAutomationLevel: countBy(allRows, (row) => row.targetAutomationLevel),
      currentUiExposure: countBy(allRows, (row) => row.currentUiExposure),
      targetUiExposure: countBy(allRows, (row) => row.targetUiExposure),
      trackable: allRows.filter((row) => row.runtime.trackable).length,
      withAreaRules: allRows.filter((row) => row.runtime.areaRuleIds.length).length,
      openRows: openRows.length,
      confirmed: allRows.filter((row) => row.priority === "P1").length,
      highConfidence: allRows.filter((row) => row.priority === "P2").length,
      reviewCandidates: allRows.filter((row) => row.priority === "P3").length,
      curatedP1: allRows.filter((row) => row.priority === "P1").length,
      manuallyReviewed: allRows.filter((row) => row.reviewBasis === "curata sul testo RAW").length,
      knownIntegrationGaps: allRows.flatMap((row) => row.integration.issues.filter((issue) => issue.severity === "P0" || issue.severity === "P1")).length,
      knownRawGaps: openRows.length,
      byPriority: countBy(allRows, (row) => row.priority),
      byAssessment: countBy(allRows, (row) => row.assessment),
      bySaveScope: countBy(allRows, (row) => row.saveScope),
      byGap: countBy(openRows.flatMap((row) => row.gaps), (entry) => entry.code),
      byIntegrationStatus: countBy(allRows, (row) => row.integration.status),
      byIntegrationPriority: countBy(allRows, (row) => row.integration.priority),
      byIntegrationIssue: countBy(
        allRows.flatMap((row) => row.integration.issues),
        (entry) => entry.code,
      ),
      smokeCategories: countBy(
        allRows.flatMap((row) => row.smokeCategories),
        (entry) => entry,
      ),
      unifiedCatalogExposed: allRows.filter((row) => row.integration.catalog?.exposed).length,
      integrationDisconnected: allRows.filter((row) => row.integration.status === "disconnected").length,
      integrationFragile: allRows.filter((row) => row.integration.status === "fragile").length,
      runtimeSmokeRequired: allRows.filter((row) => row.integration.smokeRequired).length,
      releaseReady: allRows.every((row) =>
        row.coverageStatus !== "GAP"
        && row.coverageStatus !== "UNREVIEWED"
        && row.targetAutomationLevel !== "UNREVIEWED"
        && row.targetUiExposure !== "UNREVIEWED"
        && !row.integration.issues.some((issue) => issue.severity === "P0")
      ),
    },
    rows: allRows,
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

function renderIntegrationSection(audit) {
  const rows = audit.rows.filter((row) => row.integration.issues.length > 0);
  const lines = ["## Integrazione con la console unificata", ""];
  if (!rows.length) return [...lines, "Nessuna disconnessione rilevata.", ""].join("\n");
  lines.push(
    "Questa sezione segnala workflow con gap di integrazione, azioni non raggiungibili o cast anomali.",
    "",
    "| Incantesimo | Console | Cast | Azioni successive | Stato | Problemi |",
    "| --- | --- | --- | --- | --- | --- |",
  );
  for (const row of rows) {
    const integration = row.integration;
    const actions = integration.actions;
    const actionSummary = actions?.declaredActionIds?.length
      ? `${actions.mode}: ${actions.declaredActionIds.join(", ")}`
      : "nessuna";
    lines.push(`| ${mdCell(row.name)} | ${integration.catalog?.exposed ? "esposto" : "assente"} | ${mdCell(integration.cast?.adapter || "—")} | ${mdCell(actionSummary)} | ${mdCell(integration.status)} | ${mdCell(integration.issues.map((issue) => issue.label).join("; "))} |`);
  }
  lines.push("");
  return lines.join("\n");
}

export function renderSpellAutomationMarkdown(audit) {
  const lines = [
    "# Audit automazione incantesimi",
    "",
    "> **Audit incrementale per feature freeze e source of truth.**",
    "> Mappa i 477 record del catalogo distinguendo stato attuale, stato desiderato,",
    "> esposizione UI, conformità regolamentare e requisiti di smoke test.",
    "",
    "## Metodo e sintesi del catalogo",
    "",
    `- Catalogo totale: **${audit.summary.catalogTotal}** definizioni su 477 record.`,
    `- Testi disponibili: **${audit.summary.textsAvailable}** / ${audit.summary.catalogTotal}.`,
    `- Esposti nella console unificata: **${audit.summary.unifiedCatalogExposed}**; disconnessi: **${audit.summary.integrationDisconnected}**; fragili: **${audit.summary.integrationFragile}**.`,
    `- Definizioni tracciabili: **${audit.summary.trackable}**; definizioni con regole d'area: **${audit.summary.withAreaRules}**.`,
    `- Workflow che richiedono smoke test runtime: **${audit.summary.runtimeSmokeRequired}**.`,
    `- Lacune RAW confermate P1: **${audit.summary.curatedP1}**; discrepanze ad alta confidenza P2: **${audit.summary.highConfidence}**.`,
    `- Impronta deterministica: \`${audit.fingerprint}\`.`,
    "",
    "### Livello di automazione attuale (currentAutomationLevel)",
    "",
    renderCountTable(audit.summary.currentAutomationLevel),
    "",
    "### Stato di copertura (coverageStatus)",
    "",
    renderCountTable(audit.summary.coverageStatus),
    "",
    "### Livello di automazione target (targetAutomationLevel)",
    "",
    renderCountTable(audit.summary.targetAutomationLevel),
    "",
    "### Esposizione UI attuale (currentUiExposure)",
    "",
    renderCountTable(audit.summary.currentUiExposure),
    "",
    "### Esposizione UI target (targetUiExposure)",
    "",
    renderCountTable(audit.summary.targetUiExposure),
    "",
    "### Categorie di Smoke Test richieste",
    "",
    renderCountTable(audit.summary.smokeCategories),
    "",
    "### Stato di integrazione console unificata",
    "",
    renderCountTable(audit.summary.byIntegrationStatus),
    "",
    "### Problemi di integrazione",
    "",
    renderCountTable(audit.summary.byIntegrationIssue),
    "",
    renderIntegrationSection(audit),
    renderPrioritySection(audit, "P1", "P1 — lacune confermate sul testo RAW"),
    renderPrioritySection(audit, "P2", "P2 — discrepanze ad alta confidenza"),
    renderPrioritySection(audit, "P3", "P3 — candidate da revisionare"),
    "## Matrice completa (477 incantesimi)",
    "",
    "| Incantesimo | ID | Fonte/Liv. | Livello Attuale | Copertura | Livello Target | Esposizione UI | Integrazione | Priorità | Lacune |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const row of audit.rows) {
    lines.push(`| ${mdCell(row.name)} | \`${mdCell(row.id)}\` | ${mdCell(`${row.source} / ${row.level}`)} | ${mdCell(row.currentAutomationLevel)} | ${mdCell(row.coverageStatus)} | ${mdCell(row.targetAutomationLevel)} | ${mdCell(row.currentUiExposure)} | ${mdCell(row.integration.status)} | ${row.priority} | ${mdCell(row.gaps.map((entry) => entry.label).join("; "))} |`);
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
    integrationDisconnected: audit.summary.integrationDisconnected,
    integrationFragile: audit.summary.integrationFragile,
    currentAutomationLevel: audit.summary.currentAutomationLevel,
    coverageStatus: audit.summary.coverageStatus,
    targetAutomationLevel: audit.summary.targetAutomationLevel,
    currentUiExposure: audit.summary.currentUiExposure,
    targetUiExposure: audit.summary.targetUiExposure,
    smokeCategories: audit.summary.smokeCategories,
    fingerprint: audit.fingerprint,
    markdown: path.relative(ROOT, MARKDOWN_OUTPUT),
    json: path.relative(ROOT, JSON_OUTPUT),
  }));
}
