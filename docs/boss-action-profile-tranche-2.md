# Boss Actions — tranche 2A / 2B e pass UX

Questa tranche estende il vertical slice già presente. Si ferma prima di nuove mechanics avanzate e usa i due stat block reali come fixture.

## Prova rapida

1. Sul token reale del boss apri **Boss Actions** dal menu contestuale o dal pulsante **Boss** nella tracker card.
2. Importa nuovamente l'HTML per ottenere una definizione **v2**, quindi collegala. I profili v1 già salvati restano leggibili, ma non acquisiscono le nuove azioni finché non importi la nuova revisione.
3. Le azioni eseguibili sono in primo piano; filtra per nome. Le capacità manuali e la gestione profili sono raccolte in sezioni richiudibili.
4. Seleziona un bersaglio sulla mappa prima di aprire l'azione, oppure scegli un token dai pulsanti/elenco nel form. Distanza, visibilità e linea di vista restano verifiche del GM.
5. Fase 2: prova **Icekiss +2**, **Rock** (conferma manualmente la restrizione Gather), **Spellcasting → Slow**. Fase 3: prova **Polar Ray** e **Blizzard Strike**.
6. Inserisci l'esito e i danni dei singoli componenti. Conferma una volta: danni e contatori automatizzati producono una sola voce History.
7. Annulla dalla History esistente: HP, contatori e gli effetti Slow ritornano allo stato precedente.
8. Usa **Aggiorna azioni e risorse** dopo Slow, Undo o un cambio round per aggiornare il popover senza chiuderlo.

La fase è un binding manuale, senza phase transition. Blizzard Strike appartiene alla fase 3; non viene aggiunta alla fase 2.

## Mechanics della tranche

| Capacità | Stato | Dati ed esecuzione |
| --- | --- | --- |
| Icekiss +2 | SUPPORTED | +12, mischia/distanza, hit/miss; 2d10+7 slashing, stampato18; 2d6 cold, stampato7. |
| Polar Ray | SUPPORTED | Attacco spell a distanza +11, 120ft; cold3d6 e necrotic3d6 separati. Totale stampato21, medie derivate10+10=20: nessuna allocazione inventata del punto residuo. |
| Rock | PARTIAL | Attacco weapon a distanza +10, 50/100ft; bludgeoning7d6+5, stampato29. Richiede conferma GM della restrizione Gather the Winter Sky; la restrizione non viene automatizzata. |
| Blizzard Strike | PARTIAL | STR15, bludgeoning2d8 + cold2d8, metà su successo secondo scaledQuickHPAmount per componente. Movimento forzato solo testo manuale. Uso1/Round. |
| Spellcasting | PARTIAL | Riferimento a slow nel catalogo esistente, DC19/+11. Uso1/Round consumato nel commit Slow; aprire il pannello non consuma. Gli altri spell e i limiti giornalieri restano manuali. |
| Altre ability | UNSUPPORTED | Testo originale. Se riportano 1/Round o 1/Phase, il GM può registrare esplicitamente il solo uso: nessun effetto viene eseguito. |

La grammar rimane ancorata all'intera descrizione riconosciuta. Clausole nuove o incoerenti non guadagnano mechanics. Il runtime legge solo dati validati, mai HTML/prosa.

## Contratti aggiunti o estesi

- **bossActionProfileCore.js**: profileVersion/parserVersion2. Supporto ranged a uno/due componenti, tipo weapon/spell e printedTotalAverage opzionale. Accetta anche la coppia legacy1/1; rifiuta versioni miste. sourceHash rimane SHA-256 dell'HTML; revision v2 è SHA-256 di parserVersion + newline + HTML, quindi lo stesso sorgente può convivere con una revisione v1 immutabile.
- **bossActionUsageCore.js**: bossActionUsageAvailability e consumeBossActionUsage, funzioni pure. Soltanto period round/phase hanno contatori; day/recharge sono manuali.
- **bossActionExecutionCore.js**: bossRuntimeStateForItem e buildBossActionUse condividono la mutation di risorsa con danno, registrazione manuale e Slow.
- **bossActionExecution.js**: presentation espone round e availability per ability. registerBossActionUse registra volontariamente il solo contatore di una capacità non automatizzata. Draft e retry riusano il coordinatore esistente.
- **bossActionsViewCore.js / boss-actions.js / boss-actions.html**: ordinamento azioni, ricerca, risorse visibili, selezione target dalla mappa/pulsanti, form raccolto, conferma manuale e refresh esplicito.

Definizione completa e HTML restano nello store locale versionato già creato nella tranche1; envelope v1 invariato. Il binding Actor Profile continua a contenere solo profileId, profileRevision, bossDefinitionId, phaseId. Nessun nuovo schema IndexedDB, nessun raw/profile nel Room registry.

Lo stato del token bossActionState conserva:
- version1, boundTokenId, bossDefinitionId, bossInstanceId, lastAction;
- usageState version1 con buckets rounds[round] e phases, indicizzati da [phaseId,actionId].

Le revisioni della stessa fase non azzerano gli usi. Rename conserva l'istanza; un token duplicato riceve un'istanza/counter state indipendente. Unbind/rebind conserva la risorsa dell'istanza.

## Punti esatti di integrazione

| File | Funzioni/blocchi |
| --- | --- |
| src/bossActionProfileCore.js | execution/validator e grammar di ranged attack; importBossActionHTML/revision. |
| src/bossActionExecutionCore.js | buildBossActionMutation raccoglie decisioni e costruisce HP + bossActionState; buildBossActionUse centralizza le risorse. |
| src/bossActionExecution.js | session, getBossActionPresentation, executeBossAction, registerBossActionUse, launchBossActionSpell. |
| src/effectsMutations.js | checkEffectsSceneMetadataPreconditions, prepare e commitCoordinatedEffectsPlan: selettore opzionale field e verifica round immediatamente prima del commit. |
| src/spellAreaResolutionExecutor.js | defaultRuntime.readBossActionProfile, buildPlan, spellAreaCausality, NOOP gates, commitCoordinatedEffects e decorateEntry nella withItemMetaHistory esistente. |
| src/boss-actions.js | showAction, renderAbilities, refresh e launcher selezione mappa/refresh locale. |
| src/bossActionsViewCore.js | grouping, filtri/summary e validazione delle decisioni UI. |
| boss-actions.html | struttura minima, sezioni richiudibili e refresh. |

I cambi già presenti in initiativeList, initiativeCards, contextMenu, routing/sessione spell, Combat Log v3 e Vite appartengono alla tranche1: questa tranche non richiede una nuova modifica ai turni o agli slot Epic.

## History, causality e concorrenza

Danno diretto: un solo comando coordinato con hp:set e metadataPatches. Gli snapshot expected proteggono binding, HP e stato del boss nel callback SDK; una sola History ripristina tutte le mutation automatizzate.

Slow: la definizione locale viene validata contro il binding e il contesto prima dell'esecuzione. Il resolver Slow/catalogo resta canonico; il commit effetti/concentrazione include il contatore, e la stessa withItemMetaHistory copre tutto. La History del contatore è attribuita al risultato coordinato; lo snapshot esterno non deve assorbire modifiche di un altro comando. Dopo ACK perso, la risorsa può essere recuperata solo se baseline e stato finale corrispondono alla specifica actionInstanceId.

Combat Log v3 conserva actor reale, cause monster-action con profile/revision/phase/bossInstance/actionInstance, referencedSpell per Slow, componenti di danno distinti e causality.resources con beforeUsed/afterUsed/period/round. L'attore non deriva dal turno corrente.

Non esistono un secondo History, un nuovo engine di danno o listener di reset. Per-round legge il round canonico; tornando a un round precedente ritrova gli usi registrati.

## Limiti intenzionali

- La scena non possiede oggi un encounterId canonico. Riportare il contatore round a1 non significa iniziare una nuova istanza e non azzera gli usi. Per ripetere i test usare Undo; per un incontro distinto usare un nuovo token/istanza. Nessuna euristica di reset viene introdotta.
- Scene metadata e item metadata sono API SDK separate. La precondizione round viene ricontrollata subito prima del commit item, ma non equivale a una transaction SDK fra scena e token.
- Il popover aggiorna stato/risorse esplicitamente; nessun listener passivo globale.
- Special sequencing, recharge, risorse giornaliere, forced movement, manifestations, transition, Mark/Detonation, grasp/held, hpMax/healing speciali, delayed zones, passivi e reactions complesse restano fuori scope.
- Una sessione Slow già risolta resta monouso: il replay diretto dello stesso comando viene bloccato dalla risorsa già consumata. Per una nuova azione aprire un nuovo workflow dal boss. Il recupero dopo commit con conferma persa restituisce la History parziale e conserva Undo completo.
- I test di integrazione usano SDK/DOM simulati: non attestano una partita in una stanza Owlbear live. La preview browser locale non è stata verificata perché il collegamento browser è andato in timeout; il file temporaneo è stato rimosso.

## Verifica

I nove file mirati: bossActionProfileCore.test.js, bossActionProfileStore.test.js, bossActionUsageCore.test.js, bossActionExecutionCore.test.js, bossActionExecutionIntegration.test.js, bossActionsViewCore.test.js, bossActionsPopover.test.js, bossActionSpellSession.test.js e monsterActionSpellContext.test.js.

Test mirati coprono parser v1/v2, raw/source/revision, export/import, Polar/Rock, contatori/rebind/clone/rewind, concorrenza e stale round, Slow e Undo/lost ACK, UI/target/resources. Le suite esistenti di spell, Quick Actions, History, log e initiative vengono eseguite nel run completo.

Verifica consolidata del 12 ottobre 2026:

- Suite mirata dei nove file Boss/Slow/UI: **119/119 pass**, zero skip/failure.
- **npm test: 3105/3105 pass**, zero skip/failure.
- **npm run build: PASS**, 480 moduli; restano gli avvisi preesistenti sui chunk catalogo oltre500kB.
- **git diff --check: PASS**.

La review indipendente ha riprodotto e portato alla correzione di due casi: History Slow che assorbiva uno stato esterno / perdeva il contatore dopo timeout restituito dal trasporto; controlli target che restavano vecchi dopo refresh. I test ora includono entrambi. È coperto anche il conflitto definitivo di un draft: il messaggio richiede di riaprire l’azione e il form stale viene chiuso; i retry con conferma incerta conservano invece la propria identità.

## Pass operativo UX — 12 ottobre 2026

Walkthrough end-to-end in test/bossActionsWalkthrough.test.js: popover reale + runtime, coordinatore, History/Undo e Combat Log v3 reali su SDK/DOM simulati, con le fixture integrali di fase 2 e 3. Non è una partita in Owlbear live.

Problemi riprodotti e corretti:

- **Errori di validazione invisibili.** A 560×640 il form Polar Ray porta il documento a 1020px; dopo lo scroll sull'azione il #boss-status è a −349px. Ora il messaggio è replicato in #boss-form-feedback accanto al pulsante dell'azione (role=alert) con scroll minimo. Misura: Edge headless sul DOM prodotto dal controller.
- **Esito non verificabile dal popover.** Il form si chiudeva con “Azione risolta”. Ora lo stato riporta bersaglio, esito, componenti separati, PF prima → dopo e uso consumato. Il runtime aggiunge al risultato campi di sola lettura (target, outcome, hpChange, resources) presi dal piano committato.
- **Risorsa esaurita dopo cambio round.** Il pulsante resta disabilitato con l'availability stale; il testo ora indica il round e invita ad «Aggiorna azioni e risorse». Nessun listener aggiunto.
- **Automazione vs manuale.** Ogni form danni elenca cosa scrive il commit e cosa resta manuale, derivato solo dai dati validati.
- **Etichette.** Tipi di danno in italiano; bersagli con PF correnti (aiuta a distinguere token omonimi).

Comportamento confermato, non cambiato: HP modificati mentre il form è aperto non sono un conflitto, perché il piano legge gli HP canonici al submit.

## Tranche UI — console floating (12 ottobre 2026)

Solo presentazione, navigazione e selezione: runtime, damage engine, spell, History/Undo, Combat Log, metadata e HP canonici invariati.

- **Popup** 380×500 (`BOSS_ACTIONS_WIDTH/HEIGHT` in bossActionsViewCore.js), glass del plugin (`ui-typography.css`, `popover-glass.css`, token `--obrt-*`), `hidePaper`. Header trascinabile tramite `popoverDrag.js` + `openTrackedPopover` esistenti (posizione salvata, clamp nella viewport). Riduci/ripristina con `OBR.popover.setHeight`.
- **Due viste nella stessa finestra**: elenco azioni (righe con tag e badge brevi: `1/1 round`, `Esaurita`, `Ricarica`; capacità manuali in “Altre capacità e tratti”; ricerca se più di 8 voci) e risoluzione (bersaglio, attacco/TS, modalità solo se esiste una scelta, esiti come pulsanti, componenti modificabili, totale, passaggio manuale, Applica). “Gestisci profilo” contiene import/binding/export/aggiorna.
- **Bersaglio dalla mappa**: subscription locale `player.onChange` (+ rilettura su `pointerenter` del popup), rimossa a chiusura/cambio scena. Un solo token tracciato selezionato → bersaglio; nessuno/boss/non tracciato → messaggio breve; più token → scelta esplicita, mai il primo. Mai turno corrente, attachment o ID virtuali.
- **Regola del draft**: la selezione aggiorna il bersaglio solo finché il draft è intatto. Esito, modalità, danni, conferma o scelta esplicita lo bloccano; una nuova selezione compare come “Usa questo” e il cambio esplicito azzera l’esito. Applica congela tutte le decisioni prima del commit; durante il commit la selezione è ignorata.
- **Aggiornamento locale**: `scene.onMetadataChange` (round) e `scene.items.onChange` (stato boss, binding, bersagli/HP) con debounce; il draft aperto resta se binding/istanza non cambiano, altrimenti viene chiuso con messaggio.
- **Esito e Undo**: barra di stato sempre visibile; “Annulla” solo con voce History confermata e solo se è l’ultima (stesso criterio della console HP), tramite `undoHistoryThrough`.
- **Ricarica dell’iframe**: draft non ancora inviato e stato ridotto salvati in `sessionStorage` del popup; un draft già inviato non viene mai ripristinato (retry e identità restano nel runtime).

Percorsi con bersaglio già selezionato sulla mappa: Icekiss → Colpito → Applica; Blizzard Strike → TS fallito → Applica (3 interazioni, medie precompilate).

Preview riproducibile senza stanza: `npx vite --config test-support/boss-actions-browser/vite.config.mjs --port 5199`, poi `/test-support/boss-actions-browser/frame.html?scenario=icekiss` (scenari: list, list-target, icekiss, icekiss-applied, rock, slow, no-target, multi, locked, blizzard, polar, exhausted, minimized, manage, compare; `phase=3` per la fase 3). Mappa simulata con token cliccabili (Maiusc per selezione multipla), popup reale in iframe, coordinatore/History reali.
