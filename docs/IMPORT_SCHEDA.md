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
| `species` | Testo o `{ "name", "ancestry" }`: `ancestry` è l'ascendenza draconica, la sottorazza o la variante (accettati anche `subrace` e `variant`). Il nome può essere già la sottorazza ("Elfo oscuro (drow)", "Hill Dwarf"). Per una specie presente in più manuali, `source` sceglie la versione ("Volo", "Mostri del Multiverso", "Tomo dei Nemici", "Costa della Spada", "Elemental Evil", "Eberron", "Ravnica", "Theros", "Witchlight", "Strixhaven"); senza, vale la prima e l'import lo segnala. Le specie fuori dal [catalogo](SPECIE.md) vengono segnalate. |
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
draconica, sottorazza o variante e source = manuale della specie; armorClass; speed in metri ("9 m") o in
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
