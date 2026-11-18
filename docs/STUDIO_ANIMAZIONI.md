# Studio delle animazioni del plugin

Data: 2026-11-18. Studio richiesto dopo il lavoro sull'animazione dei gruppi del tracker (docs/STUDIO_UI_TRACKER_BG3.md):
le animazioni del resto del plugin, con lo stesso metodo. Nessun file di `src/` o `public/` è stato modificato per
questo studio.

## 1. In breve

Le animazioni del plugin sono nate lotto per lotto, ognuna con la sua durata, e senza una regola comune per chi chiede
al sistema di ridurre il movimento. Quasi tutte sono piccole transizioni di colore nei pannelli e funzionano. I difetti
visibili al tavolo stanno in tre punti, tutti misurati al banco fotogramma per fotogramma:

1. **Cambio di turno nel tracker.** La nuova card attiva si ingrandisce con calma, la vecchia torna piccola e perde
   l'alone in un solo fotogramma: le due card vengono ricostruite a ogni cambio. Subito dopo il cambio c'è un
   fotogramma lungo (60 ms nell'espansa, 40 nella compatta) che fa inciampare l'ingrandimento. Le due viste usano
   durate diverse (500 ms contro 160 ms).
2. **Avviso di turno.** Compare circa mezzo secondo dopo il clic (la finestra si apre a 110 ms, il contenuto si vede
   verso i 500 ms) e sparisce di colpo, a piena opacità, quando la finestra si chiude.
3. **PF sulle card.** La barra salta al nuovo valore in un fotogramma, nelle due viste; 55 ms dopo la card viene
   ricostruita.

Il resto: 20 durate diverse in 119 dichiarazioni, 8 file su 31 che rispettano il movimento ridotto, le animazioni sulla
mappa (Palla di fuoco, effetti di Embers) che sono video riprodotti da Owlbear Rodeo.

L'animazione dei gruppi del tracker è già stata resa fluida in questa sessione (immagine `03`).

---

## 2. Metodo

- **Catalogo:** uno script legge tutte le pagine HTML, i fogli in `public/` e i moduli in `src/` e raccoglie ogni
  `@keyframes`, `animation`, `transition` (CSS e JS), le animazioni JavaScript (`element.animate`) e gli scorrimenti
  morbidi, con durate e curve, e se il file rispetta `prefers-reduced-motion`.
- **Misure:** Chrome headless sul banco 5199, comandato via DevTools. Per ogni animazione: le schermate del filmato
  (screencast) e, dentro la pagina, una registrazione a ogni fotogramma (posizione, scala, opacità, larghezza della
  barra, se l'elemento è stato ricostruito).
- **Limiti:** il banco non ha la GPU; i fotogrammi lunghi possono essere più corti sul portatile del tavolo, ma il
  loro ordine e la loro causa restano. Le finestre di Owlbear Rodeo (apertura e chiusura dei popover) non hanno
  transizioni proprie: si possono animare solo i contenuti.

---

## 3. Catalogo

119 dichiarazioni in 31 file: 11 `@keyframes`, 22 `animation`, 68 transizioni, 10 animazioni JavaScript (tutte nei
gruppi del tracker), 7 scorrimenti morbidi.

| Area | Cosa si anima | Durate | Movimento ridotto |
| --- | --- | --- | --- |
| Tracker, card | Ingrandimento della card attiva (`ZOOM_CFG`, espansa), scala e filtri della card compatta | 500 ms espansa, 160 ms compatta | Sì (`initiativeList.js`) |
| Tracker, turno attivo | Alone che pulsa (`tbp-active-turn-pulse`) | 1,6 s, infinito | Sì (`index.html`) |
| Tracker, gruppi | Palco, fisarmonica, mazzo, scambio delle card (18/11) | 380 ms + 2×90 ms | Sì |
| Tracker, liste | Scorrimento morbido alla card attiva e ai compagni | del browser | No |
| Tracker, comandi | Linguetta del round (larghezza 80 ms), riquadro del movimento, ridimensionamento compatta | 80–140 ms | No |
| Avvisi | Barre di scadenza (`expire`): turno 4,5 s, velocità 5 s, concentrazione 6 s, zona 6,5 s, boss 8 s | lineari | Solo turno |
| Avvisi | Entrata del turno (opacità 180 ms, spostamento 220 ms), alone «tocca a te» (2,2 s infinito) | | Sì |
| Avvisi | Tiro contro la morte (`pulse` 2,6 s infinito), impulso di magia selvaggia (`flash` 0,5 s) | | No |
| Menu e azioni rapide | Apertura (opacità 120 ms, spostamento 140 ms) | | Sì |
| Pannelli | Colore di sfondo e bordo al passaggio (aure, effetti, incantesimi, cronologia, PF rapidi, Opzioni) | 90–200 ms | 3 su 8 |
| Orologi | Completamento (`clock-complete` 1,8 s infinito), riempimento | | Sì |
| Mappa | Palla di fuoco ed effetti di Embers: video creati e tolti dal plugin | dei video | — |

**Durate in uso:** 80, 90, 120, 140, 150, 160, 180, 200, 220, 300, 500, 800 ms, più i tempi degli avvisi. **Curve:**
`ease` quasi ovunque (96), `linear` per le barre, qualche `ease-out` e due `cubic-bezier`.

---

## 4. Misure

### 4.1 Cambio di turno (immagine `02`)

| | Espansa | Compatta |
| --- | --- | --- |
| Nuova card attiva | 1 → 1,035 in 500 ms | 1 → 1,035 in circa 180 ms |
| Vecchia card attiva | 1,035 → 1 nel primo fotogramma, alone tolto | uguale |
| Card ricostruite | 2 (la vecchia e la nuova attiva) | 2 |
| Primo fotogramma dopo il cambio | 60 ms | 40 ms |

Il cambio è immediato al clic (il tracker anticipa lo stato). Le due card vengono ricostruite e la vecchia nasce già
piccola e senza alone: è lo scatto che si vede. Il fotogramma lungo arriva mentre la nuova card parte, come nei gruppi.

### 4.2 Avviso di turno (immagine `01`)

| Momento | Tempo dal clic |
| --- | --- |
| Finestra dell'avviso aperta | 110 ms |
| Contenuto visibile (poi sfuma in 180 ms) | circa 500 ms |
| Chiusura | 4,9 s, di colpo, a piena opacità |

Fra apertura e contenuto passano circa 400 ms. La causa non è ancora verificata: `turnNoticeHost.js` ha attese di
conferma della misura e di nuovo tentativo (800–1800 ms) che vanno lette in M2. In uscita non c'è dissolvenza: la finestra si chiude con l'avviso pieno.

### 4.3 PF sulle card

Klos da 133 a 60 PF e ritorno: la barra passa da 158 a 77 px (espansa) e da 70 a 32 px (compatta) in un solo
fotogramma; la card viene ricostruita circa 55 ms dopo. La transizione di larghezza dichiarata nella card espansa
(`initiativeCardClassicBuilder.js`) riguarda le dimensioni della card, non la barra.

### 4.4 Gruppi

Misurati e corretti in questa sessione (palco, fisarmonica, mazzo, scambio delle card): immagine `03` e studio del
tracker.

### 4.5 Gruppi che si aprono e chiudono da soli al cambio di turno (immagini `04`, `06`)

L'utente vedeva una differenza fra l'apertura automatica (il turno entra in un gruppo chiuso) e quella con la freccia.
Misurata: è la stessa animazione (stesso palco, 500 ms di transizione registrati in entrambe le viste), ma nello
stesso istante cambia la card attiva. All'apertura la prima card del gruppo è anche la nuova card attiva: escluse dal
fondo pieno perché attive, le sue tinte traslucide lasciavano leggere i nomi dei membri impilati sotto. Alla chiusura
la card attiva che esce perdeva alone e ingrandimento di colpo (il difetto di M1). Corretto con M1 e col fondo pieno
anche sotto la card attiva: immagine `06`.

---

## 5. Proposta: un piccolo sistema di movimento

- **Tre durate e tre curve condivise**, come variabili accanto alla tipografia (`public/ui-typography.css`):
  `--obrt-motion-fast: 120ms` (passaggio del mouse, colori), `--obrt-motion-base: 180ms` (comparse, dissolvenze),
  `--obrt-motion-move: 380ms` (spostamenti e ingrandimenti, come i gruppi); curve `ease` per i movimenti,
  `ease-out` per le comparse, `linear` solo per le barre di tempo.
- **Una regola unica per il movimento ridotto**, nello stesso foglio: chi la chiede vede i cambi senza animazioni
  (le barre di scadenza restano, perché sono informazione). Le animazioni JavaScript la leggono già nei gruppi; va
  estesa all'ingrandimento della card attiva e agli scorrimenti morbidi.
- **Le stesse due regole dei gruppi** per ogni animazione che parte da un nuovo disegno: partire un fotogramma dopo
  (il primo è lungo) e non ricostruire a metà quello che si sta animando.

---

## 6. Lotti proposti

### M1 · Cambio di turno senza scatti — rischio medio ⚠ turno attivo

La vecchia card attiva torna piccola e perde l'alone con la stessa curva con cui la nuova li prende; stessa durata
nelle due viste (proposta 380 ms, come i gruppi); l'ingrandimento parte dopo il fotogramma lungo. File:
`src/initiativeList.js` (ingresso della card attiva, `ZOOM_CFG`), `src/initiativeCardCompact.js`. ⚠ È vicino alla
logica del turno attivo: si tocca solo il disegno, non lo stato né le code.

**Stato (18/11): fatto, non committato** (D2 applicata come consigliato, 380 ms). `ZOOM_CFG` a 380 ms con la curva
«ease»; la card compatta usa lo stesso tempo per scala e alone; l'ingrandimento parte due fotogrammi dopo il disegno;
`__capturePreviousActiveCard` e `__fadeOutPreviousActiveCard`: prima di sostituire le card si prende la card attiva
viva, dopo se ne posa una copia ferma (senza i dati del tracker, inerte) sulla card ricostruita, che si rimpicciolisce
e sfuma in 380 ms; non per una card dentro il palco di un gruppo (lì c'è la card vecchia stessa). Misurato: la nuova
card cresce in 380 ms in entrambe le viste, la vecchia perde alone e ingrandimento gradualmente (immagine `05`).
Test `test/activeTurnMotion.test.js` (4 test), 6562 test verdi, build a posto. Vista dei giocatori non filmata (stesso
codice).

### M2 · Avviso di turno: entrata più pronta, uscita morbida — rischio medio

Uscita: l'avviso sfuma in 180 ms prima che la finestra si chiuda. Entrata: capire se i 400 ms di attesa si possono
ridurre (per esempio mostrando subito il titolo che il tracker conosce già). File: `turn-notice.html`,
`src/turnNoticeHost.js`. Vale anche per gli altri avvisi (velocità, concentrazione, boss), che si chiudono allo stesso
modo.

**Stato (18/11): fatto, non committato** (D4 applicata come consigliato, dissolvenza). L'avviso di turno aveva già la
dissolvenza d'uscita, ma annunciava «niente da mostrare» prima di farla partire e l'host chiudeva subito la finestra:
ora l'annuncio arriva dopo (`hideCurrent` in `src/turn-notice.ts`), e i promemoria di zona sfumano allo stesso modo.
Velocità, concentrazione e boss non avevano uscita: `src/noticeLeave.js` (`leaveNoticeThen`) sfuma il pannello in
180 ms e poi chiude; un avviso nuovo annulla la chiusura; subito con il movimento ridotto. Misurato: l'avviso di turno
passa da 1 a 0 fra 4,83 e 5,01 s e la finestra si chiude a 5,08 s; gli altri tre sfumano in 180 ms e chiudono a
~250 ms dal tasto Esc. Entrata non toccata: i ~230 ms fra documento pronto e pannello sono il caricamento dei moduli
di Vite in sviluppo, da misurare nella stanza con la build vera. Test `test/noticeLeave.test.js` (4).

### M3 · Movimento ridotto ovunque — rischio basso

La regola globale in `public/ui-typography.css` e il controllo nelle animazioni JavaScript (card attiva, scorrimenti).

**Stato (18/11): fatto, non committato.** Una regola in `public/ui-typography.css` (44 pagine su 48; le altre quattro
non animano nulla): transizioni, animazioni e scorrimento istantanei, anche le transizioni scritte da JavaScript;
restano le barre di scadenza degli avvisi (`.timer`, `.zone-timer`) e la rotella di caricamento, che sono informazione.
I sette scorrimenti morbidi chiesti da JavaScript passano da `src/motionPreference.js` (`smoothScrollBehavior`); le
animazioni JavaScript (gruppi, card attiva, copia M1, avvisi, barre PF) controllavano già la preferenza. Verificato con
il movimento ridotto emulato: transizioni del tracker e dell'avviso a 0,01 ms, barra di scadenza a 4,5 s; senza,
invariato. Test `test/motionPreference.test.js` (3).

### M4 · Variabili di movimento — rischio basso, meccanico

Le 68 transizioni passano alle tre durate condivise. Nessun cambio visibile oltre a uniformare 80/90/140/150/160 ms.

**Stato (18/11): fatto, non committato.** `--obrt-motion-fast: 120ms`, `--obrt-motion-base: 180ms`,
`--obrt-motion-move: 380ms` in `public/ui-typography.css`; 54 righe in 26 file passano alle variabili, ognuna con il
valore di riserva (`var(--obrt-motion-fast, 120ms)`), anche negli stili scritti da JavaScript. Le curve restano quelle
di prima. Tenuti a parte di proposito: gli 80 ms lineari della barra del movimento (segue il trascinamento), i 90 ms
di chiusura dei due menu (legati al loro `EXIT_ANIMATION_MS`), e 200/220/300 ms che lo studio non chiedeva di
uniformare. Misurato al banco: card attiva 0,38/0,38/0,34/0,12 s (prima 0,15 l'ultima), avviso 0,18/0,22 s. Test
`test/motionTokens.test.js` (3). **Studio chiuso:** M1–M5 fatti.

### M5 · Barra dei PF che scorre — rischio basso ⟶ D3

La barra scorre al nuovo valore in 180 ms invece di saltare. Non è il segno sulla card scartato il 31/10 (lampo, «−7»,
scia del danno): la barra arriva dove arriverebbe, solo senza salto. Va deciso.

**Stato (18/11): fatto, non committato** (D3 = sì, l'utente ha chiesto M5 prima di M3). `src/hpBarSlide.js`
osserva la lista del tracker, ricorda la larghezza mostrata da ogni barra e fa scorrere in 180 ms quella che cambia o
che nasce in una card ricostruita; una card ricostruita a metà riprende lo stesso scorrimento; i PF temporanei seguono
la fine della barra; la card chiusa di un gruppo ha una chiave sua. Nessuno dei punti che scrivono la barra è
cambiato. Misurato: 158 → 76,7 px (espansa) e 70 → 31,6 px (compatta) in ~180 ms, continuo anche alla ricostruzione.
Test `test/hpBarSlide.test.js` (5).

### Fuori lotto: la mappa

Palla di fuoco ed effetti di Embers sono video di Owlbear Rodeo: il plugin decide solo quando crearli e toglierli
(con margini di 120 ms e una dissolvenza di uscita di 180 ms già presente per Embers). Nessun intervento proposto.

---

## 7. Decisioni

| # | Decisione | Opzioni | Consiglio |
| --- | --- | --- | --- |
| D1 | Ordine dei lotti | M1 → M2 → M3 → M4, M5 se la vuoi | M1 per primo: è quello che si vede a ogni turno |
| D2 | Durata dei movimenti | 380 ms (come i gruppi) o 500 ms (oggi nell'espansa) | 380 ms, uguale ovunque |
| D3 | Barra dei PF che scorre (M5) | sì o no | Sì: nessun segno in più, solo niente salto |
| D4 | Uscita degli avvisi | dissolvenza di 180 ms o restare come oggi | Dissolvenza |

---

## 8. Immagini (`docs/ui-audit/studio-animazioni/`)

| File | Cosa mostra |
| --- | --- |
| `01-avviso-di-turno-entrata-uscita.jpg` | L'avviso di turno: nulla fino a 456 ms, la comparsa a 540 ms, ancora pieno a 4,85 s, poi chiuso. |
| `02-cambio-di-turno.jpg` | Cambio di turno nelle due viste: l'alone della vecchia card attiva sparisce subito, la nuova cresce. |
| `03-gruppi-dopo-la-correzione.jpg` | I gruppi dopo gli interventi di questa sessione: i testi si scambiano su ritratto e cornice fermi. |
| `04-gruppi-automatici-prima.jpg` | Apertura e chiusura automatiche al cambio di turno, prima: nomi in trasparenza sotto la card attiva, alone che sparisce di colpo. |
| `05-cambio-di-turno-dopo-m1.jpg` | Cambio di turno dopo M1: la vecchia card attiva perde alone e ingrandimento gradualmente, nelle due viste. |
| `06-gruppi-automatici-dopo.jpg` | Apertura e chiusura automatiche dopo M1 e il fondo pieno anche sotto la card attiva. |

Gli script delle misure (`anim-catalog.mjs`, `turn-film.mjs`, `notice-film.mjs`, `hp-film.mjs`, `group-film3.mjs`)
stanno nella scratchpad della sessione.
