# Misura prestazioni: console sui mostri

Lotto 8 del [piano attacchi dei mostri](PIANO_ATTACCHI_MOSTRI_FASE_1.md). Con
l'interruttore **Mostri** acceso la console attacchi (o la console Boss) si
apre anche ai turni dei mostri, quindi si riapre o si sposta più spesso. Le
misure del 24/10 dicono che le console aperte pesano sul cambio turno: questa
sessione dice quanto pesa ora, a confronto con la baseline.

Serve una room vera: il banco di prova non ha la latenza di Owlbear.

## Baseline

`perf-runs/gm-turni-flag-locale.json` (24/10, build locale, History in
IndexedDB, 10 avanzamenti di turno con la console che si apre sui PG):

| | baseline |
| --- | --- |
| Tick p50 / p95 (tracker) | 1253 / 2550 ms |
| Tick p50 (background) | 1130 ms |
| `updateItems` | 50 chiamate, p50 186 ms |
| Evento item più grande | 156 KB |

Si leggono con `node scripts/perf-compare.mjs perf-runs/gm-turni-flag-locale.json`.

## Preparazione (una volta)

1. Avvia la build locale (`npm run dev`) e apri la room **Auril (Testbench)**
   con l'estensione **Take Initiative! (LOCALE)**, nella stessa scena della
   baseline.
2. Ordine di iniziativa: i PG di sempre, più **due goblin** e **un mostro con
   soffio** con attitudine **enemy**; il boss della scena resta.
3. Importa lo statblock sui mostri (scheda → **Modifica** → **Importa**, JSON
   di [Importare una scheda](IMPORT_SCHEDA.md#importare-lo-statblock-di-un-mostro));
   sui goblin spunta **Anche all'altro token** per i PF. Salva.
4. Accendi il probe nel contesto **background.html** (F12 → Console → menu dei
   contesti in alto): `__tbpPerf.enable()`, poi ricarica la pagina di Owlbear.
5. Lascia la finestra giocatori chiusa, come nella baseline del GM.

## Blocchi

Prima di ogni blocco, nel contesto **background.html**:
`__tbpPerf.reset()`. Durante il blocco non toccare la console (nessun clic,
nessuna chiusura): si apre e si sposta da sola. Il cambio turno è solo
**avanti** (Spazio o →): i turni all'indietro non producono tick.

| Blocco | Pillole della console | Turni | File |
| --- | --- | --- | --- |
| Dimensioni | — | — | `perf-runs/gm-mostri-dimensioni.json` |
| A | **PG** acceso, **Mostri** spento | 10 avanti | `perf-runs/gm-mostri-pg.json` |
| B | **PG** e **Mostri** accesi | 10 avanti | `perf-runs/gm-mostri-entrambi.json` |
| C | entrambi spenti | 10 avanti | `perf-runs/gm-mostri-spenti.json` |

- **Dimensioni**, prima del blocco A:
  `console.log(JSON.stringify(await __tbpPerf.metadataSizes()))`.
- **A** riproduce la baseline (console solo ai turni dei PG) con le schede dei
  mostri sui token: misura il peso delle schede.
- **B** è il caso nuovo: console anche ai turni dei mostri e dei boss.
- **C** è il pavimento, senza console.

Dopo ogni blocco, nello stesso contesto:
`console.log(__tbpPerf.export("mostri-pg"))` (etichetta `mostri-entrambi`,
`mostri-spenti` per gli altri). Nel background `copy()` non esiste: clic
destro sul testo stampato → **Copy string contents**, poi incolla nel file
della tabella.

Alla fine: `__tbpPerf.disable()` e ricarica.

## Lettura

```bash
node scripts/perf-compare.mjs perf-runs/gm-turni-flag-locale.json perf-runs/gm-mostri-pg.json perf-runs/gm-mostri-entrambi.json perf-runs/gm-mostri-spenti.json
```

Cosa guardare:

- **A contro baseline**: «Evento item più grande» e «Byte item ricevuti»
  misurano il peso delle schede dei mostri sui token; il tick non dovrebbe
  cambiare.
- **B contro A**: il costo della console sui turni dei mostri (aperture, long
  task, tick p50/p95, `updateItems`).
- **B contro C**: il costo totale delle console.

Se B resta entro il 20% di A sul tick p50, l'apertura sui mostri si tiene così.
Oltre, il rimedio non è una console «in attesa» (provata e scartata il 24/10:
due console vive costano più di una che si riapre), ma un aggiornamento della
console più economico, da progettare a parte.
