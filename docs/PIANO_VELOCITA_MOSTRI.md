# Velocità dei mostri

Valutazione e decisioni del 04/11/2026. Il motore della velocità (`src/movementProfileCore.js`) è già generale: riceve
velocità base, condizioni e incantesimi e non sa se il token è un PG. A fermare i nemici è il controllo «solo PG» in
`src/speedCheck.js` (`loadMovementState`, `applyConditionSpeedItem`). Questo piano apre il motore ai non PG e gli dà le
modalità di movimento dello statblock.

## Decisioni

- **D1, chi viene tracciato:** ogni non PG con una velocità sulla scheda, anche scritta a mano. Senza velocità resta spento.
- **D2, cosa vede il tavolo:** un mostro nascosto solo il GM; uno visibile mostra lo stato del movimento a tutti, ma gli
  avvisi vanno solo al GM.
- **D3, Limita movimento:** stesso comportamento dei PG: acceso, riporta indietro anche i non PG.
- **D4, modalità di partenza:** quella dell'ultimo turno; al primo turno la camminata, o la prima disponibile se non cammina.
- **D5, scavo:** quinta modalità «Scavare».
- **D6, cambio modalità nella vista compatta:** aggiunto per il GM, senza toccare la griglia degli strumenti.

## Lotti

1. **Le velocità dall'import.** ✅ Fatto (04/11): il profilo del mostro tiene `speeds` (`fly`, `swim`, `climb`, `burrow`, in
   metri) e `hover`, fra i campi dello statblock: un nuovo blocco li sostituisce e vanno sugli omonimi. La camminata resta
   la `speed` della scheda. Da 5eTools arrivano in `speeds` del blocco, in piedi; nel JSON del plugin vale anche `speed` a
   oggetto, con le chiavi in inglese o in italiano. Una velocità solo in una forma o in un caso («(owl form only)»,
   «(hover, Graystaff magic)») non è una modalità: va in **Al tavolo**, con le camminate con condizione, le forme
   alternative e le velocità a scelta. La tab Statistiche ha il riquadro «Altre velocità», l'import la riga
   corrispondente. Su 1631 mostri di sette bestiari: 739 hanno altre velocità (mediana 17 byte, massimo 60); il resto
   delle schede è identico a prima. Il motore non le usa ancora.
2. **Il motore.** Apertura ai non PG (D1), modalità come effetto passivo nei due punti che calcolano la velocità
   (`conditionSpeedForItem` in `speedCheck.js`, `resolveItemMovementProfile` in `movementProfileItemCore.js`), scavo (D5),
   modalità di partenza (D4). I volanti importati diventano tali anche per le zone che chiedono una modalità
   (`spellStaticZone.js`).
3. **Il tavolo.** Cosa vedono i giocatori (D2), comando della modalità nella vista compatta (D6), niente scrittura sul
   token a inizio turno per i non PG: solo quando si muove.
4. **Verifica.** Test, banco in entrambe le viste, documentazione, prova in stanza.

## Fuori da questo piano

- Le velocità oltre la camminata non si modificano a mano nella scheda: si reimporta lo statblock.
- Un volante prono non cade da solo: resta al tavolo.
- I mostri importati prima di questo lotto hanno solo la camminata finché non si reimportano.
