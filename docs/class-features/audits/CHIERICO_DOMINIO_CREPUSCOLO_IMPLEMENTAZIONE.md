# Audit e piano di implementazione — Chierico, Dominio del Crepuscolo

## 1. Scopo

Questo è il primo audit dedicato al Chierico. Copre quindi:

- i 7 privilegi della classe base presenti nel catalogo PHB 2014;
- i 7 privilegi del Dominio del Crepuscolo presenti nel catalogo di Tasha;
- i 10 incantesimi di dominio già strutturati sulla sottoclasse.

Regola prodotto vincolante: **il plugin non tira dadi e non determina il risultato di alcun tiro**. Può, dopo una conferma del tavolo, consumare una risorsa, applicare un reminder strutturato, mostrare dove si trova un effetto e ricordarne durata o condizioni di fine.

Destinazione complessiva:

- 9 capacità descrittive;
- 5 capacità assistite;
- 0 capacità automatiche;
- 0 capacità non supportate.

L'unica capacità attualmente implementata è `Incanalare Divinità: Santuario del Crepuscolo`, ma richiede una correzione mirata: l'aura esiste, mentre il beneficio di fine turno non viene ricordato e la membership esclude creature che il testo non esclude.

## 2. Snapshot e fonti di verità

Snapshot osservato durante l'audit:

- branch `main`;
- HEAD `9923cc3`;
- worktree condiviso con modifiche concorrenti non committate ai sistemi Class Feature, aura, reminder e UI.

Il secondo agente deve rileggere i blocchi interessati prima di applicare la patch e non deve sostituire integralmente file già modificati.

Ordine delle fonti:

1. `data/class-features/phb2014_classi_database_finale.json`: descrizioni, livelli e progressione della classe base;
2. `data/class-features/phb2014_livello_meccanico_v1_1.json`: attivazioni e pool della classe base;
3. `data/class-features/tasha_sottoclassi_database_finale.json`: Dominio, descrizioni e incantesimi aggiuntivi;
4. `data/class-features/tasha_livello_meccanico_v1_0.json`: attivazioni, pool ed effetti strutturati del Dominio;
5. `data/class-features/runtime-feature-overrides.json`: decisioni runtime curate;
6. `scripts/generate-class-feature-catalog.mjs`: trasformazione deterministica;
7. `src/class-features-runtime.json`: artefatto generato, mai da modificare manualmente.

Primitive operative già presenti:

- sistema Incantesimi corrente;
- pool `chierico-incanalare-divinita-usi`, con massimo 1/2/3 e recupero a riposo breve o lungo;
- targeting singolo e multiplo, portata e selezione di token `CHARACTER`;
- condizioni Class Feature con `sourceId`, `sourceName`, `parentEffectId`, `appliedAt`, expiry, history e Undo;
- aura mobile, membership e pulizia delle pill quando si esce o l'aura termina;
- `triggerPolicy` informativa per popup a inizio/fine turno;
- movimento dichiarativo con `fly.copyFrom: walk`;
- pagamento assistito “uso giornaliero oppure slot già speso” di Linguaggio Universale.

## 3. Stato reale corrente

### Implementato

`chierico-dominio-del-crepuscolo-incanalare-divinita-santuario-del-crepuscolo` è `implemented`, adapter `aura`, durata 10 round, raggio 9 m e costo di un uso di Incanalare Divinità.

Funziona già per:

- attivazione e consumo della risorsa;
- aura visuale mobile;
- pill dinamiche sulle creature considerate alleate;
- scadenza dopo 10 round;
- terminazione, pulizia, history e Undo.

Non è ancora completo perché:

- il `targetEffect.detail` mostra identificatori interni come `temp_hp_1d6_plus_level_chierico`;
- `mechanics.onEndTurn` non ha un consumer che produca il reminder richiesto;
- non esiste un `triggerPolicy` di fine turno;
- la membership `friendly` esclude neutrali e nemici, mentre la regola permette al Chierico di scegliere **una creatura** nella sfera;
- il caster riceve una pill separata e non entra nel flusso dei trigger dell'aura;
- la fine anticipata per incapacità o morte resta soltanto nel testo integrale;
- Sudario del Crepuscolo non è raccordato al reminder dell'aura.

### Presenti ma non implementati

Sono nell'artefatto come `not-automated`, `defaultEnabled: false`:

- Scacciare Non Morti;
- Intervento Divino;
- Occhi della Notte;
- Benedizione Vigile;
- Passi nella Notte;
- Colpo Divino;
- Sudario del Crepuscolo.

### Assenti dall'artefatto runtime

Sono filtrati perché passivi, contenitori o di riferimento:

- Dominio Divino;
- Incantesimi;
- Incanalare Divinità;
- Aumento dei Punteggi di Caratteristica;
- Distruggere Non Morti;
- Competenze Bonus.

### Incantesimi del Dominio

I dieci nomi sono già presenti in `additionalSpellsByLevel`, ma la UI è hardcoded sul Paladino:

- `additionalSpellEntriesForProfile()` cerca soltanto `paladino`;
- `buildAdditionalSpellsSummary()` usa il titolo “Incantesimi del Giuramento di Vendetta”;
- il riepilogo viene montato soltanto sulla feature `paladino-incantesimi`.

Inoltre 8 nomi su 10 risolvono nel catalogo spell; mancano gli alias italiani per:

- `Raggio Lunare` → `Moonbeam`;
- `Capanna di Leomund` → `Tiny Hut`.

## 4. Matrice — classe base Chierico

| Livello | Capacità | Stato corrente | Classificazione | Implementazione richiesta |
|---:|---|---|---|---|
| 1 | `chierico-dominio-divino` — Dominio Divino | Assente | Descrittiva | Carta strutturale della scelta del Dominio. Il Dominio effettivo resta in `characterBuild`; mostrare gli incantesimi del Dominio tramite il catalogo spell, senza seconda selezione o secondo inventario. |
| 1 | `chierico-incantesimi` — Incantesimi | Assente | Descrittiva integrata | Carta di riferimento. Preparazione, slot, rituali, concentrazione, pill, expiry, history e Undo restano interamente nel sistema Incantesimi. Su questa carta montare il riepilogo degli incantesimi del Dominio. |
| 2, 6, 18 | `chierico-incanalare-divinita` — Incanalare Divinità | Assente | Descrittiva / contenitore risorsa | Mostrare usi 1/2/3 e recupero breve/lungo. Non è un'azione autonoma: Scacciare Non Morti e Santuario consumano il pool condiviso. |
| 2 | `chierico-incanalare-divinita-scacciare-non-morti` — Scacciare Non Morti | Non implementata | Assistita | Il tavolo risolve manualmente i TS Saggezza e Distruggere Non Morti; il plugin consuma Incanalare Divinità e applica `Scacciato` soltanto ai fallimenti non distrutti selezionati. Durata 10 round; fine anticipata al primo danno rimossa manualmente. |
| 4, 8, 12, 16, 19 | `chierico-aumento-dei-punteggi-di-caratteristica` | Assente | Descrittiva | Nessuna mutazione automatica dei punteggi. |
| 5, 8, 11, 14, 17 | `chierico-distruggere-non-morti` — Distruggere Non Morti | Assente | Descrittiva integrata | Mostrare soglie GS 1/2, 1, 2, 3 e 4. Non leggere o chiedere di ricopiare il GS/stat block; non impostare HP a zero. Il GM non seleziona come `Scacciato` un bersaglio già distrutto. |
| 10, 20 | `chierico-intervento-divino` — Intervento Divino | Non implementata | Descrittiva | Il percentile al 10° si tira al tavolo; il DM decide l'intervento. Al 20° il successo è automatico ma resta una decisione del DM. Il plugin non possiede un calendario affidabile per 7 giorni: nessun cooldown o workflow separato. |

## 5. Matrice — Dominio del Crepuscolo

| Livello | Capacità | Stato corrente | Classificazione | Implementazione richiesta |
|---:|---|---|---|---|
| 1 | `chierico-dominio-del-crepuscolo-competenze-bonus` — Competenze Bonus | Assente | Descrittiva | Reminder di armi da guerra e armature pesanti. Non modificare equipaggiamento, CA o profilo. |
| 1 | `chierico-dominio-del-crepuscolo-occhi-della-notte` — Occhi della Notte | Non implementata | Assistita | La scurovisione personale 90 m resta descrittiva. Per la condivisione: uso gratuito o slot già speso, selezione dei destinatari entro 3 m, pill di 1 ora. Visibilità, disponibilità, consenso e massimo pari a SAG restano conferme del tavolo. Nessuna modifica al motore di visione. |
| 1 | `chierico-dominio-del-crepuscolo-benedizione-vigile` — Benedizione Vigile | Non implementata | Assistita | Selezionare una creatura toccata, incluso il Chierico, e applicare il reminder “vantaggio al prossimo tiro di iniziativa”. Durata manuale; rimuovere dopo il tiro o prima di riutilizzare la capacità. Non osservare o modificare l'iniziativa. |
| 2 | `chierico-dominio-del-crepuscolo-incanalare-divinita-santuario-del-crepuscolo` | Implementata ma incompleta | Assistita | Conservare aura mobile 9 m, costo e 10 round. Membership su tutte le creature incluso il caster. A fine turno mostrare un popup informativo: tiro manuale di 1d6 + livello per PF temporanei **oppure** rimozione manuale di Affascinato/Spaventato. Nessuna applicazione automatica. |
| 6 | `chierico-dominio-del-crepuscolo-passi-nella-notte` — Passi nella Notte | Non implementata | Assistita | Dopo conferma di luce fioca/oscurità, consumare un uso, applicare pill al Chierico per 10 round e concedere al sistema movimento una velocità di volo pari al camminare. Non rilevare illuminazione. |
| 8, 14 | `chierico-dominio-del-crepuscolo-colpo-divino` — Colpo Divino | Non implementata | Descrittiva | Reminder 1d8/2d8 radiosi, una volta per turno, dopo un colpo con arma. Nessun tiro, trigger, danno o contatore. |
| 17 | `chierico-dominio-del-crepuscolo-sudario-del-crepuscolo` — Sudario del Crepuscolo | Non implementata | Descrittiva integrata | Carta passiva e riga condizionale nella pill del Santuario: soltanto il Chierico e i suoi alleati nella sfera hanno mezza copertura. Non creare una seconda aura/pill e non modificare numericamente CA o TS Destrezza. |

Conclusione: l'unica capacità già operativa è Santuario del Crepuscolo, ma richiede remediation. Tutte le altre tredici capacità vanno esposte o implementate secondo la matrice.

## 6. Logica vincolante delle capacità assistite

### 6.1 Scacciare Non Morti

Flusso:

1. il GM conferma simbolo sacro, non morti entro 9 m e requisiti di vista/udito;
2. tutti i TS Saggezza sono tirati al tavolo;
3. il GM verifica manualmente le soglie di Distruggere Non Morti;
4. seleziona soltanto i fallimenti non distrutti, oppure sceglie `Nessun bersaglio da marcare`;
5. il plugin consuma un uso di `chierico-incanalare-divinita-usi`;
6. ai token selezionati applica `Scacciato` per 10 round;
7. la pill ricorda movimento obbligato, divieto di avvicinarsi entro 9 m, assenza di reazioni e azioni ammesse;
8. il GM rimuove la singola pill appena il bersaglio subisce danni;
9. terminazione e Undo usano il percorso Class Feature comune.

Non usare aura o membership: il plugin non conosce tipo, vista, udito o esito del TS.

Per gestire correttamente anche il caso senza fallimenti aggiungere l'adapter `turn-undead`:

- modalità `failed-targets`: usa feature, targeting e durata normali;
- modalità `no-targets`: prepara una copia locale con `targeting: self`, `trackingMode: instant`, `effectPlan.kind: none`; consuma la risorsa senza pill;
- non aggiungere metadata persistenti; usare `choiceId` soltanto come traccia `failed-targets`/`no-targets`.

### 6.2 Occhi della Notte

Flusso:

1. il Chierico sceglie `Uso gratuito` oppure `Slot già speso`;
2. nel secondo caso conferma esplicitamente che lo slot è già stato registrato nel sistema competente;
3. seleziona una o più creature consenzienti entro 3 m;
4. il plugin valida selezione e portata, non vista, consenso o limite basato su Saggezza;
5. l'uso gratuito consuma `chierico-dominio-del-crepuscolo-occhi-della-notte-usi`;
6. l'uso tramite slot non consuma il pool gratuito e non muta gli slot;
7. ogni destinatario riceve `Scurovisione condivisa 90 m` per 600 round;
8. rimozione, scadenza, history e Undo sono comuni.

Non introdurre `meta.wis`, `meta.darkvision` o campi equivalenti. Il Chierico possiede già la visione personale: escluderlo dai destinatari condivisi.

Riusare il backend di Linguaggio Universale estraendo una primitive piccola `prepareDailyOrSlotFeatureActivation()`. Conservare `prepareUniversalSpeechFeatureActivation()` come wrapper per non rompere API e test Bardo. L'adapter `night-eyes` usa la stessa primitive e controlli UI con testo specifico.

### 6.3 Benedizione Vigile

Override generico, nessun adapter:

- `status: implemented`;
- `automationLevel: assistita`;
- `targeting: single-target`, `maxTargets: 1`, `excludeSource: false`, portata 1,5 m come approssimazione del contatto;
- durata manuale;
- pill `Benedizione Vigile`;
- dettaglio: vantaggio al prossimo tiro di iniziativa; termina dopo quel tiro o al riutilizzo.

Il plugin non deve intercettare l'editor iniziativa o il cambio ordine. Prima di spostare la Benedizione su un altro token, il GM termina la pill precedente; non aggiungere una primitive globale di sostituzione per questo batch.

### 6.4 Santuario del Crepuscolo

Preservare l'istanza e l'aura esistenti, ma sostituire il piano derivato generico con un override completo:

- `status: implemented`, adapter `aura`;
- targeting aura 9 m;
- durata 10 round;
- costo di un uso di Incanalare Divinità già proveniente dall'overlay;
- `suppressSourceCardPill: true`;
- `membershipTargeting: { filter: "all", includeCaster: true }`;
- una sola pill `Nel Santuario del Crepuscolo` su ogni creatura nella sfera;
- dettaglio leggibile, senza identificatori meccanici interni;
- riga condizionale: `Se il Chierico possiede Sudario del Crepuscolo (17°) e questa creatura è il Chierico o un suo alleato, ha mezza copertura.`;
- nessun `temporaryHp` e nessun `mechanics.onEndTurn` senza consumer.

Usare il `triggerPolicy` già consumato da `classFeatureAuraReminderCore.js`:

- evento `turn-end`;
- `targetMode: actor`;
- `frequency: once-per-turn`;
- `resolution: informational`;
- label: `Santuario: il Chierico può scegliere per questa creatura: tira manualmente 1d6 e applica PF temporanei pari al risultato + livello da Chierico, oppure termina un effetto che la rende Affascinata o Spaventata.`

Il popup non deve offrire un tiro o mutare HP/condizioni. GM e giocatore usano i controlli HP e condizioni già esistenti dopo avere risolto la scelta al tavolo.

La pill deve ricordare anche: `Termina dopo 1 minuto o prima se il Chierico è incapacitato o morto.` Non aggiungere un listener generale alle condizioni per la fine anticipata; la terminazione resta manuale.

### 6.5 Passi nella Notte

Override generico con adapter `condition`:

- targeting self;
- azione bonus;
- durata 10 round;
- costo esistente `chierico-dominio-del-crepuscolo-passi-nella-notte-usi`;
- `effectPlan.mechanics.movement.modes.fly.copyFrom: walk`;
- pill che ricorda il requisito di luce fioca/oscurità all'attivazione.

Non modificare `speedCheck.js`: `copyFrom: walk` è già usato e testato da Sintonia Totemica: Aquila.

Il massimo del pool è oggi `null` perché `resolveClassFeatureResourceMaximum()` non interpreta `capacity.type: formula`. Aggiungere esclusivamente il caso:

- espressione normalizzata `bonus_competenza`;
- somma dei livelli della `characterBuild`, limitata a 20;
- bonus 2/3/4/5/6 ai livelli totali 1/5/9/13/17.

Non chiedere al GM un valore già derivabile dalla build e non introdurre metadata di bonus di competenza.

## 7. Reminder descrittivi

In `runtime-feature-overrides.json`, per i nove record descrittivi usare il pattern:

```json
{
  "include": true,
  "status": "not-automated",
  "automationLevel": "riferimento",
  "defaultEnabled": true,
  "quickActionEligible": false
}
```

Non aggiungere `effectPlan` a questi record. `Incanalare Divinità` resta un contenitore e non consuma risorse quando si apre la carta.

I nove record sono:

1. Dominio Divino;
2. Incantesimi;
3. Incanalare Divinità;
4. Aumento dei Punteggi di Caratteristica;
5. Distruggere Non Morti;
6. Intervento Divino;
7. Competenze Bonus;
8. Colpo Divino;
9. Sudario del Crepuscolo.

## 8. Correzioni dati e incantesimi del Dominio

### Testo di Occhi della Notte

La descrizione sorgente contiene artefatti evidenti (`pi: profonda`, frasi invertite sulla durata). Correggere soltanto il record `chierico-dominio-del-crepuscolo-occhi-della-notte` in `tasha_sottoclassi_database_finale.json`, preservando la regola:

- scurovisione personale 90 m;
- condivisione con azione, entro 3 m, creature consenzienti visibili;
- massimo modificatore Saggezza, minimo una;
- durata 1 ora;
- un uso per riposo lungo oppure slot di qualsiasi livello.

Dopo la correzione aggiornare SHA-256 e dimensione nel relativo report. Non correggere il solo `src/class-features-runtime.json`.

### Riepilogo incantesimi aggiuntivi

Generalizzare il blocco già esistente senza creare un secondo sistema spell:

1. spostare la risoluzione dei dati in una funzione pura di `src/classFeatureCatalog.js` che, dato il profilo e il `classId`, restituisca sottoclasse e incantesimi sbloccati;
2. fare in modo che `initiative-card-modal.js` la usi per ogni feature `*-incantesimi`, non soltanto `paladino-incantesimi`;
3. conservare per Paladino e Chierico la nota `Sempre preparati; non contano nel limite degli incantesimi preparati`;
4. titolo grammaticale `Incantesimi del <nome sottoclasse>` per Dominio e Giuramento, conservando esattamente l'output corrente `Incantesimi del Giuramento di Vendetta`;
5. risolvere i nomi tramite `getSpellDefinition()` come oggi.

In `src/spells-srd.js` aggiungere soltanto gli alias:

- `moonbeam`: `Raggio Lunare` e `Raggio di Luna`;
- `tiny-hut`: `Capanna di Leomund`.

Non duplicare le definizioni di Moonbeam o Tiny Hut.

## 9. File e funzioni da modificare

### Dati

- `data/class-features/tasha_sottoclassi_database_finale.json`: sola descrizione corrotta di Occhi della Notte;
- `data/class-features/tasha_sottoclassi_database_report_finale.json`: hash e byte dopo la correzione;
- `data/class-features/runtime-feature-overrides.json`: 14 override Chierico/Crepuscolo.

### Generazione e catalogo

- `src/classFeatureCatalog.js`: helper puro per incantesimi aggiuntivi della sottoclasse;
- `src/class-features-runtime.json`: solo tramite `npm.cmd run generate:class-features`.

### Runtime

- `src/classFeatureCore.js`, `resolveClassFeatureResourceMaximum()`: formula esatta `bonus_competenza`;
- `src/classFeatureRuntime.js`: primitive daily/slot riusabile e adapter `night-eyes` e `turn-undead`;
- `src/initiative-card-modal.js`: controlli Occhi della Notte, Scacciare Non Morti e riepilogo spell non hardcoded;
- `src/spells-srd.js`: due gruppi alias.

### File che non richiedono modifiche

- `src/classFeatureAuraCore.js`;
- `src/classFeatureAuraController.js`;
- `src/classFeatureAuraReminderCore.js`;
- `src/spellZoneTriggerCore.js`;
- `src/speedCheck.js`;
- `src/initiativeList.js`;
- sistemi HP, condizioni e iniziativa.

## 10. Ordine di implementazione

1. Ricontrollare lo stato del worktree condiviso.
2. Correggere il testo sorgente di Occhi della Notte e il relativo report.
3. Inserire i nove override descrittivi.
4. Aggiungere gli override completi di Benedizione Vigile e Passi nella Notte usando primitive esistenti.
5. Implementare il caso `bonus_competenza` e i relativi test puri.
6. Estrarre la primitive daily/slot mantenendo compatibile Linguaggio Universale; implementare Occhi della Notte.
7. Implementare l'adapter Scacciare Non Morti, compreso il caso senza bersagli.
8. Correggere l'override del Santuario e aggiungere il trigger informativo di fine turno.
9. Generalizzare il riepilogo degli incantesimi aggiuntivi e aggiungere i due alias.
10. Rigenerare catalogo e audit.
11. Eseguire test mirati, suite completa e build.
12. Rigenerare una seconda volta e verificare assenza di diff.

## 11. Rischi di regressione

- Il refactor daily/slot può rompere Linguaggio Universale: conservarne export, adapter, testi e test esistenti.
- La generalizzazione spell può alterare il Giuramento di Vendetta: titolo, nota e dieci nomi devono restare identici.
- Il filtro `all` del Santuario aggiunge pill anche a creature ostili; è intenzionale secondo il testo, ma va verificata la leggibilità in scene affollate.
- `includeCaster: true` insieme a `suppressSourceCardPill: true` deve produrre una sola pill sul Chierico, non zero o due.
- Il trigger di fine turno deve essere informativo e deduplicato una volta per creatura/turno.
- Il pool formula usa il livello totale del personaggio, non soltanto il livello da Chierico.
- Nessun intervento deve entrare nei percorsi fragili di iniziativa o HP.

## 12. Test automatici richiesti

Creare `test/clericTwilightFeatureRuntime.test.js` e coprire almeno:

1. i 7 record base e i 7 del Dominio sono disponibili ai livelli corretti;
2. un Chierico di altro Dominio non riceve capacità del Crepuscolo;
3. i 9 reminder descrittivi sono `not-automated`, senza `effectPlan` e senza quick action;
4. le 5 capacità assistite sono le sole `implemented` del perimetro;
5. Incanalare Divinità risolve massimo 1/2/3 ai livelli 2/6/18 e recuperi breve/lungo;
6. Scacciare Non Morti consuma un uso anche in modalità senza bersagli;
7. la modalità con fallimenti applica pill a più bersagli per 10 round e non tira il TS;
8. Distruggere Non Morti non legge GS, stat block o HP;
9. Occhi della Notte: uso gratuito consuma il pool, slot confermato non lo consuma e nessun percorso scrive slot metadata;
10. Occhi della Notte applica più pill entro 3 m per 600 round e non modifica visione;
11. Benedizione Vigile consente self o un bersaglio e usa expiry manuale;
12. il resolver `bonus_competenza` restituisce 2/3/4/5/6 e usa il livello totale multiclasse;
13. Passi nella Notte crea volo `copyFrom: walk`, dura 10 round e consuma il pool corretto;
14. Santuario consuma Incanalare Divinità, dura 10 round, ha raggio 9 m e membership `all` con caster incluso;
15. il caster riceve una sola pill e l'uscita dall'aura rimuove soltanto la pill di quell'istanza;
16. ogni creatura nell'aura genera una sola notice informativa alla fine del proprio turno;
17. la notice contiene entrambe le scelte ma non muta HP o condizioni;
18. Sudario non crea una seconda aura o una seconda pill;
19. tutti i 10 incantesimi del Dominio risolvono con `getSpellDefinition()`;
20. il riepilogo del Paladino resta invariato;
21. `buildClassFeatureQuickActions()` non include nessuna capacità del perimetro;
22. due generazioni consecutive sono deterministiche.

## 13. Checklist manuale GM / Player in Owlbear Rodeo

### Classe e incantesimi

- [ ] Il Chierico mostra i privilegi base ai livelli corretti.
- [ ] Selezionando Dominio del Crepuscolo compaiono soltanto i suoi 7 privilegi.
- [ ] La carta Incantesimi mostra i 10 incantesimi di Dominio ai livelli 1/3/5/7/9.
- [ ] Raggio Lunare e Capanna di Leomund risolvono nel catalogo spell esistente.
- [ ] Nessuno slot, concentrazione o pill spell viene duplicato dalle Class Feature.

### Scacciare Non Morti

- [ ] Il GM tira i TS al tavolo e seleziona soltanto i fallimenti non distrutti.
- [ ] L'uso consuma esattamente un Incanalare Divinità.
- [ ] La pill dura 1 minuto e ricorda tutte le limitazioni di Scacciato.
- [ ] Dopo danno, la singola pill può essere terminata manualmente.
- [ ] Se non esistono bersagli da marcare, la risorsa viene comunque consumata senza pill.
- [ ] Undo ripristina pool, stato e pill.

### Occhi della Notte

- [ ] Il reminder personale dichiara scurovisione 90 m senza cambiare la visione OBR.
- [ ] Uso gratuito e slot già speso sono distinti.
- [ ] Visibilità, consenso e massimo SAG restano conferme manuali.
- [ ] Le pill sui destinatari durano 1 ora e possono essere terminate singolarmente.

### Benedizione Vigile

- [ ] Senza selezione si applica al Chierico; con un token selezionato si applica a quel token.
- [ ] Nessun tiro o valore di iniziativa viene modificato.
- [ ] Dopo il tiro di iniziativa, il GM rimuove la pill.
- [ ] Prima di riutilizzare la capacità, il GM termina la pill precedente.

### Santuario e Sudario

- [ ] L'aura di 9 m segue il Chierico per 10 round.
- [ ] Chierico, alleati, neutrali e nemici nella sfera ricevono un solo marker di membership.
- [ ] Alla fine del turno di ciascuna creatura compare una sola notice.
- [ ] Il dado 1d6 viene tirato al tavolo e i PF temporanei sono applicati dal normale controllo HP.
- [ ] Affascinato o Spaventato vengono rimossi manualmente soltanto dopo la scelta del Chierico.
- [ ] Incapacità o morte richiedono la terminazione anticipata dell'aura.
- [ ] Dal 17° il reminder limita la mezza copertura al Chierico e ai suoi alleati, senza modificare CA o TS.

### Passi nella Notte

- [ ] L'attivazione avviene soltanto dopo conferma di luce fioca/oscurità.
- [ ] La pill dura 10 round e il profilo movimento offre volo pari al camminare.
- [ ] Il pool coincide col bonus di competenza e recupera al riposo lungo.
- [ ] Scadenza, terminazione e Undo rimuovono correttamente il volo.

## 14. Criteri di accettazione

Il batch è accettato soltanto se:

- tutti i 14 record sono esposti alla classe/sottoclasse e al livello corretti;
- la classificazione finale è 9 descrittive, 5 assistite, 0 automatiche;
- nessun dado viene tirato o interpretato dal plugin;
- Santuario conserva aura/costo/durata ma mostra soltanto reminder informativi;
- i PF temporanei di Santuario non sono applicati automaticamente;
- Scacciare Non Morti non legge tipo, GS o stat block;
- Occhi della Notte non introduce campi vista o inventari slot;
- Benedizione Vigile non tocca iniziativa;
- Passi nella Notte riusa il movimento dichiarativo esistente;
- Sudario non duplica l'aura;
- i 10 incantesimi del Dominio riusano il catalogo spell corrente;
- source JSON, report e artefatto generato restano coerenti;
- non vengono modificati `initiativeList.js`, HP runtime o aura engine;
- test completi, build e doppia generazione terminano con successo.
