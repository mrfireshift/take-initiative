# ARCH-005 — History owner

## Scope

Per ogni client GM, il background persistente è l’unico writer produttivo della
chiave `com.thebigpicture.initiative/history`. Tracker, popup e altri realm
inviano comandi `context`, `append`, `remove` o `clear` attraverso il broker
locale. Il broker rilegge la chiave alla testa della propria coda, applica la
retention di 30 entry e usa il writer key-scoped senza sostituire gli altri
metadata di scena.

`requestId` identifica il trasporto, `commandId` il comando logico e
`correlationId` conserva la correlazione della mutazione chiamante. L’id della
entry resta quello già prodotto dal dominio; l’append è idempotente per entry
ID e un payload diverso sullo stesso ID produce conflict senza sovrascrivere la
prima entry.

Notifica History e Combat Log vengono eseguiti dall’owner solo dopo un append
nuovo. Retry, duplicate request e retry post-commit non generano eventi
secondari. Errori post-commit sono restituiti come risultato applicato con
pending/errori osservabili; non esiste un fallback di scrittura nel caller.

## Lifecycle e più GM

L’owner assegna una `sceneIdentity` propria e cattura l’epoch locale prima di
ogni comando. Cambio scena svuota coda, richieste e cache; le risposte tardive
sono scartate dal client. Gli epoch numerici di iframe diversi non vengono
confrontati tra loro.

La garanzia è per-client: due client GM hanno due owner distinti. Il caso raro
di append simultanei tra client conserva ancora la semantica SDK
same-key-last-commit-wins: ciascun owner può leggere la stessa baseline e una
write remota può quindi prevalere sull’altra. Non viene introdotta un’elezione
distribuita o un lock Room senza CAS. Il contratto di prodotto assume un solo
GM autorevole per room/sessione: writer GM indipendenti e contemporanei sono
fuori dal runtime supportato. Questo limite è accettato, non un follow-up di
ARCH-005, e non richiede CAS, leader election o coordinamento distribuito.

## Storage per browser (ARCH-009)

Da `dd881a7` la History di una scena vive per default in IndexedDB del browser del GM (database
`com.thebigpicture.initiative.history-store`, store `historyStores`), non più nei metadata di scena. Il contratto
dell'owner non cambia: resta l'unico writer, applica la stessa retention di 30 entry, la stessa idempotenza per entry ID
e la stessa coda; il broker (`historyOwnerCore.js`) riceve `readHistory`/`writeHistory` per iniezione e non sa dove
sta la History.

- La chiave `com.thebigpicture.initiative/history` resta, ma contiene una testa di poche centinaia di byte
  (`version: 2`, `storeId`, `rev`, `seq`, `count`, `lastEntryId`, `entries: []`). I lettori di ogni iframe GM
  (`getHistoryEntries`, Undo) leggono la testa dalla scena e le entry da IndexedDB, nello stesso browser.
- Una History ancora intera in scena (versione 1) viene migrata all'avvio dell'owner con un comando `migrate` nella sua
  coda, accettato solo dall'owner stesso, oppure alla prima scrittura.
- Il flag `localStorage["com.thebigpicture.initiative/history-local-store"] = "0"` riporta la History intera in scena
  alla scrittura successiva; senza `localStorage` o IndexedDB utilizzabili la History resta in scena.
- La garanzia per-client diventa anche per-browser: un altro PC, o la pulizia dei dati del sito, mostrano una History
  vuota per quella scena (con un avviso) senza toccare la scena. Le scene duplicate si separano al primo scritto grazie
  a `rev` nella testa.
- Gli store non scritti da 30 giorni vengono eliminati una volta per apertura (`pruneLocalStores`), tenendo sempre
  quelli della scena attuale.

Dettagli, rischi e decisioni: [ARCH-009](ARCH-009-HISTORY-LOCAL-STORE.md).
