# Audit UX/UI comparativo e specifica del pannello Spells unificato

## Stato del documento

- Fase: progettazione UX/UI.
- Scope: audit read-only e specifica dell’interfaccia adattiva finale.
- Nessuna modifica a HTML, CSS, controller, executor o regole di dominio durante l’audit.
- Worktree verificato pulito all’inizio e alla fine dell’analisi.
- Build e test non eseguiti: questa fase è esclusivamente progettuale.

## Decisione architetturale

La soluzione raccomandata è un unico shell adattivo con tre lane funzionali:

1. `spell-lifecycle`
2. `area-transaction`
3. `active-resolution`

La view non deve conoscere gli ID degli incantesimi né dedurre il comportamento da durata, `areaCandidate`, classi CSS o tipo di popover. Deve renderizzare esclusivamente il contratto normalizzato di `src/spellUnifiedPanelCore.js`.

Il contratto è già testato per Palla di fuoco, Anatema, Catena di fulmini, Mano arcana, Raffica di Spine, Investitura della Fiamma e Sfera della Tempesta in `test/spellUnifiedPanelCore.test.js`.

Prima del collegamento alla nuova UI, il contratto deve esplicitare alcuni dati oggi ancora impliciti: durata, slot, concentrazione runtime, placement opzionale, primario di Catena di fulmini, input HP/danno, trigger, feedback e undo.

## Sorgenti analizzate

- `spells-modal.html`
- `src/spells-panel.js`
- `src/spellsPanelAutomationViewCore.js`
- `src/spellsPanelCatalogMenu.js`
- `src/spellsPanelTargetPicker.js`
- `src/spellsPanelOverviewView.js`
- `src/spellsPanelCasterSummaryView.js`
- `src/spellsPanelFormWorkflow.js`
- `src/spellsPanelViewCore.js`
- `quick-hp-modal.html`
- `src/quick-hp-modal.js`
- `src/quickHpAreaWorkflowCore.js`
- `src/areaSaveSpellRules.js`
- `src/spellAreaRules.js`
- `src/saveSpellCore.js`
- `src/saveSpellOperationsCore.js`
- `src/spellApplicationExecutor.js`
- `spell-active-resolution.html`
- `src/spell-active-resolution.js`
- `src/spellUnifiedPanelCore.js`
- `public/popover-glass.css`
- `public/ui-typography.css`
- `public/ui-scrollbars.css`
- `src/popoverDrag.js`
- `src/popoverDragHost.js`
- `src/initiativeList.js`

## Flusso corrente

### Spells

`spells-modal.html` contiene:

```text
catalogo
  ↓
caster / durata / slot / concentrazione
  ↓
automazioni e varianti
  ↓
target picker discreto
  ↓
executeSpellApplication()
  ↓
overview degli incantesimi attivi
  ↓
active action o popup spell-active-resolution
```

`src/spells-panel.js` gestisce catalogo, selezione OBR, caster, automazioni, overview e lifecycle. `src/spellsPanelFormWorkflow.js` valida la form e costruisce il payload per l’executor.

Limiti attuali:

- nessun placement per un nuovo lancio ad area;
- nessun esito TS per bersaglio;
- nessuna preview HP;
- nessun undo immediato visibile;
- il riepilogo concentrazione previsto dal controller usa `concWrap` e `concList`, assenti nell’HTML;
- `cancel` ed `end` sono referenziati dal controller ma non presenti nell’HTML;
- il pulsante di chiusura è collegato solo nel percorso con `source`;
- le active actions possono aprire un secondo popover.

### Console effetti ad area

`quick-hp-modal.html` e `src/quick-hp-modal.js` seguono questo flusso:

```text
modalità HP / effetti
  ↓
catalogo area o condizione manuale
  ↓
caster / slot / variante / placement
  ↓
target matrix
  ↓
preview HP + esiti TS + contesto per bersaglio
  ↓
applyOperation()
  ↓
history composita / zone / pedine / undo
```

`applyOperation()` gestisce HP canonici, condizioni, concentrazione, zone, pedine, trigger, history, sincronizzazione visuale e rollback. Questa console è funzionalmente più completa, ma concentra molte responsabilità nel controller.

### Popover

Entrambi i popover vengono aperti a `560 × 760` in `src/initiativeList.js`, con:

- ancoraggio top-left;
- `disableClickAway: true`;
- `hidePaper: true`;
- margine di 12 px;
- posizione persistita da `src/popoverDragHost.js`;
- esclusione reciproca tramite `TRACKER_POPOVER_IDS`.

Il tema comune è limitato a vetro, bordo, blur e tipografia in `public/popover-glass.css`. Il Quick HP contiene numerosi override CSS duplicati e sovrapposti.

Il popup `spell-active-resolution.html` è separato, con dimensioni variabili `360 × 320`, `360 × 520` o `360 × 600`, stile viola dedicato e propria gestione di placement, TS, attacco, danno e commit.

## Disposizione dei controlli esistenti

Le decisioni usano queste categorie:

- **conservare**: stessa funzione, eventualmente con rifinitura;
- **modernizzare**: stessa funzione, nuovo componente o accessibilità;
- **rendere contestuale**: visibile solo quando dichiarato dal workflow;
- **spostare**: stessa funzione in una sezione più coerente;
- **sostituire**: nuova rappresentazione o nuovo contratto UI;
- **eliminare dopo la migrazione**: duplicato o controllo legacy.

### Spells

| Controllo | Decisione | Collegamento normalizzato |
|---|---|---|
| `name`, `spellMenuToggle`, `spellMenu` | Conservare e modernizzare | `presentation.catalog` |
| Filtri catalogo `Tutti`, `Concentrazione`, `Area/TS`, `Effetti` | Conservare, rendere dati | `presentation.catalog.filters` |
| `dur` | Conservare, rendere contestuale | `presentation.duration` |
| `caster` | Conservare | `controls.caster`, `presentation.caster` |
| `slotLevel` | Conservare e sostituire l’input libero con opzioni | `controls.slot-level`, `presentation.slot` |
| `conc` | Sostituire con badge/stato più riepilogo concentrazione | `presentation.concentration`, `phase.plan.concentrationAction` |
| `applyConditions` | Conservare solo per workflow con automazione esplicita | `presentation.automation` |
| `automationText` | Sostituire con riepilogo strutturato | `presentation.automation.summary` |
| `conditionChoice` | Conservare, separando variante, effetto e scelta TS | `presentation.choices`, `presentation.choice` |
| `createMobileAura` | Rendere contestuale | `presentation.capabilities.mobileAuraOptional` |
| `submit` | Spostare nel footer comune | `viewState.primaryAction` |
| Contatore bersagli | Conservare nel riepilogo | `viewState.selection` |
| `spellTargetNameFilter` | Conservare | `controls.targets`, `targeting.filter` |
| Filtri fazione | Conservare e condividere con Quick | `targeting.filter` |
| `spellTargetList` | Sostituire con `TargetMatrix` | `targeting.mode` |
| `spellOverviewList` | Conservare, spostare in sezione “Attivi” | `presentation.activeActions`, lifecycle runtime |
| Riferimento enciclopedia | Conservare come azione secondaria | `spell.id`, `spell.label` |
| Termina bersaglio / termina gruppo | Conservare, contestualizzare | lane `spell-lifecycle` |
| `Risolvi` preparato | Conservare, spostare nella card attiva | `phase.selected`, `activeActions` |
| Active action e sue varianti | Conservare, rendere card di azione | `presentation.activeActions` |
| HP pedina board token | Conservare, spostare nella card pedina | `execution.hasTokens`, `capabilities.boardToken` |
| Posiziona pedina mancante | Conservare nel placement della pedina | `presentation.placement.mode = board-token` |
| `concWrap`, `concList`, `cancel`, `end` mancanti | Eliminare dopo migrazione | sostituiti da shell, concentrazione e footer comuni |
| `modalClose` | Conservare, correggere il percorso globale/card | stato del popover |

### Console effetti ad area

| Controllo | Decisione | Collegamento normalizzato |
|---|---|---|
| Modalità `save`, `damage`, `heal`, `temp` | Modernizzare in `Incantesimo` / `Manuale` | `presentation.intent` |
| `amount` | Conservare, rendere contestuale | `execution.inputs.hpAmount` |
| Tab incantesimo/condizione | Sostituire con sezioni contestuali | `presentation.workflowKind` |
| `spellSearch`, `spellMenuToggle`, `spellMenu` | Unificare con catalogo Spells | `presentation.catalog` |
| `spellSelect` nascosto | Eliminare dopo migrazione | il combobox diventa unica fonte |
| `concentrationNotice` | Conservare e portare nella barra contesto | `presentation.concentration` |
| `spellReferenceSlot` | Conservare nel contesto spell | `spell.id` |
| `spellCaster` | Conservare | `controls.caster` |
| `spellSlot` | Conservare, uniformare a Spells | `controls.slot-level` |
| `spellRuleChoice` | Conservare come variante esplicita | `presentation.choices` |
| `areaPlacement` | Conservare, spostare nella fase targeting | `presentation.placement` |
| `spellRuleSummary` | Conservare come riepilogo automazioni | `presentation.automation` |
| `spellTargetLimit` | Conservare come validazione inline | `presentation.targeting.workflow` |
| `chainPrimary` | Conservare, ma normalizzare | `targeting.primaryTarget` |
| Condition/source/expiry/actor/duration | Conservare solo per workflow manuale | `presentation.manualEffect` |
| `targetLock` / `unlockTargets` | Conservare | `runtime.targeting.locked` |
| Filtri nome/fazione | Conservare e condividere | `controls.targets`, `targeting.filter` |
| Target rows | Modernizzare in `TargetMatrix` | `targeting.mode`, `execution.hasHP` |
| Preview HP | Conservare | `execution.hasHP`, `execution.inputs.hpAmount` |
| Factor buttons | Conservare solo per modalità manuali | `presentation.manualEffect.factors` |
| Esiti TS | Conservare | `controls.save-outcomes` |
| Target context | Conservare | `controls.target-context` |
| Bulk actions | Conservare, contestualizzare | `presentation.capabilities.bulkOutcomes` |
| `status` | Conservare come banner `aria-live` | `viewState.feedback` |
| `summary` | Conservare nel footer sticky | `viewState.summary` |
| `apply` | Conservare come primary action dinamica | `viewState.primaryAction` |
| `undo` | Conservare e promuovere | `execution.undo.available` |
| `close` | Conservare nello shell comune | stato del popover |

### Popup di active resolution

| Controllo | Decisione |
|---|---|
| `place` | Spostare nella fase placement |
| `childCount`, `childDepths` | Conservare, contestuali a `child-zone` |
| `bulkOutcomes`, target outcomes | Conservare nella `TargetMatrix` |
| `damage`, `attackDamage` | Conservare come input di risoluzione |
| `attackTarget`, `attackOutcomes` | Conservare come sezione attacco |
| `status`, `summary` | Unificare con il feedback principale |
| `apply` | Sostituire con il footer comune |
| popup separato | Eliminare dopo la parità funzionale |

## Contratto UI finale

Il contratto attuale espone già:

```text
presentation.phase
presentation.subjectMode
presentation.targeting
presentation.placement
presentation.controls
presentation.choices
presentation.capabilities
presentation.activeActions

execution.lane
execution.lanes
execution.requiresCompositeUndo
execution.hasHP
execution.hasZones
execution.hasTokens
execution.activeResolution
```

La view deve comportarsi così:

- `controls.includes("targets")` → mostra `TargetMatrix`;
- `targeting.mode = none` → nessuna selezione bersagli;
- `targeting.mode = discrete` → bersagli scelti individualmente;
- `targeting.mode = geometric` → placement/preview geometrico;
- `controls.includes("placement")` → mostra placement;
- `placement.automatic = true` → non mostrare un pulsante di placement manuale;
- `controls.includes("save-outcomes")` → mostra esiti TS;
- `controls.includes("attack-outcomes")` → mostra esiti attacco;
- `controls.includes("target-context")` → mostra contesto per bersaglio;
- `activeActions.length > 0` → mostra azioni attive;
- `execution.hasHP` → mostra preview/input HP;
- `execution.hasZones` → mostra riepilogo zone e trigger;
- `execution.hasTokens` → mostra stato pedina;
- `execution.requiresCompositeUndo` → il commit deve produrre un’azione undo composita.

Campi da aggiungere o rendere espliciti:

```text
presentation.catalog
presentation.duration
presentation.slot
presentation.caster
presentation.concentration
presentation.automation
presentation.manualEffect
presentation.targeting.primaryTarget
presentation.placement.policy
presentation.feedback

execution.inputs
execution.zoneTrigger
execution.undo
```

Gap importanti:

1. `Sfera della Tempesta` ha `zonePolicy.placementOptional`, ma il contratto deve distinguere `available`, `required`, `automatic` e `optional`.
2. `Catena di fulmini` richiede primario, limite secondari e validazione spaziale; questi dati devono uscire dal workflow normalizzato.

Questi casi non devono essere risolti dalla view con controlli su `spell.id`.

## Wireframe comune

```text
┌──────────────────────────────────────────────┐
│ Spell / modalità attiva       C  Libro     X │
├──────────────────────────────────────────────┤
│ Catalogo / ricerca                           │
│ Fase · Caster · Durata · Slot · Concentrazione│
├──────────────────────────────────────────────┤
│ Configurazione contestuale                   │
│ Variante · automazioni · placement           │
├──────────────────────────────────────────────┤
│ Bersagli / area / pedina                     │
│ TargetMatrix o preview mappa                 │
├──────────────────────────────────────────────┤
│ Feedback · riepilogo · validazioni            │
├──────────────────────────────────────────────┤
│ Annulla     Annulla ultima     AZIONE PRIMARIA│
└──────────────────────────────────────────────┘
```

## Flussi richiesti

### 1. Spell diretta

```text
Catalogo → caster/durata/slot → bersagli discreti → riepilogo → Applica
```

- `targeting.mode = discrete`;
- nessun placement;
- eventuale automazione contestuale;
- lane primaria `spell-lifecycle`;
- primary: `Applica a N bersagli`.

### 2. Multi-target senza area

Esempi: Anatema, Catena di fulmini.

```text
Catalogo → caster/slot → primario se richiesto → target matrix + TS → Applica
```

- `targeting.mode = discrete`;
- `controls.save-outcomes`;
- Catena usa `targeting.primaryTarget` e `targeting.spatial`;
- primary disabilitata finché limiti e distanze non sono validi;
- HP mostrati solo se `execution.hasHP`.

### 3. Area istantanea

Esempio: Palla di fuoco.

```text
Catalogo → caster/slot → Posiziona area
         → preview bersagli → esiti TS + HP → Applica effetti
```

- `targeting.mode = geometric`;
- `placement.required = true`;
- target lock dopo conferma mappa;
- primary iniziale: `Posiziona area`;
- primary post-placement: `Applica a N bersagli`;
- lane: `area-transaction`;
- undo composito obbligatorio.

### 4. Zona persistente

Esempio: Sfera della Tempesta.

```text
Catalogo → caster/slot/concentrazione
         → posizionamento opzionale o richiesto
         → TS iniziale → crea zona / applica
         → card trigger e active action
```

- `execution.hasZones = true`;
- placement governato da `placement.policy`;
- riepilogo distinto tra effetto iniziale, zona, trigger e active action;
- primary senza zona: `Applica effetto iniziale`;
- primary con placement: `Crea zona e applica`.

### 5. Aura

Esempio: Investitura della Fiamma.

```text
Caster → aura automatica → conferma lifecycle
      → card trigger → active action “Linea di fuoco”
```

- `placement.automatic = true`;
- nessun pulsante di placement manuale per l’aura iniziale;
- `targeting.filter = hostile`;
- primary iniziale: `Applica al caster`;
- active action successiva con placement lineare, target matrix, TS e HP.

### 6. Board token

Esempio: Mano arcana.

```text
Caster/slot → Posiziona pedina → crea token
           → stato pedina + HP + azioni disponibili
```

- `execution.hasTokens = true`;
- `placement.mode = board-token`;
- nessun target picker per il cast iniziale;
- le azioni successive riaprono la `TargetMatrix`;
- primary iniziale: `Posiziona pedina`;
- primary post-placement: `Crea pedina`.

### 7. Spell preparata

Esempio: Raffica di Spine.

```text
Catalogo → Fase: Preparazione | Risoluzione
```

Preparazione:

```text
Caster + slot + durata → Prepara sul caster
```

Risoluzione:

```text
Fase Risoluzione → placement area → TS/HP → Risolvi
```

- `phase.options` determina la tab;
- cambiando fase si azzerano placement, target, esiti e contesti;
- caster e slot possono essere mantenuti se ancora validi;
- il lifecycle preparato resta visibile nella sezione Attivi.

### 8. Spell ibrida

Esempi: Investitura della Fiamma, Sfera della Tempesta.

```text
Cast lifecycle
  ↓
entità persistente
  ↓
active action
  ↓
placement/target/TS o attacco
```

Il pannello deve distinguere “Incantesimo mantenuto”, “azione disponibile” e “risoluzione dell’azione”. Lanes: `spell-lifecycle`, `area-transaction`, `active-resolution`.

### 9. Spell manuale

```text
Manuale → condizione/effetto → fonte → durata/scadenza
        → bersagli → riepilogo → Applica effetto
```

- nessuna selezione automatica da catalogo;
- `presentation.manualEffect` esplicito;
- supporta condizione, fonte, scadenza, attore, durata/occorrenze ed eventuale HP;
- primary: `Applica condizione` o `Applica effetto`.

### 10. Active spell

```text
Attivi → selezione active action → economia/variante
       → target o placement → esiti → Risolvi
```

- `execution.lane = active-resolution`;
- `presentation.activeActions` è la sorgente dei pulsanti;
- `resolutionKind` determina save-area, single-attack o child-zone;
- nessun popup secondario nella UI finale.

### 11. Zone trigger

```text
Trigger ricevuto → spell/caster/bersagli precompilati
                 → target lock
                 → TS + danno suggerito
                 → Risolvi attivazione
```

- `execution.zoneTrigger.activationId`;
- `runtime.targeting.locked = true`;
- sblocco solo come correzione esplicita;
- il commit consuma il trigger;
- undo ripristina anche il runtime della zona.

## Stati e azioni primarie

| Stato | Azione primaria |
|---|---|
| Loading | nessuna, shell skeleton |
| Nessuna spell | `Seleziona un incantesimo`, disabilitata |
| Configurazione incompleta | azione disabilitata, focus sul primo campo invalido |
| Placement richiesto | `Posiziona area` / `Posiziona pedina` |
| Placement pendente | `Attendi conferma sulla mappa` + annulla placement |
| Placement confermato | `Applica`, `Crea zona e applica` o `Crea pedina` |
| Esiti TS incompleti | `Applica` disabilitata |
| Commit | `Applicazione…`, controlli bloccati |
| Commit riuscito | `Nuova applicazione`, Undo disponibile |
| Undo disponibile | `Annulla ultima applicazione` |
| Errore | draft conservato, focus sul campo responsabile |
| Zone trigger | `Risolvi attivazione` |
| Active action | `Risolvi <azione>` |

## Gerarchia e responsive

### Sempre visibili

- titolo e spell corrente;
- chiusura;
- feedback;
- riepilogo sintetico;
- footer con Annulla e primary;
- Undo quando `execution.undo.available`.

### Contestuali

- fase: solo se `phase.options.length > 1`;
- caster: solo se `controls.caster`;
- slot: solo se `controls.slot-level`;
- durata: tramite `presentation.duration`;
- concentrazione: tramite `presentation.concentration`;
- placement: tramite `controls.placement`;
- target matrix: tramite `controls.targets`;
- TS: tramite `controls.save-outcomes`;
- attacchi: tramite `controls.attack-outcomes`;
- active actions: tramite `presentation.activeActions`;
- zone/pedina: tramite `execution.hasZones` / `execution.hasTokens`;
- automazioni manuali: tramite `presentation.automation` o `presentation.manualEffect`.

### Desktop

- popover nominale 560 px;
- barra contesto in due colonne;
- target matrix con preview e controlli sulla stessa riga;
- riepilogo e footer sticky;
- sezione Attivi collassabile sotto il workflow corrente.

### Finestra stretta

- larghezza effettiva `viewport - 24 px`;
- una colonna;
- target row su più righe;
- controlli principali con altezza minima 44 px;
- filtri a scorrimento orizzontale o menu compatto;
- footer sempre visibile;
- descrizioni ridotte, mai i dati di validazione;
- nessuna variazione funzionale basata solo sul breakpoint.

Gli override duplicati del Quick HP devono essere sostituiti da un unico stylesheet del pannello.

## Reset dello stato

Quando cambia spell:

- reset di fase dipendente;
- reset di variante;
- reset di placement e preview;
- reset di esiti TS;
- reset di target context;
- reset del primario Catena di fulmini;
- reset di active action;
- reset di zone trigger;
- reset di errori e feedback;
- reset della durata al default dichiarato;
- ricalcolo di slot e concentrazione.

La selezione OBR può essere mantenuta solo dopo rivalidazione. Non devono essere riutilizzati esiti o contesti della spell precedente.

Quando cambia fase o active action si applica lo stesso reset alle sole sezioni dipendenti, mantenendo caster e spell padre se ancora validi.

## Feedback, commit e undo

Il pannello deve distinguere:

- loading dati;
- validazione locale;
- placement pendente;
- placement annullato;
- placement confermato;
- commit in corso;
- commit riuscito;
- commit fallito;
- undo in corso;
- undo riuscito o non più disponibile.

Il feedback deve usare `aria-live`, mantenere il draft in caso d’errore e non eseguire rollback visivi manuali dalla view.

L’Undo deve essere alimentato da `execution.undo`, non dalla semplice presenza di un bottone. Se esistono modifiche successive, il pannello deve indirizzare alla Cronologia.

## Accessibilità

- usare `fieldset`/`legend` per gruppi di workflow;
- implementare il combobox con tastiera, `aria-activedescendant`, Escape e ripristino del focus;
- usare tab semantici con navigazione da tastiera;
- evitare doppia interazione riga + checkbox nella target matrix;
- usare `aria-pressed` per esiti, fattori e selezioni;
- non affidarsi solo al colore per TS, HP o stato;
- usare `aria-live="polite"` per stato e `assertive` per errori di commit;
- mantenere target touch di almeno 44 px nella finestra stretta;
- spostare il focus su Undo o primary dopo un commit riuscito.

## Rischi principali

1. Placement opzionale delle zone: distinguere `available`, `required`, `automatic` e `optional`.
2. Catena di fulmini: normalizzare primario, limiti e distanze.
3. Concentrazione: esporre stato attivo e azioni `replace`, `extend`, `dismiss`, `trigger`.
4. Duplicazione della selezione OBR tra Spells e Quick.
5. Active resolution separata: preservare validazione, `sceneEpoch`, zone figlie e history.
6. Zone e pedine: richiedono undo composito.
7. HP: usare esclusivamente `meta.hp` e `meta.hpMax`.
8. Responsive: il frame OBR resta nominalmente 560×760 se il controller non diventa viewport-aware.
9. Accessibilità del combobox e della target matrix.
10. Rimozione delle euristiche residue come `isChainLightningSpell`, `placementRule.kind` e `callLightningCloudPending` dalla view.

## Componenti UI minimi

1. `UnifiedPopoverShell`
2. `SpellCatalogCombobox`
3. `WorkflowContextBar`
4. `PhaseSelector`
5. `AutomationAndVariantPanel`
6. `TargetMatrix`
7. `PlacementStage`
8. `ActiveSpellSection`
9. `ZoneTriggerBanner`
10. `ManualEffectPanel`
11. `ReviewFooter`
12. `FeedbackBanner`

## File candidati per l’implementazione futura

La fase successiva può introdurre, senza modificare subito executor o regole:

- `spell-unified-panel.html`;
- `src/spell-unified-panel.js`;
- `src/spellUnifiedPanelViewCore.js`;
- stylesheet condiviso del pannello;
- integrazione successiva dei percorsi di apertura in `src/initiativeList.js`;
- migrazione graduale dei due HTML e controller esistenti;
- ritiro di `spell-active-resolution.html` solo dopo parità funzionale.

Da preservare invariati durante la migrazione:

- `src/spellApplicationExecutor.js`;
- `applyOperation()` fino a quando il nuovo controller non sarà verificato;
- `src/spellAreaRules.js`;
- `src/areaSaveSpellRules.js`;
- `src/spellUnifiedPanelCore.js` come sorgente del contratto;
- metadati HP canonici e history composita.
