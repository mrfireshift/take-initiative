# Specie

La specie si sceglie nella scheda personaggio (scheda **Capacità**, sezione
**Specie**). Molte specie chiedono una seconda scelta: l'ascendenza per i
dragonidi, la sottorazza o la variante per le altre. I tratti compaiono tra le
capacità della card, con manuale e pagina.

Il catalogo segue le regole 2014 (mai le 2024). I testi sono sintesi in
italiano scritte per il plugin: vanno verificati sul manuale indicato.
Il codice è in `src/speciesTraitCore.js`; le specie dalla tranche 2 in poi
sono dichiarate in `src/speciesCatalogVoloMordenkainen.js`.

Una specie ristampata in un manuale successivo resta in entrambe le versioni,
come i dragonidi del Manuale del Giocatore e di Fizban: nella tendina compare
sotto ciascun manuale (per esempio Aasimar in Volo e in Mostri del
Multiverso).

## Come funzionano i tratti

- **Resistenze**: quelle della specie o della sottorazza entrano da sole nelle
  difese del profilo (Azioni boss incluse). Non vanno ripetute in Difese.
- **Tratti passivi**: promemoria descrittivo sulla card. Vantaggi ai tiri
  salvezza, Fortunato e Attacchi selvaggi si applicano al tavolo.
- **Tratti con usi** (incantesimi innati, Tenacia implacabile, armi a soffio):
  **Conferma consumo** scala l'uso, che torna con il riposo indicato. L'effetto
  si risolve al tavolo: il plugin non tocca PF, tiri o bersagli.
- **Trasformazioni da 1 minuto** (Anima radiosa, Consunzione radiosa, Sudario
  necrotico, Rivelazione celestiale): **Attiva** scala l'uso e mette una pill
  di 10 round sul personaggio, con il promemoria dei danni extra.
- Gli usi "pari al bonus di competenza" di Mostri del Multiverso seguono il
  livello totale del personaggio.
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

## Tranche 2 — Volo, Tomo dei Nemici, Mostri del Multiverso

Le ristampe di Mostri del Multiverso, di questa tranche e delle successive,
sono raccolte nella sezione dedicata in fondo.

Nel Tomo dei Nemici eladrin, elfo marino e shadar-kai sono sottorazze
dell'elfo, il duergar del nano e lo gnomo delle profondità dello gnomo: qui
sono specie a sé, con il tratto della specie madre che conta in combattimento
(Ascendenza fatata, Resilienza nanica, Astuzia gnomesca). Il tiefling del Tomo
è una specie con la **stirpe** come seconda scelta; il tiefling del Manuale del
Giocatore resta com'era (equivale alla stirpe di Asmodeus).

Restano fuori, oltre a competenze e linguaggi: Costituzione possente (capacità
di carico), Trance e Sensi acuti, Conoscenza astrale dei githyanki di Mostri
del Multiverso (una competenza a scelta dopo il riposo lungo).

Da controllare con più attenzione, perché il ricordo è meno sicuro:

- **tutte le pagine di Mostri del Multiverso**, e le pagine delle singole
  stirpi tiefling (21–23);
- il danno del Morso del lucertoloide in Mostri del Multiverso (qui tagliente;
  in Volo è perforante);
- l'opzione Dispetto del Dono fatato dell'hobgoblin di Mostri del Multiverso;
- l'Elfo marino di Mostri del Multiverso: qui senza resistenza al freddo;
- i nomi italiani dei tratti, scritti senza il manuale italiano davanti.

### Guida di Volo ai Mostri

| Specie | Opzione | Tratto | Pag. | Uso | Liv. |
|---|---|---|---|---|---|
| Aasimar | — | Resistenza celestiale | 105 | Passiva | 1 |
| Aasimar | — | Mani guaritrici | 105 | Azione · 1/riposo lungo | 1 |
| Aasimar | — | Portatore di luce | 105 | Passiva | 1 |
| Aasimar | Aasimar protettore | Anima radiosa | 105 | Azione · 1/riposo lungo · pill 1 min | 3 |
| Aasimar | Aasimar flagello | Consunzione radiosa | 105 | Azione · 1/riposo lungo · pill 1 min | 3 |
| Aasimar | Aasimar caduto | Sudario necrotico | 105 | Azione · 1/riposo lungo · pill 1 min | 3 |
| Firbolg | — | Magia firbolg | 107 | Passiva | 1 |
| Firbolg | — | Magia firbolg: Individuazione del magico | 107 | Azione · 1/riposo breve | 1 |
| Firbolg | — | Magia firbolg: Camuffare se stesso | 107 | Azione · 1/riposo breve | 1 |
| Firbolg | — | Passo nascosto | 107 | Azione bonus · 1/riposo breve | 1 |
| Firbolg | — | Linguaggio delle bestie e delle foglie | 107 | Passiva | 1 |
| Goliath | — | Resistenza della pietra | 109 | Reazione · 1/riposo breve | 1 |
| Goliath | — | Nato sulle montagne | 109 | Passiva | 1 |
| Kenku | — | Contraffazione esperta | 111 | Passiva | 1 |
| Kenku | — | Mimica | 111 | Passiva | 1 |
| Lucertoloide | — | Morso | 113 | Passiva | 1 |
| Lucertoloide | — | Artigiano astuto | 113 | Passiva | 1 |
| Lucertoloide | — | Trattenere il respiro | 113 | Passiva | 1 |
| Lucertoloide | — | Armatura naturale | 113 | Passiva | 1 |
| Lucertoloide | — | Fauci fameliche | 113 | Azione bonus · 1/riposo breve | 1 |
| Tabaxi | — | Agilità felina | 115 | Passiva | 1 |
| Tabaxi | — | Artigli felini | 115 | Passiva | 1 |
| Tritone | — | Anfibio | 118 | Passiva | 1 |
| Tritone | — | Controllo di aria e acqua | 118 | Passiva | 1 |
| Tritone | — | Controllo di aria e acqua: Nube di nebbia | 118 | Azione · 1/riposo lungo | 1 |
| Tritone | — | Controllo di aria e acqua: Folata di vento | 118 | Azione · 1/riposo lungo | 3 |
| Tritone | — | Controllo di aria e acqua: Muro d'acqua | 118 | Azione · 1/riposo lungo | 5 |
| Tritone | — | Emissario del mare | 118 | Passiva | 1 |
| Tritone | — | Guardiano degli abissi | 118 | Passiva | 1 |
| Bugbear | — | Arti lunghi | 119 | Passiva | 1 |
| Bugbear | — | Attacco a sorpresa | 119 | Passiva | 1 |
| Goblin | — | Furia dei piccoli | 119 | Innesco · 1/riposo breve | 1 |
| Goblin | — | Fuga agile | 119 | Passiva | 1 |
| Hobgoblin | — | Salvare la faccia | 119 | Innesco · 1/riposo breve | 1 |
| Coboldo | — | Strisciare, piagnucolare e implorare | 119 | Azione · 1/riposo breve | 1 |
| Coboldo | — | Tattiche del branco | 119 | Passiva | 1 |
| Coboldo | — | Sensibilità alla luce del sole | 119 | Passiva | 1 |
| Orco | — | Aggressivo | 120 | Passiva | 1 |
| Yuan-ti purosangue | — | Incantesimi innati | 120 | Passiva | 1 |
| Yuan-ti purosangue | — | Incantesimi innati: Suggestione | 120 | Azione · 1/riposo lungo | 3 |
| Yuan-ti purosangue | — | Resistenza alla magia | 120 | Passiva | 1 |
| Yuan-ti purosangue | — | Immunità al veleno | 120 | Passiva | 1 |

### Il Tomo dei Nemici di Mordenkainen

| Specie | Opzione | Tratto | Pag. | Uso | Liv. |
|---|---|---|---|---|---|
| Tiefling | — | Resistenza infernale | 21 | Passiva | 1 |
| Tiefling | Tiefling di Asmodeus | Eredità di Asmodeus | 21 | Passiva | 1 |
| Tiefling | Tiefling di Asmodeus | Eredità di Asmodeus: Intimorire infernale | 21 | Reazione · 1/riposo lungo | 3 |
| Tiefling | Tiefling di Asmodeus | Eredità di Asmodeus: Oscurità | 21 | Azione · 1/riposo lungo | 5 |
| Tiefling | Tiefling di Baalzebul | Eredità di Baalzebul | 21 | Passiva | 1 |
| Tiefling | Tiefling di Baalzebul | Eredità di Baalzebul: Raggio di infermità | 21 | Azione · 1/riposo lungo | 3 |
| Tiefling | Tiefling di Baalzebul | Eredità di Baalzebul: Corona di follia | 21 | Azione · 1/riposo lungo | 5 |
| Tiefling | Tiefling di Dispater | Eredità di Dispater | 21 | Passiva | 1 |
| Tiefling | Tiefling di Dispater | Eredità di Dispater: Camuffare se stesso | 21 | Azione · 1/riposo lungo | 3 |
| Tiefling | Tiefling di Dispater | Eredità di Dispater: Individuazione dei pensieri | 21 | Azione · 1/riposo lungo | 5 |
| Tiefling | Tiefling di Fierna | Eredità di Fierna | 22 | Passiva | 1 |
| Tiefling | Tiefling di Fierna | Eredità di Fierna: Charme su persone | 22 | Azione · 1/riposo lungo | 3 |
| Tiefling | Tiefling di Fierna | Eredità di Fierna: Suggestione | 22 | Azione · 1/riposo lungo | 5 |
| Tiefling | Tiefling di Glasya | Eredità di Glasya | 22 | Passiva | 1 |
| Tiefling | Tiefling di Glasya | Eredità di Glasya: Camuffare se stesso | 22 | Azione · 1/riposo lungo | 3 |
| Tiefling | Tiefling di Glasya | Eredità di Glasya: Invisibilità | 22 | Azione · 1/riposo lungo | 5 |
| Tiefling | Tiefling di Levistus | Eredità di Levistus | 22 | Passiva | 1 |
| Tiefling | Tiefling di Levistus | Eredità di Levistus: Armatura di Agathys | 22 | Azione · 1/riposo lungo | 3 |
| Tiefling | Tiefling di Levistus | Eredità di Levistus: Oscurità | 22 | Azione · 1/riposo lungo | 5 |
| Tiefling | Tiefling di Mammon | Eredità di Mammon | 22 | Passiva | 1 |
| Tiefling | Tiefling di Mammon | Eredità di Mammon: Disco fluttuante di Tenser | 22 | Azione · 1/riposo lungo | 3 |
| Tiefling | Tiefling di Mammon | Eredità di Mammon: Serratura arcana | 22 | Azione · 1/riposo lungo | 5 |
| Tiefling | Tiefling di Mefistofele | Eredità di Mefistofele | 23 | Passiva | 1 |
| Tiefling | Tiefling di Mefistofele | Eredità di Mefistofele: Mani brucianti | 23 | Azione · 1/riposo lungo | 3 |
| Tiefling | Tiefling di Mefistofele | Eredità di Mefistofele: Lama infuocata | 23 | Azione bonus · 1/riposo lungo | 5 |
| Tiefling | Tiefling di Zariel | Eredità di Zariel | 23 | Passiva | 1 |
| Tiefling | Tiefling di Zariel | Eredità di Zariel: Punizione incandescente | 23 | Azione bonus · 1/riposo lungo | 3 |
| Tiefling | Tiefling di Zariel | Eredità di Zariel: Punizione marchiante | 23 | Azione bonus · 1/riposo lungo | 5 |
| Eladrin | — | Ascendenza fatata | 61 | Passiva | 1 |
| Eladrin | — | Passo fatato | 61 | Azione bonus · 1/riposo breve | 1 |
| Elfo marino | — | Ascendenza fatata | 62 | Passiva | 1 |
| Elfo marino | — | Figlio del mare | 62 | Passiva | 1 |
| Elfo marino | — | Amico del mare | 62 | Passiva | 1 |
| Shadar-kai | — | Ascendenza fatata | 62 | Passiva | 1 |
| Shadar-kai | — | Resistenza necrotica | 62 | Passiva | 1 |
| Shadar-kai | — | Benedizione della Regina Corvo | 62 | Azione bonus · 1/riposo lungo | 1 |
| Duergar | — | Resilienza nanica | 81 | Passiva | 1 |
| Duergar | — | Resilienza duergar | 81 | Passiva | 1 |
| Duergar | — | Magia duergar | 81 | Passiva | 1 |
| Duergar | — | Magia duergar: Ingrandire | 81 | Azione · 1/riposo lungo | 3 |
| Duergar | — | Magia duergar: Invisibilità | 81 | Azione · 1/riposo lungo | 5 |
| Duergar | — | Sensibilità alla luce del sole | 81 | Passiva | 1 |
| Githyanki | — | Psionica githyanki | 96 | Passiva | 1 |
| Githyanki | — | Psionica githyanki: Saltare | 96 | Azione · 1/riposo lungo | 3 |
| Githyanki | — | Psionica githyanki: Passo velato | 96 | Azione bonus · 1/riposo lungo | 5 |
| Githzerai | — | Disciplina mentale | 96 | Passiva | 1 |
| Githzerai | — | Psionica githzerai | 96 | Passiva | 1 |
| Githzerai | — | Psionica githzerai: Scudo | 96 | Reazione · 1/riposo lungo | 3 |
| Githzerai | — | Psionica githzerai: Individuazione dei pensieri | 96 | Azione · 1/riposo lungo | 5 |
| Gnomo delle profondità | — | Astuzia gnomesca | 113 | Passiva | 1 |
| Gnomo delle profondità | — | Mimetismo della pietra | 113 | Passiva | 1 |

## Tranche 3 — Elemental Evil, Costa della Spada

Il goliath di Elemental Evil ha lo stesso testo di quello di Volo, il duergar
della Costa della Spada quello del Tomo dei Nemici, e lo gnomo delle profondità
di entrambi quello del Tomo dei Nemici: non sono doppioni nella tendina. Si
sceglie la voce di Volo o del Tomo; l'import li riconosce anche con
`source: "Elemental Evil"` o `"Costa della Spada"`.

Il genasi ha l'**Elemento** come seconda scelta (aria, terra, fuoco, acqua).
Nella Costa della Spada:

- il **mezzelfo** ha la **Variante** al posto di Versatilità nelle abilità
  (addestramento nelle armi elfiche, trucchetto dell'alto elfo, piede lesto,
  maschera della selva, magia drow, discendenza acquatica);
- il **tiefling** ha la **Variante** al posto di Eredità infernale (lingua del
  diavolo, fuoco infernale, alato); il tiefling ferino o dall'aspetto diverso
  cambia solo i punteggi e usa "Eredità infernale";
- l'**halfling spettrale** è una specie a sé con i tratti dell'halfling;
- elfi del sole e della luna, nani dorati e dello scudo, halfling cuorforte:
  sono i nomi del Faerûn per alto elfo, nano delle colline e delle montagne,
  halfling tozzo; l'import li riconosce.

Restano fuori il talento Magia svirfneblin (un talento, non un tratto di
specie) e le etnie umane, senza regole proprie.

Da controllare con più attenzione:

- **le pagine di Elemental Evil Player's Companion**, in particolare quelle
  dei quattro genasi (qui tutte a p. 9), e quelle di aarakocra e genasi in
  Mostri del Multiverso;
- il nome italiano dell'halfling spettrale (ghostwise) e quelli dei tratti dei
  genasi;
- il titolo: Elemental Evil Player's Companion è indicato in inglese.

### Elemental Evil Player's Companion

| Specie | Opzione | Tratto | Pag. | Uso | Liv. |
|---|---|---|---|---|---|
| Aarakocra | — | Volo | 5 | Passiva | 1 |
| Aarakocra | — | Artigli | 5 | Passiva | 1 |
| Genasi | Genasi dell'aria | Respiro inesauribile | 9 | Passiva | 1 |
| Genasi | Genasi dell'aria | Mescolarsi al vento: Levitazione | 9 | Azione · 1/riposo lungo | 1 |
| Genasi | Genasi della terra | Camminare sulla terra | 9 | Passiva | 1 |
| Genasi | Genasi della terra | Fondersi con la pietra: Passare senza tracce | 9 | Azione · 1/riposo lungo | 1 |
| Genasi | Genasi del fuoco | Resistenza al fuoco | 9 | Passiva | 1 |
| Genasi | Genasi del fuoco | Raggiungere la fiamma | 9 | Passiva | 1 |
| Genasi | Genasi del fuoco | Raggiungere la fiamma: Mani brucianti | 9 | Azione · 1/riposo lungo | 3 |
| Genasi | Genasi dell'acqua | Resistenza all'acido | 9 | Passiva | 1 |
| Genasi | Genasi dell'acqua | Anfibio | 9 | Passiva | 1 |
| Genasi | Genasi dell'acqua | Richiamo dell'onda | 9 | Passiva | 1 |
| Genasi | Genasi dell'acqua | Richiamo dell'onda: Creare o distruggere acqua | 9 | Azione · 1/riposo lungo | 3 |

### Guida del Giocatore alla Costa della Spada

| Specie | Opzione | Tratto | Pag. | Uso | Liv. |
|---|---|---|---|---|---|
| Halfling spettrale | — | Fortunato | 110 | Passiva | 1 |
| Halfling spettrale | — | Coraggioso | 110 | Passiva | 1 |
| Halfling spettrale | — | Agilità halfling | 110 | Passiva | 1 |
| Halfling spettrale | — | Linguaggio silenzioso | 110 | Passiva | 1 |
| Mezzelfo | — | Ascendenza fatata | 116 | Passiva | 1 |
| Mezzelfo | Trucchetto dell'alto elfo | Trucchetto | 116 | Passiva | 1 |
| Mezzelfo | Piede lesto | Piede lesto | 116 | Passiva | 1 |
| Mezzelfo | Maschera della selva | Maschera della selva | 116 | Passiva | 1 |
| Mezzelfo | Magia drow | Magia drow | 116 | Passiva | 1 |
| Mezzelfo | Magia drow | Magia drow: Luminescenza | 116 | Azione · 1/riposo lungo | 3 |
| Mezzelfo | Magia drow | Magia drow: Oscurità | 116 | Azione · 1/riposo lungo | 5 |
| Mezzelfo | Discendenza acquatica | Discendenza acquatica | 116 | Passiva | 1 |
| Tiefling | — | Resistenza infernale | 118 | Passiva | 1 |
| Tiefling | Eredità infernale | Eredità infernale | 118 | Passiva | 1 |
| Tiefling | Eredità infernale | Eredità infernale: Intimorire infernale | 118 | Reazione · 1/riposo lungo | 3 |
| Tiefling | Eredità infernale | Eredità infernale: Oscurità | 118 | Azione · 1/riposo lungo | 5 |
| Tiefling | Lingua del diavolo | Lingua del diavolo | 118 | Passiva | 1 |
| Tiefling | Lingua del diavolo | Lingua del diavolo: Charme su persone | 118 | Azione · 1/riposo lungo | 3 |
| Tiefling | Lingua del diavolo | Lingua del diavolo: Estasiare | 118 | Azione · 1/riposo lungo | 5 |
| Tiefling | Fuoco infernale | Fuoco infernale | 118 | Passiva | 1 |
| Tiefling | Fuoco infernale | Fuoco infernale: Mani brucianti | 118 | Azione · 1/riposo lungo | 3 |
| Tiefling | Fuoco infernale | Fuoco infernale: Oscurità | 118 | Azione · 1/riposo lungo | 5 |
| Tiefling | Alato | Alato | 118 | Passiva | 1 |

## Mordenkainen presenta: Mostri del Multiverso

Le ristampe delle specie delle tranche precedenti, in ordine alfabetico. Le
altre specie del manuale (centauro, changeling, fata, harengon, minotauro,
satiro, shifter, tortle) arrivano con il loro manuale d'origine.

| Specie | Opzione | Tratto | Pag. | Uso | Liv. |
|---|---|---|---|---|---|
| Aarakocra | — | Volo | 6 | Passiva | 1 |
| Aarakocra | — | Artigli | 6 | Passiva | 1 |
| Aarakocra | — | Richiamo del vento: Folata di vento | 6 | Azione · 1/riposo lungo | 3 |
| Aasimar | — | Resistenza celestiale | 7 | Passiva | 1 |
| Aasimar | — | Mani guaritrici | 7 | Azione · 1/riposo lungo | 1 |
| Aasimar | — | Portatore di luce | 7 | Passiva | 1 |
| Aasimar | — | Rivelazione celestiale: Ali celestiali | 7 | Azione bonus · 1/riposo lungo · pill 1 min | 3 |
| Aasimar | — | Rivelazione celestiale: Radiosità interiore | 7 | Azione bonus · 1/riposo lungo · pill 1 min | 3 |
| Aasimar | — | Rivelazione celestiale: Sudario necrotico | 7 | Azione bonus · 1/riposo lungo · pill 1 min | 3 |
| Bugbear | — | Ascendenza fatata | 8 | Passiva | 1 |
| Bugbear | — | Arti lunghi | 8 | Passiva | 1 |
| Bugbear | — | Attacco a sorpresa | 8 | Passiva | 1 |
| Coboldo | — | Grido draconico | 25 | Azione bonus · competenza/riposo lungo | 1 |
| Coboldo | Retaggio della sfida | Retaggio coboldo: Sfida | 25 | Passiva | 1 |
| Coboldo | Retaggio della stregoneria draconica | Retaggio coboldo: Stregoneria draconica | 25 | Passiva | 1 |
| Duergar | — | Magia duergar | 12 | Passiva | 1 |
| Duergar | — | Magia duergar: Ingrandire/ridurre | 12 | Azione · 1/riposo lungo | 3 |
| Duergar | — | Magia duergar: Invisibilità | 12 | Azione · 1/riposo lungo | 5 |
| Duergar | — | Resilienza nanica | 12 | Passiva | 1 |
| Duergar | — | Fortezza psionica | 12 | Passiva | 1 |
| Eladrin | — | Ascendenza fatata | 13 | Passiva | 1 |
| Eladrin | — | Passo fatato | 13 | Azione bonus · competenza/riposo lungo | 1 |
| Eladrin | Eladrin d'autunno | Passo fatato d'autunno | 13 | Passiva | 3 |
| Eladrin | Eladrin d'inverno | Passo fatato d'inverno | 13 | Passiva | 3 |
| Eladrin | Eladrin di primavera | Passo fatato di primavera | 13 | Passiva | 3 |
| Eladrin | Eladrin d'estate | Passo fatato d'estate | 13 | Passiva | 3 |
| Elfo marino | — | Ascendenza fatata | 30 | Passiva | 1 |
| Elfo marino | — | Figlio del mare | 30 | Passiva | 1 |
| Elfo marino | — | Amico del mare | 30 | Passiva | 1 |
| Firbolg | — | Magia firbolg | 15 | Passiva | 1 |
| Firbolg | — | Magia firbolg: Individuazione del magico | 15 | Azione · 1/riposo lungo | 1 |
| Firbolg | — | Magia firbolg: Camuffare se stesso | 15 | Azione · 1/riposo lungo | 1 |
| Firbolg | — | Passo nascosto | 15 | Azione bonus · competenza/riposo lungo | 1 |
| Firbolg | — | Linguaggio delle bestie e delle foglie | 15 | Passiva | 1 |
| Genasi | Genasi dell'aria | Respiro inesauribile | 16 | Passiva | 1 |
| Genasi | Genasi dell'aria | Resistenza al fulmine | 16 | Passiva | 1 |
| Genasi | Genasi dell'aria | Mescolarsi al vento | 16 | Passiva | 1 |
| Genasi | Genasi dell'aria | Mescolarsi al vento: Caduta morbida | 16 | Reazione · 1/riposo lungo | 3 |
| Genasi | Genasi dell'aria | Mescolarsi al vento: Levitazione | 16 | Azione · 1/riposo lungo | 5 |
| Genasi | Genasi della terra | Camminare sulla terra | 16 | Passiva | 1 |
| Genasi | Genasi della terra | Fondersi con la pietra | 16 | Passiva | 1 |
| Genasi | Genasi della terra | Fondersi con la pietra: Interdizione alle lame | 16 | Azione bonus · competenza/riposo lungo | 1 |
| Genasi | Genasi della terra | Fondersi con la pietra: Passare senza tracce | 16 | Azione · 1/riposo lungo | 5 |
| Genasi | Genasi del fuoco | Resistenza al fuoco | 16 | Passiva | 1 |
| Genasi | Genasi del fuoco | Raggiungere la fiamma | 16 | Passiva | 1 |
| Genasi | Genasi del fuoco | Raggiungere la fiamma: Mani brucianti | 16 | Azione · 1/riposo lungo | 3 |
| Genasi | Genasi del fuoco | Raggiungere la fiamma: Lama infuocata | 16 | Azione bonus · 1/riposo lungo | 5 |
| Genasi | Genasi dell'acqua | Resistenza all'acido | 16 | Passiva | 1 |
| Genasi | Genasi dell'acqua | Anfibio | 16 | Passiva | 1 |
| Genasi | Genasi dell'acqua | Richiamo dell'onda | 16 | Passiva | 1 |
| Genasi | Genasi dell'acqua | Richiamo dell'onda: Creare o distruggere acqua | 16 | Azione · 1/riposo lungo | 3 |
| Genasi | Genasi dell'acqua | Richiamo dell'onda: Camminare sull'acqua | 16 | Azione · 1/riposo lungo | 5 |
| Githyanki | — | Psionica githyanki | 18 | Passiva | 1 |
| Githyanki | — | Psionica githyanki: Saltare | 18 | Azione · 1/riposo lungo | 3 |
| Githyanki | — | Psionica githyanki: Passo velato | 18 | Azione bonus · 1/riposo lungo | 5 |
| Githyanki | — | Resilienza psichica | 18 | Passiva | 1 |
| Githzerai | — | Disciplina mentale | 19 | Passiva | 1 |
| Githzerai | — | Psionica githzerai | 19 | Passiva | 1 |
| Githzerai | — | Psionica githzerai: Scudo | 19 | Reazione · 1/riposo lungo | 3 |
| Githzerai | — | Psionica githzerai: Individuazione dei pensieri | 19 | Azione · 1/riposo lungo | 5 |
| Githzerai | — | Resilienza psichica | 19 | Passiva | 1 |
| Gnomo delle profondità | — | Dono degli svirfneblin | 11 | Passiva | 1 |
| Gnomo delle profondità | — | Dono degli svirfneblin: Camuffare se stesso | 11 | Azione · 1/riposo lungo | 3 |
| Gnomo delle profondità | — | Dono degli svirfneblin: Anti-individuazione | 11 | Azione · 1/riposo lungo | 5 |
| Gnomo delle profondità | — | Resistenza alla magia gnomesca | 11 | Passiva | 1 |
| Gnomo delle profondità | — | Mimetismo svirfneblin | 11 | Innesco · competenza/riposo lungo | 1 |
| Goblin | — | Ascendenza fatata | 20 | Passiva | 1 |
| Goblin | — | Furia dei piccoli | 20 | Innesco · competenza/riposo lungo | 1 |
| Goblin | — | Fuga agile | 20 | Passiva | 1 |
| Goliath | — | Nato sulle montagne | 21 | Passiva | 1 |
| Goliath | — | Resistenza della pietra | 21 | Reazione · competenza/riposo lungo | 1 |
| Hobgoblin | — | Ascendenza fatata | 23 | Passiva | 1 |
| Hobgoblin | — | Dono fatato | 23 | Azione bonus · competenza/riposo lungo | 1 |
| Hobgoblin | — | Fortuna dei molti | 23 | Innesco · competenza/riposo lungo | 1 |
| Kenku | — | Duplicazione esperta | 24 | Passiva | 1 |
| Kenku | — | Memoria kenku | 24 | Innesco · competenza/riposo lungo | 1 |
| Kenku | — | Mimica | 24 | Passiva | 1 |
| Lucertoloide | — | Morso | 26 | Passiva | 1 |
| Lucertoloide | — | Trattenere il respiro | 26 | Passiva | 1 |
| Lucertoloide | — | Armatura naturale | 26 | Passiva | 1 |
| Lucertoloide | — | Fauci fameliche | 26 | Azione bonus · competenza/riposo lungo | 1 |
| Orco | — | Scarica di adrenalina | 28 | Azione bonus · competenza/riposo breve | 1 |
| Orco | — | Tenacia implacabile | 28 | Innesco · 1/riposo lungo | 1 |
| Shadar-kai | — | Ascendenza fatata | 31 | Passiva | 1 |
| Shadar-kai | — | Resistenza necrotica | 31 | Passiva | 1 |
| Shadar-kai | — | Benedizione della Regina Corvo | 31 | Azione bonus · competenza/riposo lungo | 1 |
| Tabaxi | — | Artigli felini | 33 | Passiva | 1 |
| Tabaxi | — | Agilità felina | 33 | Passiva | 1 |
| Tritone | — | Anfibio | 35 | Passiva | 1 |
| Tritone | — | Controllo di aria e acqua | 35 | Passiva | 1 |
| Tritone | — | Controllo di aria e acqua: Nube di nebbia | 35 | Azione · 1/riposo lungo | 1 |
| Tritone | — | Controllo di aria e acqua: Folata di vento | 35 | Azione · 1/riposo lungo | 3 |
| Tritone | — | Controllo di aria e acqua: Camminare sull'acqua | 35 | Azione · 1/riposo lungo | 5 |
| Tritone | — | Emissario del mare | 35 | Passiva | 1 |
| Tritone | — | Guardiano degli abissi | 35 | Passiva | 1 |
| Yuan-ti | — | Resistenza alla magia | 36 | Passiva | 1 |
| Yuan-ti | — | Resilienza al veleno | 36 | Passiva | 1 |
| Yuan-ti | — | Incantesimi serpentini | 36 | Passiva | 1 |
| Yuan-ti | — | Incantesimi serpentini: Suggestione | 36 | Azione · 1/riposo lungo | 3 |

## Tranche successive

Ancora da scrivere: Eberron, Ravnica, Theros, Wildemount, Strixhaven,
Witchlight, Van Richten, Spelljammer, Dragonlance, il lignaggio personalizzato
di Tasha e le specie minori (Locathah, Grung, Verdan), ciascuna con la propria
ristampa in Mostri del Multiverso dove c'è. Una specie fuori catalogo,
importata da una scheda, viene segnalata e non applicata.
