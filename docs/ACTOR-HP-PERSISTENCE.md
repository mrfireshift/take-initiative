# Persistenza HP tra scene e `actorProfileId`

## Problema attuale

La memoria precedente (`com.thebigpicture.initiative/hpMemory`) identifica un
PG o un alleato con `nome base + URL del ritratto`. Nome e asset possono
cambiare, gli URL possono essere equivalenti ma avere query diverse e due
personaggi possono condividere uno dei due valori. Inoltre il fallback storico
interviene soprattutto quando gli HP del token sono assenti, quindi non
distinguerebbe sempre un valore presente ma vecchio. `localStorage` è inoltre
limitato al browser corrente e la chiave Room ha un budget condiviso.

La nuova architettura introduce un'identità esplicita e non usa l'item ID OBR
come identità cross-scena.

## Identità dell'attore

L'identità è `actorProfileId`, generata con UUID casuale quando manca. È
persistita nei metadata canonici del token:

```json
{
  "hp": 12,
  "hpMax": 27,
  "actorProfileId": "actor_..."
}
```

La stessa stringa vive nel profilo della scheda iniziativa e nell'entry del
registry delle schede. Dopo il collegamento, nome e ritratto servono solo per
visualizzazione o compatibilità legacy.

Le funzioni pure di `src/actorIdentityCore.js` gestiscono normalizzazione,
generazione e matching. `src/initiativeCardRegistryCore.js` prova prima
`actorProfileId`; il matching legacy è accettato solo se produce un singolo
risultato. Se nome/asset riconducono a più personaggi, il token resta non
collegato: non viene introdotta una UI automatica per risolvere l'ambiguità.

## Registro `actorVitals`

La chiave Room dedicata è:

```text
com.thebigpicture.initiative/actorVitals
```

Lo schema corrente è versionato e conserva proprietà future sia al top-level
sia nei record:

```json
{
  "schemaVersion": 1,
  "actors": {
    "actor_...": {
      "hp": 12,
      "hpMax": 27,
      "updatedAt": 1234567890,
      "revision": 4
    }
  }
}
```

`updatedAt` è il primo ordinamento di autorevolezza; `revision` risolve i
pareggi. Record corrotti o parziali vengono ignorati o normalizzati senza
interrompere il tracker. La retention Room è deterministica: entro 10.000
byte conserva prima i record HP validi, poi quelli più recenti e infine usa
l'ordinamento dell'ID. La copia locale può restare più completa.

`src/actorVitalsStore.js` usa il writer key-scoped, mantiene un fallback
`com.thebigpicture.initiative/actorVitals/local`, serializza i read-modify-write
nello stesso runtime e ascolta gli aggiornamenti Room. Il bootstrap vive nel
background persistente dell'estensione, così la subscription non dipende dal
pannello tracker aperto. Le chiavi metadata estranee non vengono sostituite.
Nessuna cancellazione usa `undefined`.

## Autorità degli HP

Durante l'uso normale la fonte di verità resta esclusivamente:

```text
com.thebigpicture.initiative/meta.hp
com.thebigpicture.initiative/meta.hpMax
```

Ogni modifica canonica osservata dal dispatcher scena aggiorna il record
`actorVitals` se il token ha `actorProfileId`. Tracker e barre sulla mappa
continuano a leggere gli HP del token; il registro non contiene larghezze o
altri dati visuali.

Il registro è quindi uno snapshot di continuità tra scene, non una seconda
fonte usata per correggere ogni modifica locale.

## Salvataggio della scheda

Una lettura normale della scheda non genera ID e non scrive metadata. Al
salvataggio esplicito:

1. viene conservato l'ID già presente sul token, nel profilo o nel registry;
2. se non esiste, viene generato un nuovo `actorProfileId`;
3. la scheda viene aggiornata conservando le proprietà sconosciute già
   persistite;
4. lo stesso ID viene scritto nel profilo `initiativeCard` e nel metadata
   canonico del token, fondendo gli oggetti esistenti.

La migrazione automatica all'avvio è limitata a PG/alleati e a risultati
legacy inequivocabili. Non collega automaticamente mostri con lo stesso asset.

## Cambio scena

Il bootstrap cattura l'epoch corrente e scarta ogni lavoro che non appartiene
più a quell'epoch. Per i token già collegati:

1. se esiste un record `actorVitals`, il suo snapshot più autorevole viene
   confrontato con il token e ripristinato anche se il token contiene HP
   presenti ma obsoleti;
2. se il record non esiste, gli HP canonici validi del token inizializzano il
   registro;
3. i token senza `actorProfileId` mantengono il comportamento legacy;
4. un token non collegato non può ricevere il record di un altro attore.

Durante la migrazione legacy, la vecchia `hpMemory` viene consultata solo per
token ancora privi di ID, solo dopo un matching inequivocabile e solo se non
esiste già uno snapshot nuovo. La vecchia chiave resta leggibile e non viene
cancellata o riscritta per i token già collegati.

## Conflitti e duplicati

Due aggiornamenti dello stesso attore vengono serializzati localmente e
confrontati tramite `updatedAt`/`revision`. Un evento con epoch precedente è
scartato. Il dispatcher osserva i commit canonici, quindi un ripristino che
produce lo stesso valore non genera una nuova scrittura.

Se due token attivi nella stessa scena condividono lo stesso `actorProfileId`,
sono considerati due rappresentazioni dello stesso attore: il token con ID
OBR lessicograficamente minore è il primario deterministico, i duplicati
ricevono lo stesso snapshot e non diventano writer concorrenti. La UI non
nasconde il duplicato; il collegamento manuale e la gestione di copie
intenzionali sono estensioni future.

## Fallback locale e compatibilità

Sono mantenute entrambe le memorie locali:

- `com.thebigpicture.initiative/actorVitals/local` per il nuovo registro;
- `com.thebigpicture.initiative/hpMemory/local` per la compatibilità legacy.

La chiave Room storica
`com.thebigpicture.initiative/hpMemory` resta intatta. È un fallback soltanto
per token privi di `actorProfileId` e per migrazioni legacy inequivocabili. I
mostri, i token non collegati e i profili senza ID non vengono accidentalmente
uniti a un record nuovo.

## Limiti e lavoro futuro

Il matching legacy non può risolvere in modo sicuro due personaggi che
condividono nome e asset; il caso viene documentato e lasciato da collegare
manualmente. Il registro Room ha un budget finito e la retention può lasciare
fuori record vecchi dalla copia condivisa, mentre il fallback locale resta
più completo. La gestione di più copie intenzionali dello stesso attore e una
UI di collegamento/scollegamento manuale sono ancora integrazioni future.
