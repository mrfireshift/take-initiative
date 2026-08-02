# Audit e piano di implementazione — Stregone / Magia Selvaggia

Data audit: 1 agosto 2026  
Regolamento: Manuale del Giocatore 2014  
Commit osservato: `9923cc3` (`Approve class feature taxonomy v1`)

## 1. Scopo e decisione di prodotto

Questo documento copre prima la classe base Stregone e poi l'Origine Stregonesca Magia Selvaggia, comprese le otto opzioni di Metamagia e tutti i 50 intervalli della tabella Impulsi di Magia Selvaggia.

Regola vincolante:

- il plugin non tira d20, d100, d4, dadi di danno, dadi di cura o dadi di durata;
- il plugin non sceglie risultati casuali, creature casuali o esiti di tiri salvezza;
- il plugin può mostrare il momento di applicazione, la portata, i bersagli, la durata e le condizioni di fine;
- dopo una conferma manuale può consumare o recuperare una risorsa deterministica già canonica;
- Incantesimi resta l'unico sottosistema che applica e termina incantesimi;
- il plugin non deve creare un secondo inventario di slot incantesimo;
- `meta.hp` e `meta.hpMax` restano gli unici campi HP canonici;
- il plugin non deve creare token di modron, flumph, unicorni o forme di pecora e non deve chiedere al GM di ricopiarne gli stat block;
- `src/class-features-runtime.json` è un artefatto generato e non va modificato manualmente;
- nessun nuovo metadata persistente è ammesso senza un consumer e relativi test;
- nessun refactor generale di `initiativeList.js`, Incantesimi, HP bar, iniziativa o aura engine.

L'obiettivo del primo rilascio è **reminder-first**. Rendere consultabile e selezionabile un risultato della tabella, con testo chiaro su applicazione e fine, conta come implementazione della capacità anche quando la risoluzione resta al tavolo.

## 2. Snapshot e fonti di verità

Il worktree osservato è condiviso e contiene modifiche non committate del batch Barbaro/Totemico. L'agente che implementa deve rieseguire `git status`, partire dallo snapshot più recente e non sovrascrivere integralmente file già modificati da altri agenti.

Durante l'audit erano presenti nel worktree, ma non nel commit `9923cc3`, il supporto `classFeatureIsReferenceOnly()` e la UI `Promemoria descrittivo`. Devono essere riusati, non duplicati.

Fonti:

1. Descrizioni, livelli, opzioni e tabella da 50 risultati: `data/class-features/phb2014_classi_database_finale.json`.
2. Attivazioni, risorse, costi e recuperi: `data/class-features/phb2014_livello_meccanico_v1_1.json`.
3. Decisioni runtime curate: `data/class-features/runtime-feature-overrides.json`.
4. Generatore: `scripts/generate-class-feature-catalog.mjs`.
5. Artefatto derivato: `src/class-features-runtime.json`.
6. Incantesimi richiamati dalla tabella: catalogo e runtime Incantesimi esistenti.

La sottoclasse e quattro descrizioni usano `fonte_descrizione: manuale_errata`; Bombardamento Magico usa `manuale_verificato`. Prima di pubblicare il testo, verificare la tabella contro la specifica edizione 2014 con errata e correggere eventuali errori soltanto nel JSON sorgente. In particolare, Caos Controllato contiene una virgoletta tipografica non bilanciata. Non correggere il solo JSON runtime.

## 3. Stato reale corrente

### 3.1 Già implementato e riutilizzabile

- Il sistema Incantesimi è funzionante.
- Tutti i nove incantesimi nominati nella tabella sono presenti nel catalogo: Palla di Fuoco, Dardo Incantato, Confusione, Unto, Levitazione, Nube di Nebbia, Metamorfosi, Immagine Speculare e Volare.
- Il pool `stregone-punti-stregoneria` è generato con massimo pari al livello da Stregone e recupero al riposo lungo.
- Il runtime possiede già modifica manuale delle risorse, history e Undo.
- Esistono già card descrittive, condizioni/pill, expiry a round/turno, selezione bersagli e rimozione individuale.

Questa infrastruttura non significa che le capacità dello Stregone siano già implementate.

### 3.2 Presente nel runtime ma non implementato

I record seguenti compaiono nell'artefatto, ma hanno `runtimeSupport.status: not-automated`, `effectPlan: null` e azione disabilitata:

- `stregone-fonte-di-magia`;
- `stregone-metamagia-incantesimo-rapido`;
- `stregone-magia-selvaggia-impulso-di-magia-selvaggia`;
- `stregone-magia-selvaggia-piegare-la-fortuna`.

Non devono essere conteggiati come implementati.

### 3.3 Non esposto nel runtime

Sono esclusi dal generatore perché classificati `riferimento` o passivi:

- Incantesimi;
- Origine Stregonesca;
- Metamagia come contenitore;
- Aumento dei Punteggi di Caratteristica;
- Ripristino Stregonesco;
- sette opzioni di Metamagia su otto;
- Onde di Caos;
- Caos Controllato;
- Bombardamento Magico.

### 3.4 Difetti strutturali che spiegano lo stato

1. Il generatore esclude i record `riferimento` e le attivazioni passive salvo `override.include: true`.
2. Non esiste alcun override runtime per le capacità e opzioni esaminate.
3. La tabella `tabella_impulsi_magia_selvaggia` vive nel record della sottoclasse, ma il generatore non la trasferisce all'artefatto runtime.
4. `normalizePool()` non trasferisce `special_refresh`; il recupero di 4 punti di Ripristino Stregonesco viene quindi perso.
5. Il costo `variabile` di Fonte di Magia viene convertito a zero e filtrato da `resourceCosts`; di conseguenza Fonte di Magia non basta a rendere visibile il pool.
6. Le attivazioni `instant` implementate producono oggi una pill salvo ulteriore supporto. Onde di Caos, Piegare la Fortuna e il solo consumo di punti non devono creare pill orfane.
7. Il sistema Incantesimi non traccia gli slot disponibili/spesi come risorsa canonica. Fonte di Magia non può quindi eseguire una conversione atomica tra due inventari reali.

## 4. Matrice della classe base Stregone

| Capacità | Meccanica da ricordare | Classificazione desiderata | Stato corrente | Implementazione richiesta |
|---|---|---|---|---|
| Incantesimi | Carisma, incantesimi conosciuti, sostituzione al livello, recupero slot al riposo lungo | Descrittiva | Sistema Incantesimi funzionante; carta di classe assente | Esporre la carta come riferimento. Nessun secondo executor, inventario slot o stato di concentrazione |
| Origine Stregonesca | Scelta al 1° livello; privilegi al 1°, 6°, 14° e 18° | Descrittiva | Assente | Carta strutturale senza azione o metadata |
| Fonte di Magia | Pool punti stregoneria; conversione punti ↔ slot con azione bonus; slot creati fino al 5° e fino al riposo lungo | Assistita | Pool dati presente; conversioni non implementate | Mostrare il pool e le due tabelle operative. Non creare un secondo contatore slot. Vedi §7.2 |
| Metamagia | Due opzioni al 3°, una ulteriore al 10° e al 17°; normalmente una sola per incantesimo | Descrittiva come contenitore | Assente | Esporre contenitore e opzioni; opzioni disabilitate per default, abilitate solo se scelte dal personaggio |
| Aumento dei Punteggi di Caratteristica | Scelta di avanzamento ai livelli 4, 8, 12, 16 e 19 | Descrittiva | Assente | Carta di riferimento, nessuna mutazione statistiche |
| Ripristino Stregonesco | Al termine di ogni riposo breve recupera 4 punti, senza superare il massimo | Assistita deterministica | Presente solo nella fonte `special_refresh`, perso nel runtime | Carta e azione confermata `Recupera 4`, limitata al livello 20 e al massimo; history/Undo; nessun rilevamento automatico del riposo |

## 5. Matrice delle opzioni di Metamagia

Le opzioni devono apparire soltanto se abilitate nella scheda del personaggio. Il tiro o l'effetto dell'incantesimo resta nel sistema Incantesimi. Il primo batch non modifica automaticamente gittata, durata, tempo di lancio, dadi, TS o numero di bersagli.

| Opzione | Reminder regolistica | Classificazione | Stato corrente | Logica richiesta |
|---|---|---|---|---|
| Incantesimo Celato | Al lancio, 1 punto; niente componenti verbali o somatiche | Assistita | Assente | Carta + conferma consumo di 1 punto, senza pill |
| Incantesimo Distante | Al lancio, 1 punto; raddoppia gittata ≥1,5 m oppure contatto diventa 9 m | Assistita | Assente | Carta + consumo di 1; non alterare geometria o bersagli |
| Incantesimo Esteso | Al lancio, 1 punto; durata almeno 1 minuto raddoppiata, massimo 24 ore | Assistita | Assente | Carta + consumo di 1; non riscrivere expiry della spell in questo batch |
| Incantesimo Intensificato | Al lancio, 3 punti; un bersaglio ha svantaggio al primo TS contro la spell | Assistita | Assente | Carta + consumo di 3; il bersaglio e il TS restano nel flusso spell/manuale, nessuna pill autonoma |
| Incantesimo Potenziato | Dopo i dadi danno, 1 punto; ritira fino al mod. Carisma, usa il nuovo risultato; compatibile con un'altra Metamagia | Assistita descrittiva | Assente | Non tirare o leggere dadi. Carta + eventuale consumo confermato di 1; ricordare l'eccezione alla regola “una Metamagia” |
| Incantesimo Preciso | Al lancio, 1 punto; fino al mod. Carisma creature scelte superano automaticamente il TS | Assistita | Assente | Carta + consumo di 1. Non dedurre Carisma e non scegliere/applicare esiti ai token |
| Incantesimo Raddoppiato | Spell a bersaglio singolo non personale; secondo bersaglio; costo pari al livello, minimo 1 | Assistita | Assente | Mostrare requisiti e input livello 0–9 per il solo costo. Idoneità e secondo bersaglio restano conferme del tavolo |
| Incantesimo Rapido | Spell da 1 azione diventa azione bonus; 2 punti | Assistita | Record `not-automated` | Carta + conferma consumo di 2, senza “modificare” la spell o creare un effetto persistente |

Per i sette costi fissi usare una sola attivazione condivisa “resource-only”: consuma la risorsa, scrive history, supporta Undo e non crea condizioni. Per Raddoppiato usare lo stesso percorso con valore scelto e validato; non aggiungere otto adapter diversi.

## 6. Matrice Magia Selvaggia

| Capacità | Meccanica | Classificazione desiderata | Stato corrente | Implementazione richiesta |
|---|---|---|---|---|
| Impulso di Magia Selvaggia | Una volta per turno, dopo una spell da Stregone di livello ≥1, il DM può chiedere d20; con 1 si tira d100. Spell risultanti ignorano Metamagia e concentrazione e durano per intero | Assistita, tiro manuale | Record `not-automated`; tabella non disponibile nel runtime | Carta con azione `Consulta risultato`, tabella completa e selezione manuale dell'intervallo. Nessun tiro e nessun trigger automatico sul lancio |
| Onde di Caos | Vantaggio a un attacco/prova/TS; 1 uso per riposo lungo. Prima del recupero il DM può imporre un tiro sulla tabella dopo una spell, poi l'uso torna disponibile | Assistita, tiro manuale | Assente | Pool da 1 uso; `Usa Onde` consuma soltanto il pool. `Impulso richiesto dal DM` apre la tabella e recupera l'uso solo dopo conferma |
| Piegare la Fortuna | Reazione, un'altra creatura visibile; 2 punti; d4 aggiunto o sottratto dopo il tiro e prima degli effetti | Assistita, tiro manuale | Record `not-automated` | Reminder contestuale + consumo confermato di 2 punti; nessun d4, nessuna scelta bersaglio necessaria e nessuna modifica del tiro |
| Caos Controllato | Ogni tiro sulla tabella diventa due tiri, poi scelta del risultato | Descrittiva integrata | Assente | Carta passiva; dal livello 14 il viewer di Impulso mostra due campi per risultati tirati manualmente e una scelta finale. Nessun RNG |
| Bombardamento Magico | Se un dado danno spell mostra il massimo, scegline uno, ritiralo e aggiungilo; una volta per turno | Descrittiva | Assente | Carta sempre visibile dal livello 18. Nessun lettore dadi, danno, contatore per turno o quick action |

Conclusione: **nessuna delle cinque capacità di Magia Selvaggia è oggi implementata**. Impulso e Piegare la Fortuna sono soltanto record esposti ma disabilitati.

## 7. Decisioni operative vincolanti

### 7.1 Impulso di Magia Selvaggia

- Non intercettare automaticamente il lancio: il runtime non può provare che una spell multiclassata sia stata lanciata “come spell da Stregone”.
- L'azione è manuale e disponibile a GM e, se i permessi correnti lo consentono senza allargare l'authorization model, al proprietario della carta.
- Il plugin non offre pulsanti `Tira d20` o `Tira d100`.
- Il giocatore seleziona `01-02`, `03-04`, ecc. dopo avere tirato fisicamente.
- Il risultato mostra sempre quattro campi: `Effetto`, `Dove`, `Durata/Fine`, `Da risolvere al tavolo`.
- Al livello 14 il viewer permette di registrare i due intervalli ottenuti e scegliere quale mostrare come risultato finale. Non calcola i numeri.
- Il primo batch non applica automaticamente i 50 esiti. Per gli esiti persistenti può mostrare un reminder fissato nella carta dello Stregone, ma non deve creare una tassonomia parallela di condizioni.
- Gli esiti che sono incantesimi devono mostrare un collegamento al record Incantesimi esistente. Non applicarli tramite il normale cast finché quel flusso non supporta esplicitamente `niente concentrazione`, `durata completa` e `Metamagia disabilitata`; usare il cast normale produrrebbe regole errate per Confusione, Levitazione, Nube di Nebbia, Metamorfosi e Volare.
- Non creare zone, aure, token evocati o modifiche HP nella prima implementazione del viewer.

### 7.2 Fonte di Magia

Il pool dei punti è canonico; gli slot non lo sono.

Implementazione ammessa:

- mostrare `stregone-punti-stregoneria` anche se il costo della feature è variabile;
- `Crea slot`: scelta livello 1–5, mostra costo 2/3/5/6/7, consuma punti dopo conferma e crea un reminder sullo Stregone “slot temporaneo di livello N; termina quando speso o al riposo lungo”;
- il GM/Player termina manualmente il reminder quando usa lo slot;
- `Converti slot`: scelta livello 1–9, conferma che lo slot sia già stato segnato come speso sulla scheda esterna, quindi recupera lo stesso numero di punti, con cap al massimo;
- history e Undo devono coprire la mutazione dei punti e l'eventuale reminder nella stessa operazione.

Non implementare:

- un nuovo metadata `spellSlots`;
- la disponibilità automatica degli slot;
- il consumo o recupero automatico di uno slot che il plugin non traccia;
- slot creati oltre il 5° livello;
- costi derivati da testo duplicato in un override.

La tabella costi è già strutturata nell'effetto meccanico `create_spell_slot.cost_table` e deve essere generata da lì.

### 7.3 Onde di Caos

- Aggiungere un pool sorgente da 1 uso, recupero riposo lungo.
- `Usa Onde di Caos` consuma l'uso e mostra soltanto il reminder che il vantaggio va applicato al tiro fisico scelto.
- Nessuna pill “Vantaggio”: il beneficio vale per un solo tiro immediato.
- Finché il pool è a 0, mostrare al DM `Impulso richiesto dal DM`.
- Questa seconda azione apre direttamente il viewer d100, senza passare dal d20, e recupera Onde soltanto quando il GM conferma che l'Impulso è stato richiesto.
- Apertura del viewer, recupero del pool ed eventuale reminder fissato devono essere una singola voce history/Undo se producono stato.
- Non rilevare la spell e non recuperare l'uso solo perché è stata aperta la tabella per un normale Impulso.

### 7.4 Piegare la Fortuna

- Il testo deve evidenziare: “un'altra creatura che vedi”, “dopo il tiro”, “prima degli effetti”, “bonus o penalità”, “reazione”, “2 punti”.
- Il pulsante `Conferma uso` consuma 2 punti con una mutazione resource-only.
- Non selezionare il bersaglio: non resta alcun effetto sul token.
- Non tirare il d4, non chiedere di inserire il risultato e non modificare attack/check/save.

### 7.5 Caos Controllato e Bombardamento Magico

- Caos Controllato modifica soltanto il viewer di Impulso ed è anche una carta passiva leggibile.
- Bombardamento Magico è solo un reminder passivo. Non registrare “usato questo turno”: farlo richiederebbe un click aggiuntivo senza produrre una conseguenza runtime utile.

## 8. Tutti i risultati della tabella Impulsi

La colonna “logica plugin” è vincolante per il primo rilascio. `Viewer` significa testo operativo a schermo, senza mutazione automatica. Le durate e le fini devono essere visibili anche se la loro terminazione resta manuale.

| d100 | Dove e quando | Durata/Fine | Logica plugin |
|---|---|---|---|
| 01-02 | Sullo Stregone; all'inizio di ogni suo turno tira di nuovo sulla tabella | 1 minuto; ignora 01-02 nei tiri successivi | Viewer + reminder fissabile; nessun tiro automatico |
| 03-04 | Lo Stregone vede creature invisibili con linea di vista | 1 minuto | Viewer/reminder sullo Stregone |
| 05-06 | Modron in uno spazio libero entro 1,5 m | Scompare dopo 1 minuto | Viewer; nessun token o stat block automatico |
| 07-08 | Palla di Fuoco di 3° centrata sullo Stregone | Istantanea | Link a Palla di Fuoco; danni e TS al tavolo |
| 09-10 | Dardo Incantato di 5°; bersagli scelti al tavolo | Istantanea | Link a Dardo Incantato; nessun danno automatico |
| 11-12 | Altezza dello Stregone cambia in base a d10 | Finché il tavolo non la ripristina | Viewer; d10 e misura manuali |
| 13-14 | Confusione centrata sullo Stregone | 1 minuto completo, senza concentrazione | Link spell solo consultivo; nessuna concentrazione creata |
| 15-16 | Lo Stregone recupera 5 PF all'inizio di ogni turno | 1 minuto | Reminder; non mutare automaticamente `meta.hp` |
| 17-18 | Barba di piume sullo Stregone | Termina quando starnutisce | Reminder manuale/cosmetico |
| 19-20 | Unto centrato sullo Stregone | 1 minuto | Link spell; nessuna zona o TS automatici |
| 21-22 | Creature contro la prossima spell con TS lanciata entro 1 minuto | Termina alla prima spell idonea o dopo 1 minuto | Reminder sullo Stregone; fine manuale |
| 23-24 | Pelle azzurra dello Stregone | Finché Rimuovi Maledizione non la termina | Reminder manuale/cosmetico |
| 25-26 | Occhio sulla fronte; vantaggio a Percezione visiva | 1 minuto | Reminder sullo Stregone; nessun tiro modificato |
| 27-28 | Le spell dello Stregone da 1 azione diventano azione bonus | 1 minuto | Reminder; nessuna modifica al cast |
| 29-30 | Lo Stregone si teletrasporta fino a 18 m in spazio visibile libero | Istantanea | Viewer; non muovere il token |
| 31-32 | Lo Stregone va sul Piano Astrale e poi torna | Fino alla fine del suo turno successivo | Reminder con fine indicata; nessuna rimozione token |
| 33-34 | Massimizza il danno della prossima spell dannosa entro 1 minuto | Prima spell idonea o 1 minuto | Reminder; nessun calcolo danni |
| 35-36 | Età dello Stregone cambia in base a d10 | Indefinita | Viewer; d10 ed età manuali |
| 37-38 | 1d6 flumph entro 18 m | Scompaiono dopo 1 minuto | Viewer; numero, token e stat block manuali |
| 39-40 | Lo Stregone recupera 2d10 PF | Istantanea | Viewer; tiro e modifica HP manuali |
| 41-42 | Lo Stregone diventa pianta in vaso, incapacitato e vulnerabile a tutti i danni | Inizio del turno successivo; anche 0 PF rompe il vaso | Reminder sullo Stregone; nessun watcher HP |
| 43-44 | Lo Stregone può teletrasportarsi di 6 m come azione bonus nei suoi turni | 1 minuto | Reminder; nessun movimento automatico |
| 45-46 | Levitazione sullo Stregone | 10 minuti completi, senza concentrazione | Link spell consultivo; reminder sullo Stregone |
| 47-48 | Unicorno in uno spazio entro 1,5 m | Scompare dopo 1 minuto | Viewer; nessun token o stat block automatico |
| 49-50 | Lo Stregone non può parlare; bolle rosa quando prova | 1 minuto | Reminder sullo Stregone |
| 51-52 | Scudo spettrale: +2 CA e immunità a Dardo Incantato | 1 minuto | Reminder; non mutare CA |
| 53-54 | Immunità all'intossicazione alcolica | 5d6 giorni | Viewer; tiro durata e fine manuali |
| 55-56 | Lo Stregone perde i capelli | Ricrescono in 24 ore | Reminder cosmetico, fine manuale |
| 57-58 | Oggetti infiammabili idonei toccati dallo Stregone prendono fuoco | 1 minuto | Reminder; nessun oggetto modificato |
| 59-60 | Recupera lo slot speso di livello più basso | Istantanea | Viewer; nessun inventario slot duplicato |
| 61-62 | Lo Stregone deve gridare quando parla | 1 minuto | Reminder sullo Stregone |
| 63-64 | Nube di Nebbia centrata sullo Stregone | 1 ora completa, senza concentrazione | Link spell consultivo; nessuna zona automatica |
| 65-66 | Fino a tre creature scelte entro 9 m subiscono 4d10 fulmine | Istantanea | Viewer; scelta, tiro e danni al tavolo |
| 67-68 | Lo Stregone è spaventato dalla creatura più vicina | Fine del suo turno successivo | Reminder; scelta/tie della creatura al tavolo |
| 69-70 | Tutte le creature entro 9 m diventano invisibili | 1 minuto; fine individuale quando attaccano o lanciano spell | Viewer; è una fotografia iniziale, non un'aura dinamica |
| 71-72 | Lo Stregone ha resistenza a tutti i danni | 1 minuto | Reminder; nessun danno modificato |
| 73-74 | Una creatura casuale entro 18 m è Avvelenata | 1d4 ore | Viewer; bersaglio e durata tirati al tavolo |
| 75-76 | Luce intensa 9 m; chi termina il turno entro 1,5 m è Accecato | Sorgente 1 minuto; Accecato fino a fine turno successivo della creatura | Viewer di aura/innesco; non applicare automaticamente Accecato |
| 77-78 | Metamorfosi sullo Stregone; con TS fallito diventa pecora | 1 ora completa, senza concentrazione | Link spell; TS e forma al tavolo, nessuno stat block copiato |
| 79-80 | Farfalle e petali illusori entro 3 m dallo Stregone | 1 minuto | Reminder cosmetico; nessuna aura con pill |
| 81-82 | Lo Stregone ottiene subito un'azione aggiuntiva | Istantanea | Viewer; nessuna azione eseguita dal plugin |
| 83-84 | Ogni creatura entro 9 m subisce 1d10 necrotici; lo Stregone recupera la somma | Istantanea | Viewer; bersagli, danni e cura manuali |
| 85-86 | Immagine Speculare sullo Stregone | 1 minuto | Link spell consultivo; risoluzione manuale |
| 87-88 | Volare su una creatura casuale entro 18 m | 10 minuti completi, senza concentrazione | Link spell; bersaglio casuale al tavolo |
| 89-90 | Lo Stregone è invisibile e inudibile | 1 minuto; termina se attacca o lancia spell | Reminder con fine anticipata manuale |
| 91-92 | Se muore, torna subito in vita come Reincarnazione | Finestra di 1 minuto; termina anche quando si innesca | Reminder; nessun watcher morte/HP e nessuna spell automatica |
| 93-94 | Taglia dello Stregone aumenta di una categoria | 1 minuto | Reminder; non scalare il token |
| 95-96 | Stregone e creature entro 9 m hanno vulnerabilità ai perforanti | 1 minuto | Viewer; fotografia iniziale, non aura dinamica |
| 97-98 | Musica eterea attorno allo Stregone | 1 minuto | Reminder cosmetico |
| 99-00 | Lo Stregone recupera tutti i punti stregoneria spesi | Istantanea | Dopo conferma può ripristinare il pool con history/Undo |

## 9. Riuso e supporto minimo strettamente necessario

### 9.1 Riuso obbligatorio

- `classFeatureIsReferenceOnly()` e la UI `Promemoria descrittivo` per carte passive/descritte;
- `stregone-punti-stregoneria` come unico pool dei punti;
- `planClassFeatureResourceAdjustment()` e `adjustClassFeatureResource()` per costi e recuperi;
- `withItemMetaHistory()` e Undo per ogni mutazione;
- catalogo Incantesimi esistente per i link dei nove esiti spell;
- lifecycle e rimozione delle Class Feature soltanto per reminder realmente persistiti;
- `meta.hp`/`meta.hpMax` solo se in futuro un'azione HP viene esplicitamente autorizzata.

### 9.2 Supporto condiviso minimo

Sono ammessi soltanto questi incrementi trasversali:

1. **Pool visibile senza costo fisso.** Aggiungere al record runtime un elenco derivato dei pool usati/tracciati e farlo consumare da `classFeatureResourceEntries()`. Il campo deve derivare da `resource_costs`, incluso `amount: variabile`; non duplicare l'ID in ogni consumer.
2. **Mutazione resource-only.** Permettere a una feature `instant` di consumare/recuperare una risorsa senza creare una pill. Una rappresentazione `effectPlan.kind: none` è sufficiente; non introdurre un nuovo status runtime.
3. **Valore variabile validato.** Un solo input intero con min/max per Raddoppiato e Fonte di Magia. Il valore scelto deve essere l'unica base del calcolo e della history.
4. **Recupero speciale.** Trasferire `special_refresh` nel pool generato e usarlo per il pulsante di Ripristino Stregonesco. Non collegarlo automaticamente a un nuovo sistema riposi.
5. **Tabella manuale sorgente.** Trasferire la tabella della sottoclasse all'artefatto in una forma consumata dal viewer. Non ricopiarne le 50 descrizioni in `runtime-feature-overrides.json`.

Non creare una nuova tassonomia o un framework generale per tabelle casuali. Il viewer può essere un adapter circoscritto a Impulso finché un secondo caso reale non dimostra la necessità di generalizzarlo.

## 10. File e funzioni da modificare

### Dati

- `data/class-features/phb2014_classi_database_finale.json`
  - correggere soltanto errori editoriali verificati nella fonte;
  - conservare qui la tabella completa come fonte di verità.
- `data/class-features/phb2014_livello_meccanico_v1_1.json`
  - aggiungere il pool da 1 uso di Onde di Caos;
  - correggere la meccanica di Onde da `riferimento/passiva` ad assistita con costo/recupero strutturato;
  - non copiare gli esiti della tabella.
- `data/class-features/runtime-feature-overrides.json`
  - includere le carte base, le otto opzioni e le cinque capacità di sottoclasse;
  - `defaultEnabled: true` per privilegi base/sottoclasse raggiunti;
  - `defaultEnabled: false` per ciascuna opzione di Metamagia, perché il personaggio ne conosce solo alcune;
  - configurare resource-only e gli adapter strettamente necessari;
  - non inserire testi già presenti nelle fonti.

### Generazione

- `scripts/generate-class-feature-catalog.mjs`
  - in `normalizePool()`, trasferire `special_refresh` in modo deterministico;
  - nel loop delle feature, mantenere gli ID dei pool anche per costi variabili;
  - trasferire la tabella dal record `stregone-magia-selvaggia` alla sola feature Impulso;
  - validare 50 righe, intervalli unici e ordine 01-02…99-00;
  - non modificare manualmente `src/class-features-runtime.json`; rigenerarlo.

### Core/runtime

- `src/classFeatureCore.js`
  - `classFeatureResourceEntries()`: unire `resourceCosts[].poolId` e i pool tracciati senza costo;
  - `classFeatureEffectProjection()`: riconoscere il caso senza pill per resource-only;
  - `planClassFeatureResourceAdjustment()`: riusare cap e delta esistenti;
  - aggiungere funzioni pure per costi Fonte/Raddoppiato soltanto se non possono essere espresse dai dati.
- `src/classFeatureRuntime.js`
  - riusare `activateClassFeature()` per costi fissi senza pill;
  - aggiungere un solo percorso atomico per costo/recupero variabile e reminder slot temporaneo;
  - non inserire logica specifica dei nove incantesimi;
  - preservare history e Undo.
- `src/initiative-card-modal.js`
  - `renderClassFeatures()`: carte descrittive e azioni assistite;
  - `buildClassFeatureResourceRow()`: mostrare recupero lungo e recupero speciale di livello 20 senza confonderli;
  - viewer inline della tabella d100 con filtro/selezione manuale;
  - banner e doppia selezione manuale di Caos Controllato dal livello 14;
  - form Fonte di Magia e costo variabile di Raddoppiato;
  - nessun nuovo pannello separato.
- `src/classFeatureCatalog.js`
  - mantenere i descrittivi fuori da quick action e context menu;
  - esporre quick action soltanto per operazioni assistite realmente implementate.

Evitare `src/initiativeList.js`. Non sono necessarie modifiche a HP bar, iniziativa, aura spell o movimento.

## 11. Ordine di implementazione per commit piccoli

1. **Copertura descrittiva Stregone**: includere classe base, contenitore Metamagia, otto opzioni e tre passive Magia Selvaggia; test reference-only.
2. **Pool punti stregoneria**: esposizione indipendente dal costo, special refresh e test di progressione livelli 2–20.
3. **Resource-only**: costi fissi Metamagia, Piegare la Fortuna e Onde di Caos senza pill; history/Undo.
4. **Onde di Caos**: pool da 1, uso manuale e recupero dopo Impulso richiesto dal DM.
5. **Viewer Impulso**: pass-through sorgente, 50 righe, selezione manuale, link spell e Caos Controllato.
6. **Fonte di Magia**: input validato, costi da tabella sorgente e reminder slot temporaneo; nessun inventario slot.
7. **Raddoppiato/Ripristino**: costo variabile condiviso e recupero +4 al livello 20.

Non unire questi passi a refactor del sistema Incantesimi.

## 12. Rischi di regressione

- **Pill orfane:** un'attivazione `instant` con il comportamento attuale crea una condizione senza istanza attiva. Il caso resource-only deve produrre zero condizioni.
- **Doppio inventario slot:** qualsiasi nuovo contatore slot divergerebbe dalla scheda e dal sistema Incantesimi.
- **Concentrazione errata:** applicare una spell della tabella tramite il cast normale aggiungerebbe concentrazione dove l'Impulso la esclude.
- **Metamagia errata:** lo stesso cast normale potrebbe offrire Metamagia a una spell da Impulso, vietata dalla regola.
- **Recupero eccessivo:** il generico `resetClassFeatureResources()` ripristina al massimo; non usarlo per il +4 del riposo breve.
- **Default Metamagia:** abilitare tutte le otto opzioni per default mostrerebbe capacità non conosciute dal personaggio.
- **Trigger multiclass:** osservare una spell lanciata non prova che sia una spell da Stregone.
- **Tabella duplicata:** copiare i 50 testi negli override rende inevitabile il drift.
- **Worktree concorrente:** non sostituire generatori, override o test già modificati dal batch Barbaro.

## 13. Test automatici obbligatori

### Catalogo e generazione

- tutte le capacità base compaiono ai livelli corretti;
- tutte le capacità Magia Selvaggia compaiono a 1/1/6/14/18;
- le otto opzioni Metamagia ereditano `classId: stregone` e livello minimo 3;
- le opzioni sono disabilitate per default; i privilegi raggiunti sono visibili;
- la tabella generata contiene esattamente 50 intervalli unici e ordinati;
- ogni riga generata mantiene testo e intervallo della fonte;
- due generazioni consecutive producono byte identici;
- il JSON runtime è sempre rigenerato, mai patchato direttamente.

### Reminder descrittivi

- Incantesimi, Origine, Metamagia, ASI, Caos Controllato e Bombardamento mostrano `Promemoria descrittivo`;
- non mostrano `Non disponibile`, `Usa` o `Attiva`;
- non appaiono in quick action/context menu;
- non modificano metadata, condizioni o history.

### Risorse

- `stregone-punti-stregoneria` ha massimo 2 al livello 2 e pari al livello fino a 20;
- Fonte mostra il pool anche con costo variabile;
- costi fissi Metamagia e Piegare consumano il valore corretto;
- resource-only crea zero condizioni e zero istanze persistenti;
- una risorsa insufficiente blocca la conferma senza mutazioni;
- Undo ripristina esattamente il valore precedente;
- Ripristino Stregonesco aggiunge 4, non supera 20 e non è disponibile prima del livello 20;
- il reset lungo resta distinto dal recupero breve +4.

### Onde di Caos

- pool iniziale/massimo 1;
- `Usa Onde` porta 1→0 senza applicare Vantaggio a un token;
- il normale viewer Impulso non recupera Onde;
- `Impulso richiesto dal DM`, disponibile quando spesa, apre la tabella e recupera 0→1 dopo conferma;
- annullare il viewer non recupera l'uso;
- Undo ripristina il pool.

### Impulso e Caos Controllato

- nessuna API casuale e nessun pulsante di tiro;
- al livello 1 il viewer accetta un solo risultato finale;
- dal livello 14 accetta due risultati manuali e richiede la scelta finale;
- 01-02 ricorda di ignorare lo stesso risultato nei tiri successivi;
- i nove link risolvono record spell esistenti;
- le cinque spell con concentrazione mostrano esplicitamente “senza concentrazione, durata completa”;
- aprire o scegliere un risultato non crea concentrazione, danni, cure, movimento, token, zone o condizioni automatiche;
- 69-70 e 95-96 sono descritte come fotografia iniziale, non come aura dinamica;
- 75-76 è descritto come innesco di fine turno, ma non applica Accecato automaticamente;
- 99-00 può ripristinare soltanto il pool punti dopo conferma e con Undo.

### Fonte e Metamagia

- costi slot creato: 1→2, 2→3, 3→5, 4→6, 5→7;
- non è selezionabile uno slot creato sopra il 5°;
- conversione slot→punti accetta 1–9 e applica cap al massimo;
- nessun campo `spellSlots` viene scritto;
- reminder slot creato termina manualmente o al riposo lungo ed è ripristinabile con Undo;
- Raddoppiato costa 1 per trucchetto e N per spell di livello N;
- nessuna opzione Metamagia modifica una spell, un tiro o un target nel primo batch.

### Baseline generale

- test Incantesimi invariati;
- test Ira, Attacco Irruento e Spirito Totemico: Lupo invariati;
- nessuna regressione su HP, concentrazione, iniziativa, movimento, condizioni, aura e history.

## 14. Checklist manuale GM/Player in Owlbear Rodeo

1. Configurare uno Stregone Magia Selvaggia ai livelli 1, 2, 3, 6, 14, 18 e 20 e verificare la progressione delle carte.
2. Al livello 3 abilitare soltanto due opzioni di Metamagia; verificare che le altre restino non mostrate.
3. Consumare punti con una Metamagia fissa e con Piegare la Fortuna; verificare contatore e Undo, senza pill.
4. Usare Onde di Caos: il contatore passa a 0, ma nessun tiro viene eseguito o modificato.
5. Aprire un normale Impulso: scegliere manualmente un intervallo e verificare che Onde resti a 0.
6. Usare `Impulso richiesto dal DM`: annullare una volta e confermare una volta; Onde si recupera solo alla conferma.
7. Al livello 14 inserire due risultati fisici e scegliere quale applicare; verificare che il plugin non generi numeri.
8. Controllare gli esiti 13-14, 45-46, 63-64, 77-78 e 87-88: devono ricordare niente concentrazione e durata completa.
9. Controllare 05-06, 37-38 e 47-48: nessun token o richiesta di stat block.
10. Controllare 39-40 e 83-84: nessuna mutazione HP automatica.
11. Creare uno slot temporaneo con Fonte di Magia, terminarne il reminder quando speso e provare Undo.
12. Convertire uno slot dichiarato manualmente in punti; verificare il cap senza comparsa di un contatore slot.
13. Al livello 20 usare Ripristino Stregonesco con pool a 13/20 e 18/20; ottenere rispettivamente 17/20 e 20/20.
14. Verificare da Player che i reminder siano leggibili; verificare da GM che le sole azioni assistite abbiano controlli.

## 15. Criteri di accettazione

Il lavoro è accettabile soltanto se:

- ogni capacità base, ogni opzione Metamagia e le cinque capacità Magia Selvaggia sono visibili al livello corretto;
- nessuna capacità viene dichiarata implementata se mostra ancora `runtimeSupport.status: not-automated` e un'azione disabilitata;
- tutti i 50 risultati della tabella sono raggiungibili dalla fonte generata;
- il plugin non tira dadi e non determina risultati casuali;
- Fonte di Magia non introduce un inventario slot parallelo;
- le spell da Impulso non acquisiscono concentrazione né Metamagia per errore;
- resource-only, Onde, Fonte, Ripristino e 99-00 preservano history/Undo;
- nessuna operazione istantanea lascia pill orfane;
- nessun testo della tabella è duplicato negli override;
- il diff resta circoscritto ai dati Stregone/Magia Selvaggia, generatore, supporti minimi consumati, UI e test relativi;
- generazione, audit, suite test e build passano.

Comandi finali:

```text
npm.cmd run generate:class-features
npm.cmd run audit:class-features
npm.cmd test
npm.cmd run build
```

