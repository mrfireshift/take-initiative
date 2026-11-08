# Studio: avvisi di reazione

Data: 8 novembre 2026. Stato: **studio, decisioni D1–D12 approvate dall'utente
l'8 novembre come raccomandate** (§7). R0 e R1 fatti l'8 novembre (§6.1,
§6.2): R0 in `b89f4e68`, R1 in `9f0f6505`, non ancora nel bundle né
pushati. Prossimo passo: R2. Base: `main` =
`origin/main` a `5d994f10`, produzione su Render a `c38801f3`.

Richiesta dell'utente (08/11): estendere le reazioni oltre la riduzione del
danno con un popup «alla BG3». Quando succede qualcosa che permette una
reazione, il popup compare da solo e dice **chi** può reagire, **con cosa** e
**perché**, con due pulsanti: **Usa** (apre il flusso che esiste già) e
**Ignora**. Si spegne dalle opzioni a tre livelli: un interruttore generale, uno
per tipo di innesco e un «Non chiedere più» sulla singola reazione.

Vincoli: regole PHB 2014 (statblock 2024 solo come opzione); niente
bookkeeping del GM: la reazione usata viene da ciò che il plugin registra già;
niente funzioni per un solo mostro; niente Auril.

---

## 1. Che cosa esiste già

Il plugin ha già tutti i pezzi «a valle»: sa quando una reazione è usata, sa
spenderla dentro i comandi, sa proporre tre reazioni sotto il bersaglio. Manca
il pezzo «a monte»: qualcosa che si accorga dell'innesco e lo metta davanti al
GM anche quando non guarda quella riga.

### 1.1 Lo stato della reazione

| File | Funzioni | Che cosa fa |
| --- | --- | --- |
| `src/reactionTrackerCore.js` | `REACTION_USED_CONDITION` («Reazione usata»), `hasReactionUsed`, `reactionConditionOptions`, `NEXT_OWN_TURN_START_EXPIRY` | La reazione usata è una condizione normale che scade da sola all'inizio del turno della creatura. Il cambio turno non deve far niente di nuovo. |
| stesso file | `planReactionSpend` | Restituisce le operazioni `condition:add` + `condition:automate` da mettere **nel comando dell'azione**, così un solo Annulla restituisce tutto. Vale solo in combattimento, cioè con un ordine d'iniziativa. Con `alreadyUsed` non spende niente. |
| stesso file | `isOffTurn`, `initiativeTurnCreatureId` | Dicono se una creatura agisce fuori dal suo turno. Il turno di un Paragon conta per il suo token. La Tana e le Azioni Epiche non hanno una creatura. |
| stesso file | `isReactionClassFeature` | Riconosce una capacità con `activation.primary === "reazione"`. |
| `src/reactionIndicator.js` | `buildReactionIndicator` | La freccia verde o rossa sulla card. Il GM può cliccarla, ma non deve farlo: la mettono i flussi. |
| `src/spellReactionCore.js` | `REACTION_SPELL_IDS`, `planSpellReactionSpend` | Gli incantesimi lanciati con la reazione (Scudo, Assorbire elementi, Intimorire infernale, Caduta morbida, Controincantesimo, Gabbia dell'anima). Il lancio spende la reazione nel suo comando. |
| `src/classFeatureRuntime.js` | `classFeatureReactionSpend` (circa riga 228) | Lo stesso per le capacità di classe usate dalla scheda Capacità. Il comando spende anche la risorsa (dadi di superiorità, ki…). |
| `src/pcAttackExecution.js` | `spendAttackReaction` (riga 77) | Un attacco fuori turno con «Usa la reazione» spende la reazione nel comando dell'attacco. Al commit rilegge tre cose: siamo in combattimento, è ancora fuori turno, la reazione è ancora libera. |
| `src/pc-attack.js` | casella «Usa la reazione (attacco di opportunità)» (circa righe 2098–2118), `switchActor(..., { offTurn: true })` (circa righe 2674 e 2768) | La console passa a un'altra creatura fuori turno e poi torna a quella di turno. |

### 1.2 Le reazioni nelle console (CAP-REACTION, lotto 1)

| File | Funzioni | Che cosa fa |
| --- | --- | --- |
| `src/attackReactionsCore.js` | `attackTargetReactions({ target, attacker, attack, items })` → `{ sanctuary, retaliations, offers }` | Funzione pura. **offers** contiene le reazioni che il bersaglio può ancora lanciare: Scudo se è colpito (`attack.roll`), Assorbire elementi su un danno dei suoi cinque tipi, Intimorire infernale dopo un danno. Ogni offerta richiede la reazione libera e l'incantesimo in `creatureCastableSpellIds` (libro preparato, azioni rapide, incantesimi innati della specie). **retaliations** contiene Scudo di fuoco, Ombra di Moil e Armatura di Agathys; **sanctuary** contiene il TS di Santuario. |
| `src/attackReactionsRuntime.js` | `castReactionSpell`, `openReactionSpellPanel`, `applyRetaliationDamage` | Scudo si lancia subito, con lo slot e la reazione. Gli altri due aprono il pannello incantesimi già impostato (bersaglio, variante). La ritorsione è un comando a parte, con la sua voce nella Cronologia. |
| `src/attackReactionsView.js` | `renderAttackReactions(box, context, handlers)` | Disegna le righe sotto il bersaglio e le ridisegna solo quando la firma cambia, così un numero che si sta scrivendo resta. |
| `src/pc-attack.js` | `renderTargetReactions`, `retaliateOnAttacker`, `castTargetReaction` (circa righe 1898–1930) | L'aggancio nella console attacchi. |
| `src/boss-actions.js` | `renderBossTargetReactions`, `retaliateOnBoss`, `castTargetReaction` (circa righe 766–800) | L'aggancio nella console Boss. |
| `src/reactionHpCore.js` | Interdizione alla morte, Vincolo di interdizione, `payload.reactions` | CAP-REACTION, lotto 2: due effetti che cambiano i PF **dentro** la scrittura del danno, con una riga «perché» nella Cronologia e nel log. È il modello da seguire per R3. |

Come funziona oggi: l'offerta compare **sotto il bersaglio**, come riga in
piccolo, solo se il GM ha già scelto l'esito. Se il GM non la guarda, la
registrazione va avanti senza reazione. Questo è il buco che lo studio deve
chiudere.

### 1.3 Controincantesimo

`src/counterspellLauncher.js` → `openCounterspellPopover` apre
`counterspell.html`. Lo aprono **il caster del Controincantesimo** dal pannello
incantesimi (`spell-unified-panel.js`, circa riga 3009), il menu 🪄
(`initiativeList.js`, circa riga 9064) e la card (`initiative-card-modal.js`,
circa riga 874). Il GM sceglie chi viene contrastato, l'incantesimo, il livello
e lo slot. `counterspellCore.js` → `counterspellCheck` e
`planCounterspellContext` applicano la regola 2014: il contrasto è automatico
fino al livello dello slot, oltre serve una prova con CD 10 + livello.
`counterspellRuntime.js` → `castCounterspell` registra il lancio con slot,
reazione e lo slot perso dal caster contrastato, in un solo comando.
`loadCounterspellScene` elenca i candidati entro 18 m, dal più vicino.

Manca il verso opposto: quando qualcuno **lancia**, nessuno guarda chi
potrebbe contrastarlo.

### 1.4 Capacità, mostri e Boss

- `src/class-features-runtime.json` contiene **81 capacità di classe con
  attivazione «reazione»**: 29 «assistita», con un flusso d'uso che spende
  risorsa e reazione, e 52 «riferimento», con solo il testo.
  `getEnabledClassFeatures(profile)` (`classFeatureCatalog.js`) dice quali ha
  un PG.
- `src/pcAttackMonsterTraitsCore.js` → `pcAttackMonsterTraitEntries`: la
  sezione «Reactions» dello statblock completo, salvato nel browser del GM
  (`monsterStatblockTextLoader.js`), diventa voci `monster-reaction` della
  scheda Capacità. È solo testo: niente si spende.
- `src/bossActionProfileCore.js`: i profili Boss hanno la categoria
  `reaction`, con un requisito che il GM conferma.
- I **talenti** non sono modellati: Duellante difensivo, Sentinella,
  Incantatore da guerra e Mago assassino non hanno una fonte nel plugin.

### 1.5 Opzioni e online

- Le opzioni hanno tre ambiti (`docs/OPTIONS-ARCHITECTURE.md`): locale
  (`options-local`, localStorage), stanza (`options-room`) e scena. I metadata
  della stanza hanno **16 kB in tutto, già quasi pieni** (14.490 byte
  stimati): una lista di reazioni silenziate **non può** stare lì. Il modello
  di un interruttore locale del GM è `src/pcAttackAutoOpenOption.js`.
- Online: `src/options/reminderProjectionBroadcast.js` e
  `src/playerAssignmentCore.js` → `noticeReachesPlayer` filtrano in ricezione
  gli avvisi destinati a un giocatore (`targetPlayerIds`). Owlbear non manda
  un broadcast a un solo giocatore. Il giocatore proprietario viene da
  `meta.assignedPlayer` / `createdUserId` (lotto O3).
- Movimento: `src/speedCheck.js` vede ogni spostamento di un token nel suo
  turno, con la posizione di partenza e quella d'arrivo.
  `src/distance3d.js` → `measureItems` misura tra due token.

---

## 2. Catalogo degli inneschi

Per il plugin un innesco è un **momento che il plugin vede**, non la frase del
manuale. I momenti che il plugin vede oggi sono sei:

| Momento | Dove nasce | Che cosa si sa |
| --- | --- | --- |
| **Colpito** | Console attacchi e Boss: il GM sceglie Colpito o Critico | Attaccante, bersaglio, mischia o distanza, tipi di danno, CA del bersaglio. **Non** il totale del tiro: la console non lo chiede. |
| **Danno** | Le stesse console: esito con danno (colpito, TS fallito o riuscito con metà), prima di Registra | Anche il danno scritto e i tipi |
| **Mancato** | Le stesse console: il GM sceglie Mancato | Attaccante, bersaglio, mischia o distanza |
| **Incantesimo lanciato** | Pannello incantesimi, menu 🪄, console attacchi (incantesimi d'attacco) | Caster, incantesimo, livello e slot, posizione |
| **Movimento** | Speed Tracker, a fine trascinamento | Chi si è mosso, da dove, fino a dove. **Non** il percorso dentro un unico trascinamento. |
| **Dopo la registrazione** | Il comando appena scritto | PF prima e dopo, 0 PF, morte |

Il «tiro» di un'altra creatura (prima che il GM scelga l'esito) e la
**caduta** il plugin **non** li vede.

### 2.1 Correzione rispetto alla richiesta

La richiesta mette Schivata Prodigiosa, Assorbire elementi e le riduzioni del
backlog sotto «dopo il danno». Per le regole si attivano infatti «quando subisce
danni». Per il plugin però **cambiano il danno che sta per essere scritto**,
quindi stanno **prima** di Registra, come Scudo:

- Schivata Prodigiosa dimezza il danno dell'attacco;
- Assorbire elementi dà la resistenza anche al danno che l'ha innescata;
- Difesa Spettrale, Dispersione Brulicante e Mitigare Elementi danno la
  resistenza a quel danno;
- Manovra Protettrice dà +1d8 CA e, se l'attacco colpisce lo stesso, la
  resistenza;
- Legame Espansivo dà la resistenza a chi prende il danno con Legame
  Protettivo.

Davvero «dopo» è solo ciò che **non tocca** quel danno: Intimorire infernale
(2d10 sull'attaccante), le controffensive (Replica, Ritorsione) e gli effetti
alla morte. Nel resto dello studio:

- **prima** = cambia l'esito o il danno dell'innesco, quindi va deciso prima
  della scrittura;
- **dopo** = risponde senza cambiarlo, quindi può essere un avviso.

### 2.2 Il catalogo

Fonti: **S** = incantesimo (`creatureCastableSpellIds`); **C** = capacità di
classe (`getEnabledClassFeatures`, con le risorse in
`classFeatureState.resources`); **T** = talento (oggi nessuna fonte);
**M** = statblock di un mostro (sezione «Reactions» del testo salvato nel
browser del GM); **U** = universale, cioè ogni creatura.

#### A. Colpito, prima del danno: cambiano l'esito

| Reazione | Fonte | Effetto | Che cosa serve |
| --- | --- | --- | --- |
| Scudo | S | +5 CA, anche contro questo attacco | **C'è già** (offerta diretta) |
| Parata dei mostri («Parry») | M | +N CA contro un attacco in mischia che colpirebbe | Riconoscere «adds N to its AC» nel testo (R4) |
| Duellante difensivo | T | + bonus di competenza alla CA, in mischia, con un'arma accurata | Una fonte (D8) |
| Coda (Cammino della Bestia) | C, assistita | +1d8 CA contro un attacco con tiro entro 3 m | Il flusso d'uso c'è. Manca il «se ora manca» (R3a) |
| Deviazione Arcana (Magia della Guerra) | C, assistita | +2 CA (o +4 a un TS) | La pill c'è (R3a) |
| Difesa Gloriosa (Gloria) | C, assistita | + mod. Carisma alla CA di sé o di un alleato entro 3 m | R3a |
| Manovra Protettrice (Cavaliere errante) | C, riferimento | +1d8 CA a sé o a un alleato entro 1,5 m; se colpisce lo stesso, resistenza | R3a + R3b |
| Sentinella alla Porta della Morte (Tomba) | C, riferimento | Il critico entro 9 m diventa un colpo normale | R3a (Critico → Colpito) |
| Armatura dei Sortilegi (Lama del Sortilegio) | C, riferimento | Contro il bersaglio della maledizione: con 4+ su un d6 l'attacco manca | R3a |
| Scudo Runico (Cavaliere runico) | C, assistita | L'attaccante ritira il d20 | Solo avviso: il tiro è al tavolo |

#### B. Colpito o danno, prima della scrittura: cambiano il danno

| Reazione | Fonte | Effetto | Che cosa serve |
| --- | --- | --- | --- |
| Assorbire elementi | S | Resistenza al tipo, anche ora | **C'è già** (apre il pannello con la variante). La console rilegge la pill prima di Registra |
| Schivata Prodigiosa (Ladro 5, Cacciatore 15) | C, riferimento | Dimezza il danno dell'attacco | Modificatore «dimezzato» nel comando (R3b) |
| Parata (Maestro di Battaglia) | C, assistita | − (dado di superiorità + mod. Destrezza), in mischia | Riduzione nel comando + dado (R3b) |
| Deviare Proiettili (Monaco) | C, riferimento | − (1d10 + mod. Destrezza + livello), a distanza | R3b. L'afferrare e rilanciare resta al tavolo |
| Canzone di Difesa (Cantore della Lama) | C, riferimento | − 5 × livello dello slot speso | R3b, con lo slot |
| Campo Protettivo (Guerriero Psionico) | C, assistita | − (dado psionico + mod. Intelligenza), a sé o a un alleato entro 9 m | R3b |
| Spiriti Protettori (Guardiano Ancestrale) | C, riferimento | − 2d6 (poi 3d6, 4d6) a un alleato entro 9 m | R3b |
| Spirale Guardiana (Insondabile) | C, riferimento | − 1d8 (poi 2d8) entro 3 m dal tentacolo | R3b |
| Corpo del Sé Astrale (Deviare Energia) | C, riferimento | − (1d10 + Saggezza + livello) su acido, freddo, fuoco, forza, fulmine e tuono | R3b |
| Difesa Spettrale (Viandante dell'Orizzonte) | C, riferimento | Resistenza a quel danno d'attacco | R3b (backlog) |
| Dispersione Brulicante (Custode degli Sciami) | C, riferimento | Resistenza a quel danno, poi teletrasporto | R3b. Il teletrasporto passa da CAP-TELEPORT (backlog) |
| Mitigare Elementi (Natura) | C, riferimento | Resistenza a un danno elementale di sé o di un alleato entro 9 m | R3b (backlog) |
| Legame Espansivo (Pace 17) | C (sotto Legame Protettivo) | Resistenza al danno preso al posto dell'alleato | Dopo il dirottamento, vedi sotto (backlog) |
| Tomba di Levistus | C, assistita | PF temporanei che assorbono il danno | **La pill c'è già.** Usa = il flusso d'uso prima di Registra |
| Parole Taglienti (Sapienza) | C, riferimento | − dado di Ispirazione al tiro o al danno | R3b, solo sul danno |
| Interdizione Proiettata (Abiurazione) | C, riferimento | La protezione arcana assorbe il danno di un alleato | Fuori: la riserva della protezione non è modellata |

Le reazioni che **dirottano** il danno su un altro (Aura del Guardiano,
Legame Protettivo, Runa delle Nuvole, Fuorviare) restano **fuori dai lotti**:
cambiano il bersaglio di un attacco già impostato. Sono un progetto a sé.

#### C. Dopo il danno o dopo il colpo: avvisi

| Reazione | Fonte | Effetto | Usa apre |
| --- | --- | --- | --- |
| Intimorire infernale | S | 2d10 fuoco all'attaccante, TS Destrezza | **C'è già** (pannello impostato) |
| Ritorsione (Berserker) | C, riferimento | Attacco in mischia contro chi lo ha ferito entro 1,5 m | Console fuori turno, con l'attaccante come bersaglio |
| Collera della Tempesta (Tempesta) | C, riferimento | 2d8 fulmine o tuono all'attaccante entro 1,5 m, TS Destrezza | Ritorsione come Scudo di fuoco |
| Furia della Tempesta (Stregoneria della Tempesta) | C, riferimento | Danni da fulmine all'attaccante in mischia e spinta | Ritorsione |
| Tempesta Furibonda (Araldo della Tempesta, deserto) | C, assistita | Danni all'attaccante nell'aura | Ritorsione |
| Fuga Velata (Signore Fatato) | C, assistita | Invisibile e teletrasporto dopo un danno | Flusso d'uso (la pill c'è) |
| Intimorire i Violenti (Redenzione) | C, assistita | Radiosi pari al danno inflitto a un altro | Flusso d'uso, con il danno appena scritto |
| Reazione Instabile (Magia Selvaggia) | C, riferimento | Tiro sulla tabella | Testo |

#### D. Mancato: avvisi

| Reazione | Fonte | Usa apre |
| --- | --- | --- |
| Replica (Maestro di Battaglia) | C, assistita | Console fuori turno + dado di superiorità |
| Opporsi alla Marea (Cacciatore) | C, riferimento | Testo: l'attaccante ripete l'attacco su un altro |
| Andatura Ondeggiante (Maestro Ubriaco) | C, assistita | Testo + ki |
| Uccisore di Giganti (Cacciatore) | C, riferimento | Console fuori turno (vale anche sul colpito) |
| Difesa Gloriosa (se manca) | C | Console fuori turno |

#### E. Incantesimo lanciato vicino

| Reazione | Fonte | Effetto | Che cosa serve |
| --- | --- | --- | --- |
| **Controincantesimo** | S (PG e mostri) | Contrasta un incantesimo entro 18 m | Il popup c'è già. Manca l'innesco (R2) |
| Nemesi degli Incantatori (Uccisore di Mostri) | C, assistita | TS Saggezza o l'incantesimo fallisce | R2, stesso innesco |
| Ladro di Incantesimi (Mistificatore Arcano) | C, assistita | Quando è bersaglio di un incantesimo | R2, solo se è tra i bersagli |
| Mago assassino | T | Attacco in mischia contro chi lancia entro 1,5 m | Una fonte (D8) |

#### F. Movimento

| Reazione | Fonte | Effetto | Che cosa serve |
| --- | --- | --- | --- |
| **Attacco di opportunità** | U | Una creatura ostile esce dalla portata | R5: Speed Tracker + portata |
| Vendicatore Implacabile (Vendetta) | C | Dopo l'AdO, mezza velocità | Nota sull'AdO |
| Alone di Spore (Spore) | C, riferimento | Una creatura entra o inizia il turno entro 3 m | R5, entrata |
| Schermagliatore (Esploratore) | C, riferimento | Un nemico finisce il turno entro 1,5 m | R5, a fine turno (il plugin lo vede) |
| Sentinella, Incantatore da guerra | T | AdO speciali | Una fonte (D8) |
| **Caduta morbida**, Caduta Lenta | S, C | Una creatura cade | **Nessun innesco**: il plugin non sa che una creatura cade. Restano al lancio dal pannello, come oggi |

#### G. Al tiro di un'altra creatura (non nei lotti)

Lampo di Interdizione, Interdizione Entropica, Schivata dell'Ombra, Fascino
Istintivo, Sosia Illusorio, Protezione (stile di combattimento), Spirito
Falco, Benedizione del Dio della Guerra, Profezia Cosmica, Piegare la
Fortuna, Ripristino dell'Equilibrio. Scattano **mentre si tira**, prima che il
GM scelga l'esito. La console le vedrebbe solo alla scelta del bersaglio,
cioè a ogni attacco: troppo rumore. Proposta: niente popup. Possono restare
come righe sotto il bersaglio, in un lotto futuro.

#### H. Dopo un TS o a 0 PF (in coda, non nei lotti)

Deviazione Arcana sul TS, Punizione Solerte, Scambio Seducente, Contrattacco
dell'Uccisore, Difese Seducenti (dopo un TS). Forza di Fronte alla Morte,
Infestazione Fungina, Fiamme Cauterizzanti, Pegni dei Defunti (alla morte o a
0 PF). La console ad area e la console Boss conoscono l'esito dei TS, quindi
sono possibili, ma più tardi.

### 2.3 Che cosa diventa il catalogo nel codice (R0)

Un modulo puro, ad esempio `src/reactionTriggerCatalog.js`. Per ogni voce:

- `id`;
- `source`: `spell` | `class-feature` | `feat` | `monster` | `universal`;
- `sourceId`: lo spellId o il featureId;
- `trigger`: `hit` | `damage` | `miss` | `spell-cast` | `move-leave` |
  `move-enter`;
- `timing`: `before` | `after`;
- `filters`: mischia o distanza, tipi di danno, chi è protetto (sé, alleato
  entro N m), «attacco con tiro»;
- `effect`: per il testo del popup e, da R3, per il modificatore;
- `flow`: `cast-spell` | `use-feature` | `retaliation` | `off-turn-attack` |
  `counterspell` | `note`.

A fianco, una funzione pura `reactionCandidates(event, { items, state,
options })`. Riceve l'evento («Colpito: bersaglio X, attaccante Y, mischia,
fuoco») e restituisce le reazioni possibili, già filtrate (vedi §5). Le
offerte di `attackTargetReactions` restano come sono: R1 le legge, non le
riscrive.

---

## 3. Il momento giusto

### 3.1 Regola di fondo

**Il popup non scrive mai niente da solo**: niente PF, niente condizioni,
niente Cronologia. «Usa» chiama un flusso che esiste già e che scrive nel suo
comando:

| Flusso | Funzione esistente | Che cosa scrive |
| --- | --- | --- |
| Incantesimo diretto (Scudo) | `castReactionSpell` | Slot, reazione e pill, in un comando |
| Incantesimo con scelta | `openReactionSpellPanel` | Il pannello, al Lancia |
| Capacità | Il flusso d'uso della scheda Capacità (`classFeatureRuntime.js`) | Risorsa, reazione e pill |
| Ritorsione | `applyRetaliationDamage` | I PF dell'attaccante, con la sua voce |
| Attacco fuori turno | `switchActor(..., { offTurn: true })` + «Usa la reazione» | La reazione, nel comando dell'attacco |
| Controincantesimo | `openCounterspellPopover` | Il suo lancio |

«Ignora» chiude il popup e basta.

### 3.2 «Prima»: la console si ferma prima di Registra

Le reazioni dei gruppi A e B compaiono **appena il GM sceglie l'esito**
(Colpito o Critico, o un esito con danno). Non compaiono al clic su
Registra: così il GM le vede mentre scrive il danno, non dopo. Due modi di
«fermare» la console (decisione D2):

- **Fermata morbida (raccomandata).** Il popup sta sopra la riga di
  Registra. Se il GM preme Registra con il popup aperto, vale come Ignora: il
  danno si registra e il popup si chiude. Nessun clic in più per chi non
  vuole la reazione, ma il popup è impossibile da non vedere.
- **Fermata dura.** Registra è disattivato finché il GM non sceglie Usa o
  Ignora. Più sicuro, ma ogni colpo su un mago con Scudo costa un clic in
  più.

Dopo «Usa» la console **rilegge** il bersaglio: la pill nuova (Scudo +5 CA,
la resistenza di Assorbire elementi) cambia il conto del danno, come succede
oggi quando il GM usa la riga sotto il bersaglio. Per Scudo la console non
conosce il tiro. Il popup scrive quindi la finestra: «CA 15 → 20: se il tiro
era 15–19 diventa Mancato». Il GM cambia l'esito con un clic. Se la console
lo cambiasse da sola, servirebbe il totale del tiro, cioè un campo in più da
compilare a ogni attacco (bookkeeping): **scartato**.

Se il GM ha già registrato e poi vuole la reazione, usa **Annulla**: un
comando, un Annulla. Il popup non prova a correggere a posteriori.

### 3.3 «Dopo»: un avviso

Le reazioni dei gruppi C e D compaiono **dopo** Registra, quando il comando è
applicato. Non fermano niente. Si chiudono da sole quando il GM passa alla
prossima azione, oppure con Ignora. Usa apre il flusso: per un attacco fuori
turno la console passa alla creatura che reagisce e, finito l'attacco, torna a
quella di turno, come oggi.

Il Controincantesimo (gruppo E) è un caso a parte: deve fermare il **lancio**,
non la console. Vedi R2.

### 3.4 Rischi, come chiede AGENTS.md

| Area | Rischio | Come lo si evita |
| --- | --- | --- |
| **PF (`meta.hp`, `meta.hpMax`, `meta.tempHp`)** | R1, R2, R4 e R5 non scrivono PF nuovi: usano flussi esistenti. **R3b sì**: un modificatore (dimezzato, − N, resistenza a questo danno) dentro la scrittura del danno. | R3b passa dal blocco HP del coordinatore dove già stanno Interdizione alla morte e Vincolo di interdizione (`reactionHpCore.js`). Stesso calcolo (`componentDamageAfterDefense`, `calculateQuickHPChange`), stesse proiezioni (TS contro la morte, concentrazione, PF temporanei, barre). Ordine 2014: prima dimezzamento e riduzioni, poi resistenza, poi vulnerabilità. Nessun campo PF nuovo. |
| **Barre PF sulla mappa** | Nessuno: derivano da `meta.hp`. | Nessun lavoro sugli allegati. |
| **Metadata del token** | Nessun campo nuovo fino a R3. Il «Non chiedere più» **non** va sul token: lì scriverebbe a ogni clic e girerebbe per tutti i client. | Scelte nel localStorage del GM (§5.4). Se D8 aggiunge i talenti, un campo nella scheda (`initiativeCard`), in fusione. |
| **Metadata di stanza** | Budget di 16 kB quasi pieno. | Nella stanza va al massimo un valore («chi vede», D1/D9), mai la lista delle reazioni silenziate. |
| **Cronologia** | Il popup non scrive. Usa crea **un comando per il flusso**, prima di quello dell'attacco: «Scudo» poi «Attacco · Mancato», due voci e due Annulla, come oggi. R3b mette la reazione **nel** comando dell'attacco: una voce, un Annulla, la riga «perché» in `payload.reactions`. | Nessun comando nuovo senza la sua voce. Annullare l'attacco non annulla lo Scudo, ed è giusto: lo Scudo è stato lanciato. |
| **Stato vecchio** | Tra la comparsa del popup e il clic su Usa possono cambiare il bersaglio, l'esito, la scena o la reazione (un altro client). | Il popup porta una firma: bersaglio, attaccante, esito, chiave della bozza, `sceneEpoch`. Al clic si rilegge: reazione libera, risorsa, bersaglio. Se qualcosa è cambiato, Usa si disattiva con il motivo. I flussi rileggono già da soli (`alreadyUsed`). |
| **Turno attivo, ordine, id virtuali** | Un attaccante può essere la Tana o un'Azione Epica (id virtuale). | Le reazioni che colpiscono l'attaccante (Intimorire infernale, Ritorsione) usano il token del Boss (`initiativeTurnCreatureId`, `splitParagonId`). Senza token, niente offerta. Nessuna modifica a code, revisioni o filtri del turno. |
| **Loop di metadata** | R1–R4 nascono da clic, non da `onChange`. R5 ascolta il movimento. | R5: solo il client del GM, solo trascinamenti veri. Gli spostamenti scritti dal plugin (teletrasporti, rollback dello Speed Tracker, Annulla) sono esclusi. Ogni spostamento ha un id ed è guardato una volta sola. |
| **`initiativeList.js`** | File fragile: il menu 🪄 lancia da lì. | R2 parte dal pannello incantesimi e dalla console attacchi. Il 🪄 entra con un solo aggancio al punto di lancio (circa riga 9064), oppure resta fuori (D10). |

---

## 4. Chi vede l'avviso

### 4.1 Al tavolo (profilo Tavolo)

- **Il GM sempre.** È lui che usa le console e i flussi; il popup sta nella
  sua finestra.
- **Lo schermo dei giocatori, solo per le reazioni dei PG, se acceso.** Una
  scheda **di sola lettura** sullo schermo HDMI: «Mira può reagire: Scudo».
  Niente pulsanti, perché il clic resta del GM. Serve al giocatore per dire
  «la uso!». Le reazioni dei mostri **non** arrivano mai allo schermo dei
  giocatori: direbbero che cosa sa fare un mostro. Il nome dell'attaccante
  compare solo se il suo token è visibile. Spento di base (D1): il GM al
  tavolo può dirlo a voce, e lo schermo è già pieno di avvisi di turno.

### 4.2 Online (profilo Online)

- **Il giocatore proprietario del PG** (`assignedPlayer` / `createdUserId`)
  riceve il popup con Usa e Ignora. Il broadcast va a tutti, con
  `targetPlayerIds`; il filtro è in ricezione, come per i promemoria
  (`noticeReachesPlayer`).
- **Il GM vede lo stesso popup**, con la risposta del giocatore («Mira: Usa»).
  **Scrive solo il client del GM.** Il giocatore non lancia niente dal suo
  client, perché i client dei giocatori non scrivono sui token (lotto O1) e i
  due client che scrivono restano un problema aperto (ON-19). Raccomandato
  (D9): la risposta del giocatore evidenzia il pulsante nel popup del GM, che
  conferma con un clic o con Invio.
- Se il giocatore non risponde, il GM procede: con la fermata morbida,
  Registra vale come Ignora.
- I mostri restano del GM, anche online.
- Come per tutto l'online: cambia **solo** nel profilo Online; il Tavolo
  resta identico.

---

## 5. Rumore: niente popup a ogni colpo

Un mago con Scudo, colpito tre volte in un round, farebbe tre popup. Le
difese contro il rumore, dalla più forte alla più fine:

### 5.1 Filtri che il plugin applica da solo, senza chiedere

1. **Solo in combattimento**: con un ordine d'iniziativa, come
   `planReactionSpend`.
2. **Reazione libera**: niente «Reazione usata». Appena il GM usa una
   reazione, quella creatura tace fino al suo turno. È la difesa che conta di
   più, e la fa già il plugin.
3. **Creatura in grado di reagire**: niente popup per chi è incapacitato,
   stordito, paralizzato, pietrificato, privo di sensi o a 0 PF.
4. **Risorsa disponibile**: slot del livello giusto (Scudo 1°,
   Controincantesimo 3°), dadi di superiorità, ki, usi della capacità. Una
   creatura senza slot non riceve l'offerta. I mostri senza slot nel plugin
   sono sempre «disponibili», come oggi in `counterspellSlotOptions`.
5. **Innesco esatto**: mischia per Parata e Ritorsione, distanza per Deviare
   Proiettili, tipo di danno per Assorbire elementi e Mitigare Elementi,
   distanza in metri per chi protegge un alleato (`measureItems`), attacco
   con tiro per Scudo.
6. **Un solo popup per evento**: tutte le reazioni di tutti i coinvolti in
   un'unica finestra. Un'area con 4 bersagli fa un popup con 4 righe, non 4
   popup.
7. **Nessuna ripetizione sullo stesso evento**: se il GM cambia l'esito
   avanti e indietro (Colpito → Mancato → Colpito) con la stessa bozza, il
   popup non ricompare. Le righe sotto il bersaglio restano.

### 5.2 Le scelte di base

- **Solo i PG di base.** I mostri sono del GM, che sa che cosa possono fare.
  Le loro reazioni si accendono a parte (D3).
- **Movimento spento di base.** Il plugin non sa chi si è disimpegnato, quindi
  i falsi allarmi sarebbero troppi.
- **Trucchetti esclusi dal Controincantesimo di base** (D10): contrastare un
  Dardo di fuoco con uno slot di 3° è raro.

### 5.3 Ignora

Ignora vale **per quell'evento** (D5). Al colpo successivo, se la reazione è
ancora libera, il popup torna: il GM ha ignorato un colpo da 4 danni, non
vuol dire che ignori un critico da 30. In alternativa: Ignora silenzia quella
reazione di quella creatura fino all'inizio del suo turno.

### 5.4 Non chiedere più

Una casella nel popup, accanto alla riga: «Non chiedere più per Mira ·
Scudo». La raccomandazione (D4):

- vale per **quella creatura e quella reazione**: Mira non chiede più Scudo,
  ma chiede ancora Assorbire elementi, e l'altro mago chiede ancora Scudo;
- la creatura si riconosce dalla chiave corta del personaggio
  (`actorProfileId`, altrimenti il nome), la stessa di `playerAssignments`.
  Così la scelta vale anche in un'altra scena;
- sta nel **localStorage del GM** (`options-local`), con un massimo di circa
  200 voci, mai nella stanza;
- si ripristina dalle Opzioni: una lista «Reazioni silenziate» con ↺ per
  voce;
- online, il giocatore ha la sua lista nel suo browser, per i suoi PG.

**Niente «Usa sempre»** (il terzo stato di BG3): userebbe slot e reazioni
senza un clic, cioè il popup che scrive da solo. Scartato.

### 5.5 Le opzioni

Una sezione «Avvisi di reazione» nelle Opzioni del GM:

- interruttore generale;
- per innesco: Colpito / Danno / Mancato / Incantesimo lanciato / Movimento;
- per chi: PG / Mostri;
- Controincantesimo: «anche sui trucchetti»;
- la lista «Reazioni silenziate»;
- nella Vista giocatori: «Mostra le reazioni dei PG allo schermo dei
  giocatori» (Tavolo) e «Chiedi al giocatore» (Online).

Gli interruttori del GM sono locali, come l'apertura automatica della
console (`pcAttackAutoOpenOption.js`). Solo «chi vede» è di stanza, perché i
client dei giocatori devono leggerlo.

---

## 6. Lotti proposti

| Lotto | Contenuto | File toccati (previsti) | Scrive PF? | Rischio |
| --- | --- | --- | --- | --- |
| **R0** | Catalogo e candidati, puri, con test. Nessuna interfaccia. | nuovi `reactionTriggerCatalog.js`, `reactionCandidatesCore.js`, test | No | Basso |
| **R1** | Opzioni (generale, per innesco, PG/Mostri, silenziate) e popup per **Colpito** e **Danno** nelle due console. Solo le tre reazioni che esistono già (Scudo, Assorbire elementi, Intimorire infernale), con i loro flussi. Fermata morbida (o dura, D2). | nuovo `reactionPromptView.js` + CSS in `public/console-panel.css`; aggancio in `pc-attack.js` e `boss-actions.js` accanto a `renderTargetReactions` / `renderBossTargetReactions`; `options/optionsDefaults.js`, `optionsNormalize.js`, `options-modal.js` | No | Basso-medio: interfaccia delle console |
| **R2** | **Controincantesimo all'innesco**: al Lancia di un incantesimo, se un nemico entro 18 m ha Controincantesimo, la reazione e lo slot, il pannello si ferma col popup. Usa apre `counterspell.html` già compilato (nuovi parametri: chi lancia, incantesimo, livello). Se l'incantesimo è annullato, il lancio originale non parte (lo slot perso lo scrive già il Controincantesimo, `targetSlot`). Se non è annullato, o con Ignora, il lancio continua. Il risultato torna al pannello con un broadcast LOCAL; c'è anche un ripiego a mano («Annullato» / «Prosegui»). Anche Nemesi degli Incantatori. | `spell-unified-panel.js` (punto del Lancia), `counterspellLauncher.js`, `counterspell.js`, eventualmente la console attacchi; 🪄 secondo D10 | No (il lancio resta quello di oggi) | Medio: due popover coordinati |
| **R3a** | Reazioni dei PG che **cambiano l'esito**: + CA (Coda, Deviazione Arcana, Difesa Gloriosa, Manovra Protettrice per la CA), Critico → Colpito (Sentinella alla Porta della Morte). Usa = flusso d'uso della capacità (risorsa + reazione) + finestra «se il tiro era X–Y diventa Mancato». | catalogo, `classFeatureRuntime.js` (solo lettura), popup | No | Basso |
| **R3b** | **Riduzioni del danno** dei PG: Schivata Prodigiosa, Parata, Deviare Proiettili, Canzone di Difesa, Campo Protettivo, Spiriti Protettori, Spirale Guardiana, Corpo del Sé Astrale, Parole Taglienti sul danno; resistenza a questo danno per Difesa Spettrale, Dispersione Brulicante, Mitigare Elementi e Manovra Protettrice. Il modificatore entra **nel comando dell'attacco**, con reazione e risorsa del reattore e la riga in `payload.reactions` (D7). | `pcAttackExecution.js` (piano del comando), blocco HP del coordinatore, `reactionHpCore.js`, console Boss, console ad area per Mitigare Elementi | **Sì** | **Alto: PF.** Va spiegato e approvato prima del codice |
| **R3c** | Avvisi **dopo** e **mancato** dei PG: Replica, Ritorsione, Uccisore di Giganti, Collera della Tempesta, Furia della Tempesta, Intimorire i Violenti, Fuga Velata. Usa = console fuori turno, ritorsione o flusso d'uso. | popup, `pc-attack.js` (`switchActor`) | No (flussi esistenti) | Basso-medio |
| **R4** | Reazioni dei **mostri** dallo statblock, spente di base: riconoscere nel testo inglese «adds N to its AC against one melee attack» (Parata) e i casi simili («halves the attack's damage», «when a creature … hits/misses»). Scudo e Controincantesimo dei mostri passano già da `creatureCastableSpellIds`. Le reazioni dei profili Boss con un innesco (categoria `reaction`). Il formato 2024 («Trigger: … Response: …») solo come opzione. Una reazione non riconosciuta resta nella scheda Capacità, come oggi. | `pcAttackMonsterTraitsCore.js` o un nuovo `monsterReactionParseCore.js`, `bossActionProfileCore.js` (sola lettura) | No | Medio: lettura del testo |
| **R5** | **Movimento**, spento di base: a fine trascinamento, ogni creatura ostile che aveva il mover entro portata (1,5 m, o la portata maggiore dei suoi attacchi in mischia) e ora no. Esclusi: teletrasporti, spostamenti scritti dal plugin, «Movimento: no AdO» (Colpo dello Zefiro), reattore senza reazione o incapacitato. Usa apre la console fuori turno del reattore (o la console Boss) con il mover come bersaglio e «Usa la reazione» spuntato. Alone di Spore all'entrata. | `speedCheck.js` (solo un evento in uscita), nuovo `opportunityAttackCore.js` | No | Medio: lo Speed Tracker è delicato |
| **R6** | **Schermo dei giocatori e online**: R6a, la scheda di sola lettura sullo schermo del tavolo per i PG; R6b, nel profilo Online, il popup al proprietario con la risposta al GM. | broadcast nuovo (`…/reaction-prompt`), host del giocatore accanto a `turnNoticeHost.js`, `playerAssignmentCore.js` | No | Medio: multi-client |

Ordine consigliato: R0 → R1 → R2 → R3a → R3c → R3b → R4 → R6 → R5. R3b va
dopo i lotti che non toccano i PF: così il popup è già provato quando entra
il pezzo rischioso. R5 va per ultimo perché è spento di base ed è il più
rumoroso.

### 6.1 R0, fatto l'8 novembre

Solo moduli puri e test: niente interfaccia, niente scritture, nessun file
esistente cambiato tranne una parola.

- `src/reactionTriggerCatalog.js`: il catalogo, 39 voci dei gruppi A–F (R1: 3, R2: 3, R3a: 7,
  R3b: 13, R3c: 10, R5: 3)
  (`REACTION_TRIGGER_CATALOG`, `reactionTriggerEntry`,
  `reactionTriggerEntriesFor`). Per ogni voce: inneschi, prima o dopo, chi
  protegge e a che distanza, filtri (mischia o distanza, tiro, critico, tipi),
  la pill richiesta (Ira, Melodia della Lama, Braccia del Sé Astrale,
  Maledizione della Lama del Sortilegio sull'attaccante), il flusso di Usa,
  l'effetto e il lotto che la collega.
- `src/reactionCandidatesCore.js`: `reactionCandidates(event, { items, state,
  options, distance })` applica i filtri del §5.1 e le opzioni di D3–D4.
  Ci sono anche `normalizeReactionPromptOptions`, `withReactionPromptMuted`,
  `isReactionPromptMuted` e `reactionActorKey` (la chiave corta del
  personaggio, come `playerAssignments`). Poi `reactionEventSignature` (lo
  stesso evento non riapre il popup), `splitReactionCandidates` (prima/dopo)
  e `reactionSpellAvailable` (slot, azioni rapide gratuite o con usi).
- `src/classFeatureCatalog.js`: `classFeatureResourceStatus` ora è esportata
  (una parola), per leggere se la risorsa di una capacità è finita.
- `test/reactionCandidates.test.js`: 12 test. Controllano che ogni capacità
  del catalogo esista e usi la reazione, e che ogni incantesimo sia lanciato
  con la reazione. Poi i filtri, gli slot, gli alleati in un'area, il
  Controincantesimo, l'attacco di opportunità, le opzioni e la firma.

Scelte prudenti di R0, da rivedere al bisogno:

- Con una distanza sconosciuta resta la reazione su di sé (Intimorire
  infernale), mentre cadono quella su un alleato e il Controincantesimo.
- «Ostile» vuol dire un nemico contro un PG o un alleato: i neutrali non
  innescano niente.
- Le capacità che dipendono da un'altra scelta (Coda con la Forma della
  Bestia) non controllano la forma.
- Spirale Guardiana vale solo su di sé: la posizione del tentacolo non è nel
  plugin.
- Un incantesimo innato o di un mostro è sempre disponibile: il GM lo sa.

R1 legge `reactionCandidates` e mette le opzioni in `options-local`.
`attackTargetReactions` resta com'è: le righe sotto il bersaglio non cambiano.

### 6.2 R1, fatto l'8 novembre

Il popup sopra Registra, nelle due console, per le tre reazioni che hanno già
un flusso: Scudo, Assorbire elementi (prima) e Intimorire infernale (dopo).

- **Quando compare.** Appena il GM sceglie un esito con un bersaglio solo:
  Colpito o Critico valgono come «colpito» e «danno», Fallito e Superato come
  «danno». Le aree restano fuori, come le righe sotto il bersaglio.
- **Cosa dice.** «Colpo di Goblin su Mira, in mischia.», poi una riga per
  reazione: «Mira · Scudo — +5 CA · CA 15 → 20: un tiro da 15 a 19 diventa
  Mancato» e «Mira · Assorbire elementi — Resistenza ai danni da fuoco,
  anche ora». Ogni riga ha **Usa** e **Non chiedere più**; sotto ci sono
  «Registra senza usarla vale come Ignora.» e **Ignora**.
- **Fermata morbida (D2).** Registra resta attivo. Premuto con il popup
  aperto, vale come Ignora. Lo stesso evento sulla stessa bozza non torna;
  l'attacco dopo (bozza nuova) sì.
- **Dopo.** Registrato il danno, compare l'avviso di Intimorire infernale.
  Si chiude quando il GM sceglie l'esito dell'attacco dopo.
- **Usa** chiama `castTargetReaction`, lo stesso pulsante delle righe sotto il
  bersaglio, con chi reagisce come caster (`offer.casterId`). Scudo si lancia
  subito con slot e reazione; gli altri due aprono il pannello impostato. Il
  popup non scrive niente.
- **Opzioni.** Nelle Opzioni del GM c'è la sezione «Avvisi di reazione»
  (Questo browser): generale, colpito, danno, PG, altre creature, e la lista
  delle reazioni silenziate con «↺ Chiedi di nuovo». Si salvano con Salva.
  Stanno in `options-local` sotto `reactions`, accanto alle altre opzioni
  locali che restano intatte. Gli interruttori di «mancato», «incantesimo
  lanciato» e «movimento» arriveranno con i loro lotti.
- **File.**
  - nuovi `src/reactionPromptView.js` (il popup e `reactionPromptCandidates`,
    con i lotti collegati in `REACTION_PROMPT_LOTS`), `src/reactionPromptOption.js`
    (l'opzione locale) e `src/reactionPromptOptionsCore.js`: le opzioni
    normalizzate, leggere per il pannello Opzioni, che non deve caricare il
    catalogo degli incantesimi (`test/spellAreaIndex.test.js`);
  - `src/pc-attack.js` e `src/boss-actions.js`: l'evento dalla bozza,
    `dismiss` a Registra, `showAfter` dopo. La console Boss tiene anche lo
    stato d'iniziativa letto dalla scena;
  - `pc-attack.html` e `boss-actions.html`: il contenitore, nascosto a
    console ridotta;
  - `public/console-panel.css`: il vetro viola;
  - `options-modal.html`, `src/options-modal.js` e `public/options-modal.css`:
    la sezione nelle Opzioni;
  - `test/reactionPrompt.test.js`: 6 test.
- **Prove.**
  - In una copia pulita di HEAD con le modifiche: 5870 test e build verdi.
  - Al banco, su un server mio sulla copia, in due giri:
    - console attacchi: Goblin colpisce Mira e compare il popup. «Usa» su
      Scudo lancia Scudo (pill +5 CA, «Reazione usata») e chiude il popup.
      In un giro nuovo, Registra senza rispondere scrive il danno
      (45 → 38) e chiude il popup; poi compare Intimorire infernale, e il
      suo «Usa» apre il pannello con Mira caster e il goblin bersaglio;
    - console Boss: Icekiss su Mira mostra Scudo e Assorbire elementi
      (freddo). «Non chiedere più» toglie Scudo e salva «Mira · Scudo» nel
      browser. Le Opzioni lo elencano, «↺» e Salva lo tolgono;
    - con il tracker in **vista compatta**, lo stesso giro nelle due console
      dà lo stesso popup, lo stesso Registra (45 → 38) e lo stesso avviso
      dopo;
    - **a funzione spenta**: niente popup e righe sotto il bersaglio identiche
      a prima. L'interruttore vale subito, senza riaprire la console.
      L'unica differenza nel codice è una lettura in più dei metadata della
      scena nella console Boss, a ogni aggiornamento, per conoscere l'ordine
      d'iniziativa.

Ogni lotto ha i suoi test puri (candidati, filtri, firme) e una prova al banco
nelle due console. La parte dello schermo dei giocatori (R6a) va provata in
vista compatta e in vista espansa. Poi la prova in stanza.

---

## 7. Decisioni per l'utente

**Approvate l'8 novembre 2026: tutte come la raccomandazione della colonna di
destra.** R3b (riduzioni del danno nel comando dell'attacco, D7) scrive i PF:
prima del codice va comunque spiegato il piano esatto e atteso il via, come
chiede `AGENTS.md`.

| # | Domanda | Possibilità | Raccomandazione |
| --- | --- | --- | --- |
| **D1** | Chi vede l'avviso al tavolo? | (a) solo il GM; (b) il GM, più una scheda di sola lettura sullo schermo dei giocatori per le reazioni dei PG | **(a) di base, (b) come opzione** (R6a). Le reazioni dei mostri non vanno mai ai giocatori. |
| **D2** | La console si ferma? | (a) fermata morbida: popup all'esito, Registra = Ignora; (b) fermata dura: Registra spento finché non si risponde; (c) nessuna fermata, solo avviso | **(a)**: zero clic in più per chi non reagisce, impossibile da non vedere. |
| **D3** | Quali inneschi sono accesi di base? | Colpito, Danno, Mancato, Incantesimo lanciato, Movimento; PG / Mostri | **Accesi: Colpito, Danno, Incantesimo lanciato, solo per i PG. Spenti: Mancato (fino a R3c), Mostri, Movimento.** Interruttore generale acceso. |
| **D4** | Come funziona «Non chiedere più»? | (a) per creatura e reazione; (b) per reazione, per tutte le creature; (c) solo per questo combattimento | **(a)**, per sempre nel browser del GM, ripristinabile dalle Opzioni. Niente «Usa sempre». |
| **D5** | Che cosa fa Ignora? | (a) vale per quell'evento; (b) silenzia quella reazione fino al turno della creatura | **(a)**: il colpo dopo può valere la reazione. |
| **D6** | Dove compare il popup? | (a) dentro la console per gli inneschi della console, in un popover a parte per gli altri (lancio, movimento, giocatori); (b) sempre in un popover a parte | **(a)**: niente coordinamento tra finestre per la fermata, ed è dove il GM sta guardando. Stesso aspetto (vetro viola) nei due posti. |
| **D7** | Le riduzioni del danno (R3b): come entrano? | (a) modificatore nel comando dell'attacco, con reazione e risorsa del reattore; (b) una pill «solo contro il prossimo danno» creata da Usa e consumata da Registra | **(a)**: un comando, un Annulla, niente pill orfane se l'attacco non viene registrato. Costa toccare il piano del comando: va approvato a parte. |
| **D8** | I talenti con reazione (Duellante difensivo, Sentinella, Incantatore da guerra, Mago assassino)? | (a) aggiungerli come voci scelte nella scheda; (b) lasciarli fuori | **(a), ma dopo R3**: oggi non hanno una fonte, e senza una fonte non c'è innesco. |
| **D9** | Online: chi conferma l'Usa del giocatore? | (a) il giocatore risponde, il GM conferma con un clic o con Invio; (b) l'Usa del giocatore parte da solo dal client del GM | **(a)**: un solo client che scrive e il GM che controlla bersagli ed esiti, come nell'audit online. |
| **D10** | Controincantesimo: trucchetti e menu 🪄? | Trucchetti inclusi o esclusi di base; il 🪄 subito (tocca `initiativeList.js`) o dopo | **Trucchetti esclusi di base, con l'interruttore. Il 🪄 dopo** il pannello incantesimi e la console. |
| **D11** | Reazioni dei mostri: quanto leggere dallo statblock? | (a) solo i casi riconoscibili (+N CA, dimezza, colpito/mancato), il resto come oggi; (b) anche gli inneschi a testo libero | **(a)**, con il formato 2024 solo come opzione. |
| **D12** | Caduta morbida e Caduta Lenta? | (a) fuori (il plugin non vede le cadute); (b) un innesco dal calo di elevazione | **(a)**: un calo di elevazione non vuol dire che la creatura cade. |

---

## 8. Che cosa non fa questo studio

- Non tocca le righe sotto il bersaglio: restano, anche a popup spento. Spenta
  la funzione, il plugin è identico a oggi.
- Non tiene conto delle azioni, delle azioni bonus o della reazione a mano: la
  reazione usata viene solo dai flussi che già la scrivono.
- Non chiede il totale del tiro d'attacco.
- Niente reazioni di un solo mostro, niente Auril.
- I dirottamenti del danno (Aura del Guardiano, Legame Protettivo con Legame
  Espansivo, Runa delle Nuvole, Fuorviare), le reazioni al tiro (gruppo G) e
  quelle dopo un TS o a 0 PF (gruppo H) restano in coda.
