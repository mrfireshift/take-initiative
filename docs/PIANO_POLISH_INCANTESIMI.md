# Polishing degli incantesimi (piano)

Stato: **studio chiuso il 3/11/2026, decisioni D1–D5 approvate il 4/11/2026; P0, P1 e P2 fatti, P3 fatto (lotti da 1 a 11 e D6: 477 incantesimi letti su 477, 167 corretti); P4 quasi chiuso (azioni del ⚡, zone che si spostano, difetti certi e difese nei danni e nei promemoria fatti; resta la console attacchi); resta P5**. Questo piano guida la
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

Già annotati per questa lettura, e chiusi: i round successivi di Tempesta di Vendetta (lotto 8); Muro di pietra (lotto 7). I 65 incantesimi con dadi nel testo
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

Rimandati ai loro lotti, trovati provando il Vento e chiusi dopo: **Campo antimagia** (lotto 8) e **Cerchio di Potere** (lotto 6) chiedevano una
creatura selezionata anche se l'area è fissata sul caster, quindi da soli non si lanciavano; Cerchio di Potere non conta il caster tra chi ne beneficia.

Classificati, nessun difetto: Ferocia Primordiale e Infestazione si risolvono nella console attacchi.

Provato al banco, con il servizio di sfondo vero: Trabocchetto all'ingresso e all'attraversamento, fino al TS a fine turno; Fame di
Hadar a inizio e fine turno; Vento con il token che esce e rientra, fino a Termina; Miscela allo slot 2; Pirotecnica con le due varianti,
turno per turno; Percezione delle Bestie; Catapulta a 25 m; Incuti Paura e Corona di Follia con il TS superato; Scagliare maledizione
con l'azione persa; Creare Falò, Diavoletto di Polvere, Spirito Guaritore, Cordone di Frecce, Duello Obbligato, Scudiscio Mentale,
Estasiare; Forma gassosa nelle due viste; Protezione dai veleni con due veleni, con l'annullamento e con le condizioni spente, che il
Registro segna «− Avvelenato». La risoluzione preparata di Colpo Intrappolante è stata provata nel lotto 5, quando il banco ha imparato ad
aprire quel popup. Test in `test/spellPolishLot4.test.js`.

#### Lotto 5 (fatto il 4/11): i 40 successivi

Gli ultimi di 3° livello, quelli di 4° e i primi di 5°.

| Difetto | Incantesimi | Correzione |
|---|---|---|
| Proteggeva anche i nemici nell'aura | Aura di Purezza | Filtro «non ostili», come Aura di Vita. Il caster ha la pill del lancio |
| Chi subiva danni restava Privo di sensi | Sonnellino | Finisce col danno, come Sonno, solo su quella creatura. Prono resta |
| Il Grande Albero non dava i 10 PF temporanei | Guardiano della Natura | Dati dal lancio, nello stesso comando della pill. Finiscono con la forma |
| Il limite di oggetti non cresceva con lo slot | Animare oggetti | 10 di peso, più 2 per ogni slot sopra il 5°, nel pannello e all'esecuzione (`animatedObjectsMaximumCost`) |
| La ritorsione diceva «in mischia» | Ombra di Moil | Il dato era giusto, il testo no: ogni attacco da entro 3 m |
| Non diceva i 9 m tra i bersagli | Fortezza della Mente | Il pannello ora li dice. Limite: non li misura (sotto) |
| Resistenze solo etichetta: le console non dimezzavano | Fortezza della Mente, Aura di Purezza, Aura di Vita, Morte Apparente | `mechanics.damageDefenses`, come Protezione dai veleni. Il campo `damageResistances` non lo leggeva nessuno. Morte Apparente ha 12 tipi e una sola micropill, «Res. danni (no psichici)» |
| L'effetto andava a tutti nell'area, caster compreso, e togliere una spunta non contava | Santificare | Selezione `area-subset` con `preselect: "others"`: tutti spuntati tranne il caster, che sta in lista e si spunta a mano. Chi resta senza spunta, e il caster se non spuntato, è in `exemptCreatureIds` finché la zona dura (`zonePolicy.unselectedStayOut`). Chi arriva dopo ne fa parte |
| Togliere una spunta dopo Modifica bersagli bloccava il lancio con «Registra un esito per ogni bersaglio» | Tutti gli incantesimi ad area senza scelta dei bersagli (Palla di Fuoco) | Il comando riuniva le spunte con la lista dell'area (`placementPayload`). Ora vale la lista del GM, e la zona conserva quella dell'area come base |
| Dopo Modifica bersagli la riga fuori dall'area restava spenta | Gli incantesimi «a scelta» (`area-subset`: Cura ferite di massa e gli altri) | La lista ora si apre davvero. Il test non lo vedeva: spuntava la casella anche se spenta |

Decisioni del proprietario sui dubbi del lotto, il 4/11:
- **Contagio resta com'è.** Il testo chiede un attacco e il pannello non ha l'esito del colpo: un colpo mancato non si registra. Spostarlo
  sulla corsia dei TS costerebbe troppo: tocca il conteggio dei tre TS e i promemoria delle malattie.
- **Santificare in due passi.** Le spunte e il caster sono fatti. Il TS Carisma resta un promemoria fino a P4 (sotto).
- **Le quattro resistenze sono difese vere.** Le leggono la console attacchi, la console Boss e le reazioni. L'esecutore ad area no: è già in P4.

Limiti rimasti:
- **Fortezza della Mente** dice i 9 m tra i bersagli ma non li misura. La corsia lifecycle controlla solo la gittata dal caster.
- **Santificare:** chi resta senza spunta non ha neanche la pill «Santificato», che è un promemoria. La protezione dei tipi esclusi, per il
  testo, vale per chiunque sia dentro.

Falsi allarmi, da non riaprire: Frecce Infuocate ha il pulsante spento solo nel turno del lancio. Il promemoria dopo il danno di Nemici in
Abbondanza compare, ma dopo il popup di concentrazione se anche il caster ha subito danni. Muro d'Acqua ha la forma circolare tra le scelte.

Il banco è cresciuto: `viewport.transformPoint` nel finto SDK, senza il quale il popup delle risoluzioni preparate non si apriva, `preparedRun`
per provarle, e in `castFromPanel` `untick`, `mapSelection` e il clic su Modifica bersagli quando le righe sono bloccate.

Provato al banco, con il servizio di sfondo vero: Aura di Purezza con nemici, Mira che esce e rientra, Termina; Sonnellino col danno; il Grande
Albero fino a Termina; Animare oggetti nel pannello, allo slot 6 e tornando al 5; Fortezza della Mente a due bersagli; Punizione Accecante,
Punizione Demoralizzante e Colpo Intrappolante dal popup vero; Frecce Infuocate; Fulgore Nauseante; Sfera della Tempesta; Sudario Spirituale;
Aura di Vitalità e di Vita; Compulsione; Nemici in Abbondanza e Dominare Bestie col danno; Interdizione alla morte a 30 danni; Contagio;
Telecinesi; Santificare; i due muri; Onda di Marea; Anatema Elementale; Scudo di fuoco; Morte Apparente; Arma Elementale allo slot 5. **Non
provate:** le pedine di Animare oggetti e di Mano arcana sulla mappa, che il banco non disegna: coperte dai test. Test in
`test/spellPolishLot5.test.js`.

Provato al banco dopo le decisioni: le resistenze con `damageDefensesForItem` sulle creature vere, anche uscendo dall'aura e dopo Termina;
Morte Apparente nella vista compatta, dove ha una sola micropill, e in quella estesa, dove la pill dell'incantesimo non ne mostra. Santificare
con una spunta tolta, con il caster aggiunto, con la selezione del caster sulla mappa e senza nessuno nell'area; chi esce e rientra; chi arriva
dopo; Annulla e Termina. Palla di Fuoco con un bersaglio tolto e uno aggiunto da fuori, che ha scritto i danni giusti. Cura ferite di massa con
una riga fuori dall'area.

#### Lotto 6 (fatto il 4/11): i 40 successivi

Gli ultimi di 5° livello, quelli di 6° e i primi di 7°.

| Difetto | Incantesimi | Correzione |
|---|---|---|
| Non si lanciava senza una creatura selezionata, e l'aura valeva anche per i nemici | Cerchio di Potere | Aura sul caster senza scelta, filtro «amiche», come Passare senza tracce. Il caster ha la pill del lancio |
| La durata non seguiva lo slot | Suggestione di massa | 10 giorni, 30 giorni, un anno e un giorno, sulla pill del lancio e su quella della creatura (`effectForCastDuration`) |
| Immunità e resistenze solo etichetta | Investitura del Ghiaccio, Investitura della Fiamma, Abito Ultraterreno | `mechanics.damageDefenses`, come le quattro del lotto 5 |
| Nessun limite di bersagli | Camminare nel vento | Il caster più dieci: 11 |
| Il promemoria diceva «Danno di zona» anche senza danni | Collera della Natura, Santificare, ogni zona con avviso o condizione | «Effetto di zona» quando non c'è nulla da scrivere sui PF |
| I 50 PF temporanei restavano dopo la fine | Trasformazione di Tenser | La pill è la loro fonte: quelli rimasti finiscono con l'incantesimo. Finiti i PF, l'incantesimo continua |

Decisioni del proprietario sui dubbi del lotto, il 4/11:
- **Trasformazione di Tenser:** i PF temporanei rimasti finiscono con l'incantesimo, come dice il testo. La decisione D3 di CAP-TEMP è
  rovesciata: partiva da una lettura sbagliata.
- **Muro di Luce:** Accecato non finisce con l'incantesimo. Dura il suo minuto, o finché la creatura non supera il TS.
- **Abito Ultraterreno:** le due immunità valgono insieme: fuoco e veleno, oppure radiosi e necrotici. La traduzione dice «o».

Limiti rimasti:
- **Proibizione:** il promemoria compare per ogni creatura e il GM conferma i tipi scelti, perché il plugin non conosce il tipo del token.
- **Investitura del Ghiaccio:** il Cono gelido applica la velocità dimezzata, ma il danno resta manuale, a differenza delle altre Investiture. Fatto in P4.

Falsi allarmi, da non riaprire: Controllare Venti non chiede il TS a chi cammina, perché tocca solo chi vola (`requireMovementModes`): con
Camminare nel vento Mira lo ha ricevuto. Gabbia di forza ha la scatola da 3 m tra le scelte, e la pill di Globo dice il livello in più per slot.
Resurrezione rifiuta un PG a 0 PF: è morente, non morto.

Il banco è cresciuto: `context` in `castFromPanel`, per i campi di ogni bersaglio come il d8 di Spruzzo prismatico.

Provato al banco, con il servizio di sfondo vero: Cerchio di Potere con Mira che esce e Termina; Suggestione di massa ai quattro slot; le difese
con `damageDefensesForItem`; Alba, Maelstrom, Muro di Luce, Collera della Natura, Controllare Venti, Trasmutare Roccia, Proibizione, Gabbia di
forza, Globo di invulnerabilità, le Investiture di Ghiaccio e Fiamma turno per turno; Palla di fuoco ritardata fino alla detonazione; Spruzzo
prismatico con quattro raggi; Parola divina alle tre soglie; Sguardo penetrante col danno e con Termina; Carne in pietra fino a Pietrificato;
Danza irresistibile e Immolazione con TS fallito e superato; Debilitazione; Prigione Mentale; Scossa Sinaptica; Disintegrazione; Flusso di Energia
Negativa su un non morto; Punizione Esiliante dal popup vero, sopra e sotto i 50 PF. **Non provate:** le azioni del ⚡ (Arma Sacra, Cubo di vento,
Scossa tellurica, Rocce e Liane, le Immunità di Interdizione Primordiale), in P4; Resurrezione su una creatura davvero morta, coperta dai test.
Test in `test/spellPolishLot6.test.js`.

Provato al banco dopo le decisioni: Trasformazione di Tenser con Termina, che toglie i PF temporanei e lascia il TS CD 15; con Annulla, che li
riporta; con 60 danni, che li consumano e lasciano la pill.

#### Lotto 7 (fatto il 4/11): i 40 successivi

Gli ultimi 23 automatizzati, dal 7° al 9° livello, e i primi 17 che aspettano una capacità. Di questi si controlla che il lancio di oggi non
contraddica il testo e non blocchi il tavolo: la capacità resta da costruire.

| Difetto | Incantesimi | Correzione |
|---|---|---|
| Colpivano anche sopra la soglia di PF | Parola del potere stordire (150), Parola del Potere Dolore (100) | Sopra la soglia nessun effetto: lo slot è speso, il lancio va nel registro e il pannello lo dice (`spellHpCeilingRefuses`). Contano i PF attuali |
| Mancava il TS a fine turno di chi è lontano o non vede il bersaglio | Antipatia/simpatia | Promemoria sui due effetti, da fare solo se vale la condizione; se supera, l'effetto finisce |
| Non dava Affascinato, e la durata non seguiva lo slot | Costrizione | Affascinato, un anno dal 7°, fino a dissoluzione dal 9° (`manualFromSlot`). I 5d10 al giorno restano al tavolo |
| Non si lanciavano senza un bersaglio | Muro di pietra, Segugio fedele | Il lancio non chiede bersagli, la pill sta sul caster |
| Chiedeva un cono e il TS al lancio, e non scriveva nulla | Soffio del Drago | Tocca una creatura e la pill va a lei. Il soffio resta al tavolo (CAP-ORIGIN) |
| Chiedeva il TS senza scrivere danni | Passo del Tuono, Minuscole Meteore | Danno al lancio con i dadi dello slot: 3d10 e 1 per slot, senza il caster; 2d6 per la meteora del lancio. Teletrasporto e altre meteore restano al tavolo (CAP-TELEPORT, CAP-MULTIAREA) |
| Non diceva cosa succede a chi colpisce in mischia | Aura sacra | L'accecamento è nel dettaglio della pill |

Scelta da confermare: Soffio del Drago, Passo del Tuono e Minuscole Meteore sono passi intermedi, che anticipano una parte delle loro capacità.

Falsi allarmi, da non riaprire: Antipatia/simpatia toglie la condizione alla sola creatura. Il caster non è Spaventato dalla propria
Antipatia. Corona di Stelle e Drago Illusorio aprono il popup al turno del caster, anche se Drago Illusorio non ha una pill sul caster.

Il banco non ha potuto provare Muro prismatico, perché il finto strumento non dà la geometria che il muro chiede, né l'ultimo passo di Turbine, dove
il TS Forza sta nella riga: coperti dai test. **Non provate** nemmeno le azioni del ⚡ di Lama del Disastro, in P4.

Provato al banco: le due Parole del potere sopra e sotto soglia; Antipatia con il TS superato; Costrizione a tre slot; Muro di pietra e Segugio
fedele senza bersagli; Soffio del Drago su un goblin; Passo del Tuono allo slot 4; Minuscole Meteore allo slot 5; Aura sacra e Calmare emozioni;
Nube incendiaria e Oscurità della Follia turno per turno; Corona di Stelle allo slot 8; Drago Illusorio; Fatale; Urlo Psichico; Regressione
mentale; Esplosione solare; Sfera congelante allo slot 7; i lanci solo registrati. Test in `test/spellPolishLot7.test.js`.

#### Lotto 8 (fatto il 4/11): i 40 successivi

Gli ultimi 8 che aspettano una capacità, 11 su misura, i 2 da verificare e i primi 19 tracciati. Anche qui la capacità resta da costruire: si
guarda che il lancio di oggi non contraddica il testo e non blocchi il tavolo.

| Difetto | Incantesimi | Correzione |
|---|---|---|
| Non si lanciavano senza spuntare una creatura, che il testo non ha | Luce, Luci danzanti, Mano magica, Illusione minore, Prestidigitazione, Taumaturgia, Randello incantato, Pietra Magica, Disco fluttuante, Scritto illusorio, Immagine silenziosa | Il lancio non chiede bersagli, la pill sta sul caster. Il rilancio sostituisce la pill, come dice il testo di Luce e Randello |
| Non si lanciava, e non prendeva il caster | Campo anti-magia | Aura che si lancia da sola; il caster è nella sfera |
| Con il TS superato dimezzava i danni | Tempesta di vendetta | Superato: nulla. Fallito: 2d6 e Assordato per 5 minuti |
| Una modalità che riparte da capo | Tempesta di vendetta | «Round successivo» chiedeva di sostituire la concentrazione: zona nuova, durata di nuovo a 10 round e, per chi tiene il conto, un altro slot. Tolta: i round successivi restano al tavolo (CAP-SEQUENCE) |
| Dura finché non viene dissolto, e la pill spariva dopo un round | Giara magica, e fuori dal lotto Serratura arcana, Fiamma perenne, Evocazione istantanea, Bocca magica, Illusione programmata, Celare, Simulacro, Proiezione astrale, Creazione | Scadenza manuale. Senza round da contare il lancio ricadeva su un round. Corretti tutti insieme: stesso dato, stesso difetto, nessuna lettura da aspettare |
| «Durata: 1 round» per una pill con scadenza manuale | Tutte le pill manuali, nell'elenco degli incantesimi attivi | «Durata: rimozione manuale» (`spellTurnsLabel`) |
| Il limite era un bersaglio | Guarigione di massa, Ossa della Terra | Qualunque numero; sei colonne e due per slot |
| **Le note della sagoma non arrivavano mai al pannello** | 20 incantesimi che le avevano, fra cui Muro di ghiaccio, Sonno, Simbolo, Muro di forza | Una riga sotto il pulsante dell'area (`placementDescriptor`, `renderPlacementStage`). Le note scritte per sviluppatori («RAW», «runtime») ora parlano al GM; Sonno e Spruzzo colorato dicono **Modifica bersagli**, il pulsante che c'è davvero |
| La sagoma non diceva che cosa rappresenta | Tempesta di fuoco, Sciame di meteore, Tsunami, Tempesta di vendetta, Glifo di interdizione, Boschetto Druidico | Una nota per ciascuno: il riquadro dei dieci cubi, una sola delle quattro esplosioni, l'esplosione delle rune, il cubo minimo, ciò che resta al tavolo |

Scelte da confermare: togliere «Round successivo» a Tempesta di vendetta, e la riga di nota nel pannello, che compare su 26 incantesimi.

Deciso dal proprietario il 4/11: **Allarme** resta senza avviso quando una creatura entra. Disegna la zona e dura le sue 8 ore; in combattimento si usa
poco, e da riaprire c'è poco.

Non controllati: il Manto del Crociato non ha testo, resta pill e concentrazione. I tracciati dei prossimi lotti possono avere lo stesso difetto del
bersaglio: 76 dei 91 che restano chiedono una creatura, e per alcuni il testo non sembra nominarla (Occhio arcano, Trucco della corda, Destriero
fantomatico, le evocazioni). Si legge uno per uno, perché per altri la creatura c'è. Forme animali, Metamorfosi, Imprigionare, Messaggio e Caduta
morbida la chiedono a ragione.

Falsi allarmi, da non riaprire: Simbolo mostra la nota quando si attiva, perché la sagoma arriva lì e non al lancio. Il raggio di 6 m del Glifo è
l'esplosione delle rune, non un errore sui 3 m di diametro. Il Muro di ghiaccio chiede il TS a chi lo attraversa anche se la sezione è intatta: la riga
dice di farlo solo per una sezione distrutta, che resta a CAP-STRUCTURE.

Provato al banco: gli 11 senza bersaglio e il rilancio di tre; Campo anti-magia con ingresso, uscita, caster che si sposta e Termina; Tempesta di
vendetta con i tre esiti, e il secondo lancio confermato, che ridisegna la zona e riporta la durata a 10 (lo slot in più viene dal codice: i PG del banco
non tengono il conto); Giara magica e Fiamma perenne dopo due round; Tsunami con Termina dal pannello; Muro di ghiaccio allo slot 7; Glifo, Boschetto e
Allarme; Modifica bersagli su Sciame di meteore e Tempesta di fuoco; i limiti di bersagli; Imprigionare con i due esiti; i tracciati del lotto. Le pill
in vista espansa e compatta. Test in `test/spellPolishLot8.test.js`.

#### Lotto 9 (fatto il 4/11): i 40 successivi

I tracciati dal 1° al 4° livello, in ordine: 35 fino al 3° e i primi 5 del 4°.

| Difetto | Incantesimi | Correzione |
|---|---|---|
| Non si lanciavano senza spuntare una creatura, che il testo non ha | Occhio arcano, Chiaroveggenza, Serratura arcana, Fiamma perenne, Bocca magica, Immagine maggiore, Trucco della corda, Scritta Celeste, Servitore inosservato, Servitore Minuscolo, Destriero fantomatico, Animale messaggero, Insetto gigante, Fondersi nella pietra | Il lancio non chiede bersagli, la pill sta sul caster |
| Lo stesso, per chi evoca: ciò che evoca non è sulla mappa al lancio | Evoca animali, Evoca elementali minori, Evoca creature boschive, Evoca Demoni Minori, Evocare Bestia, Evoca Bestia d'Ombra, Evoca Folletto, Evoca Non Morto | Pill e concentrazione sul caster |
| Non si lanciava proprio: chiedeva una creatura e non offriva righe | Parlare con i vegetali | Aura che si lancia da sola, come Campo anti-magia |
| **La durata di una scelta non arrivava alla pill** | Sortilegio (restava 1 ora: 8 ore dal 3° slot, 24 dal 5°), Cerimonia (il matrimonio e il rito funebre segnavano 24 ore invece di 7 giorni) | La durata della scelta viene prima di quella dell'incantesimo (`buildSpellUnifiedLifecycleRequest`). `getSpellChoiceTiming` la calcolava già, e un test la controllava, ma nel lancio dal pannello non la leggeva nessuno |
| La durata non seguiva lo slot | Animale messaggero, e fuori dal lotto Legame planare | 48 ore in più per slot; 10, 30, 180 giorni, un anno e un giorno |
| Dal 6° slot dura fino a dissoluzione, senza concentrazione | Immagine maggiore | Come Scagliare maledizione (`concentrationBelowSlot`, `manualFromSlot`) |
| La sagoma non diceva come finisce | Capanna | Nota: la cupola resta ferma e finisce quando il caster ne esce, con Termina |

Errore mio da ricordare: nel lotto 4 ho scritto che le durate di Cerimonia seguivano la variante, e nel lotto 3 ho dato Sortilegio per letto, guardando i dati e
senza lanciarli con la scelta o lo slot giusti. Anche in questo lotto ho prima chiamato Sortilegio falso allarme, per poi trovarlo sbagliato al banco. **Una durata
che dipende da slot o scelta si controlla sulla pill, non sulla regola.** Per trovarne altre ho cercato nel testo «ai livelli superiori» di tutto il catalogo: dei
tredici incantesimi che ne parlano, dodici ora allungano davvero la pill; il tredicesimo è Modificare memoria, dove il numero è l'età del ricordo.

Chiedono ancora una creatura, a ragione: Aura magica dell'arcanista e Anti-individuazione (una creatura o un oggetto: per l'oggetto si spunta il caster), Scurovisione,
Linguaggi, Inviare, Respirare sott'acqua, Camminare sull'acqua, Riposo inviolato e Parlare con i morti (il cadavere, anche a 0 PF).

Falsi allarmi, da non riaprire: Lama infuocata e Lama d'Ombra hanno i dadi per slot. Inviare non ha limite di gittata. Terreno illusorio resta una zona senza effetti.
Capanna si lancia già con «Usa senza placement», anche se il contratto segna i bersagli come richiesti: per una zona facoltativa quel dato non blocca.

Per i prossimi lotti: 42 dei 51 tracciati rimasti chiedono ancora una creatura, tra cui le altre evocazioni (Evoca elementale, Evoca folletto, Evoca celestiale e quelle di
Tasha) e Portale, Semipiano, Reggia meravigliosa.

Provato al banco: i 22 senza bersaglio; Immagine maggiore agli slot 3 e 6; Animale messaggero allo slot 3; Parlare con i vegetali con Termina; Capanna con il caster che
esce; Terreno illusorio; Sortilegio allo slot 3 con un round che passa; Cerimonia con matrimonio e dedizione; Legame planare allo slot 7; gli incantesimi con bersaglio,
compreso il cadavere a 0 PF e un Inviare lontano. Le pill in vista espansa e compatta. Test in `test/spellPolishLot9.test.js`.

#### Lotto 10 (fatto il 4/11): i 40 successivi

I tracciati dal 4° al 7° livello, in ordine.

| Difetto | Incantesimi | Correzione |
|---|---|---|
| Non si lanciavano senza spuntare una creatura, che il testo non ha | Creazione, Vigilanza e interdizione, Evocazione istantanea, Reggia meravigliosa, Passapareti, Illusione programmata, Immagine proiettata, Trasporto vegetale | Il lancio non chiede bersagli, la pill sta sul caster |
| Lo stesso per chi evoca: ciò che evoca non è sulla mappa al lancio | Evoca elementale, Evoca folletto, Evoca celestiale, Evoca Demone Maggiore, Richiamo Infernale, Evoca Aberrazione, Evoca Celestiale, Evoca Costrutto, Evoca Elementale, Evoca Immondo | Pill e concentrazione sul caster |
| Lo stesso, anche se il testo nomina qualcuno: non è lui a portare l'effetto | Danza Macabra (i cadaveri si alzano come creature nuove), Simulacro (il dato è una creatura nuova), Gabbia dell'Anima (l'anima sta nella gabbia del caster) | Pill sul caster |
| Con il TS fallito non dava nulla | Modificare memoria | Affascinato e Incapacitato finché dura, come Trama ipnotica; il danno lo termina. Il vantaggio di chi combatte e un altro incantesimo sul bersaglio stanno nel dettaglio. I ricordi restano al tavolo |
| Il limite era un bersaglio | Sembrare | Qualunque numero di creature |
| **Disegnava 1,1 milioni di caselle** | Miraggio arcano | L'area si ricostruisce dalle caselle a ogni cambiamento sulla scena, e il miraggio dura 10 giorni. Sagoma di 60 m che segna il punto, con la nota: il testo dice «massimo» 1,5 km. Un test tiene ogni area sotto le 20.000 caselle |
| La sagoma non diceva che cosa mostra | Santuario privato | Una nota: il cubo massimo del 4° slot |

Scelta da confermare: la sagoma di 60 m di Miraggio arcano. Decisa in P4: niente sagoma, solo tracking.

Strumento: `npm run polish:sheets` falliva su Miraggio arcano, per le troppe caselle passate a `Math.max`. Ora usa un ciclo.

Chiedono ancora una creatura, a ragione: Sogno (se non è sulla mappa si spunta il caster), Legame planare, Celare, Legame telepatico, Visione del vero. **Forma eterea** al 7° slot vale solo per il caster, ma la lista resta
perché dall'8° prende tre creature per slot: si spunta il caster. Un bersaglio che dipende dallo slot non c'è, e non conviene costruirlo per un incantesimo.

Restano al tavolo, senza contraddizioni: il TS Intelligenza e i 6d6 di Contattare altri piani, i modificatori del TS di Scrutare, l'incubo di Sogno.

Provato al banco: i 21 senza bersaglio; Modificare memoria con i due esiti e con il danno; Sembrare su quattro creature; Miraggio arcano con Termina; Forma eterea allo slot 7, Sogno, Celare, Legame telepatico, Visione del vero. Test in
`test/spellPolishLot10.test.js`.

#### Lotto 11 (fatto il 4/11): gli ultimi 45

Gli 11 tracciati dei livelli più alti e i 34 solo registrati. I registrati non si bloccano mai: il pulsante è **Registra lancio** e i bersagli servono solo al registro. Per
loro si guarda che il limite e il TS mostrati non contraddicano il testo.

| Difetto | Incantesimi | Correzione |
|---|---|---|
| Non si lanciavano senza spuntare una creatura, che il testo non ha | Portale, Semipiano, Fortezza Possente | Il lancio non chiede bersagli, la pill sta sul caster |
| Una difesa scritta nel testo, e nessun effetto | Vuoto mentale | Immunità vera ai danni psichici e ad Affascinato (`damageDefenses`, `conditionImmunities`), come le difese decise nel lotto 5. Il resto nel dettaglio |
| Il limite di bersagli non era quello del testo | Proiezione astrale, Teletrasporto (senza limite), Spostamento planare, Sogno del Velo Celeste, Parola del ritiro, Disperdere, Animare morti, Creare non morti (uno) | Nove con il caster; sei con il caster; cinque; uno e due per slot; tre e uno per slot |
| Il TS non si vedeva | Disperdere | TS Saggezza, se non è consenziente |
| La sagoma non diceva che cosa resta al tavolo | Tempio degli Dèi | Una nota: il TS di chi entra, il d4 da sottrarre, i PF in più alle cure |

Dubbio per il proprietario: **Rimuovi maledizione** è solo registrato, ma il testo termina tutte le maledizioni, e Scagliare maledizione e Sortilegio dicono di finire con
questo incantesimo. Il motore sa già terminarli (Resurrezione pura, `stabilizeSpellRules.js`). Sarebbe la stessa cosa sul bersaglio toccato: è una capacità nuova, non aggiunta.

Errore mio: la prima nota del Tempio degli Dèi non compariva. Nel catalogo c'era già la voce, e un oggetto con due chiavi uguali tiene l'ultima senza dire nulla. L'ha
trovato il banco; ora un test vieta le chiavi doppie.

Provato al banco: i blocchi di tutti i 45; Portale, Semipiano e Fortezza senza bersagli; Vuoto mentale con le difese di Sera e un Blocca persone che la paralizza comunque, e con Charme su
persone che non scrive Affascinato; i nuovi limiti ai loro slot; Disperdere registrato con il TS; Sogno del Velo Celeste su tre creature; Tempio degli Dèi con Termina. Test in
`test/spellPolishLot11.test.js`.

**Esito di P3.** I 477 incantesimi sono letti: 167 corretti, 310 senza difetti. Il difetto più diffuso erano i bersagli chiesti a incantesimi che non ne hanno (59 casi), poi le
scadenze sbagliate, le difese scritte solo come etichette, le note mai arrivate al pannello e le durate per slot. Le capacità ancora da costruire sono nel piano di automazione.

### P4, i workflow che la prova non copre ancora (B)

| Voce | Stato |
|---|---|
| Le azioni del ⚡ e gli spostamenti delle zone | Fatto il 4/11 |
| Il falso «ingresso nell'area» del caster già dentro | Fatto il 4/11 |
| Il Cono gelido di Investitura del Ghiaccio come azione con TS e danno | Fatto il 4/11 |
| I casi che la prova esclude (Animare oggetti, i teletrasporti, i ritorni in vita, Palla di fuoco ritardata) | Riletti il 4/11: le eccezioni sono giuste e restano |
| Un giro automatico al banco sui casi complessi | `actionRun` e `actionLine` di `polishBench.js` lo permettono. Le azioni si provano così; una lista fissa non serve finché non cambia il motore delle azioni |
| Le resistenze nei danni degli incantesimi | Fatto il 5/11: il pannello, le azioni del ⚡ e i promemoria |
| Santificare: un pulsante vero per il TS Carisma | Deciso il 5/11: resta solo tracking, non è un incantesimo da combattimento |
| La console attacchi e il lancio dalle schede dei mostri | Da provare quando è chiuso l'[audit del pannello attacchi](AUDIT_UX_PANNELLO_ATTACCHI.md), che lo sta rifacendo |

#### Primo lotto (fatto il 4/11): le azioni del ⚡ e i difetti certi

Gli incantesimi con azioni del ⚡ sono 42, di dieci tipi: attacco singolo, TS singolo, TS ad area, zona figlia, cura singola, direzione di una zona, Muro prismatico,
Telecinesi, ritorno di Intermittenza, azione diretta. Le ho provate dal pannello e dal popup veri, con il servizio di sfondo acceso, e le zone anche spostandole.

| Difetto | Incantesimi | Correzione |
|---|---|---|
| Le azioni bonus si accendevano solo dal turno dopo il lancio, e il testo non lo chiede | Mano arcana, Corona di Stelle, Drago illusorio, Folata di Vento | Via l'attesa. Mano arcana e Drago illusorio aprono anche il loro popup nel turno del lancio, come Corona di Stelle: la mano agisce quando l'incantesimo è lanciato, e il drago non ha una pill con il ⚡. Le azioni vere aspettano ancora: quella del turno è servita a lanciare |
| Un falso «ingresso nell'area» per il caster già dentro al lancio, con il danno o il TS da confermare. La sagoma lo esclude, la zona lo conta, e la base dei trigger non lo aveva | Provato su Nube di Pugnali e Crescita di spine; la correzione vale per ogni zona | Al primo controllo il caster che è già dentro entra nella base (`planStaticSpellZoneReminder`). Solo lui: chi arriva prima del primo controllo è un ingresso vero, e i test lo tengono fermo (SP-B04A) |
| Il Cono gelido applicava solo la velocità, sui falliti da selezionare a mano, con il danno a parte | Investitura del Ghiaccio | Un'azione con sagoma, TS Costituzione, 4d6 freddo, metà se superato, velocità dimezzata a chi fallisce e popup di turno, come la Linea di fuoco e il Cubo di vento |
| Un cono che parte dal caster era rifiutato quando si applicava: lo strumento lo fa partire dal lato della casella che guarda il caster, cioè sul bordo del token, e il controllo del popup voleva un'origine fuori dal token | Il Cono gelido, l'unica azione di questo tipo | Per i coni il bordo vale (`allowCasterEdge` in `spellAreaOriginAdjacentToCaster`); un cono lontano dal caster resta rifiutato. L'ha trovato il banco, ma il finto strumento sceglieva un altro lato: ora fa come quello vero |

Provato al banco nel turno del lancio: Pugno serrato dal popup della Mano arcana, Lancia una stella, il Soffio con la sagoma, Cambia direzione con la zona che si gira e i membri aggiornati. Provato
dal turno dopo: il Cono gelido con TS fallito (danno pieno, «Velocità dimezzata» che sparisce all'inizio del turno del caster) e superato (metà, nessuna condizione), con il pulsante spento e nessun popup
nel turno del lancio, in vista espansa e compatta. Nube di Pugnali e Crescita di spine con il caster dentro: nessun avviso al lancio, e l'avviso quando un goblin entra davvero.

Provato al banco, senza difetti: Invocare il fulmine, Arma spirituale, Spada arcana, Bacche benefiche, Riscaldare il metallo, Dardo stregato, Debilitazione, Prigione Mentale, Sguardo penetrante, il
raggio di Muro di Luce, la Linea di fuoco, il Cubo di vento, Scossa di Investitura della Pietra, le Immunità di Interdizione Primordiale, Sposta il marchio, Collera della Natura, Frecce Infuocate, Immagine
speculare, Alterare sé stesso, Controllare Venti, Aura di Vitalità, Arma Sacra, Telecinesi, Lama del Disastro, il vortice di Controllare acqua, la Nuova linea di Bagliore solare, Stretta della Terra di
Maximilian (la mano, la presa e il popup dal turno dopo), Turbine (i due TS al lancio e la Prova di fuga). Le zone che si spostano: Sfera infuocata chiede il TS a chi travolge, Bagliore lunare no, per scelta, e Nube mortale ricorda al turno del caster di
spostarsi.

Non sono difetti, da non riaprire:
- Scegliendo un'azione nel pannello la selezione sulla mappa si svuota apposta (`onActiveActionChange`): il bersaglio si seleziona dopo.
- Una creatura deselezionata al lancio non riceve avvisi d'ingresso: la zona tiene nella base tutta la sagoma.
- La Nuova linea di Bagliore solare non prende il caster, anche se la regola lo ammette, se la linea va dalla casella accanto verso l'esterno.
- Drago illusorio non ha una pill: il Soffio sta nel popup e nel registro degli incantesimi attivi del pannello.

Limiti rimasti:
- Arma Sacra: il congedo «creature a sua scelta» elenca tutti, caster compreso. Chi non è scelto si segna Immune.
- Le fessure di Terremoto non si provano al banco, perché il finto strumento le mette fuori dal cerchio: le coprono i test (`test/spellChildZoneCore.test.js`) e restano per P5.

Il banco è cresciuto: `actionRun`, `actionBrief` e `actionLine` per le azioni del ⚡; il finto strumento fa partire il cono accanto al caster dal lato giusto, dà a un cerchio il suo angolo e a un quadrato la sua posizione.

Test in `test/spellPolishP4.test.js`.

#### Secondo lotto (fatto il 5/11): le difese nei danni e le decisioni del proprietario

Decisioni del proprietario, il 5/11:
- **Le resistenze si automatizzano**, e deve essere chiaro nei tooltip che una difesa è in gioco: di solito scrive il danno già dimezzato.
- **Santificare resta solo tracking.** Non è un incantesimo da combattimento, e il pulsante avrebbe chiesto un'esenzione che finisce all'uscita, nel motore dei trigger e in Annulla.
- **Miraggio arcano resta solo tracking.** Niente sagoma: la pill sul caster, per i suoi 10 giorni.
- **Rimuovi maledizione termina le maledizioni.**

| Prima | Incantesimi | Ora |
|---|---|---|
| Il danno scritto arrivava pieno anche a chi resiste: Cono di freddo da 20 su Sera, 38 → 18 | I 71 incantesimi con un campo danno nel pannello e le azioni del ⚡ con un tipo noto | Il conto per bersaglio: 38 → 28. Prima il TS, poi la difesa, con l'arrotondamento delle console. Vale per resistenze, immunità e vulnerabilità |
| Era solo registrato | Rimuovi maledizione | Termina Scagliare maledizione, Sortilegio e Costrizione sulla creatura che tocca, con la concentrazione di chi li ha lanciati: ognuno dei tre lo dice nel suo testo. Modificare memoria lo nomina per i ricordi, che il plugin non traccia |
| Una sagoma da 60 m, da confermare | Miraggio arcano | Solo la pill |

Come funziona. `src/spellDamageDefenseCore.js` tiene il tipo di danno di ogni incantesimo, ricontrollato sui testi, perché il `damageType` del catalogo ha solo il primo tipo di un incantesimo e manca a 37 di loro; un test obbliga ogni
incantesimo con un campo danno a dichiararlo. L'anteprima (`hpPreviewFor`), il lancio (`hpEntries`) e le azioni (`resolveSpellActiveResolutionDamage`) leggono le stesse righe, quindi non possono dare numeri diversi. Il chip sta accanto al nome
nel pannello (`renderDefenseChips`): sulla stessa riga quando ci stanno entrambi, così la riga non cresce, sotto il nome quando non ci stanno, perché il nome non va mai tagliato. Nel popup sta sopra il pulsante (`renderDamageDefenseChips`). Compare
già prima che il danno sia scritto, perché chi scrive il danno dimezzato deve vederlo prima di scriverlo. Il suo suggerimento dice di chi è la difesa e
che cosa fa al numero. Un clic la ignora per quel lancio, e passa da `session.ignoredDefenses` a `hp.ignoredDefenses`. Il registro di combattimento dice quale difesa ha contato (`targets[].defenses`).

Restano al GM, e la guida lo dice:
- **Due tipi in un solo numero:** Colpo infuocato, Tempesta di ghiaccio, Sciame di meteore. Il chip dice `Res. fuoco: al GM` e non tocca il numero: il pannello non sa quanta parte è di fuoco.
- **Un tipo non fisso:** Onda distruttiva, Guardiani spirituali, Evoca raffica, Evoca pioggia di armi, il Soffio di Drago illusorio.
- **Le punizioni:** il loro danno si somma a quello dell'attacco.

I promemoria fanno lo stesso conto: quelli di zona, quelli degli effetti (Immolazione, Assassino fantasma, Colpo intrappolante) e le aure personalizzate con un tipo noto. Il tipo sta sul danno del promemoria, quindi non serve una tabella
(`reminderDamageDefenseRows`, `reminderResolutionDamage`). Il chip sta in linea accanto al campo Danni (`buildResolutionControls`). Premere l'esito applica subito, quindi il chip non può seguirlo: il suo conto è quello del danno pieno, e il suggerimento
ricorda che con il TS superato conta prima la metà. La CD di concentrazione, i TS contro la morte e il contatore del Guardiano della Fede leggono il danno ridotto, come dice il testo. Anche un trigger di zona risolto dal pannello legge il tipo dal trigger
(`spellPanelDamageTypes`, `hp.damageTypes`), altrimenti pannello e promemoria darebbero numeri diversi.

Non contano le difese dei mostri limitate alle armi non magiche, perché il danno di un incantesimo è magico (`magicalDamageDefensesForItem`).

Spruzzo prismatico e Muro prismatico scrivono il danno a pezzi, ognuno col suo tipo e il suo TS: la difesa conta raggio per raggio e strato per strato (`spellDamagePartAfterDefense`), con il chip accanto al nome appena il raggio è scelto, e nella riga
di ogni strato. Il piano del Muro è congelato e la validazione lo legge com'è: l'esecutore ne fa una copia. Il clic che ignora sta accanto a `hp` nel comando, perché lo Spruzzo non ha un campo danno unico.

Errori miei:
- Il chip si spegneva con la riga, che dopo la sagoma è bloccata, quindi era sbiadito e non si poteva cliccare. L'ha trovato il banco: i test leggevano il testo del chip, non `disabled`.
- Dopo il push ho trovato quattro incantesimi a cui le difese non arrivavano, e che la guida non diceva: Simbolo (Morte) e Trasmutare Roccia (fango che cade), perché il test guardava solo la variante predefinita, e Spruzzo e Muro prismatici, che hanno un conto
  tutto loro. Il test ora prova ogni variante di ogni fase.

Provato al banco: Cono di freddo su Sera con TS fallito e superato, il clic che ignora e che riapplica, il lancio e Annulla; il Cono gelido, Stritola e Lancia una stella nel popup, con il chip che segue il numero scritto; Colpo infuocato con il chip «al GM»;
Rimuovi maledizione su Sortilegio e Scagliare maledizione insieme, con le due concentrazioni che cadono, su Costrizione e su una creatura pulita; Miraggio arcano senza sagoma, in vista espansa e compatta. I promemoria: Nube di Pugnali su chi resiste ai
taglienti (9 → 4) e con la difesa ignorata, Bagliore lunare con TS superato (10, 5, 2), Guardiani spirituali senza chip. Spruzzo prismatico con il chip che segue raggio, danno e TS, e il lancio (30 → 15); Muro prismatico con tutti gli strati (resistenza, immunità e i tre
pieni: 38 → 17) e le due condizioni; Trasmutare Roccia. **Non provati:** gli attacchi multipli di Lama del Disastro, Simbolo (Morte), che chiede il glifo e poi l'attivazione, coperto dal test sulla vista, e il registro di combattimento a video, coperto dal test su `spellAreaCausality`. Test in `test/spellDamageDefense.test.js` e `test/cleanseSpells.test.js`.

### P5, la prova in stanza

Una lista breve e mirata, che raccoglie anche ciò che i lotti precedenti non hanno potuto provare al banco.

## Come si lavora

1. Prima di correggere, si riproduce il difetto con `test-support/spellSweepHarness.js` o al banco.
2. Si corregge il dato o la regola più piccola che lo risolve, e si toglie l'eccezione da `test/spellCatalogSweep.test.js`.
3. `npm run polish:register`, `npm test`, `npm run build`.
4. Ciò che tocca il pannello o la card si prova al banco dal pannello vero, in vista compatta ed espansa, e si annota in
   `bench` nel registro.
5. Mai testi dei manuali nel repository: né nel registro, né nei documenti, né nei test.
