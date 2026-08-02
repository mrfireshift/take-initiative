# Audit e piano di implementazione — Bardo / Collegio della Sapienza

Data audit: 1 agosto 2026  
Regolamento: Manuale del Giocatore 2014  
Commit osservato: `9923cc3` (`Approve class feature taxonomy v1`)

## 1. Scopo e decisione di prodotto

Questo documento copre prima la classe base Bardo e poi il Collegio della Sapienza.

Regola vincolante:

- il plugin non tira il dado di Ispirazione Bardica, Dadi Vita, dadi di cura, d20 o dadi di danno;
- il plugin non modifica automaticamente prove di caratteristica, tiri per colpire, tiri salvezza, tiri di danno o CA;
- il plugin può mostrare chi produce l'effetto, chi lo riceve, la portata, il momento di utilizzo, la durata e le condizioni di fine;
- un effetto persistente e deterministico può essere rappresentato con una pill e terminato manualmente o dal lifecycle esistente;
- una capacità istantanea basata su un tiro resta un reminder descrittivo: non deve creare pill senza durata;
- Incantesimi resta l'unico sottosistema che applica e termina incantesimi;
- il plugin non deve creare un secondo elenco di incantesimi conosciuti o di slot;
- `src/class-features-runtime.json` è un artefatto generato e non va modificato manualmente;
- nessun nuovo metadata persistente è ammesso senza un consumer runtime e test;
- non modificare HP, HP temporanei, concentrazione, iniziativa, aura engine o `initiativeList.js` salvo una necessità dimostrata da questo batch.

Il risultato desiderato è **reminder-first**. Una carta descrittiva corretta è un'implementazione completa quando non esiste uno stato utile da conservare. Un pulsante che non produce stato e non aiuta a risolvere la regola è invece da evitare.

## 2. Snapshot e fonti di verità

Il worktree osservato è condiviso e contiene ampie modifiche non committate del batch Barbaro/Totemico/Paladino. L'agente deve rieseguire `git status`, lavorare sullo snapshot più recente e non sostituire integralmente file già modificati da altri agenti.

Fonti, in ordine:

1. Descrizioni, livelli e progressione del dado: `data/class-features/phb2014_classi_database_finale.json`.
2. Attivazioni, bersagli, durata, costi e pool: `data/class-features/phb2014_livello_meccanico_v1_1.json`.
3. Decisioni runtime curate: `data/class-features/runtime-feature-overrides.json`.
4. Generatore: `scripts/generate-class-feature-catalog.mjs`.
5. Artefatto derivato: `src/class-features-runtime.json`.
6. Sottosistema Incantesimi esistente per i normali lanci e la loro concentrazione.

Le descrizioni delle quattro capacità del Collegio della Sapienza risultano `foundry_verificato`; Incantesimi è `manuale_verificato`. Non inventare testo regolamentare negli override. Se una correzione riguarda la regola, correggere prima il JSON sorgente e rigenerare.

## 3. Stato reale corrente

### 3.1 Già implementato e riutilizzabile

- Il sistema Incantesimi è funzionante e resta l'executor per i normali incantesimi del Bardo e per quelli appresi con Segreti Magici.
- Esistono già carta Capacità, promemoria descrittivo, selezione di un token, controllo della portata, condizioni/pill, expiry a round e a confine di turno, rimozione individuale, history e Undo.
- Esistono già aura dinamica, filtro delle creature amiche e riconciliazione entrata/uscita dall'area.
- Il JSON sorgente contiene già la progressione del dado `d6/d8/d10/d12`, il vincolo di una sola Ispirazione per bersaglio, la durata di 10 minuti e il cambio di recupero al 5° livello.

Questa infrastruttura non significa che le capacità del Bardo siano già utilizzabili.

### 3.2 Capacità realmente implementate

Nessuna capacità di classe o del Collegio della Sapienza ha oggi `runtimeSupport.status: implemented`.

`bardo-incantesimi` è **funzionalmente coperta** dal sistema Incantesimi, ma la sua carta di classe non è esposta. È quindi l'unica voce già implementata come sottosistema, non come Class Feature.

### 3.3 Presenti nell'artefatto, ma non implementate

I record seguenti esistono nel runtime generato ma hanno azione disabilitata, `runtimeSupport.status: not-automated` ed `effectPlan: null`:

- `bardo-ispirazione-bardica`;
- `bardo-controfascino`;
- `bardo-collegio-della-sapienza-parole-taglienti`.

Non vanno conteggiati come implementati.

### 3.4 Non esposte nel runtime

Sono assenti tutte le altre voci della classe base e tre delle quattro capacità del Collegio:

- Incantesimi, Factotum, Canto di Riposo, Collegio Bardico, Maestria, Aumento dei Punteggi di Caratteristica, Fonte di Ispirazione, Segreti Magici, Ispirazione Superiore;
- Competenze Bonus, Segreti Magici Aggiuntivi, Abilità Impareggiabile.

### 3.5 Cause precise

1. Il generatore esclude normalmente i record `riferimento` e passivi senza `override.include: true`.
2. Non esiste alcun override Bardo o Collegio della Sapienza.
3. Controfascino ha portata e durata nella fonte meccanica, ma non ha effetti strutturati e viene normalizzato erroneamente come capacità `self`, istantanea e senza aura.
4. Parole Taglienti perde portata e bersaglio nel runtime; inoltre la fonte meccanica omette il trigger `tiro_danno` presente nella descrizione.
5. Abilità Impareggiabile è modellata come passiva non opzionale, mentre è una scelta dopo una prova e prima dell'esito.
6. `normalizePool()` perde `capacity.expression` e l'intero oggetto `die`; inoltre non ricava `class_id` dall'owner di tipo classe. Il runtime non può quindi mostrare il dado corrente né spiegare correttamente il massimo degli usi.
7. Il profilo della carta contiene classe, sottoclasse e livello, ma non possiede un modificatore di Carisma canonico. Valutare la formula `max(1, modificatore_carisma)` o imporre un massimo sarebbe quindi arbitrario.
8. La riga risorsa attuale mostra `– / –` e controlli `−/+/↻` anche quando il massimo non è risolvibile. Questo non è un contatore valido per Ispirazione Bardica.
9. Il vincolo sorgente `same_effect_max_instances_per_target: 1` non viene trasferito né applicato. Due Bardi potrebbero assegnare più marker allo stesso bersaglio, contro la regola.

## 4. Matrice della classe base Bardo

| Capacità | Meccanica da ricordare | Classificazione desiderata | Stato corrente | Implementazione richiesta |
|---|---|---|---|---|
| Incantesimi | Carisma; incantesimi conosciuti; rituali solo se conosciuti; sostituzione al livello; slot al riposo lungo | Descrittiva | Sottosistema Incantesimi funzionante; carta assente | Esporre la carta. Nessun secondo executor, inventario slot o stato di concentrazione |
| Ispirazione Bardica | Azione bonus nel proprio turno; un'altra creatura entro 18 m che possa sentire; un dado per prova/attacco/TS entro 10 minuti; uno solo alla volta | Assistita, tiro manuale | Record disabilitato | Selezione singola, esclusione del Bardo, controllo 18 m, marker sul bersaglio, expiry 100 round, rimozione manuale quando il dado è usato, history/Undo. Nessun tiro o modifica del d20 |
| Factotum | Metà bonus di competenza arrotondato per difetto a una prova che non lo includa già; comprende l'iniziativa in quanto prova di Destrezza | Descrittiva | Assente | Carta passiva. Non modificare iniziativa né intercettare prove |
| Canto di Riposo | Al termine del riposo breve, chi sente e spende almeno un Dado Vita recupera un solo dado extra; d6, d8 al 9°, d10 al 13°, d12 al 17° | Descrittiva | Assente | Carta con trigger, requisito e progressione. Nessun tiro, selezione bersagli o modifica di `meta.hp` |
| Collegio Bardico | Scelta della sottoclasse al 3°; privilegi al 3°, 6° e 14° | Descrittiva | Assente | Carta strutturale senza azione o metadata |
| Maestria | Due competenze al 3° e altre due al 10°; raddoppio competenza nelle prove scelte | Descrittiva | Assente | Carta passiva. Le abilità scelte restano nella scheda del personaggio |
| Aumento dei Punteggi di Caratteristica | Scelta ai livelli 4, 8, 12, 16 e 19 | Descrittiva | Assente | Carta di riferimento; nessuna mutazione statistiche |
| Fonte di Ispirazione | Dal 5° livello gli usi tornano al riposo breve o lungo anziché solo lungo | Descrittiva finché il massimo non è canonico | Assente; il pool sorgente contiene già le fasce | Carta e riga risorsa informativa. Non agganciare automaticamente i riposi e non inventare il massimo |
| Controfascino | Azione; Bardo e amici entro 9 m che possano sentirlo hanno vantaggio contro affascinato/spaventato; fine del turno successivo; fine anticipata per incapacità, silenzio o scelta | Assistita con aura e lifecycle automatici | Record disabilitato e normalizzato male | Attivazione manuale, aura 9 m, marker sorgente e pill sugli amici nell'area, expiry `next-turn-end`, termine manuale anticipato. Nessuna modifica ai TS |
| Segreti Magici | Due spell di qualsiasi classe al 10°, altre due al 14° e 18°; contano tra quelle conosciute | Descrittiva | Assente | Carta. Le spell scelte e lanciate restano nel sistema Incantesimi; non duplicare catalogo o stato |
| Ispirazione Superiore | Al 20°, quando tira iniziativa con zero usi, recupera un uso | Descrittiva contestuale | Assente | Carta con trigger e prerequisito. Non toccare il flusso iniziativa e non mutare il pool finché il massimo non è canonico |

## 5. Matrice del Collegio della Sapienza

| Capacità | Meccanica da ricordare | Classificazione desiderata | Stato corrente | Implementazione richiesta |
|---|---|---|---|---|
| Competenze Bonus | Al 3° livello sceglie tre abilità e ne ottiene competenza | Descrittiva | Assente | Carta passiva; nessun editor delle abilità e nessun metadata nuovo |
| Parole Taglienti | Reazione dopo attacco/prova/tiro di danno di una creatura visibile entro 18 m; prima dell'esito o del danno; spende Ispirazione, tira il dado e lo sottrae; inefficace se non sente o è immune ad affascinato | Descrittiva contestuale, tiro manuale | Record disabilitato; trigger del danno e targeting mancanti | Carta con `reazione`, `18 m`, visibilità, udibilità, immunità e timing. Nessun tiro, bersaglio persistente, pill o modifica numerica |
| Segreti Magici Aggiuntivi | Al 6° sceglie due spell di qualsiasi classe, eleggibili per slot o trucchetto; diventano da Bardo e **non** contano tra quelle conosciute | Descrittiva | Assente | Carta; evidenziare la differenza da Segreti Magici base. Le spell restano nel sistema Incantesimi |
| Abilità Impareggiabile | Al 14°, dopo una propria prova e prima dell'esito, può spendere Ispirazione, tirare il dado e sommarlo | Descrittiva contestuale, tiro manuale | Assente; fonte meccanica modellata come passiva | Correggere attivazione opzionale/trigger e mostrare carta. Nessun tiro, pill o modifica alla prova |

Conclusione: **tutte le capacità della sottoclasse vanno implementate**. Parole Taglienti è soltanto esposta in forma disabilitata; le altre tre sono assenti.

## 6. Logica vincolante delle capacità con stato

### 6.1 Ispirazione Bardica

Flusso:

1. Il GM seleziona un solo token diverso dal Bardo.
2. Il runtime verifica che sia un token creatura e che sia entro 18 m usando il controllo di portata già esistente.
3. Il tavolo conferma manualmente che il bersaglio possa sentire il Bardo.
4. Il runtime rifiuta il bersaglio se possiede già una condizione attiva con `effectId: bardo-ispirazione-bardica`, indipendentemente dal Bardo che l'ha applicata.
5. Applica una sola pill `Ispirazione Bardica` sul bersaglio, con `sourceId`, `sourceName`, `appliedAt`, `parentEffectId`, tema ed expiry esistenti.
6. La pill ricorda: dado per livello, usabile una volta su prova/attacco/TS dopo il d20 e prima dell'esito.
7. Scade dopo 10 minuti, rappresentati dal runtime esistente come 100 round.
8. Quando il dado viene usato, GM/giocatore termina manualmente la singola pill; la riconciliazione esistente deve rimuovere anche l'istanza Class Feature sorgente.

Non fare:

- nessun tiro del dado;
- nessuna scelta automatica del tipo di tiro;
- nessuna modifica a prove, attacchi o TS;
- nessun rilevamento dell'udibilità;
- nessun valore alternativo di Carisma nel metadata;
- nessun consumo fittizio da un pool `– / –`.

Il pool va mostrato come informazione: dado corrente, formula del massimo e recupero applicabile al livello. Finché il modificatore di Carisma non esiste nel profilo, la UI deve dire chiaramente `Usi gestiti sulla scheda` e nascondere `−/+/↻`. L'attivazione del marker non decrementa alcun valore inventato. Se un futuro profilo fornirà un massimo finito canonico, il percorso risorsa esistente potrà consumarlo senza cambiare la regola del marker.

Usare `runtimeSupport.adapter: bardic-inspiration` soltanto per il preflight di unicità. Targeting, condizione, history, Undo, scadenza e rimozione devono continuare a passare dalle primitive comuni.

### 6.2 Controfascino

Flusso:

1. Il GM attiva Controfascino sulla carta del Bardo.
2. L'attivazione crea il marker sorgente sul Bardo e un'area di 9 m ancorata al suo token.
3. Il controller aura riusa il filtro `friendly` e applica la pill agli altri alleati presenti nell'area; il Bardo riceve il beneficio dalla propria pill sorgente, senza duplicato area.
4. Entrata e uscita dall'area sono riconciliate automaticamente.
5. Tutte le pill dicono che il vantaggio è soltanto per i TS contro affascinato o spaventato e soltanto se la creatura può sentire il Bardo.
6. L'istanza termina alla fine del turno successivo del Bardo con `duration.timing: next-turn-end`.
7. Il pulsante di termine manuale copre fine volontaria, incapacità e silenzio. La rimozione della pill sorgente deve terminare l'intera aura.

Non fare:

- nessun calcolo o modifica del tiro salvezza;
- nessun rilevamento automatico di affascinato, spaventato, incapacità, sordità o silenzio;
- nessuna selezione iniziale degli alleati;
- nessun nuovo motore di geometria o membership;
- nessuna modifica a spell, concentrazione o iniziativa.

La pill area è un reminder geografico, non la certificazione che il bersaglio possa sentire. Il GM può rimuovere la pill di un singolo alleato quando il requisito non è soddisfatto; usare la soppressione già esistente, senza un nuovo flag.

## 7. Logica vincolante delle capacità senza stato

### 7.1 Parole Taglienti

- Carta descrittiva sempre leggibile dal livello 3 se la sottoclasse è Collegio della Sapienza.
- Esporre in modo sintetico: `Reazione`, `creatura visibile`, `18 m`, `attacco/prova/danno`, `dopo il tiro`, `prima dell'esito o del danno`, `deve sentirti`, `immune ad affascinato = immune alla capacità`.
- Il dado e la sottrazione restano al tavolo.
- Non chiedere di selezionare il bersaglio: l'effetto è istantaneo e non lascia stato.
- Non creare una pill “penalità”, non consumare un dado in modo non verificabile e non scrivere history vuota.

### 7.2 Abilità Impareggiabile

- Carta descrittiva sempre leggibile dal livello 14.
- Esporre: `propria prova di caratteristica`, `dopo il d20`, `prima dell'esito`, `spendi un uso`, `aggiungi il dado tirato manualmente`.
- Nessun target, pill, modifica alla prova o listener dei tiri.

### 7.3 Canto di Riposo

- Il reminder deve distinguere il requisito `spende uno o più Dadi Vita` dal beneficio `un solo dado extra per creatura`.
- Mostrare la progressione d6/d8/d10/d12.
- Non modificare `meta.hp`, non chiedere il risultato del dado e non introdurre un workflow di riposo.

### 7.4 Segreti Magici

- Segreti Magici base: le spell scelte contano tra gli incantesimi conosciuti.
- Segreti Magici Aggiuntivi: le due spell del 6° livello non contano tra gli incantesimi conosciuti.
- Entrambi accettano trucchetti o spell di un livello per cui il Bardo possiede slot.
- La carta è il reminder; l'inventario del personaggio e il sistema Incantesimi restano fonti operative. Non aggiungere automaticamente tutte le spell di altre classi al Bardo.

### 7.5 Passivi e scelte permanenti

Factotum, Collegio Bardico, Maestria, Aumento dei Punteggi e Competenze Bonus sono carte descrittive. Non creare contatori, pill, editor di abilità o modificatori di tiro. Fonte di Ispirazione e Ispirazione Superiore restano descrittive finché il pool non può essere risolto da dati canonici.

## 8. Modifiche ai dati

### `data/class-features/phb2014_classi_database_finale.json`

- Nessuna riscrittura generale delle descrizioni.
- Verificare soltanto che i livelli e la progressione `dado_ispirazione_bardica` restino invariati.
- Non inserire dettagli runtime, colori, pill o adapter in questo file.

### `data/class-features/phb2014_livello_meccanico_v1_1.json`

- Conservare per Ispirazione Bardica target, costo, durata, `die_from` e stacking già corretti.
- Controfascino: strutturare target aura amichevole a 9 m, requisito di udibilità, marker sorgente/beneficio area e condizioni di fine. Non descrivere il vantaggio come modificatore numerico eseguibile.
- Parole Taglienti: usare `automation_level: riferimento`, mantenere `activation.primary: reazione` e `optional: true`, aggiungere `tiro_danno` ai trigger e rendere espliciti visibilità, portata 18 m, udibilità e immunità ad affascinato. Il livello di automazione descrive il comportamento del plugin, non cambia l'attivazione regolistica.
- Abilità Impareggiabile: usare `automation_level: riferimento`; sostituire l'attivazione passiva con `primary: innesco`, trigger sulla propria prova, `optional: true` e `manual_choice_required: true`; conservare il costo di un uso nella fonte.
- Non creare nuovi pool: Parole Taglienti e Abilità Impareggiabile condividono già `bardo-ispirazione-bardica-usi`.

### `data/class-features/runtime-feature-overrides.json`

- Aggiungere `include: true`, `defaultEnabled: true` e stato descrittivo alle voci di riferimento della classe e della sottoclasse.
- Ispirazione Bardica: `status: implemented`, `adapter: bardic-inspiration`, targeting singolo entro 18 m con source esclusa, durata 100 round, tracking attivo ed effect plan `condition`.
- Controfascino: `status: implemented`, `adapter: aura`, targeting `aura` 9 m, durata `next-turn-end`, source marker e `targetEffect` amichevole.
- Parole Taglienti e Abilità Impareggiabile devono rimanere carte descrittive senza azione eseguibile; non falsare l'attivazione regolistica in override.
- Non duplicare negli override la progressione del dado, la formula del massimo o le fasce di recupero già presenti nelle fonti.

Decisioni runtime esatte:

| ID | `include` | `status` / `adapter` | Interazione |
|---|---:|---|---|
| `bardo-incantesimi` | true | `not-automated` | promemoria descrittivo |
| `bardo-ispirazione-bardica` | già incluso | `implemented` / `bardic-inspiration` | selezione singola + marker |
| `bardo-factotum` | true | `not-automated` | promemoria descrittivo |
| `bardo-canto-di-riposo` | true | `not-automated` | promemoria descrittivo |
| `bardo-collegio-bardico` | true | `not-automated` | promemoria descrittivo |
| `bardo-maestria` | true | `not-automated` | promemoria descrittivo |
| `bardo-aumento-dei-punteggi-di-caratteristica` | true | `not-automated` | promemoria descrittivo |
| `bardo-fonte-di-ispirazione` | true | `not-automated` | promemoria descrittivo |
| `bardo-controfascino` | già incluso | `implemented` / `aura` | attivazione aura |
| `bardo-segreti-magici` | true | `not-automated` | promemoria descrittivo |
| `bardo-ispirazione-superiore` | true | `not-automated` | promemoria descrittivo |
| `bardo-collegio-della-sapienza-competenze-bonus` | true | `not-automated` | promemoria descrittivo |
| `bardo-collegio-della-sapienza-parole-taglienti` | true | `not-automated` | promemoria descrittivo contestuale |
| `bardo-collegio-della-sapienza-segreti-magici-aggiuntivi` | true | `not-automated` | promemoria descrittivo |
| `bardo-collegio-della-sapienza-abilita-impareggiabile` | true | `not-automated` | promemoria descrittivo contestuale |

Impostare `defaultEnabled: true` per tutte le righe. Non aggiungere `effectPlan` alle righe descrittive. Per Ispirazione usare `effectPlan.kind: condition`; per Controfascino usare `effectPlan.kind: aura`, `radiusMeters: 9`, una pill sorgente e un `targetEffect` con `targeting.filter: friendly` e `includeCaster: false`.

### `src/class-features-runtime.json`

- Non modificare manualmente.
- Rigenerare esclusivamente con `npm run generate:class-features` dopo le fonti e gli override.

## 9. Primitive strettamente necessarie

Non serve una nuova infrastruttura generale.

Serve un solo completamento della primitive risorsa esistente:

1. `normalizePool()` deve conservare la formula, ricavare il `class_id` dall'owner classe e generare il dado per livello dalla progressione esistente.
2. `classFeatureResourceEntries()` deve restituire il dado corrente e gli eventi di recupero pertinenti al livello.
3. La UI deve consumare questi valori solo a scopo informativo quando il massimo non è risolvibile.

Questa non è una seconda risorsa Bardo e non valuta il Carisma: rende visibili dati già presenti nella fonte. Non aggiungere un campo `charisma`, `chaMod`, `bardicDie` o un nuovo oggetto metadata sul token.

L'unico adapter specifico ammesso è il piccolo preflight `bardic-inspiration` per impedire più marker sullo stesso bersaglio. Non duplicare attivazione, condizioni, expiry, history o Undo dentro l'adapter.

## 10. File e funzioni da modificare

Ordine e responsabilità sono vincolanti:

1. `data/class-features/phb2014_livello_meccanico_v1_1.json`
   - correggere Controfascino, Parole Taglienti e Abilità Impareggiabile;
   - non toccare record di altre classi.
2. `data/class-features/runtime-feature-overrides.json`
   - aggiungere soltanto gli ID Bardo/Sapienza elencati nelle matrici;
   - riusare gli shape `condition`, `aura`, `targetEffect`, `duration.timing` esistenti.
3. `scripts/generate-class-feature-catalog.mjs`
   - `normalizePool()`: owner classe, formula, dado e progressione derivata;
   - normalizzazione feature: trasferire il limite di stacking soltanto se sarà consumato dal preflight;
   - nessuna modifica manuale dell'artefatto finale.
4. `src/classFeatureCore.js`
   - aggiungere resolver puri per dado corrente e recupero per livello, oppure integrarli in `classFeatureResourceEntries()` senza alterare il formato persistito dello state;
   - testare livelli di soglia 1/5/10/15 e recupero 4/5.
5. `src/classFeatureRuntime.js`
   - in `activateClassFeature()`, dopo `resolveTargetIds()`, eseguire il solo preflight dell'adapter `bardic-inspiration`;
   - usare `getConditionInstances()` sul bersaglio e rifiutare una condizione attiva con lo stesso `effectId`;
   - poi proseguire nel flusso comune invariato;
   - non aggiungere un secondo writer di condizioni o history.
6. `src/initiative-card-modal.js`
   - `buildClassFeatureResourceRow()`: mostrare dado, recupero per livello e `Usi gestiti sulla scheda` quando il massimo è `null`; in tale stato nascondere i controlli di mutazione;
   - non aggiungere controlli speciali per Parole Taglienti o Abilità Impareggiabile;
   - le feature descrittive non entrano in quick action.
7. `initiative-card-modal.html`
   - aggiornare soltanto il testo di aiuto che oggi afferma che l'editor elenca solo capacità con attivazione utilizzabile, perché include anche promemoria descrittivi;
   - nessun redesign.
8. `src/class-features-runtime.json`
   - rigenerare.

Non è richiesto modificare `initiativeList.js`, il sistema Incantesimi, HP, concentrazione, spell area o l'aura engine.

## 11. Ordine di implementazione

1. Rieseguire `git status` e annotare lo snapshot; non sovrascrivere modifiche concorrenti.
2. Correggere i tre record meccanici incompleti.
3. Aggiungere gli override descrittivi e quelli di Ispirazione/Controfascino.
4. Correggere la derivazione del pool e aggiungere i resolver puri di presentazione.
5. Aggiungere il preflight di unicità di Ispirazione senza biforcare il flusso di attivazione.
6. Adeguare la sola riga risorsa e il testo di aiuto UI.
7. Rigenerare il catalogo.
8. Aggiungere i test Bardo/Sapienza e aggiornare gli snapshot/count solo se derivano deterministicamente dal catalogo.
9. Eseguire test completi e build.
10. Eseguire la checklist manuale in Owlbear Rodeo.

## 12. Rischi di regressione

| Rischio | Mitigazione obbligatoria |
|---|---|
| Un pool formula senza massimo viene trattato come illimitato o modificabile | UI esplicita, controlli nascosti, test che nessun current/max venga inventato |
| Ispirazione duplica pill sullo stesso bersaglio | Preflight cross-source sul `effectId`; test con due Bardi |
| La rimozione della pill lascia l'istanza sorgente attiva | Test della riconciliazione già esistente e dell'Undo |
| Controfascino beneficia nemici o duplica il Bardo | Test aura con source, alleato e nemico; source esclusa dalla membership area |
| Controfascino scade all'inizio anziché alla fine del turno | Test `next-turn-end` con actorId del Bardo |
| Il requisito di udibilità viene presentato come verificato | Test del testo pill; nessun detector di udibilità |
| Parole Taglienti crea una penalità persistente | Test che sia reference-only e senza quick action/effect plan |
| Segreti Magici duplica spell o concentrazione | Test di non regressione del sistema Incantesimi; nessun writer aggiunto |
| Generator e runtime divergono | Test deterministico di rigenerazione e working tree pulito per l'artefatto |
| Modifiche concorrenti vengono perse | Patch puntuali; rilettura del file immediatamente prima di ogni patch |

## 13. Test automatici

Creare `test/bardLoreFeatureRuntime.test.js` o un file equivalente focalizzato. Copertura minima:

### Catalogo e dati

- tutti gli 11 ID della classe base compaiono ai livelli corretti;
- i quattro ID della Sapienza compaiono soltanto con `subclassId: bardo-collegio-della-sapienza` e ai livelli 3/3/6/14;
- le voci descrittive sono riconosciute da `classFeatureIsReferenceOnly()` e non producono quick action;
- Ispirazione e Controfascino hanno runtime pronto;
- Parole Taglienti include attacco, prova e tiro di danno nel dato sorgente;
- Abilità Impareggiabile è opzionale e innescata dalla propria prova;
- nessun test legge o modifica manualmente il JSON runtime: deve essere rigenerato.

### Pool Ispirazione

- dado: d6 ai livelli 1 e 4, d8 ai 5 e 9, d10 ai 10 e 14, d12 ai 15 e 20;
- recupero: solo riposo lungo al livello 4; breve e lungo al livello 5;
- formula del massimo preservata ma non valutata senza un modificatore canonico;
- entry con massimo ignoto non espone controlli `−/+/↻` e non inventa `current` o `maximum`;
- l'attivazione del marker non effettua un tiro e non sottrae da un valore ignoto.

### Ispirazione Bardica

- un bersaglio valido entro 18 m riceve una sola pill;
- il Bardo è escluso;
- zero bersagli, due bersagli e bersaglio fuori portata falliscono con errore chiaro;
- la pill contiene `sourceId`, `sourceName`, `appliedAt`, expiry 100 round e rimozione manuale;
- un bersaglio già ispirato dallo stesso o da un altro Bardo viene rifiutato;
- rimozione della pill termina l'istanza; Undo ripristina stato e pill;
- nessuna API di dado o modifica al d20 viene chiamata.

### Controfascino

- l'attivazione crea una sola istanza aura da 9 m e il marker sorgente;
- source e alleato ricevono il reminder, il nemico no; il Bardo non riceve due pill;
- entrata e uscita di un alleato riconciliano la pill;
- la pill rimossa manualmente da un alleato resta soppressa finché previsto dal comportamento aura esistente;
- l'effetto scade alla fine del turno successivo del Bardo, non all'inizio;
- termine manuale e rimozione del marker sorgente eliminano aura e pill figlie;
- il testo ricorda udibilità e i soli TS contro affascinato/spaventato;
- nessun tiro salvezza viene letto o modificato.

### Capacità descrittive

- Canto di Riposo mostra requisito Dadi Vita e progressione, senza mutare HP;
- Factotum menziona le prove senza mutare iniziativa;
- Segreti Magici e Segreti Magici Aggiuntivi mantengono la differenza sul conteggio delle spell conosciute;
- Parole Taglienti e Abilità Impareggiabile non creano pill, istanze o history vuota;
- Ispirazione Superiore non registra listener o mutazioni nell'iniziativa.

### Regressioni

- test esistenti per Ira e Attacco Irruento invariati;
- test aura di Lupo/Santuario/Paladino invariati;
- test condizioni, expiry, history e Undo invariati;
- test Incantesimi e concentrazione invariati;
- `npm test` passa;
- `npm run build` passa;
- due esecuzioni consecutive di `npm run generate:class-features` producono lo stesso hash dell'artefatto alla seconda esecuzione, anche se il resto del worktree è sporco.

## 14. Checklist manuale GM/Player in Owlbear Rodeo

Preparazione: un Bardo della Sapienza di livello 3, uno di livello 6, uno di livello 14, un alleato e un nemico; atteggiamenti corretti e token dentro/fuori 9/18 m.

### Carte

- [ ] A ogni livello compaiono soltanto le capacità disponibili.
- [ ] Le capacità della Sapienza non compaiono su un Bardo di altro Collegio.
- [ ] Le carte descrittive non mostrano `Non disponibile` né pulsanti inutili.
- [ ] Incantesimi e Segreti Magici non duplicano l'elenco delle spell.
- [ ] Segreti Magici Aggiuntivi evidenzia `non contano tra gli incantesimi conosciuti`.

### Ispirazione Bardica

- [ ] Selezionando un solo alleato entro 18 m, `Attiva` crea la pill sull'alleato e non sul Bardo.
- [ ] Il testo ricorda il dado corretto per il livello e il timing dopo d20/prima esito.
- [ ] Il contatore dice che gli usi restano sulla scheda; non mostra controlli su `– / –`.
- [ ] Il Bardo, due token o un token oltre 18 m vengono rifiutati.
- [ ] Una seconda Ispirazione sullo stesso bersaglio viene rifiutata anche se proviene da un altro Bardo.
- [ ] Rimuovendo la pill quando il dado viene speso, scompare anche la capacità attiva dalla carta sorgente.
- [ ] Undo ripristina pill e stato; il plugin non tira alcun dado.

### Controfascino

- [ ] Attivandolo appare l'area di 9 m e il marker sul Bardo.
- [ ] Un alleato dentro l'area riceve la pill; un nemico no.
- [ ] Muovendo l'alleato fuori e dentro l'area la membership si aggiorna.
- [ ] Il testo non promette di verificare l'udibilità e non modifica un TS.
- [ ] La capacità resta fino alla fine del turno successivo del Bardo.
- [ ] `Termina` copre fine volontaria, incapacità e silenzio e rimuove area/pill.

### Sapienza e passivi

- [ ] Parole Taglienti mostra reazione, 18 m, visibilità, udibilità, immunità e tutti e tre i tipi di tiro.
- [ ] Parole Taglienti non richiede bersaglio e non lascia una penalità sul token.
- [ ] Abilità Impareggiabile indica dopo il tiro/prima dell'esito e non modifica la prova.
- [ ] Canto di Riposo non cambia HP e non tira il dado extra.
- [ ] Factotum non cambia l'iniziativa.

## 15. Criteri di accettazione

Il batch è accettabile soltanto se:

1. tutte le 11 capacità base e le quattro della Sapienza sono visibili ai livelli corretti;
2. nessuna capacità della Sapienza tira dadi o modifica un tiro;
3. Ispirazione applica un marker unico, al bersaglio corretto, entro 18 m, per 10 minuti, terminabile e annullabile con Undo;
4. il plugin non inventa né richiede un modificatore di Carisma alternativo;
5. Controfascino usa l'aura esistente, include il Bardo e gli amici entro 9 m senza beneficiare nemici, e termina al confine di turno corretto;
6. Parole Taglienti e Abilità Impareggiabile sono reminder completi senza pill istantanee o pulsanti privi di effetto;
7. Segreti Magici riusa esclusivamente il sistema Incantesimi;
8. non vengono modificati HP, HP temporanei, concentrazione, iniziativa o movimento;
9. non vengono aggiunte chiavi metadata per Carisma, dado o competenze;
10. l'artefatto runtime è generato deterministicamente;
11. test completi e build passano;
12. Ira, Attacco Irruento, Lupo e le altre aure esistenti mantengono il comportamento corrente.

## 16. Fuori scope

- Automazione dei tiri o lettura di risultati da chat/dice roller.
- Editor di punteggi di caratteristica, competenze, Maestria o incantesimi conosciuti.
- Tracking automatico di riposi, iniziativa o reazioni.
- Calcolo automatico del massimo degli usi di Ispirazione senza Carisma canonico.
- Rilevamento automatico di udibilità, visibilità, silenzio, incapacità o immunità ad affascinato.
- Refactor generale di `initiativeList.js`, aura engine, condizioni, Incantesimi o HP.
- Implementazione del Collegio del Valore o di altri Collegi.
