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

Fai doppio clic sul nome per rinominare rapidamente il token. Il nuovo nome viene sincronizzato anche sotto il token sulla battlemap.

Il controllo accanto agli HP apre la modifica rapida o la scheda iniziativa, a seconda del tipo di attore. La dimensione dell'editor HP corrisponde al testo mostrato nella card.

Le card di creature con lo stesso nome vengono raggruppate. Una card collassata mostra **(Gruppo)** e il numero di membri. Il gruppo si espande automaticamente quando il turno entra nello stack e si richiude quando lo lascia; può anche essere aperto manualmente. L'animazione mantiene la prima card come ancora.

In caso di iniziative uguali, le card possono essere riordinate tramite trascinamento.

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

Apri **Incantesimi** dalla toolbar. Puoi:

- scegliere o cercare un incantesimo del catalogo SRD;
- indicare durata, incantatore e bersagli;
- combinare filtri di fazione e ricerca per nome;
- segnare la concentrazione;
- applicare automaticamente una condizione associata quando prevista;
- visualizzare e terminare gli incantesimi attivi sul campo.

Il catalogo integrato contiene 319 incantesimi SRD 5.1. Le durate avanzano con il combattimento e le scadenze sono collegate al turno appropriato. Un incantatore in concentrazione mostra una `C` sulla card e sul token.

Le pill degli incantesimi conservano il colore assegnato e vengono renderizzate sulla mappa insieme alle condizioni, senza diventare oggetti trascinabili accidentalmente.

## 8. Movimento e condizioni di D&D 2014

Il tracker movimento usa la velocità salvata nella scheda dell'attore e conta le caselle percorse nel turno. Il pulsante Movimento nella vista compatta mostra solo il riepilogo; l'interfaccia completa resta nel layout esteso.

Le seguenti condizioni modificano automaticamente la velocità:

- **Afferrato, Trattenuto, Paralizzato, Pietrificato, Stordito, Privo di sensi**: velocità 0;
- **Indebolimento 2–4**: velocità dimezzata;
- **Indebolimento 5**: velocità 0;
- **Prono**: rialzarsi consuma metà del movimento disponibile; finché il token resta prono, ogni casella percorsa costa due caselle.

Quando una velocità dimezzata produce mezze caselle, il numero di caselle viene arrotondato per difetto. Una velocità di 7 caselle diventa quindi 3 caselle.

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
- linea.

Durante il trascinamento compare la misura in metri. Origine e dimensioni possono agganciarsi al centro o ai vertici delle caselle. Le forme restano sulla scena dopo la creazione e continuano a selezionare i token intersecati quando vengono spostate.

Il cerchio e il cono usano il metodo **Template** di Xanathar: una casella è inclusa quando il modello la copre anche solo parzialmente. La forma sagomata segue quindi il contorno delle caselle incluse, mentre una silhouette geometrica interna rende leggibile la geometria originaria.

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
2. applica incantesimi e condizioni dai popup dedicati;
3. usa il targeting AoE per selezionare geometricamente i bersagli;
4. applica il risultato con la Console HP o con Condizioni;
5. aggiungi note al log solo per eventi narrativi non rilevati automaticamente.

Dopo il combattimento:

1. esporta il log in TXT per una lettura rapida o JSON per analisi successive;
2. conserva o azzera i clock secondo la scena;
3. termina gli effetti non più validi.
