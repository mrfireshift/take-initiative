# Audit UX e UI del pannello attacchi

Micro-audit del 04/11/2026 su `pc-attack.html` e `src/pc-attack.js`, chiesto dall'utente perché il pannello si stava riempiendo di informazioni senza gerarchia, disallineate e poco comprensibili. Schermate e proposte disegnate: [pagina dell'audit](https://claude.ai/artifact/6PEkHKtRhiHN6F64hYPBPV).

Restano fermi i colori del costo in stile Baldur's Gate, il rosso solo per il danno e niente conteggi sui tab, già decisi dall'utente.

Stato: D2 e D3 approvate il 04/11/2026; D1 rovesciata dall'utente dopo la prova. Lotti 1, 2, 3, 4 e 5 fatti, il 6 annullato, resta il 7. Prima del 7, altre rifiniture chieste dall'utente: vedi «Dopo la prova dell'utente».

## Misure

Al banco, su 38 stati reali, nella finestra da 380×560 px.

- 19 stati con più di 40 px vuoti sotto il contenuto (mediana 130, massimo 229).
- 12 stati che scorrono, fino a 430 px di troppo con le manovre.
- Fasce fisse fino a 190 px su 560: testata 45, reazione 21, riga fissa 84, stato 40.
- Il danno parte a 245 px e il pannello finisce a 414: tre righe di danno visibili. Fuori turno con una creatura selezionata parte a 329.
- Sottotitolo tagliato in 16 stati, nome in 7.
- 30 stili di testo, 6 altezze di controllo (24, 26, 27, 28, 32, 36), 4 bordi sinistri (13, 24, 27, 56).

## Problemi

### Gerarchia

- Selettore, bersaglio, esito e danno sono riquadri uguali.
- Tab ed esito sono lo stesso controllo da 32 px.
- Titoli di sezione e sottosezione identici: `EXTRA AL COLPO` seguito da `ATTIVAZIONI`.
- Corpi a un pixel di distanza (10, 11, 12). Testi di regole lunghi a 10 px.
- Immagine speculare e Scudo occupano 5 e 3 righe in riquadri colorati a ogni attacco.

### Allineamenti

- Quattro bordi sinistri nello stesso pannello.
- Colonna vuota di 32 px davanti a «Taglienti».
- Il testo dei menu parte da punti diversi. In Lotta «Bersaglio» sta sopra il menu, nell'attacco a fianco. Due tipi di menu, disegnato e nativo.

### Spazi morti

- Finestra fissa a 560 px.
- «Pronto.» occupa 40 px sempre.
- Righe da 42 px: 12 manovre fanno 504 px.
- Riquadro del bersaglio da 50 px per un menu da 32.
- «Extra al colpo» con il solo «+ Componente» prende due righe.
- Lista Capacità alta almeno 132 px anche con due voci, e linea sopra «Dettagli» senza niente da separare.
- Fuori turno: barra da 41 px e riga da 27 px prima dei tab.

### Testi tagliati e righe a capo

- Il sottotitolo ripete il nome e perde `+14 al tiro`, la portata, la CD e la Ricarica.
- Il nome si taglia mentre `PG` e `Mostri` occupano 80 px.
- Il menu nativo del bersaglio taglia a metà lettera e nasconde i PF.
- Nelle aree i PF spariscono.
- `PROVA CONTRAPPOSTA` va a capo, con una nota su due righe a fianco.
- Ultime righe di una parola.

### Errori veri

1. `Ai livelli superiori. Ai livelli superiori.` nei dettagli di un incantesimo: `src/pc-attack.js` aggiunge il prefisso che il dato ha già (`reference-modal.js` lo toglie).
2. Azione «Trucchetti» senza `spellIds`, aperta direttamente, per un chierico che conosce solo Fiamma sacra: il selettore dice Fiamma sacra, ma testata, nota e danni sono di Dardo di fuoco. Riprodotto al banco.
3. Globo cromatico: la riga dice «Acido» mentre il menu chiede ancora il tipo e Registra è bloccato.

## Pill, badge, etichette e icone

| Elemento | Verdetto |
| --- | --- |
| `Turno` | Togliere |
| `Fuori turno` | Tenere, senza la frase ripetuta nella barra |
| `PG`, `Mostri` | Spostare nel menu ⋯ (D2) |
| `Azione` con la forma | Tenere |
| `Azione` bordata nella scheda | Togliere |
| `Res. …: 10 → 5` | Aggiungere ✕, testo più corto: `Res. taglienti non magici: 10 → 5` |
| Usi rimasti, oggi in cinque forme | Una sola: numero a destra |
| `bersaglio`, `su di sé` | `Su un bersaglio`, `Su di sé` |
| `Conc.`, `Concentrazione` | Una volta sola |
| `Leggendaria` | Togliere, resta il costo se è 2 |
| `+ Componente` | `+ Danno extra` |
| `Attivazioni` | `Manovre · Dadi 5/5` |
| `Al colpo` | `Effetto del colpo` |
| `Danno` senza danno | Nascondere |
| `TS fallito`, `TS superato` | `Fallito`, `Superato`, con il TS scritto una volta sopra |
| `Scegli il bersaglio`, tre volte | Una volta, nella riga fissa |
| `Pronto.` | Togliere |
| `Tiro per colpire` | Etichetta `Tiro` |
| `Reazione già usata…` | Solo se era già usata prima |
| Emoji delle capacità | Togliere (D3) |
| `⚔` nelle righe | Parola `Console` |
| Frecce `⌄`, `▸ ▾`, `▶ ▼` | Una sola famiglia |
| `−`, `×`, `⇄`, griglia, forme del costo | Tenere |
| Arancione e viola nei riquadri | Neutri: oggi Scudo è arancione come l'azione bonus e Immagine speculare viola come la reazione |
| Blu | Solo per selezione e azioni |
| Giallo | Solo per gli avvisi veri |

## Lotti

Tutti riguardano l'aspetto: danni, PF e registrazione non si toccano.

1. **Errori e parole.** I tre errori, le etichette, «Pronto.», i messaggi ripetuti. Fatto.
2. **Testata.** Via sottotitolo e `Turno`, dati sotto il selettore, menu ⋯, una riga sola per i cambi di creatura. Fatto. In più, un solo pulsante quando la creatura selezionata è quella di turno.
3. **Griglia e densità.** Un bordo sinistro, etichetta e controllo, righe a una linea, niente riquadri, difesa accanto al totale, menu del bersaglio con i PF a destra. `TS fallito` e `TS superato` del bersaglio singolo diventano `Fallito` e `Superato`: il TS ora è scritto sopra, sotto il selettore. Fatto. In più, tab sottolineate e altezze 24, 32 e 36. Restano nativi il menu `Tiro` e quelli piccoli di slot e tipo di danno. I riquadri sono tornati in parte dopo la prova dell'utente.
4. **Aree.** Danno prima dell'elenco, righe compatte, PF sempre visibili. Fatto. In più, area, TS e CD una volta sola sotto il selettore, `Tiro` sotto il selettore anche fuori dalle aree, `+ Danno extra` sulla riga del danno.
5. **Pill, icone e colori.** Una forma per gli usi, una famiglia di frecce, emoji, colori per significato, note brevi di Immagine speculare e Scudo. Fatto sul pannello attacchi. La console boss conserva testi lunghi e colori fino al lotto 7. Gli usi a zero passano dal rosso al giallo: il rosso è solo del danno.
6. **Altezza della finestra.** Fatto in `e5c01287`, annullato in `a03ebd7d` dopo la prova dell'utente: la finestra resta di 560 px.
7. **Console boss.** Quello che vale anche lì: condividono `public/console-shell.css`.

## Decisioni

Approvate il 04/11/2026.

- **D1, altezza della finestra.** Approvata come «segue il contenuto», rovesciata dall'utente dopo averla provata: altezza costante.
- **D2, `PG` e `Mostri`.** Nel menu ⋯ della testata.
- **D3, emoji delle capacità.** Tolte dalle righe del pannello.

## Dopo la prova dell'utente

Provato su una scena reale, il pannello sembrava ancora compresso e senza gerarchia nelle capacità. Cambiano solo i testi e la disposizione: danni, PF e registrazione restano uguali.

- **Altezza costante.** Lotto 6 annullato.
- **Tipo di attacco.** `Mischia` e `Distanza` non occupano più una riga: stanno solo sul selettore, non nelle righe del menu, come ha deciso l'utente il 05/11.
- **Capacità.** L'elenco ha di nuovo uno sfondo suo, con una linea fra i gruppi. Le righe sono in colonna: nome, costo allineato a sinistra, usi a destra.
- **Pill senza contesto.** `Su di sé` e `Su un bersaglio` diventano parole accanto al titolo della scheda: `Ira  Su di sé`. La scheda ha il suo riquadro.
- **Aria.** Testata 40 px, 12 px fra i blocchi, righe dell'elenco 30 px.
- **Riquadri in più.** Hanno uno sfondo anche il danno, la tabella delle creature e la prova contrapposta della manovra. Non erano richiesti: l'utente li ha confermati il 05/11.
- **Titoli vuoti.** `Extra al colpo` compare solo sopra qualcosa; altrimenti `+ Danno extra` sta sulla riga del danno, come nelle aree. `Effetto del colpo` passa sotto gli extra.
- **Dati dell'attacco sopra il danno.** Dopo una seconda prova, `+5 al tiro · portata 1,5 m` e allo stesso modo TS, area e ricarica passano in cima al riquadro del danno; nelle aree, che non hanno riquadro, subito sopra il danno. Vanno a capo fra una parte e l'altra, col `·` in fondo alla riga.
- **Sotto il selettore.** Resta `Multiattacco`, allineato al testo del selettore anche nelle aree, e il nome dell'attacco quando manca il menu che lo dice.
- **Nessun esito da scegliere.** Un incantesimo senza tiro, come Dardo incantato, ha un solo esito: la console lo segna da sola e non mostra il pulsante `Colpito`, come ha deciso l'utente il 05/11. Sopra il danno si legge `Senza tiro per colpire`. Non conta come scelta del GM: la mappa continua a guidare il bersaglio, e si può chiudere o cambiare attacco senza conferma finché non si scrive il danno. Il fuoco passa alla casella del danno solo se il pannello è già in uso, per non togliere la tastiera alla mappa.
- **Testi tagliati.** La casella del danno mostra solo formule fino a 6 caratteri: una più lunga resta accanto. `Etichetta` non ha più l'esempio, che passa nel suggerimento.
- **Dettagli.** Uno stacco fra dati, testo e «Ai livelli superiori».

Al banco, sui 38 stati:

- 32 stati hanno più di 40 px vuoti (mediana 177, massimo 257): è il prezzo dell'altezza costante.
- Scorre un solo stato: le manovre, di 172 px.
- I nomi lunghi si tagliano prima: `Mischia` divide il selettore col nome, che resta intero nel suggerimento.

## Prova in stanza del lotto 1

- [ ] **Trucchetti:** dal menu ⚔ della card apri l'azione «Trucchetti» di un PG che conosce un solo trucchetto: selettore, testata e danni dicono lo stesso.
- [ ] **Barra di stato:** con il pannello fermo non c'è. Dopo **Registra** compare con il messaggio e **Annulla**, senza coprire nulla.
- [ ] **Fuori turno:** dopo un attacco con la reazione non compare l'avviso giallo; scegliendo l'esito del colpo dopo sì.

## Prova in stanza del lotto 2

- [ ] **Testata:** una riga sola con il nome. Nel proprio turno nessuna pillola, nel turno di un altro `Fuori turno`. La testata trascina ancora la console e **−** la riduce.
- [ ] **Dati:** sopra il danno il morso di un mostro dice bonus, portata e, dopo l'uso, `usata`, senza tagli.
- [ ] **Menu ⋯:** si apre e si chiude dal suo pulsante, con un clic fuori e con Esc; il secondo Esc chiude la console. Le due caselle cambiano le stesse opzioni del pannello Opzioni, e al turno dopo la console si apre o no di conseguenza.
- [ ] **Cambi di creatura:** fuori turno con un'altra creatura selezionata, **⇄ Torna a…** e **⇄ Agisci con…** stanno su una riga. Selezionando quella di turno ne resta uno.
- [ ] **Turno che cambia durante un attacco:** a esito scelto, la barra gialla offre **Passa a…**; dopo **Registra** diventa blu.

## Prova in stanza del lotto 3

- [ ] **Menu del bersaglio:** nome a sinistra e PF a destra, sul pulsante e nelle righe. Si sceglie con il mouse e con frecce e Invio; Esc lo chiude e il secondo Esc chiude la console. Selezionando un token sulla mappa il pulsante lo segue.
- [ ] **PF che cambiano:** con il menu aperto, cambia i PF di un token dal tracker: il menu resta aperto e la riga si aggiorna.
- [ ] **Registra:** il danno va al bersaglio scelto dal menu. Vale anche per Lotta e Spinta.
- [ ] **Difesa:** con un bersaglio resistente la pill sta sotto il totale, accanto a **Registra**; un clic sulla ✕ la ignora, un altro la riapplica.
- [ ] **Molti token:** con più di dieci creature il menu scorre e non esce dalla finestra.
- [ ] **Liste corte e lunghe:** la lista Capacità è alta quanto le sue voci; un elenco lungo di incantesimi scorre senza spingere i Dettagli fuori dalla finestra.

## Prova in stanza del lotto 4

- [ ] **Soffio:** subito sopra il danno si legge `Cono di 18 m · TS Destrezza (CD 21) · metà se superato · Ricarica 5–6`, poi le creature. **Disegna** funziona come prima.
- [ ] **Righe:** PF, bonus al TS, esito e danno stanno in colonne. Un nome lungo si accorcia, il suggerimento lo scrive intero. Scrivendo il danno gli esiti non si spostano.
- [ ] **Sotto la riga:** una creatura resistente dice `Res. fuoco: 60 → 30`, un ladro di 7° livello `Elusione`, una immune alla condizione `immune a spaventato`.
- [ ] **Freccia Perforante:** `Tiro` resta in alto, il danno sotto, le creature in fondo.
- [ ] **Danno extra:** su un'area `+ Danno extra` sta sulla riga del danno. Aggiungendone uno compare il titolo `Extra al danno`.
- [ ] **Registra:** i PF scendono come prima, anche con i tiri segnati da **Tutti falliti**.

## Prova in stanza del lotto 5

- [ ] **Righe:** in Capacità nessuna emoji; il costo in colonna e, a destra, gli usi (`3/3`). Passando sul numero il suggerimento dice cosa conta. A zero usi il numero è giallo.
- [ ] **Scheda della capacità:** niente pill: accanto al titolo `Su di sé`, `Su un bersaglio`, `Attiva`. Accanto al pulsante compare solo il motivo per cui è spento.
- [ ] **Manovre:** `Manovre · Dadi di Superiorità` con `5/5` in fondo alla riga. Una capacità con i suoi usi ha il numero a destra, e sparisce dalla riga il nome della risorsa.
- [ ] **Incantesimi:** `Azione` in colonna e `Console` a destra per quelli che si risolvono nella console; `Concentrazione` non compare più come pill nei Dettagli.
- [ ] **Azioni leggendarie:** nessuna scritta `Leggendaria`; `Costo 2` su quelle che costano 2.
- [ ] **Frecce:** `Altre capacità` e `Dettagli` hanno il chevron dei menu, a destra, che gira quando si aprono.
- [ ] **Bersaglio con reazioni:** con Immagine speculare e Scudo due righe senza colore: `Immagine speculare · d20 ≥ 6` e `Reazione · +5 CA`, ognuna col suo pulsante. La regola è nel suggerimento, e i pulsanti funzionano come prima.
- [ ] **Console boss:** con lo stesso bersaglio mostra ancora i testi lunghi, come prima.

## Prova in stanza dopo la prova dell'utente

- [ ] **Altezza:** la finestra resta di 560 px, qualunque scheda si apra.
- [ ] **Attacco di un PG:** `Mischia` sul selettore, non nelle righe del menu, e nessuna riga sotto.
- [ ] **Dardo incantato:** nessun pulsante di esito, sopra il danno `Senza tiro per colpire`, e il bersaglio segue ancora la mappa. Scrivi il danno e premi Invio: il dardo dopo è pronto, sullo stesso bersaglio, con lo slot speso una volta sola. Chiudendo prima di scrivere non chiede conferma.
- [ ] **Dardo incantato al turno di un altro:** con la console aperta sul dardo e nessun danno scritto, al cambio di turno la console segue il turno senza fermarsi; con un danno scritto si ferma e aspetta il GM.
- [ ] **Attacco di un mostro:** `+14 al tiro · portata 3 m` in cima al riquadro del danno, sopra `Perforanti`; sotto il selettore solo `Multiattacco`.
- [ ] **Incantesimo con slot:** prima il selettore dello slot, poi `Senza tiro per colpire`, poi il danno.
- [ ] **Capacità:** `Utilizzabili` e `Altre capacità` nello stesso riquadro, separate da una linea. Costi in colonna, usi a destra, `Ira  Su di sé` nel titolo della scheda.
- [ ] **Danno senza extra:** nessun titolo, `+ Danno extra` accanto alla casella. Aggiungendo una componente torna `Extra al colpo`.
- [ ] **Critico con formula lunga:** la formula va a capo e nulla si sovrappone.
- [ ] **Mostro con effetto al colpo:** `Effetto del colpo` sotto il danno; TS, pulsanti e danno del veleno funzionano come prima.
- [ ] **Manovra:** `Spingi via di 1,5 m` e `Butta Prono`, poi il riquadro della prova contrapposta. Registra come prima.
- [ ] **Dettagli aperti:** uno stacco fra dati, testo e «Ai livelli superiori».
