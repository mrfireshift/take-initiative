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
| `src/effects-modal.ts` | Popup Condizioni. |
| `src/spells-panel.js` | Popup Incantesimi e concentrazione. |
| `src/quick-hp-modal.js` | Console HP multi-bersaglio. |
| `src/history-modal.ts` | Cronologia Undo e log di combattimento. |
| `src/clocksTool.js` / `src/clocks-modal.js` | Strumento e interfaccia Clock. |
| `src/distance3dTool.js` / `src/distance3d-modal.js` | Strumento e interfaccia Distanza 3D. |
| `src/aoeTargetTool.js` | Creazione, persistenza e selezione delle aree. |
| `src/hpbar-items.js` | Elementi derivati della barra HP sulla mappa. |
| `src/initiativeCards.js` | Profilo persistente delle card tra scene. |

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
- `com.thebigpicture.initiative/spells`
- `com.thebigpicture.initiative/concentration`

Gli aggiornamenti devono sempre fondere il nuovo contenuto con il metadata esistente. Sostituire l'intero oggetto può cancellare HP, condizioni o risorse indipendenti.

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

### Metadata della room

| Chiave | Scopo |
| --- | --- |
| `com.thebigpicture.initiative/hpMemory` | Fallback persistente HP/fazione per attori riconosciuti |
| `com.thebigpicture.initiative/initiativeCards` | Registry delle schede tra scene |

Il registry locale `com.thebigpicture.initiative/initiativeCards/local` offre un fallback nel browser.

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

Condizioni e incantesimi vivono nel metadata canonico del token. Le label sulla mappa sono elementi derivati con metadata proprietari che ne identificano il token padre. La riconciliazione:

1. legge lo stato del token;
2. calcola pill, posizione e scala;
3. aggiorna gli elementi esistenti quando possibile;
4. elimina soltanto gli elementi derivati non più necessari.

Gli elementi sono bloccati per evitare spostamenti accidentali. La concentrazione è collegata sia all'incantatore sia alle istanze degli incantesimi.

## Eventi e protezioni da stato stantio

Il tracker e gli attachment ricevono cambiamenti asincroni dalla scena. Le parti più sensibili usano code, revisioni e filtri per evitare che una risposta vecchia sovrascriva uno stato più recente.

In particolare:

- `renderAll()` non distrugge un editor inline attivo;
- la navigazione del turno serializza le transizioni;
- gli aggiornamenti HP multi-target vengono consolidati;
- il dispatcher distingue modifiche HP, condizioni, incantesimi, velocità e layout;
- gli Undo del movimento non vengono reinterpretati come nuovo movimento.

## Aree AoE

Ogni area persistente usa:

```text
com.thebigpicture.initiative/aoeArea
```

Il metadata contiene tipo, origine, geometria, DPI/griglia e stile. La visualizzazione comprende un path sagomato unico per il contorno delle caselle e una silhouette geometrica interna. La riselezione ricalcola l'intersezione con l'ingombro corrente dei token.

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
- Gli attachment della mappa non devono essere eliminati o ricreati indiscriminatamente.
- Gli ID virtuali non devono essere trattati come token reali.
