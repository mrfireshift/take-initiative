# ARCH-05B — recovery persistente post-commit

Baseline: Take Initiative 1.3.0, HEAD `085e3a84e1edcac915cb49a3d069b453843aae56`, con il solo `test/shieldVfxRegression.test.js` non tracciato nella working tree iniziale. Nessuna baseline precedente ripristinata.

## 1. Root cause refinement

Confermato il modello 05A: il coordinator serializzava correttamente le mutation, ma History immutabile, progress dei side effect e retry vivevano nel runtime. La morte del background eliminava informazioni indispensabili; in Quick HP il caller possedeva inoltre il before della History esterna. Le projection rimangono ricostruibili.

Il fix conserva planner, commit con controllo delle precondizioni e History owner esistenti. Il recovery non ripete il commit canonico: distingue before, after e conflitto leggendo soltanto i target interessati quando l'esito è ambiguo.

## 2. Recovery architecture

**Owner:** background GM, nella lane del coordinator Effects. Nessuna seconda queue, subscription o owner nei pannelli. Il bootstrap attende il caricamento/recovery nella lane prima di esporre il listener dei comandi; se il bootstrap fallisce, l'errore viene registrato ma il mount completa e il listener viene comunque esposto, così il trasporto Effects non resta senza endpoint. Recovery e comandi restano serializzati nella stessa lane. `background.js` monta già History owner prima di Effects e i controller successivi dopo Effects. Il retry riutilizza il timer post-commit esistente; nessun timer quando non c'è lavoro ritentabile. I conflitti restano persistenti senza retry periodico automatico.

**Storage:** scene metadata, nuova chiave versionata `com.thebigpicture.initiative/effects-recovery-v1`, scritta tramite l'autorità `writeSceneMetadataKey`. Non viene sostituito l'oggetto metadata di scena. Room metadata non è adatto al lifecycle delle scene e ha già un budget condiviso; IndexedDB non è necessario per dati recuperabili dal background della scena attraverso reload.

**Identità:** l'SDK installato non espone un ID persistente di scena attraverso SceneApi. Il protocollo assegna un UUID `scopeId` al proprio store nella scena, solo alla prima operazione protetta. Ogni record e receipt conserva anche `roomId`; i record di altra room/scope vengono ignorati e conservati. Questa identità vive nei metadata della scena, non nel runtime. Nessun `sceneEpoch`, `sceneIdentity` o `warningRuntimeScope` è serializzato. Riferimento API: [Scene API ufficiale](https://docs.owlbear.rodeo/extensions/apis/scene/).

**Schema v1:** root con `schemaVersion`, `scopeId`, `records`, `receipts`; record con command/correlation ID, kind, room/scope, phase, timestamp, canonical changes con before/after/precondizioni, History immutabile e ID deterministico, side effect preparati e identità completate. I reader preservano record sconosciuti/incompatibili; uno store non riconosciuto impedisce nuove scritture protette.

**Bounds:** massimo 16 pending record, 128 KiB UTF-8 per la chiave comprensiva dei dati, 128 receipt recenti. 128 KiB è un limite del plugin, non una dichiarazione del limite SDK. La verifica riserva anche lo spazio necessario a tutti i progress marker prima del commit. Nessun truncamento di snapshot e nessuna eviction dei pending; budget esaurito o scrittura rifiutata impediscono il commit. I pending non scadono per età; le receipt sono limitate alle ultime 128 operazioni completate. Lo scope e le receipt restano dopo la rimozione dell'envelope.

**Idempotenza:** `effects-history:<commandId>` e payload History immutabile riutilizzano la deduplica esistente. Le receipt gestiscono l'ACK perso dopo cleanup. L'identità del side effect è `<commandId>:side:<index>`, ma il recovery non si affida al solo indice: teleport confronta posizione reale con before/after; consume confronta la specifica activationId e conserva le altre activation. Risultato già applicato senza marker viene riconosciuto; risultato incompatibile non viene sovrascritto.

**Cleanup:** rimozione solo dopo canonical riconosciuto, side effect richiesti completati e append History confermato. Una risposta di persistenza persa attiva read-back dello store; un errore di cleanup lascia COMPLETE o la receipt effettivamente persistita. Cambio scena/unload elimina soltanto RAM: tornando alla scena originale si ricaricano i pending.

## 3. State machine ed error handling

```text
PREPARE + History immutabile
  → PREPARED durevole
  → commit canonico nella lane esistente
  → CANONICAL_COMMITTED
  → SIDE_EFFECTS_PENDING [progress individuale, se presenti]
  → HISTORY_PENDING
  → append History idempotente
  → COMPLETE
  → rimozione record + receipt bounded
```

PREPARED al bootstrap: stato before → abbandono sicuro; stato after → continua senza reapplicare; stato misto/incompatibile → conserva record e segnala conflitto. Un nuovo comando non può cancellare le prove di un PREPARED ambiguo: recovery/precondition gate precede il planner.

Precondition/canonical failure senza commit mantiene le semantics esistenti. Errori post-commit ritornano `committed: true`, `historyPending`/`recoveryPending` e dettagli bounded di errore: non vengono nascosti come successo completo e non invitano a ripetere una mutation già applicata. Non viene introdotto rollback automatico di canonical valido. COMPLETE con cleanup fallito ha History durevole e solo recovery ancora pending.

## 4. Files changed

| File | Responsabilità e funzioni coinvolte |
| --- | --- |
| `src/effectsRecovery.js` (nuovo) | `supportsEffectsRecovery`, `createEffectsRecovery`; load/prepare/resume/recover/beforeCommand/save/write/remove, bounds e receipt. |
| `src/effectsMutations.js` | `recoverySideEffectHistory`, `inspectRecoveryCanonical`, `applyRecoverySideEffect`, `mountEffectsRecovery`, `recoverPendingEffects`; integrazione in `commitCoordinatedEffectsPlan`, factory/mount/unmount e retry esistenti. `prepareEffectsSideEffects` conserva visibilità teleport; `applyPreparedSideEffect` controlla precondizioni fisiche/consume. |
| `src/effectsMutationCoordinator.js` | `createEffectsMutationCoordinator`: hook pre-command nella stessa lane e result History già gestita dal recovery, evitando append concorrente. |
| `src/metadataKeyScoped.js` | Registro `METADATA_OWNERSHIP.EFFECTS_RECOVERY`, owner unico della nuova chiave. |
| `src/history.js` | `reannounceHistoryReminderEntries`: riassocia al runtime corrente il replay di reminder da History durevole solo dopo verifica room/scope. History legacy conserva il controllo epoch precedente. |
| `src/quick-hp-modal.js` | `applyOperation`: passa la History al background insieme al comando; usa l'entry restituita per Undo e warning correlati. Rimossi helper/import del wrapper locale ormai inutilizzati. Preview, HP memory e UI restano nei percorsi esistenti. |
| `test/arch05aPostCommitRecoveryDiagnostic.test.js` | Diagnostico adattato in regression produttive e ampliato a 40 test, incluso il recovery composito di Porta Dimensionale. |
| `test/reminderResolutionBrokerReplay.test.js` | `runReplayCombination` può sostituire il runtime prima dell'Undo; aggiunto replay reminder dopo restart. Totale 9 test. |
| `test/concentrationSaveReminderRuntime.test.js`, `test/effectsMutationArchitectureContract.test.js`, `test/historyOwnerInventory.test.js` | Assert/inventario aggiornati al nuovo owner Quick HP. |
| `test/hpBatchResponsiveness.test.js`, `test/quickHpConcentrationBadge.test.js`, `test/quickHpModalDefaultMode.test.js`, `test/spellUnifiedPanelFase11Integration.test.js` | Sostituito l'assert testuale sul wrapper locale con History nel comando. Conservati preview-prima-del-commit, API canoniche e Undo. |
| `docs/ARCH-05B-RECOVERY.md` | Contratto, retention, limiti e risultati della tranche. |

## 5. Workflow migrated

Protezione per comandi Effects con History abilitata e senza side effect non supportati: condition/HP/effects semplici; risoluzione reminder con marker canonico e consume di zone activation; teleport fisici sequenziali, incluso il cast composito di Porta Dimensionale. `spell-active-resolution:validate` resta validation, senza lavoro persistente da ripetere. Quick HP/manual effects passa una singola azione HP/conditions con History al background prima del commit.

Porta Dimensionale produce un record unico con due side effect indicizzati
`token:teleport`: caster e passeggero condividono command/correlation/operation
identity, ma il recovery confronta e completa ogni posizione separatamente.
Se il primo soggetto è già arrivato e il secondo fallisce, il record resta
pendente e al riavvio viene applicato soltanto il secondo; non viene introdotto
un rollback compensativo del caster e History viene appesa una sola volta.

Sono esclusi Undo stesso come nuova operazione di recovery, workflow `history:false`, soppressione History per terminal accumulation e piani con altri tipi di side effect. Gli altri wrapper locali non vengono migrati universalmente. Il dispatch delimita esplicitamente questa tranche; non è una outbox di tutte le spell/aree. Nessun record per visual, pill, label o reconcile derivato.

## 6. Regression tests

Il diagnostico usa SDK persistente simulato e moduli produttivi planner/coordinator/History owner/Undo, con runtime separati. R1 recupera commit senza History e verifica Undo; R2 sostituisce runtime durante retry; R3 verifica A una volta/B completato; R4 esegue anche tre cold restart nello stesso scenario; R5 ripresenta stesso commandId; R6 verifica HP+condition e Undo senza il before del caller; R7 copre marker prima di consume e consume prima di History; R8/R9 proteggono switch e record estranei; R10 verifica cleanup; R11 lascia al reconciler il visual mancante.

Failure injection aggiuntive: envelope pre-commit rifiutato, phase write fallita, cleanup fallito, History owner assente, risposte perse dopo scritture riuscite, side effect senza progress persistito, posizione già completata manualmente o incompatibile, due pending indipendenti, duplicate e nuova mutation mentre recovery fisico è sospeso, PREPARED ambiguo davanti a nuovo comando, cap 16/128 KiB, receipt 128, room riutilizzata, esclusione dei dati runtime dalla serializzazione.

## 7. Restart matrix

| Boundary prima del restart | Dopo bootstrap | Risultato |
| --- | --- | --- |
| PREPARED, canonical ancora before | Verifica e rimozione record non committato | Nessun canonical/History inventato; retry consentito. |
| Canonical persistito, phase ancora PREPARED | Read-back after, nessun secondo commit | Una History, Undo disponibile. |
| CANONICAL_COMMITTED prima di History | Completa lavoro mancante e append | Una entry e cleanup. |
| Side effect A applicato, B mancante | A riconosciuto/completato, B applicato | A non duplicato, B durevole. |
| Side effect applicato, progress write fallita | Confronto con stato reale | Idempotente anche attraverso tre cold restart. |
| Marker reminder persistito, activation pending | Consume activationId + append | Marker/consume/History convergono. |
| Consume completato, History assente | Nessun secondo consume, append | Risoluzione unica. |
| History write fallita o owner assente | Payload precommittato riutilizzato | Converge al ritorno dell'owner. |
| History persistita, risposta o phase persa | Deduplica stesso payload/entryId | Nessuna seconda entry. |
| COMPLETE, cleanup fallito | Rimozione record e receipt | History non riappesa. |
| Scena A pending, corrente B | Nessun lavoro A su B | Record A intatto, ripreso al ritorno. |
| Posizione/stato necessario incompatibile | Record trattenuto, conflitto | Nessun overwrite di stato più recente. |

## 8. Verification results

| Verifica | Risultato |
| --- | --- |
| Regression recovery + reminder replay | 49/49 (40 + 9) |
| Dimension Door behavioral/E2E + donor/unified subset | 140/140 |
| Dimension Door composite recovery regression | 1/1 (incluso nei 40 test recovery) |
| Full suite | 2950/2950 |
| Performance harness | status=ok, 1777 SDK calls |
| Build Vite | riuscita, 4.03 s (ultima esecuzione) |
| verify:version / verify:dist | riusciti, 1.3.0 |
| git diff --check | riuscito |

I gruppi si sovrappongono e non vanno sommati. Build segnala i consueti chunk oltre 500 kB; nessun errore di build. Le quattro failure statiche iniziali chiedevano ancora `withItemMetaHistory` in Quick HP: corretto il contratto testuale dell'owner, non il comportamento per far passare regressioni.

## 9. Nominal overhead

SDK calls prima **1777**, dopo **1777**, delta **0** nello scenario nominale del performance harness (40 token, 10 zone/aura, 100 effect, 100 movimenti, 100 HP, 30 turni). Questo non significa che la durability sia gratuita: il harness non misura ogni comando UI protetto end-to-end.

Bootstrap recovery vuoto richiede una lettura dei metadata scena, nessuna scrittura. Un comando protetto senza side effect aggiunge cinque scritture della sola chiave recovery: prepare, canonical phase, History pending, complete, cleanup. Ogni side effect persistito aggiunge un progress write e un controllo mirato dello stato fisico. Nessun full scene scan aggiuntivo per mutation, nessuna scrittura per projection, nessuna subscription nuova. Le letture di ambiguity/recovery sono mirate ai target del record.

## 10. Compatibility

Versione, token metadata, condition schema, actorVitals e API pubbliche rimangono quelli esistenti. Schema recovery è nuovo, senza migrazione retroattiva. Quick HP riceve la History del coordinator e può mostrare «Cronologia in recupero; non ripetere l'azione». Il commit viene rifiutato prima di iniziare se non si può garantire il budget/durability. Durante recovery teleport converge alla posizione senza ripetere l'animazione; il percorso nominale conserva l'animazione. Il replay reminder ricostruisce soltanto il contesto runtime dopo aver verificato l'identità persistente.

## 11. Residual risks e limiti

**Failure ancora possibili:** rete/SDK indisponibili indefinitamente o target cancellati/conflittuali impediscono convergenza automatica; il record resta intatto e non sovrascrive dati incompatibili. I pending possono saturare il cap e bloccare nuove operazioni protette. La deduplica di operazioni già completate è limitata alle ultime 128 receipt, non permanente.

**Fuori scope:** recovery degli altri side effect fisici, altri wrapper History locali, undo interrotto come operazione distinta, warning/UI locali sacrificabili, ARCH-06. Nessuna promessa di recovery per operazioni eseguite prima di 05B e prive dell'envelope.

**Multi-GM/mixed-version:** eredita il modello di autorità GM esistente; non aggiunge coordinamento distribuito fra due background GM indipendenti. Una versione vecchia non crea gli envelope e può modificare stato senza il nuovo protocollo. La garanzia riguarda i workflow protetti eseguiti dall'owner aggiornato.

**SDK/network assumptions:** persistenza effettiva dei metadata scena e semantica delle update canoniche esistenti; read-back deve poter tornare disponibile. Gli epoch proteggono il runtime, non costituiscono una transazione distribuita contro una scrittura SDK già in volo durante cambio scena. Una copia integrale esterna della scena che duplichi anche scope e record non è distinguibile dall'originale usando le API disponibili. Non è garantita atomicità distribuita assoluta.

## 12. Working tree integrity e verdict

All'inizio l'unico file preesistente dirty era `test/shieldVfxRegression.test.js`, non tracciato; nessun file tracciato era modificato. Tutti gli altri file elencati sopra sono modifiche di questa tranche o estensioni condivise necessarie al workflow; nessun file preesistente è stato ripristinato o sovrascritto. Nessun revert, commit, bump di versione o normalizzazione estranea. Dist è rigenerata dalla build, non è un ripristino di baseline.

**ARCH-05B completato per i workflow protetti:** before e lavoro necessario sopravvivono al caller; i failure window post-commit dimostrati convergono attraverso restart e rimangono idempotenti. La chiusura è scoped, con i limiti espliciti sopra. Nessun intervento su ARCH-06.
