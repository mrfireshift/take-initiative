# Studio: dove vivono i dati degli attori

28 novembre 2026. Studio; il solo lotto R1 è stato poi applicato (vedi «Esito di R1» in fondo).

Segue [STUDIO_REGISTRO_SCHEDE_STANZA.md](STUDIO_REGISTRO_SCHEDE_STANZA.md) (7 novembre) e
[ACTOR-HP-PERSISTENCE.md](ACTOR-HP-PERSISTENCE.md).

## Il problema

Il GM perde dati quando aggiorna le schede, e i dati dei personaggi non passano bene da una scena all'altra.

## In breve

Il budget della stanza è solo una delle cause, e non la più grave.

Un personaggio non ha una casa sola. Ha una copia della scheda su ogni token di ogni scena, una nella stanza
(compressa, al massimo 4.450 byte per tutti) e una nel browser del GM. Le copie si allineano tardi, cioè solo
quando il GM apre la scheda, e a scheda intera, guardando l'orologio. Lo stato di gioco (slot, risorse, PF
temporanei) non ha nessuna copia fuori dal token.

Ho trovato nove difetti. Due li ho riprodotti con il codice vero: sono quelli che cancellano i dati.

## Come funziona oggi

| Dato | Token (per scena) | Stanza (16 kB in tutto) | Browser del GM |
| --- | --- | --- | --- |
| Scheda (CA, tiri salvezza, classi, talenti, incantesimi, azioni rapide, forme) | `meta.initiativeCard`, intera | `…/initiativeCards`, compressa, 4.450 B | `localStorage`, tutte le stanze insieme |
| Scheda di un mostro | intera | **no** | `localStorage` |
| PF e PF massimi | `meta.hp`, `meta.hpMax` | `…/actorVitals`, 2.500 B | `localStorage`, tutte le stanze insieme |
| Slot, risorse di classe, punti dei talenti | `meta.classFeatureState` | **no** | **no** |
| PF temporanei, tiri salvezza contro la morte | `meta.tempHp`, `meta.deathSaves` | **no** | **no** |
| Pill, concentrazione, incantesimi attivi | `meta.conditions`, `…/spells`, `…/concentration` | **no** | **no** |

Il limite di Owlbear vale per la stanza intera, estensioni altrui comprese: «In total the room metadata must be
under 16kB», pensata per «small bits of stored data» (documentazione ufficiale, pagina Room). Per i metadata
della scena e dei token la documentazione non scrive limiti.

## I difetti

### Cancellano dati

**P1. Un token preparato prima non viene mai riallineato da solo.** Riprodotto.
In una scena preparata in anticipo il token del PG porta la scheda di quel giorno. La scheda più nuova del
registro arriva sul token solo in due casi:

- il GM apre la scheda di quel personaggio ([initiative-card-modal.js:5620](../src/initiative-card-modal.js));
- il token entra in iniziativa **e non ha azioni rapide**
  ([initiativeCardRegistryCore.js:461](../src/initiativeCardRegistryCore.js)).

Un PG vero ha sempre azioni rapide, quindi il secondo caso non scatta. Console, pannello incantesimi e tracker
leggono il token: nella scena nuova il personaggio combatte con la scheda vecchia. I PF invece vengono
riallineati all'apertura della scena (`reconcileSceneItems` in `actorVitalsStore.js`): per le schede manca
l'equivalente.

**P2. Un salvataggio partito da un token vecchio sovrascrive la scheda nuova nel registro.** Riprodotto.
`saveInitiativeCard` parte dalla scheda del token ([initiativeCards.js:946](../src/initiativeCards.js)) e
scrive il risultato nel registro con l'ora di adesso (riga 993). Non controlla se il registro ha una versione
più nuova. Prova: registro con CA 18 e guerriero di 5° livello, token con CA 14 e 2° livello; dopo un «Usa e
salva» di una forma dalla console il registro ha CA 14, 2° livello e CD degli incantesimi vuota.

Chi salva senza aprire la scheda:

- il riposo lungo, quando toglie un livello di Indebolimento ([group-rest.js:109](../src/group-rest.js));
- «Usa e salva» delle forme dalla console
  ([pcAttackTransformationField.js:216](../src/pcAttackTransformationField.js)).

Da quel momento la versione vecchia è la più recente per l'orologio, e vince anche nella scena di partenza.
P1 e P2 insieme spiegano «aggiorno la scheda e poi i dati spariscono», anche con il budget libero.

**P3. Più pagine scrivono lo stesso registro, ognuna con la sua coda.** Letto nel codice, non riprodotto.
Scheda, tracker, sfondo, riposo, console e Opzioni sono iframe diversi. Ognuno legge tutto il registro, lo
modifica e lo riscrive intero ([initiativeCards.js:492](../src/initiativeCards.js)). La coda
(`initiativeCardWriteQueue`) vale solo dentro la pagina. Due scritture vicine da due pagine: la seconda cancella
la prima, nella stanza e nel browser. Vale anche per `actorVitals` e `hpMemory`.

### Non attraversano le scene

**P4. Lo stato di gioco resta sul token.** Verificato nel codice.
Slot spesi, Ira, Ki, Incanalare divinità, Imposizione delle mani, punti Fortuna, PF temporanei, tiri salvezza
contro la morte, pill, concentrazione: niente di questo è copiato fuori dal token. Nella scena dopo il token è
un altro e parte con tutto al massimo (`current ?? maximum`, [classFeatureCore.js:343](../src/classFeatureCore.js)).
Anche il riposo vale solo per i token della scena aperta.

Un ripristino dei PF sopra 0 cancella inoltre il conto dei tiri salvezza contro la morte
([actorVitalsStore.js:149](../src/actorVitalsStore.js)).

### Il budget

**P5. Un gruppo vero non entra più.** Misurato con la codifica reale della stanza.

| PG di 9° livello | Sul token | Nella stanza, compresso |
| --- | --- | --- |
| Paladino (3 armi, 14 incantesimi, 2 talenti) | 2.208 B | 1.140 B |
| Druido della Luna (18 incantesimi, **6 forme**) | 6.969 B | 2.412 B |
| Ladro (3 armi, 3 talenti) | 1.249 B | 768 B |
| Mago (32 incantesimi) | 2.195 B | 1.228 B |
| Chierico (22 incantesimi) | 1.898 B | 1.112 B |
| Bardo (16 incantesimi) | 1.755 B | 1.040 B |
| **Tutti e sei** | | **4.732 B su 4.450** |

Il 7 novembre la compressione faceva entrare circa otto PG. Talenti e forme rapide (fino a 6.000 B per scheda,
`MAX_TRANSFORMATION_FORMS_BYTES`) hanno già consumato il margine. Ogni funzione nuova della scheda lo riapre.

I budget dei domini sommano 14.490 B su 14.500 «sicuri»
([roomMetadataBudget.js:13](../src/roomMetadataBudget.js)). Per le altre estensioni della stanza restano 10 B
prima che il plugin cominci a stringere i propri dati.

**P6. All'avvio la stanza viene potata senza avviso.**
`reconcileRoomMetadataBudget` ([background.js:109](../src/background.js)) riduce le chiavi oltre il loro
budget. Se il totale della stanza supera 14.500 B, le riduce tutte in proporzione, anche fino a zero
(`compactOwnedRoomMetadata`). Scrive solo un `console.warn`. L'avviso «Registro delle schede pieno» parte solo
da `updateRoomCards`, non da qui.

**P7. PF e fazioni di tutte le stanze finiscono in ogni stanza.**
È il difetto corretto il 7 novembre per le schede (D1), ancora presente per `actorVitals`
([actorVitalsStore.js:293](../src/actorVitalsStore.js)) e `hpMemory` ([hpMemory.js:167](../src/hpMemory.js)):
la copia del browser non è divisa per stanza e viene spinta intera nella stanza.

### La copia nel browser

**P8. È una sola chiave di `localStorage`, senza limite e senza avvisi.**
Contiene tutte le schede di tutte le stanze, mostri compresi (uno statblock importato vive solo lì e sul
token). Se la scrittura fallisce, la funzione restituisce `false` e nessuno lo dice
([initiativeCards.js:385](../src/initiativeCards.js)). Lo stesso per `actorVitals`, `hpMemory` e fazioni.

**P9. Due origini, due copie.**
La build LOCALE (`localhost`) e quella di produzione (`onrender.com`) hanno `localStorage` separati. Una scheda
aggiornata con una e lasciata fuori dalla stanza dal budget non esiste per l'altra, che ha la sua copia vecchia.
Vale anche per un altro browser o dopo aver svuotato i dati del sito. I conflitti si risolvono a scheda intera,
con l'orologio del computer (`updatedAt`).

## La causa comune

Tre copie alla pari, nessuna che comandi. Le regole di oggi (vince la più recente, la stanza tiene le ultime,
il browser tiene tutto) coprono i casi semplici. Un token vecchio, una pagina in più o un byte di troppo bastano
a far vincere la copia sbagliata.

Una soluzione definitiva ha quattro parti. Le prime tre servono con qualunque archivio:

1. **Una casa sola per attore**, trovata con `actorProfileId`. I token sono copie di lavoro.
2. **Riallineamento all'apertura della scena**, come già fanno i PF. Toglie P1.
3. **Un solo scrittore e un numero di revisione** al posto dell'orologio; ogni salvataggio parte dall'archivio.
   Toglie P2, P3 e metà di P9.
4. **Un posto senza il tetto dei 16 kB**. Toglie P5–P8 e rende possibile P4.

## Le alternative

### A. Stringere ancora la stanza

La stanza resta l'archivio. Si tolgono le forme dalla copia della stanza, si applicano le leve L1–L4 dello
studio del 7 novembre, si ridistribuiscono i budget e si correggono P1–P3 e P6–P8.

| | |
| --- | --- |
| Capienza | circa +30–40 %: sei PG senza forme oggi pesano 3.432 B |
| Stato di gioco (P4) | non entra |
| Altri dispositivi | sì, per quello che entra |
| Costo | medio |
| Limite | il tetto resta; ogni funzione nuova della scheda riapre il problema |

Non è definitiva.

### B. Archivio nel browser del GM

Un archivio in IndexedDB, una voce per attore: scheda, PF, stato di gioco, revisione. Lo scrive una sola
pagina, lo sfondo del GM; le altre glielo chiedono, come già fa la Cronologia (`historyOwner.js`, ARCH-009).

- **Token:** restano come oggi, con la scheda intera. I giocatori leggono da lì. Lo sfondo li riallinea
  all'apertura della scena.
- **Stanza:** un indice piccolo (attore → revisione e nome, circa 60 B l'uno) e, finché c'è posto, la copia
  compressa dei PG del gruppo. La copia serve da ponte verso un altro browser. L'indice permette di dire «questo
  browser non ha l'ultima versione di Brina» invece di usare in silenzio quella vecchia.
- **File:** esporta e importa l'archivio, per cambiare computer e come copia di riserva.

| | |
| --- | --- |
| Capienza | senza tetto pratico; mostri e forme compresi |
| Stato di gioco (P4) | sì |
| Altri dispositivi | solo ciò che portano stanza e token; il resto con il file |
| Costo | alto, ma su una strada già percorsa (ARCH-009 per la Cronologia) |
| Limite | l'archivio è di un browser e di un'origine: LOCALE e produzione ne hanno due; svuotare i dati del sito lo cancella (restano token, stanza e file) |

Corrisponde al tavolo di oggi: un solo laptop, il GM sempre nello stesso browser.

### C. Archivio online

Un piccolo servizio con un database, una voce per stanza e attore. Il plugin legge e scrive lì; il browser tiene
una copia per lavorare senza attese.

| | |
| --- | --- |
| Capienza | senza tetto |
| Stato di gioco (P4) | sì |
| Altri dispositivi | sì, tutti, e anche LOCALE e produzione insieme |
| Costo | il più alto: un servizio da pubblicare, proteggere e tenere in vita |
| Limite | Render oggi pubblica solo file statici, serve un altro fornitore; Owlbear non dà un segreto lato server, quindi una chiave d'accesso tenuta nella stanza la leggono anche i giocatori; se il servizio è giù, serve comunque la copia nel browser |

Ha senso con il GM su più dispositivi o con il prodotto standalone.

### Scartata: la scena come archivio

I metadata della scena non hanno il tetto dei 16 kB, ma il plugin scrive solo nella scena aperta. Per portare
un dato nella scena dopo serve comunque un ponte, cioè una delle tre strade sopra.

## Raccomandazione

**B, costruita dietro un'interfaccia** (leggi attore, scrivi attore, elenca), con la copia della stanza tenuta
come ponte. C si potrà aggiungere dopo come seconda destinazione dello stesso archivio, senza rifare il resto.

**Prima di tutto il lotto R1**, che ferma le perdite e non dipende dalla scelta.

| Lotto | Cosa | Toglie | Rischio |
| --- | --- | --- | --- |
| R0 | Misura: in Opzioni, byte per chiave della stanza, chi è fuori, stato della copia locale. Avviso al GM per la potatura all'avvio e per una scrittura locale fallita | P6, P8 (visibilità) | basso |
| R1 | Il salvataggio parte dalla copia più nuova tra token e registro. Riallineamento delle schede all'apertura della scena. `actorVitals` e `hpMemory` divisi per stanza | P1, P2, P7 | medio: tocca la riconciliazione dei metadata |
| R2 | Archivio degli attori in IndexedDB, scrittore unico, revisioni, indice nella stanza. Le schede dei mostri ci entrano | P3, P5, P8, P9 in parte | alto: va a passi, con il vecchio registro letto in parallelo |
| R3 | Stato di gioco nell'archivio e ripristino sul token della scena nuova | P4 | alto: tocca `classFeatureState` e i PF |
| R4 | Esporta e importa l'archivio su file | P9 | basso |
| R5 | Archivio online (C), se serve | P9 | a parte |

Per AGENTS.md: R1–R3 toccano la riconciliazione dei metadata e stanno accanto alla sincronizzazione dei PF.
Ogni lotto va fatto con i suoi test e con la prova in stanza, senza toccare `initiativeList.js` oltre i due
punti che chiamano il ripristino.

## Decisioni

| # | Domanda | Proposta |
| --- | --- | --- |
| D1 | Quale strada | **B**, con l'interfaccia che lascia aperta C |
| D2 | R0 e R1 subito, prima dell'archivio | **sì** |
| D3 | Quale stato di gioco segue il personaggio | **slot, risorse di classe e dei talenti, PF temporanei, tiri salvezza contro la morte**. Pill, concentrazione e incantesimi attivi restano della scena |
| D4 | La copia compressa del gruppo resta nella stanza come ponte | **sì**, con precedenza ai PG assegnati a un giocatore |
| D5 | Le schede dei mostri entrano nell'archivio | **sì** |
| D6 | Il GM usa più browser o dispositivi sulle stanze di campagna? E la build LOCALE sulle stesse stanze? | da sapere: decide quanto contano il ponte e C |

## Cosa non so ancora

- **La stanza vera.** Non ho letto i metadata della stanza di campagna: non so quanto occupano le altre
  estensioni né quali schede sono fuori oggi. R0 lo mostra. Per la sola copia nel browser, nella console con il
  contesto `background.html`:

  ```js
  Object.keys(localStorage).filter((key) => key.startsWith("com.thebigpicture.initiative"))
    .map((key) => [localStorage.getItem(key).length, key]).sort((a, b) => b[0] - a[0])
    .forEach(([size, key]) => console.log(size, key));
  ```

- **Il peso dello stato di gioco** (`classFeatureState`) per un PG: da misurare prima di R3.
- **P3** è letto nel codice. Non l'ho riprodotto con due pagine vere.
- **Le schede della misura** sono costruite da me con le funzioni del progetto, non sono quelle del gruppo.

## Come ho misurato

- Pesi: script usa e getta fuori dal repository, con `encodeInitiativeCardRegistryForRoom` e
  `packInitiativeCardRegistryForRoom`. Le forme sono sei bestie del Manuale dei Mostri passate da
  `sanitizeTransformationForms`.
- P1 e P2: due test usa e getta fuori dal repository, sull'impalcatura di
  `test/initiativeCardSaveTransportRegression.test.js`.
- Limiti di Owlbear: pagine Room, Scene, Items, Player e Metadata di docs.owlbear.rodeo, lette il 28/11/2026.

## Esito delle decisioni (28 novembre 2026)

| # | Risposta dell'utente |
| --- | --- |
| D1 | **L'archivio deve essere online, non dipendere dal browser.** Serve solo a lui e può stare su un suo NAS. La casa dei dati è quindi l'archivio online; nel browser resta al più una copia di lavoro, mai una seconda autorità. Da confermare: se la copia di lavoro è accettata (vedi sotto) |
| D2 | R0 e R1 subito: **sì, se necessario** |
| D3 | **Approvata:** slot, risorse di classe e dei talenti, PF temporanei, tiri salvezza contro la morte seguono il personaggio; pill, concentrazione e incantesimi attivi restano della scena |
| D4 | **Approvata:** la copia compressa del gruppo resta nella stanza, con precedenza ai PG assegnati a un giocatore |
| D5 | **Approvata:** le schede dei mostri entrano nell'archivio |
| D6 | Due computer (laptop e workstation fissa). **La build LOCALE non la usa**: P9 si riduce ai due computer |

**Cosa cambia rispetto alla raccomandazione.** Avevo proposto l'archivio nel browser come casa e il NAS come
seconda destinazione. Con D1 i ruoli si rovesciano: la casa è il NAS, e il browser tiene solo una copia di
lavoro e la coda delle scritture non ancora arrivate. Svuotare i dati del browser non fa perdere niente, salvo
le scritture in coda.

La copia di lavoro non si può togliere del tutto: senza, una caduta della linea o del NAS a metà sessione
lascerebbe il plugin senza archivio. Le revisioni per attore restano necessarie, perché sono il modo in cui il
NAS rifiuta una scrittura partita da una versione vecchia.

**La prova di raggiungibilità del NAS** è preparata a parte, fuori dal repository.

**R1 ridotto.** La parte su `actorVitals` e `hpMemory` divisi per stanza (P7) esce da R1: tocca la persistenza
dei PF e diventa inutile quando i PF passano all'archivio. Restano la correzione del salvataggio (P2) e il
riallineamento all'apertura della scena (P1).

## Esito di R1 (28 novembre 2026)

L'utente ha dato il via. Le modifiche sono in `src/initiativeCards.js` e `src/background.js`.

**R1a, il salvataggio.** `saveInitiativeCard` parte dalla scheda del registro quando è più nuova di quella del
token (`newerRegistryCardProfile`). Vale solo se:

- il token ha già una scheda (un token senza scheda segue la strada di prima);
- la voce del registro non è una cancellazione e non è di un altro attore;
- non è lo statblock di un mostro trovato per nome da un suo omonimo.

Con `preserveExhaustion` l'Indebolimento di base tenuto è quello della scheda più nuova.

**R1b, l'apertura della scena.** `realignStaleInitiativeCards`, chiamata dallo sfondo del GM all'avvio e a ogni
scena pronta, dopo il coordinatore degli effetti. Riallinea i token che hanno una scheda più vecchia del
registro e lo stesso `actorProfileId`. Usa la scrittura dell'apertura della scheda (`loadInitiativeCard` con
`hydrate`), senza voce nella Cronologia. Un token già allineato non viene scritto: dopo il riallineamento token
e registro hanno la stessa data, quindi non c'è ciclo.

**Cosa R1 non copre:**

- un token incollato a scena già aperta: si riallinea alla prossima apertura della scena o aprendo la scheda;
- i token senza `actorProfileId` e i mostri;
- P3 (più pagine che scrivono): resta da fare. Per R0 vedi «Esito di R0».

**Test:** quattro in `test/initiativeCardSaveTransportRegression.test.js` («R1a», «R1b»). Suite completa verde,
6.636 test; build riuscita in una cartella temporanea.

**Prova in stanza: passata dall'utente il 28/11**, con la build locale. Due scene con un token dello stesso PG,
quello della scena B copiato prima di cambiare la scheda:

1. in A un'arma rinominata e la CA cambiata; aperta B, la console attacchi ha il nome nuovo senza aprire la
   scheda, e la scheda ha la CA nuova;
2. due livelli di Indebolimento dati in A: all'apertura di B il token ha la pill Indebolimento 2;
3. dopo l'apertura di B la Cronologia non ha voci «Scheda personaggio aggiornata»;
4. riposo lungo in B e ritorno in A: la scheda ha ancora l'arma rinominata e la CA nuova, con un livello di
   Indebolimento in meno.

## Esito di R0 (28 novembre 2026)

Ridotto, d'accordo con l'utente, al solo avviso della potatura all'avvio (P6). La misura in Opzioni e l'avviso
per una scrittura locale fallita (P8) non sono stati fatti: con l'archivio online come casa dei dati pesano meno.

- `compactOwnedRoomMetadata` (`src/roomMetadataBudget.js`) restituisce anche `previousValues`: ciò che ogni
  chiave riscritta conteneva prima. Cosa viene potato non cambia.
- `roomBudgetPruningNotice` (`src/roomBudgetNoticeCore.js`, nuovo) scrive la frase: le schede per nome (le prime
  quattro, le altre contate), poi quanti PF ricordati, fazioni e giocatori assegnati sono usciti dalla stanza.
  Una chiave solo riscritta in un'altra forma, senza voci tolte, non dà nessun avviso.
- `reconcileRoomMetadataBudget` (`src/background.js`) mostra la frase al GM dopo la compattazione.

Esempio: «Memoria della stanza piena. Tolti dalla stanza all'avvio: le schede di Dalia e Elric, i PF ricordati
di 3 personaggi e 2 fazioni ricordate. In questo browser restano le copie già salvate.»

Dopo la potatura la stanza sta nel budget, quindi l'avviso non torna al riavvio successivo, a meno che la
stanza si riempia di nuovo.

**Test:** quattro in `test/roomBudgetNoticeCore.test.js`. Suite completa verde, 6.641 test; build riuscita in
una cartella temporanea. **In stanza non è stato provato:** serve una stanza oltre il budget.
