# Audit automazione incantesimi

> **Audit generato e operativo.** Non descrive soltanto la presenza nel catalogo:
> confronta il testo regolamentare locale con tracking, aree, lifecycle, TS,
> condizioni, movimento, trigger di turno, azioni e fasi effettivamente dichiarati
> nel runtime. Rigenerare con `npm run audit:spells` dopo modifiche al catalogo.

## Metodo e limiti

- Catalogo sorgente: **477** definizioni; perimetro operativo: **374**; testi disponibili nel perimetro: **373**.
- Fuori perimetro: **103** definizioni. Sono escluse a priori le spell con casting time maggiore di 1 azione e le esclusioni curate dal perimetro operativo.
- Definizioni tracciabili: **280**; definizioni con almeno una regola di area: **114**.
- Casi revisionati manualmente sul testo RAW: **71**; lacune confermate P1: **52**.
- Impronta deterministica dello snapshot: `e670bda8c1ea7b4a`.
- P1 indica una lacuna confermata; P2 una discrepanza testuale ad alta confidenza; P3 una candidata da validare prima di modificare il runtime.
- Il TS iniziale di una spell puramente single-target resta manuale e non è una lacuna; il workflow TS è richiesto per aree, bersagli multipli e progressioni di slot multi-target.
- I tiri fisici e gli altri effetti dichiaratamente manuali non sono considerati bug se esiste il workflow/reminder corretto.
- Evocazioni, gestioni intenzionalmente manuali ed esclusioni curate restano fuori dal runtime operativo; sono elencate soltanto nella sezione `excluded` del JSON.

### Esclusioni dal perimetro

| Stato | Totale |
| --- | ---: |
| casting time maggiore di 1 azione | 70 |
| esclusione curata dal perimetro operativo | 11 |
| evocazione fuori dal runtime operativo | 19 |
| gestione manuale intenzionale | 3 |

### Distribuzione delle valutazioni

| Stato | Totale |
| --- | ---: |
| coperto | 244 |
| istantaneo: gestione manuale | 57 |
| parziale: revisione curata | 52 |
| revisione: testo mancante | 1 |
| riferimento/utilità | 20 |

### Distribuzione delle priorità

| Stato | Totale |
| --- | ---: |
| — | 321 |
| P1 | 52 |
| P2 | 1 |

### Ambito dei tiri salvezza

| Stato | Totale |
| --- | ---: |
| — | 209 |
| area | 92 |
| multiplo | 12 |
| singolo | 61 |

## P1 — lacune confermate sul testo RAW

| Incantesimo | Fonte | Lacune | Evidenza/valutazione |
| --- | --- | --- | --- |
| Anatema Elementale | Xanathar | trigger condizionale durante la durata assente | Il workflow batch del TS Costituzione, la scelta condivisa del tipo, il limite con slot superiori e la validazione pairwise entro 9 m sono operativi; resta manuale il trigger della prima applicazione di danno compatibile in ogni turno, con +2d6 e rimozione della resistenza. |
| Arma spirituale | SRD 5.1 | azione ripetibile della spell assente; azione di spostamento della zona assente | L'arma è una sorgente mobile: ogni azione bonus può spostarla di 6 m e ripetere l'attacco da quella posizione. |
| Aura di Vita | PHB 2014 | effetti passivi dell'aura incompleti; effetto ricorrente di turno assente | Servono resistenza necrotica, protezione del massimo PF e recupero di 1 PF a inizio turno per creature non ostili a 0 PF. |
| Aura di Vitalità | PHB 2014 | azione di cura entro l'aura assente | L'aura deve delimitare i bersagli validi dell'azione bonus di cura da 2d6. |
| Aura sacra | SRD 5.1 | trigger condizionale durante la durata assente; condizione o stato RAW non rappresentato | Ogni colpo in mischia di immondo o non morto contro un protetto innesca un TS Costituzione che può applicare Accecato fino al termine della spell. |
| Carne in pietra | SRD 5.1 | stato di successi/fallimenti multipli assente; condizione o stato RAW non rappresentato | Richiede Trattenuto iniziale, conteggio indipendente di tre successi o fallimenti e transizione a Pietrificato permanente dopo concentrazione completa. |
| Compulsione | SRD 5.1 | azione ripetibile della spell assente; meccanica di movimento assente | Il TS iniziale è coperto; manca la direzione scelta dal caster con azione bonus a ogni turno e il movimento obbligato dei bersagli prima del loro normale movimento. |
| Contagio | SRD 5.1 | stato di successi/fallimenti multipli assente; trigger condizionale durante la durata assente | Occorrono conteggio 3 successi/3 fallimenti, sei malattie alternative e trigger specifici come Stordito quando il bersaglio subisce danni. |
| Controllare acqua | SRD 5.1 | sottozona figlia non modellata; runtime specifico delle modalità incompleto | Le quattro azioni sono esposte, ma la massa controllata e il vortice richiedono geometrie distinte; trascinamento, onda ricorrente e prove di uscita non sono completi. |
| Corona di Stelle | Xanathar | contatore o risorsa interna della spell assente; azione ripetibile della spell assente | La spell parte con sette scintille, ne consuma una per azione bonus e termina alla settima; anche la luce dipende dal residuo. |
| Debilitazione | Xanathar | azione ripetibile della spell assente; trigger condizionale durante la durata assente | Dopo il fallimento iniziale, ogni azione del caster ripete automaticamente i danni e cura la metà; altre azioni, gittata o copertura terminano la spell. |
| Dominare bestie | SRD 5.1 | azione ripetibile della spell assente; trigger condizionale durante la durata assente | Affascinato e TS iniziale sono coperti; mancano il controllo preciso tramite azione e il nuovo TS Saggezza ogni volta che il bersaglio subisce danni. |
| Dominare mostri | SRD 5.1 | azione ripetibile della spell assente; trigger condizionale durante la durata assente | Affascinato e TS iniziale sono coperti; mancano il controllo preciso tramite azione e il nuovo TS Saggezza ogni volta che il bersaglio subisce danni. |
| Dominare persona | SRD 5.1 | azione ripetibile della spell assente; trigger condizionale durante la durata assente | Affascinato e TS iniziale sono coperti; mancano il controllo preciso tramite azione e il nuovo TS Saggezza ogni volta che il bersaglio subisce danni. |
| Folata di vento | SRD 5.1 | costo di movimento direzionale non calcolato; smoke test geometrico e lifecycle ancora richiesto | La linea, il TS a inizio turno e il cambio di direzione esistono; manca il costo raddoppiato soltanto avvicinandosi al caster e serve lo smoke test completo. |
| Forme animali | SRD 5.1 | azione ripetibile della spell assente; varianti rilevanti non modellate | Manca l'azione dei turni successivi che cambia nuovamente, anche in modo diverso per ciascun bersaglio, le forme e i blocchi statistiche associati. |
| Frecce Infuocate | Xanathar | contatore o risorsa interna della spell assente; trigger condizionale durante la durata assente | Servono il contatore condiviso delle dodici munizioni e il consumo dell'effetto al primo colpo o mancato di ogni freccia estratta. |
| Fuorviare | SRD 5.1 | condizione o stato RAW non rappresentato; azione ripetibile della spell assente | Mancano Invisibile sul caster, l'entità illusoria mobile e le azioni successive per muoverla e alternare l'uso dei sensi. |
| Gabbia dell'Anima | Xanathar | contatore o risorsa interna della spell assente; azione ripetibile della spell assente | L'anima dispone di sei usi condivisi tra più azioni con durate e conseguenze differenti; il registro non espone il contatore né le opzioni. |
| Guscio anti-vita | SRD 5.1 | barriera e interruzione al contatto non risolte; attraversamento continuo non rilevato | L'aura segue il caster, ma il confine deve respingere categorie selettive e terminare se il caster forza un attraversamento. |
| Interdizione Primordiale | Xanathar | trigger condizionale durante la durata assente; conseguenza alla fine della spell assente | Una reazione al danno trasforma tutte le resistenze nell'immunità al tipo scelto fino alla fine del turno successivo. |
| Intermittenza | SRD 5.1 | stato casuale ricorrente di turno assente; conseguenza alla fine della spell assente | Richiede d20 a ogni fine turno, stato sul Piano Etereo e rientro all'inizio del turno successivo o alla terminazione. |
| Inversione della gravità | SRD 5.1 | ingresso, sospensione e caduta finale non risolti; trigger spaziali o di turno assenti | La geometria non basta: servono salita, collisione, sospensione e caduta coordinata quando termina la spell. |
| Investitura del Vento | Xanathar | azione ripetibile della spell assente; conseguenza alla fine della spell assente | La velocità di volo è modellabile, ma mancano il cubo offensivo ripetibile e la caduta se la spell termina mentre il caster è in volo. |
| Investitura della Fiamma | Xanathar | azione ripetibile della spell assente; trigger spaziali o di turno assenti | Mancano il danno automatico a ingresso/fine turno nell'aura e la linea di fuoco ripetibile come azione. |
| Investitura della Pietra | Xanathar | azione ripetibile della spell assente; eccezioni e immunità ai costi di movimento assenti; conseguenza alla fine della spell assente | Servono terremoto ripetibile, immunità al costo del terreno difficile, attraversamento della pietra ed espulsione con Stordito se il movimento termina al suo interno. |
| Invocare il fulmine | SRD 5.1 | azione ripetibile della spell assente | Dopo il lancio il caster può scegliere ogni turno un nuovo punto sotto la nube e risolvere nuovamente area, TS e danni. |
| Lama d'Ombra | Xanathar | azione ripetibile della spell assente | La spell non espone l'arma creata né l'azione bonus che la fa ricomparire nella mano dopo che è stata lasciata cadere o lanciata. |
| Lama del Disastro | Tasha | azione ripetibile della spell assente; azione di spostamento della zona assente | Manca l'azione bonus ricorrente che sposta la lama di 9 m e risolve due attacchi, inclusa la soglia di critico 18–20 e i dadi critici speciali. |
| Lama infuocata | SRD 5.1 | azione ripetibile della spell assente | La durata è tracciata, ma non esiste l'azione ripetibile per effettuare gli attacchi in mischia con la lama creata. |
| Libertà di movimento | SRD 5.1 | eccezioni e immunità ai costi di movimento assenti | Lo Speed Tracker deve ignorare terreno difficile e riduzioni magiche, oltre a rappresentare l'uscita automatica spendendo 1,5 m. |
| Mano arcana | SRD 5.1 | contatore o risorsa interna della spell assente; azione ripetibile della spell assente; azione di spostamento della zona assente | La mano è una sorgente mobile con PF/CA propri e quattro modalità ripetibili: interposizione, spinta, presa/stritolamento e pugno. |
| Modellare Acqua | Xanathar | geometria d'area assente; varianti rilevanti non modellate | Le quattro manipolazioni del cubo d'acqua, incluse congelamento e animazione persistenti, non sono selezionabili né collegate a una geometria opzionale. |
| Modellare Terra | Xanathar | geometria d'area assente; varianti rilevanti non modellate; meccanica di movimento assente | Mancano le modalità del cubo e, per il terreno reso difficile o normale per un'ora, una zona persistente collegata al costo di movimento. |
| Muro d'Acqua | Xanathar | meccanica di movimento assente; trigger condizionale durante la durata assente | La parete non applica terreno difficile né le interazioni contestuali con attacchi a distanza, danni da fuoco e congelamento locale da freddo. |
| Muro di fuoco | SRD 5.1 | lato caldo e fascia adiacente non modellati; attraversamento continuo non rilevato; progressione con lo slot non applicata al trigger | Il muro e i reminder base esistono; non sono rappresentati lato caldo, fascia di 3 m, attraversamento senza sosta e aumento dei danni per slot. |
| Muro di Luce | Xanathar | contatore o risorsa interna della spell assente; azione ripetibile della spell assente; effetto ricorrente di turno assente | Ogni raggio usa un'azione e accorcia il muro di 3 m; restano inoltre danno a fine turno e TS ricorrente contro Accecato. |
| Muro di vento | SRD 5.1 | vincoli a proiettili e attraversamento assenti; attraversamento continuo non rilevato | La sagoma esiste; mancano blocco selettivo di creature/oggetti, proiettili e forme gassose. |
| Muro prismatico | SRD 5.1 | strati distruttibili e stato per strato assenti; attraversamento continuo non rilevato; sequenza di più TS e uscita dalla condizione incompleta | La sagoma base esiste, ma i sette strati, le distruzioni progressive, gli effetti per strato e le sequenze di TS non hanno uno stato dedicato. |
| Palla di fuoco ritardata | SRD 5.1 | detonazione e accumulo alla terminazione assenti; contatore o risorsa interna della spell assente; trigger condizionale durante la durata assente | La sfera accumula 1d6 a fine turno, esplode alla terminazione o al contatto e può essere lanciata altrove dopo un TS riuscito. |
| Parlare con i vegetali | SRD 5.1 | meccanica di movimento assente; varianti rilevanti non modellate | L'aura è presente, ma manca la scelta di rendere normale o difficile il terreno vegetale e il relativo collegamento allo Speed Tracker. |
| Punizione marchiante | SRD 5.1 | trigger condizionale durante la durata assente; regole passive e limitazioni della spell incomplete | Manca la risoluzione sul prossimo colpo: danni radiosi, rivelazione di un bersaglio invisibile e blocco di nuova invisibilità fino alla fine della spell. |
| Sfera della Tempesta | Xanathar | azione ripetibile della spell assente; effetto ricorrente di turno assente | La zona applica TS/danni a fine turno e il caster può lanciare un fulmine ogni round con vantaggio contro bersagli interni. |
| Spada arcana | SRD 5.1 | azione ripetibile della spell assente; azione di spostamento della zona assente | Ogni azione bonus sposta la sorgente di 6 m e ripete l'attacco dallo spazio della spada. |
| Spruzzo prismatico | SRD 5.1 | esito casuale e relativo stato non rappresentati; sequenza di più TS e uscita dalla condizione incompleta; condizione o stato RAW non rappresentato | La sagoma e il primo TS esistono, ma non il d8 per ciascun bersaglio, il doppio raggio con 8, i TS successivi e gli stati Accecato, Trattenuto e Pietrificato. |
| Sudario Spirituale | Tasha | trigger condizionale durante la durata assente; meccanica di movimento assente; effetto ricorrente di turno assente | Ogni bersaglio colpito riceve blocco cure e, se scelto vicino al caster, -3 m fino all'inizio del turno successivo; il trigger nasce dal colpo. |
| Telecinesi | SRD 5.1 | azione ripetibile della spell assente; condizione o stato RAW non rappresentato | Ogni round può cambiare bersaglio o ripetere la contesa; una creatura sollevata resta Trattenuta fino al termine del turno successivo. |
| Tempesta di vendetta | SRD 5.1 | progressione degli effetti per round assente; condizione o stato RAW non rappresentato; meccanica di movimento assente | L'area esiste, ma i round 1-10 cambiano danni, TS, Assordato, terreno difficile e oscuramento. |
| Terremoto | SRD 5.1 | sottozona figlia non modellata; runtime specifico delle modalità incompleto | Zona madre, terreno difficile e reminder principali esistono; crepe e strutture non sono entità spaziali indipendenti con risoluzione atomica. |
| Trasformazione | SRD 5.1 | azione ripetibile della spell assente; varianti rilevanti non modellate | Mancano la forma e i PF correnti come stato dell'istanza e l'azione che sostituisce la forma nei turni successivi rispettando i limiti RAW. |
| Trasmutare Roccia | Xanathar | varianti della zona e relativi trigger incomplete; meccanica di movimento assente; trigger spaziali o di turno assenti | Le due trasformazioni richiedono varianti distinte, costo 4x nel fango, TS al lancio/ingresso/fine turno e uscita o distruzione della roccia. |
| Turbine | Xanathar | movimento manuale della zona non risolto; sequenza di più TS e uscita dalla condizione incompleta; ingresso, sospensione e caduta finale non risolti | Servono zona mobile, doppio TS, trascinamento verticale, movimento con la zona, prova di fuga e caduta finale. |

## P2 — discrepanze ad alta confidenza

| Incantesimo | Fonte | Lacune | Evidenza/valutazione |
| --- | --- | --- | --- |
| Manto del Crociato | Legacy | testo regolamentare locale mancante | Segnalazione strutturale senza estratto testuale breve. |

## P3 — candidate da revisionare

Nessuna voce.

## Matrice completa

La colonna **Segnali RAW** deriva dal testo; **Copertura runtime** deriva esclusivamente dai dati e dalle regole effettivamente importate dal plugin.

| Incantesimo | ID | Fonte/Liv. | Ambito | Ambito TS | Segnali RAW | Copertura runtime | Valutazione | Priorità | Lacune |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Abilità Potenziata | `xanathar-abilita-potenziata` | Xanathar / 5 | utilità/riferimento | — | — | tracking | coperto | — | — |
| Abito Ultraterreno di Tasha | `tasha-abito-ultraterreno-di-tasha` | Tasha / 6 | combattimento | — | movimento | tracking, movimento, varianti | coperto | — | — |
| Aculeo Mentale | `xanathar-aculeo-mentale` | Xanathar / 2 | combattimento | singolo | TS:singolo | tracking | coperto | — | — |
| Aiuto | `aid` | SRD 5.1 / 2 | combattimento | — | — | tracking | coperto | — | — |
| Alba | `xanathar-alba` | Xanathar / 5 | combattimento | area | area, TS:area | tracking, aree:zone, lifecycle, TS, movimento, turni | coperto | — | — |
| Allucinazione di Forza | `phb2014-allucinazione-di-forza` | PHB 2014 / 2 | combattimento | singolo | TS:singolo, ingresso/attraversamento | tracking, TS | coperto | — | — |
| Allucinazione mortale | `phantasmal-killer` | SRD 5.1 / 4 | combattimento | singolo | TS:singolo, status:Spaventato | tracking, TS, status:Spaventato | coperto | — | — |
| Amicizia | `phb2014-amicizia` | PHB 2014 / 0 | utilità/riferimento | — | — | tracking | coperto | — | — |
| Amicizia con gli animali | `animal-friendship` | SRD 5.1 / 1 | combattimento | singolo | TS:singolo | tracking, TS, status:Affascinato | coperto | — | — |
| Anatema | `bane` | SRD 5.1 / 1 | combattimento | multiplo | TS:multiplo | tracking, TS | coperto | — | — |
| Anatema Elementale | `xanathar-anatema-elementale` | Xanathar / 4 | combattimento | multiplo | TS:multiplo | tracking, TS, varianti | parziale: revisione curata | P1 | trigger condizionale durante la durata assente |
| Animale messaggero | `animal-messenger` | SRD 5.1 / 2 | utilità/riferimento | — | — | tracking | coperto | — | — |
| Anti-individuazione | `nondetection` | SRD 5.1 / 3 | utilità/riferimento | — | — | tracking | coperto | — | — |
| Arma Elementale | `phb2014-arma-elementale` | PHB 2014 / 3 | combattimento | — | — | tracking, varianti | coperto | — | — |
| Arma magica | `magic-weapon` | SRD 5.1 / 2 | combattimento | — | — | tracking | coperto | — | — |
| Arma Sacra | `xanathar-arma-sacra` | Xanathar / 5 | combattimento | area | area, TS:area | tracking, aree:instant, TS, status:Accecato, turni | coperto | — | — |
| Arma spirituale | `spiritual-weapon` | SRD 5.1 / 2 | combattimento | — | fasi/azioni | tracking | parziale: revisione curata | P1 | azione ripetibile della spell assente; azione di spostamento della zona assente |
| Armatura di Agathys | `phb2014-armatura-di-agathys` | PHB 2014 / 1 | combattimento | — | — | tracking | coperto | — | — |
| Armatura magica | `mage-armor` | SRD 5.1 / 1 | utilità/riferimento | — | — | tracking | coperto | — | — |
| Artificio druidico | `druidcraft` | SRD 5.1 / 0 | utilità/riferimento | — | effetto istantaneo persistente | — | riferimento/utilità | — | — |
| Assorbire Elementi | `xanathar-assorbire-elementi` | Xanathar / 1 | combattimento | — | turni | tracking, turni, varianti | coperto | — | — |
| Aura di Purezza | `phb2014-aura-di-purezza` | PHB 2014 / 4 | combattimento | — | area | tracking, aree:aura, lifecycle, TS | coperto | — | — |
| Aura di Vita | `phb2014-aura-di-vita` | PHB 2014 / 4 | combattimento | — | area | tracking, aree:aura, lifecycle, TS | parziale: revisione curata | P1 | effetti passivi dell'aura incompleti; effetto ricorrente di turno assente |
| Aura di Vitalità | `phb2014-aura-di-vitalita` | PHB 2014 / 3 | combattimento | — | area, fasi/azioni | tracking, aree:aura, lifecycle, TS | parziale: revisione curata | P1 | azione di cura entro l'aura assente |
| Aura magica dell'arcanista | `arcanists-magic-aura` | SRD 5.1 / 2 | utilità/riferimento | — | — | tracking | coperto | — | — |
| Aura sacra | `holy-aura` | SRD 5.1 / 8 | combattimento | area | area, TS:area, status:Accecato | tracking, aree:instant, TS | parziale: revisione curata | P1 | trigger condizionale durante la durata assente; condizione o stato RAW non rappresentato |
| Bacche benefiche | `goodberry` | SRD 5.1 / 1 | utilità/riferimento | — | — | — | riferimento/utilità | — | — |
| Bagliore lunare | `moonbeam` | SRD 5.1 / 2 | combattimento | area | area, TS:area, ingresso/attraversamento, fasi/azioni | tracking, aree:zone, lifecycle, TS, movimento, turni, varianti | coperto | — | — |
| Bagliore solare | `sunbeam` | SRD 5.1 / 6 | combattimento | area | area, TS:area, turni | tracking, aree:instant, TS, status:Accecato, turni | coperto | — | — |
| Barriera di lame | `blade-barrier` | SRD 5.1 / 6 | combattimento | area | area, TS:area, ingresso/attraversamento | tracking, aree:zone, lifecycle, TS, movimento, turni | coperto | — | — |
| Beffa crudele | `vicious-mockery` | SRD 5.1 / 0 | combattimento | singolo | TS:singolo, turni | — | istantaneo: gestione manuale | — | — |
| Benedizione | `bless` | SRD 5.1 / 1 | combattimento | — | riferimento TS | tracking | coperto | — | — |
| Blocca mostri | `hold-monster` | SRD 5.1 / 5 | combattimento | multiplo | TS:multiplo | tracking, TS, status:Paralizzato | coperto | — | — |
| Blocca persone | `hold-person` | SRD 5.1 / 2 | combattimento | singolo | TS:singolo | tracking, TS, status:Paralizzato | coperto | — | — |
| Braccia di Hadar | `phb2014-braccia-di-hadar` | PHB 2014 / 1 | combattimento | area | area, TS:area, turni | aree:instant, TS, turni | coperto | — | — |
| Calmare emozioni | `calm-emotions` | SRD 5.1 / 2 | combattimento | area | TS:area | tracking, aree:instant, TS, varianti | coperto | — | — |
| Campo anti-magia | `antimagic-field` | SRD 5.1 / 8 | utilità/riferimento | — | area, ingresso/attraversamento | tracking, aree:aura, lifecycle, TS | coperto | — | — |
| Camuffare se stesso | `disguise-self` | SRD 5.1 / 1 | combattimento | — | riferimento TS | tracking | coperto | — | — |
| Caratteristica potenziata | `enhance-ability` | SRD 5.1 / 2 | combattimento | — | status:Incapacitato | tracking, varianti | coperto | — | — |
| Carne in pietra | `flesh-to-stone` | SRD 5.1 / 6 | combattimento | singolo | TS:singolo, status:Trattenuto/Pietrificato | tracking | parziale: revisione curata | P1 | stato di successi/fallimenti multipli assente; condizione o stato RAW non rappresentato |
| Catapulta | `xanathar-catapulta` | Xanathar / 1 | combattimento | singolo | TS:singolo | — | istantaneo: gestione manuale | — | — |
| Catena di fulmini | `chain-lightning` | SRD 5.1 / 6 | combattimento | multiplo | TS:multiplo | TS | istantaneo: gestione manuale | — | — |
| Cecità/sordità | `blindness-deafness` | SRD 5.1 / 2 | combattimento | multiplo | TS:multiplo, status:Accecato/Assordato | tracking, TS, status:Accecato/Assordato | coperto | — | — |
| Celare | `sequester` | SRD 5.1 / 7 | combattimento | — | — | tracking | coperto | — | — |
| Cerchio di morte | `circle-of-death` | SRD 5.1 / 6 | combattimento | area | area, TS:area | aree:instant, TS | coperto | — | — |
| Cerchio di Potere | `phb2014-cerchio-di-potere` | PHB 2014 / 5 | combattimento | — | area, riferimento TS | tracking, aree:aura, lifecycle, TS | coperto | — | — |
| Charme su persone | `charm-person` | SRD 5.1 / 1 | combattimento | multiplo | TS:multiplo, status:Affascinato | tracking, TS, status:Affascinato | coperto | — | — |
| Charme sui Mostri | `xanathar-charme-sui-mostri` | Xanathar / 4 | combattimento | multiplo | TS:multiplo | tracking, TS, status:Affascinato | coperto | — | — |
| Collera della Natura | `xanathar-collera-della-natura` | Xanathar / 5 | combattimento | area | area, TS:area, status:Prono, movimento, turni, fasi/azioni | tracking, aree:zone, lifecycle, TS, status:Trattenuto/Prono, movimento, turni, fasi/azioni, varianti | coperto | — | — |
| Colpo accurato | `true-strike` | SRD 5.1 / 0 | utilità/riferimento | — | turni | tracking, turni | coperto | — | — |
| Colpo del Vento d'Acciaio | `xanathar-colpo-del-vento-dacciaio` | Xanathar / 5 | combattimento | — | — | — | istantaneo: gestione manuale | — | — |
| Colpo dello Zefiro | `xanathar-colpo-dello-zefiro` | Xanathar / 1 | combattimento | — | movimento | tracking, movimento, turni, fasi/azioni | coperto | — | — |
| Colpo infuocato | `flame-strike` | SRD 5.1 / 5 | combattimento | area | area, TS:area | aree:instant, TS | coperto | — | — |
| Colpo Intrappolante | `phb2014-colpo-intrappolante` | PHB 2014 / 1 | combattimento | singolo | TS:singolo, status:Trattenuto | tracking, TS, status:Trattenuto, fasi/azioni | coperto | — | — |
| Coltello di Ghiaccio | `xanathar-coltello-di-ghiaccio` | Xanathar / 1 | combattimento | area | TS:area | aree:instant, TS | istantaneo: gestione manuale | — | — |
| Comando | `command` | SRD 5.1 / 1 | combattimento | multiplo | TS:multiplo, status:Prono, turni | tracking, TS, status:Prono, turni, varianti | coperto | — | — |
| Comprensione dei linguaggi | `comprehend-languages` | SRD 5.1 / 1 | utilità/riferimento | — | — | tracking | coperto | — | — |
| Compulsione | `compulsion` | SRD 5.1 / 4 | combattimento | area | TS:area, turni, fasi/azioni | tracking, aree:instant, TS, turni | parziale: revisione curata | P1 | azione ripetibile della spell assente; meccanica di movimento assente |
| Confusione | `confusion` | SRD 5.1 / 4 | combattimento | area | area, TS:area | tracking, aree:instant, TS, turni | coperto | — | — |
| Cono di freddo | `cone-of-cold` | SRD 5.1 / 5 | combattimento | area | area, TS:area | aree:instant, TS | coperto | — | — |
| Contagio | `contagion` | SRD 5.1 / 5 | combattimento | singolo | TS:singolo, turni | tracking | parziale: revisione curata | P1 | stato di successi/fallimenti multipli assente; trigger condizionale durante la durata assente |
| Controincantesimo | `counterspell` | SRD 5.1 / 3 | utilità/riferimento | — | — | — | riferimento/utilità | — | — |
| Controllare acqua | `control-water` | SRD 5.1 / 4 | combattimento | area | TS:area, turni, fasi/azioni, varianti | tracking, aree:zone, lifecycle, TS, status:Trattenuto, movimento, turni, fasi/azioni, varianti | parziale: revisione curata | P1 | sottozona figlia non modellata; runtime specifico delle modalità incompleto |
| Controllare Fiamme | `xanathar-controllare-fiamme` | Xanathar / 0 | utilità/riferimento | — | area, effetto istantaneo persistente | tracking | coperto | — | — |
| Controllare Venti | `xanathar-controllare-venti` | Xanathar / 5 | combattimento | area | area, TS:area, turni, varianti | tracking, aree:zone, lifecycle, TS, status:Prono, movimento, turni, fasi/azioni, varianti | coperto | — | — |
| Cordone di Frecce | `phb2014-cordone-di-frecce` | PHB 2014 / 2 | combattimento | area | TS:area | tracking, aree:zone, lifecycle, TS, movimento, turni | coperto | — | — |
| Corona di Follia | `phb2014-corona-di-follia` | PHB 2014 / 2 | combattimento | singolo | TS:singolo, status:Affascinato | tracking, TS, status:Affascinato, turni | coperto | — | — |
| Corona di Stelle | `xanathar-corona-di-stelle` | Xanathar / 7 | combattimento | — | fasi/azioni | tracking | parziale: revisione curata | P1 | contatore o risorsa interna della spell assente; azione ripetibile della spell assente |
| Creare cibo e acqua | `create-food-and-water` | SRD 5.1 / 3 | utilità/riferimento | — | effetto istantaneo persistente | — | riferimento/utilità | — | — |
| Creare Falò | `xanathar-creare-falo` | Xanathar / 0 | combattimento | area | area, TS:area, ingresso/attraversamento | tracking, aree:zone, lifecycle, TS, movimento, turni | coperto | — | — |
| Creare o distruggere acqua | `create-or-destroy-water` | SRD 5.1 / 1 | utilità/riferimento | — | — | — | riferimento/utilità | — | — |
| Crescita di spine | `spike-growth` | SRD 5.1 / 2 | combattimento | — | area, riferimento TS, movimento, ingresso/attraversamento | tracking, aree:zone, lifecycle, TS, movimento | coperto | — | — |
| Crescita vegetale | `plant-growth` | SRD 5.1 / 3 | utilità/riferimento | — | — | — | riferimento/utilità | — | — |
| Cura ferite | `cure-wounds` | SRD 5.1 / 1 | combattimento | — | — | — | istantaneo: gestione manuale | — | — |
| Cura ferite di massa | `mass-cure-wounds` | SRD 5.1 / 5 | combattimento | — | — | aree:instant, TS | istantaneo: gestione manuale | — | — |
| Danza irresistibile | `irresistible-dance` | SRD 5.1 / 6 | combattimento | singolo | TS:singolo, ingresso/attraversamento | tracking, TS | coperto | — | — |
| Dardo di Caos | `xanathar-dardo-di-caos` | Xanathar / 1 | combattimento | — | — | — | istantaneo: gestione manuale | — | — |
| Dardo di fuoco | `fire-bolt` | SRD 5.1 / 0 | combattimento | — | — | — | istantaneo: gestione manuale | — | — |
| Dardo incantato | `magic-missile` | SRD 5.1 / 1 | combattimento | — | — | — | istantaneo: gestione manuale | — | — |
| Dardo Stregato | `phb2014-dardo-stregato` | PHB 2014 / 1 | combattimento | — | — | tracking | coperto | — | — |
| Dardo tracciante | `guiding-bolt` | SRD 5.1 / 1 | combattimento | — | turni | tracking, turni | coperto | — | — |
| Debilitazione | `xanathar-debilitazione` | Xanathar / 5 | combattimento | singolo | TS:singolo, fasi/azioni | tracking | parziale: revisione curata | P1 | azione ripetibile della spell assente; trigger condizionale durante la durata assente |
| Deflagrazione occulta | `eldritch-blast` | SRD 5.1 / 0 | combattimento | — | — | — | istantaneo: gestione manuale | — | — |
| Diavoletto di Polvere | `xanathar-diavoletto-di-polvere` | Xanathar / 2 | combattimento | area | TS:area, fasi/azioni | tracking, aree:zone, lifecycle, TS, movimento, turni | coperto | — | — |
| Disco fluttuante | `floating-disk` | SRD 5.1 / 1 | utilità/riferimento | — | ingresso/attraversamento | tracking | coperto | — | — |
| Disintegrazione | `disintegrate` | SRD 5.1 / 6 | combattimento | singolo | TS:singolo | — | istantaneo: gestione manuale | — | — |
| Dissolvi il bene e il male | `dispel-evil-and-good` | SRD 5.1 / 5 | combattimento | singolo | TS:singolo | tracking | coperto | — | — |
| Dissolvi magie | `dispel-magic` | SRD 5.1 / 3 | utilità/riferimento | — | — | — | riferimento/utilità | — | — |
| Dito della morte | `finger-of-death` | SRD 5.1 / 7 | combattimento | singolo | TS:singolo, turni | — | istantaneo: gestione manuale | — | — |
| Divinazione | `divination` | SRD 5.1 / 4 | utilità/riferimento | — | — | — | riferimento/utilità | — | — |
| Dominare bestie | `dominate-beast` | SRD 5.1 / 4 | combattimento | singolo | TS:singolo, turni, fasi/azioni | tracking, TS, status:Affascinato | parziale: revisione curata | P1 | azione ripetibile della spell assente; trigger condizionale durante la durata assente |
| Dominare mostri | `dominate-monster` | SRD 5.1 / 8 | combattimento | singolo | TS:singolo, turni, fasi/azioni | tracking, TS, status:Affascinato | parziale: revisione curata | P1 | azione ripetibile della spell assente; trigger condizionale durante la durata assente |
| Dominare persona | `dominate-person` | SRD 5.1 / 5 | combattimento | singolo | TS:singolo, status:Affascinato, turni, fasi/azioni | tracking, TS, status:Affascinato | parziale: revisione curata | P1 | azione ripetibile della spell assente; trigger condizionale durante la durata assente |
| Drago Illusorio | `xanathar-drago-illusorio` | Xanathar / 8 | combattimento | area | TS:area, status:Spaventato | tracking, aree:instant, TS, status:Spaventato, varianti | coperto | — | — |
| Duello Obbligato | `phb2014-duello-obbligato` | PHB 2014 / 1 | combattimento | singolo | TS:singolo | tracking, TS | coperto | — | — |
| Eroismo | `heroism` | SRD 5.1 / 1 | combattimento | — | — | tracking | coperto | — | — |
| Eruzione Terrestre | `xanathar-eruzione-terrestre` | Xanathar / 3 | combattimento | area | area, TS:area, movimento | aree:instant, TS | coperto | — | — |
| Esilio | `banishment` | SRD 5.1 / 4 | combattimento | multiplo | TS:multiplo, status:Incapacitato | tracking, TS, status:Incapacitato | coperto | — | — |
| Esplosione solare | `sunburst` | SRD 5.1 / 8 | combattimento | area | TS:area, effetto istantaneo persistente | aree:instant, TS, status:Accecato, turni | coperto | — | — |
| Estasiare | `enthrall` | SRD 5.1 / 2 | combattimento | — | riferimento TS | tracking | coperto | — | — |
| Fame di Hadar | `phb2014-fame-di-hadar` | PHB 2014 / 3 | combattimento | area | area, TS:area, movimento | tracking, aree:zone, lifecycle, TS, status:Accecato, movimento, turni | coperto | — | — |
| Faretra Rapida | `phb2014-faretra-rapida` | PHB 2014 / 5 | utilità/riferimento | — | fasi/azioni | tracking, TS | coperto | — | — |
| Faro di speranza | `beacon-of-hope` | SRD 5.1 / 3 | combattimento | — | — | tracking | coperto | — | — |
| Fatale | `weird` | SRD 5.1 / 9 | combattimento | area | area, TS:area | tracking, aree:instant, TS, status:Spaventato, turni | coperto | — | — |
| Favore divino | `divine-favor` | SRD 5.1 / 1 | combattimento | — | — | tracking | coperto | — | — |
| Ferire | `harm` | SRD 5.1 / 6 | combattimento | — | riferimento TS | — | istantaneo: gestione manuale | — | — |
| Fermare il tempo | `time-stop` | SRD 5.1 / 9 | utilità/riferimento | — | — | — | riferimento/utilità | — | — |
| Ferocia Primordiale | `xanathar-ferocia-primordiale` | Xanathar / 0 | combattimento | — | — | — | istantaneo: gestione manuale | — | — |
| Fiamma perenne | `continual-flame` | SRD 5.1 / 2 | utilità/riferimento | — | — | tracking | coperto | — | — |
| Fiamma sacra | `sacred-flame` | SRD 5.1 / 0 | combattimento | singolo | TS:singolo | — | istantaneo: gestione manuale | — | — |
| Fiotto acido | `acid-splash` | SRD 5.1 / 0 | combattimento | singolo | TS:singolo | — | istantaneo: gestione manuale | — | — |
| Flusso di Energia Negativa | `xanathar-flusso-di-energia-negativa` | Xanathar / 5 | combattimento | singolo | TS:singolo, turni | — | istantaneo: gestione manuale | — | — |
| Folata | `xanathar-folata` | Xanathar / 0 | combattimento | singolo | TS:singolo | — | istantaneo: gestione manuale | — | — |
| Folata di vento | `gust-of-wind` | SRD 5.1 / 2 | combattimento | area | area, TS:area, fasi/azioni | tracking, aree:zone, lifecycle, TS, movimento, turni | parziale: revisione curata | P1 | costo di movimento direzionale non calcolato; smoke test geometrico e lifecycle ancora richiesto |
| Forma eterea | `etherealness` | SRD 5.1 / 7 | combattimento | — | — | tracking | coperto | — | — |
| Forme animali | `animal-shapes` | SRD 5.1 / 8 | combattimento | — | fasi/azioni, varianti | tracking | parziale: revisione curata | P1 | azione ripetibile della spell assente; varianti rilevanti non modellate |
| Fortezza della Mente | `tasha-fortezza-della-mente` | Tasha / 3 | combattimento | — | — | tracking | coperto | — | — |
| Frantumare | `shatter` | SRD 5.1 / 2 | combattimento | area | area, TS:area | aree:instant, TS | coperto | — | — |
| Frecce Infuocate | `xanathar-frecce-infuocate` | Xanathar / 3 | combattimento | — | fasi/azioni | tracking | parziale: revisione curata | P1 | contatore o risorsa interna della spell assente; trigger condizionale durante la durata assente |
| Freccia acida | `acid-arrow` | SRD 5.1 / 2 | combattimento | — | turni, effetto istantaneo persistente | tracking, varianti | coperto | — | — |
| Freccia Folgorante | `phb2014-freccia-folgorante` | PHB 2014 / 3 | combattimento | area | TS:area | tracking, aree:instant, TS, fasi/azioni | coperto | — | — |
| Frusta di Spine | `phb2014-frusta-di-spine` | PHB 2014 / 0 | combattimento | — | — | — | istantaneo: gestione manuale | — | — |
| Fulgore Nauseante | `xanathar-fulgore-nauseante` | Xanathar / 4 | combattimento | area | area, TS:area, status:Indebolimento, ingresso/attraversamento | tracking, aree:zone, lifecycle, TS, status:Indebolimento, movimento, turni | coperto | — | — |
| Fulmine | `lightning-bolt` | SRD 5.1 / 3 | combattimento | area | area, TS:area | aree:instant, TS | coperto | — | — |
| Fuorviare | `mislead` | SRD 5.1 / 5 | combattimento | — | status:Invisibile, fasi/azioni | tracking | parziale: revisione curata | P1 | condizione o stato RAW non rappresentato; azione ripetibile della spell assente |
| Gabbia dell'Anima | `xanathar-gabbia-dellanima` | Xanathar / 6 | combattimento | — | riferimento TS, turni, fasi/azioni | tracking | parziale: revisione curata | P1 | contatore o risorsa interna della spell assente; azione ripetibile della spell assente |
| Gabbia di forza | `forcecage` | SRD 5.1 / 7 | combattimento | area | area, TS:area, ingresso/attraversamento | tracking, aree:zone, lifecycle, TS, movimento | coperto | — | — |
| Globo Cromatico | `phb2014-globo-cromatico` | PHB 2014 / 1 | combattimento | — | — | — | istantaneo: gestione manuale | — | — |
| Globo di invulnerabilità | `globe-of-invulnerability` | SRD 5.1 / 6 | utilità/riferimento | — | — | tracking, aree:aura, lifecycle, TS | coperto | — | — |
| Guardiani spirituali | `spirit-guardians` | SRD 5.1 / 3 | combattimento | area | TS:area, ingresso/attraversamento | tracking, aree:aura, lifecycle, TS, movimento, turni | coperto | — | — |
| Guardiano della fede | `guardian-of-faith` | SRD 5.1 / 4 | combattimento | area | TS:area | tracking, aree:zone, lifecycle, TS, movimento | coperto | — | — |
| Guardiano della Natura | `xanathar-guardiano-della-natura` | Xanathar / 4 | combattimento | — | movimento, varianti | tracking, movimento, varianti | coperto | — | — |
| Guarigione | `heal` | SRD 5.1 / 6 | combattimento | — | — | — | istantaneo: gestione manuale | — | — |
| Guarigione di massa | `mass-heal` | SRD 5.1 / 9 | combattimento | — | — | — | istantaneo: gestione manuale | — | — |
| Guida | `guidance` | SRD 5.1 / 0 | utilità/riferimento | — | — | tracking | coperto | — | — |
| Guscio anti-vita | `antilife-shell` | SRD 5.1 / 5 | utilità/riferimento | — | ingresso/attraversamento | tracking, aree:aura, lifecycle, TS | parziale: revisione curata | P1 | barriera e interruzione al contatto non risolte; attraversamento continuo non rilevato |
| Illusione minore | `minor-illusion` | SRD 5.1 / 0 | combattimento | — | riferimento TS | tracking | coperto | — | — |
| Illusione programmata | `programmed-illusion` | SRD 5.1 / 6 | combattimento | — | riferimento TS | tracking | coperto | — | — |
| Immagine maggiore | `major-image` | SRD 5.1 / 3 | combattimento | — | riferimento TS | tracking | coperto | — | — |
| Immagine speculare | `mirror-image` | SRD 5.1 / 2 | combattimento | — | — | tracking | coperto | — | — |
| Immolazione | `xanathar-immolazione` | Xanathar / 5 | combattimento | singolo | area, TS:singolo | tracking, turni | coperto | — | — |
| Inaridire | `blight` | SRD 5.1 / 4 | combattimento | singolo | TS:singolo | — | istantaneo: gestione manuale | — | — |
| Incuti Paura | `xanathar-incuti-paura` | Xanathar / 1 | combattimento | multiplo | TS:multiplo, status:Spaventato | tracking, TS, status:Spaventato | coperto | — | — |
| Individuazione dei pensieri | `detect-thoughts` | SRD 5.1 / 2 | combattimento | singolo | TS:singolo | tracking | coperto | — | — |
| Individuazione del bene e del male | `detect-evil-and-good` | SRD 5.1 / 1 | utilità/riferimento | — | — | tracking | coperto | — | — |
| Individuazione del magico | `detect-magic` | SRD 5.1 / 1 | utilità/riferimento | — | area | tracking | coperto | — | — |
| Individuazione delle malattie e dei veleni | `detect-poison-and-disease` | SRD 5.1 / 1 | utilità/riferimento | — | — | tracking | coperto | — | — |
| Infestazione | `xanathar-infestazione` | Xanathar / 0 | combattimento | singolo | TS:singolo, movimento | — | istantaneo: gestione manuale | — | — |
| Infliggi ferite | `inflict-wounds` | SRD 5.1 / 1 | combattimento | — | — | — | istantaneo: gestione manuale | — | — |
| Ingrandire/ridurre | `enlarge-reduce` | SRD 5.1 / 2 | combattimento | singolo | TS:singolo | tracking, varianti | coperto | — | — |
| Insetto gigante | `giant-insect` | SRD 5.1 / 4 | combattimento | — | — | tracking | coperto | — | — |
| Interdizione alla morte | `death-ward` | SRD 5.1 / 4 | combattimento | — | — | tracking | coperto | — | — |
| Interdizione alle Lame | `phb2014-interdizione-alle-lame` | PHB 2014 / 0 | combattimento | — | turni | tracking, turni | coperto | — | — |
| Interdizione Primordiale | `xanathar-interdizione-primordiale` | Xanathar / 6 | combattimento | — | turni | tracking | parziale: revisione curata | P1 | trigger condizionale durante la durata assente; conseguenza alla fine della spell assente |
| Intermittenza | `blink` | SRD 5.1 / 3 | utilità/riferimento | — | turni | tracking | parziale: revisione curata | P1 | stato casuale ricorrente di turno assente; conseguenza alla fine della spell assente |
| Intimorire infernale | `hellish-rebuke` | SRD 5.1 / 1 | combattimento | singolo | TS:singolo | — | istantaneo: gestione manuale | — | — |
| Intralciare | `entangle` | SRD 5.1 / 1 | combattimento | area | area, TS:area, movimento | tracking, aree:zone, lifecycle, TS, status:Trattenuto, movimento | coperto | — | — |
| Inversione della gravità | `reverse-gravity` | SRD 5.1 / 7 | combattimento | — | riferimento TS | tracking, aree:zone, lifecycle, TS, movimento | parziale: revisione curata | P1 | ingresso, sospensione e caduta finale non risolti; trigger spaziali o di turno assenti |
| Investitura del Ghiaccio | `xanathar-investitura-del-ghiaccio` | Xanathar / 6 | combattimento | area | area, TS:area, movimento, turni, fasi/azioni | tracking, aree:aura/emission, lifecycle, TS, movimento, turni, fasi/azioni | coperto | — | — |
| Investitura del Vento | `xanathar-investitura-del-vento` | Xanathar / 6 | combattimento | area | area, TS:area, movimento, fasi/azioni | tracking, aree:instant, TS, movimento | parziale: revisione curata | P1 | azione ripetibile della spell assente; conseguenza alla fine della spell assente |
| Investitura della Fiamma | `xanathar-investitura-della-fiamma` | Xanathar / 6 | combattimento | area | area, TS:area, fasi/azioni | tracking, aree:instant, TS | parziale: revisione curata | P1 | azione ripetibile della spell assente; trigger spaziali o di turno assenti |
| Investitura della Pietra | `xanathar-investitura-della-pietra` | Xanathar / 6 | combattimento | area | TS:area, status:Stordito, movimento, turni, fasi/azioni | tracking, aree:instant, TS, status:Prono | parziale: revisione curata | P1 | azione ripetibile della spell assente; eccezioni e immunità ai costi di movimento assenti; conseguenza alla fine della spell assente |
| Inviare | `sending` | SRD 5.1 / 3 | utilità/riferimento | — | — | tracking, turni | coperto | — | — |
| Invisibilità | `invisibility` | SRD 5.1 / 2 | combattimento | — | status:Invisibile | tracking, TS, status:Invisibile | coperto | — | — |
| Invisibilità superiore | `greater-invisibility` | SRD 5.1 / 4 | combattimento | — | status:Invisibile | tracking, TS, status:Invisibile | coperto | — | — |
| Invocare il fulmine | `call-lightning` | SRD 5.1 / 3 | combattimento | area | TS:area, fasi/azioni | tracking, aree:instant, TS | parziale: revisione curata | P1 | azione ripetibile della spell assente |
| Invulnerabilità | `xanathar-invulnerabilita` | Xanathar / 9 | combattimento | — | — | tracking | coperto | — | — |
| Labirinto | `maze` | SRD 5.1 / 8 | utilità/riferimento | — | — | tracking | coperto | — | — |
| Lama d'Ombra | `xanathar-lama-dombra` | Xanathar / 2 | combattimento | — | turni, fasi/azioni | tracking | parziale: revisione curata | P1 | azione ripetibile della spell assente |
| Lama del Disastro | `tasha-lama-del-disastro` | Tasha / 9 | combattimento | — | area, ingresso/attraversamento, fasi/azioni | tracking | parziale: revisione curata | P1 | azione ripetibile della spell assente; azione di spostamento della zona assente |
| Lama infuocata | `flame-blade` | SRD 5.1 / 2 | combattimento | — | fasi/azioni | tracking | parziale: revisione curata | P1 | azione ripetibile della spell assente |
| Lama Roboante | `tasha-lama-roboante` | Tasha / 0 | combattimento | — | turni | tracking, turni | coperto | — | — |
| Lama Verdefiamma | `tasha-lama-verdefiamma` | Tasha / 0 | combattimento | — | — | — | istantaneo: gestione manuale | — | — |
| Legame con le Bestie | `xanathar-legame-con-le-bestie` | Xanathar / 1 | utilità/riferimento | — | — | tracking | coperto | — | — |
| Legame telepatico | `telepathic-bond` | SRD 5.1 / 5 | utilità/riferimento | — | — | tracking | coperto | — | — |
| Lentezza | `slow` | SRD 5.1 / 3 | combattimento | area | TS:area, turni | tracking, aree:instant, TS, movimento, turni | coperto | — | — |
| Lenza Elettrizzante | `tasha-lenza-elettrizzante` | Tasha / 0 | combattimento | singolo | TS:singolo | — | istantaneo: gestione manuale | — | — |
| Levitazione | `levitate` | SRD 5.1 / 2 | combattimento | — | riferimento TS | tracking | coperto | — | — |
| Libertà di movimento | `freedom-of-movement` | SRD 5.1 / 4 | utilità/riferimento | — | movimento | tracking | parziale: revisione curata | P1 | eccezioni e immunità ai costi di movimento assenti |
| Linguaggi | `tongues` | SRD 5.1 / 3 | utilità/riferimento | — | — | tracking | coperto | — | — |
| Localizza animali o vegetali | `locate-animals-or-plants` | SRD 5.1 / 2 | utilità/riferimento | — | — | — | riferimento/utilità | — | — |
| Localizza creatura | `locate-creature` | SRD 5.1 / 4 | utilità/riferimento | — | — | tracking | coperto | — | — |
| Localizza oggetto | `locate-object` | SRD 5.1 / 2 | utilità/riferimento | — | — | tracking | coperto | — | — |
| Loquacità | `glibness` | SRD 5.1 / 8 | utilità/riferimento | — | — | tracking | coperto | — | — |
| Luce | `light` | SRD 5.1 / 0 | combattimento | singolo | TS:singolo | tracking | coperto | — | — |
| Luce diurna | `daylight` | SRD 5.1 / 3 | utilità/riferimento | — | — | tracking, aree:zone, lifecycle, TS, movimento | coperto | — | — |
| Luci danzanti | `dancing-lights` | SRD 5.1 / 0 | utilità/riferimento | — | fasi/azioni | tracking | coperto | — | — |
| Luminescenza | `faerie-fire` | SRD 5.1 / 1 | combattimento | — | area, riferimento TS | tracking, aree:instant, TS | coperto | — | — |
| Maelstrom | `xanathar-maelstrom` | Xanathar / 5 | combattimento | area | area, TS:area, movimento | tracking, aree:zone, lifecycle, TS, movimento, turni | coperto | — | — |
| Mani brucianti | `burning-hands` | SRD 5.1 / 1 | combattimento | area | area, TS:area | aree:instant, TS | coperto | — | — |
| Mano arcana | `arcane-hand` | SRD 5.1 / 5 | combattimento | — | movimento, fasi/azioni | tracking | parziale: revisione curata | P1 | contatore o risorsa interna della spell assente; azione ripetibile della spell assente; azione di spostamento della zona assente |
| Mano magica | `mage-hand` | SRD 5.1 / 0 | utilità/riferimento | — | — | tracking | coperto | — | — |
| Manto del Crociato | `legacy-crusaders-mantle` | Legacy / 3 | utilità/riferimento | — | — | tracking | revisione: testo mancante | P2 | testo regolamentare locale mancante |
| Messaggio | `message` | SRD 5.1 / 0 | utilità/riferimento | — | — | tracking, turni | coperto | — | — |
| Metamorfosi | `polymorph` | SRD 5.1 / 4 | combattimento | singolo | TS:singolo | tracking | coperto | — | — |
| Metamorfosi pura | `true-polymorph` | SRD 5.1 / 9 | combattimento | — | riferimento TS | tracking | coperto | — | — |
| Minuscole Meteore di Melf | `xanathar-minuscole-meteore-di-melf` | Xanathar / 3 | combattimento | area | TS:area, turni | tracking, aree:instant, TS | coperto | — | — |
| Miscela Caustica di Tasha | `tasha-miscela-caustica-di-tasha` | Tasha / 1 | combattimento | area | area, TS:area | tracking, aree:instant, TS | coperto | — | — |
| Modellare Acqua | `xanathar-modellare-acqua` | Xanathar / 0 | combattimento | — | area | tracking | parziale: revisione curata | P1 | geometria d'area assente; varianti rilevanti non modellate |
| Modellare Terra | `xanathar-modellare-terra` | Xanathar / 0 | combattimento | — | area, movimento, effetto istantaneo persistente | tracking | parziale: revisione curata | P1 | geometria d'area assente; varianti rilevanti non modellate; meccanica di movimento assente |
| Morsa del Gelo | `xanathar-morsa-del-gelo` | Xanathar / 0 | combattimento | singolo | TS:singolo, turni | tracking, turni | istantaneo: gestione manuale | — | — |
| Morte Apparente | `phb2014-morte-apparente` | PHB 2014 / 3 | combattimento | — | status:Accecato/Incapacitato/Avvelenato, movimento | tracking, TS, status:Accecato/Incapacitato, movimento | coperto | — | — |
| Movimenti del ragno | `spider-climb` | SRD 5.1 / 2 | utilità/riferimento | — | — | tracking, movimento | coperto | — | — |
| Muovere il terreno | `move-earth` | SRD 5.1 / 6 | utilità/riferimento | — | varianti | tracking, aree:zone, lifecycle, TS, movimento | coperto | — | — |
| Muro d'Acqua | `xanathar-muro-dacqua` | Xanathar / 3 | combattimento | — | movimento, ingresso/attraversamento | tracking | parziale: revisione curata | P1 | meccanica di movimento assente; trigger condizionale durante la durata assente |
| Muro di forza | `wall-of-force` | SRD 5.1 / 5 | combattimento | — | ingresso/attraversamento | tracking | coperto | — | — |
| Muro di fuoco | `wall-of-fire` | SRD 5.1 / 4 | combattimento | area | area, TS:area, ingresso/attraversamento | tracking, aree:zone, lifecycle, TS, movimento, turni | parziale: revisione curata | P1 | lato caldo e fascia adiacente non modellati; attraversamento continuo non rilevato; progressione con lo slot non applicata al trigger |
| Muro di ghiaccio | `wall-of-ice` | SRD 5.1 / 6 | combattimento | area | area, TS:area, ingresso/attraversamento | tracking, aree:zone, lifecycle, TS, movimento | coperto | — | — |
| Muro di Luce | `xanathar-muro-di-luce` | Xanathar / 5 | combattimento | area | TS:area, ingresso/attraversamento, fasi/azioni | tracking, aree:zone, lifecycle, TS, status:Accecato, movimento, turni | parziale: revisione curata | P1 | contatore o risorsa interna della spell assente; azione ripetibile della spell assente; effetto ricorrente di turno assente |
| Muro di pietra | `wall-of-stone` | SRD 5.1 / 5 | combattimento | — | riferimento TS | tracking | coperto | — | — |
| Muro di Sabbia | `xanathar-muro-di-sabbia` | Xanathar / 3 | utilità/riferimento | — | — | tracking | coperto | — | — |
| Muro di spine | `wall-of-thorns` | SRD 5.1 / 6 | combattimento | area | area, TS:area, ingresso/attraversamento | tracking, aree:zone, lifecycle, TS, movimento, turni | coperto | — | — |
| Muro di vento | `wind-wall` | SRD 5.1 / 3 | combattimento | area | area, TS:area, ingresso/attraversamento | tracking, aree:zone, lifecycle, TS, movimento | parziale: revisione curata | P1 | vincoli a proiettili e attraversamento assenti; attraversamento continuo non rilevato |
| Muro prismatico | `prismatic-wall` | SRD 5.1 / 9 | combattimento | area | area, TS:area, status:Pietrificato, turni, ingresso/attraversamento | tracking, aree:zone, lifecycle, TS, status:Accecato, movimento, varianti | parziale: revisione curata | P1 | strati distruttibili e stato per strato assenti; attraversamento continuo non rilevato; sequenza di più TS e uscita dalla condizione incompleta |
| Nemici in Abbondanza | `xanathar-nemici-in-abbondanza` | Xanathar / 3 | combattimento | singolo | TS:singolo | tracking, turni | coperto | — | — |
| Nube di nebbia | `fog-cloud` | SRD 5.1 / 1 | utilità/riferimento | — | — | tracking, aree:zone, lifecycle, TS, status:Accecato, movimento | coperto | — | — |
| Nube di Pugnali | `phb2014-nube-di-pugnali` | PHB 2014 / 2 | combattimento | — | area, ingresso/attraversamento | tracking, aree:zone, lifecycle, TS, movimento, turni | coperto | — | — |
| Nube incendiaria | `incendiary-cloud` | SRD 5.1 / 8 | combattimento | area | area, TS:area, ingresso/attraversamento | tracking, aree:zone, lifecycle, TS, status:Accecato, movimento, turni | coperto | — | — |
| Nube maleodorante | `stinking-cloud` | SRD 5.1 / 3 | combattimento | area | TS:area, turni | tracking, aree:zone, lifecycle, TS, status:Accecato, movimento, turni | coperto | — | — |
| Nube mortale | `cloudkill` | SRD 5.1 / 5 | combattimento | area | area, TS:area, ingresso/attraversamento | tracking, aree:zone, lifecycle, TS, status:Accecato, movimento, turni | coperto | — | — |
| Occhio arcano | `arcane-eye` | SRD 5.1 / 4 | utilità/riferimento | — | ingresso/attraversamento | tracking | coperto | — | — |
| Ombra di Moil | `xanathar-ombra-di-moil` | Xanathar / 4 | combattimento | — | — | tracking | coperto | — | — |
| Onda di Marea | `xanathar-onda-di-marea` | Xanathar / 3 | combattimento | area | TS:area | aree:instant, TS, status:Prono | istantaneo: gestione manuale | — | — |
| Onda Distruttiva | `phb2014-onda-distruttiva` | PHB 2014 / 5 | combattimento | area | area, TS:area | aree:instant, TS, status:Prono | coperto | — | — |
| Onda tonante | `thunderwave` | SRD 5.1 / 1 | combattimento | area | area, TS:area | aree:instant, TS | coperto | — | — |
| Orrido Avvizzimento di Abi-Dalzim | `xanathar-orrido-avvizzimento-di-abi-dalzim` | Xanathar / 8 | combattimento | area | area, TS:area | aree:instant, TS | coperto | — | — |
| Oscurità | `darkness` | SRD 5.1 / 2 | utilità/riferimento | — | — | tracking, aree:zone, lifecycle, TS, status:Accecato, movimento | coperto | — | — |
| Oscurità della Follia | `xanathar-oscurita-della-follia` | Xanathar / 8 | combattimento | area | area, TS:area | tracking, aree:zone, lifecycle, TS, status:Accecato, movimento, turni | coperto | — | — |
| Ossa della Terra | `xanathar-ossa-della-terra` | Xanathar / 6 | combattimento | singolo | TS:singolo, movimento | — | istantaneo: gestione manuale | — | — |
| Palla di fuoco | `fireball` | SRD 5.1 / 3 | combattimento | area | area, TS:area | aree:instant, TS | coperto | — | — |
| Palla di fuoco ritardata | `delayed-blast-fireball` | SRD 5.1 / 7 | combattimento | area | area, TS:area, fasi/azioni | tracking, aree:instant, TS | parziale: revisione curata | P1 | detonazione e accumulo alla terminazione assenti; contatore o risorsa interna della spell assente; trigger condizionale durante la durata assente |
| Parlare con gli animali | `speak-with-animals` | SRD 5.1 / 1 | utilità/riferimento | — | — | tracking | coperto | — | — |
| Parlare con i morti | `speak-with-dead` | SRD 5.1 / 3 | utilità/riferimento | — | — | tracking | coperto | — | — |
| Parlare con i vegetali | `speak-with-plants` | SRD 5.1 / 3 | utilità/riferimento | — | movimento | tracking, aree:aura, lifecycle, TS | parziale: revisione curata | P1 | meccanica di movimento assente; varianti rilevanti non modellate |
| Parola del Potere Dolore | `xanathar-parola-del-potere-dolore` | Xanathar / 7 | combattimento | — | riferimento TS, movimento | tracking, movimento, turni | istantaneo: gestione manuale | — | — |
| Parola del Potere Guarire | `phb2014-parola-del-potere-guarire` | PHB 2014 / 9 | combattimento | — | — | — | istantaneo: gestione manuale | — | — |
| Parola del potere stordire | `power-word-stun` | SRD 5.1 / 8 | combattimento | singolo | TS:singolo, status:Stordito | tracking, TS, status:Stordito | istantaneo: gestione manuale | — | — |
| Parola del potere uccidere | `power-word-kill` | SRD 5.1 / 9 | combattimento | — | — | — | istantaneo: gestione manuale | — | — |
| Parola del ritiro | `word-of-recall` | SRD 5.1 / 6 | utilità/riferimento | — | — | — | riferimento/utilità | — | — |
| Parola divina | `divine-word` | SRD 5.1 / 7 | combattimento | area | TS:area, effetto istantaneo persistente | aree:instant, TS | coperto | — | — |
| Parola guaritrice | `healing-word` | SRD 5.1 / 1 | combattimento | — | — | — | istantaneo: gestione manuale | — | — |
| Parola guaritrice di massa | `mass-healing-word` | SRD 5.1 / 3 | combattimento | — | — | — | istantaneo: gestione manuale | — | — |
| Parola Radiosa | `xanathar-parola-radiosa` | Xanathar / 0 | combattimento | area | TS:area | aree:instant, TS | istantaneo: gestione manuale | — | — |
| Passapareti | `passwall` | SRD 5.1 / 5 | combattimento | — | — | tracking | coperto | — | — |
| Passare senza tracce | `pass-without-trace` | SRD 5.1 / 2 | utilità/riferimento | — | — | tracking | coperto | — | — |
| Passo del Tuono | `xanathar-passo-del-tuono` | Xanathar / 3 | combattimento | area | TS:area | aree:instant, TS | istantaneo: gestione manuale | — | — |
| Passo Remoto | `xanathar-passo-remoto` | Xanathar / 5 | utilità/riferimento | — | — | tracking | coperto | — | — |
| Passo velato | `misty-step` | SRD 5.1 / 2 | utilità/riferimento | — | — | — | riferimento/utilità | — | — |
| Passo veloce | `longstrider` | SRD 5.1 / 1 | utilità/riferimento | — | movimento | tracking, movimento | coperto | — | — |
| Paura | `fear` | SRD 5.1 / 3 | combattimento | area | area, TS:area | tracking, aree:instant, TS, status:Spaventato, turni | coperto | — | — |
| Pelle coriacea | `barkskin` | SRD 5.1 / 2 | utilità/riferimento | — | — | tracking | coperto | — | — |
| Pelle di pietra | `stoneskin` | SRD 5.1 / 4 | combattimento | — | — | tracking | coperto | — | — |
| Percezione delle Bestie | `phb2014-percezione-delle-bestie` | PHB 2014 / 2 | combattimento | — | status:Accecato/Assordato | tracking, TS, status:Accecato/Assordato | coperto | — | — |
| Piaga degli insetti | `insect-plague` | SRD 5.1 / 5 | combattimento | area | area, TS:area, movimento, ingresso/attraversamento | tracking, aree:zone, lifecycle, TS, movimento, turni | coperto | — | — |
| Pietra Magica | `xanathar-pietra-magica` | Xanathar / 0 | combattimento | — | — | tracking | coperto | — | — |
| Pirotecnica | `xanathar-pirotecnica` | Xanathar / 2 | combattimento | area | area, TS:area, turni, effetto istantaneo persistente | tracking, aree:instant, TS, status:Accecato, turni, varianti | coperto | — | — |
| Porta dimensionale | `dimension-door` | SRD 5.1 / 4 | combattimento | — | — | — | istantaneo: gestione manuale | — | — |
| Portale | `gate` | SRD 5.1 / 9 | utilità/riferimento | — | ingresso/attraversamento | tracking | coperto | — | — |
| Portale Arcano | `phb2014-portale-arcano` | PHB 2014 / 6 | utilità/riferimento | — | ingresso/attraversamento | tracking, TS | coperto | — | — |
| Prestidigitazione | `prestidigitation` | SRD 5.1 / 0 | utilità/riferimento | — | turni | tracking | coperto | — | — |
| Prigione Mentale | `xanathar-prigione-mentale` | Xanathar / 6 | combattimento | singolo | TS:singolo, status:Trattenuto | tracking, TS, status:Trattenuto | coperto | — | — |
| Produrre fiamma | `produce-flame` | SRD 5.1 / 0 | combattimento | — | turni | tracking | coperto | — | — |
| Protezione dai veleni | `protection-from-poison` | SRD 5.1 / 2 | combattimento | — | — | tracking | coperto | — | — |
| Protezione dal bene e dal male | `protection-from-evil-and-good` | SRD 5.1 / 1 | combattimento | — | riferimento TS | tracking | coperto | — | — |
| Protezione dall'energia | `protection-from-energy` | SRD 5.1 / 3 | combattimento | — | — | tracking, varianti | coperto | — | — |
| Punizione Accecante | `phb2014-punizione-accecante` | PHB 2014 / 3 | combattimento | singolo | TS:singolo | tracking, TS, status:Accecato, turni, fasi/azioni | coperto | — | — |
| Punizione Collerica | `phb2014-punizione-collerica` | PHB 2014 / 1 | combattimento | singolo | TS:singolo, status:Spaventato | tracking, TS, status:Spaventato, fasi/azioni | coperto | — | — |
| Punizione Demoralizzante | `phb2014-punizione-demoralizzante` | PHB 2014 / 4 | combattimento | singolo | TS:singolo, turni | tracking, TS, turni, fasi/azioni | coperto | — | — |
| Punizione Esiliante | `phb2014-punizione-esiliante` | PHB 2014 / 5 | combattimento | — | status:Incapacitato | tracking, status:Incapacitato, fasi/azioni, varianti | coperto | — | — |
| Punizione Incandescente | `phb2014-punizione-incandescente` | PHB 2014 / 1 | combattimento | singolo | TS:singolo | tracking, turni, fasi/azioni | coperto | — | — |
| Punizione marchiante | `branding-smite` | SRD 5.1 / 2 | combattimento | — | status:Invisibile | tracking | parziale: revisione curata | P1 | trigger condizionale durante la durata assente; regole passive e limitazioni della spell incomplete |
| Punizione Tonante | `phb2014-punizione-tonante` | PHB 2014 / 1 | combattimento | singolo | TS:singolo, status:Prono | tracking, TS, status:Prono, fasi/azioni | coperto | — | — |
| Purificare cibo e bevande | `purify-food-and-drink` | SRD 5.1 / 1 | utilità/riferimento | — | — | — | riferimento/utilità | — | — |
| Raffica di Spine | `phb2014-raffica-di-spine` | PHB 2014 / 1 | combattimento | area | TS:area | tracking, aree:instant, TS, fasi/azioni | coperto | — | — |
| Raggio di affaticamento | `ray-of-enfeeblement` | SRD 5.1 / 2 | combattimento | — | riferimento TS | tracking, TS | coperto | — | — |
| Raggio di gelo | `ray-of-frost` | SRD 5.1 / 0 | combattimento | — | movimento, turni, effetto istantaneo persistente | tracking, movimento, turni | coperto | — | — |
| Raggio di Infermità | `phb2014-raggio-di-infermita` | PHB 2014 / 1 | combattimento | singolo | TS:singolo, status:Avvelenato, turni | tracking, TS, status:Avvelenato, turni | istantaneo: gestione manuale | — | — |
| Raggio rovente | `scorching-ray` | SRD 5.1 / 2 | combattimento | — | — | — | istantaneo: gestione manuale | — | — |
| Ragnatela | `web` | SRD 5.1 / 2 | combattimento | area | area, TS:area, movimento, turni, ingresso/attraversamento | tracking, aree:zone, lifecycle, TS, status:Trattenuto, movimento, turni | coperto | — | — |
| Rampicante Afferrante | `phb2014-rampicante-afferrante` | PHB 2014 / 4 | combattimento | singolo | TS:singolo | tracking, TS | coperto | — | — |
| Randello incantato | `shillelagh` | SRD 5.1 / 0 | combattimento | — | — | tracking | coperto | — | — |
| Regressione mentale | `feeblemind` | SRD 5.1 / 8 | combattimento | singolo | TS:singolo | — | istantaneo: gestione manuale | — | — |
| Resistenza | `resistance` | SRD 5.1 / 0 | combattimento | — | riferimento TS | tracking | coperto | — | — |
| Respirare sott'acqua | `water-breathing` | SRD 5.1 / 3 | utilità/riferimento | — | — | tracking | coperto | — | — |
| Rimuovi maledizione | `remove-curse` | SRD 5.1 / 3 | utilità/riferimento | — | — | — | riferimento/utilità | — | — |
| Rinascita | `revivify` | SRD 5.1 / 3 | utilità/riferimento | — | — | — | riferimento/utilità | — | — |
| Rintocco dei Morti | `xanathar-rintocco-dei-morti` | Xanathar / 0 | combattimento | singolo | TS:singolo | — | istantaneo: gestione manuale | — | — |
| Riposo inviolato | `gentle-repose` | SRD 5.1 / 2 | utilità/riferimento | — | — | tracking | coperto | — | — |
| Risata incontenibile | `hideous-laughter` | SRD 5.1 / 1 | combattimento | singolo | TS:singolo, status:Incapacitato/Prono | tracking, TS, status:Prono/Incapacitato | coperto | — | — |
| Riscaldare il metallo | `heat-metal` | SRD 5.1 / 2 | combattimento | singolo | TS:singolo, turni, fasi/azioni | tracking, TS, turni, fasi/azioni | coperto | — | — |
| Ristorare inferiore | `lesser-restoration` | SRD 5.1 / 2 | utilità/riferimento | — | — | — | riferimento/utilità | — | — |
| Ristorare superiore | `greater-restoration` | SRD 5.1 / 5 | combattimento | — | — | — | istantaneo: gestione manuale | — | — |
| Ritirata rapida | `expeditious-retreat` | SRD 5.1 / 1 | utilità/riferimento | — | — | tracking | coperto | — | — |
| Rombo di Tuono | `xanathar-rombo-di-tuono` | Xanathar / 0 | combattimento | area | TS:area | aree:instant, TS | istantaneo: gestione manuale | — | — |
| Saltare | `jump` | SRD 5.1 / 1 | utilità/riferimento | — | — | tracking | coperto | — | — |
| Salvare i morenti | `spare-the-dying` | SRD 5.1 / 0 | combattimento | — | — | — | istantaneo: gestione manuale | — | — |
| Santuario | `sanctuary` | SRD 5.1 / 1 | combattimento | singolo | TS:singolo | tracking | coperto | — | — |
| Scagliare maledizione | `bestow-curse` | SRD 5.1 / 3 | combattimento | singolo | TS:singolo | tracking, turni, varianti | coperto | — | — |
| Scassinare | `knock` | SRD 5.1 / 2 | utilità/riferimento | — | effetto istantaneo persistente | — | riferimento/utilità | — | — |
| Scheggia della Mente | `tasha-scheggia-della-mente` | Tasha / 0 | combattimento | singolo | TS:singolo, turni | tracking, turni | coperto | — | — |
| Sciame di meteore | `meteor-swarm` | SRD 5.1 / 9 | combattimento | area | area, TS:area | aree:instant, TS | coperto | — | — |
| Sciame di Palle di Neve di Snilloc | `xanathar-sciame-di-palle-di-neve-di-snilloc` | Xanathar / 2 | combattimento | area | area, TS:area | aree:instant, TS | coperto | — | — |
| Scolpire pietra | `stone-shape` | SRD 5.1 / 4 | utilità/riferimento | — | — | — | riferimento/utilità | — | — |
| Scopri trappole | `find-traps` | SRD 5.1 / 2 | utilità/riferimento | — | — | — | riferimento/utilità | — | — |
| Scossa Sinaptica | `xanathar-scossa-sinaptica` | Xanathar / 5 | combattimento | area | area, TS:area, effetto istantaneo persistente | tracking, aree:instant, TS, turni | coperto | — | — |
| Scossa Tellurica | `xanathar-scossa-tellurica` | Xanathar / 1 | combattimento | area | TS:area, movimento | aree:instant, TS, status:Prono | istantaneo: gestione manuale | — | — |
| Scrigno segreto | `secret-chest` | SRD 5.1 / 4 | utilità/riferimento | — | fasi/azioni | — | riferimento/utilità | — | — |
| Scritta Celeste | `xanathar-scritta-celeste` | Xanathar / 2 | utilità/riferimento | — | — | tracking | coperto | — | — |
| Scudiscio Mentale di Tasha | `legacy-tashas-mind-whip` | Legacy / 2 | combattimento | multiplo | TS:multiplo, turni | tracking, TS, turni | coperto | — | — |
| Scudo | `shield` | SRD 5.1 / 1 | combattimento | — | turni | tracking, turni | coperto | — | — |
| Scudo della fede | `shield-of-faith` | SRD 5.1 / 1 | utilità/riferimento | — | — | tracking | coperto | — | — |
| Scudo di fuoco | `fire-shield` | SRD 5.1 / 4 | combattimento | — | — | tracking | coperto | — | — |
| Scurovisione | `darkvision` | SRD 5.1 / 2 | utilità/riferimento | — | — | tracking | coperto | — | — |
| Sembrare | `seeming` | SRD 5.1 / 5 | combattimento | — | riferimento TS | tracking | coperto | — | — |
| Semipiano | `demiplane` | SRD 5.1 / 8 | utilità/riferimento | — | — | tracking | coperto | — | — |
| Serratura arcana | `arcane-lock` | SRD 5.1 / 2 | utilità/riferimento | — | — | tracking | coperto | — | — |
| Sfera Acquea | `xanathar-sfera-acquea` | Xanathar / 4 | combattimento | area | area, TS:area | tracking, aree:zone, lifecycle, TS, status:Trattenuto, movimento, turni | coperto | — | — |
| Sfera al Vetriolo | `xanathar-sfera-al-vetriolo` | Xanathar / 4 | combattimento | area | area, TS:area, turni, effetto istantaneo persistente | aree:instant, TS, turni | coperto | — | — |
| Sfera congelante | `freezing-sphere` | SRD 5.1 / 6 | combattimento | area | area, TS:area | aree:instant, TS | coperto | — | — |
| Sfera della Tempesta | `xanathar-sfera-della-tempesta` | Xanathar / 4 | combattimento | area | area, TS:area, movimento, fasi/azioni | tracking, aree:zone, lifecycle, TS, movimento, turni | parziale: revisione curata | P1 | azione ripetibile della spell assente; effetto ricorrente di turno assente |
| Sfera elastica | `resilient-sphere` | SRD 5.1 / 4 | combattimento | singolo | TS:singolo, ingresso/attraversamento | tracking | coperto | — | — |
| Sfera infuocata | `flaming-sphere` | SRD 5.1 / 2 | combattimento | area | TS:area, movimento, ingresso/attraversamento, fasi/azioni | tracking, aree:zone, lifecycle, TS, movimento, turni | coperto | — | — |
| Sfocatura | `blur` | SRD 5.1 / 2 | utilità/riferimento | — | — | tracking | coperto | — | — |
| Sguardo penetrante | `eyebite` | SRD 5.1 / 6 | combattimento | singolo | TS:singolo, status:Privo di sensi/Spaventato, fasi/azioni | tracking, TS, status:Privo di sensi/Spaventato, turni, fasi/azioni, varianti | coperto | — | — |
| Silenzio | `silence` | SRD 5.1 / 2 | combattimento | — | area | tracking, aree:zone, lifecycle, TS, status:Assordato, movimento | coperto | — | — |
| Soffio del Drago | `xanathar-soffio-del-drago` | Xanathar / 2 | combattimento | area | area, TS:area | tracking, aree:instant, TS | coperto | — | — |
| Sonnellino | `xanathar-sonnellino` | Xanathar / 3 | combattimento | — | — | tracking, TS, status:Privo di sensi | coperto | — | — |
| Sonno | `sleep` | SRD 5.1 / 1 | combattimento | — | area | tracking, aree:instant, TS, status:Privo di sensi | coperto | — | — |
| Spada arcana | `arcane-sword` | SRD 5.1 / 7 | combattimento | — | fasi/azioni | tracking | parziale: revisione curata | P1 | azione ripetibile della spell assente; azione di spostamento della zona assente |
| Spirito Guaritore | `xanathar-spirito-guaritore` | Xanathar / 2 | combattimento | — | area, fasi/azioni | tracking, aree:zone, lifecycle, TS, movimento, turni | coperto | — | — |
| Spostamento planare | `plane-shift` | SRD 5.1 / 7 | combattimento | singolo | TS:singolo | — | istantaneo: gestione manuale | — | — |
| Spruzzo colorato | `color-spray` | SRD 5.1 / 1 | combattimento | — | — | tracking, aree:instant, TS, status:Accecato, turni | coperto | — | — |
| Spruzzo prismatico | `prismatic-spray` | SRD 5.1 / 7 | combattimento | area | area, TS:area, status:Trattenuto/Pietrificato/Accecato, turni | aree:instant, TS, varianti | parziale: revisione curata | P1 | esito casuale e relativo stato non rappresentati; sequenza di più TS e uscita dalla condizione incompleta; condizione o stato RAW non rappresentato |
| Spruzzo velenoso | `poison-spray` | SRD 5.1 / 0 | combattimento | singolo | TS:singolo | — | istantaneo: gestione manuale | — | — |
| Stretta della Terra di Maximilian | `xanathar-stretta-della-terra-di-maximilian` | Xanathar / 2 | combattimento | singolo | TS:singolo, status:Trattenuto | tracking, TS, status:Trattenuto | coperto | — | — |
| Stretta folgorante | `shocking-grasp` | SRD 5.1 / 0 | combattimento | — | turni | — | istantaneo: gestione manuale | — | — |
| Sudario Spirituale | `tasha-sudario-spirituale` | Tasha / 3 | combattimento | — | movimento, turni | tracking, varianti | parziale: revisione curata | P1 | trigger condizionale durante la durata assente; meccanica di movimento assente; effetto ricorrente di turno assente |
| Suggestione | `suggestion` | SRD 5.1 / 2 | combattimento | — | — | tracking | coperto | — | — |
| Suggestione di massa | `mass-suggestion` | SRD 5.1 / 6 | combattimento | singolo | TS:singolo | tracking | coperto | — | — |
| Sussurri Dissonanti | `phb2014-sussurri-dissonanti` | PHB 2014 / 1 | combattimento | singolo | TS:singolo | — | istantaneo: gestione manuale | — | — |
| Taumaturgia | `thaumaturgy` | SRD 5.1 / 0 | utilità/riferimento | — | — | tracking | coperto | — | — |
| Telecinesi | `telekinesis` | SRD 5.1 / 5 | utilità/riferimento | — | turni, fasi/azioni | tracking | parziale: revisione curata | P1 | azione ripetibile della spell assente; condizione o stato RAW non rappresentato |
| Telepatia | `phb2014-telepatia` | PHB 2014 / 8 | utilità/riferimento | — | — | tracking | coperto | — | — |
| Teletrasporto | `teleport` | SRD 5.1 / 7 | combattimento | — | — | — | istantaneo: gestione manuale | — | — |
| Tempesta di fuoco | `fire-storm` | SRD 5.1 / 7 | combattimento | area | area, TS:area | aree:instant, TS | coperto | — | — |
| Tempesta di ghiaccio | `ice-storm` | SRD 5.1 / 4 | combattimento | area | area, TS:area, movimento, turni | aree:instant, TS | coperto | — | — |
| Tempesta di nevischio | `sleet-storm` | SRD 5.1 / 3 | combattimento | area | area, TS:area, movimento, ingresso/attraversamento | tracking, aree:zone, lifecycle, TS, status:Accecato/Prono, movimento, turni | coperto | — | — |
| Tempesta di vendetta | `storm-of-vengeance` | SRD 5.1 / 9 | combattimento | area | area, TS:area, movimento, turni | tracking, aree:zone, lifecycle, TS, status:Assordato, movimento, varianti | parziale: revisione curata | P1 | progressione degli effetti per round assente; condizione o stato RAW non rappresentato; meccanica di movimento assente |
| Tentacoli neri | `black-tentacles` | SRD 5.1 / 4 | combattimento | area | area, TS:area, movimento, ingresso/attraversamento | tracking, aree:zone, lifecycle, TS, status:Trattenuto, movimento, turni | coperto | — | — |
| Terremoto | `earthquake` | SRD 5.1 / 8 | combattimento | area | area, TS:area, movimento, turni | tracking, aree:zone, lifecycle, TS, status:Prono, movimento, turni | parziale: revisione curata | P1 | sottozona figlia non modellata; runtime specifico delle modalità incompleto |
| Tocco del vampiro | `vampiric-touch` | SRD 5.1 / 3 | combattimento | — | — | tracking | coperto | — | — |
| Tocco gelido | `chill-touch` | SRD 5.1 / 0 | combattimento | — | turni | tracking, turni | coperto | — | — |
| Trama ipnotica | `hypnotic-pattern` | SRD 5.1 / 3 | combattimento | area | TS:area, movimento | tracking, aree:instant, TS, status:Affascinato/Incapacitato, movimento | coperto | — | — |
| Trasferimento di Vita | `xanathar-trasferimento-di-vita` | Xanathar / 3 | combattimento | — | — | — | istantaneo: gestione manuale | — | — |
| Trasformazione | `shapechange` | SRD 5.1 / 9 | combattimento | — | fasi/azioni | tracking | parziale: revisione curata | P1 | azione ripetibile della spell assente; varianti rilevanti non modellate |
| Trasformazione di Tenser | `xanathar-trasformazione-di-tenser` | Xanathar / 6 | combattimento | singolo | TS:singolo, status:Indebolimento, fasi/azioni | tracking | coperto | — | — |
| Traslazione arborea | `tree-stride` | SRD 5.1 / 5 | utilità/riferimento | — | — | tracking | coperto | — | — |
| Trasmutare Roccia | `xanathar-trasmutare-roccia` | Xanathar / 5 | combattimento | area | area, TS:area, ingresso/attraversamento, varianti | tracking, aree:zone, lifecycle, TS, status:Trattenuto, movimento | parziale: revisione curata | P1 | varianti della zona e relativi trigger incomplete; meccanica di movimento assente; trigger spaziali o di turno assenti |
| Trasporto vegetale | `transport-via-plants` | SRD 5.1 / 6 | utilità/riferimento | — | ingresso/attraversamento | tracking, turni | coperto | — | — |
| Trucco della corda | `rope-trick` | SRD 5.1 / 2 | utilità/riferimento | — | ingresso/attraversamento | tracking | coperto | — | — |
| Turbine | `xanathar-turbine` | Xanathar / 7 | combattimento | area | area, TS:area, ingresso/attraversamento, fasi/azioni | tracking, aree:zone, lifecycle, TS, movimento, varianti | parziale: revisione curata | P1 | movimento manuale della zona non risolto; sequenza di più TS e uscita dalla condizione incompleta; ingresso, sospensione e caduta finale non risolti |
| Turbine di Spade | `tasha-turbine-di-spade` | Tasha / 0 | combattimento | area | area, TS:area | aree:instant, TS | coperto | — | — |
| Unto | `grease` | SRD 5.1 / 1 | combattimento | area | area, TS:area, movimento, ingresso/attraversamento | tracking, aree:zone, lifecycle, TS, status:Prono, movimento, turni | coperto | — | — |
| Urlo Psichico | `xanathar-urlo-psichico` | Xanathar / 9 | combattimento | multiplo | TS:multiplo, status:Stordito | tracking, TS, status:Stordito | istantaneo: gestione manuale | — | — |
| Vampa di Aganazzar | `xanathar-vampa-di-aganazzar` | Xanathar / 2 | combattimento | area | TS:area | aree:instant, TS | istantaneo: gestione manuale | — | — |
| Vedere invisibilità | `see-invisibility` | SRD 5.1 / 2 | utilità/riferimento | — | — | tracking | coperto | — | — |
| Velocità | `haste` | SRD 5.1 / 3 | combattimento | — | movimento, turni | tracking, movimento | coperto | — | — |
| Vento di Interdizione | `xanathar-vento-di-interdizione` | Xanathar / 2 | utilità/riferimento | — | movimento | tracking, aree:aura, lifecycle, TS, status:Assordato, movimento | coperto | — | — |
| Vincolo della Terra | `xanathar-vincolo-della-terra` | Xanathar / 2 | combattimento | singolo | TS:singolo, movimento | tracking, movimento | coperto | — | — |
| Vincolo di interdizione | `warding-bond` | SRD 5.1 / 2 | combattimento | — | — | tracking | coperto | — | — |
| Visione del vero | `true-seeing` | SRD 5.1 / 6 | utilità/riferimento | — | — | tracking | coperto | — | — |
| Vita falsata | `false-life` | SRD 5.1 / 1 | combattimento | — | — | tracking | coperto | — | — |
| Volare | `fly` | SRD 5.1 / 3 | utilità/riferimento | — | movimento | tracking, movimento | coperto | — | — |
| Vuoto mentale | `mind-blank` | SRD 5.1 / 8 | combattimento | — | — | tracking | coperto | — | — |

## Dati macchina

La versione completa con condizioni rilevate, ID delle regole, trigger ed estratti di evidenza è in `data/spell-automation-audit.json`.

