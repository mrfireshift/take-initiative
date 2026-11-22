# Studio: Santuario del Crepuscolo homebrew

22 novembre 2026. L'utente ha approvato D1–D7 come consigliate lo stesso giorno («Sì, tutte»), e sono applicate: vedi [Esito](#esito) in fondo.

## Il testo homebrew

Scritto dall'utente, che lo ha messo a disposizione del plugin:

> Azione, 1 minuto - emani una sfera di luce fioca centrata su te stessa, r = 9m, che si muove seguendoti.
> Quando una creatura (inclusa te) termina il suo turno all'interno della sfera, puoi usare la tua reazione per concederle una sola opzione a sua scelta tra:
> - punti ferita temporanei pari a 1d6+livello da chierico
> - rimuovere condizione affascinato o spaventato

Il 22/11, su richiesta dell'utente, il testo mostrato dalla scheda è stato riformulato in stile da manuale, in terza persona come gli altri testi delle capacità. Comprende la fine anticipata approvata in D5. È in `data/class-features/homebrew_database_finale.json` e non contiene sequenze dei testi privati (controllo di `scripts/check-private-texts.mjs`):

> Al 2° livello, il chierico ottiene questa opzione di Incanalare Divinità, con cui avvolge sé stesso e i suoi compagni in un crepuscolo protettivo.
>
> Come azione, il chierico emana una sfera di luce fioca del raggio di 9 metri, centrata su di sé, che si sposta insieme a lui. La sfera dura 1 minuto o finché il chierico non diventa incapacitato.
>
> Quando una creatura all'interno della sfera, chierico compreso, termina il proprio turno, il chierico può usare la sua reazione per concederle uno dei benefici seguenti, a scelta della creatura:
> - La creatura ottiene un ammontare di punti ferita temporanei pari a 1d6 + il livello da chierico del chierico.
> - La creatura smette di essere affascinata o spaventata. Se è sia affascinata sia spaventata, sceglie quale delle due condizioni termina.

## Le differenze con la versione ufficiale

| | Ufficiale (Tasha), come la tratta oggi il plugin | Homebrew |
| --- | --- | --- |
| Attivazione | azione, un uso di Incanalare Divinità | uguale |
| Sfera | 9 m, centrata sul chierico, lo segue | uguale |
| Durata | 1 minuto; finisce prima se il chierico è incapacitato o muore | 1 minuto; il testo non dice altro |
| Chi può ricevere | ogni creatura che termina il turno nella sfera, chierico compreso | uguale |
| Costo del beneficio | nessuno | la reazione del chierico |
| Chi sceglie il beneficio | il chierico | la creatura |
| Benefici | PF temporanei 1d6 + livello da chierico, oppure la fine di un effetto che affascina o spaventa | PF temporanei 1d6 + livello da chierico, oppure via Affascinato o Spaventato |

Con la reazione, il beneficio arriva al massimo a una creatura per round.

## Com'è fatta oggi la versione ufficiale

- Dati: `data/class-features/runtime-feature-overrides.json`, voce `chierico-dominio-del-crepuscolo-incanalare-divinita-santuario-del-crepuscolo`, rigenerata in `src/class-features-runtime.json`.
  - Aura di 9 m su tutte le creature, chierico compreso, per 10 round.
  - Pill «Santuario del Crepuscolo» sulla scheda del chierico, non sulla mappa.
  - Pill «Nel Santuario del Crepuscolo» su chi sta dentro.
- Sulla mappa la sfera è un cerchio viola attaccato al token del chierico (`classFeatureAuraController.js`): lo segue e si nasconde con lui.
- A fine turno di una creatura nella sfera il GM riceve il promemoria centrale (`turn-notice`):
  - un campo «PF temporanei» in cui scrive il totale di 1d6 + livello;
  - i pulsanti «Applica PF temporanei» e «Ignora».
- I PF temporanei vanno in `meta.tempHp`. Non si sommano: resta il valore più alto (CAP-TEMP). Non hanno fonte, quindi restano anche dopo la fine del Santuario.
- Affascinato e Spaventato si tolgono a mano.
- Lo schermo del tavolo vede lo stesso promemoria in sola lettura, secondo l'opzione «Promemoria ai giocatori» (di base completa).
- Difetto trovato: la fine anticipata `incapacitato_o_morto` non scatta mai.
  - Il motore cerca una condizione con quel nome, che non esiste.
  - `incapacitato` invece funziona (Mantello di Mosche), anche quando l'incapacità viene da privo di sensi, paralizzato, stordito o pietrificato.

## Cosa si riusa

| Sistema | Dove | Uso nella variante |
| --- | --- | --- |
| Aura e pill | `classFeatureAuraCore.js`, `classFeatureAuraController.js` | invariati: sfera, membri, pill, fine dopo 10 round |
| Promemoria di fine turno | `spellZoneTriggerCore.js`, `classFeatureAuraReminderCore.js` | il filtro per bersaglio (`suppressedTargetIdsByTrigger`) c'è già, ma l'aura non lo usa ancora |
| Risoluzione del promemoria | `reminderResolutionCore.js` | PF temporanei (`manual-heal` con `temporaryHp`) e rimozione di pill (`condition:remove-instances`), in un solo comando con un solo Annulla |
| Reazione | `reactionTrackerCore.js` | «Reazione usata» sul chierico, che torna all'inizio del suo turno |
| Scelta sulla scheda | `optionGroup` in `classFeatureCatalog.js` e `initiative-card-modal.js` | due capacità dello stesso gruppo diventano pulsanti radio, come l'ambiente dell'Aura Tempestosa |
| Solo il dado | `spellTemporaryHpRules.js` (Vita falsata) | il GM scrive il d4 e il plugin aggiunge il resto |

## Decisioni

### D1. Come convive con la versione ufficiale

- **a) Consigliata: una scelta sulla scheda.**
  - Nella scheda, sotto Incanalare Divinità, compaiono due pulsanti radio: «Santuario del Crepuscolo» (Tasha) e «Santuario del Crepuscolo (homebrew)».
  - Ne è attivo uno solo. Di base resta l'ufficiale.
  - Dietro c'è una voce nuova del catalogo, con la fonte «Homebrew del tavolo», lo stesso livello 2 e lo stesso costo (un uso di Incanalare Divinità).
  - La scheda mostra il testo dell'utente: è suo, quindi può stare nel repository.
- b) Una capacità separata con la sua casella. Si possono accendere tutte e due, e nelle azioni compaiono due Santuari.
- c) Un interruttore del tavolo nelle Opzioni. Vale per tutti i chierici, ma non si attiva dalla scheda.

### D2. Dove compare l'offerta e chi la vede

- **Consigliato: lo stesso promemoria di fine turno della versione ufficiale.**
  - Ogni creatura che termina il turno nella sfera ha la sua riga.
  - Solo il GM ha i pulsanti.
  - Lo schermo del tavolo vede la riga in sola lettura, come gli altri promemoria. Così il giocatore legge le due opzioni e sceglie a voce («a sua scelta»), e il GM preme.
  - Online vale lo stesso, come per gli altri promemoria.
- La riga ha:
  - un campo per il d6 e il pulsante «PF temporanei»;
  - «Togli Affascinato» e «Togli Spaventato», solo se la creatura ha davvero quella condizione;
  - «Ignora».
  Si sceglie una sola opzione.
- Gli avvisi di reazione (Opzioni → Avvisi di reazione) restano fuori. Quel sistema non conosce la fine del turno dentro un'aura, e i suoi interruttori non governano questo promemoria.

### D3. Il tiro di 1d6 + livello da chierico

- **a) Consigliata: il GM scrive solo il d6, da 1 a 6.**
  - Il plugin aggiunge il livello da chierico letto dalla scheda del chierico, come Vita falsata aggiunge il suo +4.
  - Accanto al campo mostra la somma, per esempio «+ 5 = 9».
  - Se la scheda non ha il livello, il campo chiede il totale, come oggi.
- b) Il GM scrive il totale, come oggi nell'ufficiale.
- In tutti e due i casi i PF temporanei seguono le regole di CAP-TEMP: resta il più alto, e non finiscono con il Santuario.

### D4. Affascinato o Spaventato

- **a) Consigliata: un pulsante per condizione.**
  - Compare un pulsante per ogni condizione che la creatura ha davvero.
  - Il clic toglie tutte le pill di quella condizione: il testo homebrew dice «rimuovere condizione».
  - Se la pill viene da un incantesimo, come Paura o Charme su persone, sparisce solo la pill e l'incantesimo resta, come quando la si toglie a mano.
- b) Un pulsante per ogni pill: toglie un solo effetto, come nel testo ufficiale.

### D5. Reazione, nemici e durata

- **Reazione (consigliato).**
  - Il beneficio scrive «Reazione usata» sul chierico nello stesso comando, quindi un Annulla restituisce tutte e due le cose.
  - Finché la reazione del chierico è usata, l'offerta non compare, qualunque sia il motivo per cui l'ha spesa. Torna all'inizio del suo turno.
  - Con due offerte aperte, se il GM ne usa una, l'altra rifiuta: «Sera ha già usato la reazione in questo round».
  - Se l'offerta si risolve nel turno del chierico (è il caso della creatura che gioca subito prima di lui), la reazione è già tornata e non si segna niente.
- **Nemici (consigliato).** Le creature segnate come nemiche non ricevono l'offerta, mentre PG, alleati e neutrali sì. La pill «Nel Santuario del Crepuscolo» resta su tutti, come oggi.
- **Durata (consigliato).** 10 round e un uso di Incanalare Divinità, come l'ufficiale.
  - Finisce prima se il chierico è incapacitato, come l'ufficiale, anche se il testo homebrew non lo dice.
  - Nella variante si scrive `incapacitato`, che funziona.
- Limite noto, da guardare al banco. Prendiamo la creatura che gioca subito prima del chierico, in un round in cui la reazione è già stata spesa. A quel cambio di turno la reazione torna. Se il plugin toglie «Reazione usata» prima di leggere la fine del turno, l'offerta compare lo stesso, e il GM la ignora.

### D6. La sfera sulla mappa

- **Consigliato: come l'ufficiale.**
  - Un cerchio viola di 9 m, attaccato al token del chierico, che lo segue e si nasconde con lui.
  - Niente luce fioca vera: il plugin non tocca luci e nebbia di Owlbear (Dynamic Fog). La pill dice «luce fioca».

### D7. Ritocchi alla versione ufficiale

Sono fuori dalla variante, quindi le decide l'utente.

- **a) Consigliato sì.** Correggere la fine anticipata dell'ufficiale da `incapacitato_o_morto` a `incapacitato`.
  - Nei dati è una parola.
  - Cambia il comportamento: l'aura finisce da sola quando il chierico va a 0 PF o è stordito.
- **b) Consigliato sì.** Dare anche all'ufficiale i pulsanti «Togli Affascinato» e «Togli Spaventato» e il campo del solo d6 (D3 e D4), senza la reazione.
  - Il codice è lo stesso.
  - Con un no, l'ufficiale resta com'è.

## Rischi

AGENTS.md chiede di spiegarli prima di toccare PF, turno, metadata e barre.

- **PF.** I PF temporanei passano dalla strada che l'ufficiale usa già: `calculateQuickHPChange` in modalità temporanei, poi `meta.tempHp`, dove resta il più alto. Nessun campo nuovo. Le barre del tracker e quelle della mappa leggono già `tempHp`.
- **Condizioni.** Le pill si tolgono con `condition:remove-instances`, come fanno già altri promemoria. Prima di scrivere, il piano controlla che la pill sia ancora attiva.
- **Turno.** Nessuna scrittura sull'ordine o sul turno attivo. Lo stato della scena si legge solo per sapere di chi è il turno (la reazione) e resta come precondizione del comando, come oggi.
- **Metadata.** Nessuna chiave nuova.
  - Una scheda con l'homebrew ha il suo id in `enabledClassFeatureIds`, un campo che esiste già.
  - L'aura salva le attivazioni dove le salva oggi.
  - Il catalogo guadagna una voce e una fonte: i conteggi di alcuni test cambiano (860 → 861 record, 272 → 273 implementate).
- **Stato vecchio.** Al clic, il piano rilegge la reazione del chierico, le condizioni della creatura e l'attivazione della zona: un'offerta superata dice perché e si chiude da sola, come gli altri promemoria.
- **File fragili.** `initiativeList.js` non si tocca. `turn-notice.ts` sì: i pulsanti nuovi stanno accanto a quelli esistenti, solo per i promemoria che li chiedono.

## Lotti, dopo il via

1. **H1, catalogo.**
   - La fonte `homebrew` nel generatore, con due file piccoli in `data/class-features/` (record e meccanica).
   - La voce negli override, con lo stesso `optionGroup` dell'ufficiale.
   - Rigenerare il catalogo e aggiornare i conteggi dei test. La guardia dei testi privati deve accettare il file homebrew.
2. **H2, offerta.** In `classFeatureAuraReminderCore.js`: niente offerta con la reazione usata o a un nemico, e il livello da chierico nella riga. Test puri.
3. **H3, risoluzione.** In `reminderResolutionCore.js`:
   - l'esito «togli la condizione»;
   - la reazione nel comando, con il caso del turno del chierico;
   - il d6 più il livello.
   Test puri e test d'integrazione sul comando.
4. **H4, popup.** In `turn-notice.ts`: il campo del d6 con la somma e i pulsanti delle condizioni, letti dal token.
5. **H5, verifiche e documenti.**
   - `npm test`, `npm run check:spells` e una build fuori da `dist`.
   - Banco 5199 con `polishBench.js`, in vista compatta ed espansa.
   - `docs/GUIDA_UTENTE.md`, `docs/CAPACITA_CLASSE.md` e le prove in `docs/PROVE_IN_STANZA.md`.

## Fuori richiesta

- Il difetto di `incapacitato_o_morto` nell'ufficiale, se D7a è no.
- L'offerta dell'ufficiale arriva anche ai nemici: con D5 la variante li salta, l'ufficiale no.

## Esito

22 novembre 2026, dopo il via dell'utente. Niente è ancora committato.

### Cosa è stato fatto

- **H1, catalogo.**
  - La fonte `homebrew` («Homebrew del tavolo») nel generatore, con `data/class-features/homebrew_database_finale.json` (record e testo dell'utente) e `homebrew_livello_meccanico_v1_0.json`.
  - La voce `chierico-dominio-del-crepuscolo-incanalare-divinita-santuario-homebrew` negli override, con lo stesso `optionGroup` dell'ufficiale.
  - Sull'ufficiale (D7): la fine su `incapacitato`, il d6 con il livello aggiunto e i pulsanti delle condizioni.
  - Catalogo rigenerato: 861 capacità, 273 implementate.
- **H2, offerta.** In `classFeatureAuraReminderCore.js`: il livello da chierico nel trigger (`temporaryHpBonus`); niente offerta con la reazione usata o a una creatura ostile.
- **H3, risoluzione.** In `reminderResolutionCore.js`:
  - l'esito `remove-condition`;
  - il d6 controllato da 1 a 6 e sommato al livello;
  - «Reazione usata» nello stesso comando, ma non quando il turno del chierico è già cominciato;
  - il rifiuto quando la reazione è già usata («Scegli Ignora»).
  In `reminderResolution.js` la parola dell'esito nella Cronologia e nel messaggio, con la reazione usata.
- **H4, popup.** In `turn-notice.ts`: il campo del d6 con «+ 5 = 9» e i pulsanti «Togli …» letti dal token.
- **H5.** Test, banco e documenti: guida, `CAPACITA_CLASSE.md` e la sezione B69 della lista unica delle prove in stanza.

### Due difetti trovati al banco e corretti

1. **I promemoria di fine turno delle aure delle capacità non partivano.**
   - `classFeatureAuraController.js` scrive le attivazioni sull'aura, e questa scrittura rende vecchia la fotografia della scena.
   - Il controllo subito dopo usciva prima di inviare i promemoria. Le aure degli incantesimi e quelle personalizzate gestiscono già questo caso; quella delle capacità no.
   - Ora segue lo stesso schema: se la scrittura è sua, i promemoria partono.
   - Il difetto toccava anche l'ufficiale, Angelo Vendicatore, Nube Sacra, Presenza Draconica e Mantello di Mosche.
2. **La creatura che gioca subito prima del chierico riceveva l'offerta** anche con la reazione spesa: era il limite noto di D5.
   - Al cambio di turno il plugin toglie «Reazione usata» prima che l'aura legga la fine del turno.
   - Ora l'aura ricorda lo stato della reazione visto all'ultima passata (`sourceReaction` nei suoi metadata), e al cambio di turno conta quello. Lo fanno solo le aure che costano la reazione.

### Verifiche

- `npm test` verde; `npm run check:spells` verde; build fuori da `dist` riuscita, `dist` intatta.
- Nessuna sequenza di 12 parole dei testi privati nelle aggiunte (funzioni di `scripts/check-private-texts.mjs`).
- Banco 5199 con lo sfondo vero (`polishBench.js`), pagine fresche, ordine con le azioni epiche virtuali:
  - la scelta sulla scheda con clic veri sui pulsanti radio, e il salvataggio;
  - l'attivazione dalla scheda, l'uso di Incanalare Divinità speso, l'aura su tutte e sei le creature;
  - un round intero:
    - offerta a Sera, ignorata senza spendere niente;
    - a Dars 4 + 5 = 9 PF temporanei e la reazione spesa;
    - nessuna offerta a Mira, ai due goblin e ad Auril;
    - la reazione torna all'inizio del turno di Sera;
  - «Togli Spaventato» su Dars, poi un Annulla che rimette Spaventato e la reazione; l'offerta torna;
  - con due offerte aperte, quella rimasta sparisce quando la reazione viene spesa;
  - viste estesa e compatta: «Reazione usata» su Sera, «60/60 +9» su Dars;
  - Sera priva di sensi: il Santuario finisce da solo, aura e pill comprese;
  - l'ufficiale: l'offerta arriva anche al goblin nemico, 2 + 5 = 7 PF temporanei, nessuna reazione.

### Cosa resta

- La prova in stanza: sezione B69 di `docs/PROVE_IN_STANZA.md`.
- Commit, bundle e push, quando l'utente li chiede.
