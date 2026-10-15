# Batch Druido — Fase 2 (15 ottobre 2026)

Commit di partenza: `5c23ca1`. Capacità implementate nel batch: **13**
(7 `condition`, 6 `resource-only`), tutte con soli override. Il Druido passa
da 0 a 13 capacità attivabili; il catalogo da 175 a 188.

## Decisione: trasformazioni ed evocazioni come marker

Forma Selvatica, Forma Elementale, Forma Siderale, Entità Simbiotica, Spirito
della Fiamma e Totem Spirituale diventano **pill sul druido** che spendono il
pool corretto e mostrano durata e condizioni di fine. Il plugin **non**
sostituisce i PF del druido con quelli della bestia e non crea token: `meta.hp`,
sincronizzazione HP e barre HP sulla mappa restano invariati. Statistiche e PF
della forma o dello spirito restano al GM. Un vero layer di PF della forma è
la primitiva `transformation`, ancora da decidere (rischio alto).

Totem Spirituale RAW crea l'aura attorno allo spirito, non al druido: il
motore delle aure la centra sulla sorgente, quindi resta un marker sul druido
con la scelta Falco/Orso/Unicorno.

## Capacità

| Capacità | Adapter | Pool | Note |
|---|---|---|---|
| Forma Selvatica | condition (sé) | Forma Selvatica | senza scadenza (metà livello in ore), termina a 0 PF o privo di sensi; illimitata al 20° |
| Forma Selvatica Elementale | condition (sé) | Forma Selvatica ×2 | Circolo della Luna |
| Forma Siderale | condition (sé), scelta Arciere/Calice/Drago | Forma Selvatica | 100 round o incapacitato |
| Profezia Cosmica | resource-only | esistente | ventura o sventura scelta al riposo lungo |
| Entità Simbiotica | condition (sé) | Forma Selvatica | 100 round; PF temporanei con il controllo HP |
| Diffusione di Spore | condition (sé), richiede Entità Simbiotica attiva | — | 10 round |
| Spirito della Fiamma | condition (sé) | Forma Selvatica | 600 round; il token dello spirito è del GM |
| Fiamme Cauterizzanti, Recupero Ardente | resource-only | esistenti | cure e danni con il controllo HP |
| Totem Spirituale | condition (sé), scelta Falco/Orso/Unicorno | esistente | 10 round o incapacitato |
| Evocazioni Fedeli | resource-only | esistente | le bestie evocate sono token del GM |
| Viandante dei Sogni | resource-only | esistente | l'incantesimo si lancia dal pannello |
| Recupero Naturale | resource-only | esistente | gli slot recuperati restano al tavolo |

Le opzioni di Forma Siderale e Totem Spirituale restano carte descrittive: la
variante si sceglie all'attivazione (`choiceOptions`).

## Escluse dal batch

| ID | Motivo |
|---|---|
| Balsamo della Corte dell'Estate | dadi spesi a scelta: `value-input` |
| Sentieri Nascosti | pool `max(1, modificatore_saggezza)`: P1 |
| Infestazione Fungina | zombi su token, usi pari alla Saggezza: `linked-token` |
| Carta Celeste | dardo tracciante gratuito: `spell-bridge` |
| Forma Selvatica da Combattimento, Costellazioni Scintillanti, Manto di Stelle, Legame Migliorato, Spirito Guardiano | potenziamenti di altre capacità: carte descrittive |
| Alone di Spore | reazione con TS e danni: carta descrittiva |

## Verifica

- test nuovi: `test/druidFeatureRuntime.test.js` (marker senza PF, uso
  illimitato al 20°, doppio costo, varianti, prerequisito);
- conteggi aggiornati; Backlog.5 usa ora Forma d'Ombra come esempio aperto di
  trasformazione;
- audit rigenerato: implementate 175 → 188, automazione con soli dati 78 → 71.
