# Indagine sullo Speed Tracker — 10 ottobre 2026

## Esito e ambito

**Aggiornamento dopo la correzione:** implementati i sei interventi descritti
nel piano `superpowers/plans/2026-10-10-speed-tracking-fix.md`. I risultati
diagnostici sotto descrivono il commit di partenza; la verifica finale e lo
smoke test live da eseguire sono riportati in fondo.

L'inaffidabilità segnalata ha riscontri nel codice corrente, basato sul commit
`1131674b90a90ded955e47afde92f08db42ad755`.
Due percorsi riproducibili spiegano direttamente il sintomo «i primi movimenti
non vengono conteggiati»: baseline di movimento acquisita troppo tardi e cache
delle posizioni non ricostruita al cambio scena.

Sono state eseguite riproduzioni con SDK simulato e ritardi controllati, usando
il modulo reale `src/speedCheck.js`, i resolver reali e le funzioni originali del
watcher History. Non è stata osservata una stanza Owlbear di produzione:
la presenza dei difetti è verificata, ma quale percorso sia intervenuto nella
sessione dell'utente resta da stabilire.

Nella fase diagnostica non erano stati modificati file di produzione.
Il runner `scripts/investigate-speed-check.mjs` ora esegue le regressioni della
correzione, invece di asserire il comportamento difettoso del commit originale.

## Percorso controllato

1. `initiativeList.js` monta sincronizzazione del toggle, processor GM e
   sottoscrizione ai segmenti History durante il bootstrap.
2. `syncSpeedCheckTurn()` risolve turno e attore; carica uno stato di movimento
   asincrono, oppure adotta quello precaricato dalla navigazione.
3. `loadMovementState()` legge token, scheda e griglia; recupera il movimento
   persistito se la chiave di turno coincide, altrimenti crea una baseline.
4. `mountMovementHistoryWatcher()` confronta posizioni memorizzate e nuove;
   notifica i segmenti senza aspettare la scrittura della History.
5. `queueSpeedCheckMovements()` cattura il turno e prepara le caselle;
   `processSpeedCheckMovement()` attende lo stato, misura, applica costi/limiti,
   aggiorna UI e metadata.
6. Al cambio scena il dispatcher ricostruisce una baseline senza emettere
   falsi delta; i runtime History e iniziativa eseguono i propri reset.

## 1. Primo spostamento assorbito dalla baseline tardiva

**Funzioni:** `loadMovementState()`, `ensureMovementState()`,
`processSpeedCheckMovement()` in `src/speedCheck.js`.

La lettura iniziale del token può completarsi quando il token è già nella
destinazione del primo movimento. Lo stato usa questa posizione come
`startPosition`, `startCell` e `lastCell`. Anche se l'evento contiene la vera
origine, il processor usa `state.lastCell || movement.beforeCell`.
Origine e destinazione misurate coincidono, quindi il processor termina con
distanza zero. La baseline sbagliata viene anche persistita.

Riproduzione controllata:

1. PG con velocità 9 m, posizione x=0, griglia da 1 pixel per casella.
2. Avvio del processor e lettura del token mantenuta in attesa.
3. Spostamento x=0 → x=1 e accodamento del relativo evento.
4. Completamento della lettura, che restituisce il token a x=1.

Risultato: **0 m invece di 1,5 m**; posizione iniziale salvata a x=1.
Il movimento successivo x=1 → x=2 porta il totale a **1,5 m invece di 3 m**.

Il problema coinvolge anche il limite: nella stessa sequenza, uno spostamento
di 7 caselle / 10,5 m con velocità 9 m e limite abilitato resta nella
destinazione, consuma 0 m e non genera warning.

Controllo discriminante: rallentare soltanto il caricamento della scheda,
dopo che il token è stato letto alla posizione iniziale, conteggia correttamente
1,5 m. Non basta quindi un generico caricamento lento: conta quando viene
acquisita la posizione del token rispetto al movimento.

## 2. Primo movimento scartato dopo cambio o ricaricamento scena

**Funzioni:** `resetSceneHistoryRuntime()`, `acquireSceneHistoryBaseline()`,
`mountMovementHistoryWatcher()` in `src/history.js`.

All'unload viene eseguito `__movementPositions.clear()`. La nuova baseline
ricostruisce `__sceneHistorySnapshot`, ma non `__movementPositions`.
La popolazione iniziale delle posizioni avviene soltanto al primo mount del
watcher, che rimane montato attraverso i cambi scena.

Questo difetto è verificato per il movimento ordinario/passivo che passa dalla
History. I segmenti sintetici ricevuti dal canale `speed-drag` arrivano
direttamente al contatore e saltano il watcher: quella route non è stata
esercitata e non le viene attribuito il difetto della cache History.

Al primo movimento nella nuova scena il watcher memorizza la destinazione,
poi incontra `if (!previous || samePosition(previous, next)) continue`.
Non notifica il segmento allo Speed Tracker e non lo registra nella History.
Il secondo movimento trova finalmente una posizione precedente e funziona.

Nel controllo che collega watcher e contatore, il primo movimento mostra
0 m. Un secondo movimento rettilineo porta il totale a 3 m: se il contatore
aveva già conservato l'origine corretta, recupera indirettamente la distanza
dal suo `lastCell`. Il primo segmento resta comunque assente dalla History.
Questo recupero non ricostruisce un percorso misto o il costo delle condizioni
che erano attive sul segmento perso. Non va quindi equiparato a una
registrazione corretta del primo movimento.

Riproduzione: mount iniziale → primo movimento correttamente notificato →
reset e acquisizione baseline della nuova scena → primo movimento con
**0 segmenti notificati invece di 1** → secondo movimento con 1 segmento.
La classificazione degli eventi usa il dispatcher reale: il primo evento ha
già una posizione precedente valida in `changedRecords`, ignorata dal watcher.

Il filtro del watcher accetta solo eventi `flags.movement`: gli aggiornamenti
di soli metadata non ricostruiscono questa cache. Un nuovo mount del tracker
ha invece una popolazione iniziale, spiegando perché ricaricare l'interfaccia
può cambiare il comportamento.

Riproduzione manuale suggerita: tenere aperto il tracker GM, cambiare scena,
portare al turno attivo un PG con velocità già compilata e muoverlo una
casella, poi un'altra. Confrontare distanza e History. Il risultato dipende
anche da eventuali movimenti intervenuti durante l'acquisizione della scena.

## Altri difetti verificati

| Caso | Risultato osservato | Causa |
| --- | --- | --- |
| Velocità inizialmente assente, poi impostata a 9 m nello stesso turno | Tracking ancora indisponibile; riprende uscendo e rientrando nel turno | `disabled` viene mantenuto in cache; il listener ignora lo stato disabilitato |
| Velocità base modificata da 9 a 12 m nello stesso turno | Il contatore continua a usare 9 m | `applyConditionSpeedItem()` riusa `baseSpeedMeters` senza rileggere la scheda |
| Errore transitorio nella prima lettura del token | Due movimenti successivi falliscono con lo stesso errore; una sola chiamata SDK | `ensureMovementState()` conserva la Promise rifiutata; il turno nuovo permette il recupero |
| Iniziativa svuotata e ricreata con stesso primo attore, indice e round | Recuperati 1,5 m del combattimento precedente invece di 0 | Chiave `round:index:actor` riutilizzata e metadata `speedCheckMovement` conservati |
| Nuova scena con stessa chiave di turno e stessi ID dei token | Nel caso simulato, 16,5 m invece di 1,5 m | Il runtime velocità non viene invalidato all'unload e `syncSpeedCheckTurn()` considera il turno invariato |

L'ultimo caso è condizionato alla coincidenza degli ID: non implica che ogni
cambio scena produca quel risultato. Il caso dell'iniziativa ricreata è distinto
dal reload della stessa battaglia, nel quale conservare il totale è corretto.
Il valore 16,5 m è ottenuto isolando il processor e consegnandogli direttamente
il segmento; nel flusso passivo subito dopo reset History, il primo segmento
viene invece scartato prima di arrivarvi. I due risultati non descrivono la
stessa sequenza end-to-end.
`makeClearInitiativeBtn()` elimina `inInitiative` e resetta ordine/round, ma
conserva il campo di movimento, confermando il percorso della collisione.

## Controlli che funzionano

- Stato completamente inizializzato prima del movimento: 1,5 m e poi 3 m.
- Solo scheda lenta, posizione iniziale già acquisita: primo movimento contato.
- Reload della stessa battaglia e stesso turno: totale correttamente recuperato.
- Movimento già in lavorazione che termina dopo un cambio turno: costo attribuito
  all'attore uscente; totale dell'attore entrante resta 0 nel caso controllato.
- Calcoli di base, condizioni, presentazione e dispatcher: test mirati verdi.

## Correzione consigliata nella fase diagnostica

Il primo intervento dovrebbe coprire insieme i due percorsi di perdita:

1. Nel watcher History ricostruire le posizioni alla baseline di scena e/o usare
   il `before` del record di movimento come fallback quando la cache è vuota.
2. Nel runtime velocità ancorare lo stato nuovo all'origine del primo segmento
   valido già accodato per quel turno, se la lettura iniziale è avvenuta dopo
   quel movimento. Evitare la sostituzione indiscriminata di `lastCell`, che
   serve anche a snapping, deduplicazione e Undo. La posizione di reset deve
   essere corretta prima della persistenza della baseline.

Poi affrontare separatamente invalidazione alla scena, recupero da letture
fallite, aggiornamenti della scheda e distinzione tra nuovo combattimento e
reload. Questi problemi non richiedono una riscrittura dell'architettura.

Prima di modificare tali blocchi va esplicitato il rischio su History/Undo,
reset del token, limiti e transizioni di turno. I test di regressione devono
preservare il recupero della stessa battaglia e non contare movimenti di altri
attori o eventi della scena precedente.

## Verifica della fase diagnostica

```powershell
node --experimental-test-module-mocks scripts/investigate-speed-check.mjs
npm test
npm run build
npm run verify:dist
```

Lo script diagnostico originale eseguiva 21 osservazioni deterministiche, comprese
10 discrepanze riferibili ai sei gruppi di difetti descritti sopra. L'uscita 0
indicava che i difetti erano stati riprodotti. Il runner aggiornato esegue
test aggiunti anche alla normale suite; l'uscita 0 indica regressioni superate.

- Test mirati: 77 superati.
- Suite completa: 2.958 superati, nessun fallimento.
- Build Vite: riuscita; warning già noto sui bundle oltre 500 kB.
- Verifica distribuzione: versione 1.3.0 coerente.
- Revisione indipendente: riproduzioni rieseguite e spiegazioni confrontate
  con le funzioni di produzione; precisato l'ambito del percorso passivo
  rispetto ai segmenti sintetici e alla prova isolata con ID coincidenti.

La build ha richiesto esecuzione fuori dal sandbox dopo un errore locale
`EPERM` di Vite durante `realpath` su `src/main.js`. Nessun deploy, commit o
push è stato eseguito per questa indagine.

## Correzione implementata e verifica finale

- `src/history.js`: la baseline di scena ricostruisce le posizioni senza
  sovrascrivere quelle già aggiornate dagli eventi; il watcher usa il `before`
  del dispatcher se manca la posizione precedente.
- `src/speedCheck.js`: lo stato nuovo adotta l'origine del primo segmento,
  anche se History lo consegna dopo il caricamento. I turni ripristinati
  mantengono origine e distanza già consumata. Le letture fallite sono
  riprovabili, le modifiche di scheda aggiornano la velocità nello stesso
  turno e i lavori asincroni obsoleti sono scartati ai confini di scena,
  toggle e svuotamento del combattimento.
- `src/initiativeList.js`: solo `makeClearInitiativeBtn()` e relativo import.
  Svuotare l'iniziativa cancella esclusivamente i contatori di movimento,
  anche dai token rimossi individualmente in precedenza, preservando HP,
  altri metadata e posizione. La navigazione ordinaria dei turni conserva
  il comportamento del movimento uscente già in lavorazione.

La revisione indipendente ha fatto aggiungere regressioni per consegna tardiva
del segmento, `changedRecords` reali, token precedentemente rimossi e modifica
del profilo sovrapposta al primo movimento. I casi fallivano prima delle
rispettive patch e passano dopo. Nessun rilievo importante aperto al riesame.

Verifica finale sulla correzione:

- 26 test runtime Speed Check e 5 test History: 31 superati.
- Suite completa `npm test`: **2.986 superati, zero fallimenti**.
- `npm run build`: riuscita; warning preesistente sui bundle oltre 500 kB.
- `npm run verify:dist`: versione 1.3.0 coerente.
- `npm run perf:harness -- --smoke`: `correctness.ok = true`, comprese
  coerenza iniziativa, HP deterministici, History senza duplicati, code
  scariche, invalidazione della vecchia scena e zero contaminazioni tra scene.

Lo smoke automatico usa l'SDK simulato. Nel browser dell'app non era aperta
una stanza Owlbear: non è stato eseguito un test live o un deploy. La prova di
scrittura sospesa verifica le guardie prima/dentro il callback SDK; non simula
ogni possibile ritardo di applicazione o conferma sul server Owlbear.

### Smoke test live prima della pubblicazione

1. Come GM, attivare Speed Check; usare un PC da 9 m e iniziare il
   combattimento. Muoverlo subito di una casella: devono comparire 1,5 m.
   Ripetere con il tool di movimento; il segmento passivo non deve raddoppiarlo.
2. Muovere su un percorso misto, poi usare Undo/reset: verificare totale e
   ritorno all'origine. Superare 9 m prima con limite spento (avviso), poi
   acceso (rifiuto e rollback).
3. Modificare velocità 0→9 e 9→12 nello stesso turno: tracking disponibile e
   nuova allowance, senza perdere distanza consumata o dash. Togliere Prono:
   costo per alzarsi applicato una sola volta.
4. Cambiare turno: primo movimento del PC entrante contato e contatore
   distinto. Ricaricare l'estensione nello stesso turno: distanza conservata.
5. Rimuovere il PC dall'iniziativa, svuotarla e ricreare il combattimento con
   quel PC per primo: totale 0; HP e posizione conservati.
6. Cambiare scena e ripetere un primo movimento immediato: nessun dato della
   scena precedente; History registra il segmento ed Undo torna all'origine.

Nessun commit o push eseguito per questa correzione.
