# ARCH-003 — Effects Mutation Coordinator

## Scopo e proprietà

ARCH-003 coordina le scritture persistenti di `conditions`,
`com.thebigpicture.initiative/spells` e
`com.thebigpicture.initiative/concentration`. La lane è unica per runtime GM e
vive esclusivamente in `background.html`; gli iframe UI non istanziano un
coordinatore e non hanno un fallback di commit locale.

`src/effectsMutationBroker.js` possiede il routing background, l'identità della
scena e la deduplicazione per `commandId`. `src/effectsMutationCoordinator.js`
possiede la coda seriale. `src/effectsMutations.js` legge gli item, prepara il
piano e applica il commit. `src/effectsMutationCore.js` e
`src/effectsMutationUndoCore.js` contengono la pianificazione pura di apply e
Undo.

Il flusso persistente è:

1. l'iframe richiede al background l'identità della scena corrente;
2. invia un comando JSON-safe, senza callback o funzioni;
3. il broker verifica l'identità e deduplica il `commandId`;
4. il comando entra nella sola lane background;
5. soltanto alla testa della lane vengono riletti gli item correnti;
6. il piano viene costruito sullo stato appena letto e prevalidato;
7. immediatamente prima del commit canonico vengono ricontrollati identità
   scena ed epoch del background;
8. i side effect di zona già prevalidati vengono eseguiti dopo il commit con
   operazioni idempotenti e con un nuovo controllo scena prima di ogni write;
9. dopo il commit e i side effect viene registrata una sola entry History
   logica.

Non vengono confrontati epoch numerici prodotti da iframe diversi. L'epoch
ARCH-001 usato per il commit è quello locale al background; l'identità opaca
della scena è emessa e validata dallo stesso background. Un unload invalida
identità, cache dei risultati, History pendente e comandi non ancora
committati.

## Comandi e risultati

`runEffectsMutation(operations, options)` e `undoEffectsMutation(entries,
options)` accettano soltanto strutture JSON-safe. Funzioni, simboli, `BigInt`,
valori numerici non finiti, cicli e istanze non plain-object vengono rifiutati
prima del broadcast. Le proprietà `undefined` vengono eliminate dalla
normalizzazione JSON e non attraversano il trasporto.

I risultati distinguono:

- `applied`: il commit è avvenuto;
- `rejected`: comando di una scena non più corrente per il quale nessuna
  scrittura è stata autorizzata;
- `conflict`: una precondizione o l'Undo atomico non è applicabile;
- `failed`: errore precedente a qualunque scrittura persistente.

Una scrittura già conclusa non viene mai retrocessa a `rejected` o `failed`:
il risultato resta `applied`. Se il confine scena cambia dopo il commit,
l'eventuale History viene marcata come non registrabile nella nuova scena. Se
History o un side effect successivo falliscono nella stessa scena, il risultato
riporta l'errore post-commit e il lavoro pendente senza negare il commit.

Un errore SDK non blocca la lane. Lo stesso `commandId` non viene applicato due
volte anche se due iframe consegnano lo stesso comando o una risposta viene
ritentata.

## Writer migrati

Passano nella lane background:

- tutte le API persistenti di `conditions.js`;
- writer di spell e concentrazione in `spells.js`, pannelli, context menu,
  tracker e active actions;
- riconciliazione zero HP e automazioni di condizioni;
- membership di aura e zone che modifica effetti sui token;
- scadenze di round e confine turno;
- `initiativeCards` per la riconciliazione dell'Indebolimento;
- attivazione, disattivazione e riconciliazione post-rimozione di effetti in
  `classFeatureRuntime`.

`classFeatureRuntime` può ancora scrivere direttamente stato e risorse delle
Capacità che non modificano effetti: sono domini fuori da ARCH-003. La sua
riconciliazione post-rimozione calcola soltanto i valori desiderati durante la
preparazione; il commit di `classFeatureState`, dell'eventuale Indebolimento e
della rimozione originaria viene eseguito in una sola `updateItems` dal writer
background e confluisce nella stessa entry History.

Gli item visuali di aura e zona restano di proprietà dei controller esistenti.
Quando la loro creazione, rimozione o scelta di regola fa parte di una
mutazione effetti, il comando trasporta un descrittore serializzabile e il
background lo predispone nella stessa lane. Il commit effects precede i side
effect. Rimozione zona, scelta della regola e restore Undo sono idempotenti:
un errore successivo al commit viene riportato in `postCommitErrors`, resta
`applied` ed è ritentato prima del comando successivo o della riconsegna dello
stesso `commandId`. I retry sono eliminati al cambio scena, quindi un lavoro
nato nella scena A non può essere applicato nella B.

La Console HP mantiene il writer HP esistente, fuori dallo scope ARCH-003. Le
operazioni effects collegate sono accodate come un unico comando e la singola
entry composita viene decorata nel formato `effectsMutation`, usando il piano
reale del background per i campi effects e snapshot field-scoped per HP.

## History

Ogni comando autonomo produce al massimo una entry con:

```js
{
  commandId,
  correlationId,
  commandType,
  sceneEpoch,
  sceneIdentity,
  targetIds,
  fields,
  changes: [{ id, fields, before, after }],
  sideEffects
}
```

`before` e `after` contengono soltanto i campi posseduti. Le modifiche
metadata composite necessarie a `initiativeCards` o alle Capacità usano
snapshot `{ present, value }` per campo; non viene ripristinato l'intero
metadata del token.

L'ID History derivato dal `commandId` rende l'append idempotente. Se l'append
fallisce dopo il commit, il risultato resta `applied` con `historyPending` e
`historyError`; il background ritenta dopo un breve intervallo, prima del
comando successivo o della riconsegna dello stesso comando. Se un side effect
è pendente, la History attende il suo esito per registrare il before/after
reale. Una History recuperata non riapplica la mutazione.

## Undo

Undo è un comando della stessa lane. `effectsMutationUndoCore.js` simula tutto
il batch in ordine inverso e prevalida ogni target prima di qualsiasi scrittura.
Sono supportati batch misti di entry `effectsMutation` e entry legacy che
toccano effetti. Le chiavi legacy di conditions, spells e concentration sono
convertite negli stessi campi logici delle entry nuove.

Se un solo campo o target non corrisponde all'`after` registrato, l'intero batch
ritorna `conflict` e non scrive nulla. Campi metadata estranei, posizione e
altre proprietà non possedute vengono ignorati. Per una zona aggiornata viene
confrontata soltanto la relativa chiave metadata; per una zona eliminata viene
prevalidata l'assenza dell'item.

La rimozione delle entry History dopo un Undo riuscito è idempotente. Errori di
sincronizzazione derivata, Combat Log o cleanup History successivi al commit
sono restituiti come `postCommitErrors`: l'Undo resta `applied` e non dichiara
falsamente che la scrittura non sia avvenuta. Ripetere lo stesso Undo usa un
`commandId` deterministico e non ripristina due volte gli item.

## Limiti dichiarati

- ARCH-003 non coordina due sessioni GM indipendenti; ciascuna ha il proprio
  background persistente.
- Il protocollo non sostituisce ARCH-002 e non introduce un writer globale per
  gli altri domini metadata.
- Stato e risorse delle Capacità, HP puro, iniziativa, movimento, clocks e
  rendering restano fuori dalla lane salvo i campi strettamente necessari a
  una singola operazione composita che modifica anche effetti.
- Gli errori SDK che non dichiarano se una propria scrittura sia stata
  accettata restano un limite della semantica remota; ARCH-003 tratta i side
  effect successivi come operazioni idempotenti ritentabili e rende espliciti
  gli errori post-commit controllabili dal plugin.
