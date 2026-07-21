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

## I filtri non mostrano bersagli

I toggle di fazione sono combinabili. Se uno o più toggle sono attivi, compaiono soltanto quelle fazioni. Disattiva tutti i toggle per mostrare ogni fazione e cancella il testo della ricerca per nome.

Verifica inoltre che i token siano nell'iniziativa: i popup operano principalmente sugli attori tracciati.

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
- risultato di `npm test`, `npm run check:spells` e `npm run build`.

Evita di includere URL di invito privati o dati sensibili della room.
