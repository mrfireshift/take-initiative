# Audit e piano di implementazione — Ladro / Mistificatore Arcano

## 1. Scopo e vincoli

Questo documento copre la classe base **Ladro** e la sottoclasse **Mistificatore Arcano** del regolamento 2014 presente nei dataset del progetto.

Vincoli dell'implementazione:

- ogni tiro di dado, tiro per colpire, prova, tiro salvezza e tiro di danno resta al tavolo;
- il plugin mostra reminder contestuali, bersagli, durata e terminazione degli effetti;
- gli incantesimi continuano a essere gestiti dal sottosistema Incantesimi esistente;
- non si duplicano schede, slot, concentrazione, durata o lancio di **Mano magica**;
- non si introducono rilevamento automatico di colpi, vantaggio, furtività, posizione della mano o risultati dei tiri;
- history, Undo e rimozione degli effetti usano le primitive comuni delle Caratteristiche di classe;
- `meta.hp` e `meta.hpMax` restano gli unici campi HP canonici;
- `src/class-features-runtime.json` è un artefatto generato e non va modificato a mano;
- la patch deve restare circoscritta: niente modifiche a HP, iniziativa, movimento, aura engine, spell engine o `initiativeList.js`.

## 2. Stato verificato

Lo snapshot è stato letto su `main`, HEAD `9923cc3` (`Approve class feature taxonomy v1`). Il worktree contiene modifiche concorrenti di altri batch: prima di implementare, l'agente deve ripetere `git status --short` e rieseguire i test dopo aver rigenerato il catalogo.

Nel runtime corrente:

- **nessuna** capacità del Ladro è `implemented`;
- **nessuna** capacità del Mistificatore Arcano è `implemented`;
- sette capacità hanno un record `not-automated` con `effectPlan: null`: Attacco Furtivo, Azione Scaltra, Schivata Prodigiosa, Elusione, Imboscata Magica, Ingannatore Versatile e Ladro di Incantesimi;
- le altre capacità qui censite non sono esposte dal runtime;
- **Mano magica** è già presente nel catalogo Incantesimi con ID stabile `mage-hand`, durata 1 minuto e senza concentrazione.

Un record `not-automated` non costituisce un'implementazione utilizzabile: non offre necessariamente una scheda visibile, un'attivazione, un marker o un lifecycle.

## 3. Matrice di audit

| Livello | Capacità | Stato attuale | Stato richiesto | Logica prevista |
|---:|---|---|---|---|
| 1, 6 | Maestria | Assente | Da implementare, descrittiva | Reminder delle competenze scelte e del raddoppio del bonus; nessun editor di abilità o calcolo dei tiri. |
| 1 | Attacco Furtivo | Placeholder `not-automated` | Da implementare, descrittiva contestuale | Mostrare requisiti, limite una volta per turno e dadi correnti; non rilevare colpo, arma, vantaggio, nemico adiacente o utilizzo. |
| 1 | Gergo Ladresco | Assente | Da implementare, descrittiva | Scheda di riferimento; nessun effetto o attivazione. |
| 2 | Azione Scaltra | Placeholder `not-automated` | Da implementare, descrittiva | Reminder dell'azione bonus per Disimpegno, Nascondersi o Scatto; nessuna automazione del movimento o della furtività. |
| 3 | Archetipo Ladresco | Assente | Da implementare, descrittiva | Scheda strutturale che ricorda la scelta dell'archetipo; nessun effetto. |
| 4, 8, 10, 12, 16, 19 | Aumento dei Punteggi di Caratteristica | Assente | Da implementare, descrittiva | Scheda di riferimento; nessuna modifica automatica delle caratteristiche. |
| 5 | Schivata Prodigiosa | Placeholder `not-automated` | Da implementare, descrittiva contestuale | Reminder della reazione dopo un colpo da un attaccante visibile; nessun calcolo o aggiornamento HP. |
| 7 | Elusione | Placeholder `not-automated` | Da implementare, descrittiva contestuale | Ricordare l'esito regolamentare del TS Des; il TS e il danno restano manuali. |
| 11 | Dote Affidabile | Assente | Da implementare, descrittiva | Ricordare che un d20 pari o inferiore a 9 conta come 10 nelle prove competenti; non leggere né alterare il dado. |
| 14 | Percezione Cieca | Assente | Da implementare, descrittiva | Reminder della portata e del requisito uditivo; niente aura, geometria o rilevamento di invisibili/nascosti. |
| 15 | Mente Sfuggente | Assente | Da implementare, descrittiva | Reminder della competenza nei TS Saggezza; nessun tiro automatico. |
| 18 | Inafferrabile | Assente | Da implementare, descrittiva | Reminder passivo sull'impossibilità di ottenere vantaggio contro il Ladro se non incapacitato; nessuna pill permanente. |
| 20 | Colpo di Fortuna | Assente | Da implementare, assistita | Dopo conferma del tavolo, consumare 1 uso; nessuna modifica a tiro, colpo o prova. Recupero a riposo breve o lungo, history e Undo. |
| 3 | Incantesimi | Assente | Da implementare, descrittiva | Scheda di raccordo al sistema Incantesimi; niente secondo inventario, slot o filtro automatico per scuola. |
| 3 | Gioco di Prestigio della Mano Magica | Assente | Da implementare, descrittiva contestuale | Reminder delle opzioni speciali mentre `mage-hand` è attiva; prove contrapposte, oggetti e controllo della mano restano manuali. |
| 9 | Imboscata Magica | Placeholder `not-automated` | Da implementare, assistita | Dopo conferma di furtività e lancio, scegliere uno o più bersagli qualificati e applicare un reminder fino alla fine del turno corrente del Ladro. |
| 13 | Ingannatore Versatile | Placeholder `not-automated` | Da implementare, assistita | Dopo conferma che Mano magica è attiva e adiacente al bersaglio, scegliere una creatura e applicare il reminder fino alla fine del turno corrente. |
| 17 | Ladro di Incantesimi | Placeholder `not-automated` | Da implementare, assistita | Dopo il TS fallito confermato al tavolo, scegliere il lanciatore e l'incantesimo esistente; consumare la risorsa e, se rubato, mantenere il reminder per 8 ore. |

## 4. Analisi regolistica e comportamento richiesto

### 4.1 Capacità della classe Ladro

#### Maestria — descrittiva

Al 1° livello il giocatore sceglie due competenze tra abilità e arnesi da scasso secondo il testo della capacità; al 6° livello effettua altre due scelte. La capacità raddoppia il bonus di competenza nelle prove pertinenti.

Implementazione:

- rendere disponibile la scheda ai livelli corretti;
- mostrare il testo completo e il promemoria delle nuove scelte al 6° livello;
- non introdurre un editor delle competenze né metadata persistenti per le scelte;
- non calcolare o intercettare prove.

#### Attacco Furtivo — descrittiva contestuale

Il danno extra si applica una volta per **turno**, non una volta per round, quando il tavolo ha già determinato un colpo valido con arma accurata o a distanza e una delle configurazioni regolamentari richieste. Tutti questi presupposti dipendono dal tavolo.

Implementazione:

- esporre requisiti e limite temporale nella scheda;
- mostrare il dado corrente derivandolo dalla progressione canonica della classe (`attacco_furtivo`), senza una seconda tabella hardcoded;
- non tirare i dadi del danno;
- non rilevare colpi, tipi d'arma, vantaggio/svantaggio, distanza fra nemici o stato incapacitato;
- non creare una risorsa “usato nel round”, perché sarebbe regolisticamente errata nei turni altrui.

#### Gergo Ladresco — descrittiva

Solo scheda di consultazione. Non ha bersaglio, durata, effetto o attivazione runtime.

#### Azione Scaltra — descrittiva

Ricorda che nel proprio turno il Ladro può usare un'azione bonus per Disimpegno, Nascondersi o Scatto. Non deve muovere token, cambiare condizioni o determinare l'esito di Nascondersi.

#### Archetipo Ladresco — descrittiva

Voce strutturale per la scelta della sottoclasse. Non deve aprire un selettore né scrivere metadata.

#### Aumento dei Punteggi di Caratteristica — descrittiva

Scheda disponibile ai livelli del Ladro, incluso il livello 10 specifico della classe. Il plugin non modifica punteggi, talenti o scheda del personaggio.

#### Schivata Prodigiosa — descrittiva contestuale

La reazione è disponibile quando un attaccante visibile colpisce il Ladro e dimezza il danno di quell'attacco. Il plugin deve ricordare trigger ed effetto, ma non può decidere visibilità o colpo, calcolare il dimezzamento o mutare gli HP.

#### Elusione — descrittiva contestuale

Si applica agli effetti che consentono un TS Destrezza per dimezzare il danno: con successo il Ladro non subisce danni, con fallimento ne subisce metà. Poiché il TS è un tiro, l'intera risoluzione resta al tavolo. L'attuale classificazione automatica/deterministica del dato meccanico deve essere corretta o sovrascritta come `reference`.

#### Dote Affidabile — descrittiva

Il d20 di una prova che include il bonus di competenza conta come 10 se mostra 9 o meno. Il plugin mostra il reminder e non legge, sostituisce o ritira il dado.

#### Percezione Cieca — descrittiva

Il reminder deve includere portata 3 m e requisito di poter udire. Non utilizzare aura engine, membership, pill sugli altri token o rilevamento automatico di invisibilità e furtività.

#### Mente Sfuggente — descrittiva

Ricorda la competenza nei TS Saggezza. Nessuna automazione del tiro o modifica della scheda.

#### Inafferrabile — descrittiva

Ricorda che nessun tiro per colpire può avere vantaggio contro il Ladro finché non è incapacitato. Non applicare una condizione permanente e non intercettare gli attacchi.

#### Colpo di Fortuna — assistita, `resource-only`

Il giocatore può trasformare un attacco mancato in un colpo o trattare il d20 di una prova fallita come 20. La scelta avviene dopo un risultato già risolto al tavolo.

Implementazione:

- pulsante esplicito `Conferma uso` sulla scheda, non quick action generica;
- pool fisso di 1 uso;
- recupero sia a riposo breve sia a riposo lungo;
- consumo solo dopo conferma del giocatore/GM;
- history e Undo tramite il percorso risorse comune;
- nessun marker persistente, bersaglio o pill;
- nessuna modifica al tiro, al colpo o alla prova.

Il dato sorgente attuale va corretto: l'attivazione non è passiva e il recupero non è soltanto a riposo breve.

### 4.2 Capacità del Mistificatore Arcano

#### Incantesimi — descrittiva con riuso del sistema Incantesimi

La capacità definisce Intelligenza come caratteristica da incantatore, progressione degli slot, trucchetti e incantesimi appresi, con i vincoli di scuola previsti dal testo 2014.

Implementazione:

- mostrare una scheda descrittiva della capacità;
- indirizzare il giocatore al normale sistema Incantesimi;
- lasciare al giocatore la selezione degli incantesimi e il rispetto dei vincoli di scuola;
- non creare un secondo inventario, un secondo contatore slot o un nuovo esecutore;
- non automatizzare CD, tiro per colpire con incantesimo o scelte di apprendimento.

#### Gioco di Prestigio della Mano Magica — descrittiva contestuale

La capacità estende il normale trucchetto: la mano può essere invisibile, manipolare oggetti indossati o contenuti e usare arnesi da scasso a distanza; le azioni non notate richiedono una prova contrapposta. Azione Scaltra permette il controllo della mano come azione bonus.

Implementazione:

- mantenere `mage-hand` come unica fonte del lancio, della durata e della terminazione;
- mostrare il reminder della capacità, con riferimento al fatto che si usa mentre Mano magica è attiva;
- non generare token, zone o una seconda istanza dell'incantesimo;
- non leggere inventari né spostare oggetti;
- non tirare o confrontare Destrezza di Mano e Percezione;
- non aggiungere concentrazione: `mage-hand` non la richiede.

#### Imboscata Magica — assistita, marker multi-bersaglio

Quando il Ladro è nascosto a una creatura e le lancia un incantesimo, quella creatura ha svantaggio a ogni TS contro quell'incantesimo durante quel turno. Furtività, lancio, bersagli dell'incantesimo e TS restano manuali.

Flusso richiesto:

1. il tavolo conferma che il Ladro era nascosto e che l'incantesimo è stato lanciato;
2. il giocatore apre la capacità e seleziona tutte e sole le creature qualificate;
3. il runtime esclude il Ladro dalla selezione e non impone un raggio proprio;
4. ogni bersaglio riceve un reminder strutturato con `sourceId`, `sourceName`, `appliedAt` ed expiry;
5. i marker scadono alla fine del **turno corrente** del Ladro;
6. rimozione manuale, history e Undo usano le primitive comuni.

Il reminder deve specificare che riguarda soltanto i TS contro l'incantesimo appena lanciato in quel turno. Non rilevare lo stato nascosto, non intercettare il cast e non applicare svantaggio ai dadi.

#### Ingannatore Versatile — assistita, marker singolo

Come azione bonus il Ladro designa una creatura entro 1,5 m dalla mano spettrale e ottiene vantaggio ai tiri per colpire contro di essa fino alla fine del turno.

Flusso richiesto:

1. il tavolo conferma che Mano magica è attiva e che la creatura è entro 1,5 m **dalla mano**;
2. il giocatore seleziona esattamente una creatura, escludendo il Ladro;
3. il runtime non valida la distanza dal token del Ladro, perché sarebbe l'origine geometrica sbagliata;
4. il bersaglio riceve un reminder strutturato fino alla fine del turno corrente del Ladro;
5. rimozione manuale, history e Undo usano il percorso comune.

Non creare una posizione virtuale per la mano, non verificare automaticamente la geometria e non modificare i tiri per colpire.

#### Ladro di Incantesimi — assistita, adapter mirato

La capacità usa la reazione subito dopo che una creatura lancia un incantesimo che bersaglia o include il Ladro. Il lanciatore effettua un TS con la propria caratteristica da incantatore contro la CD del Ladro. Solo dopo che il tavolo conferma il fallimento si risolve l'effetto. Se l'incantesimo è almeno di 1° livello e di livello lanciabile dal Ladro, il Ladro lo conosce per 8 ore e il lanciatore originale non può lanciarlo per lo stesso periodo. Un uso per riposo lungo.

Flusso richiesto:

1. il tavolo risolve manualmente trigger, CD e TS;
2. il giocatore seleziona esattamente il lanciatore originale;
3. sceglie l'incantesimo dal catalogo esistente, usando ID e nomi del sistema Incantesimi; non deve ricopiare uno stat block;
4. sceglie `Solo effetto negato` oppure `Incantesimo rubato per 8 ore`;
5. il secondo modo richiede un incantesimo di livello almeno 1 e la conferma manuale che il livello sia lanciabile dal Ladro;
6. l'attivazione consuma l'unico uso e registra history/Undo;
7. nel modo `Solo effetto negato` non resta alcun marker;
8. nel modo `Incantesimo rubato` il lanciatore riceve un reminder/pill per 8 ore, terminabile manualmente;
9. l'istanza conserva l'ID stabile dell'incantesimo in `choiceId` e risolve il nome dal catalogo in UI;
10. il marker non blocca tecnicamente il lancio e non aggiunge l'incantesimo a un inventario del Ladro.

Non automatizzare TS, CD, negazione degli effetti già applicati, livello massimo lanciabile, slot, lancio dell'incantesimo rubato o rimozione di effetti spell. La capacità deve riusare il normale sistema Incantesimi quando il tavolo decide che il Ladro lancia l'incantesimo rubato.

## 5. Primitive strettamente necessarie

### 5.1 Expiry alla fine del turno corrente

Imboscata Magica e Ingannatore Versatile richiedono una semantica diversa da “fine del prossimo turno”. Aggiungere il valore comune `turn-end`:

- il generatore normalizza `until_end_of_turn`/`turn-end` in `duration.timing: "turn-end"`;
- `classFeatureDurationTiming()` riconosce il valore;
- la condizione usa l'expiry già compatibile con il core effetti: `mode: "turn-end"`, attore `source`, `actorId` del Ladro, `remaining: 1`, senza anchor `next-turn`;
- la UI mostra `fino alla fine del turno corrente`;
- un test distingue esplicitamente `turn-end` da `next-turn-end`.

Non estendere l'initiative engine: la primitive deve tradurre la durata nella struttura expiry già consumata dagli effetti.

### 5.2 Durate espresse in ore

Il generatore oggi tratta round e minuti ma non ore. Estendere la normalizzazione generica:

- 1 minuto = 10 round;
- 1 ora = 600 round;
- 8 ore = 4.800 round.

La durata di Ladro di Incantesimi deve provenire dal dato sorgente normalizzato, non da un valore scritto soltanto nell'artefatto generato.

### 5.3 Valore corrente da progressione canonica

Per Attacco Furtivo preservare nel catalogo generato il riferimento alla progressione della classe indicata da `dice_from` e risolvere il valore al livello del personaggio con una funzione pura. Non salvare il valore nei metadata e non duplicare la tabella dei dadi negli override.

Questa primitive è solo di presentazione: non effettua tiri e non crea effetti.

## 6. File e funzioni da modificare

### Dati sorgente

#### `data/class-features/phb2014_classi_database_finale.json`

- verificare che i testi descrittivi di classe e sottoclasse corrispondano alla versione 2014/errata scelta dal progetto;
- correggere soltanto omissioni testuali dimostrate;
- non aggiungere chiavi runtime.

#### `data/class-features/phb2014_livello_meccanico_v1_1.json`

- correggere Elusione come capacità non risolta automaticamente;
- correggere trigger e recupero di Colpo di Fortuna: uso opzionale, riposo breve **e** lungo;
- specificare per Imboscata Magica bersagli multipli qualificati e durata fino a fine turno corrente;
- specificare per Ingannatore Versatile bersaglio singolo, origine dalla Mano magica e durata fino a fine turno corrente;
- specificare per Ladro di Incantesimi reazione, bersaglio lanciatore, durata 8 ore, scelta dell'incantesimo e costo di 1 uso;
- non inserire ID di token, dati UI o duplicati degli incantesimi.

#### `data/class-features/runtime-feature-overrides.json`

Aggiungere decisioni esplicite e deterministiche:

- tutte le capacità descrittive: `include: true`, `status: not-automated`, livello `reference`, `defaultEnabled: true`, `quickActionEligible: false`;
- Colpo di Fortuna: `implemented`, adapter `resource-only`, livello `assisted`, tracking istantaneo, nessun effect plan, quick action disabilitata;
- Imboscata Magica: `implemented`, adapter/primitive condizione comune, selezione multi-bersaglio, sorgente esclusa, nessun raggio proprio, timing `turn-end`;
- Ingannatore Versatile: `implemented`, condizione comune, un bersaglio, sorgente esclusa, nessuna validazione di distanza dal Ladro, timing `turn-end`;
- Ladro di Incantesimi: `implemented`, adapter mirato, un bersaglio, costo risorsa 1, durata 8 ore, quick action disabilitata.

Non aggiungere metadata senza consumer runtime.

### Generazione e core

#### `scripts/generate-class-feature-catalog.mjs`

- estendere `normalizeDuration()` per fine turno corrente e ore;
- preservare il riferimento alla progressione usata da Attacco Furtivo;
- mantenere output deterministico;
- non aggiungere eccezioni basate sugli ID se una normalizzazione generica esprime il dato.

#### `src/classFeatureCore.js`

- estendere `classFeatureDurationTiming()` con `turn-end`;
- pianificare l'expiry alla fine del turno corrente con la struttura comune;
- aggiungere un resolver puro della progressione corrente, se il generatore non ne espone già uno riutilizzabile;
- non toccare navigazione dell'iniziativa o riconciliazione generale.

### Runtime e UI

#### `src/classFeatureRuntime.js`

- mantenere Colpo di Fortuna sul percorso generico `resource-only`;
- usare il planner comune per Imboscata Magica e Ingannatore Versatile;
- aggiungere solo l'adattamento necessario a Ladro di Incantesimi: validazione modo/incantesimo, rifiuto dei trucchetti nel modo rubato e preparazione dinamica del piano;
- dopo la preparazione, delegare a `planClassFeatureActivation()` e alle primitive comuni di condizione, risorsa, history e Undo;
- non creare un secondo writer di condizioni o una cronologia parallela;
- non modificare incantesimi, slot, concentrazione o HP.

#### `src/initiative-card-modal.js`

- mostrare le capacità reference ai livelli corretti;
- visualizzare il dado corrente di Attacco Furtivo dalla progressione derivata;
- aggiungere l'etichetta UI di `turn-end`;
- per Ladro di Incantesimi aggiungere controlli speciali circoscritti: selezione del lanciatore, input incantesimo collegato al datalist spell già esistente e scelta tra negato/rubato;
- nelle istanze attive risolvere `choiceId` nel nome dell'incantesimo;
- non mostrare quick action generiche per queste capacità.

#### `initiative-card-modal.html` e CSS

Riutilizzare il datalist Incantesimi e `.class-feature-special-controls`. Modificare markup o CSS soltanto se manca un contenitore indispensabile; non creare un secondo modal.

### Artefatto derivato

#### `src/class-features-runtime.json`

Rigenerare esclusivamente tramite il comando previsto dal progetto. Non modificarlo manualmente.

### File da non modificare

- `src/initiativeList.js`;
- spell core, catalogo incantesimi e gestione concentrazione;
- HP bar e `src/hpMemory.js`;
- initiative engine;
- aura engine e movimento.

## 7. Ordine vincolante di implementazione

1. Ripetere snapshot Git e leggere eventuali modifiche concorrenti nei file coinvolti.
2. Correggere i dati meccanici sorgente senza inserire dettagli runtime.
3. Aggiungere gli override di inclusione e i tre comportamenti assistiti.
4. Estendere il generatore con `turn-end`, ore e progressione derivata.
5. Rigenerare `src/class-features-runtime.json` e verificare che un secondo run non cambi il file.
6. Implementare e testare la primitive `turn-end` nel core.
7. Collegare Imboscata Magica e Ingannatore Versatile al planner e writer comuni.
8. Implementare Colpo di Fortuna tramite il percorso `resource-only` esistente.
9. Implementare l'adapter minimo di Ladro di Incantesimi, delegando la scrittura effettiva al percorso comune.
10. Aggiungere i controlli UI e i reminder descrittivi.
11. Eseguire test mirati, suite completa e build.
12. Verificare manualmente in Owlbear Rodeo con un Ladro controllato dal Player e con il GM.

## 8. Test automatici obbligatori

Creare `test/rogueArcaneTricksterFeatureRuntime.test.js` oppure integrare i test specializzati già adottati dai batch correnti.

### Catalogo e livelli

- tutte le 13 voci della classe base compaiono ai livelli corretti;
- le 5 voci del Mistificatore Arcano compaiono solo con la sottoclasse corretta e ai livelli 3/9/13/17;
- le capacità descrittive risultano reference e non hanno pulsanti di attivazione o quick action;
- nessuna voce duplica `mage-hand` o un record spell.

### Attacco Furtivo

- il valore mostrato è 1d6 al livello 1, 2d6 al 3, 3d6 al 5 e 10d6 al 19/20;
- il valore deriva dalla progressione canonica e non usa RNG;
- nessun metadata di utilizzo per round viene scritto.

### Colpo di Fortuna

- pool iniziale fisso 1;
- l'uso confermato porta il pool a 0;
- riposo breve e lungo riportano il pool a 1;
- Undo ripristina la risorsa;
- non vengono create pill, condizioni o mutazioni del tiro.

### Sistema Incantesimi e Mano magica

- `mage-hand` resta risolvibile dal catalogo spell con ID stabile;
- Incantesimi e Gioco di Prestigio non creano un secondo spell executor;
- nessuna delle capacità altera concentrazione, slot o durata di Mano magica.

### Primitive `turn-end`

- un effetto applicato nel turno corrente del Ladro termina alla fine di quello stesso turno;
- non sopravvive fino al turno successivo del Ladro;
- `turn-end` e `next-turn-end` producono expiry diverse;
- rimozione anticipata e Undo restano idempotenti.

### Imboscata Magica

- accetta più bersagli e rifiuta il token sorgente;
- non impone un raggio proprio;
- crea per ogni bersaglio un reminder con sorgente, timestamp ed expiry corretti;
- scade a fine turno corrente;
- rimozione e Undo aggiornano tutte e sole le istanze coinvolte;
- non legge furtività, cast o risultati dei TS.

### Ingannatore Versatile

- richiede esattamente un bersaglio diverso dal Ladro;
- non calcola la distanza dal Ladro;
- crea una pill/reminder con expiry a fine turno corrente;
- termina manualmente e tramite expiry senza residui;
- non modifica i tiri per colpire.

### Ladro di Incantesimi

- ha un solo uso e recupera al riposo lungo;
- rifiuta attivazione senza lanciatore, modo o incantesimo valido;
- il modo rubato rifiuta un trucchetto di livello 0;
- `Solo effetto negato` consuma la risorsa ma non crea istanza persistente;
- `Incantesimo rubato` crea sul lanciatore un reminder di 4.800 round;
- l'istanza conserva `sourceId`, `sourceName`, `appliedAt`, expiry e `choiceId` uguale all'ID spell;
- UI e pill mostrano il nome risolto dal catalogo, non uno stat block copiato;
- rimozione manuale e Undo ripristinano coerentemente marker e risorsa;
- il runtime non impedisce il lancio al bersaglio e non aggiunge spell/slot al Ladro.

### Regressione e determinismo

- generazione eseguita due volte produce lo stesso artefatto byte per byte;
- test esistenti di Incantesimi, condizioni, history/Undo, Barbaro, Bardo e Stregone restano verdi;
- build del progetto completata;
- nessun test richiede randomizzazione o risultati di dadi.

## 9. Checklist manuale GM/Player in Owlbear Rodeo

### Preparazione

- [ ] Creare un token Ladro con livello e sottoclasse Mistificatore Arcano.
- [ ] Verificare la vista GM e quella del Player che controlla il token.
- [ ] Preparare almeno due creature bersaglio e assegnare un turno al Ladro.
- [ ] Verificare che il normale incantesimo Mano magica sia disponibile dal sistema Incantesimi.

### Classe base

- [ ] Controllare che tutte le schede descrittive appaiano soltanto ai livelli previsti.
- [ ] Verificare che Attacco Furtivo mostri requisiti, “una volta per turno” e dado corretto senza pulsante di tiro.
- [ ] Verificare che Schivata Prodigiosa ed Elusione non modifichino gli HP.
- [ ] Usare Colpo di Fortuna, controllare consumo, riposo breve, riposo lungo e Undo.

### Mano magica

- [ ] Lanciare Mano magica dal sistema Incantesimi e verificare che il lifecycle resti quello spell.
- [ ] Leggere Gioco di Prestigio senza vedere una seconda mano, zona o concentrazione.
- [ ] Terminare Mano magica dal sistema spell e verificare l'assenza di residui creati dalla capacità.

### Imboscata Magica

- [ ] Confermare manualmente furtività e lancio, quindi scegliere due bersagli.
- [ ] Verificare pill/reminder, nome del Ladro sorgente e descrizione limitata allo spell corrente.
- [ ] Verificare la scadenza alla fine del turno corrente, non a quella del turno successivo.
- [ ] Ripetere e provare rimozione anticipata e Undo.

### Ingannatore Versatile

- [ ] Confermare manualmente posizione della Mano magica e scegliere un bersaglio.
- [ ] Verificare che il plugin non misuri la distanza dal Ladro.
- [ ] Verificare reminder e scadenza alla fine del turno corrente.
- [ ] Provare terminazione manuale e Undo.

### Ladro di Incantesimi

- [ ] Risolvere manualmente trigger e TS fallito.
- [ ] Selezionare lanciatore e spell dal catalogo senza copiare descrizioni.
- [ ] Provare `Solo effetto negato`: la risorsa cala e non resta una pill.
- [ ] Dopo riposo lungo, provare `Incantesimo rubato`: pill sul lanciatore, nome spell corretto e durata 8 ore.
- [ ] Verificare che un trucchetto non sia accettato nel modo rubato.
- [ ] Verificare che il lanciatore possa comunque usare il normale sistema spell: la pill è un reminder, non un blocco tecnico.
- [ ] Provare terminazione anticipata e Undo dalla history.

## 10. Criteri di accettazione

Il batch è accettabile soltanto se:

- tutte le capacità della classe e sottoclasse sono visibili ai livelli corretti;
- le capacità con dadi restano reminder e non eseguono o interpretano tiri;
- Attacco Furtivo mostra la progressione corretta senza duplicarla;
- Colpo di Fortuna traccia soltanto l'uso confermato e recupera a entrambi i riposi previsti;
- Mano magica e gli incantesimi restano interamente nel sistema Incantesimi esistente;
- Imboscata Magica e Ingannatore Versatile usano marker comuni con scadenza alla fine del turno corrente;
- Ladro di Incantesimi usa spell esistenti per ID/nome, non richiede stat block ricopiati e conserva risorsa, history, Undo e terminazione;
- nessuna capacità automatizza HP, danni, attacchi, prove, TS, vantaggio/svantaggio o rilevamento spaziale;
- non sono stati introdotti metadata privi di consumer;
- l'artefatto runtime è stato rigenerato, non editato a mano, ed è deterministico;
- suite automatica, build e checklist GM/Player risultano completate senza regressioni.

## 11. Consegna richiesta al secondo agente

Nel report finale indicare:

- snapshot Git effettivamente implementato;
- file sorgente, override, generatore, core, runtime, UI e test modificati;
- conferma esplicita che `src/class-features-runtime.json` è stato rigenerato;
- risultati dei test mirati, della suite completa e della build;
- esito di ogni voce della checklist Owlbear Rodeo;
- eventuali deviazioni da questo piano, fermandosi prima di introdurre infrastruttura generale non prevista.
