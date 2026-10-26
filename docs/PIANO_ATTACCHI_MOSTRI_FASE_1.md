# Attacchi dei mostri — fase 1 (piano)

Stato: **approvato il 26/10/2026**, lotti 1–8 implementati (misura fatta su una scena piccola il 26/10).

Decisioni confermate: l'interruttore Mostri eredita «Ogni turno» finché non viene toccato; i boss seguono l'interruttore Mostri; PF dalla media dello statblock, modificabile, con sovrascrittura spuntata solo se il token non ha PF; fase 1b dopo la fase 1.

## Deviazioni dal piano emerse in implementazione

- **Lotto 1, nomi dei campi.** Gittata come oggetto, `rangeFeet: { normal, long }` (la lunga solo se oltre la normale), come i profili Boss; misura dell'area in `area.sizeFeet`, larghezza solo per la linea (`widthFeet`).
- **Lotto 1, valori fuori intervallo.** I campi del mostro si scartano invece di essere riportati nei limiti (una CD 0 o un bonus +45 sono valori sbagliati, non da correggere). Senza CD il TS cade per intero: la CD degli incantesimi della scheda non è quella del mostro.
- **Lotto 1, editor della scheda.** `collectQuickActions` ricostruisce ogni attacco da etichetta, raggio e componenti: salvare la scheda avrebbe cancellato i campi del mostro. La riga ora li conserva (`quickActionMonsterAttackFields`) e li rimette al salvataggio; un TS senza danni non riceve più la componente «tagliente» di default.
- **Lotto 2, TS senza area.** Un'azione a TS senza area vale per una creatura (`area: { shape: "target", maxTargets: 1 }`), come lo Sputo acido: tutte le azioni a TS dei mostri passano dallo stesso percorso ad area. Con `maxTargets` oltre 1 il blocco dice «al massimo N bersagli».
- **Lotto 2, Combat Log.** Riga «Azione del mostro: nome (dadi) · TS, CD, effetto» e «Da fare: nota»; le aree a scelta manuale nominano anche sfera, cubo e cilindro (prima tutto ciò che non era cono o bersaglio diventava «sulla linea»).
- **Lotto 3, ricarica come contatore.** La ricarica è una carica (`quick-action-recharge:<id>`, capacità 1, torna con riposo breve e lungo) accanto agli usi (`quick-action-uses:<id>`); si spende nello stesso comando dell'attacco, quindi History e Undo la riportano indietro. Riusata da spesa non blocca: il Combat Log scrive «tornata al tavolo». Il sottotitolo mostra «Ricarica 5–6 · usata» e «2/3 al giorno».
- **Lotto 3, usi anche sul mancato.** Un uso al giorno si spende con qualsiasi esito: l'azione è stata usata.
- **Lotto 4, formato delle azioni.** `attack: { bonus, type: "melee" | "ranged", reach, range: { normal, long } }` (accettato anche `range: "melee"`); `area.size` e `area.width` in piedi o metri; `area.shape: "target"` con `targets`; condizioni in inglese o italiano mappate sui nomi di `CONDITION_LIST`. Un'azione con attacco **e** TS registra l'attacco e segnala il TS (fase 1b); un'azione senza danni né TS è segnalata e resta al tavolo. Formato e prompt in `docs/IMPORT_SCHEDA.md`.
- **Lotto 4, marcatore del mostro.** Applicare uno statblock scrive sempre `monster.source` sulla scheda (anche senza multiattacco): servirà al lotto 6 per tenere le schede dei mostri fuori dal registro room. I PF (`hitPoints`) si leggono ma si applicano nel lotto 5.
- **Lotto 4, accesso alla scheda.** Predicato unico `canOpenInitiativeCardSheet` (`src/initiativeCardSheetAccessCore.js`) per l'apertura dal tracker e per il pulsante delle carte classica e compatta.
- **Lotto 5, cautele in più.** Oltre ai token con PF (salvo «Sostituisci»), restano fuori i personaggi (`attitude: "pc"`, i cui PF vivono anche in `hpMemory`) e ogni token di una riserva di PF condivisi, sorgente o membro, anche con il collegamento rotto: la riserva non si imposta dallo statblock di una creatura. Il comando `hp:set` ha History (Undo) e i valori attesi di `hp`/`hpMax`; dopo il commit barre e testi HP come la console HP rapida. Pianificatore puro in `src/monsterHitPointsImportCore.js`, passo runtime in `src/monsterHitPointsImport.js`.
- **Lotto 6, filtro nella codifica.** Il filtro sta in `encodeInitiativeCardRegistryForRoom`, prima degli alias: nessun alias punta a una voce che la Room non tiene. La prima scrittura dopo l'aggiornamento toglie dalla Room anche le schede di mostri salvate prima; la copia locale del GM le conserva. Le voci eliminate e i profili con `monster: null` restano. Limite noto: un altro dispositivo del GM non ritrova per nome la scheda di un mostro (la reimporta).
- **Lotto 7, eredità.** `windows.pcAttackAutoOpenMonsters` vale `null` finché non viene toccato e allora segue `pcAttackAutoOpen` (`selectPcAttackAutoOpenMonsters`); il Salva del pannello opzioni non lo congela (la patch lo scrive solo se è un booleano) e la sua casella mostra il valore che eredita (`data-local-fallback`). L'attitudine assente vale «ally», come nelle voci del tracker.
- **Lotto 7, interruttore spento.** Un turno il cui interruttore è spento non apre, non sposta e non chiude nulla, come oggi con l'opzione spenta; il turno di Tana segue l'uno o l'altro.
- **Lotto 7, intestazione.** Le due pillole «PG» e «Mostri» sono compatte (stato dal colore, casella nascosta ma raggiungibile da tastiera, «Ogni turno» come etichetta del gruppo): il gruppo occupa 79 px e il nome dell'attore tiene il suo spazio (192 px nel banco, contro 15 px con le pillole complete).
- **Lotto 8, misura.** I passi della sessione in room sono in `docs/MISURA_CONSOLE_MOSTRI.md` (blocchi PG, PG+Mostri, spenti, contro `perf-runs/gm-turni-flag-locale.json`); `scripts/perf-compare.mjs` mette gli export a confronto. Guida utente: sezione «Console attacchi per i mostri».
- **Lotto 8, risultato (26/10, sessione automatica).** Scena piccola: 6 PG di livello 2 più mostri importati, senza buff attivi; i valori assoluti non si confrontano con la baseline di Icewind Dale (lì ogni tick aggiorna i token). Cambio turno p50/p95: PG 92/186 ms, PG+Mostri 78/107 ms, spenti 96/578 ms (un picco al primo turno). La console si apre una volta e segue il turno; seguire anche i mostri aggiunge 11 richieste di contesto su 10 turni (0–28 ms l'una), nessun long task. `initiativeCards` in room a 4.303 byte. Il blocco PG+Mostri ha girato con i timer di Chrome a 1 al secondo (finestra non visibile): ritmo falsato; nello stesso blocco l'avviso di turno si è riaperto 5 volte invece di 1, da verificare al tavolo. Decisione dell'utente: la misura basta così. File in `perf-runs/gm-mostri-*.json`.
- **Lotto 2, banco.** Scenari `pc-monster`, `pc-monster-bite`, `pc-monster-presence` (e, dal lotto 4, `monster-sheet`: la scheda di un goblin nemico) nel banco `boss-actions-preview` (porta 5199).

Decisioni già prese dall'utente (26/10/2026):

- PF e CA dei mostri si importano dallo statblock;
- l'apertura automatica della console diventa doppia: un interruttore per i PG, uno per i mostri;
- nelle fasi successive restano sia il JSON di 5eTools (fase 2) sia la ricerca online su 5eTools (fase 3).

## Obiettivo

Al turno di un mostro il GM apre la console (o la trova già aperta) e registra i suoi attacchi e le sue azioni a tiro salvezza come fa oggi per i PG, senza preparare nulla a mano: le azioni arrivano da uno statblock incollato in JSON.

La fase 1 costruisce il **modello** delle azioni dei mostri, la **console** che le esegue, l'**import** nel formato del plugin e l'**interruttore** dell'apertura automatica. Il formato è pensato come bersaglio dell'adapter 5eTools della fase 2: i casi coperti sono quelli che i tag di 5eTools esprimono (`{@atk}`, `{@hit}`, `{@damage}`, `{@dc}`, `{@recharge}`, `X/Day`).

## Cosa copre (misurato sul Manuale dei Mostri 2014)

Conteggio sul bestiario MM 2014 di 5eTools: 450 mostri, 1181 azioni.

| Tipo di azione | N. | Fase 1 |
| --- | --- | --- |
| Attacco con soli danni (anche 2–3 tipi, mischia e/o distanza) | 589 | automatico |
| Azione a tiro salvezza (danni, metà se superato, eventuale condizione) | 159 | automatico, area a scelta manuale |
| Attacco con TS secondario al colpo (Ragno gigante, Ghoul) | 127 | danni del colpo automatici, il resto come nota |
| Attacco con sola condizione al colpo (Ragnatela) | 12 | nota |
| Multiattacco | 220 | testo mostrato in console |
| Altro (teletrasporto, evocazioni…) | 74 | nota |

Con la fase 1 circa il **78%** delle azioni (multiattacco escluso) si registra per intero, un altro 13% per la parte dei danni. Ricarica su 84 azioni, usi al giorno su 26. Azioni leggendarie (37 mostri) e incantesimi dei mostri (83) restano fuori.

## Cosa si riusa

- **Attacco a bersaglio singolo**: è il ramo `kind: "attack"` delle azioni rapide ([quickActionsCore.js](../src/quickActionsCore.js)), già eseguito dalla console per qualsiasi token con attacchi nella scheda. Esiti Colpito/Critico/Mancato, danni per componente, difese, PF canonici, History, Combat Log: invariati.
- **Azione a TS ad area**: il percorso del soffio dei dragonidi (`pcAttackResolvedAction` → `area: { manual: true }`, `pcAttackAreaPreview`, `buildPcAttackAreaMutation` in [pcAttackCore.js](../src/pcAttackCore.js)) fa già scelta manuale delle creature, esito del TS per creatura, metà danni e condizione sul fallimento (`breath.onFail`). L'azione del mostro ci entra con TS e CD propri invece che derivati dalla scheda.
- **Usi**: `quickActionUsesPool` crea già un contatore in `classFeatureState.resources` (History, Undo, reset al riposo) per le azioni rapide incantesimo con usi propri. Si estende agli attacchi.
- **PF**: l'operazione `hp:set` del coordinatore effetti (come `updateHP` in [initiativeList.js:5671](../src/initiativeList.js)), con `planSharedHpMutation` per i PF condivisi. Barre HP sulla mappa e testo HP seguono dai metadata canonici.
- **Import**: il pannello Importa della scheda e il lettore [characterSheetImportCore.js](../src/characterSheetImportCore.js) (caratteristiche, TS, difese, CA, nomi non riconosciuti in rosso).

## Contratto dati

### Azione d'attacco (`src/quickActionsCore.js`)

Campi **aggiunti** al ramo `kind === "attack"` (tutti facoltativi; il sanitizer scarta gli sconosciuti, quindi le azioni esistenti non cambiano e `QUICK_ACTION_VERSION` resta 2):

```js
{
  version: 2, id, label, kind: "attack", targetMode: "selection",
  range: "melee" | "ranged",          // come oggi; "both" no: Giavellotto = due azioni
  components: [ /* 0..3: zero solo con save + onFail (Presenza terrificante) */ ],
  attackBonus: 14,                    // mostrato, mai tirato
  reachFeet: 10, rangeFeet: { normal: 80, long: 320 }, // mostrati in metri
  save: "dex", saveDC: 21, saveHalf: true,      // azione a TS al posto del tiro per colpire
  area: { shape: "cone" | "line" | "sphere" | "cube" | "cylinder", sizeFeet: 60, widthFeet: 5 }
     | { shape: "target", maxTargets: 1 },
  onFail: { condition: "Spaventato" },          // condizione sul TS fallito, scadenza manuale
  recharge: 5,                         // Ricarica 5–6
  uses: 3,                             // 3/giorno
  note: "…",                           // ≤ 280 caratteri: la parte non automatizzata
}
```

Limiti invariati: 8 attacchi per scheda, 3 componenti, formula ≤ 24 caratteri.

### Scheda (`src/initiativeCards.js`)

Un campo nuovo, compatto, presente solo sulle schede importate da statblock:

```js
monster: { source: "manual" | "5etools" | "open5e", multiattack: "…" /* ≤ 280 */ }
```

La CA usa il campo che esiste già (`armorClass`). Il testo completo dello statblock **non** va sul token: arriva con la fase 2, in uno store locale.

## Lotti

Ogni lotto è un commit a sé, con i test del suo modulo e `npm run build`.

### Lotto 1 — modello delle azioni ✅

- `sanitizeQuickAction`: i campi sopra, con validazione (CD 1–30, bonus −30…+30, ricarica 2–6, usi 1–`MAX_QUICK_ACTION_USES`, caratteristica tra le sei, condizione tra quelle note).
- `sanitizeInitiativeCard`: il campo `monster`.
- Il campo `monster` vive in `src/monsterProfileCore.js` (`sanitizeMonsterProfile`, `isMonsterProfileCard`).
- Test: `test/quickActionsCore.test.js`, nuovo `test/monsterAttackModel.test.js`.

### Lotto 2 — la console esegue le azioni dei mostri ✅

- `pcAttackResolvedAction`: un'azione con `save` diventa un'azione ad area (`area.manual`), con `saveHalf` e `onFail` propri; `area.shape: "target"` vale come bersaglio singolo a TS.
- `pcAttackSaveDC`: `attack.saveDC` prima della CD della scheda.
- `buildPcAttackAreaMutation`: la condizione sul fallimento si legge da `attack.breath?.onFail || attack.onFail` (oggi solo il soffio).
- Picker e Dettagli: bonus, portata o gittata in metri, TS e CD, area, nota; riga del multiattacco in testa alla console.
- Nessun disegno dell'area sulla mappa in fase 1: le creature si scelgono a mano come per il soffio.
- Test: nuovo `test/pcAttackMonsterActions.test.js`, due test della console in `test/pcAttackPopover.test.js`.

### Lotto 3 — usi e ricarica ✅

- `quickActionUsesPool` vale anche per gli attacchi con `uses`; la console spende l'uso insieme ai danni (History e Undo già pronti).
- Ricarica come **promemoria, mai blocco**: dopo l'uso la riga mostra «Ricarica 5–6»; il GM tira il d6 al tavolo e, se si è ricaricata, usa l'azione e basta. Nessun clic in più, nessun contatore da segnare (vedi la regola sul bookkeeping di turno).
- Test: `pcAttackExecutionIntegration`, `quickActions`.

### Lotto 4 — import dello statblock nel formato del plugin ✅

- **Scheda aperta a nemici e neutrali, solo per il GM** (aggiunto il 26/10): oggi `openInitiativeCardPopup` e il pulsante della scheda (carta classica e compatta) valgono solo per `pc` e `ally`, quindi un nemico non può ricevere attacchi e la console non compare mai per lui. Il GM apre la scheda di qualsiasi creatura; i giocatori restano a `pc` e `ally`.
- Nuovo `src/monsterStatblockImportCore.js`: legge il JSON (chiavi sotto), nomi italiani o inglesi per tipi di danno, condizioni e caratteristiche; ciò che non riconosce va in rosso, non si indovina.
- Il pannello Importa della scheda riconosce `"kind": "monster"` e mostra le sezioni: Statistiche (CA, caratteristiche, TS), Difese, PF, Azioni (Aggiungi/Sostituisci), Multiattacco.
- `docs/IMPORT_SCHEDA.md`: formato del mostro e prompt per un assistente.

```json
{
  "kind": "monster",
  "name": "Drago rosso adulto",
  "armorClass": 19,
  "hitPoints": { "average": 256, "formula": "19d12+133" },
  "abilities": { "str": 27, "dex": 10, "con": 25, "int": 16, "wis": 13, "cha": 21 },
  "savingThrows": { "dex": 6, "con": 13, "wis": 7, "cha": 11 },
  "damageDefenses": { "immunities": ["fire"] },
  "multiattack": "Usa Presenza terrificante, poi un morso e due artigli.",
  "actions": [
    { "name": "Morso", "attack": { "bonus": 14, "range": "melee", "reach": 10 },
      "damage": [{ "type": "piercing", "formula": "2d10+8" }, { "type": "fire", "formula": "2d6" }] },
    { "name": "Soffio di fuoco", "recharge": 5,
      "save": { "ability": "dex", "dc": 21, "half": true }, "area": { "shape": "cone", "size": 60 },
      "damage": [{ "type": "fire", "formula": "18d6" }] },
    { "name": "Presenza terrificante", "save": { "ability": "wis", "dc": 19 },
      "area": { "shape": "sphere", "size": 120 }, "onFail": { "condition": "frightened" },
      "note": "Ripete il TS a fine turno; immune per 24 ore dopo un successo." }
  ]
}
```

### Lotto 5 — PF dallo statblock ⚠️ tocca la sincronizzazione dei PF ✅

- Dopo **Salva** della scheda, se la sezione PF è spuntata: `hp:set` con `hp = hpMax = average` tramite `runEffectsMutation`, come `updateHP`. Mai una scrittura diretta dei metadata.
- Il valore è modificabile nell'anteprima (il plugin non tira la formula).
- Sovrascrittura: spuntata di default solo se il token non ha ancora PF; se li ha, va spuntata a mano (evita di azzerare un mostro ferito a metà combattimento).
- «Applica anche agli altri N token con lo stesso nome in scena»: un solo `hp:set` con più aggiornamenti (`updateMultipleHP`); i gruppi a PF condivisi passano da `planSharedHpMutation`.
- `hpMemory` non è toccato: vale solo per i PG.
- Rischio: barre HP sulla mappa e PF condivisi. Test di integrazione su gruppo condiviso, token con PF già impostati, scena cambiata a metà.

### Lotto 6 — schede dei mostri fuori dal registro room ⚠️ tocca i metadata di room ✅

- Oggi ogni salvataggio di scheda scrive anche nel registro room (`updateRoomCards`, budget di 4.450 byte), che conserva le voci più recenti: cinque schede di mostri importate spingerebbero fuori quelle dei PG.
- Patch: le schede con `monster` restano solo nel registro locale del GM (`writeLocalInitiativeCards`), che basta a ritrovare la scheda di un nuovo token «Goblin» per nome. Il token conserva comunque la sua scheda.
- Rischio: logica di merge locale/room e alias. Patch limitata al filtro in scrittura, con test su `initiativeCardRegistryCore`.

### Lotto 7 — apertura automatica: PG e Mostri ⚠️ tocca il controller del turno ✅

- Nuova opzione locale `windows.pcAttackAutoOpenMonsters` accanto a `windows.pcAttackAutoOpen` (defaults, normalize, selectors, pannello opzioni).
- `pcAttackTurnController`: attitudine `pc` o `ally` → interruttore PG; tutte le altre → interruttore Mostri. I boss (console Boss) seguono l'interruttore Mostri.
- Console: l'interruttore «Ogni turno» diventa due pillole, «PG» e «Mostri».
- Migrazione: finché l'utente non tocca «Mostri», vale il valore attuale di «Ogni turno», così chi oggi ha l'apertura automatica attiva non perde nulla (mostri con attacchi manuali e boss compresi).
- Il controller resta in sola lettura dello stato di iniziativa: nessuna scrittura, nessun movimento del turno.
- Test: `pcAttackAutoOpenOption`, test del controller con PG, mostro, boss, Tana, Paragon.

### Lotto 8 — misura e documentazione ✅

- Probe prestazioni (`src/perfProbe.js`) su 10 turni con mostri importati e interruttore Mostri acceso, contro la baseline del 24/10 (tick 1,32 s con ARCH-009 acceso). Con l'apertura anche sui turni dei mostri, la console si riapre più spesso: va misurato quanto costa.
- `docs/GUIDA_UTENTE.md`, `BACKLOG.md` (voce «Console attacchi per i mostri normali»).

## Fuori perimetro

- **Fase 1b** (subito dopo, se serve): TS secondario al colpo (127 attacchi, Ragno gigante, Ghoul) e condizione al colpo (Ragnatela). La nota li copre intanto.
- **Fase 2**: adapter del JSON di 5eTools (incollato o file) verso il formato sopra; testo completo dello statblock in uno store locale con riferimento sul token.
- **Fase 3**: ricerca online. Nota pratica, verificata il 26/10: `5e.tools` risponde 403 alle richieste dirette; risponde il mirror GitHub di 5eTools, che però può sparire senza preavviso. L'URL della sorgente va reso configurabile, con il file come ripiego.
- Azioni leggendarie, incantesimi dei mostri, reazioni: restano alla console Boss o a fasi successive.
- Disegno dell'area sulla mappa, tiro dei dadi.
