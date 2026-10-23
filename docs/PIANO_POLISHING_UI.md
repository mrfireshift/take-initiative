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
  - **Valore HP evidenziato — fatto con approvazione.** "HP" e "/ max" sono attenuati e il valore è in grassetto pesante. `writeCompactHPText()` è usata sia dalla card sia da `syncTrackerHPNow()`. In `syncTrackerHPNow()` è cambiata solo la riga che scrive il testo; i dati non sono toccati. La funzione non lancia mai errori: in caso di problemi scrive il testo semplice e la barra viene aggiornata comunque. È coperta da test unitari e da un test di contratto sul sorgente.
  - **Ancora sotto i 10px:** le pill (8px), le mini-pill (7px) e le etichette delle strisce "Token collegati" ed "Evocazioni" (8px). Portarle a 10px aumenta i troncamenti dentro una card larga 92px, quindi è una scelta da fare.
  - Prima/dopo in `docs/ui-audit/after/3.2-tipografia/`.
- **3.3 — fatto il 2026-10-22.**
  - Le card dei turni virtuali (azione epica, tana) mostrano sotto il nome un'etichetta tratteggiata "Azione epica" / "Azione di tana" al posto dello spazio vuoto. La larghezza resta uguale, perché il calcolo della larghezza del tracker dipende da essa.
  - I badge d'angolo (iniziativa, KO, E/EP/L/xN) sono tutti 24×24 a 6px dal bordo. Il KO di un boss epico o di un gruppo si impila sotto (34px) invece di coprire la E o la xN.
  - Il ritratto del boss passa da 59 a 57px e tutti i ritratti hanno 4px sopra. Sotto il boss il nome scende di 5px, così esce dall'anello della cornice. La card resta alta 120px.
  - Il KO creato al volo da `syncTrackerHPNow()` mantiene ancora le misure vecchie (21px, in alto) per circa 100ms, finché il rendering incrementale non ricostruisce la card. Non ho toccato la funzione: l'approvazione copriva solo la scrittura del testo HP.
  - Verifica con le misure del DOM nell'anteprima, perché il pannello non produceva screenshot:

    | Misura | Prima | Dopo |
    |---|---|---|
    | Fondo della cornice del boss | 78px | 73px |
    | Inizio del nome del boss | 70px | 71px (le lettere iniziano ~3px sotto) |
    | Badge E/EP/L | 24×27 | 24×24 |
    | Badge KO | 21×24 | 24×24 |
    | Badge iniziativa | 25×25 | 24×24 |
    | KO di un boss epico a 0 HP | sopra la E (7px) | sotto la E (35px) |
- **3.4 — fatto il 2026-10-22.**
  - **Pannello destro.** Ogni strumento ha l'etichetta sotto l'icona (10px). I pulsanti passano da 34 a 42px. I margini laterali del pannello scendono da 6 a 4px, così le colonne sono larghe 52px senza allargare il pannello (116px).
  - **Pill selezione.** Esce dal pannello compatto e diventa la voce "Etichette mappa: …" del menu "…". La voce mostra la modalità attuale; ogni scelta passa alla successiva, con una notifica. Nella vista classica il selettore resta dov'era.
  - **Focus token.** Nel compatto è un interruttore 107×28: la checkbox è nascosta e lo stato si vede dal colore. Da spento ha bordo e fondo leggeri in entrambe le viste, così si riconosce come pulsante.
  - **Maniglia.** L'icona ☰ diventa una griglia di 2×3 puntini: ☰ si legge come "menu", e il menu è "…".
  - Il badge "LOCALE" non l'ho toccato: compare solo nelle build `npm run dev`.
  - Verifica con le misure del DOM nell'anteprima:

    | Misura | Prima | Dopo |
    |---|---|---|
    | Fondo dell'ultimo pulsante, tracker a 150px (spazio disponibile 139px) | 150px, tagliato | 138px, intero |
    | Etichette sotto le icone | assenti nel compatto | intere a 10px |
    | Checkbox Focus token | 13×13 | interruttore 107×28 |
    | Etichette mappa da menu | — | da "solo selezione" a "compatte", notifica, voce aggiornata |
- **3.5 — fatto il 2026-10-22.**
  - `src/hitAreaCore.js` aggiunge ai controlli piccoli un quadrato trasparente di 24×24 centrato su di loro. Il disegno non cambia; cambia solo l'area che risponde al clic.
  - Applicato a: "×" delle capacità di classe, "+N", launcher ⚡🪄🗡️, icone tonde della card classica (scheda personaggio, ±, ± del gruppo, reazione).
  - La pill cliccabile riceve una fascia alta 24px, larga quanto il suo spazio, dietro di sé; i clic passano alla pill.
  - Perché l'area della "×" possa uscire dalla pill, la pill ritaglia con un margine di 8px (`overflow: clip` + `overflow-clip-margin`); il testo finisce ancora con "…". Dove `overflow-clip-margin` non è supportato (Safari), l'area resta limitata all'altezza della pill, come prima.
  - I launcher vicini distano 17–20px, quindi le loro aree si sovrappongono di qualche px; lì risponde il launcher successivo.
  - **Escluse le maniglie di ridimensionamento** (12px sul bordo del tracker): allargarle coprirebbe la colonna di sinistra (a 2px) e il pannello destro, che la maniglia di destra già oggi copre per 5px.
  - Verifica con `elementFromPoint` nell'anteprima: la fascia della pill risponde fino a 5px sopra e sotto; "+1" (23×17 disegnato) su 24px; la "×" (10×10) fino a 6px sopra e sotto e 8px ai lati.
- **3.6 — fatto il 2026-10-22.**
  - Nella vista compatta la striscia sfuma per 28px il bordo dietro cui ci sono altre creature: il destro all'inizio, entrambi a metà, il sinistro in fondo. Se la striscia sta tutta nella vista, nessuna sfumatura.
  - È solo presentazione: `compactScrollFadeEdges()` (`src/compactScrollFadeCore.js`) legge la posizione di scorrimento e due attributi `data-fade-*` attivano una maschera CSS. L'aggiornamento avviene a ogni scorrimento e quando cambiano le dimensioni della striscia o delle card (ResizeObserver). La vista classica non è toccata.
  - Il popover degli effetti verso l'alto, facoltativo, non è stato fatto: in OBR non esce dallo schermo.

### Fase 4 — Vista classica

| Lotto | Contenuto | Rischio |
|---|---|---|
| **4.1 Pill fuori dalla card** | Bug 5.2 / A2.1, confermato in OBR: espandendo con "+", l'altezza della riga deve contare tutte le righe di pill. | ⚠ medio: misura di layout vicina al render. Va identificata la funzione esatta prima di modificare. |
| **4.2 Coerenza della riga** | A2.2: durata "(0)" omessa. A2.3: linguette Epica/Boss Epico senza collisioni. A2.4: icone accanto agli HP in slot fissi. A2.6: etichetta "Incantesimi". | basso |
| **4.3 Intestazione** | A2.5: "Svuota" separato da "+" e "✎", con tono "danger". | basso (la rete di sicurezza è nel lotto 6.3) |

**Stato.**
- **4.1 — fatto il 2026-10-22** (branch `ui-polish/fase-3`).
  - **Cause trovate:** in `src/initiativeChipOverflow.js` la riga aperta con "…" era volutamente sovrapposta e non contava nell'altezza della card. In più, quando la lista è più alta del suo spazio, la colonna flessibile comprimeva la card fino al proprio contenuto (95px), ignorando l'altezza misurata. Per questo nell'anteprima anche le card con due righe di pill si sovrapponevano al primo rendering.
  - **Correzione:** `syncChipDockCardHeight()` conta anche la riga aperta e fissa anche l'altezza minima. Il clic su "…" / "−" ricalcola subito l'altezza.
  - Nessun cambiamento a turno attivo, HP, ordine o metadata.
  - **Verifica con misure di layout nell'anteprima.** Goblin capobanda con 4 condizioni: da chiuso card 95px; da aperto card 113px, riga aperta fino a 110px, card successiva da 101 a 119px; richiuso torna a 95. Tutte le card con due righe di pill ora le contengono.
  - **Segnalato in OBR (2026-10-22):** la card di azione epica sembrava non essere spinta dalle pill. In realtà scende, ma la sua linguetta "Azione Epica" sporge 6px sopra il bordo e arrivava al fondo della card precedente: con la card precedente attiva (ingrandita del 3,5% e con l'alone) finiva sulle pill.
    - **Correzione:** le card con linguetta ("Azione Epica", "Boss Epico") tengono sopra di sé lo spazio della linguetta come margine (6px, da `classicEpicTagOverhang()`). Anticipa la parte A2.3 del lotto 4.2.
    - **Verifica:** Klos con le pill aperte seguito da un'azione epica. Prima c'erano 0px tra la card e la linguetta, ora 6px (circa 4px con la card attiva); tra le pill e la linguetta 9px. Il margine compare solo sulle card con linguetta.
- **4.2 — fatto il 2026-10-22** (direttamente su `main`).
  - **A2.2.** Un incantesimo senza round registrati non mostra più "(0)" nella pill né "Durata: 0 round" nel pannello: niente contatore, "durata non indicata". Lo 0 registrato davvero resta 0 (`spellRecordedTurns()`).
  - **A2.3.** Fatta con la segnalazione del lotto 4.1 (margine sopra le card con linguetta).
  - **A2.4.**
    - Una prima versione (posti fissi all'estremità destra della riga) è stata scartata dopo la prova in OBR: le icone finivano lontane dagli HP e il posto vuoto del ± le separava.
    - **Versione scelta:** le icone stanno subito dopo il valore HP, che ha una larghezza minima fissa (`7ch`, cifre a larghezza uguale), nell'ordine reazione, scheda, ±. Ci sono solo quelle presenti, senza buchi. Lo stesso ordine vale per le righe dei boss.
    - **Verifica:** sulle card normali, reazione a 128px e seconda icona a 148 (vista GM e giocatore); +4px sulla card attiva. Sui boss reazione a 141 e ± a 160: 13px più a destra, perché il ritratto del boss è più grande e il testo HP parte più avanti.
    - **Dopo la prova in OBR:** le icone toccavano quasi la barra HP (1px). Ora sono disegnate a 16px invece di 18 (l'area cliccabile resta 24px) e alzate di 2px: 3px dalla barra e 2px dal nome sulle card normali, 4px dalla barra sui boss.
  - **A2.6.** Le didascalie dei pulsanti non hanno più margine interno e finiscono con "…" se troppo lunghe. "Incantesimi" a 7,5px ha ora 4,4px di margine invece di toccare i bordi.
  - **Da decidere:** le didascalie della barra classica restano a 7,5px, sotto l'obiettivo dei 10px. A 10px "Incantesimi" richiede circa 51px contro i 44 disponibili, quindi servirebbe riorganizzare la barra (per esempio due righe di pulsanti), togliendo circa 46px alla lista.
- **4.3 — fatto il 2026-10-22.**
  - Nell'intestazione classica "Svuota iniziativa" (×) non sta più nel gruppo con "+" (Aggiungi attori) e "✎" (Compila iniziativa). Va in fondo, dopo Opzioni e Cronologia, separato da una linea verticale e con il suo tono rosso.
  - Lo spazio viene dai margini laterali del pulsante di cambio vista (8px). Nella vista compatta resta nel menu "…" e la linea è nascosta.
  - **Verifica:** "×" a 279–305px, a 100px dal "+" (prima adiacente); l'intestazione ci sta come prima (1px libero).
  - **Problema preesistente annotato:** con il round a due cifre ("Round 12", 68px di testo) l'intestazione classica GM è già più stretta del necessario e il testo del round può essere tagliato.
  - La rete di sicurezza (toast "Annulla") resta per il lotto 6.3.

### Fase 5 — Pannelli e modali

Può partire subito dopo la fase 2, in parallelo alle fasi 3 e 4: tocca file diversi.

| Lotto | Contenuto |
|---|---|
| **5.1 Bottoni** | Classi comuni in `ui-typography.css`: `.obrt-btn` con varianti `primary`, `secondary`, `danger`, `ghost`, `icon`. Migrazione pagina per pagina, partendo da quelle più usate al tavolo: console effetti, Condizioni, incantesimi. |
| **5.2 Header, chiusura e footer** | Un solo bottone di chiusura (28px, `×`) e una sola struttura di header e footer per tutte le modali. |
| **5.3 Notice e avvisi** | turn-notice, speed-warning, concentration-warning, boss-link-notice, zone-trigger-notice: includere `ui-typography.css`, testo ≥10px, titoli in `--obrt-font-display` (D5). |
| **5.4 Opzioni e lingua** | A3.2 secondo D6. Nomi chiari al posto di "Pill selezione/espanse/compatte". |
| **5.5 Console effetti** | A3.3: via il riquadro vuoto, campo "Valore" vicino ai bersagli. |

**Stato.**
- **5.1 — fatto il 2026-10-22.**
  - `public/ui-typography.css` ha i token dei bottoni (`--obrt-btn-*`: altezza, raggio, bordo, sfondo base, primario, pericolo, opacità da disabilitato) e le classi comuni `.obrt-btn`, `--primary`, `--danger`, `--ghost`, `--icon` per il codice nuovo. La base fa da "secondario".
  - **Migrazione senza rinominare:** le classi esistenti leggono i token, così markup, JavaScript e test non cambiano. Classi coinvolte: console effetti (`.small`, `.apply`), Condizioni (`.effects-btn`, `-primary`, `-danger`), Incantesimi (base comune, `.unified-primary-button`). Le varianti di significato restano locali: per esempio il pulsante Applica rosso per il danno e verde per la cura.
  - **Verifica (valori calcolati nell'anteprima):** base con raggio 8px, bordo grigio al 28% e sfondo bianco al 5,5%, uguale nelle tre pagine; primario blu `#2563eb`, bordo bianco al 20%, grassetto; pericolo rosso tenue, uguale ovunque.
  - "Rimuovi selezionati" disabilitato ha opacità 0,5 scritta dal codice (`effects-modal.ts`) invece di 0,48: differenza trascurabile, lasciata.
  - **Esteso** (stesso giorno) a Opzioni (`options-modal.css`), Orologi (`clocks.css`) e Aure (`custom-aura.css`): base, primario (non più sfumato) e pericolo leggono i token, con valori di riserva nei `var()`. Verifica: "Annulla"/"Salva opzioni", "Crea" dell'orologio e "+ Nuova aura" hanno gli stessi valori degli altri pannelli. Nelle Aure il bottone disabilitato non diventa più grigio pieno, ma usa la stessa opacità degli altri.
  - **Avvisi** (turn-notice, concentration-warning): i loro bottoni sono mini-controlli alti 19px con testo a 8,5px e il colore dell'avviso. Per ora condividono solo l'opacità da disabilitato; misure e testo a 10px vanno nel lotto 5.3.
- **5.2 — fatto il 2026-10-22.**
  - `public/ui-typography.css` ha i token della cornice dei pannelli (`--obrt-close-*`, `--obrt-header-*`, `--obrt-title-*`, `--obrt-footer-*`) e le classi `.obrt-modal-header`, `-title`, `-close` e `-footer` per il codice nuovo. Come per i bottoni, le classi esistenti leggono i token con valori di riserva, senza rinominare nulla.
  - **Chiusura unica** (28×28, glifo 18px, raggio 8, sfondo al passaggio) su 11 pagine: console effetti, Condizioni, Incantesimi, Opzioni, Cronologia, Aure, HP condivisi, Fazioni, Aspetto area, Enciclopedia, scheda personaggio. Prima c'erano 30px, 22px di glifo, raggio 9 e, in Aspetto area, un fondo pieno.
  - **Intestazione comune** (44px + bordo, margini 8/12, bordo uguale, titolo 16px grassetto): console, Condizioni, Incantesimi, Opzioni (prima 58px), Cronologia (prima 42px), Aure, HP condivisi. Opzioni, Aure e HP condivisi risultano più alte solo per il contenuto in più (sottotitolo o pulsante).
  - **Footer** con lo stesso bordo e la stessa spaziatura dove esiste: console, Incantesimi, Opzioni, Aure, HP condivisi, Fazioni.
  - `&times;` e `×` sono lo stesso carattere: markup invariato.
  - **Esclusi di proposito:** i popover di risoluzione degli incantesimi (`spell-popover.css`, tema viola con titoli in Georgia) e quello degli incantesimi preparati, da trattare con gli avvisi nel lotto 5.3; l'intestazione con ritratto della scheda personaggio; la `.zone-close` degli avvisi di turno, che è CSS non usato.
- **5.3 — fatto il 2026-10-22.**
  - **Pagine:** avvisi (turno, velocità, concentrazione, collegamento boss, zone) e popover di risoluzione (incantesimo attivo, incantesimi preparati, palla di fuoco ritardata, scelta dell'azione a turno, `spell-popover.css`).
  - **`ui-typography.css` incluso** prima degli stili delle pagine, che mantengono la precedenza.
  - **Nessun testo sotto i 10px:** 35 dichiarazioni portate a `--obrt-type-micro` (10px), contro i 7–9,5px di prima.
  - **Titoli** su `--obrt-font-display`, che vale Georgia.
  - **Badge del round/ciclo:** passano da 38–40px a 44px (42px su schermo stretto) e l'etichetta ha la spaziatura delle lettere a zero, così "ROUND" a 10px ci sta. A destra c'è il margine dell'avviso, quindi il badge non tocca il titolo.
  - **Bottoni di risoluzione degli avvisi:** alti 24px (prima 19).
  - **Popover di risoluzione:** chiusura 28px come le modali (prima 22–24px senza bordo); il disabilitato usa l'opacità comune. Il tema viola (`--obrt-spell-*`) resta.
  - **Verifica:** l'avviso di turno aperto nell'anteprima con un messaggio simulato (round 12, nome lungo). Etichetta "ROUND" 37,6px nei 40px del badge, titolo che finisce 3px prima del badge, titolo in Georgia tramite il token, nessun testo sotto i 10px. Gli altri avvisi e i popover sono verificati solo sul CSS: le loro schede compatte (zone, tiri salvezza) vanno controllate in OBR, perché il testo più grande può allungarle.
- **5.4 — fatto il 2026-10-22.**
  - **Opzioni in italiano (D6).**
    - "Room" → "Stanza" (selettore e badge); "Combat Log" → "Registro combattimento".
    - "Player" → "giocatori" (Vista giocatori, HP dei giocatori, Effetti per i giocatori, Anteprima per i giocatori).
    - "Reminder" → "Promemoria"; "Spell"/"spell" → "Incantesimi"/"incantesimi"; "Popup cambio turno" → "Avviso di cambio turno".
    - "Mini-pill" → "Dettagli sotto le etichette"; "Layout" → "Vista e posizione del tracker"; On/Off → Attivo/Spento.
    - Anche il riepilogo generato da `options-modal.js` è tradotto.
    - Restano i nomi propri e di OBR: Take Initiative, Embers/JB2A, GM, token.
    - Un test controlla che nel testo visibile non tornino i termini inglesi.
  - **Etichette sulla mappa al posto di "Pill".** Le tre modalità sono:
    - "compatte su tutti i token";
    - "complete su tutti i token";
    - "complete sui selezionati, compatte sugli altri".

    Nel selettore stretto della vista classica (55px) compaiono "Compatte", "Complete" e "Su selezione"; il nome completo è nel suggerimento. Nel menu "…" la voce è "Etichette mappa" con la modalità su una seconda riga. Il vecchio "solo selezione" era fuorviante, perché gli altri token restano visibili in forma compatta.
  - **Verifica:** nel menu la voce sta intera (contenuto 250px su 250); nel selettore classico le tre parole stanno nei 55px; nelle Opzioni non c'è testo inglese.
  - Resta da allineare il resto del plugin, dove compaiono ancora "reminder" e "spell" (avvisi, scheda, pannelli): nella fase 7, insieme alla Guida utente.
- **5.5 — fatto il 2026-10-22.**
  - **Riquadro vuoto:** era la riga dei messaggi di stato sotto "Imposta selezionati", con altezza minima e bordo anche senza messaggio. Ora è nascosta quando è vuota e ricompare con un messaggio.
  - **Campo Valore:** passa dall'angolo in alto a destra al footer, subito prima di "Applica". L'ordine dall'alto in basso diventa modalità, bersagli, valore, applica. Lo script lo trova per id: focus all'apertura e Invio funzionano come prima.
  - **Verifica nell'anteprima:**
    - riga di stato nascosta (0px) e visibile con un messaggio (30px);
    - Valore a sinistra di "Applica danno";
    - cursore nel Valore all'apertura;
    - Danno a Omar con 5 e Invio: da 78 a 73 HP.
- **Fase 5 completa.**

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

Stato dei lotti:

- **6.1 — fatto il 2026-10-22.**
  - **Come funziona:** chi apre la console può chiedere la scheda di partenza con `?mode=` (danno, cura, temporanei, effetti). Un valore sconosciuto o assente lascia "Effetti", che resta la scheda di partenza del pulsante della barra (D2).
  - **Ingressi di danno oggi:** "Seleziona e apri Console effetti ad area" dal menu del modello d'area apre su "Danno". Il clic sugli HP del compatto (6.4) e la voce "Danno/cura…" del menu del token (6.7) non esistono ancora: useranno lo stesso parametro.
  - **Verifica nell'anteprima:**
    - richiesta dall'area: URL `quick-hp-modal.html?mode=damage`, scheda attiva "Danno", opzioni dei tiri salvezza nascoste;
    - pulsante "Effetti" della barra: URL senza `mode`, scheda attiva "Effetti".
- **6.2 — fatto il 2026-10-22.**
  - **Prima:** nel compatto la scheda si apriva solo dal menu del clic destro (due clic, solo GM). I giocatori non avevano un accesso.
  - **Ora:** la stessa icona blu del classico (16px, area cliccabile 24px) sta sotto il badge dell'iniziativa, sul suo asse. Compare per PG e alleati, nella vista GM e in quella giocatori, come nel classico; un gruppo collassato non la mostra.
  - **Perché lì:** l'angolo in alto a destra è del badge KO, che un PG a 0 HP mostra, e sulla destra stanno i lanciatori del GM.
  - **Gesti della card:** il clic sull'icona non seleziona il token e non avvia il trascinamento.
  - **Verifica nell'anteprima:**
    - icona su Omar, Lavera, Klos, Brann e Lupo alleato, assente su nemici, boss e turni virtuali;
    - posizione 11px da sinistra e 35px dall'alto, sotto il badge (7–31px), lontana dai lanciatori;
    - clic su Lavera (GM): si apre `initiative-card-modal.html?source=lavera`, selezione invariata;
    - vista giocatore: stesse cinque card, il clic su Omar apre la sua scheda.
- **6.3 — fatto il 2026-10-22.**
  - **Toast:** dopo "Svuota iniziativa" e "Reset round" compare in basso nel tracker (solo GM) "Iniziativa svuotata · Annulla" o "Round riportato a 1 (era N) · Annulla". Dura 8 secondi, si chiude con ×; un toast nuovo sostituisce il precedente. Vale per il classico e per il menu ⋯ del compatto, che usano gli stessi pulsanti.
  - **Perché non la cronologia:** registra i flag `inInitiative` dei token, non ordine, turno e round. Il toast salva lo stato prima dell'azione (`initiativeUndoCore.js`).
  - **Annulla di Svuota:**
    - riscrive prima ordine, turno, round e gruppi, poi rimette `inInitiative` sui token (unendo i metadata);
    - in quest'ordine si passa da un ordine vuoto a quello salvato, quindi nessun turno o round risulta passato: durate invariate, nessun avviso di turno;
    - al contrario, la riconciliazione costruirebbe un ordine nuovo, e rimettere il turno sopra farebbe scattare gli effetti;
    - se nel frattempo è iniziato un altro combattimento non sovrascrive niente e lo segnala;
    - il movimento contato per il controllo velocità non torna: riparte come a inizio turno.
  - **Annulla di Reset round:**
    - rimette il round se è ancora 1, segnato come un passo indietro, come fa ◀, così i turni intermedi non scattano di nuovo;
    - resta il solo conteggio dei round, opposto a quello del reset: le durate tornano come prima.
  - **Verifica nell'anteprima:**
    - reset da round 4, turno 3: il toast compare, Annulla torna a round 4, turno 3, con le durate identiche (6 / 3,5 / 2 / 1);
    - Svuota a round 4, turno 3: ordine (13 voci con le Azioni epiche), turno con Lavera attiva, round, token in iniziativa e durate tornano identici;
    - un gruppo inventato in `seededGroups` viene scartato dalla riconciliazione, come per qualunque gruppo che non esiste;
    - toast visibile nel compatto (sopra il fondo delle card) e nel classico (in fondo al pannello); nessun errore in console.
- **6.4 — fatto il 2026-10-22.**
  - **Cosa:** il GM clicca sul testo "HP 78 / 100" della card compatta e si apre l'editor in linea del classico: due campi, HP e massimo, con valore, delta (`-7`, `+5`) o calcolo. Invio conferma, Esc annulla, Tab va al massimo e poi alla card successiva.
  - **Stesso percorso:** `bindHPEditorForEntry` con il suo salvataggio (gruppo, cronologia, avviso di concentrazione). Cambia solo il formato del risultato (`compactHPTextHTML`, identico a `writeCompactHPText`).
  - **Dove:** solo GM, e non su gruppi collassati, turni di Tana, azioni epiche e HP non esatti, come nel classico. Solo il testo apre l'editor, la barra no (scelta dell'utente). Il compatto non ha il pulsante ±: il massimo si cambia nel secondo campo.
  - **Etichette:** il testo riceve `data-badge="hp"` e `data-item-id` come la pillola del classico, così il passaggio tra editor, il Tab e le guardie di `renderAll()` lo trovano senza modifiche.
  - **`syncTrackerHPNow`:** non scrive il formato classico nel testo compatto, e non lo riscrive mentre è in modifica; un aggiornamento che arriva da altrove aggiorna solo la barra.
  - **Aspetto in modifica:** su richiesta dell'utente (2026-10-23) niente sfondo né bordo, ma una differenza minima: "HP 78 / 100" resta al suo posto, tutto bianco al peso dei massimi (600), con una riga leggera sotto i due numeri; campi larghi quanto il numero (`field-sizing`, 3ch dove non c'è). Regole in `index.html`; l'editor condiviso non cambia.
  - **Verifica nell'anteprima:**
    - editor solo sulle card giuste (non sulle azioni epiche); il clic non seleziona il token;
    - Lavera `-7` e Invio: da 98 a 91, testo "HP 91 / 98", barra al 92,9%, voce "Modifica HP" in cronologia, avviso di concentrazione;
    - Tab dal massimo di Auril apre l'editor di Lavera, saltando l'azione epica in mezzo;
    - HP di Lavera portati a 40 da fuori con l'editor aperto: campi intatti, barra al 40,8%; alla chiusura resta 40, nessuna scrittura del valore vecchio.
- **6.5 — fatto il 2026-10-23** (in pausa durante la revisione qui sotto).
  - **Cosa:** il GM clicca sul badge di iniziativa della card compatta e si apre l'editor del classico (`bindInitiativeEditorForEntry`): stesso salvataggio (`updateInitiative`, gruppo, riconciliazione e riordino), Invio salva e passa alla card successiva, Esc annulla.
  - **"Compila iniziativa" nel compatto:** prima non trovava badge e rispondeva "Non ci sono iniziative da compilare". Ora apre la prima creatura da compilare, evidenzia col bordo tratteggiato le altre, passa avanti con Invio o Tab, chiude con Ctrl+Invio e riordina alla fine. Il suo codice non cambia.
  - **Dove:** solo GM; card normali e gruppi collassati (l'iniziativa di tutto il gruppo, come nel classico); non turni di Tana, azioni epiche e Boss Epico.
  - **Aspetto:** in modifica il badge è largo 30px, il campo scrive a 12px (l'editor condiviso scrive 15px per il badge più grande del classico) e ha il bordo azzurro (regole in `index.html`).
  - **Verifica nell'anteprima:**
    - Lupo da 7 a 22 con Invio: valore e `initTouched` sul token, il Lupo passa dopo Omar, l'editor si apre sulla card successiva; Esc annulla senza scrivere;
    - "Compila iniziativa": Omar, Lavera e Klos compilati in fila, evidenziazione che si toglie a ogni Invio, Ctrl+Invio chiude, ordine finale corretto;
    - durante la compilazione l'ordine nello stato si aggiorna mentre le card restano ferme, esattamente come nel classico.
  - **Nota aperta:** nel classico anche i giocatori aprono l'editor dell'iniziativa e il valore finisce sul token; da chiarire se è voluto.

#### Revisione della barra compatta (dopo un test in OBR, 2026-10-23)

Quattro problemi visti dall'utente in una stanza reale, un commit ciascuno.

1. **Round dentro la barra.** Non è più un popover separato sopra la barra: sta nella colonna sinistra, tra la maniglia e i pulsanti, per GM e giocatori ("Round" a 10px sopra il numero a 22px, nel carattere dell'interfaccia perché i numeri di Georgia fanno sembrare piccolo un 1). Il classico resta "Round N" su una riga. Il popover del movimento resta separato.
2. **Lanciatori in colonna.** ⚡ 🪄 ⚔ e Boss Actions fanno una colonna a destra del ritratto, cerchi che si toccano come nel classico: non coprono più l'icona della scheda (sovrapposizione introdotta nel 6.2). Il KO passa sul fondo del ritratto; la "E" del Boss Epico resta nell'angolo e la colonna parte sotto. Anche `syncTrackerHPNow` mette il KO lì (solo la posizione).
3. **Compagni in una linguetta laterale.** Token collegati ed evocazioni non si impilano più sotto la card (la barra si allungava). Una linguetta di 22px a destra della card mostra fino a tre ritratti e il numero; aperta, le righe dei compagni (quelle del classico, con editor HP e selezione) stanno in colonne alte quanto la card e le card dopo scorrono a destra. Il classico non cambia.
4. **Effetti in un cassetto laterale.** Al posto del popover sotto la barra, la pillola o il "+N" aprono un cassetto a destra della card: le stesse pillole della card (14px, testo 8px, larghe 80px) con i dettagli, in colonne alte quanto la card; si chiude cliccando di nuovo la pillola della card (niente pulsante proprio, per lasciare spazio alle pillole). Uno aperto alla volta; scorrimento e aggiornamento della card non lo chiudono.

- **Meccanismo comune:** `appendCompactSideDock` mette un elemento oltre il bordo destro della card e allarga del margine corrispondente lo spazio della card; la larghezza automatica del tracker conta i cassetti aperti, fino al massimo. Struttura del DOM, render incrementale e guardie di `renderAll()` invariati.
- **Verifica nell'anteprima:** round nella colonna in GM e giocatori, nessun popover del round; colonna di tre lanciatori su Brann a 0 HP, con scheda e KO senza sovrapposizioni; linguetta di Auril (3) e di Lavera (10, tre colonne), righe leggibili, clic che seleziona la pedina, editor HP; cassetto degli effetti di Klos aperto e chiuso, stabile durante lo scorrimento, uno alla volta; altezza del tracker sempre 156px.
- **Da provare in OBR:** larghezza reale con cassetti aperti vicino al massimo (1180px), e la centratura automatica sulla card attiva con un cassetto aperto prima di essa.

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
