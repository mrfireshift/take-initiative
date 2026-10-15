# Batch Guerriero — Fase 2 (15 ottobre 2026)

Commit di partenza: `25dcb40`. Capacità implementate nel batch: **38**
(16 `condition`, 22 `resource-only`), tutte con soli override in
`runtime-feature-overrides.json`. Nessun adapter o codice runtime nuovo.
Il Guerriero passa da 0 a 38 capacità attivabili; il catalogo da 59 a 97.

Regola comune: il plugin non tira dadi né decide esiti. Le pill che dipendono
da un tiro salvezza si applicano solo dopo un TS fallito; con TS superato il
GM spende la risorsa dal pool senza applicare la pill (precedente: Presenza
Intimidatoria del Berserker).

## Classe base

| ID | Archetipo | Decisione | Manuale al tavolo |
|---|---|---|---|
| `guerriero-azione-impetuosa` | resource-only | "Usa" spende un uso | limite di un uso per turno |
| `guerriero-indomito` | resource-only | "Usa" spende un uso | il ritiro del TS |

## Maestro di Battaglia (pool `guerriero-dadi-superiorita`)

Le 16 manovre spendono un dado di Superiorità. Il classificatore euristico le
aveva marcate come passive (la fonte le dichiara `passiva`): il batch le
corregge con `activation` RAW.

| Manovre | Adapter | Pill |
|---|---|---|
| Affondo, Finta, Manovra, Spazzata, Spinta, Disarmante, Preciso, Sbilanciante, Colpo del Comandante, Incoraggiamento, Parata, Replica, Scarto Elusivo | resource-only | nessuna (prono e PF temporanei con i sistemi esistenti) |
| Attacco Adescante | condition | "Attacco Adescante" fino alla fine del prossimo turno (TS fallito) |
| Attacco Minaccioso | condition | Spaventato fino alla fine del prossimo turno (TS fallito) |
| Colpo Distraente | condition | "Colpo Distraente" fino all'inizio del prossimo turno |

## Arciere Arcano (pool `guerriero-arciere-arcano-tiro-arcano-usi`)

Tiro Arcano diventa la carta descrittiva della capacità madre, con il pool
tracciato; ogni freccia spende un uso.

| Freccia | Adapter | Pill |
|---|---|---|
| Cercatrice, Esplosiva, Perforante | resource-only | — |
| Afferrante | condition | "Rovi Afferranti" 10 round, velocità −3 m |
| Ammaliante | condition | Affascinato fino all'inizio del prossimo turno (TS fallito) |
| d'Ombra | condition | "Freccia d'Ombra" fino all'inizio del prossimo turno (TS fallito) |
| Esiliante | condition | "Esiliato" con velocità 0 fino all'inizio del prossimo turno del guerriero (TS fallito) |
| Indebolente | condition | "Freccia Indebolente" fino all'inizio del prossimo turno (TS fallito) |

Esiliante: RAW il bersaglio ricompare alla fine del *suo* prossimo turno.
Le durate sono ancorate al turno della sorgente, quindi la pill usa l'inizio
del prossimo turno del guerriero e il dettaglio chiede di terminarla prima.

## Cavaliere Runico

| ID | Adapter | Pill / note |
|---|---|---|
| Potenza del Gigante | condition (sé) | 10 round, pool esistente |
| Runa del Fuoco | condition | Trattenuto 10 round (TS fallito) |
| Runa del Gelo | condition (sé) | 100 round (10 minuti) |
| Runa della Pietra | condition, 9 m | Affascinato 10 round, velocità 0 (TS fallito) |
| Runa delle Colline | condition (sé) | 10 round, resistenze |
| Runa delle Tempeste | condition (sé) | 10 round o incapacitato, pool esistente |
| Scudo Runico | resource-only | pool esistente |

Le rune Fuoco, Gelo, Pietra e Colline hanno un uso per riposo breve senza un
pool nelle fonti: il dettaglio chiede di segnarlo al tavolo.

## Guerriero Psionico (pool `guerriero-guerriero-psionico-potere-psionico-usi`)

| ID | Adapter | Note |
|---|---|---|
| Campo Protettivo, Colpo Psionico | resource-only | spendono un dado |
| Baluardo della Forza | condition, 9 m, più bersagli | mezza copertura 10 round; uso gratuito o dado segnato al tavolo |
| Potere Psionico | carta descrittiva | pool tracciato |

## Cavaliere Errante e Samurai

| ID | Adapter | Note |
|---|---|---|
| Marchio Incrollabile | condition | fino alla fine del prossimo turno del guerriero |
| Forza di Fronte alla Morte | resource-only | pool esistente |

## Escluse dal batch

| ID | Motivo |
|---|---|
| `guerriero-recuperare-energie` | cura variabile: primitiva `value-input` |
| `guerriero-samurai-spirito-combattivo` | PF temporanei per livello: `value-input` |
| `guerriero-guerriero-psionico-maestro-della-telecinesi` | lancia Telecinesi: `spell-bridge` |
| `guerriero-cavaliere-errante-mantenere-la-posizione` | durata legata al turno del bersaglio: carta descrittiva |
| `guerriero-cavaliere-mistico-arma-vincolata` | rituale fuori combattimento: carta descrittiva |
| `guerriero-cavaliere-runico-colosso-runico` | potenziamento passivo di Potenza del Gigante: carta descrittiva |
| `guerriero-guerriero-psionico-adepto-telecinetico` | Balzo dura solo il turno; Spinta dipende da Colpo Psionico: carta descrittiva |
| `guerriero-guerriero-psionico-potere-psionico-movimento-telecinetico` | uso gratuito per riposo o a dado: carta descrittiva |

Le correzioni di archetipo sono in `BACKLOG_ARCHETYPE_OVERRIDES`
(`scripts/audit-class-features.mjs`).

## Verifica

- test nuovi: `test/fighterFeatureRuntime.test.js` (ID, adapter, pill,
  bersagli, consumo dei pool, movimento);
- conteggi aggiornati in `classFeatureAudit`, `classFeatureCatalog` e
  `paladinDevotionFeatureRuntime`;
- audit rigenerato: implementate 59 → 97, automazione con soli dati 148 → 123.
