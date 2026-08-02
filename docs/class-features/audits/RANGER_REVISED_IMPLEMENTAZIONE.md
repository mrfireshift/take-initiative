# Audit e piano di implementazione — Ranger (Revised)

## 1. Scopo e decisione

Questo documento copre la classe **Ranger (Revised)** di *Unearthed Arcana: Ranger, Revised* (2016) e tutti i conclavi presenti nel pacchetto fornito:

- Conclave della Bestia;
- Conclave del Cacciatore;
- Conclave del Cacciatore delle Profondità.

Il pacchetto contiene 45 record: 30 privilegi e 15 opzioni. Tutti i record sono stati integrati nel database e nell'audit generale, ma **nessuna delle 45 capacità è attualmente implementata a livello runtime**. Diciotto record sono esposti nell'artefatto generato come `not-automated` e `defaultEnabled: false`; gli altri ventisette sono filtrati dal generatore perché passivi, contenitori o dichiarati di riferimento.

La destinazione richiesta è:

- 43 capacità o opzioni come reminder descrittivi;
- 2 capacità come reminder assistiti tramite primitive Class Feature già esistenti;
- 0 tiri, bonus, danni, tiri salvezza, attacchi o risultati calcolati dal plugin;
- 0 capacità automatiche.

I due flussi assistiti sono `Nascondersi in Piena Vista` e il collegamento di `Compagno Animale`. `Consapevolezza Primordiale` resta descrittiva: il suo minuto di concentrazione e le informazioni restituite dal GM non giustificano un'integrazione incompleta con la concentrazione degli incantesimi.

## 2. Regole vincolanti

- Il plugin non tira dadi e non interpreta il risultato di dadi tirati al tavolo.
- Attacchi, danni, prove, tiri salvezza, vantaggio, svantaggio, CA, competenze, reazioni e limiti “una volta per turno” restano adjudicati manualmente.
- Le capacità descrittive devono essere visibili alla classe e al livello corretti, senza pulsante di attivazione.
- I reminder assistiti possono registrare sorgente, bersaglio, `appliedAt`, durata manuale, terminazione, history e Undo.
- Non creare o ricopiare stat block per il compagno animale. Il GM seleziona un token creatura già disponibile in Owlbear Rodeo o importato dalle proprie fonti.
- Non creare un secondo catalogo incantesimi, un secondo pool di slot o una seconda concentrazione. La lista incantesimi è quella del Ranger esistente e gli slot sono quelli standard.
- Non modificare HP, HP temporanei, iniziativa, movimento, aura engine, spell runtime o `initiativeList.js`.
- `src/class-features-runtime.json` è generato e non va modificato a mano.
- Nessuna capacità Ranger Revised deve diventare quick action in questo batch.

## 3. Fonti di verità e integrazione dati

Ordine delle fonti operative:

1. `data/class-features/ranger_revised_database_finale.json`: classe, sottoclassi, progressione, descrizioni, livelli e relazioni tra privilegi/opzioni;
2. `data/class-features/ranger_revised_livello_meccanico_v1_0.json`: overlay strutturato di attivazioni, effetti, requisiti e durate;
3. `data/class-features/runtime-feature-overrides.json`: decisioni prodotto reminder-first e supporto runtime;
4. `scripts/generate-class-feature-catalog.mjs`: trasformazione deterministica;
5. `src/class-features-runtime.json`: artefatto derivato;
6. `scripts/audit-class-features.mjs` e `data/class-features/class-feature-automation-audit.json`: audit globale derivato.

File di controllo, non fonti runtime:

- `ranger_revised_manifest_integrazione.json` definisce coesistenza con `ranger`, riferimenti agli spell e ordine logico;
- i due report conservano hash e controlli di integrità;
- lo schema meccanico valida la forma dell'overlay.

Decisioni di integrazione già applicate:

- `ranger-revised` è una classe distinta e non sovrascrive `ranger`;
- la classe viene aggregata da tutte le sorgenti, non soltanto dal catalogo PHB;
- i tre conclavi appartengono esclusivamente a `ranger-revised`;
- gli incantesimi aggiuntivi del Cacciatore delle Profondità vengono raccolti dal privilegio e normalizzati nel campo runtime `additionalSpellsByLevel` della sottoclasse;
- i nomi dei cinque incantesimi risolvono nel catalogo spell esistente;
- `slot-incantesimo-standard-aggregati` resta un pool esterno e non viene duplicato tra le Class Feature.

Il record `Magia del Cacciatore delle Profondità` conserva una discordanza della fonte: il paragrafo cita il 15° livello, la tabella assegna *Seeming* al 17°. Il dato strutturato segue la tabella, quindi il reminder deve mostrare **17° livello** e non correggere silenziosamente la fonte in altro modo.

Le etichette `automatica` presenti nell'overlay fornito descrivono una possibilità teorica del dataset, non la policy del plugin. Non modificare i file forniti, così da conservarne hash e provenienza; sovrascrivere la classificazione a `riferimento` negli override runtime.

## 4. Stato corrente

### Già implementato

- Integrazione dei sei JSON nelle fonti canoniche: completata.
- Sorgente `ranger-revised` nei generatori runtime e audit: completata.
- Classe distinta, tre conclavi e incantesimi aggiuntivi del Cacciatore delle Profondità nell'artefatto derivato: completati.
- Test di integrità, coesistenza e copertura catalogo/meccaniche: presenti.

### Da implementare

- L'esposizione runtime di tutti i 45 record.
- La scelta esclusiva delle 4 opzioni di Stile di Combattimento e dei quattro gruppi di opzioni del Cacciatore.
- I 43 reminder descrittivi.
- I 2 reminder assistiti, senza calcolo regolistica.

## 5. Matrice — classe Ranger (Revised)

Nella colonna “corrente”, `assente` significa filtrato dall'artefatto runtime; `non attivo` significa presente ma `not-automated` e disabilitato. Entrambi richiedono override.

| Livello | ID / capacità | Corrente | Destinazione | Logica vincolante |
|---:|---|---|---|---|
| 1 | `ranger-revised-nemico-prescelto` — Nemico Prescelto | Assente | Descrittiva | Mostrare scelta del tipo e del linguaggio, +2 danni e vantaggi contestuali. Non memorizzare il tipo in nuovi metadata, non leggere il tipo del bersaglio, non modificare danni o tiri. |
| 1 | `ranger-revised-esploratore-nato` — Esploratore Nato | Assente | Descrittiva | Reminder di terreno difficile, iniziativa, primo turno e viaggio. Non toccare iniziativa, movimento, stato “ha già agito”, tracking o foraggiamento. |
| 2 | `ranger-revised-stile-di-combattimento` — Stile di Combattimento | Assente | Descrittiva / contenitore | Carta parent sempre visibile; una sola opzione figlia selezionabile. Nessun effetto su attacchi, CA o danni. |
| 2 | `ranger-revised-incantesimi` — Incantesimi | Assente | Descrittiva integrata | Carta di riferimento; riusare lista Ranger, slot standard, pill, concentrazione, scadenze, history e Undo del sistema Incantesimi. Nessun inventario parallelo. |
| 3 | `ranger-revised-consapevolezza-primordiale` — Consapevolezza Primordiale | Non attivo | Descrittiva | Descrivere entrambi gli usi: comunicazione con bestie e 1 minuto ininterrotto di concentrazione per percepire nemici prescelti entro 5 miglia. Nessun bersaglio, query della scena, timer o stato di concentrazione parziale. Il GM comunica presenza, numero, direzione e distanza. |
| 3 | `ranger-revised-conclave-ranger` — Conclave Ranger | Assente | Descrittiva / strutturale | Reminder della scelta di sottoclasse. La scelta effettiva resta in `characterBuild`; non creare una seconda selezione. |
| 4, 8, 12, 16, 19 | `ranger-revised-aumento-dei-punteggi-di-caratteristica` — Aumento dei Punteggi di Caratteristica | Assente | Descrittiva | Nessuna modifica automatica alle caratteristiche. |
| 6 | `ranger-revised-nemico-prescelto-migliorato` — Nemico Prescelto Migliorato | Assente | Descrittiva | Reminder del nuovo tipo/linguaggio, +4 contro tutti i nemici prescelti e vantaggio ai TS contro il tipo migliorato. Nessuna ispezione di tipo, sorgente dell'effetto o TS. |
| 8 | `ranger-revised-passo-veloce` — Passo Veloce | Assente | Descrittiva | Ricordare Scattare come azione bonus. Non modificare velocità, movimento o action economy. |
| 10 | `ranger-revised-nascondersi-in-piena-vista` — Nascondersi in Piena Vista | Non attivo | Assistita | Dopo conferma manuale che il Ranger si nasconde senza muoversi, applicare un reminder sul Ranger. Durata manuale; terminare se si muove, cade prono o non è più nascosto. Non applicare numericamente −10 né rilevare movimento/nascosto/prono. |
| 14 | `ranger-revised-svanire` — Svanire | Assente | Descrittiva | Reminder di Nascondersi come azione bonus e dell'impossibilità di essere seguito con mezzi non magici. Nessuna action economy o tracking automatico. |
| 18 | `ranger-revised-sensi-ferini` — Sensi Ferini | Assente | Descrittiva | Reminder della regola sugli attacchi contro creature non viste e della posizione degli invisibili entro 9 m. Non usare aura/membership, non rilevare invisibilità, nascosto, accecato o assordato. |
| 20 | `ranger-revised-sterminatore-di-nemici` — Sterminatore di Nemici | Non attivo | Descrittiva | Ricordare una volta per turno e la scelta prima/dopo il tiro ma prima degli effetti. Non leggere Saggezza, non modificare attacco/danno, non contare l'uso. |

### Opzioni dello Stile di Combattimento

Tutte e quattro sono attualmente assenti e devono diventare reminder descrittivi con `defaultEnabled: false` e `optionGroup: ranger-revised-stile-di-combattimento`.

| ID / opzione | Reminder; operazioni vietate |
|---|---|
| `ranger-revised-stile-di-combattimento-tiro` — Tiro | Mostrare +2 ai tiri per colpire con armi a distanza; non modificare tiri. |
| `ranger-revised-stile-di-combattimento-difesa` — Difesa | Mostrare +1 CA quando indossa armatura; non leggere equipaggiamento o CA. |
| `ranger-revised-stile-di-combattimento-duellare` — Duellare | Mostrare +2 danni con arma da mischia in una mano e nessun'altra arma; non leggere equipaggiamento o danni. |
| `ranger-revised-stile-di-combattimento-combattere-con-due-armi` — Combattere con Due Armi | Mostrare l'aggiunta del modificatore al secondo attacco; non modificare danni o action economy. |

## 6. Matrice — Conclave della Bestia

| Livello | ID / capacità | Corrente | Destinazione | Logica vincolante |
|---:|---|---|---|---|
| 3 | `ranger-revised-conclave-della-bestia-compagno-animale` — Compagno Animale | Non attivo | Assistita | Dopo che il tavolo ha completato il rituale e dispone già del token, selezionare una sola creatura diversa dal Ranger e applicare `Compagno Animale` con durata manuale. Il reminder indica che può esistere un solo compagno e che il vecchio legame va terminato prima di crearne un altro. Non creare/restaurare token, stat block, HP, CA o statistiche; non sottrarre monete o tempo. |
| 3 | `ranger-revised-conclave-della-bestia-legame-del-compagno` — Legame del Compagno | Assente | Descrittiva | Carta completa con iniziativa autonoma, perdita Multiattacco, PB del Ranger, bonus a CA/danni, abilità, TS, DV/HP, ASI, allineamento e Nemico Prescelto. Nessuna mutazione delle statistiche del token. Il reminder del legame su Compagno Animale rimanda a questa carta. |
| 5 | `ranger-revised-conclave-della-bestia-attacco-coordinato` — Attacco Coordinato | Non attivo | Descrittiva | Trigger, visibilità, reazione e attacco del compagno restano al tavolo; nessun pulsante o effetto persistente. |
| 7 | `ranger-revised-conclave-della-bestia-difesa-della-bestia` — Difesa della Bestia | Assente | Descrittiva | Reminder del vantaggio ai TS finché il compagno vede il Ranger. Non rilevare visibilità e non modificare tiri. |
| 11 | `ranger-revised-conclave-della-bestia-tempesta-di-artigli-e-zanne` — Tempesta di Artigli e Zanne | Non attivo | Descrittiva | Reminder dell'azione e degli attacchi separati contro creature entro 1,5 m. Non usare aura, geometria o selezione bersagli e non tirare attacchi. |
| 15 | `ranger-revised-conclave-della-bestia-difesa-superiore-della-bestia` — Difesa Superiore della Bestia | Non attivo | Descrittiva | Reminder della reazione e del dimezzamento dopo un colpo confermato. Non rilevare visibilità/colpo, non consumare reazioni e non modificare HP. |

Il requisito `creature_stat_block` dell'overlay non autorizza un form di inserimento. È un dato esterno: il token deve già rappresentare la creatura scelta secondo le fonti possedute dal tavolo.

## 7. Matrice — Conclave del Cacciatore

### Contenitori e capacità comuni

| Livello | ID / capacità | Corrente | Destinazione | Logica vincolante |
|---:|---|---|---|---|
| 3 | `ranger-revised-conclave-del-cacciatore-preda-del-cacciatore` — Preda del Cacciatore | Assente | Descrittiva / contenitore | Una sola delle tre opzioni figlie. |
| 5 | `ranger-revised-conclave-del-cacciatore-attacco-extra` — Attacco Extra | Assente | Descrittiva | Reminder di due attacchi con l'azione Attaccare. Non creare un esecutore di attacchi. |
| 7 | `ranger-revised-conclave-del-cacciatore-tattiche-difensive` — Tattiche Difensive | Assente | Descrittiva / contenitore | Una sola delle tre opzioni figlie. |
| 11 | `ranger-revised-conclave-del-cacciatore-multiattacco` — Multiattacco | Assente | Descrittiva / contenitore | Una sola delle due opzioni figlie. |
| 15 | `ranger-revised-conclave-del-cacciatore-difesa-superiore-del-cacciatore` — Difesa Superiore del Cacciatore | Assente | Descrittiva / contenitore | Una sola delle tre opzioni figlie. |

### Preda del Cacciatore — opzioni di 3° livello

Tutte devono avere `defaultEnabled: false` e `optionGroup: ranger-revised-conclave-del-cacciatore-preda-del-cacciatore`.

| ID / opzione | Corrente | Logica descrittiva |
|---|---|---|
| `ranger-revised-conclave-del-cacciatore-preda-del-cacciatore-sterminatore-di-colossi` — Sterminatore di Colossi | Non attivo | Ricordare colpo, bersaglio sotto HP massimi, 1d8 e una volta per turno. Non leggere HP per innescare la capacità e non tirare/applicare danni. |
| `ranger-revised-conclave-del-cacciatore-preda-del-cacciatore-uccisore-di-giganti` — Uccisore di Giganti | Non attivo | Ricordare taglia Grande+, 1,5 m, visibilità e reazione dopo l'attacco. Non rilevare trigger/range e non tirare l'attacco. |
| `ranger-revised-conclave-del-cacciatore-preda-del-cacciatore-devastatore-dell-orda` — Devastatore dell'Orda | Non attivo | Ricordare una volta per turno, bersaglio diverso entro 1,5 m dal primo e gittata dell'arma. Nessuna geometria o attacco automatico. |

### Tattiche Difensive — opzioni di 7° livello

Tutte devono avere `defaultEnabled: false` e `optionGroup: ranger-revised-conclave-del-cacciatore-tattiche-difensive`.

| ID / opzione | Corrente | Logica descrittiva |
|---|---|---|
| `ranger-revised-conclave-del-cacciatore-tattiche-difensive-sfuggire-all-orda` — Sfuggire all'Orda | Assente | Reminder dello svantaggio agli attacchi di opportunità; nessuna modifica ai tiri. |
| `ranger-revised-conclave-del-cacciatore-tattiche-difensive-difesa-dal-multiattacco` — Difesa dal Multiattacco | Non attivo | Reminder del +4 CA contro gli attacchi successivi della stessa creatura per il resto del suo turno. Il colpo e l'identità dell'attaccante sono confermati al tavolo. Non creare pill: l'expiry esistente è ancorata alla sorgente Ranger e non rappresenterebbe correttamente la fine del turno dell'attaccante. |
| `ranger-revised-conclave-del-cacciatore-tattiche-difensive-volonta-di-acciaio` — Volontà di Acciaio | Assente | Reminder del vantaggio ai TS contro spaventato; nessuna modifica al tiro. |

### Multiattacco — opzioni di 11° livello

Entrambe devono avere `defaultEnabled: false` e `optionGroup: ranger-revised-conclave-del-cacciatore-multiattacco`.

| ID / opzione | Corrente | Logica descrittiva |
|---|---|---|
| `ranger-revised-conclave-del-cacciatore-multiattacco-raffica` — Raffica | Non attivo | Reminder del punto visibile, raggio 3 m, gittata e munizioni. Non usare template/aura, non selezionare bersagli e non tirare attacchi. |
| `ranger-revised-conclave-del-cacciatore-multiattacco-attacco-turbinante` — Attacco Turbinante | Non attivo | Reminder degli attacchi separati entro 1,5 m. Non usare aura/geometry e non tirare attacchi. |

### Difesa Superiore — opzioni di 15° livello

Tutte devono avere `defaultEnabled: false` e `optionGroup: ranger-revised-conclave-del-cacciatore-difesa-superiore-del-cacciatore`.

| ID / opzione | Corrente | Logica descrittiva |
|---|---|---|
| `ranger-revised-conclave-del-cacciatore-difesa-superiore-del-cacciatore-elusione` — Elusione | Non attivo | Reminder dell'esito del TS Destrezza. Il tiro e i danni restano manuali; non mutare HP. |
| `ranger-revised-conclave-del-cacciatore-difesa-superiore-del-cacciatore-opporsi-alla-marea` — Opporsi alla Marea | Non attivo | Reminder della reazione dopo un attacco in mischia mancato e del nuovo bersaglio. Non rilevare il mancato e non ripetere l'attacco. |
| `ranger-revised-conclave-del-cacciatore-difesa-superiore-del-cacciatore-schivata-prodigiosa` — Schivata Prodigiosa | Non attivo | Reminder della reazione dopo un colpo visibile. Non rilevare colpo/visibilità, non consumare reazioni e non dimezzare HP. |

## 8. Matrice — Conclave del Cacciatore delle Profondità

| Livello | ID / capacità | Corrente | Destinazione | Logica vincolante |
|---:|---|---|---|---|
| 3 | `ranger-revised-conclave-del-cacciatore-delle-profondita-esploratore-dell-underdark` — Esploratore dell'Underdark | Assente | Descrittiva | Reminder di +3 m e attacco aggiuntivo nel primo turno e delle regole contro la scurovisione. Non toccare movimento, iniziativa, attacchi, luce, vista o nascosto. |
| 3 | `ranger-revised-conclave-del-cacciatore-delle-profondita-magia-del-cacciatore-delle-profondita` — Magia del Cacciatore delle Profondità | Assente | Descrittiva integrata | Mostrare scurovisione 27 m/+9 m e gli incantesimi aggiuntivi ai livelli 3/5/9/13/17. I link devono aprire il normale catalogo spell e usare il lifecycle spell corrente. Non scrivere nuovi campi vista o slot. |
| 5 | `ranger-revised-conclave-del-cacciatore-delle-profondita-attacco-extra` — Attacco Extra | Assente | Descrittiva | Come Attacco Extra del Cacciatore; nessun esecutore di attacchi. |
| 7 | `ranger-revised-conclave-del-cacciatore-delle-profondita-mente-di-ferro` — Mente di Ferro | Assente | Descrittiva | Reminder della competenza nei TS Saggezza; non modificare scheda o tiri. |
| 11 | `ranger-revised-conclave-del-cacciatore-delle-profondita-raffica-del-cacciatore` — Raffica del Cacciatore | Non attivo | Descrittiva | Reminder del trigger “attacco mancato” e una volta per turno. Non rilevare l'esito e non effettuare l'attacco. |
| 15 | `ranger-revised-conclave-del-cacciatore-delle-profondita-schivata-del-cacciatore` — Schivata del Cacciatore | Non attivo | Descrittiva | Reminder della reazione prima dell'esito e solo se l'attaccante non ha vantaggio. Non leggere lo stato del tiro e non imporre svantaggio. |

## 9. Override runtime da applicare

Il secondo agente deve modificare soltanto `data/class-features/runtime-feature-overrides.json` per la logica delle capacità.

### 9.1 Pattern comune dei 43 reminder descrittivi

Per ogni record descrittivo:

```json
{
  "include": true,
  "status": "not-automated",
  "automationLevel": "riferimento",
  "defaultEnabled": true,
  "quickActionEligible": false
}
```

Per le quindici opzioni selezionabili usare invece `defaultEnabled: false` e il relativo `optionGroup`. Non impostare `status: implemented` e non aggiungere `effectPlan` a una carta puramente descrittiva.

I cinque contenitori (`Stile di Combattimento` e i quattro parent del Cacciatore) restano `defaultEnabled: true`, descrittivi e senza pulsante. `parentFeatureId` deriva già dal catalogo; non duplicarlo negli override.

### 9.2 Nascondersi in Piena Vista

Usare il percorso generico Class Feature, senza adapter:

- `include: true`;
- `status: implemented`;
- `automationLevel: assistita`;
- `defaultEnabled: true`;
- `quickActionEligible: false`;
- tema con emoji univoca per la classe, per esempio `🫥`;
- `activation.primary: azione`;
- `trackingMode: active`;
- `targeting: { mode: "self", maxTargets: 1, excludeSource: false }`;
- durata manuale (`rounds: null`) con `end_conditions` descrittive `moves`, `falls_prone`, `no_longer_hidden`;
- `effectPlan.kind: condition`;
- nome pill `Nascosto in Piena Vista`;
- dettaglio: `−10 alle prove di Percezione per individuare il Ranger. Termina se si muove, cade prono o non è più nascosto; può continuare dal turno successivo solo se resta nascosto e immobile.`

Il plugin non deve ascoltare movimento o condizioni. GM o giocatore terminano la singola istanza dal Control Center/context menu; history e Undo sono quelli comuni.

### 9.3 Compagno Animale

Usare il percorso generico Class Feature, senza adapter:

- `include: true`;
- `status: implemented`;
- `automationLevel: assistita`;
- `defaultEnabled: true`;
- `quickActionEligible: false`;
- tema con emoji univoca, per esempio `🐾`;
- `trackingMode: active`;
- `targeting: { mode: "single-target", rangeMeters: null, maxTargets: 1, excludeSource: true }`;
- durata manuale;
- `effectPlan.kind: condition`;
- nome pill `Compagno Animale`;
- dettaglio: `Creatura legata al Ranger Revised. Usa lo stat block già disponibile e consulta Legame del Compagno; può esistere un solo compagno. Termina il vecchio legame prima di applicarne uno nuovo.`

Il normale resolver accetta già un solo token `CHARACTER`, esclude la sorgente e registra `sourceId`, `sourceName`, `parentEffectId`, `appliedAt`, expiry manuale, history e Undo.

Non introdurre un controllo automatico di unicità globale: il cambio di compagno richiede comunque rituale, spesa, disponibilità dello stat block e approvazione del DM, tutti elementi adjudicati al tavolo. Il reminder e la checklist obbligano a terminare prima il legame precedente.

## 10. Primitive condivise

Non serve alcuna nuova primitive.

Riusare:

- inclusione/reference card e filtro per livello/sottoclasse del catalogo Class Feature;
- `optionGroup` dell'editor per le scelte esclusive;
- targeting generico `single-target` e `self`;
- `planClassFeatureActivation()` e `classFeatureConditionInstancesForActivation()`;
- condizioni Class Feature con sorgente, bersaglio, `parentEffectId`, `appliedAt` ed expiry manuale;
- `deactivateClassFeature()` per rimozione singola;
- `withItemMetaHistory()` e Undo;
- normalizzazione `additionalSpellsByLevel` e catalogo Incantesimi esistente.

Non aggiungere adapter Ranger, metadata Ranger, listener a movimento/visibilità, aura, resource pool o codice in `initiativeList.js`.

## 11. Ordine di implementazione per il secondo agente

1. Eseguire `git status --short` e verificare che il worktree condiviso non abbia cambiato i blocchi interessati dopo questo audit.
2. Rileggere i sei file `ranger_revised_*` sotto `data/class-features`; non modificarli e non rigenerarne gli hash.
3. Aggiungere in `runtime-feature-overrides.json` i 43 record descrittivi con la forma comune.
4. Impostare i quindici figli delle scelte con `defaultEnabled: false` e gli esatti cinque `optionGroup` indicati nelle matrici.
5. Aggiungere gli override assistiti di `Nascondersi in Piena Vista` e `Compagno Animale` usando esclusivamente il planner generico.
6. Eseguire `npm.cmd run generate:class-features`; non modificare manualmente l'output.
7. Eseguire `npm.cmd run audit:class-features` e aggiornare solo le aspettative derivate nei test.
8. Aggiungere i test Ranger Revised descritti sotto.
9. Eseguire i test mirati, poi l'intera suite e infine `npm.cmd run build`.
10. Ripetere il generatore una seconda volta e verificare che non produca diff: la generazione deve essere deterministica.

## 12. Test automatici richiesti

Creare `test/rangerRevisedFeatureRuntime.test.js` con almeno questi casi:

1. la sorgente contiene esattamente 45 record e il runtime, dopo gli override, espone esattamente gli stessi 45 ID;
2. tutti i 45 record appartengono a `ranger-revised`, mai a `ranger`;
3. i 43 reminder hanno `runtimeSupport.status: not-automated`, `automationLevel: riferimento`, `quickActionEligible: false` ed `effectPlan: null`;
4. soltanto `Nascondersi in Piena Vista` e `Compagno Animale` hanno `status: implemented`;
5. i quindici figli hanno `defaultEnabled: false` e ogni gruppo consente una sola scelta nell'editor;
6. i parent dei gruppi sono reference card e non sono attivabili;
7. il filtro per livello espone correttamente classe e conclave ai livelli 1, 3, 5, 7, 10, 11, 14, 15, 18 e 20;
8. un build `ranger` PHB non riceve alcuna capacità `ranger-revised`, e viceversa;
9. Nascondersi in Piena Vista genera una sola pill sul Ranger con expiry manuale, terminazione singola e nessuna mutazione a HP, movimento o condizioni estranee;
10. Compagno Animale richiede esattamente un token `CHARACTER`, esclude il Ranger, applica la pill al token scelto e non scrive statistiche, HP, CA o stat block;
11. attivazione, terminazione e Undo dei due reminder assistiti ripristinano sia `classFeatureState` sia le condizioni coinvolte;
12. nessuna capacità Ranger Revised compare in `buildClassFeatureQuickActions()`;
13. i cinque incantesimi del Cacciatore delle Profondità risolvono tramite `getSpellDefinition()` ai livelli 3, 5, 9, 13 e 17;
14. una seconda generazione produce lo stesso artefatto della prima;
15. il test di integrità continua a verificare gli SHA-256 dichiarati dai report.

Non creare test che si limitino a cercare stringhe negli override. Testare le definizioni generate e, per i due reminder assistiti, il planner/condition builder realmente consumati dal runtime.

## 13. Checklist manuale GM / Player in Owlbear Rodeo

### Configurazione

- [ ] Il GM vede separatamente `Ranger` e `Ranger (Revised)` nel builder.
- [ ] Selezionando Ranger Revised compaiono esattamente i tre conclavi forniti.
- [ ] Cambiando livello, le carte appaiono ai livelli corretti senza capacità del Ranger PHB.
- [ ] Il Player vede gli stessi reminder configurati dal GM, ma non ottiene controlli che tirano dadi o cambiano statistiche.

### Scelte

- [ ] È possibile abilitare una sola opzione di Stile di Combattimento.
- [ ] Il Cacciatore può abilitare una sola opzione per Preda, Tattiche, Multiattacco e Difesa Superiore.
- [ ] Cambiare opzione disabilita la precedente nello stesso gruppo e non influenza gli altri gruppi.

### Compagno Animale

- [ ] Il GM prepara o importa un normale token creatura dalle fonti che possiede; il plugin non chiede di ricopiarne lo stat block.
- [ ] Con il token creatura selezionato, `Compagno Animale` applica la pill soltanto a quel token e conserva il nome del Ranger come sorgente.
- [ ] Se è selezionato il Ranger stesso o più di un token, l'attivazione viene rifiutata.
- [ ] La pill non modifica HP, HP massimi, CA, iniziativa, competenze, dadi vita, caratteristiche o azioni del token.
- [ ] Prima di collegare un nuovo compagno, il GM termina manualmente il vecchio legame.
- [ ] Terminazione e Undo rimuovono/ripristinano la singola pill e lo stato del legame.

### Nascondersi in Piena Vista

- [ ] Dopo la conferma al tavolo, l'attivazione applica il reminder soltanto al Ranger.
- [ ] Muovere il token, farlo cadere prono o rivelarlo non produce calcoli: il reminder dice chiaramente quando terminarlo.
- [ ] Il GM può mantenere il reminder oltre il turno se il Ranger resta nascosto e immobile.
- [ ] Rimozione singola e Undo funzionano senza toccare altre condizioni.

### Incantesimi e regole manuali

- [ ] Il Cacciatore delle Profondità mostra Camuffare Se Stesso, Trucco della Corda, Glifo di Interdizione, Invisibilità Superiore e Sembrare ai livelli 3/5/9/13/17.
- [ ] I nomi aprono/risolvono il normale sistema Incantesimi; slot, pill, concentrazione, scadenze e Undo restano invariati.
- [ ] Nessuna carta Ranger tira attacchi, danni, prove o TS.
- [ ] Nessuna carta modifica automaticamente CA, vantaggio, svantaggio, resistenze, HP, movimento, iniziativa o reazioni.
- [ ] Raffica, Attacco Turbinante e Tempesta di Artigli e Zanne non creano aura, template o selezioni di massa.

## 14. Criteri di accettazione

Il batch è accettato soltanto se:

- i sei JSON conservano gli hash dichiarati;
- `ranger-revised` coesiste con `ranger` senza collisioni o sovrascritture;
- tutti i 45 record sono visibili nel runtime alla classe, sottoclasse e livello corretti;
- la classificazione finale è 43 descrittive, 2 assistite, 0 automatiche;
- le quindici opzioni sono disabilitate di default ed esclusive nei cinque gruppi;
- i due reminder assistiti usano pill, history, Undo e terminazione comuni;
- nessun runtime chiede o memorizza uno stat block del compagno;
- nessun tiro o risultato regolistica viene calcolato;
- il sistema Incantesimi è riusato senza duplicazioni;
- non sono stati modificati spell runtime, HP, iniziativa, movimento, aura engine o `initiativeList.js`;
- `src/class-features-runtime.json` deriva dal generatore;
- generatore, audit, test completi e build terminano con successo;
- due generazioni consecutive non producono differenze.
