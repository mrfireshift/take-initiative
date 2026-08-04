# Guida utente

Questa guida descrive l'uso di Take Initiative! nel suo scenario principale: un DM usa la vista GM come regia e proietta una seconda vista player sul tavolo.

## 1. Preparare la scena

Inserisci sulla mappa tutti i token che devono partecipare al combattimento. Dal menu contestuale di ogni token puoi:

- **Aggiungi all'iniziativa** o **Rimuovi dall'iniziativa**;
- **Segna come…** per assegnare la fazione;
- **Imposta quota…** per indicare l'altezza rispetto al piano della mappa;
- attivare una modalità boss compatibile.

Le fazioni disponibili sono:

- **PG**: personaggi giocanti;
- **Alleati**: creature amiche non controllate come PG;
- **Neutrali**: creature non schierate;
- **Nemici**: avversari.

La fazione determina colore delle card, filtri nei popup e visibilità di alcune informazioni nella vista player.

### Configurare le fazioni in modo persistente

Dal tracker il GM può aprire **Configura fazioni** per assegnare una fazione a
più token della scena in una sola volta. Il configuratore registra
l'associazione nella room usando prima l'immagine del token e poi il nome
normalizzato.

Quando in seguito scegli **Aggiungi attori** o aggiungi nuovi token
all'iniziativa, il plugin riusa questa associazione. Un asset o un nome mai
visto viene trattato come **Nemico** finché il GM non lo assegna manualmente.
Se lo stesso nome è stato usato per fazioni diverse, il plugin non sceglie in
modo automatico: usa la fazione del token o chiede una correzione al GM.

Il configuratore è condiviso nella room e dispone di un fallback locale per il
browser. **Azzera registry** rimuove le associazioni salvate, non cambia le
fazioni già scritte sui token.

## 2. Aprire e configurare il lister

Premi l'icona di Take Initiative! nella barra delle estensioni. Il lister può essere chiuso e riaperto senza perdere lo stato del combattimento.

Sono disponibili due layout:

- **Esteso**: colonna verticale con più dettagli per card;
- **Compatto**: barra orizzontale flottante, pensata per lasciare libera la maggior parte della mappa.

Il pulsante di modalità passa da un layout all'altro. La posizione della barra compatta può essere trascinata e viene ricordata localmente.

### Vista GM e vista player

Il GM vede i controlli di incontro, tracker, modifica e strumenti. Il player vede il round e l'ordine di iniziativa, ma non le toolbar di regia.

Nella vista player gli HP dei PG restano visibili. La modalità estesa può mostrare anche gli HP degli alleati, mentre quella compatta privilegia i soli PG; neutrali e nemici non espongono i propri HP al player. Quando un valore non è visibile non viene lasciato un testo o una barra vuota. Gli strumenti di amministrazione non sono interattivi per il player.

## 3. Impostare le card

Ogni card può contenere:

- nome e ritratto;
- iniziativa;
- HP attuali e massimi;
- barra HP;
- fazione;
- condizioni e incantesimi;
- dati di movimento;
- risorse boss, quando applicabili.

La scheda della card include anche la sezione **Azioni rapide**. Puoi
configurare fino a 12 scorciatoie per:

- lanciare o precompilare un incantesimo;
- aprire una spell nella Console effetti ad area;
- applicare una condizione al caster o ai token selezionati;
- conservare slot, durata, scadenza e automazioni più usati.

Le azioni semplici sul caster o su un solo bersaglio possono essere eseguite
direttamente; negli altri casi la scorciatoia apre il pannello corretto con i
campi già compilati.

Fai doppio clic sul nome per rinominare rapidamente il token. Il nuovo nome viene sincronizzato anche sotto il token sulla battlemap.

Il controllo accanto agli HP apre la modifica rapida o la scheda iniziativa, a seconda del tipo di attore. La dimensione dell'editor HP corrisponde al testo mostrato nella card.

Le card di creature con lo stesso nome vengono raggruppate. Una card collassata mostra **(Gruppo)** e il numero di membri. Il gruppo si espande automaticamente quando il turno entra nello stack e si richiude quando lo lascia; può anche essere aperto manualmente. L'animazione mantiene la prima card come ancora.

In caso di iniziative uguali, le card possono essere riordinate tramite trascinamento.

### Capacità di classe

Nella scheda **Capacità** della card il GM può indicare fino a quattro classi,
livello e sottoclasse, quindi abilitare le capacità che devono essere visibili
e utilizzabili per quel personaggio. Il catalogo mostra anche le capacità non
ancora automatizzate, ma queste restano un riferimento da gestire manualmente.

Le capacità pronte possono consumare una risorsa, applicare un effetto a sé,
chiedere un bersaglio o mantenere un'aura. Il GM deve confermare tiri, scelte,
esiti e conseguenze che il plugin non può risolvere. Le istanze attive mostrano
durata, bersagli e reminder; le condizioni create dalla capacità compaiono
nella finestra **Condizioni** e vengono rimosse insieme all'istanza corretta.

Per conteggi, adapter, limiti e persistenza consulta
[Capacità di classe](CAPACITA_CLASSE.md).

## 4. Gestire il combattimento

La testata mostra il round corrente e i comandi principali. Puoi:

- avviare o azzerare un incontro;
- avanzare o tornare indietro nell'ordine;
- aggiungere o rimuovere attori;
- aprire la cronologia/Undo;
- passare tra layout compatto ed esteso.

Il turno attivo è evidenziato con colore e glow di fazione. Sulla mappa compare un'etichetta **Turno di…** sopra il token attivo.

I gruppi omonimi, le azioni di tana, i turni Paragon e le azioni epiche possono introdurre voci virtuali nell'ordine. Queste voci non corrispondono necessariamente a un elemento reale della scena.

### Follow e tana

- **Follow** centra o segue il token attivo, utile quando il DM controlla la regia da un altro schermo.
- **Tana** abilita la gestione delle azioni di tana nell'incontro.

## 5. HP e modifiche rapide

Gli HP canonici sono quelli della card/token. Le barre sulla mappa sono una rappresentazione derivata e si aggiornano insieme al lister.

Puoi modificare un singolo attore dalla sua card oppure usare **Console HP rapida** per un'operazione su più bersagli.

### Console HP rapida

1. Apri **Danno** dalla toolbar del tracker.
2. Scegli **Danno**, **Cura** o **HP temp.**.
3. Inserisci il valore.
4. Filtra i bersagli per nome e/o fazione.
5. Seleziona i bersagli dalla lista o direttamente sulla mappa.
6. Per ogni bersaglio scegli `×2`, `1`, `½` o `¼`.
7. Controlla l'anteprima e applica.

I bersagli selezionati salgono in cima alla lista. L'applicazione è atomica: un solo comando aggiorna tutti i token e crea un'unica voce annullabile. Se il danno colpisce creature in concentrazione, viene mostrato l'avviso relativo.

## 6. Condizioni

Apri **Condizioni** dalla toolbar. La finestra permette di:

- cercare bersagli per nome;
- combinare liberamente i filtri PG, Alleati, Neutrali e Nemici;
- selezionare token dalla lista o dalla mappa;
- applicare condizioni predefinite;
- creare una condizione personalizzata con durata;
- rimuovere o aggiornare istanze già attive.

Le condizioni supportano scadenza manuale, dopo un numero di round, all'inizio del turno, alla fine del turno o insieme alla concentrazione. Sono consentite fino a tre condizioni personalizzate per token.

Nella card vengono mostrate le prime due pill; il pulsante `…` espande le altre verso il basso. Sulla mappa le condizioni compaiono come pill bloccate e ancorate al token.

### Indebolimento

L'indebolimento è gestito direttamente nella scheda iniziativa con un controllo bidirezionale da 0 a 5. Il valore nella scheda e la condizione sul token restano sincronizzati. Non è trattato come una normale condizione a durata breve.

## 7. Incantesimi e concentrazione

Apri **Incantesimi** dalla toolbar. Il catalogo runtime contiene 477
definizioni tratte dal catalogo base SRD 5.1 e dalle integrazioni 2014; 357
sono tracciabili dal pannello, mentre gli istantanei senza stato persistente
restano soprattutto nel riferimento o nei workflow ad area.

Dal pannello puoi:

- scegliere o cercare un incantesimo;
- indicare incantatore, slot, durata e bersagli;
- combinare filtri di fazione e ricerca per nome;
- usare le varianti e le automazioni disponibili;
- preparare un incantesimo che verrà risolto in seguito;
- visualizzare, attivare e terminare gli incantesimi presenti sul campo.

### Registro degli incantesimi attivi

Il registro raccoglie le istanze attive indipendentemente dal punto in cui sono
state create. Una spell lanciata dalla **Console effetti ad area** compare
quindi nello stesso registro di una lanciata dal pannello Incantesimi.

La card dell'istanza mostra durata, incantatore, concentrazione, bersagli ed
eventuali azioni disponibili. Alcuni incantesimi consentono di applicare
un'attivazione successiva, per esempio ripetere Riscaldare il metallo, scegliere
una variante di Controllare Venti o applicare un esito di Sguardo penetrante.

Gli incantesimi preparati restano sul caster. Quando devono essere risolti, il
plugin chiede bersagli e variante senza creare una seconda concentrazione.

### Concentrazione e pulizia

Un incantatore in concentrazione mostra una `C` sulla card e sul token.
Interrompere la concentrazione termina l'istanza collegata e rimuove le zone,
le aure, le pill e le condizioni figlie che dipendono da essa. La stessa
pulizia avviene quando termina la durata naturale.

Le pill conservano il colore assegnato e vengono renderizzate sulla mappa
insieme alle condizioni, senza diventare oggetti trascinabili accidentalmente.

### Reminder e tiri fisici

Il plugin non tira i dadi. Quando un effetto richiede un tiro salvezza a inizio
o fine turno, compare un reminder compatto con:

- token e condizione coinvolti;
- caratteristica del tiro;
- CD della scheda del caster, se presente;
- nome del caster;
- conseguenza informativa.

I reminder concorrenti vengono aggregati. Avanzando l'iniziativa, il nuovo
reminder sostituisce il precedente; se l'attore successivo non è coinvolto,
l'avviso scompare.

Il GM effettua il tiro al tavolo e dichiara l'esito. Nella Console effetti ad
area i controlli **Superato** e **Fallito** compaiono soltanto
quando esiste un effetto immediato da risolvere. Le condizioni dipendenti dal
fallimento, come Prono per Tempesta di Nevischio o Trattenuto per Tentacoli
Neri, devono essere applicate dopo il risultato reale.

Quando il reminder è compatibile, il GM può anche inserire una sola volta il
risultato dei dadi fisici. Il plugin applica danno pieno al fallimento, metà
danno al successo quando previsto dalla regola (arrotondata per difetto) e
nessun danno per un esito nullo o immune. Il successo può rimuovere una
condizione o terminare un effetto/istanza spell modellata; il fallimento può
mantenere l'effetto oppure applicare la condizione dichiarata dal catalogo.

I controlli sono esclusivi della vista GM. La vista Player riceve lo stesso
reminder informativo, ma non mostra pulsanti o input. Ogni conferma passa dal
coordinatore di effetti: HP, pill, tracker e barre mappa restano derivati dai
metadata canonici, mentre una sola voce di History/Undo alimenta anche il
Combat Log. Un reminder già risolto, duplicato o diventato obsoleto non viene
riapplicato; il GM può chiudere l'avviso e continuare senza conseguenze.

Restano informativi i reminder privi di una descrizione strutturata. L'MVP non
esegue tiri virtuali, bonus automatici, resistenze/vulnerabilità, testo libero,
risoluzioni aggregate multi-bersaglio o scripting personalizzato.

Per geometrie, trigger supportati, azioni attive e copertura residua consulta
[Incantesimi, zone e reminder](INCANTESIMI_E_ZONE.md).

## 8. Movimento e condizioni di D&D 2014

Il tracker movimento usa la velocità salvata nella scheda dell'attore e conta
le caselle percorse nel turno. Il profilo supporta camminare, volare, nuotare e
scalare quando una condizione o un incantesimo concede la modalità. Cambiare
modalità non azzera la distanza già consumata.

Il pulsante Movimento nella vista compatta mostra solo il riepilogo;
l'interfaccia completa resta nel layout esteso.

Le seguenti condizioni modificano automaticamente la velocità:

- **Afferrato, Trattenuto, Paralizzato, Pietrificato, Stordito, Privo di sensi**: velocità 0;
- **Indebolimento 2–4**: velocità dimezzata;
- **Indebolimento 5**: velocità 0;
- **Prono**: rialzarsi consuma metà del movimento disponibile; finché il token resta prono, ogni casella percorsa costa due caselle.

Quando una velocità dimezzata produce mezze caselle, il numero di caselle viene arrotondato per difetto. Una velocità di 7 caselle diventa quindi 3 caselle.

Le zone supportate possono dichiarare terreno difficile. In quel caso lo Speed
Tracker aumenta il costo delle caselle mentre l'effetto di appartenenza è
attivo. I costi dipendenti dalla direzione, come il tratto percorso verso il
caster dentro Folata di Vento, non sono ancora automatizzati.

In modalità volo, una variazione manuale di quota consuma movimento. Le altre
modalità non deducono automaticamente movimento da un cambio di quota.

Gli spostamenti vengono aggregati nel log di combattimento. Un movimento annullato con Ctrl+Z non viene conteggiato come nuovo movimento.

## 9. Boss

Dal menu contestuale o dalla scheda di un nemico puoi attivare una sola modalità boss alla volta.

### Azioni leggendarie

La card mostra due risorse indipendenti:

- **A**: azioni leggendarie disponibili e massimo configurabile;
- **R**: resistenze leggendarie disponibili e massimo configurabile.

Entrambi i contatori dispongono di controlli per modificare valore corrente e totale. Le azioni leggendarie si ripristinano secondo il flusso del combattimento.

### Paragon Boss

Un boss Paragon riceve più turni nell'ordine. Le voci aggiuntive sono virtuali e fanno riferimento allo stesso token e agli stessi HP.

### Epic Boss

Un Epic Boss opera a iniziativa 20 e genera voci **Azione Epica** nell'ordine. La card usa una cornice boss dedicata; le voci epiche non sono token duplicati.

## 10. Cronologia e log di combattimento

Il pannello separa due funzioni:

- **Cronologia e Undo**: azioni annullabili, con possibilità di annullare una o più operazioni;
- **Log di combattimento**: registro leggibile degli eventi.

Il log raggruppa gli eventi per round, accumula il movimento totale degli attori e registra gli Undo come annullamenti, senza riscrivere il passato. Puoi:

- cercare per attore, bersaglio o evento;
- filtrare il tipo di evento;
- aggiungere note manuali;
- iniziare un nuovo log;
- cancellare il log con conferma;
- esportare in TXT o JSON.

## 11. Clock

Lo strumento **Clock** si trova nella toolbar destra di Owlbear Rodeo. I clock sono manuali e appartengono alla scena.

- Segmenti disponibili: 4, 6, 8 e 12.
- Colori disponibili: rosso, ambra, verde, azzurro, viola e rosa.
- Ogni clock può essere incrementato, decrementato, azzerato, rinominato, riordinato o eliminato.
- Il GM può nascondere un clock ai player.
- La finestra dispone di modalità estesa e compatta, è trascinabile e si adatta al numero di clock visibili.

## 12. Quota e distanza 3D

**Imposta quota…** nel menu contestuale salva sul token un'altezza positiva o negativa rispetto al piano della mappa. Un'etichetta discreta indica direzione e valore.

Lo strumento **Distanza 3D** nella toolbar destra:

1. usa uno dei token selezionati come origine;
2. calcola la distanza planare secondo le caselle di D&D;
3. per token 2×2 o superiori misura dal bordo più vicino, non dal centro;
4. combina distanza planare e dislivello con il teorema di Pitagora.

La distanza planare segue la distanza minima tra le caselle occupate dai token. Ogni casella vale 1,5 m.

## 13. Targeting geometrico AoE

Lo strumento **Targeting area** è disponibile al GM nella toolbar destra e include:

- cerchio;
- quadrato;
- cono;
- linea;
- rettangolo per le spell che lo richiedono.

Durante il trascinamento compare la misura in metri. Origine e dimensioni possono agganciarsi al centro o ai vertici delle caselle. Le forme restano sulla scena dopo la creazione e continuano a selezionare i token intersecati quando vengono spostate.

Il cerchio e il cono usano il metodo **Template** di Xanathar: una casella è inclusa quando il modello la copre anche solo parzialmente. La forma sagomata segue quindi il contorno delle caselle incluse, mentre una silhouette geometrica interna rende leggibile la geometria originaria.

Le geometrie rettangolari specifiche degli incantesimi usano invece una soglia
di copertura prossima alla metà della casella. Folata di Vento produce così un
rettangolo da 18 × 3 metri senza estensioni oltre i suoi bordi.

Le zone persistenti degli incantesimi aggiungono al disegno una logica di
appartenenza e attraversamento. Possono generare reminder all'ingresso, durante
il movimento, all'uscita, a inizio turno o a fine turno e possono dichiarare
terreno difficile. Una zona mobile o un'aura mantiene il collegamento con la
propria sorgente.

**Aspetto area** permette di scegliere colore del riempimento, colore del contorno, opacità e spessore. Lo stile è una preferenza locale usata per le nuove aree. Dal menu contestuale di un'area puoi scegliere **Riseleziona bersagli**.

## 14. Etichette sulla mappa

Il plugin crea elementi derivati e bloccati per evitare trascinamenti accidentali:

- barra e numero HP;
- nome sincronizzato;
- indicatore di turno;
- `C` di concentrazione;
- pill di condizioni e incantesimi;
- quota;
- indicatori di movimento.

Dimensione, spaziatura e allineamento delle pill si adattano allo zoom. Questi elementi non sono la fonte dei dati: possono essere rigenerati a partire dai metadata del token.

## 15. Flusso consigliato al tavolo

Prima della sessione:

1. prepara i token e assegna le fazioni;
2. completa HP, iniziativa, velocità e risorse boss;
3. verifica la vista player sul display del tavolo;
4. crea eventuali clock iniziali, nascondendo quelli solo GM.

Durante il combattimento:

1. usa le frecce del lister per avanzare;
2. usa le azioni rapide oppure applica incantesimi e condizioni dai pannelli
   dedicati;
3. per le spell ad area, posiziona la zona dalla Console effetti ad area e
   verifica che l'istanza compaia nel registro;
4. avanza l'iniziativa e usa i reminder per sapere quali tiri effettuare al
   tavolo;
5. dichiara gli esiti e applica danni o condizioni con le console appropriate;
6. aggiungi note al log solo per eventi narrativi non rilevati automaticamente.

Dopo il combattimento:

1. esporta il log in TXT per una lettura rapida o JSON per analisi successive;
2. conserva o azzera i clock secondo la scena;
3. termina gli effetti non più validi e verifica che zone, aure e condizioni
   collegate siano state ripulite.
