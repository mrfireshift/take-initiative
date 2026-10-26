# Attacchi dei mostri — fase 5: azioni complesse ad euristica (piano)

Stato: **piano, in attesa delle decisioni dell'utente** (26/10/2026).

Richiesta dell'utente: le azioni complesse degli NPC (tiri salvezza, soffi,
coni, linee, aree) oggi si risolvono solo con «TS superato / fallito»;
devono essere molto più automatizzate e basate sullo statblock, **ad
euristica, non con un workflow per ogni attacco**, perché i manuali da
importare saranno molti di più dei quattro misurati qui.

## Principio

Un solo lettore di regole generiche, una sola console:

- il lettore cerca nel testo dello statblock le formule fisse del Manuale dei
  Mostri 2014 («{@dc 19} Dexterity saving throw», «a 60-foot cone», «each
  creature within 30 feet of the dragon», «half as much damage on a
  successful one», «or be frightened for 1 minute», «can repeat the saving
  throw at the end of each of its turns», «the target is grappled (escape DC
  16)»…) e riempie **campi strutturati** dell'azione;
- il formato del plugin (scritto a mano o da un assistente) porta gli stessi
  campi: la console non sa da dove viene il mostro;
- ciò che il lettore non riconosce resta nella nota, mai indovinato;
- i quattro bestiari (MM, VGM, MTF, IDRotF) sono solo il **banco di misura**:
  uno script di copertura gira su qualunque file di 5eTools, così ogni nuovo
  manuale si misura prima di usarlo;
- i dadi restano fisici: il GM tira i danni, i giocatori i loro tiri
  salvezza (vedi D2 per i bersagli NPC).

## Cosa fa la console oggi (verificato nel codice)

- **Bersagli** solo a mano: tutte le creature con una casella; per un mostro
  il pulsante **Disegna** non c'è (la sagoma esiste solo per il soffio dei
  dragonidi, a misura fissa) e **Proponi** è nascosto.
- **Esiti** solo «TS fallito / superato»; niente «Immune», nessun bonus del
  bersaglio accanto ai pulsanti.
- **Danni**: un totale per componente tirato al tavolo; metà o zero per esito;
  resistenze, immunità e vulnerabilità dei bersagli applicate in automatico.
- **Condizione al fallimento**: aggiunta a ogni fallito, ma senza durata, senza
  promemoria del tiro ripetuto e senza controllo dell'immunità.
- **Ricarica e usi**: spesi con l'azione, una voce di Cronologia, un Undo.

Pezzi già pronti da riusare:

- le sagome istantanee parametriche della console Boss
  (`boss-action-area:cone|circle|emanation|line…`, misure in piedi) e il
  calcolo dei token colpiti dello strumento area (`findHitTargetIds`);
- i promemoria del tiro ripetuto, generici per qualunque condizione con
  `saveReminder` (`effectSaveReminderCore.js`), già usati dalla console Boss;
- l'immunità di 24 ore («immune to this dragon's Frightful Presence for the
  next 24 hours») e l'Evasione, già nella console Boss.

## Misure sul banco (781 mostri, 4 bestiari 2014)

| Caso | Azioni |
| --- | --- |
| Azioni a tiro salvezza | 280 |
| … con un'area | 159 (sfera 65, cono 62, linea 24, cubo 8) |
| … con una condizione al fallimento | 151 |
| … con il tiro ripetuto a fine turno / inizio turno | 83 / 8 |
| … con immunità di 24 ore dopo un successo | 37 |
| Attacchi con un effetto al colpo (TS, condizione, afferrato) | 392 |
| Azioni a ricarica | 120 |
| Azioni ancora da gestire al tavolo | 248 |

Ogni lotto ripete la misura e riporta quante azioni passano da «al tavolo» o
«parziale» ad automatiche.

## Lotti

### Lotto 0 — lettore euristico e misura

- `src/monsterActionHeuristicsCore.js`, puro: dal testo di un'azione ricava
  origine e forma dell'area, chi è colpito («of its choice»), esito al
  successo, condizioni (anche due), durata, tiro ripetuto (caratteristica,
  CD, inizio o fine turno, «ending the effect on itself»), immunità di 24 ore,
  effetti al colpo, afferrato con CD di fuga, prono, spinta.
- Usato dall'adapter di 5eTools; il formato del plugin accetta gli stessi
  campi (documentati in `docs/IMPORT_SCHEDA.md`).
- `scripts/monster-heuristics-coverage.mjs`: copertura per regola su
  qualunque bestiario di 5eTools.

### Lotto 1 — l'area sulla mappa

- **Disegna** anche per le azioni dei mostri, con la misura dello
  statblock: cono e linea dal token del mostro, sfera centrata su un punto,
  cubo (nuova sagoma quadrata).
- «Each creature within N feet of the X» (emanazione dal mostro): i bersagli
  si propongono da soli, senza disegnare (vedi D1).
- Il mostro non è mai tra i bersagli; «of its choice» spunta tutti e il GM
  toglie gli alleati.

### Lotto 2 — esiti più ricchi

- Accanto a ogni bersaglio il suo bonus al tiro salvezza (dalla scheda; per un
  mostro senza competenza, il modificatore della caratteristica).
- Esito **Immune**: automatico se la condizione è tra le immunità del
  bersaglio (D3) o se il bersaglio ha l'immunità di 24 ore a quell'azione.
- Evasione dei bersagli, come nella console Boss.

### Lotto 3 — condizioni con durata e tiro ripetuto

- La condizione al fallimento prende durata («for 1 minute» → 10 round,
  «until the end of its next turn»…) e promemoria del tiro ripetuto con CD e
  caratteristica, a inizio o fine turno; si toglie da sola quando il
  promemoria la chiude, come per gli incantesimi.
- «Immune for 24 hours» dopo un successo: la pillola dell'immunità della
  console Boss.
- I casi che il lettore non sa chiudere («ends if the creature takes damage»)
  restano nella nota della condizione.

### Lotto 4 — effetti al colpo (assorbe la fase 1b)

- Dopo un colpo: il tiro salvezza secondario («must succeed on a DC 11
  Constitution saving throw or be poisoned») con esito, danni extra (metà se
  superato) e condizione con durata e tiro ripetuto, come nel lotto 3.
- «Grappled (escape DC 16)»: afferrato applicato al colpo, con la presa del
  plugin (`pcGrappleHolds`); prono e spinta come condizione o nota.

### Lotto 5 — documentazione e misura finale

- `docs/IMPORT_SCHEDA.md`, `docs/GUIDA_UTENTE.md`, `BACKLOG.md`; tabella di
  copertura prima/dopo.

## Prestazioni

Priorità dell'utente: la reattività dei token.

- Il lettore gira **una volta, all'import**: nella console non si analizza
  testo.
- La geometria si calcola solo quando il GM disegna (strumento esistente); le
  emanazioni usano le posizioni già lette dalla console.
- Nessuna scrittura nuova per turno: durata e tiro ripetuto vivono nell'istanza
  della condizione, letta dai promemoria già esistenti.
- I campi nuovi stanno sulla scheda del mostro (pochi byte per azione); il
  testo dello statblock resta nel browser del GM.

## Decisioni da confermare

1. **D1 — area.** Coni, linee e sfere su un punto si disegnano; le emanazioni
   dal mostro propongono i bersagli da sole (raccomandato), oppure si disegna
   sempre.
2. **D2 — tiri salvezza dei bersagli NPC.** Il plugin mostra il bonus e il GM
   tira e segna l'esito, come per i giocatori (raccomandato: dadi fisici),
   oppure il plugin tira per gli NPC bersaglio.
3. **D3 — immunità alle condizioni dei mostri.** Salvate in forma
   strutturata sulla scheda del mostro per l'esito «Immune» automatico
   (raccomandato), oppure solo segnalate.
4. **D4 — fase 1b.** Dentro questa fase come lotto 4 (raccomandato), oppure
   separata.
5. **D5 — ricarica.** Nessun promemoria a inizio turno (sarebbe contabilità
   del turno per il GM): la console mostra solo «usata, tira d6» accanto
   all'azione (raccomandato), oppure un promemoria al turno del mostro.
6. **D6 — mostri già importati.** Prendono le regole nuove reimportandoli
   (raccomandato: l'import è già lo strumento), oppure con una migrazione
   automatica dal testo salvato.
