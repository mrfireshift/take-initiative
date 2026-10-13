# Boss Actions — tranche 10: aure dei tratti (Aura Gelida, Primal Blizzard)

## Cosa succede

1. **Importazione.** I tratti Aura Gelida e Primal Blizzard vengono riconosciuti con testo ancorato e il nome del boss. Ottengono una definizione d'aura chiusa nel profilo (`auras`, profile/parser v11).
2. **Collegamento al token.** Le aure del profilo diventano **aure personalizzate** sul token collegato (in fase 2 la Proiezione Fatata, in fase 3 il Grembo Invernale). Il controller delle aure personalizzate le esegue subito: cerchio sulla mappa, pill per chi è dentro, promemoria nel turno.
3. **Scollegamento.** Le aure del boss vengono rimosse dal token; le altre aure del token restano.

## Le aure

| Aura | Raggio | Pill | Promemoria |
|---|---|---|---|
| Aura Gelida | 10 ft (3 m) | «Aura Gelida» (debuff): chi è dentro, 3d6 freddo a inizio turno | inizio turno · danno diretto 3d6 freddo |
| Primal Blizzard | 30 ft (9 m) | «Nella tormenta» (debuff): scarsamente oscurato, Svantaggio contro Auril | fine turno · TS concentrazione CD 10: solo a chi si concentra; il fallimento la interrompe |
| Primal Blizzard · Vento | 30 ft (9 m), da adattare alla piattaforma | — | inizio turno di un **PG** · TS FOR CD 15; fallimento: spinta 10 ft e **Prono** |

- **Bersagli:** «Ostili», senza il token sorgente: restano fuori Auril e i suoi altri token (i tre del Titano in fase 2). Il Vento usa invece il filtro «Personaggi (PG)»: solo i token con attitudine PG, non evocazioni né alleati.
- **CD:** sempre fisse, perché il token del boss non ha una CD da incantatore.
- **Colori:** famiglia ghiaccio, come le aree disegnate da Auril.

## Pill di Aura Gelida (parser v12, 13 ottobre 2026)

- **Cosa aggiunge:** Aura Gelida mette la pill «Aura Gelida» (debuff) su chi si trova dentro, con il dettaglio «Entro 10 ft. dalla Proiezione Fatata / dal Grembo Invernale: 10 (3d6) danni da freddo a inizio turno».
- **Perché la versione 12:** la revisione del profilo è l'hash di versione del parser e HTML. Con la stessa versione, reimportare lo stesso HTML con un output diverso sarebbe un conflitto di revisione. Il contratto del profilo resta quello della v11 e i profili v11 restano validi.
- **Sui token già configurati:** basta reimportare l'HTML e ricollegare. La pill viene aggiunta senza toccare le modifiche fatte nell'editor.

## Raggio dal bordo del token (13 ottobre 2026)

- **Da dove si misura:** il raggio delle aure personalizzate (quindi anche di quelle del boss) si misura dalle caselle occupate dal token sorgente, non dal suo centro (`gridFootprintCells` e `buildFootprintEmanationArea` in `aoeGeometryCore.js`). Una casella è dentro se il suo centro dista al massimo il raggio dal centro della casella occupata più vicina.
- **Effetto:** un'aura da 10 ft raggiunge due caselle oltre il bordo, che il token sia 1×1, 2×2 o 3×3.
- **Token 1×1:** il risultato coincide con il cerchio di prima, quindi bersagli e sagome delle aure esistenti su token piccoli non cambiano.
- **Sagoma sulla mappa:** per un token più grande segue l'ingombro, cioè un rettangolo dai lati dritti con angoli arrotondati; per un 1×1 resta un cerchio. Se il token viene ridimensionato, la sagoma viene ridisegnata.
- **Emanazioni delle azioni del boss:** dal 13 ottobre usano la stessa regola. Riguarda Blinding Gleam e Divine Brilliance (regole `boss-action-area:emanation:*`, centrate sul token del boss). Lo strumento d'area costruisce l'area dalle caselle del token e il contorno ne segue l'ingombro. Coni e cerchi su punti liberi (Breath, Hand Slam, Meteor Swarm) e gli incantesimi non cambiano.
- **Ancora dal centro:** le aure degli incantesimi e quelle dei privilegi di classe.
- **Correzione nella geometria:** la scansione delle caselle ora parte dal token e non dall'origine della griglia. Prima, con un'origine lontana dal token, l'area risultava troncata; nello strumento reale l'origine è sempre vicina al token.

## Regole di sincronizzazione

- **Identità:** ogni aura gestita ha un id stabile: `boss-aura:<boss>:<fase>:<chiave>`.
- **Al collegamento:**
  - le aure mancanti vengono create;
  - per quelle già presenti le **meccaniche seguono il profilo**: bersagli, pill e promemoria vengono riallineati e il messaggio di stato le elenca come «allineate al profilo» (dal parser v13);
  - restano del GM raggio, colori, nome, attivazione dell'aura e attivazione di ogni singola pill o promemoria (per esempio il Vento allargato alla piattaforma, o una pill spenta);
  - una pill o un promemoria eliminati a mano ricompaiono al collegamento successivo: per non vederli, disattivali invece di eliminarli;
  - le aure gestite dello stesso boss che il profilo non definisce (un'altra fase sullo stesso token) vengono rimosse;
  - collegando il token a un altro boss vengono rimosse quelle del boss precedente.
- **Metadati:** i metadati del token vengono uniti, mai sostituiti, e l'aggiornamento è ricalcolato sulla bozza fresca dell'elemento.
- **«Ripristina aure»** (Gestisci profilo, doppia conferma): riscrive le aure del profilo dal profilo, scartando le modifiche fatte a quelle aure. Le altre aure del token non cambiano.

## Console

- **Gestisci profilo → «Aure del profilo»:** elenca ogni aura come attiva, disattivata o mancante.
- **Collegamento e scollegamento:** il messaggio di stato dice quali aure sono state attivate o rimosse.
- **Tab Passive:** i tratti con aura hanno l'etichetta «Aura sul token», oppure «Aura non attiva» se un'aura è disattivata o mancante; il tooltip dice quale.

## Resta manuale

- **Concentrazione (dal parser v13):** automatica.
  - A fine turno, solo una creatura nella tormenta che ha una concentrazione attiva riceve il popup di concentrazione condiviso, con causa «Primal Blizzard» e CD 10.
  - Se il TS fallisce, la concentrazione viene interrotta come per un danno.
  - Il popup ora accetta un TS senza danno se ha una causa (`cause`).
- **Spinta e bordo:** la spinta di 10 ft ed Edge of the Storm si risolvono sulla mappa. Il raggio del Vento va adattato alla piattaforma nell'editor delle aure, una volta sola.
- **Attacchi da fuori:** lo Svantaggio vale anche per gli attacchi che attraversano la tormenta da fuori; la pill copre solo chi è dentro.
- **Danno di Aura Gelida:** il promemoria non legge le difese del profilo attore né il marchio di Mark of the Frostmaiden; il danno va inserito già corretto.
- **Crushing Downdraft ed Edge of the Storm:** non sono aure e restano testo nella tab Passive.

## Compatibilità

- I profili v1–v10 restano validi e non possono contenere aure.
- I profili salvati prima della v11 non hanno aure: per attivarle, reimporta l'HTML e ricollega il token.

## Verifica (12 ottobre 2026)

- **Test:**
  - `bossActionTranche10.test.js`: grammatiche, varianti manuali, contratto chiuso, conversione in aure personalizzate, regole d'unione;
  - `bossActionTranche10Integration.test.js`: collegamento, nuovo collegamento, ripristino e scollegamento con il runtime reale; metadati uniti e altri token intatti;
  - flusso della console in `bossActionsPopover.test.js`;
  - suite completa 3273/3273, `npm run build` PASS, `git diff --check` PASS.
- **Browser di prova** (`?phase=3&scenario=list`):
  - il collegamento reale scrive le tre aure sul token;
  - Gestisci profilo le mostra attive;
  - la tab Passive etichetta Primal Blizzard e Aura Gelida.
  - Il controller delle aure non gira nel browser di prova: cerchi e promemoria vanno visti in Owlbear.

## Primal Blizzard: spinta sui PG e concentrazione reale (parser v13, 13 ottobre 2026)

- **Profilo v13:**
  - un'aura può dichiarare `targets: "pc"`, usato dal Vento;
  - un promemoria può essere `concentration-save` con la sua CD, usato dalla tormenta;
  - i profili v11 e v12 restano validi.
- **Aure personalizzate:**
  - nuovo filtro «Personaggi (PG)», con attitudine `pc`; nel filtro condiviso delle aree è un'aggiunta e gli altri filtri non cambiano;
  - nuovo tipo di promemoria «TS concentrazione (solo chi si concentra)», disponibile anche nell'editor.
- **Instradamento del TS di concentrazione:** non diventa un promemoria di zona. `planCustomAuraReminder` lo trasforma in un avviso di concentrazione solo per chi ha `com.thebigpicture.initiative/concentration`, e il controller lo invia sul canale del popup di concentrazione.
- **Test:** `primalBlizzardMechanics.test.js` copre il filtro PG, il TS di concentrazione attraverso il pianificatore dei turni reale (Mira concentrata riceve l'avviso, Dars no), l'avviso senza danno con causa e il riallineamento delle meccaniche al collegamento. Suite completa 3285/3285, build PASS, `git diff --check` PASS.
- **In Owlbear:** reimporta l'HTML della fase 3 e ricollega il Grembo Invernale. Il Vento resta della misura che gli avevi dato, ma da quel momento spinge solo i PG e la tormenta chiede il TS solo a chi si concentra.

## Prono sul fallimento della spinta (parser v14, 13 ottobre 2026)

- **Stat block:** nella fixture della fase 3 il Fallimento di Primal Blizzard ora dice «… lontano dal Grembo Invernale e ha la condizione Prono».
- **Parser v14:** la clausola è facoltativa nella grammatica, quindi un HTML senza la frase resta riconosciuto, ma senza Prono. Il profilo v14 permette `failureCondition` (solo «Prono») su un promemoria con TS; i profili v1–v13 restano validi.
- **Motore:** il promemoria del Vento applica Prono al TS fallito come **condizione standard indipendente**: tipo `automatic`, non legata all'aura, si toglie a mano.
- **Correzione nelle aure personalizzate:** prima una condizione su TS fallito (la «Condizione su fallimento TS» dell'editor) veniva creata come effetto dell'aura (`custom-aura`, legata all'aura). La pulizia delle aure, che considera valide solo le pill, la rimuoveva al ricalcolo successivo. Ora ogni condizione su TS fallito di un'aura personalizzata è indipendente. Il test d'integrazione esistente che fissava il vecchio tipo è stato aggiornato e ora verifica anche che la pulizia non tocchi il Prono.
- **In Owlbear:** reimporta l'HTML della fase 3 aggiornato e ricollega il Grembo Invernale. Il nuovo collegamento riallinea i promemoria del Vento senza toccarne il raggio.
