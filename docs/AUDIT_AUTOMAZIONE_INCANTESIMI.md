# Audit automazione incantesimi

> **Audit incrementale per feature freeze e source of truth.**
> Mappa i 477 record del catalogo distinguendo stato attuale, stato desiderato,
> esposizione UI, conformità regolamentare e requisiti di smoke test.

## Metodo e sintesi del catalogo

- Catalogo totale: **477** definizioni su 477 record.
- Testi disponibili: **476** / 477.
- Esposti nella console unificata: **392**; disconnessi: **0**; fragili: **1**.
- Definizioni tracciabili: **355**; definizioni con regole d'area: **132**.
- Workflow che richiedono smoke test runtime: **389**.
- Lacune RAW confermate P1: **37**; discrepanze ad alta confidenza P2: **1**.
- Impronta deterministica: `69504d8a361a5611`.

### Livello di automazione attuale (currentAutomationLevel)

| Stato | Totale |
| --- | ---: |
| FULL | 42 |
| MANUAL | 88 |
| PARTIAL | 201 |
| TRACK_ONLY | 146 |

### Stato di copertura (coverageStatus)

| Stato | Totale |
| --- | ---: |
| ACCEPTED | 45 |
| GAP | 39 |
| UNREVIEWED | 393 |

### Livello di automazione target (targetAutomationLevel)

| Stato | Totale |
| --- | ---: |
| FULL | 42 |
| MANUAL | 3 |
| UNREVIEWED | 432 |

### Esposizione UI attuale (currentUiExposure)

| Stato | Totale |
| --- | ---: |
| REFERENCE_ONLY | 85 |
| UNIFIED | 392 |

### Esposizione UI target (targetUiExposure)

| Stato | Totale |
| --- | ---: |
| UNIFIED | 392 |
| UNREVIEWED | 85 |

### Categorie di Smoke Test richieste

| Stato | Totale |
| --- | ---: |
| ACTIVE_ACTION | 33 |
| AREA_GEOMETRY | 132 |
| CAST | 222 |
| CLEANUP | 105 |
| CONCENTRATION | 218 |
| PERSISTENCE | 355 |
| TURN_TRIGGER | 84 |

### Stato di integrazione console unificata

| Stato | Totale |
| --- | ---: |
| fragile | 1 |
| partial | 38 |
| reachable | 353 |
| unexposed | 85 |

### Problemi di integrazione

| Stato | Totale |
| --- | ---: |
| ACTIVE_ACTION_REMINDER_ONLY | 1 |
| CAST_NO_MUTATIONS | 3 |
| UNIFIED_CATALOG_MISSING | 85 |

## Integrazione con la console unificata

Questa sezione segnala workflow con gap di integrazione, azioni non raggiungibili o cast anomali.

| Incantesimo | Console | Cast | Azioni successive | Stato | Problemi |
| --- | --- | --- | --- | --- | --- |
| Alleato planare | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Animare morti | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Artificio druidico | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Bacche benefiche | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Banchetto degli eroi | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Beffa crudele | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Catapulta | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Clone | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Colpo del Vento d'Acciaio | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Comunione con la natura | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Conoscenza delle leggende | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Controincantesimo | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Controllare Fiamme | esposto | spell-lifecycle | nessuna | reachable | il cast non produce alcuna mutazione significativa |
| Creare cibo e acqua | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Creare non morti | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Creare o distruggere acqua | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Creare Omuncolo | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Crescita vegetale | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Cura ferite | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Dardo di Caos | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Dardo di fuoco | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Dardo incantato | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Deflagrazione occulta | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Desiderio | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Disintegrazione | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Disperdere | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Dissolvi magie | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Dito della morte | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Divinazione | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Fabbricare | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Ferire | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Fermare il tempo | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Ferocia Primordiale | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Fiamma sacra | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Fiotto acido | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Flusso di Energia Negativa | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Folata | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Frusta di Spine | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Globo Cromatico | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Guarigione | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Guarigione di massa | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Identificare | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Inaridire | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Infestazione | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Infliggi ferite | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Intimorire infernale | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Lama Verdefiamma | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Lenza Elettrizzante | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Localizza animali o vegetali | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Modellare Acqua | esposto | spell-lifecycle | nessuna | reachable | il cast non produce alcuna mutazione significativa |
| Modellare Terra | esposto | spell-lifecycle | nessuna | reachable | il cast non produce alcuna mutazione significativa |
| Ossa della Terra | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Parola del Potere Guarire | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Parola del potere uccidere | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Parola del ritiro | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Parola guaritrice | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Parola guaritrice di massa | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Porta dimensionale | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Preghiera di guarigione | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Presagio | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Purificare cibo e bevande | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Raggio rovente | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Regressione mentale | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Reincarnazione | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Resurrezione | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Resurrezione pura | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Rianimare morti | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Rimuovi maledizione | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Rinascita | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Rintocco dei Morti | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Riparare | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Ristorare inferiore | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Ristorare superiore | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Risveglio | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Salvare i morenti | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Scassinare | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Scolpire pietra | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Scopri trappole | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Scrigno segreto | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Sfera della Tempesta | esposto | area-transaction | reminder-only: storm-sphere-lightning | fragile | azioni raggiungibili soltanto tramite reminder, senza fallback nella scheda attiva |
| Spostamento planare | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Spruzzo velenoso | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Stretta folgorante | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Sussurri Dissonanti | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Teletrasporto | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Trasferimento di Vita | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Trova cavalcatura | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Trova Cavalcatura Superiore | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Trova famiglio | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |

## P1 — lacune confermate sul testo RAW

| Incantesimo | Fonte | Lacune | Evidenza/valutazione |
| --- | --- | --- | --- |
| Aura di Vita | PHB 2014 | effetti passivi dell'aura incompleti; effetto ricorrente di turno assente | Servono resistenza necrotica, protezione del massimo PF e recupero di 1 PF a inizio turno per creature non ostili a 0 PF. |
| Aura di Vitalità | PHB 2014 | azione di cura entro l'aura assente | L'aura deve delimitare i bersagli validi dell'azione bonus di cura da 2d6. |
| Aura sacra | SRD 5.1 | trigger condizionale durante la durata assente; condizione o stato RAW non rappresentato | Ogni colpo in mischia di immondo o non morto contro un protetto innesca un TS Costituzione che può applicare Accecato fino al termine della spell. |
| Carne in pietra | SRD 5.1 | stato di successi/fallimenti multipli assente; condizione o stato RAW non rappresentato | Richiede Trattenuto iniziale, conteggio indipendente di tre successi o fallimenti e transizione a Pietrificato permanente dopo concentrazione completa. |
| Compulsione | SRD 5.1 | azione ripetibile della spell assente; meccanica di movimento assente | Il TS iniziale è coperto; manca la direzione scelta dal caster con azione bonus a ogni turno e il movimento obbligato dei bersagli prima del loro normale movimento. |
| Contagio | SRD 5.1 | stato di successi/fallimenti multipli assente; trigger condizionale durante la durata assente | Occorrono conteggio 3 successi/3 fallimenti, sei malattie alternative e trigger specifici come Stordito quando il bersaglio subisce danni. |
| Corona di Stelle | Xanathar | contatore o risorsa interna della spell assente; azione ripetibile della spell assente | La spell parte con sette scintille, ne consuma una per azione bonus e termina alla settima; anche la luce dipende dal residuo. |
| Debilitazione | Xanathar | azione ripetibile della spell assente; trigger condizionale durante la durata assente | Dopo il fallimento iniziale, ogni azione del caster ripete automaticamente i danni e cura la metà; altre azioni, gittata o copertura terminano la spell. |
| Dominare bestie | SRD 5.1 | azione ripetibile della spell assente; trigger condizionale durante la durata assente | Affascinato e TS iniziale sono coperti; mancano il controllo preciso tramite azione e il nuovo TS Saggezza ogni volta che il bersaglio subisce danni. |
| Dominare mostri | SRD 5.1 | azione ripetibile della spell assente; trigger condizionale durante la durata assente | Affascinato e TS iniziale sono coperti; mancano il controllo preciso tramite azione e il nuovo TS Saggezza ogni volta che il bersaglio subisce danni. |
| Dominare persona | SRD 5.1 | azione ripetibile della spell assente; trigger condizionale durante la durata assente | Affascinato e TS iniziale sono coperti; mancano il controllo preciso tramite azione e il nuovo TS Saggezza ogni volta che il bersaglio subisce danni. |
| Forme animali | SRD 5.1 | azione ripetibile della spell assente; varianti rilevanti non modellate | Manca l'azione dei turni successivi che cambia nuovamente, anche in modo diverso per ciascun bersaglio, le forme e i blocchi statistiche associati. |
| Frecce Infuocate | Xanathar | contatore o risorsa interna della spell assente; trigger condizionale durante la durata assente | Servono il contatore condiviso delle dodici munizioni e il consumo dell'effetto al primo colpo o mancato di ogni freccia estratta. |
| Fuorviare | SRD 5.1 | condizione o stato RAW non rappresentato; azione ripetibile della spell assente | Mancano Invisibile sul caster, l'entità illusoria mobile e le azioni successive per muoverla e alternare l'uso dei sensi. |
| Gabbia dell'Anima | Xanathar | contatore o risorsa interna della spell assente; azione ripetibile della spell assente | L'anima dispone di sei usi condivisi tra più azioni con durate e conseguenze differenti; il registro non espone il contatore né le opzioni. |
| Guscio anti-vita | SRD 5.1 | barriera e interruzione al contatto non risolte; attraversamento continuo non rilevato | L'aura segue il caster, ma il confine deve respingere categorie selettive e terminare se il caster forza un attraversamento. |
| Interdizione Primordiale | Xanathar | trigger condizionale durante la durata assente; conseguenza alla fine della spell assente | Una reazione al danno trasforma tutte le resistenze nell'immunità al tipo scelto fino alla fine del turno successivo. |
| Intermittenza | SRD 5.1 | stato casuale ricorrente di turno assente; conseguenza alla fine della spell assente | Richiede d20 a ogni fine turno, stato sul Piano Etereo e rientro all'inizio del turno successivo o alla terminazione. |
| Inversione della gravità | SRD 5.1 | ingresso, sospensione e caduta finale non risolti; trigger spaziali o di turno assenti | La geometria non basta: servono salita, collisione, sospensione e caduta coordinata quando termina la spell. |
| Investitura del Vento | Xanathar | azione ripetibile della spell assente; conseguenza alla fine della spell assente | La velocità di volo è modellabile, ma mancano il cubo offensivo ripetibile e la caduta se la spell termina mentre il caster è in volo. |
| Investitura della Pietra | Xanathar | azione ripetibile della spell assente; eccezioni e immunità ai costi di movimento assenti; conseguenza alla fine della spell assente | Servono terremoto ripetibile, immunità al costo del terreno difficile, attraversamento della pietra ed espulsione con Stordito se il movimento termina al suo interno. |
| Lama d'Ombra | Xanathar | azione ripetibile della spell assente | La spell non espone l'arma creata né l'azione bonus che la fa ricomparire nella mano dopo che è stata lasciata cadere o lanciata. |
| Lama infuocata | SRD 5.1 | azione ripetibile della spell assente | La durata è tracciata, ma non esiste l'azione ripetibile per effettuare gli attacchi in mischia con la lama creata. |
| Muro d'Acqua | Xanathar | meccanica di movimento assente; trigger condizionale durante la durata assente | La parete non applica terreno difficile né le interazioni contestuali con attacchi a distanza, danni da fuoco e congelamento locale da freddo. |
| Muro di Luce | Xanathar | contatore o risorsa interna della spell assente; azione ripetibile della spell assente; effetto ricorrente di turno assente | Ogni raggio usa un'azione e accorcia il muro di 3 m; restano inoltre danno a fine turno e TS ricorrente contro Accecato. |
| Muro di vento | SRD 5.1 | vincoli a proiettili e attraversamento assenti; attraversamento continuo non rilevato | La sagoma esiste; mancano blocco selettivo di creature/oggetti, proiettili e forme gassose. |
| Muro prismatico | SRD 5.1 | strati distruttibili e stato per strato assenti; attraversamento continuo non rilevato; sequenza di più TS e uscita dalla condizione incompleta | La sagoma base esiste, ma i sette strati, le distruzioni progressive, gli effetti per strato e le sequenze di TS non hanno uno stato dedicato. |
| Palla di fuoco ritardata | SRD 5.1 | detonazione e accumulo alla terminazione assenti; contatore o risorsa interna della spell assente; trigger condizionale durante la durata assente | La sfera accumula 1d6 a fine turno, esplode alla terminazione o al contatto e può essere lanciata altrove dopo un TS riuscito. |
| Parlare con i vegetali | SRD 5.1 | meccanica di movimento assente; varianti rilevanti non modellate | L'aura è presente, ma manca la scelta di rendere normale o difficile il terreno vegetale e il relativo collegamento allo Speed Tracker. |
| Punizione marchiante | SRD 5.1 | trigger condizionale durante la durata assente; regole passive e limitazioni della spell incomplete | Manca la risoluzione sul prossimo colpo: danni radiosi, rivelazione di un bersaglio invisibile e blocco di nuova invisibilità fino alla fine della spell. |
| Spruzzo prismatico | SRD 5.1 | esito casuale e relativo stato non rappresentati; sequenza di più TS e uscita dalla condizione incompleta; condizione o stato RAW non rappresentato | La sagoma e il primo TS esistono, ma non il d8 per ciascun bersaglio, il doppio raggio con 8, i TS successivi e gli stati Accecato, Trattenuto e Pietrificato. |
| Sudario Spirituale | Tasha | trigger condizionale durante la durata assente; meccanica di movimento assente; effetto ricorrente di turno assente | Ogni bersaglio colpito riceve blocco cure e, se scelto vicino al caster, -3 m fino all'inizio del turno successivo; il trigger nasce dal colpo. |
| Telecinesi | SRD 5.1 | azione ripetibile della spell assente; condizione o stato RAW non rappresentato | Ogni round può cambiare bersaglio o ripetere la contesa; una creatura sollevata resta Trattenuta fino al termine del turno successivo. |
| Tempesta di vendetta | SRD 5.1 | progressione degli effetti per round assente; condizione o stato RAW non rappresentato; meccanica di movimento assente | L'area esiste, ma i round 1-10 cambiano danni, TS, Assordato, terreno difficile e oscuramento. |
| Trasformazione | SRD 5.1 | azione ripetibile della spell assente; varianti rilevanti non modellate | Mancano la forma e i PF correnti come stato dell'istanza e l'azione che sostituisce la forma nei turni successivi rispettando i limiti RAW. |
| Trasmutare Roccia | Xanathar | varianti della zona e relativi trigger incomplete; meccanica di movimento assente; trigger spaziali o di turno assenti | Le due trasformazioni richiedono varianti distinte, costo 4x nel fango, TS al lancio/ingresso/fine turno e uscita o distruzione della roccia. |
| Turbine | Xanathar | movimento manuale della zona non risolto; sequenza di più TS e uscita dalla condizione incompleta; ingresso, sospensione e caduta finale non risolti | Servono zona mobile, doppio TS, trascinamento verticale, movimento con la zona, prova di fuga e caduta finale. |

## P2 — discrepanze ad alta confidenza

| Incantesimo | Fonte | Lacune | Evidenza/valutazione |
| --- | --- | --- | --- |
| Manto del Crociato | Legacy | testo regolamentare locale mancante | Segnalazione strutturale senza estratto testuale breve. |

## P3 — candidate da revisionare

Nessuna voce.

## Matrice completa (477 incantesimi)

| Incantesimo | ID | Fonte/Liv. | Livello Attuale | Copertura | Livello Target | Esposizione UI | Integrazione | Priorità | Lacune |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Abilità Potenziata | `xanathar-abilita-potenziata` | Xanathar / 5 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Abito Ultraterreno di Tasha | `tasha-abito-ultraterreno-di-tasha` | Tasha / 6 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Aculeo Mentale | `xanathar-aculeo-mentale` | Xanathar / 2 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Aiuto | `aid` | SRD 5.1 / 2 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Alba | `xanathar-alba` | Xanathar / 5 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Allarme | `alarm` | SRD 5.1 / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Alleato planare | `planar-ally` | SRD 5.1 / 6 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Allucinazione di Forza | `phb2014-allucinazione-di-forza` | PHB 2014 / 2 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Allucinazione mortale | `phantasmal-killer` | SRD 5.1 / 4 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Alterare sé stesso | `alter-self` | SRD 5.1 / 2 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Amicizia | `phb2014-amicizia` | PHB 2014 / 0 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Amicizia con gli animali | `animal-friendship` | SRD 5.1 / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Anatema | `bane` | SRD 5.1 / 1 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Anatema Elementale | `xanathar-anatema-elementale` | Xanathar / 4 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Animale messaggero | `animal-messenger` | SRD 5.1 / 2 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Animare morti | `animate-dead` | SRD 5.1 / 3 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Animare oggetti | `animate-objects` | SRD 5.1 / 5 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Anti-individuazione | `nondetection` | SRD 5.1 / 3 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Antipatia/simpatia | `antipathy-sympathy` | SRD 5.1 / 8 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Arma Elementale | `phb2014-arma-elementale` | PHB 2014 / 3 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Arma magica | `magic-weapon` | SRD 5.1 / 2 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Arma Sacra | `xanathar-arma-sacra` | Xanathar / 5 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Arma spirituale | `spiritual-weapon` | SRD 5.1 / 2 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Armatura di Agathys | `phb2014-armatura-di-agathys` | PHB 2014 / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Armatura magica | `mage-armor` | SRD 5.1 / 1 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Artificio druidico | `druidcraft` | SRD 5.1 / 0 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Assorbire Elementi | `xanathar-assorbire-elementi` | Xanathar / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Aura di Purezza | `phb2014-aura-di-purezza` | PHB 2014 / 4 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Aura di Vita | `phb2014-aura-di-vita` | PHB 2014 / 4 | PARTIAL | GAP | UNREVIEWED | UNIFIED | partial | P1 | effetti passivi dell'aura incompleti; effetto ricorrente di turno assente |
| Aura di Vitalità | `phb2014-aura-di-vitalita` | PHB 2014 / 3 | PARTIAL | GAP | UNREVIEWED | UNIFIED | partial | P1 | azione di cura entro l'aura assente |
| Aura magica dell'arcanista | `arcanists-magic-aura` | SRD 5.1 / 2 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Aura sacra | `holy-aura` | SRD 5.1 / 8 | PARTIAL | GAP | UNREVIEWED | UNIFIED | partial | P1 | trigger condizionale durante la durata assente; condizione o stato RAW non rappresentato |
| Bacche benefiche | `goodberry` | SRD 5.1 / 1 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Bagliore lunare | `moonbeam` | SRD 5.1 / 2 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Bagliore solare | `sunbeam` | SRD 5.1 / 6 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Banchetto degli eroi | `heroes-feast` | SRD 5.1 / 6 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Barriera di lame | `blade-barrier` | SRD 5.1 / 6 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Beffa crudele | `vicious-mockery` | SRD 5.1 / 0 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Benedizione | `bless` | SRD 5.1 / 1 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Blocca mostri | `hold-monster` | SRD 5.1 / 5 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Blocca persone | `hold-person` | SRD 5.1 / 2 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Bocca magica | `magic-mouth` | SRD 5.1 / 2 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Boschetto Druidico | `xanathar-boschetto-druidico` | Xanathar / 6 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Braccia di Hadar | `phb2014-braccia-di-hadar` | PHB 2014 / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Caduta morbida | `feather-fall` | SRD 5.1 / 1 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Calmare emozioni | `calm-emotions` | SRD 5.1 / 2 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Camminare nel vento | `wind-walk` | SRD 5.1 / 6 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Camminare sull'acqua | `water-walk` | SRD 5.1 / 3 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Campo anti-magia | `antimagic-field` | SRD 5.1 / 8 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Camuffare se stesso | `disguise-self` | SRD 5.1 / 1 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Capanna | `tiny-hut` | SRD 5.1 / 3 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Caratteristica potenziata | `enhance-ability` | SRD 5.1 / 2 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Carne in pietra | `flesh-to-stone` | SRD 5.1 / 6 | PARTIAL | GAP | UNREVIEWED | UNIFIED | partial | P1 | stato di successi/fallimenti multipli assente; condizione o stato RAW non rappresentato |
| Catapulta | `xanathar-catapulta` | Xanathar / 1 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Catena di fulmini | `chain-lightning` | SRD 5.1 / 6 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Cecità/sordità | `blindness-deafness` | SRD 5.1 / 2 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Celare | `sequester` | SRD 5.1 / 7 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Cerchio di morte | `circle-of-death` | SRD 5.1 / 6 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Cerchio di Potere | `phb2014-cerchio-di-potere` | PHB 2014 / 5 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Cerchio di teletrasporto | `teleportation-circle` | SRD 5.1 / 5 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Cerchio magico | `magic-circle` | SRD 5.1 / 3 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Cerimonia | `xanathar-cerimonia` | Xanathar / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Charme su persone | `charm-person` | SRD 5.1 / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Charme sui Mostri | `xanathar-charme-sui-mostri` | Xanathar / 4 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Chiaroveggenza | `clairvoyance` | SRD 5.1 / 3 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Clone | `clone` | SRD 5.1 / 8 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Collera della Natura | `xanathar-collera-della-natura` | Xanathar / 5 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Colpo accurato | `true-strike` | SRD 5.1 / 0 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Colpo del Vento d'Acciaio | `xanathar-colpo-del-vento-dacciaio` | Xanathar / 5 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Colpo dello Zefiro | `xanathar-colpo-dello-zefiro` | Xanathar / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Colpo infuocato | `flame-strike` | SRD 5.1 / 5 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Colpo Intrappolante | `phb2014-colpo-intrappolante` | PHB 2014 / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Coltello di Ghiaccio | `xanathar-coltello-di-ghiaccio` | Xanathar / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Comando | `command` | SRD 5.1 / 1 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Comprensione dei linguaggi | `comprehend-languages` | SRD 5.1 / 1 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Compulsione | `compulsion` | SRD 5.1 / 4 | PARTIAL | GAP | UNREVIEWED | UNIFIED | partial | P1 | azione ripetibile della spell assente; meccanica di movimento assente |
| Comunione | `commune` | SRD 5.1 / 5 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Comunione con la natura | `commune-with-nature` | SRD 5.1 / 5 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Confusione | `confusion` | SRD 5.1 / 4 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Cono di freddo | `cone-of-cold` | SRD 5.1 / 5 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Conoscenza delle leggende | `legend-lore` | SRD 5.1 / 5 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Contagio | `contagion` | SRD 5.1 / 5 | TRACK_ONLY | GAP | UNREVIEWED | UNIFIED | partial | P1 | stato di successi/fallimenti multipli assente; trigger condizionale durante la durata assente |
| Contattare altri piani | `contact-other-plane` | SRD 5.1 / 5 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Contingenza | `contingency` | SRD 5.1 / 6 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Controincantesimo | `counterspell` | SRD 5.1 / 3 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Controllare acqua | `control-water` | SRD 5.1 / 4 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Controllare Fiamme | `xanathar-controllare-fiamme` | Xanathar / 0 | MANUAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Controllare tempo atmosferico | `control-weather` | SRD 5.1 / 8 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Controllare Venti | `xanathar-controllare-venti` | Xanathar / 5 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Cordone di Frecce | `phb2014-cordone-di-frecce` | PHB 2014 / 2 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Corona di Follia | `phb2014-corona-di-follia` | PHB 2014 / 2 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Corona di Stelle | `xanathar-corona-di-stelle` | Xanathar / 7 | PARTIAL | GAP | UNREVIEWED | UNIFIED | partial | P1 | contatore o risorsa interna della spell assente; azione ripetibile della spell assente |
| Costrizione | `geas` | SRD 5.1 / 5 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Creare cibo e acqua | `create-food-and-water` | SRD 5.1 / 3 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Creare Falò | `xanathar-creare-falo` | Xanathar / 0 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Creare non morti | `create-undead` | SRD 5.1 / 6 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Creare o distruggere acqua | `create-or-destroy-water` | SRD 5.1 / 1 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Creare Omuncolo | `xanathar-creare-omuncolo` | Xanathar / 6 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Creazione | `creation` | SRD 5.1 / 5 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Crescita di spine | `spike-growth` | SRD 5.1 / 2 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Crescita vegetale | `plant-growth` | SRD 5.1 / 3 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Cura ferite | `cure-wounds` | SRD 5.1 / 1 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Cura ferite di massa | `mass-cure-wounds` | SRD 5.1 / 5 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Danza irresistibile | `irresistible-dance` | SRD 5.1 / 6 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Danza Macabra | `xanathar-danza-macabra` | Xanathar / 5 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Dardo di Caos | `xanathar-dardo-di-caos` | Xanathar / 1 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Dardo di fuoco | `fire-bolt` | SRD 5.1 / 0 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Dardo incantato | `magic-missile` | SRD 5.1 / 1 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Dardo Stregato | `phb2014-dardo-stregato` | PHB 2014 / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Dardo tracciante | `guiding-bolt` | SRD 5.1 / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Debilitazione | `xanathar-debilitazione` | Xanathar / 5 | PARTIAL | GAP | UNREVIEWED | UNIFIED | partial | P1 | azione ripetibile della spell assente; trigger condizionale durante la durata assente |
| Deflagrazione occulta | `eldritch-blast` | SRD 5.1 / 0 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Desiderio | `wish` | SRD 5.1 / 9 | MANUAL | ACCEPTED | MANUAL | REFERENCE_ONLY | unexposed | — | — |
| Destriero fantomatico | `phantom-steed` | SRD 5.1 / 3 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Diavoletto di Polvere | `xanathar-diavoletto-di-polvere` | Xanathar / 2 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Disco fluttuante | `floating-disk` | SRD 5.1 / 1 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Disintegrazione | `disintegrate` | SRD 5.1 / 6 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Disperdere | `xanathar-disperdere` | Xanathar / 6 | MANUAL | ACCEPTED | MANUAL | REFERENCE_ONLY | unexposed | — | — |
| Dissolvi il bene e il male | `dispel-evil-and-good` | SRD 5.1 / 5 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Dissolvi magie | `dispel-magic` | SRD 5.1 / 3 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Dito della morte | `finger-of-death` | SRD 5.1 / 7 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Divinazione | `divination` | SRD 5.1 / 4 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Dominare bestie | `dominate-beast` | SRD 5.1 / 4 | PARTIAL | GAP | UNREVIEWED | UNIFIED | partial | P1 | azione ripetibile della spell assente; trigger condizionale durante la durata assente |
| Dominare mostri | `dominate-monster` | SRD 5.1 / 8 | PARTIAL | GAP | UNREVIEWED | UNIFIED | partial | P1 | azione ripetibile della spell assente; trigger condizionale durante la durata assente |
| Dominare persona | `dominate-person` | SRD 5.1 / 5 | PARTIAL | GAP | UNREVIEWED | UNIFIED | partial | P1 | azione ripetibile della spell assente; trigger condizionale durante la durata assente |
| Drago Illusorio | `xanathar-drago-illusorio` | Xanathar / 8 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Duello Obbligato | `phb2014-duello-obbligato` | PHB 2014 / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Eroismo | `heroism` | SRD 5.1 / 1 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Eruzione Terrestre | `xanathar-eruzione-terrestre` | Xanathar / 3 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Esilio | `banishment` | SRD 5.1 / 4 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Esplosione solare | `sunburst` | SRD 5.1 / 8 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Estasiare | `enthrall` | SRD 5.1 / 2 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Evoca Aberrazione | `tasha-evoca-aberrazione` | Tasha / 4 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Evoca animali | `conjure-animals` | SRD 5.1 / 3 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Evoca Bestia d'Ombra | `tasha-evoca-bestia-dombra` | Tasha / 3 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Evoca celestiale | `conjure-celestial` | SRD 5.1 / 7 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Evoca Celestiale | `tasha-evoca-celestiale` | Tasha / 5 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Evoca Costrutto | `tasha-evoca-costrutto` | Tasha / 4 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Evoca creature boschive | `conjure-woodland-beings` | SRD 5.1 / 4 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Evoca Demone Maggiore | `xanathar-evoca-demone-maggiore` | Xanathar / 4 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Evoca Demoni Minori | `xanathar-evoca-demoni-minori` | Xanathar / 3 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Evoca elementale | `conjure-elemental` | SRD 5.1 / 5 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Evoca Elementale | `tasha-evoca-elementale` | Tasha / 4 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Evoca elementali minori | `conjure-minor-elementals` | SRD 5.1 / 4 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Evoca folletto | `conjure-fey` | SRD 5.1 / 6 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Evoca Folletto | `tasha-evoca-folletto` | Tasha / 3 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Evoca Immondo | `tasha-evoca-immondo` | Tasha / 6 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Evoca Non Morto | `tasha-evoca-non-morto` | Tasha / 3 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Evoca Pioggia di Armi | `phb2014-evoca-pioggia-di-armi` | PHB 2014 / 5 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Evoca Raffica | `phb2014-evoca-raffica` | PHB 2014 / 3 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Evocare Bestia | `tasha-evocare-bestia` | Tasha / 2 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Evocazione istantanea | `instant-summons` | SRD 5.1 / 6 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Fabbricare | `fabricate` | SRD 5.1 / 4 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Fame di Hadar | `phb2014-fame-di-hadar` | PHB 2014 / 3 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Faretra Rapida | `phb2014-faretra-rapida` | PHB 2014 / 5 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Faro di speranza | `beacon-of-hope` | SRD 5.1 / 3 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Fatale | `weird` | SRD 5.1 / 9 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Favore divino | `divine-favor` | SRD 5.1 / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Ferire | `harm` | SRD 5.1 / 6 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Fermare il tempo | `time-stop` | SRD 5.1 / 9 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Ferocia Primordiale | `xanathar-ferocia-primordiale` | Xanathar / 0 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Fiamma perenne | `continual-flame` | SRD 5.1 / 2 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Fiamma sacra | `sacred-flame` | SRD 5.1 / 0 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Fiotto acido | `acid-splash` | SRD 5.1 / 0 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Flusso di Energia Negativa | `xanathar-flusso-di-energia-negativa` | Xanathar / 5 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Folata | `xanathar-folata` | Xanathar / 0 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Folata di vento | `gust-of-wind` | SRD 5.1 / 2 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Fondersi nella pietra | `meld-into-stone` | SRD 5.1 / 3 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Forma eterea | `etherealness` | SRD 5.1 / 7 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Forma gassosa | `gaseous-form` | SRD 5.1 / 3 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Forme animali | `animal-shapes` | SRD 5.1 / 8 | TRACK_ONLY | GAP | UNREVIEWED | UNIFIED | partial | P1 | azione ripetibile della spell assente; varianti rilevanti non modellate |
| Fortezza della Mente | `tasha-fortezza-della-mente` | Tasha / 3 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Fortezza Possente | `xanathar-fortezza-possente` | Xanathar / 8 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Frantumare | `shatter` | SRD 5.1 / 2 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Frecce Infuocate | `xanathar-frecce-infuocate` | Xanathar / 3 | TRACK_ONLY | GAP | UNREVIEWED | UNIFIED | partial | P1 | contatore o risorsa interna della spell assente; trigger condizionale durante la durata assente |
| Freccia acida | `acid-arrow` | SRD 5.1 / 2 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Freccia Folgorante | `phb2014-freccia-folgorante` | PHB 2014 / 3 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Frusta di Spine | `phb2014-frusta-di-spine` | PHB 2014 / 0 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Fulgore Nauseante | `xanathar-fulgore-nauseante` | Xanathar / 4 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Fulmine | `lightning-bolt` | SRD 5.1 / 3 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Fuorviare | `mislead` | SRD 5.1 / 5 | TRACK_ONLY | GAP | UNREVIEWED | UNIFIED | partial | P1 | condizione o stato RAW non rappresentato; azione ripetibile della spell assente |
| Gabbia dell'Anima | `xanathar-gabbia-dellanima` | Xanathar / 6 | TRACK_ONLY | GAP | UNREVIEWED | UNIFIED | partial | P1 | contatore o risorsa interna della spell assente; azione ripetibile della spell assente |
| Gabbia di forza | `forcecage` | SRD 5.1 / 7 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Giara magica | `magic-jar` | SRD 5.1 / 6 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Glifo di interdizione | `glyph-of-warding` | SRD 5.1 / 3 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Globo Cromatico | `phb2014-globo-cromatico` | PHB 2014 / 1 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Globo di invulnerabilità | `globe-of-invulnerability` | SRD 5.1 / 6 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Guardiani spirituali | `spirit-guardians` | SRD 5.1 / 3 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Guardiano della fede | `guardian-of-faith` | SRD 5.1 / 4 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Guardiano della Natura | `xanathar-guardiano-della-natura` | Xanathar / 4 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Guarigione | `heal` | SRD 5.1 / 6 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Guarigione di massa | `mass-heal` | SRD 5.1 / 9 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Guida | `guidance` | SRD 5.1 / 0 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Guscio anti-vita | `antilife-shell` | SRD 5.1 / 5 | PARTIAL | GAP | UNREVIEWED | UNIFIED | partial | P1 | barriera e interruzione al contatto non risolte; attraversamento continuo non rilevato |
| Identificare | `identify` | SRD 5.1 / 1 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Illusione minore | `minor-illusion` | SRD 5.1 / 0 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Illusione programmata | `programmed-illusion` | SRD 5.1 / 6 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Immagine maggiore | `major-image` | SRD 5.1 / 3 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Immagine proiettata | `project-image` | SRD 5.1 / 7 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Immagine silenziosa | `silent-image` | SRD 5.1 / 1 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Immagine speculare | `mirror-image` | SRD 5.1 / 2 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Immolazione | `xanathar-immolazione` | Xanathar / 5 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Imprigionare | `imprisonment` | SRD 5.1 / 9 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Inaridire | `blight` | SRD 5.1 / 4 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Incuti Paura | `xanathar-incuti-paura` | Xanathar / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Individuazione dei pensieri | `detect-thoughts` | SRD 5.1 / 2 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Individuazione del bene e del male | `detect-evil-and-good` | SRD 5.1 / 1 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Individuazione del magico | `detect-magic` | SRD 5.1 / 1 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Individuazione delle malattie e dei veleni | `detect-poison-and-disease` | SRD 5.1 / 1 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Infestazione | `xanathar-infestazione` | Xanathar / 0 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Infliggi ferite | `inflict-wounds` | SRD 5.1 / 1 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Ingrandire/ridurre | `enlarge-reduce` | SRD 5.1 / 2 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Insetto gigante | `giant-insect` | SRD 5.1 / 4 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Interdizione alla morte | `death-ward` | SRD 5.1 / 4 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Interdizione alle Lame | `phb2014-interdizione-alle-lame` | PHB 2014 / 0 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Interdizione Primordiale | `xanathar-interdizione-primordiale` | Xanathar / 6 | PARTIAL | GAP | UNREVIEWED | UNIFIED | partial | P1 | trigger condizionale durante la durata assente; conseguenza alla fine della spell assente |
| Intermittenza | `blink` | SRD 5.1 / 3 | TRACK_ONLY | GAP | UNREVIEWED | UNIFIED | partial | P1 | stato casuale ricorrente di turno assente; conseguenza alla fine della spell assente |
| Intimorire infernale | `hellish-rebuke` | SRD 5.1 / 1 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Intralciare | `entangle` | SRD 5.1 / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Inversione della gravità | `reverse-gravity` | SRD 5.1 / 7 | PARTIAL | GAP | UNREVIEWED | UNIFIED | partial | P1 | ingresso, sospensione e caduta finale non risolti; trigger spaziali o di turno assenti |
| Investitura del Ghiaccio | `xanathar-investitura-del-ghiaccio` | Xanathar / 6 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Investitura del Vento | `xanathar-investitura-del-vento` | Xanathar / 6 | PARTIAL | GAP | UNREVIEWED | UNIFIED | partial | P1 | azione ripetibile della spell assente; conseguenza alla fine della spell assente |
| Investitura della Fiamma | `xanathar-investitura-della-fiamma` | Xanathar / 6 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Investitura della Pietra | `xanathar-investitura-della-pietra` | Xanathar / 6 | PARTIAL | GAP | UNREVIEWED | UNIFIED | partial | P1 | azione ripetibile della spell assente; eccezioni e immunità ai costi di movimento assenti; conseguenza alla fine della spell assente |
| Inviare | `sending` | SRD 5.1 / 3 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Invisibilità | `invisibility` | SRD 5.1 / 2 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Invisibilità superiore | `greater-invisibility` | SRD 5.1 / 4 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Invocare il fulmine | `call-lightning` | SRD 5.1 / 3 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Invulnerabilità | `xanathar-invulnerabilita` | Xanathar / 9 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Labirinto | `maze` | SRD 5.1 / 8 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Lama d'Ombra | `xanathar-lama-dombra` | Xanathar / 2 | TRACK_ONLY | GAP | UNREVIEWED | UNIFIED | partial | P1 | azione ripetibile della spell assente |
| Lama del Disastro | `tasha-lama-del-disastro` | Tasha / 9 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Lama infuocata | `flame-blade` | SRD 5.1 / 2 | PARTIAL | GAP | UNREVIEWED | UNIFIED | partial | P1 | azione ripetibile della spell assente |
| Lama Roboante | `tasha-lama-roboante` | Tasha / 0 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Lama Verdefiamma | `tasha-lama-verdefiamma` | Tasha / 0 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Legame con le Bestie | `xanathar-legame-con-le-bestie` | Xanathar / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Legame planare | `planar-binding` | SRD 5.1 / 5 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Legame telepatico | `telepathic-bond` | SRD 5.1 / 5 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Lentezza | `slow` | SRD 5.1 / 3 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Lenza Elettrizzante | `tasha-lenza-elettrizzante` | Tasha / 0 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Levitazione | `levitate` | SRD 5.1 / 2 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Libertà di movimento | `freedom-of-movement` | SRD 5.1 / 4 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Linguaggi | `tongues` | SRD 5.1 / 3 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Localizza animali o vegetali | `locate-animals-or-plants` | SRD 5.1 / 2 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Localizza creatura | `locate-creature` | SRD 5.1 / 4 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Localizza oggetto | `locate-object` | SRD 5.1 / 2 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Loquacità | `glibness` | SRD 5.1 / 8 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Luce | `light` | SRD 5.1 / 0 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Luce diurna | `daylight` | SRD 5.1 / 3 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Luci danzanti | `dancing-lights` | SRD 5.1 / 0 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Luminescenza | `faerie-fire` | SRD 5.1 / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Maelstrom | `xanathar-maelstrom` | Xanathar / 5 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Mani brucianti | `burning-hands` | SRD 5.1 / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Mano arcana | `arcane-hand` | SRD 5.1 / 5 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Mano magica | `mage-hand` | SRD 5.1 / 0 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Manto del Crociato | `legacy-crusaders-mantle` | Legacy / 3 | TRACK_ONLY | GAP | UNREVIEWED | UNIFIED | partial | P2 | testo regolamentare locale mancante |
| Marchio del cacciatore | `hunters-mark` | SRD 5.1 / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Messaggio | `message` | SRD 5.1 / 0 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Metamorfosi | `polymorph` | SRD 5.1 / 4 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Metamorfosi di Massa | `xanathar-metamorfosi-di-massa` | Xanathar / 9 | TRACK_ONLY | ACCEPTED | MANUAL | UNIFIED | reachable | — | — |
| Metamorfosi pura | `true-polymorph` | SRD 5.1 / 9 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Minuscole Meteore di Melf | `xanathar-minuscole-meteore-di-melf` | Xanathar / 3 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Miraggio arcano | `mirage-arcane` | SRD 5.1 / 7 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Miscela Caustica di Tasha | `tasha-miscela-caustica-di-tasha` | Tasha / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Modellare Acqua | `xanathar-modellare-acqua` | Xanathar / 0 | MANUAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Modellare Terra | `xanathar-modellare-terra` | Xanathar / 0 | MANUAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Modificare memoria | `modify-memory` | SRD 5.1 / 5 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Morsa del Gelo | `xanathar-morsa-del-gelo` | Xanathar / 0 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Morte Apparente | `phb2014-morte-apparente` | PHB 2014 / 3 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Movimenti del ragno | `spider-climb` | SRD 5.1 / 2 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Muovere il terreno | `move-earth` | SRD 5.1 / 6 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Muro d'Acqua | `xanathar-muro-dacqua` | Xanathar / 3 | TRACK_ONLY | GAP | UNREVIEWED | UNIFIED | partial | P1 | meccanica di movimento assente; trigger condizionale durante la durata assente |
| Muro di forza | `wall-of-force` | SRD 5.1 / 5 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Muro di fuoco | `wall-of-fire` | SRD 5.1 / 4 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Muro di ghiaccio | `wall-of-ice` | SRD 5.1 / 6 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Muro di Luce | `xanathar-muro-di-luce` | Xanathar / 5 | PARTIAL | GAP | UNREVIEWED | UNIFIED | partial | P1 | contatore o risorsa interna della spell assente; azione ripetibile della spell assente; effetto ricorrente di turno assente |
| Muro di pietra | `wall-of-stone` | SRD 5.1 / 5 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Muro di Sabbia | `xanathar-muro-di-sabbia` | Xanathar / 3 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Muro di spine | `wall-of-thorns` | SRD 5.1 / 6 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Muro di vento | `wind-wall` | SRD 5.1 / 3 | PARTIAL | GAP | UNREVIEWED | UNIFIED | partial | P1 | vincoli a proiettili e attraversamento assenti; attraversamento continuo non rilevato |
| Muro prismatico | `prismatic-wall` | SRD 5.1 / 9 | PARTIAL | GAP | UNREVIEWED | UNIFIED | partial | P1 | strati distruttibili e stato per strato assenti; attraversamento continuo non rilevato; sequenza di più TS e uscita dalla condizione incompleta |
| Nemici in Abbondanza | `xanathar-nemici-in-abbondanza` | Xanathar / 3 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Nube di nebbia | `fog-cloud` | SRD 5.1 / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Nube di Pugnali | `phb2014-nube-di-pugnali` | PHB 2014 / 2 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Nube incendiaria | `incendiary-cloud` | SRD 5.1 / 8 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Nube maleodorante | `stinking-cloud` | SRD 5.1 / 3 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Nube mortale | `cloudkill` | SRD 5.1 / 5 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Occhio arcano | `arcane-eye` | SRD 5.1 / 4 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Ombra di Moil | `xanathar-ombra-di-moil` | Xanathar / 4 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Onda di Marea | `xanathar-onda-di-marea` | Xanathar / 3 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Onda Distruttiva | `phb2014-onda-distruttiva` | PHB 2014 / 5 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Onda tonante | `thunderwave` | SRD 5.1 / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Orrido Avvizzimento di Abi-Dalzim | `xanathar-orrido-avvizzimento-di-abi-dalzim` | Xanathar / 8 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Oscurità | `darkness` | SRD 5.1 / 2 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Oscurità della Follia | `xanathar-oscurita-della-follia` | Xanathar / 8 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Ossa della Terra | `xanathar-ossa-della-terra` | Xanathar / 6 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Palla di fuoco | `fireball` | SRD 5.1 / 3 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Palla di fuoco ritardata | `delayed-blast-fireball` | SRD 5.1 / 7 | PARTIAL | GAP | UNREVIEWED | UNIFIED | partial | P1 | detonazione e accumulo alla terminazione assenti; contatore o risorsa interna della spell assente; trigger condizionale durante la durata assente |
| Parlare con gli animali | `speak-with-animals` | SRD 5.1 / 1 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Parlare con i morti | `speak-with-dead` | SRD 5.1 / 3 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Parlare con i vegetali | `speak-with-plants` | SRD 5.1 / 3 | PARTIAL | GAP | UNREVIEWED | UNIFIED | partial | P1 | meccanica di movimento assente; varianti rilevanti non modellate |
| Parola del Potere Dolore | `xanathar-parola-del-potere-dolore` | Xanathar / 7 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Parola del Potere Guarire | `phb2014-parola-del-potere-guarire` | PHB 2014 / 9 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Parola del potere stordire | `power-word-stun` | SRD 5.1 / 8 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Parola del potere uccidere | `power-word-kill` | SRD 5.1 / 9 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Parola del ritiro | `word-of-recall` | SRD 5.1 / 6 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Parola divina | `divine-word` | SRD 5.1 / 7 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Parola guaritrice | `healing-word` | SRD 5.1 / 1 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Parola guaritrice di massa | `mass-healing-word` | SRD 5.1 / 3 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Parola Radiosa | `xanathar-parola-radiosa` | Xanathar / 0 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Passapareti | `passwall` | SRD 5.1 / 5 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Passare senza tracce | `pass-without-trace` | SRD 5.1 / 2 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Passo del Tuono | `xanathar-passo-del-tuono` | Xanathar / 3 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Passo Remoto | `xanathar-passo-remoto` | Xanathar / 5 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Passo velato | `misty-step` | SRD 5.1 / 2 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Passo veloce | `longstrider` | SRD 5.1 / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Paura | `fear` | SRD 5.1 / 3 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Pelle coriacea | `barkskin` | SRD 5.1 / 2 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Pelle di pietra | `stoneskin` | SRD 5.1 / 4 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Percezione delle Bestie | `phb2014-percezione-delle-bestie` | PHB 2014 / 2 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Piaga degli insetti | `insect-plague` | SRD 5.1 / 5 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Pietra Magica | `xanathar-pietra-magica` | Xanathar / 0 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Pirotecnica | `xanathar-pirotecnica` | Xanathar / 2 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Porta dimensionale | `dimension-door` | SRD 5.1 / 4 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Portale | `gate` | SRD 5.1 / 9 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Portale Arcano | `phb2014-portale-arcano` | PHB 2014 / 6 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Preghiera di guarigione | `prayer-of-healing` | SRD 5.1 / 2 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Presagio | `augury` | SRD 5.1 / 2 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Prestidigitazione | `prestidigitation` | SRD 5.1 / 0 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Previsione | `foresight` | SRD 5.1 / 9 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Prigione Mentale | `xanathar-prigione-mentale` | Xanathar / 6 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Produrre fiamma | `produce-flame` | SRD 5.1 / 0 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Proibizione | `forbiddance` | SRD 5.1 / 6 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Proiezione astrale | `astral-projection` | SRD 5.1 / 9 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Protezione dai veleni | `protection-from-poison` | SRD 5.1 / 2 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Protezione dal bene e dal male | `protection-from-evil-and-good` | SRD 5.1 / 1 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Protezione dall'energia | `protection-from-energy` | SRD 5.1 / 3 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Punizione Accecante | `phb2014-punizione-accecante` | PHB 2014 / 3 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Punizione Collerica | `phb2014-punizione-collerica` | PHB 2014 / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Punizione Demoralizzante | `phb2014-punizione-demoralizzante` | PHB 2014 / 4 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Punizione Esiliante | `phb2014-punizione-esiliante` | PHB 2014 / 5 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Punizione Incandescente | `phb2014-punizione-incandescente` | PHB 2014 / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Punizione marchiante | `branding-smite` | SRD 5.1 / 2 | TRACK_ONLY | GAP | UNREVIEWED | UNIFIED | partial | P1 | trigger condizionale durante la durata assente; regole passive e limitazioni della spell incomplete |
| Punizione Tonante | `phb2014-punizione-tonante` | PHB 2014 / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Purificare cibo e bevande | `purify-food-and-drink` | SRD 5.1 / 1 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Raffica di Spine | `phb2014-raffica-di-spine` | PHB 2014 / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Raggio di affaticamento | `ray-of-enfeeblement` | SRD 5.1 / 2 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Raggio di gelo | `ray-of-frost` | SRD 5.1 / 0 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Raggio di Infermità | `phb2014-raggio-di-infermita` | PHB 2014 / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Raggio rovente | `scorching-ray` | SRD 5.1 / 2 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Ragnatela | `web` | SRD 5.1 / 2 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Rampicante Afferrante | `phb2014-rampicante-afferrante` | PHB 2014 / 4 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Randello incantato | `shillelagh` | SRD 5.1 / 0 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Reggia meravigliosa | `magnificent-mansion` | SRD 5.1 / 7 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Regressione mentale | `feeblemind` | SRD 5.1 / 8 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Reincarnazione | `reincarnate` | SRD 5.1 / 5 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Resistenza | `resistance` | SRD 5.1 / 0 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Respirare sott'acqua | `water-breathing` | SRD 5.1 / 3 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Resurrezione | `resurrection` | SRD 5.1 / 7 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Resurrezione pura | `true-resurrection` | SRD 5.1 / 9 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Rianimare morti | `raise-dead` | SRD 5.1 / 5 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Richiamo Infernale | `xanathar-richiamo-infernale` | Xanathar / 5 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Rigenerazione | `regenerate` | SRD 5.1 / 7 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Rimuovi maledizione | `remove-curse` | SRD 5.1 / 3 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Rinascita | `revivify` | SRD 5.1 / 3 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Rintocco dei Morti | `xanathar-rintocco-dei-morti` | Xanathar / 0 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Riparare | `mending` | SRD 5.1 / 0 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Riposo inviolato | `gentle-repose` | SRD 5.1 / 2 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Risata incontenibile | `hideous-laughter` | SRD 5.1 / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Riscaldare il metallo | `heat-metal` | SRD 5.1 / 2 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Ristorare inferiore | `lesser-restoration` | SRD 5.1 / 2 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Ristorare superiore | `greater-restoration` | SRD 5.1 / 5 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Risveglio | `awaken` | SRD 5.1 / 5 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Ritirata rapida | `expeditious-retreat` | SRD 5.1 / 1 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Rombo di Tuono | `xanathar-rombo-di-tuono` | Xanathar / 0 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Saltare | `jump` | SRD 5.1 / 1 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Salvare i morenti | `spare-the-dying` | SRD 5.1 / 0 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Santificare | `hallow` | SRD 5.1 / 5 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Santuario | `sanctuary` | SRD 5.1 / 1 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Santuario privato | `private-sanctum` | SRD 5.1 / 4 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Scagliare maledizione | `bestow-curse` | SRD 5.1 / 3 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Scassinare | `knock` | SRD 5.1 / 2 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Scheggia della Mente | `tasha-scheggia-della-mente` | Tasha / 0 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Sciame di meteore | `meteor-swarm` | SRD 5.1 / 9 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Sciame di Palle di Neve di Snilloc | `xanathar-sciame-di-palle-di-neve-di-snilloc` | Xanathar / 2 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Scolpire pietra | `stone-shape` | SRD 5.1 / 4 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Scopri il percorso | `find-the-path` | SRD 5.1 / 6 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Scopri trappole | `find-traps` | SRD 5.1 / 2 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Scossa Sinaptica | `xanathar-scossa-sinaptica` | Xanathar / 5 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Scossa Tellurica | `xanathar-scossa-tellurica` | Xanathar / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Scrigno segreto | `secret-chest` | SRD 5.1 / 4 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Scritta Celeste | `xanathar-scritta-celeste` | Xanathar / 2 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Scritto illusorio | `illusory-script` | SRD 5.1 / 1 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Scrutare | `scrying` | SRD 5.1 / 5 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Scudiscio Mentale di Tasha | `legacy-tashas-mind-whip` | Legacy / 2 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Scudo | `shield` | SRD 5.1 / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Scudo della fede | `shield-of-faith` | SRD 5.1 / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Scudo di fuoco | `fire-shield` | SRD 5.1 / 4 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Scurovisione | `darkvision` | SRD 5.1 / 2 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Segugio fedele | `faithful-hound` | SRD 5.1 / 4 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Sembrare | `seeming` | SRD 5.1 / 5 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Semipiano | `demiplane` | SRD 5.1 / 8 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Serratura arcana | `arcane-lock` | SRD 5.1 / 2 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Servitore inosservato | `unseen-servant` | SRD 5.1 / 1 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Servitore Minuscolo | `xanathar-servitore-minuscolo` | Xanathar / 3 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Sfera Acquea | `xanathar-sfera-acquea` | Xanathar / 4 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Sfera al Vetriolo | `xanathar-sfera-al-vetriolo` | Xanathar / 4 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Sfera congelante | `freezing-sphere` | SRD 5.1 / 6 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Sfera della Tempesta | `xanathar-sfera-della-tempesta` | Xanathar / 4 | PARTIAL | GAP | UNREVIEWED | UNIFIED | fragile | — | — |
| Sfera elastica | `resilient-sphere` | SRD 5.1 / 4 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Sfera infuocata | `flaming-sphere` | SRD 5.1 / 2 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Sfocatura | `blur` | SRD 5.1 / 2 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Sguardo penetrante | `eyebite` | SRD 5.1 / 6 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Silenzio | `silence` | SRD 5.1 / 2 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Simbolo | `symbol` | SRD 5.1 / 7 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Simulacro | `simulacrum` | SRD 5.1 / 7 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Soffio del Drago | `xanathar-soffio-del-drago` | Xanathar / 2 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Sogno | `dream` | SRD 5.1 / 5 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Sogno del Velo Celeste | `tasha-sogno-del-velo-celeste` | Tasha / 7 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Sonnellino | `xanathar-sonnellino` | Xanathar / 3 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Sonno | `sleep` | SRD 5.1 / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Sortilegio | `phb2014-sortilegio` | PHB 2014 / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Spada arcana | `arcane-sword` | SRD 5.1 / 7 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Spirito Guaritore | `xanathar-spirito-guaritore` | Xanathar / 2 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Spostamento planare | `plane-shift` | SRD 5.1 / 7 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Spruzzo colorato | `color-spray` | SRD 5.1 / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Spruzzo prismatico | `prismatic-spray` | SRD 5.1 / 7 | PARTIAL | GAP | UNREVIEWED | UNIFIED | partial | P1 | esito casuale e relativo stato non rappresentati; sequenza di più TS e uscita dalla condizione incompleta; condizione o stato RAW non rappresentato |
| Spruzzo velenoso | `poison-spray` | SRD 5.1 / 0 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Stretta della Terra di Maximilian | `xanathar-stretta-della-terra-di-maximilian` | Xanathar / 2 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Stretta folgorante | `shocking-grasp` | SRD 5.1 / 0 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Sudario Spirituale | `tasha-sudario-spirituale` | Tasha / 3 | PARTIAL | GAP | UNREVIEWED | UNIFIED | partial | P1 | trigger condizionale durante la durata assente; meccanica di movimento assente; effetto ricorrente di turno assente |
| Suggestione | `suggestion` | SRD 5.1 / 2 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Suggestione di massa | `mass-suggestion` | SRD 5.1 / 6 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Sussurri Dissonanti | `phb2014-sussurri-dissonanti` | PHB 2014 / 1 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Taumaturgia | `thaumaturgy` | SRD 5.1 / 0 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Telecinesi | `telekinesis` | SRD 5.1 / 5 | PARTIAL | GAP | UNREVIEWED | UNIFIED | partial | P1 | azione ripetibile della spell assente; condizione o stato RAW non rappresentato |
| Telepatia | `phb2014-telepatia` | PHB 2014 / 8 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Teletrasporto | `teleport` | SRD 5.1 / 7 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Tempesta di fuoco | `fire-storm` | SRD 5.1 / 7 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Tempesta di ghiaccio | `ice-storm` | SRD 5.1 / 4 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Tempesta di nevischio | `sleet-storm` | SRD 5.1 / 3 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Tempesta di vendetta | `storm-of-vengeance` | SRD 5.1 / 9 | PARTIAL | GAP | UNREVIEWED | UNIFIED | partial | P1 | progressione degli effetti per round assente; condizione o stato RAW non rappresentato; meccanica di movimento assente |
| Tempio degli Dèi | `xanathar-tempio-degli-dei` | Xanathar / 7 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Tentacoli neri | `black-tentacles` | SRD 5.1 / 4 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Terremoto | `earthquake` | SRD 5.1 / 8 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Terreno illusorio | `hallucinatory-terrain` | SRD 5.1 / 4 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Tocco del vampiro | `vampiric-touch` | SRD 5.1 / 3 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Tocco gelido | `chill-touch` | SRD 5.1 / 0 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Trabocchetto | `xanathar-trabocchetto` | Xanathar / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Trama ipnotica | `hypnotic-pattern` | SRD 5.1 / 3 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Trasferimento di Vita | `xanathar-trasferimento-di-vita` | Xanathar / 3 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Trasformazione | `shapechange` | SRD 5.1 / 9 | TRACK_ONLY | GAP | UNREVIEWED | UNIFIED | partial | P1 | azione ripetibile della spell assente; varianti rilevanti non modellate |
| Trasformazione di Tenser | `xanathar-trasformazione-di-tenser` | Xanathar / 6 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Traslazione arborea | `tree-stride` | SRD 5.1 / 5 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Trasmutare Roccia | `xanathar-trasmutare-roccia` | Xanathar / 5 | PARTIAL | GAP | UNREVIEWED | UNIFIED | partial | P1 | varianti della zona e relativi trigger incomplete; meccanica di movimento assente; trigger spaziali o di turno assenti |
| Trasporto vegetale | `transport-via-plants` | SRD 5.1 / 6 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Trova cavalcatura | `find-steed` | SRD 5.1 / 2 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Trova Cavalcatura Superiore | `xanathar-trova-cavalcatura-superiore` | Xanathar / 4 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Trova famiglio | `find-familiar` | SRD 5.1 / 1 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Trucco della corda | `rope-trick` | SRD 5.1 / 2 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Tsunami | `phb2014-tsunami` | PHB 2014 / 8 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Turbine | `xanathar-turbine` | Xanathar / 7 | PARTIAL | GAP | UNREVIEWED | UNIFIED | partial | P1 | movimento manuale della zona non risolto; sequenza di più TS e uscita dalla condizione incompleta; ingresso, sospensione e caduta finale non risolti |
| Turbine di Spade | `tasha-turbine-di-spade` | Tasha / 0 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Unto | `grease` | SRD 5.1 / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Urlo Psichico | `xanathar-urlo-psichico` | Xanathar / 9 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Vampa di Aganazzar | `xanathar-vampa-di-aganazzar` | Xanathar / 2 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Vedere invisibilità | `see-invisibility` | SRD 5.1 / 2 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Velocità | `haste` | SRD 5.1 / 3 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Vento di Interdizione | `xanathar-vento-di-interdizione` | Xanathar / 2 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Vigilanza e interdizione | `guards-and-wards` | SRD 5.1 / 6 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Vincolo della Terra | `xanathar-vincolo-della-terra` | Xanathar / 2 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Vincolo di interdizione | `warding-bond` | SRD 5.1 / 2 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Visione del vero | `true-seeing` | SRD 5.1 / 6 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Vita falsata | `false-life` | SRD 5.1 / 1 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Volare | `fly` | SRD 5.1 / 3 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Vuoto mentale | `mind-blank` | SRD 5.1 / 8 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Zona di verità | `zone-of-truth` | SRD 5.1 / 2 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |

## Dati macchina

La versione completa con condizioni rilevate, ID delle regole, trigger ed estratti di evidenza è in `data/spell-automation-audit.json`.

