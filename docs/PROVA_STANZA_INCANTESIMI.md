# Prova in stanza: incantesimi e popup

Un giro solo al tavolo per tre liste:
- **P5** del [piano di polishing degli incantesimi](PIANO_POLISH_INCANTESIMI.md);
- le prove in stanza dell'[audit dei popup viola](AUDIT_UX_POPUP_VIOLA.md): da V1 a V11, il trascinamento, F1, la tela nera di Fazioni e Aspetto area, Freccia Folgorante e Critico;
- CAP-MULTIAREA, Minuscole meteore, CAP-TELEPORT e CAP-STRUCTURE del [piano di automazione](PIANO_AUTOMAZIONE_INCANTESIMI.md), e le due caselle dei danni a due tipi (sezioni 9, 10, 11 e 12 qui sotto).

C'è anche ciò che il banco non ha potuto provare. Render è più indietro di `main`: si prova con la build locale.

Segna con una x ciò che va. Per ciò che non va, scrivi sotto, in una riga, che cosa hai visto.

## Preparazione

1. Avvia la build locale:

   ```bash
   npm run dev
   ```

2. Apri la room **Auril (Testbench)** con **Take Initiative! (LOCALE)**. Servono due finestre: quella del GM e quella dei giocatori in incognito sullo schermo del tavolo.
3. In scena servono:
   - un PG incantatore con gli slot;
   - un paladino per le punizioni;
   - due o tre goblin ostili, uno dei quali resistente al tuono e al fuoco (scheda → difese).
4. Ogni prova che parte dal tracker va fatta in vista estesa e in vista compatta.

## 1. Il vetro e la lettura

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

## 2. Le punizioni

- [ ] **Al turno:** lancia una punizione. Il popup compare accanto al caster al suo turno, sparisce quando il turno passa e torna quando torna il turno.
- [ ] **Spostato:** trascinalo dalla testata, poi muovi il token: resta dov'è. Chiuso con la ×, non torna fino al turno dopo.
- [ ] **Riga fissa:** mentre scegli bersaglio, esito e danno il popup non cambia altezza. La riga in fondo dice che cosa manca, poi `Danni N`.
- [ ] **Difesa:** Punizione Tonante sul goblin resistente al tuono.
  - Prima del danno compare `Res. tuono`.
  - Con 9 scritto, la riga dice `Res. tuono: 9 → 4` e `Danni 4`, e i PF scendono di 4.
  - Se scrivi il danno già dimezzato, un clic sul chip lo ignora.
- [ ] **Registro:** dopo quel danno, il registro di combattimento dice che la resistenza ha contato.
- [ ] **Fuori turno:** una punizione su un attacco di opportunità. Pannello incantesimi → **Incantesimi attivi sul campo** → **Risolvi** → il bersaglio sulla mappa → **Apri risoluzione**.

## 3. Gli attacchi degli incantesimi

- [ ] **Corona di Stelle:** `Colpito`, il numero, `Invio`. È comodo, o ti manca il clic secco? Dopo `Colpito`, il cursore va da solo nel danno?
- [ ] **Mancato:** si applica senza numero, la riga dice `Danni 0` e la stella si consuma.
- [ ] **Annulla:** dalla Cronologia, dopo un colpo di Corona di Stelle, tornano i PF e la stella.
- [ ] **Armi evocate:** Spada arcana o Arma spirituale dalla scheda del token. Il pulsante dice `Attacco`.
- [ ] **Critico:** su Arma spirituale o Corona di Stelle c'è `Critico`, e accanto al danno compaiono i dadi raddoppiati (`1d8 · critico 2d8`). Su un PG a 0 PF segna due fallimenti.
- [ ] **Lama del Disastro:** due attacchi, uno mancato e uno con un danno di due cifre. Le cifre restano tutte e due, e `Danni` in fondo fa il totale.
- [ ] **Fuori gittata:** sposta il bersaglio lontano prima di premere il pulsante. Il messaggio rosso resta e dice che il bersaglio è fuori gittata.

## 4. Aree e zone

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

## 5. La scelta del turno e Controincantesimo

- [ ] **Mano arcana:** l'elenco si legge dallo schermo del tavolo. Il nome del lanciatore serve?
- [ ] **Controllare Venti:** le forme brevi bastano? Il testo intero sta nel suggerimento.
- [ ] **Sguardo:** dopo aver scelto l'effetto il popup si chiude, senza messaggi rossi. Al banco si fermava su un errore del finto SDK.
- [ ] **Controincantesimo con la prova:**
  - `Contro`, `Lancia` e `Slot` si capiscono a colpo d'occhio;
  - `Lancia` come etichetta e `Lancia` come pulsante non confondono.
- [ ] **Controincantesimo su una creatura con incantesimi sulla scheda:** compare `★ in cima`, e quelli della scheda stanno in cima.

## 6. Il trascinamento

- [ ] **Dalla testata:** Controincantesimo e Palla di fuoco ritardata si spostano.
- [ ] **Pannello chiuso:** apri un'azione dal pannello, chiudi il pannello, poi sposta il popup. Si muove, con un attimo di ritardo la prima volta, e quello che avevi scritto resta.
- [ ] **Menu ⚡:** dal menu ⚡ di una pillola, il popup e il pannello che apre si spostano anche dopo che il menu si è chiuso.
- [ ] **Mano arcana:** la sua scheda, aperta dalla riga nel tracker, si sposta.

## 7. Impulso di Magia Selvaggia

- [ ] **Fucsia:** è quello che volevi?
- [ ] **Altezza:** una riga automatica e una `Al tavolo`. Il costruttore della pillola chiuso ti va bene anche nelle righe al tavolo?
- [ ] **Testi veri:** con i testi del tuo pacchetto e il costruttore chiuso, nessuna riga fa scorrere il pannello.
- [ ] **Una volta sola:** `Applica` su una pillola, poi di nuovo. Il pulsante resta spento, e un nuovo d100 lo riaccende.
- [ ] **Cura:** `Tira 2d10`, poi `Applica`.
- [ ] **Onde di Caos spese:** la scelta si legge, e la risorsa torna.

## 8. Console attacchi e mostri importati

- [ ] **Importa dall'archivio un incantatore** (Mago, Sacerdote o Fanatico): **Modifica**, **Importa**, **Leggi**, **Applica al modulo**, **Salva**.
- [ ] **I suoi incantesimi d'attacco:** in console compaiono quelli del libro (Dardo di fuoco, Dardo incantato) e si risolvono con dadi e slot, senza un'azione salvata. Sopra il danno c'è `+N al tiro`.
- [ ] **Senza slot sulla scheda:** un mostro senza slot tracciati non vede «Nessuno slot libero».
- [ ] **Frusta di Spine** su un mostro con una difesa contro le armi non magiche: danno pieno.
- [ ] **CD nel pannello:** un TS lanciato dal pannello dice `Tiro salvezza: Costituzione (CD N).`
- [ ] **Tocco del vampiro:** **Lancia** finché non è attivo, poi la console passa da sola al tocco.
- [ ] **Creare Falò** da un'azione Trucchetti: si lancia nel pannello, e la console non si riapre.
- [ ] **Lama Roboante:** in un attacco con arma da mischia compare fra gli extra solo se il PG ce l'ha.

## 9. Più aree in un lancio e Minuscole meteore

Al banco ha girato lo strumento delle aree vero, ma senza la mappa di Owlbear: qui si guarda come si disegna.

- [ ] **Sciame di meteore:** **Posiziona area**, poi quattro esplosioni una dopo l'altra. Ognuna resta sulla mappa con `1/4`, `2/4`…, e la riga di stato del pannello conta quelle che mancano.
- [ ] **Togliere un'esplosione:** premi sul numero di una: sparisce, e la prossima che disegni riprende il suo numero. Con quattro esplosioni sulla mappa, una quinta non parte.
- [ ] **Una creatura in due esplosioni:** nel pannello ha una riga sola, un TS e un danno.
- [ ] **Tempesta di fuoco:** tre cubi di 3 m in fila, poi conferma. I numeri sono `1`, `2`, `3`.
- [ ] **Cubo isolato:** un cubo lontano dagli altri, poi conferma: la conferma lo rifiuta con il suo numero. Un cubo che ne tocca un altro solo d'angolo, lo stesso. Premere sull'angolo di un cubo non lo toglie.
- [ ] **Auril:** lo sciame della Proiezione Fatata si disegna come prima, con la distanza minima e il cerchio interno.
- [ ] **Minuscole meteore:** al lancio la prima meteora; la pill del caster mostra `(5)` al 3° livello.
- [ ] **Lancia meteora:** dal ⚡ della pill, **Posiziona la meteora**, poi TS e danno: la pill scende a `(4)`. Poi una seconda meteora nello stesso turno, e una dove non c'è nessuno: si spendono tutte e due.
- [ ] **Promemoria:** al turno successivo del caster il popup della meteora si apre da solo.
- [ ] **Ultima meteora:** finisce l'incantesimo, e la `C` di concentrazione sparisce.
- [ ] **Annulla:** rimette PF e meteora.

## 10. Due caselle per i danni a due tipi

- [ ] **Due caselle, Colpo infuocato:** su un goblin resistente al fuoco, `Fuoco · 4d6` e `Radiosi · 4d6`. Il chip dice `Res. fuoco: N → N/2` e conta solo il fuoco; al 6° livello, sotto le caselle, `+1d6 al fuoco o ai radiosi`.
- [ ] **Due caselle, Onda distruttiva:** il selettore dice **Radiosi** o **Necrotici**, e la seconda casella ne prende il nome. La prima è `Tuono · 5d6`: controlla sul tuo manuale che i 5d6 da tuono ci siano.
- [ ] **Una casella vuota:** con una sola delle due scritta, il pulsante chiede `Inserisci il danno di tutte e due le parti`.

## 11. Teletrasporti (CAP-TELEPORT)

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

## 12. Muri e colonne (CAP-STRUCTURE)

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

## 13. Azioni da un altro punto (CAP-ORIGIN)

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
