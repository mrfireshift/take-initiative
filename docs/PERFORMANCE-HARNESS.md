# Performance harness

Lo step 6 espone `npm.cmd run perf:harness`, un driver Node deterministico che
usa fixture sintetiche ma attraversa i percorsi runtime già presenti.

```powershell
npm.cmd run perf:harness
npm.cmd run perf:harness -- --json --seed take-initiative-step-6 --runs 2
npm.cmd run perf:harness -- --smoke --json
npm.cmd run perf:harness -- --json --output .\perf-result.json
```

Il default non crea file. `--output` è l’unica modalità che scrive un artefatto;
`--json` lascia stdout riservato al documento strutturato. Il processo fallisce
solo per errore del driver, correttezza non verificata, queue non stabilizzate,
contaminazione cross-scene reale o scritture Player non autorizzate; non esistono
soglie numeriche arbitrarie sui tempi.

## Percorso e isolamento

Il fake OBR in `test-support/performanceObr.js` conserva metadata scene/room,
item canonici, bounds, item locali, broadcast, selection, ruoli, listener e
lifecycle. Gli eventi item consegnano sempre lo snapshot completo e possono
essere duplicati o trattenuti da un gate controllato. Le scene A e B hanno gli
stessi item ID ma identità e actor profile differenti.

Ogni realm crea le proprie istanze di lifecycle, dispatcher, scheduler, queue,
cache e stato locale. Il driver monta:

- background GM persistente;
- tracker GM;
- tracker Player, che scrive soltanto output locali;
- popup mutante aperto, chiuso e riaperto on-demand.

Il percorso misurato è:

```text
fake SDK snapshot
  -> createSceneItemChangeDispatcher
  -> invalidation / subscriber
  -> effects queue o initiative render scheduler
  -> ActorVitals / History owner / mutation coordinator / state gateway
  -> scene-item-reconcile core / aura-zone planner / output locale
```

Sono riusati anche `createSceneItemBoundsCache`, `advanceInitiativeState`, i
planner aura/zone produttivi e il lifecycle adapter dello step 4. Gli hook del
collector sono opt-in nel fake e non aggiungono scritture, callback alternative
o cambi di ordering al codice produttivo.

## Scenario e metriche

Lo scenario completo è fisso a 40 token, 10 zone/aure, 100 projection,
100 movimenti, 100 modifiche HP, 30 Advance Turn, Player view attiva e switch
A→B. Sono registrati bootstrap cold e workload warm senza smontare i runtime.

Il JSON contiene schema, commit, Node, seed, configurazione, profili cold/warm,
metriche per fase e realm, chiamate SDK per metodo, richieste full/filtered/
ID-scoped, bounds e concorrenza, metadata, local operations, broadcast, fanout,
render full/incremental/stale, pass dei reconciler, queue depth, lifecycle,
cache/command-result e heap Node indicativo. Le durate usano il clock
controllato e riportano p50/p95/max dove applicabile. Reminder cache, map
movement cache e metriche browser-only sono dichiarati come non montati, non
stimati.

Long task, layout/paint, DOM reale, input latency e differenze multi-browser non
sono dichiarati misurati: richiedono un collector browser separato.

## Profilo spaziale dello step 7

Il report contiene anche `spatialTopology`, un profilo strutturale separato dal
percorso generale dello step 6. Confronta tre consumer indipendenti legacy
(`spell-aura`, `class-feature-aura`, `custom-aura`) con un unico servizio
background che condivide snapshot, generazione e cache bounds. Misura cold,
warm, movimento, modifica metadata, cambio griglia, scene switch, zero-aura e
recovery da bounds incompleti.

Nel fake OBR `getItemBounds(ids)` rispetta il contratto SDK e restituisce un
singolo `BoundingBox` aggregato. Il servizio effettua richieste singolo-ID per
conservare la semantica per-item: nel profilo condiviso i miss cold sono quindi
una volta per ID, non una richiesta bulk inventata e non tre volte per consumer.

Il report espone per fase letture item/metadata/grid, bounds calls, ID richiesti,
concorrenza, snapshot builds/cache hits/coalescing, incomplete/recovery e
assertion strutturali. Le static spell zones non sono montate nel nuovo profilo:
restano sul loro percorso/cache attuale perché hanno watchdog, queued metadata e
cleanup transaction-specific; il residuo è dichiarato invece di mescolare i
due ownership model.

Il profilo è Node/fake-OBR e non misura DOM, layout/paint o rete Owlbear reale.
## Profili mirati dello step 8
Lo step 8 aggiunge tre profili separati al medesimo harness. Sono profili
strutturali: contano le chiamate e i passaggi del codice produttivo, non
inventano tempi browser o soglie arbitrarie.

### `memoryInvalidation`

Attraversa `classifySceneItemChanges`,
`initiativeCardQuickActionMemoryEligibleItems` e
`initiativeCardQuickActionMemoryCandidates`. Copre 100 cambi HP numerici,
conditions, spells, `classFeatureState`, aggiunte CHARACTER legacy, cambi di
identità, HP diventato assente, profili completi/cancellati, actor profile,
duplicati, Player e scene switch.

Le metriche distinguono candidate quick-action e legacy HP, scansioni eseguite,
letture registry/Room, full o ID-scoped item reads, scritture, coalescing,
skipped, stale e violazioni Player. Nel caso dei 100 HP numerici il budget
osservato è: 0 quick-action hydration, 0 legacy hydration, 0 registry read
dovuta all'hydration, 0 Room HP read e 0 full scene read dovute all'autofill.

### `metadataFanout`

Usa `sceneMetadataKeyDigest`, `createSceneMetadataKeyWatcher` e il servizio
`createSpatialSceneSnapshotService`, con consumer rappresentativi per aura,
static zone ed effect reminder. History, chiavi estranee, state semanticamente
identico, item movement, effects, duplicati, mutazione più History e scene
switch sono conteggiati separatamente.

Per ogni consumer sono riportati eventi ricevuti/filtrati, richieste,
coalescing, pass avviati/completati, stale, recovery, generation e digest. Nel
profilo smoke History-only e state identico restano a zero pass; uno state reale
propaga la generation necessaria; la recovery forza un pass successivo e
converge senza essere bloccata dal dedup.

### `fullRenderSnapshot`

Usa `readFullRenderItemSnapshot` e `spellBoardTokenTrackerItems`. Verifica
snapshot completo valido, snapshot incompleto o stale, revision precedente,
scene switch, duplicati, board token add/remove, ID virtuali Lair/Paragon/Epic
e projection Player.

Il budget è esplicito: snapshot valido = 0 full e 0 filtered SDK reads; ogni
fallback = 1 full e 0 filtered; entries e board token ricevono lo stesso array
raw e la stessa generation. Il full render reale in `initiativeList.js` non
chiama più `getSpellBoardTokenItems` nel percorso completo.

### Baseline prima/dopo e attribuzione

La baseline generale ereditata dallo step 7 resta quella registrata sopra:
cold bootstrap 8 full `scene.items.getItems`, fase HP 104 letture item (2 full
e 102 ID-scoped), 10 full render committati e 4 incremental. La baseline
spatial resta 120/40 bounds cold, 3/1 movimento, 120/40 scene switch, 0/0
warm e 120/0 zero-aura (legacy/shared).

Il confronto mirato dello step 8 attribuisce invece i cambiamenti al provider
che li produce:

| Scenario | Prima | Dopo | Evidenza |
| --- | --- | --- | --- |
| 100 HP numerici | invalidazione memory ampia | 0 hydration e 0 Room/full read | `memoryInvalidation` |
| conditions/spells/classFeatureState | potevano entrare nel fanout memory | 0 candidate per entrambi i domini | `memoryInvalidation` |
| History-only metadata | invalidava metadata/reconcile globale | 0 revision/pass consumer | `metadataFanout` |
| state reale | fanout non key-scoped | una generation necessaria, con recovery | `metadataFanout` |
| full snapshot valido | doppio percorso item | 0 SDK read nuovo | `fullRenderSnapshot` |
| full fallback | full + filtered board read | 1 full, 0 filtered | `fullRenderSnapshot` |
| scene switch | rischio snapshot/ID stale | reset epoch e fallback coerente; spatial 40 bounds shared | harness generale + spatial |

Questi profili non misurano long task, layout/paint, input latency, DOM reale,
rete Owlbear o differenze multi-browser. Le static zones mantengono il loro
watchdog, recovery, cache e cleanup proprietari.

## Traceability release readiness

La rettifica di attribuzione della roadmap e': il profilo snapshot/bounds
spaziale dello Step 7 misura **GS-005**, non GS-007. GS-007 resta il finding
Paragon/state dello Step 5. I profili aggiunti allo Step 8 sono attribuiti a
GS-006 (`memoryInvalidation`), GS-008 (`metadataFanout`) e GS-009
(`fullRenderSnapshot`).

GS-010 e' **P2 aperto** e non viene dichiarato risolto dal harness: il driver
verifica i percorsi coordinati e il comportamento per client, ma non dimostra
un owner distribuito o la serializzazione globale dei writer diretti su
`classFeatureState`.
