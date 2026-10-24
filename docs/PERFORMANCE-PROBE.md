# Probe prestazioni nel browser

`src/perfProbe.js` misura nel browser reale ciò che il [performance harness](PERFORMANCE-HARNESS.md)
non vede: byte scritti e ricevuti, latenze dei comandi, avvio delle pagine e long task.

È spento per default. Acceso, osserva soltanto: non cambia scritture, messaggi o il loro
ordine. Spento, ogni hook è una condizione falsa e non serializza nulla
(`test/perfProbe.test.js`).

## Accensione

Il flag vive in `localStorage` (`com.thebigpicture.initiative/perf-probe`), quindi vale per
tutte le finestre dell'estensione **nello stesso profilo del browser**. La finestra giocatori
in incognito ha un profilo separato: va accesa a parte.

1. In Owlbear apri DevTools e scegli come contesto un iframe dell'estensione: il menu in
   alto nella Console mostra `background.html`, `index.html` e gli altri iframe.
2. Esegui `__tbpPerf.enable()`.
3. Ricarica la pagina di Owlbear: così è misurato anche l'avvio.

Spegnimento: `__tbpPerf.disable()` e ricarica.

Gli iframe si scambiano gli eventi con un `BroadcastChannel` nativo (nessun broadcast
Owlbear, nessuna rete). Il **background** è persistente: è lì che si leggono i risultati,
anche quelli dei popup già chiusi.

## Comandi (console del background)

| Comando | Effetto |
| --- | --- |
| `__tbpPerf.report()` | Tabelle riassuntive in console |
| `copy(__tbpPerf.export("etichetta"))` | Copia negli appunti il JSON con riepilogo ed eventi |
| `__tbpPerf.reset()` | Azzera gli eventi raccolti in questa finestra |
| `await __tbpPerf.metadataSizes()` | Byte attuali di scena e room, per chiave |

Il buffer tiene gli ultimi 5000 eventi.

## Cosa viene registrato

| Evento | Dove | Contenuto |
| --- | --- | --- |
| `metadata-write` | `metadataKeyScoped.js` | scope, chiave, runtime, byte, ms di `setMetadata`, esito |
| `history-read` | `historyOwner.js` | ms della lettura, byte dell'intera scena e della History, numero di voci |
| `history-action` | `history.js` (`withItemMetaHistory`) | attesa in coda, cattura prima, azione, cattura dopo, append, byte della voce |
| `recovery-write` | `effectsRecovery.js` | fase del journal, record, receipt, scrittura saltata per budget |
| `effects-transport` | `effectsMutations.js`, lato popup/tracker | andata e ritorno `context`/`apply`/`undo` per tipo di comando |
| `effects-command` | `effectsMutations.js`, lato background | ms di elaborazione, ms totali con l'invio, chunk e byte della risposta |
| `broadcast-rate-limited` | `effectsMutations.js` | ogni chunk rifiutato da Owlbear con «Too many requests» |
| `effects-phase` | `effectsMutations.js`, coordinatore nel background | durata di `before-command` (journal di recovery), `prepare`, `commit`, `build-history`, `record-history` per comando |
| `sdk-call` | solo background | durata di ogni chiamata SDK su item, item locali, metadata di scena e room, broadcast; `cmd` indica il comando effetti in corso |
| `history-owner-phase`, `history-owner-command` | `historyOwner.js` | per ogni comando dell'owner: scrittura, notifica, Combat Log e tempo totale fino alla risposta |
| `boot` | entry delle pagine | ms dalla navigazione a moduli valutati, `OBR.onReady`, first contentful paint |
| `boot-resources` | entry delle pagine | script caricati, quanti dalla cache, byte trasferiti e decodificati |
| `long-task` | entry delle pagine | task del main thread oltre 50 ms |
| `scene-metadata-received`, `scene-items-received`, `room-metadata-received` | solo background | byte ricevuti da questo client per ogni evento |

Pagine con `perfBootPage`: tracker (`main.js`), background, card, Quick HP, avviso di turno,
avviso di concentrazione, tiro contro la morte, console PG e console Boss.

La latenza di una modifica PF dalla pillola è `history-action` di tipo `hp`: comprende la
modifica (`effects-transport`) e l'append della History. Non comprende la lettura degli item
che `initiativeList.js` fa prima di aprirla. Il tempo di render del tracker resta nella
diagnostica esistente: `__tbpInitiativeDiagnostics.enable()` nel contesto `index.html`.

Nel background, a probe acceso, i metodi SDK elencati sopra sono avvolti da un wrapper che restituisce la
stessa promise dell'originale e registra solo la durata. La `getItems` che `updateItems` fa al proprio interno è
marcata `nested` e non viene contata due volte. Gli eventi registrati mentre una fase del coordinatore è in
corso portano `cmd`/`cmdKind`: comprendono anche le chiamate di altri controller del background eseguite nel
frattempo, perché il coordinatore è seriale ma il background no.

`report()` mostra in testa `effectsPhases` (mediana di ogni fase per tipo di comando, con `outsidePhases` =
tempo di elaborazione non coperto dalle fasi, cioè attesa in coda e broker), `sdkCalls` e `historyOwner`
(`queueAndOther` = attesa in coda dell'owner e normalizzazione).

Il background con il probe acceso aggiunge un proprio ascolto di scena, item e room e
serializza ogni evento ricevuto per contarne i byte: è un piccolo costo in più, solo a
probe acceso.

## Protocollo di sessione

Stessa room, stessa scena, tracker aperto e finestra giocatori in incognito sul secondo
schermo, probe acceso in entrambe. Prima di ogni blocco `__tbpPerf.reset()`, dopo ogni
blocco `copy(__tbpPerf.export("<blocco>"))` dal background di entrambe le finestre.

1. Fermo, 2 minuti.
2. 10 modifiche PF dalla pillola della card.
3. 5 spostamenti di token.
4. 3 azioni Boss (Soffio su tre eroi).
5. 10 avanzamenti di turno.
6. 3 avvisi di concentrazione.
7. 3 Undo.

Prima del blocco 1 annota anche `await __tbpPerf.metadataSizes()`.
