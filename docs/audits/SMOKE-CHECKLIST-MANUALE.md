# Smoke test manuale — checklist

Questa checklist copre ciò che l'[audit funzionale di ottobre 2026](FUNCTIONAL-AUDIT-2026-10.md)
**non ha potuto verificare o correggere con certezza**. La suite automatica e
l'harness con SDK simulato non coprono:

- più client reali;
- i permessi reali del player;
- il rendering sulla mappa;
- gli strumenti a trascinamento;
- la persistenza tra scene e ricariche;
- le animazioni.

Ogni voce va eseguita su Owlbear Rodeo reale.

## Come usarla

**Configurazione minima**

- **Client GM**: PC del DM, browser A.
- **Client player**: lo schermo del tavolo, browser B, oppure una finestra
  anonima con un account player.
- Una scena di prova con questi token:
  - 3 PG;
  - 1 alleato;
  - 1 neutrale;
  - 4 nemici omonimi, per esempio «Goblin»;
  - 1 boss;
  - 1 token 2×2.

**Come annotare l'esito**: `[x]` OK, `[!]` anomalia (descrivila sotto la
voce), `[-]` non eseguita.

**Perché ogni voce è manuale**:

| Etichetta | Significato |
| --- | --- |
| **MC** | servono due client reali |
| **MAP** | rendering sulla mappa |
| **DRAG** | interazione a trascinamento |
| **PERS** | persistenza dopo ricarica, cambio scena o cambio dispositivo |
| **VIS** | giudizio visivo |
| **PERF** | tempi e fluidità |

| Esecuzione | Data | Commit | Esecutore | Esito |
| --- | --- | --- | --- | --- |
| 1 | | | | |

---

## 0. Caricamento e installazione

- [ ] **0.1 (PERF)** Apri la room sul client GM. Atteso: icona nella barra
  estensioni, tracker apribile in pochi secondi, nessun errore in console.
- [ ] **0.2 (MC)** Apri la room sul client player. Atteso: il tracker si apre
  da solo. È una funzione voluta per lo schermo del tavolo, non un difetto.
- [ ] **0.3 (PERF)** Ricarica entrambi i client più volte, anche con rete
  lenta (DevTools → throttling «Fast 3G»). Atteso: le finestre si caricano
  nonostante i chunk > 500 kB (F-05); nessuna finestra resta bianca.

## 1. Scena e fazioni

- [ ] **1.1 (MC)** Dal menu contestuale di un token, sul GM: Aggiungi
  all'iniziativa → PG / Alleati / Neutrali / Nemici. Atteso: la card compare
  sui due client con il colore della fazione.
- [ ] **1.2 (MC)** Sul player, apri il menu contestuale di un token. Atteso:
  nessuna voce riservata al GM (quota, aure, boss).
- [ ] **1.3 (PERS)** Usa **Configura fazioni**:
  1. assegna le fazioni a più token;
  2. ricarica la pagina;
  3. in una scena nuova usa **Aggiungi attori** con gli stessi asset.

  Atteso: le fazioni vengono riusate.
- [ ] **1.4 (PERS, MC)** Ripeti 1.3 dal secondo browser del GM. Atteso: il
  registry fazioni è condiviso nella room.
- [ ] **1.5** Aggiungi un token mai visto. Atteso: entra come **Nemico**.
- [ ] **1.6** Premi **Azzera registry**. Atteso: le associazioni salvate
  spariscono; le fazioni già scritte sui token restano invariate.
- [ ] **1.7 (MC, F-02)** Se nella room ci sono token legacy senza fazione:
  confronta sul player gli HP nel tracker esteso e sulla barra mappa. Annota
  se il tracker li mostra e la mappa no.

## 2. Lister, layout e vista player

- [ ] **2.1 (VIS)** Passa da Esteso a Compatto e ritorno. Atteso: nessuna card
  persa, turno attivo evidenziato in entrambi.
- [ ] **2.2 (DRAG, PERS)** Trascina la barra compatta, poi ricarica. Atteso:
  la posizione resta (preferenza locale del browser).
- [ ] **2.3 (MC, VIS)** Sul player, con le opzioni di default, controlla gli
  HP mostrati:

  | Fazione | Tracker esteso | Tracker compatto | Barra mappa |
  | --- | --- | --- | --- |
  | PG | esatti | esatti | esatti |
  | Alleati | esatti | nascosti | esatti |
  | Neutrali | nascosti | nascosti | nascosti |
  | Nemici | nascosti | nascosti | nascosti |

  Atteso: dove il valore è nascosto non restano testo o barra vuoti.
- [ ] **2.4 (MC)** Sul player, prova a cliccare HP, iniziativa, frecce e
  pulsanti delle card. Atteso: nessun controllo di regia interattivo.

## 3. Card

- [ ] **3.1 (MAP, MC)** Fai doppio clic sul nome e rinomina. Atteso: il nome
  sotto il token cambia su entrambi i client.
- [ ] **3.2 (VIS)** Gruppo «Goblin» collassato. Atteso:
  - mostra **(Gruppo)** e il numero di membri;
  - si espande quando il turno entra nel gruppo;
  - si richiude quando ne esce;
  - la prima card resta ferma come ancora.
- [ ] **3.3 (DRAG)** Dai la stessa iniziativa a due attori e riordinali
  trascinando. Atteso: l'ordine resta; avanzando, il turno segue il nuovo
  ordine.
- [ ] **3.4** Azioni rapide:
  1. configurane 12;
  2. esegui un incantesimo su un solo bersaglio;
  3. esegui una condizione su più bersagli.

  Atteso: il primo caso si esegue subito; il secondo apre il pannello
  precompilato.
- [ ] **3.5 (PERS)** Chiudi e riapri la scheda della card, poi ricarica.
  Atteso: classi, livelli, sottoclassi e capacità abilitate restano.
- [ ] **3.6 (PERS, MC, F-01)** Budget del registry:
  1. crea 6 PG di 20° livello con molte capacità (Maestro di Battaglia,
     Monaco);
  2. apri la room da un altro browser;
  3. aggiungi gli stessi token in una nuova scena.

  Atteso oggi: i profili meno recenti possono tornare ai default senza
  avviso. Annota quanti profili si perdono.

## 4. Combattimento e turni

- [ ] **4.1 (MAP, MC)** Avvia l'incontro e avanza per un giro completo.
  Atteso:
  - l'etichetta **Turno di…** è sopra il token attivo e si sposta a ogni
    turno;
  - c'è una sola etichetta;
  - il player la vede.
- [ ] **4.2 (VIS)** Atteso: glow e colore di fazione sul turno attivo; nessuno
  sfarfallio durante l'avanzamento.
- [ ] **4.3** Turno precedente oltre il confine del round. Atteso: il round
  torna indietro correttamente. L'harness lo ha già verificato: qui serve
  solo la conferma visiva.
- [ ] **4.4 (MAP)** Attiva **Follow**. Atteso: la camera centra o segue il
  token attivo. L'harness non simula il movimento della camera.
- [ ] **4.5** Attiva **Tana**. Atteso: la voce di tana a iniziativa 20 compare
  e si attraversa con le frecce.
- [ ] **4.6** Boss Paragon con 2 turni, poi Epic Boss. Atteso:
  - le voci virtuali compaiono nell'ordine;
  - condividono gli HP del token;
  - non vengono duplicati token sulla mappa.
- [ ] **4.7 (MC)** Elimina dalla scena il token del turno attivo. Atteso: il
  tracker si riallinea senza errori; il turno passa a una voce valida.
- [ ] **4.8 (PERS)** Cambia scena a combattimento in corso, poi torna indietro.
  Atteso: round, ordine e turno della scena originale sono intatti; nessuna
  etichetta orfana nell'altra scena.
- [ ] **4.9 (MC)** Il GM avanza il turno mentre il player ha il tracker
  aperto. Atteso: il player si aggiorna entro un secondo circa.
- [ ] **4.10** Azzera l'incontro (round a 1) e rimuovi tutte le card. Atteso:
  conferma richiesta; nessun residuo sulla mappa (etichette, barre, pill).

## 5. HP

- [ ] **5.1 (MAP, MC)** Modifica gli HP dalla card. Atteso: la barra sulla
  mappa si aggiorna insieme, sui due client.
- [ ] **5.2** Console HP rapida:
  1. Danno 20 su 3 bersagli con `×2`, `1` e `½`;
  2. controlla l'anteprima;
  3. applica;
  4. annulla una volta.

  Atteso: i valori sono corretti, una sola voce di Undo, l'Undo ripristina
  tutti e tre.
- [ ] **5.3** Cura e PF temporanei dalla console. Atteso: la cura non supera
  il massimo; i PF temporanei si consumano prima degli HP.
- [ ] **5.4** Danno a un incantatore in concentrazione. Atteso: compare
  l'avviso di TS concentrazione.
- [ ] **5.5 (PERS)** Memoria HP dei PG:
  1. porta un PG a HP parziali;
  2. rimuovilo dall'iniziativa;
  3. riaggiungilo, anche in una nuova scena.

  Atteso: gli HP vengono ripristinati dalla memoria.
- [ ] **5.6** Usa ± per cambiare gli HP massimi. Atteso: correnti e massimi
  coerenti nella card e sulla barra mappa.

## 6. Condizioni

- [ ] **6.1 (MAP)** Applica una condizione selezionando i bersagli sulla
  mappa. Atteso: la pill compare ancorata al token.
- [ ] **6.2 (DRAG, MAP)** Prova a trascinare una pill sulla mappa. Atteso:
  è bloccata.
- [ ] **6.3 (DRAG, MAP)** Sposta il token. Atteso: la pill lo segue.
- [ ] **6.4 (VIS)** Con molte pill, cambia lo zoom. Atteso: dimensione e
  spaziatura si adattano; le pill non si sovrappongono al token vicino.
- [ ] **6.5** Applica una condizione a fine turno e una di 2 round. Atteso:
  scadono al momento giusto avanzando i turni.
- [ ] **6.6** Crea una quarta condizione personalizzata sullo stesso token.
  Atteso: viene rifiutata, il limite è 3.
- [ ] **6.7** Porta l'Indebolimento da 0 a 5 e ritorno. Atteso: la scheda e
  la condizione sul token sono sincronizzate; la velocità si dimezza a 2–4 e
  va a 0 a 5.

## 7. Incantesimi, concentrazione e reminder

- [ ] **7.1 (MAP)** Lancia un incantesimo a concentrazione. Atteso: `C`
  sulla card e sul token.
- [ ] **7.2 (MAP)** Lancia una spell con zona o aura, poi interrompi la
  concentrazione. Atteso: zone, aure, pill e condizioni figlie spariscono
  tutte, anche sulla mappa del player.
- [ ] **7.3 (MC)** Spell con TS a fine turno, per esempio Blocca Persone.
  Avanza fino al turno del bersaglio. Atteso:
  - il GM vede il reminder con caratteristica, CD e caster;
  - il player vede lo stesso reminder senza pulsanti né input.
- [ ] **7.4** Inserisci il risultato dei dadi fisici: superato su una
  istanza, fallito su un'altra. Atteso:
  - con TS superato la condizione viene rimossa;
  - con TS fallito resta;
  - una sola voce di History.
- [ ] **7.5** Con due reminder concorrenti, avanza il turno. Atteso: sono
  aggregati; il nuovo sostituisce il precedente; con un attore non coinvolto
  l'avviso scompare.
- [ ] **7.6** Palla di Fuoco Ritardata: interrompila volontariamente.
  Atteso: si apre prima la detonazione, poi concentrazione e perla vengono
  rimosse.
- [ ] **7.7 (VIS, MC)** Con Embers/JB2A attivo: lancia una spell con visuale.
  Atteso: l'animazione compare sui due client. Con la policy disattivata, non
  compare e la spell funziona lo stesso.
- [ ] **7.8 (PERS)** Ricarica con spell attive. Atteso: il registro degli
  incantesimi e le pill sono intatti.

## 8. Movimento

- [ ] **8.1 (DRAG)** Trascina un token nel suo turno. Atteso: le caselle
  percorse sono contate sulla velocità della scheda.
- [ ] **8.2 (DRAG)** Token prono: rialzati, poi muovi. Atteso: metà del
  movimento consumata per rialzarsi; ogni casella costa 2 finché resta prono.
- [ ] **8.3 (DRAG)** Muovi un token e premi Ctrl+Z. Atteso: il movimento
  annullato non viene contato.
- [ ] **8.4** Modalità volo, poi cambia la quota a mano. Atteso: la quota
  consuma movimento solo in volo.
- [ ] **8.5 (DRAG, MAP)** Attraversa una zona di terreno difficile. Atteso:
  costo raddoppiato solo dentro la zona.
- [ ] **8.6** Layout compatto. Atteso: il pulsante Movimento mostra solo il
  riepilogo.

## 9. Boss e Boss Actions

- [ ] **9.1** Azioni leggendarie: modifica A e R, valore corrente e massimo.
  Atteso: si ripristinano secondo il flusso del combattimento.
- [ ] **9.2 (MC)** Sul player, controlla i dettagli del boss. Atteso: sono
  quelli consentiti da `playerView.bossDetails`.
- [ ] **9.3** Apri la console **Boss Actions** su un Epic Boss. Atteso: la
  finestra si apre; le azioni del profilo sono elencate e i costi sono
  corretti.
- [ ] **9.4 (MAP, DRAG)** Esegui un'azione ad area dalla console. Atteso:
  - la geometria si posiziona;
  - i bersagli vengono selezionati;
  - i TS sono richiesti;
  - danni e condizioni sono applicati con una sola voce di Undo.
- [ ] **9.5 (MAP)** Aura del boss e TS sul bordo: muovi un PG dentro e fuori
  l'aura. Atteso: i reminder di ingresso e uscita compaiono una sola volta.
- [ ] **9.6 (PERS)** Ricarica dopo aver usato delle azioni. Atteso: usi e
  ricariche delle azioni restano.

## 10. Cronologia e log di combattimento

- [ ] **10.1** Esegui 5 operazioni e annullane 3 in blocco dalla Cronologia.
  Atteso: lo stato torna corretto; il log registra gli annullamenti senza
  riscrivere il passato.
- [ ] **10.2** Esporta il log in TXT e in JSON. Atteso: entrambi i file si
  scaricano e sono leggibili.
- [ ] **10.3** Aggiungi una nota manuale; avvia un nuovo log; cancella il log
  confermando. Atteso: i tre comandi funzionano.
- [ ] **10.4 (PERS)** Ricarica il GM. Atteso: il log resta.
- [ ] **10.5 (PERS)** Apri il log da un altro browser. Atteso: il log non è
  presente, perché è locale al browser per design.
- [ ] **10.6 (MC)** Il player esegue un'azione consentita, per esempio
  muovere il proprio token. Atteso: il log del GM la registra correttamente.

## 11. Clock

- [ ] **11.1** Crea un clock per ogni numero di segmenti (4, 6, 8, 12) e per
  ogni colore. Atteso: rendering corretto.
- [ ] **11.2** Su un clock: incrementa, decrementa, azzera, rinomina,
  riordina, elimina. Atteso: ogni comando funziona.
- [ ] **11.3 (MC)** Nascondi un clock ai player. Atteso: il client player non
  lo vede e la finestra si ridimensiona sui clock visibili.
- [ ] **11.4 (DRAG, VIS)** Trascina la finestra e passa da esteso a compatto.
  Atteso: posizione e modalità restano.
- [ ] **11.5 (PERS)** Cambia scena. Atteso: i clock appartengono alla scena;
  tornando indietro sono intatti.

## 12. Quota e distanza 3D

- [ ] **12.1 (MAP)** Imposta una quota +6 m e una −3 m. Atteso: l'etichetta
  mostra direzione e valore; è leggibile e non copre la barra HP.
- [ ] **12.2 (DRAG)** Distanza 3D tra due token 1×1 adiacenti in diagonale.
  Atteso: 1,5 m.
- [ ] **12.3 (DRAG)** Distanza da un token 2×2. Atteso: misurata dal bordo
  più vicino, non dal centro.
- [ ] **12.4** Due token a 9 m planari, uno a +12 m di quota. Atteso: 15 m.
- [ ] **12.5 (PERS)** Ricarica. Atteso: le quote restano.

## 13. Targeting AoE e zone

- [ ] **13.1 (DRAG, MAP)** Disegna cerchio, quadrato, cono, linea e
  rettangolo. Atteso:
  - la misura in metri si vede durante il trascinamento;
  - l'aggancio a centro e vertici delle caselle funziona.
- [ ] **13.2 (VIS)** Cerchio e cono. Atteso: la sagoma segue le caselle
  coperte anche parzialmente (metodo Template); la silhouette interna è
  leggibile.
- [ ] **13.3 (DRAG)** Sposta un'area già creata. Atteso: i bersagli
  intersecati si aggiornano.
- [ ] **13.4** Dal menu contestuale dell'area: **Riseleziona bersagli**.
  Atteso: la selezione si aggiorna.
- [ ] **13.5 (PERS)** **Aspetto area**: cambia colori, opacità e spessore,
  poi ricarica. Atteso: lo stile resta per le nuove aree.
- [ ] **13.6 (DRAG, MAP)** Zona persistente con trigger di ingresso e uscita.
  Muovi un token attraverso la zona. Atteso: i reminder compaiono al momento
  giusto, una sola volta.
- [ ] **13.7 (DRAG, MAP)** Aura o zona mobile: muovi la sorgente. Atteso: la
  zona la segue.

## 14. Etichette ed elementi sulla mappa

- [ ] **14.1 (DRAG, MAP)** Prova a trascinare barra HP, nome, «Turno di…»,
  `C`, pill e quota. Atteso: sono tutti bloccati.
- [ ] **14.2 (VIS)** Zoom molto vicino e molto lontano. Atteso: gli elementi
  si adattano e non si sovrappongono in modo illeggibile.
- [ ] **14.3 (PERS, MAP)** Ricarica 3 volte di seguito. Atteso: nessun
  elemento duplicato. Per controllare: seleziona tutto e verifica il
  conteggio.
- [ ] **14.4 (MAP)** Elimina un token in iniziativa. Atteso: barre, pill ed
  etichette collegate spariscono.
- [ ] **14.5 (MAP)** Nascondi un token (visibilità OBR). Atteso: sul player
  non restano elementi derivati visibili.
- [ ] **14.6 (MAP)** Opzione `map.hpBars` disattivata. Atteso: le barre
  spariscono senza toccare gli HP.

## 15. Opzioni

- [ ] **15.1 (MC)** Il GM cambia un'opzione room, per esempio la visibilità
  HP dei nemici. Atteso: il player si aggiorna senza ricaricare.
- [ ] **15.2 (PERS)** Cambia un'opzione locale e ricarica. Atteso: resta su
  questo browser e non cambia sull'altro.
- [ ] **15.3 (PERS)** Override di scena. Atteso: vale solo nella scena
  corrente.

## 16. Capacità di classe sul tavolo reale

- [ ] **16.1 (MAP, MC)** Aura di Protezione del Paladino. Atteso:
  - si applica agli alleati entro il raggio;
  - segue il paladino quando si muove;
  - termina se il paladino è privo di sensi.

  L'harness non esegue il controller background delle aure.
- [ ] **16.2 (MAP)** Aura di Alacrità (1,5 m). Atteso: +3 m di velocità solo
  agli alleati adiacenti; al 18° livello il raggio è 4,5 m.
- [ ] **16.3 (MC)** Presenza Conquistatrice su 2 bersagli. Avanza fino a fine
  turno di ciascuno. Atteso: popup TS Saggezza con la CD incantesimi del
  paladino. Con TS superato la pill sparisce; con TS fallito resta.
- [ ] **16.4** Runa del Fuoco. Atteso: all'inizio del turno del bersaglio il
  box danni 2d6 fuoco; alla fine il TS Forza, senza CD mostrata.
- [ ] **16.5 (PERS)** Spendi usi da più pool (Ki, Superiorità, Incanalare
  Divinità), poi ricarica e cambia scena. Atteso: i contatori restano.
- [ ] **16.6 (MAP)** Pill con volo, per esempio Marea Avvolgente. Atteso: il
  tracker movimento offre la modalità volo finché la pill è attiva.
- [ ] **16.7** Capacità «Conferma consumo» e carte descrittive. Atteso: le
  carte non applicano effetti; «Conferma consumo» scala solo il pool.

## 17. Pannelli recenti

- [ ] **17.1** Reminder di concentrazione: danno a un caster concentrato.
  Atteso: il reminder mostra la CD corretta (10 o metà danno).
- [ ] **17.2 (MAP)** Aure personalizzate:
  1. crea un'aura su un token;
  2. applica un preset a più token;
  3. modifica l'aura;
  4. eliminala.

  Atteso: nessun residuo sulla mappa.

## 18. Robustezza multi-client e prestazioni

- [ ] **18.1 (MC)** GM con il tracker aperto in due schede dello stesso
  browser. Avanza turni e modifica HP da una sola scheda. Atteso: l'altra si
  allinea; nessuna voce di History duplicata.
- [ ] **18.2 (MC)** Due dispositivi GM attivi insieme. Fuori contratto: il
  contratto prevede un solo GM autorevole. Annota solo se si perdono dati.
- [ ] **18.3 (MC)** Il client player perde la rete per 30 s e si riconnette.
  Atteso: si riallinea a turno, HP e condizioni correnti.
- [ ] **18.4 (PERF)** Scena con 30 token in iniziativa, ciascuno con 3–4
  condizioni. Atteso: avanzare i turni resta fluido (< 0,5 s percepiti); lo
  zoom non scatta.
- [ ] **18.5 (PERS)** Partita lunga: 10 round con molte operazioni, poi
  ricarica. Atteso: la History resta consultabile; nessun errore
  `metadata too large` in console.

---

## Anomalie riscontrate

| Voce | Descrizione | Riproducibile | Priorità proposta |
| --- | --- | --- | --- |
| | | | |
