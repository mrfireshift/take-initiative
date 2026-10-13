# Boss Actions — tranche 6: Mark of the Frostmaiden, Detonation of the Mark, Frostmaiden's Kiss

Il marchio di Auril (fase 2), la sua detonazione (fase 3) e il bacio che cura Auril. Su decisione del GM, la riduzione dei PF massimi resta manuale.

## Prova rapida

1. Reimporta `auril-phase-2.html` e `auril-phase-3.html` (revisione **v6**) e ricollega la fase in corso.
2. **Mark of the Frostmaiden:** seleziona una creatura, TS, **Applica**. Chi fallisce riceve l'etichetta "Mark of the Frostmaiden".
3. **Regola del marchio:**
   - la prima volta in ogni round in cui il marchiato subisce danni da freddo da un'azione di Auril nella console, la Resistenza al freddo è ignorata e l'Immunità vale come Resistenza;
   - la console mostra il badge "Marchio" e l'anteprima già corretta;
   - dopo l'uso nel round il badge diventa "Marchio (usato)".
4. **Detonation of the Mark** (fase 3):
   - solo su una creatura marchiata;
   - Trattenuto fino alla fine del suo turno successivo sul fallimento;
   - il marchio termina in ogni caso.
5. **Frostmaiden's Kiss:** Auril recupera i PF pari ai danni necrotici subiti. Il messaggio finale ricorda di ridurre a mano i PF massimi del bersaglio.

## Contratto (profile/parser v6)

- **Marchio** (`save-effect`, `selection: "manual"`, `maxTargets: 1`): `onFailed.mark { id, rule: "cold-ward-break", expiry: manual }`. L'etichetta ha `effectId: monster-mark:<bossDefinitionId>:<id>` ed è condivisa da tutte le fasi dello stesso boss, anche se il token di fase 3 è diverso.
- **Detonation** (TS singolo):
  - `requiresMark { id }` e `consumesMark: true`;
  - Trattenuto con scadenza "fine del turno successivo del bersaglio";
  - danni freddo più radiosi, metà sul successo.
- **Kiss** (attacco con incantesimo in mischia): `drain { component: "necrotic", healsSource: true, maxHpReduction: "manual" }`.
- **Compatibilità:** i profili v1–v5 restano validi e non possono contenere queste forme.

## La regola del marchio

- **Dove si applica:** in entrambi i builder (bersaglio singolo e gruppo), a tutte le azioni con una componente da freddo: Icekiss, Kiss, Breath, Hand Slam, Titan's Grasp, Crush, Polar Ray, Blizzard Strike e Detonation.
- **Cosa cambia:** solo le difese di questa risoluzione; il profilo attore non viene modificato. Il Combat Log registra `mark { rule, targetIds, round }` e, sulla componente, `mark.profileDefense`.
- **Quando si consuma:** solo se viene inflitto davvero danno da freddo. Un mancato, un tiro di freddo pari a 0 o "nessun danno" non lo consumano.
- **Uso nel round:** è salvato in `bossActionState.markUses` sul token del boss, nello stesso comando dei danni, quindi l'Undo lo ripristina. Vengono conservati solo gli usi del round corrente.
- **Protezione:** la console invia `expectedMarkedIds`. Se il marchio o il suo uso cambiano prima del commit, il comando viene rifiutato senza modifiche.

## Frostmaiden's Kiss

- **Cura:** Auril recupera la componente necrotica dopo le difese del bersaglio, senza superare i suoi PF massimi. È un `hp:set` sul token del boss nello stesso comando.
- **PF massimi del bersaglio:** restano invariati. Il risultato e il Combat Log riportano `maxHpReduction { targetId, amount, manual: true }`.
- **Nessuna conferma:** il testo manuale è un passo da fare dopo, non un prerequisito, quindi non c'è la casella di conferma.

## Risorse del boss e libreria (debug successivo)

- **Causa del "Breathe Deep non si ricarica":**
  - i contatori 1/Round sono salvati per numero di round sul token del boss e non sapevano nulla dei combattimenti;
  - un nuovo combattimento (o il round azzerato con ↺) ritrovava gli usi dei round con lo stesso numero, e le azioni risultavano esaurite;
  - i contatori 1/Phase (Gather the Winter Sky, Meteor Swarm) non avevano modo di essere azzerati.
- **Pulizia automatica:** ogni nuovo uso conserva solo il round corrente e il precedente, e scarta i round più vecchi o successivi.
- **Avviso:** se ci sono usi in round successivi a quello attuale, la lista azioni li segnala. Possono venire solo da un combattimento precedente.
- **Azzera risorse:** nella vista "Gestisci profilo" e nell'avviso. È un solo comando che svuota contatori per round, contatori per fase e usi del marchio di questo token. Chiede conferma con un secondo clic, è annullabile dalla Cronologia e nel Combat Log compare come `resource-reset`.
- **Libreria locale ("Gestisci profilo"):**
  - le revisioni mostrano versione e stato ("collegata qui", "in uso", "superata");
  - un avviso segnala un token collegato a una revisione superata;
  - "Elimina revisione" e "Pulisci superate" chiedono conferma con un secondo clic e non eliminano mai una revisione in uso nella scena.

## Fuori scope

Restano manuali:
- il marchio quando Auril viene sconfitta;
- i danni da freddo di Auril inflitti fuori dalla console, per esempio con gli incantesimi;
- libertà di movimento contro Trattenuto;
- la riduzione dei PF massimi.

## Verifica (12 ottobre 2026)

- **Test:**
  - nuovi: `bossActionTranche6Profile.test.js` e `bossActionTranche6Integration.test.js` (coordinatore, History e Undo reali);
  - estesi: i test della console;
  - suite completa 3220/3220, `npm run build` PASS, `git diff --check` PASS.
- **Browser di prova** (scenari `mark-final`, `marked-icekiss`, `kiss-ready`, `detonation-ready`, `detonation-final`, fase 3 con `?phase=3`): stati dei token e del boss verificati.
