# Studio: azioni di turno e azione preparata

Data: 15 novembre 2026. Stato: **studio**. Nessun codice scritto. Base: `main` =
`origin/main` a `09adef5d`.

Decisioni dell'utente del 15/11 (§7):

- approvate D1, D3, D4, D5, D6, D7 con D11, e D12;
- D1 con un'aggiunta: anche **Lotta** e **Spinta** passano nella scheda Azioni;
- D8 cambiata: niente motivo scritto, troppa scrittura al tavolo (§3.7);
- D9: l'incantesimo preparato con la concentrazione è il punto più utile per
  l'utente, da studiare a fondo (§9);
- D10: serve un audit delle capacità che toccano le azioni (§10);
- D2 non citata: resta la raccomandazione, cioè Cercare e Usare un oggetto
  fuori.

**T1 fatto il 15/11:** scheda Azioni con Scatto, Disimpegno e Schivata, Lotta e
Spinta spostate lì, avvisi di attacco di opportunità che rispettano il
Disimpegno, promemoria della Schivata sotto il bersaglio. Prove in
`PROVE_IN_STANZA.md`, sezione B10.

**T2 fatto il 15/11:** Aiuto nei due modi e Nascondersi, con il totale di
Furtività facoltativo; la pill «Nascosto» di un nemico la vede solo il GM (D11).
C'è anche il meccanismo unico delle pill di «prossimo attacco con vantaggio»: un
attacco con tiro per colpire registrato dalla console toglie, nello stesso
comando, il «Nascosto» di chi attacca e la pill che gli dà vantaggio sul
bersaglio («Bersaglio dell'aiuto», «Colpo Distraente», la pill di Dardo
tracciante). Le decisioni A4 e A5 erano ancora in attesa: sono applicate come
raccomandate, perché il lotto le contiene, e si possono rivedere. Tre differenze
dalla raccomandazione di A4 e A5:

- Attacco con Finta resta com'è: nel plugin spende il dado e non mette una pill;
- Ingannatore Versatile resta com'è: il vantaggio vale per tutto il turno, non per
  un attacco solo;
- Dono fatato non cambia in T2: si allinea alle due pill con le capacità che danno
  un'azione come azione bonus (T4a).

Prove in `PROVE_IN_STANZA.md`, sezione B11.

**T3 fatto il 15/11:** Preparare nella scheda Azioni mette la pill «Azione
preparata» del menu della card. Nel menu, con la pill attiva:

- **Innesca con un attacco** apre la console sulla creatura, fuori turno, con la
  reazione già spuntata («Usa la reazione (azione preparata)»);
- **Innesca senza attacco** fa ciò che faceva «Innesca azione preparata»: toglie
  la pill e segna la reazione. Il nome di prima resta per una creatura che la
  console non mostra, dove la voce è una sola.

Un attacco registrato con la reazione toglie l'azione preparata nello stesso
comando, con un solo Annulla, anche se è un attacco di opportunità: la reazione
era quella che aspettava. La reazione spesa per altre vie (un incantesimo a
reazione, il clic sull'icona della card) per ora non la toglie. Prove in
`PROVE_IN_STANZA.md`, sezione B12.

**T5 fatto il 15/11:** una creatura in Schivata ha «vant. (Schivata)» sulla sua
riga in ogni pannello che chiede un TS su Destrezza:

- la console attacchi, per le aree e le azioni dei mostri, sotto la riga, prima
  di «Elusione»;
- la Console Boss, come etichetta accanto alle difese;
- il pannello incantesimi, sotto il nome;
- i promemoria degli incantesimi attivi, accanto al nome, come il vantaggio di
  chi ha scoperto il drago illusorio.

La regola sta in `attackAdvantagePillsCore.js` (`dodgeSaveAdvantage`). Prove in
`PROVE_IN_STANZA.md`, sezione B13.

**T6a fatto il 15/11:** le basi dell'incantesimo preparato (§9), ancora senza
niente di visibile:

- l'elenco degli incantesimi SRD da 1 azione nell'estratto
  (`spell-reference-it-runtime.json`, `oneActionIds`: 242 con i trucchetti),
  tenuto uguale al riferimento completo da un test. Per il PHB 2014 e i
  supplementi vale il tempo di lancio dei loro dati;
- la fase generica in `spellCastPhaseCore.js`, segnata da `castContext.readied`.
  Alla preparazione mette sul caster la pill «Azione preparata · Palla di fuoco
  (3°)», con la scadenza di Scudo (inizio del suo prossimo turno). Al rilascio la
  concentrazione continua se l'incantesimo la richiede, altrimenti finisce (P7);
- la concentrazione nella preparazione, per qualunque incantesimo
  (`spellForCastContext`, P4). Un incantesimo d'attacco preparato non tira e la
  sua presa resta.

Simbolo, Frecce Infuocate e le punizioni restano fuori; Sfera congelante si
prepara nella forma «Scaglia subito».

**T6b fatto il 15/11:** la preparazione si usa.

- Nel pannello incantesimi, un incantesimo da 1 azione ha **Prepara** accanto
  al pulsante principale (P1), non una scheda. La preparazione è la fase
  «prepare» con `castContext.readied`, che il contratto e la sessione del
  pannello mettono e tolgono da soli. La fase «prepare» compare solo nel
  contratto della presa: un lancio non ha fasi, e i lanci rapidi restano
  diretti come prima. Si sceglie solo lo slot (P2); lo slot si
  spende (P3); la concentrazione chiude le altre con la conferma di sempre (P4).
- L'avviso di Controincantesimo parte alla preparazione (P9). La pill di una
  creatura che non è PG o alleata ha `mechanics.gmOnly` (P10).
- Nella console, Azioni → Preparare ha due modi: «Un'azione», la pill di T3, e
  «Un incantesimo», che elenca gli incantesimi del grimorio da 1 azione e chiede
  al tracker di aprire il pannello già in preparazione, come fa Lancia; slot e
  usi si spendono lì.
- La Magia Selvaggia nel plugin si tira a mano dalla capacità: alla preparazione
  non c'è niente da aggiungere.
- Sfera congelante preparata nella forma «Scaglia subito» resta da fare: le sue
  schede hanno già la fase «prepare» del globo.

Prove in `PROVE_IN_STANZA.md`, sezione B14.

**T6c fatto il 15/11:** il rilascio si usa.

- Il rilascio non è una fase: è il **lancio vero** dell'incantesimo, con i suoi
  bersagli, l'area, gli esiti, i danni e la durata, e con in più il segno
  `readiedRelease` (l'id della presa) nella sessione del pannello. Così gli
  esecutori fanno quello che fanno per un lancio (TS del catalogo, danni
  diretti, Palla di fuoco ritardata) e il ramo «preparato» delle aree,
  condiviso con Simbolo e Sfera congelante, resta com'era.
- Nello stesso comando, con un solo Annulla (P6): la reazione spesa, con la
  conferma se è già usata; nessuno slot né uso; la presa chiusa rompendo la
  sua concentrazione per id, che toglie anche pill e record. Gli esecutori
  rileggono la presa e non lanciano niente se è sparita.
- La concentrazione (P7): un incantesimo che la richiede ne apre una nuova,
  con un id nuovo e la sua durata dal rilascio; la scadenza «prossimo turno»
  della presa non lo tocca più. Al rilascio si chiede conferma solo per
  un'altra concentrazione, mai per la presa. Niente Controincantesimo (P9).
- **Da dove:** il ⚡ della pill dell'incantesimo preparato (**Rilascia ›**), il
  menu della card (**Rilascia Palla di fuoco**, al posto di «Innesca con/senza
  attacco», che perderebbero l'incantesimo) e l'elenco degli incantesimi attivi
  del pannello. La presa offre solo **Rilascia**: le azioni dell'incantesimo
  (Immagine speculare, Invocare il fulmine) partono dal lancio. Nel pannello
  il pulsante è **Rilascia**, senza caster né slot da scegliere.
- La presa non apre più il popup automatico del turno: si rilascia in
  qualunque turno, quando lo dice il GM.
- Nella Cronologia e nel log: «Rilascio: Benedizione», «Rilascio · Palla di
  fuoco» per le aree, con «speso: reazione».
- Intermittenza preparata non scrive più la risoluzione finale alla presa:
  chiuderla non chiede il ritorno dal piano Etereo.
- **Restano:** gli incantesimi con tiro per colpire si rilasciano nel pannello
  come un lancio, con l'esito dell'attacco da scegliere, finché T6d non li
  porta nella console; Sfera congelante preparata nella forma «Scaglia
  subito»; Porta dimensionale rilasciata scrive ancora «Lancio incantesimo»
  nella Cronologia.

Prove in `PROVE_IN_STANZA.md`, sezione B15.

**T6d fatto il 15/11:** il rilascio degli incantesimi d'attacco nella console.

- **Dove:** il menu della card e il ⚡ aprono la console attacchi quando il
  personaggio registra lì l'incantesimo, con l'azione della scheda o quella
  costruita dal grimorio, come fa la scheda. Restano nel pannello Tocco del
  vampiro, il cui tocco segue un lancio del pannello, e Lama Roboante e Lama
  Verdefiamma, intrecciate a un attacco con arma.
- **Quando un attacco è un rilascio:** lo decide il nucleo della console
  (`pcAttackReadiedRelease`) sull'attaccante letto al commit. Fuori dal suo
  turno, con proprio quell'incantesimo in presa, l'attacco è il rilascio, da
  qualunque entrata si apra la console, anche dalla 🗡️ della card. Così lo
  slot non si spende due volte.
- **Che cosa fa:** nessuno slot, al livello della presa (lo slot nella console
  è bloccato con la nota «slot di 3° già speso alla preparazione»); la
  reazione con la casella «Usa la reazione (azione preparata)» di T3; la presa
  chiusa nel comando dell'attacco, anche con un mancato, rompendo la sua
  concentrazione per id. Un solo Annulla rimette tutto.
- **Più raggi:** Raggio rovente e Dardo incantato rilasciati continuano il
  lancio come oggi, senza slot; la reazione si spende al primo.
- Nel risultato e nel log: «slot già speso alla preparazione» e «Incantesimo
  preparato rilasciato: Raggio rovente.» (forma corretta in T6e, prima
  «Raggio rovente preparato rilasciato», che sbagliava il genere con
  Palla di fuoco).
- **Correzione di T6b trovata al banco:** per il pannello gli incantesimi della
  console (Raggio rovente, Dardo di fuoco, Infliggi ferite…) sono «solo
  registrati». La loro preparazione passava per «Lancio registrato»: spendeva
  lo slot senza pill né concentrazione. Ora la presa è vera per ogni
  incantesimo.

Prove in `PROVE_IN_STANZA.md`, sezione B18.

**T6e fatto il 15/11:** le perdite.

- **Le strade c'erano già** (P8), perché la presa è una concentrazione vera.
  Il TS di concentrazione fallito la rompe per id. Con 0 PF (decisione D4 del
  bugfix) e con Incapacitato o le condizioni che lo includono (Stordito,
  Paralizzato…), l'automazione rompe ogni concentrazione. Un'altra
  concentrazione la sostituisce, con la conferma di sempre. L'inizio del
  prossimo turno del caster la fa scadere. Ora un test per ciascuna le tiene
  ferme.
- **Paragon:** il confine di ogni turno usa l'id base (`__conditionActorId`) e
  la scadenza «prossimo turno» confronta la chiave del turno. Una presa fatta
  nel primo turno del Paragon sparisce all'inizio del suo secondo turno
  (`::p2`), mai in quello di un'altra creatura.
- **I nomi (P4):** dove si nomina la concentrazione della presa compare
  «Palla di fuoco (azione preparata)»: l'avviso del TS di concentrazione e la
  sua riga nel log, la C della pill sulla card, la riga «Concentrazione» della
  console, la conferma del pannello quando un nuovo lancio chiude la presa.
  «Azione preparata» resta giusta qualunque sia il genere dell'incantesimo.
- **Il log:** la presa che finisce scrive «Maga: − Palla di fuoco (azione
  preparata, svanita)», oppure «rilasciata» negli eventi di rilascio (le voci
  «Rilascio» del pannello e gli attacchi della console con il rilascio). Alla
  preparazione scrive «+ Palla di fuoco (azione preparata)».

Prove in `PROVE_IN_STANZA.md`, sezione B20.

Scritti lo stesso giorno, con decisioni nuove in attesa:

- §9, l'incantesimo preparato: decisioni **P1–P12** (§9.8), approvate dall'utente
  il 15/11 come raccomandate;
- §10, l'audit delle capacità: decisioni **A1–A7** (§10.9).

Richiesta dell'utente (15/11), dopo la sessione del giorno prima:

- l'**azione preparata** è un'azione a tutti gli effetti;
- vanno pensate le altre azioni di turno che non sono un attacco: **Scatto**,
  **Disimpegno**, **Schivata**, **Aiuto**, **Nascondersi**, **Preparare**,
  **Cercare**, **Usare un oggetto**.

Vincoli:

- regole PHB 2014;
- **niente bookkeeping del GM**: il 23/10 l'utente ha scartato l'economia
  d'azione (azione, azione bonus, reazione segnate a mano). Un'azione di turno
  entra solo se un clic fa lavorare il plugin al posto del GM: muove un conto,
  spegne un avviso, mostra un vantaggio, toglie una pill da sola;
- niente funzioni per un solo mostro;
- le prove valgono in vista compatta ed estesa.

---

## 1. Che cosa esiste già

### 1.1 Azione preparata

L'unica azione di turno con un comando suo:

- **Dove:** nel menu contestuale della card, `initiative-card-context-menu.js`
  (voci «Azione preparata», «Innesca azione preparata», «Annulla azione
  preparata»).
- **Cosa fa** (`initiativeList.js`, `__toggleReadiedActionFromContext` e
  `__triggerReadiedActionFromContext`):
  - mette la condizione «Azione preparata», che scade da sola all'inizio del
    turno successivo della creatura (`reactionTrackerCore.js`,
    `NEXT_OWN_TURN_START_EXPIRY`);
  - **Innesca** la toglie e segna «Reazione usata» nello stesso passo, con un
    solo Annulla.
- **Cosa non fa:**
  - non ricorda il motivo che la fa scattare né che cosa si è preparato;
  - non apre l'attacco né l'incantesimo;
  - un incantesimo preparato non spende lo slot e non tiene la concentrazione
    al momento della preparazione, come vuole il PHB.

### 1.2 Scatto

- Esiste solo come contatore «Scatto ×N» nel riquadro movimento del tracker,
  visibile al GM (`initiativeList.js`, `adjustSpeedCheckDash` in `speedCheck.js`).
- Il movimento disponibile diventa velocità × (1 + scatti) più i bonus
  (`speedCheckCore.js`). Il contatore si azzera con il turno.
- Non scrive nulla nella Cronologia né nel log, e non mette pill.

### 1.3 Disimpegno

- Non esiste.
- Gli avvisi di attacco di opportunità (R5, `opportunityAttackCore.js`) però
  saltano già la creatura che ha la pill «Movimento: no AdO», quella di Colpo
  dello Zefiro. Il commento del file lo dice: il Disimpegno il plugin non può
  saperlo (decisione J3).
- Tecnica dell'Ubriaco del monaco dà +3 m, ma il suo Disimpegno resta testo.

### 1.4 Schivata

- Esiste solo come pill di Difesa Paziente del monaco: «Schivata · Difesa
  Paziente», fino al turno dopo, 1 ki, lanciata dalla scheda Capacità della
  console.
- Nessun codice la legge. La console non mostra né lo svantaggio agli attacchi
  contro, né il vantaggio ai TS di Destrezza.

### 1.5 Nascondersi, Aiuto, Cercare, Usare un oggetto

- Non esistono.
- «Nascosto» compare solo come modo del tiro di dadi nascosto e come filtro
  delle opzioni. La condizione più vicina è «Invisibile».
- Le capacità che danno Nascondersi come azione bonus (Svanire del ranger,
  Fuga agile dei goblin) sono solo testo.

### 1.6 Capacità che danno queste azioni come azione bonus

| Capacità | Oggi |
|---|---|
| Azione Scaltra (ladro: Scatto, Disimpegno, Nascondersi) | non automatizzata |
| Passo del Vento (monaco: Scatto o Disimpegno, 1 ki) | spende il ki e basta |
| Difesa Paziente (monaco: Schivata, 1 ki) | pill «Schivata», solo testo |
| Tecnica dell'Ubriaco (monaco: Disimpegno gratis con Raffica) | +3 m, Disimpegno solo testo |
| Fuga agile (goblin, mostri: Disimpegno o Nascondersi) | testo |
| Scarica di adrenalina (orco: Scatto) | uso contato, Scatto solo testo |

### 1.7 Schemi già pronti da riusare

1. **Lottare e Spingere** sono già azioni generiche nella console attacchi,
   uguali per ogni creatura (`pcAttackManeuverCore.js`): voci del selettore,
   un esito, una voce nella Cronologia, un Annulla. Le azioni di turno possono
   seguire lo stesso modello.
2. **Pill a scadenza di turno:** le scadenze «inizio del prossimo turno» e
   «fine del turno» esistono già, con l'Annulla della Cronologia.
3. **Pill che finisce quando si attacca:** Passo nascosto (`speciesTraitCore.js`,
   `endsOnAttack`) e Invisibilità (CAP-LINK, `pcAttackLinkEnds`). La console la
   toglie nello stesso passo dell'attacco.
4. **Reazione:** `planReactionSpend` aggiunge «Reazione usata» a qualunque
   comando, e la console fuori turno ha già la casella «Usa la reazione».

---

## 2. Che cosa dice il PHB 2014

In sintesi, con parole mie:

| Azione | Effetto |
|---|---|
| **Scatto** | un movimento extra pari alla velocità, per questo turno |
| **Disimpegno** | il movimento di questo turno non provoca attacchi di opportunità |
| **Schivata** | fino all'inizio del prossimo turno: gli attacchi contro hanno svantaggio se chi schiva vede l'attaccante, e i TS di Destrezza hanno vantaggio. Finisce prima se la creatura è incapacitata o la sua velocità scende a 0 |
| **Aiuto** | due usi. Una creatura alleata ha vantaggio alla prossima prova del compito in cui l'aiuti. Oppure il primo attacco di un alleato contro un nemico entro 1,5 m da te, prima del tuo prossimo turno, ha vantaggio |
| **Nascondersi** | una prova di Destrezza (Furtività), con le regole del nascondersi. Il totale fa da CD per chi cerca. Chi è nascosto ha vantaggio al primo attacco e smette di esserlo quando attacca, fa rumore o viene trovato |
| **Preparare** | si sceglie un innesco percepibile e un'azione. Quando l'innesco avviene si usa la reazione, subito dopo l'innesco, oppure lo si ignora. Un incantesimo preparato si lancia subito: lo slot si spende, l'effetto si tiene con la concentrazione, e se la reazione non arriva prima del prossimo turno l'incantesimo è perso |
| **Cercare** | una prova di Saggezza (Percezione) o di Intelligenza (Indagare) |
| **Usare un oggetto** | interagire con un secondo oggetto o usare un oggetto che lo richiede |

---

## 3. Proposta, azione per azione

La regola per tutte:

- un clic, facoltativo;
- una voce nella Cronologia e nel log, con un Annulla;
- l'azione entra solo se fa lavorare il plugin.

Nessun contatore di azioni del turno: se il GM non clicca, il plugin si comporta
come oggi.

### 3.1 Dove (D1)

Una scheda **Azioni** nella console attacchi, accanto ad Attacchi, Trucchetti,
Incantesimi e Capacità:

- vale per ogni creatura, PG e mostri;
- la console si apre già da sola al turno e segue la creatura fuori turno;
- l'Azione preparata resta anche nel menu della card, per chi la usa da lì.

**Approvata il 15/11, con un'aggiunta:** anche **Lotta** e **Spinta** lasciano la
scheda Attacchi e passano in Azioni. Restano quelle di oggi:

- stesso esito e stessa voce nella Cronologia;
- stessa nota: «Al posto di un attacco dell'azione Attacco».

Come Lotta e Spinta oggi, le azioni non fanno aprire da sola la console al
turno di una creatura senza attacchi né incantesimi.

### 3.2 Scatto (D3)

- Un clic aggiunge uno scatto al riquadro movimento della creatura di turno,
  come il pulsante ＋ di «Scatto ×N».
- Scrive «Toobin: Scatto» nel log.
- Nessuna pill: il riquadro movimento lo mostra già.
- Col Movimento spento vale solo la voce nel log.

### 3.3 Disimpegno (D4)

- Mette la pill **Disimpegno**, che finisce alla fine del turno della creatura.
- Gli avvisi di attacco di opportunità la leggono come «Movimento: no AdO»: chi
  si muove disimpegnato non provoca avvisi.
- Il motore cerca oggi quel nome esatto. Propongo di fargli riconoscere anche
  «Disimpegno», invece di chiamare la pill con un nome tecnico.

### 3.4 Schivata (D5)

- Mette la pill **Schivata** fino all'inizio del prossimo turno della creatura.
- È la stessa pill di Difesa Paziente, che così smette di essere solo testo.
- **Console attacchi:** chi attacca una creatura in Schivata vede, sopra
  l'esito, «Schivata: svantaggio all'attacco, se il bersaglio vede chi attacca». È un promemoria: i
  dadi restano del tavolo.
- **TS di Destrezza:** nei pannelli che chiedono un TS (incantesimi ad area,
  azioni dei mostri, console Boss) la riga della creatura dice «vant. (Schivata)».
- La pill non finisce da sola se la creatura è incapacitata o resta a 0 m:
  succede di rado, e resta l'Annulla o la rimozione a mano.

### 3.5 Aiuto (D6)

Due modi, scelti nella scheda:

- **Su un alleato** (una prova): pill sull'alleato, da togliere a mano. È il
  caso raro e il plugin non vede le prove.
- **Contro un nemico** (un attacco): pill sul nemico, fino all'inizio del
  prossimo turno di chi aiuta.
- **I nomi delle due pill** stanno nel §10.6 (decisione A5): «Aiuto» è già il
  nome della pill dell'incantesimo Aiuto.
  - La console la mostra a chi attacca quel nemico.
  - Il primo attacco registrato da una creatura dello stesso lato di chi aiuta,
    chi aiuta escluso, la toglie da solo, nello stesso passo.
  - Questo è il punto che toglie lavoro al GM.

### 3.6 Nascondersi (D7)

- Mette la pill **Nascosto** su chi si nasconde, con il totale di Furtività se
  il GM lo scrive, per esempio «Nascosto · 17». Il campo è facoltativo.
- **Console attacchi:** chi è nascosto vede «Nascosto: vantaggio al primo
  attacco». Quando attacca, la console toglie la pill nello stesso passo, come
  Passo nascosto.
- **Lanciare un incantesimo** non la toglie da solo. Dipende dalle componenti
  e dal tavolo, quindi resta a mano.
- **Chi la vede (D11):** sul tracker del tavolo valgono le opzioni di
  visibilità degli effetti. Per un nemico nascosto propongo di non mostrarla ai
  giocatori, ma solo al GM.

### 3.7 Preparare (D8, D9)

**Decisione dell'utente del 15/11 (D8):** niente motivo scritto nel plugin,
troppa scrittura al tavolo. Il motivo resta al tavolo, come oggi.

Preparare ha due forme:

- **Un'azione qualunque** (un attacco, un movimento, altro): un clic dalla
  scheda Azioni mette la pill «Azione preparata», come fa oggi il menu della
  card. Non c'è niente da scegliere né da scrivere.
  - **Innesca**, dalla card, apre la console attacchi su quella creatura fuori
    turno, con «Usa la reazione» già spuntata. L'attacco si sceglie lì, al
    momento.
  - Quando registri l'attacco con la reazione, la console toglie la pill nello
    stesso passo. Se invece non si attacca, Innesca dal menu fa quello che fa
    oggi: toglie la pill e segna la reazione.
- **Un incantesimo**: è il punto più utile per l'utente e ha uno studio suo
  (§9). Lo slot si spende subito, l'energia si tiene con la concentrazione, il
  rilascio usa la reazione.

La pill scade come oggi all'inizio del prossimo turno della creatura.

### 3.8 Cercare e Usare un oggetto (D2)

Fuori: non cambiano nulla che il plugin calcola, e una voce nel log da segnare
a mano sarebbe proprio il bookkeeping da evitare.

Se servisse in futuro: Cercare potrebbe confrontare la Percezione con il totale
di Furtività scritto nella pill Nascosto.

### 3.9 Le capacità che danno queste azioni (D10)

Le capacità del §1.6 diventano la stessa azione, come azione bonus:

- **Azione Scaltra:** dalla scheda Capacità, tre pulsanti (Scatto, Disimpegno,
  Nascondersi) che fanno la stessa cosa delle azioni;
- **Passo del Vento:** spende il ki, poi Scatto o Disimpegno;
- **Difesa Paziente:** è già la Schivata, e ora conta;
- **Tecnica dell'Ubriaco:** aggiunge il Disimpegno alla sua pill;
- **Fuga agile e simili dei mostri:** nella scheda Azioni dei mostri che le
  hanno.

### 3.10 Il log (D12)

- Ogni azione è un comando: una voce nella Cronologia («Toobin: Schivata») e un
  evento nel log combattimento, nella categoria Azione.
- L'Annulla toglie la pill e lo scatto.

---

## 4. Rischi, come chiede AGENTS.md

- **Riquadro movimento:** lo Scatto della scheda deve passare per
  `adjustSpeedCheckDash`, senza scrivere il movimento per un'altra strada. Il
  riquadro ha appena avuto modifiche: va controllato che non ci siano lavori
  aperti su `speedCheck.js` e `initiativeMovementPresentation.js`.
- **Avvisi di attacco di opportunità:** riconoscere «Disimpegno» è una riga in
  `hasNoOpportunityPill`. Nessun cambio al motore.
- **Menu della card in `initiativeList.js`:** l'Azione preparata vive lì. Le
  modifiche toccherebbero solo le due funzioni del §1.1: Innesca apre la
  console, o il rilascio quando la pill tiene un incantesimo (§9).
- **Turno attivo e ordine:** nessuna azione li tocca.
- **Metadata:** solo condizioni normali, istanze di incantesimo e lo stato del
  movimento che esistono già; nessun campo nuovo sui token.

---

## 5. Lotti proposti

| Lotto | Contenuto | Tocca |
|---|---|---|
| **T1** | scheda Azioni con Scatto, Disimpegno, Schivata, e Lotta e Spinta spostate lì; promemoria di Schivata nella console | console attacchi, `opportunityAttackCore.js`, riquadro movimento |
| **T2** | Aiuto (due modi) e Nascondersi (pill, vantaggio, fine all'attacco); il meccanismo unico delle pill di «prossimo attacco con vantaggio» (§10.6) | console attacchi, CAP-LINK |
| **T3** | Preparare dalla scheda Azioni, senza motivo scritto (D8); Innesca apre la console fuori turno con la reazione; la pill si toglie quando si registra l'attacco con la reazione | console, menu della card |
| **T4a–T4c** | capacità che danno le azioni, movimento senza attacchi di opportunità, invisibilità che finisce attaccando: lotti nel §10.8 | scheda Capacità, catalogo capacità, tratti di specie |
| **TD** | dati da correggere trovati con l'audit (§10.7) | catalogo capacità, tratti dei mostri |
| **T5** | TS di Destrezza con vantaggio da Schivata nei pannelli dei TS | pannelli ad area, console Boss |
| **T6a–T6f** | incantesimo preparato con la concentrazione: lotti nel §9.7 | pannello incantesimi, concentrazione, console attacchi |

Ogni lotto ha test che falliscono senza la patch, la CI completa in una copia
pulita e le voci in `PROVE_IN_STANZA.md`.

---

## 6. Che cosa resta al tavolo

- I dadi: vantaggio e svantaggio sono promemoria, non tiri.
- Se l'attaccante vede chi schiva, e se chi si nasconde ci riesce.
- La fine anticipata di Schivata (incapacitato, velocità 0) e di Nascondersi
  (rumore, trovato).
- L'aiuto a una prova.
- Cercare e Usare un oggetto.

---

## 7. Decisioni per l'utente

| # | Decisione | Raccomandazione | Esito (15/11) |
|---|---|---|---|
| D1 | Dove stanno le azioni | scheda **Azioni** della console attacchi; Azione preparata anche nel menu della card | approvata, e **Lotta** e **Spinta** passano in Azioni |
| D2 | Quali azioni | Scatto, Disimpegno, Schivata, Aiuto, Nascondersi, Preparare; **fuori** Cercare e Usare un oggetto | non citata: vale la raccomandazione |
| D3 | Scatto | ＋1 al riquadro movimento e voce nel log, nessuna pill | approvata |
| D4 | Disimpegno | pill «Disimpegno» fino a fine turno, riconosciuta dagli avvisi di attacco di opportunità | approvata |
| D5 | Schivata | pill fino al prossimo turno (la stessa di Difesa Paziente) e promemoria di svantaggio nella console; fine anticipata a mano | approvata |
| D6 | Aiuto | due modi; contro un nemico la pill si toglie da sola al primo attacco di un alleato | approvata |
| D7 | Nascondersi | pill «Nascosto» con il totale di Furtività facoltativo; vantaggio mostrato; finisce da sola quando attacca dalla console | approvata, con D11 |
| D8 | Preparare | motivo e «che cosa» nella pill; Innesca apre la console sull'attacco scelto con la reazione | **cambiata:** niente motivo scritto; Innesca apre la console fuori turno con la reazione, l'attacco si sceglie lì (§3.7) |
| D9 | Incantesimo preparato | primo giro: solo il promemoria; slot e concentrazione alla preparazione in T6 | **da studiare a fondo**, è il punto più utile: §9 |
| D10 | Capacità con azioni bonus | in T4, riusano le stesse azioni | approvata, con un **audit** delle capacità: §10 |
| D11 | Chi vede «Nascosto» di un nemico | solo il GM | approvata |
| D12 | Log | ogni azione è una voce di Cronologia e del log, annullabile | approvata |

---

## 8. Che cosa non fa questo studio

- Non conta azioni, azioni bonus e reazioni del turno: niente economia d'azione.
- Non tira dadi e non decide vantaggio o svantaggio al posto del tavolo.
- Non tocca il turno attivo, l'ordine di iniziativa né i PF.

---

## 9. Incantesimo preparato (D9)

Per l'utente è uno dei punti più utili sul piano delle regole: va fatto
funzionare con la concentrazione, senza attriti.

### 9.1 Le regole (PHB 2014, capitolo 9, Preparare)

In sintesi, con parole mie:

- **Si lancia subito.** Chi prepara un incantesimo lo lancia nel proprio turno,
  come sempre, ma ne trattiene l'energia. La libera con la reazione quando
  l'innesco avviene.
- **Solo 1 azione.** Si può preparare solo un incantesimo con tempo di lancio
  di 1 azione: niente azioni bonus, reazioni o lanci lunghi.
- **Trattenere è concentrazione.** Se chi lancia si stava già concentrando su
  un altro incantesimo, quello finisce. Se la concentrazione si rompe prima del
  rilascio, l'incantesimo svanisce senza effetto. L'esempio del manuale è
  Ragnatela che finisce preparando Dardo incantato.
- **Fino al prossimo turno.** C'è tempo fino all'inizio del turno successivo di
  chi lancia, poi l'azione preparata è persa.
- **Lo slot.** Si spende al lancio, cioè alla preparazione, e resta speso anche
  se l'incantesimo svanisce: segue dal «si lancia come sempre».
- **La reazione.** Il rilascio la usa: con la reazione già usata nel round non
  si rilascia.

Il manuale lascia al tavolo tre punti, che qui diventano decisioni (§9.8):

- quando si scelgono bersagli e area;
- se Controincantesimo si usa alla preparazione o al rilascio;
- che cosa succede alla concentrazione dopo il rilascio di un incantesimo che
  già la richiede. La lettura più diffusa: continua, ora sull'incantesimo.

### 9.2 Che cosa c'è già nel plugin

Il plugin ha già un meccanismo a due fasi, «prepara» e «risolvi»
(`spellCastPhaseCore.js`, `PHASED_SPELLS`). Lo usano:

- le punizioni e i colpi: si lanciano prima e si risolvono al colpo;
- Raffica di Spine, Freccia Folgorante, Frecce Infuocate;
- Simbolo, il glifo tracciato e poi innescato;
- Sfera congelante con «Trattieni il globo».

Che cosa fa oggi, verificato nel codice:

| Pezzo | Oggi | Dove |
|---|---|---|
| **Preparazione** | spende lo slot, mette una pill sul caster (scritta a mano per ogni incantesimo), chiude le altre concentrazioni e registra la concentrazione **solo se l'incantesimo la richiede** | `getSpellCastPhasePlan`; `spellSlotSpendCore.js` (slot solo nelle fasi «cast» e «prepare») |
| **Risoluzione** | nessuno slot; bersagli scelti in quel momento; la concentrazione o continua («extend») o finisce («dismiss»); rifiutata se la pill preparata non c'è più | `withSpellPhaseTransitionOperations`, `preparedInstanceIsCurrent` |
| **Risoluzione nel pannello** | per Simbolo e Sfera congelante: il pannello passa alla fase «resolve» e l'area si piazza al rilascio | `enterPreparedAreaResolution` in `spell-unified-panel.js` |
| **Risoluzione in un popup** | per punizioni e frecce: un bersaglio dalla mappa, il danno e un esito | `spell-active-resolution.js` |
| **Apertura del popup** | da sola, **solo nel turno del caster**; fuori turno da «Risolvi» nel pannello | `preparedSpellResolutionController.js` |
| **Annulla** | due voci di Cronologia; annullare la risoluzione rimette la pill preparata | `test/spellSlotSpendUndo.test.js` |

La concentrazione e la reazione hanno già quello che serve:

- **Concentrazione:**
  - un lancio con concentrazione chiude le altre, e il pannello chiede conferma;
  - si rompe con il TS fallito (avviso con Superato e Fallito), a 0 PF e
    quando la creatura diventa Incapacitata;
  - una scadenza «inizio del prossimo turno di chi lancia» esiste già: è quella
    di Scudo, e chiudendo l'incantesimo chiude anche la sua concentrazione.
- **Reazione:**
  - `planReactionSpend` aggiunge «Reazione usata» a qualunque comando, con un
    solo Annulla;
  - il pannello ha già il controllo «reazione già usata» per gli incantesimi a
    reazione;
  - la console attacchi ha la casella «Usa la reazione» fuori turno, e si apre
    già con un incantesimo scelto (`openPcAttackPopover`);
  - un incantesimo d'attacco già pagato si registra senza slot (`fromActiveSpell`,
    Tocco del vampiro).

**Tempo di lancio.** È nel riferimento italiano, ma non nel catalogo SRD
caricato a runtime. Serve un elenco degli incantesimi da 1 azione nell'estratto
che esiste già (`spell-reference-it-runtime.json`, che oggi tiene gli id dei
rituali). Quanti sono:

| Fonte | Da 1 azione, livello 1 o più | Di cui a concentrazione |
|---|---:|---:|
| SRD | 220 | 107 |
| PHB 2014, extra | 24 | 12 |
| Supplementi | 77 | 52 |

A questi si aggiungono i trucchetti da 1 azione.

### 9.3 Che cosa manca

1. **Una fase «preparato» per ogni incantesimo da 1 azione.** Oggi le due fasi
   esistono solo per gli incantesimi della tabella, ognuno con la sua pill
   scritta a mano.
2. **La concentrazione anche per chi non la richiede.** Trattenere Palla di
   fuoco è concentrazione: serve un segno nel contesto del lancio, letto dalla
   regola che oggi toglie la concentrazione con la Magia Selvaggia
   (`spellForCastContext`).
3. **La scadenza all'inizio del prossimo turno** per la pill preparata, oggi
   solo manuale o legata alla concentrazione.
4. **Il rilascio con la reazione:** reazione spesa, pill tolta, nessuno slot,
   in un solo comando.
5. **Un rilascio fuori turno.** Il popup di oggi si apre solo nel turno del
   caster: gli incantesimi preparati vanno esclusi da quell'apertura.
6. **Un'area che tiene la concentrazione.** Oggi la risoluzione preparata di
   un'area la chiude sempre: Ragnatela preparata deve restare in
   concentrazione dopo il rilascio.
7. **Controincantesimo alla preparazione.** Oggi la fase «prepara» salta
   l'avviso.
8. **Un incantesimo d'attacco già pagato nella console**, sul modello di Tocco
   del vampiro, che chiuda anche la presa.

### 9.4 Il flusso proposto

**1. Preparazione**, nel turno di chi lancia.

- **Da dove:** il pulsante **Prepara** nel pannello incantesimi, accanto a
  Lancia, solo per gli incantesimi da 1 azione. Oppure scheda Azioni →
  Preparare → **Un incantesimo**, che apre il pannello in quel modo.
- **Che cosa si sceglie:** solo l'incantesimo e il livello dello slot, con il
  menu «Spendi» di oggi.
- **Che cosa succede, in un solo comando:**
  - lo slot si spende;
  - le altre concentrazioni finiscono, con la conferma che il pannello chiede
    già;
  - sul caster va la pill **«Azione preparata · Palla di fuoco (3°)»**, in
    concentrazione, che scade all'inizio del suo prossimo turno;
  - partono l'avviso di Controincantesimo e la Magia Selvaggia, come per ogni
    lancio;
  - nella Cronologia e nel log: «Preparazione: Palla di fuoco».

**2. Attesa.**

- La C della concentrazione è sul token.
- Se il caster subisce danni, l'avviso del TS di concentrazione dice «Palla di
  fuoco (preparata)».

**3. Rilascio: Innesca**, dal menu della card, dal ⚡ della pill o dalla
scheda Azioni.

- **Incantesimo d'attacco** (Dardo tracciante, Raggio rovente, i trucchetti con
  tiro): si apre la console attacchi su quella creatura fuori turno, con
  l'incantesimo già scelto, «Usa la reazione» spuntata e lo slot «già speso
  alla preparazione».
- **Ogni altro incantesimo:** si apre il pannello incantesimi in modo rilascio,
  con lo stesso aspetto di un lancio (bersagli, area, varianti, esiti) e il
  pulsante **Rilascia**.
- **Che cosa succede, in un solo comando:**
  - gli effetti e i danni;
  - la reazione spesa, con la conferma se è già usata;
  - nessuno slot;
  - la pill tolta;
  - la concentrazione **continua** se l'incantesimo la richiede, con la sua
    durata contata dal rilascio; altrimenti **finisce**.
- Nella Cronologia: «Rilascio: Palla di fuoco». L'Annulla torna alla presa.

**4. Perdita.** L'incantesimo svanisce, lo slot resta speso e il log scrive
«Palla di fuoco preparata svanita» quando succede una di queste cose:

- il TS di concentrazione fallisce;
- il caster scende a 0 PF o diventa Incapacitato;
- lancia un altro incantesimo a concentrazione;
- arriva l'inizio del suo prossimo turno.

Sono tutte strade che esistono già: basta che la presa sia una concentrazione
vera.

### 9.5 Casi particolari

| Caso | Proposta |
|---|---|
| Trucchetti (Dardo di fuoco) | si preparano: nessuno slot, la concentrazione sì |
| Incantesimi a concentrazione (Blocca persone, Ragnatela) | dopo il rilascio la concentrazione continua, con la durata dal rilascio; le zone come Ragnatela la tengono anche dopo il piazzamento |
| Più raggi (Raggio rovente) | il primo raggio rilascia; gli altri continuano come oggi, senza slot |
| Varianti (Arma elementale, Protezione dall'energia) | si scelgono al rilascio |
| Incantesimi a due fasi | quelli ad azione bonus sono già esclusi. Sfera congelante, da 1 azione, si prepara nella forma «Scaglia subito», senza doppia fase. Frecce Infuocate e Simbolo restano fuori |
| Annulla della preparazione | restituisce lo slot e la concentrazione che la preparazione aveva chiuso |
| Annulla del rilascio | rimette la presa, la pill e la reazione |
| Turni Paragon | la scadenza «prossimo turno» va provata con i turni in più del Paragon |
| Reazione già usata | la conferma che il pannello chiede oggi agli incantesimi a reazione |
| Online | prepara e rilascia solo il GM, come per ogni lancio |
| Mostri | dalla scheda Incantesimi della console, che passa per il pannello: slot per i mostri con classe, usi per gli innati. La Console Boss in un secondo giro |

### 9.6 Rischi, come chiede AGENTS.md

- **Chiavi della concentrazione:** sono il nome dell'incantesimo.
  `break-targets` diventa una rottura completa quando non resta un bersaglio, e
  l'ordine delle operazioni sotto «extend» e «dismiss» conta.
- **La presa che scade dopo il rilascio:** al rilascio di un incantesimo a
  concentrazione la scadenza «prossimo turno» va riscritta con la durata vera.
  Altrimenti all'inizio del turno dopo finirebbe l'incantesimo appena
  rilasciato.
- **Il ramo «preparato» dell'esecutore delle aree** è condiviso con Simbolo e
  Sfera congelante, che devono restare come sono. La modalità che tiene la
  concentrazione va aggiunta senza cambiare la loro.
- **Il riuso dell'id dell'istanza** dalla concentrazione attiva
  (`spellApplicationExecutor.js`, intorno alla riga 2685).
- **L'ordine dei controlli nel pannello** (`commit`, `commitArea`):
  Controincantesimo e reazione.
- **Il menu della card in `initiativeList.js`**, delicato: Innesca deve
  riconoscere la presa di un incantesimo.
- **I test del controller** che apre i popup nel turno del caster.

### 9.7 Lotti

| Lotto | Contenuto |
|---|---|
| **T6a** | elenco degli incantesimi da 1 azione nell'estratto, con il test; fase «preparato» generica; concentrazione forzata; pill «Azione preparata · …» con la scadenza al prossimo turno |
| **T6b** | **Prepara** nel pannello e da Azioni → Preparare; slot, concentrazione, Controincantesimo e Magia Selvaggia alla preparazione |
| **T6c** | rilascio nel pannello per gli incantesimi senza tiro per colpire; area che tiene la concentrazione; Innesca dal menu e dal ⚡; esclusione dal popup del turno |
| **T6d** | rilascio nella console attacchi per gli incantesimi d'attacco, già pagati |
| **T6e** | le perdite (TS, 0 PF, Incapacitato, altra concentrazione, prossimo turno, Paragon) con la riga nel log; l'avviso del TS che dice «preparata» |
| **T6f** | la Console Boss |

Ogni lotto ha test che falliscono senza la patch, la CI completa su una copia
pulita, le voci in `PROVE_IN_STANZA.md` e la prova in vista compatta ed estesa.

### 9.8 Decisioni per l'utente

**Decisione dell'utente del 15/11:** P1–P12 approvate come raccomandate.

| # | Decisione | Raccomandazione |
|---|---|---|
| P1 | Da dove si prepara | **Prepara** nel pannello incantesimi, solo per gli incantesimi da 1 azione, e scheda Azioni → Preparare → Un incantesimo |
| P2 | Che cosa si sceglie alla preparazione | solo incantesimo e livello dello slot; bersagli, area e varianti al rilascio |
| P3 | Slot | speso alla preparazione e perso se l'incantesimo svanisce; l'Annulla della preparazione lo restituisce |
| P4 | Concentrazione durante la presa | è concentrazione vera: chiude le altre con la conferma di oggi; la C e l'avviso del TS dicono «preparata» |
| P5 | Una sola azione preparata | la pill dell'incantesimo **è** l'«Azione preparata» della creatura, così il menu della card la riconosce e Innesca porta al rilascio |
| P6 | Rilascio | Innesca apre la console per gli incantesimi d'attacco e il pannello per gli altri; reazione spesa, nessuno slot, pill tolta, un solo Annulla |
| P7 | Concentrazione dopo il rilascio | continua se l'incantesimo la richiede, con la durata dal rilascio; altrimenti finisce |
| P8 | Perdita | TS fallito, 0 PF, Incapacitato, altra concentrazione, inizio del prossimo turno: svanisce, lo slot resta speso, una riga nel log |
| P9 | Controincantesimo | l'avviso parte alla **preparazione**, il momento del lancio; al rilascio no |
| P10 | Chi vede la pill | quella di un PG tutti; quella di un nemico solo il GM, come Nascosto |
| P11 | Trucchetti | si preparano: concentrazione sì, slot no |
| P12 | Mostri | dalla console nel primo giro; la Console Boss in T6f |

---

## 10. Audit delle capacità che toccano le azioni (D10)

Il 15/11 sono state passate tutte le fonti del plugin:

- le 860 capacità di classe del catalogo, con le correzioni e i testi;
- i 516 tratti di specie;
- i cataloghi degli extra al colpo, delle attivazioni e delle reazioni;
- l'import dei mostri, i profili della Console Boss e il codice di Lotta e
  Spinta.

**Che cosa non c'è nel plugin:**

- **i talenti:** non esiste un catalogo, quindi Mobile, Sentinella, Furtivo,
  Lottatore e Maestro degli scudi mancano;
- **le capacità di classe facoltative di Tasha:** i dati di Tasha hanno solo le
  sottoclassi;
- **niente che dia o cambi Preparare.**

### 10.1 Capacità che danno un'azione

Sono tutte solo testo, tranne dove è detto.

| Capacità | Fonte | Che cosa dà | Oggi | Proposta |
|---|---|---|---|---|
| Azione Scaltra | ladro 2 | Scatto, Disimpegno o Nascondersi come azione bonus | testo | tre pulsanti che fanno le stesse azioni (T4a) |
| Difesa Paziente | monaco 2 | Schivata, azione bonus, 1 ki | pill «Schivata» fino al prossimo turno, che nessuno legge | conta da T1: la console mostra lo svantaggio |
| Passo del Vento | monaco 2 | Scatto o Disimpegno, azione bonus, 1 ki | spende il ki e basta | scelta fra le due azioni, nello stesso comando del ki (T4a) |
| Tecnica dell'Ubriaco | Maestro Ubriaco 3 | Disimpegno con la Raffica, +3 m | pill con +3 m; il Disimpegno è testo | la sua pill fa anche da Disimpegno (T4a) |
| Spirito Totemico: Aquila | barbaro totem 3 | Scatto come azione bonus in Ira; svantaggio agli attacchi di opportunità contro | pill messa con l'Ira | pulsante Scatto (T4a); lo svantaggio resta testo |
| Passo Veloce | ranger rivisto 8 | Scatto come azione bonus | testo | T4a |
| Svanire | ranger 14 e rivisto | Nascondersi come azione bonus | testo | T4a |
| Maestro di Tattiche | Pianificatore 3 | Aiuto come azione bonus, fino a 9 m | testo | T4a |
| Fuga agile | goblin | Disimpegno o Nascondersi come azione bonus | testo | T4a |
| Scarica di adrenalina | orco | Scatto come azione bonus, con PF temporanei | spende l'uso e dà i PF | aggiunge lo Scatto allo stesso comando (T4a) |
| Aggressivo | orco (Volo) | azione bonus: muoversi fino alla velocità verso un nemico | testo | pulsante Scatto (T4a) |
| Dono fatato | hobgoblin | Aiuto come azione bonus, con opzioni dal 3° livello | pill «Aiutato» sull'alleato | allineato all'Aiuto generico (§10.6, A5) |
| Mostri: Fuga agile, Azione Scaltra, Furtività dell'ombra | 5eTools | Disimpegno, Nascondersi o Scatto come azione bonus | testo nella scheda Capacità | il mostro usa la scheda Azioni |
| Compagno del Ranger, Addestramento Straordinario | Signore delle Bestie | la bestia fa Scatto, Disimpegno, Schivata, Aiuto | pill coi dati della bestia; testo | la bestia, con il suo token, usa la scheda Azioni |
| Creazione Animata, Spirito della Fiamma, famiglio del Patto della Catena | bardo, druido, warlock | l'evocato schiva, o aiuta, se non riceve ordini | testo | come sopra: il token usa Azioni |

Restano fuori:

- Mani Veloci (Usare un oggetto come azione bonus) e Occhio per i Dettagli
  (Cercare come azione bonus): le due azioni sono fuori (D2);
- la Mano Magica del Mistificatore;
- Azione Impetuosa del guerriero, un'azione in più di qualunque tipo: senza
  conteggio delle azioni non c'è niente da fare.

### 10.2 Capacità che cambiano un'azione

- **Velocità che lo Scatto raddoppia.** Il riquadro movimento calcola già
  velocità × (1 + scatti), compresi i bonus delle pill: Movimento Veloce del
  barbaro, Virtuosismo della Lama, Melodia della Lama, Aura di Alacrità,
  Imboscata Terrificante.
- **Velocità solo nel testo.** Lo Scatto non le raddoppia perché non le conosce:
  Movimento Senza Armatura del monaco, Mobilità Superiore dell'Esploratore,
  Agilità felina del tabaxi. È un seguito possibile, fuori da questi lotti.
- **Restano testo:** Carica incornante del minotauro (dopo uno Scatto di 6 m,
  un attacco con le corna) e Occhio di Lince dell'Indagatore (vantaggio quando
  Cerca).

### 10.3 Attacchi di opportunità e Disimpegno

Oggi gli avvisi di attacco di opportunità saltano solo la pill «Movimento: no
AdO». Le capacità che fanno muovere senza provocarli sono tutte testo:

| Capacità | Effetto | Proposta |
|---|---|---|
| Balsamo della Pace (chierico della Pace) | muoversi senza AdO, con l'Incanalare Divinità | pill Disimpegno fino a fine turno (T4b) |
| Magia Tempestosa (stregone della Tempesta) | volare 3 m senza AdO | T4b |
| Salto del coniglio (harengon) | un salto senza AdO | T4b |
| Mutazione: Passo rapido (shifter) | 3 m con la reazione senza AdO | T4b |
| Vendicatore Implacabile (paladino della Vendetta) | dopo un AdO a segno, mezza velocità senza AdO | T4b |
| Schermagliatore (ladro Esploratore) | con la reazione, mezza velocità senza AdO | T4b |
| Manto di Ispirazione (bardo dell'Incanto) | gli alleati si muovono con la reazione senza AdO | T4b, sugli alleati scelti |
| Attacco con Manovra (Maestro di Battaglia) | un alleato si muove di mezza velocità senza AdO dal bersaglio | T4b, sull'alleato |
| Gioco di Gambe (ladro Spadaccino) | niente AdO dalla creatura attaccata in mischia | resta testo: vale per una sola creatura |
| Sfuggire all'Orda (ranger Cacciatore), Spirito Totemico: Aquila | svantaggio agli AdO contro | resta testo: gli avvisi non tirano dadi |
| Mantenere la Posizione, Difensore Vigile (Cavaliere Errante) | AdO in più, o anche per 1,5 m | restano testo e note |

Alcune di queste valgono per un solo movimento, non per tutto il turno. Una
pill che dura fino a fine turno è un'approssimazione che il GM può togliere.

### 10.4 Nascosto e invisibile

- **Il nome.** Il ranger rivisto ha già la pill «Nascosto in Piena Vista».
  La pill nuova si chiama «Nascosto» (D7) e non va confusa con quella.
- **Pill «Invisibile» delle classi.** Oggi finiscono quando si attacca solo nel
  testo. Con il meccanismo di Passo nascosto (`endsOnAttack`) potrebbero finire
  da sole (T4c):
  - Manto di Ombre del chierico dell'Inganno;
  - Manto di Ombre del monaco della Via dell'Ombra;
  - Velo Psichico del Lama Psichica;
  - Fuga Velata del warlock del Signore Fatato.

  **Corpo Vuoto** no: dura 1 minuto e non finisce attaccando.
- **Attacco Furtivo** è nella console senza controllo del vantaggio, e resta
  così. La pill Nascosto o Aiuto lo ricorda già a chi guarda.
- **Restano testo:** Maschera della Selva dell'elfo, Furtività innata
  dell'halfling, Furtività Suprema, Percezione Cieca, Sensi Ferini.

### 10.5 Lotta e Spinta

- **Lo spostamento in Azioni (D1)** non cambia il comando: esito, Afferrato con
  chi afferra, CD di fuga dei mostri, fuga e rilascio, Prono.
- **I vantaggi alla prova** (Ira, Potenza del Gigante, Atleta Impareggiabile e
  simili) sono nelle pill o nel testo. Mostrarli nella nota della manovra è un
  seguito possibile, fuori da questi lotti.
- **Le spinte e le trazioni** delle capacità (Attacco con Spinta, Pugno
  dell'Aria Inviolabile, Deflagrazione Respingente…) restano note «Sposta…»,
  come oggi.
- **I mostri e la Console Boss** hanno già prese, lanci e Prono automatici.

### 10.6 Pill di «prossimo attacco con vantaggio»: un meccanismo solo

Più capacità e incantesimi mettono una pill che dà vantaggio al prossimo
attacco, e oggi si toglie a mano:

| Pill | Da | Chi la consuma |
|---|---|---|
| Aiuto in attacco (nuova, D6) | azione Aiuto | il primo attacco di un alleato contro quel bersaglio |
| Colpo Distraente | Maestro di Battaglia | il primo attacco di un'altra creatura contro il bersaglio, prima del prossimo turno del guerriero |
| Dardo tracciante | incantesimo | il prossimo attacco contro il bersaglio |
| Attacco con Finta | Maestro di Battaglia | il prossimo attacco del guerriero in quel turno |
| Ingannatore Versatile | Mistificatore Arcano | il prossimo attacco del ladro contro quella creatura nel turno |

Propongo **un meccanismo solo**, in T2 insieme all'Aiuto: la pill dice chi la
consuma, e la console la toglie nello stesso passo dell'attacco. Si chiude così
il «rimuovere l'etichetta dopo l'attacco» che oggi è scritto nella pill di
Dardo tracciante.

**Il nome delle pill di Aiuto (A5).** «Aiuto» è già la pill dell'incantesimo
Aiuto, quello dei PF massimi, e le pill si riconoscono dal nome. Propongo:

- **«Aiutato»** sull'alleato per l'aiuto a una prova, come fa già Dono fatato;
- **«Bersaglio dell'aiuto»** sul nemico per l'aiuto in attacco;
- Dono fatato usa le stesse due pill: oggi mette sempre «Aiutato»
  sull'alleato, anche per l'attacco.

### 10.7 Dati da correggere, trovati con l'audit

| Che cosa | Oggi | Corretto |
|---|---|---|
| Indagatore (Xanathar) | Occhio di Lince (passiva) al 13°, Occhio Infallibile (azione) al 9° | al contrario: la passiva al 9°, l'azione al 13° |
| Nascondersi in Piena Vista (ranger 10) | attivazione «reazione» | 1 minuto di preparazione |
| Tutt'Uno con le Ombre (warlock) | attivazione «reazione» | azione |
| Compagno Animale e Nascondersi in Piena Vista (ranger rivisto) | «implementate» senza adattatore | da ricontrollare |
| Mostri, scheda Capacità | mostra Tratti, Reazioni e Azioni leggendarie | mancano le Azioni bonus degli statblock 2024, come Fuga agile dei goblin 2024 |

### 10.8 Lotti dell'audit

| Lotto | Contenuto |
|---|---|
| **T4a** | capacità che danno un'azione come azione bonus: Azione Scaltra, Passo del Vento, Passo Veloce, Svanire, Maestro di Tattiche, Fuga agile, Scarica di adrenalina, Aggressivo, Spirito Totemico: Aquila, Tecnica dell'Ubriaco. Ognuna fa la stessa azione della scheda Azioni, con il suo costo (ki, usi) nello stesso comando |
| **T4b** | capacità che fanno muovere senza attacchi di opportunità: la pill Disimpegno fino a fine turno, su chi si muove |
| **T4c** | pill «Invisibile» delle classi che finiscono quando si attacca (Corpo Vuoto escluso) |
| **T2** (esteso) | il meccanismo unico delle pill di «prossimo attacco con vantaggio» (§10.6) |
| **TD** | i dati del §10.7, in un lotto a sé |

### 10.9 Decisioni dell'audit

| # | Decisione | Raccomandazione |
|---|---|---|
| A1 | Capacità con azioni bonus | T4a con l'elenco del §10.8 |
| A2 | Movimento senza attacchi di opportunità | T4b: pill Disimpegno fino a fine turno; Gioco di Gambe e gli svantaggi agli AdO restano testo |
| A3 | Invisibilità delle classi | T4c: finisce attaccando, Corpo Vuoto escluso |
| A4 | Pill di «prossimo attacco con vantaggio» | un meccanismo solo in T2: Aiuto, Colpo Distraente, Dardo tracciante, Attacco con Finta, Ingannatore Versatile |
| A5 | Nomi delle pill di Aiuto | «Aiutato» sull'alleato, «Bersaglio dell'aiuto» sul nemico; Dono fatato si allinea |
| A6 | Dati da correggere | lotto TD a sé |
| A7 | Talenti (Mobile, Sentinella…) | fuori: il plugin non ha un catalogo dei talenti |
