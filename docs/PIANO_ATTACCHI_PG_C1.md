# Attacchi PG — C1: trucchetti con tiro per colpire (piano)

Stato: **implementata, non committata**. Prima tranche di [PIANO_ATTACCHI_PG_TRUCCHETTI.md](PIANO_ATTACCHI_PG_TRUCCHETTI.md). Include la categoria "Attacco" del Combat Log rimandata dalla fase 0.

## Come è stata implementata (differenze dal piano)

- **Un'unica azione rapida "Trucchetto" per attore**, su proposta del GM, invece di un'azione per trucchetto. Nella scheda si spuntano facoltativamente i trucchetti conosciuti (nessuno spuntato: tutti gli 8); il trucchetto si sceglie nella console da un menu a tendina, che propone per primo l'ultimo usato (`pcAttackState.lastAttack.spellId`). Dopo "Registra" il trucchetto resta selezionato, utile per i raggi successivi della Deflagrazione.
- La quick action salva solo `source: { kind: "cantrip", spellIds? }`. Portata e componente si ricavano dal trucchetto scelto al momento dell'attacco (`pcAttackResolvedAction`) e il comando riceve `spellId`.
- Decisioni confermate: effetti al colpo come promemoria (anche in History come `manualRemainder`), un raggio per registrazione, categoria "Attacco" anche per le azioni dei boss, eventi passati invariati.

## Obiettivo

Un incantatore registra un trucchetto d'attacco come un marziale registra un colpo: stessa console, stessi esiti (Colpito / Critico / Mancato), stesse difese, extra al colpo, History e Combat Log. Cambia la fonte del danno: dadi e tipo vengono dal trucchetto e crescono con il **livello del personaggio** (5°/11°/17°), non con il livello di classe.

## Trucchetti della tranche (testi verificati sul catalogo)

| Trucchetto | id catalogo | Attacco | Danno | Effetto al colpo (in C1 resta un promemoria) |
| --- | --- | --- | --- | --- |
| Dardo di fuoco | `fire-bolt` | a distanza | 1d10 fuoco | oggetti infiammabili prendono fuoco |
| Deflagrazione occulta | `eldritch-blast` | a distanza | 1d10 forza per raggio | 2/3/4 raggi al 5°/11°/17°: **un raggio per registrazione** |
| Tocco gelido | `chill-touch` | a distanza | 1d8 necrotici | niente cure fino al turno successivo; svantaggio dei non morti |
| Raggio di gelo | `ray-of-frost` | a distanza | 1d8 freddo | velocità −3 m fino al turno successivo |
| Stretta folgorante | `shocking-grasp` | mischia | 1d8 fulmine | niente reazioni fino al turno successivo; vantaggio contro armature di metallo |
| Produrre fiamma | `produce-flame` | a distanza | 1d8 fuoco | — |
| Frusta di spine | `phb2014-frusta-di-spine` | mischia | 1d6 perforanti | trascina fino a 3 m (taglia Grande o inferiore) |
| Ferocia primordiale | `xanathar-ferocia-primordiale` | mischia | 1d10 acido | — |

Dadi del trucchetto: ×1 fino al 4° livello del personaggio, ×2 dal 5°, ×3 dall'11°, ×4 dal 17° (raggi della Deflagrazione: il dado resta 1d10, cresce il numero di raggi).

**Esclusi:**
- **Pietra magica:** non scala con il livello, aggiunge il modificatore da incantatore e può tirarla anche un altro personaggio.
- **Trucchetti con tiro salvezza:** sono C2.
- **Lama Roboante e Lama Verdefiamma:** sono C4.
- **Trucchetti senza danno.**

## Contratto dati

### `src/pcAttackCantripCatalog.js` (nuovo, solo dati, nessun import)

```js
{ spellId: "fire-bolt", range: "ranged", type: "fire", dice: "1d10", scaling: "dice" }
{ spellId: "eldritch-blast", range: "ranged", type: "force", dice: "1d10", scaling: "beams" }
{ spellId: "chill-touch", ..., effectNote: "Non può recuperare PF fino all'inizio del tuo prossimo turno; un non morto ha svantaggio a colpirti." }
```

Senza import, così la quick action e il menu del tracker restano leggeri. Il nome mostrato viene da `getSpellDefinition(spellId).displayName`.

### Quick action (`src/quickActionsCore.js`)

L'attacco acquista una fonte:

```js
{ kind: "attack", source: { kind: "weapon" }, range, components }      // oggi; assente = arma
{ kind: "attack", source: { kind: "cantrip", spellId }, label }         // nuovo
```

Per un trucchetto il sanitizer **ricava** `range` e la componente (`[{ id: "c1", type }]`) dalla tabella, senza salvarli a mano: un trucchetto sconosciuto rende l'azione non valida. Il resto del motore d'attacco (`pcAttackCore`) non cambia, perché vede le stesse componenti. Le azioni esistenti senza `source` restano attacchi con arma.

### Dadi al livello del personaggio

`pcAttackCantripDice(cantrip, card)` usa `totalCharacterLevel` del profilo: "2d10" al 5° livello. Per la Deflagrazione restituisce "1d10" più il numero di raggi ("2 raggi"). La console lo mostra nella riga secondaria, come la formula di un'arma; sul critico raddoppia come per le armi.

### Extra al colpo: il vincolo "attacco con arma"

Con i trucchetti, i privilegi della tabella devono distinguere il tipo di attacco. Nuovo requisito `requires.attack`:

| Valore | Privilegi |
| --- | --- |
| `"weapon"` | Attacco Furtivo, Colpo Divino (tutti i domini), Punizione Divina e Migliorata, Punizione Occulta, Sterminatore di Colossi, Colpi Terribili, Furia Divina, Danno dell'Ira, Preda dell'Uccisore, Succhiavita |
| qualsiasi attacco | Maledizione della Lama del Sortilegio (vale per qualunque tiro di danno contro il bersaglio maledetto) |

Su un trucchetto i primi restano visibili ma disattivati con il motivo "Solo per gli attacchi con arma". Il "+ Componente" al volo resta disponibile, ad esempio per il Marchio del Cacciatore o il Sortilegio.

### Provenienza e Combat Log

- **Causalità:** si aggiunge `cause.spellId` / `cause.spellName` e `attack.source: "cantrip"`. Il dettaglio del log mostra "Trucchetto: Dardo di fuoco (2d10)".
- **Nuova categoria "Attacco"** (`attack`) in `combatLogCore` e `combatLogPresentationCore`, assegnata ai kind `pc-attack` **e** `monster-action`; oggi entrambi finiscono in "Altro". Etichetta e colore nuovi, filtro incluso. Gli eventi già registrati non vengono migrati (contratto CL: niente riscritture) e restano "Altro".

## Interfaccia

- **Editor della scheda (Azioni rapide → Attacco):** nuova scelta "Fonte: Arma / Trucchetto". Con Trucchetto, una tendina con gli 8 trucchetti della tabella; portata e componenti si nascondono perché ricavate. L'etichetta, se vuota, prende il nome del trucchetto.
- **Console:**
  - il sottotitolo diventa "Lyra · Trucchetto · Distanza";
  - la riga del danno mostra "Fuoco / 2d10";
  - l'eventuale effetto al colpo compare come promemoria sotto il danno ("Da applicare a mano: velocità −3 m…");
  - per la Deflagrazione compare "Raggi: 2 al tuo livello: registra un attacco per raggio".
- **Menu ⚡ del tracker:** icona ✦ e riepilogo "Trucchetto · distanza".

## File coinvolti

| File | Modifica |
| --- | --- |
| `src/pcAttackCantripCatalog.js` | nuovo: tabella + dadi al livello del personaggio |
| `src/quickActionsCore.js` | `source` dell'attacco; componenti e portata ricavate per i trucchetti |
| `src/pcAttackRiderCatalog.js` | `requires.attack` su ogni rider |
| `src/pcAttackCore.js` | blocco "Solo per gli attacchi con arma", provenienza del trucchetto |
| `src/pc-attack.js`, `pc-attack.html` | sottotitolo, dadi al livello, promemoria effetto e raggi |
| `src/initiative-card-modal.js` | scelta della fonte e del trucchetto nell'editor |
| `src/trackerQuickActions.js`, `src/tracker-quick-actions.js` | riepilogo e icona |
| `src/combatLogCore.js`, `src/combatLogPresentationCore.js` | categoria "Attacco" e riga del trucchetto |
| `docs/COMBAT-LOG.md` | elenco categorie aggiornato |

Nessuna modifica a `initiativeList.js`, all'ordine di iniziativa, alle barre HP o alle chiavi metadata.

## Rischi

- **Quick action esistenti:** senza `source` restano armi, e il test di compatibilità lo verifica. Un client con build vecchia scarta le azioni trucchetto, come già accadeva per gli attacchi (stessa build per tutti).
- **Combat Log:** la nuova categoria tocca solo la classificazione per `kind` e la presentazione; storage, idempotenza e History restano invariati.
- **Effetti già automatizzati nel pannello incantesimi** (Tocco gelido, Raggio di gelo): non vengono toccati. In C1 la console li indica come promemoria; l'applicazione automatica arriva in C5.

## Test

- **Tabella:** ogni `spellId` esiste nel catalogo ed è di livello 0; i tipi coincidono con `damageType` dove presente; dadi al 1°/4°/5°/11°/17°/20° livello; raggi della Deflagrazione.
- **Sanitizer:** trucchetto valido con componenti e portata ricavate; trucchetto sconosciuto → null; azione senza `source` invariata (arma).
- **Rider:** su un trucchetto Furtivo, Punizione e Colpo Divino sono disattivati con il motivo, la Maledizione della Lama del Sortilegio resta disponibile; su un'arma nulla cambia (tutti i test esistenti invariati).
- **Mutation:** causalità con `spellId`, `spellName`, `attack.source`; danno, difese e Undo come per le armi.
- **Combat Log:** `pc-attack` e `monster-action` in "Attacco"; un evento salvato come "Altro" resta "Altro"; riga "Trucchetto: …".
- **Console:** sottotitolo, dadi al livello, promemoria dell'effetto, indicazione dei raggi.
- **Editor:** raccolta di un'azione trucchetto.
- **Prova nell'harness browser:** Deflagrazione occulta di un warlock di 5° livello con la Maledizione della Lama del Sortilegio; Attacco Furtivo disattivato su un trucchetto per un ladro/mago.

## Decisioni da prendere

1. **Effetti al colpo in C1** (Tocco gelido, Raggio di gelo, Stretta folgorante, Frusta di spine): **proposta: trucchetti inclusi, effetto mostrato come promemoria** da applicare a mano o dal pannello incantesimi, fino a C5. Alternativa: escludere questi quattro fino a C5.
2. **Deflagrazione occulta:** **proposta: un raggio per registrazione**, con l'indicazione di quanti raggi spettano; ogni raggio può avere il suo bersaglio.
3. **Categoria "Attacco" anche per le azioni dei boss:** **proposta: sì**, così attacchi PG e boss si filtrano insieme.
4. **Eventi già registrati:** **proposta: restano "Altro"**, come da contratto del Combat Log, senza riclassificarli in lettura.
