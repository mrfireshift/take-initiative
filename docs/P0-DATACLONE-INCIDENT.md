# P0 — DataCloneError nei TS e nella concentrazione

## 1. Root cause

Boundary riprodotto: `commitEffectsMutationPlan()` → callback di `OBR.scene.items.updateItems()` → `normalizedSceneItem(item)` → `clone(instance)` → `structuredClone(instance)`.

L'SDK 3.1.0 esegue il callback con `produceWithPatches` di Immer 10.1.1 (`node_modules/@owlbear-rodeo/sdk/lib/api/scene/SceneItemsApi.js`). Il draft è un Proxy, non un normale oggetto metadata. Il valore canonico persistente è valido; è la sua rappresentazione temporanea nel callback a non essere structured-cloneable.

Path originale: `draft.metadata["com.thebigpicture.initiative/meta"].conditions.instances[i].saveReminder.resolution`. Dopo `getConditionInstances()`, l'argomento di clone è una condition plain con **`instance.saveReminder.resolution` ancora Proxy Immer**. Anche `resolution.success.actions` e le opzioni discendenti sono draft. `preserveConditionTimingMetadata()` copia superficialmente `saveReminder`; la copia non stacca il descriptor annidato. Il test usa la regola produttiva `eyebite-sickened` di `getSpellActiveResolutionActions("eyebite")`, corrispondente a Nauseato negli screenshot.

Secondo boundary della medesima classe, riprodotto durante l'audit richiesto: consume del reminder di zona → `sceneItemMetadataSnapshot(draft, metadataKey)` → `metadataFieldSnapshot()` → clone di `draft.metadata[metadataKey]`. Qui l'intero valore metadata è Proxy Immer. Impediva al consume di convergere anche al restart.

Il log browser colloca il fallimento fra mutation:plan e mutation:failed ma non contiene lo snapshot espanso né lo stack completo dell'eccezione. L'identificazione del path deriva dalla riproduzione con moduli produttivi e la libreria realmente usata dall'SDK, non da proprietà inventate per il mock.

## 2. Why it broke now

Il guard canonico che chiamava `normalizedSceneItem(item)` sul draft è già presente nel HEAD `356ef2a`, precedente alle modifiche non committate 05B/06/07. Non è il clone dell'envelope 05B a fallire nel primo caso: la failure avviene nel callback di commit, dopo la preparazione del recovery e prima delle scritture autorizzate. L'ipotesi iniziale di un runtime object persistito dall'envelope non è confermata.

Il guard di consume introdotto in 05B attraversava invece il secondo boundary incompatibile. Entrambi erano mascherati dai mock di updateItems che passavano oggetti plain. La presenza del descriptor annidato spiega perché altre mutation nello stesso runtime riuscivano.

## 3. Shared or separate failures

TS di fine turno (superato e fallito) e rimozione concentrazione riproducono il primo boundary con la stessa condition. Danno su caster in concentrazione con quel descriptor fallisce prima del passaggio che genera il warning: correggendo il commit, `broadcastConcentrationSaveWarnings()` torna a produrre il TS risolvibile, con reference della concentrazione corretta. Non è stato necessario modificare il generatore di warning.

Il consume di zona è un secondo call-site della stessa incompatibilità draft/clone, non una diversa regola di gioco. Non vengono attribuiti ad esso i sintomi degli screenshot di Eyebite.

## 4. Patch

In `src/effectsMutations.js`:

- `commitEffectsMutationPlan`: la validazione legge `isDraft(item) ? current(item) : item`. È lo snapshot del draft corrente nel callback, non lo stato precedente del planner. Le scritture continuano a usare il draft originale.
- `metadataFieldSnapshot`: se il valore è un draft Immer, lo stacca con `current(value)` prima di clonarlo. Mantiene proprietà assente, null, zero e tutti i valori presenti senza fallback generico.

`package.json` e `package-lock.json` dichiarano esplicitamente Immer `^10.1.1`, già installato come dipendenza SDK. `npm ls immer` conferma una sola versione 10.1.1 deduplicata. Nessun framework/state manager aggiunto, nessun aggiornamento transitivo.

`test/arch05aPostCommitRecoveryDiagnostic.test.js` aggiunge cinque test e una modalità SDK con `produce`; i due test R7 usano ora questa modalità. Nessuna modifica a effectsRecovery, History, coordinator, concentration generator, ARCH-06/07.

## 5. Why no data was lost

Il contratto è draft SDK → snapshot plain completo → normalizzazione/validazione esistente. Non viene escluso nessun campo. Il test verifica esplicitamente che l'oggetto originale non è clonabile, che `saveReminder.resolution` è draft e che il descriptor staccato è integralmente uguale, incluse azioni, opzioni, timing e riferimento parent.

Il test reminder conserva il before nell'envelope, completa History dopo cold restart e fa Undo: il `saveReminder` ripristinato è deep-equal al descriptor originale. Nessuno stringify di oggetti SDK, catch-and-fallback o silenziamento di DataCloneError.

## 6. ARCH-05B durability

Ordine invariato: PREPARED durevole → canonical commit → side effect → History → cleanup. Il test interrompe il runtime dopo commit con History non disponibile; il nuovo owner completa una sola History, elimina il pending e consente Undo. I test R7 con draft reali verificano consume prima di History e marker prima di consume, anche attraverso restart. Precondition checks, lane e stale guards restano attivi.

## 7. Regression tests

1. T4: forma reale Eyebite dentro Immer; prova negativa di structuredClone e uguaglianza dopo snapshot.
2. T1/T5/T6/T7: TS fine turno superato, rimozione effetto, History fallita, cold restart, History unica, Undo e descriptor completo.
3. T2: concentrazione rimossa realmente insieme alla condition dipendente, History presente.
4. T3: commit danno e broadcast del TS concentrazione con reference corretta.
5. T1 esito fallito: condition conservata e risoluzione registrata senza DataCloneError.

Inoltre i due R7 preesistenti sono stati rafforzati con draft Immer. Il repro iniziale mostrava i tre workflow falliti; il repro consume mostrava activation ancora pending dopo restart. Entrambi sono conservati nei log esterni dell'incident. Non è stata effettuata una nuova prova manuale sulla scena live dell'utente: la verifica browser-realistica usa la stessa libreria di draft dell'SDK e i moduli produttivi.

## 8. Verification

| Verifica | Risultato |
| --- | --- |
| Cinque incident regression | 5/5 |
| Reminder/concentration/Effects/recovery/History/Undo/restart/replay collegati | 607/607 |
| Invariant/stabilization | 52/52 |
| Full suite | 2884/2884, baseline 2879 + 5 |
| Performance harness | status=ok; 1777 → 1777 SDK calls |
| Build | riuscita, 4.31 s |
| verify:version / verify:dist | riusciti, 1.3.0 |
| git diff --check | riuscito |

I gruppi di test si sovrappongono. Build conserva i warning sui chunk grandi; nessun errore. Nessun aumento di chiamate SDK: `current()` opera localmente sul draft.

## 9. Working tree integrity

Baseline acquisita prima delle modifiche incident, inclusi tutti i dirty 05B/06/07. Il confronto src/test byte per byte individua soltanto `src/effectsMutations.js` e `test/arch05aPostCommitRecoveryDiagnostic.test.js` modificati da questa tranche. Si aggiungono le due dichiarazioni package/lock e questo report. Le modifiche 05B/06/07 negli stessi file sono preservate; nessun revert, commit o bump di versione. Dist rigenerata dalla build. Nessun lavoro ARCH-08/09/10.
