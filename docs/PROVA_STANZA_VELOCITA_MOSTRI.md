# Prova in stanza: velocità dei mostri

Controlli a mano del [piano velocità dei mostri](PIANO_VELOCITA_MOSTRI.md), prima del bundle di produzione. Ogni controllo del tracker va fatto **in vista estesa e in vista compatta**.

Il banco non può provare due cose, che qui contano più delle altre:

- che lo stato e gli avvisi arrivino davvero solo a chi devono (punto 4), perché il banco è un solo client;
- che la lista del selettore si apra oltre la linguetta alta 21 px (punto 3). Sul banco ho scelto la modalità con clic e tastiera veri, ma non ho potuto vedere la lista.

## Preparazione

1. La build locale deve essere attiva (`npm run dev`, porta 5173).
2. Apri la room **Auril (Testbench)** con **Take Initiative! (LOCALE)**. Servono due finestre: la finestra del GM e quella dei giocatori in incognito sullo schermo del tavolo. Ricarica entrambe.
3. In iniziativa servono:
   - un mostro che vola e cammina: dalla scheda di un nemico, **Modifica → Importa → Archivio online**, importa **Adult Silver Dragon** (MM);
   - un mostro che non cammina: nello stesso modo, su un altro nemico, **Banshee** (MM);
   - un nemico senza velocità sulla scheda;
   - un PG con una velocità sulla scheda.
4. Accendi **Movimento** nella griglia degli strumenti. **Limita movimento** resta spento.

## 1. Il mostro nel suo turno

- [ ] **Turno del drago:** il riquadro segna `0 / 12 m` nella vista estesa; la linguetta segna `Piedi ▾ 0/12 m` in quella compatta.
- [ ] **Movimento:** trascinalo di due caselle. Il riquadro segna 3 m e il token non scatta né torna indietro.
- [ ] **Annulla:** con Ctrl+Z il token torna indietro e il movimento torna a 0 m.
- [ ] **Modalità:** scegli **Volare**. La velocità diventa 24 m e la distanza già percorsa resta.
- [ ] **Turno dopo:** fai un giro di turni. Il drago riparte in **Volare** con 0 m, il PG riparte a piedi.
- [ ] **Senza velocità:** nel turno del nemico senza velocità non c'è nessun riquadro e il token si muove libero.
- [ ] **Velocità a metà turno:** scrivi una velocità sulla sua scheda: il riquadro compare. Toglila: il riquadro sparisce e il token torna a muoversi libero.

## 2. Chi non cammina, le condizioni e il limite

- [ ] **Banshee:** parte in **Volare** a 12 m, senza la voce Camminare e senza selettore. Si muove normalmente.
- [ ] **Afferrato sul drago:** ogni modalità va a 0 m. Trascinandolo torna indietro anche con Limita movimento spento, e l'avviso compare solo al GM. Tolta la condizione, si muove di nuovo.
- [ ] **Indebolimento 2 sul drago:** in volo la velocità diventa 12 m.
- [ ] **Limita movimento acceso:** un trascinamento oltre il residuo riporta indietro il drago, come un PG.

## 3. Il selettore nella vista compatta

- [ ] **Lista:** nel turno del drago, un clic sulla parola della linguetta apre la lista con Camminare · 12 m e Volare · 24 m. Controlla che si veda tutta, anche se la linguetta è bassa.
- [ ] **Scelta:** scegli Volare. La linguetta diventa `Volo ▾ 0/24 m`, e i tasti del turno tornano a funzionare senza altri clic.
- [ ] **Suggerimento:** passando il mouse sulla linguetta si leggono anche le caselle.
- [ ] **Una sola modalità:** il PG a piedi resta `0/9 m · (0/6)`, senza selettore.
- [ ] **Griglia degli strumenti:** è come prima, e la linguetta è larga come prima.

## 4. Cosa vede il tavolo

Tieni le due finestre affiancate.

- [ ] **Nemico visibile:** nel turno del drago il tavolo non mostra il widget del movimento, in nessuna delle due viste; il GM lo vede come sempre.
- [ ] **Nemico oltre la velocità:** con Limita movimento spento, trascina il drago oltre 24 m. **Movimento esaurito** compare sul GM e non sul tavolo.
- [ ] **Neutrale:** cambia la fazione della Banshee in Neutrale. Nel suo turno il tavolo non mostra il widget.
- [ ] **Alleato:** cambia la fazione del drago in Alleato durante il suo turno. Il widget compare sul tavolo, senza selettore; nella vista estesa il dettaglio non elenca le altre modalità. Oltre la velocità l'avviso resta solo al GM. Rimettilo Nemico: il widget sparisce.
- [ ] **Alleato nascosto:** nascondilo durante il suo turno e il widget sparisce dal tavolo; mostralo e torna.
- [ ] **Nemico nascosto:** nascondilo prima del suo turno. Nel suo turno il tavolo non mostra né widget né card; il GM vede tutto come prima.
- [ ] **PG oltre la velocità:** il widget si vede su entrambe le finestre e l'avviso compare su entrambe, come prima.
- [ ] **PG nascosto:** nel suo turno il tavolo non mostra nulla, e l'avviso compare solo sul GM.

## 5. Libertà di movimento

- [ ] Metti **Afferrato** e l'effetto di **Libertà di movimento** su un mostro con velocità, poi porta il turno su di lui. Il promemoria offre **Spendi 1,5 m**: la scelta toglie la condizione e il riquadro segna 1,5 m. Annulla dalla Cronologia rimette tutto.

## 6. Scritture e fluidità

- [ ] **Mostri fermi:** fai un giro di turni senza muovere i mostri. Il passaggio del turno non deve sembrare più lento di prima.
- [ ] **Trascinamenti di fila:** muovi il drago più volte, veloce. Il token segue la mano e il conteggio resta giusto.
- [ ] **Fine combattimento:** con **Svuota iniziativa** spariscono i contatori. Nel combattimento dopo il drago riparte a piedi.

Facoltativo, se vuoi un numero sul turno: `await __tbpPerf.runFluidityCheck()`, come in [Prova in stanza: fluidità](PROVA_STANZA_FLUIDITA.md).

## Esito

Per ogni casella non spuntata annota:

- la vista (estesa o compatta);
- la finestra (GM o tavolo);
- cosa hai visto.

Dopo le correzioni si passa al bundle di produzione.
