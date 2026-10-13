# Boss Actions — tranche 3: Breath of the Long Night, cono disegnato, difese ai danni

Breath of the Long Night (fase 2), il cono disegnato con lo strumento d'area esistente e le difese ai danni del profilo attore applicate a tutte le azioni Boss con danni per tipo. Nessun'altra mechanic di Auril.

## Prova rapida

1. Reimporta `auril-phase-2.html` (revisione **v3**, stat block corretto) e collegala al token di Auril.
2. Nella scheda attore di ogni PG: **Modifica → Difese ai danni**, per esempio Freddo = Res. Il profilo è persistente (registro della stanza), quindi basta una volta.
3. Apri **Breath of the Long Night** e segui i passi:
   1. spunta **Ricarica e sequenza verificate**;
   2. **Disegna cono**: la console si riduce, scegli sulla mappa un'origine libera (la testa del Titano) e la direzione, poi **Conferma sagoma** (Esc annulla);
   3. per ogni creatura colpita scegli **Fallito/Superato** (o "Tutti …"); l'etichetta "Res. freddo" viene dal profilo e un clic la ignora solo per questa risoluzione;
   4. **Applica**.
4. Un solo **Annulla** (console o Cronologia) ripristina PF, Accecato e contatore.

## Correzione dello stat block (decisione del GM)

La combo è **1/Round**: Breathe Deep è la prima Azione Epica di ogni round e Breath of the Long Night l'ultima.

Ho corretto la fixture `test/fixtures/boss-actions/auril-phase-2.html`, che è anche la copia da reimportare (il file originale in `E:\Download` non è stato modificato):
- `Breathe Deep (1/Round)`: "soltanto se è la prima Azione Epica che usa nel round".
- `Breath of the Long Night (1/Round, Special Recharge)`: "soltanto se è l'ultima Azione Epica che usa nel round".

Il parser accetta il titolo combinato `(N/Periodo, Special Recharge)`. Risultato:
- Breath: `usage { limit: 1, period: "round", note: "Special Recharge" }`, quindi un contatore automatico consumato insieme ai danni e ripristinato dall'Undo, con la ricarica che resta una nota manuale;
- Breathe Deep: registrazione manuale dell'uso 1/Round.

Il testo originale ("Special Recharge", "durante il round 1") viene ancora riconosciuto, senza contatore inventato.

## Contratto normalizzato (profile/parser v3)

```json
{
  "kind": "save-damage",
  "save": { "ability": "con", "dc": 19 },
  "target": { "mode": "multiple", "selection": "area", "area": { "shape": "cone", "size": 60, "origin": "Titano" } },
  "damage": [
    { "id": "cold", "formula": "6d10", "type": "cold", "printedAverage": 33 },
    { "id": "necrotic", "formula": "3d8", "type": "necrotic", "printedAverage": 13 }
  ],
  "success": "half",
  "onFailed": { "conditions": [{ "condition": "Accecato", "expiry": { "mode": "turn-end", "actor": "source", "remaining": 1, "anchor": "next-turn" } }] }
}
```

- **Grammar:** ancorata all'intera descrizione; il nome nella durata deve coincidere con il boss. Qualunque clausola diversa lascia l'abilità UNSUPPORTED.
- **Validator v3:** accetta solo questa forma; v1 e v2 restano invariati. La v3 non è mai stata rilasciata, quindi `selection` è passata da `manual` ad `area` senza un'ulteriore versione.
- **Revisione:** SHA-256 di `3\n` + HTML.

## Cono disegnato (origine libera)

- **Regola d'area sintetizzata.** `spellAreaRules.getBossActionAreaRuleById` genera e valida `boss-action-area:cone:<ft>ft` (5 ft = 1,5 m, come il catalogo incantesimi). La regola usa `origin: "point"`, `direction: "pointer"`, `anchor: "world"`, `range: null` e `includeCaster: false`. Il boss è passato come caster, così non viene mai colpito dal proprio soffio.
- **Strumento condiviso.** La console usa `requestSpellAreaPlacement` / `cancelSpellAreaPlacementRequest`, cioè lo strumento d'area esistente (`aoeTargetTool.js`): stessa geometria (`buildConeArea`, larghezza pari alla lunghezza, sulle caselle) e stesso criterio di colpo (creature del tracker che toccano l'area). Nessuna nuova geometria.
- **Gruppo dal disegno.** Le creature colpite diventano il gruppo, deduplicato e senza boss, attachment o slot virtuali. Dopo il disegno la selezione della mappa può solo **aggiungere** in modo esplicito ("Aggiungi"). Le rimozioni usano il pulsante ×, e "Ridisegna" sostituisce il gruppo.
- **Annullamenti.** Annullare il disegno, usare Esc o tornare indietro non produce alcuna mutation; la richiesta pendente viene annullata.
- **Causality.** `area { verification: "placed", placement { ruleId, start, end }, areaTargetIds, addedManually, removedManually }` e i passi manuali (origine libera scelta dal GM, ricarica, sequenza).

## Difese ai danni (profilo attore)

- **Campo:** `initiativeCard.damageDefenses = { immunities, resistances, vulnerabilities }` con i 13 tipi di danno standard (`src/damageDefensesCore.js`). Il campo è opzionale (stesso schema di `bossActionBinding`): i profili che non lo usano restano identici, e i salvataggi parziali lo conservano.
- **Interfaccia:** scheda attore, sezione "Difese ai danni" in visualizzazione e selettore —/Res./Imm./Vuln. per tipo in modifica.
- **Calcolo:** per ogni componente, prima l'esito (intero, metà o zero se mancato), poi la difesa (resistenza ½, vulnerabilità ×2, immunità 0), sempre con `scaledQuickHPAmount`. La UI usa la stessa funzione del commit.
- **Ambito:** tutte le azioni Boss con danni per tipo, cioè Icekiss, Rock, Polar Ray, Blizzard Strike e Breath.
- **Override:** il GM può ignorare una difesa per una sola risoluzione (ad esempio Mark of the Frostmaiden, che resta manuale). Il log registra `defense`, `defenseSource: "actor-profile"` e `defenseIgnored`.
- **Coerenza:** le difese viste nel draft vengono confrontate con il profilo al momento del piano; il profilo di ogni bersaglio danneggiato diventa una precondizione `assert` del commit. Se cambia, viene rifiutato tutto il comando.

## Primitive riutilizzate

- coordinatore effetti (`runEffectsMutation`);
- `condition:add` con istanza indipendente e expiry di Color Spray;
- History/Undo, Combat Log v3, broker per i retry;
- strumento d'area e geometria (`aoeTargetTool`, `aoeGeometryCore`, `spellAreaPlacementClient`);
- `saveInitiativeCard` per il profilo.

Nessun nuovo listener globale, schema IndexedDB, damage engine o sistema di condizioni.

## Fuori scope (intenzionale)

Blinding Gleam, Frostmaiden's Kiss, Mark/Detonation, altri spell, sequenza automatica delle Azioni Epiche, verifica automatica della ricarica, forced movement, Titan's Grasp/Crush/Hurl, delayed zones, phase transition, reactions/passivi, Doppia Manifestazione. Restano fuori anche le difese "solo da attacchi non magici" e l'applicazione delle difese a console HP e pannello incantesimi, che non distinguono il tipo di danno.

## Verifica (12 ottobre 2026)

- **Test:** Boss + difese + schede attore 258/258; `npm test` 3168/3168; `npm run build` PASS (avvisi preesistenti sui chunk); `git diff --check` PASS.
- **Nuovi file di test:**
  - `bossActionAreaRule.test.js`: regola, sessione senza caster, geometria reale del cono.
  - `damageDefenses.test.js`: contratto, profilo, aritmetica per azione.
  - `bossActionBreathProfile.test.js`: stat block corretto e testo originale.
  - `bossActionGroupIntegration.test.js`: coordinatore e History reali, con 1/Round, difese salvate con `saveInitiativeCard`, conflitto sul profilo durante il commit.
  - Estesi i test di popover e walkthrough (quest'ultimo calcola i colpiti con la geometria reale).
- **Browser harness** (`test-support/boss-actions-browser`, scenari `breath-drawing`, `breath-drawn`, `breath-saves`, `breath-long`, `breath-locked`, `breath-final`): strumento d'area simulato con la stessa geometria, più la scheda attore con modifica e salvataggio reali. È un SDK simulato: lo strumento d'area vero di Owlbear va provato in una stanza.
