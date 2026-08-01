# CF-CATALOG-01 — Report della fase campione revisionata

## Snapshot e perimetro

- `snapshotCommit`: `890223e517e2ed27c40bdeb7c4cf9701a6d62d79`;
- campione invariato: 36 feature, 36 `featureId` univoci;
- organizzazione: firma meccanica cross-class, non classificazione per classe;
- fonti: PHB 2014 (23), Xanathar (6), Tasha (7);
- classi coperte: tutte le 12 classi presenti nel catalogo;
- feature fuori scope: tutte le altre feature, incluse le 395 richieste per il catalogo completo, restano non classificate.

Questa revisione applica la review di Sol alla sola fase campione. Non è stato aggiunto alcun nuovo record di feature e non è stato modificato runtime, override, catalogo sorgente, overlay o JavaScript.

## Stato della tassonomia al commit

Il registro contiene 79 primitive: le 77 primitive della tassonomia finita dell'audit più `ACT.REACTION` e `UI.VALUE_INPUT`. `ACT.REACTION` non rileva automaticamente il trigger e non automatizza l'economia della reazione: l'utente attiva la feature dopo la decisione del tavolo. `UI.VALUE_INPUT` raccoglie un valore esplicito dall'utente prima di una mutazione assistita, ma resta `missing` allo snapshot.

`availability` è lo stato reale osservabile allo snapshot. Un ticket futuro non rende disponibile retroattivamente una primitive: i passaggi futuri sono descritti separatamente in `availabilityTransitions`.

| Availability snapshot | Conteggio |
|---|---:|
| `available` | 47 |
| `partial` | 17 |
| `spell-adapter-needed` | 5 |
| `missing` | 10 |
| Totale | 79 |

I ticket sono presenti in `providedByTicketIds` solo per primitive `missing` o `spell-adapter-needed`; per primitive già presenti ma da stabilizzare sono in `stabilizedByTicketIds`. Sono presenti 22 primitive con transizioni future e non ci sono primitive `available`/`partial` con un ticket futuro erroneamente conteggiato come implementazione corrente.

Le primitive escluse intenzionalmente dalla v1 sono:

- `DATA.STAT_BLOCK`;
- `FX.ENTITY_SUMMON`;
- `RULE.TRIGGER_DETECTION`;
- `RULE.DAMAGE_ENGINE`.

## Verifica dello schema e del grafo

La matrice contiene i nuovi campi `recordRole`, `classificationUnits`, `notApplicableAmbiguityAxes` e `supportDisposition`. Il vocabolario dei ruoli accetta `activatable`, `resource-pool`, `container`, `configuration`, `option`, `passive`, `reminder`, `target-effect` e `composite`. Gli stati runtime accettati sono `implemented`, `not-automated` e `not-exposed`.

Controlli eseguiti:

- 36 `featureId` univoci, senza nuove feature;
- 59 `primitiveId` distinti richiesti dalla matrice, tutti presenti nel registro;
- nessun campo derivato (`availablePrimitiveIds`, `missingPrimitiveIds`, `candidateTicketIds`, `unlockState`) è compilato;
- ogni `primaryPattern` è strutturato come `patternId`, `referenceId`, `reusedAspects`;
- ogni riga ha `classificationUnits` e gli assi non applicabili sono espliciti;
- nessuna riga deferred ha un livello di automazione non nullo;
- `unsupported` è usato zero volte: non è più sinonimo di `deferred`;
- nessuna ambiguità complessiva è 3 e nessun asse elencato come non applicabile riceve 3;
- tutti i riferimenti `SPELL.*` usati puntano a ID reali del catalogo spell;
- il grafo di `dependsOnPrimitiveIds` è aciclico.

Il grafo ora usa `dependsOnPrimitiveIds` solo per prerequisiti hard. Le integrazioni non bloccanti sono in `collaboratesWithPrimitiveIds`, mentre gli output UI sono in `emitsUiPrimitiveIds`. Sono stati rimossi i cicli tra:

- `ACT.REVIEW`, `UI.MODAL_REVIEW`, `UI.QUICK_REVIEW`;
- `ACT.PARENT_CHILD`, `FX.PARENT_END`, `END.ALL`;
- `TGT.SELECTION`, `UI.TARGET_PICKER`;
- `FX.REMINDER`, `UI.PILL`.

## Distribuzione delle 36 righe

### Automazione e supporto

| Target | Conteggio |
|---|---:|
| `descriptive` | 18 |
| `assisted` | 18 |
| `automatic` | 0 |
| `unsupported` | 0 |

| Support disposition | Conteggio |
|---|---:|
| `supported` | 34 |
| `supported-with-out-of-scope-unit` | 2 |
| `deferred` | 0 |

Le due righe con subunità fuori scope sono `druido-forma-selvatica` per l'applicazione dello stat block e `ranger-signore-delle-bestie-compagno-del-ranger` per lo stat block del compagno. Il record campione conserva un livello onesto per il tracking/configuration, senza introdurre primitive vietate.

### Ruoli dei record

| `recordRole` | Conteggio |
|---|---:|
| `activatable` | 4 |
| `resource-pool` | 2 |
| `container` | 0 |
| `configuration` | 3 |
| `option` | 0 |
| `passive` | 4 |
| `reminder` | 8 |
| `target-effect` | 3 |
| `composite` | 12 |

I 12 record `composite` usano `classificationUnits`. Sono esplicitamente scomposti, tra gli altri, `Fonte di Magia`, `Imposizione delle Mani`, `Preservare Vita`, `Impeto Selvaggio`, `Forma Selvatica`, `Dono del Patto`, `Aura Tempestosa`, `Totem Spirituale`, `Tentacoli delle Profondità` e `Incantesimo Rapido`.

### Stato runtime e data readiness

| `existingRuntimeStatus` | Conteggio |
|---|---:|
| `implemented` | 8 |
| `not-automated` | 21 |
| `not-exposed` | 7 |

I sette record `not-exposed` sono `monaco-ki`, `warlock-magia-del-patto`, `guerriero-maestro-di-battaglia-manovre-attacco-adescante`, `warlock-dono-del-patto`, `monaco-via-della-misericordia-strumenti-di-misericordia`, `paladino-giuramento-di-conquista-aura-di-conquista` e `ladro-assassino-assassinare`.

| `dataReadiness` | Conteggio |
|---|---:|
| `ready` | 25 |
| `partial` | 11 |
| `blocked` | 0 |

La readiness è relativa al livello scelto: un reminder descriptive non viene bloccato perché non possiede effetti strutturati o durata persistente. `Azione Impetuosa` non richiede blocker di durata o `LC.MANUAL`; `Recuperare Energie` è `partial` soltanto per l'input esplicito del tiro o valore di cura prima della mutazione HP canonica.

| `customCodeMode` | Conteggio |
|---|---:|
| `none` | 17 |
| `shared-primitive` | 12 |
| `adapter` | 7 |

## Pattern SPELL.* usati

| Pattern | Occorrenze nella matrice |
|---|---:|
| `SPELL.ACTIVE_ACTION` | 2 |
| `SPELL.CHOICE_EFFECT` | 2 |
| `SPELL.DESCRIPTIVE_REMINDER` | 5 |
| `SPELL.DYNAMIC_AURA` | 4 |
| `SPELL.MULTI_TARGET` | 1 |
| `SPELL.SELECTED_AREA` | 2 |
| `SPELL.TARGET_TERMINATION` | 1 |
| `SPELL.TEMP_HP_DECLARATIVE` | 3 |
| `SPELL.TIMED_CONDITION` | 2 |

Confronti espliciti della review:

- `Protettori Ancestrali` ↔ `guiding-bolt` / `SPELL.TIMED_CONDITION`;
- `Forma della Bestia` ↔ `alter-self` / `SPELL.CHOICE_EFFECT`;
- `Impeto Selvaggio` ↔ `SPELL.CHOICE_EFFECT`, con parent e otto esiti;
- `Santuario del Crepuscolo` ↔ `holy-aura` / `SPELL.DYNAMIC_AURA`;
- `Preda dell'Uccisore` ↔ `hunters-mark` / `SPELL.TARGET_TERMINATION`;
- `Tentacoli delle Profondità` ↔ `black-tentacles` / `SPELL.ACTIVE_ACTION` e area piazzata.

## Decisioni applicate alle righe critiche

- `Ira` resta `assisted`, data ready, direct/self, con baseline accettata;
- `Attacco Irruento` resta `descriptive`, data ready, con `LC.TURN_START` ancorato al proprietario;
- `Ki` è `resource-pool`, non unsupported;
- `Magia del Patto` è `resource-pool` descriptive/configuration, senza target o lifecycle artificiale;
- `Spirito Totemico: Lupo` è reminder descriptive self e non richiede primitive area;
- `Impeto Selvaggio` e `Aura Tempestosa` sono assisted/composite;
- `Forma Selvatica` separa tracking e stat-block application fuori scope;
- `Tentacoli delle Profondità` usa area piazzata/stato persistente/active action, non entity summon;
- `Assassinare` è passive descriptive reminder;
- le righe composite dichiarano le proprie `classificationUnits` invece di nascondere opzioni nel testo rationale.

## Primitive candidate non ancora aggiunte alla v1

Sono segnalate nel report e non nel registro:

- `RES.VARIABLE_COST`;
- `RES.CONVERSION`;
- `AREA.PLACEMENT`;
- eventuale `RES.ALLOCATION`.

Questi gap spiegano le readiness `partial` di conversioni, allocazioni, piazzamenti o adapter spell; non sono unlock calcolati e non trasformano una primitive v1 in `available`.

## Primitive v1 missing

`UI.VALUE_INPUT` è presente nel registro v1 con availability `missing`, senza ticket futuro associato. È richiesta dal solo record `guerriero-recuperare-energie` per acquisire dall'utente il tiro o valore di cura prima della mutazione HP canonica; non viene calcolato alcun unlock.

## Finding della review di Sol

### Risolti e verificati

- P0 availability futura: corretto con stato snapshot e `availabilityTransitions`;
- P0 grafo ciclico: corretto separando hard dependency, collaborazione e output UI; DAG verificato;
- P0 ruoli e record non activatable: aggiunti ruoli e `supportDisposition`;
- P0 decisioni contraddittorie sulle righe: corrette tutte le 36 righe, senza aggiungere feature;
- P1 `unsupported`/`deferred`: separati; nel campione entrambi sono zero perché nessuna decisione è terminalmente unsupported o priva di decomposizione;
- P1 readiness relativa al target: reminder e azioni istantanee non sono più bloccati da requisiti non necessari;
- P1 required primitive set: ridotto al minimo per il livello scelto;
- P1 pattern spell e decomposizione composite: applicati e verificati;
- P1 `not-exposed`: distinti i sette record non presenti nel runtime;
- ACT.REACTION: aggiunta con contratto manuale/assistito, senza trigger detection;
- primitive vietate e unlock: non presenti e non calcolati.
- gli otto residui P0/P1 sono stati applicati e verificati: `Ira` ora `none`; `Ispirazione Bardica`, `Protettori Ancestrali` e `Santuario del Crepuscolo` ora `adapter`; `Fonte di Magia` e `Preservare Vita` ora `shared-primitive` con i rispettivi blocker; `Recuperare Energie` usa review e input esplicito con readiness `partial`; `Assassinare` conserva solo `RULE.HIT_TRIGGER_REMINDER` tra i reminder di trigger/salvezza.

### Ancora aperti, senza bloccare la correzione P0/P1 del campione

- alcuni riferimenti di implementazione UI e di adapter spell richiedono una verifica P2 più puntuale contro export pubblici e test dedicati;
- `HP.TEMP_DECLARATIVE`, `ACT.ACTIVE_ACTION`, `FX.ACTIVE_ACTION`, `SRC.SELECTABLE_CASTER` ed `END.TARGET` restano `spell-adapter-needed` allo snapshot;
- `RES.VARIABLE_COST`, `RES.CONVERSION`, `AREA.PLACEMENT` e `RES.ALLOCATION` non hanno ancora un contratto v1;
- gli stat block e le entità evocate restano fuori scope per scelta, non per omissione accidentale.

## Esito e limiti

La fase campione è ora coerente per una review strutturale di schema, ruoli, disponibilità snapshot, transizioni e DAG. Non è però una dichiarazione di prontezza per classificare le 395 feature: il campione resta l'unico perimetro autorizzato, alcuni adapter e primitive candidate sono ancora aperti e due subunità sono esplicitamente fuori scope.

Non sono stati calcolati `availablePrimitiveIds`, `missingPrimitiveIds`, `candidateTicketIds` o `unlockState`. Nessun file fuori dai tre autorizzati è stato modificato.
