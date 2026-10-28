# Boss Actions — area di Hand Slam sulla mappa (Auril, fase 2)

Dopo l'esecuzione di **Hand Slam**, la console Boss Actions mette sulla mappa
l'immagine dell'area incrinata. Quando l'area crolla, alla fine del round
successivo, l'immagine viene sostituita da quella dell'area crollata.

## Comportamento

| Momento | Immagine | Dettagli |
|---|---|---|
| Commit di Hand Slam nel round N | area incrinata (`/boss-auril-hand-slam-cracked.webp`) | livello Props, bloccata, al centro del cerchio disegnato, 10 caselle di diametro (raggio di 20 ft = 8 caselle, più una casella di bordo per lato) |
| Fine del round N + 1, cioè dal round N + 2 | area crollata (`/boss-auril-hand-slam-collapsed.webp`) | stessa posizione, stesso elemento: cambiano solo l'immagine e lo stadio |
| Round riportato indietro con «Turno precedente» | torna incrinata | lo stadio è calcolato dal round, non registrato una volta per tutte |
| «Svuota iniziativa» | resta allo stadio che ha | l'area viene fissata (`settled`): il round 1 di Svuota o di un nuovo combattimento non la fa tornare incrinata |

- **ID dell'immagine**: deriva dall'azione (`<actionInstanceId>:collapse`).
  Un nuovo invio della stessa azione non aggiunge una seconda immagine.
- **Fuori combattimento**: senza round, l'area resta incrinata.

## Cosa resta manuale

- Terreno difficile, TS Destrezza del crollo, caduta e spostamento fuori
  dall'area: restano testo nella console, come prima.
- **Undo di Hand Slam**: annulla danni, condizioni e uso, ma **non** rimuove
  l'immagine. Il GM la elimina dalla mappa: è un elemento bloccato, quindi
  prima va sbloccato.
- **Fine dello scontro**: le immagini restano nella scena finché il GM non le
  elimina.

## Implementazione

- **`src/bossCollapseCore.js`** (dati puri):
  - la configurazione per boss e azione (`auril` + `hand-slam`), sul modello di
    `BOSS_AREA_THEMES`: nessuna modifica al parser né al profilo, quindi
    nessun reimport;
  - la spec dell'immagine;
  - lo stadio calcolato dal round;
  - gli aggiornamenti idempotenti.
- **`src/bossActionExecution.js`**: dopo il commit di un'azione di gruppo con
  un'area, `placeCollapseMarker` aggiunge l'immagine. È iniettabile come
  `postEdgeSave`; un errore diventa un avviso e non annulla l'azione.
- **`src/bossCollapseController.js`**, montato in `background.js` solo per il
  GM:
  - a ogni cambio dello stato di iniziativa porta le immagini marcate
    `…/bossCollapse` allo stadio del round;
  - scrive solo quelle immagini, con merge dei metadata;
  - non tocca ordine, turno, HP o barre.

## Verifica (17 ottobre 2026)

- **Test**:
  - `test/bossCollapseCore.test.js`: asset, spec, stadio, aggiornamenti;
  - due casi in `test/bossActionTranche4Integration.test.js`: piazzamento
    unico dopo il commit, nessuna immagine per Blinding Gleam.
- **Suite e build**: 3551 test su 3551, `npm run build` verde, gli asset sono
  in `dist/`.
- **Harness**, scenario `slam-final`:
  - immagine sul livello PROP a (910, 560), `dpi` 100, round 2;
  - con il controller: incrinata al round 3, crollata al round 4, di nuovo
    incrinata tornando al round 3.
