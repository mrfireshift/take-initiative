# P2 — Token collegato (audit, 15 ottobre 2026)

Commit di partenza: `a573f67`. Primitiva P2 della Fase 3 di
[Workflow classi rimanenti](WORKFLOW_CLASSI_RIMANENTI.md). Solo indagine:
nessun codice modificato. Vincolo: l'ordine di iniziativa non si tocca.

## Conclusione

**Oggi P2 non richiede codice.** Il classificatore ha assegnato a 9 capacità
l'archetipo `companion-summon`. Riletta la fonte:

- **4** si automatizzano con i soli dati, usando meccaniche che esistono già:
  pill su un token esistente e durata legata a una capacità madre;
- **3** sono reazioni o azioni istantanee del compagno: restano carte
  descrittive;
- **2** dipendono da altre primitive, non da P2.

La proposta è un **batch di soli dati** («P2-dati»). Una primitiva in codice
si scrive solo quando una capacità concreta la richiede. Il primo caso
probabile è Spirito Guardiano: vedi più sotto.

## Cosa esiste già

**Collegamento.** Compagno Animale (Ranger Revised) e Compagno del Ranger
(Signore delle Bestie) sono pill `condition` con targeting `single-target` e
durata assente.

- L'istanza attiva vive nello stato della capacità del proprietario e
  conserva `targetIds`: è già il legame tra proprietario e compagno.
- La pill sul token del compagno ha come `sourceId` il proprietario.
- Non serve un campo metadata nuovo.

**Dipendenze tra capacità.**

- `requiresActiveFeatureId` blocca l'attivazione se la capacità madre non è
  attiva (`classFeatureCore.js:93`).
- `duration.untilFeatureId` lega la durata alla capacità madre
  (`classFeatureCore.js:610`). Sono già usati da Sintonia Totemica: Lupo e da
  Diffusione di Spore.

**Token fuori dall'iniziativa** (famigli, tentacoli, zombi):

| Funzione | Funziona? | Dove |
|---|---|---|
| Scelta del bersaglio di una capacità | ✅ qualsiasi token CHARACTER non agganciato | `classFeatureRuntime.js:205` |
| Pill sulla mappa | ✅ basta avere i metadata del plugin | `effectsLayout.js:144` |
| Scadenza delle pill | ✅ ancorata al turno della sorgente | — |
| Popup TS del bersaglio | ❌ il token non ha un turno | `effectSaveReminderCore.js` |
| Membro di un'aura di classe (es. Aura di Protezione) | ❌ il controller considera solo i token in iniziativa | `classFeatureAuraController.js:85` |
| Console HP rapida | ❌ elenca solo i token in iniziativa | `quick-hp-modal.js:592` |
| Azioni rapide | ❌ rifiutano bersagli fuori dall'iniziativa | `quickActionExecution.js:72` |

Per i compagni che contano in combattimento il GM li aggiunge
all'iniziativa, come oggi. Il plugin non cambia l'ordine.

**Filtro delle aure.** Il filtro `friendly` / `hostile` / `all` è in
`spellAreaMembershipCore.js`, condiviso con incantesimi e aure
personalizzate. Un eventuale filtro «solo compagni» andrebbe calcolato nel
controller delle aure di classe (insieme di ID ammessi), senza toccare il
modulo condiviso.

## Le 9 capacità

| Capacità | Esito | Come |
|---|---|---|
| Patto della Catena (Warlock 3) | **dati** | pill «Famiglio del Patto» `single-target` sul token del famiglio, senza durata, come Compagno del Ranger; l'attacco con la reazione del famiglio resta nel testo |
| Infestazione Fungina (Spore 6) | **dati + pool** | pill «Zombi fungino», `single-target` entro 3 m, 600 round (1 ora). Manca il pool: va aggiunto alla fonte con `max(1, modificatore_saggezza)`, che P1 già risolve |
| Legame Migliorato (Fiamma 6) | **dati** | pill su sé con `duration.untilFeatureId` = Evocare Spirito della Fiamma; ricorda il +1d8 a fuoco e cure e l'origine degli incantesimi dallo spirito |
| Spirale Guardiana (Insondabile 6) | **dati** (resta carta) | reazione istantanea, 1d8 (2d8 dal 10°) di danni ridotti entro 3 m dal tentacolo: promemoria descrittivo, nessun pool |
| Attacco Coordinato, Tempesta di Artigli e Zanne, Difesa Superiore della Bestia (Ranger Revised 5/11/15) | **carte** | reazioni o azioni del compagno senza risorsa né stato: non c'è nulla da applicare |
| Spirito Guardiano (Pastore 10) | **bloccata** | cura a fine turno le bestie e i folletti evocati con *incantesimi* dentro l'aura del Totem. Servono un'aura che riconosca i token evocati (ponte incantesimi) e una cura a fine turno su token spesso fuori dall'iniziativa |
| Servitori Non Morti (Necromanzia 6) | **bloccata** | bonus a PF e danni dei non morti di Animare Morti: `spell-bridge` e `value-input` |

## Proposta: batch «P2-dati»

1. Override per Patto della Catena, Infestazione Fungina e Legame Migliorato.
   Si modificano solo i file dati, con merge.
2. Pool di Infestazione Fungina nella fonte del Druido, con il massimo già
   risolto da P1.
3. Correzioni in `BACKLOG_ARCHETYPE_OVERRIDES`:
   - Spirale Guardiana e le 3 capacità Ranger Revised → `reference`;
   - Spirito Guardiano → primitiva `spell-bridge`;
   - Servitori Non Morti → `spell-bridge`.
4. Test sul modello dei batch e verifica nell'harness con un token famiglio
   fuori dall'iniziativa.
5. Checklist manuale: pill del famiglio sulla mappa e limiti dei token fuori
   dall'iniziativa.

Nessun intervento su `initiativeList.js`, sull'ordine di iniziativa o sui
metadata.

## Rischi

- **Un solo compagno.** Le pill di legame non impediscono un secondo
  famiglio o un secondo zombi. Va gestito nel testo, come Compagno del
  Ranger. Un vincolo automatico sarebbe codice: rimandato.
- **Aspettative del GM sui token fuori dall'iniziativa.** Aure di classe,
  console HP, azioni rapide e popup TS non li vedono. È un limite
  preesistente; il batch lo documenta, non lo cambia.
- **Fonte dei dati.** Il pool di Infestazione Fungina è un dato nuovo nella
  fonte meccanica: va rigenerato il catalogo e controllato l'audit.

## Esito del batch «P2-dati»

Applicato come proposto, senza codice runtime e senza toccare l'ordine di
iniziativa.

| File | Modifica |
|---|---|
| `tasha_livello_meccanico_v1_0.json` | pool `druido-circolo-delle-spore-infestazione-fungina-usi`, `max(1, modificatore_saggezza)`, riposo lungo; costo nel record di Infestazione Fungina |
| `runtime-feature-overrides.json` | Patto della Catena (resta opzione del Dono del Patto, non attiva di default), Infestazione Fungina, Legame Migliorato; Spirale Guardiana diventa promemoria descrittivo |
| `scripts/audit-class-features.mjs` | archetipi corretti per le 6 capacità rimaste, nuovo test diretto registrato |
| `test/linkedTokenFeatureRuntime.test.js` (nuovo) | legame sul famiglio, pool e durata dello zombi, dipendenza dallo Spirito della Fiamma, esclusioni |

Risultati:

- **catalogo**: implementate da 264 a 267, pool da 104 a 105;
- **backlog**: `linked-token` da 9 a 0; `spell-bridge` da 7 a 9, con Spirito
  Guardiano e Servitori Non Morti;
- **test**: 3479 su 3479; build verde;
- **browser** (harness della card): abilitato Patto della Catena dalla
  scheda, selezionato un famiglio **fuori dall'iniziativa** e attivata la
  capacità. La pill «Famiglio del Patto» è sul famiglio con sorgente il
  warlock, e l'istanza attiva del warlock punta al famiglio.

Da verificare al tavolo: voci 16.8–16.11 della
[checklist manuale](../../audits/SMOKE-CHECKLIST-MANUALE.md).
