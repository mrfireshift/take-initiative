# Sviluppo e release

## Preparazione

Usa la versione di Node indicata in `.node-version`. Sono supportati Node
`20.19.x` oppure `22.12.0` e successivi; la CI usa Node `24.15.0`.

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

## Struttura del progetto

```text
public/                 asset statici e manifest Owlbear Rodeo
scripts/                generatori e controlli del catalogo
src/                    codice applicativo
test/                   test unitari e di regressione
*.html                  entry point dei popup e delle pagine Vite
vite.config.js          configurazione multi-page della build
```

Moduli da individuare prima di una modifica:

- tracker e card: `src/initiativeList.js`;
- stato ordine: `src/initiativeOrderCore.js`;
- profili tra scene: `src/initiativeCards.js`;
- HP sulla mappa: `src/hpbar-items.js`;
- memoria HP: `src/hpMemory.js`;
- condizioni: `src/conditions.js`, `src/effects-modal.ts`;
- incantesimi: `src/spells.js`, `src/spells-panel.js`, `src/spells-tag.js`;
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
- pill a diversi livelli di zoom;
- condizioni che bloccano o dimezzano il movimento;
- Prono: rialzata e costo doppio.

### Strumenti mappa

- quota positiva, negativa e zero;
- distanza tra token 1×1 e token grandi;
- AoE da centro e vertice della casella;
- rotazione libera del cono;
- spostamento di un'area persistente e riselezione;
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

Il catalogo è generato da dati SRD 5.1. Non modificare manualmente un file generato senza aggiornare anche lo script sorgente. Dopo qualsiasi intervento esegui `npm run check:spells`.

Le attribuzioni richieste sono in `THIRD_PARTY_NOTICES.md` e devono accompagnare le distribuzioni del plugin.
