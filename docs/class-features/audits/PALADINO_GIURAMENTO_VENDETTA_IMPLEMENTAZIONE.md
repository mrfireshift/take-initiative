# Audit e piano di implementazione — Paladino / Giuramento di Vendetta

Data audit: 1 agosto 2026  
Regolamento: Manuale del Giocatore 2014  
Commit osservato: `9923cc3` (`Approve class feature taxonomy v1`)

## 1. Scopo e vincoli

Questo documento copre la classe base Paladino e la sottoclasse Giuramento di Vendetta.

Regola di prodotto vincolante:

- il plugin non tira dadi e non determina automaticamente il risultato di attacchi, tiri salvezza, prove o danni;
- dopo che il tavolo ha determinato un risultato, il plugin può applicare un reminder, una condizione, un'aura o una mutazione deterministica già confermata;
- il plugin deve mostrare dove si applica una capacità, per quanto dura e come termina;
- non bisogna chiedere al GM di ricopiare tipo, immunità, taglia o stat block delle creature;
- Incantesimi, condizioni, HP canonici, aura, history e Undo esistenti sono le primitive da riusare;
- `meta.hp` e `meta.hpMax` restano gli unici campi HP canonici;
- `src/class-features-runtime.json` è generato e non va modificato manualmente;
- non introdurre metadata persistenti privi di un consumer runtime;
- non effettuare refactor generali di `initiativeList.js`.

Il worktree osservato contiene modifiche non committate del batch Barbaro. Prima di implementare, l'agente deve rieseguire `git status`, lavorare sullo snapshot più recente e non sostituire integralmente `runtime-feature-overrides.json`, test o artefatti generati.

Durante questo audit il batch Barbaro ha aggiunto nel worktree condiviso `classFeatureIsReferenceOnly()` e la presentazione `Promemoria descrittivo`. Queste modifiche non appartengono al commit `9923cc3`, ma sono già presenti nello snapshot operativo e devono essere riusate, non reimplementate.

## 2. Fonti di verità

1. Descrizioni, livelli, opzioni e incantesimi del giuramento:
   `data/class-features/phb2014_classi_database_finale.json`.
2. Attivazioni, risorse, bersagli e vincoli meccanici:
   `data/class-features/phb2014_livello_meccanico_v1_1.json`.
3. Decisioni runtime curate:
   `data/class-features/runtime-feature-overrides.json`.
4. Artefatto derivato:
   `src/class-features-runtime.json`.
5. Incantesimi eseguibili:
   cataloghi e runtime Incantesimi esistenti; la feature di classe non deve duplicarli.

Sono presenti due errori editoriali nelle fonti descrittive da correggere alla fonte prima di esporre le relative carte:

- Vendicatore Implacabile: `metà delta sua velocità` deve diventare `metà della sua velocità`;
- le opzioni dello Stile di Combattimento parlano del `guerriero`: usare una formulazione neutra o riferita al paladino, senza creare un override testuale duplicato nel JSON runtime.

## 3. Stato reale corrente

### 3.1 Implementato e funzionante

- Il sottosistema Incantesimi è disponibile e contiene tutti i dieci incantesimi del Giuramento di Vendetta.
- `paladino-giuramento-di-vendetta-incanalare-divinita-giuramento-di-inimicizia` è l'unica feature Vendetta con `runtimeSupport.status: implemented`.
- Il pool condiviso `paladino-incanalare-divinita-usi` esiste ed è usato da Giuramento di Inimicizia.
- Esistono già le primitive per selezione del bersaglio, pill/condizioni, aura dinamica, rimozione di un singolo incantesimo, HP canonici, history e Undo.
- Nel worktree corrente esiste già il supporto UI/Core per le carte `reference-only`; nessun record Paladino lo usa ancora.

### 3.2 Presente nel runtime ma non implementato

Questi record compaiono in `src/class-features-runtime.json`, ma hanno `status: not-automated`, `effectPlan: null` e UI disabilitata. Non devono essere conteggiati come implementati:

- Percezione del Divino;
- Imposizione delle Mani;
- Stile di Combattimento: Protezione;
- Punizione Divina;
- Abiurare Nemico;
- Vendicatore Implacabile;
- Tocco Purificatore.

### 3.3 Non esposto nel runtime

Le passive, i contenitori e le altre opzioni sono escluse dal generatore perché classificate come `riferimento` o `passiva`. Tra queste rientrano Incantesimi, gli altri Stili di Combattimento, Salute Divina, Attacco Extra, le due aure, Punizione Divina Migliorata, Anima di Vendetta e Angelo Vendicatore.

## 4. Matrice della classe base Paladino

| Capacità | Meccanica da ricordare | Classificazione desiderata | Stato corrente | Implementazione richiesta |
|---|---|---|---|---|
| Percezione del Divino | Azione; rilevazione entro 18 m fino al termine del turno successivo; copertura totale e tipi restano al GM | Assistita | Non implementata | Marker sul Paladino con scadenza `next-turn-end`; nessuna scansione automatica dei token; usi gestiti manualmente finché il modificatore di Carisma non ha una fonte canonica |
| Imposizione delle Mani | Azione; bersaglio toccato, incluso il Paladino; riserva 5 × livello; cura scelta o costo 5 per malattia/veleno; niente effetto su non morti/costrutti | Assistita deterministica | Non implementata | Input numerico, selezione singola, cura su `meta.hp`, consumo atomico della riserva, history/Undo; tipo creatura e malattia/veleno restano conferme manuali |
| Incantesimi | Preparazione e lancio tramite il sistema Incantesimi | Descrittiva | Sistema Incantesimi già presente, reminder di classe assente | Carta descrittiva senza azione; nessun secondo executor e nessun nuovo stato spell |
| Stile di Combattimento | Una sola opzione scelta | Descrittiva | Solo Protezione è esposta ma disabilitata | Esporre contenitore e quattro opzioni; opzioni disabilitate per default e GM abilita solo quella scelta |
| Armi Possenti | Ritira 1 o 2 sui dadi di danno e usa il nuovo risultato | Descrittiva | Assente | Solo reminder; nessun tiro o sostituzione automatica |
| Difesa | +1 CA mentre indossa armatura | Descrittiva | Assente | Solo reminder; non modificare CA o metadata |
| Duellare | +2 danni con arma valida in una mano | Descrittiva | Assente | Solo reminder; nessun danno automatico |
| Protezione | Reazione, scudo, bersaglio entro 1,5 m; svantaggio al tiro per colpire | Descrittiva contestuale | Non implementata | Carta/reminder della reazione; non rilevare l'attacco e non modificare il tiro |
| Punizione Divina | Dopo un colpo confermato può spendere uno slot e tirare danni radianti | Descrittiva contestuale | Non implementata | Reminder post-colpo; non tirare danni e non creare un duplicato della riserva slot Incantesimi |
| Giuramento Sacro | Incantesimi sempre preparati e pool condiviso di Incanalare Divinità | Descrittiva | Assente | Carta descrittiva; il pool reale resta quello condiviso dalle opzioni del giuramento |
| Salute Divina | Immunità alle malattie | Descrittiva | Assente | Carta passiva senza pill o condizione permanente |
| Aumento dei Punteggi | Regola di avanzamento | Descrittiva | Assente | Carta di riferimento senza azioni né metadata |
| Attacco Extra | Due attacchi con l'azione Attaccare | Descrittiva | Assente | Carta passiva; nessuna gestione degli attacchi |
| Aura di Protezione | Paladino e alleati vicini aggiungono il modificatore di Carisma ai TS; 3 m, 9 m dal livello 18; richiede Paladino cosciente | Aura reminder automatica dopo attivazione | Assente | Aura dinamica con pill sugli alleati e marker sorgente; nessuna modifica ai tiri salvezza; coscienza gestita manualmente |
| Aura di Coraggio | Paladino e alleati vicini non possono essere spaventati; 3 m, 9 m dal livello 18; richiede Paladino cosciente | Aura reminder automatica dopo attivazione | Assente | Aura dinamica con pill sugli alleati e marker sorgente; non rimuovere automaticamente condizioni esistenti |
| Punizione Divina Migliorata | Ogni colpo in mischia aggiunge 1d8 radiante | Descrittiva | Assente | Reminder; nessun rilevamento del colpo e nessun tiro danni |
| Tocco Purificatore | Azione; termina un incantesimo sul Paladino o una creatura consenziente toccata | Assistita | Non implementata | Selezione di un bersaglio e di un singolo incantesimo attivo; riuso della rimozione spell esistente; consenso e numero di usi restano manuali finché manca una fonte canonica del Carisma |

## 5. Incantesimi del Giuramento di Vendetta

I dati sorgente contengono già l'elenco completo:

| Livello Paladino | Incantesimi |
|---|---|
| 3 | Anatema; Marchio del Cacciatore |
| 5 | Blocca Persone; Passo Velato |
| 9 | Velocità; Protezione dall'Energia |
| 13 | Esilio; Porta Dimensionale |
| 17 | Blocca Mostri; Scrutare |

Tutti sono presenti nel catalogo Incantesimi corrente. L'integrazione richiesta è soltanto descrittiva:

- il generatore deve trasferire `incantesimi_aggiuntivi` dal record della sottoclasse a `subclasses[].additionalSpellsByLevel` nel catalogo runtime;
- la tab Capacità deve mostrare la lista per il livello raggiunto e ricordare che sono sempre preparati e non contano nel limite degli incantesimi preparati;
- il lancio, la concentrazione, i bersagli, le condizioni e le durate restano interamente nel sistema Incantesimi;
- non creare nuove copie delle spell e non aggiungerle automaticamente a metadata separati.

## 6. Matrice Giuramento di Vendetta

| Capacità | Meccanica | Classificazione desiderata | Stato corrente | Implementazione richiesta |
|---|---|---|---|---|
| Abiurare Nemico | Azione, un bersaglio visibile entro 18 m, un uso di Incanalare Divinità. TS Saggezza; fallimento: spaventato e velocità 0; successo: velocità dimezzata. Dura 1 minuto o fino a danno | Assistita con esito manuale | Non implementata | Scelta manuale `TS fallito` / `TS superato`, quindi pill strutturata sul bersaglio. Immunità allo spaventato e svantaggio di immondi/non morti sono reminder, non filtri automatici. Fine anticipata per danno resta manuale |
| Giuramento di Inimicizia | Azione bonus, creatura visibile entro 3 m, vantaggio del Paladino contro quel bersaglio per 1 minuto o fino a 0 PF/incoscienza | Assistita | Implementata, da completare | Preservare selezione, range, pool e durata. Rendere espliciti vantaggio ed eventi di fine nella pill. Non modificare i tiri e non aggiungere watcher HP |
| Vendicatore Implacabile | Dopo un attacco di opportunità andato a segno può muoversi fino a metà velocità senza provocare AdO | Descrittiva contestuale | Non implementata | Reminder della reazione dopo conferma manuale del colpo; non muovere il token e non rilevare l'attacco |
| Anima di Vendetta | Quando il bersaglio di Giuramento di Inimicizia attacca, può usare la reazione per un attacco in mischia se è a portata | Descrittiva contestuale | Assente | Carta di livello 15 collegata semanticamente al Giuramento; nessun trigger o attacco automatico |
| Angelo Vendicatore | Azione, 1/ riposo lungo, durata 1 ora; volo 18 m e aura ostile 9 m. All'ingresso/inizio turno richiede TS; fallimento applica spaventato fino a 1 minuto o danno | Attivazione assistita + aura automatica di reminder | Assente | Marker sorgente per volo, aura ostile dinamica e pill `TS Saggezza da risolvere`. Il GM applica manualmente Spaventato dopo il tiro. Nessun tiro, vantaggio o movimento automatico |

## 7. Decisioni regolistiche vincolanti

### 7.1 Abiurare Nemico

- Il GM controlla visibilità, immunità e tipo della creatura senza inserire nuovi metadata.
- Il plugin non tira il TS.
- Il risultato viene scelto esplicitamente prima dell'applicazione.
- `fallito`: un solo reminder deve contenere Spaventato, velocità 0, nessun bonus alla velocità, durata massima 10 round e fine anticipata quando subisce danni.
- `superato`: reminder Velocità dimezzata, durata massima 10 round e stessa fine anticipata.
- La ricezione di danno non deve essere rilevata in questo batch: GM e Player possono terminare il singolo effetto dalla pill.
- Entrambi gli esiti consumano il medesimo pool usato da Giuramento di Inimicizia.

### 7.2 Giuramento di Inimicizia

- Non riscrivere la feature.
- Correggere soltanto `effectPlan.detail` affinché dica chi ottiene vantaggio, contro quale bersaglio e quando termina.
- La scadenza a 10 round e la rimozione manuale restano il lifecycle effettivo.
- `bersaglio a 0 PF` e `privo di sensi` devono essere visibili nel reminder; non introdurre un listener HP o condizioni solo per questa capacità.

### 7.3 Angelo Vendicatore

- Correggere tramite override i dati meccanici incompleti: attivazione `azione`, durata 600 round, un uso, recupero riposo lungo, aura 9 m.
- L'aura applica soltanto un reminder di risoluzione ai nemici nell'area.
- Non applicare Spaventato automaticamente all'ingresso o all'inizio turno.
- Dopo il fallimento confermato, il GM usa la condizione Spaventato esistente; il dettaglio deve ricordare vantaggio agli attacchi contro il bersaglio e fine anticipata al danno.
- Il volo è un marker descrittivo sul Paladino: non modificare automaticamente velocità o movimento.

## 8. Primitive da riusare o aggiungere

### 8.1 Riuso obbligatorio

- `choiceOptions` per gli esiti manuali di Abiurare Nemico;
- `paladino-incanalare-divinita-usi` come pool unico delle due opzioni;
- class feature condition/pill per reminder persistenti;
- aura engine delle Class Feature, già usato da Spirito Totemico: Lupo;
- `effectsMutations` e rimozione per `instanceId` per Tocco Purificatore;
- `calculateQuickHPChange`, `meta.hp`, `meta.hpMax`, `withItemMetaHistory` per Imposizione delle Mani;
- sistema Incantesimi corrente per gli incantesimi del giuramento;
- rimozione individuale, history e Undo esistenti.

### 8.2 Supporto descrittivo condiviso

Il batch Totemico lo ha già implementato nel worktree corrente tramite `classFeatureIsReferenceOnly(feature)`. L'agente Paladino deve conservarlo e riusarlo senza introdurre un secondo helper, un nuovo status o una presentazione parallela. Una feature descrittiva deve continuare a:

- apparire nella tab Capacità;
- mostrare `Promemoria descrittivo` e il testo sorgente;
- non mostrare `Non disponibile`;
- non generare pulsanti, quick action, context action, pill, stato o history.

Non aggiungere un nuovo status runtime per ottenere questo comportamento. Se il lavoro Paladino parte da un commit che non contiene ancora il batch Totemico, fermarsi e integrare prima quel supporto condiviso invece di duplicarlo nella patch Paladino.

### 8.3 Raggio per livello

Aura di Protezione e Aura di Coraggio richiedono 3 m fino al livello 17 e 9 m dal livello 18. Aggiungere una sola primitiva condivisa e source-driven, per esempio `radiusByClassLevel`, consumata dalla proiezione aura usando `characterBuild` già presente nella scheda iniziativa.

Requisiti:

- nessuna scelta manuale 3/9 m;
- nessun nuovo metadata sul token;
- il passaggio al livello 18 deve aggiornare l'aura alla riconciliazione successiva;
- Angelo Vendicatore continua a usare il raggio fisso di 9 m;
- nessun refactor generale dell'aura engine.

### 8.4 Valore numerico e costo variabile

Imposizione delle Mani richiede il supporto minimo condiviso `UI.VALUE_INPUT` + costo risorsa variabile:

- intero positivo;
- massimo pari alla riserva rimanente;
- medesimo valore usato per cura e consumo;
- mutazione HP e consumo risorsa nella stessa transazione/history;
- nessun calcolo casuale;
- Undo deve ripristinare entrambi.

Per la modalità malattia/veleno, il GM sceglie quanti effetti curare; costo `5 × quantità`. Non dedurre tipo creatura o condizioni non strutturate.

Non aggiungere campi Carisma al metadata in questo batch. Percezione del Divino e Tocco Purificatore devono mostrare la formula degli usi e lasciare il conteggio al tavolo finché non esiste una fonte canonica condivisa.

## 9. File e funzioni per l'implementazione

### Dati e generazione

- `data/class-features/phb2014_classi_database_finale.json`: soltanto correzioni editoriali delle fonti descritte al §2.
- `data/class-features/runtime-feature-overrides.json`: include, adapter, targeting, durata, effect plan e choice options.
- `scripts/generate-class-feature-catalog.mjs`:
  - pass-through degli incantesimi aggiuntivi di sottoclasse;
  - normalizzazione del raggio per livello;
  - eventuali campi consumati per il valore variabile.
- `src/class-features-runtime.json`: rigenerare, mai editare a mano.

### Core e runtime

- `src/classFeatureCore.js`:
  - riconoscimento reference-only;
  - risoluzione del raggio dal livello;
  - validazione del costo variabile;
  - test puri di targeting, durata e projection.
- `src/classFeatureRuntime.js`:
  - Imposizione delle Mani atomica;
  - applicazione degli esiti già scelti di Abiurare Nemico;
  - Tocco Purificatore tramite primitive spell esistenti.
- `src/classFeatureAuraCore.js`: soltanto il punto minimo necessario per ricevere il raggio già risolto; nessun nuovo membership engine.
- `src/initiative-card-modal.js`:
  - carte descrittive senza pulsante;
  - elenco incantesimi del giuramento;
  - input numerico di Imposizione delle Mani;
  - scelta esito di Abiurare Nemico;
  - selezione singolo spell di Tocco Purificatore.
- `src/classFeatureCatalog.js`: escludere i reminder descrittivi da quick action/context menu.

Evitare modifiche a `src/initiativeList.js`. Se un collegamento UI sembra richiederle, verificare prima se può essere realizzato in `initiative-card-modal.js`, `classFeatureRuntime.js` o nei core puri.

## 10. Ordine di implementazione per commit piccoli

1. **Reference UI Paladino**: supporto reference-only, passive, stili, regole con dadi, Anima/Vendicatore e lista incantesimi del giuramento.
2. **Giuramento di Inimicizia**: sola correzione del dettaglio e regressioni del pool condiviso.
3. **Abiurare Nemico**: selezione bersaglio, scelta esito manuale, pill e terminazione individuale.
4. **Aure Paladino**: raggio per livello, Aura di Protezione e Aura di Coraggio.
5. **Angelo Vendicatore**: trasformazione, durata, risorsa e aura reminder ostile.
6. **Imposizione delle Mani**: input variabile, HP canonici, risorsa e Undo.
7. **Percezione/Tocco Purificatore**: marker temporaneo e rimozione singolo spell, senza inventare una fonte Carisma.

Non unire questi passi in un refactor generale.

## 11. Test automatici obbligatori

### Catalogo e generatore

- tutti i privilegi base e Vendetta compaiono al livello corretto;
- gli Stili sono opzioni non abilitate tutte per default;
- i dieci incantesimi del giuramento sono risolti nei cataloghi spell esistenti;
- due generazioni consecutive producono lo stesso JSON;
- aggiornare i conteggi esatti dei test soltanto dopo la rigenerazione finale.

### Reminder descrittivi

- visibili nella tab Capacità;
- nessun pulsante `Attiva`, `Usa` o `Non disponibile`;
- assenti da quick action e context menu;
- nessuna modifica a `classFeatureState`, condizioni o history.

### Incanalare Divinità

- Abiurare e Inimicizia consumano lo stesso pool da un uso;
- senza uso rimanente nessuna delle due si attiva;
- Abiurare accetta un solo bersaglio, esclude il Paladino e usa 18 m;
- l'esito scelto genera la pill corretta senza eseguire il TS;
- entrambe le pill di Abiurare scadono dopo 10 round o possono essere terminate manualmente;
- rimozione della singola pill riconcilia lo stato e Undo lo ripristina;
- Inimicizia conserva 3 m, 10 round, bersaglio singolo e vantaggio soltanto del Paladino contro il bersaglio marcato.

### Aure

- Aura di Protezione e Aura di Coraggio usano 3 m ai livelli 6–17 e 9 m dal livello 18;
- Paladino coperto dal marker sorgente, alleati da membership dinamica senza pill duplicata sul caster;
- ingresso, uscita, movimento e terminazione aggiornano le pill;
- nessun tiro salvezza viene modificato;
- il GM può terminare l'aura quando il Paladino non è cosciente;
- Angelo Vendicatore usa sempre 9 m, solo creature ostili e durata 600 round;
- l'aura di Angelo crea un reminder di TS, non la condizione Spaventato automatica.

### HP, spell e history

- Imposizione delle Mani non supera `hpMax`, non usa campi HP alternativi e non consuma più della riserva;
- una singola operazione e il relativo Undo ripristinano HP e risorsa;
- auto-bersaglio consentito; non morti/costrutti restano controllo manuale;
- Tocco Purificatore rimuove soltanto lo spell instance scelto e preserva gli altri effetti;
- concentrazione e condizioni collegate vengono terminate tramite la pipeline spell esistente;
- Undo ripristina spell e collegamenti rimossi.

### Baseline generale

- test di Ira, Attacco Irruento, Spirito Totemico: Lupo e Incantesimi invariati;
- nessuna regressione su HP bar, iniziativa, movimento o aura spell.

## 12. Checklist manuale Owlbear Rodeo

1. Configurare un Paladino Vendetta ai livelli 3, 7, 15 e 20 e verificare la progressione delle carte.
2. Controllare che le carte descrittive siano leggibili da GM e Player e non sembrino feature guaste.
3. Usare Giuramento di Inimicizia su un bersaglio entro 3 m; verificare pill, pool, fine manuale e Undo.
4. Usare Abiurare Nemico scegliendo prima `fallito`, poi `superato`; verificare testi, 18 m e pool condiviso.
5. Muovere alleati dentro e fuori dalle aure base a livello 6 e 18.
6. Attivare Angelo Vendicatore, muovere un nemico nell'aura e verificare che compaia solo il reminder del TS.
7. Applicare manualmente Spaventato dopo un fallimento e terminarlo dopo danno.
8. Curare con Imposizione delle Mani un alleato e il Paladino; verificare HP, riserva e Undo.
9. Applicare più spell a un bersaglio e usare Tocco Purificatore su una sola istanza.
10. Verificare che nessuna capacità tiri dadi, determini automaticamente un esito o chieda al GM di inserire uno stat block.

## 13. Comandi finali

```text
npm.cmd run generate:class-features
npm.cmd run audit:class-features
npm.cmd test
npm.cmd run build
```

Il lavoro è accettabile solo se l'artefatto generato corrisponde agli input, tutti i test passano e il diff resta limitato ai dati Paladino/Vendetta, alle primitive strettamente necessarie e ai relativi test.

Nota sullo snapshot dell'audit: durante la stesura, `class-feature-automation-audit.json` è passato a 435 record runtime mentre `test/classFeatureAudit.test.js` continuava ad aspettarne 416. L'agente deve riallineare artefatto e conteggio tramite la pipeline di generazione/audit già esistente; non deve mascherare la divergenza con una modifica isolata al solo test.
