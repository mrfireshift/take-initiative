# FASE 11R — Parità catalogo e ricostruzione shell Spells

## Perimetro

Questa nota documenta la riconciliazione delle due fonti UI precedentemente
esposte. Non amplia il catalogo generale, non rimuove il legacy e non modifica
executor, metadata, turni, regole area o child-zone.

## Diagnosi

Prima della patch il provider della shell unificata,
`src/spellUnifiedPanelSceneProvider.js:buildSpellCatalogEntries`, proiettava
soltanto `getTrackableSpellOptions()`.

Le fonti precedentemente visibili erano:

| Fonte | Record | Identità |
| --- | ---: | --- |
| Vecchio pannello Spells | 358 | ID canonico |
| Vecchia Console effetti ad area | 142 | ID canonico |
| Intersezione | 109 | duplicati equivalenti |
| Unione prevista | 391 | deduplicata per ID |
| Catalogo generale SRD | 477 | fuori perimetro UI |
| Record generali non esposti | 86 | esclusi intenzionalmente |

La shell corrente aveva 358 record: mancavano esattamente i 33 record
area-only. Non era una perdita causata da lane, responsive o routing; era un
filtro applicato prima della costruzione del contratto.

## Correzione

`src/spellUnifiedPanelCatalogCore.js` compone le API esistenti senza copiare
liste di incantesimi:

- `getTrackableSpellOptions()` per la fonte Spells;
- `getAreaSaveSpellOptions()` per la fonte Console area;
- `getSpellDefinition()` per l'ID canonico e l'etichetta;
- `buildSpellUnifiedPanelContract()` per lane, targeting, placement,
  executor e capacità.

`buildSpellUnifiedCatalogEntries()` mantiene l'ordine della fonte Spells e
accoda solo gli ID area-only, conservando `sources` per l'audit. Un record
presente in entrambe le fonti resta una sola voce.

`buildSpellUnifiedCatalogAudit()` produce la matrice completa, incluse le
voci escluse dal catalogo generale. Le colonne sono:

| Campo | Significato |
| --- | --- |
| `spellId`, `name` | identità stabile e nome |
| `sources` | provenienza precedente |
| `presentPreviously`, `presentCurrent` | parità prima/dopo |
| `lane`, `targetingMode`, `executor` | instradamento dichiarato |
| `status` | `operativo`, `manuale`, `mancante`, `escluso intenzionalmente` |
| `duplicate` | presenza in entrambe le fonti, già deduplicata |
| `exclusionReason`, `correction` | motivazione e rimedio |

## Record recuperati

Gli ID presenti solo nella Console area e ora esposti dalla shell unificata
sono:

```text
burning-hands, chain-lightning, circle-of-death, cone-of-cold, divine-word,
fire-storm, fireball, flame-strike, freezing-sphere, ice-storm,
lightning-bolt, mass-cure-wounds, meteor-swarm, prismatic-spray, shatter,
sunburst, thunderwave, xanathar-coltello-di-ghiaccio,
xanathar-eruzione-terrestre, xanathar-onda-di-marea,
xanathar-orrido-avvizzimento-di-abi-dalzim, xanathar-parola-radiosa,
xanathar-passo-del-tuono, xanathar-rombo-di-tuono,
xanathar-sciame-di-palle-di-neve-di-snilloc, xanathar-scossa-tellurica,
xanathar-sfera-al-vetriolo, xanathar-vampa-di-aganazzar,
tasha-turbine-di-spade, phb2014-braccia-di-hadar,
phb2014-evoca-raffica, phb2014-evoca-pioggia-di-armi,
phb2014-onda-distruttiva
```

Tutti i 391 record hanno un contratto costruibile, un ID unico e un executor
dichiarato. Le lane risultanti sono `spell-lifecycle` (255) e
`area-transaction` (136). Nove record sono classificati `manuale` perché la
capacità manuale è dichiarata dal contratto; non sono nascosti.

## Esclusioni intenzionali

Restano fuori perché presenti nel catalogo generale ma non esposti da nessuno
dei due pannelli precedenti:

```text
acid-splash, animate-dead, augury, awaken, blight, clone,
commune-with-nature, counterspell, create-food-and-water,
create-or-destroy-water, create-undead, cure-wounds, dimension-door,
disintegrate, dispel-magic, divination, druidcraft, eldritch-blast,
fabricate, feeblemind, find-familiar, find-steed, find-traps, finger-of-death,
fire-bolt, goodberry, greater-restoration, harm, heal, healing-word,
hellish-rebuke, heroes-feast, identify, inflict-wounds, knock, legend-lore,
lesser-restoration, locate-animals-or-plants, magic-missile, mass-heal,
mass-healing-word, mending, misty-step, planar-ally, plane-shift,
plant-growth, poison-spray, power-word-kill, prayer-of-healing,
purify-food-and-drink, raise-dead, reincarnate, remove-curse, resurrection,
revivify, sacred-flame, scorching-ray, secret-chest, shocking-grasp,
spare-the-dying, stone-shape, teleport, time-stop, true-resurrection,
vicious-mockery, wish, word-of-recall, xanathar-catapulta,
xanathar-colpo-del-vento-dacciaio, xanathar-creare-omuncolo,
xanathar-dardo-di-caos, xanathar-disperdere, xanathar-ferocia-primordiale,
xanathar-flusso-di-energia-negativa, xanathar-folata, xanathar-infestazione,
xanathar-ossa-della-terra, xanathar-rintocco-dei-morti,
xanathar-trasferimento-di-vita, xanathar-trova-cavalcatura-superiore,
tasha-lama-verdefiamma, tasha-lenza-elettrizzante,
phb2014-frusta-di-spine, phb2014-globo-cromatico,
phb2014-sussurri-dissonanti, phb2014-parola-del-potere-guarire
```

Un futuro ampliamento dovrà aggiungere una fonte UI autorizzata o una fase
dedicata; non deve derivare da `getSpellCatalog()` automaticamente.

## Shell UI ricostruita

La shell resta `spell-unified-panel.html` e ora segue il flusso leggibile della
vecchia Console area:

```text
intestazione
  → catalogo ricercabile e filtri
  → contesto di lancio
  → fase / variante / automazione
  → placement e TargetMatrix
  → esiti TS, valori HP e preview
  → feedback, riepilogo, Annulla / Undo / primary
  → incantesimi attivi, trigger e active actions
```

Il catalogo è chiuso all'apertura, come il combobox legacy, e si espande solo
su ricerca, tastiera, filtro o toggle. Il responsive modifica soltanto
dimensione e disposizione; lane ed executor restano nel contratto.

Quando non è selezionata una nuova spell, la shell non forza il primo record:
mostra il catalogo, mantiene consultabile l'overview degli attivi e presenta
la primary disabilitata `Seleziona un incantesimo`. La Console manuale mantiene
il proprio pannello senza catalogo spell.

La `TargetMatrix` conserva selezione discreta, filtri, target primario,
contesto, esiti `passed`/`failed`/`immune` e scroll per liste numerose. La
sezione placement resta visibile soltanto se il contratto dichiara una policy
diversa da `unavailable`.

## File e funzioni

- `src/spellUnifiedPanelCatalogCore.js`: composizione, statistiche e matrice.
- `src/spellUnifiedPanelSceneProvider.js:buildSpellCatalogEntries`: provider
  del catalogo unificato; `spellCatalogSource()` resta il catalogo generale.
- `src/spellUnifiedPanelCore.js:primaryActionFor` e `summaryFor`: stato senza
  selezione.
- `src/spellUnifiedPanelViewCore.js:buildUnifiedPanelViewModel` e
  `renderHero`: copy della shell senza fallback a effetto manuale.
- `src/spellUnifiedPanelContextView.js:renderWorkflowContextBar`: nessuna
  sezione di contesto vuota prima della selezione.
- `src/spell-unified-panel.js:initialState` e `bootSpellUnifiedPanel`: nessuna
  preselezione implicita del primo incantesimo.
- `public/spell-unified-panel.css`: densità, scroll catalogo/bersagli e layout
  stretto.
- `test/spellUnifiedPanelCatalogCore.test.js`: parità, contratti, esclusioni e
  matrice audit.

`initiativeList.js` non è stato modificato in questa fase: il routing già
consolidato della Fase 11 viene mantenuto e non richiede un nuovo branch.

## Fase 12 residua

Restano fuori da questa fase il cleanup della shell legacy, l'eventuale
riduzione finale dei controller, l'eventuale consolidamento dei CSS condivisi
e la rimozione delle compatibilità transitorie. Prima di farlo servono
verifica visuale completa in ambiente OBR e una decisione esplicita sul
percorso di ritiro del legacy.
