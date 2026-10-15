# Batch Mago — Fase 2 (15 ottobre 2026)

Commit di partenza: `3b7654c`. Capacità implementate nel batch: **11**
(5 `condition`, 6 `resource-only`), tutte con soli override. Il Mago passa da
0 a 11 capacità attivabili; il catalogo da 198 a 209.

La classe base e la Scuola di Invocazione erano già curate come carte
descrittive. **Recupero Arcano resta com'era**: il test del batch Invocazione
documenta la scelta di tracciarne il pool senza farne un'azione (si usa a fine
riposo breve). Il batch l'aveva convertita per errore ed è stata ripristinata.

## Capacità

| Scuola | Capacità | Adapter | Note |
|---|---|---|---|
| Divinazione | Portento | resource-only | spende un dado di preveggenza (2, 3 dal 14°) |
| Divinazione | Terzo Occhio | condition (sé), scelta del beneficio, pool | fino a incapacitato o riposo |
| Ammaliamento | Sguardo Ipnotico | condition, 1,5 m | Affascinato, velocità 0, termina con danno (TS fallito); senza pool |
| Magia della Guerra | Deviazione Arcana | condition (sé), reazione | "solo trucchetti" fino alla fine del prossimo turno |
| Canto della Lama | Melodia della Lama | condition (sé) | 10 round, velocità +3 m; usi segnati al tavolo |
| Evocazione | Trasposizione Benevola | resource-only | pool esistente |
| Ordine degli Scribi | Libro Risvegliato, Mente Manifesta, Comunione con il Testo | resource-only | pool esistenti |
| Illusione | Sosia Illusorio | resource-only | pool esistente |
| Negromanzia | Comandare Non Morti | condition, 18 m | senza scadenza, finché il mago lo riusa (TS fallito) |

## Correzioni dei dati sorgente

| Capacità | Fonte | RAW applicato |
|---|---|---|
| Sguardo Ipnotico | 1 uso per riposo lungo | nessun limite giornaliero: la creatura che supera il TS o si libera è immune fino al riposo lungo. Pool escluso (`excludeResourcePoolIds`) |
| Fascino Istintivo | 1 uso per riposo lungo | stesso limite per creatura; reazione con TS: carta descrittiva senza pool |
| Melodia della Lama | nessun pool | usi pari al bonus di competenza da segnare al tavolo |

## Escluse dal batch

| ID | Motivo |
|---|---|
| Interdizione Arcana, Interdizione Proiettata | PF dell'interdizione = 2 × livello + Intelligenza: P1 e `value-input` |
| Impulso di Potere | riserva pari all'Intelligenza: P1 |
| Maestro Trasmutatore, Mutaforma, Servitori Non Morti | incantesimi o pietra del trasmutatore: `spell-bridge` |
| Evocazione Minore, Illusioni Duttili, Realtà Illusoria | oggetti e illusioni, non stati sui token: carte descrittive |
| Canzone di Difesa, Sudario di Deviazione | spendono slot o reazioni con danno fisso: carte descrittive |

## Verifica

- test nuovi: `test/wizardSchoolsFeatureRuntime.test.js`; il test del batch
  Invocazione è invariato e passa;
- Backlog.5 ora usa esempi fissi solo per gli archetipi bloccati da una
  primitiva e verifica la regola su tutte le capacità aperte degli archetipi
  solo-dati, così non si rompe a ogni batch;
- audit rigenerato: implementate 198 → 209, automazione con soli dati 67 → 55.
