# ARCH-002 — Scritture metadata key-scoped

## Contratto adottato

Owlbear Rodeo SDK 3.1.0 inoltra il payload di `setMetadata` al runtime; la
semantica documentata per scena e Room è una partial update con merge shallow
top-level. Il payload non è quindi una sostituzione completa, ma il merge
profondo dei valori non è garantito.

Il plugin usa `src/metadataKeyScoped.js` come adapter minimo. Ogni writer
dichiara il contratto del proprio dominio e invia sempre un payload della
forma `{ [key]: value }`. L'adapter non legge metadata, non serializza writer
tra iframe e non introduce revisioni o CAS. Le code locali già esistenti
restano locali al runtime che le possiede.

## Ownership

| Dominio | Chiave | Writer autorizzati |
| --- | --- | --- |
| initiative state | `com.thebigpicture.initiative/state` | `initiativeList.js`, pulizia mirata in `contextMenu.js` |
| history | `com.thebigpicture.initiative/history` | `history.js` |
| clocks | `com.thebigpicture.initiative/clocks` | `clocks.js` |
| combat log session | `com.thebigpicture.initiative/combat-log-state` | `combatLog.js` |
| shared UI | `com.thebigpicture.initiative/ui` | `action-launcher.js` |
| Room memory | `com.thebigpicture.initiative/hpMemory` | `hpMemory.js` |
| registry | `com.thebigpicture.initiative/factionRegistry` | `factionRegistry.js` |
| initiative cards | `com.thebigpicture.initiative/initiativeCards` | `initiativeCards.js` |

Le chiavi e i domini sono registrati in `METADATA_OWNERSHIP`; i nomi delle
chiavi e il formato dei valori persistenti non sono cambiati.

## Cosa risolve

Un writer che ha letto uno snapshot precedente può ora riscrivere soltanto la
propria chiave. Per esempio, un salvataggio tardivo di initiative state non
porta più con sé lo snapshot precedente di history, clocks o combat-log-state.
Lo stesso vale per registry, initiative cards e Room memory.

Le mutazioni del valore precedente leggono ancora il metadata appena prima di
calcolare il nuovo valore della stessa chiave. Questo preserva i campi interni
sconosciuti quando il contratto del dominio richiede un merge, ma non pretende
di risolvere due mutazioni concorrenti sulla stessa chiave.

Il percorso di eliminazione della sessione Combat Log usa una cancellazione
logica key-scoped: invia la sola chiave di sessione con tombstone JSON-safe
`null`. L'SDK installato documenta il partial update top-level, ma non espone
una cancellazione fisica key-scoped documentata; `undefined` non viene quindi
usato come delete implicito. I consumer interpretano `null`, `undefined` e
chiave assente come nessuna sessione, senza includere chiavi estranee nel
payload.

## Read–modify–write rimasti intenzionalmente

- `initiativeList.js`, `contextMenu.js`: read–modify–write interno a
  initiative state, necessario per mantenere i campi dello stato e
  `paragonInits`.
- `history.js`: append e Undo modificano l'array `entries` della stessa chiave.
- `clocks.js`: l'updater modifica la struttura della stessa chiave clocks.
- `factionRegistry.js`, `initiativeCards.js`, `hpMemory.js`: il valore corrente
  della rispettiva chiave viene combinato con il fallback locale prima del
  commit.

Questi percorsi non riscrivono più l'intero metadata object. Restano soggetti
alla semantica esistente last-commit-wins quando la competizione è sulla stessa
chiave; la coordinazione globale, il command coordinator, la history
transazionale e il CAS sono fuori da ARCH-002.

## Diagnostica

È disattivata di default. Per abilitarla nel runtime corrente:

```js
globalThis.__TBP_METADATA_KEY_DIAGNOSTICS__ = true;
```

Le righe diagnostiche riportano solo scope, runtime, dominio, chiave, durata e
esito. Non riportano i valori metadata. Gli errori di scrittura sono rilanciati
con scope, dominio, chiave e runtime; i fallback locali già previsti (card,
registry e HP memory) restano invariati.

## Verifica

`test/metadataKeyScoped.test.js` usa un harness deterministico che simula il
merge shallow dell'SDK e verifica:

- initiative state/history in entrambi gli ordini;
- clocks/combat session;
- registry, initiative cards, Room memory e chiavi sconosciute;
- payload a chiave singola ed errori contestualizzati;
- il limite esplicito sulla stessa chiave;
- la regressione delle guardie di epoch/baseline di ARCH-001.
