# Batch Chierico — Fase 2 (15 ottobre 2026)

Commit di partenza: `779ac0f`. Capacità implementate nel batch: **17**
(10 `condition`, 6 `resource-only`, 1 `aura`), tutte con soli override. Il
Chierico passa da 3 a 20 capacità attivabili; il catalogo da 97 a 114.

Stessa regola del Guerriero: le pill che dipendono da un TS si applicano solo
alle creature che lo falliscono; il plugin non tira e non decide l'esito.

## Incanalare Divinità (pool `chierico-incanalare-divinita-usi`)

| Dominio | Capacità | Adapter | Pill |
|---|---|---|---|
| Conoscenza | Conoscenze Secolari | condition (sé) | 100 round |
| Conoscenza | Lettura del Pensiero | condition, 18 m | 10 round (TS fallito) |
| Forgia | Benedizione dell'Artigiano | resource-only | — (rituale di 1 ora) |
| Guerra | Colpo Guidato, Benedizione del Dio della Guerra | resource-only | — |
| Inganno | Invocare Duplicato | condition (sé) | 10 round |
| Inganno | Manto di Ombre | condition (sé) | Invisibile fino alla fine del prossimo turno |
| Luce | Fulgore dell'Alba | resource-only | — (danni ad area manuali) |
| Natura | Charme su Animali e Vegetali | condition, 9 m, più bersagli | Affascinato 10 round, termina con danno |
| Ordine | Pretesa dell'Ordine | condition, 9 m, più bersagli | Affascinato fino alla fine del prossimo turno, termina con danno |
| Tempesta | Collera Distruttiva | resource-only | — |
| Tomba | Verso la Tomba | condition, 9 m | fino alla fine del prossimo turno |

Collera Distruttiva e Manto di Ombre erano carte descrittive perché la fonte
le dichiara `passiva`: RAW spendono Incanalare Divinità, quindi entrano nel
batch con `activation` corretta. Invocare Duplicato è un'azione (PHB), non
un'azione bonus come indicava la fonte meccanica.

## Altre capacità

| ID | Adapter | Note |
|---|---|---|
| Benedizione dell'Ingannatore | condition, tocco | 600 round (1 ora) |
| Benedizione della Forgia | resource-only | pool esistente; il +1 all'oggetto resta al tavolo |
| Legame Incoraggiante | condition, 9 m, più bersagli, chierico incluso | 100 round, pool = bonus di competenza |
| Ira dell'Ordine | condition | fino all'inizio del prossimo turno |
| Corona di Luce | aura 18 m, solo nemici | 10 round |

## Escluse dal batch

| ID | Motivo |
|---|---|
| Preservare Vita, Balsamo della Pace, Custode delle Anime, Cerchio di Mortalità | cure variabili: `value-input` |
| Incarnazione della Legge | pool `max(1, modificatore_saggezza)`: primitiva P1 |
| Collera della Tempesta, Lampo di Interdizione, Sacerdote di Guerra, Occhi della Tomba, Sentinella alla Porta della Morte | usi pari al modificatore di Saggezza senza pool nelle fonti: carte descrittive fino a P1 |
| Benedizione Vigile, Occhi della Notte, Sudario del Crepuscolo | curate nel batch Crepuscolo, invariate |

## Verifica

- test nuovi: `test/clericDomainsFeatureRuntime.test.js`;
- conteggi aggiornati in `classFeatureAudit`, `classFeatureCatalog` e
  `paladinDevotionFeatureRuntime`;
- audit rigenerato: implementate 97 → 114, automazione con soli dati 123 → 109.
