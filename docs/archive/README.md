# Archivio della documentazione

Questa directory conserva snapshot storici, audit chiusi, piani superati e
note di implementazione sostituite da documenti correnti.

I contenuti dell'archivio servono per provenienza e tracciabilità; non sono
fonti del comportamento runtime né dei conteggi ufficiali. Per lo stato
corrente partire da [Indice della documentazione](../INDICE.md).

| Cartella | Contenuto |
| --- | --- |
| `historical` | Release e audit di importazione non più aggiornati. |
| `generated` | Report generati da pipeline ormai storiche. |
| `releases` | Decisioni e gate di release superati. |
| `plans` | Audit e proposte sostituite da contratti correnti. |
| `spells` | Note di fase del pannello unificato. |
| `strategy` | Analisi strategiche esterne al runtime corrente. |
| `integrations` | Snapshot di integrazioni esterne. |
| `class-features` | Report narrativi duplicati dal catalogo/audit generato. |
| `raw-duplicates` | Copie raw verificate rispetto a `data/class-features` e pacchetto non usato. |

`docs/audits/` resta separata come raccolta di evidenze tecniche di release;
anche quei documenti non sostituiscono le guide correnti o gli artefatti
runtime.

In `raw-duplicates/` i JSON sono stati conservati per provenienza dopo il
confronto SHA-256 con la fonte canonica in `data/class-features/`. Non sono
input di generatori o test; il loro spostamento non modifica il runtime.
