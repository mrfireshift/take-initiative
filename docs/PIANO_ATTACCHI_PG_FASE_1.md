# Attacchi PG — fase 1: danni extra al colpo (piano)

Stato: **implementata, non committata** (insieme alla fase 0, [PIANO_ATTACCHI_PG_FASE_0.md](PIANO_ATTACCHI_PG_FASE_0.md)). Tutte e cinque le decisioni sono state confermate con la proposta indicata.

## Note di implementazione

- **Componenti al volo.** L'"extra libero" è il pulsante **"+ Componente"** del popup: tipo, importo ed etichetta facoltativa (es. Lama Roboante, tuono), fino a 3 per attacco. La quick action definisce solo le componenti base dell'arma.
- **Precondizione di turno verificata.** Il coordinatore confronta qualsiasi `field` della chiave di stato, quindi i boss usano `round` e gli attacchi PG `round` + `current`. È applicata solo quando l'attacco consuma un uso per turno.
- **Etichette dei tipi.** La console usa `damageTypeLabel` (elenco completo). L'etichettatrice dei boss copre solo i tipi dei boss e mostrava "piercing".
- **Bug trovato in prova e corretto.** Dopo "Registra" la nuova bozza non aveva stato per le righe dei rider e l'aggiornamento parziale falliva (il commit era comunque avvenuto). Ora le righe si ricostruiscono quando manca il loro stato; il test della console verifica messaggio e bozza azzerata.

## Obiettivo

Nella console d'attacco, sotto i componenti dell'arma, una sezione **"Extra al colpo"** con:

1. i **privilegi di classe** che aggiungono danno quando si colpisce, mostrati solo se l'attore li ha: dadi suggeriti, tipo di danno e limite per turno;
2. un **extra libero** (etichetta, tipo, importo) per tutto il resto: Marchio del Cacciatore, Sortilegio, Favore Divino, armi magiche, Punizioni-incantesimo.

Ogni extra diventa una **componente di danno separata, con il proprio tipo**, quindi le difese si applicano correttamente (il radiante della Punizione Migliorata non segue la resistenza al tagliente). Il GM inserisce sempre il totale tirato: il plugin suggerisce i dadi, non li tira.

Gli usi "una volta per turno" sono contati per il **turno di iniziativa** (`turnKey`), non per il round: un Attacco Furtivo in reazione nel turno di un altro è di nuovo disponibile.

## Fuori perimetro

- **Punizione Divina e Punizione Occulta** → fase 2 (scelta del livello dello slot, +1d8 contro non morti e immondi, nessun conteggio degli slot).
- **Collegare all'attacco le attivazioni già automatizzate** (manovre, frecce arcane, rune, Palmo Tremante) → fase 3, insieme a TS e condizioni al colpo.
- **Incantesimi come rider automatici** (Marchio del Cacciatore, Sortilegio): in fase 1 passano dall'extra libero.
- Verifica dei requisiti (vantaggio, arma accurata, alleato adiacente): resta una decisione del GM.

## Rider della fase 1 (dati verificati sul catalogo)

Nel catalogo solo Attacco Furtivo ha i dadi strutturati (`diceByClassLevel`); gli altri li hanno solo nel testo. Serve quindi una piccola **tabella curata**, chiusa e versionata come `BOSS_ACTION_SPELLS`.

| Privilegio | Dadi | Tipo | Limite | Requisito letto dallo stato |
| --- | --- | --- | --- | --- |
| Attacco Furtivo (`ladro-attacco-furtivo`) | catalogo, 1d6 → 10d6 | dell'arma | 1 per turno (anche turni altrui) | — |
| Colpo Divino ×8 domini (`chierico-*-colpo-divino`) | 1d8, 2d8 dal 14° | Guerra: arma · Vita, Crepuscolo: radiante · Tempesta: tuono · Inganno: veleno · Forgia: fuoco · Ordine: psichico · Natura: freddo/fuoco/fulmine a scelta | 1 per **proprio** turno (da confermare, vedi decisioni) | — |
| Punizione Divina Migliorata (`paladino-punizione-divina-migliorata`) | 1d8 | radiante | nessuno | solo mischia |
| Sterminatore di Colossi (entrambe le versioni) | 1d8 | dell'arma | 1 per turno | bersaglio sotto il massimo dei PF **prima** del colpo |
| Colpi Terribili (`ranger-viandante-fatato-colpi-terribili`) | 1d4, 1d6 dall'11° | psichico | 1 per turno **per bersaglio** | — |
| Furia Divina (`barbaro-cammino-dello-zelota-furia-divina`) | 1d6 + ½ livello barbaro | necrotico o radiante | prima creatura colpita nel **proprio** turno | Ira attiva |
| Danno dell'Ira (`barbaro-ira`) | +2 / +3 dal 9° / +4 dal 16° | dell'arma | nessuno | Ira attiva, solo mischia |
| Preda dell'Uccisore (`ranger-uccisore-di-mostri-preda-dell-uccisore`) | 1d6 | dell'arma | prima volta per turno su quel bersaglio | condizione "Preda dell'Uccisore" sul bersaglio posta dall'attaccante |
| Maledizione della Lama del Sortilegio | + bonus di competenza | dell'arma | nessuno | condizione sul bersaglio posta dall'attaccante |
| Succhiavita (`warlock-suppliche-occulte-succhiavita`) | + mod. Carisma (min. 1) | necrotico | nessuno | — |

Esclusi dalla tranche: Imboscata Terrificante (primo turno di combattimento), Forma Siderale Arciere (è un attacco a sé: si modella come azione rapida "Attacco").

## Contratto dati

### `src/pcAttackRiderCatalog.js` (nuovo, solo dati e funzioni pure)

```js
{
  id: "ladro-attacco-furtivo",          // = featureId del catalogo privilegi
  label: "Attacco Furtivo",
  dice: { classLevel: "ladro", byLevel: "catalog" }  // oppure { classLevel, table: { 1: "1d8", 14: "2d8" } }
                                                    // oppure { flat: "rage" | "proficiency" | "ability:cha" }
                                                    // oppure { formula: "1d6+half:barbaro" }
  type: "weapon" | "radiant" | ... | { choice: ["cold", "fire", "lightning"] },
  limit: null | { per: "turn" | "own-turn", scope: "attacker" | "target" },
  requires: { range?: "melee", activeFeatureId?: "barbaro-ira",
              targetCondition?: "Preda dell'Uccisore", targetBelowMax?: true },
}
```

Helper riusati, già presenti:
- `getEnabledClassFeatures(profile)`: il rider compare solo se il privilegio è abilitato per l'attore;
- `characterClassLevel`, `resolveClassFeatureDice` per Attacco Furtivo;
- `totalCharacterLevel` + `proficiencyBonusForLevel`, `abilityModifier`;
- `activeClassFeatureInstances(meta.classFeatureState, round)` per l'Ira;
- le istanze di condizione del bersaglio (`type: "class-feature"`, `sourceId`, `condition`) per Preda e Maledizione.

Il tipo `"weapon"` usa il tipo della prima componente dell'attacco; se l'attacco ha più tipi, il GM sceglie quale nella console.

### `pcAttackState` (esteso, campo già introdotto in fase 0)

```js
{ version: 1, lastAttack: {...}, riderUses: [{ riderId, turnKey, targetId? }] }
```

Si conservano solo gli usi del `turnKey` corrente: a ogni scrittura il resto viene scartato, quindi il campo resta piccolo. L'Undo ripristina anche i contatori, come già fa con `lastAttack`. `riderUses` è additivo e la versione resta 1.

### Mutation (`src/pcAttackCore.js`)

- `pcAttackRiderOptions({ attackerItem, targetItem, action, turnState })` → elenco dei rider con `available`, `reason` ("già usato in questo turno", "solo nel proprio turno", "Ira non attiva", "bersaglio al massimo dei PF"…), dadi suggeriti e tipo. Pura, usata sia dalla console sia dal commit.
- `buildPcAttackMutation` accetta `riders: [{ riderId, type, amount }]` e `extras: [{ label, type, amount }]` (al massimo 2):
  - rider ed extra **solo su Colpito/Critico**;
  - la disponibilità è **ricalcolata dallo stato live**: se al commit un rider non è più disponibile, rifiuto con "riapri l'attacco";
  - ogni rider diventa una componente `r:<riderId>`, ogni extra `x1`/`x2`, tutte passate da `defendedComponents`;
  - `pcAttackState.riderUses` aggiornato con gli usi con limite;
  - precondizione sullo stato del turno (round e turno corrente), così un cambio di turno a console aperta non attribuisce l'uso al turno sbagliato. **Da verificare** che il coordinatore accetti il campo `current` oltre a `round`, che i boss usano già.
- Causalità: ogni voce di `damageComponents` porta la fonte (`weapon` / `class-feature` con `featureId` / `manual` con etichetta) e c'è `causality.riders: [{ featureId, name, dice, amount, limit, turnKey }]`.

## Console (`pc-attack.html` / `src/pc-attack.js`)

- Sezione "Extra al colpo", visibile solo con esito Colpito o Critico.
- Una riga per rider: casella, nome, dadi suggeriti (raddoppiati sul critico, es. "3d6 · critico 6d6"), tipo (select se a scelta) e campo importo quando è spuntata. Se non disponibile, la riga è disabilitata e mostra il motivo.
- "+ Extra" aggiunge una riga libera: etichetta, tipo, importo.
- Anteprima, difese e PF includono gli extra.
- Selezione e aggiornamenti di scena aggiornano solo disponibilità e anteprima, senza ricostruire i campi (regola della fase 0).

## Combat Log

Oggi il log mostra azione, esito e delta HP ma non le componenti. Proposta: una riga in `causalityDetailLines` ([combatLogPresentationCore.js](../src/combatLogPresentationCore.js)): "Extra: Attacco Furtivo 3d6 (11 perforanti)". È additiva e non tocca né categorie né storage.

## File coinvolti

| File | Modifica |
| --- | --- |
| `src/pcAttackRiderCatalog.js` | nuovo: tabella curata + risoluzione dei dadi |
| `src/pcAttackCore.js` | `pcAttackRiderOptions`, estensione di `buildPcAttackMutation` e `pcAttackPreview` |
| `src/pcAttackExecution.js` | legge profilo, `classFeatureState` e condizioni del bersaglio; inoltra rider ed extra; chiave decisioni estesa |
| `src/pc-attack.js`, `pc-attack.html` | sezione "Extra al colpo" |
| `src/combatLogPresentationCore.js` | una riga di dettaglio (se approvata) |

Nessuna modifica a `initiativeList.js`, all'ordine di iniziativa, alle barre HP o alle chiavi metadata.

## Rischi (AGENTS.md)

- **Turno attivo**: solo lettura di `state` (`round`, `current`, `order`) tramite `currentInitiativeTurnKey`; la precondizione impedisce di registrare su un turno già cambiato. Nessuna scrittura.
- **ID virtuali** (Tana, Paragon, Epic): producono `turnKey` propri; vedi decisione 2.
- **HP**: invariato rispetto alla fase 0, le componenti in più passano dallo stesso `hp:set`.
- **Metadata**: solo il campo `pcAttackState` esistente, patch con `expected`.

## Test

- **Catalogo rider**: dadi per livello (Furtivo 1/3/19, Colpo Divino 8/14, Colpi Terribili 3/11, Furia Divina 3/10, Ira 1/9/16); tipo per dominio; ogni `id` esiste nel catalogo privilegi.
- **Disponibilità**:
  - privilegio non abilitato o livello insufficiente → assente;
  - Ira non attiva; Preda o Maledizione posta da un altro attaccante; bersaglio al massimo dei PF (inclusi i PF temporanei, `hp > hpMax`);
  - limiti: secondo uso nello stesso `turnKey`; nuovo turno → disponibile; reazione nel turno altrui → Furtivo sì, Colpo Divino no; Colpi Terribili su un altro bersaglio → sì;
  - fuori combattimento: nessun contatore, avviso.
- **Mutation**: componenti tipizzate con difese per componente; rider rifiutato su Mancato; rider non più disponibile al commit → rifiuto; `riderUses` potato al turno corrente; Undo ripristina i contatori.
- **Integrazione**: Attacco Extra con Furtivo sul primo colpo e bloccato sul secondo; Undo del primo lo rende di nuovo disponibile.
- **Console**: riga disabilitata con motivo; dadi raddoppiati sul critico; extra libero.

## Decisioni da prendere

1. **Colpo Divino: "per turno" o "per proprio turno"?** Il PHB 2014 inglese dice per tutti i domini "once on each of your turns". Le traduzioni del catalogo variano: Tempesta, Forgia e Crepuscolo dicono "proprio turno", gli altri "per turno". **Proposta: proprio turno per tutti**, come da RAW.
2. **Turni virtuali** (Tana, Epic, Paragon): un attacco in reazione in quel momento conta come turno a sé? **Proposta: sì**, ogni `turnKey` è un turno, coerente con il tracker.
3. **Rider già usato**: bloccato come per i boss, oppure forzabile con conferma? **Proposta: bloccato con il motivo**; per eccezioni c'è sempre l'extra libero.
4. **Riga "Extra" nel Combat Log**: **proposta sì** (modifica additiva di una funzione).
5. **Tipo a scelta** (Natura, Zelota): **proposta: scelta a ogni uso in fase 1**; per lo Zelota, che sceglie una volta sola, si potrà memorizzare nel profilo più avanti.
