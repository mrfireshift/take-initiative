# Incantesimi, zone e reminder

Questo documento descrive il comportamento corrente del motore degli
incantesimi di Take Initiative!. È il riferimento autorevole per il flusso di
combattimento; gli audit dei supplementi e la documentazione della
stabilizzazione 1.3 restano fotografie storiche.

## Principio di funzionamento

Il plugin serve a **tracciare gli eventi**, non a sostituire i dadi e le
decisioni prese al tavolo.

- Il plugin indica chi deve effettuare un tiro salvezza, quando e contro quale
  CD, se la scheda dell'incantatore contiene il dato.
- Il GM tira fisicamente e dichiara l'esito con i controlli
  **Superato** o **Fallito**.
- Le condizioni che dipendono dal fallimento non vengono applicate prima
  dell'esito. Per esempio, Tempesta di Nevischio non rende automaticamente
  Prono e Tentacoli Neri non rende automaticamente Trattenuto al lancio.
- Danni, cure, spinte e altre conseguenze restano reminder informativi finché
  il GM non li risolve con gli strumenti appropriati.
- Nemici e neutrali possono partecipare al workflow senza una scheda completa.
  La scheda è necessaria soltanto all'incantatore se si vuole mostrare
  automaticamente la sua CD.

## Catalogo corrente

Il catalogo runtime contiene **477 definizioni**:

| Provenienza | Definizioni |
| --- | ---: |
| Catalogo base SRD 5.1 | 319 |
| Xanathar | 95 |
| Tasha | 20 |
| Integrazioni PHB 2014 | 41 |
| Alias legacy di compatibilità | 2 |

Di queste, **358 definizioni sono disponibili come opzioni trackable** e il
pannello unificato espone **393 voci** dopo la deduplicazione tra catalogo
spell e workflow ad area. Gli istantanei senza stato persistente restano nel
riferimento o nei workflow ad area, ma non creano necessariamente una spell
attiva.

Il catalogo dichiara inoltre:

- 140 regole geometriche per 135 incantesimi distinti: 55 effetti istantanei,
  68 zone persistenti, 13 aure mobili e 4 emissioni;
- 81 definizioni con `saveAutomation` nel catalogo runtime;
- 32 definizioni con azioni attive esposte dal contratto del pannello unificato.

Questi numeri descrivono il catalogo tecnico, non il numero di incantesimi
completamente automatizzati. Alcune geometrie possono essere disegnate senza
avere ancora tutti i trigger RAW.

La copertura va letta su tre livelli: definizione nel catalogo, membership e
trigger verificati dal runtime, quindi conseguenza RAW completa. Un incantesimo
può avere una regola di area e reminder funzionanti, ma richiedere ancora al GM
la scelta di una sottozona, il tiro fisico o una conseguenza condizionata. Le
regole di area e i test sono in `src/spellAreaRules.js` e `test/`; il [Backlog](../BACKLOG.md)
elenca i dettagli ancora da completare.

La [matrice di audit dell'automazione](AUDIT_AUTOMAZIONE_INCANTESIMI.md)
parte da tutte le 477 definizioni, ma limita la matrice operativa alle spell con
casting time non superiore a 1 azione. Confronta quel perimetro con i testi
regolamentari locali e con i contratti runtime effettivi per individuare le
lacune residue di tracking, aree, TS, status, movimento, trigger e fasi.
Nel report, il valore **355** indica soltanto le definizioni che superano il
criterio più restrittivo di tracking persistente dell'audit; non sostituisce le
358 opzioni esposte da `getTrackableSpellOptions()`.

## Lanciare e registrare un incantesimo

Il pannello **Incantesimi** consente di scegliere l'incantesimo, l'incantatore,
lo slot, la durata e gli eventuali bersagli. Quando previsto, espone anche la
scelta dell'effetto e le azioni successive.

Il registro **Incantesimi attivi sul campo** aggrega le istanze attive anche
quando sono state create da altri punti dell'interfaccia, compresa la
**Console effetti ad area**. Dal registro il GM può:

- vedere durata, concentrazione, incantatore e bersagli;
- terminare un'istanza;
- usare un'azione attiva disponibile;
- risolvere un incantesimo preparato;
- controllare le condizioni figlie collegate.

La concentrazione è registrata sul caster. La sua interruzione termina
l'istanza collegata e avvia la pulizia di pill, condizioni figlie, zone e aure.
Anche la scadenza naturale esegue la stessa pulizia.

### Palla di Fuoco Ritardata

Palla di Fuoco Ritardata è una spell di 7° livello con gittata 45 m e
concentrazione fino a 1 minuto. Il lancio crea una perla persistente in un
punto scelto dal GM; la zona circolare di raggio 6 m è soltanto l'anteprima del
futuro impatto e non applica effetti quando una creatura vi entra.

L'istanza conserva slot, CD, posizione corrente e `accumulatedDice` (da 0 a
10). Il danno base è 12d6 al 7° livello, 13d6 all'8° e 14d6 al 9°; alla fine di
ogni turno del caster ancora integro si aggiunge 1d6, fino al limite naturale di
10d6. La micropill mostra sempre il totale corrente, ma i dadi vengono tirati
fisicamente una sola volta quando la perla detona.

La fine della concentrazione non rimuove silenziosamente la spell: interruzione
volontaria, TS di concentrazione fallito, sostituzione con una nuova spell
concentrata ed expiry aprono la risoluzione terminale prima del cleanup. Il GM
conferma i bersagli presenti in quel momento entro 6 m dalla posizione corrente,
dichiara un unico totale di danno e indica per ogni creatura il TS Destrezza;
fallimento significa danno pieno, successo metà danno da fuoco. La stessa
transazione aggiorna i PF, chiude spell/concentrazione, rimuove perla e zona e
resta annullabile con History/Undo. Trigger concorrenti sulla stessa istanza
sono arbitrati per `instanceId`, quindi producono una sola detonazione.

Contatto automatico, lancio della perla, collisione con creatura/oggetto e
incendio degli oggetti restano decisioni manuali al tavolo. Il GM può spostare
la perla con gli strumenti scena esistenti; la spell non aggiunge un'azione o un
motore di proiettile/collisione.

### Intermittenza — `blink`

Intermittenza è `FULL / ACCEPTED`. Il cast usa Self, durata di 1 minuto e
nessuna concentrazione; l'istanza parent resta l'unica fonte persistente e
conserva in `castContext.blink` il piano semantico (`material` o
`ethereal`) e l'eventuale `departurePosition`. Il cast parte sempre da
Materiale e rifiuta una nuova istanza se una vecchia Intermittenza live dello
stesso caster è già Eterea.

Alla fine di ogni turno del caster ancora live compare un solo notice con le
scelte RAW **1–10 · Rimane** e **11+ · Piano Etereo**. Il tiro è fisico e non
esiste alcun roller o RNG nel plugin; il primo notice può comparire già alla
fine del turno in cui la spell è stata lanciata. Un esito 1–10 lascia lo stato
invariato. Un esito 11+ salva la posizione corrente del caster in
`departurePosition` e porta l'istanza sul Piano Etereo senza spostare il
token, la scena, la visibilità o l'attachment.

Mentre lo stato è Etereo, la card mostra la pill principale
`Intermittenza` e la micropill `Etereo`; il dettaglio può ricordare
`Piano Etereo · vista 18 m · interazioni solo eteree`. Non viene applicata
la condizione Invisibile e non viene eseguito alcun trasferimento di scena o
motore di interazioni planari.

All'inizio del turno successivo del caster il GM preme **Ritorna sul Piano
Materiale**, sceglie direttamente la destinazione sulla mappa e il token viene
teletrasportato immediatamente dopo il click. Il picker puntuale condiviso non
crea aree né anteprime persistenti e normalizza il punto al centro della
footprint del token. La distanza RAW di 3 m dal punto di scomparsa resta
un'istruzione/adjudication del GM: il resolver conserva la distanza come dato
diagnostico ma non rifiuta il punto scelto; LOS, spazio libero, occupazione e
scelta casuale fra spazi equidistanti restano manuali.

Se Intermittenza termina mentre il caster è Etereo, il terminal gateway apre
prima la stessa risoluzione di ritorno e soltanto dopo completa il cleanup
della spell. Questo vale per expiry, rimozione generica, tracker removal,
`spell:remove-instance`, `spell:clear-non-concentration` e dismissal.
**Termina Intermittenza** è un'azione: da Materiale chiude normalmente; da
Etereo richiede prima la destinazione sulla mappa e poi termina l'istanza.
Reload/reconcile ricostruisce il workflow dall'istanza parent, senza stato
volatile. Le transizioni, il token teleport e il ritorno terminale usano la
History condivisa; il tick di round non rende più stale gli Undo di cast,
esito d20 e ritorno.

### Porta Dimensionale — `dimension-door`

Porta Dimensionale usa il pannello spell unificato con caster, punto di arrivo
obbligatorio entro 150 m e passeggero opzionale. Il passeggero è un solo token
`CHARACTER`, diverso dal caster, e può essere scelto soltanto se la scena rende
verificabile l'adiacenza a griglia: una casella laterale o diagonale adiacente
è valida, una sovrapposizione o un intervallo è rifiutato. Quando la geometria
non è leggibile, il selettore non offre passeggeri e il cast caster-only resta
valido; il plugin non inventa
una collisione o una linea di vista.

La destinazione entra nel command come punto serializzabile. Al momento del
cast viene salvato l'offset tra caster e passeggero; il secondo token arriva a
`destinazione caster + offset`, mantenendo la disposizione iniziale e senza
sovrapporsi al caster. Caster e passeggero sono due side effect
`token:teleport` della stessa transazione, command identity e History entry:
Undo ripristina entrambi e il recovery ARCH-05B completa soltanto il side
effect ancora pendente dopo un restart.

Occupazione del punto, consenso, peso trasportato e possibilità di vedere,
visualizzare o descrivere il luogo sono decisioni RAW del GM. Se il GM sceglie
l'adjudication di luogo occupato, il plugin non raccoglie un controllo "Esito
Destinazione" e non applica automaticamente i 4d6 danni da forza: la
conseguenza resta una decisione del GM e qualsiasi eventuale danno inserito
successivamente segue il normale workflow Effects/HP.
Il matched VFX è cosmetico: un errore visuale non annulla il teleport riuscito.

## Incantesimi preparati e risoluzione differita

Gli incantesimi con una fase di preparazione possono essere registrati sul
caster prima di conoscere il bersaglio definitivo. Quando diventano
risolvibili, compare un controllo dedicato che:

1. recupera l'istanza preparata ancora attiva;
2. chiede i bersagli e, quando serve, la variante;
3. estende la stessa istanza invece di crearne una concorrente;
4. applica soltanto a quel punto gli effetti della risoluzione.

Se la concentrazione o l'istanza preparata non esistono più, la risoluzione
viene considerata obsoleta e non viene applicata.

## Azioni rapide delle card

La scheda iniziativa dispone di una sezione **Azioni rapide**. Ogni profilo può
conservarne fino a 12.

Un'azione rapida può:

- aprire o precompilare il workflow di un incantesimo;
- aprire o precompilare una spell ad area;
- applicare una condizione al caster o alla selezione;
- eseguire direttamente un cast completamente determinato, anche su più
  bersagli discreti;
- conservare slot, durata, automazioni e scadenza configurati.

Le azioni rapide fanno parte del profilo persistente della card e seguono
l'attore tra le scene.

### Policy del tiro salvezza iniziale

Nel percorso `source = QUICK_ACTION`, quando il contratto della spell dichiara
un tiro salvezza iniziale, i bersagli già selezionati dalla card ricevono
esplicitamente `initialSaveOutcome: "failed"`. Questo vale per ogni bersaglio
della selezione e soltanto per il cast iniziale: non tira dadi, non calcola la
CD e non modifica il resolver globale `passed` / `failed` / `immune`.

Il piano passa comunque dal command e dall'executor area canonici, quindi
restano attivi limite bersagli, validazioni spaziali, automazioni, condizioni,
concentrazione, History/Undo, reminder dei repeat save e cleanup. Se il
contratto richiede placement, variante, contesto, danno o un altro input
necessario, l'azione rapida ricade nel Pannello Spell con i dati già noti.

## Reminder di tiro salvezza ed effetti

I reminder vengono generati durante la navigazione dell'iniziativa. Sono
distinti dal warning del turno e indicano chiaramente **INIZIO TURNO** oppure
**FINE TURNO**.

Ogni riga può mostrare:

- nome del token coinvolto;
- condizione o incantesimo;
- caratteristica del tiro salvezza;
- CD dell'incantatore, se disponibile;
- nome dell'incantatore;
- conseguenza informativa del fallimento o del successo.

Esempio:

```text
(4) Nothic (Trattenuto)
TS Destrezza CD 19 (Lavera). Se fallisce: 3d6 danni contundenti.
```

Regole di presentazione:

- più reminder validi nello stesso momento vengono aggregati;
- l'avanzamento dell'iniziativa sostituisce il reminder precedente;
- se il nuovo attore non ha reminder, quello precedente scompare;
- due trigger diversi dello stesso incantesimo non si cancellano a vicenda:
  Fame di Hadar, per esempio, conserva separati l'effetto di inizio turno e il
  tiro salvezza di fine turno;
- la permanenza dell'effetto continua a generare il reminder nei turni
  successivi finché l'istanza non termina.

Gli esiti di un tiro salvezza di area vengono dichiarati nella
**Console effetti ad area**. I pulsanti di esito non vengono mostrati quando
l'incantesimo non infligge un effetto immediato al lancio e il trigger RAW è
soltanto ingresso, movimento, inizio o fine turno.

I trigger di zona già migrati con dati strutturati possono essere risolti dal
GM direttamente nella riga del reminder: **Superato** o **Fallito**, con un
campo numerico compatto quando è richiesto il risultato dei
dadi. Il fallimento può applicare condizioni come Prono o Trattenuto; il
successo usa danno dimezzato o nullo secondo il trigger. La vista Player resta
informativa. La risoluzione usa il coordinatore effetti e una sola History/Undo
anche quando combina HP, condizioni e chiusura dell'attivazione.

I trigger senza `resolutionData` riconosciuta restano reminder informativi. Non
sono inclusi tiri virtuali, interpretazione del testo, resistenze o
vulnerabilità, aggregazioni multi-target e scripting personalizzato.

## Zone, aure e geometrie

Il catalogo distingue quattro famiglie:

| Famiglia | Comportamento |
| --- | --- |
| Istantanea | La geometria serve a determinare i bersagli del lancio. |
| Zona persistente | L'area resta sulla scena e controlla appartenenza e attraversamento. |
| Aura mobile | L'area segue il caster o un altro token sorgente. |
| Emissione | La geometria parte dalla sorgente e segue una regola dedicata. |

Le geometrie disponibili includono cerchio, quadrato, cono, linea,
rettangolo e forme specifiche. Le caselle delle sagome speciali vengono
incluse quando la geometria ne copre circa metà; Folata di Vento usa, per
esempio, un rettangolo da 18 × 3 metri senza caselle che strabordano dal
rettangolo.

Una zona può reagire a:

- lancio;
- ingresso;
- movimento al suo interno;
- attraversamento o uscita;
- inizio turno;
- fine turno.

Le zone supportate possono applicare effetti di appartenenza, come terreno
difficile, oscuramento o una descrizione meccanica. Il costo del terreno
difficile entra nello Speed Tracker; i costi dipendenti dalla direzione, come
muoversi verso il caster dentro Folata di Vento, sono ancora in backlog.

### Zone mobili controllate

Le zone mobili operative elencate nella tabella espongono l'azione comune `Sposta zona`, con la stessa
economia dichiarata dall'incantesimo e una rivalidazione al momento della
conferma. L'azione riusa il placement esistente, non apre una selezione di
bersagli e aggiorna lo stesso root della zona; figli, metadata e sottozone sono
riconciliati nella stessa transazione. Un trascinamento nativo diretto non
aggira il controllo della posizione.

| Incantesimo | Economia e limite | Regola aggiuntiva |
| --- | --- | --- |
| Bagliore Lunare | Azione, 18 m | Nessun trigger aggiuntivo sul movimento |
| Sfera Infuocata | Azione bonus, 9 m | Arresto al primo contatto diretto; la corona resta distinta |
| Spirito Guaritore | Azione bonus, 9 m | Lo spostamento non cura; cura manuale su ingresso/inizio turno |
| Diavoletto di Polvere | Azione bonus, 9 m | Scelta opzionale per nube di detriti da 3 m |

Il core rifiuta posizione iniziale obsoleta, coordinate non valide, distanza
oltre il limite e scena cambiata tra preview e conferma. Per Sfera Infuocata
un contatto ambiguo richiede una scelta esplicita del GM. I dadi, la spinta
fisica del Diavoletto, il movimento delle creature e le interazioni con oggetti
restano manuali.

### Turbine — `xanathar-turbine`

Turbine è `FULL / ACCEPTED`: il workflow corrente copre l'intera risoluzione
operativa della spell e non ha lacune note nella suite verificata. Il cast usa
gittata 90 m, concentrazione fino a 1 minuto e placement obbligatorio di una
zona cilindrica con raggio 3 m e altezza semantica 9 m. La comparsa iniziale
attiva il primo controllo.

Il root dell'area viene trascinato manualmente dal GM sul tabellone. Turbine
non espone `Sposta zona` né comandi generici di conferma/annullamento. Il
runtime rileva sia l'ingresso del bersaglio sia l'ingresso o attraversamento
del bersaglio da parte dell'area, con una sola activation per turno e per
istanza; il bersaglio che resta dentro senza una nuova transizione non viene
riattivato.

La risoluzione è condizionale e indipendente per creatura: TS Destrezza fisico,
10d6 contundenti con metà al successo; solo dopo un fallimento si valuta la
taglia e si propone il TS Forza. Le creature Grande o inferiori possono essere
Trattenute se falliscono anche il TS Forza. Le creature Enormi o Gargantua
subiscono comunque il TS Destrezza e il relativo danno, ma non effettuano il TS
Forza e non vengono catturate.

Una creatura catturata riceve la condizione Trattenuto legata alla parent
instance esatta e viene collegata al root con l'attachment nativo OBR. Rimane
un CHARACTER top-level, non ruota, non si scala, non sparisce e segue il
movimento XY dell'area; il rilascio conserva la posizione corrente. All'inizio
di ogni suo turno, finché è ancora Trattenuta da quella stessa istanza,
`meta.elevation` aumenta di 1,5 m fino a 9 m tramite la mutation canonica della
quota.

Il target dispone dell'azione **Prova di fuga**: sceglie Forza o Destrezza e il
GM dichiara l'esito del tiro fisico contro la CD dello spell. Il successo
rimuove soltanto quel Trattenuto, disancora il token e mostra il promemoria
`Scagliato · 3d6 × 3 m · direzione casuale`; il lancio, la direzione e lo
spostamento effettivo restano manuali. Una rimozione manuale della condizione o
la fine della concentrazione esegue lo stesso rilascio senza modificare
arbitrariamente posizione o quota. La caduta dalla quota corrente e gli
oggetti non assicurati restano adjudication del GM.

Le risoluzioni, i consumi parziali multi-target, il capture/release e le
modifiche di quota passano dal percorso Effects/History condiviso. L'Undo di
risoluzioni consecutive ripristina gli stati intermedi senza riaprire o
chiudere altre creature catturate e senza resuscitare ownership stale.

### Pedine magiche persistenti

Le sorgenti magiche che si comportano come pezzi del tabellone non vengono
modellate come aree. In `Effetti ad Area` il comando diventa `Posiziona token`:
il GM sceglie una casella entro gittata, vede la pedina in anteprima e conferma
il punto prima di applicare il cast. Solo allora viene creata una `PROP`
trascinabile, collegata a caster e istanza spell ma esclusa da iniziativa, HP
Console, condizioni e targeting delle creature. La posizione sulla mappa è la
fonte di verità; movimento, portata e danni sono mostrati nella scheda della
spell come riferimenti per il gioco dal vivo e non vengono imposti
automaticamente.

| Incantesimo | Riferimenti della pedina | Stato aggiuntivo |
| --- | --- | --- |
| Arma spirituale | Movimento 6 m, portata 1,5 m, 1d8 + modificatore | Scaling dello slot |
| Spada arcana | Movimento 6 m, portata 1,5 m, 3d10 forza | Concentrazione |
| Lama del Disastro | Movimento 9 m, portata 1,5 m, due attacchi da 4d12 | Critico 18–20 e attraversamento barriere |
| Mano arcana | Movimento 18 m, portata 1,5 m | CA 20, PF propri, quattro modalità e bersaglio associato |

Creazione, aggiornamenti di Mano arcana, terminazione, cronologia e Undo usano
la mutazione coordinata. Se una pedina viene cancellata accidentalmente, la
scheda della spell attiva espone `Posiziona token`; le pedine rimaste orfane vengono
invece eliminate dal reconciler GM.

Arma spirituale espone inoltre sotto la card iniziativa del caster una mini-card
subordinata con l'icona della pedina e l'indicazione `Azione Bonus`. È una
proiezione puramente visiva: non aggiunge elementi all'ordine e non possiede un
turno autonomo.

### Incantesimi comuni con trigger di zona

| Momento | Incantesimi principali già modellati |
| --- | --- |
| Ingresso o inizio turno | Ragnatela, Bagliore Lunare, Guardiani Spirituali, Tentacoli Neri, Barriera di Lame, Nube Mortale, Tempesta di Nevischio, Creare Falò, Fulgore Nauseante, Muro Prismatico |
| Ingresso o fine turno | Unto, Nube Incendiaria, Piaga degli Insetti, Muro di Spine |
| Inizio turno | Nube Maleodorante, Maelstrom, Spirito Guaritore, Nube di Pugnali, Fame di Hadar |
| Fine turno | Alba, Sfera della Tempesta, Sfera Infuocata, Cordone di Frecce, Fame di Hadar |
| Ingresso o movimento | Guardiano della Fede, Muro di Ghiaccio, Sfera Acquea, Turbine |
| Movimento o attraversamento | Crescita di Spine, Muro Prismatico; Muro di Fuoco è supportato parzialmente |
| Varianti e fasi speciali | Controllare Acqua, Terremoto, Collera della Natura, Controllare Venti, Folata di Vento |

La tabella riassume i trigger principali, non ogni clausola della descrizione.
Il dettaglio del singolo incantesimo resta definito nel catalogo e verificato
dai test.

### Casi che richiedono intervento del GM

- **Tempesta di Nevischio:** il reminder chiede il TS su Destrezza; il GM
  applica Prono soltanto dopo un fallimento.
- **Tentacoli Neri:** il primo reminder chiede il TS su Destrezza. Se il GM
  applica Trattenuto, un secondo reminder segnala i danni all'inizio dei turni
  successivi.
- **Terremoto:** i bersagli già Proni non ricevono il reminder ricorrente finché
  restano Proni nell'area. Le fenditure non sono ancora sottozone autonome.
- **Sfera Acquea:** alla fine dell'incantesimo, le creature ancora Trattenute
  dalla sfera vengono rese Prone.
- **Turbine:** il GM gestisce manualmente tiro/direzione dello scagliamento,
  spostamento effettivo, caduta dalla quota e oggetti non assicurati; il popup
  risolve soltanto i TS, la condizione e l'azione di fuga.
- **Intermittenza:** il GM tira il d20, valuta visibilità/occupazione della
  destinazione e le interazioni Materiale–Etereo; il plugin conserva soltanto
  lo stato, il punto di scomparsa e il ritorno scelto sulla mappa.
- **Fame di Hadar:** inizio e fine turno sono due eventi distinti; la condizione
  Accecato non deve essere duplicata.

## Esempi di azioni attive supportate

La tabella è rappresentativa: il contratto unificato espone attualmente azioni
attive per 26 definizioni.

| Incantesimo | Azioni dal registro |
| --- | --- |
| Controllare Acqua | Vortice, Inondazione, Devia corrente, Separa acque |
| Sguardo penetrante | Segna Superato, Fallito Sonno, Fallito Panico, Fallito Nausea |
| Riscaldare il metallo | Ripeti calore sul turno del caster in concentrazione |
| Collera della Natura | Liane Trattenuto, Rocce Prono |
| Colpo dello Zefiro | Usa colpo |
| Controllare Venti | Folate, Discendente, Ascendente, Sospendi venti |
| Investitura del Ghiaccio | Cono gelido |
| Bagliore Lunare | Sposta zona |
| Sfera Infuocata | Sposta zona |
| Spirito Guaritore | Sposta zona |
| Diavoletto di Polvere | Sposta zona |
| Turbine | Prova di fuga sul target Trattenuto |
| Intermittenza | Ritorno sulla mappa; Termina Intermittenza (Azione) |
| Arma spirituale | Riferimento attacco sulla pedina |
| Spada arcana | Riferimento attacco sulla pedina |
| Lama del Disastro | Riferimento dei due attacchi sulla pedina |
| Mano arcana | Interposta, Possente, Afferra/Stritola, Pugno |

Per Sguardo penetrante, i bersagli già usati vengono ricordati e Nauseato
genera il proprio reminder di fine turno.

Muro di Vento è PASS/PARTIAL-ACCEPTED: il workflow automatico copre placement
lineare fino a 15 m, targeting iniziale sulla sagoma, TS Forza e danno iniziale
3d8 con metà al successo, zona statica, concentrazione, durata, History/Undo e
cleanup. La deviazione dei proiettili, il passaggio delle creature o degli
oggetti volanti, la forma gassosa, la dispersione di gas/fumo/nebbia, i
materiali leggeri e ogni crossing restano regole manuali accettate; non vengono
applicate Condition artificiali, reminder o active action.

Muro Prismatico è PASS/PARTIAL-ACCEPTED: una sola parent instance conserva
durata di 10 minuti senza concentrazione, forma muro o sfera nel subset
geometrico supportato, sette layer, esenzioni per-instance e summaryParts. Il
caster mantiene la pill dell'istanza attiva con il conteggio dei layer, senza
duplicare il record owner sui bersagli. La hot zone è visibile sulla mappa e usa la membership entro 6 m per proporre il TS
Costituzione contro Accecato a ingresso o inizio turno; la verifica della
visuale resta del GM. Il movimento che attraversa la parete apre il popup
esistente di risoluzione, ma la dichiarazione degli esiti, i sette TS
Destrezza, i danni separati, Indaco, Viola e le condizioni passano dalla
conferma del GM. Gestisci strati consente soltanto la distruzione ordinata e
aggiorna lo stato persistente con cleanup, stale checks, idempotenza e
History/Undo.

Restano deliberatamente manuali il riconoscimento dei requisiti di distruzione,
le proprietà passive e le interazioni con proiettili o altri effetti attraverso
il muro, il blocco o rollback del movimento, il trasferimento planare e il
requisito RAW che la creatura possa vedere il muro. Il popup automatico non
costituisce un boundary-crossing engine generico.

## Esclusioni e copertura residua

Questo workflow esclude intenzionalmente:

- evocazioni;
- incantesimi di utilità non orientati al combattimento;
- incantesimi con tempo di lancio di almeno 1 minuto.

Restano da completare soprattutto i casi con geometrie o stati multipli. Le
spell elencate possono già avere una dichiarazione di area, membership o
trigger di base; il lavoro residuo riguarda le conseguenze RAW complete e non
implica che siano assenti dal catalogo:

- revisione completa di Controllare Acqua;
- sottozone figlie, a partire dalle fenditure di Terremoto;
- lato caldo, fascia e attraversamento di Muro di Fuoco;
- Invertire la Gravità, Tempesta di Vendetta, Tramutare Roccia e le
  aure di Vita/Vitalità;
- costo direzionale di Folata di Vento nello Speed Tracker.

### Prossimo batch raccomandato

**Telecinesi** (`telekinesis`) è completata come `FULL / ACCEPTED` nel
perimetro OBR creature-only: parent instance, contesa iniziale e ricorrente,
mantenimento/retarget, Condition canonica Trattenuto, boundary di turno,
cleanup, reconcile e History/Undo sono coperti. Manipolazione di oggetti,
movimento e sospensione restano manuali perché il workflow OBR non usa token
di oggetti.

Il prossimo batch è quindi **Debilitazione** (`xanathar-debilitazione`), già
raggiungibile dal pannello unificato tramite `enervation-repeat`. Il lavoro può
comporre il contratto esistente di active action, turn notice, parent instance,
effect linkage, cleanup e History senza introdurre un nuovo motore.

Il pass deve chiudere soltanto le regole specifiche ancora indicate dall'audit
corrente: ripetizione per turno, danno/cura derivati, condizioni di
terminazione e risoluzione manuale del danno. **Compulsione** e **Dominare**
restano il batch successivo più rischioso perché richiedono movimento/controllo
forzato, non una semplice action declaration.

Lo stato operativo e i test ancora da eseguire sono elencati nel
[Backlog](../BACKLOG.md).

## Verifica rapida al tavolo

Per collaudare un incantesimo persistente:

1. lancialo dal pannello Incantesimi o dalla Console effetti ad area;
2. verifica che compaia nel registro globale;
3. controlla geometria, terreno difficile ed eventuali condizioni iniziali;
4. porta in iniziativa più token validi, uno dopo l'altro;
5. verifica aggregazione, sostituzione e ricomparsa dei reminder nei round
   successivi;
6. dichiara un esito fisico e controlla l'eventuale condizione figlia;
7. termina concentrazione o durata;
8. verifica la pulizia di area, aura, pill, condizioni figlie e reminder.

Per le zone mobili, ripeti il test spostando la zona entro e oltre il limite,
modificando la scena prima della conferma e verificando che Undo ripristini
root, figli e sottozone. Per Sfera Infuocata controlla il primo contatto; per
Spirito Guaritore e Diavoletto di Polvere verifica i reminder nei rispettivi
turni e la sostituzione/estinzione della nube di detriti.
