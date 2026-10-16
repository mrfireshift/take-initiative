# Boss Actions — Shothragoth, l'Informe (S0–S3, teletrasporto e Cucitura Spezzata, profile/parser v22)

## S0 · Fixture

`test/fixtures/boss-actions/shothragoth.html` è lo stat block originale tradotto nel formato delle fixture di Auril (`phase`, `statblock`, `entry`, `title`, `section-title`), con queste scelte:

- **Nome:** «Shothragoth, l'Informe». L'importatore prende come nome del boss la parte prima della virgola: `bossDefinitionId` «shothragoth», fase «fase1».
- **Unità:** piedi al posto dei metri. 1,5 m = 5 ft, 3 m = 10 ft, 4,5 m = 15 ft, 6 m = 20 ft, 9 m = 30 ft, 18 m = 60 ft, 36 m = 120 ft, 30 cm = 1 ft.
- **Formulazione 2024:** «Tiro per Colpire in Mischia: +10, portata 10 ft.», «Tiro Salvezza su …: CD …», condizioni con la maiuscola. «Successo: Metà danni soltanto» al posto di «metà dei danni, nessuno spostamento e non cade prona», che ha la stessa meccanica.
- **«36 (8d8) danni da forza e psichici»:** diventa «18 (4d8) danni da forza più 18 (4d8) danni psichici», per decisione.
- **Nomi:** restano italiani. «(Ricarica Speciale)» resta nel titolo e il parser la legge come la nota Special Recharge.
- **Punti Ferita:** «58 + 58 per PG» resta nel testo; i Punti Ferita si impostano sul token.

## S1 · Forme condivise (parser v17)

Le forme si sono aperte senza cambiare nulla per Auril: i test di Auril restano tutti verdi. L'unica attesa aggiornata è un caso di contratto chiuso che usava FOR come caratteristica vietata, ora sostituita da SAG.

| Capacità | Stato | Forma |
|---|---|---|
| Presenza Incompatibile | aura sul token | come Aura Gelida: 10 ft, 3d6 **psichici** a inizio turno, pill con il nome del tratto, palette «vuoto» |
| Fauce Impossibile | SUPPORTED | nuovo attacco in mischia semplice: +10, portata 10 ft, 4d8+5 **forza** |
| Marea Informe (1/Round) | PARTIAL | TS di gruppo: emanazione 15 ft da Shothragoth, **FOR** CD 18, 3d10 forza, Prono sul fallimento (spinta sulla mappa) |
| Resistenza Epica | PARTIAL | come Epic Resistance (d20, 11+), formulazione al maschile |

- **Profilo v17:**
  - tipi di danno forza e psichico;
  - FOR nei TS di gruppo;
  - forma `attack-damage` in sola mischia;
  - nuove grammatiche ancorate: attacco in mischia semplice; emanazione con spinta e Prono;
  - aura di un tratto con tipo di danno da un elenco chiuso («danni da freddo», «danni psichici») e con il nome del tratto. Per Aura Gelida chiave e nome restano identici.
- **Console:** etichette «forza» e «psichici». Tema d'area «vuoto» per Shothragoth (`#2e1065`, bordo `#c4b5fd`) dalla mappa chiusa `bossAreaTheme`.

## S2 · Bersaglio singolo, presa e lancio (parser v18)

| Capacità | Stato | Cosa è automatico | Cosa resta sulla mappa |
|---|---|---|---|
| Il Corpo Non Era Qui | PARTIAL | TS DES CD 18 su un bersaglio entro 5 ft, 3d6 forza (metà sul successo), Prono sul fallimento come condizione standard | il teletrasporto fino a 30 ft |
| Arto che Precede il Corpo | PARTIAL | attacco in mischia +10, portata 20 ft, 2d10+5 contundenti più 2d6 psichici. Sul colpo la console chiede l'effetto: **Afferrare** (Afferrato, fuga CD 18, una sola creatura alla volta, bloccato se il boss ne tiene già una) oppure **Trascinare** (promemoria) | il trascinamento di 10 ft e il controllo della taglia (Enorme o più piccola per trascinare, Grande o più piccola per afferrare) |
| Scagliare | PARTIAL | variante piatta di Hurl: serve una creatura Afferrata dal boss; 3d8 forza con le difese del bersaglio, la presa finisce, Prono. Facoltativo: la creatura contro cui va a sbattere fa TS DES CD 18; sul fallimento subisce lo stesso tiro con le **sue** difese e cade Prona | la direzione del lancio e la scelta di chi viene colpito |

- **Profilo v18:**
  - TS singolo con Prono;
  - `onHit.choices` sull'attacco in mischia (`pull` con distanza e taglia massima, `grab` con CD di fuga, taglia massima e `single`);
  - lancio piatto con `distance.max` senza passo né bordo e con `collision` (TS DES, `sameDamage`, Prono).

  Il validatore resta chiuso: qualunque variazione del testo o dei dati (presa doppia, condizione diversa, metà danni sulla collisione, bordo su un lancio piatto) rende la capacità manuale o il profilo invalido.
- **Esecuzione:**
  - la scelta sul colpo entra nella chiave della decisione e nella causalità (`onHit`);
  - la collisione aggiorna i PF di entrambe le creature in un solo `hp:set` e aggiunge un Prono autonomo alla creatura colpita;
  - tutto finisce in una sola voce History annullabile.
- **Console:**
  - attacco: il gruppo «Sul colpo» compare solo sull'esito Colpito;
  - lancio piatto: senza distanza né atterraggio, danno precompilato con la media stampata (13); campo «Contro» con «Nessuna» o le creature del tracker (la creatura lanciata è disabilitata) ed esito del suo TS;
  - totali: «Totale 13 · Prono · Mira −13 e Prono»;
  - riepilogo: la presa scelta sul colpo è nominata una sola volta («Afferrato (CD 18)»).
- **Test DOM:** il DOM finto dei test non supporta i selettori separati da virgola. La console usa selettori singoli per aggiornare lo stato speciale del lancio.

## S3 · Sequenza delle Azioni Epiche e Cucitura (parser v19)

Regola dei boss epici: un'Azione Epica alla fine del turno di ogni personaggio. Le decisioni del GM:
- «prima» blocca;
- «ultima» avvisa;
- Strappare segue la cucitura salvata;
- la sequenza di Auril arriva con la tranche 12.

### Meccanismo comune

- **Registro del round** (`bossActionState.epicLog`): ogni Azione Epica risolta o registrata dalla console nel round canonico.
  - Si attiva solo per un profilo che dichiara una sequenza: Auril non cambia.
  - Come i contatori 1/Round, si svuota da solo al cambio di round: nessun listener e nessuna scrittura sui turni.
  - L'Undo lo ripristina.
- **«Prima Azione Epica del round»** (`sequence.slot: "first"`): blocco duro se il registro contiene già un'altra Azione Epica del round.
- **«Ultima Azione Epica del round»** (`sequence.slot: "last"`): la console legge in sola lettura l'ordine di iniziativa e il turno corrente.
  - C'è uno slot per ogni personaggio (attitudine `pc`), anche a 0 PF. Gli id virtuali non sono slot.
  - Se dopo il turno corrente devono ancora agire dei personaggi, il GM conferma con una spunta. Il runtime rifiuta il commit senza conferma.
- **Intestazione:** «Azione Epica 3/3 (ultima)». La console si aggiorna anche al cambio di turno, solo per i profili con sequenza.
- **Righe:** le azioni vietate dalla sequenza o dalla cucitura mostrano «Bloccata», con il motivo nell'apply.
- **Azzera risorse:** cancella anche registro e cucitura.

### Le due azioni

| Capacità | Stato | Cosa è automatico | Cosa resta manuale |
|---|---|---|---|
| Cucitura del Non-Luogo | PARTIAL | solo come prima Azione Epica del round; il GM disegna la linea larga 5 ft fra due punti, lunga al massimo 120 ft; la cucitura resta registrata sul boss fino alla fine del round e il disegno resta sulla mappa (palette «vuoto») con un portale a ogni estremità; finché esiste, Il Corpo Non Era Qui è bloccato | i due punti su superfici percepite entro 60 ft, il Terreno Difficile |
| Strappare la Cucitura | PARTIAL | solo dopo la Cucitura dello stesso round, come ultima Azione Epica (conferma se l'ordine dice altro); niente più spunta «Ricarica e sequenza verificate»; la linea larga 20 ft viene posata sulla cucitura salvata; TS INT CD 18, 4d8 forza più 4d8 psichici, metà sul successo, Prono sul fallimento; la cucitura scompare dal boss e dalla mappa | la spinta di 15 ft perpendicolare alla cucitura, verso un lato a caso |

- **Profilo v19:**
  - campo `sequence` (`slot`, `after`) sulle sole Azioni Epiche;
  - esecuzione `seam` (`width`, `maxLength`, `range`, `blocks`);
  - area di gruppo `seam`;
  - TS INT nei TS di gruppo;
  - i nomi citati nel testo (Il Corpo Non Era Qui, Cucitura del Non-Luogo) si risolvono dentro il profilo, altrimenti l'azione resta manuale;
  - il validatore controlla i riferimenti incrociati.
- **Strumento d'area**, ogni estensione attiva solo se la richiesta la chiede:
  - linea «fino a» la lunghezza stampata (`lengthUpTo`, caselle intere);
  - linea posata su due punti dati (`presetLine`), che il puntatore non sposta;
  - sagoma confermata che resta sulla mappa con id, nome e metadati del richiedente (`keepOnMap`), esclusa dal cambio di stile delle aree.
- **Pulizia dei disegni**, sempre per id esatto e solo per gli oggetti con il marcatore `bossSeam` di questo boss:
  - Strappare rimuove il disegno della cucitura dopo il commit;
  - una cucitura collassata a fine round, o annullata, lascia il disegno: la lista lo segnala con «Rimuovi»;
  - un disegno mai applicato sparisce chiudendo l'azione o ridisegnando.
- **Undo di Strappare:** ripristina la cucitura ma non il suo disegno. La nota lo dice: «Il disegno non è sulla mappa».

### Cucitura: 120 ft e portali

- **Lunghezza:** lo stat block dice «distanti non più di 120 ft.» (36 m, su decisione del GM; prima era 60 ft). Il parser legge il numero dal testo: la regola d'area diventa `boss-action-area:line:120ft:5ft`. Il raggio dei punti («entro 60 ft. da sé») resta 60 ft. Il profilo già importato va reimportato dallo stat block aggiornato.
- **Portali:** a disegno confermato, la console aggiunge due immagini sul layer Props, una all'inizio e una alla fine della linea (`public/boss-seam-portal.webp`, 10 ft di diametro, bloccate e non cliccabili; `bossSeamPortalCore.js`).
  - Sono agganciate al disegno della cucitura e hanno il suo marcatore `bossSeam` (con `portal: "start"|"end"`); i loro id (`<id>-portal-start`, `<id>-portal-end`) entrano in `seam.itemIds`, che ne tiene al massimo 4.
  - Quindi spariscono con la cucitura in ogni caso: ridisegno, Strappare, cucitura collassata («Rimuovi»), disegno mai applicato.
  - Se l'aggiunta non riesce, la cucitura resta valida senza portali.

## Il Corpo Non Era Qui con il teletrasporto (parser v21)

Il teletrasporto usa lo stesso motore degli incantesimi (Passo Velato, Porta Dimensionale).

- **Profilo v21:** l'esecuzione dichiara `teleport: { range: 60 }`, letto dallo stat block («si teletrasporta fino a 60 ft.», cioè 18 m: gittata aumentata su decisione del GM, prima era 30 ft). Il contratto è chiuso:
  - la gittata dev'essere un multiplo di 5;
  - serve la distanza del bersaglio;
  - una presa o un marchio non sono ammessi;
  - un profilo v20 non può contenerlo.
- **Destinazione:** nella console c'è il passo «Scegli destinazione». Lo strumento d'area chiede una casella entro 60 ft dal boss (regola `boss-action-area:teleport:60ft`).
  - Basta un clic, niente trascinamento: il clic sceglie e conferma, come il ritorno di Lampeggiare. Lo strumento d'area tratta il clic su un posizionamento a punto come un trascinamento fermo.
  - La casella si allinea all'ingombro del boss: per un 3×3 il centro cade sul centro di un blocco 3×3, quindi il token resta sulla griglia.
- **Commit:** TS, danni, Prono e lo spostamento del boss stanno in un solo comando. Lo spostamento è l'effetto collaterale `token:teleport` del coordinatore: dissolvenza del token, nessun movimento conteggiato, registrato nella stessa voce di Cronologia. L'Undo riporta PF, condizione e posizione.
- **Avviso, non blocco:** se il bersaglio non è entro 5 ft dallo spazio lasciato né da quello d'arrivo, la console lo segnala. Misura sulla griglia; un intervallo inferiore a una casella conta come adiacente.
- **Resta manuale:** che lo spazio d'arrivo sia libero e percepito dal boss.
- **Test:**
  - `shothragothTeleport.test.js`: dati e contratto, regola della destinazione, piano con l'effetto collaterale, distanza;
  - `shothragothTeleportIntegration.test.js`: commit e Undo reali, compresa la posizione;
  - un test della console in `bossActionsPopover.test.js`.
- **Browser di prova:** `corpo-ready` e `corpo-final`. Il token del boss arriva sulla casella scelta; Mira prende 10 danni ed è Prona.

## Cucitura Spezzata e Strappare le Cuciture (parser v22)

Versione alternativa della combo Cucitura/Strappare, per Shothragoth a metà PF o meno. Sostituisce quella base: il testo stesso lo dice.

- **Stat block:**
  - la Cucitura del Non-Luogo aggiunge «e se ha più della metà dei suoi Punti Ferita»;
  - **Cucitura Spezzata:** prima Azione Epica del round, solo con la metà o meno dei PF; quattro punti entro 60 ft, una cucitura larga 5 ft fra ogni punto e il successivo, **ciascuna lunga fino a 120 ft** (36 m); blocca Il Corpo Non Era Qui;
  - **Strappare le Cuciture (Ricarica Speciale):** ultima Azione Epica, dopo la Cucitura Spezzata dello stesso round; il GM sceglie una o più cuciture, ciascuna diventa una Linea larga 20 ft; TS INT CD 18, 4d8 forza più 4d8 psichici, metà sul successo, Prono e spinta di 15 ft perpendicolare alla cucitura più vicina sul fallimento. Una creatura in più Linee fa un solo TS e subisce i danni una volta sola. Poi tutte le cuciture scompaiono.
- **Profilo v22** (contratto chiuso, un profilo v21 non può contenerli):
  - `hpGate` sull'abilità: `unbloodied` (più della metà dei PF) o `bloodied` (metà o meno), letto dai PF canonici del token (`meta.hp`, `meta.hpMax`);
  - `seam.points` (3 o 4): la catena; `maxLength` è la lunghezza massima di ogni tratto (la cucitura registra il totale);
  - `area.segments: true` sulla linea della cucitura: una linea per ogni segmento scelto. Il validatore vuole i segmenti solo dopo una catena e la linea singola solo dopo una cucitura a due punti; altrimenti l'azione resta manuale.
- **Soglia dei PF:** quando sono bloccate, la lista mostra il requisito: «Solo sopra ½ PF» sulla Cucitura base, «Solo a ½ PF o meno» sulla Spezzata; il tooltip della riga dice il motivo (anche per un blocco della sequenza). Anche il commit verifica la soglia.
- **Disegno della catena:** tre linee una dopo l'altra. La seconda e la terza partono dal punto in cui è finita la precedente (opzione `lineStart` dello strumento d'area, attiva solo se la richiesta la chiede: l'inizio non viene agganciato alla griglia e il puntatore muove solo la fine). Ogni linea arriva fino a 120 ft, anche la seconda e la terza. «Ricomincia» cancella una catena a metà; «Ridisegna» ricomincia da A.
- **Portali:** a catena completa, uno su ogni punto (A, B, C, D), agganciato al suo segmento, con il marcatore `bossSeam`. La cucitura salvata tiene fino a 12 id (3 aree, 3 contorni, 4 portali).
- **Strappo:** nella console spunti i segmenti (tutti per default); «Mostra le linee» posa la linea larga 20 ft su ciascuno, uno dopo l'altro, con una conferma per linea. Il gruppo è l'unione, ogni creatura una volta; il commit controlla che ogni linea stia su un segmento diverso della catena del round.
- **Test:** `shothragothSpezzata.test.js` (dati, soglia, catena, strappo, portali, `lineStart`) e due test della console in `bossActionsPopover.test.js`.
- **Browser di prova:** `spezzata-drawing`, `spezzata-final`, `strappare-cuciture-ready`, `strappare-cuciture-final` (A–B e C–D strappati, B–C no: Mira e Sera prendono 36 danni e sono Prone; i 10 oggetti della catena spariscono).

## Terreno Difficile della cucitura

Lo spazio di ogni cucitura (base o spezzata) è Terreno Difficile mentre la cucitura esiste, cioè nel round in cui è stata disegnata e finché non viene strappata.

- **Calcolo:** il controllo della velocità raddoppia il costo della sola parte di uno spostamento che passa dentro la cucitura (`movementCostForSegment`, nuovo parametro `terrainModifiers`). Fuori dalla cucitura il costo non cambia.
- **Non si somma** al costo raddoppiato della creatura (per esempio una Ragnatela): vale il più alto. Una creatura immune al Terreno Difficile (Libertà di Movimento) non paga nulla.
- **Da dove legge:** `bossSeamTerrainCore.js` ricostruisce le celle dalle aree salvate sulla mappa che il boss registra come cucitura del round. Il contorno, i portali e un disegno rimasto da un round passato non contano. Gli oggetti arrivano dall'ultimo evento di cambiamento della scena, quindi nessuna lettura in più a ogni passo.
- **Test:** `bossSeamTerrain.test.js`.

## Prossimi passi

- **Tranche 12 (Auril):** fatta, vedi `boss-action-profile-tranche-12.md` (profilo v20).
- **S4:** Manifestazione Disgregabile e Concordia, da valutare.

## Verifica (13 ottobre 2026)

- **Test:**
  - `shothragothProfile.test.js`: importazione, conteggi, cosa è automatico e cosa resta manuale, Fauce con resistenza alla forza, Marea con FOR, Prono e metà danni, Resistenza Epica, aura psichica con palette «vuoto», tema, contratto v17;
  - `shothragothS2.test.js`: le tre capacità come dati v18 chiusi, la scelta sul colpo, la presa singola, Il Corpo con Prono, Scagliare con e senza collisione (resistenza alla forza della creatura colpita);
  - `shothragothS2Integration.test.js`: Arto con presa → Scagliare contro Mira → annullamento;
  - `bossActionsPopover.test.js`: due nuovi test console (Arto e Scagliare);
  - `shothragothS3.test.js`: dati v19 chiusi e varianti manuali, slot del round, blocchi del registro, registro e azzeramento, Cucitura e Strappare sulla cucitura, regole d'area e linea «fino a»;
  - `shothragothS3Integration.test.js`: slot e blocchi dalla presentazione, Cucitura solo prima e Undo, Il Corpo bloccato, conferma dell'ultimo slot, linea fuori dalla cucitura rifiutata, Strappare che rimuove il disegno, Undo; cucitura collassata e pulizia dei soli disegni di questo boss; Auril senza registro;
  - `bossActionsPopover.test.js`: tre test console S3 (Cucitura, Strappare con conferma, riga bloccata e disegno da rimuovere);
  - suite completa 3324/3324, `npm run build` PASS, `git diff --check` PASS.
- **Browser di prova** (`?boss=shothragoth`):
  - `marea-drawing`: Marea Informe posiziona l'emanazione nella palette «vuoto»;
  - `arto-final`: Dars colpito per 23, Afferrato CD 18;
  - `scagliare-ready`: «Totale 13 · Prono · Mira −13 e Prono»;
  - `scagliare-final`: Dars 37 → 24/60, 20 ft, Prono, presa terminata; Mira fallisce il TS, 13 danni e Prono.
  - **I personaggi** hanno ora l'attitudine `pc`: tre slot per round.
  - **Lo strumento simulato** disegna anche le linee e conserva i disegni `keepOnMap`.
  - `cucitura-drawing`: la cucitura tra due punti (10 caselle, 45 ft da centro a centro) nella palette «vuoto».
  - `cucitura-final`: «Azione Epica 1/3». La cucitura di 45 ft resta sulla mappa; Il Corpo Non Era Qui e Cucitura risultano «Bloccata».
  - `strappare-ready`: turno di Mira, «Azione Epica 3/3 (ultima)», nessuna conferma richiesta. La linea di 20 ft è posata sulla cucitura.
  - `strappare-final`: danni e Prono ai falliti, «Cucitura strappata: scompare». Il disegno è rimosso e Il Corpo torna disponibile.
