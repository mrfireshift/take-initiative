# Audit funzionale generale — ottobre 2026

## Identità dell'audit

| Campo | Valore |
| --- | --- |
| Progetto | Take Initiative! 1.3.0 |
| Branch | `main` |
| Commit | `43b1cfc`, più il lavoro Boss Actions non committato nel working tree |
| Data audit | 2026-10-15 |
| Perimetro | Tutto il plugin, per i 15 domini di [Guida utente](../GUIDA_UTENTE.md) e la console Boss Actions |
| Modalità | Analisi del codice, suite automatica, harness browser con SDK simulato; nessuna correzione applicata |
| Checklist collegata | [Smoke test manuale](SMOKE-CHECKLIST-MANUALE.md) |

## 1. Sintesi

Nessun P0 né P1. Lo stato del plugin è buono: suite e build sono verdi, e i
flussi base del GM provati nell'harness si comportano come descritto nella
guida.

| Priorità | Numero | Finding |
| --- | --- | --- |
| P0 | 0 | — |
| P1 | 0 | — |
| P2 | 1 | F-01 registry delle card vicino al limite del budget room |
| P3 | 4 | F-02 fallback dell'attitudine incoerente, F-03 guida senza Boss Actions, F-04 copertura test sottile in alcuni domini, F-05 chunk di build oltre 500 kB |

Restano molti comportamenti che questo ambiente **non può verificare**:
multi-client reale, permessi player reali, rendering degli elementi sulla
mappa, strumenti a trascinamento, persistenza tra scene e ricariche, Embers.
Sono raccolti nella [checklist manuale](SMOKE-CHECKLIST-MANUALE.md), che va
eseguita su Owlbear Rodeo reale prima di considerare chiuso l'audit.

## 2. Metodo

1. **Baseline**: `npm test` e `npm run build` sul working tree.
2. **Mappa dei domini**: i 15 capitoli di `GUIDA_UTENTE.md` più Boss Actions,
   ciascuno collegato ai moduli e ai test che lo coprono.
3. **Invarianti**: metadata canonici (`meta.hp`/`meta.hpMax`, chiavi
   `…/meta` e `…/state`), merge invece di sostituzioni, budget room, voci
   virtuali nell'ordine.
4. **Harness browser** (`test-support/boss-actions-browser`, SDK simulato):
   tracker GM e vista player, card delle capacità di classe, scenari boss.
5. **Classificazione**: P0 perdita o corruzione di dati al tavolo; P1 flusso
   principale rotto; P2 degrado reale in condizioni plausibili; P3 incoerenza
   latente, documentazione o manutenibilità.

## 3. Baseline automatica

| Controllo | Esito |
| --- | --- |
| `npm test` | **3441/3441** superati, 0 falliti, 0 saltati (≈ 28 s) |
| `npm run build` | completato in ≈ 4,6 s; avviso Vite su chunk > 500 kB |

La baseline include il lavoro Boss Actions non committato presente nel
working tree.

## 4. Verifiche nell'harness browser

Scenario `frame.html?scenario=tracker`: Epic Boss Auril, tre PG, due Goblin
raggruppati.

| Verifica | Esito |
| --- | --- |
| Avanzamento turno su 5 passi, con voci virtuali `__EPIC__::auril::after::…` | ✅ ordine e indice corretti |
| Cambio round alla fine dell'ordine (2 → 3) | ✅ |
| Turno precedente su 4 passi, anche attraverso il cambio round (3 → 2) | ✅ |
| Etichetta mappa «Turno di…» sul token attivo | ✅ un solo elemento TEXT, aggiornato |
| Gruppo collassato attivo sulla lead card | ✅ |
| Modifica HP inline (Sera 38 → 31) | ✅ `meta.hp` aggiornato, `hpMax` invariato, `initiativeCard.damageDefenses` conservato (merge, nessuna sostituzione) |
| Vista player (ruolo PLAYER, ricarica del tracker) | ✅ nessuna toolbar GM, nessun comando di turno o HP |
| Card capacità di classe (`class-features-card.html`) | ✅ già verificata batch per batch nella Fase 2 |

Limiti dell'harness: non esegue il controller background delle aure, non
disegna gli elementi sulla mappa (barre, pill, quota), non simula
`viewport.animateToBounds` (Focus token) né `scene.grid.onChange`, e ha un
solo client.

## 5. Finding

### F-01 — P2 — Registry delle card vicino al limite del budget room

**Dove.** `src/roomMetadataBudget.js:16` (`"initiative-cards": 4_450`),
`src/initiativeCardRegistryCore.js` (`retainInitiativeCardRegistryWithinByteBudget`).

**Problema.** Il registry room salva per ogni profilo l'elenco completo
`enabledClassFeatureIds`. Con la Fase 2 il numero di capacità abilitate di
default è cresciuto:

- cinque Maestri di Battaglia di 20° livello occupano ≈ 4346 dei 4450 byte;
- un Monaco di 20° livello pesa da solo ≈ 1000 byte di ID.

Oltre il budget, la compattazione tiene i profili più recenti e **scarta
quelli meno recenti** dal registry room.

**Effetto.** La card sul token della scena corrente resta intatta, e la copia
nel `localStorage` del GM è completa. Si perdono invece:

- il riuso del profilo su un'altra scena;
- il riuso su un altro dispositivo o browser.

Il problema è silenzioso: non compare alcun avviso.

**Riproduzione.**

1. Crea 5–6 card PG di alto livello con molte capacità abilitate.
2. Apri la room da un altro browser.
3. Aggiungi gli stessi token in una nuova scena.
4. Risultato: i profili più vecchi tornano ai default.

**Direzione di correzione** (non applicata):

- salvare nel registry solo la differenza rispetto a `defaultEnabled`;
- in alternativa, mostrare un avviso quando la compattazione scarta un
  profilo.

Tocca la persistenza delle card: va trattata come modifica a sé, con i test
del registry.

### F-02 — P3 — Fallback dell'attitudine incoerente tra superfici

**Dove.** Se `meta.attitude` manca:

| Punto | Fallback | Effetto sulla vista player (default) |
| --- | --- | --- |
| `src/initiativeList.js:4695` (entry del tracker) | `"ally"` | HP esatti nel tracker esteso |
| `src/options/optionsProjection.js:7-9` (`attitudeOf`) | `"neutral"` | — |
| `src/hpbar-items.js:113-118` + `mapHpDisclosure` | `"neutral"` | HP nascosti sulla barra mappa |
| `src/options/optionsSelectors.js:58-67` | `"enemy"` | — |

Lo stesso token può quindi mostrare gli HP al player nel tracker e
nasconderli sulla mappa. Nell'harness, Auril e i Goblin senza attitudine
mostrano «580/580» e «7/7» nella vista player.

**Perché P3.** I flussi reali scrivono sempre l'attitudine:

- il menu contestuale (`src/ctx-add.ts`) la fa scegliere;
- «Aggiungi tutti» usa il registry fazioni o `"enemy"`
  (`src/initiativeList.js:1525`).

Il caso riguarda solo token legacy o metadata importati.

**Direzione.** Allineare il fallback del tracker a quello di proiezione, nel
blocco di `initiativeList.js` che costruisce l'entry. È una modifica nel file
fragile e cambia la visibilità degli HP: va decisa esplicitamente.

### F-03 — P3 — La guida utente non descrive Boss Actions e i pannelli recenti

`GUIDA_UTENTE.md` non menziona la console **Boss Actions** né gli altri
pannelli aggiunti di recente (reminder di concentrazione, aure
personalizzate). Boss Actions è ancora lavoro non committato: la guida può
essere aggiornata insieme al suo commit.

### F-04 — P3 — Copertura test sottile in alcuni domini

Molto coperti:

- capacità di classe;
- incantesimi e zone;
- effetti, Undo e History.

Coperti poco:

- **Clock**: 3 test;
- **quota e distanza 3D**;
- **etichette mappa**: posizionamento e zoom;
- **registry fazioni**.

Sono anche i domini più visivi e interattivi: la checklist manuale li copre
in modo esplicito.

### F-05 — P3 — Chunk di build oltre 500 kB

Vite segnala chunk minificati sopra 500 kB. Non è un errore. Il tempo di
caricamento iniziale delle finestre su connessioni lente va però osservato al
tavolo (checklist, sezione 0).

## 6. Fuori dal perimetro di correzione

| Area | Motivo |
| --- | --- |
| Primitive mancanti delle capacità di classe (`value-input`, `linked-token`, `spell-bridge`, `transformation`, pool da modificatore) | Lavoro di funzionalità, già pianificato in [Workflow classi rimanenti](../class-features/audits/WORKFLOW_CLASSI_RIMANENTI.md) |
| Contratto «un GM autorevole per scena» | Scelta architetturale (`CANONICAL-MUTATION-HARDENING.md`); con due GM attivi il comportamento non è garantito |
| P0 dell'audit di agosto | Affrontati da ARCH-005/006 e dall'hardening delle mutazioni canoniche; non rianalizzati in profondità qui. La checklist include i flussi multi-client che li riguardano |

## 7. Prossimi passi consigliati

1. Eseguire la [checklist manuale](SMOKE-CHECKLIST-MANUALE.md) su Owlbear
   reale, con un client GM e un client player, e annotare gli esiti.
2. Decidere F-01. È l'unico finding che può far perdere dati percepiti
   dall'utente.
3. Decidere F-02 insieme alla politica di visibilità degli HP.
4. Aggiornare la guida (F-03) quando Boss Actions viene committato.
