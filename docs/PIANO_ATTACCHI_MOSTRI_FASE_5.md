# Attacchi dei mostri — fase 5: azioni complesse ad euristica (piano)

Stato: **chiusa il 27/10/2026**: lotti 0–5 implementati; D1–D7 confermate come raccomandate (D7: con il tiro ripetuto niente conteggio dei round).

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

### Lotto 0 — lettore euristico e misura ✅

Fatto (27/10): `src/monsterActionHeuristicsCore.js` lavora sul testo in chiaro (i tag di 5eTools resi come li stampa il
libro), quindi vale anche per testi incollati. L'adapter di 5eTools aggiunge ai blocchi `onFail.also`,
`onFail.duration`, `onFail.repeat`, `onFail.endsOnDamage`, `area.origin`, `area.choice`, `immuneHours` e `onHit`;
l'import della scheda **non li salva ancora** (li leggeranno i lotti 1–4): in gioco cambia solo che il lettore
riconosce più condizioni al fallimento, che la console già applica. Una condizione citata solo come requisito («can't
be charmed», «while it is invisible», «if the target is prone») non è un effetto.

Misura con `scripts/monster-heuristics-coverage.mjs` su MM, VGM, MTF e IDRotF (815 mostri, 1559 azioni):

| Regola | Riconosciute |
| --- | --- |
| Azioni a TS con condizione | 165 (prima 151) |
| … con durata / con tiro ripetuto / più condizioni | 125 / 85 / 8 |
| Immunità dopo il successo | 46 |
| Aree con origine (dal mostro / su un punto) | 158 / 5, su 163 |
| «Of its choice» | 26 |
| Attacchi con effetto al colpo letto (TS / afferrato / prono / spinta) | 166 (113 / 58 / 5 / 1) |
| Attacchi con effetto al colpo non letto | 47 (malattie, trascinamenti, PF massimi: restano al tavolo) |
| Tiri ripetuti non letti | 11 (condizionati, «at the end of its next turn»: restano nella nota) |
| Azioni da gestire al tavolo | 243 (prima 248) |

Byte netti dei campi nuovi sulla scheda, se salvati togliendo dalla nota le frasi che sostituiscono: 0% alla mediana,
0,9% al p90, 9,6% al massimo (scheda: mediana 955 B, p90 2,2 KB): sotto la soglia del +10%.


- `src/monsterActionHeuristicsCore.js`, puro: dal testo di un'azione ricava
  origine e forma dell'area, chi è colpito («of its choice»), esito al
  successo, condizioni (anche due), durata, tiro ripetuto (caratteristica,
  CD, inizio o fine turno, «ending the effect on itself»), immunità di 24 ore,
  effetti al colpo, afferrato con CD di fuga, prono, spinta.
- Usato dall'adapter di 5eTools; il formato del plugin accetta gli stessi
  campi (documentati in `docs/IMPORT_SCHEDA.md`).
- `scripts/monster-heuristics-coverage.mjs`: copertura per regola su
  qualunque bestiario di 5eTools.

### Lotto 1 — l'area sulla mappa ✅

Fatto (27/10): l'azione salvata sulla scheda tiene `area.origin` («self» o «point») e `area.choice` (anche nel formato
del plugin: `"origin": "self"`, `"choice": true`). Nuove sagome `pc-monster-area:…` in `src/spellAreaRules.js`, alla
misura dello statblock e con il colore del primo tipo di danno: cono, linea (lunghezza × larghezza) e cubo (un quadrato
che parte dal token) dal mostro; sfera su un punto libero; sfera attorno al mostro centrata sul token. Nella console
**Disegna** compare per ogni area di un mostro; la sfera «within N feet of» il mostro propone da sola le creature entro
il raggio (la stessa distanza da bordo a bordo dei trucchetti ad area), con **Proponi** per rifarlo; il GM toglie quelle
che il mostro non sceglie (D1). L'area resta «manuale» nel motore: esecuzione, Cronologia e Combat Log non cambiano.
Nel banco: Ancient Black Dragon → Frightful Presence propone le creature entro 36 m (mai il drago), Acid Breath offre
**Disegna** con la linea di 27 × 3 m. Il disegno sulla mappa vera (lo strumento area gira nella pagina di sfondo di
Owlbear Rodeo, non nel banco) è da provare in room; il percorso è quello del soffio dei dragonidi.

- **Disegna** anche per le azioni dei mostri, con la misura dello
  statblock: cono e linea dal token del mostro, sfera centrata su un punto,
  cubo (nuova sagoma quadrata).
- «Each creature within N feet of the X» (emanazione dal mostro): i bersagli
  si propongono da soli, senza disegnare (vedi D1).
- Il mostro non è mai tra i bersagli; «of its choice» spunta tutti e il GM
  toglie gli alleati.

### Lotto 2 — esiti più ricchi ✅

Fatto (27/10): il profilo del mostro sulla scheda tiene `conditionImmunities` (i nomi delle condizioni del plugin,
«spaventato») ed `evasion` (D3), dall'adapter di 5eTools e dal formato del plugin (`"conditionImmunities":
["frightened"]`, `"evasion": true`); un nuovo statblock li sostituisce, mai li somma. Nella console, per le azioni a
TS dei mostri: terzo esito **Immune** (nessun danno, nessuna condizione; se tutte le creature sono immuni non serve
tirare i danni); una creatura immune all'unico effetto dell'azione (niente danni, condizione tra le sue immunità) parte
su Immune, che il GM può cambiare, e «Tutti falliti / superati» non la tocca; chi fallisce ma è immune alla condizione
prende i danni senza la condizione; accanto al nome il bonus al TS (quello della scheda, o il modificatore di un mostro
senza competenza; nulla per un PG senza TS sulla scheda), «Elusione» (ladro di 7° livello o tratto Evasion, su TS di
Destrezza che dimezza: niente se superato, metà se fallito) e «immune a …». Il Combat Log registra `evasion` e
`conditionImmune` per bersaglio. Nel banco: Frightful Presence dell'Ancient Black Dragon con un goblin immune a
spaventato (parte su Immune, «TS -1»), un PG con TS Saggezza +5; Acid Breath con una ladra di 7° («TS +8 · Elusione»).

- Accanto a ogni bersaglio il suo bonus al tiro salvezza (dalla scheda; per un
  mostro senza competenza, il modificatore della caratteristica).
- Esito **Immune**: automatico se la condizione è tra le immunità del
  bersaglio (D3) o se il bersaglio ha l'immunità di 24 ore a quell'azione.
- Evasione dei bersagli, come nella console Boss.

### Lotto 3 — condizioni con durata e tiro ripetuto ✅

Fatto (27/10): sull'azione salvata `onFail` tiene `also` (fino a 2 condizioni in più), `rounds`, `until`/`anchor`
(«until the end of its next turn», del bersaglio o del mostro) e `repeat` (solo un tiro ripetuto che chiude
l'effetto); l'azione tiene `immuneHours`. Le frasi del tiro ripetuto e dell'immunità escono dalla nota (la Presenza
terrificante non ha più nota). All'esecuzione, come la console Boss: con il tiro ripetuto la condizione è manuale e
porta il promemoria (caratteristica e CD dell'azione, fine o inizio turno della creatura) che, superato, la toglie e
applica l'immunità (D7: nessun conteggio dei round); senza, scade dopo i suoi round o alla fine/inizio del prossimo turno
giusto. Ogni condizione si salta per chi ne è immune. Chi supera un'azione con immunità prende la pillola «Immune ·
azione» (buff, legata a quel mostro e a quell'azione) e la volta dopo parte su Immune; la nota dell'area dice «chi
fallisce è spaventato fino a 1 minuto, TS a fine turno, chi supera è immune per 24 ore». Nel banco: Frightful Presence
dell'Ancient Black Dragon, Dars fallisce (Spaventato, promemoria TS Saggezza CD 19 a fine turno, nessuna durata a
round), Mira supera (pillola d'immunità) e alla riapertura parte su Immune. Il promemoria al cambio turno usa il sistema
già in uso per la console Boss: da guardare in room.

- La condizione al fallimento prende durata («for 1 minute» → 10 round,
  «until the end of its next turn»…) e promemoria del tiro ripetuto con CD e
  caratteristica, a inizio o fine turno; si toglie da sola quando il
  promemoria la chiude, come per gli incantesimi.
- «Immune for 24 hours» dopo un successo: la pillola dell'immunità della
  console Boss.
- I casi che il lettore non sa chiudere («ends if the creature takes damage»)
  restano nella nota della condizione.

### Lotto 4 — effetti al colpo (assorbe la fase 1b) ✅

Fatto (27/10): un attacco con arma di un mostro tiene `onHit` sulla scheda: `save` (caratteristica, CD, `half`, fino a
due danni, `onFail` come una condizione del lotto 3), `grapple` (`escapeDC`, `restrained`), `prone`, `pushFeet`; anche
nel formato del plugin. Le frasi riconosciute escono dalla nota, tranne un TS solo per alcuni bersagli («other than an
elf or undead»), che resta da leggere. Nella console, sotto i danni dell'arma, il riquadro **Al colpo** (solo su colpito
o critico): il TS del bersaglio con il suo bonus, «TS fallito / superato», il danno del TS (metà o niente se superato,
con le difese del bersaglio, nello stesso comando e nella stessa Cronologia dell'attacco), le condizioni con durata e
promemoria, «Afferrato (fuga CD N)» con Trattenuto finché dura la presa (sorgente il mostro, mai due prese dello stesso
mostro), Prono, la spinta da fare a mano (nel Combat Log come resto manuale). Nel MM, VGM, MTF e IDRotF gli attacchi
con effetto letto passano da «parziali» a registrabili (Ghoul: 2 su 2). Nel banco: morso del Giant Spider su Dars
(TS +4), fallito, 7 + 9 veleno = 16, PF 60 → 44.

- Dopo un colpo: il tiro salvezza secondario («must succeed on a DC 11
  Constitution saving throw or be poisoned») con esito, danni extra (metà se
  superato) e condizione con durata e tiro ripetuto, come nel lotto 3.
- «Grappled (escape DC 16)»: afferrato applicato al colpo, con la presa del
  plugin (`pcGrappleHolds`); prono e spinta come condizione o nota.

### Lotto 5 — documentazione e misura finale ✅

Fatto (27/10): `docs/IMPORT_SCHEDA.md` (chiavi nuove del formato del plugin, sezione «Nella console: aree, esiti,
condizioni ed effetti al colpo», prompt per l'assistente), `docs/GUIDA_UTENTE.md`, `BACKLOG.md`, `docs/INDICE.md`. Lo
script di copertura ora misura la quota dei campi della fase 5 dentro la scheda (sono salvati dal lotto 4) invece di
proiettarla.

Misura finale con `scripts/monster-heuristics-coverage.mjs`:

| | MM + VGM + MTF + IDRotF | MM + MPMM (libro mai usato per scrivere le regole) |
| --- | --- | --- |
| Mostri / azioni | 815 / 1559 | 711 / 1411 |
| Azioni a TS / con condizione | 285 / 165 | 291 / 170 |
| … con durata / tiro ripetuto | 125 / 85 | 122 / 81 |
| Immunità dopo il successo | 46 | 43 |
| Aree con origine, su tutte | 163 / 163 | 158 / 159 |
| Attacchi con effetto al colpo letto / non letto | 166 / 47 | 155 / 40 |
| Azioni da gestire al tavolo | 243 (248 prima del lotto 0) | 308 |
| Scheda di un mostro, byte (mediana / p90 / max) | 977 / 2191 / 4543 | 1004 / 2263 / 4340 |
| Campi della fase 5 nella scheda (p50 / p90 / max) | 0% / 7,1% / 22,2% | 0% / 7,7% / 18,7% |

Rispetto al lotto 0 (stessi quattro libri, prima che i campi fossero salvati) la scheda di un mostro passa da 955 a
977 byte alla mediana (+2,3%), da 2240 a 2191 al p90 (−2,2%: le frasi diventate campi sono uscite dalle note) e da
4425 a 4543 al massimo (+2,7%): sotto la soglia del +10% della valutazione.

Da provare in room (il banco non lo copre): il disegno delle aree sulla mappa, il promemoria del tiro ripetuto al
cambio turno, la carta boss Leggendario sullo schermo dei giocatori.

- `docs/IMPORT_SCHEDA.md`, `docs/GUIDA_UTENTE.md`, `BACKLOG.md`; tabella di
  copertura prima/dopo.

## Peso stimato in gioco (valutazione del 26/10, prima del lotto 0)

Riferimento: la misura in room del 24/10. Ogni cambio di un token consegna gli
item interi a ogni finestra del plugin (eventi da ~114 KB, 71 MB di snapshot in
10 minuti), e i metadata pesanti rallentano ogni chiamata dell'SDK; il cambio
turno è il comando più lento (1,3–2,3 s).

| Voce | Oggi (misurato) | Con la fase 5 (stima) |
| --- | --- | --- |
| Import di un mostro | 0,21 ms (815 mostri) | qualche decimo di ms in più, una volta |
| Scheda di un mostro sul token | mediana 0,95 KB, p90 2,2 KB, drago adulto 1,9 KB | +0–60 B la mediana; drago +150–300 B lordi, quasi zero netti: le frasi che diventano campi escono dalla nota (fino a 280 B per azione) |
| Scontro tipo (drago + 6 coboldi) | ~6 KB di schede su ~114 KB di item per evento | +<1 KB (<1%) |
| Console | — | nessuna analisi di testo; la geometria solo quando il GM disegna; i bonus dei bersagli dalle schede già lette |
| Cambio turno | — | nessuna scrittura nuova; i promemoria del tiro ripetuto riusano il calcolo che già gira |
| Cambio round | — | una condizione con durata a round entra nell'operazione unica che già fa scalare gli effetti a tempo (una per round, non per turno) |

L'unico punto con un costo che cresce in gioco è la durata a round delle
condizioni (lotto 3): vedi D7. Lo script di copertura del lotto 0 misura anche
i byte netti per mostro; regola di accettazione: p90 della scheda non oltre
+10%.

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
7. **D7 — durata delle condizioni.** Con il tiro ripetuto la condizione si
   chiude con il promemoria e non conta i round (la durata massima resta nella
   nota): nessuna scrittura per round (raccomandato); i round si contano solo
   per le condizioni a tempo senza tiro ripetuto. Oppure si contano sempre.
