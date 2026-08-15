# ARCH-008 — snapshot e fanout mirati

Lo step 8 restringe i percorsi senza cambiare le code esistenti.

## Memory

`sceneItemChangeDispatcherCore` calcola due domini distinti:
`quickActionHydration` e `legacyHpHydration`, ciascuno con i propri candidate
ID. `hpMemoryAutofill` resta una compatibilità OR, ma i subscriber produttivi
usano i domini precisi. I token con `actorProfileId` sono esclusi dal fallback
HP legacy; `meta.hp` e `meta.hpMax` restano gli unici campi canonici.

Il quick-action restore riusa `event.allItems`, filtra prima del registry Room,
mantiene la coda seriale e deduplica per scene/generation/item. Il fallback HP
unisce gli ID durante il debounce, riusa lo snapshot Event Hub e mantiene il
merge dei metadata, la riconciliazione zero-HP e i controlli di epoch.

## Metadata e generation

`sceneMetadataDigest.js` osserva soltanto
`com.thebigpicture.initiative/state` con un digest stabile dell'intero valore.
History, chiavi estranee, nuovi riferimenti semanticamente uguali e il primo
seed non invalidano. I consumer possono forzare recovery, watchdog o cleanup;
un pass riuscito marca la generation solo dopo il commit. Incomplete e stale
restano quindi recuperabili.

## Full render

`readFullRenderItemSnapshot` sceglie lo snapshot completo compatibile con epoch,
revision e generation, oppure esegue al massimo una full `getItems`. Il full
render passa lo stesso array raw a `getEntriesWithLair` e
`spellBoardTokenTrackerItems`; il provider non conosce né modifica la coda di
render e conserva i guard stale/virtual ID esistenti.
