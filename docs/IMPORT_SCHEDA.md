# Importare una scheda personaggio

La scheda personaggio può essere compilata da un blocco JSON ricavato da una
scheda esistente: un PDF, una scheda cartacea o un export. Il blocco si
prepara a mano oppure chiedendolo a un assistente (ChatGPT, Claude…) con il
prompt in fondo a questa pagina.

## Come si usa

1. Apri la scheda personaggio del token e premi **Modifica**.
2. Premi **Importa**, incolla il JSON e premi **Leggi**.
3. Il pannello elenca le sezioni trovate, ognuna con un riepilogo. Togli la
   spunta a quelle che non vuoi applicare. Per incantesimi e attacchi scegli
   **Aggiungi** (aggiunge i mancanti all'elenco attuale) o **Sostituisci**.
4. Premi **Applica al modulo**: i campi delle varie schede si compilano.
5. Controlla e premi **Salva**. Fino a quel momento nulla è salvato e
   **Annulla** scarta tutto.

I nomi che il plugin non riconosce (classi, sottoclassi, incantesimi, tipi di
danno) sono elencati in rosso e vanno sistemati a mano: non vengono indovinati.

Regole di applicazione:

- statistiche, modificatori e tiri salvezza scrivono solo i valori presenti
  nel blocco; gli altri campi restano come sono;
- classi, specie e difese ai danni sostituiscono quelle attuali;
- le capacità di classe abilitate di default per le nuove classi si attivano
  come quando si aggiunge una classe a mano;
- i punti ferita **non** si importano: vivono nei metadata canonici del token,
  con le barre HP sulla mappa e la memoria HP, e si impostano dal tracker.

## Formato

Tutte le chiavi sono facoltative. I numeri possono essere scritti anche come
testo (`"+7"`, `"15"`).

```json
{
  "name": "Nyx",
  "classes": [
    { "class": "Mago", "level": 5, "subclass": "Scuola di Divinazione" }
  ],
  "species": { "name": "Dragonide cromatico", "ancestry": "Bianco" },
  "armorClass": 15,
  "speed": "9 m",
  "passivePerception": 13,
  "spellSaveDC": 15,
  "spellAttackBonus": 7,
  "abilities": { "str": 8, "dex": 14, "con": 14, "int": 18, "wis": 12, "cha": 10 },
  "savingThrows": { "int": 7, "wis": 4 },
  "damageDefenses": { "resistances": ["freddo"], "immunities": [], "vulnerabilities": [] },
  "cantrips": ["Dardo di fuoco", "Mano magica"],
  "spells": ["Scudo", "Armatura magica", { "name": "Palla di fuoco", "pinned": true }, { "name": "Volare", "prepared": false }],
  "attacks": [
    { "label": "Pugnale", "range": "melee", "components": [{ "type": "perforanti", "formula": "1d4+2" }] },
    { "label": "Trucchetti", "source": { "kind": "cantrip" } }
  ],
  "notes": "Familiare: gufo."
}
```

| Chiave | Contenuto |
| --- | --- |
| `classes` | Fino a quattro classi con livello della singola classe e sottoclasse. Classi in italiano o in inglese (`Wizard`, `Fighter`…); sottoclassi con il nome italiano del catalogo, anche parziale (`Divinazione`). Per una sola classe valgono anche `class`, `level` e `subclass` al primo livello. |
| `species` | Testo o `{ "name", "ancestry" }`: `ancestry` è l'ascendenza draconica, la sottorazza o la variante (accettati anche `subrace` e `variant`). Il nome può essere già la sottorazza ("Elfo oscuro (drow)", "Hill Dwarf"). Per una specie presente in più manuali, `source` sceglie la versione ("Volo", "Mostri del Multiverso", "Tomo dei Nemici", "Costa della Spada", "Elemental Evil", "Eberron", "Ravnica", "Theros", "Witchlight", "Strixhaven", "Tortle Package", "Wildemount", "Van Richten", "Spelljammer", "Dragonlance", "Tasha"); senza, vale la prima e l'import lo segnala. Le specie fuori dal [catalogo](SPECIE.md) vengono segnalate. |
| `supernaturalGift` | Testo o `{ "name" }` (accettati anche `gift` e `dono`): il dono soprannaturale che si aggiunge alla specie, per ora "Hollow One". Un dono sconosciuto viene segnalato. |
| `armorClass`, `passivePerception`, `spellSaveDC`, `spellAttackBonus` | Numeri. |
| `speed` | Metri (`9`, `"9 m"`) oppure piedi con l'unità (`"30 ft"`, `"30 piedi"`: 1,5 m ogni 5 piedi). |
| `abilities` | Punteggi (`"int": 18`) oppure `{ "score": 18, "modifier": 4 }`. In alternativa `abilityScores` (punteggi) o `abilityModifiers` (modificatori). Chiavi `str dex con int wis cha` oppure `for des cos int sag car`, anche per esteso. |
| `savingThrows` | Bonus totali dei tiri salvezza, stesse chiavi. |
| `damageDefenses` | Liste `resistances`, `immunities`, `vulnerabilities` di tipi di danno, con l'id inglese (`fire`) o il nome italiano (`fuoco`). |
| `cantrips`, `spells` | Nomi in italiano o in inglese. `spells` può essere una lista o un oggetto per livello (`{ "1": [...], "3": [...] }`). `"pinned": true` mette l'incantesimo tra i preferiti del menu 🪄; `"prepared": false` lo tiene nel libro ma non preparato (il grimorio del mago). |
| `attacks` | Come l'import della scheda Attacchi: `label`, `range` (`melee` o `ranged`), `components` (1-3, con `type` e `formula` facoltativa) oppure `source: { "kind": "cantrip" }` per l'azione Trucchetto. Il tipo di danno può essere anche in italiano. |
| `notes` | Testo breve, fino a 280 caratteri. |

Gli incantesimi concessi da talenti, specie o oggetti vanno nelle **Azioni
rapide**, non nel libro: non includerli in `spells`.

## Prompt per un assistente

Allega il PDF della scheda e incolla:

```text
Leggi la scheda personaggio di D&D 5e allegata e restituisci SOLO un oggetto
JSON, senza commenti né testo intorno, con queste chiavi (ometti quelle che
la scheda non riporta):

name; classes: [{ class, level, subclass }] con il livello della singola
classe; species: { name, ancestry, source } con ancestry = ascendenza
draconica, sottorazza o variante e source = manuale della specie;
supernaturalGift: il dono soprannaturale, se c'è (es. "Hollow One"); armorClass; speed in metri ("9 m") o in
piedi con l'unità ("30 ft"); passivePerception; spellSaveDC;
spellAttackBonus; abilities: punteggi di caratteristica con chiavi
str dex con int wis cha; savingThrows: bonus totali con le stesse chiavi;
damageDefenses: { resistances, immunities, vulnerabilities } con i tipi di
danno; cantrips: nomi dei trucchetti; spells: nomi degli incantesimi
conosciuti o preparati della classe (escludi quelli concessi da talenti,
specie od oggetti), con { name, prepared: false } per quelli scritti nel
grimorio ma non preparati; attacks: [{ label, range: "melee" o "ranged",
components: [{ type, formula }] }] per ogni attacco con arma, con il tipo di
danno e la formula del danno; notes: al massimo 280 caratteri di note utili
al combattimento.

Usa i nomi italiani del Manuale del Giocatore quando la scheda è in italiano,
altrimenti quelli inglesi. Non inventare valori assenti.
```

## Importare lo statblock di un mostro

Lo stesso pannello **Importa** legge lo statblock di un mostro: le sue azioni
diventano attacchi che la console esegue al turno del mostro (tiro per
colpire, oppure tiro salvezza con CD, area e condizione propri), il
multiattacco compare sopra gli attacchi della console.

La scheda di un nemico o di un neutrale si apre dal tracker **solo per il
GM**; i giocatori aprono soltanto quelle di personaggi e alleati.

Un blocco è uno statblock quando ha `"kind": "monster"` oppure una lista
`actions`. Le altre chiavi (`armorClass`, `speed`, `abilities`,
`savingThrows`, `damageDefenses`, `notes`) sono quelle della scheda
personaggio. Le distanze sono in piedi come negli statblock (`10`,
`"10 ft"`) oppure in metri (`"3 m"`).

```json
{
  "kind": "monster",
  "name": "Drago rosso adulto",
  "armorClass": 19,
  "hitPoints": { "average": 256, "formula": "19d12+133" },
  "speed": "40 ft",
  "abilities": { "str": 27, "dex": 10, "con": 25, "int": 16, "wis": 13, "cha": 21 },
  "savingThrows": { "dex": 6, "con": 13, "wis": 7, "cha": 11 },
  "damageDefenses": { "immunities": ["fire"] },
  "multiattack": "Usa Presenza terrificante, poi un morso e due artigli.",
  "actions": [
    { "name": "Morso", "attack": { "bonus": 14, "type": "melee", "reach": 10 },
      "damage": [{ "type": "piercing", "formula": "2d10+8" }, { "type": "fire", "formula": "2d6" }] },
    { "name": "Arco lungo", "attack": { "bonus": 6, "type": "ranged", "range": { "normal": 150, "long": 600 } },
      "uses": 3, "damage": [{ "type": "piercing", "formula": "1d8+2" }] },
    { "name": "Soffio di fuoco", "recharge": 5,
      "save": { "ability": "dex", "dc": 21, "half": true }, "area": { "shape": "cone", "size": 60 },
      "damage": [{ "type": "fire", "formula": "18d6" }] },
    { "name": "Presenza terrificante", "save": { "ability": "wis", "dc": 19 },
      "area": { "shape": "sphere", "size": 120 }, "onFail": { "condition": "frightened" },
      "note": "Ripete il TS a fine turno; immune per 24 ore dopo un successo." }
  ]
}
```

| Chiave dell'azione | Contenuto |
| --- | --- |
| `name` | Nome dell'azione. Un'azione chiamata "Multiattack" o "Multiattacco" diventa il testo del multiattacco (dal suo `note`). |
| `attack` | Attacco con tiro per colpire: `bonus`, `type` (`melee` o `ranged`), `reach` (portata) oppure `range: { normal, long }` (gittata). Bonus, portata e gittata si mostrano, non si controllano: i dadi si tirano al tavolo. |
| `save` | Tiro salvezza al posto del tiro per colpire: `ability` (`str`… o il nome, anche in italiano), `dc`, `half: true` se chi supera subisce metà danni. Senza `area` vale per una creatura. |
| `area` | `shape` (`cone`, `line`, `sphere`, `cube`, `cylinder` o `target`) e `size` in piedi (raggio per sfera e cilindro, lato per il cubo); `width` per la linea; per `target`, `targets` è il numero di creature. Le creature si spuntano a mano nella console. |
| `onFail` | `{ "condition": "frightened" }`: la condizione di chi fallisce il TS (nome inglese o italiano), da rimuovere a mano. Con una condizione l'azione può non avere danni. |
| `damage` | Da 1 a 3 componenti `{ type, formula }`, come gli attacchi della scheda. |
| `recharge` | Ricarica: `5` per "Ricarica 5–6". Dopo l'uso la console scrive «usata»; non blocca mai: se al tavolo si ricarica, si usa di nuovo. |
| `uses` | Usi al giorno (`3` o `"3/giorno"`): finiti gli usi la console blocca l'azione; tornano con il riposo lungo. |
| `note` | Fino a 280 caratteri: la parte dell'azione che il plugin non automatizza, mostrata sotto i danni. |

Ciò che il plugin non riconosce va in rosso, non viene indovinato. Un'azione
senza danni né tiro salvezza (un teletrasporto) è segnalata e resta da
gestire al tavolo. Un attacco che al colpo chiede anche un tiro salvezza (il
ghoul, il ragno gigante) registra il colpo; il tiro salvezza resta nella nota.
I punti ferita (`hitPoints`, `{ "average", "formula" }` o un numero) compaiono
come riga **Punti ferita** con la media dello statblock, modificabile (il
plugin non tira la formula). Si scrivono dopo **Salva**, come PF attuali e
massimi, con lo stesso comando delle modifiche PF del tracker (una voce di
cronologia, annullabile):

- un token che ha già i suoi PF li tiene, a meno di spuntare **Sostituisci i
  PF attuali**;
- **Anche agli altri token** imposta gli stessi PF sulle altre creature con lo
  stesso nome (senza PF, o tutte con «Sostituisci»);
- i personaggi e i token con PF condivisi non vengono mai toccati: i loro PF
  si impostano dal tracker.

La scheda di un mostro resta sul suo token e nella memoria locale del browser
del GM, che la ritrova per nome su un nuovo token: non entra nella memoria
condivisa della room, il cui spazio resta alle schede dei personaggi. Su un
altro dispositivo del GM la scheda del mostro si reimporta.

### Da 5eTools

Lo stesso pannello legge il JSON di [5eTools](https://5e.tools), solo dei
manuali 2014 (i mostri delle regole 2024 non si importano):

- incolla in **Importa** il JSON di un mostro e premi **Leggi**, oppure
- premi **Carica file** e scegli uno o più file `.json` (un bestiario intero,
  un file homebrew). Poi cerca il mostro per nome o libro e sceglilo.

Un mostro **derivato** da un altro (molti di Icewind Dale derivano dal
Manuale dei Mostri) si ricostruisce se carichi insieme anche il bestiario
della sua base; se manca, il messaggio dice quale caricare.

Sopra le sezioni compare cosa la console registra e, in **Al tavolo**, cosa
resta da gestire a mano: il tiro salvezza al colpo, le azioni senza danni né
tiro salvezza, i tratti, le azioni leggendarie, gli incantesimi, le difese
condizionali (per esempio la resistenza alle armi non magiche, segnalata e
non importata). Nomi di mostri e azioni restano in inglese.

Il plugin non contiene dati di 5eTools: i file restano in memoria solo
mentre modifichi la scheda.

### Archivio 5eTools

Invece di copiare ogni volta un JSON, il plugin può leggere i bestiari da un
archivio online di 5eTools. L'indirizzo si scrive **una volta** in
**Opzioni → Console attacchi → Archivio 5eTools** (vale solo per questo
browser) e si controlla con **Prova**. È l'indirizzo della cartella dei dati
di un mirror di 5eTools, per esempio quello su GitHub:

```text
https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data/
```

Il plugin non porta con sé nessun indirizzo: se il mirror cambia o sparisce
basta scriverne un altro, e **Carica file** resta come ripiego. I libri
scaricati restano nel browser del GM (mai nella scena o nella room); la scelta
dei libri dalla scheda arriva con il prossimo aggiornamento.

### Prompt per un assistente

Allega lo statblock (testo, immagine o PDF) e incolla:

```text
Leggi lo statblock di D&D 5e allegato e restituisci SOLO un oggetto JSON,
senza commenti né testo intorno, con queste chiavi (ometti quelle assenti):

kind: "monster"; name; armorClass; hitPoints: { average, formula };
speed in piedi ("40 ft"); abilities: punteggi con chiavi str dex con int
wis cha; savingThrows: bonus totali con le stesse chiavi; damageDefenses:
{ resistances, immunities, vulnerabilities } con i tipi di danno in inglese;
multiattack: il testo del Multiattacco; actions: una voce per azione con
name e, a seconda dell'azione:
- attacco con tiro per colpire: attack: { bonus, type: "melee" o "ranged",
  reach in piedi oppure range: { normal, long } in piedi } e damage:
  [{ type, formula }] con i tipi di danno in inglese (al massimo 3);
- azione a tiro salvezza: save: { ability: str/dex/con/int/wis/cha, dc,
  half: true se chi supera subisce metà danni }, area: { shape: cone, line,
  sphere, cube, cylinder o target, size in piedi, width per la linea,
  targets per target }, damage come sopra, onFail: { condition } con la
  condizione in inglese se chi fallisce la subisce;
- recharge: il numero minimo della ricarica (5 per "Recharge 5-6"); uses:
  gli usi al giorno;
- note: al massimo 280 caratteri con ciò che resta da fare al tavolo
  (tiri salvezza al colpo, durate, ripetizioni del TS).
Non inventare valori assenti. Usa le regole del Manuale dei Mostri 2014.
```
