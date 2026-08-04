# Workspace class features

Questa cartella contiene materiale di lavoro e artefatti per il catalogo delle
capacità di classe. Non è la documentazione operativa del plugin.

## Gerarchia delle fonti

1. `data/class-features/` contiene i cataloghi e gli overlay meccanici sorgente.
2. `npm run generate:class-features` produce `src/class-features-runtime.json`.
3. Il runtime importa il JSON generato tramite `src/classFeatureCatalog.js`.
4. `npm run audit:class-features` produce l'audit JSON e
   `docs/AUDIT_CAPACITA_CLASSE.md`.
5. I test in `test/` verificano il contratto del catalogo e gli adapter runtime.

Non modificare manualmente il catalogo runtime o il report Markdown generato
per correggere una regola: aggiornare la sorgente o l'overlay e rigenerare.

## Sottocartelle

- `catalog/`: estratti e matrici di catalogazione;
- `raw/`: materiale grezzo e import utilizzati nella preparazione dei dati;
- `audits/`: analisi e roadmap storiche o di lavorazione;
- `tickets/`: note di pianificazione.

Per il comportamento corrente leggere prima [Capacità di classe](../CAPACITA_CLASSE.md).
Gli audit sono utili per capire la provenienza di un record e il lavoro
residuo, ma non modificano da soli ciò che la UI può attivare.
