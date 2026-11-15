# Studio: sei punti dalla partita online

15 novembre 2026. Solo studio: nessun codice è cambiato.

**Stato:** lo stesso giorno l'utente ha approvato tutte le decisioni G1–G18
come raccomandate. Primo passo: la prova in stanza G1.

- **BA1, BA2 e BA3 fatti il 15/11** (BA1 e BA2 in `22a25e43`, BA3 in
  `69394243`). Il §6 dice cosa è cambiato; le prove in stanza sono in
  `PROVE_IN_STANZA.md`, B17.
- **SB1 e SB2 fatti il 15/11.** Il §5 dice cosa è cambiato; la prova in stanza
  è nella voce L1 di `PROVE_IN_STANZA.md`, E1.

I sei punti vengono da una sessione di gioco online. Per ognuno: com'è oggi, la
causa (o la conferma che funziona), la proposta, i rischi secondo AGENTS.md e i
lotti. Le decisioni per l'utente sono in fondo, numerate da G1.

Legenda: **[V]** letto nel codice, **[P]** provato (test, simulazione o sonda),
**[D]** dedotto, da confermare in stanza.

## Riepilogo

| # | Punto | Com'è oggi | Causa | Proposta | Rischio |
| --- | --- | --- | --- | --- | --- |
| 1 | Giocatore del token su una mappa nuova | La memoria tra scene esiste già (O3) | Non vale per i token copiati e per quelli che il plugin non conosce ancora | L'assegnazione resta al personaggio: proprietario riallineato, personaggio riconosciuto dal registro, Owner di Owlbear letto, pannello Giocatori | Basso: niente PF né turno |
| 2 | Dardo incantato nella console | Funziona: lo slot si spende solo al primo dardo | Dopo l'ultimo dardo il lancio si chiude, e il dardo dopo spende un altro slot senza «Nuovo lancio» | Lancio completo che chiede «Nuovo lancio» | Basso |
| 3 | Forma Selvatica | Una pill che spende un uso, senza statistiche né PF della bestia | Scelta del 2026: lo strato dei PF era «rischio alto» | Primitiva di trasformazione: bestia sulla pill, attacchi nella console, velocità e taglia, poi i PF della forma | Basso nei primi lotti, alto per i PF |
| 4 | Attacco di opportunità dal client del giocatore | Gira solo nel client del GM, ma vede anche i movimenti dei giocatori | Interruttore spento, tracker del GM chiuso, o movimento preso per un Annulla nativo | Classificare l'Annulla con `lastModifiedUserId`, Movimento acceso in Online | Medio: Speed Tracker |
| 5 | Statblock e omonimi | Copia al Salva; un token nuovo lo riceve entrando nell'iniziativa | Chiavi del registro col nome vecchio, identità passata tra omonimi, PF mai seguiti | Chiavi e identità corrette, poi PF/taglia/Leggendario all'idratazione | Medio-alto: PF |
| 6 | Bonus di attacco dei PG | La console lo mostrerebbe già | La scheda non ha un campo per inserirlo | Campo «Bonus al tiro» nell'editor e nel prompt di Importa PG | Nessuno |

## 1. Il giocatore del token su una mappa nuova

### Com'è oggi

**L'assegnazione** (lotto O3 dell'audit online, `a5caf477`):

- Il GM la fa dal menu della card, «Giocatore ›». Il menu c'è solo con il
  profilo Online, solo per il GM e solo per i token nel tracker
  ([initiativeList.js:9617](../src/initiativeList.js)).
- `__setCardPlayer` ([initiativeList.js:1632](../src/initiativeList.js)) scrive
  prima la memoria della stanza, poi il token.
- Sul token scrive `meta.assignedPlayer` = `{ id, name, color }`, in fusione
  (`pluginMetaWithPlayerAssignment`,
  [playerAssignmentCore.js:35](../src/playerAssignmentCore.js)).
- In una seconda scrittura rende il giocatore proprietario Owlbear del token
  (`createdUserId`, `writePlayerAssignment`,
  [playerAssignmentWriter.js:17](../src/playerAssignmentWriter.js)). Con
  «Owner Only» e «Character → Update» il giocatore muove solo il proprio token.

**La memoria tra scene** (`a6d33cf8`):

- Vive nella stanza, chiave `com.thebigpicture.initiative/playerAssignments`,
  390 byte.
- La chiave del personaggio è `a…` (hash dell'`actorProfileId` della scheda),
  oppure `n…` (hash del nome) se il token non ha identità
  (`playerMemoryKeyOfItem`,
  [playerAssignmentMemoryCore.js:31](../src/playerAssignmentMemoryCore.js)).
  Il valore è l'id utente di Owlbear.
- Nomi e colori dei giocatori restano nel localStorage del GM.
- La riapplica il background del GM, solo in Online (`mountPlayerAssignmentMemory`,
  [playerAssignmentMemory.js:52](../src/playerAssignmentMemory.js), montato in
  [background.js:309](../src/background.js)). Scatta all'avvio, al cambio dei
  metadata della stanza, quando un token è aggiunto o cambia fazione o dati del
  tracker, e quando una scena è pronta.
- `rememberedPlayerForItem`
  ([playerAssignmentMemoryCore.js:69](../src/playerAssignmentMemoryCore.js))
  ridà il giocatore solo se tre condizioni valgono insieme:
  - il token ha i metadata del plugin, con fazione PG o alleato (riga 71);
  - il token non ha già un giocatore (riga 72);
  - la sua chiave è quella salvata.

### Perché su una mappa nuova va rifatto

Il cambio di scena in sé non rompe nulla: la memoria è nella stanza e il
background la rilegge a ogni scena **[V]**. I buchi dipendono da come il PG
arriva sulla mappa nuova. Dal codice non si capisce quale caso è capitato in
partita: lo dice la prova di G1.

**A. Token copiato e incollato da un'altra scena** (o scena duplicata) **[D]**

- Il token nuovo porta con sé i metadata, quindi anche `assignedPlayer`, e la
  card mostra il giocatore.
- Il proprietario però è chi ha incollato, cioè il GM: `createdUserId` è
  «l'utente che ha creato l'item» (documentazione Owlbear, pagina Item).
- La memoria salta i token che hanno già un giocatore (riga 72), quindi il
  proprietario non viene mai corretto.
- Con Owner Only il giocatore non riesce a muovere il token, anche se la card
  dice che è suo. Il GM lo riassegna dal menu, e la seconda scrittura rimette
  il proprietario.

**B. Token trascinato dalla libreria degli asset** **[V]**

- Il token nasce senza metadata del plugin, e la memoria lo ignora finché non
  diventa PG o alleato nel tracker (riga 71).
- Finché il GM non lo aggiunge all'iniziativa, il giocatore non può muoverlo.
  È proprio l'esplorazione, all'inizio di una mappa.
- Con «Aggiungi tutti» la fazione viene dal registro delle fazioni, cercata per
  immagine, se l'opzione è accesa; altrimenti è «enemy»
  ([initiativeList.js:1878-1905](../src/initiativeList.js)). Un PG con
  un'immagine nuova entra ostile, e la memoria aspetta che il GM lo segni PG.
- Anche da PG, la chiave non combacia subito:
  - il token nuovo non ha `actorProfileId`, quindi la sua chiave è `n…`, mentre
    la memoria ha `a…`;
  - l'identità arriva quando il tracker del GM idrata la scheda dal registro
    (`restoreInitiativeCardQuickActionsFromMemory`,
    [initiativeCards.js:740](../src/initiativeCards.js)); dopo la memoria
    riparte e assegna;
  - l'idratazione però avviene solo nel tracker del GM aperto, solo per token
    nell'iniziativa senza azioni rapide, e solo se una voce del registro
    combacia per nome o immagine
    ([initiativeList.js:12436-12452](../src/initiativeList.js),
    [initiativeCardRegistryCore.js:435-487](../src/initiativeCardRegistryCore.js));
  - la migrazione delle identità (`migrateInitiativeCardActorIdentities`) gira
    una sola volta, all'avvio del background
    ([background.js:208](../src/background.js)), non a ogni scena.
- Se l'idratazione non avviene (nome cambiato, voce ambigua, tracker chiuso), la
  chiave resta `n…` e il giocatore non torna mai.

**C. Chiavi diverse tra le due mappe** **[V]**

- La memoria salva la chiave che il token aveva al momento della scelta.
- Se allora il token non aveva ancora l'identità, la memoria ha `n…`; sulla
  mappa nuova il token idratato ha `a…`, e le due chiavi non combaciano.
- Anche un nome diverso («Thorin» contro «thorin_token») cambia la chiave `n…`.

**D. Il menu Owner di Owlbear** **[V]**

- Se il GM assegna il proprietario dal menu Owner di Owlbear, il plugin non lo
  sa: in `src/` nessuno legge `createdUserId`.
- Quindi niente memoria e niente pallino sulla card.

**E. Giocatore ospite** **[D]**

- L'audit O3 lasciava da verificare se l'id di un giocatore senza account resta
  lo stesso tra un ingresso e l'altro.
- Se cambia, la memoria punta a un id che non c'è più. Succede tra due sessioni,
  non tra due mappe della stessa sessione.

### Proposta: l'assegnazione appartiene al personaggio

La memoria della stanza diventa la fonte dell'assegnazione; il token è solo il
posto dove la si applica. Il budget di 390 byte non cambia in nessun lotto.

| Lotto | Cosa fa | Copre | Dove |
| --- | --- | --- | --- |
| GA1 Proprietario riallineato | Per ogni token del livello Personaggi con `assignedPlayer` e un `createdUserId` diverso, il background del GM riscrive solo `createdUserId` | A | una funzione pura in `playerAssignmentMemoryCore.js`, un passo in `applyRemembered` |
| GA2 Personaggio riconosciuto dal registro | Per un token senza identità, la memoria trova il personaggio nel registro delle schede (immagine, poi nome, come `resolveInitiativeCardActorMatch`), ne prende l'`actorProfileId` e prova la chiave `a…`, poi `n…` | B, C | `rememberedPlayerForItem` riceve il registro letto con `readInitiativeCardRegistry` |
| GA3 Owner di Owlbear letto | Se il GM dà il token a un giocatore collegato dal menu Owner di Owlbear, il background adotta la scelta: `assignedPlayer` e memoria | D | stesso passo del background |
| GA4 Pannello «Giocatori» | Nelle Opzioni, solo in Online: i PG della stanza (dal registro delle schede) con il giocatore di ciascuno, scelto senza token e senza scena. Scrive la stessa memoria | E, e rende la memoria visibile | pagina Opzioni |

GA2, nel dettaglio:

- Su un token **senza metadata del plugin** scrive solo `createdUserId`: il
  giocatore lo muove subito, prima dell'iniziativa.
- Non crea metadata del plugin su un token che il tracker non conosce. Per il
  dispatcher, le barre PF e le migrazioni un token «del plugin» è uno con quei
  metadata: cambiarne il significato è un rischio inutile.
- `assignedPlayer` arriva dopo, quando il token entra nel tracker: è il passo
  di oggi.

Facoltativo: «Giocatore ›» anche nel menu contestuale del token di Owlbear
(`src/contextMenu.js`), per assegnare un token non ancora nel tracker. Con GA2 e
GA4 serve poco.

### Rischi (AGENTS.md)

- **Cosa non tocca:** PF, turno attivo, ordine di iniziativa e chiavi dei
  metadata.
- **Metadata:** `assignedPlayer` resta scritto in fusione.
- **Niente cicli:** `createdUserId` è un campo di Owlbear, scritto solo se è
  diverso. La scrittura cambia l'item e fa ripartire il passo, che non trova più
  differenze e si ferma.
- **Il token cambia proprietario prima di entrare nel tracker (GA2).** Per un
  personaggio che il GM vuole tenere, basta «Nessuno», che toglie anche la
  memoria.
- **Costo:** il background del GM legge il registro delle schede a ogni passo,
  cioè i metadata della stanza più il localStorage. I passi sono già raggruppati
  a 300 ms.
- **Due client GM (ON-19):** scriverebbero lo stesso valore. È innocuo.
- **GA3 ha una scelta da fare** (G4): se il GM toglie il proprietario da Owlbear,
  si toglie anche l'assegnazione?

## 2. Dardo incantato nella console attacchi

### Com'è oggi

**Il catalogo**
([pcAttackSpellCatalog.js:28](../src/pcAttackSpellCatalog.js)): 1° livello,
senza tiro per colpire, 1d4+1 di forza, tre dardi più uno per livello di slot.
La nota dice «Registra un dardo alla volta, anche sullo stesso bersaglio».

**Ogni registrazione è un dardo** **[V]**:

- La bozza della console ha un `castId`
  ([pc-attack.js:92](../src/pc-attack.js)).
- `syncSpellDraft` adotta il lancio ancora aperto, cioè stesso incantesimo,
  stesso turno e dardi rimasti (`pcAttackOpenSpellCast`,
  [pcAttackCore.js:448](../src/pcAttackCore.js)).
- `pcAttackSpellCastPlan` ([pcAttackCore.js:461](../src/pcAttackCore.js))
  continua il lancio se coincidono `castId`, incantesimo e turno e restano
  dardi. Solo il primo dardo ha `firstOfCast`.
- Il lancio aperto vive in `pcAttackState.spellCast`, e l'ultimo dardo lo chiude
  ([pcAttackCore.js:1491-1493](../src/pcAttackCore.js)).
- Lo slot si spende solo con `firstOfCast`, nel comando dell'attacco stesso
  (`pcAttackSpellSlotPlan`,
  [pcAttackExecution.js:70](../src/pcAttackExecution.js)). L'Annulla lo
  restituisce.

**Cosa vede il GM** ([pc-attack.js:553-580](../src/pc-attack.js)):

- Prima del primo dardo: «Dardi: 3 con questo slot; il primo spende lo slot.»
- Durante il lancio: «Lancio in corso: 1/3 registrati · slot di 1° già speso.»,
  il pulsante «Nuovo lancio» e il selettore dello slot bloccato.
- Dopo ogni registrazione la console ricrea la bozza e rilegge il token, poi
  riadotta il lancio aperto ([pc-attack.js:3024](../src/pc-attack.js)).

**Verifica [P]:**

- `test/pcAttackSpells.test.js` e `test/magicMissileIntegration.test.js` sono
  verdi (13 test su 13).
- Una simulazione usa e getta (quattro dardi con lo stesso `castId`, fuori dal
  repository) dà questo risultato:

| Dardo | Lancio | Slot |
| --- | --- | --- |
| 1 | 1/3, apre il lancio | speso |
| 2 | 2/3 | no |
| 3 | 3/3, chiude il lancio | no |
| 4 | 1/3 di un **lancio nuovo** | **speso** |

### Cosa non va

1. **Dopo l'ultimo dardo il lancio si chiude da solo.**
   - Il dardo successivo apre un lancio nuovo e spende uno slot, senza
     «Nuovo lancio». Il pulsante c'è solo a lancio aperto.
   - Il caso tipico: il GM lascia lo slot a 1° per un lancio di 2° (quattro
     dardi), e il quarto dardo spende un secondo slot di 1°.
   - A lancio aperto lo slot non si corregge, perché il selettore è bloccato.
     Resta l'Annulla del primo dardo.
2. **Due strade per lo stesso incantesimo** **[D]**.
   - Il pannello incantesimi fa un lancio solo, con i dardi divisi tra i
     bersagli (`magicMissileCore.js`). La console registra un dardo per volta.
   - La console non sa del lancio del pannello, a differenza di Tocco del
     vampiro (`fromActiveSpell`). Lanciato dal pannello e poi registrato in
     console, spende due slot.
3. **Il lancio è legato al turno.** Un dardo registrato dopo aver passato il
   turno apre un lancio nuovo. Per le regole è giusto, ma succede in silenzio.

### Proposta

**DM1 · Lancio completo che chiede «Nuovo lancio»:**

- Dopo l'ultimo dardo, `pcAttackState.spellCast` resta, segnato completo, fino
  alla fine del turno.
- La console mostra «Lancio completo: 3/3 · slot di 1° speso».
- Per un altro dardo serve «Nuovo lancio», che spende lo slot del lancio nuovo.
  Registra senza «Nuovo lancio» resta fermo, con il motivo.
- Vale per ogni incantesimo a più colpi: Raggio rovente; Colpo del Vento
  d'Acciaio lo fa già con il teletrasporto in sospeso.
- Si tocca `pcAttackSpellCastPlan`, `pcAttackOpenSpellCast` e `renderSpell`.

**DM2 · Nota sul pannello:** nella nota del Dardo incantato, «Lanciato dal
pannello incantesimi? È già registrato: non registrarlo qui».

### Rischi

- **Cosa non tocca:** PF e turno. La strada della spesa dello slot resta
  quella di oggi.
- **Lo stato della console cambia forma:** `pcAttackState.spellCast` ha un
  campo in più. Il test di Raggio rovente, «the fourth ray closes the cast»,
  cambia per scelta.
- **`pc-attack.js` è aperto:** la sessione delle azioni di turno ci sta
  lavorando (T6). DM1 va fatto dopo, o d'accordo con lei.

## 3. Forma Selvatica del druido

Il punto l'ha studiato un agente in sola lettura. Ho ricontrollato i dati della
capacità, la decisione del 2026 sul segnaposto e il test che la fissa.

### Com'è oggi

**La capacità è un segnaposto** **[V]**:

- Il pool `druido-forma-selvatica-usi` dà due usi dal 2° al 19° livello, e usi
  illimitati al 20°. Si ricarica col riposo breve e col lungo.
- `druido-forma-selvatica` mette la pill 🐺 «Forma Selvatica» sul druido e
  spende un uso. Il testo della pill
  ([class-features-runtime.json:15725](../src/class-features-runtime.json)) dice
  che statistiche e PF della bestia restano al GM: «il plugin non sostituisce i
  PF del druido».
- La pill non ha scadenza. Le condizioni di fine (privo di sensi, 0 PF della
  forma, morte) sono solo descritte.
- Forma Elementale è la stessa pill con un'altra etichetta, e costa due usi.
- Circolo della Luna: Forma Selvatica da Combattimento, Forme del Circolo,
  Colpo Primordiale, Mille Forme e Incantesimi Bestiali sono solo testo. Manca
  anche la guarigione con lo slot.
- È una scelta scritta:
  - `docs/class-features/audits/DRUIDO_FASE2.md`: un vero strato di PF della
    forma è la primitiva `transformation`, «rischio alto», da decidere;
  - `test/druidFeatureRuntime.test.js:86-94` fissa che la pill non ha
    `mechanics` e non tocca i PF.

**Nessun modello di trasformazione** **[V]**:

- Metamorfosi, Metamorfosi Pura, Trasformazione e Forme Animali sono solo
  tracciati («Su misura: forma, statistiche e PF sostitutivi»).
- I precedenti più vicini:
  - **Alterare sé stesso:** pill che cambiano con un'azione, e una velocità
    copiata dal passo;
  - **Soffio del drago** (CAP-ORIGIN): azioni costruite al volo da un record sul
    token, mostrate nella scheda Attacchi della console, senza toccare la scheda
    ([spellGrantedActionsCore.js](../src/spellGrantedActionsCore.js),
    `pcAttackPickerEntries` con `grantedActions` in
    [pcAttackPickerCore.js:39](../src/pcAttackPickerCore.js)).

**Gli statblock delle bestie** **[V]**:

- `fiveToolsMonsterToStatblock` dà taglia, CA, PF medi e formula, velocità,
  caratteristiche, TS, difese, multiattacco e azioni. Tipo e GS non sono nel
  blocco: compaiono solo nella stampa.
- L'archivio 5eTools sta solo nell'IndexedDB del browser del GM, e lo scarica il
  GM. Tiene tipo, GS e velocità, ma la ricerca guarda solo nome e manuale: un
  filtro per bestia, GS e velocità è una funzione nuova.
- Il plugin non contiene statblock di bestie: `test-support/fivetools-srd-monsters.json`
  serve solo ai test.
- Importare la bestia nella scheda del druido funzionerebbe per la console, ma
  sovrascrive la scheda del druido. Quindi no.

### Le regole da seguire (PHB 2014)

- **Usi:** due, che tornano con il riposo breve o lungo.
- **Durata:** metà del livello da druido, in ore.
- **Forme ammesse:**

| Livello | Druido | Circolo della Luna |
| --- | --- | --- |
| 2° | GS 1/4, niente volo né nuoto | GS 1 |
| 4° | GS 1/2, niente volo | GS 1 |
| 6° | | livello diviso 3 |
| 8° | GS 1 | |
| 10° | | anche un elementale, al costo di due usi |

- **Statistiche:** quelle fisiche, la CA e i PF sono della bestia; quelle
  mentali, le competenze e le capacità restano del druido.
- **A 0 PF della forma** il druido torna normale e il danno in eccesso passa ai
  suoi PF.
- **Incantesimi:** niente lanci in forma bestiale fino a Incantesimi Bestiali
  (18°). La concentrazione già in corso resta.
- **Circolo della Luna:**
  - si trasforma con un'azione bonus;
  - può spendere uno slot per curarsi 1d8 per livello dello slot;
  - dal 6° gli attacchi della forma contano come magici (Colpo Primordiale).

### Proposta: una primitiva di trasformazione, a lotti

È un meccanismo generale: lo usano il druido e quattro incantesimi
(Metamorfosi, Metamorfosi Pura, Trasformazione, Forme Animali), quindi non è una
funzione per un mostro solo. I primi quattro lotti non toccano i PF.

| Lotto | Cosa fa | Rischio |
| --- | --- | --- |
| W1 · Elenco delle bestie | Funzione pura che filtra le bestie per tipo, GS secondo livello e circolo, nuoto dal 4°, volo dall'8°, elementali della Luna al 10°, solo 2014. Fonti: l'archivio 5eTools del GM, un JSON o un testo incollato (parser ST1), una scheda di bestia già nella stanza | Basso |
| W2 · Forma sulla pill | La pill porta l'istantanea della bestia scelta: nome, `ref`, taglia, PF massimi, CA, For/Des/Cos e i loro TS, velocità, multiattacco, azioni. Il GM la sceglie nella scheda Capacità della console, come le varianti. Il test di oggi cambia per scelta | Basso |
| W3 · Console | Le azioni della forma diventano azioni concesse (come il Soffio del drago), con il multiattacco. Armi e incantesimi del druido si nascondono fino al 18°. Contano anche la CA e i TS fisici della forma, e Colpo Primordiale rende magici gli attacchi | Medio: `pc-attack.js` è aperto per T6 |
| W4 · Velocità e taglia | La velocità della forma sostituisce quella del druido: serve una primitiva «sostituisci il passo», perché `grantMeters` tiene la velocità più alta. La taglia del token passa alla forma e torna alla fine | Medio: riquadro Movimento |
| W5 · PF della forma | Vedi sotto | **Alto: PF** |
| W6 · Extra della Luna | La guarigione con lo slot come azione bonus (precedente: Imposizione delle mani), Forma Elementale, la durata in ore | Medio |
| W7 · Riuso | Metamorfosi, Metamorfosi Pura, Trasformazione, Forme Animali | Dopo W5 |

**W5, le tre strade per i PF della forma:**

**(a) I PF del druido messi da parte sulla pill** — raccomandata.

- `meta.hp` e `meta.hpMax` diventano quelli della bestia; i PF del druido si
  salvano nella pill, nello stesso comando.
- A 0 PF della forma, un piano di ritorno calcola l'eccesso e scrive i PF del
  druido meno l'eccesso, con il suo massimo. Gira nei tre punti dove oggi
  interviene Interdizione alla Morte: due nel coordinatore, uno nell'esecutore
  delle aree.
- Quando la pill finisce per altre vie (azione bonus, durata, Annulla), i PF del
  druido tornano nello stesso comando. È lo schema dei PF temporanei che
  scadono (T3a) e del massimo modificato (CAP-MAXHP).
- La memoria dei PF va esclusa: ActorVitals porterebbe i PF della bestia nelle
  altre scene e `hpMemory` li ricorderebbe. Serve un filtro come quello di
  CAP-MAXHP (M0).
- Pro:
  - è la regola giusta per danni, cure e barre;
  - si riusa negli incantesimi di W7.
- Da guardare:
  - tiri contro la morte e danno massiccio misurato sul massimo della bestia, se
    un percorso salta il ritorno;
  - la concentrazione;
  - Aiuto durante la forma;
  - il riposo di gruppo, che deve chiudere la forma;
  - l'editor dei PF in linea del tracker, che non conosce l'eccesso.

**(c) I PF della bestia come PF temporanei, con la pill come fonte.**

- È la strada più piccola: suddivisione del danno, eccesso, fine a 0, Cronologia
  e barre esistono già.
- Però sbaglia le cure: curano il druido, non la forma, compresa la cura della
  Luna.
- Inghiotte i PF temporanei che c'erano, e un nuovo dono di PF temporanei più
  alto prende il posto della forma.
- La barra mostra il druido pieno più una riserva.
- Va bene solo come ripiego.

**(b) Un pool di PF nuovo in `meta`.** AGENTS.md vieta campi PF nuovi senza una
richiesta esplicita, e toccherebbe tutti i chiamanti come un secondo CAP-TEMP.
Scartata.

### Rischi

- **W5 scrive PF** su tutti i percorsi del danno. AGENTS.md chiede di fermarsi e
  spiegare il rischio: serve un piano esatto per percorso e il via dell'utente.
- **W1–W4 non toccano PF, turno né ordine.**
  - W3 tocca la console, oggi in lavorazione.
  - W4 tocca il riquadro Movimento e la taglia del token, che è fuori dalla
    Cronologia: l'Annulla non la rimette.
- **La pill vive sul token della scena:** su una mappa nuova il druido arriva in
  forma normale **[D]**.
- **L'immagine del token:** non va cambiata. La memoria dei PF dei PG senza
  identità usa nome e immagine.

## 4. Attacco di opportunità quando muove il giocatore

### Com'è oggi

**Il percorso** **[V]**:

1. L'osservatore dei movimenti di `history.js` produce un segmento per ogni
   movimento.
2. `handleReactionMoveSegments`
   ([reactionMoveWatcher.js:77](../src/reactionMoveWatcher.js)) raccoglie i
   segmenti di un movimento.
3. Dopo 700 ms di token fermo, `settle`
   ([reactionMoveWatcher.js:38](../src/reactionMoveWatcher.js)) chiama
   `movementReactionEvents`
   ([opportunityAttackCore.js:50](../src/opportunityAttackCore.js)) e poi il
   motore dei candidati.
4. Se c'è qualcuno che può reagire, si apre il popover `reaction-move.html` sullo
   schermo del GM. In Online le righe dei PG vanno anche ai loro giocatori (R6).

**Dove gira:** solo nel client del GM, nella pagina del tracker, accanto allo
Speed Tracker ([initiativeList.js:12006-12016](../src/initiativeList.js)).

**Nessun filtro su chi ha mosso:**

- Il client del GM vede i movimenti dei giocatori da `OBR.scene.items.onChange`
  (`subscribeSceneItemChanges`, flag `movement`).
- Nel percorso non compaiono né `lastModifiedUserId` né `createdUserId`.

**Le condizioni dell'avviso:**

- l'interruttore «Movimento» acceso: è spento di base ed è un'opzione **locale**
  del browser del GM ([reactionPromptOptionsCore.js:16](../src/reactionPromptOptionsCore.js));
- chi si muove è la creatura di turno (J1,
  [reactionMoveWatcher.js:46](../src/reactionMoveWatcher.js));
- i reattori sono nell'ordine di iniziativa e ostili (un neutrale non reagisce
  mai), con la reazione libera, non incapacitati e sopra 0 PF
  ([reactionCandidatesCore.js:113-124](../src/reactionCandidatesCore.js));
- il token esce dalla portata, cioè 1,5 m o la portata più lunga degli attacchi
  in mischia della scheda
  ([opportunityAttackCore.js:22](../src/opportunityAttackCore.js));
- chi si muove ha i metadata del plugin, e non ha «Disimpegno» né
  «Movimento: no AdO».

### Risposta: la rilevazione non distingue chi muove

Ci sono però tre punti in cui un movimento del giocatore si perde, mentre al
tavolo non succede.

**1. L'Annulla nativo del GM** **[V]**, **[D]** per la pila del «rifai»:

- Prima di classificare i movimenti, l'osservatore chiede al client del GM
  `OBR.scene.history.canRedo()`
  ([history.js:1651-1709](../src/history.js)).
- Se risponde sì, ogni movimento di quella raffica è preso per un Annulla di
  Owlbear (`undo: true`). L'osservatore delle reazioni lo scarta, e lo Speed
  Tracker lo registra come correzione
  ([history.js:1748](../src/history.js)).
- La pila del «rifai» dovrebbe essere quella del client del GM: la
  documentazione di Owlbear non lo dice.
- Se è così, dopo un Ctrl+Z del GM `canRedo` resta vero finché il GM non fa
  altro. In quel tempo tutti i movimenti dei giocatori finiscono nel ramo
  dell'Annulla.
- Al tavolo non si vede: muove solo il GM, e ogni sua mossa nuova svuota la
  pila.

**2. Il tracker del GM chiuso** **[D]**:

- L'osservatore e lo Speed Tracker vivono nella pagina del tracker, non nel
  background.
- In Online il GM può chiudere il tracker. Owlbear dovrebbe smontare l'iframe di
  un popover chiuso: da confermare in stanza.
- A tracker chiuso non arriva nessun avviso, per nessuno.

**3. L'interruttore Movimento** **[V]**: è spento di base. Se è stato acceso
solo nel browser del banco, nella stanza è spento, perché è un'opzione del
browser.

Per scelta (J1), un giocatore che muove fuori dal proprio turno non riceve
avvisi.

**La prova che separa i casi:** si guarda il riquadro Movimento del PG mentre il
giocatore muove il token.

- **Se scala i metri:** l'osservatore gira, e la causa è in `settle`
  (interruttore, turno o reattori).
- **Se non li scala:** il tracker è chiuso, oppure il movimento è stato preso
  per un Annulla nativo.

### Proposta

| Lotto | Cosa fa | Note |
| --- | --- | --- |
| OA1 · Annulla nativo solo del GM | Un movimento è un Annulla di Owlbear solo se l'ha fatto il GM stesso: `item.lastModifiedUserId === OBR.player.id`. È un campo di sola lettura documentato da Owlbear (pagina Item) | Al tavolo muove solo il GM, quindi il comportamento resta identico |
| OA2 · Movimento acceso in Online | Il default dell'interruttore dipende dal profilo: acceso in Online, spento al Tavolo. La scelta del GM, se l'ha toccato, vince sempre | Rispetta la regola «le novità online solo nel profilo Online» |
| OA3 · Osservatore nel background del GM | Movimenti e avvisi anche a tracker chiuso | Grande: va spostato anche lo Speed Tracker. Solo se la prova dice che la causa è il tracker chiuso |

### Rischi

- **`history.js` è una zona delicata** (Speed Tracker, Combat Log). OA1 cambia
  solo la classificazione dei movimenti fatti da altri. La prova va fatta con due
  client veri, perché il banco ha un client solo.
- **OA2:** un'opzione locale con il default legato a un'opzione della stanza va
  letta dopo il profilo. Prima della lettura si tiene il default del tavolo.
- **Cosa non tocca:** PF, ordine e turno. L'avviso non scrive niente.

## 5. Lo statblock importato e gli omonimi

Il punto l'ha studiato un agente in sola lettura, con una sonda nella scratchpad
che esegue il vero `initiativeCards.js` e il coordinatore. Ho ricontrollato
l'ordine del Salva, la regola del nome e la scelta dei bersagli.

### Com'è oggi

**Il Salva di un mostro scrive, in quest'ordine** **[V]**
([initiative-card-modal.js:5324-5455](../src/initiative-card-modal.js)):

1. il testo completo nell'IndexedDB del GM, per `monster.ref`;
2. la scheda sul token, cioè CA, difese, azioni rapide, libro e profilo del
   mostro, con il coordinatore e la Cronologia. La scheda va anche nel registro
   locale del GM, sotto le chiavi `asset:<url>` e nome;
3. il nome e il ritratto, solo per il token aperto;
4. la taglia;
5. i PF, con `hp:set` e la Cronologia;
6. Leggendario;
7. la copia agli omonimi.

Le schede dei mostri non vanno nel registro della stanza (`withoutMonsterCards`):
restano nel browser del GM.

**Gli omonimi al Salva** **[V]**:

- **Chi è omonimo:** stesso nome senza i prefissi «(N) » e senza badare alle
  maiuscole (`monsterNameKey`,
  [monsterHitPointsImportCore.js:13](../src/monsterHitPointsImportCore.js)).
  Il token è del livello Personaggi, non per forza nell'iniziativa. «Goblin 2»
  non è omonimo di «Goblin».
- **Chi riceve lo statblock:** tutti tranne i PG (`monsterStatblockTargets`,
  [monsterStatblockShareCore.js:41](../src/monsterStatblockShareCore.js)), con
  un `saveInitiativeCard` per omonimo. Anche i feriti.
- **PF:** solo a chi non li ha (o con «Sostituisci»), mai ai feriti.
- **Taglia e Leggendario:** anche agli omonimi.
- **Nome e ritratto:** solo al token aperto.

**Un token arrivato dopo** **[V]**, provato dalla sonda **[P]**:

- Trascinato sulla mappa non riceve niente.
- Entrando nell'iniziativa viene idratato dal registro del browser del GM, con
  attacchi, CA, difese e statblock. Lo stesso succede quando il GM apre la scheda
  o quando il tracker riparte.
- Su una mappa nuova, nello stesso browser del GM, funziona allo stesso modo,
  anche in un'altra stanza: la copia locale non è divisa per stanza.

**Cosa non segue mai il token nuovo** **[V]** **[P]**:

- I PF, perché la scheda non ha un campo PF; `hpMemory` vale solo per PG e
  alleati, e ActorVitals esclude i mostri.
- Taglia, Leggendario, nome e ritratto.

**Il testo completo** si ritrova per `ref` nello stesso browser.

**Un altro browser o dispositivo del GM** non trova niente: la copia locale è
vuota e la stanza non ha mostri. Lo statblock va reimportato
(limite noto, `docs/PIANO_ATTACCHI_MOSTRI_FASE_1.md:20`).

**I giocatori non scrivono mai.**

### Problemi trovati

| # | Problema | Esempio |
| --- | --- | --- |
| S1 **[P]** | La scheda si salva prima della rinomina, quindi va nel registro sotto il nome vecchio | Un token «Goblin» riceve lo statblock dell'Hobgoblin e diventa «Hobgoblin». Su una mappa nuova un «Goblin» riceve l'Hobgoblin, un «Hobgoblin» niente. Si sistema solo riaprendo la scheda |
| S2 **[P]** | Stessa immagine, mostri diversi: la chiave `asset:<url>` fa vincere l'ultima scheda salvata con quell'immagine | Un «Goblin» con l'immagine del Goblin Boss riceve CA 17 |
| S3 **[P]** | L'omonimo idratato prende l'`actorProfileId` dell'ultimo omonimo salvato, contro la D1 del bugfix (gli omonimi condividono lo statblock, mai l'identità) | I PF non si condividono grazie all'esclusione di ActorVitals. Però la ricerca per identità viene prima di quella per nome |
| S4 **[V]** | PF, taglia e Leggendario non seguono il token nuovo | Il mostro idratato sulla mappa nuova è senza PF |
| S5 **[V]** | Due mostri diversi con lo stesso nome nella stessa scena: il Salva sovrascrive lo statblock dell'altro, perché il `ref` non si controlla | |
| S6 **[V]** | «Goblin 2» non è omonimo e non si trova per nome | |
| S7 **[D]** | La copia scrive i metadata del plugin anche sugli omonimi fuori dall'iniziativa, che poi prendono il prefisso «(N)» | `enforceUniqueNamePrefixes` |
| S8 **[D]** | L'esaurimento dell'ultimo omonimo salvato viaggia con la voce del registro | |

### Proposta

| Lotto | Cosa fa | Rischio |
| --- | --- | --- |
| SB1 · Chiavi giuste | La scheda del mostro va nel registro con il nome finale e l'immagine: si salva dopo la rinomina, o si riscrivono le chiavi. Una scheda di mostro si idrata solo se il nome combacia: l'immagine da sola non basta (S1, S2) | Basso |
| SB2 · Identità | Si toglie l'`actorProfileId` del registro quando il token non è candidato attore, e il test di D1 controlla anche questo caso (S3, S8) | Basso |
| SB3 · Idratazione completa | Dopo l'idratazione di un mostro: PF solo ai token senza PF canonici (`planMonsterHitPointsImport` senza «Sostituisci», poi `hp:set`), taglia e Leggendario con i loro piani (S4). I valori vengono dal record dell'IndexedDB per `ref`, o da due campi nuovi nel profilo del mostro | **Scrive PF:** piano esatto e via dell'utente prima del codice |
| SB4 · Altro dispositivo (rimandato) | Un piccolo indice nella stanza (nome → `ref`) e la scheda ricostruita dall'archivio. Serve un costruttore puro da statblock a scheda: oggi `applySheetImport` lavora sul DOM | Budget della stanza |

Lasciati fuori:

- l'idratazione quando un token è solo trascinato sulla mappa: scriverebbe anche
  su oggetti di scena e rischia cicli (S7);
- gli omonimi numerati (S6): «Goblin 2» può essere un mostro diverso.

**Fatto il 15/11 (SB1 e SB2):**

- **SB1:**
  - `saveInitiativeCard` (`src/initiativeCards.js`) accetta `registryName`:
    le chiavi del registro e il nome della voce usano il nome finale. La scheda
    lo passa quando sta per rinominare il token con il nome dello statblock;
  - `findInitiativeCardRegistryEntry` (`src/initiativeCardRegistryCore.js`):
    una voce di mostro vale solo col suo nome, che la si trovi per immagine o
    per identità. Quelle dei PG restano come prima.
- **SB2:** in `loadInitiativeCard`, un omonimo di mostro idratato dal registro
  prende lo statblock senza l'identità e l'Indebolimento del token che l'ha
  salvato.
  - Con l'idratazione riceve un'identità sua, come gli omonimi che il Salva
    raggiunge.
  - Senza nessuna identità un alleato omonimo (un lupo evocato) entrerebbe in
    `hpMemory`, condivisa per nome e immagine. Così resta fuori, come oggi;
    ActorVitals ignora comunque i mostri.
- **Limite:** le voci salvate prima di SB1 sotto il nome vecchio restano finché
  non le sovrascrive un nuovo Salva di quel mostro.
- **Prove:**
  - test nuovi: SB1 e D1 esteso in
    `test/initiativeCardSaveTransportRegression.test.js`, la regola del nome in
    `test/initiativeCardRegistryCore.test.js`. Prima della correzione tutti e
    tre fallivano;
  - suite completa verde in una copia pulita (6163 test);
  - build di controllo riuscita;
  - banco: statblock dell'Hobgoblin importato su un «Goblin» rinominato. Un
    nuovo «Hobgoblin» riceve la scheda con un'identità sua; un nuovo «Goblin»
    niente.

### Rischi

- **PF (SB3):**
  - la scrittura porta i valori attesi;
  - non tocca mai feriti, PG, PF condivisi o token che hanno già PF;
  - le barre restano derivate da `meta.hp` e `meta.hpMax`.
- **Metadata:** si scrive con le patch del coordinatore o in fusione sul draft.
- **Cicli:** un token idratato ha le azioni rapide, quindi non è più candidato.
  Restano le chiavi di idratazione e i controlli `isCurrent`.
- **Cronologia:** SB3 aggiunge voci che il GM non ha chiesto. Si decide se
  tenerle (G11).
- **Test che fissano il comportamento di oggi:**
  - `test/monsterStatblockShare.test.js`
  - `test/monsterHitPointsImport.test.js`
  - `test/monsterLegendary.test.js`
  - `test/tokenSize.test.js`
  - `test/initiativeCardRegistryCore.test.js`
  - `test/initiativeCardSaveTransportRegression.test.js:701-737` (D1)
  - `test/actorVitalsStore.test.js`

## 6. Il bonus di attacco nella console dei PG

### Com'è oggi

**Per i mostri** **[V]**:

- Il bonus viene dallo statblock importato: è `attackBonus` dell'azione rapida
  ([monsterStatblockImportCore.js:168](../src/monsterStatblockImportCore.js)).
- La console lo mostra come «+N al tiro» nella riga sopra i danni
  (`pcAttackMonsterTags`, [pcAttackCore.js:1006](../src/pcAttackCore.js);
  [pc-attack.js:2106-2110](../src/pc-attack.js)).

**Per i PG** **[V]**:

- Incantesimi e trucchetti mostrano già il bonus della scheda, cioè
  `spellAttackBonus` (`pcAttackSpellBonusTags`,
  [pcAttackCore.js:1022](../src/pcAttackCore.js)).
- Per le armi non compare niente, ma solo perché manca il dato:
  - `attackBonus` esiste per **ogni** attacco, anche di un PG
    ([quickActionsCore.js:169-192](../src/quickActionsCore.js), usato a riga
    300);
  - `pcAttackMonsterTags` esclude solo le azioni con `source` (trucchetti e
    incantesimi), quindi mostrerebbe già il bonus di un'arma;
  - l'editor della scheda conserva il campo, ma non ha una casella per inserirlo
    ([initiative-card-modal.js:3424](../src/initiative-card-modal.js)). La riga
    d'attacco ha solo etichetta, mischia o distanza e danni;
  - «Importa PG» terrebbe il campo
    ([characterSheetImportCore.js:389-411](../src/characterSheetImportCore.js)),
    ma il prompt di [IMPORT_SCHEDA.md:93-96](IMPORT_SCHEDA.md) chiede solo
    `label`, `range` e `components`.

**I dati per calcolarlo:**

- La scheda ha i modificatori di caratteristica e il livello totale, da cui la
  competenza (`proficiencyBonusForLevel`,
  [abilityModifiersCore.js:60](../src/abilityModifiersCore.js)).
- Mancano il resto: accurata, arma magica +N, competenza in quell'arma, Stile di
  Combattimento Tiro (+2).

### Proposta

| Lotto | Cosa fa |
| --- | --- |
| BA1 · Campo nell'editor | Casella «Bonus al tiro» nella riga d'attacco della scheda, per PG e mostri (per i mostri oggi non si modifica), salvata in `attackBonus`. La console non cambia |
| BA2 · Importa PG | Il prompt chiede `attackBonus` per ogni attacco, cioè il bonus totale scritto sulla scheda; un test controlla che l'import lo tenga |
| BA3 · Proposta calcolata | Nella casella vuota un suggerimento: «+5 = For +3, competenza +2» (Destrezza per la distanza). Si salva solo quando il GM lo conferma |
| BA4 · Dopo | I modificatori del momento accanto al bonus: «+1d4 Benedizione», «−1d4 Anatema» |

Il bonus non si calcola da solo in console quando manca: un numero sbagliato al
tavolo è peggio di nessun numero.

**Fatto il 15/11 (BA1 e BA2, in `22a25e43`):**

- `quickActionAttackFieldsWithBonus` in `src/quickActionsCore.js`: la funzione
  pura mette il valore della casella al posto del bonus conservato nella riga.
  - Casella vuota: il bonus si toglie.
  - Azione a tiro salvezza: i campi restano com'erano.
  - Accetta «+5», «5», «−2».
  - Fuori da −30…+30 restituisce `null`.
- `src/initiative-card-modal.js`:
  - casella «Bonus al tiro» accanto a «Fonte», solo per le armi senza tiro
    salvezza (`buildQuickActionEditorRow`);
  - `collectQuickActions` la legge e ferma il salvataggio con «il bonus al tiro
    va da −30 a +30».
- `docs/IMPORT_SCHEDA.md`: tabella, esempio e prompt chiedono `attackBonus`.
  `docs/GUIDA_UTENTE.md`: una riga.
- La console non è cambiata.
- Prove:
  - test nuovi in `test/monsterAttackModel.test.js` e
    `test/characterSheetImport.test.js`;
  - suite completa verde in una copia pulita (6150 test);
  - build di controllo riuscita;
  - banco: scheda e console di Dars con «+5»; il valore fuori limite rifiutato;
    la riapertura che ripresenta «+5».

**Fatto il 15/11 (BA3):**

- `weaponAttackBonusSuggestion` in `src/abilityModifiersCore.js`: Forza in
  mischia, Destrezza a distanza, più la competenza del livello totale; `null`
  senza livello o senza modificatore.
- Nella scheda, sotto la casella vuota, il pulsantino «Usa +6 · For +3, comp.
  +3». I conti usano i modificatori e le classi del modulo in quel momento,
  anche non ancora salvati.
  - Un clic scrive il numero; senza clic non si salva niente.
  - Su una scheda di mostro la proposta non c'è.
  - La scheda Attacchi, aperta in modifica, rifà i conti.
- Le etichette della griglia dell'editor si allineano in alto
  (`align-content:start`): con la proposta la cella del bonus è più alta, e
  «Fonte» restava più in basso.
- Prove:
  - test nuovo in `test/abilityModifiersP1.test.js`;
  - suite completa verde in una copia pulita (6151 test);
  - build di controllo riuscita;
  - banco: Guerriero 5 con For +3 e Des +1 dà +6 in mischia e +4 a distanza; il
    clic, la casella svuotata, il Trucchetto, la Forza portata a +4 (+7 al
    ritorno sulla scheda Attacchi), il salvataggio senza clic, il mostro.

### Rischi

- Nessuno su PF, turno, ordine o metadata.
- Il registro delle schede nella stanza cresce di circa 16 byte per attacco. È
  già pieno con cinque PG (`docs/STUDIO_REGISTRO_SCHEDE_STANZA.md`), ma il token
  tiene comunque il dato.

## Decisioni per l'utente

**Esito:** il 15/11 l'utente le ha approvate tutte come raccomandate
(«Sì, tutte»). La colonna «Raccomandazione» è quindi la decisione presa.

| # | Domanda | Raccomandazione |
| --- | --- | --- |
| G1 | Facciamo una prova in stanza di 15 minuti, con due client veri, prima del codice dei punti 1 e 4? (passi sotto) | Sì: dice quale causa è quella vera |
| G2 | Punto 1: facciamo GA1 (proprietario riallineato) e GA2 (personaggio riconosciuto dal registro, solo `createdUserId` sui token che il tracker non conosce)? | Sì, insieme |
| G3 | Punto 1: il plugin adotta il proprietario scelto dal menu Owner di Owlbear (GA3)? | Sì |
| G4 | Se il GM toglie il proprietario da Owlbear, si toglie anche l'assegnazione? | No: si toglie solo da «Giocatore › Nessuno» |
| G5 | Punto 1: pannello «Giocatori» nelle Opzioni (GA4)? | Sì, dopo GA1–GA3 |
| G6 | Punto 2: dopo l'ultimo dardo serve «Nuovo lancio» per spendere un altro slot (DM1), anche per Raggio rovente? | Sì |
| G7 | Punto 2: la nota «Lanciato dal pannello? Non registrarlo qui» (DM2)? | Sì |
| G8 | Punto 4: l'Annulla nativo si riconosce solo per i movimenti del GM (OA1)? | Sì, dopo la prova G1 |
| G9 | Punto 4: Movimento acceso di base nel profilo Online (OA2)? | Sì |
| G10 | Punto 4: osservatore dei movimenti nel background (OA3)? | Solo se la prova dice che la causa è il tracker chiuso |
| G11 | Punto 5: SB1 e SB2 (chiavi e identità) subito, SB3 (PF, taglia, Leggendario all'idratazione) dopo, con il suo piano? Le voci automatiche di SB3 vanno nella Cronologia? | Sì; Cronologia sì, con un'etichetta «dallo statblock» |
| G12 | Punto 5: SB4 (statblock su un altro dispositivo del GM)? | Rimandato |
| G13 | Punto 6: BA1 e BA2? | Sì |
| G14 | Punto 6: la proposta calcolata nella casella (BA3)? | Sì, come suggerimento da confermare |
| G15 | Punto 3: prima W1–W4 (bestia, console, velocità, taglia: niente PF), poi W5 con un piano a parte? | Sì |
| G16 | Punto 3: quale strada per i PF della forma? | (a), i PF del druido messi da parte sulla pill; (c) solo come ripiego |
| G17 | Punto 3: da dove vengono le bestie? | Archivio 5eTools del GM e JSON o testo incollato. Un elenco SRD dentro il plugin solo se il druido del gruppo non usa l'archivio |
| G18 | Punto 3: le regole di dettaglio | PF temporanei: restano. Aiuto durante la forma: resta sul druido. Sciami: no. PF della forma: media dello statblock, modificabile. Online il giocatore vede i PF della forma. Editor in linea: niente eccesso. Su una mappa nuova la forma non segue |

### Prova in stanza (G1)

**Preparazione:** profilo Online; nei permessi di Owlbear, «Owner Only» e
«Update» accesi per i Character; un PG assegnato a un giocatore nella scena A.

**Punto 1, scena B nuova:**

1. Trascina il token del PG dalla libreria degli asset.
   - Il giocatore prova a muoverlo subito.
   - Poi «Aggiungi all'iniziativa → PG», aspetta due secondi e guarda la card:
     c'è il pallino? Il giocatore riprova a muoverlo.
2. Copia il token del PG dalla scena A e incollalo nella B.
   - Guarda la card: c'è il pallino?
   - Guarda il menu Owner di Owlbear: chi è il proprietario?
   - Il giocatore prova a muoverlo.

Atteso dal codice:

- caso 1: fermo prima dell'iniziativa e libero dopo, se il tracker del GM è
  aperto e la scheda si trova per nome o immagine;
- caso 2: pallino presente, proprietario il GM, token fermo.

**Punto 4:**

1. Nel browser del GM usato in partita: Opzioni → Avvisi di reazione →
   Movimento acceso.
2. Tracker del GM aperto, turno del PG, un goblin ostile in iniziativa a 1,5 m.
3. Il giocatore allontana il PG dal goblin. Guarda due cose:
   - il riquadro Movimento del PG scala i metri?
   - compare l'avviso «Attacco di opportunità»?
4. Ripeti in due modi:
   - con il tracker del GM chiuso;
   - dopo un Ctrl+Z del GM su qualcos'altro, senza fare altro prima del
     movimento.

## Ordine consigliato

1. Prova in stanza G1.
2. Punto 6, BA1 e BA2: piccolo e senza rischi.
3. Punto 1, GA1 e GA2, poi GA3.
4. Punto 4, OA1 e OA2.
5. Punto 2, DM1 e DM2: dopo il lavoro in corso su `pc-attack.js`.
6. Punto 5: SB1 e SB2, poi il piano di SB3.
7. Punto 3: W1–W4, poi il piano di W5, poi W6 e W7.
8. GA4, BA3 e SB4.

## Metodo e fonti

- Codice letto il 15/11/2026 su `main` (`a1fc4bef`), con le modifiche non
  committate di altre sessioni nella cartella. I numeri di riga possono
  spostarsi: `initiativeList.js`, `pc-attack.js` e lo Speed Tracker sono in
  lavorazione.
- **Prove:**
  - `test/pcAttackSpells.test.js` e `test/magicMissileIntegration.test.js`
    (verdi);
  - una simulazione usa e getta dei quattro dardi;
  - la sonda dell'agente sugli omonimi, che esegue `initiativeCards.js` con il
    coordinatore sull'impianto di
    `test/initiativeCardSaveTransportRegression.test.js`.
- **Owlbear Rodeo,** letto con il browser integrato:
  - [Item](https://docs.owlbear.rodeo/extensions/reference/items/item/):
    `createdUserId` è chi ha creato l'item, `lastModifiedUserId` chi l'ha
    modificato per ultimo (sola lettura);
  - [History](https://docs.owlbear.rodeo/extensions/apis/scene/history/):
    `canRedo` dice se la pila del «rifai» ha un'azione, ma non di chi è la
    pila.
- **Collegati:**
  - `docs/AUDIT_GIOCO_ONLINE.md` (O3, O4);
  - `docs/STUDIO_AVVISI_REAZIONE.md` (R5, J1–J5);
  - `docs/PIANO_ATTACCHI_MOSTRI_FASE_4.md` (omonimi);
  - `docs/STUDIO_REGISTRO_SCHEDE_STANZA.md`.
