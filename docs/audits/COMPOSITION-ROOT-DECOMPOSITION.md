# Controlled composition-root decomposition

Data: 23 agosto 2026

Baseline di partenza dichiarata: 2.429/2.429 test, invariant pack 170/170,
performance, audit, build e dist verdi. Il worktree e condiviso e durante la
tranche conteneva ulteriori test e modifiche estranee; nessun file estraneo e
stato ripristinato o sovrascritto.

## Perimetro

Questa tranche continua il graph e l'inventory gia approvati in
`CANONICAL-MUTATION-HARDENING.md`. Non ripete l'audit repository-wide e non
riapre le decisioni ARCH-002/003/004/005/006/008.

Vincoli applicati:

- feature freeze e zero behavioral change intenzionale;
- nessun nuovo writer, metadata schema, event bus, coordinator, cache o
  service locator;
- estrazione solo di famiglie intere con boundary verificabile;
- ownership di lifecycle, epoch, History, render scheduler e stato canonico
  invariata;
- LOC usate soltanto come misura descrittiva.

## Extraction graph di partenza e stato finale

Il graph iniziale gia documentato era:

```text
initiativeList.js (composition/orchestration root)
|- initiativeChipFallback.js          [gia estratto]
|- initiativeEntryProjectionCore.js   [futuro, dipendenze globali]
|- initiativeToolbarRuntime.js         [futuro, layout + popup lifecycle]
|- initiativeSelectionRuntime.js       [futuro, selection + OBR]
|- initiativeConcentrationHost.js      [futuro, cross-realm critico]
|- initiativeCardRenderRuntime.js      [futuro, richiede test DOM completi]
`- render/navigation/temporal/HP       [non candidati]
```

La tranche ha raffinato il graph separando dai runtime ad alto rischio tre
sottofamiglie pure o DOM-only:

```text
initiativeList.js (composition/orchestration root)
|- initiativeChipFallback.js               [preesistente]
|- initiativeToolbar.js                    [preesistente; root orchestra]
|- initiativeSelectionProjectionCore.js    [nuovo: identity/projection pura]
|- initiativeMovementPresentation.js       [nuovo: formatter + stepper DOM]
|- initiativeChipOverflow.js               [nuovo: overflow + reference binding]
|- initiativeCardClassicBuilder.js         [preesistente]
|- initiativeCardCompact.js                [preesistente]
`- runtime fragili rimasti nel root
   |- tracker selection subscription/polling
   |- popup/context-menu lifecycle
   |- concentration cross-realm host
   |- card reconciliation e FLIP
   |- HP/editor/render synchronization
   |- initiative state/turn/scene lifecycle
   `- reconciliation e event processing
```

## Metodo per famiglia

Ogni modulo nuovo e stato prima aggiunto senza collegarlo al root. I test hanno
quindi fissato il comportamento mentre le funzioni originali erano ancora il
path produttivo. Solo dopo il pass dei characterization test il blocco locale e
stato sostituito con import diretti, senza wrapper intermedi.

## Estrazioni effettuate

### CRD-001 — Virtual entry identity e selection projection

Comportamento osservabile:

- ID Lair esatto `__LAIR__`;
- prefisso Epic `__EPIC__`;
- parsing permissivo Paragon `<baseId>::p<k>` con indice non negativo;
- proiezione dei membri di gruppo su ID token reali, deduplicati e nello stesso
  ordine, escludendo Lair, Epic e valori vuoti.

Dipendenze e stato:

- input: soli ID e `entry.__groupMembers`;
- mutable state, DOM, timer, listener, OBR, metadata, History e authority:
  nessuno;
- lifecycle/reset: stateless, valori ricalcolati a ogni chiamata.

Modifica: costanti e funzioni spostate in
`initiativeSelectionProjectionCore.js`; il root importa alias compatibili con
`LAIR_ID`, `EPIC_ACT_PREFIX` e `__selectionIdsForEntry`. Tutti i call site sono
rimasti invariati.

Test: tre characterization nuovi piu `initiativeOrderCore` e
`lateEpochCaptureRegression`, 28/28 prima e dopo il collegamento.

### CRD-002 — Movement presentation

Comportamento osservabile:

- numeri nel locale italiano con massimo un decimale;
- testo readout classic e compact identico;
- stepper con ordine `-`, valore, `+`, stessi stili, stop propagation e ordine
  callback.

Dipendenze e stato:

- `document.createElement`, reso esplicito come `documentRef` opzionale;
- callback `onDecrease`/`onIncrease`, che restano possedute dal root e
  continuano a chiamare SpeedCheck nello stesso ordine;
- mutable state: soltanto testo/stile/listener dei nodi restituiti;
- nessun accesso a snapshot SpeedCheck, scena, metadata o authority nel nuovo
  modulo;
- lifecycle: i listener vivono quanto i nodi creati per il mount tracker.

Modifica: `makeMovementStepper`, `movementNumber` e
`movementReadoutSummary` spostati in `initiativeMovementPresentation.js`. Il
root mantiene subscription, menu mode, snapshot e layout; il layout compact e
ora passato esplicitamente al formatter nel call site che prima lo leggeva dal
default implicito.

Test: tre characterization nuovi; pack movimento/toolbar/sizing 16/16 dopo il
collegamento. La prima aspettativa di grouping `1234,6` e stata corretta prima
dell'estrazione per riflettere il runtime `it-IT`; il formatter produttivo non
e stato cambiato.

### CRD-003 — Chip overflow e reference interaction

Comportamento osservabile:

- precedenza alle chip esplicite e fallback sui leaf `span`/`div` non vuoti;
- una riga fino al limite, due righe oltre il limite;
- toggle `+N` / meno, attributi ARIA, label, colori e stop propagation;
- binding click, Enter e Space all'Enciclopedia DM, con ruolo `group` se la
  chip contiene un pulsante;
- stesso z-index del parent tracker durante il ciclo corrente.

Dipendenze e stato:

- import espliciti `CHIP_GAP_PX` e `openReferencePopover`;
- `documentRef` opzionale per la creazione DOM;
- mutable state: booleano `expanded` e nodi nella singola closure del toggle;
- listener: click sul toggle, click/keydown sulle chip reference;
- timer, OBR subscriptions, stato canonico, metadata e authority: nessuno;
- lifecycle: listener e closure vengono eliminati insieme alla card DOM; non
  esiste cleanup esterno da trasferire.

Modifica: l'intero blocco `styleChipPill` / raccolta / mount / reference bind e
stato spostato in `initiativeChipOverflow.js`. Il builder classico e la card
compatta ricevono gli stessi riferimenti funzione di prima.

Test: quattro characterization nuovi; pack chip/classic/compact 44/44 dopo il
collegamento.

## Module-state ownership map

| Stato | Owner / writer | Reader | Lifecycle e reset | Esito tranche |
| --- | --- | --- | --- | --- |
| costanti Lair/Epic e parsing Paragon | `initiativeSelectionProjectionCore.js`, immutabile | root, selection/card/popup/navigation | durata modulo; nessun reset | ownership resa esplicita |
| selection projection di gruppo | funzione pura nel nuovo core | root e classic builder tramite dependency esistente | calcolo per chiamata | estratta |
| `expanded` overflow chip | singola closure in `initiativeChipOverflow.js` | click handler della stessa chip | durata card DOM | estratta senza duplicazione |
| nodi stepper movimento | `initiativeMovementPresentation.js` li crea; root aggiorna il value | root SpeedCheck UI | durata del mount tracker | builder estratto, stato runtime nel root |
| `latestMovementSnapshot`, `movementReadoutVisible` | subscription SpeedCheck nel root | layout e active-card indicator | page/mount lifetime corrente | non spostato |
| `movementDetailsOpen`, `movementModeMenuOpen` | click/key/document handlers nel root | movement menu/layout | page/mount lifetime corrente | non spostato |
| `__selectedSceneItemIds`, selection anchor e poll busy | tracker selection runtime nel root | card selection visuals/context scope | reset su scene runtime; subscription/poll page lifetime | non spostato |
| `__trackerLayout`, `IS_GM` | root/options lifecycle | toolbar, movimento, render | tracker/page lifetime | non spostato |
| editor locks e dirty set | root/editor runtime | incremental/full renderer | reset scena/editor close | non spostato |
| navigation, temporal lane, active-label state | root e core architetturali esistenti | turn orchestration/render | scene epoch reset + teardown esistente | non spostato |
| concentration queue/generation/session | concentration host nel root | warning popup/replay | scene reset, remount e History causal ID | non spostato |

Nessun nuovo stato e una copia di dati canonici. I nuovi moduli non leggono ne
scrivono `.../meta`, `.../state`, History, actorVitals, hpMemory, zone o aura.

## Lifecycle e subscription map

| Famiglia | Listener / subscription | Cleanup corrente | Decisione |
| --- | --- | --- | --- |
| selection projection core | nessuno | non necessario | estratta |
| movement presentation | due click listener sui pulsanti creati | rimozione dei nodi col tracker | estratta |
| chip overflow | click sul toggle; click/keydown reference | rimozione della card DOM | estratta |
| movement runtime | `subscribeSpeedCheckState`, document click, menu key/click | page-lifetime del tracker corrente | resta nel root |
| tracker selection runtime | `OBR.player.onChange` + poll interval 1.500 ms | page-lifetime; reset dei valori su scene reset | resta nel root |
| context/quick-action popover | broadcast listener, request context e scene epoch | close/reset nei path gia esistenti | resta nel root |
| concentration host | broadcast listener, generation/session queue | `__resetConcentrationWarningRuntime` | resta nel root |
| scene/render/HP/aura/zone | event hub, scheduler, optional runtimes | scene epoch/unmount owner esistenti | fuori perimetro |

## Candidati rifiutati o rinviati

| Candidato | Motivo |
| --- | --- |
| intero `initiativeEntryProjectionCore` | `entryFromSceneItem` intreccia token meta canonici, card registry, spell/class feature projection, GM visibility e cache build; estrarlo ora richiederebbe un dependency bag esteso |
| tracker selection runtime | possiede OBR subscription, polling, selection anchor, DOM card state, range selection e scene reset; serve prima un contratto di teardown caratterizzato |
| movement mode/runtime completo | possiede snapshot mutabile, subscription SpeedCheck, document listener, focus e layout classic/compact; spostarlo creerebbe un controller nuovo |
| toolbar runtime residuo | il modulo presentation esiste gia; i wrapper residui legano `IS_GM`, layout, BASE_URL, popup e control placement. Ulteriore estrazione sarebbe pass-through architecture |
| popup/context menu | scene epoch, stored payload, request ID, OBR listeners, GM authority e mutation lane sono un unico lifecycle fragile |
| concentration host | cross-realm scope, History causal ID, replay, generation e session ownership non sono separabili senza ridisegno |
| card render/reconcile/FLIP | legge editor locks, selection state, `HTMLElement`, full/incremental render, transition coalescing e mutable animation state |
| HP/editor synchronization | modifica HP canonici, History, hpMemory e map/card visuals; esclusa esplicitamente |
| initiative fill, state reconcile, events e scene lifecycle | authority, epoch, gateway, queue e render scheduler; esclusi esplicitamente |
| Legendary resource presentation | il builder DOM e gia in `initiativeCardBossClassic.js`; nel root restano binding ai writer e a `IS_GM`, quindi un altro modulo sarebbe soltanto un wrapper |

## Finding separati non corretti

1. Il toggle overflow legge lo z-index corrente a ogni click; dopo una prima
   espansione, la compressione conserva `30` invece del valore originario. Il
   comportamento e stato caratterizzato e preservato, non corretto durante il
   refactor.
2. Tracker selection usa una subscription OBR e un poll interval page-lifetime
   senza un teardown locale autonomo. Il composition root corrente vive quanto
   l'action iframe; introdurre ora un nuovo unmount contract sarebbe una
   modifica architetturale non necessaria.
3. La subscription `subscribeSpeedCheckState` appartiene allo stesso lifecycle
   page-lifetime. Non e stata spostata insieme ai soli helper di presentazione.

## LOC descrittive

| Artefatto | Inizio tranche | Fine tranche |
| --- | ---: | ---: |
| `src/initiativeList.js` | 10.939 | 10.715 |
| nuovi moduli estratti | 0 | 257 |
| nuovi characterization test | 0 | 10 casi |

La riduzione netta del root e 224 righe. L'aumento complessivo dovuto a moduli
espliciti e test e intenzionale; non e stata inseguita una soglia LOC.

## Verifica incrementale e invarianti

| Tranche | Focus test | Full suite | Performance smoke | Build | Diff check |
| --- | ---: | ---: | ---: | ---: | ---: |
| CRD-001 selection projection | 28/28 | 2.466/2.466 | PASS | 448 moduli, PASS | PASS |
| CRD-002 movement presentation | 16/16 | 2.469/2.469 | PASS | 449 moduli, PASS | PASS |
| CRD-003 chip overflow | 44/44 | 2.473/2.473 | PASS | 450 moduli, PASS | PASS |

Il conteggio full cresce soltanto per i nuovi characterization test e per test
estranei gia aggiunti nel worktree condiviso durante il lavoro. Nessuna
aspettativa esistente e stata rimossa o indebolita.

Verifica architetturale:

- zero behavioral change intenzionale;
- zero nuovi canonical writer e zero modifiche ai writer esistenti;
- zero nuovi metadata schema o chiavi;
- zero nuovi framework, coordinator, event bus o cache;
- metadata merge, History/Undo e GM/Player authority non toccati;
- full/incremental render, scene epoch e stale guards non spostati;
- HP/card/map, spell/class feature/zone/aura reconciliation non modificati;
- ordine dei side effect invariato: i nuovi moduli sono pure presentation o
  DOM-local interaction.

## Gate finali repository-wide

I gate seguenti sono stati eseguiti dopo l'ultima modifica sorgente. La full
suite finale e stata ripetuta sulla stessa tree gia verde dopo CRD-003, cosi da
non basare la chiusura su un solo pass.

| Gate | Risultato finale |
| --- | --- |
| full test suite | PASS, 2.473/2.473 per due run finali consecutivi; 0 failure, 0 cancelled, 0 skipped |
| invariant pack documentato | PASS, 170/170 incluso nelle full run; nessun test del pack fallisce |
| performance smoke | PASS dopo ciascuna delle tre tranche |
| performance harness completo | PASS, 2 run; `correctness.ok`, `noStaleActorVitalsOverwrite`, retention, queue idle e cross-scene isolation tutti true |
| `audit:class-features` | PASS, 860 meccaniche, 551 record runtime, 0 token marker runtime gap |
| `audit:barbaro` | PASS, 68 feature |
| `audit:spells` | PASS, 477 spell, 0 integration disconnected |
| `check:spells` | PASS, 477 catalogo completo / 358 trackable |
| build | PASS, Vite 7.1.3, 450 moduli trasformati |
| artifact checksums | PASS, 207 file |
| `verify:version` / `verify:dist` | PASS, versione 1.3.0 sincronizzata |
| dipendenze dirette | PASS, Owlbear Rodeo SDK 3.1.0 e Vite 7.1.3 |
| `git diff --check` | PASS; soltanto warning Git di normalizzazione LF/CRLF su file gia presenti nel worktree |
| whitespace nuovi artefatti | PASS, nessun trailing whitespace |

Il warning Vite per chunk oltre 500 kB resta quello dimensionale gia noto. Non
e stato affrontato perche il code splitting sarebbe un intervento distinto e
non necessario a questa decomposizione in feature freeze.
