# Audit e piano di implementazione — Paladino, Giuramento di Devozione

## 1. Scopo

Questo audit copre soltanto il **Giuramento di Devozione**. La classe base Paladino è già stata analizzata nel documento del Giuramento di Vendetta e costituisce la baseline da preservare.

Perimetro:

- 5 capacità della sottoclasse;
- 10 incantesimi del giuramento;
- integrazioni strettamente necessarie con risorse, condizioni, aura, reminder di turno, history, Undo e sistema Incantesimi.

Regola prodotto vincolante: **il plugin non tira dadi e non determina il risultato di attacchi o tiri salvezza**. Dopo una conferma del tavolo può consumare una risorsa, applicare un reminder strutturato, riconciliare una membership d'aura e ricordare durata o condizioni di fine. Nube Sacra non deve mutare automaticamente gli HP: il suo danno fisso viene ricordato a inizio turno e applicato dal tavolo tramite i controlli HP esistenti.

Classificazione finale desiderata:

- 1 capacità descrittiva;
- 3 capacità assistite;
- 1 aura automatica di soli reminder;
- 0 capacità non supportate.

## 2. Snapshot e fonti di verità

Snapshot osservato:

- branch `main`;
- HEAD `9923cc3`;
- worktree condiviso con modifiche concorrenti non committate ai sistemi Class Feature, aura, reminder, spell e UI.

Il secondo agente deve rileggere i blocchi interessati prima della patch e non deve sostituire integralmente file già modificati.

Ordine delle fonti:

1. `data/class-features/phb2014_classi_database_finale.json`: sottoclasse, descrizioni, livelli e incantesimi del giuramento;
2. `data/class-features/phb2014_livello_meccanico_v1_1.json`: attivazioni, durata, pool e recuperi;
3. `data/class-features/runtime-feature-overrides.json`: decisioni runtime curate;
4. `scripts/generate-class-feature-catalog.mjs`: trasformazione deterministica;
5. `src/class-features-runtime.json`: artefatto generato, mai da modificare manualmente.

Baseline da riusare:

- pool condiviso `paladino-incanalare-divinita-usi`, massimo 1 e recupero a riposo breve o lungo;
- adapter generici `condition`, `condition-choice` e `aura`;
- targeting di token `CHARACTER`, portata e selezione multipla tramite `maxTargets: null`;
- condizioni Class Feature con `sourceId`, `sourceName`, `parentEffectId`, `appliedAt`, expiry, history e Undo;
- aura mobile, filtro `friendly`/`hostile`, membership e pulizia delle pill;
- `triggerPolicy` informativa consumata da `classFeatureAuraReminderCore.js`;
- pool a uso singolo per riposo lungo già usato da Angelo Vendicatore;
- sistema Incantesimi e `getSpellDefinition()` per gli incantesimi del giuramento.

## 3. Inventario e stato reale

Il catalogo sorgente contiene esattamente cinque capacità:

1. `paladino-giuramento-di-devozione-incanalare-divinita-arma-consacrata`, livello 3;
2. `paladino-giuramento-di-devozione-incanalare-divinita-scacciare-i-sacrileghi`, livello 3;
3. `paladino-giuramento-di-devozione-aura-di-devozione`, livelli 7 e 18;
4. `paladino-giuramento-di-devozione-purezza-di-spirito`, livello 15;
5. `paladino-giuramento-di-devozione-nube-sacra`, livello 20.

### Già implementate

**Nessuna delle cinque capacità è oggi completamente implementata.**

Sono però già funzionanti le primitive sottostanti: pool di Incanalare Divinità, condizioni, selezione, aura, trigger a inizio turno, history e Undo.

### Presenti ma non implementate

Questi record compaiono in `src/class-features-runtime.json`, ma sono `not-automated`, `defaultEnabled: false`, senza `effectPlan` e senza adapter operativo:

- Arma Consacrata;
- Scacciare i Sacrileghi;
- Nube Sacra.

### Assenti dall'artefatto runtime

Il generatore filtra i record passivi classificati come riferimento:

- Aura di Devozione;
- Purezza di Spirito.

### Incantesimi del Giuramento già implementati

I dieci incantesimi sono già trasferiti in `subclasses[].additionalSpellsByLevel` e tutti risolvono tramite `getSpellDefinition()`:

| Livello Paladino | Incantesimi |
|---:|---|
| 3 | Protezione dal Bene e dal Male; Santuario |
| 5 | Ristorare Inferiore; Zona di Verità |
| 9 | Faro di Speranza; Dissolvi Magie |
| 13 | Libertà di Movimento; Guardiano della Fede |
| 17 | Comunione; Colpo Infuocato |

Durante l'audit è entrata nel worktree concorrente la generalizzazione già prevista per il Chierico: `getAdditionalSubclassSpellEntries()` risolve la sottoclasse effettiva e `buildAdditionalSpellsSummary()` costruisce il titolo dal suo nome. Sullo snapshot finale la UI mostra quindi correttamente `Incantesimi del Giuramento di Devozione`.

Questa integrazione è già implementata e va soltanto preservata con test di regressione. Non riscrivere l'helper e non aggiungere un percorso specifico per Devozione.

## 4. Matrice delle capacità

| Livello | Capacità | Stato corrente | Destinazione | Logica esistente da riusare |
|---:|---|---|---|---|
| 3 | Arma Consacrata | Non implementata | Assistita | Condizione self temporanea, pool Incanalare Divinità, expiry a 10 round, terminazione e Undo comuni. Nessun selettore di arma, modifica ai tiri o illuminazione OBR. |
| 3 | Scacciare i Sacrileghi | Non implementata | Assistita dopo TS manuali | Selezione multipla, condizione strutturata `Scacciato`, pool condiviso e durata 10 round. Adapter minimo per `fallimenti selezionati`/`nessun fallimento` e rimozione indipendente della singola pill. |
| 7, 18 | Aura di Devozione | Assente | Aura automatica di reminder | Stesso pattern di Aura di Coraggio/Protezione: aura mobile, 3 m e 9 m dal 18°, membership amichevole, caster incluso, nessuna mutazione della condizione Affascinato. |
| 15 | Purezza di Spirito | Assente | Descrittiva integrata | Carta `reference-only`. Richiama gli effetti di Protezione dal Bene e dal Male, ma non crea una spell, concentrazione, slot o scadenza. |
| 20 | Nube Sacra | Non implementata | Assistita + aura automatica di reminder | Pattern Angelo Vendicatore per attivazione, aura ostile, durata e pool; `triggerPolicy` informativa a inizio turno. Nessun danno o vantaggio automatizzato. |

## 5. Logica vincolante per capacità

### 5.1 Incanalare Divinità: Arma Consacrata

Meccanica da rappresentare:

- azione;
- un uso di Incanalare Divinità;
- un'arma impugnata dal Paladino;
- durata massima 1 minuto;
- il Paladino aggiunge il proprio modificatore di Carisma ai tiri per colpire con quell'arma, minimo +1;
- l'arma è magica per la durata se non lo era già;
- luce intensa 6 m e luce fioca per ulteriori 6 m;
- termina volontariamente durante il turno, se il Paladino non impugna o trasporta più l'arma, oppure se perde i sensi.

Implementazione:

- `status: implemented`, adapter `condition`;
- `defaultEnabled: true`;
- targeting `self`;
- durata 10 round;
- costo di 1 da `paladino-incanalare-divinita-usi`;
- pill `Arma Consacrata` sul Paladino;
- dettaglio completo con bonus minimo, arma magica, luce e condizioni di fine;
- terminazione anticipata manuale dalla pill o dal Control Center;
- quick action ammessa, perché non richiede scelte runtime oltre alla conferma dell'attivazione.

Non implementare:

- selezione o metadata dell'arma;
- lettura o calcolo del Carisma;
- modifica dei tiri per colpire;
- illuminazione, visione o geometria 6 + 6 m;
- rilevamento di arma lasciata, trasporto o stato Privo di Sensi.

I 6 m e gli ulteriori 6 m nei dati meccanici descrivono la luce, non bersagli della capacità. L'override deve quindi correggere il targeting derivato a `self`.

### 5.2 Incanalare Divinità: Scacciare i Sacrileghi

Meccanica da rappresentare:

- azione e un uso di Incanalare Divinità;
- immondi e non morti visibili entro 9 m;
- ogni TS Saggezza viene tirato e interpretato al tavolo;
- soltanto i fallimenti sono Scacciati per 1 minuto o finché subiscono danni;
- ogni creatura Scacciata ha limitazioni di movimento, azione e reazione.

Flusso obbligatorio:

1. il GM conferma manualmente tipo, visibilità e portata;
2. il tavolo tira tutti i TS Saggezza;
3. il GM seleziona soltanto i fallimenti oppure sceglie `Nessun fallimento`;
4. il plugin consuma una volta `paladino-incanalare-divinita-usi`;
5. ai token selezionati applica `Scacciato` per 10 round;
6. la pill ricorda obbligo di allontanarsi, divieto di avvicinarsi volontariamente entro 9 m, nessuna reazione, azioni Scattare/liberarsi e Schivare se non può fuggire;
7. quando una creatura subisce danni, il GM termina soltanto la pill di quella creatura;
8. la rimozione dell'ultima pill chiude l'attivazione; Undo ripristina stato, pill e risorsa.

Non usare aura o membership geometrica: dopo il fallimento la creatura resta Scacciata anche se esce dai 9 m.

Non leggere tipo, immunità, stat block o risultato del TS dai token.

#### Adapter minimo richiesto

Introdurre un adapter condivisibile `turn-creatures`, composto da una funzione pura `prepareTurnCreaturesFeatureActivation()` e da due modalità:

- `failed-targets`: conserva targeting multiplo, durata ed effetto normali;
- `no-targets`: prepara una copia locale con targeting `self`, `trackingMode: instant` ed `effectPlan.kind: none`, così la risorsa viene consumata senza creare pill.

La UI della carta offre due pulsanti espliciti:

- `Applica ai fallimenti selezionati`;
- `Nessun fallimento`.

Disabilitare la quick action di questa capacità: il quick-action flow corrente non esprime in modo sicuro il caso senza fallimenti.

#### Terminazione indipendente strettamente necessaria

Il runtime corrente termina tutta un'attivazione `single-target` quando viene rimossa una qualsiasi pill, anche se `maxTargets: null`. Questo è errato per più creature Scacciate, perché ciascuna termina individualmente quando subisce danni.

Aggiungere un opt-in di definizione `targetRemovalMode: "single"`, con consumer mirato in `reconcileClassFeatureConditionRemovals()`:

- se viene rimossa una pill, eliminare soltanto quel `targetId` dall'istanza attiva;
- se restano bersagli, conservare l'istanza e le altre pill;
- se non ne restano, disattivare l'istanza;
- senza l'opt-in, preservare esattamente il comportamento corrente.

Non aggiungere nuovi campi al metadata del token: `activation.targetIds` è già persistito ed è sufficiente. Questa primitive potrà essere riusata da Scacciare Non Morti del Chierico, ma non estenderla ad altre capacità in questo batch.

### 5.3 Aura di Devozione

Meccanica da rappresentare:

- passiva dal livello 7;
- Paladino e creature amiche entro 3 m non possono essere Affascinati mentre il Paladino è cosciente;
- raggio 9 m dal livello 18.

Override:

- `include: true`;
- `status: implemented`, adapter `aura`;
- `defaultEnabled: true`;
- `automationLevel: automatica`, inteso esclusivamente come riconciliazione automatica dei reminder;
- `quickActionEligible: false`;
- targeting aura, `maxTargets: null`;
- nessuna durata e nessun costo;
- `suppressSourceCardPill: true`;
- `radiusByClassLevel`: 3 m ai livelli 7–17, 9 m ai livelli 18–20;
- membership `{ filter: "friendly", includeCaster: true }`;
- una sola pill `Immunità ad Affascinato` sul Paladino e su ogni alleato nell'aura.

La pill deve specificare che:

- il beneficio esiste soltanto mentre il Paladino è cosciente;
- il plugin non cancella automaticamente una condizione Affascinato già presente;
- il GM adjudica un eventuale effetto già in corso e termina manualmente l'aura quando il Paladino perde i sensi.

Il pulsante di attivazione serve soltanto a materializzare l'aura nella scena OBR; non rappresenta un'azione regolistica. Non introdurre listener sulla condizione Privo di Sensi e non modificare `conditions.js`.

### 5.4 Purezza di Spirito

Al livello 15 il Paladino è sempre sotto gli effetti di Protezione dal Bene e dal Male.

Implementazione:

- `include: true`;
- `status: not-automated`;
- `automationLevel: riferimento`;
- `defaultEnabled: true`;
- `quickActionEligible: false`;
- nessun `effectPlan`, pool o targeting.

La carta è sufficiente a ricordare la regola. Non applicare l'incantesimo tramite il sistema spell: ciò introdurrebbe erroneamente componenti, concentrazione e durata di 10 minuti. Il privilegio non consuma slot, non richiede concentrazione e non è una spell attiva da terminare.

Non duplicare nel catalogo Class Feature la definizione completa dell'incantesimo e non creare un metadata permanente di immunità. Il riferimento testuale già presente nella descrizione resta la fonte visibile; il catalogo Incantesimi continua a fornire i dettagli della spell quando consultato.

### 5.5 Nube Sacra

Meccanica da rappresentare:

- azione;
- un uso per riposo lungo;
- durata 1 minuto;
- luce intensa entro 9 m e luce fioca per altri 9 m;
- ogni creatura nemica che inizia il turno nella luce intensa subisce 10 danni radianti;
- il Paladino ha vantaggio ai TS contro incantesimi lanciati da immondi e non morti.

Implementazione:

- `status: implemented`, adapter `aura`;
- `defaultEnabled: true`;
- targeting aura 9 m, filtro `hostile`, caster escluso dalla membership ostile;
- durata 10 round;
- costo di un uso dal nuovo pool `paladino-giuramento-di-devozione-nube-sacra-usi`;
- pill sorgente `Nube Sacra` sul Paladino con durata, luce e vantaggio situazionale;
- pill area `Nella luce intensa di Nube Sacra` sui nemici entro 9 m;
- terminazione, scadenza, pulizia, history e Undo comuni.

Usare `triggerPolicy` già consumata da `classFeatureAuraReminderCore.js`:

- evento `turn-start`;
- `targetMode: actor`;
- `frequency: once-per-turn`;
- `resolution: informational`;
- label: `Nube Sacra: questa creatura nemica subisce 10 danni radianti. Applicali manualmente con il controllo HP.`

Il popup non deve offrire un tiro e non deve scrivere `meta.hp`. Il tavolo applica i 10 danni dopo avere considerato appartenenza, immunità, resistenza o vulnerabilità senza ricopiare lo stat block nel plugin.

L'aura visuale di 9 m rappresenta la zona con effetto sui nemici. La luce fioca esterna va ricordata nel testo della pill sorgente: non creare una seconda aura, un secondo anello, un campo visione o un light engine.

Il vantaggio del Paladino resta un reminder e non genera popup, perché il plugin non può stabilire automaticamente se un incantesimo sia stato lanciato da un immondo o non morto.

## 6. Incantesimi del Giuramento

Non modificare spell, concentrazione, expiry o applicazione degli effetti. I dieci nomi sono già corretti e risolvibili.

Preservare il percorso corrente:

1. `getAdditionalSubclassSpellEntries(profile, classId)` risolve sottoclasse e incantesimi sbloccati;
2. `buildAdditionalSpellsSummary()` mostra `Incantesimi del Giuramento di Devozione`;
3. resta visibile la nota `Sempre preparati; non contano nel limite degli incantesimi preparati`;
4. lista e titolo del Giuramento di Vendetta restano invariati;
5. non creare copie delle spell o metadata aggiuntivi.

## 7. Correzioni dati necessarie

### Database descrittivo

In `data/class-features/phb2014_classi_database_finale.json` correggere soltanto due refusi visibili:

- descrizione della sottoclasse: `questi paladini ... agisce` → `questi paladini ... agiscono`;
- Scacciare i Sacrileghi: `la creature può usare` → `la creatura può usare`.

Aggiornare SHA-256 e `dimensione_byte` in `phb2014_classi_database_report_finale.json`. Non correggere il solo artefatto runtime.

### Livello meccanico

In `data/class-features/phb2014_livello_meccanico_v1_1.json`:

1. aggiungere il pool `paladino-giuramento-di-devozione-nube-sacra-usi`:
   - owner: la feature Nube Sacra;
   - kind: `uses`;
   - capacity fixed 1, classe Paladino;
   - refresh a `riposo_lungo`, amount `massimo`;
2. aggiungere alla meccanica Nube Sacra il costo di 1 da quel pool.

Aggiornare `phb2014_livello_meccanico_report_v1_1.json`:

- `resource_pools` aumenta di uno;
- `broken_resource_pool_references` resta vuoto;
- gli altri conteggi cambiano soltanto se effettivamente ricalcolati dal validatore.

Non codificare il pool esclusivamente nell'override: le risorse nascono dal livello meccanico e il runtime JSON è derivato.

### Override

Inserire cinque override mirati in `runtime-feature-overrides.json`, secondo le sezioni precedenti. Non modificare record del Paladino base o del Giuramento di Vendetta.

## 8. File e funzioni da modificare

### Dati

- `data/class-features/phb2014_classi_database_finale.json`: due refusi;
- `data/class-features/phb2014_classi_database_report_finale.json`: hash e byte;
- `data/class-features/phb2014_livello_meccanico_v1_1.json`: pool e costo Nube Sacra;
- `data/class-features/phb2014_livello_meccanico_report_v1_1.json`: conteggio pool;
- `data/class-features/runtime-feature-overrides.json`: cinque override.

### Catalogo e UI

- `src/initiative-card-modal.js`: controlli `turn-creatures` con i due pulsanti;
- `src/class-features-runtime.json`: esclusivamente tramite `npm.cmd run generate:class-features`.

### Runtime

- `src/classFeatureRuntime.js`:
  - `prepareTurnCreaturesFeatureActivation()`;
  - branch adapter `turn-creatures` in `activateClassFeatureById()`;
  - opt-in `targetRemovalMode: "single"` in `reconcileClassFeatureConditionRemovals()`.

### File che non richiedono modifiche

- `src/initiativeList.js`;
- `src/classFeatureAuraCore.js`;
- `src/classFeatureAuraController.js`;
- `src/classFeatureAuraReminderCore.js`;
- `src/spellZoneTriggerCore.js`;
- `src/conditions.js`;
- `src/spells-srd.js` e cataloghi spell;
- `src/classFeatureCatalog.js` e il riepilogo aggiuntivo degli incantesimi, salvo test di regressione;
- sistemi HP, iniziativa, concentrazione e movimento.

## 9. Ordine delle modifiche

1. Rieseguire `git status` e rileggere i blocchi interessati nel worktree condiviso.
2. Correggere i due refusi nel database descrittivo e aggiornare il report.
3. Aggiungere pool e costo di Nube Sacra nel livello meccanico; aggiornare il report.
4. Inserire l'override descrittivo di Purezza di Spirito.
5. Inserire l'override generico di Arma Consacrata.
6. Inserire l'override Aura di Devozione usando esclusivamente l'aura esistente.
7. Implementare e testare `targetRemovalMode: "single"` senza cambiare il default.
8. Implementare `prepareTurnCreaturesFeatureActivation()` e i controlli Scacciare i Sacrileghi.
9. Inserire l'override completo di Nube Sacra con `triggerPolicy` informativa.
10. Aggiungere regressioni per il riepilogo incantesimi già generalizzato, senza modificarlo se i test passano.
11. Rigenerare catalogo e audit.
12. Eseguire test mirati, suite completa e build.
13. Rigenerare una seconda volta e verificare assenza di diff.

## 10. Rischi di regressione

- Il pool di Incanalare Divinità è condiviso con le altre opzioni del Paladino: Arma Consacrata e Scacciare i Sacrileghi non devono creare riserve separate.
- L'opt-in di rimozione per bersaglio deve lasciare invariato il lifecycle di Linguaggio Universale, Chiamata alla Caccia e ogni altra capacità multi-bersaglio.
- Il caso `Nessun fallimento` deve consumare la risorsa senza lasciare un'istanza attiva o una pill self.
- Aura di Devozione deve produrre una sola pill sul Paladino: `includeCaster: true` insieme a `suppressSourceCardPill: true` non deve produrre zero o due pill.
- L'aura non deve rimuovere `Affascinato`, né riapplicare in loop metadata di condizioni.
- Nube Sacra non deve scrivere HP né creare una coda di TS: il trigger è `informational`.
- Il titolo dinamico non deve cambiare l'elenco o la presentazione del Giuramento di Vendetta.
- Purezza di Spirito non deve apparire come spell concentrata o temporanea.
- Non toccare i percorsi fragili di iniziativa, HP bar o aura engine.

## 11. Test automatici richiesti

Baseline osservata prima dell'implementazione:

- build Vite: riuscita;
- test mirati catalogo/core/aura: 42 passati, 3 falliti per modifiche concorrenti fuori dal perimetro Devozione;
- residui correnti: conteggio catalogo atteso 53 ma artefatto a 57, test membership di Santuario ancora fermo al solo alleato, test che si aspetta ancora Santuario tra le quick action.

Il secondo agente deve rieseguire la baseline sul proprio snapshot. Non deve correggere questi tre residui dentro il batch Devozione, salvo che siano già stati risolti dal proprietario del batch concorrente.

Creare `test/paladinDevotionFeatureRuntime.test.js` e coprire almeno:

1. la sottoclasse espone esattamente cinque capacità ai livelli 3/7/15/18/20;
2. un Paladino di un altro Giuramento non riceve capacità della Devozione;
3. tutti i dieci incantesimi risolvono tramite `getSpellDefinition()`;
4. il riepilogo mostra `Incantesimi del Giuramento di Devozione` e conserva Vendetta invariata;
5. Arma Consacrata è self, dura 10 round e consuma un solo Incanalare Divinità;
6. Arma Consacrata non contiene meccaniche che modifichino attacchi, luce o visione;
7. la terminazione anticipata di Arma Consacrata rimuove la pill e conserva Undo;
8. Scacciare i Sacrileghi accetta più fallimenti, li limita a 9 m ed esclude il Paladino;
9. i TS non vengono tirati o interpretati dal plugin;
10. la modalità con fallimenti consuma una sola risorsa e applica una pill per bersaglio per 10 round;
11. la modalità senza fallimenti consuma la risorsa senza pill o istanza attiva;
12. rimuovere la pill da un bersaglio Scacciato non rimuove le altre;
13. rimuovere l'ultima pill chiude l'attivazione e Undo ripristina correttamente;
14. senza `targetRemovalMode: "single"` il comportamento precedente resta invariato;
15. Aura di Devozione risolve 3 m ai livelli 7–17 e 9 m ai livelli 18–20;
16. aura e membership includono Paladino e alleati, escludono ostili e non duplicano la pill sorgente;
17. uscita, rientro, terminazione e Undo riconciliano soltanto le pill dell'istanza corretta;
18. Aura di Devozione non rimuove o scrive condizioni Affascinato;
19. Purezza di Spirito è reference-only, senza effect plan, durata, costo o concentrazione;
20. il pool Nube Sacra vale 1 e recupera soltanto al riposo lungo;
21. Nube Sacra dura 10 round, ha aura ostile 9 m e una sola pill sorgente;
22. ogni nemico nell'aura genera una notice informativa all'inizio del proprio turno, una volta per turno;
23. la notice ricorda 10 danni radianti ma lascia `meta.hp` e `meta.hpMax` invariati;
24. Nube Sacra non crea una seconda aura da 18 m e non modifica visione;
25. terminazione e Undo di Nube Sacra ripristinano pool, stato, aura e pill;
26. due generazioni consecutive producono lo stesso artefatto.

Eseguire inoltre come regressione:

- `test/classFeatureCatalog.test.js`;
- `test/classFeatureCore.test.js`;
- `test/classFeatureAuraCore.test.js`;
- `test/classFeatureAuraController.test.js`;
- `test/classFeatureAuraReminderCore.test.js`;
- test del Giuramento di Vendetta, se presente nel branch di implementazione.

## 12. Checklist manuale GM / Player in Owlbear Rodeo

### Profilo e incantesimi

- [ ] Il Giuramento di Devozione mostra soltanto le sue cinque capacità ai livelli corretti.
- [ ] La carta Incantesimi mostra il titolo della Devozione e gli incantesimi sbloccati ai livelli 3/5/9/13/17.
- [ ] Gli incantesimi vengono aperti ed eseguiti dal sistema Incantesimi esistente.
- [ ] Slot, concentrazione, pill ed expiry spell non sono duplicati dalle Class Feature.

### Arma Consacrata

- [ ] L'attivazione consuma esattamente un Incanalare Divinità.
- [ ] Il Paladino riceve una pill per 10 round con bonus, arma magica, luce e condizioni di fine.
- [ ] Nessun tiro per colpire, Carisma, arma o luce OBR viene modificato.
- [ ] La pill può essere terminata manualmente quando l'arma non è più portata o il Paladino perde i sensi.
- [ ] Undo ripristina pool e pill.

### Scacciare i Sacrileghi

- [ ] Il tavolo determina tipo, visibilità e tutti i TS.
- [ ] Il GM seleziona soltanto i fallimenti e applica una pill a ciascuno.
- [ ] Un solo uso di Incanalare Divinità viene consumato anche con più bersagli.
- [ ] Se nessuno fallisce, il pulsante dedicato consuma la risorsa senza pill.
- [ ] Dopo danno, la pill di un bersaglio termina senza rimuovere le altre.
- [ ] Scadenza, terminazione completa e Undo funzionano.

### Aura di Devozione

- [ ] L'aura segue il Paladino e misura 3 m, oppure 9 m dal livello 18.
- [ ] Paladino e alleati ricevono una sola pill; nemici e neutrali non la ricevono.
- [ ] La pill ricorda il requisito `Paladino cosciente`.
- [ ] Una condizione Affascinato esistente non viene cancellata dal plugin.
- [ ] Se il Paladino perde i sensi, il GM termina l'aura; può riattivarla quando torna cosciente.

### Purezza di Spirito

- [ ] La carta è visibile dal livello 15.
- [ ] Non viene creata una spell attiva, non compare concentrazione e non viene consumato uno slot.
- [ ] Il testo rimanda correttamente agli effetti permanenti di Protezione dal Bene e dal Male.

### Nube Sacra

- [ ] L'attivazione consuma un uso e crea aura 9 m e pill sul Paladino per 10 round.
- [ ] La pill ricorda anche la luce fioca esterna e il vantaggio situazionale del Paladino.
- [ ] Soltanto i token ostili nella luce intensa ricevono la pill area.
- [ ] A ogni inizio turno compare una sola notice con i 10 danni radianti.
- [ ] Il GM applica i danni con il controllo HP; il plugin non modifica automaticamente HP.
- [ ] Non compare una seconda aura per la luce fioca.
- [ ] Scadenza, terminazione e Undo puliscono aura e pill e ripristinano la risorsa.

## 13. Criteri di accettazione

Il batch è accettato soltanto se:

- tutte le cinque capacità sono disponibili alla sottoclasse e ai livelli corretti;
- la classificazione finale è 1 descrittiva, 3 assistite e 1 aura automatica di soli reminder;
- nessun dado viene tirato o interpretato dal plugin;
- Arma Consacrata usa il pool condiviso e non modifica attacchi, armi o luce;
- Scacciare i Sacrileghi applica effetti soltanto dopo esiti confermati e consente la fine indipendente per bersaglio;
- Aura di Devozione include il Paladino e gli alleati, scala 3/9 m e non muta Affascinato;
- Purezza di Spirito non crea una spell attiva o concentrazione;
- Nube Sacra mostra il reminder di 10 danni a inizio turno senza scrivere HP;
- gli incantesimi del giuramento riusano il sistema Incantesimi e hanno il titolo corretto;
- source JSON, report e artefatto generato sono coerenti;
- non vengono modificati `initiativeList.js`, HP runtime, condizioni o aura engine;
- test mirati, suite completa, build e doppia generazione terminano con successo.
