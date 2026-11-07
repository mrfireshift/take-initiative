# Studio: il registro delle schede nella stanza

7 novembre 2026. Solo studio: nessun codice è cambiato.

## Il problema

Il GM vede l'avviso «Registro delle schede pieno: … restano solo in questo browser (non nella stanza)». Nell'elenco ci sono diciassette personaggi, molti di altre campagne.

## Come funziona oggi

Le schede dei personaggi vivono in tre posti:

| Dove | Chiave | Cosa contiene | A cosa serve |
| --- | --- | --- | --- |
| Token | `com.thebigpicture.initiative/meta` → `initiativeCard` | la scheda di quel token | è la fonte per la scena corrente, giocatori compresi |
| Stanza | `com.thebigpicture.initiative/initiativeCards` | le schede, al massimo 4.450 byte | ritrovare la scheda in un'altra scena o da un altro browser |
| Browser del GM | `localStorage` `…/initiativeCards/local` | tutte le schede mai viste da questo browser | copia di riserva; ritrova la scheda anche in un'altra stanza |

`updateRoomCards()` ([initiativeCards.js:412](../src/initiativeCards.js)) fa così a ogni scrittura:

1. Unisce la copia del browser e quella della stanza.
2. Applica la modifica.
3. Salva tutto nel browser.
4. Prova a mettere **tutto** nella stanza.

La copia del browser non è divisa per stanza. Il punto 4 spinge nella stanza anche i personaggi di tutte le altre stanze aperte da quel browser. Il budget tiene i più recenti (`retainInitiativeCardRegistryWithinByteBudget`) e l'avviso D9 elenca gli altri.

Chi legge la copia della stanza:

- l'apertura della scheda (il GM la riallinea sul token);
- il recupero delle azioni rapide quando un token entra in iniziativa;
- la migrazione degli `actorProfileId`;
- la scheda e il widget della velocità dei giocatori, solo come ripiego: il token ha già la scheda.

## Le misure

Le ho prese con uno script usa e getta, fuori dal repository, che usa la codifica reale della stanza (`encodeInitiativeCardRegistryForRoom`). Il gruppo d'esempio sono cinque PG di 5° livello con armi e libri di incantesimi:

| PG | byte nella stanza (voce + alias per nome) |
| --- | --- |
| Paladino (2 armi, 6 incantesimi) | 1.135 + 158 |
| Ranger (3 armi, 6 incantesimi) | 1.320 + 158 |
| Mago (1 arma, 20 incantesimi) | 1.104 + 158 |
| Ladro (2 armi) | 967 + 158 |
| Chierico (1 arma, 14 incantesimi) | 1.044 + 158 |
| **Totale** | **7.026 su 4.450** |

Ne entrano tre su cinque. Il bugfix L12 (SC-03) aveva già misurato 7.954 B per cinque PG con libri.

In un profilo pesano soprattutto le azioni rapide: circa 190 B per arma. Una buona parte sono valori di default (`"version":2`, `"targetMode":"selection"`, `"id":"c1"`, `slotLevel: null` e simili). Seguono il libro degli incantesimi (circa 150 B per sei incantesimi) e i tiri salvezza (50 B). I campi vuoti o nulli valgono circa 90 B a profilo.

**Conclusione: sono due problemi distinti.**

1. **Personaggi di altre stanze.** È il motivo dei diciassette nomi, e si risolve.
2. **Un gruppo intero non entra nei 4.450 byte.** Anche con il punto 1 risolto, con cinque PG pieni l'avviso resterà per uno o due personaggi del gruppo.

## Proposta A: nella stanza solo le schede di quella stanza

In `updateRoomCards()` la copia del browser resta l'unione completa. Nella stanza vanno solo:

- le voci che la stanza ha già;
- le voci che questa scrittura ha toccato: scheda aperta o salvata dal GM, token entrato in iniziativa, Annulla dalla Cronologia, migrazione dell'identità.

«Toccata» vuol dire che il valore restituito da `updater` per quella chiave non è quello di partenza. L'apertura della scheda (idratazione) riscrive sempre la voce, quindi un personaggio usato in questa stanza ci entra.

Cosa non cambia:

- Le letture continuano a unire browser e stanza. Un PG portato da un'altra campagna trova ancora la sua scheda alla prima apertura, e da lì entra nella stanza.
- La copia del browser, il token, il budget e l'ordine per recenza restano come sono.

Codice:

- una funzione pura in `initiativeCardRegistryCore.js`, per esempio `roomScopedInitiativeCardRegistry(next, previous, roomRegistry)`;
- una riga in `updateRoomCards()`, che passa a `encodeInitiativeCardRegistryForRoom` il registro filtrato invece di `next`.

`initiativeList.js` non si tocca.

Rischi (AGENTS.md):

- Cambia il contenuto di un metadata della stanza, ma solo togliendo voci estranee.
- Non tocca PF, turni, ordine d'iniziativa, barre sulla mappa o cicli dei metadata.
- Le scritture possono solo diminuire: `skipUnchanged` resta.

Test:

- un browser con schede di altre stanze non le porta nella stanza;
- la scheda aperta in questa stanza ci entra;
- l'avviso elenca solo i nomi della stanza;
- quelli esistenti (L12, `ROOM-BUDGET-*`, registro) restano verdi.

## Proposta B: far entrare il gruppo

| Opzione | Effetto stimato | Costo e rischio |
| --- | --- | --- |
| B0. Niente | 3 PG pieni su 5 nella stanza; l'avviso resta per gli altri | nessuno |
| B1. Codifica compatta nella stanza: azioni rapide senza i default, profilo senza campi nulli, ripristinati in lettura come già si fa per le capacità di classe e i modificatori | circa −20 %: da 7.026 a circa 5.700 B, forse 4 PG su 5 | medio: un client più vecchio legge una voce compatta come vuota (vale per tutte le codifiche della stanza); va provato sul ripristino dei `null`, perché `mergeProfile` tratta un campo assente come «tieni il default» |
| B2. Più budget alle schede, preso da altri domini (`room-memory` 2.700, `registry` 2.550, `actor-vitals` 2.500) | +1.000 B = circa 1 PG in più | medio: quei domini cominciano a scartare prima (PF ricordati, fazioni) |
| B3. Precedenza nel budget ai PG della scena corrente invece che ai più recenti | nessuna capienza in più, ma resta fuori chi non gioca oggi | basso-medio |

Con il tavolo attuale (un solo laptop, finestra del GM sempre nello stesso browser) la copia della stanza serve poco. La copia del browser ha già tutto e i giocatori leggono dal token. La copia della stanza conta solo se il GM cambia browser o dispositivo, o se svuota i dati del sito.

## Decisioni

| # | Domanda | Proposta |
| --- | --- | --- |
| D1 | Fare A (nella stanza solo le schede usate in quella stanza)? | **sì** |
| D2 | Le voci di altre campagne già salvate nella stanza oggi: pulirle? | **no**: sono le più vecchie e il budget le fa uscire per prime. Al massimo compaiono un'ultima volta nell'avviso. Riconoscerle davvero è impossibile, perché il plugin vede solo i token della scena aperta |
| D3 | Far entrare il gruppo intero (B)? | **B0 adesso**. B1 e B3 come lotto separato, se si gioca online con il GM su più dispositivi |
| D4 | L'avviso | oggi ricompare a ogni ricarica della pagina del GM, una volta per insieme di nomi. Proposta: **una volta per insieme e per stanza, ricordata nel browser**. Con un solo browser il dato non si perde, quindi ripeterlo è rumore |

## Esito (7 novembre 2026)

L'utente ha approvato D1–D4 come proposte.

**D1.** `roomScopedInitiativeCardRegistry()` in `initiativeCardRegistryCore.js` sceglie cosa va nella stanza. `updateRoomCards()` le passa il registro unito e quello di partenza, poi codifica nella stanza solo il risultato.

**D2 e D3.** Nessun codice.

**D4.** `noticeDroppedRoomCards()` ricorda l'insieme già mostrato, per stanza (`OBR.room.id`), in `localStorage` alla chiave `…/initiativeCards/droppedNotice`, per le ultime 20 stanze. Senza `localStorage` vale solo la memoria della pagina, come prima.

Quando nessuna scheda viene più scartata, il ricordo di quella stanza si cancella. Se il registro torna pieno, l'avviso ricompare.

Test:

- `initiativeCardRegistryCore.test.js`: «D1 registro schede»;
- `initiativeCardSaveTransportRegression.test.js`: «D1 registro schede» e «D4 registro schede».

Senza la patch falliscono entrambi.

Resta la prova in stanza. La prima volta l'avviso può elencare ancora le schede di altre campagne già salvate nella stanza (D2).
