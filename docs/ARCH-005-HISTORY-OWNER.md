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
distribuita o un lock Room senza CAS. Il follow-up minimo è una primitiva CAS o
un servizio Room/server-side con revisione, eventualmente preceduta da un
read-back/merge limitato; fino ad allora il caso multi-GM resta esplicitamente
non risolto da ARCH-005.
