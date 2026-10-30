# Third-Party Notices

## D&D 5e SRD 5.1

Spell metadata in `src/spells-srd-5.1.json`, the Italian encyclopedia data
in `src/spell-reference-it.json` and the Italian rules compendium in
`src/rules-reference-it.json` (generated from the official Italian PDF by
`scripts/generate-srd-rules-reference.mjs`) derive from the D&D 5e System
Reference Document 5.1 by Wizards of the Coast LLC and are used under the
Creative Commons Attribution 4.0 International license.

- Official Italian source: https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1_IT.pdf
- License: https://creativecommons.org/licenses/by/4.0/
- Structured upstream: https://github.com/5e-bits/5e-database
- API used by the reproducible import script: https://www.dnd5eapi.co/api/2014/spells

Attribution: Dungeons & Dragons SRD 5.1 © Wizards of the Coast LLC, licensed
under CC BY 4.0. Wizards of the Coast does not endorse this project.

## Embers-matched WebM visuals

The matched spell visuals reuse WebM assets published by JB2A and consumed by
the Embers extension. The plugin references the public JB2A free asset bucket
directly and does not require Embers to be installed. The runtime contains a
small, source-aware effect mapping; it does not bundle the Embers extension or
its catalog.

- Asset source: https://jb2a-free.s3.eu-west-3.amazonaws.com/
- Asset library: https://library.jb2a.org/
- License: Creative Commons Attribution-NonCommercial-ShareAlike 4.0
  International: https://creativecommons.org/licenses/by-nc-sa/4.0/
- Embers integration reference: https://github.com/ArmindoFlores/embers

## Italian spell-name terminology

Italian display names in src/spells-it-2014.json use the community D&D 5e
Italian-English glossary by karsus and Rubens Pischedda as a terminology
reference. Only short spell-name pairs are retained; descriptions and other
glossary content are not included.

- Glossary: https://gist.github.com/rubenspischedda/23c0db6a3b22160c392ae8b0269a0b55
- Original glossary page: https://www.dragonslair.it/files/file/349-glossario-termini-dd-5e-italiano-inglese/

## three.js

3D rendering of the Online dice tray.

- Package: `three` 0.186.1, https://github.com/mrdoob/three.js
- License: MIT. Copyright © 2010-2026 three.js authors.

## cannon-es

Physics of the Online dice tray.

- Package: `cannon-es` 0.20.0, https://github.com/pmndrs/cannon-es
- License: MIT. Copyright (c) 2015 cannon.js Authors, Copyright (c) 2020 pmndrs.

## Owlbear Rodeo Dice

The 3D dice of the Online dice tray (meshes, colliders, number locators, the eight dice styles, the tray and the
light map in `public/dice/`, and the data read from them in `src/diceAssets.json`) come from Owlbear Rodeo Dice,
imported with `scripts/import-owlbear-dice-assets.mjs`. The throw ranges follow its `DiceThrower`.

- Source: https://github.com/owlbear-rodeo/dice (commit ccc32beceee0888c0a48129fbb23f4a636c710ee)
- License: GNU General Public License v3. Copyright (C) 2023 Owlbear Rodeo.
