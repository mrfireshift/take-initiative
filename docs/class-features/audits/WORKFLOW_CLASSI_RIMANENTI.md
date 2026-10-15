# Audit — workflow per completare classi e sottoclassi

Data audit: 14 ottobre 2026
Commit osservato: `42b1758` (worktree con modifiche non committate del batch Boss Actions)
Perimetro: catalogo runtime `src/class-features-runtime.json` v4, overlay
`data/class-features/runtime-feature-overrides.json`, runtime `src/classFeature*.js`.

Questo documento non modifica regole né codice: descrive lo stato reale e
propone il processo con cui portare le classi rimanenti allo stesso livello di
Barbaro, Paladino e Stregone.

## 1. Stato reale

### 1.1 Numeri

| Misura | Valore |
|---|---:|
| Record catalogo (PHB, Xanathar, Tasha, UA Ranger Revised) | 860 |
| Esposti nel runtime | 551 |
| Esclusi dal generatore (`riferimento` / `passiva` senza `include`) | 309 |
| `implemented` | 59 |
| `not-automated` | 492 |
| Override curati in `runtime-feature-overrides.json` | 203 |
| Pool di risorse | 104 (98 usati da almeno un costo) |

### 1.2 Come sono stati ottenuti i 59 `implemented`

| Tipo di adapter | Feature | Natura del lavoro |
|---|---:|---|
| `condition` + `aura` + adapter `null` con `effectPlan` | 35 | **solo dati** (override + rigenerazione) |
| `resource-only` | 11 | **solo dati** |
| adapter dedicati (`lay-on-hands`, `turn-undead`, `spell-thief`, `wild-magic-*`, `sorcery-source`, …) | 13 | codice in `classFeatureRuntime.js` + UI modale |

**Il 78% delle capacità implementate non ha richiesto codice nuovo.** Il motore
generico (pill/condizione, aura dinamica, `choiceOptions`, `temporaryHp`,
`radiusByClassLevel`, `requiresActiveFeatureId`, `autoActivateFeatureIds`,
`triggerPolicy`, reference-only) è già il prodotto principale delle tranche
precedenti. Le nuove classi devono sfruttarlo, non replicare il percorso degli
adapter dedicati.

### 1.3 Copertura per classe

| Classe | Feature runtime | Implementate | Sottoclassi curate | Note |
|---|---:|---:|---|---|
| Barbaro | 64 | 20 | 7/7 | completo |
| Paladino | 50 | 12 | Devozione, Vendetta | 5 giuramenti da fare |
| Stregone | 46 | 13 | Magia Selvaggia | 6 origini da fare |
| Bardo | 40 | 5 | Eloquenza, Sapienza | 5 collegi da fare |
| Chierico | 44 | 3 | Crepuscolo | 11 domini da fare |
| Ladro | 41 | 4 | Mistificatore Arcano | 8 archetipi (Assassino: 0 record esposti) |
| Ranger Revised | 45 | 2 | tutti | dataset UA, bassa priorità |
| Mago | 36 | 0 | Invocazione (solo reference) | |
| Druido | 27 | 0 | — | Forma Selvatica era "marker ad alta confidenza" ad agosto, mai implementata; Circolo della Terra: 0 record esposti |
| Guerriero | 49 | 0 | — | Campione: 0 record esposti |
| Monaco | 40 | 0 | — | base con 7 voci a costo Ki |
| Ranger (PHB) | 31 | 0 | — | **classe base con 0 record esposti** |
| Warlock | 38 | 0 | — | L'Immondo: 0 record esposti |

Sottoclassi toccate da una tranche: 18 su 100. Restano **82 sottoclassi** e
**5 classi base** mai curate.

### 1.4 Anomalie trovate

1. **Buchi di esposizione.** Ranger PHB base, Circolo della Terra, Campione,
   Assassino e L'Immondo non hanno nessuna carta, perché le loro capacità sono
   tutte `passiva`/`riferimento` e il generatore le scarta senza
   `include: true`. Un giocatore con quelle build vede una tab Capacità vuota o
   parziale.
2. **Pool non calcolabili.** 9 pool dipendono da un modificatore di
   caratteristica (`max(1, modificatore_carisma)`, `1 + modificatore_carisma`,
   `2 * livello_mago + modificatore_intelligenza`, …).
   `resolveClassFeatureResourceMaximum()` risolve solo valori fissi,
   tabelle per livello e `bonus_competenza`: il massimo resta `null`. Il
   `characterBuild` non contiene caratteristiche.
3. **Adapter senza consumer di catalogo.** Il ramo `night-eyes` in
   `activateClassFeature()` (e in `initiative-card-modal.js`) non è usato da
   nessun record: Occhi della Notte è stato declassato a reference con
   `excludeResourcePoolIds`. Non è un bug, ma è codice da non replicare.
4. **Audit di agosto superato.** `docs/AUDIT_CAPACITA_CLASSE.md` classifica per
   "marker sì/no" e non dice *quale primitiva* serve: non basta più per
   pianificare.
5. **Costo documentale delle tranche.** Ogni `*_IMPLEMENTAZIONE.md` misura
   320–500 righe per una sola sottoclasse. Moltiplicato per 82 sottoclassi
   il processo attuale non scala.

## 2. Classificazione delle 492 capacità `not-automated`

Prima stima a mano, superata dalla Fase 0 (§3): i conteggi aggiornati sono
nella sezione "Backlog per primitiva" di `docs/AUDIT_CAPACITA_CLASSE.md`.
Le singole assegnazioni vanno confermate in ogni batch.

| Archetipo | ~Feature | Primitiva | Lavoro |
|---|---:|---|---|
| Z. Descrittiva / passiva / reazione da ricordare | ~265 | carta `reference-only` | dati |
| A. Buff temporizzato su sé o bersaglio | ~35 | `condition` + `duration` | dati |
| C. Condizione dopo TS (esito scelto dal GM) | ~25 | `choiceOptions` fallito/superato (modello Abiurare Nemico) | dati |
| D. Aura | ~13 | `aura` + `radiusByClassLevel` | dati |
| E. PF temporanei / cura | ~17 | `temporaryHp` (fisso) o `VALUE_INPUT` (modello Imposizione delle Mani) | dati / piccolo codice |
| F. Solo consumo risorsa | ~14 | `resource-only` | dati |
| H. Compagno, evocazione, trasformazione | ~40–65 | **mancante** (vedi §4) | codice |
| J. Ponte verso il sistema Incantesimi | ~30 | **da verificare** (lancio senza slot, slot recuperati) | codice |
| I. Movimento / teletrasporto | ~25 | reminder; eventuale riuso `spellTeleportCore` | dati, poi codice |

Conclusione: **circa 370 capacità su 492 sono raggiungibili solo con dati**
(reference-only o adapter generici già esistenti). Il codice nuovo serve per
circa 100 capacità concentrate in tre famiglie.

## 3. Workflow raccomandato

Il processo attuale è *verticale* (una sottoclasse per volta, audit lungo,
spesso un adapter nuovo). Per il resto del catalogo conviene un processo
**a doppio binario**:

- **binario dati**, per classe intera, senza codice runtime;
- **binario primitive**, una primitiva condivisa alla volta, con un pilota.

### Fase 0 — Strumento di backlog (completata il 14 ottobre 2026)

`scripts/audit-class-features.mjs` assegna ora a ognuno degli 860 record:

- `archetype` e `archetypeLabel` (12 archetipi, da `BACKLOG_ARCHETYPES`);
- `requiredPrimitive` (da `BACKLOG_PRIMITIVES`, con flag `available`);
- `dataOnlyCandidate`: vero se la capacità non è implementata e la primitiva
  esiste già, cioè basta un override;
- `archetypeEvidence`: i segnali che hanno deciso la classificazione, più
  `richiede-include` per i record non esposti e
  `pool-modificatore:<id>` per i pool che dipendono da una caratteristica.

Il report espone `summary.byArchetype` e la sezione `backlog` (per primitiva,
per archetipo e per classe); `docs/AUDIT_CAPACITA_CLASSE.md` mostra le stesse
tabelle. Esito sulle 801 capacità non implementate (incluse le non esposte):
588 carte descrittive, **148 automatizzabili con soli override**, 65 bloccate
da una primitiva mancante (`value-input` 28, `linked-token` 17,
`spell-bridge` 14, `transformation` 6).

La classificazione resta euristica. Quando un batch conferma o corregge un
archetipo, la decisione va in `BACKLOG_ARCHETYPE_OVERRIDES` nello script e
l'audit si rigenera con `npm run audit:class-features`. Nessun impatto sul
runtime.

### Fase 1 — Copertura descrittiva universale (completata il 14 ottobre 2026)

Aggiunti 654 override in `runtime-feature-overrides.json` per tutti i record
che non ne avevano uno; le 203 voci curate in precedenza non sono state
toccate. Il catalogo runtime passa da 551 a **860 capacità** (59 implementate,
801 `not-automated`). Regole applicate:

- **primitiva `reference-only`** (passive, reazioni, effetti istantanei,
  movimento): `include`, `automationLevel: "riferimento"`,
  `quickActionEligible: false` → carta **Promemoria descrittivo**, senza
  pulsanti né azioni rapide;
- **candidati della Fase 2** (buff, TS, aure, risorse, cure, compagni…):
  `include` e `defaultEnabled` senza cambiare il livello di automazione → la
  carta resta "gestione manuale al tavolo" e il suo pool (Ki, Azione Impetuosa,
  Superiorità…) è tracciato di default;
- **privilegi**: `defaultEnabled: true`;
- **opzioni a scelta singola** (`optionGroup` = capacità madre,
  `defaultEnabled: false`): Circolo della Terra, Stile di Combattimento del
  Ranger e del Collegio delle Spade, opzioni del Cacciatore, Dono del Patto,
  Lista Espansa del Genio, Magia Divina dell'Anima Divina;
- **opzioni ottenute tutte** (`defaultEnabled: true`): azioni Ki, Potere
  Psionico, Lame dell'Anima, Volto del Sé Astrale, Incanalare Divinità dei
  giuramenti, Sciame Riunito, Virtuosismo della Lama, Cammino del Kensei, Totem
  Spirituale, Forma Siderale;
- **opzioni a scelta multipla** (nessun gruppo, `defaultEnabled: false`):
  Manovre, Discipline Elementali, Suppliche Occulte, Rune, Tiri Arcani e Stile
  di Combattimento del Guerriero (il Campione ne sceglie un secondo);
- le opzioni di capacità già implementate (Forma della Bestia) restano gestite
  dai `choiceOptions` della capacità madre.

Effetti da sapere:

- un profilo già configurato (`classFeaturesConfigured`) conserva la propria
  selezione: le nuove carte compaiono nell'editor ma vanno abilitate dal GM;
- gli ID abilitati finiscono nel registry delle card della room (budget 4.450
  byte). Una build di livello 20 arriva a ~850 byte di ID, come le classi già
  curate: il limite esiste già, la Fase 1 lo estende alle classi nuove;
- Elusione del Monaco è ora una carta, ma i danni applicano Elusione solo per
  `ladro-elusione` (`damageDefensesCore.js`): lacuna preesistente;
- refusi nelle fonti: non corretti in questa passata, restano da segnalare nei
  batch della Fase 2.

Pool resi visibili dalla Fase 1 e corretti nella stessa passata (prima
mostravano `– / –`):

- il generatore emette `owner.classId` quando il pool non ha `capacity`, anche
  per i pool di sottoclasse (Dadi di Superiorità, Dadi di Portento, Forma
  Selvatica), e converte `die_by_class_level` (d8/d10/d12 della Superiorità);
- formule lineari sul livello di classe (`livello_druido`,
  `1 + livello_warlock`) diventano tabelle per livello;
- `N * bonus_competenza` è calcolato dal runtime sul livello totale
  (`resolveClassFeatureResourceMaximum`), come già `bonus_competenza`;
- Arcanum Mistico: aggiunto `capacity_by_class_level` alla fonte PHB.

Restano senza massimo i 9 pool che dipendono da un modificatore di
caratteristica: servono la primitiva P1.

### Fase 2 — Automazione dati per classe (archetipi A, C, D, E-fisso, F)

Avanzamento:

| Batch | Data | Implementate | Audit |
|---|---|---:|---|
| Guerriero | 15 ottobre 2026 | 38 | [GUERRIERO_FASE2.md](GUERRIERO_FASE2.md) |
| Chierico | 15 ottobre 2026 | 17 | [CHIERICO_FASE2.md](CHIERICO_FASE2.md) |
| Warlock | 15 ottobre 2026 | 19 | [WARLOCK_FASE2.md](WARLOCK_FASE2.md) |
| Monaco | 15 ottobre 2026 | 42 | [MONACO_FASE2.md](MONACO_FASE2.md) |
| Druido | 15 ottobre 2026 | 13 | [DRUIDO_FASE2.md](DRUIDO_FASE2.md) |
| Ranger | 15 ottobre 2026 | 10 | [RANGER_FASE2.md](RANGER_FASE2.md) |

Un batch = una classe base + tutte le sue sottoclassi, limitato alle feature
`dataOnlyCandidate`. Per ogni batch:

1. filtrare il backlog della Fase 0 per classe;
2. scrivere un audit breve (template sotto, massimo ~120 righe);
3. modificare solo `runtime-feature-overrides.json` (merge, mai sostituzione);
4. `npm run generate:class-features`;
5. test `test/<classe>FeatureRuntime.test.js` sul modello di
   `paladinDevotionFeatureRuntime.test.js` + asserzioni di contratto in
   `classFeatureCatalog.test.js` (emoji unica, pool esistente, nessuna
   proiezione senza adapter);
6. `npm test`, `npm run build`;
7. verifica nel browser GM/player: attiva, pill, durata, fine, Undo;
8. `npm run audit:class-features` e aggiornamento della tabella in
   `docs/CAPACITA_CLASSE.md`.

Se una feature richiede codice, **esce dal batch** e va nel backlog della
primitiva corrispondente: il batch dati non introduce adapter.

### Fase 3 — Primitive condivise (codice, una alla volta)

Ordine consigliato per sblocco/rischio:

| # | Primitiva | Sblocca | Rischio | Note |
|---|---|---|---|---|
| P1 | Modificatori di caratteristica nel profilo `initiativeCard` | 9 pool + CD mostrabili | medio | campo nuovo nel profilo card, non nel metadata HP; da spiegare prima di toccare il salvataggio card |
| P2 | Token collegato (compagno/evocazione su token esistente) | Signore delle Bestie, Spirito della Fiamma, Totem Spirituale, Segugio, Servitore, Patto della Catena, … | basso-medio | estende il modello già usato da Compagno Animale (marker su token esistente); **nessuna creazione di item** |
| P3 | `VALUE_INPUT` generalizzato | cure variabili (Recuperare Energie, Balsamo della Pace, Luce Guaritrice, …) | medio (HP) | riuso di `calculateQuickHPChange` e `withItemMetaHistory`, come Imposizione delle Mani |
| P4 | Ponte Incantesimi | lancio gratuito / slot recuperati (Recupero Arcano, Magia Divina, …) | da valutare | prima un'indagine sul sistema Incantesimi |
| P5 | Trasformazione | Forma Selvatica, Forma Siderale, Forma d'Ombra, … | **alto** | vedi §4 |

Ogni primitiva: audit breve, un pilota, test, poi estensione via dati alle
altre feature della stessa famiglia nel batch di classe successivo.

## 4. Rischi da decidere prima del codice

- **Trasformazione e HP.** Forma Selvatica RAW sostituisce i PF. Una
  sostituzione toccherebbe `meta.hp`/`meta.hpMax`, le barre HP sulla mappa e
  `src/hpMemory.js`. Raccomandazione: solo marker (pill con durata e
  condizioni di fine), PF della bestia gestiti dal GM. Un secondo layer HP è
  una decisione architetturale separata.
- **Evocazioni.** Creare item di scena dal plugin interferisce con
  attachment, barre HP e virtual ID in `state.order`. Raccomandazione:
  collegare token che il GM ha già posizionato (P2), non crearli.
- **Caratteristiche (P1).** Aggiungono un dato persistente al profilo card:
  richiede un consumer runtime immediato (pool) per rispettare la regola "nessun
  metadata senza consumer".
- **`initiativeList.js`.** Nessuna fase richiede di modificarlo; le
  integrazioni passano da `classFeatureRuntime.js`, modale card e menu
  contestuale.

## 5. Ordine di esecuzione suggerito

1. Fase 0 (backlog con archetipi).
2. Fase 1 per tutte le classi (sei batch rapidi, solo dati).
3. Fase 2 per le classi più usate al tavolo. In assenza di indicazioni:
   Guerriero → Chierico → Warlock → Monaco → Druido → Ranger → Mago →
   completamento di Bardo, Ladro, Paladino, Stregone. Guerriero e Monaco
   hanno molte risorse (Azione Impetuosa, Ki, dadi di superiorità) che
   oggi sono solo tracciate e diventano `resource-only` o `condition` con poco
   sforzo.
4. P1 e P2 non appena la Fase 2 ne accumula i bloccati; P5 per ultima.

## 6. Template di audit per batch

```markdown
# Batch <Classe> — <data>

Commit: <sha>. Feature nel batch: <n> (dati) / escluse verso primitive: <n>.

| ID | Archetipo | Decisione | Override (campi) | Manuale al tavolo |
|---|---|---|---|---|

## Escluse dal batch
| ID | Primitiva richiesta | Motivo |

## Verifica
- test nuovi/aggiornati
- npm test / npm run build
- browser GM / player
- audit rigenerato: implemented prima → dopo
```
