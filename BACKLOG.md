# Backlog

Il backlog contiene il lavoro ancora incompleto rispetto allo stato corrente
del repository. La sezione 1.3 è conservata come riferimento storico; le
funzioni successive sono documentate anche in
[Incantesimi, zone e reminder](docs/INCANTESIMI_E_ZONE.md).

Il riferimento generale è [Indice della documentazione](docs/INDICE.md).

## Completato in v1.3.0

- Stabilizzazione del tracker con rendering incrementale, protezioni contro lo stato obsoleto e diagnostica dei render.
- Console HP multi-bersaglio con danno, cura, HP temporanei, fattori per bersaglio e Undo.
- Gestione riconciliata degli effetti locali sulla mappa, con condizioni, incantesimi, concentrazione e scadenze persistenti.
- Targeting geometrico AoE con forme persistenti, riselezione dei bersagli e applicazione dei tiri salvezza di area supportati.
- Catalogo degli incantesimi dei supplementi 2014, con controlli di integrità e documentazione delle scadenze da verificare manualmente.

## Completato dopo v1.3.0 nel repository

- Registro globale degli incantesimi attivi condiviso tra pannello Incantesimi
  e Console effetti ad area.
- Reminder di tiro salvezza ed effetti a inizio/fine turno, con aggregazione,
  sostituzione al cambio attore, CD del caster e conseguenze informative.
- Motore dichiarativo per zone persistenti, aure mobili, membership,
  attraversamento e terreno difficile.
- Pulizia di zone, aure e condizioni figlie al termine naturale o alla rottura
  della concentrazione.
- Risoluzione differita degli incantesimi preparati e azioni attive dal
  registro.
- Azioni rapide persistenti nelle schede personaggio.
- Automazioni dei principali incantesimi da combattimento elencati nella
  documentazione corrente.
- Guscio Anti-vita: PASS con spell instance, concentrazione, durata, aura mobile
  di 3 m, confine visuale e cleanup shared; crossing e collisione restano manuali.
- Palla di Fuoco Ritardata: PASS/PARTIAL-CLOSED con perla persistente, accumulo
  fino a +10d6, detonazione terminale su ogni uscita dalla concentrazione,
  risoluzione area, History/Undo e interazioni manuali al tavolo.
- Muro di Vento: PASS/PARTIAL-ACCEPTED con placement lineare, TS Forza e danno
  iniziale, zona statica, concentrazione e cleanup shared; proiettili, crossing
  e vincoli passivi restano manuali accettati.
- Muro Prismatico: PASS/PARTIAL-ACCEPTED con una parent instance, placement
  muro/sfera nel subset geometrico supportato, hot zone visibile, esenzioni per
  instance, popup automatico al crossing del movimento, risoluzione GM dei
  sette strati, Indaco, Viola, gestione ordinata dei layer, cleanup e
  History/Undo. Visuale RAW, distruzione degli strati, passivi, proiettili,
  blocco/rollback del movimento e trasferimento planare restano manuali.
- Turbine: FULL/ACCEPTED con cast, placement cilindrico, concentrazione,
  comparsa iniziale, trigger di ingresso/attraversamento una-volta-per-turno,
  TS Destrezza con danno 10d6, gate Grande o inferiore e TS Forza condizionale,
  Trattenuto scoped alla parent instance, attachment OBR del target,
  trascinamento XY durante il movimento manuale del GM, quota canonica,
  azione di fuga, cleanup e History/Undo. Restano manuali soltanto
  scagliamento casuale, caduta finale e interazioni con oggetti non assicurati.
- Intermittenza (`blink`): FULL/ACCEPTED con parent spell instance, durata di
  1 minuto senza concentrazione, prompt di fine turno per il d20 fisico
  (1–10 / 11+), stato Materiale/Etereo e `departurePosition` persistiti.
  Il ritorno usa un picker puntuale diretto sulla mappa, senza creare aree,
  normalizza il centro della footprint e teletrasporta subito il token. Il
  dismissal è un'Azione; expiry/rimozione da Etereo passa dal terminal gateway
  prima del cleanup. Reload, stale checks e History/Undo sono condivisi; tiro,
  LOS, occupazione, distanza RAW e interazioni planari restano manuali.
- Console attacchi per i mostri, fase 1 (ottobre 2026,
  [piano](docs/PIANO_ATTACCHI_MOSTRI_FASE_1.md)): il GM apre la scheda di
  nemici e neutrali e ne importa lo statblock in JSON (azioni, multiattacco,
  CA, caratteristiche, TS, difese, PF); la console esegue attacchi con bonus,
  portata e gittata, azioni a tiro salvezza con CD, area e condizione propri,
  ricarica come promemoria e usi al giorno; i PF si scrivono con `hp:set` e
  History, mai su personaggi o PF condivisi; le schede dei mostri restano
  fuori dal registro room; apertura automatica separata per PG e Mostri.
- Console attacchi per i mostri, fasi 2–5 (ottobre 2026,
  [fase 2](docs/PIANO_ATTACCHI_MOSTRI_FASE_2.md), [fase 3](docs/PIANO_ATTACCHI_MOSTRI_FASE_3.md),
  [fase 4](docs/PIANO_ATTACCHI_MOSTRI_FASE_4.md), [fase 5](docs/PIANO_ATTACCHI_MOSTRI_FASE_5.md)):
  JSON di 5eTools (mostro, bestiario, derivati `_copy`), archivio online con i
  libri tenuti nel browser del GM; lo statblock sostituisce il precedente ed è
  lo stesso per i token omonimi; nome, PF, ritratto e Leggendario automatici;
  incantesimi (slot dalla classe, libro, innati come ⚡); testo originale e
  Capacità dello statblock; azioni lette ad euristica su qualunque libro: aree
  disegnate alla misura dello statblock, esiti con bonus al TS, Immune ed
  Elusione, condizioni con durata, tiro ripetuto e immunità di 24 ore, effetti
  al colpo (TS secondario, presa, prono). Copertura misurata con
  `scripts/monster-heuristics-coverage.mjs`.

## Capacità di classe

Il catalogo runtime espone 551 capacità e 104 pool di risorse. Al momento 59
sono `implemented`; le restanti 492 sono intenzionalmente consultabili come
`not-automated` e richiedono gestione manuale. L'espansione degli adapter deve
partire dai dati in `data/class-features/`, passare da
`npm run generate:class-features` e aggiornare i test prima di essere descritta
come capacità attivabile. Il dettaglio dello snapshot è in
[Capacità di classe](docs/CAPACITA_CLASSE.md) e nell'[audit generato](docs/AUDIT_CAPACITA_CLASSE.md).

## Pianificato

- **Telecinesi completata — FULL/ACCEPTED:** il workflow creature-only copre
  cast, parent instance, contesa iniziale e ricorrente, mantenimento/retarget,
  Trattenuto canonico, boundary di turno, cleanup e History. Manipolazione di
  oggetti, movimento e sospensione restano manuali: il workflow OBR non usa
  token di oggetti.

- **Prossimo batch raccomandato — Debilitazione:** chiudere l'unico GAP P1
  residuo della capability active-action usando `enervation-repeat`, il
  contratto shared delle active action, i turn notice, il linkage alla parent
  instance, cleanup e History. Il pass deve restare limitato a ripetizione,
  danno/cura e terminazione RAW; nessun nuovo motore di movimento o controllo
  forzato.

- Console attacchi per i mostri, dopo la fase 5:
  - prove in room: disegno delle aree dei mostri sulla mappa (il banco non ha
    lo strumento area), promemoria del tiro ripetuto al cambio turno, carta
    boss Leggendario sullo schermo dei giocatori;
  - documentazione della fase 3 (lotto 5); gli statblock 2024 opzionali (fase
    3, lotto 6) sono chiusi il 27/10/2026: al tavolo restano le immunità alle
    maledizioni dei licantropi, i tiri ripetuti «una volta sola» e i 10
    incantesimi 2024 fuori dal catalogo SRD (Mind Spike, Ice Knife…);
  - restano al tavolo: effetti al colpo che le regole non leggono (malattie,
    trascinamenti, riduzione dei PF massimi: 47 attacchi su 1274 in MM, VGM,
    MTF, IDRotF), tiri ripetuti condizionati (11), Ragnatela e azioni senza
    danni né TS (243), spendere i diamanti leggendari dalla console, più
    condizioni con un solo promemoria (oggi uno per condizione);
  - campi del mostro modificabili nell'editor degli Attacchi (oggi si
    reimporta); il testo dello statblock su un altro dispositivo del GM (oggi
    si reimporta, o si ritrova dai libri dell'archivio).

- Creare icone dedicate per i token PROP generati dagli incantesimi (Arma
  spirituale, Spada arcana, Lama del Disastro e Mano arcana), sostituendo gli
  asset provvisori senza modificare lifecycle, targeting o integrazione nel
  tracker.

- Revisione completa di Controllare Acqua: distinguere la massa controllata di 30 m dalla sottozona del Vortice di raggio 7,5 m; modellare trascinamento di 3 m, ingresso nel vortice, prova di Atletica per nuotare o liberarsi, onda ricorrente di Inondazione e geometrie specifiche delle quattro modalità.
- Esplorare una meccanica generale di sottozone figlie per incantesimi con più geometrie, iniziando dalle Fenditure di Terremoto: posizionamento di più aree collegate alla stessa istanza, vincoli entro la zona madre, membership e trigger indipendenti, deduplicazione nelle sovrapposizioni, Undo e pulizia atomica al termine della spell.
- Completare Muro di Fuoco: rappresentare il lato caldo, il margine di 3 m e l'attraversamento reale anche quando un token passa da un lato all'altro senza fermarsi nel muro; includere inoltre l'aumento dei danni per slot superiori.
- Pass finale sulle zone da combattimento ancora prive di automazione completa: Invertire la Gravità (ingresso e caduta alla fine), Tempesta di Vendetta (progressione per round), Tramutare Roccia e le aure di Vita/Vitalità. Restano esclusi evocazioni, utilità non da combattimento e tempi di lancio di almeno 1 minuto.
