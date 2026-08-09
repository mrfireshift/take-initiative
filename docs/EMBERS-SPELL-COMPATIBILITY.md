# Compatibilità spell: Take Initiative ↔ Embers

Snapshot del confronto: **2026-08-07**.

Repository e revisioni:

- Take Initiative: `main` / `dfb5e83724a7af6c83a23ce1029b97312577bf8c`.
- Embers: `main` / `842d674946a4e031013ce12d0a5502b0e78bd407`.

Il confronto usa gli ID canonici del catalogo Take Initiative e le chiavi spell del JSON Embers solo come dati di audit. Non copia cataloghi, blueprint, asset video o codice runtime dentro Take Initiative.

## Risultato quantitativo

| Misura | Valore |
|---|---:|
| Spell nel catalogo normalizzato Take Initiative | 477 |
| Opzioni trackable Take Initiative | 357 |
| Entry spell Embers | 62 |
| Match canonico `_` → `-` | 45 / 62 = **72,6%** |
| Match source-aware aggiuntivi | 8 |
| Match semantico `magic_missiles` → `magic-missile` | 1 |
| Entry spell/compatibilità riconciliabili | 54 / 62 = **87,1%** |
| Spell realmente assenti dal catalogo | 2 (`frostbite`, `witch_bolt`) |
| Entry non 1:1 con una spell canonica | 6 (generiche/capacità) |
| Match Take Initiative con `targetMode: selected` | 33 |
| Match con `targetMode: self` | 9 |
| Match con `targetMode: area` | 3 |
| Match con area `null` | 22 |
| Match con area `cone` | 2 |
| Match con area `sphere` | 10 |
| Match con area `cube` | 5 |
| Match con area `line` | 4 |
| Match con area `cylinder` | 2 |

Il match canonico significa che `getSpellDefinition(id.replaceAll("_", "-"))` restituisce una spell Take Initiative. Non significa che comportamento, parametri, target semantics o lifecycle siano già compatibili.

Il conteggio iniziale 45/62 era quindi corretto solo come confronto meccanico degli ID; non era corretto interpretare le altre 17 entry come tutte assenti. Take Initiative usa anche ID `phb2014-*` e `xanathar-*` per contenuti localizzati o supplementari.

## Separazione tra pannello Incantesimi ed Effetti ad Area

I due UI non consumano lo stesso insieme:

| Insieme | Fonte | Entry |
|---|---|---:|
| Pannello Incantesimi | `getTrackableSpellOptions()` / `TRACKABLE_SPELLS` | 357 |
| Effetti ad Area | `getAreaSaveSpellOptions()` / `AREA_POPOVER_SPELL_ID_SET` | 132 |
| Presenti in entrambi | intersezione degli ID | 100 |
| Solo Effetti ad Area | area − pannello | 32 |
| Solo pannello | pannello − area | 257 |
| Quick action spell | trackable ∪ area popover | 389 |

Le 132 entry area hanno tutte almeno una `SPELL_AREA_RULES` concreta; il popover area non è quindi soltanto una lista descrittiva. Il pannello invece è costruito sulle spell trackable: le spell istantanee non entrano automaticamente. Questo spiega perché `fireball` e `burning-hands` sono nel catalogo e negli Effetti ad Area ma non nel pannello Incantesimi, mentre `phb2014-sortilegio` è nel pannello ma non nel popover area.

### Indicatori Embers

Nel catalogo Embers:

- `effect_record.json` contiene **963** effetti leaf: 865 `CIRCLE`, 63 `TARGET`, 28 `CONE`, 7 `WALL`;
- `spells_record.json` contiene **62** spell entry;
- 35 entry contengono una semantica persistente (`duration: -1` o `loops: -1`) in un blueprint annidato;
- 16 entry contengono `attachedTo`;
- 5 entry contengono almeno una action blueprint.

Gli ultimi tre numeri sono indicatori strutturali, non una promessa sul comportamento runtime di ogni spell: servono a mostrare perché un semplice mapping ID non basta per coprire l'intero catalogo.

## Match canonici

Queste 45 entry hanno un corrispondente ID Take Initiative dopo la trasformazione `_` → `-`:

```text
dancing_lights       → dancing-lights
eldritch_blast       → eldritch-blast
fire_bolt             → fire-bolt
ray_of_frost          → ray-of-frost
sacred_flame          → sacred-flame
bless                 → bless
burning_hands         → burning-hands
cure_wounds            → cure-wounds
detect_magic           → detect-magic
entangle               → entangle
fog_cloud              → fog-cloud
grease                 → grease
guiding_bolt           → guiding-bolt
hunters_mark           → hunters-mark
shield                 → shield
shield_of_faith        → shield-of-faith
sleep                  → sleep
darkness               → darkness
flaming_sphere         → flaming-sphere
misty_step              → misty-step
gust_of_wind             → gust-of-wind
hold_person              → hold-person
moonbeam                 → moonbeam
scorching_ray            → scorching-ray
shatter                  → shatter
silence                  → silence
spiritual_weapon         → spiritual-weapon
web                      → web
call_lightning           → call-lightning
fireball                 → fireball
lightning_bolt           → lightning-bolt
wind_wall                → wind-wall
sleet_storm               → sleet-storm
spirit_guardians          → spirit-guardians
banishment                → banishment
black_tentacles           → black-tentacles
dimension_door            → dimension-door
wall_of_fire              → wall-of-fire
antilife_shell            → antilife-shell
arcane_hand               → arcane-hand
cone_of_cold              → cone-of-cold
wall_of_force              → wall-of-force
chain_lightning            → chain-lightning
disintegrate               → disintegrate
cloudkill                  → cloudkill
```

Gli ID a sinistra sono chiavi Embers, non nomi visualizzati e non ID da salvare nei metadata Take Initiative.

## Riconciliazione delle entry non coperte dal match meccanico

### Match source-aware verificati

Queste entry Embers sono presenti in Take Initiative con un ID canonico localizzato o source-prefixed:

| Embers | Take Initiative | Pannello | Area | Regola area |
|---|---|---:|---:|---|
| `mind_sliver` | `xanathar-aculeo-mentale` | sì | no | — |
| `toll_the_dead` | `xanathar-rintocco-dei-morti` | no | no | — |
| `arms_of_hadar` | `phb2014-braccia-di-hadar` | no | sì | circle instant |
| `hex` | `phb2014-sortilegio` | sì | no | — |
| `ice_knife` | `xanathar-coltello-di-ghiaccio` | no | sì | circle instant |
| `cloud_of_daggers` | `phb2014-nube-di-pugnali` | sì | sì | square zone/manual trigger |
| `thunder_step` | `xanathar-passo-del-tuono` | no | sì | circle instant |
| `whirlwind` | `xanathar-turbine` | sì | sì | circle zone/manual trigger |

Quindi i sei casi indicati nell'osservazione sono confermati. La differenza “pannello vs area” è reale per `arms_of_hadar`, `ice_knife` e `thunder_step`; `cloud_of_daggers` e `whirlwind` sono presenti in entrambi; `hex` è presente nel pannello ma non è una spell area.

### Match semantico non letterale

`magic_missiles` di Embers corrisponde alla spell canonica `magic-missile` di Take Initiative. Il singolare/plurale impedisce il match meccanico, ma non è un'assenza di catalogo. Attualmente non appartiene né alle 357 opzioni trackable né alle 132 opzioni area.

### Entry realmente non riconciliate

```text
frostbite
witch_bolt
```

Queste sono le due spell Embers per cui non è stato trovato un record canonico corrispondente nel catalogo Take Initiative corrente.

### Entry che non sono spell canoniche 1:1

| Embers | Classificazione Take Initiative |
|---|---|
| `bardic_inspiration` | capacità di classe `bardo-ispirazione-bardica`, non spell |
| `sneak_attack` | capacità di classe `ladro-attacco-furtivo`, non spell |
| `divine_smite` | capacità di classe `paladino-punizione-divina`, non spell |
| `melee_weapon_attack` | attacco generico, non entry spell |
| `ranged_weapon_attack` | attacco generico, non entry spell |
| `summon` | blueprint/abilità generica; richiede una spell concreta, non mapping 1:1 |

`bardic_inspiration` va quindi rimosso dalla lista dei “match spell mancanti” e gestito, se mai servirà un effetto grafico, nel dominio class features.

## MVP: tre spell richieste

| Take Initiative | Embers effect ID | Tipo | Geometria producer | Stato |
|---|---|---|---|---|
| `fire-bolt` | `fire_bolt` | `TARGET` | caster center → target center; `copies: 1` | Compatibile per MVP one-shot |
| `burning-hands` | `burning_hands` | `CONE` | preview `start/end`; `rotation = atan2`; `size = distance` | Compatibile, senza `attachedTo` nel MVP |
| `fireball` | `fireball.beam` + `fireball.explosion` | `TARGET` + `CIRCLE` | beam opzionale; explosion al centro del preview con raggio esplicito | Compatibile come composito esplicito |

Dettagli rilevanti osservati negli effect record:

- `fire_bolt` è un projectile `TARGET` con varianti di distanza;
- `burning_hands` è un `CONE`;
- `fireball.beam` è un `TARGET` e `fireball.explosion` è un `CIRCLE`.

Il bridge deve emettere `type: "effect"` e non deve invocare la risoluzione blueprint di Embers. Per Fireball il producer può inviare due istruzioni top-level con un `delay` esplicito solo dopo aver verificato empiricamente la durata del beam; in alternativa può inviare soltanto l'explosion nel primo incremento per ridurre la dipendenza dal timing.

### Geometry mapping

`src/spellAreaRules.js` di Take Initiative definisce:

- Fireball: circle, raggio 6 m (20 ft), origin world;
- Burning Hands: cone, lunghezza 4,5 m (15 ft), origin caster-adjacent;
- Lightning Bolt e altri casi: regole separate, non inclusi nel MVP.

Il preview prodotto da `src/aoeTargetTool.js` è già nel sistema di coordinate scena:

```js
{
  type,
  start,
  end,
  gridOrigin,
  dpi,
  targetIds
}
```

Per Embers:

```js
const dx = end.x - start.x;
const dy = end.y - start.y;
const sceneLength = Math.hypot(dx, dy);
const size = sceneLength / dpi;
const rotation = Math.atan2(dy, dx) * 180 / Math.PI;
```

Per Fireball `start` è il centro e `size` il raggio. Per Burning Hands `start` è l'origine e `size` la lunghezza del cono. Le misure in metri o celle non devono essere inviate direttamente.

## Compatibilità per classe di comportamento

| Classe | Esempi Embers | Rischio | Decisione |
|---|---|---|---|
| Projectile finito | `fire_bolt`, `eldritch_blast`, `scorching_ray` | first-use cache, unità | MVP dopo test |
| Cone finito | `burning_hands`, `cone_of_cold`, `lightning_bolt` | direzione/lunghezza e caster origin | Burning Hands MVP; altri fase 2 |
| Circle finito | `fireball`, `shatter` | centro/raggio e sequenze | Fireball MVP; altri per mapping esplicito |
| Composito effect-only | Fireball, Wall of Fire | ordine, delay, parametri | solo istruzioni esplicite verificate |
| Persistente condiviso | `darkness`, `cloudkill`, `spirit_guardians` | ownership, cleanup, concentrazione | fuori MVP |
| Attached/movement | `bless`, `guiding_bolt`, `lightning_bolt` in alcune configurazioni | item condivisi, movimento, stale IDs | fuori MVP |
| Action/interactions | `misty_step`, `dimension_door`, summon/action blueprints | mutazione token/scene e seconda ownership | fuori MVP |
| On-destroy | `shield` | evento end e lifecycle | fuori MVP |

## Differenze semantiche da non nascondere

1. **Target selection**: Embers usa target ordinati e il primo può essere il caster. Take Initiative usa `casterId`, `targetIds` e per le aree un preview con hit testing sui bounds. La conversione deve essere deterministica e non deve chiedere una seconda selezione.
2. **Replicate/copy**: Embers ha `replicate` e `copy` nelle proprie spell entry. Take Initiative non deve importarli implicitamente. Nel MVP `copies` è scelto dal bridge (`1` per Fire Bolt) oppure derivato da target/outcome secondo una regola locale esplicita.
3. **Parametri locali Embers**: Embers legge valori custom da localStorage. Un broadcast esterno non può assumere che i parametri locali di ogni client coincidano; il producer deve inviare geometria già risolta.
4. **Display name e lingua**: Take Initiative espone `displayName` italiano, ma l'ID stabile è `spell.id` inglese. Il mapping non deve usare label UI, alias italiani o testo libero.
5. **Persistent lifecycle**: Take Initiative concentra, interrompe e registra History; Embers può creare un item shared persistente con regole proprie. Match di ID non equivale a match di lifecycle.
6. **Actions**: un'azione Embers può muovere/nascondere item o inviare messaggi arbitrari. Non è un effetto grafico passivo e non deve essere inoltrata dal bridge.

## Strategia di mapping

Il mapping futuro dovrebbe essere un file piccolo e reviewable, ad esempio dentro `src/embersBridge.js` o in un modulo dedicato:

```js
{
  "fire-bolt": { effect: "fire_bolt", kind: "projectile" },
  "burning-hands": { effect: "burning_hands", kind: "cone" },
  "fireball": {
    beam: "fireball.beam",
    explosion: "fireball.explosion",
    kind: "circle-with-projectile"
  }
}
```

Questo frammento è una proposta di protocollo, non una copia del catalogo Embers. Prima della distribuzione va verificato che il maintainer consenta il riferimento a questi identificatori e che siano stabili nella versione installata.

Il mapping deve anche dichiarare una policy per ogni entry:

- `supported`: genera solo `effect` finito;
- `unsupported`: non invia nulla e registra motivo;
- `requires-area-preview`: accetta solo geometria già confermata;
- `requires-author-contract`: bloccata finché non chiarita licenza/lifecycle.

## Compatibilità con i percorsi Take Initiative

| Spell/entry path | Geometria disponibile? | Punto di emissione |
|---|---|---|
| Fire Bolt dal pannello/quick action | Posizioni item caster/target | post-commit in `executeSpellApplication()` |
| Burning Hands da area console | `pendingSpellAreaPlacement.preview` | post-commit nel ramo area di `quick-hp-modal.js` |
| Fireball da area console | `pendingSpellAreaPlacement.preview` | post-commit nel ramo area di `quick-hp-modal.js` |
| Fireball trattato come selezione semplice nel pannello | solo targetIds, non necessariamente centro/raggio | non sufficiente per il mapping area; richiede review/placement |
| Prepared spell | target selection al resolve | post-commit di `executeSpellApplication()` solo se l'entry è one-shot e la geometria è ricostruibile |
| Save reminder | outcome noto ma path diverso | escluso MVP |

## Test matrix minima

| Caso | Aspettativa |
|---|---|
| Fire Bolt primo cast | eventuale ritardo Embers non altera HP/History; secondo cast riproducibile |
| Fire Bolt con target distante | projectile sceglie variante e scala corretta |
| Burning Hands origine caster-adjacent | cono parte dall'origine del preview, non dal centro scelto da Embers UI |
| Burning Hands quattro direzioni | rotazione in gradi corretta |
| Fireball raggio 6 m | il circle usa il preview center e il raggio in coordinate scena |
| Griglia 5 ft, 1 m, custom | stessa geometria logica, conversione scena coerente |
| Embers assente | nessun errore funzionale del cast |
| Mutation stale/non-applied | nessun broadcast |
| Retry UI / doppio click | un solo eventId per commit |
| Undo o tick | nessun replay visuale nel MVP |
| Concentrazione terminata | nessun nuovo effect event nel MVP |

## Decisione di compatibilità

**MVP approvabile con limitazioni:** Fire Bolt, Burning Hands e Fireball come effetti finiti, usando un adapter manuale e il contratto osservato `eu.armindo.embers/effects`.

**Non approvato automaticamente:** il restante catalogo 62/62, le due spell realmente assenti (`frostbite`, `witch_bolt`), le entry generiche/capacità, i persistenti, gli attached, le action/interactions, gli onDestroy e qualsiasi distribuzione che incorpori catalogo o asset Embers.

## Aggiornamento implementazione visuale (2026-08-09)

Il runtime ora copre le 54 spell riconciliabili elencate in questo audit
(45 canoniche, 8 source-aware e `magic-missile`) con un mapping visuale nativo;
`hold-monster` riusa inoltre in modo identico il mapping persistente di
`hold-person`, come alias visuale semantico.
`fireball` resta sul renderer dedicato; `bardic_inspiration` è collegata al
percorso delle capacità di classe. Gli asset WebM JB2A vengono referenziati
dal bucket pubblico al momento del playback, senza dipendenza dal plugin
Embers installato.

La copertura è visuale e best-effort: il cast iniziale/attivazione riproduce
il playback finito e, per le entry Embers con `duration: -1`, mantiene un
WebM locale persistente fino alla rimozione dell'istanza canonica. Il renderer
usa `attachedTo` per i loop legati a caster/bersaglio, chiude i lifecycle anche
quando la concentrazione viene interrotta o lo status viene rimosso e riproduce
l'outro `shield.outro.fade` per `shield`. Azioni Embers arbitrarie e blueprint
che mutano la scena restano fuori dal perimetro.
