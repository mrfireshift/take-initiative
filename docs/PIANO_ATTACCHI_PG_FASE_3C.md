# Attacchi PG — fase 3C: aree e attacchi senza tiro per colpire (piano)

Stato: **implementata** (decisioni 1–5 confermate come proposte). Ultima tranche della fase 3 ([PIANO_ATTACCHI_PG_FASE_3.md](PIANO_ATTACCHI_PG_FASE_3.md)).

## Perimetro

| Voce | Cosa fa | Chi subisce |
| --- | --- | --- |
| **Parola Radiosa** (trucchetto) | TS Costituzione, radiosi | creature scelte entro 1,5 m dal caster |
| **Rombo di Tuono** (trucchetto) | TS Costituzione, tuono | ogni creatura entro 1,5 m dal caster, alleati compresi |
| **Turbine di Spade** (trucchetto) | TS Destrezza, forza | ogni creatura entro 1,5 m dal caster, alleati compresi |
| **Creare Falò** (trucchetto) | zona persistente con concentrazione, TS all'ingresso | — |
| **Freccia Esplosiva** (Tiro Arcano) | al colpo: 2d6 forza, 4d6 dal 18°, senza TS | il bersaglio e ogni creatura entro 3 m da lui |
| **Freccia Perforante** (Tiro Arcano) | **niente tiro per colpire**: linea di 9 m; TS Destrezza; danni della freccia + 1d6 perforanti (2d6 dal 18°), metà con TS superato | ogni creatura sulla linea |
| **Freccia Cercatrice** (Tiro Arcano) | **niente tiro per colpire**: TS Destrezza; danni della freccia + 1d6 forza (2d6 dal 18°), metà con TS superato | una creatura |

## Cosa esiste già

- **Il pannello incantesimi** lancia già Parola Radiosa, Rombo di Tuono, Turbine di Spade e Creare Falò con il flusso ad area: sagoma, TS di gruppo, zone persistenti. **Non conosce** però il Trucchetto Potente (metà danni con TS superato), i bonus dei caster (Invocazione Potente, Incantesimi Potenti), né i dadi dei trucchetti per livello del personaggio. Il danno lo registra come incantesimo, non come attacco.
- **La console dei boss** ha il modello multi-bersaglio completo: area disegnata o posizionata, bersagli ricavati dal disegno e ritoccabili a mano, esito del TS per bersaglio, un solo tiro di danno, difese per bersaglio, un solo comando e un Undo.
- **La geometria** (`aoeGeometryCore.js`) calcola le emanazioni attorno a un token e la sovrapposizione con le sagome dei token.

## Proposta

Una **modalità multi-bersaglio** nella console d'attacco PG, sul modello di quella dei boss:

1. **Elenco delle creature colpite**: proposto in automatico dalla geometria e ritoccabile con una spunta per creatura (compresi gli alleati, che Rombo di Tuono e Turbine di Spade colpiscono).
   - Emanazione di 1,5 m attorno al caster (trucchetti).
   - Emanazione di 3 m attorno al bersaglio (Freccia Esplosiva).
   - Per la linea di Freccia Perforante: lo strumento di disegno già usato dai boss (linea di 9 m dal tiratore), oppure la sola spunta a mano.
2. **Un tiro di danno** per tutti; per ogni creatura l'esito del TS (Fallito / Superato, con "tutti falliti" / "tutti superati"):
   - trucchetti: nessun danno con TS superato, metà con il Trucchetto Potente;
   - frecce: metà danni con TS superato;
   - Freccia Esplosiva: nessun TS, tutti subiscono il danno.
3. **Le difese** di ogni creatura, come per il bersaglio di oggi.
4. **Un solo comando** con tutti i PF, la risorsa (uso di Tiro Arcano) e la voce di History. Il Combat Log lo registra come **Attacco**, con i bersagli e i loro esiti.

Freccia Cercatrice è a bersaglio singolo: è un **attacco con TS al posto del tiro per colpire**. La console mostra "TS fallito / TS superato" invece di "Colpito / Mancato"; il danno della freccia più il dado della freccia, metà con TS superato.

**Creare Falò** è una zona persistente con concentrazione e il TS all'ingresso: è lavoro del pannello incantesimi, che lo gestisce già. Nella console dei trucchetti lo indico con un rimando, come per Lama Roboante.

## Rischi

- **Più PF in un comando**: lo stesso percorso della seconda creatura (Lama Verdefiamma, Spazzata), esteso a N creature. Un solo `hp:set` con le guardie `expected` per ciascuna. Le proiezioni dopo il danno girano per ogni creatura ferita, come nella console dei boss.
- **Nessun cambio** alle chiavi dei metadati, al turno attivo, alle barre PF.
- **Disegno della linea**: riusa il canale di piazzamento delle aree già condiviso fra boss e incantesimi. Se il disegno non serve, basta la spunta a mano e il rischio sparisce.

## Decisioni (confermate)

1. **Trucchetti ad area nella console d'attacco** (Parola Radiosa, Rombo di Tuono, Turbine di Spade), con Trucchetto Potente, bonus dei caster, dadi per livello e Combat Log "Attacco". In alternativa, solo un rimando al pannello incantesimi, che li lancia già senza questi extra. *Proposta: nella console d'attacco.*
2. **Creare Falò** resta nel pannello incantesimi, con un rimando dalla console. *Proposta: sì.*
3. **Bersagli delle emanazioni** proposti in automatico dalla geometria e ritoccabili a mano. *Proposta: sì.*
4. **Linea di Freccia Perforante**: disegno con lo strumento dei boss oppure spunta a mano. *Proposta: spunta a mano adesso, disegno in seguito se serve.*
5. **Freccia Cercatrice** come attacco con TS al posto del tiro per colpire. *Proposta: sì.*

## Implementazione

- **Catalogo**: Parola Radiosa, Rombo di Tuono e Turbine di Spade come trucchetti `area` (emanazione di 1,5 m dal caster; Parola Radiosa solo sulle creature scelte). Creare Falò come `panel`: escluso dalla console, con un rimando nella nota del trucchetto.
- **Frecce**: Freccia Cercatrice (`mode: "save"`) e Freccia Perforante (`mode: "area"`) si scelgono nel selettore «Tiro» sopra l'esito, solo con un'arma a distanza. Sostituiscono il tiro per colpire con un TS Destrezza alla CD dell'Arciere Arcano, metà danni se superato, e il dado della freccia in una riga a parte. Consumano un uso di Tiro Arcano e il limite di uno per turno. Freccia Esplosiva è un'attivazione a colpo: la console propone dalla mappa le creature entro 3 m dal bersaglio, che il GM spunta.
- **Attacco ad area** (`pcAttackAreaPreview`, `buildPcAttackAreaMutation`, `executePcAttackArea`): le creature colpite, ognuna con il proprio TS. Con il TS fallito subiscono tutto il danno; con il TS superato metà (freccia o Trucchetto Potente) oppure nulla. Ogni creatura ha le proprie difese. È un comando solo, con una voce di History e un Undo; le proiezioni girano per ogni creatura ferita. Le emanazioni sono proposte dalla geometria (`getPcAttackNearby`, distanza da bordo a bordo); la linea si spunta a mano.
- **Combat Log**: righe «Tiro: … al posto del tiro per colpire», «Area: N creature entro 1,5 m da …» / «sulla linea», «esplosione: …» nell'attivazione; il TS di ogni creatura nella sua riga bersaglio.
- **Test**: `test/pcAttackAreas.test.js` (core), integrazione con Undo in `pcAttackExecutionIntegration`, console in `pcAttackPopover`.
