# Indice della documentazione

Questo è il punto di ingresso per la documentazione di **Take Initiative!**.
I documenti sono divisi per pubblico e per affidabilità, così una nota storica
o un audit generato non viene scambiato per il comportamento corrente del
plugin.

## Riferimenti correnti

| Documento | Uso |
| --- | --- |
| [Guida utente](GUIDA_UTENTE.md) | Preparazione della scena e flusso al tavolo. |
| [Architettura Options](OPTIONS-ARCHITECTURE.md) | Scope, precedenza, proiezioni e lifecycle delle opzioni. |
| [Combat Log](COMBAT-LOG.md) | Contratto locale, eventi, causalità, export e retention. |
| [Embers/JB2A](EMBERS.md) | Copertura visuale, bridge esterno e cleanup degli output locali. |
| [Riferimento delle funzioni](RIFERIMENTO_FUNZIONI.md) | Matrice GM/player, dati e regole applicate. |
| [Capacità di classe](CAPACITA_CLASSE.md) | Classi, sottoclassi, risorse e capacità attivabili. |
| [Incantesimi, zone e reminder](INCANTESIMI_E_ZONE.md) | Catalogo, registro, aree, zone, aure e limiti RAW. |
| [Spell Architecture Master](SPELL_ARCHITECTURE_MASTER.md) | Reuse map runtime per polishing, nuove spell e batch futuri. |
| [Audit automazione incantesimi](AUDIT_AUTOMAZIONE_INCANTESIMI.md) | Matrice completa tra testi RAW e tracking, aree, status, trigger e fasi. |
| [Architettura e dati](ARCHITETTURA.md) | Entry point, metadata, persistenza e riconciliazione. |
| [Contratto del movimento](MOVEMENT_MECHANICS.md) | Modalità di movimento, costi e condizioni. |
| [Installazione](INSTALLAZIONE.md) | Installazione pubblicata, sviluppo locale e aggiornamenti. |
| [Risoluzione dei problemi](RISOLUZIONE_PROBLEMI.md) | Diagnostica per l'uso al tavolo e per lo sviluppo. |
| [Performance harness](PERFORMANCE-HARNESS.md) | Baseline deterministica, profili e limiti della misura produttiva. |
| [Sviluppo e release](SVILUPPO.md) | Script, test, generatori e gate di rilascio. |

Il [Backlog](../BACKLOG.md) descrive il lavoro ancora incompleto e non è una
guida al comportamento già disponibile.

## Fonti autorevoli dei conteggi

Per gli incantesimi, la fonte runtime è `src/spells-srd.js`: `getSpellCatalog()`
definisce il catalogo completo, `getTrackableSpellOptions()` le voci trackable
e `buildSpellUnifiedCatalogEntries()` in `src/spellUnifiedPanelCatalogCore.js`
la composizione del pannello unificato. Le regole geometriche sono definite da
`getSpellAreaRules()` in `src/spellAreaRules.js`.

Per le capacità di classe, `src/classFeatureCatalog.js` legge
`src/class-features-runtime.json`, generato da
`scripts/generate-class-feature-catalog.mjs` a partire dai dati in
`data/class-features/`. Il JSON di audit delle class features misura invece
anche i record sorgente non esposti nel runtime.

## Snapshot verificato del repository

I numeri sottostanti sono quelli dei cataloghi e degli script presenti nel
repository corrente; non sono una promessa che ogni voce sia completamente
automatizzata.

| Area | Stato corrente |
| --- | --- |
| Incantesimi | 477 definizioni, 358 opzioni trackable, 392 voci nel pannello unificato. |
| Tracking persistente audit | 355 definizioni; è un sottoinsieme più restrittivo delle 358 opzioni trackable. |
| Regole di area | 137 regole per 132 incantesimi distinti. |
| Tiri salvezza spell | 81 definizioni con `saveAutomation` nel catalogo runtime. |
| Azioni spell successive | 26 definizioni esposte dal contratto unificato. |
| Capacità di classe | 551 record runtime, 59 pronti all'attivazione, 492 non automatizzati. |
| Risorse di classe | 104 pool definiti nel catalogo runtime. |

Dopo una modifica ai dati, rigenerare i cataloghi e rieseguire i controlli
indicati in [Sviluppo e release](SVILUPPO.md). Le date e i conteggi degli audit
generati possono quindi cambiare senza rendere obsolete le guide operative.

## Decisioni e contratti tecnici

- [ARCH-002 — Metadata key-scoped](ARCH-002-METADATA-KEY-SCOPED.md)
- [ARCH-003 — Coordinatore mutazioni effetti](ARCH-003-EFFECTS-MUTATION-COORDINATOR.md)
- [ARCH-004 — Event hub e scheduler di rendering](ARCH-004-EVENT-HUB-RENDER-SCHEDULER.md)
- [ARCH-005 — History owner](ARCH-005-HISTORY-OWNER.md)
- [ARCH-005 — Reconciler idempotenti](ARCH-005-IDEMPOTENT-RECONCILERS.md)
- [ARCH-006 — Gateway dello stato iniziativa](ARCH-006-INITIATIVE-STATE-GATEWAY.md)
- [ARCH-008 — Snapshot fanout](ARCH-008-SNAPSHOT-FANOUT.md)
- [Effetti local items](EFFETTI_LOCAL_ITEMS.md) — nota di implementazione completata.

Questi documenti spiegano vincoli che devono essere rispettati durante lo
sviluppo, ma la guida utente e il riferimento funzioni restano le fonti per
il comportamento osservabile.

## Documenti storici e audit

I seguenti file sono conservati per tracciabilità e non devono essere usati per
determinare lo stato corrente senza confrontarli con i documenti sopra:

- [Stabilizzazione 1.3](archive/historical/STABILIZZAZIONE_1_3.md)
- [Revisione incantesimi supplementi](archive/generated/REVISIONE_INCANTESIMI_SUPPLEMENTI.md)
- [Audit scadenze Tasha/Xanathar](archive/historical/AUDIT_SCADENZE_TASHA_XANATHAR.md)
- [Audit capacità di classe](AUDIT_CAPACITA_CLASSE.md)
- [Audit Barbaro](AUDIT_BARBARO.md)
- [Report narrativo class features](archive/class-features/CLASS_FEATURE_AUDIT.md)
- [Audit integrazione Embers](archive/integrations/EMBERS-INTEGRATION-AUDIT.md)
- [Compatibilità spell/Embers](archive/integrations/EMBERS-SPELL-COMPATIBILITY.md)
- [Baseline test closure](audits/BASELINE-TEST-CLOSURE.md)
- [Archivio documentazione](archive/README.md)
- [Duplicati raw archiviati](archive/raw-duplicates/README.md)
- [Workspace class features](class-features/README.md)

Gli audit possono descrivere un campione, una roadmap o uno snapshot generato.
Non sostituiscono `src/class-features-runtime.json`, `src/spellAreaRules.js` o
gli altri artefatti runtime.
