# Piano: tiradadi nella modalità Online

Data: 30/10/2026. Fase 1, solo piano: nessun codice. Segue la decisione D7
dell'audit online ([AUDIT_GIOCO_ONLINE.md](AUDIT_GIOCO_ONLINE.md)): dadi nativi
nel plugin, un lanciatore scritto da noi, senza automazione dei risultati.

## Obiettivo

Togliere i conflitti tra la Dice di Owlbear e Take Initiative: Owlbear tiene
aperta una sola action, quindi aprire una chiude l'altra, e i due pannelli si
sovrappongono. Il plugin offre un suo tiradadi in un popover, che non è una
action e non chiude niente.

## Vincoli

- **Solo in modalità Online.** Con «Tavolo» il pulsante non c'è e niente parte.
- **Nessuna automazione per ora.** I risultati non entrano in PF, iniziativa,
  TS o console: si leggono, il GM decide (D7).
- **Niente codice della Dice.** È GPL-3.0, il plugin è ISC. Si riprende il
  comportamento, non il codice; per il 3D servono librerie con licenza
  permissiva (D9).
- **Niente spazio nella stanza.** I metadata della stanza sono già al tetto di
  sicurezza (14.490 su 14.500 byte): i tiri viaggiano in broadcast (16 KB a
  messaggio) e restano nei browser.
- **Owlbear non indirizza un broadcast a un solo giocatore.** Per questo il
  tiro nascosto del GM non parte proprio: resta nel suo browser.
- **Colori neutri** per i segni dei giocatori: mai rosso, verde, blu o ambra
  delle fazioni.
- Budget del bundle (`npm run perf:bundle`) e schermi piccoli.

## Cosa fa la Dice di Owlbear (comportamento da riprendere)

Vassoio 3D con fisica deterministica: ogni client rifà la stessa simulazione e
ottiene lo stesso risultato. Si scelgono i dadi, si tira, l'ultimo tiro di ogni
giocatore si vede dal suo avatar. Un tiro nascosto condivide il tiro ma non i
valori. L'ultimo tiro sta nei metadata del giocatore
(`rodeo.owlbear.dice/roll`, `rollValues`).

## Il nostro tiradadi

### Vassoio (popover `dice-tray.html`)

- Si apre dal pulsante 🎲 nella testata del tracker, per GM e giocatori, solo
  in modalità Online (D1). In vista compatta sta accanto al ⚙ del giocatore e
  al «…» del GM.
- Pulsanti d4, d6, d8, d10, d12, d20, d100: ogni clic aggiunge un dado.
  Campo per la formula (`2d6+3`, `d20+5`, `4d6kh3`, `d100`), modificatore ±,
  Vantaggio e Svantaggio con un d20.
- **Tiro nascosto solo per il GM** (D4): non parte verso i giocatori e resta
  nel suo storico. I giocatori non hanno tiri segreti.
- **Tira**: i dadi 3D rotolano nel vassoio, poi totale grande e dettaglio
  («d20 14 · 9 scartato · +5 = 19»). Con «riduci movimento» il risultato
  compare subito.
- Sotto, gli ultimi tiri della stanza: giocatore (e personaggio assegnato),
  formula, totale, ora.

### Dadi 3D (D2: lo stesso effetto della Dice)

- **Librerie con licenze permissive**: three.js (MIT) per il disegno e
  cannon-es (MIT) per la fisica. Compatibili con la licenza ISC del plugin.
  Nessun file della Dice: geometrie dei sette dadi costruite da noi (il d10 è un
  trapezoedro pentagonale), numeri disegnati su canvas.
- **Il risultato non dipende dalla fisica.** Il client di chi tira sceglie i
  valori con `crypto.getRandomValues` (D7) e i parametri del lancio (posizione,
  spinta, rotazione). La fisica fa rotolare i dadi; quando si fermano, la faccia
  rivolta in alto riceve il numero scelto. Così ogni client mostra gli stessi
  valori anche se la sua simulazione differisce di poco da quella degli altri,
  senza bisogno di una fisica deterministica tra browser diversi.
- **Peso**: three.js e cannon-es pesano insieme circa 170 KB compressi. Si
  caricano solo nella pagina del vassoio e nel riquadro dei tiri altrui, e solo
  in modalità Online: il tracker, il background e il tavolo non li caricano mai.
  Il disegno si ferma quando i dadi sono fermi.

### Tiri degli altri (D3)

Un piccolo riquadro 3D in basso rigioca il tiro di un altro giocatore, con il
suo nome e il totale, e si chiude da solo dopo qualche secondo. Se arrivano più
tiri insieme, si mostrano in fila.

### Condivisione (D7)

- Un tiro è un broadcast `…/dice/roll` a tutti: id, connessione, giocatore,
  personaggio assegnato, formula, valori, scartati, modificatore, totale, ora e
  parametri del lancio. I valori li genera il client di chi tira.
- Il background di ogni client (solo in Online) raccoglie gli ultimi 50 tiri
  nella sessione del browser e apre il riquadro dei tiri altrui.
- Chi entra o ricarica chiede gli ultimi tiri al GM, con la risposta
  indirizzata alla sua connessione (come per l'avviso di turno, O4b).

### Vincoli confermati dall'utente (30/10)

- Solo modalità Online (D1 e richiesta esplicita).
- Niente tiri nel Combat Log (D5) e niente tiri rapidi dalla scheda (D6), per
  ora.
- Nessuna integrazione con la Dice di Owlbear (D8).

## Lotti

Un lotto per commit, con test, `npm test`, `npm run build`, `npm run perf:bundle`.

| Lotto | Contenuto | Note |
| --- | --- | --- |
| D-1 | Motore puro: formula, casualità crittografica senza distorsione, risultato strutturato, parametri del lancio, testo del dettaglio | Solo logica, tutto testabile |
| D-2 | Dadi 3D: geometrie dei sette dadi, numeri, fisica, assegnazione del valore alla faccia in alto, scena del vassoio | Prova visiva nel banco; misura del peso |
| D-3 | Vassoio: pagina, pulsante 🎲 nel tracker (solo Online), tiro nascosto del GM, storico locale | Pagina nuova nel bundle |
| D-4 | Condivisione: broadcast, raccolta nel background, riquadro 3D dei tiri altrui, recupero per chi rientra | Background di ogni client, solo in Online |
| D-5 | Facoltativo: suoni | Da decidere dopo |

## Decisioni

| # | Decisione | Risposta (30/10) |
| --- | --- | --- |
| D1 | Dove si apre | Pulsante 🎲 nella testata del tracker |
| D2 | Aspetto dei dadi | 3D, lo stesso effetto della Dice |
| D3 | Come vedono gli altri un tiro | Riquadro 3D che rigioca il tiro |
| D4 | Tiri segreti | Solo il GM, tiro nascosto; i giocatori no |
| D5 | Combat Log | No, per ora |
| D6 | Tiri rapidi dalla scheda | No, per ora |
| D7 | Chi genera i valori | Il client di chi tira, broadcast a tutti |
| D8 | Dice di Owlbear | Nessuna integrazione |
| D9 | Librerie 3D | three.js 0.186.1 + cannon-es 0.20.0 |
| D10 | Riuso della Dice (30/10) | Sì: il plugin passa a GPLv3 e usa modelli arrotondati, materiali, vassoio e mappa di luce della Dice |
| D11 | Stili (30/10) | Tutti gli 8; ogni giocatore sceglie il suo, si scarica solo quello |

## Stato (30/10/2026)

| Lotto | Commit | Note |
| --- | --- | --- |
| Licenza | `d8a157e1` | Plugin in GPLv3, three.js e cannon-es come dipendenze |
| D-1 | `2e016492` | `src/diceCore.js` |
| D-2 | `b63689db` | Asset della Dice in `public/dice/` (import con `scripts/import-owlbear-dice-assets.mjs`), `src/diceFaceCore.js`, `src/diceScene.js`, banco in `test-support/dice-bench/` |
| D-3 | `d2b4c5f8` | `dice-tray.html`, `src/dice-tray.js`, `src/diceTrayCore.js`, 🎲 nel tracker solo in Online; correzione dell'animazione bloccata al primo fotogramma in `9b962e0b` |
| D-4 | (questo lotto) | Broadcast `…/dice/roll` agli altri schermi, ultimo tiro in `…/dice/last-roll` nei metadata del giocatore, `src/diceRollHost.js` nel background (solo Online), riquadro `dice-notice.html` in basso a sinistra, al massimo 4 in coda |

Pesi misurati: codice 3D 153 KB (brotli); per tiro al primo uso modelli usati
(~15 KB l'uno), vassoio 540 KB, uno stile 330–940 KB, mappa di luce 1,6 MB.
Il bundle di produzione dovrà includere `dist/dice/` (con `git add -f`).
L'ultimo tiro di ogni giocatore sta nei metadata di quel giocatore (idea della
Dice): chi entra o ricarica lo trova nello storico, senza riquadro.
