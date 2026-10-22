# Piano di lavoro — polishing UX/UI di Take Initiative

Base: [AUDIT_UI.md](AUDIT_UI.md) (fase 1, 2026-10-22). I codici A1.2, B3 e simili rimandano alle voci dell'audit.

> Take Initiative deve semplificare il bookkeeping al tavolo. Meno clic si fanno,
> meglio è. L'interfaccia deve essere intuitiva ed elegante, e leggibile dallo
> schermo del tavolo.

## Indice

1. [Obiettivi misurabili](#1-obiettivi-misurabili)
2. [Decisioni da prendere prima di iniziare (approvate)](#2-decisioni-da-prendere-prima-di-iniziare)
3. [Regole valide per ogni lotto](#3-regole-valide-per-ogni-lotto)
4. [Sequenza dei lavori](#4-sequenza-dei-lavori)
5. [Lotti nel dettaglio](#5-lotti-nel-dettaglio)
6. [Cosa può girare in parallelo](#6-cosa-può-girare-in-parallelo)
7. [Modello del brief per ogni sessione](#7-modello-del-brief-per-ogni-sessione)

---

## 1. Obiettivi misurabili

Il lavoro è finito quando questi numeri sono veri. Si misurano con l'anteprima `test-support/ui-audit-browser/` e con la stanza OBR reale.

| Misura | Oggi | Obiettivo |
|---|---|---|
| Testo più piccolo nel tracker (scala 100%) | 8px | **≥ 10px** |
| Testo più piccolo in notice e modali | 7px | **≥ 10px** |
| Area cliccabile minima nel tracker | 10px | **≥ 24px** |
| Testi tagliati senza puntini | pill compatte, popover, badge | **nessuno** |
| Danno a un bersaglio (compatto) | sel + 3 clic + valore | **1 clic + valore** |
| Aggiungere una condizione | 5 clic | **2 clic** |
| Togliere una condizione | 3 clic | **1–2 clic** |
| Modificare l'iniziativa nel compatto | impossibile | **1 clic + valore** |
| Azioni distruttive senza rete di sicurezza | 2 (Svuota, Reset round) | **0** |
| Varianti del bottone di chiusura | 7 | **1** |
| Usi dei token `--obrt-*` nella card compatta | 0 | tutti i font, i raggi e i colori di ruolo |

---

## 2. Decisioni da prendere prima di iniziare

**Stato: approvate il 2026-10-22 così come raccomandate.** Ogni lotto applica la colonna "Raccomandazione" come decisione presa.

| # | Decisione | Perché conta | Raccomandazione |
|---|---|---|---|
| D1 | **Dimensione della card compatta.** I font più grandi entrano nella card attuale (92×120) o la si allarga? | Allargarla mostra meno creature senza scorrere. `COMPACT_CARD_WIDTH` (`src/constants.js:15`) alimenta anche il calcolo delle dimensioni dei popover. | Tenere 92px di larghezza e recuperare spazio dentro la card (badge più compatti, meno margini). Valutare 96px solo se 11/10px non entrano. |
| D2 | **Modalità iniziale della console effetti.** Oggi parte in "Effetti" ed è una scelta voluta, protetta da un test (`test/quickHpModalDefaultMode.test.js`). | Il danno è l'azione più frequente al tavolo. | Mantenere "Effetti" dal pulsante della toolbar. Aprire direttamente su "Danno" quando l'ingresso è un'azione di danno (clic sugli HP della card, voce "Danno/cura…" del menu token). Il test resta valido. |
| D3 | **Rete di sicurezza per Svuota iniziativa e Reset round:** conferma o toast con "Annulla"? | La conferma aggiunge un clic, il toast no. | Toast con "Annulla", che si appoggia alla cronologia o all'undo esistente. Se l'undo non copre lo svuotamento, conferma. |
| D4 | **Tema.** Solo scuro, o anche chiaro seguendo OBR? | Il tema chiaro raddoppia il lavoro di verifica. | Solo scuro, dichiarato. |
| D5 | **Titoli delle notice in Georgia serif:** scelta stilistica da tenere? | È di fatto un terzo stile tipografico. | Tenerlo come token `--obrt-font-display`, usato solo per i titoli delle notice. |
| D6 | **Lingua delle Opzioni.** Room, Combat Log, Player, Questo browser. | "Room" e "Player" sono anche i nomi usati da OBR. | Tutto in italiano tranne i nomi propri di OBR quando compaiono come tali (es. "stanza OBR"). |

---

## 3. Regole valide per ogni lotto

1. **Un lotto = una sessione = un commit** (o pochi commit piccoli), su un branch `ui-polish/<lotto>`.
2. **Prima e dopo.** Screenshot con l'anteprima, nella stessa posizione e allo stesso zoom, salvati in `docs/ui-audit/after/<lotto>/`.
3. **Divieti (da `AGENTS.md`):**
   - niente modifiche ai metadata;
   - niente bypass delle guardie di `renderAll()`;
   - niente modifiche a code, revision check e ID virtuali del turno attivo;
   - le barre HP sulla mappa non si ricreano.
4. **I test descrivono anche le misure.** Per esempio `test/initiativeCardCompact.test.js` verifica card 120px, pill 14px e badge 17px. Se un lotto cambia una misura, il test va aggiornato **nello stesso commit**, dicendo nel messaggio quale misura è cambiata e perché. Non si cancellano asserzioni.
5. **Verifica a fine lotto:** `npm test`. Poi `npm run build` solo se il lotto va rilasciato: la build riscrive `dist/`.
6. **Gruppo B e aree fragili (⚠).** Prima di modificare, il lotto scrive nel brief di risposta il rischio e il percorso dei dati, e aspetta l'approvazione.

---

## 4. Sequenza dei lavori

```
Fase 0  Preparazione ──┬── Fase 2  Token ── Fase 3  Compatta ── Fase 4  Classica ──┐
                       │                                                            ├── Fase 6  Flussi (gruppo B) ── Fase 7  Rilascio
                       ├── Fase 0b Verifica bug in OBR (tu, in stanza reale)        │
                       └────────────────── Fase 5  Pannelli e modali ───────────────┘
```

| Fase | Contenuto | Durata indicativa | Modello e sforzo |
|---|---|---|---|
| 0 | Preparazione del repository e dell'anteprima | 1 sessione breve | Opus, medium |
| 0b | Verifica dei bug sospetti in una stanza OBR reale | 20 minuti, **a cura tua** | — |
| 2 | Token | 1 sessione | Opus, medium |
| 3 | Vista compatta (6 lotti) | 4–6 sessioni | Opus, **high** |
| 4 | Vista classica (3 lotti) | 2–3 sessioni | Opus, high |
| 5 | Pannelli e modali (5 lotti) | 3–5 sessioni | Opus, medium |
| 6 | Flussi e riduzione dei clic (8 lotti) | 6–8 sessioni | Opus, high |
| 7 | Rilascio | 1 sessione | Opus, medium |

---

## 5. Lotti nel dettaglio

### Fase 0 — Preparazione

**0.1 Repository pulito.** Le modifiche in corso sugli incantesimi vanno committate o messe da parte, così il polishing parte da un `main` pulito su un branch dedicato. **Decisione tua.**

**0.2 Anteprima completa — fatta il 2026-10-22.**
- Le "modali" sono in realtà popover, quindi il fake SDK non andava toccato: l'anteprima le mostrava già.
- `?scale=0.5…2` imposta la "Dimensione tracker" sia del GM (opzioni locali) sia dei giocatori (opzioni della stanza).
- Il menu "Seleziona token" seleziona una creatura, così i pannelli contestuali si aprono su di lei.
- I popover restano dentro lo schermo come in OBR, e ogni avvio riparte dalla posizione predefinita del tracker: gli screenshot prima/dopo sono confrontabili.
- È emerso un nuovo punto da verificare in OBR: la vista giocatore compatta a 150% (audit, punto 5.8).

**0.3 Committare** l'audit e l'anteprima — fatto.

### Fase 0b — Verifica dei bug in OBR — **fatta il 2026-10-22**

| Controllo | Esito | Conseguenza |
|---|---|---|
| 5.1 Compila iniziativa nel compatto | Comportamento voluto (fase di preparazione) | Nessun bug. Il lotto 6.5 deve solo far aprire l'editor sulla card compatta. |
| 5.2 Pill nel classico | **Confermato**: espandendo con "+", la terza riga copre la card successiva | Il lotto 4.1 è una correzione di bug. |
| 5.3 Popover effetti fuori schermo | Non confermato in OBR | Il lotto 3.6 diventa un ritocco facoltativo. |
| 5.6 Menu "…" non si chiude | Non confermato in OBR | Nessun intervento. |
| Nuovo: pannello destro tagliato | **Confermato** (`before/18`) | Il lotto 3.4 lo risolve per primo. |

Dettagli in [AUDIT_UI.md, sezione 5](AUDIT_UI.md#5-possibili-bug-emersi-durante-laudit).

### Fase 2 — Token — **fatta il 2026-10-22**

Branch `ui-polish/fase-2`. Unica pagina toccata dai valori cambiati: la Cronologia (`micro` 9 → 10px, nessun testo a 9px rimasto). `radius-lg` 11 → 12px nelle console e nelle card dei boss, differenza di 1px. Prima/dopo in `docs/ui-audit/after/2-token/`.

**2.1** Estendere `public/ui-typography.css` come da sezione 6 dell'audit:
- tipografia: `micro` a 10px, `tracker-name`, `tracker-meta`, `weight-heavy`, `font-display`;
- raggi: `lg` a 12px;
- `--obrt-hit-min`;
- colori di ruolo (fazioni, accent, danger/warning/success, HP alto/medio/basso, `surface-0`).

Il lotto non cambia nessun uso esistente, salvo `micro` e `radius-lg`: per quei due, screenshot prima/dopo delle pagine che li usano.

*Fatto quando:* i token esistono, i test passano e gli screenshot non mostrano regressioni.

### Fase 3 — Vista compatta (priorità)

| Lotto | Contenuto | File | Rischio |
|---|---|---|---|
| **3.1 Pill e overflow** | A1.2: testo interno con ellissi su pill, popover e mini-pill. A1.3: "+" diventa "+N". Font della pill su `--obrt-font-ui`. | `src/initiativeCardCompact.js` (`__buildCompactEffectPill`, `buildCompactCardStatus`, `syncCompactEffectsToggleState`), `src/compactEffectsPopover.js`, `src/effectSummaryViewCore.js` | basso |
| **3.2 Tipografia e gerarchia** | A1.1: nome 11px, HP 10px con il valore in evidenza, badge e linguetta del round ≥10px. Card 92×120 o come deciso in D1. | `src/initiativeCardCompact.js` (`buildCompactCardName`, `buildCompactCardHP`, `compactStatusBadge`), `compact-round-tab.html`, `src/trackerQuickActions.js` | basso. ⚠ solo se D1 cambia la card: in quel caso anche `src/constants.js` e `src/trackerCompactSizingCore.js` |
| **3.3 Badge e card speciali** | A1.4: card EP più basse o con etichetta "Azione epica di …". A1.8: posizioni coerenti di KO, EP/E/L e iniziativa. | `src/initiativeCardCompact.js` (`buildCompactCardIndicators`, `buildCompactCardShell`) | basso. Non toccare gli ID virtuali, solo il disegno |
| **3.4 Pannello destro e barra sinistra** | **Prima di tutto**: la seconda riga della griglia è tagliata in OBR e il badge "LOCALE" ci sta sopra; il pannello deve contenere tutti i pulsanti per intero. A1.5: etichette sotto le icone e "Focus token" come toggle ≥24px. "Pill selezione" va nel menu "…" con un nome chiaro (es. "Etichette sulla mappa"). A1.6: ☰ diventa icona grip. | `src/initiativeToolbar.js`, blocchi del pannello in `src/initiativeList.js` (`:1881`, `:1922-1935`, `:3017-3028`), `src/compactAdminMenu.js` | medio: `initiativeList.js` va toccato solo nei blocchi indicati |
| **3.5 Hit target** | A1.7: area ≥24px per ×, launcher, "+N", pill cliccabile, icone e maniglia di resize, senza ingrandire il disegno. | `src/initiativeCardCompact.js`, `src/trackerQuickActions.js`, `src/cardIconButton.js`, `src/trackerCompactResize.js` | basso |
| **3.6 Scorrimento (e popover, facoltativo)** | A1.8: sfumatura sul bordo destro quando ci sono altre creature oltre la vista. Facoltativo: popover effetti verso l'alto, così non copre la barra di OBR (in stanza non esce dallo schermo). | `src/initiativeList.js` (apertura del popover effetti, `:9463`), `src/compactEffectsPopover.js` | basso; medio se si tocca il popover |

*Fatto quando:* tutti gli obiettivi della sezione 1 sono veri per la vista compatta, sia GM che giocatore, sia a scala 100% che 150%.

**Stato.**
- **3.1 — fatto il 2026-10-22** (branch `ui-polish/fase-3`).
  - Pill della card, del popover e mini-pill in anteprima: da blocco centrato con "…" a destra, mai più tagliate sui due lati.
  - Il "+" diventa "+N".
  - La "×" delle capacità di classe è ancorata al bordo destro della pill.
  - Font su `--obrt-font-ui`.
  - Nella card il margine interno della pill scende a 2px, così nomi come "Pozione di Eroismo" restano interi; sulla card attiva mancano ancora pochi pixel (lotto 3.2).
  - Pagina di prova: `test-support/ui-audit-browser/pills.html`. Prima/dopo in `docs/ui-audit/after/3.1-pill/`.
- **3.2 — in parte fatto il 2026-10-22.**
  - Nome 11px, HP 10px in grassetto con cifre allineate, badge (KO, EP, E, L, xN) 10px, riepilogo velocità sulla linguetta del round 10px, editor del nome 11px. Tutto tramite i token.
  - La card resta 92×120 (D1): le nuove misure stanno nelle righe esistenti.
  - **Resta da fare:** il valore HP evidenziato rispetto a "HP" e "/ max" richiede di toccare `syncTrackerHPNow()` in `src/initiativeList.js`, che riscrive il testo HP a ogni cambio. È un'area fragile (sync HP), quindi serve l'approvazione.
  - **Ancora sotto i 10px:** le pill (8px), le mini-pill (7px) e le etichette delle strisce "Token collegati" ed "Evocazioni" (8px). Portarle a 10px aumenta i troncamenti dentro una card larga 92px, quindi è una scelta da fare.
  - Prima/dopo in `docs/ui-audit/after/3.2-tipografia/`.

### Fase 4 — Vista classica

| Lotto | Contenuto | Rischio |
|---|---|---|
| **4.1 Pill fuori dalla card** | Bug 5.2 / A2.1, confermato in OBR: espandendo con "+", l'altezza della riga deve contare tutte le righe di pill. | ⚠ medio: misura di layout vicina al render. Va identificata la funzione esatta prima di modificare. |
| **4.2 Coerenza della riga** | A2.2: durata "(0)" omessa. A2.3: linguette Epica/Boss Epico senza collisioni. A2.4: icone accanto agli HP in slot fissi. A2.6: etichetta "Incantesimi". | basso |
| **4.3 Intestazione** | A2.5: "Svuota" separato da "+" e "✎", con tono "danger". | basso (la rete di sicurezza è nel lotto 6.3) |

### Fase 5 — Pannelli e modali

Può partire subito dopo la fase 2, in parallelo alle fasi 3 e 4: tocca file diversi.

| Lotto | Contenuto |
|---|---|
| **5.1 Bottoni** | Classi comuni in `ui-typography.css`: `.obrt-btn` con varianti `primary`, `secondary`, `danger`, `ghost`, `icon`. Migrazione pagina per pagina, partendo da quelle più usate al tavolo: console effetti, Condizioni, incantesimi. |
| **5.2 Header, chiusura e footer** | Un solo bottone di chiusura (28px, `×`) e una sola struttura di header e footer per tutte le modali. |
| **5.3 Notice e avvisi** | turn-notice, speed-warning, concentration-warning, boss-link-notice, zone-trigger-notice: includere `ui-typography.css`, testo ≥10px, titoli in `--obrt-font-display` (D5). |
| **5.4 Opzioni e lingua** | A3.2 secondo D6. Nomi chiari al posto di "Pill selezione/espanse/compatte". |
| **5.5 Console effetti** | A3.3: via il riquadro vuoto, campo "Valore" vicino ai bersagli. |

### Fase 6 — Flussi e riduzione dei clic (gruppo B)

Un lotto per volta, nell'ordine della tabella (dal rapporto beneficio/rischio più alto). Ogni lotto con ⚠ presenta prima il piano e aspetta l'approvazione.

| Lotto | Voce | Effetto | Rischio |
|---|---|---|---|
| **6.1** | B1 secondo D2: la console apre "Danno" quando l'ingresso è un'azione di danno | −1 clic per ogni danno | basso |
| **6.2** | B8: scheda personaggio dal compatto in un clic | −1 clic | basso |
| **6.3** | B5 secondo D3: toast "Annulla" per Svuota e Reset round | sicurezza | medio (cronologia e undo) |
| **6.4** | B2: HP modificabili dalla card compatta, riusando l'editor del classico | danno da 3 clic a 1 | ⚠ sync HP, editor inline e guardie di `renderAll()` |
| **6.5** | B4: iniziativa modificabile nel compatto (`data-badge="init"`) | "Compila iniziativa" apre l'editor anche sulla card compatta | ⚠ ordine di iniziativa |
| **6.6** | B3: condizioni rapide; il popover effetti diventa un pannello con toggle e × | aggiunta da 5 clic a 2 | ⚠ metadata delle condizioni e automazioni |
| **6.7** | B7: "Danno/cura…" e "Condizioni…" nel menu contestuale del token | meno passaggi dalla mappa | basso |
| **6.8** | B6 e B9: scorciatoie da tastiera per il turno, maniglia di riordino a parità di iniziativa | — | ⚠ turno attivo (stesse code dei pulsanti) |

### Fase 7 — Rilascio

1. Giro completo dell'anteprima, con screenshot finali in `docs/ui-audit/after/finale/`.
2. Giro manuale in OBR con la checklist di `docs/audits/SMOKE-CHECKLIST-MANUALE.md`, più i punti della fase 0b.
3. Aggiornare `docs/GUIDA_UTENTE.md` per i flussi cambiati.
4. Build e versione secondo la procedura abituale (`npm run build`, `verify:version`, `verify:dist`).

---

## 6. Cosa può girare in parallelo

Ogni flusso in una sessione separata con il proprio worktree.

| Flusso | Lotti | Note |
|---|---|---|
| Flusso 1 | 3.1 → 3.2 → 3.3 → 3.5 | Tutti su `initiativeCardCompact.js`, quindi **in serie**. |
| Flusso 2 | 5.1 → 5.2 → 5.3 → 5.4 → 5.5 | File delle modali, nessuna sovrapposizione con il flusso 1. |
| Flusso 3 | 4.2, 4.3 | `initiativeCardClassicBuilder.js`. |

**Mai in parallelo con un altro lotto che tocca `initiativeList.js`:** 3.4, 3.6, 4.1 e tutta la fase 6. Questi lotti vanno uno per volta.

---

## 7. Modello del brief per ogni sessione

```
Lotto <n> del polishing UI di Take Initiative. Rispondi in italiano.
Leggi AGENTS.md, docs/AUDIT_UI.md (voci <codici>) e docs/PIANO_POLISHING_UI.md (lotto <n>).

Obiettivo: <una riga dal piano>.
File e funzioni: <dal piano>. Non toccare altro senza chiedere.
Vincoli: niente metadata, niente guardie di renderAll(), niente logica di turno attivo;
token --obrt-* al posto dei valori hardcoded; test di misura aggiornati nello stesso commit.

1. Screenshot "prima" con test-support/ui-audit-browser/ in docs/ui-audit/after/<lotto>/.
2. Spiega la patch prevista (se il lotto è ⚠, fermati e aspetta l'approvazione).
3. Applica la patch più piccola possibile.
4. npm test; screenshot "dopo".
5. Riporta: file cambiati, cosa è cambiato, esito dei test, prima/dopo.
```
