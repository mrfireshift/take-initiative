# ARCH-004 — Event hub e scheduler di rendering

## Scopo

ARCH-004 introduce una frontiera comune tra gli eventi degli item scena e il
rendering del tracker. Il codice corrente resta la fonte autorevole per i
metadata: l'hub classifica le invalidazioni e lo scheduler ordina il lavoro
DOM, senza introdurre un nuovo protocollo di persistenza.

La classificazione è in `sceneItemChangeDispatcherCore.js`; il runtime
condiviso è esposto da `sceneItemEvents.js`; la serializzazione del DOM del
tracker è gestita da `initiativeRenderSchedulerCore.js` e viene usata da
`initiativeList.js`.

## Classificazione degli eventi

Ogni delta contiene, oltre a `flags` e agli item modificati:

- `domains`: domini realmente invalidati;
- `invalidations`: gli ID interessati per ciascun dominio;
- `sceneEpoch`, `revision` e `batchId`;
- `derived.output` e `derived.effects`: gli item visuali prodotti dai renderer
  sono output derivati, mentre condizioni linked di spell e Capacità restano
  sempre input canonici (`derived.effects` resta `false`);
- `correlationId`/`commandId` quando il produttore dell'evento li fornisce.

Le firme sono separate per movimento/geometria, stato del tracker, HP,
condizioni, concentrazione, spell, metadata esterni e item derivati. Il
dispatcher conserva inoltre le firme già calcolate per il delta corrente e
non serializza il metadata completo dentro una singola firma di contenuto.

| Dominio | Esempi di invalidazione | Consumatori principali |
| --- | --- | --- |
| `tracker` | nome, ritratto, HP o risorse di una creatura già in iniziativa | card e render incrementale |
| `tracker-structure` | iniziativa, appartenenza, attitude, grouping o metadata strutturale | render full e riconciliazione ordine |
| `hp` | `meta.hp`, `meta.hpMax`, attitude che modifica la rappresentazione HP | HP tracker e map bars |
| `hp-memory`, `hp-memory-autofill` | identificità o profilo HP del token | memoria HP e fallback PC |
| `effects`, `effects-widgets` | condizioni, concentrazione e widget derivati | reconciler degli effetti |
| `aura` | movimento, spell, concentrazione o stato che cambia un'aura | aura spell/class feature |
| `zone` | movimento, spell o stato che cambia una zona | zone statiche e notices di zona |
| `prepared-spells` | spell/concentrazione o movimento pertinente | prepared spell resolution |
| `active-label` | sola label del turno attivo | label e overlay del turno |
| `elevation` | quota o geometria del token e geometria HP bar | label di elevazione |
| `derived` | scritture di item visuali prodotti dai renderer | diagnostica e filtri anti-loop |

Un aggiornamento HP canonico non produce `aura` o `zone`. Gli item visuali di
aura/zona mantengono il loro dominio semantico anche quando l'evento è
marcato `derived.output`: i controller che li scrivono ignorano quel flag,
mentre i consumer come i notice possono ancora reagire all'aggiornamento
pertinente.

## Subscriber migrati

I listener item dei quattro controller individuati dalla review sono passati
all'hub:

- `spellAuraController.js` — dominio `aura`;
- `classFeatureAuraController.js` — dominio `aura`;
- `spellStaticZone.js` — dominio `zone`;
- `preparedSpellResolutionController.js` — dominio `prepared-spells`.

Gli aura controller e il reconciler degli effetti ignorano gli item visuali
marcati `derived.output`. Le condizioni linked persistite su un token non sono
output del renderer: devono raggiungere il reconciler per creare o aggiornare
le pill, incluse quelle delle Capacità di classe.

Gli altri consumer già basati su `subscribeSceneItemChanges` mantengono i
propri filtri di compatibilità. I runtime UI isolati, come alcuni modal e i
notice legacy, non vengono riscritti in questa fase; il watchdog della zona
resta una rete di sicurezza per il reconciler esistente.

Nel runtime condiviso sono inoltre migrati `elevationLabel.js` sul dominio
`elevation`, il listener delle aree persistenti di `aoeTargetTool.js` sul
dominio `zone` e il reminder Ira Implacabile sul dominio `hp`.

## Scheduler e barriera full/incremental

`createInitiativeRenderScheduler` assegna priorità esplicite:

- full: `100`;
- incremental: `10`.

Il lavoro è seriale. Un full pendente o in esecuzione è una barriera: gli
incrementali successivi vengono accodati e sono drenati soltanto dopo il full.
Le richieste incremental dello stesso tratto vengono unite per ID; le
richieste full accorpano i waiter ma non possono essere cancellate da un
incremental. Ogni richiesta porta epoch, source revision, motivo e correlation
ID.

`renderAll()` è soltanto il gateway pubblico: ogni invocazione chiama sempre
`requestFull()`. L'esecuzione DOM è una callback privata dello scheduler; non
esiste un sentinel globale che permetta a una seconda richiesta di bypassare
la lane mentre un full è in attesa.

Un cambio di scena adotta il nuovo epoch e marca stale il lavoro ancora
pendente del vecchio epoch. Il callback `isCurrent` viene verificato prima e
dopo l'esecuzione, così un risultato tardivo non viene considerato committed.
Il tracker usa inoltre `isCurrentSceneItemEvent` per ignorare eventi item con
revision precedente a quella già processata.

Il percorso full conserva guard degli editor, revisioni di render, navigation
state e stale guard di ARCH-001. Il rendering usa una vista sanitizzata locale
dello state e non persiste metadata. La normalizzazione persistente resta nei
percorsi espliciti di `reconcileStateWithItems`, separati dal commit DOM.
L'incremental continua a usare la cache delle entry e ricade su un full quando
il piano non è sicuro o la struttura è cambiata.
L'aggiornamento immediato HP resta separato dal render delle card.

## Editor e dirty set

Quando una card contiene un editor di iniziativa o HP aperto, il suo
rimpiazzo incrementale viene saltato. L'ID della card e gli ID della selezione
paragon vengono inseriti in un dirty set deduplicato.

Alla chiusura dell'editor:

1. un full dirty viene richiesto con priorità full;
2. altrimenti gli ID dirty vengono riletti dalla scena e richiesti allo
   scheduler come batch incremental;
3. se la cache o la scena non consentono un patch sicuro, viene richiesto il
   full di fallback.

In questo modo l'editor non viene distrutto, ma il contenuto aggiornato non
resta perso dopo la chiusura.

## Scene lifecycle e coordinator

Gli eventi del dispatcher ricevono l'epoch corrente e vengono scartati dal
wrapper dell'hub se appartengono a una scena non più corrente. Il reset del
runtime del tracker resetta anche scheduler, revisioni item, dirty set e
correlation corrente. Restano invariati il baseline/hydration guard di
ARCH-001, il writer key-scoped di ARCH-002 e il coordinator con History/Undo
di ARCH-003.

ARCH-004 non crea un secondo formato di command ID: quando un upstream espone
`correlationId` o `commandId`, il dispatcher e lo scheduler lo propagano per
diagnostica e tracciamento.

Lo scheduler orchestra soltanto il percorso di aggiornamento del tracker. Le
mutazioni effects persistenti continuano a passare dai writer e dal coordinator
esistenti. L'eventuale riallineamento persistente dello state iniziativa usa il
writer key-scoped nei percorsi espliciti di riconciliazione e non viene avviato
dal renderer.

## Limiti aperti

ARCH-004 non riscrive i reconciler aura, zone, effetti o map-bar. In
particolare restano aperti:

- commit multi-step con delete/add e recovery parziale (fase successiva);
- watchdog e scansioni periodiche dei reconciler legacy;
- decomposizione generale di `initiativeList.js`;
- l'SDK restituisce una copia completa di tutti gli item a ogni emissione: il
  confronto resta O(N), anche se ogni campo viene fingerprintato una sola volta
  e il planner riusa le firme del dispatcher;
- correlation ID e command ID non sono esposti dal callback item dell'SDK
  installato e restano disponibili soltanto per source adapter che li forniscano.

Questi limiti sono intenzionali per mantenere invariati active turn, ordine,
grouping, layout, metadata e API pubbliche.
