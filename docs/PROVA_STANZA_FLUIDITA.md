# Prova in stanza: lotti di fluidità

Verifica guidata dei lotti del [piano fluidità](PIANO_REFACTORING_FLUIDITA.md), da fare in una room vera con la build locale. Lo script è `src/fluidityRoomCheck.js`. Fa da solo i controlli che si possono misurare, rimette turno e PF com'erano e salva i risultati in `perf-runs/`. Resta a te solo quello che si giudica a occhio (fine pagina).

## Preparazione

1. Avvia la build locale:

   ```bash
   npm run dev
   ```

2. Apri la room **Auril (Testbench)** con **Take Initiative! (LOCALE)**. Servono due finestre: la finestra del GM e quella dei giocatori in incognito sullo schermo del tavolo.
3. In **entrambe** le finestre: F12 → Console → menu dei contesti in alto → **background.html**, scrivi `__tbpPerf.enable()`, poi ricarica la pagina di Owlbear.
4. Sul GM apri il tracker. Per provare anche V3, apri la console Boss di un boss.

## Schermo del tavolo (prima)

Nella console della finestra dei giocatori, contesto **background.html**:

```js
await __tbpPerf.watchFluidity()
```

Per 4 minuti osserva tracker e avvisi di quello schermo. Alla fine salva:

- `perf-runs/proiettore-verifica-fluidita.json`, con i campioni e le anomalie, cioè un avviso che nomina una creatura diversa da quella attiva nel tracker per più di 2,5 s, oppure avvisi arrivati fuori ordine;
- `perf-runs/proiettore-turni-fluidita.json`, l'export del probe.

Per una durata diversa: `watchFluidity({ durationMs: 300000 })`.

## GM (subito dopo)

Nella console della finestra del GM, contesto **background.html**:

```js
await __tbpPerf.runFluidityCheck()
```

Non toccare nulla finché non finisce (circa 2–3 minuti). Le verifiche, in ordine:

| Verifica | Cosa fa | Lotti |
|---|---|---|
| D6 | Riapre il tracker con lo stesso id e lo stesso indirizzo, senza chiuderlo, e controlla se la pagina è la stessa o è stata ricaricata. Poi lo rimette al suo posto | V1 |
| Turno e avviso | 5 turni avanti: per ognuno controlla lo stato della scena, la card attiva del tracker e l'avviso «Turno di …» con il tempo dal clic al disegno | P4b, T1, T7 |
| Tre turni di fila | Tre clic ravvicinati: sullo schermo deve restare l'avviso dell'ultimo turno, e gli avvisi ricevuti devono essere in ordine | P4b |
| Altezza delle chip | Rimisura da zero le card con le chip delle condizioni (vista classica) e conta quelle che cambierebbero | T5 |
| PF e barre | Cambia di 3 i PF di un nemico in iniziativa e poi li rimette: barre e testo sulla mappa devono seguire, una barra e un testo per token | S6, S7 |
| Console Boss | Se la console Boss è aperta: la riduce, la chiude, la riapre e controlla che torni ridotta senza mai mostrare il pannello | V3 |
| Misura | 10 turni come nella misura del 24/10, export in `perf-runs/gm-turni-fluidita.json` | tutti |

Alla fine riporta indietro i turni con il pulsante «Turno precedente», stampa la tabella dei risultati e la salva in `perf-runs/verifica-fluidita.json`. «ATTENZIONE» indica una verifica da guardare, con il motivo nel dettaglio. Opzioni: `runFluidityCheck({ turns: 5, measureTurns: 10 })`; con `measureTurns: 0` salta la misura.

Il confronto con la misura del 24/10:

```bash
node scripts/perf-compare.mjs perf-runs/gm-turni-flag-locale.json perf-runs/gm-turni-fluidita.json
```

## Verifica del passaggio di bugfix (L23)

Una seconda verifica, per i lotti del [piano di bugfix](PIANO_BUGFIX_POLISHING.md) (sezione 7). Si prepara come sopra. Sul tavolo parte prima `watchFluidity()`, che ora controlla anche i token nascosti. Poi, nella console del GM, contesto **background.html**, con il tracker appena aperto:

```js
await __tbpPerf.runBugfixCheck()
```

Dura circa un minuto. Serve un combattimento in corso con almeno due creature. Per L27 serve un boss Paragon in iniziativa, per L16 un token con barra o aura sulla mappa. I passi:

| Verifica | Cosa fa | Lotto |
|---|---|---|
| Scadenze dopo la riapertura | Chiude e riapre il tracker (pagina nuova). Mette alla creatura di turno la condizione «Prova verifica», che scade alla fine del suo turno, poi preme ▶: la condizione deve sparire | L2 |
| PF dalla seconda card Paragon | Apre l'editor dei PF della card `::p1` del boss, scrive un PF in meno e conferma. Cambiano i PF del token del boss | L27 |
| Tolta la creatura di turno | Le toglie l'iniziativa, come «Rimuovi dall'iniziativa». Il turno va alla successiva ancora presente, o alla prima con il round dopo | L6 |
| Annulla di due voci | Annulla insieme «Modifica HP» e «Rimosso dall'iniziativa» dalla Cronologia, come «Annulla N azioni». Creatura di nuovo in iniziativa, PF del boss come prima. Senza Paragon annulla una voce sola | L3 |
| Token nascosto | Nasconde per 8 s un token con barra o aura. Sul GM le sue barre, il numero e le aure devono essere nascosti ai giocatori. Sul tavolo `watchFluidity` segnala `token-nascosto-visibile` se la sua card, una barra o un'aura restano visibili | L16 |

Alla fine rimette tutto com'era: la condizione di prova se è rimasta, l'iniziativa e i PF se l'Annulla non ci è riuscito, la visibilità del token. Con «Turno precedente» riporta il turno sulla creatura e sul round di partenza. Salva la tabella in `perf-runs/verifica-bugfix.json`. Opzioni: `runBugfixCheck({ hideMs: 8000, tickTimeoutMs: 15000 })`.

Restano a mano:

- F5 sulla finestra del tavolo: il tracker deve tornare (L9);
- statblock su un goblin con omonimi feriti, poi cambio scena: i PF degli altri goblin non cambiano (L1).

Da sapere:

- Va lanciata con il tracker appena aperto o ricaricato. Dopo un ◀ il tracker conta le scadenze solo oltre il turno più avanzato già raggiunto. La riapertura del primo passo serve anche a questo.
- La scadenza della condizione di prova lascia nella Cronologia la voce «Scadenza effetti di turno».
- Lo stato dell'iniziativa non viene mai scritto dallo script. Scrive soltanto, unendoli al `meta` del token, la condizione di prova, `inInitiative` e i PF (passando dall'editor della card); in più la visibilità di un token.

## Da guardare a occhio

Lo script non vede come si muovono le cose sullo schermo:

- spostando o girando il tracker, se resta vuoto per un attimo;
- alone della card attiva e chip senza scatti;
- il tiro contro la morte di un PG a 0 PF;
- Cronologia e Combat Log che registrano turni e PF, con l'Annulla.

## Limiti

- Il cambio dei PF scrive direttamente il campo `hp` nel `meta` del token, senza Cronologia, e lo rimette a fine verifica anche se un passo fallisce.
- I turni avanzano premendo i pulsanti del tracker. Lo stato dell'iniziativa non viene mai scritto dallo script.
- Lo script si appoggia al probe: con il probe spento non fa nulla. Nella build online non c'è il server di sviluppo, quindi i file non vengono salvati e lo script stampa il testo da copiare.
