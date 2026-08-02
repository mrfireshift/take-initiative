# Audit e piano di implementazione — Barbaro, Cammino del Berserker

## 1. Scopo e regola prodotto

Questo audit copre soltanto il **Cammino del Berserker** del Manuale del Giocatore 2014. La classe base Barbaro è già stata auditata: **Ira** e **Attacco Irruento** sono baseline accettate e non devono cambiare comportamento.

Regola vincolante: il plugin non tira dadi e non determina il risultato di attacchi o tiri salvezza. Può mostrare una capacità descrittiva, applicare un reminder dopo una conferma del tavolo e gestirne il lifecycle quando questo è deterministico.

Inventario completo della sottoclasse:

1. `barbaro-cammino-del-berserker-frenesia`, livello 3;
2. `barbaro-cammino-del-berserker-ira-incontenibile`, livello 6;
3. `barbaro-cammino-del-berserker-presenza-intimidatoria`, livello 10;
4. `barbaro-cammino-del-berserker-ritorsione`, livello 14.

Destinazione finale:

- 2 capacità assistite: Frenesia e Presenza Intimidatoria;
- 2 capacità descrittive: Ira Incontenibile e Ritorsione;
- 0 capacità automatiche;
- 0 capacità non supportate.

## 2. Snapshot e fonti di verità

Snapshot osservato durante l'audit:

- branch `main`;
- HEAD `9923cc3`;
- worktree condiviso e modificato contemporaneamente da altri agenti.

Il secondo agente deve rileggere i blocchi interessati subito prima della patch e non deve sostituire file completi.

Ordine delle fonti:

1. `data/class-features/phb2014_classi_database_finale.json`: nomi, livelli e testo integrale delle regole;
2. `data/class-features/phb2014_livello_meccanico_v1_1.json`: interpretazione meccanica normalizzata;
3. `data/class-features/runtime-feature-overrides.json`: decisioni runtime curate;
4. `data/class-features/barbaro-combat-decisions.json`: classificazione usata dall'audit Barbaro;
5. `scripts/generate-class-feature-catalog.mjs`: generatore del catalogo runtime;
6. `scripts/audit-barbaro-features.mjs`: generatore dell'audit Barbaro;
7. `src/class-features-runtime.json` e `data/class-features/barbaro-combat-audit.json`: artefatti derivati, mai da modificare manualmente.

Il catalogo descrittivo contiene correttamente tutte e quattro le capacità. I difetti sono negli overlay meccanici, negli override e nella classificazione derivata, non nel testo regolamentare principale.

## 3. Stato reale e matrice

| Livello | Capacità | Meccanica da ricordare | Stato reale | Destinazione | Logica esistente |
|---:|---|---|---|---|---|
| 3 | Frenesia | Scelta quando si entra in Ira; dal turno successivo un attacco con arma da mischia come azione bonus; un livello di sfinimento quando Ira termina | Implementata, ma reminder e attivazione sono incompleti | Assistita | `condition`, dipendenza `untilFeatureId: barbaro-ira`, pool Ira condiviso e rimozione a cascata |
| 6 | Ira Incontenibile | Durante Ira non si può essere Affascinati o Spaventati; gli effetti già presenti sono sospesi fino alla fine di Ira | Assente dal catalogo runtime; l'audit la dichiara erroneamente coperta da Ira | Descrittiva | carta `reference-only` già usata dalle capacità passive del Barbaro |
| 10 | Presenza Intimidatoria | Azione, bersaglio visibile entro 9 m, TS Saggezza manuale; sul fallimento reminder fino a fine turno successivo, rinnovabile; fine anticipata per linea di visuale o distanza; blocco di 24 ore dopo successo | Implementata, ma il reminder omette rinnovo, fine anticipata e blocco dopo successo | Assistita dopo esito manuale | selezione singola, adapter `condition`, expiry `next-turn-end`, terminazione comune e Undo |
| 14 | Ritorsione | Dopo danni da una creatura entro 1,5 m si può spendere la reazione per effettuare un attacco con arma da mischia | Assente dal catalogo runtime | Descrittiva | carta `reference-only`; nessuna azione runtime o pill persistente |

## 4. Analisi per capacità

### 4.1 Frenesia

#### Comportamento attuale

- è presente in `src/class-features-runtime.json` come `implemented` con adapter `condition`;
- richiede un'istanza attiva di Ira perché la durata usa `untilFeatureId: barbaro-ira`;
- il costo dichiara il pool `barbaro-ira-usi` condiviso con Ira, quindi non consuma un secondo uso quando Ira è già attiva;
- la pill sul Barbaro termina con l'istanza padre di Ira;
- la disattivazione di Ira rimuove anche Frenesia;
- l'attivazione visualizzata è però `azione_bonus`, come se la capacità venisse scelta usando l'attacco bonus;
- il dettaglio della pill non ricorda il livello di sfinimento alla fine di Ira.

#### Causa

Il record meccanico ha interpretato l'azione bonus concessa nei turni successivi come attivazione della capacità. La scelta regolamentare avviene invece quando il Barbaro entra in Ira. L'override corregge targeting e lifecycle, ma non corregge l'attivazione e tronca il reminder prima della conseguenza finale.

#### Implementazione richiesta

In `data/class-features/runtime-feature-overrides.json`, conservare adapter, costo condiviso, targeting, durata, tracking e concentrazione. Modificare soltanto:

| Campo | Valore richiesto |
|---|---|
| `activation.primary` | `ingresso_in_ira` |
| `effectPlan.detail` | deve dire che la scelta avviene entrando in Ira, che l'attacco bonus è disponibile in ciascun turno successivo a quello iniziale e che alla fine di Ira il tavolo applica manualmente un livello di Sfinimento/Indebolimento |

Allineare anche `activation.primary` nel record di `data/class-features/phb2014_livello_meccanico_v1_1.json` a `ingresso_in_ira`. Non cambiare il testo integrale nel database descrittivo.

Non implementare:

- il tiro per colpire o il danno dell'attacco;
- la verifica del tipo di arma o del turno iniziale;
- l'applicazione automatica dello sfinimento alla chiusura di Ira;
- un secondo pool o un secondo consumo di Ira;
- modifiche al comportamento di `barbaro-ira`.

Lo sfinimento è deliberatamente manuale: il progetto ha già una condizione canonica e il GM può applicarla con i controlli esistenti. Automatizzarla richiederebbe un nuovo effetto di uscita dal lifecycle e renderebbe più rischiosi history, Undo e chiusure concorrenti di Ira senza migliorare il reminder principale.

### 4.2 Ira Incontenibile

#### Comportamento attuale

La capacità non compare in `src/class-features-runtime.json`, perché ha livello di automazione `riferimento`, attivazione `passiva` e nessun override `include`.

`data/class-features/barbaro-combat-decisions.json` usa `covered_by_parent` e afferma che il marker di Ira rappresenta la sospensione di Affascinato e Spaventato. Questa copertura non esiste: né la descrizione né la pill runtime di `barbaro-ira` contengono Ira Incontenibile.

#### Causa

La decisione di audit descrive un'integrazione ipotetica con Ira che non è stata implementata. Il generatore applica poi correttamente la propria policy conservativa e filtra la passiva.

#### Implementazione richiesta

Esporre la capacità come carta descrittiva usando il pattern già esistente:

| Campo override | Valore richiesto |
|---|---|
| `include` | `true` |
| `status` | `not-automated` |
| `defaultEnabled` | `true` |

Non servono `adapter`, `effectPlan`, targeting runtime, durata runtime o quick action. Con `automationLevel: riferimento`, `classFeatureIsReferenceOnly()` la presenta già come **Promemoria descrittivo** e la esclude da quick action e menu contestuale.

In `data/class-features/barbaro-combat-decisions.json`, sostituire `covered_by_parent` con il modo esistente `tavolo` e dichiarare che la carta ricorda l'applicazione durante Ira e la sospensione manuale delle due condizioni. Rigenerare poi l'audit Barbaro.

Non implementare:

- rimozione o disattivazione automatica delle condizioni Affascinato e Spaventato;
- una seconda pill da attivare manualmente ogni volta che inizia Ira;
- arricchimenti condizionali del marker accettato di Ira;
- modifiche a `conditions.js`.

La carta descrittiva è preferibile a una seconda attivazione: resta visibile nella scheda della sottoclasse, dice esplicitamente che il beneficio vale soltanto durante Ira e non chiede al GM un click ridondante.

### 4.3 Presenza Intimidatoria

#### Comportamento attuale

- è presente come capacità `implemented` con adapter `condition`;
- usa un'azione, seleziona un solo bersaglio, esclude il Barbaro e imposta la portata a 9 m;
- crea sul bersaglio un reminder strutturato;
- scade alla fine del turno successivo del Barbaro tramite `next-turn-end`;
- può essere terminata con i controlli comuni e passa dal normale percorso history/Undo;
- non tira il TS Saggezza e non calcola la CD;
- la pill dice soltanto che il bersaglio è spaventato fino al termine del turno successivo.

Il record meccanico sorgente è semanticamente errato in due punti: indica attivazione `passiva` e usa 24 ore come durata primaria. Le 24 ore sono invece soltanto il divieto di riutilizzo sul bersaglio che ha superato il TS; l'effetto sul fallimento dura fino alla fine del prossimo turno ed è rinnovabile.

#### Implementazione richiesta

Conservare adapter, selezione singola, portata 9 m, esclusione della fonte, tracking e `next-turn-end`. Ampliare `effectPlan.detail` affinché riporti tutti questi punti:

- applicare il reminder soltanto dopo che il tavolo ha confermato un TS Saggezza fallito;
- il bersaglio deve essere visibile entro 9 m e deve poter vedere o udire il Barbaro;
- nei turni successivi il Barbaro può spendere l'azione per estendere l'effetto;
- con il core attuale, il rinnovo si effettua terminando e riapplicando la stessa capacità sullo stesso bersaglio;
- il GM termina anticipatamente il reminder se il bersaglio conclude il proprio turno fuori linea di visuale o a più di 18 m;
- se il TS è superato non si applica alcuna pill e il divieto di riuso per 24 ore resta un reminder manuale.

Allineare il record di `data/class-features/phb2014_livello_meccanico_v1_1.json` senza inventare nuove chiavi:

- `automation_level: assistita`;
- `activation.primary: azione`, `optional: true`, trigger `tiro_salvezza`;
- bersaglio singolo, portata primaria 9 m e scelta manuale;
- non usare più le 24 ore come durata dell'effetto applicato; conservarle nella rappresentazione descrittiva del blocco dopo TS riuscito, usando soltanto strutture già ammesse dallo schema.

Non implementare:

- il tiro del TS, il calcolo della CD o la lettura del Carisma;
- il controllo automatico di vista, udito o tipo del token;
- geometria o aura da 18 m;
- un timer reale di 24 ore o metadata per bersaglio;
- l'applicazione della condizione generica Spaventato al posto del reminder della capacità.

Il blocco dei duplicati in `planClassFeatureActivation()` è una protezione condivisa e non va modificato per questa capacità. Il flusso “termina e riapplica” rende esplicito l'uso dell'azione di rinnovo e conserva il lifecycle esistente.

### 4.4 Ritorsione

#### Comportamento attuale

La capacità è correttamente descritta nel database e nel record meccanico come reazione a `danno_subito`, portata 1,5 m. È assente dal catalogo runtime perché il record è `riferimento` e non ha un override `include`.

#### Implementazione richiesta

Esporla come carta descrittiva:

| Campo override | Valore richiesto |
|---|---|
| `include` | `true` |
| `status` | `not-automated` |
| `defaultEnabled` | `true` |

Conservare in `data/class-features/barbaro-combat-decisions.json` il modo `instant_effect`: la reazione non crea uno stato persistente. Il testo descrittivo già specifica evento, fonte del danno, distanza, costo della reazione e attacco consentito.

Non implementare:

- tiro per colpire o danno;
- rilevamento del responsabile del danno;
- selezione automatica dell'attaccante;
- consumo o tracking automatico della reazione;
- pill sul bersaglio;
- reminder su ogni diminuzione degli HP.

Il controller di Ira Implacabile non è una primitive riutilizzabile per Ritorsione: la transizione a 0 PF durante Ira è verificabile dai dati canonici, mentre una riduzione generica di `meta.hp` non rivela se il danno proviene da una creatura entro 1,5 m. Estenderlo produrrebbe falsi reminder per aree, pericoli, danni a distanza e aggiornamenti aggregati.

## 5. Primitive da riusare e primitive nuove

Primitive esistenti da riusare:

- `condition` per Frenesia e Presenza Intimidatoria;
- `duration.untilFeatureId` e parent instance per il lifecycle di Ira;
- costo `sharedWithFeatureId` per non consumare Ira due volte;
- `next-turn-end` per Presenza Intimidatoria;
- selezione `single-target`, `maxTargets: 1`, `excludeSource: true`;
- `classFeatureIsReferenceOnly()` per Ira Incontenibile e Ritorsione;
- terminazione, history e Undo comuni delle Class Feature.

**Nessuna nuova primitive condivisa è necessaria.** Non modificare `classFeatureReminderController.js`, `classFeatureCore.js`, `classFeatureRuntime.js`, `initiativeList.js`, il sistema delle condizioni, gli HP, l'iniziativa o i sistemi aura/spell.

## 6. File da modificare

Modifiche sorgente minime:

1. `data/class-features/runtime-feature-overrides.json`:
   - correggere Frenesia;
   - ampliare il reminder di Presenza Intimidatoria;
   - includere Ira Incontenibile e Ritorsione come descrittive.
2. `data/class-features/phb2014_livello_meccanico_v1_1.json`:
   - correggere l'attivazione di Frenesia;
   - correggere attivazione e semantica della durata di Presenza Intimidatoria.
3. `data/class-features/barbaro-combat-decisions.json`:
   - rimuovere la falsa copertura di Ira Incontenibile.
4. `test/barbarianFeatureRuntime.test.js` e `test/classFeatureCatalog.test.js`:
   - aggiungere le regressioni descritte sotto.
5. `test/barbarianCombatAudit.test.js`:
   - aggiornare il riepilogo per il passaggio `covered_by_parent` → `tavolo`: a parità degli altri record, `tavolo` passa da 26 a 27 e `covered_by_parent` da 4 a 3; gli altri conteggi restano invariati.

Artefatti da rigenerare, non editare:

- `src/class-features-runtime.json` con `npm run generate:class-features`;
- `data/class-features/barbaro-combat-audit.json` e `docs/AUDIT_BARBARO.md` con `npm run audit:barbaro`.

Non modificare `data/class-features/phb2014_classi_database_finale.json`: i quattro testi regolamentari osservati sono già completi.

## 7. Ordine di implementazione

1. Rileggere gli stessi record nel worktree corrente e salvare il diff preesistente dei tre file sorgente.
2. Correggere l'overlay meccanico di Frenesia e Presenza Intimidatoria.
3. Applicare la patch minima agli override delle quattro capacità.
4. Correggere soltanto la decisione di Ira Incontenibile nell'audit sorgente.
5. Rigenerare il catalogo Class Feature.
6. Rigenerare l'audit Barbaro.
7. Aggiungere o aggiornare i test mirati.
8. Eseguire i test mirati, l'intera suite se il worktree lo consente e infine la build.
9. Controllare il diff per assicurarsi che i generatori non abbiano incorporato modifiche concorrenti non pertinenti.

## 8. Test automatici richiesti

### Catalogo e UI policy

- un Barbaro Berserker di livello 14 rende disponibili tutte e quattro le capacità;
- Frenesia e Presenza Intimidatoria sono `implemented`;
- Ira Incontenibile e Ritorsione sono `not-automated` e `classFeatureIsReferenceOnly()` restituisce `true`;
- le due descrittive non generano quick action né voci nel menu contestuale;
- tutte e quattro sono `defaultEnabled: true`.

### Frenesia

- `activation.primary` è `ingresso_in_ira`;
- il dettaglio contiene turno successivo, fine di Ira e applicazione manuale dello sfinimento;
- non si attiva senza Ira;
- con Ira attiva non consuma un secondo uso;
- conserva `parentInstanceId` e la disattivazione di Ira rimuove Frenesia;
- Ira e Attacco Irruento mantengono gli assert attuali senza variazioni.

### Presenza Intimidatoria

- targeting singolo a 9 m ed esclusione della fonte restano invariati;
- l'expiry resta `turn-end`, actor `source`, anchor `next-turn`;
- il dettaglio cita TS fallito manuale, rinnovo, fine per vista/18 m e blocco di 24 ore dopo successo;
- non vengono creati tiri, modifiche a caratteristiche o timer di 24 ore;
- la terminazione rimuove soltanto l'istanza e la pill collegate.

### Audit e determinismo

- Ira Incontenibile non è più `covered_by_parent`;
- Ritorsione resta `instant_effect`;
- `npm run generate:class-features` eseguito due volte sullo stesso input produce lo stesso `src/class-features-runtime.json`;
- `npm run audit:barbaro` eseguito due volte produce gli stessi artefatti.

Comandi minimi:

1. `node --test test/barbarianFeatureRuntime.test.js test/barbarianCombatAudit.test.js test/classFeatureCatalog.test.js test/classFeatureReminderCore.test.js`
2. `npm run build`

## 9. Rischi di regressione

- **Ira:** alto impatto se si toccano override o core della capacità padre. Non farlo; Frenesia deve restare una figlia indipendente.
- **Pool Ira:** un costo senza `sharedWithFeatureId` consumerebbe due usi. Conservare l'assert esistente.
- **Concentrazione:** non cambiare la policy già applicata alle varianti collegate a Ira.
- **Presenza Intimidatoria:** cambiare `next-turn-end` in un round fisso produrrebbe scadenze errate rispetto all'ordine di iniziativa.
- **Rinnovo:** rimuovere globalmente la protezione contro i duplicati introdurrebbe stacking accidentale in molte capacità.
- **Condizioni:** usare la condizione generica Spaventato muterebbe una regola che il tavolo deve adjudicare e complicherebbe la sospensione di Ira Incontenibile.
- **Worktree concorrente:** rigenerazioni estese possono includere input modificati da altri agenti; il diff finale deve separare il Berserker dal resto.

## 10. Checklist manuale GM/Player in Owlbear Rodeo

Configurazione: token `CHARACTER`, Barbaro 14, sottoclasse `Cammino del Berserker`, quattro capacità abilitate.

### Visibilità

- [ ] La scheda mostra Frenesia e Presenza Intimidatoria come assistite.
- [ ] La scheda mostra Ira Incontenibile e Ritorsione come “Promemoria descrittivo”.
- [ ] Ira Incontenibile e Ritorsione non compaiono tra quick action o azioni contestuali.

### Frenesia

- [ ] Senza Ira attiva, Frenesia non è attivabile.
- [ ] Attivare Ira consuma un solo uso; attivare poi Frenesia non ne consuma un secondo.
- [ ] La pill ricorda che l'attacco bonus è disponibile dai turni successivi a quello iniziale.
- [ ] Terminare Ira rimuove anche Frenesia.
- [ ] Prima di chiudere Ira, il testo ricorda al GM di applicare manualmente un livello di Sfinimento/Indebolimento.
- [ ] Undo ripristina lo stato precedente senza duplicare pill o risorse.

### Ira Incontenibile

- [ ] Il testo dice che il beneficio vale solo durante Ira.
- [ ] Il testo distingue immunità a nuovi Affascinato/Spaventato dalla sospensione degli effetti già presenti.
- [ ] Nessuna condizione esistente viene rimossa automaticamente.

### Presenza Intimidatoria

- [ ] Il tavolo tira il TS senza intervento del plugin.
- [ ] Dopo un fallimento confermato, selezionare un solo nemico e attivare la capacità crea una sola pill sul bersaglio, non sul Barbaro.
- [ ] La pill scade alla fine del turno successivo del Barbaro.
- [ ] Per rinnovare, il GM termina e riapplica la capacità sullo stesso bersaglio dopo aver speso l'azione.
- [ ] Il GM può terminarla anticipatamente dopo il turno del bersaglio per linea di visuale o distanza superiore a 18 m.
- [ ] Dopo un TS riuscito non viene applicata alcuna pill; il blocco di 24 ore resta gestito al tavolo.
- [ ] History e Undo ripristinano applicazione e terminazione.

### Ritorsione

- [ ] La carta ricorda danno proveniente da una creatura entro 1,5 m, uso della reazione e attacco con arma da mischia.
- [ ] Una variazione degli HP non mostra automaticamente reminder e non seleziona un presunto attaccante.
- [ ] Il plugin non tira l'attacco e non applica danni.

## 11. Criteri di accettazione

Il batch è accettato quando:

1. tutte e quattro le capacità sono visibili a un Berserker del livello appropriato;
2. Frenesia conserva il lifecycle e il pool condiviso di Ira e ricorda esplicitamente lo sfinimento finale senza applicarlo;
3. Ira Incontenibile non è più dichiarata coperta da un marker che non la contiene ed è leggibile come reminder descrittivo;
4. Presenza Intimidatoria applica un reminder solo dopo decisione del tavolo, a un singolo bersaglio, con expiry corretta e istruzioni complete di rinnovo e fine anticipata;
5. Ritorsione è leggibile ma non produce automazioni, pill o notifiche basate sugli HP;
6. nessun dado, attacco, danno, TS, CD, condizione regolistica o uso della reazione viene risolto dal plugin;
7. Ira e Attacco Irruento superano invariati i test di regressione;
8. gli artefatti generati sono deterministici e non sono stati modificati manualmente;
9. i test mirati e `npm run build` terminano con successo.
