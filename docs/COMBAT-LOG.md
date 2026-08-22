# Combat Log — contratto CL-4

## Contratto

Il Combat Log è una proiezione locale, append-only e best-effort dello stato
canonico. Viene scritto soltanto nel browser del GM, in IndexedDB, ed è
separato dalla History. Non è una fonte di verità e non viene usato per Undo,
recovery, ricostruzione dello stato o sincronizzazione tra client GM.

La scena conserva soltanto il puntatore alla sessione attiva nella chiave
`com.thebigpicture.initiative/combat-log-state`. Un errore del log non modifica
HP, condizioni, incantesimi, concentrazione, iniziativa, History, Undo o il
mutation coordinator.

## Schema evento v2

Gli eventi nuovi hanno questa forma concettuale:

```js
{
  version: 2,
  id,
  sessionId,
  sequence,
  at,
  kind,          // sottotipo tecnico retrocompatibile
  category,      // categoria semantica stabile
  action,
  label,
  source,        // "automatic" oppure "manual": origine della registrazione
  round,
  turn,          // solo contesto del turno, non fonte dell'azione
  historyEntryId,
  commandId,
  correlationId,
  targets,
  payload,       // payload originale, quando presente
  facets         // informazioni derivate additive
}
```

Le categorie CL-1 sono `hp`, `spell`, `save`, `condition`, `resource`,
`movement`, `turn`, `roster`, `undo`, `note` e `other`. La normalizzazione
conserva sempre `kind`: `category` non lo sostituisce.

`facets.hp.targets` contiene before/after di `hp` e `hpMax`, `delta` e
`hpMaxDelta`. Le facet `conditions`, `spells` e `concentrations` contengono
`added`, `removed`, `updated` e il dettaglio per target in `targets`. Gli ID di
istanza vengono usati quando disponibili. Il payload originale non viene
sovrascritto.

## Compatibilità v1

Gli eventi v1 già presenti non vengono migrati né riscritti. Le letture li
normalizzano in memoria, aggiungendo soltanto i default necessari e la
categoria derivata dal `kind`; `combatEventDetail()`, aggregazione ed export
continuano a funzionare con entrambe le versioni.

## Correlazioni, turni e fonti

`historyEntryId`, `commandId` e `correlationId` vengono mantenuti quando sono
presenti nella History, in particolare dentro `entry.effectsMutation`.
`source` descrive se la registrazione è automatica o manuale; non descrive
l'autore dell'azione. `turn` è il contesto osservato al commit del log e non
implica che il personaggio di turno sia attaccante, fonte del danno o caster.

Per una variazione HP non correlata a un workflow spell il log mostra sempre
target, before/after e delta, ma non attribuisce il danno al personaggio di
turno. Le fonti degli attacchi restano fuori da CL-1.

## Idempotenza e lifecycle

Gli eventi derivati dalla History usano un ID di storage deterministico
scopato alla sessione (`sessionId` + entry logica). Gli Undo usano il
`commandId` logico, anch'esso scopato alla sessione. Nella stessa transazione
IndexedDB un duplicato identico è un no-op: conserva evento e sequence, non
incrementa `nextSequence` e non invia notifiche. Un ID già presente con
contenuto diverso conserva il primo evento e restituisce solo una diagnosi.
Note manuali e altri eventi nuovi ricevono ID univoci.

Anche i boundary automatici di iniziativa hanno una chiave deterministica:
`round:${round}` per l'inizio del round e `turn:${round}:${activeId}` per il
cambio turno. Il controllo `lastTurnKey` resta un fast path locale, mentre la
chiave di storage impedisce duplicazioni quando il recorder viene rieseguito
da runtime Owlbear diversi o da retry concorrenti.

La lettura della sessione attiva è un peek e non crea sessioni. La sessione
viene creata soltanto al primo evento/turno registrabile o con “Nuovo
registro”. Activate, clear, delete e le notifiche ricontrollano lo scene epoch
prima e dopo le operazioni asincrone e prima delle scritture metadata. Un
operazione della scena precedente non può aggiornare il puntatore della scena
nuova.

Il contesto round/turn di un evento History viene idratato una sola volta e
passato all'append; l'append non ripete la lettura se riceve il contesto
esplicito.

## CL-2 — presentazione, navigazione ed export

Un Undo della History che ripristina una posizione produce una correzione
negativa nel Combat Log. Il target conserva il riferimento alla voce movimento
originale, quindi il totale netto resta nel gruppo originale anche se l'Undo
avviene in un round o turno diverso.

La correzione usa la distanza effettivamente registrata per quello spostamento
(inclusi percorsi frazionari o composti), mai un numero fisso di caselle. Il
payload distingue `undoSource: "history"` da `undoSource: "obr-native"`; in
entrambi i casi il ripristino non genera una seconda voce movimento positiva.

CL-2 costruisce in memoria un view model puro a partire dalla sessione e dagli
eventi CL-1. Il modello conserva gli eventi in ordine `sequence`, espone il
riepilogo della sessione, i partecipanti, le categorie e gli outcome espliciti,
poi raggruppa la timeline in `Round → Turno → Eventi`. La UI mostra i gruppi
più recenti per primi, mentre l’export TXT percorre gli stessi gruppi in ordine
cronologico. Gli eventi senza contesto sono raccolti in `Fuori turno`; gli ID
virtuali di Tana, Paragon ed Epic restano contesti e non vengono trattati come
token. Gli eventi `round` e `turn` sono boundary compatti.

Le card usano la `category` semantica, non il `kind` tecnico, per etichetta e
tono: HP, Incantesimo, Tiro salvezza, Condizione, Risorsa, Movimento, Turno,
Incontro, Undo, Nota e Altro. Il `kind` rimane nei dettagli tecnici e nei
tooltip. Una card rappresenta un singolo comando logico e può esporre insieme
le facet HP, condizioni, incantesimi e concentrazione. Le facet mostrano
aggiunte, rimozioni e aggiornamenti per target; HP include before/after,
`hpMax` e delta; save/reminder usa solo outcome e danni espliciti; movimento
può mostrare la correzione registrata da Undo. Note, Undo, roster e risorse
mantengono testo, etichetta e target disponibili nel payload.

`source` indica soltanto l’origine della registrazione (automatica o manuale),
mentre `turn` è il contesto temporale. La UI può dire “Durante il turno di
Arannis”, ma non attribuisce danni o incantesimi al personaggio di turno. Caster,
incantesimo e causa sono mostrati solo se presenti esplicitamente nel payload;
per un cambio HP senza fonte nota compare “Fonte: non tracciata”. Il riepilogo
non calcola danno inflitto, netto HP, healing netto o statistiche causali.

La ricerca locale è case-insensitive e accent-insensitive e copre titolo,
categoria, turno, target, facet, nomi di condizioni/incantesimi e outcome nella
pagina caricata. I filtri sono categoria, partecipante ed esito e mostrano
`X visibili · Y caricati su Z`; quando la sessione non è completa la UI lo
indica esplicitamente e offre `Carica tutto`. Le interazioni della proiezione
riutilizzano il view model già costruito e non effettuano chiamate SDK,
scritture metadata o accessi IndexedDB. Refresh,
broadcast e ricostruzione del DOM conservano ricerca, filtri, espansione di
round/turni/card, pannelli Log/Undo, scroll e focus/caret quando disponibile.

Il riepilogo usa gli eventi caricati e indica anche il totale persistito, round,
turni, partecipanti, intervallo registrato e conteggi per categoria. Gli stati “nessuna
sessione”, “sessione vuota”, “nessun risultato”, Combat Log disattivato, scena
non disponibile e ruolo non GM restano distinti. Il badge “Locale a questo
browser GM” ricorda che le sessioni non sono sincronizzate automaticamente con
altri browser o GM.

TXT include nome sessione, storage locale, inizio, intervallo, Round, Turno,
eventi e sezioni delle facet per tutti gli eventi della sessione, senza seguire
i filtri UI; l’operazione carica esplicitamente la sessione completa da
IndexedDB. JSON continua a usare i dati raw CL-1, completi e non filtrati;
non viene introdotto export Markdown. I testi utente sono inseriti con
`textContent`, i filtri hanno label accessibili, timeline e messaggi usano
etichette/`aria-live`, e i dettagli sono navigabili con tastiera e wrapping.

## CL-3 — causalità spell

CL-3 è completata. I producer spell aggiungono, al payload History già
esistente, `payload.causality` versionato:

```js
{
  version: 1,
  domain: "spell",
  eventType,
  cause: {
    kind: "spell",
    spellId,
    spellName,
    instanceId,
    slotLevel,
  },
  actor: { id, name, role },
  phase,
  action: { id, label, attackOutcome, damageRoll },
  targets: [{
    id,
    name,
    outcome,
    requestedDamage,
    appliedHpDelta,
    damageFactor,
  }],
  concentration: { action, instanceId },
  zone: { action, zoneItemId, ruleId, movementChoice },
  reminder: { activationId },
}
```

I campi sconosciuti vengono omessi; il modulo di costruzione è puro,
deterministico, JSON-safe e non legge SDK, DOM, IndexedDB o metadata. I
producer coperti sono `spellApplicationExecutor.js`,
`spellAreaResolutionExecutor.js` e `reminderResolution.js`, con il passaggio
del contesto già disponibile nel reminder da `turn-notice.ts`.

Sono coperti cast/application, prepare, resolution, active action, risoluzioni
area/save, reminder, movimento e rotazione delle zone, board token e stato
della concentrazione. Sono preservati spell, caster, istanza, slot, target e
nomi già presenti negli snapshot, outcome, tiro richiesto, fattore di danno e
variazione HP realmente applicata. La causalità è descrittiva: le facet HP
restano la fonte semantica del risultato canonico.

Il payload è compatibile con gli eventi v1/v2 e la correzione di movimento non
modifica lo schema top-level della History: l'Undo aggiunge soltanto l'evento
negativo correlato nel Combat Log. Non viene mai inferita una fonte dal turno,
dall’iniziativa, dalla differenza HP, dalla selezione o dalla prossimità
temporale. Gli attacchi generici e con armi restano volutamente senza fonte.

Il gate browser CL-2/CL-3 è stato verificato sulla vera modal in un host
test-only: viewport 480×640, overflow orizzontale assente, timeline con round
e turni virtuali/fuori turno, espansione, filtri accent-insensitive, refresh con
preservazione di stato, tastiera, stati vuoti, legacy payload e contenuti
ostili renderizzati con `textContent`. Il gate CL-4 usa 5.000 eventi, pagine
da 50, append durante la navigazione, import collision-safe e retention.

## CL-4 — storage locale, paginazione, portabilità e retention

CL-4 completa il lifecycle locale del registro. Il database resta locale al
browser GM, append-only e best-effort; History resta separata e un errore
IndexedDB non altera la mutazione canonica. Il database mantiene nome e store
esistenti, passa a v2 e aggiunge l’indice non unique `[sessionId, sequence]`;
l’upgrade non riscrive i record v1. La lettura ordinaria usa pagine
cursor-based da 50 eventi (massimo configurabile 200), mentre
`getCombatLogEvents()` resta disponibile per compatibilità ed export completo.
Export e import sono bundle JSON espliciti e lossless, con validazione, limiti,
fingerprint e collision policy deterministici. Una sessione importata è
archiviata, non attiva, e viene assegnata alla room locale senza scrivere
metadata di scena.

La retention è sempre esplicita: nessuna cancellazione all’avvio o al semplice
read; statistiche e preview sono locali, la preview esclude sempre la sessione
attiva e le sessioni importate, e la cancellazione richiede conferma. Import
usa una singola transazione: fingerprint uguale riusa la sessione, ID/eventi
in collisione ricevono ID deterministici senza sovrascrivere dati esistenti.
Non esiste sincronizzazione live multi-GM: la portabilità avviene solo tramite
export/import.

## Amend contratto v3 — specifica non ancora implementata

Questa sezione aggiorna esclusivamente il contratto v3. Non abilita il writer
v3, non modifica lo schema IndexedDB e non cambia il comportamento degli
eventi v2.

### Snapshot roster

Il campo di sessione per lo snapshot al momento dell’export è
`session.roster.atExport`. `session.roster.final` non fa parte del contratto
v3 iniziale: potrà essere introdotto soltanto insieme a una finalizzazione
esplicita del combattimento, che oggi non esiste.

`session.roster.initial` rappresenta la prima osservazione strutturalmente
completa del roster e dell’ordine. Contiene `capturedAt`,
`capturedAtSequence`, `orderRevision`, `orderIds` ed entries del roster; dopo
la cattura è immutabile. `session.roster.atExport` ha la stessa forma, ma viene
catturato esclusivamente durante l’export/finalizzazione dell’export e non
implica che il combattimento sia terminato.

### Fixture normative separate

Il test del contratto v3 usa due fixture distinte:

- `legacy-v2-normalized`: rappresenta il log v2 reale normalizzato in memoria.
  Nessun campo assente dal v2 viene inventato. In particolare, il `Prono`
  della sequenza 63 ha `lineage: null`.
- `native-v3-expected`: rappresenta l’output atteso quando i producer v3
  catturano esplicitamente i nuovi dati. Nella stessa sequenza 63 il `Prono`
  ha il lineage completo dell’effetto derivato.

Le due fixture non possono essere confrontate come se fossero due serializzazioni
dello stesso livello informativo: la seconda verifica capacità future dei
producer, la prima verifica fedeltà all’input legacy.

### Import legacy e provenance

Durante l’import v1/v2 non si assegna `provenance.recordingSource` in base a
`kind`, categoria o forma dell’evento. Se l’origine tecnica del producer non è
presente nell’input, il valore è `unknown`; i campi legacy, incluso `source`,
restano preservati.

`provenance.actor` e `provenance.cause` possono essere normalizzati soltanto
quando sono supportati esplicitamente dai dati causality esistenti, per esempio
da `payload.causality.actor` o `payload.causality.cause`. Non si ricavano dal
turno corrente, dal target, dal delta HP o dal tipo tecnico dell’evento.

### Unknown e valori numerici

Lo schema v3 ammette `number | null` per i valori numerici osservativi. Il
divieto di trasformare un dato sconosciuto in `0` è un’invariante dei producer
e dei test, non una regola strutturale del validatore: `0` è un valore valido
quando è stato osservato realmente, mentre l’assenza deve produrre `null`.

Non vengono introdotti altri cambiamenti al contratto v3 in questa fase.

## Limiti e roadmap

- CL-1 non introduce un nuovo layout, card, filtri, raggruppamento Round →
  Turno o riepiloghi di sessione.
- CL-2 resta dedicato alla UI e alla presentazione.
- Gli attacchi generici restano privi di fonte; non è previsto un sistema di
  attribuzione automatica.
- CL-4 non introduce sincronizzazione live multi-GM, cloud, WebSocket o merge
  distribuito.
- Non vengono registrate le scadenze automatiche come nuovi eventi e non
  vengono creati eventi per dati che il producer non possiede esplicitamente.
