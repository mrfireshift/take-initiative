# Audit UX e UI dei popup viola

Audit del 05/11/2026, chiesto dall'utente perché font, colori, pesi, gerarchia e dimensioni di questi popup sembravano rimasti indietro rispetto al resto del plugin. L'audit in sé era solo lettura: i lotti fatti dopo hanno ciascuno la sua sezione più sotto. Il metro è quello già deciso: `public/ui-typography.css`, `public/popover-glass.css`, `public/console-shell.css`, `public/console-panel.css` e le decisioni di `docs/AUDIT_UX_PANNELLO_ATTACCHI.md`.

Schermate e proposte disegnate, una accanto all'altra: https://claude.ai/artifact/QENFMdDi2KnatrRGG6Smuq

Stato: D1-D7 decise dall'utente il 05/11/2026 (D1 e D6 diverse dal consiglio). Da V1 a V11 fatti: i lotti sono finiti. F1 è corretto dopo uno studio, con le decisioni D1-D4 dell'utente.

## In breve

L'impressione è giusta: questi popup sono una generazione indietro. Il numero di stili di testo non è il problema, 9-12 contro i 12-14 delle console. Il problema è quali stili: nessun testo a 12 px, quasi tutto a 10-11 px e in grassetto, un altro font, un altro colore per ogni cosa, controlli più piccoli dello standard, fino a sette righe di testata prima del primo campo.

La causa è una sola: non hanno mai adottato i fogli comuni. `spell-popover.css` è un sistema parallelo, e `spell-active-resolution.html` ne ripete 190 righe in linea con numeri diversi. Ogni rifinitura delle console si è fermata prima di arrivare qui.

| Popup | Pagina | Da dove si apre | Distanza dallo standard |
| --- | --- | --- | --- |
| Attivazione | `spell-active-resolution.html` | ⚡ del pannello, punizioni al token: 42 azioni e 11 preparati | Grande |
| Scelta del turno | `spell-turn-action-choice.html` | Inizio turno: Mano arcana, Sguardo, Telecinesi e altri | Grande |
| Detonazione | `delayed-blast-fireball-resolution.html` | Palla di fuoco ritardata | Grande |
| Controincantesimo | `counterspell.html` | 🪄, pannello, console | Grande |
| Impulso di Magia Selvaggia | `wild-magic-surge.html` | Scheda, console | Piccola: è già sul guscio comune |
| Risolvi incantesimo | `prepared-spell-resolution.html` | Nessun punto: pagina morta, vedi D7. Tolta con V11 | Non conta |

## Misure

Al banco, nei loro stati reali, con il vero servizio di sfondo. Il popup è identico in vista espansa e compatta: cambia solo dove si ancora, l'ho controllato sulla punizione. Non ho portato al banco le sottozone (Controllare l'acqua, Terremoto) e il ritorno di Intermittenza: usano gli stessi componenti, si rivedono col lotto.

Testi in grassetto: la quota di testi con peso 600 o più.

| Stato | Font | Stili | Corpi (px) | Pesi | In grassetto | Altezza controlli |
| --- | --- | --- | --- | --- | --- | --- |
| Punizione con bersaglio | Georgia, system-ui | 9 | 10, 10.5, 11, 17 | 400-800 | 92% | 24, 26, 28 |
| Area con 4 creature | Georgia, system-ui | 10 | 10, 10.5, 11, 17 | 400-800 | 76% | 26, 28 |
| Attacco (Corona di Stelle) | Georgia, system-ui | 9 | 10, 10.5, 11, 17 | 400-800 | 92% | 26, 28 |
| TS singolo (Dardo Stregato) | Georgia, system-ui | 9 | 10, 10.5, 11, 17 | 400-800 | 90% | 26, 28 |
| Cura (Aura di Vitalità) | Georgia, system-ui | 11 | 10, 10.5, 11, 17 | 400-800 | 91% | 26, 28 |
| Muro prismatico, 7 strati | Georgia, system-ui | 12 | 10, 10.5, 11, 17 | 400-800 | 64% | 26, 28 |
| Scelta: Mano arcana | Georgia, system-ui | 5 | 10, 11, 12, 17 | 400-900 | 92% | 28, 62 |
| Scelta: Sguardo | Georgia, system-ui | 6 | 10, 10.5, 11, 12, 17 | 700-900 | 100% | 26, 28, 62 |
| Detonazione | Georgia, system-ui | 8 | 10, 10.5, 11, 17 | 400-800 | 81% | 26, 28 |
| Controincantesimo | Georgia, system-ui | 12 | 10, 10.5, 11, 11.5, 12, 17 | 400-800 | 78% | 28, 32 |
| Impulso | Helvetica, Georgia | 14 | 10, 11, 12, 14, 30 | 400-800 | 47% | 27, 28, 30, 36, 38 |
| **Console attacchi** (Morso) | Helvetica | 12 | 10, 11, 12, 14 | 400-700 | 44% | 24, 32, 36 |
| **Console Boss** (Soffio) | Helvetica | 14 | 10, 11, 12, 14, 16 | 400-700 | 41% | 22, 24, 36 |

Lo stesso elemento, nei due mondi:

| | Console | Popup viola |
| --- | --- | --- |
| Font | `--obrt-font-ui` (su Windows Arial) | `system-ui` (su Windows Segoe UI), titolo in Georgia |
| Titolo | 14 bold | 17 extrabold, Georgia, riservata dal foglio agli avvisi di turno |
| Testo normale | 12 regular | Non esiste: 10, 10.5 o 11 |
| Testo secondario | 11, bianco al 66% | 11, cinque grigi ardesia diversi (55, 74, 78, 80, 82%) |
| Controllo | 32 px, raggio 8, testo 12 | 26 px, raggio 5, testo 10.5 bold |
| Campo del danno | 64×24, 12 bold | 64×26, 10.5 bold |
| Esito | Fila da 32 px, 12 semibold: rosso, verde, blu | 24-26 px, 10-10.5 px semibold o bold: sempre viola |
| Pulsante principale | 36 px, largo almeno 96, 12 bold: rosso se registra danni, blu se no | 28 px, largo almeno 88, 10.5 bold: gradiente viola, bordo lilla, ombra |
| Pulsante spento | Grigio | Lo stesso viola al 45% |
| Guscio | Raggio 16, bordo bianco al 16%, vetro 0.62, sfocatura 18 | Raggio 8, bordo lilla al 72%, velo 0.29-0.42, sfocatura 6, alone viola |
| Testata | 40 px, fondo e linea, maniglia a sei punti | Nessuna: è trascinabile, ma nulla lo dice |
| Riga fissa | Sì: totale, difese, pulsante | No: il pulsante scorre col contenuto |
| Messaggi | Barra in fondo, con icona per riuscito, avviso, errore | Riga in mezzo al contenuto, che sposta tutto |

## Problemi

### La tela nera, un difetto nascosto

Attivazione, Scelta, Detonazione e Controincantesimo dichiarano `color-scheme: dark` sulla radice (`public/spell-popover.css:2`, `spell-active-resolution.html:10`, `counterspell.html:10`). Se la pagina dentro un iframe dichiara un tema diverso da quello dell'iframe, il browser le dipinge dietro una tela opaca: nera in questo caso. Al banco si vede il rettangolo nero attorno agli angoli arrotondati; togliendo la differenza sparisce e il popup diventa davvero trasparente.

Nella stanza vera dovrebbe succedere lo stesso. Le console non dichiarano nulla e lì il vetro si vede: quindi OBR non mette il tema scuro sui suoi iframe, e chi lo dichiara prende la tela. È una deduzione: la conferma è uno sguardo agli angoli di un popup viola nella stanza.

Tre conseguenze:

- Tutta la ricetta di vetro di questi popup non si vede: lavora sul nero.
- Controincantesimo ha la finestra fissa a 500 px e non chiede mai altezza: circa 120 px di rettangolo nero sotto il popup, finché il verdetto non lo riempie in parte.
- La trappola per il lotto: togliere la dichiarazione senza cambiare il guscio renderebbe i popup illeggibili. Il loro velo copre il 29-42%: su una mappa chiara, nella parte bassa del popup, il testo normale farebbe 3,2:1 e il testo secondario 2,2:1, contro 5,9:1 e 3,6:1 del vetro delle console. Le due cose vanno cambiate insieme.

Hanno la stessa dichiarazione anche `faction-configurator.html:10` e `public/aoe-settings.css:2`: non sono viola e non li ho guardati.

### Font e pesi

- Dal 64 al 100% dei testi è in grassetto, contro il 41-44% delle console: se tutto pesa, niente spicca.
- Corpi fuori scala: 10.5 ovunque, 11.5 in Controincantesimo. La scala dice 10, 11, 12, 14, 16, 20.
- `font-weight: 900` non scritto da nessuno: nelle carte della Scelta il `strong` eredita 700 dal pulsante e `bolder` lo porta a 900.
- Le carte della Scelta hanno anche il dettaglio a 10 bold, per lo stesso motivo.
- Georgia è usata per titoli di lavoro e, in Impulso, per il d100.

### Colori

- Il viola è il colore della Reazione nelle console. Qui è il colore di tutto: fondo, bordi, pill, selezione, pulsante, titoli di sezione. Così la Reazione di Controincantesimo non si distingue da nulla.
- L'esito scelto è sempre viola: `Fallito` e `Superato` non si distinguono da lontano. Nelle console fallito e colpito sono rossi, superato e mancato verdi.
- Il costo è una pill viola uguale alle altre: `AZIONE`, `AZIONE BONUS`. Nelle console è il tag verde, arancione o viola con la sua forma.
- Le tinte di testo sono tante anche nelle console, ma lì hanno un significato: avviso, costo, esito. Qui sono otto, quasi tutte grigi e lilla a un passo l'uno dall'altro.
- Detonazione colora i messaggi di rosa anche quando non sono errori. Attivazione fa il contrario: `Risoluzione non riuscita` è grigio come tutto il resto, perché `setStatus` non segna mai `data-error`.

### Gerarchia

- La testata si accumula: occhiello, titolo, sottotitolo, pill, lanciatore, bersaglio, titolo di sezione. Aura di Vitalità usa sette righe di testo per un solo campo.
- Le stesse parole più volte. Nell'Aura `Bersaglio: Mira` due volte, `Cura 2d6` tre. Nell'attacco `Bersaglio: (1) Goblin` e subito sotto il menu con lo stesso nome. In Telecinesi tre frasi di fila dicono di scegliere una creatura.
- Il sottotitolo è il testo del pulsante (`activeActionTitle`, `src/spell-active-resolution.js:2139`): `Ripeti Dardo stregato` in alto e in basso, `Nuova linea` idem.
- `Dars` da solo, in una riga, senza dire che cosa sia. Nella Scelta il lanciatore non c'è proprio: con due incantatori non si sa di chi è la Mano arcana.
- Pill senza riferimento, quello che il pannello attacchi ha già tolto: `TERMINALE`, `36 M`, `½ SUCCESSO`.
- Nell'area, tre pulsanti `Superato Fallito Immune` sopra l'elenco sono identici a quelli delle righe. L'etichetta `Imposta tutti:` esiste, ma è nascosta.
- Controincantesimo inverte l'ordine di tutti gli altri: l'incantesimo sta nell'occhiello, il titolo è il lanciatore.

### Dimensioni

- Controlli da 24-26 px con testo da 10 px per un'azione che il GM fa decine di volte a sera. Al tavolo, su uno schermo a distanza, è il contrario di ciò che serve.
- Pulsante principale da 28 px, alto come la ×.
- Muro prismatico: 21 pulsanti bianchi in grassetto, tutti uguali, più 5 campi.
- La finestra cambia altezza mentre si lavora. Bagliore solare passa da 183 a 439 px, la punizione da 215 a 190 appena c'è il bersaglio: il pulsante si sposta sotto il mouse. Nel pannello attacchi hai già scelto l'opposto.
- Impulso ha la finestra fissa a 600 px e circa 180 px vuoti in mezzo, con `Applica` lontano dal resto.

### Flusso

- Attacco: `Colpito` è spento finché non scrivi il danno, che sta sotto, e non dice perché. Poi l'esito registra subito, senza pulsante, e il popup si chiude; `Mancato` lo stesso. Nella console prima l'esito, poi il danno, poi Registra. Lo fa già una sola azione su 7, Pugno serrato (`consoleFlow`).
- Il campo del danno dice `Totale`, la console mette lì la formula (`2d6`).
- Senza bersaglio due righe dicono la stessa cosa: `Nessun bersaglio selezionato` e `Seleziona un bersaglio prima di continuare.`
- Parole diverse per la stessa cosa: `Posiziona sagoma` e `Posiziona il fulmine` qui, `Posiziona area` nel pannello, `Ridisegna` nella console; `½ SUCCESSO`, `METÀ SU SUPERAMENTO`, `metà danni su successo`; `Risolvi`, `Registra`, `Applica`.
- L'ordine degli esiti cambia: `Superato Fallito Immune` qui e nel pannello, `Fallito Superato` in Detonazione e nelle console. Vedi D3.
- Una rotazione continua (`swirl`, 9 s) gira per sempre nella scheda del d100, con il popup aperto: costa senza dire nulla.

### Che cosa va già bene

- Impulso è sul guscio comune: Helvetica, vetro, testata, riga fissa.
- La × è a norma ovunque.
- La casella del verdetto di Controincantesimo è una buona idea: resta, senza sigillo.
- I chip delle difese ci sono e funzionano, vanno solo spostati nella riga fissa.

## Elemento per elemento

| Elemento | Dove | Verdetto |
| --- | --- | --- |
| Occhiello (`AURA ATTIVA`, `Comando GM`, `Incantesimo attivo`) | Attivazione, Controincantesimo | Via |
| Titolo Georgia 17 | Tutti | Helvetica 14 bold, in una testata vera con maniglia |
| Sottotitolo dell'azione | Attivazione | Via se il pulsante lo dice già; al suo posto il lanciatore |
| Riga `Dars` | Attivazione | Sottotitolo della testata; aggiunto nella Scelta |
| Pill del costo | Attivazione, Controincantesimo | Tag della console a destra in testata; `Comando GM` nessun tag |
| Micropill di formula, tipo, TS, gittata | Attivazione, Detonazione | Una riga di fatti, sopra il danno, come in `#pc-attack-facts` |
| Riga `Bersaglio:` e menu | Attivazione | Una sola riga etichetta + valore, con i PF a destra |
| Titoli di sezione lilla | Attivazione, Controincantesimo | Via, o etichette della colonna da 58 px |
| Tre pulsanti `Imposta tutti` | Area | `Tutti superati` e `Tutti falliti`, testo blu accanto a `Creature colpite` |
| Righe delle creature con tre pulsanti | Area, Detonazione, Muro | Nome, PF, fila compatta dentro un riquadro |
| Carte da 62 px | Scelta | Righe di elenco, vedi D5 |
| Sigillo ✦ con alone | Controincantesimo | Via |
| Esagono del d100 | Impulso | Resta, vedi D6 |
| Gradienti di testata e pulsante | Impulso | Via |
| Rotazione continua | Impulso | Via |

## Difetti trovati lungo la strada

Non sono questioni di aspetto. Sono tutti chiusi.

- **F1. Le punizioni ignorano le difese.** Punizione Tonante da 9 su un goblin resistente al tuono: 7 PF → 0, invece di 3. Punizione Incandescente da 6 su uno resistente al fuoco: 7 → 1, invece di 4. Nessun chip. Provate due su due. Le altre punizioni passano dalla stessa strada: `applyPreparedResolution` non guarda le difese e nessuna sta in `SPELL_DAMAGE_TYPES`. Lo studio dirà se vale anche per Colpo Intrappolante, Raffica di Spine e Freccia Folgorante. Tocca i PF: va prima studiato. Corretto dopo lo studio: il capitolo `Fatto: F1` dice come.
- **F2. Detonazione precompila il danno con il numero dei dadi.** A 12d6 il campo dice `Danno 12` (`src/delayed-blast-fireball-resolution.js:137`): scelti gli esiti `Detona` è acceso, e registra 12 invece del tiro. Provato al banco. Corretto con V8.
- **F3. Detonazione dimezza senza dirlo.** Mira resistente al fuoco: 12 diventa 6, giusto, ma nessun chip lo dice. Hai chiesto che sia chiaro. Corretto con V8: il chip c'è, e un clic ignora la difesa.
- **F4. Pagina morta.** `prepared-spell-resolution.html` si aprirebbe solo per un'azione che non è né `resolve` né `manual`, ma quel caso esclude il gruppo prima (`preparedSpellResolutionGroups`). Censimento su tutto il catalogo: 9 `resolve`, 2 `manual`, gli altri nessuna azione. Tolta con V11.
- **F5. `dalla mano` dove non c'è nessuna mano.** La gittata misurata dalla zona si scrive sempre `N m dalla mano` (`renderActiveMicropills`), scritta pensata per Mano arcana: Muro di Luce dice `18 m dalla mano`, Controllare acqua `30 m dalla mano`. C'era già prima dei lotti. Corretto con V5: una parola per incantesimo (`rangeOriginLabel`).
- **F6. Un errore detto con il codice.** Una fessura di Terremoto che non attraversa il bordo della zona si ferma con `Risoluzione non riuscita: Invalid active spell resolution: child-placement-outside-parent`. La regola è giusta, la frase no: il GM non sa che cosa cambiare. C'era già prima dei lotti. Corretto con V6: `La fessura deve andare da un bordo all'altro della zona: riposizionala.`
- **F7. Popup che non si trascinano.** Segnalato da te su Controincantesimo. C'era già prima dei lotti. Corretto: il capitolo `Fatto: il trascinamento` dice dove e come.
- **F8. `Applica` due volte scrive due volte.** Il popup di Impulso resta aperto dopo `Applica`: al banco un secondo clic su 41-42 dà due «Pianta in vaso» e due Incapacitato, e `Invio` fa lo stesso. Provato su quella riga; il percorso è lo stesso per ogni esito, cura compresa. C'era già prima dei lotti. Corretto con V9: `Applica` si spegne finché non arriva un nuovo d100, e la riga fissa lo dice.
- **F9. Un attacco rifiutato non lo diceva.** Se la registrazione falliva, per esempio con il bersaglio finito fuori gittata, il messaggio rosso spariva dopo meno di 80 ms: lo cancellava il disegno dell'attacco. Il popup restava aperto senza dire perché. C'era già prima dei lotti. Corretto con V10.
- **F10. Lama del Disastro perdeva le cifre.** Ogni tasto ridisegnava i riquadri e il cursore spariva: scrivendo `18` restava `1`. Con 4d12 quasi ogni danno ha due cifre. C'era già prima dei lotti, e nelle prove di V4 non l'avevo visto perché al banco scrivevo il numero tutto insieme. Corretto con V10 e provato con tasti veri, una cifra alla volta.

## Lotti

In quest'ordine, ognuno provato al banco nei suoi stati e in entrambe le viste. Dopo V2, che è il salto visivo, mi fermo per la tua prova: nel pannello attacchi le schermate non avevano colto la sensazione di compressione.

| Lotto | Che cosa | Dove | Rischio |
| --- | --- | --- | --- |
| V1 | **Guscio e scala.** Le quattro pagine caricano i fogli comuni, vetro al posto del velo e via la tela nera insieme, font, corpi, pesi, controlli 32 e 24, pulsante 36. Via le copie in linea. | `public/spell-popover.css`, le 4 pagine | Basso; classi omonime da controllare: `.hint` nelle console è un avviso |
| V2 | **Esiti e pulsante.** Rosso, verde, blu come le console; pulsante rosso se registra danni, blu se no; spento grigio. | `src/spell-active-resolution.js`, `src/delayed-blast-fireball-resolution.js`, pagine | Basso |
| V3 | **Testata e fatti.** Via occhiello e pill, una riga di fatti, tag di costo, niente parole doppie. | `renderActiveMicropills`, `render`, `renderTargetLine`; test in `test/spellActiveResolutionUi.test.js` | Medio |
| V4 | **Riga fissa e messaggi.** Totale, chip e pulsante sempre lì; barra di stato con i tre tipi; errori in rosso. Altezza secondo D2. | `setStatus`, `requestCompactPopoverResize`, `renderDamageDefenseChips` | Medio |
| V5 | **Creature e area.** Righe compatte, `Tutti superati` e `Tutti falliti`, stesse parole del pannello. | `renderSave`, `renderPrismaticWall` | Medio |
| V6 | **Scelta del turno.** Elenco o carte secondo D5, lanciatore in testata. | `spell-turn-action-choice.html`, `.js`; `test/eyebiteWorkflow.test.js` | Basso |
| V7 | **Controincantesimo.** Etichette a sinistra, senza sigillo, riga fissa, altezza. | `counterspell.html`, `src/counterspell.js` | Basso |
| V8 | **Detonazione.** Stesse righe di V5, via le pill scritte nell'HTML, F2, F3. | `delayed-blast-fireball-resolution.*` | Basso |
| V9 | **Impulso.** Testata e pulsante comuni, senza rotazione né spazio vuoto, secondo D6. | `wild-magic-surge.html` | Basso |
| V10 | **Attacco come la console**, se D4 dice sì. | Attacchi `single-attack` in `src/spellActiveResolutionRules.js`, `src/spell-active-resolution.js` | Medio: cambia il flusso |
| V11 | **Pagina morta**, se D7 dice sì. | `prepared-spell-resolution.html`, `.js`, ramo del controller | Basso |

F1 resta fuori dai lotti: studio breve e patch a parte, perché tocca i PF. F2 è una riga e può precedere tutto. `console-panel.css` è appena cambiato col lotto 7 delle console e passa da due pagine a sei: prima di V1 lo rileggo e controllo che nessun'altra sessione ci stia lavorando.

## Decisioni

Decise dall'utente il 05/11/2026:

- **D1:** il vetro delle console, tinto di viola. Stessa trasparenza, sfocatura, bordo e raggio: `--obrt-popover-glass: rgba(60, 40, 104, .62)`.
- **D2, D3, D4, D5, D7:** come il consiglio.
- **D6:** il vetro di Impulso è fucsia: `rgba(112, 30, 110, .62)`. Esagono e scheda del d100 restano.

Che cosa era sul tavolo:

- **D1. Il viola.** Consiglio di toglierlo: vetro neutro come le console. Il viola ha già un significato, la Reazione, e rosso e blu devono potersi leggere. In alternativa un filo viola sul bordo alto, per riconoscere un popup di incantesimo a colpo d'occhio: è disegnato nell'artifact. Tenerlo come fondo si può, ma resterebbe il problema dei colori. Restano fuori in ogni caso i dettagli viola che non sono superfici: il menu 🪄 e i pallini del Patto sulla scheda.
- **D2. L'altezza.** Consiglio: fissa per tipo di popup, come hai scelto per il pannello, con l'elenco che scorre: attacco, TS, cura, area, scelta hanno ognuno la loro e non si muove mentre lavori. A differenza della console restano più basse possibile, perché stanno sopra la mappa dove scegli il bersaglio. L'alternativa è seguire il contenuto come oggi, con i soli messaggi spostati nella barra.
- **D3. L'ordine degli esiti.** Consiglio `Superato Fallito Immune` come il pannello, dove il GM li usa di più: cambia solo Detonazione. L'alternativa è `Fallito Superato Immune` come le console, che cambia anche pannello e Attivazione.
- **D4. L'attacco.** Consiglio il flusso della console in tutti gli attacchi: esito, danno, pulsante. Un clic in più, ma niente registrazioni involontarie e un solo modo di fare la stessa cosa. L'alternativa è tenere il clic secco, accendendo però `Colpito` da subito.
- **D5. La Scelta del turno.** Consiglio un elenco a una colonna, nome a sinistra e dettaglio a destra, con il passo degli elenchi: dati accanto al nome, come preferisci. L'alternativa è tenere le carte a due colonne con i pesi corretti.
- **D6. Impulso.** Consiglio di tenere esagono e scheda viola del d100, unica eccezione tra i popup: è un momento di colore, e l'esito si legge lo stesso. Via il resto del gradiente, la rotazione e Georgia.
- **D7. La pagina morta.** Consiglio di toglierla: 175 righe di HTML con un quinto stile, più il suo script e un ramo del controller che nessuno raggiunge.

## Fatto: V1 e V2

- **V1.** Le quattro pagine caricano `popover-glass.css`, `console-shell.css` e `console-panel.css`; `spell-popover.css` tiene solo ciò che è loro. Via la tela nera e via le 190 righe in linea. Testata con maniglia, pannello e riga in fondo; font, corpi e pesi delle console; controlli 24, 32 e 36 px.
- **V2.** Gli esiti sono `.segmented` con `aria-pressed` e `data-outcome`: rosso, verde e blu. Pulsante rosso se registra danni (`applyRegistersDamage`), blu se no, grigio se spento. `Superato Fallito` anche in Detonazione. Chip delle difese della console.
- **Portati avanti perché bastava poco:** `Tutti superati`, `Tutti falliti` e `Tutti immuni` e le file compatte delle creature (V5); vetro fucsia, testata senza gradiente, `Applica` blu, niente rotazione né Georgia in Impulso (V9).
- **Contrasto del vetro viola,** calcolato su una mappa chiara: bianco 5,8:1 e secondario 3,6:1, contro 5,9:1 e 3,6:1 delle console. Fucsia: 5,3:1 e 3,3:1.
- **Provato al banco:** punizione, area con quattro creature, attacco, TS con difesa, cura, Telecinesi, Muro prismatico, Mano arcana, Sguardo, Detonazione, Controincantesimo, Impulso; la punizione anche in vista compatta e su mappa chiara; punizione, attacco, cura e area fino all'applicazione. Tutti i passi della CI verdi in un worktree pulito, 5634 test, prima di un ultimo ritocco solo CSS: via l'ombra negli angoli. Non ripassati al banco: sottozone e ritorno di Intermittenza.

## Fatto: V3

Solo il popup di attivazione: Scelta, Detonazione e Controincantesimo hanno i loro lotti.

- **Testata.** Titolo, poi chi lancia nel sottotitolo (`renderHeadingSubtitle`): il nome dell'azione lo segue solo se il pulsante non lo dice già. Il costo a destra con il tag delle console (`renderEconomy`), niente tag per un comando del GM e per un incantesimo preparato. Via l'occhiello e la riga col solo nome.
- **Fatti.** `renderActiveMicropills` scrive una riga sola (`data-facts`): sopra il danno, nel suo riquadro, o in cima al pannello se la sezione non ha riquadro, come le aree. Niente dadi dove c'è la riga del danno; `TS Forza CD 15`, `gittata 36 m`, `Prono se fallisce`, `metà se supera`.
- **CD.** Oggi non compariva mai: `payload.spellSaveDC` non viene scritto da nessuno. Ora `actionSaveDC` legge l'azione, il lancio (`castContext.spellSaveDC`) e la scheda del lanciatore.
- **Bersaglio.** Una riga sola: il menu con i PF nelle voci quando c'è (`targetOptionLabel`), altrimenti la creatura con i PF a destra (`renderTargetLine`), o `Seleziona il bersaglio sulla mappa`. Via `Bersaglio: Mira` doppio, i titoli di Telecinesi e Muro prismatico e il messaggio che ripeteva il bersaglio mancante. La punizione non cambia più altezza quando arriva il bersaglio.
- **Righe del danno.** Il tipo, poi i dadi, come nelle console (`renderAmountLabel`): `Tuono 2d6`, `Cura 2d6`, `Forza 4d12`.
- **Costi.** Le regole di `.cost-tag` passano da `pc-attack.html` a `console-panel.css`, dove le leggono anche i popup.
- **Provato al banco:** punizione anche in vista compatta, con e senza bersaglio, area, attacco, più attacchi (Lama del Disastro), TS con difesa, TS al tavolo (Riscaldare il metallo), cura, Telecinesi, Muro prismatico nei due comandi; punizione, attacco, cura e Dardo Stregato fino all'applicazione. Non ripassati: sottozone e ritorno di Intermittenza.

## Fatto: V4

- **Altezza fissa, D2.** `spellActiveResolutionPopoverHeight`, in `src/spellActiveResolutionCore.js`, dà l'altezza dal tipo di azione: la leggono chi apre il popup e il popup stesso, che non misura più il contenuto. Via `ResizeObserver` e `scrollHeight`. Se il contenuto non entra, scorrono il pannello o l'elenco, mai la finestra.

  | Popup | Altezza in px |
  | --- | --- |
  | Punizione | 300; 344 con le varianti, come Esiliante |
  | Attacco | 310; 354 con il menu di Muro di Luce |
  | Più attacchi | 480 |
  | Tiro salvezza | 330; 270 con l'esito al tavolo; 44 in più con il menu della prova, come Turbine |
  | Cura | 230 |
  | Telecinesi | 300 |
  | Ritorno di Intermittenza | 190 |
  | Sottozone | 500 |
  | Area | 450 |
  | Muro prismatico | 580 per attraversarlo, 380 per gli strati |
  | Scelta del turno | da 160 a 250, data da chi la apre; Mano arcana 301 per le sue cinque voci |
  | Detonazione | 340 |
  | Controincantesimo | 500, come prima |
  | Impulso | 600, come prima |

- **Riga fissa.** Sta sempre in fondo: il pulsante a destra e, a sinistra, che cosa manca o il totale (`renderSummary`), con sotto i chip delle difese. La punizione passa da `Manca il bersaglio.` a `Seleziona l'esito del TS.`, `Manca il danno.`, `Danni 9`; l'area da `Manca l'area.` a `Manca l'esito di 4 creature.`. Il chip dice il nome della creatura solo se sono più d'una. Quando compare un chip la riga cresce di 9 px verso l'alto, come nelle console: la finestra non si muove.
- **Messaggi.** Una barra in fondo, che compare solo quando c'è qualcosa da dire (`setStatus(message, stale, kind)`): errore rosso con ✕, avviso giallo con !, conferma verde con ✓. Prima stavano in mezzo al contenuto e un errore aveva il colore di un'informazione.
- **Niente che lampeggia.** `render` non rimette più `Caricamento bersagli…` e non spegne il pulsante a ogni tasto, mentre aspetta di leggere la scena.
- **Attacco.** Fino a V10 registra col clic sull'esito e non ha pulsante: la riga dice `Scrivi il danno, poi scegli l'esito.` e, col danno scritto, `L'esito registra subito.`.
- **Ritocco di V3.** `Porzione da consumare` di Muro di Luce aveva l'etichetta vecchia, e nella forma nuova andava su tre righe: ora è `Consuma`, con `Parte iniziale` e `Parte finale`.
- **Scelta, Detonazione e Controincantesimo.** Da qui prendono solo l'altezza fissa: hanno i loro lotti, V6, V7 e V8. Detonazione e Controincantesimo tengono il messaggio nella riga fissa. Detonazione si apre ancora a 240 e sale a 340 una volta sola, appena caricata: il numero sta in `src/spell-unified-panel.js`, che è nel lotto P4, e lo allineo con V8.
- **Provato al banco:** punizione anche in vista compatta e con varianti, area con un messaggio vero, attacco, attacco con il menu di Muro di Luce, più attacchi, TS con difesa, TS al tavolo, cura, Telecinesi, Muro prismatico nei due comandi, sottozona di Controllare acqua, Mano arcana, Sguardo e Telecinesi nella Scelta, Detonazione, Controincantesimo, Impulso. In tutti la finestra ha la sua altezza e niente è tagliato. Fino all'applicazione: punizione, attacco, cura, Dardo Stregato con resistenza (`Danni 3`, 7 → 4) e area. Ritorno di Intermittenza e prova di Turbine solo aperti con dati costruiti a mano, per l'impaginazione: con il banco non si arriva a quello stato.

## Fatto: V5

- **Righe delle creature.** Nome, PF e fila degli esiti, nell'area e nelle fessure di Terremoto (`renderSave`). I PF sono i soli numeri, `45/45`: in un elenco `PF` ripetuto è rumore. Il nome lungo si taglia e si legge per intero nel suggerimento.
- **Danno prima dell'elenco.** L'ordine ora è fatti, area, danno, `Creature colpite`, elenco, come nella console Boss. Con molte creature scorre solo l'elenco.
- **Le parole del pannello.** `Posiziona area`, `Conferma sagoma`, `Area confermata`, `Riposiziona area`. La proposta disegnata diceva `Linea disegnata` e `Ridisegna`, le parole della console Boss; ho seguito il lotto, che chiede quelle del pannello. Fulmine, Linea di fuoco ed esplosione tengono il loro nome: `Fulmine confermato: 1 creatura colpita.`.
- **Il passo dell'area.** A sinistra `Le creature colpite compariranno qui.`, poi `Area confermata: 4 creature colpite.`; a destra il pulsante. Via `Sagoma confermata. I bersagli sono ora bloccati.`: lo dice già la riga. Mentre si disegna restano solo `Conferma sagoma` e `Annulla`, e la barra dice che cosa fare.
- **Muro prismatico, attraversamento.** Una riga per strato in un riquadro: nome, tipo e dadi, esito, danno. Via i 21 pulsanti in quattro righe per strato, la frase ripetuta cinque volte e `crossing`. I fatti in cima: `TS Destrezza CD 15 per ogni strato · metà se supera`. Il chip della difesa sta sotto la sua riga. Se la creatura è designata al lancio gli strati spariscono, perché non servono. Con `Immune` il campo del danno si spegne. La finestra passa da 580 a 520.
- **La riga fissa del Muro.** `Manca la creatura.`, `Manca l'esito di 7 strati.`, `Manca il danno di 4 strati.`, `Danni 57`. Il totale nasce da `prismaticWallTraversalPlan` e `spellDamagePartAfterDefense`, le stesse funzioni che registrano il danno. Da V4 il riassunto del Muro non si vedeva più: l'ho trovato qui.
- **Muro prismatico, strati.** `Esposto: Rosso`, che cosa lo distrugge e che cosa fa. Via `Requisito RAW`, `Distruzione manuale` e `Nessuna proprietà passiva aggiuntiva nel testo RAW locale.`. Nomi italiani: Passapareti, Luce diurna, Dissolvi magie. La finestra passa da 380 a 300.
- **Sottozone.** Prima quante, poi dove. `TS Destrezza` invece di `TS` da solo. `Tutti superati` compare solo se ci sono creature. `Profondità 1` con `d10` nel campo vuoto: prima l'etichetta era tagliata. La riga fissa dice `Manca la posizione.`, `Manca l'esito…` e `La profondità va da 1 a 10.`. `Riposiziona vortice`, non più `Riposiziona ultima vortice`. Il vortice non conta più le creature, perché non le risolve.
- **F5.** `18 m dal muro`, `30 m dalla zona`, `1,5 m dalla lama`, `1,5 m dalla spada`, `1,5 m dall'arma`, `18 m dalla sfera`; `dalla mano` resta solo su Mano arcana e Stretta della Terra.
- **Provato al banco:** area in tutti i suoi stati e fino all'applicazione, con molte creature; Muro nei due comandi fino all'applicazione, con resistenza (`Danni 15`, Mira 45 → 30) e con una creatura esente; Controllare acqua fino in fondo; Terremoto fino agli esiti; Invocare il fulmine fino alla sagoma; le parole di F5 su Lama, Muro di Luce, Sfera e Controllare acqua; punizione in vista compatta; punizione e attacco fino all'applicazione.
- **Non provato al banco.** L'applicazione di Terremoto: una fessura valida deve attraversare il bordo della zona, e al banco non ho ricreato la geometria; la registrazione non è cambiata. Le esplosioni ancorate di Raffica di Spine e Freccia Folgorante: al banco si fermano a `Calcolo l'esplosione…`; le righe sono le stesse dell'area.

## Fatto: V6

- **Elenco, D5.** Le carte diventano un elenco in un riquadro: una scelta per riga, nome a sinistra, che cosa fa a destra. Mano arcana, Stretta della Terra, Controllare Venti, Telecinesi e Sguardo.
- **Lanciatore.** Il suo nome sta sotto il titolo: con due incantatori si sa di chi è la mano.
- **Un'azione sola resta il pulsante blu:** Frecce Infuocate, Sudario Spirituale. Ora anche Marchio del cacciatore e Sortilegio, che avevano un pulsante largo mezza finestra con il testo intero sotto.
- **Testi.** Accanto al nome la forma breve, il testo intero nel suggerimento. Le forme brevi nuove sono di Controllare Venti, che prima scriveva fino a cinque righe per azione, e di Telecinesi, che non scriveva niente. Sudario Spirituale non dice più `bonus damage` e `enforcement`.
- **Messaggi.** Nella barra in fondo, come negli altri popup: errore rosso con ✕.
- **Altezze.** Elenco 101 + 32 per riga: Mano arcana 261, Controllare Venti 229, Stretta della Terra 165. Telecinesi 180, Sguardo 260, bersaglio con un'azione 210, un'azione sola 160.
- **F6.** La fessura rifiutata dice che cosa cambiare. Lo stesso per un vortice fuori dalla zona. Ogni altro rifiuto tiene il suo codice, per chi deve capire che cosa è successo.
- **Provato al banco:** Mano arcana, Stretta della Terra, Controllare Venti, Telecinesi, Sguardo, Frecce Infuocate, Sudario Spirituale e Marchio del cacciatore. Da Mano arcana all'azione e di nuovo alla Scelta, con l'altezza giusta. Marchio del cacciatore fino all'applicazione. F6 con una fessura sbagliata.
- **Da guardare in stanza.** Sguardo applica la condizione, ma al banco il finto SDK dà `scene-item-reconcile-exhausted:add`: il popup resta aperto con il messaggio in rosso. Quel flusso non è cambiato, e il messaggio viene dalla riconciliazione degli effetti, che al banco fallisce sempre; nella stanza non dovrebbe comparire. Sortilegio non è stato aperto: è lo stesso caso di Marchio.

## Fatto: F1

- **Lo studio.** Non era una svista. P4 (lotto 2) aveva lasciato le punizioni al GM, «con l'attacco», pensando che arma e punizione finissero in un solo numero. Ma il loro popup chiede solo i dadi della punizione (`Tuono 2d6`), e l'arma si registra a parte nella console, che le difese le conta già. E lo stesso incantesimo faceva il conto nel promemoria e non nel popup: il fuoco a inizio turno di Punizione Incandescente diceva già `Res. fuoco`.
- **Le decisioni dell'utente, il 05/11.**
  - D1: nel popup si scrive solo il danno della punizione, e il popup fa il conto.
  - D2: un clic sul chip ignora la difesa.
  - D3: anche Punizione Marchiante, la versione SRD, che non stava in nessuna delle due liste.
  - D4: il colpo diretto di Freccia Folgorante resta un totale finale scritto dal GM.
- **I tipi.** Le sette punizioni sono nella tabella di `src/spellDamageDefenseCore.js`: Tonante tuono, Incandescente fuoco, Collerica e Demoralizzante psichici, Accecante e Marchiante radiosi, Esiliante forza. Nessuna resta più al GM. Un test le confronta con le regole della risoluzione.
- **Il popup.** Il chip sta nella riga fissa già prima del danno, come negli altri popup: `Res. tuono`, con il suggerimento di scrivere il danno intero, poi `Res. tuono: 9 → 4`, e la riga dice `Danni 4`. Un clic lo ignora.
- **I PF.** `buildPreparedInitialDamageMutation` fa lo stesso conto, bersaglio per bersaglio, con le difese ignorate dal clic. Il registro di combattimento dice quale difesa ha contato. La scrittura dei PF, l'`Annulla` e le barre restano quelli di prima: cambia solo il numero. Le condizioni restano anche con un'immunità al danno.
- **Punizione Esiliante.** La soglia dei 50 PF legge i PF dopo il danno, quindi dopo la difesa. Con resistenza alla forza, 20 danni portano 60 PF a 50 e il bersaglio va; 18 lo lasciano a 51 e resta. Prima i 18 interi lo mandavano via.
- **Provato al banco:**
  - Tonante da 9 su un goblin resistente al tuono: `Danni 4`, 7 → 3, Prono;
  - lo stesso col clic sul chip: `Danni 9`, 7 → 0;
  - Incandescente da 6 su uno resistente al fuoco: `Danni 3`, 7 → 4, e il fuoco a inizio turno resta com'era;
  - Tonante anche in vista compatta: 7 → 3.
- **Solo nei test.** Immunità, vulnerabilità ed Esiliante sopra e sotto i 50 PF.

## Prova in stanza di F1

- Una punizione su una creatura resistente al suo tipo: il chip si legge prima di scrivere il danno? Il numero torna?
- Se ti capita di scriverlo già dimezzato: un clic sul chip, e il conto resta il tuo.

## Fatto: V11

- **Tolte.** `prepared-spell-resolution.html` (175 righe), `src/prepared-spell-resolution.js` (408 righe) e la voce in `vite.config.js`.
- **Perché era morta, dal codice e non dal censimento.** `preparedSpellResolutionAction` restituisce solo un'azione `resolve`, una `manual` o niente, e senza azione il gruppo non arriva al controller. Il ramo che apriva la pagina chiedeva un'azione di un altro tipo: non poteva succedere.
- **Morto con lei.** `src/preparedSpellResolutionController.js` aveva un timer da 40 ms che riposizionava i popup ancorati al token, e il solo popup ancorato era quella pagina. Girava a vuoto 25 volte al secondo nel servizio di sfondo, per ogni GM. Ora non c'è più, con `refreshPreparedSpellAnchors` e le costanti delle sue misure.
- **Che cosa resta com'era.** Il popup si apre accanto al caster, al suo turno, e poi resta dove lo metti. Le funzioni `popoverOptions` e `openOrMoveGroup` tengono il nome. Il canale `request-sync` resta: lo usa il popup comune.
- **Un test vero.** Fin qui il controller era coperto solo da controlli sul testo del sorgente. `test/preparedSpellResolutionController.test.js` lo fa girare: al turno, fuori turno, dopo la ×, con due preparati dello stesso caster, senza timer.
- **Provato al banco, con il controller vero:**
  - Punizione Tonante: al lancio si apre (360×300), al turno dopo si chiude, al ritorno del turno si riapre;
  - spostata col trascinamento, resta lì anche se il token si muove;
  - chiusa con la ×, non torna nello stesso turno, nemmeno se la scena cambia; torna al turno dopo, dove l'avevi lasciata;
  - risolta fino in fondo: goblin 7 → 4, Prono, pillola consumata, e non si riapre;
  - Colpo dello Zefiro, l'azione `manual`: si apre con `Usa colpo`, si chiude fuori turno e torna;
  - nessuna pagina `prepared-spell-resolution` fra le finestre.
- **Non provato al banco.** Due preparati dello stesso caster, uno sopra l'altro: solo nel test.

## Prova in stanza di V11

- Una punizione: il popup compare accanto al caster al suo turno, e sparisce quando il turno passa?
- Spostalo, poi muovi il token: resta dov'è?

## Fatto: V10

- **Flusso, D4.** Tutti gli attacchi come la console: prima l'esito, poi il danno, che compare solo su `Colpito` o `Critico`, poi il pulsante. Prima cinque azioni su sei registravano al clic sull'esito; solo Pugno serrato seguiva già quest'ordine. Il comando dei PF non è cambiato: cambia solo quando parte.
- **Un mancato non chiede il danno.** Spada arcana, Arma spirituale, Sfera della Tempesta e Lama del Disastro lo chiedevano anche su `Mancato`. Ora la riga dice `Danni 0`, come la console, e il chip della difesa sparisce: su un mancato non direbbe nulla.
- **Il pulsante dice l'azione.** `Lancia una stella`, `Raggio radioso`, `Attacco`, `Fulmine`, `Pugno serrato`, in rosso. Così sotto il titolo resta solo chi lancia. Le armi evocate hanno solo un nome lungo, `Attacco · 3d10 forza`: il pulsante ne prende la prima parte, perché i dadi stanno già nella riga del danno.
- **Invio.** Nel danno registra, come nella console: `Colpito`, il numero, `Invio`. Il clic in più di D4 si recupera così.
- **Cursore.** Dopo `Colpito` va nel danno quando il campo c'è davvero. Prima partiva dal clic, e il campo compare dopo le risposte della scena: al banco bastava, nella stanza dal codice non sarebbe bastato.
- **Lama del Disastro.** Lo stesso ordine in ogni riquadro, il cursore che resta nel danno (F10), e in fondo `Danni` con il totale, che prima mancava.
- **F9.** Un attacco rifiutato resta scritto in rosso nella barra finché non cambi esito o bersaglio. Il bersaglio fuori gittata si legge in parole: `Il bersaglio è fuori gittata: spostalo o scegline un altro.`.
- **Altezze.** 310, 354 e 480 restano: misurate con il danno scritto, il pulsante e il chip, ci stanno. La Sfera sale a 330 per la riga del vantaggio, senza la quale un chip faceva scorrere il pannello di 2 px.
- **Provato al banco, fino ai PF:**
  - Corona di Stelle: `Colpito`, `12` con tasti veri, `Invio`: goblin da 7 a 0. `Mancato`: PF fermi, stelle da 7 a 6;
  - Muro di Luce con resistenza: `Res. radiosi: 16 → 8`, Mira 45 → 37;
  - Spada arcana: colpito 45 → 36, mancato senza numero;
  - Arma spirituale: colpito 45 → 39, mancato senza numero;
  - Sfera della Tempesta dal promemoria di inizio turno: 40 → 29, con la riga del vantaggio;
  - Pugno serrato su `Critico`, in vista compatta: 45 → 23;
  - Lama del Disastro: un mancato senza numero e un colpito da `18`, scritto una cifra alla volta, con `Invio`: Mira ferma, goblin a 0;
  - F9: un bersaglio spostato fuori gittata prima del clic: messaggio rosso, popup aperto, PF fermi.
- **Non provato al banco.** Il consumo del Muro sul disegno e `Annulla` dalla Cronologia dopo un attacco: quei percorsi non sono cambiati, e il primo è coperto dai test. Il messaggio di F9 l'ho visto con il testo tecnico: quello in parole è arrivato subito dopo, ed è controllato dai test.

## Prova in stanza di V10

- Corona di Stelle: `Colpito`, il numero, `Invio`. È comodo, o ti manca il clic secco?
- Dopo `Colpito`, il cursore finisce davvero nel danno? Al banco sì, ma nella stanza la scena risponde più lentamente.
- `Mancato`: si applica senza numero? La stella si consuma?
- Spada arcana e Arma spirituale dalla scheda del token: il pulsante dice `Attacco`?
- Lama del Disastro con due attacchi e numeri di due cifre.

## Fatto: V9

- **Fogli comuni.** La pagina carica anche `console-panel.css`: testata, maniglia, riga fissa e barra dei messaggi sono quelle delle console. Della pagina restano il vetro fucsia e la scheda del d100, come dice D6. L'esagono passa da 86 a 72 px.
- **Altezza, D2.** Da 600 a 470 px, una costante sola (`WILD_MAGIC_SURGE_POPOVER_HEIGHT`) letta dalle due aperture. La proposta disegnata diceva 369, ma aveva un esito solo, con poco testo. Ho misurato le 50 righe con testi di riempimento lunghi quanto quelli del pacchetto: la più piena chiede 331 px di pannello, più 36 se compare la scelta delle Onde di Caos, e a 470 il pannello ne ha 371. Una riga di lunghezza mediana lascia 74 px vuoti in fondo; prima erano circa 185.
- **Il costruttore della pillola resta chiuso.** Prima si apriva da solo nelle 8 righe `Al tavolo`, ma aperto non entra nella finestra: chiederebbe altri 100 px. Ora si apre con un clic e il pannello lo porta in vista. Ogni nuovo numero lo richiude.
- **L'esito.** Un riquadro come gli altri: via la pill con il gradiente, il bordo colorato e la freccia. `Automatico` è verde, `Al tavolo` grigio. Le indicazioni non sono più gialle: il giallo resta per l'avviso vero, `Numero fuori tabella (1-100).`.
- **Riga fissa.** `Manca il d100.`, `Numero fuori tabella (1-100).`, `Manca il totale dei PF.`, poi `Applica riproduce l'esito.` o `Applica non scrive nulla: usa la pillola se serve.`. `Applica` sta a destra, blu; nella cura resta spento finché manca il totale.
- **Costruttore.** Etichette a sinistra (`Pillola`, `Note`, `Durata`), controlli da 32 px, `Metti la pillola` nella riga della durata: da quattro righe a tre.
- **Messaggi.** Nella barra in fondo, che c'è solo quando serve: ✓ verde, ✕ rosso. Prima `Pronto.` restava lì fisso, e un errore aveva il colore di ogni altro messaggio. Un messaggio sparisce quando scrivi un altro numero, perché parlava della riga di prima.
- **F8.** Dopo `Applica` il pulsante si spegne e la riga dice `Già applicato: un nuovo d100 per un altro Impulso.`. Lo riaccendono un numero riscritto, anche lo stesso, e `Tira qui`. Se `Applica` fallisce resta acceso. `Metti la pillola` non ha questo limite. Una conseguenza: se dopo una riga di lancio chiudi il pannello senza lanciare, per riaprirlo devi riscrivere il numero.
- **Provato al banco, con Dars Stregone di Magia Selvaggia:**
  - aperto dalla console e dalla scheda: 470 px, e si trascina da entrambe;
  - i tipi di esito fino all'applicazione: pillola con condizione, condizione sullo Stregone, cura (40 → 47 PF), punti stregoneria, slot, riga al tavolo, lancio che apre il pannello, pillola del costruttore;
  - Onde di Caos spese: la scelta compare, la risorsa torna a 1 e la riga sparisce;
  - la condizione sui selezionati senza selezione: errore rosso, `Applica` resta acceso.
- **Non provato al banco.** I testi veri del pacchetto: al banco c'è solo la nota del pacchetto mancante, e le lunghezze le ho misurate con testi di riempimento. La condizione sui selezionati con una selezione vera è solo nei test.

## Prova in stanza di V9

- Una riga automatica e una `Al tavolo`: l'altezza va bene? Il costruttore chiuso ti sta bene anche nelle righe al tavolo?
- Con i testi veri del tuo pacchetto: a costruttore chiuso, qualche riga fa scorrere il pannello?
- `Applica` su una pillola, poi di nuovo: resta spento? Il nuovo d100 lo riaccende?
- Una cura: `Tira 2d10`, poi `Applica`.
- Con Onde di Caos spese: la scelta si legge, e la risorsa torna?

## Fatto: V8

- **Testata e fatti.** Chi lancia sta sotto il titolo. Via le cinque pill scritte nell'HTML: `TS Destrezza CD 15 · metà se supera`, con la CD del lancio o della scheda.
- **Stesso ordine dell'area.** Danno, `Creature colpite` con `Tutti superati` e `Tutti falliti`, righe con i PF e la fila compatta. Con molte creature scorre l'elenco.
- **F2.** Il danno parte vuoto, con `Fuoco 12d6` accanto. Prima il campo diceva `12`, il numero dei dadi, e `Detona` lo registrava. Se nel raggio non c'è nessuno il campo non compare e si può detonare lo stesso, come prima.
- **F3.** Il chip sta sotto il totale: `Mira · Res. fuoco: 13 → 6`, con il suo suggerimento. Un clic ignora la difesa, come negli altri popup, e un secondo clic la riapplica. Il dato arriva al comando in `hp.ignoredDefenses`, che l'esecutore già legge: senza clic non viene scritto, e il danno è lo stesso di prima.
- **Riga fissa.** `Manca l'esito di 4 creature.`, `Manca il danno.`, `Danni 27`, `Nessuna creatura nel raggio.`. `Detona` è rosso. I messaggi stanno nella barra in fondo.
- **Altezza.** 380 px, una costante sola (`DELAYED_BLAST_FIREBALL_POPOVER_HEIGHT`) letta dalle due aperture. Il popup non si ridimensiona più da solo: si apriva a 240 e saliva.
- **Provato al banco:** tutti gli stati della riga fissa, esiti in blocco e singoli, resistenza, nessuna creatura nel raggio, e la detonazione fino in fondo.
  - Senza clic: Auril 580 → 553, Mira con resistenza e TS superato 45 → 39, come diceva il chip, i goblin a 0, la pillola tolta.
  - Con il clic su Mira, da 20 danni e TS fallito: Mira 45 → 25, Auril con la sua resistenza 580 → 570.
  - Con due clic su Mira: 45 → 35, la resistenza è tornata.

## Prova in stanza di V8

- Una Palla di fuoco ritardata con quattro creature: la riga in fondo guida fino a `Danni N`?
- Una creatura resistente al fuoco: il chip si legge bene, e il numero torna? Un clic sul chip la ignora?
- Tieni aperto il popup finché la perla cresce: i dadi accanto a `Fuoco` restano giusti?

## Fatto: il trascinamento

Un popup si trascina solo se tre cose funzionano insieme: la pagina conosce il proprio identificativo e avvia il trascinamento (`popoverDrag.js`), chi lo apre lo registra (`openTrackedPopover`), e quella finestra è ancora aperta quando lo sposti (`popoverDragHost.js`).

| Popup | Che cosa mancava | Correzione |
| --- | --- | --- |
| Controincantesimo | Identificativo sulla pagina e apertura registrata | `data-popover-id`, `openTrackedPopover` |
| Detonazione | Identificativo e avvio sulla pagina | `dataset.popoverId`, `initializePopoverDrag` |
| Scheda del token (Mano arcana) | Il modulo sulla pagina | `import "./popoverDrag.js"` |
| Impulso aperto dalla scheda | Apertura registrata; dalla console c'era già | `openTrackedPopover` |
| Pannello incantesimi aperto dal menu ⚡ o da Impulso | Apertura registrata | `openTrackedPopover` |
| Popup d'azione aperto dal menu ⚡ | Apertura registrata | `openTrackedPopover` |
| Ogni popup, chiusa la finestra che l'ha aperto | Solo quella finestra poteva spostarlo | Le altre ne tengono una copia, e se non risponde una di loro la sostituisce |

- **L'ultimo caso è il più largo.** Valeva per i popup d'azione e la Detonazione aperti dal pannello, per Impulso aperto dalla console, per il Configuratore delle fazioni aperto dalle opzioni. Si vedeva solo chiudendo prima la finestra sotto.
- **Come funziona.** Chi apre un popup manda una copia dei suoi dati alle altre finestre, e la aggiorna a ogni spostamento. A fine trascinamento il proprietario risponde subito; se tace, la prima delle altre che scade (tra 150 e 300 ms) sposta il popup e ne diventa proprietaria. Un popup con il proprietario aperto si sposta una volta sola, come prima.
- **Non cambiano.** Orologi e Distanza 3D hanno un meccanismo loro, tenuto dallo strumento. Menu e avvisi senza maniglia (azioni della pillola, durata, menu della carta, azioni rapide, avvisi di turno) non promettono di spostarsi.
- **Provato al banco, con un trascinamento simulato:**
  - si spostano Controincantesimo, Detonazione, scheda del token, popup d'azione, punizione, Scelta del turno, Impulso;
  - di controllo, e funzionavano già: console attacchi, PF rapidi, opzioni, manuale, cronologia, effetti, scheda, riposo, stile delle aree, aura, PF condivisi, dadi, fazioni;
  - popup d'azione e Detonazione anche dopo la chiusura del pannello, con i dati scritti ancora lì.
- **Solo nel codice e nei test, non al banco:** pannello e popup d'azione aperti dal menu ⚡. Impulso aperto dalla scheda è provato con V9.
- **Da guardare in stanza.** Il banco tiene vive le finestre chiuse, quindi il difetto del proprietario chiuso lì non si vede da solo: viene dal codice, dove solo chi ha aperto il popup può spostarlo. Per provare la sostituzione ho tolto a mano il loro ascolto, come succede in OBR quando una finestra si chiude. La prova vera è in stanza.

## Prova in stanza del trascinamento

- Controincantesimo e Detonazione: si spostano dalla testata?
- Un'azione dal pannello: chiudi il pannello, poi sposta il popup. Si muove, con un attimo di ritardo la prima volta? Quello che avevi scritto resta?
- Il menu ⚡ di una pillola: il popup e il pannello che apre si spostano anche se il menu si è chiuso?
- La scheda di Mano arcana, dalla sua riga nel tracker.

## Fatto: V7

- **Testata.** Il titolo è `Controincantesimo`, chi lo lancia sta sotto, `Reazione` ha il tag viola con il rombo delle console. Via l'occhiello `Controincantesimo · Abiurazione` e il nome del lanciatore come titolo.
- **Campi.** Etichette a sinistra, sulla colonna degli altri popup: `Contro`, `Lancia`, `Slot`. Via i titoli sopra i campi. La distanza sta nel menu: la riga sotto compare solo se è fuori gittata, in giallo. `Cerca nel catalogo…` lo dice già il campo vuoto; resta `★ in cima…` se la creatura ha degli incantesimi sulla scheda.
- **Verdetto.** Stesso riquadro, stessa regola, senza sigillo e senza bordo colorato: il colore sta nell'esito scelto. `Annulli Palla di fuoco.` invece di `Palla di fuoco viene annullato.`, che sbagliava il genere con metà dei nomi.
- **Riga fissa.** `Manca la creatura.`, `Manca l'incantesimo.`, `Manca il livello.`, `Manca l'esito della prova.`, poi `Spende la reazione e lo slot di 3° livello.`, o `Spende la reazione.` senza slot. Il pulsante dice `Lancia`, blu.
- **Messaggi.** Nella barra in fondo, verdi o rossi: `Incantesimo annullato · speso: …`, che resta 2,5 secondi prima che il popup si chiuda.
- **Altezza.** Da 500 a 470 px, misurata sul caso più pieno: fuori gittata, `★ in cima`, la prova e la casella dello slot del bersaglio.
- **Provato al banco:** tutti gli stati della riga fissa; prova fallita; annullamento automatico; creatura fuori gittata; lanciatore con gli slot e senza; lancio fino in fondo, con lo slot di Dars e quello di Mira spesi (3 → 2) e il popup che si chiude.
- **Non provato al banco.** `★ in cima`: ho misurato lo spazio con il testo scritto a mano, ma non ho aperto una creatura con incantesimi sulla scheda. Il lancio dal menu 🪄 e dalla console attacchi: aprono lo stesso popup con `openCounterspellPopover`.

## Prova in stanza di V7

- Un Controincantesimo con la prova: `Contro`, `Lancia` e `Slot` si capiscono a colpo d'occhio?
- `Lancia` come etichetta, per ciò che lancia l'altro, e `Lancia` come pulsante, per ciò che lanci tu: confonde?
- Una creatura con gli incantesimi sulla scheda: compare `★ in cima` e le voci sono in cima?

## Prova in stanza di V6

- Mano arcana: l'elenco si legge bene sullo schermo del tavolo, e il nome del lanciatore serve?
- Controllare Venti: le forme brevi dicono abbastanza? Il testo intero è nel suggerimento.
- Sguardo: il popup si chiude dopo aver scelto l'effetto, senza messaggi rossi?
- Una fessura di Terremoto messa male: il messaggio è chiaro?

## Prova in stanza di V5

- Un'area: `Posiziona area`, `Area confermata: N creature colpite.`, i PF nelle righe, il danno sopra l'elenco.
- Muro prismatico: si legge bene su sette righe? Il totale torna con quello che ti aspetti, anche con una resistenza?
- Terremoto, fino in fondo: `Numero di fessure`, poi la fessura, `Profondità` e gli esiti.
- Raffica di Spine o Freccia Folgorante: l'esplosione si ancora al bersaglio e l'elenco compare.

## Prova in stanza di V4

- Una punizione e un'area: scegliendo bersaglio, esito e danno il popup non cambia mai altezza, e la riga in fondo dice che cosa manca.
- Un'area con molte creature: scorre l'elenco, e la riga col pulsante resta in vista.
- Un TS su una creatura resistente: il chip sta sotto il totale, accanto al pulsante.
- Le altezze sulle tue mappe e sul tuo schermo: qualcuna ti sembra troppo vuota o troppo stretta? Sono tutte in un punto solo e si cambiano in un attimo.

## Prova in stanza di V3

- Una punizione: `Dars` sotto il titolo, `Bersaglio` con i PF, `TS Forza CD N` con la CD del PG, `Tuono 2d6` accanto al campo.
- Un'azione bonus e un'azione: il tag arancione e quello verde in testata. Un comando del GM, come Muro prismatico, non ne ha.
- Un TS di un PG senza CD sulla scheda: `TS Forza`, senza CD.
- Un attacco con il menu: il bersaglio una volta sola, con i PF nelle voci.
- Telecinesi: una sola frase che chiede la creatura.

## Prova in stanza di V1 e V2

- Una punizione, un'area e Mano arcana: la tinta viola è giusta sulle tue mappe, anche chiare?
- Il testo si legge dallo schermo del tavolo, nei corpi nuovi?
- Gli angoli del popup sono puliti, senza quadrato nero, e sotto Controincantesimo non c'è più la fascia nera?
- `Fallito` rosso, `Superato` verde, `Immune` blu. `Risolvi` rosso, `Cura` e `Lancia` blu.
- Impulso: il fucsia è quello che volevi?
- Si vedono ancora, e arrivano dopo: le carte della Scelta (V6), i titoli sopra i campi di Controincantesimo (V7).

## La tela nera in produzione

La build su Render ha ancora i popup di prima: lì, se vuoi la conferma della deduzione, basta guardare gli angoli di una punizione o la fascia sotto Controincantesimo. Dopo il deploy di V1 non si può più vedere.
