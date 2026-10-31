# Audit UX di sistema — Take Initiative!

Data: 31/10/2026. Fase 1, in sola lettura: nessun file di codice modificato.

Domanda dell'utente: il plugin è cresciuto molto nelle funzioni, ma la user
experience è cresciuta altrettanto? Cosa manca per usarlo al tavolo, cosa manca
online, e quali accorgimenti UX servono davvero?

## In breve

- **I pannelli, uno per uno, sono già curati.** L'audit UI del 22/10 e quello
  della console attacchi del 23/10 sono chiusi. Questo audit non li ripete e non
  ripropone le cose già scartate: la soglia dei 10 px (V4), la × sulle pill, il
  conteggio delle azioni del turno, «Danno/cura…» nel menu del token.
- **Il debito ora è di sistema.** Le funzioni sono cresciute una console alla
  volta, e il percorso del GM tra una console e l'altra non è mai stato
  ripensato insieme. Il GM ha sette superfici parallele per agire su una
  creatura. «Effetti» vuol dire tre cose diverse. La card compatta e quella
  classica offrono gesti diversi.
- **L'automazione è più avanti della sua spiegazione.** Il piano dei PF calcola
  i motivi (Vincolo di interdizione, Interdizione alla morte, resistenze), ma
  molti si perdono prima di arrivare al registro. L'anteprima della console PF
  può mostrare 0 PF quando il comando ne scrive 1.
- **Al tavolo mancano l'inizio e la fine del combattimento.** Nessun tiro
  d'iniziativa per i mostri, anche se il modificatore di Destrezza è già sul
  token. Nessuna chiusura del combattimento: la guida chiede al GM di ripulire
  a mano effetti, zone e concentrazioni.
- **Online il giocatore resta uno spettatore**, anche se il plugin ha già quasi
  tutto per coinvolgerlo. I promemoria sanno chi deve tirare e con che CD, e i
  dadi nel plugin esistono già (D-1…D-5). Manca il ritorno del risultato al GM
  come proposta da confermare.
- **Proposta:** 12 lotti piccoli e indipendenti (sezione 4) e 9 decisioni
  (sezione 6). Come sempre, i default del tavolo restano quelli di oggi, e ogni
  novità solo online vale soltanto nel profilo Online.

## 1. Metodo

- Il codice è stato letto il 31/10 su `main` (`ca12a172`), con le modifiche non
  committate di altre sessioni presenti nella cartella (CAP-TEMP). Ogni rilievo
  cita file e righe.
  - «Dedotto» indica un comportamento ricavato dal codice e non riprodotto.
  - `IL` sta per `src/initiativeList.js`.
- Ho guardato il tracker nel banco `test-support/ui-audit-browser/`, nelle viste
  GM e giocatore, compatta, al 100% e al 150%.
- Ho verificato nel banco un sospetto: le card «Azione epica» di un boss epico
  nascosto arriverebbero ai giocatori. **Non è confermato.** Con Auril nascosta
  la vista giocatore non mostra né Auril né le sue card epiche.
- Fonti a confronto: `docs/AUDIT_UI.md`, `docs/PIANO_POLISHING_UI.md`,
  `docs/AUDIT_GIOCO_ONLINE.md`, `docs/PIANO_DADI_ONLINE.md`,
  `docs/GUIDA_UTENTE.md` (sezione 15, il flusso consigliato al tavolo).

## 2. Rilievi

Gravità: **Alta** cambia l'esperienza di ogni sessione; **Media** si nota spesso;
**Bassa** è un dettaglio. ⚠ segna le aree fragili di `AGENTS.md`.

### A. Un modello d'interazione unico

**UX-01 · Alta · Sette superfici per agire su una creatura, con regole
diverse.** Sono la card compatta, la card classica, il menu della card, il menu
del token, la griglia del pannello destro, il menu ⚡ e la scheda. Ogni azione
ha 3–5 strade.

| Azione | Strade |
| --- | --- |
| Danno o cura | testo PF compatto, pillola PF classica, «±» classico, «Effetti» della barra, console ad area dal modello d'area |
| Condizione | «Condizioni» della barra, sottomenu della card, sottomenu del token, menu ⚡, modello d'area |
| Incantesimo | «Incantesimi» della barra, menu della card, menu ⚡, scheda, console 🗡️ per trucchetti e attacchi, modello d'area |
| Attacco PG | 🗡️, menu ⚡, scheda, menu della card per i soffi |

Le divergenze che pesano:
- Scheda: l'icona compare per ogni creatura (GM), la voce del menu della card
  solo per PG e alleati (`src/initiativeMenuActionsCore.js:71-72`). E sullo
  statblock di un mostro si chiama comunque «scheda personaggio».
- Console Boss: dalla card compare per un boss epico **o** con un profilo
  collegato (`src/trackerQuickActions.js:255`, `IL:9015-9025`). Dal menu del
  token compare solo per il boss epico (`src/contextMenu.js:269-279`).
- La griglia del pannello destro mescola comandi sulla selezione (Condizioni,
  Incantesimi, Effetti) con un interruttore globale (Movimento, `IL:2322-2346`).

Non serve un menu identico ovunque: «Danno/cura…» nel menu del token l'hai tolto
di proposito il 23/10 (`src/contextMenu.js:298-299`). Serve una regola scritta,
che dica cosa sta dove, e che sia rispettata.

**UX-02 · Media · «Effetti» vuol dire tre cose.**
- «Effetti» della barra apre la «Console effetti manuali», cioè PF e TS (`IL:2311`,
  `quick-hp-modal.html:6`). Dentro, «Effetti» è anche la scheda dei TS (`:118`).
- `effects-modal.html` e `openCardEffectsPopup` sono in realtà il pannello
  **Condizioni** (`IL:8124-8140`).
- «+N» / «Altri effetti» sulla card compatta indica condizioni e incantesimi
  (`src/initiativeCardCompact.js:943`, `:1102`).

Le icone fanno lo stesso:
- `quick-damage.svg` è l'icona sia della console «Effetti» sia di «HP condivisi»
  (`src/contextMenu.js:284`);
- ⚡ apre sia le azioni rapide della card (`src/trackerQuickActions.js:82`) sia
  le azioni di un incantesimo (`src/initiativeCardCompact.js:311`).

**UX-03 · Bassa · Piccole incoerenze di testo.** Una per una non pesano. Tutte
insieme fanno sembrare il plugin cucito a pezzi.
- HP e PF: «PF» nella pillola classica (`src/initiativeCardClassicBuilder.js:1036`),
  «HP» nel compatto e nei «±».
- «Clic:» nel compatto (`src/initiativeCardCompact.js:853`), «Click per…» nel
  classico (`src/initiativeCardClassicBuilder.js:743`).
- Lingue mescolate: «Epic Boss» e «Paragon Boss» nei menu
  (`src/initiative-card-context-menu.js:419-420`, `src/contextMenu.js:651`),
  «Boss Epico» sul badge (`src/initiativeCardCompact.js:530`).
- 🗡️ ha il tooltip «console attacchi» (`src/trackerQuickActions.js:120`), ma la
  console si intitola «Attacco» (`pc-attack.html:6`). Il commento del codice
  parla ancora di ⚔ (`:80`).
- La scheda rimanda al «menu 🪄 della card» (`initiative-card-modal.html:564`),
  che non è più montato (`IL:9035`).
- Apostrofo dritto in «Rimuovi dall'iniziativa» del menu della card
  (`src/initiative-card-context-menu.js:435`), tipografico nel menu del token
  (`src/contextMenu.js:337`).

**UX-04 · Bassa · Il compatto non permette di togliere un effetto dalla card.**
Il classico ha la × su condizioni e incantesimi (`src/conditions.js:1604-1606`,
`src/spells.js:342`). Il compatto ce l'ha solo sulle capacità di classe
(`src/initiativeCardCompact.js:351-357`). La × sulle pill è stata scartata il 23/10
perché è facile da toccare per sbaglio, e la scelta resta valida. Il cassetto
degli effetti, aperto dal «+N», potrebbe però offrire lo stesso toggle del menu
(da verificare se oggi lo fa).

### B. Inizio e fine del combattimento

**UX-05 · Alta · Nessun tiro d'iniziativa.** Ho cercato `rollInitiative`,
`initBonus`, `d20(` e `Math.random`: nessun codice tira l'iniziativa.
- «Aggiungi attori» scrive `initiative: previous ?? 10` (`IL:1899-1901`) e avvia
  «Compila iniziativa» (`IL:1913`). Lì il GM digita ogni valore (`IL:7475-7558`).
- Il modificatore di Destrezza c'è già. Sta nel `meta` del token, in
  `initiativeCard.abilityModifiers` (`src/abilityModifiersCore.js:1-4`). Lo
  scrivono l'import della scheda e quello dello statblock
  (`src/characterSheetImportCore.js:106-116`, applicato a `:436`).
- I mostri di 5eTools hanno le caratteristiche complete
  (`src/fiveToolsMonsterCore.js:665`, `:698`). Il bonus d'iniziativa 2024 invece
  è solo testo dell'intestazione (`:455-458`).
- I gruppi omonimi hanno già un seme: il primo valore va a tutti
  (`trySeedGroupInitiative`, `IL:5692-5753`).

All'inizio di ogni combattimento il GM digita le iniziative dei mostri, che il
plugin saprebbe tirare da solo.

**UX-06 · Alta · Nessuna chiusura del combattimento.** «Svuota iniziativa»
(`IL:1965-2034`) toglie `inInitiative` e azzera ordine, turno e round. Restano
sulla scena:
- incantesimi attivi e concentrazioni;
- condizioni con durata;
- zone e aure, che smettono di agire sui token ma restano disegnate (dedotto da
  `src/spellAuraController.js:164-169` e `src/spellStaticZone.js:728-733`).

La guida chiede al GM di terminare a mano gli effetti e di controllare zone, aure
e condizioni (`docs/GUIDA_UTENTE.md:870-871`). È proprio il bookkeeping che il
plugin vuole eliminare.

**UX-07 · Bassa · Il riposo si fa un personaggio alla volta.** «Riposo breve» e
«Riposo lungo» stanno solo nella scheda di ogni PG
(`src/initiative-card-modal.js:1088-1135`) e ripristinano le risorse, non i PF
(dedotto).

**UX-08 · Bassa · Il tracker vuoto non guida nessuno.** Con l'ordine vuoto il
tracker non mostra testo (`IL:11008-11010`). La pagina dice solo «Caricamento
tracker…» (`index.html:177-180`).

### C. Feedback e fiducia nell'automazione

**UX-09 · Alta · Il motivo di una variazione dei PF si perde.** Il piano lo
calcola, ma non lo salva né lo mostra:
- **Vincolo di interdizione:** `planWardingBondDamage` restituisce le note
  (`src/reactionHpCore.js:50-83`). `src/effectsMutations.js:930-955` marca il
  danno con `eventId: "warding-bond"`, ma nessun file di registro o Cronologia lo
  legge (verificato). Nel registro il caster perde PF senza un motivo, a volte
  con «Fonte: non tracciata».
- **Interdizione alla morte:** la nota «resta a 1 PF e l'interdizione termina»
  (`src/reactionHpCore.js:37`) non viene mai usata (`src/effectsMutations.js:1384`,
  `:1438`, verificato). Si vede solo che la pill sparisce.
- **Resistenze, immunità, vulnerabilità:** la console Boss tiene i componenti
  del danno (`src/bossActionExecutionCore.js:226-228`). La normalizzazione del
  registro però conserva solo danno richiesto, PF applicati e fattore
  (`src/combatLogCausalityCore.js:320-344`, verificato).
- **Incantesimi ad area:** le note compaiono solo come messaggio passeggero del
  pannello (`src/spell-unified-panel.js:1876-1881`), non nella Cronologia.
- **Danno massiccio:** porta a «Morto» senza dire perché
  (`src/deathSaveCore.js:164`).
- I PF temporanei invece sono spiegati bene
  (`src/combatLogPresentationCore.js:324-339`). È il modello da estendere.

**UX-10 · Media (difetto) · L'anteprima della console PF può mentire.**
`previewFor` (`src/quick-hp-modal.js:269-290`) usa solo `calculateQuickHPChange`
e non conosce Interdizione alla morte e Vincolo di interdizione (verificato). Può
mostrare 0 PF mentre il comando ne scrive 1, o non mostrare i danni del caster
legato.

**UX-11 · Media · Dalla card non si arriva al «perché».** La Cronologia si
apre solo dal pulsante della barra (`IL:2151-2170`), senza bersaglio. Per una
creatura servono il filtro «Partecipante» a mano
(`src/history-modal.ts:1630-1662`) e un clic per aprire i dettagli. Non esiste
una vista «ultime modifiche» per creatura.

**UX-12 · Media · Il comando in volo si vede poco.**
- La pillola PF è ottimistica: la card cambia subito
  (`src/initiativeEditors.js:568`). Va bene così.
- La console PF disabilita Applica, ma il pulsante non cambia testo. In più
  `busy` viene acceso solo dopo tre `await` (`src/quick-hp-modal.js:757` contro
  `:816`): un doppio clic veloce può passare (dedotto).
- La console Boss disabilita la barra senza cambiare etichetta
  (`src/boss-actions.js:97-123`).
- La console attacchi è il modello giusto: il pulsante dice «Registro…» o
  «Lancio…» (`src/pc-attack.js:2057-2074`).
- Nessun segno sulla card quando i PF cambiano, per nessun client (grep vuoto).

### D. Velocità del GM

**UX-13 · Media · La tastiera serve solo per il turno e per l'Annulla.**
Spazio, ← e → (`IL:2050-2075`), Ctrl+Z e Alt+Z (`IL:2080`), solo con il focus nel
tracker. Owlbear non dà scorciatoie globali alle estensioni. Dentro il tracker
però il focus funziona, e una riga di comando (`kios -12`, `goblin prono`)
toglierebbe la ricerca della console giusta. È il guadagno di clic più grande
che resta, ed è anche un progetto a sé.

### E. Online

**UX-14 · Alta (online) · Il giocatore non partecipa ai tiri che lo
riguardano.** Il plugin ha già quasi tutto:
- l'avviso del giocatore porta `activationId`, caratteristica, CD e
  `targetPlayerIds` (`src/effectSaveReminderCore.js:457-479`,
  `src/options/reminderProjectionBroadcast.js:84-92`);
- il vassoio dei dadi conosce formula e vantaggio (`src/dice-tray.js:237-258`);
- esiste già un modello di richiesta e risposta con `connectionId` (il replay
  dell'avviso, `src/turnNoticeHost.js:409-424`).

Mancano un canale di ritorno e la proposta precompilata nel tracker del GM. Due
vincoli:
- il canale nuovo deve controllare `connectionId` e `playerId`, perché il
  coordinatore non lo fa (ON-19, `src/effectsMutations.js:4593-4603`);
- il piano dadi dice «nessuna automazione dei risultati»
  (`docs/PIANO_DADI_ONLINE.md:17-18`). Una proposta che il GM conferma lo
  rispetta, ma è una decisione tua (D6).

**UX-15 · Media (online) · I giocatori non sanno cosa è successo.** Il registro
è solo del GM (`IL:11686`, `:11693`; `src/history-modal.ts:1115-1117`). Al tavolo
il GM racconta a voce; online i giocatori vedono solo i PF che cambiano, e solo
quelli che la policy mostra (`src/options/optionsDefaults.js:86-116`). I metadata
della stanza sono al tetto (14.490 su 14.500 byte), quindi un racconto dovrebbe
viaggiare in broadcast.

**UX-16 · Media · Le card epiche occupano lo spazio dei giocatori.** Un boss
epico aggiunge una card virtuale dopo **ogni PG** (`IL:11455-11464`,
`makeEpicActionEntry` a `IL:1024-1040`). Con 4 PG sono 5 card da 92 px per un solo
boss (`src/constants.js:15`). Sono card senza PF e con la sola etichetta «Azione
epica» (`src/initiativeCardCompact.js:753-787`). Online, su un portatile piccolo,
spingono fuori schermo i PG.

**UX-17 · Bassa (online) · «La mia scheda» non ha un accesso diretto.** Il
giocatore apre in sola lettura la scheda di qualsiasi PG
(`src/initiativeCardSheetAccessCore.js:6-8`). La sua è segnata con «Tu», ma il
menu ⚙ non ha un accesso diretto (`player-screen.html:99-117`).

**UX-18 · Bassa · Nessuna versione né novità visibili.** `build-info.json` è
esposto solo come `globalThis.__tbpBuildInfo` (`src/buildInfo.js:17-18`).
Online ogni funzione arriva solo con il bundle, ma né il GM né i giocatori sanno
quale versione stanno usando.

## 3. Cosa resta fuori

Ho guardato anche le Opzioni: sei sezioni e 33 controlli, ordinate per chi le
usa (Vista GM, Registro, Console attacchi, Vista giocatori, Turno e mappa,
Automazioni). Non sono un problema e non propongo lotti.

## 4. Lotti proposti

Un lotto per commit, con test, `npm test` e `npm run build`. Per i lotti ⚠, prima
della patch spiego il rischio e aspetto il via.

### U1 · Nomi e icone coerenti (UX-02, UX-03) — rischio nullo

- La console PF prende il nome deciso in D1, sia sul pulsante sia nel titolo.
  «Condizioni» resta il pannello `effects-modal`. Il «+N» diventa «Altri
  effetti» solo nel tooltip.
- Icona propria per «HP condivisi».
- PF ovunque nei testi rivolti all'utente, «Clic» ovunque, «Boss epico» e «Boss
  Paragon» in italiano.
- Il tooltip di 🗡️ e il titolo della console coincidono.
- Si toglie il rimando al menu 🪄 dalla scheda.
- Apostrofi tipografici.
- Solo testi, tooltip e icone. Niente ID, chiavi o nomi di funzione.

### U2 · Una regola scritta per i menu (UX-01) — rischio basso

- Una tabella in `docs/` stabilisce cosa sta dove:
  - **menu della card:** completo, è il centro di tutto;
  - **menu del token:** solo ciò che serve stando sulla mappa (condizioni,
    quota, aure, boss, iniziativa);
  - **lanciatori:** scorciatoie verso le console.
- Allineare le condizioni di visibilità che oggi divergono: scheda per ogni
  creatura anche nel menu della card, con «Statblock» come nome per i mostri
  (D2); Console Boss dal menu del token anche per i boss con un profilo
  collegato.
- Movimento esce dalla griglia della selezione e va nel menu `…`, o resta con un
  aspetto da interruttore, diverso dai comandi (D2).

### U3 · Ricevute dei PF (UX-09, UX-10, UX-11) ⚠ HP

- Le note di Vincolo di interdizione e Interdizione alla morte, i componenti del
  danno con la difesa applicata e il danno massiccio entrano nella causalità
  della voce di Cronologia. Il registro li mostra con lo stesso schema dei PF
  temporanei:
  - «−14: resistenza (freddo) → 7 ai PF»;
  - «Vincolo di interdizione: Omar subisce 7 danni con Kios».
- Le note degli incantesimi ad area vanno nella loro causalità
  (`spellAreaCausality`).
- L'anteprima della console PF usa lo stesso piano del commit per Interdizione e
  Vincolo, oppure segnala «la reazione può cambiare il risultato».
- Nuova voce nel menu della card, «Ultime modifiche…», che apre il registro
  filtrato su quella creatura.
- Rischio: si toccano solo i dati che descrivono le variazioni, non i valori dei
  PF scritti. Il piano di `effectsMutations.js` è condiviso con le modifiche
  CAP-TEMP non committate: da coordinare con quella sessione.

### U4 · Comandi in volo visibili (UX-12) — rischio basso

- Console PF: `busy` acceso prima del primo `await`, e il pulsante dice
  «Applico…». Stessa cosa nella console Boss. Il modello è la console attacchi.
- La pillola ottimistica resta com'è.

### U5 · Tiro d'iniziativa (UX-05) ⚠ ordine

- In «Compila iniziativa», un pulsante «Tira per i mostri» tira d20 più il
  modificatore di Destrezza dal `meta` per ogni voce non PG ancora da compilare
  (`initTouched !== true`). Un gruppo omonimo tira una volta sola, usando il seme
  che esiste già.
- I PG restano da compilare a mano: al tavolo tirano con i dadi fisici. Online
  potranno farlo con U9 o con il vassoio.
- Le card restano ferme durante la compilazione, come oggi. L'ordine si
  riordina alla fine con il percorso attuale (`finishInitiativeFillMode`).
- Senza modificatore il bonus è +0, e la card lo segnala.

### U6 · Chiudi combattimento (UX-06, UX-07) ⚠ metadata, zone

- Una voce nel menu `…` apre un riepilogo di ciò che resta attivo, raggruppato:
  concentrazioni, incantesimi con durata, condizioni con durata, zone e aure.
  Ogni riga ha una casella, preselezionata secondo la regola di D4.
- Con una conferma, gli effetti selezionati terminano, l'iniziativa si svuota e
  si registra **una** voce di Cronologia, con Annulla. Si usano i comandi di
  termine che esistono già, non un percorso nuovo.
- Facoltativo: «Riposo breve» e «Riposo lungo» per tutti i PG dallo stesso
  pannello, tramite la funzione per personaggio che c'è già.
- Gli attachment delle barre PF non si toccano.

### U7 · Card epiche strette (UX-16) — rischio basso, solo disegno

- La card virtuale «Azione epica» diventa una linguetta stretta (~36 px) con il
  ritratto del boss e «EP», come la linguetta dei compagni.
- Si cambia solo il disegno: gli ID virtuali restano quelli di oggi.
- Ambito secondo D9.

### U8 · Segno sulla card quando i PF cambiano (UX-12, UX-15) — rischio basso

- Un lampo breve e il numero (−7 / +5) sulla card. Il numero compare solo dove la
  policy dei PF lo mostra; dove i PF sono nascosti, solo il lampo.
- Al tavolo aiuta chi guarda lo schermo; online sostituisce lo sguardo verso il
  GM. Ambito secondo D5.
- Si appoggia all'aggiornamento della card che già esiste; con «riduci
  movimento» c'è solo il numero.

### U9 · Richiesta di tiro online (UX-14) ⚠ avvisi, coordinatore

- Prima si chiude ON-19: il coordinatore accetta solo il proprio client.
- Online, l'avviso del giocatore bersaglio ha un pulsante «Tira TS DES». Il
  vassoio apre la formula già impostata e il risultato parte su un canale nuovo:
  `{activationId, playerId, connectionId, totale, dadi}`.
- Il client del GM controlla che il giocatore sia tra i `targetPlayerIds` e che
  il promemoria sia ancora aperto. Poi mostra sulla riga del promemoria
  «Kios: 14 → fallito?», con l'esito precompilato.
- Il GM conferma con un clic, e parte il `resolveReminder` di oggi.
- Al tavolo non cambia niente.

### U10 · Racconto per i giocatori online (UX-15)

- Online, dopo ogni voce di Cronologia, il GM manda in broadcast una riga breve
  già filtrata, per esempio «Il Goblin colpisce Kios: 7 danni» o «Auril è
  ferita». I PF dei nemici sono nascosti secondo la policy.
- Il tracker del giocatore tiene le ultime 10 righe in un cassetto. Chi entra le
  chiede al GM, come per il replay dell'avviso.
- Niente nei metadata della stanza. Livello di dettaglio secondo D7.

### U11 · Piccoli (UX-04, UX-08, UX-17, UX-18) — rischio basso

- Tracker vuoto del GM: «Nessuna creatura in iniziativa», con il pulsante
  «Aggiungi attori». Per i giocatori: niente.
- Cassetto degli effetti del compatto: lo stesso toggle del menu delle
  condizioni, se oggi manca (da verificare).
- Menu ⚙ del giocatore: «La mia scheda».
- Opzioni → Manutenzione: versione, data della build e link alla guida.

### U12 · Riga di comando nel tracker (UX-13) — progetto a sé

- Un campo che si apre con un tasto, con il focus nel tracker: nomi delle
  creature con completamento, poi numero, condizione o incantesimo. Ogni comando
  passa per le stesse console e la stessa Cronologia.
- Serve un piano dedicato prima del codice, come per i dadi. Lo propongo solo
  dopo U1–U4 (D8).

**Ordine consigliato:** U1 → U4 → U3 → U5 → U2 → U8 → U6 → U7 → U11; poi U9 →
U10 online; U12 con il suo piano.

## 5. Cosa sconsiglio

- Rifare i pannelli già curati, o ripensare dimensioni dei font e × sulle pill.
- Un profilo «Essenziale» che nasconda Boss, clock e console d'area, finché il
  plugin resta per il tuo tavolo. Diventa utile solo se lo pubblichi per altri
  GM.
- Avvisi o toast di conferma dopo ogni danno: al tavolo coprono la mappa. Meglio
  il segno sulla card (U8) e le ricevute a richiesta (U3).
- Tiri dei giocatori che si applicano da soli: il GM conferma sempre (U9).
- Un racconto per i giocatori nei metadata della stanza: è al tetto.

## 6. Decisioni

| # | Decisione | Consiglio |
| --- | --- | --- |
| D1 | Nome della console oggi «Effetti» (PF, danni, cure, TS): «PF e TS», «Danni e cure», lasciare «Effetti» | «PF e TS» |
| D2 | Menu e griglia: scheda dal menu della card per ogni creatura («Statblock» per i mostri)? Movimento fuori dalla griglia? | Sì a entrambe |
| D3 | Tiro d'iniziativa: per tutti i non PG, solo per i nemici, mai | Tutti i non PG, i gruppi una volta sola |
| D4 | Chiudi combattimento, cosa preselezionare: tutto, solo effetti in round o fino a 1 minuto più le concentrazioni, niente | Round, fino a 1 minuto e concentrazioni; le durate in ore restano |
| D5 | Segno PF sulla card: GM, tavolo e online; solo online; niente | GM, tavolo e online |
| D6 | Richiesta di tiro online: proposta precompilata che il GM conferma, oppure niente (i dadi restano solo informativi) | Proposta da confermare, solo Online |
| D7 | Racconto per i giocatori online: solo esiti, esiti con i numeri dove la policy li mostra, niente | Esiti con i numeri dove la policy li mostra |
| D8 | Riga di comando: piano adesso, dopo U1–U4, mai | Dopo U1–U4 |
| D9 | Card epiche strette: in entrambe le viste, solo nella vista giocatori | Entrambe |

### Risposte dell'utente (31/10)

| # | Risposta |
| --- | --- |
| D1 | La console resta «Effetti». |
| D2 | Sì a entrambe: scheda dal menu della card per ogni creatura, Movimento fuori dalla griglia. |
| D3 | Sì, ma come opzione facoltativa e spenta: al tavolo l'utente tira a mano le iniziative e preferisce così. |
| D4 | La chiusura del combattimento non serve. Servono invece strumenti per il riposo breve e il riposo lungo del gruppo. |
| D5 | Niente segno sulla card quando i PF cambiano. |
| D6 | Richiesta di tiro online: in backlog. |
| D7 | Racconto per i giocatori online: non serve. |
| D8 | Riga di comando: non serve. |
| D9 | Card epiche strette: non servono. |
| D10 | Nuova: rifinire le animazioni di apertura e chiusura dei gruppi, da studiare (sezione 8). |

## 7. Lotti dopo le risposte

Escono U6 (chiusura del combattimento), U7, U8, U10 e U12. U9 va in backlog.
Restano questi, nell'ordine consigliato:

| Lotto | Contenuto | Rischio |
| --- | --- | --- |
| U1 | Nomi e icone coerenti, tranne «Effetti» che resta (UX-03, e UX-02 per le icone) | nullo |
| U4 | Comandi in volo visibili nelle console PF e Boss (UX-12) | basso |
| U3 | Ricevute dei PF e anteprima corretta (UX-09–11) | ⚠ HP, da coordinare con CAP-TEMP |
| U2 | Regola dei menu: scheda per ogni creatura («Statblock» per i mostri), Console Boss dal token anche con profilo collegato, Movimento fuori dalla griglia (UX-01) | basso |
| U5 | Tiro d'iniziativa come opzione facoltativa, spenta per default (UX-05) | ⚠ ordine |
| U6′ | Riposi del gruppo (UX-07, al posto di U6) | ⚠ HP se D11 lo prevede |
| U13 | Animazioni dei gruppi (D10, sezione 8) | ⚠ render del tracker |
| U11 | Piccoli: tracker vuoto, toggle nel cassetto, «La mia scheda», versione (UX-04, 08, 17, 18) | basso |

### U5 · Tiro d'iniziativa facoltativo ⚠ ordine

- Nuova opzione del GM, spenta: «Tiro d'iniziativa per i mostri». Con
  l'opzione spenta, «Compila iniziativa» resta identico a oggi.
- Con l'opzione accesa compare un pulsante in «Compila iniziativa». Tira d20
  più il modificatore di Destrezza dal `meta` per ogni voce non PG ancora da
  compilare. Un gruppo omonimo tira una volta sola, con il seme che esiste già.
  I PG restano a mano.
- Le card restano ferme durante la compilazione, come oggi, e si riordinano alla
  fine con `finishInitiativeFillMode`.

### U6′ · Riposi del gruppo (D4)

Oggi «Riposo breve» e «Riposo lungo» stanno nella scheda di ogni PG
(`src/initiative-card-modal.js:1088-1135`). Ripristinano le risorse di classe,
gli slot e gli usi delle azioni rapide (`resetCharacterResources`,
`src/classFeatureRuntime.js:2076-2100`), non i PF. Il plugin non tiene il
conto dei Dadi Vita.

Proposta:
- Nel menu `…`, «Riposo del gruppo…» apre un pannello con i PG della scena,
  tutti selezionati, e due pulsanti: Riposo breve e Riposo lungo.
- Il riposo usa la funzione per personaggio che esiste già, una volta per PG,
  in **un solo** comando con una sola voce di Cronologia e un solo Annulla.
- Il pannello riepiloga il risultato per PG («Lavera: 2 slot, Ispirazione
  Bardica») e ricorda di rivedere gli incantesimi preparati, come fa oggi la
  scheda.
- Cosa fa il riposo lungo oltre alle risorse, e se il breve prevede i PF, lo
  decidono D11 e D12.

## 8. D10 · Animazioni dei gruppi

### Come funzionano oggi

- A ogni cambio di turno il GM ricalcola quali gruppi sono chiusi: si apre il
  gruppo attivo e si chiudono gli altri (`__autoCollapseSnapshot`,
  `src/initiativeOrderCore.js:63`). Lo stato è scritto solo dal GM; il tavolo
  lo riceve con l'evento dei metadata successivo (`IL:12037-12064`).
- L'animazione è in `__replaceTrackCardsMagnetic` (`IL:10044-10395`):
  - le card del gruppo vanno in un contenitore temporaneo, lo «stage», con
    posizione assoluta;
  - lo stage anima la propria larghezza (`flexBasis`, `width`, `minWidth`)
    tra la card singola e il gruppo aperto;
  - le card scorrono con `transform`, sfalsate di 34 ms l'una (al massimo
    140 ms), in 460 ms con `cubic-bezier(.45,0,.55,1)`;
  - la card «madre» (il gruppo chiuso) entra o esce con una dissolvenza di
    220 ms;
  - un `setTimeout` a durata + 80 ms (`IL:10393`) annulla le animazioni e
    rimette le card definitive.
- Con «riduci movimento» le card si sostituiscono senza animazione
  (`IL:10065-10068`).

### Misura nel banco (apertura, 4 goblin, vista compatta)

Campionamento ogni 15 ms durante il turno che entra nel gruppo:
- lo stage cresce da 92 a 385 px in circa 600 ms, la madre sparisce in 220 ms;
- **le card si incrociano:** a 259 ms la card 4 è a 363 px e la card 3 a 367;
  a 301 ms la 4 è a 400 e la 3 a 397. Lo sfalsamento fa partire dopo le card
  che devono fare più strada, che poi superano quelle davanti;
- **scatto finale:** a fine animazione le card passano da 414/511/608 a
  412/509/606 px. Le posizioni d'arrivo sono misurate fuori dallo stage, con
  spaziature diverse;
- la chiusura non è misurabile qui: con il pannello del browser nascosto i
  fotogrammi si fermano. Va misurata con il pannello in vista o in stanza.

### Dal codice (dedotto)

- **Colore piatto durante la chiusura:** le card non attive ricevono uno sfondo
  fisso `rgb(31, 39, 51)` (`IL:10187`), che copre la tinta di fazione e lo stato
  KO o nascosto per tutta la chiusura.
- **Layout a ogni fotogramma:** animare la larghezza dello stage ricalcola il
  layout di tutta la striscia a ogni fotogramma. Le card dopo il gruppo si
  spostano per reflow, non con `transform`. Sui portatili deboli e sullo schermo
  del tavolo, che disegna due finestre, è il punto più probabile di scatti.
- **Due movimenti in fila sul tavolo:** prima si sposta l'evidenziazione del
  turno, poi, con l'evento successivo dei metadata (circa 1 s dopo, misura del
  28/10), il gruppo si apre o si chiude.
- **Fine con un timer:** il `setTimeout` fisso non aspetta la fine reale delle
  animazioni. Se il main thread rallenta, il timer taglia l'animazione a metà
  (scatto); se le animazioni restano ferme, come nel banco nascosto, lo stage
  resta visibile fino al timer.

### U13 · Proposta, da approvare dopo una misura in stanza ⚠

1. **Misura** con il pannello in vista e in stanza (GM e tavolo, con
   `__tbpPerf`): durata reale, fotogrammi persi, ritardo tra evidenziazione e
   apertura sul tavolo.
2. **Niente incroci:** sfalsamento a partire dall'ultima card nell'apertura,
   oppure stessa partenza per tutte con durate proporzionali alla distanza.
3. **Niente scatto finale:** posizioni d'arrivo misurate nello stage stesso, o
   arrivo corretto all'ultimo fotogramma.
4. **Niente colore piatto:** chiusura con la tinta della card, abbassando
   l'opacità delle card che rientrano invece di cambiarne lo sfondo.
5. **Fine legata alle animazioni:** `Promise.all` sulle `finished`, con il
   timer solo come rete di sicurezza.
6. **Facoltativo, dopo la misura:** card successive mosse con `transform`
   invece che per reflow.

Sono tutte modifiche al solo disegno della transizione: nessun cambio a stato,
code del turno o `renderAll()`. Ma la funzione sta nel percorso di render del
tracker, che `AGENTS.md` tratta come fragile: prima della patch spiego il
rischio e aspetto il via.

### Misura del 31/10 (Chrome headless, circa 160 fotogrammi al secondo)

Il pannello del browser dell'app disegna solo quando la finestra è in primo piano, quindi la misura gira in Chrome
headless sul banco `ui-audit-browser`, con quattro goblin, nella vista compatta.

| | Apertura | Chiusura |
| --- | --- | --- |
| Durata dello stage | 632 ms | 618 ms |
| Fotogrammi oltre 20 ms | 2 (massimo 37 ms, all'inizio) | 0 |
| Scatto finale | 1,6 px su tutte le card | 1,6 px sulla card madre |
| Incroci | la card 4 parte 34 ms dopo e passa la 3 a circa 30 px dalla pila | lo stesso, alla fine |
| Sfondo durante la transizione | trasparente | `rgb(31, 39, 51)` sulle card non attive |

- **Causa dello scatto:** la card attiva è ingrandita (larga 95,2 px invece di 92). Nella vista compatta le posizioni
  partono dal suo rettangolo ingrandito (`rect.left`), mentre la vista classica usa già la posizione di layout
  (`layoutLeft`, `IL:10033`). A fine animazione le card tornano alla posizione vera: metà dei 3,2 px in più.
- **Lo sfondo grigio è voluto:** le card a opacità 0,84 si sovrappongono nella pila; uno sfondo pieno evita di vederci
  attraverso. Da toccare solo se si vede in stanza.
- **Gli incroci avvengono sotto la pila,** dove le card si coprono già: poco visibili.
- **Non misurabile qui:** sul tavolo il gruppo si apre circa 1 s dopo l'evidenziazione (misura del 28/10, ritardo dei
  metadata di OBR).

#### Vista espansa (classica), stessa prova

| | Apertura | Chiusura |
| --- | --- | --- |
| Durata dello stage | 625 ms | 624 ms |
| Fotogrammi oltre 20 ms | 1 (37 ms) | 1 (31 ms) |
| Scatto finale | nessuno (0,1 px: qui le posizioni vengono dal layout) | nessuno |
| Salto della lista all'inizio | **+87 px** in 120 ms (Lupo da 507 a 594) | **+86 px** in 110 ms (Lupo da 309 a 395) |
| Dopo lo stage | **la lista scorre di circa 300 px** in 250 ms per mostrare la card attiva: un secondo movimento dopo il primo | la lista scende di altri 110 px mentre il gruppo si chiude (contenuto più corto in fondo alla lista) |
| Sfondo durante la transizione | trasparente | `rgb(31, 39, 51)` sulle card non attive |

- **Nella vista espansa il difetto vero è lo scorrimento, non il gruppo.** Il gruppo si apre e si chiude pulito, ma la
  lista salta di circa 87 px nel primo decimo di secondo. Poi, solo a fine apertura, scorre di nuovo per portare in
  vista la card attiva: in tutto circa 0,9 s di movimenti in sequenza.
- Causa probabile del salto (dedotta, da verificare nella patch): la posizione di scorrimento viene ripristinata
  (`IL:10248`, `trackWrap.scrollTop = Math.min(scrollTopBefore, …)`) mentre lo stage ha ancora la misura di partenza,
  quindi il browser la limita all'altezza disponibile in quel momento.
- Lo scorrimento verso la card attiva parte da `__afterGroupLayoutTransition`, cioè dopo la fine dello stage
  (`IL:10291-10293`).
- **Nella vista compatta la barra non scorre** durante la prova: resta solo lo scatto di 1,6 px.

#### Correzione della vista espansa (31/10)

Riprese a velocità reale con lo screencast di Chrome, partenza identica (lista in fondo). GIF prima/dopo in
`docs/ui-audit/after/u13/`.

- **Causa del salto:** quando parte la transizione tutte le card vengono ricostruite, e per un momento quelle con le
  pill sono alte 74 px invece di 95, finché `initiativeChipOverflow` non le misura. Lo scorrimento veniva
  ripristinato proprio allora, con la lista più corta, e il browser lo tagliava (da 897 a 790). Ora viene
  ripristinato una seconda volta nel fotogramma in cui partono le animazioni, con le altezze vere: niente salto.
- **Nomi sovrapposti in chiusura:** i membri ora svaniscono nei 220 ms in cui compare la card del gruppo.
- **Apertura fuori schermo:** a ogni fotogramma la lista scorre quanto basta a tenere in vista il bordo del gruppo
  che cresce, senza mai far uscire la card attiva (`__revealExpandingGroup`). Nella vista espansa il gruppo si apre
  sotto gli occhi e a circa 480 ms è tutto in vista. Nella vista compatta, dove prima il gruppo non entrava mai in
  vista, ora ci arriva con uno scorrimento continuo a fine apertura: non è ancora sincronizzato, perché il bordo
  visibile della barra non coincide con `trackWrap` mentre il popover si allarga.
- **Resta, ed è voluto:** chiudendo un gruppo in fondo alla lista, il contenuto sopra scende per riempire lo spazio,
  in un solo movimento continuo.
- **Scatto di 1,6 px della vista compatta:** corretto. Le posizioni ora vengono dal layout (`layoutLeft`), come nella vista
  espansa; nella misura le distanze tra le card restano 98,6 px prima e dopo la fine dello stage.
- **Resta da fare:** il ritardo di circa 1 s sul tavolo e la sincronizzazione dello scorrimento nella vista compatta.

### Nuove decisioni

| # | Decisione | Consiglio |
| --- | --- | --- |
| D11 | Riposo lungo del gruppo, oltre alle risorse: PF al massimo, PF temporanei azzerati, Indebolimento −1 (PHB 2014) | PF al massimo e PF temporanei azzerati; Indebolimento −1 come casella, spenta |
| D12 | Riposo breve del gruppo: un campo «PF recuperati» per PG, dove il GM scrive il totale dei Dadi Vita tirati al tavolo, oppure niente PF | Il campo, facoltativo |
| D13 | Animazioni dei gruppi: misura in stanza prima della patch, oppure subito i punti 2–5 | Misura prima |

**Risposta dell'utente (31/10):** D11, D12 e D13 approvate come consigliato.
Il riposo lungo del gruppo porta i PF al massimo, azzera i PF temporanei e
offre l'Indebolimento −1 come casella spenta. Il riposo breve ha un campo «PF
recuperati» facoltativo per PG. Le animazioni dei gruppi si misurano in stanza
prima della patch. Tutte le decisioni sono prese.
