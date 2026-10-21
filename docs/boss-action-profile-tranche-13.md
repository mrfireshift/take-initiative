# Boss Actions — tranche 13: Rimebound Link (Auril, Fase 2, profilo v26)

Rimebound Link diventa un tratto automatizzato. I giocatori non vedono niente: nessuna pill, nessun effetto scritto sui token. Il GM vede una riga di stato nella console e riceve notifiche.

## Regola

All'inizio di ogni round il Titano ha Resistenza a tutti i danni; la Proiezione Fatata no. La prima volta nel round in cui la Proiezione subisce danni, la Resistenza termina dopo quei danni e torna solo al round successivo. Un'area che colpisce entrambe le manifestazioni conta una volta sola e applica la Resistenza prima che termini.

## Come si collega in OBR

- **Auril** (il token con il profilo collegato) è la **Proiezione Fatata**.
- I pezzi del **Titano** sono i **token secondari** collegati ad Auril con i PF condivisi (`docs/SHARED-HP.md`).

## Dati e stato

- **Profilo v26:** il tratto riceve `linkResistance: { holder: "Titano", breaker: "Proiezione Fatata", defense: "resistance", types: "all" }`, letto con una grammatica chiusa. Un profilo v25 non può contenerlo; nei test di compatibilità il tratto torna manuale (`test-support/bossLegacyProfile.js`).
- **Sul token di Auril:** il campo `bossLinkResistance` `{ enabled, name, holder, breaker, brokenRound? }`, unito ai metadata esistenti. Lo scrive il collegamento del profilo di Fase 2; il collegamento della Fase 3 e lo scollegamento lo tolgono. Ricollegare la Fase 2 conserva `brokenRound`.
- **Attivo** in ogni round canonico tranne quello in `brokenRound`. Nulla ascolta il cambio round: il Link si rinnova da solo perché il round cambia.

## Automazione

- **Interruzione** (`effectsMutations.prepareEffectsMutation`): ogni danno ai token collegati passa da `planSharedHpMutation`, che ora riporta anche `damageHitIds`. Se Auril è tra i colpiti e il Link è attivo, lo stesso comando scrive `brokenRound`. Vale per tracker, danni rapidi, incantesimi, attacchi dei PG e azioni boss; l'Undo ripristina il Link insieme ai PF. Senza un gruppo con il Link il coordinatore non legge niente di più.
- **Dimezzamento automatico** nella console degli attacchi dei PG (solo GM): i token del Titano ricevono in memoria un effetto con Resistenza a tutti i danni (`withBossLinkDefenses`), mai scritto sul token. Anteprima e applicazione dimezzano allo stesso modo; anche Palmo Tremante.
- **Avvisi al GM** (`OBR.notification`, solo ruolo GM, dopo il commit):
  - danno al Titano con il Link attivo: «Rimebound Link attivo: il Titano ha Resistenza a tutti i danni (…)», con «Danno già dimezzato.» se l'ha calcolato la console degli attacchi, altrimenti «Dimezza tu il danno se non l'hai già fatto.»;
  - danno ad Auril: «Rimebound Link interrotto …» fino al prossimo round.
- **Console Boss Actions:** la riga «Rimebound Link attivo (round N) …» oppure «… interrotto nel round N …».

## Limiti

- I danni inseriti a mano (modifica PF nel tracker, danni rapidi, risoluzione degli incantesimi) non vengono dimezzati: il plugin non sa se l'importo è già ridotto. L'avviso arriva dopo l'applicazione.
- Area su entrambe le manifestazioni: con la regola «Una volta per gruppo» scegli l'importo del Titano (dimezzato); poi il Link si interrompe.
- Il Link vale solo in combattimento (round canonico impostato).

## Test

- `bossLinkResistance.test.js`: dati v26, record, stato per round, resistenza in memoria, piano del coordinatore, testi degli avvisi.
- `bossLinkResistanceIntegration.test.js`: coordinatore vero, interruzione, area su entrambe, Undo, avvisi solo al GM, percorso invariato senza Link.
- `bossLinkResistancePcAttack.test.js`: console degli attacchi dei PG sul Titano e su Auril.
- `bossActionTranche10Integration.test.js`: record al collegamento e allo scollegamento.
- `bossActionsPopover.test.js`: riga di stato nella console.
