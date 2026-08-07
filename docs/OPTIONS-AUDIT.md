# Audit delle opzioni configurabili

## 0. Scopo, fonti e criterio di conteggio

Questo audit fotografa `main` il 5 agosto 2026. Non propone modifiche ai formati canonici esistenti e non tratta una costante tecnica come opzione soltanto perché è hardcoded.

Fonti esaminate:

- codice runtime in `src/`, entry point Vite e pagine HTML;
- test contrattuali in `test/`;
- `README.md`, `docs/ARCHITETTURA.md`, `docs/ARCH-002-METADATA-KEY-SCOPED.md`, `docs/ARCH-003-EFFECTS-MUTATION-COORDINATOR.md`, `docs/ARCH-004-EVENT-HUB-RENDER-SCHEDULER.md`, `docs/ARCH-005-IDEMPOTENT-RECONCILERS.md`, `docs/DESKTOP-PORT-AUDIT.md` e guide funzionali correnti;
- brief allegato. La cartella dell'allegato non contiene una review architetturale separata; il codice e la documentazione corrente su `main` sono quindi stati usati come fonte autorevole, come richiesto dal brief.

Il conteggio finale usa la nozione di **famiglia configurabile esistente**: una preferenza, un controllo persistente o sessionale, oppure una configurazione room/scena/oggetto regolabile dal GM. Non conta separatamente ogni campo di una stessa form, non conta i payload transitori tra iframe e non conta lo stato canonico prodotto automaticamente dal runtime. Con questo criterio esistono **36 famiglie configurabili già presenti ma sparse**: 13 locali/sessionali, 4 room, 7 di scena e 12 object-level.

Le **opzioni globali consigliate** sono invece gruppi di scelta che avrebbero senso in un pannello Opzioni. Le configurazioni di una creatura, spell, clock o aura restano object-level anche quando contengono molti campi.

### Categorie usate

| Categoria | Significato operativo |
| --- | --- |
| ALWAYS-ON | Garanzia tecnica o regola di coerenza: nessun toggle. |
| HIDE-ONLY | Si può nascondere l'accesso/UI, ma il runtime deve continuare a custodire stato ed effetti esistenti. |
| OPTIONAL-RUNTIME | Il runtime può essere smontato, con lifecycle esplicito, cleanup e riattivazione. |
| CONFIGURABLE-BEHAVIOR | Runtime sempre presente, poche varianti sicure. |
| PRESENTATION | Preferenza solo visiva/personale. |
| OBJECT-LEVEL | Configurazione della singola entità, non globale. |
| DO-NOT-EXPOSE | Variabile teorica troppo rischiosa, tecnica o priva di valore al tavolo. |

## 1. Inventario delle preferenze e configurazioni esistenti

### 1.1 Famiglie locali e sessionali — 13

| ID | Configurazione corrente | Persistenza | Default corrente | Note |
| --- | --- | --- | --- | --- |
| L01 | Layout tracker esteso/compatto | `localStorage`, `.../tracker-layout` | Esteso | Già esposta dal toggle del tracker. |
| L02 | Posizione tracker compatto | `localStorage`, `.../tracker-compact-position` | Centro-basso calcolato | Trascinamento e reset con doppio click. |
| L03 | Larghezza manuale tracker compatto | `localStorage`, `.../tracker-compact-manual-width` | Automatica | Gestita dalle maniglie di resize. |
| L04 | Tracker aperto/chiuso nel browser | `localStorage`, `.../tracker-popover-open` | Chiuso | Stato locale, coordinato anche con la room dal GM. |
| L05 | Clock compatti | `localStorage`, `.../clocks-compact` | Non compatto | Un'unica chiave è letta sia dal tool sia dal modal. |
| L06 | Posizione pannello Clock | `localStorage`, `.../clocks-position` | Alto-destra calcolato | Puramente locale. |
| L07 | Posizione pannello Distanza 3D | `localStorage`, `.../distance-3d-position` | Destra-centro calcolato | Puramente locale. |
| L08 | Stile AoE predefinito | `localStorage`, `.../aoe-style` | fill `#38bdf8`, stroke `#7dd3fc`, opacity `0.18`, width `1` | Preferenza locale usata per nuove aree; lo stile dell'area creata è poi object-level. |
| L09 | Posizione dei popover trascinabili | `localStorage`, prefisso `.../popover-position/` | Posizione del chiamante | Famiglia dinamica per ID popover. |
| L10 | Diagnostica iniziativa | `localStorage`, `.../initiative-diagnostics` | Off | Dev-only, buffer massimo 500 eventi. |
| L11 | Diagnostica effetti | `localStorage`, `.../effects-diagnostics` | Off | Dev-only, coordinabile con il background. |
| L12 | Speed Tracker attivo/non attivo | Memoria del runtime tracker | Off a ogni bootstrap | Il processor/listener è montato, il conteggio operativo è attivato dal GM. |
| L13 | Profilo turnale di movimento | Metadata token turnale + memoria runtime | Walk, nessun bonus/dash/limite manuale | Modalità, bonus, dash, limite e reset valgono per il turno; non sono una preferenza globale permanente. |

Non sono opzioni: `.../compact-effects-payload`, `.../initiative-card-context-menu/<request>` e `.../tracker-quick-actions/<request>` sono trasporti transitori tra iframe. Devono restare effimeri e non entrare in uno schema Opzioni.

### 1.2 Famiglie room — 4

| ID | Configurazione/stato corrente | Chiave | Default corrente | Note |
| --- | --- | --- | --- | --- |
| R01 | Apertura sincronizzata del tracker Player | `com.thebigpicture.initiative/ui` | Nessun record; il tracker resta chiuso | Il GM scrive `{open, at}`; i Player replicano apertura/chiusura. |
| R02 | Registry delle fazioni | `.../factionRegistry` | Vuoto | Associa asset/nome a `pc`, `ally`, `neutral`, `enemy`; fallback locale omonimo `/local`. |
| R03 | Registry dei profili initiative card | `.../initiativeCards` | Vuoto + defaults di catalogo | Riusa profilo e azioni rapide tra scene; fallback locale `/local`. |
| R04 | Memoria HP/fazione riconoscibile | `.../hpMemory` | Vuota | Fallback persistente automatico, soprattutto per PG; mirror locale `/local`. Non è una seconda fonte canonica durante il normale sync. |

R04 è inventariata perché influenza il comportamento tra scene, ma non deve diventare un pannello di numeri HP globale. L'unica UI sensata è manutenzione mirata/esportazione futura, non editing ordinario.

### 1.3 Famiglie di scena — 7

| ID | Configurazione corrente | Posizione | Default corrente | Note |
| --- | --- | --- | --- | --- |
| S01 | Follow/focus del turno | `state.ui.autoFocus` | On quando assente | È salvata nella scena, anche se l'effetto è sul viewport locale GM: scope corrente non ideale. |
| S02 | Azioni di Tana | `state.lairEnabled` | Off | Aggiunge la voce virtuale `__LAIR__` a iniziativa 20. |
| S03 | Gruppi collassati | `state.collapsed` | Gruppi omonimi collassati | Si espandono sul turno attivo e si richiudono all'uscita. |
| S04 | Ordine manuale dei pari iniziativa | `state.order` | Ordinamento deterministico | Drag solo nel blocco con pari iniziativa; preserva voci virtuali. |
| S05 | Iniziative dei turni Paragon | `state.paragonInits` | Iniziativa base replicata | Valori per le voci virtuali del singolo boss. |
| S06 | Collezione Clock | `.../clocks` | Vuota | Ogni clock configura nome, 4/6/8/12 segmenti, valore, colore, ordine e visibilità Player. |
| S07 | Sessione Combat Log attiva | `.../combat-log-state` | Creata automaticamente al primo evento/turno GM | Solo il puntatore è nella scena; eventi e sessioni sono in IndexedDB locale GM. |

Ordine, indice corrente e round sono stato canonico dell'incontro, non opzioni. Sono regolabili dai normali comandi di combattimento e non devono essere duplicati in Opzioni.

### 1.4 Famiglie object-level — 12

| ID | Entità | Configurazioni già disponibili | Fonte canonica |
| --- | --- | --- | --- |
| O01 | Token in iniziativa | Inclusione, iniziativa, `initTouched` | `meta` token |
| O02 | Token/fazione | PG, alleato, neutrale, nemico | `meta.attitude` |
| O03 | Token/HP | HP correnti e massimi; HP temporanei rappresentati dal flusso HP corrente senza campo alternativo | `meta.hp`, `meta.hpMax` |
| O04 | Initiative card | CA, Percezione passiva, velocità, CD spell, bonus attacco spell, TS, note, indebolimento | `meta.initiativeCard`, con registry room/fallback |
| O05 | Azioni rapide | Fino a 12; spell/condizione/capacità, self/selezione, workflow spell/area, slot, durata, automazioni | Profilo `initiativeCard.quickActions` |
| O06 | Build e capacità | Fino a 4 classi con livello/sottoclasse, capacità abilitate | Profilo `initiativeCard` |
| O07 | Runtime capacità | Risorse, usi, istanze, scelte, parent, durata e target | `meta.classFeatureState` |
| O08 | Condizione | Tipo/custom, istanza, fonte, durata manual/round/start/end/concentration, meccaniche, `mapVisible`, rimozione parent | `meta.conditions` |
| O09 | Spell/concentrazione | Caster, target, slot, durata/scadenza, variante, automazioni, area, prepared phase, active action | `meta[.../spells]`, `meta[.../concentration]` |
| O10 | Boss | Modalità Legendary/Paragon/Epic mutuamente esclusive, azioni/resistenze, numero turni | Campi `meta.legendary`, `legendaryResistances`, `paragon`, `epic` |
| O11 | Quota | Elevazione del token | `meta.elevation` |
| O12 | Aura/area | Aura personalizzata: enabled, raggio, stile, targeting, source inclusion, pill, warning start/end. Area: geometria, DPI, stile, regola/istanza. | `meta.customAuras` e metadata item `.../aoeArea`, `.../customAura`, zone/aure spell/feature |

### 1.5 Feature flag e diagnostica esistenti

Il repository non ha un sistema di feature flag di prodotto: non esiste oggi un registro centralizzato capace di abilitare o disabilitare moduli per room o scena. Esistono invece strumenti tecnici, che non vanno promossi a normali opzioni utente:

| Meccanismo | Stato/persistenza | Uso corretto |
| --- | --- | --- |
| Diagnostica iniziativa | Opt-in locale in `.../initiative-diagnostics`, buffer massimo 500 eventi | Supporto tecnico locale; default off. |
| Diagnostica effetti | Opt-in locale in `.../effects-diagnostics`, con canali broadcast di richiesta/risposta | Supporto tecnico al reconciler; default off. |
| Diagnostica chiavi metadata | Flag runtime `__TBP_METADATA_KEY_DIAGNOSTICS__`, non persistente | Individuare scritture non conformi durante sviluppo/debug. |
| `DEBUG_CTX` e `DEBUG_CONC` | Costanti compile-time `false` | Logging di sviluppo; non sono feature flag. |
| Sentinel `window.__TBP_*_MOUNTED` e handle controller globali | Stato runtime non canonico | Idempotenza/mount lifecycle e ispezione tecnica; non configurazione. |

### 1.6 Default e costanti hardcoded rilevanti

| Area | Default/costante corrente | Valutazione |
| --- | --- | --- |
| Tracker | Layout esteso; Follow on quando `state.ui.autoFocus` è assente | Buoni candidati a preferenza locale, con migrazione del Follow fuori dalla scena. |
| Player | HP esatti su PG+Alleati nell'esteso e sui soli PG nel compatto; effetti e reminder completi | Comportamento da preservare come preset legacy, ma da rendere policy room esplicita e sicura. |
| Tana | Iniziativa 20; feature scena off finché non attivata | La presenza è configurabile per incontro; il valore 20 è regola di dominio e non va esposto. |
| Clock | Segmenti ammessi 4/6/8/12; visibilità Player per singolo clock | Configurazione object-level già adeguata. |
| Boss | 3 resistenze leggendarie iniziali; Legendary/Paragon/Epic mutuamente esclusivi | Object-level; non globale. Il default meccanico non richiede una preferenza generale. |
| Limiti UI | 12 azioni rapide, 4 classi, 3 condizioni custom | Vincoli di schema/UX; non opzioni utente. |
| History | Massimo 30 entry | Garanzia operativa; non opzione. |
| HP bar | Soglie colore e geometria fissate; larghezza sempre derivata da `hp/hpMax` | Stile tecnico non esposto nella prima release; i dati visuali non diventano fonte canonica. |
| AoE/aure | Stili, DPI, forma, targeting e raggio scelti nel workflow; regole di membership hardcoded | Stile object-level; matematica, ownership e membership restano garanzie tecniche. |

## 2. Mappa degli storage correnti

### 2.1 `localStorage`

| Chiave/famiglia | Contenuto | Natura | Condivisione corretta? |
| --- | --- | --- | --- |
| `.../tracker-layout` | `classic`/`compact` | Presentazione | Sì, locale. |
| `.../tracker-compact-position` | `{left, top}` | Presentazione | Sì, locale. |
| `.../tracker-compact-manual-width` | Pixel | Presentazione | Sì, locale. |
| `.../tracker-popover-open` | `1`/`0` | UI locale | Sì; R01 coordina separatamente il Player. |
| `.../clocks-compact` | `1`/`0` | Presentazione | Sì, locale. |
| `.../clocks-position` | `{left, top}` | Presentazione | Sì, locale. |
| `.../distance-3d-position` | `{left, top}` | Presentazione | Sì, locale. |
| `.../aoe-style` | Palette e spessore di default | Presentazione/authoring | Sì: influenza solo nuove aree create da quel GM. |
| `.../popover-position/<id>` | Posizione per popover | Presentazione | Sì, locale. |
| `.../initiative-diagnostics` | Flag | Diagnostica | Sì, ma non va nel pannello utente ordinario. |
| `.../effects-diagnostics` | Flag | Diagnostica | Sì, ma non va nel pannello utente ordinario. |
| `.../initiativeCards/local` | Fallback profili | Cache/fallback | Non è una preferenza. Room resta il livello condiviso. |
| `.../factionRegistry/local` | Fallback registry | Cache/fallback | Non è una preferenza. |
| `.../hpMemory/local` | Fallback memoria HP | Cache/fallback | Non è una preferenza. |
| Payload menu/compact effects | Dati effimeri iframe | Trasporto | Non migrare nello schema Opzioni. |

### 2.2 IndexedDB locale

`combatLog.js` usa il database `com.thebigpicture.initiative.combat-log`, versione 1, con store `sessions` ed `events`. Il contenuto è locale al browser GM; la scena conserva soltanto il puntatore alla sessione attiva. Un secondo browser GM può vedere il puntatore ma non possiede automaticamente gli eventi. Questo limite deve essere mostrato chiaramente se il Combat Log diventa opzionale.

### 2.3 Room metadata

| Chiave | Owner | Contenuto | Regola |
| --- | --- | --- | --- |
| `.../ui` | `action-launcher.js` | Apertura tracker condivisa | Writer key-scoped; Player segue il GM. |
| `.../hpMemory` | `hpMemory.js` | Memoria HP/fazione per identità | Fallback, non fonte concorrente. |
| `.../factionRegistry` | `factionRegistry.js` | Asset/nome → fazione | Merge con fallback locale; nomi ambigui non autoassegnati. |
| `.../initiativeCards` | `initiativeCards.js` | Profili card per nome | Merge e sanitizzazione; quick actions incluse. |

### 2.4 Scene metadata

| Chiave | Owner | Contenuto | Regola |
| --- | --- | --- | --- |
| `.../state` | `initiativeList.js`, cleanup mirato `contextMenu.js` | Ordine, current, round, gruppi, UI Follow, Lair, Paragon | Fonte globale del tracker; contiene ID virtuali. |
| `.../history` | `history.js` | Fino a 30 entry Undo, version 1 | Snapshot field-scoped; conflitti impediscono Undo parziali. |
| `.../clocks` | `clocks.js` | Clock version 1 | Stato condiviso GM/Player. |
| `.../combat-log-state` | `combatLog.js` | Puntatore sessione locale GM | Tombstone `null` per nessuna sessione. |

### 2.5 Token metadata

La chiave `com.thebigpicture.initiative/meta` resta la fonte di verità per creatura. I writer devono fondere l'oggetto esistente. Campi principali osservati: `inInitiative`, `initiative`, `initTouched`, `attitude`, `hp`, `hpMax`, `conditions`, `initiativeCard`, `elevation`, `legendary`, `legendaryResistances`, `paragon`, `epic`, `classFeatureState`, `customAuras`, stato turnale di movimento, `com.thebigpicture.initiative/spells` e `com.thebigpicture.initiative/concentration`.

Non introdurre un oggetto options dentro `meta`: le policy globali appartengono a room/scena; i dati di una specifica creatura restano qui.

### 2.6 Item di scena e item locali derivati

| Output | Tipo | Visibilità/owner corrente | Canonico? |
| --- | --- | --- | --- |
| Barra HP background/foreground + testo | Attachment di scena `.../hpbar`, `.../hptext` | Writer GM; Player vede Ally/PC, inclusi valori esatti | No, ricostruibile. |
| Label turno attivo | Label di scena `.../activeTurnLabel` | Writer GM, visibile in mappa | No. |
| Label quota | Attachment di scena `.../elevationLabelOf` | Writer GM | No. |
| Pill condizioni, spell e concentrazione | `OBR.scene.local` | Ricreate su ogni client, GM e Player | No. |
| Area AoE persistente | Item di scena `.../aoeArea` | Writer GM | Geometria/stile è stato dell'oggetto; non è fonte degli effetti token. |
| Zona spell statica | Item di scena `.../spellStaticZone` | Writer/controller GM | Derivata dall'istanza, con identità e stato di recovery. |
| Aura spell/feature/custom | Item di scena con metadata dedicato | Writer/controller GM | Visuale derivata; membership produce effetti canonici token. |
| Preview AoE/probe diagnostici | Item locali/transitori | Browser corrente | No, devono essere ripuliti. |

## 3. Wiring automatico, ruoli e dipendenze

### 3.1 Entry point

| Runtime | Montaggi automatici |
| --- | --- |
| `main.js` / tracker | Context menu, HP memory, tracker, scheduler render, scene item subscriber, HP bars, selection sync, Speed Tracker, History/movement watcher GM, Combat Log turnale, popup e menu. |
| `background.js` | Host notifiche, Effects Mutation Coordinator, effects reconciler locale, controller aura spell/feature/custom, zone statiche, reminder effect/class feature, prepared spell resolution. Importa inoltre sync apertura, Clock, Distanza 3D, Enciclopedia, AoE e tool legacy movimento. |

### 3.2 Differenze GM/Player correnti

- Il GM è l'unico writer delle mutazioni persistenti di effetti, zone/aure, HP bar, label quota, iniziativa e Combat Log.
- Entrambi i ruoli montano il renderer locale di pill/label effetti; solo il GM possiede il cleanup globale legacy.
- Il Player non riceve toolbar, navigazione, editor, History, quick action UI o class feature context UI.
- Il view model tracker non è ancora una proiezione Player autonoma: `entryFromSceneItem()` legge HP, condizioni, spell, concentrazione e dati boss prima del rendering. Solo `classFeatures` viene svuotato; le quick action `feature` sono filtrate, ma le altre quick action restano nel modello anche se il controllo non viene montato.
- HP tracker correnti: esteso mostra esatti a PG e Alleati; compatto mostra esatti ai soli PG; neutrali/nemici nascosti. Le map HP bar mostrano esatti a PG e Alleati.
- Condizioni, spell e concentrazione nel tracker e nelle pill locali non sono oggi filtrate per fazione.
- Clock: ogni oggetto ha `visible`; il Player riceve/rende solo i clock pubblici.
- Reminder e popup turno sono broadcast `ALL`; il Player vede il contenuto informativo, inclusi CD/caster quando presenti, ma non i controlli di risoluzione.
- Le risorse Legendary/Resistances sono nel modello Player e vengono mostrate come pips non interattivi.

Conclusione: una futura policy Player deve costruire un `PlayerTrackerViewModel` e payload reminder già redatti. Nascondere nodi con `display:none` non è sufficiente. Il plugin deve inoltre applicare la stessa policy agli output locali sulla mappa; altrimenti il tracker può nascondere un'informazione che la pill o la barra continua a rivelare.

## 4. Matrice completa

La colonna “disattivazione” distingue sempre UI, runtime, stato e output. “Inherit” indica che un eventuale override scena eredita il valore room.

| Area/modulo | Comportamento attuale | Categoria | Opzione proposta | Scope | Default | Dipendenze | Comportamento alla disattivazione | Cleanup necessario | Rischio | Raccomandazione finale |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Tracker aperto/chiuso | Il GM apre il popover; room `ui.open` sincronizza il Player. Background resta attivo. | CONFIGURABLE-BEHAVIOR | “Sincronizza apertura Player” | Room | On, comportamento corrente | Action launcher, sync-open, popover locale | Chiude/nasconde solo il tracker Player; nessuno stato combattimento è cancellato | Chiudere popover locale | Basso | Consigliare; non equivale a spegnere il plugin. |
| Tracker esteso/compatto | Layout locale, stessa iniziativa; policy HP Player oggi differente per layout. | PRESENTATION | “Layout tracker” | Local preference | Esteso | Renderer card, sizing/position | Solo cambio visuale; runtime invariato | Nessuno | Basso, salvo leak HP se policy resta implicita | Mantenere; separare in futuro layout da disclosure HP. |
| Posizione/larghezza tracker e pannelli | Coordinate e width locali, clamp al viewport. | PRESENTATION | “Ripristina disposizione pannelli” più controlli esistenti | Local preference | Auto | Popover host | Ripristina soltanto coordinate/dimensioni | Rimuovere chiavi locali mirate | Basso | Non creare slider aggiuntivi. |
| Toolbar GM | Contiene incontro, Follow, Tana, Conditions, Spells, Danno, Movimento e menu compatti. | HIDE-ONLY | “Controlli mostrati” con preset Essenziale/Completo | Local preference | Completo | Tutti i pannelli; i runtime vivono altrove | Nasconde pulsanti, non smonta controller né cancella dati | Chiudere eventuali popover nascosti | Medio per discoverability | Eventuale seconda release; usare preset, non un toggle per icona. |
| Follow/focus turno | Seleziona token e anima viewport; `state.ui.autoFocus`, default true. | CONFIGURABLE-BEHAVIOR | “Segui il turno attivo” | Local preference; legacy letto dalla scena | On | Navigazione seriale, revision/stale guard, virtual ID resolver | Non centra il viewport; selezione/turno e label restano | Cancellare solo timer viewport pendente | Medio | Consigliare e correggere lo scope, senza semplificare la coda. |
| Navigazione turno/round | Serializza prev/next, tick, reminder, label, log e virtual ID. | ALWAYS-ON | Nessuna | — | Sempre attiva | Quasi tutti i sistemi turnali | Non disattivabile | — | Critico | Non esporre. |
| Gruppi omonimi e pari iniziativa | Auto-collapse/expand; drag solo tra pari; stato in scena. | CONFIGURABLE-BEHAVIOR | Nessuna nuova opzione globale; controlli inline esistenti | Scene/object interaction | Corrente | Order, misure DOM, scroll compensation | N/A | Nessuno | Alto se globalizzato | Lasciare nel tracker. |
| Azioni di Tana | Toggle scena, voce virtuale a iniziativa 20. | CONFIGURABLE-BEHAVIOR | “Azioni di Tana in questo incontro” | Scene override | Off | Reconcile ordine, turn notice, Combat Log | Rimuove la sola voce virtuale; non tocca token | Reconcile order | Medio | Mantenere come controllo incontro, non in preferenze permanenti. |
| Label turno sulla mappa | Attachment/label derivata dal turno attivo. | OPTIONAL-RUNTIME | “Etichetta turno sulla mappa” | Room + Scene override | On | State, bounds token, epoch/revision | Smette di generare/aggiornare; stato turno invariato | Eliminare soltanto item owner `activeTurnLabel`; al riuso reconcile | Medio | Consigliare. |
| Popup cambio turno | Host condiviso mostra “Turno di…”, round e prossimo; condivide il contenitore con reminder. | CONFIGURABLE-BEHAVIOR | “Popup cambio turno” | Room + Scene override | On | Turn notice broadcast/host; reminder separati nello stesso host | Sopprime solo payload `show-turn-notice`; reminder continuano | Chiudere la sola card turno, non il popover se ci sono reminder | Medio | Consigliare; un toggle del host intero è pericoloso. |
| Proiezione Player | Stesso modello base GM, controlli nascosti a valle. | ALWAYS-ON | Policy Player, ma redazione sempre obbligatoria | Room | Comportamento corrente | Tutti i renderer e payload pubblici | La policy può cambiare campi ammessi; la redazione non può essere spenta | Rimuovere dati non ammessi prima del DOM/local items | Critico/privacy | Prima infrastruttura necessaria per qualunque opzione Player. |
| HP Player nel tracker | Esatti: esteso PG+Alleati; compatto solo PG; altri nascosti. | CONFIGURABLE-BEHAVIOR | “HP visibili ai Player per fazione e superficie” (`exact`/`bar`/`status`/`hidden`) | Room + Scene override | Matrice legacy esatta | Projection, card layouts, canonical HP | Cambia solo proiezione; HP canonici e GM invariati | Rimuovere immediatamente testo/barra UI non ammessi | Alto | Consigliare con preset “Attuale”, “Solo stato”, “Nascosto”. |
| HP bar sulla mappa | Writer GM crea attachment globali; esatti per PG+Alleati, nascosti per altri. | OPTIONAL-RUNTIME | “Barre HP sulla mappa” + policy Player coerente | Room + Scene override | On | HP canonici, attitude, bounds, elevation layout | Stop writer; HP/tracker/History restano | Delete owner-scoped bg/fg/text dopo verifica; reconcile completo al riuso | Alto per leak e delete indiscriminato | Consigliare solo dopo controller lifecycle dedicato. |
| Pill effetti sulla mappa | Il reconciler locale crea label di condizioni, spell e concentrazione separatamente su ogni client. | OPTIONAL-RUNTIME | “Effetti sulla mappa” + policy Player per contenuto/fazione | Room + Scene override per i Player; preferenza locale per il GM | On | Projection Player, conditions/spells tag, bounds, reconciler | Smette di creare pill sul client interessato; tracker e stato canonico continuano | Eliminare solo local item di proprietà del renderer; full reconcile al riuso | Alto/privacy | Consigliare dopo projection/redaction; non usare il toggle per fermare il lifecycle effetti. |
| HP sync, clamp e fallback | `hp`/`hpMax` canonici alimentano card, memory, bar e automazioni zero HP. | ALWAYS-ON | Nessuna | — | Sempre | HP editor, Console, Undo, effects coordinator | Non disattivabile | — | Critico/dati | Non esporre. |
| Console HP | Batch danno/cura/temp, fattori, selezione, History composita, warning concentrazione. | HIDE-ONLY | Visibilità nel preset toolbar | Local preference | Visibile | HP writer, coordinator effetti, History, map bars | Nasconde il punto di accesso; API e sincronizzazione restano | Chiudere popover | Basso | Non spegnere automazioni HP quando la UI è nascosta. |
| Condizioni — UI | Ricerca/fazioni, preset/custom, durata, rimozione. | HIDE-ONLY | Visibilità nel preset toolbar | Local preference | Visibile | Conditions writer/coordinator, tracker chips | Nasconde editor; condizioni esistenti continuano a scadere e renderizzare | Chiudere popover | Medio | Seconda release/preset. |
| Condizioni — lifecycle | Istanze, scadenze, zero HP, velocità, indebolimento e parent cleanup. | ALWAYS-ON | Nessuna | — | Sempre | Turn boundaries, HP, movement, features/spells | Non disattivabile | — | Critico | Toggle on/off globale vietato. |
| Visibilità condizioni Player | Oggi visibili senza filtro di fazione nel tracker e nei local items, salvo `mapVisible:false` object-level. | CONFIGURABLE-BEHAVIOR | “Condizioni ai Player per fazione/superficie” | Room + Scene override | Tutte visibili | Player projection, effects local renderer | Redige label/dettagli; non rimuove condizioni canoniche | Cleanup local item non più ammessi | Alto/privacy | Consigliare; default invariato. |
| Condizione singola | Custom/preset, expiry, fonte, dettaglio, `mapVisible`, parent. | OBJECT-LEVEL | Nessuna opzione globale | Object setting | Valori scelti all'applicazione | Conditions schema v2 | Disattivare/rimuovere l'istanza usa coordinator e History | Cleanup per instanceId | Medio | Lasciare nel workflow Condizioni/spell/feature. |
| Spell e concentrazione — UI | Catalogo, cast, overview, prepared, active actions, terminate. | HIDE-ONLY | Visibilità nel preset toolbar | Local preference | Visibile | Catalogo, coordinator, area placement, reminders | Nasconde UI; istanze, concentrazione, ticking e cleanup continuano | Chiudere popover | Alto se scambiato per runtime off | Solo hide. |
| Spell/concentrazione — lifecycle | Istanza distribuita sui token, ticking, parent/child, break, expiry, prepared extension. | ALWAYS-ON | Nessuna | — | Sempre | Coordinator, zone/aure, reminder, movement | Non disattivabile quando esiste stato | Cleanup normale per instanceId/sourceId | Critico | Non esporre. |
| Visibilità spell Player | Oggi spell/concentrazione entrano nel modello Player e nelle pill mappa per tutte le fazioni. | CONFIGURABLE-BEHAVIOR | “Spell e concentrazione ai Player per fazione/superficie” | Room + Scene override | Tutte visibili | Projection, local effects renderer, card effects | Redige nome/durata/caster secondo policy; runtime invariato | Cleanup local item non ammessi | Alto/privacy | Consigliare; distinguere spell e semplice indicatore C. |
| Spell singola/cast | Slot, durata, target, caster, variante, automazioni, area, prepared/action. | OBJECT-LEVEL | Nessuna opzione globale | Object setting | Definizione/catalogo + scelta GM | Catalogo/rules/executor | Terminazione usa lifecycle esistente | Cleanup figli/zone/aure per identità | Alto | Lasciare nel workflow spell. |
| Reminder condizioni/zone | Aggregati a start/end, sostituiti al cambio turno, broadcast a tutti. | CONFIGURABLE-BEHAVIOR | “Dettaglio reminder Player”: `full`, `senza CD/caster`, `solo avviso`, `hidden` | Room + Scene override | Full | Turn state, effect/zone controllers, caster card | Redige il payload Player; controller GM continua a calcolare | Chiudere reminder Player non più ammessi | Alto/privacy | Consigliare. |
| Risoluzione diretta reminder | GM può dichiarare esito/danno; Player è informativo; coordinator produce una History. | CONFIGURABLE-BEHAVIOR | “Reminder assistiti” (`assisted`/`informational`) | Room + Scene override | Assisted | Resolution core, coordinator, HP, History, Combat Log | In `informational` nasconde input/esiti ma non il reminder né lo stato | Nessuno | Medio | Consigliare: adatta tavoli che vogliono solo promemoria. |
| Warning concentrazione da danno | Popup GM con CD max(10, danno/2); non tira dadi. | CONFIGURABLE-BEHAVIOR | Nessuna opzione separata in v1; segue “Reminder assistiti” | Room/Scene | On | Console HP, HP editor, conc metadata | Informational mantiene avviso senza risoluzione automatica | Chiudere popup corrente se policy cambia | Medio | Evitare un toggle aggiuntivo. |
| Speed Tracker UI | Attivazione manuale, modalità, dash, bonus/limite, warning. | HIDE-ONLY | Preset toolbar; nessun enable permanente | Local preference | Controllo visibile, tracking off | Movement profile, history segments, zone difficult terrain | Nasconde controllo; processor resta idle/off e History movimento resta | Chiudere readout/warning | Medio | Non trasformarlo in regola globale di movimento. |
| Meccaniche movimento | Condizioni/spell/feature modificano profilo; quota in volo consuma; Undo non riconta. | ALWAYS-ON | Nessuna | — | Sempre quando Speed Tracker usato | Conditions/spells/features, grid, elevation, History | Non disattivabile selettivamente senza incoerenza | — | Alto | Non esporre moltiplicatori, rounding o ordine resolver. |
| AoE/targeting generico | Tool GM crea aree, riseleziona target e ospita placement spell. | HIDE-ONLY | “Mostra targeting AoE generico” solo come UI | Local preference | Visibile | Quick HP area, spell placement, persistent listener | Nascondere il pulsante generico non rimuove tool mode/API usate dalle spell | Chiudere preview transitorie, non aree persistenti | Alto | Non smontare se workflow spell area è disponibile. |
| Stile AoE predefinito | Palette locale per nuove aree. | PRESENTATION | “Stile nuove aree” | Local preference | Valori correnti | AoE builder | Influenza solo creazioni future | Nessuno | Basso | Mantenere nell'editor AoE, non nella home Opzioni. |
| Zona spell statica | Item persistente, membership, trigger, watchdog, recovery e cleanup figli. | HIDE-ONLY | Nessun runtime toggle; solo nascondere authoring | —/Local UI | Runtime on | Spell lifecycle, bounds, coordinator, reminder, speed | Con UI nascosta, le zone esistenti continuano | Cleanup solo alla fine istanza, per instanceId | Critico | Un semplice on/off è pericoloso. |
| Aura spell/capacità | Segue sorgente, membership ed effetti mentre dentro. | HIDE-ONLY | Nessun runtime toggle | —/Local UI | Runtime on | Spell/feature state, bounds, effects coordinator | Deve continuare per istanze attive | Owner-scoped alla fine istanza | Critico | Non esporre runtime off. |
| Aura personalizzata | Editor per token; enabled, raggio, target, pill, warning e stile. | OBJECT-LEVEL | Nessuna opzione globale | Object setting | Aura assente; nuova aura enabled | CustomAura controller, local effects, reminders | `enabled:false` sull'aura specifica conserva config ma ritira effetti/visuale | Cleanup visuale e pill per instanceId; reconcile al riuso | Medio | Il toggle esiste già al livello giusto. |
| Quota token | Valore per token; label derivata; usata da distanza e volo. | OBJECT-LEVEL | Nessuna opzione globale sul valore | Object setting | 0/assente | Distance 3D, Speed Tracker fly, elevation label | Rimuovere quota cambia dato della creatura, non è “nascondi label” | Reconcile label | Medio | Tenere distinto valore da visualizzazione. |
| Label quota mappa | Renderer GM di attachment quota. | OPTIONAL-RUNTIME | “Etichette quota sulla mappa” | Room + Scene override | On | `meta.elevation`, bounds, HP bar layout | Nasconde solo label; quota e calcoli 3D restano | Delete owner-scoped; full reconcile al riuso | Medio | Consigliare in seconda release. |
| Distanza 3D | Tool GM, nessuno stato canonico oltre quota. | OPTIONAL-RUNTIME | “Strumento Distanza 3D” | Local preference | On/registrato | Grid, selection, elevation | Rimuove tool/popover; nessun dato cancellato | Chiudere popover e unregister tool | Basso | Consigliare in seconda release. |
| Clock — tool | Tool disponibile a GM e Player, legge scene clocks. | OPTIONAL-RUNTIME | “Clock disponibili” | Room | On/registrato | Clocks scene state | Unregister/chiude UI su entrambi; clock conservati | Nessun cleanup dati; chiudere popover | Basso | Consigliare in seconda release. |
| Clock singolo | Segmenti, nome, colore, valore, ordine e `visible` Player. | OBJECT-LEVEL | Nessuna policy globale obbligatoria | Object setting | Nuovo: 6, rosso, 0, visibile | Clock modal | `visible:false` lo nasconde solo al Player | Nessuno | Basso | Visibilità pubblica resta per clock. |
| History/Undo runtime | Cattura mutazioni e movimento, snapshot field-scoped, conflict guard, max 30. | ALWAYS-ON | Nessuna | — | On | Coordinator, HP, scene watcher, Combat Log | Non disattivabile | — | Critico | UI può essere nascosta, runtime no. |
| History/Undo UI | Modal accessibile solo GM. | HIDE-ONLY | Preset toolbar | Local preference | Visibile | History runtime | Nasconde accesso, History continua | Chiudere popover | Medio | Non confondere con cancellazione History. |
| Combat Log | Auto-sessione e sink degli eventi History/turno; IndexedDB locale. | OPTIONAL-RUNTIME | “Registra Combat Log” | Local preference GM | On | History, turn events, IndexedDB, scene pointer | Stop nuovi eventi; History resta. Conserva sessioni esistenti; riattivazione riprende/crea secondo scelta esplicita | Nessuna cancellazione automatica; eventualmente tombstone solo se utente chiude sessione | Medio | Consigliare in seconda release. |
| Boss Legendary | Risorse azioni/resistenze, reset turnale, pips Player. | OBJECT-LEVEL | Config boss sul token | Object setting | Off; attivazione 3/3 e resistenze 3/3 | Tracker, turn reset, Player view | Disattivazione token rimuove solo campi boss con History appropriata | Reconcile card/order | Alto | Non globale. |
| Paragon/Epic | Voci virtuali, iniziative separate, Epic dopo ogni PG; mutua esclusione boss. | OBJECT-LEVEL | Config boss sul token | Object + state derivato | Off | Order resolver, virtual IDs, turn lifecycle | Disattivazione riconcilia `state.order`/`paragonInits`; non filtrare ID alla cieca | Reconcile ordine | Critico | Non esporre regole di iniezione/initiative 20. |
| Informazioni boss Player | Oggi modalità e risorse sono visibili. | CONFIGURABLE-BEHAVIOR | “Dettagli boss ai Player”: `full`/`solo modalità`/`hidden` | Room + Scene override | Full | Player projection, classic/compact cards | Redige risorse; logica boss GM invariata | Rerender Player | Medio/privacy tattica | Consigliare, probabilmente seconda release. |
| Capacità di classe — UI/catalogo | Build, enable, risorse e attivazioni nella card. | HIDE-ONLY | Preset toolbar/card | Local preference | Visibile per card configurate | Card profile, catalog, runtime feature | Nasconde controlli; istanze e passive restano attive | Chiudere modal | Alto | Non offrire “disabilita capacità” globale. |
| Capacità di classe — runtime | Risorse, condizioni, aura, parent lifecycle e reminder. | ALWAYS-ON | Nessuna | — | On per feature configurate | Coordinator, conditions, aura, reminder, spell reuse | Non disattivabile con istanze/config esistenti | Cleanup per feature/instanceId | Critico | Garanzia. |
| Azioni rapide | Scorciatoie fino a 12 nel profilo card. | OBJECT-LEVEL | Nessuna opzione globale | Object setting | Nessuna | Card registry, spell/condition/feature workflows | Rimuovere una shortcut non altera effetti già attivi | Rimuovere payload menu transitorio | Basso | Lasciare nella scheda. |
| Registry fazioni | Riusa asset/nome; fallback enemy; ambiguità non autoassegnata. | CONFIGURABLE-BEHAVIOR | “Autoassegna fazioni note” | Room | On, comportamento corrente | Add actors, token attitude, visibility policy | Off impedisce nuove autoassegnazioni; registry e fazioni token restano | Nessuno | Medio | Opzione utile ma non prioritaria; “Azzera registry” resta manutenzione separata. |
| Catalogo spell | Catalogo statico e regole deterministiche. | DO-NOT-EXPOSE | Nessuna scelta di catalogo runtime | — | Catalogo corrente | Tutto il motore spell | Non disattivabile selettivamente senza rompere istanze/quick actions | — | Alto | Filtri UI sì; enable/disable cataloghi no in v1. |
| Catalogo capacità | Catalogo generato; record implemented/manual. | DO-NOT-EXPOSE | Nessuna scelta di pacchetti runtime | — | Catalogo corrente | Build, feature IDs persistiti | Un pacchetto off renderebbe orfani ID configurati | — | Alto | Non esporre; filtri di consultazione restano UI. |
| Enciclopedia DM | Tool read-only su cataloghi/reference. | OPTIONAL-RUNTIME | “Enciclopedia DM” | Local preference GM | On/registrata | Reference data soltanto | Unregister/chiude UI; nessun effetto di gioco | Chiudere popover | Basso | Consigliare in seconda release. |
| Diagnostica iniziativa/effetti/metadata | Console globals, flag locali, probe e report. | DO-NOT-EXPOSE | Nessuna nel pannello normale; eventuale pagina supporto nascosta | Local/dev | Off | Logging e probe | Rimane off; non cambia runtime funzionale | Cleanup probe locale se attivo | Medio per rumore/performance | Escludere dalla prima release. |
| Coordinator, writer, event hub, scheduler, reconciler | Lane, key ownership, stale guard, idempotenza, recovery. | ALWAYS-ON | Nessuna | — | Sempre | Tutto il plugin | Non disattivabile | — | Critico/dati | Mai presentare come “modalità avanzata”. |
| Manutenzione automatica | Legacy cleanup owner-scoped, orphan/duplicate cleanup, bounds recovery. | ALWAYS-ON | Nessuna; solo comandi diagnostici mirati | — | Sempre | Derived outputs | Non disattivabile | Cleanup stesso, bounded e owner-scoped | Critico | Nessun pulsante “pulisci tutto” generico. |

## 5. Garanzie ALWAYS-ON

Queste **20 garanzie** non devono mai diventare opzioni:

1. scene epoch e invalidazione immediata al cambio/unload;
2. writer metadata key-scoped e merge dei metadata token esistenti;
3. chiavi canoniche `.../meta` e `.../state` immutabili senza migrazione esplicita;
4. una sola lane background per mutazioni persistenti di conditions/spells/concentration;
5. scene identity, command ID, deduplica e rifiuto dei comandi stale;
6. precondizioni e atomic conflict guard dell'Undo;
7. render scheduler seriale, priorità full/incremental e guard degli editor inline;
8. event hub con revisioni, invalidazioni per dominio e filtri anti-loop;
9. reconciler idempotenti con reread dopo errori ambigui e retry bounded;
10. output derivati mai usati come fonte canonica;
11. cleanup owner-scoped e per `instanceId`/`sourceId`, mai per nome soltanto;
12. risoluzione degli ID virtuali Lair/Paragon/Epic prima dell'accesso agli item;
13. `meta.hp`/`meta.hpMax` come unica fonte HP e clamp coerente;
14. HP memory come fallback, non writer concorrente del normale sync;
15. lifecycle spell/concentrazione/prepared, ticking e cleanup figli;
16. lifecycle condizioni/capacità, scadenze e automazioni deterministiche;
17. mutua esclusione Legendary/Paragon/Epic e invarianti dell'ordine;
18. autorità GM sui comandi persistenti e validazione del ruolo;
19. proiezione Player/redazione prima del DOM e dei payload pubblici;
20. nessun tiro virtuale o adjudication nascosta: il tavolo resta autorevole.

## 6. Moduli HIDE-ONLY

Sono **13 famiglie di UI/controlli soltanto nascondibili**:

1. tracker UI (chiuderlo non spegne il background);
2. toolbar amministrativa/preset controlli;
3. Console HP;
4. pannello Condizioni;
5. pannello Incantesimi/concentrazione;
6. controllo Speed Tracker;
7. targeting AoE generico quando restano disponibili workflow spell area;
8. authoring di zone e aure spell;
9. editor aure personalizzate;
10. controlli boss/Lair/Paragon/Epic;
11. UI Capacità di classe;
12. UI Azioni rapide e configuratore fazioni;
13. UI History/Undo.

Per tutti vale la stessa regola: nascondere il controllo non cancella stato canonico, non termina istanze e non smonta writer/controller necessari.

## 7. Moduli realmente OPTIONAL-RUNTIME

Sono **8 moduli realmente disattivabili**, ma alcuni richiedono lavoro di lifecycle non ancora presente:

| Modulo | Stato alla disattivazione | Cleanup | Riattivazione |
| --- | --- | --- | --- |
| Map HP bars | HP canonici intatti | Delete owner-scoped bg/fg/text dopo lettura/verifica | Full reconcile di tutti i token con HP |
| Local effects labels | Conditions/spells intatti | `cleanupLocalEffectsLayout()` sul solo client/policy interessata | Full local reconcile |
| Active turn map label | State turno intatto | Delete owner-scoped label | Reconcile dall'attore corrente |
| Elevation labels | Quota e distanza intatte | Delete owner-scoped label | Full reconcile token con quota |
| Clock tool UI | Clock di scena intatti | Chiudi popover/unregister tool | Register e render stato corrente |
| Distanza 3D | Quota intatta | Chiudi popover/unregister tool | Register tool |
| Enciclopedia DM | Nessun dato di gioco coinvolto | Chiudi popover/unregister tool | Register tool |
| Combat Log event sink | History e stato combattimento intatti; sessioni locali conservate | Nessuna cancellazione automatica | Riprendi o crea sessione con scelta esplicita |

“Disattivabile” non significa che l'attuale codice disponga già in ogni caso di un `unmount()` completo. Map HP bars, active label ed elevation label richiedono un controller lifecycle esplicito prima di esporre il toggle.

## 8. Configurazioni OBJECT-LEVEL da non spostare nel pannello globale

- iniziativa, appartenenza e fazione del token;
- HP/HP massimi e profilo della card;
- build, sottoclassi, capacità abilitate, pool e istanze di capacità;
- modalità boss e risorse Legendary/Paragon/Epic;
- condizioni, durata, fonte, dettaglio e visibilità mappa della singola istanza;
- caster, slot, durata, variante, target, prepared state e automazioni del singolo cast;
- concentrazione e azioni attive della singola istanza;
- azioni rapide della singola card;
- quota del token;
- aura personalizzata: raggio, stile, target, pill e warning;
- geometria/stile/posizione della singola area;
- clock: nome, segmenti, valore, colore, ordine e visibilità pubblica.

Un default di authoring può vivere localmente (per esempio stile delle nuove AoE), ma il risultato creato resta sull'oggetto.

## 9. DO-NOT-EXPOSE

| Comportamento/costante | Motivazione |
| --- | --- |
| Metadata key, ownership e tombstone | Contratto dati, non preferenza. |
| Debounce, settle, retry, watchdog, cache e timeout bounds | Tuning tecnico accoppiato a race/recovery; nessun valore per il GM. |
| Priorità scheduler e dirty set | Garanzia di rendering/editor. |
| Numero massimo History (30) | Aumentarlo cambia payload scena e performance; ridurlo cambia affidabilità. Valutare separatamente un'archiviazione, non uno slider. |
| Maximum diagnostics events (500) | Dev-only. |
| Soglie colore HP 66%/33% | Microconfig estetica che complica la lettura condivisa; mantenere standard. |
| Font, z-index, offset, opacity, max view scale di label/pill/bar | Microconfig fragile e potenziale overlap. |
| Iniziativa Lair/Epic 20 e algoritmo di iniezione virtuale | Regola strutturale del tracker/boss. |
| Default resistenze leggendarie 3 come preferenza globale | Il valore corretto appartiene al boss specifico. |
| Limiti 3 condizioni custom, 12 quick action, 4 classi | Vincoli di schema/UI; cambiarli richiede progetto e test, non una checkbox. |
| Rounding movimento, ordine resolver e moltiplicatori automatici | Regole D&D e compatibilità; l'adjudication manuale resta possibile senza opzione globale. |
| Enable/disable di singoli cataloghi spell/capacità | Renderebbe orfani ID persistiti, quick action e istanze. |
| Spegnimento coordinator, History, effects reconciler o scene lifecycle | Causa race, drift, perdita di Undo o output stantii. |
| “Cancella tutti gli overlay/dati” generico | Rischio di eliminare attachment non posseduti o stato canonico. Servono cleanup owner-scoped. |
| Diagnostica e probe nel pannello normale | Rumore e rischio di performance; eventuale pagina Supporto separata. |

## 10. Information Architecture del pannello Opzioni

Massimo **5 sezioni**, con ricerca esclusa e niente tab per ogni modulo:

1. **Player e schermo condiviso**
   - preset disclosure;
   - HP per fazione/superficie;
   - condizioni/spell/concentrazione;
   - reminder (dettaglio, DC/caster);
   - dettagli boss;
   - anteprima “Cosa vedranno i Player”.

2. **Tracker e turni**
   - layout locale;
   - Follow locale;
   - sincronizzazione apertura Player;
   - popup cambio turno;
   - controllo incontro “Tana” rimandato al tracker, non duplicato.

3. **Mappa e overlay**
   - HP bar;
   - pill effetti;
   - label turno;
   - label quota;
   - ogni riga indica se è room o override della scena.

4. **Assistenza al GM**
   - reminder assistiti/informativi;
   - autoassegnazione fazioni note;
   - Combat Log locale;
   - tool Clock, Distanza 3D, Enciclopedia.

5. **Layout locale e manutenzione**
   - Clock compatti;
   - stile nuove AoE;
   - reset posizioni pannelli;
   - esportazione/reset mirato registry solo con conferma. Diagnostica non presente salvo modalità supporto esplicita.

La UI deve mostrare chiaramente il badge di scope: `Questo browser`, `Room`, `Questa scena`, `Sul singolo oggetto`. Per gli override scena usare un controllo a tre stati: **Eredita / On / Off**; non duplicare l'intera configurazione room.

## 11. Schema versionato proposto

### 11.1 Preferenze locali

Chiave proposta: `com.thebigpicture.initiative/options-local` in `localStorage`.

```json
{
  "version": 1,
  "updatedAt": 0,
  "tracker": {
    "layout": "classic",
    "followActiveTurn": true,
    "toolbarPreset": "full"
  },
  "windows": {
    "clocksCompact": false
  },
  "tools": {
    "distance3d": true,
    "reference": true
  },
  "runtime": {
    "combatLog": true
  }
}
```

Le coordinate restano in una sotto-struttura separata o nelle chiavi legacy finché non esiste un migratore robusto. Non inserire diagnostica nello schema utente.

### 11.2 Impostazioni room

Chiave proposta: `com.thebigpicture.initiative/options-room`, writer key-scoped dedicato.

```json
{
  "version": 1,
  "updatedAt": 0,
  "playerView": {
    "hp": {
      "trackerClassic": { "pc": "exact", "ally": "exact", "neutral": "hidden", "enemy": "hidden" },
      "trackerCompact": { "pc": "exact", "ally": "hidden", "neutral": "hidden", "enemy": "hidden" },
      "map": { "pc": "exact", "ally": "exact", "neutral": "hidden", "enemy": "hidden" }
    },
    "effects": {
      "conditions": "all",
      "spells": "all",
      "concentration": "all"
    },
    "reminders": {
      "visibility": "full",
      "showDc": true,
      "showCaster": true
    },
    "bossDetails": "full"
  },
  "turn": {
    "popup": true,
    "directReminderResolution": "assisted"
  },
  "map": {
    "hpBars": true,
    "effectLabels": true,
    "activeTurnLabel": true,
    "elevationLabels": true
  },
  "tools": {
    "clocks": true
  },
  "automation": {
    "knownFactionAssignment": true
  },
  "uiSync": {
    "trackerOpen": true
  }
}
```

`effects` dovrà evolvere a una matrice per fazione solo se l'anteprima e i test dimostrano che i preset non bastano. Conservare unknown keys durante normalize/merge per forward compatibility.

### 11.3 Override scena

Chiave proposta: `com.thebigpicture.initiative/options-scene`, writer key-scoped dedicato.

```json
{
  "version": 1,
  "updatedAt": 0,
  "overrides": {
    "playerView.hp": "inherit",
    "playerView.effects": "inherit",
    "playerView.reminders": "inherit",
    "playerView.bossDetails": "inherit",
    "turn.popup": "inherit",
    "turn.directReminderResolution": "inherit",
    "map.hpBars": "inherit",
    "map.effectLabels": "inherit",
    "map.activeTurnLabel": "inherit",
    "map.elevationLabels": "inherit"
  }
}
```

Per valori strutturati, `inherit` può essere sostituito da `{ "mode": "inherit" }` oppure `{ "mode": "override", "value": ... }`. Evitare merge “magici” parziali tra matrici: l'override deve dichiarare chiaramente quale blocco sostituisce.

### 11.4 Risoluzione dello scope

```text
default compatibile
  → room normalizzata
    → override scena esplicito
      → proiezione per ruolo/fazione/superficie
        → preferenza locale solo per presentazione del browser
```

Una preferenza locale non può ampliare ciò che la policy room consente al Player. Può soltanto nascondere ulteriormente una rappresentazione locale.

## 12. Dipendenze e combinazioni invalide

| Combinazione | Esito richiesto |
| --- | --- |
| HP tracker `hidden`, ma map HP `exact` | Invalida come preset privacy. La policy effettiva usa l'intersezione più restrittiva o segnala il conflitto. |
| Effects Player nascosti nel tracker ma local map labels attivi | Invalida se l'obiettivo è riservatezza; applicare la stessa projection al reconciler locale. |
| Popup turno off + reminder on | Valida: il host resta montato e mostra solo reminder. |
| Reminder Player hidden + risoluzione GM assisted | Valida: payload Player redatto, GM completo. |
| Reminder completamente off + direct resolution assisted | Invalida: degradare a informational/off per la UI, senza spegnere i controller di lifecycle. |
| UI spell nascosta + istanze spell attive | Valida solo HIDE-ONLY: ticking, concentrazione, zone, aura e reminder restano attivi. |
| AoE tool smontato + spell area/Quick HP area disponibili | Invalida. È consentito nascondere il comando generico, non rimuovere il servizio di placement. |
| Custom aura UI nascosta + aure esistenti | Valida solo se controller e reconciliation restano attivi. |
| Class features UI nascosta + passive/istanze attive | Valida solo HIDE-ONLY; runtime resta attivo. |
| History off + coordinator/HP/Undo presenti | Invalida. History è una garanzia. |
| Combat Log off + History on | Valida. Stop soltanto al sink IndexedDB. |
| HP bars off + elevation labels on | Valida solo se il layout quota ha fallback senza assumere la barra presente. Cleanup HP deve invalidare elevation layout. |
| Clock tool off + clock esistenti | Valida: dati preservati e invisibili finché il tool non viene riattivato. |
| Derived output off + cancellazione stato canonico | Sempre invalida. Il toggle agisce solo sull'owner renderer. |
| Due sessioni GM writer contemporanee | Non risolta da opzioni: il coordinator è per-runtime. Documentare il limite, non offrire “multi-GM mode”. |

## 13. Strategia di migrazione compatibile

1. Introdurre normalizzatori puri per i tre schemi e testare unknown keys, valori mancanti e versioni future.
2. In assenza delle nuove chiavi, sintetizzare **esattamente** i default correnti senza scrivere metadata al semplice read.
3. Mantenere le chiavi locali legacy come fonte finché l'utente non salva Opzioni; al primo salvataggio copiare layout/Clock/tool e lasciare intatti i fallback card/faction/HP.
4. Per Follow, usare temporaneamente `state.ui.autoFocus` come fallback. Quando il GM salva la preferenza locale, questa prevale solo sul suo browser; non cancellare subito il campo legacy dalla scena.
5. Materializzare la policy Player legacy: HP per layout/superficie come oggi, effetti/reminder/boss `full`. Nessun cambiamento silenzioso su cosa vedono i Player.
6. Tutti i toggle di output derivato partono `true`; quindi la migrazione non elimina alcun attachment o local item.
7. `directReminderResolution` parte `assisted`; scadenze, reminder e History restano invariati.
8. Combat Log parte `true`; sessioni IndexedDB e pointer scena non vengono migrati o cancellati.
9. Aggiungere un owner metadata contract per options room/scena; scrivere una sola chiave top-level e preservare campi sconosciuti interni tramite normalizzazione/merge del dominio.
10. Applicare scene override solo quando esplicito; `inherit` non deve essere serializzato come `false`.
11. Per ogni optional runtime implementare `mount`, `unmount`, `cleanupOwnedOutputs`, `reconcileFull` e test off→on con effetti preesistenti.
12. Il rollback a una versione precedente deve ignorare le nuove chiavi e continuare a vedere tutti i dati canonici correnti.

## 14. Ordine di implementazione consigliato

1. **Fondazione senza UI:** schemi, resolver scope, owner metadata, default legacy e test di non regressione.
2. **Projection boundary Player:** due view model separati e redazione dei payload reminder prima del rendering/broadcast; snapshot test per ogni fazione.
3. **Preferenze locali già esistenti:** consolidare layout, Follow e reset posizioni senza toccare runtime.
4. **Behavior sicuri:** popup turno e reminder assisted/informational; host sempre montato.
5. **Disclosure Player:** HP, effects, reminder e boss con anteprima; verificare tracker classico/compatto e output mappa insieme.
6. **Optional runtime locali semplici:** Distanza 3D, Enciclopedia, Clock UI, Combat Log sink.
7. **Optional renderer derivati:** local effects, label turno, quota, infine HP bars; fault injection e recovery off→on.
8. **Preset toolbar e auto-faction:** solo dopo avere stabilizzato gli scope; nessuna proliferazione di micro-toggle.

## 15. Lista ristretta per la prima release

Prima release: **9 gruppi di opzioni**, tutti con default legacy e senza spegnere lifecycle canonici.

| # | Opzione | Scope | Default |
| ---: | --- | --- | --- |
| 1 | Layout tracker | Local | Esteso |
| 2 | Follow del turno attivo | Local | On |
| 3 | Sincronizza apertura tracker Player | Room | On |
| 4 | Policy HP Player per fazione/superficie | Room + Scene override | Matrice corrente |
| 5 | Policy conditions/spells/concentration Player | Room + Scene override | Tutto visibile |
| 6 | Dettaglio reminder Player (DC/caster) | Room + Scene override | Full |
| 7 | Popup cambio turno | Room + Scene override | On |
| 8 | Reminder assistiti o informativi | Room + Scene override | Assisted |
| 9 | Label turno sulla mappa | Room + Scene override | On |

Rimandare HP map bars, local effect labels, elevation labels e tool runtime alla release successiva: sono sensati, ma richiedono cleanup/recovery verificati. Rimandare anche il preset toolbar, che riduce il rumore ma ha meno valore della sicurezza della proiezione Player.

## 16. Riepilogo decisionale

- **Famiglie configurabili esistenti ma sparse:** 36 (13 locali/sessionali, 4 room, 7 scena, 12 object-level).
- **Opzioni globali consigliate complessive:** 16 gruppi: le 9 della prima release più map HP bars, local effects labels, elevation labels, Clock tool, Distanza 3D, Enciclopedia e Combat Log.
- **Moduli realmente disattivabili:** 8, con lifecycle/cleanup indicato nella sezione 7.
- **Moduli soltanto nascondibili:** 13 famiglie UI, sezione 6.
- **Garanzie non esponibili:** 20, sezione 5.
- **Rischi principali:** leak del modello GM nella vista Player; confusione fra hide/unmount/delete; output mappa incoerenti con la policy tracker; cleanup indiscriminato degli attachment; spegnimento di controller con istanze attive; perdita di History/Undo; race al cambio scena; ID virtuali trattati come token; scope locale usato per policy condivise; Combat Log locale scambiato per storage room.
- **Prima milestone consigliata:** schemi/versioning + resolver degli scope + projection boundary GM/Player con test, senza ancora smontare runtime o cancellare output derivati.
