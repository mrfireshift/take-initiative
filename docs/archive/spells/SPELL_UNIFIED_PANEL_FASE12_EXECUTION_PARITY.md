# Fase 12 — Execution Parity

## Risultato

Il pannello unificato resta l’unico punto di lancio. Il contratto decide la lane e l’adapter, mentre la sessione decide gli input della fase corrente. Un campo `damageType`, un’azione futura o una descrizione di danno non fanno più comparire da soli un input HP durante il cast.

Le mutation HP continuano a passare dagli executor esistenti (`spellAreaResolutionExecutor`, `spellApplicationExecutor` e le mutation canoniche). Restano quindi la cronologia, Undo, la riconciliazione a 0 HP, `hpMemory` e la sincronizzazione delle barre.

## Conteggi di parità

Conteggi dell’audit iniziale:

| Stato | Lifecycle | Area | Note |
| --- | ---: | ---: | --- |
| Contratti esposti | 254 | 137 | 391 record UI |
| Cast accettati dall’audit | 235 | 141 | quattro pedine passano dall’adapter area |
| Non accettati | — | — | 15 cast |
| Ulteriori fallimenti | — | — | 5 errori di validazione/comando |

Il controllo aggiornato calcola ora 391 contratti, 246 eligibilità lifecycle e 145 eligibilità area, senza record non instradati. Il test sintetico completo costruisce ViewModel e request/command per tutti i 391 record: nessun fallimento.

Le differenze fra i conteggi statici e quelli dell’audit precedente sono dovute alla promozione a percorso canonico di attacchi single-target, Heat Metal e delle risoluzioni `prepare → resolve`; non sono state aggiunte spell al catalogo.

## Semantica dei 15 cast recuperati

### Cast lifecycle senza HP iniziale

| Spell | Semantica del cast | Risoluzione successiva |
| --- | --- | --- |
| Punizione Marchiante (`branding-smite`) | buff/preparazione; nessun danno arbitrario al cast | danno al prossimo colpo d’arma |
| Favore Divino (`divine-favor`) | buff personale | bonus ai colpi d’arma |
| Sogno (`dream`) | cast narrativo; eventuale danno dipende dalla variante | variante e risoluzione manuale |
| Segugio Fedele (`faithful-hound`) | crea l’effetto persistente senza danno iniziale | attacco del segugio |
| Scudo di Fuoco (`fire-shield`) | buff personale | danno reattivo |
| Lama Infuocata (`flame-blade`) | crea l’arma e la concentrazione | attacchi successivi |
| Allucinazione Mortale (`phantasmal-killer`) | applica l’effetto iniziale | TS/danno ricorrente a fine turno |
| Produrre Fiamma (`produce-flame`) | il cast può essere usato come luce | l’attacco opzionale è separato |
| Tocco del Vampiro (`vampiric-touch`) | crea la concentrazione senza danno | attacchi successivi |

Le policy sono dichiarate in `src/spellCastResolutionRules.js`. `execution.hasHP` resta disponibile per compatibilità, ma gli input e la lane usano `castHasHP`, `phaseHasHP`, `activeActionHasHP`, `tokenHasHP` e `deferredHP` in base alla fase.

### Attacchi immediati

`chill-touch`, `guiding-bolt` e `ray-of-frost` usano il command builder area discreto con una risoluzione single-target esplicita. La sessione richiede `hit` o `miss` e il danno; un mancato colpo produce fattore `zero`, mentre un colpo applica gli effetti collegati:

- Tocco Gelido: blocco della cura;
- Dardo Tracciante: vantaggio al prossimo attacco;
- Raggio di Gelo: riduzione della velocità.

Gli effetti on-hit sono aggiunti dall’executor soltanto per `hit`/`critical` e condividono history, Undo e mutation con gli HP.

### Riscaldare il Metallo

Il cast iniziale dichiara danno manuale, bersaglio e concentrazione nel contratto area. L’azione successiva `heat-metal-repeat` è una risoluzione single-attack nel popup active: usa 2d8 fuoco, richiede `hit`/`miss` e applica “Svant. attacchi e prove” solo su `hit`. Il danno non viene più mascherato da un piano che applica soltanto la condizione; l’azione duplicata proveniente dai cataloghi viene normalizzata per ID.

### Active action future

`eyebite` e `xanathar-colpo-dello-zefiro` restano cast lifecycle al lancio. La presenza di azioni disponibili soltanto dopo il cast non rende il lifecycle iniziale ineleggibile; le azioni compaiono poi nell’overview e restano delegate a `spellUnifiedActiveAdapter`.

## Risoluzioni secondarie e active action

Le risoluzioni secondarie usano questi percorsi:

- attacchi immediati: command area discreto, esito esplicito, HP solo su colpo;
- Heat Metal: popup single-attack con danno e penalità on-hit;
- Raffica di Spine: `prepare` lifecycle, poi `resolve` area con placement, TS e danno dell’area;
- Freccia Folgorante: `prepare` lifecycle, poi `resolve` area con danno sostitutivo sul bersaglio e danno secondario;
- Spada Arcana e Arma Spirituale: popup single-attack con root, portata e scaling dello slot;
- Lama del Disastro: fino a due righe di attacco, `hit`/`miss`/`critical`, con formula critica 4d12 + 8d12 e una sola mutation aggregata per target.

La Lama conserva separati il movimento della pedina e la risoluzione del danno. Il popup invia una lista di attacchi; l’executor calcola gli HP in sequenza, consolida il patch metadata finale e applica una sola riconciliazione a 0 HP.

## Prepare → resolve parent-bound

Per `phb2014-raffica-di-spine` e `phb2014-freccia-folgorante`:

1. `prepare` usa il lifecycle adapter e crea l’istanza preparata;
2. l’overview costruisce la richiesta di `resolve` con caster, slot, bersagli e `parentInstanceId`;
3. `resolve` usa il contratto area e `spellAreaResolutionExecutor`;
4. l’executor verifica che la concentrazione live abbia lo stesso `instanceId` e `spellId`;
5. la rottura della concentrazione è scoped al parent verificato e appartiene alla stessa transazione;
6. parent mancante, stale o già consumato vengono rifiutati prima della mutation.

## Stato audit approvato

La documentazione di audit dichiara **PASS** per entrambe le spell di riferimento della tranche:

| Spell | Stato | Contratto operativo |
| --- | --- | --- |
| Freccia Folgorante (`phb2014-freccia-folgorante`) | PASS | Preparazione concentrata sul caster; risoluzione senza `attackOutcome`; danno primario finale inserito manualmente dal GM; click sul bersaglio primario che ancora automaticamente l’area di 3 m; TS Destrezza e danno secondario con scaling dello slot; consumo scoped e transazione composita. |
| Coltello di Ghiaccio (`xanathar-coltello-di-ghiaccio`) | PASS | Bersaglio primario dell’attacco, danno perforante iniziale manuale, esplosione indipendente, TS Destrezza, danno secondario e scaling secondo il descriptor; dadi e modificatori restano manuali al tavolo. |

In entrambi i casi `Hit`, `Miss`, `Critical` e `attackOutcome` non fanno parte del contratto UI approvato.

## Gap dichiarati manuali

Questi casi non riportano più `operations-required` come falso successo:

- Mano Arcana: Pugno e Afferra/Stritola restano azioni manuali al tavolo; la modalità della pedina viene comunque aggiornata tramite `entityAction`;
- Collera della Natura: Rocce resta una risoluzione manuale descrittiva;
- Investitura del Ghiaccio: il Cono Gelido automatizza velocità dimezzata sui falliti selezionati, mentre il danno resta esplicitamente manuale;
- qualsiasi danno opzionale non dichiarato come input della fase non viene inventato dall’executor.

## Quick Action e routing

Il modello spell v2 conserva solo:

```js
{
  version: 2,
  id, label,
  kind: "spell",
  spellId,
  targetMode,
  slotLevel,
  turns,
  applyAutomations,
  launchMode: "auto" | "review"
}
```

In lettura, v1 `workflow: "spell"` diventa `auto`, `workflow: "area"` diventa `review` e l’assenza di workflow diventa `auto`. La lettura non scrive metadata; il salvataggio esplicito della scheda normalizza e scrive soltanto v2.

`buildQuickActionSpellLaunchPlan()` è l’unica decisione direct/review. `auto` esegue direttamente solo un lifecycle sicuro e completo; `review` apre sempre `spell-unified-panel.html`. Area, placement, TS/attacco, HP, varianti, target context, zone, pedine, active action, prepared spell e stato ambiguo vanno in review.

I messaggi cache/client che riportano `panel: "quick-hp"` vengono convertiti al boundary in `intent: "spell-cast"` e `panel: "spells"`; il valore legacy non entra nel route canonico. Le nuove spell non vengono mai aperte in Quick HP. Condizioni e capacità mantengono i propri workflow.

## File e componenti

Componenti principali aggiornati:

- contratto/sessione/ViewModel: `src/spellUnifiedPanelCore.js`, `src/spellUnifiedPanelViewCore.js`;
- adapter/command/executor: `src/spellUnifiedLifecycleAdapter.js`, `src/spellUnifiedAreaAdapter.js`, `src/spellAreaResolutionCommandCore.js`, `src/spellAreaResolutionExecutor.js`;
- fasi e concentrazione: `src/spellCastPhaseCore.js`, `src/spellCastResolutionRules.js`, `src/spellLifecycleOperationsCore.js`, `src/saveSpellOperationsCore.js`;
- attacchi e active action: `src/spellAttackResolutionCore.js`, `src/spellActiveActionCore.js`, `src/spellActiveResolutionCore.js`, `src/spellActiveResolutionRules.js`, `src/spellActiveResolutionValidation.js`, `src/spellApplicationExecutor.js`, `src/spell-active-resolution.js`;
- routing e quick action: `src/quickActionSpellExecutionCore.js`, `src/quickActionExecution.js`, `src/quickActionsCore.js`, `src/initiative-card-modal.js`, `src/initiativeList.js`, `src/trackerQuickActions.js`;
- shell/popup: `spell-unified-panel.html`, `src/spell-unified-panel.js`, `spell-active-resolution.html`, `spellUnifiedPopupProtocol`;
- console manuale: `quick-hp-modal.html`, `src/quick-hp-modal.js`.

`src/spells-panel.js` è stato rimosso perché non ha caller runtime dopo il cutover. `spells-modal.html` e `ctx-spells.html` restano redirect e conservano query string/hash. Il redirect potrà essere rimosso dopo almeno una release senza campagne, bookmark, macro o client in cache che lo utilizzino.

## Test automatici

`test/spellUnifiedExecutionParity.test.js` verifica tutti i 391 record, i 15 cast, gli attacchi, Heat Metal, le active action future, le aree rappresentative, Esilio, le due spell prepare/resolve, le tre active action precedentemente senza operations e i cantrip senza slot.

Sono inoltre coperti:

- mapping Quick Action v1/v2 e assenza di scrittura automatica;
- direct/review per self, target singolo, attacco, area, cantrip area, Esilio e active action futura;
- concentrazione e conferma sostituzione;
- parent instance mancante/stale e break scoped;
- popup active/prepared, completato, annullato, chiuso e fallito;
- Quick HP manuale, HP canonici, History e Undo;
- routing globale, card e quick action.

Comandi:

```text
npm.cmd test
npm.cmd run build
```

## Smoke test OBR

Da eseguire manualmente dopo il build:

1. Esilio: scegliere `current-plane`/`other-plane` e applicare;
2. Creare Falò: placement e commit senza slot;
3. Raggio di Gelo: colpito/mancato, danno e velocità;
4. Sguardo Penetrante: cast iniziale e azione successiva;
5. Riscaldare il Metallo: cast iniziale e Ripeti calore;
6. Arma Spirituale: creazione pedina e attacco;
7. Raffica di Spine: prepare e resolve dall’overview;
8. Quick Action area: review, placement e commit;
9. Undo di una transazione HP e di una transazione persistente;
10. invocazione di una nuova quick action mentre Spells è già aperto.

## Rollback e rischi residui

Il rollback è il ripristino del set di file della Fase 12 da una revisione nota; non richiede né autorizza migrazioni metadata. I dati v1 restano leggibili e nessun token viene riscritto automaticamente.

Rischi residui da verificare in OBR:

- la validazione live deve restare coerente con `meta.hp`/`meta.hpMax` e con l’epoch della scena;
- la sostituzione della concentrazione deve essere confermata prima della mutation diretta;
- parent instance stale e doppio submit devono restare rifiutati atomicamente;
- le transazioni area/pedina e le risoluzioni active devono produrre un’unica history coerente con Undo;
- i redirect e i fallback di lettura legacy vanno mantenuti finché non termina il periodo di compatibilità.
