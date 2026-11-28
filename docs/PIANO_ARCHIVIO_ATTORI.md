# Piano: l'archivio degli attori

28 novembre 2026. Solo piano: nessun codice è cambiato.

Segue [STUDIO_ARCHIVIO_ATTORI.md](STUDIO_ARCHIVIO_ATTORI.md). Le decisioni D1–D6 di quello studio sono prese:
la casa dei dati è un archivio online su un server dell'utente, raggiungibile dai suoi due computer; nel
browser resta una copia di lavoro. R0 e R1 sono fatti. La prova di raggiungibilità del server è passata.

## In breve

Oggi un personaggio ha tante copie alla pari. Il piano gli dà una casa sola e tre regole:

1. **Tra le scene comanda l'archivio.** All'apertura di una scena i token prendono dall'archivio scheda, PF e
   stato di gioco.
2. **Dentro la scena comanda il token**, come oggi. Ogni cambio sul token viene copiato nell'archivio.
3. **Tra i due computer comanda il server.** Ogni computer lavora sulla sua copia e la allinea al server.

Le regole 1 e 2 sono quelle che già valgono per i PF (`actorVitalsStore.js`) e, da R1, per le schede. Il piano
le estende allo stato di gioco e sposta i dati dalla stanza e dal `localStorage` all'archivio.

## Cosa contiene

Una voce per attore, trovata con `actorProfileId`, dentro una stanza (una stanza è una campagna).
Ogni voce ha tre sezioni, ognuna con il suo numero di revisione:

| Sezione | Contenuto | Quanto spesso cambia |
| --- | --- | --- |
| Scheda | il profilo di oggi: CA, tiri salvezza, classi, talenti, incantesimi, azioni rapide, forme | di rado |
| PF | PF e PF massimi di base, come li tiene oggi `actorVitals` | a ogni colpo |
| Stato | slot e risorse di classe e dei talenti, PF temporanei, tiri salvezza contro la morte (D3) | a ogni turno |

Le sezioni separate servono a due cose: una scrittura dei PF non riscrive la scheda, e un conflitto su una
sezione non tocca le altre.

A parte stanno le **schede senza identità**: gli statblock dei mostri (D5) e le schede mai collegate a un attore,
trovate per chiave (nome o immagine) come oggi. Un mostro non è un attore: i suoi
omonimi condividono lo statblock, mai i PF.

Restano sul token e non entrano nell'archivio: pill, concentrazione, incantesimi attivi, capacità accese come
l'Ira, iniziativa, quota. I PF temporanei arrivano nella scena dopo senza la pill che li aveva dati.

## Dove sta

| Posto | Cosa tiene | Chi lo usa |
| --- | --- | --- |
| **Server** | l'archivio di ogni stanza, con le revisioni | i due computer del GM |
| **Browser del GM** (IndexedDB) | una copia di lavoro dell'archivio e la coda delle scritture non ancora inviate | tutte le pagine del plugin, in lettura e scrittura |
| **Token** | scheda, PF e stato della creatura in quella scena | tracker, console, giocatori |
| **Stanza** | la copia compressa delle schede del gruppo (D4), come oggi | un computer senza server raggiungibile; i giocatori, come ripiego |

IndexedDB è già usato per Cronologia e journal (ARCH-009). Una scrittura è una transazione: due pagine che
scrivono insieme non si cancellano a vicenda, e questo toglie il difetto P3 senza un processo in più.

## Come si allineano

**Token e archivio.** Lo fa lo sfondo del GM.

- Scena aperta: prima scarica le novità dal server, poi confronta ogni token collegato con l'archivio. Scheda:
  il token ricorda la revisione da cui è stato scritto, e se l'archivio è più avanti lo riallinea (è R1b, con
  la revisione al posto dell'orologio). PF e stato: vale l'archivio, una volta per token e per scena, come
  oggi per i PF.
- Durante la scena: ogni cambio di PF o di stato sul token va nell'archivio. Un salvataggio dalla scheda scrive
  archivio e token.

**Browser e server.**

- Ogni scrittura va subito nella copia di lavoro e in coda. La coda parte subito per la scheda e dopo due
  secondi di quiete per PF e stato, così un combattimento non manda una richiesta a ogni colpo.
- Il browser manda la revisione da cui è partito. Se il server ne ha una più nuova, rifiuta e restituisce la
  sua.
- Le novità si scaricano all'avvio, a ogni scena aperta e quando la finestra torna in primo piano.

**Conflitti.** Possono nascere solo da scritture rimaste in coda su un computer mentre l'altro cambiava la
stessa sezione dello stesso personaggio. Il GM è uno solo, quindi è raro. Proposta: vale il server, la scrittura
in coda si scarta e il GM riceve un avviso con il nome del personaggio e la sezione.

**Server giù.** Il plugin lavora sulla copia di lavoro e tiene le scritture in coda. Il GM lo vede nelle
Opzioni e riceve un avviso una volta per sessione.

## Il server

- Un solo script, senza database: un file per stanza in una cartella fuori da quella pubblicata, scritto con
  rinomina atomica e con un blocco durante la scrittura.
- Tre chiamate: leggi le voci cambiate dopo un certo punto, scrivi una sezione, cancella una voce.
- Una chiave lunga nell'intestazione di ogni richiesta. Sta in un file fuori dalla cartella pubblicata e,
  nel browser, nel `localStorage` di ogni computer. Mai nei metadata della stanza, mai nel repository.
- Origini ammesse: solo il plugin. Limiti di dimensione per richiesta e per stanza.
- I giocatori non lo chiamano mai: leggono dai token.

Su questo computer non c'è PHP: lo script si prova sul server, con un programma del repository che fa le
chiamate vere e controlla le risposte.

## I lotti

Ogni lotto si prova da solo e lascia il plugin funzionante. Fino ad A3 i dati stanno dove stanno oggi.

| Lotto | Cosa | Tocca | Rischio |
| --- | --- | --- | --- |
| **A0** | L'archivio di lavoro in IndexedDB e la sua interfaccia. Nessuno lo usa ancora | file nuovi | basso |
| **A1** | Le schede leggono e scrivono l'archivio di lavoro invece di `…/initiativeCards/local`. Il vecchio `localStorage` si legge una volta, per portare dentro ciò che c'è. Statblock dei mostri compresi. La stanza si scrive come oggi | `initiativeCards.js` | medio-alto: passa di qui ogni lettura e scrittura di scheda |
| **A2** | Lo script del server e il programma che lo prova | file nuovi, fuori dal plugin | medio: è esposto a Internet |
| **A3** | Sincronizzazione delle schede con il server. In Opzioni: indirizzo, chiave, stato, «Prova il collegamento» | file nuovi, Opzioni, sfondo | medio |
| **A4** | I PF passano dall'archivio: `actorVitals` usa l'archivio al posto del suo `localStorage` | `actorVitalsStore.js` | alto: è la sincronizzazione dei PF |
| **A5** | Lo stato di gioco (D3): token → archivio durante la scena, archivio → token all'apertura | sfondo, `classFeatureState`, PF temporanei, tiri salvezza contro la morte | alto: scritture sui token all'apertura della scena |
| **A6** | Esporta e importa l'archivio su file. Avvisi: server non raggiungibile, scritture in coda, conflitto | Opzioni | basso |
| **A7** | Pulizia: via le vecchie copie locali; la stanza tiene solo le schede del gruppo, e il loro budget cresce | budget della stanza, `hpMemory` solo per i token mai collegati | medio |

Dopo A3 le schede sono le stesse sui due computer. Dopo A5 slot, risorse e PF temporanei seguono il
personaggio da una scena all'altra.

**Interruttore.** Come per ARCH-009, l'archivio si accende e si spegne per browser finché non è provato in
stanza. Spento, il plugin usa le strade di oggi.

**AGENTS.md.** A1, A4 e A5 toccano la riconciliazione dei metadata, e A4 e A5 stanno sulla sincronizzazione
dei PF. Per ognuno, prima di scrivere codice: funzioni esatte, patch prevista e rischi. `initiativeList.js` non
entra nel piano.

## Decisioni

| # | Domanda | Proposta |
| --- | --- | --- |
| E1 | L'archivio è per stanza: una stanza, una campagna | **sì**. Un PG portato in un'altra stanza passa dal file (A6) |
| E2 | Dentro la scena comanda il token, tra le scene l'archivio | **sì**: è la regola di oggi per i PF, e AGENTS.md la chiede |
| E3 | Tre sezioni con revisioni separate: scheda, PF, stato | **sì** |
| E4 | In un conflitto vale il server; la scrittura in coda si scarta con un avviso | **sì**. Niente schermata di confronto: il caso è raro |
| E5 | Lo script del server sta nel repository, senza chiave e senza indirizzo | **sì**, in una cartella sua |
| E6 | PF e stato partono verso il server dopo due secondi di quiete | **sì** |
| E7 | Ordine: prima le schede fino al server (A0–A3), poi PF e stato (A4, A5) | **sì**: il collegamento si prova sui dati più semplici, e le schede sono il primo guaio segnalato |
| E8 | Alla fine la stanza tiene solo le schede del gruppo; le copie di PF nella stanza si tolgono | **sì**, in A7, dopo la prova in stanza di A4 |
| E9 | Un interruttore per browser finché non è provato | **sì** |

**Esito (28 novembre 2026).** L'utente ha approvato E1–E9 come proposte.

## Cosa non so ancora

- **Il peso dello stato di gioco** per personaggio: da misurare all'inizio di A5.
- **Gli eventi dello stato di gioco.** Lo sfondo oggi ascolta i cambi dei PF. Per risorse, PF temporanei e
  tiri salvezza contro la morte va visto se il canale degli eventi li distingue già o va esteso.
- **Il ritorno dal router in IPv4** e la build locale: non provati nella prova di raggiungibilità.
- **La revisione sul token.** Va deciso in A1 come il token ricorda da quale revisione è stato scritto senza
  cambiare forma alle schede che ci sono già.

## Esito di A0 (28 novembre 2026)

Due file nuovi, che nessuna parte del plugin usa ancora:

- `src/actorArchiveCore.js`, puro: la voce con le sue sezioni e revisioni.
  - `withLocalActorArchiveSection`: una scrittura di questa copia; tocca solo la sua sezione e la mette in coda.
    Lo stesso valore scritto di nuovo non cambia niente.
  - `withServerActorArchiveSection`: ciò che arriva dal server. Una revisione più nuova vale, anche su una
    scrittura in coda (E4), e in quel caso segnala il conflitto.
  - `withAcknowledgedActorArchiveSection`: il server ha accettato; la sezione esce dalla coda solo se nel
    frattempo non è stata riscritta.
  - `pendingActorArchiveSections`: la coda. Non c'è un archivio a parte per le scritture da inviare: sono le
    sezioni segnate `dirty`.
- `src/actorArchiveStore.js`: la copia di lavoro in IndexedDB, database `….actor-archive`, un indice per stanza.
  Ogni scrittura è una transazione che legge la voce, la cambia e la riscrive. L'interruttore
  (`actorArchiveEnabled`, E9) parte spento.

**Test:** sette in `test/actorArchive.test.js`. Suite completa verde, 6.648 test; build riuscita in una cartella
temporanea.

**Cosa i test non provano:**

- Due pagine diverse che scrivono insieme. Lì conta la garanzia di IndexedDB, che esegue una dopo l'altra le
  transazioni di scrittura sullo stesso archivio. Il finto IndexedDB dei test non la riproduce: va provato nel
  browser vero con A1.
- Il browser vero in generale: A0 è provato solo con il finto IndexedDB.

Alla prima corsa della suite quattro test di `test/embersMatchedVisualSceneEpoch.test.js` sono falliti; da soli
e alla seconda corsa passano. Dipendono dai tempi e non toccano questi file.

## A1: la patch prevista

Scritta prima del codice, come chiede AGENTS.md. L'utente ha detto di procedere: l'esito è più sotto.

### Dove passa oggi la copia locale

Solo in `src/initiativeCards.js`, in due funzioni. Tutto il resto del plugin passa da loro.

| Funzione | Cosa fa con la copia locale |
| --- | --- |
| `readInitiativeCardRegistry` | legge il `localStorage` e lo unisce al registro della stanza |
| `updateRoomCards` | legge il `localStorage`, applica la modifica, riscrive **tutto** il `localStorage`, poi scrive la stanza |

Il registro è una mappa da chiave (`asset:<immagine>` o nome) a voce. Ricerca, unione, alias e codifica per la
stanza lavorano su quella mappa, e A1 non li tocca.

### Cosa cambia

Con l'interruttore acceso, quelle due funzioni usano l'archivio di lavoro della stanza. Spento, non cambia
niente.

- **Lettura.** Il registro diventa l'unione di tre fonti: il vecchio `localStorage`, l'archivio di questa
  stanza e il registro della stanza. Vince la voce più recente, come oggi.
- **Scrittura.** Vanno nell'archivio solo le voci che la scrittura ha cambiato, più quelle che la stanza ha già
  e l'archivio no. È la regola del 7 novembre per la stanza (D1): l'archivio di una stanza contiene le schede
  usate in quella stanza, non quelle di altre campagne.
- **La stanza** si scrive come oggi, con lo stesso budget e lo stesso avviso.

Un file nuovo, `src/initiativeCardArchiveCore.js`, puro, traduce tra il registro e le voci dell'archivio:

| Voce del registro | Voce dell'archivio |
| --- | --- |
| con `actorProfileId` | una voce per attore: la scheda più recente e l'elenco delle sue chiavi |
| senza identità (statblock di un mostro, scheda mai collegata) | una voce per chiave, come oggi |

Per questo il secondo tipo di voce di A0 cambia nome: da «statblock» a «scheda per chiave». A0 non è ancora
committato.

### Due scelte prudenti

- **Il vecchio `localStorage` resta in lettura e, per ora, anche in scrittura.** Finché l'archivio è in prova
  si scrivono tutti e due. Così spegnere l'interruttore non fa perdere niente. La scrittura doppia si toglie
  in A7.
- **Niente import in blocco.** Il vecchio `localStorage` contiene le schede di tutte le stanze e non dice di
  quale sono. Una scheda entra nell'archivio di una stanza quando viene usata lì.

### Cosa A1 toglie e cosa no

- **Toglie P3 per la copia locale:** due pagine che salvano due personaggi diversi scrivono due voci diverse,
  ognuna nella sua transazione. Oggi la seconda riscrive tutto il registro e cancella la prima.
- **Toglie P8 per le schede:** niente più tetto del `localStorage`, e una scrittura fallita dà un avviso al GM.
- **Non toglie P3 per la stanza:** la chiave della stanza si scrive ancora intera. Conta meno, perché la stanza
  diventa un ponte.
- **Due pagine sullo stesso personaggio:** vale ancora l'ultima scrittura.

### Rimandato

Il segno della revisione sul token passa ad A3. Senza server le revisioni sono tutte a zero, e l'ordine resta
quello di oggi, per data.

### Rischi

| Rischio | Come lo tengo |
| --- | --- |
| Ogni lettura e scrittura di scheda passa da qui | l'interruttore parte spento: il percorso di oggi resta intatto finché non lo accendi |
| Cicli tra token, archivio e stanza | A1 non aggiunge scritture sui token né sulla stanza; cambia solo dove sta la copia locale |
| IndexedDB non disponibile o bloccato | si ricade sul `localStorage`, con un avviso |
| Lettura più lenta: una richiesta a IndexedDB a ogni lettura del registro | misuro al banco; le letture sono all'apertura di una scheda e all'ingresso in iniziativa, non a ogni colpo |
| I giocatori | il loro browser ha l'interruttore spento e legge dai token, come oggi |

PF, turni, ordine d'iniziativa e barre sulla mappa non sono toccati. `initiativeList.js` non è toccato.

### Test

- il traduttore, puro: registro → voci e ritorno, chiavi che passano da una voce per chiave a una per attore;
- nell'impalcatura dei test di salvataggio, con l'interruttore acceso e il finto IndexedDB:
  - un salvataggio scrive la voce dell'attore e il vecchio `localStorage`;
  - una scheda di un'altra stanza si legge dal vecchio `localStorage` ma entra nell'archivio solo se usata;
  - due pagine che salvano due personaggi non si cancellano;
  - con l'interruttore spento l'archivio non viene nemmeno aperto;
- tutti i test di oggi verdi a interruttore spento.

### Come si prova in stanza

L'interruttore si accende dalla console del browser, nel contesto `background.html`. Un comando in Opzioni
arriva con A3.

## Esito di A1 (28 novembre 2026)

Fatto come previsto sopra. Non committato: l'utente vuole un commit solo alla fine dell'implementazione.

- `src/initiativeCardArchiveCore.js`, nuovo e puro: `initiativeCardRegistryFromArchive` e
  `initiativeCardArchiveWrites`.
- `src/initiativeCards.js`: `readInitiativeCardRegistry` unisce anche l'archivio della stanza;
  `updateRoomCards` scrive nell'archivio le voci cambiate e quelle che la stanza ha e l'archivio no. Con
  l'interruttore spento le due funzioni fanno ciò che facevano.
- `src/actorArchiveCore.js`: il secondo tipo di voce ora è `card-key`, una scheda senza identità trovata per
  chiave. Gli id arrivano a 1.024 caratteri, perché una chiave può essere l'indirizzo di un'immagine.
- Una voce di attore tiene la scheda scritta per ultima e fino a dodici chiavi, le più recenti per prime.
- Togliere un personaggio dalla stanza dal pannello «Giocatori» non lo toglie dall'archivio, come oggi non lo
  toglie dalla copia locale.
- Se l'archivio non si legge o non si scrive, vale la copia di prima e il GM riceve un avviso, una volta per
  pagina.

**Test:** cinque del traduttore in `test/initiativeCardArchiveCore.test.js` e cinque d'integrazione («A1») in
`test/initiativeCardSaveTransportRegression.test.js`. Suite completa verde, 6.658 test; build riuscita in una
cartella temporanea.

**Nel browser vero**, con il server di sviluppo e l'IndexedDB di Chrome:

- due connessioni che scrivono insieme tre sezioni dello stesso attore: restano tutte e tre;
- due connessioni che incrementano lo stesso contatore cinquanta volte ciascuna: il contatore arriva a 100.
  È la garanzia su cui poggia il piano, e il finto IndexedDB dei test non la riproduce;
- elenco per stanza, coda, una chiave di 600 caratteri, cancellazione.

**Non provato:** A1 dentro Owlbear, con le pagine vere del plugin. La misura della lettura al banco non è
stata fatta.

### Prova in stanza di A1

1. Nella console, contesto `background.html`:
   `localStorage.setItem("com.thebigpicture.initiative/actor-archive", "1")`, poi ricarica la pagina di Owlbear.
2. Apri e salva la scheda di due PG. Non deve comparire l'avviso «Archivio delle schede non disponibile».
3. Apri una scena con un token di uno dei due preparato prima: la scheda è quella nuova (R1b, ora anche
   dall'archivio).
4. Per vedere l'archivio, nella stessa console:
   `indexedDB.open("com.thebigpicture.initiative.actor-archive").onsuccess = (e) => e.target.result.transaction("records").objectStore("records").getAll().onsuccess = (r) => console.log(JSON.stringify(r.target.result.map((v) => [v.kind, v.name, Object.keys(v.sections)])))`
   Deve elencare i due PG come `actor`.
5. Per spegnere: `localStorage.removeItem("com.thebigpicture.initiative/actor-archive")` e ricarica. Le schede
   restano quelle di prima, perché la vecchia copia è stata scritta lo stesso.

## La prova in stanza di A1 (28 novembre 2026)

L'utente ha acceso l'interruttore e ha salvato delle schede con la build locale. Nel log della console non c'è
l'avviso «archivio di lavoro», quindi l'archivio non ha dato errori. Il contenuto dell'archivio non è stato
ancora letto (passo 4 della prova).

Il log mostra invece la stanza al limite: 14.480 byte su 14.500. Alle schede sono stati chiesti 3.136 byte e ne
sono stati scritti 2.456: una parte delle schede è già fuori dalla stanza. È il caso per cui l'archivio esiste.

## Esito di A2 (28 novembre 2026)

Il protocollo, in breve. Un solo indirizzo, la stanza nella query, la chiave nell'intestazione `X-TI-Key`.

| Chiamata | Risposta |
| --- | --- |
| `GET ?ping=1` | il saluto, con il numero del protocollo |
| `GET ?room=R&since=N` | le voci scritte dopo il punto N, dalla più vecchia, e il contatore della stanza |
| `PUT ?room=R` con una sezione e la revisione di partenza | 200 con la nuova revisione, oppure 409 con la sezione del server |
| `DELETE ?room=prova-…` | cancella una stanza di prova, e solo quella |

Due scelte fatte scrivendolo:

- **Il valore viaggia come testo JSON** e il server lo conserva com'è, senza leggerlo. In PHP un oggetto vuoto
  riletto e riscritto torna come lista vuota: il plugin vedrebbe un valore diverso dal suo e segnalerebbe un
  conflitto falso.
- **Una scrittura rimandata non conta due volte.** Se la risposta si perde e il plugin rimanda la stessa
  scrittura, il server risponde con la revisione che le aveva già dato.

Il protocollo non cancella voci: una sezione svuotata si scrive con valore nullo.

File:

- `server/archive/archivio.php`: lo script. Nessuna chiave e nessun indirizzo: stanno in un file di
  configurazione fuori dalla cartella pubblicata, il cui percorso si scrive nella copia installata.
- `server/archive/config.esempio.php` e `server/archive/LEGGIMI.md`: configurazione d'esempio e installazione.
- `test-support/archiveServerReference.js`: lo stesso server in JavaScript, in memoria. Serve ai test e sarà il
  server dei test di A3.
- `scripts/archiveServerCheckCore.mjs` e `scripts/check-archive-server.mjs`: quindici controlli da lanciare
  contro il server vero. Lavorano in una stanza `prova-…` e la cancellano.

**Test:** quattro in `test/archiveServerCheck.test.js`. Il riferimento passa i quindici controlli; i controlli
scoprono un server che ignora la revisione, che perde gli oggetti vuoti o che accetta ogni chiave; lo script PHP
dichiara gli stessi limiti e le stesse sezioni. Suite completa verde, 6.662 test. Il programma è stato provato
anche contro un server HTTP vero in locale: esito giusto, chiave sbagliata, server spento.

**Sul server vero (28 novembre 2026).** Lo script è installato sul server dell'utente e passa tutti e quindici
i controlli, cancellazione della stanza di prova compresa, senza correzioni. Il controllo con le date in
millisecondi passa: il PHP del server lavora con interi a 64 bit. A2 è chiuso.

Cosa ha insegnato l'installazione, riportato in `server/archive/LEGGIMI.md`:

- a PHP serve un profilo che possa leggere sia la cartella dello script sia quella dei dati (`open_basedir`);
- `config.php` va salvato senza BOM: un BOM in testa a un file incluso esce prima delle intestazioni e le rompe.

## A3: la patch prevista

Scritta prima del codice. L'utente ha detto di procedere.

### I pezzi

| Pezzo | File | Cosa fa |
| --- | --- | --- |
| Configurazione | `src/actorArchiveConfig.js`, nuovo | indirizzo e chiave del server nel `localStorage` di questo browser; solo `https`, chiave di almeno 32 caratteri |
| Motore | `src/actorArchiveSync.js`, nuovo | scarica le novità dal punto dell'ultima volta, poi invia le sezioni in coda; non sa niente di Owlbear |
| Servizio | `src/actorArchiveSyncRuntime.js`, nuovo | nello sfondo del GM decide quando sincronizzare e avvisa il GM |
| Pannello | `src/actorArchivePanel.js` e una sezione in `options-modal.html` | interruttore, indirizzo, chiave, «Salva e prova», stato |
| Aggancio | `src/background.js`, `src/initiativeCards.js` | lo sfondo monta il servizio; una scrittura di scheda lo avvisa che c'è da inviare |

Il pannello è fuori dallo schema delle opzioni e dal suo «Salva», come il pannello «Giocatori»: scrive subito, in
questo browser.

### Quando sincronizza

All'avvio, a ogni scena aperta, quando una pagina del plugin scrive una scheda, quando cambia la configurazione,
quando torna la rete, e ogni trenta secondi finché resta qualcosa in coda dopo un errore.

Se dal server arrivano schede nuove, lo sfondo riallinea subito i token della scena (è R1b).

### Una correzione a E4, per le schede

E4 dice: in un conflitto vale il server. Per le schede non regge da sola. Il registro, i token e la stanza
ordinano già le schede per data: la versione scartata dall'archivio resterebbe sul token e nella vecchia copia
locale, con una data più recente, e tornerebbe fuori alla prima apertura della scheda. L'avviso «vale quella
del server» direbbe una cosa falsa.

Per le schede quindi **in un conflitto vale la scheda con la data più recente**. Se è quella locale, resta in
coda e sale al server sopra l'altra; se è quella del server, la locale si scarta con l'avviso. Per PF e stato
(A4, A5) resta E4.

Il limite è l'orologio dei due computer: uno sfasamento conta solo se le due modifiche sono a pochi secondi
l'una dall'altra.

### La prima sincronizzazione

Il computer che sincronizza per primo carica le sue schede. Il secondo scarica quelle, e per i personaggi che
ha anche lui tiene la versione con la data più recente.

### Rimandato

Il segno della revisione sul token. Con le schede ordinate per data non serve ad A3; si rivede in A7.

### Rischi

| Rischio | Come lo tengo |
| --- | --- |
| La chiave nel browser | sta nel `localStorage` del plugin su ogni computer del GM; non va nei metadata della stanza né nei log |
| Chiamate a un indirizzo sbagliato | solo `https`, e solo all'indirizzo scritto dal GM |
| Server lento o giù | la sincronizzazione è fuori dal percorso delle schede: non blocca aperture né salvataggi; le scritture restano in coda |
| Scritture sui token | solo il riallineamento di R1b, già provato; nessuna scrittura nuova |
| Giocatori | il servizio parte solo per il GM, con interruttore acceso e server configurato |

PF, turni, ordine d'iniziativa e barre sulla mappa non sono toccati. `initiativeList.js` non è toccato.

## Esito di A3 (28 novembre 2026)

Fatto come previsto sopra, non committato.

- `src/actorArchiveConfig.js`: indirizzo e chiave nel `localStorage` di questo browser, e l'esito dell'ultima
  sincronizzazione. Solo `https` (in chiaro solo verso questo stesso computer, per lo sviluppo).
- `src/actorArchiveSync.js`: un giro di sincronizzazione. Prima legge dal server ciò che è cambiato dall'ultima
  volta, poi invia la coda. Non lancia mai un errore: se il server non risponde, tutto resta in coda.
- `src/actorArchiveSyncRuntime.js`: il servizio nello sfondo del GM, con gli avvisi.
- `src/actorArchivePanel.js` e la sezione «Archivio degli attori» in `options-modal.html`: interruttore,
  indirizzo, chiave, «Salva e prova», stato. Salva solo se il server risponde con quella chiave. Una chiave
  salvata non viene più mostrata.
- `src/actorArchiveStore.js`: il punto di lettura per stanza (versione 2 del database) e il canale con cui una
  pagina avvisa lo sfondo che c'è da inviare.
- `src/actorArchiveCore.js`: `withRebasedActorArchiveSection`, per una sezione locale che resta in coda sopra
  una revisione del server.
- `src/background.js` e `src/initiativeCards.js`: l'aggancio.

Casi coperti dal motore, oltre al giro normale:

- la risposta a una scrittura si perde: al giro dopo la scrittura è già sul server e non conta due volte;
- il server ha perso i dati: ciò che è in coda sale di nuovo come scrittura nuova;
- chiave sbagliata o server giù: niente si perde, il GM è avvisato una volta e si riprova ogni trenta secondi.

**Limite noto:** se il server perde i dati, le sezioni già accettate e non più in coda non risalgono da sole.
Si ripristina la copia di riserva dei dati del server, oppure si risalva la scheda.

**Test:** sette in `test/actorArchiveSync.test.js`, con due computer finti e il server di riferimento. Suite
completa verde, 6.669 test; build riuscita in una cartella temporanea.

**Nel browser vero**, con il server di sviluppo e il server di riferimento su una porta locale:

- il pannello rifiuta indirizzo non `https`, chiave corta, chiave sbagliata e server spento, senza salvare;
- con indirizzo e chiave giusti salva, svuota il campo della chiave e mostra lo stato;
- il servizio, con l'IndexedDB e il `fetch` di Chrome, ha inviato una scheda al server e lo stato è diventato
  «a posto. Niente in coda».

**Non provato:** dentro Owlbear, contro il server vero, e dai due computer.

### Prova in stanza di A3

Su un computer, con la build locale:

1. Opzioni → **Archivio degli attori**: scrivi l'indirizzo del server e la chiave, **Salva e prova**. Deve dire
   «Collegato e salvato».
2. Accendi **Usa l'archivio in questo browser**.
3. Apri e salva la scheda di un PG. Riapri le Opzioni: lo stato deve dire «a posto. Niente in coda».
4. Sul server, nella cartella dei dati, compare un file con il nome della stanza.

Dai due computer serve la stessa versione del plugin su entrambi, quindi la build pubblicata:

5. Sul secondo computer ripeti i passi 1 e 2 nella stessa stanza. Apri la scheda del PG: è quella salvata sul
   primo.
6. Cambia la CA sul secondo e salva. Sul primo, alla prossima scena aperta o entro pochi secondi dalla prossima
   scrittura, la scheda ha la CA nuova.
