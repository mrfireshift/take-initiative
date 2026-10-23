# Guida utente

Questa guida descrive l'uso di Take Initiative! nel suo scenario principale: un DM usa la vista GM come regia e proietta una seconda vista giocatori sul tavolo.

Le impostazioni locali e condivise sono raccolte nel pannello **Opzioni**; per
scope, precedenza e limiti consulta [Architettura Options](OPTIONS-ARCHITECTURE.md).
Le animazioni visuali degli incantesimi sono opzionali e descritte in
[Embers/JB2A](EMBERS.md).

## 1. Preparare la scena

Inserisci sulla mappa tutti i token che devono partecipare al combattimento. Dal menu contestuale di ogni token puoi:

- **Aggiungi all'iniziativa** o **Rimuovi dall'iniziativa**;
- **Segna come…** per assegnare la fazione;
- **Imposta quota…** per indicare l'altezza rispetto al piano della mappa;
- **Condizioni…** (solo GM) per applicare o togliere le condizioni rapide ai token selezionati (vedi [Condizioni](#6-condizioni));
- attivare una modalità boss compatibile.

Le fazioni disponibili sono:

- **PG**: personaggi giocanti;
- **Alleati**: creature amiche non controllate come PG;
- **Neutrali**: creature non schierate;
- **Nemici**: avversari.

La fazione determina colore delle card, filtri nei popup e visibilità di alcune informazioni nella vista giocatori.

### Configurare le fazioni in modo persistente

Dal tracker il GM può aprire **Configura fazioni** per assegnare una fazione a
più token della scena in una sola volta. Il configuratore registra
l'associazione nella stanza usando prima l'immagine del token e poi il nome
normalizzato.

Quando in seguito scegli **Aggiungi attori** o aggiungi nuovi token
all'iniziativa, il plugin riusa questa associazione. Un asset o un nome mai
visto viene trattato come **Nemico** finché il GM non lo assegna manualmente.
Se lo stesso nome è stato usato per fazioni diverse, il plugin non sceglie in
modo automatico: usa la fazione del token o chiede una correzione al GM.

Il configuratore è condiviso nella stanza e dispone di un fallback locale per il
browser. **Azzera registry** rimuove le associazioni salvate, non cambia le
fazioni già scritte sui token.

## 2. Aprire e configurare il tracker

Premi l'icona di Take Initiative! nella barra delle estensioni. Il tracker può essere chiuso e riaperto senza perdere lo stato del combattimento.

Sono disponibili due layout:

- **Esteso**: colonna verticale con più dettagli per card;
- **Compatto**: barra orizzontale flottante, pensata per lasciare libera la maggior parte della mappa.

Il pulsante di modalità passa da un layout all'altro. La posizione della barra compatta può essere trascinata e viene ricordata localmente.

### La barra compatta

La barra resta alta sempre uguale: quello che non sta nella card si apre di lato, non verso il basso.

- **Colonna sinistra**: maniglia per trascinare la barra, il **Round** corrente (visibile anche ai giocatori), il cambio di vista e, per il GM, il menu `…` con Reset round, Cronologia, Aggiungi attori, Compila iniziativa, Opzioni, Etichette mappa e Svuota iniziativa.
- **Card**: in alto a sinistra il badge dell'iniziativa e, sotto, l'icona blu della scheda personaggio (PG e alleati); a destra del ritratto la colonna dei pulsanti ⚡ 🪄 🗡️ (solo GM); il badge **KO** compare sul ritratto quando una creatura va a 0 PF.
- **Effetti**: la card mostra la prima etichetta; un clic sull'etichetta o sul pulsante `+N` apre accanto alla card un cassetto con tutte le altre, in colonne. Un nuovo clic sull'etichetta lo chiude. È aperto un cassetto alla volta e scorrendo la barra resta aperto.
- **Token collegati ed evocazioni**: una linguetta stretta accanto alla card mostra i ritratti e il numero; un clic la apre e mostra le righe dei compagni, con i loro PF (modificabili dal GM) e il clic per selezionare la pedina. Le card successive scorrono a destra.

### Vista GM e vista giocatori

Il GM vede i controlli di incontro, tracker, modifica e strumenti. I giocatori vedono il round e l'ordine di iniziativa, ma non le toolbar di regia.

Nella vista giocatori gli HP dei PG restano visibili. La modalità estesa può mostrare anche gli HP degli alleati, mentre quella compatta privilegia i soli PG; neutrali e nemici non espongono i propri HP ai giocatori. Quando un valore non è visibile non viene lasciato un testo o una barra vuota. Gli strumenti di amministrazione non sono interattivi per i giocatori.

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

### Incantesimi

La scheda **Incantesimi** della scheda personaggio raccoglie gli incantesimi
che il personaggio conosce o ha preparato, raggruppati per livello, con CD e
bonus di attacco in testa. In **Modifica** si cercano nel catalogo, si
aggiungono (anche con Invio) e si tolgono; la ★ li mette tra i preferiti.
Il catalogo non conosce le liste delle classi: puoi aggiungere qualsiasi
incantesimo, e il pulsante ✎ lo segna **Aggiunto manualmente** (da un talento,
un oggetto, una lista ampliata o una regola della casa). È solo un'etichetta:
l'incantesimo si prepara e conta come gli altri.

Chierici, druidi, maghi e paladini **preparano** gli incantesimi: sotto gli
slot compare "Preparati N/M", con il limite delle regole (modificatore di
Saggezza, Intelligenza o Carisma più il livello di classe, metà livello per
il paladino; servono i modificatori nella scheda). **Prepara** permette di
spuntare gli incantesimi preparati oggi e **Salva preparazione** li conserva.
Gli incantesimi non preparati restano nel libro, attenuati e senza lancio, e
non compaiono nel menu 🪄; i trucchetti sono sempre pronti. Oltre il limite il
contatore diventa arancio ma nulla viene bloccato. Gli altri incantatori
conoscono i loro incantesimi: tutto ciò che è nel libro è pronto.

Gli incantesimi della sottoclasse (dominio, giuramento, circolo, quelli dei
ranger e degli stregoni di Tasha e Xanathar) si aggiungono da soli fino al
livello di classe raggiunto: compaiono con 🔒 e il nome della sottoclasse,
sono sempre preparati e non contano nel limite. Il Circolo della Terra resta
manuale. Per il warlock la lista ampliata del patrono è solo un suggerimento:
in **Modifica** compare sotto il libro, con un pulsante per aggiungere ogni
incantesimo lanciabile con i suoi slot del Patto.

Il pulsante ▸ apre i dettagli di un incantesimo (scuola, tempo di lancio,
gittata, componenti, durata, testo e livelli superiori), uno alla volta. I
rituali hanno il badge **R**; nei dettagli **Lancia come rituale** li lancia
senza spendere slot (il lancio richiede 10 minuti in più). Il mago può
lanciare come rituale ogni rituale del libro, anche non preparato; chierico e
druido solo quelli preparati; il bardo quelli che conosce. Le altre classi no:
un talento come Incantatore Rituale passa da un'azione rapida con costo
"Gratuito", che apre il pannello già impostato su "Senza slot".

Sulla card del tracker il GM trova tre pulsanti in colonna sul bordo del
ritratto: ⚡ azioni rapide, 🪄 incantesimi, 🗡️ attacchi. Il menu 🪄 mostra in
alto i preferiti, lanciabili subito, e sotto un sottomenu per livello
(Trucchetti, 1° livello…) con i suoi incantesimi; "‹" torna al menu.

- Il pulsante dell'incantesimo lo lancia come un'azione rapida: applicato
  subito quando non serve altro, altrimenti aperto nel pannello incantesimi.
- ⚙ apre sempre il pannello, per scegliere slot, bersagli e varianti.
- I trucchetti d'attacco aprono la console attacchi quando negli **Attacchi**
  c'è un'azione Trucchetto, anche dal menu 🪄.
- Allo stesso modo Infliggi ferite, Dardo tracciante, Dardo incantato, Raggio
  rovente, Globo cromatico, Dardo di caos e Tocco del vampiro aprono la console
  sull'incantesimo scelto quando negli **Attacchi** c'è un'azione
  **Incantesimo d'attacco**. Nella console si sceglie lo slot (o il Patto): lo
  spende il primo raggio o dardo, i successivi dello stesso lancio no, e la
  console dice quanti ne restano. Dardo incantato colpisce senza tiro (Scudo lo
  blocca); Globo cromatico e Dardo di caos chiedono il tipo, e con due d8
  uguali il dardo balza su un'altra creatura. Tocco del vampiro si lancia dal
  pannello incantesimi; la console registra poi i tocchi finché dura la
  concentrazione, e il caster recupera metà del danno necrotico.
- Gli incantesimi che il plugin non automatizza (Controincantesimo, Dardo
  incantato, Desiderio, Identificare…) mostrano **Registra il lancio**: il lancio
  spende lo slot e finisce nel registro di combattimento, senza etichette; gli
  effetti si risolvono al tavolo. I bersagli selezionati compaiono nel
  registro, ma non servono. Nel pannello il pulsante si chiama **Registra
  lancio**; dal menu 🪄 un avviso dice quale slot è stato speso.
- Protezione dai veleni, Protezione dall'energia e Invulnerabilità danno
  difese vere finché durano: la console attacchi e la console boss dimezzano
  o azzerano il danno di quel tipo, e il GM può ignorare il chip della difesa
  per un singolo attacco. Le altre etichette dei benefici (Armatura magica, Pelle
  coriacea, Pelle di pietra…) sono promemoria per il tavolo.
- Cura ferite, Parola guaritrice, Preghiera di guarigione e Parola
  guaritrice di massa si risolvono nel pannello come Cura ferite di massa: si
  scelgono le creature (una, o fino a sei), si scrive la cura e gli HP salgono,
  mai oltre il massimo, annullabile dalla cronologia. Catapulta, Intimorire infernale, Sussurri
  dissonanti e Inaridire chiedono l'esito del TS e il danno, con i dadi dello
  slot.
- Sonno e Trama ipnotica finiscono quando la creatura subisce danno: l'etichetta
  sparisce da sola solo su quella creatura. Per svegliarla senza danno si
  rimuove l'etichetta a mano.
- Cerchio magico, Santificare, Proibizione e Pirotecnica chiedono la variante
  nel pannello prima di piazzare la zona. Con il Fumo di Pirotecnica non c'è
  TS: si segna ogni esito come superato. Bagliore solare e Drago illusorio
  propongono a inizio turno la nuova linea o il soffio, come Invocare il
  fulmine.
- Quando la creatura colpita da Marchio del cacciatore o Sortilegio scende a
  0 PF (o sparisce dalla scena), a inizio turno il caster può spostare il
  marchio: seleziona la nuova creatura e conferma. Sortilegio mantiene la
  caratteristica scelta. Dardo stregato propone a ogni turno l'azione da 1d12
  fulmine; Corona di follia chiede se il caster mantiene il controllo con
  l'azione, Duello obbligato se resta entro 9 m. Togliere l'etichetta di
  Invisibilità a una creatura (quando attacca o lancia) la termina solo per lei.
- Dalla console attacchi alcune fini sono automatiche, nello stesso comando
  dell'attacco (un Annulla le rende): una creatura invisibile per Invisibilità
  che attacca perde l'etichetta; Duello obbligato finisce quando il caster attacca
  un'altra creatura o un suo alleato ferisce il bersaglio del duello. Dopo un
  colpo con Lama roboante, se il bersaglio si muove nel suo turno compare
  l'avviso con i danni da tuono: conferma per applicarli, o chiudi l'avviso se
  lo spostamento era forzato.
- Alcuni incantesimi leggono i PF del bersaglio alla conferma (i PF temporanei
  non contano). Parola del potere uccidere non ha TS: con 100 PF o meno la
  creatura muore. Parola divina, al TS Carisma fallito, assorda, acceca o
  stordisce secondo i PF rimasti e uccide chi ha 20 PF o meno. Disintegrazione
  riduce in polvere chi porta a 0 PF; Dito della morte, se uccide un umanoide,
  ricorda a inizio del prossimo turno del caster che si rianima come zombi.
  Il campo **Tipo** della console dice se il bersaglio è umanoide (Dito della
  morte) o celestiale, elementale, folletto o immondo (Parola divina, che lo
  respinge sul suo piano); vuoto, decide il tipo scritto sul token. Chi muore
  così va a 0 PF con l'etichetta **Morto**, anche un mostro; un PG non tira i
  TS contro la morte. Regressione mentale infligge 4d6 psichici e, al TS
  Intelligenza fallito, l'etichetta **Regressione mentale**, da togliere a mano.
- Le cure e le pulizie su una creatura non chiedono TS né valori. Guarigione
  cura 70 PF (+10 per slot sopra il 6°) e toglie Accecato, Assordato e le
  malattie; Parola del potere guarire riporta ai PF massimi e toglie
  Affascinato, Paralizzato, Spaventato e Stordito; nessuna delle due agisce su
  costrutti e non morti. Ristorare inferiore toglie la condizione scelta nel
  campo **Termina** (o la malattia). Dissolvi magie termina gli incantesimi
  sulla creatura fino al 3° livello (o fino al livello dello slot); per quelli
  più alti segna nel campo **Prova** l'esito della prova del caster: se lo
  lasci vuoto restano, e il messaggio del pannello li elenca con la CD.

Gli incantesimi concessi da talenti, specie o oggetti restano nelle Azioni
rapide.

#### Slot incantesimo

Gli slot si ricavano da classi e livelli della scheda: incantatori pieni,
mezzi incantatori (paladino, ranger), Cavaliere Mistico e Mistificatore
Arcano, con la regola del multiclasse; la Magia del Patto del warlock resta a
parte. La scheda Incantesimi li mostra come pallini, uno per slot
disponibile: il GM clicca un pallino per segnare uno slot speso o
ripristinarlo; si annulla dalla cronologia.

Un lancio dalla scheda, dai pulsanti ⚡ e 🪄 o dal pannello incantesimi spende lo
slot nello stesso comando dell'incantesimo: un solo annullamento li toglie entrambi.
Vale per **ogni** incantesimo del catalogo, anche per quelli di cui il plugin
registra soltanto il lancio. Il registro di combattimento mostra il livello
dello slot e **Speso: …** per ogni lancio.

- Si spende uno slot del livello scelto; un warlock usa la Magia del Patto,
  al livello dei suoi slot (anche scegliendo il Patto nel pannello).
- Nel pannello, il menu **Slot** mostra quanti ne restano per livello e il
  menu **Spendi** sceglie la Magia del Patto o **Senza slot** (rituale,
  lancio gratuito).
- Senza slot disponibili il plugin chiede se lanciare comunque senza
  scalarne uno.
- Trucchetti, risoluzioni successive, azioni attive, trigger di zona e
  creature senza classi non spendono slot. Il loro lancio registrato, come
  quello **Senza slot**, va soltanto nel registro di combattimento: non
  cambiando nulla, non ha una voce da annullare nella cronologia.

Anche queste azioni scalano gli slot nel loro comando, annullabili in un solo passo:

- **Punizione Divina** e **Punizione Occulta**, nella console attacchi: il
  menu del livello mostra quanti slot restano e, senza slot, la console chiede
  se registrare l'attacco senza scalarlo;
- gli **incantesimi d'attacco** della console attacchi, allo stesso modo, con
  lo slot speso dal primo raggio o dardo del lancio;
- **Fonte di Magia**: *Crea slot* aggiunge uno slot anche oltre il massimo
  (pallino tratteggiato, sparisce al riposo lungo); *Converti slot* spende uno
  slot di quel livello per i punti stregoneria e si rifiuta se non ce n'è.

Recupero Arcano, Recupero Naturale e la Magia Selvaggia che restituisce uno
slot si segnano a mano dai pallini.

**Riposo breve** e **Riposo lungo**, sotto i pallini e in testa alle risorse
della scheda Capacità, ripristinano le risorse del personaggio: il riposo
breve quelle che tornano con un riposo breve al suo livello (slot del Patto,
ki, Incanalare Divinità…), il riposo lungo tutto, slot e usi delle azioni
rapide compresi. **Ripristina risorse** nel menu della card equivale al
riposo lungo. Dopo il riposo lungo della scheda, chi prepara gli incantesimi
trova l'invito "rivedi gli incantesimi preparati" e il pulsante **Prepara**
evidenziato, finché non lo apre.

### Importare una scheda

In **Modifica**, **Importa** compila la scheda da un blocco JSON ricavato da
una scheda personaggio (anche da un PDF, con l'aiuto di un assistente).
Scegli quali sezioni applicare: classi, specie, dono soprannaturale, statistiche, caratteristiche,
tiri salvezza, difese, incantesimi, attacchi e note. Nulla è salvato finché
non premi **Salva**. Formato e prompt sono in
[Importare una scheda](IMPORT_SCHEDA.md).

La scheda della card include anche la sezione **Azioni rapide**. Puoi
configurare fino a 12 scorciatoie per:

- lanciare o precompilare un incantesimo;
- aprire un incantesimo nella Console effetti ad area;
- applicare una condizione al caster o ai token selezionati;
- conservare slot, durata, scadenza e automazioni più usati;
- per un incantesimo, scegliere il **Costo**: uno slot (predefinito), **Usi
  propri** con un contatore che torna al riposo lungo (incantesimi da talenti,
  specie o oggetti) oppure **Gratuito**. L'elenco mostra gli usi rimasti.

Le azioni semplici sul caster o su un solo bersaglio possono essere eseguite
direttamente; negli altri casi la scorciatoia apre il pannello corretto con i
campi già compilati.

Fai doppio clic sul nome per rinominare rapidamente il token. Il nuovo nome viene sincronizzato anche sotto il token sulla battlemap.

Il GM modifica gli HP con un clic sul valore, nella card estesa come in quella compatta: si aprono due campi, HP attuali e massimi, dove puoi scrivere il nuovo valore, un delta (`-7`, `+5`) o un piccolo calcolo. **Invio** conferma, **Esc** annulla, **Tab** passa al massimo e poi alla card successiva. Nella card compatta il testo resta al suo posto: diventa tutto bianco e i numeri modificabili sono sottolineati. Ogni modifica è una voce annullabile della Cronologia.

L'icona blu della scheda (accanto agli HP nella card estesa, sotto l'iniziativa in quella compatta) apre in un clic la scheda personaggio di PG e alleati, anche per i giocatori. Il pulsante **±** della card estesa ricalibra insieme HP attuali e massimi.

Allo stesso modo un clic sul badge dell'iniziativa lo rende modificabile (solo GM, in entrambe le viste); **Invio** salva, riordina le card e passa alla card successiva. **Compila iniziativa** apre in fila le creature ancora da compilare e le evidenzia con un bordo tratteggiato: **Invio** o **Tab** passa alla successiva, **Ctrl+Invio** chiude, e le card si riordinano alla fine.

Le card di creature con lo stesso nome vengono raggruppate. Una card collassata mostra **(Gruppo)** e il numero di membri. Il gruppo si espande automaticamente quando il turno entra nello stack e si richiude quando lo lascia; può anche essere aperto manualmente. L'animazione mantiene la prima card come ancora.

In caso di iniziative uguali il GM può riordinare le card trascinandole: passando con il mouse su una card che ha un pari merito compare la maniglia **⠿** (fuori dal bordo destro nella vista estesa, in basso a sinistra in quella compatta). Le Azioni epiche si spostano insieme al PG che seguono; all'iniziativa 20 i Boss Epici restano in testa e non si scavalcano.

### Capacità di classe

Nella scheda **Capacità** della card il GM può indicare fino a quattro classi,
livello e sottoclasse, quindi abilitare le capacità che devono essere visibili
e utilizzabili per quel personaggio. Il catalogo mostra anche le capacità non
ancora automatizzate, ma queste restano un riferimento da gestire manualmente.

Le capacità pronte possono consumare una risorsa, applicare un effetto a sé,
chiedere un bersaglio o mantenere un'aura. Il GM deve confermare tiri, scelte,
esiti e conseguenze che il plugin non può risolvere. Le istanze attive mostrano
durata, bersagli e promemoria; le condizioni create dalla capacità compaiono
nella finestra **Condizioni** e vengono rimosse insieme all'istanza corretta.

Per conteggi, adapter, limiti e persistenza consulta
[Capacità di classe](CAPACITA_CLASSE.md).

## 4. Gestire il combattimento

La testata mostra il round corrente e i comandi principali. Puoi:

- avviare o azzerare un incontro;
- avanzare o tornare indietro nell'ordine;
- aggiungere o rimuovere attori;
- aprire il registro combattimento e la cronologia;
- passare tra layout compatto ed esteso.

Il turno attivo è evidenziato con colore e glow di fazione e con un alone che pulsa lentamente (fermo se il sistema chiede di ridurre il movimento). Nella vista giocatori il ritratto della card attiva porta anche il badge ⚔️; nella vista GM estesa quel lato del ritratto è occupato dai pulsanti ⚡ 🪄 🗡️, che nella card compatta stanno in colonna a destra del ritratto. Sulla mappa compare un'etichetta **Turno di…** sopra il token attivo.

I gruppi omonimi, le azioni di tana, i turni Paragon e le azioni epiche possono introdurre voci virtuali nell'ordine. Queste voci non corrispondono necessariamente a un elemento reale della scena.

**Svuota iniziativa** e **Reset round** agiscono subito, senza conferma: in basso nel tracker compare per 8 secondi un avviso con **Annulla**, che rimette ordine, turno attivo, round e token in iniziativa (per Svuota) o il round precedente (per Reset round). Se nel frattempo è iniziato un altro combattimento, o il round è già cambiato, l'annullamento non sovrascrive niente e lo segnala.

### Tasti per il turno

Quando il tracker ha il focus della tastiera (dopo un clic nel tracker, per esempio su una card), il GM può usare **Spazio** o **→** per il turno successivo e **←** per il precedente. Sono gli stessi comandi dei pulsanti. Non funzionano mentre scrivi in un campo, con un editor aperto o durante Compila iniziativa. Owlbear Rodeo non offre scorciatoie globali alle estensioni: dopo un clic sulla mappa i tasti tornano a Owlbear.

### Focus token e tana

- **Focus token** centra o segue il token attivo, utile quando il DM controlla la regia da un altro schermo.
- **Tana** abilita la gestione delle azioni di tana nell'incontro.

### Reazione e azione preparata

Nella riga HP di ogni card c'è l'icona della reazione (una freccia curva):
verde quando la reazione è disponibile, rossa e spenta quando è stata usata. Il GM la segna o la
ripristina con un clic; i giocatori la vedono sulle card dei PG e degli
alleati. La reazione usata torna da sola all'inizio del turno successivo della
creatura.

Dal menu contestuale della card, **Azione preparata** la segna fino
all'inizio del prossimo turno della creatura; quando è attiva compaiono
**Innesca azione preparata** (toglie l'azione preparata e segna la reazione
come usata, in un solo passo annullabile) e **Annulla azione preparata**.

Entrambe sono condizioni normali: compaiono come etichette sulla card e sulla
mappa, si annullano dalla Cronologia e seguono le opzioni di visibilità degli
effetti per i giocatori.

Gli incantesimi a reazione (Scudo, Assorbire elementi, Intimorire infernale,
Caduta morbida, Controincantesimo, Gabbia dell'anima) spendono da soli la
reazione del caster quando li lanci dal pannello incantesimi o da un'azione
rapida, nello stesso passo annullabile dello slot. Succede solo in
combattimento, con un ordine di iniziativa. Se la reazione è già usata, il
plugin chiede conferma prima di lanciare.

## 5. HP e modifiche rapide

Gli HP canonici sono quelli della card/token. Le barre sulla mappa sono una rappresentazione derivata e si aggiornano insieme al tracker.

Puoi modificare un singolo attore dalla sua card (clic sugli HP) oppure usare la **Console effetti manuali** per un'operazione su più bersagli.

### Console effetti manuali

1. Apri **Effetti** dalla toolbar del tracker: la console parte dalla scheda **Effetti** (tiri salvezza e condizioni). Dal menu di un modello d'area, **Seleziona e apri Console effetti ad area** la apre già su **Danno**.
2. Scegli **Danno**, **Cura** o **HP temp.**.
3. Inserisci il valore nel campo accanto al pulsante di applicazione.
4. Filtra i bersagli per nome e/o fazione.
5. Seleziona i bersagli dalla lista o direttamente sulla mappa.
6. Per ogni bersaglio scegli `×2`, `1`, `½` o `¼`.
7. Controlla l'anteprima e applica.

I bersagli selezionati salgono in cima alla lista. L'applicazione è atomica: un solo comando aggiorna tutti i token e crea un'unica voce annullabile. Se il danno colpisce creature in concentrazione, viene mostrato l'avviso relativo.

### TS contro la morte

Un PG a 0 PF, né stabile né morto, riceve a inizio turno il promemoria **TS contro la morte**, con i successi e i fallimenti accumulati (●●○ / ✕○○). Il popup compare anche sullo schermo del tavolo, ma i pulsanti li ha solo il GM: dopo il tiro del d20 segna **Successo**, **Fallimento**, **1 naturale** (due fallimenti) o **20 naturale** (torna a 1 PF). Ogni tiro è una voce annullabile della Cronologia.

- Tre successi: l'etichetta **Stabile**; i tiri si fermano e il conteggio si azzera.
- Tre fallimenti: l'etichetta **Morto** prende il posto di Privo di sensi. La toglie il GM.
- Una cura sopra 0 PF azzera il conteggio e toglie Stabile.
- Un danno che porta a 0 PF e avanza almeno quanto i PF massimi è morte istantanea.
- Un danno subito mentre il PG è già a 0 PF conta un fallimento, due se critico; un danno pari ai PF massimi lo uccide; un PG stabile torna a tirare. Vale per la Console effetti manuali, la console attacchi (l'esito **Critico** conta due fallimenti), le azioni boss e le console degli incantesimi. Nella Console effetti manuali, sulla riga di un PG a 0 PF, il pulsante **Crit** segna il colpo critico; l'anteprima mostra «TS morte +1 fallimento».

## 6. Condizioni

Apri **Condizioni** dalla toolbar. La finestra permette di:

- cercare bersagli per nome;
- combinare liberamente i filtri PG, Alleati, Neutrali e Nemici;
- selezionare token dalla lista o dalla mappa;
- applicare condizioni predefinite;
- creare una condizione personalizzata con durata;
- rimuovere o aggiornare istanze già attive.

Le condizioni supportano scadenza manuale, dopo un numero di round, all'inizio del turno, alla fine del turno o insieme alla concentrazione. Sono consentite fino a tre condizioni personalizzate per token.

Nella card estesa compaiono le prime etichette e il pulsante `…` mostra le altre; nella card compatta compare la prima, e le altre si aprono nel cassetto laterale (vedi [La barra compatta](#la-barra-compatta)). Sulla mappa le condizioni compaiono come etichette bloccate e ancorate al token.

### Condizioni rapide

Le condizioni più usate al tavolo si applicano senza aprire la finestra: tutte quelle predefinite tranne Pietrificato (Accecato, Affascinato, Afferrato, Assordato, Avvelenato, Incapacitato, Invisibile, Paralizzato, Privo di sensi, Prono, Spaventato, Stordito, Trattenuto). Solo per il GM.

- **Dalla card**: clic destro sulla card → **Condizioni** › e scegli la condizione. Un clic la applica o la toglie e chiude il menu. In fondo, **Tutte le condizioni…** apre la finestra completa.
- **Dalla mappa**: clic destro sui token → **Condizioni…**. Il sottomenu resta aperto dopo ogni clic, così puoi mettere più condizioni di fila; anche qui **Tutte le condizioni…** apre la finestra.

Ogni pulsante mostra lo stato della condizione: evidenziato se ce l'hanno tutte le creature scelte, con un bordo leggero se ce l'hanno solo alcune. In quel caso un clic la aggiunge a chi non ce l'ha; se ce l'hanno tutte, la toglie a tutte. Ogni clic è una voce della Cronologia. La rimozione toglie la condizione intera, anche quella messa da un incantesimo con una durata: per durate e fonti usa la finestra completa.

**Ira** non è una condizione ma la capacità del Barbaro: si attiva dalle capacità di classe e non compare più tra le condizioni da applicare.

### Indebolimento

L'indebolimento è gestito direttamente nella scheda personaggio con un controllo bidirezionale da 0 a 5. Il valore nella scheda e la condizione sul token restano sincronizzati. Non è trattato come una normale condizione a durata breve.

## 7. Incantesimi e concentrazione

Apri **Incantesimi** dalla toolbar. Il catalogo runtime contiene 477
definizioni tratte dal catalogo base SRD 5.1 e dalle integrazioni 2014; il
pannello unificato espone 393 voci, di cui 358 provengono dal catalogo
trackable. Gli istantanei senza stato persistente restano soprattutto nel
riferimento o nei workflow ad area.

Per gli incantesimi con visuale abbinata il GM può lasciare attive le animazioni
Embers/JB2A dalla policy della stanza. La visuale è un effetto decorativo best-effort e
non cambia la risoluzione o la persistenza dell'incantesimo.

Dal pannello puoi:

- scegliere o cercare un incantesimo;
- indicare incantatore, slot, durata e bersagli;
- combinare filtri di fazione e ricerca per nome;
- usare le varianti e le automazioni disponibili;
- preparare un incantesimo che verrà risolto in seguito;
- visualizzare, attivare e terminare gli incantesimi presenti sul campo.

### Registro degli incantesimi attivi

Il registro raccoglie le istanze attive indipendentemente dal punto in cui sono
state create. Un incantesimo lanciato dalla **Console effetti ad area** compare
quindi nello stesso registro di uno lanciato dal pannello Incantesimi.

La card dell'istanza mostra durata, incantatore, concentrazione, bersagli ed
eventuali azioni disponibili. Alcuni incantesimi consentono di applicare
un'attivazione successiva, per esempio ripetere Riscaldare il metallo, scegliere
una variante di Controllare Venti o applicare un esito di Sguardo penetrante.

Gli incantesimi preparati restano sul caster. Quando devono essere risolti, il
plugin chiede bersagli e variante senza creare una seconda concentrazione.

### Concentrazione e pulizia

Un incantatore in concentrazione mostra una `C` sulla card e sul token.
Interrompere la concentrazione termina l'istanza collegata e rimuove le zone,
le aure, le etichette e le condizioni figlie che dipendono da essa. La stessa
pulizia avviene quando termina la durata naturale. Lanciare un altro
incantesimo a concentrazione, da un'azione rapida o dal pannello, chiede prima
conferma: annullando, la concentrazione in corso resta e non si spende nulla.

Per **Palla di Fuoco Ritardata**, l'interruzione volontaria, un TS di
concentrazione fallito, la sostituzione con un altro incantesimo a concentrazione e la
scadenza naturale aprono prima la detonazione terminale: il GM risolve il
raggio corrente di 6 m, i TS Destrezza e un unico totale di danno da fuoco,
poi la concentrazione e la perla vengono rimosse nella stessa transazione.

Le etichette conservano il colore assegnato e vengono renderizzate sulla mappa
insieme alle condizioni, senza diventare oggetti trascinabili accidentalmente.

### Promemoria e tiri fisici

Il plugin non tira i dadi. Quando un effetto richiede un tiro salvezza a inizio
o fine turno, compare un promemoria compatto con:

- token e condizione coinvolti;
- caratteristica del tiro;
- CD della scheda del caster, se presente;
- nome del caster;
- conseguenza informativa.

I promemoria concorrenti vengono aggregati. Avanzando l'iniziativa, il nuovo
promemoria sostituisce il precedente; se l'attore successivo non è coinvolto,
l'avviso scompare.

Il GM effettua il tiro al tavolo e dichiara l'esito. Nella Console effetti ad
area i controlli **Superato** e **Fallito** compaiono soltanto
quando esiste un effetto immediato da risolvere. Le condizioni dipendenti dal
fallimento, come Prono per Tempesta di Nevischio o Trattenuto per Tentacoli
Neri, devono essere applicate dopo il risultato reale.

Quando il promemoria è compatibile, il GM può anche inserire una sola volta il
risultato dei dadi fisici. Il plugin applica danno pieno al fallimento, metà
danno al successo quando previsto dalla regola (arrotondata per difetto) e
nessun danno per un esito nullo o immune. Il successo può rimuovere una
condizione o terminare un effetto/istanza di incantesimo modellata; il fallimento può
mantenere l'effetto oppure applicare la condizione dichiarata dal catalogo.

I controlli sono esclusivi della vista GM. La vista giocatori riceve lo stesso
promemoria informativo, ma non mostra pulsanti o input. Ogni conferma passa dal
coordinatore di effetti: HP, etichette, tracker e barre mappa restano derivati dai
metadata canonici, mentre una sola voce della cronologia alimenta anche il
registro combattimento. Un promemoria già risolto, duplicato o diventato obsoleto non viene
riapplicato; il GM può chiudere l'avviso e continuare senza conseguenze.

Restano informativi i promemoria privi di una descrizione strutturata. L'MVP non
esegue tiri virtuali, bonus automatici, resistenze/vulnerabilità, testo libero,
risoluzioni aggregate multi-bersaglio o scripting personalizzato.

Per geometrie, trigger supportati, azioni attive e copertura residua consulta
[Incantesimi, zone e promemoria](INCANTESIMI_E_ZONE.md).

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

## 10. Cronologia e registro combattimento

Il pannello separa due funzioni:

- **Cronologia**: azioni annullabili, con possibilità di annullare una o più operazioni;
- **Registro combattimento**: resoconto leggibile degli eventi.

Il registro raggruppa gli eventi per round, accumula il movimento totale degli attori e registra gli annullamenti come nuovi eventi, senza riscrivere il passato. Puoi:

- cercare per attore, bersaglio o evento;
- filtrare il tipo di evento;
- aggiungere note manuali;
- iniziare un nuovo registro;
- cancellare il registro con conferma;
- esportare in TXT o JSON.

Il registro è locale al browser GM e separato dalla Cronologia: per il contratto
di storage, compatibilità ed export consulta [Registro combattimento](COMBAT-LOG.md).

## 11. Clock

Lo strumento **Clock** si trova nella toolbar destra di Owlbear Rodeo. I clock sono manuali e appartengono alla scena.

- Segmenti disponibili: 4, 6, 8 e 12.
- Colori disponibili: rosso, ambra, verde, azzurro, viola e rosa.
- Ogni clock può essere incrementato, decrementato, azzerato, rinominato, riordinato o eliminato.
- Il GM può nascondere un clock ai giocatori.
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
- rettangolo per gli incantesimi che lo richiedono.

Durante il trascinamento compare la misura in metri. Origine e dimensioni possono agganciarsi al centro o ai vertici delle caselle. Le forme restano sulla scena dopo la creazione e continuano a selezionare i token intersecati quando vengono spostate.

Il cerchio e il cono usano il metodo **Template** di Xanathar: una casella è inclusa quando il modello la copre anche solo parzialmente. La forma sagomata segue quindi il contorno delle caselle incluse, mentre una silhouette geometrica interna rende leggibile la geometria originaria.

Le geometrie rettangolari specifiche degli incantesimi usano invece una soglia
di copertura prossima alla metà della casella. Folata di Vento produce così un
rettangolo da 18 × 3 metri senza estensioni oltre i suoi bordi.

Le zone persistenti degli incantesimi aggiungono al disegno una logica di
appartenenza e attraversamento. Possono generare promemoria all'ingresso, durante
il movimento, all'uscita, a inizio turno o a fine turno e possono dichiarare
terreno difficile. Una zona mobile o un'aura mantiene il collegamento con la
propria sorgente.

Nel pannello incantesimi, dopo la sagoma, gli incantesimi che colpiscono o
curano «le creature a scelta» nell'area (Cura ferite di massa, Aura sacra,
Parola divina, Parola radiosa, Lentezza, Onda distruttiva) spuntano per primi i
bersagli giusti: la parte del caster per una cura o una benedizione, la parte
avversaria per un danno. Togli o aggiungi le spunte dalla lista, entro il limite
di bersagli. **Modifica bersagli** lascia l'area dov'è e apre la lista a
qualsiasi creatura; **Riposiziona area** la ridisegna. Nel registro e nella
Cronologia un lancio senza TS (una cura, Parola del potere uccidere, Dissolvi
magie) compare come incantesimo, non come tiro salvezza.

**Aspetto area** permette di scegliere colore del riempimento, colore del contorno, opacità e spessore. Lo stile è una preferenza locale usata per le nuove aree. Dal menu contestuale di un'area puoi scegliere **Riseleziona bersagli**.

## 14. Etichette sulla mappa

Il plugin crea elementi derivati e bloccati per evitare trascinamenti accidentali:

- barra e numero HP;
- nome sincronizzato;
- indicatore di turno;
- `C` di concentrazione;
- etichette di condizioni e incantesimi;
- quota;
- indicatori di movimento.

Dimensione, spaziatura e allineamento delle etichette si adattano allo zoom. Questi elementi non sono la fonte dei dati: possono essere rigenerati a partire dai metadata del token.

## 15. Flusso consigliato al tavolo

Prima della sessione:

1. prepara i token e assegna le fazioni;
2. completa HP, iniziativa, velocità e risorse boss;
3. verifica la vista giocatori sul display del tavolo;
4. crea eventuali clock iniziali, nascondendo quelli solo GM.

Durante il combattimento:

1. usa le frecce del tracker (o Spazio, → e ←) per avanzare;
2. usa le azioni rapide oppure applica incantesimi e condizioni dai pannelli
   dedicati; per le condizioni comuni basta il clic destro sulla card o sul
   token (**Condizioni rapide**), per i danni a una creatura il clic sui suoi HP;
3. per gli incantesimi ad area, posiziona la zona dalla Console effetti ad area e
   verifica che l'istanza compaia nel registro;
4. avanza l'iniziativa e usa i promemoria per sapere quali tiri effettuare al
   tavolo;
5. dichiara gli esiti e applica danni o condizioni con le console appropriate;
6. aggiungi note al registro solo per eventi narrativi non rilevati automaticamente.

Dopo il combattimento:

1. esporta il registro in TXT per una lettura rapida o JSON per analisi successive;
2. conserva o azzera i clock secondo la scena;
3. termina gli effetti non più validi e verifica che zone, aure e condizioni
   collegate siano state ripulite.

## 16. Schermo del tavolo che ruota verso chi gioca

Con lo schermo steso sul tavolo, l'intera pagina di Owlbear (mappa, token,
tracker e avvisi) può girarsi verso il giocatore di turno. Owlbear non permette
alle estensioni di ruotare la vista, quindi la rotazione la fa il browser dello
schermo del tavolo con uno userscript; il plugin gli dice soltanto verso quale
lato guardare.

1. Installa Tampermonkey o Violentmonkey nel Chrome che apre la finestra dei
   giocatori, poi apri `<URL_BASE>/table-rotation.user.js` e conferma
   l'installazione. Se la finestra dei giocatori è in incognito, in
   `chrome://extensions` → Tampermonkey → Dettagli attiva «Consenti in
   modalità di navigazione in incognito» (e «Consenti script utente», se
   presente). Lo script può girare anche nella finestra del GM: il plugin
   risponde solo ai client giocatore, quindi quella non ruota. Usa la finestra
   dei giocatori solo per guardare: con la pagina ruotata, clic e trascinamenti
   non corrispondono più a ciò che si vede.
2. Nel tracker del GM, clic destro sulla card di ogni PG (o alleato) →
   **Lato del tavolo** e scegli il bordo dello schermo dove siede il
   giocatore: Sud (in basso), Ovest (sinistra), Nord (in alto), Est (destra).
   «Nessuno» lo toglie; il lato attuale è segnato come «Attivo».
3. Durante il combattimento, a ogni turno di un PG con un lato la pagina si gira
   verso di lui. Mostri, voci virtuali (tana, Paragon, Epic) e assenza di
   combattimento usano l'orientamento predefinito dello userscript
   (`defaultDegrees`, 0 = Sud).

Sullo schermo del tavolo **Alt+Shift+R** sospende o riprende la rotazione. I
lati Est e Ovest scambiano larghezza e altezza della pagina: sono sperimentali e
si possono disattivare nello userscript (`allowQuarterTurns: false`). Gli altri
client, senza userscript, non ricevono niente e non cambiano.
