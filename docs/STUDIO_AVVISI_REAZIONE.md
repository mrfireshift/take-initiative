# Studio: avvisi di reazione

Data: 8 novembre 2026. Stato: **studio, decisioni D1–D12 approvate dall'utente
l'8 novembre come raccomandate** (§7). R0 e R1 fatti l'8 novembre (§6.1,
§6.2): R0 in `b89f4e68`, R1 in `9f0f6505`, bundle `ea62af15`, pushati l'8
novembre con la CI verde. R2, R2b, R3a e R3c fatti l'8 novembre (§6.3–§6.6,
non committati). R3b (R3b-1, R3b-2, R3b-3) e R3b-4 (aree delle console)
fatti l'8 novembre (§6.8, §6.9, non committati). R3b-5 (pannello incantesimi)
fatto l'8 novembre con F1–F3 approvate (§6.10, §6.11, non committato). R4
(mostri) fatto l'8 novembre con G1–G5 approvate (§6.12, §6.13, non
committato). R6 (schermo dei giocatori e online) fatto l'8 novembre con
H1–H5 approvate (§6.14, §6.15, non committato). R5 (movimento) fatto l'8
novembre con J1–J5 approvate (§6.16, §6.17, non committato): tutti i lotti
sono fatti. Base: `main` =
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

### 6.3 R2, fatto l'8 novembre

Il Controincantesimo quando una creatura lancia dal **pannello incantesimi**.

- **Quando compare.** Alla prima pressione del pulsante che lancia
  (`apply`: «Lancia», «Applica a N bersagli»), prima di qualunque
  scrittura. Compare se un nemico (un nemico contro un PG o un alleato) entro
  18 m ha Controincantesimo, la reazione libera e uno slot dal 3°. Un
  trucchetto lo fa scattare solo con l'interruttore (D10). Le distanze sono
  quelle del popup del Controincantesimo (`measureItems`, gittata a cerchio),
  in metri (`src/reactionSceneContext.js`).
- **Cosa dice.** «Goblin lancia Blocca persone (2°).», poi «Mira ·
  Controincantesimo — Contrasta: automatico fino al livello dello slot, oltre
  prova CD 10 + livello», con Usa, Non chiedere più, Ignora e «Premi di nuovo
  il pulsante per lanciare senza reazione.». Lo stesso modulo delle console,
  con un fondo pieno perché galleggia sopra la lista dei bersagli
  (`public/reaction-prompt.css`, ora comune alle tre finestre).
- **Fermata morbida (D2).** Premere di nuovo il pulsante vale come Ignora e
  lancia come oggi.
- **Usa** apre `counterspell.html` già compilato: chi lancia (`target`),
  l'incantesimo (`spell`), il livello (`spellLevel`) e la richiesta
  (`request`). Il pannello mostra «In attesa del Controincantesimo di Mira»
  con «Annullato: non lanciare» e «Prosegui». Quando il popup lancia, rimanda
  il risultato con un broadcast LOCAL (`COUNTERSPELL_RESULT_CHANNEL`):
  - **annullato**: il lancio non parte; lo slot perso lo scrive già il
    Controincantesimo;
  - **non annullato**, o popup chiuso: il pannello chiede di premere di nuovo
    il pulsante.
- **Nessuna scrittura nuova.** Un lancio annullato non parte; uno che
  prosegue è quello di oggi. Il controllo è sincrono quando non serve
  aspettare, così un doppio clic lancia una volta sola (il test L4 l'ha
  trovato).
- **Limite.** Nel pannello gli esiti dei tiri salvezza si segnano prima del
  pulsante, quindi il popup arriva dopo. Se l'incantesimo viene annullato,
  gli esiti segnati non servono.
- **Rimandati a R2b** (fatto, §6.4): Nemesi degli Incantatori e Ladro di
  Incantesimi. Restano fuori il menu 🪄 e la console attacchi (D10).
- **Opzioni.** Due interruttori nuovi: «Quando una creatura lancia un
  incantesimo dal pannello (Controincantesimo)» e «Controincantesimo anche
  contro i trucchetti».
- **File.**
  - nuovi `src/reactionSceneContext.js` e `public/reaction-prompt.css`;
  - `src/spell-unified-panel.js` (`castReactionStep`, `castReactionGate`,
    attesa e risultato, in `commit` dopo il ramo del Controincantesimo) e
    `spell-unified-panel.html`;
  - `src/counterspellLauncher.js` e `src/counterspell.js` (parametri e
    risultato);
  - `src/reactionPromptView.js` (`ignoreHint`, `onRender`, lotto R2) e
    `src/reactionTriggerCatalog.js` (R2b);
  - `options-modal.html`, `pc-attack.html`, `boss-actions.html`,
    `public/console-panel.css` (lo stile passa al foglio comune);
  - `test/reactionPrompt.test.js`: 3 test in più.
- **Prove al banco**, su una copia del progetto con un server mio. Goblin
  lancia Blocca persone su Mira, che ha Controincantesimo:
  - compare il popup; «Usa» apre il Controincantesimo già compilato
    (annullamento automatico) e il pannello aspetta. Lanciato il
    Controincantesimo, Mira ha «Reazione usata», niente Paralizzato, e il
    pannello dice che il lancio non parte;
  - in un giro nuovo, premere di nuovo il pulsante lancia: Mira è
    Paralizzata;
  - con l'interruttore spento, il primo clic lancia subito.

### 6.4 R2b, fatto l'8 novembre

Nemesi degli Incantatori (Uccisore di Mostri 11) e Ladro di Incantesimi
(Mistificatore Arcano 17), allo stesso momento del Controincantesimo.

- **Nemesi degli Incantatori.** Compare se il ranger ha l'uso e la reazione
  e il lanciatore è un nemico entro 18 m. Il testo dice «TS Saggezza CD 15:
  se lo fallisce, l'incantesimo fallisce e lo slot è perso» (la CD è quella
  della scheda). **Usa** spende l'uso e la reazione con il flusso della scheda
  (`adjustClassFeatureResource`), poi il pannello mostra «TS fallito:
  fallisce» e «TS superato: prosegui».
  - **TS fallito:** il lancio non parte e il lanciatore spende quello che il
    lancio avrebbe speso (lo slot, o l'uso dell'azione rapida), con lo stesso
    calcolo del pannello (`prepareSpellSlotSpend`). Lo spende in un comando
    suo, con la voce «Blocca persone: fallisce (Nemesi degli Incantatori di
    Mira)» nella Cronologia; un mostro senza slot non spende niente.
  - **TS superato:** il pannello chiede di premere di nuovo il pulsante.
- **Ladro di Incantesimi.** Compare solo se il ladro è tra i bersagli
  dell'incantesimo. **Usa** mostra prima il TS («TS di caratteristica da
  incantatore CD 16: se lo fallisce, non ha effetto sul ladro, che lo
  ruba»). Poi:
  - **TS fallito: lo ruba.** Il flusso della capacità
    (`activateClassFeature`, modalità «ruba», o «nega» per un trucchetto)
    spende l'uso e la reazione e mette sul lanciatore il promemoria
    «Incantesimo rubato». Il ladro esce dai bersagli; se l'area è già
    piazzata, il pannello chiede di toglierlo con Modifica bersagli;
  - **TS superato:** l'uso e la reazione si spendono lo stesso, poi il
    pulsante.
- **Scritture nuove:** solo lo slot del lancio fallito, in un comando con la
  sua voce e il suo Annulla. Nessun PF.
- **File:** `src/spell-unified-panel.js` (`spendFailedCast`,
  `stealCastSpell`, gli esiti nuovi di `settleCastReaction`), il nuovo
  `src/reactionFeatureRuntime.js`, i testi in `src/reactionPromptView.js`.
- **Banco:**
  - Goblin (mago di 5°) lancia Blocca persone su Mira. «Usa» su Nemesi segna
    reazione e uso (1 → 0); «TS fallito» toglie lo slot di 2° (3 → 2), Mira
    non è Paralizzata e il lancio non parte;
  - Goblin lancia su Sera. «Usa» sul Ladro, poi «TS fallito: lo ruba»: Sera ha
    reazione e uso segnati, esce dai bersagli e il Goblin ha il promemoria
    «Incantesimo rubato: Blocca persone».

### 6.5 R3a, fatto l'8 novembre

Le capacità dei PG che **cambiano l'esito** di un colpo, nelle due console,
nel popup sopra Registra: Coda, Deviazione Arcana, Difesa Gloriosa, Manovra
Protettrice (la parte della CA), Sentinella alla Porta della Morte, Armatura
dei Sortilegi e Scudo Runico.

- **Usa** passa da `src/reactionFeatureRuntime.js`: una capacità con una
  risorsa ne spende un uso con la reazione (`adjustClassFeatureResource`),
  una senza risorsa segna solo la reazione (`useClassFeatureReaction`).
  Sono i flussi che il plugin ha già.
- **L'esito lo cambia il GM**, perché la console non conosce il tiro. Il
  testo gli dà la finestra: «Ser · Difesa Gloriosa — + Car alla CA su Bram ·
  CA 14 → 18: un tiro da 14 a 17 diventa Mancato». Per un bonus fatto di
  dadi (Coda, Manovra Protettrice) dice di tirare il dado.
- **Un'eccezione:** con la Sentinella alla Porta della Morte, Usa trasforma
  da sé il Critico in Colpito nella bozza. Il cambio è certo e non scrive
  niente sul token.
- **Sugli alleati:** le distanze vengono dalla griglia, lette una volta
  all'apertura della console (`loadReactionSceneGrid`). Finché non sono
  lette, le reazioni su un alleato non compaiono.
- **Nessuna scrittura nuova:** risorsa e reazione passano dai comandi che
  esistono già. Nessun PF.
- **Banco:**
  - Goblin colpisce Mira, con accanto Dars paladino della Gloria (Car +4):
    compare la Difesa Gloriosa con CA 14 → 18. «Usa» segna la reazione di
    Dars e un uso (4 → 3);
  - Dars chierico della Tomba e un Critico su Mira: «Usa» sulla Sentinella
    rimette Colpito.

### 6.6 R3c, fatto l'8 novembre

Gli avvisi **dopo** il danno e **dopo un attacco mancato**, nelle due console,
quando Registra è applicato.

- **Il mancato.** Scegliere Mancato non ferma niente. Registrato l'attacco,
  compaiono le reazioni dopo il mancato: Replica (mischia), Opporsi alla
  Marea, Andatura Ondeggiante, Uccisore di Giganti. Dal lotto R3c
  l'interruttore «Quando un attacco manca» è **acceso di base**: D3 lo
  teneva spento solo finché le sue reazioni non erano collegate.
- **Dopo il colpo o il danno:** Ritorsione (Berserker, attaccante entro
  1,5 m), Collera della Tempesta (entro 1,5 m), Furia della Tempesta (in
  mischia), Tempesta Furibonda (con l'Ira), Fuga Velata e Intimorire i
  Violenti (su un alleato), accanto a Intimorire infernale di R1.
- **Usa, attacco con la reazione** (Replica, Ritorsione, Uccisore di
  Giganti). L'attaccante viene selezionato sulla mappa e:
  - nella console attacchi, la console passa alla creatura che reagisce,
    fuori turno, come «⇄ Agisci con»;
  - dalla console Boss si apre la console attacchi del PG.

  In entrambi i casi il bersaglio è l'attaccante e la casella «Usa la
  reazione» è spuntata: è l'attacco registrato a spendere la reazione.
- **Usa, capacità** (Collera della Tempesta, Furia della Tempesta, Tempesta
  Furibonda, Fuga Velata, Intimorire i Violenti, Opporsi alla Marea,
  Andatura Ondeggiante). Passa da `useReactionFeature` di R3a: un uso con la
  reazione, o la reazione sola. La riga di stato ripete la regola. I dadi, il
  TS e i danni restano al tavolo, con gli strumenti di sempre.
- **Nessuna scrittura nuova**, nessun PF.
- **Limiti:**
  - Uccisore di Giganti non controlla la taglia dell'attaccante (Grande o
    più), che il testo ricorda;
  - la casella della console dice «attacco di opportunità» anche per una
    Replica.
- **Banco:**
  - Goblin manca Dars, maestro di battaglia: nessuna fermata. Dopo Registra
    compare «Dars · Replica»; «Usa» porta la console su Dars fuori turno,
    con il goblin come bersaglio e la reazione spuntata;
  - Goblin colpisce Mira, chierica della Tempesta, a 1,5 m: dopo Registra,
    «Usa» su Collera della Tempesta segna la reazione e scrive la regola;
  - Auril manca Dars nella console Boss: «Usa» su Replica apre la console
    attacchi di Dars, fuori turno, con Auril come bersaglio.

### 6.7 R3b, piano (8 novembre; E1–E8 approvate come raccomandate)

R3b è l'unico lotto che **scrive i PF**. Come chiede `AGENTS.md`, qui c'è il
piano esatto con i rischi; il codice parte solo dopo il via sulle decisioni
E1–E8.

**Cosa copre.** Le reazioni dei PG che cambiano il danno di un attacco a
**bersaglio singolo**, nella console attacchi e nella console Boss:

| Reazione | Effetto sul danno | Che cosa scrive il GM |
| --- | --- | --- |
| Schivata Prodigiosa | dimezzato | niente |
| Parata (Maestro di Battaglia) | − importo (dado di superiorità + Des) | l'importo |
| Deviare Proiettili | − importo (1d10 + Des + livello) | l'importo |
| Campo Protettivo | − importo (dado psionico + Int) | l'importo |
| Spiriti Protettori | − importo (2d6, 3d6, 4d6) | l'importo |
| Spirale Guardiana | − importo (1d8, 2d8) | l'importo |
| Corpo del Sé Astrale | − importo, solo su acido, freddo, fuoco, forza, fulmine e tuono | l'importo |
| Parole Taglienti | − importo (dado di Ispirazione) | l'importo |
| Canzone di Difesa | − 5 × livello dello slot speso | il livello dello slot (E4) |
| Difesa Spettrale, Dispersione Brulicante | resistenza a questo danno | niente |
| Mitigare Elementi | resistenza a questo danno elementale | niente |
| Manovra Protettrice | resistenza se colpisce lo stesso (E7) | niente |

La **Tomba di Levistus** non è un modificatore: la capacità ha già il suo
flusso (`activateClassFeature`: pill, PF temporanei, vulnerabilità al
fuoco). Usa la attiva prima di Registra e la console rilegge il bersaglio,
come oggi con Assorbire elementi (E6).

**Come funziona per il GM.** Il popup sopra Registra mostra la reazione
come gli altri. **Usa non scrive niente:** aggiunge alla bozza una riga
«Reazioni al danno», sotto il danno, per esempio «Schivata Prodigiosa di
Vex: danno dimezzato ✕» oppure «Parata di Dars: − [  ] (d8 + Des) ✕».
L'anteprima del totale tiene già conto della riga. **Registra** scrive in
**un solo comando**:

- il danno ridotto;
- la «Reazione usata» di chi reagisce;
- la sua risorsa: dado, uso o slot.

Un **Annulla** rimette tutto. Con ✕ il GM toglie la riga prima di
registrare, senza spendere niente.

**Il codice, punto per punto:**

1. **Un modulo puro nuovo**, `src/damageReactionCore.js`, con
   `applyDamageReactions({ components, inputs, factor, defenses, reactions })`.
   Restituisce importi, fattore e difese da usare, più le righe «perché».
   L'ordine è quello di E1:
   - dimezzare (il fattore `full` diventa `half`, come fa già l'Elusione);
   - sottrarre le riduzioni dagli importi;
   - aggiungere le resistenze di questo danno alle difese.

   Una resistenza che c'è già non raddoppia; resistenza più vulnerabilità
   resta «Res. e Vuln.» (lotto M6).
2. **`defendedComponents`** (`src/bossActionExecutionCore.js`, condivisa
   dalle due console) prende un'opzione in più, `reactions`, e la applica
   **dopo** il controllo delle difese attese. Così il controllo «le difese
   sono cambiate» resta uguale. Senza `reactions` il risultato è identico a
   oggi, byte per byte: lo verifica un test.
3. **Le anteprime** chiamano lo stesso modulo: `pcAttackPreview`
   (`src/pcAttackCore.js`), `bossDefendedDamage` e `bossDefenseCounts`
   (`src/bossActionsViewCore.js`). Anteprima e commit fanno lo stesso
   conto.
4. **Il piano dell'attacco** (`buildPcAttackMutation` e il ramo
   `attack-damage` del piano Boss) passa le reazioni a `defendedComponents`
   per il **solo bersaglio**: le seconde creature e le esplosioni restano
   come oggi. Il resto non cambia: `calculateQuickHPChange` sul totale
   ridotto, poi PF temporanei, TS contro la morte e concentrazione. Nel
   coordinatore Interdizione alla morte e Vincolo di interdizione lavorano
   già sul danno ridotto.
5. **Il runtime** (`executePcAttack`, `executeBossAction`) rilegge chi
   reagisce **al commit**, come fa già `spendAttackReaction`. Controlla tre
   cose:
   - la capacità è ancora attiva sulla scheda;
   - la reazione è ancora libera (se no: «Dars ha già usato la reazione:
     togli la riga»);
   - la risorsa c'è ancora.

   Poi aggiunge al piano le operazioni che esistono già: `condition:add`
   della «Reazione usata» (`planReactionSpend`) e
   `class-feature:adjust-resource` per il dado, l'uso o lo slot. È la stessa
   operazione che usa `adjustClassFeatureResource`; la costruisce una
   funzione pura nuova in `src/reactionFeatureRuntime.js`. Le richieste
   entrano nella `decisionKey`, così un nuovo tentativo dopo una risposta
   persa non spende due volte.
6. **La Cronologia e il registro.** Le righe «perché» («Schivata Prodigiosa
   di Vex: danno dimezzato», «Parata di Dars: −7») vanno in
   `payload.damageReactions`. Il registro dei combattimenti
   (`combatLogPresentationCore.js`) legge quella chiave accanto a
   `payload.reactions`. `history.js` non si tocca (E5).
7. **La console.** `pc-attack.js` e `boss-actions.js`, nei blocchi delle
   reazioni:
   - `damageReactions` nella bozza;
   - la riga con l'importo e ✕;
   - l'anteprima;
   - la richiesta di Registra.

   Una bozza nuova (l'attacco dopo) parte senza righe. Il popup, per le
   voci con `flow: "modifier"`, chiama la bozza invece di un flusso che
   scrive.

**Rischi, come chiede `AGENTS.md`:**

| Area | Rischio | Come si evita |
| --- | --- | --- |
| PF (`meta.hp`, `meta.hpMax`, `meta.tempHp`) | Un conto sbagliato scrive PF sbagliati. | Un solo modulo puro per anteprima e commit, con i test sui casi delle regole: dimezzato con resistenza, riduzione più grande del danno (mai sotto 0), riduzione solo su alcuni tipi, critico, PF temporanei, 0 PF e TS contro la morte. Senza reazioni il conto è identico a oggi (test byte per byte su `defendedComponents`). |
| Barre PF | Nessuno: derivano da `meta.hp`. | — |
| Metadata | Nessun campo nuovo sul token. La risorsa e la reazione passano dalle operazioni che esistono già. | — |
| Cronologia | Una voce, un Annulla. La chiave nuova `damageReactions` non sostituisce `reactions`. | Test sull'Annulla con la reazione e la risorsa tornate indietro (sul modello di `test/reactionHpIntegration.test.js`). |
| Stato vecchio | La reazione o la risorsa usate altrove tra l'Usa e Registra. | Rilette al commit: il commit si ferma con il motivo, senza scrivere niente. |
| Doppio invio | Un nuovo tentativo dopo una risposta persa. | La `decisionKey` contiene le reazioni: il secondo invio restituisce il primo risultato. |
| Turno, ordine, id virtuali | Nessuno: chi reagisce è un token vero, letto per id. | — |
| `initiativeList.js` | Non si tocca. | — |

**Sottolotti.**

- **R3b-1:** il modulo puro e i test, nessuna interfaccia.
- **R3b-2:** la console attacchi (bozza, righe, anteprima, runtime, registro).
- **R3b-3:** la console Boss, sullo stesso modello.
- **R3b-4**, più avanti: le **aree** (console ad area, TS di gruppo Boss,
  pannello incantesimi). Ci arrivano Mitigare Elementi, Spiriti Protettori e
  Campo Protettivo, che in un'area proteggono una creatura per volta.

**Decisioni E1–E8.** La raccomandazione è nella colonna di destra.

| # | Domanda | Possibilità | Raccomandazione |
| --- | --- | --- | --- |
| **E1** | In che ordine si applicano dimezzare, sottrarre e resistenza? | (a) dimezzare, poi sottrarre, poi resistenze e vulnerabilità; (b) sottrarre prima di dimezzare | **(a)**: le resistenze per ultime come dice il PHB. Tra dimezzare e sottrarre l'ordine lo sceglie chi subisce il danno (Sage Advice), e (a) è il più favorevole: lo si fissa una volta per tutte. |
| **E2** | Una riduzione su un attacco di più tipi: da dove si toglie? | (a) dai componenti nell'ordine in cui la console li mostra (l'arma per prima), solo dai tipi ammessi; (b) dal tipo con più danno | **(a)**: è quello che il GM vede. |
| **E3** | Reazione e risorsa di chi reagisce | nel comando dell'attacco (D7, già approvata), rilette al commit | **Confermata.** |
| **E4** | Canzone di Difesa | (a) nella riga il GM sceglie il livello dello slot; si spende nel comando e riduce 5 × livello; (b) resta fuori | **(a)**: lo slot è una risorsa come le altre (`class-feature:adjust-resource`). |
| **E5** | Le righe «perché» nel registro | (a) chiave nuova `payload.damageReactions`, letta dal registro; (b) unire a `payload.reactions` toccando `history.js` | **(a)**: `history.js` non si tocca. |
| **E6** | Tomba di Levistus | (a) il suo flusso (`activateClassFeature`) prima di Registra; (b) un modificatore | **(a)**: c'è già tutto (pill, PF temporanei, vulnerabilità). |
| **E7** | Manovra Protettrice | (a) passa a R3b: Usa aggiunge la resistenza alla bozza e segna la reazione nel comando; il +1d8 alla CA il GM lo usa per l'esito; (b) resta in R3a, solo reazione | **(a)**: è una reazione sola con due effetti. In R3a, una volta segnata la reazione, la resistenza non si potrebbe più offrire. |
| **E8** | Le aree e il pannello incantesimi | in R3b-4, dopo | **Dopo**: il bersaglio singolo copre i casi più frequenti al tavolo. |

**Prove previste:**

- test puri sul modulo (ogni effetto, gli ordini, i limiti);
- test di integrazione con coordinatore, Cronologia e Annulla veri, come
  CAP-REACTION lotto 2;
- banco nelle due console, con il tracker in vista compatta ed espansa:
  Schivata Prodigiosa, Parata con l'importo, Difesa Spettrale contro un
  danno con resistenza, una riduzione più grande del danno, l'Annulla;
- suite completa e build in una copia pulita.

### 6.8 R3b, fatto l'8 novembre (R3b-1, R3b-2, R3b-3)

Il piano della §6.7, con E1–E8 approvate, applicato così:

- **R3b-1, il calcolo.** `src/damageReactionCore.js`
  (`adjustForDamageReactions`, `normalizeDamageReactions`,
  `defenseWithReactionResistance`). `defendedComponents` prende l'opzione
  `reactions` dopo il controllo delle difese attese; `bossDefendedDamage`,
  usata dalle anteprime delle due console, prende lo stesso parametro.
  Senza reazioni il risultato è identico a prima: lo verifica un test.
- **R3b-2, la console attacchi.**
  - Usa aggiunge la riga «Reazioni al danno» nella scheda del danno, con
    l'importo o lo slot da scrivere e ✕, e l'anteprima la conta.
  - Registra manda le righe. Il runtime (`spendDamageReactions`) rilegge chi
    reagisce e aggiunge «Reazione usata» e la risorsa
    (`planReactionFeatureSpend` in `src/reactionFeatureRuntime.js`).
  - Il piano scrive il danno ridotto e la riga in `payload.damageReactions`,
    che il registro dei combattimenti legge.
  - Una riga vale solo per il bersaglio per cui è stata aggiunta e solo con
    un esito che fa danno.
  - Una riduzione senza importo, o la Canzone di Difesa senza slot, blocca
    Registra con il motivo.
- **R3b-3, la console Boss.** Stesso modello (`buildBossActionMutation`,
  `executeBossAction`). Le etichette di chi reagisce per un altro si
  aggiornano dopo il commit.
- **Tomba di Levistus** (E6): Usa la attiva prima di Registra con il suo
  flusso. **Manovra Protettrice** (E7): passata a R3b come resistenza.
- **Catalogo:** due flussi nuovi, `modifier` e `activate-feature`.
  Le voci di R3b ora sono nel popup (`REACTION_PROMPT_LOTS`). Una reazione
  già messa nella bozza non viene riproposta (`skip`).
- **Test:**
  - `test/damageReactions.test.js`: 5 test sul calcolo;
  - `test/damageReactionIntegration.test.js`: 5 test con coordinatore,
    Cronologia e Annulla veri. Coprono Schivata Prodigiosa, Parata con il
    dado di superiorità, la reazione già usata che ferma il commit, un
    attacco senza reazioni identico a prima e la riga nel registro;
  - suite completa 5885, build e controllo degli incantesimi verdi, in una
    copia pulita.
- **Banco:**
  - console attacchi, tracker in vista espansa: il goblin colpisce Mira,
    ladra di 5°. Usa su Schivata Prodigiosa porta l'anteprima da 11 a 5
    (PF 45 → 40). Registra scrive 40 PF e la reazione; Annulla rimette 45 e
    la reazione;
  - console Boss, tracker in vista compatta: Icekiss su Dars, maestro di
    battaglia. Parata con 9: anteprima da 25 a 16, perché 18 taglienti − 9 =
    9, più 7 di freddo (E2). Registra: PF 60 → 44, reazione e un dado di
    superiorità (4 → 3); Annulla rimette tutto.
- **Resta, R3b-4:** le aree (console ad area, TS di gruppo Boss, pannello
  incantesimi).

### 6.9 R3b-4, fatto l'8 novembre (aree delle console)

Le reazioni al danno sulle aree delle **due console**, con lo stesso calcolo e
lo stesso comando di R3b, una creatura per volta:

- **Console attacchi ad area** (trucchetti e soffi ad area, Freccia
  Perforante, azioni ad area dei mostri). Il popup guarda le creature
  spuntate con un esito di TS, senza tiro per colpire. Ogni riga dice su chi
  vale («Campo Protettivo di Dars su Mira») e conta solo per quella
  creatura, nell'anteprima e nel comando (`pcAttackAreaPreview`,
  `buildPcAttackAreaMutation`, `executePcAttackArea`).
- **Console Boss, TS di gruppo con danno** (Soffio della Lunga Notte, Hand
  Slam, Meteor Swarm). Il popup è nello stato del gruppo. L'importo di ogni
  creatura e il totale si aggiornano mentre il GM scrive la riduzione
  (`buildBossActionGroupMutation`, `spendBossDamageReactions` condivisa con
  il bersaglio singolo).
- Dopo Registra, anche sulle aree compaiono gli avvisi «dopo» (Intimorire
  infernale).
- **Fuori:** il gruppo d'attacco della console Boss, che è un'azione di un
  solo boss.
- **Test:** un'area nel test d'integrazione: Campo Protettivo su una
  creatura, l'altra come prima, un Annulla per tutto. Suite completa 5887,
  build e controllo degli incantesimi verdi in una copia pulita.
- **Banco:**
  - console attacchi: il goblin lancia Turbine di Spade su Mira e Dars.
    Campo Protettivo di Dars su Mira con 4: Mira −6, Dars −10, reazione e un
    uso di Dars spesi;
  - console Boss: Soffio della Lunga Notte su Mira, Campo Protettivo di Dars
    con 5. La riga e il totale scendono da 46 a 41; Registra porta Mira da
    45 a 4 PF; Annulla rimette tutto, compresa la pill Accecato.

  Qui il banco ha trovato un difetto, corretto: nel gruppo l'importo sulla
  riga della creatura non si aggiornava (`refreshBossDamageView`).

### 6.10 R3b-5, piano (pannello incantesimi; F1–F3 approvate l'8 novembre)

Il pannello incantesimi calcola il danno con un **sistema suo**:
`spellDamageDefenseCore.js` (`spellDamagePartsAfterDefense`,
`spellDamageAfterDefense`), usato in 18 punti di 8 file. Lo usano il
lancio ad area, le azioni degli incantesimi attivi, i promemoria, la Palla di
fuoco ritardata e l'anteprima per bersaglio del pannello. Le console invece
usano `defendedComponents`. Portare lì le reazioni al danno vuol dire:

1. un'opzione `reactions` in `spellDamagePartsAfterDefense`, con il calcolo
   di `damageReactionCore.js` (l'ordine E1 vale anche qui);
2. il popup «danno» nel pannello, allo stesso clic del Controincantesimo
   (R2), sui bersagli con un esito;
3. le righe per creatura sotto la riga del bersaglio
   (`spellUnifiedPanelEffectsView.js`);
4. la spesa di chi reagisce nel comando del lancio
   (`spellApplicationExecutor.js`, `spellAreaResolutionExecutor.js`). Il
   danno lì passa da `applyAreaReactionHp`, accanto al Vincolo di
   interdizione.

**Rischio:** alto. È una seconda strada che scrive i PF, con più punti di
ingresso (lancio, azioni attive, promemoria) e un'anteprima diversa. Va
fatta a parte, con il suo test d'integrazione.

| # | Domanda | Raccomandazione |
| --- | --- | --- |
| **F1** | Farlo? | **Sì, ma solo per il lancio dal pannello** (aree e bersagli singoli). Le azioni degli incantesimi attivi (Raggio lunare, Muro di fuoco) e i promemoria dopo: lì il danno arriva a ogni turno, con il suo TS. |
| **F2** | Quando chiedere? | **Allo stesso clic del Controincantesimo:** una sola fermata per il lancio, con le reazioni «incantesimo lanciato» e «danno» nello stesso popup. |
| **F3** | Le reazioni che non riguardano il danno (Schivata Prodigiosa e Parata) | **Escluse da sole:** il catalogo le lega a un attacco con tiro o in mischia, quindi non compaiono su un TS. |

### 6.11 R3b-5, fatto l'8 novembre (pannello incantesimi)

Le reazioni al danno sul **lancio dal pannello**, secondo F1–F3:

- **Quando (F2).** Al primo clic su Lancia, lo stesso popup del
  Controincantesimo mostra anche chi può reagire al danno. Guarda le creature
  che l'anteprima del pannello dà come danneggiate. Su un TS c'è un solo
  evento senza tiro per colpire; su un attacco c'è un evento per creatura,
  con il suo critico. Il popup mostra solo quello che il pannello sa fare con
  Usa:
  - Controincantesimo, Nemesi e Ladro di Incantesimi (R2, R2b);
  - le reazioni al danno, che diventano righe;
  - le capacità con un loro flusso (Tomba di Levistus).
- **Righe.** Usa aggiunge una riga sopra Lancia («Campo Protettivo di Dars su
  Mira», importo, slot o ✕); il popup sale sopra le righe. L'anteprima di
  ogni creatura conta la sua riga (`hpPreviewFor`).
- **Calcolo.** Le righe stanno accanto alla sessione del pannello, che tiene
  solo i suoi campi. Arrivano all'anteprima e al comando
  (`hp.damageReactions`, solo sui bersagli del lancio). L'esecutore delle
  aree (`hpEntries`) usa lo stesso calcolo dell'anteprima:
  `spellDamageWithReactions` in `damageReactionCore.js`, che segue l'ordine
  E1 e conta ogni tipo con la sua difesa, anche con due tipi di danno.
- **Spesa (E3).** Reazione e risorsa di chi reagisce vengono rilette al
  momento del lancio, nelle operazioni del lancio stesso. Un solo Annulla
  rimette tutto. Le righe del registro di combattimento dicono perché.
- **Fuori:**
  - Dardo incantato e Spruzzo prismatico, che contano il danno a modo loro;
  - il secondo colpo di Coltello di ghiaccio;
  - il danno iniziale della strada «ciclo di vita» del pannello (incantesimi
    senza zona né segnalini);
  - le azioni degli incantesimi attivi e i promemoria (F1);
  - Assorbire Elementi e Scudo nel pannello: il loro Usa apre un lancio, che
    dal pannello non c'è. Lì restano a mano.
- **Test:**
  - quattro casi puri del calcolo;
  - un'anteprima con tre esiti;
  - un test d'integrazione: comando, Campo Protettivo con un Annulla, TS
    superato, nessuna reazione, registro.

  Suite completa 5897, build e controllo degli incantesimi verdi in una copia
  pulita.
- **Banco** (vista espansa e compatta): Sera lancia Frantumare su Mira e
  Dars.
  - Al primo clic compare Campo Protettivo per entrambi. Con Usa su Mira e 4,
    l'anteprima di Mira passa da 45 → 33 a 45 → 37.
  - Il lancio porta Mira a 37 e Dars a 48; Dars ha «Reazione usata» e un dado
    psionico in meno.
  - Annulla rimette tutto.
  - Ignorato il popup, il lancio resta com'era.
- **Da sapere:** l'intestazione del popup su un'area nomina solo il primo
  bersaglio («Danno di Sera a Dars»), come nelle aree delle console. Ogni
  riga dice comunque su chi vale.

### 6.12 R4, piano (reazioni dei mostri; G1–G5 approvate l'8 novembre)

**Dove sono le reazioni dei mostri.** Solo nello statblock completo che il GM
ha importato da 5eTools, salvato nel suo browser
(`monsterStatblockTextLoader.js`, sezione «Reactions»). Oggi diventano voci
di sola lettura nella scheda Capacità (`pcAttackMonsterTraitsCore.js`). Uno
statblock incollato a mano è un blocco unico, senza sezioni. Sulla scheda
del token non c'è niente.

**Il piano:**

1. **Lettura.** Un modulo puro, `monsterReactionParseCore.js`, legge il
   testo inglese di ogni voce «Reactions» e riconosce tre forme:
   - **+N CA** («adds 2 to its AC against one melee attack that would hit
     it», la Parata di cavalieri, gladiatori, capitani): innesco Colpito,
     prima; solo in mischia se il testo dice «melee»;
   - **dimezza** («halves the damage that it takes from an attack that hits
     it», la Schivata Prodigiosa dei mostri): innesco Colpito, prima;
   - **colpito o mancato** («when a creature … hits it / misses it with an
     attack»): solo un avviso con il testo, dopo.

   Tutto il resto resta nella scheda Capacità, come oggi.
2. **Catalogo.** Tre voci generiche nuove con la fonte «M»:
   `monster-parry`, `monster-halve` e `monster-note`. L'importo della CA
   viene dal testo letto, non dal catalogo. Il motore dei candidati
   (`reactionCandidates`) riceve le reazioni lette in
   `context.monsterReactions` ({ id del token: [...] }) e le tratta come le
   altre: reazione libera, creatura in grado di agire, filtri.
3. **Caricamento.** Le due console e il pannello leggono lo statblock delle
   creature non PG coinvolte nell'evento, una volta per mostro, e solo con
   l'interruttore «Mostri» acceso (spento di base, D3). Il caricamento è
   asincrono; il motore resta puro.
4. **Usa:**
   - **+N CA:** spende la reazione del mostro («Reazione usata»); il GM
     cambia l'esito. È come R3a: il popup dice con quali tiri l'attacco
     manca.
   - **Dimezza:** diventa una riga «Reazioni al danno» (R3b, R3b-4, R3b-5).
     La spesa nel comando dell'attacco ha un ramo «mostro»: solo la
     reazione, niente risorse (`planReactionFeatureSpend`).
   - **Avviso:** nessun Usa, solo Ignora.

**Rischio:** medio. Il «dimezza» scrive i PF, ma dalla strada già provata di
R3b. Il resto è lettura del testo e popup. A mostri spenti (il default) non
cambia niente.

| # | Domanda | Raccomandazione |
| --- | --- | --- |
| **G1** | Quali forme leggere? | **Le tre sopra** (D11 a). Niente inneschi a testo libero. |
| **G2** | Statblock 2024 («Trigger: … Response: …») | **Letti quando il mostro è 2024.** Entra solo con l'opzione «Statblock 2024» già esistente (spenta di base): niente secondo interruttore. |
| **G3** | Statblock incollato a mano (un blocco unico) | **Cercare la riga «Reactions» e leggere le voci sotto**, fino alla sezione dopo. Se non c'è, niente. |
| **G4** | Reazioni dei profili Boss (categoria `reaction`) | **Fuori.** Oggi sono meccaniche di un solo boss, con un innesco sui PF (niente funzioni per un solo mostro). |
| **G5** | Gli alleati non PG (un PNG alleato con Parata) | **Come i mostri:** stesso interruttore «Mostri», perché sono del GM. |

### 6.13 R4, fatto l'8 novembre (reazioni dei mostri)

Secondo il piano della §6.12, con G1–G5 come raccomandate:

- **Lettura** (`src/monsterReactionParseCore.js`, puro):
  - le tre forme di G1, con la stessa lettura per il formato 2024 (G2);
  - uno statblock incollato si legge dalla riga «Reactions» alla sezione
    dopo (G3).
- **Catalogo.** Quattro voci con la fonte `monster` (lotto R4):
  - `monster-parry`: Parata, +N CA, solo in mischia se il testo lo dice;
  - `monster-halve`: Schivata Prodigiosa, danno dimezzato;
  - `monster-note-hit` e `monster-note-miss`: avvisi dopo il colpo e
    dopo il mancato, con il nome e il testo dello statblock.
- **Candidati.** `reactionCandidates` riceve `monsterReactions` e propone
  una voce solo se lo statblock la contiene. Vale l'interruttore «Mostri»
  delle Opzioni, spento di base: è lo stesso per i PNG alleati (G5), e la
  sua etichetta ora dice che cosa legge.
- **Caricamento** (`loadMonsterReactions` in `reactionSceneContext.js`):
  - le due console lo fanno all'apertura e a ogni aggiornamento, il pannello
    al clic su Lancia;
  - legge solo le creature non PG nell'ordine d'iniziativa;
  - a interruttore spento non carica niente, nemmeno il codice degli
    statblock.
- **Usa:**
  - Parata e gli avvisi segnano solo «Reazione usata» del mostro
    (`useReactionFeature` con `monster`), in un comando suo;
  - Schivata Prodigiosa diventa una riga «Reazioni al danno».
    `planReactionFeatureSpend` ha un ramo «mostro»: solo la reazione, mai
    una risorsa.
- **Fuori (G4):** le reazioni dei profili Boss.
- **Test:**
  - `test/monsterReactions.test.js`, 7 test: lettura 2014 e 2024,
    statblock incollato, candidati con l'interruttore, mischia, avvisi,
    spesa;
  - un caso d'integrazione: Schivata Prodigiosa di un mostro con Annulla.

  Suite completa 5904, build e controllo degli incantesimi verdi in una copia
  pulita.
- **Banco** (vista espansa e compatta): il Goblin A con lo statblock di un
  cavaliere (Parata e Schivata Prodigiosa) e l'interruttore «Mostri» acceso.
  Dars lo colpisce con la spada lunga.
  - Il popup mostra «Parata · +2 CA · CA 18 → 20: un tiro da 18 a 19
    diventa Mancato» e «Schivata Prodigiosa · Danno dimezzato».
  - Usa su Schivata Prodigiosa: 11 danni diventano 5 (PF 52 → 47), con
    «Reazione usata».
  - Usa su Parata: la reazione è segnata, e il GM segna Mancato senza danni.
  - A interruttore spento il popup non compare.

### 6.14 R6, piano (schermo dei giocatori e online; H1–H5 approvate l'8 novembre)

Oggi il popup vive solo nelle finestre del GM: le due console e il pannello
incantesimi. R6 lo porta ai client dei giocatori, con D1 (b) e D9 (a) già
approvate. Si divide in due parti:

- **R6a, profilo Tavolo:** una scheda di sola lettura sullo schermo HDMI.
- **R6b, profilo Online:** il popup al proprietario del PG, con Usa e Ignora.
  La risposta arriva al GM, che conferma.

**Il piano:**

1. **Canale.** Un broadcast nuovo, `…/reaction-prompt`. Lo manda il popup
   del GM (`createReactionPrompt`) quando compare o cambia
   (`show`) e quando si chiude (`clear`). Così valgono da soli le due
   console e il pannello. Parte solo con l'opzione accesa (Tavolo) o nel
   profilo Online. Contiene **solo le righe dei PG**: le reazioni dei mostri
   non lasciano mai il client del GM (D1). Il nome dell'attaccante compare
   solo se il suo token è visibile; altrimenti «una creatura».
2. **Host dei giocatori.** `reactionPromptHost.js`, montato in
   `background.js` accanto all'host dei dadi, solo sui client non GM. Apre
   un popover piccolo, `reaction-notice.html`, con il vetro viola del popup
   e un id suo: non tocca l'avviso di turno. Si chiude con `clear`, o da
   solo dopo 60 secondi.
3. **Online.** Ogni riga porta i giocatori del PG (`assignedPlayer`, poi
   `createdUserId`, come `noticeReachesPlayer`). Il proprietario vede Usa
   e Ignora; la risposta torna al GM sullo stesso canale (`answer`).
4. **Il GM.** La risposta segna la riga nel suo popup: «Mira: Usa» con il
   pulsante Usa evidenziato e il fuoco, così Invio conferma. «Mira: ignora»
   resta solo un'indicazione. Niente parte da solo (D9): scrive sempre e solo
   il client del GM.

**Rischio:** medio-basso. Nessun PF, nessun metadata, niente sul turno: solo
broadcast e un popover nuovo sui client dei giocatori. Il rischio è
d'interfaccia: un popover in più sullo schermo del tavolo, che va provato
anche ruotato.

| # | Domanda | Raccomandazione |
| --- | --- | --- |
| **H1** | Dove compare sullo schermo dei giocatori? | **Un popover piccolo suo, in basso al centro**, separato dall'avviso di turno: l'avviso di turno ha già una coda e un ciclo di vita fragili. |
| **H2** | Che cosa ci arriva? | **Le reazioni dei PG, sia «prima» sia «dopo»** (Scudo, Intimorire infernale), con chi, che cosa e perché. Mai quelle dei mostri. |
| **H3** | Online: chi vede la riga? | **Solo il proprietario del PG**, con Usa e Ignora. Gli altri giocatori niente. |
| **H4** | Interruttori | **Tavolo:** «Mostra allo schermo dei giocatori» negli Avvisi di reazione, spento di base (D1). **Online:** acceso con l'interruttore generale, perché è il senso di D9. |
| **H5** | Che cosa fa l'Usa del giocatore dal GM? | **Evidenzia l'Usa della riga e gli dà il fuoco:** Invio o un clic conferma. L'Ignora del giocatore è solo un'indicazione: Registra o Lancia vale comunque come Ignora. |

### 6.15 R6, fatto l'8 novembre (schermo dei giocatori e online)

Secondo il piano della §6.14, con H1–H5 come raccomandate:

- **Nucleo** (`src/reactionNoticeCore.js`, puro):
  - il messaggio `show` porta solo le righe dei PG, con i loro giocatori
    (`assignedPlayer`, poi `createdUserId`), e mai una reazione di un
    mostro;
  - il nome di un attaccante col token nascosto diventa «una creatura»;
  - `clear` e `answer` vengono controllati prima di essere letti;
  - le righe di uno schermo: al Tavolo tutte, di sola lettura; Online solo
    quelle del giocatore, con i pulsanti.
- **Mittente** (`src/reactionNoticeBroadcast.js`): il popup del GM
  (`createReactionPrompt`) lo carica alla prima riga mostrata. Manda:
  - al Tavolo solo con la nuova opzione «Mostra allo schermo dei giocatori»
    (`screen`, spenta di base);
  - Online sempre, leggendo il profilo della stanza.

  Lo stesso contenuto parte una volta sola. Quando il popup si chiude (Ignora,
  Registra, Lancia, console chiusa) parte `clear`.
- **Host** (`src/reactionNoticeHost.js`), montato in `background.js`
  accanto ai dadi, solo sui client non GM. Apre il popover
  `reaction-notice.html` in basso al centro, con un id suo, e lo chiude con
  `clear` o dopo 60 secondi.
- **Risposta.** L'Usa del giocatore scrive «Anna: Usa» sulla riga del GM,
  evidenzia il suo Usa e gli dà il fuoco. «Anna: ignora» è solo
  un'indicazione. Scrive soltanto il GM.
- **Test:** `test/reactionNotice.test.js` (4 test: messaggio, schermi,
  mittente, risposte nel popup del GM). Suite completa 5908, build e
  controllo degli incantesimi verdi in una copia pulita.
- **Banco** (un solo client simulato: l'host del giocatore montato con il
  ruolo PLAYER). Il Goblin attacca Mira, che ha Scudo:
  - Tavolo con l'opzione accesa: la scheda di sola lettura compare. Ignora o
    Registra del GM la chiudono. Provato in vista espansa e compatta.
  - Online, con Mira del giocatore: la scheda ha Usa e Ignora. Usa manda
    «Inviato al GM», e nel popup del GM la riga dice «…: Usa», con l'Usa
    acceso e a fuoco.
  - Un giocatore che non ha il PG non vede niente.
- **Da provare in stanza:**
  - la posizione del popover sullo schermo vero, anche ruotato: al banco
    l'ancora in basso non si vede tutta;
  - due client veri, il GM e il giocatore.

### 6.16 R5, piano (movimento; J1–J5 approvate l'8 novembre)

**Che cosa c'è già.** Sul client del GM, `history.js` trasforma ogni
spostamento di un token in un **segmento** (posizione di partenza e di
arrivo). I segmenti non contano i teletrasporti, gli Annulla e gli
spostamenti scritti dal plugin (`suppressMovementHistory`). Lo Speed Tracker
li ascolta da `initiativeList.js` (`subscribeMovementSegments`). Con lo
strumento Movimento i segmenti sono uno per casella. Le azioni dei mostri
hanno la portata (`reachFeet`). Il catalogo ha già le tre voci di R5:
Attacco di opportunità, Alone di Spore e Schermagliatore.

**Il piano:**

1. **Osservatore** (`reactionMoveWatcher.js`, nuovo). Si iscrive ai
   segmenti con **una riga** in `initiativeList.js`, accanto allo Speed
   Tracker e solo per il GM. Raccoglie i segmenti di uno spostamento e,
   quando il token si ferma, decide:
   - chi aveva il token entro la sua portata prima e non più dopo (uscita);
   - chi ce l'ha ora e prima no (entrata, Alone di Spore).

   Non scrive niente: legge e apre un popup.
2. **Portata** (`opportunityAttackCore.js`, puro): 1,5 m, oppure la
   `reachFeet` più lunga tra le azioni in mischia della scheda. Misura
   in 3D dalla griglia della scena, come le altre distanze.
3. **Candidati.** Gli eventi `move-leave` e `move-enter` passano dal
   motore di sempre (`reactionCandidates`): creatura ostile, reazione
   libera, creatura in grado di agire, opzioni e silenziate.
4. **Popup.** Un popover del GM a parte (D6), `reaction-move.html`, con
   lo stesso `createReactionPrompt`, quindi anche verso i giocatori (R6).
   - **Usa** sull'Attacco di opportunità apre la console attacchi fuori
     turno della creatura che reagisce, con chi si è mosso come bersaglio:
     è il flusso di R3c, e Registra spende la reazione.
   - **Alone di Spore:** un avviso con la sua regola.
5. **Interruttore:** «Movimento» delle Opzioni, già lì, spento di base (D3).

**Rischio:** medio. Si tocca `initiativeList.js` (una riga) e si ascolta il
movimento. L'osservatore però non scrive niente e non cambia lo Speed
Tracker: un errore al suo interno resta chiuso lì.

| # | Domanda | Raccomandazione |
| --- | --- | --- |
| **J1** | Quali spostamenti guardare? | **Solo quelli della creatura di turno, nel suo turno.** Gli spostamenti fuori turno sono quasi sempre forzati (spinte) o sistemazioni del GM, e non provocano. Teletrasporti e Annulla sono già esclusi. |
| **J2** | Come decidere l'uscita? | **Dall'inizio e dalla fine dello spostamento** (fermo il token, un solo popup). Con lo strumento Movimento si guarda anche ogni casella: uscire e rientrare nello stesso trascinamento provoca. |
| **J3** | Disimpegno | **Il plugin non lo sa** (niente bookkeeping del turno): il popup dice «se non si è disimpegnata». Esclusa da sola la pill «Movimento: no AdO» (Colpo dello Zefiro). |
| **J4** | Schermagliatore (fine turno vicino) | **Fuori per ora:** serve un aggancio al cambio di turno in `initiativeList.js`, il punto più fragile. Resta nel catalogo. |
| **J5** | Dove compare il popup | **Un popover del GM in basso a destra**, che si chiude a fine turno o con Ignora. Per i PG arriva anche ai giocatori, con R6. |

### 6.17 R5, fatto l'8 novembre (movimento)

Secondo il piano della §6.16, con J1–J5 come raccomandate:

- **Nucleo** (`src/opportunityAttackCore.js`, puro):
  - la portata: 1,5 m, oppure la `reachFeet` più lunga tra le azioni in
    mischia;
  - l'uscita: dentro a un punto del percorso e fuori a uno successivo;
  - l'entrata entro 3 m;
  - la pill del Colpo dello Zefiro, che esclude da sola l'uscita;
  - la creatura di turno e la chiave del turno.

  La distanza si conta in caselle, come la mischia
  (`reactionDistanceFunction` con `squares`).
- **Osservatore** (`src/reactionMoveWatcher.js`). Due righe in
  `initiativeList.js` (un import e `subscribeMovementSegments` accanto allo
  Speed Tracker, solo GM). Raccoglie i segmenti di uno spostamento, salta
  Annulla e teletrasporti, e 0,7 secondi dopo l'ultimo segmento decide. Guarda
  solo la creatura di turno e solo con «Movimento» acceso. Non scrive niente.
- **Popover** `reaction-move.html`, in basso a destra. Usa lo stesso popup
  delle console, quindi le righe dei PG arrivano anche ai giocatori (R6).
  - Usa sull'Attacco di opportunità seleziona chi si è mosso e apre la
    console attacchi «Fuori turno» di chi reagisce.
  - Alone di Spore usa la sua capacità.
  - Il popover si chiude con Ignora, dopo Usa o al cambio di turno.
- **Catalogo.** L'Attacco di opportunità dice «se non si è disimpegnata»
  (J3), e il popup mostra il lotto R5. Lo Schermagliatore resta fuori (J4).
- **Test:** `test/opportunityAttack.test.js`, 8 test: portata, uscita,
  percorso per caselle, entrata, Zefiro, turno, motore, lotto. Suite
  completa 5916, build e controllo degli incantesimi verdi in una copia
  pulita, dopo le due correzioni del banco.
- **Banco** (vista espansa e compatta). È il turno di Mira, che va accanto al
  goblin e poi si allontana:
  - compare «Mira esce dalla portata · (1) Goblin · Attacco di
    opportunità»;
  - Usa apre la console del goblin «Fuori turno», con Mira selezionata;
  - Dars, che non è di turno, non provoca niente;
  - il cambio di turno e Ignora chiudono il popover.

  Il banco ha trovato due difetti, corretti:
  - il lotto R5 mancava tra quelli che il popup mostra;
  - la pagina leggeva le opzioni prima che fossero caricate.
- **Da sapere:** un neutrale non reagisce (regola di R0). Il goblin del banco
  andava segnato «nemico».

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
