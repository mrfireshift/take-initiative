# Sviluppo e release

## Preparazione

Usa la versione di Node indicata in `.node-version` (`24.15.0` nel repository
corrente). Il `package.json` supporta anche Node `20.19.x` oppure `22.12.0` e
successivi.

```bash
npm ci
npm run dev
```

Lo sviluppo usa Vite. Installa il manifest esposto dal server locale nella room di test e mantieni separate una sessione GM e una sessione player.

## Script npm

| Comando | Scopo |
| --- | --- |
| `npm run dev` | Server Vite con hot reload |
| `npm run build` | Build di produzione in `dist/` |
| `npm run preview` | Anteprima locale della build |
| `npm test` | Suite Node Test Runner |
| `npm run verify:version` | Verifica che package, lockfile e manifest abbiano la stessa versione |
| `npm run verify:dist` | Verifica versione e identità della build in `dist/` |
| `npm run artifact:checksums` | Genera gli SHA-256 dei file di `dist/` |
| `npm run check:spells` | Verifica integrità del catalogo incantesimi |
| `npm run generate:spells` | Rigenera il catalogo SRD |
| `npm run generate:spell-translations` | Rigenera le traduzioni del catalogo |
| `npm run generate:supplement-spells` | Rigenera le definizioni di Tasha e Xanathar |
| `npm run generate:phb2014-extra` | Rigenera le integrazioni PHB 2014 |
| `npm run generate:class-features` | Rigenera il catalogo runtime delle capacità di classe |
| `npm run audit:class-features` | Rigenera audit JSON e Markdown delle capacità |
| `npm run audit:barbaro` | Genera l'audit mirato delle capacità del Barbaro |

## Struttura del progetto

```text
public/                 asset statici e manifest Owlbear Rodeo
scripts/                generatori e controlli del catalogo
data/class-features/    cataloghi e overlay sorgente delle capacità di classe
src/                    codice applicativo
src/class-features-runtime.json  catalogo runtime generato
test/                   test unitari e di regressione
docs/                   guide correnti, contratti e audit tracciabili
*.html                  entry point dei popup e delle pagine Vite
vite.config.js          configurazione multi-page della build
```

Moduli da individuare prima di una modifica:

- tracker e card: `src/initiativeList.js`;
- stato ordine: `src/initiativeOrderCore.js`;
- profili tra scene: `src/initiativeCards.js`;
- fazioni persistenti: `src/factionRegistry.js`, `src/factionRegistryCore.js`,
  `src/faction-configurator.ts`;
- HP sulla mappa: `src/hpbar-items.js`;
- memoria HP: `src/hpMemory.js`;
- condizioni: `src/conditions.js`, `src/effects-modal.ts`;
- incantesimi e registro: `src/spells.js`, `src/spells-panel.js`,
  `src/spellsPanelViewCore.js`, `src/spells-tag.js`;
- catalogo e automazioni: `src/spells-srd.js`,
  `src/supplementSpellRules.js`, `src/phb2014SpellRules.js`,
  `src/spellEffectCore.js`;
- aree spell: `src/spellAreaCatalog.js`, `src/spellAreaRules.js`,
  `src/spellAreaPlacementCore.js`;
- zone e membership: `src/spellStaticZone.js`,
  `src/spellStaticZoneCore.js`, `src/spellAreaMembershipCore.js`,
  `src/spellZoneTriggerCore.js`;
- aure: `src/spellAuraCore.js`, `src/spellAuraController.js`;
- reminder: `src/effectSaveReminderCore.js`,
  `src/effectSaveReminderController.js`, `src/zoneTriggerNoticeCore.js`;
- preparazione e azioni attive: `src/preparedSpellResolutionCore.js`,
  `src/preparedSpellResolutionController.js`, `src/spellActiveActionCore.js`;
- azioni rapide: `src/quickActionsCore.js`,
  `src/quickActionExecution.js`;
- capacità di classe: `src/classFeatureCatalog.js`, `src/classFeatureCore.js`,
  `src/classFeatureRuntime.js`, `src/classFeatureAuraController.js`;
- movimento: `src/speedCheck.js`, `src/speedCheckCore.js`;
- log e Undo: `src/combatLog.js`, `src/history.js`, `src/history-modal.ts`;
- clock: `src/clocks*.js`;
- quota/distanza: `src/distance3d*.js`, `src/elevationLabel.js`;
- AoE: `src/aoeTargetTool.js`, `src/aoeGeometryCore.js`, `src/aoeStyle.js`.

## Regole per le modifiche

1. Identifica la funzione esatta coinvolta.
2. Mantieni invariati nomi di file, funzioni e chiavi metadata salvo migrazione esplicita.
3. Fai merge dei metadata; non sostituire oggetti completi.
4. Non bypassare code, revisioni o controlli contro lo stato stantio.
5. Non assumere che ogni ID nell'ordine sia un token reale.
6. Non salvare larghezze delle barre HP come dati.
7. Verifica sempre entrambi i ruoli GM e player.

## Test consigliati per area

### Tracker

- avvio, avanzamento, ritorno e cambio round;
- gruppi omonimi in alto e in fondo alla lista;
- gruppi con più di 10 membri;
- tie di iniziativa e drag;
- passaggio esteso/compatto;
- navigazione con ID Lair, Paragon ed Epic.

### HP

- modifica singola dalla card;
- modifica inline;
- danno rapido su almeno 12 token;
- cura, danno, HP temporanei e fattori diversi;
- aggiornamento immediato di card, barra e testo sulla mappa;
- Undo del batch.

### Condizioni e incantesimi

- più istanze con durate diverse;
- scadenza a inizio/fine turno e cambio round;
- interruzione della concentrazione;
- fine naturale della durata con pulizia di zone, aure ed effetti figli;
- pill a diversi livelli di zoom;
- condizioni che bloccano o dimezzano il movimento;
- Prono: rialzata e costo doppio.

### Registro, zone e reminder

- lanciare la stessa spell dal pannello Incantesimi e dalla Console effetti ad
  area, verificando un solo modello di registro;
- almeno quattro token validi consecutivi e un token non coinvolto;
- reminder sul primo e sul secondo token e ricomparsa nei round successivi;
- aggregazione di più reminder sullo stesso attore;
- chiusura del reminder quando il nuovo attore non ha eventi;
- trigger distinti a inizio e fine turno, per esempio Fame di Hadar;
- ingresso, movimento, attraversamento, uscita e permanenza nella zona;
- nessuna applicazione automatica di condizioni subordinate a un tiro fisico;
- lettura della CD dal caster e fallback leggibile quando manca;
- risoluzione preparata senza una seconda istanza di concentrazione;
- azione attiva dal registro e rifiuto di bersagli già usati, quando previsto;
- pulizia al termine della concentrazione e alla scadenza naturale;
- zone sovrapposte con effetti figli indipendenti;
- geometria rettangolare su direzioni cardinali e diagonali.

### Capacità di classe e fazioni

- build multiclasse fino al limite previsto, livelli e sottoclassi;
- distinzione tra capacità `implemented` e `not-automated`;
- consumo, recupero e reset delle risorse;
- effetti su sé stessi, bersaglio singolo e aura;
- pulizia delle condizioni per `instanceId` senza rimuovere condizioni manuali;
- configurazione di fazioni su più token e riuso del registry per nuovi asset;
- conflitto tra nomi uguali associati a fazioni diverse.

### Strumenti mappa

- quota positiva, negativa e zero;
- distanza tra token 1×1 e token grandi;
- AoE da centro e vertice della casella;
- rotazione libera del cono;
- spostamento di un'area persistente e riselezione;
- appartenenza e terreno difficile di zone statiche e aure mobili;
- visibilità GM/player dei clock.

## Checklist di release

1. Aggiorna la versione in `package.json`, `package-lock.json` e `public/manifest.json`.
2. Controlla `git status` e separa cambiamenti estranei.
3. Esegui:

   ```bash
   npm ci
   npm run verify:version
   npm test
   npm run check:spells
   npm run build
   npm run artifact:checksums
   npm run verify:dist
   ```

4. Verifica manualmente caricamento room, tracker, popup e strumenti toolbar.
5. Prova la vista player in una seconda sessione.
6. Crea commit e tag annotato della release.
7. Pubblica branch e tag.
8. Distribuisci l'intero contenuto di `dist/`.

La CI esegue lo stesso gate su push e pull request. Il workflow manuale
`Release artifact` genera un artifact immutabile nominato con versione e SHA,
ma non esegue il deploy.

## Catalogo incantesimi e attribuzioni

Il catalogo runtime unisce SRD 5.1, Xanathar, Tasha, integrazioni PHB 2014 e
alias legacy. Non modificare manualmente un file generato senza aggiornare
anche lo script sorgente. Dopo qualsiasi intervento esegui
`npm run check:spells`.

Il catalogo capacità segue lo stesso principio: modificare i dati in
`data/class-features/`, eseguire `npm run generate:class-features` e poi
`npm run audit:class-features`. Il report in `docs/AUDIT_CAPACITA_CLASSE.md` e
il JSON di audit sono artefatti generati.

Le automazioni curate non devono essere dedotte automaticamente dalla sola
descrizione. Ogni nuova regola deve dichiarare in modo verificabile:

- momento del trigger;
- frequenza;
- tipo di risoluzione;
- caratteristica del tiro salvezza;
- effetto informativo o condizione figlia;
- legame con concentrazione e fine dell'istanza;
- geometria e politica di membership, quando applicabili.

Per il comportamento atteso consulta
[Incantesimi, zone e reminder](INCANTESIMI_E_ZONE.md).

Le attribuzioni richieste sono in `THIRD_PARTY_NOTICES.md` e devono accompagnare le distribuzioni del plugin.
