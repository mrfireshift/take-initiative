# Piano workflow TS batch e area

## Stato

Pianificazione incrementale. Anatema e Scudiscio Mentale di Tasha sono ora
workflow multi-bersaglio senza sagoma operativi: dichiarano TS, slot, limite
bersagli ed effetti sui soli fallimenti, riusando gli esiti già esistenti.
Catena di fulmini è ora operativa come workflow senza sagoma: il targeting
primario + 9 m, la scala con lo slot e la rivalidazione al commit sono dedicati
e non creano una zona persistente. Gabbia di forza è ora operativa con le due
varianti geometriche e la membership sui token completamente interni.
Bagliore Lunare, Sfera Infuocata, Spirito Guaritore e Diavoletto di Polvere
supportano ora lo spostamento controllato della zona tramite l'azione comune
`Sposta zona`.

L'audit operativo non segnala piÃ¹ `SAVE_WORKFLOW_MISSING` per questo gruppo;
Anatema
Elementale ha completato il workflow batch ma conserva una lacuna distinta sul
trigger di danno. Le spell aperte sono tutte risoluzioni multi-bersaglio al
lancio. Gabbia di forza è stata rimossa da
questo gruppo: richiede varianti geometriche e una pill di appartenenza, non un
workflow automatico per il TS condizionale al teletrasporto.

Il workflow di Esilio Ã¨ ora operativo nel percorso batch comune. Disperdere e
Metamorfosi di Massa sono stati rimossi dal perimetro di automazione e restano
interamente manuali. Resta manuale il movimento fisico di Esilio.

## Obiettivo

Usare un solo percorso per:

- scegliere caster, slot e bersagli;
- validare numero massimo, unicità e vincoli spaziali dei bersagli;
- registrare per ogni creatura `Superato`, `Fallito` o `Immune`;
- applicare danni, condizioni e tracking soltanto agli esiti pertinenti;
- confermare tutto con una singola mutazione, una voce di cronologia e un Undo.

I dadi restano fisici e manuali: il plugin assiste la risoluzione, non tira al
posto del tavolo.

## Componenti già riutilizzabili

- `saveSpellCore.js` partiziona i bersagli per esito e rifiuta risoluzioni
  incomplete.
- `saveSpellOperationsCore.js` converte la risoluzione in operazioni spell,
  condizioni e concentrazione.
- La modalità Effetti ad Area della Console HP possiede già lista bersagli,
  controlli per esito, applicazione collettiva e riepilogo.
- Il coordinatore delle mutazioni fornisce già cronologia e Undo atomici.
- Il runtime delle zone conserva già `ruleChoice`, riutilizzabile per la
  variante scelta di Gabbia di forza senza introdurre una nuova chiave metadata.
- `spellSaveWorkflowRules.js` e `spellSaveTargetingCore.js` dichiarano e
  validano i workflow batch senza sagoma dei Lotti A, C e D.

Non serve quindi un secondo motore di risoluzione. Per i casi senza sagoma
il contratto di targeting spaziale e l'adapter UI dedicato sono condivisi dal
percorso batch; restano manuali soltanto le meccaniche fisiche non modellate
nei workflow dichiarativi.

## Contratto comune adottato per il Lotto A

Nuovo modulo puro `spellSaveWorkflowRules.js`, separato dal catalogo delle
sagome, con record simili a:

```js
{
  spellId: "bane",
  timing: "cast",
  ability: "cha",
  targeting: {
    mode: "selected",
    baseMaximum: 3,
    additionalPerSlotAbove: 1,
    baseSlot: 1,
    consent: "all-save"
  },
  choice: null
}
```

Il core puro `spellSaveTargetingCore.js` calcola il massimo per lo slot,
valida i bersagli e produce un payload normalizzato. Danni, condizioni
e durata continueranno a provenire dalle definizioni spell e da
`saveAutomation`.

Il targeting puÃ² inoltre dichiarare `context` per bersaglio: campi selettivi o
testuali, consenso, esiti automatici, effetti contestuali e modificatori delle
opzioni. Il contratto viene risolto dal core e renderizzato dalla Console HP
senza selettori specifici per singola spell.

## Flusso UX comune

1. Selezione della spell e del caster.
2. Selezione dello slot; il limite bersagli viene mostrato accanto al conteggio.
3. Per spell senza sagoma, selezione manuale dei token nella lista già usata da
   Effetti ad Area. Il pulsante `Posiziona area` non viene mostrato.
4. Eventuale scelta condivisa della spell prima degli esiti.
5. Assegnazione di `Superato`, `Fallito` o `Immune` a ogni bersaglio, mantenendo
   i comandi collettivi esistenti.
6. Una sola conferma applica danni, condizioni, concentrazione e tracking.

## Lotti di implementazione

### Lotto A — batch semplice (completato)

- Anatema: 3 bersagli +1 per slot superiore; TS Carisma; effetto solo ai
  fallimenti; massimo validato anche al commit.
- Scudiscio Mentale di Tasha: un bersaglio +1 per slot superiore; TS
  Intelligenza, metà danni ai successi ed effetto di turno ai fallimenti;
  massimo validato anche al commit.

Questi due casi validano il contratto comune senza nuove geometrie o scelte per
bersaglio. La Console HP mostra lo slot e il rapporto selezionati/massimo,
conserva gli esiti indipendenti e applica tutto con una sola transazione e un
solo Undo.

### Lotto B — Catena di fulmini (completato)

Catena di fulmini usa un adapter di targeting distinto, senza sagoma
persistente:

1. si sceglie un solo bersaglio primario entro 45 m dal caster;
2. la UI mostra un riferimento temporaneo di 9 m centrato sul primario;
3. si possono scegliere fino a tre bersagli secondari distinti, più uno per
   ogni slot sopra il 6°, tutti entro quei 9 m e diversi dal primario;
4. al momento della conferma il core rivalida gittata, distanza, unicità e
   massimo consentito: il filtro visivo non è l'unica garanzia;
5. primario e secondari confluiscono nel normale workflow degli esiti, con TS
   Destrezza separati e metà danni ai successi.

Il riferimento da 9 m è soltanto un aiuto alla selezione: non genera una zona
persistente, non produce membership e scompare chiudendo o confermando il
popover. Il testo RAW ammette creature od oggetti; questa iterazione limita la
selezione automatica ai token tracciati e documenta gli oggetti come estensione
futura.

### Lotto C — scelta condivisa e lifecycle

- Comando: completato; numero bersagli scalato dallo slot, scelta condivisa del
  comando, effetti soltanto sui fallimenti e `Supplica` che attiva Prono nel
  turno successivo, lasciandolo persistente.
- Esilio: completati il numero bersagli scalato dallo slot, il contesto
  dell'origine del piano, lo stato Incapacitato per i nativi del piano e la
  conclusione coordinata della concentrazione; la pill tecnica Esilio conserva
  la durata e il ritorno fisico del token resta manuale.
- Anatema Elementale: completato il workflow batch del TS Costituzione, la
  scelta condivisa del tipo, i bersagli aggiuntivi con slot superiori e la
  validazione pairwise entro 9 m; la reazione ai danni resta un sottolavoro
  distinto e manuale.

### Lotto D — eccezioni per bersaglio

- Disperdere: escluso dal workflow batch; consenso, bersagli, destinazione e
  teletrasporto restano interamente manuali.
- Metamorfosi di Massa: esclusa dal workflow batch; bersagli, consenso, forma,
  statistiche, azioni e HP temporanei restano interamente manuali.

### Lotto E - effetti differiti e conseguenze alla terminazione (completato)

Il lifecycle centrale degli effetti ora conserva due contratti dichiarativi
riutilizzabili senza nuove chiavi metadata globali:

- `deferredEffects` vive nelle condizioni e identifica timing, attore,
  ancoraggio al turno successivo, reminder, eventuali dadi/provenienza e
  consumo una tantum;
- `onSpellEnd` vive nell'istanza spell e viene risolto dalla stessa mutazione
  per scadenza naturale, rimozione manuale o terminazione della concentrazione.

Sfera al Vetriolo crea il reminder `5d4 danni da acido` soltanto sui TS falliti;
il notice viene emesso prima della rimozione a fine turno e il consumo viene
persistito per token. Freccia acida usa nel pannello Spells la risoluzione
assistita `Colpito`/`Mancato`, mostra il danno iniziale manuale e conserva solo
il reminder differito del colpo, con scaling per slot.

Velocità applica alla fine della spell una conseguenza indipendente con
velocità effettiva 0 m fino alla fine del turno successivo. Trasformazione di
Tenser crea un reminder immediato per TS Costituzione CD 15; il fallimento
usa la riconciliazione canonica di Indebolimento. I reminder e le conseguenze
sono inclusi nel normale piano di cronologia e Undo.

### Lotto F — zone mobili operative (completato)

Il contratto dichiarativo delle zone mobili normalizza modalità, economia,
distanza massima, trigger durante lo spostamento e arresto al primo contatto.
Il core puro rivalida istanza, caster, posizione iniziale, geometria, distanza
e revisione della scena al commit. `Sposta zona` riusa il placement esistente,
non seleziona bersagli e conserva lo stesso root, i figli e i metadata con un
merge. Movimento, eventuali sottozone, cronologia, Undo e Redo passano dalla
stessa transazione; il trascinamento nativo diretto viene ricondotto alla
posizione controllata precedente.

- Bagliore Lunare: azione, massimo 18 m, senza trigger aggiuntivo al movimento.
- Sfera Infuocata: azione bonus, massimo 9 m, contatto diretto con arresto al
  primo bersaglio; la corona resta distinta e l'ambiguità del contatto richiede
  una scelta esplicita del GM.
- Spirito Guaritore: azione bonus, massimo 9 m; lo spostamento non cura. Gli
  ingressi e gli inizi turno generano reminder di cura manuale, con scaling
  dello slot e consumo una tantum.
- Diavoletto di Polvere: azione bonus, massimo 9 m; il TS e la spinta fisica
  restano manuali. La scelta esplicita del terreno può creare o sostituire una
  nube di detriti da 3 m, pesantemente oscurata, fino all'inizio del turno
  successivo del caster.

Dadi, bersagli ambigui, oggetti e movimento fisico restano deliberatamente
manuali dove indicato dai rispettivi contratti RAW.

### Lotto G — pedine magiche persistenti (completato)

Arma spirituale, Spada arcana, Lama del Disastro e Mano arcana non sono più
trattate come zone. `Effetti ad Area` presenta `Posiziona token`, con scelta
della casella, anteprima e conferma entro la gittata del cast. La conferma crea
una pedina da tabellone sul layer `PROP`, collegata a caster e istanza ma
esclusa dal runtime delle creature. La pedina è
liberamente trascinabile; movimento, portata, attacchi e scaling sono riferimenti
visibili nella scheda della spell e i dadi restano manuali.

Mano arcana conserva sulla pedina CA 20, PF propri pari ai PF massimi del caster,
modalità corrente e bersaglio associato. Creazione, cambi di modalità, PF,
terminazione e ricreazione passano dal coordinatore con cronologia e Undo. Il
reconciler GM elimina inoltre le pedine rimaste orfane dopo la fine della spell.

### Lotto I — attivazioni offensive ripetibili (completato)

Il pannello Spells espone un contratto dichiarativo comune per le azioni eseguite
dopo il lancio e apre un popup dedicato, separato dalla Console Effetti ad Area.
Il popup conserva istanza, caster, contesto dello slot, scena e radice della zona,
gestisce il posizionamento o il bersaglio, rivalida tutto alla conferma e applica
una sola mutazione con cronologia e Undo.

- Invocare il fulmine: il lancio crea la nube temporalesca persistente da 18 m
  centrata sul punto scelto e conserva la scarica iniziale da 1,5 m entro 36 m.
  Il prompt contestualizzato per `Richiama fulmine` compare all'inizio di ogni
  turno del caster, fuori dal pannello Spells, e si chiude quando l'iniziativa
  avanza; TS Destrezza, 3d10 fulmine, scaling dello slot e bonus da tempesta
  naturale restano risolti dal popup dedicato.
- Investitura della Fiamma: il lancio applica l'investitura al caster e crea
  l'aura mobile da 1,5 m; ingresso e fine turno usano reminder deduplicati da
  1d10 fuoco. `Linea di fuoco` usa una linea adiacente da 4,5 × 1,5 m, TS
  Destrezza e 4d8 fuoco.
- Sfera della Tempesta: il trigger di fine turno resta invariato; `Fulmine` è
  un'azione bonus con un solo bersaglio entro 18 m dal centro della root,
  vantaggio indicato dentro la sfera e danno manuale 4d6 fulmine.

Le attivazioni non creano nuove istanze, non sostituiscono la concentrazione e
non modificano ordine, round o attore corrente.

## Intervento indipendente — Gabbia di forza (completato)

Gabbia di forza riusa il lifecycle delle zone statiche ma richiede una scelta
prima del posizionamento:

- `Gabbia`: quadrato da 6 m, cioè 4×4 caselle sulla griglia standard;
- `Box solida`: quadrato da 3 m, cioè 2×2 caselle sulla griglia standard.

La scelta viene conservata in `ruleChoice` e determina la geometria usata dal
placement. Non viene duplicata una pill tecnica sui token: il contenimento
resta una lettura visiva/manuale della sagoma.

Restano manuali il contenimento fisico, lo spostamento delle creature solo
parzialmente incluse e il TS Carisma quando una creatura tenta teletrasporto o
viaggio planare. Non vengono introdotti reminder né blocchi automatici del
movimento.

## Test e criteri di accettazione

### Workflow TS

- Il limite bersagli cambia correttamente con lo slot.
- Non è possibile confermare con bersagli senza esito, duplicati, fuori gittata
  o oltre il limite.
- Successi, fallimenti e immunità generano danni ed effetti distinti.
- Catena di fulmini accetta secondari entro 9 m dal primario e rifiuta quelli
  esterni anche se selezionati prima di un movimento.
- Caster e bersagli mantengono una sola istanza spell coerente.
- Una singola conferma genera una sola transazione di cronologia.
- Undo ripristina spell, condizioni, concentrazione e HP della stessa
  risoluzione.
- Le spell ad area già funzionanti non cambiano comportamento.
- Le spell single-target continuano a non richiedere il workflow batch.

### Gabbia di forza

- Il selettore genera rispettivamente una zona 4×4 e una zona 2×2.
- La variante scelta sopravvive a reload e Undo/Redo.
- La pill appare soltanto sui token completamente interni e segue
  entrata/uscita.
- Terminare la spell rimuove zona e pill nella stessa transazione.
- Nessun TS o reminder automatico viene generato.

### Zone mobili

- `Sposta zona` rispetta l'economia e il limite dichiarati per ogni spell.
- Una posizione iniziale obsoleta, una distanza eccessiva o una scena cambiata
  tra preview e conferma vengono rifiutate.
- Il movimento della zona non crea una seconda istanza spell e una conferma
  produce una sola transazione, inclusi figli e sottozone.
- I trigger specifici di Sfera Infuocata, Spirito Guaritore e Diavoletto di
  Polvere restano separati dal semplice spostamento.

## Fattibilità

- Lotto A: alta, perché riusa quasi interamente i core esistenti.
- Lotto B: completato; usa un selettore temporaneo centrato sul bersaglio e
  validazione spaziale al commit, senza un nuovo lifecycle di zona.
- Lotto C: Comando ed Esilio completati; Anatema Elementale conserva il trigger
  di danno separato dal batch.
- Lotto D: Disperdere e Metamorfosi di Massa restano esclusi dal workflow batch
  per decisione curata; consenso, destinazione, teletrasporto, forma,
  statistiche e HP temporanei sono interamente manuali.
- Lotto E: completato per Sfera al Vetriolo, Freccia acida, Velocità e
  Trasformazione di Tenser; dadi, danni iniziali e movimento fisico restano
  manuali dove indicato dal contratto.
- Lotto F: completato per Bagliore Lunare, Sfera Infuocata, Spirito Guaritore
  e Diavoletto di Polvere; dadi, spinta, bersagli ambigui e movimento fisico
  restano manuali dove indicato dal contratto.
- Gabbia di forza: completato e indipendente dal workflow batch; `ruleChoice` e
  membership collegano geometria e pill specifica senza bloccare il movimento.
