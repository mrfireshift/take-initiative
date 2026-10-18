# Verifica di file e cartelle — 18 ottobre 2026

## Esito

Il progetto contiene materiale superfluo identificabile senza riorganizzare
l'architettura: 14 JSON duplicati, sette backup `.orig`, tre residui del template
Vite e un backup vuoto. I 21 log locali aggiungono circa 3,09 MiB. La pulizia di
questi gruppi libererebbe complessivamente **3,77 MiB** nella cartella di lavoro.

Altri **6,86 MiB** appartengono a due ZIP e a un report performance storico:
sono estranei alla build, ma contengono materiale storico da conservare altrove
prima dell'eventuale rimozione. Il totale delle due operazioni sarebbe circa
**10,64 MiB**, senza contare gli asset da verificare separatamente.

La quantità di sorgenti nella root di `src/` non giustifica da sola uno
spostamento: quasi tutti partecipano alla build. La pulizia del repository e
l'ottimizzazione delle prestazioni del plugin sono interventi distinti.

**Intervento eseguito:** aggiunta di questo rapporto. Nessuna cancellazione,
nessuno spostamento e nessuna modifica a sorgenti, configurazioni o dati.
`dist/` è stata rigenerata dal comando di build.

## Metodo e perimetro

- Inventario ricorsivo dei file, compresi quelli nascosti e ignorati da Git.
- Rilevazione dello stato Git prima dell'intervento: 68 file modificati e
  22 file non tracciati. Sono lavoro preesistente, non materiale da scartare.
- Confronto SHA-256 dei file duplicati e confronto JSON delle sorgenti raw
  con nomi uguali.
- Ricerca di import, URL, riferimenti HTML/CSS, generatori, test e workflow CI.
- Ricostruzione statica delle dipendenze, seguita da una build Vite aggiuntiva
  con `write: false` e ispezione di `getModuleIds()` / `getModuleInfo()`.
  Quest'ultima verifica non scrive bundle e non modifica la configurazione.
- Ispezione del contenuto degli ZIP, senza estrarli nel progetto.
- Verifica dei collegamenti Markdown locali esistenti: nessuna destinazione
  mancante rilevata dal controllo automatico dei link inline.

L'assenza di riferimenti nel codice corrente non prova che un URL pubblico
non sia conservato in una scena OBR, nei preferiti o in strumenti esterni.
Per questo gli asset e le pagine legacy hanno una classificazione separata.
Non è stata eseguita una verifica interattiva in una room Owlbear Rodeo.

## Dimensioni iniziali

Dimensioni logiche dei file, non spazio allocato dal filesystem; 1 MiB =
1.048.576 byte. Misure precedenti all'aggiunta di questo rapporto e alla build.

| Area | File | MiB | Valutazione |
| --- | ---: | ---: | --- |
| `src/` | 351 | 8,56 | Sorgenti e cataloghi; pulizia mirata. |
| `public/` | 78 | 8,28 | Asset distribuiti, anche quando non importati. |
| `data/` | 28 | 9,90 | Fonti canoniche, audit e dati di supporto. |
| `docs/` | 127 | 7,76 | Guide, contratti, archivio e sorgenti raw. |
| `test/` | 414 | 4,27 | Include 405 file `*.test.js`, fixture e backup. |
| `test-support/` | 23 | 0,28 | Harness, fake SDK e pagine di prova. |
| `scripts/` | 16 | 0,27 | Tutti hanno riferimenti in package, config o documentazione. |
| File nella root | 71 | 6,93 | Comprendono HTML, log, ZIP e report. |
| `node_modules/` | 566 | 33,89 | Dipendenze installate, rigenerabili. |
| `dist/` | 232 | 13,46 | Output di distribuzione, rigenerabile. |
| `.git/` | 3.185 | 98,94 | Cronologia e database Git. |

Il contenuto escluso `.git/` occupava **93,65 MiB**. Escludendo anche
`node_modules/` e `dist/`, restavano **1.113 file e 46,30 MiB**, inclusi log e
materiale locale. Completano l'inventario `.github/` (2 file, 2.873 byte),
`.codex/` (2 file, 49.876 byte) e `.claude/` (1 file, 416 byte).

## 1. Candidati alla pulizia con evidenza forte

### Duplicati JSON: 14 file, 673.823 byte

I seguenti file in `docs/archive/raw-duplicates/` sono identici byte per byte
ai file con lo stesso nome in `data/class-features/`. SHA-256 verificato durante
questo audit; mantenere le copie sotto `data/class-features/`.

```text
phb2014_livello_meccanico_schema_v1_1.json
ranger_revised_database_finale.json
ranger_revised_database_report_finale.json
ranger_revised_livello_meccanico_report_v1_0.json
ranger_revised_livello_meccanico_schema_v1_0.json
ranger_revised_livello_meccanico_v1_0.json
ranger_revised_manifest_integrazione.json
tasha_livello_meccanico_report_v1_0.json
tasha_livello_meccanico_schema_v1_0.json
xanathar_livello_meccanico_report_v1_0.json
xanathar_livello_meccanico_schema_v1_0.json
xanathar_livello_meccanico_v1_0.json
xanathar_sottoclassi_database_finale.json
xanathar_sottoclassi_database_report_finale.json
```

Non sono input dei generatori o del runtime. La loro rimozione richiederebbe
di aggiornare le descrizioni in `docs/archive/raw-duplicates/README.md` e
`docs/archive/README.md`. La cartella contiene anche uno ZIP distinto, trattato
più avanti: non cancellarla ricorsivamente come se tutto fosse duplicato.

### Backup di patch: sette file, 38.284 byte

```text
src/saveSpellCore.js.orig
src/spellApplicationPlanCore.js.orig
src/spellAreaStyleCore.js.orig
test/deferredSpellWorkflow.test.js.orig
test/reminderResolutionUi.test.js.orig
test/spellAreaStyleCore.test.js.orig
test/spellColorCore.test.js.orig
```

Non sono moduli della build né test `*.test.js`. Sono tutti tracciati da Git,
quindi possono restare recuperabili nella cronologia dopo una rimozione
versionata. **Non sono identici ai file correnti:** sono backup storici, non
duplicati byte per byte. Non trasferire automaticamente il loro contenuto
nei file attivi.

### Residui Vite e backup vuoto: quattro file, 2.870 byte

| File | Evidenza |
| --- | --- |
| `src/counter.js` | Contiene il contatore dimostrativo `setupCounter()`; nessun chiamante e assente dal grafo reale Vite. |
| `src/javascript.svg` | Asset del template senza riferimenti correnti. |
| `src/style.css` | Stili del template, senza import o link; assente dalla build. |
| `concentration-widget-backup.js` | File vuoto, senza riferimenti. |

`public/vite.svg` è un altro residuo del template, ma **è ancora referenziato**
come favicon da `index.html`. Per rimuoverlo serve prima aggiornare quel link.
Anche il titolo di `index.html` è ancora `Vite App`: piccolo intervento di
presentazione separato dalla pulizia dei file inutilizzati.

### Log: 21 file, 3.241.760 byte

Tutti sono nella root, ignorati tramite `*.log` e legati a build, test o server
locali: 19 file `.boss*.log` e due `.codex-vite-5184*.log` vuoti.
Non sono input della build. I risultati storici necessari vanno conservati
prima della rimozione; per i log di server verificare che il processo che li
scrive sia terminato.

La directory `logs/` è già ignorata: indirizzare lì i prossimi log evita di
riempire la root senza cambiare il runtime.

## 2. Materiale da archiviare fuori dalla cartella di lavoro

| File | Byte | Evidenza e destinazione proposta |
| --- | ---: | --- |
| `src.zip` | 1.582.225 | Snapshot di 318 file: 200 identici ai file correnti, 118 differenti, nessun percorso mancante. Nessun riferimento corrente. Conservare come backup esterno se serve quello stato storico. |
| `docs/archive/raw-duplicates/module.zip` | 3.430.780 | Pacchetto di 62 file con immagini, compendi e altri contenuti non equivalenti al progetto. Citato dal README dell'archivio, senza consumo rilevato nei tool del progetto. Conservare separatamente se serve come riferimento. |
| `audit-final-perf.json` | 2.183.416 | Report `take-initiative-performance-v1`, riferito al commit `085e3a84e1edcac915cb49a3d069b453843aae56`. Nessun riferimento corrente rilevato. Archiviare come evidenza performance con identificativo del commit. |

Questi file sono tracciati. Toglierli dalla versione corrente ridurrebbe la
cartella di lavoro, **senza eliminare le copie dalla cronologia Git**.
Spostarli semplicemente in un'altra cartella interna migliora l'ordine ma non
riduce lo spazio complessivo.

## 3. Asset senza riferimenti nel codice corrente

Dieci file in `public/`, complessivamente **49.457 byte**:

```text
conditions.png
initiative-card.svg
lair.png
speed.svg
spell-token-arcane-hand.svg
spell-token-arcane-sword.svg
spell-token-blade-of-disaster.svg
spell-token-spiritual-weapon.svg
zoom-on-token.svg
zoom.svg
```

Non sono emersi riferimenti ai loro nomi nei sorgenti, nelle pagine esaminate,
nei generatori o nei test. I quattro token SVG hanno equivalenti WebP usati
esplicitamente da `src/spellBoardTokenCore.js`.

**Classificazione: candidati, non cancellazioni automatiche.** Le vecchie
scene possono conservare URL di asset in item persistenti. Prima di rimuovere
asset già pubblicati verificare le scene interessate o mantenerli per
compatibilità. Vite copia `public/` nell'output anche se gli asset non sono
importati: qui esiste un risparmio nel pacchetto distribuito, ma limitato.

`public/conditions-panel.svg` e `public/plugin-icon.svg` sono identici, ma
entrambi hanno riferimenti attivi: rispettivamente interfaccia e manifest.
La sola uguaglianza del contenuto non rende uno dei due eliminabile.

## 4. Codice escluso dalla build, da esaminare separatamente

Su 347 file `.js`, `.ts`, `.json` e `.css` sotto `src/`, la build Vite ha caricato
335 file e ne ha esclusi 12. La rilevazione riguarda la configurazione corrente
con **36 ingressi HTML**. I 12 comprendono `counter.js` e `style.css`, già
classificati sopra, e i seguenti dieci file:

| File | Valutazione |
| --- | --- |
| `src/ctx-conditions.ts` | Referenziato dai due HTML legacy, esclusi dagli ingressi Vite. Verificare il percorso completo prima di rimuovere il gruppo. |
| `src/effectsHoverTool.js` | Esporta `mountEffectsHoverTool()` / `unmountEffectsHoverTool()`, senza chiamanti rilevati. Candidato alla dismissione dopo verifica della funzionalità prevista. |
| `src/effectsMutationUndoCore.js` | Usato da numerosi test e documenti; nessun import runtime rilevato. Riguarda mutazioni/Undo: mantenere fino a una revisione dedicata. |
| `src/effectsUndoTransportCore.js` | Importato dal test di compattazione Undo, escluso dalla build. `effectsMutations.js` definisce una propria funzione locale con lo stesso nome `compactBackgroundUndoTransportResult()`. Verificare intenzione e copertura prima di riunire o eliminare implementazioni. |
| `src/spellsPanelAutomationViewCore.js` | Usato dal relativo test, nessun consumatore runtime rilevato. |
| `src/spellsPanelCasterSummaryView.js` | Usato dal relativo test, nessun consumatore runtime rilevato. |
| `src/spellsPanelCatalogMenu.js` | Usato dal relativo test, nessun consumatore runtime rilevato. |
| `src/spellsPanelFormWorkflow.js` | Usato dal relativo test, nessun consumatore runtime rilevato. |
| `src/spellsPanelOverviewView.js` | Usato dal relativo test, nessun consumatore runtime rilevato. |
| `src/spells-supplements-2014.json` | Output del generatore e input dei test del catalogo: da mantenere anche se il runtime usa `spells-supplements-runtime.json`. |

I cinque moduli `spellsPanel*` elencati totalizzano **30.080 byte**. Prima di
rimuoverli insieme ai relativi test, stabilire se sono componenti legacy o
contratti che si intende mantenere. L'assenza dalla build non decide questo.

`src/staticSpellZoneRemovalCore.js` è invece caricato da Vite ma risulta
completamente escluso dall'output tramite tree shaking. Questo è un ulteriore
motivo per distinguere file presenti, moduli caricati e codice distribuito.
Non è stato classificato come materiale eliminabile.

Intervenire sui moduli Undo o sui percorsi delle condizioni può coinvolgere
metadata e riconciliazione. In conformità ad `AGENTS.md`, serve spiegare il
rischio specifico prima di qualsiasi modifica a quei sistemi.

## 5. HTML duplicati e compatibilità dei percorsi

`ctx-conditions.html` e `public/ctx-conditions.html` sono identici (3.128 byte
ciascuno). Nessun chiamante corrente del loro URL è emerso dall'analisi.
L'apertura delle condizioni dal tracker usa invece `effects-modal.html`.

Entrambi gli HTML legacy puntano a `/src/ctx-conditions.ts`. Nessuno è tra i
36 ingressi di `vite.config.js`; la copia in `public/` finisce in `dist/`
senza trasformazione. Non costituisce quindi una pagina compilata autonoma.

Proposta: trattare i due HTML e il relativo TS come un unico percorso legacy
da verificare in OBR, poi decidere la dismissione o l'integrazione nella build.
Non limitarsi a eliminare la copia pubblica lasciando una pagina attesa ma
non generata.

`ctx-spells.html` e `spells-modal.html` sono anch'essi identici, ma sono due
ingressi Vite e URL referenziati da flussi diversi. **Mantenere entrambi.**
I numerosi altri HTML nella root sono ingressi effettivi, non scarti di build.

## 6. Cartelle e file da mantenere

- **`data/class-features/`**: sorgenti canoniche lette da
  `generate-class-feature-catalog.mjs`; preservare cataloghi, overlay e schema.
- **JSON runtime in `src/`**: la build non esegue automaticamente tutti i
  generatori. La possibilità di rigenerarli non li rende eliminabili.
- **`docs/class-features/raw/`**: contiene 12 file e 2.435.292 byte.
  Sette JSON hanno omonimi sotto `data/class-features/`, ma sono tutti diversi
  anche dopo il parsing JSON. Non sono copie equivalenti. Gli input spell
  possono essere forniti ai generatori tramite `--input`, `--xanathar` e
  `--tasha`: l'assenza di import statici non basta a dichiararli inutili.
- **`docs/archive/generated/`**: il generatore dei supplementi scrive ancora
  qui `REVISIONE_INCANTESIMI_SUPPLEMENTI.md`; non è una cartella abbandonata.
- **`docs/archive/`**: serve a tracciabilità e provenienza. La ridondanza certa
  riguarda i 14 JSON già verificati, non l'intero archivio.
- **`test/` e `test-support/`**: test Node e harness browser/performance hanno
  funzioni diverse. I fake SDK dei tre harness browser sono configurati
  separatamente: non accorparli soltanto perché hanno lo stesso nome.
- **`scripts/`**: tutti i 16 script sono agganciati a `package.json`, alla
  configurazione Vite o a documentazione di diagnostica. Anche
  `investigate-speed-check.mjs`, pur senza script npm, è documentato.
- **`.claude/launch.json`**: configura i server di anteprima e sviluppo; il
  fatto che sia non tracciato non lo rende superfluo.
- **`.codex/savestates/`**: patch e stato di recupero. Archiviare solo dopo
  aver verificato che non contengano lavoro da recuperare.
- **`.github/`, `.node-version`, `package-lock.json`, `AGENTS.md` e
  `THIRD_PARTY_NOTICES.md`**: CI, ambiente, riproducibilità, regole e attribuzioni.
- **`node_modules/` e `dist/`**: già ignorate e rigenerabili con `npm ci` e
  `npm run build`. La loro rimozione recupererebbe circa 47,35 MiB iniziali,
  ma interromperebbe l'uso locale finché non vengono rigenerate.
- **`.git/`**: preservare la cronologia. `git count-objects -vH` riporta
  56,86 MiB di oggetti loose e 41,86 MiB di pack, con 2.692 oggetti
  prune-packable. Valutare manutenzione Git separata; nessuna compattazione,
  pulizia di oggetti o riscrittura della cronologia è stata eseguita.

Non sono state trovate directory vuote sotto `docs/` o `test-support/`.

## 7. Riordino proposto, senza migrazione dell'architettura

1. **Pulizia dei residui:** rimuovere in una patch dedicata i 14 JSON duplicati,
   i sette `.orig`, i tre file del template inutilizzati e il backup vuoto;
   aggiornare i due README dell'archivio. Recupero: 714.977 byte.
2. **Materiale locale:** conservare i log necessari, chiudere eventuali processi
   che li scrivono e pulire i vecchi log. Usare `logs/` per i prossimi output.
3. **Snapshot ed evidenze:** archiviare esternamente i due ZIP e il report
   performance storico. Per i nuovi report temporanei scegliere una directory
   di output ignorata, per esempio `reports/performance/`, mentre le evidenze
   da conservare restano versionate e nominate per data/commit.
4. **Backlog unico:** riconciliare manualmente le voci di `backlog.txt` con
   `BACKLOG.md`. Il TXT contiene richieste proprie su spell, aure e animazioni,
   quindi non va cancellato come duplicato prima di trasferirle o verificarle.
5. **Documentazione:** mantenere guide e contratti correnti nelle posizioni
   attuali. Spostare in archivio solo piani verificati come conclusi, aggiornando
   i link; nessuno spostamento massivo di `docs/class-features/`.
6. **Revisione legacy separata:** decidere il destino dei cinque moduli UI,
   dell'hover tool e del percorso `ctx-conditions` con verifiche specifiche.
   Tenere fuori da questa pulizia le modifiche ai moduli Undo.
7. **Prevenzione:** valutare regole `.gitignore` per futuri `*.orig`, `*.rej`
   e report temporanei. Queste regole non smettono di tracciare i file già
   versionati e non sostituiscono la rimozione esplicita dei candidati.

Non propongo di spostare ora gli HTML sotto una nuova cartella `pages/`, né
di suddividere in massa `src/`: occorrerebbe aggiornare ingressi, URL OBR,
test e riferimenti distribuiti. L'audit non evidenzia un vantaggio sufficiente
per includere questa migrazione nella pulizia iniziale.

La documentazione richiede anche un riallineamento mirato: README e backlog
riportano ancora versione 1.3.0 e conteggi storici, mentre package e manifest
sono 1.4.0. Guide e report duplicano alcune informazioni: stabilire per ciascun
conteggio la fonte autorevole è più utile di cancellare documenti in blocco.

## Verifiche eseguite

| Controllo | Esito |
| --- | --- |
| `npm run build` | PASS, exit 0; 4,96 secondi nella misura di Vite. |
| Build Vite con ispezione del grafo e `write: false` | PASS; 502 moduli caricati complessivamente, incluse dipendenze e moduli virtuali. |
| `npm run check:spells` | PASS; 319 SRD, 477 nel catalogo completo, 358 trackable. |
| `npm run verify:version` | PASS; package, lockfile e manifest concordano su 1.4.0. |
| SHA-256 dei 14 JSON archiviati | PASS; tutti identici alle rispettive copie canoniche. |

La build segnala chunk superiori a 500 kB: catalogo class features circa
1.338 kB e catalogo spell circa 1.025 kB minificati. È un tema di caricamento
dei cataloghi, da affrontare eventualmente con un intervento prestazionale
dedicato. Rimuovere backup, documentazione o moduli già esclusi dalla build
non riduce quei chunk.

La suite completa `npm test` non è stata eseguita: questo intervento aggiunge
soltanto documentazione e non applica la pulizia proposta. Dopo una futura
rimozione di sorgenti, fixture o moduli condivisi serviranno test appropriati
alle dipendenze toccate, oltre alla build e ai controlli dei cataloghi.
