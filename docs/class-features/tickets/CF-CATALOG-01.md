# CF-CATALOG-01 — Matrice cross-class delle primitive

## Baseline

Commit revisionato:

890223e

Documento tecnico di riferimento:

docs/class-features/audits/CF-CATALOG-01-AUDIT.md

## Obiettivo

Costruire il modello con cui classificare le caratteristiche di classe
non ancora implementate e determinare quali primitive runtime e UX
sono necessarie per supportarle.

Questo ticket non implementa caratteristiche e non modifica il runtime.

## Prima fase

Validare schema e tassonomia su un campione cross-class di 30–40
caratteristiche.

Il campione deve:

- coprire più classi e sottoclassi;
- essere organizzato per firma meccanica, non per classe;
- coprire il maggior numero possibile di primitive;
- includere casi semplici, compositi e ambigui;
- non essere usato come pilot di implementazione.

## Input obbligatori

Leggere:

- AGENTS.md;
- docs/class-features/audits/CF-CATALOG-01-AUDIT.md;
- src/class-features-runtime.json;
- data/class-features/class-feature-automation-audit.json;
- i cataloghi e gli overlay presenti in data/class-features;
- runtime-feature-overrides.json esclusivamente come stato corrente.

## Output richiesti

Creare esclusivamente:

- docs/class-features/catalog/primitive-registry.v1.json;
- docs/class-features/catalog/feature-matrix.sample.json;
- docs/class-features/catalog/CF-CATALOG-01-SAMPLE-REPORT.md.

## Primitive registry

Il registro deve usare soltanto le primitive definite in:

docs/class-features/audits/CF-CATALOG-01-AUDIT.md

Non aggiungere nuove primitive senza segnalarle prima nel report.

Ogni primitive deve contenere:

- primitiveId;
- category;
- contract;
- availability;
- implementationRefs;
- dependsOnPrimitiveIds;
- compatibleAutomationLevels;
- providedByTicketIds;
- stabilizedByTicketIds;
- testRefs;
- snapshotCommit.

## Feature matrix

Per ogni feature del campione compilare:

- featureId;
- snapshotCommit;
- sourcePointer;
- existingAutomationLevel;
- existingRuntimeStatus;
- targetAutomationLevel;
- classificationRationale;
- requiredPrimitiveIds;
- primaryPattern;
- secondaryPatterns;
- customCodeMode;
- ambiguity;
- dataReadiness;
- dataBlockers;
- reviewStatus;
- reviewEvidence.

Non duplicare:

- nome;
- classe;
- sottoclasse;
- livello;
- descrizione completa;
- testo regolamentare.

Questi dati restano nei cataloghi originari.

## Campi derivati

Non compilare manualmente:

- availablePrimitiveIds;
- missingPrimitiveIds;
- candidateTicketIds;
- unlockState.

Devono essere calcolabili dal registro delle primitive.

## Livelli di automazione

Usare esclusivamente:

- descriptive;
- assisted;
- automatic;
- unsupported.

Scegliere il livello minimo utile.

La mancanza di automazione completa non costituisce un difetto.

## Custom code mode

Usare esclusivamente:

- none;
- adapter;
- shared-primitive;
- feature-specific;
- not-allowed.

Non classificare come feature-specific una meccanica che può essere
ottenuta componendo primitive esistenti.

## Ambiguità

Valutare da 0 a 3:

- source;
- activation;
- targeting;
- timing;
- scaling;
- interaction.

Il livello complessivo corrisponde al valore massimo.

Una feature con ambiguità 3 deve essere unsupported o deferred.

## Vincoli

Non modificare:

- src/class-features-runtime.json;
- runtime-feature-overrides.json;
- runtimeSupport;
- file JavaScript;
- schema applicativi;
- metadata dei token;
- cataloghi o overlay originari.

Non:

- promuovere caratteristiche;
- implementare primitive;
- inventare regole mancanti;
- chiedere al GM di ricopiare dati manualistici;
- introdurre automazioni per TS, danni, movimento, resistenze o trigger;
- stimare conteggi di unlock non calcolabili.

## Casi da segnalare separatamente

Nel report elencare:

- feature che non entrano nella tassonomia;
- primitive apparentemente mancanti;
- casi candidati a shared-primitive;
- casi realmente feature-specific;
- feature con ambiguità 3;
- fonti insufficienti;
- possibili over-automation;
- incoerenze nei dati di origine.

## Criteri di accettazione

Il ticket è completato quando:

- il campione comprende 30–40 feature cross-class;
- tutte le righe rispettano lo schema;
- tutti i primitiveId esistono nel registro;
- nessuna decisione modifica il runtime;
- ogni classificazione contiene una motivazione;
- i casi ambigui sono esplicitamente segnalati;
- il report stabilisce se tassonomia e schema sono pronti per la review;
- git diff mostra modifiche soltanto nei tre output autorizzati.

## Fine del ticket

Non procedere alla classificazione delle restanti feature.

La classificazione completa richiede prima la review e l’approvazione
dello schema e della tassonomia.
