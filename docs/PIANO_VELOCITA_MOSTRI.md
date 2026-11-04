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
2. **Il motore.** ✅ Fatto (04/11): il controllo «solo PG» è tolto dai due punti di `speedCheck.js` e un non PG senza
   velocità resta spento per il controllo che c'era già (D1). Le modalità dello statblock sono un effetto passivo
   (`monsterSpeedsMovementInstance`) nei due punti che calcolano la velocità (`conditionSpeedForItem`,
   `resolveItemMovementProfile`), quindi condizioni e incantesimi valgono anche per loro senza toccare i calcoli del
   motore. Chi non cammina non ha la modalità «Camminare» e parte dalla prima che ha. «Scavare» è la quinta modalità (D5).
   Un non PG riparte dalla modalità dell'ultimo turno, un PG sempre a piedi (D4). Limita movimento non ha chiesto codice:
   il ritorno indietro non guardava già l'attitudine (D3). I volanti importati lo sono anche per le zone che chiedono una
   modalità (Controllare i venti). Una velocità tolta dalla scheda a metà turno spegne subito il controllo, anche per i
   PG: prima il token non si muoveva più fino al turno dopo. Ogni turno extra di un Paragon ha il suo movimento.
3. **Il tavolo.** ✅ Fatto (04/11). D2: del token nascosto, anche di un PG, agli altri client arriva solo il turno e che non
   c'è nulla da mostrare (`speedSnapshotForPlayers`); se il GM lo nasconde o lo mostra durante il turno, il tavolo segue. Un
   non PG visibile mostra a tutti il movimento e la modalità in uso, non le altre del suo statblock. Gli avvisi di un non PG
   o di un token nascosto vanno solo al GM (`LOCAL`), quelli di un PG a tutti come prima. D6: la linguetta compatta ha, per
   il GM e con più di una modalità, un selettore nativo: stessi 154 px, una parola breve e i soli metri, con le caselle nel
   title; la griglia degli strumenti non è toccata. Un non PG scrive sul token solo quando si muove o il GM cambia modalità,
   non a inizio turno. Resta la scrittura di chi è sotto Libertà di movimento: «spendi movimento» del suo promemoria
   (`reminderResolutionCore.js`) lavora su quella, e così Annulla resta com'era.
4. **Verifica.** Test, banco in entrambe le viste, documentazione, prova in stanza.

## Fuori da questo piano

- Le velocità oltre la camminata non si modificano a mano nella scheda: si reimporta lo statblock.
- Un volante prono non cade da solo: resta al tavolo.
- I mostri importati prima di questo lotto hanno solo la camminata finché non si reimportano.
- Un mostro bloccato (afferrato, paralizzato) non si trascina nel suo turno anche con Limita movimento spento, come un PG:
  per spostarlo a mano si spegne Movimento tracciato.
- Lo scavo conta solo in orizzontale, come il nuoto: solo volo e scalata pagano i cambi di elevazione.
- Le zone leggono le modalità dalla scheda sul token: un omonimo che le ha solo nel registro della stanza non vola per loro.
