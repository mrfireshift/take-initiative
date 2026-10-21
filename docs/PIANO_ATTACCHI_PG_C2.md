# Attacchi PG — C2: trucchetti con tiro salvezza

Stato: **implementata, non committata**. Seconda tranche di [PIANO_ATTACCHI_PG_TRUCCHETTI.md](PIANO_ATTACCHI_PG_TRUCCHETTI.md), costruita su C1 ([PIANO_ATTACCHI_PG_C1.md](PIANO_ATTACCHI_PG_C1.md)).

## Cosa fa

La stessa azione rapida "Trucchetto" di C1 offre anche i trucchetti con tiro salvezza a bersaglio singolo. Nella console:

- gli esiti diventano **TS fallito / TS superato**: il fallimento subisce il danno, il successo nessuno (nessuno di questi trucchetti dimezza);
- il sottotitolo mostra il TS e la CD della scheda ("Oren · Trucchetto · TS Destrezza (CD 13)"); senza `spellSaveDC` nel profilo compare solo il TS;
- nel menu a tendina i trucchetti con TS riportano il tiro ("Rintocco dei Morti · TS Saggezza");
- passando da un trucchetto d'attacco a uno con TS (o viceversa) l'esito scelto si azzera;
- la sezione degli extra si chiama "Extra al danno" ed è visibile solo con TS fallito;
- **Rintocco dei Morti** usa i d12 se al bersaglio mancano PF (i PF temporanei non contano) e i dadi si aggiornano cambiando bersaglio.

## Trucchetti (testi verificati sul catalogo)

| Trucchetto | TS | Danno | Nota |
| --- | --- | --- | --- |
| Fiamma sacra | Destrezza | 1d8 radiosi | regola: niente copertura per il TS |
| Beffa crudele | Saggezza | 1d4 psichici | se fallisce: svantaggio al prossimo tiro per colpire |
| Spruzzo velenoso | Costituzione | 1d12 veleno | — |
| Fiotto acido | Destrezza | 1d6 acido | regola: un secondo bersaglio si registra a parte con lo stesso tiro |
| Rintocco dei Morti | Saggezza | 1d8, 1d12 se ferito | — |
| Infestazione | Costituzione | 1d6 veleno | se fallisce: movimento casuale di 1,5 m |
| Morsa del Gelo | Costituzione | 1d6 freddo | se fallisce: svantaggio al prossimo attacco con arma |
| Scheggia della Mente | Intelligenza | 1d6 psichici | se fallisce: −1d4 al prossimo TS |
| Lenza Elettrizzante | Forza | 1d8 fulmine | se fallisce: trascinato; danno solo se arriva entro 1,5 m |

Dadi ×2/×3/×4 ai livelli 5/11/17 del personaggio, come in C1.

**Regole ed effetti sono separati**:
- una **regola** (`ruleNote`) va saputa prima del tiro e compare così com'è;
- un **effetto** (`effectNote`) segue un TS fallito, ha il prefisso "Se fallisce, da applicare a mano" (per gli attacchi "Al colpo") ed è registrato nella History come parte da risolvere a mano.

**Esclusi**: Parola Radiosa, Rombo di Tuono, Turbine di Spade (ad area, più bersagli) e Creare Falò (zona persistente). Servono il disegno dell'area e i TS di gruppo: tranche separata.

## Contratto

- Tabella: `delivery: "save"`, `save` (abilità), `diceIfDamaged` per il Rintocco, `ruleNote` / `effectNote` in [pcAttackCantripCatalog.js](../src/pcAttackCantripCatalog.js).
- Core: `pcAttackOutcomesFor(attack)`, `PC_ATTACK_SAVE_OUTCOMES`, `pcAttackSaveLabel`; danno solo su `hit`, `critical`, `failed`. Su un TS superato non sono ammessi extra.
- Causalità: `save: { ability, outcome, dc? }`, `cantrip.saveLabel`; niente `action.attackOutcome` (non è un tiro per colpire), l'esito è sui bersagli ("Fallito"/"Superato" nel log).
- Combat Log: "Trucchetto: Fiamma sacra (2d8) · TS Destrezza (CD 13)", categoria "Attacco".

## Verifica

Test su tabella, core, console e Combat Log. Nell'harness browser: chierico di 5° livello con CD 13, Fiamma sacra su un goblin, TS fallito, 9 danni → History ed evento "Attacco" con la riga del trucchetto; druido di 11° livello: Fiamma sacra 3d8, Morsa del Gelo 3d6 con la nota "Se fallisce".
