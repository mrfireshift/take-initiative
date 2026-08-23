# Take Initiative! — Spell Architecture Master Reference

Documento master per il sistema **Incantesimi** di Take Initiative!. Consolida
la precedente fase di analisi architetturale e diventa il riferimento operativo
per polishing, nuove implementazioni e scelta dei batch futuri.

| Campo | Valore |
| --- | --- |
| Stato | Riferimento operativo corrente |
| Ultima verifica | 2026-08-21 |
| Fonte primaria | Codice runtime in `src/` |
| Perimetro | Cast, targeting, aree, zone, aure, trigger, reminder, TS, danni, cure, condizioni, azioni successive, cleanup e mutation |
| Baseline verificata | Gli spell elencati in [F. Canonical spell reference map](#f-canonical-spell-reference-map) sono trattati come già auditati e verificati |
| Confine esplicito | `OUT OF SCOPE — DEFERRED HISTORY / CONCENTRATION UNDO` |

> Questo documento descrive il runtime esistente. Non è una proposta di
> refactoring e non autorizza la creazione di nuovi controller, helper o
> pipeline spell-specific quando una primitive esistente è sufficiente.

## Operating rule

La gerarchia da applicare a ogni nuovo workflow è:

```text
CONFIGURE > COMPOSE > EXTEND > SPELL-SPECIFIC RULE > NEW PRIMITIVE
```

Prima di aggiungere codice, individuare il contratto più vicino, configurarlo,
comporre le primitive già esistenti e documentare l'eventuale gap. Una regola
D&D realmente specifica può restare spell-specific; l'infrastruttura di
scrittura, reminder, trigger, area, zone e lifecycle non va replicata.

---

## A. Architecture summary

1. Il runtime è data-driven: cataloghi e registri dichiarano spell, effetti,
   geometrie, trigger, TS, scaling e azioni successive.
2. Il pannello unificato costruisce un contratto UI/runtime e una sessione; non
   dovrebbe diventare il luogo delle regole di persistenza.
3. Il cast geometrico passa da `buildSpellAreaResolutionCommand` a
   `executeSpellAreaResolution`; il cast lifecycle passa dall'adapter lifecycle.
4. Le aree istantanee, le zone statiche e le aure mobili condividono targeting,
   membership, trigger e reminder, variando soprattutto la configurazione.
5. I planner calcolano eleggibilità, membership, trigger e resolution plan senza
   scrivere direttamente il metadata canonico.
6. Gli executor coordinano il commit; i controller GM riconciliano item di scena,
   membership e runtime derivato dopo movimento, cambio turno o metadata change.
7. `runEffectsMutation` è il percorso canonico per metadata di token, HP,
   condizioni, spell, counters e side effect coordinati.
8. Le notice sono una proiezione: un'attivazione può avere più target, ma la
   risoluzione viene esposta per target tramite fan-out e consumo parziale.
9. La pulizia è identity-based: `instanceId`, `spellId`, `casterId`, parent/child
   e chiavi di trigger contano più del testo visualizzato.
10. I nuovi spell devono riusare l'infrastruttura e aggiungere solo dati o regole
    semantiche che il contratto corrente non rappresenta.

---

## B. Canonical runtime pipeline

### Diagramma principale

```text
Spell catalog / spell rule
        │
        ├─ Pannello Incantesimi
        │    └─ contract → session → validation/view model
        │
        ├─ Azione rapida
        │    └─ launch plan → area/lifecycle adapter
        │
        └─ Active action / reminder resolution
             └─ action or resolution request
        │
        ▼
Targeting e placement
  - discrete target IDs
  - geometric area
  - area subset
  - static zone / mobile aura
        │
        ▼
Pure rule / planner
  - area rule
  - membership
  - trigger plan
  - resolution plan
        │
        ▼
Executor
  - unified area
  - area resolution
  - lifecycle
  - active action
  - reminder resolution
        │
        ├─ Effects Mutation → token metadata / HP / conditions / spells / counters
        ├─ scene reconciler → zone / aura / child-zone item
        └─ notice projection → Turn Notice / Player view
        │
        ▼
Runtime state
  - spell instance
  - parent/child effects
  - membership
  - triggerRuntime / pending activations
  - turn prompt / reminder
        │
        ▼
Movement, turn boundary, active action o dismissal
        │
        ▼
Trigger planner → notice per target → GM resolution → Effects Mutation
        │
        ▼
Cleanup per expiry, save, removal, invalid source/target, counter o parent end
```

### Percorso canonico per fase

| Fase | File e funzione principale | Input → output | Chi la chiama | Layer che scrive davvero |
| --- | --- | --- | --- | --- |
| Definizione | `src/spells-srd.js` — `getSpellDefinition`; `src/spellAreaRules.js` — `getSpellAreaRules` | `spellId`, contesto cast → definizione, effect rules, area rules | pannello, adapter, catalogo attivo | Nessuna scrittura; sono rule/catalog layer |
| Contratto UI | `src/spellUnifiedPanelCore.js` — `buildSpellUnifiedPanelContract` | spell, fase, caster/slot → contract di targeting, placement, input, save, azioni | `src/spell-unified-panel.js`, quick action core | Nessuna scrittura |
| Sessione/prompt | `createSpellPanelSession`, `updateSpellPanelSession`, `buildSpellPanelViewModel` nello stesso core | contract + input utente → sessione/view model validabile | UI pannello | Nessuna scrittura canonica |
| Eligibility area | `src/spellUnifiedAreaAdapter.js` — `getSpellUnifiedAreaEligibility` | contract + session → ammissibilità/error code | pannello e quick action | Nessuna scrittura |
| Command area | `buildSpellUnifiedAreaCommand`; `src/spellAreaResolutionCommandCore.js` — `buildSpellAreaResolutionCommand` | contract, session, placement, target IDs, outcome/HP → comando serializzabile | `spell-unified-panel.js`, quick action, trigger resolution | Nessuna scrittura |
| Executor area | `src/spellUnifiedAreaAdapter.js` — `executeSpellUnifiedArea`; `src/spellAreaResolutionExecutor.js` — `executeSpellAreaResolution` | comando + runtime/scene epoch → result, changes, instance, trigger changes | pannello e adapter | Item zona/token possono essere aggiunti/aggiornati dall'executor; metadata, condizioni, spell e side effect passano dal mutation coordinator. L'helper HP locale dell'executor è un'eccezione da non copiare. |
| Executor lifecycle | `src/spellUnifiedLifecycleAdapter.js` — `executeSpellUnifiedLifecycle`; `src/spellApplicationExecutor.js` — `executeSpellApplication` | cast non geometrico/prepared → application result | pannello unificato | `runEffectsMutation` per le operations |
| Quick action | `src/quickActionSpellExecutionCore.js` — `buildQuickActionSpellLaunchPlan`; `src/quickActionExecution.js` — `executeDirectQuickAction` | card action + source + target → area/lifecycle request/result | card iniziativa e `initiativeList.js` | Delegata agli executor; non deve diventare un terzo executor |
| Membership | `src/spellAreaMembershipCore.js` — `areaMembershipTargetIds`, `areaMembershipPlan` | rule, area, candidati, source → target IDs, entering/leaving, operations | static zone, aura controller, area executor | Le operations di condizioni vengono applicate da `runEffectsMutation` |
| Aura runtime | `src/spellAuraCore.js` — `collectActiveMobileAuras`, `mobileAuraMembershipPlan`; `src/spellAuraController.js` — `reconcileSpellAuras` | spell attive + bounds + scena → aura item, membership, trigger runtime | controller GM su movimento/grid/metadata | Il controller aggiorna item aura e accoda le operations effetti; token metadata tramite mutation |
| Zona statica | `src/spellStaticZone.js` — `buildStaticSpellZoneItems`, `reconcileStaticSpellZones` | placement + spell instance + scena → root/subzone/child zone e membership | area executor e controller GM | Item scena e `triggerRuntime` sono scritti dal controller/executor; effetti token tramite mutation |
| Trigger | `src/spellZoneTriggerCore.js` — `planSpellZoneTriggers`, `mergePlannedSpellZoneTriggerRuntime` | rule, runtime precedente, membership, turn state, posizione → activations e runtime nuovo | reminder core, static/aura controller | Il planner è puro; il controller persiste `triggerRuntime` |
| Reminder | `planMobileAuraReminder`, `planStaticSpellZoneReminder` e consumer class/custom | runtime + activation → notices e pending metadata | controller aura/zone e turn notice | Delivery UI; il pending persistente viene scritto dal controller |
| Notice fan-out | `src/zoneTriggerNoticeCore.js` — `zoneTriggerNoticesFromActivation`; `src/turn-notice.ts` | activation con uno o più target → notice scoped per target | reminder planners, Turn Notice | Nessuna scrittura canonica; dedup/cache UI |
| Resolution | `src/reminderResolutionCore.js` — `buildZoneTriggerReminderResolution`, `buildReminderResolutionPlan`; `src/reminderResolution.js` — `resolveReminder` | notice + esito + dado → operation plan/result | Turn Notice, console, warning controller | `runEffectsMutation` esegue HP/condition/spell/consume trigger |
| Cleanup | reconciler + `staleMobileAuraEffectRemovals`, `staleAreaMembershipEffectRemovals`, `commitWithStaticSpellZoneRemoval`, cleanup parent/child | istanza scaduta/rimossa o source/target invalido → remove plan | expiry, concentration boundary, manual dismiss, controller | Mutation coordinator per effetti; scene item API per geometrie possedute |

### Distinzione dei layer

| Layer | Responsabilità | Non deve contenere |
| --- | --- | --- |
| `RULE` | Semantica dichiarativa: shape, trigger, save, effect, scaling, cleanup policy | Scritture OBR o stato UI volatile |
| `PLANNER` | Normalizzazione, validazione, membership, trigger, resolution plan | Chiamate UI e commit diretto |
| `EXECUTOR` | Applicare un comando già validato e restituire changes/status | Nuovo sistema parallelo di mutation o reminder |
| `CONTROLLER` | Riconciliare runtime derivato su eventi di scena/turno/movimento | Regole D&D duplicate dentro il loop di reconciliaton |
| `MUTATION` | Serializzare, coordinare e applicare le scritture canoniche | Decisioni di targeting o presentazione |
| `UI` | Mostrare contract, reminder, prompt e controlli GM/player | Calcolo autorevole della membership o della durata |
| `STATE` | Metadata token, scene state, zone/aura runtime e instance linkage | Copie non collegate allo stato canonico |

### Confine esplicito dell'audit

La precedente analisi non entra nel dettaglio di Deferred History né del
workflow Concentration/Undo. In questo documento sono citati soltanto come
punti di integrazione e vincoli: `OUT OF SCOPE — DEFERRED HISTORY /
CONCENTRATION UNDO`. Un nuovo spell non deve introdurre un proprio History o
Concentration framework.

---

## C. Primitive catalog

| Primitive | Tipo | File | Responsabilità | Consumer attuali | Esempio canonico | Estendibilità |
| --- | --- | --- | --- | --- | --- | --- |
| `getSpellDefinition` / `getSpellCatalog` | `STATE` / `UTILITY` | `src/spells-srd.js` | Risolvere la definizione normalizzata e le alias locali | pannello, active spell registry, quick actions | `spirit-guardians` | `CONFIGURABLE`: aggiungere dati al catalogo; non duplicare lookup |
| `SPELL_AREA_RULES` / `getSpellAreaRules` | `RULE` | `src/spellAreaRules.js` | Dichiarare kind, shape, placement, targeting, effect e trigger di area | Guardiani, Fiamma, Unto, Muro, Sfera e catalogo area | `spirit-guardians:aura` | `CONFIGURABLE`: aggiungere una regola conforme allo schema |
| `buildSpellUnifiedPanelContract` | `PLANNER` | `src/spellUnifiedPanelCore.js` | Derivare il contratto comune di input, targeting, placement, save e active actions | ogni workflow nel pannello unificato | Fireball/Guardiani come area; Eyebite come active | `EXTENDABLE` tramite dichiarazioni catalogo/rule; non inserire commit |
| `createSpellPanelSession` / `buildSpellPanelViewModel` | `UI` / `STATE` | `src/spellUnifiedPanelCore.js` | Gestire stato locale, transizioni e controlli visibili | pannello e prepared resolution | Muro di Luce con placement + action | `CONFIGURABLE` per input già dichiarati |
| `getSpellUnifiedAreaEligibility` | `PLANNER` | `src/spellUnifiedAreaAdapter.js` | Stabilire se contract/session appartengono alla transazione area | pannello, quick action | Guardiani automatico | `EXTENDABLE` solo per lane già supportate; non bypassare i gate |
| `buildSpellUnifiedAreaCommand` | `PLANNER` | `src/spellUnifiedAreaAdapter.js` | Adattare sessione e trigger a un comando area serializzabile | pannello, quick action, trigger resolution | Guardiani e Muro di Luce cast | `CONFIGURABLE` per placement/targeting già dichiarati |
| `buildSpellAreaResolutionCommand` | `PLANNER` | `src/spellAreaResolutionCommandCore.js` | Validare target, placement, slot, save outcomes, HP e trigger | unified area, test workflow, reminder resolution | Fireball, Guardiani trigger | `EXTENDABLE` con un nuovo campo contrattuale solo se riusabile |
| `executeSpellUnifiedArea` | `EXECUTOR` | `src/spellUnifiedAreaAdapter.js` | Eseguire il percorso area comune e normalizzare il risultato | pannello e quick actions | Guardiani / Muro / Unto | `INFRASTRUCTURE — DO NOT DUPLICATE` |
| `executeSpellAreaResolution` | `EXECUTOR` | `src/spellAreaResolutionExecutor.js` | Coordinare cast area, HP, zone, trigger e result | unified area, console area | Muro di Luce e aree con HP | `INFRASTRUCTURE — DO NOT DUPLICATE`; estendere solo il command contract |
| `areaMembershipTargetIds` / `areaMembershipPlan` | `PLANNER` | `src/spellAreaMembershipCore.js` | Calcolare inclusione/esclusione, entrata/uscita e operations di effect membership | zone statiche, aure mobili, class/custom aura | Fiamma e Guardiani | `CONFIGURABLE`: filter, includeCaster, padding, effect policy |
| `collectActiveMobileAuras` / `mobileAuraMembershipPlan` | `STATE` / `PLANNER` | `src/spellAuraCore.js` | Scoprire aure attive e delegare membership al core comune | Guardiani, Fiamma, aure di classe/custom | Fiamma | `INFRASTRUCTURE — DO NOT DUPLICATE` |
| `reconcileSpellAuras` | `CONTROLLER` | `src/spellAuraController.js` | Seguire il caster, aggiornare visual, membership e trigger runtime | tutte le spell con `kind: "aura"` | Fiamma e Guardiani | `INFRASTRUCTURE — DO NOT DUPLICATE`; nuove spell = rule data |
| `buildStaticSpellZoneItems` / `reconcileStaticSpellZones` | `CONTROLLER` | `src/spellStaticZone.js` | Creare, seguire, riconciliare e ripulire root/subzone/child zone | Unto, Muro, Sfera, Ragnatela e altre zone | Muro di Luce | `CONFIGURABLE` per placement, child zone e follow mode |
| `planSpellZoneTriggers` | `PLANNER` | `src/spellZoneTriggerCore.js` | Calcolare enter/leave/move/turn-start/turn-end, dedup e pending activation | static zone, spell aura, class/custom aura | Guardiani multi-target | `CONFIGURABLE`: event, frequency, target mode, payload |
| `consumeSpellZoneTrigger` | `STATE` / `MUTATION` | `src/spellZoneTriggerCore.js` | Consumare un'attivazione intera o un singolo target | `reminderResolution.js`, effects side effect | Guardiani con notice indipendenti | `INFRASTRUCTURE — DO NOT DUPLICATE` |
| `mergePlannedSpellZoneTriggerRuntime` | `STATE` | `src/spellZoneTriggerCore.js` | Fondere runtime calcolato con pending concorrenti | controller static/aura | re-arm e movimento | `INFRASTRUCTURE — DO NOT DUPLICATE` |
| `planMobileAuraReminder` | `PLANNER` | `src/spellAuraReminderCore.js` | Comporre trigger plan + notice per aura mobile | Guardiani, Fiamma | Guardiani | `CONFIGURABLE`; nessuna copia per spell |
| `planStaticSpellZoneReminder` | `PLANNER` | `src/spellStaticZoneReminderCore.js` | Comporre trigger plan + notice per zona statica | Unto, Muro, Sfera | Sfera della Tempesta | `CONFIGURABLE`; specializzazione solo per lifecycle statico |
| `zoneTriggerNoticesFromActivation` | `UI` / `PLANNER` | `src/zoneTriggerNoticeCore.js` | Fare fan-out di activation multi-target in notice scoped e deduplicabili | aura/zone reminder, Turn Notice | Guardiani | `INFRASTRUCTURE — DO NOT DUPLICATE` |
| `buildZoneTriggerReminderResolution` | `PLANNER` | `src/reminderResolutionCore.js` | Tradurre activation + target in TS, damage, heal e outcome actions | zone notice, `resolveReminder` | Guardiani, Unto, Muro | `CONFIGURABLE`: ability, damage/healing, outcome actions |
| `buildReminderResolutionPlan` | `PLANNER` | `src/reminderResolutionCore.js` | Validare il target corrente e creare operations di resolution | `resolveReminder` | Hold Person/Monster, Eyebite | `EXTENDABLE` solo tramite action kind esistenti |
| `resolveReminder` | `EXECUTOR` | `src/reminderResolution.js` | Eseguire una resolution GM e consumare il reminder | Turn Notice, warning/controller | Guardiani, Muro, effetti persistenti | `INFRASTRUCTURE — DO NOT DUPLICATE` |
| `runEffectsMutation` | `MUTATION` | `src/effectsMutations.js` | Coordinare commit, serializzazione, side effects e risultato | tutti gli executor e controller effetti | ogni cast con HP/condition/spell | `INFRASTRUCTURE — DO NOT REIMPLEMENT` |
| `conditionMutationOperations` / `spellApplicationOperations` | `MUTATION` | `src/effectsMutations.js` | Generare operations standard per condition e spell instance | executor, reminder, class features | Blocca Persona, Carne in Pietra | `CONFIGURABLE`: payload; non creare writer locale |
| `executeSpellActiveAction` / `executeSpellActiveResolution` | `EXECUTOR` | `src/spellApplicationExecutor.js` | Applicare una action successiva e i suoi effetti/risorse | Fiamma, Muro, Corona, Telecinesi, Eyebite, Debilitazione | Corona di Stelle | `EXTENDABLE` via `spellActiveResolutionRules.js` |
| `executeSpellUnifiedLifecycle` | `EXECUTOR` | `src/spellUnifiedLifecycleAdapter.js` | Gestire cast lifecycle non area e prepared flow | condition spell, prepared/instant cast | Cecità/Sordità, Colpo Intrappolante | `CONFIGURABLE` con catalogo/effect automation |
| `buildQuickActionSpellLaunchPlan` / `executeDirectQuickAction` | `PLANNER` / `EXECUTOR` | `src/quickActionSpellExecutionCore.js`, `src/quickActionExecution.js` | Riutilizzare il workflow spell dalla card | azioni rapide card | Guardiani automatico | `EXTENDABLE` solo aggiungendo casi al contratto comune |
| `turn-notice.ts` | `UI` / `CONTROLLER` | `src/turn-notice.ts` | Proiettare prompt, reminder, dedup, esiti e dismiss | tutte le notice | Guardiani per target, Enervation prompt | `CONFIGURABLE` tramite payload; non duplicare popup |

### Mutation/storage contract

I dati canonici restano:

| Dato | Storage canonico | Primitive di scrittura |
| --- | --- | --- |
| HP | token metadata `com.thebigpicture.initiative/meta`, campi `meta.hp` e `meta.hpMax` | `runEffectsMutation` e i relativi operation plan; gli aggiornamenti visuali sono derivati |
| Conditions | token metadata `com.thebigpicture.initiative/meta` | `conditionMutationOperations` → `runEffectsMutation` |
| Spell instances | token metadata `com.thebigpicture.initiative/meta` / campo spell gestito da `src/spells.js` | `spellApplicationOperations` → `runEffectsMutation`; helper legacy solo tramite il percorso già esistente |
| Zone runtime | item metadata `com.thebigpicture.initiative/spellStaticZone` | `spellStaticZone.js` / area executor, con operations condizioni separate |
| Aura runtime | item metadata `com.thebigpicture.initiative/spellAura` | `spellAuraController.js`, con operations condizioni separate |
| Counters | metadata dell'istanza/effetto gestito dalle action rules | active action executor → `runEffectsMutation` |
| Initiative/turn state | scene metadata `com.thebigpicture.initiative/state` | tracker state layer; i planner lo leggono, non lo sostituiscono |

---

## D. Infrastructure — DO NOT REIMPLEMENT

| Responsabilità | Primitive canonica | Vincolo per i futuri spell |
| --- | --- | --- |
| Effects Mutation | `runEffectsMutation` in `src/effectsMutations.js` | Ogni modifica canonica a metadata, HP, condizioni, spell, counters e side effect deve passare da qui. |
| Operation builders | `conditionMutationOperations`, `spellApplicationOperations` | Comporre operations standard; non scrivere `meta` con un framework locale. |
| Area command | `buildSpellAreaResolutionCommand` | Placement, range, slot, target context e outcome devono essere validati dal command core. |
| Area execution | `executeSpellUnifiedArea` → `executeSpellAreaResolution` | Un nuovo spell non deve avere un proprio area executor. |
| Lifecycle execution | `executeSpellUnifiedLifecycle` → `executeSpellApplication` | Usare il percorso lifecycle per spell non geometriche o prepared. |
| Target membership | `areaMembershipTargetIds`, `areaMembershipPlan` | Include/exclude caster, faction/filter, geometria e enter/leave non vanno riscritti nel file spell. |
| Static zone runtime | `buildStaticSpellZoneItems`, `reconcileStaticSpellZones` | Root, child, follow-caster, orphans e cleanup restano al controller. |
| Mobile aura runtime | `collectActiveMobileAuras`, `reconcileSpellAuras` | Il movimento del caster non richiede un nuovo controller per spell. |
| Trigger/dedup | `planSpellZoneTriggers`, `normalizeSpellZoneTriggerRuntime`, `mergePlannedSpellZoneTriggerRuntime` | Eventi, frequency, turn key e pending sono un contratto condiviso. |
| Partial consumption | `consumeSpellZoneTrigger(runtime, activationId, targetId)` | Una notice risolta non deve cancellare gli altri target della stessa activation. |
| Reminder fan-out | `zoneTriggerNoticesFromActivation` | Un activation multi-target va proiettato in resolution indipendenti senza duplicare il planner. |
| Reminder resolution | `buildZoneTriggerReminderResolution`, `buildReminderResolutionPlan`, `resolveReminder` | TS, half-on-save, damage/healing, condition actions e consume devono restare nel framework reminder. |
| Turn prompt | `turn-notice.ts` e i payload `turnStartPrompt` / action declaration | Availability, dismiss e dedup non vanno implementati in un popup spell-specifico. |
| Active actions | `spellActiveResolutionRules.js` + `executeSpellActiveAction` | Nuove azioni si dichiarano con economy, targeting, resource e resolution già supportati. |
| Cleanup identity-based | `staleMobileAuraEffectRemovals`, `staleAreaMembershipEffectRemovals`, zone reconciler | Rimuovere per `instanceId`/effect identity, mai per nome visualizzato soltanto. |
| Scene epoch/stale guard | `isCurrent`/scene epoch nei command/executor/controller | Ogni executor deve rispettare il risultato stale senza applicare output successivi alla scena precedente. |
| HP source of truth | `meta.hp`, `meta.hpMax` + `actorVitalsStore`/`hpMemory` per i fallback esistenti | Non introdurre campi HP alternativi o larghezze visuali persistenti. |
| History/Undo | framework esistente di `Effects Mutation` | `OUT OF SCOPE — DEFERRED HISTORY / CONCENTRATION UNDO`; mai introdurre uno storico spell-local. |

### Regola pratica

Se un nuovo workflow sta per aggiungere uno dei seguenti elementi, fermarsi e
ricontrollare questa tabella: `*Mutation`, `*Reminder`, `*ZoneController`,
`*AuraController`, `*TurnPrompt`, `*Cleanup`, `*History` o un nuovo writer di
`meta`. Nella maggior parte dei casi la soluzione corretta è configurare o
comporre una primitive esistente.

---

## E. Extension points

### `SPELL_AREA_RULES` / `getSpellAreaRules`

Extension point reale: aggiungere una dichiarazione conforme a
`validateSpellAreaRule` in `src/spellAreaRules.js`.

Variazioni già supportate:

- `kind`: `instant`, `zone`, `aura`, `emission`;
- `geometry`: `circle`, `square`, `cone`, `line`, `rectangle`, con misure in m;
- `placement`: origine caster/caster-adjacent/point, anchor, direction, range;
- `lifecycle`: preview o spell persistente;
- `targeting`: `all`, `hostile`, `friendly`, `includeCaster`, `confirmTargets`;
- `selection`: `area`, `manual`, `area-subset`;
- `effectPolicy`: `on-confirm`, `while-inside`, `manual-trigger`;
- `triggerPolicy` / `zonePolicy`: evento, frequency, resolution, ability,
  target mode, damage/healing, failure condition, success/immune payload e
  `failureAutomation` strutturata per comporre le failed actions della save
  automation della spell;
- movimento zona: fixed/manual/drift, action/bonus-action, limite, choice,
  `triggerOnAreaMove`, `stopOnFirstContact`;
- scaling geometrico o di slot già riconosciuto dal rule/catalog layer.

Typical extension: aggiungere una nuova configurazione a una rule esistente.
Avoid: creare un controller per una singola spell o calcolare manualmente
membership/trigger nel file del catalogo.

### Unified panel e area command

Extension point reale:

- dichiarare input/output nel catalogo e nelle rule;
- selezionare targeting discreto/geometrico/area-subset già supportato;
- dichiarare placement policy e action declaration;
- fornire target context, slot scaling, HP input e outcome per target.

Typical extension: aggiungere un nuovo valore di configurazione o una regola di
validazione condivisibile. Avoid: bypassare `buildSpellAreaResolutionCommand`
con una mutazione da UI.

### `planSpellZoneTriggers`

Extension point reale:

- evento: `cast`, `enter`, `leave`, `move`, `turn-start`, `turn-end`;
- frequency: `once`, `once-per-turn`, `always`;
- target mode: actor, members, direct-members, caster;
- filtri membership e target esclusi/soppressi;
- payload di save, damage, healing, failure condition, success/immune;
- pending activation, `turnKey`, re-arm e consumo parziale.

Typical extension: aggiungere trigger data nella rule. Avoid: un secondo
deduplication map o un reminder scheduler spell-specifico.

### Reminder resolution

Extension point reale:

- `manual-save`, `manual-damage`, `manual-heal`;
- ability, DC, damage/healing e scaling di slot;
- outcome `passed`, `failed`, `immune`;
- action esistenti: apply/remove condition, damage, heal, consume activation,
  break concentration e rimozione parent/child dove il contratto lo dichiara.

Per un trigger di zona che deve riusare gli effetti RAW di un TS già dichiarato
dal catalogo, il contratto è strutturale e backwards-compatible:

```js
resolutionData: {
  ability: "con",
  failureAutomation: "spell-save",
}
```

`buildZoneTriggerReminderResolution` risolve lo `spellId` dell'activation,
richiama `getAreaSaveAutomation`, normalizza con
`normalizeSaveSpellAutomation` e compone le regole `failed` in action standard.
Le action ricevono `parentEffectId` dall'istanza della zona; non viene parsato
`failureEffect` e non viene introdotto un resolver per singola spell.

Fulgore Nauseante è il caso canonico: il fallimento compone 4d10 radiosi,
`Indebolimento` con `exhaustionContribution: true` e l'effetto luce/anti-
invisibilità, entrambi con `expiry: { mode: "concentration" }`. I fallimenti
successivi restano contribution indipendenti; il cleanup usa il parent e la
concentrazione già esistenti.

Typical extension: descrivere `resolutionData`, `failureCondition` o
`failureAutomation` nel trigger. Avoid: applicare condition o HP nel planner,
duplicare la save automation o introdurre cleanup spell-specifico.

### Active actions

Extension point reale in `src/spellActiveResolutionRules.js`:

- `economy`: action o bonus-action;
- `subjectMode`, max target, range/range origin;
- `save` o `attack` e outcome disponibili;
- `damage`, `healing`, `casterHealingFromAppliedDamage`;
- `resource`, counter, `endSpellAtZero`;
- `requiresParentInstance`, `requiresZoneRoot`, `requiredTargetEffectId`;
- `shortenStaticZone`, retarget e turn-start prompt.

Typical extension: aggiungere una action declaration. Avoid: implementare una
seconda action executor.

### Quick actions

Extension point reale in `buildQuickActionSpellLaunchPlan`: il caso automatico
area caster-centered senza scelte utente può delegare direttamente a
`executeSpellUnifiedArea`. Gli altri casi devono ricadere nel pannello o nel
lifecycle adapter. Avoid: aggiungere un terzo percorso di cast.

### Extension point non chiaro

Quando la semantica richiede una capability non presente nello schema, il gap va
documentato prima dell'implementazione. Non introdurre una nuova API “per
analogia” senza prima dimostrare che `CONFIGURE`, `COMPOSE` ed `EXTEND` non sono
sufficienti.

---

## F. Canonical spell reference map

Gli spell di questa sezione sono la baseline già **auditata e verificata**. Sono
esempi di riuso, non elementi da rimettere in coda di audit.

### Guardiani Spirituali — `spirit-guardians`

```text
Spell
├─ cast: spell-unified-panel.js → executeSpellUnifiedArea
├─ targeting: spellAreaRules.js → spirit-guardians:aura; hostile, exclude caster, auto membership
├─ area/zone/aura: spellAreaRules.js → circle radius 4.5 m, kind aura, caster anchored
├─ save: spellAreaRules.js → enter + turn-start, Wisdom, manual-save, once-per-turn, half on save
├─ damage/healing: trigger damage 3d8, slot scaling above 3rd, no healing
├─ persistent state: spellAura metadata + while-inside movement debuff
├─ reminders: spellAuraReminderCore.js → planMobileAuraReminder
├─ turn prompts: zoneTriggerNoticeCore.js → zoneTriggerNoticesFromActivation; turn-notice.ts
├─ active actions: N/A (quick action uses generic direct area path)
├─ cleanup: spellAuraController.js + staleMobileAuraEffectRemovals + parent/child cleanup
└─ mutation: executeSpellAreaResolution → runEffectsMutation; trigger consume per target
```

### Investitura della Fiamma — `xanathar-investitura-della-fiamma`

```text
Spell
├─ cast: spell-unified-panel.js → executeSpellUnifiedArea
├─ targeting: spellAreaRules.js → aura auto, all except caster
├─ area/zone/aura: spellAreaRules.js → :aura; active line → :linea-di-fuoco
├─ save: aura entry/end = N/A; line action uses Dexterity with half on save
├─ damage/healing: aura 1d10 manual-effect; line damage declared in spellActiveResolutionRules.js
├─ persistent state: spellAura membership and caster-linked spell instance
├─ reminders: planMobileAuraReminder
├─ turn prompts: active declaration turn-start/available-after-cast where declared
├─ active actions: spellActiveResolutionRules.js → flame-investiture-line; executeSpellActiveAction
├─ cleanup: aura reconciler and parent concentration cleanup
└─ mutation: area executor / active action executor → runEffectsMutation
```

### Muro di Luce — `xanathar-muro-di-luce`

```text
Spell
├─ cast: buildSpellAreaResolutionCommand → executeSpellAreaResolution
├─ targeting: placement line/zone; initial area targets resolved by geometry
├─ area/zone/aura: spellAreaRules.js → static zone, root item and membership
├─ save: supplementSpellRules.js + areaSaveSpellRules.js → initial Constitution outcome
├─ damage/healing: 4d8 turn-end manual-effect; active beam 4d8
├─ persistent state: static zone, linked blinded effects and wall length
├─ reminders: planStaticSpellZoneReminder
├─ turn prompts: turn-notice.ts for pending zone trigger
├─ active actions: spellActiveResolutionRules.js → wall-of-light-beam; shortens zone by 3 m
├─ cleanup: commitWithStaticSpellZoneRemoval, root/child stale cleanup, parent end
└─ mutation: area executor + active resolution → runEffectsMutation for effects/conditions
```

### Unto — `grease`

```text
Spell
├─ cast: unified area contract → static zone executor
├─ targeting: spellAreaRules.js → zone membership and initial area target set
├─ area/zone/aura: spellAreaRules.js → static zone, difficult terrain membership
├─ save: spellAreaRules.js → Dexterity on entry and turn-end, manual-save
├─ damage/healing: N/A
├─ persistent state: terrain membership + Prone outcome on failed automation
├─ reminders: planStaticSpellZoneReminder
├─ turn prompts: turn-notice.ts
├─ active actions: N/A
├─ cleanup: static zone reconciler, leaving membership, expiry/removal
└─ mutation: conditionMutationOperations → runEffectsMutation
```

### Fulgore Nauseante — `xanathar-fulgore-nauseante`

```text
Spell
├─ cast: unified area contract → executeSpellAreaResolution
├─ targeting: point placement, static circle radius 9 m, membership persistente
├─ area/zone/aura: spellAreaRules.js → static zone, initialResolution none
├─ save: enter + turn-start, Constitution, once-per-turn, manual-save
├─ damage/healing: 4d10 radiant on failed save; zero on success/immune
├─ persistent state: concentration parent + one exhaustion contribution per failure
├─ reminders: planStaticSpellZoneReminder → zoneTriggerNoticesFromActivation
├─ failure actions: resolutionData.failureAutomation = "spell-save" →
│  getAreaSaveAutomation → normalizeSaveSpellAutomation → condition actions
├─ identity: every action uses the static-zone instanceId as parentEffectId
├─ cleanup: existing concentration/parent removal removes only linked levels and light effect
└─ mutation: buildReminderResolutionPlan → runEffectsMutation
```

Evidenza di chiusura: `test/sickeningRadianceZoneComposition.test.js` copre la
composizione dei trigger static-zone, il fallimento con danno/Indebolimento/
anti-invisibilità, l'accumulo e il cleanup per identity. La suite mirata è
verde (156/156) e la build Vite è riuscita.

### Sfera della Tempesta — `xanathar-sfera-della-tempesta`

```text
Spell
├─ cast: unified area contract → executeSpellAreaResolution
├─ targeting: point placement, zone membership; active lightning selects one target
├─ area/zone/aura: static zone, difficult terrain, turn-end trigger
├─ save: spellAreaRules.js → Strength, turn-end, once-per-turn, manual-save
├─ damage/healing: 2d6 zone outcome; active lightning in spellActiveResolutionRules.js
├─ persistent state: static root zone and caster-linked spell instance
├─ reminders: planStaticSpellZoneReminder
├─ turn prompts: active action available after cast
├─ active actions: storm-sphere-lightning, bonus action, executeSpellActiveAction
├─ cleanup: static zone reconciler and parent removal
└─ mutation: zone/active executors → runEffectsMutation
```

### Investitura della Pietra — `xanathar-investitura-della-pietra`

```text
Spell
├─ cast: unified lifecycle/area contract depending on selected phase
├─ targeting: caster-centered effects; active quake uses a selected area
├─ area/zone/aura: spellActiveResolutionRules.js → stone-investiture-quake
├─ save: active quake Dexterity; failure Prone
├─ damage/healing: no base cast damage; active action rule owns its outcome
├─ persistent state: supplementSpellRules.js → stone-investiture effect on caster
├─ reminders: active action / save reminder path
├─ turn prompts: active action declaration
├─ active actions: executeSpellActiveAction
├─ cleanup: effect expiry/concentration and parent cleanup
└─ mutation: executeSpellApplication / active executor → runEffectsMutation
```

### Corona di Stelle — `xanathar-corona-di-stelle`

```text
Spell
├─ cast: unified lifecycle/application path
├─ targeting: one target per launched star, within declared range
├─ area/zone/aura: N/A; counter lives on the parent spell instance
├─ save: N/A; attack outcomes hit/miss
├─ damage/healing: 4d12 radiant on hit; slot/counter rule in active declaration
├─ persistent state: resource stars and parent spell
├─ reminders: turn prompt/active action availability
├─ turn prompts: active action shown after cast
├─ active actions: crown-of-stars-launch, bonus action, consume one star
├─ cleanup: end spell when counter reaches zero or parent ends
└─ mutation: active executor → runEffectsMutation
```

### Telecinesi — `telekinesis`

```text
Spell
├─ cast: unified lifecycle/application path
├─ targeting: single linked target; retarget action revalidates one target
├─ area/zone/aura: N/A
├─ save: declared per Telecinesi contest/save workflow; movement remains table-driven
├─ damage/healing: N/A as base effect
├─ persistent state: parent spell + linked target effect
├─ reminders: active action/turn prompt where declared
├─ turn prompts: action availability
├─ active actions: spells-srd.js → telekinesis-retarget; executeSpellActiveAction
├─ cleanup: linked effect and parent removal
└─ mutation: spell/condition operations → runEffectsMutation
```

### Carne in Pietra — `flesh-to-stone`

```text
Spell
├─ cast: unified lifecycle + save automation
├─ targeting: single target
├─ area/zone/aura: N/A
├─ save: fleshToStoneRules.js → FLESH_TO_STONE_SAVE_AUTOMATION; repeated Constitution saves
├─ damage/healing: N/A
├─ persistent state: restrained effect, progress marker/counter, petrified effect
├─ reminders: fleshToStoneReminderForInstance
├─ turn prompts: repeated save reminder
├─ active actions: N/A; progress is outcome-driven
├─ cleanup: success, two failures, parent removal and marker cleanup
└─ mutation: reminder resolution / condition operations → runEffectsMutation
```

### Cecità/Sordità — `blindness-deafness`

```text
Spell
├─ cast: unified lifecycle/application path
├─ targeting: single target + choice Accecato/Assordato
├─ area/zone/aura: N/A
├─ save: spells-srd.js → conditionOptions saveReminder, Constitution, turn-end
├─ damage/healing: N/A
├─ persistent state: selected condition, manual removal, parent link
├─ reminders: effect save reminder path
├─ turn prompts: effect-save reminder at target turn-end
├─ active actions: N/A
├─ cleanup: save success removes selected condition; parent/target cleanup
└─ mutation: conditionMutationOperations / reminder resolution → runEffectsMutation
```

### Blocca Persona / Blocca Mostri — `hold-person`, `hold-monster`

```text
Spell
├─ cast: unified lifecycle or area-save command when used in multi-target mode
├─ targeting: discrete single/multi target according to contract
├─ area/zone/aura: N/A
├─ save: areaSaveSpellRules.js + spells-srd.js → Wisdom repeated turn-end save
├─ damage/healing: N/A
├─ persistent state: Paralizzato, concentration expiry, parent removal on target
├─ reminders: effect save reminder and, for area mode, zone trigger notice
├─ turn prompts: target turn-end prompt
├─ active actions: N/A
├─ cleanup: passed save removes condition; concentration/parent cleanup
└─ mutation: condition/spell operations → runEffectsMutation
```

### Eyebite — `eyebite`

```text
Spell
├─ cast: unified lifecycle/application path
├─ targeting: one target per active mode
├─ area/zone/aura: N/A
├─ save: active action declares Wisdom save and independent outcomes
├─ damage/healing: mode-specific effects; no generic area damage
├─ persistent state: parent effect and selected mode condition
├─ reminders: effect/active action reminder
├─ turn prompts: active action available on following turns
├─ active actions: spellActiveResolutionRules.js → eyebite-* actions
├─ cleanup: passed/immune target marker, parent end, mode condition removal
└─ mutation: active executor / reminder resolution → runEffectsMutation
```

### Debilitazione / Enervation — `xanathar-debilitazione`

```text
Spell
├─ cast: unified lifecycle/application path
├─ targeting: one linked target
├─ area/zone/aura: N/A
├─ save: initial Dexterity save; repeated action uses declared manual outcome
├─ damage/healing: 4d8 necrotic scaling; caster healing = 0.5 final damage
├─ persistent state: supplementSpellRules.js → enervation-link
├─ reminders: effect/turn prompt for repeat action
├─ turn prompts: callLightningTurnPromptCore.js → enervation-repeat
├─ active actions: spellActiveResolutionRules.js → enervation-repeat
├─ cleanup: linked effect removal ends parent spell
└─ mutation: active executor → HP/effect operations through runEffectsMutation
```

### Riscaldare il metallo — `heat-metal`

```text
Spell
├─ cast: area resolution/application path → danno pieno + scelta immediata post-danno
├─ targeting: un bersaglio collegato all'istanza entro 18 m
├─ area/zone/aura: N/A
├─ save: il danno non dipende dal TS; dopo “Non può / non lascia”, reminder shared → TS Costituzione
├─ damage/healing: 2d8 fuoco al 2° livello, +1d8 per slot superiore, sempre pieno
├─ persistent state: spell instance di concentrazione + marker deferred choice
├─ reminders: scelta immediata `mode: "choice"`; il fallimento del TS applica la penalità
├─ turn prompts: `heat-metal-repeat`, azione bonus, disponibile dal turno successivo e nell'overview
├─ active actions: una sola dichiarazione in `spellActiveResolutionRules.js`; popup mobile shared con box danno e target collegato
├─ cleanup: la penalità scade all'inizio del prossimo turno del caster, indipendentemente dalla concentrazione
└─ mutation: area/active/reminder executors → `runEffectsMutation`; Undo condiviso
```

### Colpo Intrappolante / Ensnaring Strike — `phb2014-colpo-intrappolante`

```text
Spell
├─ cast: spellCastPhaseCore.js → prepared phase / next-hit extension
├─ targeting: target is resolved by the triggering weapon hit
├─ area/zone/aura: N/A until the hit resolves the prepared spell
├─ save: phb2014SpellRules.js → Strength on trigger
├─ damage/healing: ongoing piercing damage at target turn-start, slot scaling
├─ persistent state: ensnaring-strike-ready then restrained + damage effect
├─ reminders: effect save/damage reminder at turn-start
├─ turn prompts: reminder on the linked target turn
├─ active actions: prepared resolution uses lifecycle/application executor
├─ cleanup: concentration, manual removal, parent end
└─ mutation: prepared spell/condition operations → runEffectsMutation
```

### Risata Incontenibile — `hideous-laughter`

```text
Spell
├─ cast: unified lifecycle/application path
├─ targeting: single target
├─ area/zone/aura: N/A
├─ save: spells-srd.js → Wisdom turn-end and damage-triggered save
├─ damage/healing: N/A; damage can grant the additional save condition
├─ persistent state: Prono/Incapacitato, manual removal, parent link
├─ reminders: effect-save reminder
├─ turn prompts: target turn-end
├─ active actions: N/A
├─ cleanup: passed save or parent removal
└─ mutation: condition/reminder resolution → runEffectsMutation
```

### Riferimenti trasversali aggiuntivi

| Famiglia | Spell di riferimento | Primitive da riusare |
| --- | --- | --- |
| Placement e danno area | Fireball e gli area save del catalogo | `spellAreaRules.js`, `buildSpellAreaResolutionCommand`, `executeSpellAreaResolution` |
| Multi-target con esiti indipendenti | Blocca Persona/Mostri, Guardiani | `MULTI_TARGET_SAVE_SPELL_ID_SET`, fan-out notice, resolution per target |
| Zona statica | Unto, Muro di Luce, Sfera | `spellStaticZone.js`, `planStaticSpellZoneReminder` |
| Aura mobile | Guardiani, Investitura della Fiamma | `spellAuraCore.js`, `spellAuraController.js`, `planMobileAuraReminder` |
| Counter e active action | Corona di Stelle | `spellActiveResolutionRules.js`, `executeSpellActiveAction` |
| Retarget | Telecinesi | `telekinesis-retarget`, active action executor |
| Repeat save e cleanup | Carne in Pietra, Cecità/Sordità, Blocca Persona/Mostri | save automation, effect-save reminder, mutation cleanup |
| Danno successivo/cura derivata | Debilitazione, Colpo Intrappolante | active resolution, damage input, HP mutation |

---

## G. Guardiani Spirituali — detailed reuse map

### Configurazione corrente

La regola corrente in `src/spellAreaRules.js` è:

```text
id: spirit-guardians:aura
kind: aura
geometry: circle, radius 4.5 m
placement: origin caster, anchor caster
targeting: hostile, includeCaster false, confirmTargets false
effectPolicy: while-inside → speed multiplier 0.5
triggers:
  enter      → Wisdom manual-save, once-per-turn, 3d8, half on save
  turn-start → Wisdom manual-save, once-per-turn, 3d8, half on save
```

`confirmTargets: false` è intenzionale: la membership viene calcolata e
aggiornata automaticamente dal controller, non confermata a ogni cast.

### Fase per fase

| Fase | Primitive attuale | File | Shared / spell-specific |
| --- | --- | --- | --- |
| Cast | `buildSpellUnifiedAreaCommand` → `executeSpellUnifiedArea` | `src/spellUnifiedAreaAdapter.js`, `src/spell-unified-panel.js` | Shared |
| Creazione aura | `executeSpellAreaResolution`, item persistente `spellAura` | `src/spellAreaResolutionExecutor.js`, `src/spellAuraCore.js` | Shared executor; configurazione spell-specifica |
| Membership iniziale | `mobileAuraTargetIds` → `areaMembershipTargetIds` | `src/spellAuraCore.js`, `src/spellAreaMembershipCore.js` | Shared |
| Movimento caster | `reconcileSpellAuras` segue il caster e ricalcola bounds | `src/spellAuraController.js` | Shared |
| Movimento target | `planMobileAuraReminder` → `planSpellZoneTriggers` | `src/spellAuraReminderCore.js`, `src/spellZoneTriggerCore.js` | Shared |
| Ingresso | activation `enter`, target-scoped notice | `src/spellZoneTriggerCore.js`, `src/zoneTriggerNoticeCore.js` | Shared planner; trigger config specifica |
| Inizio turno | activation `turn-start`, `once-per-turn` | `src/spellZoneTriggerCore.js` | Shared planner; timing specifico |
| Activation | `zoneTriggerNoticesFromActivation` | `src/zoneTriggerNoticeCore.js`, `src/turn-notice.ts` | Shared |
| TS | `buildZoneTriggerReminderResolution` | `src/reminderResolutionCore.js` | Shared; ability/payload specifici |
| Danno | `reminderResolutionDamage`, manual input/half-on-save | `src/reminderResolutionCore.js`, `src/reminderResolution.js` | Shared |
| Uscita | `areaMembershipPlan` + stale membership removal | `src/spellAreaMembershipCore.js`, `src/spellAuraController.js` | Shared |
| Rientro | nuovo `enter` activation secondo trigger runtime e turn key | `src/spellZoneTriggerCore.js` | Shared |
| Cleanup | `staleMobileAuraEffectRemovals`, parent/child cleanup | `src/spellAuraCore.js`, `src/effectsMutations.js` | Shared |
| Mutation | `runEffectsMutation` + side effect `consumeSpellZoneTrigger` | `src/effectsMutations.js`, `src/reminderResolution.js` | Shared |

### REUSED CORRECTLY

- La rule è dichiarativa e non possiede writer o controller dedicati.
- La selezione hostile/exclude-caster è una configurazione di membership.
- L'aura segue il caster tramite `reconcileSpellAuras`.
- Enter, turn-start, frequency e turn key passano da `planSpellZoneTriggers`.
- Una activation multi-target viene fan-outata da
  `zoneTriggerNoticesFromActivation`.
- La resolution per target usa `buildReminderResolutionPlan` e il danno
  half-on-save condiviso.
- La risoluzione consuma solo il target risolto via
  `consumeSpellZoneTrigger(runtime, activationId, targetId)`.
- Conditions, HP e side effect sono coordinati dal mutation layer.

### SPELL-SPECIFIC LOGIC

- raggio di 4,5 m;
- filtro hostile ed esclusione del caster;
- velocità dimezzata mentre il target è dentro;
- TS Saggezza all'ingresso e a inizio turno;
- 3d8 con scaling sopra lo slot base e metà al successo;
- `triggerOnAreaMove: false`, quindi il movimento dell'aura non genera da solo
  una nuova entry resolution.

### POSSIBLE DUPLICATION

Non è stata trovata una pipeline Guardiani separata. Il solo punto da sorvegliare
è l'eventuale reintroduzione, in future patch, di logica locale per:

- dedup per target;
- reminder per ingresso/turn-start;
- rimozione della condition speed;
- consumo di activation.

Tutti questi comportamenti sono già rappresentati dalle primitive condivise.

### MISSING CAPABILITY

Per il workflow corrente dei Guardiani non risulta un gap obbligatorio: cast,
membership, movimento, entry, turn-start, resolution indipendente per target,
half-on-save e cleanup sono rappresentabili attraverso le primitive esistenti.

La regola di Guardiani non dimostra la necessità di una nuova primitive. Eventuali
gap più generali sono elencati in [J. Missing reusable capabilities](#j-missing-reusable-capabilities).

---

## H. Existing architectural duplication

Questa sezione registra rischi osservati senza proporre refactoring.

| Classificazione | File/funzioni coinvolte | Consumer | Primitive già disponibile | Rischio |
| --- | --- | --- | --- | --- |
| `INTENTIONAL SPECIALIZATION` | `spellAreaRules.js`, `areaSaveSpellRules.js`, `supplementSpellRules.js`, `phb2014SpellRules.js`, `spellActiveResolutionRules.js` | spell con semantics diverse | rule/automation registries | Più entry dichiarative sono normali; non sono duplication solo perché hanno lo stesso schema. |
| `INTENTIONAL SPECIALIZATION` | `planMobileAuraReminder`, `planStaticSpellZoneReminder`, `classFeatureAuraReminderCore`, `customAuraReminderCore` | spell aura, static zone, class/custom aura | tutti delegano a `planSpellZoneTriggers` e `zoneTriggerNoticesFromActivation` | Wrapper distinti per ownership/lifecycle diversi; non aggiungere un quinto wrapper per una spell. |
| `INTENTIONAL SPECIALIZATION` | `spellAuraController.js`, `spellStaticZone.js` | aure mobili e zone statiche | membership/trigger core condivisi | I controller possiedono item scena diversi; la differenza è runtime, non un nuovo reminder framework. |
| `UNCERTAIN` | `spell-unified-panel.js`, `quickActionExecution.js`, `spellApplicationExecutor.js` | pannello, card, active/lifecycle | unified adapters | Più entry point possono divergere se un nuovo workflow bypassa il command/adapter comune. |
| `UNCERTAIN` | `spellAreaResolutionExecutor.js` — `updateHP`, `restoreHPIfUnchanged` | area cast e resolution | `runEffectsMutation`, HP metadata canonici | L'executor possiede una transazione HP locale per il proprio commit; non va usata come modello per un nuovo spell writer. |
| `UNCERTAIN` | cleanup nei controller e nell'area executor | fine durata, stale zone/aura, child cleanup | `stale*EffectRemovals`, identity-based reconciler | Più punti devono restare coerenti su `instanceId` e ownership; non introdurre cleanup per nome. |
| `DUPLICATION LIKELY` | eventuali nuovi file `*Reminder*`, `*ZoneTrigger*`, `*AuraController*` per singolo spell | future spell | `spellZoneTriggerCore`, `spellAuraController`, `spellStaticZone` | Stessa responsabilità già coperta senza motivo evidente. Questa forma di proliferazione va bloccata in review. |
| `DUPLICATION LIKELY` | writer diretti di `meta.hp`, `conditions`, `spells` dentro una spell rule/UI | future spell | `runEffectsMutation` | Bypass della coordinazione, dei side effect e dei contratti di storage. |

### Multi-target finding

Il runtime può produrre `activation.targetIds = [A, B, C]`. Il contratto corretto
è:

```text
planner condiviso
    → activation aggregata e deduplicata
    → zoneTriggerNoticesFromActivation
    → notice/resolution scoped per target
    → consumeSpellZoneTrigger(rootActivationId, targetId)
```

Non creare una primitive multi-target parallela. Il fan-out esistente preserva
dedup e pending root, consentendo esiti indipendenti.

---

## I. Spell-specific files assessment

Non risultano controller o mutation framework dedicati esclusivamente a uno
degli spell di riferimento. La logica spell-specific vive soprattutto come
entry in registri condivisi.

| File/blocco | Spell | Responsabilità | Quantità di logica specifica | Uso primitive condivise | Classificazione |
| --- | --- | --- | --- | --- | --- |
| Entry `spirit-guardians:aura` | Guardiani Spirituali | shape, filter, aura effect, two triggers | Bassa: valori e semantica D&D | Completo: membership, aura controller, trigger, notice, mutation | `MOSTLY CONFIGURATION` |
| Entry `xanathar-investitura-della-fiamma:*` | Investitura della Fiamma | aura + line active action | Media: due regole e payload | Completo: area/aura/active executor | `MOSTLY CONFIGURATION` |
| Entry `xanathar-muro-di-luce` | Muro di Luce | initial save, zone trigger, beam/counter | Media-alta: lunghezza e parent action | Riusa zone, reminder, active resolution e mutation | `JUSTIFIED` |
| Entry `grease` | Unto | zone membership, prone save e terrain | Bassa | Riusa static zone e trigger core | `MOSTLY CONFIGURATION` |
| Entry `xanathar-sfera-della-tempesta` | Sfera della Tempesta | zone + active lightning | Media | Riusa static zone, trigger e active action executor | `JUSTIFIED` |
| `fleshToStoneRules.js` | Carne in Pietra | progress 2 failures/2 successes e marker | Alta: progress semantics specifica | Riusa reminder, condition e mutation layer | `JUSTIFIED` |
| `spellActiveResolutionRules.js` entry | Eyebite, Corona, Telecinesi, Debilitazione | active action declarations | Variabile, prevalentemente dati | Usa active action executor comune | `MOSTLY CONFIGURATION` |
| `spells-srd.js` `AUTOMATION` / `SAVE_AUTOMATION` | Cecità/Sordità, Hold, Risata, Carne in Pietra | condition, repeated save, expiry | Bassa-media | Usa lifecycle/reminder/mutation | `MOSTLY CONFIGURATION` |
| `supplementSpellRules.js` / `phb2014SpellRules.js` entry | Debilitazione, Colpo Intrappolante, Muro | effect/condition/phase declaration | Variabile | Usa application/reminder/mutation | `MOSTLY CONFIGURATION` |
| `spellAreaResolutionExecutor.js` | non singolo spell | executor area condiviso | Zero spell-specifico come responsabilità | È infrastruttura | `INFRASTRUCTURE — DO NOT DUPLICATE` |
| `spellAuraController.js` / `spellStaticZone.js` | più spell | reconciler runtime | Zero spell-specifico come responsabilità | È infrastruttura | `INFRASTRUCTURE — DO NOT DUPLICATE` |

### Regola per la review di un nuovo file

Un nuovo file con il nome di una sola spell è giustificato soltanto se contiene
una regola semantica che non può essere espressa nei registri o nei planner
esistenti. Se contiene storage, cleanup, reminder, target tracking o scene
reconciliation, la classificazione iniziale deve essere
`POSSIBLE OVER-SPECIALIZATION` finché non viene dimostrato il contrario.

---

## J. Missing reusable capabilities

### Gap provati al confine dell'audit

```text
Capability: Risoluzione automatica di resistenze/vulnerabilità/immunità e dadi
  con risultato di danno completamente regolamentare.
Needed by: Spell che vogliono trasformare un reminder di danno in un calcolo
  automatico completo.
Closest existing primitive: reminderResolutionDamage in
  src/reminderResolutionCore.js.
Why current primitive is insufficient: calcola full/half/zero dal risultato
  dichiarato e dal dado inserito, ma non interpreta il profilo difensivo del
  target né sostituisce il tiro al tavolo.
Evidence: il contratto `manual-damage` e la UI di Turn Notice richiedono input
  GM; il catalogo documenta il limite a reminder informativi/manuali.
```

```text
Capability: Semantica completa di movimento direzionale/forzato con costo e
  collisione derivati dalla traiettoria.
Needed by: spell che impongono movimento verso/contro una direzione o un bordo.
Closest existing primitive: areaMembershipPlan, planSpellZoneTriggers e
  movement mechanics.
Why current primitive is insufficient: le primitive osservano membership e
  posizione finale e possono creare reminder, ma non risolvono ogni percorso,
  costo direzionale o interazione fisica.
Evidence: le regole di zona supportano eventi di movimento, mentre i casi di
  costo dipendente dalla direzione/forced movement restano esplicitamente
  limitati nella documentazione operativa.
```

Questi gap non giustificano automaticamente una nuova primitive: prima di
progettare una soluzione va verificato se il comportamento può restare manuale
come reminder, oppure essere composto con le primitive esistenti.

Per Guardiani Spirituali non è stato dimostrato alcun missing capability
bloccante.

---

## K. Reuse checklist for future spells

```text
[ ] Can this be configuration only?
[ ] What is the closest canonical spell in section F?
[ ] Is this discrete targeting, geometric targeting, area-subset, zone or aura?
[ ] Which existing primitive handles range, placement and target filtering?
[ ] Does slot scaling already exist in the selected rule/command contract?
[ ] Which existing membership core handles enter/leave and include/exclude caster?
[ ] Can the trigger be expressed with event + frequency + target mode?
[ ] Are save outcomes independent per target and fan-out through the notice core?
[ ] Are damage/healing/conditions described as resolution data rather than written locally?
[ ] Does the workflow use runEffectsMutation for every canonical token mutation?
[ ] Is the persistent instance linked by instanceId, spellId, casterId and parent/child IDs?
[ ] Can an existing static-zone/aura reconciler own movement and cleanup?
[ ] Are turn prompts, availability, consumption and dismiss declared in existing contracts?
[ ] What cleanup happens on expiry, save, invalid target/source, counter zero or parent end?
[ ] Which targeted tests cover cast, movement/turn, independent outcomes, cleanup and stale state?
```

---

## L. Batch strategy e suggerimenti per il lavoro futuro

### Criterio di selezione

Un batch è pronto quando raggruppa spell che condividono la stessa capability
runtime e differiscono soprattutto per dati. Non raggruppare solo per livello o
manuale. Per ogni batch registrare:

1. primitive già disponibili;
2. spell canonica di confronto;
3. variazioni di configurazione attese;
4. regole realmente specifiche;
5. test di lifecycle e cleanup;
6. eventuale gap non ancora rappresentabile.

### Batch consigliati dopo la baseline verificata

Completati dopo l'ultimo audit: `Ragnatela` (`web`) è ora una baseline per zona
statica con placement puntuale, membership persistente, trigger di ingresso e
inizio turno, TS indipendenti, condizione collegata e cleanup; `Muro di Fuoco`
(`wall-of-fire`) è il riferimento per una zona statica con forma alternativa,
lato caldo, fascia adiacente, attraversamento su segmento e danno manuale
scalabile; `Nube Incendiaria` (`incendiary-cloud`) completa lo stesso workflow
con placement obbligatorio, TS iniziale/di ingresso/fine turno, fan-out per
bersaglio, scaling e movimento della zona lasciato manuale. Anche `Arma Sacra`
e `Controllare Venti` sono ora auditati e approvati: la prima chiude
l'esplosione con Condition nativa, reminder TS indipendente dalla
concentrazione e popup di turno; la seconda chiude il popup delle modalità, le
pill sintetiche e il reconcile immediato senza swept-area trigger. Non sono più
candidati P1; anche il batch multi-target (`Anatema`, `Benedizione`, `Lentezza`,
`Confusione`, `Parola Radiosa`) e le zone statiche `Nube di Pugnali`/
`Nube Maleodorante` sono auditati e approvati. Per `Parola Radiosa` resta solo
il follow-up visuale del tema colore dell'area; i risultati sono registrati
nell'audit di automazione.

| Priorità | Batch candidato | Spell candidate da verificare nel catalogo | Primitive riusabili | Perché è il prossimo passo naturale | Rischio principale |
| ---: | --- | --- | --- | --- | --- |
| 1 | Azioni ricorrenti e counters | altre spell con azione successiva non approvata | `spellActiveResolutionRules.js`, `executeSpellActiveAction`, resource/counter, turn notice | `Invocare il fulmine`, `Spada Arcana`, `Lama del Disastro`, `Sguardo Penetrante`, `Arma Sacra`, `Controllare Venti` e `Riscaldare il metallo` sono golden references già approvate; restano da verificare i casi non chiusi | parent instance stale, consumo anche su miss, fine spell a counter zero |
| 2 | Save persistenti e cleanup condizionale | `Paura`, `Dominare Persone/Mostri`, altri condition effect con save repeat | effect-save reminders, condition options, `buildReminderResolutionPlan`, mutation cleanup | Riusa i contratti già verificati per Cecità/Sordità, Hold, Risata e Carne in Pietra | parent/target cleanup, vantaggio/svantaggio, terminazione per evento esterno |
| 3 | Prepared/next-hit e danno persistente | `Punizione Incandescente`, `Punizione Tonante`, `Raffica di Spine`, `Marchio del Cacciatore` | `spellCastPhaseCore.js`, lifecycle adapter, `spellApplicationOperations`, reminders | Colpo Intrappolante dimostra il modello prepared → extend → effect persistente | transizione prepared/resolve e collegamento con l'attacco che innesca |
| 4 | Aree istantanee con placement e scaling | `Fulmine`, `Cono di Freddo`, `Tempesta di Ghiaccio`, altre area-save non approvate | area rule, placement grid, target filtering, slot geometry/scaling, area executor | È il batch a minor costo architetturale se il workflow è realmente istantaneo | differenza tra area geometrica e target discreti/area-subset |

### Ordine raccomandato

Per massimizzare il riuso e la copertura del rischio:

```text
active actions/counters
        → persistent saves/cleanup
        → prepared next-hit
        → remaining instantaneous areas
```

La priorità può cambiare se il backlog operativo richiede una spell specifica,
ma non va cambiata solo per evitare la ricerca del contratto più vicino.

### Exit criteria per chiudere un batch

- ogni spell è classificata come configuration, composition o specialized rule;
- nessun nuovo mutation/reminder/zone/aura controller è stato introdotto senza
  un gap documentato;
- cast e resolution passano da command/executor condivisi;
- i target multipli hanno esiti indipendenti e consumo scoped;
- movement, turn-start/end, expiry e invalid source/target sono coperti;
- il cleanup è identity-based e non lascia parent/child orfani;
- test mirati e build sono verdi; eventuali failure fuori perimetro sono
  dichiarate separatamente.

---

## M. Audit e change protocol

Prima di modificare una spell:

1. leggere la rule e il catalog entry reali, non solo il test;
2. tracciare il call path dal pannello o dalla card fino all'executor;
3. identificare chi scrive realmente ogni campo coinvolto;
4. cercare uno spell canonico con la stessa geometria/lifecycle;
5. classificare il lavoro: `CONFIGURATION`, `COMPOSITION`, `SHARED BUG`,
   `SPELL-SPECIFIC RULE` o `MISSING CAPABILITY`;
6. verificare le guardie di scene epoch e stato stantio;
7. verificare il comportamento per più target e resolution parziali;
8. aggiungere test al livello della primitive e al livello dello spell;
9. eseguire build e test mirati prima di qualsiasi suite ampia;
10. aggiornare questo documento soltanto quando cambia un contratto runtime,
    una primitive canonica o la priorità dei batch.

### Snapshot di verifica usato come baseline

La fase precedente ha verificato le modifiche di reuse del percorso Guardiani con
suite mirate area/aura/zone/quick action e con la build. Il build è risultato
completato con il solo warning Vite sui chunk grandi. La suite completa contiene
failure/stall già riconducibili al perimetro History/Undo, che resta il confine
esplicito di questo documento e non deve essere interpretato come prova che il
workflow spell corrente sia privo di rischi.

---

## Glossary rapido

| Termine | Significato in questo documento |
| --- | --- |
| Rule | Dato/regola pura che descrive la semantica dello spell |
| Planner | Funzione che calcola un piano senza commit |
| Executor | Funzione che applica un command/request validato |
| Controller | Loop GM che riconcilia runtime derivato su eventi della scena |
| Activation | Evento di trigger persistente o informativo, con target IDs e turn key |
| Notice | Proiezione UI di un'activation, scoped per target quando necessario |
| Parent spell | Instance principale che possiede durata/concentrazione |
| Child effect/zone | Effetto, zona o marker collegato a parent e instance |
| Canonical metadata | Fonte autorevole token/scene/item da cui derivano le view |
| Partial consume | Rimozione di un solo target da un'activation aggregata |
| Stale | Risultato calcolato su una scena/epoch non più corrente |
