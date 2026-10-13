# Boss Actions — tranche 8: Meteor Swarm ed Elusione

## Meteor Swarm (profile/parser v9)

```json
{ "kind": "save-damage", "save": { "ability": "dex", "dc": 19 },
  "target": { "mode": "multiple", "selection": "area",
    "area": { "shape": "circle", "size": 40, "origin": "punti scelti", "count": 4, "innerRadius": 10 } },
  "damage": [
    { "id": "cold", "formula": "14d6", "type": "cold", "printedAverage": 49 },
    { "id": "bludgeoning", "formula": "6d10", "type": "bludgeoning", "printedAverage": 33, "scope": "inner" }
  ],
  "success": "half", "requiresConfirmation": true }
```

- **Flusso nella console:**
  1. si conferma il requisito (Gather the Winter Sky come prima Azione Epica, Meteor Swarm come ultima del round 2);
  2. si disegnano le quattro esplosioni in un solo disegno: ogni rilascio fissa un centro (numerato 1/4…4/4 sulla mappa), poi una sola «Conferma sagoma»;
  3. TS per creatura;
  4. **Applica**.
- **Disegno unico (`context.areaBatch`):**
  - la console chiede allo strumento d'area condiviso tutte le esplosioni mancanti con `areaBatch: {count, minDistanceFeet, innerRadiusFeet}`;
  - ogni sagoma rilasciata resta sulla mappa con il suo numero (1/4…4/4);
  - **spostare un'esplosione:** si trascina il suo cerchio interno (arancione); l'esplosione mantiene il numero e le altre restano dove sono. I cerchi interni non si sovrappongono mai, quindi il punto di partenza individua una sola esplosione;
  - un trascinamento fuori dai cerchi interni aggiunge un'esplosione se ne mancano; con tutte posizionate non fa nulla e mostra un avviso;
  - **centro del danno extra:** ogni esplosione mostra in arancione il cerchio da 10 ft, sulle stesse caselle usate dal calcolo "entro 10 ft";
  - la conferma è rifiutata finché mancano sagome; una sola conferma calcola le creature colpite da ciascuna e restituisce `preview.areas` nell'ordine dei numeri;
  - Esc annulla tutto il disegno; senza `areaBatch` lo strumento si comporta esattamente come prima, quindi gli incantesimi non cambiano.
- **Pulsanti dell'area:** **Ridisegna tutte** apre un nuovo disegno; le esplosioni confermate restano finché il nuovo disegno non viene confermato. **Ricomincia** serve solo nel percorso di ripiego un punto alla volta (risultato senza `areas`).
- **Punti troppo vicini:** un centro a meno di 20 ft da uno già fissato (due volte il raggio interno) viene rifiutato dallo strumento con un avviso e va ridisegnato; la console ricontrolla le distanze sul risultato.
- **Bersagli:** il gruppo è l'unione delle quattro esplosioni e ogni creatura subisce ciascuna componente una sola volta. La selezione sulla mappa può solo aggiungere creature.
- **"Entro 10 ft":** è calcolato dai centri disegnati con la geometria dello strumento d'area (`buildCircleArea` e `areaHitsBounds`), usando la scala della griglia e l'ingombro dei token. Ogni riga ha un'etichetta "≤10 ft" che il GM può cambiare. Solo chi la mantiene subisce i contundenti.
- **Combat Log:** il log registra i quattro punti, l'unione dei bersagli e le creature "entro" calcolate e finali, con quelle aggiunte o tolte a mano.
- **Uso:** il comando consuma l'uso 1/Phase e l'Annulla lo ripristina.
- **Compatibilità:** i profili v1–v8 restano validi e non possono contenere queste forme.

## Elusione (difesa ai danni ricavata dalla classe)

- **Da dove viene:** il profilo attore (`initiativeCard.characterBuild`) dichiara un Ladro di livello 7 o superiore con il privilegio "Elusione" (`ladro-elusione`). Il privilegio è attivo di default; se i privilegi sono stati configurati, conta solo se è abilitato. Un test verifica che questi dati restino allineati al catalogo dei privilegi.
- **Quando si applica:** a ogni TS di Destrezza che dimezza i danni: Meteor Swarm e Hand Slam, non Titan's Grasp. Sul successo nessun danno, sul fallimento metà. Il fattore si applica prima di resistenze e vulnerabilità.
- **Console:** un'etichetta "Elusione" per bersaglio, che si può ignorare per una sola risoluzione come le altre difese. La console invia le Elusioni viste (`expectedEvasionIds` / `expectedEvasion`); se cambiano prima del commit, il comando viene rifiutato.
- **Combinazioni:** Elusione, resistenze e regola del marchio si combinano per creatura.

## Correzione di un difetto della tranche 7

Passando alla v8 la validazione non accettava più i profili v7 già salvati. Un profilo non valido nella libreria locale ne impedisce la lettura. Ora ogni versione da 1 a quella corrente viene accettata, e un test lo verifica a ogni nuova versione.

## Verifica (12 ottobre 2026)

- **Test:**
  - `bossActionTranche8.test.js`: contratto, geometria, Elusione, combinazioni e regressione sulle versioni;
  - integrazione con coordinatore, History e Annulla reali;
  - flusso della console;
  - suite completa 3246/3246, `npm run build` PASS, `git diff --check` PASS.
- **Browser di prova** (scenari `meteor-drawn` e `meteor-final`):
  - quattro esplosioni sulla mappa simulata, 5 creature, 2 entro 10 ft;
  - Dars resistente 57, Mira con Elusione 40 sul fallimento;
  - contatore 1/Phase consumato.

## Disegno unico e UI della console (12 ottobre 2026)

- **Righe del gruppo:** il nome occupa da solo la prima riga; PF ed etichette (resistenze, Elusione, "≤10 ft") stanno sulla seconda. Senza etichette sul fallimento la colonna relativa non occupa spazio.
- **Passo 1:** appena confermato si riduce a una riga ("Ricarica e sequenza verificate."); il testo completo resta nel tooltip.
- **Test:** `aoeAreaBatchContract.test.js` (contratto dello strumento), passthrough di `areas` in `spellAreaPlacementCore.test.js`, flusso con risultato unico nella console; suite completa 3253/3253, build PASS, `git diff --check` PASS.
- **Browser di prova:** scenario `meteor-drawing` (quattro sagome numerate in attesa di conferma), `meteor-drawn` e `meteor-final` con una sola conferma e gli stessi risultati di prima, `meteor-moved` / `meteor-moved-confirmed` (l'esplosione 2 spostata dal suo cerchio arancione mantiene il numero; un trascinamento a vuoto non cambia nulla).
- **Limite:** dopo «Conferma sagoma» le anteprime spariscono dalla mappa, come per gli incantesimi.
