# Attacchi PG — C4: trucchetti con arma ed effetti come pill

Stato: **implementata, non committata**. Quarta tranche di [PIANO_ATTACCHI_PG_TRUCCHETTI.md](PIANO_ATTACCHI_PG_TRUCCHETTI.md). Su richiesta del GM, gli effetti dei trucchetti usano il motore di pill e reminder esistente invece delle note manuali: questo anticipa gran parte di C5.

## Effetti dei trucchetti come pill

Quando un trucchetto infligge il suo danno (colpo, critico, TS fallito), il comando dell'attacco accoda le operazioni prodotte dalla **stessa pipeline del pannello incantesimi** (`catalogSpellApplicationOperations`, con gli effetti del catalogo):

- **pill grande = l'incantesimo** sul bersaglio (es. "Raggio di gelo"), nel colore del suo tema (`spellColorFor`: freddo, necrotico, fulmine, psichico, tuono…);
- **mini pill = l'effetto in corso** (es. "Vel −3 m"), collegata all'incantesimo (`parentEffectId`) e quindi dello stesso colore; sulla mappa sta sotto la pill dell'incantesimo, nella card compatta nel popover degli effetti;
- l'istanza dell'incantesimo c'è sempre, anche per i trucchetti a tiro per colpire (Tocco gelido, Raggio di gelo), che prima lasciavano una pill di effetto isolata nel colore generico dei debuff;
- scadenza del catalogo; operazioni filtrate a `spell:upsert`, `condition:add`, `condition:automate`;
- nulla se il trucchetto non ha effetti, così un Dardo di fuoco non lascia nulla.

Danno, istanza e pill sono **un solo comando, un solo Undo**. Scadenze e reminder seguono il motore esistente.

| Trucchetto (pill grande) | Effetto (mini pill) | Scadenza |
| --- | --- | --- |
| Tocco gelido | Niente recupero PF | inizio del prossimo turno dell'incantatore |
| Raggio di gelo | **Velocità −3 m** (nuova, `mechanics.movement.addMeters: -3`, conta nel controllo velocità) | inizio del prossimo turno dell'incantatore |
| Stretta folgorante | **Niente reazioni** (nuova) | inizio del prossimo turno del bersaglio |
| Beffa crudele | **Prossimo attacco: svant.** (nuova, rimozione manuale) | fine del prossimo turno del bersaglio |
| Morsa del Gelo | Prossimo attacco con arma: svant. | fine del prossimo turno del bersaglio |
| Scheggia della Mente | −1d4 prossimo TS | fine del prossimo turno dell'incantatore |
| Lama Roboante | Movimento: danni tuono (con i dadi del livello nel dettaglio) | inizio del prossimo turno dell'incantatore |

Le tre pill nuove stanno in `SPELL_EFFECTS` / `SPELL_EXPIRY` di [spells-srd.js](../src/spells-srd.js), quindi valgono anche lanciando gli stessi incantesimi dal pannello incantesimi.

Restano **note per il GM** solo gli effetti che sono spostamenti sulla mappa o altro senza pill: movimento casuale di Infestazione, trascinamento di Lenza Elettrizzante e Frusta di Spine, oggetti in fiamme del Dardo di fuoco, svantaggio dei non morti con Tocco gelido. Le **regole da sapere prima del tiro** (niente copertura per Fiamma sacra, vantaggio di Stretta folgorante contro armature di metallo, secondo bersaglio di Fiotto acido) sono note e non finiscono nella History.

## Due correzioni nel sistema incantesimi

Le ha fatte emergere l'integrazione; riguardano anche il pannello incantesimi.

1. **Pill della Freccia acida su altri incantesimi** ([spellAttackResolutionCore.js](../src/spellAttackResolutionCore.js)): il danno da acido ritardato veniva aggiunto a ogni incantesimo d'attacco colpito (Tocco gelido, Raggio di gelo, Dardo guida) e ne sostituiva l'effetto. Ora vale solo per l'incantesimo che lo prevede (`delayedDice`).
2. **Pill doppia** ([spellApplicationPlanCore.js](../src/spellApplicationPlanCore.js)): con un incantesimo d'attacco il cui effetto è anche nel catalogo (Tocco gelido), la pill veniva aggiunta due volte. Ora è deduplicata per id dell'effetto.

Test di regressione in `test/spellAttackResolutionCore.test.js`.

## Trucchetti con arma (Lama Roboante, Lama Verdefiamma)

- **Disponibilità:** si spuntano tra i "Trucchetti conosciuti" dell'azione "Trucchetto" (un'azione senza spunte li offre tutti). Non compaiono nel menu dei trucchetti: compaiono negli attacchi con **arma da mischia**, nella riga "Trucchetto con l'arma" degli extra al colpo.
- **Dadi per livello del personaggio:**

  | Livello | Lama Roboante (colpo · movimento) | Lama Verdefiamma (colpo · seconda creatura) |
  | --- | --- | --- |
  | 1–4 | — · 1d8 | — · mod. |
  | 5–10 | 1d8 · 2d8 | 1d8 · 1d8 + mod. |
  | 11–16 | 2d8 · 3d8 | 2d8 · 2d8 + mod. |
  | 17+ | 3d8 · 4d8 | 3d8 · 3d8 + mod. |

- **Lama Roboante:** componente da tuono al colpo (dal 5° livello) e pill "Movimento: danni tuono" dal catalogo, con i dadi del movimento nel dettaglio.
- **Lama Verdefiamma:** componente da fuoco al colpo e una **seconda creatura**, scelta tra le altre creature tracciate. Il bersaglio non può essere la propria seconda creatura. Ha le sue difese (confermate come per il bersaglio), i suoi PF, il suo assert sul profilo e le proiezioni dopo il danno. Tutto nello stesso comando: un solo Undo ripristina entrambe.
- Restano **attacchi con arma**: Attacco Furtivo, Punizioni, Colpo Divino ecc. si applicano normalmente.
- Combat Log: "Trucchetto con l'arma: Lama Verdefiamma (1d8 · seconda creatura 1d8 + mod.)", con la seconda creatura tra i bersagli.

## Non incluso, da decidere

- **Avviso automatico al movimento per Lama Roboante:** non esiste un motore che reagisca allo spostamento di un singolo token con una pill. Servirebbe estendere il controllo della velocità o il tracciamento dei movimenti, che AGENTS.md indica come fragili. Oggi la pill riporta i dadi e il GM la risolve e la rimuove a mano, come indica il suo dettaglio.
- **Trucchetti ad area** (Parola Radiosa, Rombo di Tuono, Turbine di Spade, Creare Falò).

## Verifica

Test su catalogo, core, integrazione con il coordinatore reale (danno + istanza + pill e Undo, Lama Verdefiamma su due creature) e console. Nell'harness browser: ladro di 5° livello, Lama Verdefiamma su Dars con il fuoco su Sera (60→48, 38→33), poi Lama Roboante su Dars (48→39) con la pill "Movimento: danni tuono · Danni: 2d8 da tuono".
