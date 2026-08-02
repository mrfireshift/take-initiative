# Audit e piano di implementazione — Bardo, Collegio dell'Eloquenza

## 1. Scopo

Questo documento copre esclusivamente il **Collegio dell'Eloquenza**. La classe base Bardo e il Collegio della Sapienza non vengono riaperti: il loro comportamento corrente costituisce la baseline da preservare.

Regole vincolanti:

- il plugin non tira dadi e non determina il successo o il fallimento di prove, attacchi o tiri salvezza;
- il plugin può registrare un risultato già tirato manualmente quando quel valore deve restare visibile in un reminder;
- le capacità persistenti devono mostrare sorgente, bersaglio, durata e condizioni di fine;
- Ispirazione Bardica esistente, relativo pool, pill, history, Undo e rimozione sono primitive da riusare;
- non introdurre un secondo sistema di Ispirazione Bardica o una pill concorrente;
- non automatizzare visibilità, udibilità, successo del tiro, consumo degli slot o modificatori di Carisma;
- `src/class-features-runtime.json` è generato e non va modificato manualmente;
- nessuna modifica a HP, concentrazione, incantesimi, iniziativa, movimento, aura engine o `initiativeList.js` è necessaria per questo batch.

## 2. Snapshot e fonti di verità

Snapshot osservato:

- branch `main`;
- HEAD `9923cc3` (`Approve class feature taxonomy v1`);
- worktree condiviso con modifiche concorrenti non committate ai sistemi Class Feature e Bardo.

Prima di implementare, il secondo agente deve rieseguire `git status --short` e rileggere i blocchi coinvolti. Non deve sostituire integralmente file già modificati.

Ordine delle fonti:

1. `data/class-features/tasha_sottoclassi_database_finale.json`: descrizioni, livelli e appartenenza alla sottoclasse;
2. `data/class-features/tasha_livello_meccanico_v1_0.json`: attivazioni, bersagli, costi, pool e durata;
3. `data/class-features/runtime-feature-overrides.json`: decisioni runtime curate;
4. `scripts/generate-class-feature-catalog.mjs`: trasformazione deterministica;
5. `src/class-features-runtime.json`: artefatto derivato;
6. runtime Bardo corrente: fonte operativa per Ispirazione Bardica, relativo dado e relativo lifecycle.

Le cinque descrizioni risultano `manuale_verificato`, con fonte **Calderone Omnicomprensivo di Tasha**, pagine 28–29. Non riscrivere il testo negli override.

## 3. Stato reale corrente

### Già implementato

Nessuna delle cinque capacità del Collegio dell'Eloquenza è implementata.

Tutti i record sono presenti nell'artefatto generato, ma hanno:

- `defaultEnabled: false`;
- `runtimeSupport.status: not-automated`;
- `runtimeSupport.adapter: null`;
- `effectPlan: null`;
- targeting normalizzato erroneamente su `self`;
- durata istantanea o non definita.

Non vanno quindi conteggiati come capacità utilizzabili.

### Già disponibile come baseline riusabile

- Ispirazione Bardica base è implementata con selezione singola, portata 18 m, pill di 10 minuti, pool condiviso, history, Undo e rimozione manuale;
- il dado di Ispirazione è derivato dalla progressione Bardo: d6, d8, d10, d12;
- il pool con massimo basato sul modificatore di Carisma può essere configurato manualmente senza inventare un valore;
- esistono expiry `next-turn`, durata in ore, target multipli e controlli speciali nel modal;
- le condizioni Class Feature conservano già `sourceId`, `sourceName`, `parentEffectId`, `appliedAt` ed expiry.

## 4. Matrice delle capacità

| Livello | Capacità | Stato corrente | Classificazione richiesta | Implementazione |
|---:|---|---|---|---|
| 3 | Arte Oratoria | Record disabilitato | Descrittiva | Reminder per Persuasione e Inganno; nessuna lettura o sostituzione del d20. |
| 3 | Parole Inquietanti | Record disabilitato | Assistita | Tiro manuale del dado, inserimento del risultato, scelta di un bersaglio entro 18 m e reminder fino al prossimo TS o all'inizio del prossimo turno del Bardo. |
| 6 | Ispirazione Infallibile | Record disabilitato | Descrittiva integrata | Carta passiva e integrazione nel reminder di Ispirazione Bardica: su fallimento il dado non viene rimosso. |
| 6 | Linguaggio Universale | Record disabilitato | Assistita | Selezione dei destinatari, marker di 1 ora e scelta tra uso gratuito giornaliero oppure slot già speso e confermato al tavolo. |
| 14 | Ispirazione Contagiosa | Record disabilitato | Assistita | Dopo un successo confermato, reazione, scelta di un nuovo destinatario e applicazione della normale Ispirazione Bardica senza consumarne il pool base. |

Conclusione: **tutte e cinque le capacità vanno implementate**. Due sono reminder descrittivi; tre richiedono un flusso assistito.

## 5. Analisi regolistica e logica vincolante

### 5.1 Arte Oratoria — descrittiva

Quando il Bardo effettua una prova di Carisma (Persuasione) o Carisma (Inganno), può considerare un risultato del d20 pari o inferiore a 9 come 10.

Implementazione:

- mostrare la carta dal 3° livello;
- classificare la capacità come `reference`, non come tracciamento;
- evidenziare che riguarda soltanto Persuasione e Inganno;
- non leggere, sostituire o tirare il d20;
- non creare condizioni, pill, bersagli, risorse o history.

### 5.2 Parole Inquietanti — assistita

Come azione bonus il Bardo spende un uso di Ispirazione Bardica, sceglie una creatura visibile entro 18 m e tira manualmente il proprio dado di Ispirazione. Il bersaglio sottrae quel risultato dal prossimo tiro salvezza effettuato prima dell'inizio del turno successivo del Bardo.

Flusso:

1. il giocatore tira fisicamente il dado di Ispirazione Bardica;
2. inserisce nel controllo della capacità soltanto il risultato già ottenuto;
3. seleziona una creatura entro 18 m;
4. il plugin convalida portata e facce del dado, ma non visibilità;
5. il percorso comune consuma un uso di Ispirazione Bardica, se il pool è stato configurato;
6. il bersaglio riceve una pill `Parole Inquietanti −N` con il valore inserito;
7. la pill scade automaticamente all'inizio del prossimo turno del Bardo tramite `duration.timing: next-turn`;
8. il GM la rimuove prima quando il bersaglio effettua il suo prossimo tiro salvezza;
9. history e Undo usano il percorso Class Feature comune.

Vincoli:

- il valore ammesso è un intero da 1 al massimo del dado corrente del Bardo;
- il dado corrente deve essere ricavato dal pool `bardo-ispirazione-bardica-usi`, non duplicato nell'override;
- il plugin non determina quando avviene un TS e non sottrae numericamente il risultato;
- non rilevare visibilità né successo/fallimento;
- non escludere automaticamente il Bardo dalla selezione: il testo non dice “un'altra creatura”; non aggiungere un vincolo non presente nella fonte;
- nessuna quick action: il flusso richiede risultato manuale e bersaglio.

Per evitare un nuovo campo metadata, conservare il risultato nel `choiceId` già esistente con forma `value-N`. L'adapter prepara una copia locale della feature con nome/dettaglio dinamici e poi delega a `planClassFeatureActivation()` e al writer comune. Non creare una seconda struttura di stato.

### 5.3 Ispirazione Infallibile — descrittiva con integrazione

Quando una creatura aggiunge il dado di Ispirazione Bardica a una prova, un attacco o un TS e il tiro fallisce, può conservare il dado.

La capacità non deve avere un pulsante autonomo e non deve creare una seconda pill. Modifica invece la condizione di terminazione della pill di Ispirazione Bardica esistente.

Implementazione:

- esporre la carta descrittiva dal 6° livello;
- quando la sorgente è un Bardo dell'Eloquenza di almeno 6° livello e la capacità è abilitata, la pill di Ispirazione Bardica deve aggiungere: `Se il tiro fallisce, conserva il dado; rimuovi la pill soltanto quando il dado è consumato con successo o scade`;
- lo stesso testo deve apparire sia sull'Ispirazione Bardica normale sia su quella concessa da Ispirazione Contagiosa;
- il tavolo decide se il tiro è fallito e lascia o rimuove manualmente la pill;
- non intercettare prove, attacchi o TS;
- per Bardi di altre sottoclassi il dettaglio della pill deve restare invariato.

L'integrazione deve avvenire preparando il dettaglio della condizione prima di chiamare `classFeatureConditionInstancesForActivation()`. Non duplicare la logica di scrittura o rimozione delle condizioni.

### 5.4 Linguaggio Universale — assistita

Con un'azione il Bardo sceglie una o più creature visibili entro 18 m, fino al proprio modificatore di Carisma con minimo una. Per 1 ora esse comprendono magicamente ciò che il Bardo dice, indipendentemente dalla lingua. Dopo l'uso gratuito la capacità torna con un riposo lungo; può essere riutilizzata spendendo uno slot di qualsiasi livello.

Flusso:

1. il giocatore sceglie `Uso gratuito` oppure `Slot già speso`;
2. nel secondo caso conferma esplicitamente di avere segnato lo slot sulla scheda o nel sistema spell competente;
3. seleziona uno o più token creatura entro 18 m;
4. il runtime valida portata e selezione, ma non visibilità né il limite basato su Carisma;
5. ogni destinatario riceve il reminder per 1 ora, cioè 600 round;
6. l'uso gratuito consuma il pool fisso da 1 e recupera al riposo lungo;
7. l'uso tramite slot non consuma il pool gratuito e non muta gli slot;
8. rimozione, scadenza, history e Undo usano il percorso comune.

La pill deve chiarire che:

- i bersagli comprendono il Bardo;
- la capacità non consente automaticamente al Bardo di comprendere le loro risposte;
- visibilità iniziale e numero massimo di bersagli restano conferme del tavolo.

Il profilo non espone un modificatore di Carisma canonico: non introdurre `meta.cha`, non chiedere al GM di ricopiare la caratteristica e non inventare un massimo. Consentire selezione multipla con il limite spiegato nel reminder.

L'adapter deve seguire il pattern già usato per le preparazioni dinamiche:

- modalità `daily`: copia locale con il costo sorgente invariato;
- modalità `slot`: copia locale con `resourceCosts: []`, ammessa soltanto dopo conferma esplicita;
- `choiceId` rispettivamente `daily` e `slot`;
- dopo la preparazione, chiamare il planner e il writer comuni.

Non introdurre un inventario slot Class Feature e non cambiare il sottosistema Incantesimi.

### 5.5 Ispirazione Contagiosa — assistita con riuso completo

Quando una creatura entro 18 m usa un dado di Ispirazione Bardica su prova, attacco o TS e ha successo, il Bardo può usare la reazione per concedere un dado a un'altra creatura entro 18 m che possa sentirlo. Il nuovo dado non consuma usi di Ispirazione Bardica. Le reazioni disponibili sono pari al modificatore di Carisma, minimo una, e tornano al riposo lungo.

Flusso:

1. il tavolo conferma manualmente che la prima creatura era entro 18 m, ha usato il dado e ha avuto successo;
2. il Bardo conferma l'uso della reazione;
3. seleziona esattamente un nuovo destinatario diverso da sé entro 18 m;
4. il tavolo conferma che il destinatario possa sentirlo;
5. il runtime consuma un uso del pool `bardo-collegio-dell-eloquenza-ispirazione-contagiosa-usi`, se configurato;
6. non consuma il pool `bardo-ispirazione-bardica-usi`;
7. applica al destinatario la normale pill `Ispirazione Bardica`, con dado per livello del Bardo e durata 10 minuti;
8. impedisce l'applicazione se il destinatario possiede già una Ispirazione Bardica attiva, qualunque sia la fonte;
9. dal 6° livello la pill include il reminder di Ispirazione Infallibile;
10. history, Undo, scadenza e rimozione restano quelli dell'Ispirazione Bardica esistente.

Non selezionare né memorizzare la prima creatura: serve soltanto a confermare il trigger. Non rilevare il successo, non tirare il dado e non applicare bonus ai tiri.

Il massimo del pool dipende dal modificatore di Carisma, che non è canonico nel profilo. Riutilizzare l'editor manuale massimo/corrente già accettato per Ispirazione Bardica; non introdurre nuovi metadata di caratteristica.

## 6. Raccordi runtime strettamente necessari

### 6.1 Risultato manuale persistente senza nuovo schema

Parole Inquietanti deve ricordare un numero tirato al tavolo. Riutilizzare:

- parametro runtime `manualValue` soltanto come input transitorio;
- `choiceId: value-N` come persistenza già supportata;
- copia locale dell'`effectPlan` per costruire nome e dettaglio della pill.

Non aggiungere `rolledValue`, `manualRoll` o campi equivalenti ai metadata.

### 6.2 Identità condivisa della condizione di Ispirazione

Ispirazione Contagiosa è una fonte diversa dello stesso effetto Ispirazione Bardica. Aggiungere nell'`effectPlan` opzionale `conditionEffectId`:

- assente: il condition effect ID resta `feature.id`;
- presente: `classFeatureConditionInstance()` usa quel valore come `effectId` della pill;
- il preflight `bardic-inspiration` usa lo stesso ID per verificare lo stacking.

Per Ispirazione Contagiosa impostare:

- `conditionEffectId: bardo-ispirazione-bardica`;
- stacking massimo 1 per bersaglio;
- `conditionName: Ispirazione Bardica`.

Il campo ha consumer runtime e test; non è metadata inutilizzato. `parentEffectId` continua a identificare l'istanza di Ispirazione Contagiosa, quindi rimozione e Undo restano corretti.

### 6.3 Pagamento alternativo senza gestione degli slot

Linguaggio Universale richiede un adapter soltanto per scegliere se conservare o rimuovere localmente il costo del pool gratuito. Lo slot deve essere confermato come già speso e non viene scritto dal plugin.

Non creare una primitive generale per inventari o conversioni di slot.

## 7. Modifiche ai dati

### `data/class-features/tasha_sottoclassi_database_finale.json`

- conservare nomi, livelli, pagine e descrizioni verificate;
- correggere soltanto eventuali errori testuali dimostrati rispetto alla fonte;
- non inserire adapter, pill o chiavi UI.

### `data/class-features/tasha_livello_meccanico_v1_0.json`

Correggere i record meccanici:

- Arte Oratoria: `automation_level: riferimento`, attivazione passiva e trigger limitato a Persuasione/Inganno;
- Parole Inquietanti: bersaglio creatura singola, portata 18 m, visibilità richiesta, costo di un uso di Ispirazione, risultato del dado manuale, durata fino al prossimo TS o all'inizio del prossimo turno del Bardo;
- Ispirazione Infallibile: `automation_level: riferimento`, trigger dopo uso fallito di Ispirazione su prova/attacco/TS;
- Linguaggio Universale: target multipli visibili entro 18 m, limite testuale `max(1, modificatore_carisma)`, durata 1 ora e pool gratuito già esistente;
- Ispirazione Contagiosa: reazione dopo successo confermato, destinatario singolo diverso dal Bardo entro 18 m che possa sentirlo, pool proprio e beneficio Ispirazione Bardica.

Il formato meccanico corrente non modella in modo eseguibile costi alternativi. Non introdurre una nuova tassonomia per il solo slot di Linguaggio Universale: la descrizione verificata resta fonte della regola e l'override/runtime implementa il bivio assistito.

### `data/class-features/runtime-feature-overrides.json`

Decisioni esatte:

| ID | Stato / adapter | Targeting | Durata | Quick action |
|---|---|---|---|---:|
| `bardo-collegio-dell-eloquenza-arte-oratoria` | `not-automated`, reference | self descrittivo | nessuna | false |
| `bardo-collegio-dell-eloquenza-parole-inquietanti` | `implemented` / `unsettling-words` | `single-target`, 18 m, max 1, `excludeSource: false` | `next-turn` | false |
| `bardo-collegio-dell-eloquenza-ispirazione-infallibile` | `not-automated`, reference | self descrittivo | nessuna | false |
| `bardo-collegio-dell-eloquenza-linguaggio-universale` | `implemented` / `universal-speech` | `single-target`, 18 m, `maxTargets: null`, `excludeSource: false` | 600 round | false |
| `bardo-collegio-dell-eloquenza-ispirazione-contagiosa` | `implemented` / `bardic-inspiration` | `single-target`, 18 m, max 1, `excludeSource: true` | 100 round | false |

Tutte le cinque voci devono avere `include: true` e `defaultEnabled: true`.

Effect plan:

- Parole Inquietanti: condizione/debuff sul prossimo TS con dettaglio completato dall'adapter;
- Linguaggio Universale: condizione/buff di comprensione unidirezionale;
- Ispirazione Contagiosa: condizione `Ispirazione Bardica`, `conditionEffectId` condiviso e stacking massimo 1.

Non duplicare negli override la progressione d6/d8/d10/d12.

## 8. File e funzioni da modificare

### Generatore

#### `scripts/generate-class-feature-catalog.mjs`

- in `normalizeStacking()`/costruzione feature accettare lo stacking curato dell'override oltre a quello meccanico;
- non modificare `normalizeDuration()`: ore, `next-turn` e round sono già supportati nello snapshot corrente;
- preservare l'output deterministico.

### Core

#### `src/classFeatureCore.js`

- in `classFeatureEffectProjection()` preservare `effectPlan.conditionEffectId` con sanitizzazione;
- in `classFeatureConditionInstance()` usare `projection.conditionEffectId || feature.id` come `effectId`;
- non modificare `normalizeClassFeatureState()`: il valore manuale usa `choiceId` esistente;
- non cambiare expiry, history o target planner.

### Runtime

#### `src/classFeatureRuntime.js`

- estendere `preflightBardicInspirationTarget()` affinché confronti il `conditionEffectId` proiettato, non necessariamente `feature.id`;
- aggiungere una preparazione circoscritta `unsettling-words` che valida il valore rispetto al dado corrente e crea `choiceId: value-N`;
- aggiungere una preparazione circoscritta `universal-speech` per le modalità `daily` e `slot`;
- prima del writer delle condizioni, produrre un dettaglio breve di Ispirazione Bardica che includa Ispirazione Infallibile soltanto per il build Eloquenza valido e abilitato;
- dopo ogni preparazione delegare a `planClassFeatureActivation()` e `classFeatureConditionInstancesForActivation()`;
- aggiungere errori utente specifici per valore del dado non valido e conferma slot mancante;
- non creare writer di condizioni o cronologie paralleli.

### UI

#### `src/initiative-card-modal.js`

- aggiungere le costanti dei tre ID assistiti;
- `buildUnsettlingWordsControls()`: input numerico con massimo derivato dal dado corrente, nota `tira il dado al tavolo`, selezione bersaglio e conferma;
- `buildUniversalSpeechControls()`: select pagamento, conferma slot già speso, selezione multipla e attivazione;
- Ispirazione Contagiosa usa il normale controllo di selezione/attivazione oppure un pulsante con testo `Conferma reazione`, senza un nuovo modal;
- non offrire quick action per nessuna capacità della sottoclasse;
- mostrare nel riepilogo attivo `fino all'inizio del prossimo turno` per Parole Inquietanti e i round residui per le altre.

#### `initiative-card-modal.html`

Riutilizzare `.class-feature-special-controls`, input e select esistenti. Nessuna modifica è necessaria salvo un problema di layout verificato; non creare nuovi pannelli.

### Catalogo derivato

#### `src/class-features-runtime.json`

Rigenerare con `npm run generate:class-features`. Non editare manualmente.

### Test

Creare `test/bardEloquenceFeatureRuntime.test.js` e aggiornare test core/catalogo solo per le primitive effettivamente estese.

### File da non modificare

- `src/initiativeList.js`;
- sistema Incantesimi e concentrazione;
- HP e HP bar;
- aura engine;
- movimento e iniziativa;
- implementazioni del Collegio della Sapienza, salvo test di regressione.

## 9. Ordine vincolante di implementazione

1. Ripetere snapshot Git e controllare sovrapposizioni con il batch Bardo corrente.
2. Correggere esclusivamente i cinque record meccanici Tasha.
3. Aggiungere i cinque override runtime.
4. Estendere la sola normalizzazione dello stacking da override.
5. Rigenerare il catalogo e verificare il diff delle sole voci attese.
6. Implementare e testare `conditionEffectId` condiviso.
7. Implementare Parole Inquietanti con valore manuale in `choiceId`.
8. Integrare Ispirazione Infallibile nel dettaglio dell'Ispirazione esistente.
9. Implementare Linguaggio Universale con pagamento alternativo.
10. Collegare Ispirazione Contagiosa alla primitive Bardic Inspiration.
11. Aggiungere UI e test specializzati.
12. Eseguire generazione due volte, test mirati, suite completa e build.
13. Completare la checklist Owlbear Rodeo GM/Player.

## 10. Test automatici obbligatori

### Catalogo e gating

- le cinque capacità hanno livelli 3/3/6/6/14;
- compaiono soltanto per `bardo-collegio-dell-eloquenza`;
- Arte Oratoria e Ispirazione Infallibile sono reference senza pulsante;
- le tre capacità assistite sono `implemented` e senza quick action;
- nessun record del Collegio della Sapienza cambia comportamento.

### Arte Oratoria

- il record meccanico è reference e limitato a Persuasione/Inganno;
- nessun effect plan attivo, risorsa o condizione viene prodotto;
- nessun RNG è invocato.

### Parole Inquietanti

- al livello 3 accetta 1–6 e rifiuta 0 o 7;
- al livello 5 accetta fino a 8, al 10 fino a 10 e al 15 fino a 12;
- il dado proviene dal pool Bardo canonico;
- seleziona un solo bersaglio entro 18 m;
- conserva `choiceId: value-N` e mostra N in nome/dettaglio pill;
- consuma un uso di Ispirazione quando il contatore è configurato;
- expiry esatta: inizio del prossimo turno della sorgente con anchor `next-turn`;
- rimozione anticipata e Undo non lasciano istanze residue;
- non rileva il TS e non modifica alcun tiro.

### Ispirazione Infallibile

- una pill concessa da un Bardo Eloquenza di livello 6 contiene il reminder di conservazione su fallimento;
- al livello 5 o con altra sottoclasse il testo non viene aggiunto;
- disabilitando la capacità passiva il testo non viene aggiunto;
- la pill resta unica e mantiene il lifecycle base.

### Linguaggio Universale

- la modalità `daily` consuma il pool fisso da 1;
- la modalità `slot` richiede conferma e non consuma il pool gratuito;
- nessuna delle due modalità modifica slot o spell metadata;
- accetta più bersagli entro 18 m senza inventare il modificatore di Carisma;
- crea pill di 600 round con sorgente e timestamp corretti;
- il testo specifica comprensione unidirezionale;
- history, Undo, scadenza e terminazione manuale sono coerenti.

### Ispirazione Contagiosa

- richiede esattamente un destinatario diverso dal Bardo entro 18 m;
- consuma soltanto il pool di Ispirazione Contagiosa;
- non consuma il pool base di Ispirazione Bardica;
- crea condizione `Ispirazione Bardica` con `effectId: bardo-ispirazione-bardica` e `parentEffectId` dell'istanza Contagiosa;
- rifiuta un bersaglio che possiede già Ispirazione Bardica normale o contagiosa;
- usa il dado corrente del Bardo e dura 100 round;
- include il reminder di Ispirazione Infallibile;
- rimozione della pill termina l'istanza corretta e Undo ripristina pool e marker;
- non legge il tiro che ha attivato la reazione.

### Regressione e determinismo

- `npm run generate:class-features` eseguito due volte produce lo stesso file;
- test Bardo/Sapienza esistenti restano verdi;
- Ispirazione Bardica normale mantiene selezione, pool, durata e stacking già accettati;
- test di condizioni, history/Undo e catalogo restano verdi;
- suite completa e `npm run build` passano;
- nessun test usa casualità per risolvere le capacità.

## 11. Checklist manuale GM/Player in Owlbear Rodeo

### Preparazione

- [ ] Configurare un Bardo del Collegio dell'Eloquenza ai livelli 3, 6 e 14.
- [ ] Configurare manualmente massimo/corrente di Ispirazione Bardica e, al 14°, di Ispirazione Contagiosa.
- [ ] Preparare almeno tre token creatura, uno entro e uno oltre 18 m.
- [ ] Verificare carta e reminder sia dalla vista GM sia dalla vista Player.

### Arte Oratoria

- [ ] Verificare il reminder su Persuasione/Inganno.
- [ ] Verificare che non esista un pulsante di tiro o applicazione.

### Parole Inquietanti

- [ ] Tirare fisicamente il dado, inserire un risultato valido e scegliere un bersaglio.
- [ ] Verificare valore, sorgente e scadenza nella pill.
- [ ] Provare un valore oltre il dado corrente e un bersaglio oltre 18 m.
- [ ] Rimuovere la pill dopo il prossimo TS e provare Undo.
- [ ] Lasciarla attiva e verificare la scadenza all'inizio del prossimo turno del Bardo.

### Ispirazione Infallibile

- [ ] Concedere Ispirazione Bardica normale e leggere il reminder su fallimento.
- [ ] Simulare un fallimento lasciando la pill attiva.
- [ ] Simulare un successo rimuovendo la pill.
- [ ] Verificare che un Bardo non Eloquenza non riceva il testo aggiuntivo.

### Linguaggio Universale

- [ ] Usare la carica gratuita su più bersagli e verificare 1 ora di durata.
- [ ] Verificare che visibilità e massimo Carisma siano reminder manuali.
- [ ] Con carica esaurita, confermare uno slot già speso e riattivare su un altro bersaglio.
- [ ] Verificare che nessuno slot del plugin venga creato, consumato o ripristinato.
- [ ] Provare scadenza, terminazione manuale e Undo.

### Ispirazione Contagiosa

- [ ] Confermare manualmente il successo che attiva la reazione.
- [ ] Scegliere un nuovo destinatario e verificare la normale pill Ispirazione Bardica.
- [ ] Controllare che diminuisca soltanto il pool Contagiosa.
- [ ] Tentare di ispirare un token già ispirato e verificare il rifiuto.
- [ ] Controllare dado corrente, durata, testo Infallibile, rimozione e Undo.

## 12. Criteri di accettazione

Il batch è accettabile soltanto se:

- tutte e cinque le capacità sono visibili ai livelli corretti e soltanto per la sottoclasse corretta;
- nessun dado viene tirato o interpretato dal plugin;
- Parole Inquietanti conserva soltanto il risultato inserito dopo il tiro manuale e termina correttamente;
- Ispirazione Infallibile modifica il reminder esistente senza creare una seconda pill;
- Linguaggio Universale rappresenta destinatari e durata, preservando l'alternativa slot senza gestire gli slot;
- Ispirazione Contagiosa riusa realmente identità, stacking, dado e lifecycle di Ispirazione Bardica;
- nessun modificatore di Carisma viene inventato o duplicato nei metadata;
- history, Undo, expiry e rimozione restano affidati alle primitive comuni;
- nessun file fuori scope viene modificato;
- catalogo generato, test e build risultano deterministici e verdi.

## 13. Consegna richiesta al secondo agente

Il report finale deve indicare:

- commit/snapshot effettivamente implementato;
- file modificati e motivo di ogni modifica;
- conferma che il runtime JSON è stato rigenerato e non editato a mano;
- risultati della generazione ripetuta, test mirati, suite completa e build;
- esito della checklist GM/Player;
- eventuali deviazioni da questo piano, fermandosi prima di introdurre nuovi workflow o infrastrutture generali.
