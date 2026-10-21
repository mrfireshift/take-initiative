# Embers/JB2A — contratto corrente

Questo documento descrive l’integrazione visuale corrente. È una proiezione
decorativa e opzionale: non è fonte di verità per spell, condizioni, zone,
concentrazione o capacità di classe.

## Configurazione e fonte di verità

Il toggle è la policy Room `integrations.embersAnimations`, esposta dal
selector `selectEmbersAnimationsEnabled`. Il default è attivo. Il runtime
opzionale viene montato e smontato da `src/background.js`; il pannello e la
precedenza degli scope sono descritti in
[OPTIONS-ARCHITECTURE](OPTIONS-ARCHITECTURE.md).

Le fonti operative sono:

| Modulo | Responsabilità |
| --- | --- |
| `src/embersMatchedVisualCore.js` | Mappa spell/capacità, blueprint, geometria, varianti e URL degli asset. |
| `src/embersMatchedVisualRenderer.js` | Eventi matched, render di local item WebM, ancoraggi, lifecycle e cleanup. |
| `src/fireballVisualRenderer.js` | Renderer dedicato di Fireball, fallback locale e coordinamento con Embers esterno. |
| `src/embersBridge.js` / `src/embersFireballCore.js` | Protocollo esterno Embers per beam/esplosione di Fireball. |
| `src/options/optionalRuntimeLifecycle.js` | Serializzazione di enable/disable e cleanup del runtime opzionale. |

Lo stato canonico resta nei metadata dei token e nelle mutation degli effetti.
Gli item visuali locali sono output derivati e identificati dai metadata
`com.thebigpicture.initiative/embersMatchedVisual` o
`com.thebigpicture.initiative/fireballVisual`.

## Copertura dichiarata

`EMBERS_MATCHED_SPELL_IDS` in `src/embersMatchedVisualCore.js` elenca gli ID
spell con una visuale. Fireball è incluso nell’elenco per il routing, ma usa il
renderer dedicato; gli altri usano i blueprint del matched renderer. La copertura
di classe contiene un solo ID: `bardo-ispirazione-bardica`.

### Console attacchi PG

Anche la console attacchi (`src/pcAttackExecution.js`) invia la visuale
matched dei trucchetti, dopo il commit e una sola volta, con qualsiasi esito:
- il trucchetto dell’attacco, oppure quello intrecciato all’arma; Lama
  Verdefiamma salta sulla seconda creatura;
- tutte le creature di un attacco ad area.

I loop (layer `persistent` attaccati al bersaglio) durano quanto la pill del
trucchetto. Il loro `lifecycleId` è l’istanza spell sul bersaglio
(`<attackInstanceId>:spell`), quindi finiscono e si reidratano con lei. Senza
pill (colpo mancato, TS superato) si inviano solo i layer one-shot
(`persistent: false` in `emitMatchedSpellVisual`).

Tutti i clip vengono dalla libreria JB2A gratuita. Un clip con l’arte fuori dal
centro della tela dichiara `anchorX`/`anchorY` (pixel del clip) nella variante.

La lista non implica automazione delle regole D&D: descrive soltanto quali
visuali possono essere prodotte. Le definizioni possono essere istantanee o
persistenti, ancorate a caster, bersaglio, area o zona, e possono avere un
evento di fine quando la relativa istanza termina. Le sorgenti da consultare
sono le costanti e `getMatchedSpellVisualDefinition()` nel codice, non una
lista duplicata in documentazione.

Per `antilife-shell` il confine meccanico persistente è responsabilità dell’aura
mobile shared. Il clip Embers resta invece visibile dopo l’avvio come un solo
VideoItem ancorato al caster: il loop è intenzionale a livello del WebM e viene
rimosso quando termina il lifecycle, senza creare loop o eventi JS duplicati.

## Flussi runtime

### Spell e capacità matched

1. Il producer verifica policy, scena e geometria corrente.
2. `buildMatchedVisualEvent()` costruisce un evento versionato sul canale
   locale dell’estensione e lo invia ai client della room.
3. Ogni renderer calcola la variante WebM più vicina alla geometria e crea un
   local item OBR, usando `attachedTo` quando il visual deve seguire caster,
   bersaglio o zona.
4. Le mutation applicate emettono gli eventi di fine per istanze spell o
   capacità rimosse. ID evento e lifecycle impediscono duplicazioni e render
   tardivi nella scena sbagliata.

Gli asset matched sono richiesti dalla base JB2A gratuita dichiarata in
`EMBERS_ASSET_BASE_URL`. Un errore di broadcast o di caricamento visuale non
deve impedire la mutation canonica; il risultato è quindi best-effort.

### Fireball

Fireball mantiene un percorso di compatibilità separato. Il bridge invia il
protocollo esterno `eu.armindo.embers/effects` con gli effetti
`fireball.beam` e `fireball.explosion`; il renderer controlla se Embers ha
creato un nuovo item e, se non lo rileva, usa il proprio visual locale come
fallback. Il fallback non cancella né ricrea item appartenenti all’estensione
Embers.

## Disattivazione e cleanup

Quando la policy passa a off, il lifecycle interrompe i nuovi producer,
smonta entrambi i renderer e rimuove soltanto i local item posseduti da Take
Initiative!. Non vengono cancellati metadata canonici, zone, concentrazione,
History, Combat Log o item di Embers esterno. Alla riattivazione vengono
rimontati i listener; i nuovi cast possono produrre visuali.

## Reidratazione dei loop persistenti

I loop sono local item: spariscono quando la room si chiude, la pagina si
ricarica o si cambia scena, mentre spell e capacità restano attive nei
metadata. Al montaggio del renderer e a ogni scena pronta
(`OBR.scene.onReadyChange`, su ogni client, GM e player) il renderer legge
spell, concentrazione, stato delle capacità e zone dalla scena
(`src/embersVisualRehydrationCore.js`) e ridisegna **solo per sé** i layer
`persistent` delle istanze attive che non ha già a schermo: niente intro,
niente one-shot, niente broadcast. Il `lifecycleId` resta quello
dell'istanza, quindi l'evento di fine li rimuove come al solito.

I layer ancorati a caster o bersaglio si ricostruiscono dalla posizione
corrente dei token. I layer disegnati sull'area piazzata usano la geometria
salvata sulla radice della zona al momento del lancio
(`com.thebigpicture.initiative/embersZoneVisual`), traslata dello spostamento
della zona; le zone create prima di questo meccanismo non hanno il dato e il
loro loop d'area non viene ridisegnato, invece di comparire nel punto
sbagliato.

Il cambio scena invalida i render pendenti e impedisce che un evento della scena
precedente ricrei item nella scena corrente. Un one-shot già consegnato a un
renderer esterno può completare il proprio lifecycle.

## Limiti documentali e manutenzione

- Una spell non presente nelle costanti matched non ha una visuale garantita.
- La disponibilità degli asset remoti e del plugin Embers esterno è una
  dipendenza opzionale, non un prerequisito per lo stato di combattimento.
- Per aggiungere una visuale si aggiorna prima il blueprint in
  `src/embersMatchedVisualCore.js`, poi i test mirati in `test/embers*`; non si
  aggiungono conteggi manuali a questo documento.
- Strumenti di sviluppo (server `boss-actions-preview`, porta 5199):
  - `test-support/embers-gallery/cantrips.html`: galleria dei clip JB2A
    candidati;
  - `test-support/embers-gallery/bench.html`: banco che riproduce i blueprint
    reali (posizione, scala, rotazione, ritardi, loop) su una mappa finta, con
    incantatore, bersaglio e seconda creatura.
