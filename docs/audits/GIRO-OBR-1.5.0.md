# Giro in OBR prima della 1.5.0 — checklist combinata

Lotto 7.4 del [piano di polishing](../PIANO_POLISHING_UI.md). Un solo elenco per il giro manuale in una stanza Owlbear Rodeo reale prima del rilascio. Mette insieme:

- **A.** i flussi nuovi o cambiati nelle fasi 3–6, che l'anteprima ha verificato solo con l'SDK simulato;
- **B.** i punti rimasti aperti con la nota "da provare in OBR" e i controlli della fase 0b;
- **C.** le voci di [SMOKE-CHECKLIST-MANUALE.md](SMOKE-CHECKLIST-MANUALE.md) che toccano le parti cambiate, con l'esito atteso aggiornato dove il polishing lo ha cambiato.

Le altre voci della smoke checklist non toccano il polishing: restano per un giro completo, quando vuoi.

## Preparazione

**Build da provare.** Le correzioni recenti (sottomenu del token, cassetti, condizioni rapide) non sono ancora in `dist/`. Prova il codice di `main`:

1. `npm run dev`;
2. nella stanza di prova installa `http://localhost:5173/manifest.json` al posto della versione pubblicata.

**Due client**, come al tavolo:

- finestra GM sul laptop;
- finestra giocatore in incognito sullo schermo HDMI.

**Scena di prova:**

- 3 PG; su uno configura almeno un'azione rapida, un incantesimo e un attacco, così compare la colonna ⚡ 🪄 🗡️;
- un PG con almeno 5 condizioni o effetti, per i cassetti;
- un Epic Boss con token collegati (per esempio Auril) e un PG con evocazioni;
- 4 nemici omonimi, per esempio «Goblin», e un boss Paragon;
- due creature con la stessa iniziativa, una delle quali è un PG seguito da un'Azione epica.

**Come annotare l'esito:** `[x]` OK, `[!]` anomalia (descrivila in fondo), `[-]` non eseguita. **(MC)** vuol dire che servono i due client.

| Data | Commit | Esito |
| --- | --- | --- |
| | | |

---

## A. Flussi nuovi o cambiati

### A1. Barra compatta (GM)

- [ ] **A1.1** La barra resta alta uguale con tutto aperto: nessun elemento cresce verso il basso.
- [ ] **A1.2** Il **Round** è nella colonna sinistra, dentro la barra, non in una linguetta staccata. **(MC)** Il giocatore lo vede.
- [ ] **A1.3** Menu `…`:
  - contiene Reset round, Cronologia, Aggiungi attori, Compila iniziativa, Etichette mappa, Opzioni, Svuota iniziativa;
  - si chiude con un clic fuori.
- [ ] **A1.4** Pannello destro: tutti i pulsanti sono interi, con l'etichetta sotto l'icona, e il badge "LOCALE" non copre niente. Era il bug della fase 0b.
- [ ] **A1.5** Card con azioni configurate:
  - la colonna ⚡ 🪄 🗡️ sta a destra del ritratto e non si sovrappone all'icona della scheda;
  - sull'Epic Boss la colonna parte sotto la "E".
- [ ] **A1.6** Un clic sull'icona blu della scheda (sotto l'iniziativa) apre la scheda personaggio in un clic.
- [ ] **A1.7** Una creatura a 0 PF ha il badge **KO** sul ritratto, e il ritratto si attenua.

### A2. Cassetti laterali

- [ ] **A2.1** Cassetto degli effetti:
  - un clic su `+N` o sulla prima etichetta lo apre accanto alla card, con le etichette in colonne della stessa misura di quella della card;
  - un nuovo clic sull'etichetta lo chiude;
  - non c'è più la freccia di chiusura.
- [ ] **A2.2** Linguetta dei compagni:
  - un clic apre a destra le righe dei token collegati e delle evocazioni, con i PF;
  - le card successive scorrono a destra.
- [ ] **A2.3** È aperto un cassetto alla volta, e resta aperto mentre scorri la barra.
- [ ] **A2.4** *Da provare in OBR:* con molte card e cassetti aperti, vicino alla larghezza massima (circa 1180px), la barra non esce dallo schermo e si può scorrere fino in fondo.
- [ ] **A2.5** *Da provare in OBR:* con un cassetto aperto **prima** della card attiva, avanzando il turno la barra centra comunque la card attiva.

### A3. Modifica in linea

- [ ] **A3.1** HP nella card compatta:
  - un clic sul testo HP lo rende modificabile; il testo resta al suo posto, tutto bianco, con i numeri sottolineati; un clic sulla barra non fa niente;
  - prova un valore, un delta (`-7`, `+5`), **Esc** e **Tab**;
  - **(MC)** la barra HP sulla mappa si aggiorna insieme, anche sul giocatore.
- [ ] **A3.2** HP a riposo nella card compatta: tutto bianco, con lo stesso peso per attuali e massimi.
- [ ] **A3.3** Iniziativa nella card compatta (solo GM):
  - un clic sul badge lo rende modificabile;
  - **Invio** salva, riordina le card e passa alla card successiva.
- [ ] **A3.4** **Compila iniziativa** dal menu `…`:
  - si apre in fila sulle creature da compilare, con il bordo tratteggiato;
  - **Invio** o **Tab** passa alla successiva, **Ctrl+Invio** chiude;
  - alla fine le card si riordinano.
- [ ] **A3.5** **(MC)** Sul giocatore, HP e iniziativa non si aprono in modifica.

### A4. Annulla al posto delle conferme

- [ ] **A4.1** **Svuota iniziativa**:
  - agisce subito, senza conferma, e compare l'avviso "Iniziativa svuotata · Annulla" per 8 secondi;
  - **Annulla** rimette ordine, turno attivo, round e token in iniziativa;
  - **(MC)** sulla mappa tornano barre ed etichette, anche sul giocatore.
- [ ] **A4.2** **Reset round**: stesso avviso; **Annulla** rimette il round precedente.
- [ ] **A4.3** Avanza il round mentre l'avviso è aperto, poi premi **Annulla**. Atteso: non sovrascrive niente e lo segnala.

### A5. Condizioni rapide

- [ ] **A5.1** Clic destro sulla card → **Condizioni** ›:
  - compare la griglia delle 13 condizioni, senza Pietrificato né Ira;
  - un clic applica o toglie la condizione e chiude il menu;
  - in fondo, **Tutte le condizioni…** apre la finestra completa.
- [ ] **A5.2** Clic destro sui token della mappa → **Condizioni…**:
  - *da provare in OBR:* la griglia compare in fretta (prima il sottomenu era vuoto o lento) e la larghezza è giusta;
  - il sottomenu resta aperto dopo ogni clic;
  - **Danno/cura…** non c'è più.
- [ ] **A5.3** Gruppo misto (alcuni token con la condizione, altri no):
  - il pulsante ha un bordo leggero;
  - un clic aggiunge la condizione a chi non ce l'ha; un altro clic la toglie a tutti.
- [ ] **A5.4** Ogni clic è una voce della Cronologia, che si può annullare.
- [ ] **A5.5** **(MC)** Il giocatore non ha né il sottomenu né le condizioni rapide.

### A6. Turno da tastiera e riordino a pari merito

- [ ] **A6.1** Dopo un clic su una card, **Spazio** o **→** avanza il turno e **←** torna indietro.
  - I tasti non scattano mentre scrivi in un campo, con un editor aperto o in Compila iniziativa.
  - Dopo un clic sulla mappa, i tasti tornano a OBR. È un limite noto.
- [ ] **A6.2** Maniglia **⠿** a pari merito:
  - compare al passaggio del mouse, fuori dal bordo destro nella vista estesa e in basso a sinistra in quella compatta;
  - trascinandola, l'ordine cambia e resta;
  - avanzando, il turno segue il nuovo ordine.
- [ ] **A6.3** Riordinando un PG seguito da un'Azione epica, l'Azione epica si sposta con lui.
- [ ] **A6.4** All'iniziativa 20 i Boss Epici restano in testa al pari merito e non si scavalcano.

### A7. Vista estesa (classica)

- [ ] **A7.1** Espandendo le etichette con `+`, la terza riga non copre più la card successiva. Era il bug 5.2 della fase 0b.
- [ ] **A7.2** La linguetta "Azione Epica" non finisce sulle etichette della card precedente, anche quando quella card è attiva.
- [ ] **A7.3** Icone accanto agli HP (reazione, scheda, ±):
  - subito dopo il valore, senza buchi;
  - non toccano la barra HP.
- [ ] **A7.4** **Svuota iniziativa** (×) è in fondo all'intestazione, separato e in rosso.

### A8. Lingua e testi

- [ ] **A8.1** Nei pannelli più usati non restano termini inglesi del glossario:
  - Cronologia (schede "Registro" e "Cronologia");
  - Opzioni ("Stanza", "Registro combattimento", "Promemoria");
  - console effetti, Condizioni, Incantesimi.
- [ ] **A8.2** Le notifiche di OBR (aggiunta di token, errori) sono in italiano e senza caratteri corrotti ("può", "è").

---

## B. Punti aperti

- [ ] **B1** *(da 0.2 e 5.8)* **(MC)** Vista compatta del giocatore con "Dimensione tracker" al 150% nelle opzioni della stanza:
  - la barra è intera sullo schermo del tavolo;
  - niente testo tagliato;
  - il badge "LOCALE" non copre i pulsanti.
- [ ] **B2** *(da 5.3)* Avvisi compatti di zona e di tiro salvezza: il testo, ora a 10px minimo, non allunga troppo le schede e non viene tagliato.
  - Prova una zona con trigger di ingresso e una spell con TS a fine turno, per esempio Blocca Persone.
- [ ] **B3** *(da 0b, 5.3)* Il popover degli effetti non esiste più: al suo posto c'è il cassetto. Controlla che niente esca dallo schermo, con la barra vicina al bordo destro e al bordo basso.
- [ ] **B4** *(da 0b, 5.6)* Il menu `…` si chiude sempre: clic fuori, **Esc**, scelta di una voce.
- [ ] **B5** *(da 0b, 5.1)* Compila iniziativa nella vista compatta apre l'editor sulla card compatta, non su una card nascosta.
- [ ] **B6** *(segnalato in 6.7)* Il segnale "pronto" dell'estensione non è lento in modo evidente all'apertura della stanza (prova con la build di `main`).

---

## C. Voci della smoke checklist

I numeri sono quelli di [SMOKE-CHECKLIST-MANUALE.md](SMOKE-CHECKLIST-MANUALE.md). Dove il polishing ha cambiato l'esito atteso, qui c'è quello nuovo.

**Caricamento**
- [ ] **0.1** Tracker apribile in pochi secondi, nessun errore in console.
- [ ] **0.2** **(MC)** Sul giocatore il tracker si apre da solo (voluto per lo schermo del tavolo).
- [ ] **0.3** Ricariche ripetute, anche con throttling «Fast 3G»: nessuna finestra resta bianca. Includi il sottomenu **Condizioni…** del token.

**Scena e vista**
- [ ] **1.1** **(MC)** Aggiungi all'iniziativa dal menu del token: la card compare sui due client con il colore della fazione.
- [ ] **1.2** **(MC)** Sul giocatore, nessuna voce riservata al GM nel menu del token, comprese **Condizioni…**.
- [ ] **2.1** Da Esteso a Compatto e ritorno: nessuna card persa, turno attivo evidenziato in entrambi.
- [ ] **2.2** Trascina la barra compatta dalla maniglia nella colonna sinistra, poi ricarica: la posizione resta.
- [ ] **2.3** **(MC)** HP visibili sul giocatore secondo la tabella della smoke checklist; dove sono nascosti, niente testo o barra vuoti.
- [ ] **2.4** **(MC)** Sul giocatore nessun controllo di regia interattivo: HP, iniziativa, frecce, maniglie, menu della card.

**Card e turni**
- [ ] **3.2** Gruppo «Goblin» collassato: si espande quando il turno entra e si richiude quando esce.
- [ ] **3.3** *Aggiornata:* riordino a pari merito con la maniglia ⠿ (vedi A6.2).
- [ ] **3.4** Azioni rapide dalla colonna ⚡: incantesimo su un bersaglio eseguito subito; condizione su più bersagli apre il pannello precompilato.
- [ ] **4.1** **(MC)** Una sola etichetta **Turno di…**, sopra il token attivo; si sposta a ogni turno e il giocatore la vede.
- [ ] **4.2** Glow e colore di fazione sul turno attivo, senza sfarfallio.
- [ ] **4.3** Turno precedente oltre il confine del round: il round torna indietro.
- [ ] **4.4** *Aggiornata:* **Focus token** (prima "Follow") centra o segue il token attivo.
- [ ] **4.5** **Tana**: la voce a iniziativa 20 compare e si attraversa con le frecce e con i tasti.
- [ ] **4.6** Paragon con 2 turni, poi Epic Boss: voci virtuali nell'ordine, HP condivisi, nessun token duplicato sulla mappa.
- [ ] **4.9** **(MC)** Il GM avanza il turno: il giocatore si aggiorna entro un secondo circa.
- [ ] **4.10** *Aggiornata:* Reset round e Svuota iniziativa senza conferma, con l'avviso **Annulla** (vedi A4). Dopo 8 secondi senza annullare: nessun residuo sulla mappa (etichette, barre, pill).

**HP ed effetti**
- [ ] **5.1** **(MC)** HP modificati dalla card, nelle due viste: la barra sulla mappa si aggiorna sui due client.
- [ ] **5.2** *Aggiornata:* **Console effetti manuali** (prima "Console HP rapida"), aperta da **Effetti**.
  1. Scheda **Danno**: 20 su 3 bersagli con `×2`, `1` e `½`.
  2. Controlla l'anteprima e applica.
  3. Annulla una volta.

  Atteso: valori corretti, una sola voce di annullamento, che ripristina tutti e tre.
- [ ] **5.4** Danno a un incantatore in concentrazione: compare l'avviso di TS.
- [ ] **5.5** Memoria HP dei PG: HP parziali, rimuovi dall'iniziativa, riaggiungi. Gli HP tornano.
- [ ] **5.6** ± sugli HP massimi: valori coerenti nella card e sulla barra mappa.

**Condizioni e incantesimi**
- [ ] **6.1** Condizione applicata dalla card, dal menu del token o dalla finestra: la pill compare ancorata al token.
- [ ] **6.5** Condizione a fine turno e una di 2 round: scadono al momento giusto.
- [ ] **7.1** Incantesimo a concentrazione: `C` sulla card e sul token.
- [ ] **7.2** **(MC)** Interrompi la concentrazione di una spell con zona o aura: spariscono zone, aure, pill e condizioni figlie, anche sul giocatore.
- [ ] **7.3** **(MC)** Blocca Persone, fino al turno del bersaglio: il GM vede il promemoria con caratteristica, CD e caster; il giocatore lo vede senza pulsanti.

**Boss, cronologia, mappa, opzioni**
- [ ] **9.3** Console **Boss Actions** su un Epic Boss: si apre con le azioni e i costi giusti.
- [ ] **10.1** 5 operazioni (anche condizioni rapide e modifiche in linea), poi annullane 3 in blocco dalla Cronologia: lo stato torna corretto.
- [ ] **14.3** Ricarica 3 volte di seguito: nessun elemento duplicato sulla mappa.
- [ ] **15.1** **(MC)** Il GM cambia la visibilità HP dei nemici: il giocatore si aggiorna senza ricaricare.
- [ ] **18.1** GM con il tracker in due schede: avanza turni e modifica HP da una sola; l'altra si allinea, nessuna voce di Cronologia duplicata.

---

## Anomalie riscontrate

| Voce | Descrizione | Riproducibile | Blocca il rilascio? |
| --- | --- | --- | --- |
| | | | |
