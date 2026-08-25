# Canonical mutation hardening — feature freeze

## Perimetro e vincoli

Questo rapporto accompagna l'hardening repository-wide richiesto in modalita
**feature freeze / zero behavioral change**. Non sostituisce gli audit gia
chiusi e non modifica le decisioni di `ARCHITETTURA.md`, ARCH-002/003/004/005,
ARCH-006, ARCH-008 o `docs/archive/releases/ROADMAP-CLOSURE.md`.

Riferimenti riletti prima dell'inventory:

- `docs/ARCHITETTURA.md`;
- `docs/audits/GENERAL-STABILITY-PERFORMANCE-AUDIT.md`;
- `docs/archive/releases/ROADMAP-CLOSURE.md`;
- `docs/ARCH-002-METADATA-KEY-SCOPED.md`;
- `docs/ARCH-003-EFFECTS-MUTATION-COORDINATOR.md`;
- `docs/ARCH-004-EVENT-HUB-RENDER-SCHEDULER.md`;
- `docs/ARCH-005-HISTORY-OWNER.md` e
  `docs/ARCH-005-IDEMPOTENT-RECONCILERS.md`;
- `docs/ARCH-006-INITIATIVE-STATE-GATEWAY.md`;
- `docs/ARCH-008-SNAPSHOT-FANOUT.md`;
- gli audit specialistici di HP, spell, class feature, zone/aure, opzioni e
  runtime di classe pertinenti ai writer censiti.

Contratto verificato: un GM autorevole per scena. La lane background e
l'History Owner serializzano i realm del singolo client; client GM distinti
restano last-commit-wins come gia dichiarato in
`docs/archive/releases/ROADMAP-CLOSURE.md`.

## Baseline prima delle modifiche

| Controllo | Esito | Evidenza |
| --- | --- | --- |
| Worktree | PASS | `git status --short --branch` -> `main...origin/main`, nessuna modifica |
| Runtime | INFO | Node `v24.15.0`, npm `11.12.1` |
| Suite completa | BASELINE FAIL | avviata prima di modificare codice: import JSON senza attribute in alcuni test sotto Node 24; 4 failure riproducibili in `reminderResolutionBrokerReplay.test.js` |
| Test JSON isolati | BASELINE FAIL | `spellStaticZoneMovementUndoIntegration.test.js` e `spellTeleportCore.test.js`: `ERR_IMPORT_ATTRIBUTE_MISSING` su `src/initiative-cards.json` |
| Replay isolato | BASELINE FAIL | 4/8 failure, tutte preesistenti, negli scenari con risultato reminder `failed` |

Queste failure sono fuori dal perimetro di GS-010 e della decomposizione. Non
vengono corrette opportunisticamente; i test mirati e la build restano i gate
di ogni tranche, mentre il delta della suite completa viene confrontato con
questa baseline.

## Fase 1 — Canonical mutation audit

### Legenda

| Classificazione | Significato |
| --- | --- |
| `canonical` | owner/gateway previsto e writer effettivo coincidono |
| `legitimate direct` | writer diretto intenzionale, limitato al proprio campo o a un item posseduto |
| `legacy` | bootstrap/migrazione/fallback mantenuto per compatibilita |
| `duplicate` | piu superfici scrivono lo stesso campo, ma nello stesso contratto corrente |
| `unsafe` | writer concorrente o privo della protezione richiesta dall'invariante |

### Matrice dei writer

| Dominio / fonte canonica | Call path | Coordinator/gateway previsto | Writer effettivo e concorrenza | Expected / stale | History | Autorita | Classificazione |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Token metadata generico `.../meta` (`inInitiative`, `initiative`, `initTouched`, `attitude`) | context menu, toolbar tracker, editor iniziativa, group seed/backfill, faction configurator | nessun gateway generale; merge field-local sul draft SDK | `contextMenu.js`, `ctx-add.ts`, `ctx-mark.ts`, `faction-configurator.ts`, `initiativeList.js`; piu superfici UI, prevalentemente stesso tracker realm | callback `updateItems` legge il draft corrente; guard epoch nei flussi tracker/popup, non uniforme nei context embed storici | solo le azioni esplicitamente avvolte da `withItemMetaHistory`; seed/attitude/in-out non producono History | tracker edit GM; faction modal GM; alcune voci context si affidano alla visibilita/permessi OBR | `legitimate direct` + `duplicate` UI |
| HP canonici `meta.hp` / `meta.hpMax` | editor card, editor companion, group seed/delta, Quick HP, spell/reminder, Undo | effects lane per operazioni effects; writer HP manuale esistente per tracker/Quick HP | `initiativeList.js:updateHP/updateMultipleHP/trySeedGroupHP`, `quick-hp-modal.js`, `effectsMutations.js`, eccezione locale `spellAreaResolutionExecutor.js` | lane: epoch + queue + expected metadata patches; tracker: draft merge; multi-target: batch; spell area: transazione locale documentata | tracker/Quick HP usano History composita nei call path principali; effects lane genera `effectsMutation`; bootstrap no History | mutazioni UI GM; effects coordinator GM-only | `canonical` per lane; `legitimate direct` per HP manuale; eccezione spell area `legacy`/da non copiare |
| Cleanup condizioni su danno e zero HP | danno HP -> rimozione `endsOnDamage`; HP zero -> `condition:reconcile-zero-hp` | effects lane | `effectsMutations.js`, `hpConditionAutomation.js`; `initiativeList.js:updateHP` rimuove `endsOnDamage` nello stesso draft HP | coordinator per zero HP; atomicita draft locale per inline HP | inclusa nella stessa entry HP/effects quando il caller usa History | GM | `canonical`; blocco inline HP `legitimate direct` storico |
| Conditions `meta.conditions` | modal, context menu, tracker, automazioni, aura/zone membership, spell/class feature | `runEffectsMutation` e operation builders | `conditions.js`, `conditionApplicationExecutor.js`, `conditionAutomation.js`, `ctx-conditions.ts`, `ctx-remove-condition.ts`, `effects-modal.ts`, controller aura/zone e tracker chiamano la lane; item pill/label sono derivati | queue background, scene identity/epoch, planner al queue head, commit unico; reconcile idempotente per visual | entry effects field-scoped; automatic reconcile puo usare `history:false` dove gia previsto | coordinator montato solo GM; view Player read-only | `canonical` |
| Spell instances `meta[.../spells]` | unified panel, application/area/active executor, tracker terminate/clear, expiry | `runEffectsMutation` / `spells.js` facade | `spells.js`, `spellApplicationExecutor.js`, `spellAreaResolutionExecutor.js`, `initiativeList.js`, `reminderResolution.js` convergono nella lane | scene identity/epoch, parent/instance identity, state-dependent removal, queue | unica entry effects per comando; Undo condiviso | GM background | `canonical` |
| Concentration `meta[.../concentration]` | cast, break, replacement, HP warning, tracker clear, class feature che rompe concentrazione | `runEffectsMutation` | `spells.js`, spell executors, `initiativeList.js`, `classFeatureRuntime.js`, reminder resolution | queue, identity, stale prepared spell, side-effect retry per zone | entry effects condivisa; nessun History locale parallelo | GM background | `canonical` |
| `meta.classFeatureState` — activation generale | scheda/context -> `activateClassFeature` -> planner -> metadata patch | effects lane con expected field-scoped | `classFeatureRuntime.js:activateClassFeature` usa `runEffectsMutation`; concorre con resource/cleanup diretti pre-GS-010 | expected sull'intero campo `classFeatureState`, scene epoch per activation | effects History atomica con condizioni/HP temp/concentrazione | coordinator GM-only; UI GM | `canonical` ma esposto ai writer GS-010 |
| `meta.classFeatureState` — termination | tracker/scheda -> `deactivateClassFeature` -> condition cleanup + patch | effects lane con expected field-scoped | `classFeatureRuntime.js:deactivateClassFeature` | expected sull'intero campo; rimozione condizioni e Frenesia nello stesso comando | unica entry `Capacita terminata` | GM | `canonical` ma esposto ai writer GS-010 |
| `meta.classFeatureState` — post condition removal | effects planner rileva condizioni class feature rimosse -> reconciliation | stessa prepare della effects lane | `reconcileClassFeatureActivationsAfterConditionRemoval` produce dettagli; `effectsMutations.js:mergeClassFeatureReconciliation` possiede il commit | calcolo sullo snapshot del queue head, stale guard, commit unico | confluisce nell'entry della rimozione originaria | GM background | `canonical` |
| `meta.classFeatureState` — Lay on Hands | scheda -> `applyLayOnHandsResolved` -> History wrapper + direct `updateItems` stato/HP | dovrebbe usare effects lane | writer diretto `classFeatureRuntime.js`; concorre con activation/end/aura | nessun expected esplicito pre-GS-010; solo draft callback | `withItemMetaHistory`, separato dalla lane | UI GM, nessun owner background | `unsafe` (GS-010) |
| `meta.classFeatureState` — slot temporaneo / conversione / special refresh | Fonte di Magia e Ripristino -> planner -> direct `updateItems` | dovrebbe usare effects lane | tre writer diretti in `classFeatureRuntime.js` | nessun expected esplicito pre-GS-010 | `withItemMetaHistory` | UI GM | `unsafe` (GS-010) |
| `meta.classFeatureState` — adjustment/reset risorse | viewer/context -> `adjustClassFeatureResource` / `resetClassFeatureResources` | dovrebbe usare effects lane | due writer diretti in `classFeatureRuntime.js`; stesso oggetto annidato di instances/resources | draft callback locale, nessuna serializzazione cross-realm | `withItemMetaHistory` | UI GM | `unsafe` (GS-010) |
| `meta.classFeatureState` — aura suppression cleanup | aura reconcile -> `clearStaleSuppressions` | dovrebbe usare effects lane | direct `updateItems` in `classFeatureAuraController.js`, concorrente con resource/activation/end | epoch/snapshot guard esterna, nessun expected sul campo | `withItemMetaHistory` | controller background GM | `unsafe` (GS-010) |
| Initiative card token `meta.initiativeCard` e `actorProfileId` | card modal save/remove -> room registry -> token reconcile | effects lane per token; `initiativeCards.js` owner room key | `writeTokenProfile/removeTokenProfile` usano metadata patch + exhaustion operation; migration e registry-stamp usano direct merge | lifecycle `isCurrent`, scene identity/command ID nel save; queue room key; migration guard | token save produce effects History; migration/sync tecnico no History | save UI GM; hydration/migration GM-gated | `canonical`; migration/stamp `legacy`/`legitimate direct` |
| Initiative card registry room `.../initiativeCards` | save/hydrate/sync | key-scoped owner `initiativeCards.js` | `updateRoomCards` con coda locale e fallback localStorage | `isCurrent`, queue, room byte budget | non e History di combattimento | GM per mutation produttive | `canonical` |
| Boss token state `meta.legendary`, `legendaryResistances`, `paragon`, `epic` | context menu e card tracker; reset legendary a inizio turno | nessun token-meta gateway generale; Paragon usa executor intention-based | `contextMenu.js` e `initiativeList.js` sono writer duplicati; `paragonToggleExecutor` ha read-back e cleanup state | Paragon: role, intent, read-back, epoch; Legendary/Epic: draft merge; tracker: epoch | nessuna History | tracker GM; Paragon esplicitamente GM; alcune voci Legendary/Epic non dichiarano `roles:[GM]` nel filtro e si affidano ai permessi OBR | Paragon `canonical`; altri `legitimate direct` + `duplicate`; authority gap da documentare, non corretto in questa tranche |
| Initiative scene state `.../state` | navigation, seed/collapse, reset, lair/paragon, context cleanup | `initiativeStateGateway.js` | unico writer produttivo della chiave: `writeSceneMetadataKey` dentro il gateway; `initiativeList.js:setSceneState` e context Paragon inviano reducer/patch | queue, GM gate, epoch/identity, owned fields, command dedup, read-back | non usa History Undo; e stato globale del tracker | GM | `canonical` |
| History scene `.../history` | `withItemMetaHistory`, effects coordinator, movement watcher, Undo cleanup | `historyOwner.js` | unico writer della chiave: `historyOwner` via `writeSceneMetadataKey`; producer in `history.js` e effects lane usano il broker | owner queue per client, entry ID/dedup, epoch/readiness, retry; multi-GM resta LWW per contratto | e la fonte canonica Undo; Combat Log resta separato | owner GM per mutation; view modal read | `canonical` nel contratto single-GM |
| ActorVitals room `.../actorVitals` | token HP event -> store; baseline/new-link hydration room -> token | key-scoped owner `actorVitalsStore.js` | room writer seriale; token hydration diretta e limitata | GM-only, epoch, source revision, primary actor, expected HP live e doppia rilettura | bootstrap/snapshot tecnico, no History | Player cache read-only; GM writer | room `canonical`; token hydration `legitimate direct` |
| hpMemory room `.../hpMemory` | token remove/change -> fallback; scene token senza HP -> autofill | key-scoped owner `hpMemory.js` | room queue + local fallback; token hydration diretta | GM gate, epoch, busy guard, candidate scoping; applica solo se HP assenti e senza `actorProfileId` | bootstrap legacy, no History | Player non idrata token | `legacy` intenzionale |
| AoE area item `.../aoeArea` | tool placement/style -> add/update area + geometry | owner del tipo item `aoeTargetTool.js` | direct add/update di item posseduti per metadata identity | tool lifecycle; item identity/parentId | non History | tool GM | `legitimate direct` |
| Static spell zone item `.../spellStaticZone` | area executor / coordinator side effects -> root/subzone/child; reconciler -> cleanup/follow/triggerRuntime | geometry owner `spellStaticZone.js`; transazioni collegate nella effects lane | item add/delete/update diretti del reconciler; topology transazionale anche tramite side effects coordinati | epoch, instance/caster/source identity, owned-item reconcile, recovery/retry | quando parte da mutation, side effect e History sono collegati; reconcile automatico no entry autonoma | GM controller | `canonical` per item posseduti |
| Spell aura item `.../spellAura` | spell instance canonica -> aura reconcile | `spellAuraController.js` + idempotent reconciler | add/update/delete visual diretto; membership condition passa dalla effects lane | spatial generation, epoch, owned identity, read-back/recovery | visual no History; effects secondo lane | GM controller | `canonical` derivato |
| Class feature aura item `.../classFeatureAura` | class feature instance canonica -> aura reconcile | `classFeatureAuraController.js` + idempotent reconciler | visual add/update/delete diretto; membership condition nella lane; suppression token direct pre-GS-010 | spatial generation/epoch per visual; suppression senza expected pre-GS-010 | visual no History; suppression aveva History locale | visual `canonical`; suppression `unsafe` (GS-010) |
| Custom aura config `meta.customAuras` e item `.../customAura` | GM modal -> token config; controller -> visual/membership | modal per config, aura reconciler per item, effects lane per conditions | config token direct merge; visual direct owned; membership lane | popup lifecycle + GM gate; spatial generation/epoch e identity nel controller | config/visual no History; automatic membership `history:false` | GM | `legitimate direct` per config/item; membership `canonical` |

### Verifica contro gli invarianti documentati

| Invariante | Esito Fase 1 | Evidenza |
| --- | --- | --- |
| `.../meta` e `.../state` non cambiano | conforme | costanti e ownership coincidono con `ARCHITETTURA.md` |
| merge metadata, mai replacement globale | conforme nei writer censiti | i callback ricostruiscono `item.metadata` e `meta` preservando campi estranei; la lane applica solo field descriptor |
| HP solo `meta.hp`/`meta.hpMax` | conforme | nessun campo HP alternativo produttivo; map bars restano derivate |
| state iniziativa con owner unico | conforme | unico `writeSceneMetadataKey` produttivo per `.../state` in `initiativeStateGateway.js` |
| conditions/spells/concentration nella effects lane | conforme | facade e superfici convergono su `runEffectsMutation`; le scritture visuali riguardano item derivati |
| History con owner unico | conforme al single-GM | unico writer chiave in `historyOwner.js`; limite multi-GM invariato |
| actorVitals non sovrascrive HP live piu recenti | conforme | hydration expected/live read e token->room su cambiamento canonico |
| reconcilers possiedono solo item derivati/identity-scoped | conforme | spell/class/custom aura e static zone filtrano la propria metadata key e usano epoch/generation |
| `classFeatureState` ha owner unico | **non conforme** | sei famiglie dirette restano fuori lane; corrisponde esattamente a GS-010 |

### Decisione di intervento dopo l'inventory

L'unico cambiamento di ownership autorizzato in Fase 2 e la migrazione delle
famiglie GS-010 alla lane `runEffectsMutation`. I planner, lo schema
`classFeatureState`, le chiavi metadata, i controller, l'History Owner e il
contratto single-GM restano invariati. Gli altri gap osservati (per esempio la
visibilita non uniformemente GM delle voci boss storiche e le failure baseline
Node 24/replay) restano finding separati e non vengono corretti durante il
refactor.

## Report incrementale

| Finding | Evidenza | Modifica | Test | Rischio regressione | Esito |
| --- | --- | --- | --- | --- | --- |
| CM-001 — GS-010 ownership divisa | writer diretti in `classFeatureRuntime.js` e `classFeatureAuraController.js` | operazioni state-dependent nella effects lane esistente | 7 test planner/coordinator nuovi + contract | medio-alto: stato runtime condiviso con risorse/istanze/suppression | chiuso; test concorrenti verdi |
| CM-002 — baseline Node 24 | `ERR_IMPORT_ATTRIBUTE_MISSING` su `initiative-cards.json` | nessuna, fuori scope | due file isolati | nessun delta introdotto | baseline documentata |
| CM-003 — baseline reminder replay | 4/8 failure isolate nei casi `failed` | nessuna, fuori scope | `reminderResolutionBrokerReplay.test.js` | nessun delta introdotto | baseline documentata |
| CM-004 — decomposition `initiativeList.js` | composition module da 11.040 LOC | inventory + graph; estratto solo il fallback chip DOM | 3 characterization test pre/post | basso per la tranche; alto per i blocchi esclusi | tranche sicura completata, 10.933 LOC residue |
| CM-005 — writer alternativo nello stesso comando | metadata patch manuale e state operation potrebbero competere | conflict `duplicate-class-feature-state-writer` | test no-commit/no-History | basso | chiuso |
| CM-006 — full harness actorVitals | `noStaleActorVitalsOverwrite` in due run full; smoke verde | nessuna, dominio non modificato | full + smoke harness | finding reale fuori refactor | documentato separatamente |

## Fase 2 — Chiusura GS-010

GS-010 viene chiuso estendendo il vocabolario serializzabile della mutation
lane esistente. Non e stato introdotto un coordinator alternativo:
`effectsMutations.js` continua a possedere prepare, commit, stale protection e
History. Il nuovo `classFeatureStateMutationCore.js` e un planner puro chiamato
alla testa della stessa coda.

| Famiglia | Prima | Dopo | Precondizione/concorrenza | History |
| --- | --- | --- | --- | --- |
| adjustment / conversione slot | `withItemMetaHistory` + `updateItems` diretto | `class-feature:adjust-resource` | calcolo sullo snapshot corrente del queue head; patch `classFeatureState` con expected originale | stessa entry effects, field-scoped |
| reset risorse | writer diretto | `class-feature:reset-resources` | reset composto sullo stato piu recente | una entry, nessuna scrittura parziale |
| special refresh | writer diretto | `class-feature:special-refresh` | conflitto esplicito se il refresh non e disponibile | nessuna entry sui no-op, come prima |
| Lay on Hands | writer diretto composito stato+HP | activation state operation + HP patch nello stesso comando | expected `hp` e assert `hpMax`; consumo e cura sono atomici | una entry composita |
| slot temporaneo / Tocco Purificatore | writer diretto o patch pianificata prima della coda | `class-feature:activate-state` nella stessa mutation spell | activation ricalcolata al queue head; conflitto esplicito sulla risorsa; la semantica esistente del target spell mancante resta invariata | una entry condivisa |
| aura suppression cleanup | writer diretto del controller | `class-feature:clear-stale-suppressions` | composizione per source/instance/target sullo snapshot corrente; guard epoch/spatial prima dell'invio e dopo l'esito, più scene identity/epoch della lane | entry effects solo se cambia lo stato |
| activation/deactivation generale | gia nella lane | invariato | expected whole-field esplicito gia presente; i conflitti restano espliciti | invariata |
| reconcile dopo condition removal | gia nella prepare della lane | invariato | snapshot proiettato e stale guard gia canonici | invariata |

Test di concorrenza aggiunti:

- adjustment + activation concorrenti: risultato uguale alla composizione
  sequenziale single-GM e due entry History coerenti;
- activation + aura cleanup concorrenti: instances, risorsa e suppression sono
  tutte preservate;
- activation + patch HP stale: conflitto senza commit, History o partial write;
- due activation concorrenti sull'ultima risorsa: una applicata, la seconda in
  conflitto `resource-empty`, senza consumo parziale.

## Fase 3 — Inventory di `initiativeList.js`

Baseline: 11.040 righe. Il file e un composition module gia appoggiato a core
estratti (scheduler, temporal lane, state gateway, snapshot fanout, menu action
core, rendering incrementale, dirty set). L'inventory non riapre queste
decisioni.

| Famiglia di responsabilita | Dipendenze e stato mutabile | Lifecycle / comportamento osservabile | Rischio estrazione |
| --- | --- | --- | --- |
| bootstrap, capability imports e option lifecycle | molti controller, `IS_GM`, optional runtimes | mount/unmount unico del tracker | alto |
| fallback chip condizioni/spell | DOM, `buildConditionChips`, `getEffectiveConditionInstances`, `spellColorFor`; nessuno stato mutabile | ordine cap, conteggio istanze, fallback silenzioso e stile pill | basso |
| epoch/readiness/diagnostica | scene lifecycle, localStorage, diagnostic ring | invalida lavoro stale e resetta editor/runtime | critico |
| temporal turn lane | state gateway, spell/condition tick, turn notice | sequenza round/turn, revision e scene identity | critico |
| toolbar e layout classic/compact | DOM persistente, opzioni, popover state | controlli, focus, responsive layout | medio-alto |
| movement controls | speed-check runtime e stato DOM | modalita, stepper, indicatori attivi | alto |
| active-turn label | attachment item, cache, pump/revision | label map, anchor virtuale, geometry e retry | critico |
| navigation/select/focus | desired queues, revision, viewport timers | ordine, stale filtering, virtual IDs | critico |
| scene item -> tracker entry | token meta, cataloghi, class feature/spell projections, `IS_GM`, round globale | forma delle card e dati visibili | alto |
| tracker selection sync | OBR selection, anchor locale, group members | selezione map/card bidirezionale | alto |
| group seed/name/HP sync | metadata token, labels, hpMemory, map HP bars | bootstrap gruppi, merge metadata, HP canonici | critico |
| concentration warning host | cross-realm scope, popup session, queue | dedup, dismiss/Undo e generation guard | critico |
| inline initiative/HP editors | dirty set, render lock, key handlers | preservazione editor durante render | critico |
| initiative fill workflow | selection, scene events, popup/editor focus | sequenza guidata di compilazione | alto |
| boss resource controls | token meta e state gateway | Paragon/Legendary UI e reset turno | alto |
| tracker popover/context/quick actions | popup revisions, menu action core | routing e pressed state | medio-alto |
| card rendering classic/compact | DOM, conditions/spells/features, editor binders | markup/stili/azioni osservabili | alto |
| incremental/full render e FLIP | scheduler, dirty set, cached entries, transition state | equivalenza full/incremental, editor guards | critico |
| metadata/item subscriptions e mount root | event hub, snapshot, scheduler, digest | fanout, coalescing e teardown | critico |

### Extraction graph proposto

```text
initiativeList.js (composition/orchestration root)
├─ initiativeChipFallback.js          [tranche A: DOM-only, characterization]
├─ initiativeEntryProjectionCore.js   [futura: richiede rimozione delle letture globali]
├─ initiativeToolbarRuntime.js        [futura: dipende da layout + popover lifecycle]
├─ initiativeSelectionRuntime.js      [futura: dipende da group projection + OBR selection]
├─ initiativeConcentrationHost.js     [futura: confine cross-realm autonomo ma critico]
├─ initiativeCardRenderRuntime.js     [futura: solo dopo test DOM card completi]
└─ render/navigation/temporal/HP       [non candidati in questo passaggio]
```

Ordine autorizzato in feature freeze: soltanto la tranche A e, dopo test/build,
eventuali ulteriori blocchi a basso rischio. Non si estraggono in questo
passaggio active turn, navigation, HP/map bars, temporal lane, full/incremental
render o inline editor guards.

### Tranche A eseguita

Il blocco `__styleChip` / `__spellKey` / `__spellColor` /
`__buildConditionChipsSafe` e stato spostato senza rinominare le funzioni in
`initiativeChipFallback.js`. Prima dell'estrazione tre characterization test
hanno fissato:

- ordine whitelist e raggruppamento `xN` delle istanze;
- stile compact/non-compact, flag extra e custom legacy;
- delega al renderer canonico e fallback soltanto in caso di eccezione.

Gli stessi tre test e la build sono passati dopo l'estrazione. Nessuno stato
mutabile, listener, timer o lifecycle e uscito dal composition root.

## Fase 4 — Repository invariant verification

### Invarianti dopo le modifiche

| Invariante | Evidenza finale | Esito |
| --- | --- | --- |
| fonte canonica per dominio | mutation map Fase 1 + source scan finale | PASS; nessuna chiave o fonte canonica cambiata |
| nessun writer alternativo | `classFeatureRuntime` e aura controller emettono operazioni; l'unico assignment residuo nel runtime e nel planner puro di reconciliation, committato da `effectsMutations` | PASS |
| metadata merge semantics | `applyMetadataPatchesToPlan` e commit field-scoped invariati; class state usa un descriptor `mode:set` con expected dello snapshot queue-head | PASS |
| lifecycle/epoch/stale guard | coordinator background, scene identity e controller spatial guard invariati; 170/170 test invariant pack | PASS |
| History/Undo atomicita e ownership | coordinator registra dopo commit; stale HP annulla l'intero piano; `historyOwnerInventory` e stabilization suite verdi | PASS nel contratto single-GM |
| GM/Player authority | nessuna modifica a mount, role gate o projection; operazioni nuove usano lo stesso coordinator GM background | PASS |
| full/incremental render | estrazione limitata al fallback chip; scheduler, dirty set, editor guards e render functions intatti; test render verdi | PASS |
| spell/class feature/zone/aura reconciliation | test coordinator, class aura integration, spell aura/static zone core e Undo verdi nel pack mirato | PASS |
| nessun framework parallelo | un solo `createEffectsMutationCoordinator`; il nuovo modulo e un planner puro chiamato da `prepareEffectsMutation` | PASS |

### Verifiche eseguite

| Comando / gate | Esito |
| --- | --- |
| invariant pack mirato | PASS, 170/170 |
| suite completa Node 24 | 2.347 test: 2.322 pass, 25 failure gia presenti o estranee ai file modificati; nessuna failure nei nuovi test |
| `audit:class-features` | PASS, 860 mechanics, 0 token marker runtime gap |
| `audit:barbaro` | PASS, 68 feature |
| `audit:spells` | PASS, 477 catalog, 0 integration disconnected |
| `check:spells` | PASS |
| performance smoke | PASS, correctness completa |
| performance full, due run | FAIL `noStaleActorVitalsOverwrite`; finding separato, `actorVitalsStore` non modificato |
| build finale | PASS, 445 moduli; solo warning dimensionale noto |
| `verify:version` / `verify:dist` | PASS, versione 1.3.0 sincronizzata |
| `npm ls --depth=0` | PASS, SDK 3.1.0 e Vite 7.1.3 |
| `git diff --check` | PASS; soli warning EOL del worktree Windows |

### Finding separati non corretti

I seguenti problemi non sono necessari alla chiusura GS-010 o all'estrazione
behavior-preserving e quindi non sono stati modificati:

1. Node 24 richiede import attributes per `initiative-cards.json`; dieci file
   di integrazione terminano a livello modulo per questo motivo.
2. I replay reminder/concentration che includono un esito `failed` ritornano
   `failed` invece di `applied`; lo stesso difetto compare nei quattro casi del
   broker replay gia isolati nella baseline.
3. Tre source-contract test sono fuori sincronia con sorgenti non modificate
   (firma `showConcentrationWarnings`, marker turn notice, forma della
   destination projection).
4. `effectsMutationStaticZoneEpoch` TEST 6 non osserva il delete atteso; il
   path classFeature nuovo e vuoto per quel comando e non e stato corretto.
5. Il full performance harness fallisce `noStaleActorVitalsOverwrite`, mentre
   lo smoke e verde; nessun file actorVitals/hpMemory e stato modificato.
