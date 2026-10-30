# Bugfix e polishing — passaggio generale (piano)

Stato: **fase 1 (analisi) chiusa il 28/10/2026**. Il piano e le decisioni D1–D10 sono stati approvati dall'utente il 28/10, così come raccomandati. La fase 2 procede un lotto alla volta, nell'ordine della sezione 6.

Lotti fatti:
- **L1** (28/10): i mostri omonimi non condividono più i PF (HP-01).
  - Una scheda da mostro (statblock importato) su un token che non è un PG non eredita più l'`actorProfileId` dal registro delle schede, né al salvataggio (anche quello dello statblock condiviso) né all'apertura.
  - ActorVitals ignora quei token anche quando hanno già un ID condiviso.
  - Rispetto a D1 il filtro è più stretto: nemici e neutrali senza statblock restano attori. `test/sharedHpPersistenceIntegration.test.js` fissa infatti come voluti i PF del boss Auril e della sua Mano tra le scene (`fb4061b2`).
  - Lo fissano tre test nuovi in `test/actorVitalsStore.test.js` e `test/initiativeCardSaveTransportRegression.test.js`. Il test della scheda fallisce senza la patch.
- **L2** (28/10): le scadenze di turno e di round non si bloccano più dopo una riapertura del tracker (EF-01).
  - L'ID dei comandi temporali contiene un identificativo creato una volta per pagina (`__temporalRuntimeId`), quindi una pagina nuova non riusa gli ID che il background ricorda dalla precedente.
  - I ritentativi della stessa pagina tengono lo stesso ID.
  - Lo fissa `test/initiativeTemporalCommandId.test.js`, con broker e coda veri: due pagine sulla stessa scena, cinque passaggi applicati. Il test fallisce senza la patch.
- **L3** (28/10): i messaggi oltre i 16 kB viaggiano a frammenti anche dalle pagine verso il background (HI-01, HI-02).
  - Coordinatore degli effetti: un Annulla di più voci (o di una voce grande) da Cronologia, tracker o console; il background ricompone il comando prima del broker.
  - Gestore della Cronologia: la voce da registrare e la risposta che la riporta indietro, nei due sensi.
  - Stesso formato e stesso assemblatore delle risposte, resi generici in `effectsMutationTransportCore.js`. Un frammento respinto per «Too many requests» aspetta e riparte.
  - Sotto il limite i messaggi viaggiano come prima.
  - Lo fissano due test d'integrazione (background vero; owner e seconda pagina), entrambi falliscono senza la patch, e due test unitari. Verdi anche `npm run test:local-store`.
- **L4** (28/10): incantesimi su più bersagli e doppio clic (SP-5, SP-3).
  - Il × sulla pill di un bersaglio toglie l'incantesimo e i suoi effetti solo a quel bersaglio. Gli effetti sugli altri token finiscono solo quando l'incantesimo non è più su nessuno (`spellsNoLongerHeld` in `effectsMutationCore.js`, per `spell:remove-instance` e `spell:remove-name-source`).
  - Nel pannello Incantesimi un secondo clic, mentre il lancio legge scena, concentrazione e slot, non lancia più una seconda volta (`commitPreparing`, per `commit` e `commitArea`).
  - Lo fissano `test/spellRemoveOneTarget.test.js` (Suggestione di massa; l'ultimo bersaglio pulisce ancora ovunque) e un test del controller del pannello. Entrambi falliscono senza la patch. Il doppio clic dopo il piazzamento di un'area (Palla di fuoco) è verificato con la riproduzione dell'analisi.
- **L24** (28/10): console ad area, zone del caster e Mano arcana (MP-01, MP-05).
  - Un incantesimo a concentrazione toglie prima del commit solo le zone e le pedine dell'incantesimo su cui il caster si concentra (per `instanceId`), non quelle senza concentrazione: Guardiano della fede, Unto, un Glifo, Arma spirituale.
  - La Mano arcana portata a 0 PF da un'area chiude anche incantesimo e concentrazione, come già con una scrittura dei PF.
  - Lo fissa `test/spellAreaConcentrationZones.test.js`, con tre casi: Unto più Anatema; Ragnatela, la cui zona finisce ancora; la Mano. I due bug falliscono senza la patch.
- **L27** (28/10): card del tracker (RN-01, RN-04, RN-05, RN-06, RN-08).
  - Seconda card di un boss Paragon (`boss::p1`): PF inline, × di condizioni, incantesimi e capacità, pip leggendari e rinomina scrivono sul token (`__paragonBaseId`). `entry.id` resta l'identità dell'editor.
  - Per i giocatori, i PF di un'evocazione (pill e cassetto) solo dove la card mostra esatti quelli del caster.
  - Nella vista classica il badge dell'iniziativa si modifica solo dal GM; per i giocatori tooltip «Iniziativa» e cursore normale.
  - La sincronizzazione immediata dei PF salta la pill dell'evocazione e quella dei PF condivisi.
  - Un salvataggio dell'iniziativa rifiutato chiude l'editor e rimette il valore.
  - Test: editor reale con una card Paragon e con un salvataggio rifiutato (entrambi falliscono senza la patch), funzione vera del cassetto, contratti della card classica. Due contratti esistenti seguono i nuovi ID e il nuovo selettore.
- **L5** (28/10): condizioni (EF-02, EF-05, EF-07, EF-08).
  - Le condizioni personalizzate nascono con `type: "custom"`. Solo loro (e le legacy `legacy:custom:`) contano per il limite di tre: gli effetti di incantesimi e capacità e «Reazione usata» non vengono più sostituiti.
  - «Rimuovi condizioni» conserva l'Indebolimento della scheda (`type: "initiative-card"`).
  - Un «Afferrato» con fonte la creatura stessa non finisce quando questa è incapacitata.
  - L'Incapacitato derivato ha il proprio nome e tipo, e la sua pill non ha più una × che non toglieva nulla.
  - Test in `test/effectsMutationCore.test.js` e `test/conditionRulesCore.test.js`: quattro falliscono senza la patch, uno fissa la sostituzione oltre la terza personalizzata.
- **L6** (28/10): turno attivo e ordine (TR-01, TR-03, TR-04, TR-11, TR-07, TR-08).
  - Con la decisione D3: se la creatura di turno esce dall'ordine (tolta, token cancellato, Tana, Paragon o Epic spenti), il turno va alla successiva ancora presente; se era l'ultima, alla prima con il round dopo (`currentAfterOrderChange` in `initiativeOrderCore.js`, usata da `reconcileStateWithItems`).
  - ◀ al primo turno del round 1 non fa nulla.
  - La Tana entra nell'ordine solo accanto a creature: «Svuota» lascia l'ordine vuoto e il suo Annulla funziona.
  - A ordine vuoto si dimentica l'ultima creatura attiva, così il primo turno del combattimento dopo conta.
  - Il riordino a pari iniziativa conosce i turni Paragon aggiuntivi; la casella Tana segue la scena mostrata.
  - Test di core (turno dopo la rimozione, anche con ID virtuali; ◀ al round 1; riordino con un Paragon) e di contratto. La riproduzione dell'analisi sul sorgente vero ora dà E come nuovo attivo, come `sanitizeState`.
- **L7** (28/10): PF (HP-03, HP-04, HP-05, HP-07).
  - I PF temporanei dati a 0 PF non cambiano nulla (D6): niente PG risvegliato. La console PF lo scrive nell'anteprima.
  - Il ripristino dei PF da un'altra scena sopra 0 chiude il conteggio dei TS contro la morte. Dopo ogni ripristino si riallinea «Privo di sensi», come fa la memoria PF.
  - Un nuovo membro del gruppo senza PF entra con i PF massimi.
  - «Crit» della console PF si spegne dopo un'applicazione riuscita.
  - Quattro test nuovi, tutti falliscono senza la patch. Resta com'è la pill «Stabile» manuale dopo un ripristino sopra 0, rara.
- **L9** (28/10): schermo del tavolo (OP-01, EF-03, OP-06).
  - Dopo una ricarica (F5) della finestra dei giocatori il tracker si riapre: al primo avvio `sync-open` controlla con `popover.getHeight`, come l'icona, che il tracker segnato aperto ci sia davvero (`forgetStaleTrackerOpenFlag`). Se OBR non risponde entro 750 ms, vale lo stato salvato.
  - Lo schermo del tavolo segue di nuovo la selezione del GM dopo che il GM ricarica OBR: la revisione si azzera quando cambia la pagina del GM.
  - Le etichette della quota le scrive solo il GM; il GM toglie la seconda etichetta di uno stesso token.
  - Test: `syncOpenTableReload`, `effectsSelectionFollow` ed `elevationLabelRoles`, che falliscono senza la patch.
- **L8** (28/10): concentrazione e morte (AV-03, AV-06), con la decisione D4.
  - Una creatura portata a 0 PF perde la concentrazione: un PG (anche ucciso sul colpo, con «Morto») e un mostro. Vale per le scritture dei PF dal coordinatore (`planZeroHpConcentrationBreak` in `effectsMutations.js`) e per la console ad area, che scrive i PF da sé. Con la concentrazione finiscono zone e aure collegate.
  - A 0 PF non parte l'avviso del TS di concentrazione.
  - La console ad area rilegge i token dopo il commit per gli avvisi di concentrazione.
  - Test: mostro e PG concentrati portati a 0 PF dall'area, scrittura `hp:set` a 0 PF, nessun avviso a 0 PF. Tutti falliscono senza la patch.
  - Un test esistente (30 danni → CD 15) ora usa un bersaglio a 40 PF, perché a 0 PF l'avviso non c'è più per scelta.
- **L10** (28/10): etichetta «Turno di…» (TR-02, TR-10, rifinitura sulla rotazione).
  - Se il token a cui era agganciata viene cancellato, l'etichetta rinasce al turno dopo: l'aggiornamento di un'etichetta che non c'è più azzera la cache, e il nuovo tentativo del pump la ricrea.
  - L'etichetta segue la posizione del token e sparisce con lui, ma non ruota, non scala e non si copia con lui (`ROTATION`, `SCALE`, `COPY` disattivati, anche sulle etichette esistenti al primo aggiornamento).
  - Lo fissa `test/activeTurnLabelLifecycle.test.js` sulle funzioni vere dell'etichetta con una scena finta.
- **L28** (28/10): render completo del tracker (RN-02, RN-03, RN-07).
  - Una card con lo stesso HTML viene tenuta solo se anche i dati letti dai suoi listener sono uguali. Sono nome, iniziativa, PF, azioni rapide, menu degli incantesimi e capacità: la firma è `__trackerEntryListenerSignature`. Prima ⚡ e le azioni rapide restavano quelle vecchie.
  - Un render scartato perché il turno stava cambiando lascia il tracker da ridisegnare. Il render che conferma il turno ottimistico non salta più quella modifica.
  - L'editor dei PF confronta il token con i valori che mostra (`baseHP`/`baseHPMax`), non con la card da cui è nato.
  - Con una rinomina aperta il render completo aspetta e riparte quando la rinomina si chiude (evento `TRACKER_RENAME_FINISHED_EVENT`). Prima l'input veniva distrutto e il nome digitato andava perso.
  - Test: `trackerFullRenderReconcile.test.js` e due casi in `initiativeEditors.test.js`; falliscono senza la patch. Il contratto della guardia degli editor in `initiativeControllerContract.test.js` include la rinomina.
  - **Regressione corretta dopo L26**: il listener della rinomina era registrato in `mountInitiativeList` prima di `const track`. Il montaggio si fermava con «Cannot access 'track' before initialization» e il tracker non mostrava nessuna card. Ora è registrato dopo la creazione di `track`. Lo controlla `initiativeMountTemporalDeadZone.test.js`, che percorre il montaggio con il parser di Rollup e fallisce su qualunque const o let letta prima della sua riga.
- **L11** (28/10): console attacchi e Boss (AT-01, AT-02, AT-04, AT-05, AT-06, AT-07, AT-08).
  - Le creature di un attacco ad area e della Freccia esplosiva sono lette con le difese del Rimebound Link come il bersaglio singolo, e vanno in `bossLinkResisted`. Prima un'area con la Mano del Titano era sempre rifiutata.
  - Se il personaggio della console passa dal proprio turno a fuori turno con un attacco già scelto, la casella della reazione compare spenta.
  - Gli esiti dei TS di un'area contano come scelte: Esc, ⇄ e il cambio turno chiedono o aspettano.
  - Il TS «Al colpo» di un mostro (`hitEffect`) entra nella chiave delle decisioni.
  - Un cambio turno arrivato mentre la console carica viene seguito a fine caricamento, se la console non ha scelte in sospeso.
  - Svuota fissa le aree di Hand Slam allo stadio che hanno (`settled`): non tornano incrinate al round 1. Il ◀ in combattimento le riporta incrinate come prima (`docs/boss-hand-slam-collapse.md`).
  - Dopo un conflitto il Palmo tremante prende una nuova identità, come le manovre.
  - Test in `bossLinkResistancePcAttack`, `pcAttackPopover` (la fixture ora segue il turno dai metadata di scena), `pcAttackExecutionIntegration`, `bossCollapseCore` e `bossCollapseController`. Falliscono senza la patch.
- **L26** (28/10): movimento (MP-02, MP-08).
  - Un teletrasporto e il suo Annulla arrivano al controllo della velocità come «ricollocazione» (`relocation`), non come Annulla di un passo. Non consumano e non restituiscono movimento; il passo dopo si misura dalla casella d'arrivo.
  - Il segno parte da `suppressMovementHistory(..., { relocation: true })` per il teletrasporto e per l'Annulla del coordinatore. Nell'Annulla dalla Cronologia lo porta `change.relocation` del piano (`historyUndoCore`).
  - Prono e scalata si sommano al terreno difficile (+1,5 m per casella ciascuno), come dicono il PHB e `MOVEMENT_MECHANICS.md`: Prono nella Cucitura 12, scalata nella Ragnatela 12. Il terreno difficile continua a non sommarsi con se stesso (`extraCost` in `movementCostForSegment`).
  - Test in `speedCheck`, `speedCheckRuntime`, `historyMovementUndoIntegration` e `historyUndoCore`. Falliscono senza la patch.
- **L12** (28/10): scheda e import (EF-06, SC-02, SC-03, SC-05, SC-06, SC-07, SC-08).
  - «−» e «+» dell'Indebolimento spostano la base salvata di un livello (`initiativeCardBaseExhaustion`, opzione `baseExhaustion` di `saveInitiativeCard`). Prima, con i contributi oltre il tetto di 5, un clic toglieva due livelli.
  - Il TS fallito di Tenser parte dalla base senza i contributi e aggiorna anche la base nella scheda, con un `updatedAt` nuovo. All'apertura della scheda il livello resta.
  - Lo statblock condiviso con gli omonimi conserva la loro base (`preserveExhaustion`).
  - All'apertura della scheda decide la copia vincente delle azioni rapide, anche se è vuota: le azioni cancellate non tornano da un token vecchio di un'altra scena.
  - L'import legge «5°», «15 (cuoio)», «18 (+4)» e «30ft», e rifiuta ancora «1d8». Conserva i segni «Aggiunto manualmente» degli incantesimi rimasti.
  - D9: quando il budget della stanza scarta un profilo, il GM vede un avviso con i nomi, una volta per insieme.
  - Test in `initiativeCardSaveTransportRegression`, `deferredSpellWorkflow`, `characterSheetImport`, `initiativeCardRegistryCore` e `initiativeCardModalExhaustion`. Falliscono senza la patch.
- **L13** (28/10): quota e Opzioni (OP-03, OP-04, OP-05).
  - «Imposta quota…» su token con quote diverse: un campo lasciato vuoto tiene la quota di ciascuno, la casella «Sta scalando» indeterminata tiene la scalata di ciascuno. Con una quota sola il campo vuoto vale ancora 0.
  - Una bozza delle Opzioni presa in un'altra scena non si salva: «Scena cambiata: riapri il pannello Opzioni».
  - Salva scrive solo i campi cambiati nel pannello; per gli altri vale il valore attuale (`rebaseOptionsPanelDraft`). Layout, Segui, apertura automatica della console e tracker dei giocatori cambiati dal tracker a pannello aperto non vengono riscritti.
  - Test in `elevationWriteSelection` e `optionsPanel`. Falliscono senza la patch.
- **L14** (28/10): Registro e store locale (HI-03, HI-04, HI-05, HI-07, HI-08).
  - La nota in scrittura e il suo focus sopravvivono alla ricostruzione del Registro. Il focus non salta più sul Cerca se era altrove. I banner «Svuota» ed «Elimina registro» restano aperti sul loro registro.
  - Eliminare il registro attivo lascia la scena senza registro (il prossimo evento ne apre uno), invece di agganciarla a un archivio importato o al registro di un'altra scena.
  - I registri a cui una scena scrive sono segnati (`attached`) e «Conservazione…» non li tocca. Il segno si mette a ogni evento e quando una scena aggancia il registro, si toglie quando la scena passa a un altro; gli archivi importati non lo hanno.
  - Una connessione IndexedDB chiusa dal browser si riapre alla chiamata dopo (`onclose`, e un nuovo tentativo su `InvalidStateError`).
  - Il primo registro della scena è uno solo anche se tracker e background lo aprono insieme: prenotazione in `localStorage` per 5 s e scrittura «solo se assente» in un'unica transazione.
  - «Carica eventi precedenti» resta spento quando la lista è completa.
  - Test in `historyModalRebuildState`, `combatLogImplicitSessionRace`, `combatLogPaginationBehavior` e `historyLocalStore`. Falliscono senza la patch.
  - `teleportUndoIntegration` ora aspetta l'evento nel Registro: la Cronologia lo scrive dopo la risposta (`awaitWrite: false`), e il test passava solo per i tempi.
- **L25** (29/10): geometria delle aree (MP-03, MP-04, MP-07, MP-09, MP-10), dopo la ricerca sulle regole delle aree su griglia (`docs/AREE_SU_GRIGLIA.md`, decisioni D-A, D-B, D-C).
  - MP-06 è ritirato: l'origine dei coni dalla mediana del lato è voluta (commit `e47131c3`).
  - Linee: 20 caselle dalla prima accanto al caster, una sola fila da un vertice.
  - Onda tonante: cubo con una faccia sul caster.
  - Aree istantanee «entro N metri» ed emanazioni dei mostri: caselle contate dall'impronta del token, diagonali comprese.
  - Gittata in caselle, con i piedi a 1,5 m ogni 5.
  - «Aspetto area» non tocca le zone degli incantesimi.
  - La guida ora descrive la regola vera di cerchio e cono.
  - Test in `areaGeometryFixes`, `aoeGeometryCore` e `spellAreaPlacementCore`; quello della conversione in piedi è adeguato alla decisione D-C.
- **L15** (29/10): turni che slittano (AV-01, AV-02, AV-04, EF-04).
  - In `turnBoundaryCore.js` c'è ora un «segno» del turno più avanzato raggiunto (round + voce dell'ordine), riletto sull'ordine attuale. Un confine di turno conta solo oltre il segno. Il ◀ lo lascia dov'è; ogni altro salto indietro (Reset round, nuovo combattimento) lo fa ripartire.
  - Durate (EF-04): `__forwardConditionTurnBoundaries` parte dal segno, quindi ◀ seguito da ▶ non conta più due volte la stessa fine turno.
  - TS degli effetti (AV-02): i confini e l'inizio del turno corrente contano solo oltre il segno. Il recupero dell'inizio del turno corrente resta per il turno del segno sotto la sua chiave; lo stesso turno con la chiave spostata (una creatura tolta prima) non si richiede.
  - Trigger di zona (AV-01, AV-04): il segno sta nel runtime della zona. Il turno cambia solo oltre il segno; un salto di più turni fa partire inizio e fine turno di ciascuno.
  - Limiti accettati: il segno di durate e TS vive nella pagina del GM (dopo un ricaricamento un ◀▶ può contare come prima). Annullare dalla Cronologia una «Scadenza effetti di turno» e poi fare ◀▶ non la riconta.
  - Residuo: la quota della Turbine di Xanathar (`spellStaticZone.js`) usa ancora il vecchio confronto delle chiavi.
  - Test: `turnMarkBoundaries` (fallisce senza la patch). Adeguati due test che descrivevano un ◀ o un salto di turni come un ▶ semplice (`spellAuraReminderCore`, `spellStaticZoneReminderCore`), e la sandbox del baseline in `initiativeControllerContract`.
- **L16** (29/10): token nascosti e giocatori (HP-02, AV-07, OP-02), ripiego dell'attitudine (OP-08); decisioni D2 e D10. L'utente ha chiesto di distinguere le creature nascoste mai viste da quelle che hanno già agito: soluzione con un segno sul token.
  - Barre e numero dei PF di un token nascosto restano al solo GM. Le tre aure prendono la visibilità del token e la aggiornano senza ricrearsi (l'aura degli incantesimi conserva lo stato dei promemoria). Nascondere o mostrare un token ricalcola barre, aure e tracker.
  - Segno `revealedInCombat`: il GM lo scrive sul token nascosto quando inizia il suo turno; Svuota lo toglie.
  - Ai giocatori la card di una creatura nascosta compare dal suo turno in poi.
  - L'avviso di turno ai giocatori indica come «prossimo» la prossima creatura nota, mai una nascosta mai vista.
  - La vista dei giocatori non segue un token nascosto.
  - Un token senza attitudine si mostra «neutrale» (card e PF ai giocatori, come su mappa e proiezione). Le chiavi interne restano «alleato»: gruppi seminati e compressi nello stato (`groupAttitude`) e memoria PF.
  - Test: `hiddenTokensForPlayers` (fallisce senza la patch).
- **L16, rifatto** (29/10): l'utente ha ripensato la regola. Finché il GM tiene nascosto un token, ai giocatori non arriva nulla di quel token. Il segno `revealedInCombat` non si scrive più; Svuota toglie ancora quello delle versioni precedenti.
  - Tracker dei giocatori: nessuna card del token nascosto. Durante il suo turno resta accesa l'ultima card attiva visibile; cambia solo il disegno, non lo stato del turno. Mostrato di nuovo, il token torna da solo.
  - Avviso di turno: il turno di una creatura nascosta resta al GM (`LOCAL`). Come «prossimo» i giocatori leggono la prossima creatura visibile.
  - Promemoria proiettati ai giocatori: scartati quelli che partono da un token nascosto o lo colpiscono; dai bersagli multipli si toglie solo il token nascosto.
  - Avvisi di concentrazione di una creatura nascosta: solo al GM.
  - Selezione del GM inviata allo schermo del tavolo: senza i token nascosti. La revisione si prende prima della lettura degli item, così un invio lento non scavalca una selezione più nuova.
  - Animazioni (visuali matched e Palla di fuoco) con caster o bersaglio nascosto: solo sullo schermo del GM (`hiddenTokenBroadcast.js`). Il vecchio `emitFireballVisual` di `embersBridge.js` non ha chiamanti e resta com'è.
  - Test: `hiddenTokensForPlayers` riscritto ed `effectsSelectionFollow` esteso (falliscono senza la patch); adeguato il contratto di `concentrationSaveReminderRuntime`.
  - Seguito (`bfe63202`, `ab7af732`): sulle card del GM il ritratto di un token nascosto è oscurato, con l'occhio barrato al centro (metà del ritratto), nella vista classica e in quella compatta (`public/hidden-token.svg`, `markHiddenTokenPortrait`). L'overlay non intercetta i clic.
  - Seguito (`a8cdffaf`): mostrare o nascondere un token in iniziativa ridisegna subito il tracker. Prima la card aspettava il render successivo, di solito il cambio di turno. Un flag `visibility` dedicato raggiunge il listener del tracker; il planner fa il render completo solo quando un token in iniziativa cambia visibilità. Il flag `tracker` resta com'era: Cronologia e controllo velocità non lavorano in più. Test: `initiativeIncrementalRenderCore`, `hiddenTokensForPlayers`.
- **Regressione di L28** (`6d32f9e5`, segnalata dall'utente il 29/10): i primi PF di un token appena importato tornavano a 0/0 e la barra spariva. L'editor mandava lo 0 della card «0/0» come valore atteso; il token non ha ancora il campo e la mutazione veniva rifiutata come conflitto. Ora il valore di partenza è solo quello letto dal token. Test: `initiativeEditors` (fallisce senza la patch).
- **L17** (29/10, `6bcbec8c` e `416ad4bb`): codice della sessione incantesimi (D8); quei file non avevano modifiche in corso.
  - SP-1: «Duplicato colpito» di Immagine speculare conserva i round rimasti; la durata piena vale solo senza round registrati.
  - SP-2: una risorsa spesa dal pannello (Frecce infuocate su un'altra creatura) aggiorna i token che hanno l'istanza, letti dall'esecutore, ciascuno con i suoi round. Prima finiva in una copia nuova sul caster.
  - AT-03: Invio nel campo della ritorsione applica solo la ritorsione, senza il tasto Invio della console PG né l'invio del form della console Boss.
  - SP-4: nuovo segno opzionale `endsParentOnExpiry`: allo scadere dell'effetto finiscono l'incantesimo e la sua concentrazione. Lo portano solo le cinque immunità di Interdizione primordiale. Non si è esteso `endsParentOnRemoval` alla scadenza: lo portano gli effetti di turno di molti incantesimi a concentrazione (Anatema, Fuoco fatato…).
  - SP-4, durata: gli effetti creati da un'azione attiva prendono il turno in cui l'azione è usata, non quello del lancio (`spellUnifiedActiveAdapter.js`). Prima un effetto «fino alla fine del prossimo turno» creato nel turno di chi lo controlla finiva in quello stesso turno.
  - Test: `spellResources`, `flameArrowsWorkflow`, `attackReactionsViewEnter` (nuovo), `attackReactions` (falliscono senza la patch, tranne la protezione per Anatema).
  - Seguito (`d66a8a47`): anche il prompt di turno (`callLightningTurnPromptController.js`) passava all'esecutore il turno del lancio; ora gli effetti nuovi partono dal turno in cui l'azione è usata.
- **L18** (29/10, `292a2884` e `17319c78`): rifiniture R1, tutte le voci.
  - Parte 1: «Console Boss» ovunque la veda il GM (titolo, menu contestuale, azione rapida, errori; i profili non validi dicono «Profilo boss non valido:» seguito dal dettaglio tecnico del validatore). Codici del salvataggio delle opzioni in parole; «già»; tooltip del Round; «·» della scheda; formule delle risorse in parole (`resourceExpressionText.js`); ultima risorsa di una zona come contatore a zero; il prompt di turno nomina il proprio incantesimo; configuratore delle fazioni con «Neutrali», «Nemici» e «Azzera registro» (anche nella guida); cilindro nella console; metri nello strumento delle aree; carta del TS contro la morte senza «20 naturale» dopo una cura; tooltip dei PF e nome intero nella vista classica.
  - Parte 2: conteggi accordati nel Registro («1 evento», «1 turno»…); «PF» nel Combat Log; «voci», «registro», «archivio» nella Cronologia; motivo di un annullamento bloccato in parole, senza id né codici.
  - Fuori dal lotto: «HP» resta nelle etichette create altrove (menu «HP condivisi», «Modifica HP» nelle voci della Cronologia, «Aggiorna HP»): è il termine di tutto il plugin, da decidere a parte.
  - Test: `textPolishR1` (nuovo); adeguati i test che leggevano i vecchi testi.
- **L19** (29/10, `91a526ff`): rifiniture R2, tutte le voci.
  - Errori con messaggio: pannello Condizioni (Aggiungi e Rimuovi, il pulsante torna attivo), menu Condizioni, «Imposta quota…», proposta delle creature nella console attacchi, PF condivisi (motivo in parole), salvataggio inline dei PF rifiutato (`onSaveError` dell'editor).
  - «Rimuovi Tutto» vuole un secondo clic entro 4 secondi e dice quanti token raggiunge (tutti quelli della lista, non solo i bersagli).
  - Un indirizzo 5eTools non valido ferma il salvataggio delle opzioni e dice quale campo; le voci scartate dei pacchetti privati si contano nel pannello Pacchetti.
  - Scheda: Invio nella ricerca dei mostri porta alla lista invece di salvare; chiudere con modifiche non salvate chiede conferma.
  - Registro: «Annulla» sul nome del nuovo registro non crea nulla.
  - Console PF: il comando raggiunge solo i bersagli selezionati che il filtro mostra; quelli nascosti sono segnalati come esclusi.
  - Tracker: un'iniziativa lasciata com'era non viene riscritta né segnata come compilata a mano.
  - Test: `errorsAndConfirmationsR2` (nuovo), `initiativeEditors` (i due casi dell'editor falliscono senza la patch).
- **L20** (29/10, in corso, un blocco di R3 alla volta scelto con l'utente).
  - Avvisi e TS contro la morte (`1dcec3e9`): la × del GM chiude la stessa carta del TS sul tavolo (canale `death-save-notice-dismiss`); un promemoria non più corrente dice perché e si chiude da solo dopo 3,5 s (la × resta tolta), un errore di registrazione dice «riprova»; l'avviso di concentrazione del GM con Superato/Fallito ha la × (cliccabile da `74d0342d`); avviso di concentrazione rimasto in alto (in basso «cozza col resto del plugin», riportato su), anche il Legame del boss di nuovo in alto (`c429f0c7`), carta del TS contro la morte sotto l'avviso di turno. Posizioni da verificare in stanza, anche sullo schermo HDMI. Test: `noticesR3`.
  - Card del tracker (`c0f66169`): campi dei PF in linea che si allargano oltre i 22 px; il «…» delle condizioni aperto resta aperto quando la card si ricostruisce (memoria per card); nel compatto un gruppo collassato non mostra PF, come nella classica (scelta dell'utente); nome lungo di una condizione con i puntini, × e micropill sempre nella pill. Test: `trackerCardsR3`, `initiativeChipOverflow`.
  - Console Boss (`ed55a677`): con «Critico» le righe dei danni mostrano «2d8+4 · critico 4d8+4»; l'aggiornamento live della console attacchi (la voce era della console attacchi, non della Boss) ridisegna anche l'intestazione con ricarica e usi. Test: `bossActionsPopover`, `attackConsoleR3`.
  - Clock (`587444d5`): un clock nuovo nasce nascosto, con la casella «Visibile ai giocatori» spenta nel modulo (scelta dell'utente); il pannello si ridisegna solo quando cambiano i clock e conserva «Gestisci» aperti, modulo di creazione e cursore. Test: `clocksPanelR3`.
  - Menu ⚡ degli incantesimi (`aef37c71`): resta aperto mentre si seleziona sulla mappa (`disableClickAway`) e si chiude con la × o Esc; occupato prima di leggere la selezione, così un doppio clic non esegue due volte; «Apri nel pannello» torna dopo l'Annulla della fine dell'incantesimo. Test: `spellPillMenuR3`.
  - Registro (`ecf4db0f`): menu «Da esportare» nel menu Esporta/importa, che esporta un registro archiviato senza renderlo attivo (scelta dell'utente); «Statistiche archivio» chiude l'operazione prima di mostrare il risultato, così i pulsanti non restano disabilitati. Test: `registroR3`.
  - Console PF (`79da7db1`): «Applicato a N bersagli» conta solo i bersagli cambiati, al singolare quando serve, e dice a parte gli invariati. Test: `quickHpR3`.
  - Etichetta del turno e barra dei PF (`4ee4058f`): la barra segue subito la scala del token (flag `tokenScale`, ascoltato solo dalle barre) ma mai la rotazione (misura del token non ruotato, `tokenFootprintCore.js`); le pill degli effetti non ruotano col token, la loro misura resta costante (indicazioni dell'utente); durante un'Azione epica etichetta del turno, selezione e vista vanno sul boss (`bf16b07b`, richiesta dell'utente); le pill non seguono nemmeno la scala del token e si ridispongono sul nuovo bordo (dominio `token-scale`), il pallino della concentrazione si ricrea quando cambia il numero di caselle (`bf16b07b`). L'etichetta che ruotava e si scalava era già corretta in L10 (`37208e10`). Test: `tokenFootprintR3`.
  - Aree libere (`ca4c98ed`): un'area ruotata o scalata sulla mappa riseleziona i bersagli dove si trova davvero (posizione, rotazione e scala dell'oggetto, `transformedAreaPoint`); le caselle restano sulla griglia del mondo; uno spostamento semplice è calcolato come prima. Un quadrato ruotato fuori dagli angoli retti resta il quadrato di caselle allineato. Da verificare in stanza. Test: `freeAreasR3`.
  - R3 completato.
- **L21** (30/10, `9fb94263`): documentazione.
  - HP-06: budget di ActorVitals a 2.500 byte in `ACTOR-HP-PERSISTENCE.md`, come nel codice.
  - «Sposta zona» tolta da `INCANTESIMI_E_ZONE.md`: le zone mobili si trascinano sulla mappa.
  - Guida: console attacchi fuori turno, Reset round (come funziona oggi), riselezione delle aree spostate, ruotate o ridimensionate; e le funzioni cambiate in questo passaggio (token nascosti, carta del TS contro la morte, filtri e conteggio della Console effetti, Rimuovi Tutto, pill e barra sulla mappa, Azione Epica, conseguenze automatiche nella Cronologia e aure del Paladino, «Da esportare», clock nuovi nascosti).
  - OP-10 ritrovato nella trascrizione della fase 1 e corretto (`30433264`): quota e Distanza 3D per i giocatori (`RIFERIMENTO_FUNZIONI.md`, checklist di prova), Segui e famiglie del pannello Opzioni (`OPTIONS-ARCHITECTURE.md`), misura della casella nella guida.
  - Fuori lotto, segnalato dall'utente (mai risolto prima): i clic rapidi selezionavano tutto il tracker come testo. `7c3e2d59` e `cf1f6aee`: solo i campi di testo restano selezionabili (non caselle, menu e pulsanti), nessuna selezione parte altrove, il doppio/triplo clic fuori dai campi non seleziona, una selezione comparsa comunque viene tolta. Confermato in stanza. Test: `trackerSelectionGuard`.
  - D5 sostituita su richiesta dell'utente («durate coerenti con il reset e con l'andare indietro nei round»), `06dceab1`: ogni effetto a round conta dal round in cui è stato applicato (`roundAnchoredDelta` nel core delle mutazioni; il tracker passa `previousRound`/`nextRound` al tick del round). Indietro recupera solo i round consumati, avanti consuma solo quelli dopo il suo round; un passo avanti normale resta −1. Un effetto scaduto non ricompare. Test: `roundAnchoredDurations`.
- **Loop dell'Annulla con le aure** (29/10, segnalato dall'utente: Paladino a 0 PF, «Capacità terminata» ×2 a ogni Annulla).
  - Causa: il controller delle aure delle capacità di classe termina da solo una capacità quando la fonte riceve una condizione di fine (Privo di sensi) e scrive una voce sua nella Cronologia; annullata da sola, la capacità tornava mentre la fonte era ancora Privo di sensi e il controller la terminava di nuovo.
  - `2d8729d8`: le aure sempre attive (senza durata in round e senza azione per attivarle: le 5 del Paladino) sono sospese, non terminate: niente area né effetti mentre la fonte è Privo di sensi, tornano da sole quando si rialza, nessuna voce nella Cronologia.
  - `57a52fc6`, `e88d1353`: le voci scritte da sole in reazione a un'altra («Capacità terminata» del controller, «Aggiornata membership aura») hanno `payload.automaticConsequence`; un Annulla che si fermerebbe su di loro prosegue fino alla voce precedente (`history.js`), e nel pannello selezionarle seleziona la causa (`historyUndoDepthWithCauses`).
  - Test: `classFeatureAuraCore`, `automaticConsequenceUndoIntegration` (nuovo, con la Cronologia vera).

Richiesta dell'utente: un passaggio generale di bugfix su tutti i sistemi e sottosistemi del plugin, più il polishing. Prima il piano; poi un lotto alla volta, ciascuno con test, `npm test`, `npm run build` e `npm run perf:bundle` entro i tetti, e un commit per lotto. Bundle di produzione e push solo su richiesta.

## Metodo

- Base: `main` a `2379f967` (28/10, 12:20); `npm test` 4760/4760 verdi.
- Undici analisi in sola lettura, una per gruppo di sistemi:
  - tracker: turno e ordine;
  - render, Event Hub e card;
  - effetti e condizioni;
  - incantesimi;
  - Cronologia e Combat Log;
  - punti ferita;
  - console attacchi e Boss;
  - avvisi, aure e zone;
  - opzioni, proiezione e strumenti di contesto;
  - schede e compendio;
  - strumenti sulla mappa.
- Ogni bug di questo piano è verificato da me nel codice, leggendo la catena di chiamate. Quasi tutti hanno anche una riproduzione che conferma il comportamento sbagliato:
  - uno script che esegue le funzioni vere del repo con un SDK finto;
  - per le card del tracker, una prova nel banco del tracker vero (`test-support/tracker-polish-browser`).

  I pochi verificati solo leggendo il codice sono segnati «(logica)».
- Scartati i comportamenti fissati da un test o documentati come voluti (sezione 8).

Gravità:
- **P0** perdita o corruzione di dati al tavolo;
- **P1** flusso principale rotto;
- **P2** degrado reale in condizioni plausibili;
- **P3** incoerenza latente, testi, documentazione o manutenibilità.

⚠ indica un'area fragile di AGENTS.md (sincronizzazione dei PF, turno attivo, ordine, barre sulla mappa, loop dei metadata, `initiativeList.js`): prima del lotto scrivo il rischio e il percorso dei dati, poi aspetto il via.

## 1. In breve

| Gravità | Bug | I più importanti |
|---|---:|---|
| P0 | 1 | i mostri omonimi condividono i PF (HP-01) |
| P1 | 7 | durate che smettono di scadere dopo una riapertura del tracker; «Personalizzata…» che cancella un altro effetto; turno che torna alla prima creatura; × su un bersaglio che toglie gli effetti agli altri; Annulla che fallisce con voci grandi; zone del caster cancellate da un nuovo incantesimo a concentrazione; PF ignorati sulla seconda card di un boss Paragon |
| P2 | 33 | avvisi e TS rilanciati quando l'ordine slitta; schermo del tavolo che dopo F5 non riapre il tracker; PF temporanei che risvegliano un PG a 0 PF; doppio clic che lancia due volte; teletrasporti che restituiscono movimento… |
| P3 | 44 | — |

Le rifiniture sono nella sezione 3.

## 2. Bug

### 2.1 P0 e P1

**HP-01 (P0) ⚠ — I mostri omonimi condividono i PF**
- Dove:
  - `src/initiativeCards.js:787-797` (`saveInitiativeCard`), `:532-536` e `:634` (`loadInitiativeCard`);
  - `src/actorIdentityCore.js:58-70`;
  - `src/initiative-card-modal.js:3836-3850` (`shareMonsterStatblock`);
  - `src/actorVitalsStore.js:110-118` e `:594-614`.
- Scenario: in combattimento il Goblin (1) è a 7/7, il (2) a 3/7, il (3) a 0/7. Il GM importa lo statblock sul (1) e salva, e il (2) e il (3) tornano a 7/7. Da lì, a ogni cambio scena tutti i goblin prendono i PF del primo. Un goblin nuovo con lo stesso nome entra in iniziativa con i PF di quel goblin, anche 0.
- Perché:
  - la scheda di un mostro resta nel registro locale del GM;
  - la condivisione dello statblock sugli omonimi e l'idratazione della scheda trovano quella voce per nome o ritratto, e ne ereditano l'`actorProfileId`;
  - ActorVitals tratta i token con lo stesso ID come lo stesso attore, senza guardare fazione o tipo.

  Contraddice `docs/ACTOR-HP-PERSISTENCE.md` («Non collega automaticamente mostri con lo stesso asset») e `test/monsterStatblockShare.test.js`.
- Correzione:
  - (a) nessun `actorProfileId` preso dal registro per una scheda di mostro né per un token che non è PG o alleato;
  - (b) ActorVitals ignora i token con scheda di mostro o di fazione nemica o neutrale. Così si riparano anche le stanze già toccate.

  Vedi D1.
- Test: tre goblin con il registro locale. Dopo salvataggio, condivisione e idratazione non condividono l'ID, e ActorVitals non tocca i nemici.

**EF-01 (P1) ⚠ — Dopo una riapertura del tracker le durate smettono di scadere**
- Dove:
  - `src/initiativeList.js:625-630` (`__temporalCommandId`), `:405` e `:11413` (contatore dei passaggi);
  - `src/effectsMutationBroker.js:97-113`;
  - `src/initiativeTemporalLaneCore.js:49-55` e `:176`.
- Scenario: il GM gioca qualche turno, poi chiude e riapre il tracker dall'icona, oppure passa da estesa a compatta. Dal cambio turno successivo condizioni e incantesimi non scadono più, né a fine turno né a fine round, fino al cambio scena. Non compare nessun avviso.
- Perché:
  - l'id del comando è `initiative-temporal:<scena>:<n>:<tipo>`, e `n` riparte da 0 con la nuova pagina;
  - il background della stessa scena ricorda invece gli ultimi 256 comandi;
  - con lo stesso id e un contenuto diverso, il broker risponde `command-id-payload-conflict`;
  - la coda tratta il rifiuto come un errore definitivo e si blocca fino al cambio scena.
- Correzione: un id casuale per pagina dentro l'id del comando. I ritentativi dello stesso passaggio restano idempotenti.
- Test:
  - due «pagine» sulla stessa scena danno id diversi;
  - broker più coda: i passaggi della seconda pagina vengono applicati.

**EF-02 (P1) — «Personalizzata…» cancella un altro effetto**
- Dove: `src/effectsMutationCore.js:1835-1850`; `src/effectsMutations.js:1366-1373`; `src/conditions.js:34-51`.
- Scenario: un PG ha «Reazione usata», l'effetto di Benedizione e uno della Schivata. Il GM aggiunge una condizione personalizzata e la terza sparisce. Se era la condizione di una capacità di classe, si chiude anche la capacità.
- Perché: conta come personalizzata ogni istanza il cui nome non è tra le 14 condizioni, l'Indebolimento e l'Ira. Oltre la terza, toglie l'ultima.
- Correzione: le personalizzate nascono con `type: "custom"`; per il limite contano solo loro e le legacy `legacy:custom:`.

**TR-01 (P1) ⚠ — Togliere la creatura di turno riporta il turno alla prima del round**
- Dove: `src/initiativeList.js:10606-10611` (`reconcileStateWithItems`).
- Scenario: ordine A B C D E, turno di D. D muore e il GM lo toglie dall'iniziativa o ne cancella il token; lo stesso succede spegnendo la Tana durante il suo turno. Il turno passa ad A, nello stesso round:
  - parte il registro del turno;
  - le azioni leggendarie di A si ripristinano;
  - la vista si sposta su A e compare l'avviso al tavolo;
  - ripartono i trigger di zona di A.
- Perché: se l'attivo manca, l'indice diventa 0. `sanitizeState` (`src/initiativeOrderCore.js:179-186`) invece tiene la posizione.
- Correzione: un helper puro in `initiativeOrderCore.js` che dà la prima creatura dopo l'attivo ancora presente. Se l'attivo era l'ultimo, vedi D3.

**SP-5 (P1) — Il × su un bersaglio toglie gli effetti dell'incantesimo agli altri**
- Dove: `src/effectsMutationCore.js:1605-1619` (`spell:remove-instance`), `:596-606` e `:474-482`.
- Scenario: Suggestione di massa su A, B e C. Con il × sulla pill di A, B e C tengono l'incantesimo ma perdono «Segue la suggestione». Lo stesso vale per Estasiare, Camminare nel vento e Dissolvi magie su una sola creatura. Con la concentrazione (Benedizione) è corretto.
- Correzione: la pulizia sugli altri token solo per gli `instanceId` che non sono più su nessun token.

**HI-01 (P1) — Annulla fallisce dal pannello Cronologia, dal tracker e dalle console con voci grandi**
- Dove: `src/effectsMutations.js:4724-4748` (`undoEffectsMutation`, ramo client) e `:600-620` (un solo `sendMessage`).
- Scenario: nella Cronologia il GM spunta 2 o 3 righe (7–15 kB l'una, ARCH-009 §4.3) e preme «Annulla N azioni»: «Annullamento non applicato». Lo stesso succede con Ctrl+Z nel tracker, con la console PF e con le console su una voce grande. Alt+Z funziona, perché gira nel background.
- Perché: OBR rifiuta i messaggi oltre 16 kB (commit `a807db0b`). Le risposte dal background sono già spezzate, le richieste verso il background no.
- Correzione: spezzare anche le richieste oltre ~15 kB, con il formato e l'assembler delle risposte (`effectsMutationTransportCore.js`). Stessa cosa per gli append della Cronologia dal tracker (HI-02).

**MP-01 (P1) — Un incantesimo a concentrazione lanciato dalla console ad area cancella tutte le zone del caster**
- Dove: `src/spellLifecycleOperationsCore.js:45-52`; `src/spellAreaResolutionExecutor.js:1797-1800`, `:1854-1857` e `:2596-2597`.
- Scenario: un chierico ha attivo Guardiano della fede, oppure Unto, Cordone di frecce, il terreno di Tempesta di ghiaccio o un Glifo: zone senza concentrazione. Lancia un incantesimo a concentrazione con un'area (Ragnatela, Trama ipnotica, Raggio lunare) e la zona di prima sparisce. L'incantesimo resta sulla card, ma senza zona: niente terreno difficile, niente trigger. Si recupera solo annullando il nuovo lancio.
- Perché:
  - ogni lancio a concentrazione aggiunge `concentration:break`, anche quando il caster non si concentra su nulla;
  - l'esecutore lo legge come «rompe una concentrazione»;
  - prende allora tutte le zone del caster e le cancella prima del commit.

  La pulizia `static-zone:remove-ended` toglierebbe già solo le zone il cui incantesimo finisce davvero.
- Correzione: cancellare prima del commit solo le zone il cui `instanceId` è nella concentrazione del caster.
- Test:
  - con Unto attivo, Ragnatela lascia la zona di Unto;
  - con Ragnatela attiva, un nuovo incantesimo a concentrazione toglie la zona di Ragnatela;
  - l'Annulla ripristina tutto.

**RN-01 (P1) ⚠ — Sulle card Paragon aggiuntive la modifica dei PF e il × delle condizioni non fanno nulla**
- Dove:
  - `src/initiativeCardClassicBuilder.js:1201` (editor dei PF), `:757-758` (× delle condizioni), `:776` (× degli incantesimi);
  - `src/initiativeList.js:6787` e seguenti (`bindHPEditorForEntry`), `:10165` (editor compatto), `:8264-8287` (`__removeConditionOnTrackerCard`);
  - `src/initiativeOrderCore.js:26-34` (`expandParagonEntries`).
- Scenario: un boss Paragon con 2 azioni. Sulla sua seconda card il GM scrive «-10» nei PF: l'anteprima mostra 110, poi torna a 120, senza un messaggio. Sulla stessa card il × di «Accecato» non toglie nulla. Il GM crede di aver applicato il danno.
- Perché: la seconda card ha l'ID virtuale `boss::p1`. Editor e pulsanti lo usano così com'è, il coordinatore non trova il token (`invalid-hp-target`) e l'errore finisce solo nella console. Il pannello Paragon e l'editor dell'iniziativa invece usano già l'ID base (`__paragonBaseId`), come chiede AGENTS.md per gli ID virtuali.
- Correzione: leggere e scrivere sull'ID base (`entry.__paragonBaseId || entry.id`) per PF, condizioni, incantesimi, pip leggendari e rinomina. `entry.id` resta solo l'identità della card.
- Test: con un'entry `boss::p1`, la modifica dei PF arriva su `boss` e il × passa l'ID base.

### 2.2 P2

| ID | Problema | Dove | Correzione |
|---|---|---|---|
| HP-02 ⚠ | Barra e numero dei PF di un token nascosto sono visibili ai giocatori. Di default succede per alleati e PG; per i nemici, se la policy della mappa è «stato» o «esatti» | `hpbar-items.js:373, 389, 867` (VISIBLE disattivato), `:497-504`, `:559-579`; `sceneItemChangeDispatcherCore.js:300` | barra visibile solo se lo permettono la policy e la visibilità del token; ricalcolo quando cambia `visible` (D2) |
| HP-03 | I PF temporanei dati a un PG a 0 PF lo risvegliano: conteggio dei TS contro la morte azzerato, Privo di sensi tolto | `quickHpCore.js:54-57` | a 0 PF i temporanei non cambiano nulla, con il messaggio dei tratti di specie (`speciesHpTraitCore.js:168`) (D6) |
| HP-04 | Il ripristino dei PF tra scene lascia Privo di sensi e il conteggio dei TS contro la morte | `actorVitalsStore.js:120-133, 523-544` | riallineare le condizioni a 0 PF dopo il ripristino, come `hpMemory.js:585` |
| HP-05 ⚠ | Un nuovo membro del gruppo senza PF prende i PF correnti del token appena modificato (2/7, o 0) | `initiativeList.js:5511-5517` (`trySeedGroupHP`) | riempire con i PF massimi |
| AT-01 | Rimebound Link (Auril, fase 2): le aree e la Freccia esplosiva che comprendono la Mano del Titano vengono sempre rifiutate | `pcAttackExecution.js:218, 338-343` | difese del link anche per le creature dell'area e della Freccia, con `bossLinkResisted` |
| AT-02 | Un attacco scelto nel proprio turno e registrato dopo il cambio turno segna la reazione | `pc-attack.js:234, 1883-1886` | se la stessa creatura passa dal proprio turno a fuori turno, la casella si spegne |
| AT-03 | Invio nel campo della ritorsione (Scudo di fuoco) esegue l'azione principale; nella console Boss con i danni medi precompilati | `attackReactionsView.js:25-37`; `pc-attack.js:2459-2470`; `boss-actions.js:1124-1126` | Invio sull'input preme «Applica» della ritorsione (D8) |
| EF-03 | Lo schermo del tavolo non segue più la selezione del GM dopo che il GM ricarica OBR | `effectsReconciler.js:170` | revisione per istanza del GM (`sourceInstanceId`) |
| EF-04 ⚠ | ◀ seguito da ▶ conta due volte la stessa fine turno: una condizione «fino alla fine del 2º turno» sparisce un turno prima | `initiativeList.js:4835-4866, 11418-11425` | ricordare il confine più avanzato già contato |
| EF-05 | «Rimuovi condizioni» della card toglie anche l'Indebolimento gestito dalla scheda | `effectsMutationCore.js:1992-1996` | conservare le istanze `type: "initiative-card"` |
| EF-06 | «−» dell'Indebolimento con contributi attivi (Frenesia, Fulgore nauseante) toglie due livelli di base con un clic | `initiative-card-modal.js:4945-4960` | applicare il delta alla base salvata |
| TR-02 | L'etichetta «Turno di…» sparisce per il resto della sessione dopo la cancellazione del token a cui era agganciata | `initiativeList.js:4545, 4569-4594` | se l'item manca, lanciare l'errore: la cache si azzera e l'etichetta rinasce |
| TR-03 ⚠ | ◀ al primo turno del round 1 va all'ultima creatura; il ▶ successivo porta al round 2 e consuma un round di durate | `initiativeRenderCore.js:16-29`; `initiativeList.js:11823` | al primo turno del round 1, ◀ non fa nulla |
| TR-04 ⚠ | Con la Tana attiva, «Svuota iniziativa» lascia di turno la sola Tana e l'Annulla fallisce | `initiativeList.js:5095-5099` | la Tana entra nell'ordine solo se c'è almeno una creatura |
| AV-01 ⚠ | I trigger di zona di inizio e fine turno ripartono quando l'ordine slitta (si toglie un morto che precede l'attivo) e con ◀: lo stesso TS due volte, con i danni applicabili due volte | `spellZoneTriggerCore.js:290-295`; `turnBoundaryCore.js` | cambio turno solo se il turno è stato raggiunto avanzando |
| AV-02 ⚠ | Lo stesso per i TS di inizio turno degli effetti (Punizione incandescente) | `effectSaveReminderCore.js:315-327, 882-884`; `effectSaveReminderController.js:139` | come AV-01 |
| AV-03 | La morte non rompe la concentrazione: dopo la morte istantanea di un PG concentrato, l'incantesimo e l'avviso del TS restano. I mostri a 0 PF restano concentrati, con l'avviso del TS | `effectsMutations.js:1312-1321`; `conditionRulesCore.js:6-11`; `concentrationSaveReminderCore.js:118-145` | `concentration:break` alla morte istantanea; nessun avviso a 0 PF; i mostri a 0 PF: D4 |
| OP-01 | Dopo una ricarica (F5) della finestra del tavolo il tracker non si riapre più da solo | `sync-open.js:85-88, 132-133`; `trackerPopover.js:286-288` | al primo avvio del giocatore, una sonda `popover.getHeight` come fa l'icona |
| OP-03 | «Imposta quota…» su token con quote diverse: Applica li porta tutti a 0 e azzera «Sta scalando» | `ctx-elevation.js:22-30, 56-65`; `distance3d.js:48-67` | campo vuoto: quota invariata; casella indeterminata: invariata |
| SC-02 | L'Indebolimento dato da Trasformazione di Tenser sparisce quando si apre la scheda | `reminderResolutionCore.js:1360-1374`; `initiativeCards.js:221-233, 610-616` | la risoluzione aggiorna anche la base della scheda |
| SC-03 | Il registro delle schede nella stanza supera il budget (5 PG con libri: 7954 B su 4450) e i profili più vecchi spariscono senza avviso. Con un solo browser del GM l'impatto è basso, perché la copia locale resta | `roomMetadataBudget.js:16`; `initiativeCardRegistryCore.js:68-100` | avviso quando la compattazione scarta un profilo (D9) |
| SP-1 | «Duplicato colpito» (Immagine speculare) riporta la durata a 10 round | `spellActiveActionCore.js:437-443` | usare i round rimasti, non la durata predefinita (D8) |
| SP-2 | Frecce infuocate su un'altra creatura: la risorsa finisce sul caster e il contatore si blocca | `spellActiveResolutionCore.js:836-848` | aggiornare i token che hanno l'istanza (D8) |
| SP-3 | Un doppio clic su Applica, Applica effetti o Registra lancio lancia due volte: due slot e danni doppi | `spell-unified-panel.js:2767-2826, 1785-1811` | flag subito dopo la guardia |
| HI-02 | Una voce di Cronologia del tracker oltre 16 kB (token rimossi con scheda) non arriva mai; Ctrl+Z nel tracker resta su «history-pending» | `history.js:560-602`; `historyOwner.js:521-559` | spezzare anche i comandi verso l'owner |
| HI-03 | Registro: ogni cambio di item ricostruisce il pannello; la nota in scrittura si cancella, il focus salta sul Cerca, conferme e selezione si perdono | `history-modal.ts:2185, 208-246` | tenere nota, focus e banner nello stato del pannello |
| MP-02 | Un teletrasporto (Passo velato, Porta dimensionale, Passo del tuono, ritorno di Intermittenza) restituisce movimento al controllo della velocità, e il suo Annulla ne restituisce altro: 9 m camminati diventano 6, poi 3 | `history.js:1651-1665`; `speedCheck.js:1169-1182`; `speedCheckCore.js:477-479` | segnare lo spostamento soppresso; il controllo aggiorna solo l'ultima casella |
| MP-03 | Le linee e i muri larghi una casella ne coprono una in più in lunghezza (Fulmine 21×1 invece di 20×1) oppure, da un vertice, due righe (Muro di fuoco 12×2): bersagli e membri della zona raddoppiati | `aoeGeometryCore.js:444-446, 473, 587-590` | intervallo semiaperto in lunghezza e allineamento per larghezze dispari. Cambia la membership delle zone-muro già sulla mappa |
| MP-04 | Onda tonante: il cubo parte sempre dal vertice in basso a destra del caster; verso sinistra o verso l'alto comprende il caster stesso | `spellAreaCatalog.js:587-592`; `spellAreaPlacementCore.js:157-171` | origine adiacente al caster, come il cubo dei mostri (`spellAreaRules.js:3717`) |
| MP-05 | Mano arcana portata a 0 PF da un incantesimo ad area: la pedina sparisce, ma incantesimo e concentrazione restano | `spellAreaResolutionExecutor.js:1955-1960, 1985-1988` | le stesse operazioni della console PF (`effectsMutations.js:872-881`) |
| RN-02 ⚠ | Il render completo tiene una card con lo stesso HTML ma con i listener dell'entry vecchia: dopo aver cambiato un'azione rapida nella scheda, ⚡ mostra ed esegue la precedente | `initiativeList.js:9465-9494` (`__reconcileTrackCardsById`) | sostituire la card anche quando cambia una firma dei dati usati dai listener (azioni rapide, capacità, PF, iniziativa, nome) |
| RN-03 ⚠ | Le modifiche agli item che arrivano durante la navigazione del turno non vengono disegnate (una condizione manca dalla card), e la modifica inline dei PF successiva viene rifiutata in silenzio (banco) | `initiativeList.js:10820, 10899, 10972-10980, 11083-11093, 6928` | segnare il render da rifare quando il render viene scartato; valori attesi dell'editor = quelli mostrati |
| RN-04 | Vista dei giocatori: i PF esatti delle evocazioni di un nemico (Animare oggetti, Mano arcana) compaiono sulla sua card, contro la policy dei nemici | `initiativeCardClassicBuilder.js:783-789`; `initiativeList.js:10466-10485` | per i giocatori, PF delle pedine solo se la card mostra i PF esatti |

### 2.3 P3

| ID | Problema | Dove |
|---|---|---|
| HP-06 | La documentazione indica per ActorVitals un budget di 10 000 byte; il codice usa 2500 | `docs/ACTOR-HP-PERSISTENCE.md:82`; `roomMetadataBudget.js:14` |
| HP-07 | «Crit» della console PF resta acceso dopo Applica: il colpo successivo a 0 PF vale due fallimenti | `quick-hp-modal.js:75, 406-407, 819` |
| AT-04 | Gli esiti di un attacco ad area si perdono senza conferma (Esc, «Agisci con», cambio turno) | `pc-attack.js:86-87` |
| AT-05 | Il TS «Al colpo» di un mostro manca dalla chiave delle decisioni: un nuovo tentativo dopo un timeout esegue il piano vecchio | `pcAttackExecution.js:223-231` |
| AT-06 | Un cambio turno che arriva mentre la console carica la lascia sul personaggio vecchio | `pc-attack.js` (`followTurn`, `perform`) |
| AT-07 | Le aree crollate di Hand Slam tornano «incrinate» dopo Svuota | `bossCollapseCore.js` (`bossCollapseStage`); `bossCollapseController.js:138` |
| AT-08 | Palmo tremante: dopo un conflitto ogni clic ripete il piano vecchio (logica) | `pc-attack.js:2051, 2321-2326` |
| EF-07 | «Afferrato» con fonte la creatura stessa (fonte precompilata) sparisce quando questa va a 0 PF | `effectsMutationCore.js:1404-1425`; `effects-modal.ts:302` |
| EF-08 | L'Incapacitato derivato copia l'etichetta del genitore: pill doppia e × senza effetto | `conditionRulesCore.js:55-63` |
| TR-06 | Dopo un clic su ↺, ×, +, Tana o Segui, Spazio ripete quel comando invece di passare il turno (logica) | `initiativeList.js:1875-1876`; `turnShortcutCore.js:20` |
| TR-07 ⚠ | Il riordino a pari iniziativa con un turno Paragon non fa nulla | `initiativeList.js:10632` |
| TR-08 | La casella Tana resta quella della scena precedente | `initiativeList.js:2822-2827` |
| TR-10 | Copiando il token attivo si copia anche l'etichetta del turno (logica) | `initiativeList.js:4529-4559` |
| TR-11 ⚠ | Il primo turno di un nuovo combattimento viene ignorato se tocca alla creatura che era attiva allo Svuota (niente log, centratura, azioni leggendarie) | `initiativeList.js:11550-11552` |
| AV-04 ⚠ | Due ▶ rapidi, scritti in una volta, saltano i trigger di zona della creatura in mezzo | `spellZoneTriggerCore.js:186-219` |
| AV-06 | Console ad area: l'avviso di concentrazione parte anche quando il commit ha già rotto la concentrazione | `spellAreaResolutionExecutor.js:791, 805` |
| AV-07 | L'aura di un token nascosto è visibile ai giocatori (stessa causa di HP-02) | `spellAuraController.js:153`, `classFeatureAuraController.js:149`, `customAuraController.js:184` |
| AV-08 | L'avviso di concentrazione ignora «Risoluzione dei promemoria: Informativa» | `concentrationSaveReminder.js:66-74`; `concentration-warning.ts:134, 215` |
| OP-04 | Una bozza delle Opzioni aperta nella scena A e salvata dopo il cambio scena sovrascrive gli override della scena B | `options-modal.js:497-522`; `optionsPanelCore.js:212-221` |
| OP-05 | Salva riscrive layout, Segui e apertura automatica della console con i valori della bozza | `optionsPanelCore.js:135-155` |
| OP-06 | Il client del tavolo crea etichette della quota: doppioni con il testo vecchio | `elevationLabel.js:242-246` |
| OP-07 | Distanza 3D sbagliata sulle griglie esagonali e isometriche | `distance3dCore.js:153-166` (D10) |
| OP-08 ⚠ | Il ripiego dell'attitudine è diverso tra tracker (alleato), proiezione e mappa (neutrale): F-02 dell'audit di ottobre, ancora presente | `initiativeList.js:5002`; `optionsProjection.js:7-10` (D10) |
| OP-09 | Il «Reset registro» delle fazioni viene annullato da un altro browser del GM (logica) | `factionRegistry.js:37-103` |
| SC-04 | Dopo un aggiornamento che cambia i default, il registro della stanza viene decodificato con un catalogo diverso (latente) | `initiativeCardRegistryCore.js:115-169` |
| SC-05 | Le azioni rapide cancellate tornano da un token vecchio di un'altra scena | `initiativeCards.js:335-352, 585-606` |
| SC-06 | Import: «5°», «15 (cuoio)», «18 (+4)» e «30ft» vengono persi o letti male in silenzio («30ft» diventa 30 m) | `characterSheetImportCore.js:67-73, 105-139, 202` |
| SC-07 | L'import degli incantesimi perde i segni «Aggiunto manualmente» | `characterSheetImportCore.js:519-535` |
| SC-08 | La condivisione dello statblock abbassa l'Indebolimento di base dell'omonimo | `initiative-card-modal.js:3845` |
| SP-4 | Interdizione primordiale: finita l'immunità, incantesimo e concentrazione restano; nel turno del druido l'immunità dura un turno in meno | `supplementSpellRules.js:269-290` (D8) |
| HI-04 | «Elimina registro» aggancia la scena a un archivio importato; «Conservazione…» può cancellare il registro attivo di un'altra scena | `combatLog.js:1286-1304, 1625-1641` |
| HI-05 | Con la connessione IndexedDB chiusa a forza, Cronologia e comandi restano bloccati fino al reload | `historyLocalStore.js:68-72` |
| HI-06 | In una scena duplicata, Annulla e Azzera nella copia tolgono voci anche all'originale | `historyLocalStoreCore.js:62-82` |
| HI-07 | Al primo evento di una scena, tracker e background creano due registri | `combatLog.js:260-292` |
| HI-08 | «Carica eventi precedenti» ricompare quando la lista è già completa | `combatLogPaginationCore.js:40-49` |
| MP-06 | Un cono da una casella adiacente in diagonale ha il vertice a metà lato: celle asimmetriche | `aoeTargetTool.js:934-957` |
| MP-07 | Le emanazioni disegnate con «Disegna» non coincidono con quelle proposte dalla console attacchi (mostri grandi, creature in diagonale) | `aoeTargetTool.js:789-794`; `aoeGeometryCore.js:127-137` |
| MP-08 | Costi di movimento cumulati diversi dalle regole e da `MOVEMENT_MECHANICS.md`: scalata in Ragnatela 16 invece di 12, Prono nella Cucitura 8 invece di 12 | `speedCheck.js:1202-1205`; `movementProfileCore.js:515-516` |
| MP-09 | Sulle scene con scala «5 ft» la gittata massima viene rifiutata (Palla di fuoco a 30 caselle) | `spellAreaPlacementCore.js:35-44, 286-303` |
| MP-10 | «Aspetto area» ricolora anche le zone degli incantesimi già sulla mappa (Raggio lunare e Muro di fuoco perdono il loro tema), mentre la guida dice «per le nuove aree» | `aoeTargetTool.js:1516-1545` |
| RN-05 | Vista classica: un giocatore può aprire l'editor dell'iniziativa e scriverla su qualunque token. Al tavolo la finestra dei giocatori non riceve clic; online sì | `initiativeCardClassicBuilder.js:704, 833` (manca `IS_GM`) |
| RN-06 | Durante una modifica dei PF del caster, la pill della sua evocazione mostra per un attimo i PF del caster (vista classica) | `initiativeList.js:6566` (selettore della pill) |
| RN-07 ⚠ | Un render completo distrugge l'input di rinomina e il nome digitato va perso | `initiativeEditors.js:718-766`; `initiativeList.js:9418` |
| RN-08 ⚠ | Se il salvataggio dell'iniziativa viene rifiutato, l'editor resta appeso e i render completi si fermano fino al cambio scena | `initiativeEditors.js:141-153` |

## 3. Rifiniture

**R1 — Testi e italiano**
- «Boss Actions» e messaggi in inglese: `boss-actions.html:6, 144`, `boss-actions.js:148, 2032, 2039`, `bossActionProfileStore.js:16`, `bossActionProfileCore.js:117`. Proposta: «console Boss» e messaggi in italiano.
- Errori tecnici in inglese dopo un salvataggio parziale delle opzioni («scene-options-changed-during-write», `options-modal.js:370`).
- «Tutti i token sono gia nell'iniziativa» (`initiativeList.js:1682`); il tooltip della barra del round dice «Numero di turni…» (`:1251`).
- Plurali: «(+1 eventi)», «1 operazioni», «1 eventi · 1 turni», «1 registri» (`history.js:499`; `history-modal.ts:761, 1351, 1378, 1882-1958`).
- Glossario del Registro: «HP» al posto di «PF», «entry», «log», «storage», «Journal».
- Il carattere «Â·» al posto di «·» (`initiative-card-modal.js:961`).
- «ultima munizioni usata» (`zoneResourceCore.js:60`). L'errore del prompt di turno dice sempre «Controllare Venti» (`callLightningTurnPromptController.js:484`).
- Configuratore delle fazioni (`faction-configurator.html:44-66`):
  - manca la riga «Neutrali»;
  - «Mostri» va chiamato «Nemici»;
  - «restera» va corretto in «resterà»;
  - il pulsante «Reset registro» non corrisponde a «Azzera registry» della guida.
- Tooltip dei conflitti con UUID e codici («hp · current-value-mismatch», `history-modal.ts:704-714`).
- Formule grezze delle risorse nella scheda («max(1, modificatore_carisma)», `initiative-card-modal.js:1611-1615`).
- Un cilindro chiamato «sfera» nella console (`pc-attack.js:2217`).
- Testi della carta del TS contro la morte: «20 naturale» dopo una cura qualunque (`death-save-notice.js:64-72`).
- «almeno N ft» in un'interfaccia in metri (`aoeTargetTool.js:296`).
- Vista classica:
  - il tooltip dei PF promette «+N/−N sui token selezionati», ma il salvataggio tocca solo quel token e il suo gruppo (`initiativeCardClassicBuilder.js:996`);
  - per il GM, «Doppio clic per rinominare il token» prende il posto del nome intero sui nomi troncati (`initiativeEditors.js:780`).

**R2 — Errori senza messaggio e azioni rischiose**
- Pannello Condizioni:
  - «Aggiungi» e «Rimuovi» non hanno gestione degli errori: dopo un conflitto il pulsante resta disabilitato e non compare nessun messaggio (`effects-modal.ts:742-829, 556-584`);
  - il menu Condizioni scrive l'errore solo nella console (`ctx-conditions.ts:133`).
- Errori senza messaggio in altri punti:
  - «Imposta quota…» (`ctx-elevation.js:37-41`);
  - proposta delle creature nella console attacchi (`pc-attack.js:747-808`);
  - PF condivisi, dove compare sempre lo stesso messaggio generico (`shared-hp-modal.js:104`);
  - URL di 5eTools non valido, scartato in silenzio al salvataggio (`optionsNormalize.js:179-181`);
  - voci di un pacchetto privato scartate senza dirlo (`privatePackCore.js:148-152`).
- «Rimuovi Tutto» del pannello Condizioni agisce su tutti i token della scena e non solo sui bersagli, senza conferma (`effects-modal.ts:158-160, 727`).
- Invio nella ricerca dei mostri di 5eTools salva l'intera scheda e fa perdere i file caricati (`initiative-card-modal.html:511, 526`).
- Chiudere la scheda in modifica perde le modifiche senza avviso (`initiative-card-modal.js:5082`).
- Nel Registro, «Annulla» sul nome del nuovo registro lo crea comunque e archivia quello corrente (`history-modal.ts:1402`).
- Console PF: i bersagli selezionati ma nascosti dal filtro ricevono comunque danno o cura (`quick-hp-modal.js:251, 455`).
- Tracker:
  - una modifica dei PF inline rifiutata torna al valore vecchio senza messaggio (`initiativeEditors.js:506-509`);
  - un clic sul badge dell'iniziativa senza cambiare nulla riscrive il valore e lo segna come compilato a mano (`initiativeEditors.js:141-153`).

**R3 — Interfaccia**
- Gli input dei PF inline sono larghi 22 px: «-120» viene tagliato (`initiativeEditors.js:322`).
- Avvisi del GM:
  - non si chiudono più con la × (tolta in agosto, stile rimasto in `turn-notice.html:472-487`), ma i testi dicono «puoi chiuderlo»;
  - l'avviso di concentrazione del GM non ha né × né «Ignora».
- La carta del TS contro la morte resta sullo schermo del tavolo se il GM chiude la sua senza registrare (`death-save-notice.js:42-46`).
- I popover degli avvisi si aprono tutti nello stesso punto e si coprono.
- «Applicato a N bersagli» conta anche i bersagli invariati (`quick-hp-modal.js:908`).
- ⚠ La barra dei PF non segue scala e rotazione del token fino alla modifica successiva dei PF.
- Etichetta del turno:
  - ruota e scala con il token;
  - sparisce durante un'Azione epica.
- Console Boss:
  - il Critico non mostra i dadi del critico;
  - l'intestazione resta con ricarica e usi vecchi dopo un Annulla (`pc-attack.js:1976`, `renderLive`).
- Clock:
  - un clock nuovo è subito visibile ai giocatori;
  - il pannello si ridisegna a ogni cambio dei metadata di scena, chiude «Gestisci» e cancella il nome che si sta scrivendo (`clocks-modal.js:346-350`).
- Menu ⚡ degli incantesimi:
  - «Apri nel pannello» resta nascosto dopo un Annulla (`spell-pill-actions.js:57`);
  - il menu si chiude cliccando la mappa, ma il testo chiede di selezionare sulla mappa;
  - doppio clic sulle azioni che chiedono una creatura (`:104-112`).
- Registro:
  - «Statistiche storage» lascia disabilitati i pulsanti (`history-modal.ts:1345-1357`);
  - per esportare un archivio bisogna prima attivarlo.
- Aree libere: una rotazione o una scala dell'area fa partire la riselezione, che però considera solo lo spostamento (`aoeTargetTool.js:1493-1514`, da vedere in stanza).
- Card del tracker:
  - il «…» delle chip aperto si richiude a ogni ricostruzione della card (`initiativeChipOverflow.js:132-151`);
  - nel compatto, un gruppo collassato mostra i PF del primo membro come se fossero del gruppo;
  - una condizione dal nome lungo esce dalla pill senza puntini, e la sua × finisce fuori dal popover (`conditions.js:1555-1571`).

## 4. Lotti

Ogni lotto: spiegazione della patch, test aggiunti o adeguati, `npm test`, `npm run build`, `npm run perf:bundle` entro i tetti, un commit. Dopo la build `dist/` torna com'era (`git checkout -- dist`, `git clean -fdXq dist`). Bundle e push solo su richiesta.

| Lotto | Contenuto | File | Rischio | Verifica |
|---|---|---|---|---|
| **L1** ⚠ | PF dei mostri omonimi (HP-01), dopo D1 | `initiativeCards.js`, `actorVitalsStore.js` | medio (PF tra scene) | test d'identità e di ActorVitals; in stanza: statblock su un goblin con omonimi feriti, poi cambio scena |
| **L2** ⚠ | Coda temporale dopo la riapertura del tracker (EF-01) | `initiativeList.js` (solo `__temporalCommandId`) | basso | test broker + coda; in stanza: riaprire il tracker, ▶, una condizione da 1 round scade |
| **L3** | Trasporto oltre 16 kB: Annulla dal client e append dal tracker (HI-01, HI-02) | `effectsMutations.js`, `effectsMutationTransportCore.js`, `history.js`, `historyOwner.js` | medio (percorso dell'Annulla) | test con un SDK che rifiuta oltre 16 kB; le suite di Undo |
| **L4** | Incantesimi su più bersagli e doppio clic (SP-5, SP-3) | `effectsMutationCore.js`, `spell-unified-panel.js` | medio (nucleo condiviso) | Suggestione di massa: × su un bersaglio; due clic, un'esecuzione |
| **L5** | Condizioni: personalizzate, «Rimuovi condizioni», Afferrato su se stesso, Incapacitato derivato (EF-02, EF-05, EF-07, EF-08) | `effectsMutationCore.js`, `effects-modal.ts`, `conditionApplicationExecutor.js`, `conditionRulesCore.js` | basso | test del piano di mutazione |
| **L6** ⚠ | Turno attivo e ordine: creatura attiva rimossa, ◀ al round 1, Svuota con Tana, primo turno dopo Svuota, riordino con Paragon, casella Tana (TR-01, TR-03, TR-04, TR-11, TR-07, TR-08), dopo D3 | `initiativeOrderCore.js`, `initiativeRenderCore.js`, `initiativeList.js` (`reconcileStateWithItems`, `getEntriesWithLair`, gestore di ◀, `__processInitiativeMetadata`, `_reorderWithinSameInitiative`) | medio | helper puro con ID virtuali; banco; in stanza: togliere l'attivo |
| **L7** ⚠ | PF: temporanei a 0 PF, ripristino tra scene, riempimento del gruppo, Crit (HP-03, HP-04, HP-05, HP-07), dopo D6 | `quickHpCore.js`, `quick-hp-modal.js`, `actorVitalsStore.js`, `initiativeList.js` (`trySeedGroupHP`) | medio (PF) | test di core e di ActorVitals |
| **L8** | Concentrazione e morte (AV-03, AV-06), dopo D4 | `effectsMutations.js` (`planDeathSaveHpWrite`), `concentrationSaveReminderCore.js`, `spellAreaResolutionExecutor.js` | medio (pulizia di zone e aure) | morte istantanea di un concentrato: zona e concentrazione via; nessun avviso a 0 PF |
| **L9** | Schermo del tavolo: tracker dopo F5, selezione del GM, etichette della quota (OP-01, EF-03, OP-06) | `sync-open.js`, `effectsReconciler.js`, `elevationLabel.js` | basso | test; in stanza: F5 sulla finestra del tavolo |
| **L10** | Etichetta del turno: token cancellato, copia (TR-02, TR-10) | `initiativeList.js` (`upsertActiveTurnLabel`) | basso-medio | test con scena finta |
| **L11** | Console attacchi e Boss (AT-01, AT-02, AT-04, AT-05, AT-06, AT-07, AT-08) | `pcAttackExecution.js`, `pc-attack.js`, `bossCollapseCore.js`, `bossCollapseController.js` | basso-medio | test del popover e del runtime |
| **L12** | Scheda e import: Indebolimento, Tenser, azioni rapide, numeri, segni manuali, avviso del budget (EF-06, SC-02, SC-03, SC-05, SC-06, SC-07, SC-08) | `initiative-card-modal.js`, `initiativeCards.js`, `reminderResolutionCore.js`, `characterSheetImportCore.js`, `initiativeCardRegistryCore.js` | basso-medio | test di salvataggio e d'import |
| **L13** | Quota e Opzioni (OP-03, OP-04, OP-05) | `ctx-elevation.js`, `distance3d.js`, `options-modal.js`, `optionsPanelCore.js` | basso | test |
| **L14** | Registro e store locale (HI-03, HI-04, HI-05, HI-07, HI-08) | `history-modal.ts`, `combatLog.js`, `combatLogPaginationCore.js`, `historyLocalStore.js` | basso (HI-05 medio: tocca il recupero) | test del pannello e dello store |
| **L15** ⚠ | Turni che slittano: trigger di zona, TS degli effetti, ◀ ▶ (AV-01, AV-02, AV-04, EF-04) | `spellZoneTriggerCore.js`, `effectSaveReminderCore.js`, `initiativeList.js` (`__forwardConditionTurnBoundaries`) | medio-alto (momento di riconciliazione) | test di core; verifica guidata in stanza |
| **L16** ⚠ | Token nascosti: barre e aure (HP-02, AV-07); poi card, avviso e inquadratura per i giocatori (OP-02) e un solo ripiego dell'attitudine (OP-08), dopo D2 e D10 | `hpbar-items.js`, `sceneItemChangeDispatcherCore.js`, tre controller delle aure; poi `initiativeList.js`, `optionsProjection.js`, `turnNotice.js` | medio | in stanza, finestra del tavolo |
| **L17** | Codice della sessione degli incantesimi (SP-1, SP-2, SP-4, AT-03), dopo D8 | `spellActiveActionCore.js`, `spellActiveResolutionCore.js`, `supplementSpellRules.js`, `attackReactionsView.js` | basso-medio | test delle risorse e delle reazioni |
| **L18** | Rifiniture R1 (testi) | file vari | basso | test dei testi dove esistono |
| **L19** | Rifiniture R2 (errori e conferme) | `effects-modal.ts`, `ctx-conditions.ts`, `ctx-elevation.js`, `initiative-card-modal.*`, `history-modal.ts`, `quick-hp-modal.js` | basso | test e banco |
| **L20** | Rifiniture R3 (interfaccia), una per volta, scegliendo con te | file vari | basso | banco |
| **L21** | Documentazione (HP-06, OP-10, guida della console fuori turno, Reset round; membership delle aree in `GUIDA_UTENTE.md:770`; «Sposta zona», tolta in `9cffcfb8`, in `INCANTESIMI_E_ZONE.md`) | `docs/` | nullo | — |
| **L22** | Pulizia del repo, dopo D7 | file morti, `vite.config.js`, `scripts/perfBundleCore.mjs` | basso | build, `perf:bundle` |
| **L23** | Verifica guidata in stanza estesa (sezione 7) | `src/fluidityRoomCheck.js` o un modulo nuovo, `docs/PROVA_STANZA_FLUIDITA.md` | basso | — |
| **L24** | Console ad area: zone del caster cancellate, Mano arcana a 0 PF (MP-01, MP-05) | `spellAreaResolutionExecutor.js` | medio (zone e concentrazione) | test dell'esecutore: Unto più Ragnatela; mano a 0 PF da un'area |
| **L25** | Geometria delle aree: linee e muri, Onda tonante, cono in diagonale, emanazioni, gittata in piedi, «Aspetto area» (MP-03, MP-04, MP-06, MP-07, MP-09, MP-10) | `aoeGeometryCore.js`, `aoeTargetTool.js`, `spellAreaCatalog.js`, `spellAreaPlacementCore.js` | medio (MP-03 cambia la membership dei muri esistenti) | test di geometria; in stanza: un muro da un vertice |
| **L26** | Movimento: teletrasporti e costi cumulati (MP-02, MP-08) | `history.js` (watcher dei movimenti), `speedCheck.js`, `speedCheckCore.js`, `movementProfileCore.js` | basso-medio | test del controllo della velocità |
| **L27** ⚠ | Card del tracker: card Paragon aggiuntive, PF delle evocazioni nemiche ai giocatori, editor dell'iniziativa per i giocatori, pill dell'evocazione, salvataggio dell'iniziativa rifiutato (RN-01, RN-04, RN-05, RN-06, RN-08) | `initiativeCardClassicBuilder.js`, `initiativeCardCompact.js`, `initiativeList.js` (`bindHPEditorForEntry`, `__removeConditionOnTrackerCard`, `syncTrackerHPNow`), `initiativeEditors.js` | medio (PF e ID virtuali) | test con entry `boss::p1`; banco con un boss Paragon e con `role=PLAYER` |
| **L28** ⚠ | Render completo: card tenute con i listener vecchi, modifiche durante la navigazione, rinomina distrutta (RN-02, RN-03, RN-07) | `initiativeList.js` (`__reconcileTrackCardsById`, ramo dei render scartati), builder delle card | medio (pipeline di render e guardie di `renderAll`) | test di riconciliazione; banco: azione rapida cambiata e ⚡ |

## 5. Decisioni per te

| # | Decisione | Raccomandazione |
|---|---|---|
| D1 | Mostri e PF tra scene (HP-01): i mostri devono avere PF che persistono tra le scene? | No, come dice già la documentazione: niente ID ereditato per le schede dei mostri, e ActorVitals ignora nemici e neutrali. Gli ID già scritti restano, ma non vengono più usati per i PF. **Applicata in L1 in forma più stretta**: solo le schede da mostro, perché i boss senza statblock (Auril) conservano i PF tra le scene per scelta |
| D2 | Token nascosti e schermo del tavolo (HP-02, AV-07, OP-02) | (a) barre e aure seguono la visibilità del token: sì, nel lotto L16; (b) card, avviso di turno e inquadratura dei token nascosti per i giocatori: sì, ma come secondo passo dello stesso lotto, perché tocca il tracker del giocatore |
| D3 | Creatura di turno rimossa (TR-01) | turno alla creatura successiva; se era l'ultima, la prima con round + 1, come con ▶. Alternativa: indice 0 nello stesso round, come oggi in tutti i casi |
| D4 | Concentrazione a 0 PF (AV-03) | si rompe per ogni creatura che arriva a 0 PF, e a 0 PF non compare l'avviso del TS. La morte istantanea dei PG la rompe comunque: è un bug |
| D5 | Reset round (TR-05): oggi allunga le durate di (round − 1) e il suo Annulla le riaccorcia; il commento a `initiativeList.js:1566` lo dichiara | né il reset né il suo Annulla toccano le durate |
| D6 | PF temporanei a 0 PF (HP-03) | bloccati con un messaggio: il modello dei PF (`hp` oltre `hpMax`) non sa rappresentare «0 PF più temporanei» |
| D7 | Pulizia del repo: `src.zip` (1,5 MB), `audit-final-perf.json` (2 MB), `backlog.txt`, `concentration-widget-backup.js` (vuoto), avanzi del template di Vite (`src/counter.js`, `src/javascript.svg`, `src/style.css`), 3 `src/*.orig` e 4 `test/*.orig`; le pagine mai aperte `zone-trigger-notice` e `ctx-remove-condition` (via dalla build e dai tetti di `perf:bundle`) | sì, in un commit a parte, dopo aver controllato che nulla li usi |
| D8 | Codice appena committato dalla sessione dell'automazione incantesimi (SP-1, SP-2 in `cc6c0517`; SP-4, AT-03 in `e5ff04b3`), con il lotto 2 di CAP-REACTION ancora da fare | correggerli qui alla fine (L17), solo se quei file non hanno modifiche in corso; altrimenti li passo a quella sessione |
| D9 | Registro delle schede oltre il budget della stanza (SC-03) | un avviso quando la compattazione scarta un profilo (piccolo). Compattare libro e azioni rapide per la stanza è più lavoro, e con un solo browser del GM serve poco |
| D10 | Distanza 3D sulle griglie esagonali (OP-07); ripiego dell'attitudine (OP-08) | esagoni: lasciarli, al tavolo la griglia è quadrata. Attitudine: un solo ripiego, «neutrale», che nasconde ai giocatori i PF esatti dei token legacy senza fazione (⚠, in L16) |

## 6. Ordine raccomandato

L1 → L2 → L3 → L4 → L24 → L27 → L5 → L6 → L7 → L9 → L8 → L10 → L28 → L11 → L26 → L12 → L13 → L14 → L25 → L15 → L16 → L17 → L18–L20 → L21 → L22, con L23 esteso man mano.

- Prima il P0, poi i P1 con le patch più piccole e sicure: L2 è una funzione, L3 il trasporto, L24 un filtro, L27 l'ID base delle card Paragon.
- L6, L7, L8 e L16 aspettano le decisioni D3, D6, D4 e D2.
- L15 è il lotto più delicato: va dopo gli altri lotti del turno, con la verifica guidata.

Convivenza con le altre sessioni: la sessione dell'automazione incantesimi lavora su `spells-srd.js`, `supplementSpellRules.js`, `attackReactions*.js`, `spellActive*.js`, `pc-attack.js` e `boss-actions.js`. Prima di ogni lotto controllo `git status` e `git log`. In un file toccato anche da lei metto in stage solo le mie modifiche.

## 7. Prova in stanza

La verifica guidata esistente (`__tbpPerf.runFluidityCheck()` sul GM, `watchFluidity()` sul tavolo, `docs/PROVA_STANZA_FLUIDITA.md`) si estende con un `runBugfixCheck()` che fa da solo, e poi rimette com'era, quello che si può misurare:

- riapertura del tracker, poi ▶: una condizione di prova da 1 round scade (L2);
- rimozione della creatura di turno: il turno passa alla successiva (L6);
- Annulla di due voci dalla Cronologia (L3);
- PF modificati dalla seconda card di un boss Paragon (L27);
- token nascosto: barra e aura assenti sulla finestra del tavolo (L16, con `watchFluidity` dalla parte del tavolo).

Restano a mano:
- F5 sulla finestra del tavolo: il tracker deve tornare (L9);
- statblock su un goblin con omonimi feriti (L1).

## 8. Scartati e cosa non propongo

Comportamenti voluti, fissati da test o documentati:
- i PF temporanei sotto il massimo si sommano (`quickHpCore.test.js`);
- resistenza e vulnerabilità allo stesso tipo: vale la resistenza (`damageDefenses.test.js`);
- ◀ non riavvolge gli effetti (ARCH-006);
- Epic porta l'iniziativa a 20;
- «Svuota» non azzera `paragonInits` e `collapsed` (`initiativeUndoCore.test.js`);
- l'Aura di Protezione termina a Privo di sensi;
- il riarmo dei promemoria di zona dopo Esc;
- la misura della distanza a caselle D&D;
- la quota sui PG per i giocatori;
- la sincronizzazione del tracker del tavolo con quello del GM.

Controllati e corretti, quindi senza lotto:
- CD della concentrazione;
- critico (si raddoppiano solo i dadi);
- tiri contro la morte, cura da 0 PF e danno massiccio;
- token copiati con le barre;
- pulizia delle aure quando si cancella la sorgente;
- concentrazione nuova che chiude la vecchia;
- slot spesi e Annulla;
- doppio clic nelle console e nella console degli effetti manuali (il secondo commit viene rifiutato dai PF attesi);
- HTML senza escape: nel tracker, nelle schede e nel compendio nomi, condizioni e testi passano sempre da `textContent`;
- lettura dei PF inline («+5», «-3», vuoto, decimali, oltre il massimo come PF temporanei), come fissato da `initiativeEditors.test.js`;
- movimento annullato con Ctrl+Z, avviso di velocità fuori turno, pedine rimaste dopo la fine dell'incantesimo;
- modificatori, competenza e CD della scheda;
- riposi.

Non propongo:
- refactor di `initiativeList.js` o della coda del turno;
- nuove funzioni di bookkeeping per il GM;
- cambi alla tipografia (V4 è stato scartato il 28/10);
- automazioni di incantesimi mancanti: le segue `docs/PIANO_AUTOMAZIONE_INCANTESIMI.md`.
