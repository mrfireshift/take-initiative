# Indice della documentazione

Questo è il punto di ingresso per la documentazione di **Take Initiative!**.
I documenti sono divisi per pubblico e per affidabilità, così una nota storica
o un audit generato non viene scambiato per il comportamento corrente del
plugin.

## Riferimenti correnti

| Documento | Uso |
| --- | --- |
| [Guida utente](GUIDA_UTENTE.md) | Preparazione della scena e flusso al tavolo. |
| [Riferimento delle funzioni](RIFERIMENTO_FUNZIONI.md) | Matrice GM/player, dati e regole applicate. |
| [Capacità di classe](CAPACITA_CLASSE.md) | Classi, sottoclassi, risorse e capacità attivabili. |
| [Incantesimi, zone e reminder](INCANTESIMI_E_ZONE.md) | Catalogo, registro, aree, zone, aure e limiti RAW. |
| [Audit automazione incantesimi](AUDIT_AUTOMAZIONE_INCANTESIMI.md) | Matrice completa tra testi RAW e tracking, aree, status, trigger e fasi. |
| [Architettura e dati](ARCHITETTURA.md) | Entry point, metadata, persistenza e riconciliazione. |
| [Contratto del movimento](MOVEMENT_MECHANICS.md) | Modalità di movimento, costi e condizioni. |
| [Installazione](INSTALLAZIONE.md) | Installazione pubblicata, sviluppo locale e aggiornamenti. |
| [Risoluzione dei problemi](RISOLUZIONE_PROBLEMI.md) | Diagnostica per l'uso al tavolo e per lo sviluppo. |
| [Sviluppo e release](SVILUPPO.md) | Script, test, generatori e gate di rilascio. |

Il [Backlog](../BACKLOG.md) descrive il lavoro ancora incompleto e non è una
guida al comportamento già disponibile.

## Snapshot verificato del repository

I numeri sottostanti sono quelli dei cataloghi e degli script presenti nel
repository corrente; non sono una promessa che ogni voce sia completamente
automatizzata.

| Area | Stato corrente |
| --- | --- |
| Incantesimi | 477 definizioni, 357 tracciabili nel pannello. |
| Regole di area | 133 regole per 132 incantesimi distinti. |
| Tiri salvezza spell | 71 definizioni con automazione dichiarata. |
| Azioni spell successive | 7 definizioni. |
| Capacità di classe | 542 record runtime, 59 pronti all'attivazione, 483 non automatizzati. |
| Risorse di classe | 104 pool definiti nel catalogo runtime. |

Dopo una modifica ai dati, rigenerare i cataloghi e rieseguire i controlli
indicati in [Sviluppo e release](SVILUPPO.md). Le date e i conteggi degli audit
generati possono quindi cambiare senza rendere obsolete le guide operative.

## Decisioni e contratti tecnici

- [ARCH-002 — Metadata key-scoped](ARCH-002-METADATA-KEY-SCOPED.md)
- [ARCH-003 — Coordinatore mutazioni effetti](ARCH-003-EFFECTS-MUTATION-COORDINATOR.md)
- [ARCH-004 — Event hub e scheduler di rendering](ARCH-004-EVENT-HUB-RENDER-SCHEDULER.md)
- [ARCH-005 — Reconciler idempotenti](ARCH-005-IDEMPOTENT-RECONCILERS.md)
- [Effetti local items](EFFETTI_LOCAL_ITEMS.md) — nota di implementazione completata.

Questi documenti spiegano vincoli che devono essere rispettati durante lo
sviluppo, ma la guida utente e il riferimento funzioni restano le fonti per
il comportamento osservabile.

## Documenti storici e audit

I seguenti file sono conservati per tracciabilità e non devono essere usati per
determinare lo stato corrente senza confrontarli con i documenti sopra:

- [Stabilizzazione 1.3](STABILIZZAZIONE_1_3.md)
- [Revisione incantesimi supplementi](REVISIONE_INCANTESIMI_SUPPLEMENTI.md)
- [Audit scadenze Tasha/Xanathar](AUDIT_SCADENZE_TASHA_XANATHAR.md)
- [Audit capacità di classe](AUDIT_CAPACITA_CLASSE.md)
- [Audit Barbaro](AUDIT_BARBARO.md)
- [Workspace class features](class-features/README.md)

Gli audit possono descrivere un campione, una roadmap o uno snapshot generato.
Non sostituiscono `src/class-features-runtime.json`, `src/spellAreaRules.js` o
gli altri artefatti runtime.
