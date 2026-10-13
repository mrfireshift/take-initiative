# Boss Actions — tranche 5: Titan's Grasp, Crush, Soul-Numbing Cold

Tre azioni a bersaglio singolo o a pochi bersagli che applicano condizioni o debuff. Detonation of the Mark passa alla tranche 6, insieme a Mark of the Frostmaiden.

## Prova rapida

1. Reimporta `auril-phase-2.html` e `auril-phase-3.html` (revisione **v5**) e ricollega il profilo della fase in corso.
2. **Titan's Grasp:**
   1. seleziona il PG e scegli Fallito o Superato;
   2. **Applica**.
   Sul fallimento il PG riceve Afferrato e Trattenuto (condizioni standard con fonte Auril). Sul successo non ci sono danni, ma l'uso 1/Round viene consumato.
3. **Crush:** funziona solo sul PG Afferrato da Auril. TS COS 19, metà sul successo, condizioni invariate, nessun limite per round.
4. **Soul-Numbing Cold:**
   1. seleziona sulla mappa fino a 3 creature;
   2. TS per ciascuna;
   3. **Applica**.
   I falliti ricevono l'etichetta debuff "Soul-Numbing Cold" fino alla fine del loro turno successivo.

## Contratto (profile/parser v5)

- **TS a bersaglio singolo** (`save-damage`, `target.mode: "single"`):
  - caratteristica FOR, DES o COS;
  - `success` `half` oppure `none`;
  - 1–2 componenti di danno con tipi distinti;
  - `onFailed.conditions` scelte tra Afferrato (con `escapeDC`) e Trattenuto, con rimozione manuale;
  - `grapple`:
    - `grab`: richiede Afferrato con CD di fuga e `success: "none"`;
    - `hold`: nessuna condizione nuova.
  - Blizzard Strike mantiene esattamente la forma precedente.
- **TS di gruppo senza danni** (`save-effect`):
  - `selection: "manual"` con `maxTargets` (massimo 6) e `range`;
  - sul fallimento un debuff `{ speedPenalty, noHealing: true, noTempHP: true }` fino alla fine del turno successivo del **bersaglio**: `turn-end`, attore `target`, ancoraggio `next-turn`.
- **Compatibilità:** i profili v1–v4 restano validi con le regole precedenti e non possono contenere queste forme.

## Regole di presa

- **Chi è afferrato:** chi ha un Afferrato attivo con fonte il token del boss. Le prese di altre fonti non contano.
- **Titan's Grasp** viene rifiutata se il boss tiene già una creatura. Il runtime legge l'intera scena al momento della risoluzione.
- **Crush** viene rifiutata se il bersaglio non è tenuto dal boss.
- **Registro:** il Combat Log riporta `grapple { rule, heldBefore }` e la CD di fuga di Afferrato.

## Soul-Numbing Cold

- **Etichetta:** debuff con `effectId: monster-action:soul-numbing-cold` e voci "Velocità −10 ft", "0 PF dalle cure", "No PF temporanei".
- **Scadenza:** è ancorata al turno del bersaglio (`actorId` = bersaglio). Gli slot Epic e i turni degli altri non la fanno scadere.
- **Nessun danno:** nessun campo danni, nessun cambio di PF e nessun campo PF nel log.

## Fuori scope

- **Titan's Grasp:** la sospensione a 30 ft e la portata delle mani restano note manuali.
- **Fuga dalla presa:** la prova per sfuggire (CD 18) non è un promemoria automatico, perché il codice non ha una primitiva per farlo.
- **Soul-Numbing Cold:** la riduzione di velocità e il blocco di cure e PF temporanei non modificano velocità, cure o PF; l'etichetta li ricorda.

## Verifica (12 ottobre 2026)

- **Test:**
  - nuovi: `bossActionTranche5Profile.test.js` e `bossActionTranche5Integration.test.js` (coordinatore, History e Undo reali, scadenza sui confini di turno reali);
  - estesi: i test della console;
  - suite completa 3203/3203, `npm run build` PASS, `git diff --check` PASS.
- **Browser di prova** (scenari `grasp-final`, `crush-ready`, `grasp-blocked`, `numbing-saves`, `numbing-final`, fase 3 con `?phase=3`): stati dei token verificati. Nessuno scorrimento del pannello nei casi provati.
