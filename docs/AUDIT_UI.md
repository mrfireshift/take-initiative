# Audit UI — Take Initiative (fase 1)

Data: 2026-10-22. Fase di sola lettura: nessun file in `src/` è stato modificato.

> **Principio guida.** Take Initiative deve semplificare il bookkeeping al tavolo.
> Meno clic si fanno, meglio è. L'interfaccia deve essere intuitiva ed elegante,
> e leggibile dallo schermo del tavolo (finestra giocatori sul monitor HDMI).

## Indice

1. [Metodo e limiti](#1-metodo-e-limiti)
2. [Le dieci priorità](#2-le-dieci-priorità)
3. [Gruppo A — solo visivi, zero cambi di comportamento](#3-gruppo-a--solo-visivi-zero-cambi-di-comportamento)
4. [Gruppo B — riduzione dei clic (cambia il comportamento)](#4-gruppo-b--riduzione-dei-clic-cambia-il-comportamento)
5. [Possibili bug emersi durante l'audit](#5-possibili-bug-emersi-durante-laudit)
6. [Design token proposti](#6-design-token-proposti)
7. [Piano delle fasi successive](#7-piano-delle-fasi-successive)
8. [Appendice — screenshot](#8-appendice--screenshot)

---

## 1. Metodo e limiti

**Anteprima usata.** `test-support/ui-audit-browser/` è una copia dell'anteprima di polishing del tracker. Rispetto all'originale ha due differenze:
- quattro creature in più: HP bassi con 4 condizioni, PG a 0 HP, nemico morto, alleato;
- il parametro `layout=compact|classic`.

È lo strumento per gli screenshot "prima/dopo" delle fasi successive:

```powershell
node node_modules/vite/bin/vite.js --config test-support/boss-actions-browser/vite.config.mjs --host 127.0.0.1 --port 5199
```

Poi si apre `http://127.0.0.1:5199/test-support/ui-audit-browser/frame.html?layout=compact`, aggiungendo `&role=PLAYER` per la vista giocatori.

**Fonti.**
- Screenshot ingranditi del tracker reale nell'SDK simulato.
- Inventario quantitativo di CSS e stili inline.
- Tracciamento nel codice dei percorsi di clic.

Ogni voce riporta `file:riga`.

**Limiti.**
- L'SDK simulato ha `OBR.modal.open` vuoto, quindi le modali (Condizioni, scheda personaggio con dati reali) non si vedono nell'anteprima: sono state lette nel codice. I popover invece funzionano (console effetti, incantesimi, menu "…", popover effetti).
- I ritratti sono segnaposto (`/quick-damage.svg`) e non dicono nulla sulla resa delle immagini vere.
- Le voci marcate **da verificare in OBR** vanno confermate in una stanza reale prima di correggerle.

---

## 2. Le dieci priorità

| # | Problema | Gruppo | Dove |
|---|---|---|---|
| 1 | Testi della card compatta troppo piccoli per lo schermo del tavolo: nome 9px, HP **8px**, pill **8px** | A | `src/initiativeCardCompact.js:606,652,276` |
| 2 | Le pill compatte tagliano il testo su **entrambi i lati**, senza puntini ("ramento di Inimicizia", "pirazione Bardica (d1") | A | `src/initiativeCardCompact.js:260-284`, `src/compactEffectsPopover.js:38-58` |
| 3 | Il "+" sotto la pill significa "mostra altri N effetti" ma si legge "aggiungi", e non dice quanti sono | A | `src/initiativeCardCompact.js:900-927` |
| 4 | Danno al singolo: 3 clic + digitazione nel compatto (1 nel classico). La console parte in "Effetti", non in "Danno" | B | `src/quick-hp-modal.js:61` |
| 5 | Aggiungere una condizione richiede 5 clic | B | `src/effects-modal.ts:251,742` |
| 6 | Nel compatto HP e iniziativa non si modificano dalla card | B | `src/initiativeCardCompact.js:617` |
| 7 | Card dei turni epici quasi vuote: con un boss epico in una stanza reale occupano 3 card su 7 della striscia (`before/18`) | A | `src/initiativeCardCompact.js` (`buildCompactCardShell`) |
| 8 | "Svuota iniziativa" (classico: a un clic dal "+") e "Reset round" agiscono senza conferma | B | `src/initiativeList.js:1644,1472` |
| 9 | Nomi incoerenti: "Effetti" apre la console HP, "Condizioni" apre `effects-modal`; "Pill selezione" agisce sulla mappa ma sta nel tracker | A | `src/initiativeList.js:1922-1935,3017-3028` |
| 10 | Il sistema di token `--obrt-*` esiste ma il tracker quasi non lo usa: 0 usi nella card compatta, 5 in `initiativeList.js` | A | `public/ui-typography.css:3-72` |

---

## 3. Gruppo A — solo visivi, zero cambi di comportamento

Patch su CSS o sugli stili inline delle funzioni di build delle card. Nessuna tocca metadata, render queue o turno attivo.

### A1. Vista compatta (priorità massima)

Screenshot: `before/01`–`08`.

**A1.1 Leggibilità a distanza.**
- Nome 9px (`initiativeCardCompact.js:606`), HP 8px (`:652`), pill 8px (`:276`), badge 9px (`:208`), input di rinomina 9px (`:794`).
- Mini-pill di summary 7px (`src/effectSummaryViewCore.js:81`), popover effetti 8px (`compactEffectsPopover.js:54`), launcher quick-actions 9px (`trackerQuickActions.js:141`), linguetta del round 8.5px (`compact-round-tab.html:124`).
- **Proposta:** soglia minima 10px a scala 100%, nome 11px, HP 10px in grassetto con il valore in evidenza ("78" più grande di "/ 100"). La scala del tracker giocatori (Opzioni → Vista Player → Dimensione tracker) resta la leva per il monitor del tavolo; i valori base devono comunque reggere al 100%.

**A1.2 Pill tagliate su due lati.**
- **Causa:** la pill è `display:inline-flex` + `justify-content:center`, con il testo come nodo diretto. Su un contenitore flex `text-overflow: ellipsis` non ha effetto, e il testo centrato che trabocca viene tagliato a destra e a sinistra.
- **Correzione:** testo dentro uno `<span>` interno con `overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0`, oppure `justify-content: safe center`.
- **Stesso schema da correggere:** `compactEffectsPopover.js:38-58`, `effectSummaryViewCore.js:65-86`, `compactStatusBadge` (`initiativeCardCompact.js:196-214`).
- La pill usa anche una `fontFamily` Helvetica hardcoded invece di `var(--obrt-font-ui)` (`:275`).

**A1.3 Il "+" degli effetti nascosti.**
- È un cerchio di 16px con il glifo `+` (`:904-911`). Il title dice "Mostra altri 3 effetti", ma a vista sembra "aggiungi condizione".
- Nel classico lo stesso concetto è "…" (screenshot `before/11`): due simboli diversi per la stessa cosa.
- **Proposta:** contatore "+3", oppure una seconda pill sintetica "+3" accanto alla prima. Stessa forma nei due layout.

**A1.4 Card dei turni epici vuote.**
- Le card "EP" (turni aggiuntivi del boss epico) hanno nome e ritratto ma nessun HP, barra o pill. Metà inferiore vuota (`before/02`, `03`).
- In una stanza reale il peso è grande: Zariel, con il turno principale più tre azioni epiche, occupa 4 delle 7 card visibili (`before/18`).
- Nella card principale del boss, il teschio, la cornice e il nome si sovrappongono: il nome "Zariel" cade sopra la cornice.
- **Proposta:** card più bassa o un'etichetta "Azione epica di Auril", così la riga non sembra rotta. Non toccare gli ID virtuali, solo il build visivo.

**A1.5 Pannello destro.**
- "Focus token" è una checkbox di 13×13px.
- Le frecce ‹ › di "Pill selezione" sono larghe 7–16px.
- La griglia 2×2 (Condizioni, Incantesimi, Effetti, Movimento) mostra solo icone: le etichette ci sono nel DOM ma sono nascoste. Nel classico le stesse icone hanno l'etichetta (`before/10`).
- La seconda riga della griglia sfiora il bordo inferiore, che ha `overflow:hidden` (`initiativeToolbar.js:184-196`). **Confermato in OBR** (`before/18`): i pulsanti Effetti e Movimento sono tagliati a metà, e il badge "LOCALE · <commit>" ci sta sopra.
- **Proposta:** etichette brevi sotto le icone (come nel classico), checkbox sostituita da un toggle a pulsante di almeno 24px. "Pill selezione" va spostata nel menu "…" o nelle Opzioni (vedi A3.2).

**A1.6 Barra sinistra.**
- L'icona ☰ è una maniglia di trascinamento (`initiativeList.js:1268`), ma ☰ significa universalmente "menu". Il vero menu è "…" più in basso.
- **Proposta:** usare un'icona "grip" (⠿ o sei puntini) per il trascinamento.

**A1.7 Hit target sotto i 24px (WCAG 2.5.8).**

| Controllo | Dimensione | Dove |
|---|---|---|
| `×` per terminare una capacità di classe | 10px | `initiativeCardCompact.js:294-296` |
| Launcher ⚡🪄🗡️ | 15px | `trackerQuickActions.js:12,129-131` |
| "+" degli effetti | 16px | `initiativeCardCompact.js:910` |
| Pill cliccabile | alta 14px | `initiativeCardCompact.js:263` |
| Icone scheda/reazione | 18px | `cardIconButton.js:5-7` |
| Maniglia di resize | larga 12px | `trackerCompactResize.js:21` |

**Proposta:** area cliccabile di almeno 24px anche quando il disegno resta più piccolo (padding trasparente o pseudo-elemento).

**A1.8 Varie compatte.**
- Il badge "KO" e il badge "EP"/"E" si sovrappongono al bordo del ritratto in modo diverso da card a card.
- Il badge "LOCALE" della build copre il bordo del pannello destro (`before/04`).
- La scrollbar orizzontale della striscia è sottile e grigia: con 9 o più creature non è evidente che ce ne sono altre a destra. Proposta: sfumatura sul bordo destro quando c'è overflow.

### A2. Vista classica

Screenshot: `before/09`–`11`, `16`.

- **A2.1 Pill fuori dalla card (confermato in OBR).**
  - In una stanza reale succede quando si espandono le pill con il "+" (che diventa "−"): la terza riga copre la card successiva (`before/17`, Karmakar sopra Zariel).
  - Nell'anteprima succede anche al primo render, con la seconda riga: "Benedizione (0)" sotto Omar e "Animare oggetti" sopra la striscia "Evocazioni" (`before/09`, `16`). Dopo un re-render il layout si sistema (`before/10`).
  - Il contenitore delle pill è `position:absolute`, quindi l'altezza della riga non conta le righe di pill oltre la prima.
- **A2.2 Durata "(0)".** Gli incantesimi senza durata mostrano "(0)" nella pill e "Durata: 0 round" nel pannello incantesimi. Meglio omettere la durata o mostrare "—".
- **A2.3 Etichette "Azione Epica" / "Boss Epico".** Linguette rosse che sporgono sopra la card e toccano la card precedente (`before/10`).
- **A2.4 Icone per riga variabili.** Le icone accanto agli HP cambiano da creatura a creatura (📄, ±, ↻): 2 o 3 icone, con posizione variabile. Vanno allineate a slot fissi.
- **A2.5 Intestazione.** "+", "✎", "×" (Aggiungi attori, Compila, **Svuota**) sono tre icone vicine dello stesso peso. Il distruttivo "×" è a un clic dal "+". Nel compatto lo stesso comando sta dentro il menu "…", in fondo e in rosso: è il trattamento corretto.
- **A2.6 Etichetta tagliata.** "Incantesimi" tocca i bordi del pulsante (`before/10`).

### A3. Pannelli e modali

- **A3.1 Bottoni senza un linguaggio comune.**
  - 36 classi bottone diverse.
  - Il bottone primario è definito in almeno 6 modi: gradiente in `clocks.css:65` e `custom-aura.css:725`, piatto in `options-modal.css:89` e `shared-hp-modal.css:40`, più variabili locali `--effects-primary` e `--unified-primary`.
  - **7 varianti** del bottone di chiusura, da 21px a 30px, con glifo `×` o `&times;`.
  - Header e footer cambiano nome classe da pagina a pagina.
- **A3.2 Lingua mista.** "Room", "Combat Log", "Player", "Questo browser" convivono con l'italiano nelle Opzioni (`before/14`). Inoltre "Pill selezione / espanse / compatte" è gergo interno.
- **A3.3 Console effetti manuali** (`before/12`, `13`). Ben fatta nel complesso. Due ritocchi:
  - un riquadro vuoto sotto "Imposta selezionati" occupa spazio senza contenuto;
  - il campo "Valore" è isolato in alto a destra, lontano dai bersagli.
- **A3.4 Notice e avvisi.** turn-notice, speed-warning, boss-link-notice e concentration-warning usano testo da **7–8.5px** (es. `turn-notice.html:172`) e titoli in Georgia serif. Sono di fatto un terzo stile tipografico. 13 pagine non includono `ui-typography.css`.
- **A3.5 Tema.** L'interfaccia è solo scura (`color-scheme: dark` in `ui-typography.css:168`). Solo 3 menu contestuali seguono il tema di OBR. Non è un problema per lo schermo del tavolo, ma va deciso esplicitamente (consiglio: restare solo scuri).
- **A3.6 Codice morto.** `src/style.css` è il boilerplate Vite e non viene importato da nessuna pagina del plugin.

---

## 4. Gruppo B — riduzione dei clic (cambia il comportamento)

Ogni voce va proposta e approvata singolarmente. Quelle marcate ⚠ toccano aree fragili di `AGENTS.md`.

### Conteggio attuale

| Azione | Compatto | Classico | Mappa (menu del token) |
|---|---|---|---|
| Turno successivo/precedente | 1 | 1 | — (nessuna scorciatoia da tastiera) |
| Danno o cura a un bersaglio | sel + 3 + valore | **1** + valore (pillola HP) | nessuna voce HP |
| Danno ad area | sel multipla + 3 + valore | idem | 2 dal template AoE |
| Impostare HP / HP massimi | solo console o scheda | 1 + valore | — |
| Aggiungere una condizione | 5 | 5 | — |
| Rimuovere una condizione | 3 | 3 | — |
| Vedere tutte le condizioni | 1 (popover di sola lettura) | 0 (visibili) + "…" | — |
| Lanciare un incantesimo | 3 (lancio rapido) / ≥4 | idem | ≥4 |
| Modificare l'iniziativa | **impossibile** | 1 + valore | — |
| Aggiungere al combattimento | 2 ("…" → Aggiungi attori) | 1 | 2 |
| Scheda personaggio | 2 (tasto destro) | 1 | — |

Fonti: `initiativeList.js:11219,1924,1962-1964,4877,9590`, `initiativeEditors.js:246,257,543,577`, `initiative-card-context-menu.js:245-368`, `contextMenu.js:256-643`, `aoeTargetTool.js:2371`.

### Proposte, dalla più redditizia

- **B1. La console parte nella modalità più usata** (`quick-hp-modal.js:61`). Oggi parte in "Effetti" (`QUICK_HP_MODES.SAVE`). Proposta: aprirla su "Danno" quando la si apre dal pulsante HP, oppure ricordare l'ultima modalità per browser. Risparmia 1 clic su ogni danno. Rischio basso.
- **B2. HP modificabili dalla card compatta** ⚠ (sync HP).
  - Clic sul testo HP → piccolo editor "+N/−N/valore" ancorato alla card, come la pillola HP del classico (`initiativeEditors.js`).
  - Deve riusare lo stesso editor e lo stesso percorso di scrittura su `meta.hp`. Non deve introdurre un secondo percorso.
  - Non deve bypassare la guardia di `renderAll()` sugli editor inline attivi.
  - Danno al singolo: da 3 clic a 1.
- **B3. Condizioni rapide dalla card** ⚠ (metadata delle condizioni).
  - Un popover con le 6–8 condizioni più usate come toggle (Prono, Afferrato, Avvelenato, Spaventato, Accecato, Incapacitato…). Un clic per aggiungere o togliere.
  - Il popover effetti compatto (oggi di sola lettura) può diventare questo pannello, con "×" su ogni pill.
  - Da 5 clic a 2.
- **B4. Iniziativa modificabile nel compatto** ⚠ (ordine di iniziativa). Il badge compatto dovrebbe avere `data-badge="init"` e lo stesso editor del classico (`initiativeCardClassicBuilder.js:683,801`). Così "Compila iniziativa" può aprire l'editor anche sulla card compatta (punto 5.1).
- **B5. Conferma o annulla per le azioni distruttive.** "Svuota iniziativa" e "Reset round" agiscono subito (`initiativeList.js:1644,1472`). Proposta: un toast "Iniziativa svuotata — Annulla" invece di una finestra di conferma. Non aggiunge clic e protegge dal clic sbagliato. Nel classico va spostato "×" lontano da "+" (vedi A2.5).
- **B6. Scorciatoie da tastiera per il turno.** Esistono solo Ctrl+Z e Alt+Z. Proposta: Spazio o → per "turno successivo" e ← per "precedente", attive quando il tracker ha il focus (stesse code e revision check dei pulsanti, ⚠ turno attivo).
- **B7. Menu contestuale del token.** Mancano HP e condizioni (`contextMenu.js:256-643`). Aggiungere "Danno/cura…" (apre la console su "Danno" con quel token selezionato) e "Condizioni…".
- **B8. Scheda personaggio dal compatto in un clic.** Doppio clic sul ritratto, o icona come nel classico (`initiativeCardClassicBuilder.js:1047`).
- **B9. Riordino a parità di iniziativa.** Funziona solo trascinando e senza segnale visivo (`initiativeList.js:2472-2479`). Basta una maniglia visibile all'hover sulle card che hanno pari merito.

---

## 5. Possibili bug emersi durante l'audit

Verifica in una stanza OBR reale fatta il 2026-10-22 (fase 0b del piano). Esiti:

1. **"Compila iniziativa" nel compatto → comportamento voluto.**
   - Durante la compilazione il tracker non si aggiorna (`__suspendRenders = true`, `initiativeList.js:6855`). È la fase di preparazione prima di mostrare la lista ai giocatori.
   - Resta un dettaglio da chiarire nel lotto B4: nel compatto il badge non ha `data-badge="init"` (`initiativeCardCompact.js` contro `initiativeCardClassicBuilder.js:801`), quindi `openInitiativeFillCandidate()` non apre l'editor sulla card (`initiativeList.js:6821`).
2. **Pill fuori dalla card nel classico → confermato.** Succede espandendo le pill con il "+": la terza riga copre la card successiva (A2.1, `before/17`).
3. **Popover degli effetti compatto fuori schermo → non confermato.** In OBR le voci restano visibili: era un limite dell'anteprima. In stanza il popover scende sopra la barra degli strumenti di OBR (`before/18`). È accettabile; aprirlo verso l'alto resta un ritocco facoltativo.
4. **Tooltip HP del classico → non ancora verificato.** Promette "+N/−N sui token selezionati", ma il salvataggio aggiorna solo `entry.id` più il seed del gruppo (`initiativeList.js:6579`).
5. **Toggle "Tana" sempre nascosto** (`initiativeList.js:2619`) e glifi ‹/◀ duplicati (`:3344` contro `:3549`). È codice morto da rimuovere solo con conferma.
6. **Menu "…" che non si chiude → non confermato.** In OBR si chiude cliccando altrove: era un limite dell'anteprima.
7. **Pannello destro tagliato → confermato** (nuovo, da `before/18`). La seconda riga della griglia è tagliata a metà e il badge della build la copre (A1.5).

---

## 6. Design token proposti

**Non serve un sistema nuovo:** basta estendere `--obrt-*` in `public/ui-typography.css`, che è già caricato da `index.html` e dalle pagine `compact-*`. Gli stili inline in JS possono usare `var(--obrt-…)` direttamente, quindi la migrazione si fa funzione per funzione senza cambiare la struttura.

### Tipografia

| Token | Oggi | Proposta |
|---|---|---|
| `--obrt-type-micro` | 9px | **10px**: soglia minima, nulla sotto |
| `--obrt-type-tracker-name` *(nuovo)* | 9px inline | 11px |
| `--obrt-type-tracker-meta` *(nuovo, HP/pill)* | 8px inline | 10px |
| `--obrt-weight-heavy` *(nuovo)* | 800 usato 44 volte senza token | 800; 750 e 900 confluiscono qui o in 700 |
| Famiglie | Helvetica + system-ui + Georgia | Solo `--obrt-font-ui`; Georgia eventualmente come `--obrt-font-display` per i soli titoli delle notice, se è una scelta voluta |

### Spaziatura e raggi

- **Spaziatura.** Oggi la scala 2/4/6/8/10/12/16 esiste, ma 3/5/7/9px compaiono 363 volte. Regola: arrotondare al valore pari più vicino durante il polishing di ogni pannello, non con un sostituisci-tutto.
- **Raggi.** 7/8/9/10/11px sono usati in modo intercambiabile. Proposta: `xs 4 · sm 6 · md 8 · lg 12 · xl 16 · pill 999`. Oggi `lg` vale 11: portarlo a 12.
- **Hit target.** Nuovo token `--obrt-hit-min: 24px`.

### Colori di ruolo (nuovi)

Oggi ogni ruolo ha da 3 a 6 varianti sparse.

```css
--obrt-faction-pc: #3aa7ff;      /* oggi anche #3b82f6 nello snapshot */
--obrt-faction-enemy: #ef4444;
--obrt-faction-ally: #22c55e;
--obrt-faction-neutral: #eab308;
--obrt-accent: #2563eb;          /* oggi anche #3b82f6, #60a5fa, #1d4ed8, #38bdf8 */
--obrt-danger: #dc2626;
--obrt-warning: #f59e0b;
--obrt-success: #16a34a;
--obrt-hp-high: #22c55e;
--obrt-hp-mid: #f59e0b;
--obrt-hp-low: #ef4444;
--obrt-surface-0: #080b10;       /* fondo più scuro; oggi anche #090d13, rgba(8,12,21) */
```

⚠ **Barre HP.** Il tracker usa #16a34a/#facc15/#dc2626 (`initiativeList.js:6163-6167`), la mappa #22c55e/#f59e0b/#ef4444 (`hpbar-items.js:129-133`). Unificarle è solo un cambio di colore, ma le barre sulla mappa sono attachment della scena e i colori vengono scritti negli item. Allineare prima il tracker ai colori della mappa: non tocca gli item. Gli item della mappa vanno toccati solo con un intervento a parte.

### Componenti da unificare (dopo i token)

- **Bottoni:** `primary`, `secondary`, `danger`, `ghost`, `icon`.
- **Chiusura:** un solo bottone, 28px, glifo `×`.
- **Pill:** una sola regola di overflow (A1.2).
- **Header e footer delle modali:** una sola struttura.

---

## 7. Piano delle fasi successive

Un pannello per commit. Screenshot "dopo" con la stessa anteprima, nella stessa posizione. Build e test dopo ogni fase.

| Fase | Contenuto | Rischio | Sforzo consigliato |
|---|---|---|---|
| 2 | Token in `ui-typography.css` (sez. 6), senza ancora usarli | nullo | medium |
| 3 | Vista compatta, gruppo A: A1.1–A1.8 (font, pill, "+N", card EP, pannello destro, grip, hit target) | basso: solo build visivo in `initiativeCardCompact.js`, `trackerQuickActions.js`, `initiativeToolbar.js` | high |
| 4 | Vista classica, gruppo A: A2.1–A2.6 | medio per A2.1: misura dell'altezza riga, vicino al render | high |
| 5 | Pannelli e modali, gruppo A: A3.1–A3.4, una pagina per commit | basso | medium |
| 6 | Gruppo B, una proposta per volta: B1 → B5 → B8 → B2 → B3 → B4 → B6 → B7 → B9 | ⚠ dove indicato | high |
| — | Bug della sezione 5: verifica in OBR, poi correzione mirata | variabile | high |

**Regole per ogni brief:**
- Niente modifiche ai metadata.
- Niente bypass delle guardie di `renderAll()`.
- Niente modifiche a code e revision check del turno attivo.
- Gli ID virtuali (Tana, Paragon, Epic) non sono item della scena.
- Le barre HP sulla mappa non si ricreano.

Prima di iniziare la fase 3 conviene estendere `OBR.modal.open` nel fake SDK (`test-support/boss-actions-browser/fake-obr-sdk.js`), così le modali diventano visibili nell'anteprima.

---

## 8. Appendice — screenshot

Le immagini sono in `docs/ui-audit/before/`. Quelle "ingrandite" sono a zoom 2× sul tracker.

| File | Contenuto |
|---|---|
| `01-compatta-gm-panoramica.jpg` | Tracker compatto GM, vista intera |
| `02-compatta-gm-card-1.jpg` | Card attiva, boss epico, pill tagliate (ingrandita) |
| `03-compatta-gm-card-2.jpg` | Card EP vuote (ingrandita) |
| `04-compatta-gm-pannello-destro.jpg` | Pannello destro, launcher, badge LOCALE (ingrandita) |
| `05-compatta-gm-card-3.jpg` | 4 condizioni con una sola visibile, KO, alleato (ingrandita) |
| `06-compatta-gm-menu-altre-azioni.jpg` | Menu "…" |
| `07-compatta-gm-overflow-effetti.jpg` | Popover effetti che esce dal fondo |
| `08-compatta-giocatore.jpg` | Vista giocatore compatta (ingrandita) |
| `09-classica-gm-panoramica.jpg` | Classico GM, pill fuori dalla card |
| `10-classica-gm-intestazione.jpg` | Intestazione e prime card (ingrandita) |
| `11-classica-gm-fondo-lista.jpg` | KO, alleato, overflow "…" (ingrandita) |
| `12-console-effetti-manuali.jpg` | Console in modalità iniziale "Effetti" |
| `13-console-danno.jpg` | Console in modalità "Danno" |
| `14-opzioni.jpg` | Opzioni, lingua mista |
| `15-scheda-personaggio-vuota.jpg` | Scheda personaggio senza token (solo struttura) |
| `16-classica-incantesimi-e-pill-sovrapposte.jpg` | Pannello incantesimi, durate "0 round", pill sovrapposte |
| `17-obr-classica-pill-espanse-sovrapposte.png` | Stanza OBR reale: pill espanse con il "+" che coprono la card successiva |
| `18-obr-compatta-stanza-reale.webp` | Stanza OBR reale: tracker compatto con boss epico, popover effetti aperto, pannello destro tagliato |
