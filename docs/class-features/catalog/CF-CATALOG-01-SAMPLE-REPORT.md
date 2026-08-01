# CF-CATALOG-01 — Report del campione

## Snapshot e perimetro

- `snapshotCommit`: `890223e517e2ed27c40bdeb7c4cf9701a6d62d79`
- campione: 36 feature;
- organizzazione: firma meccanica cross-class, non classe;
- fonti: PHB 2014 (23), Xanathar (6), Tasha (7);
- classi coperte: tutte le 12 classi presenti nel catalogo;
- feature del catalogo completo non classificate: le restanti feature, incluse le 395 `not-automated`, restano fuori dal ticket.

Il campione contiene casi semplici, compositi e ambigui. Non è un pilot di implementazione e non propone promozioni nel runtime.

## Verifica dello schema

Il registro contiene i 77 `primitiveId` della tassonomia finita dell'audit, senza primitive nuove. La matrice usa 70 primitive distinte; le primitive definite ma non richieste da una riga del campione sono `DATA.FRESHNESS`, `DATA.SCHEMA_VALIDATION`, `DATA.DERIVED_REPORT`, `SRC.SELECTABLE_CASTER`, `LC.APPLIED_AT`, `UI.MODAL_REVIEW` e `UI.CONTROL_CENTER`.

Controlli eseguiti sul campione:

- 36 `featureId` univoci;
- tutti i `requiredPrimitiveIds` esistono nel registro;
- nessun campo derivato (`availablePrimitiveIds`, `missingPrimitiveIds`, `candidateTicketIds`, `unlockState`) è compilato nella matrice;
- nessun nome, classe, sottoclasse, livello, descrizione o testo regolamentare è duplicato nella matrice;
- ogni riga ha source pointer, snapshot, motivazione, pattern, ambiguità e riferimenti di review;
- tutte le 13 righe con ambiguità complessiva 3 sono `unsupported` e `deferred`.

Disponibilità del registro:

| Stato | Conteggio |
|---|---:|
| `available` | 65 |
| `partial` | 10 |
| `spell-adapter-needed` | 1 |
| `missing` | 1 |

La primitive definita dall'audit ma senza implementazione baseline nel registro è `FX.ACTIVE_ACTION`. `SRC.SELECTABLE_CASTER` resta `spell-adapter-needed` perché il campione riguarda class feature e non introduce un secondo contratto per gli incantesimi.

## Distribuzione del campione

| Classificazione | Conteggio |
|---|---:|
| `descriptive` | 9 |
| `assisted` | 14 |
| `automatic` | 0 |
| `unsupported` | 13 |

Il valore corrente `automatica` è stato trattato come indizio, non come promozione: nessuna riga supera nel campione il gate di determinismo necessario per `automatic`.

| Data readiness | Conteggio |
|---|---:|
| `ready` | 4 |
| `partial` | 18 |
| `blocked` | 14 |

| Review | Conteggio |
|---|---:|
| `triaged` | 23 |
| `deferred` | 13 |
| `approved` | 0 |

Pattern primari coperti:

- `CLASS.RAGE`: 1;
- `CLASS.FIXED_OWNER`: 1;
- `CLASS.RESOURCE_POOL`: 11;
- `CLASS.RECKLESS_ATTACK`: 1;
- `CLASS.DESCRIPTIVE_MARKER`: 8;
- `CLASS.FEATURE_CHOICE`: 3;
- `CLASS.PARENT_CHILD`: 6;
- `CLASS.SELECTED_AURA`: 5.

## Casi da segnalare separatamente

### Feature che non entrano nella tassonomia operativa v1

Queste feature possono conservare un riferimento o un reminder, ma non entrano come automazione operativa onesta finché non esiste un contratto per dati esterni o entità evocate:

- `druido-forma-selvatica`: richiede lo stat block della forma;
- `ranger-signore-delle-bestie-compagno-del-ranger`: richiede dati canonici del compagno;
- `warlock-l-insondabile-tentacoli-delle-profondita`: richiede un contratto per entità evocata e sue conseguenze.

Non è stato aggiunto alcun `primitiveId` per coprire questi casi.

### Primitive apparentemente mancanti

Sono gap da valutare in ticket separati, non primitive aggiunte al registro:

- `ACT.REACTION`: attivazione di reazione come contratto di primo livello;
- `DATA.STAT_BLOCK`: dati strutturati per forme e compagni;
- `FX.ENTITY_SUMMON`: creazione e lifecycle di un'entità evocata;
- `RULE.TRIGGER_DETECTION`: riconoscimento automatico di colpi, danni o eventi;
- `RULE.DAMAGE_ENGINE`: applicazione automatica di danni e relativi tiri.

Gli ultimi due sono anche esclusi dai vincoli del ticket: il campione usa reminder e review, non automazione di trigger o danni.

### Candidati a shared-primitive

- `FX.CONDITION` + lifecycle e termination: `barbaro-ira`, `barbaro-cammino-del-guardiano-ancestrale-protettori-ancestrali` e le aure con condizioni;
- `RES.COST` + `RES.SHARED_POOL` + `UI.RESOURCE_COUNTER`: risorse di bardo, guerriero, monaco, paladino, stregone e warlock;
- `CHOICE.REQUIRED` + `CHOICE.EFFECT_VARIANT` + `UI.DROPDOWN`: `barbaro-cammino-della-bestia-forma-della-bestia`, `barbaro-cammino-dell-araldo-della-tempesta-aura-tempestosa` e le scelte analoghe;
- `AREA.MEMBERSHIP` + `AREA.RECONCILE` + `AREA.VISUAL`: `barbaro-cammino-del-combattente-totemico-spirito-totemico-lupo`, `chierico-dominio-del-crepuscolo-incanalare-divinita-santuario-del-crepuscolo`, `druido-circolo-del-pastore-totem-spirituale` e `paladino-giuramento-di-conquista-aura-di-conquista`;
- `HP.TEMP_DECLARATIVE`: effetti HP temporanei di bardo, barbaro, chierico e druido;
- `TGT.CARDINALITY_ASSISTED`: selezioni multi-target con limite derivabile.

### Casi realmente feature-specific

Nessun caso del campione è confermato come `feature-specific`. Le feature apparentemente uniche richiedono invece dati mancanti, adjudication o un contratto condivisibile; sono state quindi classificate `not-allowed`, `adapter` o `unsupported`.

### Feature con ambiguità 3

Le seguenti righe sono `unsupported`/`deferred`:

- `monaco-ki`;
- `warlock-magia-del-patto`;
- `guerriero-maestro-di-battaglia-manovre-attacco-adescante`;
- `barbaro-cammino-della-magia-selvaggia-impeto-selvaggio`;
- `druido-forma-selvatica`;
- `ranger-signore-delle-bestie-compagno-del-ranger`;
- `stregone-magia-selvaggia-impulso-di-magia-selvaggia`;
- `warlock-dono-del-patto`;
- `monaco-via-della-misericordia-strumenti-di-misericordia`;
- `barbaro-cammino-dell-araldo-della-tempesta-aura-tempestosa`;
- `ranger-custode-degli-sciami-sciame-riunito`;
- `warlock-l-insondabile-tentacoli-delle-profondita`;
- `ladro-assassino-assassinare`.

### Fonti o dati eseguibili insufficienti

Il campione non presenta source pointer mancanti nei cataloghi, ma presenta dati non sufficienti per l'esecuzione in queste righe: `barbaro-attacco-irruento`, `chierico-incanalare-divinita-scacciare-non-morti`, `ranger-uccisore-di-mostri-preda-dell-uccisore`, `guerriero-maestro-di-battaglia-manovre-attacco-adescante`, `druido-circolo-delle-spore-entita-simbiotica`, `ranger-signore-delle-bestie-compagno-del-ranger`, `stregone-magia-selvaggia-impulso-di-magia-selvaggia`, `warlock-dono-del-patto`, `monaco-via-della-misericordia-strumenti-di-misericordia`, `barbaro-cammino-del-combattente-totemico-spirito-totemico-lupo`, `ladro-assassino-assassinare` e `stregone-metamagia-incantesimo-rapido`.

I blocker della matrice riportano i codici già presenti nell'audit (`effects`, `activation_semantics`, `effetti_strutturati`, `runtime_requirements`, `bersaglio_da_specificare`, `durata_da_specificare` e relativi codici di completezza); non viene ricopiato testo regolamentare.

### Possibili over-automation

Restano reminder o review manuale, senza trigger automatici, danni o adjudication automatica:

- `ladro-attacco-furtivo`;
- `paladino-punizione-divina`;
- `mago-scuola-di-abiurazione-interdizione-arcana`;
- `barbaro-cammino-della-magia-selvaggia-impeto-selvaggio`;
- `ranger-custode-degli-sciami-sciame-riunito`;
- `ladro-assassino-assassinare`;
- `guerriero-maestro-di-battaglia-manovre-attacco-adescante`.

### Incoerenze nei dati di origine

- `barbaro-attacco-irruento` e `barbaro-cammino-del-combattente-totemico-spirito-totemico-lupo` risultano `implemented` nello stato runtime corrente, mentre il meccanico sorgente resta `riferimento` con effetti/activation semantics mancanti;
- `paladino-giuramento-di-conquista-aura-di-conquista` e `mago-scuola-di-abiurazione-interdizione-arcana` hanno livello sorgente `automatica`, ma risultano `not-automated` o non esposti nello stato runtime;
- `runtime-feature-overrides.json` contiene 27 record, di cui 21 con `status: implemented` e 6 record senza status, usati come configurazioni/etichette correnti. Non sono stati reinterpretati o modificati.

Queste incoerenze sono state riportate, non risolte nel catalogo campione.

## Esito della fase campione

Il campione è sufficiente per una review architetturale di schema e tassonomia: copre tutte le classi, otto firme meccaniche, 77 primitive definite, casi con dati pronti/parziali/bloccati e il confine tra reminder, assistenza e unsupported.

La tassonomia non è ancora approvata per l'implementazione. Prima di classificare le feature restanti servono la review dei 13 casi ad ambiguità 3, la decisione sui gap apparenti (`ACT.REACTION`, stat block, entity summon, trigger/damage engine) e la risoluzione separata delle incoerenze tra overlay e stato runtime.

Non sono stati calcolati conteggi di unlock, `missingPrimitiveIds`, `candidateTicketIds` o `unlockState`: il campione non autorizza stime sull'insieme completo e non modifica alcun runtime, override, JavaScript, catalogo o overlay originario.
