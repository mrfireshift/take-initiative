# Libreria JB2A completa: analisi per gli incantesimi

Analisi della libreria JB2A completa (Patreon, v0.9.4), fatta per trovare animazioni per gli incantesimi che non ne hanno
ancora una. I file non sono nel repository: si sfogliano in locale con `test-support/embers-gallery/library.html`
(vedi [EMBERS.md](EMBERS.md)).

## Numeri

- **11.855 video WebM** (10 GB), contro i circa 2.100 della libreria gratuita, e 6.941 miniature statiche.
- **210 concetti** nel catalogo ufficiale (`scripts/jb2a_sequencer.js`) e circa **2.700 forme distinte**, cioè file
  senza colore, dimensione e distanza.
- Le cartelle degli incantesimi specifici sono le stesse **49** della gratuita. La differenza sta nei colori (fino a 25 per
  concetto) e nella parte generica, da 5 a 15 volte più ampia.
- **Licenza** dichiarata dal manifest: CC BY-NC-SA 4.0, la stessa della gratuita (attribuzione, niente uso commerciale,
  condividi allo stesso modo).

## Dati utili per il motore, oltre ai video

Il catalogo ufficiale contiene due informazioni che finora abbiamo misurato a mano:

- **`_templates`**: per i clip direzionali (`ranged`, `cone`, `line`, `melee`, `ray`, `side_impact`…) la dimensione della
  griglia e i margini di partenza e arrivo, in pixel del clip. Sono gli ancoraggi che serviranno per i clip non centrati,
  come il graffio di Ferocia Primordiale.
- **`_markers`**: per i clip «complete» l'intervallo del loop (`loop: { start, end }` in ms), cioè dove finiscono l'ingresso e
  dove comincia l'uscita.

## Già nella libreria gratuita e mai collegati

- **Onda tonante** (`thunderwave`): clip dedicato `1st_Level/Thunderwave` (centrato, dal basso a sinistra, dal basso al
  centro: le tre posizioni del cubo rispetto all'incantatore).
- **Dardo Stregato** (`phb2014-dardo-stregato`): clip dedicato `1st_Level/Witch_Bolt`, il raggio che resta agganciato.

## Corrispondenze dirette o quasi (libreria completa)

| Incantesimi | Materiale |
|---|---|
| Soffio del Drago | `breath_weapons` coni e linee per acido, freddo, fuoco, fulmine e veleno |
| Vampa di Aganazzar, Miscela Caustica di Tasha | `breath_weapons` linea di fuoco e di acido |
| Bagliore solare | `breath_weapons02` linea «holy» |
| Spruzzo colorato, Spruzzo prismatico | `breath_weapons` multicolore, coni a colori di `template_cone_5e` |
| Palla di fuoco ritardata | `fireball` loop senza detriti (la perla che attende) ed esplosione |
| Frecce Infuocate, Freccia Folgorante | `arrow` di fuoco e di fulmine |
| Cordone di Frecce, Evoca Raffica, Evoca Pioggia di Armi | `volley_of_projectiles` a cerchio, cono e linea |
| Dardo di Caos, Globo Cromatico | `ranged_helix` e `ranged_missile` in 9 colori (un colore per tipo di danno) |
| Nube maleodorante | `fumes` «toxic» |
| Nube incendiaria | `fumes` «fire» e `smoke` |
| Sfera della Tempesta | `lightning_orb` |
| Sfera Acquea, Sfera elastica | `bubble`, `wall_of_force` a sfera |
| Globo di invulnerabilità | `wall_of_force` a sfera, `shield` |
| Scudo di fuoco | `shield_themed` fuoco (sopra e sotto il token) |
| Armatura di Agathys | `shield_themed` ghiaccio |
| Pelle di pietra | `shield_themed` terra fusa |
| Muro di ghiaccio | `ice_spikes` a muro |
| Muro d'Acqua, Onda di Marea, Tsunami | `water_splash` a cerchio e a cono |
| Crescita di spine, Crescita vegetale, Muro di spine | `plant_growth`, `vine` |
| Colpo Intrappolante, Rampicante Afferrante | `vine` (anche «void» ed elementale), `entangle` a colori |
| Eruzione Terrestre, Terremoto, Scossa Tellurica | `ground_cracks`, `eruption`, `impact` terra |
| Minuscole Meteore di Melf, Sciame di meteore | `celestial_bodies` (asteroidi), con l'esplosione di `fireball` |
| Corona di Stelle | `celestial_bodies`, `twinkling_stars` |
| Diavoletto di Polvere, Controllare Venti | `whirlwind`, `wind_lines` |
| Maelstrom | `portals` a vortice |
| Intermittenza, Passo Remoto, Porta arcana | `teleport`, `portals` (anello, vortice) |
| Oscurità della Follia, Fame di Hadar | `darkness` con `eyes` |
| Piaga degli insetti | `fairies`, `bats` |
| Passare senza tracce | `footprints` |
| Sciame di Palle di Neve di Snilloc | `snowball_toss` con `impact` di ghiaccio |
| Sfera al Vetriolo | `throwable` fiala con `liquid` verde |
| Barriera di lame | `cloud_of_daggers`, `spiritual_weapon` |

## Famiglie trasversali

- **Buff**: `on_token_buff` (135 varianti in 9 colori), `token_border` (bordi fissi o rotanti), `bless` a colori.
- **Lancio sull'incantatore**: `on_token_cast` (lancio in tre fasi, 9 colori) e `cast_generic` (terra, fuoco, ghiaccio, suono,
  acqua): un'apertura comune per tutti gli incantesimi.
- **Bersaglio designato**: `on_token_target`.
- **Condizioni**: `icon` e `markers` (paura, cuore, orrore, nota musicale, muto, veleno, rune, scudo, teschio, fiocco,
  stordito), `condition` (benedizione e maledizione in più colori), `dizzy_stars` in 9 colori.
- **Proiettili a tema**: `spell_projectile` (terra, cuore, scheggia di ghiaccio, nota musicale, veleno, teschio, suono) e i
  rispettivi impatti `impact_themed` e `side_impact`. Per esempio Sussurri Dissonanti (nota), Raggio di Infermità (teschio),
  Freccia acida (veleno).
- **Cure**: `healing_generic` (21 varianti), `cure_wounds` a colori.
- **Scuole di magia**: `magic_signs`, cioè cerchi e rune delle 8 scuole in 8 colori (741 file), per zone, sigilli e incantesimi
  di utilità.
- **Aure**: `template_circle` (1.101 file: aure, impulsi, radar, fumo), `aura_themed` (gelo, metallo, natura, legno),
  `spirit_guardians` a colori.

## Varianti dei clip già in uso

Il plugin usa già Dardo di fuoco, Raggio di gelo, Rintocco dei Morti, Punizione Divina, Turbine e altri. La libreria
completa ne ha le varianti a colori, per esempio Dardo di fuoco verde per Lama Verdefiamma e Rintocco dei Morti con
campana e teschio. Quando avremo deciso dove ospitarli, conviene riguardarli.
