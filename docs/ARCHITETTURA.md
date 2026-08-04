# Architettura e dati

## Panoramica

Take Initiative! è un'estensione web multi-page costruita con Vite e Owlbear Rodeo SDK 3.x. La build produce più pagine HTML perché l'interfaccia principale, i popup e gli strumenti della toolbar vengono caricati da iframe distinti.

Il progetto evita un backend proprio: la sincronizzazione avviene tramite metadata e API di Owlbear Rodeo. Alcune preferenze puramente visive sono locali al browser.

## Entry point principali

| Entry point | Responsabilità |
| --- | --- |
| `src/background.js` | Inizializza servizi e strumenti persistenti della room. |
| `src/main.js` | Monta l'interfaccia principale e il context menu. |
| `src/action-launcher.js` | Apre/chiude il lister dall'azione dell'estensione. |
| `src/initiativeList.js` | Stato, rendering e interazioni del tracker. |
| `src/trackerPopover.js` | Apertura, layout e dimensionamento del popover tracker. |
| `src/contextMenu.js` | Comandi contestuali su token. |
| `src/faction-configurator.ts` / `src/factionRegistry.js` | Configurazione e registry persistente delle fazioni. |
| `src/effects-modal.ts` | Popup Condizioni. |
| `src/spells-panel.js` | Popup Incantesimi, registro globale, preparazione e azioni attive. |
| `src/quick-hp-modal.js` | Console HP multi-bersaglio e Console effetti ad area. |
| `src/spellAreaCatalog.js` / `src/spellAreaRules.js` | Geometrie e comportamento dichiarativo delle spell ad area. |
| `src/spellStaticZone.js` | Ciclo di vita, appartenenza e pulizia delle zone persistenti. |
| `src/spellAuraController.js` | Riconciliazione delle aure mobili. |
| `src/spellZoneTriggerCore.js` | Pianificazione dei trigger di ingresso, movimento e turno. |
| `src/effectSaveReminderController.js` | Reminder da condizioni e spell applicate ai token. |
| `src/preparedSpellResolutionController.js` | Risoluzione differita delle spell preparate. |
| `src/quickActionsCore.js` | Contratto delle azioni rapide delle card. |
| `src/history-modal.ts` | Cronologia Undo e log di combattimento. |
| `src/clocksTool.js` / `src/clocks-modal.js` | Strumento e interfaccia Clock. |
| `src/distance3dTool.js` / `src/distance3d-modal.js` | Strumento e interfaccia Distanza 3D. |
| `src/aoeTargetTool.js` | Creazione, persistenza e selezione delle aree. |
| `src/hpbar-items.js` | Elementi derivati della barra HP sulla mappa. |
| `src/initiativeCards.js` | Profilo persistente delle card tra scene. |
| `src/initiative-card-modal.js` | Scheda iniziativa, build e capacità di classe. |
| `src/classFeatureCatalog.js` / `src/classFeatureCore.js` | Catalogo, stato e proiezione delle capacità. |
| `src/classFeatureRuntime.js` | Attivazione, risorse e pulizia delle capacità. |
| `src/classFeatureAuraController.js` / `src/classFeatureReminderController.js` | Aure e reminder delle capacità. |

`vite.config.js` elenca tutte le pagine incluse nella build.

## Fonti di verità

### Metadata del token

Chiave canonica:

```text
com.thebigpicture.initiative/meta
```

Contiene i dati specifici della creatura, tra cui:

- `inInitiative`
- `hp`
- `hpMax`
- `initiative`
- `attitude`
- `conditions`
- `initiativeCard`
- `elevation`
- `legendary`
- `legendaryResistances`
- `paragon`
- `epic`
- `classFeatureState`
- `com.thebigpicture.initiative/spells`
- `com.thebigpicture.initiative/concentration`

Gli aggiornamenti devono sempre fondere il nuovo contenuto con il metadata esistente. Sostituire l'intero oggetto può cancellare HP, condizioni o risorse indipendenti.

Le istanze in `com.thebigpicture.initiative/spells` contengono l'identità
dell'incantesimo, la durata, il caster, il contesto di lancio e i collegamenti
agli effetti figli. Il registro Incantesimi è una vista derivata dall'insieme
di queste istanze: non esiste una seconda copia canonica del registro.

### Metadata della scena

Chiave canonica dello stato tracker:

```text
com.thebigpicture.initiative/state
```

Contiene ordine, indice corrente, round, gruppi collassati, iniziative Paragon e altri dati globali dell'incontro.

Altre chiavi di scena:

| Chiave | Scopo |
| --- | --- |
| `com.thebigpicture.initiative/clocks` | Clock della scena |
| `com.thebigpicture.initiative/history` | Journal delle azioni annullabili |
| `com.thebigpicture.initiative/combat-log-state` | Sessione corrente del log |

Le geometrie persistenti sono item della scena con metadata dedicati:

| Chiave item | Scopo |
| --- | --- |
| `com.thebigpicture.initiative/aoeArea` | Area geometrica generica |
| `com.thebigpicture.initiative/spellStaticZone` | Zona persistente collegata a un'istanza |
| `com.thebigpicture.initiative/spellAura` | Aura mobile collegata a una sorgente |
| `com.thebigpicture.initiative/classFeatureAura` | Aura mobile collegata a un'istanza di capacità |

`instanceId`, `spellId`, `casterId` e i riferimenti alla sorgente consentono di
riconciliare e pulire questi item senza dedurre la relazione dal nome visibile.

### Metadata della room

| Chiave | Scopo |
| --- | --- |
| `com.thebigpicture.initiative/hpMemory` | Fallback persistente HP/fazione per attori riconosciuti |
| `com.thebigpicture.initiative/factionRegistry` | Associazione room tra asset/nome e fazione |
| `com.thebigpicture.initiative/initiativeCards` | Registry delle schede tra scene |
| `com.thebigpicture.initiative/ui` | Stato UI condiviso richiesto dall'action launcher |

Il registry locale `com.thebigpicture.initiative/initiativeCards/local` offre un fallback nel browser.

Il registry locale `com.thebigpicture.initiative/factionRegistry/local` offre
lo stesso fallback per la configurazione automatica delle fazioni. Il registry
usa prima l'URL canonico dell'immagine e poi il nome normalizzato; se lo stesso
nome è stato associato a più fazioni, non applica una scelta ambigua.

Le azioni rapide sono memorizzate nel profilo della card. Il formato viene
sanificato da `src/quickActionsCore.js` e non costituisce metadata turnale.

### Capacità di classe

La build e la configurazione del personaggio vivono nel profilo
`initiativeCard`. Lo stato di runtime è un campo annidato del metadata token:

```text
com.thebigpicture.initiative/meta.classFeatureState
```

Il catalogo importato da `src/class-features-runtime.json` è generato dai dati
in `data/class-features/`. Una capacità `implemented` produce, a seconda della
regola, un'istanza su sé stesso, un effetto su un bersaglio o un'aura. Le
condizioni persistenti sono riconciliate dal sistema effetti esistente e le
aure usano item di scena con:

```text
com.thebigpicture.initiative/classFeatureAura
```

Le condizioni e le aure conservano `instanceId`, `sourceId` e i collegamenti
ai bersagli per consentire rimozione e riconciliazione senza colpire effetti
manuali omonimi. Le risorse correnti restano nel `classFeatureState`; il
plugin non usa un secondo registro room per lo stato attivo.

### Preferenze locali

Il `localStorage` contiene esclusivamente preferenze d'interfaccia o fallback locali, per esempio:

- layout e posizione del tracker;
- posizione dei pannelli Clock e Distanza 3D;
- modalità compatta dei Clock;
- stile predefinito delle aree AoE;
- fallback locale delle card.

Queste impostazioni non vengono necessariamente condivise tra GM e player o tra browser diversi.

## Ordine di iniziativa e ID virtuali

Non ogni voce in `state.order` è l'ID di un elemento della scena. Possono comparire:

- azioni di tana;
- turni Paragon;
- azioni epiche;
- altre voci virtuali costruite dal tracker.

Il codice deve risolvere l'ID base prima di accedere al token e non deve filtrare indiscriminatamente gli ID che non risultano in `scene.items`.

## Pipeline HP

I campi canonici sono:

```text
meta.hp
meta.hpMax
```

Flusso semplificato:

```text
editor card / Console HP / Undo
              ↓
metadata canonici del token
              ↓
dispatcher degli eventi scena
       ↙                  ↘
card del lister      attachment HP sulla mappa
```

Le larghezze visive delle barre non sono dati persistenti. `src/hpbar-items.js` aggiorna gli attachment derivati in batch e protegge gli aggiornamenti da eventi stantii. `src/hpMemory.js` conserva un fallback persistente per i PG senza diventare una seconda fonte concorrente durante il normale aggiornamento.

## Condizioni, incantesimi e widget

Condizioni e incantesimi vivono nel metadata canonico del token. Pill e badge sulla mappa sono item locali derivati, ricostruiti indipendentemente da ogni client e collegati tramite `attachedTo` al token globale. La riconciliazione:

1. legge lo stato del token;
2. calcola pill, posizione e scala;
3. confronta il piano con `OBR.scene.local`;
4. aggiorna gli elementi locali esistenti quando possibile;
5. elimina soltanto gli elementi derivati non più necessari.

Gli elementi sono bloccati per evitare spostamenti accidentali. La concentrazione è collegata sia all'incantatore sia alle istanze degli incantesimi. Il GM ripulisce le vecchie label globali create dalle versioni precedenti; barre HP ed etichetta del turno non fanno parte di questa migrazione.

## Pipeline degli incantesimi

```text
pannello Incantesimi / Console effetti ad area / azione rapida
                              ↓
                  piano applicativo della spell
              ↙               ↓                 ↘
 istanze sui token       zona o aura        effetti figli
              ↘               ↓                 ↙
                 registro globale derivato
                              ↓
      turni, appartenenza, movimento e azioni attive
                              ↓
             reminder aggregato o pulizia finale
```

Le definizioni del catalogo descrivono separatamente:

- fase del lancio e risoluzione preparata;
- condizione o effetto applicabile;
- geometria, persistenza e movimento dell'area;
- trigger `cast`, `enter`, `move`, `leave`, `turn-start` e `turn-end`;
- risoluzione manuale, tiro salvezza e testo informativo;
- azioni attive successive al lancio.

`src/spellApplicationExecutor.js` applica i piani senza sostituire il metadata
canonico del token. `src/spellStaticZone.js` e
`src/spellAuraController.js` riconciliano gli item di scena con le istanze
ancora attive. La rimozione della concentrazione o la scadenza naturale
producono un piano di fine che include gli item collegati.

### Reminder concorrenti

I reminder di zona e quelli derivati da condizioni usano canali distinti:

```text
com.thebigpicture.initiative/spell-zone-trigger-notice
com.thebigpicture.initiative/effect-save-reminder-notice
```

I controller calcolano il reminder dal turno corrente e lo sostituiscono a ogni
transizione. L'assenza di eventi per il nuovo attore equivale a una richiesta
di chiusura. Il payload aggrega le righe valide per evitare che due condizioni
o due momenti dello stesso incantesimo si sovrascrivano.

La CD non viene cercata sul bersaglio: viene letta dal profilo del caster
collegato all'istanza. Per questo nemici e neutrali possono restare privi di
scheda.

## Eventi e protezioni da stato stantio

Il tracker e gli attachment ricevono cambiamenti asincroni dalla scena. Le parti più sensibili usano code, revisioni e filtri per evitare che una risposta vecchia sovrascriva uno stato più recente.

In particolare:

- `renderAll()` non distrugge un editor inline attivo;
- la navigazione del turno serializza le transizioni;
- gli aggiornamenti HP multi-target vengono consolidati;
- il dispatcher distingue modifiche HP, condizioni, incantesimi, velocità e layout;
- i controller di zone e reminder riconciliano il turno corrente prima di
  pubblicare o chiudere un avviso;
- le risoluzioni preparate verificano che l'istanza originaria sia ancora
  attiva;
- gli Undo del movimento non vengono reinterpretati come nuovo movimento.

## Aree AoE

Ogni area persistente usa:

```text
com.thebigpicture.initiative/aoeArea
```

Il metadata contiene tipo, origine, geometria, DPI/griglia e stile. La visualizzazione comprende un path sagomato unico per il contorno delle caselle e una silhouette geometrica interna. La riselezione ricalcola l'intersezione con l'ingombro corrente dei token.

Le aree spell usano lo stesso livello geometrico ma aggiungono una regola
dichiarativa in `src/spellAreaRules.js`. Una regola distingue effetti
istantanei, zone statiche, aure ed emissioni e può dichiarare appartenenza,
terreno difficile, drift, spostamento manuale e trigger.

L'appartenenza genera effetti figli con identificatori stabili. La
riconciliazione rimuove soltanto gli effetti creati dalla specifica zona;
condizioni manuali omonime o appartenenti a un'altra istanza devono restare
intatte.

## Compatibilità dei dati

Le chiavi metadata e i nomi dei campi sono parte del formato persistente del plugin. Una modifica incompatibile richiede una migrazione esplicita. In particolare non devono essere rinominate:

```text
com.thebigpicture.initiative/meta
com.thebigpicture.initiative/state
```

Le funzioni di normalizzazione accettano alcuni formati legacy, ma il codice nuovo deve scrivere il formato canonico corrente.

## Aree fragili

- `src/initiativeList.js` concentra stato, UI ed effetti: intervenire solo sulla funzione necessaria.
- Le transizioni dei gruppi dipendono da misure DOM e compensazione dello scroll.
- HP multi-target e attachment sulla mappa richiedono batching coerente.
- Lo spell ticking può essere invocato da più percorsi vicini al cambio round.
- Il registro degli incantesimi è derivato da istanze distribuite sui token:
  non aggiungere una seconda fonte di verità.
- Trigger di zona, reminder da effetti e navigazione del turno condividono il
  momento di riconciliazione: preservare aggregazione e chiusura esplicita.
- Condizioni figlie e zone devono essere rimosse per `instanceId`/`sourceId`,
  non per il solo nome visibile.
- Una spell preparata deve estendere l'istanza esistente, non creare una
  concentrazione concorrente.
- Gli attachment della mappa non devono essere eliminati o ricreati indiscriminatamente.
- Gli ID virtuali non devono essere trattati come token reali.
