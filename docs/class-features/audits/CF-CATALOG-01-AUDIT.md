Aggiungerei `CF-CATALOG-01` come workstream parallelo: non implementa feature, ma costruisce il modello con cui valutare le 395 rimanenti e misurare l’impatto dei ticket strutturali.

Lo schema riusa i campi già presenti in [class-features-runtime.json](../../../src/class-features-runtime.json) e [class-feature-automation-audit.json](../../../data/class-features/class-feature-automation-audit.json). Non introduce metadata runtime né una nuova fonte regolistica.

## 1. Schema della matrice

La soluzione dovrebbe avere due entità logiche: matrice delle feature e registro delle primitive.

### Matrice delle feature

| Campo | Tipo / valori | Provenienza |
|---|---|---|
| `featureId` | ID univoco | Catalogo, derivato |
| `snapshotCommit` | commit completo | Processo di review |
| `sourcePointer` | collection, source, page | Catalogo, derivato |
| `existingAutomationLevel` | valore corrente | `automationLevel`, derivato |
| `existingRuntimeStatus` | `implemented`, `not-automated` | `runtimeSupport.status`, derivato |
| `targetAutomationLevel` | `descriptive`, `assisted`, `automatic`, `unsupported` | Valutazione |
| `classificationRationale` | testo breve | Valutazione |
| `requiredPrimitiveIds` | insieme ordinato | Valutazione |
| `availablePrimitiveIds` | insieme ordinato | Derivato dal registro |
| `missingPrimitiveIds` | `required − available` | Derivato |
| `primaryPattern` | riferimento spell/class | Valutazione |
| `secondaryPatterns` | zero o più riferimenti | Valutazione |
| `customCodeMode` | enum finita | Valutazione |
| `ambiguity` | oggetto con assi e livello complessivo | Valutazione |
| `dataReadiness` | `ready`, `partial`, `blocked` | Valutazione |
| `dataBlockers` | codici, non testo duplicato | Audit esistente |
| `candidateTicketIds` | ticket che chiudono i gap | Derivato |
| `reviewStatus` | `unreviewed`, `triaged`, `reviewed`, `approved`, `deferred` | Workflow |
| `reviewEvidence` | riferimenti, non copia del testo | Workflow |
| `unlockState` | `blocked`, `architecture-ready`, `implementation-ready` | Derivato |

Non vanno duplicati nome, descrizione, classe, sottoclasse, livello o testo regolistico: rimangono nel catalogo.

### Necessità di codice custom

`customCodeMode` usa solo questi valori:

| Valore | Significato |
|---|---|
| `none` | Configurazione dichiarativa sufficiente |
| `adapter` | Serve solo comporre primitive esistenti |
| `shared-primitive` | Manca una capacità riutilizzabile cross-class |
| `feature-specific` | Logica deterministica realmente unica |
| `not-allowed` | Richiederebbe dati ricopiati, adjudication del GM o over-automation |

`requiresCustomCode` può essere derivato come `customCodeMode != none`.

### Registro delle primitive

| Campo | Contenuto |
|---|---|
| `primitiveId` | ID stabile della tassonomia |
| `category` | data, activation, target, choice, effect, lifecycle, resource, area, hp, rule, state, ui |
| `contract` | comportamento osservabile minimo |
| `availability` | `available`, `spell-adapter-needed`, `partial`, `missing`, `deprecated` |
| `implementationRefs` | file/funzioni esistenti |
| `dependsOnPrimitiveIds` | dipendenze tecniche |
| `compatibleAutomationLevels` | livelli che può supportare |
| `providedByTicketIds` | ticket che la introducono |
| `stabilizedByTicketIds` | ticket che la rendono sicura |
| `testRefs` | contract test applicabili |
| `snapshotCommit` | versione del registro |

`availablePrimitiveIds` e `missingPrimitiveIds` della matrice vengono sempre calcolati da questo registro.

---

## 2. Tassonomia finita delle primitive

### Dati e provenienza

- `DATA.SOURCE_TRACE`: fonte, collezione e pagina verificabili.
- `DATA.STRUCTURED_EFFECT`: effetto espresso in forma consumabile.
- `DATA.DURATION`: durata/expiry strutturata.
- `DATA.CHOICES`: insieme finito di opzioni.
- `DATA.SCALING`: progressione per livello o valore derivabile.
- `DATA.RESOURCE`: pool e costo strutturati.
- `DATA.FRESHNESS`: artefatto generato allineato alle fonti.
- `DATA.SCHEMA_VALIDATION`: input validato prima della generazione.
- `DATA.DERIVED_REPORT`: audit derivabile senza diventare fonte runtime.

### Fonte e attivazione

- `SRC.FIXED_OWNER`: fonte fissata al personaggio proprietario.
- `SRC.SELECTABLE_CASTER`: selezione del caster, principalmente spell.
- `ACT.DIRECT`: attivazione immediata senza input.
- `ACT.REVIEW`: review prima del commit.
- `ACT.PARENT_CHILD`: attivazione coordinata di parent e child.
- `ACT.ACTIVE_ACTION`: azione successiva disponibile durante l’effetto.

### Bersagli

- `TGT.SELF`
- `TGT.SINGLE`
- `TGT.MULTI`
- `TGT.SELECTION`
- `TGT.EXCLUDE_SOURCE`
- `TGT.RANGE`
- `TGT.CARDINALITY_ASSISTED`
- `TGT.AREA_DYNAMIC`
- `TGT.AURA_SELECTED`

La cardinalità assistita può usare solo dati già disponibili. Se il limite non è derivabile, mostra un avviso senza fingere validazione.

### Scelte

- `CHOICE.REQUIRED`
- `CHOICE.EFFECT_VARIANT`
- `CHOICE.INHERIT_PARENT`
- `CHOICE.OPTION_LIFECYCLE`

### Effetti

- `FX.REMINDER`: testo o pill descrittiva.
- `FX.CONDITION`: condizione canonica.
- `FX.CHILD_CONDITIONS`: più effetti legati allo stesso parent.
- `FX.PARENT_END`: conseguenza applicata alla fine del parent.
- `FX.ACTIVE_ACTION`: azione contestuale durante un effetto.

### Lifecycle

- `LC.APPLIED_AT`
- `LC.INSTANT`
- `LC.ROUNDS`
- `LC.TURN_START`
- `LC.TURN_END`
- `LC.MANUAL`
- `LC.PARENT_BOUND`
- `LC.CONCENTRATION_BREAK`

La fine anticipata dipendente da adjudication rimane `LC.MANUAL`; non richiede un’automazione dedicata.

### Risorse

- `RES.COST`
- `RES.FIXED`
- `RES.LEVEL_TABLE`
- `RES.FORMULA`
- `RES.SHARED_POOL`
- `RES.REFRESH_SHORT`
- `RES.REFRESH_LONG`

### Aure e aree

- `AREA.GEOMETRY`
- `AREA.MEMBERSHIP`
- `AREA.SELECTED_MEMBERSHIP`
- `AREA.VISUAL`
- `AREA.RECONCILE`
- `AREA.SERIAL_MUTATION`

Una relazione “attaccante vicino a un nemico” non è `AREA.MEMBERSHIP`: è un trigger regolistico e deve restare reminder se non esiste un dato deterministico.

### HP

- `HP.REMINDER`
- `HP.TEMP_DECLARATIVE`
- `HP.ASSISTED_CANONICAL`

`HP.ASSISTED_CANONICAL` può richiamare il sistema HP esistente, ma non introduce campi alternativi né mutazioni implicite.

### Regole mantenute assistite

- `RULE.SAVE_REMINDER`
- `RULE.DAMAGE_REMINDER`
- `RULE.MOVEMENT_REMINDER`
- `RULE.RESISTANCE_REMINDER`
- `RULE.HIT_TRIGGER_REMINDER`

Queste primitive rappresentano informazione e workflow, non nuove automazioni di TS, danni, movimento, resistenze o trigger al colpo.

### Stato, history e terminazione

- `TX.ATOMIC`
- `HIST.UNDO`
- `END.ALL`
- `END.TARGET`

### UX

- `UI.PILL`
- `UI.DROPDOWN`
- `UI.MODAL_REVIEW`
- `UI.TARGET_PICKER`
- `UI.QUICK_DIRECT`
- `UI.QUICK_REVIEW`
- `UI.CONTEXT_ACTION`
- `UI.CONTROL_CENTER`
- `UI.RESOURCE_COUNTER`
- `UI.AURA_VISUAL`
- `UI.MANUAL_DETAIL`

### Pattern di riferimento

I pattern non sono primitive; sono esempi composti.

**Spell:**

- `SPELL.DESCRIPTIVE_REMINDER`
- `SPELL.TIMED_CONDITION`
- `SPELL.MULTI_TARGET`
- `SPELL.CHOICE_EFFECT`
- `SPELL.ACTIVE_ACTION`
- `SPELL.CONCENTRATION_REPLACEMENT`
- `SPELL.DYNAMIC_AURA`
- `SPELL.SELECTED_AREA`
- `SPELL.TEMP_HP_DECLARATIVE`
- `SPELL.TARGET_TERMINATION`

**Class feature:**

- `CLASS.RAGE`
- `CLASS.RECKLESS_ATTACK`
- `CLASS.FIXED_OWNER`
- `CLASS.RESOURCE_POOL`
- `CLASS.PARENT_CHILD`
- `CLASS.FEATURE_CHOICE`
- `CLASS.SELECTED_AURA`
- `CLASS.DESCRIPTIVE_MARKER`

Ogni riga può inoltre indicare l’ID concreto dello spell o della capacità più vicina.

---

## 3. Criteri di classificazione

### Livello di automazione

- **Descriptive:** mostra regola, reminder o pill; non pretende di risolvere la meccanica.
- **Assisted:** raccoglie bersagli/scelte, registra stato, gestisce lifecycle e Undo, lasciando l’adjudication al tavolo.
- **Automatic:** applica solo conseguenze deterministiche ricavabili da stato canonico e fonte non ambigua.
- **Unsupported:** non può essere rappresentata onestamente con i dati disponibili, oppure richiederebbe informazioni ricopiate dal GM.

Il valore corrente è solo un indizio:

- `riferimento` → candidato descriptive.
- `tracciamento` → candidato assisted.
- `assistita` → candidato assisted.
- `automatica` → deve comunque superare i controlli di determinismo.

### Selezione delle primitive

Per ogni feature si registra il set minimo necessario per il livello scelto, non quello necessario alla massima automazione teorica.

Esempio: una capacità che infligge danno dopo un colpo può richiedere:

```text
FX.REMINDER
RULE.HIT_TRIGGER_REMINDER
RULE.DAMAGE_REMINDER
UI.PILL
LC.MANUAL
```

Non richiede un motore automatico di riconoscimento del colpo.

### Ambiguità regolistica

Ogni asse riceve `0–3`:

- `source`
- `activation`
- `targeting`
- `timing`
- `scaling`
- `interaction`

Livello complessivo = massimo degli assi:

| Livello | Significato |
|---|---|
| 0 — none | Regola esplicita e deterministica |
| 1 — low | Piccole decisioni di presentazione |
| 2 — medium | Più interpretazioni, contenibili con scelta/manualità |
| 3 — high | Fonte insufficiente o adjudication sostanziale |

Regole di ammissibilità:

- Automatic: massimo `1`.
- Assisted: massimo `2`.
- Descriptive: ammesso anche con `2`, se il testo è accurato.
- Ambiguità `3`: `unsupported` o `deferred` finché non è disponibile una fonte precisa.

### Quando creare una primitive condivisa

Una mancanza diventa candidata a `shared-primitive` se:

- ricorre in almeno tre feature; oppure
- ricorre in almeno due classi/sottoclassi distinte; oppure
- è già presente nel sistema Incantesimi e manca soltanto un adapter.

Il codice `feature-specific` richiede invece:

- meccanica deterministica;
- fonte precisa;
- nessuna duplicazione di builder, lifecycle, history o UI;
- nessuna richiesta di stat block manuali;
- impossibilità motivata di rappresentarla dichiarativamente.

---

## 4. Procedura di review

1. **Congelare lo snapshot:** commit, hash del runtime generato e versione della tassonomia.

2. **Prefill automatico:** importare ID, fonte, pagina, livello corrente, `runtimeRequirements`, `missingForExecution`, audit e stato runtime. Nessuna decisione viene inferita come definitiva.

3. **Raggruppare cross-class:** creare cluster per firma meccanica, non per classe. Esempi: risorsa per riposo breve, scelta di effetto, aura dinamica, reminder al colpo.

4. **Scegliere il livello minimo utile:** descriptive prima di assisted, assisted prima di automatic. L’automazione completa non è un requisito.

5. **Associare il pattern:** un riferimento primario e, solo se necessario, riferimenti secondari con l’aspetto riusato dichiarato.

6. **Compilare le primitive:** prima `required`; `available` e `missing` vengono calcolate dal registro.

7. **Valutare dati e ambiguità:** una descrizione incompleta non può essere compensata inventando logica runtime.

8. **Determinare il codice custom:** applicare la soglia cross-class; eventuali primitive nuove diventano ticket separati.

9. **Review architetturale e UX:** verificare builder, history, Undo, pill, dropdown, quick action, control center e terminazione.

10. **Approvazione:** una riga diventa `approved` soltanto con fonte, pattern, primitive e ambiguità espliciti.

11. **Ricalcolo degli unlock:** aggiornare le metriche dopo ogni ticket strutturale senza riclassificare manualmente le righe.

Non è necessario classificare subito tutte le 395 feature: il primo ciclo può validare lo schema su un campione cross-class, senza trasformarlo in un nuovo pilot di implementazione.

### Calcolo delle feature sbloccate

Per un insieme di ticket completati `S`:

```text
missing(f, S) =
  requiredPrimitives(f)
  − availablePrimitivesAfter(S)

architectureReady(f, S) =
  missing(f, S) è vuoto
  AND dataReadiness != blocked
  AND ambiguity compatibile con targetAutomationLevel

implementationReady(f, S) =
  architectureReady(f, S)
  AND customCodeMode in {none, adapter}
```

Per ogni ticket `T` vanno pubblicate quattro metriche:

- **touch count:** feature che richiedono una primitive fornita o stabilizzata da `T`;
- **gap reduction:** feature cui `T` riduce il numero di primitive mancanti;
- **direct unlock:** `ready(S ∪ T) − ready(S)`, con le dipendenze già completate;
- **cumulative unlock:** differenza rispetto a `890223e` includendo la closure delle dipendenze.

Una quinta metrica utile è **regression exposure**: quante feature già implementate dipendono dalla primitive toccata.

Esempio: se una feature richiede `FX.CONDITION`, `LC.APPLIED_AT` ed `END.TARGET`, CF-010 riduce il gap ma non la sblocca; CF-017 produce il direct unlock quando anche il builder è disponibile.

Fino alla classificazione delle 395 righe, i conteggi devono restare “non calcolabili”, non stimati.

---

## 5. Integrazione con CF-001–CF-022

| Ticket | Primitive fornite/stabilizzate | Effetto sul catalogo |
|---|---|---|
| CF-001 | Nessuna runtime; contratti `CLASS.RAGE`, `CLASS.RECKLESS_ATTACK` | Aumenta confidenza e regression exposure |
| CF-002 | `DATA.FRESHNESS` | Rende affidabili tutti i conteggi |
| CF-003 | `DATA.SCHEMA_VALIDATION` | Riduce feature bloccate da dati malformati |
| CF-004 | `DATA.SOURCE_TRACE`, `DATA.DERIVED_REPORT` | Elimina ambiguità sulla fonte eseguibile |
| CF-005 | `RES.FORMULA` | Sblocca capacità con pool derivabili |
| CF-006 | `RES.REFRESH_SHORT`, `RES.REFRESH_LONG` | Sblocca risorse con refresh distinto |
| CF-007 | `HP.REMINDER`, `HP.TEMP_DECLARATIVE` | Stabilisce il pattern HP non invasivo |
| CF-008 | `TGT.CARDINALITY_ASSISTED` | Sblocca selezioni limitate da dati canonici |
| CF-009 | `AREA.SERIAL_MUTATION` | Rende sicura la convivenza di più aree |
| CF-010 | `LC.APPLIED_AT` | Sblocca expiry dipendenti dal turno reale |
| CF-011 | `FX.CONDITION`, `FX.CHILD_CONDITIONS` | Principale moltiplicatore cross-class |
| CF-012 | `TX.ATOMIC`, `HIST.UNDO`, `LC.CONCENTRATION_BREAK` | Rende sicure attivazioni composite |
| CF-013 | `ACT.PARENT_CHILD` | Sblocca feature con effetti dipendenti |
| CF-014 | `ACT.REVIEW`, `UI.QUICK_REVIEW`, `CHOICE.REQUIRED` | Sblocca feature con scelta da ogni ingresso UI |
| CF-015 | `CHOICE.OPTION_LIFECYCLE` | Sblocca opzioni con durate differenti |
| CF-016 | Stabilizza `DATA.CHOICES` e ID legacy | Riduce duplicazioni, non crea una primitive nuova |
| CF-017 | `END.TARGET`, `UI.CONTROL_CENTER` | Sblocca effetti multi-target persistenti |
| CF-018 | `RULE.HIT_TRIGGER_REMINDER` come pattern corretto | Evita falsi unlock basati su geometria |
| CF-019 | `CHOICE.INHERIT_PARENT` | Sblocca child dipendenti dalla scelta parent |
| CF-020 | `AREA.VISUAL`, `AREA.RECONCILE` | Stabilizza le aure cross-class |
| CF-021 | `UI.MANUAL_DETAIL` | Sblocca output descrittivi senza stringhe tecniche |
| CF-022 | Contract test dell’intero registro | Gate finale per dichiarare le primitive disponibili |

`CF-CATALOG-01` può iniziare dopo CF-001 e definire schema e registro sullo snapshot `890223e`. I conteggi reali di unlock diventano attendibili dopo CF-002/CF-003 e dopo la review delle relative righe, ma la classificazione completa delle 395 feature non è parte di questo ticket.
