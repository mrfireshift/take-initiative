# Attacchi dei mostri — fase 3: archivio online (piano)

Stato: **lotti 1–4 fatti; lotto 6 pianificato il 27/10/2026, in attesa delle decisioni; lotto 5 (documentazione) dopo.**

Decisioni confermate: campo dell'indirizzo vuoto, con l'indirizzo nella guida (D1); basi dei derivati scaricate da sole (D2); aggiornamento solo con **Aggiorna** (D3); Open5e fuori (D4). In più l'utente apre la possibilità **opzionale** di importare statblock delle regole 2024 (lotto 6). Va fatta prima del lotto 4
della [fase 2](PIANO_ATTACCHI_MOSTRI_FASE_2.md) (richiesta del 26/10/2026);
le due cose non si toccano.

## Obiettivo

Il GM sceglie **una volta** i libri che gli servono (per Icewind Dale: il
bestiario della campagna e il Manuale dei Mostri 2014). Il plugin li scarica
dall'archivio online, li tiene nella memoria del browser del GM e da lì in poi
la scheda li cerca e li importa senza copiare JSON, anche senza rete.
Lettura, mostri derivati e sezioni restano quelli della fase 2.

## Deviazioni dal piano emerse in implementazione

- **Lotto 1.** `src/fiveToolsArchiveCore.js`. L'indirizzo accetta la cartella dei dati in ogni forma (con o senza `/`, l'indirizzo dell'indice o di un file), solo `https` (`http` soltanto per un server locale) e mai con credenziali; i nomi dei file sono solo `bestiary-….json`. Sull'indice vero del mirror: 112 libri, 16 segnati «regole 2024» (i tre manuali 2024 e ciò che è uscito da settembre 2024; Vecna: Eve of Ruin, di maggio 2024, resta 2014), 13 senza nome noto mostrati col codice.
- **Lotto 2.** `src/fiveToolsArchiveStore.js`, database `<ID>.fivetools-archive` con due store: `bookInfo` (ciò che il pannello elenca) e `bookData` (il file), così l'elenco non legge mai i file; chiave il codice del libro senza maiuscole. Senza IndexedDB o con lo spazio esaurito il libro resta per la sessione (`persisted: false`, con il motivo). Prova nel Chrome vero il 26/10 dal mirror: indice in 1,3 s; Icewind Dale (158 KB) scaricato in 0,24 s e salvato in 4 ms; Manuale dei Mostri (1,5 MB) in 0,28 s e 28 ms; i 533 mostri riletti in 9 ms.
- **Lotto 3.** Opzione locale `tools.fiveToolsArchive` (vuota di default), salvata già normalizzata (`…/data/`); un indirizzo non valido non si salva. **Prova** legge l'indice con un limite di 15 secondi e dice quanti libri trova («112 libri, 96 delle regole 2014» sul mirror, «l'archivio risponde 404» su un indirizzo sbagliato). L'indirizzo del mirror è scritto solo in `docs/IMPORT_SCHEDA.md` (D1).
- **Lotto 4.** `src/fiveToolsArchiveClient.js` (rete, con limite di 30 secondi e errori in italiano) e `src/fiveToolsArchivePanel.js` (il riquadro **Archivio online** a scomparsa nel pannello Importa). L'elenco dei libri si legge solo quando il GM apre il riquadro; i libri tenuti entrano nell'elenco dei mostri appena si apre **Importa**, prima dei file caricati, che così hanno la precedenza; senza indirizzo i libri tenuti restano usabili. Il risolutore dei derivati restituisce `missingSource`, e la scheda scarica quel libro una volta sola prima di riprovare. Prova nel banco con il mirror: 112 libri (16 disattivati), Icewind Dale aggiunto, Snowy Owlbear scelto → Manuale dei Mostri scaricato da solo, sezioni pronte; dopo il ricaricamento 533 mostri disponibili senza rete.

## La fonte (verificata il 26/10/2026)

| Fonte | Risponde a un'estensione | Contenuto |
| --- | --- | --- |
| Mirror GitHub di 5eTools (`raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data/`) | sì (`Access-Control-Allow-Origin: *`) | tutti i bestiari, stesso formato della fase 2 |
| 5e.tools | no (403) | — |
| Open5e | sì | solo SRD e OGL: niente Icewind Dale né Manuale dei Mostri completo; formato diverso (fuori da questa fase) |

Struttura del mirror usata:

- `bestiary/index.json` (3,5 KB): libro → file (`"IDRotF": "bestiary-idrotf.json"`), 112 libri.
- `bestiary/bestiary-<libro>.json`: i mostri del libro (Icewind Dale 160 KB,
  Manuale dei Mostri 1,5 MB).

Il mirror può sparire senza preavviso (ospita contenuti WotC fuori dall'SRD):
l'indirizzo è un'opzione, e **Carica file** della fase 2 resta il ripiego.

## 2014 di base, 2024 a scelta

- Un elenco interno dei libri con nome e anno di uscita (Monster Manual 2014,
  Volo, Tomo dei Nemici, Mostri del Multiverso, Icewind Dale, Tomb of
  Annihilation, Curse of Strahd…; i codici sconosciuti si mostrano col codice).
- Di base i libri delle regole 2024 (Monster Manual 2025 `XMM`, Player's
  Handbook 2024 `XPHB`, Dungeon Master's Guide 2024 `XDMG`) compaiono
  disattivati con «regole 2024» e i mostri con i tag 2024 restano esclusi,
  come oggi.
- Con l'opzione del lotto 6 accesa, libri e mostri 2024 si scaricano e si
  importano, segnati «· 2024»; le regole del tracker (condizioni, incantesimi,
  riposi) restano quelle del 2014.

## Lotti

### Lotto 1 — client dell'archivio (core puro) ✅

- Nuovo `src/fiveToolsArchiveCore.js`: indirizzi dell'indice e dei file a
  partire dalla base configurata, lettura dell'indice, elenco dei libri con
  nome, anno e «regole 2024», controllo del file scaricato (un bestiario con
  `monster[]` del libro atteso), record della cache (libro, file, data,
  dimensione, numero di mostri, versione del formato).
- Test con indice e file finti; nessuna rete nei test.

### Lotto 2 — cache locale ✅

- Nuovo `src/fiveToolsArchiveStore.js`: IndexedDB del browser del GM
  (`<ID>.fivetools-archive`), un record per libro; leggi, salva, elenca,
  rimuovi. Mai metadata di scena o di room, mai sui token.
- Spazio esaurito o IndexedDB non disponibile (finestra in incognito): un
  messaggio, e il libro si usa per la sessione senza salvarlo.
- Test con `test-support/fakeVersionedIndexedDb.js`.

### Lotto 3 — opzione della fonte ✅

- Opzione locale (questo browser) **Archivio 5eTools**: l'indirizzo base dei
  dati, nel pannello Opzioni, sezione Console attacchi, con **Prova** (legge
  l'indice e dice quanti libri trova). Vedi D1 per il valore iniziale.

### Lotto 4 — archivio nella scheda ✅

- Nel pannello **Importa**: **Archivio online** con i libri in memoria (data,
  dimensione, mostri, **Aggiorna**, **Rimuovi**) e **Aggiungi libro** (elenco
  dell'indice con ricerca; i 2024 disattivati).
- I mostri dei libri in memoria entrano nell'elenco della fase 2 insieme ai
  file caricati: stessa ricerca, stessa scelta.
- Mostro derivato con la base in un libro non in memoria: il plugin scarica
  anche quel libro (vedi D2) e lo dice nello stato.
- Rete solo quando il GM aggiunge o aggiorna un libro; mai durante il turno,
  mai dai giocatori.

### Lotto 6 — statblock 2024 opzionali (piano dettagliato del 27/10/2026)

Stato: **piano, in attesa delle decisioni dell'utente**. Riscritto dopo le fasi 4 e 5: oltre ad attacchi e azioni a
TS, un mostro 2024 deve passare anche da incantesimi, leggendarie, testo dello statblock ed effetti letti ad euristica.

Il principio non cambia: il plugin gioca con le regole del 2014 (condizioni, indebolimento, riposi, incantesimi del
catalogo SRD). Un mostro 2024, a opzione accesa, si importa e si esegue con quelle regole; l'import lo dice.

#### Misure sul Monster Manual 2025 (`XMM`, 503 mostri, 1132 azioni)

| Cosa | Quante |
| --- | --- |
| Azioni lette oggi dall'adapter, se si togliesse solo il rifiuto | 0 su 1168 (tutte «al tavolo») |
| Attacchi `{@atkr m\|r\|m,r} {@hit N}, reach … / range …` (senza «to hit») | 651 |
| Azioni a TS `{@actSave dex} {@dc 21}, … {@actSaveFail} … {@actSaveSuccess} Half damage.` | 284 |
| Condizioni scritte «has the {@condition Poisoned\|XPHB} condition» | 281 |
| Aree «Emanation originating from the …» (sfera attorno al mostro) | 32 |
| Danni extra condizionati («plus 2 (1d4) Slashing damage if the attack roll had Advantage») | 4 |
| Tiri ripetuti «repeats the save at the end of each of its turns» | 29 (49 «repeats the save» in tutto) |
| Mostri con incantesimi / blocchi con slot | 132 / 0: solo «at will» e «X/Day», anche come azione bonus (32) o reazione (15) |
| Incantesimi distinti / non nel catalogo SRD | 154 / 12 (Mind Spike, Ice Knife, Elementalism…; Melf's Acid Arrow con l'alias) |
| Leggendarie | 43 mostri; «Legendary Resistance (3/Day, or 4/Day in Lair)», `legendaryActionsLair: 4` |

Il formato 2024 è più regolare del 2014 (i tag dicono da soli cos'è un fallimento e cos'è un successo): il lettore è
un adattatore dei tag verso gli stessi campi del 2014, non un secondo motore. Console, scheda ed esecuzione restano
quelle delle fasi 1–5.

#### Lotti

1. **Opzione e sblocco.** Opzione locale **Statblock 2024** (Opzioni → Console attacchi, spenta). Accesa: l'elenco
   dell'import mostra i mostri 2024 con «· 2024», l'archivio abilita i libri 2024, i derivati da una base 2024 si
   risolvono. Spenta: tutto come oggi. Lo script di copertura prende `--2024`.
2. **Testo in chiaro 2024.** `fiveToolsPlainText` e il lettore ad euristica rendono i tag nuovi come li stampa il libro
   («Melee Attack Roll:», «Dexterity Saving Throw:», «Failure:», «Success:», «Trigger:», «Response:»), i tipi di danno in
   minuscolo, `{@variantrule Cone [Area of Effect]|XPHB|Cone}` come «Cone». Serve allo statblock originale, alle note e
   alle regole.
3. **Attacchi 2024.** `{@atkr …} {@hit N}, reach/range` → attacco con bonus, portata, gittata; i danni extra
   condizionati restano nella nota; gli effetti al colpo («has the Grappled condition (escape DC 13)», un `{@actSave}`
   dentro il colpo) dalle regole della fase 5, estese a «has the X condition».
4. **Azioni a TS 2024.** `{@actSave ability} {@dc N}` → TS e CD; il testo di `{@actSaveFail}` → danni e condizioni del
   fallimento, `{@actSaveSuccess} Half damage.` → metà, un successo che dice altro resta nella nota; area (Cone, Line,
   Cube, Sphere, Emanation dal mostro), durata e tiro ripetuto dalle regole della fase 5; `{@actSaveFail 2}` (secondo
   fallimento, la pietrificazione) nella nota.
5. **Incantesimi e leggendarie 2024.** Ogni incantesimo diventa un'azione rapida ⚡ come gli innati del 2014 (a
   volontà gratuita, X/Day con usi propri; un trucchetto a volontà nel libro); «(level 4 version)» → livello dello
   slot dell'azione rapida; nomi cercati nel catalogo SRD 2014 (vedi D3). Leggendarie e resistenze con i numeri fuori
   dalla tana (vedi D5). Tratti, reazioni e leggendarie nella scheda Capacità, come per il 2014.
6. **Misura e documentazione.** Copertura sul Monster Manual 2025 (obiettivo: le stesse quote del 2014), guida e
   formato.

#### Decisioni da confermare

1. **D1 — attivazione.** Un'opzione locale, spenta, per tutto il browser del GM (raccomandato), oppure una casella
   nel pannello Importa a ogni mostro.
2. **D2 — regole.** Il mostro 2024 si esegue con le regole 2014 del plugin (condizioni, indebolimento, riposi),
   segnalato nel rapporto «regole 2024: condizioni e regole del tracker restano quelle del 2014» (raccomandato), oppure
   si rifiutano i mostri le cui azioni dipendono da regole che cambiano (troppi per essere utile).
3. **D3 — incantesimi 2024.** Cercati per nome nel catalogo SRD 2014 (142 su 154 si trovano; il testo e
   l'automazione sono quelli 2014, segnalato) e quelli che mancano in rosso (raccomandato), oppure tutti solo come
   testo nello statblock.
4. **D4 — danni condizionati.** Solo nella nota, mai sommati (raccomandato: 4 casi, e la condizione la decide il
   tavolo), oppure una componente extra spenta da accendere a mano.
5. **D5 — la tana.** Azioni e resistenze leggendarie con i numeri fuori dalla tana, quelli nella tana nel rapporto
   (raccomandato: si cambiano dal tracker), oppure una casella «nella tana» nell'import.

### Lotto 5 — documentazione

- `docs/IMPORT_SCHEDA.md`, `docs/GUIDA_UTENTE.md`, `BACKLOG.md`, con la nota
  sulla fonte e sul ripiego.

## Rischi

- Il mirror sparisce o cambia struttura: indirizzo configurabile, controllo
  del file scaricato, file locali come ripiego.
- Peso: tutto resta nel browser del GM; un libro si legge in memoria solo
  quando serve all'import.
- Licenza: il plugin non contiene dati di 5eTools; vedi D1 sull'indirizzo
  scritto nel plugin pubblicato.
