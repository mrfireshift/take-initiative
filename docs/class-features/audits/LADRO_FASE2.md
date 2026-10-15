# Batch Ladro — Fase 2 (15 ottobre 2026)

Commit di partenza: `2543fd1`. Perimetro: gli archetipi non curati in
precedenza (Lama Spirituale, Fantasma, Spadaccino, Indagatore, Esploratore,
Pianificatore, Furfante, Assassino). Classe base e Mistificatore Arcano erano
già curati e **non sono stati toccati** (18 voci escluse a monte).

Capacità implementate nel batch: **12** (6 `condition`, 6 `resource-only`),
tutte con soli override. Il Ladro passa da 4 a 16 capacità attivabili; il
catalogo da 219 a 231.

## Capacità

| Archetipo | Capacità | Adapter | Note |
|---|---|---|---|
| Lama Spirituale | Abilità Psicorinforzata, Colpi Guidati, Teletrasporto Psichico | resource-only | un dado di Energia Psionica (2 × competenza) |
| Lama Spirituale | Sussurri Psichici | resource-only | uso gratuito per riposo lungo; gli usi successivi spendono un dado dal pool |
| Lama Spirituale | Velo Psichico | condition (sé), pool | Invisibile 600 round, termina se infligge danni o impone un TS |
| Lama Spirituale | Squarciare la Mente | condition, pool | Stordito 10 round (TS fallito); popup TS Saggezza a fine turno |
| Fantasma | Lamenti dalla Tomba | resource-only | pool esistente |
| Fantasma | Cammino Fantasma | condition (sé) | 100 round, volo 3 m; uso segnato al tavolo |
| Spadaccino | Spavalderia | condition, scelta ostile/non ostile | 10 round, dopo la prova contrapposta vinta |
| Spadaccino | Maestro Duellante | resource-only | pool esistente |
| Indagatore | Combattimento Intuitivo | condition | 10 round, dopo la prova contrapposta vinta |
| Esploratore | Maestro di Imboscate | condition | fino all'inizio del prossimo turno del ladro |

Potere Psionico diventa la carta descrittiva della capacità madre, con il pool
dei dadi tracciato.

## Escluse dal batch

| ID | Motivo |
|---|---|
| Occhio Infallibile | usi pari alla Saggezza senza pool: carta descrittiva |
| Lame Psichiche, Schermagliatore, Fuorviare, Manovra Elegante, Colpo Improvviso | forme d'attacco e reazioni istantanee: carte descrittive |
| Pegni dei Defunti, Compagno della Morte | potenziamenti e oggetti: carte descrittive |
| Maestro di Intrighi, Assassino, Furfante | competenze e passive: carte descrittive |

## Verifica

- test nuovi: `test/rogueArchetypesFeatureRuntime.test.js`; il test del
  Mistificatore Arcano è invariato e passa;
- audit rigenerato: implementate 219 → 231, automazione con soli dati 45 → 34.

## Aggiornamento: TS ripetuti

Squarciare la Mente mostra il popup del TS Saggezza alla fine di ogni turno
del bersaglio. La CD (8 + competenza + Destrezza) non è la CD degli
incantesimi: il popup non la mostra e la riporta nel testo.

Le pill dichiarano `effectPlan.saveReminder` negli override; `classFeatureCore.js`
lo proietta (anche dalle `choiceOptions`) e lo copia nell'istanza, quindi il
popup è quello degli incantesimi (`effectSaveReminderCore.js`). Con TS superato
la pill viene rimossa; con TS fallito resta. Test:
`test/classFeatureSaveReminder.test.js`.
