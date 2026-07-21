# Installazione e configurazione

## Requisiti

- un account Owlbear Rodeo con permessi per installare estensioni nella room;
- un browser moderno;
- per lo sviluppo: Node.js e npm;
- per l'uso al tavolo: una seconda finestra browser, un secondo profilo o un secondo dispositivo collegato come player.

## Installare una build pubblicata

Owlbear Rodeo carica l'estensione da un URL che punta al file `manifest.json` della build pubblicata.

1. Pubblica il contenuto generato in `dist/` su un hosting statico accessibile via HTTPS.
2. Verifica che `<URL_BASE>/manifest.json` sia raggiungibile dal browser.
3. In Owlbear Rodeo apri la gestione delle estensioni della room.
4. Aggiungi una nuova estensione indicando `<URL_BASE>/manifest.json`.
5. Ricarica la room se l'icona di **Take Initiative!** non compare subito.

Il server deve servire i file senza autenticazione e con percorsi coerenti con la radice della build. Il manifest dichiara `background.html` e `action-launcher.html`, quindi l'intera cartella `dist/` deve essere pubblicata, non il solo manifest.

## Avvio locale per sviluppo

```bash
npm install
npm run dev
```

Vite espone normalmente la build su `http://localhost:5173`. Il manifest locale è quindi:

```text
http://localhost:5173/manifest.json
```

Se Owlbear Rodeo o il browser impediscono il caricamento di contenuti HTTP, usa un endpoint HTTPS locale o un tunnel di sviluppo. Non pubblicare una build di sviluppo contenente credenziali o dati della room.

Per provare il comportamento GM/player sullo stesso computer:

1. apri la room come GM nel browser principale;
2. apri il link di invito in una finestra anonima o in un profilo separato;
3. assegna alla seconda sessione il ruolo player;
4. usa due finestre affiancate o sposta la finestra player sul display del tavolo.

## Build di produzione

```bash
npm test
npm run check:spells
npm run build
```

L'output viene scritto in `dist/`. Prima della pubblicazione verifica:

- che `public/manifest.json` riporti la versione attesa;
- che `package.json` riporti la stessa versione;
- che `dist/manifest.json` sia presente;
- che icone, immagini e pagine HTML siano state copiate;
- che la room carichi correttamente sia il background sia il lister.

## Aggiornamento

Una build aggiornata può essere pubblicata sullo stesso URL. Per evitare cache non coerenti:

1. aggiorna la versione in `package.json` e `public/manifest.json`;
2. genera una nuova build completa;
3. sostituisci tutti i file pubblicati;
4. ricarica entrambe le finestre GM e player.

I dati di scena e token non vengono eliminati da un normale aggiornamento dell'estensione.

## Rimozione e dati persistenti

La rimozione dell'estensione dalla room impedisce il caricamento dell'interfaccia, ma non garantisce la cancellazione automatica dei metadata già scritti su token, scena e room. Questo comportamento evita perdite accidentali e permette di reinstallare l'estensione conservando il combattimento.

Le preferenze esclusivamente locali, come posizione di alcuni pannelli e stile AoE, risiedono nel `localStorage` del browser e possono essere cancellate dai dati del sito. Consulta [Risoluzione dei problemi](RISOLUZIONE_PROBLEMI.md) prima di eliminare metadata della room o della scena.
