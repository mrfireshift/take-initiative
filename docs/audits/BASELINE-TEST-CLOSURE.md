# Baseline test closure — feature freeze

Data di chiusura: 23 agosto 2026

Runtime verificato: Node `v24.15.0`, npm `11.12.1`

Versione plugin: `1.3.0`

## Perimetro e risultato

Questa chiusura parte dallo stato documentato in
`CANONICAL-MUTATION-HARDENING.md` e non riapre le decisioni di
`ARCHITETTURA.md`, ARCH-002/003/004/005/006/008 o
`docs/archive/releases/ROADMAP-CLOSURE.md`.
Il repository resta in feature freeze: nessuna nuova feature, nuova chiave o
nuovo schema metadata, nessun cambiamento intenzionale di UX e nessun secondo
framework di mutazione.

La baseline iniziale riprodotta era di 2.347 test: 2.322 pass e 25 failure. La
baseline finale e di 2.429 test: 2.429 pass. La differenza comprende 78 test
che i crash di valutazione modulo non lasciavano avviare e quattro
characterization test gia presenti nello stato finale del worktree condiviso.

## Fase 1 — Inventory iniziale delle 25 failure

La prima esecuzione e stata solo diagnostica. Nessun codice e stato modificato
prima della classificazione seguente. La colonna "prima divergenza" indica il
primo cambiamento ricostruibile da sorgente e cronologia, non attribuisce una
regressione quando l'evidenza non e sufficiente.

| # | Test / assertion fallita | Sorgente e comportamento atteso | Comportamento reale iniziale | Dominio / relazione | Cluster e classificazione |
| ---: | --- | --- | --- | --- | --- |
| 1 | `classFeatureIntegrationContract.test.js` | il modulo integrazione class feature deve caricarsi | `ERR_IMPORT_ATTRIBUTE_MISSING` da `initiativeCards.js` | class feature -> card defaults | R1, real product defect |
| 2 | `Undo della sola resolution riproduce il warning...` | replay concentration `applied` | `failed` per eccezione nel path spell/static-zone | concentration, stessa causa R1 | R1, real product defect |
| 3 | `il replay concentration usa l'identita background...` | replay sul runtime rimontato `applied` | `failed` nello stesso import dinamico | concentration/lifecycle | R1, real product defect |
| 4 | `Undo della causa e della resolution...` | nessun warning duplicato, comando `applied` | `failed` prima della verifica causale | concentration/History | R1, real product defect |
| 5 | `passed -> Undo -> failed usa un nuovo tentativo` | secondo tentativo `applied` | `failed` nel caricamento della lane | concentration/replay | R1, real product defect |
| 6 | `failed -> Undo -> passed usa un nuovo tentativo` | secondo tentativo `applied` | `failed` nel caricamento della lane | concentration/replay | R1, real product defect |
| 7 | `failed -> Undo -> failed usa un nuovo tentativo` | secondo tentativo `applied` | `failed` nel caricamento della lane | concentration/replay | R1, real product defect |
| 8 | `concentrationWarningUndoLifecycle.test.js` | helper timestamp `historyUndoCutoffAt` esportato | export rimosso, crash a livello modulo | concentration/History causality | R2, test expectation obsolete |
| 9 | `effectsMutationStaticZoneEpoch` TEST 6 | delete della zona terminata prima dello switch scena | path interrotto prima di `deleteItems` dall'errore R1 | static zone/epoch | R1, real product defect |
| 10 | `historyCorrectivePassContract.test.js` | modulo corrective pass caricabile | `ERR_IMPORT_ATTRIBUTE_MISSING` | History/spell/card | R1, real product defect |
| 11 | `holdPersonSaveWorkflow.test.js` | workflow TS caricabile | `ERR_IMPORT_ATTRIBUTE_MISSING` | spell/save workflow | R1, real product defect |
| 12 | `hpBatchResponsiveness.test.js` | contratto statico della consegna warning | regex richiedeva `showConcentrationWarnings(entries)` senza opzioni | HP/concentration causality | R3, test expectation obsolete |
| 13 | `immolationIntegration.test.js` | integrazione caricabile | `ERR_IMPORT_ATTRIBUTE_MISSING` | spell/reminder | R1, real product defect |
| 14 | `immolationRealUndoRepro.test.js` | repro Undo caricabile | `ERR_IMPORT_ATTRIBUTE_MISSING` | spell/History | R1, real product defect |
| 15 | `immolationReminderHistory.test.js` | History reminder caricabile | `ERR_IMPORT_ATTRIBUTE_MISSING` | spell/History | R1, real product defect |
| 16 | `initiativeControllerContract`: turn notice | marker finale presente | marker LF non trovato nel sorgente CRLF | initiative/lifecycle | R3, environment portability del test |
| 17 | `optionsProjection` OPTIONS-002 | consegne LOCAL e REMOTE verificabili | regex cercava object literal, il codice usa `sendProjectedPayload(..., destination, ...)` | GM/Player projection | R3, test expectation obsolete |
| 18 | `p0ReminderUndoRepro.test.js` | repro P0 caricabile | `ERR_IMPORT_ATTRIBUTE_MISSING` | reminder/History | R1, real product defect |
| 19 | `performanceHarness`: comando completo | `correctness.ok === true` | processo `1`, sola invariante falsa `noStaleActorVitalsOverwrite` | actorVitals/HP/scene switch | R4, harness defect |
| 20 | broker `passed -> Undo -> failed` | nuovo comando `applied` | `failed` nel path condiviso R1 | reminder broker | R1, real product defect |
| 21 | broker `failed -> Undo -> passed` | nuovo comando `applied` | `failed` nel path condiviso R1 | reminder broker | R1, real product defect |
| 22 | broker `failed -> Undo -> failed` | nuovo comando `applied` | `failed` nel path condiviso R1 | reminder broker | R1, real product defect |
| 23 | broker `catena mista reale...` | rearm concentration e generic separati, entrambi applicabili | `failed` nel path condiviso R1 | reminder/concentration/History | R1, real product defect |
| 24 | `spellStaticZoneMovementUndoIntegration.test.js` | modulo integrazione caricabile | `ERR_IMPORT_ATTRIBUTE_MISSING` | static zone/movement/Undo | R1, real product defect |
| 25 | `spellTeleportCore.test.js` | modulo teleport caricabile | `ERR_IMPORT_ATTRIBUTE_MISSING` | spell/teleport/Undo | R1, real product defect |

### Clustering per root cause

| Cluster | Failure iniziali | Root cause dimostrata | Prima divergenza ricostruibile | Decisione |
| --- | ---: | --- | --- | --- |
| R1 — import JSON Node | 20 | `initiativeCards.js` importava JSON senza import attribute; Node 24 interrompeva la valutazione, direttamente in 9 file e indirettamente in 11 path dinamici | import JSON introdotto in `0fea75f`; il package supporta il runtime Node usato dalla suite | fix minimo di compatibilita del prodotto |
| R2 — causality test legacy | 1 | il test importava helper timestamp rimossi; il contratto canonico corrente lega warning e Undo all'esatto `causeHistoryEntryId` | passaggio alla causalita per ID consolidato in `b9e526d` | riscrivere il test sul contratto piu forte, senza reintrodurre timestamp |
| R3 — source contract non canonici | 3 | regex non aggiornate a opzioni causali, helper destination e CRLF | firma causale in `efabd62`; helper projection in `b9e526d`; CRLF dipende dal checkout | correggere esclusivamente il test |
| R4 — actorVitals retention ignorata | 1 | il harness pretendeva la presenza finale di tutti gli attori della scena A in un registry Room con retention a 2.500 byte e dopo switch alla scena B | l'asserzione precede il budget/retention consolidato in `b9e526d` | correggere l'invariante del harness, non il prodotto |

Le failure R1 con esito `failed` non erano una seconda race: dopo l'import
compatibile lo stesso codice ha restituito `applied` e tutti i relativi test
sono passati senza modifiche alla semantica reminder/concentration.

## Fase 2 — Diagnosi `noStaleActorVitalsOverwrite`

### Call path verificato

```text
meta.hp / meta.hpMax sul token (fonte canonica)
  -> scene item event / snapshot dispatcher
  -> actorVitalsStore.saveCanonicalHP (solo GM)
  -> coda key-scoped Room .../actorVitals
  -> merge per actorProfileId + revision + retention 2.500 byte
  -> subscriber/cache actorVitals

baseline o nuovo collegamento actorProfileId
  -> reconcileSceneItems nello scene epoch catturato
  -> record actorVitals autorevole
  -> doppia lettura HP live + expected canonical HP
  -> updateItems soltanto se epoch ed expected sono ancora correnti
  -> evento riflesso aggiorna la cache, senza loop

token legacy senza actorProfileId
  -> hpMemory (fallback separato, solo se HP canonici assenti)
```

Tracker, card e map HP bar continuano a derivare dagli stessi
`meta.hp`/`meta.hpMax`; `actorVitals` e `hpMemory` non diventano fonti
alternative. History/Undo non appartiene alle hydration tecniche e non e stato
modificato. Il Player resta read-only.

### Esito della ricostruzione

Il harness trovava il caso 4, **problema nel harness**, non uno stale overwrite:

- gli HP canonici finali di entrambe le scene coincidevano esattamente con gli
  attesi;
- lo switch scena bloccava una write stale (`crossSceneWritesBlocked = 1`);
- tutte le code erano idle e non esistevano mismatch nei record trattenuti;
- il registry finale conteneva 38 record, 2.454 byte su un budget di 2.500;
- l'assenza degli attori A e degli ultimi due attori B era retention
  deterministica, non sovrascrittura.

Il test ora verifica tre proprieta separate: ogni record trattenuto deve
coincidere con l'ultimo HP/HP max canonico osservato in A o B; un record ignoto
o divergente fallisce esplicitamente; il registry deve rispettare il budget.
L'assenza di un record e permessa dal contratto di retention. Non sono stati
aumentati timeout, retry, debounce o budget.

## Fase 3 — Patch applicate e failure emerse dopo lo sblocco

| Finding | Evidenza | Modifica minima | Test aggiunto o corretto | Rischio regressione | Esito |
| --- | --- | --- | --- | --- | --- |
| BL-001 — JSON import | Node 24 richiede `type: json` | import attribute in `initiativeCards.js` | intera suite, nove moduli prima in crash | basso: forma dati e bundle invariati | chiuso |
| BL-002 — actorVitals harness | 38 record / 2.454 byte, zero mismatch | confronto dei soli record trattenuti contro entrambe le scene + assertion budget | performance smoke/full | basso: solo harness | chiuso |
| BL-003 — source contract obsoleti | codice e test correlati confermano firma causale e helper projection | tre assertion rese strutturali e CRLF-safe | `hpBatchResponsiveness`, `initiativeControllerContract`, `optionsProjection` | nullo sul prodotto | chiuso |
| BL-004 — lifecycle concentration legacy | helper timestamp non piu esportati | characterization su causal ID, batch, dismiss e replay esatto | `concentrationWarningUndoLifecycle` | nullo sul prodotto; invariante piu precisa | chiuso |
| BL-005 — fixture SDK static zone | i builder sono named import richiesti dal modulo corrente | mock completato con gli stessi builder fluent usati dagli altri test | `spellStaticZoneMovementUndoIntegration` | nullo sul prodotto | chiuso |
| BL-006 — fixture/repro History legacy | client e owner background erano montati nello stesso modulo; descriptor e outcome appartenevano a API precedenti | topology client -> broker background, descriptor correnti, attesa deterministica della History deferred | `historyCorrectivePassContract`, `immolationRealUndoRepro` | basso: test ora usa il path produttivo | chiuso |
| BL-007 — Undo durante teleport | `historyUndoCore` ammetteva l'origine solo per la stessa animazione pendente, ma runtime non forniva `operationId`/lookup e i timer vecchi sopravvivevano | registro in-memory per token/operation, timer guardati, cancellazione su nuova animation/Undo/unmount; stesso hook gia previsto dal planner | pure `historyUndoCore`, integrazione Undo durante animation e genuine manual-move conflict | medio su timing teleport; nessun metadata nuovo | chiuso, 3/3 replay sensibili |
| BL-008 — audit Barbaro stale | lo script corrente produce evidence fields non presenti nell'artefatto versionato | rigenerati JSON e Markdown; nessun codice runtime | doppia generazione con SHA-256 identici | nullo sul runtime | chiuso |

Dopo la correzione dell'import, alcuni test prima bloccati sono arrivati alle
proprie assertion e hanno mostrato fixture/API obsolete (BL-005/006). Il test
corrective pass ha anche rivelato BL-007, un difetto reale e necessario alla
baseline: durante la stessa animazione l'Undo canonico deve vincere sui timer
della propria operazione; un movimento manuale successivo resta invece un
conflitto esplicito. La patch usa il `teleportAnimationLookup` gia previsto da
`historyUndoCore` e non introduce un coordinator o stato persistente parallelo.

## Invarianti preservate

| Invariante | Evidenza dopo le patch | Esito |
| --- | --- | --- |
| fonte canonica HP | solo `meta.hp` / `meta.hpMax`; actorVitals resta cache budgeted | PASS |
| metadata merge semantics | nessuna patch sostituisce `item.metadata` o il meta plugin wholesale | PASS |
| lifecycle / epoch / stale | actorVitals conserva doppia expected check; teleport timer verifica operation e teardown | PASS |
| History / Undo | Undo cancella solo la stessa animation; unrelated HP non confligge, movimento manuale si | PASS |
| GM / Player authority | nessun gate modificato; harness conferma zero Player write violation | PASS |
| render immediato HP/card/map | nessun writer o subscriber HP modificato | PASS |
| spell/class feature/zone/aura reconciliation | suite completa e audit specialistici verdi | PASS |
| framework mutation | resta unico `createEffectsMutationCoordinator`; registro animation e solo lifecycle locale | PASS |
| schema metadata | nessuna chiave o shape persistita nuova | PASS |

## Fase 4 — Flake detection

| Prova sensibile | Ripetizioni | Esito |
| --- | ---: | --- |
| Undo reale durante teleport a 500 ms | 3 | 3/3 PASS; timer della animation non riscrive dopo Undo |
| Immolazione: passed/failed resolution + History Undo | 3 | 3/3 file PASS |
| performance harness full, seed dedicato | 3 | PASS; tutte le correctness assertion vere |
| performance smoke, seed dedicato | 5 | PASS; tutte le correctness assertion vere |
| suite completa con output JUnit | 2 | 2.429/2.429 entrambe, exit code 0 |

Una precedente esecuzione col reporter verboso aveva completato 2.429/2.429 ma
la pipe di raccolta, saturata da oltre 135.000 righe di log, aveva restituito
codice 1 dopo il riepilogo. Il reporter JUnit su file ha eliminato il problema
di trasporto: due processi successivi sono terminati 0. Non risultano
`process.exitCode` nel codice test/prodotto; l'unico e nel driver CLI del
performance harness quando una correctness assertion e falsa. I report finali
mostrano inoltre `listenerCountAfterDispose = 0`.

## Fase 5 — Baseline finale

| Gate | Risultato finale |
| --- | --- |
| full test suite | PASS, 2.429/2.429, due run finali |
| invariant pack documentato | PASS, 170/170 incluso nelle full run; nessun test del pack fallisce |
| performance smoke | PASS, 5 run |
| performance harness completo | PASS, 3 run; `noStaleActorVitalsOverwrite` e budget entrambi true |
| `audit:class-features` | PASS, 860 meccaniche, 551 record runtime, 0 token marker runtime gap |
| `audit:barbaro` | PASS, 68 feature; seconda generazione byte-identica |
| `audit:spells` | PASS, 477 spell, 0 integration disconnected |
| `check:spells` | PASS, 477 catalogo completo / 358 trackable |
| build | PASS, Vite 7.1.3, 446 moduli |
| artifact checksums | PASS, 207 file |
| `verify:version` / `verify:dist` | PASS, versione 1.3.0 sincronizzata |
| dipendenze dirette | PASS, SDK 3.1.0 e Vite 7.1.3 |
| `git diff --check` | PASS; soli warning EOL informativi del checkout Windows |

Il warning Vite sui chunk oltre 500 kB e preesistente e non e stato trattato
con code splitting durante il feature freeze. Non restano failure o blocker
funzionali nascosti; nessuna aspettativa e stata indebolita per accettare un
comportamento non dimostrato canonico.
