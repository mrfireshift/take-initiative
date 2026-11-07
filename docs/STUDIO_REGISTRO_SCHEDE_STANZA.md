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

# Seconda parte: far stare tutto il gruppo

7 novembre 2026. Studio chiesto dall'utente dopo D3: «Preferirei farli stare tutti», senza peggiorare le prestazioni. Nessun codice è cambiato.

## Le misure

Le misure vengono da script usa e getta fuori dal repository, che usano la codifica reale della stanza (`encodeInitiativeCardRegistryForRoom`). I tre gruppi:

- **d'esempio:** cinque PG di 5° livello, quello della prima parte;
- **pesante:** sei PG di 11° livello con 3 armi, 2 incantesimi rapidi e una capacità ciascuno; le schede si somigliano molto;
- **vario:** sei PG di 9° livello, tutti diversi, con incantesimi veri presi a caso dal catalogo (319), armi e numeri diversi. È il caso più sfavorevole per la compressione e il più vicino a un gruppo vero.

| Leva | d'esempio (5 PG) | pesante (6 PG) | vario (6 PG) |
| --- | --- | --- | --- |
| oggi | 7.026 B | 13.019 B | 12.300 B circa |
| L1: azioni rapide senza i valori che `sanitizeQuickAction` rimette da solo | 6.603 | 11.009 | — |
| + L2: profilo senza campi nulli o vuoti, tiri salvezza in array | 5.608 | 9.815 | — |
| + L3: alias del nome dentro la voce invece che come voce a parte | 4.853 | 8.909 | — |
| + L4: `actorProfileId` scritto una volta sola | 4.628 | 8.643 | — |
| **C: compressione (deflate + base64) della codifica di oggi** | **1.578** | **1.946** | **3.222 (26 %)** |
| C con L1–L4 | 1.334 | 1.622 | — |

Il budget è di 4.450 B.

- **Le leve L1–L4** tolgono il 34 %. Bastano appena per cinque PG di 5° livello, non per sei di livello più alto.
- **La compressione** porta sei PG di 9° livello tutti diversi a circa 540 B l'uno: nel budget di oggi ne entrano circa otto.
- **L1–L4 prima di comprimere** aggiungono solo il 10–15 %, perché la compressione toglie già le ripetizioni.

## Le strade

| Strada | Quanti PG | Costo e rischio |
| --- | --- | --- |
| B1. Leve L1–L4 | 5 piccoli, non 6 grandi | medio-alto. In lettura vanno ricostruite le forme esatte. Esempio: un'azione incantesimo senza `launchMode` è letta come vecchio formato (`hasLegacyQuickActionStorage`). Un campo assente in `mergeProfile` vuol dire «tieni il default», non `null` |
| B2. Byte presi da altri domini | +1 PG circa | medio: PF ricordati, fazioni o vitali cominciano a scartare prima |
| **C. Compressione** | **circa 8** | basso-medio, vedi sotto |

## Come sarebbe la compressione

1. **Cosa si scrive.** Il valore alla chiave `com.thebigpicture.initiative/initiativeCards` diventa un oggetto con un campo di versione e il registro di oggi compresso in base64. La chiave non cambia.
2. **JSON stabile.** Prima di comprimere il registro diventa un JSON con le chiavi in ordine fisso. Due registri uguali danno così la stessa stringa, e `skipUnchanged` continua a evitare la scrittura a ogni apertura della scheda. Senza questo passo ogni apertura riscriverebbe la stanza.
3. **Lettura.** `decodeInitiativeCardRegistryFromRoom` accetta i due formati: compresso e quello di oggi. Una stanza vecchia si legge com'è e passa al formato compresso alla prima scrittura.
4. **Budget.** La scelta di cosa tenere resta la stessa: le voci più recenti, gli alias con la loro voce, l'avviso D9. Cambia la misura: si conta la stringa compressa. Il numero di voci si sceglie con una ricerca binaria, circa 4–5 compressioni, e solo quando il registro supera il budget.
5. **Controllo all'avvio** (`reconcileRoomMetadataBudget` in `background.js`). Usa la stessa funzione. Se il valore compresso sta nel budget lo restituisce identico, senza decomprimere.
6. **Cosa non cambia.** La copia nel browser e i token restano non compressi. Restano uguali anche le altre chiavi della stanza e il budget di 4.450 B.

### La libreria

Le funzioni di budget (`planRoomMetadataWrite`, `compactOwnedRoomMetadata`) sono sincrone. La compressione nativa del browser (`CompressionStream`) è asincrona e lì non entra senza riscriverle.

| Opzione | Rapporto | Note |
| --- | --- | --- |
| **fflate** (libreria MIT, sincrona, senza dipendenze) | come deflate: 26 % | una dipendenza nuova, circa 8 KB nei pacchetti che leggono il registro (scheda, sfondo) |
| Compressore LZ scritto nel progetto (tipo lz-string) | 35–40 % circa | nessuna dipendenza, ma circa 200 righe da mantenere |
| `CompressionStream` nativo | 26 % | nessuna dipendenza; obbliga a toccare le funzioni di budget comuni a tutti i domini |

## Prestazioni

| Momento | Oggi | Con la compressione |
| --- | --- | --- |
| Codifica per la stanza a ogni scrittura | 1,4–1,7 ms, quasi tutto per le capacità di default | + 0,06–0,08 ms con zlib nativo; con fflate stimati 0,2–0,4 ms, **da misurare nel primo passo** |
| Lettura del registro (apertura scheda, velocità, azioni rapide) | parse del JSON | + circa 0,06 ms (decompressione e parse) |
| Scrittura oltre il budget | un ciclo sulle voci | 4–5 compressioni: circa 1–2 ms |
| Byte inviati a ogni scrittura della chiave | fino a 4.450 | circa un quarto per lo stesso gruppo |
| Apertura della scheda con la stanza già allineata | nessuna scrittura | nessuna scrittura (JSON stabile) |

Nessun ascoltatore dei cambi della stanza legge questa chiave (verificato: la leggono solo `initiativeCards.js` e il controllo all'avvio). Il costo resta legato alle aperture e ai salvataggi delle schede.

## Rischi

- **Client vecchi.** Una pagina ancora aperta con la versione di prima vede un registro vuoto. Se è il GM e salva una scheda, riscrive la chiave nel formato vecchio. Il client nuovo lo legge comunque e lo ricomprime alla prima scrittura: non si perde niente che quel client non avesse già. Con un solo deploy alla volta il caso è raro.
- **Leggibilità.** Nella console la chiave non si legge più a occhio: serve una riga per decomprimerla, da aggiungere al documento delle istruzioni del banco.
- **Test.** I test che leggono `room.metadata[ROOM_CARD_KEY].hero` direttamente vanno adattati per decodificare prima. I `ROOM-BUDGET-*` devono restare verdi.

## Decisioni (seconda parte)

| # | Domanda | Proposta |
| --- | --- | --- |
| C1 | Quale strada | **C, solo compressione**. B1 costa più di quanto rende dopo la compressione; B2 non serve |
| C2 | Quale libreria | **fflate**, sincrona: le funzioni di budget restano come sono |
| C3 | Formato e compatibilità | **stessa chiave**, oggetto con versione, lettura dei due formati, passaggio alla prima scrittura |
| C4 | Budget del dominio | **resta 4.450 B**: nessun byte tolto agli altri |
| C5 | Oltre circa 8 PG | **come oggi**: restano le voci più recenti e l'avviso, una volta per stanza |

## Esito della seconda parte (7 novembre 2026)

L'utente ha approvato C1–C5 come proposte.

- **Dipendenza:** `fflate` 0.8.3 (MIT), versione esatta in `package.json`. Comprimere 4,4 KB di registro costa 0,17 ms, decomprimere e rileggere 0,18 ms.
- **Funzioni nuove in `initiativeCardRegistryCore.js`:**
  - `packInitiativeCardRegistryForRoom`: JSON con le chiavi in ordine fisso, deflate livello 9, base64 → `{ v: 2, deflate }`;
  - `unpackInitiativeCardRegistryFromRoom`: un valore illeggibile vale come registro vuoto;
  - `isPackedInitiativeCardRegistry`.
- **Lettura:** `decodeInitiativeCardRegistryFromRoom` decomprime prima di risolvere gli alias e accetta ancora il formato di prima.
- **Budget:** `retainInitiativeCardRegistryWithinByteBudget` restituisce identico un valore già nel budget. Altrimenti tiene le voci più recenti misurando nel formato del valore: un registro compresso resta compresso. `droppedInitiativeCardRegistryNames` legge i due formati. Il controllo all'avvio (`background.js`) usa la stessa funzione e non è cambiato.
- **Scrittura:** `updateRoomCards()` comprime il registro della stanza prima di scriverlo.
- **Test:**
  - `initiativeCardRegistryCore.test.js`: «C registro schede», tre test: rilettura e stessa stringa, budget sul valore compresso, sei PG di 9° livello tutti diversi che stanno nel budget solo compressi;
  - `initiativeCardSaveTransportRegression.test.js`: legge la stanza decompressa; gli avvisi L12 e D4 usano un libro di incantesimi casuale, che non si comprime.

Resta la prova in stanza: aprire e salvare le schede del gruppo e controllare che l'avviso non compaia più.
