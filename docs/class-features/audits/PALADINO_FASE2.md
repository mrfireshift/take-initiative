# Batch Paladino — Fase 2 (15 ottobre 2026)

Commit di partenza: `d5568f5`. Perimetro: i giuramenti non curati in
precedenza (Antichi, Sentinelle, Conquista, Gloria, Redenzione). Classe base,
Devozione e Vendetta erano già curati e **non sono stati toccati** (27 voci
escluse a monte).

Capacità implementate nel batch: **18** (11 `condition`, 4 `resource-only`,
3 `aura`), tutte con soli override. Il Paladino passa da 12 a 30 capacità
attivabili; il catalogo da 231 a 249.

## Incanalare Divinità

Per Sentinelle, Gloria, Conquista e Redenzione la fonte mette il costo sul
contenitore del giuramento e lascia le opzioni senza costo. Come in Devozione
e Vendetta, il batch fa spendere `paladino-incanalare-divinita-usi` a ogni
opzione e rende il contenitore una carta descrittiva con il pool tracciato.

| Giuramento | Opzione | Adapter | Pill |
|---|---|---|---|
| Sentinelle | Abiurare Creature Extraplanari | condition, 9 m, più bersagli | Scacciato 10 round, termina con danno (TS fallito) |
| Sentinelle | Volontà della Sentinella | condition, 9 m, più bersagli, paladino incluso | 10 round |
| Gloria | Atleta Impareggiabile | condition (sé) | 100 round |
| Gloria | Punizione Ispiratrice | resource-only | PF temporanei con il controllo HP |
| Conquista | Colpo Guidato | resource-only | — |
| Conquista | Presenza Conquistatrice | condition, 9 m, più bersagli | Spaventato 10 round (TS fallito); popup TS Saggezza a fine turno |
| Redenzione | Emissario di Pace | condition (sé) | 100 round |
| Redenzione | Intimorire i Violenti | resource-only | danni manuali |
| Antichi | Collera della Natura | condition, 3 m | Trattenuto senza scadenza (TS fallito); popup TS a fine turno |
| Antichi | Scacciare gli Infedeli | condition, 9 m, più bersagli | Scacciato 10 round, termina con danno (TS fallito) |

## Aure di 7° livello

Modello di Aura di Protezione: aura passiva automatica, solo alleati, paladino
incluso, nessuna pill sulla sorgente, termina se il paladino è privo di sensi.

| Aura | Raggio | Effetto sugli alleati |
|---|---|---|
| Aura della Sentinella | 3 m, 9 m dal 18° | + bonus di competenza all'iniziativa |
| Aura di Alacrità | 1,5 m, 4,5 m dal 18° | +3 m di velocità |
| Aura di Interdizione | 3 m, 9 m dal 18° | resistenza ai danni degli incantesimi |

## Capstone e usi

| Capacità | Adapter | Note |
|---|---|---|
| Baluardo dei Mortali, Leggenda Vivente, Conquistatore Invincibile, Campione degli Antichi | condition (sé), pool | 10 round; i 10 PF per turno del Campione con il controllo HP |
| Sentinella Imperitura | resource-only | resta a 1 PF una volta per riposo lungo |

## Escluse dal batch

| ID | Motivo |
|---|---|
| Aura di Conquista | colpisce solo le creature spaventate dal paladino: l'aura non filtra per condizione |
| Aura del Guardiano, Punizione Solerte, Intimorire Sprezzante | reazioni o danni istantanei: carte descrittive |
| Difesa Gloriosa | usi pari al Carisma: P1 |
| Emissario di Redenzione, Spirito Protettivo | resistenze e cure condizionate: carte descrittive |

## Verifica

- test nuovi: `test/paladinOathsFeatureRuntime.test.js` (costi delle opzioni,
  contenitori, raggi delle aure al 7° e al 18°, velocità di Alacrità); il test
  di Devozione passa con il solo conteggio aggiornato;
- audit rigenerato: implementate 231 → 249, automazione con soli dati 34 → 18.

## Aggiornamento: TS ripetuti

Presenza Conquistatrice e Collera della Natura mostrano il popup del TS alla
fine di ogni turno del bersaglio, con `dcSource: "source-spell"`: la CD di
Incanalare Divinità è la CD incantesimi del paladino. Il popup ha una sola
caratteristica: Collera della Natura mostra «TS FOR» e il testo ricorda che il
bersaglio sceglie tra Forza e Destrezza.

Le pill dichiarano `effectPlan.saveReminder` negli override; `classFeatureCore.js`
lo proietta (anche dalle `choiceOptions`) e lo copia nell'istanza, quindi il
popup è quello degli incantesimi (`effectSaveReminderCore.js`). Con TS superato
la pill viene rimossa; con TS fallito resta. Test:
`test/classFeatureSaveReminder.test.js`.
