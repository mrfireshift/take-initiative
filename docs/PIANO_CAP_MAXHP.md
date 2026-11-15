# CAP-MAXHP: PF massimi reversibili

Piano del 13/11/2026. Riprende lo studio del 3/11 (lotti X1–X4, decisioni M1–M7), fermato
perché troppo rischioso. Il 13/11 i rischi sono stati verificati sul codice e la regola della
memoria (M0) è stata confermata.

Stato delle decisioni: M0 confermata; M1 e M4 chiuse; M2, M3 e M5–M11 approvate come
consigliato il 13/11.

## Stato: fatto il 13/11

Tutti i lotti sono fatti, con i test e la prova al banco con il pannello vero. Le prove in
Owlbear sono nella sezione A18 di [PROVE_IN_STANZA.md](PROVE_IN_STANZA.md).

Dove l'esecuzione si è scostata dal piano:

- **X0:** senza pill che cambiano il massimo la memoria registra i valori di sempre. I PF
  temporanei del vecchio formato restano com'erano: il piano prevedeva di toglierli.
- **X1:**
  - Ho trovato una sesta scrittura da allineare: l'import dei PF dallo statblock dà il
    massimo base, e su un mostro con Aiuto ora aggiunge il bonus, a PF pieni.
  - L'importo sta in testa al dettaglio della pill («PF max +N»), perché il chip si vede solo
    nel cassetto.
- **X2:**
  - Ferire passa dalla corsia del comando, come Disintegrazione.
  - L'importo della riduzione si ferma dove il massimo arriverebbe sotto 1, contando un
    Ferire precedente.
- **X4:**
  - Il Banchetto passa dalla corsia del comando, come Guarigione di massa, con un campo
    «2d10» per bersaglio.
  - Il vantaggio ai TS di Saggezza è un'etichetta: non c'è una meccanica generale.
- **X5:** il riposo legge da ogni pill quale riposo la chiude (`restEnds`): «short» per
  Ferire, «long» per Aiuto.

## 1. Cosa copre

Testi 2014.

| Incantesimo | Cosa fa ai PF | Durata | Oggi |
|---|---|---|---|
| Aiuto (2°) | Fino a 3 creature: +5 ai PF massimi e ai PF attuali, altri +5 per ogni slot sopra il 2°. | 8 ore | Solo la pill di 8 ore. I PF si cambiano a mano. |
| Banchetto degli eroi (6°) | Fino a 12 creature oltre al caster: +2d10 ai massimi e agli attuali. In più cura malattie e veleno, dà l'immunità al veleno e a Spaventato e il vantaggio ai TS di Saggezza. | 24 ore | Solo catalogo. |
| Ferire (6°) | TS su Costituzione: 14d6 necrotici, la metà se lo supera. Il danno non porta sotto 1 PF. Se fallisce, il massimo si riduce del danno subito. | La riduzione dura 1 ora; la toglie prima qualsiasi effetto che cura una malattia. | Il pannello indica il TS. Danno e riduzione si fanno a mano. |
| Ristorare superiore (5°) | Indebolimento −1, oppure termina uno solo tra: affascinato o pietrificato, una maledizione, una riduzione di caratteristica, una riduzione dei PF massimi. | Istantanea | Solo catalogo. |

## 2. PF temporanei e PF massimi

Sono due cose diverse e restano separate.

| | PF temporanei (CAP-TEMP) | Bonus o riduzione dei massimi (CAP-MAXHP) |
|---|---|---|
| Dove stanno | In `meta.tempHp`. La pill che li ha dati è in `meta.tempHpSource`. | Dentro `meta.hpMax`, che resta l'unico massimo. La pill ricorda di quanto (`mechanics.maxHp`). |
| Danno | Lo assorbono per primi. | Nessun effetto diretto. |
| Cure e riposo | Non si curano. | Arrivano fino al nuovo massimo. |
| Quando la pill finisce | Spariscono quelli rimasti (lotto T3a). | Il massimo torna com'era. I PF attuali scendono solo se sono sopra il nuovo massimo. |
| Memoria del PG | Non ci entrano. | Non ci entrano (M0). |

Il punto delicato è il vecchio formato, che salva i PF temporanei come PF sopra il massimo:

- un massimo che scende senza toccare i PF farebbe nascere temporanei finti;
- un massimo che sale si mangerebbe quelli veri.

Per questo ogni scrittura di CAP-MAXHP scrive PF e massimo insieme, nel formato nuovo, con `meta.tempHp` a parte. I PF attuali non superano mai il massimo.

## 3. M0, la regola della memoria (confermata il 13/11)

**La memoria tiene il PG senza gli effetti in corso, come se finissero adesso.**

- **Salvataggio:** massimo base = `hpMax` − il bonus delle pill del token; PF = il minore tra `hp` e la base.
- **Ripristino su un token:** `hpMax` = la base + il bonus delle pill di quel token, mai sotto 1; PF = il minore tra quelli salvati e il nuovo massimo.
- **Confronto in `actorVitals`** (cioè la verifica che il token sia già allineato alla memoria): si confrontano le basi. Altrimenti ogni ricarica di una scena con Aiuto riscriverebbe il token da 35/35 a 30/35.

Esempio con un PG da 30 PF massimi:

| Momento | Scena A | Memoria | Scena B |
|---|---|---|---|
| Aiuto al 2° | 35/35, con la pill | 30/30, non si scrive: la base non cambia | — |
| Subisce 3 danni | 32/35 | 30/30 | — |
| Il PG passa alla scena B | — | 30/30 | 30/30, senza pill |
| Il PG torna nella scena A | 30/35, la pill è ancora lì | 30/30 | — |
| Il GM toglie la pill | 30/30 | 30/30 | — |

Cosa ne segue:

- **Il bonus vive dove vive la pill.**
  - In un'altra scena il PG ha il massimo base.
  - Tornando dove c'è la pill il massimo risale, ma i PF attuali dati al lancio restano persi, se la memoria li aveva già salvati al ribasso. È come se l'effetto fosse finito e poi ripreso.
- **La memoria non si scrive né al lancio né alla fine**, perché lanciare o togliere un bonus non cambia la base. La cambiano solo danni, cure e correzioni.
- **Senza pill che cambiano il massimo la memoria registra i valori di sempre**, compresi i PF temporanei del vecchio formato. (Il 13/11 avevo previsto di toglierli; in X0 ho preferito non cambiare nulla dove non c'è un bonus.)

**I punti da toccare sono cinque.** Il 13/11 ne avevo contati tre; rileggendo il codice ne ho trovati altri due.

1. `syncHPBatchToMemory` in `hpMemory.js`: tutti i salvataggi dopo danni, cure, riposo e Cronologia.
2. `persistRemovedHPItems` in `hpMemory.js`: il salvataggio quando un PG lascia la scena. Scrive da solo, senza passare dal punto 1.
3. `applyHPMemoryToSceneForMissingHP` in `hpMemory.js`: il riempimento di un token senza PF.
4. `validCanonicalHP` in `actorVitalsStore.js`: inizializzazione, confronto e salvataggio.
5. `metadataWithCanonicalHP` in `actorVitalsStore.js`: il ripristino.

**Valori e pill devono essere dello stesso momento.**

- I chiamanti di `syncHPBatchToMemory` passano i PF che hanno chiesto e, spesso, i token letti prima del comando.
- Con le pill nel conto questo diventa pericoloso. Esempio: Guarigione chiude la riduzione di Ferire. I PF scritti sono già quelli nuovi, ma il token letto prima del comando ha ancora la pill, e la base verrebbe 149 invece di 100.
- Per questo X0 fa leggere a `syncHPBatchToMemory` massimo, PF e pill dal token dopo il comando. I valori passati dai chiamanti restano solo per il caso in cui il token non si legge.

Senza pill di CAP-MAXHP, cioè oggi, il bonus vale 0 e la regola non cambia nulla. L'unica differenza è che la memoria prende i PF scritti sul token e non quelli chiesti: con Interdizione alla morte, che lascia 1 PF dove il colpo chiedeva 0, oggi la memoria registrava 0. Per questo X0 si può provare da solo, prima del motore.

## 4. Lotti

### X0. Memoria senza effetti (M0)

- **`src/maxHpModifierCore.js`**, puro: calcola il bonus delle pill attive (`mechanics.maxHp`, con la regola M2), la base e il massimo effettivo.
- **I cinque punti** del paragrafo 3, con la lettura del token dopo il comando.
- **`docs/ACTOR-HP-PERSISTENCE.md`:** aggiungere la regola.
- **Test:**
  - il calcolo, come test di unità;
  - salvataggio, confronto e ripristino con una pill finta;
  - una ricarica della scena che non riscrive il token;
  - andata e ritorno tra due scene;
  - un token rimosso dalla scena;
  - i temporanei del vecchio formato.
- **Al banco:** due scene con lo stesso PG e una pill finta.

### X1. Motore e Aiuto

**Il motore** sta nel coordinatore (`prepareEffectsMutation`), accanto alla scadenza dei temporanei (lotto T3a).

- Per ogni creatura del comando confronta il bonus prima e dopo. Se cambia, fa una sola scrittura di PF e massimo, nello stesso comando e nella stessa voce della Cronologia: si annulla con Annulla.
- Il massimo cambia della differenza e non scende mai sotto 1.
- I PF attuali salgono solo quando arriva una pill che lo prevede (Aiuto, Banchetto). Poi non superano il nuovo massimo.
- Se il comando scrive già i PF di quella creatura (un riposo, un danno), quella scrittura viene riscritta, come per i temporanei.
- Il vecchio formato si converte nella stessa scrittura.
- Aiuto su una creatura a 0 PF la rialza. Esce dai TS contro la morte come con una cura: il piano si ricostruisce, come per le cadute dalle zone.
- Sono escluse:
  - le creature con i PF condivisi (M9);
  - i token degli incantesimi;
  - le creature senza PF tracciati, dove la pill resta un'etichetta senza bonus.
- Il motore vale in ogni comando, anche in quelli senza Cronologia: una pill tolta in qualunque modo si porta via il suo bonus.

**Aiuto:**

- Pill «Aiuto» con `mechanics.maxHp`: +5, altri +5 per ogni slot sopra il 2°, e alza anche i PF attuali.
- Scadenza manuale (M8). La durata va nel dettaglio: «PF massimi +5, già compresi nel massimo. Dura 8 ore».
- Nel registro di combattimento: «PF massimi 30 → 35 (Aiuto)».
- Le barre PF leggono già `hp` e `hpMax`: non c'è niente da cambiare.

### X2. Ferire

- 14d6 necrotici col TS su Costituzione, la metà se lo supera, come gli altri incantesimi a TS con danno.
- Il danno non porta sotto 1 PF, quindi niente morte istantanea.
- Se fallisce, arriva la pill «Ferire»:
  - porta la riduzione (M5);
  - ha la scadenza manuale (M8);
  - è marcata come malattia (M10).
- `isDiseaseInstance` riconosce la pill. Così Guarigione, Guarigione di massa, Ristorare inferiore («malattia») e Resurrezione pura la tolgono già da soli, e il motore restituisce il massimo.

### X3. Ristorare superiore

- Nel pannello si sceglie un effetto, come per Ristorare inferiore:
  - Indebolimento −1;
  - Affascinato;
  - Pietrificato;
  - una maledizione;
  - una riduzione dei PF massimi (M7);
  - una riduzione di caratteristica, che resta una nota perché il plugin non le tiene.
- Indebolimento −1 passa dallo stesso percorso del riposo lungo.
- Se la creatura non ha l'effetto scelto arriva una nota, e nessun comando vuoto.

### X4. Banchetto degli eroi

- Fino a 12 creature oltre al caster, un tiro di 2d10 per ognuna (M6).
- Pill «Banchetto degli eroi» di 24 ore, con scadenza manuale. Dà:
  - +tiro ai PF massimi e attuali;
  - immunità ai danni da veleno, ad Avvelenato e a Spaventato;
  - vantaggio ai TS di Saggezza.
- Al lancio cura veleno e malattie con CAP-CLEANSE, quindi anche la riduzione di Ferire.

### X5. Riposo (M11)

- Il riposo del gruppo chiude, sui PG che riposano e nello stesso comando, le pill di CAP-MAXHP che la sua durata esaurisce:
  - il riposo breve (1 ora) chiude Ferire;
  - il riposo lungo (8 ore) chiude Ferire e Aiuto;
  - il Banchetto (24 ore) resta.
- Il riposo lungo porta i PF al massimo già tornato.

### X6. Documenti e prove in stanza

- La guida, `INCANTESIMI_E_ZONE.md`, `PIANO_AUTOMAZIONE_INCANTESIMI.md` e la matrice di stato.
- Una sezione nuova in `docs/PROVE_IN_STANZA.md`.

## 5. Decisioni

| | Decisione | Consiglio |
|---|---|---|
| M0 | La memoria tiene il PG senza effetti in corso. | Confermata il 13/11. |
| M1 | `meta.hpMax` resta l'unico massimo; la pill ricorda il modificatore. | Chiusa il 3/11. |
| M2 | Lo stesso incantesimo due volte: vale il più forte. Incantesimi diversi si sommano (PHB 2014, p. 205). | Sì. |
| M3 | Il massimo scritto a mano è il massimo effettivo: quando la pill finisce, toglie sempre il suo bonus. | Sì. Prende il posto di «revoca solo se il massimo è intatto», che con M0 non regge: il ripristino tra scene cambia il massimo in modo legittimo e bloccherebbe la revoca. |
| M4 | Ferire: la riduzione dura 1 ora e la toglie la cura di una malattia. | Chiusa in 6c1955e8. |
| M5 | Ferire riduce del danno dopo resistenze e vulnerabilità, compresa la parte presa dai PF temporanei. Il pavimento a 1 PF non lo riduce. Il massimo non scende sotto 1. | Sì. |
| M6 | Banchetto: un tiro di 2d10 per ogni creatura. | Sì. |
| M7 | Ristorare superiore toglie solo le riduzioni che sono pill. Le altre restano al GM. | Sì. |
| M8 | Le pill finiscono solo in modo esplicito (×, cure, Ristorare superiore, riposo): niente scadenza a round. | Sì. |
| M9 | PF condivisi esclusi: la pill arriva senza toccare i PF, con una nota. | Sì. |
| M10 | La cura di una malattia chiude la riduzione di Ferire. Guarigione e Guarigione di massa curano fino al massimo già tornato. | Sì. |
| M11 | Il riposo del gruppo chiude le pill che la sua durata esaurisce (X5). | Sì. |

## 6. Rischi e come li copro

1. **Il vecchio formato** legge i PF sopra il massimo come temporanei. Copertura: PF, massimo e temporanei si scrivono insieme, nel formato nuovo, con test nei due versi.
2. **La memoria con il massimo effettivo.** Copertura: M0, lotto X0.
3. **La scadenza a round è senza Annulla.** Copertura: M8; il motore vale comunque in ogni comando.
4. **I PF condivisi.** Copertura: M9.
5. **Effetti di ore che scavalcano scene e combattimenti.** Copertura: M0 (il bonus vive dove vive la pill), M11 (il riposo li chiude) e M8.
   - La doppia revoca dopo una correzione a mano. Copertura: M3, e il bonus scritto nella pill.
6. **Nella memoria, valori e pill di momenti diversi.** Copertura: X0 legge il token dopo il comando.
7. **Aiuto su una creatura a 0 PF.** Copertura: l'uscita dai TS contro la morte, con il piano ricostruito (X1).
8. **Ferire e la morte istantanea.** Copertura: il pavimento a 1 PF (X2).

## 7. Prove

Per ogni lotto:

- test di unità sul calcolo;
- test d'integrazione sul coordinatore: lancio, ×, Annulla, un comando che scrive già i PF, il vecchio formato, 0 PF;
- prova al banco nelle due viste del tracker.

X0 e X1 si provano anche con due scene, per la memoria.

## 8. Fuori dal piano

- **Indebolimento 4**, che nel 2014 dimezza i PF massimi, e i **risucchi dei mostri** che riducono il massimo fino al riposo lungo (wight, vampiro, spettro). Più avanti potrebbero usare lo stesso motore; oggi restano a mano.
- **Imposizione delle mani contro le malattie** scala i punti ma non toglie pill: la riduzione di Ferire si toglie con la ×.
