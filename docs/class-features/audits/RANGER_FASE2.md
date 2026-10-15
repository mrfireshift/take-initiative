# Batch Ranger — Fase 2 (15 ottobre 2026)

Commit di partenza: `bc525ba`. Perimetro: Ranger del Manuale del Giocatore con
le sottoclassi di Xanathar e Tasha (il Ranger Revised UA è già curato).
Capacità implementate nel batch: **10** (7 `condition`, 3 `resource-only`),
tutte con soli override. Il Ranger passa da 0 a 10 capacità attivabili; il
catalogo da 188 a 198.

Il Ranger 2014 ha poche risorse proprie: Nemico Prescelto, Esploratore Nato,
Stili di Combattimento e la maggior parte delle opzioni del Cacciatore sono
passive o reazioni istantanee e restano carte descrittive.

## Capacità

| Sottoclasse | Capacità | Adapter | Note |
|---|---|---|---|
| Signore delle Bestie | Compagno del Ranger | condition sul token della bestia | senza scadenza; stesso modello del Compagno Animale del Ranger Revised |
| Cacciatore delle Tenebre | Imboscata Terrificante | condition (sé) | primo turno: +3 m fino alla fine del turno |
| Uccisore di Mostri | Preda dell'Uccisore | condition, 18 m | fino al riposo; il GM la termina se il ranger designa un'altra creatura |
| Uccisore di Mostri | Nemesi degli Incantatori | resource-only | pool esistente |
| Viandante dell'Orizzonte | Combattente Planare | condition, 9 m | fino alla fine del turno |
| Viandante dell'Orizzonte | Individuazione dei Portali | resource-only | pool esistente |
| Viandante dell'Orizzonte | Passo Etereo | condition (sé), pool | forma eterea fino alla fine del turno |
| Viandante Fatato | Scambio Seducente | condition, 36 m, scelta affascinato/spaventato | 10 round; TS ripetuto a fine turno solo nel testo |
| Viandante Fatato | Rinforzi Fatati | resource-only | l'incantesimo si lancia dal pannello |
| Custode degli Sciami | Marea Avvolgente | condition (sé) | 10 round, volo 3 m |

## Escluse dal batch

| ID | Motivo |
|---|---|
| Viandante Velato | pool `max(1, modificatore_saggezza)`: P1 |
| Percezione del Cacciatore | usi pari alla Saggezza senza pool: carta descrittiva |
| Dispersione Brulicante | usi pari alla competenza senza pool: carta descrittiva |
| Consapevolezza Primordiale | spende uno slot incantesimo: carta descrittiva |
| Sciame Possente | potenziamento di Sciame Riunito: carta descrittiva |
| Opzioni del Cacciatore, Difesa Spettrale, Colpo Distante, Schivata dell'Ombra | reazioni o effetti istantanei: carte descrittive |

## Verifica

- test nuovi: `test/rangerFeatureRuntime.test.js`;
- conteggi aggiornati; Backlog.5 usa ora il Patto della Catena come esempio
  aperto di compagno;
- audit rigenerato: implementate 188 → 198, automazione con soli dati 71 → 67.
