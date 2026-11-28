# Il server dell'archivio

Lotto A2 di [PIANO_ARCHIVIO_ATTORI.md](../../docs/PIANO_ARCHIVIO_ATTORI.md). È uno script solo, senza database:
tiene un file JSON per stanza e risponde al plugin dai computer del GM. I giocatori non lo chiamano mai.

Su questo computer non c'è PHP: lo script si prova sul server vero, con il programma descritto più sotto, che
dice quale risposta non torna. Il 28 novembre 2026 ha passato tutti e quindici i controlli su un server con
PHP 8.2.

## Cosa serve

- Un server web con PHP 8.1 o più recente, raggiungibile in HTTPS con un certificato valido.
- Una cartella **fuori** da quella pubblicata dal server web, scrivibile dall'utente con cui gira PHP.

## Installazione

1. **La cartella dei dati.** Crea una cartella fuori da quella pubblicata, per esempio `ti-archivio`, con dentro
   una cartella `dati`. Dai all'utente di PHP il permesso di lettura e scrittura.
2. **La configurazione.** Copia lì `config.esempio.php` con il nome `config.php` e compila:
   - `key`: una chiave casuale di almeno 32 caratteri. In PowerShell:
     ```powershell
     -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 48 | ForEach-Object { [char]$_ })
     ```
   - `data_dir`: il percorso completo della cartella `dati`;
   - `origins`: lascia quelle che ci sono.

   Salva il file in UTF-8 **senza BOM**. In PowerShell 5.1 `Set-Content -Encoding UTF8` aggiunge il BOM, che in
   testa a un file incluso esce prima delle intestazioni e le rompe.
3. **Lo script.** Copia `archivio.php` nella cartella pubblicata e, nella copia installata, scrivi in
   `TI_CONFIG_PATH` il percorso completo di `config.php`. È l'unica riga da cambiare.
4. **I limiti di PHP.** Se PHP può leggere solo alcune cartelle (`open_basedir`), deve poter leggere la cartella
   dello script e quella del punto 1. Meglio un profilo di PHP dedicato a questo sito che allargare quello
   predefinito.

La chiave vera sta solo in `config.php` sul server e nelle Opzioni del plugin, su ogni computer del GM. Non va
nel repository né nei metadata della stanza.

## La prova

Dal computer, nella cartella del progetto:

```powershell
$env:TI_ARCHIVE_KEY = "<la chiave di config.php>"
node scripts/check-archive-server.mjs https://<nome>:<porta>/archivio.php
```

Il programma lavora in una stanza sua, `prova-…`, e alla fine la cancella. Non legge né scrive le stanze delle
campagne. Deve finire con «Tutti i 15 controlli passati».

| Cosa dice | Cosa vuol dire |
| --- | --- |
| «Il server non risponde» | indirizzo o porta sbagliati, oppure il certificato non è valido |
| «la chiave in TI_ARCHIVE_KEY non è la sua» | la chiave non è quella di `config.php` |
| `500` «configurazione non trovata» | `TI_CONFIG_PATH` è sbagliato, oppure PHP non può leggere quella cartella (punto 4) |
| `500` «chiave non impostata o troppo corta» | in `config.php` c'è ancora la chiave d'esempio, o ha meno di 32 caratteri |
| `500` «cartella dei dati assente o non scrivibile» | `data_dir` è sbagliato, o manca il permesso di scrittura |
| «restituisce il valore identico…» fallito | lo script ha riscritto il valore invece di conservarlo com'è |
| una riga `NO` su `DELETE` o `PUT` | il server web non passa quel metodo a PHP |

## Cosa tiene al sicuro

- **La chiave.** Ogni richiesta la porta nell'intestazione `X-TI-Key`. Senza, lo script risponde 401 e basta.
- **Solo HTTPS.** In chiaro la chiave si leggerebbe sulla rete.
- **I dati fuori dalla cartella pubblicata.** Il server web non li serve mai direttamente.
- **Le origini.** Da un browser risponde solo al plugin.
- **I limiti.** 128 kB per richiesta, 64 kB per sezione, 2.000 voci per stanza.
- **Le stanze di prova.** Si cancella solo una stanza il cui nome comincia per `prova-`.

Tieni aggiornati il sistema del server e PHP: lo script è esposto a Internet.

## Copie di riserva

Basta copiare la cartella `dati`: un file `.json` per stanza. I file `.lock` si possono ignorare.

## Il protocollo

È descritto in testa a [archiveServerReference.js](../../test-support/archiveServerReference.js), che è lo
stesso server scritto in JavaScript: i test del plugin parlano con quello.
