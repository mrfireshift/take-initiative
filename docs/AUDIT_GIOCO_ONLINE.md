# Audit: Take Initiative! nel gioco online

Data: 30/10/2026. Fase 1, in sola lettura: nessun file di codice modificato.

Domanda dell'utente: quanto è utile il plugin per il gioco online, quali limiti
ha e come superarli; serve una «modalità VTT online» o ce la caviamo con ciò che
c'è?

## In breve

- **Per giocare online da subito bastano le opzioni attuali e un deploy.**
  Il GM continua a fare tutto, come al tavolo, e i giocatori guardano. Servono
  quattro impostazioni (sezione 3) e la build pubblicata: online i giocatori
  caricano solo quella di Render, che oggi è ferma al 27/10.
- **Una modalità online separata la sconsiglio.** Le differenze sono quasi tutte
  regole su chi vede e chi segue cosa, e il sistema delle opzioni ha già scope di
  stanza, scena e browser. Una modalità raddoppierebbe i percorsi fragili (turno
  attivo, coda di render, `sync-open`) e non saprebbe gestire il gioco ibrido,
  con lo schermo del tavolo e giocatori remoti nella stessa stanza.
- **Le opzioni però non risolvono tre cose**, e lì conviene lavorare:
  1. lo schermo del giocatore non è suo: la telecamera segue il turno, il
     tracker si riapre e torna nella posizione decisa dal GM;
  2. il plugin non sa chi gioca chi: niente «tocca a te», avvisi uguali per
     tutti;
  3. i tracker dei giocatori scrivono sui token e il plugin presuppone un solo
     GM. Al tavolo i client sono due; online sono N+1, e i difetti pesano di più.
- **Proposta:** un profilo «Tavolo / Online» nelle Opzioni, che raccolga le
  impostazioni, e otto lotti piccoli e indipendenti (sezione 5). I default
  restano quelli del tavolo.

## 1. Cosa cambia passando online

| Al tavolo | Online |
| --- | --- |
| Un solo client giocatore, sullo stesso laptop del GM | N client, con connessioni e dispositivi diversi (portatili piccoli, tablet) |
| Il client giocatore è solo un display: nessuno lo tocca | Ogni giocatore ha mouse, tastiera, il suo pan e il suo zoom |
| Uno schermo condiviso: ciò che vede uno lo vedono tutti | Ogni schermo è di una persona: ha senso mostrarle il suo personaggio |
| La finestra del tavolo è sempre in primo piano | La scheda di Owlbear è spesso in secondo piano (Discord, D&D Beyond) |
| Build locale o pubblicata, è indifferente | I giocatori caricano solo la build pubblicata: `localhost` è il loro computer |
| Nessuno apre i DevTools sullo schermo del tavolo | Ogni client legge tutti i metadata |
| Il GM dice «tocca a te» guardando il giocatore | Serve un segnale per il giocatore giusto |
| Un client GM | Può capitare un co-GM o una seconda finestra GM |

## 2. Limiti trovati

Gravità: **Alta** cambia l'esperienza o rompe dati; **Media** si nota spesso o
pesa su più client; **Bassa** è un dettaglio o conta poco tra amici. «Oggi»
indica se le opzioni attuali bastano.

### Lo schermo del giocatore

**ON-01 · Alta · La telecamera di ogni giocatore segue il turno.** Con «Segui»
acceso, il default, ogni cambio turno anima la vista di ogni giocatore sul
token attivo, anche ai turni dei nemici. Il valore sta nello stato della scena
(`state.ui.autoFocus`) ed è uno per tutti: la preferenza locale conta solo se
la scena non ne ha uno. Il pulsante è solo del GM.
`src/initiativeList.js:11748` (chiamata prima del controllo GM a `:11752`),
`:4394-4397` (unico filtro: i token nascosti), `:4242` (`animateToBounds`),
`:4250-4258`, `:10696-10710`.
Oggi: si può solo spegnere Segui per tutti, GM compreso.

**ON-02 · Alta · Il giocatore non può tenere chiuso il tracker.** Con
«Apertura tracker → Sincronizza» `sync-open` riapplica lo stato del GM a ogni
cambio dei metadata della stanza, che il GM scrive spesso (per esempio a ogni
modifica dei PF di un PG, `src/hpMemory.js:384`).
`src/sync-open.js:92-95`, `:108-110`.
Oggi: spegnere la sincronizzazione, per tutti; poi ognuno apre il tracker
dall'icona.

**ON-03 · Media · Posizione, vista e scala del tracker sono del GM.** Con «Vista
e posizione del tracker → Sincronizza» ogni spostamento del giocatore viene
sovrascritto al prossimo evento della stanza. La posizione è in proporzione allo
schermo del GM, e i margini nati in pixel per l'interfaccia di Owlbear (alto 52,
destra 96) si riducono sugli schermi piccoli. La scala è una sola per tutti,
pensata per il tavolo letto a distanza.
`src/trackerPlacementCore.js:4-6`, `:72-97`; `src/sync-open.js:79-90`;
`src/trackerScaleCore.js:39-41`.
Oggi: spegnere la sincronizzazione e lasciare la scala al 100%. La larghezza
della barra compatta è già locale.

**ON-04 · Media · Gli avvisi arrivano a tutti, uguali per tutti.** Avviso di
turno («Turno di X · A seguire Y»), promemoria dei TS e delle zone con CD e
caster, avviso di velocità, TS contro la morte (380×300, resta aperto finché il
GM registra). Larghezza fissa, in alto al centro, non seguono la scala.
`src/initiativeList.js:6358-6367` (invio ALL), `src/turnNoticeHost.js:119-153`,
`src/options/reminderProjectionBroadcast.js:57-89`,
`src/deathSaveNoticeHost.js:28-71`, `src/speedCheck.js:200-215`.
Oggi: «Promemoria per i giocatori» in Sintesi o Solo avviso, avviso di turno e
TS contro la morte spegnibili. Sempre per tutti.

**ON-05 · Media · Con la scheda di Owlbear in secondo piano l'avviso si perde.**
L'host aspetta la pagina dell'avviso 1,8 s e poi rinuncia; in una scheda nascosta
i timer rallentano e la pagina non risponde in tempo. Non c'è nessun segnale nel
titolo della scheda.
`src/turnNoticeHost.js:27`, `:60-90`.
Oggi: tenere la finestra visibile durante il combattimento.

**ON-06 · Bassa · Le etichette espanse sulla mappa seguono la selezione del GM.**
Con `uiSync.effectsDisplayMode: "selected"` il giocatore vede espanse le
etichette dei token selezionati dal GM; la sua selezione viene ignorata.
`src/effectsReconciler.js:141-159`, `:246`.

### Chi gioca chi

**ON-07 · Alta (abilita il resto) · Il plugin non sa quale giocatore controlla
quale PG.** Nel codice non ci sono `OBR.party`, `createdUserId`, `OBR.player.id`
né i permessi della stanza (verificato con grep su `src/`). Per questo non può
dire «tocca a te», filtrare gli avvisi «solo i miei» o limitare la scheda al
proprio personaggio. Owlbear ha già tutto il necessario: `createdUserId` è il
proprietario del token, il GM lo assegna dal menu **Owner** quando è acceso il
permesso **Owner Only**, e `OBR.player.id` è lo stesso utente anche se rientra.

### Cosa può fare il giocatore

**ON-08 · Media (scelta di progetto) · Il giocatore non può fare nulla.** Turno,
PF, iniziativa, reazione, TS contro la morte, esiti dei promemoria: tutto è del
GM (`docs/RIFERIMENTO_FUNZIONI.md`, matrice GM/player). Restano: aprire la scheda
di qualsiasi PG o alleato in sola lettura, selezionare un token dalla card,
«Imposta quota…» su qualsiasi PG, Distanza 3D, i clock visibili. Online il GM fa
tutto a voce come al tavolo: funziona, ma il suo carico cresce.

**ON-09 · Bassa (difetto) · Nella scheda aperta da un giocatore le azioni rapide
sembrano cliccabili.** Il comando parte verso un coordinatore che esiste solo sul
GM: dopo due attese da 8 s compare «Applicazione non riuscita», oppure si apre
un pannello del GM sul client del giocatore.
`src/initiative-card-modal.js:915`, `:974-978`; `src/effectsMutations.js:559`,
`:617`, `:4364-4371`.

**ON-10 · Bassa · L'avviso di concentrazione parte per tutti ma il tracker del
giocatore lo scarta.** Il giocatore del concentratore non lo vede.
`src/concentrationSaveReminder.js:81-96`; `src/initiativeList.js:6319`.

### Robustezza con più client (vale anche al tavolo)

**ON-11 · Alta · I tracker dei giocatori scrivono sui token.** Tre percorsi
girano su ogni tracker aperto, senza controllo di ruolo:
- reset delle azioni leggendarie a ogni turno del boss
  (`src/initiativeList.js:7543-7566`, chiamato a `:11743`, prima del controllo
  GM a `:11752`);
- rinomina dei token omonimi e del loro testo (`:5687-5759`, `:5633-5684`,
  chiamate a `:11471` e `:11967`);
- iniziativa dei nuovi membri di un gruppo (`:5428-5503`, chiamata a `:11467` e
  `:11965`).

Ogni `updateItems` invia l'intero `metadata` dell'item: un client in ritardo di
un secondo può annullare una scrittura concorrente del GM sullo stesso token. Il
caso tipico è l'inizio del turno del boss, quando il GM fa scadere le
condizioni mentre N client resettano le leggendarie (gara dedotta, non
riprodotta). La build pubblicata (`bcf66027`) riscrive il `meta` del boss a ogni
suo turno anche quando il contatore è già pieno.

**ON-12 · Media · I permessi della stanza sono ignorati.** Con «Owner Only» o
la modifica dei personaggi negata ai giocatori, «Imposta quota…» fallisce con
un messaggio sbagliato («il token è cambiato nel frattempo»,
`src/ctx-elevation.js:31-37`). Un rifiuto durante la rinomina all'avvio può
saltare il primo disegno del tracker del giocatore
(`src/initiativeList.js:11463-11473`, senza try). Dedotto: non so come Owlbear
rifiuta. Conta perché i lotti O3/O4 suggeriscono di usare «Owner Only».

**ON-13 · Media · Il traffico del cambio turno cresce col quadrato dei client.**
A ogni turno ogni giocatore chiede a tutti lo stato della velocità e il tracker
del GM risponde a tutti, una volta per richiesta: con 6 giocatori circa 90
consegne invece di 7, e N+1 broadcast del GM proprio durante il tick, quando
Owlbear già risponde «Too many requests» al coordinatore.
`src/speedCheck.js:231-236`, `:259-266`, `:967-971`;
`src/effectsMutations.js:470-488`.

**ON-14 · Alta se capita · Due client GM non sono gestiti.** Con un co-GM, o il
GM con una seconda finestra e il tracker aperto: nessun lock né elezione, le
durate scendono due volte (ognuno manda i propri tick, con id di pagina diversi),
Cronologia e Annulla si dividono tra due IndexedDB, gli avvisi arrivano doppi.
Il ruolo si legge solo all'avvio: un giocatore promosso GM resta giocatore fino
a quando ricarica.
`docs/ARCH-005-HISTORY-OWNER.md:23-37` (fuori contratto);
`src/initiativeList.js:420`, `:11610-11689`;
`src/historyLocalStoreCore.js:67-71`.
Oggi: un solo client GM.

**ON-15 · Bassa · Chi rientra non rivede l'avviso.** Tracker, barre, aure ed
etichette si ricostruiscono dai metadata; avviso di turno e promemoria no,
perché sono solo broadcast. Chi si riconnette vede la card attiva ma non il suo
«tocca a te» fino al turno dopo.
`src/turnNoticeHost.js:328-356`.

### Rete e prestazioni

**ON-16 · Alta (operativa) · La build online è ferma al 27/10.** Render serve
`bcf66027` (`build-info.json`, costruita il 27/10), mentre `dist/` è a
`eb0dc223` del 30/10: online mancano i lotti del piano fluidità e L1–L28 del
bugfix. Al tavolo si può usare la build locale; online no.

**ON-17 · Bassa · Il costo per client è accettabile.** Dopo ARCH-009 gli eventi
dei metadata di scena pesano al massimo 2,8 KB; il render del tracker del
giocatore ha p50 26 ms; l'avvio pesa circa 0,9 MB compressi per background,
tracker e avviso, con gli asset in cache immutabile. Costi residui: un iframe
nuovo per ogni avviso di turno (circa 0,7 MB di JS da valutare), blur del vetro
e alone animato sempre attivi (GPU sui dispositivi deboli), animazioni Embers su
tutti i client (il webm del Fireball, 2,3 MB, arriva senza intestazioni di
cache).
Misure: `perf-runs/proiettore-turni-fluidita.json` (28/10, build locale, stesso
laptop). Mancano misure con la build pubblicata, un giocatore remoto, hardware
modesto e più giocatori.

### Riservatezza

**ON-18 · Bassa tra amici · I segreti sono nascosti solo dalla UI.** Owlbear
consegna a ogni client tutti gli item, anche quelli nascosti, e tutti i metadata
di scena e di stanza. Con i DevTools o un'altra estensione un giocatore legge:
PF e statblock dei nemici nel `meta` del token (il testo della barra PF contiene
il valore esatto anche quando è nascosto, `src/hpbar-items.js:983-992`), token
nascosti con posizione e nome, risorse dei boss, clock «Solo GM»
(`src/clocks.js:15-46`), nomi e ritratti in `hpMemory`. Non arrivano: Cronologia,
Combat Log, testo originale degli statblock, profili della console Boss,
pacchetti privati.

**ON-19 · Bassa tra amici · Il coordinatore del GM accetta comandi da qualunque
client.** Basta l'identità della scena, che viaggia a tutti dentro gli avvisi di
concentrazione: con i DevTools un giocatore può far scrivere al client del GM PF
e condizioni su qualsiasi token. Componenti verificati, percorso dedotto.
`src/effectsMutationBroker.js:90-95`;
`src/concentrationSaveReminder.js:12-26`, `:73-96`.

## 3. Cosa fare già alla prossima sessione online

Nessuna modifica al codice.

1. **Avvia il deploy su Render** e controlla
   `https://take-initiative.onrender.com/build-info.json`: deve riportare
   `eb0dc223` o un commit successivo (ON-16).
2. **Nella stanza online installa il manifest di produzione**, non quello di
   `npm run dev`.
3. **Opzioni → Vista giocatori → Vista e posizione del tracker:** Sincronizza
   spento. Ogni giocatore mette il tracker dove vuole e il suo browser lo ricorda
   (ON-03).
4. **Dimensione tracker:** 100% (ON-03).
5. **Segui, nella testata del tracker:** spento. Altrimenti ogni turno sposta la
   telecamera di tutti (ON-01). Per mostrare qualcosa a tutti usa **Sync View**
   di Owlbear, nei controlli in basso a destra: un clic porta tutti alla tua
   vista.
6. **Apertura tracker:** se resta su Sincronizza, il tracker compare da solo ai
   giocatori ma non riescono a tenerlo chiuso (ON-02). Spenta, ognuno lo apre
   dall'icona.
7. **Facoltativo:** Promemoria per i giocatori in Sintesi se i TS di tutti fanno
   rumore; Animazioni Embers spente se qualcuno gioca da tablet o da un portatile
   debole.
8. **Un solo client GM**, niente seconda finestra GM con il tracker aperto
   (ON-14).
9. **Ai giocatori:** tenete Owlbear visibile durante il combattimento (ON-05).

Queste opzioni valgono per tutta la stanza: se la stessa stanza serve anche al
tavolo, vanno rimesse ogni volta. È il motivo del profilo (lotto O5).

## 4. Modalità online: perché no, e cosa invece

Una «modalità» sarebbe un interruttore che cambia comportamento in molti punti:
tracker, avvisi, telecamera, scritture. La sconsiglio perché:

- le differenze sono regole su chi vede e chi segue cosa: le opzioni hanno già
  scope di stanza, scena e browser, proiezioni per i giocatori e runtime
  opzionali (`docs/OPTIONS-ARCHITECTURE.md`);
- raddoppierebbe i percorsi fragili (turno attivo, coda di render,
  `sync-open`), con il doppio dei casi da provare;
- i difetti di robustezza (ON-11…ON-14) esistono anche al tavolo: si correggono
  una volta sola, non in una modalità;
- il gioco ibrido (schermo del tavolo e giocatori remoti nella stessa stanza)
  vuole comportamenti diversi per client, non una stanza in un modo solo;
- i default del tavolo devono restare quelli di oggi.

Al suo posto: un **profilo** nelle Opzioni, che imposta in un clic le opzioni di
stanza (quelle di oggi e le nuove dei lotti O2–O4) e torna a «Tavolo» con un
altro clic, più **capacità nuove** che al tavolo restano neutre o spente.

## 5. Lotti proposti

Un lotto per commit, con test, `npm test`, `npm run build` e
`npm run perf:bundle`. Quelli segnati ⚠ toccano aree fragili secondo
`AGENTS.md`: prima della patch ne spiego il rischio e aspetto il via.

### O1 · Correzioni per più client (piccolo, vale anche al tavolo)

- Reset delle leggendarie, rinomina degli omonimi e iniziativa dei gruppi solo
  dal client GM (ON-11, ON-12). ⚠ Il reset sta nel percorso del turno attivo:
  da verificare il caso del tracker del GM chiuso.
- I giocatori non chiedono più lo stato della velocità a ogni turno: il GM lo
  pubblica già al cambio turno, o risponde una volta per turno (ON-13).
- Azioni rapide della scheda disattivate per i giocatori, con il motivo
  (ON-09).
- Il coordinatore del GM accetta solo i comandi del proprio client: i comandi
  legittimi viaggiano già in LOCAL (ON-19).
- Avviso «c'è un secondo GM nella stanza» (da `OBR.party`) e ruolo seguito con
  `OBR.player.onChange` (ON-14). Un'elezione vera può venire dopo, se serve.

### O2 · Lo schermo torna del giocatore ⚠

- Nuova opzione di stanza «La telecamera dei giocatori segue il turno», separata
  dal Segui del GM. Default: sì, come al tavolo (ON-01).
- Nuova opzione di stanza «I giocatori possono chiudere il tracker»: un
  giocatore che lo chiude lo ritrova al prossimo combattimento o quando il GM lo
  riapre, non a ogni evento della stanza. Default: no, come al tavolo (ON-02).
- Con la posizione non sincronizzata, scala del tracker locale per il
  giocatore (ON-03).
- Un piccolo menu «Schermo» nel tracker del giocatore, solo preferenze locali e
  mai più permissive della stanza: Segui (se la stanza lo consente), scala,
  animazioni, e dopo O4 «promemoria: tutti / solo i miei».

### O3 · Assegnazione dei token ai giocatori (D4)

- Il GM dispone tutti i token, anche quelli dei PG, e li assegna dal menu della
  card con «Giocatore ›», come già fa con «Lato del tavolo», scegliendo tra i
  giocatori collegati (`OBR.party`). L'assegnazione vive nel `meta` del token,
  scritta in fusione, e si ritrova tra le scene con il profilo del PG.
- Il giocatore assegnato è anche il proprietario per Owlbear: il plugin prova a
  scrivere `createdUserId`. Così, con il permesso **Owner Only** acceso, il
  giocatore muove solo il proprio token: il blocco lo fa Owlbear, il plugin non
  può impedire un trascinamento. Da verificare in stanza che un'estensione possa
  cambiare `createdUserId`; se Owlbear lo rifiuta, il GM usa il menu Owner di
  Owlbear e il plugin legge quello.
- Il pannello avvisa il GM se Owner Only è spento (`OBR.room.getPermissions`).
- Il GM vede sulla card del PG il colore e il nome del giocatore; il giocatore
  vede il proprio personaggio segnato nel tracker.
- Prima di O3 serve O1: con Owner Only i tracker dei giocatori non devono più
  scrivere sui token degli altri (ON-12).
- Da verificare in stanza: se l'id di un giocatore senza account resta lo stesso
  tra una sessione e l'altra.

### O4 · Avvisi mirati ⚠ (dopo O3)

- «Tocca a te» al giocatore del PG di turno, più visibile dell'avviso normale,
  con il titolo della scheda che lampeggia se è in secondo piano (ON-05);
  «Sei il prossimo» al giocatore dopo. Suono facoltativo, da verificare con le
  regole di autoplay del browser.
- Opzione di stanza: avviso di turno a tutti o solo al giocatore di turno.
- TS contro la morte al giocatore del PG e al GM (e allo schermo del tavolo);
  avviso di concentrazione informativo al giocatore del concentratore (ON-10).
- Preferenza del giocatore «promemoria: tutti / solo i miei».
- Chi rientra chiede l'avviso in corso al GM (ON-15).
- Owlbear non indirizza un broadcast a un solo giocatore: il filtro si fa in
  ricezione, con l'id del giocatore.

### O5 · Profilo «Tavolo / Online»

- In Opzioni → Vista giocatori, un selettore che imposta insieme: posizione
  sincronizzata, scala, telecamera dei giocatori, chiusura del tracker, avvisi
  mirati, Embers. «Tavolo» rimette i valori di oggi; una modifica a mano mostra
  «Personalizzato».
- Niente gioco ibrido (D8): il profilo vale per tutta la stanza.

### O6 · Segnali dei giocatori (facoltativo) ⚠

- «Ho finito il turno» per il giocatore del PG di turno: sul tracker del GM la
  card lo segnala, e il turno lo passa sempre il GM. Così resta suo il momento
  delle azioni leggendarie, che cadono alla fine del turno di un'altra
  creatura.
- Eventuale «Ho usato la reazione» sul proprio PG.
- Niente modifica diretta dei PF da parte dei giocatori: il GM li applica già
  dalle console, e due mani sugli stessi PF producono doppioni.
- Ogni segnale arriva al client del GM, che esegue lo stesso comando del GM
  (stessa voce di Cronologia, «richiesto da …» nel Combat Log) solo se il turno
  è ancora quello. Ogni segnale si accende dalla stanza, spento per default.

### O7 · Dadi dentro il plugin (D7, progetto a sé)

Obiettivo dell'utente: togliere i conflitti tra la Dice di Owlbear e Take
Initiative, portando i dadi nel plugin. Niente automazione dei tiri per ora: i
risultati non entrano in PF, iniziativa o TS.

- Il conflitto noto: Owlbear tiene aperta una sola action, quindi il pulsante
  del plugin chiude Dice e viceversa; in più i due pannelli si sovrappongono.
  Dadi in un popover del plugin non hanno questo limite.
- **Licenza:** la Dice ufficiale è GPL-3.0 (`LICENSE` e `package.json` del
  repository), Take Initiative è ISC. Copiarne il codice obbliga a pubblicare
  tutto il plugin in GPL-3.0. L'alternativa è un'implementazione nostra che ne
  riprende il comportamento, non il codice.
- **Peso:** la Dice è React, three.js, react-three-fiber, Rapier e MUI; il plugin
  è JavaScript senza framework. Un porting letterale aggiunge megabyte a ogni
  client. Un lanciatore nostro può partire in 2D (notazione, vantaggio e
  svantaggio, tiro nascosto al GM, registro condiviso) e aggiungere il 3D dopo,
  se serve.
- Serve un piano dedicato, con le sue decisioni, prima di scrivere codice.

### O8 · Misura online (nessun codice)

Dopo il deploy: build pubblicata, un giocatore remoto e un dispositivo modesto,
con `__tbpPerf` su entrambi i client. Serve a decidere con i numeri su iframe
dell'avviso, blur ed Embers (ON-17).

**Ordine consigliato:** deploy → O1 → O8 → O2 → O3 → O4 → O5; O7 con il suo
piano; O6 se confermato.

## 6. Cosa sconsiglio

- Una modalità online come ramo separato del codice (sezione 4).
- Giocatori che scrivono direttamente i metadata dei token: permessi, gare,
  Cronologia e Annulla scavalcati. Le richieste passano sempre dal client del GM.
- Nascondere i segreti ai DevTools spostando i dati fuori dai token: un
  rifacimento enorme per un rischio che tra amici è minimo.
- I dadi come fonte automatica, senza conferma del GM.
- La console attacchi in mano ai giocatori: è il passo naturale dopo O3 e O6, ma
  è un progetto a sé e toglie al GM il controllo dei bersagli e degli esiti.
- Cambiare i default del tavolo.

## 7. Decisioni

| # | Decisione | Consiglio |
| --- | --- | --- |
| D1 | Profilo «Tavolo / Online» nelle Opzioni, oppure stanze separate per tavolo e online | Profilo |
| D2 | Telecamera dei giocatori online: non segue, segue come al tavolo, la sceglie ogni giocatore | Non segue, con la scelta locale del giocatore |
| D3 | Tracker online: il giocatore può chiuderlo fino al prossimo combattimento, oppure resta imposto | Può chiuderlo |
| D4 | Chi gioca chi: proprietario di Owlbear con correzione dal menu della card, solo campo del plugin, solo proprietario di Owlbear | Proprietario con correzione |
| D5 | Avviso di turno online: a tutti con «tocca a te» per il giocatore di turno, oppure solo al giocatore di turno | A tutti, con «tocca a te» |
| D6 | Segnali dei giocatori: nessuno, solo «Ho finito il turno», anche la reazione | Solo «Ho finito il turno», dopo O1–O5 |
| D7 | Tiri dalla Dice: no per ora, oppure sperimentale | Sperimentale, dopo O3 |
| D8 | Gioco ibrido (tavolo e remoti insieme): serve? | Solo se lo fate davvero |

### Risposte dell'utente (30/10)

- **D1** approvata: profilo «Tavolo / Online».
- **D2** approvata: online la telecamera dei giocatori non segue; ognuno può
  riaccenderla per sé.
- **D3** approvata: il giocatore può chiudere il tracker.
- **D4** un vero sistema di assegnazione: il GM dispone tutti i token e li
  assegna; il giocatore muove solo il proprio (lotto O3).
- **D5** avviso di turno a tutti.
- **D6** il turno lo passa sempre il GM.
- **D7** invece della lettura dei tiri: dadi nativi nel plugin, porting della
  Dice, senza automazione per ora (lotto O7).
- **D8** nessun gioco ibrido.

Chiarimenti dello stesso giorno:

- **D5** il giocatore di turno riceve un avviso più evidente degli altri
  («Tocca a te»).
- **D6** «Ho finito il turno» resta, come opzione della stanza spenta per
  default (lotto O6).
- **D7** scelta lasciata a me: un lanciatore scritto da noi, che riprende il
  comportamento della Dice senza il suo codice. Il plugin resta ISC, non entrano
  React, three.js né Rapier, e i dadi vivono in un popover del plugin, senza il
  conflitto della action unica. Primo passo in 2D (notazione, vantaggio e
  svantaggio, tiro nascosto al GM, registro condiviso, tiri dalla card);
  animazione 3D eventuale dopo, misurata sul bundle. Il piano dedicato precede il
  codice.

## 8. Metodo e fonti

- Codice letto il 30/10 su `main` (`2af85329`). Ogni rilievo cita file e righe;
  «dedotto» indica un comportamento ricavato dal codice e non riprodotto in
  stanza.
- Misure: `perf-runs/proiettore-*.json` del 28/10, build locale, GM e tavolo
  sullo stesso laptop.
- Owlbear Rodeo:
  - [Player API](https://docs.owlbear.rodeo/extensions/apis/player/): `id` è
    l'utente ed è lo stesso se rientra; `getConnectionId` è unico per ingresso;
  - [Broadcast](https://docs.owlbear.rodeo/extensions/apis/broadcast/):
    destinazioni REMOTE, LOCAL, ALL; dati entro 16 KB; l'evento porta il
    `connectionId` di chi invia;
  - [Room](https://docs.owlbear.rodeo/extensions/apis/room/): metadata della
    stanza entro 16 kB; permessi leggibili con `getPermissions`;
  - [Item](https://docs.owlbear.rodeo/extensions/reference/items/item/):
    `createdUserId` è l'utente che ha creato l'item;
  - [Permissions](https://docs.owlbear.rodeo/docs/permissions/): con Owner Only
    il giocatore muove solo i propri personaggi, e il GM assegna il proprietario
    dal menu Owner;
  - [Casting](https://docs.owlbear.rodeo/docs/casting/): Sync View porta tutti
    i giocatori alla vista del GM, una volta o in continuo.
- Dice ufficiale: `src/plugin/DiceRollSync.tsx` e `src/plugin/getPluginId.ts`
  nel repository [owlbear-rodeo/dice](https://github.com/owlbear-rodeo/dice).

## 9. Stato dei lotti (30/10/2026)

Tutto su `main`, non pushato e non ancora nel bundle di produzione. Ogni
comportamento nuovo vale solo con «Modalità di gioco: Online»; con «Tavolo»,
il default, il codice percorre la strada di prima.

| Lotto | Commit | Cosa c'è |
| --- | --- | --- |
| O1 | `066a831e` | Scritture sui token solo dal GM (leggendarie, omonimi, gruppi); velocità senza richieste a ogni turno; azioni rapide della scheda spente per i giocatori; avviso di un secondo client GM. |
| O2a | `43c63c19` | Opzione di stanza «Modalità di gioco»; in Online telecamera del giocatore libera e tracker che il giocatore può chiudere. |
| O2b | `10b07c1e`, `992b7140` | Menu ⚙ «Schermo» del giocatore: Segui, dimensione, animazioni. |
| O3 | `a5caf477`, `a6d33cf8` | «Giocatore ›» nel menu della card, proprietario Owlbear, memoria nella stanza (`…/playerAssignments`, 390 byte) riapplicata dal background del GM. Serve anche il permesso Character → Update. |
| O4a | `67acf71e`, `babf8175`, `5bdc926a` | «Tocca a te» (anello e glow interno bianchi, timer) e «Tu» in «A seguire»; segni neutri bianchi sulle card. |
| O4b | `d80557e0` | Giocatori dei bersagli nei promemoria; TS contro la morte solo al giocatore del PG; «Promemoria: solo i miei»; avviso recuperato da chi entra a combattimento in corso. |
| O5 | `8f073bc1` | In Online posizione del tracker non sincronizzata e scala di partenza 100%; carte del tavolo spente nel pannello. |

Restano:
- avviso di concentrazione al giocatore che si concentra, insieme a ON-19
  (il coordinatore che accetta solo i propri comandi);
- O6 «Ho finito il turno» (opzione spenta per default), O7 dadi nel plugin
  (piano dedicato), O8 misura online;
- incoerenze segnalate dall'utente tra assegnazione, scheda e reload: casi da
  raccogliere;
- persistenza tra scene già fatta; la prova in stanza di O4b e O5;
- bundle di produzione: aggiungere `dist/player-screen.html` con `git add -f`.
