# Studio: statblock da testo e da altre fonti

Data: 15 novembre 2026. Stato: **approvato**; ST1 fatto il 15/11, non ancora committato (§12). Base dello studio: `main` a `617c6353`.

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
