# Aree d'effetto su griglia: regole D&D e geometria del plugin

Documento di ricerca del 29/10/2026, prima di qualsiasi correzione alle aree (lotto L25 di `docs/PIANO_BUGFIX_POLISHING.md`). Il riferimento del plugin è il regolamento 2014: Manuale del Giocatore (PHB), Guida del Dungeon Master (DMG) e Guida Omnicomprensiva di Xanathar (XGE).

## 1. Fonti

- **PHB 2014, cap. 10, «Aree d'effetto»** (PDF inglese, 10ª stampa): le cinque forme e il punto di origine di ciascuna.
- **PHB 2014, cap. 9, variante «Giocare su una griglia»**: ogni casella vale 1,5 m (5 ft). La gittata si conta in caselle, partendo da una casella adiacente a una delle due creature e fermandosi nello spazio dell'altra, per la via più breve. Il movimento in diagonale costa una casella come quello in orizzontale.
- **DMG 2014, regola breve sulle aree su griglia.** Il DMG non è tra i PDF disponibili; la regola è riportata parola per parola da XGE a pag. 86:
  - l'origine di un'area si sceglie su un'intersezione delle linee della griglia, poi si applicano le regole della forma;
  - un'area circolare colpisce una casella se ne copre almeno metà.
- **XGE pagg. 86–87, «Aree di effetto su una griglia»**: due alternative alla regola del DMG, da non mescolare al tavolo.
  - **Metodo dei modelli**: una sagoma in scala si appoggia sulla griglia. Ogni casella coperta anche solo in parte è inclusa; essere adiacenti al bordo non basta. Se l'area parte dall'incantatore (cono, linea), la sagoma si estende da lui e si posiziona come lui preferisce, entro le regole.
  - **Metodo dei segnalini**: ogni casella dell'area è un segnalino dentro una casella, mai su un'intersezione.
    - I cerchi diventano quadrati di lato pari al diametro.
    - Un cono ha tante file quante sono le sue caselle di lunghezza. La prima fila è un segnalino adiacente all'origine, di lato o in diagonale; ogni fila ha un segnalino in più della precedente.
    - Una linea va in orizzontale, in verticale o in diagonale.
  - I diagrammi 2.1–2.6 non sono leggibili come testo dal PDF: vanno guardati sul manuale.
- In rete non c'è una regola ufficiale sulle caselle esatte di un cono. Le discussioni concordano su due punti:
  - il DMG copre solo i cerchi;
  - al tavolo si sceglie un metodo e lo si applica sempre.

## 2. Regole per forma (PHB 2014)

| Forma | Origine | Origine inclusa? |
|---|---|---|
| Cono | un punto; il cono si apre nella direzione scelta, largo quanto la distanza dall'origine | no, salvo scelta diversa |
| Cubo | un punto su una faccia del cubo | no, salvo scelta diversa |
| Cilindro | il centro del cerchio di base | sì |
| Linea | un punto; la linea va dritta per la sua lunghezza, larga quanto indicato | no, salvo scelta diversa |
| Sfera | il centro | sì |

Gittata «Incantatore (…)»: l'origine è l'incantatore.

## 3. Cosa fa oggi il plugin (`src/aoeGeometryCore.js`)

| Forma | Origine sulla griglia | Casella inclusa quando |
|---|---|---|
| Cerchio | centro della casella scelta (`nearestGridFootprintCenter`), non un'intersezione | il centro della casella è entro il raggio (vicino alla «metà coperta» del DMG) |
| Emanazione da token grande | caselle occupate dal token | il centro è entro il raggio dalla casella occupata più vicina |
| Cono | dalla casella adiacente scelta, **mediana del lato verso il caster, anche in diagonale: scelta voluta** (commit `e47131c3`) | la sagoma copre più del 15% della casella (`CONE_MINIMUM_OVERLAP_RATIO`, stesso commit) |
| Quadrato | vertice | centro dentro il quadrato (intervallo semiaperto) |
| Rettangolo (cubo di un mostro) | centro della casella adiacente; la sagoma parte dal bordo del caster | copertura almeno del 50% |
| Linea | centro della casella adiacente (dal caster) o punto/vertice (muri) | centro dentro la fascia, intervallo **chiuso** in lunghezza |

La guida utente (sez. 13) e `RIFERIMENTO_FUNZIONI.md` dicono che il cerchio segue il metodo Template di Xanathar (casella coperta anche in parte). Il codice invece usa il centro della casella. È da allineare: o il testo o il codice, per tua scelta (D-A).

## 4. Le voci del lotto L25 alla luce delle regole

### MP-03 — linee e muri larghi una casella
- **Lunghezza.** Il Fulmine (30 m = 20 caselle) parte dal centro della casella adiacente al caster. L'intervallo chiuso conta anche la casella alla distanza esatta: 21 caselle. Con il modello (che parte dall'incantatore) e con i segnalini sono 20. **Bug confermato.**
  - La correzione giusta è l'intervallo **[0, lunghezza)**: tiene la casella adiacente e toglie l'ultima.
  - La patch non committata del 28/10 usa (0, lunghezza]: toglie la casella adiacente e lascia un buco tra caster e linea. **Va corretta prima del commit.**
- **Larghezza.** Una linea larga 1,5 m che parte da un vertice copre a metà due file. Il metodo dei modelli permette all'incantatore di posizionarla come preferisce, quello dei segnalini la vuole larga una casella. Due file sono un'area larga 3 m. **Bug confermato**: la patch (una sola fila) è coerente con le regole.

### MP-04 — Onda tonante
Cubo con gittata «Incantatore»: l'origine è l'incantatore, che sta su una faccia del cubo e ne resta fuori. Oggi il cubo è centrato su un vertice del caster e verso sinistra o verso l'alto lo comprende. **Bug confermato.** La patch (un cubo 3×3 con una faccia sul caster, come il cubo dei mostri) rispetta la regola. Dove far scorrere il cubo lungo la faccia lo decide il manuale («come preferisce l'incantatore»); il plugin lo centra sulla fila del caster.

### MP-06 — cono da una casella in diagonale
**Ritirato**: l'origine dalla mediana è voluta (commit `e47131c3`). XGE ammette sia la prima casella di lato sia quella in diagonale, senza fissare il vertice.

### MP-07 — emanazioni disegnate e proposte
Ci sono due regole diverse, e il plugin le usa entrambe:
- **area «raggio»** (sfera o cilindro con origine nella creatura, come Spiriti guardiani): vale la regola dei cerchi del DMG. A 1,5 m dal centro di un token Medio le caselle in diagonale sono coperte meno della metà e restano fuori. Il disegno attuale fa così.
- **«entro N metri da te»** (Turbine di spade, molti tratti dei mostri): è una gittata, e sulla griglia si conta in caselle con la diagonale che vale una. Le caselle in diagonale a 1,5 m sono dentro. La proposta della console attacchi fa così (`bossReachFeet`).

Non è un errore unico: dipende dalla frase dell'incantesimo o del tratto. Proposta: il disegno segue la proposta (distanza in caselle dal bordo del token) solo per le aree scritte «entro N metri», e resta un cerchio per quelle scritte «raggio». Serve la tua decisione (D-B).

### MP-09 — gittata sulle scene «5 ft»
- **Conversione.** Una casella «5 ft» vale 1,524 m, quindi la Palla di fuoco (150 ft = 30 caselle, registrata come 45 m) a 30 caselle risulta 45,72 m ed è rifiutata. Con la variante su griglia 30 caselle sono 150 ft. **Bug confermato** (conversione, non geometria).
- **Misura.** La gittata si misura in linea d'aria da centro a centro. La variante su griglia del PHB conta le caselle con la diagonale a una casella, quindi in diagonale il plugin è più severo del manuale. Serve la tua decisione (D-C): contare in caselle come il PHB, o restare in linea d'aria.

### MP-10 — «Aspetto area»
Non riguarda le regole di gioco: è lo stile grafico delle zone già sulla mappa. Resta com'era nel piano.

## 5. Decisioni (approvate il 29/10/2026)

| # | Decisione | Esito |
|---|---|---|
| D-A | Cerchi: metodo Template (casella coperta anche in parte) come diceva la guida, o centro della casella (≈ metà coperta, DMG) come fa il codice | resta il codice (DMG); guida, riferimento e risoluzione dei problemi corretti |
| D-B | Emanazioni «entro N metri»: distanza in caselle dal bordo del token (diagonali comprese) | sì, solo per le aree scritte «entro»; i «raggio» restano cerchi |
| D-C | Gittata delle aree: caselle (PHB, diagonale = 1) o linea d'aria | caselle, come la variante su griglia del PHB |

## 6. Cosa è stato fatto (lotto L25)

- **MP-03**: lunghezza delle linee in [0, lunghezza), anche per la fascia del Muro di fuoco. La linea centrale è allineata alla griglia secondo la larghezza: per una larghezza dispari passa dai centri delle caselle. Il Fulmine va dalla casella accanto al caster per 20 caselle; un muro largo 1,5 m da un vertice prende una fila. Cambiano le caselle dei muri già sulla mappa.
- **MP-04**: Onda tonante è un rettangolo 4,5 × 4,5 m con origine accanto al caster (`AREA_OVERRIDES.thunderwave`), come il cubo dei mostri.
- **MP-07 (D-B)**: `metric: "grid"` sulle regole istantanee scritte «entro» e sulle emanazioni dei mostri. L'area (`buildWithinDistanceArea`) prende le caselle a non più di N caselle dall'impronta del token. Metrica e impronta viaggiano con l'anteprima, l'area salvata e la riselezione; il contorno è un quadrato.
  - Regole segnate: Parola divina, Braccia di Hadar, Onda distruttiva, Parola radiosa, Rombo di tuono, Passo del tuono, Turbine di spade.
  - Le aure e le zone scritte «entro» restano cerchi, perché la loro appartenenza si ricalcola altrove (`spellAuraController.js` e il controllo dell'attraversamento): Investitura della fiamma, Sudario spirituale, Cerchio di potere, Passo senza tracce, Parlare con i vegetali, Scossa tellurica. Sono un seguito possibile.
  - I testi di Turbine di spade, Sudario spirituale e Scossa tellurica non escono dai PDF: la classificazione viene dal testo 2014 ed è da controllare sul manuale.
- **MP-09 (D-C)**: i piedi valgono 0,3 m (5 ft = 1,5 m) e la gittata si conta in caselle con la diagonale a una (`spellAreaOriginWithinRange`). L'anteprima della gittata è un quadrato.
- **MP-10**: «Aspetto area» non ricolora più le zone degli incantesimi; la guida dice cosa ricolora.
- **MP-06**: ritirato, scelta voluta.
