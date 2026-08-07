# OPTIONS-001/002/003/004 — Architettura, proiezione, pannello e runtime opzionali

## Stato e confini

OPTIONS-001 introduce schema, normalizzazione, store, risoluzione degli scope,
selector e subscription. OPTIONS-002 monta il servizio nei runtime che
producono tracker, reminder e output locali sulla mappa e applica la policy a
view model derivati. OPTIONS-003 introduce il primo writer utente: un pannello
GM con scope Room/scena, preferenze locali e anteprima Player. Lo stato canonico
non viene modificato dalla proiezione o dal pannello. OPTIONS-004 collega gli
otto moduli realmente opzionali a lifecycle serializzati, cleanup owner-scoped
e riconciliazione completa alla riattivazione.

Coordinator, History, condizioni, spell, iniziativa e scene lifecycle restano
sempre attivi e non ricevono toggle.

## Scope e chiavi

| Scope | Chiave | Storage | Contenuto |
| --- | --- | --- | --- |
| Questo browser | `com.thebigpicture.initiative/options-local` | `localStorage` | Presentazione e comportamenti esclusivamente locali. |
| Room | `com.thebigpicture.initiative/options-room` | Room metadata | Policy condivise e default della room. |
| Questa scena | `com.thebigpicture.initiative/options-scene` | Scene metadata | Override espliciti delle sole policy autorizzate. |

Le chiavi Room e scena hanno contratti dedicati in
`src/metadataKeyScoped.js`. I writer inviano soltanto la chiave posseduta,
non usano `undefined` e usano il tombstone JSON-safe `null` per il clear.
Le chiavi canoniche di token, iniziativa, History, condizioni e spell non sono
state modificate.

La Room ha un budget metadata condiviso di 16 kB. La replica Room di
`com.thebigpicture.initiative/hpMemory` è quindi limitata a 10.000 byte:
mantiene prima i record con HP validi e poi quelli più recenti. La copia locale
resta completa. Questo lascia spazio alle opzioni e agli altri domini senza
modificare gli HP canonici dei token.

## Precedenza

La risoluzione in `optionsResolve.js` applica:

```text
default legacy compatibile
  → Room normalizzata
    → override scena con mode="override"
      → preferenza locale, soltanto nel namespace local
```

Le preferenze locali non vengono mai fuse dentro `shared`; non possono quindi
rendere più permissiva una policy Player della Room o della scena.

Gli override di scena sono entry esplicite:

```json
{
  "turn.popup": { "mode": "inherit" },
  "map.activeTurnLabel": { "mode": "override", "value": false }
}
```

`inherit` usa il valore Room. Un blocco strutturato in override sostituisce
l'intero blocco normalizzato: non esistono merge parziali impliciti tra policy.

## Default legacy v1

### Locale

- tracker `classic`;
- Follow del turno attivo on;
- toolbar `full`;
- Clock non compatti;
- Distanza 3D ed Enciclopedia disponibili;
- registrazione Combat Log on.

### Room

- HP Player tracker classico: esatti per PG e Alleati, nascosti per
  Neutrali/Nemici;
- HP Player tracker compatto: esatti per PG, nascosti per le altre fazioni;
- HP Player sulla mappa: esatti per PG e Alleati, nascosti per
  Neutrali/Nemici;
- condizioni, spell e concentrazione `all`;
- reminder `full`, con CD e caster;
- dettagli boss `full`;
- popup turno e risoluzione reminder `assisted`;
- HP bar, pill effetti, label turno e label quota on;
- Clock, assegnazione fazioni note e sync apertura tracker on.

### Scena

Tutti i percorsi autorizzati partono in `inherit`. L'assenza della chiave e il
tombstone `null` producono lo stesso risultato.

Questi default riproducono lo stato corrente. Con OPTIONS-002 sono anche il
preset effettivo usato dalle projection boundary, quindi l'assenza delle nuove
chiavi conserva il comportamento osservabile precedente.

## Normalizzazione e forward compatibility

`optionsNormalize.js`:

- accetta dati assenti, parziali o corrotti;
- valida boolean, enum, versione e timestamp;
- completa i campi noti con i default v1;
- conserva proprietà sconosciute a ogni livello oggetto;
- conserva versioni future numeriche senza retrocederle;
- ignora `undefined` durante il merge: non è una semantica di cancellazione;
- accetta sia la forma breve `"inherit"` sia la forma strutturata e restituisce
  sempre override normalizzati.

Le letture normalizzano in memoria e non riparano automaticamente lo storage.
Una nuova chiave viene scritta soltanto tramite un'azione esplicita `write`,
`update` o `clear`.

## Store

| Modulo | Responsabilità |
| --- | --- |
| `localOptionsStore.js` | Lettura/scrittura locale, fallback legacy, evento `storage`, subscription nello stesso runtime. |
| `roomOptionsStore.js` | Lettura e subscription Room, coda write, writer key-scoped e clear tombstone. |
| `sceneOptionsStore.js` | Come Room, più ready/unready, generation guard e ricaricamento al cambio scena. |
| `optionsService.js` | Aggrega i tre snapshot, risolve la precedenza e pubblica esclusivamente valori ottenuti tramite selector. |
| `optionsRuntime.js` | Singleton browser con SDK e avvio idempotente condiviso dal singolo iframe. |
| `optionsSync.js` | Convergenza cross-client sulla revisione Room/scena persistita dopo un salvataggio. |
| `optionsProjection.js` | Proiezioni pure HP, effects, boss e reminder, senza letture o scritture SDK. |
| `optionsPanelCore.js` | Modello editabile, normalizzazione delle dieci famiglie, patch scope-specific e salvataggio tramite servizio. |
| `options-modal.js` | UI GM, gestione Room/scena, anteprima effettiva e bridge layout legacy. |
| `optionalRuntimeLifecycle.js` | Serializza enable/disable, mount/unmount, cleanup e full reconcile; collega ogni adapter a un selector. |

Gli store Room/scena ricevono l'API SDK per dependency injection. Il runtime
browser usa `runtimeOptionsService`, creato con `createOptionsService({ sdk:
OBR })`. `main.js`, `background.js` e il popover reminder lo avviano in modo
idempotente. `start()` monta le subscription, `stop()` le rimuove.

Il salvataggio pubblica anche i timestamp `updatedAt` Room/scena verificati.
Ogni runtime remoto rilegge gli scope fino a raggiungere quella revisione,
con tentativi e attese limitati; una replica metadata ancora obsoleta non può
quindi lasciare silenziosamente il client Player sui default.

Le write sono serializzate per singolo store. OPTIONS-001 conserva la semantica
last-commit-wins di ARCH-002 per due sessioni GM indipendenti: non introduce un
CAS distribuito.

I documenti persistiti sono compatti: contengono versione, timestamp, valori
diversi dai default e proprietà sconosciute. I default omessi vengono
ricostruiti dai normalizzatori in memoria. Questo mantiene Room e scena entro i
budget metadata senza cambiare lo snapshot esposto ai selector.

## API dei selector

I consumer futuri chiamano `optionsService.get(selector)` oppure
`optionsService.subscribe(selector, listener)`. Non ricevono il JSON grezzo di
Room, scena o `localStorage`.

Selector disponibili:

| Area | Selector |
| --- | --- |
| Snapshot risolto | `selectResolvedOptions` |
| Tracker locale | `selectTrackerLayout`, `selectFollowActiveTurn`, `selectToolbarPreset` |
| Finestre/tool locali | `selectClocksCompact`, `selectDistance3dToolEnabled`, `selectReferenceToolEnabled` |
| Runtime locale | `selectCombatLogEnabled` |
| HP Player | `selectPlayerHpPolicy`, `selectPlayerHpVisibility` |
| Effetti/reminder Player | `selectPlayerEffectsPolicy`, `selectPlayerReminderPolicy` |
| Boss Player | `selectPlayerBossDetails` |
| Turno | `selectTurnPopupEnabled`, `selectDirectReminderResolution` |
| Output mappa | `selectMapHpBarsEnabled`, `selectMapEffectLabelsEnabled`, `selectActiveTurnLabelEnabled`, `selectElevationLabelsEnabled` |
| Tool/automazioni condivisi | `selectClocksToolEnabled`, `selectKnownFactionAssignmentEnabled`, `selectTrackerOpenSyncEnabled` |
| Diagnostica scope | `selectSceneOverriddenPaths` |
| Revisione scope | `selectOptionsRevision` |
| Projection boundary | `selectTrackerProjectionPolicy`, `selectReminderProjectionPolicy` |
| Pannello GM | `selectOptionsPanelModel` |

I selector che restituiscono oggetti restituiscono copie. Un selector rifiuta
un documento non risolto, impedendo l'uso accidentale di metadata grezzi.

## Fallback e migrazione

OPTIONS-001 non migra né cancella le chiavi legacy. Finché un campo non è
presente in `options-local`, vengono letti:

- `com.thebigpicture.initiative/tracker-layout` per il layout;
- `com.thebigpicture.initiative/clocks-compact` per la modalità Clock;
- `state.ui.autoFocus` nella chiave canonica iniziativa per Follow.

Il fallback Follow è soltanto una lettura. Il scene store non modifica
`com.thebigpicture.initiative/state`.

Il pannello OPTIONS-003 materializza i valori nel nuovo documento locale al
primo salvataggio esplicito. Fino a quel momento, assenza o JSON locale corrotto
mantengono i default/fallback correnti senza write-on-read. Il cambio layout
continua inoltre ad aggiornare `com.thebigpicture.initiative/tracker-layout`
come ponte compatibile per il ridimensionamento del popover esistente; la nuova
chiave resta la fonte per il selector locale.

Il toggle Follow ora scrive `options-local`. `state.ui.autoFocus` resta un
fallback di sola lettura quando la nuova preferenza non esiste e non viene più
modificato dal controllo del tracker.

Per Room e scena:

1. assenza o `null` equivalgono ai default;
2. unknown keys sopravvivono a normalize e merge;
3. una rimozione esplicita usa `clearRoom`/`clearScene` e torna ai default;
4. il cambio scena invalida le letture precedenti e idrata il nuovo snapshot;
5. una versione precedente del plugin ignora le nuove chiavi e continua a
   leggere lo stato canonico corrente.

## Projection boundary OPTIONS-002

### Tracker

`renderTrack()` proietta la lista immediatamente prima dei renderer classico e
compatto. Il modello Player non contiene quick action o capacità di classe.
La matrice HP viene risolta per superficie e fazione:

- `exact`: valori e barra;
- `bar`: solo rapporto, senza valori;
- `status`: stato qualitativo e rapporto discretizzato;
- `hidden`: nessun dato HP.

`summary` per condizioni/spell/concentrazione produce indicatori generici; la
modalità `hidden` rimuove anche quelli. Le risorse boss vengono redatte prima
del DOM. Il modello GM resta canonico. Anche il percorso incrementale HP forza
un nuovo render proiettato quando la modalità non è `exact`.

### Reminder

I writer inviano due consegne distinte: payload GM proiettato `LOCAL` e payload
Player già redatto `REMOTE`. Il payload Player non contiene mai controlli di
risoluzione; `showDc`, `showCaster`, `summary`, `notice` e `hidden` vengono
applicati prima del broadcast remoto. Il ricevitore ripete la proiezione come
difesa in profondità prima del DOM. `informational` rimuove i controlli anche
dal payload GM. Il popup del turno può essere soppresso senza smontare l'host
dei reminder.

### Output mappa

Le HP bar usano la policy `map` per visibilità di barra e testo. `status`
discretizza anche la geometria pubblica. Il reconciler locale degli effetti
proietta una copia del token prima di pianificare pill condizioni, spell e
concentrazione; una subscription full-reconcile elimina gli output non più
ammessi. Nessuna delle due proiezioni modifica metadata canonici.

## Roadmap successiva

### OPTIONS-002 — Proiezione GM/Player

Completata: view model tracker, reminder pubblici e output locali mappa usano
le projection boundary descritte sopra.

### OPTIONS-003 — Pannello Opzioni

Completata. Il pulsante `Opzioni` è disponibile al GM nel tracker e apre un
popover dedicato. Il pannello espone esattamente le dieci famiglie approvate:

1. layout tracker locale;
2. Follow locale del turno attivo;
3. registrazione Combat Log locale;
4. sincronizzazione apertura tracker Player (Room);
5. matrice HP Player per superficie e fazione (Room/scena);
6. condizioni, spell e concentrazione Player (Room/scena);
7. dettaglio reminder, CD e caster Player (Room/scena);
8. popup cambio turno (Room/scena);
9. risoluzione reminder assistita o informativa (Room/scena);
10. label del turno attivo sulla mappa (Room/scena).

La vista `Questa scena` usa `Eredita` o un override esplicito. L'anteprima
`Cosa vedranno i Player` risolve Room e scena senza leggere metadata grezzi.
Il salvataggio passa solo dai writer del servizio, conserva proprietà unknown
anche nelle entry override e non modifica opzioni fuori dalle dieci famiglie.

La sincronizzazione apertura tracker Player è collegata al relativo selector.
Layout e Follow sono collegati allo scope locale. Le policy HP, effetti,
reminder e popup erano già consumer runtime di OPTIONS-002. La label attiva è
salvabile e visibile nell'anteprima, ma il suo lifecycle runtime resta
intenzionalmente rinviato a OPTIONS-004.

### OPTIONS-004 — Runtime opzionali

Completata. Gli adapter implementano i quattro contratti `mount`, `unmount`,
`cleanupOwnedOutputs` e `reconcileFull`; le transizioni concorrenti sono
serializzate e convergono sull'ultimo valore richiesto.

| Runtime | Selector | Off | Riattivazione |
| --- | --- | --- | --- |
| HP bar mappa | `selectMapHpBarsEnabled` | Ferma listener/writer e cancella soltanto `.../hpbar` e `.../hptext` | Full reconcile dei token con HP canonici |
| Pill effetti locali | `selectMapEffectLabelsEnabled` | Smonta solo il renderer locale e cancella i suoi local item | Full local reconcile redatto |
| Label turno attivo | `selectActiveTurnLabelEnabled` | Invalida la coda e cancella soltanto `.../activeTurnLabel` | Reconcile dall'attore corrente |
| Label quota | `selectElevationLabelsEnabled` | Smonta listener e cancella soltanto `.../elevationLabelOf` | Full reconcile dei token con quota |
| Tool Clock | `selectClocksToolEnabled` | Chiude popover e rimuove il tool; clock intatti | Registra nuovamente il tool |
| Tool Distanza 3D | `selectDistance3dToolEnabled` | Chiude popover e rimuove il tool; quota intatta | Registra nuovamente il tool |
| Enciclopedia DM | `selectReferenceToolEnabled` | Chiude popover e rimuove il tool | Registra nuovamente il tool |
| Sink Combat Log | `selectCombatLogEnabled` | Interrompe nuovi eventi automatici/manuali; History e sessioni intatte | Riprende la sessione esistente o ne crea una al prossimo evento |

Il cambio scena forza una transizione `scene-ready` anche quando il valore
risolto non cambia. Un runtime disabilitato ripete quindi il cleanup nella nuova
scena; un runtime attivo esegue un full reconcile. Prima del cleanup gli adapter
attendono le operazioni già avviate, evitando che una write tardiva ricrei un
output appena rimosso.

La rimozione delle HP bar invalida anche il layout delle label quota, che usa il
fallback sul token quando la barra non esiste. Nessun cleanup cancella HP,
condizioni, spell, quota, clock, History, iniziativa o sessioni Combat Log.

## Limiti intenzionali dopo OPTIONS-004

- il pannello OPTIONS-003 continua a esporre le dieci famiglie approvate; gli
  altri runtime v1 sono collegati allo schema e ai selector ma non ricevono
  nuovi controlli UI in questo step;
- i lifecycle canonici di condizioni, spell, feature, History, coordinator,
  navigazione e scene event hub non sono disattivabili;
- Combat Log resta last-event-driven: la riattivazione non crea una sessione
  finché non arriva un nuovo evento o una scelta esplicita dell'utente;
- resta last-commit-wins tra sessioni GM concorrenti sulla stessa chiave;
- la matrice effects resta globale e non ancora per fazione, come previsto
  dallo schema v1 dell'audit.
