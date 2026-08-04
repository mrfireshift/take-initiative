# Riferimento delle funzioni

## Matrice GM/player

| Funzione | GM | Player |
| --- | --- | --- |
| Vedere ordine, round e turno attivo | Sì | Sì |
| Toolbar Incontro/Tracker | Sì | No |
| Modificare HP, condizioni e incantesimi | Sì | No |
| Usare azioni rapide delle card | Sì | No |
| Vedere reminder di turno, TS ed effetti | Sì | Sì |
| Gestire il registro degli incantesimi attivi | Sì | No |
| Vedere HP dei PG | Sì | Sì |
| Vedere HP degli alleati | Sì | Sì nell'estesa; nascosti nella compatta |
| Vedere HP di neutrali/nemici | Sì | No |
| Console HP rapida | Sì | No |
| Creare/stilizzare aree AoE | Sì | No |
| Vedere aree persistenti | Sì | Sì |
| Creare e gestire clock | Sì | No |
| Vedere clock dichiarati visibili | Sì | Sì |
| Impostare quota | Sì | No |
| Usare Distanza 3D | Sì | No |
| Aprire Enciclopedia DM | Sì | No |
| Configurare il registry automatico delle fazioni | Sì | No |
| Vedere capacità e reminder configurati | Sì | Sì |
| Configurare, attivare e terminare capacità | Sì | No |

## Condizioni predefinite

Il catalogo comprende:

- Accecato
- Affascinato
- Afferrato
- Assordato
- Avvelenato
- Incapacitato
- Invisibile
- Paralizzato
- Pietrificato
- Privo di sensi
- Prono
- Spaventato
- Stordito
- Trattenuto
- Indebolimento
- Ira
- Giuramento di Inimicizia

L'indebolimento è riconosciuto dal catalogo ma viene modificato dalla scheda iniziativa, non dal selettore generico. È inoltre possibile definire condizioni personalizzate.

### Modalità di scadenza

| Modalità | Comportamento |
| --- | --- |
| Manuale | Resta attiva finché il GM non la rimuove. |
| Round | Scade dopo il numero di round indicato. |
| Inizio turno | Scade all'inizio del turno dell'attore associato. |
| Fine turno | Scade alla fine del turno dell'attore associato. |
| Concentrazione | Termina quando viene interrotta la concentrazione collegata. |

## Interazioni condizioni/velocità

Modalità risolte: camminare, volare, nuotare e scalare. La velocità di
camminata viene dalla scheda; le altre modalità devono essere concesse o
copiate da un effetto.

| Condizione | Effetto automatico |
| --- | --- |
| Afferrato | Velocità 0 |
| Trattenuto | Velocità 0 |
| Paralizzato | Velocità 0 |
| Pietrificato | Velocità 0 |
| Stordito | Velocità 0 |
| Privo di sensi | Velocità 0 |
| Indebolimento 2–4 | Velocità dimezzata, caselle arrotondate per difetto |
| Indebolimento 5 | Velocità 0 |
| Prono | Rialzarsi costa metà movimento; movimento prono ×2 |

Le zone possono aggiungere un moltiplicatore di costo, per esempio `×2` per il
terreno difficile. Più costi dichiarativi usano il valore più alto; il costo
direzionale di Folata di Vento non è ancora incluso.

## Console HP rapida

| Modalità | Risultato |
| --- | --- |
| Danno | Sottrae HP dopo l'applicazione del fattore. |
| Cura | Aggiunge HP senza superare `hpMax`. |
| HP temp. | Imposta gli HP temporanei secondo la logica del modulo. |

Fattori per bersaglio: `×2`, `1`, `½`, `¼`. L'anteprima mostra valore precedente, valore successivo e variazione prima della conferma.

## Fazioni e filtri

Condizioni, Incantesimi e Console HP condividono la stessa logica:

- ricerca testuale per nome;
- toggle indipendenti PG, Alleati, Neutrali e Nemici;
- nessun toggle attivo equivale a nessun filtro di fazione;
- più toggle attivi producono l'unione delle categorie;
- la selezione della lista è sincronizzata con la selezione sulla mappa.

## Incantesimi

### Composizione del catalogo

| Provenienza | Definizioni |
| --- | ---: |
| Base SRD 5.1 | 319 |
| Xanathar | 95 |
| Tasha | 20 |
| Integrazioni PHB 2014 | 41 |
| Alias legacy | 2 |
| **Totale runtime** | **477** |

Sono tracciabili nel pannello Incantesimi 357 definizioni. Il catalogo
comprende inoltre 133 regole di area per 132 incantesimi distinti, 71 definizioni con automazioni esplicite
per il tiro salvezza e 7 definizioni con azioni attive. La presenza di una
geometria non implica che ogni clausola RAW dell'incantesimo sia già
automatizzata.

### Registro e ciclo di vita

| Funzione | Comportamento |
| --- | --- |
| Registro globale | Aggrega le istanze create da Incantesimi e dalla Console effetti ad area. |
| Durata | Avanza con round e turni secondo la definizione. |
| Concentrazione | Vive sul caster e collega spell, effetti figli, zone e aure. |
| Fine naturale | Termina l'istanza e ripulisce gli elementi collegati. |
| Interruzione | Esegue la stessa pulizia quando viene rimossa la concentrazione. |
| Preparazione | Conserva l'istanza sul caster e la risolve in seguito sui bersagli scelti. |
| Azione attiva | Applica una fase successiva senza ricreare l'incantesimo. |

### Reminder di tiro salvezza

| Regola | Comportamento |
| --- | --- |
| Timing | Etichetta esplicita **INIZIO TURNO** o **FINE TURNO**. |
| Identità | Mostra token, effetto e nome del caster. |
| CD | Legge la CD dalla scheda del caster, se disponibile. |
| Concorrenti | Più reminder nello stesso momento vengono aggregati. |
| Navigazione | Il nuovo turno sostituisce il reminder precedente. |
| Nessun evento | Se il nuovo attore non è coinvolto, il reminder scompare. |
| Esito | Il GM tira al tavolo e dichiara Superato o Fallito. |
| Risoluzione | Solo i reminder con `resolution` strutturata espongono i controlli al GM. |
| Conseguenze | Danni, condizioni ed effetti sono applicati dal coordinatore esistente in una sola operazione. |
| Player | Vede il reminder, ma non pulsanti, input o controlli di regia. |
| Idempotenza | Il comando usa l'ID di attivazione e un marker scoped nei metadata del token. |

### Contratto di risoluzione

Un reminder risolvibile trasporta una descrizione JSON serializzabile con
target, sorgente, caratteristica/CD, esiti `passed`, `failed` e `immune`,
azioni su condizioni, spell o concentrazione e una regola danni `full`, `half`
o `zero`. Le condizioni vengono applicate solo quando sono dichiarate dal
catalogo; le etichette descrittive non vengono interpretate come script.

Il successo può rimuovere una condizione o terminare l'effetto indicato. Il
fallimento mantiene l'effetto oppure applica la condizione modellata. L'esito
immune non applica danni né condizioni. Il risultato dei dadi viene inserito
dal GM una sola volta e la metà usa arrotondamento per difetto.

La mutazione unificata passa da metadata key-scoped e dal coordinatore effetti,
quindi la History contiene una sola entry comprensiva di HP, condizioni,
spell/concentrazione e marker. Undo ripristina l'intera entry; la stessa entry
produce un evento `reminder-resolution` nel Combat Log. Se scena, target,
sorgente o attivazione non sono più correnti, il comando è rifiutato senza
History e il reminder resta chiudibile.

### Eventi delle zone

| Evento | Uso |
| --- | --- |
| `cast` | Effetti informativi o immediati al posizionamento. |
| `enter` | Prima entrata valida nella zona. |
| `move` | Movimento all'interno o attivazione per spostamento. |
| `leave` | Attraversamento o uscita dalla geometria. |
| `turn-start` | Permanenza nella zona all'inizio del proprio turno. |
| `turn-end` | Permanenza nella zona alla fine del proprio turno. |

Ogni trigger può essere un semplice reminder, un tiro salvezza oppure un
effetto condizionato da condizioni già presenti. Il sistema mantiene separati
i trigger concorrenti dello stesso incantesimo.

### Azioni attive

| Incantesimo | Azioni |
| --- | --- |
| Controllare Acqua | Vortice, Inondazione, Devia corrente, Separa acque |
| Sguardo penetrante | Superato, Sonno, Panico, Nausea |
| Riscaldare il metallo | Ripeti calore |
| Collera della Natura | Liane Trattenuto, Rocce Prono |
| Colpo dello Zefiro | Usa colpo |
| Controllare Venti | Folate, Discendente, Ascendente, Sospendi venti |
| Investitura del Ghiaccio | Cono gelido |

Il dettaglio del catalogo, dei casi speciali e della copertura residua è in
[Incantesimi, zone e reminder](INCANTESIMI_E_ZONE.md).

## Fazioni automatiche

Il configuratore GM salva nella room le associazioni tra fazione e asset dei
token. La chiave preferita è l'URL canonico dell'immagine; il nome normalizzato
è un fallback. **Aggiungi attori** usa il registry per i token riconosciuti e
lascia al GM i casi ambigui o sconosciuti. Un reset del registry non modifica
le fazioni già presenti nei metadata dei token.

## Capacità di classe

La card può contenere una build fino a quattro classi, con livelli 1–20 e
sottoclassi. Il catalogo runtime contiene 542 record, 104 pool di risorse, 59
capacità `implemented` e 483 voci `not-automated`. Le prime sono attivabili dal
GM; le seconde restano descrittive o manuali. Le capacità pronte possono usare
risorse, creare condizioni persistenti o proiettare aure, ma tiri, scelte ed
esiti non deterministici restano conferme del GM. Il riferimento completo è in
[Capacità di classe](CAPACITA_CLASSE.md).

## Azioni rapide

| Proprietà | Valori |
| --- | --- |
| Massimo per profilo | 12 |
| Tipi | Incantesimo, condizione, capacità di classe supportata |
| Bersaglio | Caster oppure selezione |
| Workflow spell | Pannello Incantesimi oppure Console effetti ad area |
| Scadenza condizione | Manuale, round, inizio turno, fine turno |
| Persistenza | Profilo della card tra scene |

Un'azione sul caster o su un solo bersaglio può essere eseguita direttamente;
negli altri casi apre il pannello corretto con i dati precompilati.

## Risorse boss

| Modalità | Metadata principali | Effetto nell'ordine |
| --- | --- | --- |
| Leggendario | azioni e resistenze, ciascuna con `current` e `max` | Card boss con due contatori |
| Paragon | numero di azioni/turni | Più voci virtuali per lo stesso token |
| Epic | flag epic e iniziativa 20 | Azioni epiche virtuali nell'ordine |

Le tre modalità sono mutuamente esclusive.

## Clock

| Proprietà | Valori |
| --- | --- |
| Segmenti | 4, 6, 8, 12 |
| Valore | da 0 al numero di segmenti |
| Visibilità | tutti oppure solo GM |
| Colori | rosso, ambra, verde, azzurro, viola, rosa |
| Operazioni | crea, rinomina, ±1, azzera, riordina, elimina |

## Distanza 3D

Il calcolo usa:

```text
distanza_3D = sqrt(distanza_planare² + dislivello²)
```

La distanza planare non è centro-centro: viene calcolata tra le caselle occupate più vicine. La misura risultante è espressa nelle unità della scena e presentata anche in caselle D&D.

## Aree di effetto

| Forma | Misura mostrata | Regola di inclusione |
| --- | --- | --- |
| Cerchio | raggio | Caselle toccate dal template |
| Quadrato | lato | Caselle comprese nel quadrato |
| Cono | lunghezza | Template di Xanathar, rotazione libera |
| Linea | lunghezza | Caselle attraversate dalla linea |
| Rettangolo | lunghezza × larghezza | Soglia prossima al 50% per le geometrie spell dedicate |

La selezione considera l'intersezione tra l'area e l'ingombro del token, inclusi i token grandi. Ogni area persistente conserva geometria e stile nei propri metadata.

Le aree generiche possono essere usate soltanto per selezionare bersagli. Le
zone e le aure degli incantesimi aggiungono invece appartenenza, terreno
difficile, trigger turnali, attraversamento e pulizia legata all'istanza.

## Persistenza funzionale

| Dato | Ambito |
| --- | --- |
| HP, iniziativa, fazione, condizioni, incantesimi, boss, quota | Token |
| Build, capacità abilitate, risorse e stato attivo delle capacità | Token, dentro metadata `meta` |
| Azioni rapide | Profilo card nella room, con fallback locale |
| Ordine, turno, round, gruppi, turni virtuali | Scena |
| Registro incantesimi attivi | Derivato dalle istanze sui token |
| Zone statiche e aure mobili | Item della scena collegati all'istanza |
| Clock | Scena |
| Cronologia Undo e log di combattimento | Scena |
| Memoria persistente dei PG e card | Room, con fallback locale |
| Registry automatico delle fazioni | Room, con fallback locale |
| Posizioni finestre, layout e stile AoE | Browser locale |

Per i nomi esatti delle chiavi consulta [Architettura e dati](ARCHITETTURA.md).
