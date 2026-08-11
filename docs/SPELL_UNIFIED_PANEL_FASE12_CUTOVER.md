# Fase 12 — Cutover del pannello Spells e normalizzazione delle Azioni Rapide

## Architettura finale

Il lancio di un incantesimo ha ora un solo dominio UI principale:

- `spell-unified-panel.html` / `src/spell-unified-panel.js` ricevono le richieste `intent: "spell-cast"`;
- `src/spellUnifiedPanelCore.js` costruisce e normalizza il contratto dell’incantesimo;
- gli adapter lifecycle, placement, zone, pedine e i popup active/prepared eseguono le singole fasi specialistiche;
- `src/spellUnifiedPopupProtocol.js` mantiene la sincronizzazione fra popup subordinati e pannello;
- `quick-hp-modal.html` / `src/quick-hp-modal.js` sono una console esclusivamente manuale per danno, cura, HP temporanei e condizioni;
- `spells-modal.html` e `ctx-spells.html` restano redirect leggeri verso il pannello unificato, conservando query string e hash.

Le Azioni Rapide descrivono l’intento di cast. Non memorizzano più il pannello di destinazione e non distinguono più fra “spell” e “area”. La decisione direct/review è centralizzata in `buildQuickActionSpellLaunchPlan()`.

## Modello Quick Action v2

Una spell action salvata usa il seguente contratto:

```js
{
  version: 2,
  id,
  label,
  kind: "spell",
  spellId,
  targetMode,
  slotLevel,          // opzionale
  turns,              // opzionale
  applyAutomations,
  launchMode: "auto" | "review"
}
```

Il modello non contiene `workflow` né `panel`. Le condizioni e le capacità continuano a usare i propri workflow e i propri routing.

### Mapping v1 → v2

| Formato letto | Formato interno |
| --- | --- |
| `workflow: "spell"` | `launchMode: "auto"` |
| `workflow: "area"` | `launchMode: "review"` |
| `workflow` assente | `launchMode: "auto"` |
| `launchMode` già valido | viene mantenuto |

La compatibilità è in lettura. La sanitizzazione non scrive metadata. Il salvataggio esplicito della scheda scrive soltanto v2; non viene eseguita una migrazione massiva dei token e non vengono conservati insieme `workflow` e `launchMode`.

## Piano direct/review

`buildQuickActionSpellLaunchPlan()` sanifica l’azione, recupera la spell canonica, costruisce il contratto unificato e prepara una sessione serializzabile con caster, slot, durata, automazioni e target iniziali.

| Decisione | Quando | Reason stabile / route |
| --- | --- | --- |
| `direct` | `launchMode: "auto"`, lane lifecycle, nessun placement/esito/attacco/danno/cura/scelta obbligatoria/target primario/regola spaziale/zona/pedina/active/prepared e sessione accettata dall’adapter | `direct-safe`; esecuzione tramite adapter lifecycle |
| `review` | `launchMode: "review"`, oppure contratto non sicuro: area, placement, TS/attacco, danno/cura, target mancanti o ambigui, varianti, zone, aure, board token, active/prepared | reason specifica; route `spell-unified-panel` |
| `invalid` | azione non spell, spell non risolta o caster non disponibile | reason di validazione; nessuna mutation |

Una richiesta review porta al pannello:

```js
{
  intent: "spell-cast",
  sourceId,
  casterId,
  spellId,
  slotLevel,
  durationTurns,
  applyAutomatedConditions,
  targetIds,
  origin: "quick-action",
  quickActionId
}
```

Il pannello rivalida o rimuove i target incompatibili. L’esecuzione diretta usa lo stesso adapter lifecycle normalizzato del pannello e conserva la conferma per la sostituzione della concentrazione.

## Entry point canonici e routing

- pulsante globale Spells → pannello unificato/catalogo;
- card → pannello unificato con `sourceId` e spell opzionali;
- Azione Rapida spell → piano centralizzato, poi direct oppure route `spell-cast`;
- Azione Rapida condizione/capacità → workflow esistente;
- messaggio legacy con `panel: "quick-hp"` e intento spell → conversione al boundary in `spell-cast`, senza propagare il vecchio panel;
- `panel: "quick-hp"` senza intento spell → console HP manuale;
- se il pannello Spells è già aperto, una nuova quick action aggiorna la route e riapre/carica la nuova sessione.

Nessuna nuova spell viene instradata a Quick HP.

## Componenti rimossi e compatibilità

Rimosso `src/spells-panel.js`: non aveva più caller runtime dopo il cutover. Sono rimasti i moduli puri di catalogo/contratto ancora importati dal pannello unificato.

Rimosso dal percorso Quick HP il catalogo spell nascosto e il codice orfano relativo a spell, varianti, placement, Catena di fulmini, zone, pedine e trigger spell. Restano selezione/filtri bersagli, danno, cura, HP temporanei, condizioni e TS manuali, History/Undo, `hpMemory`, HP canonici, automazioni zero HP e reminder effettivamente usati.

Restano invariati:

- `com.thebigpicture.initiative/meta` e `com.thebigpicture.initiative/state`;
- `meta.hp` e `meta.hpMax` come campi canonici;
- fallback di lettura dei dati spell legacy delle campagne;
- `spell-active-resolution` e `prepared-spell-resolution`;
- `spellUnifiedPopupProtocol` e gli stati `completed`, `cancelled`, `closed`, `failed`.

I redirect `spells-modal.html` e `ctx-spells.html` vanno mantenuti finché non sarà verificato che campagne, bookmark, macro e client in cache non li usano più, per almeno una release completa. A quel punto potranno essere rimossi insieme ai relativi entry point Vite.

## Test automatici

La suite copre mapping v1/v2, salvataggio senza `workflow`, assenza di scrittura durante la lettura legacy, piano direct/review, route completa, concentrazione, target mancanti/incompatibili, Fireball, Bane, Chain Lightning, Storm Sphere, Arcane Hand, varianti, preparate, riapertura del pannello, separazione Quick HP e compatibilità di condizioni/capacità.

Verifiche di cutover incluse:

- catalogo unificato: 391 record unici e zero contratti mancanti;
- single target e target iniziali;
- area/placement, esiti e HP;
- zone e pedine;
- popup active/prepared;
- terminate;
- Quick HP manuale, History e Undo;
- routing da pulsante globale, card e quick action.

Comandi di consegna:

```text
npm test
npm.cmd run build
```

## Smoke test OBR

Da eseguire nell’ambiente Owlbear Rodeo dopo il build:

1. Aprire Spells dal pulsante globale e dalla card; verificare catalogo e selezione caster.
2. Usare una spell self semplice in auto e una spell con target valido; verificare il percorso diretto e la concentrazione.
3. Usare Fireball, Bane, Chain Lightning, Storm Sphere, Arcane Hand, una variante e una spell preparata; verificare che venga sempre aperto il pannello corretto.
4. Verificare area placement, zone, board token, esiti e aggiornamento HP.
5. Selezionare una quick action mentre il pannello Spells è già aperto; verificare che la nuova sessione venga caricata.
6. Aprire Quick HP e verificare soltanto danno, cura, HP temporanei, condizioni, TS, History e Undo.
7. Aprire i redirect legacy con query string/hash e verificare il mantenimento della sessione nel pannello unificato.
8. Verificare completamento, annullamento, chiusura e fallimento dei popup active/prepared.

## Rollback

Il rollback consiste nel ripristinare il set di file della Fase 12, senza modificare metadata dei token: non sono state eseguite migrazioni automatiche. In caso di regressione si può riattivare temporaneamente il redirect precedente e il percorso controller precedente da una revisione nota, mantenendo i dati v1 in lettura. Dopo il rollback, le nuove schede già salvate in v2 devono essere lette tramite un adapter v2 oppure convertite solo durante un salvataggio esplicito controllato.

## Residui rinviati

- QA visuale e interattiva completa in OBR su tutte le varianti di viewport;
- rimozione futura dei redirect dopo il periodo di compatibilità indicato;
- pulizia dei nomi storici usati come sorgenti del catalogo di riconciliazione (`legacy-spells-panel` / `legacy-area-console`), senza alterare i 391 record;
- eventuale rimozione dei fallback di lettura legacy soltanto dopo una verifica delle campagne esistenti.
