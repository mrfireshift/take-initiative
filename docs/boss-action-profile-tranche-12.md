# Boss Actions — tranche 12: la sequenza delle Azioni Epiche di Auril (profile/parser v20)

La sequenza introdotta con Shothragoth (S3, v19) si applica ora ad Auril, fase 2. Le spunte manuali «Ricarica e sequenza verificate» e «Requisito e sequenza verificati» di Breath of the Long Night e Meteor Swarm scompaiono, insieme al prerequisito manuale di Rock. Al loro posto c'è il registro del round sul token del boss.

## Regole

| Azione | Sequenza | Prima (v18/v19) |
|---|---|---|
| Breathe Deep | prima Azione Epica del round; registrazione manuale | registrazione manuale senza controlli |
| Gather the Winter Sky | prima Azione Epica del round; fino a fine round solo Titan's Grasp, Crush, Hurl, Hand Slam, Rock, Epic Resistance e, come ultima, Meteor Swarm; registrazione manuale | registrazione manuale senza controlli |
| Breath of the Long Night | ultima Azione Epica del round, dopo Breathe Deep nello stesso round (la ricarica non passa al round successivo) | spunta «Ricarica e sequenza verificate» |
| Meteor Swarm | ultima Azione Epica del round, dopo Gather nello stesso round | spunta «Requisito e sequenza verificati» |
| Rock | solo nel round di Gather, senza uno slot proprio | spunta «Conferma il prerequisito» |

- **«Prima» blocca e «ultima» avvisa**, come per Shothragoth:
  - un'apertura nello stesso round è rifiutata; Breathe Deep e Gather sono entrambe prime, quindi mai nello stesso round;
  - l'ultima Azione Epica si conferma con una spunta solo quando l'ordine di iniziativa dice che devono ancora agire dei personaggi.
- **Durante Gather** le altre Azioni Epiche risultano «Bloccata»: Icekiss, Frostmaiden's Kiss, Mark, Spellcasting, Breathe Deep e Breath. L'elenco viene dal testo dello stat block, non è scritto nel codice.
- **Restano manuali:**
  - l'obbligo di Breathe Deep nel primo round della fase 2 e quello di Gather nel round 2 (promemoria nel testo);
  - il controincantesimo su Meteor Swarm;
  - la fine anticipata di Gather se la fase termina.
- **Ordine dei messaggi:** un'azione con il contatore esaurito dice «Risorsa esaurita» prima di qualunque messaggio di sequenza.

## Profilo v20

- **`sequence.after` senza slot:** un'azione che richiede un'altra Azione Epica nello stesso round senza essere prima o ultima (Rock).
- **`sequence.allowOnly`:** solo su una prima Azione Epica, con l'elenco delle azioni ammesse fino a fine round (Gather). Sono ammesse anche le azioni che la seguono (`after`).
- **Validatore:**
  - `after` deve indicare una prima Azione Epica dello stesso profilo;
  - `allowOnly` deve indicare Azioni Epiche dello stesso profilo, diverse da se stessa;
  - un profilo v19 non può contenere queste forme.
- **Grammatiche ancorate:**
  - Breathe Deep e Gather, nuove: riconosciute ma ancora manuali (`UNSUPPORTED` con sequenza);
  - Breath, Meteor e Rock: la clausola di sequenza diventa dato.
- **Ritorno alla forma v19:** se un nome citato non si trova nel profilo, o il testo è diverso (per esempio «durante il round 1»), l'azione riprende la forma precedente: conferma manuale per Breath e Meteor, prerequisito per Rock. Un nome sconosciuto nell'elenco di Gather lascia la restrizione come testo.
- **Fase 3:** nessuna sequenza, quindi nessun registro del round.

## Verifica (14 ottobre 2026)

- **Test nuovi:** `bossActionTranche12.test.js`: dati v20, varianti che restano nella forma v19, contratto chiuso, registro del round, elenco di Gather, Rock senza conferma.
- **Test aggiornati:** Breath, Meteor e Rock ora partono con Breathe Deep o Gather nel registro (`test-support/bossSequenceState.js`) oppure li registrano dalla console.
  - Il walkthrough fa il giro completo: Breath bloccata, Breathe Deep registrata, Gather «Bloccata», cambio di turno fino all'ultimo slot, Breath senza spunte, Undo che lascia Breathe Deep nel registro.
  - Nel walkthrough di Rock, Spellcasting è bloccato durante Gather e torna disponibile al round successivo.
- **Suite e build:** suite completa 3330/3330, `npm run build` PASS, `git diff --check` PASS.
- **Browser di prova** (fase 2):
  - `breath-final`: Breathe Deep registrata, «Azione Epica 3/3 (ultima)», Breath applicata senza spunte;
  - `meteor-final`: Gather registrata, Meteor applicata; durante Gather sono bloccate esattamente le sei azioni non ammesse;
  - `gather-list`: la lista con le righe «Bloccata»;
  - `rock-blocked`: Rock prima di Gather.

## Nota sul checkout

Con `core.autocrlf=true` (impostazione di Git per Windows) un checkout riscrive i file con CRLF, e alcuni test che leggono il sorgente come testo falliscono. L'indice è in LF ed è corretto: è bastato riportare la copia di lavoro in LF. Per evitarlo in futuro serve un `.gitattributes` con `* text=auto eol=lf`, oppure `core.autocrlf=input` sul repository.
