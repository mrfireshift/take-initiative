# Prova in stanza: audit UX di sistema

Controlli a mano dei lotti dell'[audit UX](AUDIT_UX_SISTEMA.md) fatti il 31/10 (da `b701a175` a `846ea590`), prima del bundle di produzione. Ogni controllo del tracker va fatto **in vista estesa e in vista compatta**. Dove serve, si guarda anche lo schermo del tavolo.

## Preparazione

1. La build locale deve essere attiva (`npm run dev`, porta 5173). L'etichetta «LOCALE · commit» in basso nel tracker resta quella dell'avvio del server: per vederla aggiornata, riavvia `npm run dev`.
2. Apri la room **Auril (Testbench)** con **Take Initiative! (LOCALE)**. Servono due finestre: la finestra del GM e quella dei giocatori in incognito sullo schermo del tavolo. Ricarica entrambe.
3. Per il terzo controllo del punto 2 serve il profilo **Online** (Opzioni). Assegna poi al giocatore della finestra del tavolo un PG: menu della card → **Giocatore**. Alla fine torna al profilo **Tavolo**.

## 1. Testata, maniglia e compilazione

- [ ] **Estesa, striscia:** sopra la testata ci sono 6×2 pallini, con lo stesso spazio sopra e sotto. Trascinandola si sposta il tracker; il doppio clic lo ricentra.
- [ ] **Estesa, testata del GM:** contiene, nell'ordine,
  - ↺ Round;
  - il cambio di vista (icona a barra);
  - il gruppo Opzioni · Cronologia · Riposo del gruppo;
  - il gruppo **+ | ×**.

  Niente deve essere tagliato, nemmeno con il round a due cifre (porta il round a 10 o più).
- [ ] **Estesa, fondo:** sotto la lista ci sono solo ▲ ▼. Sullo schermo del tavolo non c'è nessuna riga in fondo.
- [ ] **Compatta:** l'icona del cambio di vista è una colonna divisa in tre. Il menu `…` ha, nell'ordine: Reset round, Cronologia, Riposo del gruppo, Etichette mappa, Opzioni, Aggiungi attori, Svuota iniziativa.
- [ ] **Compilazione:** con **Aggiungi attori** (o con un token nuovo in iniziativa) la compilazione delle iniziative parte da sola.
  - **Invio** o **Tab** passa alla creatura successiva.
  - **Ctrl+Invio** o **Esc** chiude la compilazione.
  - Le card si riordinano alla fine.
  - In nessun punto compare più il pulsante giallo "Compila iniziativa".

## 2. Lotto U11

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

## 3. Riposo del gruppo (U6′)

- [ ] **Riposo breve:** il campo «PF recuperati» di un PG si somma ai suoi PF. Le capacità che si ricaricano con il riposo breve tornano al massimo.
- [ ] **Riposo lungo:**
  - PF al massimo e PF temporanei azzerati;
  - le risorse di classe si ricaricano;
  - l'Indebolimento scende di 1 solo se spunti la casella;
  - un PG a 0 PF non riceve i benefici del riposo lungo, e chi è morto non riposa.
- [ ] Il riposo è una sola voce della Cronologia: un **Annulla** rimette PF e risorse com'erano. L'Indebolimento passa dal salvataggio della scheda di ciascun PG, quindi si annulla a parte.

## 4. Animazioni dei gruppi (U13)

- [ ] Apri e chiudi un gruppo di omonimi (per esempio i goblin), in tutte e due le viste.
  - **Estesa:** la lista non salta all'inizio. In apertura segue il gruppo che si allarga; in chiusura i membri svaniscono con la card madre.
  - **Compatta:** a fine animazione nessuno scatto.
- [ ] Sullo schermo del tavolo l'animazione arriva con circa 1 s di ritardo, ed è un limite noto. Segnala se è peggio.

## 5. PF e console (U1, U3, U4)

- [ ] Ovunque si legge **PF**, mai HP: card, editor, console, Cronologia, Opzioni. I PF condivisi hanno la loro icona.
- [ ] **Anteprima delle reazioni:** su un bersaglio con **Vincolo di interdizione** o **Interdizione alla morte**, l'anteprima della console Effetti mostra i PF che il comando scriverà davvero (per esempio 1 PF con Interdizione alla morte, non 0).
- [ ] Il **registro di combattimento** spiega perché i PF sono diversi dal danno chiesto: resistenze, reazioni, danno massiccio.
- [ ] Menu della card → **Ultime modifiche…** apre il registro filtrato su quella creatura.
- [ ] **Doppio clic:** due clic rapidi su Applica, nella console Effetti e nella console Boss. Il pulsante mostra «Applico…» e il danno arriva una volta sola.

## 6. Menu della card (U2)

- [ ] Ogni creatura ha la voce della scheda nel menu: «Scheda personaggio» per PG e alleati, «Statblock» per gli altri. Movimento resta tra i quattro strumenti.
- [ ] La **Console Boss** si apre dal token di un boss anche quando il token ha un profilo collegato.

## 7. Facoltativo: verifica del bugfix (L23)

`__tbpPerf.runBugfixCheck()` non è mai stata eseguita in una stanza vera. La procedura è in [Prova in stanza: fluidità](PROVA_STANZA_FLUIDITA.md), sezione della verifica bugfix. Salva `perf-runs/verifica-bugfix.json`.

## Esito

Per ogni casella non spuntata annota:
- la vista (estesa o compatta);
- la finestra (GM o tavolo);
- cosa hai visto.

Dopo le correzioni si passa al bundle di produzione. Ricorda di aggiungere con `git add -f` i file nuovi di `dist/`:
- `shared-hp.svg`
- `group-rest.html`
- `group-rest.css`
- `group-rest.svg`
- `player-screen.html`
