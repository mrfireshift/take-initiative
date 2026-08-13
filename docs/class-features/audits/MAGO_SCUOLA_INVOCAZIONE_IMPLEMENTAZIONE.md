# Audit e piano di implementazione — Mago base e Scuola di Invocazione

## 1. Perimetro e criterio di prodotto

Questo audit copre la classe base **Mago** e la sottoclasse **Scuola di Invocazione** del Manuale del Giocatore 2014. L'estensione alla classe base è necessaria: cinque delle sei capacità di classe non sono esposte e Recupero Arcano è soltanto un placeholder non automatizzato. Il sottosistema Incantesimi resta la baseline funzionale per il lancio generico, ma non sostituisce i reminder specifici del Mago e non va riscritto.

Il criterio operativo è reminder-first:

- il plugin non tira d20, d100, dadi di danno o dadi necrotici;
- il plugin non determina il risultato di un tiro salvezza, di un tiro per colpire o di un tiro di danno;
- il plugin può mostrare quando una capacità si applica, quali requisiti e bersagli ricorda e quando l'effetto termina;
- una scelta manuale del tavolo può essere ricordata, ma non diventa automaticamente un risultato regolamentare;
- un effetto che vale soltanto durante la risoluzione di uno spell non deve diventare una pill persistente sul token;
- non si crea un secondo inventario di spell, un contatore di dadi o un metadata senza consumer runtime;
- `src/class-features-runtime.json` è generato e non deve essere modificato a mano.

Decisione per il primo rilascio: **tutte le undici capacità (sei di classe e cinque della sottoclasse) vengono esposte come reminder descrittivi**. Nessuna è automatica e nessuna richiede un nuovo adapter. Recupero Arcano usa il pool già presente soltanto come contesto/contatore; la scelta degli slot e il recupero effettivo restano manuali. Plasmare Incantesimi e Trucchetto Potente hanno un trigger legato alla risoluzione di uno spell, ma restano carte descrittive: il sistema Incantesimi non possiede ancora un contratto per ricevere una capacità di sottoclasse, applicare una scelta parziale di bersagli e restituire il controllo senza duplicare la risoluzione.

## 2. Snapshot e fonti di verità

Snapshot letto durante l'audit:

- branch `main`;
- HEAD `9e24d5d`;
- worktree condiviso con modifiche non pertinenti in `src/conditions.js`, `src/effectsLayout.js`, `src/effectsLayoutCore.js`, `src/effectsReconciler.js`, relativi test e un nuovo `src/effectsHoverTool.js`.

Prima di implementare, il secondo agente deve ripetere `git status --short` e preservare quelle modifiche concorrenti.

Ordine delle fonti:

1. `data/class-features/phb2014_classi_database_finale.json`: nomi, livelli, testo regolamentare e pagina;
2. `data/class-features/phb2014_livello_meccanico_v1_1.json`: attivazione, trigger, effetti dichiarati e completezza del record;
3. `data/class-features/runtime-feature-overrides.json`: policy runtime curate;
4. `scripts/generate-class-feature-catalog.mjs`: trasformazione deterministica;
5. `src/class-features-runtime.json`: artefatto derivato;
6. `scripts/audit-class-features.mjs` e `data/class-features/class-feature-automation-audit.json`: audit globale derivato.

Fonti già esistenti da riusare:

- `classFeatureIsReferenceOnly()` per la carta “Promemoria descrittivo”;
- `getAvailableClassFeatures()` e `getEnabledClassFeatures()` per filtro per classe, livello e sottoclasse;
- catalogo Incantesimi e relative definizioni di scuola per consultazione, senza duplicare la lista degli spell di Invocazione;
- UI della scheda Capacità di classe, che esclude le reference-only da quick action e menu contestuale.

## 3. Inventario e stato reale

La fonte canonica contiene queste sei capacità della classe base:

1. `mago-incantesimi`, livello 1;
2. `mago-recupero-arcano`, livello 1;
3. `mago-tradizione-arcana`, livello 2;
4. `mago-aumento-dei-punteggi-di-caratteristica`, livelli 4, 8, 12, 16 e 19;
5. `mago-maestria-negli-incantesimi`, livello 18;
6. `mago-incantesimi-personali`, livello 20.

La stessa fonte contiene queste cinque capacità della sottoclasse:

1. `mago-scuola-di-invocazione-invocatore-sapiente`, livello 2;
2. `mago-scuola-di-invocazione-plasmare-incantesimi`, livello 2;
3. `mago-scuola-di-invocazione-trucchetto-potente`, livello 6;
4. `mago-scuola-di-invocazione-invocazione-potente`, livello 10;
5. `mago-scuola-di-invocazione-saturazione-magica`, livello 14.

Stato osservato nel runtime:

- `mago-recupero-arcano` e `mago-scuola-di-invocazione-trucchetto-potente` compaiono nel runtime, ma entrambi hanno `runtimeSupport.status: not-automated`; Recupero Arcano è `defaultEnabled: false`, mentre Trucchetto Potente è `defaultEnabled: false`, senza adapter ed effetto;
- `mago-incantesimi`, `mago-tradizione-arcana`, `mago-aumento-dei-punteggi-di-caratteristica`, `mago-maestria-negli-incantesimi`, `mago-incantesimi-personali` e gli altri quattro record di Invocazione sono filtrati dal generatore perché hanno attivazione passiva e/o livello di automazione `riferimento`;
- non esiste alcun override per Mago base o Scuola di Invocazione in `runtime-feature-overrides.json`;
- non esiste un adapter per modificare la risoluzione di uno spell in base alla scuola e alla sottoclasse del caster.

I due record esposti sono quindi **placeholder**, non capacità implementate: non sono abilitati per impostazione predefinita, non producono un reminder operativo dedicato e il pulsante runtime resta non disponibile. Il lancio generico del Mago è parzialmente coperto dal sottosistema Incantesimi, ma la carta della capacità `mago-incantesimi` è assente.

## 4. Matrice delle capacità

| Livello | Capacità | Meccanica essenziale | Stato attuale | Classificazione richiesta | Logica da riusare |
|---:|---|---|---|---|---|
| 1 | Incantesimi | Libro degli incantesimi, aggiunte/copie, preparazione, rituali e focus arcano | Parzialmente coperta dal sistema Incantesimi, carta assente | Descrittiva | Stesso override `reference-only` delle altre capacità `*-incantesimi`; non duplicare il catalogo spell |
| 1 | Recupero Arcano | Una volta tra i riposi lunghi, dopo un riposo breve, recupero di slot fino a `ceil(livello da mago / 2)`, nessuno slot ≥ 6° | Placeholder `not-automated`, default disabilitato | Descrittiva | `CLASS.RESOURCE_POOL` + pool `mago-recupero-arcano-usi` già presente; scelta slot e mutazione restano manuali |
| 2 | Tradizione Arcana | Scelta della scuola, con privilegi ai livelli 2, 6, 10 e 14 | Non esposta | Descrittiva | Pattern contenitore `stregone-origine-stregonesca`/`paladino-giuramento-sacro`; nessuna seconda scelta runtime |
| 4, 8, 12, 16, 19 | Aumento dei Punteggi di Caratteristica | Aumento di 2 a un punteggio o di 1 a due, massimo 20 | Non esposta | Descrittiva | Override reference-only già usato da Bardo, Chierico, Ladro, Paladino, Ranger Revised e Stregone |
| 18 | Maestria negli Incantesimi | Un incantesimo da mago di 1° e uno di 2° scelti possono essere lanciati al livello minimo senza slot; cambio dopo 8 ore | Non esposta | Descrittiva | Carta reference-only; scelta e libro restano fuori dal metadata runtime |
| 20 | Incantesimi Personali | Due incantesimi da mago di 3° sempre preparati, uno uso ciascuno per riposo breve/lungo senza slot | Non esposta | Descrittiva | Carta reference-only; niente pool duplicato o tracking di spell selezionati |
| 2 | Invocatore Sapiente | Tempo e costo per copiare nel libro un incantesimo di Invocazione dimezzati | Non esposta | Descrittiva | Carta `reference-only`; nessun bersaglio, durata o azione |
| 2 | Plasmare Incantesimi | Dopo il lancio di uno spell di Invocazione che coinvolge altre creature visibili, scegliere fino a `1 + livello dello spell`: TS superato automaticamente e niente metà danno su un TS normalmente riuscito | Non esposta | Descrittiva contestuale | Carta descrittiva; il tiro, lo spell e la scelta dei bersagli restano nel flusso Incantesimi/tavolo |
| 6 | Trucchetto Potente | Un trucchetto dannoso infligge metà danno a una creatura che supera il TS, senza gli altri effetti | Placeholder `not-automated`, default disabilitato | Descrittiva contestuale | Promemoria reference-only; non modificare HP né esiti dei TS |
| 10 | Invocazione Potente | Aggiungere il modificatore di Intelligenza a un singolo tiro di danno di uno spell di Invocazione da mago | Non esposta | Descrittiva contestuale | Carta reference-only; il valore di Intelligenza e il dado restano manuali |
| 14 | Saturazione Magica | Spell da mago di livello 1–5 che infligge danni: danno massimizzato; dal secondo uso prima del riposo lungo, danni necrotici crescenti per livello dello spell | Non esposta | Descrittiva contestuale | Carta reference-only; conteggio, dadi e danni al tavolo; reset ricordato al riposo lungo |

Non ci sono capacità automatiche o non supportate. “Descrittiva contestuale” significa che la carta espone il trigger e l'effetto da ricordare, non che il plugin risolva la meccanica. Nello stato attuale **nessuna delle undici capacità ha una carta runtime realmente implementata**: Recupero Arcano e Trucchetto Potente sono soltanto record non automatizzati; il lancio generico è una baseline separata.

## 5. Analisi regolistica e logica d'implementazione

### 5.1 Incantesimi (classe base)

#### Meccanica

Il Mago usa Intelligenza come caratteristica da incantatore, possiede un libro con sei incantesimi iniziali, aggiunge due incantesimi da mago quando sale di livello, può copiare altri incantesimi, prepara dopo un riposo lungo un numero pari a livello da mago + modificatore di Intelligenza (minimo uno), recupera gli slot con il riposo lungo, può lanciare come rituale uno spell presente nel libro anche se non preparato e può usare un focus arcano.

#### Stato e implementazione

Il sottosistema Incantesimi gestisce il catalogo, gli slot e il flusso di lancio generico, ma non espone la capacità `mago-incantesimi` nella scheda del Mago. Va aggiunta una carta descrittiva con il pattern già usato da `bardo-incantesimi`, `chierico-incantesimi`, `paladino-incantesimi` e `stregone-incantesimi`:

```json
{
  "include": true,
  "status": "not-automated",
  "automationLevel": "riferimento",
  "defaultEnabled": true,
  "quickActionEligible": false
}
```

La carta deve ricordare libro, preparazione, rituali e focus. Non deve creare un secondo inventario, copiare spell, calcolare il modificatore di Intelligenza o alterare gli slot: il consumer rimane il sistema Incantesimi esistente.

### 5.2 Recupero Arcano (classe base)

#### Meccanica

Una volta tra i riposi lunghi, al termine di un riposo breve, il Mago può scegliere slot spesi con livello combinato massimo pari a `ceil(livello da mago / 2)`; nessuno slot scelto può essere di 6° livello o superiore.

#### Stato e implementazione

Il record meccanico è curato e dispone già del pool `mago-recupero-arcano-usi`, con capacità fissa 1 e refresh al riposo lungo. Nel runtime è però un placeholder `not-automated`, `defaultEnabled: false`, senza adapter o effect plan.

Esporlo come reminder descrittivo con `include: true`, `status: not-automated`, `automationLevel: riferimento`, `defaultEnabled: true` e `quickActionEligible: false`. Il pattern di riferimento è `CLASS.RESOURCE_POOL` indicato in `docs/class-features/catalog/feature-matrix.sample.json`: il pool e il contatore generico sono riutilizzabili, ma non si introduce una nuova risorsa.

La carta deve riportare riposo breve, una volta per riposo lungo, formula `ceil(livello da mago / 2)`, limite individuale di 5° livello e scelta manuale degli slot. Non creare una seconda lista di slot e non mutare il sottosistema Incantesimi: non esiste un consumer runtime che riceva la scelta degli slot da recuperare. Il riposo lungo può riconciliare il pool già esistente; non deve simulare il recupero degli slot.

### 5.3 Tradizione Arcana (classe base)

È un contenitore della scelta di sottoclasse, non un effetto di combattimento. Va esposto come carta descrittiva, seguendo il pattern `stregone-origine-stregonesca`, `paladino-giuramento-sacro` e `bardo-collegio-bardico`, con override reference-only e `defaultEnabled: true`. Deve ricordare che la scelta della scuola avviene al 2° livello e conferisce privilegi ai livelli 2, 6, 10 e 14; non deve aprire una seconda configurazione né duplicare `subclassId`.

### 5.4 Aumento dei Punteggi di Caratteristica (classe base)

Il privilegio è già esposto per le altre classi come carta `not-automated` descrittiva. Aggiungere lo stesso override per `mago-aumento-dei-punteggi-di-caratteristica`, con livelli 4, 8, 12, 16 e 19, `defaultEnabled: true` e `quickActionEligible: false`. Il testo ricorda le due opzioni (+2 a un punteggio oppure +1 a due) e il limite 20. Non modificare automaticamente le statistiche del token e non introdurre un consumer di caratteristiche.

### 5.5 Maestria negli Incantesimi (classe base)

La capacità consente di scegliere un incantesimo da mago di 1° livello e uno di 2° dal libro, lanciarli al livello minimo senza slot quando preparati e sostituirli dopo 8 ore di studio. È descrittiva: la carta reference-only deve ricordare selezione, requisito “nel libro/preparato”, lancio senza slot e cambio dopo 8 ore. Non creare slot virtuali, non alterare il libro e non aggiungere metadata per le due scelte finché non esiste un consumer spell dedicato.

### 5.6 Incantesimi Personali (classe base)

La capacità consente di scegliere due incantesimi da mago di 3° livello dal libro; sono sempre preparati, ciascuno può essere lanciato una volta al 3° livello senza slot e il beneficio si recupera con un riposo breve o lungo. Va esposta come carta reference-only, senza pool duplicato, tracking delle due spell o modifica automatica degli slot. Il lancio a livello superiore resta il comportamento normale del sistema Incantesimi.

### 5.7 Invocatore Sapiente

#### Meccanica

Dal 2° livello il tempo e il denaro necessari per copiare nel libro degli incantesimi un incantesimo della scuola di Invocazione sono dimezzati. È una regola di downtime: non ha azione di combattimento, bersaglio, concentrazione, durata a round, pill o terminazione anticipata.

#### Stato e implementazione

Il record è `riferimento`, attivo `passiva`, senza effetti strutturati. Deve essere esposto come carta descrittiva con testo integrale e livello 2.

Override previsto:

```json
{
  "include": true,
  "status": "not-automated",
  "automationLevel": "riferimento",
  "defaultEnabled": true,
  "quickActionEligible": false
}
```

Non aggiungere adapter, `effectPlan`, targeting, durata o risorsa. Non calcolare il costo di copia e non modificare il libro degli incantesimi.

#### Nota sulla fonte

Il testo sorgente di Invocatore Sapiente usa “incantesimo di evocazione”, mentre il nome della sottoclasse e Plasmare/Invocazione Potente usano “Invocazione”. È un'incoerenza terminologica del dato da verificare sulla fonte editoriale 2014; non va corretta soltanto nell'artefatto runtime e non deve generare una lista parallela di scuole.

### 5.8 Plasmare Incantesimi

#### Meccanica

Quando il Mago lancia un incantesimo di Invocazione che agisce su altre creature che può vedere, può scegliere un numero di creature pari a `1 + il livello dell'incantesimo`. Le creature scelte superano automaticamente i loro tiri salvezza contro quello spell e non subiscono danni se normalmente subirebbero metà danni da un tiro salvezza superato. La capacità non consente di ignorare danni pieni su un tiro fallito e non protegge creature non scelte.

Per un trucchetto il livello è 0, quindi il promemoria deve ricordare un massimo di una creatura; il plugin non deve calcolare il limite se non dispone del contesto dello spell.

#### Stato e causa

Il record meccanico è `riferimento`, con `effects: []`, bersaglio `non_specificato` e trigger inferiti. Non esiste un consumer che colleghi una capacità di sottoclasse al cast corrente, alla scuola dello spell e alla scelta di una frazione dei bersagli.

#### Implementazione richiesta

Esporre una carta descrittiva contestuale tramite lo stesso override reference-only sopra. Il testo operativo della carta deve evidenziare:

- trigger: lancio di uno spell di Invocazione da parte del Mago;
- requisito: lo spell deve agire su altre creature che il Mago può vedere;
- scelta manuale: fino a `1 + livello dello spell` creature;
- conseguenza: TS superato automaticamente e nessun danno dimezzato su un TS che normalmente avrebbe inflitto metà danni;
- durata: soltanto la risoluzione dello spell corrente, senza effetto persistente;
- risoluzione manuale: il tavolo decide quali creature sono valide e non si registrano esiti nei token.

Non introdurre in questo batch:

- un adapter spell dedicato;
- una seconda finestra di lancio o una seconda selezione dei bersagli;
- una nuova chiave metadata per memorizzare le creature “plasmate”;
- modifiche automatiche a TS, HP o danni;
- un controllo geometrico indipendente dalla geometria dello spell;
- una pill sul Mago o sulle creature.

Se in futuro il resolver Incantesimi espone un hook stabile per “modificatore manuale prima della risoluzione”, questa capacità sarà il candidato per un adapter assistito. Quel lavoro è fuori dal primo batch e non va simulato con una pill istantanea.

### 5.9 Trucchetto Potente

#### Meccanica

Dal 6° livello i trucchetti dannosi del Mago agiscono anche sulle creature che evitano l'effetto: quando una creatura supera il tiro salvezza contro il trucchetto, subisce metà dei danni del trucchetto, se il trucchetto ne provoca, ma non subisce ulteriori effetti.

La capacità non si applica a spell di livello superiore, non trasforma un TS fallito e non consente di applicare automaticamente danni senza un tiro già risolto.

#### Stato e causa

È l'unico record della sottoclasse presente nel runtime, ma con:

- `status: not-automated`;
- `adapter: null`;
- `effectPlan: null`;
- `defaultEnabled: false`;
- nessun runtime requirement strutturato.

Non è quindi implementato come reminder utilizzabile.

#### Implementazione richiesta

Aggiungere un override reference-only con `defaultEnabled: true` e `quickActionEligible: false`. Il testo della carta deve ricordare:

- che il trigger è un trucchetto dannoso lanciato dal Mago;
- che si attiva soltanto quando il bersaglio supera il TS;
- che il risultato è metà danno, se previsto dal trucchetto;
- che gli effetti aggiuntivi del trucchetto non si applicano;
- che tiro, danno e risultato del TS restano manuali.

Non usare `condition`, `instant` con `effectPlan.kind: none` o `resource-only`: produrrebbero un pulsante senza un effetto persistente e suggerirebbero una risoluzione che il plugin non può verificare.

### 5.10 Invocazione Potente

#### Meccanica

Dal 10° livello il Mago può sommare il proprio modificatore di Intelligenza a un singolo tiro di danno di qualsiasi incantesimo di Invocazione da mago che lancia. “Un singolo tiro” non significa aggiungerlo a ogni bersaglio o a ogni dado della stessa area.

#### Stato e implementazione

Il record è `riferimento`, passivo e privo di effetti strutturati. Deve essere esposto come carta reference-only, con un dettaglio che specifichi:

- spell di Invocazione da mago;
- un solo tiro di danno;
- modificatore di Intelligenza aggiunto manualmente;
- nessun calcolo del modificatore o del tiro.

Non creare una condizione “+Int ai danni”, non leggere il punteggio di Intelligenza dal token e non modificare HP o risultati nel resolver spell. Il beneficio termina con la risoluzione del tiro scelto; non ha `expiry`, `sourceId` o pill separata.

### 5.11 Saturazione Magica

#### Meccanica

Dal 14° livello, quando il Mago lancia uno spell da mago di livello da 1° a 5° che infligge danni, può infliggere il massimo dei danni invece di tirarli. Il primo uso prima di un riposo lungo non produce conseguenze. Ogni uso successivo infligge subito al Mago danni necrotici pari a `2d12 per livello dello spell`; ogni uso ulteriore aumenta di `1d12 per livello dello spell`. Questi danni ignorano resistenze e immunità.

Il numero di usi e il livello dello spell sono informazioni contestuali. La capacità non ha un massimo di usi canonico, ma una conseguenza crescente che si resetta al riposo lungo.

#### Stato e implementazione

Il record è `riferimento`, con trigger spell/danno e recovery `riposo_lungo`, ma senza pool o effetti strutturati. Esporlo come carta descrittiva contestuale con un testo che separi chiaramente:

- requisiti dello spell: da mago, livello 1–5, dannoso;
- scelta: massimizzare i danni invece di tirarli;
- primo uso: nessuna conseguenza;
- usi successivi: dadi necrotici crescenti per livello dello spell, ignorano resistenze e immunità;
- reset: dopo un riposo lungo;
- tutti i tiri, il conteggio e l'applicazione dei danni restano al tavolo.

Non creare un pool “Saturazione Magica”: non esiste nella fonte e il sistema resource-only richiede un costo/massimo canonico. Non introdurre un contatore in metadata, non applicare danni a `meta.hp`, non massimizzare automaticamente gli spell e non intercettare il riposo lungo.

Se in futuro si vorrà un conteggio assistito, dovrà essere progettato come risorsa condivisa con history/Undo e reset esplicito; non è necessario per il reminder-first batch.

## 6. Mappa delle integrazioni

| Area | Riutilizzo | Cosa non fare |
|---|---|---|
| Fonte dati | Record PHB e overlay meccanico esistenti | Non copiare descrizioni nel runtime o in un nuovo JSON |
| Generatore | `scripts/generate-class-feature-catalog.mjs` | Non modificare `src/class-features-runtime.json` a mano |
| Override | `runtime-feature-overrides.json`, chiavi già esistenti `include`, `status`, `automationLevel`, `defaultEnabled`, `quickActionEligible` | Non aggiungere metadata custom o adapter fittizi |
| UI | `classFeatureIsReferenceOnly()` e carta “Promemoria descrittivo” | Non creare quick action o voci context per capacità senza effetto runtime |
| Incantesimi | Catalogo spell esistente per testo/scuola e normale cast/resolution | Non duplicare casting, bersagli, TS, danni, slot o concentrazione |
| Pill/condizioni | Nessuna per queste undici capacità | Non creare pill istantanee o condizioni neutre |
| HP | Nessun uso | Non alterare `meta.hp` o `meta.hpMax` |
| Lifecycle | Nessuna istanza persistente; Saturazione ricorda il reset manuale al riposo lungo | Non creare expiry, parent effect, aura o watcher di riposo |
| History/Undo | Nessuna mutazione nel primo batch | Non scrivere history per un semplice reminder descrittivo |

Il fatto che il sistema Incantesimi conosca la scuola `evocation` non autorizza a dedurre automaticamente che una spell sia lanciata dal Mago o che Plasmare/Trucchetto/Invocazione Potente debbano applicarsi. Caster, scuola, risultato del TS e tiro di danno devono restare nel flusso spell già esistente o al tavolo.

## 7. Duplicazioni e dati da non introdurre

1. Non duplicare una lista di incantesimi di Invocazione: usare l'ID e la definizione del catalogo spell quando serve solo consultazione.
2. Non creare un secondo inventario di slot, una risorsa per Saturazione Magica o una lista parallela per Maestria/Incantesimi Personali.
3. Non copiare il modificatore di Intelligenza nei metadata del token.
4. Non copiare il livello dello spell, il numero di bersagli plasmati o le due spell scelte nello stato della carta.
5. Non aggiungere `sourceId`, `appliedAt` o `expiry` a un effetto che esiste soltanto durante la risoluzione dello spell.
6. Non aggiungere trigger automatici alle modifiche HP, agli eventi di tiro salvezza o ai riposi: gli stessi eventi non identificano in modo sufficiente il tipo di spell, la sottoclasse attiva o la scelta degli slot.
7. Non modificare soltanto l'artefatto runtime per correggere l'incoerenza “evocazione/Invocazione”; la fonte canonica e il suo owner devono restare la verità.

## 8. Ordine di implementazione per il secondo agente

1. Ripetere `git status --short` e verificare gli undici ID nei due JSON sorgente.
2. Aggiungere in `data/class-features/runtime-feature-overrides.json` un override reference-only per ciascuno degli undici ID:

   ```json
   {
     "include": true,
     "status": "not-automated",
     "automationLevel": "riferimento",
     "defaultEnabled": true,
     "quickActionEligible": false
   }
   ```

3. Non aggiungere `adapter`, `effectPlan`, `targeting`, `duration` o `trackingMode` alle carte descrittive. Per Recupero Arcano conservare il `resourceCosts` e il `trackedResourcePoolIds` già derivati dal record meccanico: servono al contatore generico, non a un pulsante di recupero slot.
4. Per Trucchetto Potente, l'override `automationLevel: riferimento` è intenzionale: il dato meccanico può restare `assistita` come descrizione del trigger manuale, mentre la policy runtime dichiara che il primo rilascio è solo reminder.
5. Se il testo mostrato nella scheda richiede una correzione regolistica, modificare il catalogo sorgente PHB e rigenerare; non correggere `src/class-features-runtime.json` direttamente.
6. Eseguire `npm.cmd run generate:class-features`.
7. Eseguire `npm.cmd run audit:class-features` per aggiornare gli artefatti globali; non editare manualmente `class-feature-automation-audit.json` o `docs/AUDIT_CAPACITA_CLASSE.md`.
8. Aggiungere i test dedicati indicati nella sezione successiva.
9. Eseguire i test mirati, poi la suite e infine `npm.cmd run build`.
10. Ripetere il generatore e l'audit una seconda volta: non devono produrre diff aggiuntivi.

La patch deve limitarsi agli override, agli artefatti generati e ai test del Mago base/Invocazione. Non toccare `initiativeList.js`, spell executor, condizioni, HP bar, iniziativa o aura engine.

## 9. Test automatici richiesti

Creare `test/wizardEvocationFeatureRuntime.test.js` oppure estendere il test di catalogo già esistente con casi equivalenti.

### Catalogo e disponibilità

- per un personaggio `{ classId: "mago", level: 20, subclassId: "mago-scuola-di-invocazione" }` sono disponibili le sei capacità base e tutti e cinque gli ID della sottoclasse;
- per un Mago senza sottoclasse, le sei capacità base diventano disponibili ai livelli corretti e nessuna capacità di Invocazione viene resa disponibile;
- al livello 1 sono presenti Incantesimi e Recupero Arcano;
- al livello 2 sono presenti Tradizione Arcana, Invocatore Sapiente e Plasmare Incantesimi, ma non le capacità dei livelli 6, 10 e 14;
- al livello 6 entra Trucchetto Potente, al 10 Invocazione Potente, al 14 Saturazione Magica;
- tutti gli undici hanno `defaultEnabled: true`, `quickActionEligible: false` e `runtimeSupport.status: not-automated`;
- tutti gli undici hanno `automationLevel: riferimento`, `effectPlan: null` e `classFeatureIsReferenceOnly() === true`;
- Recupero Arcano conserva il pool `mago-recupero-arcano-usi` nel riepilogo risorse, senza diventare un'azione runtime.

### Assenza di automazione indebita

- nessuno degli undici ha adapter, durata round, targeting singolo/aura o tracking active;
- soltanto Recupero Arcano conserva il costo/pool derivato dalla fonte, ma nessun test deve aspettarsi una mutazione degli slot;
- `buildClassFeatureQuickActions()` non restituisce nessuno degli undici;
- `buildClassFeatureContextEntries()` non crea voci attivabili;
- non viene prodotto alcun `classFeatureConditionInstance` per questi record;
- nessun test deve aspettarsi mutazioni di HP, condizioni, spell, concentrazione o metadata.

### Contenuto dei reminder

Verificare almeno con `assert.match()` che le descrizioni generate conservino i requisiti distintivi:

- Incantesimi: libro, preparazione dopo riposo lungo, rituale dal libro e focus arcano;
- Recupero Arcano: riposo breve, una volta per riposo lungo, `ceil(livello / 2)` e massimo slot 5°;
- Tradizione Arcana: scelta della scuola al 2° livello e privilegi ai livelli 2/6/10/14;
- Aumento dei Punteggi: +2 a un punteggio oppure +1 a due, massimo 20;
- Maestria negli Incantesimi: spell scelti di 1°/2°, senza slot al livello minimo e cambio dopo 8 ore;
- Incantesimi Personali: due spell di 3°, sempre preparati, una volta per riposo breve/lungo senza slot;
- Invocatore Sapiente: copia nel libro, tempo e denaro dimezzati;
- Plasmare Incantesimi: spell di Invocazione, creature visibili, `1 + livello`, TS automatico e nessun danno dimezzato;
- Trucchetto Potente: trucchetto dannoso, TS superato, metà danno e nessun ulteriore effetto;
- Invocazione Potente: modificatore di Intelligenza e un singolo tiro di danno;
- Saturazione Magica: livello 1–5, danno massimo, primo uso, dadi necrotici crescenti e riposo lungo.

### Determinismo e regressione

- eseguire due volte `npm.cmd run generate:class-features` e verificare che il secondo passaggio non cambi il file generato;
- eseguire due volte `npm.cmd run audit:class-features` e verificare lo stesso per gli artefatti di audit;
- eseguire i test esistenti del catalogo e delle spell senza cambiare le aspettative di Ira, del sottosistema Incantesimi o delle altre sottoclassi;
- se cambiano conteggi globali, aggiornare soltanto le aspettative derivate dalla rigenerazione, mai mascherare il diff con un edit isolato al test.

Comandi minimi:

```text
node --test test/wizardEvocationFeatureRuntime.test.js test/classFeatureCatalog.test.js test/classFeatureAudit.test.js
npm.cmd test
npm.cmd run build
```

## 10. Checklist manuale GM/Player in Owlbear Rodeo

Configurazione di prova: token `CHARACTER`, classe Mago, Scuola di Invocazione, livello 20.

### Scheda capacità

- [ ] Le sei capacità base e le cinque della sottoclasse sono visibili nella scheda al livello appropriato.
- [ ] Ogni carta mostra “Promemoria descrittivo”.
- [ ] Nessuna carta propone “Attiva”, “Usa”, quick action o voce del menu contestuale.
- [ ] Recupero Arcano e Trucchetto Potente non appaiono più come placeholder disabilitati per default.

### Capacità base del Mago

- [ ] Incantesimi ricorda libro, preparazione, rituali e focus senza duplicare la lista spell.
- [ ] Recupero Arcano mostra il contesto di una volta per riposo lungo e il limite `ceil(livello / 2)`, mentre la scelta degli slot resta manuale.
- [ ] Il pool `mago-recupero-arcano-usi` si resetta al riposo lungo nel riepilogo risorse; non vengono modificati gli slot spell.
- [ ] Tradizione Arcana mostra la scelta della scuola e non apre una configurazione duplicata.
- [ ] Aumento dei Punteggi, Maestria negli Incantesimi e Incantesimi Personali sono consultabili e non modificano automaticamente caratteristiche, libro o slot.

### Invocatore Sapiente

- [ ] Il GM vede il reminder per la copia degli spell di Invocazione durante il downtime.
- [ ] Il plugin non modifica libro, denaro o tempi.

### Plasmare Incantesimi

- [ ] Prima di risolvere uno spell di Invocazione, il giocatore/GM può leggere il limite `1 + livello dello spell` e i requisiti di visibilità.
- [ ] Il tavolo sceglie manualmente le creature protette.
- [ ] Il plugin non tira TS, non forza successi, non modifica danni e non crea pill sui bersagli.
- [ ] Al termine della risoluzione dello spell non resta una condizione o un timer.

### Trucchetto Potente

- [ ] Il reminder specifica che riguarda solo trucchetti dannosi e TS superati.
- [ ] Il tavolo applica manualmente metà danno e ignora gli altri effetti.
- [ ] Il plugin non aggiorna HP e non interviene sul resolver dello spell.

### Invocazione Potente

- [ ] Il reminder specifica un solo tiro di danno e il modificatore di Intelligenza.
- [ ] Il giocatore sceglie manualmente il tiro e aggiunge il modificatore al tavolo.
- [ ] Nessun bonus viene applicato automaticamente a tutti i bersagli o a tutti i dadi.

### Saturazione Magica

- [ ] Il reminder distingue spell da mago, livelli 1–5 e requisito di danno.
- [ ] Il primo uso e gli usi successivi sono descritti senza un contatore automatico.
- [ ] I dadi necrotici vengono tirati e applicati manualmente, ignorando al tavolo resistenze e immunità.
- [ ] Dopo un riposo lungo il GM sa di dover azzerare il conteggio manuale.
- [ ] Nessuna modifica a HP, spell, concentrazione o resource pool viene prodotta dal plugin.

## 11. Criteri di accettazione

Il lavoro è accettato quando:

1. tutte le sei capacità base e le cinque di Invocazione sono presenti nella carta del Mago al livello corretto;
2. nessuna è classificata come automatica o come non supportata;
3. Recupero Arcano e Trucchetto Potente sono trasformati da placeholder in carte descrittive visibili e abilitate di default;
4. tutte le carte usano il pattern esistente `reference-only`, senza nuovo adapter o metadata;
5. il pool di Recupero Arcano resta quello già presente e viene mostrato come contesto, senza mutare gli slot;
6. i reminder conservano trigger, bersagli, limiti, durata e fine pertinenti secondo il testo PHB;
7. Plasmare Incantesimi non applica automaticamente successi ai TS o riduzioni di danno;
8. Trucchetto Potente, Invocazione Potente e Saturazione Magica non tirano né modificano dadi, HP o risultati degli spell;
9. Incantesimi, Maestria negli Incantesimi e Incantesimi Personali non duplicano il sistema Incantesimi;
10. non vengono create pill, aure, concentrazione, `sourceId`/`appliedAt`/`expiry` o history per effetti che durano soltanto nella risoluzione dello spell;
11. gli artefatti sono generati dai comandi esistenti, la generazione è deterministica, i test passano e la build termina con successo.
