# Boss Actions — tranche 11: Hurl ed Epic Resistance (profile/parser v16)

## Hurl (Titano, fase 2)

```json
{ "kind": "throw", "target": { "mode": "single", "maxTargets": 1 }, "grapple": "release",
  "distance": { "max": 30, "step": 10 },
  "damage": [{ "id": "bludgeoning", "formula": "1d6", "type": "bludgeoning", "printedAverage": 3 }],
  "onLanding": { "condition": "Prono" }, "edge": { "save": { "ability": "dex", "dc": 15 } } }
```

- **Bersaglio:** solo la creatura che il boss tiene Afferrata. Se è una sola, la console la sceglie da sé; se il boss non tiene nessuno, l'applicazione è bloccata.
- **Distanza:** 10, 20 o 30 ft. La console suggerisce i danni medi (3 ogni 10 ft) e la formula (1d6, 2d6, 3d6). Il suggerimento segue la distanza finché il GM non inserisce un tiro.
- **Danni:** contundenti, con resistenze e immunità del profilo attore.
- **Fine della presa:** al commit vengono tolti Afferrato e Trattenuto messi dal boss. Le prese di altre creature restano.
- **Atterraggio:** il GM sceglie dove atterra il bersaglio.
  - **Sulla piattaforma:** Prono, come condizione standard indipendente che si toglie a mano.
  - **Oltre il bordo:** nessun Prono. Il bersaglio riceve l'etichetta «Appeso al bordo» (debuff, rimozione manuale) e, dopo il commit, arriva il **promemoria del TS DES CD 15** su quell'etichetta:
    - successo: l'etichetta resta, il bersaglio è appeso e nel proprio turno può spendere 10 ft di movimento per risalire;
    - fallimento: l'etichetta viene tolta, il bersaglio precipita e la caduta resta del GM.
- **Cronologia e Annulla:** una voce History annullabile (PF, presa, Prono o etichetta). Il Combat Log registra distanza, atterraggio e condizioni rilasciate.

## Epic Resistance (fase 2 e fase 3)

```json
{ "kind": "effect-end", "roll": { "die": 20, "threshold": 11 } }
```

- **Elenco degli effetti:** tutto ciò che è attivo su Auril (`bossActiveEffects`).
  - Gli incantesimi compaiono con chi li ha lanciati, l'eventuale concentrazione e le condizioni che impongono, raggruppate sotto l'incantesimo.
  - Seguono le altre condizioni e le pill (debuff, buff, condizioni standard).
- **Tiro:** il GM inserisce il d20 (1–20), senza bonus, Vantaggio o Svantaggio. La console mostra subito «Riuscita · X termina» oppure «Fallita · X resta».
- **Esito:** con 11+ l'effetto termina.
  - Un incantesimo passa dalla rimozione del coordinatore (`spell:remove-requested`): se ne vanno anche le sue condizioni e la concentrazione del lanciatore su Auril.
  - Una condizione o una pill viene tolta da sola.
- **Sempre registrata:** riuscita o fallita, Epic Resistance crea una voce History e Combat Log con effetto, tiro, soglia ed esito. Un tentativo fallito non cambia nulla, ma resta nel log.
- **Uso:** nessun contatore; più tentativi nello stesso round sono ammessi. Non si registra più come uso manuale.

## Note tecniche

- `bossEdgeSaveCore.js` costruisce il promemoria del bordo con `buildEffectSaveReminderResolution` (lo stesso meccanismo di Compulsione): `success: keep-effect`, `failure: remove-effect`. Il runtime lo invia dopo il commit con `sendProjectedReminderPayload` (`postEdgeSave`, iniettabile nei test).
- La firma della sottoscrizione locale della console ora include condizioni e incantesimi del boss, così l'elenco di Epic Resistance si aggiorna da solo.
- I profili v1–v15 restano validi. Il loro Hurl ed Epic Resistance restano manuali, perché le nuove forme richiedono la v16.

## Verifica (13 ottobre 2026)

- **Test:**
  - `bossActionTranche11.test.js`: contratto, varianti manuali, Hurl sulla piattaforma e oltre il bordo, promemoria del bordo, rifiuti, elenco degli effetti, Epic Resistance riuscita, fallita, su incantesimo e su condizione;
  - `bossActionTranche11Integration.test.js`: coordinatore, History e Annulla reali; Hurl con presa terminata e Prono, poi annullato; Hurl oltre il bordo con invio del promemoria; Epic Resistance che termina un incantesimo con la sua condizione, poi annullata;
  - `bossActionTranche6Integration.test.js` riscritto per Epic Resistance: un tiro fallito e uno riuscito entrambi in History, nessun contatore;
  - console: moduli di Hurl ed Epic Resistance in `bossActionsPopover.test.js`;
  - suite completa 3297/3297, `npm run build` PASS, `git diff --check` PASS.
- **Browser di prova** (scenari `hurl-ready`, `hurl-final`, `resist-ready`, `resist-final`):
  - Hurl: 20 ft oltre il bordo, 6 danni, presa terminata;
  - Epic Resistance: 14 su Accecato, riuscita.
  - Corretto lo stile delle voci dell'elenco (prima testo bianco su fondo chiaro).
