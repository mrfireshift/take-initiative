# Fluidità e prestazioni — refactoring senza cambi di funzionalità (piano)

Stato: **fase 1 (misure e analisi) chiusa il 27/10/2026.** Le decisioni D1–D8 e l'ordine dei lotti sono stati approvati il 27/10, così come raccomandati. A parte, ma già committata (`6f71e7d`), la correzione delle chiavi di scena della build LOCALE.

Richiesta dell'utente: un ultimo passaggio di refactoring su Take Initiative, mentre la fase 2 del compendio porta i testi non SRD nei pacchetti privati. Lo scopo è migliorare responsività, fluidità, prestazioni e look and feel, con priorità a questi fattori. Non deve creare codice sporco e non deve cambiare le funzionalità.

## Principio

Stesso comportamento, meno attese. I lotti fanno soltanto cinque cose:

- leggere **in parallelo** ciò che oggi si legge in fila, mantenendo l'ordine dei controlli (ruolo, epoca della scena, oggetto mancante) e quindi gli stessi errori;
- **non rileggere** dall'SDK dati già in mano (l'evento appena ricevuto, lo snapshot dell'Event Hub);
- **non ricaricare** un iframe che basta spostare;
- caricare **al clic** il codice che serve solo al clic, prefetch a pagina quieta;
- far **ricordare al browser** i file che non cambiano mai: hanno l'hash nel nome.

Unità di misura: RT è una chiamata SDK in sequenza, 10–30 ms a riposo e 100–400 ms sotto carico (misure in stanza del 24/10).

## 1. Dove si perde il tempo al tavolo

| Momento | Costo oggi | Lotto |
|---|---|---|
| Cambio turno, modifica dei PF, comando Boss (GM) | la Cronologia del background fa il giro di OBR anche verso il proprio owner: 433–777 ms di attesa, più il Combat Log (130–220 ms) dentro il percorso | S2, S3 |
| Qualunque popup che si apre, su ogni client | riconvalida di 39–88 script: +90 ms l'avviso di turno, +230 ms il tracker | F1 |
| Avviso di turno, a ogni turno su ogni client | opzioni e ruolo letti in fila prima dell'handshake; 1,2 MB di avvio, il 47% solo per i pulsanti | F2, P4 |
| Console aperta da sola a ogni turno (GM) | 8–11 RT in fila prima del disegno; 300 ms di attesa per la console chiusa | P2, P3 |
| Spostare, girare o scalare il tracker | chiusura e riapertura: tracker vuoto per 0,5–3 s, anche sullo schermo del tavolo | V1 |
| Aprire un pannello dal tracker | chiusure ripetute e letture di posizione in fila (5–6 RT) | P1 |
| Cambio turno sullo schermo del tavolo | stato riletto, lettura completa degli item per i gruppi, riscrittura del boss leggendario | T1–T3 |
| Ogni evento degli item, in ogni iframe | firme di tutti gli item ricalcolate: il riuso previsto non scatta mai | S1 |
| Ogni tick nel background | 16 letture complete degli item (~160 KB l'una), anche per aure e zone che non ci sono | S4, S5 |
| Modifica dei PF | barre sulla mappa: 7 RT in fila per aggiornamento, e la stessa barra scritta dal tracker e dal background | S6, S7 |
| Primo incantesimo con un token sulla mappa | 1–1,4 MB per immagine, su ogni client | F3 |

## 2. Misure

### 2.1 Hosting: ogni apertura riconvalida tutti gli script

`https://take-initiative.onrender.com` serve anche i file con hash (`/assets/*.js`) con `Cache-Control: public, max-age=0, s-maxage=300`. Seconda navigazione nel browser, cioè come un popup riaperto:

| Pagina | Script | Riconvalidati (304) | Dalla cache senza rete | Ultimo script | DOM pronto | Banco locale senza rete |
|---|---:|---:|---:|---:|---:|---:|
| Avviso di turno | 39 | 39 | 0 | 133 ms | 146 ms | 61 ms |
| Tracker | 88 | 88 | 0 | 290 ms | 354 ms | 127 ms |

### 2.2 Peso di avvio per pagina (build di produzione, banco con SDK simulato, cache calda)

| Pagina | Script | JS minificato | gzip | Moduli valutati |
|---|---:|---:|---:|---:|
| Tracker | 90 | 3,7 MB | 853 KB | 127 ms |
| Background | 79 | 3,6 MB | 797 KB | 108 ms |
| Scheda personaggio | 72 | 3,4 MB | 762 KB | 109 ms |
| Console attacchi | 58 | 3,2 MB | 696 KB | 99 ms |
| Console Boss | 52 | 2,1 MB | 561 KB | 81 ms |
| Avviso di turno | 40 | 1,2 MB | 347 KB | 61 ms |
| Console effetti (Quick HP) | 41 | 1,2 MB | 341 KB | 60 ms |
| Avviso di concentrazione | 37 | 1,2 MB | 335 KB | 49 ms |
| Tiro contro la morte | 37 | 1,2 MB | 334 KB | 47 ms |
| Pagina minima | 4 | 74 KB | 18 KB | 15 ms |

I tempi vengono da una macchina di sviluppo veloce. Tutti gli iframe del plugin condividono lo stesso thread del browser. Il peso cambierà con i lotti P2–P4 del compendio, che tolgono testi dal bundle: la base va rimisurata dopo.

Simulazione sul grafo reale degli import, se l'azione dei pulsanti diventa un import dinamico:

| Pagina | Funzione caricata al clic | Codice di avvio |
|---|---|---:|
| Avviso di turno | `resolveReminder` | −47% |
| Tiro contro la morte | `resolveReminder` | −68% |
| Avviso di concentrazione | `resolveReminder` | −93% |
| Durata effetto | `runEffectsMutation` | −66% |

Verificato nel codice: in tutti e quattro i file la funzione si usa solo dentro i gestori dei pulsanti o di Invio. I cataloghi grandi (`classFeatureCatalog`, `spells-srd`) sono invece importati da 4–18 moduli per pagina e valgono 18–20 ms ciascuno: restano fuori (sezione 6).

### 2.3 Apertura dei popup: letture SDK in fila

| Popup | Quando si apre | Letture prima del primo disegno utile |
|---|---|---|
| Avviso di turno | ogni turno, ogni client | opzioni e ruolo in fila, poi handshake via broadcast; nel frattempo lettura completa degli item per le zone |
| Console attacchi | ogni turno con l'apertura automatica | ruolo, contesto (2 passaggi broadcast), item, metadata, tutti gli item, statblock in IndexedDB: circa 8 RT |
| Console Boss | turno del boss | come sopra, più le letture della sequenza epica e una seconda lettura completa degli item: 9–11 RT |
| Pannelli del tracker | al clic | chiusura di tutti i pannelli, poi di nuovo `modal.close` e `popover.close` sullo stesso pannello, poi larghezza dell'azione, viewport (altezza, poi larghezza), ruolo e opzioni: 5–6 RT |
| Tiro contro la morte | a 0 PF | ruolo, poi item |
| Avviso di concentrazione | al danno | un solo ruolo, misura già calcolata: va bene così |

Sul client dei giocatori i timeout da 8 s del 24/10 non ci sono più (commit `c670be4`).

### 2.4 Cambio turno nel tracker

Nel banco di produzione il render ottimistico mostra il nuovo turno 11 ms dopo il clic. Poi c'è un'attesa voluta di ~65 ms che accorpa i tasti, e non compaiono frame lunghi. Il render completo però ricostruisce in memoria tutte le card: 939 `createElement` e 415 `addEventListener` con 28 card, per cambiarne 2 nel DOM. La card attiva della vista classica viene sempre sostituita, perché l'alone scrive `animationDelay: -${Date.now()%3200}ms` e quindi il suo HTML cambia a ogni render. Per turno il tracker GM fa 16 chiamate SDK: 4 `getMetadata`, 3 `getItems`, 5 broadcast, 1–2 `updateItems`, 1 `setMetadata`.

### 2.5 Immagini

Ricompresse nel browser con le stesse dimensioni in pixel (WebP):

| File | Pixel | Oggi | WebP q90 | WebP q85 |
|---|---|---:|---:|---:|
| `spell-token-blade-of-disaster.webp` | 1254×1254 | 1376 KB | 189 KB | 147 KB |
| `spell-token-animated-medium.webp` | 1067×1067 | 1156 KB | 269 KB | 211 KB |
| `spell-token-animated-tiny-small.webp` | 1067×1067 | 1078 KB | 231 KB | 179 KB |
| `spell-token-arcane-sword.webp` | 1067×1067 | 968 KB | 147 KB | 112 KB |
| `spell-token-spiritual-weapon.webp` | 1067×1067 | 944 KB | 167 KB | 133 KB |
| `boss-frame-ui.png` (881 KB nel repo) | 688×686 | 367 KB online | 34 KB a 400 px | 29 KB a 400 px |

Gli URL dei token sono salvati negli item della scena: si ricomprimono **tenendo nome e dimensioni**, mai rinominandoli. La cornice dei boss si vede al massimo a ~100 px (scala 100%), quindi a scala 200% su uno schermo HiDPI bastano 400 px.

### 2.6 Look and feel

- Vista **classica**: 38 testi sotto i 10 px (etichette della barra a 7,5 px, pill a 9,5 px). Nella vista compatta solo le pill degli effetti sono a 8 px.
- **Opzioni**: le righe 5eTools aggiunte dopo v1.5.0 stanno fuori dal contenitore delle altre righe e i suggerimenti sono a 8,3 px.
- L'effetto vetro (`backdrop-filter`) **sfoca davvero** la mappa: verificato con un iframe dello stesso sito e con uno di un altro sito, come in OBR. Resta com'è.
- Il titolo della pagina del tracker è ancora `Vite App`.

### 2.7 Tick di turno nel background

Rianalisi degli export in stanza del 24/10 (`perf-runs/gm-turni-flag-locale.json`, History in IndexedDB, 10 tick). Tick p50 1336 ms, così diviso:

| Fase | Mediana |
|---|---:|
| prepare | 77 ms |
| inizio commit → PREPARED (journal) | 202 ms |
| PREPARED → HISTORY_PENDING (con l'`updateItems` canonico, 90–145 ms) | 194 ms |
| **HISTORY_PENDING → l'owner inizia l'append** | **433 ms** |
| append (Combat Log 195 ms, scrittura History 31 ms) | 254 ms |

Gli altri export mostrano la stessa attesa: 777 ms in `gm-turni-fasi`, 487 ms in `gm-turni-history-vuota`. L'owner risponde al contesto in 5–27 ms, quindi l'attesa è trasporto: i broadcast verso l'owner si mettono in coda dietro gli eventi degli item da 160 KB.

Per tick il background fa 16 `getItems` completi (49 ms in media), 7 `getMetadata`, 23 broadcast e 5 `updateItems` (204 ms in media). Solo uno degli `updateItems` appartiene al tick: gli altri vengono da altri controller che girano nel frattempo, quindi non si possono unire. Il background del client giocatore non fa nessuna chiamata SDK: riceve soltanto eventi.

## 3. Lotti

⚠ indica un'area fragile di AGENTS.md: prima di modificare, il lotto scrive il rischio e il percorso dei dati e aspetta il via libera.

### A. Rete e risorse

| Lotto | Contenuto | Rischio | Guadagno atteso |
|---|---|---|---|
| **F1** | Header su Render: `/assets/*` → `Cache-Control: public, max-age=31536000, immutable`. HTML, `manifest.json` e `public/` restano come sono. Lo fai tu dal pannello. | basso | −90 ms per l'avviso di turno, −230 ms per il tracker, a ogni apertura e su ogni client |
| **F3** | Immagini ricompresse a parità di nome e pixel, con un codificatore vero (non il canvas, per non toccare i bordi trasparenti) e un confronto visivo prima/dopo | basso | ~5,5 MB → ~1 MB al primo uso dei token |

### B. Avvio e apertura dei popup

| Lotto | Contenuto | File | Rischio |
|---|---|---|---|
| **F2** | Le azioni degli avvisi si caricano al clic, con prefetch a pagina quieta | `turn-notice.ts`, `concentration-warning.ts`, `death-save-notice.js`, `effect-duration.js` | basso |
| **P1** | Pannelli del tracker: una sola chiusura, letture di posizione e scala in parallelo (anche nel trascinamento) | `initiativeList.js` (solo gli helper di apertura), `trackerPopover.js`, `popoverDragHost.js` | basso |
| **P2** | Console: le letture della sessione in parallelo; lettura completa degli item in parallelo alla sessione; la console Boss riusa gli item invece di rileggerli | `pcAttackExecution.js`, `bossActionExecution.js`, `pc-attack.js`, `boss-actions.js` | basso-medio |
| **P3** | Apertura automatica: ping alle console in parallelo agli item; una console chiusa si riconosce subito con `popover.getHeight` invece di aspettare 300 ms; nessuna console aperta viene mai ricaricata | `pcAttackTurnController.js` | basso-medio |
| **P4** | Avviso di turno: opzioni e ruolo in parallelo. Primo payload nell'URL come per tiro contro la morte e concentrazione: decisione D5 | `turn-notice.ts`, `turnNoticeHost.js` | basso (D5: medio) |
| **P5** | Host degli avvisi e console effetti: letture in parallelo; Quick HP riusa lo stato già letto | `deathSaveNoticeHost.js`, `bossLinkNoticeHost.js`, `death-save-notice.js`, `quick-hp-modal.js` | basso |
| **P6** | Icona dell'estensione: se OBR risponde oltre 750 ms, oggi il tracker è creduto chiuso e il clic lo riapre. Al timeout varrà lo stato salvato | `action-launcher.js` | basso |

Guadagno stimato sotto carico: P1 0,5–2,4 s per pannello, P2 0,5–2,5 s per console, P3 −300 ms per turno (−750 ms nel passaggio tra boss), P4 −1 RT per turno e per client.

### C. Fluidità visiva

| Lotto | Contenuto | Rischio |
|---|---|---|
| **V1** | Spostare, girare o scalare il tracker senza chiuderlo: si riapre lo stesso popup con lo stesso URL. La scala e il layout il tracker li segue già da solo. Prima una prova in stanza (D6): se OBR ricaricasse lo stesso, il comportamento resta quello di oggi | medio |
| **V2** | Card attiva stabile: l'alone tiene la fase con l'API delle animazioni invece di `Date.now()` nell'HTML; la card attiva non viene più ricostruita (ritratto e listener) a ogni render completo | basso |
| **V3** | Console Boss riaperta ridotta: si piega prima di disegnarsi, senza il salto da grande a piccola | basso |
| **V4** | Tipografia: soglia di 10 px anche nella vista classica e nelle pill; righe 5eTools nel contenitore standard; titolo del tracker. I test delle misure si aggiornano nello stesso commit (D3) | basso |

### D. Tracker ⚠ (`initiativeList.js`)

| Lotto | Contenuto | Rischio | Guadagno |
|---|---|---|---|
| **T1** | Il render completo prende lo stato dall'ultimo evento di metadata, con fallback alla lettura se l'epoca non coincide | basso-medio | −1 RT tra evento e DOM, soprattutto sullo schermo del tavolo |
| **T2** | Ripiegamento automatico dei gruppi: sul client giocatore non legge tutti gli item, visto che la sua scrittura non ha effetto; sul GM usa lo snapshot completo | basso | −1 lettura completa (114–195 KB) per turno |
| **T3** | Reset delle azioni leggendarie solo quando cambia qualcosa. Oggi ogni tracker aperto riscrive l'intero `meta` del boss già al massimo, proprio mentre il background scrive il tick. Solo GM: decisione D4 | basso | −1 RT per turno su ogni client, nessuna sovrascrittura concorrente |
| **T4** | PF dei nemici sullo schermo del tavolo: render incrementale invece di completo (⚠ tocca la visualizzazione dei PF, non i PF canonici né le barre sulla mappa) | basso-medio | ~10× meno lavoro per modifica |
| **T5** | Letture di layout delle chip: si conserva l'altezza misurata quando le righe non cambiano | basso | −39…55 letture forzate per turno |
| **T7** | Render incrementale e messa a fuoco dallo snapshot dell'Event Hub; DPI in cache per scena | basso-medio | −1–2 RT per modifica e per turno |
| **T8** | Fase 2, facoltativa: non costruire le card che il confronto terrà uguali. Serve prima un banco che verifichi `track.innerHTML` identico byte per byte (D7) | medio-alto | il più grande in CPU, ~1 ms per card per render |

### E. Background ed Event Hub

Restano come sono, e i lotti lo verificano:
- la corsia seriale del coordinatore;
- il prepare con lettura fresca;
- un solo `updateItems` canonico che controlla lo stato «prima» sulle bozze;
- l'ordine del journal: PREPARED durevole prima della scrittura, HISTORY_PENDING prima dell'append, pulizia solo dopo;
- navigazione e stato del turno.

| Lotto | Contenuto | File | Rischio | Guadagno |
|---|---|---|---|---|
| **S1** | Event Hub: ogni item si riconosce dalla sua stringa JSON grezza, e se è identica si riusano le firme precedenti. La classificazione non cambia | `sceneItemChangeDispatcherCore.js` | basso | 2,39 → 0,36 ms per evento (92 item, 133 KB) in ogni iframe in ascolto, GM e giocatore |
| **S2** | La Cronologia scritta dal background va direttamente al proprio owner, nella stessa pagina, sia il contesto sia l'append. Oggi succede solo per i comandi oltre 16 KB; la coda del broker mantiene l'ordine e la risposta passa dagli stessi controlli | `historyOwner.js` | medio-basso | −0,4…0,8 s per tick, modifica dei PF e comando Boss |
| **S3** | L'append risponde prima di scrivere il Combat Log, che resta in ordine nella propria coda. Il contesto del turno si legge nello stesso punto di oggi (passo già previsto da ARCH-009) | `historyOwnerCore.js`, `combatLog.js` | basso-medio | −0,13…0,22 s per comando |
| **S4** | Aure dallo snapshot: visuali possedute, DPI e scala in cache per griglia, ultimo payload dei metadata, prontezza dall'epoca della scena. Dopo ogni scrittura la riconciliazione rilegge ancora dal vivo | 3 controller delle aure | basso-medio | ~12 RT → 0–1 quando non cambia nulla |
| **S5** | Crollo del boss, Chiamare il fulmine, passata immediata e watchdog delle zone dallo snapshot dell'Event Hub; i limiti mancanti si caricano in parallelo, con un tetto | `bossCollapseController.js`, `callLightningTurnPromptController.js`, `spellStaticZone.js`, `sceneItemBoundsCache.js` | basso-medio | −4…6 RT per tick |
| **S6** ⚠ | Barre dei PF: riuso delle letture già fatte (array, orfani, posizione del token, prontezza), stesse scritture, nulla ricreato | `hpbar-items.js` | basso | −3/4 RT e −3 letture complete per modifica, per iframe |
| **S7** ⚠ | Barre dei PF: nessuna scrittura quando i valori sono uguali e limiti dalla cache. Oggi tracker e background scrivono la stessa barra a ogni modifica, e ogni scrittura arriva a tutti i client | `hpbar-items.js` | medio | meno eventi degli item su ogni client (D8) |
| **S8** | Rifiniture: ancora del journal letta in parallelo alla scrittura in IndexedDB; scritture di room che riusano la lettura appena fatta; sul client giocatore niente servizio spaziale e niente rilettura del viewport se la vista del GM non cambia | `effectsRecovery.js`, `hpMemory.js`, `actorVitalsStore.js`, `background.js`, `sync-open.js` | basso (journal: medio) | piccolo |

Verifica: `npm run perf:harness` per il conteggio delle chiamate, poi il probe in stanza (`effectsPhases`, `sdkCalls`, `historyOwner`). Al probe vanno aggiunte le chiamate oggi non misurate: `isReady`, griglia e `getRole`.

### F. Guardie

| Lotto | Contenuto | Rischio |
|---|---|---|
| **F5** | `npm run perf:bundle`: dopo la build stampa il peso di avvio di ogni pagina, con un budget per gli avvisi, così le prossime funzioni non appesantiscono i popup di nascosto | basso |

## 4. Decisioni per te

| # | Decisione | Raccomandazione |
|---|---|---|
| D1 | Applicare F1 su Render | sì: è il guadagno più grande e non tocca il codice |
| D2 | Ricomprimere le immagini (F3) | sì, WebP q90 con confronto visivo nel banco |
| D3 | Soglia di 10 px anche nella vista classica (V4): alcune card diventano un po' più alte | sì |
| D4 | Reset leggendario solo dal GM (T3)? Oggi lo fa ogni tracker aperto, schermo del tavolo compreso | prima solo il salto dei casi senza modifiche (identico); il GM-only dopo, se lo vuoi |
| D5 | Primo payload dell'avviso di turno nell'URL (P4) | dopo P4a, con test sul protocollo "ultimo vince" |
| D6 | Prova in stanza per V1: muovi il tracker classico e guarda se lampeggia vuoto | due minuti, prima del lotto |
| D7 | T8 (non costruire le card uguali) | più avanti, solo se dopo T1–T7 il turno sul tavolo non è ancora fluido |
| D8 | S7: barre dei PF senza scritture uguali (⚠ barre sulla mappa) | sì dopo S6, con un test che verifichi che le barre nascono ancora sui token che non le hanno |

## 5. Sequenza e convivenza con il compendio

Ordine per guadagno e rischio: F1 (tu) → S2 → S3 → S1 → F2 → P1 → P3 → T2, T3 → V2 → P2 → T1 → S4, S5 → S6 → V1 (dopo D6) → F3 → V4 → P4–P6 → T4, T5, T7 → S7, S8 → F5 → T8.

La fase 2 del compendio sta modificando `spells-srd.js`, `spellbookCatalog.js`, i cataloghi delle capacità, `pc-attack.js`, `initiative-card-modal.js` e `reference-modal.js`. P2 tocca `pc-attack.js`: va dopo il lotto P3 del compendio, oppure si mettono in stage solo le proprie modifiche. Gli altri lotti non toccano quei file. F5 fissa i budget solo dopo il lotto P4 del compendio, che cambia il bundle.

Ogni lotto ha un commit e una misura prima e dopo con lo stesso protocollo (banco di produzione per i conteggi, `perfProbe` in stanza per i tempi).

## 6. Cosa non propongo

- Caricare a richiesta i cataloghi grandi: 18–20 ms ciascuno, ma 4–18 moduli li usano in modo sincrono e il compendio li sta cambiando.
- Tenere vive le console: misurato il 24/10, peggiorava il tick (revert `a7a5ca0`). Si potrà rivedere dopo P2 e T1–T7, che rendono economico l'aggiornamento.
- Toccare code, revisioni e ID virtuali del turno attivo: il cambio turno nel tracker è già a 11 ms.
- Unire i «tre `updateItems` del tick», ipotesi del 24/10: solo uno è del tick, gli altri appartengono ad altri controller.
- Saltare HISTORY_PENDING, togliere i watchdog o far partire il prepare del coordinatore dallo snapshot: proteggono dal recupero e dai conflitti.
- Togliere l'apertura automatica o l'effetto vetro: la prima è voluta per il tavolo, il secondo si vede davvero in OBR.
- Riscrivere `renderTrack` per intero: troppo accoppiato con editor, scroll e animazioni, e il beneficio è incerto.

## 7. Come rifare le misure

Gli script usati stanno nella scratchpad della sessione: build con un plugin che salva il grafo dei moduli, simulazione dei tagli di import, peso di avvio per pagina, banco di produzione con SDK simulato servito da `vite preview`, conteggio delle chiamate SDK per turno. F5 porta nel repo, in forma pulita, quelli che servono come guardia.
