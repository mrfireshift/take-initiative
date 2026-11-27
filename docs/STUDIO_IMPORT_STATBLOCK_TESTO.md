# Studio: statblock da testo e da altre fonti

Data: 15 novembre 2026. Stato: **approvato**; ST1 in `2a53bf55` (§12), ST2 committato il 15/11 (§13); ST3, prima parte (Strahd Reloaded), fatta il 15/11 e non committata (§14). Base dello studio: `main` a `617c6353`.

Decisioni dell'utente del 15/11: **approvate tutte**, da D1 a D10 (§10).

La domanda dell'utente: visto che gli statblock si importano in JSON, un parser può leggere statblock di altre fonti, anche in testo?

**In breve.** Sì. Il JSON del plugin fa già da formato ponte, e 5eTools è solo un adattatore che converte in quel formato. Il parser di testo sarebbe un adattatore in più. Conviene che produca un mostro **nella forma di 5eTools**: così riusa per intero la lettura che esiste già (azioni, TS, aree, incantesimi, leggendarie, difese) e tutto ciò che ne dipende (Statblock originale, scheda Capacità, avvisi di reazione). Si misura in automatico, perché il plugin sa già stampare in testo ogni mostro di 5eTools (§6).

---

## 1. Che cosa esiste già

### 1.1 Il percorso di un import

| Passo | Dove | Che cosa fa |
|---|---|---|
| **Leggi** | `readSheetImport()` ([initiative-card-modal.js:3966](../src/initiative-card-modal.js)) | prova `JSON.parse`: un JSON di 5eTools va all'elenco dei mostri, un altro JSON al formato del plugin. Un testo non JSON si ferma con «Blocco non leggibile: incolla il JSON così com'è.» |
| 5eTools → formato del plugin | `fiveToolsMonsterToStatblock()` ([fiveToolsMonsterCore.js:689](../src/fiveToolsMonsterCore.js)) | CA, PF, velocità, caratteristiche, TS, difese (anche quelle solo contro le armi non magiche), incantesimi, leggendarie, Elusione, armi magiche; per ogni azione uno stato (registrabile, TS al colpo nella nota, da gestire al tavolo); il rapporto «Al tavolo» |
| Lettura delle azioni | `attackAction()` e `saveAction()`, nello stesso file | espressioni regolari sui tag di 5eTools: `{@atk mw} {@hit 4} to hit … {@h}5 ({@damage 1d6 + 2})`, `{@dc 13}`, `{@recharge 5}` |
| Effetti dal testo | [monsterActionHeuristicsCore.js](../src/monsterActionHeuristicsCore.js) | condizioni, durate, TS ripetuto, immunità di 24 ore, origine dell'area, TS 2024. Lavora già sul **testo in chiaro**: i tag li toglie prima |
| Formato del plugin → scheda | `parseCharacterSheetImport()` ([characterSheetImportCore.js:421](../src/characterSheetImportCore.js)) e [monsterStatblockImportCore.js](../src/monsterStatblockImportCore.js) | sezioni con le caselle, PF, Leggendario, taglia del token; ciò che non riconosce lo nomina, non lo indovina |
| Memoria del GM | [monsterStatblockTextCore.js](../src/monsterStatblockTextCore.js), il loader e lo store | un record per riferimento (`"Goblin\|MM"`): `kind: "5etools"` (il mostro letto, mostrato diviso in voci) oppure `kind: "text"` (il testo incollato, un blocco unico) |
| Chi legge il record | tab Statistiche, scheda Capacità della console ([pcAttackMonsterTraitsCore.js](../src/pcAttackMonsterTraitsCore.js)), avvisi di reazione ([reactionSceneContext.js:66](../src/reactionSceneContext.js)) | cercano le sezioni per titolo: tratti, `Reactions`, `Legendary Actions` |

### 1.2 Le strade che ci sono già per le altre fonti

- **Prompt per un assistente** ([IMPORT_SCHEDA.md](IMPORT_SCHEDA.md), sezione dei mostri): qualunque formato, anche immagini, PDF e italiano, diventa il JSON del plugin, ma con un passaggio fuori dal plugin. Lo Statblock originale c'è solo se il JSON porta `text`, e anche allora è un blocco unico: Capacità mostra una sola voce «Statblock», senza tratti, reazioni e leggendarie separati.
- **Un piccolo lettore di testo c'è già:** `pastedReactionEntries()` ([monsterReactionParseCore.js](../src/monsterReactionParseCore.js), decisione G3 degli avvisi di reazione) trova le reazioni in un testo incollato: le righe sotto «Reactions» o «Reazioni» fino al titolo seguente, ogni voce «Nome. testo». Per questo gli avvisi di reazione funzionano già anche con il blocco unico.
- **File homebrew di 5eTools:** **Carica file** accetta già `{ "monster": [...] }` (`fiveToolsMonsters()`), quindi i mostri homebrew scritti in quel formato entrano già oggi.
- **Open5e:** valutato nella fase 3 degli attacchi dei mostri e lasciato fuori (D4 di quella fase): solo SRD e materiale OGL, formato diverso. Il valore `"open5e"` esiste già tra le fonti del profilo ([monsterProfileCore.js:7](../src/monsterProfileCore.js)), senza un adattatore.

### 1.3 Che cosa manca

- un lettore di testo completo: oggi c'è solo quello delle reazioni;
- un adattatore per Open5e;
- l'italiano: le regole sugli effetti cercano le formule inglesi del Manuale dei Mostri (2014 e 2025).

---

## 2. La proposta (D1)

```text
testo incollato
  → normalizzazione (righe, sillabazione, segni, Markdown)
  → intestazione divisa in campi, sezioni divise in voci
  → tag di 5eTools rimessi sulle formule fisse
  → un mostro nella forma di 5eTools, con source "testo"
  → fiveToolsMonsterToStatblock(), com'è oggi
  → parseCharacterSheetImport(), com'è oggi
```

Perché passare dalla forma di 5eTools:

- **Una sola lettura delle azioni.** L'adattatore di 5eTools è nato per non scrivere le regole due volte. Un parser che scrivesse direttamente il formato del plugin dovrebbe rifare `attackAction()` e `saveAction()` senza tag, e le due letture andrebbero tenute allineate per sempre.
- **Tutto il resto arriva senza lavoro:** stati delle azioni e rapporto, armi magiche, difese non magiche, Elusione, Resistenza leggendaria, incantesimi a slot e innati, velocità e volo stazionario, taglia del token, Statblock originale diviso in voci, Capacità, avvisi di reazione.
- **Si misura.** Il plugin sa già stampare un mostro di 5eTools come nel libro: stampato e riletto, deve tornare uguale (§6).

### 2.1 Prova del percorso (15/11)

Ho scritto a mano ciò che il parser dovrebbe produrre per un mostro inventato e l'ho passato al codice di oggi, in uno script fuori dal repository. Il testo che il GM incollerebbe:

```text
Frost Raider
Medium humanoid (human), chaotic evil
Armor Class 14 (hide armor)
Hit Points 32 (5d8 + 10)
Speed 30 ft.
STR DEX CON INT WIS CHA
16 (+3) 12 (+1) 14 (+2) 9 (−1) 11 (+0) 10 (+0)
Saving Throws Con +4
Skills Athletics +5, Survival +2
Damage Resistances cold
Senses passive Perception 10
Languages Common
Challenge 1 (200 XP)
Cold Blooded. The raider has advantage on saving throws against being frightened.
Actions
Multiattack. The raider makes two attacks with its handaxe.
Handaxe. Melee or Ranged Weapon Attack: +5 to hit, reach 5 ft. or range 20/60 ft., one target. Hit: 6 (1d6 + 3) slashing damage.
Frost Horn (Recharge 5–6). The raider blows a horn. Each creature of its choice within 30 feet of it must succeed on a DC 12 Wisdom saving throw or be frightened until the end of the raider's next turn.
Reactions
Parry. The raider adds 2 to its AC against one melee attack that would hit it. To do so, the raider must see the attacker and be wielding a melee weapon.
```

Che cosa è uscito, senza toccare il codice:

- **Handaxe:** attacco in mischia +5, portata 5 piedi, lancio 20/60, 1d6+3 taglienti.
- **Frost Horn:** TS su Saggezza CD 12, sfera di 30 piedi attorno al mostro con «of its choice», Spaventato fino alla fine del prossimo turno del mostro, ricarica 5.
- Multiattacco, CA 14, PF 32 (5d8+10), caratteristiche, TS, resistenza al freddo; il tratto nel rapporto.
- Nella memoria del GM il record `frost raider|testo`; in Capacità le voci «Cold Blooded» (tratto) e «Parry» (reazione); gli avvisi di reazione leggono Parry come ＋2 alla CA contro un attacco in mischia.

Due cose da cambiare, già visibili qui: il riepilogo dice «Da 5eTools (testo)» e il profilo del mostro dice `source: "5etools"` (§4, D4).

---

## 3. Il parser

### 3.1 Normalizzazione

- Fine riga e spazi doppi; legature dei PDF (`ﬁ`, `ﬂ`); apostrofi tipografici; `−` e `–` come segno meno nei bonus e nei dadi.
- La sillabazione a fine riga («satu-» e «rated» → «saturated»), solo tra due minuscole.
- Le righe di pagina ripetute (numero, titolo del capitolo): fuori, e nel rapporto.
- Il Markdown di Homebrewery e GM Binder (`> - **Armor Class** 15`, `***Nimble Escape.***`, la tabella `|STR|DEX|…|`): si toglie il markup, ma `***Nome.***` segna con certezza l'inizio di una voce.
- Un limite all'ingresso di 20.000 caratteri, lo stesso del testo incollato di oggi (`MAX_MONSTER_STATBLOCK_TEXT`).

### 3.2 Intestazione

| Riga del libro | Campo di 5eTools |
|---|---|
| la prima riga | `name`; se è tutta maiuscola, «ADULT RED DRAGON» → «Adult Red Dragon» |
| «Medium humanoid (human), chaotic evil» | `size`, `type`, `alignment` |
| «Armor Class 14 (hide armor)», anche «12 (15 with mage armor)» | `ac` |
| «Hit Points 32 (5d8 + 10)» | `hp` |
| «Speed 30 ft., fly 60 ft. (hover), swim 30 ft.» | `speed`, con `canHover` |
| «STR DEX CON INT WIS CHA» e i sei «16 (+3)»: su una riga, su sei righe, oppure «STR 16 (+3) DEX 12 (+1) …» | `str` … `cha` |
| «Saving Throws Con +4», «Skills Athletics +5» | `save`, `skill` |
| «Damage Resistances cold; bludgeoning, piercing, and slashing from nonmagical attacks that aren't silvered» | `resist: ["cold", { resist: [...], note, cond: true }]`; lo stesso per Immunities e Vulnerabilities |
| «Condition Immunities charmed, poisoned» | `conditionImmune` |
| «Senses darkvision 60 ft., passive Perception 10» | `senses`, `passive` |
| «Languages Common», oppure «—» | `languages` |
| «Challenge 1 (200 XP)»; «Proficiency Bonus +2» | `cr`; il bonus si ignora |

Una riga che non si riconosce va nel rapporto, mai in un campo.

### 3.3 Sezioni e voci

- **Titoli:** Actions, Bonus Actions, Reactions, Legendary Actions, Mythic Actions; anche in maiuscolo e in maiuscoletto spezzato dal PDF («A CTIONS»).
- **Inizio di una voce:** a inizio riga, un nome con le iniziali maiuscole seguito da un punto, con l'eventuale parentesi «(Recharge 5–6)», «(3/Day)», «(Costs 2 Actions)». Una riga che non comincia così si unisce alla precedente. È la regola di `pastedReactionEntries()` (un nome con la maiuscola, al massimo 60 caratteri senza punti, poi il punto): il parser la estende al maiuscoletto, al Markdown e alle righe spezzate, senza contraddirla, così le due letture dello stesso testo trovano le stesse voci.
- **Tratti:** ciò che sta prima di Actions. «Spellcasting.» e «Innate Spellcasting.» diventano `spellcasting`, come in 5eTools: l'intestazione con CD e bonus, poi «Cantrips (at will):», «1st level (4 slots):», «At will:», «3/day each:».
- **Liste dentro un'azione:** dopo «one of the following breath weapons» (e frasi simili) le voci che seguono sono una lista dell'azione, con la sua ricarica, come `fiveToolsActions()` fa con le liste di 5eTools.
- **Leggendarie:** «The dragon can take 3 legendary actions» → `legendaryActions: 3`.
- **Il resto** (azioni di tana, effetti regionali, testo descrittivo): §4 e D5.

### 3.4 I tag da rimettere

| Nel testo | Diventa | Chi lo legge |
|---|---|---|
| «Melee Weapon Attack:», «Ranged Weapon Attack:», «Melee or Ranged Weapon Attack:», «Melee Spell Attack:», «Ranged Spell Attack:» | `{@atk mw}`, `{@atk rw}`, `{@atk mw,rw}`, `{@atk ms}`, `{@atk rs}` | `ATTACK`; gli attacchi con incantesimo hanno anche ✦ Magica |
| «+5 to hit» | `{@hit 5} to hit` | `ATTACK` |
| «Hit: » | `{@h}`, senza lo spazio, come nei dati di 5eTools | `ATTACK`, `hitDamage()` |
| «6 (1d6 + 3)» | `6 ({@damage 1d6 + 3})` | `DAMAGE` |
| «DC 12» | `{@dc 12}` | `saveAction()`, lo stato «TS al colpo nella nota» |
| «(Recharge 5–6)», «(Recharge 6)» nel nome | `{@recharge 5}`, `{@recharge}` | `fiveToolsActions()` |
| una condizione dopo «be», «become», «is» | `{@condition frightened}` | lo stato «TS al colpo nella nota», il ripiego di `saveAction()` |
| «(3/Day)» nel nome | resta com'è | `fiveToolsActions()` lo legge già |

Il 2024 (ST4) aggiunge: «Melee Attack Roll: +4» → `{@atkr m} {@hit 4}`, «Dexterity Saving Throw: DC 21» → `{@actSave dex} {@dc 21}`, e «Failure:», «Success:», «Hit or Miss:», «Trigger:», «Response:» → `{@actSaveFail}`, `{@actSaveSuccess}`, `{@hom}`, `{@actTrigger}`, `{@actResponse}`. Con questi tag `isFiveTools2024()` riconosce il mostro, che passa solo con l'opzione «Statblock 2024» accesa, come oggi.

### 3.5 Le trappole note

| Fonte | Trappola |
|---|---|
| PDF | righe spezzate e sillabate, due colonne mescolate, intestazioni di pagina in mezzo, maiuscoletto spezzato, `−` al posto di `-`, legature |
| D&D Beyond | punteggi su più righe, «Proficiency Bonus», maiuscole diverse («Darkvision», «Passive Perception»): da verificare sui campioni |
| Homebrewery, GM Binder | il Markdown; in compenso i nomi delle voci sono marcati |
| tutte | la lista dei soffi, l'incantatore nei tratti, «(hover)» nella velocità, la CA alternativa tra parentesi |

---

## 4. Nel pannello Importa (D3, D4, D5)

- **Leggi** prova il JSON come oggi. Se non è JSON e il testo ha «Armor Class» (o «AC») e «Hit Points» (o «HP»), va al parser.
- Un testo con «Classe Armatura» e «Punti Ferita», prima del lotto italiano: «Statblock in italiano: per ora il parser legge l'inglese. Usa il prompt per un assistente (IMPORT_SCHEDA.md).»
- Il riepilogo come quello di 5eTools: «Da testo: Frost Raider, 2 azioni registrabili.» Sotto, il riquadro «Al tavolo» con il rapporto dell'adattatore e le righe che il parser non ha letto.
- Il GM vede le sezioni con le caselle e salva come oggi: dopo **Leggi** non cambia niente.
- Il segnaposto del riquadro ([initiative-card-modal.html:516](../initiative-card-modal.html)) aggiunge «o il testo di uno statblock».
- Il profilo del mostro sul token: `source: "manual"` e `ref: "Frost Raider|testo"`, lo stesso riferimento che oggi prende un blocco del plugin con `text` (`monsterImportRef()`, [monsterStatblockImportCore.js:292](../src/monsterStatblockImportCore.js)). Nessun valore nuovo nei metadata. Con `manual` il loader non cerca il mostro nei libri dell'archivio, cosa che fa solo per `5etools` (D4). Il ritratto non c'è: l'adattatore lo propone solo per i mostri con un'immagine nel mirror (`hasToken`).
- Nella memoria del GM resta il mostro letto, come record `5etools`: è ciò che serve perché Statistiche e Capacità abbiano le voci divise; gli avvisi di reazione lo leggono come un mostro di 5eTools. Le sezioni e le righe che il parser non sa dove mettere diventano un tratto finale «Testo non letto», così nulla si perde (D5).

---

## 5. Altre fonti

### 5.1 Open5e (D6, ST5)

- Il JSON dell'API ha i numeri in campi propri (CA, PF, dadi dei PF, velocità, caratteristiche, TS) e il resto in testo: difese, sensi e lingue come le righe dell'intestazione, le azioni come `{ name, desc }` con lo stesso testo del libro. È quindi un adattatore piccolo sopra il parser: i campi vanno nella forma di 5eTools, `desc` nelle voci.
- Contenuto: SRD e terze parti OGL (per esempio i bestiari di Kobold Press). Il valore dipende da quanto quei libri si usano al tavolo.
- Proposta: incollato o da file. La ricerca online resta fuori: rete, limiti, e il controllo di CORS della fase 3 andrebbe rifatto.
- L'API ha più versioni con campi diversi: i nomi si ricontrollano al momento del lotto.

### 5.2 Altri formati (D7)

| Formato | Costo, dopo il parser | Nota |
|---|---|---|
| Improved Initiative (JSON) | piccolo | le azioni sono testo |
| Tetra-cube e altri generatori (JSON) | piccolo | idem |
| Fight Club / Game Master 5 (XML) | piccolo-medio | XML invece di JSON |
| attori di Foundry VTT (dnd5e) | grande | lo schema cambia con le versioni del sistema (le activities della 4.x): fragile |
| immagini, PDF scansionati | — | niente OCR: resta il prompt per un assistente |

Proposta: nessuno di questi finché non c'è un file vero da leggere.

### 5.3 Statblock 2024 (ST4)

Intestazione diversa («AC 15 Initiative +2 (12)», «HP», la tabella con MOD e SAVE, «CR 1/4 (XP 50; PB +2)») e le etichette del §3.4. Passa dall'opzione «Statblock 2024» che c'è già (fase 3, lotto 6) e si gioca con le regole 2014 del plugin.

### 5.4 Italiano (D2, ST6)

- Il Manuale dei Mostri italiano usa le stesse formule, tradotte, e le distanze in metri. Servono una tabella che riporti all'inglese le formule fisse (attacco, colpo, TS, metà danni, tipi di danno, condizioni, durate, aree), applicata prima del parser, e i metri in piedi (1,5 m ogni 5 piedi, come `monsterImportFeet()`).
- Lo Statblock originale dovrebbe restare in italiano: serve un record con le sezioni come le ha lette il parser, non la stampa inglese di 5eTools. È un cambio piccolo allo store, da decidere al lotto.
- Le reazioni in italiano non accendono gli avvisi finché non si traducono anche le regole di [monsterReactionParseCore.js](../src/monsterReactionParseCore.js).
- Va tarato su statblock veri: senza campioni, la tabella si indovina.

---

## 6. Come si misura

### 6.1 L'oracolo

`fiveToolsStatblockSections()` ([fiveToolsMonsterCore.js:566](../src/fiveToolsMonsterCore.js)) stampa un mostro di 5eTools come nel libro, in inglese e senza tag. Lo script `scripts/statblock-text-roundtrip.mjs` è fatto come [monster-heuristics-coverage.mjs](../scripts/monster-heuristics-coverage.mjs): i bestiari si passano da riga di comando e restano fuori dal repository. Per ogni mostro:

1. il blocco A con `fiveToolsMonsterToStatblock()`;
2. il testo: il nome e la stampa dello statblock;
3. il blocco B: il parser sul testo, poi `fiveToolsMonsterToStatblock()`;
4. il confronto campo per campo, senza `ref` e `source`.

Ogni campo esce **uguale**, **mancante** (A lo ha, B no) o **diverso** (B ha un valore sbagliato). La soglia di ST1 (D8): zero diversi, e i mancanti solo se il rapporto li nomina. Prima base: i 781 mostri di MM, Volo, Tomo dei Nemici e Icewind Dale già usati nel lotto 4b; poi tutti i bestiari del mirror.

L'oracolo misura il parser su testo pulito. Il rumore dei PDF e di D&D Beyond lo misurano i campioni veri (ST3).

### 6.2 Che cosa va sistemato nella stampa

Visto il 15/11 sui mostri SRD di `test-support/fivetools-srd-monsters.json`:

- **Difese:** la stampa unisce i gruppi con la virgola («cold, bludgeoning, piercing, slashing from nonmagical attacks that aren't silvered»), il libro con il punto e virgola («cold; bludgeoning, piercing, and slashing from …»). Con la virgola non si capisce a quali tipi vale la nota. La stampa si allinea al libro in ST1, e migliora anche ciò che il GM legge nella tab Statistiche (D10).
- **Soffi:** la stampa mette «Cold Breath. …» e «Paralyzing Breath. …» dentro il testo di «Breath Weapons», mentre il libro va a capo. Il parser deve leggere tutte e due le forme.
- **Nome e punteggi:** la stampa non ha il nome e mette i punteggi su una riga sola. Lo script aggiunge il nome; le altre disposizioni dei punteggi le coprono i test.

### 6.3 Test nel repository

- `test/monsterStatblockTextParse.test.js`: mostri inventati, come `invented()` nei test di 5eTools, e i sette mostri SRD della fixture stampati e riletti. Ogni trappola del §3.5 ha il suo caso.
- Nessun testo dei manuali nel repository: i campioni veri dell'utente restano fuori, e per ogni difetto trovato entra un mostro inventato che lo riproduce (D9).

---

## 7. Rischi, come chiede AGENTS.md

- **PF, barre HP, memoria PF:** nessun cambio. I PF arrivano da `hitPoints` come per 5eTools, con le stesse scritture.
- **Turno attivo, ordine, ID virtuali:** non si toccano.
- **Metadata:** nessuna chiave nuova e nessun valore nuovo (D4). La scheda ha la stessa forma di un import da 5eTools.
- **`initiativeList.js`:** non si tocca.
- **Numeri sbagliati:** è il rischio vero. Un bonus o una CD letti male arrivano nella console e nessuno se ne accorge. Le difese: formule rigide, la soglia «zero diversi» (D8), le sezioni da controllare prima di **Salva**.
- **Prestazioni:** il parser gira una volta, a **Leggi**, su al massimo 20.000 caratteri, con espressioni regolari senza quantificatori annidati sul testo intero: un incolla strano non blocca il pannello.
- **Stampa dello Statblock originale:** il punto e virgola (D10) cambia una riga che il GM legge; nessun dato salvato cambia.
- **Testo incollato:** si mostra come testo, come oggi, mai come HTML.

---

## 8. Lotti proposti

| Lotto | Contenuto | Tocca | Peso |
|---|---|---|---|
| **ST1** | parser inglese 2014: normalizzazione, intestazione, sezioni e voci, tag, incantesimi, leggendarie; lo script dell'oracolo; la stampa delle difese col punto e virgola | `src/monsterStatblockTextParseCore.js` (nuovo), la stampa delle difese in `fiveToolsMonsterCore.js`, `scripts/statblock-text-roundtrip.mjs`, test | grande |
| **ST2** | aggancio in Importa: riconoscimento a **Leggi**, riepilogo «Da testo», rapporto, profilo `manual`, record nella memoria del GM, avviso per l'italiano | `readSheetImport()` e una funzione gemella di `readFiveToolsMonster()` in `initiative-card-modal.js`, il segnaposto in `initiative-card-modal.html`, `IMPORT_SCHEDA.md`, `GUIDA_UTENTE.md`, `PROVE_IN_STANZA.md` | medio |
| **ST3** | testo vero: i campioni dell'utente (PDF, D&D Beyond, Markdown) e le correzioni che servono | parser, test | medio |
| **ST4** | statblock 2024 | parser, test | piccolo |
| **ST5** | Open5e, incollato o da file | `src/open5eMonsterCore.js` (nuovo), `readSheetImport()`, test | piccolo |
| **ST6** | italiano | parser, store dello statblock, test | grande |

ST1, ST2 e ST3 sono il nucleo e vanno in quest'ordine; ST4, ST5 e ST6 dipendono da D2 e D6. Ogni lotto ha test che falliscono senza la patch, la CI completa in una copia pulita e le voci in `PROVE_IN_STANZA.md`.

---

## 9. Che cosa resta al tavolo

- Immagini e PDF scansionati: niente OCR, resta il prompt per un assistente.
- Azioni di tana ed effetti regionali: solo da leggere, nel tratto «Testo non letto».
- Varianti e riquadri («Variant: …»): testo.
- Le frasi homebrew che non usano le formule del Manuale: nella nota, come oggi con 5eTools.
- Un PDF con le colonne mescolate male: il parser lo segnala, il GM corregge l'incolla.

---

## 10. Decisioni per l'utente

| # | Decisione | Possibilità | Raccomandazione | Esito (15/11) |
|---|---|---|---|---|
| D1 | Strada | (a) il parser produce un mostro nella forma di 5eTools e lo passa all'adattatore di oggi; (b) il parser scrive il formato del plugin con una sua lettura delle azioni | **(a)**: una sola lettura, il resto gratis, misurabile | approvata |
| D2 | Lingue e regole | (a) inglese 2014, poi 2024 (ST4) e italiano (ST6); (b) anche l'italiano subito | **(a)**, l'italiano solo con campioni veri | approvata |
| D3 | Dove si incolla | (a) nello stesso riquadro, riconosciuto a **Leggi**; (b) un pulsante «Testo» a parte | **(a)** | approvata |
| D4 | Fonte sul token | (a) `source: "manual"` e `ref: "Nome\|testo"`; (b) un valore nuovo `"text"` tra le fonti | **(a)**: nessun valore nuovo nei metadata, nessuna ricerca nei libri dell'archivio | approvata |
| D5 | Memoria del GM | (a) il mostro letto, come record `5etools`, più un tratto finale «Testo non letto»; (b) il testo incollato come blocco unico | **(a)**: Capacità mostra tratti, reazioni e leggendarie come voci separate, le leggendarie con il loro costo; con il blocco unico ha una voce sola | approvata |
| D6 | Open5e | (a) sì, incollato o da file, in ST5; (b) anche la ricerca online; (c) no | **(a)** | approvata |
| D7 | Altri formati | (a) solo con un file vero dell'utente; (b) subito Improved Initiative e Fight Club | **(a)** | approvata |
| D8 | Soglia di ST1 | (a) zero valori diversi, i mancanti solo se nel rapporto; (b) una percentuale di mostri identici | **(a)**: un numero sbagliato è peggio di uno mancante | approvata |
| D9 | Campioni veri | (a) 5–10 statblock incollati dall'utente in ST3, fuori dal repository; (b) solo l'oracolo | **(a)** | approvata |
| D10 | Stampa delle difese | (a) col punto e virgola come il libro, in ST1; (b) com'è | **(a)** | approvata |

---

## 11. Che cosa non fa questo studio

- Non scrive codice.
- Non cambia il formato del plugin né le regole che leggono le azioni.
- Non traduce: lo statblock resta nella lingua in cui è stato incollato.
- Non porta dati di mostri nel plugin: il testo lo porta il GM.
- Non tocca Take Initiative Standalone. Il parser sarebbe puro e senza Owlbear, quindi lì si potrà riusare, ma è un'altra decisione.

---

## 12. Lotto ST1: com'è andato (15/11)

### 12.1 Che cosa c'è

| File | Contenuto |
|---|---|
| `src/monsterStatblockTextParseCore.js` (nuovo) | `parseStatblockText()` → `{ monster, report, error }`, il mostro nella forma di 5eTools con `source: "testo"`; `looksLikeStatblockText()` per ST2; `isStatblockEntryName()` |
| `src/fiveToolsMonsterCore.js` | `defenseList()`: le difese e le immunità alle condizioni stampate come nel libro (D10); `hiddenWillUses()`: gli usi al giorno degli innati che l'intestazione nomina (§12.4, i mefiti) |
| `test/monsterSpellcasting.test.js` | un test per gli usi degli innati nominati nell'intestazione |
| `test-support/statblockTextPrint.js` (nuovo) | la stampa di un mostro di 5eTools in testo, per l'oracolo e i test; punteggi su una riga o su due |
| `scripts/statblock-text-roundtrip.mjs` (nuovo) | l'oracolo del §6.1, con il conto per campo; esce con 1 se c'è un valore diverso |
| `test/monsterStatblockTextParse.test.js` (nuovo) | 15 test: i sette mostri SRD stampati e riletti, e mostri inventati scritti come li copiano un PDF, D&D Beyond e Homebrewery |

### 12.2 La misura (D8)

Bestiari del mirror scaricati il 15/11, con il permesso dell'utente, fuori dal repository: MM, VGM, MTF e IDRotF. I mostri sono 815: il lotto 4b ne contava 781.

| Punteggi | Identici | Solo mancanti | Diversi |
|---|---|---|---|
| su una riga | 814 | 1 | 0 |
| su due righe | 814 | 1 | 0 |

L'unico mancante è Dzaan (IDRotF): due trucchetti che 5eTools tiene come incantesimi innati nascosti e che il testo stampato non nomina. Il rapporto del parser lo dice: «At will» senza incantesimi.

La CI completa è verde su un worktree di `a1fc4bef` con i soli file del lotto, mefiti compresi: verify:version, 6134 test, check:spells, build, checksums e verify:dist.

### 12.3 Regole aggiunte, trovate con l'oracolo

- **Un paragrafo intero:** una riga di 100 caratteri o più non è mai una colonna di un PDF. Dopo una riga così, una voce può cominciare anche senza punto finale (nei dati di 5eTools a volte manca, come in Cave Fisher). Dopo una riga corta senza punto, no: «… other than Celestials and» seguito da «Undead. A creature …» resta un solo tratto.
- **Senza punto prima:** una voce comincia anche quando il suo testo apre con un attacco («Javelin. Melee or Ranged Weapon Attack: …») o quando è un'altra Spellcasting.
- **Nomi lunghi:** fino a 120 caratteri con le parentesi, il controllo delle maiuscole fuori dalle parentesi («Psychic Screech (Hybrid Form Only; Recharges after a Short or Long Rest)»).
- **Il segno meno:** resta nel testo come nel libro («−1 penalty»), diventa «-» solo nei numeri che il plugin legge.
- **Incantesimi nell'intestazione:** «can cast disguise self and invisibility at will», «can innately cast sleep, requiring …», «misty step up to three times per day» diventano un elenco a volontà nascosto, come in 5eTools. La CD tra parentesi non entra nel nome, e i nomi con «and» restano interi (Detect Evil and Good).
- **Dopo una lista:** la frase che parla di tutte le voci («If the chosen option kills a creature, …», «Each breath weapon …») resta all'azione e non va nella nota dell'ultima voce. Ciò che una voce dice di sé («If this ray …») resta alla voce.
- **«30-» a fine riga:** con «foot cone» sulla riga dopo resta «30-foot cone»; una sillaba spezzata tra minuscole si unisce senza trattino.

### 12.4 Limiti e punti aperti

- **I mefiti, risolto il 15/11 su decisione dell'utente:** in «Innate Spellcasting (1/Day). The mephit can innately cast sleep», 5eTools tiene Sonno in un elenco a volontà nascosto, e fino a oggi l'import lo dava a volontà. Ora l'adattatore legge quante volte al giorno si lancia un incantesimo di un elenco nascosto: dall'«(1/Day)» del nome del blocco, se il blocco non ha elenchi al giorno, o dall'intestazione subito dopo il nome dell'incantesimo («misty step up to three times per day», «once per day»). Senza, resta a volontà. Vale per entrambe le strade, 5eTools e testo. Sui 815 mostri dei quattro bestiari cambiano solo sei blocchi: Dust, Ice, Magma, Smoke e Steam Mephit (1/giorno) e Sephek Kaltro (Passo velato 3/giorno).
- **Testo pulito:** l'oracolo misura testo pulito; il rumore vero lo misura ST3 con i campioni dell'utente. I test con mostri inventati coprono già righe spezzate, sillabe, legature, maiuscoletto, un punteggio per riga e il Markdown di Homebrewery.
- **Nessuna prova nel browser:** nessun banco apre la scheda personaggio con il finto SDK, e ST1 non ha interfaccia oltre alla riga delle difese, coperta da un test sul testo esatto. Le due prove in stanza, la riga delle difese del Barbed Devil e il Sonno 1/giorno del Dust Mephit, sono in [PROVE_IN_STANZA.md](PROVE_IN_STANZA.md), sezione B16.

---

## 13. Lotto ST2: com'è andato (15/11)

### 13.1 Che cosa c'è

| File | Contenuto |
|---|---|
| `src/monsterStatblockTextImportCore.js` (nuovo) | `statblockTextImport()`: il parser, poi l'adattatore di 5eTools; il blocco con `source: "manual"`, `ref: "Nome\|testo"` e senza ritratto (D4); il mostro letto per la memoria del GM (D5); il rapporto del parser e quello dell'adattatore; la riga «Da testo: …» |
| `src/initiative-card-modal.js` | `readSheetImport()`: un testo che non è JSON passa a `readTextImport()`, che carica il lettore solo allora. Uno statblock va nelle sezioni come uno di 5eTools; un testo qualsiasi ha l'errore del JSON di prima. Un contatore di letture fa sì che una lettura superata da una più nuova non scriva niente |
| `initiative-card-modal.html` | il segnaposto e l'etichetta del riquadro nominano il testo di uno statblock (D3) |
| `src/monsterStatblockTextParseCore.js` | i messaggi per l'italiano e per il 2024 rimandano al JSON di 5eTools e al prompt per un assistente |
| `test/monsterStatblockTextImport.test.js` (nuovo) | 3 test: il blocco e la sua origine, il riepilogo e il rapporto; il record per Statistiche, Capacità e avvisi di reazione; i rifiuti |
| `docs/IMPORT_SCHEDA.md`, `docs/GUIDA_UTENTE.md` | la sezione «Da testo» e il passo dell'import dei mostri |

### 13.2 La prova nel banco

Un banco della scheda personaggio con il finto SDK del banco Boss, su un worktree con i soli file del lotto, porta 5213, tolto dopo la prova. Con il testo del Frost Raider digitato nel riquadro, **Leggi** mostra le sezioni (Statistiche, Modificatori, Difese ai danni, Attacchi, Multiattacco, Note, Punti ferita, Rinomina), «Al tavolo» e la riga «Da testo: Frost Raider, 2 azioni registrabili, 1 da gestire al tavolo.». **Applica al modulo** riempie CA, percezione, velocità e note, e annuncia il testo dello statblock per dopo **Salva**.

**Salva** non si prova nel banco: prima di scrivere la scheda chiede il contesto della scena al coordinatore degli effetti, che vive nella pagina di sfondo del plugin, e il banco apre solo la scheda. Il record e la sua lettura (Statblock originale, Capacità, avvisi di reazione) sono coperti dai test; il resto va nella prova in stanza.

La CI completa è verde su un worktree di `22a25e43` con i soli file del lotto: verify:version, 6153 test, check:spells, build, checksums e verify:dist. Nella build il lettore è un pezzo a parte di 19 KB, caricato solo quando si incolla un testo.

### 13.3 Prove in stanza (in [PROVE_IN_STANZA.md](PROVE_IN_STANZA.md), sezione B19)

«Statblock da testo nel pannello Importa». Serve un nemico e uno statblock inglese delle regole 2014, copiato da un PDF o da D&D Beyond.

- **Leggi:** incolla il testo e premi **Leggi**: compaiono le sezioni e la riga «Da testo: …»; in **Al tavolo** ciò che resta al tavolo. **Applica al modulo** e **Salva**: il token prende nome, PF e attacchi.
- **Statblock originale:** Statistiche → **Statblock originale** mostra il mostro diviso in voci; in Capacità ci sono i tratti, le reazioni e le leggendarie; un mostro con Parry accende l'avviso di reazione.
- **I rifiuti:** un testo in italiano, o uno del 2024, dice perché non si legge e rimanda al JSON di 5eTools o al prompt per un assistente.
- **Da PDF:** lo stesso mostro copiato da un PDF, con le righe spezzate, dà le stesse azioni di quello copiato da D&D Beyond.

---

## 14. Lotto ST3, prima parte: le schede di Strahd Reloaded (15/11)

I primi campioni veri vengono dalla pagina «Non-Player Characters» delle appendici di Strahd Reloaded, un sito pubblicato con Obsidian. Sono 38 statblock di PNG, con il testo che il browser dà copiando la pagina. Restano fuori dal repository (D9): nei test entrano solo mostri inventati scritti nello stesso modo. PDF, D&D Beyond e Homebrewery/GM Binder vengono dopo, con i loro campioni.

### 14.1 Che cosa c'era di diverso

Sono statblock delle regole 2014 scritti a mano, con abitudini che i manuali non hanno:

- il trattino corto «–» al posto del segno meno: «9 (–1)»;
- la tabella dei punteggi copiata con le tabulazioni;
- sulla riga dopo il nome, un tipo senza la taglia;
- le etichette del 2024 in un blocco 2014: «Resistances», «Vulnerabilities», «Immunities» (danni e condizioni insieme, divisi dal punto e virgola), «Gear», «Initiative»;
- un'etichetta con il punto: «Proficiency Bonus. +3»;
- «Speed 40» senza unità, e «fly (hover) 30 ft.»;
- attacchi senza i due punti, o con una virgola («Melee Weapon Attack, +7 to hit»), con la distanza senza «reach» o con «range» anche in mischia;
- danni senza la media: «or take 2d6 fire damage»;
- la forma dopo il punto: «Knife. (Witch Form Only) Melee Weapon Attack …»;
- la Spellcasting fra le azioni, le azioni bonus o le reazioni;
- un paragrafo che apre una sezione: «The witch can take up to three reactions per round, …».

### 14.2 La misura

| Sui 38 blocchi | HEAD (dopo ST2) | ST3 |
|---|---|---|
| rifiutati | 0 | 0 |
| azioni registrabili | 103 | 117 |
| azioni al tavolo | 82 | 67 |
| righe non lette | 50 | 0 |
| blocchi con il tratto «Testo non letto» | 32 | 0 |
| TS registrati | 52 | 54 |
| di cui con metà danni al successo | 15 | 26 |

Le 67 azioni al tavolo ci restano per buoni motivi:
- incantesimi lanciati da un'azione che non dice né CD né bonus, perché stanno nel tratto Spellcasting;
- condizioni inventate dal sito;
- movimenti e spostamenti.

Le azioni bonus sono analizzate a parte nel §14.8.

L'oracolo non cambia: 815 mostri, 814 identici, 1 solo mancante (Dzaan, §12.2), 0 diversi, con i punteggi su una riga e su due.

### 14.3 Le correzioni del parser

- **F1, il trattino corto:** vale come segno meno nei punteggi, nei PF, nel bonus degli attacchi e in quello della Spellcasting.
- **F2, le etichette 2024:** Resistances, Vulnerabilities e Immunities si leggono come le etichette 2014. Immunities divide i gruppi al punto e virgola: quelli con un tipo di danno vanno fra le immunità ai danni, gli altri fra le condizioni. Gear e Initiative si riconoscono e restano fuori dalle azioni. Un'etichetta può finire con il punto, e due righe con la stessa etichetta si sommano.
- **F3, il tipo senza taglia:** si tiene il tipo; la taglia del token non cambia.
- **F4, la velocità:** il primo valore anche senza unità, e «(hover)» prima del numero.
- **F5, l'attacco:** senza i due punti o con la virgola. Per un attacco in mischia, la distanza sola o «range 5 ft.» è la portata; per uno a distanza, la distanza sola è la gittata.
- **F6, il danno senza media:** prende la media che stamperebbe il libro, così la formula si legge come le altre.
- **F7, la forma dopo il nome:** va nel nome, come in 5eTools: «Knife (Witch Form Only)». Un testo fatto solo di una parentesi, come «(testo omesso)», resta il testo.
- **F8, la Spellcasting in una sezione:** resta nella sua sezione, con `displayAs`, come fa 5eTools.
- **F9, il paragrafo che apre una sezione:** va nell'intestazione della sezione (`actionHeader`, `bonusHeader`, `reactionHeader`, come in 5eTools). Lo Statblock originale lo mostra come una voce senza nome, sia per il testo sia per 5eTools. Capacità e gli avvisi di reazione lo saltano.
- **F10, «… slashing damage»:** nelle difese la parola «damage» non diventa una nota.
- **F11, gli usi senza il punto (16/11):** «Finger of Death (1/day) Rahadin casts …» comincia una voce sua, invece di finire dentro la voce di prima. Vale solo a inizio paragrafo e solo con gli usi tra parentesi: «(1/day)», «(Recharge 5–6)», «(Costs 2 Actions)».

### 14.4 Le correzioni dell'adattatore e della lettura delle azioni: valgono anche per 5eTools

Alcune frasi delle schede sono anche nei bestiari di 5eTools. Per D1 la regola sta in un posto solo, l'adattatore ([fiveToolsMonsterCore.js](../src/fiveToolsMonsterCore.js)) o la lettura delle azioni ([monsterActionHeuristicsCore.js](../src/monsterActionHeuristicsCore.js)), quindi cambiano tutte e due le strade.

- **I piedi per intero:** «range 90 feet» si legge come «range 90 ft.».
- **Il colpo con «The target takes»:** «Hit: The target takes 22 (4d10) necrotic damage» si legge come «Hit: 22 (4d10) necrotic damage».
- **Le frasi del fallimento:** finora contavano la frase con la CD e quelle che aprono con «On a failed save» o «On a failure». Ora contano anche:
  - la frase con il danno del fallimento («A target takes 7 (2d6) fire damage on a failed save, …»);
  - quella su chi fallisce («A target that fails the save is also knocked prone»).

  Non conta mai la frase di un fallimento di 5 o più: resta nella nota, e la sua durata non passa alla condizione del fallimento.
- **Fino al TS seguente:** una seconda CD nella stessa azione appartiene a un altro TS (il muro del Diavolo del ghiaccio). Una CD tra parentesi dentro la frase «On a failure» invece no.
- **Il danno prima della CD:** in «On a hit, the target takes an extra 9 (2d8) lightning damage, and … DC 13 …» il danno arriva comunque, non solo col fallimento. La frase resta nella nota.
- **Le aree:**
  - «all» conta solo come parola intera: «magically», «wall» e «smaller» non danno più un'area;
  - «up to two creatures it can see within 40 feet of it» è una sfera di 40 piedi attorno al mostro.
- **La metà dei danni al successo (16/11):** oltre a «half as much damage» valgono «or half as much on a success», «or half damage on a success» e la frase di chi supera il TS: «A creature that succeeds on the saving throw takes half damage», «On a successful save, a creature takes half the damage». Non vale mai la metà di una cura, come «regains hit points equal to half the damage taken». La regola (`SAVE_HALF`) è la stessa per i TS delle azioni e per quelli al colpo. Prima la console avrebbe dato zero danni a chi superava il TS: nelle schede di Strahd succedeva in 8 TS, 6 dei quali in azioni bonus.
- **Una frase può aprire con una parentesi (16/11):** «… until the start of its next turn. (A dazed creature can move or act on its turn, not both. …)» ha due frasi. Prima la parentesi si attaccava alla frase con la CD, e nella nota ne arrivava solo l'ultimo pezzo.

Le due regole del 16/11 non cambiano niente nei quattro bestiari: le azioni, i blocchi e lo Statblock originale degli 815 mostri restano come con le regole del 15/11.

Sui quattro bestiari, HEAD contro ST3, cambiano 23 azioni su 815 mostri, tutte volute:
- **9 diventano registrabili:** Death Knight (Hellfire Orb), Fomorian (Evil Eye), Mind Flayer, Mind Flayer Arcanist e Mind Flayer Psion (Extract Brain), Ogre Chain Brute (Chain Sweep), Star Spawn Seer (Psychic Orb), The Lonely (Sorrowful Embrace), Zaratan (Spew Debris);
- **8 perdono un'area sbagliata:** Behir (Swallow), Djinni (Create Whirlwind), Ice Devil (Wall of Ice), Living Bigby's Hand, Slithering Tracker, Stone Giant Dreamwalker, Trapper, Wastrilith;
- **3 prendono l'area giusta:** Demilich (Life Drain), Sibriex (Warp Creature), Yuan-ti Pit Master (Merrshaulk's Slumber);
- **3 spostano il danno dal fallimento alla nota:** Air Elemental Myrmidon, Earth Elemental Myrmidon, Orthon (5. Paralysis).

**Rischi, come chiede AGENTS.md:**
- PF, barre HP, turno attivo, ordine e metadata non si toccano.
- I token già importati tengono le azioni che hanno: le regole nuove valgono al prossimo import.
- Lo Statblock originale si legge invece al momento. Un mostro di 5eTools con il paragrafo che apre una sezione lo mostra da subito, e nessun dato salvato cambia.

### 14.5 Che cosa c'è

| File | Contenuto |
|---|---|
| `src/monsterStatblockTextParseCore.js` | F1–F11 |
| `src/fiveToolsMonsterCore.js` | i piedi per intero, il colpo con «The target takes», le frasi del fallimento fino al TS seguente, il danno prima della CD nella nota, le aree, la metà dei danni al successo, la frase che apre con una parentesi, il paragrafo che apre una sezione nello Statblock originale |
| `src/monsterActionHeuristicsCore.js` | `FAILURE_SENTENCE` e `SAVE_HALF`, condivise con l'adattatore; le condizioni del fallimento fino al TS seguente; la durata senza il fallimento di 5 o più; la frase che apre con una parentesi |
| `test/monsterStatblockTextParse.test.js` | 2 test con una strega inventata scritta come le schede del sito: lettura del blocco con gli usi senza il punto, Statblock originale, Capacità e avviso di Parry |
| `test/fiveToolsMonster.test.js` | 1 test con azioni inventate per le frasi del TS, la metà dei danni al successo, la frase tra parentesi, le aree, il colpo con «The target takes» e i piedi per intero |

Dal 16/11 anche `src/pcAttackPickerCore.js` (`pcAttackActionActivation`), una riga di `src/pc-attack.js` e 2 test in `test/pcAttackPicker.test.js`: il costo delle azioni bonus nella console (§14.8).

I tre test falliscono con il codice di HEAD, e con quello del 15/11 per le regole del 16/11. La CI completa è verde su un worktree di `8641fd03` con i soli file del lotto: verify:version, 6175 test, check:spells, build, checksums e verify:dist.

### 14.6 Limiti e punti aperti

- **Incantesimi da un'azione:** quando la CD o il bonus stanno solo nel tratto Spellcasting, l'azione resta al tavolo. Leggerli da lì è un passo a parte, che vale anche per 5eTools: è la scelta D11 del §14.8.
- **TS senza danni né condizioni del Manuale:** restano al tavolo, come vuole la regola di oggi. Registrare il solo TS è la scelta D12 del §14.8.
- **Il resto di ST3:** PDF, D&D Beyond e Homebrewery/GM Binder, ciascuno con i suoi campioni.

### 14.7 Prove in stanza (in [PROVE_IN_STANZA.md](PROVE_IN_STANZA.md), sezione B25)

Le voci sono nuove: nessuna lista le aveva. Serve un nemico e una scheda della pagina dei PNG di Strahd Reloaded, copiata dal browser.

- **Una scheda del sito:** incolla la scheda in **Importa** e premi **Leggi**. La riga «Da testo: …» non nomina righe non lette, e fra i tratti non c'è «Testo non letto». Gli attacchi hanno bonus e portata, e i danni scritti senza media hanno la loro formula.
- **Le immunità:** in una scheda con «Immunities», i tipi di danno vanno in Difese ai danni e le condizioni fra le immunità alle condizioni.
- **Le sezioni:** in Statistiche → **Statblock originale**, il paragrafo che apre le reazioni sta prima delle reazioni, senza nome. In Capacità non è una voce. La Spellcasting resta nella sezione dove la scheda la mette.
- **Metà danni al successo:** in una scheda con un'azione bonus che dice «A creature that succeeds on the saving throw takes half damage», chi supera il TS nella console prende metà danni, non zero.
- **Werewolf Brawler:** dalla pagina Bestiary, importa il Werewolf Brawler. Nella scheda Attacchi della console c'è «Crushing Grip (bonus action)» con l'etichetta arancione **Azione bonus**, mentre le altre righe dicono Azione: TS di Costituzione CD 14, 3d6 contundenti, metà a chi lo supera. Da provare in vista compatta ed estesa.
- **Da 5eTools:** importa **Mind Flayer** (MM): Extract Brain si registra con 10d10 perforanti. Importa **Fomorian** (MM): Evil Eye si registra con 6d8 psichici e senza area.

### 14.8 Le azioni bonus (16/11)

La domanda dell'utente, prima del commit: perché le azioni bonus delle schede restano al tavolo.

**Nessuna regola a parte.** L'adattatore legge le azioni bonus con le stesse regole delle azioni (`fiveToolsActions`) e aggiunge «(bonus action)» al nome, sia per il testo sia per 5eTools. Come un'azione, una bonus resta al tavolo quando il testo non dà niente da registrare: né un attacco, né un TS con un danno o con una condizione del Manuale. Nella lista «Al tavolo» il nome porta «(bonus action)», e quel suffisso può sembrare il motivo, ma non lo è.

**La misura.** Nelle 38 schede le azioni bonus sono 79: 37 si registrano e 42 restano al tavolo. Con HEAD erano 78, con 34 registrate e 44 al tavolo; la 79ª è Finger of Death, che prima finiva dentro un'altra voce (F11).

| Perché restano al tavolo | Quante | Esempi |
|---|---|---|
| movimento e azioni standard: Scatto, Disimpegno, Nascondersi, Aiuto, salti | 12 | Leap, Swift Step, Cunning Action |
| trasformazioni ed effetti su di sé | 6 | Shapechange, Duplicate |
| incantesimi lanciati senza CD né danni nel testo | 7 | Darkness, Blur, Lightning Bolt, Finger of Death |
| incantesimi della congrega con un danno in più se il bersaglio fallisce il TS dell'incantesimo, ma senza la CD | 5 | Hold Person, Bestow Curse |
| TS con effetti inventati o a gradi | 8 | «dazed», un −1d4 al tiro successivo, effetti diversi per chi fallisce di 5 e di 10 |
| prova contrapposta, terreno, evocazione, danno in una frase fuori dalle formule | 4 | Insightful Fighting, Stonemelt, Animate Golems, Telekinetic Thrust |

**Errori trovati fra le azioni registrate, corretti il 16/11:**
- la metà dei danni al successo scritta come fa il sito (§14.4): 6 azioni bonus e 2 azioni normali avevano `half: false`;
- «Finger of Death (1/day)», senza il punto dopo il nome, finiva dentro Corrupted Command (F11);
- la frase tra parentesi che spiega «dazed» arrivava spezzata nella nota di Shrieking Souls (§14.4).

**La pagina Bestiary (16/11).** L'utente importava il Werewolf Brawler dalla pagina «Bestiary» delle appendici, 15 statblock, e l'azione bonus Crushing Grip non c'era nella console. Il motivo: il danno era scritto «… bludgeoning damage on a failure, and half as much damage on a success», con «on a failure» a metà frase. La lettura conosceva solo «on a failed save» a metà frase e «On a failure» a inizio frase; senza danno, e con «dazed» che non è una condizione del Manuale, l'azione restava al tavolo. Correzioni:
- **«on a failure» a metà frase** vale come «on a failed save», sia per le frasi del fallimento sia per la nota. Non vale mai nella frase del TS ripetuto («The target can repeat the saving throw …, or taking 11 (2d10) psychic damage on a failure»): senza questa esclusione lo Yuan-ti Nightmare Speaker di 5eTools avrebbe sommato due volte il danno.
- **Il bersaglio prima della portata:** «+6 to hit, one target, reach 5 ft.» (lo Slam degli oggetti animati) torna nell'ordine del libro. Prima lo Slam non era un attacco: in un caso finiva al tavolo, nell'altro diventava un TS senza il danno del colpo.

Sulla pagina Bestiary: 26 azioni registrabili e 10 al tavolo, 0 righe non lette. Le schede dei PNG restano come sopra. Nei quattro bestiari di 5eTools cambiano le stesse 23 azioni del §14.4, nient'altro. Crushing Grip, dopo un nuovo import, sta nella scheda **Attacchi** della console come «Crushing Grip (bonus action)», con TS di Costituzione CD 14, 3d6 contundenti e metà al successo. Capacità mostra solo, da leggere, tratti, reazioni e leggendarie.

**Il costo nella console (16/11).** Nell'elenco degli Attacchi ogni riga diceva «Azione», anche per le azioni bonus. Ora la console legge il «(bonus action)» che l'import mette in fondo al nome, per il testo come per 5eTools: la riga dice **Azione bonus**, in arancione come le altre azioni bonus della console. Il segno sta già nel nome salvato sul token, quindi non serve un campo nuovo nei metadata, e la modifica della scheda non lo perde. La regola è `pcAttackActionActivation()` in [pcAttackPickerCore.js](../src/pcAttackPickerCore.js), e `rowCost` in [pc-attack.js](../src/pc-attack.js) la usa. Provato nel banco con il finto SDK, da una copia pulita sulla porta 5216: il Werewolf Brawler incollato come testo, salvato e aperto nella console mostra «Lob · Azione» e «Crushing Grip (bonus action) · Azione bonus», senza errori. Il plugin non conta le azioni del turno (l'economia d'azione è stata scartata il 23/10), quindi a parte l'etichetta non cambia altro.

**Il controllo prima del commit (16/11).** L'utente ha chiesto se adesso tutte le azioni bonus si leggono e si importano bene. Il controllo, sulle 53 schede delle due pagine, ha seguito ogni azione bonus dal testo all'etichetta nella console:
- 84 azioni bonus nel testo, 84 lette in `monster.bonus`;
- 38 registrate e 46 al tavolo, per i motivi della tabella sopra;
- tutte e 38 arrivano nella scheda con il nome intero (il più lungo è di 60 caratteri, la scheda ne tiene 80), e la console le segna «Azione bonus».

Le 38 registrate sono state rilette una per una contro il loro testo: CD, caratteristica, dadi, tipi, metà danni, usi e ricarica sono giusti. Il controllo ha trovato quattro difetti, corretti:
- **«falling prone»:** «taking 9 (2d8) bludgeoning damage and falling prone on a failure» (Tail Swipe) perdeva il prono;
- **l'area su un punto:** «to a point within 30 feet … within 5 feet of that point» (Wisplight Flare) metteva l'area attorno al mostro; ora sono sul punto anche «of that point», «to a point» e «centered on that point»;
- **le aree scritte in altro modo:** «within 10 ft. of that point», «10-foot radius sphere» senza trattino, «within a 5-foot radius of …», «a 5-foot-wide, 100-foot-long beam»;
- **il titolo al singolare:** sotto «Bonus Action», o «Reaction», le voci diventavano azioni normali. Ora i titoli valgono anche al singolare.

Queste regole cambiano 5 azioni di 5eTools in più, tutte in meglio. Devourer (Soul Rend) e Vine Blight (Entangling Plants) prendono l'area attorno al mostro. Hellfire Engine (Thunder Cannon) ha l'area sul punto, non più attorno a sé. Jackalwere (Sleep Gaze) si registra: privo di sensi per 10 minuti, perché il testo dice «falling unconscious». Flail Snail (Scintillating Shell) prende il raggio di 30 piedi della luce. In tutto le azioni di 5eTools cambiate rispetto a HEAD sono 28.

Per il JSON scritto a mano o da un assistente non c'è un campo per le azioni bonus. Vale il nome, e [IMPORT_SCHEDA.md](IMPORT_SCHEDA.md) lo dice: "(bonus action)" o "(azione bonus)" in fondo.

Restano due limiti, senza numeri sbagliati:
- **Aree solo approssimate:** Wind Strike colpisce lungo un percorso, e il plugin gli dà una sfera attorno al mostro.
- **Effetti a gradi nella nota:** gli effetti di chi fallisce di 5 o di 10 restano nella nota, e così i «dazed» e gli «slowed» del sito.

La CI completa è verde su un worktree di `8641fd03` con i soli file del lotto: 6176 test. Una prima corsa aveva fallito su `spellAreaPlacementClient.test.js`, un test di tempi che non tocca questi file: da solo passa cinque volte su cinque, e la corsa intera dopo è verde.

**Due scelte aperte, per un lotto a parte.** Toccano anche 5eTools.

| # | Scelta | Possibilità | Raccomandazione |
|---|---|---|---|
| D11 | Incantesimi lanciati da un'azione (12 azioni bonus, più azioni normali come Lightning Bolt) | (a) prendere la CD e il bonus dal tratto Spellcasting della scheda e le regole dell'incantesimo dal catalogo: «Morgantha casts lightning bolt» diventa un fulmine con la CD della congrega, e il danno in più della congrega si somma; (b) lasciarle al tavolo come oggi | **(a)**, come lotto a sé dopo ST3 |
| D12 | TS senza danni né condizioni del Manuale (8 azioni bonus) | (a) registrare il solo TS con l'effetto nella nota: la console tira i TS e dice chi fallisce, e di quanto; (b) lasciarli al tavolo, come vuole la regola di oggi | **(a)**: sono tiri da fare per più bersagli, e l'effetto resta al tavolo |

L'utente ha scelto **(a)** per tutte e due il 16/11, chiedendo per D12 una pill su chi fallisce. Com'è andata: §15.

---

## 15. D11 e D12: com'è andata (16/11)

### 15.1 D12: il TS con un effetto che non è una condizione

Un'azione con un TS, senza dadi di danno e senza una condizione del manuale («dazed», «subtract 1d4 from their next attack roll», «disadvantage on attack rolls…»), non resta più al tavolo:
- l'adattatore la registra con il suo TS, la sua area e la sua ricarica, e mette in `onFail.effect` il testo dell'azione (fino a 400 caratteri), con la durata e il TS ripetuto che la frase del fallimento dice;
- la scheda tiene la pill: `onFail.condition` è il nome dell'azione senza «(bonus action)», `onFail.effect` il testo;
- la console, su chi fallisce, mette una pill con quel nome e il testo come descrizione, con la sua scadenza («fino all'inizio del prossimo turno del mostro»). La nota dell'area dice «chi fallisce prende «Horrific Screech» …». A chi supera non succede niente.

La pill è una condizione personalizzata, come quelle che aggiunge il GM, non un effetto (`effectKind`): la card mostra gli effetti solo se vengono da un incantesimo, e una pill di un'azione di un mostro sarebbe sparita. Il testo è nel tooltip della vista compatta, nella nota della console e nello Statblock originale; nella vista estesa la pill mostra il nome. Il tooltip della vista estesa non l'ho toccato, perché vale anche per condizioni di incantesimi che oggi vanno bene.

Resta al tavolo un TS con dadi di danno che il plugin non legge («When the object strikes something, … take 13 (3d8)»), perché registrare il solo TS farebbe sparire quel danno senza dirlo: è il caso dell'Hydroloth (Steal Memory) e del Banshee (Wail).

Una lista di effetti sotto la frase con la CD, senza tiri propri (lo Sguardo di Demogorgon), resta una sola azione: prima il testo la divideva in voci senza CD.

### 15.2 D11: l'azione che lancia un incantesimo

Un'azione che lancia soltanto un incantesimo diventa un incantesimo innato della scheda (un'azione rapida ⚡):
- gli usi vengono dal nome («(2/day)»), il livello da «at 3rd level», la CD e il bonus dal testo («(DC 15)», «(+8 to hit)») se la scheda non ne ha;
- il rapporto dice «X: incantesimo innato y», più il danno in più della congrega («il danno in più (2d4 psichici) resta da aggiungere al tavolo»), la ricarica e «il resto del testo resta al tavolo» quando l'azione dice altro;
- senza nessuna CD, né sulla scheda né nel testo, il rapporto chiede di scriverla in Statistiche;
- la scheda trova l'incantesimo nei libri del plugin e nomina quelli che non trova (Crown of Madness, Phantasmal Force, Cause Fear, Ray of Sickness, Zephyr Strike, Wrath of Nature non sono nell'SRD).

Restano al tavolo una scelta fra più incantesimi («longstrider, darkvision, or cordon of arrows», «a spell it knows»), un lancio con una condizione («If Ludmilla is concentrating on grease, she casts web») e un'azione con numeri propri che l'incantesimo non tirerebbe («casts thorn whip (+8 to hit), dealing 10 (3d6) piercing damage», «takes 18 (4d8) thunder damage instead»).

Il danno in più della congrega non si somma: un incantesimo innato del plugin non porta un danno aggiunto. Il rapporto lo dice; sommarlo davvero è un lavoro a parte.

### 15.3 La misura

| | Prima di D11 e D12 | Dopo |
|---|---|---|
| PNG: azioni registrabili / al tavolo | 117 / 67 | 125 / 37, più 25 incantesimi innati |
| Bestiary: azioni registrabili / al tavolo | 26 / 10 | 26 / 7, più 3 incantesimi innati |
| Azioni bonus: registrate / al tavolo / innate | 38 / 46 / 0 | 45 / 28 / 11 |
| 5eTools, quattro bestiari | | 48 azioni prima al tavolo ora registrate con la pill (soffi del rame, del bronzo e dell'oro, i raggi dei beholder, Sleep Gaze…); 2 «casts darkness» innati |
| Oracolo | 814 / 1 / 0 | 814 / 1 / 0 |

The Nightmare Three, tre megere in un solo statblock, arrivano a 9 azioni registrabili: la scheda ne tiene 8 e l'import lo dice («1 azioni oltre il limite di 8 attacchi»). Il limite non l'ho cambiato.

Provato nel banco con il finto SDK, da una copia pulita: Anastrasya incollata come testo, Horrific Screech dalla console su Dars con il TS fallito. Su Dars c'è la pill «Horrific Screech (I)», che scade all'inizio del prossimo turno del mostro. La CI completa è verde su HEAD con i soli file di D11 e D12: 6226 test.

Le prove in stanza sono in [PROVE_IN_STANZA.md](PROVE_IN_STANZA.md), sezione B26.

---

## 16. Lotto ST3, seconda parte: il testo dei PDF (16/11)

### 16.1 I campioni

I PDF inglesi dell'utente con statblock delle regole 2014, fuori dal repository (D9), letti con `pdftotext` come un copia-incolla da un lettore PDF: **The Book of Fiends** (175 statblock), **Flee, Mortals!** di MCDM (340) ed **Encounters in Avernus** (19). Ogni blocco è tagliato come lo copierebbe un GM: dal nome alla fine delle azioni. Monsters of Drakkenheim usa le regole 2024 (ST4); in Emirikol's Guide to Devils gli statblock sono immagini, senza testo.

### 16.2 Che cosa c'era di diverso

- le etichette di seguito sulla stessa riga: «Armor Class 15 (natural armor) Hit Points 97 (15d8 + 30) Speed 30 ft.», «Saving Throws … Skills … Damage Resistances …», e la riga dopo che continua l'etichetta e ne apre altre;
- i punteggi spezzati e in ordine diverso: «Str 16 (+3)», «Dex 13 (+1)», «Con Int Wis 14 (+2) 19 (+4) 8 (−1)», «Cha 16 (+3)», a volte con il tipo in mezzo;
- il tipo dopo l'armatura o dopo la velocità, o sulla stessa riga del primo tratto («Medium fiend (devil), lawful evil Devil's Sight. …»);
- i titoli spaziati dal PDF («Ac t ions»), anche in fondo a un'altra riga;
- con le colonne mescolate, il titolo delle azioni sopra l'armatura;
- la legatura «fl» di «fly» persa, o tenuta come carattere del font (U+E002);
- in Flee, Mortals!: «CR 1 Brute 200 XP», che il parser prendeva per l'intestazione 2024 e rifiutava; «Companion», «Retainer» e «450 XP» fra il tipo e l'armatura; «Melee Power Attack».

### 16.3 Le correzioni del parser

- **P1, le etichette:** una riga dell'intestazione si divide prima di ogni etichetta scritta come tale («Hit Points», «Speed», «Senses»…), della sfida di MCDM («CR 4 Artillery») e del tipo («Large fiend»). Il primo pezzo, se non è un'etichetta, continua quella di prima.
- **P2, i punteggi:** le righe di punteggi più avanti nell'intestazione si uniscono alle prime. Si leggono i valori in ordine, con il controllo che ogni modificatore corrisponda al punteggio: se non torna (alcuni PDF hanno refusi, come «Str 8 (−2)»), i punteggi restano non letti e il rapporto lo dice.
- **P3, il tipo fuori posto:** dopo la velocità, dopo i punteggi, o attaccato al primo tratto, se la seconda riga non era il tipo. Un allineamento rimasto solo («lawful evil») non va nelle etichette.
- **P4, i titoli spaziati:** «Ac t ions» in fondo a una riga va su una riga sua. Un titolo sopra l'armatura (le colonne mescolate) si mette da parte: le azioni cominciano al primo Multiattack o al primo attacco.
- **P5, MCDM:** «CR 1 (XP 200; PB +2)» resta il segno del 2024, «CR 1 Brute 200 XP» no; la sfida si legge dal ruolo. «Companion», «Retainer» e «N XP» si saltano. «Melee Power Attack» e «Ranged Power Attack» si leggono come attacchi con incantesimo.
- **P6, «fly»:** nella velocità, una «y» davanti al numero, con o senza un carattere del font davanti, è «fly».

### 16.4 La misura

| PDF | Blocchi | Rifiutati | Registrabili | Al tavolo | Righe non lette |
|---|---|---|---|---|---|
| The Book of Fiends, prima | 175 | 6 | 264 | 68 | 220 |
| The Book of Fiends, dopo | 175 | 0 | 277 | 104 | 35 |
| Flee, Mortals!, prima | 340 | 330 | 0 | 4 | 1 |
| Flee, Mortals!, dopo | 340 | 0 | 592 | 213 | 117 |
| Encounters in Avernus, prima | 19 | 0 | 30 | 10 | 23 |
| Encounters in Avernus, dopo | 19 | 0 | 30 | 10 | 1 |

Le azioni al tavolo di The Book of Fiends crescono perché ora si leggono blocchi che prima si fermavano all'intestazione. Un campione delle azioni registrate, riletto contro il testo, ha bonus, portata, gittata, dadi e tipi giusti.

Restano non lette, e il rapporto le nomina:
- in The Book of Fiends, le righe dell'altra colonna mescolate nell'intestazione: il PDF le mette lì e il parser non può sapere a chi appartengono;
- in Flee, Mortals!, le abilità dei Retainer e dei Companion, «Athletics +3 plus PB»: crescono con il livello del PG, non sono numeri;
- i punteggi con un refuso del libro.

I nomi spaziati dal PDF («Vl og a r», «Mast e r o f t he») restano come sono: il GM li corregge in **Rinomina** prima di **Salva**.

L'oracolo non cambia: 814 identici, 1 mancante, 0 diversi, con i punteggi su una riga e su due. Le schede di Strahd Reloaded non cambiano. I tre test nuovi, con mostri inventati scritti come i tre libri, falliscono senza la patch. La CI completa è verde su `50b96ef6` con il solo lotto: 6241 test.

### 16.5 GM Binder (16/11)

I campioni dell'utente: il Markdown del modello 2014 dell'editor di GM Binder e una pagina condivisa (gli statblock degli NPC del Manuale del Giocatore, 17 statblock), presa come la copia il browser dalla pagina già disegnata. Il parser li legge già tutti, senza correzioni nuove: 0 rifiutati, 22 azioni registrabili, 3 al tavolo (Commander's Strike, Cloak of Shadows, Divine Sense, senza tiri), 0 righe non lette. La sfida e il bonus di competenza sulla stessa riga («**Challenge** 1 (200 XP) **Proficiency Bonus** +2») si dividono con P1. Altre 5 «Armor Class» della pagina sono elenchi di modifiche alle varianti, non statblock. Un test con un mostro inventato prova le due forme, il Markdown e il testo copiato.

**Il modello «2024» di GM Binder.** Il post di Reddit l'ha incollato l'utente, perché reddit.com non risponde agli strumenti. Ha l'aspetto del 2024 con le regole del 2014:
- **l'aspetto del 2024:** «AC 15 Initiative +1 (11)», la tabella dei punteggi con le colonne MOD e SAVE, «CR 1 (200 XP)» o «CR 1 (XP 200; PB +2)», il titolo «Traits»;
- **le regole del 2014:** le azioni dicono «Melee Weapon Attack: +4 to hit»;
- **HTML nel Markdown:** `<div class="statblock">`, `<span>`, `<br/>`, `&nbsp;` e un blocco `<style>`.

Prima il parser lo rifiutava come statblock 2024, guardando l'intestazione. Ora le regole del 2024 si riconoscono solo dalle azioni («Melee Attack Roll:», «Dexterity Saving Throw: DC 13»), che restano rifiutate fino a ST4. L'intestazione del 2024 si legge:
- «AC», «HP» e «CR» come etichette;
- «Initiative» staccata dall'armatura;
- i punteggi «STR 14 +2 +2» con il controllo del modificatore; i TS diversi dal modificatore diventano i TS della scheda;
- la riga «MOD SAVE» saltata, «Traits» come titolo dei tratti, l'HTML tolto, una riga per ogni `<br/>`.

Due difetti trovati in questo passo e corretti:
- **Il riconoscimento nel pannello Importa** (`looksLikeStatblockText`) voleva un numero subito dopo l'etichetta, quindi non riconosceva «**Armor Class** 12» né «**AC** 15»: il Markdown di GM Binder e di Homebrewery sarebbe finito nell'errore del JSON, anche se il parser lo leggeva. Ora accetta il grassetto fra l'etichetta e il numero.
- **La riga di allineamento di una tabella** con due trattini («|:--:|») restava come riga non letta.

### 16.6 Ezmerelda e le armi magiche di Strahd Reloaded (16/11)

Nella scheda di Ezmerelda d'Avenir (pagina Non-Player Characters) non si registrava nessun attacco. Il sito scrive le armi senza spazio dopo il punto del nome, «Rapier +1.Melee Weapon Attack: +7 to hit», e mette il bonus dell'arma nel nome. Il parser non riconosceva l'inizio della voce, quindi le quattro armi finivano nel testo del Multiattack. Le correzioni:
- **Il nome attaccato all'attacco:** «Nome.Melee Weapon Attack» apre una voce, ma solo se dopo il punto comincia un attacco (`entryStart`).
- **Il bonus nel nome:** «+1», «+2» sono parole valide del nome di una voce (`isStatblockEntryName`).
- **Un incantesimo preparato lanciato da un'azione:** «Cast Spell. Ezmerelda casts zephyr strike.» (azione bonus) non aggiunge più una copia innata dell'incantesimo, che si lancerebbe senza slot. Resta fra i preparati, e il rapporto dice «tra gli incantesimi preparati (con gli slot)» (`withCastSpells`, decisione D11).

La misura sulle pagine di Strahd Reloaded: nei personaggi le azioni registrabili passano da 125 a 131. Ezmerelda ne ha 4 invece di 0, e i due Vladimir Horngaard guadagnano la Greatsword +2. Il Bestiario, i tre PDF e la pagina di GM Binder non cambiano, e l'oracolo resta 814 / 1 / 0. Il test nuovo usa un mostro inventato (Mirela Vask).

### 16.7 Che cosa resta di ST3

D&D Beyond: chiede l'accesso, quindi niente download; serve il testo copiato dall'utente da 2–3 pagine di mostri. Homebrewery usa lo stesso Markdown di GM Binder, con i suoi blocchi `{{monster,frame}}`: già coperto dai test di ST1, da confermare con un link vero se l'utente ne ha uno.

Le prove in stanza della seconda parte sono in [PROVE_IN_STANZA.md](PROVE_IN_STANZA.md), sezione B32.

## 17. La Wizard of Wines: azioni bonus e reazioni con effetti veri (27/11)

Richiesta dell'utente: collegare a effetti veri nel VTT le azioni bonus e le reazioni dei druidi della Wizard of Wines (Arc J di Strahd Reloaded) e comporre lo statblock di Lorghoth the Decayer. Prima di questo passo, Gift of the Gulthias e Speed of the Adder si leggevano bene, ma solo come testo nella scheda Capacità della console.

### 17.1 Lorghoth

La pagina non ha uno statblock di Lorghoth: lo descrive come un Druid Naturalist con 136 PF, senza Gift of the Gulthias, con Indomitable, Master of Blights e Guardian of the Gulthias (con Mulchform). Lo statblock composto da queste regole si importa senza errori né righe perse; i dadi dei PF non sono scritti, quindi resta solo 136. Il testo è fuori dal repository (D9), come quelli dei druidi.

### 17.2 Che cosa fa ora il plugin

- **Gift of the Gulthias** («In response to being attacked by a creature it can see, the druid casts barkskin, provided it has a 2nd-level spell slot available. (The spell doesn't require concentration when cast in this way.)»): una reazione di un tipo nuovo, `cast-when-attacked` (`monsterReactionParseCore.js`). Negli avvisi di reazione compare quando il GM segna Colpito, come Scudo: «Lancia Pelle coriacea (slot di 2°)». **Usa** lancia l'incantesimo sul mostro con il motore degli incantesimi, senza concentrazione, e spende lo slot e la reazione nello stesso comando (`monsterReactionRuntime.js`): un Annulla restituisce tutto. Non compare con l'incantesimo già attivo, senza slot del livello, senza l'incantesimo nel libro o con la reazione usata. Lo stesso pulsante c'è nella scheda Capacità della console del mostro. La lettura è generale: vale per ogni «In response to being attacked …, X casts Y».
- **Speed of the Adder** («casts a spell it knows with a casting time of 1 action»): nella scheda Capacità, un menu degli incantesimi del libro con tempo di lancio di 1 azione e **Lancia come azione bonus**, che lancia come il menu 🪄. Per il resto del turno, la scheda Incantesimi avvisa che resta solo un trucchetto da 1 azione. L'avviso vive nella memoria della console: niente si scrive e niente si blocca, quindi non è un conteggio di turno a mano.
- **Guardian of the Gulthias** («polymorphs into a shambling mound for 1 minute … retains his game statistics (including his hit points), spellcasting abilities»): una reazione di tipo `form-when-targeted` e un tipo nuovo di forma, `monster-form` (`MONSTER_FORM_TEMPLATE`): tiene i PF (`hitPoints: "own"`, nessuno scambio di PF), la mente, le capacità e gli incantesimi; dalla forma vengono CA, Forza e Destrezza, velocità, difese, sensi, attacchi e taglia del token. Nessun limite di tipo o GS: la forma la dice lo statblock. Si sceglie una volta con il campo «Forma» della Forma Selvatica, nella scheda Capacità della console del mostro (con «Usa e salva» resta tra le forme rapide); poi **Assumi la forma** o l'**Usa** dell'avviso la applicano per i minuti del testo, con la reazione.

### 17.3 Le scelte fatte, da rivedere

- **G-1. Quando compare Gift of the Gulthias:** al Colpito, come Scudo, non prima del tiro. Il plugin non vede l'attacco prima che il GM ne segni l'esito; il GM confronta il tiro con la CA nuova.
- **G-2. Speed of the Adder:** l'avviso non si salva (sparisce se la console si chiude) e non blocca nulla.
- **G-3. Guardian of the Gulthias:** la forma viene dalle forme rapide della scheda, scelta una volta; l'uso 1/giorno non si conta (resta al tavolo).
- **G-4. Le reazioni che tengono i PF:** solo una forma con «retains … (including his hit points)» diventa `monster-form`; una che prende i PF della forma resta testo.

### 17.4 Che cosa restava

Indomitable, i tre trucchetti dei druidi (thorn whip, gust, infestation) e «In response to taking damage, Ludmilla casts misty step»: fatti nel passo dopo, §17.5.

### 17.5 Reazioni al danno, Indomitable, trucchetti (27/11, secondo passo)

- **I trucchetti:** c'erano già nel catalogo con il nome italiano (Frusta di Spine del PHB, Folata e Infestazione di Xanathar), ma lo statblock li scrive in inglese e solo gli incantesimi dell'SRD si trovavano anche per nome inglese. `spells-srd.js` ha ora una piccola tabella di nomi inglesi per la sola ricerca (`ENGLISH_LOOKUP_NAMES`, mai mostrati): i tre trucchetti, più snare, zephyr strike e cordon of arrows di Ezmerelda e Absorb Elements. Druidi, Lorghoth ed Ezmerelda si importano senza incantesimi non trovati; Frusta di Spine e Infestazione sono trucchetti della console. Le pagine del capitolo nei nostri dati non bastano per abbinare in automatico tutti i 157 incantesimi fuori dall'SRD: gli altri nomi inglesi restano da aggiungere quando servono.
- **«In response to taking damage, X casts Y»:** un tipo di reazione `cast-when-damaged`, nell'avviso dopo il danno (quando il GM preme Registra). Senza uno slot nel testo, l'incantesimo viene dalla reazione stessa: niente slot, niente libro. Un incantesimo da posare sulla mappa (un'area, un teletrasporto come Passo velato) apre il pannello incantesimi senza slot, con l'origine `monster-reaction`, che fa spendere al pannello la reazione con il lancio; gli altri si applicano subito, come Gift of the Gulthias.
- **Indomitable:** un tipo `repeat-save`, nella scheda Capacità della console del mostro: elenca gli effetti su di lui con un tiro salvezza da ripetere (le pill con un promemoria di TS, con abilità e CD: `monsterRepeatSaveCore.js`), con **Superato** e **Fallito**. Il risultato passa dalla stessa risoluzione dei promemoria: Superato toglie l'effetto e chiude l'incantesimo. Poi spende la reazione, in una voce della Cronologia sua. Non c'è nell'avviso di reazione: il plugin non ha un avviso per «un nemico finisce il turno».

Prove al banco: Misty Step dall'avviso (Ludmilla spostata, reazione usata, nessuno slot), Indomitable contro Blocca persone (Paralizzato tolto, concentrazione di chi lancia chiusa), i trucchetti nella console del Druid Naturalist. Le prove in stanza sono in [PROVE_IN_STANZA.md](PROVE_IN_STANZA.md), sezione B72.

Prove al banco (27/11): Gift dall'avviso e Annulla, Speed of the Adder con Onda tonante, Guardian dalla console e dall'avviso, fine della forma con i PF invariati. Le prove in stanza sono in [PROVE_IN_STANZA.md](PROVE_IN_STANZA.md), sezione B71.
