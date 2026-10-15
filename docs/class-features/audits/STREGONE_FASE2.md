# Batch Stregone — Fase 2 (15 ottobre 2026)

Commit di partenza: `1762dca`. Perimetro: le origini non curate in precedenza
(Discendenza Draconica, Magia delle Ombre, Anima Divina, Anima Meccanica,
Mente Aberrante, Stregoneria della Tempesta). Classe base, metamagie e Magia
Selvaggia erano già curate e **non sono state toccate** (19 voci escluse a
monte).

Capacità implementate nel batch: **12** (7 `condition`, 4 `resource-only`,
1 `aura`), tutte con soli override. Lo Stregone passa da 13 a 25 capacità
attivabili; il catalogo da 249 a 261.

## Punti stregoneria

La fonte marca a costo variabile tutte le capacità che spendono punti. RAW
quasi tutte hanno un costo fisso, che il batch applica:

| Capacità | Costo RAW |
|---|---|
| Segugio dei Presagi Nefasti | 3 punti |
| Forma d'Ombra | 6 punti |
| Presenza Draconica | 5 punti |
| Guarigione Potenziata | 1 punto |
| Trance dell'Ordine | gratuita una volta per riposo lungo; il riuso costa 5 punti, da scalare dal pool |

Restano davvero variabili e quindi esclusi: Bastione della Legge (1–5 punti) e
Rivelazione della Carne (un beneficio per punto).

## Capacità

| Origine | Capacità | Adapter | Note |
|---|---|---|---|
| Discendenza Draconica | Ali di Drago | condition (sé) | volo pari alla velocità sul terreno, finché le congeda |
| Discendenza Draconica | Presenza Draconica | aura 18 m, solo nemici, scelta venerazione/paura | 10 round o perdita della concentrazione; TS a inizio turno come promemoria |
| Magia delle Ombre | Forza della Tomba | resource-only | uso per riposo lungo |
| Magia delle Ombre | Segugio dei Presagi Nefasti | condition, 36 m | 50 round sul bersaglio; il segugio è un token del GM |
| Magia delle Ombre | Forma d'Ombra | condition (sé) | 10 round o incapacitato |
| Anima Divina | Prescelto dagli Dei, Recupero Ultraterreno | resource-only | pool esistenti; PF con il controllo HP |
| Anima Divina | Guarigione Potenziata | resource-only | 1 punto stregoneria |
| Anima Divina | Ali Ultraterrene | condition (sé) | volo 9 m finché incapacitato o congedo |
| Anima Meccanica | Ripristino dell'Equilibrio | resource-only | pool = bonus di competenza |
| Anima Meccanica | Trance dell'Ordine | condition (sé) | 10 round |
| Stregoneria della Tempesta | Anima del Vento | condition, 9 m, più bersagli, stregone incluso | 600 round, volo 9 m; uso per riposo breve al tavolo |

## Escluse dal batch

| ID | Motivo |
|---|---|
| Bastione della Legge, Rivelazione della Carne | costo variabile scelto dal GM: `value-input` |
| Stregoneria Psionica, Occhi dell'Oscuro, Magia Divina | lancio con punti o slot: `spell-bridge` |
| Implosione Distorcente, Cavalleria Meccanica | gratuite una volta per riposo lungo, riuso a punti, effetti istantanei: carte descrittive |
| Conversazione Telepatica | durata in minuti pari al livello: carta descrittiva |
| Camminare nelle Ombre, Furia della Tempesta, Cuore della Tempesta, Magia Tempestosa, Guida della Tempesta | movimento, reazioni o effetti ambientali istantanei: carte descrittive |

## Verifica

- test nuovi: `test/sorcererOriginsFeatureRuntime.test.js`; il test della
  Magia Selvaggia è invariato e passa; nel test di riepilogo dell'audit
  l'esempio aperto di trasformazione è ora Rivelazione della Carne;
- audit rigenerato: implementate 249 → 261, automazione con soli dati 18 → 11.
