# Boss Actions — tranche 4: Hand Slam e Blinding Gleam

Due azioni ad area di gruppo, sullo stesso percorso di Breath: disegno, TS di ogni creatura, danni per tipo, condizione. C'è anche una correzione che vale per tutte le azioni di gruppo.

## Correzione: condizioni standard

Prima l'Accecato di Breath veniva scritto con `effectId`/`effectKind: "debuff"`. Così il tracker lo mostrava come etichetta di un effetto e non come chip di condizione. Ora le condizioni di gruppo hanno la stessa forma della `conditionRule` degli incantesimi (Sunbeam, Color Spray): sono la condizione del popover "Condizioni", che può anche rimuoverle.

## Fixture allineate agli stat block canonici V10

`auril-phase-2.html` e `auril-phase-3.html` riportano le meccaniche dei documenti canonici V10 nel formato delle fixture, con i nomi inglesi delle capacità. I documenti canonici servono solo come riferimento e non vengono importati.

- **Breath of the Long Night:** richiede Breathe Deep come prima Azione Epica dello stesso round. La ricarica non passa al round successivo, e Breathe Deep non può stare nello stesso round di Gather the Winter Sky.
- **Crush:** TS COS 19, senza limite per round. Il bersaglio resta Afferrato e Trattenuto.
- **Titan's Grasp:** con un successo nessun danno e nessuna presa.
- **Meteor Swarm:** 1/Phase.
- **Rimebound Link:** è tra i tratti, e Doppia Manifestazione vi fa riferimento.
- **Blinding Gleam:** il testo esplicita il TS ripetuto a fine turno e l'immunità dopo il TS iniziale o uno successivo.
- **Altri dati:** CA 20 (fase 2), CA 17 e PF 336 (fase 3), sei slot fissi di Azione Epica, Aura Gelida solo dalla Proiezione, reazioni di fase 3 aggiornate.

Il parser accetta la formulazione canonica di Breath (le formulazioni precedenti restano valide) e quella di Blinding Gleam.

## Prova rapida

1. Reimporta `auril-phase-2.html` e `auril-phase-3.html` (revisione **v4**) e collega il profilo della fase in corso al token di Auril.
2. **Hand Slam** (fase 2):
   1. **Disegna cerchio**, clic sul centro, **Conferma sagoma**. Non c'è un passo di conferma, perché manca una ricarica da verificare.
   2. Scegli Fallito o Superato per ogni creatura, poi **Applica**.
   3. Il terreno difficile e il crollo restano una nota manuale.
3. **Blinding Gleam** (fase 3):
   1. **Posiziona emanazione**: la sagoma è centrata sul token di Auril. **Conferma sagoma**.
   2. Togli con × le creature con copertura totale.
   3. TS, poi **Applica**.

## Contratto (profile/parser v4)

- **Forme:** `cone` (punto libero, direzione), `circle` (centro libero), `emanation` (centrata sul token del boss). Le regole d'area sono `boss-action-area:<forma>:<ft>ft` in `spellAreaRules.getBossActionAreaRuleById`. L'emanazione usa lo stesso placement dell'aura di Spirit Guardians e non colpisce mai il boss.
- **TS:** DES o COS, metà danni sul successo.
- **Danni:** 1–2 componenti con media stampata; si aggiunge il tipo radioso.
- **Condizione sul fallimento:** Accecato o Prono, con scadenza scelta da un insieme chiuso:
  - fine del prossimo turno del boss (Breath);
  - rimozione manuale (Hand Slam);
  - 1 minuto con TS ripetuto a fine turno del bersaglio (Blinding Gleam).
- **Immunità sul successo** (`onPassed.immunity`, 24 ore): etichetta buff `Immune · <azione>`, effectId `monster-action:<azione>:immune`, rimozione manuale.
- **Compatibilità:** i profili v3 (solo Breath) e v1/v2 restano validi con le regole precedenti.

## Blinding Gleam: immunità e TS ripetuto

- Il TS iniziale superato aggiunge l'etichetta "Immune".
- Una creatura già "Immune" subisce i danni ma non Accecato, e non riceve una seconda etichetta.
- Il TS ripetuto riusa i promemoria esistenti (`saveReminder` con `resolution`). A fine turno del bersaglio compare "TS COS 19: se lo supera termina Accecato e diventa Immune per 24 ore". Il successo rimuove Accecato e applica la stessa etichetta.
- La console invia le immunità viste (`expectedImmuneIds`). Se sono cambiate, il comando viene rifiutato prima di qualsiasi modifica.

## Fuori scope

Restano fuori il terreno difficile e il crollo di Hand Slam, la copertura totale (la gestisci con ×) e la durata reale di 24 ore (l'etichetta si toglie a mano).

## Verifica (12 ottobre 2026)

- **Test:**
  - nuovi: `bossActionTranche4Profile.test.js` e `bossActionTranche4Integration.test.js`, che usano coordinatore, History, Undo e il pianificatore dei promemoria reali;
  - estesi: i test di popover e Breath;
  - suite completa 3183/3183, `npm run build` PASS, `git diff --check` PASS.
- **Browser di prova** (scenari `slam-drawn`, `slam-final`, `gleam-drawn`, `gleam-final`, fase 3 con `?phase=3`): strumento d'area simulato con la geometria reale. È un SDK simulato, quindi va provato anche in una stanza Owlbear vera.
