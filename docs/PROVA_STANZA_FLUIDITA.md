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
