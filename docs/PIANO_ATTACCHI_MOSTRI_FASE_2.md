# Attacchi dei mostri — fase 2: JSON di 5eTools (piano)

Stato: **approvato il 26/10/2026**, lotti 1–3 implementati.

Decisioni confermate: entrambi gli input (JSON di un mostro e file bestiario); nomi in inglese; difese condizionali segnalate e non importate; leggendari dentro la fase 2 (lotto 4); testo completo dello statblock dopo la fase 2 (lotto 5 rimandato); bestiari 2024 rifiutati.

## Deviazioni dal piano emerse in implementazione

- **Lotto 1, copertura reale.** Con l'adapter vero, letto poi dall'import della scheda: Manuale dei Mostri 75% di azioni piene e 12% parziali, nessun crash e nessun mostro scartato dall'import; Volo 74/13; Tomo dei Nemici 67/15; Mostri del Multiverso 63/12 (lì anche gli incantesimi e le azioni bonus stanno tra le azioni, al tavolo); Icewind Dale 82/7 sui 52 mostri non derivati. Il Manuale dei Mostri 2025 (503 mostri) è rifiutato per intero.
- **Lotto 1, TS letti solo dal fallimento.** Le componenti di danno di un'azione a TS vengono solo dalla frase con la CD e da quelle che iniziano con «On a failed save» / «On a failure»: un'azione che fa danni a chi supera (il Lamento della banshee) resta al tavolo invece di essere letta a rovescio. La nota tiene solo le frasi dopo la CD che non sono esiti (ripetere il TS, immunità di 24 ore).
- **Lotto 1, azioni bonus** (`bonus[]`) lette come le azioni, con « (bonus action)» nel nome; reazioni, tratti, azioni leggendarie e incantesimi elencati nel rapporto.
- **Lotto 2, risultato.** Con i bestiari di Icewind Dale, Manuale dei Mostri e Volo caricati insieme, 30 derivati su 31 si risolvono (48 azioni: 42 piene, 3 parziali, 3 al tavolo); la Chwinga deriva da Tomb of Annihilation e il messaggio chiede quel bestiario. Ignorate e segnalate: `addSkills` (4) e i `_templates` di razza (Mountain Dwarf, Tiefling).
- **Lotto 2, regole.** I campi propri del derivato sostituiscono quelli della base; `replaceTxt` cambia il testo delle voci, mai i loro nomi; con `*` vale per tratti, azioni, azioni bonus, reazioni, leggendarie, mitiche e incantesimi. Catene fino a 5 livelli, i cicli si rifiutano; una base delle regole 2024 rifiuta il derivato (il libro del derivato non basta a capirlo). La base si cerca per nome e libro senza distinguere le maiuscole.
- **Lotto 3, interfaccia.** Nel pannello **Importa**: **Carica file** (uno o più `.json`, un file non leggibile è nominato), il JSON di 5eTools si può anche incollare in **Leggi** (un mostro solo si legge subito). L'elenco mostra «Nome (LIBRO)», «· derivato» per i `_copy`, con ricerca per parole su nome e libro (al massimo 200 voci, poi «affina la ricerca»); i mostri delle regole 2024 sono esclusi dall'elenco e contati. Sopra le sezioni: «Da 5eTools (MM): Ghoul, 1 azione registrabile, 1 con il tiro salvezza al colpo nella nota.» e un riquadro «Al tavolo» con il rapporto dell'adapter. I file restano in memoria finché dura la modifica della scheda. Il profilo del mostro tiene `ref: "nome|libro"`.
- **Lotto 1, fixture.** `test-support/fivetools-srd-monsters.json`: sette mostri dell'SRD 5.1 (CC-BY-4.0, con attribuzione), ridotti ai campi letti; i casi limite usano mostri inventati.

Fase 1 chiusa il 26/10/2026 ([piano](PIANO_ATTACCHI_MOSTRI_FASE_1.md)): la
scheda importa uno statblock nel formato del plugin e la console lo esegue.
La fase 2 aggiunge un **adapter**: legge il JSON di 5eTools e lo traduce in
quel formato, così l'import, i PF e la console restano quelli della fase 1.

## Obiettivo

Il GM incolla il JSON di un mostro preso da 5eTools, oppure carica un file
bestiario o homebrew, sceglie il mostro e lo importa sulla scheda con un clic,
senza riscrivere nulla a mano.

Il plugin **non include** dati di 5eTools: il file arriva dal GM, resta in
memoria solo durante l'import e non viene salvato.

## Cosa si legge (misurato il 26/10 sul mirror di 5eTools)

Prototipo usa-e-getta sui bestiari 2014; «piene» sono le azioni che l'adapter
traduce per intero (attacchi e azioni a tiro salvezza), «parziali» gli
attacchi che al colpo chiedono anche un TS (registrato il colpo, il TS nella
nota fino alla fase 1b). Il multiattacco è escluso dal conto e diventa testo.

| Bestiario | Mostri | Azioni | Piene | Parziali | Con `_copy` |
| --- | --- | --- | --- | --- | --- |
| Manuale dei Mostri | 450 | 961 | 72% | 13% | 0 |
| Volo | 143 | 266 | 77% | 13% | 7 |
| Mordenkainen (Tomo dei Nemici) | 140 | 329 | 69% | 14% | 0 |
| Mostri del Multiverso | 261 | 571 | 71% | 14% | 0 |
| **Icewind Dale** | 83 | 111 | 72% | 7% | **31** |

Il resto sono azioni senza danni né TS (teletrasporti, evocazioni, ingoiare),
che restano al tavolo con il loro testo in nota. Tre forme comuni che il
prototipo non leggeva ancora e il lotto 1 copre: attacchi con incantesimo
(`{@atk rs}`, `{@atk ms}`), gittata senza distanza lunga («range 150 ft.»),
armi versatili e «… to hit with shillelagh». I «Breath Weapons» dei draghi
metallici diventano un'azione per opzione.

Icewind Dale usa `_copy` per 31 mostri su 83 (Arveiaturace da Ancient White
Dragon, Snowy Owlbear da Owlbear, i Reghed da Gladiator e Tribal Warrior…):
il mostro eredita lo statblock di un altro libro, quasi sempre il Manuale dei
Mostri (30 su 38), con poche modifiche (`replaceTxt`, `replaceArr`,
`appendArr`, `prependArr`, `removeArr`).

## Formato 5eTools da supportare (2014)

- Un mostro (oggetto con `name`, `source`), un elenco, oppure un file
  bestiario o homebrew `{ "monster": [...] }`.
- Statistiche: `ac` (numero o `{ ac, from }`: il primo valore), `hp`
  (`{ average, formula }`; `{ special }` non si importa), `speed.walk`,
  `str`…`cha`, `save`, `passive`, `resist` / `immune` / `vulnerable`.
- Azioni in `action[]`; tag usati: `{@atk mw|rw|ms|rs}`, `{@hit N}`, `{@h}`,
  `{@damage …}`, `{@dc N}`, `{@recharge N}` (e `{@recharge}` = 6),
  `{@condition …}`; nome con «(3/Day)».
- I bestiari 2024 (Manuale dei Mostri 2025, tag `{@atkr}`, `{@actSave}`) si
  rifiutano con un messaggio chiaro: le regole del plugin sono quelle del 2014.

## Lotti

### Lotto 1 — lettore 5eTools (core puro) ✅

- Nuovo `src/fiveToolsMonsterCore.js`: da un mostro 5eTools al JSON del
  formato della fase 1 (`kind: "monster"`), che poi passa da
  `parseCharacterSheetImport` come oggi. Nessuna regola duplicata.
- Attacchi: tipo, bonus, portata o gittata, catena dei danni («plus 7 (2d6)
  fire»), danno fisso («1 piercing damage»), «in melee or … at range» → due
  azioni, versatile → la prima forma.
- Azioni a TS: CD, caratteristica, metà danni, area (`N-foot cone|line|cube`,
  `N-foot-radius sphere`, «within N feet of» → sfera), «targets one creature»
  → un bersaglio, condizione sul fallimento.
- Ricarica, usi al giorno, multiattacco (testo senza tag).
- Il resto del testo dell'azione va nella nota, senza tag («{@condition
  frightened}» → «frightened»), tagliato a 280 caratteri con «…».
- Difese condizionali («from nonmagical attacks»): vedi D3.
- Immunità alle condizioni e tratti: elencati nelle note (280 caratteri).
- Test con mostri dell'SRD 5.1 (licenza CC-BY): goblin, drago rosso giovane,
  ghoul, ragno gigante, bugbear, druido, elefante, drago d'argento adulto… Niente testi fuori SRD nel
  repository.

### Lotto 2 — mostri derivati (`_copy`) ✅

- Risolve `_copy` quando il mostro di base è nello stesso input (più file
  caricati insieme, per esempio il bestiario di Icewind Dale e quello del
  Manuale dei Mostri).
- Modi supportati: `replaceTxt`, `replaceArr`, `replaceOrAppendArr`, `appendArr`,
  `appendIfNotExistsArr`, `prependArr`, `removeArr`, `insertArr`, `remove`;
  `addSkills` e gli altri si ignorano e si segnalano.
- Base mancante: messaggio con nome e libro che servono («Snowy Owlbear deriva
  da Owlbear (MM): carica anche il bestiario MM»). La fase 3 (online) li
  recupererà da sola.

### Lotto 3 — import nella scheda ✅

- Il pannello **Importa** riconosce il JSON di 5eTools e aggiunge **Carica
  file** (uno o più file `.json`).
- Con più mostri: elenco con ricerca per nome e libro; il mostro scelto passa
  alle sezioni di sempre (Statistiche, Attacchi, Multiattacco, PF…).
- Riepilogo prima di applicare: «letto da 5eTools (MM): 3 azioni, 1 con TS
  al colpo nella nota, 1 da gestire al tavolo».
- Profilo del mostro: `source: "5etools"` e il riferimento `nome|libro`.

### Lotto 4 — azioni e resistenze leggendarie (facoltativo, D4) ⚠️ metadata del token

- «Legendary Resistance (3/Day)» e le azioni leggendarie (`legendary[]`,
  `legendaryActions`, 3 di default) impostano `meta.legendaryResistances` e
  `meta.legendary` del token, gli stessi del menu **Leggendario**, con il
  coordinatore e la Cronologia. Solo se il token non li ha già.

### Lotto 5 — testo completo dello statblock (facoltativo, D5)

- Tratti, reazioni e azioni leggendarie come testo, in uno store locale del
  GM (come i profili Boss), con il riferimento sul token; un accordion
  **Statblock** nella console. Mai il testo completo sul token.

### Lotto 6 — copertura e documentazione

- `scripts/fivetools-coverage.mjs`: la tabella sopra per i file che il GM ha
  (letti da disco, mai inclusi nel plugin).
- `docs/IMPORT_SCHEDA.md`, `docs/GUIDA_UTENTE.md`, `BACKLOG.md`.

## Rapporto con le altre fasi

- **Fase 1b** (TS e condizione al colpo): dopo la fase 2 l'adapter traduce
  anche quei 127 attacchi del Manuale dei Mostri, oggi nella nota.
- **Fase 3** (ricerca online): userà questo adapter; in più recupera da sola
  le basi dei `_copy`.
