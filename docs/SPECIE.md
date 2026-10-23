# Specie

La specie si sceglie nella scheda personaggio (scheda **Capacità**, sezione
**Specie**). Molte specie chiedono una seconda scelta: l'ascendenza per i
dragonidi, la sottorazza o la variante per le altre. I tratti compaiono tra le
capacità della card, con manuale e pagina.

Accanto alla specie c'è il campo facoltativo **Dono soprannaturale**: un dono
che si aggiunge alla specie senza sostituirla (per ora hollow one, di
Wildemount). I suoi tratti si sommano a quelli della specie e funzionano anche
senza specie. Nel profilo del token è il campo `supernaturalGift`, assente se
non scelto; **Nessuno** lo cancella.

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
  necrotico, Rivelazione celestiale): **Attiva** scala l'uso e mette
  un'etichetta di 10 round sul personaggio, con il promemoria dei danni extra.
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
| Aasimar | Aasimar protettore | Anima radiosa | 105 | Azione · 1/riposo lungo · etichetta 1 min | 3 |
| Aasimar | Aasimar flagello | Consunzione radiosa | 105 | Azione · 1/riposo lungo · etichetta 1 min | 3 |
| Aasimar | Aasimar caduto | Sudario necrotico | 105 | Azione · 1/riposo lungo · etichetta 1 min | 3 |
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

## Tranche 4 — Eberron

Il titolo è indicato in inglese, come per Elemental Evil: da correggere se
c'è un'edizione italiana con titolo e nomi ufficiali. Kalashtar, warforged e marchi del drago non hanno
ristampa in Mostri del Multiverso; changeling e shifter sì.

Bugbear, goblin, hobgoblin e orco di Eberron hanno gli stessi tratti di gioco
delle voci di Volo (l'orco di Eberron cambia solo punteggi e competenze): non
sono doppioni, e l'import li trova anche con `source: "Eberron"`.

- **Shifter**: la seconda scelta è la forma (pelle bestiale, zanna lunga, passo
  rapido, caccia selvaggia); **Mutazione** mette un'etichetta di 1 minuto. I punti
  ferita temporanei si aggiungono a mano: il plugin non tocca i PF.
- **Marchio del drago**: una specie con il **Marchio** come seconda scelta (i
  dodici marchi di Eberron, con la specie d'origine tra parentesi). Ogni marchio
  porta i tratti di gioco della specie d'origine che non sostituisce (per
  esempio Fortunato per gli halfling, Resilienza nanica per il marchio della
  protezione); gli incantesimi del marchio per le classi sono un promemoria,
  la tabella è sul manuale.

Restano fuori il talento Marchio del drago aberrante, gli strumenti di Dono del
creatore e le competenze di Progettazione specializzata dei warforged.

Da controllare con più attenzione:

- **tutte le pagine di Eberron**, in particolare quelle dei dodici marchi (qui
  tutti a p. 40), e quelle di changeling e shifter in Mostri del Multiverso;
- il raggio di Caccia selvaggia: qui 9 m in Eberron e 3 m in Mostri del
  Multiverso;
- i nomi italiani dei marchi e dei loro tratti, scritti senza un manuale
  italiano di riferimento.

### Eberron: Rising from the Last War

| Specie | Opzione | Tratto | Pag. | Uso | Liv. |
|---|---|---|---|---|---|
| Changeling | — | Mutaforma | 18 | Passiva | 1 |
| Kalashtar | — | Mente duplice | 23 | Passiva | 1 |
| Kalashtar | — | Disciplina mentale | 23 | Passiva | 1 |
| Kalashtar | — | Legame mentale | 23 | Passiva | 1 |
| Kalashtar | — | Separato dai sogni | 23 | Passiva | 1 |
| Shifter | Shifter pelle bestiale | Mutazione: Pelle bestiale | 27 | Azione bonus · 1/riposo breve · etichetta 1 min | 1 |
| Shifter | Shifter zanna lunga | Mutazione: Zanna lunga | 27 | Azione bonus · 1/riposo breve · etichetta 1 min | 1 |
| Shifter | Shifter passo rapido | Mutazione: Passo rapido | 27 | Azione bonus · 1/riposo breve · etichetta 1 min | 1 |
| Shifter | Shifter caccia selvaggia | Mutazione: Caccia selvaggia | 27 | Azione bonus · 1/riposo breve · etichetta 1 min | 1 |
| Warforged | — | Resilienza costruita | 36 | Passiva | 1 |
| Warforged | — | Riposo della sentinella | 36 | Passiva | 1 |
| Warforged | — | Protezione integrata | 36 | Passiva | 1 |
| Marchio del drago | — | Incantesimi del marchio | 40 | Passiva | 1 |
| Marchio del drago | Marchio della scoperta (mezzelfo) | Ascendenza fatata | 40 | Passiva | 1 |
| Marchio del drago | Marchio della scoperta (mezzelfo) | Intuizione deduttiva | 40 | Passiva | 1 |
| Marchio del drago | Marchio della scoperta (mezzelfo) | Individuazione magica | 40 | Passiva | 1 |
| Marchio del drago | Marchio della scoperta (mezzelfo) | Individuazione magica: Individuazione del magico | 40 | Azione · 1/riposo lungo | 1 |
| Marchio del drago | Marchio della scoperta (mezzelfo) | Individuazione magica: Individuazione delle malattie e dei veleni | 40 | Azione · 1/riposo lungo | 1 |
| Marchio del drago | Marchio della scoperta (mezzelfo) | Individuazione magica: Vedere invisibilità | 40 | Azione · 1/riposo lungo | 3 |
| Marchio del drago | Marchio del ritrovamento (mezzorco o umano) | Intuizione del cacciatore | 40 | Passiva | 1 |
| Marchio del drago | Marchio del ritrovamento (mezzorco o umano) | Magia del cercatore | 40 | Passiva | 1 |
| Marchio del drago | Marchio del ritrovamento (mezzorco o umano) | Magia del cercatore: Marchio del cacciatore | 40 | Azione bonus · 1/riposo lungo | 1 |
| Marchio del drago | Marchio del ritrovamento (mezzorco o umano) | Magia del cercatore: Localizza oggetto | 40 | Azione · 1/riposo lungo | 3 |
| Marchio del drago | Marchio dell'addestramento (umano) | Intuizione selvaggia | 40 | Passiva | 1 |
| Marchio del drago | Marchio dell'addestramento (umano) | Legame primordiale | 40 | Passiva | 1 |
| Marchio del drago | Marchio dell'addestramento (umano) | Legame primordiale: Amicizia con gli animali | 40 | Azione · 1/riposo lungo | 1 |
| Marchio del drago | Marchio dell'addestramento (umano) | Legame primordiale: Parlare con gli animali | 40 | Azione · 1/riposo lungo | 1 |
| Marchio del drago | Marchio dell'addestramento (umano) | Più sono grossi | 40 | Passiva | 3 |
| Marchio del drago | Marchio della guarigione (halfling) | Fortunato | 40 | Passiva | 1 |
| Marchio del drago | Marchio della guarigione (halfling) | Coraggioso | 40 | Passiva | 1 |
| Marchio del drago | Marchio della guarigione (halfling) | Agilità halfling | 40 | Passiva | 1 |
| Marchio del drago | Marchio della guarigione (halfling) | Intuizione medica | 40 | Passiva | 1 |
| Marchio del drago | Marchio della guarigione (halfling) | Tocco guaritore | 40 | Passiva | 1 |
| Marchio del drago | Marchio della guarigione (halfling) | Tocco guaritore: Cura ferite | 40 | Azione · 1/riposo lungo | 1 |
| Marchio del drago | Marchio della guarigione (halfling) | Tocco guaritore: Ristorare inferiore | 40 | Azione · 1/riposo lungo | 3 |
| Marchio del drago | Marchio dell'ospitalità (halfling) | Fortunato | 40 | Passiva | 1 |
| Marchio del drago | Marchio dell'ospitalità (halfling) | Coraggioso | 40 | Passiva | 1 |
| Marchio del drago | Marchio dell'ospitalità (halfling) | Agilità halfling | 40 | Passiva | 1 |
| Marchio del drago | Marchio dell'ospitalità (halfling) | Sempre ospitale | 40 | Passiva | 1 |
| Marchio del drago | Marchio dell'ospitalità (halfling) | Magia del locandiere | 40 | Passiva | 1 |
| Marchio del drago | Marchio dell'ospitalità (halfling) | Magia del locandiere: Purificare cibo e bevande | 40 | Azione · 1/riposo lungo | 1 |
| Marchio del drago | Marchio dell'ospitalità (halfling) | Magia del locandiere: Servitore inosservato | 40 | Azione · 1/riposo lungo | 1 |
| Marchio del drago | Marchio della creazione (umano) | Intuizione dell'artigiano | 40 | Passiva | 1 |
| Marchio del drago | Marchio della creazione (umano) | Forgiatore di incantesimi | 40 | Passiva | 1 |
| Marchio del drago | Marchio della creazione (umano) | Forgiatore di incantesimi: Arma magica | 40 | Azione bonus · 1/riposo lungo | 1 |
| Marchio del drago | Marchio del passaggio (umano) | Velocità del corriere | 40 | Passiva | 1 |
| Marchio del drago | Marchio del passaggio (umano) | Movimento intuitivo | 40 | Passiva | 1 |
| Marchio del drago | Marchio del passaggio (umano) | Passaggio magico: Passo velato | 40 | Azione bonus · 1/riposo lungo | 1 |
| Marchio del drago | Marchio della scrittura (gnomo) | Astuzia gnomesca | 40 | Passiva | 1 |
| Marchio del drago | Marchio della scrittura (gnomo) | Scrittore dotato | 40 | Passiva | 1 |
| Marchio del drago | Marchio della scrittura (gnomo) | Intuizione dello scriba | 40 | Passiva | 1 |
| Marchio del drago | Marchio della scrittura (gnomo) | Intuizione dello scriba: Comprensione dei linguaggi | 40 | Azione · 1/riposo lungo | 1 |
| Marchio del drago | Marchio della scrittura (gnomo) | Intuizione dello scriba: Bocca magica | 40 | Azione · 1/riposo lungo | 3 |
| Marchio del drago | Marchio della sentinella (umano) | Intuizione della sentinella | 40 | Passiva | 1 |
| Marchio del drago | Marchio della sentinella (umano) | Scudo del guardiano: Scudo | 40 | Reazione · 1/riposo lungo | 1 |
| Marchio del drago | Marchio della sentinella (umano) | Guardiano vigile | 40 | Reazione · 1/riposo lungo | 1 |
| Marchio del drago | Marchio dell'ombra (elfo) | Ascendenza fatata | 40 | Passiva | 1 |
| Marchio del drago | Marchio dell'ombra (elfo) | Intuizione astuta | 40 | Passiva | 1 |
| Marchio del drago | Marchio dell'ombra (elfo) | Plasmare le ombre | 40 | Passiva | 1 |
| Marchio del drago | Marchio dell'ombra (elfo) | Plasmare le ombre: Invisibilità | 40 | Azione · 1/riposo lungo | 3 |
| Marchio del drago | Marchio della tempesta (mezzelfo) | Ascendenza fatata | 40 | Passiva | 1 |
| Marchio del drago | Marchio della tempesta (mezzelfo) | Intuizione del maestro dei venti | 40 | Passiva | 1 |
| Marchio del drago | Marchio della tempesta (mezzelfo) | Dono della tempesta | 40 | Passiva | 1 |
| Marchio del drago | Marchio della tempesta (mezzelfo) | Venti contrari | 40 | Passiva | 1 |
| Marchio del drago | Marchio della tempesta (mezzelfo) | Venti contrari: Folata di vento | 40 | Azione · 1/riposo lungo | 3 |
| Marchio del drago | Marchio della protezione (nano) | Resilienza nanica | 40 | Passiva | 1 |
| Marchio del drago | Marchio della protezione (nano) | Intuizione del custode | 40 | Passiva | 1 |
| Marchio del drago | Marchio della protezione (nano) | Protezioni e sigilli | 40 | Passiva | 1 |
| Marchio del drago | Marchio della protezione (nano) | Protezioni e sigilli: Allarme | 40 | Azione · 1/riposo lungo | 1 |
| Marchio del drago | Marchio della protezione (nano) | Protezioni e sigilli: Armatura magica | 40 | Azione · 1/riposo lungo | 1 |
| Marchio del drago | Marchio della protezione (nano) | Protezioni e sigilli: Serratura arcana | 40 | Azione · 1/riposo lungo | 3 |

## Tranche 5 — Ravnica, Theros

Titoli indicati in inglese, come per Elemental Evil ed Eberron: da correggere se
c'è un'edizione italiana. Loxodon, ibrido Simic, vedalken e leonin non hanno
ristampa in Mostri del Multiverso; centauro, minotauro e satiro sì.

Il goblin di Ravnica è quello di Volo; centauro e minotauro di Theros sono
quelli di Ravnica, il tritone di Theros quello di Volo. Non sono doppioni:
l'import li trova anche con `source: "Ravnica"` o `"Theros"`.

L'**ibrido Simic** sceglie un potenziamento animale al 1° livello (planata della
manta, scalatore agile, adattamento subacqueo) e un altro al 5° (uno dei due
restanti, appendici prensili, carapace o sputo acido). La seconda tendina offre
le 15 combinazioni; il secondo potenziamento compare dal 5° livello. Lo sputo
acido ha usi pari al modificatore di Costituzione (minimo 1), letto dai
modificatori del profilo.

Centauro e satiro sono di tipo folletto: è un promemoria, il plugin non usa il
tipo di creatura dei PG.

Restano fuori le competenze (Sopravvissuto, Istinti del cacciatore, Festaiolo,
Presenza imponente) e la Costituzione possente.

Da controllare con più attenzione:

- **tutte le pagine di Ravnica e Theros**, e quelle di centauro, minotauro e
  satiro in Mostri del Multiverso;
- la spinta di Corna martellanti: 1,5 m in Ravnica, 3 m in Mostri del
  Multiverso;
- i nomi italiani dei tratti, e "folletto" come tipo di creatura.

### Guildmasters' Guide to Ravnica

| Specie | Opzione | Tratto | Pag. | Uso | Liv. |
|---|---|---|---|---|---|
| Centauro | — | Fatato | 15 | Passiva | 1 |
| Centauro | — | Carica | 15 | Passiva | 1 |
| Centauro | — | Zoccoli | 15 | Passiva | 1 |
| Centauro | — | Struttura equina | 15 | Passiva | 1 |
| Loxodon | — | Serenità loxodon | 18 | Passiva | 1 |
| Loxodon | — | Armatura naturale | 18 | Passiva | 1 |
| Loxodon | — | Proboscide | 18 | Passiva | 1 |
| Loxodon | — | Olfatto acuto | 18 | Passiva | 1 |
| Minotauro | — | Corna | 19 | Passiva | 1 |
| Minotauro | — | Carica incornante | 19 | Passiva | 1 |
| Minotauro | — | Corna martellanti | 19 | Passiva | 1 |
| Ibrido Simic | 5 combinazioni | Planata della manta | 20 | Passiva | 1 |
| Ibrido Simic | 2 combinazioni | Planata della manta | 20 | Passiva | 5 |
| Ibrido Simic | 5 combinazioni | Scalatore agile | 20 | Passiva | 1 |
| Ibrido Simic | 2 combinazioni | Scalatore agile | 20 | Passiva | 5 |
| Ibrido Simic | 5 combinazioni | Adattamento subacqueo | 20 | Passiva | 1 |
| Ibrido Simic | 2 combinazioni | Adattamento subacqueo | 20 | Passiva | 5 |
| Ibrido Simic | 3 combinazioni | Appendici prensili | 20 | Passiva | 5 |
| Ibrido Simic | 3 combinazioni | Carapace | 20 | Passiva | 5 |
| Ibrido Simic | 3 combinazioni | Sputo acido | 20 | Azione · competenza/riposo lungo | 5 |
| Vedalken | — | Distacco vedalken | 21 | Passiva | 1 |
| Vedalken | — | Precisione instancabile | 21 | Passiva | 1 |
| Vedalken | — | Parzialmente anfibio | 21 | Passiva | 1 |

### Mythic Odysseys of Theros

| Specie | Opzione | Tratto | Pag. | Uso | Liv. |
|---|---|---|---|---|---|
| Leonin | — | Artigli | 21 | Passiva | 1 |
| Leonin | — | Ruggito intimidatorio | 21 | Azione bonus · 1/riposo breve | 1 |
| Satiro | — | Fatato | 25 | Passiva | 1 |
| Satiro | — | Ariete | 25 | Passiva | 1 |
| Satiro | — | Resistenza alla magia | 25 | Passiva | 1 |
| Satiro | — | Balzi gioiosi | 25 | Passiva | 1 |

## Tranche 6 — Witchlight, Strixhaven

Titoli indicati in inglese, come per le tranche precedenti: da correggere se
c'è un'edizione italiana.

Witchlight usa già lo stile di Mostri del Multiverso, e fata e harengon vi sono
ristampati con lo stesso testo: c'è una voce sola, sotto Witchlight, che
l'import trova anche con `source: "Mostri del Multiverso"`. L'owlin non ha
ristampa.

- **Fata**: tipo folletto, volo, Magia fatata con Luminescenza dal 3° livello e
  Ingrandire/ridurre dal 5°, ciascuno con il proprio uso.
- **Harengon**: Salto del coniglio con usi pari al bonus di competenza.
  Grilletto della lepre (bonus di competenza all'iniziativa) è un promemoria:
  il plugin non tira l'iniziativa dei PG, va compreso nel valore inserito.
- **Owlin**: volo.

Restano fuori le competenze (Sensi leporini, Piume silenziose) e la
scurovisione.

Da controllare con più attenzione:

- le pagine di Witchlight e Strixhaven;
- che fata e harengon di Mostri del Multiverso abbiano davvero lo stesso testo
  di Witchlight;
- i nomi italiani dei tratti.

### The Wild Beyond the Witchlight

| Specie | Opzione | Tratto | Pag. | Uso | Liv. |
|---|---|---|---|---|---|
| Fata | — | Fatato | 12 | Passiva | 1 |
| Fata | — | Volo | 12 | Passiva | 1 |
| Fata | — | Magia fatata | 12 | Passiva | 1 |
| Fata | — | Magia fatata: Luminescenza | 12 | Azione · 1/riposo lungo | 3 |
| Fata | — | Magia fatata: Ingrandire/ridurre | 12 | Azione · 1/riposo lungo | 5 |
| Harengon | — | Grilletto della lepre | 13 | Passiva | 1 |
| Harengon | — | Passo fortunato | 13 | Passiva | 1 |
| Harengon | — | Salto del coniglio | 13 | Azione bonus · competenza/riposo lungo | 1 |

### Strixhaven: A Curriculum of Chaos

| Specie | Opzione | Tratto | Pag. | Uso | Liv. |
|---|---|---|---|---|---|
| Owlin | — | Volo | 29 | Passiva | 1 |

## Tranche 7 — Tortle e specie minori

Quattro supplementi brevi, con i titoli in inglese: The Tortle Package, One
Grung Above, Acquisitions Incorporated (verdan) e Locathah Rising. Solo il
tortle ha una ristampa in Mostri del Multiverso (artigli 1d6 invece di 1d4).

- **Difesa del guscio** del tortle non ha usi né durata: **Attiva** mette
  un'etichetta che resta finché non la rimuovi, quando il tortle esce dal
  guscio. +4 alla CA e gli altri effetti sono un promemoria sull'etichetta.
- **Grung**: immunità al veleno applicata alle difese; Dipendenza dall'acqua
  (livello di indebolimento) è un promemoria.
- **Verdan**: la taglia (Piccola, Media dal 5° livello) non è un tratto della
  card; va considerata nel profilo.

Restano fuori le competenze (Istinto di sopravvivenza, Attento e atletico,
Vigilanza arboricola, Persuasivo, Intuizione della natura) e le velocità di
nuotare e scalare che non sono tratti a sé.

Da controllare con più attenzione:

- **le pagine dei quattro supplementi sono segnaposto**: non ricordo la
  numerazione di questi PDF, vanno corrette tutte;
- l'elenco delle condizioni di Volontà del leviatano del locathah;
- la pagina del tortle in Mostri del Multiverso.

### The Tortle Package

| Specie | Opzione | Tratto | Pag. | Uso | Liv. |
|---|---|---|---|---|---|
| Tortle | — | Artigli | 4 | Passiva | 1 |
| Tortle | — | Trattenere il respiro | 4 | Passiva | 1 |
| Tortle | — | Armatura naturale | 4 | Passiva | 1 |
| Tortle | — | Difesa del guscio | 4 | Azione · etichetta senza durata | 1 |

### One Grung Above

| Specie | Opzione | Tratto | Pag. | Uso | Liv. |
|---|---|---|---|---|---|
| Grung | — | Anfibio | 2 | Passiva | 1 |
| Grung | — | Immunità al veleno | 2 | Passiva | 1 |
| Grung | — | Pelle velenosa | 2 | Passiva | 1 |
| Grung | — | Salto da fermo | 2 | Passiva | 1 |
| Grung | — | Dipendenza dall'acqua | 2 | Passiva | 1 |

### Acquisitions Incorporated

| Specie | Opzione | Tratto | Pag. | Uso | Liv. |
|---|---|---|---|---|---|
| Verdan | — | Guarigione del sangue nero | 14 | Passiva | 1 |
| Verdan | — | Telepatia limitata | 14 | Passiva | 1 |
| Verdan | — | Intuito telepatico | 14 | Passiva | 1 |

### Locathah Rising

| Specie | Opzione | Tratto | Pag. | Uso | Liv. |
|---|---|---|---|---|---|
| Locathah | — | Armatura naturale | 4 | Passiva | 1 |
| Locathah | — | Volontà del leviatano | 4 | Passiva | 1 |
| Locathah | — | Anfibio limitato | 4 | Passiva | 1 |

## Tranche 8 — Wildemount, Van Richten

Titoli indicati in inglese, come per le tranche precedenti. Nessuna di queste
specie ha una ristampa in Mostri del Multiverso.

- **Elfo pallido** e **halfling lotusden** sono specie a sé, con i tratti di
  gioco dell'elfo e dell'halfling, come le sottorazze del Tomo dei Nemici.
  L'elfo marino di Wildemount è quello del Tomo dei Nemici.
- **Dragonide di Wildemount**: le varianti draconblood e ravenite sostituiscono
  Arma a soffio e Resistenza ai danni, quindi non hanno ascendenza né
  resistenza. Il dragonide del Manuale del Giocatore resta com'era.
- **Dhampir, hexblood e reborn** (lignaggi di Van Richten) sostituiscono la
  specie: Retaggio ancestrale, che conserva competenze e velocità della specie
  d'origine, va riportato nel profilo. L'hexblood è di tipo folletto; il
  reborn ha la resistenza al veleno applicata alle difese.
- **Hollow one** è un dono soprannaturale, non una specie: si sceglie nel
  campo **Dono soprannaturale**, accanto alla specie (vedi sotto).

Restano fuori la scurovisione e le competenze del Retaggio ancestrale.

Da controllare con più attenzione:

- le pagine di Wildemount (elfi 163, halfling 164, dragonidi 168) e di Van
  Richten (lignaggi 10–12, stimate);
- il nome Presenza energica (Forceful Presence) e gli altri nomi italiani;
- la portata del Gettone inquietante dell'hexblood (qui 15 km).

### Explorer's Guide to Wildemount

| Specie | Opzione | Tratto | Pag. | Uso | Liv. |
|---|---|---|---|---|---|
| Elfo pallido | — | Ascendenza fatata | 163 | Passiva | 1 |
| Elfo pallido | — | Senso incisivo | 163 | Passiva | 1 |
| Elfo pallido | — | Benedizione della Tessitrice Lunare | 163 | Passiva | 1 |
| Elfo pallido | — | Benedizione della Tessitrice Lunare: Sonno | 163 | Azione · 1/riposo lungo | 3 |
| Elfo pallido | — | Benedizione della Tessitrice Lunare: Invisibilità | 163 | Azione · 1/riposo lungo | 5 |
| Halfling lotusden | — | Fortunato | 164 | Passiva | 1 |
| Halfling lotusden | — | Coraggioso | 164 | Passiva | 1 |
| Halfling lotusden | — | Agilità halfling | 164 | Passiva | 1 |
| Halfling lotusden | — | Figlio del bosco | 164 | Passiva | 1 |
| Halfling lotusden | — | Figlio del bosco: Intralciare | 164 | Azione · 1/riposo lungo | 3 |
| Halfling lotusden | — | Figlio del bosco: Crescita di spine | 164 | Azione · 1/riposo lungo | 5 |
| Halfling lotusden | — | Passo tra gli alberi | 164 | Passiva | 1 |
| Dragonide di Wildemount | Draconblood | Presenza energica | 168 | Innesco · 1/riposo breve | 1 |
| Dragonide di Wildemount | Ravenite | Assalto vendicativo | 168 | Reazione · 1/riposo breve | 1 |

### Van Richten's Guide to Ravenloft

| Specie | Opzione | Tratto | Pag. | Uso | Liv. |
|---|---|---|---|---|---|
| Dhampir | — | Natura senza morte | 10 | Passiva | 1 |
| Dhampir | — | Scalata del ragno | 10 | Passiva | 1 |
| Dhampir | — | Morso vampirico | 10 | Passiva | 1 |
| Dhampir | — | Morso vampirico: potenziamento | 10 | Innesco · competenza/riposo lungo | 1 |
| Hexblood | — | Fatato | 11 | Passiva | 1 |
| Hexblood | — | Gettone inquietante | 11 | Azione bonus · 1/riposo lungo | 1 |
| Hexblood | — | Magia del sortilegio | 11 | Passiva | 1 |
| Hexblood | — | Magia del sortilegio: Camuffare se stesso | 11 | Azione · 1/riposo lungo | 1 |
| Hexblood | — | Magia del sortilegio: Sortilegio | 11 | Azione bonus · 1/riposo lungo | 1 |
| Reborn | — | Natura senza morte | 12 | Passiva | 1 |
| Reborn | — | Conoscenza da una vita passata | 12 | Innesco · competenza/riposo lungo | 1 |

### Dono soprannaturale: hollow one

Dichiarato in `src/speciesCatalogWildemountRavenloft.js` (`GIFT_CATALOG_WILDEMOUNT`).
È il dono di cui il ricordo è meno sicuro: **va verificato per primo**, in
particolare Aggrapparsi alla vita, Ritorno e la portata e la durata di
Presenza inquietante. Pagina 201 stimata.

| Dono | Tratto | Pag. | Uso | Liv. |
|---|---|---|---|---|
| Hollow one | Senza età | 201 | Passiva | 1 |
| Hollow one | Aggrapparsi alla vita | 201 | Passiva | 1 |
| Hollow one | Ritorno | 201 | Passiva | 1 |
| Hollow one | Presenza inquietante | 201 | Azione bonus · 1/riposo lungo | 1 |

## Mordenkainen presenta: Mostri del Multiverso

Le ristampe delle specie delle tranche precedenti, in ordine alfabetico. Le
voci di fata e harengon sono quelle di Witchlight, con lo stesso testo.

| Specie | Opzione | Tratto | Pag. | Uso | Liv. |
|---|---|---|---|---|---|
| Aarakocra | — | Volo | 6 | Passiva | 1 |
| Aarakocra | — | Artigli | 6 | Passiva | 1 |
| Aarakocra | — | Richiamo del vento: Folata di vento | 6 | Azione · 1/riposo lungo | 3 |
| Aasimar | — | Resistenza celestiale | 7 | Passiva | 1 |
| Aasimar | — | Mani guaritrici | 7 | Azione · 1/riposo lungo | 1 |
| Aasimar | — | Portatore di luce | 7 | Passiva | 1 |
| Aasimar | — | Rivelazione celestiale: Ali celestiali | 7 | Azione bonus · 1/riposo lungo · etichetta 1 min | 3 |
| Aasimar | — | Rivelazione celestiale: Radiosità interiore | 7 | Azione bonus · 1/riposo lungo · etichetta 1 min | 3 |
| Aasimar | — | Rivelazione celestiale: Sudario necrotico | 7 | Azione bonus · 1/riposo lungo · etichetta 1 min | 3 |
| Bugbear | — | Ascendenza fatata | 8 | Passiva | 1 |
| Bugbear | — | Arti lunghi | 8 | Passiva | 1 |
| Bugbear | — | Attacco a sorpresa | 8 | Passiva | 1 |
| Centauro | — | Fatato | 9 | Passiva | 1 |
| Centauro | — | Carica | 9 | Passiva | 1 |
| Centauro | — | Zoccoli | 9 | Passiva | 1 |
| Centauro | — | Struttura equina | 9 | Passiva | 1 |
| Changeling | — | Mutaforma | 10 | Passiva | 1 |
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
| Minotauro | — | Corna | 27 | Passiva | 1 |
| Minotauro | — | Carica incornante | 27 | Passiva | 1 |
| Minotauro | — | Corna martellanti | 27 | Passiva | 1 |
| Minotauro | — | Memoria del labirinto | 27 | Passiva | 1 |
| Orco | — | Scarica di adrenalina | 28 | Azione bonus · competenza/riposo breve | 1 |
| Orco | — | Tenacia implacabile | 28 | Innesco · 1/riposo lungo | 1 |
| Satiro | — | Fatato | 29 | Passiva | 1 |
| Satiro | — | Ariete | 29 | Passiva | 1 |
| Satiro | — | Resistenza alla magia | 29 | Passiva | 1 |
| Satiro | — | Balzi gioiosi | 29 | Passiva | 1 |
| Shadar-kai | — | Ascendenza fatata | 31 | Passiva | 1 |
| Shadar-kai | — | Resistenza necrotica | 31 | Passiva | 1 |
| Shadar-kai | — | Benedizione della Regina Corvo | 31 | Azione bonus · competenza/riposo lungo | 1 |
| Shifter | Shifter pelle bestiale | Mutazione: Pelle bestiale | 32 | Azione bonus · competenza/riposo lungo · etichetta 1 min | 1 |
| Shifter | Shifter zanna lunga | Mutazione: Zanna lunga | 32 | Azione bonus · competenza/riposo lungo · etichetta 1 min | 1 |
| Shifter | Shifter passo rapido | Mutazione: Passo rapido | 32 | Azione bonus · competenza/riposo lungo · etichetta 1 min | 1 |
| Shifter | Shifter caccia selvaggia | Mutazione: Caccia selvaggia | 32 | Azione bonus · competenza/riposo lungo · etichetta 1 min | 1 |
| Tabaxi | — | Artigli felini | 33 | Passiva | 1 |
| Tabaxi | — | Agilità felina | 33 | Passiva | 1 |
| Tortle | — | Artigli | 34 | Passiva | 1 |
| Tortle | — | Trattenere il respiro | 34 | Passiva | 1 |
| Tortle | — | Armatura naturale | 34 | Passiva | 1 |
| Tortle | — | Difesa del guscio | 34 | Azione · etichetta senza durata | 1 |
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

## Tranche 9 — Spelljammer, Dragonlance

Usciti dopo Mostri del Multiverso e già nel suo stile (usi pari al bonus di
competenza, caratteristica da incantatore a scelta): nessuna ristampa. Nella
tendina stanno dopo Mostri del Multiverso. Titoli in inglese, come per le
tranche precedenti.

- **Autognomo, plasmoide e thri-kreen** non sono umanoidi (costrutto, melma,
  mostruosità): è un promemoria, come per centauro e satiro.
- **Resistenze applicate alle difese**: veleno per l'autognomo, acido e veleno
  per il plasmoide.
- **Kender**: Impavido dà vantaggio contro la condizione spaventato; una volta
  per riposo lungo un tiro salvezza fallito diventa un successo (contatore a
  parte). Provocazione ha usi pari al bonus di competenza.

Restano fuori scurovisione, competenze (Sensi acuti, Progettazione
specializzata, Attitudine kender) e la Trance astrale dell'elfo astrale.

Da controllare con più attenzione:

- le pagine di Spelljammer (10–15) e del kender (20), stimate;
- i nomi italiani dei tratti e delle specie (elfo astrale, autognomo,
  plasmoide).

### Spelljammer: Astral Adventurer's Guide

| Specie | Opzione | Tratto | Pag. | Uso | Liv. |
|---|---|---|---|---|---|
| Elfo astrale | — | Ascendenza fatata | 10 | Passiva | 1 |
| Elfo astrale | — | Fuoco astrale | 10 | Passiva | 1 |
| Elfo astrale | — | Passo di luce stellare | 10 | Azione bonus · competenza/riposo lungo | 1 |
| Autognomo | — | Tipo di creatura | 11 | Passiva | 1 |
| Autognomo | — | Involucro corazzato | 11 | Passiva | 1 |
| Autognomo | — | Costruito per il successo | 11 | Innesco · competenza/riposo lungo | 1 |
| Autognomo | — | Macchina curativa | 11 | Passiva | 1 |
| Autognomo | — | Natura meccanica | 11 | Passiva | 1 |
| Autognomo | — | Riposo della sentinella | 11 | Passiva | 1 |
| Giff | — | Scintilla astrale | 12 | Innesco · competenza/riposo lungo | 1 |
| Giff | — | Padronanza delle armi da fuoco | 12 | Passiva | 1 |
| Giff | — | Corporatura da ippopotamo | 12 | Passiva | 1 |
| Hadozee | — | Piedi abili | 13 | Passiva | 1 |
| Hadozee | — | Planata | 13 | Passiva | 1 |
| Hadozee | — | Schivata hadozee | 13 | Reazione · competenza/riposo lungo | 1 |
| Plasmoide | — | Tipo di creatura | 14 | Passiva | 1 |
| Plasmoide | — | Amorfo | 14 | Passiva | 1 |
| Plasmoide | — | Trattenere il respiro | 14 | Passiva | 1 |
| Plasmoide | — | Resilienza naturale | 14 | Passiva | 1 |
| Plasmoide | — | Plasmare sé stesso | 14 | Passiva | 1 |
| Thri-kreen | — | Tipo di creatura | 15 | Passiva | 1 |
| Thri-kreen | — | Carapace | 15 | Passiva | 1 |
| Thri-kreen | — | Carapace camaleontico | 15 | Passiva | 1 |
| Thri-kreen | — | Braccia secondarie | 15 | Passiva | 1 |
| Thri-kreen | — | Insonne | 15 | Passiva | 1 |
| Thri-kreen | — | Telepatia thri-kreen | 15 | Passiva | 1 |

### Dragonlance: Shadow of the Dragon Queen

| Specie | Opzione | Tratto | Pag. | Uso | Liv. |
|---|---|---|---|---|---|
| Kender | — | Impavido | 20 | Passiva | 1 |
| Kender | — | Impavido: successo | 20 | Innesco · 1/riposo lungo | 1 |
| Kender | — | Provocazione | 20 | Azione bonus · competenza/riposo lungo | 1 |

## Tranche successive

Ancora da scrivere: il lignaggio personalizzato e la personalizzazione
dell'origine del Calderone di Tasha; eventuali altri doni soprannaturali
(Theros) e doni oscuri (Van Richten) nel campo del dono. Una specie fuori
catalogo, importata da una scheda, viene segnalata e non applicata.
