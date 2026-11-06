# Prova in stanza: incantesimi e popup

Un giro solo al tavolo per due liste:
- **P5** del [piano di polishing degli incantesimi](PIANO_POLISH_INCANTESIMI.md);
- le prove in stanza dell'[audit dei popup viola](AUDIT_UX_POPUP_VIOLA.md): da V1 a V11, il trascinamento, F1, la tela nera di Fazioni e Aspetto area, Freccia Folgorante e Critico.

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
