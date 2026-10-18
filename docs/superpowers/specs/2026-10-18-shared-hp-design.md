# MVP: HP condivisi tra token

Data: 18 ottobre 2026. Stato: specifica approvata dall'utente in chat.

## Obiettivo e requisiti concordati

Auril e tre token della forma titanica condividono una riserva HP. Un danno,
una cura o una modifica manuale effettuati su un membro aggiornano tutti.
Auril rimane nell'iniziativa; i token secondari restano sulla mappa e fuori
dall'iniziativa, continuando a essere bersagliabili.

Una stessa applicazione di danno ad area danneggia il gruppo una sola volta
per impostazione predefinita. Il GM può scegliere, per quella applicazione,
di sommare i danni dei singoli token. La scelta non cambia il default.

## Vincoli

- Conservare le chiavi `com.thebigpicture.initiative/meta` e
  `com.thebigpicture.initiative/state`.
- Conservare `meta.hp` e `meta.hpMax` come unici campi HP canonici; nessuna
  riserva separata nei metadata della scena o della stanza.
- Fondere sempre i metadata; preservare proprietà sconosciute, nomi di
  funzioni, code, revisioni, guardie di scena ed editor inline.
- Nessun riuso di `actorProfileId` per rappresentare il collegamento.
- Nessun nuovo framework o dipendenza di produzione.
- Modifiche locali e mirate in `src/initiativeList.js`, senza ristrutturarla.

## Modello e regole di collegamento

Il metadata canonico del token secondario contiene `sharedHpSourceId`, l'ID
OBR del principale, e `sharedHpExcludeFromInitiative: true` per questo MVP.
Il principale non contiene un riferimento a se stesso. Il gruppo si ricava
dai token reali presenti nella scena; non dal solo ordine di iniziativa.

Il principale conserva i valori autorevoli; i secondari conservano copie
canoniche sincronizzate in `hp` e `hpMax`. Non si usano nomi o immagini per
dedurre collegamenti. I membri mantengono condizioni, concentrazione,
schede e risorse individuali.

Solo il GM può collegare e scollegare. Un menu contestuale sulla mappa apre
un pannello "HP condivisi": selezione del principale, elenco dei token
selezionati, anteprima dei valori che verranno sostituiti e conferma.
Il principale deve essere un token CHARACTER reale, con HP validi e massimo
positivo. Sono vietati auto-collegamenti, riferimenti a secondari, catene,
cicli, attachment e ID virtuali Lair/Paragon/Epic. Un principale con membri
non può diventare secondario senza prima scollegare il gruppo.

Collegare copia HP e massimo dal principale e rimuove l'appartenenza
all'iniziativa dei secondari, senza alterare gli altri metadata.
Scollegare conserva gli ultimi HP, elimina solo i campi del collegamento e
non inserisce automaticamente il token nell'iniziativa. Il pannello permette
anche di scollegare tutti i membri dal principale e mostra i link interrotti.

Se il principale manca, gli ultimi valori rimangono visibili. Le modifiche
HP sul secondario sono bloccate con un messaggio che invita a scollegarlo;
nessuna elezione automatica di un nuovo principale e nessun reset a zero.
I link sono limitati alla scena: copie e trasferimenti tra scene richiedono
verifica o nuovo collegamento, senza matching automatico.

## Percorso delle modifiche HP

Un modulo puro dedicato risolve gruppi, valida i riferimenti e prepara le
modifiche. L'integrazione principale vive in `prepareEffectsMutation()` di
`src/effectsMutations.js`, nella stessa serializzazione già usata dal plugin.
Deve gestire sia operazioni `hp:set` sia patch dei campi HP in
`command.metadataPatches`, conservando le patch degli altri campi.

La risoluzione avviene su dati correnti nella coda autorevole. Danni/cure
usano importi e identità dell'evento; le assegnazioni assolute e i massimi
mantengono aspettative sui valori letti. Comandi obsoleti o contraddittori
sono rifiutati, senza scegliere arbitrariamente l'ultimo token nel batch.
Retry dello stesso comando non applicano nuovamente il danno.

Una modifica prepara i valori finali per principale e secondari nello stesso
piano. History/Undo include l'intero insieme modificato, anche quando la UI
ha selezionato una sola Mano. Un errore o commit parziale usa i meccanismi
esistenti di verifica e recupero; non presume atomicità dell'SDK.
Le anteprime visuali includono il gruppo e tornano ai valori effettivi in
caso di rifiuto. Il funzionamento non dipende dal tracker aperto.

Tracker, testi e barre mappa continuano a derivare dai campi canonici.
Si riusano aggiornamenti mirati e code esistenti degli attachment.
La sincronizzazione non viene implementata come catena di watcher che
rilanciano danni quando osservano le copie aggiornate.

La persistenza `hpMemory`/ActorVitals rimane operativa. Nel caso in cui un
membro abbia un'identità persistente, il suo restore deve rispettare la
riserva del principale prima di poter produrre un valore divergente; nessuna
disattivazione generale della memoria e nessuna unificazione delle identità.

## Danni ad area ed effetti

La UI espone, per ogni applicazione multi-bersaglio che coinvolge un gruppo:

- "Una volta per gruppo" (default).
- "Per ogni token colpito" (somma dei contributi di danno del singolo evento).

Il riepilogo mostra numero di membri colpiti, policy e danno finale alla
riserva. Se nella prima policy gli importi differiscono dopo salvezze e
resistenze, il GM sceglie esplicitamente quale importo applicare, con i
relativi nomi dei bersagli. Non usare implicitamente minimo, massimo o media.
I contributi devono precedere il clamp a zero: due colpi da 80 su 100 HP
sono 160 danni richiesti, poi 0 HP finali, senza ricavare l'importo dal solo
delta già limitato del token.

Due attacchi/eventi distinti si sommano anche contro la stessa riserva;
non si deduplicano genericamente tutti i comandi indirizzati al gruppo.
Le cure e le assegnazioni manuali coinvolgenti più membri della stessa
riserva sono applicate una volta; valori assoluti incompatibili producono
un conflitto esplicito.

Il danno produce effetti sul bersaglio realmente colpito: la copia degli HP
non rappresenta ulteriori colpi, prove di concentrazione o interruzioni di
condizioni. Gli effetti dell'area sui singoli bersagli restano individuali.
Le automazioni già legate a zero HP si riconciliano per i membri con HP zero;
non si eliminano token né si cambiano automaticamente turni o forme del boss.

La scelta della policy deve essere raggiungibile sia da Effetti rapidi sia
dalla risoluzione delle aree delle magie. Le azioni boss che producono danno
usano lo stesso percorso; gli attacchi singoli non mostrano opzioni area.

## Iniziativa e bersagli fuori lista

Il collegamento non modifica direttamente l'indice del turno con una nuova
formula. La rimozione passa dalla riconciliazione già esistente, preservando
il turno attivo quando possibile e usando il comportamento corrente quando
il token rimosso era attivo. Gli ID virtuali estranei restano validi.

I percorsi "Aggiungi tutti" e inserimento dal menu non reinseriscono i
secondari esclusi. La costruzione delle entry li filtra anche in presenza
di un vecchio `inInitiative: true`. I secondari restano disponibili nei
picker di Effetti rapidi e delle magie e nel rilevamento delle aree sulla
mappa. Il principale mostra un indicatore compatto con il numero di membri;
il pannello del collegamento offre il dettaglio, senza nuove righe iniziativa.

## File e funzioni da modificare in modo mirato

- Nuovo modulo `src/sharedHpCore.js`: validazione, gruppi e pianificazione
  pura, con test dedicati.
- Nuovo controller di collegamento e pannello HTML/JS: UI GM, anteprima,
  conferma, scollegamento, guardie scena; entry Vite dedicata.
- `src/contextMenu.js`: accesso al pannello dalla selezione sulla mappa.
- `src/effectsMutations.js`, `prepareEffectsMutation()`: espansione dei
  membri, normalizzazione dei due ingressi HP, conseguenze e piano history.
- `src/quick-hp-modal.js`, `loadTargets()`, `renderTargets()` e percorso
  applicazione: secondari fuori lista, policy, riepilogo e anteprime.
- `src/spellAreaResolutionExecutor.js`,
  `src/spellAreaResolutionCommandCore.js`, UI della risoluzione area e
  `src/spellApplicationExecutor.js`: contributi HP, identità dell'evento e
  policy esplicita, senza alterare gli effetti individuali.
- `src/initiativeList.js`: handler "Aggiungi tutti", `entryFromSceneItem()`,
  indicatore gruppo e history degli editor HP; preservare `renderAll()`.
- `src/ctx-add.ts`, `addToInitiative()`: rispettare esclusione esplicita.
- `src/hpMemory.js`, `src/actorVitalsStore.js`, `src/hpbar-items.js` e moduli
  history: solo integrazioni necessarie emerse dai test, senza sostituirne
  le code o le politiche di persistenza.

## Verifica prima della consegna

1. Auril a 300/400 con tre secondari a 300/400: -25 da ogni possibile
   membro porta tutti a 275/400; una cura +10 porta tutti a 285/400.
2. Modifica del massimo, HP temporanei secondo la rappresentazione attuale,
   ingresso a zero e uscita da zero conservano le regole esistenti.
3. Tre membri colpiti da 28: default -28, policy per token -84; scelta
   successiva nuovamente default. Esiti discordanti richiedono scelta.
4. Due attacchi distinti sottraggono entrambi; un retry dello stesso evento
   sottrae una sola volta; danni simultanei non si sovrascrivono.
5. History/Undo ripristina tutto il gruppo e gli effetti effettivamente
   modificati; fallimento e commit parziale non mostrano un successo pieno.
6. Condizioni individuali, metadati sconosciuti, actorProfileId, memoria HP
   e gruppi non collegati conservano il comportamento precedente.
7. Token secondari fuori iniziativa restano bersagliabili e non rientrano
   con "Aggiungi tutti"; collegamento di un token attivo e presenza di ID
   virtuali non corrompono ordine, round o turno corrente.
8. Link invalido, ciclo, principale eliminato, cambio scena durante un
   comando e doppia conferma sono gestiti senza scritture fuori contesto.
9. Con tracker chiuso, danni da Effetti rapidi, area magia e azioni boss
   aggiornano comunque le copie canoniche e le barre necessarie.
10. Eseguire i nuovi test, le regressioni HP/history/iniziativa/persistenza
    e `npm run build`; registrare risultati e limiti di verifica in OBR.

## Fuori ambito della prima versione

Trasformazioni automatiche di Auril, riserve multiple o percentuali,
trasferimenti automatici tra scene, turni autonomi dei secondari, nuove
regole di concentrazione condivisa e sincronizzazione universale delle
scritture HP prodotte da altre estensioni. Il pannello chiarisce che il
collegamento riguarda le modifiche effettuate da questo plugin.
