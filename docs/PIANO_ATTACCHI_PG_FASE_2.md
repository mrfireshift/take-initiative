# Attacchi PG — fase 2: Punizioni

Stato: **implementata, non committata** (con le fasi 0 e 1).

## Cosa fa

Due nuovi rider in [pcAttackRiderCatalog.js](../src/pcAttackRiderCatalog.js), mostrati nella sezione "Extra al colpo" come gli altri:

| Rider | Dadi | Tipo | Limite | Scelte del GM |
| --- | --- | --- | --- | --- |
| Punizione Divina (`paladino-punizione-divina`) | 2d8 con slot di 1° livello, +1d8 per livello, massimo 5d8; +1d8 contro non morti e immondi (fino a 6d8) | radiante | nessuno | livello dello slot (1°–5°), spunta "Non morto o immondo"; solo mischia |
| Punizione Occulta (`warlock-suppliche-occulte-punizione-occulta`) | 2d8 + 1d8 per livello dello slot del patto | forza | 1 per turno | spunta "Prono (taglia Enorme o inferiore)" |

- **Slot non conteggiati.** Gli slot dei PG non sono tracciati: il livello scelto è registrato nella causalità (`slotLevel`, `slotTracked: false`) e dopo il commit compare il promemoria "slot di N° livello speso, scalalo dalla scheda".
- **Slot del patto.** Il livello si ricava dal livello da warlock (1→1°, 3→2°, 5→3°, 7→4°, 9→5°) e non si sceglie. Senza livello da warlock nel profilo il rider resta disattivato con il motivo.
- **Tipo di creatura.** Non è registrato nel profilo, quindi il +1d8 contro non morti e immondi è una spunta del GM.
- **Prono** (Punizione Occulta) è una condizione standard, rimossa a mano: stesso comando del danno, quindi un solo Undo annulla entrambi. La taglia del bersaglio è valutata dal GM.
- **Punizione Divina Migliorata** resta un rider separato e si somma come componente distinta.
- **Punizione Ispiratrice** (Giuramento della Gloria): dopo una Punizione Divina compare un promemoria; l'Incanalare Divinità si attiva dalle capacità di classe come oggi.
- **Critico**: i dadi suggeriti raddoppiano (es. "5d8 · critico 10d8"); il GM inserisce il totale tirato.
- **Combat Log**: "Extra: Punizione Divina (slot 2°) 4d8 (18 radiosi) · Non morto o immondo".

## Fuori perimetro

- Punizioni-incantesimo (Punizione Accecante, Infuocata…): sono incantesimi, passano da "+ Componente" finché non si integrano gli incantesimi come rider (vedi [PIANO_ATTACCHI_PG_TRUCCHETTI.md](PIANO_ATTACCHI_PG_TRUCCHETTI.md)).
- Conteggio reale degli slot: progetto separato, tocca anche il modulo incantesimi.
- Requisito "arma del patto" per la Punizione Occulta: lo valuta il GM.
