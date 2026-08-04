# Risoluzione dei problemi

## Il lister non si apre

1. Controlla che l'estensione sia attiva nella room.
2. Ricarica la pagina GM.
3. Apri direttamente l'URL del `manifest.json` e verifica che risponda.
4. Controlla che `background.html`, `action-launcher.html` e gli asset siano pubblicati sotto la stessa base URL.
5. In sviluppo, verifica che Vite sia ancora in esecuzione.

Se il problema compare dopo una modifica locale, esegui `npm run build`: un errore di import o sintassi in un popup può impedire il caricamento dell'estensione.

## La room resta in caricamento

Un errore eseguito dal background può bloccare l'inizializzazione. Controlla la console del browser e verifica per primi:

- import mancanti;
- file rinominati non presenti nella build;
- errori in `background.js`, `main.js` o negli strumenti registrati;
- HTML che importa un entry point non più esistente.

Ripristina l'ultima build funzionante prima di correggere un modulo isolato.

## Le card sono vuote in una nuova scena

Le card persistenti usano un registry di room e un fallback locale. Verifica che:

- il token conservi nome/immagine riconoscibili;
- il browser abbia accesso allo stesso `localStorage`;
- la room sia la stessa;
- i metadata `initiativeCards` della room non siano stati rimossi.

Una copia creata in un'altra room non condivide automaticamente il registry.

## HP corretti nella lista ma non sulla mappa

La fonte di verità è il metadata del token; la barra è un attachment derivato.

1. Attendi la fine di un eventuale batch multi-target.
2. Deseleziona i token e verifica barra e testo.
3. Ricarica la room solo se la riconciliazione non parte.
4. Controlla errori relativi a `hpbar-items.js` o al dispatcher degli item.

Non correggere il problema scrivendo direttamente larghezza o testo dell'attachment: la successiva riconciliazione li sovrascriverà.

## Le pill di condizioni o incantesimi non compaiono

1. Verifica che la condizione o l'incantesimo sia presente nella card.
2. Rimuovi e riapplica una singola istanza per forzare la riconciliazione.
3. Prova a un livello di zoom normale.
4. Controlla che gli elementi derivati non siano stati eliminati manualmente insieme al token.
5. Cerca errori in `conditions.js` o `spells-tag.js`.

La `C` di concentrazione dipende dai metadata dell'incantatore, non dalla sola presenza di una pill sul bersaglio.

## Un incantesimo non compare nel registro

Il registro viene derivato dalle istanze presenti sui token, anche per le spell
lanciate dalla Console effetti ad area.

1. Verifica che l'applicazione o il posizionamento siano stati confermati.
2. Controlla la card del caster e quella degli eventuali bersagli.
3. Chiudi e riapri il pannello Incantesimi per forzare una nuova lettura.
4. Verifica che il caster non sia stato rimosso dalla scena durante il
   posizionamento.
5. Cerca in console errori con prefisso `[spell-panel]` o `[quick-hp]`.

Non aggiungere manualmente una seconda copia nel registro: non è una fonte di
verità separata.

## Un reminder di tiro salvezza non compare

Prima di considerarlo un errore, verifica che il trigger RAW sia valido in quel
momento. Alcune spell si attivano soltanto all'ingresso, altre a inizio o fine
turno e altre ancora richiedono una condizione già applicata.

Per una riproduzione affidabile:

1. usa almeno due token validi e uno non coinvolto;
2. posiziona o applica la spell;
3. avanza fino al primo token, poi al secondo;
4. completa un round e torna sui due token;
5. controlla che la zona o la condizione siano ancora attive.

In console cerca:

- `[effect-save-reminder]` per i reminder derivati da condizioni;
- `[spell-static-zone]` per le zone persistenti;
- `[spell-aura]` per le aure mobili;
- errori di posizionamento `[quick-hp]`.

Il reminder precedente deve scomparire quando il nuovo attore non ha eventi.
Se resta visibile o se compare soltanto sul primo token, annota ordine
d'iniziativa, token corrente, `instanceId` dell'effetto e i messaggi di
riconciliazione.

## Il reminder mostra una CD o un nome inattesi

La CD e il nome tra parentesi appartengono al **caster**, non al bersaglio.

- Verifica che l'istanza conservi il caster corretto.
- Apri la scheda del caster e controlla la CD del tiro salvezza degli
  incantesimi.
- Se il caster non ha una scheda o una CD, il reminder resta valido ma non può
  inventare il valore.
- Nemici e neutrali bersaglio non richiedono una scheda completa.

## Una condizione non viene rimossa con la concentrazione

Una condizione figlia deve conservare il collegamento all'istanza che l'ha
creata.

1. Controlla se la condizione è stata applicata automaticamente o manualmente.
2. Termina l'istanza dal registro e verifica nuovamente.
3. Controlla se esistono due istanze omonime o due zone sovrapposte.
4. Cerca errori di riconciliazione delle zone o delle aure.

Una condizione manuale omonima non deve essere rimossa solo perché termina una
spell. Se l'effetto è figlio della spell, segnala `instanceId`, `sourceId` e
nome della condizione.

## Una zona resta dopo la fine dell'incantesimo

La fine naturale e l'interruzione della concentrazione devono entrambe
eliminare le geometrie collegate.

1. Verifica che la durata abbia realmente raggiunto zero.
2. Controlla che l'istanza sia scomparsa dal registro.
3. Se era a concentrazione, verifica che la `C` sia stata rimossa dal caster.
4. Controlla in console `[spell-static-zone] reconcile` o
   `[spell-aura] reconcile`.
5. Annota se l'area è una zona spell oppure un'area AoE generica: un'area
   generica non ha un ciclo di vita legato a una spell.

Non eliminare in massa gli attachment della scena: barre HP, etichette e altre
zone potrebbero usare lo stesso store.

## I filtri non mostrano bersagli

I toggle di fazione sono combinabili. Se uno o più toggle sono attivi, compaiono soltanto quelle fazioni. Disattiva tutti i toggle per mostrare ogni fazione e cancella il testo della ricerca per nome.

Verifica inoltre che i token siano nell'iniziativa: i popup operano principalmente sugli attori tracciati.

## Un token riceve una fazione automatica inattesa

Il registry delle fazioni usa prima l'URL canonico dell'immagine e poi il nome
normalizzato. Un nuovo asset non riconosciuto ricade su **Nemico** quando viene
aggiunto in blocco.

1. Apri **Configura fazioni** e assegna manualmente il token.
2. Se il nome viene usato per creature di fazioni diverse, assegna la fazione
   direttamente dal menu contestuale del token invece di affidarti al nome.
3. Usa **Azzera registry** soltanto per cancellare le associazioni della room;
   le fazioni già scritte sui token non vengono modificate.
4. Se GM e player vedono risultati diversi, verifica la room e il fallback
   locale del browser.

## Una capacità di classe non compare o non si attiva

Controlla prima la scheda **Capacità** della card:

- la classe è presente nella build e il livello rientra nella progressione;
- la sottoclasse selezionata è quella corretta;
- la capacità è stata abilitata nella configurazione esplicita;
- il catalogo mostra `implemented`, non `not-automated`;
- il pool della risorsa ha usi disponibili;
- per una capacità a bersaglio, la selezione sulla mappa contiene token
  CHARACTER validi e dentro portata.

Una voce `not-automated` è intenzionalmente un riferimento manuale e non
diventa attivabile aggiungendola alle azioni rapide. Per un problema runtime
raccogli ID della capacità, classe/livello, `instanceId` e il risultato di
`npm test` e `npm run build`.

## Un effetto di capacità resta sulla mappa

Le aure di capacità sono item derivati con metadata
`com.thebigpicture.initiative/classFeatureAura`. Termina prima l'istanza dalla
card o dal menu contestuale e attendi la riconciliazione.

Non eliminare in massa gli item della scena: l'aura può condividere il piano di
riconciliazione con barre HP, zone spell e pill locali. Se resta una condizione,
controlla `instanceId`, `sourceId` e se la condizione era stata applicata
manualmente.

## Movimento o Maiusc interferiscono con Owlbear Rodeo

Il vecchio strumento di movimento nella toolbar di Owlbear Rodeo è stato rimosso e scollegato. Il monitoraggio viene controllato dal tracker e non dovrebbe cambiare lo strumento attivo.

Se Maiusc non consente la selezione multipla:

1. ricarica entrambe le finestre;
2. verifica che non sia installata una vecchia build del plugin;
3. controlla che non esista ancora un tool legacy registrato dalla cache;
4. disattiva temporaneamente altre estensioni che intercettano la selezione.

## Un gruppo si anima o scorre male

Prova il problema sia con apertura manuale sia navigando con le frecce. Indica sempre:

- modalità estesa o compatta;
- posizione del gruppo nella lista;
- numero dei token;
- direzione della navigazione;
- posizione iniziale dello scroll.

Non modificare soltanto `transform` o `max-height`: il motore coordina ancora, placeholder e compensazione dello scroll.

## Distanza 3D inattesa

Controlla:

- scala e unità della scena;
- quota di entrambi i token;
- ingombro reale dei token sulla griglia;
- allineamento del token alle caselle.

Per token grandi la misura parte dal bordo occupato più vicino. Un token visivamente grande ma con bounds/configurazione incoerenti può dare un risultato diverso da quello atteso.

## Un'area AoE seleziona caselle inattese

Il metodo Template include ogni casella coperta anche parzialmente. Perciò il risultato può essere più ampio di un metodo basato sul centro della casella.

I rettangoli specifici degli incantesimi, come Folata di Vento, usano una
soglia prossima al 50% della casella. Se il rettangolo straborda, annota anche
larghezza, direzione, DPI della griglia e unità della scena.

Per isolare il problema:

1. usa una griglia vuota;
2. prova origine sul centro e sul vertice;
3. confronta la silhouette geometrica con il contorno sagomato;
4. sposta l'area e usa **Riseleziona bersagli**;
5. ridisegna le aree create con una versione precedente se il formato geometrico è cambiato.

## I pannelli riaprono in una posizione scomoda

Tracker compatto, Clock e Distanza 3D memorizzano la posizione nel browser. Trascinali in una posizione valida e chiudili normalmente. Se una coordinata resta fuori schermo, cancella soltanto le chiavi locali del plugin dai dati del sito, non i metadata della room.

La cancellazione completa del `localStorage` rimuove anche preferenze e fallback locali delle card.

## Clock mancanti nella vista player

Il GM può marcare ogni clock come **Solo GM**. Apri le impostazioni del clock e abilita **Mostra ai player**. Verifica anche che GM e player siano nella stessa scena.

## Il log non contiene un evento

Il log è intenzionalmente più sintetico della cronologia tecnica. Alcuni eventi vengono aggregati, in particolare il movimento. Gli Undo aggiungono una voce di annullamento ma non modificano retroattivamente le righe precedenti.

Usa una nota manuale per eventi narrativi o azioni svolte interamente fuori dal plugin.

## Diagnostica per sviluppatori

Prima di segnalare un bug raccogli:

- commit o versione del manifest;
- ruolo GM/player;
- browser;
- scena e numero approssimativo di token;
- passaggi minimi di riproduzione;
- screenshot o registrazione;
- errori della console;
- spell, caster, bersagli, `instanceId` e momento del trigger, se il problema
  riguarda zone o reminder;
- risultato di `npm test`, `npm run check:spells` e `npm run build`.

Evita di includere URL di invito privati o dati sensibili della room.
