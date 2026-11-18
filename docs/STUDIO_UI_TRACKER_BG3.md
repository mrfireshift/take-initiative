# Studio UI del tracker — è all'altezza di Baldur's Gate 3?

Data: 2026-11-18. Studio in sola lettura: nessun file di `src/` o `public/` è stato modificato. Le «prove disegnate»
sono modifiche del DOM fatte solo nel browser del banco, per vedere le proposte nello stile vero del tracker.

> Domanda dell'utente: l'interfaccia del tracker è uno dei valori principali di Take Initiative; abbiamo raggiunto un
> buon punto di arrivo? E, con dei casi studio, il tracker raggiunge la chiarezza e la qualità di Baldur's Gate 3, la
> sua ispirazione principale?

## Indice

1. [In breve](#1-in-breve)
2. [Metodo e limiti](#2-metodo-e-limiti)
3. [Il tracker oggi](#3-il-tracker-oggi)
4. [Scheda di valutazione](#4-scheda-di-valutazione)
5. [Caso studio principale: Baldur's Gate 3](#5-caso-studio-principale-baldurs-gate-3)
6. [Altri casi studio](#6-altri-casi-studio)
7. [Lo scarto, voce per voce](#7-lo-scarto-voce-per-voce)
8. [Lotti proposti](#8-lotti-proposti)
9. [Cosa non ripropongo](#9-cosa-non-ripropongo)
10. [Decisioni](#10-decisioni)
11. [Prove e strumenti](#11-prove-e-strumenti)

---

## 1. In breve

**Per lo stile sì, per la chiarezza quasi.** Il tracker sta sopra ogni tracker da VTT raccolto (sezione 6) e regge il
confronto con le barre d'iniziativa dei giochi. Su alcuni punti fa più di BG3:

- usa la stessa semantica di colori di BG3 (rosso ostile, giallo neutrale, verde alleato, blu per i personaggi), con
  card intere nel colore e non solo una cornice;
- marca il turno attivo più di quanto risulti documentato per BG3 (alone, ingrandimento, triangolo, etichetta sulla
  pedina), e il suo avviso di turno dice anche chi viene dopo; BG3 ha aggiunto l'avviso col nome solo con il Patch 2;
- tiene il round sempre in vista, mentre BG3 lo mette solo nel registro di combattimento (Patch 4);
- lascia scegliere al GM, per fazione e per superficie, quanto i giocatori vedono dei PF; BG3 ha solo «tutto» o, dal
  Patch 5, «PF nemici nascosti»;
- non svela i turni delle creature nascoste, e ruota lo schermo verso il lato del tavolo di chi gioca.

**Dove BG3 è più chiaro**, e lo scarto si chiude con lavori piccoli:

1. **Lo stato vitale sta sul ritratto:** tiri contro la morte (successi a sinistra, fallimenti a destra) e
   concentrazione. Da noi i tiri contro la morte sono solo nell'avviso, il PG svenuto e il nemico morto hanno lo
   stesso «KO», e nella compatta la concentrazione può finire nel cassetto (L4).
2. **Ogni stato ha un'icona, la stessa ovunque.** Da noi parlano le emoji di sistema, e nella compatta si vede una
   condizione sola (L3).
3. **Si vede chi ha già agito e chi deve agire.** Da noi il turno è un riflettore su una lista fissa: nessun segno per
   chi ha agito, e «chi viene dopo» solo nell'avviso (L5: provato il 18/11 e tolto, non è piaciuto; resta così).
4. **Il colore non lavora da solo:** BG3 ha i filtri per i daltonici dal Patch 4 (L6: scartato per ora il 18/11).

**Un difetto vero, sullo schermo del tavolo.** Con «Dimensione tracker» sopra il 100% il tracker esce dalla sua
finestra in entrambe le viste: al 150% la compatta dei giocatori ha card tagliate e una fascia vuota, l'espansa perde
la fine della lista e la barra ▲ ▼ del GM. Causa trovata, correzione di poche righe di CSS (L1).

**Il punto d'arrivo è vicino.** L1–L4 non toccano dati né logica del turno e chiudono la maggior parte dello scarto;
L5 avrebbe portato la lettura del round al livello di BG3, ma provato al banco non è piaciuto ed è stato tolto; L6 e
L7 sono scelte di gusto. Non serve rifare niente, e non
ripropongo le cose già decise (sezione 9): economia d'azione, segno PF sulla card (D5 del 31/10), card epiche
strette (D9).

---

## 2. Metodo e limiti

- **Scena.** Il banco dell'audit UI (`test-support/ui-audit-browser/`, nove creature: PG, boss epico con tre azioni
  epiche, boss leggendario, nemico con quattro condizioni, PG a 0 PF, alleato, nemico morto, token collegati ed
  evocazioni). In una copia usa e getta ho messo ritratti di prova diversi per ogni creatura (silhouette su fondi
  colorati) al posto del segnaposto unico, che rendeva tutte le card uguali. La copia stava in
  `node_modules/.audit-preview/tracker-study/` ed è stata cancellata a fine studio.
- **Catture.** Chrome headless pilotato con DevTools, schermate 1:1 e 2×: vista compatta ed espansa, GM e giocatori,
  «Dimensione tracker» dal 50 al 200%, fine della lista, PF dei nemici in modalità «Stato», cambio di turno
  fotogramma per fotogramma, avviso di turno con il vero servizio di sfondo (`polishBench.js`). Il pannello del
  browser dell'app era nascosto: niente banco interattivo.
- **Misure dal DOM.** Testi troncati (larghezza del contenuto maggiore della casella, con taglio), corpo minimo del
  testo, altezze degli elementi sotto `zoom`.
- **Casi studio.** Tre ricerche sul web: Baldur's Gate 3; giochi a turni; tracker dei VTT e strumenti con schermo per
  i giocatori. Ogni affermazione ha la sua fonte; quelle viste solo in un estratto di ricerca o non trovate sono
  segnate. Game UI Database, Fandom e Nexus rifiutano la lettura automatica: niente citazioni da lì.
- **Limiti.** Niente token veri: per la resa delle immagini vere valgono le catture in stanza del 22/10
  (`docs/ui-audit/before/17`, `18`). Niente stanza OBR. Le animazioni sono misurate in headless.

Immagini dello studio: `docs/ui-audit/studio-bg3/` (26 file, elencati nella sezione 11).

---

## 3. Il tracker oggi

### Punti di forza

- **P1 · Fazioni leggibili da lontano.** Card piene nel colore di fazione (blu PG, rosso nemici, verde alleati, oro
  neutrali), con lo stesso colore sull'anello del ritratto e sul badge d'iniziativa (`factionColors`,
  `src/initiativeList.js:6973`).
- **P2 · Il turno attivo non si sbaglia.** Alone e ingrandimento della card, triangolo in cima, alone che pulsa nella
  vista espansa (`tbp-active-turn-pulse`, `index.html:72`), etichetta «Turno di …» sulla pedina
  (`ACTIVE_LABEL_*`, `src/initiativeList.js:377`) e avviso di turno con «A seguire» e round (`14-avviso-di-turno`).
  Durante un'azione epica si accende anche la card del boss.
- **P3 · Gerarchia dei nemici.** Cornice ornata per i boss, badge E/EP, azioni e resistenze leggendarie come tacche
  (A ◆◆◇, R ⬟⬟⬟): il boss si riconosce prima di leggere il nome.
- **P4 · Vista espansa ricca e ordinata.** Un solo testo troncato su 51; PF temporanei come segmento azzurro della
  barra e «+10» accanto ai PF; effetti come etichette nel colore del loro tema, con la durata.
- **P5 · Informazione per i giocatori come scelta.** Matrice dei PF per fazione e per superficie (Valore, Barra,
  Stato, Nascosti) con i descrittori «In salute», «Provato», «Ferito», «Fuori combattimento»
  (`04`, `08`). Più flessibile di BG3, che mostra tutto, e pensata per il tavolo.
- **P6 · Movimento sobrio.** Il cambio di turno si ridisegna in 0,1–0,3 s senza spostare le card (`12`, `13`); le
  animazioni dei gruppi sono già state rifinite (U13).
- **P7 · Un avviso di turno «da gioco».** Iniziale o ritratto, titolo in serif, «A seguire», badge del round, barra
  di durata (`14`).

### Rilievi

| # | Gravità | Rilievo | Prova |
| --- | --- | --- | --- |
| T1 | **Alta** (tavolo) | Con «Dimensione tracker» sopra il 100% il tracker esce dalla sua finestra. Compatta 150%: 81 px vuoti sopra le card e 33 px di card tagliati sotto; 200%: 186 vuoti e 122 tagliati; 125%: 3 tagliati. Espansa 150%: contenuto alto 1434 px in una finestra di 956; anche scorrendo fino in fondo le ultime card e la barra ▲ ▼ del GM restano sotto il bordo. Al 100% e sotto tutto è regolare. | `05`, `09`, `15` |
| T2 | Media | Troppi testi troncati nella compatta: 11 su 69 nella barra del GM (16%), 7 su 48 in quella dei giocatori. Nell'espansa 1 su 51 e 2 su 48. Quattro dei tagli sono «Auril, Vergin…»: nomi con un epiteto dopo la virgola. | `01`, `03` |
| T3 | Media | Le condizioni parlano per emoji di sistema (`CONDITION_EMOJI`, `src/conditions.js:67`) accanto a icone disegnate (strumenti, scheda, reazione) e a glifi (▲ ▼ ◀ ▶). Le emoji cambiano disegno da un sistema all'altro e non hanno lo stile del resto. Nella compatta una sola condizione è visibile, le altre stanno in «+N». | `01`, `07` |
| T4 | Media | Lo stato vitale si legge male: i tiri contro la morte esistono (`meta.deathSaves`, `src/deathSaveCore.js`) ma compaiono solo nell'avviso, non sulla card; un PG svenuto e un nemico morto hanno lo stesso «KO»; per i giocatori, con i PF dei nemici nascosti (il default), un nemico a 0 PF non ha nessun segno e sembra vivo. | `02`, `03`, `07` |
| T5 | Media | Concentrazione invisibile nella compatta quando non è il primo effetto: Animare oggetti di Lavera sta nel cassetto «+1». | `01` |
| T6 | Bassa | Rifiniture: nelle card «Azione epica» compatte il cerchio della console Boss copre il badge «EP»; «Sc…» (Scudo della fede) mostra due lettere; «Azione Epi…» e «Fuori combatti…» tagliate; barre PF del tracker in `#16a34a/#facc15/#dc2626` (`src/initiativeList.js:7011`, `src/initiativeCardClassicBuilder.js:1117`), quelle della mappa in `#22c55e/#f59e0b/#ef4444` (`src/hpbar-items.js:131`). | `10`, `11` |
| T7 | Bassa | Chi viene dopo si legge solo nell'avviso di turno («A seguire»): nella lista il turno è un riflettore che si sposta su un ordine fisso, e il prossimo non ha segno. | `01`, `06` |
| T8 | Nota | Testo sotto i 10 px: 8 px nelle etichette della compatta (7 testi), da 7 a 9,5 px nell'espansa dei giocatori. Già noto (`docs/PIANO_POLISHING_UI.md`, lotti 3.2 e 4.2) e lasciato com'è; la leva per il tavolo è la scala (T1). | — |

**T1 in dettaglio.** La radice del tracker (`#initiative-widget`, `src/main.js:28`) ha
`[data-glass-popover="1"] { min-height: 100vh !important }` (`public/popover-glass.css:19`). La scala del tracker
mette `zoom` sulla radice del documento (`__setTrackerViewZoom`, `src/initiativeList.js:9778`). Nel Chrome di oggi lo
`zoom` moltiplica anche i `vh`: a 150% `100vh` vale 234 px CSS, che diventano 351 px sullo schermo in una finestra
di 234. Nella compatta la fila delle card è centrata in verticale in quello spazio e scende; nell'espansa la lista e
la barra in basso finiscono sotto il bordo. L'audit del 22/10 aveva già visto il sintomo nella compatta (punto 5.8,
«da verificare in OBR») e la lista del giro 1.5.0 aveva la prova B1, mai spuntata
(`docs/audits/GIRO-OBR-1.5.0.md:144`). Corretto con L1 il 18/11 (sezione 8), da provare in stanza.

**T4 e T5, dal codice.** La concentrazione nella compatta è un'etichetta come le altre (`__compactEffectItems`,
`src/initiativeCardCompact.js:91`); il «KO» compare solo dove i PF si vedono (`buildCompactCardHP`,
`src/initiativeCardCompact.js:1061`), quindi sparisce con la policy «Nascosti».

**T6, il badge coperto.** In `__mountTrackerQuickActions` (`src/initiativeList.js:9221`) il cerchio della console
Boss scende sotto l'angolo solo per il Boss Epico (`belowCorner = compact && !!sourceEntry.isEpic`); la card
dell'azione epica ha anche lei il badge nell'angolo («EP»), ma non è `isEpic`.

---

## 4. Scheda di valutazione

Nove criteri, misurati sul banco e confrontati con ciò che è documentato di BG3 (sezione 5). «Pari» vuol dire al
livello di BG3, «Meglio» sopra, «Vicino» con uno scarto piccolo, «Lontano» con uno scarto evidente.

| Criterio | BG3 | Espansa | Compatta | Lotto |
| --- | --- | --- | --- | --- |
| Di chi è il turno | Avviso col nome, camera che segue | **Meglio**: alone che pulsa, ingrandimento, etichetta sulla pedina, avviso con «A seguire» | **Meglio** | — |
| A che punto è il round | Frecce piene e vuote, clessidra; round solo nel registro | **Vicino**: round sempre in vista, nessun segno per chi ha agito o per il prossimo | **Vicino** | L5 |
| Stato vitale | PF, temporanei, tiri contro la morte e concentrazione sul ritratto | **Vicino**: PF e temporanei sì, tiri contro la morte no, KO uguale per svenuto e morto | **Lontano**: anche la concentrazione può finire nel cassetto | L4 |
| Condizioni | La stessa icona dipinta ovunque, durata nel suggerimento | **Vicino**: etichette leggibili, ma con le emoji di sistema | **Lontano**: una sola visibile, tagliata | L3 |
| Densità e rumore | Poco in vista, il resto a richiesta | **Pari**: 1 testo tagliato su 51 | **Lontano**: 11 su 69 (16%) | L2 |
| Schermo del tavolo | Scala dell'interfaccia limitata al lancio | **Lontano** sopra il 100% (T1); rotazione verso chi gioca | **Lontano** sopra il 100% (T1) | L1 |
| Colore e accessibilità | Filtri per tre forme di daltonismo | **Lontano**: solo colore | **Lontano** | L6 |
| Rifinitura e carattere | Alta; serif umanistici (PostAntiqua, Alegreya) | **Pari**, con piccole sbavature | **Vicino**: badge coperto, «Sc…» | L2, L7 |
| Informazione per i giocatori | Tutto, o PF nemici nascosti (Patch 5) | **Meglio**: matrice per fazione e superficie, descrittori a gradini, turni nascosti senza fughe | **Meglio** | — |

---

## 5. Caso studio principale: Baldur's Gate 3

Versione PC, dall'accesso anticipato all'ultimo aggiornamento (Patch 8, aprile 2025). «EA P7» e «EA P8» sono le
patch 7 e 8 dell'accesso anticipato (2022); «P2», «P4», «P5» quelle del 2023. Nexus, Reddit, Steam e Prima rifiutano la
lettura automatica: ciò che viene da lì è segnato *(estratto)*. Game UI Database non ha una scheda di BG3.

### 5.1 La barra dei turni

- **Dove:** in alto al centro dalla EA P7; con molti combattenti scorre invece di rimpicciolire. Chiunque entri
  nella zona del combattimento tira l'iniziativa e si aggiunge.
- **Colori:** nel mondo rosso per gli ostili, giallo per i neutrali, verde per gli alleati, blu per il personaggio
  principale, bianco per gli altri del gruppo; cornice rossa per i ritratti ostili, cornici proprie per alleati e
  neutrali dalla EA P8; dalla P4 filtri per protanopia, deuteranopia e tritanopia che ricolorano cornici, ritratti e
  contorni.
- **Chi agisce:** nessuna fonte descrive un ritratto ingrandito o luminoso *(non verificato)*. Sono documentate una
  freccia vuota per chi deve ancora agire e una piena con la clessidra per chi ha agito; dalla P2 l'avviso
  «Your Turn» col nome del personaggio; un pulsante per saltare al personaggio attivo.
- **Iniziativa condivisa:** alleati adiacenti in uno slot comune, con le cornici unite, che agiscono in qualunque
  ordine. È una regola di BG3, non di D&D: qui non si applica.
- **Round:** nessun contatore o separatore documentato sulla barra; la P4 ha diviso per round il registro di
  combattimento.
- **Arrivi e morti:** chi arriva dopo il primo round salta il turno e ha il ritratto grigio con la clessidra; il
  ritratto di un morto sparisce (guida del 2020, versione finale non verificata).
- **PF sulla barra:** un segno grafico dei PF senza numeri; la mod Better Topbar aggiunge PF, temporanei e CA. La
  concentrazione è un'icona al centro del ritratto.

### 5.2 I ritratti del gruppo e l'ispezione

- **Ritratti:** colonna a sinistra, sei prima di scorrere; PF e temporanei in piccolo sul ritratto (una mod li
  ingrandisce); icone delle condizioni in alto a sinistra, con tipo e durata nel suggerimento.
- **Concentrazione:** l'icona dell'incantesimo accanto al ritratto, con una X per terminarla; dalla EA P8 un timer
  sul ritratto.
- **A terra:** lo stato sta sul ritratto, con i tiri contro la morte: successi a sinistra, fallimenti a destra.
- **Ispezione a strati:** passando su un nemico, una striscia in alto con nome, PF, livello, stati e modificatori;
  suggerimenti compatti, Alt per espanderli, T per fissarli; poi la finestra Esamina con CA, caratteristiche e le
  resistenze come scudi per tipo di danno. Dalla P5 una modalità personalizzata nasconde i PF dei nemici.

### 5.3 Stati, movimento, stile

- **La stessa icona ovunque:** sul ritratto, sotto la barra dell'ispezione e in Esamina, a volte sopra la testa. La
  durata si legge nel suggerimento; numeri sulle icone *(non verificati)*. Anche il suono distingue: buff ascendenti,
  debuff dissonanti.
- **Movimento:** i tiri d'iniziativa compaiono sopra le teste all'inizio; la camera segue chi agisce (attiva per
  default, e Kotaku consiglia di spegnerla perché salta a ogni nemico); il turno successivo parte mentre finisce
  l'animazione del precedente. La P2 ha reso più chiari l'avviso di turno e l'avviso dei PF bassi.
- **Stile:** due serif umanistici secondo i modder (PostAntiqua per mouse e tastiera, Alegreya per il controller);
  colore riservato al significato e rimappabile. Ornamento e trasparenze non hanno una descrizione primaria.

### 5.4 Critiche e mod

- Larian (Nick Pechenin, gennaio 2026): avevano altre migliorie in mente che non sono entrate, e per Divinity prende
  idee dalle mod dell'interfaccia.
- Ciò che i giocatori hanno aggiunto: PF, temporanei e CA sulla barra (Better Topbar); resistenze nel pannello
  dell'ispezione (Better Target Info); fino a 16 ritratti con i PF più grandi (Dynamic Sidebar).
- La domanda opposta esiste: mod che nascondono barre della salute e percentuali *(estratto)*.
- Critiche: i turni condivisi si capiscono poco nella barra *(estratto)*; i comandi da console sono densi.

### 5.5 I principi che BG3 dimostra, e dove siamo

| Principio | BG3 | Noi |
| --- | --- | --- |
| Una coda sempre in vista, che scorre invece di rimpicciolire | EA P7 | **Sì**: la compatta scorre, con le sfumature ai bordi |
| Il colore non lavora da solo | Filtri per daltonici (P4) | **No** (L6) |
| Chi ha agito e chi deve agire, con forma e icona | Frecce piene e vuote, clessidra | **No** (L5) |
| Il cambio di turno annunciato per nome, il movimento spegnibile | Avviso, camera, pulsante | **Sì**: avviso con «A seguire», etichetta sulla pedina, Focus token spegnibile, «riduci movimento» rispettato |
| Informazione a strati | Striscia, suggerimento, Esamina | **Sì**: card, cassetto, scheda o statblock |
| La stessa icona di stato ovunque, durata a richiesta | Icona dipinta | **In parte**: emoji ovunque, ma di sistema (L3) |
| Una sola fonte dei PF, alla fedeltà del contesto, nascondibile | Tutto o PF nascosti | **Sì, meglio**: matrice per fazione e superficie |
| La struttura del round sta da qualche parte | Nel registro | **Sì, meglio**: nel tracker |
| Lo stato vitale sul ritratto | Tiri contro la morte e concentrazione | **No** (L4) |
| Pianificare la densità | Tetto di ritratti, scorrimento | **In parte**: scorrimento sì, troppi tagli nella compatta (L2) |
| Un carattere con personalità | Serif umanistici | **In parte**: Georgia solo nell'avviso (L7) |

Fonti: [bg3.wiki, Turn order](https://bg3.wiki/wiki/Turn_order) ·
[bg3.wiki, Initiative](https://bg3.wiki/wiki/Initiative) · [bg3.wiki, Hostile](https://bg3.wiki/wiki/Hostile) ·
[bg3.wiki, Death saving throw](https://bg3.wiki/wiki/Death_saving_throw) ·
[bg3.wiki, Concentration](https://bg3.wiki/wiki/Concentration) · [bg3.wiki, Conditions](https://bg3.wiki/wiki/Conditions) ·
[bg3.wiki, Options](https://bg3.wiki/wiki/Options) ·
[Patch 2](https://devtrackers.gg/baldurs-gate-3/p/e73b92ac-patch-2-now-live) ·
[Patch 4](https://devtrackers.gg/baldurs-gate-3/p/324486cc-patch-4-now-live) ·
[EA Patch 8](https://devtrackers.gg/baldurs-gate-3/p/07cbccab-patch-8) ·
[EA Patch 7](https://mp1st.com/news/baldurs-gate-3-february-15-update-out-for-patch-7-barbarian-class-on-pc) ·
[Patch 5](https://rpgsite.net/news/15170-baldurs-gate-3-patch-5-adds-epilogue-gameplay-two-new-game-modes-performance-updates-bug-fixes) ·
[Patch 8 finale](https://baldursgate3.game/news/the-final-patch-new-subclasses-photo-mode-and-cross-play_138) ·
[Gamepressure, stati](https://www.gamepressure.com/baldurs-gate-iii/how-to-read-character-statuses/z5da79) ·
[Gamepressure, interfaccia](https://www.gamepressure.com/baldurs-gate-iii/interface/zad9f7) ·
[EIP, consigli](https://eip.gg/bg3/guides/tips-tricks/) ·
[Shacknews, combattimento](https://www.shacknews.com/article/136590/combat-explainer-baldurs-gate-3) ·
[Larian 2020, combattimento](https://baldursgate3.game/news/a-little-about-combat-stealth_3) ·
[Kotaku, camera](https://kotaku.com/baldurs-gate-4-bg3-settings-combat-camera-1850729597) ·
[A Sound Effect](https://www.asoundeffect.com/baldurs-gate-3-game-sound-design/) ·
[Better Topbar](https://www.curseforge.com/baldurs-gate-3/mods/better-topbar) ·
[Better Target Info](https://www.curseforge.com/baldurs-gate-3/mods/better-target-info) ·
[Dynamic Sidebar](https://www.curseforge.com/baldurs-gate-3/mods/dynamic-sidebar) ·
[Larian e le mod](https://consolepcgaming.com/larian-is-borrowing-baldurs-gate-3-ui-mod-ideas-for-divinity).

---

## 6. Altri casi studio

Le fonti sono quelle delle ricerche; *(estratto)* vuol dire visto solo nell'estratto di un motore di ricerca, *(non
verificato)* che non ho trovato una fonte.

### 6.1 Giochi a turni

| Gioco | Come mostra l'ordine | Cosa insegna a noi |
| --- | --- | --- |
| **Divinity: Original Sin 2** | Fila di ritratti in alto, con il turno corrente e il successivo; contorno rosso per i nemici. Una mod ricolora le cornici perché rosso e marrone si confondono *(estratto)*. | Mostrare oltre il round rende visibile il confine. Il colore da solo è fragile. |
| **Octopath Traveler II** | Due file di icone in alto: turno corrente e turno successivo. Sui nemici lo scudo con il numero e le debolezze «?». | Il round dopo in vista; lo stato come numero piccolo sulla creatura. |
| **Honkai: Star Rail** | Lista verticale «Action Order», nemici e alleati insieme; numero di Action Value facoltativo (spento per default); i turni extra hanno una stella. | Un livello numerico facoltativo; i turni fuori sequenza marcati con un segno proprio. |
| **Final Fantasy X** | Finestra CTB in alto a destra, in cima chi agisce dopo; i nemici uguali hanno una lettera (A, B…); scegliendo un'azione la finestra mostra il nuovo ordine prima di confermare. | Distinguere i doppioni; l'anteprima del riordino (non ci serve: l'ordine D&D non cambia). |
| **Clair Obscur: Expedition 33** | Linea del tempo sempre visibile a sinistra; i giocatori hanno chiesto di distinguere i nemici identici *(estratto)*. | I doppioni vanno distinti. |
| **Darkest Dungeon II** | Solo una parte dell'ordine, per scelta; gettoni di stato sotto la barra della salute, con la durata nel suggerimento; tacche ai quarti sulla barra. | Quanto mostrare è una scelta di design; stati piccoli sotto la barra, con la durata. |
| **Into the Breach** | Niente coda: l'intenzione dei nemici è disegnata sulla griglia, l'ordine degli attacchi con un tasto. Regola del designer: sacrificare le idee belle alla chiarezza, sempre. | Il principio guida di tutto lo studio. |
| **Wartales** | Ordine in basso a sinistra; passando su un'icona si accende l'unità sul campo; modalità «anonima» facoltativa. | Il legame tra lista e mappa; l'informazione come opzione. |
| **Mario + Rabbids Sparks of Hope** | Regola di accessibilità: nessuna informazione affidata al solo colore. | Fazioni non solo per colore (rosso e verde si confondono per un daltonico su dodici). |
| **Child of Light** | Barra del tempo con zona d'attesa e zona di lancio. | Non pertinente all'ordine fisso di D&D. |

Pathfinder (Kingmaker e Wrath) e Solasta: la disposizione dei loro tracker non è documentata da nessuna fonte
leggibile; restano fuori.

**Schemi ricorrenti nei giochi.** Una coda unica per i due schieramenti (FFX, Star Rail, Octopath, Darkest
Dungeon II, Expedition 33); chi agisce dopo in cima o subito accanto (FFX, Star Rail, Octopath, Wartales); il round
successivo in vista (DOS2, Octopath); i turni fuori sequenza marcati (stella di Star Rail); lo stato piccolo sotto la
barra della salute (Darkest Dungeon II, Star Rail, Octopath); i doppioni distinti (FFX); il colore sostenuto da forme
e icone (Sparks of Hope).

Fonti principali: [Gamepressure DOS2](https://www.gamepressure.com/originalsinii/combat/z09214) ·
[Fextralife DOS2](https://divinityoriginalsin2.wiki.fextralife.com/Initiative) ·
[GamerGuides Octopath](https://www.gamerguides.com/octopath-traveler/guide/the-basics/game-mechanics/battle-system) ·
[Keqing Mains Star Rail](https://hsr.keqingmains.com/?p=43621) ·
[Jegged FFX](https://jegged.com/Games/Final-Fantasy-X/Tips-and-Tricks/CTB-Window.html) ·
[Fextralife Expedition 33](https://expedition33.wiki.fextralife.com/Combat) ·
[wiki.gg Darkest Dungeon II](https://darkestdungeon.wiki.gg/wiki/Combat_Mechanics_(Darkest_Dungeon_II)) ·
[Game Developer, Into the Breach](https://gamedeveloper.com/design/-i-into-the-breach-i-dev-on-ui-design-sacrifice-cool-ideas-for-the-sake-of-clarity-every-time-) ·
[Turn Based Lovers, Wartales](https://turnbasedlovers.com/review/wartales-review-in-details/) ·
[Ubisoft, Sparks of Hope](https://news.ubisoft.com/en-au/article/3geL8IbYETmgHk6W017HpS/mario-rabbids-sparks-of-hope-accessibility-spotlight).

### 6.2 Tracker dei VTT e strumenti con uno schermo per i giocatori

| Strumento | Come lo fa | Cosa insegna a noi |
| --- | --- | --- |
| **Foundry VTT, tracker e segnalino di turno** | Lista nella barra laterale; dalla V13 un segnalino animato sotto la pedina che agisce. Nella V14 il segnalino col logo è stato sostituito da uno più sobrio perché in pratica era troppo. I combattenti sconfitti sbiadiscono per i giocatori e si possono saltare. | La sobrietà nei segni sulla mappa; lo sconfitto sbiadito. |
| **Carousel Combat Tracker** (theripper93, il più diffuso) | Striscia di ritratti in alto, ferma o che ruota con l'attivo al centro o a sinistra; sei misure di ritratto; icone degli effetti con un anello di durata; interruttori per i giocatori (nomi, nascondere gli sconfitti, nascondere un nemico fino al suo primo turno, bordo nel colore di fazione). | Le icone degli effetti con la durata; nascondere o spegnere gli sconfitti. |
| **Combat Carousel** (archiviato nel 2024) | La prima striscia di card «da CRPG»: ritratto, iniziativa, barra; nome e PF al passaggio del mouse. | Il nostro stesso genere: la striscia compatta ha dimostrato di funzionare. |
| **Monk's Combat Details** | Avviso e suono quando un giocatore è il prossimo, e di nuovo quando tocca a lui. | Il segno di chi viene dopo. |
| **Your Turn!** (Foundry) | Fascia con ritratto per circa 4 s, con chi viene dopo; per un nemico nascosto un avviso generico. | È il nostro avviso di turno. |
| **SC Combat Wheel** (Foundry) | Mezzo cerchio di ritratti che ruota a ogni turno; PF dei nemici esatti, a barra, descrittivi o nascosti; rispetta «riduci movimento». | La stessa matrice di scelte che abbiamo. |
| **Guida Foundry Hub al gioco in presenza** | Su un televisore steso sul tavolo i tracker si leggono capovolti da alcuni posti, e le miniature coprono le icone sulle pedine. | Il nostro schermo che ruota verso chi gioca è raro; lo stato nel tracker batte lo stato sotto le miniature. |
| **Roll20, Turn Tracker** | La riga in cima è il turno; avanzando passa in fondo. Niente contatore dei round, niente vista per il televisore (richiesta di febbraio 2026 senza risposta). | Il pannello del GM usato come schermo per tutti è il fallimento più comune. |
| **D&D Beyond Maps** | Il DM ha una lista con nome, CA, PF e iniziativa; i giocatori vedono bandierine con i ritratti in alto. Mentre agisce un mostro nascosto la fila resta sul mostro precedente; i doppioni hanno una lettera. Niente condizioni per i giocatori: i tester hanno chiesto le icone. | Come noi per i turni nascosti (lotto L16). Le icone delle condizioni sono una richiesta esplicita dei giocatori. |
| **Owlbear Rodeo, tracker ufficiale** | Una lista con nome e iniziativa; niente round, niente PF; il codice non controlla il ruolo prima di una modifica. | La base da cui partono quasi tutte le estensioni. |
| **Estensioni OBR** (Pretty Sordid, Stat Bubbles, Clash!, Battle Board, Simple HP Tracker, SIT) | Ritratti e round (Pretty Sordid); barra a segmenti sulla pedina (Stat Bubbles); camera che segue e etichetta sulla pedina (Clash!); «In salute, Sanguinante, Morente, Morto» con Niente, Stato o Numeri per PG e PNG (Battle Board); avviso quando un effetto scade (SIT). | I descrittori a gradini con il passo al 50% sono la norma: li abbiamo («Ferito»). |
| **Fantasy Grounds Unity** | Tabella con colonne; bordo colorato e segno a sinistra sul turno; casella del round; PNG in «Stato» per default; suono per il giocatore di turno. | Il controllo più fine su cosa vedono i giocatori, con un'interfaccia da foglio di calcolo. |
| **Shard Tabletop** | Il numero d'ordine scritto su ogni pedina; riquadro giallo su chi agisce; i mostri morti restano con un'icona e vengono saltati. | Il morto distinto dal vivo, sulla mappa e nel turno. |
| **Encounter+** (schermo esterno) | Striscia su un bordo o schermo intero; scala per pollice reale, margini e correzione dell'overscan dei televisori. Ha dovuto correggere immagini di creature nascoste comparse sullo schermo esterno. | Le impostazioni per lo schermo fisico devono funzionare: è la nostra scala (T1). |
| **Improved Initiative** (vista giocatori) | Etichetta colorata per i mostri («Healthy, Hurt, Bloodied, Defeated»); opzioni per l'attivo in cima, il contatore dei round, il ritratto che compare 5 s al cambio di turno. | Gli stessi strumenti del nostro avviso e della policy dei PF. |
| **Estensione dei fan di Critical Role** | Ritratti insanguinati sotto metà PF, grigi alla morte; tiri contro la morte visibili. | I tiri contro la morte e la morte si vedono sul ritratto. |

**Cosa fanno i migliori.** PF dei nemici a gradini, separati da quelli degli alleati; turni nascosti che non svelano
niente; il ritratto come unità, a misura della stanza; la mappa che segna chi agisce; il cambio di turno come evento
breve; il segno di chi viene dopo; impostazioni per lo schermo fisico; round e durate in vista; sobrietà.

**Gli errori comuni.** Il pannello del GM usato come schermo per tutti; fughe di informazioni sullo schermo
condiviso; nessun segno dello stato dei nemici; niente round né condizioni; l'orientamento dello schermo ignorato;
lo stato solo sulle pedine, coperte dalle miniature.

**Dove stiamo.** Abbiamo già quasi tutto ciò che fanno i migliori: vista dei giocatori separata e in sola lettura,
matrice dei PF con i descrittori, turni nascosti senza fughe, avviso di turno con «A seguire», etichetta sulla pedina,
schermo che ruota verso chi gioca (nessuno degli strumenti trovati lo fa). Ci mancano il segno di chi viene dopo
nella lista, le icone degli effetti con la durata, i tiri contro la morte e la morte sulla card, e una scala dello
schermo che funzioni sopra il 100%.

Fonti principali: [Foundry, combat](https://foundryvtt.com/article/combat/) ·
[Foundry 14.358](https://foundryvtt.com/releases/14.358) ·
[combat-tracker-dock](https://github.com/theripper93/combat-tracker-dock) ·
[Combat Carousel](https://github.com/death-save/combat-carousel/wiki) ·
[Monk's Combat Details](https://github.com/ironmonk88/monks-combat-details) ·
[Your Turn!](https://foundryvtt.com/packages/your-turn) ·
[SC – Combat Wheel](https://foundryvtt.com/packages/sc-combat-wheel) ·
[Foundry Hub, gioco in presenza](https://foundryvtt-hub.com/guide/using-foundry-for-in-person-gaming) ·
[Roll20 Turn Tracker](https://help.roll20.net/hc/articles/360039178634) ·
[Roll20, richiesta per TV](https://app.roll20.net/forum/post/12673830/pop-out-initiative-tracker-and-support-for-projectors-and-tvs) ·
[D&D Beyond, Combat Encounters on Maps](https://dndbeyond-support.wizards.com/hc/en-us/articles/46385529638164-Combat-Encounters-on-Maps) ·
[OBR Initiative Tracker](https://github.com/owlbear-rodeo/initiative-tracker) ·
[Battle Board](https://extensions.owlbear.rodeo/battle-board) ·
[Clash!](https://extensions.owlbear.rodeo/clash) ·
[Fantasy Grounds, opzioni 5E](https://fantasygroundsunity.atlassian.net/wiki/spaces/FGCP/pages/996642014/5E+Campaign+Options) ·
[Shard, Monster Mash](https://www.shardtabletop.com/blog/monster-mash) ·
[Encounter+, schermo esterno](https://docs.encounter.plus/settings/external-screen/) ·
[Improved Initiative](https://github.com/cynicaloptimist/improved-initiative) ·
[CritRoleHpTracker](https://github.com/snappdragonn/CritRoleHpTracker).

---

## 7. Lo scarto, voce per voce

| Cosa fa BG3 (o un altro caso) | Il tracker oggi | Proposta |
| --- | --- | --- |
| Tiri contro la morte sul ritratto, successi a sinistra e fallimenti a destra | Solo nell'avviso | L4.1 (prova `16`, `17`) |
| Concentrazione come icona sul ritratto | «C» nell'etichetta; nella compatta può stare nel cassetto | L4.4 (prova `16`) |
| Il morto sparisce dalla barra (Foundry lo sbiadisce, Shard gli mette un'icona) | Resta, con lo stesso «KO» del PG svenuto; per i giocatori senza segno | L4.2, L4.3 (prova `17`) |
| La stessa icona di stato ovunque | Emoji di sistema; nella compatta una condizione sola | L3 (prova `16`) |
| Chi ha agito e chi deve agire (frecce piene e vuote, clessidra) | Nessun segno | L5 (prova `18`) |
| Il prossimo annunciato (Monk's, Your Turn!) | Solo «A seguire» nell'avviso | L5 (prova `16`, `18`) |
| Colore sostenuto da filtri per daltonici (BG3), da forme e icone (Sparks of Hope) | Solo colore | L6 |
| Serif umanistici | Helvetica; Georgia solo nell'avviso | L7, facoltativo |
| Una coda che scorre senza rimpicciolire | Già così | — |
| Avviso col nome del personaggio | Già così, con «A seguire» e il round | — |
| Camera che segue, spegnibile | Focus token | — |
| Round | Già nel tracker (BG3 solo nel registro) | — |
| PF nascondibili | Matrice per fazione e superficie | — |
| Scala dello schermo (Encounter+) | Rotta sopra il 100% | L1 |
| Numeri di danno, lampi sulla barra | No, per scelta (D5 del 31/10) | — |
| Iniziativa condivisa del gruppo | Non è una regola di D&D | — |
| Economia d'azione sulla barra | Fuori, per scelta | — |

---

## 8. Lotti proposti

Ordinati per beneficio sul rischio. Ogni lotto in un commit, con le prove in entrambe le viste, GM e giocatori
(come sempre per il tracker), e le voci nuove in `docs/PROVE_IN_STANZA.md`. I lotti ⚠ toccano aree fragili di
`AGENTS.md`: prima della patch va spiegato il percorso dei dati e si aspetta il via.

### L1 · La scala dello schermo del tavolo (difetto T1) — rischio basso

- **Cosa:** la radice del tracker non deve superare la finestra quando la pagina è ingrandita. La strada più
  stretta: `__setTrackerViewZoom` (`src/initiativeList.js:9778`) scrive anche una variabile con la scala sulla
  radice, e il tracker usa `min-height: calc(100vh / var(--tbp-tracker-zoom, 1))` al posto di `100vh`. La regola
  comune di `public/popover-glass.css:19` resta com'è per gli altri popup, che non si ingrandiscono.
- **Prova:** banco a 50, 75, 100, 125, 150 e 200%, compatta ed espansa, GM e giocatori: card intere, nessuna fascia
  vuota, fondo della lista e barra ▲ ▼ raggiungibili. Poi la prova B1 di `docs/audits/GIRO-OBR-1.5.0.md` in stanza.
- **Non tocca:** metadata, turno attivo, render.
- **Stato (18/11): fatto, non committato, da provare in stanza.**
  - `src/initiativeList.js`, `__setTrackerViewZoom`: oltre allo `zoom` scrive la scala in `--tbp-tracker-zoom` sulla
    radice del documento, e la toglie al 100%.
  - `index.html`: `#initiative-widget[data-glass-popover="1"]` ha altezza minima
    `calc(100vh / var(--tbp-tracker-zoom, 1))`; la regola comune di `public/popover-glass.css` non cambia.
  - `test/trackerScaleRootHeight.test.js`: test di contratto sulle due parti.
  - Misure al banco, 24 casi (6 scale × 2 viste × GM e giocatori): la radice è sempre alta quanto la finestra. Compatta
    dei giocatori al 150%: card da 22 a 209 px in una finestra di 234 (prima da 81 a 267); al 200% da 30 a 278 in 312
    (prima da 186 a 434). Espansa del GM al 150%, lista scorsa in fondo: ultima card a 877 px e barra ▲ ▼ a 950, in
    una finestra di 956 (prima ultima card a 1355, barra fuori). Schermate `19` e `20`.
  - `npm test`: 6521 test, tutti verdi. Build di verifica in una cartella della scratchpad, `dist/` non toccato.

### L2 · Rifiniture (T6) — rischio basso

1. Il cerchio della console Boss scende sotto l'angolo anche sulle card «Azione epica» compatte (`belowCorner` in
   `__mountTrackerQuickActions`, `src/initiativeList.js:9221`: una condizione).
2. Barre PF del tracker nei colori della mappa (`#22c55e`, `#f59e0b`, `#ef4444`, già nei token `--obrt-hp-*`):
   `hpColorByPct` in `src/initiativeList.js:7011` e la riga di `src/initiativeCardClassicBuilder.js:1117`. La mappa
   non si tocca (le barre sono item della scena), come consigliava l'audit del 22/10.
3. Nella compatta un'etichetta che mostrerebbe meno di quattro lettere («Sc…») non si disegna e conta nel «+N»
   (`src/initiativeCardCompact.js`, costruzione della riga degli effetti).
4. Nomi con l'epiteto: nella compatta, se il nome non ci sta, la parte prima della virgola («Auril» invece di
   «Auril, Vergin…»); il nome intero resta nel suggerimento e nella vista espansa. Toglie 4 degli 11 tagli. ⟶ D4.
5. «Fuori combattimento» nella compatta in forma breve («A terra»), come «Ferito» e «Provato». ⟶ D4.

**Stato (18/11): fatto, non committato.** L'utente ha chiesto di procedere con L2 così com'era: i punti 4 e 5 seguono
D4 come consigliato.

- `src/initiativeList.js`: `belowCorner` vale anche per le azioni epiche (`__mountTrackerQuickActions`); `hpColorByPct`
  con i colori della mappa; in `renderCompactTrack` le risorse leggendarie si leggono prima della riga degli effetti,
  `compactPreviewPillFits` decide se l'etichetta ci sta, e senza etichetta il cassetto ha tutti gli effetti
  (`compactEffects.slice(showPreview ? 1 : 0)`), «+N» li conta tutti e un effetto solo basta per aprirlo
  (`__toggleCompactEffectsPopover`, parametro `minEffects`).
- `src/initiativeCardCompact.js`: `compactCardDisplayName` (nome prima della virgola se quello intero non ci sta,
  misurato con un canvas al peso del nome), `compactPreviewPillFits`, `buildCompactCardStatus` con `showPreview`
  (senza etichetta «+N» sta nella riga, e da aperto diventa «−» per richiudere), `syncCompactEffectsToggleState` e
  `bindCompactEffectsToggle` con `hiddenCount`, «A terra», margine di 6 px nell'etichetta «Azione Epica».
- `src/initiativeCardClassicBuilder.js`: barra con i colori della mappa.
- Test: `test/trackerCompactRefinements.test.js` (nuovo); in `test/initiativeControllerContract.test.js` la frase
  fissata del cassetto diventa `compactEffects.slice(showPreview ? 1 : 0)`.
- Banco: nella barra compatta del GM i testi tagliati passano da 11 a 5 su 69 (restano tre etichette lunghe e due
  nomi senza virgola); «EP» intero con il cerchio sotto; «+1» del boss leggendario apre il cassetto con «Scudo della
  fede (4)», diventa «−» e lo richiude; barre in `#22c55e`, `#f59e0b`, `#ef4444` in entrambe le viste. Schermate `21` e
  `22`. `npm test`: 6527 test, tutti verdi; build di verifica fuori da `dist/`.

### L3 · Icone delle condizioni con i round (T3) — rischio basso, lavoro grafico ⟶ D2

- **Cosa:** un set di icone disegnate nello stesso stile delle icone degli strumenti, una per ogni condizione del
  catalogo più KO, Morto e Stabile (circa 18), colorate dal tema della condizione, con il numero dei round in un
  bollino quando la condizione ha una durata.
- **Compatta:** le condizioni diventano una fila di icone (fino a quattro in 92 px) al posto di un'etichetta tagliata
  e «+N»; gli incantesimi e i buff restano etichette. Prova disegnata in `16` e `17` (Goblin capobanda).
- **Espansa:** le etichette restano, con l'icona al posto dell'emoji.
- **Mappa:** le etichette sulla mappa sono item di testo e non possono contenere un'icona: lì restano le emoji.
- **Fonte delle icone:** disegnate per il plugin, oppure prese da game-icons.net (licenza CC BY 3.0, la stessa
  usata dalle icone di stato di Foundry): servirebbe una riga di attribuzione nelle Opzioni o nella guida.
- **File:** `src/conditions.js` (accanto a `CONDITION_EMOJI`, una mappa nome → icona), la costruzione delle
  etichette in `src/initiativeCardCompact.js` e `src/initiativeCardClassicBuilder.js`, le icone in `public/`.
  Nessun metadata nuovo: l'icona si ricava dal nome della condizione, come oggi l'emoji.

**Stato (18/11): fatto con le emoji, solo nella compatta, non committato.** D2 era stata decisa come game-icons.net in
entrambe le viste: le 19 icone sono state scaricate col permesso dell'utente, montate e provate al banco, poi tolte su
sua richiesta («ripristina le emoji»). Dell'esperimento l'utente ha tenuto una cosa: nella compatta ogni condizione
si vede da sola, come icona. Ora quell'icona è la sua emoji. Nessun file scaricato è rimasto nel progetto.

- **Compatta:** ogni condizione del catalogo (con Indebolimento, Ira, Santuario del Crepuscolo, Stabile e Morto) è un
  quadratino di 16 px con la sua emoji, il bordo nel colore della sua etichetta e i round (o il livello di
  Indebolimento) in un dischetto bianco; fino a quattro nella riga, prima di tutto il resto. Nello spazio che avanza,
  il primo effetto senza emoji propria (incantesimi, pozioni, capacità come Ispirazione Bardica, condizioni inventate)
  resta un'etichetta se le restano quattro lettere; «+N» conta gli altri. I quadratini, l'etichetta e «+N» aprono il
  cassetto, che elenca tutti gli effetti col nome. Senza condizioni la riga è quella di L2.
- **Espansa e mappa:** come prima, emoji e nome.
- `src/conditions.js`: `conditionIconEmoji` (l'emoji di una condizione del catalogo, quella del tema se c'è, come in
  `formatConditionName`; nulla fuori dal catalogo) e `conditionAccentColor` (il colore della sua etichetta).
- `src/initiativeCardCompact.js`: `compactConditionIconCount`; gli effetti con emoji portano `icon`, `iconCount` e
  `iconColor`; `compactStatusLayout` decide la riga (quadratini, etichetta, «+N», cassetto); `buildCompactConditionIconChip`,
  `buildCompactIconStatusRow`; `syncCompactEffectsToggleState` e `bindCompactEffectsToggle` conoscono la fila.
- `src/initiativeList.js`: `renderCompactTrack` passa `conditionIconEmoji` e `conditionAccentColor`; la fila apre il
  cassetto, anche accanto all'etichetta della concentrazione (che apre il suo incantesimo).
- Test: `test/compactConditionEmoji.test.js` (nuovo, 7 test).
- Banco, compatta per GM e giocatori: goblin capobanda ⬇️ ☠️ «3» 😨 «2» ✊, Brann 💤 💫 (spenti con la card a terra);
  il clic sui quadratini apre e richiude il cassetto coi nomi; le emoji misurano 14×10 px nei quadratini da 16.
  Vista espansa invariata, per GM e giocatori. Schermate `25` e `26`. `npm test`: 6542 test, tutti verdi; build di
  verifica fuori da `dist/`.

### L4 · Lo stato vitale sulla card (T4, T5) — rischio basso, solo disegno

1. **Tiri contro la morte:** su un PG a 0 PF, tre tacche verdi e tre rosse al posto della barra vuota, lette da
   `meta.deathSaves` (`src/deathSaveCore.js`), in entrambe le viste. Prova disegnata su Brann (`16`, `17`).
2. **Morto non è KO:** una creatura non PG a 0 PF, o con la condizione «Morto», ha il teschio e la card in grigio;
   «KO» resta al PG privo di sensi. Prova disegnata sul goblin (`17`).
3. **I giocatori vedono chi è a terra:** con i PF dei nemici «Nascosti», il segno di KO o di morte compare lo stesso
   (oggi sparisce insieme ai PF). ⟶ D3.
4. **Concentrazione sempre in vista:** nella compatta una «C» sull'anello del ritratto quando la creatura si
   concentra, anche se l'incantesimo sta nel cassetto (prova su Lavera, `16`, `17`). Nell'espansa la «C» c'è già
   nell'etichetta.

File: `src/initiativeCardCompact.js` (`buildCompactCardHP`, `buildCompactCardIndicators`),
`src/initiativeCardClassicBuilder.js`; `syncTrackerHPNow` (`src/initiativeList.js`) aggiunge il KO tra un render e
l'altro e va allineato. ⚠ Il punto 3 cambia ciò che i giocatori vedono: dipende da D3.

**Stato (18/11): fatto, non committato.** D3 decisa dall'utente come consigliato: D3a sì, D3b teschio per ogni non PG
a 0 PF, salvo «Privo di sensi».

- `src/trackerVitalStateCore.js` (nuovo): `trackerVitalState` (vivo, a terra, morto: «Morto» o un non PG a 0 PF senza
  «Privo di sensi»), `trackerVitalStateAtZero`, `isDeadByCondition`, `trackerDeathSaves` (un PG a terra e non
  stabile, da `meta.deathSaves`).
- `src/initiativeList.js`: la voce di ogni creatura porta `vitalState`, `vitalStateAtZero`, `deadByCondition` e
  `deathSaves`, calcolati dai metadati prima della proiezione dei giocatori; `renderTrack` passa l'opzione dei tiri
  contro la morte; `renderCompactTrack` mette le tacche al posto della barra e la «C»; `syncTrackerHPNow`, fra due
  render, disegna KO o teschio secondo la card e nasconde la «C» sotto il KO. Le code di render non cambiano: una
  modifica di `deathSaves` fa già un render completo.
- `src/options/optionsProjection.js` e `optionsSelectors.js`: la proiezione toglie la conta ai giocatori quando
  l'opzione dei promemoria la nasconde (`selectTrackerProjectionPolicy` ha `deathSaves`); lo stato passa sempre.
- `src/initiativeCardCompact.js`, `initiativeCardClassic.js`, `initiativeCardClassicBuilder.js`: stato vitale nelle
  due presentazioni (senza `vitalState` resta la regola di prima), `buildVitalStateBadge` (KO o teschio di
  `boss.svg`), `buildDeathSavePips`, `buildCompactConcentrationBadge`, filtri `KNOCKED_OUT_CARD_FILTER` e
  `DEAD_CARD_FILTER`.
- Test: `test/trackerVitalState.test.js` (nuovo, 8 test).
- Banco, due viste, GM e giocatori: Brann KO con le tacche (2 successi, 1 fallimento); goblin morto grigio col
  teschio anche per i giocatori con i PF nascosti; «C» su Lavera nella compatta; fra due render Klos a 0 PF diventa
  KO con le tacche vuote, il goblin capobanda teschio. Schermate `23` e `24`. `npm test`: 6535 test, tutti verdi;
  build di verifica fuori da `dist/`.

### L5 · Leggere il round: chi ha agito, chi viene dopo (T7) — rischio medio ⚠ turno attivo ⟶ D5

- **Chi ha agito:** le card di chi ha già agito in questo round leggermente spente (saturazione e luminosità più
  basse), quelle che devono ancora agire piene. È la freccia piena o vuota di BG3 tradotta nel nostro linguaggio:
  a metà round il tavolo vede subito quanto manca. Il KO resta più spento e ha il suo badge. Prova in `18`.
- **Chi viene dopo:** un'etichetta «DOPO» in cima alla card che agirà al prossimo ▶, accanto al triangolo del turno
  attivo, per GM e giocatori (prove in `16` e `18`). Al tavolo è il «sei il prossimo, preparati» che il GM dice a
  voce.
- **Rischio:** «prossimo» e «già agito» devono venire dalla stessa logica della navigazione (azioni epiche, turni di
  Tana, creature nascoste ai giocatori, gruppi, ID virtuali), non dalla posizione nella lista. È disegno puro, ma
  vicino alla logica del turno attivo, quindi ⚠.
- **Non proposto:** la coda che ruota (l'attivo sempre a sinistra, come Roll20 o Carousel). In D&D l'ordine non
  cambia e al tavolo ognuno ricorda «vengo dopo il goblin»: far scorrere tutte le card a ogni turno toglierebbe
  quel riferimento.

**Stato (18/11): fatto e tolto.** D5 decisa come consigliato (card spente e «DOPO», anche ai giocatori). Il lotto è
stato scritto in entrambe le viste, leggendo solo lo stato del turno; l'utente l'ha scartato («non mi piace») e il
codice è stato tolto per intero, test compresi. Il tracker resta com'era: alone sul turno attivo, «A seguire»
nell'avviso. Non va riproposto (sezione 9).

### L6 · Fazioni non solo per colore — rischio basso, facoltativo ⟶ D6

Rosso (nemici) e verde (alleati) sono la coppia che un daltonico confonde; BG3 ha aggiunto i filtri per questo. Due
strade: un segno di forma per i nemici (per esempio il badge dell'iniziativa a punta invece che tondo, in
`buildCompactCardIndicators` e nel badge della vista espansa), oppure un'opzione che sposta i colori di fazione su
una palette sicura (`factionColors`, `src/initiativeList.js:6973`, e i token `--obrt-faction-*`). Serve solo se al
tavolo c'è un daltonico.

**Stato (18/11): scartato per ora** dall'utente (D6). Nessuna modifica; se servirà, le due strade restano queste.

### L7 · Carattere — rischio basso, facoltativo ⟶ D7

La differenza di stile più netta da BG3 è il carattere: due serif umanistici (PostAntiqua, Alegreya) contro
Helvetica. Proposta minima: Alegreya (licenza OFL, il file servito dal plugin in `public/`) al posto di Georgia nei
titoli dell'avviso di turno, che sono già in serif per scelta (D5 del polishing, `--obrt-font-display`), e solo dopo
averla vista al banco. Non nella compatta: un carattere più largo aumenterebbe i tagli.

**Stato (18/11): fatto, non committato.** D7 decisa (a) e confermata dopo la prova al banco. `--obrt-font-display`
(`public/ui-typography.css`) vale per i titoli di tutti gli avvisi a comparsa: turno, concentrazione, velocità, boss,
reazione. Col permesso dell'utente è stato scaricato da jsDelivr il pacchetto `@fontsource-variable/alegreya@5.2.8`,
solo `alegreya-latin-wght-normal.woff2` (43.800 byte, pesi 400–900, alfabeto latino con le accentate) e `LICENSE`
(4.513 byte, SIL OFL 1.1, «The Alegreya Project Authors»). La prova al banco, col carattere caricato solo nella
pagina dell'avviso, è nelle immagini `27` (l'avviso di turno vero) e `28` (un campione dei titoli degli altri avvisi):
Alegreya è più stretta di Georgia (meno titoli tagliati) e più calligrafica, vicina allo stile di BG3.

- `public/fonts/alegreya-latin-wght-normal.woff2` e `public/fonts/Alegreya-OFL.txt` (la licenza, accanto al file).
- `public/ui-typography.css`: un `@font-face` (pesi 400–900, `font-display: swap`) e
  `--obrt-font-display: "Alegreya", Georgia, "Times New Roman", serif`: Georgia mentre il carattere carica o se non
  arriva. Le cinque pagine degli avvisi caricano già questo foglio; il tracker e le console usano `--obrt-font-ui`.
- Test: `test/noticeDisplayFont.test.js` (nuovo, 3 test).
- Banco: l'avviso di turno vero disegna titolo e occhiello in Alegreya servita dal plugin (risposta 200,
  `font/woff2`, carattere caricato); le card del tracker restano in Helvetica. `npm test`: 6545 test, tutti verdi;
  build di verifica fuori da `dist/`, con `fonts/` nel pacchetto.
- **Al bundle:** `dist/fonts/` è nuova e `dist` è ignorata da git: va aggiunta con `git add -f`.

**Altri caratteri provati (18/11), su richiesta dell'utente.** Da Google Fonts, sempre tramite Fontsource su jsDelivr,
nella scratchpad e non nel progetto: DM Serif Display 5.2.8 (`dm-serif-display-latin-400-normal.woff2`, 24.744 byte),
DM Serif Text 5.2.8 (24.512 byte) e Young Serif 5.3.0 (26.992 byte), ciascuno con la sua licenza OFL 1.1. Hanno un solo
peso, il regolare: nella prova sono registrati per 400–900, così i titoli a 800 usano il regolare e non un grassetto
finto. Confronto sullo stesso avviso di turno vero e campione dei titoli piccoli: immagini `29` e `30`.

- **DM Serif Display e Text:** quasi uguali a queste misure, alto contrasto, più leggeri dei grassetti di oggi;
  l'occhiello in maiuscolo a 10 px diventa sottile. Larghezza vicina ad Alegreya (titolo «Turno di Dars»: 108 px
  contro 105; Georgia 129).
- **Young Serif:** morbido, d'aria anni Settanta, tratti regolari; largo come Georgia (126 px), quindi i nomi lunghi
  si tagliano come prima.
- I numeri: Georgia e Alegreya li hanno «all'antica» (il «2» del round piccolo), DM Serif e Young Serif allineati.

**Scelta finale (18/11): Vollkorn**, dopo un'altra prova con Vollkorn e Fraunces abbinati ad Alegreya Sans (immagini
`34`–`36`). Nel codice `public/fonts/vollkorn-latin-wght-normal.woff2` (46.356 byte, `@fontsource-variable/vollkorn`
5.3.0, pesi 400–900) e `public/fonts/Vollkorn-OFL.txt` hanno preso il posto dei file di Alegreya;
`--obrt-font-display: "Vollkorn", Georgia, "Times New Roman", serif`. Banco: l'avviso vero carica Vollkorn dal plugin
(200); `npm test` 6545 verdi; build con `fonts/`.

**Il carattere senza grazie dell'interfaccia: Figtree (18/11).** Provati al banco IBM Plex Sans (`31`–`33`), Alegreya
Sans (`34`–`36`), Figtree, Atkinson Hyperlegible, Fira Sans e Inter (`37`–`39`); scelto Figtree.

- `public/fonts/figtree-latin-wght-normal.woff2` (20.156 byte, `@fontsource-variable/figtree` 5.3.0, pesi 300–900) e
  `public/fonts/Figtree-OFL.txt`; in `public/ui-typography.css` il suo `@font-face` e
  `--obrt-font-ui: "Figtree", "Helvetica Neue", Helvetica, Arial, sans-serif`. Tutte le pagine che usano la variabile
  caricano già quel foglio.
- I cinque avvisi usavano il carattere di sistema (Segoe UI su Windows) per il testo: ora la variabile comune.
- `src/initiativeCardCompact.js`: il nome della compatta si misura in Figtree, come si disegna (L2).
  `src/spellBoardTokenTrackerCore.js`: la linguetta dei compagni usa la variabile invece della pila fissa.
  `src/initiativeToolbar.js`: nella compatta le etichette degli strumenti a −0,04 em («Incantesimi» usciva di 1 px).
- Restano sulla pila di sistema le etichette sulla mappa: le disegna Owlbear Rodeo, che non può caricare il carattere.
- Test: `test/noticeDisplayFont.test.js` (4 test). Banco, due viste, GM e giocatori: Figtree caricato dal plugin,
  etichette degli strumenti intere, avviso con titolo Vollkorn e testo Figtree (immagine `40`). Build con `fonts/`.

**Ritocco del riquadro del movimento (18/11), vista espansa.** Il nome del token si riduceva a «Archdu…». Proposte al
banco (immagine `41`): A nome sopra, B niente nome, C modalità come icona. Scelta dell'utente: A, con la barra del
movimento come ultimo elemento del riquadro.

- `src/initiativeList.js`, blocco del riquadro: il nome su una riga a sé, poi modalità, metri e lucchetto, poi Scatto,
  Bonus e ↺ (solo GM), e la barra in fondo. Testi un passo più piccoli e mai sotto i 10 px: nome 13→12, metri 12→11,
  modalità, riga e passi 11→10; i pulsanti − + ↺ restano com'erano.
- Altezza: 102 px per il GM (prima 82), 68 per i giocatori (prima 47). Il nome lungo si legge intero («Arciduchessa
  Zariel, Signora di Avernus»); taglia solo oltre la larghezza del riquadro.
- Banco, GM e giocatori, nomi corto, lungo e lunghissimo (immagine `42`).

**Seconda versione, layout X (18/11).** Con la prima l'utente ha visto troppo spazio vuoto fra la modalità e i passi, e
bottoni di misure diverse. Proposte X, X2 e Y (immagini `43`, `44`; Y scartata perché taglia le etichette). Scelta X,
con la modalità dei giocatori allineata all'inizio della barra e il padding ridotto:

- prima riga: nome (cede per primo, coi puntini) e metri; seconda: modalità su tutta la larghezza, lucchetto, ↺;
  terza: Scatto e Bonus a metà riga ciascuno; ultima la barra. Tutti i comandi alti 26 px, raggio 8 px.
- Padding del riquadro da 8×10 a 6×8 px, spazi da 6 a 5 px. Per i giocatori (e con una sola modalità) la modalità è
  testo senza bordo né altezza fissa, allineata alla barra.
- Altezza: GM 99 px, giocatori 55 px.
- I gruppi chiusi (18/11, scelta B «mazzo», immagini `46`–`48`): niente più «(Gruppo)» nel nome, che resta intero; il
  numero è una pastiglia «×3» dopo il nome (espansa) o il badge «x3» già esistente (compatta); due bordi sfalsati
  dietro la card, disegnati come ombre (`groupDeckShadow`, `groupDeckRoom` in `initiativeCardCompact.js`); il «×3» sul
  ritratto, che sporgeva di 10 px sulla card sotto, è tolto; la freccia ▸ del gruppo chiuso sta a 24 px come la ▾
  dell'aperto (prima saltava di 22 px). Test `test/groupDeck.test.js` (3 test), frase aggiornata in
  `test/initiativeCardCompact.test.js`; banco nelle due viste, GM e giocatori; 6549 test verdi.
- Animazione di apertura e chiusura dei gruppi (18/11, «completamente fluida»): filmata e misurata fotogramma per
  fotogramma nelle due viste (immagini `49`, `50`). Trovati: uno scatto di 8 px dovuto al mazzo (il palco non contava lo
  spazio sotto la card chiusa), i nomi delle card sovrapposti in trasparenza fra 100 e 300 ms, una partenza lenta.
  Applicati in `__replaceTrackCardsMagnetic` (approvati dall'utente): il palco conta lo spazio del mazzo; A fondo pieno
  sotto le card in movimento, che torna al loro colore alla fine; B cambio di card in due tempi da 90 ms, solo sui
  testi (ritratto, cornice e iniziativa restano fermi); C 380 ms con la curva «ease», la chiusura con i fotogrammi
  rovesciati invece di `direction: "reverse"`, e le animazioni che partono un fotogramma dopo la costruzione del palco
  (il primo fotogramma, 25–35 ms sul banco, diventava uno scatto). Misurato dopo: passo massimo 7–10 px per
  fotogramma, nessuno scatto, il gruppo si muove già nei primi 100 ms. Test `test/groupTransitionSeamless.test.js`
  (5 test); 6557 test verdi; build a posto.
- Arrivo delle card (18/11): le coordinate coincidevano al pixel, ma la pila finiva allineata sotto la prima card e
  poi «scattavano fuori» i bordi del mazzo (e viceversa all'apertura). Ora i membri si posano sui bordi del mazzo e
  ripartono da lì (`__groupDeckStackFrames`: +4/+8 px nell'espansa, +3/+6 nella compatta; il più vicino sopra), e
  spariscono mentre la card del gruppo li ridisegna; la vecchia prima card resta piena finché quella del gruppo non è
  entrata, poi esce in 60 ms (due card semitrasparenti lasciavano vedere i membri sotto). Lo scambio di contenuto
  agisce su blocchi interi (riga del nome, riga e barra dei PF, pulsanti) e lascia fermi ritratto, iniziativa, strati
  della cornice e alone. Immagine `51`: fotogrammi ingranditi del passaggio, due viste. Test aggiornati (10 sulle
  transizioni), suite intera verde, build a posto.
- Il «±» del gruppo chiuso (ricalibra i PF di tutto il gruppo, solo GM): stava da solo su una riga sotto il nome.
  Provato nella riga del nome dopo «×3», tagliava il nome; ora sta sull'anello del ritratto, a sinistra, come i comandi
  rapidi delle card singole (stesso posizionamento ad anello, 20 px). Nome intero, nessuna sovrapposizione con la
  freccia o l'iniziativa, l'editor si apre come prima (immagine `52`). Suite verde (6558), build a posto.
- Test: `test/movementReadoutLayout.test.js` (3 test). Banco (immagine `45`): tutti i comandi a 26 px, modalità dei
  giocatori allo stesso pixel della barra. `npm test`: 6549 test, tutti verdi; build di verifica fuori da `dist/`.

---

## 9. Cosa non ripropongo

BG3 e gli altri casi le fanno, ma qui sono già state decise o sconsigliate:

- **Economia d'azione** (azione, azione bonus, reazione, movimento sulla barra): niente funzioni che fanno segnare
  al GM lo stato del turno. I colori di costo alla BG3 restano dove sono, nelle console.
- **Segno sulla card quando i PF cambiano** (lampo, «−7»): D5 del 31/10, «niente segno». Vale anche per la variante
  della barra che lascia una scia del danno e per i numeri sulla mappa: sono la stessa idea.
- **Card epiche strette:** D9 del 31/10, «non servono».
- **Card spente per chi ha agito e «DOPO» sulla prossima** (L5): provate il 18/11 e tolte, non piacciono.
- **Icone disegnate al posto delle emoji** (game-icons.net, L3): provate il 18/11 e tolte. Restano le emoji; nella
  compatta le condizioni stanno sole, come emoji nel loro quadratino.
- **Ripensare la dimensione dei font o le × sulle etichette:** sconsigliato nell'audit di sistema e già deciso nei
  lotti 3.2 e 4.2 del polishing. Per lo schermo del tavolo la leva è la scala (L1).
- **Spostare Movimento** tra gli strumenti, o riorganizzare la griglia per coerenza concettuale.
- **Chiusura del combattimento** (D4) e **riga di comando** (D8).
- **Apertura automatica del tracker dei giocatori:** è una funzione voluta per il tavolo.
- **Rifare la «pelle» del tracker sui toni di BG3** (bronzo, pergamena, cornici ovunque): l'identità di oggi (vetro
  scuro, colori di fazione pieni, cornici solo per i boss) è riconoscibile e funziona sul televisore. Lo scarto da BG3
  non è di stile ma di disciplina: poche cose in vista, un solo linguaggio di icone.

---

## 10. Decisioni

| # | Decisione | Opzioni | Consiglio |
| --- | --- | --- | --- |
| D1 | Ordine dei lotti | L1 → L2 → L4 → L3 → L5, poi L6 e L7 se li vuoi; oppure un altro ordine | L1 per primo: è un difetto dello schermo del tavolo e non tocca dati né turno |
| D2 | Icone delle condizioni (L3) | (a) game-icons.net con una riga di attribuzione; (b) un set disegnato apposta; (c) restare con le emoji | (a): stile unico e collaudato (le usa Foundry), senza disegnare 18 icone da zero. **Decisa il 18/11:** (a), in entrambe le viste; **cambiata lo stesso giorno, dopo la prova:** (c) le emoji, ma sole nella compatta, col meccanismo di L3 |
| D3 | Chi è a terra, per i giocatori e in generale (L4.2, L4.3) | Il KO o il teschio si vedono anche con i PF nemici «Nascosti»: sì o no. Un non PG a 0 PF è «morto» (teschio) per default: sì, o solo con la condizione Morto | Sì e sì: il tavolo vede cadere la pedina comunque; i mostri a 0 PF di solito muoiono, e per il caso raro resta la condizione. **Decisa il 18/11:** D3a sì; D3b teschio, salvo «Privo di sensi» |
| D4 | Testi brevi nella compatta (L2.4, L2.5) | Nome prima della virgola se il nome intero non ci sta, «A terra» per «Fuori combattimento»: sì o no | Sì |
| D5 | Il round nella lista (L5) | (a) card spente per chi ha agito e «DOPO»; (b) solo «DOPO»; (c) niente | (a). **Decisa il 18/11:** (a), anche ai giocatori; **dopo la prova:** (c), il lotto è stato tolto |
| D6 | Fazioni non solo per colore (L6) | (a) forma del badge per i nemici; (b) opzione con palette sicura; (c) niente | Dipende dal tavolo: (c) se nessuno è daltonico, altrimenti (b). **Scartata il 18/11, per ora:** (c) |
| D7 | Carattere (L7) | (a) Alegreya nei titoli dell'avviso, dopo una prova al banco; (b) anche nei nomi della vista espansa; (c) niente | (a). **Decisa il 18/11:** (a), confermata dopo la prova al banco (`27`, `28`) e applicata |

---

## 11. Prove e strumenti

### Immagini (`docs/ui-audit/studio-bg3/`)

| File | Cosa mostra |
| --- | --- |
| `01-compatta-gm.jpg` | Barra compatta del GM, 2×: turno di Omar, boss epico con tre azioni epiche, compagni. |
| `02-compatta-gm-fine-lista.jpg` | Fine della barra: Brann a 0 PF, alleato, goblin morto con lo stesso «KO» del PG. |
| `03-compatta-giocatore.jpg` | Barra dei giocatori: il goblin morto non ha nessun segno (PF dei nemici nascosti). |
| `04-compatta-giocatore-pf-stato.jpg` | Barra dei giocatori con i PF dei nemici in «Stato». |
| `05-compatta-giocatore-scala-150.jpg` | Giocatori al 150% (schermo 1920×1080): fascia vuota sopra, card tagliate sotto (T1). |
| `06-classica-gm.jpg` | Vista espansa del GM, 2×. |
| `07-classica-gm-fine-lista.jpg` | Fine della vista espansa: leggendario, condizioni, KO, alleato, goblin morto. |
| `08-classica-giocatore-pf-stato.jpg` | Vista espansa dei giocatori con i PF dei nemici in «Stato». |
| `09-classica-giocatore-scala-150.jpg` | Vista espansa dei giocatori al 150%. |
| `10-dettaglio-azione-epica.jpg` | Il cerchio della console Boss sopra il badge «EP» (T6). |
| `11-dettaglio-leggendario.jpg` | «Sc…», tacche leggendarie, condizione tagliata in «+3». |
| `12-cambio-turno-compatta.jpg` | Cambio di turno nella compatta, fotogrammi da 14 a 271 ms. |
| `13-cambio-turno-classica.jpg` | Cambio di turno nell'espansa, fotogrammi fino a 1,7 s (l'alone pulsa). |
| `14-avviso-di-turno.jpg` | Avviso di turno con «A seguire» e il round. |
| `15-classica-gm-100-contro-150.jpg` | Espansa del GM, fondo della lista al 100% e al 150%: al 150% la barra ▲ ▼ non c'è più (T1). |
| `16-prove-disegnate-giocatore.jpg` | Prove disegnate sulla barra dei giocatori: «DOPO», «C», icone delle condizioni, tiri contro la morte. |
| `17-prove-disegnate-gm-fine-lista.jpg` | Prove disegnate sulla fine della barra del GM: tiri contro la morte e nemico morto col teschio. |
| `18-prova-round-a-meta.jpg` | Prova disegnata a metà round (turno di Klos): card spente per chi ha già agito, «DOPO» sul prossimo. |
| `19-l1-compatta-giocatore-150-dopo.jpg` | Dopo L1: barra compatta dei giocatori al 150%, card intere e nessuna fascia vuota. |
| `20-l1-classica-gm-150-fine-lista-dopo.jpg` | Dopo L1: vista espansa del GM al 150% scorsa in fondo, ultime card e barra ▲ ▼ in vista. |
| `21-l2-compatta-gm-dopo.jpg` | Dopo L2: barra compatta del GM con «Auril», «EP» intero, «Azione Epica» intera, «+1» del leggendario, barre nei colori della mappa. |
| `22-l2-leggendario-cassetto-aperto.jpg` | Dopo L2: il «+1» del boss leggendario aperto, «−» per richiudere, «Scudo della fede (4)» nel cassetto. |
| `23-l4-compatta-giocatore.jpg` | Dopo L4: barra dei giocatori, «C» su Lavera, Brann KO con le tacche, goblin morto grigio col teschio (PF nascosti). |
| `24-l4-classica-gm-fine-lista.jpg` | Dopo L4: vista espansa del GM, tacche di Brann al posto della barra, goblin morto col teschio. |
| `25-l3-compatta-gm-emoji-e-cassetto.jpg` | Dopo L3 con le emoji: le quattro condizioni del goblin capobanda nei loro quadratini coi round, e il cassetto aperto dai quadratini, con i nomi. |
| `26-l3-compatta-emoji-da-vicino.jpg` | Le card del goblin capobanda e di Brann (a terra) da vicino, 4×. |
| `27-l7-avviso-georgia-contro-alegreya.jpg` | L7 al banco: l'avviso di turno vero con Georgia (oggi) e con Alegreya, 2×. |
| `28-l7-campione-titoli-avvisi.jpg` | L7: i titoli degli altri avvisi (turno, concentrazione, reazione) e le accentate, Georgia a sinistra e Alegreya a destra. |
| `29-l7-avviso-cinque-caratteri.jpg` | L7: lo stesso avviso di turno con Georgia, Alegreya, DM Serif Display, DM Serif Text e Young Serif. |
| `30-l7-campione-cinque-caratteri.jpg` | L7: titoli di concentrazione e reazione e le accentate negli stessi cinque caratteri. |
| `31`–`33` | Prova di IBM Plex Sans e Plex Mono: compatta, espansa, avviso e dadi. |
| `34`–`36` | Prova di Vollkorn e Fraunces con Alegreya Sans: compatta, espansa, avviso. |
| `37`–`39` | Vollkorn con Figtree, Atkinson Hyperlegible, Fira Sans e Inter: compatta, espansa, avviso. |
| `40-figtree-vollkorn-nel-codice.jpg` | La scelta nel codice: compatta del GM in Figtree e avviso con titolo Vollkorn. |
| `41-movimento-varianti.jpg` | Il riquadro del movimento oggi e le proposte A, B e C, con un nome lungo. |
| `42-movimento-nome-sopra.jpg` | Prima versione nel codice: nome sopra, barra in fondo; GM con nomi corto, lungo e lunghissimo, e giocatori. |
| `43-movimento-proposte-x-y.jpg`, `44-movimento-proposte-x-x2.jpg` | Le proposte X, X2 e Y, tutti i comandi a 26 px. |
| `45-movimento-x-nel-codice.jpg` | Il layout X nel codice: GM, GM col nome lunghissimo, giocatori. |
| `46-gruppo-freccia-oggi.jpg` | Un gruppo di tre prima della modifica: la freccia salta di 22 px fra aperto e chiuso, il ×3 sporge sulla card sotto. |
| `47-gruppo-alternative.jpg` | Le alternative a «(Gruppo)»: B mazzo, C etichetta sul bordo, D mazzo con una barretta PF per membro. |
| `48-gruppo-mazzo-nel-codice.jpg` | La scelta B nel codice: espansa GM aperta e chiusa, giocatori, compatta. |
| `49-gruppo-animazione-fotogrammi.jpg` | Apertura e chiusura dei gruppi prima degli interventi: nomi sovrapposti fra 100 e 300 ms. |
| `50-gruppo-animazione-dopo.jpg` | Dopo gli interventi A, B, C: nelle due viste i testi si scambiano uno alla volta su ritratto e cornice fermi. |
| `52-gruppo-delta-sul-ritratto.jpg` | Il «±» del gruppo chiuso sull'anello del ritratto: nome intero, corto e lungo, e l'editor dei PF del gruppo aperto. |
| `51-gruppo-mazzo-passaggio.jpg` | Fine della chiusura e inizio dell'apertura, ingranditi: le card si posano sui bordi del mazzo e il contenuto si scambia senza residui. |

### Strumenti

Gli script stanno nella scratchpad della sessione (`study/`): `cdp.mjs` (Chrome headless via DevTools, Node 24),
`shots.mjs` (le quattro viste a 1× e 2×), `turn.mjs` + `strip.py` (fotogrammi del cambio di turno), `notice.mjs`
(avviso di turno con `polishBench.js`), `scale.mjs`, `ancestors.mjs` e `classicscale.mjs` (misure di T1),
`metrics.mjs` (testi troncati e corpo minimo), `more.mjs` (fine della lista, PF in «Stato»), `mock.mjs` e
`mock-round.mjs` (prove disegnate), `verify-l1.mjs`, `verify-l2.mjs`, `verify-l4.mjs` e `verify-l3e.mjs` (le prove
dei lotti), `zoom-l3e.mjs` (card da vicino a 4×), `alegreya-compare.mjs`, `verify-l7.mjs` e `fonts-compare.mjs` (il
carattere degli avvisi prima e dopo, e i cinque a confronto), `sheet.py` e `labeled.py` (le immagini composte). La scratchpad può essere svuotata: per rifarle basta il banco 5199 e una copia della scena in
`node_modules/.audit-preview/` (ignorata da git, da cancellare dopo).
