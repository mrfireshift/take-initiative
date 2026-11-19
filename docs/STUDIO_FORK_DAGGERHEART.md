# Studio — Fork di Take Initiative per Daggerheart

Data: 2026-11-19. Studio in sola lettura: nessun file di `src/`, `public/` o `data/` è stato modificato.

> Domanda dell'utente: il prossimo studio è un fork per una conversione integrale del plugin a Daggerheart di
> Darrington Press. Con i manuali correnti, le schede dei personaggi e le carte delle capacità: A) studiare a fondo
> il sistema; B) capire le differenze rispetto alla 5E 2014; C) individuare quali sottosistemi di Take Initiative
> vadano mantenuti, quali modificati, quali eliminati e quali converrebbe riscrivere da zero.

## Indice

1. [In breve](#1-in-breve)
2. [Fonti e metodo](#2-fonti-e-metodo)
3. [A — Il sistema Daggerheart](#3-a--il-sistema-daggerheart)
4. [B — Differenze rispetto alla 5E 2014](#4-b--differenze-rispetto-alla-5e-2014)
5. [Take Initiative oggi](#5-take-initiative-oggi)
6. [C — Sottosistema per sottosistema](#6-c--sottosistema-per-sottosistema)
7. [Architettura proposta per il fork](#7-architettura-proposta-per-il-fork)
8. [Fasi e lotti](#8-fasi-e-lotti)
9. [Decisioni](#9-decisioni)
10. [Rischi e punti aperti](#10-rischi-e-punti-aperti)
11. [Glossario italiano–inglese](#11-glossario-italianoinglese)

---

## 1. In breve

**A — Il sistema.** Daggerheart è un gioco narrativo in cui il software può essere solo il contabile, mai l'arbitro
(regola d'oro). Le sue meccaniche si reggono su sei pilastri:

- il **protagonismo** al posto dell'iniziativa;
- i **Dadi Dualità** (2d12 Speranza/Paura, cinque esiti), con la **Speranza** dei PG (fino a 6) e la **Paura** del GM
  (fino a 12, visibile);
- **PF a caselle** che si segnano secondo **soglie** (1/2/3 PF), con **Caselle Armatura** che abbassano la gravità e
  lo **Stress** come seconda barra e come valuta;
- le **carte dominio** al posto degli incantesimi (dotazione di 5, Costo di Richiamo, costi in Speranza e Stress,
  niente slot né concentrazione);
- le **distanze a bande** (Mischia, Prossima, Ravvicinata, Lontana, Remota) al posto dei metri;
- i **conti alla rovescia** come orologio di tutto ciò che non è un tiro.

Il bestiario conta 263 avversari in 10 tipi e 47 ambienti; i personaggi 13 classi, 24 origini, 15 comunità e 210
carte dominio (Manuale Base più *Hope & Fear*).

**B — La differenza con la 5E.** Nella 5E il tempo avanza a **turni**; in Daggerheart avanza a **tiri**: ogni tiro
azione dei PG genera Speranza o Paura, decide se il gioco passa al GM, fa scendere i conti alla rovescia e attiva i
privilegi che leggono l'esito. Spariscono iniziativa, round, economia d'azione, CA, tiri salvezza, slot, concentrazione,
durate in round, tipi di danno multipli, PF temporanei, TS contro morte, velocità, coni misurati, azioni leggendarie.
Arrivano l'economia Speranza/Paura, la fase del GM pagata in Paura, le soglie con le caselle armatura, lo Stress, la
dotazione delle carte, gli ambienti, Orde e Seguaci. Il valore del plugin (lo schermo del tavolo, la chiarezza, la
sincronizzazione) resta; il catalogo di regole 5E no.

**C — I sottosistemi.** Sulle 224.000 righe di `src/`:

- **mantenere** circa il 17%: infrastruttura e sync, cronologia e undo, opzioni, giocatori, popover, pill, aure,
  PF condivisi, elevazione, motori del compendio e delle animazioni;
- **modificare** circa il 18%: card e render, condizioni, barre a caselle, memoria dei vitali, geometria delle aree e
  zone, dadi (che diventano il centro), orologi (che diventano conti alla rovescia), distanza a bande, registro,
  avvisi di reazione;
- **riscrivere da zero** circa il 27%: hub del tracker (che diventa una **bacheca del protagonismo**), avviso di turno,
  operazioni delle mutazioni, console dei danni, console del tiro, console dell'avversario, scheda PG, risorse di classe,
  trasformazioni, interludio, import;
- **eliminare** circa il 40%: incantesimi (da soli il 35% del codice), reminder dei TS, TS contro morte, 5eTools,
  talenti, specie, magia selvaggia, leggendarie/Paragon/Epic, boss specifici, tracker della velocità.

Il fork a regime starebbe tra 100.000 e 110.000 righe, circa metà di oggi.

**Raccomandazione**: un **repository separato con un namespace nuovo**, costruito attorno all'evento «tiro risolto»;
prima una versione giocabile di sola contabilità (fasi F0–F5: potatura, vitali e danni, bacheca e Paura, tiri, conti
alla rovescia, interludi), poi carte, classi, avversari e mappa. La decisione che pesa di più è **D4**, cioè come
entrano gli esiti dei tiri al tavolo con i dadi fisici: senza quell'informazione l'automazione si ferma. Le dodici
decisioni di §9 sono state **approvate tutte il 2026-11-19** nella forma raccomandata (D4: un tocco sull'esito al
tavolo, Dadi Dualità nativi online).

---

## 2. Fonti e metodo

### 2.1 Fonti lette

| Fonte | Pagine | Contenuto |
| --- | --- | --- |
| `Daggerheart (ITA).pdf` | 379 | Manuale Base, edizione italiana Acheron Games: creazione, 9 classi, 18 origini, 9 comunità, regole, GM, avversari, ambienti, 6 modelli di campagna, carte dominio in appendice. |
| `ITA_Daggerheart-Hope-and-Fear_DIGITALE_001.pdf` | 208 | Espansione *Hope & Fear*: 4 classi (Assassino, Lottatore, Strega, Warlock), dominio del Terrore, 6 origini, 6 comunità, 6 trasformazioni, equipaggiamento, avversari, ambienti, 4 modelli di campagna. |
| `Daggerheart - Carte Stampabili.pdf` | 30 | Carte del Manuale Base con il testo integrale. |
| `CARDS_DH-HF_BIANCO_Acheron_ITA_A4_001.pdf` | 7 | Carte di *Hope & Fear*. |
| `Daggerheart - Schede Personaggi.pdf` | 22 | Schede per classe del Manuale Base. |
| `Daggerheart - Schede Aggiuntive.pdf` | 17 | Estensioni della scheda (multiclasse e altre). |
| `DH-HF-Scheda-e-Guida-PG_ITA_001.pdf` | 9 | Schede e guide delle classi di *Hope & Fear*. |

Le pagine citate in questo documento sono quelle **del libro** (nel PDF del Manuale Base la pagina del libro è la
pagina del file meno 2; lo stesso scarto vale per *Hope & Fear*).

### 2.2 Metodo

- Il testo è stato estratto dai PDF con `pdftotext` (con e senza layout); le pagine con dati solo disegnati
  (caselle, schede) sono state guardate come immagini, rese con l'API PDF di Windows.
- Ho letto di persona le parti che decidono l'architettura: flusso del gioco e protagonismo, Dadi Dualità, tiri,
  danni e soglie, Stress, armatura, condizioni, distanze e movimento, carte dominio, interludi, morte, regole
  aggiuntive, meccaniche del GM (mosse, Paura, Difficoltà, tiri degli avversari, conti alla rovescia, PNG, regole
  opzionali). Libro p.87–110, p.114–116, p.150–170.
- Quattro agenti hanno catalogato il resto in parallelo, con conteggi: carte dominio (Manuale Base e *Hope & Fear*),
  opzioni dei personaggi e schede, avversari e ambienti, inventario del codice di Take Initiative. I loro rapporti
  completi sono stati sintetizzati qui; dove un conteggio viene da un agente lo dico.
- Il confronto con la 5E si appoggia alle regole PHB 2014 già codificate nel plugin (memoria e documenti in `docs/`).

### 2.3 Ecosistema

- **Licenza.** Darrington Press ha pubblicato l'SRD di Daggerheart 1.0 sotto la *Darrington Press Community Gaming
  License* (DPCGL); la pagina della licenza indica un aggiornamento che copre anche *Hope & Fear*. Esistono versioni
  JSON dell'SRD fatte dalla comunità, solo in inglese. Il fork resta per uso privato come il plugin (la parte licenze
  dello standalone è già stata rimandata per lo stesso motivo), ma la scelta della fonte dei dati conta (§9, D7).
- **Owlbear Rodeo.** Non risulta un tracker completo per Daggerheart: esistono contatori di risorse generici con
  Speranza e Paura, un'estensione di token con i Dadi Dualità e componenti simili su altre piattaforme (Foundry,
  Roll20). Un fork completo di Take Initiative non avrebbe un equivalente.

---

## 3. A — Il sistema Daggerheart

Daggerheart è un gioco narrativo a «conversazione»: il GM presenta la situazione, tutti fanno domande, i giocatori
dichiarano mosse, i dadi intervengono solo quando l'esito è in dubbio e ogni tiro cambia la scena («la storia è una
conseguenza», p.95). La regola d'oro e il «buonsenso contro le regole» (p.7) autorizzano il GM a piegare qualsiasi
regola alla finzione: un software non deve mai essere l'arbitro, solo il contabile.

### 3.1 Protagonismo al posto dell'iniziativa

Il punto che più tocca un tracker d'iniziativa (p.89, p.100, p.151–158):

- **Non c'è ordine d'iniziativa, né turni, né azioni contate.** Il *protagonista* (spotlight) passa organicamente tra
  i PG. I PG continuano a fare mosse finché **un tiro fallisce, esce con Paura, oppure il GM spende 1 Paura per
  interromperli**.
- Allora il gioco passa al **turno del GM**: una mossa del GM (gratuita), più **1 Paura per ogni mossa aggiuntiva**.
  Il caso tipico è «rendere protagonista un avversario»; con N Paure il GM ne attiva N in più, di norma **non lo
  stesso avversario due volte nello stesso turno**. Quando il GM ha finito, il gioco torna ai PG («Cosa fate?»).
- Un avversario protagonista di solito: si muove entro **Ravvicinata** e attacca; oppure si muove entro Ravvicinata e
  usa una sua azione; oppure rimuove una condizione; oppure si sposta fino a **Lontana** o **Remota**.
- Durante il turno del GM i PG non usano privilegi a costo o con tiri, salvo reazioni e privilegi che interrompono
  attacchi o danni.
- **Strumento facoltativo «Azioni dei protagonisti»** (p.89): per tavoli tattici, ogni PG mette 3 gettoni azione a
  inizio battaglia e ne toglie uno per ogni tiro azione o azione significativa; quando tutti li hanno esauriti, si
  ricaricano. È l'unica forma di «giro» prevista dal manuale ed è opzionale.
- Esiste comunque un'idea di equità: tutti devono ricordare chi è già stato protagonista e dare spazio a ogni PG.

Conseguenza per il plugin: l'ordine d'iniziativa, il turno attivo e il round — il cuore di Take Initiative — non
esistono nel gioco. Esistono invece due fasi alternate (PG / GM), una riserva di Paura che decide quanti avversari si
attivano, e il bisogno di vedere chi ha già agito.

### 3.2 Dadi Dualità e risultati

- Il giocatore tira **2d12 di colore diverso**: Dado Speranza e Dado Paura (p.90). Totale = somma dei due + tratto +
  modificatori (contati come gettoni) ± dadi vantaggio/svantaggio.
- **Con Speranza** (Speranza > Paura): il PG guadagna 1 Speranza, anche se fallisce. **Con Paura**: il GM guadagna 1
  Paura e c'è una complicazione, anche se riesce. **Successo critico** (due d12 uguali): successo anche sotto la
  Difficoltà, +1 Speranza, rimuove 1 Stress; su un attacco, danni extra.
- Cinque esiti con frasi di riferimento (p.94, p.152): critico; successo con Speranza («Sì, e…»); successo con Paura
  («Sì, ma…»); fallimento con Speranza («No, ma…»); fallimento con Paura («No, e…»). Fallimento o Paura passano il
  gioco al GM.
- **Speranza**: massimo 6, si conserva tra le sessioni. Si spende per Aiutare un Alleato (1 Speranza: l'alleato
  aggiunge un dado vantaggio d6; con più fonti si tiene il d6 più alto), Utilizzare un'Esperienza (1 Speranza per
  Esperienza: +modificatore), Iniziare un Tiro Combinato (3 Speranze, una volta per sessione per chi lo inizia),
  Attivare un Privilegio della Speranza (ogni classe ne ha uno da 3 Speranze). La Speranza guadagnata con il tiro
  stesso si può spendere subito sul privilegio di quel tiro.
- **Vantaggio/svantaggio** = +d6 / −d6; si annullano uno a uno e non si sommano tra loro (p.100). Per i PNG: un d20
  in più, si tiene il migliore o il peggiore (p.162).
- I bonus si dichiarano **prima** di tirare (p.94). Alcuni privilegi si attivano **dopo** l'esito e prima delle
  conseguenze («Dadi Preghiera» del consacrato, «Ali» del Fatato, «Carisma Infinito») (p.109). Un rilancio obbliga
  ad accettare il nuovo risultato.

### 3.3 Tipi di tiro

| Tiro | Regola (pagina) |
| --- | --- |
| Tiro azione | Tratto scelto dal GM, Difficoltà aperta o segreta, quattro fasi (p.92–94). |
| Tiro su un Tratto | «Tiro Agilità (12)»: il numero tra parentesi è la Difficoltà (p.96). Un privilegio su un tratto vale per ogni tiro con quel tratto, attacchi compresi. |
| Tiro attacco | Tiro azione con il tratto dell'arma contro la **Difficoltà** dell'avversario; un solo bersaglio di base; con più bersagli un solo tiro confrontato con ciascuna Difficoltà. Senz'armi: Forza o Astuzia, d4 × Competenza fisici (p.96). |
| Tiro Incantesimo | Usa il **tratto da Incantatore** dato dalla sottoclasse; solo per effetti scritti su carte o scheda; se danneggia è anche un tiro attacco (p.96). |
| Tiro reazione | In risposta a un pericolo; tratto indicato dal GM; **non genera Speranza né Paura**, nessuno può aiutare; il critico ignora l'effetto ma non dà Speranza né toglie Stress (p.99). |
| Tiro di gruppo | Un leader tira l'azione, gli altri tirano reazioni: +1 al leader per ogni successo, −1 per ogni fallimento (p.97). |
| Tiro Combinato | 3 Speranze, una volta per sessione: due tiri, si sceglie quale applicare a entrambi; con Speranza +1 Speranza a ogni PG coinvolto, con Paura +1 Paura al GM per ogni PG; se sono attacchi riusciti, i danni si sommano (p.97). |
| Tiri del GM | d20 + modificatore d'attacco contro l'**Evasione** del PG; 20 naturale = successo automatico e critico; i tiri reazione degli avversari sono d20 contro la Difficoltà dell'effetto, e una Paura aggiunge un'Esperienza (p.150, p.162–163). |
| Tiro del fato | Facoltativo: il giocatore tira solo il Dado Speranza o il Dado Paura per decidere un evento fuori dalla sua influenza (p.170). |

### 3.4 Il personaggio in numeri

- **Sei tratti**: Agilità, Forza, Astuzia, Istinto, Presenza, Conoscenza (dettagli e valori iniziali in §3.10).
- **Evasione**: Difficoltà di ogni tiro che una creatura fa contro il PG; base dalla classe, modificata da carte,
  equipaggiamento, condizioni (p.91).
- **Esperienze**: frasi libere con un modificatore (di solito +2), attivate con 1 Speranza; usarne sempre la stessa
  è scoraggiato.
- **Competenza** (Proficiency): da 1 a 6 nella campagna; è il **numero di dadi di danno** dell'arma (p.98). Un
  incantesimo può usare invece il valore del tratto da Incantatore come numero di dadi.
- **Livelli 1–10**, raggruppati in **Ranghi** (Tier) che entrano nelle formule degli interludi («1d4 + rango»).

### 3.5 Danno, Punti Ferita, soglie, armatura

- **I Punti Ferita si segnano**, non si sottraggono: il danno tirato si confronta con le **soglie** e fa perdere
  1, 2 o 3 PF (p.91):
  - sotto la soglia Maggiore → **Minore**, 1 PF;
  - da Maggiore a sotto Grave → **Maggiore**, 2 PF;
  - da Grave in su → **Grave**, 3 PF;
  - regola opzionale **Danno Massiccio**: dal doppio della soglia Grave in su, 4 PF.
- Le soglie del PG = soglie base dell'armatura + livello; senza armatura, Maggiore = livello e Grave = 2 × livello
  (p.116). Esempio: cotta di maglia 7/15 al livello 1 → 8/16.
- **Caselle Armatura**: il Punteggio di Armatura (massimo 12) è il numero di caselle; quando si subisce danno si può
  segnare **una sola** casella per colpo e ridurre la gravità di un grado (Grave → Maggiore → Minore → nessuno). Le
  caselle si liberano negli interludi. L'armatura temporanea aggiunge caselle che spariscono a fine effetto (p.116).
- **Danno diretto**: non riducibile con le Caselle Armatura (p.99).
- **Tipi**: fisico e magico. **Resistenza** dimezza prima delle soglie, più fonti uguali contano una volta;
  **immunità** annulla; resistenza e immunità si applicano prima dell'armatura; un danno misto beneficia della
  resistenza solo se si resiste a entrambi i tipi (p.99).
- Più danni inflitti nella stessa mossa si **sommano prima** del confronto con le soglie; un secondo attacco è una
  mossa separata (p.98).
- **Danni**: dadi dell'arma × Competenza + modificatore fisso (non moltiplicato). **Critico**: valore massimo dei
  dadi + tiro normale + modificatore (p.98; per il GM lo stesso, p.150).
- Un danno ridotto a 0 non fa perdere PF. Con l'ultimo PF si sceglie una **mossa finale** (§3.9).
- Arrotondamento sempre per eccesso (p.109).

### 3.6 Stress

- Caselle sulla scheda (p.92). Molte mosse chiedono di **segnare Stress**; il GM può offrirlo come prezzo di un
  successo o per evitare una complicazione; alcuni avversari lo infliggono.
- Segnare l'**ultimo** Stress rende **Vulnerabili** finché non se ne rimuove almeno 1.
- Lo Stress che non trova caselle libere si converte in **1 PF** (non uno per casella mancante).
- Non si può usare una mossa a costo Stress senza caselle libere; non si paga due volte lo stesso privilegio per
  raddoppiarne l'effetto sullo stesso tiro (p.109), a meno che il privilegio sia un'attivazione ripetibile
  («spendi 3 Speranze per liberare 2 Caselle Armatura» si può fare due volte).

### 3.7 Condizioni ed effetti temporanei

- **Tre condizioni di base** (p.102): **Nascosto** (attacchi contro di lui con svantaggio; finisce se attacca o entra
  nella linea di vista), **Trattenuto** (non può muoversi, può agire), **Vulnerabile** (attacchi contro di lui con
  vantaggio). Le carte definiscono **condizioni speciali** con il loro testo. La stessa condizione non si cumula.
- **Temporanee**: un PG le rimuove con un tiro azione (Difficoltà del GM); un avversario le rimuove quando il GM lo
  rende protagonista per farlo, senza tiro. **Speciali**: finiscono solo col requisito scritto.
- Gli effetti non-condizione «temporanei» si chiudono allo stesso modo: quelli messi dai PG sugli avversari li chiude
  il GM spendendo lo spotlight; quelli del GM li chiude un PG con un tiro azione.
- **Durate testuali** che ricorrono: fino al prossimo riposo; fino al prossimo riposo lungo; fino alla fine della
  scena; una volta per riposo / riposo lungo / sessione; finché non si spende un gettone sulla carta; nessuna durata
  (dura finché il lanciatore o la storia lo interrompono; resta attivo anche se la carta torna in riserva, p.109).
- **Non esiste concentrazione**: più incantesimi possono restare attivi insieme (p.96, p.101).

### 3.8 Distanze, mappa, movimento

- **Sei categorie** (p.103): **Mischia** (contatto, ~1 m), **Prossima** (1,5–3 m), **Ravvicinata** (3–9 m),
  **Lontana** (9–30 m), **Remota** (30–90 m), **Fuori Portata**. Non vanno misurate con precisione: la mappa si adatta
  alla finzione.
- **Regola opzionale Distanze precise** (p.104), griglia da 2,5 cm: Mischia 1 casella, Prossima 3, Ravvicinata 6,
  Lontana 12, Remota 13+, Fuori Portata fuori mappa.
- Gittata misurata dalla fonte; un effetto vale anche più vicino. Forme: «tutti gli avversari di fronte a te» =
  semicerchio di 180°; «lungo una linea»; **gruppo = bersagli entro Prossima da un punto scelto** (p.105).
- **Movimento**: un PG che fa un tiro azione può anche spostarsi entro Ravvicinata; oltre, o come azione a sé, serve un
  tiro Agilità. Un avversario si sposta entro Ravvicinata insieme alla sua azione, oppure fino a Lontana/Remota con
  l'intera azione e senza tiro (p.104–105). **Non esiste una velocità in metri**.
- Copertura = svantaggio agli attacchi; dietro un muro solido non si è bersagliabili; linea di vista; l'oscurità alza
  la Difficoltà o dà svantaggio.
- Facoltative: sott'acqua svantaggio agli attacchi e conto alla rovescia del respiro (3+); cadute: Prossima 1d10+3,
  Ravvicinata 1d20+5, Lontana/Remota 1d100+15 o morte; collisione 1d20+5 diretti (p.170).

### 3.9 Interludi, riposi, morte, oro

- **Riposo breve** (circa un'ora; al massimo tre prima di un lungo): si scambiano le carte, poi **due mosse** a scelta
  (anche la stessa due volte): Curare Ferite (1d4 + rango PF, o a un alleato), Rimuovere Stress (1d4 + rango),
  Riparare Armature (1d4 + rango caselle, o a un alleato), Prepararsi (+1 Speranza, +2 a testa se insieme ad altri).
  Il GM guadagna **1d4 Paura** (p.107).
- **Riposo lungo**: due mosse tra Curare Tutte le Ferite, Rimuovere Tutto lo Stress, Riparare Tutte le Armature,
  Prepararsi, Lavorare a un Progetto (che di solito avanza un conto alla rovescia). Il GM guadagna **1d4 + numero di
  PG** Paure e può far avanzare un conto alla rovescia a lungo termine. Un riposo lungo interrotto vale come breve.
- **Privilegi di sessione**: tornano all'inizio della sessione successiva, non con i riposi.
- **Mossa finale** all'ultimo PF (p.108): **Fiammata di Gloria** (un'ultima azione riuscita come critico, poi la
  morte); **Evitare la Morte** (incoscienza, non bersagliabile, si risveglia se un alleato cura almeno 1 PF o con un
  riposo lungo; si tira il Dado Speranza: se ≤ livello, **cicatrice** = una casella Speranza cancellata per sempre;
  persa l'ultima, il personaggio si ritira); **Rischiare Tutto** (Dadi Dualità: Speranza più alta → in piedi e si
  dividono PF/Stress recuperati pari al Dado Speranza; Paura più alta → morte; critico → tutto recuperato).
- **Oro** astratto (p.106): manciate, sacchi, forzieri (10 a 1, al massimo un forziere addosso); monete opzionali.

### 3.10 Personaggi, classi, domini

Fonti: Manuale Base p.13–86 e p.111–135, *Hope & Fear* p.7–60, le tre raccolte di schede. Sintesi del rapporto
dell'agente sui personaggi, con i punti che ho controllato sulle regole lette di persona.

**Creazione.** Classe e sottoclasse (con i due domini della classe), origine (o origine mista: un privilegio da
ciascuna) e comunità, tratti distribuiti come **+2, +1, +1, 0, 0, −1**, Evasione e PF dalla classe, **6 Stress**,
**2 Speranze**, Competenza 1, **2 Esperienze a +2**, armi e armatura di partenza, **2 carte dominio di livello 1**,
inventario comune (torcia, corda, provviste, 1 manciata d'oro, una pozione minore a scelta, un oggetto di classe),
domande di background e Legami con gli altri PG.

**La scheda** (p.22, p.351): nome, pronomi, retaggio (origine + comunità), classe, sottoclasse, livello, domini; sei
tratti con un segno «marcato» per l'avanzamento; Evasione; Armatura con le sue caselle; soglie Maggiore e Grave; caselle
PF e Stress (le caselle permanenti in più sono tratteggiate); 6 caselle Speranza; Privilegio della Speranza;
Esperienze; arma primaria e secondaria (nome, tratto e portata, dadi e tipo di danno, caratteristica); Competenza in
pallini; armatura indossata; oro; inventario e 2 armi di scorta; privilegi di classe. Estensioni: scheda Multiclasse,
scheda del Compagno (Ranger Ferale), scheda delle Pose Marziali (Lottatore). Le carte fisiche di sottoclasse, origine,
comunità, dominio e trasformazione completano il personaggio.

**Valori derivati** (da calcolare, non da salvare): rango (lv 1 → 1; 2–4 → 2; 5–7 → 3; 8–10 → 4); soglie = base
dell'armatura + livello + bonus (Valoroso, Galapa, armature imbottite…); Punteggio di Armatura = base + bonus, massimo
12; Evasione = base di classe + avanzamenti + origine + armi e armature + temporanei; Competenza 1 con +1 automatico ai
livelli 2, 5 e 8; Esperienze +1 ai livelli 2, 5 e 8; molti privilegi scalano con il rango («rango × d6»).

**Tredici classi** (domini, Evasione, PF iniziali; tutte partono con 6 Stress):

| Classe | Domini | Ev | PF | Privilegio della Speranza (3 Speranze) |
| --- | --- | --- | --- | --- |
| Bardo | Grazia + Codice | 10 | 5 | Sceneggiata: −2 alla Difficoltà di un bersaglio Ravvicinato. |
| Consacrato (Seraph) | Splendore + Valore | 9 | 7 | Proteggere la Vita: un alleato Ravvicinato non perde 1 PF. |
| Druido | Saggezza + Arcano | 10 | 6 | Evoluzione: Forma Bestiale senza Stress, +1 a un tratto. |
| Fuorilegge (Rogue) | Mezzanotte + Grazia | 12 | 6 | Schivata: +2 Evasione fino al prossimo attacco riuscito o al riposo. |
| Guardiano | Valore + Lame | 9 | 7 | Baluardo in Prima Linea: libera 2 Caselle Armatura (ripetibile). |
| Guerriero | Lame + Ossa | 11 | 6 | Nessuna Tregua: +1 agli attacchi fino al riposo. |
| Mago | Codice + Splendore | 11 | 5 | Non Questa Volta: un avversario ripete un attacco o un danno. |
| Ranger | Ossa + Saggezza | 12 | 6 | Tienili a Bada: lo stesso tiro su altri 2 avversari. |
| Stregone | Arcano + Mezzanotte | 10 | 6 | Magia Volatile: rilancia dadi di danno magico. |
| Assassino (H&F) | Lame + Mezzanotte | 12 | 5 | Determinazione Letale: −2 Stress. |
| Lottatore (H&F) | Valore + Ossa | 10 | 6 | Pronto alla Lotta: bersaglio Vulnerabile. |
| Strega (H&F) | Saggezza + Terrore | 10 | 6 | Fascino della Strega: un fallimento diventa successo con Paura. |
| Warlock (H&F) | Terrore + Grazia | 11 | 5 | Dono del Patrono: ripete un tiro fallito con vantaggio. |

Ogni classe ha due sottoclassi (26 in tutto, **118 privilegi di sottoclasse**), ciascuna con Privilegio base,
Specializzazione e Maestria; è la sottoclasse a dare il **tratto da Incantatore** (le sottoclassi marziali non lo
hanno).

**Risorse di classe con stato persistente** (circa 28 meccanismi, oltre a circa 35 limiti «una volta per riposo /
riposo lungo / sessione»):

| Classe | Risorsa | Si guadagna | Si spende | Si azzera |
| --- | --- | --- | --- | --- |
| Bardo | **Dado A Raccolta** (d6, d8 dal lv 5) | 1/sessione, uno a sé e uno a ogni alleato | Si somma a tiro azione, reazione o danno, oppure toglie Stress pari al risultato | Fine sessione |
| Consacrato | **Dadi Preghiera** (tanti d4 quanto il tratto da Incantatore, valori già tirati) | Inizio sessione | Riducono un danno in arrivo, si sommano a un tiro già fatto, o danno Speranza | Fine sessione |
| Druido | **Forma Bestiale** (stato con statistiche sostitutive) | 1 Stress, o 3 Speranze con Evoluzione | — | Ultimo PF, danno Maggiore per le forme Fragili, a piacere |
| Fuorilegge | **Ammantato** (stato) | Quando sarebbe Nascosto | Attacco Furtivo +rango × d6 | Si muove in vista o attacca |
| Guardiano | **Dado Inarrestabile** (d4, d6 dal lv 5) | 1/riposo lungo, parte da 1, +1 a ogni danno che fa perdere PF | Riduce di un grado i danni fisici subiti, si somma ai danni, immunità a Trattenuto e Vulnerabile | Oltre il massimo o fine scena |
| Guerriero (Sterminatore) | **Dadi dello Sterminatore** (d6, massimo = Competenza) | Al posto della Speranza su un tiro con Speranza | Si sommano ad attacco o danno | Fine sessione: ogni dado non speso dà 1 Speranza |
| Mago | **Segni Misteriosi** (un numero 1–12) | Scelto, cambiabile a ogni riposo lungo | Se un Dado Dualità lo mostra: +1 Speranza o −1 Stress | — |
| Ranger | **Focus del Ranger** (un bersaglio) | 1 Speranza + attacco riuscito | Il bersaglio segna Stress quando lo danneggi | Fallimento (per rilanciare), fine effetto |
| Ranger (Ferale) | **Compagno** (scheda propria: Evasione, Stress, Esperienze, attacco che usa la Competenza del PG, addestramenti) | Creazione e livelli | Agisce col PG | Esce di scena all'ultimo Stress, torna col riposo |
| Stregone (Primordiale) | **Infusione Arcana** (stato) | Danno magico subito o 2 Speranze | +10 danni o +3 Difficoltà | Riposo lungo |
| Assassino | **Marchiato a Morte** (un bersaglio); **Composti Tossici** (gettoni) | 1 Stress dopo un attacco riuscito; 1 Stress = 1d4+1 gettoni | +rango × d4/d6/d8 danni; 1 gettone per veleno | Riposo, bersaglio sconfitto, Paura del GM pari al rango |
| Lottatore | **Dado Combinazione** (d4, cresce di rango); **Focus** (riserva fino a 6) e **Pose Marziali** (una attiva) | 1 Stress dopo un attacco in Mischia; in calma, 1/riposo | Tiri a catena finché il dado non cala; il Focus apre una posa | Posa persa con danno Grave o ultimo PF |
| Strega | **Maledizione** (bersagli ≤ tratto da Incantatore); **Fasi Lunari** (d6 a inizio sessione); gettoni di Talismano e Cerchio di Potere | 1 Stress per bersaglio | −rango a danni e Difficoltà del bersaglio | Fine effetto, sessione |
| Warlock | **Favori** (parte da 3) e **Dado del Patrono** (d6, d8 dal lv 5) | Mossa di interludio, o un Favore al posto della Speranza su un successo | 1 Favore prima del tiro | — |

**Forma Bestiale** (24 forme in 4 ranghi): si entra con 1 Stress; niente armi né incantesimi delle carte mentre dura
(gli effetti già attivi restano); l'armatura diventa parte del corpo; la forma dà un bonus a un tratto (+1…+3) e
all'Evasione (+1…+4), un attacco proprio (portata, tratto, dado e bonus della creatura con la Competenza del PG),
vantaggio su alcuni verbi, a volte modifiche alle soglie; le forme **Fragili** finiscono con un danno Maggiore; le forme
Leggendarie e Mitiche evolvono una forma di rango inferiore; gli Ibridi combinano due o tre forme. Per il catalogo
conviene leggere la **scheda della Forma Bestiale in appendice** (p.358–359): elenca ogni forma in fila (nome, esempi,
tratto ed Evasione, attacco, vantaggi, privilegi), mentre le tabelle del capitolo del Druido escono dall'estrazione a
colonne sfalsate.

**Trasformazioni** (*Hope & Fear*, una sola per PG, fuori dal limite di 5 carte, ciascuna con un vantaggio e uno
svantaggio): Fantasma (resistenza fisica, **danno magico doppio**), Licantropo (Forma di Lupo con trigger su PF persi e
sui tiri con Speranza; esplosione all'ultimo Stress), Mutaforma (cambia origine negli interludi), Rianimato (perde
**PF massimi permanenti** per sopravvivere a Rischiare Tutto), Semidio (+1 a tutti i tiri azione, reazione e danno; a
ogni fallimento 1 Stress o +1 Paura al GM), Vampiro (gettoni Nutrirsi: a 0 gettoni svantaggio su tutto).

**Origini e comunità.** 24 origini con 2 privilegi ciascuna (48): pochi modificano statistiche permanenti (Gigante +1
PF, Umano +1 Stress, Simiah +1 Evasione, Galapa soglie + Competenza, Terra +1 Armatura e +1 soglie, Clank +1 a
un'Esperienza); la maggior parte sono privilegi a costo (Stress o Speranza) o narrativi; tre sono limitati per sessione
o riposo; uno (Quadrifoglio dell'Halfling) dà Speranza a tutti a inizio sessione. 15 comunità con un privilegio
ciascuna: nessuna modifica statistiche permanenti; una tiene gettoni (Marittima, «Sentire la Marea»), sei sono una
volta per periodo, il resto narrativo.

**Equipaggiamento.** Armi: nome, tratto, portata (le cinque bande), danno `dN+X fis|mag`, impugnatura a 1 o 2 mani,
caratteristica; una primaria e una secondaria equipaggiate e 2 di scorta; cambiare arma in pericolo costa 1 Stress;
quattro gradi per rango (base, Perfezionata, Superiore, Leggendaria) più armi uniche; circa 200 armi tra i due libri.
Armature: soglie base, Punteggio, caratteristica; circa 45. Le caratteristiche si dividono in modificatori statici
(Affidabile +1 all'attacco, Pesante −1 Evasione, Ingombrante −1 Astuzia, Protettore +N Armatura…), danno (Potente,
Massiccio, Perforante…), azioni a costo (Rapido, Parata…), stato per arma (Ricarica, Ritornante) e regole sulle
Caselle Armatura. Oggetti e Scorte: 120 + 120, molti con effetti su PF, Stress, Speranza e con usi per riposo; le
Scorte sono monouso con massimo 5 per tipo.

**Salire di livello** (p.111–113): a ogni livello due avanzamenti, soglie +1, una nuova carta dominio di livello pari o
inferiore (la dotazione piena permette di spostarne una in riserva gratis); ai livelli 2, 5 e 8 +1 Esperienza e +1
Competenza; ai livelli 5 e 8 i tratti marcati si azzerano. Opzioni: +1 a due tratti non marcati, +1 casella PF, +1
casella Stress, +1 a due Esperienze, una carta dominio in più, +1 Evasione; dal rango 3 anche sottoclasse migliorata,
+1 Competenza, Multiclasse. **Caselle per rango** (verificate sulla tabella disegnata a p.112, perché l'estrazione del
testo non le riporta): tratti 3, PF 2, Stress 2, Esperienze 1, carta dominio 1 (fino al livello 4 nel rango 2, al 7
nel rango 3, senza tetto nel rango 4), Evasione 1; dal rango 3 sottoclasse migliorata 1, mentre Competenza e
Multiclasse hanno una **casella doppia** (vanno segnate entrambe, cioè costano i due avanzamenti del livello). Ogni
rango ha le sue caselle; si possono usare anche quelle rimaste dei ranghi precedenti. **Multiclasse** dal livello 5,
una volta: un dominio nuovo (carte fino a metà del livello, per eccesso), il privilegio di classe della seconda classe
(il «modulo multiclasse»), una carta base di sottoclasse; si barrano l'altra opzione multiclasse e una sottoclasse
migliorata, quindi niente Maestria. Le meccaniche ottenute usano il livello pieno. Per le classi di *Hope & Fear* non
ci sono moduli stampati: vale la stessa regola, il modulo è il privilegio di classe.

**Compagno del Ranger Ferale** (scheda a p.360): Evasione 10, **3 caselle Stress** (più 3 tratteggiate che si aprono
con l'addestramento Resistente), due Esperienze a +2 (una nuova a ogni nuova Esperienza del PG), attacco d6 in Mischia
che sale a d8/d10/d12 con Feroce; si attiva con un Tiro Incantesimo del ranger; ogni danno = 1 Stress, all'ultimo esce
di scena fino al prossimo riposo. Addestramenti con caselle: Intelligente 3, Luce nell'Oscurità 1 (una casella Speranza
in più per il PG), Conforto 1, Corazzato 1, Feroce 3, Resistente 3, Legame 1, Consapevole 3.

**Cosa ne segue per il modello dati del PG**: sei tratti, Evasione, Armatura (punteggio + caselle segnate), soglie
derivate, PF/Stress/Speranza come **caselle con massimo variabile** (in più e in meno: cicatrici, Rianimato), Esperienze,
Competenza, armi e armatura, carte dominio (dotazione, riserva, gettoni, usate), un **registro di risorse** generico
(tipi: flag 1/periodo, contatore, dado con valore memorizzato, riserva, bersaglio, scelta, stato con override) con
azzeramento a scena / riposo breve / riposo lungo / sessione, e un registro di **modificatori temporanei** con la loro
scadenza. Il rapporto dell'agente propone un JSON compatto con queste parti (sezione 7.3).

### 3.11 Carte dominio

Regole generali (p.101):

- **Dotazione** (loadout) di al massimo **5 carte dominio attive**; le altre stanno nella **riserva** (vault). Carte
  di sottoclasse, origine e comunità sono sempre attive e non contano.
- Si scambiano liberamente **all'inizio di un riposo**; fuori dal riposo si paga il **Costo di Richiamo** della carta
  in Stress. Salendo di livello si può mettere la nuova carta in dotazione gratis.
- Una carta si usa quante volte si vuole salvo limiti scritti (una volta per riposo lungo, ecc.): la carta usata si
  gira. Le carte possono ricevere **gettoni** che persistono anche tra le sessioni.
- Alcuni privilegi mandano una carta **definitivamente** in riserva (fuori gioco).

**Catalogo** (rapporto dell'agente sulle carte, che le ha lette tutte e le ha confrontate con le carte stampabili
senza trovare divergenze meccaniche; i conteggi interpretativi hanno un margine di circa ±2):

- **210 carte**: 189 del Manuale Base (9 domini × 21) + 21 del Terrore. Ogni dominio: 3 carte di livello 1 e 2 per
  ogni livello da 2 a 10, con una carta **Padronanza** al livello 7.
- Per tipo: **92 Abilità, 105 Incantesimi, 13 Grimori** (solo Codice, con **33 sotto-incantesimi** che hanno limiti
  d'uso propri). Lame, Ossa e Valore sono solo Abilità.
- Costo di Richiamo: 0 ×33, 1 ×94, 2 ×69, 3 ×11, 4 ×3 (media 1,3).

| Dominio | Carte | Abilità / Incantesimi / Grimori | Classi (Manuale Base e H&F) |
| --- | --- | --- | --- |
| Arcano | 21 | 1 / 20 / 0 | Druido, Stregone |
| Lame | 21 | 21 / 0 / 0 | Guardiano, Guerriero, Assassino |
| Ossa | 21 | 21 / 0 / 0 | Guerriero, Ranger, Lottatore |
| Codice | 21 | 1 / 7 / 13 | Bardo, Mago |
| Grazia | 21 | 9 / 12 / 0 | Bardo, Fuorilegge, Warlock |
| Mezzanotte | 21 | 6 / 15 / 0 | Fuorilegge, Stregone, Assassino |
| Saggezza | 21 | 5 / 16 / 0 | Druido, Ranger, Strega |
| Splendore | 21 | 4 / 17 / 0 | Consacrato, Mago |
| Valore | 21 | 21 / 0 / 0 | Consacrato, Guardiano, Lottatore |
| Terrore | 21 | 3 / 18 / 0 | Strega, Warlock |

**Che cosa fanno** (conteggi per carta):

| Aspetto | Conteggio |
| --- | --- |
| Almeno un costo | 134 (64%): Speranza 75 carte (1 Speranza in 45), Stress del PG 63 (uno Stress in 59), entrambi 9 |
| Tiro Incantesimo | 76 (36%): Difficoltà fissa in 33 (13 e 15 le più frequenti), contro la Difficoltà del bersaglio in 36 |
| Tiro reazione imposto al bersaglio | 13 (Difficoltà 12–18); schema «fallisce = pieni, supera = metà» in 4 |
| Leggono l'esito Speranza/Paura del tiro | 27 |
| Danni | ~45 carte, magici in 27 e fisici in 10; formule `XdY+Z`, d6 il dado più frequente; scalano con Competenza, tratto da Incantatore, Speranze spese, Paure del GM; **nessun danno diretto** |
| Riduzione dei danni | 18 |
| Guarigione o rimozione di Stress | 28 |
| Il bersaglio segna Stress | 16 |
| Caselle o Punteggio di Armatura | 14 |
| Interagiscono con la Paura del GM | 14 (la sottraggono, la leggono, la convertono); in 5 il GM la spende per chiudere l'effetto |
| Gettoni sulla carta | 15 (iniziali pari a un tratto, ai PF subiti, alle Paure del GM, alle carte in dotazione…); dadi che crescono sulla carta 3; un solo conto alla rovescia |
| Condizioni | Vulnerabile 9, Trattenuto 6, Nascosto/Ammantato 3, **14 condizioni speciali** (Incendiato, Addormentato, Affascinato, Stordito, Terrorizzato, Silenziato, Ustionato, Incatenato, Invisibile, Ammantato, Spettrale, Incorporeo, Esiliato…) |
| Limite d'uso | 69 (33%): una volta per riposo 34, per riposo lungo 34, per scena 2 |
| Stato che dura oltre l'istante | 82 (39%): fino al riposo 27, «finché non…» 27, fino a fine scena 3, permanenti 5 |
| Reazioni fuori dal proprio spotlight | ~44; 7 cambiano il turno nemico (Contromagia, Premonizione, Deflessione Arcana…) |
| Movimento | Teletrasporto 10, spostamento proprio o di gruppo 12, spinte e trazioni 11 |
| Evocazioni ed entità | 13, **nessuna con un blocco statistiche completo** (gettoni o una regola di sparizione) |
| Trasformazioni e forme / illusioni | 10 / 9 |
| Narrative o sociali | ~29 (14%) |

**Quanto c'è di mappa** (ogni carta contata una volta, al livello più alto):

| Livello | Carte | Cosa serve |
| --- | --- | --- |
| A. Persistente sulla mappa (muri, cupole, zone, portali, segnalini) | 29 (14%) | Forma e posizione che durano. 18 zone persistenti, ~11 muri o cupole, alcune seguono un token. |
| B. Bersagli per area, gruppo, linea o catena al lancio | 32 (15%) | Chi sta entro una banda da un punto; un solo tiro per tutti. **Nessun cono**: «davanti a voi» è un semicerchio. |
| C. Spostamento di token | 13 (6%) | Teletrasporto, spinta, trazione. |
| D. Solo controllo di gittata | 51 (24%) | Distanza tra due token in bande. |
| E. Solo contatori e stato | 85 (41%) | Nessun riferimento spaziale. |

**Carte difficili** e perché: Fulmine a Catena (propagazione con Difficoltà pari al tiro), Premonizione e Piegare la
Realtà (retroattive: servono il registro dei tiri e l'annullamento), i muri tra due punti con le creature spostate a
scelta, Terrore Notturno (sottrae Paura e fa danni per Paura), Esilio (due reazioni concatenate), Aura di Confusione
(strati d6), dadi che crescono sulla carta, effetti chiusi da una **scelta del GM** e non da un timer, Fortezza della
Selva (una cupola con PF e soglie), le Padronanze e Santuario della Natura (dipendono dalla composizione del mazzo),
luoghi «già visitati» fuori mappa, effetti liberi delle illusioni.

**Formato per un importatore**: intestazione fissa `<Tipo> <dominio> di Livello N Costo di Richiamo: R` (la
preposizione varia e va normalizzata), elenchi con «•», sotto-incantesimi dei Grimori come `Nome: testo`; l'ordine
nell'appendice non è sempre per dominio (fidarsi dell'intestazione della carta), meno U+2212. Le frasi costo → effetto
sono regolari («Spendete N Speranza», «Marcate N Stress», 122 carte): un parser ne ricava i costi; circa 90 carte dal
comportamento libero chiedono dati curati a mano.

In sintesi: **le carte sono soprattutto contabilità di risorse, non geometria**. Il 41% è puro contatore; il nucleo
spaziale comune è la distanza in bande e il gruppo «entro Prossima da un punto»; la geometria vera è concentrata in
74 carte (35%), in gran parte casi isolati.

### 3.12 Il lato del GM: mosse, Paura, Difficoltà

- **Il GM tira un d20** (p.150): attacco = d20 + modificatore contro l'Evasione; 20 naturale riesce sempre ed è
  critico (danno massimo + tiro); vantaggio = d20 in più.
- **Mosse del GM** (p.151–155): può farle quando vuole, soprattutto dopo un tiro con Paura o un fallimento. Elenco
  dal più morbido al più duro: mostrare come reagisce il mondo, fare una domanda, far agire un PNG secondo le sue
  motivazioni, usare gli obiettivi di un PG, segnalare una minaccia fuori scena, svelare una verità scomoda, dividere
  il gruppo, far segnare Stress, fare una mossa che i personaggi non vedono (anche avviare o avanzare un conto alla
  rovescia), mostrare danni collaterali, eliminare una condizione o un effetto temporaneo, cambiare l'ambiente,
  rendere protagonista un avversario, catturare qualcuno o qualcosa, usare il passato di un PG, eliminare
  un'opportunità.
- **Paura** (p.156–158): la campagna parte con tante Paure quanti i PG; **massimo 12**; **visibile ai giocatori**; si
  conserva tra le sessioni. Si guadagna dai tiri con Paura, dai riposi, da alcune carte dei PG e da privilegi degli
  avversari. Si spende per: interrompere i PG, fare una mossa aggiuntiva, usare la caratteristica di Paura di un
  avversario o di un ambiente, aggiungere l'Esperienza di un avversario a un tiro. Le spese si sommano: attivare un
  terzo avversario e usarne la caratteristica di Paura costano entrambe.
- Spesa indicativa per scena: Incidentale 0–1, Minore 1–3, Normale 2–4, Maggiore 4–8, Climax 6–12. Con più di 10
  Paure il manuale suggerisce di spendere a ogni turno del GM.
- **Difficoltà** tra 5 e 30 (tabella con esempi per tratto, p.159–161), aperta o segreta; gradi di successo;
  **Tiro Difficoltà** (d20 + Esperienza) per un PNG senza blocco statistiche.
- **PNG**: un nome, una descrizione, una motivazione; i PNG alleati non hanno blocco statistiche e danno vantaggio al
  PG che sfrutta il loro aiuto; i PNG importanti possono avere **caratteristiche** con innesco, effetto e scelta
  (p.168–169).

### 3.13 Conti alla rovescia

Il meccanismo generico di tempo del gioco, usato da GM, avversari, ambienti, progetti e alcune carte (p.103,
p.164–166):

- Un dado impostato su un valore che **scende di 1**; quando passa da 1 a 0 l'evento scatta, subito dopo il tiro che
  lo ha azzerato. Si conserva tra le sessioni. Può essere visibile o segreto.
- **Standard**: scende a ogni tiro azione dei PG. Brevi 2–4, lunghi 5+. In combattimento di norma uno solo, per
  l'antagonista.
- **Dinamico** (5–10): scende in base all'esito.

  | Esito del tiro | Conto di progresso | Conto di conseguenze |
  | --- | --- | --- |
  | Fallimento con Paura | — | −3 |
  | Fallimento con Speranza | — | −2 |
  | Successo con Paura | −1 | −1 |
  | Successo con Speranza | −2 | — |
  | Successo critico | −3 | — |

- **Speciali**: valore iniziale casuale («Conto alla Rovescia (1d6)»), **Ciclo** (riparte dal valore iniziale),
  **Crescente** / **Decrescente** (il valore di partenza sale o scende di 1 a ogni ciclo).
- **Inseguimenti**: due conti dinamici, uno per parte, con un vantaggio iniziale di 1, 3 o 5.
- **A lungo termine**: tracce di 4–12 caselle con eventi intermedi; avanzano di 1 con un riposo breve, di 2 con un
  riposo lungo.

### 3.14 Avversari e ambienti

Il bestiario conta **263 avversari** (128 nel Manuale Base, 135 in *Hope & Fear*) e **47 ambienti** (19 + 28). I
numeri di questa sezione vengono da un parser scritto da un agente sul testo estratto: i campi strutturati sono
completi (263 su 263 con Difficoltà, soglie, PF, Stress e attacco), i conteggi delle meccaniche sono euristiche e
quindi approssimati.

**Il blocco statistiche è piatto e uniforme** (Manuale Base p.212–245):

```
NOME IN MAIUSCOLO
<Tipo> di Rango <n>            (Orda: «(Y/PF)», quante creature vale un PF)
Descrizione.
Motivazioni e Tattiche: voce, voce, voce
Difficoltà: N | Soglie: Maggiore/Grave | PF: N | Stress: N
ATT: ±N | Arma: Gittata | XdY+Z fis|mag
Esperienza: Nome +N, …         (manca nel 27% dei blocchi)
CARATTERISTICHE
Nome - Passiva|Azione|Reazione: testo
```

Non ci sono tratti, CA, tiri salvezza, velocità, taglia, sensi né iniziativa. I PG tirano contro la **Difficoltà**
dell'avversario (attacchi compresi); l'avversario attacca con **d20 + ATT contro l'Evasione**. Anche l'avversario ha
**PF segnati contro soglie** e **Stress** proprio: a Stress pieno non può più usare le mosse che lo costano; a PF pieni
è sconfitto.

**Dieci tipi** (in inglese Bruiser, Horde, Leader, Minion, Ranged, Skulk, Social, Solo, Standard, Support):

| Tipo | Blocchi | Ruolo e regole speciali |
| --- | --- | --- |
| Solitario | 51 | Boss. **Inesorabile (X)** in 43 di loro: può essere protagonista X volte per turno del GM, pagando ogni attivazione. |
| Bruto | 35 | Resistente, colpi potenti. |
| Base | 34 | Avversario medio. |
| Sicario | 31 | Manovra e imboscate. |
| Seguace | 28 | 1 PF, nessuna soglia, danno fisso. **Seguace (X)**: per ogni X danni inflitti cade un Seguace in più entro la portata dell'attacco. **Attacco in Massa** (1 Paura): attiva tutti i Seguaci omonimi vicini, un solo tiro, danni sommati. |
| Condottiero | 27 | Comanda, attiva o evoca altri avversari. |
| Orda | 21 | Un gruppo come una sola unità con una barra di PF (3–8); **Orda (X)**: da metà PF l'attacco base passa a X danni. |
| Controparte | 12 | Sfida sociale (attacco basso, Stress alto). |
| Supporto | 12 | Potenzia alleati, impone condizioni. |
| Tiratore | 12 | Colpisce da lontano. |

Altre strutture: **Cambio di Fase** (6 reazioni sostituiscono l'avversario con un altro blocco, come la catena del
Drago Vulcanico); **Evoluzione** (nuova in *Hope & Fear*, 6 blocchi: lo stesso avversario si cura, cambia attacco,
aggiunge caratteristiche); **Accumulo** (nuovo in *Hope & Fear*: gettoni condivisi tra avversari omonimi, vuoti a
inizio scena).

**Caratteristiche** (910 in tutto): Passive 36%, Azioni 42%, Reazioni 21%. Le azioni richiedono di essere
protagonista; reazioni e passive no.

| Meccanica | Quante | Automazione utile |
| --- | --- | --- |
| Costo in Paura | 291 (32%; 190 blocchi su 263 ne hanno almeno una, 49 Solitari su 51) | Pulsante che spende dalla riserva. |
| Guadagno di Paura | 71 | +N alla riserva su evento. |
| Costo in Stress dell'avversario | ~222 | Barra per istanza, blocco a Stress pieno. |
| Tiri reazione imposti ai PG | 115 (Agilità 49, Presenza 25, Istinto 25, Forza 11, Conoscenza 5, Astuzia 3; solo 21 con Difficoltà esplicita) | Richiesta ai giocatori con tratto e Difficoltà. |
| Aree, gruppi, linee | ~90 | Forme sulla mappa a bande di distanza. |
| Condizioni Vulnerabile / Trattenuto / Nascosto | 78 / 60 / 16 | Badge con la regola. |
| Condizioni speciali nominate | 14 | Etichetta col testo. |
| Spostamenti (spinta, trascinamento, teletrasporto, volo) | 46 | Manuale, con anello di gittata. |
| Evocazioni o sostituzioni | 62 (in 36 blocchi) | Istanziare blocchi collegati. |
| Effetti su Speranza o Stress dei PG | Speranza 73, Stress ~100 | Mutazione della scheda PG o promemoria. |
| Conti alla rovescia | 26 negli avversari, 47 negli ambienti | Orologi con innesco dichiarato. |
| Gettoni sul blocco | 13 + 2 Accumuli | Contatore per istanza o per gruppo. |
| Una volta per scena o riposo | 18 | Flag di consumo. |
| Resistenze e immunità | 33 | Campo per tipo di danno. |
| Passive sempre vere | ~67 | Testo o modificatore fisso. |

**Statistiche per Rango** (mediana tra parentesi):

| Rango | Avversari | Difficoltà | Soglia Maggiore | Soglia Grave | PF | Stress | ATT | Danno base medio |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 85 | 8–15 (12) | 3–9 (6) | 6–17 (11) | 1–10 (4) | 0–5 (3) | −4…+4 (+1) | 7,0 |
| 2 | 78 | 12–17 (14) | 6–17 (11) | 13–32 (23) | 1–10 (5) | 1–7 (3) | −3…+5 (+2) | 12,7 |
| 3 | 55 | 14–20 (17) | 15–35 (20) | 29–70 (35) | 1–12 (7) | 1–8 (5) | 0…+7 (+3) | 18,9 |
| 4 | 45 | 16–21 (19) | 24–48 (35) | 42–88 (65,5) | 1–12 (7) | 1–10 (5) | +2…+10 (+6) | 30,5 |

**PF piccoli**: un avversario ha da 1 a 12 PF; la barra sulla mappa diventa una fila di caselle, non una barra
continua. L'attacco base è fisico nel 79% dei casi; le gittate più frequenti sono Mischia (118) e Prossima (75).

**Costruire un incontro** (Punti Battaglia): budget **3 × PG + 2**; costi Seguaci 1 per gruppo (tanti Seguaci quanti
PG), Controparte e Supporto 1, Orda, Tiratore, Sicario e Base 2, Condottiero 3, Bruto 4, Solitario 5; modificatori
(−1 incontro più facile o breve, −2 con due o più Solitari, −2 con +1d4 o +2 ai danni di tutti, +1 con un avversario
di rango inferiore, +1 senza Bruti/Orde/Condottieri/Solitari, +2 più pericoloso o lungo). Le evocazioni non contano.
Una tabella permette di **improvvisare o scalare** un avversario di Rango (ATT +1…+4, Difficoltà 11/14/17/20, soglie
7/12, 10/20, 20/32, 25/45, danni per rango).

**Ambienti**: Nome, `<Tipo> di Rango n` (Esplorazione 12, Contesto Sociale 11, Attraversamento 11, Evento 13),
Descrizione, **Impeti**, Difficoltà (numero, «Speciale», «Forza Relativa» = quella del miglior avversario in scena),
**Potenziali Avversari**, Caratteristiche con 1–3 domande per il GM. Nessun PF, soglia o attacco. 33 ambienti su 47
hanno caratteristiche di Paura; 47 caratteristiche usano conti alla rovescia (in 30 ambienti); 29 evocano avversari.

**Insidie per un importatore** (dal parser dell'agente): cifre di Rango e `(Y/PF)` rese con glifi privati
U+E53F–U+E549 (valore = codepoint − 0xE540); etichette incoerenti (`Passivo`, `CARATTERISTICA`, `Stress: Nessuno`,
`Soglie: 6/Nessuna`, `ATT: +2d4`); trattini e meno tipografici (U+2010, U+2013, U+2212 anche nei dadi); più
caratteristiche sulla stessa riga; caratteristiche annidate nelle Evoluzioni; ligature negli ambienti (serve NFKC);
refusi in inglese residuo (`Very Close`, `phy`). L'algoritmo che funziona si ancora sulla riga `Difficoltà:`. Il
rapporto dell'agente contiene 10 blocchi e 3 ambienti trascritti con l'esito atteso, pronti come casi di prova.

### 3.15 Hope & Fear

*Hope & Fear* è un'espansione che presuppone il Manuale Base e porta il gioco a **13 classi** e **24 origini**:
classi Assassino, Lottatore, Strega e Warlock; il dominio del **Terrore** (incubi, evocazioni di mostruosità,
indebolimento); sei origini e sei comunità; le **trasformazioni** (semidio, fantasma, rianimato, mutaforma, vampiro,
licantropo); nuovo equipaggiamento, bottino e «Le Scorte»; nuove caratteristiche degli avversari; quattro modelli di
campagna (Castle High, Il Regno del Drago Mannaro, Il Cuore Oscuro di Andaluria, Il Cammino Verso l'Orizzonte). Il
manuale stesso consiglia di introdurla solo dopo alcune sessioni col Manuale Base.

Che cosa porta, in numeri (dai rapporti degli agenti):

- **Classi**: le quattro nuove hanno risorse con più stato di quelle del Manuale Base (Composti Tossici e Marchiato a
  Morte, Dado Combinazione e Pose Marziali, Maledizione e Fasi Lunari, Favori e Dado del Patrono): 43 privilegi di
  sottoclasse in 8 sottoclassi.
- **Dominio del Terrore**: 21 carte (3 Abilità, 18 Incantesimi), le stesse regole degli altri domini.
- **Trasformazioni**: un livello sostitutivo come la Forma Bestiale, con regole che toccano direttamente il motore dei
  danni (Fantasma: danno magico doppio), dei massimi (Rianimato: PF massimi che scendono), dei tiri (Semidio: +1 a
  tutto; Vampiro: il Dado Paura diventa un d20).
- **Avversari**: 135 nuovi (più del doppio), nessun tipo nuovo, due caratteristiche nuove (Evoluzione e Accumulo),
  più privilegi di Paura (37% delle caratteristiche contro il 26% del Manuale Base), famiglie di blocchi collegati.
- **Ambienti**: 28 nuovi, con più Eventi e Attraversamenti.
- **Equipaggiamento**: armi e armature nuove per rango, sedie a rotelle da combattimento, 60 oggetti e 60 Scorte.

Per il fork *Hope & Fear* non chiede strutture nuove: sono dati in più sulle stesse forme (carte, classi, blocchi,
livelli sostitutivi), con l'unica aggiunta dei gettoni condivisi di Accumulo.

---

## 4. B — Differenze rispetto alla 5E 2014

### 4.1 La differenza che decide tutto: cosa fa avanzare il tempo

Nella 5E il tempo del combattimento avanza **per turni**: l'ordine d'iniziativa, il turno attivo e il round sono
l'orologio a cui il plugin aggancia tutto (durate in round, fine e inizio turno, reazioni, azioni leggendarie, tiri
salvezza ricorrenti, concentrazione, movimento per turno).

In Daggerheart l'orologio è il **tiro azione dei PG**: ogni tiro azione genera Speranza o Paura, decide se il gioco
passa al GM, fa scendere i conti alla rovescia standard e dinamici, attiva i privilegi che leggono l'esito (27 carte,
molte risorse di classe). Le durate finiscono con eventi (riposo, scena, danno subito, uso, scelta del GM), non con un
numero di round. Il **turno del GM** è una fase, non un posto in una fila.

Per il fork vuol dire che l'evento centrale del motore non è più «turno avanzato» ma **«tiro risolto»** (con chi l'ha
fatto, il tipo di tiro e l'esito tra cinque), più gli eventi «turno del GM iniziato/finito», «riposo breve/lungo»,
«fine scena», «inizio/fine sessione».

### 4.2 Tabella di confronto

| Area | 5E 2014 (com'è codificata nel plugin) | Daggerheart |
| --- | --- | --- |
| Struttura del combattimento | Iniziativa d20, ordine fisso, turni, round | Protagonismo fluido; turno del GM attivato da fallimenti, tiri con Paura o Paura spesa; gettoni azione solo opzionali |
| Economia d'azione | Azione, azione bonus, reazione, movimento, interazione | Nessuna; «mosse»; un avversario fa una cosa per attivazione; reazioni dalle carte |
| Dado del giocatore | d20 + caratteristica + competenza | 2d12 Dadi Dualità + tratto + Esperienze (gettoni) |
| Dado del GM | d20 | d20 (con vantaggio = un d20 in più) |
| Vantaggio | Due d20, si tiene il migliore | +d6 (−d6 svantaggio), si annullano uno a uno |
| Critico | 20 naturale (PG e mostri), dadi raddoppiati | PG: due d12 uguali (anche sotto la Difficoltà) → +Speranza, −Stress, danni max + tiro; GM: 20 naturale |
| Difesa | Classe Armatura | Evasione (contro gli attacchi) + Caselle Armatura (riduzione di gravità) |
| Effetti ad area | Tiro salvezza della creatura (6 caratteristiche) | Tiro reazione su un tratto, nessuna Speranza/Paura; per gli avversari d20 contro la Difficoltà |
| Caratteristiche | 6 punteggi 3–20 con modificatore | 6 tratti già modificatori (−1…+2 all'inizio) |
| Danno | Tanti tipi (13), resistenza/vulnerabilità/immunità per tipo | Due tipi (fisico, magico) + danno diretto; resistenza dimezza, immunità annulla |
| Punti ferita | Numero grande che scende; PF temporanei | 5–12 caselle che si **segnano** in gruppi di 1/2/3 (4) secondo le soglie; nessun PF temporaneo (esiste l'armatura temporanea) |
| Seconda barra | — | **Stress** (6+ caselle): valuta di costo, ultimo → Vulnerabile, eccesso → 1 PF |
| Morte | 0 PF → tiri contro la morte, stabilizzazione, morte istantanea | Ultimo PF → **mossa finale** scelta dal giocatore; cicatrici che tolgono caselle Speranza |
| Meta-valuta | Ispirazione (rara) | **Speranza** dei PG (0–6, continua) e **Paura** del GM (0–12, visibile) |
| Magia | Slot per livello, incantesimi preparati, concentrazione | **Carte dominio**: dotazione di 5, riserva, Costo di Richiamo in Stress, costi in Speranza/Stress, nessuna concentrazione |
| Durate | Round, minuti, ore; fine/inizio turno; TS ricorrenti | Eventi: riposo, riposo lungo, scena, sessione, «finché non», gettoni; il GM può chiudere gli effetti temporanei |
| Condizioni | 15 condizioni RAW + esaurimento | 3 condizioni di base + condizioni speciali scritte sulle carte; nessun esaurimento |
| Distanze | Metri/caselle esatti, velocità per creatura | 5 bande (Mischia, Prossima, Ravvicinata, Lontana, Remota); griglia opzionale 1/3/6/12/13+; niente velocità |
| Aree | Cono, cubo, sfera, cilindro, linea con misure | «Entro banda da un punto/da te», gruppo entro Prossima, semicerchio davanti, linea, muri; nessun cono |
| Movimento | Velocità in caselle, terreno difficile, tipi di movimento | Entro Ravvicinata insieme a un'azione; oltre con un tiro Agilità (PG) o un'azione intera (avversari) |
| Riposi | Breve (Dadi Vita) e lungo (tutto) | Breve (≤3, due mosse da 1d4 + rango) e lungo (due mosse «tutto»); il GM guadagna Paura e avanza i conti a lungo termine |
| Mostri | Statblock completo (caratteristiche, TS, sensi, taglia, CR, azioni, leggendarie, tana) | Blocco piatto: Difficoltà, soglie, PF, Stress, ATT, un attacco, Esperienze, caratteristiche Passiva/Azione/Reazione; 10 tipi di ruolo |
| Boss | Azioni leggendarie, resistenze leggendarie, azioni di tana | Inesorabile (X), caratteristiche di Paura, conti alla rovescia, Cambio di Fase, Evoluzione |
| Gruppi di nemici | Uno per uno | Orda (una barra per un gruppo), Seguaci (danno in eccesso abbatte altri Seguaci, attacco in massa) |
| Scena | Mappa e luce | **Ambienti** con blocco proprio (Impeti, Difficoltà, caratteristiche e caratteristiche di Paura, avversari potenziali) |
| Costruzione incontri | GS/PE con moltiplicatori | Punti Battaglia: 3 × PG + 2, costo per tipo |
| Orologi | Assenti dalle regole (il plugin ha i suoi clocks) | **Conti alla rovescia** come meccanica centrale: standard, dinamici, ciclo, crescenti/decrescenti, a lungo termine |
| Progressione | Livelli 1–20, bonus di competenza, talenti, aumenti | Livelli 1–10 in 4 ranghi, due avanzamenti per livello, Competenza = numero di dadi, multiclasse dal 5 |
| Ricchezza | Monete esatte | Manciate, sacchi, forzieri |
| Ruolo del software | Arbitro affidabile: le regole sono chiuse | Contabile: il GM piega le regole alla finzione per regola d'oro |

### 4.3 Cosa sparisce

Concetti 5E che il plugin implementa e che in Daggerheart **non esistono**: ordine d'iniziativa e tiro d'iniziativa;
round e turni individuali; azione, azione bonus e reazione come risorse; Classe Armatura; tiri salvezza e CD degli
incantesimi; slot incantesimo e incantesimi preparati; concentrazione e TS di concentrazione; durate in round/minuti e
TS ricorrenti di fine turno; i 13 tipi di danno; PF temporanei; tiri contro la morte e stabilizzazione; esaurimento;
velocità in metri, tipi di movimento e terreno difficile; taglie e spazi occupati come regola; coni, cubi e cilindri
misurati; azioni leggendarie, resistenze leggendarie, azioni di tana come meccanica distinta; GS e PE; specie,
talenti e incantesimi della 5E come cataloghi.

### 4.4 Cosa cambia forma

| Concetto 5E | Equivalente in Daggerheart | Distanza |
| --- | --- | --- |
| Barra PF | Fila di caselle PF segnate, con le soglie accanto | Media: stesso posto nella UI, matematica diversa |
| Risorse di classe (pool) | Speranza, Stress, Caselle Armatura, dadi e gettoni di classe e di carta | Piccola: il registro risorse regge, cambiano i reset (scena/riposo/riposo lungo/sessione) |
| Condizioni | 3 di base + speciali con testo | Piccola: meno voci, stessa UI di badge |
| Effetti attivi con durata | Effetti con fine a evento o a scelta del GM | Media: stessa lista, motore delle scadenze diverso |
| Reazioni e avvisi di reazione | Reazioni delle carte (~44) e caratteristiche Reazione degli avversari (194) | Piccola: stesso meccanismo d'avviso |
| Tiro salvezza di gruppo | Tiro reazione di più PG o d20 degli avversari contro una Difficoltà | Media |
| Attacco d20 contro CA | PG: 2d12 contro Difficoltà; avversari: d20 contro Evasione | Media: console da riscrivere nelle formule, non nella forma |
| Aree su griglia | Anelli di banda e gruppo entro Prossima | Piccola come geometria, ma molto meno usata |
| Azioni leggendarie/boss | Inesorabile, Paura, Cambio di Fase | Media |
| Forma Selvatica | Forma Bestiale | Piccola come concetto (layer di override), dati tutti nuovi |
| Clocks del plugin | Conti alla rovescia | Piccola: è il pezzo che si avvicina di più |
| Riposo di gruppo | Interludio con mosse a scelta e Paura del GM | Media |

### 4.5 Cosa è nuovo

- **L'economia Speranza/Paura** condivisa e visibile: un contatore di Paura sullo schermo dei giocatori, la Speranza su
  ogni PG, gli eventi che le muovono (tiri, riposi, carte, caratteristiche).
- **La fase del GM**, con l'attivazione degli avversari pagata in Paura e Inesorabile come eccezione.
- **Le soglie e le Caselle Armatura**: un passaggio «danno → gravità → PF» con una scelta del giocatore in mezzo
  (segnare o no una casella).
- **Lo Stress** come seconda barra e come valuta.
- **Dotazione e riserva** delle carte, con il Costo di Richiamo.
- **Il Tiro Combinato, il tiro di gruppo, Aiutare un Alleato**: tiri che coinvolgono più PG.
- **Ambienti** con caratteristiche proprie.
- **Conti alla rovescia** agganciati agli esiti dei tiri.
- **Orde e Seguaci** con matematica dedicata.

### 4.6 Che cosa significa per un tracker

1. **Meno automazione di regole, più contabilità.** La 5E premia un motore che conosce le regole (TS, CD, durate,
   aree misurate). Daggerheart premia un tavolo che vede in un colpo d'occhio Speranza, Paura, Stress, PF, armatura,
   chi ha già avuto lo spotlight e quali conti alla rovescia scendono. Il valore di Take Initiative (lo schermo del
   tavolo, la chiarezza, le animazioni, la sincronizzazione) resta; il catalogo di regole 5E no.
2. **Il tiradadi diventa il centro.** Se i Dadi Dualità si tirano nel plugin, il plugin sa da solo chi guadagna
   Speranza o Paura, quando passa il turno al GM, quali conti alla rovescia scendono e quali privilegi scattano. Senza
   tiradadi integrato, il GM dovrebbe segnare tutto a mano (proprio la contabilità che il gioco vorrebbe leggera).
3. **Niente round da far scorrere.** I meccanismi di scadenza per turno e round non hanno un equivalente; le scadenze
   per riposo, scena e sessione diventano i reset principali.
4. **Geometria ridotta a bande.** Un solo strumento di distanza a bande (con la griglia opzionale 1/3/6/12) e un
   selettore «gruppo entro Prossima da un punto» coprono la maggior parte dei casi spaziali.
5. **I PF sono piccoli e discreti.** Le barre continue diventano file di caselle; il numero da mostrare è «quanti
   segnati su quanti», con le soglie scritte accanto.

---

## 5. Take Initiative oggi

Inventario fatto da un agente sul codice corrente (`src/` pulito; l'unica modifica non committata è un test), con i
riferimenti principali controllati a campione.

- **538 file JS/TS in `src/`, 224.285 righe**, struttura piatta, DOM senza framework. Dipendenze runtime:
  `@owlbear-rodeo/sdk`, `three` e `cannon-es` (solo dadi 3D), `immer`, `fflate`.
- **48 pagine HTML** d'ingresso, un solo background (`background.html`), 8 strumenti nella toolbar, una ventina di voci
  di menu contestuale.
- Nessun backend: metadata OBR di token, scena, room e giocatore; broadcast; local items; localStorage e IndexedDB.
  Namespace unico `com.thebigpicture.initiative`.
- **Test**: 752 file, circa 175.000 righe; **script**: 33 generatori, audit e check; CI con versione, test, controllo
  degli incantesimi, build, checksum.
- **Cataloghi**: circa 2,55 MB di JSON nel bundle (1,34 MB solo per le capacità di classe), cataloghi scritti in JS per
  incantesimi, specie, talenti, boss; 9,8 MB di sorgenti in `data/`.

| Strato | File | Righe | % | Legame con la 5E |
| --- | ---: | ---: | ---: | --- |
| Infrastruttura e sync | 64 | 11.284 | 5,0 | Nessuno |
| Hub delle mutazioni degli effetti | 2 | 8.238 | 3,7 | Misto: trasporto generico, operazioni 5E |
| Nucleo del tracker | 45 | 27.820 | 12,4 | Debole, con innesti forti (Tana, Paragon, Epic, leggendarie, concentrazione, TS contro morte) |
| PF e barre sulla mappa | 25 | 6.262 | 2,8 | Debole (morte forte) |
| Condizioni, effetti, reminder | 36 | 15.200 | 6,8 | Debole (reminder dei TS forte) |
| **Incantesimi, zone, aree** | 143 | **79.113** | **35,3** | Forte (geometria e motore delle zone deboli) |
| Console attacchi, difese, reazioni | 46 | 13.729 | 6,1 | Forte |
| Boss e leggendarie | 21 | 8.027 | 3,6 | Forte |
| Classi, talenti, specie, trasformazioni, scheda | 45 | 18.515 | 8,3 | Forte |
| Movimento e distanza 3D | 14 | 4.413 | 2,0 | Debole/forte |
| Dadi | 11 | 1.761 | 0,8 | Nessuno |
| Cronologia e registro | 23 | 15.678 | 7,0 | Nessuno/debole |
| Orologi | 4 | 704 | 0,3 | Nessuno |
| Compendio | 10 | 1.583 | 0,7 | Motore nessuno, contenuto forte |
| Import | 18 | 3.885 | 1,7 | Forte |
| Opzioni e giocatori | 23 | 4.382 | 2,0 | Nessuno/debole |
| Animazioni | 8 | 3.691 | 1,6 | Renderer nessuno, mappatura forte |
| **Totale** | **538** | **224.285** | 100 | Circa 55% forte, circa 20% puro motore |

**Assunzioni 5E dentro il nucleo** (quelle che rendono il nucleo non riusabile così com'è):

- `src/initiativeList.js` (12.969 righe): condizioni 5E esportate (:352), Tana a iniziativa 20 (:378), voci virtuali
  Epic dopo ogni PG (:1037, :11632), pareggi con Tana ed Epic (:3088), ogni voce porta PF temporanei, TS contro morte,
  azioni leggendarie e Paragon (:5504), avviso di concentrazione sul danno (:6382, :6867, :7561), azioni leggendarie
  ricaricate a inizio turno (:8013, :12631), «Reazione usata» sulla card (:8873), pip dei TS contro morte al posto della
  barra PF (:11145).
- `src/initiativeOrderCore.js`: ordine numerico decrescente con Tana a 20 (:126), espansione Paragon (:15),
  `paragonInits` nello stato (:159).
- `src/initiativeCards.js`: il modello della card contiene CA, Percezione passiva, CD e bonus degli incantesimi, TS,
  esaurimento, build multiclasse, specie, talenti, libro degli incantesimi, profilo del mostro (:69, :92–140).
- `src/effectsMutations.js`: a 0 PF si rompe la concentrazione (:1089), casi di singoli incantesimi cablati (:1080).
- `src/background.js:349–361`: monta dodici controller 5E (aure, zone, reminder dei TS, incantesimi preparati, Invocare
  il Fulmine, trasformazioni, console attacchi, crollo dei boss).
- `src/turn-notice.ts`: il popup di turno importa TS contro morte, reminder dei TS, trigger delle zone.
- `src/conditions.js:37–54, 98–104`, `src/speedCheckCore.js:1` (1,5 m per casella),
  `src/concentrationSaveReminderCore.js:44` (CD di concentrazione).

**Restano agnostici**: il gateway dello stato e lo scheduler di render, la coda della navigazione con revisioni e
guardie contro lo stato stantio, l'epoch di scena, i metadata key-scoped e il budget della room, il broker delle
mutazioni con undo, l'owner della cronologia e lo store locale, le barre e le pill sulla mappa come meccanismo, la
memoria dei PF, i PF condivisi, le aure personalizzate, la geometria delle aree, gli orologi, i dadi 3D, le opzioni,
l'assegnazione dei giocatori, i popover e la rotazione dello schermo del tavolo.

---

## 6. C — Sottosistema per sottosistema

### 6.1 I quattro verdetti

- **Mantenere**: passa nel fork com'è, al massimo con chiavi, nomi o campi rinominati.
- **Modificare**: il meccanismo resta, cambiano in modo sostanziale regole, dati o interfaccia.
- **Eliminare**: in Daggerheart non c'è un equivalente; si toglie insieme ai suoi test.
- **Riscrivere da zero**: il bisogno esiste anche in Daggerheart, ma il codice di oggi è così legato alla 5E (o così
  fragile) che conviene un modulo nuovo, che riusa solo i pezzi di motore indicati.

### 6.2 Riepilogo

| Verdetto | Righe di oggi (stima) | Quota | Che cosa |
| --- | ---: | ---: | --- |
| Mantenere | ~37.000 | ~17% | Infrastruttura e sync, cronologia e undo, opzioni, giocatori, popover, fazioni, PF condivisi, pill sulla mappa, aure personalizzate, elevazione, motore del compendio, renderer delle animazioni |
| Modificare | ~40.000 | ~18% | Card e loro render, condizioni, barre sulla mappa, memoria dei vitali, geometria delle aree e motore delle zone, dadi, orologi, distanza, registro di combattimento, avvisi di reazione, azioni rapide, menu contestuali |
| Riscrivere | ~61.000 | ~27% | Hub del tracker e avviso di turno, operazioni delle mutazioni, console PF, console attacchi, console Boss, scheda PG, capacità di classe, trasformazioni, riposo, import, difese |
| Eliminare | ~89.000 | ~40% | Incantesimi (catalogo, regole, pannello, risoluzione, concentrazione, slot), reminder dei TS, TS contro morte, 5eTools, talenti, specie, magia selvaggia, leggendarie/Paragon/Epic, boss specifici, tracker della velocità, mappatura delle animazioni |

Il codice riscritto sarà molto più corto di quello che sostituisce: le regole di Daggerheart sono più semplici da
contare (caselle, soglie, bande, eventi) e non c'è un catalogo di 477 incantesimi da automatizzare. Stima del fork a
regime: **100.000–110.000 righe**, circa metà del plugin di oggi, di cui 25.000–35.000 nuove.

### 6.3 Sottosistema per sottosistema

**Infrastruttura, sync e cronologia**

| Sottosistema | Righe | Verdetto | Motivo e cosa diventa |
| --- | ---: | --- | --- |
| Bootstrap, shell, launcher, sync-open, avviso del secondo GM | ~1.650 | Mantenere | Generici. `background.js` perde i dodici controller 5E e monta quelli nuovi (§7). |
| Epoch di scena, lifecycle, eventi e riconciliazione degli item, snapshot spaziale | 2.427 | Mantenere | Generici; solo la tabella dei campi del dispatcher (`hp`, `tempHp`, `legendary`…) si aggiorna ai campi nuovi. |
| Metadata key-scoped, budget della room, pulizia | 788 | Mantenere | Generici; cambia il namespace (D2) e la tabella delle chiavi. |
| Gateway dello stato e scheduler di render | 1.743 | Mantenere | Generici; `paragonInits` esce dallo stato. Sono la base su cui poggia la nuova bacheca. |
| Broker delle mutazioni, coordinatore, undo, recovery | 1.995 | Mantenere | Generici. |
| Operazioni delle mutazioni (`effectsMutations.js`, `effectsMutationCore.js`) | 8.238 | **Riscrivere** | Il catalogo delle operazioni è 5E (condizioni con scadenze a turni, `spell:*`, `concentration:*`, `effects:tick-round`, rottura della concentrazione a 0 PF). Nuovo catalogo sullo stesso trasporto: vitali, Speranza, Paura, armatura, condizioni, effetti delle carte, conti alla rovescia, dotazione, riposi (§7.4). |
| Diagnostica e prestazioni | 2.403 | Mantenere | Strumenti di sviluppo. |
| Utility UI, popover, rotazione del tavolo, identità e ritratti | ~1.400 | Mantenere | Generici; la rotazione dello schermo è centrale per il tavolo fisico. |
| Cronologia, undo, owner, store locale, finestra Cronologia | 9.078 | Mantenere | Il motore è agnostico; `historyUndoCore` conosce alcuni campi di dominio (incantesimi, concentrazione) da sostituire. |
| Registro di combattimento | 5.852 | Modificare | Motore e storage restano; cambia lo schema degli eventi: esito del tiro (cinque), Speranza e Paura, danno → gravità → PF, casella armatura, Stress, conti alla rovescia, carte usate, riposi, mosse finali. |
| Snapshot del combattimento | 748 | Modificare | Stessi campi nuovi. |

**Nucleo del tracker**

| Sottosistema | Righe | Verdetto | Motivo e cosa diventa |
| --- | ---: | --- | --- |
| Hub del tracker (`initiativeList.js`) | 12.969 | **Riscrivere** | Il suo centro (ordine, turno attivo, round, Tana, Epic, Paragon, leggendarie, TS contro morte, concentrazione) non esiste nel gioco, e il file è il più fragile del progetto (AGENTS.md). Adattarlo vorrebbe dire toccare quasi tutte le 309 funzioni; una **bacheca del protagonismo** nuova (§7.2) costa meno e riusa render delle card, scheduler, gateway, code e guardie. |
| Ordine, turno, round, ID virtuali | 1.036 | Modificare | L'ordinamento per iniziativa sparisce; restano raggruppamento «(n) Nome» (utile per Seguaci e Orde), collapse e voci virtuali, che servono per l'**Ambiente** e per la fase del GM. |
| Card: registro, render classic e compact, editor inline, chip | 6.582 | Modificare | Il render (lo stile BG3, le animazioni, la vista compatta e quella espansa) è il valore da salvare; il **modello** della card (CA, TS, CD, slot, specie, talenti) va riscritto (§7.3). Il registro nella room, con la compressione, resta. |
| Popover e layout, menu admin, cassetto dei compagni, linguetta del round | 1.321 | Mantenere | La linguetta del round diventa la linguetta della fase (PG / GM) e della Paura. |
| Avviso di turno (`turn-notice.ts` e host) | 2.659 | **Riscrivere** | Importa TS contro morte, reminder dei TS e trigger delle zone. Il trasporto (host, consegna) resta; il contenuto diventa «tocca a…», «turno del GM», mossa finale, richiesta di tiro reazione. |
| Menu contestuali, aggiungi, segna | 1.480 | Modificare | «Aggiungi all'iniziativa» diventa «Aggiungi alla scena»; spariscono Leggendarie, Paragon, Epic; arrivano Ambiente, PF condivisi per Orde, tipo di avversario. |
| Azioni rapide delle card | 1.347 | Modificare | Oggi importano i trucchetti; diventano: segna PF/Stress, spendi/guadagna Speranza, casella armatura, attiva (spendi Paura), condizioni. |
| Fazioni | 426 | Mantenere | Le quattro fazioni servono ancora (PG, alleati, neutrali, avversari). |

**PF, Stress, armatura e mappa**

| Sottosistema | Righe | Verdetto | Motivo e cosa diventa |
| --- | ---: | --- | --- |
| Barre sulla mappa | 1.392 | Modificare | Da barra continua con PF temporanei a **file di caselle** (PF; a scelta anche Stress), con visibilità per fazione. Con 1–12 PF il disegno è più semplice. |
| Memoria dei PF e vitali tra scene | 1.800 | Modificare | Il meccanismo resta (memoria dei PG tra le scene); i campi diventano PF segnati, Stress, Speranza, caselle armatura (D5). |
| Console PF rapida e ad area | 1.566 | **Riscrivere** | Oggi sottrae numeri con fattori ×2/×½ e PF temporanei 5E. Nuova **console dei danni**: totale, tipo (fisico/magico/misto), diretto sì/no → resistenza/immunità → gravità rispetto alle soglie → casella armatura (scelta del giocatore) → PF segnati; per i Seguaci il danno in eccesso abbatte altri Seguaci; per le Orde il cambio d'attacco a metà PF; Danno Massiccio come opzione. Cura = «libera N PF». |
| PF condivisi | 698 | Mantenere | Utile per un'Orda rappresentata da più miniature. |
| 0 PF, TS contro morte, stato KO | 806 | **Eliminare** | Sostituiti da un piccolo avviso nuovo: **mossa finale** (tre scelte, il tiro del Dado Speranza per la cicatrice, Rischiare Tutto con i Dadi Dualità). |
| Pill sulla mappa (layout, reconciler, hover) | 2.366 | Mantenere | Generiche; sparisce la pill dedicata alla concentrazione. |
| Aure personalizzate | 3.068 | Mantenere | Con raggi preimpostati per banda (Prossima, Ravvicinata, Lontana). |
| Geometria e strumento delle aree | 3.710 | Modificare | Aggiungere **anelli di banda**, «gruppo entro Prossima da un punto», semicerchio «davanti a te», linea, muro tra due punti; l'inclusione delle caselle della Guida del DM diventa la griglia opzionale 1/3/6/12. Il cono resta solo come forma libera. |
| Motore di zone e aure degli incantesimi | 8.123 | Modificare | Il meccanismo (zone che durano, seguono un token, appartenenza, trigger di entrata e uscita) serve alle 29 carte con effetti persistenti; va staccato dai nomi e dai dati degli incantesimi, con trigger a evento invece che a turno. |
| Tracker della velocità | 3.283 | **Eliminare** | Niente velocità in Daggerheart. Al suo posto, opzionale, un anello Ravvicinata attorno al token trascinato (lo spostamento che si fa insieme a un'azione), riusando l'aggancio al trascinamento. |
| Distanza 3D | 684 | Modificare | Mostra la **banda** (Mischia… Remota) invece dei metri, con la griglia 1/3/6/12/13+. |
| Elevazione | 446 | Mantenere | Ali, forme volanti, Sentinella Alata. |

**Condizioni, effetti, riposi**

| Sottosistema | Righe | Verdetto | Motivo e cosa diventa |
| --- | ---: | --- | --- |
| Motore delle condizioni | 2.141 | Modificare | Istanze con fonte e scadenza restano; l'elenco diventa Nascosto, Trattenuto, Vulnerabile + condizioni speciali col testo; le scadenze diventano manuale, temporanea (rimovibile), fino al riposo, fino al riposo lungo, fine scena, sessione, al danno subito; spariscono round, inizio/fine turno, concentrazione, Indebolimento. |
| UI delle condizioni, durate, riepiloghi | 2.199 | Modificare | Stesse finestre con l'elenco e le scadenze nuove. |
| Buff | 567 | Modificare | Diventano modificatori temporanei (Evasione, soglie, tiri, danni) con la loro scadenza. |
| Reminder dei TS e risoluzione | 4.859 | **Eliminare** | Non ci sono tiri salvezza. La parte utile (chiedere un tiro ai giocatori e raccogliere gli esiti) si rifà sul trasporto degli avvisi di reazione. |
| Riposo di gruppo | 384 | **Riscrivere** | Interludio: scambio libero delle carte, due mosse per PG (1d4 + rango o «tutto»), Prepararsi da soli o insieme, Paura del GM (1d4 o 1d4 + PG), conti alla rovescia a lungo termine, reset per riposo / riposo lungo; riposo interrotto. |

**Incantesimi, attacchi, boss, personaggi**

| Sottosistema | Righe | Verdetto | Motivo e cosa diventa |
| --- | ---: | --- | --- |
| Catalogo e regole degli incantesimi, regole dei singoli incantesimi | ~24.900 | **Eliminare** | 5E puro. |
| Pannello unificato, azioni attive, esecuzione, ciclo di vita | ~28.200 | **Eliminare** | Costruiti attorno a slot, CD, TS, concentrazione e round. Il bisogno corrispondente (carte attive e loro effetti) si riscrive in piccolo (sotto). |
| Concentrazione, slot, TS e attacchi d'incantesimo | 2.622 | **Eliminare** | Non esistono. |
| **Carte dominio** (nuovo) | — | **Riscrivere** | Dotazione di 5 e riserva, Costo di Richiamo, scambio a riposo e salendo di livello, gettoni sulla carta, limiti d'uso, effetti attivi con fine a evento, carte fuori gioco, Grimori con sotto-incantesimi. Riprende l'idea del registro degli incantesimi (una fonte unica nel metadata del token). |
| Console attacchi dei PG | 9.918 | **Riscrivere** | Diventa la **console del tiro**: tiro azione, attacco, Incantesimo, reazione, di gruppo, Combinato; tratto, Esperienze (con la Speranza), Aiutare un Alleato, vantaggio d6, bonus prima del tiro, privilegi dopo il tiro; esito tra cinque; danni = dadi × Competenza + bonus, critico = massimo + tiro; un solo tiro contro più bersagli. Restano la cornice comune delle console (`public/console-panel.css`) e l'apertura automatica quando tocca al PG. |
| Profili d'attacco dei mostri ed euristiche | 586 | **Eliminare** | Il blocco di Daggerheart ha un solo attacco esplicito; non serve un'euristica. |
| Difese e modificatori d'attacco | 946 | **Riscrivere** | Due tipi di danno, resistenza/immunità, danno diretto: poche decine di righe. |
| Avvisi di reazione e attacchi d'opportunità | 2.279 | Modificare | Il trasporto e l'interfaccia degli avvisi restano; i trigger diventano le ~44 carte e le 194 caratteristiche Reazione; l'economia della reazione 5E e l'AdO generico spariscono (resta l'Attacco di Opportunità del Guerriero come tiro reazione). |
| Console Boss | 3.142 | **Riscrivere** | Diventa la **console dell'avversario**: attacco d20 + ATT contro l'Evasione (con vantaggio d20 e Esperienza a 1 Paura), danni contro le soglie del PG, caratteristiche Passiva/Azione/Reazione con il costo in Paura su un pulsante, Stress dell'avversario, Inesorabile, gettoni, Attacco in Massa dei Seguaci. Resta il principio già scelto per la Console Boss: niente menu, tutto leggibile a colpo d'occhio. |
| Profili ed esecuzione dei boss | 2.965 | **Eliminare** | Il parser delle abilità v26 è per statblock 5E; il nuovo blocco ha già le caratteristiche separate. |
| Meccaniche di boss specifici (Auril, Shothragoth) | 776 | **Eliminare** | Legate a statblock 5E. |
| Leggendarie, Paragon, Epic | ~1.150 | **Eliminare** | Sostituite da Inesorabile (X) e dalle attivazioni pagate in Paura; l'idea dei pip si riusa nella console dell'avversario. |
| Scheda del personaggio (`initiative-card-modal.js`) | 5.916 | **Riscrivere** | La scheda di Daggerheart è più corta: tratti, Evasione, armatura, soglie, caselle, Esperienze, Competenza, armi, carte, risorse (§7.3). |
| Capacità di classe (runtime, aure, reminder, stato) | 6.067 | **Riscrivere** | 13 classi, 26 sottoclassi, circa 28 risorse con stato e 35 limiti per periodo, da un catalogo nuovo. Il **registro delle risorse** per token (`classFeatureState`) è il pezzo di idea da riprendere. |
| Talenti, specie, magia selvaggia | 4.573 | **Eliminare** | Sostituiti da origini (48 privilegi) e comunità (15), quasi tutti contatori o testo. |
| Trasformazioni (Forma Selvatica e simili) | 1.575 | **Riscrivere** | L'idea del livello sostitutivo resta; i dati e le regole diventano Forma Bestiale (24 forme, Fragile, niente carte, armatura nel corpo) e le sei trasformazioni di *Hope & Fear*. |

**Strumenti, dati e contorno**

| Sottosistema | Righe | Verdetto | Motivo e cosa diventa |
| --- | ---: | --- | --- |
| Dadi (formule, scena 3D, suono, vassoio) | 1.761 + 9,1 MB | Modificare | Diventa il **centro**: Dadi Dualità (due d12 di colore diverso), dado vantaggio/svantaggio d6, d20 del GM con vantaggio, classificazione dei cinque esiti, evento «tiro risolto» per tutto il resto (§7.1). |
| Orologi | 704 | Modificare | Diventano i **conti alla rovescia**: valore qualsiasi (anche casuale), scendono invece di riempirsi, tipi standard, dinamico di progresso e di conseguenze, Ciclo, Crescente, Decrescente, a lungo termine; avanzamento automatico sugli esiti registrati; visibili o segreti; collegati a un avversario o a un ambiente. |
| Compendio (Enciclopedia DM) | 1.583 + 777 KB | Modificare | Motore di ricerca, pacchetti privati e testo strutturato restano; il contenuto si rigenera dai PDF italiani (regole, condizioni, carte, avversari, ambienti) con la pipeline già usata per la 5E. |
| Import da 5eTools | ~1.480 | **Eliminare** | — |
| Import di statblock da testo | ~1.400 | **Riscrivere** | Parser del blocco di Daggerheart in italiano (ancorato alla riga `Difficoltà:`), con le insidie di §3.14 e i casi di prova già trascritti. |
| Import della scheda PG | 709 | **Riscrivere** | Nuovo formato JSON (§7.3) e nuovo prompt per ricavarlo dalla scheda PDF. |
| Idratazione dei mostri (PF, taglia) | 296 | **Eliminare** | I campi del blocco nuovo sono già numeri. |
| Opzioni e profili Tavolo/Online | 3.354 | Mantenere | Il motore resta; le policy 5E escono, entrano quelle nuove (regole opzionali, visibilità della Paura e della Difficoltà). |
| Schermo del giocatore, assegnazione dei giocatori | ~1.030 | Mantenere | Generici. |
| Animazioni: renderer | ~2.300 | Mantenere | Generico. |
| Animazioni: mappatura per incantesimo | 1.409 | **Eliminare** | Indicizzata per incantesimo; una mappatura per carta dominio si può rifare più tardi. |

**Test, script, CI**

- I **test** dei sottosistemi eliminati (circa 42.000 righe solo per gli incantesimi, più classi, attacchi, boss) se
  ne vanno con loro; restano quelli di infrastruttura, cronologia, registro, opzioni, mappa.
- Gli **harness** (SDK finto, metadata, prestazioni, IndexedDB finto, pagine del banco) restano.
- **Script**: restano build, prestazioni, versione, checksum, il ripristino della struttura del testo dai PDF; se ne
  vanno i generatori e gli audit di incantesimi e capacità; arrivano i generatori dei cataloghi di Daggerheart.
- **CI**: `check:spells` esce; entrano i controlli dei cataloghi nuovi (conteggi: 210 carte, 263 avversari, 47
  ambienti, 13 classi).

---

## 7. Architettura proposta per il fork

### 7.1 Il motore a eventi: «tiro risolto»

Il fork gira attorno a un evento, registrato una volta e letto da tutti i sottosistemi:

```jsonc
// operazione roll:record (passa dal broker delle mutazioni, entra nella cronologia e nel registro)
{
  "actor": "<tokenId>",
  "kind": "action | attack | spell | reaction | group | tagteam | fate | adversary-attack | adversary-reaction",
  "trait": "agi | for | ast | ist | pre | con | null",
  "hopeDie": 9, "fearDie": 4,          // PG; per gli avversari "d20": 17
  "total": 17, "difficulty": 15,        // la Difficoltà può restare segreta (D10)
  "outcome": "crit | success-hope | success-fear | fail-hope | fail-fear",
  "targets": ["<tokenId>"],             // facoltativo: più bersagli, un solo tiro
  "source": "dice | tap"                // dadi nel plugin oppure esito toccato dal GM (D4)
}
```

Cosa ne segue, senza altri clic (le regole di §3.2, §3.3 e §3.13):

| Esito di un tiro azione, attacco o Incantesimo di un PG | Effetto automatico |
| --- | --- |
| Con Speranza (successo o fallimento) o critico | +1 Speranza al PG (massimo 6 meno le cicatrici); con il critico anche −1 Stress |
| Con Paura (successo o fallimento) | +1 Paura al GM (massimo 12) |
| Fallimento o Paura | La fase passa al GM (bacheca, avviso di turno) |
| Qualsiasi | I conti alla rovescia standard scendono di 1; quelli dinamici secondo la tabella di §3.13 |
| Qualsiasi | Le risorse che leggono l'esito vengono proposte (Segni Misteriosi, Coraggio, Dadi dello Sterminatore, Favori, Fasi Lunari…) |
| Tiro reazione | Niente Speranza, niente Paura, nessun conto alla rovescia |
| Tiro Combinato | Conta come un tiro solo; con Speranza +1 a ogni PG coinvolto, con Paura +1 Paura per ogni PG |

Gli altri eventi del motore: **fase del GM iniziata/finita**, **avversario attivato** (con il costo pagato),
**riposo breve/lungo** (anche interrotto), **fine scena**, **inizio/fine sessione**, **danno applicato** (con gravità e
casella armatura), **ultimo PF** (mossa finale), **ultimo Stress** (Vulnerabile). Le scadenze di condizioni, effetti e
risorse sono scritte contro questi eventi, mai contro round o turni.

### 7.2 La bacheca del protagonismo

Sostituisce l'ordine d'iniziativa. Riusa le card (classic e compatta, lo stile BG3, le animazioni), lo scheduler di
render, il gateway dello stato, le code e le guardie contro lo stato stantio.

- **Testata**: la **Paura** (12 pip, visibile ai giocatori, sullo schermo del tavolo), la **fase** (PG / GM) e i
  **conti alla rovescia** attivi.
- **PG**: Speranza, PF, Stress, caselle armatura, Evasione, condizioni; un segno discreto per chi **è già stato
  protagonista** in questo giro, calcolato dagli esiti registrati e azzerato quando tutti lo sono stati (il manuale
  chiede di dare spazio a ogni PG; nessun segno a mano).
- **Avversari**: PF e Stress a caselle, Difficoltà e soglie (solo al GM), tipo e rango, **attivazioni in questo turno
  del GM** (con i pip di Inesorabile), gettoni, condizioni; Seguaci e Orde raggruppati come oggi i gruppi «(n) Nome».
- **Ambiente**: una card virtuale (come le voci virtuali di oggi) con Impeti, Difficoltà e caratteristiche.
- **Fase del GM**: il primo avversario attivato è la mossa gratuita, ogni attivazione successiva chiede 1 Paura (la
  card mostra il costo prima del clic); lo stesso avversario non si attiva due volte salvo Inesorabile (X). Pulsanti
  «Interrompi (1 Paura)» e «Torna ai PG».
- **Sulla mappa**: l'etichetta del turno attivo di oggi diventa il segno del **protagonista** corrente.
- **Opzione** «Azioni dei protagonisti» (regola facoltativa, p.89): 3 gettoni per PG che scendono da soli a ogni tiro
  registrato e si ricaricano quando tutti li hanno spesi.

### 7.3 Modello dati

Come oggi: il **profilo** (scheda PG, blocco dell'avversario, ambiente) vive nel registro delle card nella room; i
**valori vivi** vivono nel metadata del token; lo **stato globale** nella scena; ciò che deve sopravvivere al cambio
di mappa e di sessione nella room.

```jsonc
// token: <namespace>/meta — valori vivi, comuni a PG e avversari (unito, mai sostituito)
{
  "kind": "pg | ally | adversary",
  "hpMax": 6, "hpMarked": 0,
  "stressMax": 6, "stressMarked": 0,
  "armorMax": 3, "armorMarked": 0,          // PG (e Fortezza della Selva e simili come entità)
  "hope": 2, "scars": 0,                     // solo PG
  "conditions": [{ "id": "vulnerable", "source": "<id>", "ends": "temporary | rest | long-rest | scene | session | damage | manual" }],
  "effects":    [{ "id": "<cardId>:<n>", "mods": [{ "stat": "evasion", "v": 2 }], "ends": "hit | rest | scene | gm-fear | …" }],
  "resources":  { "rally_die": { "k": "die", "faces": 6, "vals": [4] } },
  "cards":      { "loadout": ["…"], "vault": ["…"], "tokens": { "<cardId>": 3 }, "used": { "<cardId>": true } },
  "form": null,                              // Forma Bestiale o trasformazione: livello sostitutivo
  "gmActivations": 0                         // avversari: attivazioni nel turno del GM corrente
}
```

```jsonc
// room: <namespace>/campaign — ciò che attraversa scene e sessioni
{ "fear": 4, "longCountdowns": [ … ], "session": { "id": "…", "n": 12 }, "hpMemory": { … } }

// scena: <namespace>/state — lo stato della scena
{ "phase": "pg | gm", "spotlight": "<id>|null", "acted": ["<id>"], "order": ["<id>"],
  "environment": "<cardId>|null", "countdowns": [ … ], "sceneId": "…", "collapsed": [ … ] }
```

```jsonc
// profilo PG nel registro delle card (estratto del modello proposto dall'agente sui personaggi)
{
  "cls": "stregone", "sub": "potere_primordiale", "lvl": 1,
  "heritage": { "origin": "elfo", "origin2": null, "community": "erudita" },
  "traits": { "agi": 0, "for": -1, "ast": 1, "ist": 2, "pre": 1, "con": 0 }, "traitsMarked": ["ist", "pre"],
  "evasion": { "base": 10, "adv": 0 }, "hp": { "base": 6, "extra": 0 }, "stress": { "base": 6, "extra": 0 },
  "prof": 1, "experiences": [{ "t": "Mago di Corte", "m": 2 }],
  "weapons": { "primary": { "ref": "bastone_doppio" }, "secondary": null, "inventory": [null, null] },
  "armor": { "ref": "corazza_cuoio" }, "gold": { "h": 1, "s": 0, "c": 0 },
  "advancements": { "t2": { … }, "t3": { … }, "t4": { … } }, "multiclass": null,
  "companion": null, "notes": ""
}
```

```jsonc
// profilo avversario nel registro delle card (dal formato del blocco, §3.14)
{
  "name": "…", "type": "solitario", "tier": 4, "hordePerHp": null,
  "difficulty": 19, "thresholds": { "major": 35, "severe": 65 }, "hp": 10, "stress": 5,
  "atk": 6, "attack": { "name": "…", "range": "mischia", "dmg": "4d10+8", "type": "fis" },
  "experiences": [{ "t": "…", "m": 3 }],
  "features": [{ "name": "Inesorabile (3)", "kind": "passiva", "fear": 0, "text": "…" },
               { "name": "…", "kind": "azione", "fear": 1, "stress": 0, "text": "…" }],
  "relentless": 3, "minion": null, "horde": null, "resist": { "fis": "resist" }
}
```

**I PF si salvano come caselle segnate** (`hpMarked`), non come residui: è la lingua del gioco («segnate 2 PF»), i
massimi cambiano spesso (avanzamenti, Rianimato, cicatrici sulla Speranza) e una casella in più non deve spostare il
valore corrente. Barre e card mostrano «segnati su massimo». È una scelta da confermare (D5): la regola di AGENTS.md
sui campi canonici `meta.hp`/`meta.hpMax` vale per il plugin 5E, e il fork ne avrebbe una sua.

### 7.4 Catalogo delle operazioni

Sul trasporto di oggi (broker, coordinatore, undo, cronologia), un catalogo nuovo e più corto:

- `roll:record` (l'evento di §7.1, con i suoi effetti come operazioni figlie nello stesso gruppo di undo);
- `vitals:mark` / `vitals:clear` per PF, Stress, caselle armatura;
- `damage:apply`: danno → resistenza/immunità → gravità → casella armatura (se il giocatore la usa) → PF segnati;
  Seguaci (danno in eccesso) e Orde (cambio d'attacco) nello stesso passaggio;
- `hope:gain` / `hope:spend`, `fear:gain` / `fear:spend` (room);
- `condition:add` / `condition:remove`, `effect:add` / `effect:end`;
- `countdown:create` / `tick` / `reset` / `delete`;
- `cards:swap` / `cards:recall` (Stress) / `cards:token` / `cards:use` / `cards:retire`;
- `spotlight:set`, `phase:gm-start` / `phase:gm-end`, `adversary:activate` (con il costo in Paura);
- `rest:short` / `rest:long` (con le mosse scelte), `scene:end`, `session:start`;
- `final-move:resolve`.

### 7.5 Chiavi e convivenza

Il fork usa un **namespace nuovo** (per esempio `com.thebigpicture.daggerheart`) per metadata, broadcast,
localStorage e IndexedDB: così le due estensioni possono stare installate nella stessa stanza senza leggersi i dati e
la produzione del plugin 5E non si tocca (D2). Le regole di AGENTS.md (unire e mai sostituire i metadata, non toccare
gli attachment delle barre alla cieca, non scavalcare le guardie di `renderAll()`) passano al fork con i nomi nuovi.

### 7.6 Cataloghi

Dai PDF dell'utente, con la pipeline di testo già usata per la 5E (estrazione, ricostruzione di paragrafi ed elenchi,
pacchetti privati):

| Catalogo | Voci | Formato di partenza |
| --- | ---: | --- |
| Carte dominio | 210 (+33 sotto-incantesimi dei Grimori) | Intestazione fissa `<Tipo> <dominio> di Livello N Costo di Richiamo: R` |
| Avversari | 263 | Blocco ancorato a `Difficoltà:` (§3.14) |
| Ambienti | 47 | Come gli avversari, senza PF |
| Classi e sottoclassi | 13 e 26 (118 privilegi di sottoclasse) | Testo dei capitoli e schede |
| Origini e comunità | 24 e 15 | Testo dei capitoli e carte |
| Forme Bestiali e trasformazioni | 24 e 6 | Tabelle (colonne da verificare) |
| Armi, armature, oggetti, Scorte | ~200, ~45, 120, 120 | Tabelle per rango |

I conteggi diventano controlli automatici nella CI, come oggi per i 477 incantesimi.

---

## 8. Fasi e lotti

L'ordine mette prima ciò che rende il fork **giocabile al tavolo** (la contabilità), poi gli strati di automazione.
Ogni fase chiude con build e test verdi e con le sue voci nella lista delle prove in stanza.

| Fase | Contenuto | Riusa | Dimensione |
| --- | --- | --- | --- |
| **F0 — Fork e potatura** | Repository nuovo, namespace nuovo, manifest e deploy separati; via i sottosistemi del verdetto «Eliminare» con i loro test, mantenendo la build verde; `background.js` ripulito. | Tutto ciò che resta | Grande ma meccanica |
| **F1 — Vitali e danni** | Metadata del token (§7.3), barre a caselle sulla mappa, memoria dei vitali, console dei danni (soglie, armatura, resistenze, diretto, Seguaci, Orde, Danno Massiccio in opzione), Stress pieno → Vulnerabile, Stress in eccesso → 1 PF, mossa finale e cicatrici. | Barre, memoria, PF condivisi, broker | Media |
| **F2 — Bacheca e Paura** | Bacheca del protagonismo (§7.2), Paura nella room, fase del GM con attivazioni pagate e Inesorabile, segno «già protagonista», card dell'Ambiente, avviso di turno nuovo, segno sulla mappa. | Card, scheduler, gateway, code, avvisi | Grande |
| **F3 — Tiri** | `roll:record`; esito a un tocco (profilo Tavolo); Dadi Dualità, d6 di vantaggio e d20 del GM nei dadi 3D (profilo Online); console del tiro (Esperienze, Aiutare un Alleato, gruppo, Combinato); attacco dell'avversario contro l'Evasione. | Dadi, cornice delle console | Media |
| **F4 — Conti alla rovescia** | Dagli orologi: valori qualsiasi e casuali, tipi standard/dinamico/Ciclo/Crescente/Decrescente/a lungo termine, avanzamento automatico, progetti di interludio. | Orologi | Piccola |
| **F5 — Condizioni, effetti, interludi** | Tre condizioni + speciali, scadenze a evento, modificatori temporanei, interludio completo (mosse, Paura del GM, scambio delle carte, conti a lungo termine), inizio e fine sessione. | Condizioni, pill, buff | Media |
| *Prima versione giocabile* | *F0–F5: il tavolo vede e conta tutto quello che il gioco chiede di contare.* | | |
| **F6 — Scheda PG e import** | Profilo PG, editor essenziale, import JSON con prompt dalla scheda PDF, livelli e avanzamenti, multiclasse, Compagno. | Registro delle card | Media |
| **F7 — Carte dominio** | Catalogo dai PDF, dotazione/riserva/Costo di Richiamo, gettoni, usi, effetti attivi, automazione delle 85 carte a contatore, Grimori. | Registro, effetti | Grande |
| **F8 — Classi, origini, forme** | Risorse con stato delle 13 classi, limiti per periodo, origini e comunità, Forma Bestiale e trasformazioni come livello sostitutivo. | Registro risorse | Grande |
| **F9 — Avversari e ambienti** | Parser dei blocchi (263 + 47), console dell'avversario completa (caratteristiche a costo, Stress, gettoni, Accumulo, evocazioni, Cambio di Fase, Evoluzione), Punti Battaglia. | Import da testo, console | Grande |
| **F10 — Mappa** | Distanza a bande, anelli, gruppo entro Prossima, semicerchio, linea, muri, zone persistenti, richiesta di tiro reazione per area, anello Ravvicinata al trascinamento. | Aree, zone, aure, distanza | Media |
| **F11 — Contorno** | Compendio dai PDF, registro con gli eventi nuovi, animazioni per carta, profilo Online, rifiniture. | Compendio, registro, renderer | Media |

---

## 9. Decisioni

**Approvate tutte dall'utente il 2026-11-19, nella forma raccomandata** (la prima opzione di ciascuna, in grassetto).

| # | Domanda | Opzioni (raccomandata per prima) | Perché |
| --- | --- | --- | --- |
| D1 | Che forma ha il fork? | **(a) Repository separato** copiato da questo con la storia, sviluppo indipendente; (b) un solo plugin con il sistema di gioco selezionabile | Il 55% del codice è 5E e il nucleo ha innesti 5E: tenere due sistemi nello stesso codice chiederebbe prima un refactoring del nucleo del plugin in produzione. |
| D2 | Stesso namespace o nuovo? | **(a) Nuovo** (`com.thebigpicture.daggerheart` o simile); (b) lo stesso | Con un namespace nuovo le due estensioni convivono nella stessa stanza e il plugin 5E non si tocca. |
| D3 | Come si rappresenta il protagonismo? | **(a) Bacheca senza ordine**, fase PG/GM, segno automatico «già protagonista», gettoni azione come opzione spenta; (b) un ordine fisso di comodo | (b) contraddice il gioco (p.89: niente ordine né turni). |
| D4 | Come entrano gli esiti dei tiri? | **(a) Tavolo: un tocco sull'esito** (cinque pulsanti sulla card del PG); **Online: Dadi Dualità nel plugin** che classificano da soli; (b) solo contatori a mano (Paura ±, Speranza ±), nessun automatismo; (c) dadi digitali anche al tavolo | Senza l'esito il plugin non sa né chi guadagna Speranza o Paura, né quando passa il turno, né quali conti alla rovescia scendono. Con i dadi fisici serve un gesto per tiro: sostituisce tre o quattro contatori a mano, ma resta un gesto, e la decisione già presa di non far segnare al GM lo stato del turno chiede di sceglierlo esplicitamente. |
| D5 | Come si salvano i PF? | **(a) Caselle segnate** (`hpMarked` su `hpMax`, lo stesso per Stress e armatura); (b) PF residui come oggi | (a) è la lingua del gioco e regge i massimi che cambiano. |
| D6 | Quanta automazione per le carte dominio? | **(a) Contabile**: costi, gettoni, usi, scadenze, automazione completa delle 85 carte a contatore e della geometria comune, il resto come promemoria con il testo; (b) carta per carta come gli incantesimi 5E | Le carte sono soprattutto contabilità (§3.11); il gioco affida il resto al GM. |
| D7 | Da dove vengono i dati? | **(a) PDF italiani dell'utente**; (b) SRD inglese DPCGL (JSON della comunità) tradotto; (c) entrambi | Il plugin è in italiano e i PDF coprono anche *Hope & Fear*; la pipeline dai PDF esiste già. |
| D8 | Dove vivono i testi? | **(a) Pacchetti privati costruiti in locale**, come le regole 5E dai manuali dell'utente; nel bundle solo i dati meccanici, con il repository reso privato prima che entri un catalogo; (b) tutto nel bundle | Testi della traduzione di Acheron Games, uso privato. |
| D9 | *Hope & Fear* subito o dopo? | **(a) Subito** (stesse strutture, solo dati in più); (b) dopo il Manuale Base | Il manuale consiglia di introdurla dopo qualche sessione, ma è una scelta del tavolo, non del software. |
| D10 | Che cosa vedono i giocatori? | **(a) Paura sempre visibile** (p.156), Difficoltà nascosta con opzione per mostrarla, PF e soglie degli avversari per fazione come oggi; (b) Paura nascosta | La regola chiede una Paura visibile; la Difficoltà è a discrezione del GM. |
| D11 | Quali regole opzionali diventano opzioni? | **(a) Danno Massiccio (spenta), Distanze precise (accesa), Azioni dei protagonisti (spenta), Monete d'oro (spenta)**; sott'acqua e cadute solo nel compendio; (b) nessuna | Il tavolo gioca su una mappa a griglia: le Distanze precise sono il caso normale. |
| D12 | Che cosa viene prima? | **(a) Prima versione giocabile F0–F5**, poi carte, classi, avversari e mappa; (b) cataloghi e automazione per primi | La contabilità visibile è il valore che resta anche senza automazione. |

---

## 10. Rischi e punti aperti

1. **Dadi fisici al tavolo.** Lo schermo del tavolo vive di dadi veri: se il GM non registra l'esito, la parte
   automatica (Speranza, Paura, fase, conti alla rovescia) si ferma e resta la contabilità a mano (D4).
2. **Riscrivere l'hub del tracker** può far perdere la rifinitura di oggi (animazioni, layout, guardie contro lo stato
   stantio). Si riduce riusando i moduli di render e animazione e provando ogni lotto in vista compatta ed espansa.
3. **Distanze in italiano.** *Prossima* (Very Close, 3 caselle) è più vicina di *Ravvicinata* (Close, 6 caselle):
   l'ordine è controintuitivo e facile da sbagliare in UI, parser e test. Altre incoerenze dell'edizione italiana:
   «Rango» e «Grado» per Tier, «Lame» e «Lama», «riserva» per le carte e per la Paura, «Prossima/Ravvicinata» in
   qualche blocco lasciato in inglese.
4. **Licenza e diffusione.** I testi sono della traduzione di Acheron Games; la DPCGL copre l'SRD inglese, non la
   traduzione. Il fork resta per uso privato e il repository va reso privato prima che entri un catalogo (D8).
5. **Conteggi approssimati.** I numeri delle meccaniche vengono da euristiche degli agenti (margine dichiarato di
   circa ±2 sulle carte); i campi strutturati (Difficoltà, PF, soglie, livelli, costi) sono completi.
6. **Elementi grafici dei PDF.** Alcuni dati sono disegnati e non entrano nel testo estratto. I quattro emersi nello
   studio sono stati verificati sulle pagine disegnate il 2026-11-19 (§3.10): caselle degli avanzamenti, Stress del
   Compagno, abbinamento privilegi–forme (dalla scheda in appendice), multiclasse delle classi di *Hope & Fear* (regola
   generale). Altri ne usciranno costruendo i cataloghi: le pagine si possono disegnare in immagine con l'API PDF di
   Windows (`Windows.Data.Pdf`), senza installare nulla.
7. **Due codici da mantenere.** Un fork non riceve da solo le correzioni all'infrastruttura comune: vanno portate a
   mano. Conviene annotare nel fork quali moduli sono condivisi.
8. **La regola d'oro.** Il GM piega le regole alla finzione: ogni automatismo deve essere annullabile e correggibile a
   mano (l'undo c'è già) e nessuno deve bloccare una scelta del tavolo.
9. **Lo standalone.** Le stesse scelte (bacheca, modello dei vitali) potranno servire anche a Take Initiative
   Standalone, che ha già un motore nativo; non rientra in questo studio.

---

## 11. Glossario italiano–inglese

Termini dell'edizione italiana con l'originale inglese. Quelli segnati con «?» sono ricostruiti, non stampati nei
PDF.

| Italiano | Inglese |
| --- | --- |
| Speranza / Paura | Hope / Fear |
| Dadi Dualità (Dado Speranza, Dado Paura) | Duality Dice (Hope Die, Fear Die) |
| Protagonista, protagonismo | Spotlight |
| Mossa del GM, mossa con Paura | GM move, Fear move |
| Tiro azione / reazione / Incantesimo | Action / Reaction / Spellcast roll |
| Tiro di gruppo / Tiro Combinato | Group Action roll / Tag Team roll |
| Aiutare un Alleato | Help an Ally |
| Tiro del fato | Fate roll |
| Difficoltà | Difficulty |
| Vantaggio / Svantaggio | Advantage / Disadvantage |
| Tratti: Agilità, Forza, Astuzia, Istinto, Presenza, Conoscenza | Traits: Agility, Strength, Finesse, Instinct, Presence, Knowledge |
| Evasione | Evasion |
| Esperienza | Experience |
| Competenza | Proficiency |
| Tratto da Incantatore | Spellcast trait |
| Punti Ferita (PF) | Hit Points |
| Soglie di danno: Minore, Maggiore, Grave, Massiccio | Damage thresholds: Minor, Major, Severe, Massive |
| Punteggio di Armatura / Caselle Armatura | Armor Score / Armor Slots |
| Danno fisico, magico, diretto | Physical, magic, direct damage |
| Nascosto, Trattenuto, Vulnerabile | Hidden, Restrained, Vulnerable |
| Mischia, Prossima, Ravvicinata, Lontana, Remota, Fuori Portata | Melee, Very Close, Close, Far, Very Far, Out of Range |
| Rango | Tier |
| Interludio; riposo breve / lungo | Downtime; short / long rest |
| Curare Ferite, Rimuovere Stress, Riparare Armature, Prepararsi, Lavorare a un Progetto | Tend to Wounds, Clear Stress, Repair Armor, Prepare, Work on a Project |
| Mossa finale: Fiammata di Gloria, Evitare la Morte, Rischiare Tutto | Death move: Blaze of Glory, Avoid Death, Risk It All |
| Cicatrice | Scar |
| Conto alla rovescia (standard, dinamico, Ciclo, Crescente, Decrescente) | Countdown (standard, dynamic, loop, increasing, decreasing)? |
| Manciata, sacco, forziere | Handful, bag, chest |
| Retaggio, Origine, Comunità | Heritage, Ancestry, Community |
| Privilegio (di classe, sottoclasse, origine); Caratteristica (di arma, armatura, avversario) | Feature |
| Privilegio base, Specializzazione, Maestria | Foundation, Specialization, Mastery |
| Privilegio della Speranza | Hope feature |
| Dominio; carta dominio | Domain; domain card |
| Dotazione / Riserva / Costo di Richiamo | Loadout / Vault / Recall Cost |
| Abilità, Incantesimo, Grimorio | Ability, Spell, Grimoire |
| Domini: Arcano, Lame, Ossa, Codice, Grazia, Mezzanotte, Saggezza, Splendore, Valore, Terrore | Arcana, Blade, Bone, Codex, Grace, Midnight, Sage, Splendor, Valor, Dread? |
| Classi: Bardo, Consacrato, Druido, Fuorilegge, Guardiano, Guerriero, Mago, Ranger, Stregone | Bard, Seraph, Druid, Rogue, Guardian, Warrior, Wizard, Ranger, Sorcerer |
| Classi di *Hope & Fear*: Assassino, Lottatore, Strega, Warlock | Assassin?, Brawler?, Witch?, Warlock |
| Forma Bestiale; Compagno | Beastform; Companion |
| Avversario; blocco statistiche | Adversary; stat block |
| Tipi: Base, Bruto, Condottiero, Controparte, Orda, Seguace, Sicario, Solitario, Supporto, Tiratore | Standard, Bruiser, Leader, Social, Horde, Minion, Skulk, Solo, Support, Ranged |
| Inesorabile (X) | Relentless (X) |
| Motivazioni e Tattiche | Motives & Tactics |
| Attacco in Massa | Group Attack? |
| Cambio di Fase; Evoluzione; Accumulo | Phase change?; Evolution?; ? |
| Ambiente: Esplorazione, Contesto Sociale, Attraversamento, Evento | Environment: Exploration, Social, Traversal, Event |
| Impeti; Potenziali Avversari | Impulses; Potential Adversaries |
| Punti Battaglia | Battle Points |
| Modello di campagna | Campaign frame |
