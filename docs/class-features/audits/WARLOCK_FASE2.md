# Batch Warlock — Fase 2 (15 ottobre 2026)

Commit di partenza: `bdf1c2b`. Capacità implementate nel batch: **19**
(12 `condition`, 6 `resource-only`, 1 `aura`), tutte con soli override. Il
Warlock passa da 0 a 19 capacità attivabili; il catalogo da 114 a 133.

Il Warlock è la classe più legata agli incantesimi: la maggior parte delle
Suppliche lancia un incantesimo (a volontà o una volta per riposo) e resta una
carta descrittiva fino al ponte verso il sistema Incantesimi (`spell-bridge`).
Il batch automatizza le capacità del patrono e le Suppliche con uno stato
proprio.

## Il Signore Fatato

| Capacità | Adapter | Pill |
|---|---|---|
| Presenza Fatata | condition, 3 m, più bersagli, pool | Affascinato **o** Spaventato (scelta del warlock) fino alla fine del prossimo turno (TS fallito) |
| Fuga Velata | condition (sé), reazione, pool | Invisibile fino all'inizio del prossimo turno |
| Difese Seducenti | condition, reazione | Affascinato 10 round, termina con danno (TS fallito) |
| Delirio Oscuro | condition, 18 m | Affascinato **o** Spaventato 10 round, termina con danno (TS fallito) |

La scelta affascinato/spaventato usa `choiceOptions` come Abiurare Nemico del
Paladino: il GM la indica all'attivazione.

## Altri patroni

| Patrono | Capacità | Adapter | Note |
|---|---|---|---|
| Grande Antico | Interdizione Entropica | resource-only | pool esistente |
| Grande Antico | Creare Servitore | condition | Affascinato senza scadenza, termina il GM |
| Lama del Sortilegio | Maledizione della Lama del Sortilegio | condition, 9 m, pool | 10 round; la cura alla morte del bersaglio resta manuale |
| Lama del Sortilegio | Spettro Maledetto | resource-only | lo spettro è un token del GM |
| Celestiale | Vendetta Incandescente | resource-only | cura e danni manuali |
| Genio | Recipiente del Genio | resource-only | Rifugio Portatile 1/riposo lungo |
| Genio | Dono Elementale | condition (sé), pool | 100 round, volo 9 m (`modes.fly.grantMeters`) |
| Insondabile | Tentacoli delle Profondità | condition (sé), pool | 10 round; il rallentamento per colpo resta manuale |
| Insondabile | Presa dei Tentacoli, Immersione Insondabile | resource-only | il lancio di tentacoli neri passa dal pannello Incantesimi |
| Immondo | Scagliare all'Inferno | condition | scomparso fino alla fine del prossimo turno del warlock (RAW ancorato al warlock) |

## Suppliche

| Supplica | Adapter | Pill |
|---|---|---|
| Lancia della Letargia | condition | velocità −3 m fino alla fine del prossimo turno |
| Sguardo Fantasma | condition (sé), pool | 10 round |
| Tomba di Levistus | condition (sé), reazione, pool | incapacitato, velocità 0 fino alla fine del prossimo turno; PF temporanei con il controllo HP |
| Mantello di Mosche | aura 1,5 m, pool | tutte le altre creature; promemoria dei danni da veleno a inizio turno |

## Escluse dal batch

| ID | Motivo |
|---|---|
| Luce Guaritrice, Resilienza Celestiale, Dono degli Imperituri, Maestro dei Sortilegi | cure e PF temporanei variabili: `value-input` |
| Suppliche che lanciano incantesimi (Presagio di Sventura, Armatura delle Ombre, Fuga dell'Ingannatore, Dono delle Profondità…) | `spell-bridge` |
| Patto della Catena | famiglio: `linked-token` |
| Sortilegio della Pazzia, Sortilegio Implacabile, Punizione Occulta, Armatura dei Sortilegi, Spirale Guardiana | effetti istantanei o reazioni con tiro: carte descrittive |
| Fortuna dell'Oscuro, Scagliare all'Inferno (uso) | un uso per riposo senza pool nelle fonti: segnato al tavolo |

## Verifica

- test nuovi: `test/warlockFeatureRuntime.test.js`;
- conteggi aggiornati in `classFeatureAudit`, `classFeatureCatalog` e
  `paladinDevotionFeatureRuntime`;
- audit rigenerato: implementate 114 → 133, automazione con soli dati 109 → 100.
