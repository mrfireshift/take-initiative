# Specie

La specie si sceglie nella scheda personaggio (scheda **Capacità**, sezione
**Specie**). Molte specie chiedono una seconda scelta: l'ascendenza per i
dragonidi, la sottorazza o la variante per le altre. I tratti compaiono tra le
capacità della card, con manuale e pagina.

Il catalogo segue le regole 2014 (mai le 2024). I testi sono sintesi in
italiano scritte per il plugin: vanno verificati sul manuale indicato.
Il codice è in `src/speciesTraitCore.js`.

## Come funzionano i tratti

- **Resistenze**: quelle della specie o della sottorazza entrano da sole nelle
  difese del profilo (Azioni boss incluse). Non vanno ripetute in Difese.
- **Tratti passivi**: promemoria descrittivo sulla card. Vantaggi ai tiri
  salvezza, Fortunato e Attacchi selvaggi si applicano al tavolo.
- **Tratti con usi** (incantesimi innati, Tenacia implacabile, armi a soffio):
  **Conferma consumo** scala l'uso, che torna con il riposo indicato. L'effetto
  si risolve al tavolo: il plugin non tocca PF, tiri o bersagli.
- Un tratto compare dal livello indicato, contando il livello totale del
  personaggio.

Restano fuori, perché fanno parte della scheda e non del gioco al tavolo:
aumenti dei punteggi, competenze, linguaggi e scurovisione normale.

## Tranche 1 — Manuale del Giocatore 2014

| Specie | Sottorazza | Tratto | Pag. | Uso | Liv. |
|---|---|---|---|---|---|
| Nano | tutte | Resilienza nanica (resistenza al veleno automatica) | 20 | Passiva | 1 |
| Nano | delle colline | Robustezza nanica | 20 | Passiva | 1 |
| Nano | delle montagne | — | 20 | — | — |
| Elfo | tutte | Ascendenza fatata | 23 | Passiva | 1 |
| Elfo | alto elfo | Trucchetto | 24 | Passiva | 1 |
| Elfo | dei boschi | Piede lesto | 24 | Passiva | 1 |
| Elfo | dei boschi | Maschera della selva | 24 | Passiva | 1 |
| Elfo | oscuro (drow) | Sensibilità alla luce del sole | 24 | Passiva | 1 |
| Elfo | oscuro (drow) | Magia drow | 24 | Passiva | 1 |
| Elfo | oscuro (drow) | Magia drow: Luminescenza | 24 | Azione · 1/riposo lungo | 3 |
| Elfo | oscuro (drow) | Magia drow: Oscurità | 24 | Azione · 1/riposo lungo | 5 |
| Halfling | tutte | Fortunato | 28 | Passiva | 1 |
| Halfling | tutte | Coraggioso | 28 | Passiva | 1 |
| Halfling | tutte | Agilità halfling | 28 | Passiva | 1 |
| Halfling | piedelesto | Furtività innata | 28 | Passiva | 1 |
| Halfling | tozzo | Resilienza dei tozzi (resistenza al veleno automatica) | 28 | Passiva | 1 |
| Umano | standard | — | 29 | — | — |
| Umano | variante | Talento | 31 | Passiva | 1 |
| Dragonide | 10 ascendenze | Resistenza dell'ascendenza (automatica), Arma a soffio | 34 | Azione · 1/riposo breve | 1 |
| Gnomo | tutte | Astuzia gnomesca | 37 | Passiva | 1 |
| Gnomo | delle foreste | Illusionista nato | 37 | Passiva | 1 |
| Gnomo | delle foreste | Parlare con le piccole bestie | 37 | Passiva | 1 |
| Gnomo | delle rocce | Inventore | 37 | Passiva | 1 |
| Mezzelfo | — | Ascendenza fatata | 39 | Passiva | 1 |
| Mezzorco | — | Tenacia implacabile | 41 | Innesco · 1/riposo lungo | 1 |
| Mezzorco | — | Attacchi selvaggi | 41 | Passiva | 1 |
| Tiefling | — | Resistenza infernale (resistenza al fuoco automatica) | 43 | Passiva | 1 |
| Tiefling | — | Eredità infernale | 43 | Passiva | 1 |
| Tiefling | — | Eredità infernale: Intimorire infernale (2° livello) | 43 | Reazione · 1/riposo lungo | 3 |
| Tiefling | — | Eredità infernale: Oscurità | 43 | Azione · 1/riposo lungo | 5 |

## Il Tesoro dei Draghi di Fizban

| Specie | Ascendenze | Tratti | Pag. |
|---|---|---|---|
| Dragonide cromatico | nero, blu, verde, rosso, bianco | Resistenza (automatica), Arma a soffio (bonus di competenza/riposo lungo), Interdizione cromatica dal 5° | 20–21 |
| Dragonide metallico | ottone, bronzo, rame, oro, argento | Resistenza (automatica), Arma a soffio, Arma a soffio metallica dal 5° | 20, 22 |
| Dragonide di gemma | ametista, cristallo, smeraldo, zaffiro, topazio | Resistenza (automatica), Arma a soffio, Volo della gemma dal 5° | 20–21 |

## Tranche successive

Ancora da scrivere: le varianti della Guida del Giocatore alla Costa della
Spada, Volo, il Tomo dei Nemici di Mordenkainen, Mostri del Multiverso, Elemental
Evil, Eberron, Ravnica, Theros, Wildemount, Strixhaven, Witchlight, Van Richten,
Spelljammer, Dragonlance, il lignaggio personalizzato di Tasha e le specie
minori (Locathah, Grung, Verdan). Una specie fuori catalogo, importata da una
scheda, viene segnalata e non applicata.
