# ARCH-006 — Gateway dello stato iniziativa

## Confine

`src/main.js` importa `contextMenu.js` e `initiativeList.js` nello stesso
tracker realm. Il background e i popup non sono writer produttivi della chiave
`com.thebigpicture.initiative/state`; non è quindi necessario un broker
cross-realm per questo dominio.

L'unico modulo produttivo che invoca `writeSceneMetadataKey` per la chiave è
`src/initiativeStateGateway.js`. Il core `src/initiativeStateGatewayCore.js`
fornisce una coda seriale e resta testabile senza SDK.

## Contratto

Ogni comando cattura epoch e identità disponibili, verifica il ruolo GM,
rilegge `OBR.scene.getMetadata()` al queue head e applica un reducer o una
patch limitata ai campi dichiarati. Il valore scritto è ancora il valore
completo della chiave — requisito dell'SDK — ma viene composto dal read più
recente e non da uno snapshot stale passato come replacement.

Il gateway preserva i campi non posseduti e quelli sconosciuti, verifica i
campi posseduti con read-back, mantiene la coda dopo failure e restituisce
`applied`, `unchanged`, `conflict`, `rejected` o `failed`. Un command ID
committato è deduplicato; lo stesso ID con payload diverso produce conflict.

Le transizioni del turno continuano a essere pianificate da
`initiativeList.js`. Il gateway possiede solo il commit dei campi
`order/current/round/collapsed` per la navigation. Il cleanup Paragon possiede
solo `paragonInits`; seed, Lair, UI e reset dichiarano i propri campi nei
rispettivi percorsi esistenti.

## Paragon

`paragonToggleCore.js` trasforma ogni comando in intenti espliciti
`tokenId → desiredEnabled`. Il token viene scritto in modo idempotente, poi
letto nuovamente. Il cleanup elimina soltanto gli ID osservati realmente
disabilitati e usa un command ID separato, quindi un failure post-commit può
essere ritentato senza ritoccare il token.

## Lifecycle e multi-GM

Un cambio epoch invalida i comandi non ancora committati e azzera dedup e
pending index della scena precedente. Un commit già avvenuto viene riportato
come post-commit stale e non viene compensato nella scena successiva.

La coda è una garanzia per i writer dello stesso tracker realm. Due browser GM
restano soggetti alla semantica SDK same-key last-commit-wins: il gateway non
introduce lock distribuiti o CAS simulati. Il read-back verifica il risultato
locale e rende visibili mismatch/errori post-commit, ma non può dimostrare una
garanzia globale né prevenire ogni lost update fra client distinti.
