# ARCH-009 — History e journal di recovery fuori dai metadata di scena

Stato: **implementato** (passi 1–7, da `f228c44`; flag acceso per default da `dd881a7`). Base del progetto: `17adacd`. Contratti aggiornati:
[ARCH-005 — History owner](ARCH-005-HISTORY-OWNER.md),
[ARCH-05B — recovery persistente](ARCH-05B-RECOVERY.md).

## 1. Perché

Misure in room reale con il [probe prestazioni](PERFORMANCE-PROBE.md), 24/10/2026:

| Fatto misurato | Valore |
| --- | --- |
| Metadata di scena a riposo | 165–245 KB, di cui History 128–206 KB e journal 36 KB |
| Scritto in 10 minuti di combattimento | 12,6 MB (History 8,9 MB, journal 3,7 MB) |
| Consegnato agli iframe del client giocatore in 10 minuti | 58 MB di metadata di scena |
| Comando effetti (Boss, concentrazione, tick) | ~240 KB scritti: journal ~120 KB, History ~125 KB |
| Avanzamento di turno, History piena → svuotata | 2,33 s → 1,45 s (p95 3,56 → 1,77 s) |
| Chiamate SDK non legate alla History, piena → svuotata | `getItems` −53/−67%, `setMetadata` −59%, scrittura `state` −71% |

L'ultimo dato è decisivo: con metadata di scena pesanti **ogni** chiamata a Owlbear rallenta, non solo le
scritture della History. OBR consegna l'intero oggetto metadata a ogni iframe abbonato a ogni scrittura
(`SceneApi.onMetadataChange` → `callback(data.metadata)`), e il resto della coda aspetta.

History e journal servono solo al GM. Il contratto ARCH-005 assume già un solo GM autorevole e un owner per
client. Il DM ha accettato in linea di principio un Undo legato al browser del GM: cambiare PC durante una
sessione è un caso eccezionale.

## 2. Obiettivo e non-obiettivi

**Obiettivo:** i dati di History e journal vivono in IndexedDB del browser del GM. In scena restano solo due
ancore di poche centinaia di byte. Atteso: metadata di scena da ~165 KB a ~2–3 KB; eventi di metadata da
~200 KB a ~2–3 KB; il journal da tre scritture di scena per comando a tre scritture locali.

**Invariato:**

- le chiavi `com.thebigpicture.initiative/history` e `com.thebigpicture.initiative/effects-recovery-v1`
  (cambia solo il valore, che diventa un'ancora);
- il formato delle voci History, la retention di 30 voci, l'idempotenza per entry ID, la semantica di Undo,
  prevalidazione e conflitti;
- l'API dei client: `requestHistoryOwnerAppend/Remove/Clear`, `getHistoryEntries`, `undoHistoryThrough`,
  `withItemMetaHistory`, `recordEffectsMutationHistory`;
- la macchina a stati del journal (PREPARED → [CANONICAL_COMMITTED → SIDE_EFFECTS_PENDING] →
  HISTORY_PENDING → rimozione + receipt), i limiti di record e il gate dei PREPARED ambigui;
- il Combat Log (ha già il proprio database IndexedDB);
- ciò che ricevono e fanno i client giocatore. Console PG, console Boss e Quick HP rifiutano i non-GM;
  da verificare al passo 1 che anche `classFeatureRuntime.js` e `spellAreaResolutionExecutor.js` leggano la
  History solo per il GM.

**Fuori ambito:** la dieta delle voci, le receipt a 32, il Combat Log fuori dal percorso critico dell'owner,
le tre `updateItems` del tick. Sono passi separati, misurabili da soli.

## 3. Stato attuale (dove si tocca)

| Ruolo | Dove |
| --- | --- |
| Unico writer History | `historyOwner.js`, `createOwnerBroker` → `readHistory`/`writeHistory` iniettati nel broker di `historyOwnerCore.js` |
| Lettori History, in qualsiasi iframe GM | `history.js`: `getHistoryEntries` (~r. 1104) e il percorso di Undo (~r. 2254) |
| Chi usa i lettori | `history-modal.ts`, `quick-hp-modal.js`, `boss-actions.js`, `pc-attack.js`, `classFeatureRuntime.js`, `spellAreaResolutionExecutor.js`, `initiativeList.js`, `background.js` |
| Notifica di cambio | broadcast `LOCAL` su `…/history-change` (già oggi, non dipende dai metadata) |
| Journal | `effectsRecovery.js`: `load` (legge i metadata di scena), `write` (scrive la chiave), solo nel background GM |
| Ancora del journal usata altrove | `history.js` ~r. 2097: il replay di un avviso confronta `recoveryScope.scopeId` con `metadata[EFFECTS_RECOVERY_KEY].scopeId` |
| Modello IndexedDB già in uso | `combatLog.js`: database `${ID}.combat-log`, scritto dal background e letto dal pannello Cronologia nello stesso browser |

L'SDK non espone un ID persistente di scena (`SceneApi` non ha `id`): ARCH-05B usa già un `scopeId` UUID
salvato nella scena. Lo stesso schema vale qui.

## 4. Progetto

### 4.1 Ancore in scena

**History** — la chiave resta, il valore diventa una testa di versione 2:

```js
{ version: 2, storage: "local", roomId, storeId, rev, seq, count, lastEntryId, entries: [] }
```

- `storeId`: UUID dello store locale di questa scena.
- `rev`: contatore delle scritture (append, remove, clear) dell'owner su questo store. `seq` è la sequenza
  degli append della History (`storeSeq` delle voci) e non cresce con remove e clear, quindi da solo non basta
  a riconoscere una scena duplicata.
- `entries: []` resta apposta: il codice precedente, in caso di rollback, legge una History vuota senza
  errori invece di rompersi.
- Dimensione ~200 byte. Viene riscritta a ogni operazione della History: una scrittura di scena resta, ma
  minuscola, e serve a riconoscere le scene duplicate (§4.4).

**Journal** — la chiave resta, il valore diventa:

```js
{ schemaVersion: 2, storage: "local", scopeId }
```

Scritta una volta per scena. Il controllo di `history.js` ~r. 2097 continua a leggere `scopeId` dalla
stessa chiave e non cambia.

### 4.2 Database locale

Nuovo database separato dal Combat Log, così le versioni non si legano: `com.thebigpicture.initiative.history-store`, versione 1.

| Object store | Chiave | Contenuto |
| --- | --- | --- |
| `historyStores` | `storeId` | `{ storeId, rev, roomId, history, touchedAt }`: `history` è il valore che l'owner scriveva in scena (`{ version: 1, roomId, seq, entries }`, voci compattate come oggi) |
| `recoveryStores` | `scopeId` | `{ scopeId, roomId, schemaVersion, records, receipts, touchedAt }` (passo 4) |

- **Ogni scrittura dell'owner** (append, remove, clear): un `put` del record intero, poi la nuova testa in
  scena. Il broker resta quello di oggi e calcola sempre la History intera; un record per scena rende la
  scrittura atomica senza gestire l'ordine delle voci. È locale: ~150 KB clonati in pochi ms, nessun
  invio ad altri client. (Prima versione del progetto: una riga per voce; scartata al passo 2 perché più
  complessa senza un guadagno misurabile.)
- **Journal:** `put` dell'intero oggetto del recovery, che diventa piccolo e locale. Transazioni con
  `durability: "strict"`, perché il journal serve proprio dopo un crash.

### 4.3 Chi legge e chi scrive

- **Owner (background GM):** unico writer, come oggi. `readHistory`/`writeHistory` del broker passano a un
  adattatore locale: legge testa in scena e store in IndexedDB, scrive prima IndexedDB e poi la testa.
  Il broker in `historyOwnerCore.js` non cambia: riceve già le due funzioni per iniezione.
- **Lettori (tracker, popup, pannello):** `getHistoryEntries` e il percorso di Undo leggono la testa dalla
  scena (~200 B) e le voci da IndexedDB, nello stesso browser e con la stessa origine, come oggi il pannello
  legge il Combat Log scritto dal background. Niente passaggio dall'owner via broadcast: le voci pesano
  7–15 KB e finirebbero spezzate in chunk.
- **Coerenza:** un lettore vede sempre uno stato completo (transazione IndexedDB). Se la testa in scena e lo
  store non concordano su `seq`, il lettore ritenta brevemente; dopo 2 tentativi segnala History in
  aggiornamento, come oggi con `history-pending`.

### 4.4 Casi limite

| Caso | Riconoscimento | Comportamento |
| --- | --- | --- |
| Scena duplicata (copia anche la testa) | stesso `storeId`, ma `seq` della testa < `seq` dello store | la scena che scrive per seconda crea un nuovo `storeId`, copia le voci con `storeSeq ≤` la propria testa e prosegue da lì: le due scene non condividono più la History |
| Altro browser o dati del sito cancellati | `storeId` della testa assente da IndexedDB | History vuota per questa scena, nuovo `storeId`, notifica una volta: «Cronologia non disponibile in questo browser». Nessun dato di scena viene toccato |
| Journal con record pendenti in un altro browser | `scopeId` assente da IndexedDB | nessun recovery possibile; il comando era già applicato, manca solo la sua voce di History. Notifica come sopra |
| IndexedDB non disponibile (bloccato, quota, aggiornamento bloccato da un'altra scheda) | errore all'apertura | ripiego sullo storage di scena attuale con avviso una tantum (decisione D3) |
| Due schede GM nello stesso browser | stesso database | comportamento identico a oggi (same-key last-commit-wins), già fuori dal supporto ARCH-005 |
| GM in finestra in incognito | IndexedDB effimero | la History vive finché la finestra è aperta. Al tavolo il GM usa la finestra normale |
| Cambio stanza | `roomId` diverso | ignorato, come oggi `normalizeHistory` scarta le voci di altre room |

Pulizia (D5, passo 7): una volta per apertura, 15 s dopo la prima scena pronta e solo a flag acceso, `pruneLocalStores` elimina gli store di History e journal non scritti da 30 giorni (`touchedAt`). Restano sempre gli store della scena attuale (testa e ancora lette dalla scena), i journal con record pendenti e i record senza data valida. Un ritorno a una scena non giocata da più di 30 giorni la mostra quindi con una Cronologia vuota (caso «store mancante», con avviso).

### 4.5 Migrazione

Solo a flag acceso, solo nel browser del GM (l'owner non si monta per i giocatori):

1. **All'avvio dell'owner**, quando la scena diventa pronta: se la chiave contiene ancora una History v1 con
   voci, l'owner invia a se stesso un comando `migrate` nella propria coda (`migrateLegacyHistory` in
   `historyLocalStore.js`, `rewriteHistoryForStorage` in `historyOwnerCore.js`). La coda è la stessa di
   append, remove e clear, quindi nessuna aggiunta si può infilare a metà. Il comando non è accettato dal
   canale broadcast: arriva solo dall'owner.
2. **Alla prima scrittura**, se il flag viene acceso senza ricaricare: la scrittura stessa porta in IndexedDB
   la History intera insieme alla modifica.
3. La migrazione scrive prima il record IndexedDB e poi l'ancora. Se la scrittura dell'ancora fallisce, la
   History resta v1 in scena e la migrazione si ripete al prossimo avvio o alla prossima scrittura; il record
   orfano viene eliminato dalla pulizia (passo 7).
4. History v1 vuota o assente: nessuna migrazione, l'ancora nasce alla prima operazione.
5. **Rollback del plugin:** il codice vecchio legge l'ancora v2 come History vuota. Se il codice vecchio
   scrive, la chiave torna v1 con voci; con il codice nuovo e il flag acceso viene migrata di nuovo in un
   nuovo store; quello precedente resta da parte fino alla pulizia.
6. IndexedDB non disponibile (D3): la History resta in scena e l'owner avvisa una volta.

Journal (passo 4): nessun comando dedicato. A flag acceso la prima scrittura del journal, cioè il primo comando
effetti o il recovery all'avvio del background, mette in IndexedDB lo store intero (stesso `scopeId`, record
pendenti e receipt compresi) e poi scrive l'ancora in scena una sola volta. Le scritture successive restano
locali. Flag spento: la scrittura successiva riporta il journal intero in scena. Il database passa alla versione
2, che aggiunge `recoveryStores` a un database creato al passo 2 senza toccare la History.

## 5. Passi piccoli

Ogni passo ha build, test completi e, dove indicato, una misura con il probe.

| Passo | Contenuto | Comportamento | Rischio |
| --- | --- | --- | --- |
| **1** ✅ | Estrarre gli adattatori di storage *senza cambiare comportamento*. History: `historyStorage` dentro `historyOwner.js`, che resta l'unico writer della chiave come vuole `historyOwnerInventory.test.js`; l'owner e i due lettori di `history.js` passano da `readHistoryValue()`. Journal: `createEffectsRecovery({ …, storage })` con default `createSceneEffectsRecoveryStorage(obr)` | identico | basso: i 39 file di test che leggono la chiave in scena restano verdi senza modifiche |
| **2** ✅ | Adattatore IndexedDB della History (`historyLocalStore.js`, regole pure in `historyLocalStoreCore.js`), testa v2 e riconoscimento delle scene duplicate, **dietro un flag spento**: `localStorage["com.thebigpicture.initiative/history-local-store"] = "1"` nel browser GM (D4). A flag acceso, una scena che ha ancora voci v1 resta in scena fino al passo 3; a flag spento la scrittura successiva riporta la History intera in scena | identico a flag spento | basso |
| **3** ✅ | Migrazione v1 → v2 all'avvio dell'owner con un comando `migrate` nella sua coda, e alla prima scrittura se il flag viene acceso senza ricaricare (§4.5). Solo a flag acceso | cambia solo a flag acceso | medio |
| **4** ✅ | Adattatore IndexedDB del journal (`createLocalEffectsRecoveryStorage` in `effectsRecovery.js`, database versione 2 con `recoveryStores`) con ancora v2 e durabilità `strict`, a flag acceso. A flag spento lettura e scrittura hanno i passaggi asincroni di prima | cambia solo a flag acceso | medio-alto: tocca il recovery |
| **5** | Prova in room del DM, flag acceso solo nel browser GM: sessione completa e misura con il probe | — | — |
| **6** ✅ | Flag acceso per default nel browser del GM: `localStorage["com.thebigpicture.initiative/history-local-store"] = "0"` lo spegne (History e journal tornano interi in scena alla scrittura successiva); senza un `localStorage` utilizzabile (non un browser, o storage del sito bloccato) resta la scena. Test: `test/localHistoryStorageIntegration.test.js` rifà in `npm test` 16 suite di History, Undo e recovery con lo storage locale; `npm run test:local-store` rifà l'intera suite, esclusi i file elencati in `test-support/localHistoryStorageSuites.js` con il motivo (leggono la scena direttamente o condividono il `localStorage`). La prova in suite ha trovato e corretto un difetto del passo 4: l'ancora del journal ora viene ricontrollata a ogni nuovo comando | cambia per tutti | medio |
| **7** ✅ | Pulizia degli store vecchi (`pruneLocalStores` in `historyLocalStore.js`, avviata da `historyOwner.js`); aggiornamento di ARCH-005 (History per browser) e ARCH-05B (journal locale) | elimina solo dati locali vecchi | basso |

Il passo 1 si può committare da solo. I passi 2–4 lasciano il comportamento di produzione invariato
finché il flag è spento.

## 6. Test da aggiungere

**Adattatore History (con `test-support/fakeVersionedIndexedDb.js`):**

- append, remove, clear con retention di 30 e `seq` crescente;
- idempotenza per entry ID e conflitto su payload diverso, come nel broker attuale;
- un lettore in un altro "iframe" (seconda istanza del modulo) vede lo stato completo dopo il commit;
- testa e store in disaccordo: retry, poi `history-pending`;
- scena duplicata: le due scene divergono senza mescolare le voci;
- `storeId` assente: History vuota, nuovo store, notifica una volta;
- IndexedDB che fallisce all'apertura: ripiego sulla scena.

**Migrazione:** v1 con 30 voci → v2 con le stesse voci e testa piccola; fallimento della scrittura della
testa → ripetibile; lettore v1 su testa v2 → History vuota senza errori; v1 riscritta dopo un rollback →
migrata di nuovo.

**Journal:** recovery da PREPARED e da HISTORY_PENDING dopo il "riavvio" del background, con lo store in
IndexedDB; receipt e duplicato riconosciuto; il replay dell'avviso di concentrazione (`history.js`
~r. 2097) accetta lo stesso `scopeId` dell'ancora; record troppo grande gestito come oggi (1db15f2,
92d86e1).

**Integrazione:** le suite di Undo (Boss, PG, Quick HP, movimenti, incantesimi) eseguite con
l'adattatore locale; Player senza letture né scritture; il probe (`perfProbe.test.js`) mostra la scrittura
della testa di pochi byte invece della History intera.

**Room reale (passo 5):** metadata di scena < 5 KB a riposo; eventi di metadata < 5 KB; tick, PF e azione
Boss confrontati con la baseline del 24/10; Undo, Cronologia, avviso di concentrazione e replay dopo
ricarica della pagina funzionanti.

## 7. Rischi

| Rischio | Effetto | Mitigazione |
| --- | --- | --- |
| Undo e recovery legati al browser del GM | cambio PC o pulizia dei dati del sito = Cronologia vuota per quella scena | accettato in linea di principio dal DM (D1); notifica esplicita; la scena non perde nulla |
| Scene duplicate | voci di una scena applicate all'altra (un Undo di "token rimosso" ricreerebbe item nella scena sbagliata) | `seq` nella testa e fork automatico (§4.4), test dedicato |
| Divergenza testa/store | Undo su stato parziale | scrittura IndexedDB prima della testa; retry dei lettori; `history-pending` |
| Perdita del journal in crash di sistema | comando applicato senza voce History | durabilità `strict`; resta la semantica attuale "applicato, History in attesa" |
| Scena duplicata con il journal locale | le due scene condividono lo stesso `scopeId` e lo stesso record locale | rischio già presente oggi (la copia della scena copia anche la chiave del journal); i record pendenti durano pochi secondi. Da rivalutare se la prova in room mostra problemi |
| Test esistenti legati alla chiave in scena | 39 file leggono `[HISTORY_KEY]` dai metadata finti | passo 1 a comportamento invariato; conversione al passo 6 con un helper unico |
| Rollback | History apparentemente vuota con il codice vecchio | `entries: []` nella testa e ri-migrazione (§4.5) |
| `initiativeList.js` e `history.js` sono fragili | regressioni su Undo e tracker | nessuna modifica alla logica di Undo, solo il punto di lettura; test d'integrazione esistenti come rete |

## 8. Decisioni del DM

- **D1** — Undo legato al browser del GM anche dopo una ricarica della pagina? (Ricarica: sì, la History resta.
  Altro PC o dati del sito cancellati: no.)
- **D2** — History esistente: migrarla in IndexedDB e svuotare la chiave in scena (proposta), o lasciarne una
  copia in sola lettura?
- **D3** — IndexedDB non disponibile: ripiego automatico sulla scena con avviso (proposta), o History disattivata?
- **D4** — Flag di prova: `localStorage` del browser GM (proposta), o opzione di room?
- **D5** — Pulizia degli store di scene vecchie: dopo 30 giorni senza accesso (proposta), o mai?
- **D6** — Retention: resta a 30 voci (proposta). Senza costo di rete si potrebbe alzare, ma cambierebbe
  la profondità dell'Undo.
