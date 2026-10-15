# Batch Monaco — Fase 2 (15 ottobre 2026)

Commit di partenza: `a8e928a`. Capacità implementate nel batch: **42**
(15 `condition`, 27 `resource-only`), tutte con soli override. Il Monaco
passa da 0 a 42 capacità attivabili; il catalogo da 133 a 175.

Il Ki è la risorsa centrale: ogni capacità che lo spende RAW ha ora un costo
fisso sul pool `monaco-punti-ki`. Le pill che dipendono da un TS si applicano
solo dopo un TS fallito (CD Ki = 8 + competenza + Saggezza, nel testo).

## Correzioni dei dati sorgente

| Capacità | Fonte | RAW applicato |
|---|---|---|
| Fortuna dell'Ubriacone | costo variabile | 2 Ki fissi |
| Colpo dell'Onda Incandescente | costo variabile | 2 Ki di base; gli extra si spendono dal pool |
| Esplosione Solare Incandescente | costo variabile | base gratuita: carta descrittiva |
| Volto del Sé Astrale, Sé Astrale Risvegliato, Arti dell'Ombra, Colpo Abile (Tutt'uno con la Lama) | nessun costo | 1, 5, 2 e 1 Ki |
| Anima Adamantina, Corpo Vuoto, Palmo Tremante | passive | ritiro del TS (1 Ki), invisibilità (4 Ki), vibrazioni (3 Ki) |
| Discipline che lanciano incantesimi | passive | consumo di Ki RAW (2–6); l'incantesimo si lancia dal pannello Incantesimi |

## Pill

| Capacità | Bersaglio | Durata |
|---|---|---|
| Difesa Paziente (Schivata) | sé | fino all'inizio del prossimo turno |
| Colpo Stordente (Stordito) | bersaglio | fino alla fine del prossimo turno (TS fallito) |
| Corpo Vuoto (Invisibile) | sé | 10 round |
| Palmo Tremante | bersaglio | senza scadenza, termina il GM |
| Tranquillità (Santuario) | sé | senza scadenza, fino al riposo lungo |
| Parata Agile | sé | fino all'inizio del prossimo turno |
| Tiro del Kensei, Passo dell'Ombra, Zanne del Serpente di Fuoco, Tecnica dell'Ubriaco (+3 m) | sé | fino alla fine del turno |
| Manto di Ombre (Invisibile) | sé | senza scadenza, termina con attacco, incantesimo o luce intensa |
| Tocco del Medico (Avvelenato) | bersaglio | fino alla fine del prossimo turno |
| Braccia, Volto, Sé Astrale Risvegliato | sé | 100 round o incapacitato |

## Solo consumo di Ki

Passo del Vento, Raffica di Colpi, Anima Adamantina, Colpo Abile, Arti
dell'Ombra, Forma del Fiume Fluente, Frusta d'Acqua, Pugno dell'Aria
Inviolabile, dodici discipline che lanciano incantesimi, Andatura Ondeggiante,
Fortuna dell'Ubriacone, Dardo del Sole Radioso, Colpo dell'Onda
Incandescente, Mano del Dolore, Mano Guaritrice (cura con il controllo HP) e
Mano della Misericordia Suprema (uso giornaliero + 5 Ki).

## Escluse dal batch

| ID | Motivo |
|---|---|
| Affilare la Lama | 1–3 Ki a scelta: la card non chiede il valore (`variable-cost` → `value-input`) |
| Integrità del Corpo | cura senza pool: `value-input` |
| Tecnica della Mano Aperta | tre effetti a scelta senza costo: carta descrittiva |
| Deviare Proiettili, Caduta Lenta, Mente Lucida, Opportunista, Corpo del Sé Astrale | reazioni o effetti istantanei: carte descrittive |
| Scudo Solare | luce e reazione con danno fisso: carta descrittiva |
| Cammino del Kensei | contenitore delle opzioni: carta descrittiva |

## Verifica

- test nuovi: `test/monkFeatureRuntime.test.js`;
- conteggi aggiornati in `classFeatureAudit`, `classFeatureCatalog` e
  `paladinDevotionFeatureRuntime`; Backlog.5 usa ora Sguardo Ipnotico come
  esempio aperto di condizione dopo TS;
- audit rigenerato: implementate 133 → 175, automazione con soli dati 100 → 78.
