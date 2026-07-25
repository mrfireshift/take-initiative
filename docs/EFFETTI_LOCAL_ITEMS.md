# Migrazione delle label degli effetti a `OBR.scene.local`

## Obiettivo

Verificare sperimentalmente se una label locale può essere collegata tramite `attachedTo` a un token globale e, dopo la validazione, spostare nello store locale pill condizioni, pill incantesimi e badge concentrazione.

## Evidenze dalla documentazione

- [`OBR.scene.local`](https://docs.owlbear.rodeo/extensions/apis/scene/local/) è uno store temporaneo visibile soltanto all'utente corrente e replica le operazioni principali di `OBR.scene.items`.
- L'API locale espone anche `getItemAttachments` e `getItemBounds`.
- La proprietà [`Item.attachedTo`](https://docs.owlbear.rodeo/extensions/reference/items/item/) contiene l'ID del parent e può propagare posizione, scala, rotazione, visibilità, lock, copia e cancellazione.
- La documentazione non dichiara esplicitamente se il parent di un item locale possa appartenere allo store globale. Questo comportamento deve quindi essere verificato sulla versione live di Owlbear Rodeo.

## Probe diagnostico

Il probe crea esclusivamente una label magenta nello store locale. Non aggiorna né elimina item globali e non usa i metadata delle barre HP.

1. Selezionare esattamente un token sulla mappa.
2. In una console del plugin eseguire:

   ```js
   await __tbpEffectsLocalProbe.start()
   ```

3. Conservare `markerId`, muovere il token sulla mappa di almeno una cella e attendere un secondo.
4. Eseguire:

   ```js
   await __tbpEffectsLocalProbe.report()
   ```

5. Su un secondo client, in una console del tracker, eseguire:

   ```js
   await __tbpEffectsLocalProbe.observe("<markerId>")
   ```

6. Sul client iniziale rimuovere il marker:

   ```js
   await __tbpEffectsLocalProbe.finish()
   ```

In caso di interruzione si può sempre usare `await __tbpEffectsLocalProbe.cleanup()`.

## Criteri di accettazione

- `evaluation.verdict` è `pass` dopo lo spostamento.
- `localOnly` e `attachmentReferencePreserved` sono `true`.
- `tokenDelta` e `markerDelta` coincidono entro la tolleranza indicata. I bounds della label restano un dato diagnostico secondario perché possono risentire delle trasformazioni visuali.
- Il marker non compare in `OBR.scene.items`.
- Sul secondo client `observe()` restituisce `isolatedOnThisClient: true`.
- Il marker viene eliminato con successo da `finish()`.

## Conseguenze architetturali

Le label locali non possono essere prodotte soltanto dal background GM: ogni client osserva i metadata globali e riconcilia il proprio store locale. La migrazione prevede inoltre cleanup all'avvio, al cambio scena e allo smontaggio del renderer, oltre alla rimozione GM delle vecchie label globali. Le barre HP e gli altri attachment globali rimangono fuori da questa migrazione.

## Esito sperimentale

Test live completato il 22 luglio 2026 con un token globale e due client:

- la label locale ha conservato `attachedTo` verso il token globale;
- `OBR.scene.local.getItemAttachments([tokenId])` ha restituito la label;
- lo spostamento del token e quello della posizione della label sono coincisi esattamente;
- la label non è mai comparsa in `OBR.scene.items`;
- il secondo client non ha trovato la label né nel proprio store locale né nello store globale;
- `getItemBounds()` ha mostrato uno scarto visuale non presente in `item.position`, quindi non deve essere usato come metrica primaria per verificare il movimento delle label.

Conclusione: l'attachment tra label locali e token globali è utilizzabile per le label derivate degli effetti.

## Implementazione migrata

- I metadata globali dei token rimangono l'unica fonte di verità.
- Ogni background GM o player calcola lo stesso piano e applica il diff esclusivamente con `OBR.scene.local`.
- Gli aggiornamenti locali non generano widget o eventi nella scena condivisa.
- Il GM elimina una tantum le precedenti label globali riconosciute dai metadata proprietari.
- Un reconcile completo viene richiesto quando una scena torna pronta; il diff rimuove label locali orfane o duplicate.
- Lo smontaggio esplicito del renderer elimina soltanto pill e badge locali degli effetti.
- Barre HP ed etichetta del turno continuano a usare i rispettivi percorsi globali esistenti.
