# Attacchi PG — fase 0 (piano)

Stato: **piano, nessun codice scritto**. Da approvare prima dell'implementazione (AGENTS.md: la patch tocca HP sync e barre HP mappa, anche se solo riusando il percorso boss).

## Obiettivo

Registrare l'attacco di un attore (PG, compagno, PNG alleato) a un bersaglio come **un comando unico**:

- esito: Colpito / Critico / Mancato;
- danno inserito dal GM come **totale per componente tipizzata** (es. 9 taglienti + 7 radianti);
- difese del bersaglio (resistenza/immunità/vulnerabilità) applicate per tipo, con anteprima e "ignora";
- HP canonici (`meta.hp`, `meta.hpMax`) aggiornati tramite il coordinatore mutation;
- una voce History (Undo) e una voce Combat Log con attaccante, azione, esito, bersaglio e delta HP;
- proiezioni post-danno esistenti: barra HP mappa, testo HP, `hpMemory`, etichette condizioni, avviso concentrazione, promemoria TS da danno.

## Fuori perimetro (fasi successive)

Riders (Attacco Furtivo, Punizioni, manovre), contatori per turno, slot incantesimo, TS e condizioni al colpo, secondi bersagli, attacchi multi-bersaglio, tiro dei dadi, validazione di vantaggio/portata/proprietà dell'arma. Solo GM.

## Cosa dice il catalogo privilegi (input per non bloccare le fasi 1–3)

Scansione euristica di `class-features-runtime.json` (860 privilegi; descrizione che cita colpire/tiro per colpire/attacco con arma **e** danni): **96 privilegi** legati agli attacchi.

| Stato runtime | N. | Note |
| --- | --- | --- |
| `implemented` (adapter `condition` / `resource-only`) | 49 | Manovre del Maestro di Battaglia, frecce dell'Arciere Arcano, rune, Mano del Dolore, Palmo Tremante… Già attivabili oggi come privilegi separati. |
| `not-automated` | 47 | Attacco Furtivo, Punizione Divina (+ Migliorata), Colpo Divino, Sterminatore di Colossi, Punizione Occulta, Furia Divina, Lame Psichiche… |

Conseguenza: la fase 1 deve soprattutto **collegare** attivazioni già esistenti all'attacco e aggiungere pochi rider "componente extra". La fase 0 quindi deve già produrre, e nient'altro:

1. un `attackInstanceId` stabile (= `commandId`/`correlationId`) a cui agganciare in seguito le attivazioni;
2. il `turnKey` corrente (da `currentInitiativeTurnKey`) nella causalità, base del futuro "una volta per turno" (che è per **turno**, non per round);
3. `outcome: "critical"` distinto da `"hit"` (dadi raddoppiati di Punizione/Furtivo, Critico Brutale);
4. `range: "melee" | "ranged"` (Punizione Divina e Migliorata solo mischia; Furtivo accurata o a distanza);
5. componenti con tipo di danno separato (il radiante della Punizione non va sommato al tagliente).

Proprietà dell'arma (accurata), tipo creatura del bersaglio, livello slot: **non** in fase 0. Il sanitizer scarta i campi sconosciuti, quindi aggiungerli dopo è additivo.

## Contratto dati

### `src/quickActionsCore.js`

- `QUICK_ACTION_KINDS`: aggiungere `"attack"` in coda.
- `sanitizeQuickAction`: nuovo ramo `kind === "attack"`, prima del ramo condizione finale:

```js
{
  version: QUICK_ACTION_VERSION, // resta 2
  id, label, kind: "attack",
  targetMode: "selection",       // forzato
  range: "melee" | "ranged",     // default "melee"
  components: [                  // 1..3, altrimenti null
    { id: "c1", type: "slashing", formula: "1d8+3" },
  ],
}
```

- `id` delle componenti assegnati per posizione (`c1`..`c3`) dal sanitizer: deterministici, nessuna identità da persistere.
- `type` ∈ `DAMAGE_TYPES` di `damageDefensesCore.js`; tipo sconosciuto → azione scartata.
- `formula` opzionale, testo ≤ 24 caratteri, **solo suggerimento visivo**: mai valutata.
- Persistenza: nel profilo dell'attore (`quickActions` della card), come gli altri kind. Nessuna nuova chiave metadata, nessun nuovo campo nel token.

Compatibilità: un client con build precedente scarta il kind sconosciuto e, se risalva la card, lo perde. Accettabile perché tutti i client caricano la stessa build pubblicata; da annotare nel changelog.

## Moduli nuovi

### `src/pcAttackCore.js` (puro: niente SDK, DOM o stato)

- `PC_ATTACK_OUTCOMES = ["hit", "critical", "miss"]`.
- `buildPcAttackMutation({ action, sourceItem, targetItem, outcome, componentAmounts, attackInstanceId, ignoredDefenses, expectedDefenses, turnState })` → `{ change, damageComponents, causality, operations, options }`, stessa forma del ramo attacco di `buildBossActionMutation`:
  - controlli: `isBossActionCreature` su sorgente e bersaglio (esclude ID virtuali Lair/Epic/Paragon), sorgente ≠ bersaglio, azione sanitizzata di kind `attack`, esito valido, importi validi (`damageAmount`), nessuna componente sconosciuta;
  - danno: `defendedComponents(components, inputs, miss ? "zero" : "full", targetItem, ignoredDefenses, expectedDefenses, false)`; il critico usa il fattore pieno perché i totali inseriti includono già i dadi raddoppiati;
  - HP: `calculateQuickHPChange` su `meta.hp`/`meta.hpMax` (i PF temporanei, codificati come `hp > hpMax`, si consumano per primi come oggi);
  - operazioni: un solo `hp:set` con `hpIntent: { mode: "damage", amount, eventId: attackInstanceId }`, `expectedHP`/`expectedHPMax` da `bossMetadataSnapshot`; nessuna operazione su un mancato;
  - `metadataPatches`: assert dell'`initiativeCard` della sorgente (la quick action non è cambiata) e, se c'è danno, del bersaglio (`targetProfileAssert`: difese invariate);
  - nessuna `sceneMetadataPreconditions` (niente contatori di round).
- Causalità (`history.payload.causality`), letta dal Combat Log senza modifiche:

```js
{
  actor: { id, tokenId, name, role: "attacker" },
  cause: { kind: "pc-attack", quickActionId, actionName, attackInstanceId, range },
  action: { id: quickActionId, label, attackOutcome: outcome },
  attack: { range, outcome },
  turn: bossConditionAppliedAt(turnState), // { round, actorId, phase, turnKey } oppure null
  targets: [{ id, name, outcome, requestedDamage, appliedHpDelta, damageComponents }],
}
```

- `options`: `commandId = correlationId = attackInstanceId`, `sourceId`, `targetIds: [targetId]`, `kind: "pc-attack"`, `label: "<attore>: <azione> → <bersaglio>"`, `history: { kind: "pc-attack", label, payload: { causality, damageComponents } }`.

### `src/pcAttackExecution.js` (runtime, iniettabile come `createBossActionRuntime`)

`createPcAttackRuntime({ api, getCard, getSceneContext, runMutation, requireApplied, postDamage, getEpoch, isCurrentEpoch })`:

- `getPcAttackPresentation(sourceId, actionId)`: ruolo GM, epoch, scena, sorgente reale, `findQuickAction(card, actionId)` di kind `attack`; restituisce item, azione, bersagli candidati (`bossActionTargets`), `turnState`, `sceneIdentity`.
- `executePcAttack(request)`: copia lo schema di `executeBossAction`:
  - `busy` per sorgente;
  - rilettura di sorgente, card e bersaglio; stale-scene guard dopo ogni await;
  - `decisionKey` + mappa `drafts` per il retry con ACK perso (stessa identità con decisioni diverse → rifiuto; duplicato → risultato memorizzato);
  - `runMutation(operations, { ...options, sharedHp, sceneIdentity, sceneEpoch })`, `requireApplied` con lo stesso messaggio di conflitto;
  - `postDamage` una volta sola, mai sui duplicati;
  - riepilogo: esito, componenti difese, HP prima/dopo, `historyEntryId`, `undoAvailable`.

### `pc-attack.html` + `src/pc-attack.js` + `src/pcAttackLauncher.js`

- Launcher: `openPcAttackPopover(sourceId, actionId)` con `openTrackedPopover`, come `openBossActionsPopover` (solo GM, niente ID virtuali).
- UI compatta (obiettivo ~300–400 righe, non i 1900 di `boss-actions.js`), riusando gli helper puri di `bossActionsViewCore.js`, generici nonostante il nome: `bossActionTargets`, `bossSelectionTarget`, `reconcileBossDraftTarget`, `bossSelectionHint`, `bossDamageTypeLabel`, `bossDefendedDamage`, `bossTargetLabel`; più `buildSharedHpPreview`/`renderSharedHpControls` per i bersagli con HP condivisi.
- Contenuto: intestazione (attore → azione, mischia/distanza); bersaglio sincronizzato con la selezione mappa (stessa regola dei boss: segue la selezione finché la bozza è intatta); tre pulsanti di esito; un campo per componente con tipo e formula suggerita (disabilitati su Mancato); anteprima difese con "ignora"; anteprima HP prima → dopo.
- **Registra** esegue il commit e lascia il popover aperto con lo stesso bersaglio, esito e importi azzerati (Attacco Extra, due armi). **Chiudi** chiude.

## Modifiche a file esistenti (minime)

| File | Funzione / punto | Modifica |
| --- | --- | --- |
| `src/quickActionsCore.js` | `QUICK_ACTION_KINDS`, `sanitizeQuickAction` | kind `attack` + ramo sanitizer |
| `src/bossActionExecutionCore.js` | `damageAmount`, `defendedComponents`, `targetProfileAssert` | aggiungere `export`, nessun altro cambiamento |
| `src/bossActionExecution.js` | `postBossDamage` | aggiungere `export`, nessun altro cambiamento |
| `src/quickActionExecution.js` | `executeDirectQuickAction` | guardia iniziale: `attack` → `{ mode: "review", reason: "attack-requires-resolution" }` (non deve mai arrivare al planner spell) |
| `src/initiativeList.js` | solo `__runTrackerQuickAction` | ramo `kind === "attack"` prima di `executeDirectQuickAction`: GM-only, apre il popover, ritorna `{ mode: "review", route: "pc-attack" }`. Nessun tocco a `renderAll`, turno o ordine. |
| `src/trackerQuickActions.js` | `trackerQuickActionSummary` | `Attacco · mischia · 2 componenti` |
| `src/tracker-quick-actions.js` | `render` (icona) | `⚔` per `attack` |
| `src/initiative-card-modal.js` | opzioni kind dell'editor, riga editor, `collectQuickActions`, `quickActionReference`, `quickActionSummary`, esecuzione dalla card | opzione "Attacco", select mischia/distanza, editor 1–3 componenti (tipo + formula), ramo di raccolta, apertura del popover |
| `vite.config.js` | `rollupOptions.input` | voce `pcAttack: pc-attack.html` |

Esportare le funzioni private del boss è meno invasivo che spostarle in un modulo condiviso (che toccherebbe il percorso boss). Contro: `pcAttackExecution.js` importa `bossActionExecution.js`, che al caricamento istanzia il runtime boss (solo closure, lo store è lazy). Lo spostamento si può fare dopo, come refactor isolato.

## Rischi (AGENTS.md) e mitigazioni

- **HP sync / barre mappa / hpMemory**: nessun nuovo percorso. `hp:set` passa dal coordinatore con snapshot attesi; le proiezioni sono le stesse funzioni dei boss (`syncHPBarNow`, `syncHPTextBatchNow`, `syncHPBatchToMemory`).
- **Turno attivo / ordine**: solo lettura di `state` per `turnKey`; nessuna scrittura della scene metadata.
- **Metadata**: nessuna chiave nuova; la card si salva col percorso esistente (merge); assert su `initiativeCard` contro definizioni o difese stantie.
- **`initiativeList.js`**: un solo ramo in `__runTrackerQuickAction`.
- **Kind History**: `monster-action` non è registrato altrove, quindi il coordinatore accetta kind arbitrari. **Da verificare** in implementazione (`assertSerializableCommand` e il journal Undo) prima di scrivere il resto.

## Test (`npm test`)

- `test/quickActionsCore.test.js`: attacco valido; tipo sconosciuto; 0 o più di 3 componenti; `range` di default; `targetMode` forzato; campi extra scartati.
- `test/pcAttackCore.test.js` (nuovo):
  - colpito, critico e mancato (nessuna operazione HP);
  - resistenza su una sola componente (tagliente dimezzato, radiante pieno); immunità; vulnerabilità; difesa ignorata;
  - `expectedDefenses` diverse → errore; importi non validi; PF temporanei consumati;
  - sorgente = bersaglio, ID virtuale, bersaglio senza HP canonici → errore;
  - forma di causalità e `options`.
- `test/pcAttackExecution.test.js` (nuovo, API mock): solo GM; retry con ACK perso idempotente; stessa identità con decisioni diverse → rifiuto; `postDamage` chiamato una volta, mai sui duplicati; messaggio di conflitto.
- `test/trackerQuickActions.test.js`: riepilogo `attack`.
- Tutti i test boss esistenti invariati (le modifiche sono solo `export`).
- `npm run build`.

## Verifica manuale in Owlbear Rodeo

1. Creare l'azione "Spada lunga" (mischia, 1d8+3 tagliente) e "Spada sacra" (tagliente + radiante) su un PG.
2. ⚡ → Spada lunga → bersaglio selezionato sulla mappa → Colpito, 9 → HP e barra mappa aggiornati, voce History, voce Combat Log con attaccante ed "Esito attacco: Colpito".
3. Bersaglio resistente al tagliente: anteprima dimezzata solo sul tagliente; "ignora" ripristina il pieno.
4. Mancato: nessun cambio HP, voce di log presente.
5. Due "Registra" consecutivi (Attacco Extra) → due voci History distinte; Undo della seconda ripristina solo quella.
6. Bersaglio concentrato → avviso concentrazione come per i boss.
7. Bersaglio in gruppo HP condivisi → controlli HP condivisi.

## Decisioni aperte

1. **Categoria Combat Log**: `pc-attack`, come `monster-action` oggi, finisce in "Altro" (`combatEventCategory`); la facet HP resta visibile. Proposta: fase 0 invariata, poi una micro-patch CL che porti entrambi in una categoria "Attacco" o in "HP".
2. **`QUICK_ACTION_VERSION`** resta 2 (kind additivo). Alternativa: 3, che cambia l'output di tutte le azioni esistenti.
3. **Popover dopo il commit**: resta aperto per l'attacco successivo (proposta) oppure si chiude.
