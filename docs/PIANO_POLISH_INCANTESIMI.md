# Polishing degli incantesimi (piano)

Stato: **studio chiuso il 3/11/2026, decisioni D1–D5 approvate il 4/11/2026; P0, P1 e P2 fatti, P3 in corso (lotti 1, 2, 3, 4 e D6 fatti)**. Questo piano guida la
revisione di tutti i 477 incantesimi prima di aggiungere nuove capacità. Per ognuno si controlla:

- **A, l'interpretazione:** il motore fa ciò che dice il testo 2014?
- **B, i workflow:** lancio, esiti, card, Annulla, Termina e ciò che segue funzionano davvero?

Lo stato incantesimo per incantesimo sta in [`data/spell-polish-register.json`](../data/spell-polish-register.json).
Lo stato dell'automazione resta nel [Piano di automazione](PIANO_AUTOMAZIONE_INCANTESIMI.md).

## Che cosa ha mostrato lo studio

Le regole di base reggono: il confronto automatico tra testi e motore su tutto il catalogo ha trovato poche
contraddizioni, e i 20 incantesimi comuni letti a mano non hanno errori di regola. I difetti stanno nei workflow.
L'audit esistente segna 382 incantesimi su 477 come «non rivisti», cioè controllati solo nella struttura.

## Decisioni

| # | Domanda | Decisione |
|---|---|---|
| **D1** | Prima i difetti o prima la lettura completa? | Prima i difetti gravi |
| **D2** | Gli effetti di zona sulle creature oggi non si vedono sulla card. Mostrarli? | Sì, quelli che contano. Anche il terreno difficile si mostra, quando un attore entra nell'area che lo produce |
| **D3** | Mostrare ovunque quale TS richiede il lancio? | Sì |
| **D4** | Proporre ovunque la formula dei danni, con la crescita per slot? | Sì |
| **D5** | La lettura di P3 in sequenza o con più agenti in parallelo? | In sequenza |
| **D6** | 31 lanci dicono un TS ma non ne chiedono l'esito: aggiungere gli esiti? | Sì, e il lancio rapido considera fallito il TS: vedi il lotto D6 di P3 |

## I lotti

### P0, il banco permanente (fatto il 4/11)

La prova sistematica sta in `test-support/spellSweepHarness.js`: ogni incantesimo, ogni variante, un TS fallito e uno
superato, dal contratto del pannello al comando reale, fino all'Annulla di produzione e al Termina del pannello. Su una
scena in memoria con tre token controlla PF, pill, concentrazione, zone e voci di Cronologia. Sono 1184 lanci in circa
45 secondi.

- `test/spellCatalogSweep.test.js` fallisce se compare un difetto che non è sulla lista delle eccezioni, ciascuna con
  il suo motivo, e anche se un'eccezione non si verifica più: così la lista si accorcia chiudendo i lotti.
- `npm run polish:register` aggiorna il registro: ciò che trova oggi la prova. Conserva ciò che è scritto a mano
  (`reading`, `bench`), e il test controlla che il registro sia aggiornato.
- `npm run polish:sheets -- --out <cartella> [--ids a,b]` scrive le schede da leggere, con il testo accanto al motore.
  Contengono i testi privati dei manuali: lo script rifiuta le cartelle dentro il progetto.

### P1, i difetti gravi (fatto il 4/11)

| Difetto | Incantesimi | Correzione |
|---|---|---|
| Nessun campo danni: i PF non cambiavano | Eruzione Terrestre, Orrido Avvizzimento di Abi-Dalzim, Sfera al Vetriolo, Evoca Raffica, Evoca Pioggia di Armi, Turbine di Spade | `initialHP` e formula in `spellCastResolutionRules.js`. Questi incantesimi non hanno un `damageType`, che era l'unica via per il campo danni di un'area istantanea |
| Applicava «0 elementi» | Allucinazione di Forza | `initialResolution: "manual-save"` e TS Intelligenza: con `none` l'automazione del TS veniva soppressa, e senza bersagli tracciati non nasceva nemmeno la zona |
| Chiedeva un danno inesistente, a pulsante bloccato | Intralciare, Terremoto, Inversione della gravità, Sfera Acquea | `initialHP: false`: una zona con TS al lancio chiede il danno, se non è dichiarato il contrario |
| Concentrazione senza Annulla quando nessuno subisce l'effetto | Luminescenza, Trama ipnotica, Lentezza, Paura, Confusione, Fatale, Calmare emozioni, Drago Illusorio, Minuscole Meteore, Soffio del Drago, Miscela Caustica | Il caster entra in `historyIds` quando il lancio tocca la sua concentrazione. Solo nell'istantanea della Cronologia: in `effectSubjectIds` finirebbe tra i bersagli del Registro di combattimento |

Test: `test/spellPolishP1.test.js`. Provati al banco dal pannello vero: Evoca Raffica, Intralciare, Terremoto,
Allucinazione di Forza e Luminescenza.

### P2, i difetti medi e piccoli (fatto il 4/11)

| Difetto | Incantesimi | Correzione |
|---|---|---|
| Effetto salvato ma invisibile sulla card (D2) | Tocco gelido, Dardo tracciante, Raggio di gelo, Freccia acida, Regressione mentale, Sfera al Vetriolo, Braccia di Hadar e gli effetti di zona di 25 incantesimi | `spellEffectStandsAlone` in `effectLabelCore.js`: un buff o un debuff d'incantesimo senza la pill del suo incantesimo sulla creatura ha una pill sua, in entrambe le viste. Il terreno difficile si vede sempre. Niente × se è legato a una zona o a un incantesimo, perché finisce con loro. Azioni dei mostri e capacità di classe restano come sono |
| TS superato: dimezzava, il testo dice nessun danno | Coltello di Ghiaccio, Creare Falò | `successfulSaveDamage: "none"` |
| Effetto d'attacco a rimozione manuale dal pannello | Tocco gelido, Dardo tracciante, Raggio di gelo | Scade come dichiara l'incantesimo. L'effetto porta anche `spellId` |
| Il limite di bersagli non cresceva con lo slot | Esilio, Charme su persone, Caratteristica potenziata, Volare, Passo veloce, Charme sui Mostri, Incuti Paura, Sonnellino, Fortezza della Mente | `TARGETING_OVERRIDES` in `spells-srd.js`; Esilio nel suo workflow. La distanza massima tra i bersagli, dove il testo ne chiede una, resta al tavolo |
| I dadi dei promemoria non crescevano con lo slot | Nube mortale, Sfera infuocata, Piaga degli insetti, Raggio lunare, Guardiani spirituali, cortina del Muro di ghiaccio, Muro di spine | `baseSlot` e `additionalPerSlotAbove` sui trigger di `spellAreaRules.js` |
| TS non detto (D3) | Tutti i lanci con un TS al lancio: prima 6 su 95 | `spellCastSaveAbility` per chi non lo dichiara già nella zona o nel workflow, e la riga «Tiro salvezza: Destrezza» tra i bersagli. I TS successivi hanno i loro promemoria e restano fuori |
| Formula non proposta (D4) | Prima 20 lanci su 68 con campo danni | `SPELL_CAST_DAMAGE_DICE` in `spellCastResolutionRules.js`, con la crescita per slot. Con esiti misti e gli stessi dadi l'etichetta dice i dadi. Un trucchetto mostra i dadi base e, sotto il campo, come crescono col livello del personaggio, che il pannello non conosce. Il pannello non mostrava quel suggerimento: ora il footer lo disegna, anche per «TS superato: X. TS fallito: Y.» |
| «Porta Dimensionale» nell'errore di portata di ogni teletrasporto | Passo velato e simili | Messaggio generico |
| «Durata non indicata» accanto al badge Concentrazione | Incantesimi di sola concentrazione | `spellTurnsLabel` riceve la concentrazione |
| Livello 0 nel riferimento | Dominare persone | Livello 5. Era l'unica differenza tra catalogo e riferimento |
| «Applica» senza lasciare traccia | Controllare Fiamme, Modellare Acqua, Modellare Terra | Passano a solo registrazione: **Registra lancio** |
| Alla preparazione la variante extraplanare toglieva la concentrazione | Punizione Esiliante | Alla preparazione la scelta non decide la concentrazione |
| La pill non diceva la velocità 0, già nel profilo di movimento | Trama ipnotica | Dettaglio «Vel 0» |

**Trovati al banco, invisibili alla prova automatica:**

- La normalizzazione delle condizioni scartava `spellId`, quindi gli effetti d'attacco restavano nascosti anche con la regola
  nuova. Ora lo conserva, e `test-support/spellSweepHarness.js` guarda le istanze normalizzate, come la card.
- Il cassetto della vista compatta mostrava due volte i dettagli di ogni effetto: la pill veniva avvolta due volte.

**Limiti noti:**

- Nella vista espansa la pill di un incantesimo mostra solo il nome, per scelta del progetto: «Vel 0» si legge nel cassetto
  della vista compatta.
- Il TS mostrato prendeva anche la caratteristica di comodo dei workflow senza TS: è un errore di questo lotto, corretto nel
  lotto 1 di P3.
- I round successivi di Tempesta di Vendetta cambiano dadi a ogni round: il campo non propone una formula.
- I dadi cresciuti dei promemoria, che al banco di allora non si potevano vedere, sono provati dal lotto 2 di P3.

Test: `test/spellPolishP2.test.js`. Provati al banco dal pannello vero, in vista compatta ed espansa: Tocco gelido,
Regressione mentale, Intralciare, Braccia di Hadar e Trama ipnotica. Solo nel pannello: Palla di fuoco, Charme su persone,
Modellare Terra, Debilitazione.

### P3, la lettura vera (A)

Lotti di circa 40 incantesimi con `npm run polish:sheets`, in sequenza (D5), partendo dai più usati. I 145 tracciati o
solo registrati richiedono un controllo veloce. Per ogni lotto: il registro segna `reading`, i dubbi di regola vanno al
proprietario del progetto, le correzioni passano dal banco. Altri 65 incantesimi hanno dadi di danno nel testo e nessun
campo al lancio: molti sono giusti (punizioni, evocazioni, promemoria), vanno classificati qui.

Già annotati per questa lettura: i round successivi di Tempesta di Vendetta; Muro di pietra. I 65 incantesimi con dadi nel testo
e senza campo al lancio: quelli del lotto 3 sono classificati lì.

**Dal lotto 2 la lettura non si ferma ai dati.** Per ogni incantesimo si guarda anche che cosa succede davvero: chi entra
nell'area, se ogni promemoria di TS compare nel momento che il testo dice, che cosa fa con un TS superato e con uno fallito,
come scorrono le durate lanciando nel turno del caster, come finisce. Le schede riportano la sagoma vera, chi conta come dentro
e ogni promemoria. Il banco esegue il vero servizio di sfondo: `test-support/boss-actions-browser/polishBench.js` (`zoneRun`,
`reminderRun`, `damageWith`, `terminateFromPanel`), sul banco `frame.html?scenario=tracker`.

#### Lotto 1 (fatto il 4/11): i 40 più usati

Trucchetti d'attacco e di TS, cure, buff comuni e i classici fino al 3° livello. Durate, gittate, aree, condizioni, scadenze,
concentrazione e crescita per slot coincidono con i testi: nessun errore di regola nelle automazioni. Corretti:

| Difetto | Incantesimi | Correzione |
|---|---|---|
| Un TS che il testo non ha, introdotto da P2 | Dardo incantato, Dissolvi magie, Ristorare inferiore, Rinascita e altri 8 con la caratteristica di comodo del workflow; Telekinesi, che risolve una contesa | Il pannello usa la caratteristica del workflow solo se chiede l'esito di un TS, e non con le etichette di contesa |
| Promemoria che chiedeva un TS senza dire quale | Nube maleodorante, Folata di Vento: gli unici 2 su 78 | Caratteristica nei dati del promemoria. Per la Nube, chi fallisce riceve «Conati: azione persa», finora mai applicata |
| Mancava l'immunità al tuono | Silenzio | `damageDefenses` sull'effetto di chi è nella zona; il dettaglio dice anche della componente verbale |
| Non diceva il caso del non morto | Tocco gelido | Nel dettaglio dell'effetto: si risolve al tavolo |
| La cura non proponeva i dadi | Cura ferite, Parola guaritrice, Parola guaritrice di massa, Cura ferite di massa, Preghiera di guarigione | `spellCastHealingFormula`: «Cura · 3d8 + mod», con la crescita per slot |

Test: `test/spellPolishP3.test.js`. Provati al banco dal pannello vero: Silenzio in entrambe le viste; nel pannello Dardo
incantato, Rinascita, Dissolvi magie, Ristorare inferiore, Guarire, Telekinesi, Blocca persone, Cura ferite e Charme su persone.
Il promemoria della Nube è provato dal lotto 2, che ha portato al banco i servizi di sfondo.

#### Lotto D6 (fatto il 4/11): gli esiti e il lancio rapido

Se il bersaglio superava il TS, il pannello di 31 lanci non aveva modo di dirlo. Ora ci sono due percorsi, senza nuovi pulsanti:

- **Il pannello aperto a mano** (Incantesimi o il ⚙ del libro) chiede l'esito di ogni bersaglio. Con un TS superato spende lo slot,
  non lascia effetti né concentrazione, e l'Annulla restituisce lo slot.
- **Il lancio rapido** (console 🗡️, menu ⚡, libro) considera fallito il TS, come già faceva
  `QUICK_ACTION_INITIAL_SAVE_OUTCOME`. Se non serve altro applica subito: 25 incantesimi, prima 5 con il TS dichiarato. Se serve
  un'area, un danno o una variante apre il pannello con ogni bersaglio già su «Fallito»: basta inserire ciò che manca e segnare
  chi lo supera (`withAssumedSaveOutcomes`, indirizzo `assumedSaveOutcome`). La riga del TS lo dice.

| Che cosa | Incantesimi | Correzione |
|---|---|---|
| Esiti (21) | Amicizia con gli animali, Scagliare maledizione, Charme su persone, Dominare bestie, Dominare mostri, Dominare persona, Estasiare, Costrizione, Risata incontenibile, Imprigionare, Suggestione, Suggestione di massa, Modificare memoria, Allucinazione mortale, Legame planare, Charme sui Mostri, Incuti Paura, Nemici in Abbondanza, Vincolo della Terra, Duello Obbligato, Corona di Follia | Stessa corsia di Blocca persone: `MULTI_TARGET_SAVE_SPELL_IDS` e `workflowRule`. Le condizioni restano in `AUTOMATION` (`automationSaveRules`), gli effetti in `SPELL_EFFECTS` |
| Limite per slot | Amicizia con gli animali: mancava, il testo lo prevede | Nel suo workflow |
| Durata per slot ignorata sulla corsia dei TS | Dominare a slot alti restava 10 round; vale anche per Cerchio magico | `getSpellDurationTurns` nell'esecutore |
| La pill durava 1 round | Imprigionare, che dura finché non viene dissolto | Scadenza manuale |
| TS solo per chi non è consenziente | Ingrandire/ridurre, Levitazione, Spostamento planare, Metamorfosi, Metamorfosi pura, Metamorfosi di Massa, Sfera elastica, Sembrare | Nessun esito: un alleato non tira. La riga dice «se non è consenziente» |

Confronto prima e dopo su 83 lanci, anche a slot alti: stessi effetti, stessa concentrazione, stesso Annulla e stesso Termina.
Restano tre differenze volute:
- una condizione tolta a mano termina l'incantesimo su quel bersaglio, e con l'ultimo bersaglio anche la concentrazione;
- a slot 5–8 gli effetti di Scagliare maledizione seguono la pill invece di contare i round;
- gli effetti riportano il loro incantesimo (`spellId`).

Rimandati alla lettura: Muro di pietra, Stretta della Terra di Maximilian e Morsa del Gelo, che hanno pedine, danni o la console.
Le durate per slot di Costrizione, Legame planare e Suggestione di massa non sono tracciate: al tavolo non pesano.

Test: `test/spellPolishP3.test.js`. Provati al banco:
- **Dal menu ⚡:** Charme su persone applicato subito con lo slot speso; Inaridire con il danno da inserire; Palla di fuoco con tre
  bersagli già falliti dopo l'area, uno cambiato in superato.
- **Dal pannello a mano:** Charme su persone con TS superato, Suggestione, Dominare persona al 7°, Palla di fuoco senza esiti
  precompilati, Levitazione.

#### Lotto 2 (fatto il 4/11): i 40 successivi, più 22 aree del lotto 1 rilette

Zone, muri, tempeste, cure di gruppo e attacchi a incantesimo, poi di nuovo le aree già lette, con il metodo nuovo. Il lotto
ha trovato quasi tutto al banco, non nei dati:

| Difetto | Incantesimi | Correzione |
|---|---|---|
| La × sulla pill di una zona toglieva la pill, ma zona, concentrazione ed effetti restavano | Tutte le zone in concentrazione | La concentrazione di una zona non ha bersagli: `__terminateSpellOnTrackerCard` la interrompe davvero, come il Termina del pannello. Il titolo non dice più «su questo bersaglio» |
| Il danno dal pannello o da un promemoria di zona non chiedeva il TS «quando subisce danni» | Dominare persona, bestie e mostri, Risata incontenibile e ogni effetto con quel momento | `broadcastEffectSaveDamageNotices` dopo il commit: solo un avviso, come fanno già Quick HP, console Boss e attacchi |
| Il danno ritardato si perdeva: la pill scadeva nello stesso fine turno che doveva chiederlo | Freccia acida, Sfera al Vetriolo (gli unici 2 del catalogo) | La pill resta finché il promemoria non è risolto; il promemoria ora ha campo danni e Conferma |
| Un attacco mancato applicava gli effetti del colpo | Freccia acida, Dardo tracciante, Tocco gelido, Raggio di gelo | L'esecutore legge l'esito dell'attacco, non solo la scelta |
| Dall'avviso il contatore non scendeva: il Guardiano non svaniva mai | Guardiano della fede (60 danni), Cordone di Frecce | `zoneTriggerResourceSpend` anche in `buildReminderResolutionPlan` |
| Nessun promemoria di TS | Zona di verità | TS CAR all'ingresso e a inizio turno; chi fallisce non viene richiesto, e l'etichetta finisce uscendo (come Ragnatela) |
| Il TS all'ingresso solo nel proprio turno | Bagliore lunare | Il primo ingresso in ogni turno, come dice il testo |
| Il Prono finiva con l'incantesimo | Unto, Terremoto | Resta, come già per Tempesta di nevischio |
| Mancava il ricordo della deriva | Nube mortale | Promemoria a inizio turno del caster; la zona si trascina a mano |
| Sagome sbagliate | Sfera infuocata (4×4 caselle invece di 3×3), Guardiano della fede (6×6 m invece di 9×9), Nube di nebbia (nessuna crescita per slot) | Dati del catalogo e `SPELL_AREA_SLOT_GEOMETRY_SCALING` |
| Bastava toccare, il testo vuole interamente dentro | Silenzio, Nube maleodorante | `containment: "fully-inside"`, come la Gabbia di forza |
| Mancava la forma ad anello | Barriera di lame, Muro di spine | `placementChoices`, come Muro di fuoco: a ogni lancio si sceglie la forma |
| La pill della zona ignorava la durata per slot | Cerchio magico | `turns` in `staticSpellZoneOwnerOperation` |
| Dati diversi dal testo | Barriera di lame (+1d10 per slot che non esiste), Fiotto acido (può prendere due creature) | Dati |

**Dubbi di regola, decisi dal proprietario il 4/11:**
- Riscaldare il metallo: resta com'è. Chi tiene l'oggetto e supera il TS non ha svantaggio: il testo italiano si legge così,
  l'inglese direbbe che lo ha comunque.
- Risata incontenibile: alla fine dell'incantesimo il Prono resta, come per Unto e Terremoto: il bersaglio deve rialzarsi.
- Caratteristica potenziata: Resistenza dell'orso chiede i 2d6 nel pannello, con un tiro solo per tutti i bersagli; i PF temporanei
  rimasti spariscono con l'incantesimo (`SPELL_CAST_TEMPORARY_HP_BY_CHOICE`).
- Spruzzo colorato e Sonno: tra i bersagli una riga dice la riserva di PF da tirare, con la crescita per slot
  (`spellCastHpPoolFormula`). La scelta dei bersagli resta al GM.

Provato al banco, con il servizio di sfondo vero e lanciando nel turno del caster: si veda `bench` nel registro. La × anche nella
vista compatta, dal cassetto degli effetti. Non provati: lo spostamento di Bagliore lunare e di Sfera infuocata, il cambio di
direzione di Folata di vento, il Vortice di Controllare acqua, il ripetere di Riscaldare il metallo.

#### Lotto 3 (fatto il 4/11): la gittata dal caster, poi i 40 successivi

**La gittata dal caster, chiesta dal proprietario il 4/11.** Blocca persone passava a 19 m: 220 incantesimi con i bersagli
scelti a mano non misuravano la gittata, e sulla corsia «lifecycle» non c'era proprio un controllo.

- **Da dove viene:** dal testo dell'incantesimo (`spellTargetRangeMeters`). Contatto è 1,5 m, «Incantatore (raggio di N metri)» è
  quel raggio. Personale, vista, illimitata e speciale non si misurano.
- **Come si misura:** in linea d'aria dalle caselle occupate più vicine (`gridRangeDistance`). Una casella vicina vale una anche
  in diagonale: il contatto la raggiunge.
- **Dove agisce:** un bersaglio fuori gittata esce dai bersagli del pannello, che dice chi è, sia dalla casella sia dalla selezione
  sulla mappa, all'apertura e cambiando caster. All'applicazione il controllo si ripete: se il token si è spostato il lancio è
  rifiutato, senza applicare né spendere nulla. Il lancio rapido, fuori gittata, apre il pannello. Il controllo non riscrive la
  selezione della mappa quando reagisce a un suo cambiamento: al banco questo faceva rincorrere due scrittori e bloccava la pagina.
- **L'eccezione, chiesta dal proprietario il 4/11:** per ciò che la mappa non sa (Incantesimo distante, Tiratore di incantesimi, il
  tocco di un famiglio) basta ripetere il gesto, senza nuovi pulsanti, e il rifiuto dice come. Un bersaglio rifiutato si spunta di
  nuovo; un punto rifiutato sulla mappa si riprova, ma un doppio clic non conta (`spellAreaRangeRetry`, 500 ms). Vale per quel
  lancio: nel comando `targeting.rangeOverrideIds`, bersaglio per bersaglio, e nell'area `preview.rangeOverride`, che teletrasporti
  e pedine rispettano quando rimisurano. Il pannello lo ricorda accanto alla gittata. Togliendo il bersaglio l'eccezione decade.
  In Catena di fulmini vale per il primario, non per i 9 m da lui.
- **Che cosa resta come prima:** il controllo non è una regola spaziale (`targeting.casterRange`), quindi non chiede un caster e il
  lancio rapido in gittata applica subito. Senza caster o senza una misura decide il GM. Le zone non cambiano: la loro gittata
  la misura lo strumento d'area. I trigger, le azioni attive e le risoluzioni preparate non la misurano.
- **Limite:** la misura è sul piano: la quota non conta. Incantesimo distante e Tiratore di incantesimi non raddoppiano la gittata
  da soli: l'eccezione la ignora.

Il pannello dice la gittata tra i bersagli: «Bersagli entro 18 m · Distanza massima tra bersagli: 9 m».

**I 40 letti.** Trucchetti da Xanathar e Tasha, incantesimi di 1° e 2° livello:

| Difetto | Incantesimi | Correzione |
|---|---|---|
| Danno e Trattenuto anche con il TS superato | Stretta della Terra di Maximilian | Chiede l'esito. Chi supera non subisce nulla; la mano e la concentrazione restano, e può afferrare qualcun altro |
| Dal pannello nessun esito e nessun danno, e l'etichetta anche a chi supera | Morsa del Gelo | Corsia dei TS, come Scheggia della Mente |
| Niente tiro per colpire e niente primo danno | Dardo Stregato | «Colpito» o «Mancato» e il danno, 1d12 per slot. Con un colpo mancato nessuna pill e nessuna concentrazione |
| Niente tiro per colpire: l'effetto valeva sempre | Raggio di affaticamento, Raggio di Infermità | «Colpito» e «Mancato», o «Superato», «Fallito» e «Mancato» dove c'è anche il TS |
| Un turno di troppo | Braccia di Hadar | Le reazioni tornano all'inizio del turno del bersaglio, come dice il testo |
| Il popup diceva un TS che non esiste | Ripeti di Dardo Stregato e di Debilitazione, attraversamento di Prigione Mentale | `checkLabel` vuoto: danno automatico |
| Il danno era obbligatorio anche se nessuno lo subiva | Ogni lancio con esiti | `spellCastSparesEveryTarget`: un colpo mancato, un immune, un TS superato che annulla il danno |
| Il rifiuto di una misura diceva solo «La validazione spaziale non è riuscita» | Ogni rifiuto sulla corsia di area | Il pannello mostra il motivo |
| Il campo danni non diceva di quale danno si trattasse | Coltello di Ghiaccio | Indicazione nel campo: è l'esplosione; l'1d10 del colpo si applica a parte |

Le decisioni prese su questi incantesimi, da rivedere se non convincono:
- Stretta della Terra e Raggio di Infermità avevano un test che voleva il contrario: «senza workflow TS», «Cast come colpo già
  confermato». Risalivano ad agosto, senza una decisione scritta, e oggi che lo slot si spende al lancio il colpo mancato deve
  potersi registrare.
- Dal lancio rapido Raggio di affaticamento e Dardo Stregato considerano il colpo a segno, come il TS fallito della decisione D6.

Classificati, nessun difetto: Rintocco dei Morti, Frusta di Spine, Lenza Elettrizzante, Lama Verdefiamma, Globo Cromatico e Dardo di Caos
dal pannello registrano il lancio perché tiro e danno stanno nella console attacchi (`pcAttackCantripCatalog.js`,
`pcAttackSpellCatalog.js`). Lama Roboante dal pannello mette solo l'etichetta: il colpo è un attacco con arma in console.

Limite rimasto: il colpo di Coltello di Ghiaccio non è registrato. Servirebbe un bersaglio primario in un lancio ad area.

Provato al banco, con il servizio di sfondo vero: la gittata su ogni percorso, l'eccezione dal pannello fino all'applicazione su
entrambe le corsie e in Catena di fulmini, e sullo strumento vero della mappa con Palla di fuoco; gli esiti di Dardo Stregato, dei due raggi e di Morsa
del Gelo, il promemoria di Raggio di affaticamento a fine turno del bersaglio, il «Ripeti» a inizio turno del caster, la scadenza di
Braccia di Hadar, Nube di Pugnali all'ingresso e a inizio turno. **Non provata:** la mano di Stretta della Terra sulla mappa: lo
strumento del banco non disegna le pedine. L'esecuzione con TS superato e fallito è coperta dai test (`test/spellPolishLot3.test.js`).

#### Lotto 4 (fatto il 4/11): i 40 successivi

Trucchetti, incantesimi di 1° e 2° livello e i primi di 3°. Solo correzioni sui dati e quattro piccoli raccordi, che non toccano turno
attivo, riconciliazione dei metadati, sincronizzazione dei PF o barre sulla mappa.

| Difetto | Incantesimi | Correzione |
|---|---|---|
| Nessuno faceva mai il TS: la regola con Trattenuto c'era, nessun trigger la chiamava | Trabocchetto | TS Destrezza a chi entra nel cerchio o lo attraversa. Il fallimento applica la regola dell'incantesimo, con il suo TS a fine turno |
| Il Fumo chiedeva il TS e accecava come i Fuochi, per 1 turno | Pirotecnica | Una variante può cambiare la politica della zona (`placementChoices[].zonePolicy`): il Fumo non ha TS e dura 1 minuto |
| L'accecamento dei Fuochi finiva al cambio di round: con la pill di 1 turno se ne andavano anche le condizioni | Pirotecnica | L'esecutore legge la durata che la variante dichiara (`spellWithChoiceTiming`): pill e condizione arrivano alla fine del turno successivo del caster |
| Il freddo a inizio turno era solo un avviso, senza campo danni | Fame di Hadar | Promemoria con il campo, come Nube di Pugnali |
| Non assordava il caster, e senza una creatura selezionata non si lanciava | Vento di Interdizione | Aura che si applica da sola, con il caster. Il terreno difficile ha un `targeting` suo e vale per gli altri |
| Nessun promemoria del danno a inizio turno | Miscela Caustica di Tasha | Promemoria con il campo. L'etichetta non nomina i dadi, che crescono con lo slot |
| Lo slot non arrivava ai promemoria sulla corsia delle aree | Miscela Caustica di Tasha | `hasScaledReminder`: il lancio lascia lo slot sulla pill. 4d4 allo slot 2 |
| Accecato e Assordato al lancio, e toglierli finiva l'incantesimo | Percezione delle Bestie | Valgono solo usando i sensi della bestia, a mano: il dettaglio lo dice. Scheda chiusa nell'audit |
| La gittata misurava la creatura a 18 m, che sono dell'oggetto | Catapulta | 45 m: i 18 dell'oggetto e i 27 del volo |
| La pill restava su chi superava il TS | Incuti Paura | `parentRemoval: "target"`, come Blocca persone |
| La card diceva solo il volo | Forma gassosa | Anche resistenza, vantaggi, divieti e fine a 0 PF |
| La riga diceva 4d10 a ogni slot, mentre il campo li faceva crescere | Allucinazione mortale | La riga non nomina i dadi |

Due test fissavano il comportamento di prima e sono cambiati: le due condizioni di Percezione delle Bestie al lancio
(`test/phb2014ExtraSpellCatalog.test.js`) e l'avviso di Fame di Hadar (`test/spellZoneTriggerCore.test.js`).

Dubbio deciso dal proprietario il 4/11: **Protezione dai veleni** neutralizza un veleno già presente, e il lancio toglie Avvelenato, nello
stesso comando della pill (`buildCastCleanseOperations`, `planCleanseTarget`): un annullamento riporta tutto. Con «Applica condizioni
dell'incantesimo» spenta non toglie nulla.

Limiti rimasti:
- **Protezione dai veleni:** con più veleni il testo ne toglie uno che il caster conosce o uno a caso. Il plugin non li distingue: toglie il
  primo in elenco, e gli altri restano.
- **Trabocchetto:** quando nessuno resta trattenuto l'incantesimo si termina a mano, e il promemoria lo dice. La pill e la zona stanno
  sul caster, e togliere la condizione agisce solo sulla creatura che la porta: la chiusura automatica toccherebbe l'esecutore delle
  rimozioni per tutti gli incantesimi. Con due creature appese si chiude dopo che si è liberata l'ultima.
- **Fame di Hadar:** il testo acceca solo chi è completamente dentro, il motore anche chi tocca il bordo: la zona ha una sola regola di
  appartenenza per tutti i suoi effetti, e danni e terreno difficile valgono anche sul bordo.
- **Fuochi di Pirotecnica:** la zona resta disegnata fino alla fine della durata, senza alcun effetto per chi vi entra.

Rimandati ai loro lotti, trovati provando il Vento: **Campo antimagia e Cerchio di Potere** chiedono una creatura selezionata anche se
l'area è fissata sul caster, quindi da soli non si lanciano; Cerchio di Potere non conta il caster tra chi ne beneficia.

Classificati, nessun difetto: Ferocia Primordiale e Infestazione si risolvono nella console attacchi.

Provato al banco, con il servizio di sfondo vero: Trabocchetto all'ingresso e all'attraversamento, fino al TS a fine turno; Fame di
Hadar a inizio e fine turno; Vento con il token che esce e rientra, fino a Termina; Miscela allo slot 2; Pirotecnica con le due varianti,
turno per turno; Percezione delle Bestie; Catapulta a 25 m; Incuti Paura e Corona di Follia con il TS superato; Scagliare maledizione
con l'azione persa; Creare Falò, Diavoletto di Polvere, Spirito Guaritore, Cordone di Frecce, Duello Obbligato, Scudiscio Mentale,
Estasiare; Forma gassosa nelle due viste; Protezione dai veleni con due veleni, con l'annullamento e con le condizioni spente, che il
Registro segna «− Avvelenato». **Non provata:** la risoluzione preparata di Colpo Intrappolante, perché il banco non apre
il suo popup: i dadi per slot sono coperti dal calcolo, non dal percorso intero. Test in `test/spellPolishLot4.test.js`.

### P4, i workflow che la prova non copre ancora (B)

- Le azioni del ⚡ e gli spostamenti delle zone.
- La console attacchi e il lancio dalle schede dei mostri.
- Le resistenze nei danni ad area: l'esecutore ad area non legge il tipo di danno né le difese del bersaglio, a differenza
  della console attacchi. Da verificare e, se serve, da decidere.
- Un giro automatico al banco sui casi complessi.
- I casi che oggi la prova esclude, sulla lista delle eccezioni del test: Animare oggetti, i teletrasporti, i ritorni in vita.

### P5, la prova in stanza

Una lista breve e mirata, che raccoglie anche ciò che i lotti precedenti non hanno potuto provare al banco.

## Come si lavora

1. Prima di correggere, si riproduce il difetto con `test-support/spellSweepHarness.js` o al banco.
2. Si corregge il dato o la regola più piccola che lo risolve, e si toglie l'eccezione da `test/spellCatalogSweep.test.js`.
3. `npm run polish:register`, `npm test`, `npm run build`.
4. Ciò che tocca il pannello o la card si prova al banco dal pannello vero, in vista compatta ed espansa, e si annota in
   `bench` nel registro.
5. Mai testi dei manuali nel repository: né nel registro, né nei documenti, né nei test.
