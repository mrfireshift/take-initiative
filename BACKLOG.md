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
- Azioni rapide persistenti nelle schede iniziativa.
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

## Capacità di classe

Il catalogo runtime espone 551 capacità e 104 pool di risorse. Al momento 59
sono `implemented`; le restanti 492 sono intenzionalmente consultabili come
`not-automated` e richiedono gestione manuale. L'espansione degli adapter deve
partire dai dati in `data/class-features/`, passare da
`npm run generate:class-features` e aggiornare i test prima di essere descritta
come capacità attivabile. Il dettaglio dello snapshot è in
[Capacità di classe](docs/CAPACITA_CLASSE.md) e nell'[audit generato](docs/AUDIT_CAPACITA_CLASSE.md).

## Pianificato

- Creare icone dedicate per i token PROP generati dagli incantesimi (Arma
  spirituale, Spada arcana, Lama del Disastro e Mano arcana), sostituendo gli
  asset provvisori senza modificare lifecycle, targeting o integrazione nel
  tracker.

- Revisione completa di Controllare Acqua: distinguere la massa controllata di 30 m dalla sottozona del Vortice di raggio 7,5 m; modellare trascinamento di 3 m, ingresso nel vortice, prova di Atletica per nuotare o liberarsi, onda ricorrente di Inondazione e geometrie specifiche delle quattro modalità.
- Esplorare una meccanica generale di sottozone figlie per incantesimi con più geometrie, iniziando dalle Fenditure di Terremoto: posizionamento di più aree collegate alla stessa istanza, vincoli entro la zona madre, membership e trigger indipendenti, deduplicazione nelle sovrapposizioni, Undo e pulizia atomica al termine della spell.
- Completare Muro di Fuoco: rappresentare il lato caldo, il margine di 3 m e l'attraversamento reale anche quando un token passa da un lato all'altro senza fermarsi nel muro; includere inoltre l'aumento dei danni per slot superiori.
- Pass finale sulle zone da combattimento ancora prive di automazione completa: Muro Prismatico (strati e attraversamento), Invertire la Gravità (ingresso e caduta alla fine), Tempesta di Vendetta (progressione per round), Turbine, Tramutare Roccia e le aure di Vita/Vitalità. Restano esclusi evocazioni, utilità non da combattimento e tempi di lancio di almeno 1 minuto.
