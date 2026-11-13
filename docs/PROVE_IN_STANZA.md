# Prove in stanza

Questa è la lista unica delle prove in stanza ancora da fare: da oggi si spunta qui. I file `PROVA_STANZA_*.md`, i piani e gli audit restano come dettaglio, con la preparazione completa, le note del banco e il perché di ogni controllo. Ogni sezione dice da dove vengono le sue voci. Una prova che compariva in due fonti qui c'è una volta sola, con tutte e due le fonti.

**Il tavolo.** Un solo laptop: la finestra del GM e, sullo schermo HDMI del tavolo, la finestra dei giocatori in Chrome in incognito, entrata nella stessa stanza. Tienile affiancate quando una prova guarda tutte e due. Ogni prova del tracker va fatta in vista compatta e in vista estesa.

**La build.** Render è più indietro di `main`: si prova con la build locale (`npm run dev`) e **Take Initiative! (LOCALE)**, nella room di prova **Auril (Testbench)**. Dopo l'avvio ricarica tutte e due le finestre.

**Come si segna.** Una x su ciò che va. Per ciò che non va scrivi sotto, in una riga, che cosa hai visto, con la vista (compatta o estesa) e la finestra (GM o tavolo).

**Le voci nuove.** Una voce che finisce con «(voce nuova: …)» non aveva ancora una lista: è scritta da ciò che la fonte dice della funzione. «Memoria» indica le note di lavoro del progetto. Una voce presa da un'altra lista, o con un esito cambiato dopo, ha una nota in corsivo alla fine.

**Fuori dalla lista.** Calmare emozioni, tolto dal backlog l'11/11 perché si gestisce al tavolo; tutto ciò che riguarda Auril e la campagna di Icewind Dale, chiusa l'08/11; le prove che le fonti danno già per fatte o scartate.

## Indice

| Sezione | Voci |
| --- | ---: |
| **A. Incantesimi** | **144** |
| A1. Il vetro e la lettura | 10 |
| A2. Le punizioni | 6 |
| A3. Gli attacchi degli incantesimi | 7 |
| A4. Aree e zone | 10 |
| A5. La scelta del turno e Controincantesimo | 5 |
| A6. Il trascinamento | 4 |
| A7. Impulso di Magia Selvaggia | 6 |
| A8. Console attacchi e mostri importati | 8 |
| A9. Più aree in un lancio e Minuscole meteore | 10 |
| A10. Due caselle per i danni a due tipi | 3 |
| A11. Teletrasporti (CAP-TELEPORT) | 11 |
| A12. Muri e colonne (CAP-STRUCTURE) | 14 |
| A13. Azioni da un altro punto (CAP-ORIGIN) | 12 |
| A14. PF tra due creature, 700 PF da ripartire, la sfera che trasporta (CAP-RELATION, CAP-ALLOCATION, CAP-CARRIAGE) | 21 |
| A15. PF temporanei (CAP-TEMP) | 6 |
| A16. Stabilizzare e riportare in vita (CAP-STABILIZE) | 4 |
| A17. Tre incantesimi singoli e il terreno (CAP-DURATION, CAP-MODE, CAP-REPEAT-HEAL, CAP-TERRAIN) | 7 |
| **B. Console attacchi, mostri e capacità** | **111** |
| B1. Pannello attacchi, lotti 1–5 | 27 |
| B2. Pannello attacchi dopo la prova dell'utente | 15 |
| B3. Console Boss (lotto 7) | 8 |
| B4. Velocità dei mostri | 29 |
| B5. Dimensione del token | 10 |
| B6. Difese contro le armi non magiche | 11 |
| B7. Difese dalle capacità di classe | 7 |
| B8. Attacchi dei mostri: ciò che il banco non copre | 4 |
| **C. Tracker e UX** | **21** |
| C1. Testata, maniglia e compilazione | 5 |
| C2. Lotto U11 | 4 |
| C3. Riposo del gruppo (U6′) | 3 |
| C4. Animazioni dei gruppi (U13) | 2 |
| C5. PF e console (U1, U3, U4) | 5 |
| C6. Menu della card (U2) | 2 |
| **D. Avvisi, registro e gioco online** | **24** |
| D1. Avvisi di reazione | 13 |
| D2. Registro delle schede nella stanza | 3 |
| D3. Gioco online | 6 |
| D4. Dadi online | 2 |
| **E. Verifiche guidate: bugfix e fluidità** | **11** |
| E1. Verifica del bugfix (L23) e controlli a mano | 8 |
| E2. Fluidità e misure, facoltative | 3 |
| **F. Giro generale prima della 1.5.0** | **73** |
| F1. Flussi nuovi o cambiati | 33 |
| F2. Punti aperti | 6 |
| F3. Voci della smoke checklist | 34 |
| **G. Smoke completo, facoltativo** | **78** |
| G1. Scena, card e turni | 10 |
| G2. PF, condizioni e incantesimi | 11 |
| G3. Movimento, boss, cronologia e clock | 21 |
| G4. Quota, aree, mappa e opzioni | 19 |
| G5. Capacità di classe, pannelli e robustezza | 17 |
| **Totale** | **462** |

## A. Incantesimi

Fonte: [PROVA_STANZA_INCANTESIMI.md](PROVA_STANZA_INCANTESIMI.md), che raccoglie P5 del [piano di polishing degli incantesimi](PIANO_POLISH_INCANTESIMI.md), le prove dell'[audit dei popup viola](AUDIT_UX_POPUP_VIOLA.md) e quelle del [piano di automazione](PIANO_AUTOMAZIONE_INCANTESIMI.md). Le sezioni da A1 ad A14 sono le sezioni 1–14 di quella lista; A15, A16 e A17 sono capacità che non avevano una lista.

In scena servono:

- un PG incantatore con gli slot;
- un paladino per le punizioni;
- due o tre goblin ostili, uno dei quali resistente al tuono e al fuoco (scheda → difese).

### A1. Il vetro e la lettura

Fonte: [PROVA_STANZA_INCANTESIMI.md](PROVA_STANZA_INCANTESIMI.md), sezione 1; le stesse prove in [AUDIT_UX_POPUP_VIOLA.md](AUDIT_UX_POPUP_VIOLA.md) (V1–V4 e la tela nera di Fazioni e Aspetto area). Fatto il 05/11 e il 06/11.

- [ ] **Tinta:** una punizione, un'area e Mano arcana, anche su una mappa chiara. Il viola è giusto, e il testo si legge dallo schermo del tavolo.
- [ ] **Angoli:** nessun quadrato nero agli angoli dei popup, nessuna fascia nera sotto Controincantesimo. Anche fuori dai popup viola: **Opzioni → Fazioni automatiche → Gestisci**, che mostra i suoi due pulsanti in fondo senza scorrere, e **Aspetto area** nello strumento delle aree.
- [ ] **Colori:**
  - gli esiti sono `Fallito` rosso, `Superato` verde, `Immune` blu;
  - i pulsanti sono rossi se registrano danni (`Risolvi`), blu se no (`Cura`, `Lancia`).
- [ ] **Testata:**
  - il lanciatore sta sotto il titolo;
  - il costo ha il suo tag, arancione per l'azione bonus e verde per l'azione;
  - un comando del GM, come Muro prismatico, non ha tag.
- [ ] **CD:** un TS dice `TS Forza CD N` con la CD del PG; un PG senza CD sulla scheda dice solo `TS Forza`.
- [ ] **Altezze:** sulle tue mappe e sul tuo schermo, qualche popup ti sembra troppo vuoto o troppo stretto? Si cambiano tutte in un punto solo.
- [ ] **Le azioni nel pannello:** fra gli **Incantesimi attivi sul campo**, sotto ogni azione il costo è in italiano e una volta sola, e il testo non si ripete. Freccia Folgorante e Raffica di Spine non dicono `Azione bonus`, né nel pannello né nel popup.
- [ ] Una punizione: `Bersaglio` con i PF, `Tuono 2d6` accanto al campo. *(AUDIT_UX_POPUP_VIOLA.md, V3; il resto della stessa prova è in Testata e CD)*
- [ ] Un attacco con il menu: il bersaglio una volta sola, con i PF nelle voci. *(AUDIT_UX_POPUP_VIOLA.md, V3)*
- [ ] Telecinesi: una sola frase che chiede la creatura. *(AUDIT_UX_POPUP_VIOLA.md, V3)*

### A2. Le punizioni

Fonte: [PROVA_STANZA_INCANTESIMI.md](PROVA_STANZA_INCANTESIMI.md), sezione 2; le stesse prove in [AUDIT_UX_POPUP_VIOLA.md](AUDIT_UX_POPUP_VIOLA.md) (V11 e F1). Fatto il 05/11.

- [ ] **Al turno:** lancia una punizione. Il popup compare accanto al caster al suo turno, sparisce quando il turno passa e torna quando torna il turno.
- [ ] **Spostato:** trascinalo dalla testata, poi muovi il token: resta dov'è. Chiuso con la ×, non torna fino al turno dopo.
- [ ] **Riga fissa:** mentre scegli bersaglio, esito e danno il popup non cambia altezza. La riga in fondo dice che cosa manca, poi `Danni N`.
- [ ] **Difesa:** Punizione Tonante sul goblin resistente al tuono.
  - Prima del danno compare `Res. tuono`.
  - Con 9 scritto, la riga dice `Res. tuono: 9 → 4` e `Danni 4`, e i PF scendono di 4.
  - Se scrivi il danno già dimezzato, un clic sul chip lo ignora.
- [ ] **Registro:** dopo quel danno, il registro di combattimento dice che la resistenza ha contato.
- [ ] **Fuori turno:** una punizione su un attacco di opportunità. Pannello incantesimi → **Incantesimi attivi sul campo** → **Risolvi** → il bersaglio sulla mappa → **Apri risoluzione**.

### A3. Gli attacchi degli incantesimi

Fonte: [PROVA_STANZA_INCANTESIMI.md](PROVA_STANZA_INCANTESIMI.md), sezione 3; le stesse prove in [AUDIT_UX_POPUP_VIOLA.md](AUDIT_UX_POPUP_VIOLA.md) (V10 e «Freccia Folgorante e Critico»). Fatto il 05/11 e il 06/11.

- [ ] **Corona di Stelle:** `Colpito`, il numero, `Invio`. È comodo, o ti manca il clic secco? Dopo `Colpito`, il cursore va da solo nel danno?
- [ ] **Mancato:** si applica senza numero, la riga dice `Danni 0` e la stella si consuma.
- [ ] **Annulla:** dalla Cronologia, dopo un colpo di Corona di Stelle, tornano i PF e la stella.
- [ ] **Armi evocate:** Spada arcana o Arma spirituale dalla scheda del token. Il pulsante dice `Attacco`.
- [ ] **Critico:** su Arma spirituale o Corona di Stelle c'è `Critico`, e accanto al danno compaiono i dadi raddoppiati (`1d8 · critico 2d8`). Su un PG a 0 PF segna due fallimenti.
- [ ] **Lama del Disastro:** due attacchi, uno mancato e uno con un danno di due cifre. Le cifre restano tutte e due, e `Danni` in fondo fa il totale.
- [ ] **Fuori gittata:** sposta il bersaglio lontano prima di premere il pulsante. Il messaggio rosso resta e dice che il bersaglio è fuori gittata.

### A4. Aree e zone

Fonte: [PROVA_STANZA_INCANTESIMI.md](PROVA_STANZA_INCANTESIMI.md), sezione 4; le stesse prove in [AUDIT_UX_POPUP_VIOLA.md](AUDIT_UX_POPUP_VIOLA.md) (V4, V5, V6, V8, «Freccia Folgorante e Critico» e Coltello di Ghiaccio). Fatto tra il 05/11 e il 06/11.

- [ ] **Un'area con molte creature:**
  - compaiono `Posiziona area`, poi `Area confermata: N creature colpite.`;
  - ogni riga ha i PF, e il danno sta sopra l'elenco;
  - l'elenco scorre e il pulsante resta in vista.
- [ ] **Un TS su una creatura resistente:** il chip sta sotto il totale, accanto al pulsante.
- [ ] **Muro prismatico:**
  - le sette righe si leggono;
  - il totale torna con quello che ti aspetti, anche con una resistenza.
- [ ] **Terremoto fino in fondo:** `Numero di fessure`, la fessura, `Profondità`, gli esiti. Al banco non si riesce a disegnare una fessura valida.
- [ ] **Una fessura messa male:** il messaggio dice di riposizionarla, in parole.
- [ ] **Raffica di Spine o Freccia Folgorante:** l'esplosione si ancora al bersaglio, e l'elenco compare.
- [ ] **Coltello di Ghiaccio:** **Esito dell'attacco** sopra l'elenco. Con `Colpito` compare `Colpo · 1d10 perforanti`, con `Mancato` no. Il bersaglio prende colpo ed esplosione, gli altri solo l'esplosione, e chi supera il TS niente. Un solo Annulla.
- [ ] **Il colpo di Freccia Folgorante:**
  - selezionato il bersaglio, sopra l'esplosione compare il suo colpo: `Colpito`, `Critico`, `Mancato` e `Colpo 4d8`;
  - su un bersaglio resistente al fulmine il chip dice `18 → 9`, e con `Mancato` `9 → 4`;
  - **Risolvi freccia** scrive colpo ed esplosione, e un solo Annulla dalla Cronologia li toglie tutti e due.
- [ ] **Palla di fuoco ritardata con quattro creature:**
  - la riga in fondo guida fino a `Danni N`;
  - su una creatura resistente al fuoco c'è il chip, e un clic la ignora;
  - con il popup aperto mentre la perla cresce, i dadi accanto a `Fuoco` restano giusti.
- [ ] Un'area: scegliendo bersaglio, esito e danno il popup non cambia mai altezza, e la riga in fondo dice che cosa manca. *(AUDIT_UX_POPUP_VIOLA.md, V4; la stessa prova per la punizione è in A2)*

### A5. La scelta del turno e Controincantesimo

Fonte: [PROVA_STANZA_INCANTESIMI.md](PROVA_STANZA_INCANTESIMI.md), sezione 5; le stesse prove in [AUDIT_UX_POPUP_VIOLA.md](AUDIT_UX_POPUP_VIOLA.md) (V6 e V7). Fatto il 05/11.

- [ ] **Mano arcana:** l'elenco si legge dallo schermo del tavolo. Il nome del lanciatore serve?
- [ ] **Controllare Venti:** le forme brevi bastano? Il testo intero sta nel suggerimento.
- [ ] **Sguardo:** dopo aver scelto l'effetto il popup si chiude, senza messaggi rossi. Al banco si fermava su un errore del finto SDK.
- [ ] **Controincantesimo con la prova:**
  - `Contro`, `Lancia` e `Slot` si capiscono a colpo d'occhio;
  - `Lancia` come etichetta e `Lancia` come pulsante non confondono.
- [ ] **Controincantesimo su una creatura con incantesimi sulla scheda:** compare `★ in cima`, e quelli della scheda stanno in cima.

### A6. Il trascinamento

Fonte: [PROVA_STANZA_INCANTESIMI.md](PROVA_STANZA_INCANTESIMI.md), sezione 6; le stesse prove in [AUDIT_UX_POPUP_VIOLA.md](AUDIT_UX_POPUP_VIOLA.md) («Prova in stanza del trascinamento»). Fatto il 05/11.

- [ ] **Dalla testata:** Controincantesimo e Palla di fuoco ritardata si spostano.
- [ ] **Pannello chiuso:** apri un'azione dal pannello, chiudi il pannello, poi sposta il popup. Si muove, con un attimo di ritardo la prima volta, e quello che avevi scritto resta.
- [ ] **Menu ⚡:** dal menu ⚡ di una pillola, il popup e il pannello che apre si spostano anche dopo che il menu si è chiuso.
- [ ] **Mano arcana:** la sua scheda, aperta dalla riga nel tracker, si sposta.

### A7. Impulso di Magia Selvaggia

Fonte: [PROVA_STANZA_INCANTESIMI.md](PROVA_STANZA_INCANTESIMI.md), sezione 7; le stesse prove in [AUDIT_UX_POPUP_VIOLA.md](AUDIT_UX_POPUP_VIOLA.md) (V1, V2 e V9). Fatto il 05/11.

- [ ] **Fucsia:** è quello che volevi?
- [ ] **Altezza:** una riga automatica e una `Al tavolo`. Il costruttore della pillola chiuso ti va bene anche nelle righe al tavolo?
- [ ] **Testi veri:** con i testi del tuo pacchetto e il costruttore chiuso, nessuna riga fa scorrere il pannello.
- [ ] **Una volta sola:** `Applica` su una pillola, poi di nuovo. Il pulsante resta spento, e un nuovo d100 lo riaccende.
- [ ] **Cura:** `Tira 2d10`, poi `Applica`.
- [ ] **Onde di Caos spese:** la scelta si legge, e la risorsa torna.

### A8. Console attacchi e mostri importati

Fonte: [PROVA_STANZA_INCANTESIMI.md](PROVA_STANZA_INCANTESIMI.md), sezione 8; [PIANO_POLISH_INCANTESIMI.md](PIANO_POLISH_INCANTESIMI.md), P4, terzo lotto. Fatto il 05/11.

- [ ] **Importa dall'archivio un incantatore** (Mago, Sacerdote o Fanatico): **Modifica**, **Importa**, **Leggi**, **Applica al modulo**, **Salva**.
- [ ] **I suoi incantesimi d'attacco:** in console compaiono quelli del libro (Dardo di fuoco, Dardo incantato) e si risolvono con dadi e slot, senza un'azione salvata. Sopra il danno c'è `+N al tiro`.
- [ ] **Senza slot sulla scheda:** un mostro senza slot tracciati non vede «Nessuno slot libero».
- [ ] **Frusta di Spine** su un mostro con una difesa contro le armi non magiche: danno pieno.
- [ ] **CD nel pannello:** un TS lanciato dal pannello dice `Tiro salvezza: Costituzione (CD N).`
- [ ] **Tocco del vampiro:** **Lancia** finché non è attivo, poi la console passa da sola al tocco.
- [ ] **Creare Falò** da un'azione Trucchetti: si lancia nel pannello, e la console non si riapre.
- [ ] **Lama Roboante:** in un attacco con arma da mischia compare fra gli extra solo se il PG ce l'ha.

### A9. Più aree in un lancio e Minuscole meteore

Fonte: [PROVA_STANZA_INCANTESIMI.md](PROVA_STANZA_INCANTESIMI.md), sezione 9; [PIANO_AUTOMAZIONE_INCANTESIMI.md](PIANO_AUTOMAZIONE_INCANTESIMI.md), CAP-MULTIAREA. Fatto il 06/11. Tolta la voce sullo sciame della Proiezione Fatata di Auril.

Al banco ha girato lo strumento delle aree vero, ma senza la mappa di Owlbear: qui si guarda come si disegna.

- [ ] **Sciame di meteore:** **Posiziona area**, poi quattro esplosioni una dopo l'altra. Ognuna resta sulla mappa con `1/4`, `2/4`…, e la riga di stato del pannello conta quelle che mancano.
- [ ] **Togliere un'esplosione:** premi sul numero di una: sparisce, e la prossima che disegni riprende il suo numero. Con quattro esplosioni sulla mappa, una quinta non parte.
- [ ] **Una creatura in due esplosioni:** nel pannello ha una riga sola, un TS e un danno.
- [ ] **Tempesta di fuoco:** tre cubi di 3 m in fila, poi conferma. I numeri sono `1`, `2`, `3`.
- [ ] **Cubo isolato:** un cubo lontano dagli altri, poi conferma: la conferma lo rifiuta con il suo numero. Un cubo che ne tocca un altro solo d'angolo, lo stesso. Premere sull'angolo di un cubo non lo toglie.
- [ ] **Minuscole meteore:** al lancio la prima meteora; la pill del caster mostra `(5)` al 3° livello.
- [ ] **Lancia meteora:** dal ⚡ della pill, **Posiziona la meteora**, poi TS e danno: la pill scende a `(4)`. Poi una seconda meteora nello stesso turno, e una dove non c'è nessuno: si spendono tutte e due.
- [ ] **Promemoria:** al turno successivo del caster il popup della meteora si apre da solo.
- [ ] **Ultima meteora:** finisce l'incantesimo, e la `C` di concentrazione sparisce.
- [ ] **Annulla:** rimette PF e meteora.

### A10. Due caselle per i danni a due tipi

Fonte: [PROVA_STANZA_INCANTESIMI.md](PROVA_STANZA_INCANTESIMI.md), sezione 10; [PIANO_POLISH_INCANTESIMI.md](PIANO_POLISH_INCANTESIMI.md), P4, secondo lotto. Fatto il 06/11.

- [ ] **Due caselle, Colpo infuocato:** su un goblin resistente al fuoco, `Fuoco · 4d6` e `Radiosi · 4d6`. Il chip dice `Res. fuoco: N → N/2` e conta solo il fuoco; al 6° livello, sotto le caselle, `+1d6 al fuoco o ai radiosi`.
- [ ] **Due caselle, Onda distruttiva:** il selettore dice **Radiosi** o **Necrotici**, e la seconda casella ne prende il nome. La prima è `Tuono · 5d6`: controlla sul tuo manuale che i 5d6 da tuono ci siano.
- [ ] **Una casella vuota:** con una sola delle due scritta, il pulsante chiede `Inserisci il danno di tutte e due le parti`.

### A11. Teletrasporti (CAP-TELEPORT)

Fonte: [PROVA_STANZA_INCANTESIMI.md](PROVA_STANZA_INCANTESIMI.md), sezione 11; [PIANO_AUTOMAZIONE_INCANTESIMI.md](PIANO_AUTOMAZIONE_INCANTESIMI.md), CAP-TELEPORT. Fatto il 06/11.

Al banco hanno girato tutti e quattro con lo strumento finto delle aree, che non misura la gittata: qui si guardano la mappa vera, la gittata e il movimento.

- [ ] **Passo remoto:** al lancio **Posiziona destinazione**, un clic e la conferma: il token sparisce nella nebbia e ricompare sulla casella. La pill **Passo Remoto** ha la `C`. Il titolo dei bersagli dice `Passo Remoto · Solo caster`, senza passeggero; Passo velato lo stesso.
- [ ] **Gittata:** con lo strumento vero una casella oltre 18 metri non si sceglie, come per Passo velato a 9 metri.
- [ ] **Teletrasportati:** al turno successivo del caster il popup si apre da solo con **Teletrasportati di nuovo** e **Azione bonus**. **Scegli destinazione**, un clic: il token si sposta con la nebbia. Annulla lo rimette dov'era.
- [ ] **Passo del tuono:** **Posiziona area** attorno al caster, poi il blocco **Teletrasporto**. Un alleato adiacente scelto come passeggero sparisce dai bersagli del tuono. **Scegli destinazione** entro 27 metri, esiti e danno sui goblin, **Applica**: caster e passeggero spariscono e ricompaiono insieme, con il passeggero allo stesso fianco; il tuono esplode sullo spazio lasciato.
- [ ] **Annulla di Passo del tuono:** un solo Annulla rimette PF e posizioni.
- [ ] **Colpo del Vento d'Acciaio:** nella console, attacchi su creature diverse; il secondo sulla stessa creatura è rifiutato con `ogni creatura una volta sola in questo lancio`. Il primo attacco spende lo slot, gli altri no.
- [ ] **Teletrasportati nella console:** dopo un attacco, **Teletrasportati** e un clic accanto a una creatura attaccata: `teletrasporto registrato`. Su una casella lontana lo stesso, con l'avviso. Annulla rimette il token e il pulsante.
- [ ] **Portale arcano:** al lancio il primo portale entro 3 metri; il ⚡ **Secondo portale** della pill apre l'altro lontano, e il popup dice `Portale`, non `Vortice`.
- [ ] **Attraversa:** seleziona una creatura sulla mappa, ⚡ **Attraversa**, **Scegli destinazione**, un clic accanto al secondo portale: la creatura si sposta subito. Senza nessuno selezionato il pulsante è spento e il popup dice di selezionare la creatura.
- [ ] **Termina Portale arcano:** spariscono tutti e due i portali e la concentrazione.
- [ ] **Movimento:** dopo un teletrasporto il controllo della velocità misura dalla casella d'arrivo, senza contare il salto, e Annulla non restituisce movimento.

### A12. Muri e colonne (CAP-STRUCTURE)

Fonte: [PROVA_STANZA_INCANTESIMI.md](PROVA_STANZA_INCANTESIMI.md), sezione 12; [PIANO_AUTOMAZIONE_INCANTESIMI.md](PIANO_AUTOMAZIONE_INCANTESIMI.md), CAP-STRUCTURE. Fatto il 07/11.

Al banco hanno girato tutti e tre, ma il banco non disegna le zone: qui si guarda come appaiono pannelli, colonne, cortina e macerie sulla mappa vera, e se si leggono dallo schermo del tavolo.

- [ ] **Muro di pietra in fila:** **Pannelli da 3 m in fila**, **Posiziona area**: la linea parte da un angolo della griglia ed è sempre di 30 metri. Sulla mappa dieci lastre sottili sulla linea, ognuna con la sua barra verde sotto; **Crea zona e applica** senza TS; la pill ha la `C` e dice `10/10 pannelli`.
- [ ] **Uno per uno:** **Pannelli da 3 m uno per uno**: tre pannelli a L, uno per trascinamento. La riga di stato dice `Pannelli sulla mappa: 3, fino a 10`. Un pannello staccato dagli altri fa rifiutare la conferma con `Il pannello N non tocca un altro pannello`.
- [ ] **Pannelli da 6 m:** con la variante sottile la linea è di 60 metri e ogni pannello copre 6 metri, con 90 PF.
- [ ] **Barre:** dopo un colpo la barra del pannello si accorcia e diventa ambra sotto i due terzi, rossa sotto un terzo; la vede anche la finestra dei giocatori. Annulla la rimette com'era.
- [ ] **Danneggia pannello:** ⚡ **Danneggia**, **Scegli sulla mappa**, un clic sul pannello: `Pannello 1 · 180/180 PF · CA 15`. 60 contundenti danno `180 → 120`; con psichici il popup dice `Immune`.
- [ ] **Fai crollare:** ⚡ **Fai crollare** su un pannello: sparisce dalla mappa senza lasciare niente, la pill scende a `2/3 pannelli`. Annulla lo rimette.
- [ ] **Muro di ghiaccio:** **Dieci pannelli in fila** lungo una linea della griglia, con un goblin nella fila di caselle dalla parte in cui hai tirato il muro: solo lui ha il TS su Destrezza e `DANNO · 10D6` al 6° livello; chi sta dall'altra parte no.
- [ ] **Cortina gelida:** 15 danni da fuoco su un pannello danno `Vulnerabile: 30 → 0`. Al suo posto compare una lastra chiara, la cortina. Un PG che passa nel varco riceve l'avviso `Muro di ghiaccio · cortina gelida`, TS su Costituzione, 5d6 freddo; uno che cammina lungo il muro dalla parte senza caselle, niente.
- [ ] **Cupola:** **Cupola o sfera di 3 m**, un clic su un angolo della griglia: un anello di 8 caselle. Il TS lo fanno solo le creature sull'anello, non quella rinchiusa al centro; nessun pannello e nessuna barra.
- [ ] **Ossa della Terra:** **Posiziona area**, tre clic su tre caselle: la riga di stato dice `Colonne sulla mappa: 3, fino a 6`. Al 7° livello `fino a 8`. Alla conferma restano selezionate solo le creature sotto le colonne.
- [ ] **Sulla colonna:** chi fallisce il TS su Destrezza prende `Sulla colonna`; chi lo supera, niente. La pill non ha scadenza e dice `3/3 colonne`.
- [ ] **Soffitto:** ⚡ **Soffitto**: il bersaglio è già quello sulla colonna. Con il danno, `Trattenuto` e `Azione: prova For o Des`. Riaperto, il ⚡ non trova più nessuno.
- [ ] **Danneggia colonna:** una colonna a 0 PF sparisce e lascia le macerie, 3 metri attorno. Le macerie si vedono ma non rallentano il movimento: il costo lo conti a mano.
- [ ] **Termina:** con Termina spariscono colonne e macerie, `Sulla colonna` e `Trattenuto`.

### A13. Azioni da un altro punto (CAP-ORIGIN)

Fonte: [PROVA_STANZA_INCANTESIMI.md](PROVA_STANZA_INCANTESIMI.md), sezione 13; [PIANO_AUTOMAZIONE_INCANTESIMI.md](PIANO_AUTOMAZIONE_INCANTESIMI.md), CAP-ORIGIN. Fatto l'11/11.

Al banco hanno girato tutti e quattro, compresi il congedo oltre 30 m e Annulla del globo. Qui si guarda come appaiono le due pedine nuove sulla mappa vera, la console di un giocatore con il Soffio e la misura dei 30 m su una mappa vera.

- [ ] **Rampicante:** lancialo al 4° livello: **Posiziona token** entro 9 m, e sulla mappa compare la pedina con l'immagine del rampicante, centrata sulla casella. Sotto la card del caster la mini-card `Rampicante afferrante` dice `(Azione Bonus)`.
- [ ] **Frusta:** subito dopo il lancio si apre il popup `Frusta` sulla pedina. Il menu dei bersagli elenca solo chi sta entro 9 m dal rampicante. Con `Fallito` accanto al pulsante compare `Trascinala di 6 m in linea retta verso il rampicante: il token lo sposti tu`; **Applica** non cambia i PF. Al turno dopo del caster il popup torna da solo.
- [ ] **Segugio:** lancialo accanto a un goblin: pedina con l'immagine del segugio, pill `Segugio fedele` senza `C`. Nel turno del lancio non succede niente; al turno dopo del caster il popup `Morso` sulla pedina, `Attacco · 1,5 m dal segugio`, senza la riga dell'azione. Con `Colpito` e 18 il goblin perde 18 PF.
- [ ] **Guinzaglio:** porta il caster a più di 30 m dal segugio e passa al suo turno: invece del morso compare `Sei a più di 30 m dal segugio: l'incantesimo finisce.` con **Congeda il segugio**, che toglie pill e pedina. Annulla le rimette.
- [ ] **Soffio del Drago:** lancialo su un PG con **Fuoco** al 3° livello: la sua pill dice `Soffio: fuoco`. Nella sua console attacchi, sotto Attacchi, `Soffio del Drago (fuoco)`: `Cono di 4,5 m · TS Destrezza (CD del caster) · metà se superato`, danno `Fuoco · 4d6`. Il cono parte dal PG; registrato, chi supera prende metà. Quando il caster perde la concentrazione, la voce sparisce dalla console.
- [ ] **Globo trattenuto:** **Sfera congelante**, **Fase: Trattieni il globo**, il pulsante dice `Trattieni il globo`: nessuna area, la pill `Globo di Otiluke / 10d6 freddo` sul caster con `Esplode al round N`, dieci round dopo quello del lancio.
- [ ] **Consegna il globo:** seleziona un PG e premi il ⚡ **Consegna il globo**: la pill resta sul caster e nei suoi dettagli compare `In mano a: …`. Consegnandolo di nuovo al caster la riga sparisce; Annulla torna indietro di una consegna.
- [ ] **Lancia il globo:** ⚡ **Lancia il globo** sulla pill: il pannello passa all'area con il TS su Costituzione, la sfera di 18 m si posa dove si rompe il globo, anche con il caster dentro. Registrati gli esiti, la pill sparisce; Annulla la rimette in mano. **Scaglia subito** resta il lancio di prima.
- [ ] **Drago illusorio:** lancialo all'8° livello con **Necrotici**: la pedina enorme del drago (3×3) si posa entro 36 m, con l'immagine centrata. Poi spunta due nemici: TS su Saggezza, chi fallisce è `Spaventato` con il promemoria `TS solo senza linea di vista`. La pill del caster dice `Soffio: necrotici` e ha la `C`.
- [ ] **Soffio:** il popup `Soffio` si apre sulla pedina già nel turno del lancio. **Posiziona area**: il cono di 18 m parte dal bordo del drago, non dal caster; un cono che parte lontano dal drago viene rifiutato. `Necrotici · 7d6`; un non morto con immunità ai necrotici mostra `Immune`.
- [ ] **Movimento:** trascina la pedina: il conteggio della velocità segue i 18 m del drago nel turno del caster, come per la Mano arcana.
- [ ] **Illusione scoperta:** seleziona un PG, ⚡ **Ha scoperto l'illusione**: il PG ha la pill `Vede oltre il drago`; al soffio dopo la sua riga dice `· vantaggio`. Termina toglie pedina, pill e `Vede oltre il drago`.

### A14. PF tra due creature, 700 PF da ripartire, la sfera che trasporta (CAP-RELATION, CAP-ALLOCATION, CAP-CARRIAGE)

Fonte: [PROVA_STANZA_INCANTESIMI.md](PROVA_STANZA_INCANTESIMI.md), sezione 14; [PIANO_AUTOMAZIONE_INCANTESIMI.md](PIANO_AUTOMAZIONE_INCANTESIMI.md), «Tre capacità singole, fatte l'11 novembre». Fatto l'11/11; i resti della sfera (uscita, caduta fuori, trasporto a mano, fiamme, quota e colore) il 12/11.

Al banco sono passati tutti e tre: Trasferimento di vita e Guarigione di massa dal pannello vero, la sfera che porta con sé due goblin e li riporta indietro con Annulla, cinque creature nella sfera con una che cade fuori. Qui si guardano il pannello sullo schermo vero, i PF sulle barre della mappa e il ⚡ della sfera con lo strumento vero.

- [ ] **Trasferimento di vita:** un PG ferito, il caster al 3° livello. La casella dice `Danno al caster · 4d8 necrotici` e sotto `Nulla lo riduce; il bersaglio recupera il doppio del danno subito.` Con 18 il bersaglio dice `Recupera il doppio: 36 PF` e la riga del caster `Danno al caster, non ridotto`. Applicato, le due barre sulla mappa cambiano insieme; Annulla le rimette entrambe.
- [ ] **Nulla lo riduce:** dai al caster la resistenza ai necrotici sulla scheda: subisce comunque tutti i 18. Con 10 PF temporanei li perde per primi, e il bersaglio recupera comunque 36.
- [ ] **Non sé stesso:** spunta il caster come bersaglio: la riga dice `Il caster non può scegliere sé stesso`, e applicando compare l'errore senza che cambi niente.
- [ ] **Guarigione di massa:** tre PG feriti, uno a 0 PF e accecato. Sotto `PF da ripartire` le caselle vuote mostrano in grigio i PF che mancano, e il contatore dice `PF assegnati N/700`. Scrivi 2 su un PG a cui ne mancano 4: riceve 2. Applicato: tutti curati, l'accecato non lo è più, e chi era a 0 PF si rialza.
- [ ] **Oltre i 700:** scrivi 400 su due creature a cui ne mancano più di 400: il contatore diventa rosso con `oltre i 700`, e applicando il pannello rifiuta.
- [ ] **Sfera acquea:** lanciala su due goblin che falliscono il TS: `Trattenuto` con `TS For a fine turno` (non più `Azione: prova For`). A fine turno di un goblin il promemoria del TS su Forza.
- [ ] **Sposta la sfera:** il pannello chiede **Posiziona area** prima del lancio. Poi la pill del caster dice `Sfera Acquea (10)` con ⚡ e ×, anche con i goblin dentro: ⚡, **Sposta la sfera** (senza `›`: il pannello non si apre, il menu dice cosa fare). Comincia a trascinare anche lontano dalla sfera: il suo centro segue il puntatore e scatta a caselle intere, l'etichetta dice per esempio `4,5 / 9 m` e oltre i 9 m si ferma. Al rilascio l'anteprima resta dove arriverà; la ✓ **Conferma movimento** la sposta, la ✕ o Esc lasciano tutto com'è e il menu dice `Annullato.` Prova in vista compatta ed espansa.
- [ ] **Cambia direzione:** con Folata di vento attiva, il ⚡ della pill ha **Cambia direzione** senza `›`: parte subito sulla mappa, scegli la nuova direzione e premi ✓; nessun pannello. I due goblin si spostano con lei, e in Cronologia c'è solo `Sposta zona: Sfera Acquea`. Annulla riporta indietro sfera e goblin.
- [ ] **Urto:** spostala su un terzo goblin: il suo TS su Forza; se fallisce entra nella sfera con lo stesso `Trattenuto`, e al passo dopo si sposta anche lui.
- [ ] **Piena:** con quattro creature dentro, spostala su una quinta che fallisce: una di quelle già dentro, a caso, perde `Trattenuto`, è `Prona` (`È caduto dalla sfera, che era piena`) e il suo token va nella casella libera più vicina entro 1,5 m dalla sfera. Un ogre (2×2) da solo riempie la sfera; un gigante (3×3) supera il TS da solo ed esce dalla sfera. *Esito cambiato il 12/11 (SA-D2): prima la posavi tu.*
- [ ] **Fine:** Termina o perdi la concentrazione: chi era dentro cade `Prono` dove si trova, e il caster ha `Fiamme spente (9 m)` con `(F)`, che sparisce alla fine del suo turno (si toglie anche con la ×). *Il promemoria è del 12/11 (SA-D4).*
- [ ] **Trascinata a mano:** trascina la sfera senza il ⚡, anche oltre i 9 m: appena la lasci i goblin trattenuti la seguono dello stesso spostamento, senza voci in Cronologia. Selezionali insieme alla sfera e trascinali tutti: nessuno si sposta due volte. Con Ctrl+Z di Owlbear la sfera torna indietro e i goblin la seguono. *Esito cambiato il 12/11 (SA-D5): prima si spostava solo la sfera.*
- [ ] **Chi supera esce:** lanciala su due goblin, uno fallisce e l'altro supera: chi supera va nella casella libera più vicina fuori dalla sfera, dalla parte in cui stava, nello stesso comando; Annulla lo rimette dov'era. Con un goblin nascosto dal GM che supera, esce e resta nascosto ai giocatori (finestra del tavolo). (voce nuova: SA-D1, 12/11)
- [ ] **Urto superato:** spostala su un terzo goblin che supera il TS: non entra, e il suo token esce nella casella libera più vicina; una sola voce in Cronologia. (voce nuova: SA-D1, 12/11)
- [ ] **TS a fine turno superato:** alla fine del turno di un goblin trattenuto rispondi «Superato» al promemoria: perde `Trattenuto` ed esce dalla sfera, nella casella libera più vicina. (voce nuova: SA-D1, 12/11)
- [ ] **Nessuno spazio libero:** circonda la sfera di token e fai superare il TS a chi è dentro: il token resta dov'è e il GM vede l'avviso `Sfera Acquea: per … nessuno spazio libero vicino, sposta il token a mano.` (voce nuova: SA-D1, 12/11)
- [ ] **Quota della sfera:** clic destro sulla sfera, **Imposta quota…**: il popup dice `Fino a 3 m da terra: chi trattiene la segue.` Scrivi 5: la sfera si ferma a 3 m, i goblin trattenuti salgono a 3 m (etichetta della quota), in Cronologia c'è una sola voce e Annulla li riporta giù. Un goblin catturato dopo con l'urto entra a 3 m. (voce nuova: H-1, 12/11)
- [ ] **Caduta dalla sfera:** con la sfera a 3 m, un goblin supera il TS di fine turno: esce, torna a terra e compare il promemoria `Caduta da 3 m: 1d6 contundenti`. Scrivi il tiro: subisce i danni ed è `Prono`; con 0 resta in piedi. Chi cade fuori per la capienza e chi resta dentro fino alla fine scendono `Proni` senza promemoria. (voce nuova: H-3 e H-4, 12/11)
- [ ] **Colore:** la pill della sfera ha il colore della sua scuola (arancio ambra), non il rosso del fuoco; lo stesso per Onda di marea e Vento di interdizione. (voce nuova: SA-D6, 12/11)
- [ ] **Turbine:** cattura un goblin (TS Destrezza e TS Forza falliti) e trascina il Turbine a mano: appena lo lasci, il goblin lo segue dello stesso spostamento. Con il goblin dentro, una Palla di fuoco centrata sulla sua casella lo spunta, il righello 3D lo misura e «Imposta quota…» funziona; all'inizio del suo turno sale ancora di 1,5 m. (voce nuova: T1, 12/11)
- [ ] **Caduta dal Turbine:** con un goblin catturato da due turni (3 m), fai finire l'incantesimo: il goblin torna a terra e compare `Caduta da 3 m: 1d6 contundenti`; col danno è `Prono`. Con la prova di fuga riuscita succede lo stesso; lo scagliamento resta da fare a mano. (voce nuova: H-3 e H-4, 12/11)

### A15. PF temporanei (CAP-TEMP)

Fonte: [PIANO_AUTOMAZIONE_INCANTESIMI.md](PIANO_AUTOMAZIONE_INCANTESIMI.md), CAP-TEMP («Le barre e il testo sulla mappa non si montano nel banco: restano da provare in una stanza vera»); [GUIDA_UTENTE.md](GUIDA_UTENTE.md), «PF temporanei»; memoria `cap-temp-study` («Resta la prova in stanza delle barre sulla mappa e dei promemoria»). Fatto tra il 31/10 e il 03/11.

- [ ] **Sulla mappa:** dai dei PF temporanei a un PG ferito dalla card (clic sui PF, poi **T**): **+N** azzurro su card, console e numero sotto il token, e un tratto azzurro dentro la barra, proporzionale al totale. I PF non salgono. (voce nuova: GUIDA_UTENTE.md, PF temporanei)
- [ ] **Barre dopo un danno:** un danno che ne consuma una parte accorcia il tratto azzurro e cambia il numero sotto il token, anche sullo schermo del tavolo. (voce nuova: PIANO_AUTOMAZIONE_INCANTESIMI.md, CAP-TEMP)
- [ ] **Giocatori:** sullo schermo del tavolo i temporanei si vedono solo sulle creature di cui i giocatori vedono i PF esatti. (voce nuova: GUIDA_UTENTE.md, PF temporanei)
- [ ] **Eroismo:** a inizio di ogni turno del bersaglio il promemoria ha già il modificatore da incantatore; **Applica PF temporanei** li dà, **Ignora** no. (voce nuova: GUIDA_UTENTE.md, PF temporanei)
- [ ] **Santuario del crepuscolo:** il promemoria di fine turno offre **Applica PF temporanei**. (voce nuova: GUIDA_UTENTE.md, PF temporanei)
- [ ] **Armatura di Agathys:** finché restano i temporanei, dopo un colpo in mischia sul caster le console propongono **Applica N** per i danni da freddo all'attaccante; quando i temporanei finiscono, l'etichetta sparisce. (voce nuova: GUIDA_UTENTE.md, PF temporanei)

### A16. Stabilizzare e riportare in vita (CAP-STABILIZE)

Fonte: [PIANO_AUTOMAZIONE_INCANTESIMI.md](PIANO_AUTOMAZIONE_INCANTESIMI.md), CAP-STABILIZE; [GUIDA_UTENTE.md](GUIDA_UTENTE.md), «Stabilizzare e riportare in vita»; memoria `cap-stabilize-study` («resta la prova in stanza»). Fatto il 03/11.

- [ ] **Salvare i morenti:** un PG a 0 PF diventa **Stabile** e il conteggio dei TS contro la morte si azzera; i PF restano a 0. (voce nuova: GUIDA_UTENTE.md, Stabilizzare e riportare in vita)
- [ ] **Bersaglio non valido:** Rinascita su un vivo, o Salvare i morenti su un morto: il pannello dice perché, non applica nulla e lo slot non si spende. (voce nuova: GUIDA_UTENTE.md, Stabilizzare e riportare in vita)
- [ ] **Rianimare morti:** il morto torna a 1 PF con l'etichetta **Ritorno dalla morte −4**; un riposo lungo di **Riposo del gruppo** la abbassa di 1, e il riepilogo lo dice. (voce nuova: GUIDA_UTENTE.md, Stabilizzare e riportare in vita)
- [ ] **Resurrezione pura:** tutti i PF; sul bersaglio terminano Scagliare maledizione e Sortilegio, con la concentrazione di chi li ha lanciati. Un Annulla riporta tutto indietro. (voce nuova: PIANO_AUTOMAZIONE_INCANTESIMI.md, CAP-STABILIZE)

### A17. Tre incantesimi singoli e il terreno (CAP-DURATION, CAP-MODE, CAP-REPEAT-HEAL, CAP-TERRAIN)

Fonte: [PIANO_AUTOMAZIONE_INCANTESIMI.md](PIANO_AUTOMAZIONE_INCANTESIMI.md), «Tre capacità singole, fatte il 3 novembre» e CAP-TERRAIN; [GUIDA_UTENTE.md](GUIDA_UTENTE.md), le stesse funzioni; memoria `cap-single-lots` («I promemoria di zona non girano al banco … da provare in stanza»; «resta la prova in stanza»). Fatto il 03/11.

- [ ] **Scagliare maledizione:** al 3° livello la pill ha la `C` e dura 1 minuto; dal 5° non è più concentrazione e dura 8 ore. (voce nuova: GUIDA_UTENTE.md, incantesimi che dipendono dallo slot)
- [ ] **Alterare sé stesso:** nel ⚡ della pill ci sono le tre forme; un clic sostituisce quella attiva, con la stessa concentrazione. (voce nuova: GUIDA_UTENTE.md, incantesimi che dipendono dallo slot)
- [ ] **Rigenerazione:** il pannello chiede il totale di 4d8 + 15; a inizio di ogni turno del bersaglio un promemoria offre **Applica cura** con 1 già inserito, e non compare a PF pieni. (voce nuova: GUIDA_UTENTE.md, incantesimi che dipendono dallo slot)
- [ ] **Crescita vegetale:** la zona di 30 m di raggio costa ×4 il movimento e resta finché non la togli con **Termina**. Lanciato senza posizionare l'area, spende lo slot e non lascia zona. (voce nuova: GUIDA_UTENTE.md, incantesimi che cambiano il terreno)
- [ ] **Muro d'Acqua:** nella Forma, **Muro lineare** o **Muro circolare**; dentro il muro il terreno è difficile. (voce nuova: GUIDA_UTENTE.md, incantesimi che cambiano il terreno)
- [ ] **Roccia in fango:** la zona costa ×4, chi fallisce è Trattenuto, e il promemoria compare quando una creatura entra o finisce il turno dentro. Al banco questi promemoria non girano. (voce nuova: GUIDA_UTENTE.md, Trasmutare Roccia; memoria cap-single-lots)
- [ ] **Simbolo:** **Prepara incantesimo** spende lo slot e lascia solo la pill sul caster; **Attiva** nel ⚡ posa la sfera di 18 m dove sta il glifo, senza un altro slot, e la sfera chiede il TS a chi entra o finisce il turno dentro. (voce nuova: GUIDA_UTENTE.md, Simbolo)

## B. Console attacchi, mostri e capacità

Fonte: [AUDIT_UX_PANNELLO_ATTACCHI.md](AUDIT_UX_PANNELLO_ATTACCHI.md), [PROVA_STANZA_VELOCITA_MOSTRI.md](PROVA_STANZA_VELOCITA_MOSTRI.md), [GUIDA_UTENTE.md](GUIDA_UTENTE.md) e i piani degli attacchi dei mostri ([fase 1](PIANO_ATTACCHI_MOSTRI_FASE_1.md), [fase 4](PIANO_ATTACCHI_MOSTRI_FASE_4.md), [fase 5](PIANO_ATTACCHI_MOSTRI_FASE_5.md)).

### B1. Pannello attacchi, lotti 1–5

Fonte: [AUDIT_UX_PANNELLO_ATTACCHI.md](AUDIT_UX_PANNELLO_ATTACCHI.md), prove in stanza dei lotti 1–5. Fatto il 04/11 e il 05/11. Tolta la voce «Console boss» del lotto 5, che chiedeva ancora i testi lunghi: il lotto 7 li ha cambiati.

#### Lotto 1

- [ ] **Trucchetti:** dal menu ⚔ della card apri l'azione «Trucchetti» di un PG che conosce un solo trucchetto: selettore, testata e danni dicono lo stesso.
- [ ] **Barra di stato:** con il pannello fermo non c'è. Dopo **Registra** compare con il messaggio e **Annulla**, senza coprire nulla.
- [ ] **Fuori turno:** dopo un attacco con la reazione non compare l'avviso giallo; scegliendo l'esito del colpo dopo sì.

#### Lotto 2

- [ ] **Testata:** una riga sola con il nome. Nel proprio turno nessuna pillola, nel turno di un altro `Fuori turno`. La testata trascina ancora la console e **−** la riduce.
- [ ] **Dati:** sopra il danno il morso di un mostro dice bonus, portata e, dopo l'uso, `usata`, senza tagli.
- [ ] **Menu ⋯:** si apre e si chiude dal suo pulsante, con un clic fuori e con Esc; il secondo Esc chiude la console. Le due caselle cambiano le stesse opzioni del pannello Opzioni, e al turno dopo la console si apre o no di conseguenza.
- [ ] **Cambi di creatura:** fuori turno con un'altra creatura selezionata, **⇄ Torna a…** e **⇄ Agisci con…** stanno su una riga. Selezionando quella di turno ne resta uno.
- [ ] **Turno che cambia durante un attacco:** a esito scelto, la barra gialla offre **Passa a…**; dopo **Registra** diventa blu.

#### Lotto 3

- [ ] **Menu del bersaglio:** nome a sinistra e PF a destra, sul pulsante e nelle righe. Si sceglie con il mouse e con frecce e Invio; Esc lo chiude e il secondo Esc chiude la console. Selezionando un token sulla mappa il pulsante lo segue.
- [ ] **PF che cambiano:** con il menu aperto, cambia i PF di un token dal tracker: il menu resta aperto e la riga si aggiorna.
- [ ] **Registra:** il danno va al bersaglio scelto dal menu. Vale anche per Lotta e Spinta.
- [ ] **Difesa:** con un bersaglio resistente la pill sta sotto il totale, accanto a **Registra**; un clic sulla ✕ la ignora, un altro la riapplica.
- [ ] **Molti token:** con più di dieci creature il menu scorre e non esce dalla finestra.
- [ ] **Liste corte e lunghe:** la lista Capacità è alta quanto le sue voci; un elenco lungo di incantesimi scorre senza spingere i Dettagli fuori dalla finestra.

#### Lotto 4

- [ ] **Soffio:** subito sopra il danno si legge `Cono di 18 m · TS Destrezza (CD 21) · metà se superato · Ricarica 5–6`, poi le creature. **Disegna** funziona come prima.
- [ ] **Righe:** PF, bonus al TS, esito e danno stanno in colonne. Un nome lungo si accorcia, il suggerimento lo scrive intero. Scrivendo il danno gli esiti non si spostano.
- [ ] **Sotto la riga:** una creatura resistente dice `Res. fuoco: 60 → 30`, un ladro di 7° livello `Elusione`, una immune alla condizione `immune a spaventato`.
- [ ] **Freccia Perforante:** `Tiro` resta in alto, il danno sotto, le creature in fondo.
- [ ] **Danno extra:** su un'area `+ Danno extra` sta sulla riga del danno. Aggiungendone uno compare il titolo `Extra al danno`.
- [ ] **Registra:** i PF scendono come prima, anche con i tiri segnati da **Tutti falliti**.

#### Lotto 5

- [ ] **Righe:** in Capacità nessuna emoji; il costo in colonna e, a destra, gli usi (`3/3`). Passando sul numero il suggerimento dice cosa conta. A zero usi il numero è giallo.
- [ ] **Scheda della capacità:** niente pill: accanto al titolo `Su di sé`, `Su un bersaglio`, `Attiva`. Accanto al pulsante compare solo il motivo per cui è spento.
- [ ] **Manovre:** `Manovre · Dadi di Superiorità` con `5/5` in fondo alla riga. Una capacità con i suoi usi ha il numero a destra, e sparisce dalla riga il nome della risorsa.
- [ ] **Incantesimi:** `Azione` in colonna e `Console` a destra per quelli che si risolvono nella console; `Concentrazione` non compare più come pill nei Dettagli.
- [ ] **Azioni leggendarie:** nessuna scritta `Leggendaria`; `Costo 2` su quelle che costano 2.
- [ ] **Frecce:** `Altre capacità` e `Dettagli` hanno il chevron dei menu, a destra, che gira quando si aprono.
- [ ] **Bersaglio con reazioni:** con Immagine speculare e Scudo due righe senza colore: `Immagine speculare · d20 ≥ 6` e `Reazione · +5 CA`, ognuna col suo pulsante. La regola è nel suggerimento, e i pulsanti funzionano come prima.

### B2. Pannello attacchi dopo la prova dell'utente

Fonte: [AUDIT_UX_PANNELLO_ATTACCHI.md](AUDIT_UX_PANNELLO_ATTACCHI.md), «Prova in stanza dopo la prova dell'utente». Fatto il 05/11.

- [ ] **Altezza:** la finestra resta di 560 px, qualunque scheda si apra.
- [ ] **Elenchi:** stessa distanza fra le righe in Incantesimi, Capacità, menu degli attacchi, menu del bersaglio, extra e creature.
- [ ] **Elenco lungo:** con molti incantesimi `Dettagli` si vede subito e si apre al primo clic. Aperto, l'elenco si accorcia e il testo scorre nella scheda; richiuso, torna tutto come prima.
- [ ] **Testata:** maniglia e nome ben distinti, entrambi staccati dal bordo. Il trascinamento funziona come prima.
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

### B3. Console Boss (lotto 7)

Fonte: [AUDIT_UX_PANNELLO_ATTACCHI.md](AUDIT_UX_PANNELLO_ATTACCHI.md), «Prova in stanza del lotto 7». Fatto il 05/11. Tolte le prove su azioni di Auril: Icekiss, Meteor Swarm, Spellcasting, il Soffio (solo i suoi profili lo hanno), e Hurl ed Epic Resistance dalla voce delle azioni a più passi. Serve un boss con un profilo nella Console Boss, per esempio Shothragoth.

- [ ] **Finestra:** la console boss è alta come il pannello attacchi e non cambia altezza.
- [ ] **Testata:** maniglia, nome, ⋯, riduci e chiudi come nel pannello attacchi; trascinarla funziona. Ridotta, sotto il nome c'è l'azione in corso, e `+` la riapre com'era.
- [ ] **Elenco:** fase, round e Azione Epica interi in cima; righe a un solo passo; `Bloccata` e `0/1` in giallo; il suggerimento di una riga dice il resto. `Gestisci profilo` sta nel ⋯.
- [ ] **Bersaglio:** segue la mappa finché non decidi nulla; il menu si apre, le frecce lo percorrono, Esc lo chiude senza chiudere il modulo. Con più token selezionati compaiono i loro pulsanti.
- [ ] **Invio:** in una casella del danno registra, come il bottone.
- [ ] **Scagliare, Cuciture, Corpo Non Era Qui:** i passi e i disegni funzionano come prima; danni e condizioni uguali. *(dalla voce «Hurl, Scagliare, Epic Resistance, Cuciture, Corpo Non Era Qui», senza Hurl ed Epic Resistance di Auril)*
- [ ] **Metri:** ovunque nella console, tranne il testo originale nei `Dettagli`.
- [ ] **Annulla:** dopo `Registra` la barra dice cosa è successo, con la spunta, e **Annulla** torna indietro.

### B4. Velocità dei mostri

Fonte: [PROVA_STANZA_VELOCITA_MOSTRI.md](PROVA_STANZA_VELOCITA_MOSTRI.md), punti 1–6; [PIANO_VELOCITA_MOSTRI.md](PIANO_VELOCITA_MOSTRI.md). Fatto il 04/11.

Il banco non ha potuto provare due cose, che qui contano più delle altre: che lo stato e gli avvisi arrivino davvero solo a chi devono («Cosa vede il tavolo»), perché il banco è un solo client, e che la lista del selettore si apra oltre la linguetta alta 21 px («Il selettore nella vista compatta»).

In iniziativa servono:

- un mostro che vola e cammina: dalla scheda di un nemico, **Modifica → Importa → Archivio online**, importa **Adult Silver Dragon** (MM);
- un mostro che non cammina: nello stesso modo, su un altro nemico, **Banshee** (MM);
- un nemico senza velocità sulla scheda;
- un PG con una velocità sulla scheda.

Accendi **Movimento** nella griglia degli strumenti. **Limita movimento** resta spento.

#### Il mostro nel suo turno

- [ ] **Turno del drago:** il riquadro segna `0 / 12 m` nella vista estesa; la linguetta segna `Piedi ▾ 0/12 m` in quella compatta.
- [ ] **Movimento:** trascinalo di due caselle. Il riquadro segna 3 m e il token non scatta né torna indietro.
- [ ] **Annulla:** con Ctrl+Z il token torna indietro e il movimento torna a 0 m.
- [ ] **Modalità:** scegli **Volare**. La velocità diventa 24 m e la distanza già percorsa resta.
- [ ] **Turno dopo:** fai un giro di turni. Il drago riparte in **Volare** con 0 m, il PG riparte a piedi.
- [ ] **Token grande:** su un mostro con un token 2×2 o più, due caselle di movimento costano 3 m. Il banco non ha una griglia vera su cui provarlo.
- [ ] **Senza velocità:** nel turno del nemico senza velocità non c'è nessun riquadro e il token si muove libero.
- [ ] **Velocità a metà turno:** scrivi una velocità sulla sua scheda: il riquadro compare. Toglila: il riquadro sparisce e il token torna a muoversi libero.

#### Chi non cammina, le condizioni e il limite

- [ ] **Banshee:** parte in **Volare** a 12 m, senza la voce Camminare e senza selettore. Si muove normalmente.
- [ ] **Afferrato sul drago:** ogni modalità va a 0 m. Trascinandolo torna indietro anche con Limita movimento spento, e l'avviso compare solo al GM. Tolta la condizione, si muove di nuovo.
- [ ] **Indebolimento 2 sul drago:** in volo la velocità diventa 12 m.
- [ ] **Limita movimento acceso:** un trascinamento oltre il residuo riporta indietro il drago, come un PG.

#### Il selettore nella vista compatta

- [ ] **Lista:** nel turno del drago, un clic sulla parola della linguetta apre la lista con Camminare · 12 m e Volare · 24 m. Controlla che si veda tutta, anche se la linguetta è bassa.
- [ ] **Scelta:** scegli Volare. La linguetta diventa `Volo ▾ 0/24 m`, e i tasti del turno tornano a funzionare senza altri clic.
- [ ] **Suggerimento:** passando il mouse sulla linguetta si leggono anche le caselle.
- [ ] **Una sola modalità:** il PG a piedi resta `0/9 m · (0/6)`, senza selettore.
- [ ] **Griglia degli strumenti:** è come prima, e la linguetta è larga come prima.

#### Cosa vede il tavolo

Tieni le due finestre affiancate.

- [ ] **Nemico visibile:** nel turno del drago il tavolo non mostra il widget del movimento, in nessuna delle due viste; il GM lo vede come sempre.
- [ ] **Nemico oltre la velocità:** con Limita movimento spento, trascina il drago oltre 24 m. **Movimento esaurito** compare sul GM e non sul tavolo.
- [ ] **Neutrale:** cambia la fazione della Banshee in Neutrale. Nel suo turno il tavolo non mostra il widget.
- [ ] **Alleato:** cambia la fazione del drago in Alleato durante il suo turno. Il widget compare sul tavolo, senza selettore; nella vista estesa il dettaglio non elenca le altre modalità. Oltre la velocità l'avviso resta solo al GM. Rimettilo Nemico: il widget sparisce.
- [ ] **Alleato nascosto:** nascondilo durante il suo turno e il widget sparisce dal tavolo; mostralo e torna.
- [ ] **Nemico nascosto:** nascondilo prima del suo turno. Nel suo turno il tavolo non mostra né widget né card; il GM vede tutto come prima.
- [ ] **PG oltre la velocità:** il widget si vede su entrambe le finestre e l'avviso compare su entrambe, come prima.
- [ ] **PG nascosto:** nel suo turno il tavolo non mostra nulla, e l'avviso compare solo sul GM.

#### Libertà di movimento

- [ ] Metti **Afferrato** e l'effetto di **Libertà di movimento** su un mostro con velocità, poi porta il turno su di lui. Il promemoria offre **Spendi 1,5 m**: la scelta toglie la condizione e il riquadro segna 1,5 m. Annulla dalla Cronologia rimette tutto.

#### Scritture e fluidità

- [ ] **Mostri fermi:** fai un giro di turni senza muovere i mostri. Il passaggio del turno non deve sembrare più lento di prima.
- [ ] **Trascinamenti di fila:** muovi il drago più volte, veloce. Il token segue la mano e il conteggio resta giusto.
- [ ] **Fine combattimento:** con **Svuota iniziativa** spariscono i contatori. Nel combattimento dopo il drago riparte a piedi.

### B5. Dimensione del token

Fonte: [PROVA_STANZA_VELOCITA_MOSTRI.md](PROVA_STANZA_VELOCITA_MOSTRI.md), punto 7; memoria `token-size-from-statblock`. Fatto il 04/11.

Il banco non disegna i token e non ha una griglia vera: qui conta guardarli sulla mappa.

- [ ] **Grande:** importa un mostro Grande su un nemico da una casella. La scheda offre **Dimensione del token: Grande, 2×2 caselle**, spuntata. Dopo **Salva** il token occupa 2×2 caselle esatte, allineato alla griglia.
- [ ] **Omonimi:** con due token dello stesso nome e senza rinominarli, cambiano entrambi. Un PG con lo stesso nome resta com'è.
- [ ] **Enorme e Mastodontica:** 3×3 e 4×4, allineati alla griglia, anche partendo da un token già ridimensionato.
- [ ] **Medio su un token da una casella:** la riga non compare.
- [ ] **Immagine vera:** con un token dal bordo trasparente o non quadrato, l'aspetto resta accettabile. Vale anche dopo **Usa il ritratto di 5eTools**.
- [ ] **Barre ed etichette:** barra dei PF, numero, etichette delle condizioni e del turno seguono la nuova misura, anche senza muovere il token.
- [ ] **Aura:** su un mostro con un'aura (per esempio un boss), il contorno si ridisegna subito dalla nuova misura, una volta sola, e chi ne entra o ne esce riceve i suoi effetti.
- [ ] **Zona:** un token che cresce e tocca una zona entra nella zona senza bisogno di muoverlo.
- [ ] **Nel suo turno:** importa durante il turno del mostro. Il movimento consumato non cambia e **Movimento esaurito** non compare.
- [ ] **Tavolo:** sulla finestra dei giocatori il token visibile cambia misura come sul GM.

### B6. Difese contro le armi non magiche

Fonte: [PROVA_STANZA_VELOCITA_MOSTRI.md](PROVA_STANZA_VELOCITA_MOSTRI.md), punto 8; memoria `monster-nonmagical-defenses`. Fatto il 04/11.

Il banco ha provato import, pulsante, conto e PF su un JSON scritto a mano. Qui conta il JSON vero dell'archivio e un attacco registrato in stanza.

- [ ] **Import:** su un nemico, importa **Barbed Devil** (MM). **Al tavolo** dice che la resistenza ai danni non magici né d'argento si ignora nella console per un'arma magica. Le difese della scheda mostrano `Res. taglienti (non magici né d'argento)` e `Res. freddo`, senza scritta.
- [ ] **Arma normale:** da un PG con un'arma tagliente, scegli il diavolo, **Colpito** e 10 danni. Sotto il totale il pulsante dice `Res. taglienti non magici: 10 → 5`, con il materiale nel suggerimento, e il totale è 5.
- [ ] **Arma magica:** un clic sul pulsante: il conto sparisce e il totale è 10. Dopo **Registra** il diavolo perde 10 PF. Al prossimo attacco il pulsante è di nuovo acceso. *(dall'08/11 per un'arma magica c'è anche l'interruttore **✦ Magica**, vedi B7; il clic sul pulsante resta per l'arma del materiale giusto)*
- [ ] **Molti extra:** con un PG che ha Attacco Furtivo e Punizione Divina, il pulsante si vede senza scorrere, e il totale resta accanto a **Registra**.
- [ ] **Incantesimo:** passa a un incantesimo della console: accanto a **Lancia** non c'è nessun pulsante della difesa. Tornando agli attacchi ricompare.
- [ ] **Area:** usa un soffio su tre creature, una resistente, una immune e una senza difese. Sulle righe si legge `−30`, `0` e `−60`; sotto le prime due `Res. fuoco: 60 → 30` e `Imm. fuoco: 60 → 0`. I PF scendono di quei numeri.
- [ ] **Console boss:** su un bersaglio resistente il pulsante nella riga **Difese** ha il conto. In un'azione su più creature il conto è sotto la riga della creatura.
- [ ] **Annulla:** dalla Cronologia i PF tornano com'erano.
- [ ] **Immunità:** su **Stone Golem** (MM) la scheda mostra `Imm. taglienti (non magici né di adamantio)`. Lo stesso colpo fa 0 danni, 10 con il pulsante spento.
- [ ] **Omonimi:** con due token dello stesso nome, le difese e la scritta arrivano a entrambi.
- [ ] **Altro mostro:** importa un mostro senza queste difese sullo stesso token. Le scritte spariscono.

### B7. Difese dalle capacità di classe

Fonte: [GUIDA_UTENTE.md](GUIDA_UTENTE.md), «Difese ai danni dalle capacità» e «Console attacchi per i mostri»; [CAPACITA_CLASSE.md](CAPACITA_CLASSE.md), «Difese ai danni»; memoria `class-feature-defenses-study` («Resta la prova in stanza»). Fatto il 07/11 (L1–L7) e l'08/11 (M1–M6).

- [ ] **Ira:** un barbaro in Ira colpito da un'arma tagliente, nella console attacchi e nella console Boss: compare il chip della difesa (`Res. taglienti: 12 → 6` con 12 danni), e un clic lo ignora per quel colpo. La pill e la card non cambiano aspetto. Finita l'Ira, il danno torna pieno. (voce nuova: GUIDA_UTENTE.md, Difese ai danni dalle capacità)
- [ ] **Partenza insieme:** con lo Spirito Totemico (Orso) abilitato sulla scheda, l'Ira avvia anche il suo effetto, che finisce con lei; per annullare tutto serve un **Annulla** in più. (voce nuova: GUIDA_UTENTE.md, Difese ai danni dalle capacità)
- [ ] **Res. e Vuln.:** un tiefling sotto la Tomba di Levistus colpito dal fuoco: il chip dice `Res. e Vuln. fuoco: 11 → 10`. (voce nuova: GUIDA_UTENTE.md, Difese ai danni dalle capacità)
- [ ] **Elusione:** un ladro di 7° livello in un'area del pannello incantesimi con TS su Destrezza: superato non subisce danni, fallito ne subisce metà, e sulla riga del bersaglio compare «Elusione». Lo stesso nei promemoria delle zone. (voce nuova: GUIDA_UTENTE.md, Difese ai danni dalle capacità)
- [ ] **Contro gli incantesimi:** la Resistenza agli Incantesimi dell'abiuratore dimezza il danno di un incantesimo, nel pannello e nella console attacchi. (voce nuova: GUIDA_UTENTE.md, Difese ai danni dalle capacità)
- [ ] **Avvelenato:** su un monaco con Purezza del Corpo, un effetto che avvelena non applica la condizione. (voce nuova: GUIDA_UTENTE.md, Difese ai danni dalle capacità)
- [ ] **✦ Magica:** su un mostro con `Res. taglienti non magici`, accendi **✦ Magica** dopo i dadi della prima riga del danno: la difesa resta in vista barrata, `Res. taglienti non magici · superata (arma magica)`, e il danno è pieno. La scheda lo ricorda per gli attacchi seguenti, e un clic sulla difesa la riapplica a quel colpo. (voce nuova: GUIDA_UTENTE.md, Console attacchi per i mostri)

### B8. Attacchi dei mostri: ciò che il banco non copre

Fonte: [PIANO_ATTACCHI_MOSTRI_FASE_5.md](PIANO_ATTACCHI_MOSTRI_FASE_5.md) («Da provare in room (il banco non lo copre): il disegno delle aree sulla mappa, il promemoria del tiro ripetuto al cambio turno, la carta boss Leggendario sullo schermo dei giocatori»); [PIANO_ATTACCHI_MOSTRI_FASE_4.md](PIANO_ATTACCHI_MOSTRI_FASE_4.md), lotto 5; [PIANO_ATTACCHI_MOSTRI_FASE_1.md](PIANO_ATTACCHI_MOSTRI_FASE_1.md), lotto 8; memoria `monster-attacks-plan`. Fatto il 26/10 e il 27/10.

- [ ] **Disegna:** su un mostro importato con un'area, **Disegna** traccia l'area sulla mappa vera alla misura dello statblock: cono e linea dal token del mostro, sfera su un punto, cubo dal token. Per esempio Acid Breath dell'Ancient Black Dragon, una linea di 27 × 3 m. (voce nuova: PIANO_ATTACCHI_MOSTRI_FASE_5.md, lotto 1)
- [ ] **Tiro ripetuto:** Frightful Presence dell'Ancient Black Dragon su un PG che fallisce: Spaventato, senza durata a round, e a fine del suo turno il promemoria del TS su Saggezza (CD 19). Superato, la condizione sparisce e compare la pillola «Immune · azione»; la volta dopo il PG parte su Immune. (voce nuova: PIANO_ATTACCHI_MOSTRI_FASE_5.md, lotto 3)
- [ ] **Leggendario:** importa un mostro con azioni leggendarie, per esempio Adult Silver Dragon: il token e gli omonimi hanno il **Leggendario** (3/3). La carta del boss Leggendario si vede giusta anche sullo schermo dei giocatori. (voce nuova: PIANO_ATTACCHI_MOSTRI_FASE_5.md; PIANO_ATTACCHI_MOSTRI_FASE_4.md, lotto 5)
- [ ] **Un avviso per turno:** con l'apertura automatica della console per PG e Mostri, a ogni cambio di turno l'avviso di turno si apre una volta sola. Nella misura del 26/10 si era riaperto 5 volte, con i timer di Chrome rallentati. (voce nuova: PIANO_ATTACCHI_MOSTRI_FASE_1.md, lotto 8)

## C. Tracker e UX

Fonte: [PROVA_STANZA_AUDIT_UX.md](PROVA_STANZA_AUDIT_UX.md), i controlli dei lotti dell'[audit UX di sistema](AUDIT_UX_SISTEMA.md).

L'etichetta «LOCALE · commit» in basso nel tracker resta quella dell'avvio del server: per vederla aggiornata, riavvia `npm run dev`. Per la vista del giocatore in C2 serve il profilo **Online** (Opzioni). Assegna poi al giocatore della finestra del tavolo un PG: menu della card → **Giocatore**. Alla fine torna al profilo **Tavolo**.

### C1. Testata, maniglia e compilazione

Fonte: [PROVA_STANZA_AUDIT_UX.md](PROVA_STANZA_AUDIT_UX.md), punto 1; per il menu `…` e la compilazione anche [GIRO-OBR-1.5.0.md](audits/GIRO-OBR-1.5.0.md), A1.3 e A3.4. Fatto il 31/10.

- [ ] **Estesa, striscia:** sopra la testata ci sono 6×2 pallini, con lo stesso spazio sopra e sotto. Trascinandola si sposta il tracker; il doppio clic lo ricentra.
- [ ] **Estesa, testata del GM:** contiene, nell'ordine,
  - ↺ Round;
  - il cambio di vista (icona a barra);
  - il gruppo Opzioni · Cronologia · Riposo del gruppo;
  - il gruppo **+ | ×**.

  Niente deve essere tagliato, nemmeno con il round a due cifre (porta il round a 10 o più).
- [ ] **Estesa, fondo:** sotto la lista ci sono solo ▲ ▼. Sullo schermo del tavolo non c'è nessuna riga in fondo.
- [ ] **Compatta:** l'icona del cambio di vista è una colonna divisa in tre. Il menu `…` ha, nell'ordine: Reset round, Cronologia, Riposo del gruppo, Etichette mappa, Opzioni, Aggiungi attori, Svuota iniziativa. *(anche GIRO-OBR-1.5.0, A1.3, che elencava il menu di prima)*
- [ ] **Compilazione:** con **Aggiungi attori** (o con un token nuovo in iniziativa) la compilazione delle iniziative parte da sola. *(anche GIRO-OBR-1.5.0, A3.4, quando la compilazione partiva dal menu `…`)*
  - **Invio** o **Tab** passa alla creatura successiva.
  - **Ctrl+Invio** o **Esc** chiude la compilazione.
  - Le card si riordinano alla fine.
  - In nessun punto compare più il pulsante giallo "Compila iniziativa".

### C2. Lotto U11

Fonte: [PROVA_STANZA_AUDIT_UX.md](PROVA_STANZA_AUDIT_UX.md), punto 2. Fatto il 31/10.

- [ ] **Tracker vuoto:** usa **Svuota iniziativa** (poi Annulla).
  - Il GM vede «Nessuna creatura in iniziativa» con **+ Aggiungi attori**, in entrambe le viste.
  - Il pulsante rimette le creature in iniziativa.
  - Lo schermo del tavolo non mostra nulla.
- [ ] **× nel cassetto (compatta):** su una card con `+N`, apri il cassetto.
  - La **×** di una condizione la rimuove.
  - La **×** di un incantesimo lo termina. Se era a concentrazione, la concentrazione del lanciatore finisce.
  - Annulla dalla Cronologia rimette l'effetto.
  - Sulla card stessa l'etichetta non ha la ×.
- [ ] **Vista del giocatore (Online), sullo schermo del tavolo:**
  - nella vista estesa, sopra il nome di ogni PG assegnato, c'è una pill con il nome del giocatore, nel colore che ha in Owlbear;
  - l'icona della scheda compare solo sul proprio PG;
  - l'icona della reazione non compare su nessuna card.

  Il GM vede tutto come prima. Nel menu **Il mio schermo** nessun testo finisce sotto le tendine.
- [ ] **Versione:** **Opzioni → Manutenzione → Versione in uso** mostra «Versione 1.5.0 · commit del …» con la sigla del commit.

### C3. Riposo del gruppo (U6′)

Fonte: [PROVA_STANZA_AUDIT_UX.md](PROVA_STANZA_AUDIT_UX.md), punto 3. Fatto il 31/10.

- [ ] **Riposo breve:** il campo «PF recuperati» di un PG si somma ai suoi PF. Le capacità che si ricaricano con il riposo breve tornano al massimo.
- [ ] **Riposo lungo:**
  - PF al massimo e PF temporanei azzerati;
  - le risorse di classe si ricaricano;
  - l'Indebolimento scende di 1 solo se spunti la casella;
  - un PG a 0 PF non riceve i benefici del riposo lungo, e chi è morto non riposa.
- [ ] Il riposo è una sola voce della Cronologia: un **Annulla** rimette PF e risorse com'erano. L'Indebolimento passa dal salvataggio della scheda di ciascun PG, quindi si annulla a parte.

### C4. Animazioni dei gruppi (U13)

Fonte: [PROVA_STANZA_AUDIT_UX.md](PROVA_STANZA_AUDIT_UX.md), punto 4. Fatto il 31/10.

- [ ] Apri e chiudi un gruppo di omonimi (per esempio i goblin), in tutte e due le viste.
  - **Estesa:** la lista non salta all'inizio. In apertura segue il gruppo che si allarga; in chiusura i membri svaniscono con la card madre.
  - **Compatta:** a fine animazione nessuno scatto.
- [ ] Sullo schermo del tavolo l'animazione arriva con circa 1 s di ritardo, ed è un limite noto. Segnala se è peggio.

### C5. PF e console (U1, U3, U4)

Fonte: [PROVA_STANZA_AUDIT_UX.md](PROVA_STANZA_AUDIT_UX.md), punto 5. Fatto il 31/10.

- [ ] Ovunque si legge **PF**, mai HP: card, editor, console, Cronologia, Opzioni. I PF condivisi hanno la loro icona.
- [ ] **Anteprima delle reazioni:** su un bersaglio con **Vincolo di interdizione** o **Interdizione alla morte**, l'anteprima della console Effetti mostra i PF che il comando scriverà davvero (per esempio 1 PF con Interdizione alla morte, non 0).
- [ ] Il **registro di combattimento** spiega perché i PF sono diversi dal danno chiesto: resistenze, reazioni, danno massiccio.
- [ ] Menu della card → **Ultime modifiche…** apre il registro filtrato su quella creatura.
- [ ] **Doppio clic:** due clic rapidi su Applica, nella console Effetti e nella console Boss. Il pulsante mostra «Applico…» e il danno arriva una volta sola.

### C6. Menu della card (U2)

Fonte: [PROVA_STANZA_AUDIT_UX.md](PROVA_STANZA_AUDIT_UX.md), punto 6. Fatto il 31/10.

- [ ] Ogni creatura ha la voce della scheda nel menu: «Scheda personaggio» per PG e alleati, «Statblock» per gli altri. Movimento resta tra i quattro strumenti.
- [ ] La **Console Boss** si apre dal token di un boss anche quando il token ha un profilo collegato.

## D. Avvisi, registro e gioco online

Fonte: [STUDIO_AVVISI_REAZIONE.md](STUDIO_AVVISI_REAZIONE.md), [STUDIO_REGISTRO_SCHEDE_STANZA.md](STUDIO_REGISTRO_SCHEDE_STANZA.md), [AUDIT_GIOCO_ONLINE.md](AUDIT_GIOCO_ONLINE.md) e [PIANO_DADI_ONLINE.md](PIANO_DADI_ONLINE.md). Nessuna di queste funzioni aveva una lista: le voci sono nuove, scritte da ciò che i documenti dicono.

### D1. Avvisi di reazione

Fonte: [STUDIO_AVVISI_REAZIONE.md](STUDIO_AVVISI_REAZIONE.md), lotti R1–R6 (§6.2–§6.17, e «Da provare in stanza» in §6.15); memoria `reaction-prompts-study`. Fatto l'08/11, pubblicato il 10/11.

Le opzioni sono in **Opzioni → Avvisi di reazione** (Questo browser). Di base sono accesi Colpito, Danno, Incantesimo lanciato e Mancato, solo per i PG; sono spenti Mostri, Movimento e «Mostra allo schermo dei giocatori». I goblin vanno segnati nemici: un neutrale non reagisce.

- [ ] **Prima di Registra (R1):** nella console attacchi un goblin colpisce un PG che ha Scudo: sopra **Registra** compare il popup, con **Usa** e **Non chiedere più** sulla riga e **Ignora** sotto. **Usa** lancia Scudo con slot e reazione e chiude il popup; **Registra** senza rispondere vale come Ignora. Lo stesso nella console Boss. (voce nuova: STUDIO_AVVISI_REAZIONE.md, §6.2)
- [ ] **Dopo il danno (R1):** registrato il danno su un PG con Intimorire infernale, compare il suo avviso, che si chiude quando scegli l'esito dell'attacco dopo. (voce nuova: STUDIO_AVVISI_REAZIONE.md, §6.2)
- [ ] **Non chiedere più (R1):** la reazione sparisce dal popup e compare fra le silenziate nelle Opzioni; «↺ Chiedi di nuovo» e **Salva** la rimettono. (voce nuova: STUDIO_AVVISI_REAZIONE.md, §6.2)
- [ ] **Controincantesimo (R2):** un nemico lancia dal pannello incantesimi, e un PG entro 18 m ha Controincantesimo, la reazione e uno slot dal 3°: al primo clic sul pulsante che lancia compare il popup. **Usa** apre il Controincantesimo già compilato e il pannello aspetta; se l'incantesimo è annullato, il lancio non parte. Premendo di nuovo il pulsante si lancia senza reazione. (voce nuova: STUDIO_AVVISI_REAZIONE.md, §6.3)
- [ ] **Su un alleato (R3a):** un goblin colpisce un PG, e accanto c'è un paladino con Difesa Gloriosa: il popup dice la nuova CA e con quali tiri il colpo diventa Mancato; **Usa** spende la reazione e un uso. Le distanze vengono dalla griglia della scena. (voce nuova: STUDIO_AVVISI_REAZIONE.md, §6.5)
- [ ] **Dopo un mancato (R3c):** un goblin manca un maestro di battaglia: dopo **Registra** compare la Replica, e **Usa** porta la console su di lui, fuori turno, con il goblin come bersaglio e la reazione spuntata. (voce nuova: STUDIO_AVVISI_REAZIONE.md, §6.6)
- [ ] **Riduzione del danno (R3b):** un goblin colpisce un ladro di 5° livello: **Usa** su Schivata Prodigiosa aggiunge la riga «Reazioni al danno» e l'anteprima dimezza il danno. **Registra** scrive i PF e la reazione; un **Annulla** rimette tutto. (voce nuova: STUDIO_AVVISI_REAZIONE.md, §6.8)
- [ ] **Aree e pannello (R3b-4, R3b-5):** Campo Protettivo su un alleato, in un'area della console attacchi e in un lancio dal pannello incantesimi: la riga dice su chi vale e conta solo per quella creatura; reazione e uso di chi la usa si spendono, e un **Annulla** rimette tutto. (voce nuova: STUDIO_AVVISI_REAZIONE.md, §6.9 e §6.11)
- [ ] **Parole Taglienti:** si toglie dal tiro prima del TS e delle resistenze, per tutte le creature colpite dallo stesso tiro, con una sola reazione e un solo uso di Ispirazione Bardica. (voce nuova: STUDIO_AVVISI_REAZIONE.md, §6.17)
- [ ] **Mostri (R4):** con «Mostri» acceso, un PG colpisce in mischia un mostro importato da 5eTools con lo statblock di un cavaliere: il popup mostra Parata (+2 CA) e Schivata Prodigiosa (danno dimezzato). Con l'interruttore spento il popup non compare. (voce nuova: STUDIO_AVVISI_REAZIONE.md, §6.13)
- [ ] **Schermo del tavolo (R6):** con «Mostra allo schermo dei giocatori» acceso, sullo schermo HDMI compare in basso al centro la scheda di sola lettura, con le sole righe dei PG; si vede tutta anche con lo schermo ruotato, e si chiude con **Ignora** o **Registra** del GM. Al banco l'ancora in basso non si vedeva tutta. (voce nuova: STUDIO_AVVISI_REAZIONE.md, §6.15)
- [ ] **Online (R6):** nel profilo Online, con il PG assegnato al giocatore della seconda finestra, la sua scheda ha **Usa** e **Ignora**. Il suo **Usa** dice «Inviato al GM», e nel popup del GM la riga dice «…: Usa», con l'Usa acceso e a fuoco: Invio conferma. Un giocatore che non ha il PG non vede niente. (voce nuova: STUDIO_AVVISI_REAZIONE.md, §6.15)
- [ ] **Movimento (R5):** con «Quando la creatura di turno si muove» acceso, la creatura di turno esce dalla portata di un goblin nemico: in alto al centro compare la card viola «… esce dalla portata», con «(1) Goblin · Attacco di opportunità». **Usa** apre la console del goblin «Fuori turno» con chi si è mosso selezionato; il cambio di turno e **Ignora** chiudono la card. (voce nuova: STUDIO_AVVISI_REAZIONE.md, §6.17)

### D2. Registro delle schede nella stanza

Fonte: [STUDIO_REGISTRO_SCHEDE_STANZA.md](STUDIO_REGISTRO_SCHEDE_STANZA.md) («Resta la prova in stanza», per D1–D4 e per la seconda parte, C1–C5); memoria `room-card-registry-study`. Fatto il 07/11.

- [ ] **Il gruppo intero:** apri e salva le schede di tutti i PG del gruppo: l'avviso «Registro delle schede pieno» non compare più. (voce nuova: STUDIO_REGISTRO_SCHEDE_STANZA.md, seconda parte)
- [ ] **Solo questa stanza:** se l'avviso compare, elenca solo personaggi di questa stanza; la prima volta può elencare ancora schede di altre campagne già salvate nella stanza. (voce nuova: STUDIO_REGISTRO_SCHEDE_STANZA.md, D1 e D2)
- [ ] **Una volta per stanza:** ricaricando la pagina del GM, lo stesso avviso non torna in quella stanza. (voce nuova: STUDIO_REGISTRO_SCHEDE_STANZA.md, D4)

### D3. Gioco online

Fonte: [AUDIT_GIOCO_ONLINE.md](AUDIT_GIOCO_ONLINE.md) (stato dei lotti: «la prova in stanza di O4b e O5»; O3: «Da verificare in stanza»); memoria `online-play-audit`. Fatto il 30/10.

Serve il profilo **Online** (Opzioni → Vista giocatori, «Modalità di gioco»), con la finestra in incognito come giocatore e un PG assegnato dal menu della card (**Giocatore ›**). Alla fine torna al profilo **Tavolo**.

- [ ] **TS contro la morte (O4b):** il promemoria del TS contro la morte di un PG arriva solo al giocatore di quel PG; gli altri giocatori non lo vedono. (voce nuova: AUDIT_GIOCO_ONLINE.md, O4b)
- [ ] **Promemoria: solo i miei (O4b):** nel menu ⚙ «Schermo» del giocatore, con «Promemoria: solo i miei» compaiono solo i promemoria dei suoi personaggi. (voce nuova: AUDIT_GIOCO_ONLINE.md, O4b)
- [ ] **Chi entra dopo (O4b):** un giocatore che entra a combattimento in corso riceve l'avviso del turno in corso. (voce nuova: AUDIT_GIOCO_ONLINE.md, O4b)
- [ ] **Il tracker del giocatore (O5):** la posizione del tracker del giocatore non segue quella del GM, e la dimensione parte dal 100% o da quella scelta nel suo menu ⚙; nel pannello Opzioni del GM le carte di posizione e dimensione del tavolo sono spente. (voce nuova: AUDIT_GIOCO_ONLINE.md, O5)
- [ ] **Giocatore senza account (O3):** assegnato a un PG, esce e rientra in un'altra sessione: l'assegnazione è ancora sua, cioè il suo id è rimasto lo stesso. (voce nuova: AUDIT_GIOCO_ONLINE.md, O3)
- [ ] **Assegnazione senza ricaricare:** dopo **Giocatore ›** la scheda del PG mostra subito il giocatore assegnato, senza ricaricare. Al banco non si riproduce. (voce nuova: memoria online-play-audit, correzione del 30/10)

### D4. Dadi online

Fonte: [PIANO_DADI_ONLINE.md](PIANO_DADI_ONLINE.md), lotto D-4; memoria `online-dice-plan` («Da provare con due client reali»). Fatto il 30/10.

- [ ] **Due client:** nel profilo Online, un tiro dal 🎲 nella barra degli strumenti di Owlbear compare sull'altro schermo, nel riquadro in basso a sinistra, con al massimo 4 tiri in coda. (voce nuova: PIANO_DADI_ONLINE.md, D-4)
- [ ] **Chi ricarica:** ritrova l'ultimo tiro di ogni giocatore nello storico, senza riquadro. (voce nuova: PIANO_DADI_ONLINE.md, D-4)

## E. Verifiche guidate: bugfix e fluidità

Fonte: [PROVA_STANZA_FLUIDITA.md](PROVA_STANZA_FLUIDITA.md), [PIANO_BUGFIX_POLISHING.md](PIANO_BUGFIX_POLISHING.md) e [PIANO_REFACTORING_FLUIDITA.md](PIANO_REFACTORING_FLUIDITA.md).

Prima di tutto, in **entrambe** le finestre: F12 → Console → menu dei contesti in alto → **background.html**, scrivi `__tbpPerf.enable()`, poi ricarica la pagina di Owlbear.

### E1. Verifica del bugfix (L23) e controlli a mano

Fonte: [PROVA_STANZA_FLUIDITA.md](PROVA_STANZA_FLUIDITA.md), «Verifica del passaggio di bugfix (L23)»; [PIANO_BUGFIX_POLISHING.md](PIANO_BUGFIX_POLISHING.md), sezione 7 e lotti L1, L15, L20, L25; [PROVA_STANZA_AUDIT_UX.md](PROVA_STANZA_AUDIT_UX.md), punto 7; memoria `bugfix-polishing-plan`. Lotti fatti tra il 28/10 e il 30/10; `runBugfixCheck()` non è mai stata eseguita in una stanza vera.

Serve un combattimento in corso con almeno due creature. Per L27 serve un boss Paragon in iniziativa, per L16 un token con barra o aura sulla mappa. Le prime tre voci riprendono i passi della procedura, che resta in PROVA_STANZA_FLUIDITA.md con le opzioni. La prova a mano di F5 sulla finestra del tavolo (L9) non si ripete: è stata confermata in stanza il 30/10.

- [ ] **Tavolo, prima:** nella console della finestra dei giocatori, contesto **background.html**, lancia `await __tbpPerf.watchFluidity()`, che ora controlla anche i token nascosti.
- [ ] **GM:** con il tracker appena aperto o ricaricato, nella console del GM, contesto **background.html**, lancia `await __tbpPerf.runBugfixCheck()` e non toccare nulla per circa un minuto. Fa da sola cinque verifiche e poi rimette tutto com'era: scadenze dopo la riapertura (L2), PF dalla seconda card Paragon (L27), creatura di turno tolta (L6), Annulla di due voci (L3), token nascosto (L16). La tabella va in `perf-runs/verifica-bugfix.json`: annota le verifiche che non passano.
- [ ] **Tavolo, alla fine:** `watchFluidity` non segnala `token-nascosto-visibile`.
- [ ] statblock su un goblin con omonimi feriti, poi cambio scena: i PF degli altri goblin non cambiano (L1).
- [ ] **◀ e ▶ (L15):** dopo un ◀ e un nuovo ▶ la stessa fine turno non si conta due volte: le durate non scendono di nuovo e i TS degli effetti non si richiedono di nuovo. (voce nuova: PIANO_BUGFIX_POLISHING.md, L15)
- [ ] **Posizioni degli avvisi (L20):** l'avviso di concentrazione sta in alto e la carta del TS contro la morte sotto l'avviso di turno, anche sullo schermo HDMI. (voce nuova: PIANO_BUGFIX_POLISHING.md, L20)
- [ ] **Aree libere (L20):** ruota o scala un'area sulla mappa: i bersagli si riselezionano dove l'area si trova davvero. (voce nuova: PIANO_BUGFIX_POLISHING.md, L20)
- [ ] **Muro da un vertice (L25):** un muro largo una casella, posato da un vertice, copre una sola fila di caselle. (voce nuova: PIANO_BUGFIX_POLISHING.md, L25)

### E2. Fluidità e misure, facoltative

Fonte: [PROVA_STANZA_FLUIDITA.md](PROVA_STANZA_FLUIDITA.md); [PIANO_REFACTORING_FLUIDITA.md](PIANO_REFACTORING_FLUIDITA.md) («Prova in stanza del 28/10 … tutte le verifiche ok»); [PROVA_STANZA_VELOCITA_MOSTRI.md](PROVA_STANZA_VELOCITA_MOSTRI.md), punto 6; [AUDIT_GIOCO_ONLINE.md](AUDIT_GIOCO_ONLINE.md), O8. La verifica guidata dei lotti di fluidità è stata fatta il 28/10, tutta ok: si rifà solo se vuoi un numero sul turno dopo i lotti di novembre.

- [ ] *(facoltativa)* **Verifica guidata della fluidità:** sul tavolo `await __tbpPerf.watchFluidity()`, subito dopo sul GM `await __tbpPerf.runFluidityCheck()`, senza toccare nulla per 2–3 minuti. I risultati vanno in `perf-runs/`; il confronto con la misura del 24/10 è `node scripts/perf-compare.mjs perf-runs/gm-turni-flag-locale.json perf-runs/gm-turni-fluidita.json`. *(anche PROVA_STANZA_VELOCITA_MOSTRI.md, punto 6, «se vuoi un numero sul turno»)*
- [ ] *(facoltativa)* **A occhio**, durante la verifica, perché lo script non vede come si muovono le cose sullo schermo:
  - spostando o girando il tracker, se resta vuoto per un attimo;
  - alone della card attiva e chip senza scatti;
  - il tiro contro la morte di un PG a 0 PF;
  - Cronologia e Combat Log che registrano turni e PF, con l'Annulla.
- [ ] *(facoltativa)* **O8, misura online:** build pubblicata, un giocatore remoto e un dispositivo modesto, con `__tbpPerf` su entrambi i client. Serve a decidere con i numeri su iframe dell'avviso, blur ed Embers (ON-17). (voce nuova: AUDIT_GIOCO_ONLINE.md, O8)

## F. Giro generale prima della 1.5.0

Fonte: [audits/GIRO-OBR-1.5.0.md](audits/GIRO-OBR-1.5.0.md), lotto 7.4 del [piano di polishing](PIANO_POLISHING_UI.md); checklist pronta il 23/10/2026.

Le voci sono quelle del giro, scritte prima dei lotti di fine ottobre e di novembre: dove dicono HP oggi si legge PF, la «Console HP rapida» è la console Effetti, la console «Boss Actions» è la Console Boss. Tre voci stanno altrove, con l'esito di oggi: A1.3 (menu `…`) e A3.4 (Compila iniziativa) sono in C1, la 3.3 (riordino a pari merito) è la A6.2. **(MC)** vuol dire che servono i due client.

Scena di prova:

- 3 PG; su uno configura almeno un'azione rapida, un incantesimo e un attacco, così compare la colonna ⚡ 🪄 🗡️;
- un PG con almeno 5 condizioni o effetti, per i cassetti;
- un Epic Boss con token collegati e un PG con evocazioni;
- 4 nemici omonimi, per esempio «Goblin», e un boss Paragon;
- due creature con la stessa iniziativa, una delle quali è un PG seguito da un'Azione epica.

### F1. Flussi nuovi o cambiati

Fonte: [GIRO-OBR-1.5.0.md](audits/GIRO-OBR-1.5.0.md), parte A.

#### A1. Barra compatta (GM)

- [ ] **A1.1** La barra resta alta uguale con tutto aperto: nessun elemento cresce verso il basso.
- [ ] **A1.2** Il **Round** è nella colonna sinistra, dentro la barra, non in una linguetta staccata. **(MC)** Il giocatore lo vede.
- [ ] **A1.4** Pannello destro: tutti i pulsanti sono interi, con l'etichetta sotto l'icona, e il badge "LOCALE" non copre niente. Era il bug della fase 0b.
- [ ] **A1.5** Card con azioni configurate:
  - la colonna ⚡ 🪄 🗡️ sta a destra del ritratto e non si sovrappone all'icona della scheda;
  - sull'Epic Boss la colonna parte sotto la "E".
- [ ] **A1.6** Un clic sull'icona blu della scheda (sotto l'iniziativa) apre la scheda personaggio in un clic.
- [ ] **A1.7** Una creatura a 0 PF ha il badge **KO** sul ritratto, e il ritratto si attenua.

#### A2. Cassetti laterali

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

#### A3. Modifica in linea

- [ ] **A3.1** HP nella card compatta:
  - un clic sul testo HP lo rende modificabile; il testo resta al suo posto, tutto bianco, con i numeri sottolineati; un clic sulla barra non fa niente;
  - prova un valore, un delta (`-7`, `+5`), **Esc** e **Tab**;
  - **(MC)** la barra HP sulla mappa si aggiorna insieme, anche sul giocatore.
- [ ] **A3.2** HP a riposo nella card compatta: tutto bianco, con lo stesso peso per attuali e massimi.
- [ ] **A3.3** Iniziativa nella card compatta (solo GM):
  - un clic sul badge lo rende modificabile;
  - **Invio** salva, riordina le card e passa alla card successiva.
- [ ] **A3.5** **(MC)** Sul giocatore, HP e iniziativa non si aprono in modifica.

#### A4. Annulla al posto delle conferme

- [ ] **A4.1** **Svuota iniziativa**:
  - agisce subito, senza conferma, e compare l'avviso "Iniziativa svuotata · Annulla" per 8 secondi;
  - **Annulla** rimette ordine, turno attivo, round e token in iniziativa;
  - **(MC)** sulla mappa tornano barre ed etichette, anche sul giocatore.
- [ ] **A4.2** **Reset round**: stesso avviso; **Annulla** rimette il round precedente.
- [ ] **A4.3** Avanza il round mentre l'avviso è aperto, poi premi **Annulla**. Atteso: non sovrascrive niente e lo segnala.

#### A5. Condizioni rapide

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

#### A6. Turno da tastiera e riordino a pari merito

- [ ] **A6.1** Dopo un clic su una card, **Spazio** o **→** avanza il turno e **←** torna indietro.
  - I tasti non scattano mentre scrivi in un campo, con un editor aperto o in Compila iniziativa.
  - Dopo un clic sulla mappa, i tasti tornano a OBR. È un limite noto.
- [ ] **A6.2** Maniglia **⠿** a pari merito: *(anche la 3.3 del giro e la 3.3 della smoke checklist)*
  - compare al passaggio del mouse, fuori dal bordo destro nella vista estesa e in basso a sinistra in quella compatta;
  - trascinandola, l'ordine cambia e resta;
  - avanzando, il turno segue il nuovo ordine.
- [ ] **A6.3** Riordinando un PG seguito da un'Azione epica, l'Azione epica si sposta con lui.
- [ ] **A6.4** All'iniziativa 20 i Boss Epici restano in testa al pari merito e non si scavalcano.

#### A7. Vista estesa (classica)

- [ ] **A7.1** Espandendo le etichette con `+`, la terza riga non copre più la card successiva. Era il bug 5.2 della fase 0b.
- [ ] **A7.2** La linguetta "Azione Epica" non finisce sulle etichette della card precedente, anche quando quella card è attiva.
- [ ] **A7.3** Icone accanto agli HP (reazione, scheda, ±):
  - subito dopo il valore, senza buchi;
  - non toccano la barra HP.
- [ ] **A7.4** **Svuota iniziativa** (×) è in fondo all'intestazione, separato e in rosso.

#### A8. Lingua e testi

- [ ] **A8.1** Nei pannelli più usati non restano termini inglesi del glossario:
  - Cronologia (schede "Registro" e "Cronologia");
  - Opzioni ("Stanza", "Registro combattimento", "Promemoria");
  - console effetti, Condizioni, Incantesimi.
- [ ] **A8.2** Le notifiche di OBR (aggiunta di token, errori) sono in italiano e senza caratteri corrotti ("può", "è").

### F2. Punti aperti

Fonte: [GIRO-OBR-1.5.0.md](audits/GIRO-OBR-1.5.0.md), parte B.

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

### F3. Voci della smoke checklist

Fonte: [GIRO-OBR-1.5.0.md](audits/GIRO-OBR-1.5.0.md), parte C; le stesse voci sono in [SMOKE-CHECKLIST-MANUALE.md](audits/SMOKE-CHECKLIST-MANUALE.md), con l'esito di prima. Dove il polishing ha cambiato l'esito atteso, qui c'è quello nuovo.

**Caricamento**
- [ ] **0.1** Tracker apribile in pochi secondi, nessun errore in console.
- [ ] **0.2** **(MC)** Sul giocatore il tracker si apre da solo (voluto per lo schermo del tavolo).
- [ ] **0.3** Ricariche ripetute, anche con throttling «Fast 3G»: nessuna finestra resta bianca. Includi il sottomenu **Condizioni…** del token.

**Scena e vista**
- [ ] **1.1** **(MC)** Aggiungi all'iniziativa dal menu del token: la card compare sui due client con il colore della fazione.
- [ ] **1.2** **(MC)** Sul giocatore, nessuna voce riservata al GM nel menu del token, comprese **Condizioni…**. *(la 1.2 della smoke checklist chiede anche che **Imposta quota…** compaia solo sui PG)*
- [ ] **2.1** Da Esteso a Compatto e ritorno: nessuna card persa, turno attivo evidenziato in entrambi.
- [ ] **2.2** Trascina la barra compatta dalla maniglia nella colonna sinistra, poi ricarica: la posizione resta.
- [ ] **2.3** **(MC)** HP visibili sul giocatore secondo la tabella della smoke checklist; dove sono nascosti, niente testo o barra vuoti.

  La tabella della smoke checklist (2.3), con le opzioni di default:

  | Fazione | Tracker esteso | Tracker compatto | Barra mappa |
  | --- | --- | --- | --- |
  | PG | esatti | esatti | esatti |
  | Alleati | esatti | nascosti | esatti |
  | Neutrali | nascosti | nascosti | nascosti |
  | Nemici | nascosti | nascosti | nascosti |

- [ ] **2.4** **(MC)** Sul giocatore nessun controllo di regia interattivo: HP, iniziativa, frecce, maniglie, menu della card.

**Card e turni**
- [ ] **3.2** Gruppo «Goblin» collassato: si espande quando il turno entra e si richiude quando esce.
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

## G. Smoke completo, facoltativo

Fonte: [audits/SMOKE-CHECKLIST-MANUALE.md](audits/SMOKE-CHECKLIST-MANUALE.md), le verifiche che l'[audit funzionale del 15/10/2026](audits/FUNCTIONAL-AUDIT-2026-10.md) non aveva potuto fare. Ogni voce va eseguita su Owlbear Rodeo reale.

Le voci già nel giro (F) non si ripetono: 0.1–0.3, 1.1, 1.2, 2.1–2.4, 3.2–3.4, 4.1–4.6, 4.9, 4.10, 5.1, 5.2, 5.4–5.6, 6.1, 6.5, 7.1–7.3, 9.3, 10.1, 14.3, 15.1, 18.1. Fuori anche 9.7 e 9.8, su Hand Slam di Auril. Dove l'esito atteso è cambiato dopo la checklist c'è una nota in corsivo.

Serve una scena di prova con questi token:

- 3 PG;
- 1 alleato;
- 1 neutrale;
- 4 nemici omonimi, per esempio «Goblin»;
- 1 boss;
- 1 token 2×2.

**Perché ogni voce è manuale**:

| Etichetta | Significato |
| --- | --- |
| **MC** | servono due client reali |
| **MAP** | rendering sulla mappa |
| **DRAG** | interazione a trascinamento |
| **PERS** | persistenza dopo ricarica, cambio scena o cambio dispositivo |
| **VIS** | giudizio visivo |
| **PERF** | tempi e fluidità |

### G1. Scena, card e turni

Fonte: [SMOKE-CHECKLIST-MANUALE.md](audits/SMOKE-CHECKLIST-MANUALE.md), sezioni 1, 3 e 4.

#### 1. Scena e fazioni

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
  se il tracker li mostra e la mappa no. *(dal 29/10 un token senza fazione vale neutrale: i giocatori non vedono i suoi PF esatti, né nel tracker né sulla mappa; PIANO_BUGFIX_POLISHING.md, L16)*

#### 3. Card

- [ ] **3.1 (MAP, MC)** Fai doppio clic sul nome e rinomina. Atteso: il nome
  sotto il token cambia su entrambi i client.
- [ ] **3.5 (PERS)** Chiudi e riapri la scheda della card, poi ricarica.
  Atteso: classi, livelli, sottoclassi e capacità abilitate restano.
- [ ] **3.6 (PERS, MC, F-01)** Budget del registry:
  1. crea 6 PG di 20° livello con molte capacità (Maestro di Battaglia,
     Monaco);
  2. apri la room da un altro browser;
  3. aggiungi gli stessi token in una nuova scena.

  Atteso oggi: i profili meno recenti possono tornare ai default senza
  avviso. Annota quanti profili si perdono. *(esito cambiato: dal bugfix L12 di fine ottobre c'è l'avviso, e dal 07/11, con la compressione, nella stanza stanno circa 8 PG; vedi D2)*

#### 4. Combattimento e turni

- [ ] **4.7 (MC)** Elimina dalla scena il token del turno attivo. Atteso: il
  tracker si riallinea senza errori; il turno passa a una voce valida.
- [ ] **4.8 (PERS)** Cambia scena a combattimento in corso, poi torna indietro.
  Atteso: round, ordine e turno della scena originale sono intatti; nessuna
  etichetta orfana nell'altra scena.

### G2. PF, condizioni e incantesimi

Fonte: [SMOKE-CHECKLIST-MANUALE.md](audits/SMOKE-CHECKLIST-MANUALE.md), sezioni 5, 6 e 7.

#### 5. HP

- [ ] **5.3** Cura e PF temporanei dalla console. Atteso: la cura non supera
  il massimo; i PF temporanei si consumano prima degli HP.

#### 6. Condizioni

- [ ] **6.2 (DRAG, MAP)** Prova a trascinare una pill sulla mappa. Atteso:
  è bloccata.
- [ ] **6.3 (DRAG, MAP)** Sposta il token. Atteso: la pill lo segue.
- [ ] **6.4 (VIS)** Con molte pill, cambia lo zoom. Atteso: dimensione e
  spaziatura si adattano; le pill non si sovrappongono al token vicino.
- [ ] **6.6** Crea una quarta condizione personalizzata sullo stesso token.
  Atteso: viene rifiutata, il limite è 3.
- [ ] **6.7** Porta l'Indebolimento da 0 a 5 e ritorno. Atteso: la scheda e
  la condizione sul token sono sincronizzate; la velocità si dimezza a 2–4 e
  va a 0 a 5.

#### 7. Incantesimi, concentrazione e reminder

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

### G3. Movimento, boss, cronologia e clock

Fonte: [SMOKE-CHECKLIST-MANUALE.md](audits/SMOKE-CHECKLIST-MANUALE.md), sezioni 8–11.

#### 8. Movimento

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

#### 9. Boss e Boss Actions

- [ ] **9.1** Azioni leggendarie: modifica A e R, valore corrente e massimo.
  Atteso: si ripristinano secondo il flusso del combattimento.
- [ ] **9.2 (MC)** Sul player, controlla i dettagli del boss. Atteso: sono
  quelli consentiti da `playerView.bossDetails`.
- [ ] **9.4 (MAP, DRAG)** Esegui un'azione ad area dalla console. Atteso:
  - la geometria si posiziona;
  - i bersagli vengono selezionati;
  - i TS sono richiesti;
  - danni e condizioni sono applicati con una sola voce di Undo.
- [ ] **9.5 (MAP)** Aura del boss e TS sul bordo: muovi un PG dentro e fuori
  l'aura. Atteso: i reminder di ingresso e uscita compaiono una sola volta.
- [ ] **9.6 (PERS)** Ricarica dopo aver usato delle azioni. Atteso: usi e
  ricariche delle azioni restano.

#### 10. Cronologia e log di combattimento

- [ ] **10.2** Esporta il log in TXT e in JSON. Atteso: entrambi i file si
  scaricano e sono leggibili.
- [ ] **10.3** Aggiungi una nota manuale; avvia un nuovo log; cancella il log
  confermando. Atteso: i tre comandi funzionano.
- [ ] **10.4 (PERS)** Ricarica il GM. Atteso: il log resta.
- [ ] **10.5 (PERS)** Apri il log da un altro browser. Atteso: il log non è
  presente, perché è locale al browser per design.
- [ ] **10.6 (MC)** Il player esegue un'azione consentita, per esempio
  muovere il proprio token. Atteso: il log del GM la registra correttamente.

#### 11. Clock

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

### G4. Quota, aree, mappa e opzioni

Fonte: [SMOKE-CHECKLIST-MANUALE.md](audits/SMOKE-CHECKLIST-MANUALE.md), sezioni 12–15.

#### 12. Quota e distanza 3D

- [ ] **12.1 (MAP)** Imposta una quota +6 m e una −3 m. Atteso: l'etichetta
  mostra direzione e valore; è leggibile e non copre la barra HP.
- [ ] **12.2 (DRAG)** Distanza 3D tra due token 1×1 adiacenti in diagonale.
  Atteso: 1,5 m.
- [ ] **12.3 (DRAG)** Distanza da un token 2×2. Atteso: misurata dal bordo
  più vicino, non dal centro.
- [ ] **12.4** Due token a 9 m planari, uno a +12 m di quota. Atteso: 15 m.
- [ ] **12.5 (PERS)** Ricarica. Atteso: le quote restano.

#### 13. Targeting AoE e zone

- [ ] **13.1 (DRAG, MAP)** Disegna cerchio, quadrato, cono, linea e
  rettangolo. Atteso:
  - la misura in metri si vede durante il trascinamento;
  - l'aggancio a centro e vertici delle caselle funziona.
- [ ] **13.2 (VIS)** Cerchio e cono. Atteso: la sagoma segue le caselle
  coperte anche parzialmente (metodo Template); la silhouette interna è
  leggibile. *(il cerchio prende le caselle con il centro nel raggio, non il metodo Template: deciso il 29/10, AREE_SU_GRIGLIA.md, D-A)*
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

#### 14. Etichette ed elementi sulla mappa

- [ ] **14.1 (DRAG, MAP)** Prova a trascinare barra HP, nome, «Turno di…»,
  `C`, pill e quota. Atteso: sono tutti bloccati.
- [ ] **14.2 (VIS)** Zoom molto vicino e molto lontano. Atteso: gli elementi
  si adattano e non si sovrappongono in modo illeggibile.
- [ ] **14.4 (MAP)** Elimina un token in iniziativa. Atteso: barre, pill ed
  etichette collegate spariscono.
- [ ] **14.5 (MAP)** Nascondi un token (visibilità OBR). Atteso: sul player
  non restano elementi derivati visibili. *(la controlla anche `runBugfixCheck`, in E1, per L16)*
- [ ] **14.6 (MAP)** Opzione `map.hpBars` disattivata. Atteso: le barre
  spariscono senza toccare gli HP.

#### 15. Opzioni

- [ ] **15.2 (PERS)** Cambia un'opzione locale e ricarica. Atteso: resta su
  questo browser e non cambia sull'altro.
- [ ] **15.3 (PERS)** Override di scena. Atteso: vale solo nella scena
  corrente.

### G5. Capacità di classe, pannelli e robustezza

Fonte: [SMOKE-CHECKLIST-MANUALE.md](audits/SMOKE-CHECKLIST-MANUALE.md), sezioni 16–18.

#### 16. Capacità di classe sul tavolo reale

- [ ] **16.1 (MAP, MC)** Aura di Protezione del Paladino. Atteso:
  - si applica agli alleati entro il raggio;
  - segue il paladino quando si muove;
  - termina se il paladino è privo di sensi. *(dal 29/10 l'aura si sospende mentre il paladino è privo di sensi e torna quando si rialza: PIANO_BUGFIX_POLISHING.md, loop dell'Annulla con le aure)*

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
- [ ] **16.8 (MAP, PERS)** Modificatori di caratteristica:
  1. su un paladino inserisci CAR +3;
  2. ricarica la pagina.

  Atteso: Percezione del Divino ha massimo 4. Con un Cavaliere Runico
  (COS +3, 9° livello), il popup della Runa del Fuoco mostra CD 15.
- [ ] **16.9 (MAP)** Patto della Catena su un famiglio **fuori
  dall'iniziativa**. Atteso:
  - la pill «Famiglio del Patto» compare sul token del famiglio e lo segue;
  - termina la pill: sparisce.
- [ ] **16.10** Limiti noti dei token fuori dall'iniziativa. Atteso,
  per design:
  - il famiglio non riceve le aure di classe, per esempio Aura di Protezione;
  - non compare nella console HP rapida;
  - non è un bersaglio delle azioni rapide.
- [ ] **16.11** Legame Migliorato senza Spirito della Fiamma. Atteso:
  l'attivazione viene rifiutata. Con lo spirito attivo, la pill termina
  insieme allo spirito.

#### 17. Pannelli recenti

- [ ] **17.1** Reminder di concentrazione: danno a un caster concentrato.
  Atteso: il reminder mostra la CD corretta (10 o metà danno).
- [ ] **17.2 (MAP)** Aure personalizzate:
  1. crea un'aura su un token;
  2. applica un preset a più token;
  3. modifica l'aura;
  4. eliminala.

  Atteso: nessun residuo sulla mappa.

#### 18. Robustezza multi-client e prestazioni

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
