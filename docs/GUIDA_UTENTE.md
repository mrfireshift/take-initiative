# Guida utente

Questa guida descrive l'uso di Take Initiative! nel suo scenario principale: un DM usa la vista GM come regia e proietta una seconda vista giocatori sul tavolo.

Le impostazioni locali e condivise sono raccolte nel pannello **Opzioni**; per
scope, precedenza e limiti consulta [Architettura Options](OPTIONS-ARCHITECTURE.md).
Le animazioni visuali degli incantesimi sono opzionali e descritte in
[Embers/JB2A](EMBERS.md). In **Opzioni → Manutenzione** la riga **Versione in
uso** dice quale build gira nella stanza: versione, data e sigla del commit.

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
browser. **Azzera registro** rimuove le associazioni salvate, non cambia le
fazioni già scritte sui token.

## 2. Aprire e configurare il tracker

Premi l'icona di Take Initiative! nella barra delle estensioni. Il tracker può essere chiuso e riaperto senza perdere lo stato del combattimento.

Sono disponibili due layout:

- **Esteso**: colonna verticale con più dettagli per card;
- **Compatto**: barra orizzontale flottante, pensata per lasciare libera la maggior parte della mappa.

Il pulsante di modalità passa da un layout all'altro. La posizione della barra compatta può essere trascinata e viene ricordata localmente.

Nella vista estesa la striscia sottile sopra la testata serve a trascinare il tracker; il cambio di vista sta nella testata, accanto al round; in fondo alla testata **+** (aggiungi attori) e **×** (svuota iniziativa) formano un gruppo, e in fondo alla colonna restano solo i pulsanti ▲ ▼ del turno (GM).

### La barra compatta

La barra resta alta sempre uguale: quello che non sta nella card si apre di lato, non verso il basso.

- **Colonna sinistra**: maniglia per trascinare la barra, il **Round** corrente (visibile anche ai giocatori), il cambio di vista e, per il GM, il menu `…` con Reset round, Cronologia, Riposo del gruppo, Etichette mappa, Opzioni e, in fondo, Aggiungi attori e Svuota iniziativa.
- **Card**: in alto a sinistra il badge dell'iniziativa e, sotto, l'icona blu della scheda personaggio (PG e alleati; per il GM ogni creatura); a destra del ritratto la colonna dei pulsanti ⚡ 🪄 🗡️ (solo GM); il badge **KO** compare sul ritratto quando una creatura va a 0 PF.
- **Effetti**: la card mostra la prima etichetta; un clic sull'etichetta o sul pulsante `+N` apre accanto alla card un cassetto con tutte le altre, in colonne. Un nuovo clic sull'etichetta lo chiude. È aperto un cassetto alla volta e scorrendo la barra resta aperto. Per il GM la **×** di un'etichetta nel cassetto rimuove la condizione o termina l'incantesimo, come la × della vista estesa; l'etichetta sulla card non ha la ×, così non si tocca per sbaglio.
- **Token collegati ed evocazioni**: una linguetta stretta accanto alla card mostra i ritratti e il numero; un clic la apre e mostra le righe dei compagni, con i loro PF (modificabili dal GM) e il clic per selezionare la pedina. Le card successive scorrono a destra.

### Vista GM e vista giocatori

Il GM vede i controlli di incontro, tracker, modifica e strumenti. I giocatori vedono il round e l'ordine di iniziativa, ma non le toolbar di regia.

Con l'iniziativa vuota il tracker del GM mostra «Nessuna creatura in iniziativa» con il pulsante **+ Aggiungi attori**; quello dei giocatori resta vuoto.

Nel profilo Online, nella vista estesa, sopra il nome di ogni PG assegnato c'è una pill con il nome del suo giocatore, nel colore che il giocatore ha in Owlbear. Nella vista compatta il nome resta sottolineato. Sul proprio schermo il giocatore vede l'icona della scheda solo sulla card del suo PG, e non vede l'icona della reazione.

Nella vista giocatori i PF dei PG restano visibili. La modalità estesa può mostrare anche i PF degli alleati, mentre quella compatta privilegia i soli PG; neutrali e nemici non espongono i propri PF ai giocatori. Quando un valore non è visibile non viene lasciato un testo o una barra vuota. Gli strumenti di amministrazione non sono interattivi per i giocatori.

Un token che il GM tiene nascosto non arriva ai giocatori in nessuna forma: niente card nel loro tracker, niente barra né aure sulla mappa, niente avviso di turno, promemoria, avvisi di concentrazione o di movimento, stato del movimento o animazioni che lo riguardano; la selezione del GM inviata al tavolo lo esclude. Durante il suo turno il tracker dei giocatori lascia evidenziata l'ultima card attiva visibile. Il GM lo riconosce dal ritratto oscurato con l'occhio barrato al centro. Quando il GM lo mostra, la sua card compare subito.

## 3. Impostare le card

Ogni card può contenere:

- nome e ritratto;
- iniziativa;
- PF attuali e massimi;
- barra PF;
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
non compaiono nella console attacchi; i trucchetti sono sempre pronti. Oltre il limite il
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

Sulla card del tracker il GM trova due pulsanti in colonna sul ritratto: ⚡
azioni rapide e 🗡️, che apre in un clic la console attacchi del personaggio.
La console elenca attacchi, incantesimi del libro (i preferiti in cima a ogni
livello) e capacità; aperta senza una voce scelta, torna all'ultima usata con
quel personaggio.

- Il pulsante dell'incantesimo lo lancia come un'azione rapida: applicato
  subito quando non serve altro, altrimenti aperto nel pannello incantesimi.
- ⚙ apre sempre il pannello, per scegliere slot, bersagli e varianti. Serve anche su
  un incantesimo d'attacco: per un lancio senza slot, come da una pergamena, o per
  Dardo incantato con tutti i dardi insieme.
- I trucchetti d'attacco del libro aprono la console attacchi, che li risolve con
  dadi, esito e danno: sulla scheda non serve nessuna azione. Creare Falò, che è una
  zona, si lancia nel pannello; Lama Roboante e Lama Verdefiamma si scelgono
  sull'attacco con arma da mischia, fra gli extra al colpo. Un trucchetto che non sta
  nel libro, da una specie o da un talento, si aggiunge negli **Attacchi** con
  un'azione Trucchetto.
- Allo stesso modo Infliggi ferite, Dardo tracciante, Dardo incantato, Raggio
  rovente, Globo cromatico, Dardo di caos e Tocco del vampiro aprono la console
  sull'incantesimo scelto. Nella console si sceglie lo slot (o il Patto): lo
  spende il primo raggio o dardo, i successivi dello stesso lancio no, e la
  console dice quanti ne restano. Dardo incantato colpisce senza tiro (Scudo lo
  blocca): non c'è un esito da scegliere, si scrive il danno del dardo e si preme
  Invio, e il dardo dopo è pronto sullo stesso bersaglio. Globo cromatico e
  Dardo di caos chiedono il tipo, e con due d8
  uguali il dardo balza su un'altra creatura. Tocco del vampiro mostra **Lancia**
  finché non è attivo; lanciato, la console passa da sola al tocco e registra i
  tocchi finché dura la concentrazione, e il caster recupera metà del danno
  necrotico.
- Gli incantesimi che il plugin non automatizza (Controincantesimo,
  Desiderio, Identificare…) mostrano **Registra il lancio**: il lancio
  spende lo slot e finisce nel registro di combattimento, senza etichette; gli
  effetti si risolvono al tavolo. I bersagli selezionati compaiono nel
  registro, ma non servono. Nel pannello il pulsante si chiama **Registra
  lancio**; nella console attacchi la riga del lancio dice quale slot è stato
  speso.
- Gli incantesimi senza una creatura nel testo (Luce, Luci danzanti, Mano
  magica, Illusione minore, Prestidigitazione, Taumaturgia, Randello incantato,
  Pietra Magica, Disco fluttuante, Scritto illusorio, Immagine silenziosa, Occhio
  arcano, Chiaroveggenza, Serratura arcana, Trucco della corda, Destriero
  fantomatico, Servitore inosservato…) e quelli che evocano (tutti gli Evoca,
  Evocare Bestia, Richiamo Infernale, Danza Macabra) non chiedono bersagli: la
  pill sta sul caster. Quelli che durano finché non vengono dissolti (Giara magica,
  Fiamma perenne, Bocca magica…) non scadono da soli: la pill mostra **M** e la
  togli a mano. Se il bersaglio può essere una creatura o un oggetto (Aura magica
  dell'arcanista, Anti-individuazione), per un oggetto spunta il caster.
- La durata segue lo slot o la scelta quando il testo lo dice: Sortilegio dura 8
  ore dal 3° slot e 24 dal 5°, Animale messaggero 48 ore in più per slot, Immagine
  maggiore dal 6° slot non chiede concentrazione e resta fino alla rimozione, il
  matrimonio di Cerimonia dura 7 giorni.
- Protezione dai veleni, Protezione dall'energia, Invulnerabilità, Aura di
  Purezza, Aura di Vita, Fortezza della Mente, Morte Apparente, Investitura del
  Ghiaccio, Investitura della Fiamma, Abito Ultraterreno e Vuoto mentale danno difese vere
  finché durano: la console attacchi, la console boss e i danni degli incantesimi
  dimezzano o azzerano il danno di quel tipo, e il GM può ignorare il chip della
  difesa per un singolo attacco o lancio. Le altre etichette dei benefici (Armatura
  magica, Pelle coriacea, Pelle di pietra…) sono promemoria per il tavolo.
- **Le difese nei danni degli incantesimi.** Nel pannello, nel popup delle azioni, in
  quello delle punizioni e nei promemoria scrivi il danno intero: il conto delle resistenze, delle immunità e
  delle vulnerabilità lo fa il plugin, per ogni bersaglio. Quando una difesa entra in gioco
  compare un chip giallo accanto al nome del bersaglio, già prima che tu scriva il
  danno; scende sotto il nome solo se non ci sta. Dice il conto (`Res. freddo: 20 → 10`)
  e il suo suggerimento dice di chi è la difesa e che cosa fa al numero. Un clic la ignora per quel lancio: il chip si barra e il danno
  torna pieno. Il TS viene prima: 20 con TS superato sono 10, e con la resistenza 5.
  Le difese limitate alle armi non magiche, dei mostri e di Avatar della Battaglia, non contano
  contro un incantesimo; la resistenza ai danni degli incantesimi (Aura di Interdizione,
  Resistenza agli Incantesimi dell'abiuratore) sì, su ogni tipo.
  Il registro di combattimento dice quale difesa ha contato o è stata ignorata.
- Spruzzo prismatico e Muro prismatico fanno il conto raggio per raggio e strato per
  strato, ognuno col suo tipo e il suo TS. Nello Spruzzo il chip compare accanto al nome
  appena scegli il raggio, nel Muro nella riga di ogni strato.
- Nei promemoria (chi entra in una Nube di Pugnali, chi inizia il turno in un Muro di
  fuoco, Immolazione, Colpo intrappolante…) il chip sta accanto al campo **Danni**. Poiché
  premere l'esito applica subito, il suo conto è quello del danno pieno: con il TS
  superato conta prima la metà, e il suggerimento lo ricorda.
- **Due tipi nello stesso danno** (Colpo infuocato, Tempesta di ghiaccio, Sciame di
  meteore, Onda distruttiva): il pannello ha una casella per tipo, con i suoi dadi
  (`Fuoco · 4d6`, `Radiosi · 4d6`), e le somma. Ogni casella prende la sua metà col TS
  superato e la difesa del suo tipo: il chip dice che cosa ha fatto a quella parte
  (`Res. fuoco: 13 → 6`), e il danno resta uno solo per la concentrazione e i TS contro la
  morte. Per Onda distruttiva il selettore del pannello sceglie **Radiosi** o
  **Necrotici**, e la seconda casella ne prende il nome. Colpo infuocato agli slot alti
  dice sotto le caselle quanti d6 aggiungere, al fuoco o ai radiosi, dove vuoi tu.
- Il conto resta a te, e il danno va scritto già ridotto, quando il plugin non conosce
  il tipo: Guardiani spirituali (radiosi o necrotici), il Soffio di Drago illusorio
  (scelto al lancio), Evoca raffica ed Evoca pioggia di armi (quello dell'arma). Qui non
  compare nessun chip.
- Protezione dai veleni al lancio toglie anche **Avvelenato**: una sola volta se
  la creatura ne ha più d'uno, perché neutralizza un veleno solo, e il plugin
  sceglie il primo in elenco. Nulla se «Applica condizioni dell'incantesimo» è
  spenta. Un annullamento riporta tutto com'era.
- Cura ferite, Parola guaritrice, Preghiera di guarigione e Parola
  guaritrice di massa si risolvono nel pannello come Cura ferite di massa: si
  scelgono le creature (una, o fino a sei), si scrive la cura e i PF salgono,
  mai oltre il massimo, annullabile dalla cronologia. Catapulta, Intimorire infernale, Sussurri
  dissonanti e Inaridire chiedono l'esito del TS e il danno, con i dadi dello
  slot.
- Sonno, Sonnellino e Trama ipnotica finiscono quando la creatura subisce danno: l'etichetta
  sparisce da sola solo su quella creatura. Per svegliarla senza danno si
  rimuove l'etichetta a mano.
- Sonno e Spruzzo colorato non hanno TS: tra i bersagli una riga dice la riserva
  di PF da tirare, con i dadi dello slot. Si parte da chi ha meno PF attuali, e chi
  resta fuori si toglie dalla lista.
- Risata incontenibile: quando finisce il bersaglio resta **Prono** finché non si
  rialza; l'etichetta si toglie a mano.
- Cerchio magico, Santificare, Proibizione e Pirotecnica chiedono la variante
  nel pannello prima di piazzare la zona. Con il Fumo di Pirotecnica non c'è
  TS e il pannello non lo chiede. Bagliore solare e Drago illusorio
  propongono a inizio turno la nuova linea o il soffio, come Invocare il
  fulmine.
- Santificare: dopo la sagoma sono spuntate tutte le creature nell'area, tranne
  il caster, che resta in lista senza spunta: spuntalo se l'effetto vale anche
  per lui. Togli la spunta a chi non deve subirlo: resta fuori dalla zona finché
  dura, senza etichetta né promemoria, anche se esce e rientra. Chi arriva dopo
  ne fa parte. Il TS Carisma è un promemoria: chi lo supera ignora l'effetto al
  tavolo, ma l'etichetta resta, perché la zona la rimette.
- Trabocchetto: chi entra nel cerchio o lo attraversa fa il TS Destrezza; chi
  fallisce resta Trattenuto e ritenta a fine turno. Quando la trappola è
  scattata e nessuno resta trattenuto, l'incantesimo si termina a mano.
- Percezione delle Bestie: al lancio il caster non è accecato né assordato. Le
  condizioni si aggiungono a mano mentre usa i sensi della bestia.
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
  creatura muore. Parola del potere stordire sopra i 150 PF e Parola del Potere
  Dolore sopra i 100 PF non hanno effetto: lo slot è speso e il pannello lo dice.
  Parola divina, al TS Carisma fallito, assorda, acceca o
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
  Rimuovi maledizione termina Scagliare maledizione, Sortilegio e Costrizione sulla
  creatura che tocca, con la concentrazione di chi li ha lanciati; gli oggetti
  maledetti e i ricordi di Modificare memoria restano al tavolo.
- Dardo incantato si lancia dal pannello con tutti i suoi dardi (3 al 1°
  livello, uno in più per slot sopra il 1°): scegli le creature e sotto
  **Dardi** ognuna ha la sua colonna, con una casella per dardo. I dardi
  partono divisi in parti uguali; **−** e **+** li spostano da una creatura
  all'altra. Scrivi il tiro (1d4+1) di ogni dardo e passa al successivo con
  Tab: la colonna mostra il totale e i PF che restano, l'intestazione quanti
  dardi mancano da assegnare o da tirare. Ogni dardo è un danno a
  sé: la resistenza alla forza dimezza ogni dardo, Scudo li blocca tutti, chi
  è in concentrazione fa un TS per dardo e un PG a 0 PF segna un fallimento
  per dardo. In alternativa la console attacchi registra
  un dardo alla volta.
- Animare oggetti: nella sezione **Oggetti animati** aggiungi gli oggetti per
  taglia con **−** e **+**; ogni scheda mostra PF, CA e Schianto della taglia,
  l'intestazione gli oggetti e il peso usato su 10, più 2 per ogni slot oltre
  il 5°, e il **+** si spegne quando un altro oggetto lo supererebbe. Poi **Posiziona oggetti** li mette
  sulla mappa uno alla volta.
- Alcuni incantesimi hanno un contatore, che la loro pill mostra al posto dei
  round e che a zero termina l'incantesimo. Immagine speculare parte con 3
  duplicati: quando un attacco colpisce un duplicato premi **Duplicato
  colpito** (il dettaglio ricorda le soglie del d20: 6, 8 o 11). Bacche
  benefiche resta 24 ore sul caster con 10 bacche: **Mangia una bacca** cura
  1 PF alla creatura scelta, chiunque sia. Cordone di frecce (4 munizioni, +2
  per slot sopra il 2°) ne spende una per ogni creatura del trigger, anche se
  supera il TS; il Guardiano della fede scala dai suoi 60 danni quelli che
  infligge, e svanisce con la zona quando li ha finiti.
- Il danno dei lanci nel pannello incantesimi (Palla di fuoco, Dardo
  incantato…) mostra l'avviso di concentrazione sui bersagli che si
  concentrano, come la Console effetti ad area, e il TS di chi ne fa uno
  quando subisce danni (Dominare, Risata incontenibile). Lo stesso vale per il
  danno di un promemoria di zona.

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
non premi **Salva**. Lo stesso pannello legge lo statblock di un mostro
(`"kind": "monster"`): azioni, multiattacco e punti ferita. Formato e prompt
sono in [Importare una scheda](IMPORT_SCHEDA.md).

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

Il GM modifica i PF con un clic sul valore, nella card estesa come in quella compatta: si aprono due campi, PF attuali e massimi, dove puoi scrivere il nuovo valore, un delta (`-7`, `+5`) o un piccolo calcolo. **Invio** conferma, **Esc** annulla, **Tab** passa al massimo e poi alla card successiva. Nella card compatta il testo resta al suo posto: diventa tutto bianco e i numeri modificabili sono sottolineati. Ogni modifica è una voce annullabile della Cronologia.

L'icona blu della scheda (accanto ai PF nella card estesa, sotto l'iniziativa in quella compatta) apre in un clic la scheda personaggio di PG e alleati, anche per i giocatori. Il GM la apre anche per nemici e neutrali, per importarne lo statblock (vedi [Console attacchi per i mostri](#console-attacchi-per-i-mostri)). Il pulsante **±** della card estesa ricalibra insieme PF attuali e massimi.

Allo stesso modo un clic sul badge dell'iniziativa lo rende modificabile (solo GM, in entrambe le viste); **Invio** salva, riordina le card e passa alla card successiva. Quando nuove creature entrano in iniziativa la compilazione parte da sola: apre in fila le creature ancora da compilare e le evidenzia con un bordo tratteggiato; **Invio** o **Tab** passa alla successiva, **Ctrl+Invio** o **Esc** chiude, e le card si riordinano alla fine.

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

#### Difese ai danni dalle capacità

Le capacità che danno resistenze, immunità o vulnerabilità le fanno contare da
sole: nella console attacchi, nella console Boss, nel pannello incantesimi e
nei promemoria compare il chip della difesa (`Res. taglienti: 12 → 6`), che un
clic ignora per quel colpo. La pill e la card non cambiano aspetto: niente
etichette in più.

- **Con la pill**: Ira, Spirito Totemico: Orso, Runa delle Colline invocata,
  Corpo Vuoto, Conquistatore Invincibile, Forma d'Ombra, Manto di Stelle e
  Tomba di Levistus difendono finché la pill è attiva, e smettono quando
  finisce. La Tomba di Levistus dà la vulnerabilità al fuoco: se il colpo che
  la fa scattare è da fuoco, ignora la vulnerabilità per quel colpo.
  Tempesta Protettrice dà alle creature scelte nell'aura la resistenza
  dell'ambiente.
- **Partenza insieme**: l'Ira avvia gli effetti dello Spirito Totemico (Orso,
  Aquila, Lupo) e di Sintonia Totemica (Aquila, Orso) abilitati sulla scheda;
  Forma Siderale avvia Manto di Stelle. Finiscono con lei; ognuno ha una sua
  voce nella Cronologia, quindi per annullare tutto serve un **Annulla** in più
  per ciascuno.
- **Passive**: Purezza del Corpo, Anima della Forgia, Cuore della Tempesta,
  Scudo del Pensiero e le altre valgono dal loro livello, se abilitate. Anima
  Tempestosa prende il tipo dall'ambiente scelto per l'Aura Tempestosa, Dono
  Elementale dal tipo di genio. Si vedono nel blocco **Difese ai danni** della
  card; in modifica si scrivono solo le difese in più.
- **Tipo a scelta**: Affinità Elementale (1 ora, 1 punto stregoneria),
  Resilienza Immonda e Pietra del Trasmutatore (sul portatore) chiedono il
  tipo all'attivazione e lo mostrano nella pill. Le armi magiche o d'argento
  superano Resilienza Immonda: per quel colpo ignora il chip.
- **Solo contro armi non magiche**: Avatar della Battaglia e Santo della Forgia
  e del Fuoco (in armatura pesante, data per indossata) resistono ai danni
  contundenti, perforanti e taglienti come le difese dei mostri: il chip dice
  `non magici`, gli incantesimi le superano e un'arma magica pure, con ✦ Magica
  nella console.
- **Contro gli incantesimi**: Resistenza agli Incantesimi dell'abiuratore e
  l'Aura di Interdizione dimezzano ogni danno di un incantesimo: pannello,
  aree, promemoria degli incantesimi, Dardo incantato e incantesimi della
  console attacchi. Le azioni dei mostri nella console Boss non sono
  incantesimi, anche quando ne portano il nome (Meteor Swarm di Auril): lì
  dimezza a mano.
- **Resistenza e vulnerabilità insieme**: se due fonti danno resistenza e
  vulnerabilità allo stesso tipo (un tiefling sotto la Tomba di Levistus),
  valgono tutte e due, come nel Manuale del Giocatore: prima metà, poi doppio.
  Il chip lo dice: `Res. e Vuln. fuoco: 11 → 10`. L'immunità vince sempre.
  Sulla scheda si scrive ancora una difesa per tipo.
- **Elusione**: il ladro e il monaco dal 7° livello, e il cacciatore che la
  sceglie come Difesa del Cacciatore Superiore, con un TS su Destrezza che
  dimezza non subiscono danni se lo superano e la metà se lo falliscono:
  nelle console, nel pannello incantesimi con le sue aree, nei promemoria
  delle zone e nelle azioni ⚡. Sulla riga del bersaglio compare «Elusione».
- **Avvelenato**: Purezza del Corpo e Interdizione della Natura rendono
  immuni alla condizione: il plugin non la applica mai a quei personaggi.

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

**Reset round** riporta il round a 1 senza cambiare ordine né turno attivo. Le durate in round seguono il contatore: ogni effetto conta dal round in cui è stato applicato. Tornando indietro (Reset round, o ◀ oltre l'inizio di un round) recupera solo i round che aveva già consumato, mai più della sua durata; andando avanti, o annullando il reset, li consuma di nuovo. Un effetto lanciato al round 4 per 10 round ne ha 9 al round 5, 10 dopo il reset e di nuovo 9 dopo l'Annulla. Un effetto già scaduto non ricompare tornando indietro: per quello c'è l'Annulla della Cronologia.

### Tasti per il turno

Quando il tracker ha il focus della tastiera (dopo un clic nel tracker, per esempio su una card), il GM può usare **Spazio** o **→** per il turno successivo e **←** per il precedente. Sono gli stessi comandi dei pulsanti. Non funzionano mentre scrivi in un campo, con un editor aperto o durante la compilazione delle iniziative. Owlbear Rodeo non offre scorciatoie globali alle estensioni: dopo un clic sulla mappa i tasti tornano a Owlbear.

### Focus token e tana

- **Focus token** centra o segue il token attivo, utile quando il DM controlla la regia da un altro schermo.
- **Tana** abilita la gestione delle azioni di tana nell'incontro.

### Reazione e azione preparata

Nella riga PF di ogni card c'è l'icona della reazione (una freccia curva):
verde quando la reazione è disponibile, rossa e spenta quando è stata usata. Il GM la segna o la
ripristina con un clic; lo schermo del tavolo la mostra sulle card dei PG e
degli alleati, mentre nel profilo Online i giocatori non la vedono. La reazione usata torna da sola all'inizio del turno successivo della
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

### Console attacchi fuori turno

Quando sulla mappa è selezionata un'altra creatura, sotto l'intestazione della console attacchi compare **⇄ Agisci con…**: la console passa a quella creatura per un'azione fuori turno (un attacco di opportunità, una reazione). L'intestazione dice **Fuori turno** e, sulla stessa riga di **⇄ Agisci con…**, **⇄ Torna a…** riporta alla creatura di turno; se la creatura selezionata è proprio quella, il pulsante è uno solo. Un nome troppo lungo si taglia sul pulsante, e il suggerimento lo scrive intero. Un attacco fuori turno propone la casella **Usa la reazione (attacco di opportunità)**, già spuntata: togli la spunta se l'attacco non usa la reazione; se la reazione è già usata nel round la console lo dice e l'attacco non la segna. Se la console era già sulla creatura durante il suo turno e il turno passa, la casella parte spenta. Gli esiti di un attacco ad area non ancora registrati vengono chiesti prima di cambiare creatura.

### Console attacchi per i mostri

La console attacchi (🗡️ sulla card) registra anche i turni dei mostri, senza
preparazione al tavolo: basta importarne lo statblock.

1. Il GM apre la scheda del mostro dall'icona blu della card (per nemici e
   neutrali solo il GM la vede), preme **Modifica** e poi **Importa**.
2. Incolla il JSON dello statblock (si prepara con il prompt di
   [Importare una scheda](IMPORT_SCHEDA.md)), oppure carica un file di
   [5eTools](IMPORT_SCHEDA.md#da-5etools) o cerca il mostro nei libri
   dell'**Archivio online**; preme **Leggi**, sceglie le sezioni e
   **Applica al modulo**. Lo statblock di un mostro **sostituisce** quello di
   prima, incantesimi compresi. I mostri delle regole 2024 (Monster Manual
   2025) si importano solo con **Importa anche i mostri delle regole 2024**
   acceso in **Opzioni → Console attacchi**, e si giocano con le regole 2014
   del plugin (vedi [Statblock 2024](IMPORT_SCHEDA.md#statblock-2024-opzionali)).
3. Le righe automatiche, ricordate in questo browser:
   - **Punti ferita**: la media dello statblock, modificabile; sostituisce i
     PF del token tranne se è ferito, e con **Anche agli altri token** va
     sugli omonimi non feriti. I PF dei personaggi e quelli condivisi non si
     toccano mai da qui;
   - **Rinomina il token** con il nome del mostro (solo il token aperto);
   - **Dimensione del token**: la taglia dello statblock, sul token e sugli
     omonimi, mai sui PG: Minuscola, Piccola e Media 1 casella, Grande 2×2,
     Enorme 3×3, Mastodontica 4×4. La riga compare solo se un token
     cambierebbe. Un token di misura pari va su un angolo della griglia, e lo
     spostamento non consuma movimento. Come nome e ritratto, non entra nella
     Cronologia;
   - **Leggendario** per un mostro con azioni leggendarie: accende la modalità
     del tracker, con i numeri dello statblock, sul token e sugli omonimi che
     non hanno già una modalità boss;
   - **Usa il ritratto di 5eTools** (spenta; serve l'indirizzo delle immagini
     nelle Opzioni).
4. **Salva**: la scheda, poi nome, ritratto, dimensione, PF e Leggendario. I token con lo
   stesso nome ricevono lo stesso statblock; i loro PF, condizioni e usi
   restano i loro.

Dello statblock la scheda tiene anche gli **incantesimi** (classe e livello
per gli slot, con le capacità di classe spente; il libro; gli innati come
azioni rapide ⚡) e, nel browser del GM, il **testo originale**: in fondo alla
tab Statistiche (riquadro **Statblock originale**) e, per tratti, reazioni e
azioni leggendarie, nella tab **Capacità** della scheda e della console.

Al turno del mostro la console mostra:

- gli **attacchi**: `Mischia` o `Distanza` sul selettore e, sopra il danno,
  bonus al tiro, portata o gittata in metri («+14 al tiro · portata 3 m»): si tirano i
  dadi al tavolo, si sceglie Colpito, Critico o Mancato e si inseriscono i
  danni, come per un PG;
- gli **incantesimi**: i trucchetti e gli incantesimi d'attacco del libro (Dardo di
  fuoco, Dardo incantato, Dardo tracciante…) si risolvono in console, con i dadi del
  livello, lo slot e, sopra il danno, il bonus della scheda («+6 al tiro») o la CD.
  Gli altri si lanciano con **Lancia** nel pannello incantesimi, che dice la CD accanto al
  TS. Senza una classe gli slot restano al tavolo: la console non ne scala e non avvisa.
  Un incantesimo d'attacco innato («3/giorno») sta sul ⚡, che spende l'uso: il danno, se
  il pannello non lo chiede, si scrive a mano;
- le **azioni a tiro salvezza** (soffi, sguardi, Presenza terrificante): la
  riga sopra il danno dice area, TS, CD e cosa succede a chi fallisce e a
  chi supera; il danno viene prima dell'elenco delle creature.
  **Disegna** mette l'area sulla mappa alla misura dello statblock (dal token
  del mostro, o su un punto) e spunta le creature dentro; un'area attorno al
  mostro propone le creature da sola. Su ogni riga i PF, il bonus al TS (`+4`),
  l'esito e il danno che subisce; il nome si accorcia, il suggerimento lo scrive
  intero. Sotto la riga, solo se serve, «Elusione» e le sue immunità. Gli esiti
  sono **Fallito**, **Superato** e **Immune** (chi è immune parte già lì). Chi supera subisce
  metà danni solo se lo statblock lo prevede; le condizioni durano quanto
  dice lo statblock e, con il tiro ripetuto, portano il promemoria del TS a
  fine turno della creatura, che superato le toglie; un'azione come la
  Presenza terrificante rende immune per 24 ore chi la supera;
- gli **effetti al colpo** (il veleno del ragno gigante, la paralisi del
  ghoul, la presa del coccodrillo): su Colpito o Critico, la sezione **Effetto
  del colpo** chiede l'esito del TS del bersaglio e il suo danno, applica le
  condizioni, «Afferrato» con la CD di fuga e Prono; la spinta si fa a mano;
- **Ricarica 5–6**: dopo l'uso la riga sopra il danno scrive «usata»; non blocca mai,
  se al tavolo la ricarica esce, si usa di nuovo;
- **usi al giorno** («2/3 al giorno»): finiti gli usi l'azione è bloccata;
  tornano con il riposo lungo;
- il **multiattacco** sopra gli attacchi e, sotto i danni, «Da risolvere al
  tavolo» con la parte dell'azione che il plugin non automatizza (per esempio
  una malattia o un trascinamento);
- nella scheda **Capacità**, tratti, reazioni e azioni leggendarie del mostro
  da leggere, con il costo delle leggendarie (i diamanti restano sul tracker).

Le **difese** dello statblock valgono quando il mostro è il bersaglio, nella
console attacchi e nella console boss: il danno di quel tipo si dimezza o si
azzera. L'anteprima dice cosa ha fatto ogni difesa al danno digitato: sul
pulsante della difesa, `Res. taglienti: 10 → 5`, sotto il
totale, accanto a **Registra** e sempre in vista; nelle aree il danno sta sulla
riga della creatura (`−30`) e la difesa sotto (`Res. fuoco: 60 → 30`). Anche le difese limitate alle armi
non magiche, come `Res. taglienti non magici: 10 → 5` nella console attacchi,
con il materiale nel suggerimento del pulsante, si applicano da sole, perché il
plugin non sa di che arma si tratta. Per un'arma magica accendi **✦ Magica**, dopo i
dadi della prima riga del danno: la scheda lo ricorda per gli attacchi seguenti, il
selettore mostra ✦ accanto al nome e la difesa resta in vista, barrata:
`Res. taglienti non magici · superata (arma magica)`. Un clic la riapplica a quel
colpo. Spento, l'interruttore ricorda la capacità che può rendere magico l'attacco:
Colpi Ki Potenziati per i colpi senz'armi, Freccia Magica per gli attacchi a
distanza, Anima Bestiale per le armi naturali, e Colpo Primordiale, Patto della
Lama e Tutt'Uno con la Lama su tutti; quale arma sia quella del patto lo sa il
tavolo. Per un'arma del materiale giusto (d'argento, di adamantio), un clic sul
pulsante con la **✕** ignora la difesa in quell'attacco; all'attacco dopo vale di
nuovo. Un trucchetto o un incantesimo della console è magico, e queste difese non
lo toccano: Frusta di Spine fa il danno pieno. Le aree della console non hanno il
pulsante: la difesa vale, salvo per un'arma con ✦ Magica (la Freccia perforante da
un arco magico), e la riga della creatura dice perché non ha contato. Un mostro
importato da 5eTools con «weapon attacks are magical» ha già ✦ Magica sui suoi
attacchi con arma; un attacco con incantesimo è sempre magico. Gli incantesimi fanno il loro conto nel pannello,
con un chip accanto al bersaglio; contro di loro non contano le difese limitate alle
armi non magiche. Un mostro importato prima di questa versione riceve queste
difese reimportandolo.

Nel menu **⋯** dell'intestazione della console, **Apri da sola a ogni turno**
(solo questo browser) ha due caselle: **Personaggi e alleati** apre la console
al turno di un personaggio o alleato, **Mostri** a quello di un mostro; ai boss
si apre la console Boss. Finché non tocchi **Mostri**, vale come **Personaggi e
alleati**. Le stesse caselle sono nel pannello Opzioni, sezione **Console
attacchi**.

La scheda di un mostro resta sul token e nella memoria di questo browser, che
la ritrova per nome su un nuovo token; non occupa la memoria condivisa della
room, riservata alle schede dei personaggi.

## 5. PF e modifiche rapide

I PF canonici sono quelli della card/token. Le barre sulla mappa sono una rappresentazione derivata e si aggiornano insieme al tracker.

Puoi modificare un singolo attore dalla sua card (clic sui PF) oppure usare la **Console effetti manuali** per un'operazione su più bersagli.

### Console effetti manuali

1. Apri **Effetti** dalla toolbar del tracker: la console parte dalla scheda **Effetti** (tiri salvezza e condizioni). Dal menu di un modello d'area, **Seleziona e apri Console effetti ad area** la apre già su **Danno**.
2. Scegli **Danno**, **Cura** o **PF temp.**.
3. Inserisci il valore nel campo accanto al pulsante di applicazione.
4. Filtra i bersagli per nome e/o fazione.
5. Seleziona i bersagli dalla lista o direttamente sulla mappa.
6. Per ogni bersaglio scegli `×2`, `1`, `½` o `¼`.
7. Controlla l'anteprima e applica.

I bersagli selezionati salgono in cima alla lista. L'applicazione è atomica: un solo comando aggiorna tutti i token e crea un'unica voce annullabile. Se il danno colpisce creature in concentrazione, viene mostrato l'avviso relativo. Il comando raggiunge solo i bersagli selezionati che i filtri mostrano: quelli nascosti da un filtro sono indicati come esclusi. Il messaggio finale conta i bersagli cambiati e dice a parte quelli rimasti invariati (una cura a chi ha già i PF pieni).

Se il GM ha i pulsanti **Superato** / **Fallito** sull'avviso di concentrazione, la × in alto lo chiude senza registrare il tiro: la concentrazione resta com'è.

### PF temporanei

I PF temporanei stanno accanto ai PF: si vedono come **+N** azzurro su card, console e numero sotto il token, e come un tratto azzurro dentro le barre, proporzionale al totale. Una creatura ferita che li riceve non viene curata.

- **Non si sommano**: se ne riceve altri resta il valore più alto.
- **Il danno li consuma per primi**; quello che avanza arriva ai PF. Le cure non li toccano.
- **Il riposo lungo li toglie.** Con **Riposo del gruppo** il riepilogo lo dice.
- **I giocatori** li vedono solo sulle creature di cui vedono i PF esatti.
- **Il registro di combattimento** dice cosa è successo: aggiunti, alzati, assorbiti dal danno, tolti o scaduti.

Per darli a mano ci sono due strade:

- **Sulla card**: clic sui PF, poi tasto **T** o clic sul campo dei temporanei. `8` li imposta, `+3` ne aggiunge, `-3` ne toglie, `0` li toglie tutti. Il campo è fuori dal giro del Tab, che continua a passare da una creatura all'altra. Un `-5` scritto nel campo dei PF consuma prima i temporanei, come un danno.
- **Nella Console effetti manuali**: scheda **PF temp.**, per più bersagli insieme.

Alcuni li danno da soli:

- **Vita falsata**: il pannello chiede l'1d4 tirato e aggiunge il resto. I temporanei rimasti spariscono quando finisce l'incantesimo.
- **Caratteristica potenziata, Resistenza dell'orso**: il pannello chiede i 2d6 tirati. Con più bersagli lo stesso tiro vale per tutti. I temporanei rimasti spariscono quando finisce l'incantesimo.
- **Armatura di Agathys**: 5 per livello di slot. Finché restano, le console attacchi e Boss propongono **Applica N** dopo un colpo in mischia, per i danni da freddo all'attaccante: applicali prima di confermare il colpo. Quando i temporanei finiscono, l'etichetta sparisce.
- **Trasformazione di Tenser**: 50, e quelli rimasti si perdono quando finisce l'incantesimo.
- **Guardiano della Natura, Grande Albero**: 10, che spariscono quando finisce l'incantesimo.
- **Eroismo**: immunità a Spaventato e, a inizio di ogni turno del bersaglio, un promemoria con il modificatore da incantatore già inserito (si ricava da CD e livello della scheda di chi lancia; se mancano, lo scrivi tu). Premi **Applica PF temporanei** o **Ignora**. Quelli rimasti spariscono alla fine della concentrazione. Uno Spaventato già presente al lancio lo togli a mano.
- **Flusso di Energia Negativa**: per un non morto premi **Non morto** al posto dell'esito del TS, e inserisci il tiro di 5d12: riceve metà del tiro come temporanei, senza danni. Il tipo di creatura lo indichi sempre tu. Chi viene ucciso riceve l'etichetta **Si rianima come zombi**, con il promemoria al prossimo turno di chi ha lanciato; il token dello zombi lo aggiungi tu.
- **Capacità di classe**: Entità Simbiotica, Tomba di Levistus, Chiamata alla caccia e Totem spirituale (Orso) li danno all'attivazione. Entrando in Ira li danno anche Aura tempestosa (Tundra: alle creature selezionate sulla mappa entro 3 m, o al solo barbaro se non ne selezioni nessuna; nei turni dopo dalla Console effetti manuali) e Impeto selvaggio (Viti Oscure: a ogni Ira chiede il tiro di 1d12). Santuario del crepuscolo offre **Applica PF temporanei** nel promemoria di fine turno. Questi temporanei non scadono da soli con la capacità: se serve, togli i rimasti dalla card.

### TS contro la morte

Un PG a 0 PF, né stabile né morto, riceve a inizio turno il promemoria **TS contro la morte**, con i successi e i fallimenti accumulati (●●○ / ✕○○). Il popup compare anche sullo schermo del tavolo, ma i pulsanti li ha solo il GM: dopo il tiro del d20 segna **Successo**, **Fallimento**, **1 naturale** (due fallimenti) o **20 naturale** (torna a 1 PF). Ogni tiro è una voce annullabile della Cronologia. Se il GM chiude la sua carta con la × senza registrare, si chiude anche quella sullo schermo del tavolo.

- Tre successi: l'etichetta **Stabile**; i tiri si fermano e il conteggio si azzera.
- Tre fallimenti: l'etichetta **Morto** prende il posto di Privo di sensi. La toglie il GM, o un incantesimo che riporta in vita.
- Una cura sopra 0 PF azzera il conteggio e toglie Stabile.
- Un danno che porta a 0 PF e avanza almeno quanto i PF massimi è morte istantanea.
- Un danno subito mentre il PG è già a 0 PF conta un fallimento, due se critico; un danno pari ai PF massimi lo uccide; un PG stabile torna a tirare. Vale per la Console effetti manuali, la console attacchi (l'esito **Critico** conta due fallimenti), le azioni boss e le console degli incantesimi. Nella Console effetti manuali, sulla riga di un PG a 0 PF, il pulsante **Crit** segna il colpo critico; l'anteprima mostra «TS morte +1 fallimento».

### Stabilizzare e riportare in vita

Dal pannello incantesimi basta scegliere il bersaglio: nessun TS, nessun valore da inserire. Un Annulla riporta tutto indietro. Per il plugin è morta una creatura con l'etichetta **Morto**, o una creatura che non è un PG a 0 PF.

| Incantesimo | Effetto | Oltre a togliere Morto |
| --- | --- | --- |
| **Salvare i morenti** | Un PG a 0 PF diventa **Stabile** e il conteggio dei TS si azzera | Non si usa su un morto |
| **Rinascita** | Torna a 1 PF | — |
| **Rianimare morti** | Torna a 1 PF, con **Ritorno dalla morte −4** | Toglie il veleno |
| **Reincarnazione** | Torna a 1 PF: il testo non indica i PF, regolali tu; il d100 e la nuova razza sulla scheda sono del GM | — |
| **Resurrezione** | Tutti i PF, con **Ritorno dalla morte −4** | Toglie il veleno |
| **Resurrezione pura** | Tutti i PF, anche da disintegrato | Toglie veleni, malattie e maledizioni |

Se il bersaglio non è valido (Rinascita su un vivo, Salvare i morenti su un morto, un disintegrato) il pannello dice perché e non applica nulla: lo slot non si spende. Chi torna in vita perde anche **Si rianima come zombi**.

**Ritorno dalla morte** ricorda il −N a tiri per colpire, TS e prove: i dadi si tirano al tavolo, quindi il plugin non lo somma. Ogni riposo lungo di **Riposo del gruppo** lo abbassa di 1, e a 0 l'etichetta sparisce; il riepilogo lo dice. Chi è a 0 PF non ne beneficia. Un mostro non riposa: togli l'etichetta a mano con la ×.

Restano al tavolo i limiti di tempo, il costo dei componenti e l'anima consenziente. Resurrezione pura termina Scagliare maledizione e Sortilegio sul bersaglio; una maledizione scritta come etichetta personalizzata la togli a mano.

## 6. Condizioni

Apri **Condizioni** dalla toolbar. La finestra permette di:

- cercare bersagli per nome;
- combinare liberamente i filtri PG, Alleati, Neutrali e Nemici;
- selezionare token dalla lista o dalla mappa;
- applicare condizioni predefinite;
- creare una condizione personalizzata con durata;
- rimuovere o aggiornare istanze già attive.

Le condizioni supportano scadenza manuale, dopo un numero di round, all'inizio del turno, alla fine del turno o insieme alla concentrazione. Sono consentite fino a tre condizioni personalizzate per token.

**Rimuovi Tutto** toglie gli effetti di tutti i token della lista, non solo dei bersagli selezionati: il primo clic mostra quanti token raggiunge, un secondo clic entro qualche secondo conferma.

Nella card estesa compaiono le prime etichette e il pulsante `…` mostra le altre (resta aperto finché non lo chiudi, anche quando la card si aggiorna); nella card compatta compare la prima, e le altre si aprono nel cassetto laterale (vedi [La barra compatta](#la-barra-compatta)). Sulla mappa le condizioni compaiono come etichette bloccate e ancorate al token: restano dritte e della stessa misura anche quando il token viene ruotato o ingrandito. La barra dei PF segue la scala del token, mai la rotazione.

### Condizioni rapide

Le condizioni più usate al tavolo si applicano senza aprire la finestra: tutte quelle predefinite tranne Pietrificato (Accecato, Affascinato, Afferrato, Assordato, Avvelenato, Incapacitato, Invisibile, Paralizzato, Privo di sensi, Prono, Spaventato, Stordito, Trattenuto). Solo per il GM.

- **Dalla card**: clic destro sulla card → **Condizioni** › e scegli la condizione. Un clic la applica o la toglie e chiude il menu. In fondo, **Tutte le condizioni…** apre la finestra completa.
- **Dalla mappa**: clic destro sui token → **Condizioni…**. Il sottomenu resta aperto dopo ogni clic, così puoi mettere più condizioni di fila; anche qui **Tutte le condizioni…** apre la finestra.

Ogni pulsante mostra lo stato della condizione: evidenziato se ce l'hanno tutte le creature scelte, con un bordo leggero se ce l'hanno solo alcune. In quel caso un clic la aggiunge a chi non ce l'ha; se ce l'hanno tutte, la toglie a tutte. Ogni clic è una voce della Cronologia. La rimozione toglie la condizione intera, anche quella messa da un incantesimo con una durata: per durate e fonti usa la finestra completa.

**Ira** non è una condizione ma la capacità del Barbaro: si attiva dalle capacità di classe e non compare più tra le condizioni da applicare. Finché è attiva, il barbaro resiste ai danni contundenti, perforanti e taglienti (vedi [Difese ai danni dalle capacità](#difese-ai-danni-dalle-capacità)).

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

Tra i bersagli il pannello dice quale tiro salvezza chiede il lancio («Tiro
salvezza: Destrezza»). L'etichetta del campo danni propone i dadi, già cresciuti
con lo slot scelto («Danno · 10d6»). Se gli esiti tirano dadi diversi, sotto il
campo trovi quelli di ciascun esito. Per un trucchetto trovi come crescono i dadi
col livello del personaggio, che il pannello non conosce.

**La gittata.** Il pannello dice anche quanto possono essere lontani i bersagli
(«Bersagli entro 18 m»). Si misura in linea d'aria dal bordo dei token, senza contare
la quota. Un bersaglio più lontano esce dai bersagli e il pannello dice chi è. Il
contatto arriva alle caselle vicine, anche in diagonale. Vale anche per il lancio
rapido, che in quel caso apre il pannello.

Se la mappa non sa tutto (Incantesimo distante, Tiratore di incantesimi), **ripeti il
gesto**: spunta di nuovo il bersaglio rifiutato e la gittata è ignorata per quel
lancio, come ricorda la riga dei bersagli. Per un'area o un teletrasporto riprova
sullo stesso punto della mappa: un doppio clic non basta.

Se l'incantesimo richiede un tiro per colpire, l'esito è **Colpito** o **Mancato**.
Un colpo mancato spende lo slot e non lascia effetti, e il danno non viene chiesto.

Coltello di Ghiaccio chiede tutte e due le cose. Sopra l'elenco c'è l'**Esito
dell'attacco** del bersaglio primario (**Colpito**, **Critico** o **Mancato**), e
ogni creatura dell'esplosione, lui compreso, ha il suo TS su Destrezza. Se colpisce
compare il campo **Colpo · 1d10 perforanti** (con un critico `critico 2d10`: scrivi i
dadi raddoppiati), e la difesa del bersaglio la conta il chip sulla sua riga. Se
manca, nessun danno dal coltello: l'esplosione c'è comunque. Colpo ed esplosione si
scrivono insieme, con un solo Annulla.

**Lancio rapido o pannello.** Dalla console 🗡️, dal menu ⚡ e dal libro nella
scheda il lancio è rapido: con il bersaglio selezionato sulla mappa, il tiro
salvezza si considera fallito. Se non serve altro, l'incantesimo si applica subito
(Blocca persone, Charme su persone, Suggestione…). Se serve un'area, un danno o una
variante, si apre il pannello con ogni bersaglio già su **Fallito**: inserisci ciò
che manca e segna solo chi lo supera.

Il pannello aperto da **Incantesimi** o dal ⚙ del libro chiede invece l'esito di ogni
bersaglio. Con un TS superato spende lo slot e non lascia effetti. Chi tira solo se
non è consenziente, come con Levitazione o Metamorfosi, non ha esito: lo dice la riga
del tiro salvezza.

Un effetto che resta su una creatura senza la pill del suo incantesimo ha sulla
card una pill sua, rossa se la penalizza e verde se la aiuta: Regressione mentale,
«Niente recupero PF» di Tocco gelido, «Velocità dimezzata» di una zona. Il terreno
difficile si vede sempre, finché il token resta nell'area. Un effetto legato a una
zona o a un incantesimo non ha la ×: finisce uscendo dall'area o terminando
l'incantesimo.

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

Le punizioni da incantesimo e Colpo Intrappolante si risolvono nel popup accanto al
token, che compare al turno del caster: si seleziona il bersaglio sulla mappa, si
scrive il danno e si preme **Risolvi**. Il danno è solo quello della punizione, con i
suoi dadi: l'arma si registra a parte nella console attacchi. Se il bersaglio ha una
difesa contro quel tipo, il chip accanto a **Risolvi** lo dice e il conto la applica;
un clic la ignora. Chiuso con la ×, o passato il turno, il popup
torna al turno dopo del caster. Per un colpo fuori turno, come un attacco di
opportunità, o fuori combattimento, si passa dal pannello incantesimi: fra gli
**Incantesimi attivi sul campo** si preme **Risolvi**, si seleziona il bersaglio sulla
mappa e **Apri risoluzione** apre lo stesso popup.

Freccia Folgorante si risolve nello stesso popup, al turno del caster: si seleziona
sulla mappa la creatura colpita dalla freccia. Prima il colpo: **Colpito**,
**Critico** o **Mancato**, poi il tiro dei 4d8 (con un critico i dadi raddoppiati,
`critico 8d8`). Se la freccia manca, il popup dimezza il tiro; la difesa del
bersaglio la conta il chip, come per le punizioni. Sotto, l'esplosione: le creature
entro 3 metri dal bersaglio, il loro TS su Destrezza e i 2d8. **Risolvi freccia**
scrive tutto insieme, e un solo Annulla toglie tutto. Il danno dell'arma non si
registra nella console attacchi: la freccia lo sostituisce.

Minuscole meteore di Melf tiene le sue meteore sulla pill del caster: sei, più due per
ogni slot sopra il 3°. La prima la risolve il pannello al lancio, quindi la pill parte
da 5 al 3° livello. Ogni meteora successiva si lancia con il ⚡ **Lancia meteora**
(azione bonus), nel popup come il fulmine di Invocare il fulmine: **Posiziona la
meteora**, i TS su Destrezza di chi sta entro 1,5 metri dal punto, i 2d6 di fuoco.
Per la seconda meteora dello stesso turno lo ripeti: due meteore sono due esplosioni,
e chi sta in tutte e due fa due tiri salvezza e prende due danni. Anche una meteora
lanciata dove non c'è nessuno si spende. Il popup si apre da solo all'inizio dei
turni del caster dopo il lancio; quando finiscono le meteore, finiscono anche
l'incantesimo e la concentrazione. Annulla rimette PF e meteora.

I teletrasporti spostano il token da soli: sparisce nella nebbia e ricompare sulla
casella scelta, Annulla lo rimette dov'era, e il controllo della velocità non conta lo
spostamento come movimento. Lo spazio libero e visibile lo valuta sempre il GM.

- **Passo remoto**: al lancio scegli la casella d'arrivo entro 18 metri, come per Passo
  velato; la pill resta sul caster con la concentrazione. Dal turno dopo, all'inizio dei
  turni del caster, il popup propone **Teletrasportati** (azione bonus): **Scegli
  destinazione**, un clic sulla casella, e il caster si sposta.
- **Passo del tuono**: prima l'area del tuono attorno al caster, come sempre. Poi il blocco
  **Teletrasporto** del pannello: scegli l'eventuale passeggero, una creatura adiacente
  che non subisce il tuono e arriva accanto al caster, e premi **Scegli destinazione** per
  la casella entro 27 metri. Danno e teletrasporto stanno nella stessa voce della
  Cronologia: un Annulla rimette PF e posizioni.
- **Colpo del Vento d'Acciaio**, nella console attacchi: fino a cinque attacchi, uno per
  creatura (la console rifiuta la seconda registrazione sulla stessa). Dopo il primo
  attacco compare **Teletrasportati**: un clic sulla casella, e se non è entro 1,5 metri da
  una creatura attaccata la console lo dice, senza bloccare.
- **Portale arcano**: al lancio disegni il primo portale entro 3 metri; il ⚡ **Secondo
  portale** della pill apre l'altro entro 150 metri, subito. Quando una creatura entra dal
  lato attivo, selezionala sulla mappa e premi il ⚡ **Attraversa**: **Scegli
  destinazione**, un clic sull'uscita accanto all'altro portale. Il lato attivo e la
  rotazione restano al tavolo.

Muri e colonne sono fatti di pezzi, ognuno con i suoi PF. I PF stanno sulla pill
dell'incantesimo («9/10 pannelli»), non sui token, e il GM li scala con un ⚡: **Scegli
sulla mappa**, un clic sul pezzo, poi il danno e il suo tipo. Il popup applica da solo le
difese degli oggetti: immuni a veleno e psichici, il ghiaccio vulnerabile al fuoco. La CA si
legge nel popup, il tiro per colpire si fa al tavolo. Un pezzo a 0 PF sparisce dalla mappa;
Annulla lo rimette. Sotto ogni pezzo c'è una barra, larga una casella come quella dei token,
che tutti vedono: verde, poi ambra sotto i due terzi dei PF, rossa sotto un terzo; senza numeri,
che restano nel popup.

I muri sono sottili, come il Muro di fuoco: partono da un angolo della griglia, corrono sulle
sue linee e sulla mappa sono una lastra. Le caselle di un muro sono quelle sul suo lato, dalla
parte verso cui lo tiri: chi sta lì è tagliato dal muro quando compare. Ogni muro si posa in due
modi, scelti nel pannello:

- **in fila**: un trascinamento, la linea intera di dieci pannelli;
- **uno per uno**: un trascinamento per pannello, ognuno attaccato a un altro (a L, a scatola,
  attorno a qualcuno). Fino a dieci; la conferma è rifiutata se un pannello non ne tocca un altro.

Gli incantesimi, uno per uno:

- **Muro di pietra**: spesso 15 cm, dieci pannelli da 3 metri con 180 PF, oppure spesso 7,5 cm con
  pannelli da 6 metri e 90 PF. CA 15, concentrazione, nessun tiro salvezza al lancio: chi resta
  rinchiuso lo gestisci al tavolo. ⚡ **Danneggia** per i colpi; ⚡ **Fai crollare** quando decidi
  che un pannello senza appoggi cade.
- **Muro di ghiaccio**: spesso 30 cm, dieci pannelli da 3 metri con 30 PF e CA 12. Chi è tagliato
  dal muro fa il TS su Destrezza al lancio; da che parte viene spinto lo decidi tu. Un pannello
  distrutto lascia la **cortina gelida**, una lastra chiara al suo posto: chi la **attraversa** fa il
  TS su Costituzione, una volta per turno, e prende 5d6 freddo. Come per il Muro di fuoco, conta
  anche entrare nelle caselle sul lato del muro; camminare dall'altra parte no.
  Con **Cupola o sfera di 3 m** il muro è un anello attorno a chi racchiude: il TS lo fa chi sta sulle
  sue caselle, ma i PF delle sezioni della cupola li tieni tu.
- **Ossa della Terra**: disegni le colonne una casella alla volta, poi confermi: sei, due in
  più per ogni slot sopra il 6°. Chi sta sotto una colonna fa il TS su Destrezza; chi lo
  fallisce, o sceglie di fallirlo, prende **Sulla colonna**. Se un soffitto ferma la
  colonna, il ⚡ **Soffitto** dà 6d6 contundenti e Trattenuto a chi ci sta sopra, senza TS;
  si libera con un'azione e una prova di Forza o Destrezza. La pill non scade: le colonne
  restano finché non le distruggi o non premi Termina. Una colonna a 0 PF lascia le
  **macerie**, 3 metri attorno: sono disegnate sulla mappa, ma il costo del terreno
  difficile lo conti tu. Altezza delle colonne ed elevazione dei token restano al tavolo.

### Azioni dalla pill sulla card

Sulla card del tracker, la pill di un incantesimo con azioni (Immagine
speculare, Bacche benefiche, Marchio del cacciatore, Invocare il fulmine…)
mostra un **⚡**, solo per il GM. Il ⚡ apre accanto alla pill le sue azioni,
con il contatore quando c'è («2/3 duplicati»):

- un'azione che non chiede altro, come **Duplicato colpito**, si esegue con un
  clic; il menu resta aperto con il contatore aggiornato e **Annulla** per
  tornare indietro;
- un'azione con un tiro o una scelta, come **Mangia una bacca**, apre subito
  il suo popup;
- un attacco, come **Lancia una stella** o **Pugno serrato**, si risolve nel popup
  come nella console attacchi: prima l'esito (**Colpito**, **Critico** o **Mancato**),
  poi il danno, che serve solo se colpisce, poi il pulsante o Invio. Con un critico
  scrivi i dadi raddoppiati: l'etichetta li dice (`4d12 · critico 8d12`). Niente si
  registra prima;
- un'azione che chiede una creatura (Sposta il marchio) la prende dalla
  selezione sulla mappa: seleziona il token, poi premi;
- un'azione con una scelta o una zona da spostare (Cambia direzione) porta il
  segno **›** e apre il pannello incantesimi già sull'azione;
- **Apri nel pannello** porta al pannello incantesimi per tutto il resto.

Il clic sulla pill apre sempre la scheda nell'Enciclopedia DM, il clic destro
la durata, la × termina l'incantesimo.

Anche nel registro degli incantesimi attivi del pannello un'azione senza
niente da compilare parte al primo clic (con **Annulla** subito dopo), o apre
direttamente il suo popup; quelle che chiedono bersagli o una scelta si
selezionano e si confermano come prima.

Un'azione bonus (gli effetti di Mano arcana, Lancia una stella di Corona di
Stelle, il Soffio di Drago illusorio, Cambia direzione di Folata di Vento) si usa
già nel turno del lancio. Un'azione vera, come il Cono gelido o la Linea di fuoco
delle Investiture, si accende dal turno dopo: quella del turno è servita a
lanciare l'incantesimo.

- **Mano arcana**: il popup con i cinque effetti compare già appena la pedina è
  sulla mappa, perché la mano agisce quando l'incantesimo è lanciato. Se non serve,
  chiudilo con la ×.
- **Investitura del Ghiaccio**: il **Cono gelido** si piazza da una casella accanto
  al caster, poi chiede il TS Costituzione e il danno, 4d6 freddo, metà se superato.
  Chi fallisce ha anche la velocità dimezzata fino all'inizio del prossimo turno del
  caster.

Quando la console attacchi o la console Boss registra un attacco con tiro per
colpire contro una creatura con **Immagine speculare**, sotto il bersaglio
compare quanti duplicati restano, la soglia del d20 (6, 8 o 11) e la CA del
duplicato (10 + Destrezza del caster, dalla sua scheda). Se il tiro bersaglia
un duplicato e lo colpisce, premi **Duplicato colpito**: il duplicato è
distrutto e non registri l'attacco sul caster.

Nello stesso punto le console mostrano le difese e le reazioni del bersaglio.
Ogni riga dice solo il dato che serve accanto al suo pulsante
(`Immagine speculare · d20 ≥ 6`, `Reazione · +5 CA`), e il suggerimento la
regola per intero.

- **Difese ai danni**: il pulsante dice cosa ha fatto la difesa al danno digitato
  (`Res. taglienti: 10 → 5`, `Imm. fuoco: 7 → 0`), e un clic la ignora per
  quell'attacco. Nelle aree della console attacchi e nei gruppi della console
  boss, ogni creatura ha la sua riga con il danno e il conto.
- **Santuario**: chi attacca il protetto tira prima un TS Saggezza, con la CD
  del caster dalla sua scheda. Se il protetto attacca dalla console, il
  Santuario finisce.
- **Scudo di fuoco** (Ardente o Gelido, scelto al lancio) e **Ombra di Moil**:
  dopo un colpo (in mischia per lo Scudo, entro 3 m per l'Ombra) scrivi i 2d8
  tirati e premi **Applica**: l'attaccante subisce il danno, con le sue
  resistenze, in una voce sua della Cronologia.
- Le **reazioni** che il bersaglio può ancora lanciare (nel libro preparato,
  tra le azioni rapide o dai tratti di specie, con la Reazione libera):
  **Lancia Scudo** dopo un colpo lo lancia subito (slot e Reazione); se il
  tiro non arriva alla CA + 5 segna Mancato. **Assorbire elementi ›** su un
  danno da acido, freddo, fuoco, fulmine o tuono e **Intimorire infernale ›**
  dopo un danno aprono il pannello incantesimi già pronto.

Tre incantesimi dipendono dallo slot o proseguono dopo il lancio:

- **Scagliare maledizione**: lo slot decide durata e concentrazione. Al 3° e al 4°
  è concentrazione (1 minuto, 10 minuti); dal 5° non lo è più e dura 8 ore, 24 ore
  dal 7°. Al 9° la pill non ha scadenza: la togli tu quando viene dissolta.
- **Alterare sé stesso**: nel ⚡ della pill ci sono le tre forme. Un clic sostituisce
  quella attiva, con la stessa concentrazione. Il +1 delle armi naturali è da
  sommare al tavolo.
- **Rigenerazione**: il pannello chiede il totale di 4d8 + 15. A inizio di ogni turno
  del bersaglio un promemoria offre **Applica cura** con 1 già inserito; non compare
  su un morto né a PF pieni. Se a PF pieni subisce un danno durante il suo turno, il
  promemoria può comparire in ritardo: premi **Ignora**.

Quattro incantesimi cambiano il terreno. Le zone senza scadenza restano finché non
le togli tu con **Termina**:

- **Crescita vegetale**: la zona di 30 m di raggio costa ×4 il movimento e non ha
  scadenza. Per l'uso da 8 ore lancialo senza posizionare l'area: spendi lo slot e
  non compare nessuna zona. Le aree che il testo lascia escludere restano al tavolo:
  se una creatura ne è fuori, correggi a mano il suo movimento.
- **Muro d'Acqua**: nella Forma scegli **Muro lineare** o **Muro circolare**. Dentro
  il muro il terreno è difficile. Lo svantaggio agli attacchi a distanza e il fuoco dimezzato
  sono una nota da leggere; le sezioni congelate restano al tavolo.
- **Trasmutare Roccia**: la Modalità ha tre usi, ognuno con il suo TS scritto
  nell'etichetta. **Roccia in fango** lascia la zona: ×4, Trattenuto a chi fallisce e
  un promemoria quando si entra o si finisce il turno dentro. **Fango in roccia** dà
  Trattenuto; **Fango dal soffitto** chiede il danno di 4d8, metà se superato. Questi
  due non lasciano zona.
- **Simbolo**: va in due tempi.
  1. Il lancio traccia il glifo: scegli l'effetto e premi **Prepara incantesimo**.
     Spende lo slot; compare solo la pill sul caster, senza scadenza.
  2. Quando il glifo si innesca, premi **Attiva** nel ⚡ della pill o tra gli
     incantesimi attivi del pannello. Posiziona la sfera di 18 m dove si trova il
     glifo, anche lontano dal caster, e registra gli esiti: nessun altro slot. La
     sfera dura 10 minuti e chiede il TS a chi entra o finisce il turno dentro, se non
     ha già quell'effetto.

  Solo Morte chiede il danno, 10d10 con metà se superato. Il caster dentro la sfera
  non è tra i bersagli attivi. L'innesco e la prova per scorgere il glifo, i movimenti
  di Follia e l'obbligo di allontanarsi di Paura restano al tavolo. I giocatori vedono
  la pill «Simbolo» sulla card del caster, non quale effetto contiene.

Parlare con i vegetali resta pill e aura: rendere il terreno normale o difficile si
decide al tavolo. Boschetto Druidico si lancia e resta tracciato con la sua zona, ma
quadrati liberi e alberi sono da gestire a mano.

Tempesta di vendetta chiede il TS del primo round: chi lo supera non subisce nulla,
chi lo fallisce subisce 2d6 ed è assordato per 5 minuti, anche se la tempesta finisce
prima. Dal secondo round pioggia acida, fulmini, grandine e vento si risolvono al
tavolo: non rilanciarla, perché un secondo lancio sostituirebbe la tempesta.

Le resistenze di Scudo di fuoco, Ombra di Moil, Interdizione primordiale,
Vincolo di interdizione e Assorbire elementi valgono davvero nelle console.
Interdizione primordiale ha nel ⚡ le cinque **Immunità: tipo**: la reazione
toglie le resistenze e dà l'immunità al tipo scelto fino alla fine del
prossimo turno del caster, poi l'incantesimo termina.

Due incantesimi cambiano i PF da soli, nello stesso comando del danno (console
attacchi e Boss, PF rapidi, console ad area, promemoria):

- **Interdizione alla morte**: il primo danno che porterebbe la creatura a
  0 PF la lascia a 1 PF, e l'etichetta sparisce. Parola del potere uccidere e
  Parola divina non la uccidono; Disintegrazione e Dito della morte la lasciano
  a 1 PF.
- **Vincolo di interdizione**: ogni danno al protetto lo subisce anche il
  caster, con i suoi TS contro la morte e l'avviso di concentrazione; se il
  caster scende a 0 PF il vincolo finisce. Se i due si allontanano oltre 18 m,
  termina il vincolo a mano (la × sulla pill).

Un Annulla riporta tutto, anche i PF del caster. Le modifiche a mano dei PF
sulla card del tracker non ne tengono conto.

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
coordinatore di effetti: PF, etichette, tracker e barre mappa restano derivati dai
metadata canonici, mentre una sola voce della cronologia alimenta anche il
registro combattimento. Un promemoria già risolto, duplicato o diventato obsoleto non viene
riapplicato; il GM può chiudere l'avviso e continuare senza conseguenze.

Restano informativi i promemoria privi di una descrizione strutturata. L'MVP non
esegue tiri virtuali, bonus automatici, testo libero, risoluzioni aggregate
multi-bersaglio o scripting personalizzato. Le difese del bersaglio contano quando il
promemoria conosce il tipo di danno, con il chip accanto al campo **Danni**.

Per geometrie, trigger supportati, azioni attive e copertura residua consulta
[Incantesimi, zone e promemoria](INCANTESIMI_E_ZONE.md).

## 8. Movimento e condizioni di D&D 2014

Il tracker movimento usa la velocità salvata nella scheda dell'attore e conta
le caselle percorse nel turno. Segue ogni creatura che ha una velocità sulla
scheda, che sia un PG, un alleato o un nemico; senza velocità resta spento e il
token si muove libero. Il profilo supporta camminare, volare, nuotare, scalare
e scavare: una modalità c'è quando la concede una condizione o un incantesimo,
oppure quando viene dallo statblock importato (riquadro **Altre velocità**
della scheda). Chi non cammina non ha la voce Camminare e parte dalla prima
modalità che ha. Cambiare modalità non azzera la distanza già consumata.

Un PG parte a piedi a ogni turno. Le altre creature ripartono dalla modalità
dell'ultimo turno: un drago in volo resta in volo. Un mostro importato prima di
questa funzione ha solo la camminata: per le altre velocità si reimporta lo
statblock.

Il pulsante Movimento nella vista compatta mostra solo il riepilogo;
l'interfaccia completa resta nel layout esteso. Quando la creatura di turno ha
più modalità, il GM le sceglie anche dalla linguetta del movimento: mostra la
modalità e i soli metri, con le caselle nel suggerimento.

Cosa vede il tavolo durante il turno:

| Creatura di turno | I giocatori vedono | Avvisi di movimento |
|---|---|---|
| PG visibile | tutto | a tutti |
| Alleato visibile | il movimento e la modalità in uso, non le altre del suo statblock | solo al GM |
| Nemico, neutrale o token nascosto, anche un PG | niente | solo al GM |

**Limita movimento** riporta indietro chi va oltre il limite, mostri compresi.
Una creatura a velocità 0, per esempio Afferrata, non si trascina durante il suo
turno nemmeno con Limita movimento spento: per spostarla a mano si spegne
**Movimento tracciato**, oppure la si sposta fuori dal suo turno. Se togli la
velocità dalla scheda durante il turno, il tracker si spegne subito per quella
creatura.

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

### Boss Paragon

Un Boss Paragon (menu del token: **Abilita Boss Paragon**) riceve più turni nell'ordine. Le voci aggiuntive sono virtuali e fanno riferimento allo stesso token e agli stessi PF.

### Boss Epico

Un Boss Epico (menu del token: **Abilita Boss Epico**) opera a iniziativa 20 e genera voci **Azione Epica** nell'ordine. La card usa una cornice boss dedicata; le voci epiche non sono token duplicati. Durante un'Azione Epica l'etichetta **Turno di…**, la selezione e la vista della mappa vanno sul boss.

## 10. Cronologia e registro combattimento

Il pannello separa due funzioni:

- **Cronologia**: azioni annullabili, con possibilità di annullare una o più operazioni;
- **Registro combattimento**: resoconto leggibile degli eventi.

Alcune voci le scrive il plugin da solo in reazione a un'altra, per esempio **Capacità terminata** quando una capacità di classe finisce perché il personaggio è Privo di sensi. Non si annullano da sole: annullarle annulla anche l'azione che le ha causate, e nel pannello selezionarle seleziona anche la causa. Le aure del Paladino invece non finiscono a 0 PF: restano sospese mentre è Privo di sensi e tornano da sole quando si rialza.

Il registro raggruppa gli eventi per round, accumula il movimento totale degli attori e registra gli annullamenti come nuovi eventi, senza riscrivere il passato. Puoi:

- cercare per attore, bersaglio o evento;
- filtrare il tipo di evento;
- aggiungere note manuali;
- iniziare un nuovo registro;
- cancellare il registro con conferma;
- esportare in TXT o JSON, anche un registro archiviato senza riprenderlo: nel menu **Esporta/importa** il campo **Da esportare** sceglie quale.

Il registro è locale al browser GM e separato dalla Cronologia: per il contratto
di storage, compatibilità ed export consulta [Registro combattimento](COMBAT-LOG.md).

## 11. Clock

Lo strumento **Clock** si trova nella toolbar destra di Owlbear Rodeo. I clock sono manuali e appartengono alla scena.

- Segmenti disponibili: 4, 6, 8 e 12.
- Colori disponibili: rosso, ambra, verde, azzurro, viola e rosa.
- Ogni clock può essere incrementato, decrementato, azzerato, rinominato, riordinato o eliminato.
- Un clock nuovo nasce nascosto ai giocatori (etichetta «Solo GM»), salvo la casella **Visibile ai giocatori** nel modulo di creazione; il GM lo mostra o lo nasconde da **Gestisci**.
- La finestra dispone di modalità estesa e compatta, è trascinabile e si adatta al numero di clock visibili.

## 12. Quota e distanza 3D

**Imposta quota…** nel menu contestuale salva sul token un'altezza positiva o negativa rispetto al piano della mappa. Un'etichetta discreta indica direzione e valore.

Lo strumento **Distanza 3D** nella toolbar destra:

1. usa uno dei token selezionati come origine;
2. calcola la distanza planare secondo le caselle di D&D;
3. per token 2×2 o superiori misura dal bordo più vicino, non dal centro;
4. combina distanza planare e dislivello con il teorema di Pitagora.

La distanza planare segue la distanza minima tra le caselle occupate dai token. Ogni casella vale quanto dice la scala della scena (di solito 1,5 m).

## 13. Targeting geometrico AoE

Lo strumento **Targeting area** è disponibile al GM nella toolbar destra e include:

- cerchio;
- quadrato;
- cono;
- linea;
- rettangolo per gli incantesimi che lo richiedono.

Durante il trascinamento compare la misura in metri. Origine e dimensioni possono agganciarsi al centro o ai vertici delle caselle. Le forme restano sulla scena dopo la creazione. Quando le sposti, le ruoti o le ridimensioni sulla mappa riselezionano i token che occupano almeno una delle caselle incluse, nella loro nuova posizione e direzione; le caselle restano quelle della griglia.

Il cerchio segue la regola della Guida del DM: una casella è inclusa quando il suo centro cade dentro il raggio, cioè quando il cerchio ne copre circa la metà. Il cono include una casella quando la sagoma ne copre più del 15%. Il cono parte dalla mediana del lato della casella scelta accanto al caster, anche in diagonale. La forma sagomata segue il contorno delle caselle incluse, mentre una silhouette geometrica interna rende leggibile la geometria originaria. Regole e scelte sono raccolte in `docs/AREE_SU_GRIGLIA.md`.

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
qualsiasi creatura; **Riposiziona area** la ridisegna. Sotto il pulsante dell'area il
pannello dice ciò che la sagoma non può disegnare, per esempio i pannelli del Muro di
ghiaccio. Nel registro e nella
Cronologia un lancio senza TS (una cura, Parola del potere uccidere, Dissolvi
magie) compare come incantesimo, non come tiro salvezza.

Alcuni incantesimi hanno più aree in un solo lancio: Sciame di meteore ha quattro
esplosioni di 12 m, Tempesta di fuoco da uno a dieci cubi di 3 m. Dopo **Posiziona
area** disegni le sagome una dopo l'altra. Ognuna resta sulla mappa con il suo numero
(1/4, 2/4… per lo Sciame, 1, 2, 3… per i cubi), e la riga di stato del pannello conta
quante ne mancano. Per togliere una sagoma premi sul suo numero, poi ridisegnala dove
vuoi. Alla conferma il pannello mostra una riga per ogni creatura, anche se sta in più
aree: un tiro salvezza e un danno, come dicono i testi. Lo Sciame si conferma solo con
tutte e quattro le esplosioni. Ogni cubo della Tempesta deve toccare un altro cubo con
un lato: se un cubo resta isolato, la conferma lo dice con il suo numero. I danni da fuoco
e contundenti dello Sciame hanno una casella ciascuno, ognuna con la sua difesa.

**Aspetto area** permette di scegliere colore del riempimento, colore del contorno, opacità e spessore. Lo stile è una preferenza locale: vale per le nuove aree e ricolora le aree disegnate a mano già sulla mappa, mentre le zone degli incantesimi (Raggio lunare, Muro di fuoco) conservano il loro tema. Dal menu contestuale di un'area puoi scegliere **Riseleziona bersagli**.

## 14. Etichette sulla mappa

Il plugin crea elementi derivati e bloccati per evitare trascinamenti accidentali:

- barra e numero PF;
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
2. completa PF, iniziativa, velocità e risorse boss;
3. verifica la vista giocatori sul display del tavolo;
4. crea eventuali clock iniziali, nascondendo quelli solo GM.

Durante il combattimento:

1. usa le frecce del tracker (o Spazio, → e ←) per avanzare;
2. usa le azioni rapide oppure applica incantesimi e condizioni dai pannelli
   dedicati; per le condizioni comuni basta il clic destro sulla card o sul
   token (**Condizioni rapide**), per i danni a una creatura il clic sui suoi PF;
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

## 17. Enciclopedia DM

Lo strumento **Enciclopedia DM** (solo GM) apre un riferimento delle regole in
italiano, con tre schede:

- **Condizioni**: gli effetti di ogni condizione dell'SRD, Indebolimento
  compreso. Un clic su un'etichetta di condizione nel tracker apre direttamente
  la sua voce.
- **Incantesimi**: livello, scuola, tempo di lancio, gittata, componenti,
  durata e descrizione. Dal pannello incantesimi si arriva alla voce
  dell'incantesimo scelto.
- **Regole**: le regole dell'SRD 5.1 divise per argomento (Personaggio,
  Equipaggiamento, Caratteristiche, Avventura, Combattimento, Magia, Strumenti
  del DM), con le tabelle di armi, armature, CD, viaggio, trappole, follia,
  oggetti e veleni.

Nella scheda **Regole**:

1. a ricerca vuota apri un argomento e scegli una voce dall'elenco;
2. oppure scrivi nella ricerca: bastano l'inizio delle parole (`cop` trova
   Copertura) e funzionano anche sinonimi come `afferrare` o `AdO`; sotto ogni
   risultato c'è il percorso della voce;
3. in fondo alla voce, **Vedi anche** porta alle regole collegate o alla
   condizione (per esempio da Lottare ad Afferrato); **‹ Indietro** riporta
   alla voce di prima, e un clic sull'argomento in alto torna all'elenco.

Le varianti, come l'ingombro, portano l'etichetta **Regola opzionale**. Le
schede Incantesimi e Regole si scaricano la prima volta che le apri, così
l'Enciclopedia si apre subito sulle Condizioni.

### Pacchetti privati

Il plugin pubblico contiene solo il testo dell'SRD 5.1. I testi del Manuale del
Giocatore, di Xanathar, di Tasha e dell'Unearthed Arcana del Ranger arrivano con
i **pacchetti privati**: file che generi dai tuoi manuali e che restano solo nel
browser in cui li importi, mai nella stanza né agli altri giocatori.

1. apri l'Enciclopedia DM e premi **Pacchetti** accanto al titolo;
2. premi **Importa pacchetto…** e scegli i file `*.private-pack.json` (anche più
   di uno insieme): li trovi in `L:\Dungeons & Dragons\Take Initiative\pacchetti`;
3. l'elenco mostra per ogni pacchetto sigla, titolo, quanti testi contiene e la
   data; **Rimuovi** lo toglie.

Con i pacchetti importati:

- la scheda personaggio, la console attacchi e la scheda Incantesimi mostrano
  il testo degli incantesimi di Xanathar, Tasha e del Manuale non presenti
  nell'SRD;
- le capacità di classe mostrano il loro testo, e la finestra degli Impulsi di
  Magia Selvaggia mostra l'effetto di ogni riga;
- le regole dei manuali (quando un pacchetto le contiene) compaiono nella
  scheda **Regole** negli stessi argomenti dell'SRD, con la sigla del manuale.
  Sotto la ricerca compare una riga di filtri, una per fonte con il numero di
  voci (per esempio **SRD · 243**, **PHB · 125** e **XGE · 160**): un clic nasconde o mostra le
  voci di quella fonte nell'albero e nella ricerca. L'ultima fonte visibile non
  si può nascondere, e la scelta resta in questo browser.

Senza il pacchetto quei punti mostrano i dati di gioco e dicono quale pacchetto
importare; le automazioni funzionano comunque. Una scheda personaggio già
aperta legge i pacchetti alla riapertura. In una finestra in incognito il
pacchetto vale solo per la sessione: la finestra dei giocatori sul tavolo non
ne ha bisogno.
