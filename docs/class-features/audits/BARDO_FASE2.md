# Batch Bardo — Fase 2 (15 ottobre 2026)

Commit di partenza: `90b07f0`. Perimetro: i collegi non curati in precedenza
(Valore, Sussurri, Incanto, Creazione, Spade). Classe base, Collegio della
Sapienza e Collegio dell'Eloquenza erano già curati e **non sono stati
toccati**: il batch modifica solo voci create dalla Fase 1, verificato contro
lo stato degli override prima della Fase 1.

Capacità implementate nel batch: **10** (9 `condition`, 1 `resource-only`),
tutte con soli override. Il Bardo passa da 5 a 15 capacità attivabili; il
catalogo da 209 a 219.

## Ispirazione Bardica

Il massimo di Ispirazione Bardica è `max(1, modificatore_carisma)` e la card
non ha il Carisma. Il batch Sapienza ha già deciso che gli usi si gestiscono
sulla scheda e che l'attivazione non scala un valore inventato: il runtime
accetta il consumo ma lascia `current` a `null`. Di conseguenza:

- le spese istantanee di Ispirazione (Ispirazione in Combattimento, Lame
  Psichiche, Virtuosismo Tagliente e Mobile) restano carte descrittive, come
  Parole Taglienti;
- Virtuosismo Difensivo, che lascia uno stato fino al prossimo turno, è una
  pill con il costo mostrato ma non decrementato, come l'Ispirazione Bardica
  stessa.

## Capacità

| Collegio | Capacità | Adapter | Note |
|---|---|---|---|
| Sussurri | Parole di Terrore | condition, pool | Spaventato 600 round (1 ora), termina con danno (TS fallito) |
| Sussurri | Manto di Sussurri | condition (sé) | travestimento 600 round; cattura dell'ombra segnata al tavolo |
| Sussurri | Conoscenze dell'Ombra | condition, 9 m, pool | Affascinato 4800 round (8 ore), termina con danno (TS fallito) |
| Incanto | Esibizione Estasiante | condition, 18 m, più bersagli, pool | Affascinato 600 round, termina con danno (TS fallito) |
| Incanto | Manto di Maestà | condition (sé), pool | 10 round, comando senza slot dal pannello |
| Incanto | Maestà Inviolabile | condition (sé) | 10 round o incapacitato; uso per riposo breve al tavolo |
| Creazione | Compimento della Creazione | resource-only | pool esistente |
| Creazione | Creazione Animata | condition (sé), pool | 600 round; l'oggetto animato è un token del GM |
| Spade | Virtuosismo della Lama | condition (sé) | +3 m fino alla fine del turno |
| Spade | Virtuosismo Difensivo | condition (sé) | fino all'inizio del prossimo turno |

## Escluse dal batch

| ID | Motivo |
|---|---|
| Manto d'Ispirazione | PF temporanei per livello (5/8/11/14): `value-input` |
| Granello di Potenziale, Crescendo Creativo, Virtuosismo del Maestro, Magia da Battaglia | potenziamenti di altre capacità: carte descrittive |
| Stile di Combattimento (Spade) | scelta esclusiva già gestita dalla Fase 1 |

## Verifica

- test nuovi: `test/bardCollegesFeatureRuntime.test.js`; i test dei batch
  Sapienza ed Eloquenza sono invariati e passano;
- audit rigenerato: implementate 209 → 219, automazione con soli dati 55 → 45.
