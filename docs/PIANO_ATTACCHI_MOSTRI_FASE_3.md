# Attacchi dei mostri — fase 3: archivio online (piano)

Stato: **approvato il 26/10/2026**.

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

### Lotto 2 — cache locale

- Nuovo `src/fiveToolsArchiveStore.js`: IndexedDB del browser del GM
  (`<ID>.fivetools-archive`), un record per libro; leggi, salva, elenca,
  rimuovi. Mai metadata di scena o di room, mai sui token.
- Spazio esaurito o IndexedDB non disponibile (finestra in incognito): un
  messaggio, e il libro si usa per la sessione senza salvarlo.
- Test con `test-support/fakeVersionedIndexedDb.js`.

### Lotto 3 — opzione della fonte

- Opzione locale (questo browser) **Archivio 5eTools**: l'indirizzo base dei
  dati, nel pannello Opzioni, sezione Console attacchi, con **Prova** (legge
  l'indice e dice quanti libri trova). Vedi D1 per il valore iniziale.

### Lotto 4 — archivio nella scheda

- Nel pannello **Importa**: **Archivio online** con i libri in memoria (data,
  dimensione, mostri, **Aggiorna**, **Rimuovi**) e **Aggiungi libro** (elenco
  dell'indice con ricerca; i 2024 disattivati).
- I mostri dei libri in memoria entrano nell'elenco della fase 2 insieme ai
  file caricati: stessa ricerca, stessa scelta.
- Mostro derivato con la base in un libro non in memoria: il plugin scarica
  anche quel libro (vedi D2) e lo dice nello stato.
- Rete solo quando il GM aggiunge o aggiorna un libro; mai durante il turno,
  mai dai giocatori.

### Lotto 6 — statblock 2024 opzionali

- Opzione locale **Statblock 2024**, spenta di default: accesa, l'adapter
  legge anche i mostri 2024 e l'elenco li mostra con «· 2024».
- Lettore 2024 accanto a quello 2014 (verificato sul Monster Manual 2025):
  attacchi `{@atkr m|r|m,r} {@hit N}, reach … / range …`; azioni a tiro
  salvezza `{@actSave dex} {@dc 21}, … {@actSaveFail} … {@actSaveSuccess} Half
  damage.`; condizioni «has the {@condition Paralyzed|XPHB} condition»; aree
  «60-foot Cone», «Emanation» (sfera attorno al mostro); tipi di danno con la
  maiuscola.
- I danni extra condizionati («plus 2 (1d4) Slashing damage if the attack roll
  had Advantage») non entrano nelle componenti: vanno nella nota.
- Il rapporto aggiunge: «regole 2024: condizioni e regole del tracker restano
  quelle del 2014».
- La copertura sul Monster Manual 2025 si misura all'inizio del lotto, come
  per il 2014.

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
